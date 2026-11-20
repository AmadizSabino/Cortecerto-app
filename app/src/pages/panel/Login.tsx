import { useState } from 'react'
import Icon from '../../components/Icon'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  async function send(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/painel' } })
    if (error) setError(error.message.includes('rate') ? 'Muitos pedidos seguidos. Espere um minuto e tente de novo.' : 'Não foi possível enviar o link. Tente de novo.')
    else setSent(true)
  }
  return (
    <main className="page" style={{ paddingTop: 48 }}>
      <span className="avatar" style={{ width: 56, height: 56, fontSize: '1.4rem' }}><Icon name="scissors" size={26} /></span>
      <h1 style={{ margin: '20px 0 8px' }}>Painel do salão</h1>
      <p className="muted">Entre com o seu email. Enviamos um link de acesso, sem palavra-passe.</p>
      {sent ? (
        <div className="card soft" style={{ marginTop: 24 }}>
          <h3>Veja o seu email</h3>
          <p style={{ marginTop: 6 }}>Enviámos um link para <b>{email}</b>. Abra-o neste dispositivo para entrar.</p>
        </div>
      ) : (
        <form onSubmit={send} style={{ marginTop: 20 }}>
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="nome@exemplo.pt" /></label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary block">Receber link de acesso</button>
          <p className="muted small" style={{ marginTop: 16 }}>Ainda não tem conta? Use o mesmo botão: depois do link, criamos o seu salão em 4 passos.</p>
        </form>
      )}
    </main>
  )
}
