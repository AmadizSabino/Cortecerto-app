/**
 * Anonymous visits and clicks for /admin > Site (Worker /api/t, migration 0027).
 * No cookies and no personal data. The campaign of the visit (?src=, e.g. from the poster's QR
 * code or an Instagram link) is kept for this tab only, so a sign-up a few pages later still
 * counts for it.
 */

export type TrackEvent = 'visita' | 'conta_criada' | 'salao_criado' | 'marcacao_inicio' | 'marcacao_feita' | 'whatsapp' | 'instalar'
export type TrackPage = 'site' | 'registo' | 'salao' | 'painel' | 'outra'

const KEY = 'cc-src'
const once = new Set<string>()

/** The campaign name from a link's ?src=, cleaned. */
export function srcFrom(search: string): string | null {
  const v = new URLSearchParams(search).get('src') ?? new URLSearchParams(search).get('utm_source')
  const s = (v ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)
  return s || null
}

function campaign(): string | null {
  const now = srcFrom(location.search)
  try {
    if (now) sessionStorage.setItem(KEY, now)
    return now ?? sessionStorage.getItem(KEY)
  } catch { return now }
}

/** Which part of the app a path belongs to. */
export function pageOf(path: string): TrackPage {
  if (path === '/' || path.startsWith('/precos') || path.startsWith('/legal')) return 'site'
  if (path.startsWith('/registar')) return 'registo'
  if (path.startsWith('/s/') || path.startsWith('/f/')) return 'salao'
  if (path.startsWith('/painel')) return 'painel'
  return 'outra'
}

/** Sends one event. `key` makes it count once per page load (e.g. one visit per page). */
export function track(name: TrackEvent, opts: { page?: TrackPage; salon?: string | null; key?: string } = {}) {
  if (!import.meta.env.PROD) return
  if (opts.key) { if (once.has(opts.key)) return; once.add(opts.key) }
  const body = JSON.stringify({
    n: name, p: opts.page ?? pageOf(location.pathname), path: location.pathname,
    src: campaign(), ref: document.referrer || null, salon: opts.salon ?? null,
  })
  try {
    if (navigator.sendBeacon?.('/api/t', new Blob([body], { type: 'text/plain' }))) return
  } catch { /* fall back to fetch */ }
  fetch('/api/t', { method: 'POST', body, keepalive: true }).catch(() => {})
}
