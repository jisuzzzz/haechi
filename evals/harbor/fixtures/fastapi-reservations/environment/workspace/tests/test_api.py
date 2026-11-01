from fastapi.testclient import TestClient
from app.main import create_app


def test_reserve_and_inventory(tmp_path):
    client = TestClient(create_app(tmp_path / "stock.sqlite3"))
    headers = {"X-Tenant": "tenant-a", "Idempotency-Key": "one"}
    response = client.post("/reservations", headers=headers,
                           json={"lines": [{"sku": "widget", "quantity": 2}]})
    assert response.status_code == 201
    assert response.json()["status"] == "reserved"
    assert client.get("/reservations/" + response.json()["id"], headers=headers).json() == response.json()
    assert client.get("/inventory", headers=headers).json()["items"][1] == {"sku": "widget", "available": 3}


def test_invalid_quantity(tmp_path):
    client = TestClient(create_app(tmp_path / "stock.sqlite3"))
    response = client.post("/reservations", headers={"X-Tenant": "tenant-a", "Idempotency-Key": "one"},
                           json={"lines": [{"sku": "widget", "quantity": 0}]})
    assert response.status_code == 422
    assert client.get("/health").json() == {"status": "ok"}
