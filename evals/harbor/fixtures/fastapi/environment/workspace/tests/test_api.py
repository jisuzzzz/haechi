from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_page_items():
    response = client.get("/items", params={"offset": 1, "limit": 2})
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [2, 3]


def test_invalid_offset():
    assert client.get("/items", params={"offset": -1}).status_code == 422
