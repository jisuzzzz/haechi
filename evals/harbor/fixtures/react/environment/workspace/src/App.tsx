import { useState } from 'react'

const items = ['Apple', 'Apricot', 'Banana']

export default function App() {
  const [query, setQuery] = useState('')
  const visible = items.filter((item) => item.includes(query.trim()))

  return (
    <main>
      <h1>Item browser</h1>
      <label htmlFor="search">Search items</label>
      <input id="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      <p role="status">{visible.length} items</p>
      {visible.length ? <ul>{visible.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No matching items</p>}
    </main>
  )
}
