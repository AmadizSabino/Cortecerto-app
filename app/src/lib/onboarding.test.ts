import { expect, it } from 'vitest'
import { parseEuros, slugify } from './onboarding'

it('slugifies Portuguese names', () => {
  expect(slugify('Barbearia do Zé')).toBe('barbearia-do-ze')
  expect(slugify('  Unhas & Companhia!! ')).toBe('unhas-companhia')
})

it('parses euro amounts with comma or dot', () => {
  expect(parseEuros('12,50')).toBe(1250)
  expect(parseEuros('8')).toBe(800)
  expect(parseEuros('0.5')).toBe(50)
  expect(parseEuros('abc')).toBeNaN()
  expect(parseEuros('-3')).toBeNaN()
})
