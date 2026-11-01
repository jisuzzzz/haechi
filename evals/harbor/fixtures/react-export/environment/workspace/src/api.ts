export type Row = { id: string; name: string; note: string }
export type Page = { rows: Row[]; nextCursor: string | null; total: number }
export type PageRequest = { filter: string; cursor: string | null; pageSize: number }
const data: Row[] = [
  { id: '001', name: 'Blue crate', note: 'aisle 1' },
  { id: '002', name: 'Amber crate', note: 'aisle 2' },
  { id: '003', name: 'Blue, large', note: 'Handle "gently"\nKeep dry' },
  { id: '004', name: 'Green crate', note: '' },
  { id: '005', name: 'Blue small', note: 'aisle 5' },
]
// Opaque cursors, not row counts, determine whether another page exists.
// A server may repeat a boundary row; each ID represents one export record.
export async function fetchPage({ filter, cursor, pageSize }: PageRequest): Promise<Page> {
  await new Promise((resolve) => setTimeout(resolve, 70))
  const matching = data.filter((row) => row.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const start = cursor ? Number(cursor) : 0
  const end = Math.min(start + pageSize, matching.length)
  return { rows: matching.slice(start, end), nextCursor: end < matching.length ? String(end) : null, total: matching.length }
}
