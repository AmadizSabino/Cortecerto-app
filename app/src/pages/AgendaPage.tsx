import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon, { WhatsAppIcon } from '../components/Icon'
import { euros, initials, supabase, type Booking, type Professional, type Salon, type Service } from '../lib/supabase'
import { addDays, dateInTz, formatTime, zonedToUtc } from '../lib/time'
import { formatPhone, waLink } from '../lib/whatsapp'
import { themeById, themeStyle } from '../lib/themes'
import { loadMySalon, type Role } from '../lib/mySalon'
import SetupChecklist from '../SetupChecklist'
import TermsGate from '../TermsGate'
import RemindersCard from '../RemindersCard'
import NextVisit from '../NextVisit'
import BookingEditor from '../BookingEditor'
import InstallCard from '../InstallCard'
import BillingNotice from '../BillingNotice'
import { pendingDocs } from '../lib/acceptance'
import type { LegalDoc } from '../lib/legal'
import { manageLink } from '../lib/clientChanges'
import { bookingPrice } from '../lib/pricing'

const STATUS_LABEL: Record<Booking['status'], string> = {
  pendente: 'Pendente', confirmada: 'Confirmada', concluida: 'Concluída', faltou: 'Faltou', cancelada: 'Cancelada',
}

function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  async function send(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/painel' } })
    if (!error) setSent(true)
  }
  return (
    <main className="page">
      <h1>Painel do salão</h1>
      {sent ? <p>Enviámos um link de acesso para <b>{email}</b>.</p> : (
        <form onSubmit={send} className="card">
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <button className="btn">Receber link de acesso</button>
        </form>
      )}
    </main>
  )
}

