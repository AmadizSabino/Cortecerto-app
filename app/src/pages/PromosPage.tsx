import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon, { WhatsAppIcon } from '../components/Icon'
import { euros, supabase, type Salon, type Service } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import { parseEuros } from '../lib/onboarding'
import { mediaUrl, uploadMedia } from '../lib/brand'
import { runAi } from '../lib/ai'
import { codeFrom, fillPhrase, hashtags, offerText, phrasesFor, promoLink, upcoming, WEEKDAYS, whenText, type Occasion, type Promo } from '../lib/promos'
import { promoImage, sharePost } from '../lib/promoImage'
import { dateInTz } from '../lib/time'
import { themeById, themeStyle } from '../lib/themes'
import { formatPhone, waLink, waNumber } from '../lib/whatsapp'

interface Form {
  id?: string; title: string; kind: Promo['kind']; value: string; gift: string
  services: string[]; weekdays: number[]; from: string; to: string; starts: string; ends: string
  message: string; image: string | null; active: boolean
}
const blank = (today: string): Form => ({ title: '', kind: 'percentagem', value: '20', gift: '', services: [], weekdays: [], from: '', to: '', starts: today, ends: '', message: '', image: null, active: true })
const toForm = (p: Promo): Form => ({
  id: p.id, title: p.title, kind: p.kind, gift: p.gift ?? '', services: p.service_ids ?? [], weekdays: p.weekdays ?? [],
  value: p.kind === 'percentagem' ? String(p.percent ?? '') : p.kind === 'montante' ? ((p.amount_cents ?? 0) / 100).toFixed(2).replace('.', ',') : '',
  from: p.time_from?.slice(0, 5) ?? '', to: p.time_to?.slice(0, 5) ?? '', starts: p.starts_on, ends: p.ends_on ?? '',
  message: p.message, image: p.image_path, active: p.active,
})

interface Result { bookings: number; revenue: number }
interface Consented { key: string; name: string; phone: string }

/**
 * Mais > Promoções (migration 0020): promotions with their own booking link, a post
 * picture in the salon's colours, ready phrases, the dates coming up, and what each
 * promotion brought in.
 */
