/** Batch 4 of the admin (migration 0028): prospects, how salons heard about CorteCerto, demo salons. */

export type ProspectStatus = 'por_contactar' | 'contactado' | 'demo_marcada' | 'em_experiencia' | 'cliente' | 'sem_interesse'
export interface Prospect {
  id: string; created_at: string; updated_at: string
  name: string; contact_name: string | null; city: string | null; phone: string | null; instagram: string | null; email: string | null
  source: string | null; status: ProspectStatus; next_on: string | null; notes: string; salon_id: string | null
}

export const PROSPECT_STATUS: [ProspectStatus, string][] = [
  ['por_contactar', 'Por contactar'], ['contactado', 'Contactado'], ['demo_marcada', 'Demo marcada'],
  ['em_experiencia', 'A experimentar'], ['cliente', 'Cliente'], ['sem_interesse', 'Sem interesse'],
]
export const PROSPECT_LABEL = Object.fromEntries(PROSPECT_STATUS) as Record<ProspectStatus, string>
const OPEN: ProspectStatus[] = ['por_contactar', 'contactado', 'demo_marcada', 'em_experiencia']

export type Heard = 'instagram' | 'facebook' | 'tiktok' | 'google' | 'amigo' | 'visita' | 'cartaz' | 'outro'
export const HEARD: [Heard, string][] = [
  ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['google', 'Pesquisa no Google'],
  ['amigo', 'Um colega ou amigo'], ['visita', 'Visita da CorteCerto ao salão'], ['cartaz', 'Cartaz ou folheto'], ['outro', 'Outro'],
]
export const HEARD_LABEL: Record<string, string> = { ...Object.fromEntries(HEARD), sem_resposta: 'Sem resposta' }

/** Open prospects whose follow-up is today or overdue, oldest first. */
export function followUpsDue(list: Prospect[], today: string): Prospect[] {
  return list.filter(p => OPEN.includes(p.status) && p.next_on && p.next_on <= today)
    .sort((a, b) => (a.next_on ?? '').localeCompare(b.next_on ?? ''))
}

/** The list order: follow-ups due first, then by next date, then the newest; closed ones last. */
export function sortProspects(list: Prospect[], today: string): Prospect[] {
  const rank = (p: Prospect) => !OPEN.includes(p.status) ? 3 : p.next_on && p.next_on <= today ? 0 : p.next_on ? 1 : 2
  return [...list].sort((a, b) => rank(a) - rank(b) || (a.next_on ?? '').localeCompare(b.next_on ?? '') || b.created_at.localeCompare(a.created_at))
}

/** Counts per status, for the chips. */
export function prospectCounts(list: Prospect[]): Record<ProspectStatus, number> {
  const c = Object.fromEntries(PROSPECT_STATUS.map(([k]) => [k, 0])) as Record<ProspectStatus, number>
  for (const p of list) c[p.status]++
  return c
}

/** An Instagram handle or link, as a link. */
export function instagramUrl(v: string | null): string | null {
  const h = (v ?? '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '')
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? `https://instagram.com/${h}` : null
}
