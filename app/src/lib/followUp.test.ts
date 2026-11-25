import { expect, it } from 'vitest'
import { followUps } from './followUp'
import type { AdminSalonRow } from './adminStats'

const now = new Date('2026-11-25T12:00:00Z')
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()
const trial = (p: Partial<AdminSalonRow> = {}): AdminSalonRow => ({
  id: 's', name: 'Barba', slug: 'barba', type: 'barbearia', created_at: ago(1),
  subscription: 'experimental', trial_ends_at: ago(-29), paid_until: null,
  address: null, whatsapp: '912345678', has_logo: false, owner_email: null, last_sign_in_at: ago(0),
  services: 3, professionals: 1, open_days: 5, team: 1, clients: 0,
  bookings: 0, bookings_30d: 0, online_30d: 0, noshow_30d: 0, value_30d_cents: 0,
  first_booking_at: null, first_online_at: null, last_booking_at: null,
  walkins_30d: 0, promotions: 0, packs: 0, ai_30d: 0, ...p,
})

it('picks the right message for each trial salon, most urgent first', () => {
  const list = followUps([
    trial({ id: 'new' }),
    trial({ id: 'quiet', created_at: ago(4), trial_ends_at: ago(-26) }),
    trial({ id: 'ending', created_at: ago(27), trial_ends_at: ago(-3), first_online_at: ago(20) }),
    trial({ id: 'busy', created_at: ago(10), trial_ends_at: ago(-20), first_online_at: ago(8) }),
    trial({ id: 'nophone', whatsapp: null }),
    trial({ id: 'paid', subscription: 'ativa', paid_until: ago(-20) }),
  ], 'https://cortecerto.pt', now)
  expect(list.map(f => [f.salon.id, f.stage])).toEqual([['ending', 'fim'], ['quiet', 'dia3'], ['new', 'dia1']])
  expect(list[1].text).toContain('https://cortecerto.pt/s/barba')
  expect(list[0].text).toContain('19,90 €')
  expect(list[0].text).toContain('28 de novembro')
})
