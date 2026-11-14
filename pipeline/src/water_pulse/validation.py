"""Calibration/validation separation: never refit a rule on its held-out dates."""

import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
from scipy.stats import pearsonr, spearmanr

from .models import COLLECTION, data_url, observation_times
from .numeric_export import direction_gate, prepare
from .numerics import water_area_km2
from .sources import write_json

CALIBRATION_DATES = ["2025-11-05", "2026-01-16", "2026-03-17", "2026-06-21"]


def freeze_calibration(root: Path, names: list[str]) -> dict[str, Any]:
    selected = [name for name in names if observation_times(name)[0][:10] in CALIBRATION_DATES]
    configuration = {
        "schema_version": 1,
        "calibration_utc_dates": CALIBRATION_DATES,
        "validation_utc_dates": [
            observation_times(name)[0][:10]
            for name in names
            if observation_times(name)[0][:10] not in CALIBRATION_DATES
        ],
        "policy": "Frozen on four calibration dates; no fitting on held-out observations.",
        "required_heldout_spearman": 0.8,
        "reservoirs": {
            "baoshan2": {
                "classification_channel": "HV",
                "analysis_buffer_m": 0,
                "thresholds": {"HH": -14.0, "HV": -15.858759842519685},
            },
            "liyutan": {
                "classification_channel": "HH",
                "analysis_buffer_m": 150,
                "thresholds": {"HH": -14.0, "HV": -14.911417322834646},
            },
        },
    }
    path = root / "pipeline/assets/numeric-calibration.json"
    if path.exists():
        existing = json.loads(path.read_text())
        if existing != configuration:
            raise ValueError(
                "Calibration is already frozen; review a versioned change before refitting."
            )
        return existing
    # Reproduce values from the designated four dates; refuse unexplained constants.
    from .processing import pooled_threshold

    for key, settings in configuration["reservoirs"].items():
        provisional = prepare(root, selected, [key], configuration)[key]
        for polarization in ("HH", "HV"):
            observed = pooled_threshold(
                [row[polarization] for row in provisional["rasters"].values()], provisional["mask"]
            )
            if not np.isclose(observed, settings["thresholds"][polarization], atol=1e-10):
                raise ValueError(f"Frozen calibration does not reproduce for {key}/{polarization}.")
    write_json(path, configuration)
    return configuration


def correlations(records: list[dict[str, Any]], channel: str = "primary") -> dict[str, Any]:
    paired = [row for row in records if row["official"]["level_m"] is not None]
    areas = [row["area_km2"][channel] for row in paired]
    levels = [row["official"]["level_m"] for row in paired]
    usable = len(paired) >= 3 and np.ptp(areas) > 0 and np.ptp(levels) > 0
    return {
        "n": len(paired),
        "spearman_area_vs_level": float(spearmanr(areas, levels).statistic) if usable else None,
        "pearson_area_vs_level": float(pearsonr(areas, levels).statistic) if usable else None,
    }


