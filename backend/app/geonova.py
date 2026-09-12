from __future__ import annotations

import os
from math import cos, radians
from urllib.parse import urlencode

import httpx

from .models import AerialImage, AreaBounds

DEFAULT_SERVICE = "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer"


def bbox_wgs84(latitude: float, longitude: float, radius_m: float = 120) -> list[float]:
    # GeoNOVA's fused orthophoto cache tops out near 0.3 m/pixel. A 240 m
    # context window at 640 px stays inside that scale instead of returning
    # the blank tile ArcGIS emits for requests zoomed beyond the cache.
    lat_delta = radius_m / 111_320
    lon_delta = radius_m / (111_320 * max(0.1, abs(cos(radians(latitude)))))
    return [longitude - lon_delta, latitude - lat_delta, longitude + lon_delta, latitude + lat_delta]


def export_bbox_url(bbox: list[float], size: int = 640) -> str:
    params = {
        "bbox": ",".join(f"{value:.6f}" for value in bbox),
        "bboxSR": 4326,
        "imageSR": 4326,
        "size": f"{size},{size}",
        "format": "jpg",
        "transparent": "false",
        "f": "image",
    }
    service = os.getenv("GEONOVA_MAPSERVER_URL", DEFAULT_SERVICE).rstrip("/")
    return f"{service}/export?{urlencode(params)}"


def export_url(latitude: float, longitude: float) -> tuple[str, list[float]]:
    bbox = bbox_wgs84(latitude, longitude)
    return export_bbox_url(bbox), bbox


def area_bbox(bounds: AreaBounds, minimum_width_m: float = 380) -> list[float]:
    """Return the selected bounds expanded enough to stay inside the imagery cache scale."""
    centre_lat = (bounds.south + bounds.north) / 2
    centre_lon = (bounds.west + bounds.east) / 2
    min_lat_span = minimum_width_m / 111_320
    min_lon_span = minimum_width_m / (111_320 * max(0.1, abs(cos(radians(centre_lat)))))
    lat_span = max(bounds.north - bounds.south, min_lat_span)
    lon_span = max(bounds.east - bounds.west, min_lon_span)
    return [centre_lon - lon_span / 2, centre_lat - lat_span / 2, centre_lon + lon_span / 2, centre_lat + lat_span / 2]


async def get_aerial_image(latitude: float, longitude: float) -> AerialImage | None:
    url, bbox = export_url(latitude, longitude)
    # Validate availability server-side before returning a browser-consumable URL.
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            response = await client.get(url)
            if response.is_success and response.headers.get("content-type", "").startswith("image/"):
                return AerialImage(image_url=url, source="GeoNOVA / Nova Scotia Orthophoto", bbox=bbox)
    except httpx.HTTPError:
        pass
    return None


async def get_area_aerial_image(bounds: AreaBounds) -> AerialImage | None:
    bbox = area_bbox(bounds)
    url = export_bbox_url(bbox, size=1280)
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
            response = await client.get(url)
            if response.is_success and response.headers.get("content-type", "").startswith("image/") and len(response.content) > 15_000:
                return AerialImage(image_url=url, source="GeoNOVA / Nova Scotia Orthophoto", bbox=bbox)
    except httpx.HTTPError:
        pass
    return None
