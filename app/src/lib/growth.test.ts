import { describe, expect, it } from 'vitest'
import { followUpsDue, instagramUrl, prospectCounts, sortProspects, type Prospect } from './growth'

const p = (id: string, status: Prospect['status'], next_on: string | null, created_at = '2026-11-01T10:00:00Z') =>
  ({ id, status, next_on, created_at, name: id, notes: '' }) as Prospect

describe('prospects', () => {
  const list = [p('a', 'contactado', '2026-11-25'), p('b', 'por_contactar', '2026-11-20'), p('c', 'cliente', '2026-11-01'),
    p('d', 'demo_marcada', '2026-11-23'), p('e', 'por_contactar', null, '2026-11-22T10:00:00Z')]
  it('lists the follow-ups that are due, oldest first, and skips closed ones', () => {
    expect(followUpsDue(list, '2026-11-23').map(x => x.id)).toEqual(['b', 'd'])
  })
  it('sorts due first, then upcoming, then undated, then closed', () => {
    expect(sortProspects(list, '2026-11-23').map(x => x.id)).toEqual(['b', 'd', 'a', 'e', 'c'])
  })
  it('counts per status', () => {
    const c = prospectCounts(list)
    expect(c.por_contactar).toBe(2)
    expect(c.cliente).toBe(1)
    expect(c.sem_interesse).toBe(0)
  })
  it('turns an Instagram handle or link into a link', () => {
    expect(instagramUrl('@barbadoze')).toBe('https://instagram.com/barbadoze')
    expect(instagramUrl('https://www.instagram.com/barba.ze/?hl=pt')).toBe('https://instagram.com/barba.ze')
    expect(instagramUrl('not a handle!')).toBeNull()
    expect(instagramUrl(null)).toBeNull()
  })
})
