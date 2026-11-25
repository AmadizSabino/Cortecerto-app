import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase, type Booking, type Salon, type Service } from '../lib/supabase'
import { AT_RISK_DAYS, birthdaySoon, buildClients, daysSince, filterClients, isAtRisk, mergeRegistered, type Client, type ClientFilter, type ClientNote, type RegisteredClient } from '../lib/clients'
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

const FILTERS: { id: ClientFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'em_risco', label: 'Em risco' },
  { id: 'faltas', label: 'Com faltas' },
  { id: 'consentimento', label: 'Aceitam mensagens' },
  { id: 'aniversario', label: 'Aniversários' },
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

/** Adds a client to the salon's own list, or completes one (salon_clients, migration 0018). */
function RegisterForm({ salonId, initial, onSaved, onClose }: {
  salonId: string; initial: { name: string; phone: string; email?: string | null }
  onSaved: (r: RegisteredClient) => void; onClose: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [phone, setPhone] = useState(initial.phone)
  const [email, setEmail] = useState(initial.email ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const key = waNumber(phone)
    if (!name.trim() || key.length < 11) { setError('Indique o nome e um telemóvel válido.'); return }
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Email inválido.'); return }
    setSaving(true)
    const row = { salon_id: salonId, phone_key: key, name: name.trim(), phone: phone.trim(), email: email.trim() || null, updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from('salon_clients').upsert(row, { onConflict: 'salon_id,phone_key' }).select('phone_key,name,phone,email,source,created_at').single()
    setSaving(false)
    if (error || !data) { setError('Não foi possível guardar.'); return }
    onSaved(data as RegisteredClient)
  }
  return (
    <form className="card editor" onSubmit={save}>
      <div className="row"><strong>Registar cliente</strong><button type="button" className="link" onClick={onClose}>Fechar</button></div>
      <label>Nome<input value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></label>
      <label>Telemóvel<input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="off" placeholder="912 345 678" /></label>
      <label><span>Email <span className="muted">(opcional)</span></span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" /></label>
      <p className="muted small" style={{ margin: 0 }}>Depois de guardar, pode juntar notas e o aniversário na ficha do cliente.</p>
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
  const [registering, setRegistering] = useState<{ name: string; phone: string; email?: string | null } | null>(() =>
    params.get('novo') ? { name: params.get('nome') ?? '', phone: params.get('novo') ?? '' } : null)
  const [noteSeed, setNoteSeed] = useState<Record<string, string>>({})
  // Per-client service times (migration 0031); null before it, so the card doesn't offer them.
  const [times, setTimes] = useState<ClientTime[] | null>(null)

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
        supabase.from('salon_clients').select('phone_key,name,phone,email,source,created_at').eq('salon_id', s.id),
        supabase.from('client_times').select('id,phone_key,service_id,minutes').eq('salon_id', s.id),
      ])
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
  const shown = useMemo(() => filterClients(clients, query, filter, now, notes, today), [clients, query, filter, now, notes, today])
  const atRiskCount = useMemo(() => clients.filter(c => isAtRisk(c, now)).length, [clients, now])
  const birthdayCount = useMemo(() => clients.filter(c => birthdaySoon(notes[c.key], today) !== null).length, [clients, notes, today])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (!can(role, 'clientes')) return <Navigate to="/painel" replace />

  const tz = salon.timezone
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' })
  const bookingLink = `${location.origin}/s/${salon.slug}`

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
      {registering && registerReady && <RegisterForm salonId={salon.id} initial={registering} onClose={() => { setRegistering(null); if (params.get('novo')) setParams({}, { replace: true }) }}
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
                  {risk && <span className="tag warn">Em risco</span>}
                  {c.noShows > 0 && <span className="tag warn">{c.noShows} {c.noShows === 1 ? 'falta' : 'faltas'}</span>}
                </span>
              </button>

              {expanded && <div className="client-body">
                <div><a href={`tel:+${formatPhone(c.phone).replace(/\D/g, '')}`}>{formatPhone(c.phone)}</a>{c.email && <> · <a href={`mailto:${c.email}`}>{c.email}</a></>}</div>
                {registerReady && (c.registered
                  ? <button className="link" onClick={() => setRegistering({ name: c.name, phone: c.phone, email: c.email })}>Editar registo</button>
                  : <div className="newclient"><span>Ainda não está na sua lista de clientes.</span><button className="btn-inline" onClick={() => setRegistering({ name: c.name, phone: c.phone })}>Adicionar à lista</button></div>)}
                <div className="muted">
                  Gastou {euros(c.spentCents)}
                  {c.nextBooking && <> · próxima marcação {fmtDate(c.nextBooking)} às {formatTime(new Date(c.nextBooking), tz)}</>}
                </div>
                <div className="muted">{c.consent ? 'Aceita receber mensagens ✓' : 'Não aceitou mensagens de promoção'}</div>
                {bday !== null && <div>🎂 {birthdayLabel(bday)}</div>}
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
                {notesReady && <NoteEditor key={noteSeed[c.key] ?? ''} salonId={salon.id} phoneKey={c.key}
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
                      <span>{services[b.service_id]?.name ?? 'Serviço'}</span>
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
