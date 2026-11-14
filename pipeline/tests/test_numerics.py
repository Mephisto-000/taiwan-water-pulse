import numpy as np
import pytest

from water_pulse.numerics import (
    decode_db,
    ground_pixel_area,
    otsu_threshold,
    power_to_db,
    quantize_db,
    water_area_km2,
)


def test_power_db_quantization_round_trip_and_invalid_values() -> None:
    db = np.linspace(-35, 5, 1000)
    power = 10 ** (db / 10)
    restored = decode_db(quantize_db(power_to_db(power)))
    assert np.max(np.abs(restored - db)) <= 0.16
    invalid = quantize_db(power_to_db([0, -1, np.nan, np.inf]))
    np.testing.assert_array_equal(invalid, [0, 0, 0, 0])
    assert np.isnan(decode_db(invalid)).all()


def test_quantization_saturates_and_has_portable_rounding() -> None:
    np.testing.assert_array_equal(quantize_db([-100, -35, 5, 100]), [1, 1, 255, 255])
    # q=0 means invalid, q=1 is a valid observation of -35 dB.
    assert decode_db([1])[0] == -35
    with pytest.raises(ValueError):
        decode_db([0.5])


def test_area_counts_valid_masked_water_and_corrects_latitude() -> None:
    raster = quantize_db([[-30, -10], [np.nan, -25]])
    mask = [[1, 1], [1, 0]]
    spacing = 10 / np.cos(np.deg2rad(24.7))
    pixel_area = ground_pixel_area(spacing, 24.7)
    assert pixel_area == pytest.approx(100)
    assert water_area_km2(raster, mask, -20, pixel_area) == pytest.approx(0.0001)
    # Sensitivity bounds are monotonic; masked and invalid pixels stay excluded.
    assert water_area_km2(raster, mask, -31, pixel_area) == 0
    with pytest.raises(ValueError):
        water_area_km2(raster, [1], -20, pixel_area)
    with pytest.raises(ValueError):
        ground_pixel_area(0, 24.7)


def test_otsu_bimodal_and_degenerate_data() -> None:
    samples = np.concatenate([np.linspace(-30, -26, 500), np.linspace(-12, -8, 500)])
    assert -24 <= otsu_threshold(samples) <= -14
    assert -26 < otsu_threshold(samples) < -12
    with pytest.raises(ValueError):
        otsu_threshold([np.nan, -20, -20])
