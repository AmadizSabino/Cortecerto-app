import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase, type Booking, type Professional, type Salon, type Service } from '../lib/supabase'
import { addDays, dateInTz, formatTime, zonedToUtc } from '../lib/time'
import { groupByDay, weekDays, weekStart } from '../lib/week'
import { themeById, themeStyle } from '../lib/themes'
import { bookingPrice } from '../lib/pricing'

interface Off { id: string; professional_id: string | null; starts_at: string; ends_at: string; reason: string | null }

/** The week at a glance: each day's bookings and blocks, with totals. Tap a day to open it. */
export default function WeekPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Record<string, Service>>({})
  const [pros, setPros] = useState<Record<string, Professional>>({})
  const [monday, setMonday] = useState(() => weekStart(dateInTz(new Date(), 'Europe/Lisbon')))
  const [pro, setPro] = useState('')
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [offs, setOffs] = useState<Off[]>([])

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    (async () => {
      const { data: s } = await supabase.from('salons').select('*').eq('owner_id', session.user.id).maybeSingle()
      setSalon(s)
      if (!s) return
      setMonday(weekStart(dateInTz(new Date(), s.timezone)))
      const [sv, pr] = await Promise.all([
        supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', s.id),
        supabase.from('professionals').select('id,name').eq('salon_id', s.id).order('name'),
      ])
      setServices(Object.fromEntries((sv.data ?? []).map(x => [x.id, x])))
      setPros(Object.fromEntries((pr.data ?? []).map(x => [x.id, x])))
    })()
  }, [session])

  useEffect(() => {
    if (!salon) return
    setBookings(null)
    const from = zonedToUtc(monday, '00:00', salon.timezone).toISOString()
    const to = zonedToUtc(addDays(monday, 7), '00:00', salon.timezone).toISOString()
    supabase.from('bookings').select('*').eq('salon_id', salon.id).gte('starts_at', from).lt('starts_at', to).neq('status', 'cancelada')
      .then(({ data }) => setBookings(data ?? []))
    supabase.from('time_off').select('id,professional_id,starts_at,ends_at,reason').eq('salon_id', salon.id).lt('starts_at', to).gt('ends_at', from)
      .then(({ data, error }) => setOffs(error ? [] : data ?? []))
  }, [salon, monday])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />

  const tz = salon.timezone
  const today = dateInTz(new Date(), tz)
  const shown = (bookings ?? []).filter(b => !pro || b.professional_id === pro)
  const byDay = groupByDay(shown, tz)
  const days = weekDays(monday)
  const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + 'T12:00:00Z').toLocaleDateString('pt-PT', opts)
  const price = (b: Booking) => bookingPrice(b, services)
  const weekTotal = shown.filter(b => b.status !== 'faltou').reduce((s, b) => s + price(b), 0)
  const proList = Object.values(pros)

  /** Time off that touches a day, for the chosen professional (or anyone). */
  function offsOn(day: string) {
    const from = zonedToUtc(day, '00:00', tz), to = zonedToUtc(addDays(day, 1), '00:00', tz)
    return offs.filter(o => new Date(o.starts_at) < to && new Date(o.ends_at) > from && (!pro || !o.professional_id || o.professional_id === pro))
      .map(o => {
        const s = new Date(o.starts_at), e = new Date(o.ends_at)
        const whole = s <= from && e >= to
        return { ...o, label: whole ? 'Dia bloqueado' : `Bloqueado ${formatTime(s < from ? from : s, tz)}–${formatTime(e > to ? to : e, tz)}` }
      })
  }

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page wide">
      <header className="row">
        <h1>Semana</h1>
        <span className="row"><Link to="/painel">Dia</Link><Link to="/clientes">Clientes</Link></span>
      </header>

      <div className="row">
        <button className="day" onClick={() => setMonday(addDays(monday, -7))} aria-label="Semana anterior">‹</button>
        <strong>{fmtDay(monday, { day: 'numeric', month: 'short' })} – {fmtDay(addDays(monday, 6), { day: 'numeric', month: 'short' })}</strong>
        <button className="day" onClick={() => setMonday(addDays(monday, 7))} aria-label="Semana seguinte">›</button>
      </div>
      {monday !== weekStart(today) && <button className="link" onClick={() => setMonday(weekStart(today))}>Voltar a esta semana</button>}

      {proList.length > 1 && (
        <div className="days">
          <button className={pro === '' ? 'day on' : 'day'} onClick={() => setPro('')}>Todos</button>
          {proList.map(p => <button key={p.id} className={pro === p.id ? 'day on' : 'day'} onClick={() => setPro(p.id)}>{p.name}</button>)}
        </div>
      )}

      {bookings === null ? <p className="muted">A carregar…</p> : <>
        <p className="muted">{shown.length} {shown.length === 1 ? 'marcação' : 'marcações'} · {euros(weekTotal)} previstos</p>
        {days.map(d => {
          const list = byDay[d] ?? []
          const dayOffs = offsOn(d)
          const total = list.filter(b => b.status !== 'faltou').reduce((s, b) => s + price(b), 0)
          return (
            <section key={d} className={`card week-day ${d === today ? 'today' : ''}`}>
              <Link to={`/painel?dia=${d}`} className="week-head">
                <strong>{fmtDay(d, { weekday: 'long', day: 'numeric', month: 'short' })}{d === today && ' · hoje'}</strong>
                <span className="muted">{list.length ? `${list.length} · ${euros(total)}` : 'livre'} ›</span>
              </Link>
              {dayOffs.map(o => (
                <div key={o.id} className="week-row off">
                  <span>{o.label}</span><span className="muted">{o.professional_id ? pros[o.professional_id]?.name : 'Todo o salão'}{o.reason && ` · ${o.reason}`}</span>
                </div>
              ))}
              {list.map(b => (
                <div key={b.id} className={`week-row st-${b.status}`}>
                  <span className="week-time">{formatTime(new Date(b.starts_at), tz)}</span>
                  <span>{b.client_name}</span>
                  <span className="muted">{services[b.service_id]?.name}{!pro && proList.length > 1 && ` · ${pros[b.professional_id]?.name ?? ''}`}</span>
                </div>
              ))}
            </section>
          )
        })}
      </>}
    </main></div>
  )
}
