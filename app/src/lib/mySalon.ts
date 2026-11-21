import { supabase, type Salon } from './supabase'

export type Role = 'dono' | 'equipa'
export interface MySalon { salon: Salon | null; role: Role; professionalId: string | null }

/**
 * The salon the signed-in person owns or works in. Owners are found directly;
 * team members through migration 0013, which also accepts a pending invite on
 * their first sign-in.
 */
export async function loadMySalon(userId: string): Promise<MySalon> {
  const { data: own } = await supabase.from('salons').select('*').eq('owner_id', userId).maybeSingle()
  if (own) return { salon: own, role: 'dono', professionalId: null }
  await supabase.rpc('accept_invites') // fails quietly before the migration
  const { data, error } = await supabase.rpc('my_salon')
  const row = !error ? (data ?? [])[0] as { salon_id: string; role: Role; professional_id: string | null } | undefined : undefined
  if (!row) return { salon: null, role: 'dono', professionalId: null }
  const { data: s } = await supabase.from('salons').select('*').eq('id', row.salon_id).maybeSingle()
  return { salon: s, role: row.role, professionalId: row.professional_id }
}
