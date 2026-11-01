import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import App from './src/App'

afterEach(cleanup)

test('case-insensitive search matches mixed-case names', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.type(screen.getByRole('textbox', { name: 'Search items' }), 'aP')
  expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['Apple', 'Apricot'])
  expect(screen.getByRole('status').textContent).toBe('2 items')
})

test('surrounding whitespace is ignored', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.type(screen.getByRole('textbox', { name: 'Search items' }), '  bAN  ')
  expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['Banana'])
})

test('clearing restores the original ordered rows and count', async () => {
  const user = userEvent.setup()
  render(<App />)
  const input = screen.getByRole('textbox', { name: 'Search items' })
  await user.type(input, 'banana')
  await user.clear(input)
  expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['Apple', 'Apricot', 'Banana'])
  expect(screen.getByRole('status').textContent).toBe('3 items')
})

test('unmatched search has an empty state and zero count', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.type(screen.getByRole('textbox', { name: 'Search items' }), 'pear')
  expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  expect(screen.getByText('No matching items').textContent).toBe('No matching items')
  expect(screen.getByRole('status').textContent).toBe('0 items')
})
