/**
 * POST /api/demo-request { salon, name, phone, city, website? }: "Pedir demonstração" on the landing page.
 *
 * Adds the salon to /admin > Contactos (prospects, migration 0028) as "Por contactar", to call
 * back today, and emails the admin. `website` is a hidden field people never fill: bots do.
 */

export interface DemoEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  APP_URL?: string
}

const TEST_SENDER = 'CorteCerto <onboarding@resend.dev>'
const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n) : '')
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let windowStart = 0
let count = 0
const LIMIT_PER_HOUR = 30

/** The request, cleaned, or what is wrong with it. Pure, for the tests. */
export function readDemoRequest(b: Record<string, unknown>): { ok: true; salon: string; name: string; phone: string; city: string } | { ok: false; message: string } {
  const salon = cut(b.salon, 120), name = cut(b.name, 120), city = cut(b.city, 80)
  const phone = cut(b.phone, 30).replace(/[^\d+ ]/g, '')
  if (!salon) return { ok: false, message: 'Escreva o nome do salão.' }
  if (phone.replace(/\D/g, '').length < 9) return { ok: false, message: 'Escreva um telemóvel com 9 dígitos.' }
  return { ok: true, salon, name, phone, city }
}

export async function demoRequest(request: Request, env: DemoEnv, origin: string): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const now = Date.now()
  if (now - windowStart > 3_600_000) { windowStart = now; count = 0 }
  if (++count > LIMIT_PER_HOUR) return json({ ok: false, message: 'Muitos pedidos agora. Tente daqui a pouco.' }, 429)

  let b: Record<string, unknown> = {}
  try { b = (await request.json()) as Record<string, unknown> } catch { return json({ ok: false, message: 'Pedido inválido.' }, 400) }
  if (cut(b.website, 200)) return json({ ok: true }) // honeypot: pretend it worked
  const r = readDemoRequest(b)
  if (!r.ok) return json(r, 400)
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, message: 'De momento não foi possível. Escreva-nos por email.' }, 503)

  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  const saved = await fetch(`${env.SUPABASE_URL}/rest/v1/prospects`, {
    method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      name: r.salon, contact_name: r.name || null, phone: r.phone, city: r.city || null,
      source: 'Site: pediu demonstração', status: 'por_contactar', next_on: today, notes: `Pediu uma demonstração no site a ${today}.`,
    }),
  }).catch(() => null)

  // Email the admin (same address as the alerts: /admin > Sistema > Emails para si).
  let emailed = false
  if (env.RESEND_API_KEY) {
    const st = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ops_status`, { method: 'POST', headers, body: '{}' }).catch(() => null)
    const to = st && st.ok ? ((await st.json()) as { email?: string | null }).email : null
    if (to) {
      const lines = [`Salão: ${r.salon}`, r.name && `Pessoa: ${r.name}`, `Telemóvel: ${r.phone}`, r.city && `Localidade: ${r.city}`].filter(Boolean) as string[]
      const admin = `${env.APP_URL || origin}/admin`
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.EMAIL_FROM || TEST_SENDER, to: [to], subject: `Pedido de demonstração: ${r.salon}`,
          text: `${lines.join('\n')}\n\nEstá em Contactos, para falar hoje: ${admin}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1d1b18"><h1 style="font-size:18px">Pedido de demonstração</h1>${lines.map(l => `<p style="margin:0 0 6px">${esc(l)}</p>`).join('')}<p style="margin:16px 0"><a href="${esc(admin)}" style="background:#b5462f;color:#fff;padding:9px 14px;border-radius:8px;text-decoration:none">Abrir Contactos</a></p></div>`,
        }),
      }).catch(() => null)
      emailed = !!sent?.ok
    }
  }
  if (!saved?.ok && !emailed) return json({ ok: false, message: 'De momento não foi possível. Tente daqui a pouco.' }, 502)
  return json({ ok: true })
}
