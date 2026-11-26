import { describe, expect, it } from 'vitest'
import { b64url, b64urlDecode, bookingMessage, encryptPayload, vapidJwt, type PushBooking } from '../../../worker/push'

const enc = new TextEncoder()
const concat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length } return o }
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

/** What the phone does (RFC 8291 receiver side), to check the Worker's encryption end to end. */
async function decrypt(body: Uint8Array, ua: CryptoKeyPair, uaPublic: Uint8Array, auth: Uint8Array) {
  const salt = body.slice(0, 16)
  expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(4096)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const as = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: as } as EcdhKeyDeriveParams, ua.privateKey, 256))
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(21 + idlen)))
  expect(plain[plain.length - 1]).toBe(2) // last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1))
}

describe('Web Push (worker/push.ts)', () => {
  it('encrypts a message that only the phone can read', async () => {
    const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey) as ArrayBuffer)
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const body = await encryptPayload(enc.encode('{"title":"🎉 Nova marcação!"}'), b64urlDecode(b64url(uaPublic)), auth)
    expect(await decrypt(body, ua, uaPublic, auth)).toBe('{"title":"🎉 Nova marcação!"}')
  })

  it('signs the VAPID token with the app key', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
    const jwt = await vapidJwt(pair.privateKey, 'https://fcm.googleapis.com', Date.UTC(2026, 10, 25, 12))
    const [h, c, sig] = jwt.split('.')
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)))
    expect(claims.aud).toBe('https://fcm.googleapis.com')
    expect(claims.exp).toBe(Date.UTC(2026, 10, 25, 12) / 1000 + 12 * 3600)
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64urlDecode(sig), enc.encode(`${h}.${c}`))
    expect(ok).toBe(true)
  })
})

describe('the new-booking notification', () => {
  const now = new Date('2026-11-25T09:00:00Z')
  const b: PushBooking = {
    salon_id: 's', owner_id: 'o', salon_timezone: 'Europe/Lisbon', source: 'online',
    client_name: 'Tiago', service_name: 'Corte + barba', professional_name: 'Rui', price_cents: 1800,
    starts_at: '2026-11-26T10:00:00Z', made_today: 3, best_day_before: 6,
  }

  it('says who, what and when, and counts the day', () => {
    const m = bookingMessage(b, false, now)
    expect(m.title).toBe('🎉 Nova marcação online!')
    expect(m.body).toBe('Tiago · Corte + barba · amanhã às 10:00 com Rui\n3.ª marcação feita hoje.')
    expect(m.url).toBe('/painel')
  })

  it('shows euros only to the owner', () => {
    expect(bookingMessage(b, true, now).body).toContain('+18,00 € na agenda.')
    expect(bookingMessage(b, false, now).body).not.toContain('€')
  })

  it('celebrates the first of the day, 5 bookings and a new record', () => {
    expect(bookingMessage({ ...b, made_today: 1, source: 'salao' }, false, now)).toMatchObject({ title: '🎉 Nova marcação!' })
    expect(bookingMessage({ ...b, made_today: 1 }, false, now).body).toContain('A primeira de hoje. Bom começo!')
    expect(bookingMessage({ ...b, made_today: 5 }, false, now).title).toBe('🔥 5 marcações hoje!')
    expect(bookingMessage({ ...b, made_today: 7 }, false, now).title).toBe('🏆 Recorde! 7 marcações hoje')
    // A "record" over a quiet history (best day under 3) is no record.
    expect(bookingMessage({ ...b, made_today: 2, best_day_before: 1 }, false, now).title).toBe('🎉 Nova marcação online!')
  })
})

describe('request notification (migration 0031)', () => {
  it('says who asks, for when, and who has the time', async () => {
    const { requestMessage } = await import('../../../worker/push')
    const m = requestMessage({
      salon_id: 's', salon_timezone: 'Europe/Lisbon', client_name: 'Marta', service_name: 'Corte', professional_name: 'Rui',
      starts_at: '2026-11-27T15:00:00Z', alt_starts_at: '2026-11-28T10:00:00Z', taken_by: 'João',
    }, new Date('2026-11-26T09:00:00Z'))
    expect(m.title).toBe('🙋 Pedido de horário')
    expect(m.body).toMatch(/^Marta pede Corte com Rui amanhã às 15:00 \(ou s[^)]*28[^)]* às 10:00\)\. Nessa hora está João\.\nEstá na lista de espera: responda em Hoje\.$/)
    expect(m.url).toBe('/painel#pedidos')
  })
})

describe('shop reservation notification (migration 0032)', () => {
  it('says who reserved what, with money only for the owner', async () => {
    const { orderMessage } = await import('../../../worker/push')
    const o = { salon_id: 's', owner_id: 'u', client_name: 'Tiago', product_name: 'Pomada mate', qty: 2, price_cents: 1500, pay: 'mbway' as const }
    expect(orderMessage(o, true).body).toBe('Tiago reservou 2 × Pomada mate · 30,00 €.\nVai pagar por MB WAY: confirme quando receber.')
    expect(orderMessage({ ...o, qty: 1, pay: 'salao' }, false).body).toBe('Tiago reservou Pomada mate.\nPaga no salão quando levantar.')
    expect(orderMessage(o, false).url).toBe('/loja#reservas')
  })
})
