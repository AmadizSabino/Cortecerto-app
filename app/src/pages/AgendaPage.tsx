import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase, type Booking, type Professional, type Salon, type Service } from '../lib/supabase'
import { addDays, dateInTz, formatTime, zonedToUtc } from '../lib/time'
import { formatPhone, waLink } from '../lib/whatsapp'
import { themeById, themeStyle } from '../lib/themes'
import SetupChecklist from '../SetupChecklist'
import TermsGate from '../TermsGate'
import RemindersCard from '../RemindersCard'
import NextVisit from '../NextVisit'
import BookingEditor from '../BookingEditor'
import { pendingDocs } from '../lib/acceptance'
import type { LegalDoc } from '../lib/legal'
import { manageLink } from '../lib/clientChanges'

const STATUS_LABEL: Record<Booking['status'], string> = {
  pendente: 'Pendente', confirmada: 'Confirmada', concluida: 'Concluída', faltou: 'Faltou', cancelada: 'Cancelada',
}

function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  async function send(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/painel' } })
    if (!error) setSent(true)
  }
  return (
    <main className="page">
      <h1>Painel do salão</h1>
      {sent ? <p>Enviámos um link de acesso para <b>{email}</b>.</p> : (
        <form onSubmit={send} className="card">
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <button className="btn">Receber link de acesso</button>
        </form>
      )}
    </main>
  )
}

