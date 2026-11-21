/** POST /api/errors: one error report from the browser. Logged, and stored when Supabase is set up. */

export interface ErrorEnv { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY?: string }

const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null)

// Per-isolate throttle: a broken page in a loop must not flood the logs.
let windowStart = 0
let count = 0
const LIMIT_PER_MINUTE = 60

export async function reportError(request: Request, env: ErrorEnv): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const now = Date.now()
  if (now - windowStart > 60_000) { windowStart = now; count = 0 }
  if (++count > LIMIT_PER_MINUTE) return new Response(null, { status: 429 })

  let body: Record<string, unknown> = {}
  try { body = (await request.json()) as Record<string, unknown> } catch { return new Response('Bad request', { status: 400 }) }
  const row = {
    message: cut(body.message, 500) || 'Erro sem mensagem',
    stack: cut(body.stack, 4000),
    path: cut(body.path, 200)?.split('?')[0] ?? null, // never the query string
    user_agent: cut(request.headers.get('user-agent'), 300),
    release: cut(body.release, 40),
  }
  console.error('client error', JSON.stringify(row))

  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/client_errors`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    }).catch(() => {})
  }
  return new Response(null, { status: 204 })
}
