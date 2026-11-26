import { useEffect, useState } from 'react'
import { euros, supabase } from '../../lib/supabase'
import type { BillingFields } from '../../lib/billing'
import { METHOD_LABEL, type Invoice, type PaymentMethod } from '../../lib/invoices'
import { PaymentRequests } from './PaymentRequests'
import { DocumentHistory } from './Documents'
import { AdminReferrals } from './AdminReferrals'
import { emailRequest } from '../../lib/paymentRequest'
import { cleanIban, daysLate, moneySummary, nextPaidUntil, REMINDER_LABEL } from '../../lib/money'

interface SalonLite extends BillingFields { id: string; name: string }
interface Due { salon_id: string; salon_name: string; owner_email: string | null; kind: string; invoice_id: string | null; detail: string }
interface Payments { mbway: string; iban: string; titular: string; nota: string }

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
const monthName = (m: string) => new Date(m + '-15T12:00:00Z').toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
const ptDate = (iso?: string | null) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('pt-PT') : '—'

/** Sends one reminder through the Worker, with the admin's session. */
async function sendReminder(d: Due): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch('/api/admin/remind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify({ salon: d.salon_id, kind: d.kind, invoice: d.invoice_id }),
  }).catch(() => null)
  const out = await res?.json().catch(() => null) as { status?: string; message?: string } | null
  return out?.status ?? 'falhou'
}

const SENT: Record<string, string> = { enviado: 'Enviado', nao_devido: 'Já não é preciso', falhou: 'Falhou. Tente de novo.', sem_email: 'Envio de emails por ligar', erro: 'Erro' }

/** When a request went out, and a button to send it again. */
function ResendRequest({ id, sentAt, sentTo }: { id: string; sentAt: string | null; sentTo: string | null }) {
  const [st, setSt] = useState('')
  return (
    <p className="small muted">
      {sentAt ? `Enviado a ${new Date(sentAt).toLocaleDateString('pt-PT')} para ${sentTo}` : 'Ainda não enviado por email'}
      {' · '}<button className="link" disabled={st === '…'} onClick={async () => { setSt('…'); setSt(SENT[await emailRequest(id)] ?? 'Falhou') }}>{st && st !== '…' ? st : 'Reenviar'}</button>
    </p>
  )
}

