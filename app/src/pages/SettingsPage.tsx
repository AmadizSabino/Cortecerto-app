import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Salon } from '../lib/supabase'
import { parseEuros, WEEKDAYS } from '../lib/onboarding'
import ThemePicker from '../ThemePicker'
import { themeById, themeStyle } from '../lib/themes'
import { CHANGE_OPTIONS } from '../lib/clientChanges'
import { exportBookings, exportClients } from '../lib/exportData'
import { loadMySalon } from '../lib/mySalon'

interface SvcRow { id?: string; name: string; duration: string; price: string; active: boolean }
interface DayRow { open: boolean; opens: string; closes: string }

const centsToText = (c: number) => (c / 100).toFixed(2).replace('.', ',')

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [info, setInfo] = useState({ name: '', whatsapp: '', mbway: '', deposit: '0', theme: '', change: '2', address: '', news: '', review: '' })
  const [allThemes, setAllThemes] = useState(false)
  const [services, setServices] = useState<SvcRow[]>([])
  const [days, setDays] = useState<DayRow[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState('')
  const [teamMember, setTeamMember] = useState(false)
  const [themeState, setThemeState] = useState<'' | 'saving' | 'saved' | 'error'>('')

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])

  async function load(userId: string) {
    const mine = await loadMySalon(userId)
    setTeamMember(mine.role !== 'dono')
    const s = mine.salon
    setSalon(s)
    if (!s || mine.role !== 'dono') return
    setInfo({ name: s.name, whatsapp: s.whatsapp ?? '', mbway: s.mbway_number ?? '', deposit: centsToText(s.deposit_cents), theme: s.theme, change: s.client_change_hours == null ? '' : String(s.client_change_hours), address: s.address ?? '', news: s.news ?? '', review: s.google_review_url ?? '' })
    const [sv, hr] = await Promise.all([
      supabase.from('services').select('id,name,duration_min,price_cents,active').eq('salon_id', s.id).order('name'),
      supabase.from('opening_hours').select('weekday,opens,closes').eq('salon_id', s.id),
    ])
    setServices((sv.data ?? []).map(x => ({ id: x.id, name: x.name, duration: String(x.duration_min), price: centsToText(x.price_cents), active: x.active })))
    setDays(WEEKDAYS.map((_, i) => {
      const h = (hr.data ?? []).find(x => x.weekday === i)
      return h ? { open: true, opens: h.opens.slice(0, 5), closes: h.closes.slice(0, 5) } : { open: false, opens: '09:00', closes: '19:00' }
    }))
  }
  useEffect(() => { if (session) load(session.user.id) }, [session])

  if (session === undefined || (session && salon === undefined)) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === null) return <Navigate to="/registar" replace />
  if (teamMember) return <Navigate to="/painel" replace />

  const setSvc = (i: number, p: Partial<SvcRow>) => setServices(r => r.map((x, j) => j === i ? { ...x, ...p } : x))
  const setDay = (i: number, p: Partial<DayRow>) => setDays(r => r.map((x, j) => j === i ? { ...x, ...p } : x))

  function validate(): string {
    if (!info.name.trim()) return 'Indique o nome do salão.'
    const dep = parseEuros(info.deposit)
    if (isNaN(dep)) return 'Valor do sinal inválido.'
    if (dep > 0 && info.mbway.replace(/\D/g, '').length < 9) return 'Para pedir sinal, indique o número MB Way do salão.'
    const svc = services.filter(s => s.name.trim())
    if (!svc.some(s => s.active)) return 'Mantenha pelo menos um serviço ativo.'
    if (svc.some(s => isNaN(parseEuros(s.price)) || !(Number(s.duration) >= 5))) return 'Verifique o preço e a duração (mínimo 5 min) de cada serviço.'
    if (days.some(d => d.open && d.closes <= d.opens)) return 'A hora de fecho tem de ser depois da abertura.'
    return ''
  }

  /** The style is saved as soon as it's picked, on its own, so nothing else on the page can block it. */
  async function chooseTheme(theme: string) {
    setInfo(i => ({ ...i, theme }))
    setThemeState('saving')
    const { data, error } = await supabase.from('salons').update({ theme }).eq('id', salon!.id).select('theme')
    setThemeState(!error && data?.length ? 'saved' : 'error')
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
        // Profile shown on the booking page (migration 0016); skipped if the columns aren't there yet.
        ...('address' in s ? { address: info.address.trim() || null, news: info.news.trim() || null, google_review_url: info.review.trim() || null } : {}),
      }).eq('id', s.id).select('id'),
      // Services are switched off rather than deleted, so past bookings keep their history.
      ...services.filter(x => x.name.trim()).map(x => {
        const row = { salon_id: s.id, name: x.name.trim(), duration_min: Number(x.duration), price_cents: parseEuros(x.price), active: x.active }
        return x.id ? supabase.from('services').update(row).eq('id', x.id) : supabase.from('services').insert(row)
      }),
    ])
    // The salon row must actually change: an update the database refuses returns no row rather than an error.
    let failed = results.some(r => r.error) || !(results[0] as { data: unknown[] | null }).data?.length
    if (!failed) {
      // Replace the week's hours; if the new ones can't be written, put the old ones back so the salon is never left closed.
      const old = await supabase.from('opening_hours').select('salon_id,weekday,opens,closes').eq('salon_id', s.id)
      const del = await supabase.from('opening_hours').delete().eq('salon_id', s.id)
      const rows = days.flatMap((d, i) => d.open ? [{ salon_id: s.id, weekday: i, opens: d.opens, closes: d.closes }] : [])
      const ins = rows.length && !del.error ? await supabase.from('opening_hours').insert(rows) : { error: null }
      if (ins.error && old.data?.length) await supabase.from('opening_hours').insert(old.data)
      failed = Boolean(old.error || del.error || ins.error)
    }
    setSaving(false)
    setMsg(failed ? { ok: false, text: 'Algumas alterações não foram guardadas. Tente de novo.' } : { ok: true, text: 'Alterações guardadas.' })
    await load(session!.user.id)
  }

  return (
    <div className="themed" style={themeStyle(themeById(info.theme))}><main className="page">
      <header className="row"><h1>Definições</h1><Link to="/mais">‹ Mais</Link></header>

      <h2>Salão</h2>
      <label>Nome<input value={info.name} onChange={e => setInfo({ ...info, name: e.target.value })} /></label>
      {'address' in salon! && <>
        <label><span>Morada <span className="muted">(aparece na página de marcação)</span></span><input value={info.address} placeholder="Rua das Flores 12, Lisboa" onChange={e => setInfo({ ...info, address: e.target.value })} /></label>
        <label><span>Novidades <span className="muted">(opcional)</span></span><textarea rows={2} value={info.news} placeholder="Chegou a nova pomada mate. Experimente na próxima visita." onChange={e => setInfo({ ...info, news: e.target.value })} /></label>
        <label><span>Link de avaliações Google <span className="muted">(opcional, para o poster)</span></span><input value={info.review} placeholder="https://g.page/r/…" onChange={e => setInfo({ ...info, review: e.target.value })} /></label>
      </>}
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
      <p className="muted">Guardado logo ao escolher. É o estilo do painel e da sua página de marcação.</p>
      <ThemePicker value={info.theme} type={salon!.type} showAll={allThemes} onChange={chooseTheme} />
      {themeState === 'saving' && <p className="muted small">A guardar o estilo…</p>}
      {themeState === 'saved' && <p className="ok small">Estilo guardado: {themeById(info.theme).name}. <a href={`/s/${salon!.slug}`} target="_blank" rel="noreferrer">Ver a página de marcação</a></p>}
      {themeState === 'error' && <p className="error small">Não foi possível guardar o estilo. Tente de novo.</p>}
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
      <p className="muted">Profissionais, comissões e acessos ao painel estão em <Link to="/equipa">Mais &gt; Equipa</Link>.</p>

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
      <div className="sticky-cta" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}><button className="btn" style={{ marginTop: 0 }} onClick={save} disabled={saving}>{saving ? 'A guardar…' : 'Guardar alterações'}</button></div>
      <h2>Assinatura</h2>
      <p className="muted"><Link to="/assinatura">Ver o período grátis e a assinatura</Link></p>

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
    </main></div>
  )
}
