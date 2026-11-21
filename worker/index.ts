/**
 * CorteCerto Worker: serves the app (static assets) and a small API.
 *
 * POST /api/notify-booking { id } — emails the salon owner about a new booking.
 * Secrets, set in Cloudflare > Workers > cortecerto-app > Settings > Variables:
 *   RESEND_API_KEY             Resend API key
 *   SUPABASE_SERVICE_ROLE_KEY  Supabase secret key (Project settings > API keys)
 * Optional variable EMAIL_FROM, e.g. "CorteCerto <avisos@cortecerto.pt>" once the
 * domain is verified in Resend. Until then the test sender only delivers to the
 * email the Resend account was opened with.
 * Without the secrets the endpoint does nothing, and the app works as before.
 */

import { bookingEmail } from './email'

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  APP_URL?: string
}

export interface Claimed {
  owner_email: string; salon_name: string; salon_timezone: string
  client_name: string; client_phone: string; consent_messages: boolean
  service_name: string; price_cents: number; professional_name: string
  starts_at: string; deposit: 'nenhum' | 'pendente' | 'pago'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TEST_SENDER = 'CorteCerto <onboarding@resend.dev>'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/notify-booking') return notifyBooking(request, env, url.origin)
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 })
    return env.ASSETS.fetch(request)
  },
}

async function notifyBooking(request: Request, env: Env, origin: string): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!env.RESEND_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return new Response(null, { status: 204 })

  let id = ''
  try { id = String(((await request.json()) as { id?: unknown }).id ?? '') } catch { /* bad body */ }
  if (!UUID.test(id)) return new Response('Bad request', { status: 400 })

  // Claims the booking once; returns nothing if already sent, too old or unknown.
  const rpc = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/claim_booking_notification`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_booking: id }),
  })
  if (!rpc.ok) return new Response('Lookup failed', { status: 502 })
  const rows = (await rpc.json()) as Claimed[]
  const b = rows[0]
  if (!b?.owner_email) return new Response(null, { status: 204 })

  const email = bookingEmail(b, env.APP_URL || origin)
  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM || TEST_SENDER, to: [b.owner_email], ...email }),
  })
  return new Response(null, { status: sent.ok ? 202 : 502 })
}
