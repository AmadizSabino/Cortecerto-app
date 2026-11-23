import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import { parseEuros } from '../lib/onboarding'
import { FEE_RULES, type HomeFee, type HomeSettings, type Zone } from '../lib/home'
import { themeById, themeStyle } from '../lib/themes'
import HelpLink from '../HelpLink'

interface Row { id: string; name: string; at_home: boolean }
const cents = (c: number) => (c / 100).toFixed(2).replace('.', ',')

/**
 * Mais > Ao domicílio (migration 0022): whether home visits are on, the zones with
 * their travel fee and time, extra fees, the minimum order, and which services and
 * professionals go out. The client sees the full price before booking.
 */
export default function HomeSettingsPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [settings, setSettings] = useState({ active: false, min: '0', deposit: true })
  const [zones, setZones] = useState<(Omit<Zone, 'postcodes' | 'fee_cents'> & { postcodes: string; fee: string })[]>([])
  const [fees, setFees] = useState<(Omit<HomeFee, 'amount_cents'> & { amount: string })[]>([])
  const [services, setServices] = useState<Row[]>([])
  const [pros, setPros] = useState<Row[]>([])
  const [missing, setMissing] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [saving, setSaving] = useState(false)
  const [removed, setRemoved] = useState<{ zones: string[]; fees: string[] }>({ zones: [], fees: [] })

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => { setRole(r.role); setSalon(r.salon) })
  }, [session])

  const load = useCallback(async () => {
    if (!salon) return
    const [hs, zs, fs, sv, pr] = await Promise.all([
      supabase.from('home_settings').select('*').eq('salon_id', salon.id).maybeSingle(),
      supabase.from('home_zones').select('*').eq('salon_id', salon.id).order('position'),
      supabase.from('home_fees').select('*').eq('salon_id', salon.id),
      supabase.from('services').select('id,name,at_home').eq('salon_id', salon.id).eq('active', true).order('name'),
      supabase.from('professionals').select('id,name,at_home').eq('salon_id', salon.id).eq('active', true).order('name'),
    ])
    setMissing(Boolean(hs.error))
    const h = hs.data as HomeSettings | null
    setSettings({ active: h?.active ?? false, min: cents(h?.min_order_cents ?? 0), deposit: h?.deposit_required ?? true })
    setZones(((zs.data ?? []) as Zone[]).map(z => ({ ...z, postcodes: z.postcodes.join(', '), fee: cents(z.fee_cents) })))
    setFees(((fs.data ?? []) as HomeFee[]).map(f => ({ ...f, at: f.at?.slice(0, 5) ?? null, amount: cents(f.amount_cents) })))
    setServices((sv.data ?? []) as Row[]); setPros((pr.data ?? []) as Row[])
    setRemoved({ zones: [], fees: [] })
  }, [salon])
  useEffect(() => { load() }, [load])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (!can(role, 'domicilio')) return <Navigate to="/painel" replace />

  function validate(): string {
    if (isNaN(parseEuros(settings.min))) return 'Indique o pedido mínimo em euros (0 se não houver).'
    if (settings.active && zones.filter(z => z.active && z.name.trim()).length === 0) return 'Crie pelo menos uma zona.'
    if (settings.active && !services.some(s => s.at_home)) return 'Escolha os serviços que faz ao domicílio.'
    if (settings.active && !pros.some(p => p.at_home)) return 'Escolha quem faz visitas ao domicílio.'
    for (const z of zones) {
      if (!z.name.trim()) return 'Cada zona precisa de um nome.'
      if (isNaN(parseEuros(z.fee))) return `Indique a deslocação de "${z.name}" em euros.`
      if (z.postcodes.split(/[,\s]+/).filter(Boolean).some(c => !/^\d{4}$/.test(c))) return `Os códigos postais de "${z.name}" são os 4 primeiros dígitos, separados por vírgulas (ex.: 2900, 2910).`
    }
    for (const f of fees) {
      if (!f.label.trim() || isNaN(parseEuros(f.amount)) || parseEuros(f.amount) <= 0) return 'Cada taxa precisa de um nome e de um valor.'
      if ((f.rule === 'antes_das' || f.rule === 'depois_das') && !f.at) return `Indique a hora da taxa "${f.label}".`
    }
    return ''
  }

  async function save() {
    const v = validate()
    if (v) { setMsg({ ok: false, text: v }); return }
    setSaving(true); setMsg(undefined)
    const s = salon!
    const results = await Promise.all([
      supabase.from('home_settings').upsert({ salon_id: s.id, active: settings.active, min_order_cents: parseEuros(settings.min), deposit_required: settings.deposit, updated_at: new Date().toISOString() }),
      ...zones.map((z, i) => {
        const row = { salon_id: s.id, name: z.name.trim(), postcodes: z.postcodes.split(/[,\s]+/).filter(Boolean), fee_cents: parseEuros(z.fee), travel_min: z.travel_min, position: i, active: z.active }
        return z.id.startsWith('novo-') ? supabase.from('home_zones').insert(row) : supabase.from('home_zones').update(row).eq('id', z.id)
      }),
      ...fees.map(f => {
        const row = { salon_id: s.id, label: f.label.trim(), rule: f.rule, at: f.rule === 'antes_das' || f.rule === 'depois_das' ? f.at : null, amount_cents: parseEuros(f.amount), active: f.active }
        return f.id.startsWith('novo-') ? supabase.from('home_fees').insert(row) : supabase.from('home_fees').update(row).eq('id', f.id)
      }),
      ...removed.zones.map(id => supabase.from('home_zones').update({ active: false }).eq('id', id)),
      ...removed.fees.map(id => supabase.from('home_fees').delete().eq('id', id)),
      ...services.map(x => supabase.from('services').update({ at_home: x.at_home }).eq('id', x.id)),
      ...pros.map(x => supabase.from('professionals').update({ at_home: x.at_home }).eq('id', x.id)),
    ])
    setSaving(false)
    if (results.some(r => r.error)) { setMsg({ ok: false, text: 'Algumas alterações não ficaram guardadas. Tente de novo.' }); return }
    setMsg({ ok: true, text: settings.active ? 'Guardado. A página de marcação já oferece visitas ao domicílio.' : 'Guardado. As visitas ao domicílio estão desligadas.' })
    load()
  }

  const newId = () => `novo-${Math.random().toString(36).slice(2)}`
  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page">
      <header className="row"><h1>Ao domicílio<HelpLink /></h1><Link to="/mais">‹ Mais</Link></header>
      {missing ? <p className="banner">Para usar visitas ao domicílio, corra <code>supabase/migrations/0022_business_home_packages.sql</code> no editor SQL do Supabase.</p> : <>
        <p className="muted">O cliente vê o preço total antes de marcar: serviço + deslocação da zona + taxas que ligar. O tempo de viagem fica bloqueado na agenda, antes e depois da visita.</p>
        <label className="check card"><input type="checkbox" checked={settings.active} onChange={e => setSettings({ ...settings, active: e.target.checked })} /><b>Aceitar marcações ao domicílio</b></label>

        <h2>Zonas</h2>
        <p className="muted small">Cada zona tem o preço da deslocação e o tempo de viagem (só ida). O cliente escreve o código postal e a app escolhe a zona; se não bater, escolhe pelo nome.</p>
        {zones.map((z, i) => (
          <div key={z.id} className={z.active ? 'card' : 'card off'}>
            <div className="row"><input aria-label="Nome da zona" placeholder="Ex.: Setúbal centro" value={z.name} onChange={e => setZones(zs => zs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} style={{ flex: 1 }} />
              <label className="check"><input type="checkbox" checked={z.active} onChange={e => setZones(zs => zs.map((x, j) => j === i ? { ...x, active: e.target.checked } : x))} />Ativa</label></div>
            <div className="row">
              <label style={{ flex: 1 }}>Deslocação (€)<input inputMode="decimal" value={z.fee} onChange={e => setZones(zs => zs.map((x, j) => j === i ? { ...x, fee: e.target.value } : x))} /></label>
              <label style={{ flex: 1 }}>Viagem (min)<input inputMode="numeric" value={z.travel_min} onChange={e => setZones(zs => zs.map((x, j) => j === i ? { ...x, travel_min: Math.max(0, Math.min(180, Number(e.target.value.replace(/\D/g, '')) || 0)) } : x))} /></label>
            </div>
            <label>Códigos postais <span className="muted">(4 dígitos, opcional)</span><input value={z.postcodes} placeholder="2900, 2910" onChange={e => setZones(zs => zs.map((x, j) => j === i ? { ...x, postcodes: e.target.value } : x))} /></label>
            {!z.id.startsWith('novo-') ? null : <button className="link" onClick={() => setZones(zs => zs.filter((_, j) => j !== i))}>Remover</button>}
          </div>
        ))}
        <button onClick={() => setZones(zs => [...zs, { id: newId(), name: '', postcodes: '', fee: '5,00', travel_min: 15, position: zs.length, active: true }])}>+ Zona</button>

        <h2>Taxas extra</h2>
        <p className="muted small">Ligue só as que usa. Ex.: antes das 9h, depois das 20h, ao fim de semana, ou sempre (estacionamento).</p>
        {fees.map((f, i) => (
          <div key={f.id} className={f.active ? 'card' : 'card off'}>
            <div className="row"><input aria-label="Nome da taxa" placeholder="Ex.: Antes das 9h" value={f.label} onChange={e => setFees(fs => fs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} style={{ flex: 1 }} />
              <label className="check"><input type="checkbox" checked={f.active} onChange={e => setFees(fs => fs.map((x, j) => j === i ? { ...x, active: e.target.checked } : x))} />Ativa</label></div>
            <div className="row">
              <label style={{ flex: 2 }}>Quando
                <select value={f.rule} onChange={e => setFees(fs => fs.map((x, j) => j === i ? { ...x, rule: e.target.value as HomeFee['rule'] } : x))}>
                  {FEE_RULES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </label>
              {(f.rule === 'antes_das' || f.rule === 'depois_das') && <label style={{ flex: 1 }}>Hora<input type="time" value={f.at ?? ''} onChange={e => setFees(fs => fs.map((x, j) => j === i ? { ...x, at: e.target.value } : x))} /></label>}
              <label style={{ flex: 1 }}>Valor (€)<input inputMode="decimal" value={f.amount} onChange={e => setFees(fs => fs.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} /></label>
            </div>
            <button className="link danger-link" onClick={() => { if (!f.id.startsWith('novo-')) setRemoved(r => ({ ...r, fees: [...r.fees, f.id] })); setFees(fs => fs.filter((_, j) => j !== i)) }}>Apagar</button>
          </div>
        ))}
        <button onClick={() => setFees(fs => [...fs, { id: newId(), label: '', rule: 'antes_das', at: '09:00', amount: '5,00', active: true }])}>+ Taxa</button>

        <h2>Regras</h2>
        <label>Pedido mínimo em serviços (€)<input inputMode="decimal" value={settings.min} onChange={e => setSettings({ ...settings, min: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={settings.deposit} onChange={e => setSettings({ ...settings, deposit: e.target.checked })} />Pedir sempre o sinal ({euros(salon.deposit_cents)}) nas visitas ao domicílio</label>
        {salon.deposit_cents === 0 && <p className="muted small">O sinal do salão está a 0 €. Mude-o em <Link to="/definicoes">Definições</Link>: uma falta em casa do cliente custa mais do que uma cadeira vazia.</p>}

        <h2>Serviços que faz ao domicílio</h2>
        {services.map((x, i) => <label key={x.id} className="check"><input type="checkbox" checked={x.at_home} onChange={e => setServices(ss => ss.map((y, j) => j === i ? { ...y, at_home: e.target.checked } : y))} />{x.name}</label>)}
        <h2>Quem faz visitas</h2>
        {pros.map((x, i) => <label key={x.id} className="check"><input type="checkbox" checked={x.at_home} onChange={e => setPros(ps => ps.map((y, j) => j === i ? { ...y, at_home: e.target.checked } : y))} />{x.name}</label>)}

        {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
        <div className="sticky-cta"><button className="btn" onClick={save} disabled={saving}>{saving ? 'A guardar…' : 'Guardar'}</button></div>
        <p className="muted small">Na agenda, cada visita tem "A caminho" (avisa o cliente por WhatsApp) e "Terminei" (regista quanto tempo demorou).</p>
      </>}
    </main></div>
  )
}
