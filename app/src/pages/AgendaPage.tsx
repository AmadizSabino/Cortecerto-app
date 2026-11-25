import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon, { WhatsAppIcon } from '../components/Icon'
import { euros, initials, supabase, type Booking, type Professional, type Salon, type Service } from '../lib/supabase'
import { addDays, dateInTz, formatTime, zonedToUtc } from '../lib/time'
import { formatPhone, waLink, waNumber } from '../lib/whatsapp'
import { themeById, themeStyle } from '../lib/themes'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import ProposeTime from '../ProposeTime'
import FreeSlot from '../FreeSlot'
import { usableWindow } from '../lib/freeSlot'
import { onTheWay } from '../lib/home'
import { proposalMessage } from '../lib/proposal'
import SetupChecklist from '../SetupChecklist'
import FirstBooking from '../components/FirstBooking'
import TermsGate from '../TermsGate'
import RemindersCard from '../RemindersCard'
import NextVisit from '../NextVisit'
import BookingEditor from '../BookingEditor'
import InstallCard from '../InstallCard'
import { PushNudge } from '../components/PushToggle'
import BillingNotice from '../BillingNotice'
import { isLockedError, LOCKED_MESSAGE, lockState, type BillingFields } from '../lib/billing'
import { pendingDocs } from '../lib/acceptance'
import type { LegalDoc } from '../lib/legal'
import { manageLink } from '../lib/clientChanges'
import { bookingPrice } from '../lib/pricing'
import Login from '../components/Login'
import HelpLink from '../HelpLink'
import AiTryOn from '../components/AiTryOn'
import AskAssistant from '../components/AskAssistant'
import { styleOptions } from '../lib/styles'
import { cardById } from '../lib/styleCatalog'

const STATUS_LABEL: Record<Booking['status'], string> = {
  pendente: 'Pendente', confirmada: 'Confirmada', concluida: 'Concluída', faltou: 'Faltou', cancelada: 'Cancelada',
}

