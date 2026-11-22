/**
 * Promotions tied to the agenda (migration 0020): the rules a booking must meet,
 * the dates worth a post in Portugal, ready phrases per type of salon, and the
 * caption. The database applies the same rules (promo_applies, promo_price).
 */

export interface Promo {
  id: string; salon_id: string; code: string; title: string; message: string
  kind: 'percentagem' | 'montante' | 'oferta'
  percent: number | null; amount_cents: number | null; gift: string | null
  service_ids: string[] | null; weekdays: number[] | null
  time_from: string | null; time_to: string | null
  starts_on: string; ends_on: string | null; active: boolean; image_path: string | null; created_at: string
}

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const parts = (d: Date, tz: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(d).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) }
}

/** Same rules as promo_applies in the database. */
export function applies(p: Promo, serviceId: string, start: Date, tz: string): boolean {
  if (!p.active) return false
  if (p.service_ids && !p.service_ids.includes(serviceId)) return false
  const { date, time, dow } = parts(start, tz)
  if (date < p.starts_on || (p.ends_on && date > p.ends_on)) return false
  if (p.weekdays && !p.weekdays.includes(dow)) return false
  if (p.time_from && p.time_to && (time < p.time_from.slice(0, 5) || time >= p.time_to.slice(0, 5))) return false
  return true
}

/** Same as promo_price in the database. */
export function promoPrice(p: Pick<Promo, 'kind' | 'percent' | 'amount_cents'>, price: number): number {
  if (p.kind === 'percentagem') return Math.round(price * (100 - (p.percent ?? 0)) / 100)
  if (p.kind === 'montante') return Math.max(0, price - (p.amount_cents ?? 0))
  return price
}

/** "-20%", "-5 €", "Barba grátis". */
export function offerText(p: Pick<Promo, 'kind' | 'percent' | 'amount_cents' | 'gift'>): string {
  if (p.kind === 'percentagem') return `-${p.percent}%`
  if (p.kind === 'montante') return `-${((p.amount_cents ?? 0) / 100).toFixed(2).replace('.', ',').replace(',00', '')} €`
  return p.gift ?? 'Oferta'
}

