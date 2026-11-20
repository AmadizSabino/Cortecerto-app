import { useEffect, useMemo, useState } from 'react'
import Icon, { WhatsAppIcon } from '../../components/Icon'
import { daysSince, summarizeClients, type ClientSummary } from '../../lib/clients'
import { euros, initials, supabase, type Booking } from '../../lib/supabase'
import { formatPhone, waLink } from '../../lib/whatsapp'
import { usePanel } from './PanelContext'

type Filter = 'todos' | 'saudades' | 'faltas'
const MISS_DAYS = 35

export default function ClientsPage() {
  const { salon, services } = usePanel()
  const [bookings, setBookings] = useState<Booking[]>()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')

  useEffect(() => {
    supabase.from('bookings').select('*').eq('salon_id', salon.id).order('starts_at').limit(5000).then(({ data }) => setBookings(data ?? []))
  }, [salon.id])

  const clients = useMemo(() => summarizeClients(bookings ?? [], id => services.find(s => s.id === id)?.price_cents ?? 0), [bookings, services])
  const missing = (c: ClientSummary) => !c.nextBooking && (daysSince(c.lastVisit) ?? 0) >= MISS_DAYS
  const shown = clients
    .filter(c => filter === 'todos' || (filter === 'saudades' ? missing(c) : c.noShows > 0))
    .filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q))
    .sort((a, z) => (z.lastVisit?.getTime() ?? 0) - (a.lastVisit?.getTime() ?? 0))

  const missText = (c: ClientSummary) => `Olá ${c.name.split(' ')[0]}! Já temos saudades suas no ${salon.name}. Marque a próxima visita aqui: ${location.origin}/s/${salon.slug}`

  return (
    <main className="page wide">
      <h1 style={{ marginTop: 8 }}>Clientes</h1>
      <p className="muted" style={{ marginTop: 4 }}>{clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}, criados a partir das marcações.</p>

      <div className="search section"><Icon name="search" size={18} /><input placeholder="Procurar por nome ou telemóvel" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="seg" style={{ marginTop: 12 }}>
        <button className={filter === 'todos' ? 'on' : ''} onClick={() => setFilter('todos')}>Todos</button>
        <button className={filter === 'saudades' ? 'on' : ''} onClick={() => setFilter('saudades')}>Há muito tempo</button>
        <button className={filter === 'faltas' ? 'on' : ''} onClick={() => setFilter('faltas')}>Faltaram</button>
      </div>
      {filter === 'saudades' && <p className="muted small" style={{ marginTop: 8 }}>Clientes sem visita há mais de {MISS_DAYS} dias e sem marcação futura.</p>}

      <div className="card section" style={{ padding: '4px 16px' }}>
        {bookings === undefined && <p className="muted" style={{ padding: 12 }}>A carregar…</p>}
        {bookings && shown.length === 0 && <p className="muted" style={{ padding: 12 }}>{clients.length === 0 ? 'Ainda sem clientes. Aparecem aqui assim que houver marcações.' : 'Nenhum cliente encontrado.'}</p>}
        {shown.map(c => {
          const days = daysSince(c.lastVisit)
          const hasPhone = c.phone.replace(/\D/g, '').length >= 9
          return (
            <div key={c.key} className="list-row">
              <span className="avatar" style={{ width: 44, height: 44 }}>{initials(c.name)}</span>
              <div className="grow">
                <b>{c.name}</b>
                <div className="muted small">
                  {c.visits} {c.visits === 1 ? 'visita' : 'visitas'} · {euros(c.spentCents)}
                  {days !== undefined && <> · {days <= 0 ? 'veio hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`}</>}
                  {c.noShows > 0 && <span style={{ color: 'var(--danger)' }}> · {c.noShows} {c.noShows === 1 ? 'falta' : 'faltas'}</span>}
                </div>
                {c.nextBooking && <div className="small" style={{ color: 'var(--accent)' }}>Próxima: {c.nextBooking.toLocaleDateString('pt-PT', { timeZone: salon.timezone, day: 'numeric', month: 'short' })}</div>}
              </div>
              {hasPhone && <>
                <a className="icon-btn" href={`tel:+${formatPhone(c.phone).replace(/\D/g, '')}`} aria-label="Ligar"><Icon name="phone" size={18} /></a>
                <a className="icon-btn" style={{ background: '#25D366', color: '#fff', borderColor: '#25D366' }} href={waLink(c.phone, missing(c) ? missText(c) : `Olá ${c.name.split(' ')[0]}!`)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><WhatsAppIcon /></a>
              </>}
            </div>
          )
        })}
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>Envie mensagens de novidades só a clientes que deram consentimento na marcação.</p>
    </main>
  )
}
