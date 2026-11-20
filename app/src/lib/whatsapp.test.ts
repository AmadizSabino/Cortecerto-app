import { expect, it } from 'vitest'
import { formatPhone, waLink } from './whatsapp'

it('adds the Portuguese country code and encodes the text', () => {
  expect(waLink('912 345 678', 'Olá, até já!')).toBe('https://wa.me/351912345678?text=Ol%C3%A1%2C%20at%C3%A9%20j%C3%A1!')
  expect(waLink('+351 912345678', 'x')).toBe('https://wa.me/351912345678?text=x')
})

it('handles the 00 international prefix and formats Portuguese numbers', () => {
  expect(waLink('00351965738127', 'x')).toBe('https://wa.me/351965738127?text=x')
  expect(formatPhone('00351965738127')).toBe('+351 965 738 127')
  expect(formatPhone('965738127')).toBe('+351 965 738 127')
  expect(formatPhone('+44 7700 900123')).toBe('+447700900123')
})
