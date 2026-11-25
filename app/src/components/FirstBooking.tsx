import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { supabase, type Salon } from '../lib/supabase'

const key = (salonId: string) => `cc-first-online-${salonId}`
const seen = (salonId: string) => { try { return localStorage.getItem(key(salonId)) === '1' } catch { return true } }

/**
 * A one-off celebration on Hoje when the salon's first online booking from a real client arrives
 * (test bookings from /no-ar are named "Teste" and do not count). Shown once per device.
 */
export default function FirstBooking({ salon }: { salon: Salon }) {
  const [client, setClient] = useState<string | null>(null)

  useEffect(() => {
    if (seen(salon.id)) return
    supabase.from('bookings').select('client_name, created_at').eq('salon_id', salon.id).eq('source', 'online')
      .not('client_name', 'ilike', 'teste%').order('created_at').limit(1)
      .then(({ data }) => {
        // Only a recent first: salons that already had online bookings before this card existed skip it.
        const b = data?.[0]
        if (b && Date.now() - new Date(b.created_at).getTime() < 7 * 86_400_000) setClient(b.client_name ?? '')
      })
  }, [salon.id])

  if (client === null) return null
  const close = () => { try { localStorage.setItem(key(salon.id), '1') } catch { /* private mode */ } setClient(null) }
  const first = client.trim().split(/\s+/)[0]

  return (
    <section className="card first-booking" role="status">
      <div className="confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>
      <span className="live-badge" aria-hidden="true"><Icon name="star" size={28} /></span>
      <h2>A primeira marcação online chegou!</h2>
      <p>{first ? `${first} marcou pela página do salão, sem ligar nem mandar mensagem.` : 'Um cliente marcou pela página do salão, sem ligar nem mandar mensagem.'} É assim daqui para a frente: menos mensagens, mais cadeiras ocupadas.</p>
      <p className="muted small">Quantos mais clientes souberem do link, mais marcações chegam assim.</p>
      <div className="actions">
        <Link className="btn" to="/no-ar" onClick={close}>Partilhar o link outra vez</Link>
        <button type="button" onClick={close}>Fechar</button>
      </div>
    </section>
  )
}
