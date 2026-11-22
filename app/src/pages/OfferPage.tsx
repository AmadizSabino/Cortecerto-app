import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { euros, supabase } from '../lib/supabase'
import { mediaUrl } from '../lib/brand'
import { clientTheme, themeById, themeStyle } from '../lib/themes'
import { dateInTz, formatTime } from '../lib/time'
import { waLink } from '../lib/whatsapp'

/** Row returned by slot_offer_for_client (migration 0019). */
interface Offer {
  id: string; state: 'aberta' | 'ocupada' | 'expirada'; starts_at: string; ends_at: string
  salon_id: string; salon_slug: string; salon_name: string; salon_theme: string; salon_timezone: string
  salon_whatsapp: string | null; salon_logo: string | null; professional_id: string; professional_name: string
}
interface Mine { id: string; status: string; starts_at: string; ends_at: string; client_name: string; service_name: string }
interface Svc { id: string; name: string; duration_min: number; price_cents: number }

const ERRORS: Record<string, string> = {
  vaga_ocupada: 'Já alguém ficou com esta vaga. Obrigado na mesma!',
  vaga_expirada: 'Esta vaga já não está disponível.',
  nao_cabe: 'Esse serviço não cabe nesta vaga. Escolha outro.',
  ja_mais_cedo: 'A sua marcação já é antes desta vaga.',
  marcacao_fechada: 'A sua marcação já não está ativa.',
  dados_cliente: 'Indique o seu nome e um telemóvel válido.',
  horario_ocupado: 'Já alguém ficou com esta vaga. Obrigado na mesma!',
}
const errorText = (m: string) => Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? 'Não foi possível. Tente de novo.'

/**
 * /vaga/<offer>: a freed time the salon offered by WhatsApp. With ?b=<booking>,
 * a client already booked later moves to it; without, someone new books it.
 * The first to accept gets it.
 */
export default function OfferPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const bookingId = params.get('b')
  const [offer, setOffer] = useState<Offer | null>()
  const [mine, setMine] = useState<Mine | null>(null)
  const [services, setServices] = useState<Svc[]>([])
  const [serviceId, setServiceId] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<string | null>(null) // booking id

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('slot_offer_for_client', { p_offer: id })
      const o = (data ?? [])[0] as Offer | undefined
      setOffer(o ?? null)
      if (!o) return
      if (bookingId) {
        const { data: b } = await supabase.rpc('booking_for_client', { p_booking: bookingId })
        setMine(((b ?? [])[0] as Mine | undefined) ?? null)
      } else {
        const minutes = (new Date(o.ends_at).getTime() - Math.max(Date.now(), new Date(o.starts_at).getTime())) / 60000
        const { data: sv } = await supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', o.salon_id).eq('active', true).order('price_cents')
        const fit = (sv ?? []).filter(s => s.duration_min <= minutes + 0.5)
        setServices(fit); if (fit.length) setServiceId(fit[0].id)
      }
    })()
  }, [id, bookingId])

  if (offer === undefined) return <main className="page">A carregar…</main>
  if (offer === null) return <main className="page"><h1>Vaga não encontrada</h1><p className="muted">Confirme o link que recebeu.</p></main>

  const tz = offer.salon_timezone
  const theme = themeById(clientTheme(offer.salon_slug) ?? offer.salon_theme)
  const start = new Date(Math.max(new Date(offer.starts_at).getTime(), Math.ceil(Date.now() / 300000) * 300000))
  const dayText = (d: Date) => dateInTz(d, tz) === dateInTz(new Date(), tz) ? 'hoje' : d.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
  const logo = mediaUrl(offer.salon_logo)

  async function takeMove() {
    setSaving(true); setError('')
    const { error } = await supabase.rpc('take_slot_offer_move', { p_offer: id, p_booking: bookingId })
    setSaving(false)
    if (error) { setError(errorText(error.message)); return }
    fetch('/api/notify-change', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: bookingId }), keepalive: true }).catch(() => {})
    setDone(bookingId)
  }
  async function takeNew(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    const { data, error } = await supabase.rpc('take_slot_offer_new', { p_offer: id, p_service: serviceId, p_name: name, p_phone: phone, p_consent: consent })
    setSaving(false)
    if (error) { setError(errorText(error.message)); return }
    setDone(data as string)
  }

  return (
    <div className="themed" style={themeStyle(theme)}><main className="page">
      <header className="brand-head">
        {logo && <img className="brand-logo" src={logo} alt="" />}
        <p className="muted" style={{ margin: 0 }}>{offer.salon_name}</p>
      </header>

      {done ? <>
        <h1>Ficou com a vaga!</h1>
        <div className="card"><strong>{dayText(start)} às {formatTime(start, tz)}</strong><p className="muted" style={{ margin: '4px 0 0' }}>com {offer.professional_name}</p></div>
        <p><Link className="btn" to={`/m/${done}`}>Ver a minha marcação</Link></p>
      </> : offer.state !== 'aberta' ? <>
        <h1>{offer.state === 'ocupada' ? 'Esta vaga já foi ocupada' : 'Esta vaga já não está disponível'}</h1>
        <p className="muted">Obrigado pelo interesse! Pode escolher outro horário.</p>
        <p><Link className="btn" to={`/s/${offer.salon_slug}`}>Ver horários livres</Link></p>
      </> : <>
        <h1>Abriu uma vaga</h1>
        <div className="card">
          <strong style={{ fontSize: '1.2rem' }}>{dayText(start)} às {formatTime(start, tz)}</strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>com {offer.professional_name} · quem aceitar primeiro fica com ela</p>
        </div>

        {bookingId ? (mine && (mine.status === 'pendente' || mine.status === 'confirmada') ? <>
          <p>A sua marcação de <b>{mine.service_name}</b> passa de {dayText(new Date(mine.starts_at))} às {formatTime(new Date(mine.starts_at), tz)} para <b>{dayText(start)} às {formatTime(start, tz)}</b>.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button className="btn" disabled={saving} onClick={takeMove}>{saving ? 'A guardar…' : 'Sim, quero vir mais cedo'}</button>
            <Link to={`/m/${bookingId}`}>Manter a minha hora</Link>
          </div>
        </> : <p className="muted">Não encontrámos a sua marcação. <Link to={`/s/${offer.salon_slug}`}>Ver horários</Link></p>) : (
          <form className="card" onSubmit={takeNew}>
            {services.length === 0 ? <p className="muted">Nenhum serviço cabe nesta vaga.</p> : <>
              <label>Serviço
                <select value={serviceId} onChange={e => setServiceId(e.target.value)}>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name} · {s.duration_min} min · {euros(s.price_cents)}</option>)}
                </select>
              </label>
              <label>Nome<input value={name} onChange={e => setName(e.target.value)} required autoComplete="name" /></label>
              <label>Telemóvel<input value={phone} onChange={e => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="912 345 678" /></label>
              <label className="check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Aceito receber novidades, vagas e promoções do salão por WhatsApp (opcional)</label>
              {error && <p className="error" role="alert">{error}</p>}
              <button className="btn" disabled={saving}>{saving ? 'A marcar…' : 'Ficar com a vaga'}</button>
            </>}
          </form>
        )}
        {offer.salon_whatsapp && <p className="muted small"><a href={waLink(offer.salon_whatsapp, `Olá! Vi a vaga de ${dayText(start)} às ${formatTime(start, tz)}.`)} target="_blank" rel="noreferrer">Falar com o salão</a></p>}
      </>}
    </main></div>
  )
}
