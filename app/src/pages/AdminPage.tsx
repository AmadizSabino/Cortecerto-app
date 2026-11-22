import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase } from '../lib/supabase'
import { billingState, lockState, type BillingFields } from '../lib/billing'
import { BUCKET, invoicePath, listInvoices, openInvoice, parseAmount, type Invoice } from '../lib/invoices'
import { PLAN } from '../lib/plan'

interface AdminSalon extends BillingFields { id: string; name: string; slug: string; type: string; created_at: string }

const STATUS: Record<NonNullable<BillingFields['subscription']>, string> = {
  experimental: 'Período grátis', ativa: 'Ativa', em_atraso: 'Em atraso', cancelada: 'Cancelada',
}
const KIND_LABEL: Record<string, string> = {
  sem_dados: 'Sem dados', experimental: 'Grátis', ativa: 'Ativa', terminou: 'Grátis terminou', em_atraso: 'Em atraso', cancelada: 'Cancelada',
}
const dateOnly = (iso?: string | null) => iso ? iso.slice(0, 10) : ''
const endOfDay = (d: string) => d ? new Date(d + 'T23:59:59').toISOString() : null
const withVat = (Math.round(PLAN.priceCents * (1 + PLAN.vatRate)) / 100).toFixed(2).replace('.', ',')
const thisMonth = () => new Date().toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })

/** CorteCerto's own admin area: every salon's plan, and its invoices. */
export default function AdminPage() {
  const [session, setSession] = useState<Session | null>()
  const [admin, setAdmin] = useState<boolean>()
  const [salons, setSalons] = useState<AdminSalon[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  async function load() {
    const { data } = await supabase.from('salons').select('id,name,slug,type,created_at,subscription,trial_ends_at,paid_until').order('created_at', { ascending: false })
    setSalons(data ?? [])
  }
  useEffect(() => {
    if (!session) return
    supabase.rpc('is_platform_admin').then(({ data, error }) => {
      setAdmin(!error && data === true)
      if (!error && data === true) load()
    })
  }, [session])

  if (session === undefined || (session && admin === undefined)) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (!admin) return <main className="page"><h1>Sem acesso</h1><p className="muted">Esta área é só para a equipa CorteCerto.</p></main>

  const shown = salons.filter(s => !q || `${s.name} ${s.slug}`.toLowerCase().includes(q.toLowerCase()))
  const counts = salons.reduce<Record<string, number>>((c, s) => { const k = billingState(s).kind; c[k] = (c[k] ?? 0) + 1; return c }, {})

  return (
    <main className="page wide">
      <header className="row"><Link to="/painel">‹ O meu salão</Link><button className="link" onClick={() => supabase.auth.signOut().then(() => location.assign('/painel'))}>Sair</button></header>
      <h1>Administração</h1>
      <div className="stats" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="stat"><b>{salons.length}</b><span>Salões</span></div>
        <div className="stat"><b>{counts.ativa ?? 0}</b><span>Ativos</span></div>
        <div className="stat"><b>{(counts.terminou ?? 0) + (counts.em_atraso ?? 0)}</b><span>Por pagar</span></div>
        <div className="stat"><b>{salons.filter(s => lockState(s).locked).length}</b><span>Bloqueadas</span></div>
      </div>
      <label>Procurar<input type="search" value={q} placeholder="Nome ou link do salão" onChange={e => setQ(e.target.value)} /></label>
      {shown.map(s => {
        const b = billingState(s)
        const locked = lockState(s).locked
        return (
          <section key={s.id} className="card">
            <button className="client-head" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
              <span><b>{s.name}</b><small className="muted">/s/{s.slug} · {s.created_at && `desde ${new Date(s.created_at).toLocaleDateString('pt-PT')}`}</small></span>
              <span className={`tag ${b.kind === 'ativa' ? 'concluida' : b.kind === 'em_atraso' || b.kind === 'terminou' ? 'faltou' : 'pendente'}`}>
                {locked ? 'Bloqueada' : KIND_LABEL[b.kind]}{!locked && b.kind === 'experimental' && ` · ${b.daysLeft} d`}
              </span>
            </button>
            {open === s.id && <SalonAdmin salon={s} onChanged={load} />}
          </section>
        )
      })}
      {shown.length === 0 && <p className="muted">Nenhum salão encontrado.</p>}
    </main>
  )
}

function SalonAdmin({ salon, onChanged }: { salon: AdminSalon; onChanged: () => void }) {
  const [plan, setPlan] = useState({ status: salon.subscription ?? 'experimental', paid: dateOnly(salon.paid_until), trial: dateOnly(salon.trial_ends_at) })
  const [planMsg, setPlanMsg] = useState<{ ok: boolean; text: string }>()
  const [invoices, setInvoices] = useState<Invoice[] | null>()
  const [form, setForm] = useState({ number: '', issued: new Date().toISOString().slice(0, 10), period: thisMonth(), amount: withVat })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [invMsg, setInvMsg] = useState<{ ok: boolean; text: string }>()

  const reload = () => listInvoices(salon.id).then(setInvoices)
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
    const ins = await supabase.from('invoices').insert({
      salon_id: salon.id, number: form.number.trim(), issued_on: form.issued, period: form.period.trim() || null, amount_cents: amount, file_path: path,
    })
    if (ins.error) await supabase.storage.from(BUCKET).remove([path]) // don't leave a file without its invoice
    setBusy(false)
    if (ins.error) return setInvMsg({ ok: false, text: 'Não foi possível guardar a fatura.' })
    setInvMsg({ ok: true, text: 'Fatura enviada. O salão já a vê em Assinatura.' })
    setForm(f => ({ ...f, number: '' })); setFile(null)
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

      <h3 style={{ marginTop: 20 }}>Faturas</h3>
      {invoices === undefined && <p className="muted">A carregar…</p>}
      {invoices?.length === 0 && <p className="muted">Ainda sem faturas.</p>}
      {invoices && invoices.length > 0 && (
        <ul className="history">
          {invoices.map(inv => (
            <li key={inv.id}>
              <span>{inv.issued_on}</span>
              <span>{inv.number}{inv.period && ` · ${inv.period}`} · {euros(inv.amount_cents)}</span>
              <span className="row" style={{ gap: 10 }}>
                <button className="link" onClick={() => openInvoice(inv)}>Abrir</button>
                <button className="link danger-link" style={{ marginTop: 0 }} onClick={() => remove(inv)}>Apagar</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={upload} className="card soft">
        <strong>Enviar fatura</strong>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="grow">Número<input value={form.number} placeholder="FT 2026/12" onChange={e => setForm({ ...form, number: e.target.value })} /></label>
          <label className="grow">Data<input type="date" value={form.issued} onChange={e => setForm({ ...form, issued: e.target.value })} /></label>
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="grow">Referente a<input value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} /></label>
          <label className="grow">Valor com IVA (€)<input inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
        </div>
        <label>PDF<input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
        <button className="btn" disabled={busy}>{busy ? 'A enviar…' : 'Enviar fatura'}</button>
        {invMsg && <p className={invMsg.ok ? 'ok' : 'error'}>{invMsg.text}</p>}
      </form>
    </div>
  )
}
