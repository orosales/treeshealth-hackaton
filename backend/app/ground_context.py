from __future__ import annotations

import asyncio

from .mapillary import freshness_for_date, get_mapillary_context, get_mapillary_image, parse_capture_date
from .models import GroundContextImage, StreetViewImage
from .streetview import bearing_to_target, get_street_view, get_street_view_image


def google_context(street_view: StreetViewImage, latitude: float, longitude: float) -> GroundContextImage:
    capture_date = street_view.capture_date
    freshness = freshness_for_date(capture_date)
    return GroundContextImage(
        provider="GOOGLE_STREET_VIEW",
        source=street_view.source,
        capture_date=capture_date,
        image_url=f"/api/streetview/image?latitude={latitude}&longitude={longitude}",
        latitude=street_view.panorama_latitude,
        longitude=street_view.panorama_longitude,
        freshness=freshness,
    )


async def get_ground_context(latitude: float, longitude: float) -> tuple[GroundContextImage | None, StreetViewImage | None]:
    """Query both providers and return whichever image was captured most recently."""
    mapillary, street_view = await asyncio.gather(get_mapillary_context(latitude, longitude), get_street_view(latitude, longitude))
    google = google_context(street_view, latitude, longitude) if street_view else None
    if not mapillary or not google:
        return (mapillary, None) if mapillary else (google, street_view)
    mapillary_date, google_date = parse_capture_date(mapillary.capture_date), parse_capture_date(google.capture_date)
    if google_date and (not mapillary_date or google_date > mapillary_date):
        return google, street_view
    return mapillary, None


async def get_google_context(latitude: float, longitude: float) -> tuple[GroundContextImage | None, StreetViewImage | None]:
    street_view = await get_street_view(latitude, longitude)
    return (google_context(street_view, latitude, longitude), street_view) if street_view else (None, None)


async def get_ground_context_image(
    context: GroundContextImage | None,
    street_view: StreetViewImage | None,
    latitude: float,
    longitude: float,
) -> tuple[bytes, str] | None:
    if not context:
        return None
    if context.provider == "MAPILLARY":
        return await get_mapillary_image(context.image_url.rsplit("/", 1)[-1])
    if street_view:
        heading = bearing_to_target(street_view.panorama_latitude, street_view.panorama_longitude, latitude, longitude)
        return await get_street_view_image(street_view.panorama_id, heading)
    return None


async def get_ground_evidence(
    latitude: float, longitude: float
) -> tuple[GroundContextImage | None, StreetViewImage | None, tuple[bytes, str] | None]:
    """Select metadata and bytes together, retrying Google if Mapillary retrieval fails."""
    context, street_view = await get_ground_context(latitude, longitude)
    image = await get_ground_context_image(context, street_view, latitude, longitude)
    if context and context.provider == "MAPILLARY" and not image:
        context, street_view = await get_google_context(latitude, longitude)
        image = await get_ground_context_image(context, street_view, latitude, longitude)
    return context, street_view, image
