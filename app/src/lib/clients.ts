import type { Booking } from './supabase'
import { waNumber } from './whatsapp'

export interface ClientSummary {
  key: string; name: string; phone: string
  visits: number; noShows: number; spentCents: number
  lastVisit?: Date; nextBooking?: Date; consent: boolean
}

/** Group bookings into clients by phone number (or name when there is no phone). */
export function summarizeClients(bookings: Booking[], priceOf: (serviceId: string) => number, now = new Date()): ClientSummary[] {
  const map = new Map<string, ClientSummary>()
  for (const b of [...bookings].sort((a, z) => a.starts_at.localeCompare(z.starts_at))) {
    const digits = waNumber(b.client_phone)
    const key = digits.length >= 9 ? digits : 'nome:' + b.client_name.trim().toLowerCase()
    const c = map.get(key) ?? { key, name: b.client_name, phone: b.client_phone, visits: 0, noShows: 0, spentCents: 0, consent: false }
    c.name = b.client_name // latest spelling wins
    if (b.consent_messages) c.consent = true
    const start = new Date(b.starts_at)
    if (b.status === 'concluida') { c.visits++; c.spentCents += priceOf(b.service_id); c.lastVisit = start }
    if (b.status === 'faltou') c.noShows++
    if ((b.status === 'pendente' || b.status === 'confirmada') && start > now && !c.nextBooking) c.nextBooking = start
    map.set(key, c)
  }
  return [...map.values()]
}

/** Days since the last visit, or undefined if the client never came. */
export const daysSince = (d: Date | undefined, now = new Date()) => d ? Math.floor((now.getTime() - d.getTime()) / 86400000) : undefined
