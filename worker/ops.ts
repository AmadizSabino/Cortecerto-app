/**
 * The Worker's own checks (migration 0027), run by the cron triggers in wrangler.jsonc.
 *
 * Every 5 minutes: is the app served and does the database answer? Each check is stored in
 * uptime_checks. After two failed checks in a row the admin gets one email ("site em baixo"),
 * and another when it is back. The same run checks the month's AI cost against the budget
 * and emails once a month when it is passed.
 * Every morning: the daily summary email, only when switched on in /admin > Sistema.
 *
 * A check from inside Cloudflare can't see Cloudflare itself being down. A free outside
 * monitor (UptimeRobot, Better Stack) watching the site URL covers that case.
 */

export interface OpsEnv {
  ASSETS: { fetch(request: Request): Promise<Response> }
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  APP_URL?: string
}

export interface OpsStatus {
  email: string | null
  digest: boolean
  last_checks: { at: string; ok: boolean; detail: string | null }[]
  down_since: string | null
  ai: { cost_eur: number; budget_eur: number; requests: number; unpriced: number } | null
}

export interface Digest {
  day: string; visitors: number; accounts: number; new_salons: string[]; bookings: number; bookings_online: number
  paying: number; trials_ending_7d: number; owed_cents: number; overdue: number; paid_yesterday_cents: number
  reminders_due: number; errors: number; uptime_checks: number; uptime_failed: number
  ai: { cost_eur: number; budget_eur: number; requests: number } | null
}

const TEST_SENDER = 'CorteCerto <onboarding@resend.dev>'
const LIVE_URL = 'https://cortecerto-app.amadiz-sabino.workers.dev'
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const euros = (c: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(c / 100)
const eur = (n: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n)
const lisbon = (iso: string) => new Date(iso).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' })
const hourKey = () => new Date().toISOString().slice(0, 13).replace('T', ' ')

function rest(env: OpsEnv) {
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
  return {
    rpc: async <T>(name: string, body: unknown = {}): Promise<T | null> => {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) }).catch(() => null)
      return r && r.ok ? (await r.json()) as T : null
    },
    insert: (table: string, row: unknown) =>
      fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(row) }).catch(() => null),
  }
}

async function email(env: OpsEnv, to: string, subject: string, lines: string[], appUrl: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false
  const admin = `${appUrl}/admin`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM || TEST_SENDER, to: [to], subject,
      text: `${lines.join('\n')}\n\n${admin}`,
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1d1b18">
  <h1 style="font-size:18px;margin:0 0 12px">${esc(subject)}</h1>
  ${lines.map(l => l ? `<p style="margin:0 0 6px">${esc(l)}</p>` : '<hr style="border:0;border-top:1px solid #e6e0d6;margin:12px 0">').join('\n  ')}
  <p style="margin:18px 0"><a href="${esc(admin)}" style="background:#b5462f;color:#fff;padding:9px 14px;border-radius:8px;text-decoration:none">Abrir o admin</a></p>
</div>`,
    }),
  }).catch(() => null)
  return !!res?.ok
}

/** One check: the app's page is served and Supabase answers. */
export async function checkOnce(env: OpsEnv): Promise<{ ok: boolean; app_ok: boolean; db_ok: boolean; ms: number; detail: string | null }> {
  const t = Date.now()
  const timeout = () => AbortSignal.timeout(8000)
  const [app, db] = await Promise.all([
    env.ASSETS.fetch(new Request('https://app.local/index.html')).then(r => ({ ok: r.ok, s: r.status }), e => ({ ok: false, s: String(e).slice(0, 60) })),
    fetch(`${env.SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' }, signal: timeout() })
      .then(r => ({ ok: r.ok, s: r.status }), e => ({ ok: false, s: String(e).slice(0, 60) })),
  ])
  const detail = [!app.ok && `app ${app.s}`, !db.ok && `base de dados ${db.s}`].filter(Boolean).join(' · ') || null
  return { ok: app.ok && db.ok, app_ok: app.ok, db_ok: db.ok, ms: Date.now() - t, detail }
}

/** What to email after a check, if anything. Pure, for the tests. */
export function uptimeAlert(checks: { ok: boolean }[], downSince: string | null): 'site_em_baixo' | 'site_voltou' | null {
  if (checks.length >= 2 && !checks[0].ok && !checks[1].ok) return 'site_em_baixo'
  if (checks.length >= 3 && checks[0].ok && !checks[1].ok && !checks[2].ok && downSince === null) return 'site_voltou'
  return null
}

