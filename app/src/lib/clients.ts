import type { Booking, Service } from './supabase'
import { waNumber } from './whatsapp'

/** A client as seen from the salon's bookings, grouped by phone number. */
export interface Client {
  key: string            // normalised phone digits, e.g. 351912345678
  name: string           // name from the most recent booking
  phone: string          // phone as typed in the most recent booking
  bookings: Booking[]    // newest first
  visits: number         // completed visits
  noShows: number
  spentCents: number     // sum of completed visits at the service's price
  lastVisit: string | null  // starts_at of the last completed visit
  nextBooking: string | null // starts_at of the next pending or confirmed booking
  consent: boolean       // opted in to messages in their most recent booking
}

export type ClientFilter = 'todos' | 'em_risco' | 'faltas' | 'consentimento' | 'aniversario'

/** What the salon keeps about a client (table client_notes). */
export interface ClientNote {
  phone_key: string
  notes: string
  birthday_day: number | null
  birthday_month: number | null
}

/** Birthdays this many days ahead (today included) count as coming up. */
export const BIRTHDAY_SOON_DAYS = 7

/** Days without a visit after which a client counts as at risk of leaving. */
export const AT_RISK_DAYS = 45

const DAY_MS = 86_400_000

export function buildClients(bookings: Booking[], services: Record<string, Pick<Service, 'price_cents'>>, now = new Date()): Client[] {
  const groups = new Map<string, Booking[]>()
  for (const b of bookings) {
    const key = waNumber(b.client_phone)
    if (!key) continue
    const list = groups.get(key)
    if (list) list.push(b)
    else groups.set(key, [b])
  }

  const nowMs = now.getTime()
  const clients: Client[] = []
  for (const [key, list] of groups) {
    list.sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    const latest = list[0]
    const done = list.filter(b => b.status === 'concluida')
    const upcoming = list
      .filter(b => (b.status === 'pendente' || b.status === 'confirmada') && new Date(b.starts_at).getTime() >= nowMs)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    clients.push({
      key,
      name: latest.client_name,
      phone: latest.client_phone,
      bookings: list,
      visits: done.length,
      noShows: list.filter(b => b.status === 'faltou').length,
      spentCents: done.reduce((sum, b) => sum + (services[b.service_id]?.price_cents ?? 0), 0),
      lastVisit: done[0]?.starts_at ?? null,
      nextBooking: upcoming[0]?.starts_at ?? null,
      consent: latest.consent_messages,
    })
  }
  // Most recently seen first.
  return clients.sort((a, b) => b.bookings[0].starts_at.localeCompare(a.bookings[0].starts_at))
}

/** Came at least once, nothing booked, and no visit for AT_RISK_DAYS. */
export function isAtRisk(c: Client, now = new Date()): boolean {
  if (!c.lastVisit || c.nextBooking) return false
  return now.getTime() - new Date(c.lastVisit).getTime() > AT_RISK_DAYS * DAY_MS
}

export function daysSince(iso: string, now = new Date()): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS)
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Days from `today` ("YYYY-MM-DD", in the salon's timezone) to the next birthday,
 * 0 when it is today. A 29 February birthday falls on 1 March in other years.
 */
export function daysUntilBirthday(day: number, month: number, today: string): number {
  const [y, m, d] = today.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d)
  let next = Date.UTC(y, month - 1, day)
  if (next < t) next = Date.UTC(y + 1, month - 1, day)
  return Math.round((next - t) / DAY_MS)
}

export function birthdaySoon(note: ClientNote | undefined, today: string): number | null {
  if (!note?.birthday_day || !note.birthday_month) return null
  const n = daysUntilBirthday(note.birthday_day, note.birthday_month, today)
  return n < BIRTHDAY_SOON_DAYS ? n : null
}

export function filterClients(
  clients: Client[], query: string, filter: ClientFilter, now = new Date(),
  notes: Record<string, ClientNote> = {}, today = now.toISOString().slice(0, 10),
): Client[] {
  const q = fold(query.trim())
  const qDigits = query.replace(/\D/g, '')
  return clients.filter(c => {
    if (filter === 'em_risco' && !isAtRisk(c, now)) return false
    if (filter === 'faltas' && c.noShows === 0) return false
    if (filter === 'consentimento' && !c.consent) return false
    if (filter === 'aniversario' && birthdaySoon(notes[c.key], today) === null) return false
    if (!q) return true
    return fold(c.name).includes(q)
      || (qDigits.length >= 3 && c.key.includes(qDigits))
      || fold(notes[c.key]?.notes ?? '').includes(q)
  })
}
