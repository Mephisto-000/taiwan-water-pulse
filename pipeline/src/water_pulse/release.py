"""Image-only calibration and per-reservoir publication for the reviewed release.

SI-assisted code; source measurements are not SI generated. Historical frozen
experiments are retained unchanged. No official observations enter thresholding.
"""

import csv
import hashlib
import json
import math
import shutil
import struct
import subprocess
import warnings
import zlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from pyproj import Transformer
from scipy.ndimage import distance_transform_edt
from scipy.stats import pearsonr, spearmanr

from .export import export
from .models import RESERVOIRS, data_url, observation_times
from .numerics import decode_db
from .processing import create_grid, process_window
from .relative import (
    ANALYSIS_SPACING,
    SENSITIVITY_RATIOS,
    THRESHOLD_RATIO,
    display_mapping,
    outline_on_native,
    prepare_analysis,
    relative_area,
)
from .sources import png_info, write_json

METHOD = "relative_power_v3"
REPETITIONS = 2000
SEED = 20261114


def shoreline_contrast(
    raster: np.ndarray, inside: np.ndarray, ring: np.ndarray
) -> tuple[float | None, dict[str, int]]:
    """Independent spatial groups; a contrast measure, not water-label accuracy."""
    if raster.shape != inside.shape or raster.shape != ring.shape:
        raise ValueError("Contrast raster and masks must align.")
    if np.any((inside > 0) & (ring > 0)):
        raise ValueError("Inside and reference ring must not overlap.")
    values = decode_db(raster)
    a = values[(inside > 0) & np.isfinite(values)]
    b = values[(ring > 0) & np.isfinite(values)]
    counts = {"inside": int(a.size), "ring": int(b.size)}
    if a.size < 2 or b.size < 2:
        return None, counts
    denominator = float(np.sqrt((np.var(a) + np.var(b)) / 2))
    return (float((np.median(b) - np.median(a)) / denominator) if denominator else None), counts


def image_threshold(samples: np.ndarray) -> float:
    """Unclipped Otsu using calibrated image values, never gauge labels."""
    values = np.asarray(samples, dtype=float)
    values = values[np.isfinite(values)]
    if values.size < 2 or np.ptp(values) == 0:
        raise ValueError("Otsu requires at least two distinct valid samples.")
    counts, edges = np.histogram(values, bins=256)
    cumulative = np.cumsum(counts)
    moments = np.cumsum(counts * (edges[:-1] + edges[1:]) / 2)
    remaining = cumulative[-1] - cumulative
    variance = np.zeros(256)
    valid = (cumulative > 0) & (remaining > 0)
    variance[valid] = (moments[-1] * cumulative[valid] - moments[valid] * cumulative[-1]) ** 2 / (
        cumulative[valid] * remaining[valid]
    )
    best = np.flatnonzero(variance == variance.max())
    return float((edges[best[0] + 1] + edges[best[-1] + 1]) / 2)


