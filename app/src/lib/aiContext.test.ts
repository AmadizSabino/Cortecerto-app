import { describe, expect, it } from 'vitest'
import { scheduleContext } from './aiContext'

const tz = 'Europe/Lisbon'
const base = {
  salonName: 'Barba e Beer', salonType: 'barbearia', tz, now: new Date('2026-11-24T16:00:00Z'), today: '2026-11-24',
  hours: [2, 3].map(w => ({ weekday: w, opens: '09:00', closes: '19:00' })),
  pros: { p1: { name: 'Miguel' } },
  services: { s1: { name: 'Corte', price_cents: 1200, duration_min: 30 } },
}

describe('scheduleContext', () => {
  it('lists each booking with time, service and professional, without client data', () => {
    const text = scheduleContext({ ...base, bookings: [
      { starts_at: '2026-11-24T10:00:00Z', ends_at: '2026-11-24T10:30:00Z', status: 'confirmada', service_id: 's1', professional_id: 'p1' },
      { starts_at: '2026-11-25T15:00:00Z', ends_at: '2026-11-25T15:30:00Z', status: 'pendente', service_id: 's1', professional_id: 'p1' },
    ] })
    expect(text).toContain('Hoje, ')
    expect(text).toContain('10:00–10:30 Corte com Miguel, confirmada')
    expect(text).toContain('15:00–15:30 Corte com Miguel, por confirmar')
    expect(text).toMatch(/Hoje.*1 marcações, 12,00\s€, livre cerca de 9 h 30 min/)
  })
  it('says when a day is closed', () => {
    expect(scheduleContext({ ...base, bookings: [] })).toMatch(/quinta-feira.*fechado/)
  })
})
