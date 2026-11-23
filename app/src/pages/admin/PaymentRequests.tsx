import { useEffect, useState } from 'react'
import { euros, supabase } from '../../lib/supabase'
import { addDaysIso, BUCKET, DUE_DAYS, parseAmount } from '../../lib/invoices'
import { PLAN } from '../../lib/plan'
import {
  addMonths, amounts, coveredPeriod, emailRequest, firstOfMonth, monthLabel, requestPdf, type Payments, type RequestSalon,
} from '../../lib/paymentRequest'

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
const netText = (c: number) => (c / 100).toFixed(2).replace('.', ',')
const RESULT: Record<string, string> = {
  enviado: 'Enviado por email', sem_email: 'Criado. O envio de emails ainda não está ligado: o salão vê-o em Assinatura.',
  sem_pdf: 'Criado, mas o PDF não foi encontrado para enviar.', nao_devido: 'Já tinha sido enviado.', falhou: 'Criado, mas o email falhou. Reenvie na lista de faturas por pagar.',
}

/** Pedidos de pagamento: the salons due a request this month (or next), each with Enviar. */
export function PaymentRequests({ payments, onSent }: { payments: Payments; onSent: () => void }) {
  const thisMonth = firstOfMonth(today())
  const [month, setMonth] = useState(thisMonth)
  const [due, setDue] = useState<RequestSalon[] | null>()
  const [net, setNet] = useState<Record<string, string>>({})
  const [state, setState] = useState<Record<string, string>>({})

  async function load(m = month) {
    const { data, error } = await supabase.rpc('admin_payment_requests_due', { p_month: m })
    setDue(error ? null : (data ?? []) as RequestSalon[])
  }
  useEffect(() => { load(month) }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  const netCents = (s: RequestSalon) => { const v = parseAmount(net[s.salon_id] ?? netText(PLAN.priceCents)); return isNaN(v) ? NaN : v }
  const pdfInput = (s: RequestSalon, number: string) => {
    const issuedOn = today()
    return { number, issuedOn, dueOn: addDaysIso(issuedOn, DUE_DAYS), period: coveredPeriod(s)?.label ?? monthLabel(month), netCents: netCents(s), salon: s, payments }
  }

  async function preview(s: RequestSalon) {
    if (isNaN(netCents(s))) return setState(x => ({ ...x, [s.salon_id]: 'Valor inválido.' }))
    const url = URL.createObjectURL(await requestPdf(pdfInput(s, 'PP (pré-visualização)')))
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  async function send(s: RequestSalon) {
    const cents = netCents(s)
    if (isNaN(cents) || cents <= 0) return setState(x => ({ ...x, [s.salon_id]: 'Valor inválido.' }))
    setState(x => ({ ...x, [s.salon_id]: 'a_enviar' }))
    const input = pdfInput(s, '')
    const path = `${s.salon_id}/pp-${crypto.randomUUID()}.pdf`
    const created = await supabase.rpc('admin_new_payment_request', {
      p_salon: s.salon_id, p_month: month, p_period: input.period, p_amount_cents: amounts(cents).total,
      p_issued_on: input.issuedOn, p_due_on: input.dueOn, p_file_path: path,
    })
    const row = (created.data as { id: string; number: string }[] | null)?.[0]
    if (created.error || !row) return setState(x => ({ ...x, [s.salon_id]: 'Não foi possível criar o pedido.' }))
    const blob = await requestPdf({ ...input, number: row.number })
    const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf' })
    if (up.error) {
      await supabase.from('invoices').delete().eq('id', row.id) // no request without its PDF
      return setState(x => ({ ...x, [s.salon_id]: 'Não foi possível guardar o PDF.' }))
    }
    const r = await emailRequest(row.id)
    setState(x => ({ ...x, [s.salon_id]: `${row.number}: ${RESULT[r] ?? r}` }))
    onSent(); load()
  }

  const months = [thisMonth, addMonths(thisMonth, 1)]
  return (
    <section className="card">
      <h2>Pedidos de pagamento</h2>
      <div className="chips">
        {months.map(m => <button key={m} className={`chip${m === month ? ' on' : ''}`} onClick={() => setMonth(m)}>{monthLabel(m)}</button>)}
      </div>
      <p className="muted small">Salões a pagar e salões cujo período grátis acaba até ao fim do mês, ainda sem pedido para {monthLabel(month)}.
        O PDF leva os seus dados, os do salão, o período, o valor com IVA e como pagar. Não é uma fatura: emita-a no seu programa de faturação depois do pagamento.</p>
      {due === undefined && <p className="muted">A carregar…</p>}
      {due === null && <p className="card warn small">Precisa da migração 0026 (supabase/migrations/0026_payment_requests.sql).</p>}
      {due?.length === 0 && Object.keys(state).length === 0 && <p className="muted">Nenhum salão por pedir este mês.</p>}
      <ul className="unpaid">
        {due?.map(s => {
          const st = state[s.salon_id]
          const cents = netCents(s)
          return (
            <li key={s.salon_id}>
              <div className="row">
                <span><b>{s.salon_name}</b><small className="muted"> · {coveredPeriod(s)?.label ?? ''} · {s.billing_email || s.owner_email}{!s.nif && ' · sem NIF'}</small></span>
              </div>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <label className="grow">Valor sem IVA (€)<input inputMode="decimal" value={net[s.salon_id] ?? netText(PLAN.priceCents)} onChange={e => setNet({ ...net, [s.salon_id]: e.target.value })} /></label>
                <span className="muted small">{isNaN(cents) ? '—' : `Total ${euros(amounts(cents).total)}`}</span>
                <button className="link" onClick={() => preview(s)}>Ver PDF</button>
                <button className="btn-inline small-btn" disabled={st === 'a_enviar'} onClick={() => send(s)}>{st === 'a_enviar' ? 'A enviar…' : 'Enviar'}</button>
              </div>
              {st && st !== 'a_enviar' && <p className="small">{st}</p>}
            </li>
          )
        })}
      </ul>
      {Object.entries(state).filter(([id]) => !due?.some(s => s.salon_id === id)).map(([id, t]) => <p key={id} className="ok small">{t}</p>)}
      {(due?.length ?? 0) > 1 && <button className="btn ghost" onClick={async () => { for (const s of due ?? []) if (!state[s.salon_id]) await send(s) }}>Enviar todos</button>}
    </section>
  )
}
