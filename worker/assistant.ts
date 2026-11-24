/**
 * The owner's assistant: Claude with read-only tools over the salon's own data.
 *
 * Instead of a fixed summary, the model asks for what each question needs: the diary for any
 * days, a client's history, free times, totals for a period, clients who stopped coming.
 * Every query is filtered by the salon of the signed-in person (from their session, never from
 * the request), only reads, and never returns phone numbers or emails.
 *
 * Client names never reach the AI provider (pseudonymisation): names in the question are swapped
 * for [Nome N] before it is sent, names in the tools' answers for [Cliente N], and the Worker puts
 * the real names back in the final answer. Money (prices of bookings, totals) is only given when
 * the person asking is the owner.
 */
import type { AiEnv, Usage } from './ai'

type Row = Record<string, unknown>
interface Ctx { env: AiEnv; salonId: string; tz: string; money: boolean; alias: Aliases }

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const STOP = new Set(['que', 'quem', 'qual', 'quais', 'quando', 'onde', 'como', 'para', 'por', 'com', 'sem', 'tem', 'tenho', 'dia', 'dias', 'hoje', 'amanha', 'ontem', 'semana', 'mes', 'ano', 'hora', 'horas', 'cliente', 'clientes', 'marcacao', 'marcacoes', 'livre', 'livres', 'corte', 'barba', 'sabado', 'domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'feira', 'esta', 'este', 'essa', 'esse', 'muito', 'mais', 'menos', 'faltou', 'faltas', 'vem', 'veio', 'nao', 'sim', 'uma', 'umas', 'uns', 'dos', 'das', 'aos', 'pelo', 'pela'])

/** Real client names <-> codes, so the provider only ever sees codes. */
export class Aliases {
  private toCode = new Map<string, string>()
  private toName = new Map<string, string>()
  private n = 0
  /** Typed search terms, [Nome N] -> what the person wrote. */
  terms = new Map<string, string>()

  client(name: unknown): string {
    const real = String(name ?? '').trim() || 'cliente'
    const key = fold(real)
    let code = this.toCode.get(key)
    if (!code) { code = `[Cliente ${++this.n}]`; this.toCode.set(key, code); this.toName.set(code, real) }
    return code
  }

  /** Swaps every word of the question that is part of a client's name (and not a professional's) for [Nome N]. */
  question(q: string, clientNames: string[], proNames: string[]): string {
    const pro = new Set(proNames.flatMap(n => fold(n).split(/\s+/)))
    const known = new Set(clientNames.flatMap(n => fold(n).split(/[^a-z]+/)).filter(w => w.length >= 3 && !STOP.has(w) && !pro.has(w)))
    // Runs of matching words ("Francisco Sabino") become one term.
    return q.replace(/[\p{L}]+(?:\s+[\p{L}]+)*/gu, run => {
      const words = run.split(/\s+/)
      const out: string[] = []
      let term: string[] = []
      const flush = () => {
        if (!term.length) return
        const code = `[Nome ${this.terms.size + 1}]`
        this.terms.set(code, term.join(' '))
        out.push(code); term = []
      }
      for (const w of words) {
        if (known.has(fold(w))) term.push(w)
        else { flush(); out.push(w) }
      }
      flush()
      return out.join(' ')
    })
  }

  /** What a tool was asked to search for: a [Nome N] term, a [Cliente N] code, or plain text. */
  search(input: string): string {
    const m = /\[?\s*(Nome|Cliente)\s+(\d+)\s*\]?/i.exec(input)
    if (!m) return input
    const code = `[${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}]`
    return this.terms.get(code) ?? this.toName.get(code) ?? input
  }

  /** For free text (the salon's notes): known client names and search terms become codes, phone numbers are removed. */
  scrub(text: string): string {
    let out = text.replace(/\+?\d[\d\s-]{7,}\d/g, '[telefone]')
    for (const [key, code] of this.toCode) if (key.length >= 3) out = out.replace(new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), code)
    for (const [code, term] of this.terms) out = out.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), code)
    return out
  }

  /** Puts the real names back in the answer for the salon. */
  restore(text: string): string {
    return text.replace(/\[\s*(Nome|Cliente)\s+(\d+)\s*\]|\b(Nome|Cliente) (\d+)\b/gi, (all, k1?: string, n1?: string, k2?: string, n2?: string) => {
      const kind = (k1 ?? k2 ?? '').toLowerCase(), n = n1 ?? n2
      const code = `[${kind[0].toUpperCase()}${kind.slice(1)} ${n}]`
      return this.toName.get(code) ?? this.terms.get(code) ?? all
    })
  }
}

