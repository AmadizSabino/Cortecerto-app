import { useEffect, useMemo, useState } from 'react'
import { WhatsAppIcon } from './components/Icon'
import { supabase, type Booking, type Salon } from './lib/supabase'
import { freeSlots } from './lib/slots'
import { hoursFor, NO_HOURS, type SalonHours } from './lib/schedule'
import { loadHours } from './lib/scheduleData'
import { addDays, dateInTz, formatTime, zonedToUtc } from './lib/time'
import { proposalMessage } from './lib/proposal'
import { waLink } from './lib/whatsapp'

const ERRORS: Record<string, string> = {
  horario_ocupado: 'Esse horário já está ocupado. Escolha outro.',
  horario_passado: 'Esse horário já passou.',
  marcacao_fechada: 'Esta marcação já não está ativa.',
  sem_permissao: 'O seu acesso não permite alterar esta marcação.',
}

/**
 * The salon suggests a different time for a booking (migration 0018). The slot is
 * held for this client until they answer on their booking page; the booking stays
 * where it was until then.
 */
export default function ProposeTime({ salon, booking, serviceName, onDone, onClose }: {
  salon: Salon; booking: Booking; serviceName: string
  onDone: (b: Booking) => void; onClose: () => void
}) {
  const tz = salon.timezone
  const minutes = Math.round((new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 60000)
  const [hours, setHours] = useState<SalonHours>(NO_HOURS)
  const [date, setDate] = useState(() => dateInTz(new Date(booking.starts_at), tz))
  const [busy, setBusy] = useState<{ start: Date; end: Date }[]>([])
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState<Date | null>(null)

  useEffect(() => { loadHours(salon.id).then(setHours) }, [salon.id])
  useEffect(() => {
    const from = zonedToUtc(date, '00:00', tz).toISOString(), to = zonedToUtc(addDays(date, 1), '00:00', tz).toISOString()
    supabase.rpc('busy_slots', { p_salon: salon.id, p_from: from, p_to: to }).then(({ data }) => setBusy((data ?? [])
      .filter((x: { professional_id: string; starts_at: string }) => x.professional_id === booking.professional_id
        && new Date(x.starts_at).getTime() !== new Date(booking.starts_at).getTime()
        && x.starts_at !== booking.proposed_starts_at)
      .map((x: { starts_at: string; ends_at: string }) => ({ start: new Date(x.starts_at), end: new Date(x.ends_at) }))))
  }, [date, salon.id, tz, booking])

  const slots = useMemo(() => freeSlots({ date, tz, hours: hoursFor(hours, booking.professional_id), durationMin: minutes, busy, now: new Date() })
    .filter(t => t.getTime() !== new Date(booking.starts_at).getTime()), [date, tz, hours, booking, minutes, busy])

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!/^\d{2}:\d{2}$/.test(time)) { setError('Escolha a hora a sugerir.'); return }
    const when = zonedToUtc(date, time, tz)
    setSaving(true)
    const { error } = await supabase.rpc('propose_booking_time', { p_booking: booking.id, p_starts_at: when.toISOString(), p_note: note.trim() || null })
    setSaving(false)
    if (error) {
      setError(error.message.includes('propose_booking_time')
        ? 'Para sugerir horários, corra supabase/migrations/0018_team_clients_club_ai.sql no Supabase.'
        : Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? 'Não foi possível guardar.')
      return
    }
    setSent(when)
    onDone({ ...booking, proposed_starts_at: when.toISOString(), proposal_note: note.trim() || null, client_action: null })
  }

  const hasPhone = /\d{6}/.test(booking.client_phone.replace(/\D/g, ''))
  if (sent) return (
    <div className="next-visit">
      <strong>Sugestão guardada</strong>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>O horário fica reservado para este cliente até responder. Envie-lhe a sugestão:</p>
      <div className="actions">
        {hasPhone && <a className="wa" href={waLink(booking.client_phone, proposalMessage(booking, salon, serviceName, sent, note.trim()))} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />Enviar por WhatsApp</a>}
        <button className="link" onClick={onClose}>Fechar</button>
      </div>
    </div>
  )

  return (
    <form className="next-visit" onSubmit={save}>
      <div className="row"><strong>Sugerir outro horário</strong><button type="button" className="link" onClick={onClose}>Fechar</button></div>
      <p className="muted small" style={{ margin: '4px 0' }}>O cliente recebe um link para aceitar ou recusar. Até lá, a marcação fica onde está.</p>
      <label>Dia<input type="date" value={date} min={dateInTz(new Date(), tz)} onChange={e => { setDate(e.target.value); setTime('') }} /></label>
      <div className="slots">
        {slots.length === 0 && <span className="muted small">Sem horários livres neste dia.</span>}
        {slots.map(t => {
          const hhmm = formatTime(t, tz)
          return <button type="button" key={t.getTime()} className={hhmm === time ? 'slot on' : 'slot'} onClick={() => setTime(hhmm)}>{hhmm}</button>
        })}
      </div>
      <label><span>Mensagem <span className="muted">(opcional)</span></span><input value={note} maxLength={300} placeholder="Ex.: Às 15h o João já está ocupado." onChange={e => setNote(e.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <button className="btn" disabled={saving || !time}>{saving ? 'A guardar…' : time ? `Sugerir ${time}` : 'Escolha uma hora'}</button>
    </form>
  )
}
