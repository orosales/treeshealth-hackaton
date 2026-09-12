from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_endpoint():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_analysis_requires_halifax_location_before_calling_services():
    response = client.post(
        "/api/tree-analysis",
        data={"latitude": "43.7", "longitude": "-79.4"},
        files={"groundImage": ("tree.jpg", b"image", "image/jpeg")},
    )
    assert response.status_code == 422
    assert "Halifax" in response.json()["detail"]
