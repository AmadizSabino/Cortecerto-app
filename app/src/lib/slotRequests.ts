/**
 * "Pedir este horário" (migration 0031): a client asks for a time that is already taken and
 * waits on the salon's waiting list until the salon answers. Pure helpers for the booking page,
 * the salon's card in Hoje and the client's page (/horario/<id>).
 */
import { freeSlots, type Interval, type OpeningHours } from './slots'
import { formatTime } from './time'

export type RequestStatus = 'espera' | 'proposta' | 'marcada' | 'recusada' | 'cancelada'

/** A row of slot_requests, as the salon reads it. */
export interface SlotRequest {
  id: string; salon_id: string; service_id: string; professional_id: string | null
  starts_at: string; alt_starts_at: string | null; duration_min: number
  client_name: string; client_phone: string; consent_messages: boolean; note: string | null
  status: RequestStatus; proposed_starts_at: string | null; proposed_professional_id: string | null
  proposal_note: string | null; client_declined_at: string | null; booking_id: string | null
  created_at: string; answered_at: string | null
}

/** The client's private page for a request. */
export const requestLink = (origin: string, id: string) => `${origin}/horario/${id}`

/** Times a request can be made for are shown every half hour, like a paper diary. */
export const REQUEST_STEP_MIN = 30

/**
 * Times on a day that are within working hours but taken, for the professionals the client
 * could have (one, or everyone for "Qualquer um"). A time counts as taken only when nobody
 * on the list has it free: otherwise the client can simply book it.
 */
export function takenTimes(opts: {
  date: string; tz: string; now: Date
  pros: { hours: OpeningHours[]; busy: Interval[]; durationMin: number }[]
}): Date[] {
  const { date, tz, now, pros } = opts
  const open = new Set<number>(), free = new Set<number>()
  for (const p of pros) {
    for (const t of freeSlots({ date, tz, hours: p.hours, durationMin: p.durationMin, busy: [], now, stepMin: REQUEST_STEP_MIN })) open.add(t.getTime())
    for (const t of freeSlots({ date, tz, hours: p.hours, durationMin: p.durationMin, busy: p.busy, now, stepMin: 5 })) free.add(t.getTime())
  }
  return [...open].filter(t => !free.has(t)).sort((a, b) => a - b).map(t => new Date(t))
}

/** "quinta, 27 de novembro, às 15:00" */
export function longWhen(d: Date, tz: string): string {
  return `${d.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })}, às ${formatTime(d, tz)}`
}

/** "qui, 27 nov · 15:00" */
export function shortWhen(d: Date, tz: string): string {
  return `${d.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')} · ${formatTime(d, tz)}`
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? ''

/** To the client who has the time: could they move? (The salon then uses "Sugerir outro horário" on that booking.) */
export function askToMoveMessage(otherName: string, salonName: string, serviceName: string, when: Date, tz: string): string {
  return `Olá ${first(otherName)}! Fala o ${salonName}. Sobre a sua marcação de ${serviceName} de ${longWhen(when, tz)}: haveria hipótese de mudar para outra hora? Diga-nos o que lhe dá mais jeito. Obrigado!`
}

/** To the client who asked: they got the time. */
export function acceptedMessage(name: string, salonName: string, serviceName: string, when: Date, tz: string, manage: string): string {
  return `Olá ${first(name)}! Boas notícias: conseguimos o horário que pediu. Fica marcado ${serviceName} no ${salonName} para ${longWhen(when, tz)}. Se precisar de mudar ou cancelar: ${manage} Até lá!`
}

/** To the client who asked: another time, with the link to accept it. */
export function proposalMessage(name: string, salonName: string, when: Date, tz: string, link: string, note?: string | null): string {
  return `Olá ${first(name)}! O horário que pediu no ${salonName} não está livre, mas podemos marcar para ${longWhen(when, tz)}.${note ? ` ${note}` : ''} Aceite ou recuse aqui, com um toque: ${link}`
}

/** To the client who asked: the salon can't fit them in. */
export function declinedMessage(name: string, salonName: string, bookingLink: string): string {
  return `Olá ${first(name)}! Infelizmente não conseguimos arranjar o horário que pediu no ${salonName}. Pedimos desculpa. Pode ver os horários livres e marcar aqui: ${bookingLink}`
}

/** Still on the waiting list (or waiting for the client's answer) and one of its times is still ahead. */
export function isOpen(r: Pick<SlotRequest, 'status' | 'starts_at' | 'alt_starts_at' | 'proposed_starts_at'>, now = new Date()): boolean {
  if (r.status !== 'espera' && r.status !== 'proposta') return false
  return [r.starts_at, r.alt_starts_at, r.proposed_starts_at].some(t => t && new Date(t).getTime() > now.getTime())
}

/** The bookings sitting on a requested time (for the same professional, or anyone's for "Qualquer um"). */
export function sittingOn<T extends { professional_id: string; starts_at: string; ends_at: string; status: string }>(
  bookings: T[], when: Date, minutes: number, professionalId: string | null,
): T[] {
  const s = when.getTime(), e = s + minutes * 60000
  return bookings.filter(b => (b.status === 'pendente' || b.status === 'confirmada')
    && (!professionalId || b.professional_id === professionalId)
    && new Date(b.starts_at).getTime() < e && new Date(b.ends_at).getTime() > s)
}
