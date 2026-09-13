from __future__ import annotations

import os
from datetime import datetime, timezone
from math import atan2, cos, degrees, radians, sin

import httpx

from .models import GroundContextImage

GRAPH_URL = "https://graph.mapillary.com"


def _token() -> str | None:
    return os.getenv("MAPILLARY_ACCESS_TOKEN")


def freshness_for_date(capture_date: str | None) -> str:
    if not capture_date:
        return "UNKNOWN"
    try:
        normalized = capture_date + "-01" if len(capture_date) == 7 else capture_date
        captured = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
        if captured.tzinfo is None:
            captured = captured.replace(tzinfo=timezone.utc)
        age_days = (datetime.now(timezone.utc) - captured).days
    except (ValueError, TypeError):
        return "UNKNOWN"
    if age_days <= 365:
        return "RECENT"
    if age_days <= 3 * 365:
        return "AGING"
    return "HISTORICAL"


def _bearing(source_latitude: float, source_longitude: float, target_latitude: float, target_longitude: float) -> float:
    source_lat, target_lat = radians(source_latitude), radians(target_latitude)
    delta_longitude = radians(target_longitude - source_longitude)
    x = sin(delta_longitude) * cos(target_lat)
    y = cos(source_lat) * sin(target_lat) - sin(source_lat) * cos(target_lat) * cos(delta_longitude)
    return (degrees(atan2(x, y)) + 360) % 360


def _faces_target(item: dict, latitude: float, longitude: float) -> bool:
    coordinates = (item.get("geometry") or {}).get("coordinates") or []
    compass = item.get("compass_angle")
    if len(coordinates) < 2 or compass is None:
        return False
    target_bearing = _bearing(coordinates[1], coordinates[0], latitude, longitude)
    difference = abs((float(compass) - target_bearing + 180) % 360 - 180)
    return difference <= 100


async def get_mapillary_context(latitude: float, longitude: float, radius_m: float = 75) -> GroundContextImage | None:
    """Return the newest nearby crowdsourced image, never exposing the access token."""
    token = _token()
    if not token:
        return None
    lat_delta = radius_m / 111_320
    lon_delta = radius_m / max(1, 111_320 * cos(radians(latitude)))
    params = {
        "access_token": token,
        "bbox": f"{longitude-lon_delta},{latitude-lat_delta},{longitude+lon_delta},{latitude+lat_delta}",
        "fields": "id,captured_at,geometry,compass_angle",
        "limit": 50,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{GRAPH_URL}/images", params=params)
            response.raise_for_status()
            images = response.json().get("data", [])
    except (httpx.HTTPError, ValueError, AttributeError):
        return None
    candidates = [item for item in images if item.get("id") and item.get("captured_at")]
    if not candidates:
        return None
    tree_facing = [item for item in candidates if _faces_target(item, latitude, longitude)]
    newest = max(tree_facing or candidates, key=lambda item: item["captured_at"])
    captured = datetime.fromtimestamp(newest["captured_at"] / 1000, tz=timezone.utc).isoformat()
    coordinates = (newest.get("geometry") or {}).get("coordinates") or [None, None]
    return GroundContextImage(
        provider="MAPILLARY",
        source="Mapillary (crowdsourced)",
        capture_date=captured,
        image_url=f"/api/mapillary/image/{newest['id']}",
        latitude=coordinates[1],
        longitude=coordinates[0],
        compass_angle=newest.get("compass_angle"),
        freshness=freshness_for_date(captured),
    )


async def get_mapillary_image(image_id: str) -> tuple[bytes, str] | None:
    token = _token()
    if not token or not image_id.isdigit():
        return None
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            metadata = await client.get(
                f"{GRAPH_URL}/{image_id}",
                params={"access_token": token, "fields": "thumb_2048_url"},
            )
            metadata.raise_for_status()
            thumbnail_url = metadata.json().get("thumb_2048_url")
            if not thumbnail_url:
                return None
            image = await client.get(thumbnail_url)
            image.raise_for_status()
    except (httpx.HTTPError, ValueError, AttributeError):
        return None
    content_type = image.headers.get("content-type", "image/jpeg").split(";", 1)[0]
    return image.content, content_type