/** Every 5 minutes. */
export async function opsEveryFiveMinutes(env: OpsEnv): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return
  const db = rest(env)
  const appUrl = env.APP_URL || LIVE_URL
  const check = await checkOnce(env)
  await db.insert('uptime_checks', check)
  const s = await db.rpc<OpsStatus>('ops_status')
  if (!s) { console.error('ops: status unavailable', check.detail); return }
  if (!s.email) return

  const alert = uptimeAlert(s.last_checks, s.down_since)
  if (alert === 'site_em_baixo') {
    // Once per outage: the period is the time it went down.
    const since = s.down_since ?? s.last_checks[1]?.at ?? new Date().toISOString()
    if (await db.rpc<boolean>('claim_admin_alert', { p_kind: 'site_em_baixo', p_period: since.slice(0, 16) })) {
      await email(env, s.email, 'CorteCerto: o site não está a responder', [
        `Desde ${lisbon(since)}, as verificações de 5 em 5 minutos falham.`,
        `Último erro: ${s.last_checks[0]?.detail ?? check.detail ?? 'sem detalhe'}.`,
        'Veja Cloudflare > Workers > cortecerto-app > Logs, e o estado do Supabase em status.supabase.com.',
      ], appUrl)
    }
  } else if (alert === 'site_voltou') {
    if (await db.rpc<boolean>('claim_admin_alert', { p_kind: 'site_voltou', p_period: hourKey() })) {
      await email(env, s.email, 'CorteCerto: o site voltou', [`O site está a responder outra vez (${lisbon(s.last_checks[0].at)}).`], appUrl)
    }
  }

  if (s.ai && s.ai.budget_eur > 0 && s.ai.cost_eur >= s.ai.budget_eur) {
    const month = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' }).slice(0, 7)
    if (await db.rpc<boolean>('claim_admin_alert', { p_kind: 'orcamento_ia', p_period: month })) {
      await email(env, s.email, `CorteCerto: a IA passou o orçamento de ${eur(s.ai.budget_eur)}`, [
        `Este mês a IA já custou ${eur(s.ai.cost_eur)} em ${s.ai.requests} pedidos, e o orçamento é ${eur(s.ai.budget_eur)}.`,
        'A IA continua a funcionar (cada salão tem o seu limite mensal). Pode mudar o orçamento ou os limites em /admin > Sistema.',
      ], appUrl)
    }
  }
}

/** The daily summary's lines. Pure, for the tests. */
export function digestLines(d: Digest): string[] {
  const lines = [
    `Ontem: ${d.visitors} visitantes no site, ${d.accounts} contas criadas, ${d.new_salons.length === 1 ? '1 salão novo' : `${d.new_salons.length} salões novos`}${d.new_salons.length ? ` (${d.new_salons.join(', ')})` : ''}.`,
    `Marcações criadas ontem: ${d.bookings}, das quais ${d.bookings_online} online.`,
    '',
    `Salões a pagar: ${d.paying}. Período grátis a acabar em 7 dias: ${d.trials_ending_7d}.`,
    `Por receber: ${euros(d.owed_cents)}${d.overdue ? `, ${d.overdue} em atraso` : ''}. Recebido ontem: ${euros(d.paid_yesterday_cents)}.`,
    d.reminders_due ? `Lembretes de pagamento por enviar: ${d.reminders_due}.` : 'Sem lembretes de pagamento por enviar.',
    '',
    d.uptime_checks ? `Site: ${d.uptime_failed ? `${d.uptime_failed} de ${d.uptime_checks} verificações falharam` : 'sempre no ar'}.` : 'Site: sem verificações ontem.',
    `Erros na app ontem: ${d.errors}.`,
  ]
  if (d.ai) lines.push(`IA este mês: ${eur(d.ai.cost_eur)} de ${eur(d.ai.budget_eur)} (${d.ai.requests} pedidos).`)
  return lines
}

/** Every morning, with the payment reminders. */
export async function opsDaily(env: OpsEnv): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.RESEND_API_KEY) return
  const db = rest(env)
  const s = await db.rpc<OpsStatus>('ops_status')
  if (!s?.digest || !s.email) return
  const d = await db.rpc<Digest>('ops_digest')
  if (!d) return
  if (!await db.rpc<boolean>('claim_admin_alert', { p_kind: 'resumo', p_period: d.day })) return
  const day = new Date(d.day + 'T12:00:00Z').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })
  await email(env, s.email, `CorteCerto: resumo de ${day}`, digestLines(d), env.APP_URL || LIVE_URL)
}
