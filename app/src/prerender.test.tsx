import { expect, it } from 'vitest'
import { render } from './prerender'

it('renders the landing page to HTML for crawlers, with no browser APIs', () => {
  const html = render()
  expect(html).toContain('Menos faltas.')
  expect(html).toContain('Perguntas frequentes')
  expect(html).not.toMatch(/automátic[oa]s? .{0,20}lembrete|lembretes? automátic/i)
})
