/**
 * POST /api/t { n, p, path?, src?, ref?, salon? }: one anonymous visit or click (migration 0027).
 *
 * No cookies and nothing personal is stored. The visitor code is a hash of the connection,
 * the browser and the day, cut to 16 characters: it counts unique visitors per day and
 * changes every day, so nobody can be followed. The query string and the full referrer are never kept.
 */

export interface TrackEnv { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY?: string }

export const EVENTS = ['visita', 'conta_criada', 'salao_criado', 'marcacao_inicio', 'marcacao_feita', 'whatsapp', 'instalar'] as const
export const PAGES = ['site', 'registo', 'salao', 'painel', 'outra'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BOT = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|facebookexternalhit|whatsapp\//i

let windowStart = 0
let count = 0
const LIMIT_PER_MINUTE = 300

/** The site that sent the visitor, as a short name: "instagram", "google", or the host. */
export function refName(ref: unknown, ownHost: string): string | null {
  if (typeof ref !== 'string' || !ref) return null
  let host = ''
  try { host = new URL(ref).hostname.toLowerCase().replace(/^www\.|^m\.|^l\./, '') } catch { return null }
  if (!host || host === ownHost) return null
  for (const [k, re] of [['instagram', /instagram\.com$/], ['facebook', /facebook\.com$|fb\.com$|fb\.me$/], ['tiktok', /tiktok\.com$/],
    ['google', /^google\.|\.google\./], ['whatsapp', /whatsapp\.(com|net)$|wa\.me$/], ['bing', /bing\.com$/]] as [string, RegExp][]) {
    if (re.test(host)) return k
  }
  return host.slice(0, 80)
}

export function cleanSrc(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '').slice(0, 40)
  return s || null
}

async function visitorCode(request: Request, salt: string): Promise<string> {
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  const ip = request.headers.get('cf-connecting-ip') ?? ''
  const ua = request.headers.get('user-agent') ?? ''
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${day}|${ip}|${ua}`))
  return [...new Uint8Array(hash)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function track(request: Request, env: TrackEnv): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const ua = request.headers.get('user-agent') ?? ''
  if (!env.SUPABASE_SERVICE_ROLE_KEY || BOT.test(ua) || request.headers.get('dnt') === '1') return new Response(null, { status: 204 })
  const now = Date.now()
  if (now - windowStart > 60_000) { windowStart = now; count = 0 }
  if (++count > LIMIT_PER_MINUTE) return new Response(null, { status: 429 })

  let b: Record<string, unknown> = {}
  try { b = JSON.parse(await request.text()) as Record<string, unknown> } catch { return new Response('Bad request', { status: 400 }) }
  const name = String(b.n ?? ''), page = String(b.p ?? '')
  if (!(EVENTS as readonly string[]).includes(name) || !(PAGES as readonly string[]).includes(page)) return new Response('Bad request', { status: 400 })
  const salon = typeof b.salon === 'string' && UUID.test(b.salon) ? b.salon : null
  const row = {
    name, page, salon_id: salon,
    path: typeof b.path === 'string' ? b.path.split(/[?#]/)[0].slice(0, 120) : null,
    src: cleanSrc(b.src),
    ref: refName(b.ref, new URL(request.url).hostname),
    visitor: await visitorCode(request, env.SUPABASE_SERVICE_ROLE_KEY.slice(-16)),
    device: /mobi|android|iphone|ipad/i.test(ua) ? 'telemovel' : 'computador',
  }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/site_events`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  }).catch(() => null)
  // A salon id that no longer exists fails the foreign key: keep the event without it.
  if (res && res.status === 409 && salon) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/site_events`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ...row, salon_id: null }),
    }).catch(() => {})
  }
  return new Response(null, { status: 204 })
}
