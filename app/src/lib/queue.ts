/** Walk-in queue helpers (migration 0008). */

/** Rough wait in minutes: people ahead × average service ÷ professionals, rounded up to 5. */
export function estimateWait(ahead: number, avgMinutes: number, professionals: number): number {
  if (ahead <= 0) return 0
  const raw = (ahead * avgMinutes) / Math.max(professionals, 1)
  return Math.ceil(raw / 5) * 5
}

export function waitText(minutes: number): string {
  if (minutes <= 0) return 'É o próximo'
  if (minutes < 60) return `cerca de ${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `cerca de ${h} h${m ? ` ${m} min` : ''}`
}

const KEY = 'cortecerto-fila:'
/** The client's place in a salon's queue, kept in their browser. */
export function savedPlace(slug: string): string | null {
  try { return localStorage.getItem(KEY + slug) } catch { return null }
}
export function savePlace(slug: string, id: string | null) {
  try { if (id) localStorage.setItem(KEY + slug, id); else localStorage.removeItem(KEY + slug) } catch { /* private mode */ }
}

export interface Walkin {
  id: string; client_name: string; client_phone: string | null; consent_messages: boolean
  status: 'espera' | 'chamado' | 'atendido' | 'saiu'; created_at: string; called_at: string | null
}
