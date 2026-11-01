import { fetchPage, type Row } from './api'
import { downloadCsv, serializeCsv } from './csv'
export type ExportRequest = { filter: string; selectedIds: string[] }
export async function exportCatalog(getRequest: () => ExportRequest) {
  const rows: Row[] = []
  let cursor: string | null = null
  do {
    const request = getRequest()
    const page = await fetchPage({ filter: request.filter, cursor, pageSize: 2 })
    const selected = getRequest().selectedIds
    rows.push(...page.rows.filter((row) => selected.length === 0 || selected.includes(row.id)))
    cursor = page.nextCursor
    if (page.rows.length < 2) break
  } while (cursor !== null)
  downloadCsv(serializeCsv(rows))
}
