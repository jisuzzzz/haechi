import os

import pytest
from fastapi.testclient import TestClient

from app.main import app, connect, get_db


@pytest.fixture
def client():
    required = ["HAECHI_MYSQL_SOCKET", "HAECHI_MYSQL_USER", "HAECHI_MYSQL_DATABASE"]
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        pytest.fail("Disposable MySQL settings required: " + ", ".join(missing))
    # A temporary table belongs only to this connection and disappears on close.
    with connect() as db:
        with db.cursor() as cursor:
            cursor.execute("CREATE TEMPORARY TABLE items (id INT PRIMARY KEY, name VARCHAR(50))")
            cursor.execute("INSERT INTO items VALUES (%s, %s)", (1, "Sample widget"))
        app.dependency_overrides[get_db] = lambda: db
        try:
            with TestClient(app) as api:
                yield api
        finally:
            app.dependency_overrides.clear()


def test_item_reads_mysql_row(client):
    response = client.get("/items/1")
    assert response.status_code == 200
    assert response.json() == {"id": 1, "name": "Sample widget"}


def test_missing_item_returns_404(client):
    response = client.get("/items/999")
    assert response.status_code == 404
    assert response.json() == {"detail": "Item not found"}
