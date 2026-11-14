"""Spherical boundary sanity checks, unrelated to radar-derived water area."""

import math
from typing import Any

from .models import RESERVOIRS

AUTHALIC_RADIUS_M = 6_371_007.1809
FRAME = [(123.13654, 23.96878), (122.56238, 25.98372), (120.13361, 25.38166), (120.73217, 23.37558)]


def ring_area_km2(ring: list[list[float]]) -> float:
    integral = 0.0
    for first, second in zip(ring, ring[1:], strict=False):
        lon_delta = math.radians(second[0] - first[0])
        integral += lon_delta * (
            math.sin(math.radians(first[1])) + math.sin(math.radians(second[1]))
        )
    return abs(integral) * AUTHALIC_RADIUS_M**2 / 2 / 1_000_000


def inside_frame(point: tuple[float, float]) -> bool:
    longitude, latitude = point
    inside = False
    for first, second in zip(FRAME, FRAME[1:] + FRAME[:1], strict=True):
        if (first[1] > latitude) != (second[1] > latitude):
            crossing = first[0] + (latitude - first[1]) * (second[0] - first[0]) / (
                second[1] - first[1]
            )
            if longitude < crossing:
                inside = not inside
    return inside


def validate_geometry(collection: dict[str, Any]) -> list[dict[str, Any]]:
    features = {str(item["properties"]["osm_id"]): item for item in collection["features"]}
    result = []
    for reservoir in RESERVOIRS:
        osm_id = reservoir["osm"].split("/")[1]
        if osm_id not in features:
            raise ValueError(f"OSM response omitted {reservoir['key']} ({osm_id}).")
        geometry = features[osm_id]["geometry"]
        if geometry["type"] == "Polygon":
            polygons = [geometry["coordinates"]]
        elif geometry["type"] == "MultiPolygon":
            polygons = geometry["coordinates"]
        else:
            raise ValueError(f"Expected Polygon or MultiPolygon for {reservoir['key']}.")
        area = sum(
            ring_area_km2(polygon[0]) - sum(ring_area_km2(hole) for hole in polygon[1:])
            for polygon in polygons
        )
        relative_error = abs(area - reservoir["osm_area_km2"]) / reservoir["osm_area_km2"]
        south, north, west, east = reservoir["bbox"]
        bbox_inside = all(
            inside_frame((lon, lat)) for lon in (west, east) for lat in (south, north)
        )
        if relative_error > 0.01 or not bbox_inside:
            raise ValueError(
                f"Boundary sanity check failed for {reservoir['key']}; review OSM changes."
            )
        result.append(
            {
                "reservoir": reservoir["key"],
                "area_km2": area,
                "reference_osm_area_km2": reservoir["osm_area_km2"],
                "relative_error": relative_error,
                "bbox_inside_frame": bbox_inside,
            }
        )
    return result
