import { describe, expect, it } from 'vitest'
import { feesFor, homeQuote, onTheWay, widen, zoneFor, type HomeFee, type Zone } from './home'
import { comboTotals, depositFor, eventEstimate, eventMilestones, priceLabel, type PackageItem } from './packages'

const tz = 'Europe/Lisbon'
const zones: Zone[] = [
  { id: 'z1', name: 'Setúbal', postcodes: ['2900', '2910'], fee_cents: 800, travel_min: 20, position: 0, active: true },
  { id: 'z2', name: 'Lisboa', postcodes: ['1000'], fee_cents: 1500, travel_min: 45, position: 1, active: false },
]
const fees: HomeFee[] = [
  { id: 'f1', label: 'Antes das 9h', rule: 'antes_das', at: '09:00:00', amount_cents: 500, active: true },
  { id: 'f2', label: 'Fim de semana', rule: 'fim_de_semana', at: null, amount_cents: 300, active: true },
  { id: 'f3', label: 'Estacionamento', rule: 'sempre', at: null, amount_cents: 200, active: false },
]

describe('home visits', () => {
  it('zone by postcode, active zones only', () => {
    expect(zoneFor('2910-001', zones)?.name).toBe('Setúbal')
    expect(zoneFor('1000-100', zones)).toBeNull()
    expect(zoneFor('29', zones)).toBeNull()
  })
  it('fees by time and day (salon time)', () => {
    expect(feesFor(fees, new Date('2026-11-28T08:30:00Z'), tz).map(f => f.id)).toEqual(['f1', 'f2']) // Saturday 08:30
    expect(feesFor(fees, new Date('2026-11-25T10:00:00Z'), tz)).toEqual([]) // Wednesday 10:00
  })
  it('quote line by line', () => {
    const q = homeQuote({ servicesCents: 2000, zone: zones[0], fees, start: new Date('2026-11-28T08:30:00Z'), tz })
    expect(q.lines.map(l => l.label)).toEqual(['Serviço', 'Deslocação (Setúbal)', 'Antes das 9h', 'Fim de semana'])
    expect(q.total).toBe(3600)
  })
  it('widens busy times by the travel time', () => {
    const w = widen([{ start: new Date('2026-11-25T10:00:00Z'), end: new Date('2026-11-25T10:30:00Z') }], 20)
    expect(w[0].start.toISOString()).toBe('2026-11-25T09:40:00.000Z')
    expect(w[0].end.toISOString()).toBe('2026-11-25T10:50:00.000Z')
    expect(onTheWay('Ana Sousa', 'Unhas da Rita', 15)).toBe('Olá Ana! Daqui é do Unhas da Rita: estou a caminho e chego dentro de cerca de 15 minutos.')
  })
})

describe('packages', () => {
  const services = { corte: { id: 'corte', name: 'Corte', duration_min: 30, price_cents: 1500 }, barba: { id: 'barba', name: 'Barba', duration_min: 20, price_cents: 1000 }, pele: { id: 'pele', name: 'Limpeza de pele', duration_min: 60, price_cents: 3500 } }
  const items: PackageItem[] = [
    { id: 'i1', package_id: 'k', service_id: 'corte', optional: false, extra_price_cents: null, position: 0 },
    { id: 'i2', package_id: 'k', service_id: 'barba', optional: false, extra_price_cents: null, position: 1 },
    { id: 'i3', package_id: 'k', service_id: 'pele', optional: true, extra_price_cents: 2500, position: 2 },
  ]
  it('combo: price, time and saving with extras', () => {
    expect(comboTotals({ price_cents: 2000 }, items, services, [])).toEqual({ minutes: 50, price: 2000, names: ['Corte', 'Barba'], saving: 500 })
    expect(comboTotals({ price_cents: 2000 }, items, services, ['i3'])).toMatchObject({ minutes: 110, price: 4500 })
  })
  it('event estimate, deposit and milestones', () => {
    expect(eventEstimate({ price_cents: 18000, per_guest_cents: 4500 }, 3, items, services, ['i3'])).toBe(18000 + 13500 + 2500)
    expect(depositFor(34000, 30)).toBe(10200)
    const m = eventMilestones(new Date('2027-06-12T08:00:00Z'), new Date('2027-05-01T10:00:00Z'), new Date('2027-06-06T00:00:00Z'))
    expect(m.map(x => [x.label.split(' ')[0], x.done])).toEqual([['Prova', true], ['Confirmar', true], ['Lembrete', false], ['O', false]])
  })
  it('price labels', () => {
    const eur = (c: number) => `${c / 100} €`
    expect(priceLabel({ mode: 'evento', price_cents: 18000, per_guest_cents: 4500, sessions: null }, eur)).toBe('a partir de 180 € + 45 €/pessoa')
    expect(priceLabel({ mode: 'pack', price_cents: 12000, per_guest_cents: null, sessions: 6 }, eur)).toBe('6 sessões · 120 €')
  })
})