/** "Marcar como paga": date, method, reference, and whether "Pago até" moves on. */
export function MarkPaid({ inv, salon, onDone }: { inv: Invoice; salon?: BillingFields; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ date: today(), method: 'mbway' as PaymentMethod, ref: '', extend: true })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const next = salon ? nextPaidUntil(salon) : null
  if (!open) return <button className="link" onClick={() => setOpen(true)}>Marcar como paga</button>
  async function save() {
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('admin_mark_invoice_paid', { p_invoice: inv.id, p_paid_on: f.date, p_method: f.method, p_ref: f.ref, p_extend: f.extend })
    setBusy(false)
    if (error) return setMsg('Não foi possível guardar.')
    setOpen(false); onDone()
  }
  return (
    <div className="card soft mark-paid">
      <strong>Fatura {inv.number} · {euros(inv.amount_cents)}</strong>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="grow">Pago em<input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
        <label className="grow">Como
          <select value={f.method} onChange={e => setF({ ...f, method: e.target.value as PaymentMethod })}>
            {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <label>Referência (opcional)<input value={f.ref} maxLength={120} placeholder="Ex.: nº da transferência" onChange={e => setF({ ...f, ref: e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={f.extend} onChange={e => setF({ ...f, extend: e.target.checked })} />
        <span>Passar a "Ativa" e o "Pago até" para {next ? next.toLocaleDateString('pt-PT') : 'mais um mês'}</span></label>
      <div className="row">
        <button className="btn-inline" disabled={busy} onClick={save}>{busy ? 'A guardar…' : 'Confirmar pagamento'}</button>
        <button className="link" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
      {msg && <p className="error">{msg}</p>}
    </div>
  )
}

/** The Dinheiro tab: what came in, what is owed, reminders to send, and how salons pay. */
export function AdminMoney({ salons, onOpen, onChanged }: { salons: SalonLite[]; onOpen: (id: string) => void; onChanged: () => void }) {
  const [invoices, setInvoices] = useState<Invoice[] | null>()
  const [due, setDue] = useState<Due[]>([])
  const [sent, setSent] = useState<Record<string, string>>({})
  const [auto, setAuto] = useState<boolean>(false)
  const [pay, setPay] = useState<Payments>({ mbway: '', iban: '', titular: '', nota: '' })
  const [payMsg, setPayMsg] = useState<{ ok: boolean; text: string }>()

  async function load() {
    const [inv, d, st] = await Promise.all([
      supabase.from('invoices').select('*').order('issued_on', { ascending: false }),
      supabase.rpc('admin_reminders_due'),
      supabase.from('platform_settings').select('key,value'),
    ])
    setInvoices(inv.error ? null : (inv.data ?? []) as Invoice[])
    setDue(d.error ? [] : (d.data ?? []) as Due[])
    for (const row of (st.data ?? []) as { key: string; value: Record<string, unknown> }[]) {
      if (row.key === 'lembretes') setAuto(row.value.automaticos === true)
      if (row.key === 'pagamentos') setPay(p => ({ ...p, ...(row.value as Partial<Payments>) }))
    }
  }
  useEffect(() => { load() }, [])

  if (invoices === undefined) return <p className="muted">A carregar…</p>
  if (invoices === null) return <p className="card warn small">Esta área precisa da migração 0025 (supabase/migrations/0025_admin_money.sql). Corra-a no Supabase › SQL Editor.</p>

  const t = today()
  const m = moneySummary(invoices, salons, t)
  const byId = new Map(salons.map(s => [s.id, s]))
  const unpaid = invoices.filter(i => (i.status ?? 'por_pagar') === 'por_pagar').sort((a, b) => daysLate(b, t) - daysLate(a, t))
  const key = (d: Due) => `${d.salon_id}:${d.kind}:${d.invoice_id ?? ''}`
  const refresh = () => { load(); onChanged() }

  async function send(d: Due) {
    setSent(s => ({ ...s, [key(d)]: 'a_enviar' }))
    const r = await sendReminder(d)
    setSent(s => ({ ...s, [key(d)]: r }))
  }
  async function toggleAuto(on: boolean) {
    const { error } = await supabase.from('platform_settings').update({ value: { automaticos: on }, updated_at: new Date().toISOString() }).eq('key', 'lembretes')
    if (!error) setAuto(on)
  }
  async function savePay(e: React.FormEvent) {
    e.preventDefault(); setPayMsg(undefined)
    const iban = cleanIban(pay.iban)
    if (iban === null) return setPayMsg({ ok: false, text: 'O IBAN deve começar por PT e ter 25 caracteres.' })
    const mbway = pay.mbway.replace(/\D/g, '')
    if (mbway && mbway.length !== 9) return setPayMsg({ ok: false, text: 'O número MB Way deve ter 9 dígitos.' })
    const value = { mbway, iban, titular: pay.titular.trim(), nota: pay.nota.trim() }
    const { error } = await supabase.from('platform_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', 'pagamentos')
    setPayMsg(error ? { ok: false, text: 'Não foi possível guardar.' } : { ok: true, text: 'Guardado. Os lembretes passam a mostrar estes dados.' })
    if (!error) setPay({ ...value })
  }

  return (
    <>
      <div className="stats kpis">
        <div className="stat"><b>{euros(m.expectedCents)}</b><span>Esperado por mês (com IVA)</span></div>
        <div className="stat"><b>{euros(m.invoicedCents)}</b><span>Faturado este mês</span></div>
        <div className="stat"><b>{euros(m.collectedCents)}</b><span>Recebido este mês</span></div>
        <div className="stat"><b>{euros(m.outstandingCents)}</b><span>Por receber · {m.outstandingCount} {m.outstandingCount === 1 ? 'fatura' : 'faturas'}</span></div>
        <div className="stat"><b>{euros(m.overdueCents)}</b><span>Em atraso · {m.overdueCount} {m.overdueCount === 1 ? 'fatura' : 'faturas'}</span></div>
      </div>

      <PaymentRequests payments={pay} onSent={refresh} />

      <section className="card">
        <h2>Lembretes de pagamento</h2>
        <label className="check"><input type="checkbox" checked={auto} onChange={e => toggleAuto(e.target.checked)} />
          <span>Enviar automaticamente todas as manhãs</span></label>
        <p className="muted small">{auto
          ? 'Ligado: os lembretes saem sozinhos por volta das 8h. Pode continuar a enviá-los aqui.'
          : 'Desligado: só saem quando carregar em Enviar. Ligue quando quiser que saiam sozinhos.'}</p>
        <p className="muted small">Saem 7, 3 e 0 dias antes do fim do período grátis, e 5 e 10 dias depois do vencimento de uma fatura por pagar, sempre antes do bloqueio aos 14 dias.</p>
        {due.length === 0 && <p className="muted">Nenhum lembrete para enviar hoje.</p>}
        <ul className="todo">
          {due.map(d => {
            const st = sent[key(d)]
            return (
              <li key={key(d)}>
                <button className="link" onClick={() => onOpen(d.salon_id)}>{d.salon_name}</button>
                <span className="muted">{d.detail || REMINDER_LABEL[d.kind] || d.kind}{d.owner_email ? ` · ${d.owner_email}` : ' · sem email'}</span>
                {st && st !== 'a_enviar'
                  ? <small className={st === 'enviado' ? 'ok' : 'error'}>{SENT[st] ?? st}</small>
                  : <button className="btn-inline small-btn" disabled={st === 'a_enviar' || !d.owner_email} onClick={() => send(d)}>{st === 'a_enviar' ? 'A enviar…' : 'Enviar'}</button>}
              </li>
            )
          })}
        </ul>
        {due.length > 1 && <button className="btn ghost" onClick={async () => { for (const d of due) if (!sent[key(d)]) await send(d) }}>Enviar todos</button>}
      </section>

      <section className="card">
        <h2>Faturas por pagar</h2>
        {unpaid.length === 0 && <p className="muted">Tudo pago.</p>}
        <ul className="unpaid">
          {unpaid.map(i => {
            const late = daysLate(i, t)
            return (
              <li key={i.id}>
                <div className="row">
                  <span><button className="link" onClick={() => onOpen(i.salon_id)}>{byId.get(i.salon_id)?.name ?? 'Salão'}</button> · {i.number} · <b>{euros(i.amount_cents)}</b></span>
                  <span className={`tag ${late ? 'faltou' : 'pendente'}`}>{late ? `${late} d em atraso` : `vence ${ptDate(i.due_on)}`}</span>
                </div>
                {i.kind === 'pedido' && <ResendRequest id={i.id} sentAt={i.sent_at ?? null} sentTo={i.sent_to ?? null} />}
                <MarkPaid inv={i} salon={byId.get(i.salon_id)} onDone={refresh} />
              </li>
            )
          })}
        </ul>
        {m.overdueCount > 0 && (
          <p className="muted small">Em atraso: {m.ageing.filter(a => a.count).map(a => `${a.label}: ${euros(a.cents)}`).join(' · ')}</p>
        )}
      </section>

      <DocumentHistory invoices={invoices} salons={salons} onOpen={onOpen} />

      <AdminReferrals onOpen={onOpen} />

      <section className="card">
        <h2>Últimos 6 meses</h2>
        <table className="money-table">
          <thead><tr><th>Mês</th><th>Faturado</th><th>Recebido</th></tr></thead>
          <tbody>
            {[...m.months].reverse().map(r => (
              <tr key={r.month}><td>{monthName(r.month)}</td><td>{euros(r.invoicedCents)}</td><td>{euros(r.collectedCents)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Valores com IVA. "Recebido" conta pela data em que marcou a fatura como paga.</p>
      </section>

      <form className="card" onSubmit={savePay}>
        <h2>Como os salões pagam</h2>
        <p className="muted small">Aparece nos lembretes de pagamento. Sem dados, o email pede ao salão para responder.</p>
        <label>Número MB Way<input inputMode="numeric" value={pay.mbway} placeholder="912 345 678" onChange={e => setPay({ ...pay, mbway: e.target.value })} /></label>
        <label>IBAN para transferência<input value={pay.iban} placeholder="PT50 …" onChange={e => setPay({ ...pay, iban: e.target.value })} /></label>
        <label>Titular da conta<input value={pay.titular} placeholder="Amadiz Sabino Consulting, Lda." onChange={e => setPay({ ...pay, titular: e.target.value })} /></label>
        <label>Nota (opcional)<input value={pay.nota} maxLength={200} placeholder="Ex.: indique o nome do salão na descrição" onChange={e => setPay({ ...pay, nota: e.target.value })} /></label>
        <button className="btn">Guardar</button>
        {payMsg && <p className={payMsg.ok ? 'ok' : 'error'}>{payMsg.text}</p>}
      </form>
    </>
  )
}