def correlation_summary(
    areas: list[float], levels: list[float | None], *, repetitions: int = REPETITIONS
) -> dict[str, Any]:
    """Paired descriptive correlation and seeded percentile bootstrap intervals."""
    if len(areas) != len(levels) or repetitions < 1:
        raise ValueError("Correlation pairs must align and repetitions must be positive.")
    paired = [(a, b) for a, b in zip(areas, levels, strict=True) if b is not None]
    if any(not math.isfinite(a) or not math.isfinite(b) for a, b in paired):
        raise ValueError("Observed pairs must be finite; missing levels must be null.")
    result: dict[str, Any] = {
        "n": len(paired),
        "pearson_area_vs_level": None,
        "spearman_area_vs_level": None,
        "pearson_ci95": None,
        "spearman_ci95": None,
        "bootstrap_repetitions": repetitions,
        "bootstrap_valid_replicates": 0,
        "bootstrap_seed": SEED,
        "leave_one_out_pearson_range": None,
    }
    if len(paired) < 3:
        return result
    values = np.asarray(paired)
    if np.ptp(values[:, 0]) == 0 or np.ptp(values[:, 1]) == 0:
        return result
    result["pearson_area_vs_level"] = float(pearsonr(values[:, 0], values[:, 1]).statistic)
    result["spearman_area_vs_level"] = float(spearmanr(values[:, 0], values[:, 1]).statistic)
    indices = np.random.default_rng(SEED).integers(0, len(values), (repetitions, len(values)))
    sampled = values[indices]
    usable = (np.ptp(sampled[:, :, 0], axis=1) > 0) & (np.ptp(sampled[:, :, 1], axis=1) > 0)
    sampled = sampled[usable]
    result["bootstrap_valid_replicates"] = len(sampled)
    if len(sampled):
        pearson = pearsonr(sampled[:, :, 0], sampled[:, :, 1], axis=1).statistic
        spearman = np.asarray([spearmanr(pair[:, 0], pair[:, 1]).statistic for pair in sampled])
        result["pearson_ci95"] = np.quantile(pearson, [0.025, 0.975]).tolist()
        result["spearman_ci95"] = np.quantile(spearman, [0.025, 0.975]).tolist()
    leave_one_out = []
    for i in range(len(values)):
        subset = np.delete(values, i, axis=0)
        if len(subset) >= 3 and np.ptp(subset[:, 0]) > 0 and np.ptp(subset[:, 1]) > 0:
            leave_one_out.append(float(pearsonr(subset[:, 0], subset[:, 1]).statistic))
    if leave_one_out:
        result["leave_one_out_pearson_range"] = [min(leave_one_out), max(leave_one_out)]
    return result


def publication_grade(stats: dict[str, Any], physical_passed: bool) -> tuple[str, str]:
    """Apply review thresholds with explicit handling of uncertain/undefined r."""
    r = stats["pearson_area_vs_level"]
    if not physical_passed:
        return "C", "physical_check_failed"
    if r is None:
        return "C", "insufficient_nonconstant_pairs"
    if r >= 0.8 and stats["pearson_ci95"] and stats["pearson_ci95"][0] >= 0.6:
        return "A", "review_correlation_criteria_met"
    if r >= 0.5:
        return "B", "experimental_or_confidence_limited"
    return "C", "weak_area_level_association"


