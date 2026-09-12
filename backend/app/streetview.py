from __future__ import annotations

import os
from math import atan2, cos, degrees, radians, sin
from urllib.parse import urlencode

import httpx

from .models import StreetViewImage

METADATA_URL = "https://maps.googleapis.com/maps/api/streetview/metadata"
IMAGE_URL = "https://maps.googleapis.com/maps/api/streetview"


def _key() -> str | None:
    return os.getenv("GOOGLE_STREET_VIEW_API_KEY")


async def get_street_view(latitude: float, longitude: float) -> StreetViewImage | None:
    key = _key()
    if not key:
        return None
    params = {"location": f"{latitude:.6f},{longitude:.6f}", "key": key}
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(METADATA_URL, params=params)
            payload = response.json()
    except (httpx.HTTPError, ValueError):
        return None
    if response.is_error or payload.get("status") != "OK" or not payload.get("pano_id"):
        return None
    return StreetViewImage(
        panorama_id=payload["pano_id"],
        capture_date=payload.get("date"),
        copyright=payload.get("copyright"),
        panorama_latitude=payload["location"]["lat"],
        panorama_longitude=payload["location"]["lng"],
    )


def bearing_to_target(source_latitude: float, source_longitude: float, target_latitude: float, target_longitude: float) -> float:
    """Compass heading from a Street View panorama toward the selected tree point."""
    source_lat, target_lat = radians(source_latitude), radians(target_latitude)
    delta_longitude = radians(target_longitude - source_longitude)
    x = sin(delta_longitude) * cos(target_lat)
    y = cos(source_lat) * sin(target_lat) - sin(source_lat) * cos(target_lat) * cos(delta_longitude)
    return (degrees(atan2(x, y)) + 360) % 360


async def get_street_view_image(panorama_id: str, heading: float | None = None) -> tuple[bytes, str] | None:
    key = _key()
    if not key:
        return None
    params = {"pano": panorama_id, "size": "640x400", "fov": 90, "pitch": 0, "return_error_code": "true", "key": key}
    if heading is not None:
        params["heading"] = f"{heading:.1f}"
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(IMAGE_URL, params=params)
    except httpx.HTTPError:
        return None
    content_type = response.headers.get("content-type", "")
    if not response.is_success or not content_type.startswith("image/"):
        return None
    return response.content, content_type.split(";", 1)[0]


def image_proxy_url(latitude: float, longitude: float) -> str:
    return "/api/streetview/image?" + urlencode({"latitude": latitude, "longitude": longitude})