export default function AgendaPage() {
  const [session, setSession] = useState<Session | null>()
  const [role, setRole] = useState<Role>('dono')
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Record<string, Service>>({})
  const [pros, setPros] = useState<Record<string, Professional>>({})
  const [params] = useSearchParams()
  // ?dia=YYYY-MM-DD opens a given day (from the week view).
  const [date, setDate] = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(params.get('dia') ?? '') ? params.get('dia')! : dateInTz(new Date(), 'Europe/Lisbon'))
  const [bookings, setBookings] = useState<Booking[]>([])
  const [offs, setOffs] = useState<{ id: string; professional_id: string | null; starts_at: string; ends_at: string; reason: string | null }[]>([])
  const [pending, setPending] = useState<LegalDoc[] | null>(null)
  const [nextFor, setNextFor] = useState<string | null>(null) // booking id with the next-visit panel open
  const [editing, setEditing] = useState<'nova' | string | null>(null) // 'nova' or the id of the booking being edited
  const [actionError, setActionError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    (async () => {
      const mine = await loadMySalon(session.user.id)
      const s = mine.salon
      setRole(mine.role)
      setSalon(s)
      if (!s) return
      // The terms are the owner's to accept, for the salon.
      if (mine.role === 'dono') pendingDocs().then(setPending)
      const [sv, pr] = await Promise.all([
        supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', s.id),
        supabase.from('professionals').select('id,name').eq('salon_id', s.id),
      ])
      setServices(Object.fromEntries((sv.data ?? []).map(x => [x.id, x])))
      setPros(Object.fromEntries((pr.data ?? []).map(x => [x.id, x])))
    })()
  }, [session])

  useEffect(() => {
    if (!salon) return
    const from = zonedToUtc(date, '00:00', salon.timezone).toISOString()
    const to = zonedToUtc(addDays(date, 1), '00:00', salon.timezone).toISOString()
    supabase.from('bookings').select('*').eq('salon_id', salon.id).gte('starts_at', from).lt('starts_at', to).order('starts_at')
      .then(({ data, error }) => { if (!error) setBookings(data ?? []) })
    // Time off on this day (migration 0009); ignored if the table isn't there yet.
    supabase.from('time_off').select('id,professional_id,starts_at,ends_at,reason').eq('salon_id', salon.id).lt('starts_at', to).gt('ends_at', from).order('starts_at')
      .then(({ data, error }) => setOffs(error ? [] : data ?? []))
  }, [salon, date, refresh])

  // New online bookings appear without reloading: when the app comes back to the screen, and every minute.
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') setRefresh(r => r + 1) }
    const t = setInterval(again, 60_000)
    document.addEventListener('visibilitychange', again)
    window.addEventListener('focus', again)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again) }
  }, [])

  async function update(b: Booking, patch: Partial<Booking>) {
    setActionError('')
    // select() so a write the database refused (no row changed) shows as a failure, not as done.
    const { data, error } = await supabase.from('bookings').update(patch).eq('id', b.id).select('id')
    if (error || !data?.length) {
      setActionError(error?.message.includes('no_overlap')
        ? 'Não foi possível: esse profissional já tem outra marcação a essa hora.'
        : 'Não foi possível guardar a alteração. Verifique a ligação e tente de novo.')
      return
    }
    setBookings(bs => bs.map(x => x.id === b.id ? { ...x, ...patch } : x))
    // Right after a visit is the moment to book the next one.
    if (patch.status === 'concluida') setNextFor(b.id)
  }

  /** After creating or editing: show it if it's on the day being viewed, otherwise go to its day. */
  function saved(nb: Booking) {
    setEditing(null)
    const day = dateInTz(new Date(nb.starts_at), salon?.timezone ?? 'Europe/Lisbon')
    if (day !== date) { setDate(day); return }
    setBookings(bs => [...bs.filter(x => x.id !== nb.id), nb].sort((x, y) => x.starts_at.localeCompare(y.starts_at)))
  }

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Login />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />

  const tz = salon.timezone
  const today = dateInTz(new Date(), tz)
  const live = bookings.filter(b => b.status !== 'cancelada')
  const revenue = live.filter(b => b.status !== 'faltou').reduce((sum, b) => sum + bookingPrice(b, services), 0)
  const deposits = live.filter(b => b.deposit === 'pendente').length
  const hour = Number(new Date().toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }))
  const greeting = hour < 12 ? 'Bom dia' : hour < 20 ? 'Boa tarde' : 'Boa noite'
  const dayLabel = date === today ? 'Hoje' : date === addDays(today, 1) ? 'Amanhã' : date === addDays(today, -1) ? 'Ontem'
    : new Date(date + 'T12:00:00Z').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const openNew = () => { setEditing('nova'); requestAnimationFrame(() => document.getElementById('agenda')?.scrollIntoView({ behavior: 'smooth' })) }

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page wide with-fab">
      <header className="greet">
        <div>
          <p className="eyebrow">{salon.name} · {new Date().toLocaleDateString('pt-PT', { timeZone: tz, day: 'numeric', month: 'short' }).replace('.', '')}</p>
          <h1>{greeting}</h1>
        </div>
        <span className="avatar">{initials(salon.name)}</span>
      </header>
      {pending && pending.length > 0 && <TermsGate docs={pending} salonId={salon.id} onAccepted={() => setPending([])} />}
      {!(pending && pending.length > 0) && <>
      {role === 'dono' && <BillingNotice salon={salon} />}
      <div className="stats">
        <div className="stat"><b>{live.length}</b><span>Marcações {date === today ? 'hoje' : 'no dia'}</span></div>
        <div className="stat"><b>{euros(revenue).replace(',00', '')}</b><span>Faturação prevista</span></div>
        <div className="stat"><b>{deposits}</b><span>Sinais por confirmar</span></div>
      </div>
      <InstallCard />
      <RemindersCard salon={salon} />
      <SetupChecklist salon={salon} services={Object.keys(services).length} professionals={Object.keys(pros).length} />

      <div className="daynav" id="agenda">
        <button className="icon-btn" aria-label="Dia anterior" onClick={() => setDate(addDays(date, -1))}><Icon name="chevronLeft" /></button>
        <button className="link" style={{ textDecoration: 'none', color: 'var(--fg)', fontWeight: 700, fontSize: '1.05rem' }} onClick={() => setDate(today)}><strong>{dayLabel}</strong></button>
        <button className="icon-btn" aria-label="Dia seguinte" onClick={() => setDate(addDays(date, 1))}><Icon name="chevronRight" /></button>
      </div>

      {editing === 'nova' && <BookingEditor salon={salon} defaultDate={date} onClose={() => setEditing(null)} onSaved={saved} />}

      {offs.map(t => {
        const s = new Date(t.starts_at), e = new Date(t.ends_at)
        const from = zonedToUtc(date, '00:00', tz), to = zonedToUtc(addDays(date, 1), '00:00', tz)
        const allDay = s <= from && e >= to
        return (
          <div key={t.id} className="card off-card">
            <strong>{allDay ? 'Dia bloqueado' : `Bloqueado ${formatTime(s < from ? from : s, tz)}–${formatTime(e > to ? to : e, tz)}`}</strong>
            <span className="muted"> · {t.professional_id ? pros[t.professional_id]?.name ?? 'Profissional' : 'Todo o salão'}{t.reason && ` · ${t.reason}`}</span>
          </div>
        )
      })}
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {bookings.length === 0 && editing !== 'nova' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted" style={{ margin: '4px 0 12px' }}>Sem marcações neste dia.</p>
          <button className="btn ghost inline sm" onClick={openNew}><Icon name="plus" size={16} />Adicionar marcação</button>
        </div>
      )}
      {bookings.map(b => {
        const svc = services[b.service_id]
        const when = new Date(b.starts_at)
        const mins = Math.round((new Date(b.ends_at).getTime() - when.getTime()) / 60000)
        const msg = `Olá ${b.client_name}! A sua marcação de ${svc?.name ?? ''} no ${salon.name} está confirmada para ${when.toLocaleDateString('pt-PT', { timeZone: tz, day: 'numeric', month: 'long' })} às ${formatTime(when, tz)}.${salon.client_change_hours != null ? ` Se precisar de cancelar ou mudar: ${manageLink(location.origin, b.id)}` : ''} Até já!`
        if (editing === b.id) return (
          <BookingEditor key={b.id} salon={salon} booking={b} defaultDate={date} onClose={() => setEditing(null)} onSaved={saved} />
        )
        const hasPhone = /\d{6}/.test(b.client_phone.replace(/\D/g, ''))
        return (
          <article key={b.id} className={`card booking st-${b.status}`}>
            <div className="time">{formatTime(when, tz)}<small>{mins} min</small></div>
            <div style={{ minWidth: 0 }}>
              <div className="who"><b>{b.client_name}</b><span className={`tag ${b.status}`}>{STATUS_LABEL[b.status]}</span></div>
              <div className="muted small" style={{ marginTop: 2 }}>{svc?.name} · {pros[b.professional_id]?.name}{svc && <> · {euros(bookingPrice(b, services))}</>}</div>
              {(b.client_action === 'mudou' || b.client_action === 'cancelou') && (
                <div style={{ marginTop: 6 }}><span className="tag warn">{b.client_action === 'mudou' ? 'Cliente mudou a hora' : 'Cancelada pelo cliente'}</span></div>
              )}
              {hasPhone && <div className="small" style={{ marginTop: 4 }}><a href={`tel:+${formatPhone(b.client_phone).replace(/\D/g, '')}`}>{formatPhone(b.client_phone)}</a></div>}
              {b.deposit !== 'nenhum' && (
                <div className="small" style={{ marginTop: 4 }}>Sinal: {b.deposit === 'pago'
                  ? <span className="ok" style={{ fontWeight: 600 }}>recebido ✓</span>
                  : <button className="link" onClick={() => update(b, b.status === 'pendente' ? { deposit: 'pago', status: 'confirmada' } : { deposit: 'pago' })}>marcar como recebido</button>}</div>
              )}
              <div className="actions">
                {b.status === 'pendente' && <button className="btn-inline" onClick={() => update(b, { status: 'confirmada' })}>Confirmar</button>}
                {(b.status === 'pendente' || b.status === 'confirmada') && <>
                  <button onClick={() => update(b, { status: 'concluida' })}>Concluída</button>
                  <button onClick={() => update(b, { status: 'faltou' })}>Faltou</button>
                  <button onClick={() => update(b, { status: 'cancelada' })}>Cancelar</button>
                </>}
                {hasPhone && <a className="wa" href={waLink(b.client_phone, msg)} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />WhatsApp</a>}
                {b.status === 'concluida' && nextFor !== b.id && <button onClick={() => setNextFor(b.id)}>Próxima visita</button>}
                {(b.status === 'pendente' || b.status === 'confirmada') && <button className="link" onClick={() => setEditing(b.id)}>Editar</button>}
              </div>
            </div>
            {nextFor === b.id && svc && pros[b.professional_id] && (
              <NextVisit salon={salon} booking={b} service={svc} pro={pros[b.professional_id]}
                onClose={() => setNextFor(null)}
                onBooked={nb => { if (dateInTz(new Date(nb.starts_at), tz) === date) setBookings(bs => [...bs, nb].sort((x, y) => x.starts_at.localeCompare(y.starts_at))) }} />
            )}
          </article>
        )
      })}
      {editing !== 'nova' && <button className="btn inline fab" onClick={openNew}><Icon name="plus" size={18} />Marcação</button>}
      </>}
    </main></div>
  )
}
