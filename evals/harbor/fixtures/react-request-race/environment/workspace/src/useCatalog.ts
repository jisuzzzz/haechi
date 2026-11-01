import { useEffect, useState } from 'react'
import type { Item, Tenant } from './api'
import { readCatalog } from './catalogCache'
type State = { rows: Item[]; loading: boolean; error: string | null }
export function useCatalog(tenant: Tenant, query: string) {
  const [state, setState] = useState<State>({ rows: [], loading: true, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setState({ rows: [], loading: true, error: null })
    readCatalog(tenant, query).then(
      (rows) => setState({ rows, loading: false, error: null }),
      () => setState({ rows: [], loading: false, error: 'Could not load inventory.' }),
    )
  }, [tenant, query, attempt])
  return { ...state, retry: () => setAttempt((value) => value + 1) }
}
