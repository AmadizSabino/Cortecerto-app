import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { qrPath } from '../../lib/qr'

/**
 * Two-step login for the admin (Supabase MFA, TOTP; migration 0028).
 * Once an authenticator app is set up, /admin asks for its 6-digit code after the password,
 * and the database only treats the session as admin after the code (aal2).
 */

const clean = (v: string) => v.replace(/\D/g, '').slice(0, 6)

/** Asks for the code after the password, when the admin has an authenticator app. */
export function MfaPrompt({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setMsg('')
    const { data } = await supabase.auth.mfa.listFactors()
    const factor = data?.totp?.[0]
    if (!factor) return onDone()
    setBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    setBusy(false)
    if (error) { setCode(''); return setMsg('Código errado ou fora de tempo. Use o código que está agora na app.') }
    onDone()
  }
  return (
    <main className="page">
      <h1>Código de acesso</h1>
      <form onSubmit={verify} className="card">
        <p>Abra a app de autenticação no telemóvel e escreva o código de 6 dígitos da CorteCerto.</p>
        <label>Código<input inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={e => setCode(clean(e.target.value))} placeholder="123456" /></label>
        <button className="btn" disabled={busy || code.length !== 6}>{busy ? 'A verificar…' : 'Entrar'}</button>
        {msg && <p className="error">{msg}</p>}
        <p className="muted small">Perdeu o telemóvel? No Supabase, em Authentication › Users, abra o seu utilizador e apague o fator MFA. Depois entra só com a palavra-passe e pode ativar outra vez.</p>
      </form>
      <button className="link" onClick={() => supabase.auth.signOut().then(() => location.assign('/painel'))}>Sair</button>
    </main>
  )
}

/** The QR code drawn here from the otpauth:// link, like the salon poster's. */
function QrCode({ text }: { text: string }) {
  const qr = qrPath(text)
  return (
    <svg className="mfa-qr" viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`} width={200} height={200} role="img" aria-label="Código QR para a app de autenticação" shapeRendering="crispEdges">
      <rect x="-4" y="-4" width={qr.size + 8} height={qr.size + 8} fill="#fff" />
      <path fill="#111" d={qr.d} />
    </svg>
  )
}

/** /admin > Sistema: set up or remove the authenticator app. */
export function AdminSecurity() {
  const [on, setOn] = useState<{ id: string; name: string; at: string } | null>()
  const [setup, setSetup] = useState<{ id: string; uri: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) return setOn(null)
    const f = data.totp[0]
    setOn(f ? { id: f.id, name: f.friendly_name ?? 'App de autenticação', at: f.created_at } : null)
  }
  useEffect(() => { load() }, [])

  async function start() {
    setMsg(undefined); setBusy(true)
    // A setup left half-way blocks a new one: remove unverified factors first.
    const { data } = await supabase.auth.mfa.listFactors()
    for (const f of data?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data: d, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `CorteCerto admin ${new Date().toISOString().slice(0, 10)}` })
    setBusy(false)
    if (error || !d) return setMsg({ ok: false, text: 'Não foi possível começar. Confirme no Supabase que Authentication › Multi-Factor › TOTP está ligado.' })
    setSetup({ id: d.id, uri: d.totp.uri, secret: d.totp.secret })
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault()
    if (!setup) return
    setBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.id, code })
    setBusy(false)
    if (error) { setCode(''); return setMsg({ ok: false, text: 'Código errado. Escreva o código que aparece agora na app.' }) }
    setSetup(null); setCode('')
    setMsg({ ok: true, text: 'Ativado. Da próxima vez que entrar no admin, a app pede o código depois da palavra-passe.' })
    load()
  }
  async function remove() {
    if (!on) return
    setBusy(true)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: on.id })
    setBusy(false)
    setMsg(error ? { ok: false, text: 'Não foi possível desligar.' } : { ok: true, text: 'Desligado. O admin volta a pedir só a palavra-passe.' })
    load()
  }

  return (
    <section className="card">
      <h2>Segurança do admin</h2>
      {on === undefined && <p className="muted">A carregar…</p>}
      {on && <>
        <p><span className="tag concluida">Ligado</span> Código de 2 passos com {on.name}, desde {new Date(on.at).toLocaleDateString('pt-PT')}.</p>
        <button className="link danger-link" disabled={busy} onClick={remove}>Desligar o código de 2 passos</button>
      </>}
      {on === null && !setup && <>
        <p>Com o código de 2 passos, quem souber a sua palavra-passe não entra no admin sem o seu telemóvel. Recomendado: o admin vê os dados e o dinheiro de todos os salões.</p>
        <button className="btn-inline" disabled={busy} onClick={start}>Ativar código de 2 passos</button>
        <p className="muted small">Precisa de uma app de autenticação no telemóvel: Google Authenticator, Microsoft Authenticator ou a app Palavras-passe do iPhone. Só o admin é afetado; o painel do salão continua igual.</p>
      </>}
      {setup && (
        <form onSubmit={confirm} className="mfa-setup">
          <p>1. Na app de autenticação, leia este código QR.</p>
          <QrCode text={setup.uri} />
          <p className="muted small">Ou escreva esta chave: <code>{setup.secret}</code></p>
          <label>2. Escreva o código de 6 dígitos que aparece na app<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(clean(e.target.value))} placeholder="123456" /></label>
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button className="btn-inline" disabled={busy || code.length !== 6}>Confirmar</button>
            <button type="button" className="link" onClick={() => { setSetup(null); setCode('') }}>Cancelar</button>
          </div>
        </form>
      )}
      {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
    </section>
  )
}
