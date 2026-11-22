/**
 * Who can do what in the salon panel (migration 0018).
 * The database enforces the same levels with has_access(); this file decides
 * what each person sees, so nobody is offered a button that would fail.
 */

export type Level = 'agenda' | 'rececao' | 'gestor'
export type Role = 'dono' | Level

export const LEVELS: { id: Level; label: string; short: string; can: string[]; cannot: string }[] = [
  {
    id: 'agenda', label: 'Agenda', short: 'Só a agenda e as marcações',
    can: ['Agenda do dia e da semana', 'Criar, mudar, confirmar e cancelar marcações', 'Sugerir outro horário ao cliente', 'Fila de espera e lembretes'],
    cannot: 'Não vê a lista de clientes, as estatísticas nem as definições.',
  },
  {
    id: 'rececao', label: 'Receção', short: 'Agenda, clientes e Clube',
    can: ['Tudo o que a Agenda faz', 'Lista de clientes, notas e registo de clientes novos', 'Convidar clientes', 'Membros do Clube', 'Posters'],
    cannot: 'Não vê estatísticas, preços, horários nem comissões.',
  },
  {
    id: 'gestor', label: 'Gestor', short: 'Gere a equipa, horários e preços',
    can: ['Tudo o que a Receção faz', 'Estatísticas e faturação', 'Promoções e posts', 'Horários, folgas e férias', 'Preços por profissional', 'Equipa e comissões', 'Definições do Clube', 'Assistente IA'],
    cannot: 'Não dá acessos, não muda as definições do salão nem a assinatura, e não exporta nem apaga dados.',
  },
]

const RANK: Record<Role, number> = { agenda: 1, rececao: 2, gestor: 3, dono: 4 }

/** Accepts the old role name 'equipa' (before migration 0018), which had Receção's access. */
export function toRole(r: string | null | undefined): Role {
  if (r === 'dono' || r === 'agenda' || r === 'rececao' || r === 'gestor') return r
  return 'rececao'
}

export const atLeast = (role: Role, need: Role) => RANK[role] >= RANK[need]

/** The lowest role that may open each part of the panel. */
export const NEED = {
  agenda: 'agenda', semana: 'agenda', fila: 'agenda', lembretes: 'agenda', revenue: 'gestor',
  clientes: 'rececao', convidar: 'rececao', clube: 'rececao', poster: 'rececao',
  estatisticas: 'gestor', promocoes: 'gestor', horarios: 'gestor', precos: 'gestor', equipa: 'gestor', clubeDefinicoes: 'gestor', ia: 'gestor',
  acessos: 'dono', definicoes: 'dono', assinatura: 'dono', exportar: 'dono', apagarCliente: 'dono',
} as const satisfies Record<string, Role>

export const can = (role: Role, what: keyof typeof NEED) => atLeast(role, NEED[what])

export const levelLabel = (r: Role) => r === 'dono' ? 'Dono/a' : LEVELS.find(l => l.id === r)!.label
