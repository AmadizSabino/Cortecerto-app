import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { LegalDoc } from './lib/legal'
import { recordAcceptance } from './lib/acceptance'

/** Shown instead of the panel when the owner has not accepted the current terms. */
export default function TermsGate({ docs, salonId, onAccepted }: { docs: LegalDoc[]; salonId: string; onAccepted: () => void }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const all = docs.every(d => checked[d.id])

  async function accept(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const ok = await recordAcceptance(docs, salonId)
    setSaving(false)
    if (ok) onAccepted()
    else setError('Não foi possível guardar. Tente de novo.')
  }

  return (
    <form className="card" onSubmit={accept}>
      <h2>Antes de continuar</h2>
      <p className="muted">{docs.length === 1 ? 'Este documento foi atualizado.' : 'Para usar a CorteCerto, leia e aceite:'}</p>
      {docs.map(d => (
        <label key={d.id} className="check">
          <input type="checkbox" checked={Boolean(checked[d.id])} onChange={e => setChecked(c => ({ ...c, [d.id]: e.target.checked }))} />
          <span>Li e aceito {d.withArticle.split(' ')[0]} <Link to={d.path} target="_blank">{d.withArticle.split(' ').slice(1).join(' ')}</Link>.</span>
        </label>
      ))}
      {error && <p className="error">{error}</p>}
      <button className="btn" disabled={!all || saving}>{saving ? 'A guardar…' : 'Aceitar e continuar'}</button>
    </form>
  )
}
