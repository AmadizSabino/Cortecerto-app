/**
 * Phone notifications for the salon (Web Push), with no outside service and no cost per message.
 *
 * GET  /api/push/key          the app's public key, for the browser to subscribe.
 * POST /api/push/booking {id} a booking made in the panel (with the person's session): tells the
 *                             rest of the salon. Online bookings are announced from /api/notify-booking.
 *
 * The browser keeps the subscription with its own push service (Google, Apple, Mozilla, Microsoft);
 * the app saves it with save_push_subscription (migration 0029). The key pair (VAPID) is made on first
 * use and kept in push_vapid, which only the service role can read, so there is nothing to set up.
 * Messages are encrypted for each device (RFC 8291, aes128gcm) and signed with the key (RFC 8292).
 */

export interface PushEnv { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY?: string }

export interface PushBooking {
  salon_id: string; owner_id: string; salon_timezone: string; source: string
  client_name: string; service_name: string; professional_name: string; price_cents: number | null
  starts_at: string; made_today: number; best_day_before: number
}

export interface PushMessage { title: string; body: string; url: string; tag: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const enc = new TextEncoder()

// ---------------------------------------------------------------------------- the message

const ordinal = (n: number) => `${n}.ª`
const euros = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`

/**
 * The text of the notification, with a little celebration: the count of the day, round numbers
 * and the best day of the last 90. Money only for the owner (`money`), as everywhere in the app.
 */
export function bookingMessage(b: PushBooking, money: boolean, now = new Date()): PushMessage {
  const tz = b.salon_timezone || 'Europe/Lisbon'
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: tz })
  const start = new Date(b.starts_at)
  const tomorrow = new Date(now.getTime() + 86_400_000)
  const hour = start.toLocaleTimeString('pt-PT', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
  const when = day(start) === day(now) ? `hoje às ${hour}`
    : day(start) === day(tomorrow) ? `amanhã às ${hour}`
    : `${start.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })} às ${hour}`
  const n = b.made_today
  const title = n > b.best_day_before && b.best_day_before >= 3 ? `🏆 Recorde! ${n} marcações hoje`
    : n >= 10 && n % 5 === 0 ? `🔥 ${n} marcações hoje!`
    : n === 5 ? '🔥 5 marcações hoje!'
    : b.source === 'online' ? '🎉 Nova marcação online!'
    : '🎉 Nova marcação!'
  const first = `${b.client_name} · ${b.service_name} · ${when} com ${b.professional_name}`
  const count = n === 1 ? 'A primeira de hoje. Bom começo!' : `${ordinal(n)} marcação feita hoje.`
  const cash = money && b.price_cents ? ` +${euros(b.price_cents)} na agenda.` : ''
  return { title, body: `${first}\n${count}${cash}`, url: '/painel', tag: 'marcacao' }
}

// ---------------------------------------------------------------------------- sending

/** Tells everyone in the salon who switched notifications on, except the person who made the booking. */
export async function announceBooking(env: PushEnv, bookingId: string, by: string | null): Promise<number> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !UUID.test(bookingId)) return 0
  const claim = await rest(env, 'rpc/claim_booking_push', { method: 'POST', body: JSON.stringify({ p_booking: bookingId, p_by: by }) })
  if (!claim.ok) return 0
  const b = ((await claim.json()) as PushBooking[])[0]
  if (!b) return 0
  const res = await rest(env, `push_subscriptions?select=endpoint,p256dh,auth,user_id&salon_id=eq.${b.salon_id}`)
  if (!res.ok) return 0
  const subs = ((await res.json()) as Subscription[]).filter(s => s.user_id !== by)
  if (!subs.length) return 0
  const keys = await vapidKeys(env)
  if (!keys) return 0
  const sent = await Promise.all(subs.map(s => sendPush(env, keys, s, bookingMessage(b, s.user_id === b.owner_id))))
  return sent.filter(Boolean).length
}

/** POST /api/push/booking { id }: a booking made in the panel, by the signed-in person. */
export async function pushFromPanel(request: Request, env: PushEnv): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return new Response(null, { status: 204 })
  const auth = request.headers.get('Authorization') ?? ''
  if (!/^Bearer [\w.-]+$/.test(auth)) return new Response('Unauthorized', { status: 401 })
  const user = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: auth } })
  if (!user.ok) return new Response('Unauthorized', { status: 401 })
  const { id: by } = await user.json() as { id: string }
  let id = ''
  try { id = String(((await request.json()) as { id?: unknown }).id ?? '') } catch { /* bad body */ }
  if (!UUID.test(id)) return new Response('Bad request', { status: 400 })
  const n = await announceBooking(env, id, by)
  return new Response(null, { status: n ? 202 : 204 })
}

/** GET /api/push/key: the public key the browser subscribes with. */
export async function pushKey(env: PushEnv): Promise<Response> {
  const keys = await vapidKeys(env)
  if (!keys) return new Response('Not available', { status: 503 })
  return new Response(JSON.stringify({ key: keys.publicKey }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } })
}

interface Subscription { endpoint: string; p256dh: string; auth: string; user_id: string }
interface Vapid { publicKey: string; privateKey: CryptoKey }

const ENDPOINT = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//

async function sendPush(env: PushEnv, keys: Vapid, s: Subscription, msg: PushMessage): Promise<boolean> {
  if (!ENDPOINT.test(s.endpoint)) return false
  try {
    const body = await encryptPayload(enc.encode(JSON.stringify(msg)), b64urlDecode(s.p256dh), b64urlDecode(s.auth))
    const jwt = await vapidJwt(keys.privateKey, new URL(s.endpoint).origin)
    const res = await fetch(s.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
        'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
        TTL: '86400', Urgency: 'high',
      },
      body,
    })
    // The device unsubscribed or the app was removed: forget it.
    if (res.status === 404 || res.status === 410) await rest(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' })
    return res.ok
  } catch (e) {
    console.error('push', e instanceof Error ? e.message : e)
    return false
  }
}

/** The key pair, made and saved on first use (a second Worker racing it keeps the first one saved). */
async function vapidKeys(env: PushEnv): Promise<Vapid | null> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return null
  const read = async () => {
    const r = await rest(env, 'push_vapid?select=public_key,private_jwk')
    if (!r.ok) return null
    const row = ((await r.json()) as { public_key: string; private_jwk: JsonWebKey }[])[0]
    if (!row) return null
    const privateKey = await crypto.subtle.importKey('jwk', row.private_jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
    return { publicKey: row.public_key, privateKey }
  }
  const found = await read()
  if (found) return found
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer)
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey
  await rest(env, 'push_vapid', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ public_key: b64url(raw), private_jwk: jwk }) })
  return read()
}

function rest(env: PushEnv, path: string, init: RequestInit = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY!
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

// ---------------------------------------------------------------------------- crypto

export function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '='.repeat((4 - t.length % 4) % 4))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) { out.set(p, i); i += p.length }
  return out
}

/** VAPID (RFC 8292): a short signed token that says the message comes from this app. */
export async function vapidJwt(privateKey: CryptoKey, audience: string, now = Date.now()): Promise<string> {
  const part = (o: object) => b64url(enc.encode(JSON.stringify(o)))
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: 'mailto:admin@cortecerto.pt' })}`
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(unsigned)))
  return `${unsigned}.${b64url(sig)}`
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

/**
 * Encrypts a message for one device (RFC 8291 with RFC 8188 aes128gcm, one record).
 * `uaPublic` and `authSecret` are the device's p256dh and auth keys from its subscription.
 */
export async function encryptPayload(plain: Uint8Array, uaPublic: Uint8Array, authSecret: Uint8Array,
  salt = crypto.getRandomValues(new Uint8Array(16))): Promise<Uint8Array> {
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey) as ArrayBuffer)
  const ua = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua } as EcdhKeyDeriveParams, local.privateKey, 256))
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plain, Uint8Array.of(2))))
  const header = new Uint8Array(21)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  return concat(header, asPublic, sealed)
}
