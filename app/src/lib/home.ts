/**
 * Home visits (migration 0022). The price is set before booking: the services, the
 * zone's travel fee, and the fees the salon switched on. No stopwatch decides the price.
 * The database applies the same rules (home_fees_for, create_home_booking).
 */

export interface HomeSettings { salon_id: string; active: boolean; min_order_cents: number; deposit_required: boolean }
export interface Zone { id: string; name: string; postcodes: string[]; fee_cents: number; travel_min: number; position: number; active: boolean }
export interface HomeFee { id: string; label: string; rule: 'sempre' | 'antes_das' | 'depois_das' | 'fim_de_semana'; at: string | null; amount_cents: number; active: boolean }

export const FEE_RULES: { id: HomeFee['rule']; label: string }[] = [
  { id: 'sempre', label: 'Sempre' },
  { id: 'antes_das', label: 'Se começar antes das…' },
  { id: 'depois_das', label: 'Se começar a partir das…' },
  { id: 'fim_de_semana', label: 'Ao sábado e domingo' },
]

/** The zone for a postcode ("2900-123" or "2900"), by its first 4 digits. */
export function zoneFor(postcode: string, zones: Zone[]): Zone | null {
  const p = postcode.replace(/\D/g, '').slice(0, 4)
  if (p.length < 4) return null
  return zones.find(z => z.active && z.postcodes.some(c => c.replace(/\D/g, '').slice(0, 4) === p)) ?? null
}

function local(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]))
  return { time: `${p.hour}:${p.minute}`, weekend: p.weekday === 'Sat' || p.weekday === 'Sun' }
}

/** The fees that apply to a visit starting at `start` (salon time). */
export function feesFor(fees: HomeFee[], start: Date, tz: string): HomeFee[] {
  const { time, weekend } = local(start, tz)
  return fees.filter(f => f.active && (
    f.rule === 'sempre'
    || (f.rule === 'antes_das' && f.at && time < f.at.slice(0, 5))
    || (f.rule === 'depois_das' && f.at && time >= f.at.slice(0, 5))
    || (f.rule === 'fim_de_semana' && weekend)))
}

/** The full price of a home visit, line by line. */
export function homeQuote(o: { servicesCents: number; zone: Zone | null; fees: HomeFee[]; start: Date | null; tz: string }): { lines: { label: string; cents: number }[]; total: number } {
  const lines = [{ label: 'Serviço', cents: o.servicesCents }]
  if (o.zone) lines.push({ label: `Deslocação (${o.zone.name})`, cents: o.zone.fee_cents })
  if (o.start) for (const f of feesFor(o.fees, o.start, o.tz)) lines.push({ label: f.label, cents: f.amount_cents })
  return { lines: lines.filter(l => l.cents > 0 || l.label === 'Serviço'), total: lines.reduce((s, l) => s + l.cents, 0) }
}

/** Busy times widened by the travel time each way, so a home visit's trip fits around other bookings. */
export const widen = <T extends { start: Date; end: Date }>(busy: T[], travelMin: number): T[] =>
  busy.map(b => ({ ...b, start: new Date(b.start.getTime() - travelMin * 60000), end: new Date(b.end.getTime() + travelMin * 60000) }))

/** "Estou a caminho" message, with the minutes to arrive. */
export const onTheWay = (clientName: string, salonName: string, minutes: number) =>
  `Olá ${clientName.trim().split(/\s+/)[0]}! Daqui é do ${salonName}: estou a caminho e chego dentro de cerca de ${minutes} minutos.`
