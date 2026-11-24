import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { euros, supabase } from '../lib/supabase'
import { freeSlots } from '../lib/slots'
import { hoursFor, NO_HOURS, type SalonHours } from '../lib/schedule'
import { loadHours } from '../lib/scheduleData'
import { changeState, limitText } from '../lib/clientChanges'
import { clientTheme, themeById, themeStyle } from '../lib/themes'
import { addDays, dateInTz, formatTime, zonedToUtc } from '../lib/time'
import { waLink } from '../lib/whatsapp'
import { mediaUrl } from '../lib/brand'

/** Row returned by booking_for_client (migration 0007). */
interface ClientBooking {
  id: string; status: string; deposit: string; starts_at: string; ends_at: string; client_name: string
  salon_id: string; salon_slug: string; salon_name: string; salon_theme: string; salon_timezone: string
  salon_whatsapp: string | null; mbway_number: string | null; deposit_cents: number
  client_change_hours: number | null; service_id: string; service_name: string; duration_min: number
  price_cents: number; professional_id: string; professional_name: string
  proposed_starts_at?: string | null; proposal_note?: string | null // migration 0018
  wants_earlier?: boolean; salon_logo?: string | null // migration 0019
}

const ERRORS: Record<string, string> = {
  horario_ocupado: 'Esse horário acabou de ser ocupado. Escolha outro, por favor.',
  horario_passado: 'Esse horário já passou.',
  fora_do_prazo: 'Já passou o prazo para alterar esta marcação. Fale com o salão.',
  marcacao_fechada: 'Esta marcação já não pode ser alterada.',
  alteracao_nao_permitida: 'Este salão não permite alterações online. Fale com o salão.',
  sem_proposta: 'O salão já retirou esta sugestão.',
}
const errorText = (m: string) => Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? 'Não foi possível guardar. Tente de novo.'

/** Emails the salon that the client cancelled or moved (best effort; the change is already saved). */
const notifyChange = (id: string) => {
  fetch('/api/notify-change', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), keepalive: true }).catch(() => {})
}

