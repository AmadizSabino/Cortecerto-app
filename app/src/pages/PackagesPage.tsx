import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon, { WhatsAppIcon } from '../components/Icon'
import { euros, supabase, type Salon, type Service } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import { parseEuros } from '../lib/onboarding'
import { mediaUrl, uploadMedia, type Photo } from '../lib/brand'
import { comboTotals, depositFor, MODES, priceLabel, type Package, type PackageItem, type PackageMode } from '../lib/packages'
import { dateInTz, zonedToUtc } from '../lib/time'
import { themeById, themeStyle } from '../lib/themes'
import { formatPhone, waLink } from '../lib/whatsapp'

interface Req {
  id: string; package_id: string; client_name: string; client_phone: string; event_date: string; event_time: string | null
  place: string; address: string | null; guests: number; extras: string[]; message: string | null; estimate_cents: number
  status: string; proposal_cents: number | null; deposit_cents: number | null; created_at: string; event_at: string | null; trial_at: string | null
}
interface ClientPack { id: string; package_id: string; client_name: string; client_phone: string; sessions_total: number; sessions_used: number; price_cents: number; status: string; expires_on: string | null; created_at: string }
interface Form {
  id?: string; mode: PackageMode; name: string; description: string; price: string; perGuest: string; maxGuests: string
  trial: boolean; extraHour: string; depositPct: string; sessions: string; validDays: string; active: boolean; image: string | null
  included: string[]; extras: { service_id: string; price: string }[]
}
const c2t = (c: number | null | undefined) => c == null ? '' : (c / 100).toFixed(2).replace('.', ',')
const blank = (mode: PackageMode): Form => ({ mode, name: '', description: '', price: '', perGuest: '', maxGuests: mode === 'evento' ? '6' : '', trial: mode === 'evento', extraHour: '', depositPct: mode === 'evento' ? '30' : '', sessions: mode === 'pack' ? '5' : '', validDays: mode === 'pack' ? '365' : '', active: true, image: null, included: [], extras: [] })
const STATUS: Record<string, string> = { pedido: 'Novo pedido', proposta: 'Proposta enviada', aceite: 'Aceite', recusado: 'Recusado', cancelado: 'Cancelado' }

