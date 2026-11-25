/**
 * AI features: POST /api/ai/<feature> { salon?, input }.
 *
 * Every AI feature of CorteCerto goes through here, so the app has one contract
 * to call and the model or provider can change without touching the pages.
 * The answer is always JSON with a status:
 *   { status: 'feito', text?, image? }   done
 *   { status: 'indisponivel', message }  not switched on yet (no key), or still being built
 *   { status: 'limite', message }        the salon used this month's allowance, or the client today's
 *   { status: 'erro', message }          the provider failed
 *
 * Switching on:
 *   ANTHROPIC_API_KEY (secret)  text features and reading photos, with Claude.
 *   AI_MODEL (variable)         optional, defaults to DEFAULT_MODEL.
 *   GEMINI_API_KEY (secret)     try-on and before/after with Google Gemini image editing
 *                               (GEMINI_IMAGE_MODEL optional, defaults to gemini-2.5-flash-image).
 *   IMAGE_API_URL / IMAGE_API_KEY  or any other image-editing service instead of Gemini.
 *     It receives POST { feature, image, style, prompt } and answers { image } (a data URL).
 * Salon features need the person's Supabase session (Authorization: Bearer <access token>)
 * and the access level in `need`. Client features need the salon's id.
 * Photos are sent to the provider for that one request and are not stored.
 */

import { ownerAssistant } from './assistant'

export interface AiEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  ANTHROPIC_API_KEY?: string
  AI_MODEL?: string
  IMAGE_API_URL?: string
  IMAGE_API_KEY?: string
  GEMINI_API_KEY?: string
  GEMINI_IMAGE_MODEL?: string
}

type Level = 'agenda' | 'rececao' | 'gestor' | 'dono'
type Input = Record<string, unknown>

interface Feature {
  kind: 'text' | 'image'
  /** salon: from the panel, signed in; client: from the public booking page. */
  who: 'salon' | 'client'
  need?: Level
  /** Requests per salon per calendar month, when limited. */
  monthly?: number
  /** Client features: requests per person (phone) in 24 hours. The connection gets three times as many, for a salon's shared Wi-Fi. */
  daily?: number
  system?: string
  /** The question for the model, from the request's input. Returns an error text when the input is wrong. */
  prompt: (input: Input) => string | { error: string }
  /** Feature still being built: answers "indisponivel" even with a key. */
  building?: boolean
}

export const DEFAULT_MODEL = 'claude-haiku-5-5'
/** Money figures (revenue, takings, what a client spent) only go to the owner, not to managers. */
const noMoney = (text: string) => text.replace(/-?\d[\d.\s]*,\d{2}\s*€/g, '').replace(/€\s*-?\d[\d.,]*/g, '')
const PT = 'Responde sempre em português de Portugal, com frases curtas e simples. Nunca inventes preços, horários ou dados que não te foram dados. Escreve texto simples, sem markdown: sem asteriscos, cardinais nem tabelas.'
const str = (v: unknown, max = 2000) => typeof v === 'string' ? v.trim().slice(0, max) : ''

