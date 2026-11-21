import type { OpeningHours } from './slots'

const SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const hm = (t: string) => t.slice(0, 5).replace(/^0/, '')

/**
 * "Ter a Sex, 9:00–19:00 · Sáb, 9:00–14:00". Consecutive days with the same
 * hours are grouped; days are listed Monday first.
 */
export function summarizeHours(hours: OpeningHours[]): string {
  const order = [1, 2, 3, 4, 5, 6, 0]
  const byDay = new Map<number, string>()
  for (const d of order) {
    const spans = hours.filter(h => h.weekday === d).sort((a, b) => a.opens.localeCompare(b.opens))
    if (spans.length) byDay.set(d, spans.map(s => `${hm(s.opens)}–${hm(s.closes)}`).join(', '))
  }
  const groups: { from: number; to: number; text: string }[] = []
  for (const d of order) {
    const text = byDay.get(d)
    if (!text) continue
    const last = groups[groups.length - 1]
    if (last && last.text === text && order.indexOf(d) === order.indexOf(last.to) + 1) last.to = d
    else groups.push({ from: d, to: d, text })
  }
  return groups.map(g => `${g.from === g.to ? SHORT[g.from] : `${SHORT[g.from]} a ${SHORT[g.to]}`}, ${g.text}`).join(' · ')
}
