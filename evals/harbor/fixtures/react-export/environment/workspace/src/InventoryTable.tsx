import type { Row } from './api'
export function InventoryTable({ rows, selected, toggle }: { rows: Row[]; selected: string[]; toggle: (id: string) => void }) {
  return <table><thead><tr><th>Select</th><th>ID</th><th>Name</th><th>Note</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id}>
      <td><input type="checkbox" aria-label={`Select ${row.id}`} checked={selected.includes(row.id)} onChange={() => toggle(row.id)} /></td>
      <td>{row.id}</td><td>{row.name}</td><td>{row.note}</td>
    </tr>)}</tbody>
  </table>
}
