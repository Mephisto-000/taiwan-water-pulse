"""Native GCOV linear multilooking and fixed local-contrast classification.

No official record is accepted by the processing functions. The display grid
and this 30 m analysis grid are independent and explicitly described in metadata.
"""

import math
from typing import Any

import numpy as np
from pyproj import Transformer
from rasterio import Affine
from rasterio.features import rasterize
from rasterio.warp import Resampling, reproject, transform_geom

from .models import Reservoir
from .numerics import power_to_db, quantize_db, water_area_km2

ANALYSIS_SPACING = 30
THRESHOLD_RATIO = 0.6
SENSITIVITY_RATIOS = (0.5, 0.7)


def native_grid(cache: Any, source_grid: dict[str, Any], spacing: int) -> dict[str, Any]:
    """Keep complete cells aligned to the actual source product's global origin."""
    if spacing not in (10, 30, 50, 100, 170):
        raise ValueError("Use one of the predeclared native diagnostic spacings.")
    x, y = np.asarray(cache["x"]), np.asarray(cache["y"])
    if (
        int(cache["epsg"]) != 32651
        or not np.allclose(np.diff(x), 10)
        or not np.allclose(np.diff(y), -10)
    ):
        raise ValueError("Expected the verified 10 m ascending-x/descending-y UTM source grid.")
    coordinates = source_grid["coordinates"]
    origin_x, origin_y = coordinates["x_first"] - 5, coordinates["y_first"] + 5
    left = origin_x + math.ceil((x[0] - 5 - origin_x) / spacing) * spacing
    top = origin_y - math.ceil((origin_y - y[0] - 5) / spacing) * spacing
    width = math.floor((x[-1] + 5 - left) / spacing)
    height = math.floor((top - y[-1] + 5) / spacing)
    if width <= 0 or height <= 0:
        raise ValueError("The cached AOI is smaller than a complete analysis cell.")
    bounds = [left, top - height * spacing, left + width * spacing, top]
    to_geographic = Transformer.from_crs(32651, 4326, always_xy=True)
    xx, yy = to_geographic.transform(
        [bounds[0], bounds[0], bounds[2], bounds[2]],
        [bounds[1], bounds[3], bounds[1], bounds[3]],
    )
    return {
        "width": width,
        "height": height,
        "bounds": bounds,
        "bounds_wgs84": [min(xx), min(yy), max(xx), max(yy)],
        "pixel_side_m": spacing,
        "epsg": 32651,
        "transform": [spacing, 0, left, 0, -spacing, top],
        "pixel_area_m2": spacing**2,
        "area_basis": "Projected UTM pixel squares; grid spacing is not effective resolution",
    }


def linear_multilook(cache: Any, grid: dict[str, Any], channel: str) -> np.ndarray:
    """Area-average linear calibrated power; invalid source cells remain excluded."""
    if channel not in {"HH", "HV"}:
        raise ValueError("Only measured HH/HV channels are supported.")
    power = np.asarray(cache[channel * 2], dtype=np.float64).copy()
    mask = np.asarray(cache["mask"])
    if power.shape != mask.shape or power.shape != (len(cache["y"]), len(cache["x"])):
        raise ValueError("Power, mask and source coordinates must align.")
    valid = (mask > 0) & (mask < 255) & np.isfinite(power) & (power > 0)
    power[~valid] = np.nan
    destination = np.full((grid["height"], grid["width"]), np.nan)
    reproject(
        power,
        destination,
        src_transform=Affine(10, 0, float(cache["x"][0]) - 5, 0, -10, float(cache["y"][0]) + 5),
        src_crs="EPSG:32651",
        dst_transform=Affine(*grid["transform"]),
        dst_crs="EPSG:32651",
        src_nodata=np.nan,
        dst_nodata=np.nan,
        resampling=Resampling.average,
        num_threads=1,
    )
    return destination


