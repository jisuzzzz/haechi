import { useEffect, useRef, useState } from 'react'
import { fetchPage, type Page } from './api'
import { exportCatalog } from './exportCatalog'
import { InventoryTable } from './InventoryTable'
export default function App() {
  const [filter, setFilter] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [page, setPage] = useState<Page>({ rows: [], nextCursor: null, total: 0 })
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)
  const [message, setMessage] = useState('')
  const current = useRef({ filter, selectedIds: selected })
  current.current = { filter, selectedIds: selected }
  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    fetchPage({ filter, cursor, pageSize: 2 }).then(
      (result) => { if (active) { setPage(result); setLoading(false) } },
      () => { if (active) { setLoadError(true); setLoading(false) } },
    )
    return () => { active = false }
  }, [filter, cursor])
  async function handleExport() {
    setExporting(true)
    setExportError(false)
    setMessage('')
    try {
      await exportCatalog(() => current.current)
      setMessage('Export complete')
    } catch {
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }
  return <main><h1>Inventory exports</h1>
    <label>Search inventory <input value={filter} onChange={(event) => { setFilter(event.target.value); setCursor(null); setSelected([]) }} /></label>
    <p role="status">{loading ? 'Loading inventory…' : `${page.total} matching items`}</p>
    {loadError && <p role="alert">Could not load inventory.</p>}
    <InventoryTable rows={page.rows} selected={selected} toggle={(id) => setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id])} />
    <button disabled={loading || page.nextCursor === null} onClick={() => setCursor(page.nextCursor)}>Next page</button>
    <button disabled={loading || cursor === null} onClick={() => setCursor(null)}>First page</button>
    <p>{selected.length} selected</p>
    <button disabled={exporting || loading} onClick={handleExport}>Export CSV</button>
    <p aria-live="polite">{exporting ? 'Exporting…' : message}</p>
    {exportError && <p role="alert">Export failed. Try again.</p>}
  </main>
}
