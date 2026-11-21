import { expect, it } from 'vitest'
import { buildClients, daysUntilBirthday, filterClients, isAtRisk } from './clients'
import type { Booking } from './supabase'

const now = new Date('2026-11-20T12:00:00Z')
const services = { corte: { price_cents: 1200 }, barba: { price_cents: 800 } }

function bk(p: Partial<Booking>): Booking {
  return {
    id: Math.random().toString(36), starts_at: '2026-11-01T10:00:00Z', ends_at: '2026-11-01T10:30:00Z',
    client_name: 'João', client_phone: '912345678', consent_messages: false,
    status: 'concluida', deposit: 'nenhum', service_id: 'corte', professional_id: 'p1', ...p,
  }
}

it('groups bookings by phone, whatever the format, and totals visits', () => {
  const clients = buildClients([
    bk({ starts_at: '2026-10-01T10:00:00Z', client_phone: '+351 912 345 678' }),
    bk({ starts_at: '2026-11-01T10:00:00Z', service_id: 'barba', client_name: 'João Silva', consent_messages: true }),
    bk({ starts_at: '2026-11-10T10:00:00Z', status: 'faltou' }),
    bk({ starts_at: '2026-11-25T10:00:00Z', status: 'pendente' }),
    bk({ starts_at: '2026-11-05T10:00:00Z', client_name: 'Ana', client_phone: '965738127' }),
  ], services, now)

  expect(clients).toHaveLength(2)
  const joao = clients[0]
  expect(joao.key).toBe('351912345678')
  expect(joao.name).toBe('João') // from the most recent booking
  expect(joao.visits).toBe(2)
  expect(joao.noShows).toBe(1)
  expect(joao.spentCents).toBe(2000)
  expect(joao.lastVisit).toBe('2026-11-01T10:00:00Z')
  expect(joao.nextBooking).toBe('2026-11-25T10:00:00Z')
  expect(joao.consent).toBe(false) // the latest booking did not opt in
})

it('flags clients with no visit for 45 days and nothing booked', () => {
  const [old] = buildClients([bk({ starts_at: '2026-09-01T10:00:00Z' })], services, now)
  expect(isAtRisk(old, now)).toBe(true)
  const [booked] = buildClients([bk({ starts_at: '2026-09-01T10:00:00Z' }), bk({ starts_at: '2026-12-01T10:00:00Z', status: 'confirmada' })], services, now)
  expect(isAtRisk(booked, now)).toBe(false)
  const [recent] = buildClients([bk({ starts_at: '2026-11-01T10:00:00Z' })], services, now)
  expect(isAtRisk(recent, now)).toBe(false)
})

it('searches by name without accents or by phone digits, and filters', () => {
  const clients = buildClients([
    bk({ client_name: 'Joana Conceição', client_phone: '912000111', consent_messages: true }),
    bk({ client_name: 'Rui', client_phone: '963222333', status: 'faltou' }),
  ], services, now)
  expect(filterClients(clients, 'conceicao', 'todos', now).map(c => c.name)).toEqual(['Joana Conceição'])
  expect(filterClients(clients, '963 222', 'todos', now).map(c => c.name)).toEqual(['Rui'])
  expect(filterClients(clients, '', 'faltas', now).map(c => c.name)).toEqual(['Rui'])
  expect(filterClients(clients, '', 'consentimento', now).map(c => c.name)).toEqual(['Joana Conceição'])
})

it('counts days to the next birthday, wrapping into next year', () => {
  expect(daysUntilBirthday(20, 11, '2026-11-20')).toBe(0)
  expect(daysUntilBirthday(25, 11, '2026-11-20')).toBe(5)
  expect(daysUntilBirthday(19, 11, '2026-11-20')).toBe(364)
  expect(daysUntilBirthday(2, 1, '2026-12-30')).toBe(3)
  expect(daysUntilBirthday(29, 2, '2027-02-27')).toBe(2) // 1 March in a non-leap year
})

it('filters coming birthdays and searches the notes', () => {
  const clients = buildClients([
    bk({ client_name: 'Joana', client_phone: '912000111' }),
    bk({ client_name: 'Rui', client_phone: '963222333' }),
  ], services, now)
  const notes = {
    '351912000111': { phone_key: '351912000111', notes: 'Gosta de degradê baixo', birthday_day: 23, birthday_month: 11 },
    '351963222333': { phone_key: '351963222333', notes: '', birthday_day: 1, birthday_month: 12 },
  }
  expect(filterClients(clients, '', 'aniversario', now, notes, '2026-11-20').map(c => c.name)).toEqual(['Joana'])
  expect(filterClients(clients, 'degrade', 'todos', now, notes, '2026-11-20').map(c => c.name)).toEqual(['Joana'])
})
