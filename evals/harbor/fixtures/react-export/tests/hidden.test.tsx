import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const adapters = vi.hoisted(() => ({ fetchPage: vi.fn(), downloadCsv: vi.fn() }))
vi.mock('./src/api', () => ({ fetchPage: adapters.fetchPage }))
vi.mock('./src/csv', async (original) => ({ ...await original<typeof import('./src/csv')>(), downloadCsv: adapters.downloadCsv }))
import App from './src/App'
const a = { id: '001', name: 'Blue crate', note: 'aisle 1' }
const b = { id: '002', name: 'Amber crate', note: 'aisle 2' }
const c = { id: '003', name: 'Blue, large', note: 'Handle "gently"\nKeep dry' }
const d = { id: '004', name: 'Green crate', note: 'top\rshelf' }
const page = (rows: typeof a[], nextCursor: string | null = null, total = 4) => ({ rows, nextCursor, total })
function deferred() {
  let resolve!: (value: ReturnType<typeof page>) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<ReturnType<typeof page>>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function changeFilter(value: string) { fireEvent.change(screen.getByRole('textbox', { name: 'Search inventory' }), { target: { value } }) }
function clickExport() { fireEvent.click(screen.getByRole('button', { name: 'Export CSV' })) }
const table = () => screen.getByRole('table').textContent
// An independent RFC-style reader validates field values, allowing optional quoting.
function records(text: string): string[][] {
  expect(text.endsWith('\r\n')).toBe(true)
  const result: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ } else quoted = !quoted
    } else if (ch === ',' && !quoted) { row.push(field); field = '' }
    else if (ch === '\r' && text[i + 1] === '\n' && !quoted) { row.push(field); result.push(row); row = []; field = ''; i++ }
    else field += ch
  }
  expect(quoted).toBe(false)
  expect(row).toEqual([])
  expect(field).toBe('')
  return result
}
function downloaded(index = 0) { return records(adapters.downloadCsv.mock.calls[index][0]) }
async function mount(initial = page([a, b])) {
  adapters.fetchPage.mockResolvedValueOnce(initial)
  render(<App />)
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe(`${initial.total} matching items`))
}
async function complete(count = 1) {
  await waitFor(() => expect(adapters.downloadCsv).toHaveBeenCalledTimes(count))
  await waitFor(() => expect(screen.getByText('Export complete')).toBeTruthy())
}
beforeEach(() => { adapters.fetchPage.mockReset(); adapters.downloadCsv.mockReset() })
afterEach(cleanup)

test('follows opaque cursors through short and empty pages, deduplicates first occurrences, and writes valid CSV', async () => {
  await mount()
  const before = table()
  adapters.fetchPage.mockResolvedValueOnce(page([a, b], 'short'))
    .mockResolvedValueOnce(page([{ ...b, name: 'Later duplicate must not replace first' }], 'empty'))
    .mockResolvedValueOnce(page([], 'last'))
    .mockResolvedValueOnce(page([c, d]))
  clickExport()
  await complete()
  expect(adapters.fetchPage.mock.calls.slice(1).map(([request]) => [request.filter, request.cursor])).toEqual([
    ['', null], ['', 'short'], ['', 'empty'], ['', 'last'],
  ])
  expect(downloaded()).toEqual([
    ['id', 'name', 'note'], ['001', 'Blue crate', 'aisle 1'], ['002', 'Amber crate', 'aisle 2'],
    ['003', 'Blue, large', 'Handle "gently"\nKeep dry'], ['004', 'Green crate', 'top\rshelf'],
  ])
  expect(table()).toBe(before)
  expect(screen.getByRole('status').textContent).toBe('4 matching items')
  expect(screen.getByText('0 selected')).toBeTruthy()
})

test('captures filter and selection at click while the user changes both during a deferred export', async () => {
  await mount()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select 001' }))
  const pending = deferred()
  adapters.fetchPage.mockImplementation((request) => {
    if (request.cursor === 'tail') return Promise.resolve(page([c]))
    if (request.filter === 'Blue') return Promise.resolve(page([c], null, 1))
    return pending.promise
  })
  clickExport()
  expect(screen.getByRole('button', { name: 'Export CSV' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByText('Exporting…')).toBeTruthy()
  changeFilter('Blue')
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('1 matching items'))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select 003' }))
  const during = table()
  await act(async () => { pending.resolve(page([a, b], 'tail')) })
  await complete()
  const tail = adapters.fetchPage.mock.calls.find(([request]) => request.cursor === 'tail')![0]
  expect(tail.filter).toBe('')
  expect(downloaded()).toEqual([['id', 'name', 'note'], ['001', 'Blue crate', 'aisle 1']])
  expect(table()).toBe(during)
  expect(screen.getByRole('status').textContent).toBe('1 matching items')
  expect((screen.getByRole('checkbox', { name: 'Select 003' }) as HTMLInputElement).checked).toBe(true)
  expect(screen.getByText('1 selected')).toBeTruthy()
})

test('first and consecutive clicks download their own fresh responses and click-time filters', async () => {
  await mount()
  const first = { id: '010', name: 'First fetched', note: 'first click' }
  adapters.fetchPage.mockResolvedValueOnce(page([first]))
  clickExport()
  await complete()
  expect(downloaded()).toEqual([['id', 'name', 'note'], ['010', 'First fetched', 'first click']])
  adapters.fetchPage.mockResolvedValueOnce(page([c], null, 1))
  changeFilter('Blue')
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('1 matching items'))
  const second = { id: '011', name: 'Second fetched', note: 'second click' }
  adapters.fetchPage.mockResolvedValueOnce(page([second], null, 1))
  clickExport()
  await complete(2)
  expect(downloaded(1)).toEqual([['id', 'name', 'note'], ['011', 'Second fetched', 'second click']])
  expect(adapters.fetchPage.mock.calls[3][0].filter).toBe('Blue')
  expect(table()).toContain('Blue, large')
})

