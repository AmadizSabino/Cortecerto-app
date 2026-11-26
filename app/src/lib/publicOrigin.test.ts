import { describe, expect, it } from 'vitest'
import { publicOrigin } from './publicOrigin'

describe('publicOrigin', () => {
  it('turns the old workers.dev address into cortecerto.pt', () => {
    expect(publicOrigin({ hostname: 'cortecerto-app.amadiz-sabino.workers.dev', origin: 'https://cortecerto-app.amadiz-sabino.workers.dev' })).toBe('https://cortecerto.pt')
  })
  it('keeps cortecerto.pt, previews and localhost as they are', () => {
    expect(publicOrigin({ hostname: 'cortecerto.pt', origin: 'https://cortecerto.pt' })).toBe('https://cortecerto.pt')
    expect(publicOrigin({ hostname: 'claude-x-cortecerto-app.amadiz-sabino.workers.dev', origin: 'https://claude-x-cortecerto-app.amadiz-sabino.workers.dev' })).toBe('https://claude-x-cortecerto-app.amadiz-sabino.workers.dev')
    expect(publicOrigin({ hostname: 'localhost', origin: 'http://localhost:5173' })).toBe('http://localhost:5173')
  })
})
