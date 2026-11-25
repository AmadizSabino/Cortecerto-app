import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pushState, sendTest, turnOff, turnOn, type PushState } from '../lib/push'

const TEXT: Record<PushState, string> = {
  ligado: 'Ligado neste aparelho. Cada nova marcação aparece no ecrã, mesmo com a app fechada.',
  desligado: 'Receba um aviso no telemóvel a cada nova marcação, online ou feita por alguém da equipa.',
  bloqueado: 'Os avisos estão bloqueados para a CorteCerto neste aparelho. Ative-os nas definições do telemóvel ou do browser.',
  instalar: 'No iPhone, os avisos só funcionam com a app no ecrã principal.',
  'sem-suporte': 'Este browser não recebe avisos. Experimente no Chrome, Safari ou Edge atualizados.',
}

/** "Avisos no telemóvel": switch phone notifications on or off for this device. */
export default function PushToggle() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { pushState().then(setState).catch(() => setState('sem-suporte')) }, [])
  if (!state) return null

  async function toggle() {
    setBusy(true); setError('')
    const r = state === 'ligado' ? await turnOff() : await turnOn()
    setBusy(false)
    if (r === 'ligado' || r === 'desligado' || r === 'bloqueado' || r === 'instalar' || r === 'sem-suporte') setState(r)
    else setError(r)
  }

  return (
    <div className="card">
      <p className="muted">{TEXT[state]}</p>
      {state === 'instalar' && <p><Link to="/app">Como pôr a app no ecrã principal</Link></p>}
      {(state === 'ligado' || state === 'desligado') && (
        <button type="button" className={state === 'ligado' ? '' : 'btn'} onClick={toggle} disabled={busy}>
          {busy ? 'Um momento…' : state === 'ligado' ? 'Desligar avisos neste aparelho' : 'Ligar avisos no telemóvel'}
        </button>
      )}
      {state === 'ligado' && (
        <button type="button" className="link" style={{ marginLeft: 12 }} disabled={busy}
          onClick={async () => { setBusy(true); setTest(null); setTest(await sendTest()); setBusy(false) }}>Enviar aviso de teste</button>
      )}
      {test && <p className={test.ok ? 'ok small' : 'error small'} role="status">{test.text}</p>}
      {error && <p className="error small">{error}</p>}
    </div>
  )
}

/** A one-time card on Hoje that offers to switch notifications on. Hidden once on, blocked or closed. */
export function PushNudge() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let closed = false
    try { closed = localStorage.getItem('cc-push-nudge') === 'fechado' } catch { /* no storage */ }
    if (!closed) pushState().then(s => setShow(s === 'desligado')).catch(() => {})
  }, [])
  if (!show) return null
  const close = () => { try { localStorage.setItem('cc-push-nudge', 'fechado') } catch { /* no storage */ } setShow(false) }
  return (
    <div className="card push-nudge">
      <div className="row"><strong>🎉 Saiba logo quando entra uma marcação</strong><button type="button" className="link" onClick={close} aria-label="Fechar">✕</button></div>
      <p className="muted small">Um aviso no telemóvel a cada nova marcação, com a contagem do dia. É grátis.</p>
      <button type="button" className="btn" onClick={async () => { const r = await turnOn(); if (r === 'ligado' || r === 'bloqueado') close() }}>Ligar avisos</button>
    </div>
  )
}
