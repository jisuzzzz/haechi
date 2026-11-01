# Synthetic catalog API

`GET /items?offset=0&limit=2` returns `items`, `total`, `offset` and `limit`.
`total` is the size of the full catalog before pagination. The catalog contains
five synthetic items. The returned page can be empty without changing `total`.
Negative offsets and limits outside 1–100 return HTTP 422.

Install dependencies with `python -m pip install -r requirements.lock` in a fresh
virtual environment. `requirements.txt` names the direct dependencies and
`requirements.lock` freezes the full dependency resolution used by this fixture.

Run one test file with `python -m pytest tests/test_api.py -q`.
Run the repository verification command with `python -m compileall -q app`.
These are separate checks; compilation alone exercises no HTTP behavior.

`python scripts/smoke.py` is the old smoke entry point kept for compatibility.
It exits successfully but currently discovers no tests. It is not an API test.
