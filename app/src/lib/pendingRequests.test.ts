import { describe, expect, it } from 'vitest'
import { pendingLines } from './pendingRequests'

describe('pendingLines', () => {
  it('shows only the kinds with something waiting', () => {
    expect(pendingLines({ packages: 0, packs: 0, club: 0 })).toEqual([])
    const l = pendingLines({ packages: 1, packs: 0, club: 2 })
    expect(l.map(x => x.title)).toEqual(['1 pedido de pacote por responder', '2 pedidos para aderir ao clube'])
    expect(l[0].to).toBe('/pacotes#pedidos')
  })
})
