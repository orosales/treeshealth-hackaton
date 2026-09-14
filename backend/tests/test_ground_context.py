import asyncio
from unittest.mock import AsyncMock, patch

from app.ground_context import get_ground_context
from app.mapillary import freshness_for_date
from app.models import GroundContextImage, StreetViewImage


def test_freshness_handles_month_precision_and_missing_dates():
    assert freshness_for_date(None) == "UNKNOWN"
    assert freshness_for_date("2000-01") == "HISTORICAL"


def mapillary_image(capture_date):
    return GroundContextImage(
        provider="MAPILLARY", source="Mapillary (crowdsourced)", capture_date=capture_date,
        image_url="/api/mapillary/image/123", freshness="RECENT",
    )


def street_view_image(capture_date):
    return StreetViewImage(capture_date=capture_date, panorama_id="pano", panorama_latitude=44.65, panorama_longitude=-63.58)


def select(mapillary, street_view):
    with patch("app.ground_context.get_mapillary_context", AsyncMock(return_value=mapillary)), patch(
        "app.ground_context.get_street_view", AsyncMock(return_value=street_view)
    ):
        return asyncio.run(get_ground_context(44.65, -63.58))


def test_newer_mapillary_image_wins():
    mapillary = mapillary_image("2024-05-01T00:00:00+00:00")
    context, street_view = select(mapillary, street_view_image("2019-07"))

    assert context == mapillary
    assert street_view is None


def test_newer_google_image_wins_over_older_mapillary():
    street_view = street_view_image("2016-09")
    context, selected_street_view = select(mapillary_image("2015-09-19T15:19:25+00:00"), street_view)

    assert context is not None
    assert context.provider == "GOOGLE_STREET_VIEW"
    assert selected_street_view == street_view


def test_dated_image_wins_over_undated_image():
    context, _ = select(mapillary_image(None), street_view_image("2019-07"))

    assert context is not None
    assert context.provider == "GOOGLE_STREET_VIEW"


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
