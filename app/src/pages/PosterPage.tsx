import { useEffect, useMemo, useState } from 'react'
import { mediaUrl } from '../lib/brand'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Salon } from '../lib/supabase'
import { qrPath } from '../lib/qr'
import { loadMarks, saveMarks } from '../lib/setup'
import { themeById, themeStyle } from '../lib/themes'
import { loadMySalon } from '../lib/mySalon'
import HelpLink from '../HelpLink'
import { publicOrigin } from '../lib/publicOrigin'

/** A printable A4 poster with the salon's booking QR code, in the salon's theme. */
export default function PosterPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [copied, setCopied] = useState(false)
  const [params] = useSearchParams()
  const queue = params.get('fila') === '1' // poster for the walk-in queue instead of bookings
  const shop = !queue && params.get('loja') === '1' // poster for the salon's shop (migration 0032)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => { setSalon(r.salon) })
  }, [session])

  const link = salon ? `${publicOrigin()}/${queue ? 'f' : 's'}/${salon.slug}${shop ? '?loja=1' : ''}` : ''
  // The QR code carries ?src=cartaz, so /admin > Site counts visits that came from the poster.
  const qr = useMemo(() => (link ? qrPath(`${link}${shop ? '&' : '?'}src=cartaz`) : null), [link, shop])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === null) return <Navigate to="/registar" replace />
  if (salon === undefined || !qr) return <main className="page">A carregar…</main>

  function print() {
    if (!queue && !shop) saveMarks(salon!.id, { ...loadMarks(salon!.id), poster: true })
    window.print()
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true) } catch { /* clipboard blocked */ }
  }

  return (
    <div className="themed poster-wrap" style={themeStyle(themeById(salon.theme))}>
      <div className="page no-print">
        <header className="row"><h1>{queue ? 'Poster da fila' : shop ? 'Poster da loja' : 'Poster com QR'}<HelpLink screen={queue ? '/fila' : shop ? '/loja' : '/poster'} /></h1><Link to={queue ? '/fila' : shop ? '/loja' : '/mais'}>‹ {queue ? 'Fila' : shop ? 'Loja' : 'Mais'}</Link></header>
        <p className="muted">{queue
          ? 'Imprima em A4 e ponha à entrada. Quem chega sem marcação lê o QR e entra na fila sem esperar ao balcão.'
          : shop ? 'Imprima e ponha junto aos produtos, no balcão ou no espelho. O QR abre a sua loja: o cliente reserva e leva na visita.'
          : 'Imprima em A4 e ponha no balcão, no espelho ou na montra. O QR abre a sua página de marcação.'}</p>
        <p className="muted small">
          {(queue || shop) && <Link to="/poster">Ver o poster de marcações</Link>}
          {!queue && !shop && <><Link to="/poster?fila=1">Ver o poster da fila de espera</Link> · <Link to="/poster?loja=1">Ver o poster da loja</Link></>}
        </p>
        <button className="btn" onClick={print}>Imprimir</button>
        <div className="card">
          <strong>Para a bio do Instagram e o perfil do Google</strong>
          <p className="link-box">{link}</p>
          <button onClick={copy}>{copied ? 'Copiado ✓' : 'Copiar link'}</button>
        </div>
      </div>

      <section className="poster" aria-label="Pré-visualização do poster">
        {salon.logo_path && <img className="poster-logo" src={mediaUrl(salon.logo_path)!} alt="" />}
        <h2 className="poster-name">{salon.name}</h2>
        <p className="poster-title">{queue ? 'Sem marcação? Entre na fila' : shop ? 'Leve os nossos produtos' : 'Marque a sua visita'}</p>
        <svg className="poster-qr" viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`} role="img" aria-label={queue ? 'Código QR da fila de espera' : shop ? 'Código QR da loja' : 'Código QR da página de marcação'} shapeRendering="crispEdges">
          <rect x="-4" y="-4" width={qr.size + 8} height={qr.size + 8} fill="#fff" />
          <path fill="#111" d={qr.d} />
        </svg>
        <p className="poster-hint">{queue ? 'Aponte a câmara e veja quantas pessoas tem à frente' : shop ? 'Aponte a câmara, reserve e leve na próxima visita' : 'Aponte a câmara do telemóvel ao código'}</p>
        <p className="poster-link">{link.replace(/^https?:\/\//, '')}</p>
      </section>
    </div>
  )
}
