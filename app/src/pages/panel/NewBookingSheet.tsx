import { useEffect, useMemo, useState } from 'react'
import Icon from '../../components/Icon'
import { freeSlots } from '../../lib/slots'
import { euros, supabase } from '../../lib/supabase'
import { addDays, dateInTz, formatTime, zonedToUtc } from '../../lib/time'
import { usePanel } from './PanelContext'

/** The salon adds a booking by hand: a phone call, or a walk-in starting now. */
export default function NewBookingSheet({ date: initialDate, onClose, onSaved }: { date: string; onClose: () => void; onSaved: (date: string) => void }) {
  const { salon, services, pros, hours } = usePanel()
  const tz = salon.timezone
  const activeSvcs = services.filter(s => (s as { active?: boolean }).active !== false)
  const activePros = pros.filter(p => (p as { active?: boolean }).active !== false)
  const [kind, setKind] = useState<'telefone' | 'presencial'>('telefone')
  const [serviceId, setServiceId] = useState(activeSvcs[0]?.id ?? '')
  const [proId, setProId] = useState(activePros[0]?.id ?? '')
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState<{ start: Date; end: Date }[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const service = activeSvcs.find(s => s.id === serviceId)

  useEffect(() => {
    const from = zonedToUtc(date, '00:00', tz).toISOString(), to = zonedToUtc(addDays(date, 1), '00:00', tz).toISOString()
    supabase.from('bookings').select('starts_at,ends_at').eq('professional_id', proId).in('status', ['pendente', 'confirmada', 'concluida'])
      .lt('starts_at', to).gt('ends_at', from)
      .then(({ data }) => setBusy((data ?? []).map(b => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) }))))
  }, [proId, date, tz])

  const slots = useMemo(() => service
    ? freeSlots({ date, tz, hours, durationMin: service.duration_min, busy, now: new Date() }) : [], [service, date, tz, hours, busy])

  async function save() {
    setError('')
    if (!service || !proId) return setError('Escolha o serviço e o profissional.')
    if (!name.trim()) return setError('Indique o nome do cliente.')
    let start: Date
    if (kind === 'presencial') {
      const now = new Date(); now.setSeconds(0, 0); now.setMinutes(Math.floor(now.getMinutes() / 5) * 5); start = now
    } else {
      if (!time) return setError('Escolha a hora.')
      start = zonedToUtc(date, time, tz)
    }
    setSaving(true)
    const { error } = await supabase.from('bookings').insert({
      salon_id: salon.id, service_id: service.id, professional_id: proId,
      starts_at: start.toISOString(), ends_at: new Date(start.getTime() + service.duration_min * 60000).toISOString(),
      client_name: name.trim(), client_phone: phone.trim() || '-', status: 'confirmada', deposit: 'nenhum', source: kind,
    })
    setSaving(false)
    if (error) return setError(error.message.includes('no_overlap') ? 'Esse profissional já tem uma marcação a essa hora.' : 'Não foi possível guardar. Tente de novo.')
    onSaved(kind === 'presencial' ? dateInTz(start, tz) : date)
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Nova marcação">
        <div className="between"><h2 style={{ margin: 0 }}>Nova marcação</h2><button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button></div>
        <div className="seg" style={{ marginTop: 16 }}>
          <button className={kind === 'telefone' ? 'on' : ''} onClick={() => setKind('telefone')}>Por telefone</button>
          <button className={kind === 'presencial' ? 'on' : ''} onClick={() => setKind('presencial')}>Cliente aqui agora</button>
        </div>
        <label>Serviço
          <select value={serviceId} onChange={e => { setServiceId(e.target.value); setTime('') }}>
            {activeSvcs.map(s => <option key={s.id} value={s.id}>{s.name} · {s.duration_min} min · {euros(s.price_cents)}</option>)}
          </select>
        </label>
        <label>Profissional
          <select value={proId} onChange={e => { setProId(e.target.value); setTime('') }}>
            {activePros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {kind === 'telefone' && <>
          <label>Dia<input type="date" value={date} min={dateInTz(new Date(), tz)} onChange={e => { setDate(e.target.value); setTime('') }} /></label>
          <div className="slots">
            {slots.length === 0 && <p className="muted small" style={{ gridColumn: '1 / -1' }}>Sem horários livres para este profissional neste dia.</p>}
            {slots.map(t => {
              const v = formatTime(t, tz)
              return <button key={v} className={v === time ? 'slot on' : 'slot'} onClick={() => setTime(v)}>{v}</button>
            })}
          </div>
        </>}
        <label>Nome do cliente<input value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></label>
        <label><span>Telemóvel <span className="muted">(opcional)</span></span><input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="912 345 678" /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" onClick={save} disabled={saving}>{saving ? 'A guardar…' : 'Guardar marcação'}</button>
      </div>
    </div>
  )
}
