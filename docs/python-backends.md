# Python backends

Pass source-to-test mappings and a custom single-test command as arguments to the default verifier. A repository can keep the invocation in its existing verification script.

```sh
node "/path/to/haechi/tools/verify-default.mjs" \
  --python-test-map '[{"source":"app/orders.py","tests":["tests/test_orders.py"]},{"source":"app/shared/","tests":["tests/test_orders.py","tests/test_users.py"]}]' \
  --test-one 'uv run pytest {file}' -- app/orders.py
```

Run from the repository root. The example uses POSIX shell quoting. A wrapper that launches Node directly can pass the JSON array and the command string as individual arguments. With no file arguments, the verifier inspects changed and untracked files. A repository can also use its own verifier.

## Test selection

- A source without a trailing `/` matches one exact file. A directory ending in `/` matches Python files below it. `app/order/` does not match `app/orders/`.
- Every matching entry contributes tests. Changed `test_*.py` and `*_test.py` files also run. Duplicate targets run once.
- Tests must be explicit `.py` files. Directories, globs and pytest node IDs are not accepted. Add an entry for shared sources or `conftest.py` when changes there need a broader test set.
- Paths are relative to the repository and use `/`. Letters, numbers, spaces, `.`, `_`, `-`, `@` and `+` are supported. Shell-special characters and paths outside the repository are rejected. Selected test symlinks must resolve inside the repository.
- The command supplied via `--test-one` runs once for each selected test. Include `{file}` once where the filename belongs. It may retain repository-specific flags, environment variables or a Docker wrapper. Pass only a command from trusted repository instructions or the caller. If it is absent, haechi uses the detected pytest runner.
- Inside a quoted shell snippet, quote the placeholder separately: `sh -c "pytest '{file}'"`. Ambiguous forms such as `sh -c "pytest {file}"` fail before running checks. A normal command such as `pytest {file}` needs no extra quoting.
- `requirements-dev.txt` participates in setup detection alongside `requirements.txt` and `pyproject.toml`. It is also included in pip's install candidate. Nested requirement includes and arbitrary Makefile targets are not automatically parsed.

## Completion evidence

| Exit | Meaning |
|---|---|
| 0 | Planned checks passed and test steps reported actual passes without skips; docs-only changes may have no checks |
| 1 | A command or reported test failed, or configuration/test paths were invalid |
| 2 | A check was skipped, or test execution evidence was missing or incomplete |

Missing Ruff, missing pytest and unmapped Python sources are reported. A mixture of mapped and unmapped changes is still incomplete. The same skipped-check rule applies to missing JS tools. There is no automatic whole-repository test fallback.

The verifier reads test-step summaries from stdout and stderr. It recognizes standard pytest terminal counts, Jest `Tests:` counts, Vitest `Tests` counts and Node TAP final counters. A positive test-case pass count is required. Jest suite/snapshot and Vitest file/error summaries also constrain the result; they cannot supply test-case execution evidence on their own. Zero tests, skipped/todo/expected-failure results, deselected tests, inconsistent summaries and unrecognized output remain incomplete. A reported test, suite, file or snapshot failure or runner error fails the check even if a wrapper returns exit 0. Custom commands still run, but output in another format cannot automatically pass. Both streams remain available for inspection.

Exit 2 identifies a gap in the tool's evidence; it is not proof that the implementation is wrong. Inspect the gap and obtain a focused check of the required behavior. An unrelated skip can be explained, but cannot count as proof; do not enable every optional test just to satisfy the parser. No-check changes explicitly report that no behavior tests ran. Even exit 0 establishes only the selected checks: the main agent must inspect assertions, acceptance coverage and validity for the final change before declaring task success.

## Test databases

The standalone FastAPI/MySQL example was retired on 2026-11-04. Python detection, source-to-test mapping and test-result checks remain supported. Focused regression fixtures in [`detect.test.mjs`](../test/detect.test.mjs) and [`verify-default.test.mjs`](../test/verify-default.test.mjs) cover those behaviors.

The repository owns its database lifecycle. Use its instructions for services and environment variables. The default verifier runs checks against the prepared environment. Keep credentials in the environment. Record migration and test database rules in the repository's existing instructions. A missing database is a failed or unverified check, not a skipped test reported as success.

## Historical database validation

The following results predate retirement of the standalone example. They record the original live database check, not a currently runnable example.

On 2026-10-29, the example ran on Python 3.12 with FastAPI 0.121.0, PyMySQL 1.1.2, pytest 8.4.2 and MySQL 8.3.0 in a new temporary data directory. The command was `node <haechi-tools>/verify-default.mjs app/main.py` with the example virtual environment active and its MySQL environment variables set.

| Scenario | Result |
|---|---|
| API returns the existing row and 404 for a missing row | 2 pytest tests passed; verifier exit 0 |
| Missing-item response deliberately changed to 200, using the old verifier | Only Ruff ran; incorrect API still exited 0 |
| Same regression, using the new verifier | 1 test failed and 1 passed; verifier exit 1 |
| Restored 404 response | 2 tests passed; verifier exit 0 |

The dependency stack emitted one Starlette/AnyIO deprecation warning. It did not prevent either test from running. No existing database or external service was used. Setup command detection was also exercised against the copied example; a full team setup still needs real Git-host and forbidden-command decisions.

See the [implementation spec](python-backend-spec.md) for acceptance criteria. A real team's async sessions, migration tooling and CI service setup still need validation in an application repository.
