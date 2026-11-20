import { expect, it } from 'vitest'
import { waLink } from './whatsapp'

it('adds the Portuguese country code and encodes the text', () => {
  expect(waLink('912 345 678', 'Olá, até já!')).toBe('https://wa.me/351912345678?text=Ol%C3%A1%2C%20at%C3%A9%20j%C3%A1!')
  expect(waLink('+351 912345678', 'x')).toBe('https://wa.me/351912345678?text=x')
})
