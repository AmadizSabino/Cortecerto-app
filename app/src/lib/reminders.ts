import type { Booking } from './supabase'
import { euros } from './supabase'
import { formatTime } from './time'

/** Bookings that still get a reminder: not cancelled, not a no-show, not done. */
export function wantsReminder(b: Pick<Booking, 'status'>): boolean {
  return b.status === 'pendente' || b.status === 'confirmada'
}

export interface ReminderInput {
  clientName: string
  serviceName: string
  startsAt: Date
  tz: string
  salonName: string
  /** Deposit still owed: amount and the salon's MB Way number. */
  depositDue?: { cents: number; mbway: string } | null
  /** "amanhã" when the booking is tomorrow; otherwise the weekday is used. */
  isTomorrow: boolean
}

/** The WhatsApp reminder text, in European Portuguese. */
export function reminderMessage(i: ReminderInput): string {
  const first = i.clientName.trim().split(/\s+/)[0]
  const day = i.startsAt.toLocaleDateString('pt-PT', { timeZone: i.tz, weekday: 'long', day: 'numeric', month: 'long' })
  const when = i.isTomorrow ? `amanhã, ${day},` : `${day},`
  let text = `Olá ${first}! Lembramos a sua marcação de ${i.serviceName} no ${i.salonName} ${when} às ${formatTime(i.startsAt, i.tz)}.`
  if (i.depositDue) text += ` Falta o sinal de ${euros(i.depositDue.cents)} por MB Way para o ${i.depositDue.mbway}.`
  text += ' Se não puder vir, responda a esta mensagem para libertarmos a vaga. Até breve!'
  return text
}

const KEY = 'cortecerto-reminders'
/** Fallback before migration 0006: remembers sent reminders in this browser only. */
export function localSent(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string> } catch { return {} }
}
export function saveLocalSent(id: string, at: string) {
  try {
    const all = localSent()
    all[id] = at
    // Keep the last 500 so the browser storage stays small.
    const trimmed = Object.fromEntries(Object.entries(all).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 500))
    localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch { /* private mode */ }
}
