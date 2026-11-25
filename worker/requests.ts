/**
 * POST /api/admin/send-request { id }: emails a monthly payment request (migration 0026) to the
 * salon, with its PDF attached. Runs with the admin's own session, so the database checks they
 * are a platform admin; the PDF is read from the private bucket with the service key.
 */
import type { ReminderEnv } from './reminders'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TEST_SENDER = 'CorteCerto <onboarding@resend.dev>'
const LIVE_URL = 'https://cortecerto.pt'

export interface RequestClaim {
  owner_email: string; salon_name: string; number: string; amount_cents: number
  issued_on: string; due_on: string | null; period: string | null; file_path: string
  payments: { mbway?: string; iban?: string; titular?: string; nota?: string }
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const day = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
const euros = (c: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(c / 100)

export function requestEmail(r: RequestClaim, appUrl: string): { subject: string; html: string; text: string } {
  const lines = [
    `Segue em anexo o pedido de pagamento ${r.number}${r.period ? `, referente a ${r.period}` : ''}: ${euros(r.amount_cents)} (IVA incluído).`,
    r.due_on ? `Agradecemos o pagamento até ${day(r.due_on)}.` : '',
    'Depois do pagamento enviamos a fatura-recibo, que fica também na sua área em Assinatura.',
  ].filter(Boolean)
  const p = r.payments ?? {}
  const how = [p.mbway && `MB Way: ${p.mbway}`, p.iban && `Transferência: IBAN ${p.iban}${p.titular ? ` (${p.titular})` : ''}`, p.nota]
    .filter((x): x is string => !!x)
  const pay = how.length ? how : ['Responda a este email e enviamos os dados para pagamento.']
  const panel = `${appUrl}/assinatura`
  return {
    subject: `Pedido de pagamento ${r.number}: ${r.salon_name}`,
    text: `${r.salon_name}\n\n${lines.join('\n\n')}\n\nComo pagar:\n${pay.join('\n')}\n\nVer na app: ${panel}\n\nObrigado,\nCorteCerto`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#1d1b18">
  <p style="color:#6b655c;margin:0 0 4px">${esc(r.salon_name)}</p>
  <h1 style="font-size:20px;margin:0 0 16px">Pedido de pagamento ${esc(r.number)}</h1>
  ${lines.map(l => `<p style="margin:0 0 10px">${esc(l)}</p>`).join('\n  ')}
  <p style="margin:16px 0 4px"><b>Como pagar</b></p>
  ${pay.map(l => `<p style="margin:0 0 4px">${esc(l)}</p>`).join('\n  ')}
  <p style="margin:20px 0"><a href="${esc(panel)}" style="background:#b5462f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ver na app</a></p>
  <p style="color:#6b655c;font-size:12px">Obrigado, CorteCerto.</p>
</div>`,
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export async function sendRequest(request: Request, env: ReminderEnv, origin: string): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!env.RESEND_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ status: 'sem_email' }, 503)
  const auth = request.headers.get('Authorization') ?? ''
  if (!/^Bearer [\w.-]+$/.test(auth)) return json({ status: 'erro' }, 401)
  let id = ''
  try { id = String(((await request.json()) as { id?: unknown }).id ?? '') } catch { /* bad body */ }
  if (!UUID.test(id)) return json({ status: 'erro' }, 400)

  const claim = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/admin_claim_request_email`, {
    method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_request: id }),
  })
  if (!claim.ok) return json({ status: claim.status === 401 || claim.status === 403 ? 'sem_permissao' : 'falhou' }, 502)
  const row = ((await claim.json()) as RequestClaim[])[0]
  if (!row) return json({ status: 'nao_devido' })

  const file = await fetch(`${env.SUPABASE_URL}/storage/v1/object/invoices/${row.file_path.split('/').map(encodeURIComponent).join('/')}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  })
  if (!file.ok) return json({ status: 'sem_pdf' }, 502)
  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM || TEST_SENDER, to: [row.owner_email], ...requestEmail(row, env.APP_URL || origin || LIVE_URL),
      attachments: [{ filename: `Pedido de pagamento ${row.number.replace(/[\\/]/g, '-')}.pdf`, content: toBase64(await file.arrayBuffer()) }],
    }),
  })
  return json({ status: sent.ok ? 'enviado' : 'falhou' }, sent.ok ? 200 : 502)
}