/** "Terças e quintas, 14h–17h, até 30 de novembro". */
export function whenText(p: Pick<Promo, 'weekdays' | 'time_from' | 'time_to' | 'starts_on' | 'ends_on'>, today: string): string {
  const names = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados']
  const out: string[] = []
  if (p.weekdays && p.weekdays.length && p.weekdays.length < 7) {
    const ds = [...p.weekdays].sort().map(d => names[d])
    out.push(ds.length === 1 ? ds[0] : `${ds.slice(0, -1).join(', ')} e ${ds[ds.length - 1]}`)
  }
  if (p.time_from && p.time_to) out.push(`${hm(p.time_from)}–${hm(p.time_to)}`)
  const fmt = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  if (p.starts_on > today) out.push(`a partir de ${fmt(p.starts_on)}`)
  if (p.ends_on) out.push(`até ${fmt(p.ends_on)}`)
  const s = out.join(', ')
  return s ? s[0].toUpperCase() + s.slice(1) : 'Todos os dias'
}
const hm = (t: string) => { const [h, m] = t.split(':'); return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}` }

/** A short code for the link, from the title: "Tardes -20%" -> "tardes-20". */
export function codeFrom(title: string): string {
  const c = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
  return c.length >= 3 ? c : `promo-${Math.random().toString(36).slice(2, 6)}`
}

export const promoLink = (origin: string, slug: string, code: string) => `${origin}/s/${slug}?promo=${encodeURIComponent(code)}`

// ---------------------------------------------------------------------------
// Dates worth a post in Portugal
// ---------------------------------------------------------------------------

export interface Occasion { date: string; name: string; idea: string; holiday?: boolean }

/** Easter Sunday (Gregorian), YYYY-MM-DD. */
export function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
const shift = (date: string, days: number) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
/** The n-th given weekday (0 = Sunday) of a month. */
const nth = (y: number, month: number, dow: number, n: number) => {
  const first = new Date(Date.UTC(y, month - 1, 1, 12)).getUTCDay()
  return `${y}-${String(month).padStart(2, '0')}-${String(1 + ((dow - first + 7) % 7) + (n - 1) * 7).padStart(2, '0')}`
}

const IDEAS: Record<string, Record<string, string>> = {
  namorados: { barbearia: 'Corte + barba para o jantar a dois', cabeleireiro: 'Brushing ou penteado para a noite', unhas: 'Unhas vermelhas ou nail art de corações', depilacao: 'Pack para o fim de semana a dois' },
  pai: { barbearia: 'Pai e filho: dois cortes com desconto', cabeleireiro: 'Vale-presente para o pai', unhas: 'Vale-presente para oferecer', depilacao: 'Vale-presente para oferecer' },
  mae: { barbearia: 'Vale-presente para a mãe', cabeleireiro: 'Mãe e filha: tratamento + brushing', unhas: 'Mãe e filha: manicure a dois', depilacao: 'Vale-presente de beleza para a mãe' },
  santos: { barbearia: 'Pronto para os arraiais: corte fresco', cabeleireiro: 'Penteados para os Santos Populares', unhas: 'Nail art de sardinhas e manjericos', depilacao: 'Pernas prontas para o verão e os arraiais' },
  verao: { barbearia: 'Cortes curtos para o calor', cabeleireiro: 'Tratamento de proteção solar para o cabelo', unhas: 'Pedicure para as sandálias', depilacao: 'Pack de verão: pernas, axilas e virilhas' },
  aulas: { barbearia: 'Regresso às aulas: cortes para crianças', cabeleireiro: 'Cortes para o regresso às aulas', unhas: 'Unhas discretas para o regresso ao trabalho', depilacao: 'Retomar a rotina depois das férias' },
  halloween: { barbearia: 'Desenho de Halloween no degradé', cabeleireiro: 'Cores temporárias para o Halloween', unhas: 'Nail art de Halloween', depilacao: 'Sobrancelhas perfeitas para a fantasia' },
  black: { barbearia: 'Black Friday: cartões de 5 cortes', cabeleireiro: 'Black Friday nos tratamentos', unhas: 'Black Friday: packs de manicure', depilacao: 'Black Friday: packs de sessões' },
  natal: { barbearia: 'Vales de Natal e marcações para as festas', cabeleireiro: 'Penteados para o Natal e a passagem de ano', unhas: 'Unhas brilhantes para as festas', depilacao: 'Vales de Natal' },
  ano: { barbearia: 'Último corte do ano: marque já', cabeleireiro: 'Brushing e penteados para a passagem de ano', unhas: 'Unhas douradas para a passagem de ano', depilacao: 'Começar o ano a brilhar' },
  casamentos: { barbearia: 'Noivos e padrinhos: pack para o grande dia', cabeleireiro: 'Penteados de noiva e convidadas', unhas: 'Manicure de noiva', depilacao: 'Pack de noiva' },
  feriado: { barbearia: 'Aberto no feriado? Diga-o num post', cabeleireiro: 'Aberto no feriado? Diga-o num post', unhas: 'Aberto no feriado? Diga-o num post', depilacao: 'Aberto no feriado? Diga-o num post' },
}

/** Dates in one year, with an idea for the salon's type. */
export function occasions(year: number, type: string): Occasion[] {
  const e = easter(year)
  const idea = (k: string) => IDEAS[k][type] ?? IDEAS[k].barbearia
  const y = (md: string) => `${year}-${md}`
  const holiday = (date: string, name: string): Occasion => ({ date, name, idea: idea('feriado'), holiday: true })
  const fridayAfterThanksgiving = shift(nth(year, 11, 4, 4), 1)
  return [
    holiday(y('01-01'), 'Ano Novo'),
    { date: y('02-14'), name: 'Dia dos Namorados', idea: idea('namorados') },
    holiday(shift(e, -47), 'Carnaval'),
    { date: y('03-19'), name: 'Dia do Pai', idea: idea('pai') },
    holiday(shift(e, -2), 'Sexta-feira Santa'),
    holiday(e, 'Páscoa'),
    holiday(y('04-25'), '25 de Abril'),
    holiday(y('05-01'), 'Dia do Trabalhador'),
    { date: nth(year, 5, 0, 1), name: 'Dia da Mãe', idea: idea('mae') },
    { date: y('05-15'), name: 'Época de casamentos', idea: idea('casamentos') },
    holiday(shift(e, 60), 'Corpo de Deus'),
    holiday(y('06-10'), 'Dia de Portugal'),
    { date: y('06-12'), name: 'Santos Populares', idea: idea('santos') },
    { date: y('06-21'), name: 'Início do verão', idea: idea('verao') },
    holiday(y('08-15'), 'Assunção de Nossa Senhora'),
    { date: y('09-07'), name: 'Regresso às aulas', idea: idea('aulas') },
    holiday(y('10-05'), 'Implantação da República'),
    { date: y('10-31'), name: 'Halloween', idea: idea('halloween') },
    holiday(y('11-01'), 'Todos os Santos'),
    { date: fridayAfterThanksgiving, name: 'Black Friday', idea: idea('black') },
    holiday(y('12-01'), 'Restauração da Independência'),
    { date: y('12-05'), name: 'Época de Natal', idea: idea('natal') },
    holiday(y('12-08'), 'Imaculada Conceição'),
    holiday(y('12-25'), 'Natal'),
    { date: y('12-29'), name: 'Passagem de ano', idea: idea('ano') },
  ].sort((a, b) => a.date.localeCompare(b.date))
}

/** The next dates within `days`, starting today; a post goes out a week or two before. */
export function upcoming(today: string, type: string, days = 60): Occasion[] {
  const y = Number(today.slice(0, 4))
  const until = shift(today, days)
  return [...occasions(y, type), ...occasions(y + 1, type)].filter(o => o.date >= today && o.date <= until)
}

// ---------------------------------------------------------------------------
// Ready phrases
// ---------------------------------------------------------------------------

export interface Phrase { title: string; text: string }

/** Ready captions; {oferta}, {quando}, {salao} and {link} are filled in. */
const PHRASES: Record<string, Phrase[]> = {
  todos: [
    { title: 'Horas mais calmas', text: '{oferta} nas horas mais calmas: {quando}. Venha sem pressa e sem espera. Marque em {link}' },
    { title: 'Última hora', text: 'Ainda temos vagas esta semana! {oferta} · {quando}. Marque em segundos: {link}' },
    { title: 'Traga um amigo', text: 'Venha com um amigo e ganhem os dois: {oferta}. {quando}. Marquem em {link}' },
    { title: 'Primeira visita', text: 'Ainda não nos conhece? Na primeira visita: {oferta}. {quando}. Marque em {link}' },
    { title: 'Regresso', text: 'Há algum tempo que não o vemos! Para voltar: {oferta}. {quando}. Marque em {link}' },
  ],
  barbearia: [
    { title: 'Degradé fresco', text: 'Degradé fresco para a semana. {oferta} · {quando}. A cadeira está à sua espera: {link}' },
    { title: 'Corte + barba', text: 'Corte e barba no {salao}: {oferta}. {quando}. Marque em {link}' },
  ],
  cabeleireiro: [
    { title: 'Mudança de visual', text: 'Está na altura de mudar? {oferta} · {quando}. Marque a sua mudança em {link}' },
    { title: 'Tratamento', text: 'O seu cabelo merece uma pausa. {oferta} nos tratamentos · {quando}. {link}' },
  ],
  unhas: [
    { title: 'Nail art da estação', text: 'Novas cores e nail art da estação! {oferta} · {quando}. Escolha a sua hora: {link}' },
    { title: 'Manicure + pedicure', text: 'Mãos e pés prontos: {oferta} · {quando}. Marque em {link}' },
  ],
  depilacao: [
    { title: 'Pack de sessões', text: 'Pele lisa sem complicações. {oferta} · {quando}. Marque já: {link}' },
    { title: 'Antes das férias', text: 'Pronta para a praia? {oferta} · {quando}. Marque em {link}' },
  ],
}

export const phrasesFor = (type: string): Phrase[] => [...(PHRASES[type] ?? []), ...PHRASES.todos]

export function fillPhrase(text: string, v: { oferta: string; quando: string; salao: string; link: string }): string {
  return text.replace(/\{(oferta|quando|salao|link)\}/g, (_, k: keyof typeof v) => v[k])
}

/** Hashtags for the caption, by type of salon and town. */
export function hashtags(type: string, town?: string | null): string {
  const base: Record<string, string[]> = {
    barbearia: ['barbearia', 'barbeiro', 'degrade', 'barba'], cabeleireiro: ['cabeleireiro', 'cabelo', 'madeixas', 'penteado'],
    unhas: ['unhas', 'nailart', 'manicure', 'gelinho'], depilacao: ['depilacao', 'estetica', 'beleza', 'pelelisa'],
  }
  const t = town?.split(',').pop()?.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return [...(base[type] ?? base.barbearia), ...(t ? [t, `${(base[type] ?? base.barbearia)[0]}${t}`] : []), 'portugal'].map(h => `#${h}`).join(' ')
}
