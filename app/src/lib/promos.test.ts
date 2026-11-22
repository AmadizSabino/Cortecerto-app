import { describe, expect, it } from 'vitest'
import { applies, codeFrom, easter, fillPhrase, hashtags, offerText, occasions, promoPrice, upcoming, whenText, type Promo } from './promos'

const promo: Promo = {
  id: 'p', salon_id: 's', code: 'tardes', title: 'Tardes', message: '', kind: 'percentagem', percent: 20, amount_cents: null, gift: null,
  service_ids: ['corte'], weekdays: [2, 4], time_from: '14:00:00', time_to: '17:00:00', starts_on: '2026-11-20', ends_on: '2026-11-30',
  active: true, image_path: null, created_at: '',
}
const tz = 'Europe/Lisbon'

describe('promos', () => {
  it('applies on its days, hours, services and dates (salon time)', () => {
    expect(applies(promo, 'corte', new Date('2026-11-24T15:00:00Z'), tz)).toBe(true) // Tuesday 15:00 Lisbon
    expect(applies(promo, 'corte', new Date('2026-11-24T17:00:00Z'), tz)).toBe(false) // ends at 17:00
    expect(applies(promo, 'corte', new Date('2026-11-25T15:00:00Z'), tz)).toBe(false) // Wednesday
    expect(applies(promo, 'barba', new Date('2026-11-24T15:00:00Z'), tz)).toBe(false)
    expect(applies(promo, 'corte', new Date('2026-12-01T15:00:00Z'), tz)).toBe(false) // after ends_on
    expect(applies({ ...promo, weekdays: null, time_from: null, time_to: null, service_ids: null }, 'barba', new Date('2026-11-25T09:00:00Z'), tz)).toBe(true)
  })
  it('price and texts', () => {
    expect(promoPrice(promo, 1250)).toBe(1000)
    expect(promoPrice({ kind: 'montante', percent: null, amount_cents: 2000 }, 1500)).toBe(0)
    expect(offerText(promo)).toBe('-20%')
    expect(offerText({ kind: 'montante', percent: null, amount_cents: 500, gift: null })).toBe('-5 €')
    expect(whenText(promo, '2026-11-22')).toBe('Terças e quintas, 14h–17h, até 30 de novembro')
    expect(whenText({ weekdays: null, time_from: null, time_to: null, starts_on: '2026-11-01', ends_on: null }, '2026-11-22')).toBe('Todos os dias')
    expect(codeFrom('Tardes -20% Ação')).toBe('tardes-20-acao')
  })
  it('Portuguese dates', () => {
    expect(easter(2026)).toBe('2026-04-05')
    expect(easter(2027)).toBe('2027-03-28')
    const y = occasions(2026, 'barbearia')
    expect(y.find(o => o.name === 'Dia da Mãe')!.date).toBe('2026-05-03')
    expect(y.find(o => o.name === 'Corpo de Deus')!.date).toBe('2026-06-04')
    expect(y.find(o => o.name === 'Carnaval')!.date).toBe('2026-02-17')
    expect(y.find(o => o.name === 'Black Friday')!.date).toBe('2026-11-27')
    expect(upcoming('2026-11-22', 'unhas', 40).map(o => o.name)).toEqual(['Black Friday', 'Restauração da Independência', 'Época de Natal', 'Imaculada Conceição', 'Natal', 'Passagem de ano', 'Ano Novo'])
  })
  it('phrases and hashtags', () => {
    expect(fillPhrase('{oferta} · {quando} em {salao}: {link}', { oferta: '-20%', quando: 'Terças', salao: 'Barb', link: 'L' })).toBe('-20% · Terças em Barb: L')
    expect(hashtags('barbearia', 'Rua X, Setúbal')).toBe('#barbearia #barbeiro #degrade #barba #setubal #barbeariasetubal #portugal')
  })
})
