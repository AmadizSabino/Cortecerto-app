/** Prices and durations per professional (migration 0011). */

export interface Override {
  service_id: string; professional_id: string
  offered: boolean; price_cents: number | null; duration_min: number | null
}
export type Overrides = Record<string, Override> // key: `${service}:${professional}`

export const overrideKey = (serviceId: string, professionalId: string) => `${serviceId}:${professionalId}`

export function indexOverrides(rows: Override[]): Overrides {
  return Object.fromEntries(rows.map(r => [overrideKey(r.service_id, r.professional_id), r]))
}

/** What a service costs and takes with a professional; null when they don't do it. */
export function effective(
  service: { id: string; price_cents: number; duration_min: number }, professionalId: string | undefined, o: Overrides,
): { price_cents: number; duration_min: number } | null {
  const r = professionalId ? o[overrideKey(service.id, professionalId)] : undefined
  if (r && !r.offered) return null
  return { price_cents: r?.price_cents ?? service.price_cents, duration_min: r?.duration_min ?? service.duration_min }
}

/** "12 €" or "10–15 €" across the professionals who do it, for the service list. */
export function priceRange(
  service: { id: string; price_cents: number; duration_min: number }, professionalIds: string[], o: Overrides,
): { min: number; max: number } | null {
  const prices = professionalIds.map(p => effective(service, p, o)).filter(Boolean).map(e => e!.price_cents)
  if (professionalIds.length === 0) return { min: service.price_cents, max: service.price_cents }
  if (prices.length === 0) return null
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

/** The booking's own price when stored, otherwise the service's. */
export function bookingPrice(b: { price_cents?: number | null; service_id: string }, services: Record<string, { price_cents: number }>): number {
  return b.price_cents ?? services[b.service_id]?.price_cents ?? 0
}
