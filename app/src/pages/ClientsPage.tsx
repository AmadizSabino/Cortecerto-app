import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase, type Booking, type Salon, type Service } from '../lib/supabase'
import { AT_RISK_DAYS, birthdaySoon, buildClients, daysSince, filterClients, isAtRisk, mergeRegistered, type Client, type ClientDetails, type ClientFilter, type ClientNote, type RegisteredClient, HEARD_FROM, validNif, otherNames, otherPerson } from '../lib/clients'
import { dateInTz, formatTime } from '../lib/time'
import { formatPhone, waLink, waNumber } from '../lib/whatsapp'
import { themeById, themeStyle } from '../lib/themes'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import AiTryOn from '../components/AiTryOn'
import { styleOptions } from '../lib/styles'
import Icon from '../components/Icon'
import { photoToDataUrl, runAi } from '../lib/ai'
import HelpLink from '../HelpLink'
import ClientTimes from '../components/ClientTimes'
import type { ClientTime } from '../lib/clientTimes'
import { buyerKeys, orderTotal, type Order } from '../lib/shop'
import { publicOrigin } from '../lib/publicOrigin'

const FILTERS: { id: ClientFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'em_risco', label: 'Em risco' },
  { id: 'faltas', label: 'Com faltas' },
  { id: 'consentimento', label: 'Aceitam mensagens' },
  { id: 'aniversario', label: 'Aniversários' },
  { id: 'loja', label: 'Compraram na loja' },
]

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function birthdayLabel(days: number): string {
  return days === 0 ? 'Faz anos hoje' : days === 1 ? 'Faz anos amanhã' : `Faz anos daqui a ${days} dias`
}

