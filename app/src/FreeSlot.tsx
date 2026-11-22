import { useEffect, useMemo, useState } from 'react'
import { WhatsAppIcon } from './components/Icon'
import { supabase, type Booking, type Salon } from './lib/supabase'
import { candidates, offerMessage, REASON_LABEL, usableWindow, type Candidate, type SlotBooking } from './lib/freeSlot'
import { addDays, dateInTz, formatTime, zonedToUtc } from './lib/time'
import { waLink, waNumber } from './lib/whatsapp'

const ERRORS: Record<string, string> = {
  horario_ocupado: 'Esse horário já voltou a estar ocupado.',
  horario_passado: 'Essa vaga já passou.',
  sem_permissao: 'O seu acesso não permite oferecer vagas.',
}

/**
 * A booking was cancelled or the client didn't show: offer its time to other
 * clients by WhatsApp (migration 0019). The first to accept on the offer's page
 * gets it, and the agenda updates by itself.
 */
export default function FreeSlot({ salon, freed, proName, onClose, onFilled }: {
  salon: Salon; freed: Booking; proName: string; onClose: () => void; onFilled: () => void
}) {
  const tz = salon.timezone
  const [now] = useState(() => new Date())
  const win = useMemo(() => usableWindow(new Date(freed.starts_at), new Date(freed.ends_at), now), [freed, now])
  const [offerId, setOfferId] = useState<string>()
  const [all, setAll] = useState<SlotBooking[] | null>(null)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [filledBy, setFilledBy] = useState<string | null>(null)

  useEffect(() => {
    if (!win) return
    supabase.rpc('offer_free_slot', { p_salon: salon.id, p_professional: freed.professional_id, p_starts_at: win.start.toISOString(), p_ends_at: win.end.toISOString() })
      .then(({ data, error }) => {
        if (error) setError(error.message.includes('offer_free_slot')
          ? 'Para oferecer vagas, corra supabase/migrations/0019_free_slots_branding.sql no Supabase.'
          : Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? 'Não foi possível abrir a vaga.')
        else setOfferId(data as string)
      })
    const today = dateInTz(now, tz)
    supabase.from('bookings').select('id,professional_id,service_id,starts_at,ends_at,status,client_name,client_phone,consent_messages,wants_earlier,created_at')
      .eq('salon_id', salon.id)
      .gte('starts_at', zonedToUtc(addDays(today, -240), '00:00', tz).toISOString())
      .lt('starts_at', zonedToUtc(addDays(today, 15), '00:00', tz).toISOString())
      .limit(5000)
      .then(({ data }) => setAll((data ?? []) as SlotBooking[]))
  }, [win, salon.id, freed.professional_id, tz, now])

  // Taken? Checked every 15 seconds while this is open.
  useEffect(() => {
    if (!offerId || filledBy) return
    const check = async () => {
      const { data } = await supabase.from('slot_offers').select('filled_booking').eq('id', offerId).maybeSingle()
      if (data?.filled_booking) {
        const { data: b } = await supabase.from('bookings').select('client_name').eq('id', data.filled_booking).maybeSingle()
        setFilledBy(b?.client_name ?? 'um cliente'); onFilled()
      }
    }
    const t = setInterval(check, 15_000)
    return () => clearInterval(t)
  }, [offerId, filledBy, onFilled])

  const list = useMemo(() => win && all ? candidates({
    all, professionalId: freed.professional_id, window: win, now, exclude: freed.id,
    dayEnd: zonedToUtc(addDays(dateInTz(win.start, tz), 1), '00:00', tz),
  }) : [], [all, win, freed, now, tz])

  if (!win) return (
    <div className="next-visit"><p className="small muted" style={{ margin: 0 }}>Esta vaga já passou ou é curta demais para oferecer.</p><button className="link" onClick={onClose}>Fechar</button></div>
  )

  const day = dateInTz(win.start, tz) === dateInTz(now, tz) ? 'hoje' : win.start.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'short' })
  const when = `${day} às ${formatTime(win.start, tz)}`
  const link = (c?: Candidate) => `${location.origin}/vaga/${offerId}${c?.booking ? `?b=${c.booking.id}` : ''}`
  const bookedAt = (b: SlotBooking) => {
    const d = new Date(b.starts_at)
    return dateInTz(d, tz) === dateInTz(win.start, tz) ? `marcado às ${formatTime(d, tz)}` : `marcado ${d.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'short', day: 'numeric' })} às ${formatTime(d, tz)}`
  }

  async function withdraw() {
    if (offerId) await supabase.from('slot_offers').update({ closed_at: new Date().toISOString() }).eq('id', offerId)
    onClose()
  }

  return (
    <div className="next-visit">
      <div className="row"><strong>Vaga livre {when}</strong><button className="link" onClick={onClose}>Fechar</button></div>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>{proName} · {Math.round(win.minutes)} min. Envie a vaga a quem possa vir; quem aceitar primeiro fica com ela e a agenda atualiza sozinha.</p>
      {error && <p className="error">{error}</p>}
      {filledBy && <p className="ok">Vaga preenchida por {filledBy} ✓</p>}
      {offerId && !filledBy && <>
        {all === null && <p className="muted small">A procurar clientes…</p>}
        {all && list.length === 0 && <p className="muted small">Ninguém marcado mais tarde que caiba nesta vaga, nem clientes habituais com consentimento para mensagens.</p>}
        {list.map(c => {
          const key = waNumber(c.phone)
          return (
            <div key={key} className="row invite-row">
              <span><b>{c.name}</b><br /><small className="muted">{REASON_LABEL[c.reason]}{c.booking ? ` · ${bookedAt(c.booking)}` : c.days ? ` · há ${c.days} dias (costuma vir a cada ${c.usual})` : ''}</small></span>
              <a className={sent.has(key) ? 'wa sent' : 'wa'} href={waLink(c.phone, offerMessage(c, salon.name, when, link(c)))} target="_blank" rel="noreferrer"
                onClick={() => setSent(s => new Set(s).add(key))}><WhatsAppIcon size={16} />{sent.has(key) ? 'Enviado' : 'Enviar'}</a>
            </div>
          )
        })}
        <div className="actions" style={{ marginTop: 8 }}>
          <button onClick={() => { navigator.clipboard?.writeText(`Abriu uma vaga no ${salon.name} ${when}. Marque aqui: ${link()}`) }}>Copiar link para Estado/Instagram</button>
          <button className="link" onClick={withdraw}>Retirar a vaga</button>
        </div>
        <p className="muted small">Só aparecem clientes sem marcação que aceitaram receber mensagens.</p>
      </>}
    </div>
  )
}
