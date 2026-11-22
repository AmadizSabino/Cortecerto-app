import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Icon, { WhatsAppIcon } from '../components/Icon'
import ThemePicker from '../ThemePicker'
import { summarizeHours } from '../lib/hours'
import { downloadIcs, icsEvent } from '../lib/ics'
import { euros, initials, supabase, type Professional, type Salon, type Service } from '../lib/supabase'
import { freeSlots } from '../lib/slots'
import { hoursFor, NO_HOURS, type SalonHours } from '../lib/schedule'
import { loadHours } from '../lib/scheduleData'
import { clientTheme, setClientTheme, themeById, themeStyle } from '../lib/themes'
import { addDays, dateInTz, formatTime, weekdayOf, zonedToUtc } from '../lib/time'
import { formatPhone, waLink } from '../lib/whatsapp'
import { manageLink } from '../lib/clientChanges'
import { effective, priceRange, type Overrides } from '../lib/pricing'
import { loadOverrides } from '../lib/pricingData'
import AiTryOn from '../components/AiTryOn'
import { benefitList, type Club } from '../lib/club'

const ERRORS: Record<string, string> = {
  horario_ocupado: 'Esse horário acabou de ser ocupado. Escolha outro, por favor.',
  horario_passado: 'Esse horário já passou.',
  dados_cliente: 'Indique o seu nome e um telemóvel válido.',
}
const ANY = 'qualquer'
/** Days ahead a client can book. */
const DAYS = 21
/** How often free times are checked again while the page is open. */
const REFRESH_MS = 30_000
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** The salon's Club on the booking page, with a short form to ask to join (migration 0018). */
function ClubOffer({ club, open, setOpen, form, setForm, state, onJoin }: {
  club: Club; open: boolean; setOpen: (v: boolean) => void
  form: { name: string; phone: string }; setForm: (f: { name: string; phone: string }) => void
  state?: { ok: boolean; text: string }; onJoin: () => void
}) {
  const perks = benefitList(club.benefits)
  return (
    <section className="card soft club-offer">
      <div className="between">
        <span><Icon name="crown" size={18} /> <b>{club.name}</b></span>
        <b>{euros(club.price_cents)}<small className="muted">/mês</small></b>
      </div>
      {perks.length > 0 && <ul className="small">{perks.map(p => <li key={p}>{p}</li>)}{club.no_deposit && <li>Marca sem sinal</li>}</ul>}
      {!open ? <button className="btn ghost inline sm" onClick={() => setOpen(true)}>Quero aderir</button> : state?.ok ? <p className="ok small">{state.text}</p> : (
        <form onSubmit={e => { e.preventDefault(); onJoin() }}>
          <label>Nome<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoComplete="name" /></label>
          <label>Telemóvel<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required inputMode="tel" autoComplete="tel" placeholder="912 345 678" /></label>
          <p className="muted small">Paga a mensalidade diretamente ao salão. Pode cancelar quando quiser, falando com o salão.</p>
          {state && <p className="error small">{state.text}</p>}
          <div className="actions"><button className="btn-inline">Pedir para aderir</button><button type="button" className="link" onClick={() => setOpen(false)}>Agora não</button></div>
        </form>
      )}
    </section>
  )
}

