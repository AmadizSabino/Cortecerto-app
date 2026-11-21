import { supabase } from './supabase'
import { indexOverrides, type Override, type Overrides } from './pricing'

/** Per-professional prices; `ready` is false before migration 0011 runs. */
export async function loadOverrides(salonId: string): Promise<{ overrides: Overrides; ready: boolean }> {
  const { data, error } = await supabase.from('service_overrides')
    .select('service_id,professional_id,offered,price_cents,duration_min').eq('salon_id', salonId)
  if (error) return { overrides: {}, ready: false }
  return { overrides: indexOverrides((data ?? []) as Override[]), ready: true }
}