export const FEATURES: Record<string, Feature> = {
  // Client: try a cut, colour or nails on a selfie ("antes e depois" for the client).
  'try-on': {
    kind: 'image', who: 'client', monthly: 50, daily: 4,
    prompt: i => str(i.style, 80) && str(i.image, 3_000_000) ? `Aplica o estilo "${str(i.style, 80)}" à pessoa da foto, mantendo o rosto, a luz e o fundo.` : { error: 'Falta a foto ou o estilo.' },
  },
  // Salon: from a "before" photo, show the expected result of a service ("antes e depois" for the salon).
  'before-after': {
    kind: 'image', who: 'salon', need: 'rececao', monthly: 200,
    prompt: i => str(i.style, 80) && str(i.image, 3_000_000) ? `Mostra o resultado de "${str(i.style, 80)}" nesta pessoa, mantendo o rosto, a luz e o fundo.` : { error: 'Falta a foto ou o serviço.' },
  },
  // Client: which cuts suit them, from a selfie and what they like.
  'cut-suggestions': {
    kind: 'text', who: 'client', monthly: 300, daily: 10,
    system: `És consultor de imagem de um salão. ${PT} Sugere 3 estilos do catálogo do salão, cada um com uma frase sobre porque fica bem.`,
    prompt: i => `Catálogo: ${str(i.catalogue, 600) || 'cortes clássicos e modernos'}.\nO cliente diz: ${str(i.wish, 400) || 'sem preferências'}.`,
  },
  // Salon: technical notes for the professional from a client's reference photo.
  'reference-notes': {
    kind: 'text', who: 'salon', need: 'agenda', monthly: 300,
    system: `És um profissional experiente de salão. ${PT} Descreve, em 3 a 5 tópicos técnicos, como chegar ao resultado da foto de referência (máquina, comprimentos, técnica, produtos).`,
    prompt: i => str(i.image, 3_000_000) ? `Foto de referência em anexo. Serviço: ${str(i.service, 80) || 'corte'}.` : { error: 'Falta a foto de referência.' },
  },
  // Salon: questions about the salon's own day ("quantas marcações tenho amanhã?").
  'owner-assistant': {
    kind: 'text', who: 'salon', need: 'gestor', monthly: 500,
    system: `És o assistente de um salão: lês a agenda, os clientes e os números do salão e explicas ao dono, como um bom rececionista. ${PT}
Responde diretamente à pergunta, com datas, horas, clientes, serviços e profissionais concretos. Para horas livres, usa a ferramenta free_slots e indica os intervalos, por exemplo "11:00–12:30 com o Miguel". Para um dia ou semana, diz primeiro o essencial (quantas marcações, quanto vai faturar, onde há buracos) e depois os detalhes. No máximo 8 linhas curtas. Nunca mostres números de telemóvel. Se os dados não tiverem o que é pedido, diz o que falta numa frase.`,
    prompt: i => str(i.question, 500) ? `${str(i.context, 20000)}\n\nPergunta do dono: ${str(i.question, 500)}` : { error: 'Escreva a pergunta.' },
  },
  // Salon: the WhatsApp receptionist that books, moves and cancels. Needs the WhatsApp Business API first.
  'whatsapp-assistant': {
    kind: 'text', who: 'salon', need: 'dono', building: true,
    prompt: () => ({ error: 'Ainda em desenvolvimento.' }),
  },
  // Salon: a reply to a Google review, in the salon's tone, for the owner to approve.
  'review-reply': {
    kind: 'text', who: 'salon', need: 'gestor', monthly: 200,
    system: `Escreves respostas a avaliações Google de um salão. ${PT} Agradece, responde ao que a pessoa disse, e nunca prometas descontos. Máximo 4 frases.`,
    prompt: i => str(i.review, 1500) ? `Salão: ${str(i.salon, 80)}.\nAvaliação (${str(i.stars, 2) || '?'} estrelas): ${str(i.review, 1500)}` : { error: 'Cole o texto da avaliação.' },
  },
  // Salon: Monday summary of last week and one suggestion.
  'weekly-report': {
    kind: 'text', who: 'salon', need: 'gestor', monthly: 10,
    system: `Fazes o resumo semanal de um salão para o dono ler no telemóvel. ${PT} Três números importantes, o que correu bem, o que melhorar, e uma só ação concreta para esta semana.`,
    prompt: i => str(i.context, 4000) ? `Números da semana:\n${str(i.context, 4000)}` : { error: 'Sem dados da semana.' },
  },
  // Salon: the caption for a promotion's post (Mais > Promoções).
  'promo-caption': {
    kind: 'text', who: 'salon', need: 'gestor', monthly: 100,
    system: `Escreves legendas curtas para as redes sociais de um salão em Portugal. ${PT} Máximo 3 frases, tom próximo, uma chamada para marcar no fim com o link dado, sem hashtags (são juntas depois) e sem emojis em excesso (no máximo 2).`,
    prompt: i => str(i.offer, 80) ? `Salão: ${str(i.salon, 80)} (${str(i.type, 30)}).\nPromoção: ${str(i.title, 80)}, ${str(i.offer, 80)}, ${str(i.when, 160)}.\nLink: ${str(i.link, 200)}` : { error: 'Falta a promoção.' },
  },
  // Salon: post ideas for the week, from the agenda's quiet hours and the dates coming up (Social Media Manager).
  'social-plan': {
    kind: 'text', who: 'salon', need: 'gestor', monthly: 30,
    system: `És o gestor de redes sociais de um salão em Portugal. ${PT} Dá 3 ideias de posts para esta semana, cada uma com o dia, o que fotografar ou filmar e uma legenda curta. Usa os dados dados; não inventes promoções que não existem.`,
    prompt: i => `Salão: ${str(i.salon, 80)} (${str(i.type, 30)}).\n${str(i.context, 2000)}`,
  },
  // Salon: price ranges for the salon's services in its area. The salon always decides.
  'price-suggestions': {
    kind: 'text', who: 'salon', need: 'gestor', monthly: 20,
    system: `Ajudas um salão a pensar nos seus preços. ${PT} Dá intervalos indicativos e diz sempre que o preço é decisão do salão. Não afirmes dados de concorrentes que não te foram dados.`,
    prompt: i => str(i.services, 2000) ? `Zona: ${str(i.city, 80) || 'Portugal'}. Tipo de salão: ${str(i.type, 40)}.\nServiços e preços atuais:\n${str(i.services, 2000)}` : { error: 'Sem serviços.' },
  },
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RANK: Record<string, number> = { agenda: 1, rececao: 2, gestor: 3, dono: 4 }

export async function handleAi(request: Request, env: AiEnv, name: string): Promise<Response> {
  if (request.method !== 'POST') return json({ status: 'erro', message: 'Method not allowed' }, 405)
  const feature = FEATURES[name]
  if (!feature) return json({ status: 'erro', message: 'Funcionalidade desconhecida.' }, 404)

  let body: { salon?: unknown; input?: unknown; device?: unknown } = {}
  try { body = await request.json() } catch { /* empty body */ }
  const input = (body.input && typeof body.input === 'object' ? body.input : {}) as Input

  // Who is asking, and for which salon.
  let salonId = ''
  let userId: string | null = null
  let role = ''
  if (feature.who === 'salon') {
    const who = await signedIn(request, env)
    if (!who) return json({ status: 'erro', message: 'Inicie sessão no painel.' }, 401)
    if ((RANK[who.role] ?? 0) < RANK[feature.need ?? 'agenda']) return json({ status: 'erro', message: 'O seu acesso não inclui esta funcionalidade.' }, 403)
    salonId = who.salonId; userId = who.userId; role = who.role
  } else {
    salonId = String(body.salon ?? '')
    if (!UUID.test(salonId)) return json({ status: 'erro', message: 'Salão inválido.' }, 400)
  }

  if (feature.who === 'salon' && role !== 'dono' && typeof input.context === 'string') input.context = noMoney(input.context)
  const prompt = feature.prompt(input)
  if (typeof prompt !== 'string') return json({ status: 'erro', message: prompt.error }, 400)

  const configured = feature.kind === 'text' ? Boolean(env.ANTHROPIC_API_KEY) : Boolean(env.GEMINI_API_KEY || env.IMAGE_API_URL)
  if (feature.building || !configured) {
    await log(env, salonId, name, 'indisponivel', userId)
    return json({ status: 'indisponivel', message: feature.building ? 'Esta funcionalidade está em desenvolvimento.' : 'A IA ainda não está ligada. Em breve.' })
  }
  const client = feature.who === 'client' ? await clientKeys(env, request, body.device) : {}
  if (feature.daily && await overDaily(env, name, feature.daily, client)) {
    await log(env, salonId, name, 'limite', userId, undefined, client)
    return json({ status: 'limite', message: `Já usou as ${feature.daily} vezes de hoje. Pode experimentar de novo amanhã, ou peça no salão.` })
  }
  if (feature.monthly && await usedThisMonth(env, salonId, name) >= feature.monthly) {
    await log(env, salonId, name, 'limite', userId, undefined, client)
    return json({ status: 'limite', message: 'Atingiu o limite deste mês para esta funcionalidade.' })
  }

  try {
    const r = name === 'owner-assistant' && env.SUPABASE_SERVICE_ROLE_KEY
      ? await ownerAssistant(env, { salonId, system: feature.system!, question: str(input.question, 500), context: str(input.context, 20000), model: env.AI_MODEL || DEFAULT_MODEL, money: role === 'dono' })
      : feature.kind === 'text' ? await askClaude(env, feature, prompt, str(input.image, 3_000_000)) : await editImage(env, name, input, prompt)
    await log(env, salonId, name, 'feito', userId, r.usage, client)
    return json({ status: 'feito', ...(feature.kind === 'text' ? { text: r.out } : { image: r.out }) })
  } catch (e) {
    await log(env, salonId, name, 'erro', userId, undefined, client)
    console.error('ai', name, e instanceof Error ? e.message : e)
    return json({ status: 'erro', message: 'Não foi possível agora. Tente de novo daqui a pouco.' }, 502)
  }
}

/** The person's salon and access level, from their Supabase session (my_salon, migrations 0013 and 0018). */
async function signedIn(request: Request, env: AiEnv): Promise<{ userId: string; salonId: string; role: string } | null> {
  const auth = request.headers.get('Authorization') ?? ''
  if (!/^Bearer [\w.-]+$/.test(auth) || !env.SUPABASE_SERVICE_ROLE_KEY) return null
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: auth, 'Content-Type': 'application/json' }
  const user = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers })
  if (!user.ok) return null
  const { id } = await user.json() as { id: string }
  const mine = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/my_salon`, { method: 'POST', headers, body: '{}' })
  if (!mine.ok) return null
  const row = (await mine.json() as { salon_id: string; role: string }[])[0]
  if (!row) return null
  return { userId: id, salonId: row.salon_id, role: row.role === 'equipa' ? 'rececao' : row.role }
}

async function usedThisMonth(env: AiEnv, salonId: string, feature: string): Promise<number> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return 0
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0)
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/ai_requests?select=id&salon_id=eq.${salonId}&feature=eq.${feature}&status=eq.feito&created_at=gte.${start.toISOString()}`, {
    method: 'HEAD', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: 'count=exact' },
  })
  return Number(res.headers.get('content-range')?.split('/')[1] ?? 0) || 0
}

