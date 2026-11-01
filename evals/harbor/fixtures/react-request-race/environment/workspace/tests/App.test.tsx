import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import App from '../src/App'
afterEach(cleanup)
test('lists a warehouse and filters after the request settles', async () => {
  const user = userEvent.setup()
  render(<App />)
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
  expect(screen.getByRole('status').textContent).toBe('2 items')
  await user.type(screen.getByRole('textbox', { name: 'Search inventory' }), 'Blue')
  await waitFor(() => expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['001 — North Blue — 12 in stock']))
})
