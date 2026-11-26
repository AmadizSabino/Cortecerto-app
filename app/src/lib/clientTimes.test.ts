import { describe, expect, it } from 'vitest'
import { clientMinutes, describeTime, minuteOptions } from './clientTimes'

describe('client times', () => {
  it('own time for the service wins, else usual plus extra', () => {
    const rows = [{ service_id: 'corte', minutes: 60 }, { service_id: null, minutes: 15 }]
    expect(clientMinutes(rows, 'corte', 30)).toBe(60)
    expect(clientMinutes(rows, 'barba', 20)).toBe(35)
    expect(clientMinutes([], 'barba', 20)).toBe(20)
  })
  it('describes them in plain words', () => {
    const s = { corte: { name: 'Corte', duration_min: 30 } }
    expect(describeTime({ id: '1', phone_key: 'x', service_id: 'corte', minutes: 60 }, s)).toBe('Corte: 60 min (normal 30)')
    expect(describeTime({ id: '2', phone_key: 'x', service_id: null, minutes: 15 }, s)).toBe('+15 min em todos os serviços')
  })
  it('offers sensible lengths, including the usual one', () => {
    const o = minuteOptions(35)
    expect(o).toContain(35)
    expect(o).toContain(75)
    expect(o[o.length - 1]).toBe(240)
    expect(Math.max(...minuteOptions(null))).toBe(120)
  })
})
