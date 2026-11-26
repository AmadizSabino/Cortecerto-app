import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { WhatsAppIcon } from '../components/Icon'
import { euros, supabase, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import { parseEuros } from '../lib/onboarding'
import { benefitList, DEFAULT_CLUB, memberState, monthlyRevenue, renewedUntil, type Club, type Member } from '../lib/club'
import { dateInTz } from '../lib/time'
import { themeById, themeStyle } from '../lib/themes'
import { formatPhone, waLink, waNumber } from '../lib/whatsapp'
import HelpLink from '../HelpLink'
import { publicOrigin } from '../lib/publicOrigin'

const STATE_LABEL = { pedido: 'Quer aderir', em_dia: 'Em dia', por_pagar: 'Mensalidade por pagar', cancelado: 'Cancelado' }

/** The Club: settings (managers) and members (from Receção up). */
export default function ClubPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [club, setClub] = useState<Club | null>(null)
  const [form, setForm] = useState({ active: false, name: '', price: '', benefits: '', no_deposit: true })
  const [members, setMembers] = useState<Member[]>([])
  const [missing, setMissing] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [add, setAdd] = useState({ name: '', phone: '', method: 'balcao' as Member['pay_method'] })
  const [addMsg, setAddMsg] = useState('')
  const [showOld, setShowOld] = useState(false)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => { setRole(r.role); setSalon(r.salon) })
  }, [session])

  const load = useCallback(async () => {
    if (!salon) return
    const [c, m] = await Promise.all([
      supabase.from('salon_club').select('*').eq('salon_id', salon.id).maybeSingle(),
      supabase.from('club_members').select('*').eq('salon_id', salon.id).order('created_at', { ascending: false }),
    ])
    setMissing(Boolean(c.error))
    const cl = (c.data as Club | null) ?? DEFAULT_CLUB(salon.id, salon.name)
    setClub(cl)
    setForm({ active: cl.active, name: cl.name, price: (cl.price_cents / 100).toFixed(2).replace('.', ','), benefits: cl.benefits, no_deposit: cl.no_deposit })
    setMembers((m.data ?? []) as Member[])
  }, [salon])
  useEffect(() => { load() }, [load])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (!can(role, 'clube')) return <Navigate to="/painel" replace />

  const tz = salon.timezone
  const today = dateInTz(new Date(), tz)
  const manager = can(role, 'clubeDefinicoes')
  const joinLink = `${publicOrigin()}/s/${salon.slug}?clube=1`
  const open = members.filter(m => m.status !== 'cancelado')
  const old = members.filter(m => m.status === 'cancelado')
  const fmt = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', timeZone: 'UTC' })

  async function saveClub(e: React.FormEvent) {
    e.preventDefault(); setMsg(undefined)
    const price = parseEuros(form.price)
    if (!form.name.trim()) { setMsg({ ok: false, text: 'Dê um nome ao Clube.' }); return }
    if (isNaN(price) || (form.active && price <= 0)) { setMsg({ ok: false, text: 'Indique o preço por mês.' }); return }
    const { error } = await supabase.from('salon_club').upsert({
      salon_id: salon!.id, active: form.active, name: form.name.trim(), price_cents: price,
      benefits: form.benefits.trim(), no_deposit: form.no_deposit, updated_at: new Date().toISOString(),
    })
    setMsg(error ? { ok: false, text: 'Não foi possível guardar.' } : { ok: true, text: form.active ? 'Guardado. O Clube aparece na sua página de marcação.' : 'Guardado. O Clube está desligado.' })
    if (!error) load()
  }

  async function patch(m: Member, p: Partial<Member>) {
    const { data, error } = await supabase.from('club_members').update(p).eq('id', m.id).select('*').single()
    if (!error && data) setMembers(ms => ms.map(x => x.id === m.id ? data as Member : x))
  }
  const activate = (m: Member) => patch(m, { status: 'ativo', started_at: m.started_at ?? new Date().toISOString(), paid_until: renewedUntil(null, today) })
  const renew = (m: Member) => patch(m, { paid_until: renewedUntil(m.paid_until, today) })
  const cancel = (m: Member) => patch(m, { status: 'cancelado', cancelled_at: new Date().toISOString() })

  async function addMember(e: React.FormEvent) {
    e.preventDefault(); setAddMsg('')
    const key = waNumber(add.phone)
    if (!add.name.trim() || key.length < 11) { setAddMsg('Indique o nome e um telemóvel válido.'); return }
    const { error } = await supabase.from('club_members').insert({
      salon_id: salon!.id, phone_key: key, name: add.name.trim(), phone: add.phone.trim(), pay_method: add.method,
      price_cents: club?.price_cents ?? 0, status: 'ativo', started_at: new Date().toISOString(), paid_until: renewedUntil(null, today),
    })
    if (error) { setAddMsg(error.message.includes('club_members_open') ? 'Essa pessoa já é membro.' : 'Não foi possível juntar.'); return }
    setAdd({ name: '', phone: '', method: 'balcao' }); load()
  }

  const payMsg = (m: Member) => `Olá ${m.name.split(' ')[0]}! A mensalidade do ${club?.name ?? 'Clube'} (${euros(m.price_cents)}) ${memberState(m, today) === 'por_pagar' ? 'está por pagar' : 'renova em breve'}.${salon!.mbway_number ? ` Pode enviar por MB Way para ${salon!.mbway_number}.` : ''} Obrigado!`
  const inviteMsg = `Olá! O ${salon.name} tem o ${club?.name ?? 'Clube'}: ${euros(club?.price_cents ?? 0)} por mês${benefitList(club?.benefits ?? '').length ? ` com ${benefitList(club!.benefits).join(', ')}` : ''}. Para aderir: ${joinLink}`

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page">
      <header className="row"><h1>Clube<HelpLink /></h1><Link to="/mais">‹ Mais</Link></header>
      {missing ? <p className="banner">Para usar o Clube, corra <code>supabase/migrations/0018_team_clients_club_ai.sql</code> no editor SQL do Supabase.</p> : <>
        <p className="muted">Uma mensalidade fixa: o cliente paga todos os meses diretamente ao salão (MB Way ou no balcão) e tem os benefícios que definir.</p>
        <div className="stats">
          <div className="stat"><b>{members.filter(m => m.status === 'ativo').length}</b><span>Membros</span></div>
          <div className="stat"><b>{euros(monthlyRevenue(members)).replace(',00', '')}</b><span>Receita por mês</span></div>
          <div className="stat"><b>{members.filter(m => m.status === 'pedido').length}</b><span>Pedidos</span></div>
        </div>

        {manager ? (
          <form className="card" onSubmit={saveClub}>
            <strong>O seu Clube</strong>
            <label className="check"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />Mostrar o Clube na página de marcação</label>
            <label>Nome<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label>Preço por mês (€)<input inputMode="decimal" value={form.price} placeholder="35,00" onChange={e => setForm({ ...form, price: e.target.value })} /></label>
            <label><span>Benefícios <span className="muted">(um por linha)</span></span><textarea rows={3} value={form.benefits} placeholder={'Cortes ilimitados\n10% nos produtos'} onChange={e => setForm({ ...form, benefits: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={form.no_deposit} onChange={e => setForm({ ...form, no_deposit: e.target.checked })} />Membros com a mensalidade em dia marcam sem sinal</label>
            <p className="muted small">O preço é seu. Como referência: um cliente que vem a cada 3 semanas gasta cerca de 1,4 serviços por mês.</p>
            {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
            <button className="btn">Guardar</button>
          </form>
        ) : club && (
          <div className="card soft"><b>{club.name}</b> · {euros(club.price_cents)}/mês{club.active ? '' : ' · desligado'}<br /><small className="muted">{benefitList(club.benefits).join(' · ')}</small></div>
        )}

        {club?.active && <div className="actions"><a className="wa" href={waLink('', inviteMsg)} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />Convidar para o Clube</a></div>}

        <h2>Membros</h2>
        {open.length === 0 && <p className="muted">Ainda sem membros.</p>}
        {open.map(m => {
          const st = memberState(m, today)
          return (
            <div key={m.id} className="card">
              <div className="row">
                <span><b>{m.name}</b><br /><small className="muted">{formatPhone(m.phone)} · {m.pay_method === 'mbway' ? 'MB Way' : 'Balcão'} · {euros(m.price_cents)}/mês</small></span>
                <span className={`tag ${st === 'em_dia' ? '' : 'warn'}`}>{STATE_LABEL[st]}</span>
              </div>
              <p className="small muted" style={{ margin: '6px 0' }}>
                {m.started_at && <>Membro desde {fmt(m.started_at.slice(0, 10))}</>}
                {m.paid_until && <> · pago até {fmt(m.paid_until)}</>}
                {st === 'pedido' && <>Pediu para aderir em {fmt(m.created_at.slice(0, 10))}. Ative quando receber o primeiro pagamento.</>}
              </p>
              <div className="actions">
                {st === 'pedido' && <button className="btn-inline" onClick={() => activate(m)}>Pagamento recebido: ativar</button>}
                {(st === 'em_dia' || st === 'por_pagar') && <button className="btn-inline" onClick={() => renew(m)}>Pagou mais um mês</button>}
                <a className="wa" href={waLink(m.phone, st === 'pedido' ? `Olá ${m.name.split(' ')[0]}! Obrigado por aderir ao ${club?.name}. ${salon.mbway_number ? `Pode enviar a primeira mensalidade (${euros(m.price_cents)}) por MB Way para ${salon.mbway_number}.` : 'Pode pagar a primeira mensalidade na próxima visita.'}` : payMsg(m))} target="_blank" rel="noreferrer">WhatsApp</a>
                <button className="link danger-link" onClick={() => cancel(m)}>Cancelar</button>
              </div>
            </div>
          )
        })}

        <form className="card" onSubmit={addMember}>
          <strong>Juntar um cliente</strong>
          <p className="muted small" style={{ margin: 0 }}>Para quem paga no balcão ou já pagou. Fica ativo por um mês a partir de hoje.</p>
          <label>Nome<input value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} /></label>
          <label>Telemóvel<input inputMode="tel" value={add.phone} onChange={e => setAdd({ ...add, phone: e.target.value })} placeholder="912 345 678" /></label>
          <label>Paga por
            <select value={add.method} onChange={e => setAdd({ ...add, method: e.target.value as Member['pay_method'] })}>
              <option value="balcao">Balcão</option><option value="mbway">MB Way</option>
            </select>
          </label>
          {addMsg && <p className="error">{addMsg}</p>}
          <button>Juntar ao Clube</button>
        </form>

        {old.length > 0 && <p><button className="link" onClick={() => setShowOld(!showOld)}>{showOld ? 'Esconder' : 'Ver'} antigos membros ({old.length})</button></p>}
        {showOld && old.map(m => (
          <div key={m.id} className="card row"><span>{m.name}<br /><small className="muted">Cancelado {m.cancelled_at ? fmt(m.cancelled_at.slice(0, 10)) : ''}</small></span></div>
        ))}
      </>}
    </main></div>
  )
}
