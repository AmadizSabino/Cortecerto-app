/**
 * Payment reminder emails to salon owners (migration 0025).
 *
 * POST /api/admin/remind { salon, kind, invoice? }: the admin presses "Enviar" in /admin.
 *   Runs with the admin's own session, so claim_reminder() checks they are a platform admin.
 * Every morning (cron trigger in wrangler.jsonc): sends today's due reminders, but only when
 *   the admin switched on automatic reminders in /admin. Off by default.
 * claim_reminder() records each email before it goes, so none is sent twice.
 */

export interface ReminderEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  APP_URL?: string
}

export interface ReminderClaim {
  log_id: string; owner_email: string; salon_name: string; kind: string
  trial_ends_at: string; lock_on: string | null
  invoice_number: string | null; amount_cents: number | null; issued_on: string | null; due_on: string | null
  payments: { mbway?: string; iban?: string; titular?: string; nota?: string }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KINDS = ['gratis_7', 'gratis_3', 'gratis_0', 'atraso_5', 'atraso_10']
const TEST_SENDER = 'CorteCerto <onboarding@resend.dev>'
const LIVE_URL = 'https://cortecerto-app.amadiz-sabino.workers.dev'
const PRICE = '24,48 € (19,90 € + IVA)'

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const day = (iso: string) => new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'long' })
const euros = (c: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(c / 100)

/** The email for one reminder, in European Portuguese. */
export function reminderEmail(r: ReminderClaim, appUrl: string): { subject: string; html: string; text: string } {
  const late = r.kind.startsWith('atraso')
  const subject = late
    ? `Fatura ${r.invoice_number} por pagar: ${r.salon_name}`
    : r.kind === 'gratis_0' ? `O período grátis do ${r.salon_name} terminou` : `O período grátis do ${r.salon_name} acaba a ${day(r.trial_ends_at)}`
  const lines = late
    ? [`A fatura ${r.invoice_number} de ${euros(r.amount_cents ?? 0)}, emitida a ${day(r.issued_on!)}, venceu a ${day(r.due_on!)} e ainda não recebemos o pagamento.`,
       'Se já pagou, ignore este email, ou responda com o comprovativo para atualizarmos.']
    : r.kind === 'gratis_0'
      ? [`O período grátis terminou a ${day(r.trial_ends_at)}. Para continuar a usar a CorteCerto, a assinatura custa ${PRICE} por mês.`]
      : [`O período grátis acaba a ${day(r.trial_ends_at)}. Para continuar sem interrupções, a assinatura custa ${PRICE} por mês.`]
  if (r.lock_on) lines.push(`Sem pagamento, a conta fica só de leitura a ${day(r.lock_on)} e as marcações online ficam em pausa. Nada se perde: tudo volta assim que o pagamento chegar.`)
  const p = r.payments ?? {}
  const pay = [
    p.mbway && `MB Way: ${p.mbway}`,
    p.iban && `Transferência: IBAN ${p.iban}${p.titular ? ` (${p.titular})` : ''}`,
    p.nota,
  ].filter((x): x is string => !!x)
  const how = pay.length ? pay : ['Responda a este email e enviamos os dados para pagamento.']
  const panel = `${appUrl}/assinatura`
  return {
    subject,
    text: `${r.salon_name}\n\n${lines.join('\n\n')}\n\nComo pagar:\n${how.join('\n')}\n\nVer a assinatura: ${panel}\n\nObrigado,\nCorteCerto`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#1d1b18">
  <p style="color:#6b655c;margin:0 0 4px">${esc(r.salon_name)}</p>
  <h1 style="font-size:20px;margin:0 0 16px">${esc(late ? 'Fatura por pagar' : r.kind === 'gratis_0' ? 'O período grátis terminou' : 'O período grátis está a acabar')}</h1>
  ${lines.map(l => `<p style="margin:0 0 10px">${esc(l)}</p>`).join('\n  ')}
  <p style="margin:16px 0 4px"><b>Como pagar</b></p>
  ${how.map(l => `<p style="margin:0 0 4px">${esc(l)}</p>`).join('\n  ')}
  <p style="margin:20px 0"><a href="${esc(panel)}" style="background:#b5462f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ver a assinatura</a></p>
  <p style="color:#6b655c;font-size:12px">Obrigado, CorteCerto.</p>
</div>`,
  }
}

async function claimAndSend(env: ReminderEnv, auth: string, origin: string, salon: string, kind: string, invoice: string | null): Promise<'enviado' | 'nao_devido' | 'falhou'> {
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: auth, 'Content-Type': 'application/json' }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/claim_reminder`, {
    method: 'POST', headers, body: JSON.stringify({ p_salon: salon, p_kind: kind, p_invoice: invoice }),
  })
  if (!res.ok) return 'falhou'
  const row = ((await res.json()) as ReminderClaim[])[0]
  if (!row) return 'nao_devido'
  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM || TEST_SENDER, to: [row.owner_email], ...reminderEmail(row, env.APP_URL || origin) }),
  })
  await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/reminder_result`, {
    method: 'POST', headers, body: JSON.stringify({ p_log: row.log_id, p_ok: sent.ok }),
  }).catch(() => {})
  return sent.ok ? 'enviado' : 'falhou'
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** POST /api/admin/remind, from /admin. */
export async function remindNow(request: Request, env: ReminderEnv, origin: string): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!env.RESEND_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ status: 'sem_email', message: 'O envio de emails ainda não está ligado.' }, 503)
  const auth = request.headers.get('Authorization') ?? ''
  if (!/^Bearer [\w.-]+$/.test(auth)) return json({ status: 'erro', message: 'Inicie sessão.' }, 401)
  let body: { salon?: unknown; kind?: unknown; invoice?: unknown } = {}
  try { body = await request.json() } catch { /* bad body */ }
  const salon = String(body.salon ?? ''), kind = String(body.kind ?? ''), invoice = body.invoice ? String(body.invoice) : null
  if (!UUID.test(salon) || !KINDS.includes(kind) || (invoice && !UUID.test(invoice))) return json({ status: 'erro', message: 'Pedido inválido.' }, 400)
  const status = await claimAndSend(env, auth, origin, salon, kind, invoice)
  return json({ status }, status === 'falhou' ? 502 : 200)
}

/** The morning run. Does nothing while automatic reminders are off (reminders_due_auto returns none). */
export async function remindScheduled(env: ReminderEnv): Promise<void> {
  if (!env.RESEND_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return
  const appUrl = env.APP_URL || LIVE_URL
  const auth = `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/reminders_due_auto`, {
    method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}',
  })
  if (!res.ok) { console.error('reminders', res.status); return }
  const due = (await res.json()) as { salon_id: string; kind: string; invoice_id: string | null }[]
  for (const d of due) {
    const r = await claimAndSend(env, auth, appUrl, d.salon_id, d.kind, d.invoice_id)
    console.log('reminder', d.kind, r)
  }
}
