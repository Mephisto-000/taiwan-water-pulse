"""Independent worked examples for the fixed ADV-10 definitions."""

import json
from copy import deepcopy
from datetime import date, timedelta
from pathlib import Path

import pytest

from water_pulse.storage_estimation import (
    compare_reference,
    evaluate_archive,
    evaluate_reservoir,
    first_detection,
    full_pool_range,
    interpolate_storage,
    linear_comparisons,
    previous_official_baseline,
)


def row(day: str, area: float, pct: float | None, qa: list[str] | None = None) -> dict:
    return {
        "utc": f"{day}T00:00:00Z",
        "local": f"{day}T08:00:00+08:00",
        "area_km2": {"primary": area},
        "official": {"pct": pct},
        "qa": qa or [],
    }


def calibration(area: float, pct: float) -> dict:
    return {"area_km2": area, "storage_pct": pct}


def example() -> list[dict]:
    return [
        row("2026-01-01", 10, 100),
        row("2026-01-13", 8, 70),
        row("2026-01-25", 6, 50),
        row("2026-02-06", 4, 30),
        row("2026-02-18", 2, 10),
        row("2026-06-01", 9, 100, ["quality_flag"]),
        row("2026-06-13", 11, 99.5),
    ]


def test_full_pool_includes_quality_flags_uses_sample_sd_and_exact_cutoff() -> None:
    rows = example() + [row("2026-06-25", 99, 99.499), row("2026-07-07", 200, None)]
    original = deepcopy(rows)
    result = full_pool_range(rows)
    assert result["n"] == 3
    assert result["mean_area_km2"] == 10
    assert result["sample_sd_area_km2"] == 1
    assert result["lower_2sigma_km2"] == 8
    assert result["lower_3sigma_km2"] == 7
    assert rows == original
    assert full_pool_range(rows[:5]) is None


def test_piecewise_interpolation_keeps_nonmonotone_samples() -> None:
    points = [calibration(2, 40), calibration(3, 30), calibration(5, 70)]
    assert interpolate_storage(2.5, points) == {
        "estimate_pct": 35,
        "raw_estimate_pct": 35,
        "extrapolated": False,
        "clamped": False,
    }
    assert interpolate_storage(4, points)["estimate_pct"] == 50
    assert interpolate_storage(2, points)["extrapolated"] is False


def test_low_end_extrapolation_is_clamped_with_raw_value_preserved() -> None:
    result = interpolate_storage(0, [calibration(2, 10), calibration(4, 30)])
    assert result == {
        "estimate_pct": 0,
        "raw_estimate_pct": -10,
        "extrapolated": True,
        "clamped": True,
    }
    with pytest.raises(ValueError, match="distinct"):
        interpolate_storage(1, [calibration(2, 10), calibration(2, 30)])


def test_two_stage_boundary_and_loo_really_remove_the_target() -> None:
    rows = example()
    original = deepcopy(rows)
    result = evaluate_reservoir("example", "A", rows, "2026-03-01")
    assert result["eligible"]
    assert result["points"][1]["kind"] == "high"
    assert result["points"][1]["estimate_pct"] is None
    assert result["points"][1]["raw_estimate_pct"] is None
    assert result["points"][1]["high_lower_pct"] == 70
    assert result["evaluation"]["high"]["n"] == 4
    numeric = result["evaluation"]["numeric"]
    assert numeric["n"] == 3
    assert numeric["mae_pp"] == 0
    assert numeric["max_abs_error_pp"] == 0
    for fold in numeric["folds"]:
        assert fold["utc"] not in fold["calibration_utc"]
        assert len(fold["calibration_utc"]) == 3
    assert numeric["folds"][-1]["extrapolated"] is True
    assert result["first_detection"]["two_sigma"]["local"].startswith("2026-01-25")
    assert result["first_detection"]["three_sigma"]["local"].startswith("2026-01-25")
    assert rows == original


@pytest.mark.parametrize("grade", ["B", "C"])
def test_grade_b_and_c_never_produce_predictions_or_model_fit(grade: str) -> None:
    result = evaluate_reservoir("example", grade, example(), "2026-03-01")
    assert result["eligible"] is False
    assert result["reason"] == "grade_not_a"
    assert result["points"] == []
    assert result["calibration"] == []
    assert result["evaluation"] is None


def test_insufficient_full_pool_dates_disable_estimation() -> None:
    result = evaluate_reservoir("example", "A", example()[:5], "2026-03-01")
    assert result["eligible"] is False
    assert result["reason"] == "insufficient_full_pool_dates"
    assert result["points"] == []


def test_invalid_areas_and_duplicate_dates_are_rejected() -> None:
    with pytest.raises(ValueError, match="finite"):
        full_pool_range([row("2026-01-01", float("nan"), 100)])
    with pytest.raises(ValueError, match="Duplicate"):
        evaluate_reservoir("example", "A", example() + example()[:1], "2026-03-01")


