import { describe, expect, it } from 'vitest'
import { HELP, HELP_GROUPS, SCREEN_LABEL, helpMessage, searchHelp, topicsFor } from './help'
import { PANEL } from '../panelTabs'

describe('help topics', () => {
  it('have unique ids, known groups and 2 to 6 steps', () => {
    expect(new Set(HELP.map(t => t.id)).size).toBe(HELP.length)
    for (const t of HELP) {
      expect(HELP_GROUPS as readonly string[]).toContain(t.group)
      expect(t.steps.length).toBeGreaterThanOrEqual(2)
      expect(t.steps.length).toBeLessThanOrEqual(6)
    }
  })

  it('point at real panel screens with a label', () => {
    for (const t of HELP.filter(t => t.screen)) {
      expect(PANEL.includes(t.screen!) || t.screen === '/palavra-passe').toBe(true)
      expect(SCREEN_LABEL[t.screen!]).toBeTruthy()
    }
  })

  it('cover every main panel screen', () => {
    const covered = new Set(HELP.map(t => t.screen))
    for (const p of PANEL.filter(p => p !== '/ajuda' && p !== '/acessos')) expect(covered.has(p), p).toBe(true)
  })

  it('show each level only what it can use', () => {
    const agenda = topicsFor('agenda').map(t => t.id)
    expect(agenda).toContain('nova-marcacao')
    expect(agenda).not.toContain('acessos')
    expect(agenda).not.toContain('estatisticas')
    expect(topicsFor('dono').length).toBe(HELP.length)
    expect(topicsFor('dono', '/lembretes').map(t => t.id)).toEqual(['lembretes'])
  })

  it('search ignores accents and needs every word', () => {
    const all = topicsFor('dono')
    expect(searchHelp(all, 'ferias').map(t => t.id)).toContain('folgas')
    expect(searchHelp(all, 'MB WAY sinal').map(t => t.id)).toContain('sinal')
    expect(searchHelp(all, 'sinal zzzz')).toEqual([])
    expect(searchHelp(all, '  ')).toBe(all)
  })

  it('turns a topic into a WhatsApp message', () => {
    const t = HELP.find(t => t.id === 'poster')!
    const m = helpMessage(t)
    expect(m.split('\n')[0]).toBe('*Imprimir o poster com QR*')
    expect(m).toContain('\n1. Abra Mais › Poster com QR.')
  })
})
