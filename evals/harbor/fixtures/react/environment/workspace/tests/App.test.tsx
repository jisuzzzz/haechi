import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import App from '../src/App'

afterEach(cleanup)

test('empty search shows every item', () => {
  render(<App />)
  expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['Apple', 'Apricot', 'Banana'])
  expect(screen.getByRole('status').textContent).toBe('3 items')
})

test('matching substring filters the list and count', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.type(screen.getByRole('textbox', { name: 'Search items' }), 'Ban')
  expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['Banana'])
  expect(screen.getByRole('status').textContent).toBe('1 items')
})
