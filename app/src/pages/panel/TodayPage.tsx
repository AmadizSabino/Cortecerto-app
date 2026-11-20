import { useCallback, useEffect, useState } from 'react'
import Icon, { WhatsAppIcon } from '../../components/Icon'
import { euros, initials, supabase, type Booking } from '../../lib/supabase'
import { addDays, dateInTz, formatTime, zonedToUtc } from '../../lib/time'
import { formatPhone, waLink } from '../../lib/whatsapp'
import NewBookingSheet from './NewBookingSheet'
import { usePanel } from './PanelContext'

const STATUS: Record<Booking['status'], string> = {
  pendente: 'Por confirmar', confirmada: 'Confirmada', concluida: 'Concluída', faltou: 'Faltou', cancelada: 'Cancelada',
}
const LIVE: Booking['status'][] = ['pendente', 'confirmada', 'concluida']

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite'
}

export default function TodayPage() {
  const { salon, services, pros } = usePanel()
  const tz = salon.timezone
  const today = dateInTz(new Date(), tz)
  const [date, setDate] = useState(today)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [tomorrow, setTomorrow] = useState<Booking[]>([])
  const [adding, setAdding] = useState(false)
  const svc = (id: string) => services.find(s => s.id === id)
  const pro = (id: string) => pros.find(p => p.id === id)

  const dayRange = (d: string) => [zonedToUtc(d, '00:00', tz).toISOString(), zonedToUtc(addDays(d, 1), '00:00', tz).toISOString()]
  const load = useCallback(async () => {
    const [from, to] = dayRange(date)
    const { data } = await supabase.from('bookings').select('*').eq('salon_id', salon.id).gte('starts_at', from).lt('starts_at', to).order('starts_at')
    setBookings(data ?? [])
    const [tf, tt] = dayRange(addDays(today, 1))
    const { data: tm } = await supabase.from('bookings').select('*').eq('salon_id', salon.id).in('status', ['pendente', 'confirmada'])
      .gte('starts_at', tf).lt('starts_at', tt).order('starts_at')
    setTomorrow((tm ?? []).filter(b => b.client_phone.replace(/\D/g, '').length >= 9))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salon.id, date, today])
  useEffect(() => { load() }, [load])

  async function update(b: Booking, patch: Partial<Booking>) {
    const { error } = await supabase.from('bookings').update(patch).eq('id', b.id)
    if (!error) {
      setBookings(bs => bs.map(x => x.id === b.id ? { ...x, ...patch } : x))
      setTomorrow(bs => bs.map(x => x.id === b.id ? { ...x, ...patch } : x))
    }
  }

  const live = bookings.filter(b => LIVE.includes(b.status))
  const revenue = live.reduce((sum, b) => sum + (svc(b.service_id)?.price_cents ?? 0), 0)
  const depositsDue = bookings.filter(b => b.deposit === 'pendente' && b.status !== 'cancelada').length
  const toRemind = tomorrow.filter(b => !b.reminded_at)
  const dayLabel = new Date(date + 'T12:00:00Z').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const bookingLink = `${location.origin}/s/${salon.slug}`

  const reminderText = (b: Booking) => {
    const s = svc(b.service_id)
    return `Olá ${b.client_name.split(' ')[0]}! Lembrete da sua marcação no ${salon.name} amanhã às ${formatTime(new Date(b.starts_at), tz)}${s ? ` (${s.name})` : ''}. Se não puder vir, avise-nos por favor. Até amanhã!`
  }
  const confirmText = (b: Booking) => {
    const s = svc(b.service_id), when = new Date(b.starts_at)
    return `Olá ${b.client_name.split(' ')[0]}! A sua marcação de ${s?.name ?? ''} no ${salon.name} está confirmada para ${when.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })} às ${formatTime(when, tz)}. Até já!`
  }

  return (
    <main className="page wide">
      <header className="between" style={{ marginTop: 8 }}>
        <div>
          <p className="eyebrow">{salon.name} · {new Date().toLocaleDateString('pt-PT', { timeZone: tz, day: '2-digit', month: '2-digit' })}</p>
          <h1 style={{ marginTop: 4 }}>{greeting(tz)}</h1>
        </div>
        <span className="avatar" style={{ width: 52, height: 52, fontSize: '1.2rem' }}>{initials(salon.name)}</span>
      </header>

      <div className="stats section">
        <div className="stat"><b>{live.length}</b><span>Marcações {date === today ? 'hoje' : 'neste dia'}</span></div>
        <div className="stat"><b>{euros(revenue).replace(',00', '')}</b><span>Faturação prevista</span></div>
        <div className="stat"><b>{depositsDue}</b><span>Sinais por confirmar</span></div>
      </div>

      {toRemind.length > 0 && (
        <div className="card soft section">
          <div className="row"><Icon name="bell" /><h3 className="grow">Lembrar {toRemind.length === 1 ? '1 cliente' : `${toRemind.length} clientes`} de amanhã</h3></div>
          <p className="muted small" style={{ margin: '6px 0 8px' }}>Um toque abre o WhatsApp com a mensagem pronta a enviar.</p>
          {toRemind.map(b => (
            <div key={b.id} className="list-row">
              <span className="grow"><b>{formatTime(new Date(b.starts_at), tz)}</b> · {b.client_name}</span>
              <a className="btn wa sm" href={waLink(b.client_phone, reminderText(b))} target="_blank" rel="noreferrer"
                onClick={() => update(b, { reminded_at: new Date().toISOString() })}><WhatsAppIcon size={16} />Lembrar</a>
            </div>
          ))}
        </div>
      )}

      <div className="between section">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Dia anterior"><Icon name="chevronLeft" /></button>
        <button className="link" style={{ textDecoration: 'none', color: 'var(--fg)', fontWeight: 700, textTransform: 'capitalize' }} onClick={() => setDate(today)}>
          {date === today ? 'Hoje' : dayLabel}
        </button>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Dia seguinte"><Icon name="chevronRight" /></button>
      </div>

      <div className="stack" style={{ marginTop: 12 }}>
        {bookings.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 28 }}>
            <p className="muted">Sem marcações neste dia.</p>
            <p className="small" style={{ marginTop: 10 }}>Partilhe o seu link: <a href={bookingLink}>{bookingLink.replace(/^https?:\/\//, '')}</a></p>
          </div>
        )}
        {bookings.map(b => {
          const s = svc(b.service_id), when = new Date(b.starts_at)
          const hasPhone = b.client_phone.replace(/\D/g, '').length >= 9
          const open = b.status === 'pendente' || b.status === 'confirmada'
          return (
            <article key={b.id} className={`card booking ${open || b.status === 'concluida' ? '' : 'dim'}`}>
              <div className="time">{formatTime(when, tz)}<small>{s?.duration_min} min</small></div>
              <div>
                <div className="between"><b>{b.client_name}</b><span className={`tag ${b.status}`}>{STATUS[b.status]}</span></div>
                <div className="muted small" style={{ marginTop: 4 }}>{s?.name} · {pro(b.professional_id)?.name} · {s && euros(s.price_cents)}</div>
                <div className="small" style={{ marginTop: 4 }}>
                  {hasPhone && <a href={`tel:+${formatPhone(b.client_phone).replace(/\D/g, '')}`}>{formatPhone(b.client_phone)}</a>}
                  {b.source && b.source !== 'online' && <span className="muted"> · {b.source === 'telefone' ? 'por telefone' : 'ao balcão'}</span>}
                </div>
                {b.deposit !== 'nenhum' && b.status !== 'cancelada' && (
                  <div className="small" style={{ marginTop: 6 }}>
                    Sinal {euros(salon.deposit_cents)}: {b.deposit === 'pago' ? <b style={{ color: 'var(--ok)' }}>recebido ✓</b> : <button className="link" onClick={() => update(b, { deposit: 'pago', status: b.status === 'pendente' ? 'confirmada' : b.status })}>marcar como recebido</button>}
                  </div>
                )}
                <div className="actions">
                  {b.status === 'pendente' && <button className="btn primary sm" onClick={() => update(b, { status: 'confirmada' })}>Confirmar</button>}
                  {open && <>
                    <button className="btn sm" onClick={() => update(b, { status: 'concluida' })}>Concluída</button>
                    <button className="btn sm" onClick={() => update(b, { status: 'faltou' })}>Faltou</button>
                    <button className="btn sm" onClick={() => update(b, { status: 'cancelada' })}>Cancelar</button>
                  </>}
                  {hasPhone && <a className="btn wa sm" href={waLink(b.client_phone, confirmText(b))} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />WhatsApp</a>}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <button className="btn primary fab" onClick={() => setAdding(true)}><Icon name="plus" />Marcação</button>
      {adding && <NewBookingSheet date={date} onClose={() => setAdding(false)} onSaved={d => { setAdding(false); setDate(d); if (d === date) load() }} />}
    </main>
  )
}
