import { useEffect, useMemo, useState } from 'react'
import { supabase, type Booking, type Professional, type Salon, type Service } from './lib/supabase'
import { freeSlots } from './lib/slots'
import { hoursFor, type SalonHours } from './lib/schedule'
import { loadHours } from './lib/scheduleData'
import { addDays, dateInTz, formatTime, zonedToUtc } from './lib/time'
import { closestSlot, DEFAULT_WEEKS, suggestNextDate, WEEK_OPTIONS } from './lib/nextVisit'
import { manageLink } from './lib/clientChanges'
import { waLink } from './lib/whatsapp'
import { effective } from './lib/pricing'
import { loadOverrides } from './lib/pricingData'

const ERRORS: Record<string, string> = {
  horario_ocupado: 'Esse horário acabou de ser ocupado. Escolha outro.',
  horario_passado: 'Esse horário já passou.',
}

const minutesIn = (tz: string) => (d: Date) => {
  const [h, m] = formatTime(d, tz).split(':').map(Number)
  return h * 60 + m
}

/** After a visit: book the same client, service and professional a few weeks ahead. */
export default function NextVisit({ salon, booking, service, pro, onBooked, onClose }: {
  salon: Salon; booking: Booking; service: Service; pro: Professional
  onBooked: (b: Booking) => void; onClose: () => void
}) {
  const tz = salon.timezone
  const visitDate = dateInTz(new Date(booking.starts_at), tz)
  const [allHours, setAllHours] = useState<SalonHours | null>(null)
  const hours = useMemo(() => allHours ? hoursFor(allHours, pro.id) : null, [allHours, pro.id])
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS[salon.type] ?? 4)
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState<{ start: Date; end: Date }[] | null>(null)
  const [slot, setSlot] = useState<Date>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [booked, setBooked] = useState<Booking | null>(null)
  const [duration, setDuration] = useState(service.duration_min)

  useEffect(() => {
    loadHours(salon.id).then(setAllHours)
    loadOverrides(salon.id).then(ov => setDuration((effective(service, pro.id, ov.overrides) ?? service).duration_min))
  }, [salon.id, service, pro.id])

  useEffect(() => { if (hours) setDate(suggestNextDate(visitDate, weeks, hours)) }, [hours, weeks, visitDate])

  useEffect(() => {
    if (!date) return
    setBusy(null)
    const from = zonedToUtc(date, '00:00', tz).toISOString()
    const to = zonedToUtc(addDays(date, 1), '00:00', tz).toISOString()
    supabase.rpc('busy_slots', { p_salon: salon.id, p_from: from, p_to: to })
      .then(({ data }) => setBusy((data ?? [])
        .filter((x: { professional_id: string }) => x.professional_id === pro.id)
        .map((x: { starts_at: string; ends_at: string }) => ({ start: new Date(x.starts_at), end: new Date(x.ends_at) }))))
  }, [date, salon.id, pro.id, tz])

  const slots = useMemo(() => hours && busy && date
    ? freeSlots({ date, tz, hours, durationMin: duration, busy, now: new Date() })
    : [], [hours, busy, date, tz, duration])

  // Preselect the time closest to today's visit.
  useEffect(() => { setSlot(closestSlot(slots, minutesIn(tz)(new Date(booking.starts_at)), minutesIn(tz))) }, [slots, tz, booking.starts_at])

  async function book() {
    if (!slot) return
    setSaving(true); setError('')
    const { data: id, error } = await supabase.rpc('create_booking', {
      p_salon: salon.id, p_service: service.id, p_professional: pro.id, p_starts_at: slot.toISOString(),
      p_client_name: booking.client_name, p_client_phone: booking.client_phone, p_consent: booking.consent_messages,
    })
    if (error) {
      setSaving(false)
      setError(Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? 'Não foi possível marcar. Tente de novo.')
      return
    }
    // Booked at the counter with the client, so it's confirmed straight away.
    // If this fails the booking still exists, as pending; the agenda shows it either way.
    await supabase.from('bookings').update({ status: 'confirmada' }).eq('id', id)
    const { data: row } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle()
    setSaving(false)
    if (row) { setBooked(row); onBooked(row) }
  }

  const dayText = (d: Date) => d.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })

  if (booked) {
    const when = new Date(booked.starts_at)
    const link = salon.client_change_hours != null ? ` Se precisar de cancelar ou mudar: ${manageLink(location.origin, booked.id)}` : ''
    const msg = `Olá ${booking.client_name.split(' ')[0]}! Fica marcado: ${service.name} no ${salon.name}, ${dayText(when)} às ${formatTime(when, tz)}.${link} Até lá!`
    return (
      <div className="next-visit">
        <p className="ok">Próxima visita marcada: {dayText(when)} às {formatTime(when, tz)} ✓</p>
        <div className="actions">
          <a className="wa" href={waLink(booking.client_phone, msg)} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
          <button className="link" onClick={onClose}>Fechar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="next-visit">
      <strong>Marcar a próxima visita</strong>
      <p className="muted">{service.name} com {pro.name}</p>
      <div className="days">
        {WEEK_OPTIONS.map(w => (
          <button key={w} className={w === weeks ? 'day on' : 'day'} onClick={() => setWeeks(w)}>{w} semanas</button>
        ))}
      </div>
      {date && (
        <div className="row">
          <button className="day" onClick={() => setDate(addDays(date, -1))} disabled={date <= addDays(dateInTz(new Date(), tz), 0)}>‹</button>
          <strong>{new Date(date + 'T12:00:00Z').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
          <button className="day" onClick={() => setDate(addDays(date, 1))}>›</button>
        </div>
      )}
      <div className="slots">
        {busy === null ? <p className="muted">A procurar horários…</p> : slots.length === 0 && <p className="muted">Sem horários livres neste dia.</p>}
        {slots.map(t => (
          <button key={t.getTime()} className={t.getTime() === slot?.getTime() ? 'slot on' : 'slot'} onClick={() => setSlot(t)}>{formatTime(t, tz)}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn" onClick={book} disabled={!slot || saving}>
        {saving ? 'A marcar…' : slot ? `Marcar ${dayText(slot)} às ${formatTime(slot, tz)}` : 'Escolha um horário'}
      </button>
      <button className="link back" onClick={onClose}>Agora não</button>
    </div>
  )
}
