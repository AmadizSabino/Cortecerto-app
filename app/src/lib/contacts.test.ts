import { describe, expect, it } from 'vitest'
import { cleanContacts, inviteText } from './contacts'

describe('contacts', () => {
  it('keeps one mobile number per contact and drops repeats', () => {
    expect(cleanContacts([
      { name: ['Rui Almeida'], tel: ['21 123 4567', '+351 912 345 678'] },
      { name: ['Rui (outro)'], tel: ['912345678'] },
      { name: ['Sem número'], tel: [] },
      { tel: ['934 000 000'] },
    ])).toEqual([
      { name: 'Rui Almeida', phone: '+351 912 345 678' },
      { name: 'Cliente', phone: '934 000 000' },
    ])
  })
  it('invitation text', () => {
    expect(inviteText('Ana Sousa', 'Barbearia do Bairro', 'https://x/s/b')).toBe('Olá Ana! O Barbearia do Bairro já tem marcações online. Escolha o dia e a hora aqui, em segundos: https://x/s/b')
    expect(inviteText('Cliente', 'B', 'L')).toMatch(/^Olá! /)
  })
})
