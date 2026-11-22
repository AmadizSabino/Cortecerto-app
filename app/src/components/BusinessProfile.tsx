import { AREAS, BOOKING_MODES, WORK_PLACES, type BookingMode, type SalonType, type WorkPlace } from '../lib/onboarding'

export interface Profile { type: SalonType; areas: string[]; booking_mode: BookingMode; work_place: WorkPlace }

/**
 * The business profile (migration 0022): main area, other areas, how clients come,
 * where the salon works. It shapes the app: themes, suggested services, the walk-in
 * queue, home visits and the ideas in the Social Media Manager.
 */
export default function BusinessProfile({ value, onChange, onMainChange }: {
  value: Profile; onChange: (p: Profile) => void; onMainChange?: (t: SalonType) => void
}) {
  const areas = new Set([value.type, ...value.areas])
  return (
    <div className="business-profile">
      <p className="small" style={{ margin: '0 0 6px' }}><b>Área principal</b></p>
      <div className="choices two">
        {AREAS.map(t => (
          <button type="button" key={t.id} className={t.id === value.type ? 'choice on' : 'choice'}
            onClick={() => { onChange({ ...value, type: t.id, areas: [...new Set([t.id, ...value.areas])] }); onMainChange?.(t.id) }}>{t.label}</button>
        ))}
      </div>
      <fieldset className="chips-set"><legend>Também faz <span className="muted">(opcional)</span></legend>
        <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {AREAS.filter(a => a.id !== value.type).map(a => (
            <button type="button" key={a.id} className={areas.has(a.id) ? 'chip on' : 'chip'}
              onClick={() => onChange({ ...value, areas: areas.has(a.id) ? value.areas.filter(x => x !== a.id) : [...value.areas, a.id] })}><span className="d1">{a.label}</span></button>
          ))}
        </div>
      </fieldset>
      <label>Os clientes vêm
        <select value={value.booking_mode} onChange={e => onChange({ ...value, booking_mode: e.target.value as BookingMode })}>
          {BOOKING_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      <label>Onde trabalha
        <select value={value.work_place} onChange={e => onChange({ ...value, work_place: e.target.value as WorkPlace })}>
          {WORK_PLACES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
    </div>
  )
}
