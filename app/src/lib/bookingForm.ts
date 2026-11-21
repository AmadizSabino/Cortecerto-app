import { zonedToUtc } from './time'

export interface BookingDraft {
  clientName: string
  clientPhone: string
  serviceId: string
  professionalId: string
  date: string // YYYY-MM-DD in the salon's timezone
  time: string // HH:MM
}

/** Problems with a draft, in Portuguese, or '' when it can be saved. */
export function validateDraft(d: BookingDraft): string {
  if (!d.clientName.trim()) return 'Indique o nome do cliente.'
  const digits = d.clientPhone.replace(/\D/g, '')
  if (digits && digits.length < 9) return 'Telemóvel inválido (ou deixe em branco).'
  if (!d.serviceId) return 'Escolha o serviço.'
  if (!d.professionalId) return 'Escolha o profissional.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return 'Escolha o dia.'
  if (!/^\d{2}:\d{2}$/.test(d.time)) return 'Escolha a hora.'
  return ''
}

/** Start and end instants for a draft, given the service duration. */
export function draftInterval(d: Pick<BookingDraft, 'date' | 'time'>, tz: string, durationMin: number): { starts_at: string; ends_at: string } {
  const start = zonedToUtc(d.date, d.time, tz)
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + durationMin * 60000).toISOString() }
}

/** Database error → message for the salon. */
export function saveErrorText(message: string): string {
  if (message.includes('no_overlap') || message.includes('exclusion') || message.includes('conflicting key')) {
    return 'Esse profissional já tem uma marcação a essa hora. Escolha outra hora.'
  }
  return 'Não foi possível guardar. Tente de novo.'
}
