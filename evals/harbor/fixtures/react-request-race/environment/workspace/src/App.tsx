import { useState } from 'react'
import type { Tenant } from './api'
import { Catalog } from './Catalog'
export default function App() {
  const [tenant, setTenant] = useState<Tenant>('north')
  const [query, setQuery] = useState('')
  return <main><h1>Warehouse inventory</h1>
    <label>Warehouse <select value={tenant} onChange={(event) => setTenant(event.target.value as Tenant)}>
      <option value="north">North</option><option value="south">South</option>
    </select></label>
    <label>Search inventory <input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <Catalog tenant={tenant} query={query} />
  </main>
}
