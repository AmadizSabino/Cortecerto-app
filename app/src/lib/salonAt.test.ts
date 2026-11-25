import { describe, expect, it } from 'vitest'
import { salonAt } from './salonAt'

describe('where the booking was made', () => {
  it('reads naturally in Portuguese', () => {
    expect(salonAt({ name: 'Barba e Beer', type: 'barbearia' })).toBe('na barbearia Barba e Beer')
    expect(salonAt({ name: 'Barbearia do Zé', type: 'barbearia' })).toBe('na Barbearia do Zé')
    expect(salonAt({ name: 'Salão Rosa', type: 'cabeleireiro' })).toBe('no Salão Rosa')
    expect(salonAt({ name: 'Lux', type: 'unhas' })).toBe('no estúdio Lux')
    expect(salonAt({ name: 'Lux' })).toBe('no salão Lux')
  })
})
