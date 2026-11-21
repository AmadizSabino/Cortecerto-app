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
import { pendingDocs } from '../lib/acceptance'
import type { LegalDoc } from '../lib/legal'

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
  const [pending, setPending] = useState<LegalDoc[] | null>(null)

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
  }, [salon, date])

  async function update(b: Booking, patch: Partial<Booking>) {
    const { error } = await supabase.from('bookings').update(patch).eq('id', b.id)
    if (!error) setBookings(bs => bs.map(x => x.id === b.id ? { ...x, ...patch } : x))
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
        <span className="row"><Link to="/lembretes">Lembretes</Link><Link to="/clientes">Clientes</Link><Link to="/definicoes">Definições</Link><button className="link" onClick={() => supabase.auth.signOut()}>Sair</button></span>
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

      {bookings.length === 0 && <p className="muted">Sem marcações neste dia.</p>}
      {bookings.map(b => {
        const svc = services[b.service_id]
        const when = new Date(b.starts_at)
        const msg = `Olá ${b.client_name}! A sua marcação de ${svc?.name ?? ''} no ${salon.name} está confirmada para ${when.toLocaleDateString('pt-PT', { timeZone: tz, day: 'numeric', month: 'long' })} às ${formatTime(when, tz)}. Até já!`
        return (
          <article key={b.id} className={`card booking st-${b.status}`}>
            <div className="row">
              <strong>{formatTime(when, tz)}</strong>
              <span>{svc?.name} · {pros[b.professional_id]?.name}</span>
              <span className="tag">{STATUS_LABEL[b.status]}</span>
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
            </div>
          </article>
        )
      })}
      </>}
    </main></div>
  )
}
