"""Process calibrated GCOV power windows onto one reproducible reservoir grid.

All averaging and reprojection happens in linear power. ASF browse PNGs are
never accepted here; callers provide authenticated, cached HDF5 windows.
"""

import math
from collections.abc import Mapping, Sequence
from typing import Any

import numpy as np
from numpy.typing import NDArray
from pyproj import Transformer
from rasterio import Affine
from rasterio.features import rasterize
from rasterio.warp import Resampling, reproject, transform_geom
from scipy.ndimage import distance_transform_edt, uniform_filter

from .models import Reservoir
from .numerics import decode_db, ground_pixel_area, otsu_threshold, power_to_db, quantize_db

Grid = dict[str, Any]


def create_grid(
    reservoir: Reservoir,
    geojson_feature: Mapping[str, Any],
    date_count: int = 21,
    *,
    analysis_buffer_ground_m: float = 150,
) -> tuple[Grid, NDArray[np.uint8]]:
    """Return JSON-compatible EPSG:3857 grid metadata and a buffered analysis mask.

    Bounds are expanded by 500 ground metres and snapped to the output lattice.
    Pixel centres are fixed across dates. A channel exceeding 12 MiB across the
    requested date count uses 20 m ground spacing instead of 10 m.
    """
    if not isinstance(date_count, int) or date_count < 1:
        raise ValueError("date_count must be a positive integer.")
    if not math.isfinite(analysis_buffer_ground_m) or not 0 <= analysis_buffer_ground_m <= 150:
        raise ValueError("Analysis buffer must be finite and between 0 and 150 ground metres.")
    south, north, west, east = reservoir["bbox"]
    if not (-85 < south < north < 85 and -180 <= west < east <= 180):
        raise ValueError(f"Invalid geographic bounds for {reservoir['key']}.")
    latitude = (south + north) / 2
    latitude_factor = math.cos(math.radians(latitude))
    to_mercator = Transformer.from_crs(4326, 3857, always_xy=True)
    min_x, min_y = to_mercator.transform(west, south)
    max_x, max_y = to_mercator.transform(east, north)
    padding = 500 / latitude_factor

    def layout(ground_spacing: int) -> tuple[int, int, list[float], float]:
        spacing = ground_spacing / latitude_factor
        left = math.floor((min_x - padding) / spacing) * spacing
        bottom = math.floor((min_y - padding) / spacing) * spacing
        right = math.ceil((max_x + padding) / spacing) * spacing
        top = math.ceil((max_y + padding) / spacing) * spacing
        width = round((right - left) / spacing)
        height = round((top - bottom) / spacing)
        return width, height, [left, bottom, right, top], spacing

    ground_spacing = 10
    width, height, bounds, spacing = layout(ground_spacing)
    if width * height * date_count > 12 * 1024 * 1024:
        ground_spacing = 20
        width, height, bounds, spacing = layout(ground_spacing)
    if width * height > 50_000_000:
        raise ValueError(f"Grid for {reservoir['key']} is unexpectedly large; review bounds.")
    transform = Affine(spacing, 0, bounds[0], 0, -spacing, bounds[3])
    geometry = geojson_feature.get("geometry")
    if not geometry or geometry.get("type") not in {"Polygon", "MultiPolygon"}:
        raise ValueError(f"A Polygon or MultiPolygon is required for {reservoir['key']}.")
    projected = transform_geom("EPSG:4326", "EPSG:3857", geometry)
    polygon_mask = rasterize(
        [(projected, 1)],
        out_shape=(height, width),
        transform=transform,
        fill=0,
        dtype="uint8",
        all_touched=False,
    )
    if not polygon_mask.any():
        raise ValueError(f"The OSM polygon does not intersect the grid for {reservoir['key']}.")
    # Distances use the documented latitude-corrected ground spacing, not map metres.
    outside_distance = distance_transform_edt(polygon_mask == 0, sampling=ground_spacing)
    analysis_mask = (outside_distance <= analysis_buffer_ground_m).astype(np.uint8)
    to_wgs84 = Transformer.from_crs(3857, 4326, always_xy=True)
    west_out, south_out = to_wgs84.transform(bounds[0], bounds[1])
    east_out, north_out = to_wgs84.transform(bounds[2], bounds[3])
    grid: Grid = {
        "width": width,
        "height": height,
        "crs": "EPSG:3857",
        "epsg": 3857,
        "bounds": bounds,
        "bounds_wgs84": [west_out, south_out, east_out, north_out],
        "transform": list(transform)[:6],
        "pixel_side_mercator_m": spacing,
        "pixel_area_m2": ground_pixel_area(spacing, latitude),
        "ground_spacing_m": ground_spacing,
        "latitude": latitude,
        "analysis_buffer_ground_m": analysis_buffer_ground_m,
        "bbox_padding_ground_m": 500,
    }
    return grid, analysis_mask


