import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cardById, cardImage, cardsFor, salonTypes, STYLE_CARDS } from './styleCatalog'
import { STYLE_PRESETS } from './styles'

describe('style cards', () => {
  it('have unique ids the database accepts (migration 0030)', () => {
    const ids = STYLE_CARDS.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,60}$/)
  })

  it('use the same names as the try-on styles', () => {
    const presets = new Set(Object.values(STYLE_PRESETS).flat())
    for (const c of STYLE_CARDS) expect(presets, c.name).toContain(c.name)
  })

  it('each have a photo and the texts both sides need', () => {
    for (const c of STYLE_CARDS) {
      expect(existsSync(join(__dirname, '../../public', cardImage(c))), c.id).toBe(true)
      expect(c.about && c.suits && c.upkeep && c.tools, c.id).toBeTruthy()
      expect(c.steps.length, c.id).toBeGreaterThanOrEqual(3)
      expect(c.minutes, c.id).toBeGreaterThan(0)
      expect(c.types.length, c.id).toBeGreaterThan(0)
    }
  })

  it('show the styles of every kind of work the salon does, minus the hidden ones', () => {
    const barber = cardsFor('barbearia')
    expect(barber.length).toBeGreaterThan(10)
    expect(barber.every(c => c.types.includes('barbearia'))).toBe(true)
    expect(cardsFor('barbearia', ['low-fade']).some(c => c.id === 'low-fade')).toBe(false)
    const both = cardsFor(salonTypes({ type: 'cabeleireiro', areas: ['unhas'] }))
    expect(both.some(c => c.id === 'bob') && both.some(c => c.id === 'gel-nude')).toBe(true)
    expect(cardsFor('massagem')).toEqual([])
    expect(cardById('mid-fade')?.name).toBe('Mid fade')
    expect(cardById(null)).toBeUndefined()
  })
})
