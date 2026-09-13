import asyncio
from unittest.mock import patch

from app.models import AreaBounds
from app.satellite import get_satellite_context


class Response:
    def __init__(self, features):
        self.features = features

    def raise_for_status(self):
        return None

    def json(self):
        return {"features": self.features}


class Client:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, _url, json):
        collection = json["collections"][0]
        if collection == "sentinel-1-grd":
            return Response([{"properties": {"datetime": "2026-09-11T10:00:00Z"}}])
        return Response([{"properties": {"datetime": "2026-09-09T15:00:00Z", "eo:cloud_cover": 12.5}}])


def test_radar_and_optical_dates_stay_area_level_context():
    bounds = AreaBounds(south=44.64, west=-63.60, north=44.68, east=-63.55)
    with patch("app.satellite.httpx.AsyncClient", return_value=Client()):
        context = asyncio.run(get_satellite_context(bounds))

    assert context.status == "AVAILABLE"
    assert context.latest_radar_observation == "2026-09-11T10:00:00Z"
    assert context.latest_optical_observation == "2026-09-09T15:00:00Z"
    assert context.cloud_cover == 12.5
    assert "change model not run" in context.scope
