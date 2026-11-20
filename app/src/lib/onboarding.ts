export type SalonType = 'barbearia' | 'cabeleireiro' | 'unhas' | 'depilacao'

export const SALON_TYPES: { id: SalonType; label: string }[] = [
  { id: 'barbearia', label: 'Barbearia' },
  { id: 'cabeleireiro', label: 'Cabeleireiro' },
  { id: 'unhas', label: 'Unhas' },
  { id: 'depilacao', label: 'Depilação' },
]

export interface DraftService { name: string; duration_min: number; price_cents: number }

/** Starting suggestions only: the salon edits every price before saving. */
export const SUGGESTED_SERVICES: Record<SalonType, DraftService[]> = {
  barbearia: [
    { name: 'Corte', duration_min: 30, price_cents: 1200 },
    { name: 'Corte + barba', duration_min: 45, price_cents: 1800 },
    { name: 'Barba', duration_min: 20, price_cents: 800 },
  ],
  cabeleireiro: [
    { name: 'Corte senhora', duration_min: 45, price_cents: 2000 },
    { name: 'Brushing', duration_min: 30, price_cents: 1500 },
    { name: 'Coloração', duration_min: 90, price_cents: 4000 },
  ],
  unhas: [
    { name: 'Manicure', duration_min: 30, price_cents: 1200 },
    { name: 'Verniz gel', duration_min: 60, price_cents: 2200 },
    { name: 'Pedicure', duration_min: 45, price_cents: 2000 },
  ],
  depilacao: [
    { name: 'Buço', duration_min: 10, price_cents: 500 },
    { name: 'Pernas completas', duration_min: 40, price_cents: 2200 },
    { name: 'Axilas', duration_min: 15, price_cents: 700 },
  ],
}

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** "Barbearia do Zé" -> "barbearia-do-ze" */
export function slugify(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

/** "12,50" or "12.5" -> 1250 cents; NaN when not a valid amount. */
export function parseEuros(input: string): number {
  const v = input.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return NaN
  return Math.round(Number(v) * 100)
}
