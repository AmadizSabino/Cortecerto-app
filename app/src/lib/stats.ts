import type { Booking } from './supabase'
import { bookingPrice } from './pricing'
import { waNumber } from './whatsapp'
import { addDays, dateInTz } from './time'

export type Period = 'mes' | 'mes_anterior' | '3_meses' | 'ano'
export const PERIODS: { id: Period; label: string }[] = [
  { id: 'mes', label: 'Este mês' }, { id: 'mes_anterior', label: 'Mês passado' },
  { id: '3_meses', label: 'Últimos 3 meses' }, { id: 'ano', label: 'Este ano' },
]

/** First and last day (inclusive, YYYY-MM-DD) of a period, from today in the salon's timezone. */
export function periodRange(p: Period, today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number)
  const first = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}-01`
  const lastOf = (yy: number, mm: number) => addDays(mm === 12 ? first(yy + 1, 1) : first(yy, mm + 1), -1)
  if (p === 'mes') return { from: first(y, m), to: lastOf(y, m) }
  if (p === 'mes_anterior') { const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1]; return { from: first(py, pm), to: lastOf(py, pm) } }
  if (p === '3_meses') { const [sy, sm] = m <= 2 ? [y - 1, m + 10] : [y, m - 2]; return { from: first(sy, sm), to: lastOf(y, m) } }
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

export interface Ranked { id: string; count: number; revenue: number }

export interface Stats {
  revenue: number       // completed visits
  expected: number      // pending and confirmed still to come in the period
  bookings: number      // all but cancelled
  done: number
  noShows: number
  noShowRate: number    // no-shows ÷ (done + no-shows), 0 to 1
  cancelledByClient: number
  avgTicket: number
  newClients: number
  returningClients: number
  byService: Ranked[]
  byProfessional: Ranked[]
  byWeekday: number[]   // completed visits per weekday, 0 = Sunday
}

/**
 * Figures for the bookings whose day (salon timezone) falls between from and to.
 * `all` is the salon's whole history, used to tell new clients from returning ones.
 */
export function computeStats(all: Booking[], services: Record<string, { price_cents: number }>, tz: string, from: string, to: string): Stats {
  const day = (b: Booking) => dateInTz(new Date(b.starts_at), tz)
  const firstDay = new Map<string, string>()
  for (const b of all) {
    const k = waNumber(b.client_phone)
    if (!k || b.status === 'cancelada') continue
    const d = day(b)
    if (!firstDay.has(k) || d < firstDay.get(k)!) firstDay.set(k, d)
  }
  const inRange = all.filter(b => { const d = day(b); return d >= from && d <= to })
  const live = inRange.filter(b => b.status !== 'cancelada')
  const done = live.filter(b => b.status === 'concluida')
  const noShows = live.filter(b => b.status === 'faltou').length
  const revenue = done.reduce((s, b) => s + bookingPrice(b, services), 0)

  const clients = new Set(live.map(b => waNumber(b.client_phone)).filter(Boolean))
  let newClients = 0
  for (const k of clients) { const f = firstDay.get(k); if (f && f >= from && f <= to) newClients++ }

  const rank = (key: (b: Booking) => string): Ranked[] => {
    const m = new Map<string, Ranked>()
    for (const b of done) {
      const id = key(b)
      const r = m.get(id) ?? { id, count: 0, revenue: 0 }
      r.count++; r.revenue += bookingPrice(b, services); m.set(id, r)
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count)
  }
  const byWeekday = [0, 0, 0, 0, 0, 0, 0]
  for (const b of done) byWeekday[new Date(day(b) + 'T12:00:00Z').getUTCDay()]++

  return {
    revenue,
    expected: live.filter(b => b.status === 'pendente' || b.status === 'confirmada').reduce((s, b) => s + bookingPrice(b, services), 0),
    bookings: live.length,
    done: done.length,
    noShows,
    noShowRate: done.length + noShows ? noShows / (done.length + noShows) : 0,
    cancelledByClient: inRange.filter(b => b.status === 'cancelada' && b.client_action === 'cancelou').length,
    avgTicket: done.length ? Math.round(revenue / done.length) : 0,
    newClients,
    returningClients: clients.size - newClients,
    byService: rank(b => b.service_id),
    byProfessional: rank(b => b.professional_id),
    byWeekday,
  }
}

/** Completed revenue for each of the last `n` months, oldest first. */
export function monthlyRevenue(all: Booking[], services: Record<string, { price_cents: number }>, tz: string, today: string, n = 6) {
  const [y, m] = today.split('-').map(Number)
  const months = Array.from({ length: n }, (_, i) => {
    const idx = y * 12 + (m - 1) - (n - 1 - i)
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
  })
  const sums = Object.fromEntries(months.map(k => [k, 0]))
  for (const b of all) {
    if (b.status !== 'concluida') continue
    const k = dateInTz(new Date(b.starts_at), tz).slice(0, 7)
    if (k in sums) sums[k] += bookingPrice(b, services)
  }
  return months.map(k => ({ month: k, revenue: sums[k] }))
}
