/** The setup checklist shown on the agenda until the salon is ready for clients. */

export interface SetupInput {
  services: number
  professionals: number
  openDays: number
  whatsapp: string | null
  depositCents: number
  mbway: string | null
  hasBookings: boolean
  marks: SetupMarks
}

/** Steps the app cannot check by itself; the owner ticks them, kept in the browser. */
export interface SetupMarks { poster?: boolean; bio?: boolean; google?: boolean; hidden?: boolean }

export interface SetupStep {
  id: string
  label: string
  done: boolean
  /** Where to go to do it: an app route, or a manual tick. */
  to?: string
  manual?: keyof SetupMarks
}

export function setupSteps(i: SetupInput): SetupStep[] {
  const depositOk = i.depositCents === 0 || (i.mbway ?? '').replace(/\D/g, '').length >= 9
  return [
    { id: 'servicos', label: 'Serviços e preços', done: i.services > 0, to: '/definicoes' },
    { id: 'equipa', label: 'Equipa e horário', done: i.professionals > 0 && i.openDays > 0, to: '/definicoes' },
    { id: 'whatsapp', label: 'WhatsApp do salão', done: (i.whatsapp ?? '').replace(/\D/g, '').length >= 9, to: '/definicoes' },
    { id: 'sinal', label: i.depositCents > 0 ? 'Número MB Way para o sinal' : 'Sinal MB Way (opcional, sem sinal)', done: depositOk, to: '/definicoes' },
    { id: 'poster', label: 'Imprimir o poster com QR', done: Boolean(i.marks.poster), to: '/poster', manual: 'poster' },
    { id: 'bio', label: 'Pôr o link na bio do Instagram', done: Boolean(i.marks.bio), manual: 'bio' },
    { id: 'google', label: 'Pôr o link no perfil do Google', done: Boolean(i.marks.google), manual: 'google' },
    { id: 'marcacao', label: 'Receber a primeira marcação', done: i.hasBookings },
  ]
}

const KEY = 'cortecerto-setup:'
export function loadMarks(salonId: string): SetupMarks {
  try { return JSON.parse(localStorage.getItem(KEY + salonId) ?? '{}') as SetupMarks } catch { return {} }
}
export function saveMarks(salonId: string, marks: SetupMarks) {
  try { localStorage.setItem(KEY + salonId, JSON.stringify(marks)) } catch { /* private mode */ }
}
