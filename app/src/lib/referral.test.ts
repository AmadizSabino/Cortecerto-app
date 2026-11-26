import { beforeEach, describe, expect, it } from 'vitest'
import { captureInvite, clearInvite, cleanCode, inviteLink, inviteMessage, savedInvite } from './referral'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v) }, removeItem: k => { store.delete(k) } } as Storage
})

describe('salon invites', () => {
  it('keeps a clean code from the address for 30 days', () => {
    captureInvite('?src=convite&convite=Barba-E-Beer<script>', 1000)
    expect(savedInvite(2000)).toBe('barba-e-beerscript')
    expect(savedInvite(1000 + 31 * 86_400_000)).toBeNull()
    clearInvite()
    expect(savedInvite(2000)).toBeNull()
  })

  it('ignores addresses without an invite', () => {
    captureInvite('?src=instagram', 1000)
    expect(savedInvite(2000)).toBeNull()
    expect(cleanCode('  ')).toBe('')
  })

  it('builds the link and the message', () => {
    const link = inviteLink('https://cortecerto.pt', 'barba-e-beer')
    expect(link).toBe('https://cortecerto.pt/?convite=barba-e-beer&src=convite')
    expect(inviteMessage('Barba e Beer', link)).toMatch(/no Barba e Beer .* 30 dias grátis.* um mês grátis: https:\/\/cortecerto\.pt\/\?convite=barba-e-beer&src=convite$/)
  })
})
