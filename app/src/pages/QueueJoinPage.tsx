import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, type Salon } from '../lib/supabase'
import { estimateWait, savedPlace, savePlace, waitText } from '../lib/queue'
import { clientTheme, themeById, themeStyle } from '../lib/themes'

interface Status {
  status: 'espera' | 'chamado' | 'atendido' | 'saiu'; ahead: number; client_name: string
  queue_open: boolean; avg_minutes: number; professionals: number
}

const ERRORS: Record<string, string> = {
  fila_fechada: 'A fila está fechada de momento.',
  dados_cliente: 'Indique o seu nome e um telemóvel válido.',
}

/** Public page behind the queue QR code: /f/<salon slug>. */
export default function QueueJoinPage() {
  const { slug } = useParams()
  const [salon, setSalon] = useState<(Salon & { queue_open?: boolean }) | null>()
  const [length, setLength] = useState<number | null>(null)
  const [place, setPlace] = useState<string | null>(() => savedPlace(slug!))
  const [status, setStatus] = useState<Status | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('salons').select('*').eq('slug', slug!).maybeSingle().then(({ data }) => setSalon(data))
  }, [slug])

  const refresh = useCallback(async () => {
    if (!salon) return
    if (place) {
      const { data } = await supabase.rpc('queue_status', { p_walkin: place })
      const row = (data ?? [])[0] as Status | undefined
      if (!row || row.status === 'atendido' || row.status === 'saiu') { savePlace(slug!, null); setPlace(null); setStatus(null) }
      else setStatus(row)
    } else {
      const { data, error } = await supabase.rpc('queue_length', { p_salon: salon.id })
      setLength(error ? null : (data as number))
    }
  }, [salon, place, slug])

  // Refresh every 15 seconds while the page is open.
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 15000)
    return () => clearInterval(t)
  }, [refresh])

  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <main className="page"><h1>Salão não encontrado</h1></main>

  const theme = themeById(clientTheme(salon.slug) ?? salon.theme)
  const available = 'queue_open' in salon

  async function join(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const { data, error } = await supabase.rpc('join_queue', { p_salon: salon!.id, p_name: name, p_phone: phone, p_consent: consent })
    setSaving(false)
    if (error) { setError(Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? 'Não foi possível entrar na fila. Tente de novo.'); return }
    savePlace(slug!, String(data)); setPlace(String(data))
  }

  async function leave() {
    if (!place) return
    await supabase.rpc('leave_queue', { p_walkin: place })
    savePlace(slug!, null); setPlace(null); setStatus(null)
  }

  return (
    <div className="themed" style={themeStyle(theme)}><main className="page">
      <p className="muted">{salon.name}</p>
      <h1>Fila de espera</h1>

      {!available && <p>A fila online ainda não está disponível neste salão.</p>}

      {available && place && status && (status.status === 'chamado' ? (
        <div className="card queue-turn">
          <h2>É a sua vez, {status.client_name.split(' ')[0]}!</h2>
          <p>Dirija-se ao balcão.</p>
        </div>
      ) : (
        <div className="card queue-place">
          <p className="queue-big">{status.ahead === 0 ? 'É o próximo' : status.ahead}</p>
          {status.ahead > 0 && <p>{status.ahead === 1 ? 'pessoa à sua frente' : 'pessoas à sua frente'}</p>}
          {status.ahead > 0 && <p className="muted">Espera {waitText(estimateWait(status.ahead, status.avg_minutes, status.professionals))}</p>}
          <p className="muted small">Esta página atualiza sozinha. O salão avisa-o por WhatsApp quando estiver quase.</p>
          <button className="link" onClick={leave}>Sair da fila</button>
        </div>
      ))}

      {available && !place && (salon.queue_open ? (
        <form className="card" onSubmit={join}>
          {length !== null && <p>{length === 0 ? 'Não há ninguém à espera.' : `${length} ${length === 1 ? 'pessoa' : 'pessoas'} à espera.`}</p>}
          <label>Nome<input value={name} onChange={e => setName(e.target.value)} required autoComplete="given-name" /></label>
          <label>Telemóvel<input value={phone} onChange={e => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" /></label>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            Aceito receber novidades e promoções do salão por WhatsApp (opcional).
          </label>
          <p className="muted small">O salão usa o seu telemóvel para o chamar. <a href="/privacidade" target="_blank" rel="noreferrer">Política de privacidade</a></p>
          {error && <p className="error">{error}</p>}
          <button className="btn" disabled={saving}>{saving ? 'A entrar…' : 'Entrar na fila'}</button>
        </form>
      ) : <p>A fila está fechada de momento. <a href={`/s/${salon.slug}`}>Marcar uma hora</a></p>)}

      <footer className="foot"><p className="muted">Feito com CorteCerto · <a href="/privacidade">Privacidade</a></p></footer>
    </main></div>
  )
}
