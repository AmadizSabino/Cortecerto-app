import { describe, expect, it } from 'vitest'
import { styleOptions } from './styles'

describe('styleOptions', () => {
  it('puts the services first and adds the presets without repeats', () => {
    const list = styleOptions('barbearia', ['Corte', 'low fade'])
    expect(list.slice(0, 2)).toEqual(['Corte', 'low fade'])
    expect(list).toContain('Pompadour')
    expect(list.filter(s => s.toLowerCase() === 'low fade')).toHaveLength(1)
  })
  it('works for a salon type without presets', () => {
    expect(styleOptions('massagem', ['Massagem'])).toEqual(['Massagem'])
  })
})
