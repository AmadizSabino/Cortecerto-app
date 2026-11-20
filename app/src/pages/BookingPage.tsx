import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Icon, { WhatsAppIcon } from '../components/Icon'
import ThemePicker from '../ThemePicker'
import { summarizeHours } from '../lib/hours'
import { downloadIcs, icsEvent } from '../lib/ics'
import { freeSlots, type OpeningHours } from '../lib/slots'
import { euros, initials, supabase, type Professional, type Salon, type Service } from '../lib/supabase'
import { clientTheme, setClientTheme, themeById, themeStyle } from '../lib/themes'
import { addDays, dateInTz, formatTime, weekdayOf, zonedToUtc } from '../lib/time'
import { formatPhone, waLink } from '../lib/whatsapp'

const ERRORS: Record<string, string> = {
  horario_ocupado: 'Esse horário acabou de ser ocupado. Escolha outro, por favor.',
  horario_passado: 'Esse horário já passou.',
  dados_cliente: 'Indique o seu nome e um telemóvel válido.',
}
const ANY = 'qualquer'

export default function BookingPage() {
  const { slug } = useParams()
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Service[]>([])
  const [pros, setPros] = useState<Professional[]>([])
  const [hours, setHours] = useState<OpeningHours[]>([])
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
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [myTheme, setMyTheme] = useState<string | null>(() => clientTheme(slug!))
  const [picking, setPicking] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('salons').select('*').eq('slug', slug!).maybeSingle()
      setSalon(s)
      if (!s) return
      const [sv, pr, hr] = await Promise.all([
        supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', s.id).eq('active', true).order('price_cents'),
        supabase.from('professionals').select('id,name').eq('salon_id', s.id).eq('active', true).order('name'),
        supabase.from('opening_hours').select('weekday,opens,closes').eq('salon_id', s.id),
      ])
      setServices(sv.data ?? []); setPros(pr.data ?? []); setHours(hr.data ?? [])
      document.title = `${s.name} · Marcar`
    })()
  }, [slug])

  const tz = salon?.timezone ?? 'Europe/Lisbon'
  const today = dateInTz(new Date(), tz)
  const openDays = useMemo(() => {
    const open = new Set(hours.map(h => h.weekday))
    return Array.from({ length: 21 }, (_, i) => addDays(today, i)).filter(d => open.has(weekdayOf(d)))
  }, [hours, today])

  useEffect(() => { if (!date && openDays.length) setDate(openDays[0]) }, [openDays, date])

  useEffect(() => {
    if (!salon || !date) return
    const from = zonedToUtc(date, '00:00', tz), to = zonedToUtc(addDays(date, 1), '00:00', tz)
    supabase.rpc('busy_slots', { p_salon: salon.id, p_from: from.toISOString(), p_to: to.toISOString() })
      .then(({ data }) => setBusy((data ?? []).map((b: { professional_id: string; starts_at: string; ends_at: string }) =>
        ({ professional_id: b.professional_id, start: new Date(b.starts_at), end: new Date(b.ends_at) }))))
  }, [salon, date, tz])

  // Free times for the chosen professional, or for anyone free when "Qualquer um" is picked.
  const slots = useMemo(() => {
    if (!salon || !service || !proId || !date) return []
    const candidates = proId === ANY ? pros : pros.filter(p => p.id === proId)
    const byTime = new Map<number, string>()
    for (const p of candidates) {
      for (const t of freeSlots({ date, tz, hours, durationMin: service.duration_min, busy: busy.filter(b => b.professional_id === p.id), now: new Date() })) {
        if (!byTime.has(t.getTime())) byTime.set(t.getTime(), p.id)
      }
    }
    return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([t, id]) => ({ start: new Date(t), proId: id }))
  }, [salon, service, proId, date, pros, hours, busy, tz])

  if (salon === undefined) return <main className="page"><p className="muted">A carregar…</p></main>
  if (salon === null) return <main className="page"><h1>Salão não encontrado</h1><p className="muted">Confirme o link com o salão.</p></main>

  const theme = themeById(myTheme ?? salon.theme)
  const chooseTheme = (id: string | null) => { setClientTheme(salon.slug, id); setMyTheme(id) }
  const proName = (id?: string) => pros.find(p => p.id === id)?.name ?? ''
  const longDate = (d: Date) => d.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSending(true)
    const { error } = await supabase.rpc('create_booking', {
      p_salon: salon!.id, p_service: service!.id, p_professional: slot!.proId, p_starts_at: slot!.start.toISOString(),
      p_client_name: name, p_client_phone: phone, p_consent: consent,
    })
    setSending(false)
    if (error) {
      setError(Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? 'Não foi possível marcar. Tente de novo.')
      if (error.message.includes('horario_ocupado')) { setSlot(undefined); setStep(3) }
      return
    }
    setDone(true)
    window.scrollTo(0, 0)
  }

  function addToCalendar() {
    const end = new Date(slot!.start.getTime() + service!.duration_min * 60000)
    downloadIcs('marcacao.ics', icsEvent({
      title: `${service!.name} · ${salon!.name}`, start: slot!.start, end,
      location: salon!.address ?? undefined, description: `Com ${proName(slot!.proId)}`,
    }))
  }

  const header = (
    <>
      <div className="cover" />
      <div className="hero">
        <div className="row" style={{ alignItems: 'flex-end', gap: 14 }}>
          <span className="avatar">{initials(salon.name)}</span>
          <h1 className="grow" style={{ paddingBottom: 6 }}>{salon.name}</h1>
        </div>
        <div className="meta">
          {salon.address && <span><Icon name="pin" size={16} />{salon.address}</span>}
          {hours.length > 0 && <span><Icon name="clock" size={16} />{summarizeHours(hours)}</span>}
        </div>
        {salon.news && <div className="card soft" style={{ marginTop: 16 }}><b>Novidades:</b> {salon.news}</div>}
      </div>
    </>
  )

  if (done) {
    const msg = `Olá! Acabei de marcar ${service!.name} com ${proName(slot!.proId)} para ${longDate(slot!.start)} às ${formatTime(slot!.start, tz)}. Nome: ${name}.`
    return (
      <div className="themed" style={themeStyle(theme)}>
        {header}
        <main className="page">
          <div className="card raised" style={{ textAlign: 'center' }}>
            <div className="done-mark"><Icon name="check" size={36} /></div>
            <h2>Marcação feita!</h2>
            <p className="muted">{salon.deposit_cents > 0 ? 'Falta só o sinal para a confirmar.' : 'Até breve!'}</p>
            <dl className="kv" style={{ textAlign: 'left', margin: '20px 0 0' }}>
              <dt>Serviço</dt><dd>{service!.name}</dd>
              <dt>Com</dt><dd>{proName(slot!.proId)}</dd>
              <dt>Quando</dt><dd>{cap(longDate(slot!.start))}, {formatTime(slot!.start, tz)}</dd>
              <dt>Preço</dt><dd>{euros(service!.price_cents)}</dd>
            </dl>
          </div>
          {salon.deposit_cents > 0 && salon.mbway_number && (
            <div className="card warn" style={{ marginTop: 12 }}>
              <h3>Sinal de {euros(salon.deposit_cents)} por MB Way</h3>
              <p style={{ margin: '6px 0 12px' }}>Envie para o número do salão. A marcação fica confirmada quando o salão receber.</p>
              <div className="between">
                <b style={{ fontSize: '1.3rem', letterSpacing: '.04em' }}>{formatPhone(salon.mbway_number).replace('+351 ', '')}</b>
                <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(salon.mbway_number!); setCopied(true) }}>
                  <Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          )}
          <div className="stack" style={{ marginTop: 16 }}>
            <button className="btn block" onClick={addToCalendar}><Icon name="calendar" size={18} />Adicionar ao calendário</button>
            {salon.whatsapp && <a className="btn wa block" href={waLink(salon.whatsapp, msg)} target="_blank" rel="noreferrer"><WhatsAppIcon />Avisar o salão por WhatsApp</a>}
            <button className="link" onClick={() => { setDone(false); setStep(1); setService(undefined); setSlot(undefined) }}>Fazer outra marcação</button>
          </div>
          <p className="foot muted">Feito com CorteCerto</p>
        </main>
      </div>
    )
  }

  const canNext = (step === 1 && service) || (step === 2 && proId) || (step === 3 && slot)
  const toSteps = () => requestAnimationFrame(() => document.getElementById('steps')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  const next = () => { setStep(step + 1); toSteps() }

  return (
    <div className="themed" style={themeStyle(theme)}>
      {header}
      <main className="page">
        <div className="progress" id="steps" style={{ scrollMarginTop: 16 }}>{[1, 2, 3, 4].map(i => <i key={i} className={i <= step ? 'done' : ''} />)}</div>

        {step === 1 && <>
          <div className="step-title"><h2>O que vai fazer?</h2></div>
          <div className="choices">
            {services.map(s => (
              <button key={s.id} className={s.id === service?.id ? 'choice on' : 'choice'} onClick={() => { setService(s); setSlot(undefined) }}>
                <span><span className="t">{s.name}</span><small>{s.duration_min} min</small></span>
                <span className="price">{euros(s.price_cents)}</span>
              </button>
            ))}
          </div>
        </>}

        {step === 2 && <>
          <div className="step-title"><h2>Com quem?</h2><button className="link" onClick={() => setStep(1)}>Voltar</button></div>
          <div className="choices">
            {pros.length > 1 && (
              <button className={proId === ANY ? 'choice on' : 'choice'} onClick={() => { setProId(ANY); setSlot(undefined) }}>
                <span className="pro"><span className="avatar" style={{ width: 44, height: 44 }}><Icon name="users" /></span><span><span className="t">Qualquer um</span><small>Mais horários livres</small></span></span>
              </button>
            )}
            {pros.map(p => (
              <button key={p.id} className={p.id === proId ? 'choice on' : 'choice'} onClick={() => { setProId(p.id); setSlot(undefined) }}>
                <span className="pro"><span className="avatar" style={{ width: 44, height: 44 }}>{initials(p.name)}</span><span className="t">{p.name}</span></span>
              </button>
            ))}
          </div>
        </>}

        {step === 3 && <>
          <div className="step-title"><h2>Quando?</h2><button className="link" onClick={() => setStep(2)}>Voltar</button></div>
          <div className="chips">
            {openDays.map(d => {
              const dt = new Date(d + 'T12:00:00Z')
              return (
                <button key={d} className={d === date ? 'chip on' : 'chip'} onClick={() => { setDate(d); setSlot(undefined) }}>
                  <span className="d1">{d === today ? 'Hoje' : dt.toLocaleDateString('pt-PT', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')}</span>
                  <span className="d2">{dt.getUTCDate()}</span>
                  <span className="d1">{dt.toLocaleDateString('pt-PT', { month: 'short', timeZone: 'UTC' }).replace('.', '')}</span>
                </button>
              )
            })}
          </div>
          <div className="slots" style={{ marginTop: 14 }}>
            {slots.length === 0 && <p className="muted" style={{ gridColumn: '1 / -1' }}>Sem horários livres neste dia. Experimente outro dia.</p>}
            {slots.map(t => (
              <button key={t.start.getTime()} className={t.start.getTime() === slot?.start.getTime() ? 'slot on' : 'slot'} onClick={() => setSlot(t)}>{formatTime(t.start, tz)}</button>
            ))}
          </div>
        </>}

        {step === 4 && (
          <form onSubmit={submit}>
            <div className="step-title"><h2>Os seus dados</h2><button type="button" className="link" onClick={() => setStep(3)}>Voltar</button></div>
            <div className="card">
              <dl className="kv">
                <dt>Serviço</dt><dd>{service!.name} · {euros(service!.price_cents)}</dd>
                <dt>Com</dt><dd>{proName(slot!.proId)}</dd>
                <dt>Quando</dt><dd>{cap(longDate(slot!.start))}, {formatTime(slot!.start, tz)}</dd>
              </dl>
            </div>
            <label>Nome<input value={name} onChange={e => setName(e.target.value)} required autoComplete="name" /></label>
            <label>Telemóvel<input value={phone} onChange={e => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="912 345 678" /></label>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
              <span>Aceito receber lembretes e novidades do salão por WhatsApp. <span className="muted">(opcional)</span></span>
            </label>
            {salon.deposit_cents > 0 && <p className="muted small">Esta marcação pede um sinal de {euros(salon.deposit_cents)} por MB Way, a enviar a seguir.</p>}
            {error && <p className="error">{error}</p>}
            <div className="sticky-cta"><button className="btn primary block" disabled={sending}>{sending ? 'A marcar…' : 'Confirmar marcação'}</button></div>
          </form>
        )}

        {step < 4 && canNext && (
          <div className="sticky-cta">
            <div className="summary">
              <span className="small grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <b>{service?.name}</b>{step >= 3 && slot && <> · {formatTime(slot.start, tz)}</>} · {euros(service!.price_cents)}
              </span>
              <button className="btn" onClick={next}>Continuar</button>
            </div>
          </div>
        )}

        <footer className="foot">
          {picking ? <div className="stack" style={{ textAlign: 'left' }}>
            <p className="muted">Escolha um estilo só para si. O salão não vê esta escolha.</p>
            <ThemePicker value={theme.id} type={salon.type} showAll onChange={id => chooseTheme(id)} />
            <div className="row">
              {myTheme && <button className="link" onClick={() => chooseTheme(null)}>Usar o estilo do salão</button>}
              <button className="link" onClick={() => setPicking(false)}>Feito</button>
            </div>
          </div> : <button className="link" onClick={() => setPicking(true)}>Mudar o estilo da página</button>}
          <p className="muted" style={{ marginTop: 10 }}>Feito com CorteCerto</p>
        </footer>
      </main>
    </div>
  )
}
