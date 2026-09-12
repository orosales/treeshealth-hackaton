from __future__ import annotations

import asyncio

import httpx

NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
_cache: dict[tuple[float, float], str | None] = {}
_lock = asyncio.Lock()


async def approximate_address(latitude: float, longitude: float) -> str | None:
    """Return a nearest-address label for a selected public-tree coordinate."""
    cache_key = (round(latitude, 5), round(longitude, 5))
    async with _lock:
        if cache_key in _cache:
            return _cache[cache_key]
    params = {"lat": latitude, "lon": longitude, "format": "jsonv2", "zoom": 18, "addressdetails": 1}
    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "HalifaxTreeScreeningMVP/0.1"}) as client:
            response = await client.get(NOMINATIM_REVERSE_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError):
        return None
    address = payload.get("address") or {}
    road = address.get("road") or address.get("pedestrian") or address.get("neighbourhood")
    number = address.get("house_number")
    label = " ".join(part for part in (number, road) if part) or payload.get("display_name")
    async with _lock:
        _cache[cache_key] = label
    return label
