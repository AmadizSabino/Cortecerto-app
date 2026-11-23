/**
 * Link previews. WhatsApp, Facebook and Instagram read the page's <meta> tags without running the app,
 * so the Worker fills them in on the way out:
 *   /          the share image as a full URL (they ignore relative ones).
 *   /s/<slug>  the salon's own name and a "Marque online" line, so a salon sharing its booking link
 *              shows its name, not CorteCerto's sales pitch. Salon names are cached for an hour.
 */

export interface MetaEnv {
  ASSETS: { fetch(request: Request): Promise<Response> }
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

interface Element { setAttribute(name: string, value: string): void; setInnerContent(content: string): void }
interface Rewriter { on(selector: string, handler: { element(el: Element): void }): Rewriter; transform(res: Response): Response }
declare const HTMLRewriter: { new (): Rewriter }
declare const caches: { default: { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> } }

const SLUG = /^\/s\/([a-z0-9-]{1,60})\/?$/

/** The title and description for a salon's booking page. Pure, for the tests. */
export function salonMeta(name: string, city?: string | null): { title: string; description: string } {
  const n = name.trim().slice(0, 80)
  return { title: `${n} · Marcar online`, description: `Veja os serviços e preços e marque online${city ? ` no ${n}, ${city}` : ` no ${n}`}. Recebe a confirmação e um lembrete.` }
}

async function salonName(env: MetaEnv, slug: string): Promise<{ name: string; address: string | null } | null> {
  const key = new Request(`https://meta.cache/salon/${slug}`)
  try {
    const hit = await caches.default.match(key)
    if (hit) return (await hit.json()) as { name: string; address: string | null } | null
  } catch { /* no cache in local dev */ }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return null
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/salons?select=name,address&slug=eq.${slug}&limit=1`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  }).catch(() => null)
  const row = res && res.ok ? ((await res.json()) as { name: string; address: string | null }[])[0] ?? null : null
  try { await caches.default.put(key, new Response(JSON.stringify(row), { headers: { 'Cache-Control': 'max-age=3600', 'Content-Type': 'application/json' } })) } catch { /* ignore */ }
  return row
}

/** Serves the app's page with its preview tags filled in. */
export async function withMeta(request: Request, env: MetaEnv): Promise<Response> {
  const res = await env.ASSETS.fetch(request)
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return res
  const url = new URL(request.url)
  const image = `${url.origin}/og-image.png`
  let rw = new HTMLRewriter()
    .on('meta[property="og:image"]', { element: el => el.setAttribute('content', image) })
  const m = SLUG.exec(url.pathname)
  const salon = m ? await salonName(env, m[1]) : null
  if (salon) {
    const city = salon.address?.split(',').pop()?.trim().replace(/^\d{4}-\d{3}\s*/, '') || null
    const meta = salonMeta(salon.name, city && city.length <= 40 ? city : null)
    rw = rw
      .on('title', { element: el => el.setInnerContent(meta.title) })
      .on('meta[name="description"]', { element: el => el.setAttribute('content', meta.description) })
      .on('meta[property="og:title"]', { element: el => el.setAttribute('content', meta.title) })
      .on('meta[property="og:description"]', { element: el => el.setAttribute('content', meta.description) })
  }
  return rw.transform(res)
}
