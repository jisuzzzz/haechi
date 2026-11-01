import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const transport = vi.hoisted(() => vi.fn())
vi.mock('./src/api', () => ({ fetchItems: transport }))
const north = [{ id: '001', name: 'North Blue', quantity: 12 }, { id: '002', name: 'North Amber', quantity: 7 }]
const south = [{ id: '001', name: 'South Blue', quantity: 4 }, { id: '002', name: 'South Amber', quantity: 19 }]
function deferred() {
  let resolve!: (value: typeof north) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<typeof north>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function query(value: string) { fireEvent.change(screen.getByRole('textbox', { name: 'Search inventory' }), { target: { value } }) }
function tenant(value: string) { fireEvent.change(screen.getByRole('combobox', { name: 'Warehouse' }), { target: { value } }) }
const rows = () => screen.queryAllByRole('listitem').map((row) => row.textContent)
async function settle(request: ReturnType<typeof deferred>, value: typeof north) { await act(async () => { request.resolve(value) }) }
async function mount() { const { default: App } = await import('./src/App'); return render(<App />) }
beforeEach(() => { vi.resetModules(); transport.mockReset() })
afterEach(cleanup)

test('latest success wins even when an older success arrives last', async () => {
  const old = deferred(), latest = deferred()
  transport.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
  await mount()
  query('Blue')
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(2))
  await settle(latest, [north[0]])
  expect(rows()).toEqual(['001 — North Blue — 12 in stock'])
  await settle(old, north)
  expect(rows()).toEqual(['001 — North Blue — 12 in stock'])
  expect(screen.getByRole('status').textContent).toBe('1 items')
})

test('an obsolete success cannot end the current pending state', async () => {
  const old = deferred(), latest = deferred()
  transport.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
  await mount()
  query('Amber')
  await settle(old, north)
  expect(rows()).toEqual([])
  expect(screen.getByRole('status').textContent).toBe('Loading inventory…')
  await settle(latest, [north[1]])
  expect(rows()).toEqual(['002 — North Amber — 7 in stock'])
})

test('obsolete rejection does not replace a newer success or expose retry', async () => {
  const old = deferred(), latest = deferred()
  transport.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
  await mount()
  query('Blue')
  await settle(latest, [north[0]])
  await act(async () => { old.reject(new Error('late old error')) })
  expect(rows()).toEqual(['001 — North Blue — 12 in stock'])
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
})

test('cached query -> pending other query -> cached query remains cached after the pending response', async () => {
  // Adapted interleaving from react-select #4645, not a replay of its source.
  const pending = deferred()
  transport.mockResolvedValueOnce(north).mockResolvedValueOnce([north[0]]).mockReturnValueOnce(pending.promise)
  await mount()
  await waitFor(() => expect(rows()).toHaveLength(2))
  query('Blue')
  await waitFor(() => expect(rows()).toEqual(['001 — North Blue — 12 in stock']))
  query('Amber')
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(3))
  query('Blue')
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('1 items'))
  await settle(pending, [north[1]])
  expect(rows()).toEqual(['001 — North Blue — 12 in stock'])
  expect(transport).toHaveBeenCalledTimes(3)
})

test('same query and local IDs remain warehouse-scoped across cache hits', async () => {
  transport.mockResolvedValueOnce(north).mockResolvedValueOnce(south)
  await mount()
  await waitFor(() => expect(rows()).toHaveLength(2))
  tenant('south')
  await waitFor(() => expect(rows()).toEqual(['001 — South Blue — 4 in stock', '002 — South Amber — 19 in stock']))
  tenant('north')
  await waitFor(() => expect(rows()).toEqual(['001 — North Blue — 12 in stock', '002 — North Amber — 7 in stock']))
  tenant('south')
  await waitFor(() => expect(rows()[0]).toContain('South Blue'))
  expect(transport).toHaveBeenCalledTimes(2)
})

test('a tenant switch detaches a pending previous tenant', async () => {
  const previous = deferred(), current = deferred()
  transport.mockReturnValueOnce(previous.promise).mockReturnValueOnce(current.promise)
  await mount()
  tenant('south')
  await settle(current, south)
  await settle(previous, north)
  expect(rows()).toEqual(['001 — South Blue — 4 in stock', '002 — South Amber — 19 in stock'])
})

test('current failure clears rows, retries current inputs and clears the error while pending', async () => {
  const retry = deferred()
  transport.mockResolvedValueOnce(north).mockRejectedValueOnce(new Error('unavailable')).mockReturnValueOnce(retry.promise)
  await mount()
  await waitFor(() => expect(rows()).toHaveLength(2))
  tenant('south')
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Could not load inventory.'))
  expect(rows()).toEqual([])
  expect(screen.getByRole('status').textContent).toBe('Inventory unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(3))
  expect(transport.mock.calls[2]).toEqual(['south', ''])
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('Loading inventory…')
  await settle(retry, south)
  expect(rows()).toEqual(['001 — South Blue — 4 in stock', '002 — South Amber — 19 in stock'])
})

test('preserves order, normalized search cache and cached empty-result behavior', async () => {
  transport.mockResolvedValueOnce([north[1], north[0]]).mockResolvedValueOnce([north[0]]).mockResolvedValueOnce([])
  await mount()
  await waitFor(() => expect(rows()).toEqual(['002 — North Amber — 7 in stock', '001 — North Blue — 12 in stock']))
  query('Blue')
  await waitFor(() => expect(rows()).toHaveLength(1))
  query('  bLuE  ')
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('1 items'))
  expect(transport).toHaveBeenCalledTimes(2)
  query('no-match')
  await waitFor(() => expect(screen.getByText('No matching items')).toBeTruthy())
  expect(screen.getByRole('status').textContent).toBe('0 items')
  query('')
  await waitFor(() => expect(rows()).toHaveLength(2))
  query('no-match')
  await waitFor(() => expect(screen.getByText('No matching items')).toBeTruthy())
  expect(transport).toHaveBeenCalledTimes(3)
})
