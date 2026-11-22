import type { SalonHours } from './schedule'
import { hoursFor } from './schedule'
import { addDays, zonedToUtc } from './time'
import type { Occasion } from './promos'

/**
 * The Social Media Manager's week: quiet periods in the agenda worth a promotion,
 * and a short plan of posts for the type of salon.
 */

export interface Quiet { date: string; weekday: number; period: 'manhã' | 'tarde' | 'fim do dia'; from: string; to: string; occupancy: number; openMin: number }

const PERIODS: { name: Quiet['period']; from: number; to: number }[] = [
  { name: 'manhã', from: 0, to: 13 * 60 }, { name: 'tarde', from: 13 * 60, to: 17 * 60 }, { name: 'fim do dia', from: 17 * 60, to: 24 * 60 },
]
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const weekdayOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay()

/**
 * Periods (morning, afternoon, evening) in the next `days` days where less than
 * `threshold` of the team's working time is booked. Busy = bookings and time off, as busy_slots returns them.
 */
export function quietPeriods(o: {
  today: string; days?: number; pros: string[]; hours: SalonHours; tz: string; now: Date
  busy: { professional_id: string; start: Date; end: Date }[]; threshold?: number; max?: number
}): Quiet[] {
  const out: Quiet[] = []
  for (let i = 0; i < (o.days ?? 7); i++) {
    const date = addDays(o.today, i), wd = weekdayOf(date)
    for (const p of PERIODS) {
      let open = 0, booked = 0, first = Infinity, last = -Infinity
      for (const pro of o.pros) {
        for (const r of hoursFor(o.hours, pro).filter(h => h.weekday === wd)) {
          const s = Math.max(toMin(r.opens), p.from), e = Math.min(toMin(r.closes), p.to)
          if (e - s < 30) continue
          first = Math.min(first, s); last = Math.max(last, e)
          const S = zonedToUtc(date, toHm(s), o.tz).getTime(), E = zonedToUtc(date, toHm(e), o.tz).getTime()
          open += (E - S) / 60000
          for (const b of o.busy) if (b.professional_id === pro) {
            const ov = Math.min(E, b.end.getTime()) - Math.max(S, b.start.getTime())
            if (ov > 0) booked += ov / 60000
          }
        }
      }
      if (open < 90) continue
      // Too soon to post about (it ends within 3 hours).
      if (zonedToUtc(date, toHm(last), o.tz).getTime() < o.now.getTime() + 3 * 3600_000) continue
      const occupancy = booked / open
      if (occupancy < (o.threshold ?? 0.4)) out.push({ date, weekday: wd, period: p.name, from: toHm(first), to: toHm(last), occupancy, openMin: open })
    }
  }
  return out.sort((a, b) => a.occupancy - b.occupancy || a.date.localeCompare(b.date)).slice(0, o.max ?? 3)
    .sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from))
}

const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
/** "Terça, 25 nov, à tarde (14h–17h)". */
export function quietText(q: Quiet): string {
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const d = `${Number(q.date.slice(8, 10))} ${months[Number(q.date.slice(5, 7)) - 1]}`
  const h = (t: string) => t.endsWith(':00') ? `${Number(t.slice(0, 2))}h` : `${Number(t.slice(0, 2))}h${t.slice(3)}`
  const when = q.period === 'manhã' ? 'de manhã' : q.period === 'tarde' ? 'à tarde' : 'ao fim do dia'
  return `${DAYS[q.weekday][0].toUpperCase()}${DAYS[q.weekday].slice(1)}, ${d}, ${when} (${h(q.from)}–${h(q.to)})`
}

export interface PlanItem { key: string; day: string; title: string; how: string; action?: 'galeria' | 'promo' | 'data' }

const POSTS: Record<string, { mon: [string, string]; fri: [string, string] }> = {
  barbearia: { mon: ['Antes e depois de um corte', 'Duas fotos do mesmo cliente, de frente e de lado. Peça autorização.'], fri: ['Vídeo curto do corte da semana', '15 segundos a acabar um degradé, com música do momento.'] },
  cabeleireiro: { mon: ['Transformação da semana', 'Antes e depois de uma cor ou de um corte, com a mesma luz.'], fri: ['Dica de cuidado do cabelo', 'Uma dica simples (proteção do calor, lavagem) em 2 frases ou num vídeo curto.'] },
  unhas: { mon: ['Nail art da semana', 'Foto de perto, com luz natural, das unhas mais bonitas da semana.'], fri: ['Cores da estação', 'Três cores do expositor que estão a sair mais.'] },
  depilacao: { mon: ['Dica de cuidados com a pele', 'O que fazer antes e depois da depilação, em 3 pontos.'], fri: ['Mito ou verdade?', 'Um mito comum, desfeito em duas frases.'] },
}

/** Three posts for the week, adapted to the salon: its work, an empty slot to fill, and something useful; plus a date coming up. */
export function weekPlan(o: { type: string; hasPhotos: boolean; quiet: Quiet | null; next: Occasion | null; today: string }): PlanItem[] {
  const t = POSTS[o.type] ?? POSTS.barbearia
  const items: PlanItem[] = [
    { key: 'trabalho', day: 'Segunda', title: t.mon[0], how: o.hasPhotos ? t.mon[1] : `${t.mon[1]} Junte também a foto à galeria da página de marcação.`, action: 'galeria' },
    o.quiet
      ? { key: 'vaga', day: 'Quarta', title: `Promoção para ${quietText(o.quiet).toLowerCase()}`, how: `Só ${Math.round(o.quiet.occupancy * 100)}% ocupado. Uma oferta nessas horas enche a agenda sem baixar os preços do resto da semana.`, action: 'promo' }
      : { key: 'vaga', day: 'Quarta', title: 'Agenda da semana', how: 'A agenda está bem preenchida: mostre as últimas vagas com o link de marcação.' },
    { key: 'util', day: 'Sexta', title: t.fri[0], how: t.fri[1] },
  ]
  if (o.next) {
    const days = Math.round((new Date(o.next.date + 'T12:00:00Z').getTime() - new Date(o.today + 'T12:00:00Z').getTime()) / 86400000)
    if (days <= 21) items.push({ key: `data-${o.next.date}`, day: days <= 7 ? 'Esta semana' : 'A preparar', title: `${o.next.name} (daqui a ${days} ${days === 1 ? 'dia' : 'dias'})`, how: o.next.idea, action: 'data' })
  }
  return items
}

/** Monday of the week, YYYY-MM-DD: the checklist starts over every week. */
export function weekKey(today: string): string {
  const wd = weekdayOf(today)
  return addDays(today, wd === 0 ? -6 : 1 - wd)
}
