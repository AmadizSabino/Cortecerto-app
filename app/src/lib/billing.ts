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
