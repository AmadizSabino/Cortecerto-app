import { billingState, lockState, type BillingFields } from './billing'
import { PLAN } from './plan'

/**
 * The admin dashboard's numbers, worked out from admin_dashboard() (migration 0024).
 * Pure functions, so they can be tested without a database.
 */

export interface AdminSalonRow extends BillingFields {
  id: string; name: string; slug: string; type: string; created_at: string
  address: string | null; whatsapp: string | null; has_logo: boolean
  owner_email: string | null; last_sign_in_at: string | null
  services: number; professionals: number; open_days: number; team: number; clients: number
  bookings: number; bookings_30d: number; online_30d: number; noshow_30d: number; value_30d_cents: number
  first_booking_at: string | null; first_online_at: string | null; last_booking_at: string | null
  walkins_30d: number; promotions: number; packs: number; ai_30d: number
}
export interface AdminWeek { week: string; online: number; salao: number; value_cents: number }
export interface AdminAi { feature: string; status: string; n: number; salons: number }
export interface AdminError { message: string; n: number; last_at: string; path: string | null }
export interface AdminJob { jobname: string; schedule: string; active: boolean; last_status: string | null; last_run: string | null; failed_7d: number }
export interface Dashboard { generated_at: string; salons: AdminSalonRow[]; weeks: AdminWeek[]; ai: AdminAi[]; errors: AdminError[]; jobs: AdminJob[] }

const DAY = 86_400_000
/** Whole days since a date, or null when there is none. */
export const daysSince = (iso: string | null | undefined, now: Date) => iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / DAY) : null

/** The setup steps the admin can check: services, team, hours, WhatsApp, logo. */
export function setupSteps(s: AdminSalonRow) {
  return [
    { label: 'Serviços', done: s.services > 0 },
    { label: 'Equipa', done: s.professionals > 0 },
    { label: 'Horário', done: s.open_days > 0 },
    { label: 'WhatsApp', done: (s.whatsapp ?? '').replace(/\D/g, '').length >= 9 },
    { label: 'Logótipo', done: s.has_logo },
  ]
}
export const setupPct = (s: AdminSalonRow) => { const st = setupSteps(s); return Math.round(100 * st.filter(x => x.done).length / st.length) }
/** Ready to take bookings: services, team and opening hours. */
export const isReady = (s: AdminSalonRow) => s.services > 0 && s.professionals > 0 && s.open_days > 0
/** Paid at least once: the admin marked it Ativa or gave it a "Pago até". */
export const hasPaid = (s: AdminSalonRow) => s.subscription === 'ativa' || !!s.paid_until

export type HealthLevel = 'nova' | 'boa' | 'atencao' | 'risco'
export interface Health { score: number; level: HealthLevel; reasons: string[] }

/**
 * 0 to 100 from the owner's last login, bookings in 30 days, the share made online,
 * setup and payment. Salons under 7 days old are "nova" and not judged yet.
 */
export function health(s: AdminSalonRow, now = new Date()): Health {
  const reasons: string[] = []
  let score = 0
  const login = daysSince(s.last_sign_in_at, now)
  if (login !== null && login <= 7) score += 30
  else if (login !== null && login <= 14) { score += 15; reasons.push(`Sem entrar há ${login} dias`) }
  else reasons.push(login === null ? 'Nunca entrou' : `Sem entrar há ${login} dias`)

  if (s.bookings_30d >= 20) score += 30
  else if (s.bookings_30d >= 5) score += 20
  else if (s.bookings_30d >= 1) { score += 10; reasons.push('Poucas marcações') }
  else reasons.push('Sem marcações em 30 dias')

  const share = s.bookings_30d ? s.online_30d / s.bookings_30d : 0
  if (share >= 0.3) score += 15
  else if (share > 0) score += 8
  else if (s.bookings_30d > 0) reasons.push('Nenhuma marcação online')

  if (isReady(s) && setupPct(s) >= 80) score += 15
  else reasons.push('Configuração incompleta')

  const b = billingState(s, now)
  if (lockState(s, now).locked) reasons.push('Conta bloqueada')
  else if (b.kind === 'terminou' || b.kind === 'em_atraso') reasons.push('Pagamento em falta')
  else score += 10

  const age = daysSince(s.created_at, now) ?? 0
  const level: HealthLevel = age < 7 ? 'nova' : score >= 60 ? 'boa' : score >= 35 ? 'atencao' : 'risco'
  return { score, level, reasons }
}

export interface Kpis {
  salons: number; paying: number; mrrCents: number; trial: number; trialsEnding7: number
  unpaid: number; locked: number; signupsThisMonth: number
  bookings30: number; online30: number; value30Cents: number; activeOwners7: number
  /** Of the trials that have ended, how many became paying (null when none ended yet). */
  trialConversion: number | null
}

