import { describe, expect, it } from 'vitest'
import { buyerKeys, readyMessage, refillMessage, refillsDue, shopError, shopSales, type Order } from './shop'

const euros = (c: number) => `${(c / 100).toFixed(2).replace('.', ',')} €`
const base: Order = {
  id: 'o1', salon_id: 's', product_id: 'p1', product_name: 'Pomada mate', price_cents: 1500, qty: 1,
  client_name: 'Tiago Silva', client_phone: '912 345 678', pay: 'salao', source: 'online', status: 'entregue',
  note: null, refill_weeks: 6, paid_at: '2026-10-01T10:00:00Z', delivered_at: '2026-10-01T10:00:00Z',
  cancelled_at: null, refill_sent_at: null, created_at: '2026-09-30T10:00:00Z',
}
const o = (p: Partial<Order>): Order => ({ ...base, ...p })

describe('shop sales', () => {
  it('count paid orders in the period, by product', () => {
    const orders = [
      o({ id: 'a', qty: 2 }),
      o({ id: 'b', product_id: 'p2', product_name: 'Óleo', price_cents: 1200, source: 'balcao' }),
      o({ id: 'c', status: 'reservado', paid_at: null }),
      o({ id: 'd', status: 'cancelado' }),
      o({ id: 'e', paid_at: '2026-11-05T10:00:00Z' }),
      o({ id: 'f', status: 'pago', paid_at: '2026-10-02T10:00:00Z' }),
    ]
    const s = shopSales(orders, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z')
    expect(s.revenue).toBe(3000 + 1200 + 1500)
    expect(s.sales).toBe(3)
    expect(s.units).toBe(4)
    expect(s.online).toBe(2)
    expect(s.byProduct.map(r => [r.name, r.count])).toEqual([['Pomada mate', 3], ['Óleo', 1]])
  })
})

describe('buyers', () => {
  it('are clients with a paid purchase, keyed like Clientes', () => {
    const keys = buyerKeys([o({}), o({ client_phone: '+351 913 000 000', status: 'reservado', paid_at: null }), o({ client_phone: '' })])
    expect([...keys]).toEqual(['351912345678'])
  })
})

describe('refills', () => {
  const now = new Date('2026-11-20T10:00:00Z') // 7 weeks after 1 Oct

  it('are due after the product weeks, once per client and product', () => {
    const due = refillsDue([o({ id: 'old', paid_at: '2026-09-01T10:00:00Z' }), o({})], now)
    expect(due.map(d => d.id)).toEqual(['o1'])
    expect(due[0].dueAt.toISOString()).toBe('2026-11-12T10:00:00.000Z')
  })

  it('skip what was reminded, not picked up, without a phone, without refill or not due yet', () => {
    expect(refillsDue([o({ refill_sent_at: '2026-11-15T10:00:00Z' })], now)).toEqual([])
    expect(refillsDue([o({ status: 'pago' })], now)).toEqual([])
    expect(refillsDue([o({ client_phone: '' })], now)).toEqual([])
    expect(refillsDue([o({ refill_weeks: null })], now)).toEqual([])
    expect(refillsDue([o({ refill_weeks: 8 })], now)).toEqual([])
  })

  it('skip a client who bought it again, and stale ones', () => {
    expect(refillsDue([o({}), o({ id: 'again', paid_at: '2026-11-10T10:00:00Z' })], now)).toEqual([])
    expect(refillsDue([o({ paid_at: '2026-01-01T10:00:00Z' })], now)).toEqual([])
  })
})

describe('messages', () => {
  it('refill uses the first name and the shop link', () => {
    expect(refillMessage(base, 'Barba e Beer', 'https://x/s/bb?loja=1')).toBe(
      'Olá Tiago! O/A Pomada mate que levou do Barba e Beer já deve estar a acabar. Quer que lhe guardemos outro para a próxima visita? Pode reservar aqui: https://x/s/bb?loja=1')
  })

  it('reservation tells how to pay', () => {
    expect(readyMessage(o({ status: 'reservado', pay: 'mbway', qty: 2 }), 'BB', '912000000', euros)).toContain('enviar 30,00 € por MB WAY para 912000000')
    expect(readyMessage(o({ status: 'reservado' }), 'BB', null, euros)).toContain('paga 15,00 € quando o levantar')
    expect(readyMessage(o({ status: 'pago', pay: 'mbway' }), 'BB', '912000000', euros)).toContain('já está pago')
  })

  it('errors in the client words', () => {
    expect(shopError('ERROR: produto_esgotado')).toMatch(/esgotou/)
    expect(shopError('??')).toMatch(/Tente de novo/)
  })
})
