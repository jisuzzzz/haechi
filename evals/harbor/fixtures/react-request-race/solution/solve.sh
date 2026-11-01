#!/bin/sh
set -eu
cat > /workspace/src/catalogCache.ts <<'SOURCE'
import { fetchItems, type Item, type Tenant } from './api'
const lists = new Map<string, string[]>()
const entities = new Map<string, Item>()
const entityKey = (tenant: Tenant, id: string) => JSON.stringify([tenant, id])
export async function readCatalog(tenant: Tenant, query: string): Promise<Item[]> {
  const key = JSON.stringify([tenant, query.trim().toLowerCase()])
  const cached = lists.get(key)
  if (cached) return cached.map((id) => entities.get(entityKey(tenant, id))!)
  const items = await fetchItems(tenant, query)
  for (const item of items) entities.set(entityKey(tenant, item.id), item)
  lists.set(key, items.map((item) => item.id))
  return items
}
SOURCE
cat > /workspace/src/useCatalog.ts <<'SOURCE'
import { useEffect, useState } from 'react'
import type { Item, Tenant } from './api'
import { readCatalog } from './catalogCache'
type State = { rows: Item[]; loading: boolean; error: string | null }
export function useCatalog(tenant: Tenant, query: string) {
  const [state, setState] = useState<State>({ rows: [], loading: true, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setState({ rows: [], loading: true, error: null })
    readCatalog(tenant, query).then(
      (rows) => { if (active) setState({ rows, loading: false, error: null }) },
      () => { if (active) setState({ rows: [], loading: false, error: 'Could not load inventory.' }) },
    )
    return () => { active = false }
  }, [tenant, query, attempt])
  return { ...state, retry: () => setAttempt((value) => value + 1) }
}
SOURCE
