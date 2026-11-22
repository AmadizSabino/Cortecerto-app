import { describe, expect, it } from 'vitest'
import { candidates, offerMessage, usableWindow, type SlotBooking } from './freeSlot'

const now = new Date('2026-11-23T10:02:00Z')
let n = 0
const b = (p: Partial<SlotBooking>): SlotBooking => ({
  id: String(++n), professional_id: 'ana', service_id: 's', starts_at: '2026-11-23T15:00:00Z', ends_at: '2026-11-23T15:30:00Z',
  status: 'confirmada', client_name: 'Cliente', client_phone: `9120000${String(n).padStart(2, '0')}`, consent_messages: false, ...p,
})
const window = { start: new Date('2026-11-23T11:00:00Z'), minutes: 45 }
const dayEnd = new Date('2026-11-24T00:00:00Z')

describe('free slot', () => {
  it('usable window starts now when the slot already began, and needs 10 minutes', () => {
    const w = usableWindow(new Date('2026-11-23T10:00:00Z'), new Date('2026-11-23T10:45:00Z'), now)!
    expect(w.start.toISOString()).toBe('2026-11-23T10:05:00.000Z')
    expect(w.minutes).toBe(40)
    expect(usableWindow(new Date('2026-11-23T09:30:00Z'), new Date('2026-11-23T10:10:00Z'), now)).toBeNull()
  })

  it('orders: later today, then asked for earlier, then regulars due back with consent', () => {
    const all = [
      b({ client_name: 'Rui Hoje', starts_at: '2026-11-23T16:00:00Z', ends_at: '2026-11-23T16:30:00Z' }),
      b({ client_name: 'Longo', starts_at: '2026-11-23T17:00:00Z', ends_at: '2026-11-23T18:00:00Z' }), // 60 min: doesn't fit
      b({ client_name: 'Outro Pro', professional_id: 'rui', starts_at: '2026-11-23T16:00:00Z', ends_at: '2026-11-23T16:30:00Z' }),
      b({ client_name: 'Quer Cedo', starts_at: '2026-11-26T12:00:00Z', ends_at: '2026-11-26T12:30:00Z', wants_earlier: true }),
      b({ client_name: 'Sem Pedido', starts_at: '2026-11-27T12:00:00Z', ends_at: '2026-11-27T12:30:00Z' }),
      // a regular: visits every ~21 days, last one 25 days ago, agreed to messages
      b({ client_name: 'Habitual', client_phone: '934111111', status: 'concluida', starts_at: '2026-09-27T10:00:00Z', ends_at: '2026-09-27T10:30:00Z' }),
      b({ client_name: 'Habitual', client_phone: '934111111', status: 'concluida', starts_at: '2026-10-18T10:00:00Z', ends_at: '2026-10-18T10:30:00Z', consent_messages: true, created_at: '2026-10-10T10:00:00Z' }),
      // a regular without consent is left out
      b({ client_name: 'Sem Consentimento', client_phone: '934222222', status: 'concluida', starts_at: '2026-09-27T10:00:00Z', ends_at: '2026-09-27T10:30:00Z' }),
      b({ client_name: 'Sem Consentimento', client_phone: '934222222', status: 'concluida', starts_at: '2026-10-18T10:00:00Z', ends_at: '2026-10-18T10:30:00Z' }),
    ]
    const out = candidates({ all, professionalId: 'ana', window, dayEnd, now })
    expect(out.map(c => [c.reason, c.name])).toEqual([
      ['mais_cedo', 'Rui Hoje'], ['pediu', 'Quer Cedo'], ['habitual', 'Habitual'],
    ])
    expect(out[2].days).toBe(36)
    expect(out[2].usual).toBe(21)
  })

  it('messages', () => {
    const c = { reason: 'mais_cedo' as const, name: 'Rui Almeida', phone: '912', booking: b({}) }
    expect(offerMessage(c, 'Barbearia', 'hoje às 11:00', 'L')).toBe('Olá Rui! Abriu uma vaga no Barbearia hoje às 11:00. Quer vir mais cedo? Se sim, toque aqui (quem aceitar primeiro fica com ela): L')
    expect(offerMessage({ reason: 'habitual', name: 'Cliente', phone: '9' }, 'B', 'hoje às 11:00', 'L')).toMatch(/^Olá! .* marque aqui/)
  })
})
