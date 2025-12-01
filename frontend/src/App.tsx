import React, { useState, FormEvent } from 'react'

export default function App() {
  const [flavor, setFlavor] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!flavor) { setStatus('Please select a flavor.'); return }
    setBusy(true); setStatus('Submitting...')
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flavor })
      })
      const data = await res.json()
      if (!res.ok) setStatus(data.error || 'Something went wrong')
      else setStatus(data.message || 'Success!')
    } catch (err) {
      console.error(err)
      setStatus('Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1>Pick your favorite ice cream</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="flavor">Flavor</label>
        <select id="flavor" value={flavor} onChange={e => setFlavor(e.target.value)} required>
          <option value="">-- choose --</option>
          <option value="vanilla">Vanilla</option>
          <option value="chocolate">Chocolate</option>
          <option value="strawberry">Strawberry</option>
          <option value="mint">Mint</option>
          <option value="cookie-dough">Cookie Dough</option>
        </select>
        <button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit'}</button>
      </form>
      <div className="status">{status}</div>
    </div>
  )
}