/** Notes and birthday for one client, saved to client_notes. */
function NoteEditor({ salonId, phoneKey, note, draft, onSaved }: {
  salonId: string; phoneKey: string; note: ClientNote | undefined; draft?: string; onSaved: (n: ClientNote) => void
}) {
  const [notes, setNotes] = useState(draft ?? note?.notes ?? '')
  const [day, setDay] = useState(note?.birthday_day ? String(note.birthday_day) : '')
  const [month, setMonth] = useState(note?.birthday_month ? String(note.birthday_month) : '')
  const [state, setState] = useState<'' | 'saving' | 'saved' | 'error'>('')

  const dayMax = month ? DAYS_IN_MONTH[Number(month) - 1] : 31
  const dirty = notes !== (note?.notes ?? '') || day !== (note?.birthday_day ? String(note.birthday_day) : '')
    || month !== (note?.birthday_month ? String(note.birthday_month) : '')
  const half = (day === '') !== (month === '')

  async function save() {
    setState('saving')
    const row: ClientNote = {
      phone_key: phoneKey, notes: notes.trim(),
      birthday_day: day && month ? Math.min(Number(day), dayMax) : null,
      birthday_month: day && month ? Number(month) : null,
    }
    const { error } = await supabase.from('client_notes')
      .upsert({ salon_id: salonId, ...row, updated_at: new Date().toISOString() })
    if (error) { setState('error'); return }
    onSaved(row)
    setNotes(row.notes)
    setState('saved')
  }

  return (
    <div className="note-editor">
      <label>Notas<textarea rows={3} maxLength={2000} placeholder="Ex.: degradê baixo, máquina 1 dos lados, prefere o João" value={notes}
        onChange={e => { setNotes(e.target.value); setState('') }} /></label>
      <div className="birthday">
        <span>Aniversário</span>
        <select aria-label="Dia" value={day} onChange={e => { setDay(e.target.value); setState('') }}>
          <option value="">Dia</option>
          {Array.from({ length: dayMax }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select>
        <select aria-label="Mês" value={month} onChange={e => { setMonth(e.target.value); setState('') }}>
          <option value="">Mês</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </div>
      {half && <small className="muted">Escolha o dia e o mês, ou deixe os dois em branco.</small>}
      <div className="row">
        <button onClick={save} disabled={!dirty || half || state === 'saving'}>{state === 'saving' ? 'A guardar…' : 'Guardar'}</button>
        {state === 'saved' && <span className="ok">Guardado ✓</span>}
        {state === 'error' && <span className="error">Não foi possível guardar.</span>}
      </div>
    </div>
  )
}

/** Adds a client to the salon's own list, or completes one (salon_clients, migrations 0018 and 0036). */
function RegisterForm({ salonId, initial, note, pros, known, onSaved, onNote, onClose }: {
  salonId: string; initial: { name: string; phone: string; email?: string | null; details?: ClientDetails }
  known: (phoneKey: string) => { name: string; bookings: number; registered?: boolean } | undefined
  note?: ClientNote; pros: { id: string; name: string }[]
  onSaved: (r: RegisteredClient) => void; onNote: (n: ClientNote) => void; onClose: () => void
}) {
  const det = initial.details ?? {}
  const [name, setName] = useState(initial.name)
  const [phone, setPhone] = useState(initial.phone)
  const [email, setEmail] = useState(initial.email ?? '')
  const [day, setDay] = useState(note?.birthday_day ? String(note.birthday_day) : '')
  const [month, setMonth] = useState(note?.birthday_month ? String(note.birthday_month) : '')
  const [notes, setNotes] = useState(note?.notes ?? '')
  const [pro, setPro] = useState(det.preferred_pro ?? '')
  const [heard, setHeard] = useState(det.heard_from ?? '')
  const [nif, setNif] = useState(det.nif ?? '')
  const [consent, setConsent] = useState(Boolean(det.consent_messages))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const hasMore = Boolean(day || notes || pro || heard || nif || det.consent_messages != null)
  const dayMax = month ? DAYS_IN_MONTH[Number(month) - 1] : 31
  // Clients are kept per phone number: say so when this number already belongs to someone else.
  const typedKey = waNumber(phone)
  const owner = typedKey.length >= 11 && typedKey !== waNumber(initial.phone) ? known(typedKey) : undefined
  const shared = owner && name.trim() && otherPerson(name, owner.name) ? owner : undefined
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const key = waNumber(phone)
    if (!name.trim() || key.length < 11) { setError('Indique o nome e um telemóvel válido.'); return }
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Email inválido.'); return }
    if ((day === '') !== (month === '')) { setError('No aniversário, escolha o dia e o mês, ou deixe os dois em branco.'); return }
    const nifDigits = nif.replace(/\D/g, '')
    if (nifDigits && !validNif(nifDigits)) { setError('O NIF não é válido (9 dígitos).'); return }
    setSaving(true)
    const base = { salon_id: salonId, phone_key: key, name: name.trim(), phone: phone.trim(), email: email.trim() || null, updated_at: new Date().toISOString() }
    // The consent date only changes when the answer changes, so it says when the client said it.
    const consentChanged = consent !== Boolean(det.consent_messages) || (consent && !det.consent_at)
    const extra = {
      preferred_pro: pro || null, heard_from: heard || null, nif: nifDigits || null,
      ...(consentChanged ? { consent_messages: consent, consent_at: new Date().toISOString() } : {}),
    }
    let res = await supabase.from('salon_clients').upsert({ ...base, ...extra }, { onConflict: 'salon_id,phone_key' }).select('*').single()
    // Before migration 0036 the detail columns are missing: keep the basics.
    if (res.error && /column|schema cache/i.test(res.error.message)) res = await supabase.from('salon_clients').upsert(base, { onConflict: 'salon_id,phone_key' }).select('*').single()
    if (res.error || !res.data) { setSaving(false); setError('Não foi possível guardar.'); return }
    const noteRow: ClientNote = {
      phone_key: key, notes: notes.trim(),
      birthday_day: day && month ? Math.min(Number(day), dayMax) : null, birthday_month: day && month ? Number(month) : null,
    }
    if (noteRow.notes !== (note?.notes ?? '') || noteRow.birthday_day !== (note?.birthday_day ?? null) || noteRow.birthday_month !== (note?.birthday_month ?? null)) {
      const { error } = await supabase.from('client_notes').upsert({ salon_id: salonId, ...noteRow, updated_at: new Date().toISOString() })
      if (!error) onNote(noteRow)
    }
    setSaving(false)
    onSaved(res.data as RegisteredClient)
  }
  return (
    <form className="card editor" onSubmit={save}>
      <div className="row"><strong>{initial.name ? 'Ficha do cliente' : 'Registar cliente'}</strong><button type="button" className="link" onClick={onClose}>Fechar</button></div>
      <label>Nome<input value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></label>
      <label>Telemóvel<input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="off" placeholder="912 345 678" /></label>
      {shared && <p className="shared-phone small">Este número já tem {shared.bookings ? `${shared.bookings === 1 ? '1 marcação' : `${shared.bookings} marcações`} em nome de` : 'a ficha de'} <b>{shared.name}</b>. Cada número tem uma só ficha: ao guardar, {shared.registered ? 'a ficha passa a chamar-se' : 'o histórico desse número aparece em'} {name.trim().split(/\s+/)[0]}.</p>}
      <label><span>Email <span className="muted">(opcional)</span></span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" /></label>
      <details className="more-details" open={hasMore}>
        <summary>Mais detalhes <span className="muted">(opcional)</span></summary>
        <div className="birthday">
          <span>Aniversário</span>
          <select aria-label="Dia" value={day} onChange={e => setDay(e.target.value)}>
            <option value="">Dia</option>
            {Array.from({ length: dayMax }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
          <select aria-label="Mês" value={month} onChange={e => setMonth(e.target.value)}>
            <option value="">Mês</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <small className="muted">Só o dia e o mês, para lhe dar os parabéns. Não é preciso o ano.</small>
        {pros.length > 1 && <label>Profissional preferido<select value={pro} onChange={e => setPro(e.target.value)}>
          <option value="">Sem preferência</option>
          {pros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>}
        <label>Como nos conheceu<select value={heard} onChange={e => setHeard(e.target.value)}>
          <option value="">—</option>
          {HEARD_FROM.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select></label>
        <label>Notas e preferências<textarea rows={3} maxLength={2000} placeholder="Ex.: degradê baixo, máquina 1 dos lados, gosta de pomada mate" value={notes} onChange={e => setNotes(e.target.value)} /></label>
        <label><span>NIF <span className="muted">(para a fatura)</span></span><input inputMode="numeric" maxLength={11} value={nif} onChange={e => setNif(e.target.value)} placeholder="123456789" /></label>
        <label className="check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
          <span>O cliente aceitou receber mensagens do salão (lembretes de aniversário, promoções)
            {det.consent_at && <small className="muted"> · registado a {new Date(det.consent_at).toLocaleDateString('pt-PT')}</small>}</span></label>
        <small className="muted">Marque só se o cliente disser que sim. Guardamos a data. Desmarque se o cliente deixar de querer.</small>
      </details>
      {error && <p className="error">{error}</p>}
      <button className="btn" disabled={saving}>{saving ? 'A guardar…' : 'Guardar cliente'}</button>
    </form>
  )
}

/** Technical notes for the professional from a reference photo the client shows (AI). */
function ReferenceNotes({ onUse }: { onUse: (text: string) => void }) {
  const [state, setState] = useState<'' | 'a-ler'>('')
  const [out, setOut] = useState<{ ok: boolean; text: string }>()
  async function read(file: File | undefined) {
    if (!file) return
    setState('a-ler'); setOut(undefined)
    try {
      const r = await runAi('reference-notes', { image: await photoToDataUrl(file) })
      setOut(r.status === 'feito' && r.text ? { ok: true, text: r.text } : { ok: false, text: r.message ?? 'Não foi possível agora.' })
    } catch { setOut({ ok: false, text: 'Não foi possível abrir essa foto.' }) }
    setState('')
  }
  return (
    <div className="ai-tool">
      <label className="btn ghost inline sm" style={{ cursor: 'pointer' }}>
        <Icon name="spark" size={16} />{state ? 'A ler a foto…' : 'Notas a partir de uma foto de referência (IA)'}
        <input type="file" accept="image/*" hidden onChange={e => read(e.target.files?.[0])} />
      </label>
      {out && (out.ok
        ? <div className="card soft ai-answer">{out.text.split('\n').map((l, i) => <p key={i}>{l}</p>)}<button className="link" onClick={() => onUse(out.text)}>Juntar às notas</button></div>
        : <p className="muted small">{out.text}</p>)}
    </div>
  )
}

const STATUS_LABEL: Record<Booking['status'], string> = {
  pendente: 'Pendente', confirmada: 'Confirmada', concluida: 'Concluída', faltou: 'Faltou', cancelada: 'Cancelada',
}

export default function ClientsPage() {
  const [session, setSession] = useState<Session | null>()
  const [role, setRole] = useState<Role>('dono')
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Record<string, Service>>({})
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ClientFilter>('todos')
  const [open, setOpen] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, ClientNote>>({})
  const [notesReady, setNotesReady] = useState(true)
  const [forgetting, setForgetting] = useState<string | null>(null) // client key awaiting confirmation
  const [reload, setReload] = useState(0)
  const [forgetError, setForgetError] = useState('')
  const [registered, setRegistered] = useState<RegisteredClient[]>([])
  const [registerReady, setRegisterReady] = useState(true)
  const [params, setParams] = useSearchParams()
  // ?novo=<phone>&nome=<name>: from the agenda, "add this new client to your list".
  const [registering, setRegistering] = useState<{ name: string; phone: string; email?: string | null; details?: ClientDetails } | null>(() =>
    params.get('novo') ? { name: params.get('nome') ?? '', phone: params.get('novo') ?? '' } : null)
  const [noteSeed, setNoteSeed] = useState<Record<string, string>>({})
  const [pros, setPros] = useState<{ id: string; name: string }[]>([])
  const [noteRev, setNoteRev] = useState<Record<string, number>>({})
  // Per-client service times (migration 0031); null before it, so the card doesn't offer them.
  const [times, setTimes] = useState<ClientTime[] | null>(null)
  // Shop purchases (migration 0032): for "Compraram na loja" and the client card.
  const [buys, setBuys] = useState<Order[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
  }, [])

  useEffect(() => {
    if (!session) return
    (async () => {
      const mine = await loadMySalon(session.user.id)
      const s = mine.salon
      setRole(mine.role)
      setSalon(s)
      if (!s) return
      const [sv, bk, nt, rg, ct] = await Promise.all([
        supabase.from('services').select('id,name,duration_min,price_cents,active').eq('salon_id', s.id),
        supabase.from('bookings').select('*').eq('salon_id', s.id).order('starts_at', { ascending: false }).limit(5000),
        supabase.from('client_notes').select('phone_key,notes,birthday_day,birthday_month').eq('salon_id', s.id),
        supabase.from('salon_clients').select('*').eq('salon_id', s.id),
        supabase.from('client_times').select('id,phone_key,service_id,minutes').eq('salon_id', s.id),
      ])
      supabase.from('professionals').select('id,name').eq('salon_id', s.id).eq('active', true).order('name').then(({ data }) => setPros(data ?? []))
      supabase.from('product_orders').select('*').eq('salon_id', s.id).in('status', ['pago', 'entregue']).order('paid_at', { ascending: false }).limit(5000)
        .then(({ data, error }) => { if (!error) setBuys((data ?? []) as Order[]) })
      setTimes(ct.error ? null : (ct.data ?? []) as ClientTime[])
      // Before migration 0018 there is no client list of the salon's own: clients come from bookings only.
      setRegisterReady(!rg.error)
      setRegistered((rg.data ?? []) as RegisteredClient[])
      setServices(Object.fromEntries((sv.data ?? []).map(x => [x.id, x])))
      // Before migration 0003 runs the table is missing: the list still works, without notes.
      setNotesReady(!nt.error)
      setNotes(Object.fromEntries((nt.data ?? []).map((n: ClientNote) => [n.phone_key, n])))
      setBookings(bk.data ?? [])
    })()
  }, [session, reload])

  const [now] = useState(() => new Date())
  const today = dateInTz(now, salon?.timezone ?? 'Europe/Lisbon')
  const clients = useMemo(() => mergeRegistered(buildClients(bookings ?? [], services, now), registered), [bookings, services, now, registered])
  const buyers = useMemo(() => buyerKeys(buys), [buys])
  const shown = useMemo(() => filterClients(clients, query, filter, now, notes, today, buyers), [clients, query, filter, now, notes, today, buyers])
  const atRiskCount = useMemo(() => clients.filter(c => isAtRisk(c, now)).length, [clients, now])
  const birthdayCount = useMemo(() => clients.filter(c => birthdaySoon(notes[c.key], today) !== null).length, [clients, notes, today])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (!can(role, 'clientes')) return <Navigate to="/painel" replace />

  const tz = salon.timezone
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' })
  const bookingLink = `${publicOrigin()}/s/${salon.slug}`

  function comeBackMsg(c: Client) {
    const first = c.name.split(' ')[0]
    return `Olá ${first}! Já temos saudades no ${salon!.name}. Quando quiser voltar, pode marcar aqui: ${bookingLink}`
  }

  /** RGPD erasure: the bookings stay for statistics, without the client's name, phone or notes. */
  async function forget(c: Client) {
    setForgetError('')
    const { error } = await supabase.rpc('forget_client', { p_salon: salon!.id, p_key: c.key })
    // Anything but "function not there yet" (migration 0010) is a real failure: say so, change nothing.
    if (error && !error.message.includes('forget_client')) { setForgetError('Não foi possível apagar os dados. Tente de novo.'); return }
    if (error) {
      // Before migration 0010: do the same from here.
      const ids = c.bookings.map(b => b.id)
      const future = c.bookings.filter(b => (b.status === 'pendente' || b.status === 'confirmada') && new Date(b.starts_at) > now).map(b => b.id)
      const a = future.length ? await supabase.from('bookings').update({ status: 'cancelada' }).in('id', future) : { error: null }
      const b = await supabase.from('bookings').update({ client_name: 'Cliente apagado', client_phone: '', consent_messages: false }).in('id', ids)
      await supabase.from('client_notes').delete().eq('salon_id', salon!.id).eq('phone_key', c.key)
      if (a.error || b.error) { setForgetError('Não foi possível apagar todos os dados. Tente de novo.'); setReload(r => r + 1); return }
    }
    setForgetting(null); setOpen(null); setReload(r => r + 1)
  }

  function birthdayMsg(c: Client) {
    const first = c.name.split(' ')[0]
    return `Parabéns, ${first}! 🎉 Toda a equipa do ${salon!.name} deseja-lhe um ótimo dia. Quando quiser vir cá, marque aqui: ${bookingLink}`
  }

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page wide">
      <header className="row"><h1>Clientes<HelpLink /></h1>
        <span className="row">
          <Link className="btn ghost inline sm" to="/convidar"><Icon name="userPlus" size={16} />Convidar</Link>
          {registerReady && <button className="btn inline sm" onClick={() => setRegistering({ name: '', phone: '' })}><Icon name="plus" size={16} />Novo cliente</button>}
        </span>
      </header>
      {registering && registerReady && <RegisterForm salonId={salon.id} initial={registering} pros={pros} note={notes[waNumber(registering.phone)]}
        known={k => { const c = clients.find(x => x.key === k); return c && { name: c.name, bookings: c.bookings.length, registered: c.registered } }}
        onNote={n => { setNotes(ns => ({ ...ns, [n.phone_key]: n })); setNoteRev(r => ({ ...r, [n.phone_key]: (r[n.phone_key] ?? 0) + 1 })) }} onClose={() => { setRegistering(null); if (params.get('novo')) setParams({}, { replace: true }) }}
        onSaved={r => { setRegistered(rs => [...rs.filter(x => x.phone_key !== r.phone_key), r]); setRegistering(null); setOpen(r.phone_key); setQuery(''); setFilter('todos'); if (params.get('novo')) setParams({}, { replace: true }) }} />}

      {bookings === null ? <p className="muted">A carregar…</p> : <>
        <p className="muted">
          {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
          {atRiskCount > 0 && <> · <button className="link" onClick={() => setFilter('em_risco')}>{atRiskCount} sem vir há mais de {AT_RISK_DAYS} dias</button></>}
          {birthdayCount > 0 && <> · <button className="link" onClick={() => setFilter('aniversario')}>{birthdayCount} {birthdayCount === 1 ? 'aniversário' : 'aniversários'} esta semana</button></>}
        </p>
        {!notesReady && <p className="banner">Para guardar notas e aniversários, corra <code>supabase/migrations/0003_client_notes.sql</code> no editor SQL do Supabase.</p>}

        <label>Procurar<input type="search" placeholder="Nome ou telemóvel" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <div className="days">
          {FILTERS.map(f => (
            <button key={f.id} className={`day ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>

        {clients.length === 0 && <p className="muted">Ainda não há clientes. Aparecem aqui quando alguém marcar pelo seu link, quando os convidar ou quando os registar.</p>}
        {clients.length > 0 && shown.length === 0 && <p className="muted">Nenhum cliente encontrado.</p>}

        {shown.map(c => {
          const risk = isAtRisk(c, now)
          const expanded = open === c.key
          const bday = birthdaySoon(notes[c.key], today)
          return (
            <article key={c.key} className="card client">
              <button className="client-head" onClick={() => setOpen(expanded ? null : c.key)} aria-expanded={expanded}>
                <span>
                  <strong>{c.name}</strong>
                  <small className="muted">
                    {c.visits} {c.visits === 1 ? 'visita' : 'visitas'}
                    {c.lastVisit && (() => { const d = daysSince(c.lastVisit, now); return <> · {d <= 0 ? 'veio hoje' : d === 1 ? 'última há 1 dia' : `última há ${d} dias`}</> })()}
                  </small>
                  {notes[c.key]?.notes && !expanded && <small className="note-preview">{notes[c.key].notes}</small>}
                </span>
                <span className="tags">
                  {bday !== null && <span className="tag bday">🎂 {bday === 0 ? 'Hoje' : `${bday} d`}</span>}
                  {registerReady && !c.registered && <span className="tag">Não registado</span>}
                  {c.bookings.length === 0 && <span className="tag">Sem marcações</span>}
                  {c.nextBooking && <span className="tag">Marcado</span>}
                  {buyers.has(c.key) && <span className="tag">Loja</span>}
                  {risk && <span className="tag warn">Em risco</span>}
                  {c.noShows > 0 && <span className="tag warn">{c.noShows} {c.noShows === 1 ? 'falta' : 'faltas'}</span>}
                </span>
              </button>

              {expanded && <div className="client-body">
                <div><a href={`tel:+${formatPhone(c.phone).replace(/\D/g, '')}`}>{formatPhone(c.phone)}</a>{c.email && <> · <a href={`mailto:${c.email}`}>{c.email}</a></>}</div>
                {registerReady && (c.registered
                  ? <button className="link" onClick={() => setRegistering({ name: c.name, phone: c.phone, email: c.email, details: c.details })}>Editar ficha</button>
                  : <div className="newclient"><span>Ainda não está na sua lista de clientes.</span><button className="btn-inline" onClick={() => setRegistering({ name: c.name, phone: c.phone })}>Adicionar à lista</button></div>)}
                <div className="muted">
                  Gastou {euros(c.spentCents)}
                  {c.nextBooking && <> · próxima marcação {fmtDate(c.nextBooking)} às {formatTime(new Date(c.nextBooking), tz)}</>}
                </div>
                <div className="muted">{c.consent ? 'Aceita receber mensagens ✓' : 'Não aceitou mensagens de promoção'}</div>
                {c.details && (c.details.preferred_pro || c.details.heard_from || c.details.nif) && <div className="muted small">
                  {[c.details.preferred_pro && pros.find(p => p.id === c.details!.preferred_pro) && `Prefere ${pros.find(p => p.id === c.details!.preferred_pro)!.name}`,
                    c.details.heard_from && `Conheceu: ${HEARD_FROM.find(h => h.id === c.details!.heard_from)?.label ?? c.details.heard_from}`,
                    c.details.nif && `NIF ${c.details.nif}`].filter(Boolean).join(' · ')}
                </div>}
                {bday !== null && <div>🎂 {birthdayLabel(bday)}</div>}
                {(() => { const others = otherNames(c.name, c.bookings); return others.length > 0 && <div className="shared-phone small">Este número também marcou em nome de {others.slice(0, 4).join(', ')}{others.length > 4 ? ` e mais ${others.length - 4}` : ''}. Telemóvel partilhado?</div> })()}
                {buyers.has(c.key) && (() => {
                  const mine = buys.filter(b => b.client_phone && waNumber(b.client_phone) === c.key).slice(0, 5)
                  return <div className="small"><b>Compras na loja:</b> {mine.map(b => `${b.qty > 1 ? `${b.qty} × ` : ''}${b.product_name} (${fmtDate(b.paid_at!)}${can(role, 'revenue') ? `, ${euros(orderTotal(b))}` : ''})`).join(' · ')}</div>
                })()}
                <div className="actions">
                  <a className="wa" href={waLink(c.phone, '')} target="_blank" rel="noreferrer">WhatsApp</a>
                  {c.consent && bday !== null && (
                    <a className="wa" href={waLink(c.phone, birthdayMsg(c))} target="_blank" rel="noreferrer">Dar os parabéns</a>
                  )}
                  {c.consent && !c.nextBooking && (
                    <a className="wa" href={waLink(c.phone, comeBackMsg(c))} target="_blank" rel="noreferrer">Convidar a voltar</a>
                  )}
                </div>
                {times && c.key.length >= 9 && c.name !== 'Cliente apagado' && (
                  <ClientTimes salonId={salon.id} phoneKey={c.key} firstName={c.name.split(' ')[0]}
                    services={Object.values(services).filter(x => (x as Service & { active?: boolean }).active !== false).sort((a, b) => a.name.localeCompare(b.name))}
                    rows={times.filter(t => t.phone_key === c.key)}
                    onChange={rows => setTimes(ts => [...(ts ?? []).filter(t => t.phone_key !== c.key), ...rows])} />
                )}
                {notesReady && <NoteEditor key={`${noteSeed[c.key] ?? ''}#${noteRev[c.key] ?? 0}`} salonId={salon.id} phoneKey={c.key}
                  note={notes[c.key]} draft={noteSeed[c.key]}
                  onSaved={n => setNotes(ns => ({ ...ns, [n.phone_key]: n }))} />}
                {notesReady && <ReferenceNotes onUse={t => setNoteSeed(ns => ({ ...ns, [c.key]: [notes[c.key]?.notes, t].filter(Boolean).join('\n').slice(0, 2000) }))} />}
                <AiTryOn feature="before-after" title="Antes e depois" intro="Tire a foto do antes e mostre ao cliente o resultado esperado do serviço."
                  styles={styleOptions(salon.type, Object.values(services).map(s => s.name))} />
                <h2>Histórico</h2>
                <ul className="history">
                  {c.bookings.map(b => (
                    <li key={b.id} className={`st-${b.status}`}>
                      <span>{fmtDate(b.starts_at)}</span>
                      <span>{services[b.service_id]?.name ?? 'Serviço'}{otherPerson(c.name, b.client_name) && <small className="muted"> · {b.client_name}</small>}</span>
                      <span className="tag">{STATUS_LABEL[b.status]}</span>
                    </li>
                  ))}
                </ul>
                {forgetting === c.key ? (
                  <div className="card danger">
                    <p>Apagar o nome, o telemóvel e as notas de {c.name}? As marcações ficam nas estatísticas como "Cliente apagado" e as futuras são canceladas. Não dá para desfazer.</p>
                    <div className="actions">
                      <button className="btn-danger" onClick={() => forget(c)}>Sim, apagar</button>
                      {forgetError && <span className="error">{forgetError}</span>}
                      <button className="link" onClick={() => setForgetting(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : can(role, 'apagarCliente') && <button className="link danger-link" onClick={() => setForgetting(c.key)}>Apagar dados deste cliente (pedido RGPD)</button>}
              </div>}
            </article>
          )
        })}
      </>}
    </main></div>
  )
}
