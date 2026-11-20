import { weekdayOf, zonedToUtc } from './time'

export interface OpeningHours { weekday: number; opens: string; closes: string }
export interface Interval { start: Date; end: Date }

/**
 * Free start times for one professional on one day.
 * Slots step every `stepMin` minutes and must fit the whole service before closing,
 * must not overlap a busy interval, and must start after `now`.
 */
export function freeSlots(opts: {
  date: string
  tz: string
  hours: OpeningHours[]
  durationMin: number
  busy: Interval[]
  now: Date
  stepMin?: number
}): Date[] {
  const { date, tz, hours, durationMin, busy, now, stepMin = 15 } = opts
  const wd = weekdayOf(date)
  const out: Date[] = []
  for (const h of hours.filter(h => h.weekday === wd).sort((a, b) => a.opens.localeCompare(b.opens))) {
    const open = zonedToUtc(date, h.opens.slice(0, 5), tz).getTime()
    const close = zonedToUtc(date, h.closes.slice(0, 5), tz).getTime()
    for (let t = open; t + durationMin * 60000 <= close; t += stepMin * 60000) {
      const end = t + durationMin * 60000
      if (t <= now.getTime()) continue
      if (busy.some(b => t < b.end.getTime() && end > b.start.getTime())) continue
      out.push(new Date(t))
    }
  }
  return out
}
