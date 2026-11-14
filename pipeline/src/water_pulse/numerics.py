"""Pure numeric primitives; browse images must never be passed into these functions."""

import math

import numpy as np
from numpy.typing import ArrayLike, NDArray


def power_to_db(power: ArrayLike) -> NDArray[np.float64]:
    values = np.asarray(power, dtype=np.float64)
    result = np.full(values.shape, np.nan)
    valid = np.isfinite(values) & (values > 0)
    result[valid] = 10 * np.log10(values[valid])
    return result


def quantize_db(db: ArrayLike) -> NDArray[np.uint8]:
    values = np.asarray(db, dtype=np.float64)
    result = np.zeros(values.shape, dtype=np.uint8)
    valid = np.isfinite(values)
    # Match JavaScript Math.round for the non-negative quantization coordinate.
    result[valid] = np.clip(np.floor((values[valid] + 35) / 40 * 254 + 0.5) + 1, 1, 255)
    return result


def decode_db(quantized: ArrayLike) -> NDArray[np.float64]:
    values = np.asarray(quantized)
    if not np.all(np.isfinite(values)) or np.any((values < 0) | (values > 255)):
        raise ValueError("Quantized values must be bytes from 0 to 255.")
    if np.any(values != np.floor(values)):
        raise ValueError("Quantized values must be integers.")
    return np.where(values > 0, -35 + (values.astype(float) - 1) * 40 / 254, np.nan)


def ground_pixel_area(pixel_spacing_3857_m: float, latitude_degrees: float) -> float:
    if not math.isfinite(pixel_spacing_3857_m) or pixel_spacing_3857_m <= 0:
        raise ValueError("Pixel spacing must be finite and positive.")
    if not math.isfinite(latitude_degrees) or not -85 < latitude_degrees < 85:
        raise ValueError("Latitude must lie within the usable Web Mercator range.")
    return (pixel_spacing_3857_m * math.cos(math.radians(latitude_degrees))) ** 2


def water_area_km2(
    quantized: ArrayLike, mask: ArrayLike, threshold_db: float, pixel_area_m2: float
) -> float:
    values = np.asarray(quantized)
    analysis_mask = np.asarray(mask)
    if values.shape != analysis_mask.shape:
        raise ValueError("Raster and analysis mask must have the same shape.")
    if not np.all((analysis_mask == 0) | (analysis_mask == 1)):
        raise ValueError("Analysis mask must contain only 0 or 1.")
    if not math.isfinite(threshold_db):
        raise ValueError("Threshold must be finite.")
    if not math.isfinite(pixel_area_m2) or pixel_area_m2 <= 0:
        raise ValueError("Ground pixel area must be finite and positive.")
    decoded = decode_db(values)
    water = (analysis_mask == 1) & np.isfinite(decoded) & (decoded < threshold_db)
    return float(np.count_nonzero(water) * pixel_area_m2 / 1_000_000)


def otsu_threshold(db: ArrayLike) -> float:
    """Return pooled Otsu split, constrained to the project range [-24, -14] dB."""
    values = np.asarray(db, dtype=float)
    values = values[np.isfinite(values)]
    if values.size < 2 or np.ptp(values) == 0:
        raise ValueError("Otsu requires at least two distinct valid samples.")
    counts, edges = np.histogram(values, bins=256, range=(float(values.min()), float(values.max())))
    centers = (edges[:-1] + edges[1:]) / 2
    weights = counts.astype(float)
    cumulative = np.cumsum(weights)
    moments = np.cumsum(weights * centers)
    remaining = cumulative[-1] - cumulative
    variance = np.zeros(256)
    valid = (cumulative > 0) & (remaining > 0)
    variance[valid] = (moments[-1] * cumulative[valid] - moments[valid] * cumulative[-1]) ** 2 / (
        cumulative[valid] * remaining[valid]
    )
    best = np.flatnonzero(variance == variance.max())
    # A plateau between modes has many equally valid splits; use its midpoint.
    threshold = float((edges[best[0] + 1] + edges[best[-1] + 1]) / 2)
    return float(np.clip(threshold, -24, -14))
