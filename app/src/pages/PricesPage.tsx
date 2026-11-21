import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { loadMySalon, type Role } from '../lib/mySalon'
import { euros, supabase, type Professional, type Salon, type Service } from '../lib/supabase'
import { parseEuros } from '../lib/onboarding'
import { overrideKey, type Overrides } from '../lib/pricing'
import { loadOverrides } from '../lib/pricingData'

interface Cell { offered: boolean; price: string; duration: string }
const centsToText = (c: number) => (c / 100).toFixed(2).replace('.', ',')

/** For each service, who does it, and at what price and length if different from the service's. */
export default function PricesPage() {
  const [session, setSession] = useState<Session | null>()
  const [role, setRole] = useState<Role>('dono')
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Service[]>([])
  const [pros, setPros] = useState<Professional[]>([])
  const [saved, setSaved] = useState<Overrides>({})
  const [cells, setCells] = useState<Record<string, Cell>>({})
  const [ready, setReady] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [saving, setSaving] = useState(false)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => { setRole(r.role); setSalon(r.salon) })
  }, [session])

  const load = useCallback(async () => {
    if (!salon) return
    const [sv, pr, ov] = await Promise.all([
      supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', salon.id).eq('active', true).order('name'),
      supabase.from('professionals').select('id,name').eq('salon_id', salon.id).eq('active', true).order('name'),
      loadOverrides(salon.id),
    ])
    setServices(sv.data ?? []); setPros(pr.data ?? []); setSaved(ov.overrides); setReady(ov.ready)
    const c: Record<string, Cell> = {}
    for (const s of sv.data ?? []) for (const p of pr.data ?? []) {
      const o = ov.overrides[overrideKey(s.id, p.id)]
      c[overrideKey(s.id, p.id)] = {
        offered: o?.offered ?? true,
        price: o?.price_cents != null ? centsToText(o.price_cents) : '',
        duration: o?.duration_min != null ? String(o.duration_min) : '',
      }
    }
    setCells(c)
  }, [salon])
  useEffect(() => { load() }, [load])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  // Team members don't see the salon's settings, prices, hours or revenue.
  if (role !== 'dono') return <Navigate to="/painel" replace />

  const setCell = (k: string, patch: Partial<Cell>) => { setCells(c => ({ ...c, [k]: { ...c[k], ...patch } })); setMsg(undefined) }

  async function save() {
    setSaving(true); setMsg(undefined)
    const upserts: object[] = []
    const deletes: { service_id: string; professional_id: string }[] = []
    for (const s of services) for (const p of pros) {
      const k = overrideKey(s.id, p.id)
      const c = cells[k]
      const price = c.price.trim() ? parseEuros(c.price) : null
      const duration = c.duration.trim() ? Number(c.duration) : null
      if (Number.isNaN(price)) { setSaving(false); setMsg({ ok: false, text: `Preço inválido em ${s.name} (${p.name}).` }); return }
      if (duration !== null && !(Number.isInteger(duration) && duration >= 5 && duration <= 600)) {
        setSaving(false); setMsg({ ok: false, text: `Duração inválida em ${s.name} (${p.name}): entre 5 e 600 minutos.` }); return
      }
      const isDefault = c.offered && price === null && duration === null
      if (isDefault) { if (saved[k]) deletes.push({ service_id: s.id, professional_id: p.id }) }
      else upserts.push({ service_id: s.id, professional_id: p.id, salon_id: salon!.id, offered: c.offered, price_cents: price, duration_min: duration })
    }
    if (services.some(s => pros.every(p => !cells[overrideKey(s.id, p.id)].offered))) {
      setSaving(false); setMsg({ ok: false, text: 'Cada serviço ativo precisa de pelo menos um profissional.' }); return
    }
    const results = await Promise.all([
      upserts.length ? supabase.from('service_overrides').upsert(upserts) : Promise.resolve({ error: null }),
      ...deletes.map(d => supabase.from('service_overrides').delete().eq('service_id', d.service_id).eq('professional_id', d.professional_id)),
    ])
    setSaving(false)
    if (results.some(r => r.error)) { setMsg({ ok: false, text: 'Não foi possível guardar. Tente de novo.' }); return }
    setMsg({ ok: true, text: 'Preços guardados.' }); load()
  }

  return (
    <main className="page">
      <header className="row"><h1>Preços por profissional</h1><Link to="/definicoes">‹ Definições</Link></header>
      {!ready ? <p className="banner">Para usar preços por profissional, corra <code>supabase/migrations/0011_professional_prices.sql</code> no editor SQL do Supabase.</p> : <>
        <p className="muted">Deixe em branco para usar o preço e a duração do serviço. Desmarque quem não faz o serviço: deixa de aparecer na marcação.</p>
        {pros.length < 2 && <p className="muted">Com um só profissional, basta o preço do serviço nas <Link to="/definicoes">Definições</Link>.</p>}
        {services.map(s => (
          <section key={s.id} className="card">
            <strong>{s.name}</strong> <small className="muted">· {s.duration_min} min · {euros(s.price_cents)}</small>
            {pros.map(p => {
              const k = overrideKey(s.id, p.id)
              const c = cells[k]
              if (!c) return null
              return (
                <div key={p.id} className={`price-row ${c.offered ? '' : 'off'}`}>
                  <label className="check"><input type="checkbox" checked={c.offered} onChange={e => setCell(k, { offered: e.target.checked })} />{p.name}</label>
                  {c.offered ? <>
                    <label>€<input inputMode="decimal" placeholder={centsToText(s.price_cents)} value={c.price} onChange={e => setCell(k, { price: e.target.value })} /></label>
                    <label>Min<input inputMode="numeric" placeholder={String(s.duration_min)} value={c.duration} onChange={e => setCell(k, { duration: e.target.value })} /></label>
                  </> : <span className="muted small">Não faz</span>}
                </div>
              )
            })}
          </section>
        ))}
        {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
        <button className="btn" onClick={save} disabled={saving}>{saving ? 'A guardar…' : 'Guardar preços'}</button>
      </>}
    </main>
  )
}
