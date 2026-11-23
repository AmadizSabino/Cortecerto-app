import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase } from '../lib/supabase'
import { billingState, lockState, type BillingFields } from '../lib/billing'
import { addDaysIso, BUCKET, DUE_DAYS, invoicePath, listInvoices, openInvoice, parseAmount, type Invoice } from '../lib/invoices'
import { PLAN } from '../lib/plan'
import { health, since, HEALTH_LABEL, HEALTH_TAG, type AdminSalonRow, type Dashboard } from '../lib/adminStats'
import { AdminOverview, AdminSystem, SalonFacts } from './admin/AdminDashboard'
import { AdminMoney, MarkPaid } from './admin/AdminMoney'
import { AuditLog, BillingDetails, DemoAndHeard, SalonNotes } from './admin/SalonExtras'
import { AdminProspects } from './admin/Prospects'
import { AdminSecurity, MfaPrompt } from './admin/AdminSecurity'
import { AdminSite } from './admin/AdminSite'
import { AdminOps } from './admin/AdminOps'
import { DocTags } from './admin/Documents'
import { docDetail, documentRows } from '../lib/money'

interface AdminSalon extends BillingFields { id: string; name: string; slug: string; type: string; created_at: string; is_demo?: boolean; heard_from?: string | null; heard_detail?: string | null }

const STATUS: Record<NonNullable<BillingFields['subscription']>, string> = {
  experimental: 'Período grátis', ativa: 'Ativa', em_atraso: 'Em atraso', cancelada: 'Cancelada',
}
const KIND_LABEL: Record<string, string> = {
  sem_dados: 'Sem dados', experimental: 'Grátis', ativa: 'Ativa', terminou: 'Grátis terminou', em_atraso: 'Em atraso', cancelada: 'Cancelada',
}
const dateOnly = (iso?: string | null) => iso ? iso.slice(0, 10) : ''
const endOfDay = (d: string) => d ? new Date(d + 'T23:59:59').toISOString() : null
const withVat = (Math.round(PLAN.priceCents * (1 + PLAN.vatRate)) / 100).toFixed(2).replace('.', ',')
type Tab = 'resumo' | 'dinheiro' | 'site' | 'contactos' | 'saloes' | 'sistema'
type Filter = 'todos' | 'gratis' | 'ativos' | 'por_pagar' | 'risco'
const FILTERS: [Filter, string][] = [['todos', 'Todos'], ['gratis', 'Grátis'], ['ativos', 'Ativos'], ['por_pagar', 'Por pagar'], ['risco', 'Em risco']]
const thisMonth = () => new Date().toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })

