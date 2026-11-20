import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)
// The anon key is public by design; row level security protects the data.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing')

export interface Salon {
  id: string; slug: string; name: string; type: string
  whatsapp: string | null; mbway_number: string | null
  deposit_cents: number; theme: string; timezone: string
  address?: string | null; news?: string | null; google_review_url?: string | null
}
export interface Service { id: string; name: string; duration_min: number; price_cents: number }
export interface Professional { id: string; name: string }
export interface Booking {
  id: string; starts_at: string; ends_at: string; client_name: string; client_phone: string
  consent_messages: boolean
  status: 'pendente' | 'confirmada' | 'concluida' | 'faltou' | 'cancelada'
  deposit: 'nenhum' | 'pendente' | 'pago'
  service_id: string; professional_id: string
  reminded_at?: string | null; source?: 'online' | 'telefone' | 'presencial'
}

export const euros = (cents: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100)

export const initials = (name: string) =>
  name.trim().split(/\s+/).filter(w => w.length > 2 || /^[A-ZÀ-Ú]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || name.slice(0, 2).toUpperCase()
