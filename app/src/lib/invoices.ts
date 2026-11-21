import { supabase } from './supabase'

/** A monthly invoice CorteCerto issues to a salon (migration 0017). */
export interface Invoice {
  id: string; salon_id: string; number: string; issued_on: string
  period: string | null; amount_cents: number; file_path: string
}

export const BUCKET = 'invoices'

export async function listInvoices(salonId: string): Promise<Invoice[] | null> {
  const { data, error } = await supabase.from('invoices').select('*').eq('salon_id', salonId).order('issued_on', { ascending: false })
  return error ? null : data ?? []
}

/** Opens the PDF through a link valid for a minute (the bucket is private). */
export async function openInvoice(inv: Invoice): Promise<boolean> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(inv.file_path, 60, { download: `Fatura ${inv.number.replace(/[\\/]/g, '-')}.pdf` })
  if (error || !data) return false
  location.assign(data.signedUrl)
  return true
}

/** Where a salon's invoice file goes: its own folder, a random name. */
export const invoicePath = (salonId: string) => `${salonId}/${crypto.randomUUID()}.pdf`

/** "24,48" or "24.48" -> 2448; NaN when it isn't an amount. */
export function parseAmount(text: string): number {
  const t = text.trim().replace(/\s|€/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN
  return Math.round(Number(t) * 100)
}