/** CorteCerto's own admin area: every salon's plan, and its invoices. */
export default function AdminPage() {
  const [session, setSession] = useState<Session | null>()
  const [admin, setAdmin] = useState<boolean>()
  const [needCode, setNeedCode] = useState(false)
  const [salons, setSalons] = useState<AdminSalon[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [dash, setDash] = useState<Dashboard | null>()
  const [tab, setTab] = useState<Tab>('resumo')
  const [filter, setFilter] = useState<Filter>('todos')
  const [sort, setSort] = useState<'recentes' | 'marcacoes' | 'login' | 'saude'>('recentes')

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  async function load() {
    const cols = 'id,name,slug,type,created_at,subscription,trial_ends_at,paid_until'
    // is_demo and heard_from come with migration 0028; before it, the list loads without them.
    const full = await supabase.from('salons').select(`${cols},is_demo,heard_from,heard_detail`).order('created_at', { ascending: false })
    const data = full.error ? (await supabase.from('salons').select(cols).order('created_at', { ascending: false })).data : full.data
    setSalons((data ?? []) as AdminSalon[])
    // admin_dashboard() comes with migration 0024; without it the list still works.
    const d = await supabase.rpc('admin_dashboard')
    setDash(d.error ? null : d.data as Dashboard)
  }
  async function checkAdmin() {
    // With an authenticator app set up, the code comes first: the database only counts admin sessions that used it.
    const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(r => r.data, () => null)
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') { setNeedCode(true); setAdmin(false); return }
    setNeedCode(false)
    const { data, error } = await supabase.rpc('is_platform_admin')
    setAdmin(!error && data === true)
    if (!error && data === true) load()
  }
  useEffect(() => { if (session) checkAdmin() }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined || (session && admin === undefined)) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (needCode) return <MfaPrompt onDone={checkAdmin} />
  if (!admin) return <main className="page"><h1>Sem acesso</h1><p className="muted">Esta área é só para a equipa CorteCerto.</p></main>

  const demoIds = new Set(salons.filter(s => s.is_demo).map(s => s.id))
  const rows = new Map<string, AdminSalonRow>((dash?.salons ?? []).map(r => [r.id, r]))
  const counts = salons.reduce<Record<string, number>>((c, s) => { const k = billingState(s).kind; c[k] = (c[k] ?? 0) + 1; return c }, {})
  const matches = (s: AdminSalon) => {
    const k = billingState(s).kind, r = rows.get(s.id)
    if (filter === 'gratis') return k === 'experimental'
    if (filter === 'ativos') return k === 'ativa'
    if (filter === 'por_pagar') return k === 'terminou' || k === 'em_atraso' || lockState(s).locked
    if (filter === 'risco') return !!r && ['risco', 'atencao'].includes(health(r).level)
    return true
  }
  const time = (iso?: string | null) => iso ? new Date(iso).getTime() : 0
  const shown = salons
    .filter(s => (!q || `${s.name} ${s.slug} ${rows.get(s.id)?.owner_email ?? ''}`.toLowerCase().includes(q.toLowerCase())) && matches(s))
    .sort((a, b) => {
      const ra = rows.get(a.id), rb = rows.get(b.id)
      if (sort === 'marcacoes') return (rb?.bookings_30d ?? 0) - (ra?.bookings_30d ?? 0)
      if (sort === 'login') return time(rb?.last_sign_in_at) - time(ra?.last_sign_in_at)
      if (sort === 'saude') return (ra ? health(ra).score : 0) - (rb ? health(rb).score : 0)
      return time(b.created_at) - time(a.created_at)
    })
  const openSalon = (id: string) => { setTab('saloes'); setFilter('todos'); setQ(''); setOpen(id) }

  return (
    <main className="page wide">
      <header className="row"><h1>Administração</h1><button className="link" onClick={() => supabase.auth.signOut().then(() => location.assign('/painel'))}>Sair</button></header>
      <div className="chips admin-tabs" role="tablist">
        {([['resumo', 'Resumo'], ['dinheiro', 'Dinheiro'], ['site', 'Site'], ['contactos', 'Contactos'], ['saloes', `Salões (${salons.length})`], ['sistema', 'Sistema']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`chip${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {dash === null && <p className="card warn small">O resumo precisa da migração 0024 (supabase/migrations/0024_admin_dashboard.sql). Corra-a no Supabase › SQL Editor. A lista de salões funciona sem ela.</p>}
      {tab === 'resumo' && dash && <AdminOverview data={{ ...dash, salons: dash.salons.filter(r => !demoIds.has(r.id)) }} onOpen={openSalon} />}
      {tab === 'resumo' && dash === null && (
        <div className="stats" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="stat"><b>{salons.length}</b><span>Salões</span></div>
          <div className="stat"><b>{counts.ativa ?? 0}</b><span>Ativos</span></div>
          <div className="stat"><b>{(counts.terminou ?? 0) + (counts.em_atraso ?? 0)}</b><span>Por pagar</span></div>
          <div className="stat"><b>{salons.filter(s => lockState(s).locked).length}</b><span>Bloqueadas</span></div>
        </div>
      )}
      {tab === 'dinheiro' && <AdminMoney salons={salons} onOpen={openSalon} onChanged={load} />}
      {tab === 'site' && <AdminSite onOpen={openSalon} />}
      {tab === 'contactos' && <AdminProspects salons={salons} onOpen={openSalon} />}
      {tab === 'sistema' && <AdminSecurity />}
      {tab === 'sistema' && <AdminOps />}
      {tab === 'sistema' && dash && <AdminSystem data={dash} />}
      {tab === 'sistema' && <AuditLog />}
      {tab === 'saloes' && <>
      <label>Procurar<input type="search" value={q} placeholder="Nome, link ou email do dono" onChange={e => setQ(e.target.value)} /></label>
      <div className="row">
        <div className="chips">
          {FILTERS.map(([k, label]) => <button key={k} className={`chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{label}</button>)}
        </div>
        <label className="sort">Ordenar
          <select value={sort} onChange={e => setSort(e.target.value as typeof sort)}>
            <option value="recentes">Mais recentes</option>
            <option value="marcacoes">Mais marcações</option>
            <option value="login">Último login</option>
            <option value="saude">Saúde (pior primeiro)</option>
          </select>
        </label>
      </div>
      {shown.map(s => {
        const b = billingState(s)
        const locked = lockState(s).locked
        const r = rows.get(s.id)
        const h = r ? health(r) : null
        return (
          <section key={s.id} className="card">
            <button className="client-head" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
              <span><b>{s.name}</b><small className="muted">/s/{s.slug} · {s.created_at && `desde ${new Date(s.created_at).toLocaleDateString('pt-PT')}`}</small>
                {r && <small className="muted">Login {since(r.last_sign_in_at)} · {r.bookings_30d} {r.bookings_30d === 1 ? 'marcação' : 'marcações'} em 30 d{r.bookings_30d > 0 && ` · ${Math.round(100 * r.online_30d / r.bookings_30d)}% online`}</small>}</span>
              <span className="tags">
              {s.is_demo && <span className="tag cancelada">Demo</span>}
              {h && <span className={`tag ${HEALTH_TAG[h.level]}`}>{HEALTH_LABEL[h.level]}</span>}
              <span className={`tag ${b.kind === 'ativa' ? 'concluida' : b.kind === 'em_atraso' || b.kind === 'terminou' ? 'faltou' : 'pendente'}`}>
                {locked ? 'Bloqueada' : KIND_LABEL[b.kind]}{!locked && b.kind === 'experimental' && ` · ${b.daysLeft} d`}
              </span>
              </span>
            </button>
            {open === s.id && r && <SalonFacts s={r} />}
            {open === s.id && <SalonAdmin key={`${s.id}${s.subscription}${s.paid_until}${s.trial_ends_at}${s.is_demo}`} salon={s} onChanged={load} />}
          </section>
        )
      })}
      {shown.length === 0 && <p className="muted">Nenhum salão encontrado.</p>}
      </>}
    </main>
  )
}

function SalonAdmin({ salon, onChanged }: { salon: AdminSalon; onChanged: () => void }) {
  const [plan, setPlan] = useState({ status: salon.subscription ?? 'experimental', paid: dateOnly(salon.paid_until), trial: dateOnly(salon.trial_ends_at) })
  const [planMsg, setPlanMsg] = useState<{ ok: boolean; text: string }>()
  const [invoices, setInvoices] = useState<Invoice[] | null>()
  const [form, setForm] = useState({ number: '', issued: new Date().toISOString().slice(0, 10), due: addDaysIso(new Date().toISOString().slice(0, 10), DUE_DAYS), period: thisMonth(), amount: withVat, request: '' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [invMsg, setInvMsg] = useState<{ ok: boolean; text: string }>()

  const reload = () => listInvoices(salon.id).then(setInvoices)
  const paidRequests = (invoices ?? []).filter(i => i.kind === 'pedido' && i.status === 'paga' && !invoices?.some(x => x.request_id === i.id))
  useEffect(() => { reload() }, [salon.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function savePlan() {
    setPlanMsg(undefined)
    const { error } = await supabase.rpc('admin_set_subscription', {
      p_salon: salon.id, p_status: plan.status, p_paid_until: endOfDay(plan.paid), p_trial_ends_at: endOfDay(plan.trial),
    })
    setPlanMsg(error ? { ok: false, text: 'Não foi possível guardar.' } : { ok: true, text: 'Guardado.' })
    if (!error) onChanged()
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    setInvMsg(undefined)
    const amount = parseAmount(form.amount)
    if (!form.number.trim()) return setInvMsg({ ok: false, text: 'Indique o número da fatura.' })
    if (isNaN(amount)) return setInvMsg({ ok: false, text: 'Valor inválido.' })
    if (!file || file.type !== 'application/pdf') return setInvMsg({ ok: false, text: 'Escolha o PDF da fatura.' })
    if (file.size > 5_000_000) return setInvMsg({ ok: false, text: 'O PDF tem de ter menos de 5 MB.' })
    setBusy(true)
    const path = invoicePath(salon.id)
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf' })
    if (up.error) { setBusy(false); return setInvMsg({ ok: false, text: 'Não foi possível enviar o ficheiro.' }) }
    // The legal invoice for a payment request that was already paid: recorded as paid, linked to the request.
    const req = invoices?.find(i => i.id === form.request)
    const ins = await supabase.from('invoices').insert({
      salon_id: salon.id, number: form.number.trim(), issued_on: form.issued, due_on: form.due || null, period: form.period.trim() || null, amount_cents: amount, file_path: path,
      ...(req ? { request_id: req.id, status: 'paga', paid_on: req.paid_on ?? form.issued, payment_method: req.payment_method ?? null } : {}),
    })
    if (ins.error) await supabase.storage.from(BUCKET).remove([path]) // don't leave a file without its invoice
    setBusy(false)
    if (ins.error) return setInvMsg({ ok: false, text: 'Não foi possível guardar a fatura.' })
    setInvMsg({ ok: true, text: 'Fatura enviada. O salão já a vê em Assinatura.' })
    setForm(f => ({ ...f, number: '', request: '' })); setFile(null)
    reload()
  }

  // Undo a payment or cancel an invoice. "Pago até" is not moved back: change it above if needed.
  async function setStatus(inv: Invoice, status: 'por_pagar' | 'anulada') {
    const { error } = await supabase.from('invoices').update(status === 'por_pagar'
      ? { status, paid_on: null, payment_method: null, payment_ref: null } : { status }).eq('id', inv.id)
    if (error) return setInvMsg({ ok: false, text: 'Não foi possível alterar a fatura.' })
    setInvMsg({ ok: true, text: status === 'por_pagar' ? 'Pagamento desfeito. Verifique o "Pago até" acima.' : 'Fatura anulada.' })
    reload()
  }

  async function remove(inv: Invoice) {
    const del = await supabase.from('invoices').delete().eq('id', inv.id).select('id')
    if (del.error || !del.data?.length) return setInvMsg({ ok: false, text: 'Não foi possível apagar.' })
    await supabase.storage.from(BUCKET).remove([inv.file_path])
    reload()
  }

  return (
    <div className="client-body">
      <h3 style={{ marginTop: 8 }}>Assinatura</h3>
      <label>Estado
        <select value={plan.status} onChange={e => setPlan({ ...plan, status: e.target.value as typeof plan.status })}>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="grow">Pago até<input type="date" value={plan.paid} onChange={e => setPlan({ ...plan, paid: e.target.value })} /></label>
        <label className="grow">Grátis até<input type="date" value={plan.trial} onChange={e => setPlan({ ...plan, trial: e.target.value })} /></label>
      </div>
      <p className="muted small">{lockState(salon).locked
        ? 'Conta só de leitura e marcações online em pausa. Para desbloquear: Estado "Ativa" e "Pago até" numa data futura.'
        : 'Sem pagamento, a conta fica só de leitura 14 dias depois do fim do período grátis ou do "Pago até".'}</p>
      <button className="btn" onClick={savePlan}>Guardar assinatura</button>
      {planMsg && <p className={planMsg.ok ? 'ok' : 'error'}>{planMsg.text}</p>}

      <h3 style={{ marginTop: 20 }}>Pedidos de pagamento e faturas</h3>
      {invoices === undefined && <p className="muted">A carregar…</p>}
      {invoices?.length === 0 && <p className="muted">Ainda nada enviado a este salão.</p>}
      {invoices && invoices.length > 0 && (
        <ul className="history">
          {documentRows(invoices).map(r => {
            const inv = r.inv, st = inv.status ?? 'por_pagar'
            return (
            <li key={inv.id} className="invoice-row">
              <span>{inv.issued_on}</span>
              <span><b>{inv.number}</b>{inv.period && ` · ${inv.period}`} · {euros(inv.amount_cents)}
                <small className="muted"><br />{docDetail(r)}</small></span>
              <span className="row" style={{ gap: 10 }}>
                <DocTags r={r} />
                <button className="link" onClick={() => openInvoice(inv)}>Abrir</button>
                {st === 'paga' && <button className="link" onClick={() => setStatus(inv, 'por_pagar')}>Desfazer</button>}
                {st === 'por_pagar' && <button className="link" onClick={() => setStatus(inv, 'anulada')}>Anular</button>}
                <button className="link danger-link" style={{ marginTop: 0 }} onClick={() => remove(inv)}>Apagar</button>
              </span>
              {st === 'por_pagar' && <MarkPaid inv={inv} salon={salon} onDone={() => { reload(); onChanged() }} />}
            </li>
          )})}
        </ul>
      )}
      <form onSubmit={upload} className="card soft">
        <strong>Enviar fatura</strong>
        <label>Número<input value={form.number} placeholder="FT 2026/12" onChange={e => setForm({ ...form, number: e.target.value })} /></label>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="grow">Data<input type="date" value={form.issued} onChange={e => setForm({ ...form, issued: e.target.value, due: addDaysIso(e.target.value, DUE_DAYS) })} /></label>
          <label className="grow">Vence a<input type="date" value={form.due} onChange={e => setForm({ ...form, due: e.target.value })} /></label>
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="grow">Referente a<input value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} /></label>
          <label className="grow">Valor com IVA (€)<input inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
        </div>
        {paidRequests.length > 0 && (
          <label>Fatura-recibo de um pedido já pago
            <select value={form.request} onChange={e => {
              const r = paidRequests.find(x => x.id === e.target.value)
              setForm({ ...form, request: e.target.value, ...(r ? { period: r.period ?? form.period, amount: (r.amount_cents / 100).toFixed(2).replace('.', ',') } : {}) })
            }}>
              <option value="">Não, é uma fatura nova (fica por pagar)</option>
              {paidRequests.map(r => <option key={r.id} value={r.id}>{r.number}{r.period ? ` · ${r.period}` : ''} · {euros(r.amount_cents)}</option>)}
            </select>
          </label>
        )}
        <label>PDF<input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
        <button className="btn" disabled={busy}>{busy ? 'A enviar…' : 'Enviar fatura'}</button>
        {invMsg && <p className={invMsg.ok ? 'ok' : 'error'}>{invMsg.text}</p>}
      </form>
      <DemoAndHeard salon={salon} onChanged={onChanged} />
      <BillingDetails salonId={salon.id} />
      <SalonNotes salonId={salon.id} />
    </div>
  )
}
