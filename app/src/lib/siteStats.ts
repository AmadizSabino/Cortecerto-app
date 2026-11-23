/** /admin > Site and Sistema (migration 0027): types and the sums behind the screens. */

export interface SiteStats {
  days: number
  totals: Record<string, number>
  visitors: Partial<Record<'site' | 'registo' | 'salao' | 'painel' | 'outra', number>>
  daily: { day: string; site: number; salao: number; marcacoes: number }[]
  sources: { source: string; campaign: boolean; visits: number; accounts: number; bookings: number }[]
  devices: Record<string, number>
  salons: { id: string; name: string; visits: number; started: number; booked: number; whatsapp: number }[]
}

export interface UptimeWindow { checks: number; failed: number }
export interface Ops {
  uptime: Record<'24h' | '7d' | '30d', UptimeWindow> | null
  last_check: { at: string; ok: boolean; app_ok: boolean; db_ok: boolean; ms: number; detail: string | null } | null
  failures: { at: string; app_ok: boolean; db_ok: boolean; detail: string | null }[]
  ai_month: { cost_eur: number; budget_eur: number; requests: number; unpriced: number } | null
  ai_features: { feature: string; model: string; n: number; input_tokens: number | null; output_tokens: number | null; images: number | null; cost_usd: number | null }[]
  ai_months: { month: string; cost_usd: number | null; n: number }[]
  alerts: { kind: string; period: string; sent_at: string }[]
}

export interface AiSettings { orcamento_eur: number; eur_por_usd: number; precos: Record<string, { entrada?: number; saida?: number; imagem?: number }> }
export interface DigestSettings { diario: boolean; email: string }

export const SOURCE_LABEL: Record<string, string> = {
  cartaz: 'Cartaz com QR', direto: 'Direto (link escrito, app, favoritos)', instagram: 'Instagram', facebook: 'Facebook',
  tiktok: 'TikTok', google: 'Google', whatsapp: 'WhatsApp', bing: 'Bing',
}
export const ALERT_LABEL: Record<string, string> = {
  site_em_baixo: 'Site em baixo', site_voltou: 'Site voltou', orcamento_ia: 'Orçamento da IA passado', resumo: 'Resumo diário',
}

const n = (v: unknown) => Number(v ?? 0) || 0

/** Share of checks that passed, or null with no checks. */
export function uptimePct(w: UptimeWindow | undefined | null): number | null {
  if (!w || !n(w.checks)) return null
  return (n(w.checks) - n(w.failed)) / n(w.checks)
}

export function formatUptime(p: number | null): string {
  if (p === null) return '—'
  if (p === 1) return '100%'
  return `${(Math.floor(p * 1000) / 10).toLocaleString('pt-PT')}%`
}

/** How the month's AI cost stands against the budget. */
export function budgetState(cost: number, budget: number): { share: number; level: 'ok' | 'aviso' | 'passou' } {
  const share = budget > 0 ? cost / budget : 0
  return { share, level: share >= 1 ? 'passou' : share >= 0.8 ? 'aviso' : 'ok' }
}

/** From the site to a salon, and from a booking page to a booking. */
export function siteFunnels(s: SiteStats) {
  const t = (k: string) => n(s.totals[k])
  return {
    signup: [
      { label: 'Visitantes do site', count: n(s.visitors.site) },
      { label: 'Contas criadas', count: t('registo:conta_criada') },
      { label: 'Salões criados', count: t('registo:salao_criado') },
    ],
    booking: [
      { label: 'Visitas às páginas dos salões', count: t('salao:visita') },
      { label: 'Escolheram um serviço', count: t('salao:marcacao_inicio') },
      { label: 'Marcaram', count: t('salao:marcacao_feita') },
    ],
  }
}

/** Dollars to euros with the settings' rate, for display. */
export const usdToEur = (usd: number | null | undefined, rate: number) => n(usd) * rate

export const eurText = (v: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < 0.1 ? 3 : 2 }).format(v)
