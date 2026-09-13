from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import httpx

from .models import AreaBounds, SatelliteContext

STAC_SEARCH_URL = "https://stac.dataspace.copernicus.eu/v1/search"


async def get_satellite_context(bounds: AreaBounds) -> SatelliteContext:
    """Return recent acquisition metadata only; do not infer individual-tree condition."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=90)
    base_payload = {
        "bbox": [bounds.west, bounds.south, bounds.east, bounds.north],
        "datetime": f"{start:%Y-%m-%dT%H:%M:%SZ}/{end:%Y-%m-%dT%H:%M:%SZ}",
        "limit": 2,
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "fields": {"include": ["id", "properties.datetime", "properties.eo:cloud_cover"]},
    }

    async def latest(client: httpx.AsyncClient, collection: str) -> list[dict]:
        try:
            response = await client.post(STAC_SEARCH_URL, json={**base_payload, "collections": [collection]})
            response.raise_for_status()
            return response.json().get("features", [])
        except (httpx.HTTPError, ValueError, AttributeError):
            return []

    async with httpx.AsyncClient(timeout=6) as client:
        radar_features, optical_features = await asyncio.gather(
            latest(client, "sentinel-1-grd"), latest(client, "sentinel-2-l2a")
        )
    if not radar_features and not optical_features:
        return SatelliteContext()
    radar = radar_features[0].get("properties", {}) if radar_features else {}
    optical = optical_features[0].get("properties", {}) if optical_features else {}
    previous = optical_features[1].get("properties", {}) if len(optical_features) > 1 else {}
    return SatelliteContext(
        latest_observation=optical.get("datetime") or radar.get("datetime"),
        previous_observation=previous.get("datetime"),
        latest_radar_observation=radar.get("datetime"),
        latest_optical_observation=optical.get("datetime"),
        cloud_cover=optical.get("eo:cloud_cover"),
        status="AVAILABLE",
    )
