from __future__ import annotations

import httpx

from math import asin, cos, radians, sin, sqrt

from .models import AerialTreeDetection, AreaBounds

HALIFAX_PUBLIC_TREES_URL = "https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/Public_Trees/FeatureServer/0/query"
MAX_CANDIDATES = 8
MAX_AERIAL_CANDIDATES = 4


def validate_bounds(bounds: AreaBounds) -> None:
    if not (bounds.south < bounds.north and bounds.west < bounds.east):
        raise ValueError("The selected area is invalid.")
    if bounds.north - bounds.south > 0.05 or bounds.east - bounds.west > 0.07:
        raise ValueError("Select a smaller area (about 5 km across or less) for this demo scan.")


async def public_trees(bounds: AreaBounds) -> tuple[int, list[tuple[float, float, str | None, str | None, str | None]]]:
    geometry = f"{bounds.west},{bounds.south},{bounds.east},{bounds.north}"
    base_params = {
        "where": "1=1", "geometry": geometry, "geometryType": "esriGeometryEnvelope", "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects", "returnGeometry": "true", "outSR": "4326", "f": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            count_response = await client.get(HALIFAX_PUBLIC_TREES_URL, params={**base_params, "returnCountOnly": "true"})
            count_response.raise_for_status()
            total = int(count_response.json().get("count", 0))
            response = await client.get(HALIFAX_PUBLIC_TREES_URL, params={**base_params, "outFields": "ASSETID,TREEID,FCODE,WIRES", "resultRecordCount": str(MAX_CANDIDATES), "orderByFields": "OBJECTID"})
            response.raise_for_status()
            features = response.json().get("features", [])
    except (httpx.HTTPError, ValueError) as error:
        raise RuntimeError("Halifax Public Trees inventory is temporarily unavailable. Please retry.") from error
    trees = []
    for feature in features:
        point = feature.get("geometry") or {}
        if "x" in point and "y" in point:
            attributes = feature.get("attributes") or {}
            trees.append((
                point["y"], point["x"], attributes.get("ASSETID") or attributes.get("TREEID"),
                attributes.get("FCODE"), attributes.get("WIRES"),
            ))
    return total, trees


def distance_metres(first: tuple[float, float], second: tuple[float, float]) -> float:
    lat1, lon1 = map(radians, first)
    lat2, lon2 = map(radians, second)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 6_371_000 * 2 * asin(sqrt(value))


def aerial_candidate_locations(
    detections: list[AerialTreeDetection],
    image_bbox: list[float],
    selected_bounds: AreaBounds,
    inventory: list[tuple[float, float, str | None, str | None, str | None]],
    minimum_inventory_distance_m: float = 18,
) -> list[tuple[float, float, str]]:
    west, south, east, north = image_bbox
    locations: list[tuple[float, float, str]] = []
    inventory_points = [(tree[0], tree[1]) for tree in inventory]
    for detection in sorted(detections, key=lambda item: item.confidence, reverse=True):
        longitude = west + detection.x_ratio * (east - west)
        latitude = north - detection.y_ratio * (north - south)
        point = (latitude, longitude)
        if not (selected_bounds.south <= latitude <= selected_bounds.north and selected_bounds.west <= longitude <= selected_bounds.east):
            continue
        if detection.confidence < 0.65:
            continue
        if any(distance_metres(point, existing) < minimum_inventory_distance_m for existing in inventory_points):
            continue
        if any(distance_metres(point, (existing[0], existing[1])) < minimum_inventory_distance_m for existing in locations):
            continue
        locations.append((latitude, longitude, detection.evidence))
        if len(locations) == MAX_AERIAL_CANDIDATES:
            break
    return locations
