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

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import multiprocessing
from queue import Empty
import sqlite3
from threading import Barrier, BrokenBarrierError
import time


@contextmanager
def fixture():
    from fastapi.testclient import TestClient
    with tempfile.TemporaryDirectory(prefix="reservation-grade-") as directory:
        db_path = Path(directory) / "fresh.sqlite3"
        os.environ["HAECHI_RESERVATION_DB"] = str(Path(directory) / "default.sqlite3")
        from app.main import create_app
        app = create_app(db_path)
        yield TestClient(app, raise_server_exceptions=False), db_path, create_app


def reserve(client, key, lines, tenant="tenant-a", status=201):
    response = client.post("/reservations", headers={"X-Tenant": tenant, "Idempotency-Key": key},
                           json={"lines": [{"sku": sku, "quantity": quantity} for sku, quantity in lines]})
    assert response.status_code == status, (status, response.status_code, response.text)
    return response


def stock(client, tenant="tenant-a"):
    response = client.get("/inventory", headers={"X-Tenant": tenant})
    assert response.status_code == 200, response.text
    return response.json()


INITIAL = {"items": [{"sku": "gadget", "available": 4}, {"sku": "widget", "available": 5}]}


def rows(db_path):
    with sqlite3.connect(db_path) as db:
        return db.execute("SELECT COUNT(*) FROM reservations").fetchone()[0]


def rollback_missing():
    with fixture() as (client, path, _):
        reserve(client, "retryable", [("gadget", 2), ("zzz-missing", 1)], status=404)
        assert stock(client) == INITIAL, "Earlier line committed despite missing later SKU"
        assert rows(path) == 0
        reserve(client, "retryable", [("widget", 1)])
        assert stock(client)["items"][1]["available"] == 4


def rollback_shortage():
    with fixture() as (client, path, _):
        reserve(client, "retryable", [("gadget", 1), ("widget", 6)], status=409)
        assert stock(client) == INITIAL, "Earlier line committed despite later shortage"
        assert rows(path) == 0
        reserve(client, "retryable", [("widget", 1)])
        assert rows(path) == 1


def rollback_storage_error():
    with fixture() as (client, path, _):
        # Real database failure after every stock line, not a mocked service failure.
        with sqlite3.connect(path) as db:
            db.execute("CREATE TRIGGER fail_persist BEFORE INSERT ON reservations "
                       "BEGIN SELECT RAISE(ABORT, 'synthetic persistence failure'); END")
        reserve(client, "storage-retry", [("gadget", 1), ("widget", 2)], status=500)
        assert stock(client) == INITIAL, "Storage failure left decremented stock"
        assert rows(path) == 0
        with sqlite3.connect(path) as db:
            db.execute("DROP TRIGGER fail_persist")
        reserve(client, "storage-retry", [("widget", 1)])
        assert stock(client)["items"][1]["available"] == 4


def replay_and_conflict():
    with fixture() as (client, path, _):
        first = reserve(client, "stable", [("widget", 2), ("gadget", 1)])
        second = reserve(client, "stable", [("gadget", 1), ("widget", 2)])
        assert first.content == second.content, (first.text, second.text)
        assert first.json()["lines"] == [{"sku": "gadget", "quantity": 1}, {"sku": "widget", "quantity": 2}]
        before = stock(client)
        reserve(client, "stable", [("widget", 1)], status=409)
        reserve(client, "stable", [("gadget", 2), ("widget", 2)], status=409)
        assert stock(client) == before
        assert rows(path) == 1


def tenant_and_app_isolation():
    from fastapi.testclient import TestClient
    with fixture() as (client, path, create_app):
        first = reserve(client, "shared-key", [("widget", 2)])
        other = TestClient(create_app(path), raise_server_exceptions=False)
        replay = reserve(other, "shared-key", [("widget", 2)])
        assert replay.content == first.content
        second = reserve(other, "shared-key", [("widget", 1)], tenant="tenant-b")
        assert first.json()["id"] != second.json()["id"], "Key leaked another tenant's response"
        assert stock(client)["items"][1]["available"] == 3
        assert stock(other, "tenant-b")["items"][1]["available"] == 4
        foreign = client.get("/reservations/" + first.json()["id"], headers={"X-Tenant": "tenant-b"})
        assert foreign.status_code == 404, foreign.text
        local = other.get("/reservations/" + first.json()["id"], headers={"X-Tenant": "tenant-a"})
        assert local.json() == first.json()
        assert rows(path) == 2


def install_read_gate(app, gate):
    # Gate after the authoritative read, before mutation. The old service lets
    # every contender observe stock 5. A database-serialized repair permits just
    # one reader; the bounded broken barrier then releases it. This accepts
    # legitimate implementations that serialize before reading or avoid reads.
    repository = getattr(app.state, "repository", None)
    original = getattr(repository, "available", None)
    if not callable(original):
        return
    first = True

    def available(*args, **kwargs):
        nonlocal first
        value = original(*args, **kwargs)
        if first:
            first = False
            try:
                gate.wait(timeout=2)
            except BrokenBarrierError:
                pass
        return value

    repository.available = available


