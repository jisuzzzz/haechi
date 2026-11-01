# Tenant catalog cache

This is a synthetic adaptation of a recurring cache-key/isolation failure, not an
upstream issue replay. The header-dependent cache identity failure is documented
in [fastapi-cache issue 103](https://github.com/long2ice/fastapi-cache/issues/103);
this fixture implements a small local cache and a stricter mutation contract. Two tenants (`tenant-a`, `tenant-b`) intentionally have
item IDs 1 through 4. Header `X-Tenant` is required on every catalog request.
The in-process cache is shared by all requests to one app.

## API contract

- `GET /health` returns `{"status":"ok"}` without a tenant header.
- `GET /items?category=blue&offset=0&limit=2` returns `items`, `total`,
  `offset`, `limit`. Omitted category means all categories; category is exactly
  `blue` or `red`. Results are in ascending ID order; total counts the entire
  filtered tenant catalog even on empty pages. Offset >= 0; limit 1..100.
- `GET /items/{id}` returns that tenant's item or 404. IDs must be positive.
- `POST /items` accepts `{"name":"...","category":"blue"}` and creates an item
  with status 201. IDs increment within the tenant, starting at 5.
- `PUT /items/{id}` replaces name and category and returns the item with status
  200; `DELETE /items/{id}` returns 204. Missing IDs return 404 without mutation.
- Names have length 1..80; invalid header, body or query values return 422.
  Items contain exactly `id`, `name`, `category`.

Read cache identity must include the tenant, endpoint and every semantic query
argument (category, offset, limit). A successful write must remove every cached
read view affected for that tenant, including all pages and category variants.
Warmed reads for the other tenant must stay cached; clearing the whole shared
cache on every write is incorrect. Failed writes must not invalidate warm reads.
The provided `CatalogStore` is authoritative; keep the cache in the read path.

`create_app(store=None, cache=None)` supports a fresh store/cache for callers and
is part of the testable interface. Public tests intentionally cover only isolated
happy paths. Run `python -m pytest tests/test_api.py -q` and
`python -m compileall -q app`.
