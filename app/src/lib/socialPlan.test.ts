import { describe, expect, it } from 'vitest'
import { quietPeriods, quietText, weekKey, weekPlan } from './socialPlan'

const tz = 'Europe/Lisbon'
// Tuesday to Saturday, 09:00–19:00, two professionals.
const hours = { salon: [2, 3, 4, 5, 6].map(weekday => ({ weekday, opens: '09:00', closes: '19:00' })), byPro: {} }

describe('quiet periods', () => {
  it('finds the emptiest periods and skips busy or closed ones', () => {
    const busy = [
      // Tuesday 24 Nov morning fully booked for both
      { professional_id: 'a', start: new Date('2026-11-24T09:00:00Z'), end: new Date('2026-11-24T13:00:00Z') },
      { professional_id: 'b', start: new Date('2026-11-24T09:00:00Z'), end: new Date('2026-11-24T13:00:00Z') },
    ]
    const out = quietPeriods({ today: '2026-11-24', days: 2, pros: ['a', 'b'], hours, tz, now: new Date('2026-11-24T08:00:00Z'), busy, max: 10 })
    expect(out.map(q => `${q.date} ${q.period} ${q.from}-${q.to}`)).toEqual([
      '2026-11-24 tarde 13:00-17:00', '2026-11-24 fim do dia 17:00-19:00',
      '2026-11-25 manhã 09:00-13:00', '2026-11-25 tarde 13:00-17:00', '2026-11-25 fim do dia 17:00-19:00',
    ])
    expect(out[0].occupancy).toBe(0)
  })
  it('skips periods ending within 3 hours, and closed days', () => {
    const out = quietPeriods({ today: '2026-11-23', days: 1, pros: ['a'], hours, tz, now: new Date('2026-11-23T08:00:00Z'), busy: [] })
    expect(out).toEqual([]) // Monday is closed
    const late = quietPeriods({ today: '2026-11-24', days: 1, pros: ['a'], hours, tz, now: new Date('2026-11-24T15:00:00Z'), busy: [] })
    expect(late.map(q => q.period)).toEqual(['fim do dia']) // the afternoon ends at 17:00, under 3 hours away
  })
  it('text', () => {
    expect(quietText({ date: '2026-11-25', weekday: 3, period: 'tarde', from: '14:00', to: '17:30', occupancy: 0.2, openMin: 210 })).toBe('Quarta, 25 nov, à tarde (14h–17h30)')
  })
})

describe('week plan', () => {
  it('three posts, a promotion for a quiet period, and a date coming up', () => {
    const quiet = { date: '2026-11-25', weekday: 3, period: 'tarde' as const, from: '13:00', to: '17:00', occupancy: 0.25, openMin: 480 }
    const plan = weekPlan({ type: 'unhas', hasPhotos: true, quiet, next: { date: '2026-11-27', name: 'Black Friday', idea: 'Packs' }, today: '2026-11-22' })
    expect(plan.map(p => [p.day, p.action ?? ''])).toEqual([['Segunda', 'galeria'], ['Quarta', 'promo'], ['Sexta', ''], ['Esta semana', 'data']])
    expect(plan[1].how).toMatch(/^Só 25% ocupado/)
    expect(weekPlan({ type: 'barbearia', hasPhotos: false, quiet: null, next: null, today: '2026-11-22' })).toHaveLength(3)
  })
  it('week key is the Monday', () => {
    expect(weekKey('2026-11-22')).toBe('2026-11-16') // Sunday
    expect(weekKey('2026-11-23')).toBe('2026-11-23')
    expect(weekKey('2026-11-26')).toBe('2026-11-23')
  })
})
