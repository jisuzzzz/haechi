"""Evaluator-owned HTTP checks; never installed in the editable workspace."""

import json
import os
from pathlib import Path
import sys
import traceback


def main():
    workspace = Path(os.environ.get("HAECHI_FIXTURE_WORKSPACE", "/workspace"))
    output = Path(os.environ.get("HAECHI_VERIFIER_OUTPUT", "/logs/verifier"))
    output.mkdir(parents=True, exist_ok=True)
    checks = []

    def check(name, action):
        try:
            action()
            checks.append({"name": name, "passed": True})
        except Exception:
            checks.append({"name": name, "passed": False, "error": traceback.format_exc()})

    try:
        sys.path.insert(0, str(workspace))
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)

        def expect_page(offset, limit, ids):
            response = client.get("/items", params={"offset": offset, "limit": limit})
            assert response.status_code == 200, response.text
            body = response.json()
            assert body == {
                "items": [{"id": index, "name": f"Synthetic item {index}"} for index in ids],
                "total": 5,
                "offset": offset,
                "limit": limit,
            }, body

        check("first-page-full-total", lambda: expect_page(0, 2, [1, 2]))
        check("middle-page-full-total", lambda: expect_page(2, 2, [3, 4]))
        check("last-page-full-total", lambda: expect_page(4, 2, [5]))
        check("empty-page-full-total", lambda: expect_page(20, 2, []))

        def health():
            response = client.get("/health")
            assert response.status_code == 200
            assert response.json() == {"status": "ok"}

        check("health-unchanged", health)

        def invalid():
            for params in [{"offset": -1}, {"limit": 0}, {"limit": 101}]:
                response = client.get("/items", params=params)
                assert response.status_code == 422, (params, response.text)

        check("query-validation-unchanged", invalid)
    except Exception:
        checks.append({"name": "load-api", "passed": False, "error": traceback.format_exc()})

    passed = bool(checks) and all(item["passed"] for item in checks)
    report = {
        "performedBy": "evaluation harness after the agent; not agent verification evidence",
        "execution": "FastAPI TestClient HTTP requests, no external service or database",
        "checks": checks,
        "passed": passed,
    }
    (output / "checks.json").write_text(json.dumps(report, indent=2) + "\n")
    (output / "reward.txt").write_text("1\n" if passed else "0\n")
    print(json.dumps(report))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