/** What a request used, for its cost (migration 0027 prices it from the settings). */
export interface Usage { model: string; input_tokens?: number; output_tokens?: number; images?: number }

async function log(env: AiEnv, salonId: string, feature: string, status: string, userId: string | null, usage?: Usage, client: ClientKeys = {}) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return
  await fetch(`${env.SUPABASE_URL}/rest/v1/ai_requests`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ salon_id: salonId, feature, status, created_by: userId, ...usage, ...client }),
  }).then(async r => {
    // Before migrations 0027 and 0029 the usage and client columns are missing: keep the row without them.
    if (!r.ok && (usage || client.client_device || client.client_ip)) await log(env, salonId, feature, status, userId)
  }).catch(() => {}) // before migration 0018 the table is missing: the feature still answers
}

/**
 * Who a client is, for the daily limit, without keeping who they are: keyed hashes (HMAC with the
 * service key) of the phone's random id and of the connection. Cleared after two days (forgetClients).
 */
export interface ClientKeys { client_device?: string; client_ip?: string }

async function clientKeys(env: AiEnv, request: Request, device: unknown): Promise<ClientKeys> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return {}
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SUPABASE_SERVICE_ROLE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const hash = async (v: string) => [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(v)))].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('')
  const d = typeof device === 'string' && /^[\w-]{8,64}$/.test(device) ? device : ''
  const ip = request.headers.get('CF-Connecting-IP') ?? ''
  return { ...(d ? { client_device: await hash(`d:${d}`) } : {}), ...(ip ? { client_ip: await hash(`i:${ip}`) } : {}) }
}

