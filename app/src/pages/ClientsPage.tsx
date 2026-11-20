import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase, type Booking, type Salon, type Service } from '../lib/supabase'
import { AT_RISK_DAYS, buildClients, daysSince, filterClients, isAtRisk, type Client, type ClientFilter } from '../lib/clients'
import { formatTime } from '../lib/time'
import { formatPhone, waLink } from '../lib/whatsapp'
import { themeById, themeStyle } from '../lib/themes'

const FILTERS: { id: ClientFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'em_risco', label: 'Em risco' },
  { id: 'faltas', label: 'Com faltas' },
  { id: 'consentimento', label: 'Aceitam mensagens' },
]

const STATUS_LABEL: Record<Booking['status'], string> = {
  pendente: 'Pendente', confirmada: 'Confirmada', concluida: 'Concluída', faltou: 'Faltou', cancelada: 'Cancelada',
}

export default function ClientsPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Record<string, Service>>({})
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ClientFilter>('todos')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
  }, [])

  useEffect(() => {
    if (!session) return
    (async () => {
      const { data: s } = await supabase.from('salons').select('*').eq('owner_id', session.user.id).maybeSingle()
      setSalon(s)
      if (!s) return
      const [sv, bk] = await Promise.all([
        supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', s.id),
        supabase.from('bookings').select('*').eq('salon_id', s.id).order('starts_at', { ascending: false }).limit(5000),
      ])
      setServices(Object.fromEntries((sv.data ?? []).map(x => [x.id, x])))
      setBookings(bk.data ?? [])
    })()
  }, [session])

  const [now] = useState(() => new Date())
  const clients = useMemo(() => buildClients(bookings ?? [], services, now), [bookings, services, now])
  const shown = useMemo(() => filterClients(clients, query, filter, now), [clients, query, filter, now])
  const atRiskCount = useMemo(() => clients.filter(c => isAtRisk(c, now)).length, [clients, now])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />

  const tz = salon.timezone
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' })
  const bookingLink = `${location.origin}/s/${salon.slug}`

  function comeBackMsg(c: Client) {
    const first = c.name.split(' ')[0]
    return `Olá ${first}! Já temos saudades no ${salon!.name}. Quando quiser voltar, pode marcar aqui: ${bookingLink}`
  }

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page wide">
      <header className="row">
        <h1>Clientes</h1>
        <span className="row"><Link to="/painel">Agenda</Link><Link to="/definicoes">Definições</Link></span>
      </header>

      {bookings === null ? <p className="muted">A carregar…</p> : <>
        <p className="muted">
          {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
          {atRiskCount > 0 && <> · <button className="link" onClick={() => setFilter('em_risco')}>{atRiskCount} sem vir há mais de {AT_RISK_DAYS} dias</button></>}
        </p>

        <label>Procurar<input type="search" placeholder="Nome ou telemóvel" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <div className="days">
          {FILTERS.map(f => (
            <button key={f.id} className={`day ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>

        {clients.length === 0 && <p className="muted">Ainda não há clientes. Aparecem aqui assim que alguém marcar pelo seu link.</p>}
        {clients.length > 0 && shown.length === 0 && <p className="muted">Nenhum cliente encontrado.</p>}

        {shown.map(c => {
          const risk = isAtRisk(c, now)
          const expanded = open === c.key
          return (
            <article key={c.key} className="card client">
              <button className="client-head" onClick={() => setOpen(expanded ? null : c.key)} aria-expanded={expanded}>
                <span>
                  <strong>{c.name}</strong>
                  <small className="muted">
                    {c.visits} {c.visits === 1 ? 'visita' : 'visitas'}
                    {c.lastVisit && <> · última há {daysSince(c.lastVisit, now)} dias</>}
                  </small>
                </span>
                <span className="tags">
                  {c.nextBooking && <span className="tag">Marcado</span>}
                  {risk && <span className="tag warn">Em risco</span>}
                  {c.noShows > 0 && <span className="tag warn">{c.noShows} {c.noShows === 1 ? 'falta' : 'faltas'}</span>}
                </span>
              </button>

              {expanded && <div className="client-body">
                <div><a href={`tel:+${formatPhone(c.phone).replace(/\D/g, '')}`}>{formatPhone(c.phone)}</a></div>
                <div className="muted">
                  Gastou {euros(c.spentCents)}
                  {c.nextBooking && <> · próxima marcação {fmtDate(c.nextBooking)} às {formatTime(new Date(c.nextBooking), tz)}</>}
                </div>
                <div className="muted">{c.consent ? 'Aceita receber mensagens ✓' : 'Não aceitou mensagens de promoção'}</div>
                <div className="actions">
                  <a className="wa" href={waLink(c.phone, '')} target="_blank" rel="noreferrer">WhatsApp</a>
                  {c.consent && !c.nextBooking && (
                    <a className="wa" href={waLink(c.phone, comeBackMsg(c))} target="_blank" rel="noreferrer">Convidar a voltar</a>
                  )}
                </div>
                <h2>Histórico</h2>
                <ul className="history">
                  {c.bookings.map(b => (
                    <li key={b.id} className={`st-${b.status}`}>
                      <span>{fmtDate(b.starts_at)}</span>
                      <span>{services[b.service_id]?.name ?? 'Serviço'}</span>
                      <span className="tag">{STATUS_LABEL[b.status]}</span>
                    </li>
                  ))}
                </ul>
              </div>}
            </article>
          )
        })}
      </>}
    </main></div>
  )
}
