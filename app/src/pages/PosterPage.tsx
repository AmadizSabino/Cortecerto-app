import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Salon } from '../lib/supabase'
import { qrPath } from '../lib/qr'
import { loadMarks, saveMarks } from '../lib/setup'
import { themeById, themeStyle } from '../lib/themes'

/** A printable A4 poster with the salon's booking QR code, in the salon's theme. */
export default function PosterPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [copied, setCopied] = useState(false)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    supabase.from('salons').select('*').eq('owner_id', session.user.id).maybeSingle().then(({ data }) => setSalon(data))
  }, [session])

  const link = salon ? `${location.origin}/s/${salon.slug}` : ''
  const qr = useMemo(() => (link ? qrPath(link) : null), [link])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === null) return <Navigate to="/registar" replace />
  if (salon === undefined || !qr) return <main className="page">A carregar…</main>

  function print() {
    saveMarks(salon!.id, { ...loadMarks(salon!.id), poster: true })
    window.print()
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true) } catch { /* clipboard blocked */ }
  }

  return (
    <div className="themed poster-wrap" style={themeStyle(themeById(salon.theme))}>
      <div className="page no-print">
        <header className="row"><h1>Poster com QR</h1><Link to="/painel">‹ Agenda</Link></header>
        <p className="muted">Imprima em A4 e ponha no balcão, no espelho ou na montra. O QR abre a sua página de marcação.</p>
        <button className="btn" onClick={print}>Imprimir</button>
        <div className="card">
          <strong>Para a bio do Instagram e o perfil do Google</strong>
          <p className="link-box">{link}</p>
          <button onClick={copy}>{copied ? 'Copiado ✓' : 'Copiar link'}</button>
        </div>
      </div>

      <section className="poster" aria-label="Pré-visualização do poster">
        <h2 className="poster-name">{salon.name}</h2>
        <p className="poster-title">Marque a sua visita</p>
        <svg className="poster-qr" viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`} role="img" aria-label="Código QR da página de marcação" shapeRendering="crispEdges">
          <rect x="-4" y="-4" width={qr.size + 8} height={qr.size + 8} fill="#fff" />
          <path fill="#111" d={qr.d} />
        </svg>
        <p className="poster-hint">Aponte a câmara do telemóvel ao código</p>
        <p className="poster-link">{link.replace(/^https?:\/\//, '')}</p>
      </section>
    </div>
  )
}
