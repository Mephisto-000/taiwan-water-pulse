from copy import deepcopy

import pytest

from water_pulse.official import parse_live, storage_volume_m3
from water_pulse.review import (
    channel_quality_flags,
    descriptive_correlations,
    effect_size,
    full_storage_repeatability,
    trapezoidal_volume_change,
    volume_closure,
)


def observation(
    date: str,
    area: float,
    level: float | None,
    pct: float | None = 100,
    volume: float | None = None,
) -> dict:
    return {
        "utc": date + "T21:00:00Z",
        "area_km2": {
            "primary": area,
            "primary_lo": area - 0.1,
            "primary_hi": area + 0.1,
            "hh": area,
            "hv": area,
        },
        "official": {"pct": pct, "level_m": level, "storage_volume_m3": volume},
        "land_median_db_by_channel": {"HH": -6, "HV": -12},
        "valid_fraction": 1,
    }


def test_effect_size_boundary_and_zero_sensitivity_are_finite_json() -> None:
    records = [observation("2026-01-01", 1, 100), observation("2026-01-13", 1.4, 120)]
    # Avoid binary-rounding ambiguity for the exact 2x boundary.
    records[1]["area_km2"]["primary"] = 1.25
    for r in records:
        r["area_km2"]["primary_lo"] = r["area_km2"]["primary"] - 0.0625
        r["area_km2"]["primary_hi"] = r["area_km2"]["primary"] + 0.0625
    result = effect_size(records)
    assert result["passes"]
    assert result["range_to_sensitivity_ratio"] == 2
    assert result["level_range_m"] == 20
    records[1]["area_km2"]["primary"] = 1.24
    assert not effect_size(records)["passes"]
    for r in records:
        r["area_km2"]["primary_hi"] = r["area_km2"]["primary_lo"]
    assert effect_size(records)["range_to_sensitivity_ratio"] is None
    assert effect_size(records)["passes"]
    records[1]["area_km2"]["primary"] = 1
    assert not effect_size(records)["passes"]
    records[0]["area_km2"]["primary_hi"] = -1
    with pytest.raises(ValueError, match="negative"):
        effect_size(records)


def test_full_pool_repeatability_preserves_missingness_and_ddof() -> None:
    rows = [observation("2026-01-01", 1, 10, 99.5), observation("2026-01-13", 3, 11, 100)]
    rows += [observation("2026-01-25", 100, 12, 99.49), observation("2026-02-06", 200, None, None)]
    result = full_storage_repeatability(rows)
    assert result["n"] == 2
    assert result["std_km2"] == 1
    assert result["range_km2"] == 2
    assert result["std_ddof"] == 0
    assert full_storage_repeatability(rows[2:])["std_km2"] is None
    assert full_storage_repeatability(rows[:1])["std_km2"] is None


def test_qa_flags_are_per_channel_keep_rows_and_use_strict_deviation() -> None:
    rows = [observation(f"2026-01-0{i + 1}", 1, 10, 80) for i in range(5)]
    rows[0]["land_median_db_by_channel"]["HV"] = -9.99
    rows[1]["land_median_db_by_channel"]["HV"] = -10
    rows[2]["valid_fraction_by_channel"] = {"HH": 1, "HV": 0.97}
    original = deepcopy(rows)
    flags = channel_quality_flags(rows)
    assert len(flags) == 5 and rows == original
    assert flags[0]["HH"] == []
    assert flags[0]["HV"] == ["land_reference_deviation_over_2_db"]
    assert flags[1]["HV"] == []
    assert flags[2]["HV"] == ["valid_fraction_below_0.98"]


def test_full_pool_qa_zero_mad_flags_only_strictly_lower_full_dates() -> None:
    rows = [observation(f"2026-01-0{i + 1}", a, 10) for i, a in enumerate([1, 1, 1, 1, 0.8])]
    rows[4]["area_km2"]["hv"] = 1
    rows.append(observation("2026-01-06", 0.5, 9, 90))
    flags = channel_quality_flags(rows)
    assert flags[4]["HH"] == ["full_storage_area_below_median_minus_3_mad"]
    assert flags[4]["HV"] == []
    assert flags[5]["HH"] == []


def test_compact_correlations_exclude_missing_pairs_without_zero_imputation() -> None:
    result = descriptive_correlations([1, 2, 3, 200], [10, 20, 30, None])
    assert result["n"] == 3
    assert result["pearson_area_vs_level"] == pytest.approx(1)
    assert descriptive_correlations([1, 1, 1], [10, 20, 30])["pearson_area_vs_level"] is None
    with pytest.raises(ValueError, match="align"):
        descriptive_correlations([1], [1, 2])


def test_trapezoid_uses_million_m3_and_retains_intermediate_rises() -> None:
    assert trapezoidal_volume_change([1, 2], [120, 100]) == 30
    assert trapezoidal_volume_change([1, 1], [100, 120]) == -20
    # A rise is a signed segment, not removed or sorted by level.
    assert trapezoidal_volume_change([1, 2, 3], [120, 125, 100]) == 55
    with pytest.raises(ValueError, match="aligned"):
        trapezoidal_volume_change([1], [1])
    with pytest.raises(ValueError, match="finite"):
        trapezoidal_volume_change([1, 2], [10, float("nan")])
    with pytest.raises(ValueError, match="negative"):
        trapezoidal_volume_change([-1, 2], [10, 8])


