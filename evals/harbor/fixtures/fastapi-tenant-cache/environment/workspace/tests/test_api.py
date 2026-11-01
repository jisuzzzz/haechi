from fastapi.testclient import TestClient
from app.main import create_app


def test_isolated_page():
    client = TestClient(create_app())
    response = client.get("/items?offset=1&limit=2", headers={"X-Tenant": "tenant-a"})
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [2, 3]
    assert response.json()["total"] == 4


def test_isolated_write_and_detail():
    client = TestClient(create_app())
    headers = {"X-Tenant": "tenant-b"}
    response = client.post("/items", headers=headers, json={"name": "New", "category": "red"})
    assert response.status_code == 201
    assert client.get("/items/5", headers=headers).json() == response.json()
    assert client.get("/health").json() == {"status": "ok"}
