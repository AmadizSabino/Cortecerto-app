import type { Booking, Salon } from './supabase'
import { formatTime } from './time'
import { manageLink } from './clientChanges'
import { publicOrigin } from './publicOrigin'

/** Text for the client with the suggested time and the link to accept or decline. */
export function proposalMessage(b: Booking, salon: Salon, serviceName: string, when: Date, note?: string | null): string {
  const tz = salon.timezone
  const day = when.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
  return `Olá ${b.client_name.split(' ')[0]}! Sobre a sua marcação de ${serviceName} no ${salon.name}: podemos passar para ${day} às ${formatTime(when, tz)}?${note ? ` ${note}` : ''} Aceite ou recuse aqui: ${manageLink(publicOrigin(), b.id)}`
}

