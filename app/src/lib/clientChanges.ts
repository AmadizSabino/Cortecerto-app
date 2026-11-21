/** Rules for clients cancelling or moving their own booking (migration 0007). */

export interface ChangeRules {
  status: string
  starts_at: string
  client_change_hours: number | null
}

export type ChangeState = 'pode' | 'fechada' | 'nao_permitido' | 'fora_do_prazo'

/** Mirrors client_change_check in the database, so the page only offers what will work. */
export function changeState(b: ChangeRules, now = new Date()): ChangeState {
  if (b.status !== 'pendente' && b.status !== 'confirmada') return 'fechada'
  if (b.client_change_hours === null) return 'nao_permitido'
  const limit = new Date(b.starts_at).getTime() - b.client_change_hours * 3_600_000
  return limit < now.getTime() ? 'fora_do_prazo' : 'pode'
}

/** The client's private link to see, cancel or move the booking. */
export function manageLink(origin: string, bookingId: string): string {
  return `${origin}/m/${bookingId}`
}

/** "2 horas antes", "1 dia antes": the salon's limit in words. */
export function limitText(hours: number): string {
  if (hours === 0) return 'até à hora marcada'
  if (hours % 24 === 0) return `até ${hours / 24} ${hours === 24 ? 'dia' : 'dias'} antes`
  return `até ${hours} ${hours === 1 ? 'hora' : 'horas'} antes`
}

export const CHANGE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Não permitir' },
  { value: 1, label: 'Até 1 hora antes' },
  { value: 2, label: 'Até 2 horas antes' },
  { value: 4, label: 'Até 4 horas antes' },
  { value: 12, label: 'Até 12 horas antes' },
  { value: 24, label: 'Até 1 dia antes' },
  { value: 48, label: 'Até 2 dias antes' },
]
