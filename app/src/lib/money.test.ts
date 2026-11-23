import { expect, it } from 'vitest'
import { cleanIban, daysLate, moneySummary, nextPaidUntil } from './money'
import type { Invoice } from './invoices'

let n = 0
const inv = (p: Partial<Invoice>): Invoice => ({
  id: String(n++), salon_id: 's', number: 'FT ' + n, issued_on: '2026-11-01', period: null, amount_cents: 2448, file_path: 'x',
  status: 'por_pagar', due_on: '2026-11-09', paid_on: null, ...p,
})

it('counts days late only for unpaid invoices', () => {
  expect(daysLate(inv({}), '2026-11-23')).toBe(14)
  expect(daysLate(inv({}), '2026-11-05')).toBe(0)
  expect(daysLate(inv({ status: 'paga', paid_on: '2026-11-10' }), '2026-11-23')).toBe(0)
})

it('sums expected, invoiced, collected, outstanding and overdue', () => {
  const salons = [
    { subscription: 'ativa' as const, trial_ends_at: '2026-10-01T00:00:00Z', paid_until: '2026-12-01T00:00:00Z' },
    { subscription: 'experimental' as const, trial_ends_at: '2026-12-10T00:00:00Z', paid_until: null },
  ]
  const m = moneySummary([
    inv({ status: 'paga', paid_on: '2026-11-05' }),
    inv({ issued_on: '2026-11-15', due_on: '2026-11-23' }),
    inv({ issued_on: '2026-10-01', due_on: '2026-10-09' }),
    inv({ status: 'anulada' }),
    inv({ status: 'paga', paid_on: '2026-11-06', request_id: 'r1' }),
  ], salons, '2026-11-23')
  expect(m).toMatchObject({ expectedCents: 2448, invoicedCents: 4896, collectedCents: 2448, outstandingCents: 4896, outstandingCount: 2, overdueCents: 2448, overdueCount: 1 })
  expect(m.ageing.find(a => a.count)?.label).toBe('31–60 d')
  expect(m.months).toHaveLength(6)
  expect(m.months[5]).toEqual({ month: '2026-11', invoicedCents: 4896, collectedCents: 2448 })
  expect(m.months[4]).toEqual({ month: '2026-10', invoicedCents: 2448, collectedCents: 0 })
})

it('moves Pago até one month on, like the database', () => {
  expect(nextPaidUntil({ trial_ends_at: '2026-11-20T10:00:00Z', paid_until: null })?.toISOString()).toBe('2026-12-20T10:00:00.000Z')
  expect(nextPaidUntil({ trial_ends_at: '2026-01-01T00:00:00Z', paid_until: '2026-01-31T10:00:00Z' })?.toISOString()).toBe('2026-02-28T10:00:00.000Z')
})

it('checks a Portuguese IBAN', () => {
  expect(cleanIban('pt50 0002 0123 1234 5678 9015 4')).toBe('PT50000201231234567890154')
  expect(cleanIban('PT50 123')).toBeNull()
  expect(cleanIban('  ')).toBe('')
})
