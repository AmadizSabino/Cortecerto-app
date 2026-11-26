import { describe, expect, it } from 'vitest'
import { readDemoRequest } from '../../../worker/demo'
import { salonMeta } from '../../../worker/meta'

it('accepts a demo request with a salon and a 9-digit phone, cleaned', () => {
  const r = readDemoRequest({ salon: '  Barbearia do Zé <b>', name: 'José', phone: '912 345 678', city: 'Setúbal' })
  expect(r).toEqual({ ok: true, salon: 'Barbearia do Zé  b', name: 'José', phone: '912 345 678', city: 'Setúbal' })
  expect(readDemoRequest({ salon: '', phone: '912345678' }).ok).toBe(false)
  expect(readDemoRequest({ salon: 'X', phone: '1234' })).toEqual({ ok: false, message: 'Escreva um telemóvel com 9 dígitos.' })
})

it('gives each booking page its salon name in link previews', () => {
  expect(salonMeta('Barba e Beer', 'Setúbal')).toEqual({
    title: 'Barba e Beer · Marcar online',
    description: 'Veja os serviços e preços e marque online no Barba e Beer, Setúbal. Recebe a confirmação e um lembrete.',
  })
  expect(salonMeta('Studio', null).description).toContain('no Studio.')
})

describe('canonical address', () => {
  it('sends the other domains to cortecerto.pt, keeping the path', async () => {
    const { canonicalRedirect } = await import('../../../worker/index')
    const r = canonicalRedirect(new URL('https://www.cortecerto.eu/s/barba-e-beer?src=x'))!
    expect(r.status).toBe(301)
    expect(r.headers.get('location')).toBe('https://cortecerto.pt/s/barba-e-beer?src=x')
    expect(canonicalRedirect(new URL('https://cortecerto.pt/painel'))).toBeNull()
    expect(canonicalRedirect(new URL('https://cortecerto-app.amadiz-sabino.workers.dev/painel'))!.headers.get('location')).toBe('https://cortecerto.pt/painel')
    expect(canonicalRedirect(new URL('https://claude-x-cortecerto-app.amadiz-sabino.workers.dev/'))).toBeNull()
  })
  it('never redirects the API, so apps installed from an old address keep working', async () => {
    const { canonicalRedirect } = await import('../../../worker/index')
    expect(canonicalRedirect(new URL('https://cortecerto-app.amadiz-sabino.workers.dev/api/ai/owner-assistant'), 'POST')).toBeNull()
    expect(canonicalRedirect(new URL('https://cortecerto-app.amadiz-sabino.workers.dev/api/push/key'))).toBeNull()
    expect(canonicalRedirect(new URL('https://www.cortecerto.pt/painel'), 'POST')).toBeNull()
  })
})
