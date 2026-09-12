from __future__ import annotations

import httpx

from .models import AreaBounds

HALIFAX_PUBLIC_TREES_URL = "https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/Public_Trees/FeatureServer/0/query"
MAX_CANDIDATES = 8


def validate_bounds(bounds: AreaBounds) -> None:
    if not (bounds.south < bounds.north and bounds.west < bounds.east):
        raise ValueError("The selected area is invalid.")
    if bounds.north - bounds.south > 0.05 or bounds.east - bounds.west > 0.07:
        raise ValueError("Select a smaller area (about 5 km across or less) for this demo scan.")


async def public_trees(bounds: AreaBounds) -> tuple[int, list[tuple[float, float, str | None]]]:
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
            response = await client.get(HALIFAX_PUBLIC_TREES_URL, params={**base_params, "outFields": "ASSETID,TREEID", "resultRecordCount": str(MAX_CANDIDATES), "orderByFields": "OBJECTID"})
            response.raise_for_status()
            features = response.json().get("features", [])
    except (httpx.HTTPError, ValueError) as error:
        raise RuntimeError("Halifax Public Trees inventory is temporarily unavailable. Please retry.") from error
    trees = []
    for feature in features:
        point = feature.get("geometry") or {}
        if "x" in point and "y" in point:
            attributes = feature.get("attributes") or {}
            trees.append((point["y"], point["x"], attributes.get("ASSETID") or attributes.get("TREEID")))
    return total, trees
