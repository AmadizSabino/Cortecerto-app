import { waNumber } from './whatsapp'

/**
 * Filling a freed slot (migration 0019). When a booking is cancelled or the client
 * doesn't show, the salon offers that time to other clients; the first to accept
 * gets it. This file decides who to offer it to, and what to say.
 */

export interface SlotBooking {
  id: string; professional_id: string; service_id: string; starts_at: string; ends_at: string
  status: string; client_name: string; client_phone: string; consent_messages: boolean
  wants_earlier?: boolean; created_at?: string
}

export type Reason = 'mais_cedo' | 'pediu' | 'habitual'
export interface Candidate {
  reason: Reason
  name: string
  phone: string
  /** The booking that would move into the freed time (mais_cedo, pediu); none for a regular without a booking. */
  booking?: SlotBooking
  /** Regulars: days since the last visit, and their usual gap. */
  days?: number; usual?: number
}

export const REASON_LABEL: Record<Reason, string> = {
  mais_cedo: 'Marcado mais tarde hoje',
  pediu: 'Pediu para vir mais cedo',
  habitual: 'Está na altura de voltar',
}

const MIN = 60_000
const DAY = 86_400_000
const minutes = (b: { starts_at: string; ends_at: string }) => (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / MIN
const live = (s: string) => s === 'pendente' || s === 'confirmada'

/** The usable part of a freed time: from now (rounded up to 5 minutes) if it already started. */
export function usableWindow(start: Date, end: Date, now: Date): { start: Date; end: Date; minutes: number } | null {
  const fromNow = new Date(Math.ceil(now.getTime() / (5 * MIN)) * 5 * MIN)
  const s = start > fromNow ? start : fromNow
  const m = (end.getTime() - s.getTime()) / MIN
  return m >= 10 ? { start: s, end, minutes: m } : null
}

/**
 * Who to offer the freed time to, best first:
 * 1. clients booked later the same day with the same professional, whose service fits (service message, no consent needed);
 * 2. clients booked on a later day who asked to be told about an earlier time;
 * 3. regulars who are due back, have no booking and agreed to messages in their latest booking (RGPD: this one is marketing).
 * `all` = the salon's bookings around now (history for regulars, upcoming for 1 and 2).
 */
export function candidates(opts: {
  all: SlotBooking[]; professionalId: string; window: { start: Date; minutes: number }
  dayEnd: Date; now: Date; exclude?: string; max?: number
}): Candidate[] {
  const { all, professionalId, window, dayEnd, now, exclude } = opts
  const max = opts.max ?? 12
  const fits = (b: SlotBooking) => minutes(b) <= window.minutes
  const later = (b: SlotBooking) => new Date(b.starts_at) > window.start
  const out: Candidate[] = []
  const seen = new Set<string>()
  const add = (c: Candidate) => {
    const key = waNumber(c.phone)
    if (key.length < 11 || seen.has(key)) return
    seen.add(key); out.push(c)
  }

  const upcoming = all.filter(b => b.id !== exclude && b.professional_id === professionalId && live(b.status) && later(b) && fits(b))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  for (const b of upcoming) if (new Date(b.starts_at) < dayEnd) add({ reason: 'mais_cedo', name: b.client_name, phone: b.client_phone, booking: b })
  for (const b of upcoming) if (new Date(b.starts_at) >= dayEnd && b.wants_earlier) add({ reason: 'pediu', name: b.client_name, phone: b.client_phone, booking: b })

  // Regulars: at least two past visits, no booking ahead, and now at or past ~85% of their usual gap.
  const byClient = new Map<string, SlotBooking[]>()
  for (const b of all) {
    const k = waNumber(b.client_phone)
    if (k.length < 11) continue
    const list = byClient.get(k) ?? []
    list.push(b); byClient.set(k, list)
  }
  const due: Candidate[] = []
  for (const list of byClient.values()) {
    if (list.some(b => live(b.status) && new Date(b.starts_at) > now)) continue
    const visits = list.filter(b => b.status === 'concluida').map(b => new Date(b.starts_at).getTime()).sort((a, b) => a - b)
    if (visits.length < 2) continue
    const latest = [...list].sort((a, b) => (b.created_at ?? b.starts_at).localeCompare(a.created_at ?? a.starts_at))[0]
    if (!latest.consent_messages) continue
    const usual = (visits[visits.length - 1] - visits[0]) / (visits.length - 1) / DAY
    const days = (now.getTime() - visits[visits.length - 1]) / DAY
    if (usual < 7 || days < usual * 0.85) continue
    due.push({ reason: 'habitual', name: latest.client_name, phone: latest.client_phone, days: Math.round(days), usual: Math.round(usual) })
  }
  due.sort((a, b) => (b.days! / b.usual!) - (a.days! / a.usual!)).forEach(add)
  return out.slice(0, max)
}

/** The WhatsApp text for one candidate, with the offer's link. */
export function offerMessage(c: Candidate, salonName: string, when: string, link: string): string {
  const first = c.name.trim().split(/\s+/)[0]
  const hi = first && first !== 'Cliente' ? `Olá ${first}!` : 'Olá!'
  if (c.booking) return `${hi} Abriu uma vaga no ${salonName} ${when}. Quer vir mais cedo? Se sim, toque aqui (quem aceitar primeiro fica com ela): ${link}`
  return `${hi} Abriu uma vaga no ${salonName} ${when}. Se lhe der jeito, marque aqui (quem marcar primeiro fica com ela): ${link}`
}
