import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import ThemePicker from '../ThemePicker'
import { TYPE_DEFAULT } from '../lib/themes'
import { parseEuros, SALON_TYPES, slugify, SUGGESTED_SERVICES, WEEKDAYS, type SalonType } from '../lib/onboarding'

interface ServiceRow { name: string; duration: string; price: string }
interface DayRow { open: boolean; opens: string; closes: string }

const ERRORS: Record<string, string> = {
  slug_ocupado: 'Esse link já está a ser usado por outro salão. Escolha outro.',
  ja_tem_salao: 'Esta conta já tem um salão.',
}

const toRows = (t: SalonType): ServiceRow[] =>
  SUGGESTED_SERVICES[t].map(s => ({ name: s.name, duration: String(s.duration_min), price: (s.price_cents / 100).toFixed(2).replace('.', ',') }))

export default function OnboardingPage() {
  const nav = useNavigate()
  const [session, setSession] = useState<Session | null>()
  const [step, setStep] = useState(1)
  const [type, setType] = useState<SalonType>('barbearia')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [services, setServices] = useState<ServiceRow[]>(toRows('barbearia'))
  const [team, setTeam] = useState<string[]>([''])
  const [days, setDays] = useState<DayRow[]>(WEEKDAYS.map((_, i) => ({ open: i >= 2, opens: '09:00', closes: i === 6 ? '14:00' : '19:00' })))
  const [whatsapp, setWhatsapp] = useState('')
  const [mbway, setMbway] = useState('')
  const [deposit, setDeposit] = useState('0')
  const [theme, setTheme] = useState(TYPE_DEFAULT.barbearia)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />

  function pickType(t: SalonType) { setType(t); setServices(toRows(t)); setTheme(TYPE_DEFAULT[t]) }
  const setSvc = (i: number, patch: Partial<ServiceRow>) => setServices(s => s.map((r, j) => j === i ? { ...r, ...patch } : r))
  const setDay = (i: number, patch: Partial<DayRow>) => setDays(d => d.map((r, j) => j === i ? { ...r, ...patch } : r))

  function validate(): string {
    if (step === 1 && (!name.trim() || !/^[a-z0-9-]{3,40}$/.test(slug))) return 'Indique o nome do salão e um link com pelo menos 3 letras.'
    if (step === 2) {
      const rows = services.filter(s => s.name.trim())
      if (rows.length === 0) return 'Adicione pelo menos um serviço.'
      if (rows.some(s => isNaN(parseEuros(s.price)) || !(Number(s.duration) >= 5))) return 'Verifique o preço e a duração (mínimo 5 min) de cada serviço.'
    }
    if (step === 3) {
      if (!team.some(t => t.trim())) return 'Adicione pelo menos um profissional.'
      if (!days.some(d => d.open)) return 'Escolha pelo menos um dia aberto.'
      if (days.some(d => d.open && d.closes <= d.opens)) return 'A hora de fecho tem de ser depois da abertura.'
    }
    if (step === 4 && isNaN(parseEuros(deposit))) return 'Valor do sinal inválido.'
    if (step === 4 && parseEuros(deposit) > 0 && mbway.replace(/\D/g, '').length < 9) return 'Para pedir sinal, indique o número MB Way do salão.'
    return ''
  }

  async function next(e: React.FormEvent) {
    e.preventDefault()
    const v = validate()
    setError(v)
    if (v) return
    if (step < 4) { setStep(step + 1); return }
    setSaving(true)
    const { error } = await supabase.rpc('create_salon', {
      p: {
        slug, name: name.trim(), type, whatsapp: whatsapp.replace(/\D/g, ''), mbway_number: mbway.replace(/\D/g, ''),
        deposit_cents: parseEuros(deposit), theme,
        services: services.filter(s => s.name.trim()).map(s => ({ name: s.name.trim(), duration_min: Number(s.duration), price_cents: parseEuros(s.price) })),
        professionals: team.map(t => t.trim()).filter(Boolean),
        hours: days.flatMap((d, i) => d.open ? [{ weekday: i, opens: d.opens, closes: d.closes }] : []),
      },
    })
    setSaving(false)
    if (error) {
      setError(Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? 'Não foi possível guardar. Tente de novo.')
      if (error.message.includes('slug_ocupado')) setStep(1)
      return
    }
    nav('/painel', { replace: true })
  }

  return (
    <main className="page">
      <p className="muted">Passo {step} de 4</p>
      <form onSubmit={next}>
        {step === 1 && <>
          <h1>O seu salão</h1>
          <div className="choices two">
            {SALON_TYPES.map(t => (
              <button type="button" key={t.id} className={t.id === type ? 'choice on' : 'choice'} onClick={() => pickType(t.id)}>{t.label}</button>
            ))}
          </div>
          <label>Nome do salão
            <input value={name} required onChange={e => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }} />
          </label>
          <label>Link de marcação
            <span className="prefix"><span className="muted">{location.host}/s/</span>
              <input value={slug} onChange={e => { setSlugTouched(true); setSlug(slugify(e.target.value)) }} /></span>
          </label>
          <h2>Estilo da página</h2>
          <p className="muted">Pode mudar mais tarde. Os clientes também podem escolher outro estilo só para eles.</p>
          <ThemePicker value={theme} type={type} onChange={setTheme} />
        </>}

        {step === 2 && <>
          <h1>Serviços e preços</h1>
          <p className="muted">São sugestões. Ajuste nomes, duração e preços ao seu salão.</p>
          {services.map((s, i) => (
            <div key={i} className="card svc-row">
              <input aria-label="Serviço" placeholder="Serviço" value={s.name} onChange={e => setSvc(i, { name: e.target.value })} />
              <label>Min<input inputMode="numeric" value={s.duration} onChange={e => setSvc(i, { duration: e.target.value })} /></label>
              <label>€<input inputMode="decimal" value={s.price} onChange={e => setSvc(i, { price: e.target.value })} /></label>
              <button type="button" className="link" onClick={() => setServices(r => r.filter((_, j) => j !== i))}>Remover</button>
            </div>
          ))}
          <button type="button" className="btn sm" onClick={() => setServices(r => [...r, { name: '', duration: '30', price: '' }])}>+ Adicionar serviço</button>
        </>}

        {step === 3 && <>
          <h1>Equipa e horário</h1>
          <h2>Profissionais</h2>
          {team.map((t, i) => (
            <div key={i} className="row">
              <input aria-label="Nome do profissional" placeholder="Nome" value={t} onChange={e => setTeam(x => x.map((v, j) => j === i ? e.target.value : v))} style={{ flex: 1 }} />
              {team.length > 1 && <button type="button" className="link" onClick={() => setTeam(x => x.filter((_, j) => j !== i))}>Remover</button>}
            </div>
          ))}
          <button type="button" className="btn sm" onClick={() => setTeam(x => [...x, ''])} style={{ marginTop: 8 }}>+ Adicionar profissional</button>
          <h2>Horário</h2>
          {days.map((d, i) => (
            <div key={i} className="row day-row">
              <label className="check"><input type="checkbox" checked={d.open} onChange={e => setDay(i, { open: e.target.checked })} />{WEEKDAYS[i]}</label>
              {d.open ? <span className="row">
                <input type="time" aria-label="Abre" value={d.opens} onChange={e => setDay(i, { opens: e.target.value })} />
                <input type="time" aria-label="Fecha" value={d.closes} onChange={e => setDay(i, { closes: e.target.value })} />
              </span> : <span className="muted">Fechado</span>}
            </div>
          ))}
        </>}

        {step === 4 && <>
          <h1>Contactos e sinal</h1>
          <label>WhatsApp do salão<input inputMode="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="912 345 678" /></label>
          <label>Sinal por marcação (€, 0 para não pedir)<input inputMode="decimal" value={deposit} onChange={e => setDeposit(e.target.value)} /></label>
          <label>Número MB Way para receber o sinal<input inputMode="tel" value={mbway} onChange={e => setMbway(e.target.value)} placeholder="912 345 678" /></label>
          <p className="muted">O sinal vai diretamente para o MB Way do salão. A CorteCerto nunca recebe dinheiro dos clientes.</p>
        </>}

        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={saving}>{step < 4 ? 'Continuar' : saving ? 'A guardar…' : 'Criar salão'}</button>
        {step > 1 && <button type="button" className="link back" onClick={() => { setError(''); setStep(step - 1) }}>Voltar</button>}
      </form>
    </main>
  )
}
