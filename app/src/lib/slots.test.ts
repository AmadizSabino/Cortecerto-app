import { describe, expect, it } from 'vitest'
import { freeSlots } from './slots'
import { formatTime, zonedToUtc } from './time'

const tz = 'Europe/Lisbon'
const hours = [{ weekday: 5, opens: '09:00', closes: '12:00' }, { weekday: 5, opens: '14:00:00', closes: '15:00:00' }]
const past = new Date('2020-01-01T00:00:00Z')
const fmt = (ds: Date[]) => ds.map(d => formatTime(d, tz))

describe('zonedToUtc', () => {
  it('handles Lisbon winter (UTC+0) and summer (UTC+1)', () => {
    expect(zonedToUtc('2026-11-20', '10:00', tz).toISOString()).toBe('2026-11-20T10:00:00.000Z')
    expect(zonedToUtc('2026-07-10', '10:00', tz).toISOString()).toBe('2026-07-10T09:00:00.000Z')
  })
})

describe('freeSlots', () => {
  it('lists slots that fit before closing, across split shifts', () => {
    const s = fmt(freeSlots({ date: '2026-11-20', tz, hours, durationMin: 60, busy: [], now: past }))
    expect(s).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:00', '14:00'])
  })

  it('returns nothing on a closed day', () => {
    expect(freeSlots({ date: '2026-11-21', tz, hours, durationMin: 30, busy: [], now: past })).toEqual([])
  })

  it('skips slots overlapping a booking', () => {
    const busy = [{ start: zonedToUtc('2026-11-20', '10:00', tz), end: zonedToUtc('2026-11-20', '10:30', tz) }]
    const s = fmt(freeSlots({ date: '2026-11-20', tz, hours, durationMin: 30, busy, now: past, stepMin: 30 }))
    expect(s).toEqual(['09:00', '09:30', '10:30', '11:00', '11:30', '14:00', '14:30'])
  })

  it('skips slots in the past', () => {
    const now = zonedToUtc('2026-11-20', '11:10', tz)
    const s = fmt(freeSlots({ date: '2026-11-20', tz, hours, durationMin: 30, busy: [], now, stepMin: 30 }))
    expect(s).toEqual(['11:30', '14:00', '14:30'])
  })
})
