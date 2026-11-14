"""Reproduce the user-requested fixed-parameter scale and polarization audit."""

import json
from pathlib import Path
from typing import Any

import numpy as np
from scipy.stats import pearsonr, spearmanr

from .models import RESERVOIRS, observation_times
from .numeric_export import prepare
from .numerics import decode_db, power_to_db, quantize_db, water_area_km2
from .relative import (
    analysis_masks,
    linear_multilook,
    native_grid,
    reference_median_db,
    relative_area,
)
from .release import _physical_checks, correlation_summary, publication_grade
from .review import effect_size
from .sources import write_json
from .validation import correlations


def diagnose(root: Path) -> dict[str, Any]:
    assets = root / "pipeline/assets"
    names = json.loads((assets / "granules_seed.json").read_text())
    source_grid = json.loads((root / "data/cache/hdf-gate.json").read_text())
    geometries = json.loads((assets / "reservoirs.geojson").read_text())
    features = {str(f["properties"]["osm_id"]): f for f in geometries["features"]}
    historical = json.loads((assets / "numeric-validation.json").read_text())
    original = historical["reservoirs"]["baoshan2"]["records"]
    calibration = historical["calibration"]
    prepared = prepare(root, names, ["baoshan2"], calibration)["baoshan2"]
    strict_swap = [
        {
            **record,
            "area_km2": {
                "primary": water_area_km2(
                    prepared["rasters"][record["utc"][:10]]["HH"],
                    prepared["mask"],
                    calibration["reservoirs"]["baoshan2"]["thresholds"]["HV"],
                    prepared["grid"]["pixel_area_m2"],
                )
            },
        }
        for record in original
    ]
    report: dict[str, Any] = {
        "schema_version": 1,
        "policy": {
            "ratio": 0.6,
            "analysis_buffer_m": 0,
            "final_channel": "HH",
            "scales_m": [170, 100, 50, 30, 10],
            "reference": (
                "Complete native-grid cells outside projected bbox within cached AOI "
                "(approximately 600 m padding)."
            ),
            "selection_limit": (
                "Scale exploration is descriptive and not independent validation. "
                "No official-data selection of channel, buffer or relative threshold."
            ),
        },
        "step1_channel_swap": {
            "strict_same_numeric_threshold": {
                "threshold_db": calibration["reservoirs"]["baoshan2"]["thresholds"]["HV"],
                "all": correlations(strict_swap),
                "heldout": correlations([r for r in strict_swap if r["partition"] == "validation"]),
            },
            "select_existing_HH_configuration": {
                "threshold_db": calibration["reservoirs"]["baoshan2"]["thresholds"]["HH"],
                "all": correlations(original, "hh"),
                "heldout": correlations(
                    [r for r in original if r["partition"] == "validation"], "hh"
                ),
            },
        },
        "step2_170m_gate": {},
        "step3_bbox_scale_ladder": [],
        "osm_scale_comparison": [],
        "exposed_bed_hypothesis": [],
    }
    for reservoir in RESERVOIRS[:4]:
        key = reservoir["key"]
        feature = features[reservoir["osm"].split("/")[1]]
        official = json.loads((root / "web/public/data/official" / f"{key}.json").read_text())
        gauges = {r["nisar_utc_date"]: r for r in official["records"]}
        comparison_scenes = {}
        for spacing in (170, 100, 50, 30, 10):
            rows = {pol: [] for pol in ("HH", "HV")}
            osm_records = []
            for name in names:
                utc, _ = observation_times(name)
                date = utc[:10]
                path = root / "data/cache" / f"{key}_{date.replace('-', '')}.npz"
                with np.load(path, allow_pickle=False) as cache:
                    grid = native_grid(cache, source_grid, spacing)
                    mask, bbox, ring = analysis_masks(reservoir, feature, grid)
                    powers = {pol: linear_multilook(cache, grid, pol) for pol in ("HH", "HV")}
                medians = {pol: reference_median_db(value, ring) for pol, value in powers.items()}
                gauge = gauges.get(date, {"level_m": None, "pct": None})
                for pol in ("HH", "HV"):
                    threshold = 0.6 * 10 ** (medians[pol] / 10)
                    count = int(np.count_nonzero((powers[pol] < threshold) & (bbox == 1)))
                    rows[pol].append(
                        {
                            "utc_date": date,
                            "dark_pixels": count,
                            "threshold_power": threshold,
                            "land_median_db": medians[pol],
                            "official": gauge,
                            "bbox_pixels": int(bbox.sum()),
                            "reference_pixels": int(
                                np.count_nonzero(ring & np.isfinite(powers[pol]))
                            ),
                        }
                    )
                if spacing in (10, 30, 170):
                    frame = quantize_db(power_to_db(powers["HH"]))
                    area, low, high = relative_area(frame, mask, medians["HH"], spacing**2)
                    osm_records.append(
                        {
                            "utc": utc,
                            "area_km2": {"primary": area, "primary_lo": low, "primary_hi": high},
                            "official": gauge,
                        }
                    )
                if (
                    spacing == 30
                    and key in {"baoshan2", "liyutan"}
                    and date in {"2025-11-05", "2026-03-17"}
                ):
                    db = {
                        pol: decode_db(quantize_db(power_to_db(value)))
                        for pol, value in powers.items()
                    }
                    comparison_scenes[date] = {
                        "db": db,
                        "medians": medians,
                        "ring": ring,
                        "water": (db["HH"] < medians["HH"] + 10 * np.log10(0.6)) & (mask == 1),
                    }
            for pol, records in rows.items():
                paired = [r for r in records if r["official"]["level_m"] is not None]
                x, y = (
                    [r["dark_pixels"] for r in paired],
                    [r["official"]["level_m"] for r in paired],
                )
                result = {
                    "reservoir": key,
                    "spacing_m": spacing,
                    "polarization": pol,
                    "n": len(paired),
                    "pearson_r": float(pearsonr(x, y).statistic),
                    "spearman_rho": float(spearmanr(x, y).statistic),
                    "records": records,
                }
                report["step3_bbox_scale_ladder"].append(result)
                if spacing == 170 and pol == "HH" and key in {"baoshan2", "liyutan"}:
                    report["step2_170m_gate"][key] = {
                        k: v for k, v in result.items() if k != "records"
                    }
            if osm_records:
                stats = correlation_summary(
                    [r["area_km2"]["primary"] for r in osm_records],
                    [r["official"]["level_m"] for r in osm_records],
                )
                physical = _physical_checks(osm_records, reservoir["osm_area_km2"])
                effect = effect_size(osm_records)
                grade, reason = publication_grade(stats, physical["passed"], effect["passes"])
                report["osm_scale_comparison"].append(
                    {
                        "reservoir": key,
                        "spacing_m": spacing,
                        "statistics": stats,
                        "physical_checks": physical,
                        "effect_size": effect,
                        "grade": grade,
                        "reason": reason,
                    }
                )
        if comparison_scenes:
            report["exposed_bed_hypothesis"].append(_hypothesis(key, comparison_scenes))
    report["step2_passed"] = all(v["pearson_r"] > 0.85 for v in report["step2_170m_gate"].values())
    write_json(assets / "relative-diagnostics.json", report)
    write_json(root / "web/public/data/diagnostics.json", report)
    return report


