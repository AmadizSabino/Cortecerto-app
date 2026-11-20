import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase, type Booking, type Salon, type Service } from '../lib/supabase'
import { AT_RISK_DAYS, birthdaySoon, buildClients, daysSince, filterClients, isAtRisk, type Client, type ClientFilter, type ClientNote } from '../lib/clients'
import { dateInTz, formatTime } from '../lib/time'
import { formatPhone, waLink } from '../lib/whatsapp'
import { themeById, themeStyle } from '../lib/themes'

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
function NoteEditor({ salonId, phoneKey, note, onSaved }: {
  salonId: string; phoneKey: string; note: ClientNote | undefined; onSaved: (n: ClientNote) => void
}) {
  const [notes, setNotes] = useState(note?.notes ?? '')
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

const STATUS_LABEL: Record<Booking['status'], string> = {
  pendente: 'Pendente', confirmada: 'Confirmada', concluida: 'Concluída', faltou: 'Faltou', cancelada: 'Cancelada',
}

export default function ClientsPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Record<string, Service>>({})
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ClientFilter>('todos')
  const [open, setOpen] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, ClientNote>>({})
  const [notesReady, setNotesReady] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
  }, [])

  useEffect(() => {
    if (!session) return
    (async () => {
      const { data: s } = await supabase.from('salons').select('*').eq('owner_id', session.user.id).maybeSingle()
      setSalon(s)
      if (!s) return
      const [sv, bk, nt] = await Promise.all([
        supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', s.id),
        supabase.from('bookings').select('*').eq('salon_id', s.id).order('starts_at', { ascending: false }).limit(5000),
        supabase.from('client_notes').select('phone_key,notes,birthday_day,birthday_month').eq('salon_id', s.id),
      ])
      setServices(Object.fromEntries((sv.data ?? []).map(x => [x.id, x])))
      // Before migration 0003 runs the table is missing: the list still works, without notes.
      setNotesReady(!nt.error)
      setNotes(Object.fromEntries((nt.data ?? []).map((n: ClientNote) => [n.phone_key, n])))
      setBookings(bk.data ?? [])
    })()
  }, [session])

  const [now] = useState(() => new Date())
  const today = dateInTz(now, salon?.timezone ?? 'Europe/Lisbon')
  const clients = useMemo(() => buildClients(bookings ?? [], services, now), [bookings, services, now])
  const shown = useMemo(() => filterClients(clients, query, filter, now, notes, today), [clients, query, filter, now, notes, today])
  const atRiskCount = useMemo(() => clients.filter(c => isAtRisk(c, now)).length, [clients, now])
  const birthdayCount = useMemo(() => clients.filter(c => birthdaySoon(notes[c.key], today) !== null).length, [clients, notes, today])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />

  const tz = salon.timezone
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' })
  const bookingLink = `${location.origin}/s/${salon.slug}`

  function comeBackMsg(c: Client) {
    const first = c.name.split(' ')[0]
    return `Olá ${first}! Já temos saudades no ${salon!.name}. Quando quiser voltar, pode marcar aqui: ${bookingLink}`
  }

  function birthdayMsg(c: Client) {
    const first = c.name.split(' ')[0]
    return `Parabéns, ${first}! 🎉 Toda a equipa do ${salon!.name} deseja-lhe um ótimo dia. Quando quiser vir cá, marque aqui: ${bookingLink}`
  }

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page wide">
      <header className="row">
        <h1>Clientes</h1>
        <span className="row"><Link to="/painel">Agenda</Link><Link to="/definicoes">Definições</Link></span>
      </header>

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

        {clients.length === 0 && <p className="muted">Ainda não há clientes. Aparecem aqui assim que alguém marcar pelo seu link.</p>}
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
                    {c.lastVisit && <> · última há {daysSince(c.lastVisit, now)} dias</>}
                  </small>
                  {notes[c.key]?.notes && !expanded && <small className="note-preview">{notes[c.key].notes}</small>}
                </span>
                <span className="tags">
                  {bday !== null && <span className="tag bday">🎂 {bday === 0 ? 'Hoje' : `${bday} d`}</span>}
                  {c.nextBooking && <span className="tag">Marcado</span>}
                  {risk && <span className="tag warn">Em risco</span>}
                  {c.noShows > 0 && <span className="tag warn">{c.noShows} {c.noShows === 1 ? 'falta' : 'faltas'}</span>}
                </span>
              </button>

              {expanded && <div className="client-body">
                <div><a href={`tel:+${formatPhone(c.phone).replace(/\D/g, '')}`}>{formatPhone(c.phone)}</a></div>
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
                {notesReady && <NoteEditor salonId={salon.id} phoneKey={c.key} note={notes[c.key]}
                  onSaved={n => setNotes(ns => ({ ...ns, [n.phone_key]: n }))} />}
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
              </div>}
            </article>
          )
        })}
      </>}
    </main></div>
  )
}