/** The client's private page for one booking: /m/<booking id>. */
export default function ManagePage() {
  const { id } = useParams()
  const [b, setB] = useState<ClientBooking | null | 'indisponivel'>()
  const [mode, setMode] = useState<'ver' | 'cancelar' | 'mudar'>('ver')
  const [hours, setHours] = useState<SalonHours>(NO_HOURS)
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState<{ start: Date; end: Date }[]>([])
  const [slot, setSlot] = useState<Date>()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  async function load() {
    const { data, error } = await supabase.rpc('booking_for_client', { p_booking: id })
    // Before migration 0007 the function doesn't exist.
    if (error) { setB(error.message.includes('booking_for_client') ? 'indisponivel' : null); return }
    const row = (data ?? [])[0] as ClientBooking | undefined
    setB(row ?? null)
    if (row) setDate(dateInTz(new Date(row.starts_at), row.salon_timezone))
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const booking = b && b !== 'indisponivel' ? b : null

  useEffect(() => {
    if (mode !== 'mudar' || !booking) return
    loadHours(booking.salon_id).then(setHours)
  }, [mode, booking?.salon_id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== 'mudar' || !booking || !date) return
    const from = zonedToUtc(date, '00:00', booking.salon_timezone)
    const to = zonedToUtc(addDays(date, 1), '00:00', booking.salon_timezone)
    supabase.rpc('busy_slots', { p_salon: booking.salon_id, p_from: from.toISOString(), p_to: to.toISOString() })
      .then(({ data }) => setBusy((data ?? [])
        .filter((x: { professional_id: string; starts_at: string }) => x.professional_id === booking.professional_id
          && new Date(x.starts_at).getTime() !== new Date(booking.starts_at).getTime()) // not the client's own booking
        .map((x: { starts_at: string; ends_at: string }) => ({ start: new Date(x.starts_at), end: new Date(x.ends_at) }))))
  }, [mode, booking, date])

  const slots = useMemo(() => booking && mode === 'mudar'
    ? freeSlots({ date, tz: booking.salon_timezone, hours: hoursFor(hours, booking.professional_id), durationMin: booking.duration_min, busy, now: new Date() })
    : [], [booking, mode, date, hours, busy])

  if (b === undefined) return <main className="page">A carregar…</main>
  if (b === 'indisponivel') return <main className="page"><h1>Marcação</h1><p>Esta página ainda não está disponível. Para alterar a marcação, fale com o salão.</p></main>
  if (b === null) return <main className="page"><h1>Marcação não encontrada</h1><p className="muted">Confirme o link que recebeu ou fale com o salão.</p></main>

  const tz = b.salon_timezone
  const bookingId = b.id
  const theme = themeById(clientTheme(b.salon_slug) ?? b.salon_theme)
  const start = new Date(b.starts_at)
  const dayText = (d: Date) => d.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
  const state = changeState(b)
  const days = Array.from({ length: 14 }, (_, i) => addDays(dateInTz(new Date(), tz), i))
  const statusText: Record<string, string> = {
    pendente: 'A aguardar confirmação do salão', confirmada: 'Confirmada', concluida: 'Concluída', faltou: 'Não compareceu', cancelada: 'Cancelada',
  }

  /** The client's answer to a time the salon suggested (migration 0018). */
  async function answer(accept: boolean) {
    setSaving(true); setError('')
    const { error } = await supabase.rpc('respond_to_proposal', { p_booking: bookingId, p_accept: accept })
    setSaving(false)
    if (error) { setError(errorText(error.message)); load(); return }
    notifyChange(bookingId)
    setNotice(accept ? 'Combinado! A sua marcação passou para o novo horário.' : 'Obrigado. O salão vai falar consigo para combinar.')
    load()
  }

  async function cancel() {
    setSaving(true); setError('')
    const { error } = await supabase.rpc('cancel_booking_by_client', { p_booking: bookingId })
    setSaving(false)
    if (error) { setError(errorText(error.message)); return }
    notifyChange(bookingId)
    setMode('ver'); setNotice('A sua marcação foi cancelada. O salão já pode ver a vaga livre.')
    load()
  }

  async function move() {
    if (!slot) return
    setSaving(true); setError('')
    const { error } = await supabase.rpc('move_booking_by_client', { p_booking: bookingId, p_starts_at: slot.toISOString() })
    setSaving(false)
    if (error) { setError(errorText(error.message)); if (error.message.includes('horario_ocupado')) setSlot(undefined); return }
    notifyChange(bookingId)
    setMode('ver'); setSlot(undefined); setNotice('Marcação alterada. O salão vai confirmar o novo horário.')
    load()
  }

  return (
    <div className="themed" style={themeStyle(theme)}><main className="page">
      <header className="brand-head">
        {b.salon_logo && <img className="brand-logo" src={mediaUrl(b.salon_logo)!} alt="" />}
        <Link className="back-link" to={`/s/${b.salon_slug}`}>‹ {b.salon_name}</Link>
      </header>
      <h1>A sua marcação</h1>
      {notice && <p className="ok">{notice}</p>}

      <div className="card">
        <strong>{b.service_name} com {b.professional_name}</strong>
        <p>{dayText(start)} às {formatTime(start, tz)} · {euros(b.price_cents)}</p>
        <p className="muted">{statusText[b.status] ?? b.status}</p>
        {b.deposit === 'pendente' && b.mbway_number && (
          <p>Falta o sinal de {euros(b.deposit_cents)} por MB Way para <b>{b.mbway_number}</b>.</p>
        )}
      </div>

      {b.proposed_starts_at && (b.status === 'pendente' || b.status === 'confirmada') && (() => {
        const p = new Date(b.proposed_starts_at)
        return (
          <div className="card warn">
            <h3 style={{ marginTop: 0 }}>O salão sugere outro horário</h3>
            <p style={{ margin: '6px 0' }}><b>{dayText(p)} às {formatTime(p, tz)}</b>, em vez de {dayText(start)} às {formatTime(start, tz)}.</p>
            {b.proposal_note && <p className="muted" style={{ margin: '6px 0' }}>"{b.proposal_note}"</p>}
            {error && <p className="error">{error}</p>}
            <div className="actions">
              <button className="btn-inline" disabled={saving} onClick={() => answer(true)}>Aceitar</button>
              <button disabled={saving} onClick={() => answer(false)}>Não me dá jeito</button>
            </div>
          </div>
        )
      })()}

      {b.wants_earlier !== undefined && (b.status === 'pendente' || b.status === 'confirmada') && new Date(b.starts_at) > new Date() && (
        <label className="check card soft">
          <input type="checkbox" checked={b.wants_earlier} onChange={async e => {
            const on = e.target.checked
            setB({ ...b, wants_earlier: on })
            const { error } = await supabase.rpc('set_wants_earlier', { p_booking: bookingId, p_on: on })
            if (error) setB({ ...b, wants_earlier: !on })
          }} />
          <span>Avise-me por WhatsApp se abrir uma vaga mais cedo</span>
        </label>
      )}

      {mode === 'ver' && <>
        {state === 'pode' && <>
          <p className="muted">Pode cancelar ou mudar {limitText(b.client_change_hours!)}.</p>
          <div className="actions">
            <button onClick={() => { setMode('mudar'); setError(''); setNotice('') }}>Mudar dia ou hora</button>
            <button onClick={() => { setMode('cancelar'); setError(''); setNotice('') }}>Cancelar marcação</button>
          </div>
        </>}
        {(state === 'fora_do_prazo' || state === 'nao_permitido') && (
          <p className="muted">
            {state === 'fora_do_prazo' ? 'Já passou o prazo para alterar online.' : 'Este salão não permite alterações online.'}
            {b.salon_whatsapp && <> <a href={waLink(b.salon_whatsapp, `Olá! Sou ${b.client_name} e tenho marcação de ${b.service_name} ${dayText(start)} às ${formatTime(start, tz)}.`)} target="_blank" rel="noreferrer">Falar com o salão por WhatsApp</a>.</>}
          </p>
        )}
        {b.status === 'cancelada' && <p><Link to={`/s/${b.salon_slug}`}>Fazer nova marcação</Link></p>}
      </>}

      {mode === 'cancelar' && (
        <div className="card">
          <p>Quer mesmo cancelar a marcação de {dayText(start)} às {formatTime(start, tz)}?</p>
          {b.deposit === 'pago' && <p className="muted">Já pagou o sinal. Fale com o salão sobre a devolução.</p>}
          {error && <p className="error">{error}</p>}
          <button className="btn" onClick={cancel} disabled={saving}>{saving ? 'A cancelar…' : 'Sim, cancelar'}</button>
          <button className="link back" onClick={() => setMode('ver')}>Não, manter</button>
        </div>
      )}

      {mode === 'mudar' && <>
        <h2>Novo dia e hora</h2>
        <div className="days">
          {days.map(d => (
            <button key={d} className={d === date ? 'day on' : 'day'} onClick={() => { setDate(d); setSlot(undefined) }}>
              {new Date(d + 'T12:00:00Z').toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric' })}
            </button>
          ))}
        </div>
        <div className="slots">
          {slots.length === 0 && <p className="muted">Sem horários livres neste dia.</p>}
          {slots.map(t => (
            <button key={t.getTime()} className={t.getTime() === slot?.getTime() ? 'slot on' : 'slot'} onClick={() => setSlot(t)}>{formatTime(t, tz)}</button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" onClick={move} disabled={!slot || saving}>
          {saving ? 'A guardar…' : slot ? `Mudar para ${dayText(slot)} às ${formatTime(slot, tz)}` : 'Escolha um horário'}
        </button>
        <button className="link back" onClick={() => { setMode('ver'); setSlot(undefined) }}>Voltar</button>
      </>}

      <footer className="foot"><p className="muted">Feito com CorteCerto · <a href="/privacidade">Privacidade</a></p></footer>
    </main></div>
  )
}
