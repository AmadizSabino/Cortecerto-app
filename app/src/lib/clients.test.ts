import { expect, it } from 'vitest'
import { summarizeClients } from './clients'
import type { Booking } from './supabase'

const b = (p: Partial<Booking>): Booking => ({
  id: Math.random().toString(), starts_at: '2026-11-01T10:00:00Z', ends_at: '2026-11-01T10:30:00Z', client_name: 'Ana', client_phone: '912345678',
  consent_messages: false, status: 'concluida', deposit: 'nenhum', service_id: 's1', professional_id: 'p1', ...p,
})

it('groups by phone across formats and counts visits, spend and no-shows', () => {
  const now = new Date('2026-11-20T12:00:00Z')
  const list = summarizeClients([
    b({}), b({ client_phone: '+351 912 345 678', starts_at: '2026-11-10T10:00:00Z' }),
    b({ client_phone: '00351912345678', status: 'faltou', starts_at: '2026-11-12T10:00:00Z' }),
    b({ status: 'confirmada', starts_at: '2026-11-25T10:00:00Z', consent_messages: true }),
    b({ client_name: 'Rui', client_phone: '-' }),
  ], () => 1200, now)
  expect(list).toHaveLength(2)
  const ana = list.find(c => c.name === 'Ana')!
  expect(ana.visits).toBe(2)
  expect(ana.spentCents).toBe(2400)
  expect(ana.noShows).toBe(1)
  expect(ana.consent).toBe(true)
  expect(ana.lastVisit?.toISOString()).toBe('2026-11-10T10:00:00.000Z')
  expect(ana.nextBooking?.toISOString()).toBe('2026-11-25T10:00:00.000Z')
})
