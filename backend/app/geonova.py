from __future__ import annotations

import os
from math import cos, radians
from urllib.parse import urlencode

import httpx

from .models import AerialImage

DEFAULT_SERVICE = "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer"


def bbox_wgs84(latitude: float, longitude: float, radius_m: float = 35) -> list[float]:
    # The public WGS84 service accepts degrees; the approximation is plenty for a 70 m context image.
    lat_delta = radius_m / 111_320
    lon_delta = radius_m / (111_320 * max(0.1, abs(cos(radians(latitude)))))
    return [longitude - lon_delta, latitude - lat_delta, longitude + lon_delta, latitude + lat_delta]


def export_url(latitude: float, longitude: float) -> tuple[str, list[float]]:
    bbox = bbox_wgs84(latitude, longitude)
    params = {
        "bbox": ",".join(f"{value:.4f}" for value in bbox),
        "bboxSR": 4326,
        "imageSR": 4326,
        "size": "640,640",
        "format": "jpg",
        "transparent": "false",
        "f": "image",
    }
    service = os.getenv("GEONOVA_MAPSERVER_URL", DEFAULT_SERVICE).rstrip("/")
    return f"{service}/export?{urlencode(params)}", bbox


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