export default function AgendaPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Record<string, Service>>({})
  const [pros, setPros] = useState<Record<string, Professional>>({})
  const [date, setDate] = useState(() => dateInTz(new Date(), 'Europe/Lisbon'))
  const [bookings, setBookings] = useState<Booking[]>([])
  const [offs, setOffs] = useState<{ id: string; professional_id: string | null; starts_at: string; ends_at: string; reason: string | null }[]>([])
  const [pending, setPending] = useState<LegalDoc[] | null>(null)
  const [nextFor, setNextFor] = useState<string | null>(null) // booking id with the next-visit panel open
  const [editing, setEditing] = useState<'nova' | string | null>(null) // 'nova' or the id of the booking being edited

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    (async () => {
      const { data: s } = await supabase.from('salons').select('*').eq('owner_id', session.user.id).maybeSingle()
      setSalon(s)
      if (!s) return
      pendingDocs().then(setPending)
      const [sv, pr] = await Promise.all([
        supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', s.id),
        supabase.from('professionals').select('id,name').eq('salon_id', s.id),
      ])
      setServices(Object.fromEntries((sv.data ?? []).map(x => [x.id, x])))
      setPros(Object.fromEntries((pr.data ?? []).map(x => [x.id, x])))
    })()
  }, [session])

  useEffect(() => {
    if (!salon) return
    const from = zonedToUtc(date, '00:00', salon.timezone).toISOString()
    const to = zonedToUtc(addDays(date, 1), '00:00', salon.timezone).toISOString()
    supabase.from('bookings').select('*').eq('salon_id', salon.id).gte('starts_at', from).lt('starts_at', to).order('starts_at')
      .then(({ data }) => setBookings(data ?? []))
    // Time off on this day (migration 0009); ignored if the table isn't there yet.
    supabase.from('time_off').select('id,professional_id,starts_at,ends_at,reason').eq('salon_id', salon.id).lt('starts_at', to).gt('ends_at', from).order('starts_at')
      .then(({ data, error }) => setOffs(error ? [] : data ?? []))
  }, [salon, date])

  async function update(b: Booking, patch: Partial<Booking>) {
    const { error } = await supabase.from('bookings').update(patch).eq('id', b.id)
    if (!error) setBookings(bs => bs.map(x => x.id === b.id ? { ...x, ...patch } : x))
    // Right after a visit is the moment to book the next one.
    if (!error && patch.status === 'concluida') setNextFor(b.id)
  }

  /** After creating or editing: show it if it's on the day being viewed, otherwise go to its day. */
  function saved(nb: Booking) {
    setEditing(null)
    const day = dateInTz(new Date(nb.starts_at), salon?.timezone ?? 'Europe/Lisbon')
    if (day !== date) { setDate(day); return }
    setBookings(bs => [...bs.filter(x => x.id !== nb.id), nb].sort((x, y) => x.starts_at.localeCompare(y.starts_at)))
  }

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Login />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />

  const tz = salon.timezone
  const bookingLink = `${location.origin}/s/${salon.slug}`

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page wide">
      <header className="row">
        <h1>{salon.name}</h1>
        <span className="row"><Link to="/fila">Fila</Link><Link to="/lembretes">Lembretes</Link><Link to="/clientes">Clientes</Link><Link to="/definicoes">Definições</Link><button className="link" onClick={() => supabase.auth.signOut()}>Sair</button></span>
      </header>
      {pending && pending.length > 0 && <TermsGate docs={pending} salonId={salon.id} onAccepted={() => setPending([])} />}
      {!(pending && pending.length > 0) && <>
      <p className="muted">Link de marcação: <a href={bookingLink}>{bookingLink}</a> · <Link to="/poster">Poster com QR</Link></p>
      <RemindersCard salon={salon} />
      <SetupChecklist salon={salon} services={Object.keys(services).length} professionals={Object.keys(pros).length} />

      <div className="row">
        <button className="day" onClick={() => setDate(addDays(date, -1))}>‹</button>
        <strong>{new Date(date + 'T12:00:00Z').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
        <button className="day" onClick={() => setDate(addDays(date, 1))}>›</button>
      </div>

      {editing === 'nova'
        ? <BookingEditor salon={salon} defaultDate={date} onClose={() => setEditing(null)} onSaved={saved} />
        : <button className="btn" onClick={() => setEditing('nova')}>+ Nova marcação</button>}

      {offs.map(t => {
        const s = new Date(t.starts_at), e = new Date(t.ends_at)
        const from = zonedToUtc(date, '00:00', tz), to = zonedToUtc(addDays(date, 1), '00:00', tz)
        const allDay = s <= from && e >= to
        return (
          <div key={t.id} className="card off-card">
            <strong>{allDay ? 'Dia bloqueado' : `Bloqueado ${formatTime(s < from ? from : s, tz)}–${formatTime(e > to ? to : e, tz)}`}</strong>
            <span className="muted"> · {t.professional_id ? pros[t.professional_id]?.name ?? 'Profissional' : 'Todo o salão'}{t.reason && ` · ${t.reason}`}</span>
          </div>
        )
      })}
      {bookings.length === 0 && <p className="muted">Sem marcações neste dia.</p>}
      {bookings.map(b => {
        const svc = services[b.service_id]
        const when = new Date(b.starts_at)
        const msg = `Olá ${b.client_name}! A sua marcação de ${svc?.name ?? ''} no ${salon.name} está confirmada para ${when.toLocaleDateString('pt-PT', { timeZone: tz, day: 'numeric', month: 'long' })} às ${formatTime(when, tz)}.${salon.client_change_hours != null ? ` Se precisar de cancelar ou mudar: ${manageLink(location.origin, b.id)}` : ''} Até já!`
        if (editing === b.id) return (
          <BookingEditor key={b.id} salon={salon} booking={b} defaultDate={date} onClose={() => setEditing(null)} onSaved={saved} />
        )
        return (
          <article key={b.id} className={`card booking st-${b.status}`}>
            <div className="row">
              <strong>{formatTime(when, tz)}</strong>
              <span>{svc?.name} · {pros[b.professional_id]?.name}</span>
              <span className="tag">{STATUS_LABEL[b.status]}</span>
              {b.client_action === 'mudou' && <span className="tag warn">Cliente mudou a hora</span>}
              {b.client_action === 'cancelou' && <span className="tag warn">Cancelada pelo cliente</span>}
            </div>
            <div>{b.client_name} · <a href={`tel:+${formatPhone(b.client_phone).replace(/\D/g, "")}`}>{formatPhone(b.client_phone)}</a>{svc && <> · {euros(svc.price_cents)}</>}</div>
            {b.deposit !== 'nenhum' && (
              <div>Sinal: {b.deposit === 'pago' ? 'pago ✓' : <button className="link" onClick={() => update(b, { deposit: 'pago' })}>marcar como recebido</button>}</div>
            )}
            <div className="actions">
              {b.status === 'pendente' && <button onClick={() => update(b, { status: 'confirmada' })}>Confirmar</button>}
              {(b.status === 'pendente' || b.status === 'confirmada') && <>
                <button onClick={() => update(b, { status: 'concluida' })}>Concluída</button>
                <button onClick={() => update(b, { status: 'faltou' })}>Faltou</button>
                <button onClick={() => update(b, { status: 'cancelada' })}>Cancelar</button>
              </>}
              <a className="wa" href={waLink(b.client_phone, msg)} target="_blank" rel="noreferrer">WhatsApp</a>
              {b.status === 'concluida' && nextFor !== b.id && <button onClick={() => setNextFor(b.id)}>Próxima visita</button>}
              {(b.status === 'pendente' || b.status === 'confirmada') && <button className="link" onClick={() => setEditing(b.id)}>Editar</button>}
            </div>
            {nextFor === b.id && svc && pros[b.professional_id] && (
              <NextVisit salon={salon} booking={b} service={svc} pro={pros[b.professional_id]}
                onClose={() => setNextFor(null)}
                onBooked={nb => { if (dateInTz(new Date(nb.starts_at), tz) === date) setBookings(bs => [...bs, nb].sort((x, y) => x.starts_at.localeCompare(y.starts_at))) }} />
            )}
          </article>
        )
      })}
      </>}
    </main></div>
  )
}
