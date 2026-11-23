import { expect, it } from 'vitest'
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