export default function BookingPage() {
  const { slug } = useParams()
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Service[]>([])
  const [pros, setPros] = useState<Professional[]>([])
  const [hours, setHours] = useState<SalonHours>(NO_HOURS)
  const [overrides, setOverrides] = useState<Overrides>({})
  const [step, setStep] = useState(1)
  const [service, setService] = useState<Service>()
  const [proId, setProId] = useState<string>()
  const [date, setDate] = useState<string>()
  const [busy, setBusy] = useState<{ professional_id: string; start: Date; end: Date }[]>([])
  const [slot, setSlot] = useState<{ start: Date; proId: string }>()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<string | null>(null) // booking id once booked
  const [myTheme, setMyTheme] = useState<string | null>(() => clientTheme(slug!))
  const [picking, setPicking] = useState(false)
  const [copied, setCopied] = useState(false)
  // Busy times change while the page is open (other clients, the salon's own bookings and time off): checked again regularly.
  const [tick, setTick] = useState(0)
  const [doneDeposit, setDoneDeposit] = useState<string | null>(null)
  const [club, setClub] = useState<Club | null>(null)
  const [joining, setJoining] = useState(() => new URLSearchParams(location.search).has('clube'))
  const [joinForm, setJoinForm] = useState({ name: '', phone: '' })
  const [joinState, setJoinState] = useState<{ ok: boolean; text: string }>()

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('salons').select('*').eq('slug', slug!).maybeSingle()
      setSalon(s)
      if (!s) return
      const [sv, pr, hr, ov, cl] = await Promise.all([
        supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', s.id).eq('active', true).order('price_cents'),
        supabase.from('professionals').select('id,name').eq('salon_id', s.id).eq('active', true).order('name'),
        loadHours(s.id),
        loadOverrides(s.id),
        supabase.from('salon_club').select('*').eq('salon_id', s.id).eq('active', true).maybeSingle(), // migration 0018
      ])
      setServices(sv.data ?? []); setPros(pr.data ?? []); setHours(hr); setOverrides(ov.overrides)
      setClub(cl.error ? null : (cl.data as Club | null))
      if (pr.data?.length === 1) setProId(pr.data[0].id)
      document.title = `${s.name} · Marcar`
      // Added to a client's home screen, this page opens the salon's booking page, not the salon panel.
      const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]')
      if (link) link.href = `/api/manifest?s=${encodeURIComponent(s.slug)}&n=${encodeURIComponent(s.name)}`
    })()
    // Leaving the page (e.g. the owner on "Ver como cliente") puts the panel's manifest back, so installing opens the panel.
    return () => { const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]'); if (link) link.href = '/manifest.webmanifest' }
  }, [slug])

  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') setTick(t => t + 1) }
    const t = setInterval(again, REFRESH_MS)
    document.addEventListener('visibilitychange', again)
    window.addEventListener('focus', again)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again) }
  }, [])

  const tz = salon?.timezone ?? 'Europe/Lisbon'
  const today = dateInTz(new Date(), tz)
  // Professionals who do the chosen service, and who could take this booking.
  const prosFor = useMemo(() => service ? pros.filter(p => effective(service, p.id, overrides)) : pros, [service, pros, overrides])
  const candidates = useMemo(() => proId === ANY ? prosFor : prosFor.filter(p => p.id === proId), [proId, prosFor])

  const openDays = useMemo(() => {
    const open = new Set<number>()
    for (const p of candidates.length ? candidates : [undefined]) for (const h of hoursFor(hours, p?.id)) open.add(h.weekday)
    return Array.from({ length: DAYS }, (_, i) => addDays(today, i)).filter(d => open.has(weekdayOf(d)))
  }, [candidates, hours, today])

  // Busy times for the whole window at once (bookings, times the salon suggested, time off), so full days can be shown as full.
  useEffect(() => {
    if (!salon) return
    const from = zonedToUtc(today, '00:00', tz), to = zonedToUtc(addDays(today, DAYS), '00:00', tz)
    supabase.rpc('busy_slots', { p_salon: salon.id, p_from: from.toISOString(), p_to: to.toISOString() })
      .then(({ data, error }) => { if (!error) setBusy((data ?? []).map((b: { professional_id: string; starts_at: string; ends_at: string }) =>
        ({ professional_id: b.professional_id, start: new Date(b.starts_at), end: new Date(b.ends_at) }))) })
  }, [salon, tz, today, tick])

  // Free times on a day for the chosen professional, or for anyone free when "Qualquer um" is picked.
  const slotsOn = useMemo(() => (day: string) => {
    if (!service) return []
    const now = new Date()
    const byTime = new Map<number, string>()
    for (const p of candidates) {
      const eff = effective(service, p.id, overrides)
      if (!eff) continue
      const free = freeSlots({ date: day, tz, hours: hoursFor(hours, p.id), durationMin: eff.duration_min, busy: busy.filter(b => b.professional_id === p.id), now })
      for (const t of free) if (!byTime.has(t.getTime())) byTime.set(t.getTime(), p.id)
    }
    return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([t, id]) => ({ start: new Date(t), proId: id }))
  }, [service, candidates, overrides, tz, hours, busy, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const fullDays = useMemo(() => new Set(service ? openDays.filter(d => slotsOn(d).length === 0) : []), [service, openDays, slotsOn])
  const slots = useMemo(() => date ? slotsOn(date) : [], [date, slotsOn])

  // Start on the first day with a free time; move off a day that just filled up.
  useEffect(() => {
    if (!openDays.length) return
    if (!date || !openDays.includes(date)) setDate(openDays.find(d => !fullDays.has(d)) ?? openDays[0])
  }, [openDays, date, fullDays])
  // The chosen time was taken in the meantime: drop it.
  useEffect(() => {
    if (done || !slot || slots.some(t => t.start.getTime() === slot.start.getTime())) return
    setSlot(undefined)
    if (step === 4) { setStep(3); setError(ERRORS.horario_ocupado) }
  }, [slots, slot, step, done])

  if (salon === undefined) return <main className="page"><p className="muted">A carregar…</p></main>
  if (salon === null) return <main className="page"><h1>Salão não encontrado</h1><p className="muted">Confirme o link com o salão.</p></main>

  const theme = themeById(myTheme ?? salon.theme)
  const chooseTheme = (id: string | null) => { setClientTheme(salon.slug, id); setMyTheme(id) }
  const proName = (id?: string) => pros.find(p => p.id === id)?.name ?? ''
  const longDate = (d: Date) => d.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
  // Price and length with the professional who will do it (or the chosen one before a time is picked).
  const eff = service ? effective(service, slot?.proId ?? (proId !== ANY ? proId : undefined), overrides) : null
  const range = (s: Service) => {
    const r = priceRange(s, pros.map(p => p.id), overrides)
    return !r || r.min === r.max ? euros(r?.min ?? s.price_cents) : `${euros(r.min)}–${euros(r.max)}`
  }
  const priceText = eff ? euros(eff.price_cents) : service ? range(service) : ''
  const skipPro = pros.length === 1

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return // a second tap must not book twice
    setError(''); setSubmitting(true)
    const { data: bookingId, error } = await supabase.rpc('create_booking', {
      p_salon: salon!.id, p_service: service!.id, p_professional: slot!.proId, p_starts_at: slot!.start.toISOString(),
      p_client_name: name, p_client_phone: phone, p_consent: consent,
    })
    setSubmitting(false)
    if (error) {
      setError(Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? 'Não foi possível marcar. Tente de novo.')
      if (error.message.includes('horario_ocupado')) { setSlot(undefined); setStep(3); setTick(t => t + 1) }
      return
    }
    // Whether a deposit is really owed (members of the Club may book without one).
    supabase.rpc('booking_for_client', { p_booking: bookingId }).then(({ data }) => setDoneDeposit((data ?? [])[0]?.deposit ?? null))
    // Emails the salon about the new booking. Best effort: the booking is already saved.
    fetch('/api/notify-booking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bookingId }), keepalive: true,
    }).catch(() => {})
    setDone(String(bookingId))
    window.scrollTo(0, 0)
  }

  function addToCalendar() {
    const end = new Date(slot!.start.getTime() + (eff?.duration_min ?? service!.duration_min) * 60000)
    downloadIcs('marcacao.ics', icsEvent({
      title: `${service!.name} · ${salon!.name}`, start: slot!.start, end,
      location: salon!.address ?? undefined,
      description: `Com ${proName(slot!.proId)}${done ? `. Cancelar ou mudar: ${manageLink(location.origin, done)}` : ''}`,
    }))
  }

  const header = (
    <>
      <div className="cover" />
      <div className="hero">
        <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'flex-start', flexWrap: 'nowrap', gap: 14 }}>
          <span className="avatar">{initials(salon.name)}</span>
          <h1 className="grow">{salon.name}</h1>
        </div>
        <div className="meta">
          {salon.address && <span><Icon name="pin" size={16} />{salon.address}</span>}
          {hours.salon.length > 0 && <span><Icon name="clock" size={16} />{summarizeHours(hours.salon)}</span>}
        </div>
        {salon.news && <div className="card soft"><b>Novidades:</b> {salon.news}</div>}
      </div>
    </>
  )

  const footer = (
    <footer className="foot">
      {picking ? <div className="stack" style={{ textAlign: 'left' }}>
        <p className="muted">Escolha um estilo só para si. O salão não vê esta escolha.</p>
        <ThemePicker value={theme.id} type={salon.type} showAll onChange={id => chooseTheme(id)} />
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          {myTheme && <button className="link" onClick={() => chooseTheme(null)}>Usar o estilo do salão</button>}
          <button className="link" onClick={() => setPicking(false)}>Feito</button>
        </div>
      </div> : <button className="link" onClick={() => setPicking(true)}>Mudar o estilo da página</button>}
      <p className="muted" style={{ marginTop: 10 }}>Feito com CorteCerto · <a href="/privacidade">Privacidade</a></p>
    </footer>
  )

  if (done) {
    const msg = `Olá! Acabei de marcar ${service!.name} com ${proName(slot!.proId)} para ${longDate(slot!.start)} às ${formatTime(slot!.start, tz)}. Nome: ${name}.`
    const manage = manageLink(location.origin, done)
    const owesDeposit = salon.deposit_cents > 0 && Boolean(salon.mbway_number) && doneDeposit !== 'nenhum'
    return (
      <div className="themed" style={themeStyle(theme)}>
        {header}
        <main className="page">
          <div className="card raised" style={{ textAlign: 'center', marginTop: 20 }}>
            <div className="done-mark"><Icon name="check" size={36} /></div>
            <h2 style={{ margin: 0 }}>Marcação feita!</h2>
            <p className="muted" style={{ margin: '6px 0 0' }}>{owesDeposit ? 'Falta só o sinal para a confirmar.' : 'Até breve!'}</p>
            <dl className="kv" style={{ textAlign: 'left', marginTop: 20 }}>
              <dt>Serviço</dt><dd>{service!.name}</dd>
              <dt>Com</dt><dd>{proName(slot!.proId)}</dd>
              <dt>Quando</dt><dd>{cap(longDate(slot!.start))}, {formatTime(slot!.start, tz)}</dd>
              {eff && <><dt>Preço</dt><dd>{euros(eff.price_cents)}</dd></>}
            </dl>
          </div>
          {owesDeposit && (
            <div className="card warn">
              <h3>Sinal de {euros(salon.deposit_cents)} por MB Way</h3>
              <p style={{ margin: '6px 0 12px' }}>Envie para o número do salão. A marcação fica confirmada quando o salão receber.</p>
              <div className="between">
                <b style={{ fontSize: '1.3rem', letterSpacing: '.04em' }}>{formatPhone(salon.mbway_number!).replace('+351 ', '')}</b>
                <button className="sm" onClick={() => { navigator.clipboard?.writeText(salon.mbway_number!); setCopied(true) }}>
                  <Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          )}
          <div className="stack" style={{ marginTop: 16 }}>
            <button className="btn ghost" onClick={addToCalendar}><Icon name="calendar" size={18} />Adicionar ao calendário</button>
            {salon.whatsapp && <a className="btn wa" href={waLink(salon.whatsapp, msg)} target="_blank" rel="noreferrer"><WhatsAppIcon />Avisar o salão por WhatsApp</a>}
          </div>
          <div className="card">
            <h3>Precisa de cancelar ou mudar?</h3>
            <p className="muted small" style={{ margin: '4px 0 8px' }}>Guarde este link. O salão também o envia no lembrete.</p>
            <p style={{ wordBreak: 'break-all', margin: 0 }}><a href={manage}>{manage.replace(/^https?:\/\//, '')}</a></p>
          </div>
          <p style={{ textAlign: 'center' }}><button className="link" onClick={() => { setDone(null); setDoneDeposit(null); setStep(1); setService(undefined); setSlot(undefined); if (!skipPro) setProId(undefined) }}>Fazer outra marcação</button></p>
          {footer}
        </main>
      </div>
    )
  }

  const canNext = (step === 1 && service) || (step === 2 && proId) || (step === 3 && slot)
  const toSteps = () => requestAnimationFrame(() => document.getElementById('steps')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  const go = (s: number) => { setStep(s); toSteps() }
  const next = () => go(step === 1 && skipPro ? 3 : step + 1)
  const back = (from: number) => go(from === 3 && skipPro ? 1 : from - 1)

  return (
    <div className="themed" style={themeStyle(theme)}>
      {header}
      <main className="page">
        {myTheme && !picking && (
          <p className="banner small" style={{ borderRadius: 12 }}>Está a ver esta página com um estilo escolhido por si. <button className="link" onClick={() => chooseTheme(null)}>Usar o estilo do salão</button></p>
        )}
        {club && (step === 1 || joining) && <ClubOffer club={club} open={joining} setOpen={setJoining} form={joinForm} setForm={setJoinForm} state={joinState}
          onJoin={async () => {
            setJoinState(undefined)
            const { error } = await supabase.rpc('join_club', { p_salon: salon.id, p_name: joinForm.name, p_phone: joinForm.phone })
            setJoinState(error
              ? { ok: false, text: error.message.includes('dados_cliente') ? 'Indique o seu nome e um telemóvel válido.' : 'Não foi possível. Tente de novo.' }
              : { ok: true, text: salon.mbway_number
                ? `Pedido enviado! Envie a primeira mensalidade (${euros(club.price_cents)}) por MB Way para ${formatPhone(salon.mbway_number).replace('+351 ', '')}. O salão ativa quando receber.`
                : 'Pedido enviado! Paga a primeira mensalidade na próxima visita.' })
          }} />}
        <div className="steps" id="steps">{[1, 2, 3, 4].map(i => <i key={i} className={i <= step ? 'done' : ''} />)}</div>

        {step === 1 && <>
          <div className="step-title"><h2>O que vai fazer?</h2></div>
          {services.length === 0 && <p className="muted">Este salão ainda não tem serviços para marcar online.</p>}
          <div className="choices">
            {services.map(s => (
              <button key={s.id} className={s.id === service?.id ? 'choice on' : 'choice'} onClick={() => {
                setService(s); setSlot(undefined)
                if (proId && proId !== ANY && !effective(s, proId, overrides) && !skipPro) setProId(undefined)
              }}>
                <span><span className="t">{s.name}</span><small>{s.duration_min} min</small></span>
                <span className="price">{range(s)}</span>
              </button>
            ))}
          </div>
          {services.length > 0 && <AiTryOn feature="try-on" salonId={salon.id} title="Experimente antes de marcar"
            intro="Tire uma selfie e veja como fica, antes e depois." styles={services.map(x => x.name)} />}
        </>}

        {step === 2 && service && <>
          <div className="step-title"><h2>Com quem?</h2><button className="link" onClick={() => back(2)}>Voltar</button></div>
          {prosFor.length === 0 && <p className="muted">De momento ninguém faz este serviço. Escolha outro.</p>}
          <div className="choices">
            {prosFor.length > 1 && (
              <button className={proId === ANY ? 'choice on' : 'choice'} onClick={() => { setProId(ANY); setSlot(undefined) }}>
                <span className="pro"><span className="avatar"><Icon name="users" /></span><span><span className="t">Qualquer um</span><small>Mais horários livres</small></span></span>
              </button>
            )}
            {prosFor.map(p => {
              const e = effective(service, p.id, overrides)!
              const differs = e.price_cents !== service.price_cents || e.duration_min !== service.duration_min
              return (
                <button key={p.id} className={p.id === proId ? 'choice on' : 'choice'} onClick={() => { setProId(p.id); setSlot(undefined) }}>
                  <span className="pro"><span className="avatar">{initials(p.name)}</span><span><span className="t">{p.name}</span>{differs && <small>{e.duration_min} min</small>}</span></span>
                  {differs && <span className="price">{euros(e.price_cents)}</span>}
                </button>
              )
            })}
          </div>
        </>}

        {step === 3 && <>
          <div className="step-title"><h2>Quando?</h2><button className="link" onClick={() => back(3)}>Voltar</button></div>
          {openDays.length === 0 && <p className="muted">Sem dias disponíveis nas próximas semanas.</p>}
          <div className="chips">
            {openDays.map(d => {
              const dt = new Date(d + 'T12:00:00Z')
              return (
                <button key={d} className={`chip${d === date ? ' on' : ''}${fullDays.has(d) ? ' full' : ''}`} onClick={() => { setDate(d); setSlot(undefined) }} aria-label={fullDays.has(d) ? `${d}: sem horários livres` : undefined}>
                  <span className="d1">{d === today ? 'Hoje' : cap(dt.toLocaleDateString('pt-PT', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''))}</span>
                  <span className="d2">{dt.getUTCDate()}</span>
                  <span className="d1">{fullDays.has(d) ? 'Cheio' : dt.toLocaleDateString('pt-PT', { month: 'short', timeZone: 'UTC' }).replace('.', '')}</span>
                </button>
              )
            })}
          </div>
          <div className="slots">
            {slots.length === 0 && date && <p className="muted" style={{ gridColumn: '1 / -1' }}>Sem horários livres neste dia.{openDays.some(d => !fullDays.has(d)) ? ' Experimente outro dia.' : ' Fale com o salão por WhatsApp.'}</p>}
            {slots.map(t => (
              <button key={t.start.getTime()} className={t.start.getTime() === slot?.start.getTime() ? 'slot on' : 'slot'} onClick={() => { setSlot(t); setError('') }}>{formatTime(t.start, tz)}</button>
            ))}
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </>}

        {step === 4 && slot && (
          <form onSubmit={submit}>
            <div className="step-title"><h2>Os seus dados</h2><button type="button" className="link" onClick={() => back(4)}>Voltar</button></div>
            <div className="card" style={{ marginTop: 0 }}>
              <dl className="kv">
                <dt>Serviço</dt><dd>{service!.name} · {priceText}</dd>
                <dt>Com</dt><dd>{proName(slot.proId)}</dd>
                <dt>Quando</dt><dd>{cap(longDate(slot.start))}, {formatTime(slot.start, tz)}</dd>
              </dl>
            </div>
            <label>Nome<input value={name} onChange={e => setName(e.target.value)} required autoComplete="name" /></label>
            <label>Telemóvel<input value={phone} onChange={e => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="912 345 678" /></label>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
              <span>Aceito receber novidades e promoções do salão por WhatsApp. <span className="muted">(opcional)</span></span>
            </label>
            <p className="muted small">O salão pode enviar-lhe um lembrete desta marcação por WhatsApp. Os seus dados são usados apenas para gerir a marcação. <a href="/privacidade" target="_blank" rel="noreferrer">Política de privacidade</a></p>
            {salon.deposit_cents > 0 && salon.mbway_number && <p className="muted small">Esta marcação pede um sinal de {euros(salon.deposit_cents)} por MB Way, a enviar a seguir.</p>}
            {error && <p className="error" role="alert">{error}</p>}
            <div className="sticky-cta"><button className="btn" style={{ marginTop: 0 }} disabled={submitting}>{submitting ? 'A marcar…' : 'Confirmar marcação'}</button></div>
          </form>
        )}

        {step < 4 && canNext && (
          <div className="sticky-cta">
            <div className="summary">
              <span className="small grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <b>{service?.name}</b>{step >= 3 && slot && <> · {formatTime(slot.start, tz)}</>} · {priceText}
              </span>
              <button onClick={next}>Continuar</button>
            </div>
          </div>
        )}
        {footer}
      </main>
    </div>
  )
}
