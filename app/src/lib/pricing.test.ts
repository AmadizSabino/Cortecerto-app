import { expect, it } from 'vitest'
import { bookingPrice, effective, indexOverrides, priceRange } from './pricing'

const corte = { id: 'corte', price_cents: 1200, duration_min: 30 }
const o = indexOverrides([
  { service_id: 'corte', professional_id: 'rui', offered: true, price_cents: 1500, duration_min: null },
  { service_id: 'corte', professional_id: 'ana', offered: false, price_cents: null, duration_min: null },
  { service_id: 'corte', professional_id: 'joao', offered: true, price_cents: null, duration_min: 45 },
])

it('applies a professional own price or duration, or says they do not do it', () => {
  expect(effective(corte, 'rui', o)).toEqual({ price_cents: 1500, duration_min: 30 })
  expect(effective(corte, 'joao', o)).toEqual({ price_cents: 1200, duration_min: 45 })
  expect(effective(corte, 'ana', o)).toBeNull()
  expect(effective(corte, 'outro', o)).toEqual({ price_cents: 1200, duration_min: 30 })
})

it('gives the price range across the team', () => {
  expect(priceRange(corte, ['rui', 'joao', 'ana'], o)).toEqual({ min: 1200, max: 1500 })
  expect(priceRange(corte, ['ana'], o)).toBeNull()
})

it('prefers the price stored on the booking', () => {
  const services = { corte: { price_cents: 1200 } }
  expect(bookingPrice({ price_cents: 1500, service_id: 'corte' }, services)).toBe(1500)
  expect(bookingPrice({ price_cents: null, service_id: 'corte' }, services)).toBe(1200)
  expect(bookingPrice({ service_id: 'x' }, services)).toBe(0)
})
