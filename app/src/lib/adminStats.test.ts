import { expect, it } from 'vitest'
import { attention, funnel, health, kpis, setupPct, weeklySignups, type AdminSalonRow } from './adminStats'

const now = new Date('2026-11-23T12:00:00Z')
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()
const salon = (p: Partial<AdminSalonRow> = {}): AdminSalonRow => ({
  id: 's', name: 'Barba', slug: 'barba', type: 'barbearia', created_at: ago(40),
  subscription: 'ativa', trial_ends_at: ago(10), paid_until: ago(-20),
  address: null, whatsapp: '912345678', has_logo: true, owner_email: 'a@x.pt', last_sign_in_at: ago(1),
  services: 4, professionals: 2, open_days: 6, team: 1, clients: 30,
  bookings: 80, bookings_30d: 25, online_30d: 10, noshow_30d: 1, value_30d_cents: 30000,
  first_booking_at: ago(38), first_online_at: ago(35), last_booking_at: ago(0),
  walkins_30d: 0, promotions: 0, packs: 0, ai_30d: 0, ...p,
})

it('scores a busy, paying salon as healthy', () => {
  expect(health(salon(), now)).toMatchObject({ score: 100, level: 'boa', reasons: [] })
})

it('flags a quiet salon at risk, but not a brand new one', () => {
  const quiet = salon({ last_sign_in_at: ago(30), bookings_30d: 0, online_30d: 0, services: 0 })
  expect(health(quiet, now).level).toBe('risco')
  expect(health(quiet, now).reasons).toContain('Sem entrar há 30 dias')
  expect(health({ ...quiet, created_at: ago(2) }, now).level).toBe('nova')
})

it('works out setup progress', () => {
  expect(setupPct(salon())).toBe(100)
  expect(setupPct(salon({ has_logo: false, whatsapp: null }))).toBe(60)
})

it('counts MRR, trials and trial conversion', () => {
  const k = kpis([
    salon(),
    salon({ id: 't', subscription: 'experimental', trial_ends_at: ago(-5), paid_until: null, created_at: ago(25) }),
    salon({ id: 'u', subscription: 'experimental', trial_ends_at: ago(3), paid_until: null }),
  ], now)
  expect(k).toMatchObject({ salons: 3, paying: 1, mrrCents: 1990, trial: 1, trialsEnding7: 1, unpaid: 1, locked: 0, bookings30: 75 })
  expect(k.trialConversion).toBe(0.5)
})

it('builds the funnel from sign-up to paying', () => {
  const f = funnel([salon(), salon({ id: 'n', services: 0, first_booking_at: null, first_online_at: null, subscription: 'experimental', paid_until: null })])
  expect(f.map(s => s.count)).toEqual([2, 1, 1, 1, 1])
})

it('lists what needs attention, urgent first', () => {
  const list = attention([
    salon({ id: 'a', name: 'Parada', created_at: ago(20), last_sign_in_at: ago(20) }),
    salon({ id: 'b', name: 'Fim', subscription: 'experimental', paid_until: null, trial_ends_at: ago(-2), created_at: ago(28) }),
    salon({ id: 'c', name: 'Devedor', subscription: 'experimental', paid_until: null, trial_ends_at: ago(4) }),
    salon({ id: 'd', name: 'Bloqueado', subscription: 'experimental', paid_until: null, trial_ends_at: ago(20) }),
  ], now)
  expect(list.slice(0, 3).map(a => a.salon).sort()).toEqual(['Bloqueado', 'Devedor', 'Fim'])
  expect(list.find(a => a.salon === 'Devedor')?.text).toBe('Por pagar · bloqueia em 10 d')
  expect(list[list.length - 1]).toMatchObject({ salon: 'Parada', text: 'O dono não entra há 20 dias', severity: 'media' })
})

it('counts sign-ups per week', () => {
  const w = weeklySignups([salon({ created_at: '2026-11-23T09:00:00Z' }), salon({ created_at: '2026-11-17T09:00:00Z' }), salon({ created_at: '2026-01-01T09:00:00Z' })], now)
  expect(w).toHaveLength(12)
  expect(w[w.length - 1]).toEqual({ week: '2026-11-23', count: 1 })
  expect(w[w.length - 2]).toEqual({ week: '2026-11-16', count: 1 })
  expect(w.reduce((t, x) => t + x.count, 0)).toBe(2)
})