def linear_mean_filter(
    power: NDArray[np.floating[Any]], valid: NDArray[np.bool_]
) -> NDArray[np.float64]:
    """Normalized 3×3 linear-power average, retaining original invalid centres."""
    values = np.asarray(power, dtype=np.float64)
    if values.ndim != 2 or values.shape != valid.shape:
        raise ValueError("Power and validity must be matching two-dimensional arrays.")
    usable = valid & np.isfinite(values) & (values > 0)
    numerator = uniform_filter(np.where(usable, values, 0.0), size=3, mode="constant")
    denominator = uniform_filter(usable.astype(np.float64), size=3, mode="constant")
    filtered = np.full(values.shape, np.nan, dtype=np.float64)
    np.divide(numerator, denominator, out=filtered, where=usable & (denominator > 0))
    return filtered


def _coordinate_spacing(values: NDArray[np.float64], name: str) -> float:
    if values.ndim != 1 or values.size < 2 or not np.isfinite(values).all():
        raise ValueError(f"Cached {name} coordinates must contain at least two finite centres.")
    differences = np.diff(values)
    spacing = float(differences[0])
    if spacing == 0 or not np.allclose(differences, spacing, rtol=1e-6, atol=1e-6):
        raise ValueError(f"Cached {name} coordinates must be regularly spaced and monotonic.")
    return spacing


def process_window(cache: Mapping[str, Any], grid: Grid) -> dict[str, NDArray[np.uint8]]:
    """Filter, bilinearly reproject, convert to dB, and quantize HH/HV windows.

    The observed GCOV subswath mask encodes 0 as invalid/partially focused and
    255 as outside the image; 1–254 are retained. Invalid source centres remain
    invalid after smoothing. Nearest-neighbour validity prevents interpolation
    from silently converting invalid source locations into observations.
    """
    x = np.asarray(cache["x"], dtype=np.float64)
    y = np.asarray(cache["y"], dtype=np.float64)
    dx, dy = _coordinate_spacing(x, "x"), _coordinate_spacing(y, "y")
    shape = (len(y), len(x))
    source_mask = np.asarray(cache["mask"])
    if source_mask.shape != shape:
        raise ValueError("Cached subswath mask shape differs from its coordinate arrays.")
    reverse_x, reverse_y = dx < 0, dy > 0
    if reverse_x:
        x = x[::-1]
    if reverse_y:
        y = y[::-1]
    source_transform = Affine(abs(dx), 0, x[0] - abs(dx) / 2, 0, -abs(dy), y[0] + abs(dy) / 2)
    source_epsg = int(np.asarray(cache["epsg"]).item())
    destination_transform = Affine(*grid["transform"])
    destination_shape = (int(grid["height"]), int(grid["width"]))
    destination_crs = grid.get("crs", "EPSG:3857")

    def orient(values: NDArray[Any]) -> NDArray[Any]:
        if reverse_y:
            values = values[::-1, :]
        if reverse_x:
            values = values[:, ::-1]
        return values

    source_mask = orient(source_mask)
    result: dict[str, NDArray[np.uint8]] = {}
    for polarization, dataset in (("HH", "HHHH"), ("HV", "HVHV")):
        power = np.asarray(cache[dataset], dtype=np.float64)
        if power.shape != shape:
            raise ValueError(f"Cached {dataset} shape differs from its coordinate arrays.")
        power = orient(power)
        valid = (source_mask > 0) & (source_mask < 255) & np.isfinite(power) & (power > 0)
        filtered = linear_mean_filter(power, valid)
        destination_power = np.full(destination_shape, np.nan, dtype=np.float64)
        reproject(
            source=filtered,
            destination=destination_power,
            src_transform=source_transform,
            src_crs=f"EPSG:{source_epsg}",
            dst_transform=destination_transform,
            dst_crs=destination_crs,
            src_nodata=np.nan,
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
            num_threads=1,
        )
        destination_valid = np.zeros(destination_shape, dtype=np.uint8)
        reproject(
            source=valid.astype(np.uint8),
            destination=destination_valid,
            src_transform=source_transform,
            src_crs=f"EPSG:{source_epsg}",
            dst_transform=destination_transform,
            dst_crs=destination_crs,
            src_nodata=0,
            dst_nodata=0,
            resampling=Resampling.nearest,
            num_threads=1,
        )
        destination_power[destination_valid == 0] = np.nan
        result[polarization] = quantize_db(power_to_db(destination_power))
    return result


def pooled_threshold(
    rasters: Sequence[NDArray[np.uint8]], analysis_mask: NDArray[np.uint8]
) -> float:
    """One fixed, pooled Otsu threshold per reservoir/channel, using exported bytes."""
    selected = np.asarray(analysis_mask) == 1
    samples: list[NDArray[np.float64]] = []
    for raster in rasters:
        if raster.shape != selected.shape:
            raise ValueError("A pooled raster has a different shape from the analysis mask.")
        samples.append(decode_db(raster[selected]))
    if not samples:
        raise ValueError("At least one calibrated raster is required for a pooled threshold.")
    return otsu_threshold(np.concatenate(samples))
