import type { Booking } from './supabase'
import { bookingPrice } from './pricing'

/** How a professional is paid on each completed visit (table professional_pay, migration 0018). */
export interface Pay {
  professional_id: string
  commission_type: 'nenhuma' | 'percentagem' | 'montante'
  commission_percent: number | null
  commission_cents: number | null
}

export const NO_PAY = (professionalId: string): Pay => ({ professional_id: professionalId, commission_type: 'nenhuma', commission_percent: null, commission_cents: null })

/** Commission on one visit worth `priceCents`, rounded to the cent. */
export function commissionFor(pay: Pay | undefined, priceCents: number): number {
  if (!pay) return 0
  if (pay.commission_type === 'percentagem') return Math.round(priceCents * (Number(pay.commission_percent) || 0) / 100)
  if (pay.commission_type === 'montante') return pay.commission_cents ?? 0
  return 0
}

/** "40 %" or "5,00 € por visita", for lists. */
export function payLabel(pay: Pay | undefined, euros: (c: number) => string): string {
  if (!pay || pay.commission_type === 'nenhuma') return 'Sem comissão'
  if (pay.commission_type === 'percentagem') return `${String(pay.commission_percent ?? 0).replace('.', ',')} % por visita`
  return `${euros(pay.commission_cents ?? 0)} por visita`
}

/** Commission per professional over completed visits in [from, to) (ISO instants). */
export function commissions(
  bookings: Booking[], pay: Record<string, Pay>, services: Record<string, { price_cents: number }>, from: string, to: string,
): Record<string, { visits: number; revenue: number; commission: number }> {
  const out: Record<string, { visits: number; revenue: number; commission: number }> = {}
  for (const b of bookings) {
    if (b.status !== 'concluida' || b.starts_at < from || b.starts_at >= to) continue
    const price = bookingPrice(b, services)
    const r = (out[b.professional_id] ??= { visits: 0, revenue: 0, commission: 0 })
    r.visits++; r.revenue += price; r.commission += commissionFor(pay[b.professional_id], price)
  }
  return out
}

/** Reads the form values; returns an error text when invalid. */
export function parsePay(type: Pay['commission_type'], value: string): { percent: number | null; cents: number | null } | string {
  if (type === 'nenhuma') return { percent: null, cents: null }
  const n = Number(value.replace(',', '.').replace(/[^\d.]/g, ''))
  if (!value.trim() || isNaN(n) || n < 0) return 'Indique um valor válido.'
  if (type === 'percentagem') return n > 100 ? 'A percentagem vai de 0 a 100.' : { percent: Math.round(n * 100) / 100, cents: null }
  return { percent: null, cents: Math.round(n * 100) }
}
