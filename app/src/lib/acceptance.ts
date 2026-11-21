import { supabase } from './supabase'
import { missingAcceptances, type LegalDoc } from './legal'

/**
 * The required documents the signed-in owner still has to accept.
 * Returns null when acceptances can't be checked (for example before
 * migration 0004 runs), so the app keeps working.
 */
export async function pendingDocs(): Promise<LegalDoc[] | null> {
  const { data, error } = await supabase.from('legal_acceptances').select('document,version')
  if (error) return null
  return missingAcceptances(data ?? [])
}

/** Records the acceptance of each document, with the browser it came from. */
export async function recordAcceptance(docs: LegalDoc[], salonId: string | null): Promise<boolean> {
  if (docs.length === 0) return true
  const userAgent = navigator.userAgent.slice(0, 400)
  const { error } = await supabase.from('legal_acceptances')
    .insert(docs.map(d => ({ document: d.id, version: d.version, salon_id: salonId, user_agent: userAgent })))
  return !error
}
