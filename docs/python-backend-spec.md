# Python backend verification

Status: Implemented. Scope accepted through the user's request to write the spec and proceed; validation is recorded in `python-backends.md`.
Date: 2026-10-29
Updated: 2026-11-04. Retire the standalone example while retaining Python support and regression coverage.

## Problem and goal

Before source-to-test mapping, changing `app/orders.py` ran Ruff without selecting `tests/test_orders.py`. The verifier now uses an explicit map to select tests for Python source changes. The original live validation used FastAPI and a disposable MySQL database.

## Behavior

- A repository may declare `pythonTestMap` in `.haechi.json`. Each entry has `source` and a nonempty `tests` array. `source` is an exact repository-relative file or a directory ending in `/`. Tests are explicit repository-relative Python files. Globs, pytest node IDs and automatic import analysis are outside this version.
- Example: `{"source":"app/","tests":["tests/test_api.py"]}` selects the API test when any Python file under `app/` changes.
- The default verifier combines all matching entries with changed Python test files and removes duplicates. Directory matches respect path boundaries. It never invents a whole-repository pytest command.
- A configured `commands.testOne` takes precedence over detected pytest. It must contain `{file}` and runs once per selected file. Existing options, environment setup and Docker wrappers remain part of that command. A custom `commands.verify` remains the setup choice; the default verifier never invokes it recursively.
- A placeholder inside a quoted shell snippet must have its own quotes. Ambiguous nested quoting is rejected before execution rather than risking a split filename.
- Without `commands.testOne`, use the detected uv, Poetry or pip pytest command. Python dependencies declared in `requirements-dev.txt` participate in setup detection as they already do in the default verifier.
- Unmapped sources, unavailable tools and other skipped checks are listed. The CLI exits 2 for incomplete verification, 1 for a failed check or invalid configuration, and 0 only when planned checks pass with no skips. Documentation-only changes with no checks remain a successful no-op. JS lint and test selection commands stay the same; skipped JS checks also become incomplete instead of successful.
- Invalid map shapes, unsafe paths and selected test files missing from the repository fail before checks run. No test path may resolve outside the repository. Configuration is optional and does not make existing setup incomplete.

## Regression coverage and database ownership

Focused fixtures in `test/detect.test.mjs` and `test/verify-default.test.mjs` cover Python detection, source-to-test selection, command precedence and test-result checks. The standalone FastAPI/MySQL application was retired on 2026-11-04. Its original live validation remains recorded in the [backend guide](python-backends.md).

The verifier selects tests; it does not start databases, install dependencies, run migrations or reset data. Each application repository owns its database setup. Missing database prerequisites must fail visibly rather than silently substituting another database.

## Acceptance criteria

1. Source-only changes select the explicitly mapped test; exact-file and directory mappings, overlapping entries and duplicate targets have tests.
2. A changed Python test still runs without a map. Custom single-test commands work even when pytest dependency detection is unavailable.
3. A mixture of mapped and unmapped sources reports incomplete verification. Missing pytest, missing tests, malformed settings and invalid paths cannot produce a complete result.
4. FastAPI with pytest declared only in `requirements-dev.txt` yields a usable single-test candidate. Existing Django and JS detection tests keep passing.
5. Preserve the historical live FastAPI/MySQL validation record. Current regression fixtures continue to cover source-to-test selection and incomplete or failed test execution.
6. Setup instructions explain the map and test database prerequisites. The backend guide records the actual validation commands and limits.
7. The generated Claude and Codex distributions match the root source folders. Run `npm run check` and only affected test files.

## Scope limits

No Java or Go support, framework-specific workflow rules, migration automation, Docker daemon management, production database access, repository-wide test fallback, publishing or push. The historical database check does not establish compatibility with every FastAPI repository.

## Open questions

None for this first increment. Validate the design against a real team repository when one becomes available.
