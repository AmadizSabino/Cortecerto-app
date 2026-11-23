import { expect, it } from 'vitest'
import { addMonths, amounts, coveredPeriod, firstOfMonth } from './paymentRequest'

it('works out the amounts with IVA', () => {
  expect(amounts()).toEqual({ net: 1990, vat: 458, total: 2448 })
})

it('covers the month after Pago até, or after the free period', () => {
  const p = coveredPeriod({ trial_ends_at: '2026-11-20T23:59:59Z', paid_until: null })!
  expect(p.from.toISOString()).toBe('2026-11-20T23:59:59.000Z')
  expect(p.to.toISOString()).toBe('2026-12-19T23:59:59.000Z')
  expect(coveredPeriod({ trial_ends_at: '2026-10-01T00:00:00Z', paid_until: '2027-01-31T12:00:00Z' })!.to.toISOString()).toBe('2027-02-27T12:00:00.000Z')
})

it('steps months', () => {
  expect(firstOfMonth('2026-11-23')).toBe('2026-11-01')
  expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
})
