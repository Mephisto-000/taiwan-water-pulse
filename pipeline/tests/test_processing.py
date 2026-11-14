import math

import numpy as np
import pytest
from pyproj import Transformer
from rasterio import Affine

from water_pulse.models import Reservoir
from water_pulse.numerics import decode_db, quantize_db
from water_pulse.processing import (
    create_grid,
    linear_mean_filter,
    pooled_threshold,
    process_window,
)


def square_reservoir() -> tuple[Reservoir, dict]:
    transform = Transformer.from_crs(3857, 4326, always_xy=True)
    lon0, lat0 = transform.transform(0, 0)
    lon1, lat1 = transform.transform(1000, 1000)
    reservoir: Reservoir = {
        "key": "test",
        "name": "Test",
        "name_zh": "Test",
        "station": "test",
        "osm": "way/1",
        "bbox": [lat0, lat1, lon0, lon1],
        "osm_area_km2": 1,
    }
    feature = {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]],
        },
    }
    return reservoir, feature


def test_grid_is_fixed_ground_area_and_buffers_real_polygon() -> None:
    reservoir, feature = square_reservoir()
    grid, mask = create_grid(reservoir, feature)
    repeated, second_mask = create_grid(reservoir, feature)
    assert grid == repeated
    np.testing.assert_array_equal(mask, second_mask)
    assert grid["pixel_area_m2"] == pytest.approx(100)
    assert grid["ground_spacing_m"] == 10
    assert mask.shape == (grid["height"], grid["width"])
    expected_buffered_area = 1_000_000 + 4 * 1000 * 150 + math.pi * 150**2
    assert mask.sum() * grid["pixel_area_m2"] == pytest.approx(expected_buffered_area, rel=0.02)
    assert np.all(mask[:10] == 0)
    assert np.all(mask[-10:] == 0)
    # The per-channel capacity rule depends on the total requested date count.
    coarse, _ = create_grid(reservoir, feature, date_count=1000)
    assert coarse["ground_spacing_m"] == 20
    assert coarse["pixel_area_m2"] == pytest.approx(400)


def test_filter_averages_linear_power_ignores_invalid_and_retains_invalid_centres() -> None:
    power = np.ones((3, 3), dtype=float)
    power[0, 0] = 100
    power[0, 1] = 1e20
    valid = np.ones((3, 3), dtype=bool)
    valid[0, 1] = False
    result = linear_mean_filter(power, valid)
    assert result[1, 1] == pytest.approx(107 / 8)
    assert np.isnan(result[0, 1])
    assert result[2, 2] == pytest.approx(1)
    # Averaging dB would yield a materially different power value.
    assert 10 * np.log10(result[1, 1]) > 10


def identical_grid(size: int = 5) -> dict:
    return {
        "width": size,
        "height": size,
        "crs": "EPSG:3857",
        "transform": list(Affine(10, 0, 0, 0, -10, size * 10))[:6],
    }


def test_window_reprojects_power_and_keeps_masked_or_nonpositive_pixels_invalid() -> None:
    size = 5
    power = np.full((size, size), 0.01)
    mask = np.ones((size, size), dtype=np.uint8)
    mask[1, 1], mask[2, 2] = 0, 255
    hh = power.copy()
    hh[3, 3] = -1
    cache = {
        "x": np.arange(size) * 10 + 5,
        "y": size * 10 - np.arange(size) * 10 - 5,
        "epsg": np.array(3857),
        "mask": mask,
        "HHHH": hh,
        "HVHV": power * 0.1,
    }
    result = process_window(cache, identical_grid(size))
    assert result["HH"].dtype == np.uint8
    assert result["HH"][1, 1] == result["HH"][2, 2] == result["HH"][3, 3] == 0
    assert result["HV"][3, 3] > 0
    assert decode_db(result["HH"])[0, 0] == pytest.approx(-20, abs=0.16)
    assert decode_db(result["HV"])[0, 0] == pytest.approx(-30, abs=0.16)
    # Changing axis direction together with the data preserves geolocation.
    reversed_cache = dict(cache)
    reversed_cache["x"] = cache["x"][::-1]
    reversed_cache["y"] = cache["y"][::-1]
    for key in ("mask", "HHHH", "HVHV"):
        reversed_cache[key] = cache[key][::-1, ::-1]
    reversed_result = process_window(reversed_cache, identical_grid(size))
    np.testing.assert_array_equal(result["HH"], reversed_result["HH"])


def test_pooled_threshold_uses_only_valid_analysis_pixels() -> None:
    first = quantize_db([[-30, -28, -8], [-10, -12, 5]])
    second = quantize_db([[-29, -27, -8], [-11, -9, 5]])
    mask = np.array([[1, 1, 0], [1, 1, 0]], dtype=np.uint8)
    threshold = pooled_threshold([first, second], mask)
    assert -24 <= threshold <= -14
    assert -27 < threshold < -12
    with pytest.raises(ValueError, match="At least one"):
        pooled_threshold([], mask)
    with pytest.raises(ValueError, match="different shape"):
        pooled_threshold([first[:, :2]], mask)


def test_zero_buffer_matches_the_rasterized_polygon_area() -> None:
    reservoir, feature = square_reservoir()
    grid, mask = create_grid(reservoir, feature, analysis_buffer_ground_m=0)
    assert grid["analysis_buffer_ground_m"] == 0
    assert mask.sum() * grid["pixel_area_m2"] == pytest.approx(1_000_000, rel=0.02)
    assert mask.sum() < create_grid(reservoir, feature)[1].sum()
    for buffer in (-1, 151, float("nan"), float("inf")):
        with pytest.raises(ValueError, match="Analysis buffer"):
            create_grid(reservoir, feature, analysis_buffer_ground_m=buffer)
