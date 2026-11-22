/**
 * Packages (migration 0022): one model, three ways to sell.
 *   combo:  several services in one visit, a fixed price, optional extras
 *   evento: weddings and other events, by request and proposal (trial + the day, per person)
 *   pack:   prepaid sessions, used over time
 */

export type PackageMode = 'combo' | 'evento' | 'pack'
export interface Package {
  id: string; salon_id: string; mode: PackageMode; name: string; description: string
  price_cents: number; per_guest_cents: number | null; max_guests: number | null; includes_trial: boolean
  extra_hour_cents: number | null; deposit_pct: number | null; sessions: number | null; valid_days: number | null
  active: boolean; position: number; image_path: string | null
}
export interface PackageItem { id: string; package_id: string; service_id: string; optional: boolean; extra_price_cents: number | null; position: number }
export interface Svc { id: string; name: string; duration_min: number; price_cents: number }

export const MODES: { id: PackageMode; label: string; hint: string }[] = [
  { id: 'combo', label: 'Combo numa visita', hint: 'Vários serviços seguidos, a um preço fechado. O cliente marca online e pode juntar extras.' },
  { id: 'evento', label: 'Evento (casamentos, batizados…)', hint: 'O cliente faz um pedido com a data e o número de pessoas; o salão responde com uma proposta.' },
  { id: 'pack', label: 'Pack de sessões', hint: 'Sessões pagas à cabeça (ex.: 6 sessões de laser), usadas ao longo do tempo.' },
]

/** Services in the package and the chosen extras, with the price and time they add. */
export function comboTotals(pkg: Pick<Package, 'price_cents'>, items: PackageItem[], services: Record<string, Svc>, extras: string[]) {
  let minutes = 0, price = pkg.price_cents, sumAlone = 0
  const names: string[] = []
  for (const i of [...items].sort((a, b) => Number(a.optional) - Number(b.optional) || a.position - b.position)) {
    const s = services[i.service_id]
    if (!s || (i.optional && !extras.includes(i.id))) continue
    minutes += s.duration_min; names.push(s.name)
    if (i.optional) price += i.extra_price_cents ?? s.price_cents
    else sumAlone += s.price_cents
  }
  return { minutes, price, names, saving: Math.max(0, sumAlone - pkg.price_cents) }
}

/** Estimate for an event request: main person, each guest, extras. Same as request_package. */
export function eventEstimate(pkg: Pick<Package, 'price_cents' | 'per_guest_cents'>, guests: number, items: PackageItem[], services: Record<string, Svc>, extras: string[]): number {
  const ex = items.filter(i => i.optional && extras.includes(i.id)).reduce((s, i) => s + (i.extra_price_cents ?? services[i.service_id]?.price_cents ?? 0), 0)
  return pkg.price_cents + (pkg.per_guest_cents ?? 0) * Math.max(0, guests) + ex
}

/** Deposit for a proposal, from the package's percentage, rounded to the euro. */
export const depositFor = (price: number, pct: number | null) => pct ? Math.round(price * pct / 100 / 100) * 100 : 0

/** "a partir de 180 €", "45 €", "6 sessões · 120 €". */
export function priceLabel(p: Pick<Package, 'mode' | 'price_cents' | 'per_guest_cents' | 'sessions'>, euros: (c: number) => string): string {
  if (p.mode === 'evento') return `a partir de ${euros(p.price_cents)}${p.per_guest_cents ? ` + ${euros(p.per_guest_cents)}/pessoa` : ''}`
  if (p.mode === 'pack') return `${p.sessions} sessões · ${euros(p.price_cents)}`
  return euros(p.price_cents)
}

/** Reminders for an accepted event, from the trial and the day (shown on the request and the agenda). */
export function eventMilestones(eventAt: Date, trialAt: Date | null, now: Date): { label: string; at: Date; done: boolean }[] {
  const day = 86400000
  const list = [
    ...(trialAt ? [{ label: 'Prova', at: trialAt }] : []),
    { label: 'Confirmar pormenores (1 semana antes)', at: new Date(eventAt.getTime() - 7 * day) },
    { label: 'Lembrete na véspera', at: new Date(eventAt.getTime() - day) },
    { label: 'O dia', at: eventAt },
  ]
  return list.sort((a, b) => a.at.getTime() - b.at.getTime()).map(m => ({ ...m, done: m.at < now }))
}
