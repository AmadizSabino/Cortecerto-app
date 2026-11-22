export type SalonType = 'barbearia' | 'cabeleireiro' | 'unhas' | 'depilacao' | 'estetica' | 'sobrancelhas' | 'maquilhagem' | 'massagem'

export const SALON_TYPES: { id: SalonType; label: string }[] = [
  { id: 'barbearia', label: 'Barbearia' },
  { id: 'cabeleireiro', label: 'Cabeleireiro' },
  { id: 'unhas', label: 'Unhas' },
  { id: 'depilacao', label: 'Depilação' },
  { id: 'estetica', label: 'Estética' },
  { id: 'sobrancelhas', label: 'Sobrancelhas e pestanas' },
  { id: 'maquilhagem', label: 'Maquilhagem' },
  { id: 'massagem', label: 'Massagem' },
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
  estetica: [
    { name: 'Limpeza de pele', duration_min: 60, price_cents: 3500 },
    { name: 'Tratamento de rosto', duration_min: 45, price_cents: 3000 },
    { name: 'Massagem facial', duration_min: 30, price_cents: 2000 },
  ],
  sobrancelhas: [
    { name: 'Design de sobrancelhas', duration_min: 20, price_cents: 1000 },
    { name: 'Laminação de sobrancelhas', duration_min: 45, price_cents: 3000 },
    { name: 'Extensão de pestanas', duration_min: 90, price_cents: 4500 },
  ],
  maquilhagem: [
    { name: 'Maquilhagem social', duration_min: 45, price_cents: 3500 },
    { name: 'Maquilhagem de noiva', duration_min: 90, price_cents: 12000 },
    { name: 'Prova de maquilhagem', duration_min: 60, price_cents: 5000 },
  ],
  massagem: [
    { name: 'Massagem relaxante', duration_min: 60, price_cents: 4000 },
    { name: 'Massagem desportiva', duration_min: 45, price_cents: 3500 },
    { name: 'Drenagem linfática', duration_min: 60, price_cents: 4500 },
  ],
}

/** Areas the salon covers (salons.areas, migration 0022); the main one is salons.type. */
export const AREAS = SALON_TYPES

/** How clients come in, and where the salon works (migration 0022). */
export const BOOKING_MODES = [
  { id: 'ambos', label: 'Com e sem marcação' },
  { id: 'marcacao', label: 'Só com marcação' },
  { id: 'sem_marcacao', label: 'Sobretudo sem marcação (fila)' },
] as const
export const WORK_PLACES = [
  { id: 'salao', label: 'No salão' },
  { id: 'ambos', label: 'No salão e ao domicílio' },
  { id: 'domicilio', label: 'Só ao domicílio (não tenho salão)' },
] as const
export type BookingMode = typeof BOOKING_MODES[number]['id']
export type WorkPlace = typeof WORK_PLACES[number]['id']

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
