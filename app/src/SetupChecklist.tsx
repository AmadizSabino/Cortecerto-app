import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, type Salon } from './lib/supabase'
import { loadMarks, saveMarks, setupSteps, type SetupMarks } from './lib/setup'

/** "Primeiros passos" card on the agenda. Hides itself once everything is done or the owner closes it. */
export default function SetupChecklist({ salon, services, professionals }: { salon: Salon; services: number; professionals: number }) {
  const [marks, setMarks] = useState<SetupMarks>(() => loadMarks(salon.id))
  const [openDays, setOpenDays] = useState<number | null>(null)
  const [hasBookings, setHasBookings] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('opening_hours').select('weekday').eq('salon_id', salon.id),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('salon_id', salon.id),
    ]).then(([h, b]) => {
      setOpenDays(new Set((h.data ?? []).map((x: { weekday: number }) => x.weekday)).size)
      setHasBookings((b.count ?? 0) > 0)
    })
  }, [salon.id])

  function mark(patch: SetupMarks) {
    const next = { ...marks, ...patch }
    setMarks(next)
    saveMarks(salon.id, next)
  }

  if (openDays === null || marks.hidden) return null
  const steps = setupSteps({
    services, professionals, openDays, whatsapp: salon.whatsapp,
    depositCents: salon.deposit_cents, mbway: salon.mbway_number, hasBookings, marks,
  })
  const doneCount = steps.filter(s => s.done).length
  if (doneCount === steps.length) return null

  return (
    <section className="card setup">
      <div className="row">
        <strong>Primeiros passos · {doneCount} de {steps.length}</strong>
        <button className="link" onClick={() => mark({ hidden: true })}>Esconder</button>
      </div>
      <div className="progress"><span style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <ol>
        {steps.map(s => (
          <li key={s.id} className={s.done ? 'done' : ''}>
            <span className="check-mark">{s.done ? '✓' : '○'}</span>
            <span>{s.label}</span>
            {!s.done && s.to && <Link to={s.to}>{s.manual ? 'Abrir' : 'Configurar'}</Link>}
            {!s.done && s.manual && <button className="link" onClick={() => mark({ [s.manual!]: true })}>Já fiz</button>}
          </li>
        ))}
      </ol>
    </section>
  )
}
