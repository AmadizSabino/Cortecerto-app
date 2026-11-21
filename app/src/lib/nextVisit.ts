import { addDays, weekdayOf } from './time'
import type { OpeningHours } from './slots'

/** Usual weeks between visits by salon type, used as the first suggestion. */
export const DEFAULT_WEEKS: Record<string, number> = { barbearia: 3, cabeleireiro: 6, unhas: 3, depilacao: 4 }

export const WEEK_OPTIONS = [2, 3, 4, 5, 6, 8]

/**
 * The suggested day for the next visit: `weeks` after the visit, moved forward to
 * the next day the salon is open (within two weeks).
 */
export function suggestNextDate(visitDate: string, weeks: number, hours: OpeningHours[]): string {
  const target = addDays(visitDate, weeks * 7)
  const open = new Set(hours.map(h => h.weekday))
  if (open.size === 0) return target
  for (let i = 0; i < 14; i++) {
    const d = addDays(target, i)
    if (open.has(weekdayOf(d))) return d
  }
  return target
}

/** Picks the slot closest to the time of the visit that just ended (people keep routines). */
export function closestSlot(slots: Date[], preferredMinutes: number, tzMinutes: (d: Date) => number): Date | undefined {
  let best: Date | undefined
  let bestDiff = Infinity
  for (const s of slots) {
    const diff = Math.abs(tzMinutes(s) - preferredMinutes)
    if (diff < bestDiff) { best = s; bestDiff = diff }
  }
  return best
}
