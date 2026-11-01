import type { Tenant } from './api'
import { useCatalog } from './useCatalog'
export function Catalog({ tenant, query }: { tenant: Tenant; query: string }) {
  const { rows, loading, error, retry } = useCatalog(tenant, query)
  return <section aria-label="Inventory results">
    <p role="status">{loading ? 'Loading inventory…' : error ? 'Inventory unavailable' : `${rows.length} items`}</p>
    {error && <><p role="alert">{error}</p><button onClick={retry}>Retry</button></>}
    {!loading && !error && rows.length === 0 && <p>No matching items</p>}
    <ul>{rows.map((item) => <li key={item.id}>{item.id} — {item.name} — {item.quantity} in stock</li>)}</ul>
  </section>
}