/** True when this phone, or this connection (three times as many), used the feature `daily` times in the last 24 hours. */
async function overDaily(env: AiEnv, feature: string, daily: number, c: ClientKeys): Promise<boolean> {
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const used = (col: string, v: string) => count(env, `ai_requests?select=id&feature=eq.${feature}&status=eq.feito&${col}=eq.${v}&created_at=gte.${since}`)
  if (c.client_device && await used('client_device', c.client_device) >= daily) return true
  if (c.client_ip && await used('client_ip', c.client_ip) >= daily * 3) return true
  return false
}

async function count(env: AiEnv, path: string): Promise<number> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return 0
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: 'HEAD', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: 'count=exact' },
  })
  return Number(res.headers.get('content-range')?.split('/')[1] ?? 0) || 0
}

/** Daily: forgets the client keys older than two days. */
export async function forgetClients(env: AiEnv): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return
  const before = new Date(Date.now() - 2 * 86_400_000).toISOString()
  await fetch(`${env.SUPABASE_URL}/rest/v1/ai_requests?created_at=lt.${before}&or=(client_device.not.is.null,client_ip.not.is.null)`, {
    method: 'PATCH',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ client_device: null, client_ip: null }),
  }).catch(() => {})
}

type Answer = { out: string; usage?: Usage }

