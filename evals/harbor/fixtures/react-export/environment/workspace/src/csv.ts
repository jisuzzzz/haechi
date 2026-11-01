import type { Row } from './api'
export function serializeCsv(rows: Row[]): string {
  return ['id,name,note', ...rows.map((row) => [row.id, row.name, row.note].join(','))].join('\r\n') + '\r\n'
}
export function downloadCsv(contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'inventory.csv'
  link.click()
  URL.revokeObjectURL(url)
}
