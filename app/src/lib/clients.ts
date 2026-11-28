import type { Booking, Service } from './supabase'
import { waNumber } from './whatsapp'
import { bookingPrice } from './pricing'

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
  registered?: boolean   // on the salon's own client list (salon_clients, migration 0018)
  email?: string | null
  /** Optional details from the salon's list (migration 0036). */
  details?: ClientDetails
}

/** Optional details the salon keeps on its list (salon_clients, migration 0036). */
export interface ClientDetails {
  preferred_pro?: string | null
  heard_from?: string | null
  nif?: string | null
  consent_messages?: boolean | null
  consent_at?: string | null
}

export const HEARD_FROM: { id: string; label: string }[] = [
  { id: 'amigo', label: 'Um amigo ou familiar' }, { id: 'instagram', label: 'Instagram' }, { id: 'facebook', label: 'Facebook' },
  { id: 'tiktok', label: 'TikTok' }, { id: 'google', label: 'Google ou Maps' }, { id: 'passagem', label: 'Passou à porta' }, { id: 'outro', label: 'Outro' },
]

/** A Portuguese NIF: 9 digits with a valid check digit. */
export function validNif(nif: string): boolean {
  if (!/^[0-9]{9}$/.test(nif)) return false
  const sum = [...nif.slice(0, 8)].reduce((s, d, i) => s + Number(d) * (9 - i), 0)
  const check = 11 - (sum % 11)
  return (check >= 10 ? 0 : check) === Number(nif[8])
}

/**
 * Consent to messages: the most recent signal wins, either the tick in the client's latest online booking
 * or what the salon recorded in person (with its date).
 */
export function mergedConsent(fromBooking: { consent: boolean; at: string | null }, salon?: ClientDetails): boolean {
  if (salon?.consent_at && salon.consent_messages != null && (!fromBooking.at || salon.consent_at > fromBooking.at)) return salon.consent_messages
  return fromBooking.consent
}

/** A client the salon added to its list (salon_clients, migration 0018). */
export interface RegisteredClient extends ClientDetails { phone_key: string; name: string; phone: string; email: string | null; source: string; created_at: string }

/**
 * Adds the salon's own list to the clients found in bookings: the salon's name
 * and email win, and clients without bookings yet (invited or added by hand)
 * come first, newest first.
 */
export function mergeRegistered(clients: Client[], registered: RegisteredClient[]): Client[] {
  const byKey = new Map(registered.map(r => [r.phone_key, r]))
  const merged = clients.map(c => {
    const r = byKey.get(c.key)
    if (!r) return { ...c, registered: false }
    const latest = c.bookings[0] as (typeof c.bookings)[number] & { created_at?: string } | undefined
    const consent = mergedConsent({ consent: c.consent, at: latest ? latest.created_at ?? latest.starts_at : null }, r)
    return { ...c, name: r.name || c.name, email: r.email, registered: true, consent, details: detailsOf(r) }
  })
  const seen = new Set(clients.map(c => c.key))
  const only = registered.filter(r => !seen.has(r.phone_key)).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r): Client => ({
    key: r.phone_key, name: r.name, phone: r.phone, bookings: [], visits: 0, noShows: 0, spentCents: 0,
    lastVisit: null, nextBooking: null, consent: mergedConsent({ consent: false, at: null }, r), registered: true, email: r.email, details: detailsOf(r),
  }))
  return [...only, ...merged]
}

const detailsOf = (r: ClientDetails): ClientDetails =>
  ({ preferred_pro: r.preferred_pro, heard_from: r.heard_from, nif: r.nif, consent_messages: r.consent_messages, consent_at: r.consent_at })

export type ClientFilter = 'todos' | 'em_risco' | 'faltas' | 'consentimento' | 'aniversario' | 'loja'

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
      spentCents: done.reduce((sum, b) => sum + bookingPrice(b, services), 0),
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
  buyers: Set<string> = new Set(), // phone keys of shop buyers (lib/shop.ts buyerKeys)
): Client[] {
  const q = fold(query.trim())
  const qDigits = query.replace(/\D/g, '')
  return clients.filter(c => {
    if (filter === 'em_risco' && !isAtRisk(c, now)) return false
    if (filter === 'faltas' && c.noShows === 0) return false
    if (filter === 'consentimento' && !c.consent) return false
    if (filter === 'aniversario' && birthdaySoon(notes[c.key], today) === null) return false
    if (filter === 'loja' && !buyers.has(c.key)) return false
    if (!q) return true
    return fold(c.name).includes(q)
      || (qDigits.length >= 3 && c.key.includes(qDigits))
      || fold(notes[c.key]?.notes ?? '').includes(q)
  })
}

const firstName = (n: string) => n.trim().split(/\s+/)[0]?.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() ?? ''

/** True when a booking was made under another person's name than the client's (a shared phone). */
export function otherPerson(clientName: string, bookingName: string): boolean {
  const a = firstName(clientName), b = firstName(bookingName)
  return !!a && !!b && a !== b && bookingName !== 'Cliente apagado'
}

/**
 * Other names this phone number booked under, most recent first (a shared family phone, or tests).
 * Clients are kept per phone number, so the salon should see when one number covers several people.
 */
export function otherNames(name: string, bookings: Pick<Booking, 'client_name'>[]): string[] {
  const seen = new Set<string>(), out: string[] = []
  for (const b of bookings) {
    if (!otherPerson(name, b.client_name)) continue
    const k = firstName(b.client_name)
    if (seen.has(k)) continue
    seen.add(k); out.push(b.client_name.trim())
  }
  return out
}
