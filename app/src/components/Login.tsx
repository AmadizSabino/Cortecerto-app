import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { authError, MIN_PASSWORD } from '../lib/auth'
import { track } from '../lib/track'

type Mode = 'entrar' | 'criar' | 'link' | 'esqueci'
/**
 * Login for the salon panel: email and password (works inside the installed app, where an
 * email link would open the browser instead), a new account, or a link by email.
 */
export default function Login() {
  // ?conta=nova (the site's "Experimentar" buttons): open on "Criar conta".
  const [mode, setMode] = useState<Mode>(() => new URLSearchParams(location.search).get('conta') === 'nova' ? 'criar' : 'entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const back = location.origin + '/painel'

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(undefined)
    if ((mode === 'entrar' || mode === 'criar') && password.length < MIN_PASSWORD) return setMsg({ ok: false, text: `A palavra-passe precisa de pelo menos ${MIN_PASSWORD} caracteres.` })
    setBusy(true)
    const r = mode === 'entrar' ? await supabase.auth.signInWithPassword({ email, password })
      : mode === 'criar' ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: back } })
      : mode === 'link' ? await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: back } })
      : await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/palavra-passe' })
    setBusy(false)
    if (r.error) return setMsg({ ok: false, text: authError(r.error.message) })
    if (mode === 'criar') track('conta_criada', { page: 'registo' })
    if (mode === 'entrar') return location.assign('/painel')
    if (mode === 'criar' && 'data' in r && r.data && 'session' in r.data && r.data.session) return location.assign('/painel')
    setMsg({ ok: true, text: {
      criar: `Conta criada. Enviámos um email para ${email}: abra o link para confirmar e depois entre aqui.`,
      link: `Enviámos um link de acesso para ${email}.`,
      esqueci: `Enviámos um link para ${email} para escolher uma nova palavra-passe.`,
      entrar: '',
    }[mode] })
  }

  const go = (m: Mode) => { setMode(m); setMsg(undefined) }
  const needsPassword = mode === 'entrar' || mode === 'criar'
  return (
    <main className="page">
      <h1>{mode === 'criar' ? 'Crie o seu salão' : 'Painel do salão'}</h1>
      {mode === 'criar' && <p className="muted" style={{ marginTop: -4 }}>30 dias grátis, sem cartão e sem fidelização. Em 15 minutos tem a página de marcação no ar.</p>}
      <div className="chips admin-tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'entrar'} className={`chip${mode === 'entrar' ? ' on' : ''}`} onClick={() => go('entrar')}>Entrar</button>
        <button role="tab" aria-selected={mode === 'criar'} className={`chip${mode === 'criar' ? ' on' : ''}`} onClick={() => go('criar')}>Criar conta</button>
      </div>
      <form onSubmit={submit} className="card">
        {mode === 'link' && <p className="muted small">Receba um link por email e entre sem palavra-passe.</p>}
        {mode === 'esqueci' && <p className="muted small">Enviamos um link para escolher uma nova palavra-passe. Serve também para quem ainda não tem uma.</p>}
        <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        {needsPassword && (
          <label>Palavra-passe
            <span className="row" style={{ flexWrap: 'nowrap' }}>
              <input type={show ? 'text' : 'password'} autoComplete={mode === 'criar' ? 'new-password' : 'current-password'} value={password} minLength={MIN_PASSWORD} onChange={e => setPassword(e.target.value)} required />
              <button type="button" className="link" onClick={() => setShow(!show)}>{show ? 'Esconder' : 'Mostrar'}</button>
            </span>
          </label>
        )}
        {mode === 'criar' && <p className="muted small">Pelo menos {MIN_PASSWORD} caracteres.</p>}
        <button className="btn" disabled={busy}>{busy ? 'Um momento…' : { entrar: 'Entrar', criar: 'Criar conta e continuar', link: 'Receber link de acesso', esqueci: 'Enviar link' }[mode]}</button>
        {msg && <p className={msg.ok ? 'ok' : 'error'} role="alert">{msg.text}</p>}
      </form>
      <p className="row" style={{ justifyContent: 'center', gap: 16 }}>
        {mode !== 'esqueci' && <button className="link" onClick={() => go('esqueci')}>Esqueci-me da palavra-passe</button>}
        {mode !== 'link' && <button className="link" onClick={() => go('link')}>Entrar com link por email</button>}
        {(mode === 'link' || mode === 'esqueci') && <button className="link" onClick={() => go('entrar')}>Entrar com palavra-passe</button>}
      </p>
    </main>
  )
}
