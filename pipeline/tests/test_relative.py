import math

import numpy as np
import pytest

from water_pulse.numerics import quantize_db
from water_pulse.relative import (
    linear_multilook,
    native_grid,
    reference_median_db,
    relative_area,
)


def test_multilook_averages_linear_power_before_log_and_excludes_invalid_values() -> None:
    values = np.ones((6, 6))
    values[0, 0] = 100
    values[3:, 3:] = 0.01
    mask = np.ones((6, 6), dtype=np.uint8)
    mask[0, 1] = 0
    values[0, 1] = 1e20
    cache = {
        "x": np.arange(6) * 10 + 5,
        "y": 55 - np.arange(6) * 10,
        "epsg": np.array(32651),
        "HHHH": values,
        "HVHV": values / 10,
        "mask": mask,
    }
    source = {"coordinates": {"x_first": 5, "y_first": 55}}
    grid = native_grid(cache, source, 30)
    assert grid["width"] == grid["height"] == 2
    assert grid["pixel_area_m2"] == 900
    result = linear_multilook(cache, grid, "HH")
    assert result[0, 0] == pytest.approx(107 / 8)
    assert result[0, 1] == pytest.approx(1)
    assert result[1, 1] == pytest.approx(0.01)
    assert 10 * math.log10(result[0, 0]) > 10
    np.testing.assert_allclose(linear_multilook(cache, grid, "HV"), result / 10)
    with pytest.raises(ValueError, match="predeclared"):
        native_grid(cache, source, 40)


def test_reference_is_median_linear_power_then_log_not_mean_of_logs() -> None:
    power = np.array([[1.0, 100], [1e9, np.nan]])
    ring = np.array([[True, True], [False, True]])
    assert reference_median_db(power, ring) == pytest.approx(10 * np.log10(50.5))
    with pytest.raises(ValueError, match="At least two"):
        reference_median_db(power, np.array([[False, True], [False, True]]))


def test_relative_area_uses_analysis_spacing_and_ratio_sensitivity() -> None:
    pixels = quantize_db(np.array([-12, -10, -8, np.nan]))
    mask = np.ones(4, dtype=np.uint8)
    center, low, high = relative_area(pixels, mask, -6, 900, 0.6)
    assert (center, low, high) == pytest.approx((0.0018, 0.0018, 0.0027))
    # Equal quantized values on a different analysis grid use that grid's area.
    larger = relative_area(pixels, mask, -6, 170**2, 0.6)
    assert larger[0] / center == pytest.approx(170**2 / 900)
    with pytest.raises(ValueError, match="ratio"):
        relative_area(pixels, mask, -6, 900, 0)
