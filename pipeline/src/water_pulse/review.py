"""Fixed scientific review rules; none select the published classifier parameters."""

import math
from datetime import datetime
from typing import Any

import numpy as np
from scipy.stats import pearsonr, spearmanr

FULL_STORAGE_PCT = 99.5
LAND_DEVIATION_DB = 2.0
FULL_AREA_MAD_MULTIPLIER = 3.0


def effect_size(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Compare all observed area variation with the mean parameter-sensitivity width."""
    if not records:
        raise ValueError("Effect size requires observations.")
    areas = np.asarray([r["area_km2"]["primary"] for r in records], dtype=float)
    widths = np.asarray(
        [r["area_km2"]["primary_hi"] - r["area_km2"]["primary_lo"] for r in records],
        dtype=float,
    )
    if not np.all(np.isfinite(areas)) or not np.all(np.isfinite(widths)):
        raise ValueError("Areas and sensitivity widths must be finite.")
    if np.any(areas < 0) or np.any(widths < 0):
        raise ValueError("Areas and sensitivity widths cannot be negative.")
    levels = [r["official"]["level_m"] for r in records if r["official"]["level_m"] is not None]
    if any(not math.isfinite(level) for level in levels):
        raise ValueError("Observed levels must be finite.")
    span, width = float(np.ptp(areas)), float(np.mean(widths))
    return {
        "n": len(records),
        "area_range_km2": span,
        "mean_sensitivity_width_km2": width,
        "range_to_sensitivity_ratio": span / width if width > 0 else None,
        "minimum_ratio": 2.0,
        "passes": span > 0 and span >= 2 * width,
        "level_range_m": max(levels) - min(levels) if levels else None,
    }


def full_storage_repeatability(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Descriptive population SD of available full-pool observations, not instrument error."""
    areas = np.asarray(
        [
            r["area_km2"]["primary"]
            for r in records
            if r["official"]["pct"] is not None and r["official"]["pct"] >= FULL_STORAGE_PCT
        ],
        dtype=float,
    )
    if not np.all(np.isfinite(areas)) or np.any(areas < 0):
        raise ValueError("Full-pool areas must be finite and nonnegative.")
    return {
        "n": int(areas.size),
        "threshold_pct": FULL_STORAGE_PCT,
        "mean_km2": float(np.mean(areas)) if areas.size else None,
        "std_km2": float(np.std(areas, ddof=0)) if areas.size >= 2 else None,
        "range_km2": float(np.ptp(areas)) if areas.size >= 2 else None,
        "std_ddof": 0,
        "interpretation": "Observed full-pool repeatability; not isolated sensor error.",
    }


def channel_quality_flags(records: list[dict[str, Any]]) -> list[dict[str, list[str]]]:
    """Flag each channel independently, retaining all observations and raw measurements."""
    if not records:
        return []
    result = [{"HH": [], "HV": []} for _ in records]
    for channel in ("HH", "HV"):
        medians = np.asarray([r["land_median_db_by_channel"][channel] for r in records])
        if not np.all(np.isfinite(medians)):
            raise ValueError("Land-reference medians must be finite for each channel.")
        reference = float(np.median(medians))
        full = [
            r["area_km2"][channel.lower()]
            for r in records
            if r["official"]["pct"] is not None and r["official"]["pct"] >= FULL_STORAGE_PCT
        ]
        centre = float(np.median(full)) if full else None
        mad = float(np.median(np.abs(np.asarray(full) - centre))) if full else None
        for i, record in enumerate(records):
            fraction = record.get("valid_fraction_by_channel", {}).get(
                channel, record.get("valid_fraction", 1)
            )
            if not math.isfinite(fraction) or not 0 <= fraction <= 1:
                raise ValueError("Valid fractions must be finite and within [0, 1].")
            if fraction < 0.98:
                result[i][channel].append("valid_fraction_below_0.98")
            if abs(float(medians[i]) - reference) > LAND_DEVIATION_DB:
                result[i][channel].append("land_reference_deviation_over_2_db")
            pct = record["official"]["pct"]
            if (
                pct is not None
                and pct >= FULL_STORAGE_PCT
                and centre is not None
                and mad is not None
                and record["area_km2"][channel.lower()] < centre - FULL_AREA_MAD_MULTIPLIER * mad
            ):
                result[i][channel].append("full_storage_area_below_median_minus_3_mad")
    return result


def descriptive_correlations(areas: list[float], levels: list[float | None]) -> dict[str, Any]:
    """Compact fixed-definition sensitivity summary; bootstrap belongs to primary evaluation."""
    if len(areas) != len(levels):
        raise ValueError("Correlation inputs must align.")
    pairs = [(a, h) for a, h in zip(areas, levels, strict=True) if h is not None]
    if any(not math.isfinite(a) or not math.isfinite(h) for a, h in pairs):
        raise ValueError("Observed correlation pairs must be finite.")
    result: dict[str, Any] = {
        "n": len(pairs),
        "pearson_area_vs_level": None,
        "spearman_area_vs_level": None,
    }
    if len(pairs) < 3:
        return result
    values = np.asarray(pairs)
    if np.ptp(values[:, 0]) == 0 or np.ptp(values[:, 1]) == 0:
        return result
    result["pearson_area_vs_level"] = float(pearsonr(values[:, 0], values[:, 1]).statistic)
    result["spearman_area_vs_level"] = float(spearmanr(values[:, 0], values[:, 1]).statistic)
    return result


def trapezoidal_volume_change(areas_km2: list[float], levels_m: list[float]) -> float:
    """Signed storage loss in million m³; retain input time order and intermediate rises."""
    if len(areas_km2) != len(levels_m) or len(areas_km2) < 2:
        raise ValueError("Trapezoidal integration requires at least two aligned observations.")
    if any(not math.isfinite(x) for x in [*areas_km2, *levels_m]):
        raise ValueError("Integration inputs must be finite, without missing observations.")
    if any(x < 0 for x in areas_km2):
        raise ValueError("Surface area cannot be negative.")
    return math.fsum(
        (levels_m[i] - levels_m[i + 1]) * (areas_km2[i] + areas_km2[i + 1]) / 2
        for i in range(len(areas_km2) - 1)
    )


def volume_closure(
    records: list[dict[str, Any]], effect: dict[str, Any], source: dict[str, Any]
) -> dict[str, Any]:
    """First continuous observation block through its lowest level, never across the long gap."""
    result: dict[str, Any] = {
        "eligible": False,
        "available": False,
        "reason": "insufficient_observations",
        "start_utc": None,
        "end_utc": None,
        "n": 0,
        "level_span_m": None,
        "radar_million_m3": None,
        "radar_low_million_m3": None,
        "radar_high_million_m3": None,
        "official_million_m3": None,
        "ratio": None,
        "source": source.get("source"),
        "retrieved_at": source.get("retrieved_at"),
        "volume_fields": source.get("volume_fields"),
        "maximum_observation_gap_days": 36,
        "notes": [
            "Uses official water levels; this is not an independent validation.",
            "The range varies the classification ratio from 0.5 to 0.7.",
            "Surface area is linearly interpolated between successive observations.",
            "A gap greater than 36 days ends the evaluated observation block.",
            "Report only; closure is not a publication-grade criterion.",
        ],
    }
    if len(records) < 2:
        return result
    stamps = [datetime.fromisoformat(r["utc"]) for r in records]
    if any(a >= b for a, b in zip(stamps[:-1], stamps[1:], strict=True)):
        raise ValueError("Closure observations must be strictly chronological.")
    block = [records[0]]
    for i, record in enumerate(records[1:], start=1):
        if (stamps[i] - stamps[i - 1]).total_seconds() > 36 * 86400:
            break
        block.append(record)
    if any(r["official"]["level_m"] is None for r in block):
        result["reason"] = "missing_official_levels"
        return result
    end = min(range(len(block)), key=lambda i: block[i]["official"]["level_m"])
    block = block[: end + 1]
    if len(block) < 2:
        result["reason"] = "no_observed_drawdown"
        return result
    levels = [r["official"]["level_m"] for r in block]
    span = max(levels) - min(levels)
    result.update(
        start_utc=block[0]["utc"], end_utc=block[-1]["utc"], n=len(block), level_span_m=span
    )
    if span < 10 or not effect["passes"]:
        result["reason"] = "insufficient_level_change_or_effect_size"
        return result
    result["eligible"] = True
    values = {
        field: trapezoidal_volume_change([r["area_km2"][field] for r in block], levels)
        for field in ("primary", "primary_lo", "primary_hi")
    }
    result.update(
        radar_million_m3=values["primary"],
        radar_low_million_m3=values["primary_lo"],
        radar_high_million_m3=values["primary_hi"],
    )
    # Bounds preserve signed integration; they are parameter definitions, not a CI.
    first = block[0]["official"].get("storage_volume_m3")
    last = block[-1]["official"].get("storage_volume_m3")
    if first is None or last is None:
        result["reason"] = "official_volume_unavailable"
        return result
    if not math.isfinite(first) or not math.isfinite(last) or first < 0 or last < 0:
        raise ValueError("Official storage volumes must be finite and nonnegative.")
    official = (first - last) / 1_000_000
    if official <= 0:
        result["reason"] = "nonpositive_official_storage_loss"
        return result
    result.update(
        available=True,
        reason="reported_not_independent_validation",
        official_million_m3=official,
        ratio=values["primary"] / official,
    )
    return result