def threaded_cohort(duplicate=False):
    from fastapi.testclient import TestClient
    count = 6 if duplicate else 8
    for iteration in range(2):
        with fixture() as (observer, path, create_app):
            start = Barrier(count)
            read_gate = Barrier(count)
            clients = []
            for _ in range(count):
                app = create_app(path)
                install_read_gate(app, read_gate)
                clients.append(TestClient(app, raise_server_exceptions=False))

            def issue(index):
                start.wait(timeout=10)
                response = clients[index].post("/reservations",
                    headers={"X-Tenant": "tenant-a", "Idempotency-Key": "duplicate" if duplicate else f"cohort-{index}"},
                    json={"lines": [{"sku": "widget", "quantity": 1}]})
                return response.status_code, response.text

            with ThreadPoolExecutor(max_workers=count) as executor:
                results = list(executor.map(issue, range(count)))
            statuses = [status for status, _ in results]
            if duplicate:
                assert statuses == [201] * count, (iteration, results)
                assert len({body for _, body in results}) == 1, results
                assert stock(observer)["items"][1]["available"] == 4
                assert rows(path) == 1
            else:
                assert statuses.count(201) == 5 and statuses.count(409) == 3, (iteration, results)
                assert stock(observer)["items"][1]["available"] == 0
                assert rows(path) == 5


def process_request(db_path, index, start, read_gate, output):
    try:
        from fastapi.testclient import TestClient
        from app.main import create_app
        app = create_app(db_path)
        install_read_gate(app, read_gate)
        client = TestClient(app, raise_server_exceptions=False)
        start.wait(timeout=20)
        response = client.post("/reservations",
            headers={"X-Tenant": "tenant-a", "Idempotency-Key": f"process-{index}"},
            json={"lines": [{"sku": "widget", "quantity": 1}]})
        output.put({"index": index, "status": response.status_code, "body": response.text})
    except BaseException:
        output.put({"index": index, "error": traceback.format_exc()})


def separate_processes():
    with fixture() as (observer, path, _):
        context = multiprocessing.get_context("spawn")
        count = 7
        start = context.Barrier(count)
        read_gate = context.Barrier(count)
        output = context.Queue()
        workers = [context.Process(target=process_request,
                   args=(str(path), index, start, read_gate, output)) for index in range(count)]
        results = []
        try:
            for worker in workers:
                worker.start()
            deadline = time.monotonic() + 40
            for _ in workers:
                results.append(output.get(timeout=max(0.1, deadline-time.monotonic())))
            for worker in workers:
                worker.join(timeout=max(0.1, deadline-time.monotonic()))
            assert all(worker.exitcode == 0 for worker in workers), [(w.pid, w.exitcode) for w in workers]
        finally:
            for worker in workers:
                if worker.is_alive():
                    worker.terminate()
                    worker.join(timeout=3)
            output.close()
        assert all("error" not in result for result in results), results
        statuses = [result["status"] for result in results]
        assert statuses.count(201) == 5 and statuses.count(409) == count-5, results
        assert stock(observer)["items"][1]["available"] == 0
        assert rows(path) == 5


def validation():
    with fixture() as (client, path, _):
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/inventory").status_code == 422
        for headers in ({"X-Tenant": "tenant-a"},
                        {"X-Tenant": "unknown", "Idempotency-Key": "x"},
                        {"X-Tenant": "tenant-a", "Idempotency-Key": "bad key"}):
            response = client.post("/reservations", headers=headers,
                                   json={"lines": [{"sku": "widget", "quantity": 1}]})
            assert response.status_code == 422, response.text
        for lines in ([], [{"sku": "widget", "quantity": 0}],
                      [{"sku": "widget", "quantity": -1}],
                      [{"sku": "widget", "quantity": 101}],
                      [{"sku": "widget", "quantity": True}],
                      [{"sku": "widget", "quantity": 1}, {"sku": "widget", "quantity": 1}]):
            response = client.post("/reservations", headers={"X-Tenant": "tenant-a", "Idempotency-Key": "invalid"},
                                   json={"lines": lines})
            assert response.status_code == 422, (lines, response.status_code, response.text)
        assert stock(client) == INITIAL
        assert rows(path) == 0
        missing = client.get("/reservations/no-such-id", headers={"X-Tenant": "tenant-a"})
        assert missing.status_code == 404


def main():
    return run_checks([
        ("atomic-rollback-missing-later-sku-and-key-retry", rollback_missing),
        ("atomic-rollback-insufficient-later-line", rollback_shortage),
        ("real-sqlite-storage-failure-rolls-back-and-retries", rollback_storage_error),
        ("canonical-replay-and-payload-conflicts", replay_and_conflict),
        ("tenant-scoped-keys-private-lookup-and-shared-app-db", tenant_and_app_isolation),
        ("two-controlled-thread-cohorts-never-oversell", threaded_cohort),
        ("two-controlled-duplicate-key-cohorts-one-result", lambda: threaded_cohort(True)),
        ("independent-processes-share-atomic-stock-boundary", separate_processes),
        ("validation-health-and-missing-reservation", validation),
    ])


if __name__ == "__main__":
    raise SystemExit(main())
