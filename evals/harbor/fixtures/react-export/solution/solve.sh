#!/bin/sh
set -eu
cat > /workspace/src/exportCatalog.ts <<'SOURCE'
import { fetchPage, type Row } from './api'
import { downloadCsv, serializeCsv } from './csv'
export type ExportRequest = { filter: string; selectedIds: string[] }
export async function exportCatalog(getRequest: () => ExportRequest) {
  const captured = getRequest()
  const filter = captured.filter
  const selected = new Set(captured.selectedIds)
  const rows: Row[] = []
  const seen = new Set<string>()
  let cursor: string | null = null
  do {
    const page = await fetchPage({ filter, cursor, pageSize: 2 })
    for (const row of page.rows) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      if (selected.size === 0 || selected.has(row.id)) rows.push(row)
    }
    cursor = page.nextCursor
  } while (cursor !== null)
  downloadCsv(serializeCsv(rows))
}
SOURCE
cat > /workspace/src/csv.ts <<'SOURCE'
import type { Row } from './api'
function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}
export function serializeCsv(rows: Row[]): string {
  return ['id,name,note', ...rows.map((row) => [row.id, row.name, row.note].map(field).join(','))].join('\r\n') + '\r\n'
}
export function downloadCsv(contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'inventory.csv'
  link.click()
  URL.revokeObjectURL(url)
}
SOURCE