export default function PromosPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [promos, setPromos] = useState<Promo[]>([])
  const [results, setResults] = useState<Record<string, Result>>({})
  const [services, setServices] = useState<Service[]>([])
  const [photos, setPhotos] = useState<string[]>([])
  const [consented, setConsented] = useState<Consented[]>([])
  const [missing, setMissing] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [sharing, setSharing] = useState<string | null>(null) // promo id with the "send to clients" list open
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => { setRole(r.role); setSalon(r.salon) })
  }, [session])

  const load = useCallback(async () => {
    if (!salon) return
    const [pr, sv, ph, bk] = await Promise.all([
      supabase.from('promotions').select('*').eq('salon_id', salon.id).order('created_at', { ascending: false }),
      supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', salon.id).eq('active', true).order('name'),
      supabase.from('salon_photos').select('path').eq('salon_id', salon.id).order('position').limit(12),
      supabase.from('bookings').select('promotion_id,status,price_cents,client_name,client_phone,consent_messages,created_at').eq('salon_id', salon.id).order('created_at', { ascending: false }).limit(5000),
    ])
    setMissing(Boolean(pr.error))
    setPromos((pr.data ?? []) as Promo[])
    setServices(sv.data ?? [])
    setPhotos((ph.data ?? []).map(p => p.path))
    const res: Record<string, Result> = {}
    const latest = new Map<string, Consented & { consent: boolean }>()
    for (const b of (bk.data ?? []) as { promotion_id?: string | null; status: string; price_cents: number | null; client_name: string; client_phone: string; consent_messages: boolean }[]) {
      if (b.promotion_id && b.status !== 'cancelada') {
        const r = (res[b.promotion_id] ??= { bookings: 0, revenue: 0 })
        r.bookings++; if (b.status !== 'faltou') r.revenue += b.price_cents ?? 0
      }
      const key = waNumber(b.client_phone)
      if (key.length >= 11 && !latest.has(key)) latest.set(key, { key, name: b.client_name, phone: b.client_phone, consent: b.consent_messages })
    }
    setResults(res)
    // Marketing messages only to clients who agreed in their latest booking (RGPD).
    setConsented([...latest.values()].filter(c => c.consent && c.name !== 'Cliente apagado'))
  }, [salon])
  useEffect(() => { load() }, [load])

  const tz = salon?.timezone ?? 'Europe/Lisbon'
  const today = dateInTz(new Date(), tz)
  const dates = useMemo(() => salon ? upcoming(today, salon.type, 75) : [], [salon, today])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (!can(role, 'promocoes')) return <Navigate to="/painel" replace />

  const theme = themeById(salon.theme)
  const asPromo = (f: Form): Pick<Promo, 'kind' | 'percent' | 'amount_cents' | 'gift' | 'weekdays' | 'time_from' | 'time_to' | 'starts_on' | 'ends_on'> => ({
    kind: f.kind, percent: f.kind === 'percentagem' ? Number(f.value) : null,
    amount_cents: f.kind === 'montante' ? parseEuros(f.value) : null, gift: f.kind === 'oferta' ? f.gift.trim() : null,
    weekdays: f.weekdays.length ? f.weekdays : null, time_from: f.from || null, time_to: f.to || null, starts_on: f.starts, ends_on: f.ends || null,
  })
  const caption = (p: Pick<Promo, 'message' | 'code'>) => `${p.message}${p.message.includes(promoLink(location.origin, salon.slug, p.code)) ? '' : `\n${promoLink(location.origin, salon.slug, p.code)}`}\n\n${hashtags(salon.type, salon.address)}`

  function fromOccasion(o: Occasion) {
    setForm({ ...blank(today), title: o.name === 'Black Friday' ? 'Black Friday' : `${o.name}: ${o.idea}`.slice(0, 80), ends: o.date, message: '' })
    setError(''); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const f = form!
    if (!f.title.trim()) { setError('Dê um título à promoção.'); return }
    const p = asPromo(f)
    if (f.kind === 'percentagem' && !(p.percent! >= 1 && p.percent! <= 90)) { setError('A percentagem vai de 1 a 90.'); return }
    if (f.kind === 'montante' && !(p.amount_cents! > 0)) { setError('Indique o desconto em euros.'); return }
    if (f.kind === 'oferta' && !p.gift) { setError('Diga o que oferece (ex.: barba grátis).'); return }
    if ((f.from && !f.to) || (!f.from && f.to) || (f.from && f.to <= f.from)) { setError('Indique a hora de início e de fim, ou nenhuma.'); return }
    if (f.ends && f.ends < f.starts) { setError('A data de fim é antes do início.'); return }
    const code = f.id ? promos.find(x => x.id === f.id)!.code : uniqueCode(codeFrom(f.title))
    const link = promoLink(location.origin, salon!.slug, code)
    const message = f.message.trim() || fillPhrase(phrasesFor(salon!.type)[0].text, { oferta: offerText(p), quando: whenText(p, today), salao: salon!.name, link })
    const row = { salon_id: salon!.id, code, title: f.title.trim(), message, service_ids: f.services.length ? f.services : null, active: f.active, image_path: f.image, ...p }
    setBusy('guardar')
    const { error } = f.id ? await supabase.from('promotions').update(row).eq('id', f.id) : await supabase.from('promotions').insert(row)
    setBusy('')
    if (error) { setError(error.message.includes('promotions_salon_id_code_key') ? 'Já existe uma promoção com esse título.' : 'Não foi possível guardar.'); return }
    setForm(null); load()
  }
  const uniqueCode = (c: string) => { let k = c, n = 2; while (promos.some(p => p.code === k)) k = `${c}-${n++}`; return k }

  async function aiCaption() {
    const f = form!, p = asPromo(f)
    setBusy('ia')
    const r = await runAi('promo-caption', { salon: salon!.name, type: salon!.type, title: f.title, offer: offerText(p), when: whenText(p, today), link: promoLink(location.origin, salon!.slug, codeFrom(f.title)) })
    setBusy('')
    if (r.status === 'feito' && r.text) setForm({ ...f, message: r.text })
    else setError(r.message ?? 'Não foi possível agora.')
  }

  async function post(p: Promo) {
    setBusy(`post-${p.id}`); setNote('')
    try {
      const img = await promoImage({
        theme, salonName: salon!.name, title: p.title, offer: offerText(p), when: whenText(p, today),
        link: promoLink(location.origin, salon!.slug, p.code), photo: mediaUrl(p.image_path ?? photos[0] ?? salon!.cover_path ?? null), logo: mediaUrl(salon!.logo_path),
      })
      // Instagram usually drops the text that comes with a shared picture: the caption is copied first, ready to paste.
      await navigator.clipboard?.writeText(caption(p)).catch(() => {})
      const how = await sharePost(img, caption(p), p.code)
      setNote(how === 'descarregado' ? 'Imagem descarregada e legenda copiada: cole-a no Instagram ou no Facebook.' : how === 'partilhado' ? 'Legenda copiada: se a app não a mostrar, cole-a no post.' : '')
    } catch { setNote('Não foi possível criar a imagem.') }
    setBusy('')
  }

  async function toggle(p: Promo) {
    const { error } = await supabase.from('promotions').update({ active: !p.active }).eq('id', p.id)
    if (!error) setPromos(ps => ps.map(x => x.id === p.id ? { ...x, active: !p.active } : x))
  }

  async function pickImage(file: File | undefined) {
    if (!file || !form) return
    setBusy('imagem')
    try { const path = await uploadMedia(salon!.id, file, 'galeria'); setForm(f => f && { ...f, image: path }) } catch { setError('Não foi possível enviar a imagem.') }
    setBusy('')
  }

  const f = form
  const preview = f ? asPromo(f) : null
  return (
    <div className="themed" style={themeStyle(theme)}><main className="page">
      <header className="row"><h1>Promoções</h1><Link to="/mais">‹ Mais</Link></header>
      {missing && <p className="banner">Para usar promoções, corra <code>supabase/migrations/0020_promotions.sql</code> no editor SQL do Supabase.</p>}
      <p className="muted">Cada promoção tem o seu link de marcação: o desconto entra sozinho e vê quantas marcações trouxe. Partilhe o post no Instagram, Facebook ou Estado do WhatsApp num toque.</p>

      {!f && !missing && <button className="btn" onClick={() => { setForm(blank(today)); setError('') }}><Icon name="plus" size={18} />Nova promoção</button>}

      {f && (
        <form className="card editor" onSubmit={save}>
          <div className="row"><strong>{f.id ? 'Editar promoção' : 'Nova promoção'}</strong><button type="button" className="link" onClick={() => setForm(null)}>Fechar</button></div>
          <label>Título<input value={f.title} maxLength={80} placeholder="Ex.: Tardes calmas -20%" onChange={e => setForm({ ...f, title: e.target.value })} /></label>
          <label>Tipo
            <select value={f.kind} onChange={e => setForm({ ...f, kind: e.target.value as Promo['kind'] })}>
              <option value="percentagem">Desconto em %</option><option value="montante">Desconto em €</option><option value="oferta">Oferta (sem desconto)</option>
            </select>
          </label>
          {f.kind === 'oferta'
            ? <label>O que oferece<input value={f.gift} maxLength={80} placeholder="Ex.: Barba grátis" onChange={e => setForm({ ...f, gift: e.target.value })} /></label>
            : <label>{f.kind === 'percentagem' ? 'Percentagem' : 'Euros a menos'}<input inputMode="decimal" value={f.value} onChange={e => setForm({ ...f, value: e.target.value })} /></label>}
          <p className="muted small" style={{ margin: 0 }}>Uma oferta ou um desconto só nas horas calmas valorizam mais o seu trabalho do que descontos constantes.</p>

          <fieldset className="chips-set"><legend>Serviços <span className="muted">(nenhum = todos)</span></legend>
            {services.map(s => (
              <label key={s.id} className="check"><input type="checkbox" checked={f.services.includes(s.id)}
                onChange={e => setForm({ ...f, services: e.target.checked ? [...f.services, s.id] : f.services.filter(x => x !== s.id) })} />{s.name} · {euros(s.price_cents)}</label>
            ))}
          </fieldset>
          <fieldset className="chips-set"><legend>Dias <span className="muted">(nenhum = todos)</span></legend>
            <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              {WEEKDAYS.map((d, i) => (
                <button type="button" key={d} className={f.weekdays.includes(i) ? 'chip on' : 'chip'}
                  onClick={() => setForm({ ...f, weekdays: f.weekdays.includes(i) ? f.weekdays.filter(x => x !== i) : [...f.weekdays, i] })}><span className="d1">{d}</span></button>
              ))}
            </div>
          </fieldset>
          <div className="row">
            <label style={{ flex: 1 }}>Das<input type="time" value={f.from} onChange={e => setForm({ ...f, from: e.target.value })} /></label>
            <label style={{ flex: 1 }}>Às<input type="time" value={f.to} onChange={e => setForm({ ...f, to: e.target.value })} /></label>
          </div>
          <div className="row">
            <label style={{ flex: 1 }}>Começa<input type="date" value={f.starts} onChange={e => setForm({ ...f, starts: e.target.value })} /></label>
            <label style={{ flex: 1 }}>Acaba <input type="date" value={f.ends} min={f.starts} onChange={e => setForm({ ...f, ends: e.target.value })} /></label>
          </div>
          {preview && <p className="small"><b>{offerText(preview)}</b> · {whenText(preview, today)}</p>}

          <label><span>Texto do post</span><textarea rows={4} maxLength={1200} value={f.message} placeholder="Escolha uma frase pronta, escreva a sua, ou deixe em branco para usar a primeira." onChange={e => setForm({ ...f, message: e.target.value })} /></label>
          <details>
            <summary>Frases prontas</summary>
            {phrasesFor(salon.type).map(ph => (
              <button type="button" key={ph.title} className="phrase" onClick={() => preview && setForm({ ...f, message: fillPhrase(ph.text, { oferta: offerText(preview), quando: whenText(preview, today), salao: salon.name, link: promoLink(location.origin, salon.slug, f.id ? promos.find(x => x.id === f.id)!.code : codeFrom(f.title || 'promo')) }) })}>
                <b>{ph.title}</b><br /><small className="muted">{ph.text.replace(/\{link\}/, '…')}</small>
              </button>
            ))}
          </details>
          <button type="button" className="btn ghost inline sm" onClick={aiCaption} disabled={busy === 'ia' || !f.title}><Icon name="spark" size={16} />{busy === 'ia' ? 'A escrever…' : 'Escrever com IA'}</button>

          <div>
            <strong className="small">Imagem do post</strong>
            <p className="muted small" style={{ margin: '2px 0 6px' }}>Sem imagem, usa a primeira foto da galeria ou a capa, com o seu logótipo e cores.</p>
            {f.image && <img className="brand-preview cover" src={mediaUrl(f.image)!} alt="" />}
            <div className="actions">
              <label className="btn ghost inline sm" style={{ cursor: 'pointer' }}><Icon name="camera" size={16} />{busy === 'imagem' ? 'A enviar…' : f.image ? 'Trocar imagem' : 'Escolher imagem'}
                <input type="file" accept="image/*" hidden onChange={e => { pickImage(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              {f.image && <button type="button" className="link" onClick={() => setForm({ ...f, image: null })}>Sem imagem própria</button>}
            </div>
          </div>
          <label className="check"><input type="checkbox" checked={f.active} onChange={e => setForm({ ...f, active: e.target.checked })} />Ativa</label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={busy === 'guardar'}>{busy === 'guardar' ? 'A guardar…' : 'Guardar promoção'}</button>
        </form>
      )}

      {note && <p className="ok small" role="status">{note}</p>}

      {promos.length > 0 && <h2>As suas promoções</h2>}
      {promos.map(p => {
        const r = results[p.id] ?? { bookings: 0, revenue: 0 }
        const ended = p.ends_on !== null && p.ends_on < today
        const link = promoLink(location.origin, salon.slug, p.code)
        return (
          <article key={p.id} className={p.active && !ended ? 'card' : 'card off'}>
            <div className="row">
              <span><b>{p.title}</b><br /><small className="muted">{offerText(p)} · {whenText(p, today)}</small></span>
              <span className={`tag ${p.active && !ended ? '' : 'warn'}`}>{ended ? 'Terminou' : p.active ? 'Ativa' : 'Pausada'}</span>
            </div>
            <p className="small" style={{ margin: '6px 0' }}><b>{r.bookings}</b> {r.bookings === 1 ? 'marcação' : 'marcações'} · <b>{euros(r.revenue)}</b></p>
            <div className="actions">
              <button className="btn-inline" disabled={busy === `post-${p.id}`} onClick={() => post(p)}><Icon name="download" size={16} />{busy === `post-${p.id}` ? 'A criar…' : 'Publicar post'}</button>
              <button onClick={() => { navigator.clipboard?.writeText(link); setNote('Link copiado.') }}>Copiar link</button>
              <button onClick={() => setSharing(sharing === p.id ? null : p.id)}><WhatsAppIcon size={16} />Enviar a clientes</button>
              <button className="link" onClick={() => { setForm(toForm(p)); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Editar</button>
              <button className="link" onClick={() => toggle(p)}>{p.active ? 'Pausar' : 'Ativar'}</button>
            </div>
            {sharing === p.id && (
              <div className="next-visit">
                <p className="small muted" style={{ marginTop: 0 }}>Só aparecem os clientes que aceitaram receber promoções na última marcação ({consented.length}).</p>
                {consented.slice(0, 60).map(c => (
                  <div key={c.key} className="row invite-row">
                    <span><b>{c.name}</b><br /><small className="muted">{formatPhone(c.phone)}</small></span>
                    <a className={sent.has(`${p.id}-${c.key}`) ? 'wa sent' : 'wa'} href={waLink(c.phone, `Olá ${c.name.split(' ')[0]}! ${p.message}${p.message.includes(link) ? '' : ` ${link}`}`)} target="_blank" rel="noreferrer"
                      onClick={() => setSent(s => new Set(s).add(`${p.id}-${c.key}`))}>{sent.has(`${p.id}-${c.key}`) ? 'Enviado' : 'Enviar'}</a>
                  </div>
                ))}
              </div>
            )}
          </article>
        )
      })}

      <h2>Datas que aí vêm</h2>
      <p className="muted small">Um post uma ou duas semanas antes costuma resultar melhor.</p>
      {dates.map(o => (
        <div key={o.date + o.name} className="card row">
          <span><b>{o.name}</b> <small className="muted">· {new Date(o.date + 'T12:00:00Z').toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</small><br /><small className="muted">{o.idea}</small></span>
          {!missing && <button className="btn-inline" onClick={() => fromOccasion(o)}>Criar</button>}
        </div>
      ))}
    </main></div>
  )
}
