import { expect, it } from 'vitest'
import { closestSlot, suggestNextDate } from './nextVisit'

const tueToSat = [2, 3, 4, 5, 6].map(weekday => ({ weekday, opens: '09:00', closes: '19:00' }))

it('suggests the visit date plus the weeks, on a day the salon is open', () => {
  // 2026-11-21 is a Saturday; 3 weeks later is Saturday 12 December.
  expect(suggestNextDate('2026-11-21', 3, tueToSat)).toBe('2026-12-12')
  // From a Saturday, 3 weeks + closed Sunday/Monday → moves to Tuesday.
  expect(suggestNextDate('2026-11-22', 3, tueToSat)).toBe('2026-12-15')
  expect(suggestNextDate('2026-11-22', 3, [])).toBe('2026-12-13')
})

it('picks the free slot closest to the usual time', () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 11, 12, h, m))
  const mins = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes()
  expect(closestSlot([at(9), at(10, 30), at(15)], 10 * 60 + 15, mins)?.toISOString()).toBe(at(10, 30).toISOString())
  expect(closestSlot([], 600, mins)).toBeUndefined()
})
