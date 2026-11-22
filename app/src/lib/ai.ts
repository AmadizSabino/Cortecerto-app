import { supabase } from './supabase'

/**
 * The AI features, as the pages call them. Each one goes to the Worker
 * (/api/ai/<id>, worker/ai.ts), which decides the model and checks access.
 * Until the AI is switched on the answer is "indisponivel" and the pages say
 * "Em breve", so every entry point can already be in place.
 */
export type AiFeature =
  | 'try-on' | 'before-after' | 'cut-suggestions' | 'reference-notes'
  | 'owner-assistant' | 'whatsapp-assistant' | 'review-reply' | 'weekly-report' | 'price-suggestions' | 'promo-caption'

export interface AiResult { status: 'feito' | 'indisponivel' | 'limite' | 'erro'; text?: string; image?: string; message?: string }

export const AI_FEATURES: { id: AiFeature; title: string; where: string; what: string; kind: 'text' | 'image' }[] = [
  { id: 'try-on', title: 'Antes e depois para o cliente', where: 'Página de marcação', what: 'O cliente tira uma selfie e vê o corte, a cor ou as unhas antes de marcar.', kind: 'image' },
  { id: 'before-after', title: 'Antes e depois no salão', where: 'Clientes > ficha do cliente', what: 'A partir da foto "antes", mostra ao cliente o resultado esperado do serviço.', kind: 'image' },
  { id: 'cut-suggestions', title: 'Sugestões de corte', where: 'Página de marcação', what: 'Sugere estilos do seu catálogo ao cliente, com base no que procura.', kind: 'text' },
  { id: 'reference-notes', title: 'Notas a partir de uma foto', where: 'Clientes > ficha do cliente', what: 'O cliente mostra uma foto de referência e a IA escreve as notas técnicas para o profissional.', kind: 'text' },
  { id: 'owner-assistant', title: 'Assistente do salão', where: 'Mais > Assistente IA', what: 'Pergunte pelo seu dia, semana ou clientes, em português.', kind: 'text' },
  { id: 'weekly-report', title: 'Relatório semanal', where: 'Mais > Assistente IA', what: 'Resumo da semana com três números e uma ação concreta.', kind: 'text' },
  { id: 'review-reply', title: 'Respostas a avaliações Google', where: 'Mais > Assistente IA', what: 'Cole uma avaliação e receba uma resposta no tom do salão, para aprovar.', kind: 'text' },
  { id: 'promo-caption', title: 'Legendas para promoções', where: 'Mais > Promoções', what: 'Escreve a legenda do post de cada promoção, no tom do salão.', kind: 'text' },
  { id: 'price-suggestions', title: 'Sugestões de preço', where: 'Mais > Assistente IA', what: 'Intervalos indicativos para os seus serviços. O preço é sempre decisão sua.', kind: 'text' },
  { id: 'whatsapp-assistant', title: 'Assistente de WhatsApp', where: 'WhatsApp do salão', what: 'Responde aos clientes 24 horas e marca, muda e cancela na agenda real.', kind: 'text' },
]

/** Calls one AI feature. Salon features send the person's session; client features send the salon id. */
export async function runAi(feature: AiFeature, input: Record<string, unknown>, salonId?: string): Promise<AiResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  try {
    const res = await fetch(`/api/ai/${feature}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ salon: salonId, input }),
    })
    const body = await res.json().catch(() => null) as AiResult | null
    // An older Worker without /api/ai answers 404 without JSON: the feature is simply not there yet.
    if (!body) return { status: 'indisponivel', message: 'A IA ainda não está ligada. Em breve.' }
    return body
  } catch {
    return { status: 'erro', message: 'Sem ligação. Tente de novo.' }
  }
}

/** Shrinks a photo in the browser before sending it (JPEG, longest side `max` px). */
export function photoToDataUrl(file: File, max = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('foto')) }
    img.src = url
  })
}
