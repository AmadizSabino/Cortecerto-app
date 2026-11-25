import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon from '../components/Icon'
import PushToggle from '../components/PushToggle'
import { supabase, type Salon } from '../lib/supabase'
import { loadMySalon } from '../lib/mySalon'
import { themeById, themeStyle } from '../lib/themes'

/** What to send clients so they book online. */
const shareText = (salon: Pick<Salon, 'name'>, link: string) => `Já pode marcar no ${salon.name} online, a qualquer hora: ${link}`

/**
 * /no-ar: the end of the sign-up wizard. The salon is live: share the link, switch on the
 * phone alerts and make a test booking, so the owner sees the first alert arrive.
 */
export default function LivePage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [copied, setCopied] = useState(false)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => { if (session) loadMySalon(session.user.id).then(r => setSalon(r.salon)) }, [session])

  if (session === null) return <Navigate to="/painel" replace />
  if (session === undefined || salon === undefined) return <main className="page"><p className="muted">A carregar…</p></main>
  if (salon === null) return <Navigate to="/registar" replace />

  const link = `${location.origin}/s/${salon.slug}`
  const text = shareText(salon, link)
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true) } catch { /* clipboard blocked */ }
  }
  async function share() {
    try { await navigator.share({ title: salon!.name, text, url: link }) } catch { /* cancelled */ }
  }

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page live">
      <div className="live-hero">
        <span className="live-badge" aria-hidden="true"><Icon name="check" size={32} /></span>
        <h1>O seu salão está no ar!</h1>
        <p className="muted">Os clientes de {salon.name} já podem marcar sozinhos, a qualquer hora. Faltam 3 coisas rápidas.</p>
      </div>

      <ol className="live-steps">
        <li className="card">
          <h2>1. Partilhe o seu link</h2>
          <p className="live-link"><a href={link} target="_blank" rel="noreferrer">{link.replace(/^https?:\/\//, '')}</a></p>
          <div className="actions">
            <button type="button" className="btn" onClick={copy}><Icon name="copy" size={16} />{copied ? 'Copiado' : 'Copiar link'}</button>
            <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
            {'share' in navigator && <button type="button" onClick={share}>Partilhar…</button>}
          </div>
          <p className="muted small">No Instagram: Editar perfil › Links › cole o link. No WhatsApp Business: ponha-o na mensagem de ausência e no estado. O poster com QR para o balcão está em <Link to="/poster">Poster</Link>.</p>
        </li>
        <li className="card">
          <h2>2. Ligue os avisos no telemóvel</h2>
          <p className="muted small">Assim sabe na hora quando alguém marca, mesmo com a app fechada.</p>
          <PushToggle />
        </li>
        <li className="card">
          <h2>3. Faça uma marcação de teste</h2>
          <p className="muted small">Marque como se fosse um cliente e veja o aviso chegar. Depois cancele-a em Hoje.</p>
          <Link className="btn" to={`/s/${salon.slug}?teste=1`}><Icon name="calendar" size={16} />Fazer uma marcação de teste</Link>
        </li>
      </ol>
      <p className="center"><Link to="/painel">Ir para o painel ›</Link></p>
    </main></div>
  )
}
