import { useState } from 'react'
import Icon from './Icon'
import { supabase, type Service } from '../lib/supabase'
import { describeTime, minuteOptions, type ClientTime } from '../lib/clientTimes'

const ALL = 'todos'

/**
 * "Tempo deste cliente" in the client's card (client_times, migration 0031): this client takes
 * longer (or shorter) for a service, or extra minutes on everything. Their online bookings then
 * block that time by themselves; the client still just sees the service.
 */
export default function ClientTimes({ salonId, phoneKey, firstName, services, rows, onChange }: {
  salonId: string; phoneKey: string; firstName: string; services: Service[]; rows: ClientTime[]
  onChange: (rows: ClientTime[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [target, setTarget] = useState<string>(() => rows[0] ? (rows[0].service_id ?? ALL) : services[0]?.id ?? ALL)
  const svc = services.find(s => s.id === target)
  const [minutes, setMinutes] = useState<number>(() => svc ? svc.duration_min * 2 : 15)
  const [state, setState] = useState<'' | 'saving' | 'error'>('')
  const byId = Object.fromEntries(services.map(s => [s.id, s]))

  function choose(t: string) {
    setTarget(t)
    const s = services.find(x => x.id === t)
    const existing = rows.find(r => (r.service_id ?? ALL) === t)
    setMinutes(existing?.minutes ?? (s ? s.duration_min * 2 : 15))
  }

  async function save() {
    setState('saving')
    const serviceId = target === ALL ? null : target
    const existing = rows.find(r => r.service_id === serviceId)
    const res = existing
      ? await supabase.from('client_times').update({ minutes, updated_at: new Date().toISOString() }).eq('id', existing.id).select('id,phone_key,service_id,minutes').single()
      : await supabase.from('client_times').insert({ salon_id: salonId, phone_key: phoneKey, service_id: serviceId, minutes }).select('id,phone_key,service_id,minutes').single()
    if (res.error || !res.data) { setState('error'); return }
    onChange([...rows.filter(r => r.id !== res.data.id), res.data as ClientTime])
    setState(''); setAdding(false)
  }
  async function remove(r: ClientTime) {
    const { error } = await supabase.from('client_times').delete().eq('id', r.id)
    if (!error) onChange(rows.filter(x => x.id !== r.id))
  }

  return (
    <div className="client-times">
      <div className="between"><b><Icon name="timer" size={16} /> Tempo de {firstName}</b>{!adding && <button className="link" onClick={() => { setAdding(true); choose(target) }}>{rows.length ? 'Mudar' : 'Definir'}</button>}</div>
      {rows.length === 0 && !adding && <p className="muted small" style={{ margin: '2px 0 0' }}>Demora mais ou menos do que o normal? Defina aqui e as marcações online passam a guardar esse tempo.</p>}
      {rows.length > 0 && (
        <ul className="times-list">
          {rows.map(r => (
            <li key={r.id}><span>{describeTime(r, byId)}</span><button className="link" onClick={() => remove(r)}>Tirar</button></li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="times-form">
          <label>Serviço
            <select value={target} onChange={e => choose(e.target.value)}>
              {services.map(s => <option key={s.id} value={s.id}>{s.name} (normal {s.duration_min} min)</option>)}
              <option value={ALL}>Todos os serviços: minutos a mais</option>
            </select>
          </label>
          <label>{svc ? `Quanto tempo demora ${firstName}` : 'Minutos a mais'}
            <select value={minutes} onChange={e => setMinutes(Number(e.target.value))}>
              {minuteOptions(svc?.duration_min ?? null).map(m => <option key={m} value={m}>{svc ? `${m} min${m === svc.duration_min ? ' (normal)' : ''}` : `+${m} min`}</option>)}
            </select>
          </label>
          <p className="muted small" style={{ margin: 0 }}>Quando {firstName} marcar online, a agenda guarda este tempo. {firstName} continua a ver só o serviço.</p>
          {state === 'error' && <p className="error small">Não foi possível guardar.</p>}
          <div className="actions" style={{ marginTop: 4 }}>
            <button className="btn-inline" onClick={save} disabled={state === 'saving'}>{state === 'saving' ? 'A guardar…' : 'Guardar'}</button>
            <button className="link" onClick={() => { setAdding(false); setState('') }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
