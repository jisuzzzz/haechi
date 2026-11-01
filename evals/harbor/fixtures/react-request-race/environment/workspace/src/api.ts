export type Tenant = 'north' | 'south'
export type Item = { id: string; name: string; quantity: number }
const inventory: Record<Tenant, Item[]> = {
  north: [{ id: '001', name: 'North Blue', quantity: 12 }, { id: '002', name: 'North Amber', quantity: 7 }],
  south: [{ id: '001', name: 'South Blue', quantity: 4 }, { id: '002', name: 'South Amber', quantity: 19 }],
}
// Real deployments replace this adapter with HTTP. IDs are tenant-local.
export async function fetchItems(tenant: Tenant, query: string): Promise<Item[]> {
  await new Promise((resolve) => setTimeout(resolve, 90))
  const needle = query.trim().toLowerCase()
  return inventory[tenant].filter((item) => item.name.toLowerCase().includes(needle)).map((item) => ({ ...item }))
}
