import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { authError, MIN_PASSWORD } from '../lib/auth'

/**
 * Choose a new password. Reached from the "Esqueci-me da palavra-passe" email (Supabase signs the
 * person in from the link), or from Mais while signed in, to set one for the first time.
 */
export default function PasswordPage() {
  const [session, setSession] = useState<Session | null>()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { if (s) setSession(s) })
    return () => data.subscription.unsubscribe()
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(undefined)
    if (pw.length < MIN_PASSWORD) return setMsg({ ok: false, text: `Pelo menos ${MIN_PASSWORD} caracteres.` })
    if (pw !== pw2) return setMsg({ ok: false, text: 'As duas palavras-passe não são iguais.' })
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message.toLowerCase().includes('different') ? 'Escolha uma palavra-passe diferente da anterior.' : authError(error.message) })
    setMsg({ ok: true, text: 'Palavra-passe guardada. Da próxima vez entre com o email e esta palavra-passe.' })
    setPw(''); setPw2('')
  }

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return (
    <main className="page">
      <h1>Palavra-passe</h1>
      <p className="muted">O link expirou ou já foi usado. Peça um novo em <Link to="/painel">Entrar › Esqueci-me da palavra-passe</Link>.</p>
    </main>
  )
  return (
    <main className="page">
      <p><Link to="/mais">‹ Mais</Link></p>
      <h1>Palavra-passe</h1>
      <p className="muted">Conta {session.user.email}</p>
      <form onSubmit={save} className="card">
        <label>Nova palavra-passe<input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} required /></label>
        <label>Repetir<input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} required /></label>
        <button className="btn" disabled={busy}>{busy ? 'A guardar…' : 'Guardar palavra-passe'}</button>
        {msg && <p className={msg.ok ? 'ok' : 'error'} role="alert">{msg.text}</p>}
      </form>
      {msg?.ok && <p><Link to="/painel">Ir para a agenda ›</Link></p>}
    </main>
  )
}
