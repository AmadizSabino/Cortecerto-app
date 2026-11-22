import { supabase, type Salon } from './supabase'
import { toRole, type Role } from './access'

export type { Role } from './access'
export interface MySalon { salon: Salon | null; role: Role; professionalId: string | null }

/**
 * The salon the signed-in person owns or works in. Owners are found directly;
 * team members through migration 0013, which also accepts a pending invite on
 * their first sign-in. Since migration 0018 a member's role is their access level
 * (agenda, rececao or gestor); before it, members show as Receção.
 */
export async function loadMySalon(userId: string): Promise<MySalon> {
  const { data: own } = await supabase.from('salons').select('*').eq('owner_id', userId).maybeSingle()
  if (own) return { salon: own, role: 'dono', professionalId: null }
  await supabase.rpc('accept_invites') // fails quietly before the migration
  const { data, error } = await supabase.rpc('my_salon')
  const row = !error ? (data ?? [])[0] as { salon_id: string; role: string; professional_id: string | null } | undefined : undefined
  if (!row) return { salon: null, role: 'dono', professionalId: null }
  const { data: s } = await supabase.from('salons').select('*').eq('id', row.salon_id).maybeSingle()
  return { salon: s, role: toRole(row.role), professionalId: row.professional_id }
}
