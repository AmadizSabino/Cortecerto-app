/**
 * "Traga um colega" (migration 0034): a salon shares cortecerto.pt/?convite=<its slug>. The code is
 * kept in this browser until the new salon is created, then recorded with set_referrer. When the
 * new salon pays its first month, the admin gives both salons one month free.
 */

const KEY = 'cc-convite'
/** An invite is remembered for 30 days in this browser. */
const KEEP_MS = 30 * 86_400_000

export const cleanCode = (v: string | null | undefined) => (v ?? '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '').slice(0, 40)

/** Keeps ?convite= from the address, on any page. */
export function captureInvite(search = location.search, now = Date.now()) {
  const code = cleanCode(new URLSearchParams(search).get('convite'))
  if (!code) return
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: now })) } catch { /* no storage */ }
}

export function savedInvite(now = Date.now()): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code?: string; at?: number } | null
    if (!v?.code || !v.at || now - v.at > KEEP_MS) return null
    return cleanCode(v.code) || null
  } catch { return null }
}

export function clearInvite() {
  try { localStorage.removeItem(KEY) } catch { /* no storage */ }
}

/** The link a salon shares with a colleague. ?src=convite counts it in /admin > Site. */
export const inviteLink = (origin: string, slug: string) => `${origin}/?convite=${encodeURIComponent(slug)}&src=convite`

export function inviteMessage(salonName: string, link: string): string {
  return `Olá! Uso a CorteCerto no ${salonName} para as marcações: os clientes marcam pelo telemóvel, sem chamadas, e a app lembra-os por WhatsApp. Experimente 30 dias grátis, sem cartão. Se aderir por este link, quando pagar o primeiro mês ganhamos os dois um mês grátis: ${link}`
}
