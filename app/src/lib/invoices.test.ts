import { describe, expect, it } from 'vitest'
import { parseAmount } from './invoices'

describe('parseAmount', () => {
  it('reads euros written the Portuguese or English way', () => {
    expect(parseAmount('24,48')).toBe(2448)
    expect(parseAmount('24.48 €')).toBe(2448)
    expect(parseAmount('19')).toBe(1900)
  })
  it('refuses what is not an amount', () => {
    expect(parseAmount('')).toBeNaN()
    expect(parseAmount('abc')).toBeNaN()
    expect(parseAmount('1,234')).toBeNaN()
  })
})
