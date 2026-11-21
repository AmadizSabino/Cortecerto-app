import { expect, it } from 'vitest'
import { draftInterval, saveErrorText, validateDraft } from './bookingForm'

const ok = { clientName: 'Ana', clientPhone: '', serviceId: 's', professionalId: 'p', date: '2026-11-21', time: '10:30' }

it('accepts a counter booking without phone and rejects incomplete ones', () => {
  expect(validateDraft(ok)).toBe('')
  expect(validateDraft({ ...ok, clientName: ' ' })).toBe('Indique o nome do cliente.')
  expect(validateDraft({ ...ok, clientPhone: '1234' })).toBe('Telemóvel inválido (ou deixe em branco).')
  expect(validateDraft({ ...ok, serviceId: '' })).toBe('Escolha o serviço.')
  expect(validateDraft({ ...ok, time: '' })).toBe('Escolha a hora.')
})

it('turns the salon wall-clock time into UTC, summer and winter', () => {
  expect(draftInterval({ date: '2026-11-21', time: '10:30' }, 'Europe/Lisbon', 30))
    .toEqual({ starts_at: '2026-11-21T10:30:00.000Z', ends_at: '2026-11-21T11:00:00.000Z' })
  expect(draftInterval({ date: '2026-07-01', time: '10:30' }, 'Europe/Lisbon', 45).starts_at).toBe('2026-07-01T09:30:00.000Z')
})

it('explains a double booking', () => {
  expect(saveErrorText('conflicting key value violates exclusion constraint "no_overlap"')).toContain('já tem uma marcação')
  expect(saveErrorText('other')).toBe('Não foi possível guardar. Tente de novo.')
})