async function askClaude(env: AiEnv, feature: Feature, prompt: string, image: string): Promise<Answer> {
  const content: unknown[] = []
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image)
  if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } })
  content.push({ type: 'text', text: prompt })
  const model = env.AI_MODEL || DEFAULT_MODEL
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    // Short, simple answers: thinking off keeps them fast and cheap, and keeps max_tokens for the answer
    // (newer models think by default, and thinking counts against max_tokens).
    body: JSON.stringify({ model, max_tokens: 1200, thinking: { type: 'disabled' }, system: feature.system, messages: [{ role: 'user', content }] }),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { content?: { type: string; text?: string }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } }
  const out = (data.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim()
  if (data.stop_reason === 'refusal' || !out) throw new Error(`anthropic empty answer (${data.stop_reason})`)
  return {
    out,
    usage: { model, input_tokens: data.usage?.input_tokens, output_tokens: data.usage?.output_tokens },
  }
}

/** Gemini image editing (generateContent with an image in and an image out). */
async function geminiImage(env: AiEnv, image: string, prompt: string): Promise<Answer> {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image)
  if (!m) throw new Error('image: not a photo')
  const model = env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  })
  if (!res.ok) throw new Error(`gemini ${res.status}`)
  type Part = { inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }
  const data = await res.json() as { candidates?: { content?: { parts?: Part[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
  const part = (data.candidates?.[0]?.content?.parts ?? []).find(p => p.inlineData?.data || p.inline_data?.data)
  const d = part?.inlineData?.data ?? part?.inline_data?.data
  const mime = part?.inlineData?.mimeType ?? part?.inline_data?.mime_type ?? 'image/png'
  if (!d) throw new Error('gemini: no image')
  // Priced per image made (the settings' "imagem" price); the tokens are kept for reference.
  return {
    out: `data:${mime};base64,${d}`,
    usage: { model, images: 1, input_tokens: data.usageMetadata?.promptTokenCount, output_tokens: data.usageMetadata?.candidatesTokenCount },
  }
}

async function editImage(env: AiEnv, feature: string, input: Input, prompt: string): Promise<Answer> {
  if (env.GEMINI_API_KEY) return geminiImage(env, str(input.image, 3_000_000), prompt)
  const res = await fetch(env.IMAGE_API_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(env.IMAGE_API_KEY ? { Authorization: `Bearer ${env.IMAGE_API_KEY}` } : {}) },
    body: JSON.stringify({ feature, image: str(input.image, 3_000_000), style: str(input.style, 80), prompt }),
  })
  if (!res.ok) throw new Error(`image ${res.status}`)
  const { image } = await res.json() as { image?: string }
  if (!image || !image.startsWith('data:image/')) throw new Error('image: empty')
  return { out: image, usage: { model: 'image-api', images: 1 } }
}