def grayscale_png(path: Path, pixels: np.ndarray) -> None:
    """Encode uint8 display pixels losslessly using only the standard library."""
    if pixels.ndim != 2 or pixels.dtype != np.uint8:
        raise ValueError("PNG pixels must be a two-dimensional uint8 array.")
    height, width = pixels.shape

    def chunk(kind: bytes, body: bytes) -> bytes:
        return (
            struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
        )

    rows = b"".join(b"\0" + row.tobytes() for row in pixels)
    content = b"\x89PNG\r\n\x1a\n"
    content += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
    content += chunk(b"IDAT", zlib.compress(rows, level=9)) + chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def outline_pixels(feature: dict[str, Any], grid: dict[str, Any]) -> list[list[list[float]]]:
    geometry = feature["geometry"]
    polygons = (
        [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    )
    transform = Transformer.from_crs(4326, 3857, always_xy=True)
    spacing = grid["pixel_side_mercator_m"]
    return [
        [
            [
                round((x - grid["bounds"][0]) / spacing, 3),
                round((grid["bounds"][3] - y) / spacing, 3),
            ]
            for x, y in (transform.transform(lon, lat) for lon, lat in ring)
        ]
        for polygon in polygons
        for ring in polygon
    ]


def overview_box(grid: dict[str, Any], hdf: dict[str, Any]) -> dict[str, Any]:
    """Location context derived from real source-grid coordinates, not a fitted landmark."""
    c = hdf["coordinates"]
    source_width, source_height = 2016, 1982
    width = hdf["datasets"]["xCoordinates"]["shape"][0]
    height = hdf["datasets"]["yCoordinates"]["shape"][0]
    dx = (c["x_last"] - c["x_first"]) / (width - 1)
    dy = (c["y_last"] - c["y_first"]) / (height - 1)
    transformer = Transformer.from_crs(3857, hdf["epsg"], always_xy=True)
    left, bottom, right, top = grid["bounds"]
    xx, yy = transformer.transform([left, left, right, right], [bottom, top, bottom, top])
    scale = width / source_width
    cols = [(x - (c["x_first"] - dx / 2)) / dx / scale for x in xx]
    rows = [(y - (c["y_first"] - dy / 2)) / dy / scale for y in yy]
    return {
        "source_width": source_width,
        "source_height": source_height,
        "crop_pixels": [min(cols), min(rows), max(cols) - min(cols), max(rows) - min(rows)],
        "role": "approximate full-frame location context only; not quantitative georeferencing",
        "grid_basis": "actual GCOV coordinate centres and 17x browse reduction",
    }


def _summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    return correlation_summary(
        [r["area_km2"]["primary"] for r in records], [r["official"]["level_m"] for r in records]
    )


def _physical_checks(records: list[dict[str, Any]], osm_area: float) -> dict[str, Any]:
    observed = [r for r in records if r["official"]["pct"] is not None]
    low = min(observed, key=lambda r: r["official"]["pct"])
    full = max(observed, key=lambda r: r["official"]["pct"])
    full_records = [r for r in observed if r["official"]["pct"] >= 95]
    maximum = max((r["area_km2"]["primary"] for r in full_records), default=None)
    matched = []
    for before in observed:
        if before["utc"][:10] > "2026-03-17" or before["official"]["level_m"] is None:
            continue
        for after in observed:
            if after["utc"][:10] < "2026-06-21" or after["official"]["level_m"] is None:
                continue
            difference = abs(before["official"]["level_m"] - after["official"]["level_m"])
            if difference <= 0.5:
                matched.append(
                    {
                        "before_utc": before["utc"],
                        "after_utc": after["utc"],
                        "level_difference_m": difference,
                        "area_difference_km2": after["area_km2"]["primary"]
                        - before["area_km2"]["primary"],
                    }
                )
    bound = maximum is None or maximum <= 1.1 * osm_area
    direction = low["area_km2"]["primary"] < full["area_km2"]["primary"]
    return {
        "passed": bound and direction,
        "osm_area_km2": osm_area,
        "full_storage_max_area_km2": maximum,
        "full_storage_within_1_1_osm": bound,
        "lowest_observed_utc": low["utc"],
        "full_reference_utc": full["utc"],
        "lowest_area_smaller_than_full": direction,
        "matched_level_tolerance_m": 0.5,
        "matched_level_pairs": matched,
    }


def _csv(path: Path, records: list[dict[str, Any]], publish: bool) -> None:
    fields = [
        "utc",
        "local",
        "area_km2",
        "area_low_km2",
        "area_high_km2",
        "threshold_db",
        "threshold_ratio",
        "sensitivity_ratio_low",
        "sensitivity_ratio_high",
        "land_median_db",
        "analysis_grid_m",
        "qa",
        "official_pct",
        "official_level_m",
    ]
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for record in records:
            writer.writerow(
                {
                    "utc": record["utc"],
                    "local": record["local"],
                    "area_km2": record["area_km2"]["primary"] if publish else "",
                    "area_low_km2": record["area_km2"]["primary_lo"] if publish else "",
                    "area_high_km2": record["area_km2"]["primary_hi"] if publish else "",
                    "threshold_db": record["threshold_db"] if publish else "",
                    "threshold_ratio": THRESHOLD_RATIO if publish else "",
                    "sensitivity_ratio_low": SENSITIVITY_RATIOS[0] if publish else "",
                    "sensitivity_ratio_high": SENSITIVITY_RATIOS[1] if publish else "",
                    "land_median_db": record["land_median_db"] if publish else "",
                    "analysis_grid_m": ANALYSIS_SPACING,
                    "qa": ";".join(record["qa"]),
                    "official_pct": record["official"]["pct"],
                    "official_level_m": record["official"]["level_m"],
                }
            )


def release(root: Path, names: list[str], keys: list[str]) -> dict[str, Any]:
    """Export actual cached GCOV arrays with review grades, independent of old gates."""
    # Capture source state BEFORE writing outputs: final data can cite the clean code commit.
    sha = subprocess.run(
        ["/usr/bin/git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True
    ).stdout.strip()
    dirty = bool(
        subprocess.run(
            ["/usr/bin/git", "status", "--porcelain"],
            cwd=root,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    )
    assets, output = root / "pipeline/assets", root / "web/public/data"
    expected = [
        root / "data/cache" / f"{key}_{observation_times(name)[0][:10].replace('-', '')}.npz"
        for key in keys
        for name in names
    ]
    missing = [p for p in expected if not p.exists()]
    if missing:
        raise ValueError(
            f"Release requires complete calibrated caches; missing {len(missing)} windows."
        )
    checks = json.loads((assets / "source-checks.json").read_text())
    previous = assets / "review-validation.json"
    if previous.exists() and json.loads(previous.read_text()).get("method") == "pooled_otsu_v2":
        shutil.copyfile(previous, assets / "otsu-review-validation.json")
    index = export(root, names, keys, generated_at=checks["retrieved_at"])
    provenance = json.loads((output / "provenance.json").read_text())
    geometries = json.loads((assets / "reservoirs.geojson").read_text())
    features = {str(f["properties"]["osm_id"]): f for f in geometries["features"]}
    hdf = json.loads((root / "data/cache/hdf-gate.json").read_text())
    report: dict[str, Any] = {
        "schema_version": 2,
        "method": METHOD,
        "code_version": sha,
        "code_dirty": dirty,
        "method_description": (
            "Fixed HH, 30 m native linear-power multilooking, exact unbuffered OSM mask, "
            "per-date threshold 0.6 times exterior reference median power. "
            "No official-data threshold/polarization/buffer fitting."
        ),
        "analysis_policy": {
            "spacing_m": ANALYSIS_SPACING,
            "ratio": THRESHOLD_RATIO,
            "sensitivity_ratios": SENSITIVITY_RATIOS,
            "analysis_buffer_m": 0,
            "land_reference": (
                "Complete coarse cells in actual cached AOI outside projected geographic "
                "reservoir bbox; cache extends approximately 600 m around bbox. "
                "Not a ground-truth land mask or the review screenshot's 5.1 km reference."
            ),
            "scale_selection": (
                "Exploratory five-scale comparison, not independent held-out validation. "
                "30 m is the finest listed scale meeting grade A for both core reservoirs. "
                "10 m also has r > 0.85 for both but Baoshan II interval lower bound is < 0.6."
            ),
        },
        "evaluation": (
            "Descriptive associations, not independent predictive validation. "
            "Paired bootstrap assumes exchangeable dates; temporal dependence "
            "may narrow intervals optimistically."
        ),
        "previous_experiment": "historical-validation.json",
        "intermediate_otsu_experiment": "otsu-review-validation.json",
        "reservoirs": {},
    }
    asset_si_usage = {k: v for k, v in index["si_usage"].items() if k != "declaration_data_path"}
    numeric_assets = []
    for reservoir in RESERVOIRS:
        key = reservoir["key"]
        if key not in keys:
            continue
        feature = features[reservoir["osm"].split("/")[1]]
        grid, mask = create_grid(
            reservoir, feature, date_count=len(names), analysis_buffer_ground_m=0
        )
        distance = distance_transform_edt(mask == 0, sampling=grid["ground_spacing_m"])
        ring = (distance >= 150) & (distance <= 300)
        rasters = {}
        analysis_by_date = {}
        inputs = []
        for name in names:
            utc, _ = observation_times(name)
            path = root / "data/cache" / f"{key}_{utc[:10].replace('-', '')}.npz"
            with np.load(path, allow_pickle=False) as cached:
                if "granule" in cached and str(cached["granule"].item()) != name:
                    raise ValueError(f"Cache identity mismatch for {key} {utc[:10]}.")
                identity_basis = (
                    "cached_granule_identity"
                    if "granule" in cached
                    else "legacy_cached_UTC_filename_and_source_manifest"
                )
                rasters[utc[:10]] = process_window(cached, grid)
                analysis_by_date[utc[:10]] = prepare_analysis(cached, reservoir, feature, hdf)
            inputs.append(
                {
                    "utc": utc,
                    "granule": name,
                    "identity_basis": identity_basis,
                    "source_url": data_url(name),
                    "retrieved_at": datetime.fromtimestamp(path.stat().st_mtime, UTC).isoformat(),
                    "retrieval_time_basis": "cached_AOI_written_at",
                    "cached_aoi_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                }
            )
        first_analysis = next(iter(analysis_by_date.values()))
        analysis_grid = first_analysis["grid"]
        analysis_mask = first_analysis["mask"]
        for item in analysis_by_date.values():
            if item["grid"] != analysis_grid or not np.array_equal(item["mask"], analysis_mask):
                raise ValueError("Analysis grid/mask must be identical across dates.")
        thresholds = {
            pol: first_analysis["land_median_db"][pol] + 10 * math.log10(THRESHOLD_RATIO)
            for pol in ("HH", "HV")
        }
        official = json.loads((output / "official" / f"{key}.json").read_text())
        by_date = {row["local_date"]: row for row in official["records"]}
        records = []
        for name in names:
            utc, local = observation_times(name)
            row = rasters[utc[:10]]
            analysis = analysis_by_date[utc[:10]]
            area = {}
            for pol in ("HH", "HV"):
                measured = relative_area(
                    analysis["frames"][pol],
                    analysis_mask,
                    analysis["land_median_db"][pol],
                    analysis_grid["pixel_area_m2"],
                )
                for suffix, value in zip(("", "_lo", "_hi"), measured, strict=True):
                    area[pol.lower() + suffix] = value
            area.update({"primary" + suffix: area["hh" + suffix] for suffix in ("", "_lo", "_hi")})
            fraction = float(
                np.count_nonzero((analysis["frames"]["HH"] > 0) & (analysis_mask == 1))
                / np.count_nonzero(analysis_mask)
            )
            gauge = by_date.get(local[:10], {})
            qa = ["valid_fraction_below_0.98"] if fraction < 0.98 else []
            contrast = {pol: shoreline_contrast(row[pol], mask, ring) for pol in ("HH", "HV")}
            records.append(
                {
                    "utc": utc,
                    "local": local,
                    "granule": name,
                    "area_km2": area,
                    "classification_channel": "HH",
                    "threshold_db": analysis["land_median_db"]["HH"]
                    + 10 * math.log10(THRESHOLD_RATIO),
                    "land_median_db": analysis["land_median_db"]["HH"],
                    "threshold_ratio": THRESHOLD_RATIO,
                    "reference_pixel_count": analysis["reference_pixels"]["HH"],
                    "valid_fraction": fraction,
                    "qa": qa,
                    "separation": {pol: result[0] for pol, result in contrast.items()},
                    "separation_samples": {pol: result[1] for pol, result in contrast.items()},
                    "official": {
                        "local": local[:10] + "T07:00:00+08:00",
                        "pct": gauge.get("pct"),
                        "level_m": gauge.get("level_m"),
                    },
                }
            )
        stats = _summary(records)
        physical = _physical_checks(records, reservoir["osm_area_km2"])
        grade, reason = publication_grade(stats, physical["passed"])
        if grade == "B" and stats["pearson_ci95"] and stats["pearson_ci95"][0] <= 0:
            reason = "LOW_CONFIDENCE"
        stats.update(
            {
                "classification_channel": "HH",
                "grade": grade,
                "publish_area": grade != "C",
                "reason": reason,
                "method": METHOD,
                "pearson_area_hh_vs_level": stats["pearson_area_vs_level"],
                "spearman_area_hh_vs_level": stats["spearman_area_vs_level"],
                "below_95": _summary(
                    [
                        r
                        for r in records
                        if r["official"]["pct"] is not None and r["official"]["pct"] < 95
                    ]
                ),
                "physical_checks": physical,
            }
        )
        folder = output / "reservoirs" / key
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "mask.bin").write_bytes(mask.tobytes())
        for date, channels in rasters.items():
            for pol, raster in channels.items():
                (folder / f"{date.replace('-', '')}_{pol}.bin").write_bytes(raster.tobytes())
        analysis_folder = folder / "analysis"
        analysis_folder.mkdir(parents=True, exist_ok=True)
        (analysis_folder / "mask.bin").write_bytes(analysis_mask.tobytes())
        for date, item in analysis_by_date.items():
            (analysis_folder / f"{date.replace('-', '')}_HH.bin").write_bytes(
                item["frames"]["HH"].tobytes()
            )
        mapping, residual = display_mapping(analysis_grid, grid)
        meta = {
            "schema_version": 2,
            "si_usage": asset_si_usage,
            "grid": {**grid, "pixel_side_m": grid["ground_spacing_m"]},
            "pixel_area_m2": grid["pixel_area_m2"],
            "classification_channel": "HH",
            "thresholds": thresholds,
            "thresholds_role": "First-date compatibility values; use per-date analysis thresholds",
            "analysis": {
                "grid": analysis_grid,
                "pixel_area_m2": analysis_grid["pixel_area_m2"],
                "threshold_ratio": THRESHOLD_RATIO,
                "sensitivity_ratios": SENSITIVITY_RATIOS,
                "land_median_db_by_date": {
                    date: item["land_median_db"]["HH"] for date, item in analysis_by_date.items()
                },
                "mask": "analysis/mask.bin",
                "outline_pixel_rings": outline_on_native(feature, analysis_grid),
                "display_transform": mapping,
                "display_mapping_max_corner_residual_pixels": residual,
                "reference_policy": report["analysis_policy"]["land_reference"],
            },
            "validation": stats,
            "outline_pixel_rings": outline_pixels(feature, grid),
            "overview": overview_box(grid, hdf),
            "processing": {
                "source": "calibrated GCOV gamma-0 linear power",
                "si_generated": False,
                "filter": "3x3 normalized linear-power mean; invalid centres preserved",
                "reprojection": "fixed EPSG:3857; bilinear power, nearest validity",
                "quantization": {"invalid": 0, "min_db": -35, "max_db": 5, "levels": 254},
                "analysis": (
                    "Separate native UTM 30 m linear-area-average grid; "
                    "HH relative reference ratio 0.6"
                ),
                "sensitivity_ratios": SENSITIVITY_RATIOS,
                "separation_definition": (
                    "(median dB in 150–300 ground-metre exterior ring minus median dB inside "
                    "OSM polygon) / sqrt((variance inside + variance ring) / 2). "
                    "Spatial contrast only; reference ring is not verified land truth and "
                    "polygon interior is not verified water truth."
                ),
                "effective_resolution": "grid spacing is not effective spatial resolution",
            },
        }
        write_json(folder / "meta.json", meta)
        write_json(
            folder / "timeseries.json",
            {"si_usage": asset_si_usage, "records": records, "stats": stats},
        )
        _csv(folder / "timeseries.csv", records, grade != "C")
        report["reservoirs"][key] = {
            "thresholds": thresholds,
            "grid_spacing_m": grid["ground_spacing_m"],
            "analysis_spacing_m": ANALYSIS_SPACING,
            "threshold_ratio": THRESHOLD_RATIO,
            "land_median_db_by_date": meta["analysis"]["land_median_db_by_date"],
            "statistics": stats,
            "inputs": inputs,
        }
        for path in sorted(p for p in folder.rglob("*") if p.is_file()):
            numeric_assets.append(
                {
                    "path": path.relative_to(output).as_posix(),
                    "bytes": path.stat().st_size,
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "si_generated": False,
                }
            )
    # Preserve original source PNGs outside deployed public output for offline replay.
    for item in provenance["assets"]:
        path = output / item["path"]
        original = assets / item["path"]
        if not original.exists():
            if png_info(path)[:2] != (2016, 1982):
                raise ValueError("Original browse source missing; refuse to upscale a thumbnail.")
            original.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, original)
        expected_source = next(r for r in checks["browse"] if r["path"] == item["path"])
        if hashlib.sha256(original.read_bytes()).hexdigest() != expected_source["sha256"]:
            raise ValueError("Original browse source checksum differs from its recorded download.")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", rasterio.errors.NotGeoreferencedWarning)
            with rasterio.open(original) as source:
                pixels = source.read(
                    1, out_shape=(378, 384), resampling=rasterio.enums.Resampling.nearest
                )
        grayscale_png(path, pixels)
        width, height, digest = png_info(path)
        item.update(
            {
                "source_sha256": hashlib.sha256(original.read_bytes()).hexdigest(),
                "source_width": 2016,
                "source_height": 1982,
                "width": width,
                "height": height,
                "sha256": digest,
                "bytes": path.stat().st_size,
                "processing": (
                    "Nearest-neighbour 384px full-frame location overview; not calibrated data"
                ),
            }
        )
    index.update(
        {
            "mode": "mixed",
            "fallback_level": None,
            "image_reservoirs": keys,
            "numeric_reservoirs": [
                k for k, r in report["reservoirs"].items() if r["statistics"]["publish_area"]
            ],
            "code_version": sha,
            "code_dirty": dirty,
            "release_method": METHOD,
            "browse_description": (
                "Small full-frame context overviews; reservoir viewer uses calibrated GCOV grids."
            ),
            "numerical_status": (
                "Per-reservoir descriptive review grades; A/B show experimental "
                "area and sensitivity; C shows images only."
            ),
        }
    )
    provenance.update(
        {
            "mode": "mixed",
            "code_version": sha,
            "code_dirty": dirty,
            "numeric_assets": numeric_assets,
            "scientific_evidence": {
                "validation": "validation.json",
                "previous_experiment": "historical-validation.json",
                "methods": "methods.md",
                "publication_decision": (
                    "per-reservoir review grades; not an independent predictive validation"
                ),
            },
            "validation": {key: item["statistics"] for key, item in report["reservoirs"].items()},
            "geometry": {
                "source": "OpenStreetMap / Nominatim",
                "license": "ODbL",
                "attribution": "© OpenStreetMap contributors",
                "role": (
                    "Reference shoreline and unbuffered analysis mask; not surveyed "
                    "full-water shoreline"
                ),
            },
            "limitations": [
                (
                    "Provisional calibration and orbit; pixel spacing differs from "
                    "effective resolution."
                ),
                "Threshold sensitivity is not a statistical confidence interval.",
                (
                    "Surface area is not storage volume. Correlation is not causation "
                    "or independent predictive skill."
                ),
                (
                    "Paired bootstrap ignores temporal dependence; confidence "
                    "intervals may be optimistic."
                ),
                (
                    "Wind, rain, shadow, layover and smooth banks can confound "
                    "dark-water classification; no event cause is inferred."
                ),
            ],
        }
    )
    write_json(output / "index.json", index)
    write_json(output / "provenance.json", provenance)
    write_json(output / "validation.json", report)
    write_json(assets / "review-validation.json", report)
    shutil.copyfile(assets / "numeric-validation.json", output / "historical-validation.json")
    shutil.copyfile(assets / "otsu-review-validation.json", output / "otsu-review-validation.json")
    shutil.copyfile(assets / "relative-diagnostics.json", output / "diagnostics.json")
    shutil.copyfile(root / "docs/methods.md", output / "methods.md")
    return report