def test_closure_ends_at_large_gap_and_uses_actual_official_volume() -> None:
    rows = [
        observation("2025-11-05", 2, 120, 100, 40e6),
        observation("2025-11-17", 1.5, 110, 80, 25e6),
        observation("2025-12-11", 1, 100, 50, 10e6),
        observation("2026-06-21", 0.5, 90, 20, 2e6),
    ]
    result = volume_closure(rows, {"passes": True}, {"source": "https://example.test/official"})
    assert result["n"] == 3
    assert result["end_utc"].startswith("2025-12-11")
    assert result["radar_million_m3"] == 30
    assert result["radar_low_million_m3"] == 28
    assert result["radar_high_million_m3"] == 32
    assert result["official_million_m3"] == 30
    assert result["ratio"] == 1
    assert result["available"]
    with pytest.raises(ValueError, match="chronological"):
        volume_closure(rows[::-1], {"passes": True}, {})


def test_closure_missing_volume_or_low_effect_is_unavailable_not_zero() -> None:
    rows = [observation("2026-01-01", 2, 120), observation("2026-01-13", 1, 100)]
    result = volume_closure(rows, {"passes": True}, {})
    assert result["eligible"] and not result["available"]
    assert result["official_million_m3"] is None
    assert result["reason"] == "official_volume_unavailable"
    assert not volume_closure(rows, {"passes": False}, {})["eligible"]
    rows[1]["official"]["level_m"] = None
    assert volume_closure(rows, {"passes": True}, {})["reason"] == "missing_official_levels"


def test_official_volume_conversion_preserves_null_and_zero() -> None:
    assert storage_volume_m3(3381.59) == 33_815_900
    assert storage_volume_m3(0) == 0
    assert storage_volume_m3(None) is None
    assert storage_volume_m3("") is None
    with pytest.raises(ValueError, match="nonnegative"):
        storage_volume_m3(-1)
    with pytest.raises(ValueError, match="finite"):
        storage_volume_m3("nan")
    cache = {
        "requests": {
            "x": {
                "records": [
                    {
                        "ST_NO": "10405",
                        "DATE": "2026-03-18",
                        "WaterLine": 130.81,
                        "CapacityRate": 0.28,
                        "Capacity": 953.87,
                        "CAPACITY_E": None,
                    }
                ]
            }
        }
    }
    row = parse_live(cache, "baoshan2", {})[0]
    assert row["storage_volume_m3"] == 9_538_700
    assert row["effective_capacity_m3"] is None


def test_undocumented_nonnull_effective_capacity_requires_review() -> None:
    cache = {
        "requests": {
            "x": {
                "records": [
                    {
                        "ST_NO": "10405",
                        "DATE": "2026-03-18",
                        "WaterLine": 130.81,
                        "CapacityRate": 0.28,
                        "Capacity": 953.87,
                        "CAPACITY_E": 3383,
                    }
                ]
            }
        }
    }
    with pytest.raises(ValueError, match="Verify"):
        parse_live(cache, "baoshan2", {})


def test_polarization_reference_cannot_come_after_the_drawdown() -> None:
    from water_pulse.release import _polarization_comparison

    rows = [
        observation("2025-11-05", 2, 120, 92),
        observation("2026-01-04", 1.5, 110, 60),
        observation("2026-03-17", 1, 100, 30),
        observation("2026-06-21", 2.1, 121, 100),
    ]
    for row in rows:
        row["qa_by_channel"] = {"HH": [], "HV": []}
    rows[1]["qa_by_channel"]["HV"] = ["land_reference_deviation_over_2_db"]
    result = _polarization_comparison(rows, {"lowest_observed_utc": rows[2]["utc"]})
    assert result["reference_utc"] == rows[0]["utc"]
    assert result["channels"]["HH"]["change_pct"] == -50
    assert result["channels"]["HV"]["all"]["n"] == 4
    assert result["channels"]["HV"]["without_flagged"]["n"] == 3
    assert result["channels"]["HV"]["flagged_dates"] == [rows[1]["utc"]]


def test_wider_threshold_diagnostics_leave_default_definition_unchanged() -> None:
    import numpy as np

    from water_pulse.numerics import quantize_db
    from water_pulse.relative import relative_area
    from water_pulse.release import _threshold_sensitivity

    rows = [observation("2026-01-01", 1, 120), observation("2026-01-13", 1, 110)]
    mask = np.ones((2, 3), dtype=np.uint8)
    frames = {
        r["utc"][:10]: {
            "frames": {"HH": quantize_db(np.array([[-14, -12, -10], [-8, -6, -4.0]]))},
            "land_median_db": {"HH": -5.0},
        }
        for r in rows
    }
    first = next(iter(frames.values()))["frames"]["HH"]
    before = relative_area(first, mask, -5, 900)
    result = _threshold_sensitivity(frames, mask, rows, 900)
    assert result["analysis_grid_m"] == 30
    assert [d["offset_db"] for d in result["definitions"]] == [2, 3, 4, 5, 6, None]
    assert result["definitions"][0]["records"][0]["threshold_db"] == -7
    assert result["definitions"][-1]["records"][0]["threshold_db"] is not None
    assert relative_area(first, mask, -5, 900) == before
