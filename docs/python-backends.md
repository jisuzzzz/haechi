# Python backends

For example, changing `app/orders.py` can run `tests/test_orders.py` even when the test file has not changed. Declare that relationship in the repository's `.haechi.json`:

```json
{
  "commands": {
    "verify": "node <haechi-tools>/verify-default.mjs {files}",
    "testOne": "uv run pytest {file}"
  },
  "pythonTestMap": [
    { "source": "app/orders.py", "tests": ["tests/test_orders.py"] },
    { "source": "app/shared/", "tests": ["tests/test_orders.py", "tests/test_users.py"] }
  ]
}
```

Replace `<haechi-tools>` with the installed plugin's tools directory. This is an excerpt, not a complete setup configuration. Keep the repository's other settings. Existing custom verifiers remain valid; the map is used only by the default verifier.

## Test selection

- A source without a trailing `/` matches one exact file. A directory ending in `/` matches Python files below it. `app/order/` does not match `app/orders/`.
- Every matching entry contributes tests. Changed `test_*.py` and `*_test.py` files also run. Duplicate targets run once.
- Tests must be explicit `.py` files. Directories, globs and pytest node IDs are not accepted. Add an entry for shared sources or `conftest.py` when changes there need a broader test set.
- Paths are relative to the repository and use `/`. Letters, numbers, spaces, `.`, `_`, `-`, `@` and `+` are supported. Shell-special characters and paths outside the repository are rejected. Selected test symlinks must resolve inside the repository.
- The configured `commands.testOne` runs once for each selected test. Include `{file}` once where the filename belongs. It may retain repository-specific flags, environment variables or a Docker wrapper. These commands are trusted repository configuration. If it is absent, haechi uses the detected pytest runner.
- Inside a quoted shell snippet, quote the placeholder separately: `sh -c "pytest '{file}'"`. Ambiguous forms such as `sh -c "pytest {file}"` fail before running checks. A normal command such as `pytest {file}` needs no extra quoting.
- `requirements-dev.txt` participates in setup detection alongside `requirements.txt` and `pyproject.toml`. It is also included in pip's install candidate. Nested requirement includes and arbitrary Makefile targets are not automatically parsed.

## Completion evidence

| Exit | Meaning |
|---|---|
| 0 | All planned checks passed, with no skips; docs-only changes may have no checks |
| 1 | A command failed, or configuration/test paths were invalid |
| 2 | Checks were skipped, so verification is incomplete |

Missing Ruff, missing pytest and unmapped Python sources are reported. A mixture of mapped and unmapped changes is still incomplete. The same skipped-check rule applies to missing JS tools. There is no automatic whole-repository test fallback.

## FastAPI and MySQL

The [example](../examples/fastapi-mysql/README.md) contains an API, two HTTP assertions against MySQL, and a source-to-test map. It uses synthetic rows in a connection-local temporary table. No existing table is reset.

The repository owns its database lifecycle. Setup identifies how to prepare services and environment variables, but the default verifier only runs checks. Keep credentials in the environment. Record migration and test database rules in the repository's existing instructions. A missing database is a failed or unverified check, not a skipped test reported as success.

## Validation record

On 2026-10-29, the example ran on Python 3.12 with FastAPI 0.121.0, PyMySQL 1.1.2, pytest 8.4.2 and MySQL 8.3.0 in a new temporary data directory. The command was `node <haechi-tools>/verify-default.mjs app/main.py` with the example virtual environment active and its MySQL environment variables set.

| Scenario | Result |
|---|---|
| API returns the existing row and 404 for a missing row | 2 pytest tests passed; verifier exit 0 |
| Missing-item response deliberately changed to 200, using the old verifier | Only Ruff ran; incorrect API still exited 0 |
| Same regression, using the new verifier | 1 test failed and 1 passed; verifier exit 1 |
| Restored 404 response | 2 tests passed; verifier exit 0 |

The dependency stack emitted one Starlette/AnyIO deprecation warning. It did not prevent either test from running. No existing database or external service was used. Setup command detection was also exercised against the copied example; a full team setup still needs real Git-host and forbidden-command decisions.

See the [implementation spec](python-backend-spec.md) for acceptance criteria. The example is deliberately small; a real team's async sessions, migration tooling and CI service setup still need validation when an application repository becomes available.
