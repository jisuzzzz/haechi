"""Evaluator-owned real HTTP assertions; not copied into the agent workspace."""
import json
import os
from pathlib import Path
import sys
import tempfile
import traceback

WORKSPACE = Path(os.environ.get("HAECHI_FIXTURE_WORKSPACE", "/workspace"))
sys.path.insert(0, str(WORKSPACE))


def run_checks(actions):
    output = Path(os.environ.get("HAECHI_VERIFIER_OUTPUT", "/logs/verifier"))
    output.mkdir(parents=True, exist_ok=True)
    checks = []
    for name, action in actions:
        try:
            action()
            checks.append({"name": name, "passed": True})
        except Exception:
            checks.append({"name": name, "passed": False, "error": traceback.format_exc()})
    passed = bool(checks) and all(item["passed"] for item in checks)
    report = {"performedBy": "evaluation harness after the agent; not agent verification evidence",
              "execution": "FastAPI TestClient real HTTP assertions on fresh evaluator-owned state",
              "checks": checks, "passed": passed}
    (output / "checks.json").write_text(json.dumps(report, indent=2) + "\n")
    (output / "reward.txt").write_text("1\n" if passed else "0\n")
    print(json.dumps(report))
    return 0 if passed else 1

from collections import Counter


def fixture():
    from fastapi.testclient import TestClient
    from app.main import create_app
    from app.store import CatalogStore

    class CountingStore(CatalogStore):
        def __init__(self):
            super().__init__()
            self.reads = Counter()

        def list_items(self, tenant, category):
            self.reads[tenant] += 1
            return super().list_items(tenant, category)

        def get_item(self, tenant, item_id):
            self.reads[tenant] += 1
            return super().get_item(tenant, item_id)

    store = CountingStore()
    return TestClient(create_app(store=store)), store


def request(client, method, path, tenant="tenant-a", status=200, **kwargs):
    response = client.request(method, path, headers={"X-Tenant": tenant}, **kwargs)
    assert response.status_code == status, (method, path, tenant, response.status_code, response.text)
    return None if status == 204 else response.json()


def initial(tenant):
    return [{"id": index, "name": f"{tenant} item {index}",
             "category": "blue" if index % 2 else "red"} for index in range(1, 5)]


def expect_page(client, tenant, items, category, offset, limit):
    params = {"offset": offset, "limit": limit}
    if category is not None:
        params["category"] = category
    filtered = [item for item in items if category is None or item["category"] == category]
    body = request(client, "GET", "/items", tenant, params=params)
    assert body == {"items": filtered[offset:offset+limit], "total": len(filtered),
                    "offset": offset, "limit": limit}, (tenant, params, body, filtered)


def alternating_headers():
    client, store = fixture()
    # Same URL, different header principal: the original header-cache failure mechanism.
    for tenant in ("tenant-a", "tenant-b", "tenant-a", "tenant-b"):
        for item_id in (1, 3, 2):
            assert request(client, "GET", f"/items/{item_id}", tenant) == initial(tenant)[item_id-1]
        expect_page(client, tenant, initial(tenant), None, 0, 2)
    before = dict(store.reads)
    for tenant in ("tenant-b", "tenant-a"):
        request(client, "GET", "/items/1", tenant)
        expect_page(client, tenant, initial(tenant), None, 0, 2)
    assert dict(store.reads) == before, "Repeated identical reads must use the cache"


def filters_and_totals():
    client, _ = fixture()
    for tenant in ("tenant-a", "tenant-b", "tenant-a"):
        for category in (None, "blue", "red", "blue"):
            for offset, limit in ((0, 1), (1, 2), (3, 2), (30, 2)):
                expect_page(client, tenant, initial(tenant), category, offset, limit)


VIEWS = [(category, offset, limit) for category in (None, "blue", "red")
         for offset, limit in ((0, 2), (1, 1), (8, 2))]


def mutation_views(operation):
    client, store = fixture()
    expected = initial("tenant-a")
    for tenant in ("tenant-a", "tenant-b"):
        for category, offset, limit in VIEWS:
            expect_page(client, tenant, initial(tenant), category, offset, limit)
        for item_id in (1, 2):
            assert request(client, "GET", f"/items/{item_id}", tenant) == initial(tenant)[item_id-1]
    other_reads = store.reads["tenant-b"]
    if operation == "create":
        item = {"id": 5, "name": "Created synthetic", "category": "blue"}
        assert request(client, "POST", "/items", status=201,
                       json={k: v for k, v in item.items() if k != "id"}) == item
        expected.append(item)
        assert request(client, "GET", "/items/5") == item
    elif operation == "update":
        item = {"id": 1, "name": "Changed synthetic", "category": "red"}
        assert request(client, "PUT", "/items/1",
                       json={k: v for k, v in item.items() if k != "id"}) == item
        expected[0] = item
    else:
        request(client, "DELETE", "/items/1", status=204)
        expected = expected[1:]
    for category, offset, limit in VIEWS:
        expect_page(client, "tenant-a", expected, category, offset, limit)
        expect_page(client, "tenant-b", initial("tenant-b"), category, offset, limit)
    for item_id in (1, 2):
        if operation == "delete" and item_id == 1:
            request(client, "GET", "/items/1", status=404)
        else:
            assert request(client, "GET", f"/items/{item_id}") == next(i for i in expected if i["id"] == item_id)
        assert request(client, "GET", f"/items/{item_id}", "tenant-b") == initial("tenant-b")[item_id-1]
    assert store.reads["tenant-b"] == other_reads, "Write evicted unrelated tenant's warm cache"


def invalid_and_missing():
    client, store = fixture()
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/items").status_code == 422
    assert client.get("/items", headers={"X-Tenant": "unknown"}).status_code == 422
    for params in ({"offset": -1}, {"limit": 0}, {"limit": 101}, {"category": "green"}):
        request(client, "GET", "/items", status=422, params=params)
    for item_id in (0, -1):
        request(client, "GET", f"/items/{item_id}", status=422)
    for method in ("POST", "PUT"):
        url = "/items" if method == "POST" else "/items/1"
        for body in ({"name": "", "category": "blue"}, {"name": "x", "category": "green"}):
            request(client, method, url, status=422, json=body)
    expect_page(client, "tenant-a", initial("tenant-a"), None, 0, 2)
    request(client, "GET", "/items/1")
    before = dict(store.reads)
    request(client, "PUT", "/items/999", status=404, json={"name": "Absent", "category": "red"})
    request(client, "DELETE", "/items/999", status=404)
    expect_page(client, "tenant-a", initial("tenant-a"), None, 0, 2)
    request(client, "GET", "/items/1")
    assert dict(store.reads) == before, "Failed writes evicted valid cached views"
    request(client, "GET", "/items/999", status=404)


def main():
    return run_checks([
        ("alternating-header-tenants-and-warm-cache", alternating_headers),
        ("filter-page-identity-and-filtered-totals", filters_and_totals),
        ("create-refreshes-all-same-tenant-views", lambda: mutation_views("create")),
        ("update-moves-category-and-refreshes-sibling-views", lambda: mutation_views("update")),
        ("delete-clears-detail-and-list-sibling-views", lambda: mutation_views("delete")),
        ("validation-404-health-and-failed-write-cache", invalid_and_missing),
    ])


if __name__ == "__main__":
    raise SystemExit(main())