test('late page failure produces no partial download or success and a fresh retry succeeds', async () => {
  await mount()
  const before = table()
  const later = deferred()
  adapters.fetchPage.mockResolvedValueOnce(page([a, b], 'later')).mockReturnValueOnce(later.promise)
  clickExport()
  await waitFor(() => expect(adapters.fetchPage).toHaveBeenCalledTimes(3))
  expect(adapters.downloadCsv).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
  expect(adapters.fetchPage).toHaveBeenCalledTimes(3)
  await act(async () => { later.reject(new Error('server unavailable')) })
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Export failed. Try again.'))
  expect(adapters.downloadCsv).not.toHaveBeenCalled()
  expect(screen.queryByText('Export complete')).toBeNull()
  expect(screen.getByRole('button', { name: 'Export CSV' }).hasAttribute('disabled')).toBe(false)
  expect(table()).toBe(before)
  adapters.fetchPage.mockResolvedValueOnce(page([a, b], 'retry-tail')).mockResolvedValueOnce(page([c]))
  clickExport()
  await complete()
  expect(adapters.fetchPage.mock.calls[3][0].cursor).toBeNull()
  expect(downloaded().map((row) => row[0])).toEqual(['id', '001', '002', '003'])
  expect(screen.queryByRole('alert')).toBeNull()
  expect(table()).toBe(before)
})

test('screen page and cross-page selection remain independent, with server order in the selected export', async () => {
  adapters.fetchPage.mockImplementation(({ cursor }) => Promise.resolve(cursor === 'screen-2' ? page([c, d]) : page([a, b], 'screen-2')))
  render(<App />)
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('4 matching items'))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select 002' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select 003' })).toBeTruthy())
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select 003' }))
  const before = table()
  const callIndex = adapters.fetchPage.mock.calls.length
  clickExport()
  await complete()
  expect(adapters.fetchPage.mock.calls[callIndex][0].cursor).toBeNull()
  expect(downloaded()).toEqual([['id', 'name', 'note'], ['002', 'Amber crate', 'aisle 2'], ['003', 'Blue, large', 'Handle "gently"\nKeep dry']])
  expect(table()).toBe(before)
  expect(screen.getByText('2 selected')).toBeTruthy()
  expect((screen.getByRole('checkbox', { name: 'Select 003' }) as HTMLInputElement).checked).toBe(true)
  expect(screen.getByRole('button', { name: 'First page' }).hasAttribute('disabled')).toBe(false)
})

test('empty result still downloads one header-only file', async () => {
  await mount(page([], null, 0))
  adapters.fetchPage.mockResolvedValueOnce(page([], null, 0))
  clickExport()
  await complete()
  expect(downloaded()).toEqual([['id', 'name', 'note']])
  expect(screen.getByRole('status').textContent).toBe('0 matching items')
})

test('the real download adapter creates a UTF-8 inventory.csv file', async () => {
  const actual = await vi.importActual<typeof import('./src/csv')>('./src/csv')
  const makeUrl = vi.fn(() => 'blob:synthetic-export')
  const revoke = vi.fn()
  const priorCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const priorRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: makeUrl })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
  const clicked: { name: string; href: string }[] = []
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicked.push({ name: this.download, href: this.href }) })
  try {
    actual.downloadCsv('id,name,note\r\n')
    expect(clicked).toEqual([{ name: 'inventory.csv', href: 'blob:synthetic-export' }])
    expect(makeUrl).toHaveBeenCalledTimes(1)
    expect(makeUrl.mock.calls[0][0].type).toBe('text/csv;charset=utf-8')
  } finally {
    click.mockRestore()
    if (priorCreate) Object.defineProperty(URL, 'createObjectURL', priorCreate); else delete (URL as any).createObjectURL
    if (priorRevoke) Object.defineProperty(URL, 'revokeObjectURL', priorRevoke); else delete (URL as any).revokeObjectURL
  }
})
