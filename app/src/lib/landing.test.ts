import { expect, it } from 'vitest'
import { noShowCost, parseNumber } from './landing'

it('works out what no-shows cost a month and what half of them is worth', () => {
  const r = noShowCost(3, 1500, 2448)
  expect(r.lostCents).toBe(19500)
  expect(r.savedCents).toBe(9750)
  expect(r.paysFor).toBeCloseTo(3.98, 2)
  expect(noShowCost(NaN, 1500, 2448).lostCents).toBe(0)
  expect(noShowCost(-1, 1500, 2448).lostCents).toBe(0)
})

it('reads numbers written the Portuguese way', () => {
  expect(parseNumber('3')).toBe(3)
  expect(parseNumber('12,50')).toBe(12.5)
  expect(parseNumber('abc')).toBeNaN()
  expect(parseNumber('')).toBeNaN()
})
