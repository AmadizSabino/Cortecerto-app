import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon from '../components/Icon'
import { supabase, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import { themeById, themeStyle } from '../lib/themes'
import { SALON_TYPES } from '../lib/onboarding'
import { cardById, cardsFor, salonTypes, STYLE_CARDS } from '../lib/styleCatalog'
import { styleOptions } from '../lib/styles'
import HelpLink from '../HelpLink'
import AiTryOn from '../components/AiTryOn'
import { ClientFacts, StyleGrid, StyleSheet, StyleVideo } from '../components/StyleCards'

/**
 * Mais > Estilos: the style cards for the salon's kinds of work. The team sees how each style
 * is done; managers choose which ones clients see on the booking page.
 * ?e=<id> opens one card (the link on a booking in Hoje).
 */
export default function StylesPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [services, setServices] = useState<string[]>([])
  const [params, setParams] = useSearchParams()
  const [area, setArea] = useState('')
  const [trying, setTrying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(async r => {
      setRole(r.role); setSalon(r.salon)
      if (!r.salon) return
      const { data } = await supabase.from('services').select('name').eq('salon_id', r.salon.id).eq('active', true)
      setServices((data ?? []).map(s => s.name))
    })
  }, [session])

  if (session === null) return <Navigate to="/painel" replace />
  if (session === undefined || salon === undefined) return <main className="page"><p className="muted">A carregar…</p></main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (!can(role, 'estilos')) return <Navigate to="/painel" replace />

  const hidden = salon.styles_hidden ?? []
  const all = cardsFor(salonTypes(salon))
  // Areas of the salon that have cards, for the filter (only when there is more than one).
  const areas = SALON_TYPES.filter(t => salonTypes(salon).includes(t.id) && STYLE_CARDS.some(c => c.types.includes(t.id)))
  const cards = area ? all.filter(c => c.types.includes(area as never)) : all
  const open = cardById(params.get('e'))
  const manage = can(role, 'estilosMostrar')
  const openCard = (id: string | null) => { setTrying(false); setError(''); setParams(id ? { e: id } : {}, { replace: !id }) }

  async function toggle(id: string) {
    const next = hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id]
    setSaving(true); setError('')
    const { error } = await supabase.rpc('set_styles_hidden', { p_salon: salon!.id, p_hidden: next })
    setSaving(false)
    if (error) setError('Não foi possível guardar. Tente de novo.')
    else setSalon({ ...salon!, styles_hidden: [...next].sort() })
  }

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page">
      <header className="row"><h1>Estilos<HelpLink /></h1><Link to="/mais">‹ Mais</Link></header>
      <p className="muted">Fichas dos estilos que os clientes pedem: uma foto, para quem é, quanto tempo leva e o passo a passo. Os clientes veem as fotos na sua página de marcação e podem escolher um estilo ao marcar.</p>
      {areas.length > 1 && (
        <div className="chips">
          <button className={area === '' ? 'chip on' : 'chip'} onClick={() => setArea('')}>Todos</button>
          {areas.map(a => <button key={a.id} className={area === a.id ? 'chip on' : 'chip'} onClick={() => setArea(a.id)}>{a.label}</button>)}
        </div>
      )}
      {cards.length === 0
        ? <p className="card muted">Ainda não há fichas para este tipo de salão. Estamos a preparar mais estilos.</p>
        : <StyleGrid cards={cards} hidden={hidden} onOpen={c => openCard(c.id)} />}
      <p className="muted small">As fotos são ilustrativas, criadas por IA: não são pessoas reais. O passo a passo é uma referência; cada profissional adapta-o ao cliente.</p>

      {open && (
        <StyleSheet card={open} onClose={() => openCard(null)}>
          <ClientFacts card={open} />
          <h3>Como se faz</h3>
          <dl className="kv style-kv">
            <dt>Tempo</dt><dd>Cerca de {open.minutes} min</dd>
            <dt>Material</dt><dd>{open.tools}</dd>
          </dl>
          <ol className="style-steps">{open.steps.map(s => <li key={s}>{s}</li>)}</ol>
          <StyleVideo card={open} />
          <div className="actions">
            {!trying && can(role, 'clientes') && <button onClick={() => setTrying(true)}><Icon name="camera" size={16} />Antes e depois com um cliente</button>}
          </div>
          {trying && <AiTryOn feature="before-after" title="Antes e depois" initialStyle={open.name}
            intro="Tire a foto do cliente e mostre-lhe como fica com este estilo."
            styles={styleOptions(salon.type, [open.name, ...services])} />}
          {manage && (
            <label className="check style-toggle">
              <input type="checkbox" checked={!hidden.includes(open.id)} disabled={saving} onChange={() => toggle(open.id)} />
              <span>Mostrar este estilo aos clientes na página de marcação</span>
            </label>
          )}
          {error && <p className="error small" role="alert">{error}</p>}
        </StyleSheet>
      )}
    </main></div>
  )
}
