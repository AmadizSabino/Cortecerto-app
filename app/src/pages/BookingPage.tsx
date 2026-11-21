import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { euros, supabase, type Professional, type Salon, type Service } from '../lib/supabase'
import { freeSlots } from '../lib/slots'
import { hoursFor, NO_HOURS, type SalonHours } from '../lib/schedule'
import { loadHours } from '../lib/scheduleData'
import ThemePicker from '../ThemePicker'
import { clientTheme, setClientTheme, themeById, themeStyle } from '../lib/themes'
import { addDays, dateInTz, formatTime, zonedToUtc } from '../lib/time'
import { manageLink } from '../lib/clientChanges'
import { effective, priceRange, type Overrides } from '../lib/pricing'
import { loadOverrides } from '../lib/pricingData'

const ERRORS: Record<string, string> = {
  horario_ocupado: 'Esse horário acabou de ser ocupado. Escolha outro, por favor.',
  horario_passado: 'Esse horário já passou.',
  dados_cliente: 'Indique o seu nome e um telemóvel válido.',
}

export default function BookingPage() {
  const { slug } = useParams()
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Service[]>([])
  const [pros, setPros] = useState<Professional[]>([])
  const [hours, setHours] = useState<SalonHours>(NO_HOURS)
  const [service, setService] = useState<Service>()
  const [pro, setPro] = useState<Professional>()
  const [date, setDate] = useState(() => dateInTz(new Date(), 'Europe/Lisbon'))
  const [busy, setBusy] = useState<{ start: Date; end: Date }[]>([])
  const [slot, setSlot] = useState<Date>()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null) // booking id once booked
  const [myTheme, setMyTheme] = useState<string | null>(() => clientTheme(slug!))
  const [picking, setPicking] = useState(false)
  const [overrides, setOverrides] = useState<Overrides>({})

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('salons').select('*').eq('slug', slug!).maybeSingle()
      setSalon(s)
      if (!s) return
      const [sv, pr, hr, ov] = await Promise.all([
        supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', s.id).eq('active', true).order('name'),
        supabase.from('professionals').select('id,name').eq('salon_id', s.id).eq('active', true).order('name'),
        loadHours(s.id),
        loadOverrides(s.id),
      ])
      setServices(sv.data ?? []); setPros(pr.data ?? []); setHours(hr); setOverrides(ov.overrides)
      if (pr.data?.length === 1) setPro(pr.data[0])
    })()
  }, [slug])

  useEffect(() => {
    if (!salon || !pro) return
    const from = zonedToUtc(date, '00:00', salon.timezone)
    const to = zonedToUtc(addDays(date, 1), '00:00', salon.timezone)
    supabase.rpc('busy_slots', { p_salon: salon.id, p_from: from.toISOString(), p_to: to.toISOString() })
      .then(({ data }) => setBusy((data ?? [])
        .filter((b: { professional_id: string }) => b.professional_id === pro.id)
        .map((b: { starts_at: string; ends_at: string }) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) }))))
  }, [salon, pro, date])

  // Price and length for the chosen service with the chosen professional.
  const eff = service ? effective(service, pro?.id, overrides) : null
  const slots = useMemo(() => salon && service && pro && eff
    ? freeSlots({ date, tz: salon.timezone, hours: hoursFor(hours, pro.id), durationMin: eff.duration_min, busy, now: new Date() })
    : [], [salon, service, pro, eff?.duration_min, date, hours, busy]) // eslint-disable-line react-hooks/exhaustive-deps
  // Professionals who do the chosen service.
  const prosFor = service ? pros.filter(p => effective(service, p.id, overrides)) : pros

  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <main className="page"><h1>Salão não encontrado</h1></main>

  const tz = salon.timezone
  const days = Array.from({ length: 14 }, (_, i) => addDays(dateInTz(new Date(), tz), i))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const { data: bookingId, error } = await supabase.rpc('create_booking', {
      p_salon: salon!.id, p_service: service!.id, p_professional: pro!.id, p_starts_at: slot!.toISOString(),
      p_client_name: name, p_client_phone: phone, p_consent: consent,
    })
    if (error) {
      setError(Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? 'Não foi possível marcar. Tente de novo.')
      if (error.message.includes('horario_ocupado')) setSlot(undefined)
      return
    }
    // Emails the salon about the new booking. Best effort: the booking is already saved.
    fetch('/api/notify-booking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bookingId }), keepalive: true,
    }).catch(() => {})
    setDone(String(bookingId))
  }

  const theme = themeById(myTheme ?? salon.theme)
  const chooseTheme = (id: string | null) => { setClientTheme(salon.slug, id); setMyTheme(id) }

  if (done) return (
    <div className="themed" style={themeStyle(theme)}><main className="page">
      <h1>Marcação recebida ✂️</h1>
      <p>{service!.name} com {pro!.name}, {new Date(slot!).toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })} às {formatTime(slot!, tz)}{eff && <> · {euros(eff.price_cents)}</>}.</p>
      {salon.deposit_cents > 0 && salon.mbway_number && (
        <div className="card">
          <strong>Sinal de {euros(salon.deposit_cents)} por MB Way</strong>
          <p>Envie para <b>{salon.mbway_number}</b>. O salão confirma a marcação quando receber.</p>
        </div>
      )}
      <div className="card">
        <strong>Precisa de cancelar ou mudar?</strong>
        <p className="muted">Guarde este link. O salão também o envia no lembrete.</p>
        <p className="link-box"><a href={manageLink(location.origin, done)}>{manageLink(location.origin, done)}</a></p>
      </div>
    </main></div>
  )

  return (
    <div className="themed" style={themeStyle(theme)}><main className="page">
      <h1>{salon.name}</h1>

      <h2>1. Serviço</h2>
      <div className="choices">
        {services.map(s => (
          <button key={s.id} className={s.id === service?.id ? 'choice on' : 'choice'} onClick={() => { setService(s); setSlot(undefined); if (pro && !effective(s, pro.id, overrides)) setPro(undefined) }}>
            <span>{s.name}</span><small>{s.duration_min} min · {(() => {
              const r = priceRange(s, pros.map(p => p.id), overrides)
              return !r || r.min === r.max ? euros(r?.min ?? s.price_cents) : `${euros(r.min)}–${euros(r.max)}`
            })()}</small>
          </button>
        ))}
      </div>

      {service && <>
        <h2>2. Profissional</h2>
        {prosFor.length === 0 && <p className="muted">De momento ninguém faz este serviço. Escolha outro.</p>}
        <div className="choices">
          {prosFor.map(p => {
            const e = effective(service, p.id, overrides)!
            const differs = e.price_cents !== service.price_cents || e.duration_min !== service.duration_min
            return (
              <button key={p.id} className={p.id === pro?.id ? 'choice on' : 'choice'} onClick={() => { setPro(p); setSlot(undefined) }}>
                <span>{p.name}</span>{differs && <small>{e.duration_min} min · {euros(e.price_cents)}</small>}
              </button>
            )
          })}
        </div>
      </>}

      {service && pro && <>
        <h2>3. Dia e hora</h2>
        <div className="days">
          {days.map(d => (
            <button key={d} className={d === date ? 'day on' : 'day'} onClick={() => { setDate(d); setSlot(undefined) }}>
              {new Date(d + 'T12:00:00Z').toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric' })}
            </button>
          ))}
        </div>
        <div className="slots">
          {slots.length === 0 && <p className="muted">Sem horários livres neste dia.</p>}
          {slots.map(t => (
            <button key={t.getTime()} className={t.getTime() === slot?.getTime() ? 'slot on' : 'slot'} onClick={() => setSlot(t)}>{formatTime(t, tz)}</button>
          ))}
        </div>
      </>}

      {slot && (
        <form onSubmit={submit} className="card">
          <h2>4. Os seus dados</h2>
          <label>Nome<input value={name} onChange={e => setName(e.target.value)} required autoComplete="name" /></label>
          <label>Telemóvel<input value={phone} onChange={e => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" /></label>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            Aceito receber novidades e promoções do salão por WhatsApp (opcional).
          </label>
          <p className="muted small">O salão pode enviar-lhe um lembrete desta marcação por WhatsApp. Os seus dados são usados apenas para gerir a marcação. <a href="/privacidade" target="_blank" rel="noreferrer">Política de privacidade</a></p>
          {salon.deposit_cents > 0 && <p className="muted">Esta marcação pede um sinal de {euros(salon.deposit_cents)} por MB Way.</p>}
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit">Confirmar marcação</button>
        </form>
      )}

      <footer className="foot">
        {picking ? <>
          <p className="muted">Escolha um estilo só para si. O salão não vê esta escolha.</p>
          <ThemePicker value={theme.id} type={salon.type} showAll onChange={id => chooseTheme(id)} />
          <p className="row">
            {myTheme && <button className="link" onClick={() => chooseTheme(null)}>Usar o estilo do salão</button>}
            <button className="link" onClick={() => setPicking(false)}>Feito</button>
          </p>
        </> : <button className="link" onClick={() => setPicking(true)}>Mudar o estilo da página</button>}
        <p className="muted">Feito com CorteCerto · <a href="/privacidade">Privacidade</a></p>
      </footer>
    </main></div>
  )
}
