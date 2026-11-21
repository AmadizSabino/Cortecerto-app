import type { OpeningHours } from './slots'

/** The salon's opening hours and each professional's own hours (migration 0009). */
export interface SalonHours { salon: OpeningHours[]; byPro: Record<string, OpeningHours[]> }

export const NO_HOURS: SalonHours = { salon: [], byPro: {} }

/** A professional with own hours works those; otherwise the salon's. */
export function hoursFor(h: SalonHours, professionalId: string | undefined): OpeningHours[] {
  const own = professionalId ? h.byPro[professionalId] : undefined
  return own && own.length > 0 ? own : h.salon
}

/** One day in the schedule editor: open, hours, and an optional break. */
export interface DayForm { open: boolean; opens: string; closes: string; breakFrom: string; breakTo: string }

export function emptyWeek(from: OpeningHours[]): DayForm[] {
  return Array.from({ length: 7 }, (_, wd) => {
    const rows = from.filter(r => r.weekday === wd).sort((a, b) => a.opens.localeCompare(b.opens))
    if (rows.length === 0) return { open: false, opens: '09:00', closes: '19:00', breakFrom: '', breakTo: '' }
    const first = rows[0], last = rows[rows.length - 1]
    return {
      open: true, opens: first.opens.slice(0, 5), closes: last.closes.slice(0, 5),
      breakFrom: rows.length > 1 ? first.closes.slice(0, 5) : '', breakTo: rows.length > 1 ? rows[1].opens.slice(0, 5) : '',
    }
  })
}

/** Rows to store for a week; a break splits the day in two. Returns an error text instead when invalid. */
export function weekToRows(week: DayForm[]): OpeningHours[] | string {
  const rows: OpeningHours[] = []
  for (let wd = 0; wd < 7; wd++) {
    const d = week[wd]
    if (!d.open) continue
    if (d.closes <= d.opens) return 'A hora de saída tem de ser depois da entrada.'
    const hasBreak = Boolean(d.breakFrom || d.breakTo)
    if (hasBreak) {
      if (!d.breakFrom || !d.breakTo) return 'Indique o início e o fim da pausa, ou deixe os dois em branco.'
      if (!(d.opens < d.breakFrom && d.breakFrom < d.breakTo && d.breakTo < d.closes)) return 'A pausa tem de ficar dentro do horário.'
      rows.push({ weekday: wd, opens: d.opens, closes: d.breakFrom }, { weekday: wd, opens: d.breakTo, closes: d.closes })
    } else {
      rows.push({ weekday: wd, opens: d.opens, closes: d.closes })
    }
  }
  return rows
}
