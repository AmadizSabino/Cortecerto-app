import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import { supabase, type Professional, type Salon } from '../lib/supabase'
import { WEEKDAYS } from '../lib/onboarding'
import { emptyWeek, weekToRows, type DayForm, type SalonHours } from '../lib/schedule'
import { loadHours } from '../lib/scheduleData'
import { addDays, dateInTz, formatTime, zonedToUtc } from '../lib/time'
import HelpLink from '../HelpLink'

interface TimeOff { id: string; professional_id: string | null; starts_at: string; ends_at: string; reason: string | null }

/** Each professional's weekly hours (with breaks), and time off for one person or the whole salon. */
export default function SchedulePage() {
  const [session, setSession] = useState<Session | null>()
  const [role, setRole] = useState<Role>('dono')
  const [salon, setSalon] = useState<Salon | null>()
  const [pros, setPros] = useState<Professional[]>([])
  const [hours, setHours] = useState<SalonHours | null>(null)
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState<{ proId: string; own: boolean; week: DayForm[] } | null>(null)
  const [offs, setOffs] = useState<TimeOff[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [off, setOff] = useState({ who: '', allDay: true, from: '', to: '', start: '13:00', end: '14:00', reason: '' })

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => { setRole(r.role); setSalon(r.salon) })
  }, [session])

  const load = useCallback(async () => {
    if (!salon) return
    const [pr, h, t] = await Promise.all([
      supabase.from('professionals').select('id,name').eq('salon_id', salon.id).eq('active', true).order('name'),
      loadHours(salon.id),
      supabase.from('time_off').select('*').eq('salon_id', salon.id).gte('ends_at', new Date().toISOString()).order('starts_at'),
    ])
    // Before migration 0009 the time_off table doesn't exist.
    setMissing(Boolean(t.error))
    setPros(pr.data ?? []); setHours(h); setOffs(t.data ?? [])
    const today = dateInTz(new Date(), salon.timezone)
    setOff(o => ({ ...o, from: o.from || today, to: o.to || today }))
  }, [salon])
  useEffect(() => { load() }, [load])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  // Team members don't see the salon's settings, prices, hours or revenue.
  if (!can(role, 'horarios')) return <Navigate to="/painel" replace />

  const tz = salon.timezone
  const proName = (id: string | null) => id ? pros.find(p => p.id === id)?.name ?? 'Profissional' : 'Todo o salão'

  function startEdit(p: Professional) {
    const own = hours?.byPro[p.id] ?? []
    setEditing({ proId: p.id, own: own.length > 0, week: emptyWeek(own.length > 0 ? own : hours?.salon ?? []) })
    setMsg(undefined)
  }

  function setDay(i: number, patch: Partial<DayForm>) {
    setEditing(e => e && { ...e, week: e.week.map((d, j) => j === i ? { ...d, ...patch } : d) })
  }

  async function saveHours() {
    if (!editing) return
    const rows = editing.own ? weekToRows(editing.week) : []
    if (typeof rows === 'string') { setMsg({ ok: false, text: rows }); return }
    if (editing.own && rows.length === 0) { setMsg({ ok: false, text: 'Escolha pelo menos um dia de trabalho.' }); return }
    // If the new hours can't be written, put the old ones back.
    const old = hours?.byPro[editing.proId] ?? []
    const del = await supabase.from('professional_hours').delete().eq('professional_id', editing.proId)
    const ins = rows.length && !del.error
      ? await supabase.from('professional_hours').insert(rows.map(r => ({ ...r, professional_id: editing.proId, salon_id: salon!.id })))
      : { error: null }
    if (ins.error && old.length) await supabase.from('professional_hours').insert(old.map(r => ({ ...r, professional_id: editing.proId, salon_id: salon!.id })))
    if (del.error || ins.error) { setMsg({ ok: false, text: 'Não foi possível guardar. Tente de novo.' }); return }
    setEditing(null); setMsg({ ok: true, text: 'Horário guardado.' }); load()
  }

  async function addOff(e: React.FormEvent) {
    e.preventDefault()
    if (!off.from || !off.to || off.to < off.from) { setMsg({ ok: false, text: 'Verifique as datas.' }); return }
    if (!off.allDay && off.end <= off.start) { setMsg({ ok: false, text: 'A hora de fim tem de ser depois do início.' }); return }
    const starts = off.allDay ? zonedToUtc(off.from, '00:00', tz) : zonedToUtc(off.from, off.start, tz)
    const ends = off.allDay ? zonedToUtc(addDays(off.to, 1), '00:00', tz) : zonedToUtc(off.from, off.end, tz)
    const { error } = await supabase.from('time_off').insert({
      salon_id: salon!.id, professional_id: off.who || null,
      starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason: off.reason.trim() || null,
    })
    if (error) { setMsg({ ok: false, text: 'Não foi possível guardar. Tente de novo.' }); return }
    setMsg({ ok: true, text: 'Bloqueio adicionado. Ninguém consegue marcar nesse período.' })
    setOff(o => ({ ...o, reason: '' })); load()
  }

  async function removeOff(id: string) {
    const { error } = await supabase.from('time_off').delete().eq('id', id)
    if (!error) setOffs(os => os.filter(o => o.id !== id))
  }

  function offText(t: TimeOff) {
    const s = new Date(t.starts_at), e = new Date(t.ends_at)
    const day = (d: Date) => d.toLocaleDateString('pt-PT', { timeZone: tz, day: 'numeric', month: 'short' })
    const wholeDays = formatTime(s, tz) === '00:00' && formatTime(e, tz) === '00:00'
    if (wholeDays) {
      const last = new Date(e.getTime() - 1)
      return day(s) === day(last) ? `${day(s)}, dia inteiro` : `${day(s)} a ${day(last)}`
    }
    return `${day(s)}, ${formatTime(s, tz)}–${formatTime(e, tz)}`
  }

  return (
    <main className="page">
      <header className="row"><h1>Horários e folgas<HelpLink /></h1><Link to="/mais">‹ Mais</Link></header>
      {missing && <p className="banner">Para usar horários por profissional e folgas, corra <code>supabase/migrations/0009_schedules.sql</code> no editor SQL do Supabase.</p>}
      {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}

      {!missing && <>
        <h2>Horário de cada profissional</h2>
        <p className="muted">Por defeito, cada profissional segue o horário do salão. Defina um horário próprio para quem tem outros dias, outras horas ou uma pausa para almoço.</p>
        {pros.map(p => editing?.proId === p.id ? (
          <div key={p.id} className="card">
            <strong>{p.name}</strong>
            <label className="check"><input type="radio" checked={!editing.own} onChange={() => setEditing({ ...editing, own: false })} />Segue o horário do salão</label>
            <label className="check"><input type="radio" checked={editing.own} onChange={() => setEditing({ ...editing, own: true })} />Tem horário próprio</label>
            {editing.own && editing.week.map((d, i) => (
              <div key={i} className="sched-day">
                <label className="check"><input type="checkbox" checked={d.open} onChange={e => setDay(i, { open: e.target.checked })} />{WEEKDAYS[i]}</label>
                {d.open ? <div className="sched-times">
                  <input type="time" aria-label="Entrada" value={d.opens} onChange={e => setDay(i, { opens: e.target.value })} />
                  <span>–</span>
                  <input type="time" aria-label="Saída" value={d.closes} onChange={e => setDay(i, { closes: e.target.value })} />
                  <small className="muted">Pausa</small>
                  <input type="time" aria-label="Início da pausa" value={d.breakFrom} onChange={e => setDay(i, { breakFrom: e.target.value })} />
                  <span>–</span>
                  <input type="time" aria-label="Fim da pausa" value={d.breakTo} onChange={e => setDay(i, { breakTo: e.target.value })} />
                </div> : <span className="muted">Folga</span>}
              </div>
            ))}
            <div className="row">
              <button className="btn-inline" onClick={saveHours}>Guardar</button>
              <button className="link" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div key={p.id} className="card row">
            <span><strong>{p.name}</strong><br /><small className="muted">{(hours?.byPro[p.id]?.length ?? 0) > 0 ? 'Horário próprio' : 'Horário do salão'}</small></span>
            <button onClick={() => startEdit(p)}>Alterar</button>
          </div>
        ))}

        <h2>Folgas, férias e bloqueios</h2>
        <form className="card" onSubmit={addOff}>
          <label>Quem
            <select value={off.who} onChange={e => setOff({ ...off, who: e.target.value })}>
              <option value="">Todo o salão (feriado, fecho)</option>
              {pros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="check"><input type="radio" checked={off.allDay} onChange={() => setOff({ ...off, allDay: true })} />Dias inteiros</label>
          <label className="check"><input type="radio" checked={!off.allDay} onChange={() => setOff({ ...off, allDay: false, to: off.from })} />Algumas horas</label>
          {off.allDay ? (
            <div className="row">
              <label>De<input type="date" value={off.from} onChange={e => setOff({ ...off, from: e.target.value, to: off.to < e.target.value ? e.target.value : off.to })} /></label>
              <label>Até<input type="date" value={off.to} onChange={e => setOff({ ...off, to: e.target.value })} /></label>
            </div>
          ) : (
            <div className="row">
              <label>Dia<input type="date" value={off.from} onChange={e => setOff({ ...off, from: e.target.value, to: e.target.value })} /></label>
              <label>Das<input type="time" value={off.start} onChange={e => setOff({ ...off, start: e.target.value })} /></label>
              <label>Às<input type="time" value={off.end} onChange={e => setOff({ ...off, end: e.target.value })} /></label>
            </div>
          )}
          <label>Motivo (só o salão vê)<input value={off.reason} maxLength={80} placeholder="Férias, consulta, formação…" onChange={e => setOff({ ...off, reason: e.target.value })} /></label>
          <button>Adicionar bloqueio</button>
        </form>

        {offs.length === 0 ? <p className="muted">Sem folgas ou bloqueios marcados.</p> : (
          <ul className="history">
            {offs.map(t => (
              <li key={t.id} className="off-row">
                <span>{offText(t)}</span>
                <span>{proName(t.professional_id)}{t.reason && <small className="muted"> · {t.reason}</small>}</span>
                <button className="link" onClick={() => removeOff(t.id)}>Remover</button>
              </li>
            ))}
          </ul>
        )}
      </>}
    </main>
  )
}
