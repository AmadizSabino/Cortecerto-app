import { billingState, type BillingFields } from './billing'
import { METHOD_LABEL, type Invoice } from './invoices'
import { PLAN } from './plan'

/** The admin's money numbers (migration 0025), from invoices and salons. Dates are YYYY-MM-DD. */

export const MONTHLY_WITH_VAT_CENTS = Math.round(PLAN.priceCents * (1 + PLAN.vatRate))

const DAY = 86_400_000
const dayDiff = (a: string, b: string) => Math.round((new Date(a + 'T12:00:00Z').getTime() - new Date(b + 'T12:00:00Z').getTime()) / DAY)

/** Days past the due date of an unpaid invoice; 0 when not late, paid or cancelled. */
export function daysLate(inv: Invoice, today: string): number {
  if ((inv.status ?? 'por_pagar') !== 'por_pagar' || !inv.due_on) return 0
  return Math.max(0, dayDiff(today, inv.due_on))
}

export interface MoneySummary {
  expectedCents: number; invoicedCents: number; collectedCents: number
  outstandingCents: number; outstandingCount: number; overdueCents: number; overdueCount: number
  ageing: { label: string; cents: number; count: number }[]
  months: { month: string; invoicedCents: number; collectedCents: number }[]
}

/** This month (of `today`) and the last 6 months. Cancelled invoices count nowhere. */
export function moneySummary(invoices: Invoice[], salons: BillingFields[], today: string, monthsBack = 6): MoneySummary {
  const month = today.slice(0, 7)
  // The legal invoice for a payment request that was already paid (request_id) is not counted again.
  const live = invoices.filter(i => (i.status ?? 'por_pagar') !== 'anulada' && !i.request_id)
  const unpaid = live.filter(i => (i.status ?? 'por_pagar') === 'por_pagar')
  const late = unpaid.filter(i => daysLate(i, today) > 0)
  const sum = (xs: Invoice[]) => xs.reduce((t, i) => t + i.amount_cents, 0)
  const buckets = [{ label: '1–15 d', min: 1, max: 15 }, { label: '16–30 d', min: 16, max: 30 }, { label: '31–60 d', min: 31, max: 60 }, { label: 'Mais de 60 d', min: 61, max: Infinity }]
  const now = new Date(today + 'T12:00:00Z')
  const paying = salons.filter(s => billingState(s, now).kind === 'ativa' || billingState(s, now).kind === 'em_atraso').length
  const months = Array.from({ length: monthsBack }, (_, k) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1 - k), 1))
    const m = d.toISOString().slice(0, 7)
    return {
      month: m,
      invoicedCents: sum(live.filter(i => i.issued_on.slice(0, 7) === m)),
      collectedCents: sum(live.filter(i => i.status === 'paga' && i.paid_on?.slice(0, 7) === m)),
    }
  })
  return {
    expectedCents: paying * MONTHLY_WITH_VAT_CENTS,
    invoicedCents: sum(live.filter(i => i.issued_on.slice(0, 7) === month)),
    collectedCents: sum(live.filter(i => i.status === 'paga' && i.paid_on?.slice(0, 7) === month)),
    outstandingCents: sum(unpaid), outstandingCount: unpaid.length,
    overdueCents: sum(late), overdueCount: late.length,
    ageing: buckets.map(b => { const xs = late.filter(i => { const d = daysLate(i, today); return d >= b.min && d <= b.max }); return { label: b.label, cents: sum(xs), count: xs.length } }),
    months,
  }
}

/** Mirrors admin_mark_invoice_paid(): "Pago até" moves one month on from where it was, or from the trial's end. */
export function nextPaidUntil(s: BillingFields): Date | null {
  const base = s.paid_until ?? s.trial_ends_at
  if (!base) return null
  const d = new Date(base)
  const day = d.getUTCDate()
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last)) // like Postgres: 31 Jan + 1 month = 28/29 Feb
  return d
}

export const REMINDER_LABEL: Record<string, string> = {
  gratis_7: 'Grátis acaba em 7 dias', gratis_3: 'Grátis acaba em 3 dias', gratis_0: 'Grátis terminou',
  atraso_5: 'Fatura com 5 dias de atraso', atraso_10: 'Fatura com 10 dias de atraso',
}

/** "PT50 0000 ..." -> "PT50000..." and checks it looks like a Portuguese IBAN (25 characters). */
export function cleanIban(text: string): string | null {
  const t = text.replace(/\s/g, '').toUpperCase()
  if (!t) return ''
  return /^PT\d{23}$/.test(t) ? t : null
}

export type DocFilter = 'todos' | 'pedidos' | 'faturas' | 'sem_fatura'

/** One line of the document history: a payment request or an invoice, with its link to the other. */
export interface DocRow {
  inv: Invoice
  kind: 'pedido' | 'fatura'
  /** For a request: the legal invoice issued for it. For an invoice: the request it answers. */
  linked: Invoice | null
  /** A paid request whose legal invoice hasn't been uploaded yet. */
  needsInvoice: boolean
}

/** Every request and invoice sent to salons, newest first, filtered. */
export function documentRows(invoices: Invoice[], filter: DocFilter = 'todos', salonId?: string): DocRow[] {
  const byId = new Map(invoices.map(i => [i.id, i]))
  const invoiceFor = new Map(invoices.filter(i => i.request_id).map(i => [i.request_id!, i]))
  return invoices
    .filter(i => !salonId || i.salon_id === salonId)
    .map(i => {
      const kind = i.kind === 'pedido' ? 'pedido' as const : 'fatura' as const
      const linked = kind === 'pedido' ? invoiceFor.get(i.id) ?? null : (i.request_id ? byId.get(i.request_id) ?? null : null)
      return { inv: i, kind, linked, needsInvoice: kind === 'pedido' && i.status === 'paga' && !linked }
    })
    .filter(r => filter === 'todos' || (filter === 'pedidos' ? r.kind === 'pedido' : filter === 'faturas' ? r.kind === 'fatura' : r.needsInvoice))
    .sort((a, b) => (b.inv.issued_on ?? '').localeCompare(a.inv.issued_on ?? '') || b.inv.number.localeCompare(a.inv.number))
}

const ptDate = (iso?: string | null) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('pt-PT') : '—'

/** What the salon was sent, and what happened to it. One line under the number. */
export function docDetail(r: DocRow): string {
  const i = r.inv
  const parts: string[] = []
  if (r.kind === 'pedido') parts.push(i.sent_at ? `enviado a ${ptDate(i.sent_at)}${i.sent_to ? ` para ${i.sent_to}` : ''}` : 'ainda não enviado por email')
  else parts.push('carregada no painel do salão')
  if (i.status === 'paga') parts.push(`paga a ${ptDate(i.paid_on)}${i.payment_method ? ` por ${METHOD_LABEL[i.payment_method]}` : ''}`)
  else if (i.status !== 'anulada' && i.due_on) parts.push(`vence ${ptDate(i.due_on)}`)
  if (r.linked) parts.push(r.kind === 'pedido' ? `fatura ${r.linked.number}` : `do pedido ${r.linked.number}`)
  return parts.join(' · ')
}