const MAX_ROUNDS = 6
const ACTIVE = ['pendente', 'confirmada', 'concluida']

// --- Dates in the salon's time zone -------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Minutes the zone is ahead of UTC at that instant. */
function offsetMin(at: Date, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(at).map(x => [x.type, x.value]))
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime() + at.getMilliseconds()) / 60000
}

/** The instant a local date and time ("2026-11-24", 540 = 09:00) happens in the zone. */
export function zoned(date: string, minutes: number, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, 0, minutes)
  const first = new Date(guess - offsetMin(new Date(guess), tz) * 60000)
  return new Date(guess - offsetMin(first, tz) * 60000)
}

export function localDate(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}
const localTime = (at: Date, tz: string) => new Intl.DateTimeFormat('pt-PT', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
const dayLabel = (date: string) => new Intl.DateTimeFormat('pt-PT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00Z`))
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const money = (c: Ctx, cents: number) => c.money ? `${(cents / 100).toFixed(2).replace('.', ',')} €` : ''
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')

// --- Reading the database -----------------------------------------------------------------------

async function get(c: Ctx, table: string, query: string): Promise<Row[]> {
  const key = c.env.SUPABASE_SERVICE_ROLE_KEY!
  const res = await fetch(`${c.env.SUPABASE_URL}/rest/v1/${table}?salon_id=eq.${c.salonId}&${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`db ${table} ${res.status} ${(await res.text()).slice(0, 160)}`)
  return await res.json() as Row[]
}

/** Supabase answers at most 1000 rows per request: read page by page, up to `max` rows. */
async function getAll(c: Ctx, table: string, query: string, max = 10000): Promise<Row[]> {
  const all: Row[] = []
  for (let offset = 0; offset < max; offset += 1000) {
    const page = await get(c, table, `${query}&limit=1000&offset=${offset}`)
    all.push(...page)
    if (page.length < 1000) break
  }
  return all
}

interface Lookup { services: Record<string, Row>; pros: Record<string, Row> }
async function lookup(c: Ctx): Promise<Lookup> {
  const [sv, pr] = await Promise.all([get(c, 'services', 'select=id,name,price_cents,duration_min,active'), get(c, 'professionals', 'select=id,name,active')])
  return { services: Object.fromEntries(sv.map(s => [s.id, s])), pros: Object.fromEntries(pr.map(p => [p.id, p])) }
}

const BOOKING_COLS = 'select=starts_at,ends_at,status,client_name,client_phone,service_id,professional_id,price_cents,home_fee_cents,location,source'
const price = (b: Row, l: Lookup) => (typeof b.price_cents === 'number' ? b.price_cents : Number(l.services[String(b.service_id)]?.price_cents ?? 0)) + Number(b.home_fee_cents ?? 0)

function bookingLine(b: Row, l: Lookup, c: Ctx, withDate = false): string {
  const s = new Date(String(b.starts_at)), e = new Date(String(b.ends_at))
  const when = `${withDate ? `${localDate(s, c.tz)} ` : ''}${localTime(s, c.tz)}–${localTime(e, c.tz)}`
  const who = ` · ${c.alias.client(b.client_name)}`
  const where = b.location === 'domicilio' ? ' · ao domicílio' : ''
  return `${when}${who} · ${l.services[String(b.service_id)]?.name ?? 'serviço'} com ${l.pros[String(b.professional_id)]?.name ?? '?'} · ${b.status}${c.money ? ` · ${money(c, price(b, l))}` : ''}${where}`
}

function range(input: Row, maxDays: number): { from: string; to: string } | string {
  const from = String(input.from_date ?? ''), to = String(input.to_date ?? input.from_date ?? '')
  if (!DATE.test(from) || !DATE.test(to)) return 'Datas em falta: use AAAA-MM-DD.'
  if (to < from) return 'A data final é anterior à inicial.'
  if (Date.parse(to) - Date.parse(from) > maxDays * 86400000) return `No máximo ${maxDays} dias de cada vez.`
  return { from, to }
}
const between = (c: Ctx, from: string, to: string) =>
  `starts_at=gte.${zoned(from, 0, c.tz).toISOString()}&starts_at=lt.${zoned(addDays(to, 1), 0, c.tz).toISOString()}`

// --- The tools ----------------------------------------------------------------------------------

async function agenda(c: Ctx, input: Row): Promise<string> {
  const r = range(input, 31)
  if (typeof r === 'string') return r
  const [l, rows] = await Promise.all([lookup(c), get(c, 'bookings', `${BOOKING_COLS}&${between(c, r.from, r.to)}&order=starts_at&limit=400`)])
  const pro = String(input.professional ?? '').toLowerCase()
  const list = rows.filter(b => !pro || String(l.pros[String(b.professional_id)]?.name ?? '').toLowerCase().includes(pro))
  if (!list.length) return `Sem marcações de ${r.from} a ${r.to}.`
  const out: string[] = []
  let day = ''
  for (const b of list) {
    const d = localDate(new Date(String(b.starts_at)), c.tz)
    if (d !== day) { day = d; out.push(`${d} (${dayLabel(d)}):`) }
    out.push(`  ${bookingLine(b, l, c)}`)
  }
  return out.join('\n')
}

async function findClient(c: Ctx, input: Row): Promise<string> {
  const name = c.alias.search(String(input.name ?? '')).trim().replace(/[%*,()."]/g, ' ').trim().slice(0, 60)
  if (name.length < 2) return 'Indique pelo menos 2 letras do nome.'
  const like = encodeURIComponent(`*${name}*`)
  const [l, rows, listed] = await Promise.all([
    lookup(c),
    get(c, 'bookings', `${BOOKING_COLS}&client_name=ilike.${like}&order=starts_at.desc&limit=200`),
    get(c, 'salon_clients', `select=name,phone_key,created_at&name=ilike.${like}&limit=20`),
  ])
  // One person per phone number (the number itself is never shown).
  const people = new Map<string, { name: string; since?: string; bookings: Row[] }>()
  for (const p of listed) people.set(String(p.phone_key), { name: String(p.name), since: String(p.created_at).slice(0, 10), bookings: [] })
  for (const b of rows) {
    const key = digits(b.client_phone).slice(-9) || String(b.client_name)
    const match = [...people.keys()].find(k => k.endsWith(key) || key.endsWith(k))
    const p = people.get(match ?? key) ?? { name: String(b.client_name), bookings: [] }
    p.bookings.push(b)
    people.set(match ?? key, p)
  }
  if (!people.size) return `Nenhum cliente com ${String(input.name ?? '')} no nome.`
  const notes = await get(c, 'client_notes', `select=phone_key,notes,birthday_day,birthday_month&phone_key=in.(${[...people.keys()].filter(k => /^\d+$/.test(k)).join(',') || '0'})`).catch(() => [])
  const now = Date.now()
  const out: string[] = []
  for (const [key, p] of [...people.entries()].slice(0, 8)) {
    const done = p.bookings.filter(b => b.status === 'concluida')
    const next = p.bookings.filter(b => Date.parse(String(b.starts_at)) >= now && b.status !== 'cancelada' && b.status !== 'faltou')
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
    const past = p.bookings.filter(b => Date.parse(String(b.starts_at)) < now).slice(0, 6)
    const n = notes.find(x => x.phone_key === key)
    const spent = c.money ? `, total gasto ${money(c, done.reduce((s, b) => s + price(b, l), 0))}` : ''
    out.push(`${c.alias.client(p.name)}${p.since ? ` (na lista desde ${p.since})` : ''}: ${done.length} visitas concluídas, ${p.bookings.filter(b => b.status === 'faltou').length} faltas, ${p.bookings.filter(b => b.status === 'cancelada').length} cancelamentos${spent}.`)
    out.push(next.length ? `  Próximas: ${next.map(b => bookingLine(b, l, c, true)).join(' | ')}` : '  Sem marcações futuras.')
    if (past.length) out.push(`  Últimas: ${past.map(b => bookingLine(b, l, c, true)).join(' | ')}`)
    if (n?.notes) out.push(`  Notas do salão: ${c.alias.scrub(String(n.notes).slice(0, 300))}`)
    if (n?.birthday_day) out.push(`  Aniversário: ${n.birthday_day}/${n.birthday_month}`)
  }
  return out.join('\n')
}

async function freeSlots(c: Ctx, input: Row): Promise<string> {
  const date = String(input.date ?? '')
  if (!DATE.test(date)) return 'Data em falta: use AAAA-MM-DD.'
  const wd = weekday(date), dayStart = zoned(date, 0, c.tz), dayEnd = zoned(addDays(date, 1), 0, c.tz)
  const [l, salonHours, proHours, rows, off] = await Promise.all([
    lookup(c),
    get(c, 'opening_hours', 'select=weekday,opens,closes'),
    get(c, 'professional_hours', 'select=professional_id,weekday,opens,closes').catch(() => []),
    get(c, 'bookings', `select=starts_at,ends_at,status,professional_id&${between(c, date, date)}&status=in.(${ACTIVE.join(',')})`),
    get(c, 'time_off', `select=professional_id,starts_at,ends_at&starts_at=lt.${dayEnd.toISOString()}&ends_at=gt.${dayStart.toISOString()}`).catch(() => []),
  ])
  const minOf = (iso: unknown) => Math.round((Date.parse(String(iso)) - dayStart.getTime()) / 60000)
  const nowMin = localDate(new Date(), c.tz) === date ? minOf(new Date().toISOString()) : -1
  const pro = String(input.professional ?? '').toLowerCase()
  const out: string[] = []
  for (const p of Object.values(l.pros).filter(p => p.active !== false && (!pro || String(p.name).toLowerCase().includes(pro)))) {
    const own = proHours.filter(h => h.professional_id === p.id)
    const open = (own.length ? own : salonHours).filter(h => Number(h.weekday) === wd).map(h => [toMin(String(h.opens)), toMin(String(h.closes))])
    if (!open.length) { out.push(`${p.name}: não trabalha neste dia.`); continue }
    const busy = [
      ...rows.filter(b => b.professional_id === p.id),
      ...off.filter(t => t.professional_id == null || t.professional_id === p.id),
    ].map(b => [minOf(b.starts_at), minOf(b.ends_at)]).sort((a, b) => a[0] - b[0])
    const free: string[] = []
    for (const [o, cl] of open) {
      let t = Math.max(o, nowMin)
      for (const [s, e] of busy) {
        if (e <= t || s >= cl) continue
        if (s - t >= 15) free.push(`${hhmm(t)}–${hhmm(s)}`)
        t = Math.max(t, e)
      }
      if (cl - t >= 15) free.push(`${hhmm(t)}–${hhmm(cl)}`)
    }
    out.push(`${p.name}: ${free.length ? free.join(', ') : 'sem horas livres'}`)
  }
  return `${date} (${dayLabel(date)}), horas livres:\n${out.join('\n') || 'Nenhum profissional ativo.'}`
}

async function stats(c: Ctx, input: Row): Promise<string> {
  const r = range(input, 400)
  if (typeof r === 'string') return r
  const [l, rows] = await Promise.all([lookup(c), getAll(c, 'bookings', `${BOOKING_COLS}&${between(c, r.from, r.to)}&order=starts_at`)])
  const by = (s: string) => rows.filter(b => b.status === s)
  const done = by('concluida'), coming = rows.filter(b => b.status === 'pendente' || b.status === 'confirmada')
  const sum = (list: Row[]) => money(c, list.reduce((s, b) => s + price(b, l), 0))
  const top = (key: 'service_id' | 'professional_id', names: Record<string, Row>) => {
    const m = new Map<string, number>()
    for (const b of done) m.set(String(b[key]), (m.get(String(b[key])) ?? 0) + price(b, l))
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, v]) => `${names[id]?.name ?? '?'} ${money(c, v)}`).join(', ') || 'nenhum'
  }
  const sources = new Map<string, number>()
  for (const b of rows) sources.set(String(b.source ?? 'online'), (sources.get(String(b.source ?? 'online')) ?? 0) + 1)
  // New clients: phone numbers whose first ever booking falls in the period.
  const phones = [...new Set(rows.map(b => digits(b.client_phone)).filter(Boolean))]
  let fresh = 0
  if (phones.length && phones.length <= 300) {
    const before = await getAll(c, 'bookings', `select=client_phone&starts_at=lt.${zoned(r.from, 0, c.tz).toISOString()}&order=starts_at.desc`, 20000)
    const seen = new Set(before.map(b => digits(b.client_phone)))
    fresh = phones.filter(p => !seen.has(p)).length
  }
  const count = (key: 'service_id' | 'professional_id', names: Record<string, Row>) => {
    const m = new Map<string, number>()
    for (const b of done) m.set(String(b[key]), (m.get(String(b[key])) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, v]) => `${names[id]?.name ?? '?'} ${v}`).join(', ') || 'nenhum'
  }
  const ok = c.money
  return [
    `De ${r.from} a ${r.to}: ${rows.length} marcações.`,
    ok ? `Concluídas ${done.length} (${sum(done)}), por fazer ${coming.length} (${sum(coming)}), faltas ${by('faltou').length} (${sum(by('faltou'))} perdidos), canceladas ${by('cancelada').length}.`
      : `Concluídas ${done.length}, por fazer ${coming.length}, faltas ${by('faltou').length}, canceladas ${by('cancelada').length}.`,
    `Clientes diferentes ${phones.length}, dos quais novos ${fresh}.`,
    ok ? `Faturado por serviço: ${top('service_id', l.services)}.` : `Visitas por serviço: ${count('service_id', l.services)}.`,
    ok ? `Faturado por profissional: ${top('professional_id', l.pros)}.` : `Visitas por profissional: ${count('professional_id', l.pros)}.`,
    `Origem das marcações: ${[...sources.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}.`,
    ...(ok ? [] : ['Os valores em euros só são mostrados ao dono do salão.']),
  ].join('\n')
}

async function lapsedClients(c: Ctx, input: Row): Promise<string> {
  const days = Math.min(365, Math.max(14, Number(input.days) || 45))
  const since = new Date(Date.now() - 400 * 86400000).toISOString()
  const [l, rows] = await Promise.all([lookup(c), getAll(c, 'bookings', `${BOOKING_COLS}&starts_at=gte.${since}&status=in.(${ACTIVE.join(',')})&order=starts_at.desc`, 15000)])
  const now = Date.now(), cut = now - days * 86400000
  const people = new Map<string, { name: string; last: number; visits: number; future: boolean; service: string }>()
  for (const b of rows) {
    const key = digits(b.client_phone) || String(b.client_name)
    const t = Date.parse(String(b.starts_at))
    const p = people.get(key) ?? { name: String(b.client_name), last: 0, visits: 0, future: false, service: '' }
    if (t >= now) p.future = true
    else if (b.status === 'concluida' || b.status === 'confirmada') { p.visits++; if (t > p.last) { p.last = t; p.service = String(l.services[String(b.service_id)]?.name ?? '') } }
    people.set(key, p)
  }
  const gone = [...people.values()].filter(p => p.visits > 0 && !p.future && p.last < cut).sort((a, b) => b.visits - a.visits)
  if (!gone.length) return `Nenhum cliente sem vir há mais de ${days} dias.`
  return `${gone.length} clientes não vêm há mais de ${days} dias e não têm marcação:\n` + gone.slice(0, 25).map(p =>
    `${c.alias.client(p.name)}: ${p.visits} visitas, última ${localDate(new Date(p.last), c.tz)} (${p.service})`).join('\n')
}

interface Tool { name: string; description: string; input_schema: Row; run: (c: Ctx, input: Row) => Promise<string> }

const TOOLS: Tool[] = [
  {
    name: 'agenda', run: agenda,
    description: 'Lista as marcações de um período (até 31 dias): hora, cliente, serviço, profissional, estado e valor. Use para perguntas sobre um dia, uma semana ou um profissional.',
    input_schema: { type: 'object', properties: { from_date: { type: 'string', description: 'AAAA-MM-DD' }, to_date: { type: 'string', description: 'AAAA-MM-DD, inclusive' }, professional: { type: 'string', description: 'Opcional: parte do nome do profissional' } }, required: ['from_date', 'to_date'] },
  },
  {
    name: 'find_client', run: findClient,
    description: 'Procura um cliente pelo código [Nome N] da pergunta (ou um código [Cliente N]) e devolve as próximas marcações, as últimas visitas, faltas, total gasto, notas e aniversário. Use quando perguntarem por um cliente.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'O código, por exemplo [Nome 1]' } }, required: ['name'] },
  },
  {
    name: 'free_slots', run: freeSlots,
    description: 'Horas livres de cada profissional num dia, a partir do horário, das marcações e das ausências.',
    input_schema: { type: 'object', properties: { date: { type: 'string', description: 'AAAA-MM-DD' }, professional: { type: 'string', description: 'Opcional: parte do nome do profissional' } }, required: ['date'] },
  },
  {
    name: 'stats', run: stats,
    description: 'Totais de um período (até 400 dias): marcações, faturado, faltas, cancelamentos, clientes novos, por serviço e por profissional.',
    input_schema: { type: 'object', properties: { from_date: { type: 'string', description: 'AAAA-MM-DD' }, to_date: { type: 'string', description: 'AAAA-MM-DD, inclusive' } }, required: ['from_date', 'to_date'] },
  },
  {
    name: 'lapsed_clients', run: lapsedClients,
    description: 'Clientes que já vieram mas não voltam há mais de N dias e não têm marcação. Bom para saber a quem mandar mensagem.',
    input_schema: { type: 'object', properties: { days: { type: 'integer', description: 'Dias sem vir (14 a 365, normalmente 45)' } }, required: ['days'] },
  },
]

// --- The conversation with the model -----------------------------------------------------------

type Block = { type: string; text?: string; id?: string; name?: string; input?: Row }

export async function ownerAssistant(env: AiEnv, opts: { salonId: string; system: string; question: string; context: string; model: string; money: boolean }): Promise<{ out: string; usage: Usage }> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY!
  const salon = await fetch(`${env.SUPABASE_URL}/rest/v1/salons?id=eq.${opts.salonId}&select=timezone`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    .then(r => r.ok ? r.json() as Promise<Row[]> : []).catch(() => [] as Row[])
  const tz = String(salon[0]?.timezone ?? 'Europe/Lisbon')
  const c: Ctx = { env, salonId: opts.salonId, tz, money: opts.money, alias: new Aliases() }
  const tools = TOOLS
  // Client names the question might mention, to swap them for codes before anything is sent.
  const [listed, recent, pros] = await Promise.all([
    getAll(c, 'salon_clients', 'select=name', 10000).catch(() => []),
    getAll(c, 'bookings', `select=client_name&starts_at=gte.${new Date(Date.now() - 400 * 86400000).toISOString()}`, 10000).catch(() => []),
    get(c, 'professionals', 'select=name').catch(() => []),
  ])
  const question = c.alias.question(opts.question, [...listed.map(r => String(r.name)), ...recent.map(r => String(r.client_name))], pros.map(p => String(p.name)))
  const today = localDate(new Date(), tz)
  const system = `${opts.system}\nHoje é ${today} (${dayLabel(today)}), ${localTime(new Date(), tz)} na hora do salão. Usa as ferramentas sempre que a pergunta precisar de dados que não estão no resumo; podes usar várias. Os clientes aparecem só como códigos, [Nome N] na pergunta e [Cliente N] nos dados: para procurar um cliente passa o código a find_client, e escreve os códigos tal e qual na resposta, sem inventar nomes.${opts.money ? '' : ' Quem pergunta não é o dono: não tens valores em euros e não fales de faturação; se perguntarem, diz que só o dono vê esses valores.'} As ferramentas só leem, não marcam nem cancelam: se pedirem para mudar algo, explica onde se faz na aplicação.`
  const messages: { role: 'user' | 'assistant'; content: unknown }[] = [
    { role: 'user', content: `${opts.context ? `Resumo da agenda:\n${opts.context}\n\n` : ''}Pergunta: ${question}` },
  ]
  const usage: Usage = { model: opts.model, input_tokens: 0, output_tokens: 0 }
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: opts.model, max_tokens: 1200, thinking: { type: 'disabled' }, system,
        tools: tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })),
        // Last round: no more tools, so it has to answer with what it has.
        ...(round === MAX_ROUNDS - 1 ? { tool_choice: { type: 'none' } } : {}),
        messages,
      }),
    })
    if (!res.ok) throw new Error(`anthropic ${res.status} ${(await res.text()).slice(0, 200)}`)
    const data = await res.json() as { content?: Block[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } }
    usage.input_tokens! += data.usage?.input_tokens ?? 0
    usage.output_tokens! += data.usage?.output_tokens ?? 0
    const content = data.content ?? []
    const calls = content.filter(b => b.type === 'tool_use')
    if (data.stop_reason !== 'tool_use' || !calls.length) {
      const out = content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
      if (data.stop_reason === 'refusal' || !out) throw new Error(`anthropic empty answer (${data.stop_reason})`)
      return { out: c.alias.restore(out), usage }
    }
    messages.push({ role: 'assistant', content })
    const results = await Promise.all(calls.map(async b => {
      const tool = tools.find(t => t.name === b.name)
      try {
        const text = tool ? await tool.run(c, b.input ?? {}) : 'Ferramenta desconhecida.'
        return { type: 'tool_result', tool_use_id: b.id, content: text.slice(0, 30000) }
      } catch (e) {
        console.error('assistant tool', b.name, e instanceof Error ? e.message : e)
        return { type: 'tool_result', tool_use_id: b.id, content: 'Não foi possível ler estes dados agora.', is_error: true }
      }
    }))
    messages.push({ role: 'user', content: results })
  }
  throw new Error('assistant: too many rounds')
}