def gate_evidence(root: Path, names: list[str]) -> dict[str, Any]:
    selected = [name for name in names if observation_times(name)[0][:10] in CALIBRATION_DATES]
    baseline = prepare(root, selected, ["baoshan2"])
    gates = direction_gate(baseline)
    hdf_path = root / "data/cache/hdf-gate.json"
    hdf = json.loads(hdf_path.read_text()) if hdf_path.exists() else {}
    metrics_path = root / "data/cache/read-metrics.json"
    metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else []
    datasets = hdf.get("datasets", {})
    structure = {}
    for layer in (
        "HHHH",
        "HVHV",
        "mask",
        "numberOfLooks",
        "projection",
        "xCoordinates",
        "yCoordinates",
    ):
        if layer not in datasets:
            continue
        dataset = datasets[layer]
        attributes = dataset.get("attrs", {})
        structure[layer] = {
            "shape": dataset["shape"],
            "dtype": dataset["dtype"],
            "attributes": {
                key: attributes[key]
                for key in ("_FillValue", "description", "units", "epsg_code")
                if key in attributes
            },
        }
    sha = subprocess.run(
        ["/usr/bin/git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=False
    ).stdout.strip()
    dirty = bool(
        subprocess.run(
            ["/usr/bin/git", "status", "--porcelain"],
            cwd=root,
            capture_output=True,
            text=True,
            check=False,
        ).stdout.strip()
    )
    evidence = {
        "schema_version": 1,
        "code_version": sha,
        "code_dirty": dirty,
        "scientific_status": "failed held-out validation; browse publication retained",
        "ga": {
            "passed": hdf.get("status") == "passed"
            and hdf.get("elapsed_seconds", 999) > 0
            and hdf.get("elapsed_seconds", 999) < 180,
            "granule": next(name for name in names if "_20260317" in name),
            "elapsed_seconds": hdf.get("elapsed_seconds"),
            "range_bytes": hdf.get("cache_bytes"),
            "range_blocks": hdf.get("cache_miss_count"),
            "reservoirs": ["baoshan2", "liyutan", "shimen", "feitsui"],
        },
        "gb": {
            "passed": hdf.get("status") == "passed",
            "epsg": hdf.get("epsg"),
            "coordinates": hdf.get("coordinates"),
            "datasets": structure,
            "mask_policy": "0 invalid/partially focused;255 outside;1–254 valid subswath",
        },
        **gates,
        "validation_artifact": "pipeline/assets/numeric-validation.json",
        "calibration_artifact": "pipeline/assets/numeric-calibration.json",
        "read_metrics": metrics,
        "diagnostic_warning": (
            "Threshold-derived areas in this report are experiments, not validated water areas."
        ),
    }
    write_json(root / "pipeline/assets/numeric-gates.json", evidence)
    return evidence


def evaluate(
    root: Path, names: list[str], calibration: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    prepared = prepare(root, names, list(calibration["reservoirs"]), calibration)
    sha = subprocess.run(
        ["/usr/bin/git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=False
    ).stdout.strip()
    dirty = bool(
        subprocess.run(
            ["/usr/bin/git", "status", "--porcelain"],
            cwd=root,
            capture_output=True,
            text=True,
            check=False,
        ).stdout.strip()
    )
    result = {
        "calibration": calibration,
        "reservoirs": {},
        "passed": False,
        "code_version": sha,
        "code_dirty": dirty,
        "publication_status": "diagnostic_only; no validated water-area assets published",
        "processing": {
            "source_collection": COLLECTION,
            "crid": "P05023",
            "source_values": "calibrated gamma-0 linear power",
            "filter": "normalized 3x3 arithmetic mean in linear power, invalid centres retained",
            "reprojection": "fixed EPSG:3857 grid; bilinear power; nearest validity",
            "invalid_source_mask_values": [0, 255],
            "quantization": {"invalid": 0, "min_db": -35, "max_db": 5, "levels": 254},
            "sensitivity_db": 1.5,
            "threshold_policy": "four calibration dates only; frozen before17held-out dates",
        },
    }
    metrics_path = root / "data/cache/read-metrics.json"
    metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else []
    by_granule = {row["granule"]: row for row in metrics}
    result["inputs"] = []
    for name in names:
        utc, local = observation_times(name)
        details = by_granule.get(name, {})
        cached_path = root / "data/cache" / f"baoshan2_{utc[:10].replace('-', '')}.npz"
        retrieved = details.get("accessed_at")
        time_basis = "request_started_at"
        if not retrieved and cached_path.exists():
            retrieved = datetime.fromtimestamp(cached_path.stat().st_mtime, UTC).isoformat()
            time_basis = "authenticated_AOI_cache_written_at"
        result["inputs"].append(
            {
                "granule": name,
                "source_url": data_url(name),
                "crid": "P05023",
                "utc": utc,
                "local": local,
                "retrieved_at": retrieved,
                "retrieval_time_basis": time_basis,
            }
        )
    for key, item in prepared.items():
        official = json.loads((root / "web/public/data/official" / f"{key}.json").read_text())
        by_date = {row["local_date"]: row for row in official["records"]}
        records = []
        channel = item["classification_channel"]
        for name in names:
            utc, local = observation_times(name)
            raster = item["rasters"][utc[:10]]
            area = {}
            for polarization in ("HH", "HV"):
                threshold = item["thresholds"][polarization]
                for suffix, offset in (("", 0), ("_lo", -1.5), ("_hi", 1.5)):
                    area[polarization.lower() + suffix] = water_area_km2(
                        raster[polarization],
                        item["mask"],
                        threshold + offset,
                        item["grid"]["pixel_area_m2"],
                    )
            for suffix in ("", "_lo", "_hi"):
                area["primary" + suffix] = area[channel.lower() + suffix]
            gauge = by_date.get(local[:10])
            selected = item["mask"] == 1
            valid = (raster[channel] > 0) & selected
            fraction = float(np.count_nonzero(valid) / np.count_nonzero(selected))
            records.append(
                {
                    "utc": utc,
                    "local": local,
                    "granule": name,
                    "area_km2": area,
                    "classification_channel": channel,
                    "partition": "calibration" if utc[:10] in CALIBRATION_DATES else "validation",
                    "valid_fraction": fraction,
                    "qa": ["valid_fraction_below_0.98"] if fraction < 0.98 else [],
                    "official": {
                        "local": local[:10] + "T07:00:00+08:00",
                        "pct": gauge["pct"] if gauge else None,
                        "level_m": gauge["level_m"] if gauge else None,
                    },
                }
            )
        heldout = correlations([row for row in records if row["partition"] == "validation"])
        all_dates = correlations(records)
        passed = (
            heldout["n"] == 17
            and heldout["spearman_area_vs_level"] is not None
            and (heldout["spearman_area_vs_level"] >= calibration["required_heldout_spearman"])
        )
        result["reservoirs"][key] = {
            "classification_channel": channel,
            "thresholds": item["thresholds"],
            "analysis_buffer_m": item["grid"]["analysis_buffer_ground_m"],
            "heldout": heldout,
            "all_dates": all_dates,
            "hh_all_dates": correlations(records, "hh"),
            "passed": bool(passed),
            "records": records,
        }
    result["passed"] = all(item["passed"] for item in result["reservoirs"].values())
    return result, prepared
