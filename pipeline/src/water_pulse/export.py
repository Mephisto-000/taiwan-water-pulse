"""SI-assisted export code; scope and source-data exclusions: /si-usage.json."""

import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

from .models import COLLECTION, RESERVOIRS, WRA_URL, browse_url, data_url, observation_times
from .official import VOLUME_FIELDS, load_seed, parse_live
from .sources import png_info, write_json


def export(
    root: Path, names: list[str], reservoir_keys: list[str], *, generated_at: str
) -> dict[str, Any]:
    declaration = json.loads((root / "si-usage.json").read_text())
    si_usage = {
        "tool": declaration["tool"],
        "declaration_version": declaration["declaration_version"],
        "declaration_data_path": "si-usage.json",
        "code_status": declaration["code"]["status"],
        **declaration["data"],
    }
    assets = root / "pipeline" / "assets"
    output = root / "web" / "public" / "data"
    source_path = assets / "source-checks.json"
    source_checks = json.loads(source_path.read_text()) if source_path.exists() else {}
    date_records = []
    asset_records = []
    available_sources = {row["path"]: row for row in source_checks.get("browse", [])}
    for name in names:
        utc, local = observation_times(name)
        utc_date = utc[:10]
        compact = utc_date.replace("-", "")
        paths = {
            polarization: f"browse/{compact}_{polarization}.png" for polarization in ("HH", "HV")
        }
        available = {}
        for polarization, relative in paths.items():
            path = output / relative
            available[polarization] = path.exists()
            if not path.exists():
                continue
            width, height, digest = png_info(path)
            original = available_sources.get(relative, {})
            asset_records.append(
                {
                    "path": relative,
                    "source_url": browse_url(name, polarization),
                    "granule": name,
                    "utc": utc,
                    "local": local,
                    "crid": "P05023",
                    "accessed_at": source_checks.get("retrieved_at"),
                    "bytes": path.stat().st_size,
                    "sha256": digest,
                    "width": width,
                    "height": height,
                    "processing": "ASF browse PNG copied byte-for-byte; no quantitative processing",
                    "si_generated": False,
                    "http_status": original.get("http_status"),
                }
            )
        date_records.append(
            {
                "utc_date": utc_date,
                "utc": utc,
                "local": local,
                "granule": name,
                "browse": paths,
                "available": available,
                "data_url": data_url(name),
            }
        )
    seeds = load_seed(assets / "wra_seed.csv")
    live_path = assets / "wra_cache.json"
    cache = json.loads(live_path.read_text()) if live_path.exists() else None
    if cache and not cache.get("complete", False):
        cache = None
    if cache:
        generated_at = max(generated_at, cache["retrieved_at"])
    acquisition_dates = {record["local"][:10]: record["utc_date"] for record in date_records}
    kinds = set()
    for key in reservoir_keys:
        records = parse_live(cache, key, acquisition_dates) if cache else seeds[key]
        kind = "live" if cache else "seed"
        if not records:
            raise ValueError(f"No official records for {key}; validate the WRA response schema.")
        kinds.add(kind)
        write_json(
            output / "official" / f"{key}.json",
            {
                "source": WRA_URL,
                "source_kind": kind,
                "retrieved_at": cache["retrieved_at"] if cache else "2026-11-14",
                "retrieved_at_precision": "timestamp" if cache else "date",
                "volume_fields": VOLUME_FIELDS,
                "si_usage": si_usage,
                "records": records,
            },
        )
    # Metadata is stable for the same cached inputs; do not use the export clock.
    index = {
        "schema_version": 1,
        "mode": "browse",
        "fallback_level": 2,
        "collection": COLLECTION,
        "generated_at": generated_at,
        "si_usage": si_usage,
        "reservoirs": [item for item in RESERVOIRS if item["key"] in reservoir_keys],
        "dates": date_records,
        "gap": {"start": "2026-03-18", "end": "2026-06-20"},
        "official_source": WRA_URL,
        "official_source_kind": next(iter(kinds)),
        "seed_retrieved_at": "2026-11-14",
        "source_verified_at": source_checks.get("retrieved_at"),
        "browse_description": (
            "Full-frame ASF browse images; not calibrated raster values or map overlays."
        ),
        "numerical_status": (
            "Authenticated GCOV AOI access passed; frozen threshold experiments failed "
            "independent held-out validation. Quantitative publication is blocked."
        ),
    }
    write_json(output / "index.json", index)
    try:
        sha = subprocess.run(
            ["/usr/bin/git", "rev-parse", "HEAD"],
            cwd=root,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except subprocess.CalledProcessError:
        sha = ""
    dirty = bool(
        subprocess.run(
            ["/usr/bin/git", "status", "--porcelain"],
            cwd=root,
            capture_output=True,
            text=True,
            check=False,
        ).stdout.strip()
    )
    provenance = {
        "schema_version": 1,
        "mode": "browse",
        "code_version": sha,
        "code_dirty": dirty,
        "si_usage": si_usage,
        "scientific_evidence": {
            "access_and_structure": "pipeline/assets/numeric-gates.json",
            "frozen_calibration": "pipeline/assets/numeric-calibration.json",
            "heldout_validation": "pipeline/assets/numeric-validation.json",
            "repository_url": "https://github.com/Mephisto-000/taiwan-water-pulse/tree/main/pipeline/assets",
            "publication_decision": "browse_only; held-out Spearman below 0.8 for both experiments",
        },
        "collection": COLLECTION,
        "generated_at": generated_at,
        "assets": asset_records,
        "official": {
            "source": WRA_URL,
            "source_kind": next(iter(kinds)),
            "seed_path": "pipeline/assets/wra_seed.csv",
            "seed_retrieved_at": "2026-11-14",
            "seed_sha256": hashlib.sha256((assets / "wra_seed.csv").read_bytes()).hexdigest(),
            "cache_path": "pipeline/assets/wra_cache.json" if cache else None,
            "cache_sha256": hashlib.sha256(live_path.read_bytes()).hexdigest() if cache else None,
            "retrieved_at": cache["retrieved_at"] if cache else "2026-11-14",
            "seed_validation": cache.get("seed_validation") if cache else None,
            "station_ids": {item["key"]: item["station"] for item in RESERVOIRS},
        },
        "geometry": {
            "source": "OpenStreetMap / Nominatim",
            "license": "ODbL",
            "attribution": "© OpenStreetMap contributors",
            "role": "Reservoir context only; no georegistered preview overlay",
        },
        "limitations": [
            "Browse PNGs are visualization assets, not calibrated gamma-0 values.",
            "No water area, threshold classification, or correlation is published.",
            "Official seed values are sampled observations; absent values remain null.",
        ],
    }
    write_json(output / "provenance.json", provenance)
    write_json(output / "si-usage.json", declaration)
    return index
