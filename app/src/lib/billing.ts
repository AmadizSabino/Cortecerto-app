/** Trial and subscription status (migration 0015). */

export interface BillingFields {
  subscription?: 'experimental' | 'ativa' | 'em_atraso' | 'cancelada'
  trial_ends_at?: string
  paid_until?: string | null
}

export type BillingState =
  | { kind: 'sem_dados' }                       // before migration 0015
  | { kind: 'experimental'; daysLeft: number }  // in the free trial
  | { kind: 'ativa'; until: string | null }
  | { kind: 'terminou' }                        // trial over, nothing paid
  | { kind: 'em_atraso' }
  | { kind: 'cancelada' }

const DAY = 86_400_000

export function billingState(s: BillingFields, now = new Date()): BillingState {
  if (!s.subscription || !s.trial_ends_at) return { kind: 'sem_dados' }
  if (s.subscription === 'ativa') {
    // Paid up to a date that has passed and no renewal yet: treat as overdue.
    if (s.paid_until && new Date(s.paid_until).getTime() < now.getTime()) return { kind: 'em_atraso' }
    return { kind: 'ativa', until: s.paid_until ?? null }
  }
  if (s.subscription === 'em_atraso') return { kind: 'em_atraso' }
  if (s.subscription === 'cancelada') return { kind: 'cancelada' }
  const left = Math.ceil((new Date(s.trial_ends_at).getTime() - now.getTime()) / DAY)
  return left > 0 ? { kind: 'experimental', daysLeft: left } : { kind: 'terminou' }
}

/** The panel shows a notice in the last week of the trial and whenever payment is needed. */
export function needsNotice(b: BillingState): boolean {
  return (b.kind === 'experimental' && b.daysLeft <= 7) || b.kind === 'terminou' || b.kind === 'em_atraso' || b.kind === 'cancelada'
}

/** Days after the money was due before the account becomes read-only (migration 0023). */
export const GRACE_DAYS = 14

export type LockState = { locked: true } | { locked: false; daysToLock: number | null }

/**
 * Mirrors salon_locked() in the database: read-only 14 days after the trial or
 * the paid period ends; a cancelled salon when its paid period ends.
 * daysToLock is set while the salon is in those 14 days.
 */
export function lockState(s: BillingFields, now = new Date()): LockState {
  if (!s.subscription || !s.trial_ends_at) return { locked: false, daysToLock: null }
  const due = s.subscription === 'experimental' ? s.trial_ends_at
    : s.subscription === 'ativa' ? s.paid_until ?? null
    : s.paid_until ?? s.trial_ends_at
  if (!due) return { locked: false, daysToLock: null }
  const lockAt = new Date(due).getTime() + (s.subscription === 'cancelada' ? 0 : GRACE_DAYS * DAY)
  if (now.getTime() > lockAt) return { locked: true }
  return { locked: false, daysToLock: now.getTime() > new Date(due).getTime() ? Math.ceil((lockAt - now.getTime()) / DAY) : null }
}

/** What the panel says when the database refuses a change because the account is read-only. */
export const LOCKED_MESSAGE = 'A conta está só de leitura até a assinatura ser paga. Veja em Mais › Assinatura.'
export const isLockedError = (e: { message?: string } | null | undefined) => !!e?.message?.includes('salao_bloqueado')
