/** Per-client service times (client_times, migration 0031). */

export interface ClientTime { id: string; phone_key: string; service_id: string | null; minutes: number }

/** "Corte: 60 min (normal 30)" or "+15 min em todos os serviços". */
export function describeTime(t: ClientTime, services: Record<string, { name: string; duration_min: number }>): string {
  if (!t.service_id) return `+${t.minutes} min em todos os serviços`
  const s = services[t.service_id]
  return s ? `${s.name}: ${t.minutes} min (normal ${s.duration_min})` : `${t.minutes} min`
}

/** Choices for the length: every 5 min up to an hour, then every 15 up to 4 h (extra minutes: up to 2 h). */
export function minuteOptions(normal: number | null): number[] {
  const max = normal === null ? 120 : 240
  const out: number[] = []
  for (let m = 5; m <= max; m += m < 60 ? 5 : 15) out.push(m)
  if (normal !== null && !out.includes(normal) && normal <= 480) out.push(normal)
  return out.sort((a, b) => a - b)
}

/**
 * The length for this client's booking, as the database works it out (client_duration):
 * their own time for the service, or the usual length plus their extra minutes.
 */
export function clientMinutes(rows: Pick<ClientTime, 'service_id' | 'minutes'>[], serviceId: string, usual: number): number {
  const own = rows.find(r => r.service_id === serviceId)
  if (own) return own.minutes
  return usual + (rows.find(r => r.service_id === null)?.minutes ?? 0)
}
