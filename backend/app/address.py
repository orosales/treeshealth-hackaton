from __future__ import annotations

import asyncio

import httpx

NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
_cache: dict[tuple[float, float], str | None] = {}
_search_cache: dict[str, list[dict[str, float | str]]] = {}
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


async def search_halifax_locations(query: str) -> list[dict[str, float | str]]:
    """Search named places inside HRM through the server-side Nominatim client."""
    normalized = " ".join(query.split()).strip()
    if len(normalized) < 2:
        return []
    cache_key = normalized.casefold()
    async with _lock:
        if cache_key in _search_cache:
            return _search_cache[cache_key]
    params = {
        "q": f"{normalized}, Halifax Regional Municipality, Nova Scotia, Canada",
        "format": "jsonv2",
        "limit": 5,
        "addressdetails": 1,
        "viewbox": "-64.1,45.0,-63.3,44.3",
        "bounded": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "HalifaxTreeScreeningMVP/0.1"}) as client:
            response = await client.get(NOMINATIM_SEARCH_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError):
        return []
    results = []
    for item in payload:
        try:
            latitude, longitude = float(item["lat"]), float(item["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if 44.3 <= latitude <= 45.0 and -64.1 <= longitude <= -63.3:
            results.append({"label": item.get("display_name", normalized), "latitude": latitude, "longitude": longitude})
    async with _lock:
        _search_cache[cache_key] = results
    return results
