import asyncio
from unittest.mock import AsyncMock, patch

from app.ground_context import get_ground_context
from app.mapillary import freshness_for_date
from app.models import GroundContextImage, StreetViewImage


def test_freshness_handles_month_precision_and_missing_dates():
    assert freshness_for_date(None) == "UNKNOWN"
    assert freshness_for_date("2000-01") == "HISTORICAL"


def test_mapillary_is_preferred_without_calling_google():
    mapillary = GroundContextImage(
        provider="MAPILLARY", source="Mapillary (crowdsourced)", capture_date="2026-09-01T00:00:00+00:00",
        image_url="/api/mapillary/image/123", freshness="RECENT",
    )
    with patch("app.ground_context.get_mapillary_context", AsyncMock(return_value=mapillary)), patch(
        "app.ground_context.get_street_view", AsyncMock()
    ) as google:
        context, street_view = asyncio.run(get_ground_context(44.65, -63.58))

    assert context == mapillary
    assert street_view is None
    google.assert_not_awaited()


def test_google_is_the_fallback_when_mapillary_has_no_image():
    street_view = StreetViewImage(
        capture_date="2022-11", panorama_id="pano", panorama_latitude=44.65, panorama_longitude=-63.58
    )
    with patch("app.ground_context.get_mapillary_context", AsyncMock(return_value=None)), patch(
        "app.ground_context.get_street_view", AsyncMock(return_value=street_view)
    ):
        context, selected_street_view = asyncio.run(get_ground_context(44.65, -63.58))

    assert context is not None
    assert context.provider == "GOOGLE_STREET_VIEW"
    assert context.freshness == "HISTORICAL"
    assert selected_street_view == street_view