/** The salon's proposal for one event request. */
function Proposal({ salon, req, pkg, pros, onDone }: { salon: Salon; req: Req; pkg: Package | undefined; pros: { id: string; name: string }[]; onDone: () => void }) {
  const tz = salon.timezone
  const [price, setPrice] = useState(c2t(req.proposal_cents ?? req.estimate_cents))
  const [deposit, setDeposit] = useState(c2t(req.deposit_cents ?? depositFor(req.estimate_cents, pkg?.deposit_pct ?? null)))
  const [pro, setPro] = useState(pros[0]?.id ?? '')
  const [trialDate, setTrialDate] = useState('')
  const [trialTime, setTrialTime] = useState('10:00')
  const [trialMin, setTrialMin] = useState('90')
  const [eventTime, setEventTime] = useState(req.event_time?.slice(0, 5) ?? '09:00')
  const [eventMin, setEventMin] = useState(String(Math.max(60, 60 + req.guests * 45)))
  const [note, setNote] = useState('')
  const [valid, setValid] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10) })
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function send(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const p = parseEuros(price), dp = parseEuros(deposit || '0')
    if (isNaN(p) || isNaN(dp)) { setError('Indique o preço e o sinal em euros.'); return }
    const { error } = await supabase.rpc('propose_package', {
      p_request: req.id, p_price: p, p_deposit: dp, p_note: note || null, p_professional: pro,
      p_trial_at: pkg?.includes_trial && trialDate ? zonedToUtc(trialDate, trialTime, tz).toISOString() : null, p_trial_min: pkg?.includes_trial && trialDate ? Number(trialMin) : null,
      p_event_at: zonedToUtc(req.event_date, eventTime, tz).toISOString(), p_event_min: Number(eventMin), p_valid_until: valid || null,
    })
    if (error) { setError(error.message.includes('datas_invalidas') ? 'Confirme as horas e durações (mínimo 15 minutos).' : error.message.includes('valores_invalidos') ? 'O sinal não pode ser maior que o preço.' : 'Não foi possível guardar.'); return }
    setSent(true); onDone()
  }
  const link = `${location.origin}/pedido/${req.id}`
  if (sent) return (
    <div className="next-visit"><b>Proposta guardada</b>
      <div className="actions"><a className="wa" href={waLink(req.client_phone, `Olá ${req.client_name.split(' ')[0]}! Aqui está a proposta do ${salon.name} para ${pkg?.name ?? 'o seu evento'}: ${link}`)} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />Enviar por WhatsApp</a></div>
    </div>
  )
  return (
    <form className="next-visit" onSubmit={send}>
      <b>Proposta</b>
      <div className="row"><label style={{ flex: 1 }}>Preço (€)<input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></label>
        <label style={{ flex: 1 }}>Sinal (€)<input inputMode="decimal" value={deposit} onChange={e => setDeposit(e.target.value)} /></label></div>
      <label>Quem faz<select value={pro} onChange={e => setPro(e.target.value)}>{pros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {pkg?.includes_trial && <div className="row">
        <label style={{ flex: 2 }}>Prova<input type="date" value={trialDate} max={req.event_date} min={dateInTz(new Date(), tz)} onChange={e => setTrialDate(e.target.value)} /></label>
        <label style={{ flex: 1 }}>Hora<input type="time" value={trialTime} onChange={e => setTrialTime(e.target.value)} /></label>
        <label style={{ flex: 1 }}>Min<input inputMode="numeric" value={trialMin} onChange={e => setTrialMin(e.target.value.replace(/\D/g, ''))} /></label>
      </div>}
      <div className="row">
        <label style={{ flex: 2 }}>No dia ({new Date(req.event_date + 'T12:00:00Z').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', timeZone: 'UTC' })}), começa às<input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} /></label>
        <label style={{ flex: 1 }}>Duração (min)<input inputMode="numeric" value={eventMin} onChange={e => setEventMin(e.target.value.replace(/\D/g, ''))} /></label>
      </div>
      <label>Mensagem <span className="muted">(opcional)</span><textarea rows={2} value={note} maxLength={600} onChange={e => setNote(e.target.value)} placeholder="Ex.: inclui deslocação à quinta e retoques até à cerimónia." /></label>
      <label>Válida até<input type="date" value={valid} onChange={e => setValid(e.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <button className="btn">Guardar proposta</button>
      <p className="muted small">Quando o cliente aceitar, a prova e o dia entram na agenda.</p>
    </form>
  )
}

/** Mais > Pacotes (migration 0022): combos, events by proposal and prepaid packs. */
export default function PackagesPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [tab, setTab] = useState<'pacotes' | 'pedidos' | 'packs'>('pacotes')
  const [pkgs, setPkgs] = useState<Package[]>([])
  const [items, setItems] = useState<PackageItem[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [pros, setPros] = useState<{ id: string; name: string }[]>([])
  const [reqs, setReqs] = useState<Req[]>([])
  const [packs, setPacks] = useState<ClientPack[]>([])
  const [missing, setMissing] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => { setRole(r.role); setSalon(r.salon) })
  }, [session])

  const load = useCallback(async () => {
    if (!salon) return
    const [pk, sv, pr, rq, cp] = await Promise.all([
      supabase.from('packages').select('*').eq('salon_id', salon.id).order('position'),
      supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', salon.id).eq('active', true).order('name'),
      supabase.from('professionals').select('id,name').eq('salon_id', salon.id).eq('active', true).order('name'),
      supabase.from('package_requests').select('*').eq('salon_id', salon.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('client_packs').select('*').eq('salon_id', salon.id).order('created_at', { ascending: false }).limit(200),
    ])
    setMissing(Boolean(pk.error))
    const list = (pk.data ?? []) as Package[]
    setPkgs(list); setServices(sv.data ?? []); setPros(pr.data ?? []); setReqs((rq.data ?? []) as Req[]); setPacks((cp.data ?? []) as ClientPack[])
    if (list.length) {
      const [it, ph] = await Promise.all([
        supabase.from('package_items').select('*').in('package_id', list.map(x => x.id)).order('position'),
        supabase.from('salon_photos').select('id,path,caption,position,package_id').in('package_id', list.map(x => x.id)),
      ])
      setItems((it.data ?? []) as PackageItem[]); setPhotos((ph.data ?? []) as Photo[])
    }
  }, [salon])
  useEffect(() => { load() }, [load])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (!can(role, 'clientes')) return <Navigate to="/painel" replace />

  const manager = can(role, 'pacotes')
  const svcMap = Object.fromEntries(services.map(s => [s.id, s]))
  const pkgName = (id: string) => pkgs.find(p => p.id === id)?.name ?? 'Pacote'

  function edit(p: Package) {
    const its = items.filter(i => i.package_id === p.id)
    setForm({
      id: p.id, mode: p.mode, name: p.name, description: p.description, price: c2t(p.price_cents), perGuest: c2t(p.per_guest_cents),
      maxGuests: p.max_guests?.toString() ?? '', trial: p.includes_trial, extraHour: c2t(p.extra_hour_cents), depositPct: p.deposit_pct?.toString() ?? '',
      sessions: p.sessions?.toString() ?? '', validDays: p.valid_days?.toString() ?? '', active: p.active, image: p.image_path,
      included: its.filter(i => !i.optional).map(i => i.service_id), extras: its.filter(i => i.optional).map(i => ({ service_id: i.service_id, price: c2t(i.extra_price_cents) })),
    }); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const f = form!
    const price = parseEuros(f.price)
    if (!f.name.trim()) { setError('Dê um nome ao pacote.'); return }
    if (isNaN(price)) { setError('Indique o preço em euros.'); return }
    if (f.included.length === 0) { setError(f.mode === 'pack' ? 'Escolha o serviço do pack.' : 'Escolha pelo menos um serviço incluído.'); return }
    const opt = (v: string) => v.trim() === '' ? null : parseEuros(v)
    const row = {
      salon_id: salon!.id, mode: f.mode, name: f.name.trim(), description: f.description.trim(), price_cents: price, active: f.active, image_path: f.image,
      per_guest_cents: f.mode === 'evento' ? opt(f.perGuest) : null, max_guests: f.mode === 'evento' && f.maxGuests ? Number(f.maxGuests) : null,
      includes_trial: f.mode === 'evento' && f.trial, extra_hour_cents: f.mode === 'evento' ? opt(f.extraHour) : null,
      deposit_pct: f.mode === 'evento' && f.depositPct ? Number(f.depositPct) : null,
      sessions: f.mode === 'pack' ? Number(f.sessions) : null, valid_days: f.mode === 'pack' && f.validDays ? Number(f.validDays) : null,
    }
    setBusy('guardar')
    const r = f.id ? await supabase.from('packages').update(row).eq('id', f.id).select('id').single() : await supabase.from('packages').insert({ ...row, position: pkgs.length }).select('id').single()
    if (r.error || !r.data) { setBusy(''); setError('Não foi possível guardar. Confirme os valores (ex.: sessões de 2 a 50).'); return }
    const pid = r.data.id
    await supabase.from('package_items').delete().eq('package_id', pid)
    const rows = [
      ...f.included.map((s, i) => ({ package_id: pid, service_id: s, optional: false, extra_price_cents: null, position: i })),
      ...(f.mode === 'pack' ? [] : f.extras.map((x, i) => ({ package_id: pid, service_id: x.service_id, optional: true, extra_price_cents: x.price.trim() ? parseEuros(x.price) : null, position: 100 + i }))),
    ]
    const ins = rows.length ? await supabase.from('package_items').insert(rows) : { error: null }
    setBusy('')
    if (ins.error) { setError('O pacote ficou guardado, mas os serviços não. Tente de novo.'); return }
    setForm(null); load()
  }

  async function addPhotos(pid: string, files: FileList | null) {
    if (!files?.length) return
    setBusy(`fotos-${pid}`)
    for (const file of Array.from(files).slice(0, 6)) {
      try {
        const path = await uploadMedia(salon!.id, file, 'galeria')
        const { error } = await supabase.from('salon_photos').insert({ salon_id: salon!.id, path, package_id: pid, position: 100 })
        if (error) break
      } catch { break }
    }
    setBusy(''); load()
  }
  async function pickCover(file: File | undefined) {
    if (!file || !form) return
    setBusy('capa')
    try { const path = await uploadMedia(salon!.id, file, 'galeria'); setForm(f => f && { ...f, image: path }) } catch { setError('Não foi possível enviar a imagem.') }
    setBusy('')
  }
  async function packStatus(c: ClientPack, status: string) {
    const valid = pkgs.find(p => p.id === c.package_id)?.valid_days
    const patch = status === 'ativo' ? { status, paid_at: new Date().toISOString(), expires_on: valid ? new Date(Date.now() + valid * 86400000).toISOString().slice(0, 10) : null } : { status }
    const { error } = await supabase.from('client_packs').update(patch).eq('id', c.id)
    if (!error) load()
  }
  async function cancelReq(r: Req) {
    const { error } = await supabase.from('package_requests').update({ status: 'cancelado' }).eq('id', r.id)
    if (!error) load()
  }

  const f = form
  const totals = f && f.mode === 'combo' ? comboTotals({ price_cents: parseEuros(f.price) || 0 }, [
    ...f.included.map((s, i) => ({ id: `i${i}`, package_id: '', service_id: s, optional: false, extra_price_cents: null, position: i })),
  ], svcMap, []) : null
  const newReqs = reqs.filter(r => r.status === 'pedido').length
  const newPacks = packs.filter(p => p.status === 'pedido').length

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page">
      <header className="row"><h1>Pacotes</h1><Link to="/mais">‹ Mais</Link></header>
      {missing ? <p className="banner">Para usar pacotes, corra <code>supabase/migrations/0022_business_home_packages.sql</code> no editor SQL do Supabase.</p> : <>
        <div className="seg">
          <button className={tab === 'pacotes' ? 'on' : ''} onClick={() => setTab('pacotes')}>Pacotes</button>
          <button className={tab === 'pedidos' ? 'on' : ''} onClick={() => setTab('pedidos')}>Pedidos{newReqs ? ` (${newReqs})` : ''}</button>
          <button className={tab === 'packs' ? 'on' : ''} onClick={() => setTab('packs')}>Packs vendidos{newPacks ? ` (${newPacks})` : ''}</button>
        </div>

        {tab === 'pacotes' && <>
          {manager && !f && (
            <div className="actions">{MODES.map(m => <button key={m.id} onClick={() => { setForm(blank(m.id)); setError('') }}><Icon name="plus" size={16} />{m.label}</button>)}</div>
          )}
          {f && (
            <form className="card editor" onSubmit={save}>
              <div className="row"><strong>{MODES.find(m => m.id === f.mode)!.label}</strong><button type="button" className="link" onClick={() => setForm(null)}>Fechar</button></div>
              <p className="muted small" style={{ margin: 0 }}>{MODES.find(m => m.id === f.mode)!.hint}</p>
              <label>Nome<input value={f.name} maxLength={80} placeholder={f.mode === 'evento' ? 'Ex.: Noiva' : f.mode === 'pack' ? 'Ex.: 6 sessões de laser' : 'Ex.: Dia do noivo'} onChange={e => setForm({ ...f, name: e.target.value })} /></label>
              <label>Descrição<textarea rows={3} maxLength={800} value={f.description} onChange={e => setForm({ ...f, description: e.target.value })} /></label>
              <fieldset className="chips-set"><legend>{f.mode === 'pack' ? 'Serviço do pack' : 'Serviços incluídos'}</legend>
                {services.map(s => (
                  <label key={s.id} className="check"><input type={f.mode === 'pack' ? 'radio' : 'checkbox'} name="incl" checked={f.included.includes(s.id)}
                    onChange={e => setForm({ ...f, included: f.mode === 'pack' ? [s.id] : e.target.checked ? [...f.included, s.id] : f.included.filter(x => x !== s.id) })} />{s.name} · {euros(s.price_cents)}</label>
                ))}
              </fieldset>
              <div className="row">
                <label style={{ flex: 1 }}>{f.mode === 'evento' ? 'Preço (pessoa principal)' : f.mode === 'pack' ? 'Preço do pack' : 'Preço do pacote'} (€)<input inputMode="decimal" value={f.price} onChange={e => setForm({ ...f, price: e.target.value })} /></label>
                {f.mode === 'pack' && <label style={{ flex: 1 }}>Sessões<input inputMode="numeric" value={f.sessions} onChange={e => setForm({ ...f, sessions: e.target.value.replace(/\D/g, '') })} /></label>}
              </div>
              {totals && totals.saving > 0 && <p className="ok small" style={{ margin: 0 }}>Sozinhos custariam {euros(totals.saving + (parseEuros(f.price) || 0))}: o cliente poupa {euros(totals.saving)} · {totals.minutes} min.</p>}
              {f.mode === 'pack' && f.included[0] && Number(f.sessions) > 0 && <p className="small muted" style={{ margin: 0 }}>Sozinhas: {euros(svcMap[f.included[0]].price_cents * Number(f.sessions))}.</p>}
              {f.mode === 'pack' && <label>Validade (dias depois de pago)<input inputMode="numeric" value={f.validDays} onChange={e => setForm({ ...f, validDays: e.target.value.replace(/\D/g, '') })} /></label>}
              {f.mode === 'evento' && <>
                <div className="row">
                  <label style={{ flex: 1 }}>Por acompanhante (€)<input inputMode="decimal" value={f.perGuest} onChange={e => setForm({ ...f, perGuest: e.target.value })} /></label>
                  <label style={{ flex: 1 }}>Máx. acompanhantes<input inputMode="numeric" value={f.maxGuests} onChange={e => setForm({ ...f, maxGuests: e.target.value.replace(/\D/g, '') })} /></label>
                </div>
                <div className="row">
                  <label style={{ flex: 1 }}>Sinal (%)<input inputMode="numeric" value={f.depositPct} onChange={e => setForm({ ...f, depositPct: e.target.value.replace(/\D/g, '') })} /></label>
                  <label style={{ flex: 1 }}>Hora de espera (€)<input inputMode="decimal" value={f.extraHour} placeholder="opcional" onChange={e => setForm({ ...f, extraHour: e.target.value })} /></label>
                </div>
                <label className="check"><input type="checkbox" checked={f.trial} onChange={e => setForm({ ...f, trial: e.target.checked })} />Inclui uma prova antes do dia</label>
              </>}
              {f.mode !== 'pack' && <fieldset className="chips-set"><legend>Extras que o cliente pode juntar</legend>
                {services.filter(s => !f.included.includes(s.id)).map(s => {
                  const x = f.extras.find(e => e.service_id === s.id)
                  return (
                    <div key={s.id} className="row">
                      <label className="check" style={{ flex: 2 }}><input type="checkbox" checked={Boolean(x)} onChange={e => setForm({ ...f, extras: e.target.checked ? [...f.extras, { service_id: s.id, price: '' }] : f.extras.filter(y => y.service_id !== s.id) })} />{s.name}</label>
                      {x && <input aria-label={`Preço de ${s.name} como extra`} style={{ flex: 1 }} inputMode="decimal" placeholder={c2t(s.price_cents)} value={x.price} onChange={e => setForm({ ...f, extras: f.extras.map(y => y.service_id === s.id ? { ...y, price: e.target.value } : y) })} />}
                    </div>
                  )
                })}
              </fieldset>}
              <div>
                {f.image && <img className="brand-preview cover" src={mediaUrl(f.image)!} alt="" />}
                <label className="btn ghost inline sm" style={{ cursor: 'pointer' }}><Icon name="camera" size={16} />{busy === 'capa' ? 'A enviar…' : f.image ? 'Trocar foto de capa' : 'Foto de capa'}
                  <input type="file" accept="image/*" hidden onChange={e => { pickCover(e.target.files?.[0]); e.target.value = '' }} /></label>
              </div>
              <label className="check"><input type="checkbox" checked={f.active} onChange={e => setForm({ ...f, active: e.target.checked })} />Mostrar na página de marcação</label>
              {error && <p className="error" role="alert">{error}</p>}
              <button className="btn" disabled={busy === 'guardar'}>{busy === 'guardar' ? 'A guardar…' : 'Guardar pacote'}</button>
            </form>
          )}
          {pkgs.length === 0 && !f && <p className="muted">Ainda sem pacotes. Um combo ("Dia do noivo"), um evento ("Noiva") ou um pack ("5 cortes") são boas formas de começar.</p>}
          {pkgs.map(p => {
            const its = items.filter(i => i.package_id === p.id)
            const ph = photos.filter(x => x.package_id === p.id)
            return (
              <article key={p.id} className={p.active ? 'card' : 'card off'}>
                <div className="row"><span><b>{p.name}</b><br /><small className="muted">{MODES.find(m => m.id === p.mode)!.label} · {priceLabel(p, euros)}</small></span>{!p.active && <span className="tag warn">Escondido</span>}</div>
                <p className="small muted" style={{ margin: '4px 0' }}>{its.filter(i => !i.optional).map(i => svcMap[i.service_id]?.name).filter(Boolean).join(' + ')}{its.some(i => i.optional) ? ` · ${its.filter(i => i.optional).length} extras` : ''}</p>
                {ph.length > 0 && <div className="gallery-strip">{ph.map(x => <img key={x.id} src={mediaUrl(x.path)!} alt="" style={{ width: 80, height: 100, objectFit: 'cover', borderRadius: 8 }} />)}</div>}
                <div className="actions">
                  {manager && <button className="link" onClick={() => edit(p)}>Editar</button>}
                  {manager && <label className="link" style={{ cursor: 'pointer' }}>{busy === `fotos-${p.id}` ? 'A enviar…' : 'Juntar fotos de trabalhos'}<input type="file" accept="image/*" multiple hidden onChange={e => { addPhotos(p.id, e.target.files); e.target.value = '' }} /></label>}
                  <button onClick={() => navigator.clipboard?.writeText(`${location.origin}/s/${salon.slug}/pacote/${p.id}`)}>Copiar link</button>
                </div>
              </article>
            )
          })}
          <p className="muted small">Para publicitar um pacote, crie uma promoção ou um post no <Link to="/promocoes">Social Media Manager</Link> com o link dele.</p>
        </>}

        {tab === 'pedidos' && <>
          {reqs.length === 0 && <p className="muted">Ainda sem pedidos. Aparecem aqui quando um cliente pede um pacote de evento.</p>}
          {reqs.map(r => (
            <article key={r.id} className={r.status === 'pedido' ? 'card warn' : 'card'}>
              <div className="row"><span><b>{r.client_name}</b> · {pkgName(r.package_id)}<br /><small className="muted">{new Date(r.event_date + 'T12:00:00Z').toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}{r.event_time ? `, ${r.event_time.slice(0, 5)}` : ''} · {1 + r.guests} {r.guests ? 'pessoas' : 'pessoa'} · {r.place === 'local' ? `no local${r.address ? `: ${r.address}` : ''}` : 'no salão'}</small></span>
                <span className="tag">{STATUS[r.status]}</span></div>
              <p className="small" style={{ margin: '6px 0' }}>Estimativa {euros(r.estimate_cents)}{r.proposal_cents != null ? ` · proposta ${euros(r.proposal_cents)}` : ''}{r.extras.length ? ` · extras: ${r.extras.map(x => svcMap[items.find(i => i.id === x)?.service_id ?? '']?.name).filter(Boolean).join(', ')}` : ''}</p>
              {r.message && <p className="small muted">"{r.message}"</p>}
              <div className="actions">
                <a className="wa" href={waLink(r.client_phone, `Olá ${r.client_name.split(' ')[0]}! Recebemos o seu pedido para ${pkgName(r.package_id)}.`)} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />{formatPhone(r.client_phone)}</a>
                {(r.status === 'pedido' || r.status === 'proposta') && <button className="btn-inline" onClick={() => setOpen(open === r.id ? null : r.id)}>{r.status === 'pedido' ? 'Fazer proposta' : 'Alterar proposta'}</button>}
                {(r.status === 'pedido' || r.status === 'proposta') && <button className="link danger-link" onClick={() => cancelReq(r)}>Cancelar</button>}
                <a className="link" href={`/pedido/${r.id}`} target="_blank" rel="noreferrer">Ver como cliente</a>
              </div>
              {open === r.id && <Proposal salon={salon} req={r} pkg={pkgs.find(p => p.id === r.package_id)} pros={pros} onDone={load} />}
            </article>
          ))}
        </>}

        {tab === 'packs' && <>
          {packs.length === 0 && <p className="muted">Ainda sem packs vendidos.</p>}
          {packs.map(c => (
            <article key={c.id} className={c.status === 'pedido' ? 'card warn' : c.status === 'ativo' ? 'card' : 'card off'}>
              <div className="row"><span><b>{c.client_name}</b> · {pkgName(c.package_id)}<br /><small className="muted">{formatPhone(c.client_phone)} · {euros(c.price_cents)}{c.expires_on ? ` · válido até ${new Date(c.expires_on + 'T12:00:00Z').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}` : ''}</small></span>
                <span className="tag">{c.status === 'pedido' ? 'Por pagar' : c.status === 'ativo' ? `${c.sessions_total - c.sessions_used} de ${c.sessions_total}` : c.status === 'terminado' ? 'Terminado' : 'Cancelado'}</span></div>
              <div className="actions">
                {c.status === 'pedido' && <button className="btn-inline" onClick={() => packStatus(c, 'ativo')}>Pagamento recebido: ativar</button>}
                {(c.status === 'pedido' || c.status === 'ativo') && <button className="link danger-link" onClick={() => packStatus(c, 'cancelado')}>Cancelar</button>}
              </div>
            </article>
          ))}
          <p className="muted small">Na agenda, uma visita de quem tem um pack ativo mostra "Usar sessão do pack".</p>
        </>}
      </>}
    </main></div>
  )
}