const DISMISS_KEY = 'cortecerto-newclient-dismissed'

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
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [trying, setTrying] = useState<string | null>(null) // booking id with the AI before/after open
  const [freeing, setFreeing] = useState<string | null>(null) // booking id whose freed time is being offered
  const reload = useCallback(() => setRefresh(r => r + 1), [])
  // Home visits, event packages and prepaid packs (migration 0022).
  const [addresses, setAddresses] = useState<Record<string, { address: string; postcode: string | null; notes: string | null; zone_name: string | null }>>({})
  const [packs, setPacks] = useState<{ id: string; phone_key: string; sessions_total: number; sessions_used: number }[]>([])
  const [hourRate, setHourRate] = useState<Record<string, number>>({})
  const [waitingSince, setWaitingSince] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem('cortecerto-espera') ?? '{}') } catch { return {} } })
  const [proposing, setProposing] = useState<string | null>(null) // booking id with "Sugerir outro horário" open
  // Phone keys already on the salon's client list (migration 0018); null before it, so nothing is asked.
  const [known, setKnown] = useState<Set<string> | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]')) } catch { return new Set() }
  })

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

  // Which of the day's clients are not yet on the salon's client list.
  useEffect(() => {
    if (!salon) return
    const keys = [...new Set(bookings.map(b => waNumber(b.client_phone)).filter(k => k.length >= 11))]
    if (keys.length === 0) { setKnown(new Set()); return }
    supabase.rpc('known_clients', { p_salon: salon.id, p_keys: keys })
      .then(({ data, error }) => setKnown(error ? null : new Set(((data ?? []) as (string | { known_clients: string })[]).map(r => typeof r === 'string' ? r : r.known_clients))))
  }, [salon, bookings])

  useEffect(() => {
    if (!salon) return
    const home = bookings.filter(b => b.location === 'domicilio').map(b => b.id)
    if (home.length) supabase.from('booking_addresses').select('booking_id,address,postcode,notes,zone_name').in('booking_id', home)
      .then(({ data }) => setAddresses(Object.fromEntries((data ?? []).map(a => [a.booking_id, a]))))
    supabase.from('client_packs').select('id,phone_key,sessions_total,sessions_used').eq('salon_id', salon.id).eq('status', 'ativo')
      .then(({ data, error }) => { if (!error) setPacks(data ?? []) })
    const pk = [...new Set(bookings.map(b => b.package_id).filter((x): x is string => Boolean(x)))]
    if (pk.length) supabase.from('packages').select('id,extra_hour_cents').in('id', pk)
      .then(({ data }) => setHourRate(Object.fromEntries((data ?? []).filter(x => x.extra_hour_cents).map(x => [x.id, x.extra_hour_cents as number]))))
  }, [salon, bookings])

  function toggleWaiting(b: Booking) {
    const since = waitingSince[b.id]
    const next = { ...waitingSince }
    if (since) {
      delete next[b.id]
      const add = Math.max(1, Math.round((Date.now() - since) / 60000))
      update(b, { waiting_min: (b.waiting_min ?? 0) + add })
    } else next[b.id] = Date.now()
    setWaitingSince(next)
    try { localStorage.setItem('cortecerto-espera', JSON.stringify(next)) } catch { /* private mode */ }
  }
  async function spendPackSession(b: Booking, packId: string) {
    setActionError('')
    const { data, error } = await supabase.rpc('use_pack_session', { p_pack: packId, p_booking: b.id })
    if (error) { setActionError(error.message.includes('pack_expirado') ? 'Este pack já passou da validade.' : 'Não foi possível usar a sessão do pack.'); return }
    setBookings(bs => bs.map(x => x.id === b.id ? { ...x, client_pack_id: packId, price_cents: 0 } : x))
    setPacks(ps => ps.map(p => p.id === packId ? { ...p, sessions_used: p.sessions_used + 1 } : p).filter(p => p.sessions_used < p.sessions_total))
    setNotice(`Sessão usada. Restam ${data} no pack.`)
  }

  function dismiss(key: string) {
    setDismissed(d => {
      const n = new Set(d).add(key)
      try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...n].slice(-500))) } catch { /* private mode */ }
      return n
    })
  }

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
      setActionError(isLockedError(error) ? LOCKED_MESSAGE : error?.message.includes('no_overlap')
        ? 'Não foi possível: esse profissional já tem outra marcação a essa hora.'
        : 'Não foi possível guardar a alteração. Verifique a ligação e tente de novo.')
      return
    }
    setBookings(bs => bs.map(x => x.id === b.id ? { ...x, ...patch } : x))
    // Right after a visit is the moment to book the next one.
    if (patch.status === 'concluida') setNextFor(b.id)
    // A cancellation or a no-show frees time: offer it straight away, while it can still be filled.
    if ((patch.status === 'cancelada' || patch.status === 'faltou') && usableWindow(new Date(b.starts_at), new Date(b.ends_at), new Date())) setFreeing(b.id)
  }

  async function withdraw(b: Booking) {
    setActionError('')
    const { error } = await supabase.rpc('withdraw_booking_proposal', { p_booking: b.id })
    if (error) { setActionError('Não foi possível retirar a sugestão.'); return }
    setBookings(bs => bs.map(x => x.id === b.id ? { ...x, proposed_starts_at: null, proposal_note: null } : x))
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
  // Read-only account (migration 0023): the day stays visible, the buttons that change it go.
  const locked = lockState(salon as Salon & BillingFields).locked
  const openNew = () => { setEditing('nova'); requestAnimationFrame(() => document.getElementById('agenda')?.scrollIntoView({ behavior: 'smooth' })) }

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page wide with-fab">
      <header className="greet">
        <div>
          <p className="eyebrow">{salon.name} · {new Date().toLocaleDateString('pt-PT', { timeZone: tz, day: 'numeric', month: 'short' }).replace('.', '')}</p>
          <h1>{greeting}<HelpLink screen="/painel" /></h1>
        </div>
        <span className="avatar">{initials(salon.name)}</span>
      </header>
      {pending && pending.length > 0 && <TermsGate docs={pending} salonId={salon.id} onAccepted={() => setPending([])} />}
      {!(pending && pending.length > 0) && <>
      {(role === 'dono' || locked) && <BillingNotice salon={salon} />}
      <div className="stats">
        <div className="stat"><b>{live.length}</b><span>Marcações {date === today ? 'hoje' : 'no dia'}</span></div>
        {can(role, 'revenue')
          ? <div className="stat"><b>{euros(revenue).replace(',00', '')}</b><span>Faturação prevista</span></div>
          : <div className="stat"><b>{live.filter(b => b.status === 'pendente').length}</b><span>Por confirmar</span></div>}
        <div className="stat"><b>{deposits}</b><span>Sinais por confirmar</span></div>
      </div>
      {!locked && <FirstBooking salon={salon} />}
      <InstallCard />
      {!locked && <PushNudge />}
      {!locked && <RemindersCard salon={salon} />}
      {!locked && can(role, 'ia') && <AskAssistant salon={salon} compact owner={role === 'dono'} />}
      {!locked && <SetupChecklist salon={salon} services={Object.keys(services).length} professionals={Object.keys(pros).length} />}

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
      {notice && <p className="ok" role="status">{notice}</p>}
      {bookings.length === 0 && editing !== 'nova' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted" style={{ margin: '4px 0 12px' }}>Sem marcações neste dia.</p>
          {!locked && <button className="btn ghost inline sm" onClick={openNew}><Icon name="plus" size={16} />Adicionar marcação</button>}
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
        const key = waNumber(b.client_phone)
        const isNew = !locked && Boolean(known) && can(role, 'clientes') && hasPhone && key.length >= 11 && !known!.has(key) && !dismissed.has(key)
          && b.status !== 'cancelada' && b.client_name !== 'Cliente apagado'
        return (
          <article key={b.id} className={`card booking st-${b.status}`}>
            <div className="time">{formatTime(when, tz)}<small>{mins} min</small></div>
            <div style={{ minWidth: 0 }}>
              <div className="who"><b>{b.client_name}</b><span className={`tag ${b.status}`}>{STATUS_LABEL[b.status]}</span></div>
              <div className="muted small" style={{ marginTop: 2 }}>{b.package_summary ?? svc?.name} · {pros[b.professional_id]?.name}{svc && <> · {euros(bookingPrice(b, services))}</>}{b.client_pack_id && ' · pago com pack'}</div>
              {cardById(b.style) && <div className="small style-booked"><Link to={`/estilos?e=${b.style}`}><Icon name="scissors" size={14} />Escolheu o estilo <b>{cardById(b.style)!.name}</b></Link></div>}
              {b.location === 'domicilio' && (
                <div className="proposal home-visit">
                  <b><Icon name="home" size={14} /> Ao domicílio</b>{addresses[b.id]?.zone_name ? ` · ${addresses[b.id].zone_name}` : ''}{b.travel_min ? ` · ${b.travel_min} min de viagem` : ''}{b.home_fee_cents ? ` · deslocação e taxas ${euros(b.home_fee_cents)}` : ''}
                  {addresses[b.id] && <><br /><a href={`https://maps.google.com/?q=${encodeURIComponent(`${addresses[b.id].address} ${addresses[b.id].postcode ?? ''}`)}`} target="_blank" rel="noreferrer">{addresses[b.id].address}{addresses[b.id].postcode ? `, ${addresses[b.id].postcode}` : ''}</a>{addresses[b.id].notes && <><br /><small className="muted">{addresses[b.id].notes}</small></>}</>}
                  {(b.status === 'pendente' || b.status === 'confirmada') && (
                    <div className="actions">
                      {hasPhone && <a className={b.en_route_at ? 'wa sent' : 'wa'} href={waLink(b.client_phone, onTheWay(b.client_name, salon.name, b.travel_min || 15))} target="_blank" rel="noreferrer"
                        onClick={() => update(b, { en_route_at: new Date().toISOString() })}><WhatsAppIcon size={16} />{b.en_route_at ? 'Avisado' : 'A caminho'}</a>}
                      {!b.started_at && <button onClick={() => update(b, { started_at: new Date().toISOString() })}>Comecei</button>}
                      {b.started_at && !b.finished_at && <button onClick={() => update(b, { finished_at: new Date().toISOString(), status: 'concluida' })}>Terminei</button>}
                    </div>
                  )}
                  {b.started_at && b.finished_at && <small className="muted"><br />Demorou {Math.round((new Date(b.finished_at).getTime() - new Date(b.started_at).getTime()) / 60000)} min (previsto {mins}).</small>}
                </div>
              )}
              {b.package_request_id && b.package_id && hourRate[b.package_id] && (b.status === 'confirmada' || b.status === 'pendente' || b.status === 'concluida') && (
                <div className="proposal">
                  <Icon name="timer" size={14} /> Espera: {b.waiting_min ?? 0} min{waitingSince[b.id] ? ' + a contar…' : ''}
                  {(b.waiting_min ?? 0) > 0 && ` · a cobrar ${euros(Math.ceil((b.waiting_min ?? 0) / 60) * hourRate[b.package_id])}`}
                  <button className="link" onClick={() => toggleWaiting(b)}>{waitingSince[b.id] ? 'Parar' : 'Começar a contar'}</button>
                </div>
              )}
              {!b.client_pack_id && (b.status === 'confirmada' || b.status === 'concluida' || b.status === 'pendente') && (() => {
                const pk = packs.find(p => p.phone_key === waNumber(b.client_phone))
                return pk && <div className="proposal">Tem um pack ({pk.sessions_total - pk.sessions_used} de {pk.sessions_total}) <button className="btn-inline" onClick={() => spendPackSession(b, pk.id)}>Usar sessão do pack</button></div>
              })()}
              {b.client_action && (
                <div style={{ marginTop: 6 }}><span className={`tag ${b.client_action === 'aceitou' ? '' : 'warn'}`}>{{
                  mudou: 'Cliente mudou a hora', cancelou: 'Cancelada pelo cliente',
                  aceitou: 'Cliente aceitou o novo horário', recusou: 'Cliente recusou o horário sugerido',
                }[b.client_action]}</span></div>
              )}
              {b.proposed_starts_at && (b.status === 'pendente' || b.status === 'confirmada') && (
                <div className="proposal">
                  Sugeriu <b>{new Date(b.proposed_starts_at).toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })} às {formatTime(new Date(b.proposed_starts_at), tz)}</b> · à espera da resposta do cliente
                  <div className="actions">
                    {hasPhone && <a className="wa" href={waLink(b.client_phone, proposalMessage(b, salon, svc?.name ?? '', new Date(b.proposed_starts_at), b.proposal_note))} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />Reenviar</a>}
                    <button className="link" onClick={() => withdraw(b)}>Retirar sugestão</button>
                  </div>
                </div>
              )}
              {isNew && (
                <div className="newclient">
                  <span><b>Cliente novo.</b> Ainda não faz parte da sua lista de clientes. Quer adicionar?</span>
                  <Link className="btn-inline" to={`/clientes?novo=${encodeURIComponent(b.client_phone)}&nome=${encodeURIComponent(b.client_name)}`}>Sim, adicionar</Link>
                  <button className="link" onClick={() => dismiss(key)}>Agora não</button>
                </div>
              )}
              {hasPhone && <div className="small" style={{ marginTop: 4 }}><a href={`tel:+${formatPhone(b.client_phone).replace(/\D/g, '')}`}>{formatPhone(b.client_phone)}</a></div>}
              {b.deposit !== 'nenhum' && (
                <div className="small" style={{ marginTop: 4 }}>Sinal: {b.deposit === 'pago'
                  ? <span className="ok" style={{ fontWeight: 600 }}>recebido ✓</span>
                  : locked ? 'por receber' : <button className="link" onClick={() => update(b, b.status === 'pendente' ? { deposit: 'pago', status: 'confirmada' } : { deposit: 'pago' })}>marcar como recebido</button>}</div>
              )}
              <div className="actions">
                {!locked && b.status === 'pendente' && <button className="btn-inline" onClick={() => update(b, { status: 'confirmada' })}>Confirmar</button>}
                {!locked && (b.status === 'pendente' || b.status === 'confirmada') && <>
                  <button onClick={() => update(b, { status: 'concluida' })}>Concluída</button>
                  <button onClick={() => update(b, { status: 'faltou' })}>Faltou</button>
                  <button onClick={() => update(b, { status: 'cancelada' })}>Cancelar</button>
                </>}
                {hasPhone && <a className="wa" href={waLink(b.client_phone, msg)} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />WhatsApp</a>}
                {!locked && <>
                {b.status === 'concluida' && nextFor !== b.id && <button onClick={() => setNextFor(b.id)}>Próxima visita</button>}
                {(b.status === 'cancelada' || b.status === 'faltou') && freeing !== b.id && usableWindow(new Date(b.starts_at), new Date(b.ends_at), new Date()) && <button className="btn-inline" onClick={() => setFreeing(b.id)}>Oferecer a vaga</button>}
                {(b.status === 'pendente' || b.status === 'confirmada') && !b.proposed_starts_at && proposing !== b.id && <button onClick={() => setProposing(b.id)}>Sugerir outro horário</button>}
                {b.status !== 'cancelada' && b.status !== 'faltou' && can(role, 'clientes') && <button onClick={() => setTrying(trying === b.id ? null : b.id)}><Icon name="camera" size={14} />Antes e depois</button>}
                {(b.status === 'pendente' || b.status === 'confirmada') && <button className="link" onClick={() => setEditing(b.id)}>Editar</button>}
                </>}
              </div>
            </div>
            {trying === b.id && (
              <AiTryOn feature="before-after" title={`Antes e depois · ${b.client_name.split(' ')[0]}`}
                intro="Tire a foto do antes e mostre ao cliente como vai ficar."
                styles={styleOptions(salon.type, [...(cardById(b.style) ? [cardById(b.style)!.name] : []), ...Object.values(services).map(s => s.name)])} initialStyle={cardById(b.style)?.name ?? svc?.name} />
            )}
            {freeing === b.id && (
              <FreeSlot salon={salon} freed={b} proName={pros[b.professional_id]?.name ?? ''} onClose={() => setFreeing(null)} onFilled={reload} />
            )}
            {proposing === b.id && (
              <ProposeTime salon={salon} booking={b} serviceName={svc?.name ?? ''} onClose={() => setProposing(null)}
                onDone={nb => setBookings(bs => bs.map(x => x.id === nb.id ? nb : x))} />
            )}
            {nextFor === b.id && svc && pros[b.professional_id] && (
              <NextVisit salon={salon} booking={b} service={svc} pro={pros[b.professional_id]}
                onClose={() => setNextFor(null)}
                onBooked={nb => { if (dateInTz(new Date(nb.starts_at), tz) === date) setBookings(bs => [...bs, nb].sort((x, y) => x.starts_at.localeCompare(y.starts_at))) }} />
            )}
          </article>
        )
      })}
      {editing !== 'nova' && !locked && <button className="btn inline fab" onClick={openNew}><Icon name="plus" size={18} />Marcação</button>}
      </>}
    </main></div>
  )
}
