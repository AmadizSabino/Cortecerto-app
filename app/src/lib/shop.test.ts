import { describe, expect, it } from 'vitest'
import { buyerKeys, heldUnits, lowStock, performance, readyMessage, refillMessage, refillsDue, shopError, shopSales, stockLeft, weeksText, type Order, type Product } from './shop'

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

describe('stock', () => {
  const prod = (p: Partial<Product>): Product => ({ id: 'p1', salon_id: 's', name: 'Pomada mate', description: null, price_cents: 1500, photo_path: null,
    pay: 'salao', refill_weeks: 6, sold_out: false, active: true, position: 0, created_at: '2026-06-01T10:00:00Z', stock: 5, low_stock: 2, ...p })
  const now = new Date('2026-11-20T10:00:00Z')

  it('holds units for open reservations', () => {
    const held = heldUnits([o({ status: 'reservado', qty: 2 }), o({ status: 'pago' }), o({ status: 'entregue' }), o({ status: 'reservado', product_id: null })])
    expect(held.get('p1')).toBe(3)
    expect(stockLeft(prod({}), held)).toBe(2)
    expect(stockLeft(prod({ stock: 1 }), held)).toBe(0)
    expect(stockLeft(prod({ stock: null }), held)).toBeNull()
  })

  it('warns at the low level, fewest first', () => {
    const held = new Map([['p1', 3]])
    const list = lowStock([prod({}), prod({ id: 'p2', name: 'Óleo', stock: 0 }), prod({ id: 'p3', stock: 10 }), prod({ id: 'p4', stock: null }), prod({ id: 'p5', stock: 0, active: false })], held)
    expect(list.map(p => [p.id, p.left])).toEqual([['p2', 0], ['p1', 2]])
  })

  it('measures each product: pace, weeks left and idle ones', () => {
    const orders = [o({ paid_at: '2026-11-10T10:00:00Z', qty: 2 }), o({ id: 'x', paid_at: '2026-09-01T10:00:00Z', qty: 4 }), o({ id: 'y', paid_at: '2026-05-01T10:00:00Z' })]
    const [a, b] = performance([prod({ stock: 6 }), prod({ id: 'p2', name: 'Óleo', stock: null })], orders, new Map(), now)
    expect([a.units30, a.units90, a.revenue90]).toEqual([2, 6, 9000])
    expect(a.weeksLeft).toBe(12.9) // 6 left at 6 per 90 days
    expect(a.idle).toBe(false)
    expect(b.idle).toBe(true)
    expect(weeksText(0.5)).toBe('menos de 1 semana')
    expect(weeksText(12.9)).toBe('cerca de 13 semanas')
  })
})
