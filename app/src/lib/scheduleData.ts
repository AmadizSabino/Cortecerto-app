import { supabase } from './supabase'
import type { SalonHours } from './schedule'
import type { OpeningHours } from './slots'

/** Loads the salon's and the professionals' hours. Before migration 0009, only the salon's. */
export async function loadHours(salonId: string): Promise<SalonHours> {
  const [s, p] = await Promise.all([
    supabase.from('opening_hours').select('weekday,opens,closes').eq('salon_id', salonId),
    supabase.from('professional_hours').select('professional_id,weekday,opens,closes').eq('salon_id', salonId),
  ])
  const byPro: Record<string, OpeningHours[]> = {}
  for (const r of (p.error ? [] : p.data ?? []) as (OpeningHours & { professional_id: string })[]) {
    (byPro[r.professional_id] ??= []).push({ weekday: r.weekday, opens: r.opens, closes: r.closes })
  }
  return { salon: (s.data ?? []) as OpeningHours[], byPro }
}