export function kpis(salons: AdminSalonRow[], now = new Date()): Kpis {
  const month = now.toISOString().slice(0, 7)
  let paying = 0, trial = 0, trialsEnding7 = 0, unpaid = 0, locked = 0, ended = 0, converted = 0
  for (const s of salons) {
    const b = billingState(s, now)
    if (b.kind === 'ativa') paying++
    if (b.kind === 'experimental') { trial++; if (b.daysLeft <= 7) trialsEnding7++ }
    if (b.kind === 'terminou' || b.kind === 'em_atraso') unpaid++
    if (lockState(s, now).locked) locked++
    if (s.trial_ends_at && new Date(s.trial_ends_at) < now) { ended++; if (hasPaid(s)) converted++ }
  }
  const sum = (f: (s: AdminSalonRow) => number) => salons.reduce((t, s) => t + (Number(f(s)) || 0), 0)
  return {
    salons: salons.length, paying, mrrCents: paying * PLAN.priceCents, trial, trialsEnding7, unpaid, locked,
    signupsThisMonth: salons.filter(s => s.created_at.slice(0, 7) === month).length,
    bookings30: sum(s => s.bookings_30d), online30: sum(s => s.online_30d), value30Cents: sum(s => s.value_30d_cents),
    activeOwners7: salons.filter(s => { const d = daysSince(s.last_sign_in_at, now); return d !== null && d <= 7 }).length,
    trialConversion: ended ? converted / ended : null,
  }
}

export interface FunnelStep { label: string; count: number }
/** From sign-up to paying. Each step counts the salons that reached it. */
export function funnel(salons: AdminSalonRow[]): FunnelStep[] {
  return [
    { label: 'Criaram o salão', count: salons.length },
    { label: 'Serviços, equipa e horário', count: salons.filter(isReady).length },
    { label: 'Primeira marcação', count: salons.filter(s => s.first_booking_at).length },
    { label: 'Primeira marcação online', count: salons.filter(s => s.first_online_at).length },
    { label: 'Pagaram', count: salons.filter(hasPaid).length },
  ]
}

export type Severity = 'alta' | 'media'
export interface Attention { salonId: string; salon: string; text: string; severity: Severity }

/** What needs the admin today, most urgent first. */
export function attention(salons: AdminSalonRow[], now = new Date()): Attention[] {
  const out: Attention[] = []
  for (const s of salons) {
    const b = billingState(s, now)
    const lock = lockState(s, now)
    const add = (text: string, severity: Severity) => out.push({ salonId: s.id, salon: s.name, text, severity })
    const age = daysSince(s.created_at, now) ?? 0
    if (lock.locked) add('Conta bloqueada por falta de pagamento', 'alta')
    else if (b.kind === 'terminou' || b.kind === 'em_atraso') add(`Por pagar${lock.daysToLock !== null ? ` · bloqueia em ${lock.daysToLock} d` : ''}`, 'alta')
    else if (b.kind === 'experimental' && b.daysLeft <= 3) add(`Período grátis acaba em ${b.daysLeft} d`, 'alta')
    if (age >= 3 && !isReady(s)) add('Configuração por acabar', 'media')
    const login = daysSince(s.last_sign_in_at, now)
    if (age >= 14 && (login === null || login >= 14)) add(login === null ? 'O dono nunca entrou' : `O dono não entra há ${login} dias`, 'media')
    else if (age >= 14 && isReady(s) && s.bookings_30d === 0) add('Sem marcações em 30 dias', 'media')
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'alta' ? -1 : 1))
}

/** Salons created per week, last `weeks` weeks (Monday start), oldest first. */
export function weeklySignups(salons: AdminSalonRow[], now = new Date(), weeks = 12): { week: string; count: number }[] {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  const out = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(monday.getTime() - (weeks - 1 - i) * 7 * DAY)
    return { week: d.toISOString().slice(0, 10), count: 0 }
  })
  for (const s of salons) {
    const t = new Date(s.created_at).getTime()
    for (let i = out.length - 1; i >= 0; i--) {
      if (t >= new Date(out[i].week + 'T00:00:00Z').getTime()) { if (t < monday.getTime() + 7 * DAY) out[i].count++; break }
    }
  }
  return out
}

export const HEALTH_LABEL: Record<HealthLevel, string> = { nova: 'Nova', boa: 'Boa', atencao: 'Atenção', risco: 'Em risco' }
export const HEALTH_TAG: Record<HealthLevel, string> = { nova: 'confirmada', boa: 'concluida', atencao: 'pendente', risco: 'faltou' }

/** "há 3 d", "hoje", "nunca". */
export function since(iso: string | null | undefined, now = new Date()) {
  const d = daysSince(iso, now)
  return d === null ? 'nunca' : d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} d`
}

