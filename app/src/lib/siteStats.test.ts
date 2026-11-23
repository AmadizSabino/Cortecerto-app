import { describe, expect, it } from 'vitest'
import { budgetState, formatUptime, siteFunnels, uptimePct, type SiteStats } from './siteStats'
import { pageOf, srcFrom } from './track'
import { digestLines, uptimeAlert, type Digest } from '../../../worker/ops'
import { cleanSrc, refName } from '../../../worker/track'

describe('uptime', () => {
  it('is the share of checks that passed', () => {
    expect(uptimePct({ checks: 288, failed: 3 })).toBeCloseTo(285 / 288)
    expect(uptimePct({ checks: 0, failed: 0 })).toBeNull()
    expect(formatUptime(285 / 288)).toBe('98,9%')
    expect(formatUptime(1)).toBe('100%')
    expect(formatUptime(null)).toBe('—')
  })
  it('alerts after two failed checks in a row, and once more when back', () => {
    expect(uptimeAlert([{ ok: false }, { ok: true }], null)).toBeNull()
    expect(uptimeAlert([{ ok: false }, { ok: false }, { ok: true }], '2026-11-23T10:00:00Z')).toBe('site_em_baixo')
    expect(uptimeAlert([{ ok: true }, { ok: false }, { ok: false }], null)).toBe('site_voltou')
    expect(uptimeAlert([{ ok: true }, { ok: false }, { ok: true }], null)).toBeNull()
  })
})

describe('AI budget', () => {
  it('warns from 80% and says when it is passed', () => {
    expect(budgetState(2, 10)).toEqual({ share: 0.2, level: 'ok' })
    expect(budgetState(8.5, 10).level).toBe('aviso')
    expect(budgetState(10, 10).level).toBe('passou')
    expect(budgetState(3, 0).level).toBe('ok')
  })
})

describe('site tracking', () => {
  it('keeps only a clean campaign name', () => {
    expect(srcFrom('?src=Cartaz')).toBe('cartaz')
    expect(srcFrom('?utm_source=instagram&x=1')).toBe('instagram')
    expect(srcFrom('?src=<script>')).toBe('script')
    expect(srcFrom('')).toBeNull()
    expect(cleanSrc('Insta Bio!')).toBe('instabio')
  })
  it('names the referring site and drops our own', () => {
    expect(refName('https://l.instagram.com/?u=x', 'cortecerto.pt')).toBe('instagram')
    expect(refName('https://www.google.pt/', 'cortecerto.pt')).toBe('google')
    expect(refName('https://m.facebook.com/x', 'cortecerto.pt')).toBe('facebook')
    expect(refName('https://cortecerto.pt/precos', 'cortecerto.pt')).toBeNull()
    expect(refName('https://blog.example.com/a?b', 'cortecerto.pt')).toBe('blog.example.com')
    expect(refName('nonsense', 'x')).toBeNull()
  })
  it('knows which part of the app a page is', () => {
    expect(pageOf('/')).toBe('site')
    expect(pageOf('/s/barba-e-beer')).toBe('salao')
    expect(pageOf('/registar')).toBe('registo')
    expect(pageOf('/painel/agenda')).toBe('painel')
  })
  it('builds both funnels', () => {
    const s = { visitors: { site: 40 }, totals: { 'registo:conta_criada': 5, 'registo:salao_criado': 3, 'salao:visita': 200, 'salao:marcacao_inicio': 60, 'salao:marcacao_feita': 30 } } as unknown as SiteStats
    const f = siteFunnels(s)
    expect(f.signup.map(x => x.count)).toEqual([40, 5, 3])
    expect(f.booking.map(x => x.count)).toEqual([200, 60, 30])
  })
})

describe('daily summary', () => {
  it('reads as plain sentences', () => {
    const d: Digest = {
      day: '2026-11-22', visitors: 12, accounts: 2, new_salons: ['Barba e Beer'], bookings: 9, bookings_online: 4,
      paying: 3, trials_ending_7d: 1, owed_cents: 4896, overdue: 1, paid_yesterday_cents: 2448, reminders_due: 2,
      errors: 0, uptime_checks: 288, uptime_failed: 0, ai: { cost_eur: 0.42, budget_eur: 10, requests: 15 },
    }
    const text = digestLines(d).join('\n')
    expect(text).toContain('12 visitantes no site, 2 contas criadas, 1 salão novo (Barba e Beer)')
    expect(text).toContain('Por receber: 48,96')
    expect(text).toContain('1 em atraso')
    expect(text).toContain('Site: sempre no ar.')
    expect(text).toContain('Lembretes de pagamento por enviar: 2.')
  })
})
