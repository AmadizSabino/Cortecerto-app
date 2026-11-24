import type { OpeningHours } from './slots'
import { addDays, formatTime, weekdayOf, zonedToUtc } from './time'
import { bookingPrice } from './pricing'
import { euros } from './supabase'

/** What the salon assistant needs of a booking. Client names and phones are never included. */
export interface CtxBooking {
  starts_at: string; ends_at: string; status: string
  service_id: string; professional_id: string
  price_cents?: number | null; home_fee_cents?: number; location?: string
}

const STATUS: Record<string, string> = { pendente: 'por confirmar', confirmada: 'confirmada', concluida: 'concluída', faltou: 'faltou', cancelada: 'cancelada' }
const live = (b: CtxBooking) => b.status !== 'cancelada'
const minutes = (from: string, to: string) => {
  const [a, b] = from.split(':').map(Number), [c, d] = to.split(':').map(Number)
  return Math.max(0, (c * 60 + d) - (a * 60 + b))
}
const hm = (m: number) => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`

/**
 * The salon's diary as plain text for the AI assistant: today and the next 7 days booking by booking
 * (time, service, professional, status, free time left), and the last 7 days in numbers.
 */
export function scheduleContext(o: {
  salonName: string; salonType: string; tz: string; now: Date; today: string
  hours: OpeningHours[]; pros: Record<string, { name: string }>
  services: Record<string, { name: string; price_cents: number; duration_min: number }>
  bookings: CtxBooking[]
  /** Money figures (takings per day) only for the owner. */
  money?: boolean
}): string {
  const { tz, today, services, pros } = o
  const money = o.money !== false
  const dayOf = (b: CtxBooking) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(b.starts_at))
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-PT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'numeric' })
  const proCount = Math.max(1, Object.keys(pros).length)
  const out: string[] = [
    `Salão: ${o.salonName} (${o.salonType}). Profissionais: ${Object.values(pros).map(p => p.name).join(', ') || 'não indicados'}.`,
    `Agora: ${label(today)}, ${formatTime(o.now, tz)}.`,
    `Serviços: ${Object.values(services).map(s => `${s.name} ${euros(s.price_cents)} (${s.duration_min} min)`).join('; ')}.`,
    '',
    'AGENDA (hoje e próximos 7 dias):',
  ]
  for (let i = 0; i <= 7; i++) {
    const d = addDays(today, i)
    const open = o.hours.filter(h => h.weekday === weekdayOf(d))
    const day = o.bookings.filter(b => dayOf(b) === d).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    const head = `${i === 0 ? 'Hoje, ' : i === 1 ? 'Amanhã, ' : ''}${label(d)}`
    if (!open.length && !day.length) { out.push(`- ${head}: fechado.`); continue }
    const openMin = open.reduce((s, h) => s + minutes(h.opens, h.closes), 0) * proCount
    const busyMin = day.filter(live).reduce((s, b) => s + Math.round((Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60000), 0)
    const value = day.filter(b => b.status !== 'cancelada' && b.status !== 'faltou').reduce((s, b) => s + bookingPrice(b, services), 0)
    const opening = open.map(h => `${h.opens}–${h.closes}`).join(' e ')
    out.push(`- ${head} (aberto ${opening || 'sem horário'}): ${day.filter(live).length} marcações, ${money ? `${euros(value)}, ` : ''}livre cerca de ${hm(Math.max(0, openMin - busyMin))} no total da equipa.`)
    for (const b of day) {
      const s = new Date(b.starts_at), e = new Date(b.ends_at)
      out.push(`  ${formatTime(s, tz)}–${formatTime(e, tz)} ${services[b.service_id]?.name ?? 'serviço'} com ${pros[b.professional_id]?.name ?? '?'}${b.location === 'domicilio' ? ' (ao domicílio)' : ''}, ${STATUS[b.status] ?? b.status}`)
    }
  }
  out.push('', 'ÚLTIMOS 7 DIAS:')
  for (let i = 7; i >= 1; i--) {
    const d = addDays(today, -i)
    const day = o.bookings.filter(b => dayOf(b) === d)
    if (!day.length) continue
    const done = day.filter(b => b.status === 'concluida')
    out.push(`- ${label(d)}: ${done.length} feitas, ${day.filter(b => b.status === 'faltou').length} faltas, ${day.filter(b => b.status === 'cancelada').length} canceladas${money ? `, ${euros(done.reduce((s, b) => s + bookingPrice(b, services), 0))}` : ''}.`)
  }
  return out.join('\n')
}

/** The time range to load for the context: from 7 days ago to the end of the 7th day ahead. */
export function contextRange(today: string, tz: string): { from: string; to: string } {
  return { from: zonedToUtc(addDays(today, -7), '00:00', tz).toISOString(), to: zonedToUtc(addDays(today, 8), '00:00', tz).toISOString() }
}
