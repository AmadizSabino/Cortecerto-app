import { addDays, dateInTz, weekdayOf } from './time'

/** Monday of the week that holds `date` (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const wd = weekdayOf(date) // 0 = Sunday
  return addDays(date, wd === 0 ? -6 : 1 - wd)
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Items grouped by their day in the salon's timezone, each day in time order. */
export function groupByDay<T extends { starts_at: string }>(items: T[], tz: string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const it of [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    (out[dateInTz(new Date(it.starts_at), tz)] ??= []).push(it)
  }
  return out
}