def _hypothesis(key: str, scenes: dict[str, Any]) -> dict[str, Any]:
    before, after = scenes["2025-11-05"], scenes["2026-03-17"]
    groups = {
        "candidate_newly_exposed": before["water"] & ~after["water"],
        "stable_HH_water": before["water"] & after["water"],
        "exterior_reference_ring": after["ring"],
    }
    output = {
        "reservoir": key,
        "selection": (
            "November HH-relative water but March HH nonwater within exact OSM polygon at 30 m."
        ),
        "interpretation": (
            "Consistent with channel contrast differences; cannot prove exposed dry bed "
            "or HV misclassification. HH defines groups (selection bias), and no "
            "independent land/water truth is available."
        ),
        "groups": {},
    }
    for name, selected in groups.items():
        group: dict[str, Any] = {"pixels": int(selected.sum()), "dates": {}}
        for date, scene in scenes.items():
            measurements = {}
            for pol in ("HH", "HV"):
                samples = scene["db"][pol][selected & np.isfinite(scene["db"][pol])]
                measurements[pol] = {
                    "n": int(samples.size),
                    "median_db": float(np.median(samples)),
                    "p25_db": float(np.quantile(samples, 0.25)),
                    "p75_db": float(np.quantile(samples, 0.75)),
                    "median_relative_to_ring_db": float(np.median(samples) - scene["medians"][pol]),
                    "fraction_below_channel_relative_threshold": float(
                        np.mean(samples < scene["medians"][pol] + 10 * np.log10(0.6))
                    ),
                }
            group["dates"][date] = measurements
        group["march_minus_november_median_db"] = {
            pol: group["dates"]["2026-03-17"][pol]["median_db"]
            - group["dates"]["2025-11-05"][pol]["median_db"]
            for pol in ("HH", "HV")
        }
        output["groups"][name] = group
    return output


if __name__ == "__main__":
    result = diagnose(Path(__file__).resolve().parents[3])
    print(
        json.dumps(
            {"step2_passed": result["step2_passed"], "step2": result["step2_170m_gate"]}, indent=2
        )
    )