def test_first_detection_is_strict_and_returns_none_when_no_drawdown_detection() -> None:
    rows = [row("2026-01-01", 10, 90), row("2026-01-13", 8, 70)]
    assert first_detection(list(reversed(rows)), 10)["storage_pct"] == 70
    assert first_detection(rows, 8) is None


def test_previous_official_uses_calendar_days_and_excludes_long_and_missing_pairs() -> None:
    rows = [
        row("2026-01-01", 10, 100),
        row("2026-01-13", 9, 90),
        row("2026-02-06", 8, 70),
        row("2026-02-18", 7, None),
        row("2026-03-02", 6, 40),
    ]
    rows[1]["utc"] = "2026-01-13T00:00:04Z"
    rows[1]["local"] = "2026-01-13T08:00:04+08:00"
    result = previous_official_baseline(rows)
    assert result["n"] == 1
    assert result["mae_pp"] == 10
    assert result["points"][0]["previous_utc"] == rows[0]["utc"]
    assert [r["reason"] for r in result["excluded"]] == [
        "no_previous_acquisition",
        "not_12_days",
        "missing_official_storage",
        "missing_official_storage",
    ]


def test_linear_baseline_reports_all_predeclared_counts_without_clamping() -> None:
    rows = [
        row((date(2026, 1, 1) + timedelta(days=i)).isoformat(), i + 1, (i + 1) * 5)
        for i in range(16)
    ]
    comparisons = linear_comparisons(rows)
    assert [p["n"] for p in comparisons] == list(range(3, 13))
    assert all(p["available"] for p in comparisons)
    assert all(p["mae_pp"] == 0 for p in comparisons)
    assert comparisons[0]["slope"] == 5
    assert comparisons[0]["extrapolated_n"] == 13
    constant = deepcopy(rows)
    for point in constant:
        point["area_km2"]["primary"] = 1
    assert all(not p["available"] for p in linear_comparisons(constant))


def test_archive_gate_requires_complete_a_evaluation_and_never_scores_b_c() -> None:
    inputs = {
        "one": {"grade": "A", "records": example()},
        "two": {"grade": "B", "records": example()},
    }
    report = evaluate_archive(inputs, "2026-03-01", {"commit": "example"})
    assert report["gate"]["passed"]
    assert report["evaluation_status"] == "complete"
    assert all(check["passed"] for check in report["gate"]["checks"])
    inputs["one"]["records"] = example()[:5]
    failed = evaluate_archive(inputs, "2026-03-01", {})
    assert not failed["gate"]["passed"]
    assert failed["evaluation_status"] == "incomplete"


@pytest.mark.parametrize(
    "key,n,lower,mae,maximum,false_low,persistence",
    [
        (
            "baoshan2",
            15,
            71.36233719354513,
            5.174364268487553,
            9.214984461488491,
            1,
            4.460706683347828,
        ),
        (
            "liyutan",
            16,
            68.09808060012,
            3.9825599966742056,
            10.390362155557671,
            0,
            4.383326435764956,
        ),
    ],
)
def test_published_archives_match_independent_recalculation(
    key: str,
    n: int,
    lower: float,
    mae: float,
    maximum: float,
    false_low: int,
    persistence: float,
) -> None:
    root = Path(__file__).resolve().parents[2] / "web/public/data"
    records = json.loads((root / f"reservoirs/{key}/timeseries.json").read_text())["records"]
    before = deepcopy(records)
    result = evaluate_reservoir(key, "A", records, "2026-03-18")
    high, numeric = result["evaluation"]["high"], result["evaluation"]["numeric"]
    assert high["n"] == n
    assert high["actual_min_pct"] == pytest.approx(lower)
    assert high["false_low_count"] == false_low
    assert high["false_high_count"] == 0
    assert numeric["n"] == 5
    assert numeric["mae_pp"] == pytest.approx(mae)
    assert numeric["max_abs_error_pp"] == pytest.approx(maximum)
    assert result["first_detection"]["two_sigma"]["local"][:10] == "2026-01-29"
    assert result["first_detection"]["three_sigma"]["local"][:10] == "2026-02-10"
    baseline = result["evaluation"]["baselines"]["previous_official"]
    assert baseline["n"] == 17
    assert baseline["mae_pp"] == pytest.approx(persistence)
    assert records == before
    if key == "baoshan2":
        mistaken = high["misclassified"][0]
        assert mistaken["local"][:10] == "2026-07-04"
        assert mistaken["actual_pct"] == 100
        assert mistaken["qa"]
    numeric_points = [p for p in result["points"] if p["kind"] == "numeric"]
    for point in numeric_points:
        assert point["range_pct"] == pytest.approx(
            [
                max(0, point["estimate_pct"] - maximum),
                min(100, point["estimate_pct"] + maximum),
            ]
        )
    comparison = compare_reference(result)
    assert [d["metric"] for d in comparison["differences"]] == (
        ["previous_official_mae_pp"] if key == "liyutan" else []
    )
