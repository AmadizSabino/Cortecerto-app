import { describe, expect, it } from 'vitest'
import { addMonth, benefitList, memberState, monthlyRevenue, renewedUntil } from './club'

describe('club', () => {
  it('adds a month, keeping the day when it exists', () => {
    expect(addMonth('2026-11-21')).toBe('2026-12-21')
    expect(addMonth('2026-01-31')).toBe('2026-02-28')
    expect(addMonth('2026-12-15')).toBe('2027-01-15')
  })
  it('renews from the end of the period, or from today when lapsed', () => {
    expect(renewedUntil('2026-12-01', '2026-11-21')).toBe('2027-01-01')
    expect(renewedUntil('2026-10-01', '2026-11-21')).toBe('2026-12-21')
    expect(renewedUntil(null, '2026-11-21')).toBe('2026-12-21')
  })
  it('member state', () => {
    expect(memberState({ status: 'ativo', paid_until: '2026-11-20' }, '2026-11-21')).toBe('por_pagar')
    expect(memberState({ status: 'ativo', paid_until: '2026-11-21' }, '2026-11-21')).toBe('em_dia')
    expect(memberState({ status: 'pedido', paid_until: null }, '2026-11-21')).toBe('pedido')
  })
  it('monthly revenue counts active members only', () => {
    expect(monthlyRevenue([{ status: 'ativo', price_cents: 3500 }, { status: 'pedido', price_cents: 3500 }, { status: 'ativo', price_cents: 3000 }])).toBe(6500)
  })
  it('benefits list', () => {
    expect(benefitList('Cortes ilimitados\n10% na loja, sem sinal')).toEqual(['Cortes ilimitados', '10% na loja', 'sem sinal'])
  })
})
