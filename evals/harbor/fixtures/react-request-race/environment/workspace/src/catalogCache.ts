import { fetchItems, type Item, type Tenant } from './api'
// Keep list membership and entity data separate so repeated searches reuse objects.
const lists = new Map<string, string[]>()
const entities = new Map<string, Item>()
export async function readCatalog(tenant: Tenant, query: string): Promise<Item[]> {
  const key = query.trim().toLowerCase()
  const cached = lists.get(key)
  if (cached) return cached.map((id) => entities.get(id)!)
  const items = await fetchItems(tenant, query)
  for (const item of items) entities.set(item.id, item)
  lists.set(key, items.map((item) => item.id))
  return items
}
