import { useEffect, useMemo, useState } from 'react'
import { supabase, type Booking, type Professional, type Salon, type Service } from './lib/supabase'
import { freeSlots, type OpeningHours } from './lib/slots'
import { addDays, dateInTz, formatTime, zonedToUtc } from './lib/time'
import { draftInterval, saveErrorText, validateDraft, type BookingDraft } from './lib/bookingForm'

/** New booking (phone or counter) or edit an existing one, from the salon's agenda. */
export default function BookingEditor({ salon, booking, defaultDate, onSaved, onClose }: {
  salon: Salon; booking?: Booking; defaultDate: string
  onSaved: (b: Booking) => void; onClose: () => void
}) {
  const tz = salon.timezone
  const [services, setServices] = useState<Service[]>([])
  const [pros, setPros] = useState<Professional[]>([])
  const [hours, setHours] = useState<OpeningHours[]>([])
  const [busy, setBusy] = useState<{ start: Date; end: Date }[]>([])
  const [d, setD] = useState<BookingDraft>(() => booking ? {
    clientName: booking.client_name, clientPhone: booking.client_phone,
    serviceId: booking.service_id, professionalId: booking.professional_id,
    date: dateInTz(new Date(booking.starts_at), tz), time: formatTime(new Date(booking.starts_at), tz),
  } : { clientName: '', clientPhone: '', serviceId: '', professionalId: '', date: defaultDate, time: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('services').select('id,name,duration_min,price_cents,active').eq('salon_id', salon.id).order('name'),
      supabase.from('professionals').select('id,name,active').eq('salon_id', salon.id).order('name'),
      supabase.from('opening_hours').select('weekday,opens,closes').eq('salon_id', salon.id),
    ]).then(([sv, pr, hr]) => {
      // Active ones, plus the booking's own service and professional even if switched off since.
      const svc = (sv.data ?? []).filter((x: Service & { active: boolean }) => x.active || x.id === booking?.service_id)
      const prs = (pr.data ?? []).filter((x: Professional & { active: boolean }) => x.active || x.id === booking?.professional_id)
      setServices(svc); setPros(prs); setHours(hr.data ?? [])
      setD(cur => ({
        ...cur,
        serviceId: cur.serviceId || (svc.length === 1 ? svc[0].id : ''),
        professionalId: cur.professionalId || (prs.length === 1 ? prs[0].id : ''),
      }))
    })
  }, [salon.id, booking?.service_id, booking?.professional_id])

  useEffect(() => {
    if (!d.professionalId || !d.date) return
    const from = zonedToUtc(d.date, '00:00', tz).toISOString()
    const to = zonedToUtc(addDays(d.date, 1), '00:00', tz).toISOString()
    supabase.rpc('busy_slots', { p_salon: salon.id, p_from: from, p_to: to })
      .then(({ data }) => setBusy((data ?? [])
        .filter((x: { professional_id: string; starts_at: string }) => x.professional_id === d.professionalId
          && !(booking && new Date(x.starts_at).getTime() === new Date(booking.starts_at).getTime() && booking.professional_id === d.professionalId))
        .map((x: { starts_at: string; ends_at: string }) => ({ start: new Date(x.starts_at), end: new Date(x.ends_at) }))))
  }, [d.professionalId, d.date, salon.id, tz, booking])

  const service = services.find(s => s.id === d.serviceId)
  const slots = useMemo(() => service && d.professionalId
    ? freeSlots({ date: d.date, tz, hours, durationMin: service.duration_min, busy, now: new Date() })
    : [], [service, d.professionalId, d.date, tz, hours, busy])

  const set = (patch: Partial<BookingDraft>) => { setD(cur => ({ ...cur, ...patch })); setError('') }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const v = validateDraft(d)
    if (v) { setError(v); return }
    setSaving(true)
    const interval = draftInterval(d, tz, service!.duration_min)
    const fields = {
      client_name: d.clientName.trim(), client_phone: d.clientPhone.trim(),
      service_id: d.serviceId, professional_id: d.professionalId, ...interval,
    }
    const res = booking
      ? await supabase.from('bookings').update(fields).eq('id', booking.id).select('*').single()
      : await supabase.from('bookings').insert({ ...fields, salon_id: salon.id, status: 'confirmada' }).select('*').single()
    setSaving(false)
    if (res.error) { setError(saveErrorText(res.error.message)); return }
    onSaved(res.data as Booking)
  }

  return (
    <form className="card editor" onSubmit={save}>
      <div className="row"><strong>{booking ? 'Editar marcação' : 'Nova marcação'}</strong><button type="button" className="link" onClick={onClose}>Fechar</button></div>
      <label>Cliente<input value={d.clientName} onChange={e => set({ clientName: e.target.value })} autoComplete="off" /></label>
      <label>Telemóvel (opcional)<input value={d.clientPhone} onChange={e => set({ clientPhone: e.target.value })} inputMode="tel" autoComplete="off" /></label>
      <label>Serviço
        <select value={d.serviceId} onChange={e => set({ serviceId: e.target.value })}>
          <option value="">Escolher…</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name} · {s.duration_min} min</option>)}
        </select>
      </label>
      <label>Profissional
        <select value={d.professionalId} onChange={e => set({ professionalId: e.target.value })}>
          <option value="">Escolher…</option>
          {pros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <div className="row">
        <label>Dia<input type="date" value={d.date} onChange={e => set({ date: e.target.value })} /></label>
        <label>Hora<input type="time" step={300} value={d.time} onChange={e => set({ time: e.target.value })} /></label>
      </div>
      {service && d.professionalId && (
        <div>
          <small className="muted">Horários livres:</small>
          <div className="slots">
            {slots.length === 0 && <span className="muted small">Nenhum neste dia. Pode escrever outra hora acima.</span>}
            {slots.map(t => {
              const hhmm = formatTime(t, tz)
              return <button type="button" key={t.getTime()} className={hhmm === d.time ? 'slot on' : 'slot'} onClick={() => set({ time: hhmm })}>{hhmm}</button>
            })}
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <button className="btn" disabled={saving}>{saving ? 'A guardar…' : booking ? 'Guardar alterações' : 'Criar marcação'}</button>
    </form>
  )
}
