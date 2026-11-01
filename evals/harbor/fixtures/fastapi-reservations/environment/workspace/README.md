# Stock reservation service

Synthetic transactional workload; this is an adaptation of real concurrency and
idempotency failure patterns, not an upstream application replay. The neighboring
transaction-concurrency incident [encode/databases issue 327](https://github.com/encode/databases/issues/327)
was fixed by [PR 328](https://github.com/encode/databases/pull/328); its inherited
connection/transaction state defect is different from this fixture. This stress
adaptation uses sqlite3 directly and adds an explicit synthetic stock/idempotency
contract. Central evaluator provenance is recorded in `evals/harbor/provenance/`.
SQLite is the authority. `create_app(db_path)` creates an app against the specified file;
multiple independent apps/processes may use that same database. An in-memory
lock or per-app cache cannot establish cross-process correctness.

## API contract

All inventory/reservation routes require header `X-Tenant`, one of `tenant-a`
or `tenant-b`. Each tenant initially has widget stock 5 and gadget stock 4.
Names and tenant IDs are synthetic. `/health` returns `{"status":"ok"}`.

- `GET /inventory` returns `{"items":[{"sku":"gadget","available":4},
  {"sku":"widget","available":5}]}`, sorted by SKU and tenant-scoped.
- `POST /reservations` requires `Idempotency-Key` (1..64 letters, digits,
  underscore, hyphen or period) and JSON `{"lines":[{"sku":"widget",
  "quantity":2}]}`. Between 1 and 20 distinct SKUs are allowed; SKU is 1..40
  lowercase letters, digits or hyphens; quantity is an integer 1..100. Duplicate
  SKUs and invalid headers/body return 422. No aggregation of duplicate lines.
- Success is 201 with `{"id":"<uuid>","lines":[...],"status":"reserved"}`.
  Response lines are sorted by SKU. All stock decrements and the reservation
  record are one atomic database transaction, even across app instances.
- A missing SKU returns 404; insufficient stock returns 409. Either leaves all
  stock and reservation records unchanged. A failed key can be retried with
  another valid payload because failures never reserve an idempotency key.
  A database persistence failure may return 500, but must also roll back every
  stock change and leave the key retryable.
- Keys are unique **within a tenant**, shared by that tenant across app instances.
  The same key and equivalent payload return exactly the original status/body,
  including ID, without another decrement. Line order does not affect payload
  identity. Different payload with an existing key returns 409 without mutation.
  Concurrent same-key requests must resolve to that same reservation, not 500.
- `GET /reservations/{id}` returns the stored response for this tenant, or 404.
  A tenant cannot read another tenant's reservation ID.

Successful reservations must conserve stock; no inventory row may become
negative. SQLite lock handling must allow the small concurrent cohorts in tests
to complete; returning 500/database-locked errors is incorrect. The repository
exposes a transaction context, but the current service was assembled from
independently committed operations. Investigate the actual behavior.

Run `python -m pytest tests/test_api.py -q` and
`python -m compileall -q app`. Public tests cover isolated happy paths; use fresh
temporary SQLite files for regression tests. `HAECHI_RESERVATION_DB` controls the
default app's database (default `/tmp/haechi-reservations.sqlite3`).
