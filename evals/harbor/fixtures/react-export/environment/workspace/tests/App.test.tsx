import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
const download = vi.hoisted(() => vi.fn())
vi.mock('../src/csv', async (original) => ({ ...await original<typeof import('../src/csv')>(), downloadCsv: download }))
import App from '../src/App'
afterEach(() => { cleanup(); download.mockClear() })
test('shows server count and exports a simple filtered single page', async () => {
  const user = userEvent.setup()
  render(<App />)
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('5 matching items'))
  await user.type(screen.getByRole('textbox', { name: 'Search inventory' }), 'Amber')
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('1 matching items'))
  await user.click(screen.getByRole('button', { name: 'Export CSV' }))
  await waitFor(() => expect(download).toHaveBeenCalledWith('id,name,note\r\n002,Amber crate,aisle 2\r\n'))
  expect(screen.getByRole('status').textContent).toBe('1 matching items')
  expect(screen.getByText('Export complete')).toBeTruthy()
})
