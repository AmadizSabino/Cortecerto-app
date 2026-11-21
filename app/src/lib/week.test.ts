import { expect, it } from 'vitest'
import { groupByDay, weekDays, weekStart } from './week'

it('starts weeks on Monday', () => {
  expect(weekStart('2026-11-21')).toBe('2026-11-16') // Saturday
  expect(weekStart('2026-11-22')).toBe('2026-11-16') // Sunday
  expect(weekStart('2026-11-16')).toBe('2026-11-16') // Monday
  expect(weekDays('2026-11-16')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
})

it('groups by the salon day, not the UTC day', () => {
  const g = groupByDay([
    { starts_at: '2026-07-01T23:30:00Z' }, // 00:30 on 2 July in Lisbon (summer time)
    { starts_at: '2026-07-01T10:00:00Z' },
  ], 'Europe/Lisbon')
  expect(Object.keys(g).sort()).toEqual(['2026-07-01', '2026-07-02'])
})
