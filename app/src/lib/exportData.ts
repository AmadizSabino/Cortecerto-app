import { supabase, type Booking, type Salon, type Service } from './supabase'
import { buildClients, type ClientNote } from './clients'
import { toCsv, download } from './csv'
import { formatPhone } from './whatsapp'
import { bookingPrice } from './pricing'

const STATUS: Record<string, string> = { pendente: 'Pendente', confirmada: 'Confirmada', concluida: 'Concluída', faltou: 'Faltou', cancelada: 'Cancelada' }

async function fetchAll(salon: Salon) {
  const [bk, sv, pr, nt] = await Promise.all([
    supabase.from('bookings').select('*').eq('salon_id', salon.id).order('starts_at').limit(50000),
    supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', salon.id),
    supabase.from('professionals').select('id,name').eq('salon_id', salon.id),
    supabase.from('client_notes').select('phone_key,notes,birthday_day,birthday_month').eq('salon_id', salon.id),
  ])
  if (bk.error) throw bk.error
  return {
    bookings: (bk.data ?? []) as Booking[],
    services: Object.fromEntries((sv.data ?? []).map((x: Service) => [x.id, x])) as Record<string, Service>,
    pros: Object.fromEntries((pr.data ?? []).map((x: { id: string; name: string }) => [x.id, x.name])) as Record<string, string>,
    notes: Object.fromEntries((nt.error ? [] : nt.data ?? []).map((n: ClientNote) => [n.phone_key, n])) as Record<string, ClientNote>,
  }
}

const stamp = () => new Date().toISOString().slice(0, 10)
const local = (iso: string, tz: string) => new Date(iso).toLocaleString('pt-PT', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })

/** Every client with visits, spend, consent, notes and birthday. */
export async function exportClients(salon: Salon) {
  const { bookings, services, notes } = await fetchAll(salon)
  const clients = buildClients(bookings, services)
  const csv = toCsv(
    ['Nome', 'Telemóvel', 'Visitas', 'Faltas', 'Gasto (€)', 'Última visita', 'Próxima marcação', 'Aceita mensagens', 'Aniversário', 'Notas'],
    clients.map(c => {
      const n = notes[c.key]
      return [
        c.name, formatPhone(c.phone), c.visits, c.noShows, (c.spentCents / 100).toFixed(2).replace('.', ','),
        c.lastVisit ? local(c.lastVisit, salon.timezone) : '', c.nextBooking ? local(c.nextBooking, salon.timezone) : '',
        c.consent, n?.birthday_day ? `${n.birthday_day}/${n.birthday_month}` : '', n?.notes ?? '',
      ]
    }),
  )
  download(`clientes-${salon.slug}-${stamp()}.csv`, csv)
}

/** Every booking, oldest first. */
export async function exportBookings(salon: Salon) {
  const { bookings, services, pros } = await fetchAll(salon)
  const csv = toCsv(
    ['Data', 'Cliente', 'Telemóvel', 'Serviço', 'Profissional', 'Preço (€)', 'Estado', 'Sinal', 'Aceita mensagens', 'Criada em'],
    bookings.map(b => [
      local(b.starts_at, salon.timezone), b.client_name, b.client_phone ? formatPhone(b.client_phone) : '',
      services[b.service_id]?.name ?? '', pros[b.professional_id] ?? '',
      (bookingPrice(b, services) / 100).toFixed(2).replace('.', ','),
      STATUS[b.status] ?? b.status, b.deposit === 'nenhum' ? '' : b.deposit, b.consent_messages,
      local((b as Booking & { created_at: string }).created_at, salon.timezone),
    ]),
  )
  download(`marcacoes-${salon.slug}-${stamp()}.csv`, csv)
}