def analysis_masks(
    reservoir: Reservoir, feature: dict[str, Any], grid: dict[str, Any]
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Exact OSM polygon (zero buffer), bbox diagnostic mask and exterior reference."""
    transform = Affine(*grid["transform"])
    projected = transform_geom("EPSG:4326", "EPSG:32651", feature["geometry"])
    polygon = rasterize(
        [(projected, 1)],
        out_shape=(grid["height"], grid["width"]),
        transform=transform,
        dtype="uint8",
        all_touched=False,
    )
    south, north, west, east = reservoir["bbox"]
    to_native = Transformer.from_crs(4326, 32651, always_xy=True)
    xx, yy = to_native.transform([west, east, west, east], [south, south, north, north])
    xs = grid["bounds"][0] + (np.arange(grid["width"]) + 0.5) * grid["pixel_side_m"]
    ys = grid["bounds"][3] - (np.arange(grid["height"]) + 0.5) * grid["pixel_side_m"]
    bbox = (
        (xs[None, :] >= min(xx))
        & (xs[None, :] <= max(xx))
        & (ys[:, None] >= min(yy))
        & (ys[:, None] <= max(yy))
    )
    ring = ~bbox
    if not polygon.any() or not ring.any():
        raise ValueError("The AOI must include polygon pixels and an exterior reference ring.")
    return polygon, bbox.astype(np.uint8), ring


def reference_median_db(power: np.ndarray, ring: np.ndarray) -> float:
    """Return log10(median linear power), deliberately not median of dB means."""
    if power.shape != ring.shape:
        raise ValueError("Reference mask and power must align.")
    samples = power[ring & np.isfinite(power) & (power > 0)]
    if samples.size < 2:
        raise ValueError("At least two valid exterior reference pixels are required.")
    return float(10 * np.log10(np.median(samples)))


def relative_area(
    pixels: np.ndarray,
    mask: np.ndarray,
    land_median_db: float,
    pixel_area: float,
    ratio: float = THRESHOLD_RATIO,
) -> tuple[float, float, float]:
    """Classify exported analysis bytes for exact frontend/backend reproducibility."""
    if not math.isfinite(land_median_db) or not math.isfinite(ratio) or not 0 < ratio <= 1:
        raise ValueError("Use a finite reference and a ratio in (0, 1].")
    return tuple(
        water_area_km2(pixels, mask, land_median_db + 10 * math.log10(value), pixel_area)
        if value > 0
        else 0.0
        for value in (ratio, max(0, ratio - 0.1), min(1, ratio + 0.1))
    )


def prepare_analysis(
    cache: Any, reservoir: Reservoir, feature: dict[str, Any], source_grid: dict[str, Any]
) -> dict[str, Any]:
    grid = native_grid(cache, source_grid, ANALYSIS_SPACING)
    mask, _, ring = analysis_masks(reservoir, feature, grid)
    linear = {pol: linear_multilook(cache, grid, pol) for pol in ("HH", "HV")}
    return {
        "grid": grid,
        "mask": mask,
        "frames": {pol: quantize_db(power_to_db(values)) for pol, values in linear.items()},
        "land_median_db": {
            pol: reference_median_db(values, ring) for pol, values in linear.items()
        },
        "reference_pixels": {
            pol: int(np.count_nonzero(ring & np.isfinite(values))) for pol, values in linear.items()
        },
    }


def outline_on_native(feature: dict[str, Any], grid: dict[str, Any]) -> list[list[list[float]]]:
    geometry = feature["geometry"]
    polygons = (
        [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    )
    transformer = Transformer.from_crs(4326, grid["epsg"], always_xy=True)
    return [
        [
            [
                round((x - grid["bounds"][0]) / grid["pixel_side_m"], 3),
                round((grid["bounds"][3] - y) / grid["pixel_side_m"], 3),
            ]
            for x, y in (transformer.transform(lon, lat) for lon, lat in ring)
        ]
        for polygon in polygons
        for ring in polygon
    ]


def display_mapping(analysis: dict[str, Any], display: dict[str, Any]) -> tuple[list[float], float]:
    """Affine corner mapping; record projection curvature residual at fourth corner."""
    transform = Transformer.from_crs(analysis["epsg"], display["epsg"], always_xy=True)
    left, bottom, right, top = analysis["bounds"]
    xx, yy = transform.transform([left, right, left, right], [top, top, bottom, bottom])
    spacing = display["pixel_side_mercator_m"]
    x = [(v - display["bounds"][0]) / spacing for v in xx]
    y = [(display["bounds"][3] - v) / spacing for v in yy]
    width, height = analysis["width"], analysis["height"]
    matrix = [
        (x[1] - x[0]) / width,
        (y[1] - y[0]) / width,
        (x[2] - x[0]) / height,
        (y[2] - y[0]) / height,
        x[0],
        y[0],
    ]
    error = math.hypot(x[3] - (x[1] + x[2] - x[0]), y[3] - (y[1] + y[2] - y[0]))
    return matrix, error
