"""Fixed ADV-10 estimates, with separate descriptive DEF-12 evaluations.

This module reads published area, grade and official observations. It never changes
classification, filters QA-marked observations, selects parameters, or claims an
independent validation. The full-pool band uses the entire archive by definition.
"""

import math
from bisect import bisect_right
from datetime import date, datetime
from statistics import fmean, stdev
from typing import Any

FULL_POOL_PCT = 99.5
SIGMA_MULTIPLIER = 2
MIN_FULL_POOL_DATES = 3
REFERENCE_ADVICE_SHA256 = "a43fec5a1b6083693d51973dccc6c8b32ce75a2a32304d20e805f37e442ec50f"

DEFINITIONS: dict[str, Any] = {
    "DEF-06": {
        "full_pool_pct_min": FULL_POOL_PCT,
        "minimum_full_pool_dates": MIN_FULL_POOL_DATES,
        "std_ddof": 1,
        "lower_boundary": "mean(all full-pool areas) - 2 * sample SD",
        "quality_flags": "Retained; no flag-based exclusion or parameter selection.",
    },
    "DEF-07": {
        "drawdown": "All UTC acquisitions before index.gap.start, fixed before evaluation.",
        "first_detection": "First drawdown acquisition with area strictly below the boundary.",
        "sigma_multipliers": [2, 3],
        "display_dates": "Taiwan-local dates; UTC timestamps retained.",
    },
    "DEF-11": {
        "high_rule": "area >= mean - 2 * sample SD; no numerical storage estimate",
        "high_lower_pct": "Minimum actual storage among all observations classified high.",
        "calibration": (
            "Last in-band drawdown observation plus all out-of-band drawdown observations "
            "with official storage. Points are sorted by area, not by storage."
        ),
        "numeric_rule": (
            "Piecewise linear interpolation. Below the minimum area, extrapolate the lowest "
            "two area points. Clamp storage to [0,100], preserve raw values and flags."
        ),
        "duplicate_calibration_areas": "Reject ambiguous calibration; do not average or fit away.",
        "range": (
            "Estimate +/- reservoir-specific maximum DEF-12 low-water leave-one-out absolute "
            "error, clipped to [0,100]. Descriptive error envelope, not a confidence interval "
            "or future guarantee. The area threshold-sensitivity bars are a separate quantity."
        ),
        "grade_gate": "Only published grade A is eligible; B and C have no estimates.",
    },
    "DEF-12": {
        "high": (
            "Report count and minimum actual storage. Compare predicted high/numeric with "
            "actual storage >= that descriptive minimum, reporting both confusion directions. "
            "The reference minimum comes from the high group itself: false-high count is "
            "therefore zero by construction for observed pairs, not independent accuracy."
        ),
        "numeric": (
            "Leave each out-of-band drawdown observation out of the interpolation calibration, "
            "keeping the fixed full-pool boundary and in-band anchor. Score the clamped "
            "estimate; report each absolute error, MAE and maximum absolute error separately "
            "from categorical results. Later out-of-band observations are not low-water folds."
        ),
        "units": "storage percentage points",
        "gate": (
            "Completeness and finite-result checks only. DEF-12 provides no numerical "
            "accuracy acceptance threshold. No threshold was invented or tuned."
        ),
        "limitations": [
            "Full-year official observations define the band and descriptive lower bound.",
            "Classifier choices used this archive; this remains exploratory calibration.",
            "Only one drawdown; adjacent leave-one-out observations are correlated.",
            "No second drawdown or independent future event has been evaluated.",
        ],
    },
    "DEF-05": {
        "calibration_mean": "For each numeric fold, mean storage of its remaining calibration.",
        "archive_mean": "Descriptive all-date mean; in-sample, not a forecast baseline.",
        "previous_official": (
            "Previous chronological acquisition's official storage only when Taiwan calendar "
            "dates are exactly 12 days apart. Missing previous readings and all longer gaps "
            "are excluded, with reasons retained. Report all eligible and numeric-fold cohorts."
        ),
    },
    "DEF-04-C1": {
        "counts": list(range(3, 13)),
        "method": "First N valid pairs, ordinary least squares with intercept; no clipping.",
        "evaluation": "All later valid pairs. Every N is reported, no best N is selected.",
    },
}


