import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Booking, type Professional, type Salon, type Service } from '../lib/supabase'
import { addDays, dateInTz, formatTime, zonedToUtc } from '../lib/time'
import { formatPhone, waLink } from '../lib/whatsapp'
import { localSent, reminderMessage, saveLocalSent, wantsReminder } from '../lib/reminders'
import { themeById, themeStyle } from '../lib/themes'
import { manageLink } from '../lib/clientChanges'

/** WhatsApp reminders for a day's bookings, tomorrow by default. */
export default function RemindersPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Record<string, Service>>({})
  const [pros, setPros] = useState<Record<string, Professional>>({})
  const [date, setDate] = useState(() => addDays(dateInTz(new Date(), 'Europe/Lisbon'), 1))
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [sent, setSent] = useState<Record<string, string>>(() => localSent())

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])

  useEffect(() => {
    if (!session) return
    (async () => {
      const { data: s } = await supabase.from('salons').select('*').eq('owner_id', session.user.id).maybeSingle()
      setSalon(s)
      if (!s) return
      setDate(addDays(dateInTz(new Date(), s.timezone), 1))
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
    setBookings(null)
    const from = zonedToUtc(date, '00:00', salon.timezone).toISOString()
    const to = zonedToUtc(addDays(date, 1), '00:00', salon.timezone).toISOString()
    supabase.from('bookings').select('*').eq('salon_id', salon.id).gte('starts_at', from).lt('starts_at', to).order('starts_at')
      .then(({ data }) => setBookings((data ?? []).filter(wantsReminder)))
  }, [salon, date])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />

  const tz = salon.timezone
  const today = dateInTz(new Date(), tz)
  const sentAt = (b: Booking) => b.reminder_sent_at ?? sent[b.id] ?? null
  const pending = (bookings ?? []).filter(b => !sentAt(b)).length

  async function markSent(b: Booking) {
    const at = new Date().toISOString()
    setSent(s => ({ ...s, [b.id]: at }))
    const { error } = await supabase.from('bookings').update({ reminder_sent_at: at }).eq('id', b.id)
    // Before migration 0006 the column doesn't exist: remember it in this browser instead.
    if (error) saveLocalSent(b.id, at)
    else setBookings(bs => bs?.map(x => x.id === b.id ? { ...x, reminder_sent_at: at } : x) ?? null)
  }

  const dayLabel = new Date(date + 'T12:00:00Z').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page wide">
      <header className="row">
        <h1>Lembretes</h1>
        <Link to="/painel">‹ Agenda</Link>
      </header>
      <p className="muted">Envie um lembrete por WhatsApp na véspera. Os clientes avisam quando não podem vir e a vaga não se perde.</p>

      <div className="row">
        <button className="day" onClick={() => setDate(addDays(date, -1))} disabled={date <= today}>‹</button>
        <strong>{date === addDays(today, 1) ? `Amanhã, ${dayLabel}` : dayLabel}</strong>
        <button className="day" onClick={() => setDate(addDays(date, 1))}>›</button>
      </div>

      {bookings === null ? <p className="muted">A carregar…</p> : <>
        {bookings.length === 0 && <p className="muted">Sem marcações neste dia.</p>}
        {bookings.length > 0 && <p>{pending === 0 ? 'Todos os lembretes enviados ✓' : `${pending} de ${bookings.length} por enviar`}</p>}

        {bookings.map(b => {
          const svc = services[b.service_id]
          const when = new Date(b.starts_at)
          const at = sentAt(b)
          const msg = reminderMessage({
            clientName: b.client_name, serviceName: svc?.name ?? 'serviço', startsAt: when, tz, salonName: salon.name,
            isTomorrow: date === addDays(today, 1),
            // Only once migration 0007 has run (the column exists) and the salon allows changes.
            manageUrl: salon.client_change_hours != null ? manageLink(location.origin, b.id) : null,
            depositDue: b.deposit === 'pendente' && salon.mbway_number ? { cents: salon.deposit_cents, mbway: salon.mbway_number } : null,
          })
          return (
            <article key={b.id} className={`card booking ${at ? 'reminded' : ''}`}>
              <div className="row">
                <strong>{formatTime(when, tz)}</strong>
                <span>{svc?.name} · {pros[b.professional_id]?.name}</span>
                {at ? <span className="tag ok-tag">Enviado {formatTime(new Date(at), tz)}</span> : <span className="tag">Por enviar</span>}
              </div>
              <div>{b.client_name} · {formatPhone(b.client_phone)}{b.deposit === 'pendente' && <> · <span className="muted">sinal por pagar</span></>}</div>
              <div className="actions">
                <a className="wa" href={waLink(b.client_phone, msg)} target="_blank" rel="noreferrer" onClick={() => markSent(b)}>
                  {at ? 'Enviar de novo' : 'Enviar lembrete'}
                </a>
                {!at && <button className="link" onClick={() => markSent(b)}>Já avisei de outra forma</button>}
              </div>
            </article>
          )
        })}
      </>}
    </main></div>
  )
}
