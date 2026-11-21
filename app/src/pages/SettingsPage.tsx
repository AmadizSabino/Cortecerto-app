import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Salon } from '../lib/supabase'
import { parseEuros, WEEKDAYS } from '../lib/onboarding'
import ThemePicker from '../ThemePicker'
import { CHANGE_OPTIONS } from '../lib/clientChanges'
import { exportBookings, exportClients } from '../lib/exportData'

interface SvcRow { id?: string; name: string; duration: string; price: string; active: boolean }
interface ProRow { id?: string; name: string; active: boolean }
interface DayRow { open: boolean; opens: string; closes: string }

const centsToText = (c: number) => (c / 100).toFixed(2).replace('.', ',')

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [info, setInfo] = useState({ name: '', whatsapp: '', mbway: '', deposit: '0', theme: '', change: '2' })
  const [allThemes, setAllThemes] = useState(false)
  const [services, setServices] = useState<SvcRow[]>([])
  const [pros, setPros] = useState<ProRow[]>([])
  const [days, setDays] = useState<DayRow[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState('')

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])

  async function load(userId: string) {
    const { data: s } = await supabase.from('salons').select('*').eq('owner_id', userId).maybeSingle()
    setSalon(s)
    if (!s) return
    setInfo({ name: s.name, whatsapp: s.whatsapp ?? '', mbway: s.mbway_number ?? '', deposit: centsToText(s.deposit_cents), theme: s.theme, change: s.client_change_hours == null ? '' : String(s.client_change_hours) })
    const [sv, pr, hr] = await Promise.all([
      supabase.from('services').select('id,name,duration_min,price_cents,active').eq('salon_id', s.id).order('name'),
      supabase.from('professionals').select('id,name,active').eq('salon_id', s.id).order('name'),
      supabase.from('opening_hours').select('weekday,opens,closes').eq('salon_id', s.id),
    ])
    setServices((sv.data ?? []).map(x => ({ id: x.id, name: x.name, duration: String(x.duration_min), price: centsToText(x.price_cents), active: x.active })))
    setPros(pr.data ?? [])
    setDays(WEEKDAYS.map((_, i) => {
      const h = (hr.data ?? []).find(x => x.weekday === i)
      return h ? { open: true, opens: h.opens.slice(0, 5), closes: h.closes.slice(0, 5) } : { open: false, opens: '09:00', closes: '19:00' }
    }))
  }
  useEffect(() => { if (session) load(session.user.id) }, [session])

  if (session === undefined || (session && salon === undefined)) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === null) return <Navigate to="/registar" replace />

  const setSvc = (i: number, p: Partial<SvcRow>) => setServices(r => r.map((x, j) => j === i ? { ...x, ...p } : x))
  const setPro = (i: number, p: Partial<ProRow>) => setPros(r => r.map((x, j) => j === i ? { ...x, ...p } : x))
  const setDay = (i: number, p: Partial<DayRow>) => setDays(r => r.map((x, j) => j === i ? { ...x, ...p } : x))

  function validate(): string {
    if (!info.name.trim()) return 'Indique o nome do salão.'
    const dep = parseEuros(info.deposit)
    if (isNaN(dep)) return 'Valor do sinal inválido.'
    if (dep > 0 && info.mbway.replace(/\D/g, '').length < 9) return 'Para pedir sinal, indique o número MB Way do salão.'
    const svc = services.filter(s => s.name.trim())
    if (!svc.some(s => s.active)) return 'Mantenha pelo menos um serviço ativo.'
    if (svc.some(s => isNaN(parseEuros(s.price)) || !(Number(s.duration) >= 5))) return 'Verifique o preço e a duração (mínimo 5 min) de cada serviço.'
    if (!pros.some(p => p.active && p.name.trim())) return 'Mantenha pelo menos um profissional ativo.'
    if (days.some(d => d.open && d.closes <= d.opens)) return 'A hora de fecho tem de ser depois da abertura.'
    return ''
  }

  async function save() {
    const v = validate()
    if (v) { setMsg({ ok: false, text: v }); return }
    setSaving(true); setMsg(undefined)
    const s = salon!
    const results = await Promise.all([
      supabase.from('salons').update({
        name: info.name.trim(), whatsapp: info.whatsapp.replace(/\D/g, '') || null,
        mbway_number: info.mbway.replace(/\D/g, '') || null, deposit_cents: parseEuros(info.deposit), theme: info.theme,
        // Only once migration 0007 has added the column, so saving still works before it.
        ...('client_change_hours' in s ? { client_change_hours: info.change === '' ? null : Number(info.change) } : {}),
      }).eq('id', s.id),
      // Services and team are switched off rather than deleted, so past bookings keep their history.
      ...services.filter(x => x.name.trim()).map(x => {
        const row = { salon_id: s.id, name: x.name.trim(), duration_min: Number(x.duration), price_cents: parseEuros(x.price), active: x.active }
        return x.id ? supabase.from('services').update(row).eq('id', x.id) : supabase.from('services').insert(row)
      }),
      ...pros.filter(x => x.name.trim()).map(x => {
        const row = { salon_id: s.id, name: x.name.trim(), active: x.active }
        return x.id ? supabase.from('professionals').update(row).eq('id', x.id) : supabase.from('professionals').insert(row)
      }),
    ])
    let failed = results.some(r => r.error)
    if (!failed) {
      const del = await supabase.from('opening_hours').delete().eq('salon_id', s.id)
      const rows = days.flatMap((d, i) => d.open ? [{ salon_id: s.id, weekday: i, opens: d.opens, closes: d.closes }] : [])
      const ins = rows.length ? await supabase.from('opening_hours').insert(rows) : { error: null }
      failed = Boolean(del.error || ins.error)
    }
    setSaving(false)
    setMsg(failed ? { ok: false, text: 'Algumas alterações não foram guardadas. Tente de novo.' } : { ok: true, text: 'Alterações guardadas.' })
    await load(session!.user.id)
  }

  return (
    <main className="page">
      <header className="row"><h1>Definições</h1><Link to="/painel">‹ Agenda</Link></header>

      <h2>Salão</h2>
      <label>Nome<input value={info.name} onChange={e => setInfo({ ...info, name: e.target.value })} /></label>
      <label>WhatsApp<input inputMode="tel" value={info.whatsapp} onChange={e => setInfo({ ...info, whatsapp: e.target.value })} /></label>
      <label>Sinal por marcação (€)<input inputMode="decimal" value={info.deposit} onChange={e => setInfo({ ...info, deposit: e.target.value })} /></label>
      <label>Número MB Way<input inputMode="tel" value={info.mbway} onChange={e => setInfo({ ...info, mbway: e.target.value })} /></label>
      {'client_change_hours' in salon! && (
        <label>Clientes podem cancelar ou mudar online
          <select value={info.change} onChange={e => setInfo({ ...info, change: e.target.value })}>
            {CHANGE_OPTIONS.map(o => <option key={String(o.value)} value={o.value == null ? '' : String(o.value)}>{o.label}</option>)}
          </select>
        </label>
      )}

      <h2>Estilo da página</h2>
      <ThemePicker value={info.theme} type={salon!.type} showAll={allThemes} onChange={theme => setInfo({ ...info, theme })} />
      <button type="button" className="link" onClick={() => setAllThemes(!allThemes)}>{allThemes ? 'Ver só os do meu tipo de salão' : 'Ver todos os estilos'}</button>

      <h2>Serviços e preços</h2>
      <p className="muted"><Link to="/precos">Preços e durações diferentes por profissional</Link></p>
      {services.map((s, i) => (
        <div key={s.id ?? 'new' + i} className={s.active ? 'card svc-row' : 'card svc-row off'}>
          <input aria-label="Serviço" placeholder="Serviço" value={s.name} onChange={e => setSvc(i, { name: e.target.value })} />
          <label>Min<input inputMode="numeric" value={s.duration} onChange={e => setSvc(i, { duration: e.target.value })} /></label>
          <label>€<input inputMode="decimal" value={s.price} onChange={e => setSvc(i, { price: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={s.active} onChange={e => setSvc(i, { active: e.target.checked })} />Ativo</label>
        </div>
      ))}
      <button type="button" onClick={() => setServices(r => [...r, { name: '', duration: '30', price: '', active: true }])}>+ Adicionar serviço</button>

      <h2>Equipa</h2>
      {pros.map((p, i) => (
        <div key={p.id ?? 'new' + i} className="row">
          <input aria-label="Nome do profissional" value={p.name} onChange={e => setPro(i, { name: e.target.value })} style={{ flex: 1 }} />
          <label className="check"><input type="checkbox" checked={p.active} onChange={e => setPro(i, { active: e.target.checked })} />Ativo</label>
        </div>
      ))}
      <button type="button" onClick={() => setPros(r => [...r, { name: '', active: true }])} style={{ marginTop: 8 }}>+ Adicionar profissional</button>

      <h2>Horário</h2>
      <p className="muted">Horário de abertura do salão. <Link to="/horarios">Horários por profissional, pausas, folgas e férias</Link></p>
      {days.map((d, i) => (
        <div key={i} className="row day-row">
          <label className="check"><input type="checkbox" checked={d.open} onChange={e => setDay(i, { open: e.target.checked })} />{WEEKDAYS[i]}</label>
          {d.open ? <span className="row">
            <input type="time" aria-label="Abre" value={d.opens} onChange={e => setDay(i, { opens: e.target.value })} />
            <input type="time" aria-label="Fecha" value={d.closes} onChange={e => setDay(i, { closes: e.target.value })} />
          </span> : <span className="muted">Fechado</span>}
        </div>
      ))}

      {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
      <button className="btn" onClick={save} disabled={saving}>{saving ? 'A guardar…' : 'Guardar alterações'}</button>
      <h2>Os seus dados</h2>
      <p className="muted">Descarregue uma cópia em CSV (abre no Excel). Os dados dos clientes são do salão: guarde os ficheiros em segurança.</p>
      <div className="actions">
        <button disabled={Boolean(exporting)} onClick={async () => { setExporting('clientes'); try { await exportClients(salon!) } finally { setExporting('') } }}>
          {exporting === 'clientes' ? 'A preparar…' : 'Exportar clientes'}
        </button>
        <button disabled={Boolean(exporting)} onClick={async () => { setExporting('marcacoes'); try { await exportBookings(salon!) } finally { setExporting('') } }}>
          {exporting === 'marcacoes' ? 'A preparar…' : 'Exportar marcações'}
        </button>
      </div>
      <p className="muted small">Para apagar os dados de um cliente que o peça, abra-o em <Link to="/clientes">Clientes</Link>. Para apagar a conta do salão, escreva para o contacto indicado nos <Link to="/termos">termos</Link>.</p>
    </main>
  )
}
