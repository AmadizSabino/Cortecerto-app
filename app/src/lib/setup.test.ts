import { expect, it } from 'vitest'
import { setupSteps, type SetupInput } from './setup'

const base: SetupInput = {
  services: 3, professionals: 1, openDays: 5, whatsapp: '912345678',
  depositCents: 0, mbway: null, hasBookings: false, marks: {},
}
const done = (i: SetupInput) => setupSteps(i).filter(s => s.done).map(s => s.id)

it('checks what the app can see and leaves manual steps to the owner', () => {
  expect(done(base)).toEqual(['servicos', 'equipa', 'whatsapp', 'sinal'])
  expect(done({ ...base, marks: { poster: true, bio: true }, hasBookings: true }))
    .toEqual(['servicos', 'equipa', 'whatsapp', 'sinal', 'poster', 'bio', 'marcacao'])
})

it('needs an MB Way number only when the salon asks for a deposit', () => {
  expect(done({ ...base, depositCents: 500 })).not.toContain('sinal')
  expect(done({ ...base, depositCents: 500, mbway: '912 345 678' })).toContain('sinal')
  expect(done({ ...base, whatsapp: null, openDays: 0 })).toEqual(['servicos', 'sinal'])
})
