import { waNumber } from './whatsapp'

/**
 * The salon's shop ("Loja", migration 0032): products the salon sells, reserved by clients on the
 * booking page or sold at the counter. The money goes straight to the salon: in the salon when the
 * client picks it up, or by MB WAY to the salon's number first. The salon chooses per product.
 */

export type ProductPay = 'salao' | 'mbway'

export interface Product {
  id: string
  salon_id: string
  name: string
  description: string | null
  price_cents: number
  photo_path: string | null
  pay: ProductPay
  refill_weeks: number | null
  sold_out: boolean
  active: boolean
  position: number
  created_at: string
}

export type OrderStatus = 'reservado' | 'pago' | 'entregue' | 'cancelado'

export interface Order {
  id: string
  salon_id: string
  product_id: string | null
  product_name: string
  price_cents: number
  qty: number
  client_name: string
  client_phone: string
  pay: ProductPay
  source: 'online' | 'balcao'
  status: OrderStatus
  note: string | null
  refill_weeks: number | null
  paid_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  refill_sent_at: string | null
  created_at: string
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  reservado: 'Por levantar', pago: 'Pago, por levantar', entregue: 'Entregue', cancelado: 'Cancelado',
}

export const PAY_LABEL: Record<ProductPay, string> = {
  salao: 'Paga no salão ao levantar',
  mbway: 'Paga antes por MB WAY',
}

/** Choices for "Lembrar a reposição": weeks after the purchase. */
export const REFILL_CHOICES = [4, 6, 8, 12] as const
export const DEFAULT_REFILL_WEEKS = 6

/** Errors from reserve_product, in the client's words. */
export const SHOP_ERRORS: Record<string, string> = {
  produto_invalido: 'Este produto já não está à venda.',
  produto_esgotado: 'Este produto esgotou entretanto. Pergunte ao salão quando volta a haver.',
  dados_cliente: 'Indique o seu nome e um telemóvel válido.',
  quantidade_invalida: 'Escolha entre 1 e 10 unidades.',
  reservas_a_mais: 'Já tem 5 reservas por levantar neste salão. Levante-as primeiro ou fale com o salão.',
  salao_bloqueado: 'De momento não é possível reservar por aqui. Fale diretamente com o salão.',
}

export function shopError(message: string): string {
  const key = Object.keys(SHOP_ERRORS).find(k => message.includes(k))
  return key ? SHOP_ERRORS[key] : 'Não foi possível reservar. Tente de novo.'
}

export const orderTotal = (o: Pick<Order, 'price_cents' | 'qty'>) => o.price_cents * o.qty

/** Paid: counts as a sale from paid_at. */
export const isSale = (o: Pick<Order, 'status' | 'paid_at'>) => (o.status === 'pago' || o.status === 'entregue') && Boolean(o.paid_at)
export const isOpen = (o: Pick<Order, 'status'>) => o.status === 'reservado' || o.status === 'pago'

/** Sales between two instants (ISO, end excluded): money, number of sales and units, best sellers. */
export function shopSales(orders: Order[], fromIso: string, toIso: string) {
  const from = new Date(fromIso).getTime(), to = new Date(toIso).getTime()
  const inRange = orders.filter(o => {
    if (!isSale(o)) return false
    const t = new Date(o.paid_at!).getTime()
    return t >= from && t < to
  })
  const byProduct = new Map<string, { id: string; name: string; revenue: number; count: number }>()
  for (const o of inRange) {
    const id = o.product_id ?? `nome:${o.product_name}`
    const r = byProduct.get(id) ?? { id, name: o.product_name, revenue: 0, count: 0 }
    r.revenue += orderTotal(o); r.count += o.qty
    byProduct.set(id, r)
  }
  return {
    revenue: inRange.reduce((s, o) => s + orderTotal(o), 0),
    sales: inRange.length,
    units: inRange.reduce((s, o) => s + o.qty, 0),
    online: inRange.filter(o => o.source === 'online').length,
    byProduct: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name)),
  }
}

/** Phone keys (as in Clientes) of everyone who bought something in the shop. */
export function buyerKeys(orders: Pick<Order, 'client_phone' | 'status' | 'paid_at'>[]): Set<string> {
  const keys = new Set<string>()
  for (const o of orders) if (isSale(o) && o.client_phone) keys.add(waNumber(o.client_phone))
  return keys
}

const WEEK_MS = 7 * 86_400_000
/** A refill message is offered until this many weeks after it was due; after that it is stale. */
export const REFILL_WINDOW_WEEKS = 8

/**
 * Purchases whose refill time has come: delivered, with a client phone, the product's refill weeks
 * passed since it was paid, not reminded yet, and the client hasn't bought that product again since.
 * One per client and product (the latest purchase). Oldest due first.
 */
export function refillsDue(orders: Order[], now = new Date()): (Order & { dueAt: Date })[] {
  const latest = new Map<string, Order>()
  for (const o of orders) {
    if (!isSale(o) || !o.client_phone) continue
    const key = `${waNumber(o.client_phone)}|${o.product_id ?? o.product_name}`
    const prev = latest.get(key)
    if (!prev || new Date(o.paid_at!) > new Date(prev.paid_at!)) latest.set(key, o)
  }
  const due: (Order & { dueAt: Date })[] = []
  for (const o of latest.values()) {
    if (o.status !== 'entregue' || !o.refill_weeks || o.refill_sent_at) continue
    const dueAt = new Date(new Date(o.paid_at!).getTime() + o.refill_weeks * WEEK_MS)
    const age = now.getTime() - dueAt.getTime()
    if (age >= 0 && age <= REFILL_WINDOW_WEEKS * WEEK_MS) due.push({ ...o, dueAt })
  }
  return due.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
}

const first = (name: string) => name.trim().split(/\s+/)[0] || name

/** The one-tap WhatsApp when it may be running out. */
export function refillMessage(o: Pick<Order, 'client_name' | 'product_name'>, salonName: string, shopLink: string): string {
  return `Olá ${first(o.client_name)}! O/A ${o.product_name} que levou do ${salonName} já deve estar a acabar. Quer que lhe guardemos outro para a próxima visita? Pode reservar aqui: ${shopLink}`
}

/** WhatsApp to the client about their reservation. */
export function readyMessage(o: Pick<Order, 'client_name' | 'product_name' | 'qty' | 'price_cents' | 'pay' | 'status'>, salonName: string, mbway: string | null, euros: (c: number) => string): string {
  const what = `${o.qty > 1 ? `${o.qty} × ` : ''}${o.product_name}`
  const owes = o.pay === 'mbway' && o.status === 'reservado' && mbway
    ? ` Pode enviar ${euros(orderTotal(o))} por MB WAY para ${mbway} e levantar na próxima visita.`
    : ` Fica à sua espera no salão${o.status === 'pago' ? ', já está pago' : `: paga ${euros(orderTotal(o))} quando o levantar`}.`
  return `Olá ${first(o.client_name)}! Recebemos a sua reserva: ${what}.${owes} Obrigado! ${salonName}`
}

/** The shop on the client page: /s/<slug>?loja=1. */
export const shopLink = (origin: string, slug: string) => `${origin}/s/${slug}?loja=1`
