"""Parse official source records with explicit null preservation."""

import csv
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any

from .models import RESERVOIRS


def load_seed(path: Path) -> dict[str, list[dict[str, Any]]]:
    with path.open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    result: dict[str, list[dict[str, Any]]] = {}
    for reservoir in RESERVOIRS:
        key = reservoir["key"]
        records = []
        for row in rows:
            pct, level = row[f"{key}_pct"], row[f"{key}_level_m"]
            if bool(pct) != bool(level):
                raise ValueError(f"Incomplete seed pair for {key} on {row['local_date_0700']}")
            records.append(
                {
                    "local_date": row["local_date_0700"],
                    "nisar_utc_date": row["nisar_utc_date"] or None,
                    "pct": float(pct) if pct else None,
                    "level_m": float(level) if level else None,
                }
            )
        result[key] = records
    return result


def parse_live(
    cache: dict[str, Any], key: str, acquisition_dates: dict[str, str]
) -> list[dict[str, Any]]:
    station = next(item["station"] for item in RESERVOIRS if item["key"] == key)
    records: dict[str, dict[str, Any]] = {}
    for request in cache["requests"].values():
        for row in request["records"]:
            if str(row.get("ST_NO")) != station:
                continue
            local_date = str(row["DATE"])[:10].replace("/", "-")
            level, rate = row.get("WaterLine"), row.get("CapacityRate")
            missing = level is None or rate is None
            records[local_date] = {
                "local_date": local_date,
                "nisar_utc_date": acquisition_dates.get(local_date),
                "pct": None if missing else float(rate) * 100,
                "level_m": None if missing else float(level),
            }
    return [records[local_date] for local_date in sorted(records)]


def compare_seed(cache: dict[str, Any], seed_path: Path) -> dict[str, Any]:
    """Compare source values at the brief's published decimal precision."""
    mismatches: list[dict[str, Any]] = []
    checked = 0
    for key, seeds in load_seed(seed_path).items():
        live = {row["local_date"]: row for row in parse_live(cache, key, {})}
        for row in seeds:
            actual = live.get(row["local_date"])
            for field, precision in (("pct", "0.1"), ("level_m", "0.01")):
                checked += 1
                value = None
                if actual and actual[field] is not None:
                    value = float(
                        Decimal(str(actual[field])).quantize(
                            Decimal(precision), rounding=ROUND_HALF_UP
                        )
                    )
                if value != row[field]:
                    mismatches.append(
                        {
                            "reservoir": key,
                            "local_date": row["local_date"],
                            "field": field,
                            "seed": row[field],
                            "live_rounded": value,
                        }
                    )
    return {
        "checked_fields": checked,
        "mismatches": mismatches,
        "policy": "Use actual live source; preserve seed and discrepancies for audit.",
    }
