/**
 * CorteCerto Worker: serves the app (static assets) and a small API.
 *
 * POST /api/notify-booking { id } — emails the salon owner about a new booking, and sends the phone notifications.
 * POST /api/notify-request { id } — phone notifications for a client's request for a taken time (see push.ts).
 * GET /api/push/key, POST /api/push/booking { id }, POST /api/push/test — phone notifications for the salon (see push.ts).
 * POST /api/notify-change { id } — emails the owner when a client cancels or moves it.
 * POST /api/admin/remind — a payment reminder email the admin sends from /admin (see reminders.ts).
 * POST /api/admin/send-request — emails a monthly payment request PDF to a salon (see requests.ts).
 * POST /api/demo-request — "Pedir demonstração" on the landing page: a new contact in /admin and an email (see demo.ts).
 * POST /api/t — an anonymous visit or click, for /admin > Site (see track.ts).
 * Every 5 minutes (cron trigger): uptime check and AI budget check, with alert emails (see ops.ts).
 * Every morning (cron trigger): automatic payment reminders and the daily summary, each only when switched on in /admin.
 * POST /api/errors — error reports from the app (see errors.ts).
 * POST /api/ai/<feature> — the AI features (see ai.ts): ANTHROPIC_API_KEY, AI_MODEL, GEMINI_API_KEY (or IMAGE_API_URL, IMAGE_API_KEY).
 * Secrets, set in Cloudflare > Workers > cortecerto-app > Settings > Variables:
 *   RESEND_API_KEY             Resend API key
 *   SUPABASE_SERVICE_ROLE_KEY  Supabase secret key (Project settings > API keys)
 * Optional variable EMAIL_FROM, e.g. "CorteCerto <avisos@cortecerto.pt>" once the
 * domain is verified in Resend. Until then the test sender only delivers to the
 * email the Resend account was opened with.
 * Without the secrets the endpoint does nothing, and the app works as before.
 */

import { bookingEmail, changeEmail, type ChangeClaimed } from './email'
import { reportError } from './errors'
import { forgetClients, handleAi } from './ai'
import { remindNow, remindScheduled } from './reminders'
import { sendRequest } from './requests'
import { track } from './track'
import { demoRequest } from './demo'
import { withMeta } from './meta'
import { opsDaily, opsEveryFiveMinutes } from './ops'
import { announceBooking, announceRequest, pushFromPanel, pushKey, pushTest } from './push'

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  APP_URL?: string
  ANTHROPIC_API_KEY?: string
  AI_MODEL?: string
  IMAGE_API_URL?: string
  IMAGE_API_KEY?: string
  GEMINI_API_KEY?: string
  GEMINI_IMAGE_MODEL?: string
}

export interface Claimed {
  owner_email: string; salon_name: string; salon_timezone: string
  client_name: string; client_phone: string; consent_messages: boolean
  service_name: string; price_cents: number; professional_name: string
  starts_at: string; deposit: 'nenhum' | 'pendente' | 'pago'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TEST_SENDER = 'CorteCerto <onboarding@resend.dev>'
const DAILY = '0 8 * * *' // must match wrangler.jsonc

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/notify-booking') return notifyOwner<Claimed>(request, env, url.origin, 'claim_booking_notification', bookingEmail, id => announceBooking(env, id, null))
    if (url.pathname === '/api/notify-request') return announceRequest(request, env)
    if (url.pathname === '/api/push/key') return pushKey(env)
    if (url.pathname === '/api/push/booking') return pushFromPanel(request, env)
    if (url.pathname === '/api/push/test') return pushTest(request, env)
    if (url.pathname === '/api/notify-change') return notifyOwner<ChangeClaimed>(request, env, url.origin, 'claim_client_change_notification', changeEmail)
    if (url.pathname === '/api/errors') return reportError(request, env)
    if (url.pathname === '/api/admin/remind') return remindNow(request, env, url.origin)
    if (url.pathname === '/api/admin/send-request') return sendRequest(request, env, url.origin)
    if (url.pathname === '/api/t') return track(request, env)
    if (url.pathname === '/api/demo-request') return demoRequest(request, env, url.origin)
    if (url.pathname === '/api/manifest') return clientManifest(url)
    if (url.pathname.startsWith('/api/ai/')) return handleAi(request, env, url.pathname.slice('/api/ai/'.length))
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 })
    // Only / and /s/* reach here (run_worker_first): their link previews are filled in (meta.ts).
    if (url.pathname === '/' || url.pathname.startsWith('/s/')) return withMeta(request, env)
    return env.ASSETS.fetch(request)
  },
  async scheduled(event: { cron: string }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    if (event.cron === DAILY) ctx.waitUntil(Promise.all([remindScheduled(env), opsDaily(env), forgetClients(env)]))
    else ctx.waitUntil(opsEveryFiveMinutes(env))
  },
}

/**
 * The app the salon installs opens on its panel (public/manifest.webmanifest, start_url /painel).
 * A client who adds a salon's booking page to the home screen gets this one instead,
 * which opens that salon's booking page.
 */
function clientManifest(url: URL): Response {
  const slug = (url.searchParams.get('s') ?? '').toLowerCase()
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return new Response('Not found', { status: 404 })
  const name = (url.searchParams.get('n') ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) || 'Marcações'
  const manifest = {
    name, short_name: name.slice(0, 20), description: `Marcar em ${name}`,
    start_url: `/s/${slug}`, scope: `/s/${slug}`, display: 'standalone', lang: 'pt-PT',
    background_color: '#faf7f2', theme_color: '#b5462f',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } })
}

type Email = { subject: string; html: string; text: string }

/**
 * Claims a booking event through a service-role RPC (once, within 10 minutes; nothing
 * comes back if already sent, too old or unknown) and emails the salon owner.
 */
async function notifyOwner<T extends { owner_email: string }>(
  request: Request, env: Env, origin: string, rpcName: string, build: (row: T, appUrl: string) => Email,
  also?: (id: string) => Promise<unknown>,
): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let id = ''
  try { id = String(((await request.json()) as { id?: unknown }).id ?? '') } catch { /* bad body */ }
  if (!UUID.test(id)) return new Response('Bad request', { status: 400 })
  // Phone notifications go out even when email is not set up.
  if (also) await also(id).catch(e => console.error('notify', e instanceof Error ? e.message : e))
  if (!env.RESEND_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return new Response(null, { status: 204 })

  const rpc = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_booking: id }),
  })
  if (!rpc.ok) return new Response('Lookup failed', { status: 502 })
  const row = ((await rpc.json()) as T[])[0]
  if (!row?.owner_email) return new Response(null, { status: 204 })

  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM || TEST_SENDER, to: [row.owner_email], ...build(row, env.APP_URL || origin) }),
  })
  return new Response(null, { status: sent.ok ? 202 : 502 })
}
