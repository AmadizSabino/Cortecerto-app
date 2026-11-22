/** The Club: a monthly membership the salon sells (migration 0018). */

export interface Club { salon_id: string; active: boolean; name: string; price_cents: number; benefits: string; no_deposit: boolean }
export interface Member {
  id: string; phone_key: string; name: string; phone: string
  status: 'pedido' | 'ativo' | 'cancelado'; pay_method: 'mbway' | 'balcao'
  price_cents: number; started_at: string | null; paid_until: string | null; cancelled_at: string | null; created_at: string
}

export const DEFAULT_CLUB = (salonId: string, salonName: string): Club => ({
  salon_id: salonId, active: false, name: `Clube ${salonName}`.slice(0, 60), price_cents: 0, benefits: '', no_deposit: true,
})

/** One month after a YYYY-MM-DD date, on the same day when it exists (31 Jan -> 28/29 Feb). */
export function addMonth(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const t = new Date(Date.UTC(y, m, Math.min(d, last)))
  return t.toISOString().slice(0, 10)
}

/** A payment covers one more month, from the end of the paid period or from today when it has lapsed. */
export function renewedUntil(paidUntil: string | null, today: string): string {
  return addMonth(paidUntil && paidUntil >= today ? paidUntil : today)
}

export type MemberState = 'pedido' | 'em_dia' | 'por_pagar' | 'cancelado'
export function memberState(m: Pick<Member, 'status' | 'paid_until'>, today: string): MemberState {
  if (m.status === 'cancelado') return 'cancelado'
  if (m.status === 'pedido') return 'pedido'
  return m.paid_until && m.paid_until < today ? 'por_pagar' : 'em_dia'
}

/** Money expected each month from members who are on (requests not counted). */
export const monthlyRevenue = (members: Pick<Member, 'status' | 'price_cents'>[]) =>
  members.filter(m => m.status === 'ativo').reduce((s, m) => s + m.price_cents, 0)

/** Benefits written one per line or separated by commas, for a list. */
export const benefitList = (text: string) => text.split(/\n|,/).map(t => t.trim()).filter(Boolean)
