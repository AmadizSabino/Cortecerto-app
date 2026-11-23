/** The landing page's "Quanto lhe custam as faltas?" sums. */

export const WEEKS_PER_MONTH = 52 / 12

/** Money lost a month to no-shows, and what avoiding half of them is worth against the plan. */
export function noShowCost(perWeek: number, avgCents: number, planCents: number) {
  const ok = Number.isFinite(perWeek) && Number.isFinite(avgCents) && perWeek >= 0 && avgCents >= 0
  const lost = ok ? Math.round(perWeek * avgCents * WEEKS_PER_MONTH) : 0
  const saved = Math.round(lost / 2)
  return { lostCents: lost, savedCents: saved, paysFor: planCents > 0 ? saved / planCents : 0 }
}

/** "3" or "3,5" -> 3.5; anything else NaN. */
export function parseNumber(v: string): number {
  const t = v.trim().replace(',', '.')
  return /^\d{1,4}(\.\d{1,2})?$/.test(t) ? Number(t) : NaN
}
