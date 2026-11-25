import { describe, expect, it } from 'vitest'
import { acceptedMessage, declinedMessage, isOpen, proposalMessage, sittingOn, takenTimes } from './slotRequests'

const tz = 'Europe/Lisbon'
const hours = [{ weekday: 4, opens: '09:00', closes: '12:00' }] // Thursday
const now = new Date('2026-11-26T07:00:00Z')
const at = (hhmm: string) => new Date(`2026-11-26T${hhmm}:00Z`) // Lisbon = UTC in November

describe('taken times', () => {
  it('lists the half hours that are within hours but busy', () => {
    const t = takenTimes({ date: '2026-11-26', tz, now, pros: [{ hours, durationMin: 30, busy: [{ start: at('10:00'), end: at('11:00') }] }] })
    expect(t.map(d => d.toISOString().slice(11, 16))).toEqual(['10:00', '10:30'])
  })

  it('a time someone else has free is not taken for "Qualquer um"', () => {
    const t = takenTimes({ date: '2026-11-26', tz, now, pros: [
      { hours, durationMin: 30, busy: [{ start: at('10:00'), end: at('11:00') }] },
      { hours, durationMin: 30, busy: [{ start: at('10:30'), end: at('11:00') }] },
    ] })
    expect(t.map(d => d.toISOString().slice(11, 16))).toEqual(['10:30'])
  })

  it('skips times already gone', () => {
    const t = takenTimes({ date: '2026-11-26', tz, now: at('10:15'), pros: [{ hours, durationMin: 30, busy: [{ start: at('09:00'), end: at('11:00') }] }] })
    expect(t.map(d => d.toISOString().slice(11, 16))).toEqual(['10:30'])
  })
})

describe('messages', () => {
  it('use the first name and carry the links', () => {
    expect(acceptedMessage('João Silva', 'Barba e Beer', 'Corte', at('15:00'), tz, 'https://x/m/1')).toContain('Olá João!')
    expect(proposalMessage('Ana', 'Barba e Beer', at('15:00'), tz, 'https://x/horario/1', 'Às 3 dá.')).toMatch(/15:00\. Às 3 dá\. Aceite .* https:\/\/x\/horario\/1$/)
    expect(declinedMessage('Rui', 'B', 'https://x/s/b')).toContain('https://x/s/b')
  })
})

describe('open requests', () => {
  const base = { status: 'espera' as const, starts_at: '2026-11-26T10:00:00Z', alt_starts_at: null, proposed_starts_at: null }
  it('are on the list while one of their times is ahead', () => {
    expect(isOpen(base, now)).toBe(true)
    expect(isOpen(base, at('11:00'))).toBe(false)
    expect(isOpen({ ...base, alt_starts_at: '2026-11-27T10:00:00Z' }, at('11:00'))).toBe(true)
    expect(isOpen({ ...base, status: 'marcada' }, now)).toBe(false)
  })
  it('find who sits on the time', () => {
    const b = (pro: string, s: string, e: string, status = 'confirmada') => ({ professional_id: pro, starts_at: at(s).toISOString(), ends_at: at(e).toISOString(), status })
    const list = [b('ana', '09:30', '10:15'), b('rui', '10:00', '10:30'), b('ana', '10:30', '11:00'), b('ana', '10:00', '10:30', 'cancelada')]
    expect(sittingOn(list, at('10:00'), 30, 'ana')).toHaveLength(1)
    expect(sittingOn(list, at('10:00'), 30, null)).toHaveLength(2)
  })
})
