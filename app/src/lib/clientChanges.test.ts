import { expect, it } from 'vitest'
import { changeState, limitText, manageLink } from './clientChanges'

const now = new Date('2026-11-21T10:00:00Z')

it('allows changes until the salon limit, for bookings still on', () => {
  const b = { status: 'confirmada', starts_at: '2026-11-21T13:00:00Z', client_change_hours: 2 }
  expect(changeState(b, now)).toBe('pode')
  expect(changeState({ ...b, starts_at: '2026-11-21T11:30:00Z' }, now)).toBe('fora_do_prazo')
  expect(changeState({ ...b, status: 'cancelada' }, now)).toBe('fechada')
  expect(changeState({ ...b, status: 'concluida' }, now)).toBe('fechada')
  expect(changeState({ ...b, client_change_hours: null }, now)).toBe('nao_permitido')
})

it('writes the limit and the link', () => {
  expect(limitText(2)).toBe('até 2 horas antes')
  expect(limitText(1)).toBe('até 1 hora antes')
  expect(limitText(24)).toBe('até 1 dia antes')
  expect(limitText(48)).toBe('até 2 dias antes')
  expect(manageLink('https://x.pt', 'abc')).toBe('https://x.pt/m/abc')
})
