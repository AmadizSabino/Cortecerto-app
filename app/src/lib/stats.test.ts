import { expect, it } from 'vitest'
import { computeStats, monthlyRevenue, periodRange } from './stats'
import type { Booking } from './supabase'

let n = 0
const bk = (p: Partial<Booking>): Booking => ({
  id: String(n++), starts_at: '2026-11-10T10:00:00Z', ends_at: '2026-11-10T10:30:00Z', client_name: 'X', client_phone: '912000001',
  consent_messages: false, status: 'concluida', deposit: 'nenhum', service_id: 'corte', professional_id: 'rui', ...p,
})
const services = { corte: { price_cents: 1200 }, barba: { price_cents: 800 } }

it('works out period ranges', () => {
  expect(periodRange('mes', '2026-11-21')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
  expect(periodRange('mes_anterior', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  expect(periodRange('3_meses', '2026-02-10')).toEqual({ from: '2025-12-01', to: '2026-02-28' })
  expect(periodRange('ano', '2026-11-21')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
})

it('counts revenue, no-shows and new versus returning clients', () => {
  const all = [
    bk({ starts_at: '2026-10-05T10:00:00Z', client_phone: '912000001' }),            // before: makes client 1 returning
    bk({ client_phone: '912000001' }),                                                 // done 12 €
    bk({ client_phone: '912000002', service_id: 'barba', price_cents: 1000 }),        // done, own price 10 €
    bk({ client_phone: '912000003', status: 'faltou' }),
    bk({ client_phone: '912000004', status: 'cancelada', client_action: 'cancelou' }),
    bk({ client_phone: '912000005', status: 'confirmada', starts_at: '2026-11-28T10:00:00Z' }),
  ]
  const s = computeStats(all, services, 'Europe/Lisbon', '2026-11-01', '2026-11-30')
  expect(s.revenue).toBe(2200)
  expect(s.expected).toBe(1200)
  expect(s.bookings).toBe(4)
  expect(s.done).toBe(2)
  expect(s.noShows).toBe(1)
  expect(Math.round(s.noShowRate * 100)).toBe(33)
  expect(s.cancelledByClient).toBe(1)
  expect(s.avgTicket).toBe(1100)
  expect(s.newClients).toBe(3)       // 2, 3 and 5
  expect(s.returningClients).toBe(1) // 1
  expect(s.byService.map(r => r.id)).toEqual(['corte', 'barba'])
})

it('sums completed revenue per month', () => {
  const all = [bk({ starts_at: '2026-10-05T10:00:00Z' }), bk({}), bk({ status: 'faltou' })]
  expect(monthlyRevenue(all, services, 'Europe/Lisbon', '2026-11-21', 3)).toEqual([
    { month: '2026-09', revenue: 0 }, { month: '2026-10', revenue: 1200 }, { month: '2026-11', revenue: 1200 },
  ])
})
