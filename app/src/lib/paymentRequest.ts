import { PLAN } from './plan'
import { COMPANY_DETAILS } from './legal'
import type { BillingFields } from './billing'
import { supabase } from './supabase'

/**
 * Monthly payment requests (migration 0026): which period a request covers, its amounts, and the
 * PDF. A request is not an invoice: the legal invoice comes from certified software after payment.
 */

export interface RequestSalon extends BillingFields {
  salon_id: string; salon_name: string; owner_email: string | null; billing_email: string | null
  legal_name: string | null; nif: string | null; address: string | null; postal_code: string | null; city: string | null
  professionals: number
}
export interface Payments { mbway?: string; iban?: string; titular?: string; nota?: string }

const DAY = 86_400_000
const addMonth = (d: Date) => {
  const x = new Date(d.getTime()), day = x.getUTCDate()
  x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + 1)
  x.setUTCDate(Math.min(day, new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate()))
  return x
}
const ptDate = (d: Date) => d.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'short', year: 'numeric' })

/** The month the subscription runs from: "Pago até" if paid before, else the end of the free period. */
export function coveredPeriod(s: BillingFields): { from: Date; to: Date; label: string } | null {
  const base = s.paid_until ?? s.trial_ends_at
  if (!base) return null
  const from = new Date(base), to = new Date(addMonth(from).getTime() - DAY)
  return { from, to, label: `${ptDate(from)} a ${ptDate(to)}` }
}

/** Net and IVA from a price before IVA, in cents. */
export function amounts(netCents = PLAN.priceCents, vatRate = PLAN.vatRate) {
  const vat = Math.round(netCents * vatRate)
  return { net: netCents, vat, total: netCents + vat }
}

export const firstOfMonth = (iso: string) => iso.slice(0, 7) + '-01'
export function addMonths(isoMonth: string, n: number): string {
  const [y, m] = isoMonth.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10)
}
export const monthLabel = (isoMonth: string) => new Date(isoMonth.slice(0, 7) + '-15T12:00:00Z').toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })

const eur = (c: number) => (c / 100).toFixed(2).replace('.', ',') + ' €'
const isoPt = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-PT')

export interface RequestPdf {
  number: string; issuedOn: string; dueOn: string; period: string; netCents: number
  salon: RequestSalon; payments: Payments
}

/** Draws the request as an A4 PDF. jsPDF loads only here, so the rest of the app stays small. */
export async function requestPdf(r: RequestPdf): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const a = amounts(r.netCents)
  const accent: [number, number, number] = [181, 70, 47]
  const muted: [number, number, number] = [107, 101, 92]
  const L = 20, R = 190
  let y = 24

  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...accent); doc.text('CorteCerto', L, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted)
  ;[COMPANY_DETAILS.name, `NIPC ${COMPANY_DETAILS.nipc}`, COMPANY_DETAILS.city, COMPANY_DETAILS.email]
    .forEach((t, i) => doc.text(t, R, 18 + i * 4.5, { align: 'right' }))

  y = 50
  doc.setTextColor(29, 27, 24); doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
  doc.text('PEDIDO DE PAGAMENTO', L, y)
  doc.setFontSize(11); doc.text(`N.º ${r.number}`, R, y, { align: 'right' })
  y += 8
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...muted)
  doc.text(`Data: ${isoPt(r.issuedOn)}`, L, y); doc.text(`Pagar até: ${isoPt(r.dueOn)}`, R, y, { align: 'right' })

  y += 14
  doc.setDrawColor(230, 224, 214); doc.line(L, y - 6, R, y - 6)
  doc.setTextColor(...muted); doc.setFontSize(9); doc.text('CLIENTE', L, y)
  doc.setTextColor(29, 27, 24); doc.setFontSize(10)
  const s = r.salon
  const who = [s.legal_name || s.salon_name, s.legal_name && s.legal_name !== s.salon_name ? s.salon_name : null,
    s.nif ? `NIF ${s.nif}` : null, s.address, [s.postal_code, s.city].filter(Boolean).join(' ') || null, s.billing_email || s.owner_email]
    .filter((x): x is string => !!x)
  who.forEach((t, i) => doc.text(t, L, y + 6 + i * 5))
  y += 10 + who.length * 5

  y += 6
  doc.setFillColor(245, 241, 235); doc.rect(L, y - 5, R - L, 8, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('Descrição', L + 2, y); doc.text('Valor', R - 2, y, { align: 'right' })
  y += 9
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(`Assinatura CorteCerto, 1 mês`, L + 2, y); doc.text(eur(a.net), R - 2, y, { align: 'right' })
  doc.setTextColor(...muted); doc.setFontSize(9); doc.text(r.period, L + 2, y + 5); doc.setTextColor(29, 27, 24)
  y += 14
  doc.line(120, y - 5, R, y - 5)
  doc.setFontSize(10)
  doc.text('Subtotal', 122, y); doc.text(eur(a.net), R - 2, y, { align: 'right' })
  doc.text(`IVA ${Math.round(PLAN.vatRate * 100)}%`, 122, y + 6); doc.text(eur(a.vat), R - 2, y + 6, { align: 'right' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
  doc.text('Total a pagar', 122, y + 14); doc.text(eur(a.total), R - 2, y + 14, { align: 'right' })

  y += 32
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Como pagar', L, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  const p = r.payments
  const how = [p.mbway && `MB Way: ${p.mbway.replace(/(\d{3})(?=\d)/g, '$1 ')}`,
    p.iban && `Transferência bancária: IBAN ${p.iban.replace(/(.{4})/g, '$1 ').trim()}`, p.titular && `Titular: ${p.titular}`,
    `Na descrição do pagamento indique: ${r.number}`, p.nota].filter((x): x is string => !!x)
  if (!p.mbway && !p.iban) how.unshift('Os dados para pagamento seguem no email que acompanha este pedido.')
  how.forEach((t, i) => doc.text(t, L, y + 7 + i * 5.5))

  doc.setFontSize(8.5); doc.setTextColor(...muted)
  doc.text(doc.splitTextToSize('Este documento não é uma fatura e não serve de recibo. A fatura-recibo é emitida depois de recebido o pagamento e fica disponível na app, em Assinatura.', R - L), L, 272)
  doc.text(`Sem pagamento, a conta fica só de leitura 14 dias depois do fim do período pago.`, L, 282)
  return doc.output('blob')
}

async function session() { return (await supabase.auth.getSession()).data.session?.access_token ?? '' }

/** Emails a request that already exists (also used to resend). */
export async function emailRequest(id: string): Promise<string> {
  const res = await fetch('/api/admin/send-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await session()}` }, body: JSON.stringify({ id }),
  }).catch(() => null)
  return ((await res?.json().catch(() => null)) as { status?: string } | null)?.status ?? 'falhou'
}

