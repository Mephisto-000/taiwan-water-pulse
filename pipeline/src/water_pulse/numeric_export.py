"""Reproducible calibrated raster assets, measurement records, and scientific gates."""

import json
from pathlib import Path
from typing import Any

import numpy as np

from .models import RESERVOIRS, observation_times
from .numerics import decode_db, water_area_km2
from .processing import create_grid, pooled_threshold, process_window


def prepare(
    root: Path, names: list[str], keys: list[str], calibration: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Process only locally cached, authenticated windows; never access the network."""
    geometries = json.loads((root / "pipeline/assets/reservoirs.geojson").read_text())
    features = {str(feature["properties"]["osm_id"]): feature for feature in geometries["features"]}
    prepared = {}
    for reservoir in RESERVOIRS:
        key = reservoir["key"]
        if key not in keys:
            continue
        settings = calibration["reservoirs"][key] if calibration else None
        grid, mask = create_grid(
            reservoir,
            features[reservoir["osm"].split("/")[1]],
            date_count=21,
            analysis_buffer_ground_m=settings["analysis_buffer_m"] if settings else 150,
        )
        rasters = {}
        for name in names:
            utc, _ = observation_times(name)
            path = root / "data/cache" / f"{key}_{utc[:10].replace('-', '')}.npz"
            if not path.exists():
                raise ValueError(f"Missing calibrated window for {key} {utc[:10]}; run read first.")
            with np.load(path, allow_pickle=False) as cached:
                rasters[utc[:10]] = process_window(cached, grid)
        thresholds = (
            settings["thresholds"]
            if settings
            else {
                polarization: pooled_threshold(
                    [row[polarization] for row in rasters.values()], mask
                )
                for polarization in ("HH", "HV")
            }
        )
        prepared[key] = {
            "reservoir": reservoir,
            "grid": grid,
            "mask": mask,
            "rasters": rasters,
            "thresholds": thresholds,
            "classification_channel": settings["classification_channel"] if settings else "HH",
        }
    return prepared


def direction_gate(prepared: dict[str, Any]) -> dict[str, Any]:
    """G-C/G-D evidence; a threshold cannot be chosen separately for each date."""
    item = prepared["baoshan2"]
    mask, threshold = item["mask"], item["thresholds"]["HH"]
    area = {
        date: water_area_km2(values["HH"], mask, threshold, item["grid"]["pixel_area_m2"])
        for date, values in item["rasters"].items()
    }
    needed = ["2025-11-05", "2026-01-16", "2026-03-17", "2026-06-21"]
    if any(date not in area for date in needed):
        raise ValueError("G-D requires the four specified full/dry/recovery observations.")
    samples = np.concatenate(
        [decode_db(values["HH"][mask == 1]) for values in item["rasters"].values()]
    )
    samples = samples[np.isfinite(samples)]
    low, high = samples[samples < threshold], samples[samples >= threshold]
    separation = float(np.median(high) - np.median(low)) if low.size and high.size else 0.0
    counts, edges = np.histogram(samples, bins=40, range=(-35, 5))
    separation_check = bool(low.size > 100 and high.size > 100 and separation > 3)
    d_passed = (
        area[needed[0]] > area[needed[1]] > area[needed[2]] and area[needed[3]] > area[needed[2]]
    )
    return {
        "gc": {
            "passed": False,
            "status": "spatial_and_histogram_review_required",
            "threshold_group_separation_check": separation_check,
            "threshold_db": threshold,
            "low_group_pixels": int(low.size),
            "high_group_pixels": int(high.size),
            "low_median_db": float(np.median(low)) if low.size else None,
            "high_median_db": float(np.median(high)) if high.size else None,
            "median_separation_db": separation,
            "histogram_edges_db": edges.tolist(),
            "histogram_counts": counts.tolist(),
            "interpretation": (
                "Threshold-separated backscatter groups; not independent water truth."
            ),
        },
        "gd": {
            "passed": bool(d_passed),
            "threshold_db": threshold,
            "area_km2": {date: area[date] for date in needed},
        },
    }
