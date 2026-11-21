import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, type Booking, type Salon } from './lib/supabase'
import { addDays, dateInTz, zonedToUtc } from './lib/time'
import { localSent, wantsReminder } from './lib/reminders'

/** On the agenda: how many reminders for tomorrow are still to send. */
export default function RemindersCard({ salon }: { salon: Salon }) {
  const [pending, setPending] = useState<number | null>(null)

  useEffect(() => {
    const tomorrow = addDays(dateInTz(new Date(), salon.timezone), 1)
    const from = zonedToUtc(tomorrow, '00:00', salon.timezone).toISOString()
    const to = zonedToUtc(addDays(tomorrow, 1), '00:00', salon.timezone).toISOString()
    const local = localSent()
    supabase.from('bookings').select('*').eq('salon_id', salon.id).gte('starts_at', from).lt('starts_at', to)
      .then(({ data }) => setPending(((data ?? []) as Booking[]).filter(b => wantsReminder(b) && !b.reminder_sent_at && !local[b.id]).length))
  }, [salon.id, salon.timezone])

  if (!pending) return null
  return (
    <Link to="/lembretes" className="card reminders-card">
      <span>🔔 {pending} {pending === 1 ? 'lembrete' : 'lembretes'} para amanhã por enviar</span>
      <span>Enviar ›</span>
    </Link>
  )
}
