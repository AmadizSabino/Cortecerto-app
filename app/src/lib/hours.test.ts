import { expect, it } from 'vitest'
import { summarizeHours } from './hours'
import { icsEvent } from './ics'

it('groups consecutive days with the same hours', () => {
  const h = [2, 3, 4, 5].map(w => ({ weekday: w, opens: '09:00:00', closes: '19:00:00' }))
  h.push({ weekday: 6, opens: '09:00:00', closes: '14:00:00' })
  expect(summarizeHours(h)).toBe('Ter a Sex, 9:00–19:00 · Sáb, 9:00–14:00')
})

it('lists split shifts and single days', () => {
  expect(summarizeHours([
    { weekday: 1, opens: '09:00', closes: '13:00' }, { weekday: 1, opens: '14:00', closes: '19:00' },
    { weekday: 3, opens: '10:00', closes: '18:00' },
  ])).toBe('Seg, 9:00–13:00, 14:00–19:00 · Qua, 10:00–18:00')
})

it('builds a valid calendar event', () => {
  const ics = icsEvent({ title: 'Corte, Barba e Beer', start: new Date('2026-11-21T10:30:00Z'), end: new Date('2026-11-21T11:15:00Z') })
  expect(ics).toContain('DTSTART:20261121T103000Z')
  expect(ics).toContain('SUMMARY:Corte\\, Barba e Beer')
})