def _finite(value: Any) -> bool:
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


def _ordered(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result = sorted(records, key=lambda r: r["utc"])
    for record in result:
        utc = record["utc"]
        if utc in seen:
            raise ValueError("Duplicate observation timestamp.")
        seen.add(utc)
        for timestamp in (utc, record["local"]):
            if datetime.fromisoformat(timestamp).tzinfo is None:
                raise ValueError("Observation timestamp must include a timezone.")
        area, pct = record["area_km2"]["primary"], record["official"].get("pct")
        if not _finite(area) or area < 0:
            raise ValueError("Areas must be finite and nonnegative.")
        if pct is not None and (not _finite(pct) or not 0 <= pct <= 100):
            raise ValueError("Official storage must be finite, within [0,100], or null.")
    return result


def full_pool_range(records: list[dict[str, Any]]) -> dict[str, Any] | None:
    """DEF-06 uses all >=99.5% dates, including QA flags, and sample SD (ddof=1)."""
    full = [
        r
        for r in _ordered(records)
        if r["official"].get("pct") is not None and r["official"]["pct"] >= FULL_POOL_PCT
    ]
    if len(full) < MIN_FULL_POOL_DATES:
        return None
    areas = [r["area_km2"]["primary"] for r in full]
    mean, sd = fmean(areas), stdev(areas)
    return {
        "n": len(full),
        "mean_area_km2": mean,
        "sample_sd_area_km2": sd,
        "lower_2sigma_km2": mean - SIGMA_MULTIPLIER * sd,
        "lower_3sigma_km2": mean - 3 * sd,
        "utc_dates": [r["utc"] for r in full],
    }


def interpolate_storage(area: float, calibration: list[dict[str, Any]]) -> dict[str, Any]:
    """Interpolate by area without forcing monotonic storage or discarding reversals."""
    if not _finite(area) or area < 0:
        raise ValueError("Query area must be finite and nonnegative.")
    points = sorted(calibration, key=lambda p: p["area_km2"])
    if len(points) < 2:
        raise ValueError("Interpolation requires at least two distinct calibration areas.")
    for p in points:
        if not _finite(p["area_km2"]) or p["area_km2"] < 0 or not _finite(p["storage_pct"]):
            raise ValueError("Calibration values must be finite and areas nonnegative.")
    areas = [p["area_km2"] for p in points]
    if len(set(areas)) != len(areas):
        raise ValueError("Interpolation requires distinct calibration areas.")
    # The high branch normally prevents a query above the anchor. Keep this generic
    # function symmetric and mark either extrapolation direction explicitly.
    index = min(max(bisect_right(areas, area) - 1, 0), len(points) - 2)
    left, right = points[index], points[index + 1]
    raw = left["storage_pct"] + (area - left["area_km2"]) * (
        (right["storage_pct"] - left["storage_pct"]) / (right["area_km2"] - left["area_km2"])
    )
    estimate = max(0.0, min(100.0, raw))
    return {
        "estimate_pct": estimate,
        "raw_estimate_pct": raw,
        "extrapolated": area < areas[0] or area > areas[-1],
        "clamped": estimate != raw,
    }


def first_detection(
    drawdown: list[dict[str, Any]],
    boundary: float,
) -> dict[str, Any] | None:
    """Return the earliest strictly out-of-band drawdown acquisition (DEF-07)."""
    for r in _ordered(drawdown):
        if r["area_km2"]["primary"] < boundary:
            return {
                "utc": r["utc"],
                "local": r["local"],
                "storage_pct": r["official"].get("pct"),
                "area_km2": r["area_km2"]["primary"],
            }
    return None


def _metrics(errors: list[float]) -> dict[str, Any]:
    return {
        "n": len(errors),
        "mae_pp": fmean(abs(e) for e in errors) if errors else None,
        "max_abs_error_pp": max(abs(e) for e in errors) if errors else None,
        "rmse_pp": math.sqrt(fmean(e * e for e in errors)) if errors else None,
    }


def linear_comparisons(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Report every predeclared N=3..12, preserving the existing unclamped OLS baseline."""
    pairs = [r for r in _ordered(records) if r["official"].get("pct") is not None]
    results = []
    for count in range(3, 13):
        training, evaluation = pairs[:count], pairs[count:]
        item: dict[str, Any] = {"n": count, "evaluation_n": len(evaluation)}
        if len(training) != count or len(evaluation) < 3:
            results.append({**item, "available": False, "reason": "insufficient_pairs"})
            continue
        mean_x = fmean(p["area_km2"]["primary"] for p in training)
        mean_y = fmean(p["official"]["pct"] for p in training)
        variance = sum((p["area_km2"]["primary"] - mean_x) ** 2 for p in training)
        if variance < 1e-12:
            results.append({**item, "available": False, "reason": "insufficient_area_variance"})
            continue
        slope = (
            sum(
                (p["area_km2"]["primary"] - mean_x) * (p["official"]["pct"] - mean_y)
                for p in training
            )
            / variance
        )
        intercept = mean_y - slope * mean_x
        predicted = [intercept + slope * p["area_km2"]["primary"] for p in evaluation]
        errors = [
            value - p["official"]["pct"] for p, value in zip(evaluation, predicted, strict=True)
        ]
        bounds = (
            min(p["area_km2"]["primary"] for p in training),
            max(p["area_km2"]["primary"] for p in training),
        )
        results.append(
            {
                **item,
                "available": True,
                "slope": slope,
                "intercept": intercept,
                "mae_pp": _metrics(errors)["mae_pp"],
                "rmse_pp": _metrics(errors)["rmse_pp"],
                "calibration_mean_mae_pp": fmean(
                    abs(mean_y - p["official"]["pct"]) for p in evaluation
                ),
                "extrapolated_n": sum(
                    not bounds[0] <= p["area_km2"]["primary"] <= bounds[1] for p in evaluation
                ),
                "outside_0_100_n": sum(not 0 <= p <= 100 for p in predicted),
                "calibration_utc": [p["utc"] for p in training],
                "evaluation_utc": [p["utc"] for p in evaluation],
            }
        )
    return results


def previous_official_baseline(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Use only exactly 12-calendar-day predecessor pairs, never bridge a product gap."""
    ordered = _ordered(records)
    included, excluded = [], []
    for i, current in enumerate(ordered):
        previous = ordered[i - 1] if i else None
        days = (
            (
                date.fromisoformat(current["local"][:10])
                - date.fromisoformat(previous["local"][:10])
            ).days
            if previous
            else None
        )
        reason = (
            "no_previous_acquisition"
            if previous is None
            else "not_12_days"
            if days != 12
            else "missing_official_storage"
            if any(r["official"].get("pct") is None for r in (previous, current))
            else None
        )
        if reason:
            excluded.append({"utc": current["utc"], "reason": reason, "days": days})
            continue
        actual, predicted = current["official"]["pct"], previous["official"]["pct"]
        included.append(
            {
                "utc": current["utc"],
                "local": current["local"],
                "previous_utc": previous["utc"],
                "actual_pct": actual,
                "predicted_pct": predicted,
                "abs_error_pp": abs(predicted - actual),
            }
        )
    return {
        **_metrics([p["predicted_pct"] - p["actual_pct"] for p in included]),
        "cohort": "All consecutive acquisitions exactly 12 Taiwan calendar days apart.",
        "points": included,
        "excluded": excluded,
    }


def evaluate_reservoir(
    reservoir: str,
    grade: str,
    records: list[dict[str, Any]],
    gap_start: str,
) -> dict[str, Any]:
    """Produce estimates and both DEF-12 reports, without modifying source records."""
    if grade not in {"A", "B", "C"}:
        raise ValueError("Unknown published grade.")
    date.fromisoformat(gap_start)
    ordered = _ordered(records)
    drawdown = [r for r in ordered if r["utc"][:10] < gap_start]
    result: dict[str, Any] = {
        "reservoir": reservoir,
        "grade": grade,
        "eligible": False,
        "reason": None,
        "full_pool": None,
        "drawdown": {
            "start_utc": drawdown[0]["utc"] if drawdown else None,
            "end_utc": drawdown[-1]["utc"] if drawdown else None,
            "rule": "UTC acquisition date < index.gap.start",
            "gap_start": gap_start,
        },
        "calibration": [],
        "points": [],
        "evaluation": None,
        "first_detection": {"two_sigma": None, "three_sigma": None},
        "reference_comparison": {},
    }
    if grade != "A":
        return {**result, "reason": "grade_not_a"}
    pool = full_pool_range(ordered)
    if pool is None:
        return {**result, "reason": "insufficient_full_pool_dates"}
    result["full_pool"] = pool
    boundary = pool["lower_2sigma_km2"]
    paired = [r for r in ordered if r["official"].get("pct") is not None]
    drawdown_pairs = [r for r in drawdown if r["official"].get("pct") is not None]
    in_band = [r for r in drawdown_pairs if r["area_km2"]["primary"] >= boundary]
    low = [r for r in drawdown_pairs if r["area_km2"]["primary"] < boundary]
    if not in_band or len(low) < 2:
        return {**result, "reason": "insufficient_drawdown_calibration"}
    anchor = in_band[-1]
    calibration_points = [
        {
            "utc": r["utc"],
            "local": r["local"],
            "area_km2": r["area_km2"]["primary"],
            "storage_pct": r["official"]["pct"],
            "anchor": r is anchor,
        }
        for r in [anchor, *low]
    ]
    if len({p["area_km2"] for p in calibration_points}) != len(calibration_points):
        return {**result, "reason": "duplicate_calibration_area"}
    high = [r for r in paired if r["area_km2"]["primary"] >= boundary]
    lower_pct = min(r["official"]["pct"] for r in high)
    folds, mean_errors = [], []
    for target in low:
        remaining = [p for p in calibration_points if p["utc"] != target["utc"]]
        estimate = interpolate_storage(target["area_km2"]["primary"], remaining)
        error = abs(estimate["estimate_pct"] - target["official"]["pct"])
        folds.append(
            {
                "utc": target["utc"],
                "local": target["local"],
                "actual_pct": target["official"]["pct"],
                "predicted_pct": estimate["estimate_pct"],
                "raw_predicted_pct": estimate["raw_estimate_pct"],
                "abs_error_pp": error,
                "extrapolated": estimate["extrapolated"],
                "clamped": estimate["clamped"],
                "calibration_utc": [p["utc"] for p in remaining],
            }
        )
        mean_errors.append(fmean(p["storage_pct"] for p in remaining) - target["official"]["pct"])
    maximum = max(fold["abs_error_pp"] for fold in folds)
    points = []
    for record in ordered:
        high_kind = record["area_km2"]["primary"] >= boundary
        estimate = (
            {
                "estimate_pct": None,
                "raw_estimate_pct": None,
                "extrapolated": False,
                "clamped": False,
            }
            if high_kind
            else interpolate_storage(record["area_km2"]["primary"], calibration_points)
        )
        points.append(
            {
                "utc": record["utc"],
                "local": record["local"],
                "area_km2": record["area_km2"]["primary"],
                "actual_pct": record["official"].get("pct"),
                "qa": list(record.get("qa", [])),
                "kind": "high" if high_kind else "numeric",
                **estimate,
                "high_lower_pct": lower_pct if high_kind else None,
                "range_pct": None
                if high_kind
                else [
                    max(0.0, estimate["estimate_pct"] - maximum),
                    min(100.0, estimate["estimate_pct"] + maximum),
                ],
                "calibration": any(p["utc"] == record["utc"] for p in calibration_points),
            }
        )
    misclassified = [
        {k: p[k] for k in ("utc", "local", "actual_pct", "kind", "qa")}
        for p in points
        if p["actual_pct"] is not None and (p["kind"] == "high") != (p["actual_pct"] >= lower_pct)
    ]
    persistence = previous_official_baseline(ordered)
    low_dates = {r["utc"] for r in low}
    persistence_low = [p for p in persistence["points"] if p["utc"] in low_dates]
    overall_mean = fmean(r["official"]["pct"] for r in paired)
    return {
        **result,
        "eligible": True,
        "calibration": calibration_points,
        "points": points,
        "evaluation": {
            "high": {
                "n": sum(p["kind"] == "high" for p in points),
                "actual_min_pct": lower_pct,
                "correct_count": sum(
                    p["kind"] == "high"
                    and p["actual_pct"] is not None
                    and p["actual_pct"] >= lower_pct
                    for p in points
                ),
                "false_high_count": sum(p["kind"] == "high" for p in misclassified),
                "false_low_count": sum(p["kind"] == "numeric" for p in misclassified),
                "misclassified": misclassified,
            },
            "numeric": {
                "n": len(folds),
                "mae_pp": fmean(f["abs_error_pp"] for f in folds),
                "max_abs_error_pp": maximum,
                "folds": folds,
            },
            "baselines": {
                "calibration_mean": {
                    **_metrics(mean_errors),
                    "cohort": "Same low-water leave-one-out folds; remaining calibration mean.",
                },
                "archive_mean": {
                    **_metrics([overall_mean - r["official"]["pct"] for r in paired]),
                    "mean_pct": overall_mean,
                    "cohort": "All paired archive dates; descriptive in-sample mean.",
                },
                "previous_official": persistence,
                "previous_official_low_water": {
                    **_metrics([p["predicted_pct"] - p["actual_pct"] for p in persistence_low]),
                    "cohort": "Numeric DEF-12 fold dates having an exactly 12-day predecessor.",
                    "points": persistence_low,
                },
            },
            "linear_comparison": linear_comparisons(ordered),
        },
        "first_detection": {
            "two_sigma": first_detection(drawdown, pool["lower_2sigma_km2"]),
            "three_sigma": first_detection(drawdown, pool["lower_3sigma_km2"]),
        },
    }


REFERENCE_RESULTS: dict[str, dict[str, Any]] = {
    "baoshan2": {
        "high_n": 15,
        "high_min_pct": 71,
        "numeric_n": 5,
        "numeric_mae_pp": 5.2,
        "numeric_max_abs_error_pp": 9.2,
        "fold_abs_error_pp": [2.3, 2.8, 3.4, 8.1, 9.2],
        "misclassified_n": 1,
        "first_detection_2sigma_date": "2026-01-29",
        "first_detection_2sigma_pct": 66,
        "first_detection_3sigma_date": "2026-02-10",
        "first_detection_3sigma_pct": 58,
        "previous_official_mae_pp": 4.5,
        "archive_mean_mae_pp": 18.6,
    },
    "liyutan": {
        "high_n": 16,
        "high_min_pct": 68,
        "numeric_n": 5,
        "numeric_mae_pp": 4.0,
        "numeric_max_abs_error_pp": 10.4,
        "fold_abs_error_pp": [0.0, 0.4, 0.2, 10.4, 8.9],
        "misclassified_n": 0,
        "first_detection_2sigma_date": "2026-01-29",
        "first_detection_2sigma_pct": 64,
        "first_detection_3sigma_date": "2026-02-10",
        "first_detection_3sigma_pct": 59,
        "previous_official_mae_pp": 4.3,
        "archive_mean_mae_pp": 17.1,
    },
}


def compare_reference(result: dict[str, Any]) -> dict[str, Any]:
    """Compare fixed outputs with the advice's rounded references, never tune to them."""
    expected = REFERENCE_RESULTS.get(result["reservoir"])
    if not expected or not result["eligible"]:
        return {}
    evaluation = result["evaluation"]
    high, numeric = evaluation["high"], evaluation["numeric"]
    two, three = (result["first_detection"][key] for key in ("two_sigma", "three_sigma"))
    actual = {
        "high_n": high["n"],
        "high_min_pct": high["actual_min_pct"],
        "numeric_n": numeric["n"],
        "numeric_mae_pp": numeric["mae_pp"],
        "numeric_max_abs_error_pp": numeric["max_abs_error_pp"],
        "fold_abs_error_pp": [fold["abs_error_pp"] for fold in numeric["folds"]],
        "misclassified_n": len(high["misclassified"]),
        "first_detection_2sigma_date": two["local"][:10] if two else None,
        "first_detection_2sigma_pct": two["storage_pct"] if two else None,
        "first_detection_3sigma_date": three["local"][:10] if three else None,
        "first_detection_3sigma_pct": three["storage_pct"] if three else None,
        "previous_official_mae_pp": evaluation["baselines"]["previous_official"]["mae_pp"],
        "archive_mean_mae_pp": evaluation["baselines"]["archive_mean"]["mae_pp"],
    }
    differences = []
    for key, reference in expected.items():
        value = actual[key]
        if isinstance(reference, list):
            matches = [round(v, 1) for v in value] == reference
        elif isinstance(reference, float):
            matches = value is not None and round(value, 1) == reference
        elif key.endswith("pct"):
            matches = value is not None and round(value) == reference
        else:
            matches = value == reference
        if not matches:
            differences.append({"metric": key, "reference": reference, "recomputed": value})
    return {
        "reference": expected,
        "recomputed": actual,
        "comparison_precision": "1 decimal pp; integer storage pct; exact counts and local dates",
        "differences": differences,
        "previous_official_cohort_note": (
            "Strict 12-calendar-day pairs only (n=17). The advice's Liyutan 4.3 pp can be "
            "reproduced by including two 24-day intervals (n=19), excluded by this baseline."
        ),
    }


def evaluate_archive(
    inputs: dict[str, dict[str, Any]],
    gap_start: str,
    source: dict[str, Any],
) -> dict[str, Any]:
    """Build a report with a completeness gate, not an invented precision acceptance rule."""
    reservoirs = {
        key: evaluate_reservoir(key, value["grade"], value["records"], gap_start)
        for key, value in inputs.items()
    }
    checks: list[dict[str, Any]] = []
    for key, result in reservoirs.items():
        result["reference_comparison"] = compare_reference(result)
        records = _ordered(inputs[key]["records"])
        if result["grade"] != "A":
            checks.append(
                {
                    "name": f"{key}: B/C estimates absent",
                    "passed": (
                        not result["eligible"]
                        and not result["points"]
                        and not result["calibration"]
                        and result["evaluation"] is None
                    ),
                }
            )
            continue
        eligible = result["eligible"]
        checks.append({"name": f"{key}: A-grade evaluation available", "passed": eligible})
        if not eligible:
            continue
        high, numeric = result["evaluation"]["high"], result["evaluation"]["numeric"]
        checks.extend(
            [
                {
                    "name": f"{key}: published area and storage preserved",
                    "passed": (
                        len(records) == len(result["points"])
                        and all(
                            r["utc"] == p["utc"]
                            and r["area_km2"]["primary"] == p["area_km2"]
                            and r["official"].get("pct") == p["actual_pct"]
                            for r, p in zip(records, result["points"], strict=True)
                        )
                    ),
                },
                {
                    "name": f"{key}: categorical estimates contain no number",
                    "passed": all(
                        p["estimate_pct"] is None
                        and p["raw_estimate_pct"] is None
                        and p["range_pct"] is None
                        for p in result["points"]
                        if p["kind"] == "high"
                    ),
                },
                {
                    "name": f"{key}: every numeric fold excludes its target",
                    "passed": (
                        numeric["n"] == len(numeric["folds"]) == len(result["calibration"]) - 1
                        and all(f["utc"] not in f["calibration_utc"] for f in numeric["folds"])
                    ),
                },
                {
                    "name": f"{key}: finite and separated DEF-12 results",
                    "passed": (
                        high["n"] > 0
                        and _finite(high["actual_min_pct"])
                        and numeric["n"] >= 2
                        and _finite(numeric["mae_pp"])
                        and _finite(numeric["max_abs_error_pp"])
                        and all(
                            _finite(f["predicted_pct"]) and 0 <= f["predicted_pct"] <= 100
                            for f in numeric["folds"]
                        )
                    ),
                },
                {
                    "name": f"{key}: all C1 sample counts reported",
                    "passed": (
                        [r["n"] for r in result["evaluation"]["linear_comparison"]]
                        == list(range(3, 13))
                    ),
                },
            ]
        )
    passed = (
        bool(inputs)
        and any(r["eligible"] for r in reservoirs.values())
        and all(check["passed"] for check in checks)
    )
    return {
        "schema_version": 1,
        "method": "two_stage_storage_v1",
        "evaluation_status": "complete" if passed else "incomplete",
        "gate": {"passed": passed, "checks": checks},
        "source": source,
        "definitions": DEFINITIONS,
        "reservoirs": reservoirs,
    }
