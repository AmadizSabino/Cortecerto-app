import { describe, expect, it } from 'vitest'
import { commissionFor, commissions, parsePay, payLabel, type Pay } from './commission'
import type { Booking } from './supabase'

const pct: Pay = { professional_id: 'rui', commission_type: 'percentagem', commission_percent: 40, commission_cents: null }
const fixed: Pay = { professional_id: 'ana', commission_type: 'montante', commission_percent: null, commission_cents: 500 }
const eur = (c: number) => `${(c / 100).toFixed(2).replace('.', ',')} €`

const b = (id: string, pro: string, status: Booking['status'], starts_at: string, price: number): Booking => ({
  id, professional_id: pro, status, starts_at, ends_at: starts_at, price_cents: price, service_id: 's',
  client_name: 'x', client_phone: '912345678', consent_messages: false, deposit: 'nenhum',
})

describe('commission', () => {
  it('percentage and fixed amount per visit', () => {
    expect(commissionFor(pct, 1250)).toBe(500)
    expect(commissionFor(fixed, 1250)).toBe(500)
    expect(commissionFor(undefined, 1250)).toBe(0)
  })
  it('only completed visits in the period count', () => {
    const list = [
      b('1', 'rui', 'concluida', '2026-11-02T10:00:00Z', 1500),
      b('2', 'rui', 'faltou', '2026-11-03T10:00:00Z', 1500),
      b('3', 'ana', 'concluida', '2026-11-04T10:00:00Z', 2000),
      b('4', 'ana', 'concluida', '2026-12-01T10:00:00Z', 2000),
    ]
    const r = commissions(list, { rui: pct, ana: fixed }, {}, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z')
    expect(r.rui).toEqual({ visits: 1, revenue: 1500, commission: 600 })
    expect(r.ana).toEqual({ visits: 1, revenue: 2000, commission: 500 })
  })
  it('reads the form', () => {
    expect(parsePay('percentagem', '40,5')).toEqual({ percent: 40.5, cents: null })
    expect(parsePay('montante', '5,50')).toEqual({ percent: null, cents: 550 })
    expect(parsePay('percentagem', '120')).toBe('A percentagem vai de 0 a 100.')
    expect(parsePay('montante', '')).toBe('Indique um valor válido.')
    expect(parsePay('nenhuma', '')).toEqual({ percent: null, cents: null })
  })
  it('labels', () => {
    expect(payLabel(pct, eur)).toBe('40 % por visita')
    expect(payLabel(fixed, eur)).toBe('5,00 € por visita')
    expect(payLabel(undefined, eur)).toBe('Sem comissão')
  })
})
