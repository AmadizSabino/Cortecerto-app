import { expect, it } from 'vitest'
import { billingState, lockState, needsNotice } from './billing'

const now = new Date('2026-11-21T12:00:00Z')

it('counts trial days and says when it ended', () => {
  expect(billingState({ subscription: 'experimental', trial_ends_at: '2026-12-21T12:00:00Z' }, now)).toEqual({ kind: 'experimental', daysLeft: 30 })
  expect(billingState({ subscription: 'experimental', trial_ends_at: '2026-11-21T18:00:00Z' }, now)).toEqual({ kind: 'experimental', daysLeft: 1 })
  expect(billingState({ subscription: 'experimental', trial_ends_at: '2026-11-20T12:00:00Z' }, now)).toEqual({ kind: 'terminou' })
})

it('reads paid, overdue and cancelled, and works before the migration', () => {
  expect(billingState({ subscription: 'ativa', trial_ends_at: 'x', paid_until: '2026-12-21T00:00:00Z' }, now)).toEqual({ kind: 'ativa', until: '2026-12-21T00:00:00Z' })
  expect(billingState({ subscription: 'ativa', trial_ends_at: 'x', paid_until: '2026-11-01T00:00:00Z' }, now)).toEqual({ kind: 'em_atraso' })
  expect(billingState({ subscription: 'cancelada', trial_ends_at: 'x' }, now)).toEqual({ kind: 'cancelada' })
  expect(billingState({}, now)).toEqual({ kind: 'sem_dados' })
})

it('shows a notice only in the last week or when payment is needed', () => {
  expect(needsNotice({ kind: 'experimental', daysLeft: 20 })).toBe(false)
  expect(needsNotice({ kind: 'experimental', daysLeft: 7 })).toBe(true)
  expect(needsNotice({ kind: 'terminou' })).toBe(true)
  expect(needsNotice({ kind: 'ativa', until: null })).toBe(false)
})

it('locks 14 days after the money was due, like the database', () => {
  const trial = (d: string) => lockState({ subscription: 'experimental', trial_ends_at: d }, now)
  expect(trial('2026-12-01T00:00:00Z')).toEqual({ locked: false, daysToLock: null })
  expect(trial('2026-11-11T12:00:00Z')).toEqual({ locked: false, daysToLock: 4 })
  expect(trial('2026-11-01T00:00:00Z')).toEqual({ locked: true })
  expect(lockState({ subscription: 'ativa', trial_ends_at: 'x', paid_until: '2026-11-01T00:00:00Z' }, now)).toEqual({ locked: true })
  expect(lockState({ subscription: 'ativa', trial_ends_at: 'x', paid_until: null }, now)).toEqual({ locked: false, daysToLock: null })
  expect(lockState({ subscription: 'cancelada', trial_ends_at: '2026-10-01T00:00:00Z', paid_until: '2026-11-20T00:00:00Z' }, now)).toEqual({ locked: true })
  expect(lockState({}, now)).toEqual({ locked: false, daysToLock: null })
})
