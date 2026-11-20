/** Timezone helpers. Salons are in Europe/Lisbon; the browser may not be. */

/** Offset in minutes of `tz` from UTC at the given instant (e.g. +60 in Lisbon summer). */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - instant.getTime()) / 60000)
}

/** The UTC instant for a wall-clock date ("2026-11-20") and time ("09:30") in `tz`. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let offset = tzOffsetMinutes(new Date(guess), tz)
  // Re-check once: the offset can differ on either side of a DST change.
  offset = tzOffsetMinutes(new Date(guess - offset * 60000), tz)
  return new Date(guess - offset * 60000)
}

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** "YYYY-MM-DD" for an instant, as seen in `tz`. */
export function dateInTz(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(instant)
}

export function formatTime(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('pt-PT', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(instant)
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
