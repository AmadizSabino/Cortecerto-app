import { billingState } from './billing'
import { PLAN } from './plan'
import { daysSince, type AdminSalonRow } from './adminStats'

/**
 * Admin › Acompanhar: salons in the free trial that the admin should message by hand.
 * Manual on purpose: a personal WhatsApp from the founder, never sent automatically.
 * - 'dia1': created 0–2 days ago, no online booking yet ("Precisa de ajuda?")
 * - 'dia3': 3+ days in, still no online booking ("Fazemos juntos")
 * - 'fim': trial ends within 5 days, whether or not it has bookings
 */
export type FollowStage = 'dia1' | 'dia3' | 'fim'
export interface FollowUp { salon: AdminSalonRow; stage: FollowStage; why: string; text: string }

export const STAGE_LABEL: Record<FollowStage, string> = { dia1: 'Boas-vindas', dia3: 'Sem marcações online', fim: 'Período grátis a acabar' }

const price = `${(PLAN.priceCents / 100).toFixed(2).replace('.', ',')} €`
const dayMonth = (d: Date) => d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })

export function followUpText(stage: FollowStage, s: AdminSalonRow, appUrl: string, now = new Date()): string {
  const hi = 'Olá! Sou o Francisco, da CorteCerto.'
  if (stage === 'dia1') return `${hi} Vi que criou o ${s.name} na app, obrigado! Se quiser, ajudo a pôr tudo a funcionar: serviços, horário e o link para os clientes marcarem. É só responder a esta mensagem.`
  if (stage === 'dia3') return `${hi} O ${s.name} ainda não recebeu marcações online. Quer que façamos isto juntos em 10 minutos? Ajudo a pôr o link no Instagram e no WhatsApp do salão. A sua página é ${appUrl}/s/${s.slug}`
  const b = billingState(s, now)
  const end = b.kind === 'experimental' ? dayMonth(new Date(now.getTime() + b.daysLeft * 86_400_000)) : 'breve'
  return `${hi} O período grátis do ${s.name} acaba a ${end}. Se quiser continuar, são ${price} + IVA por mês, por MB Way ou transferência, e a fatura fica no painel. Nada é cobrado sozinho. Alguma dúvida, estou por aqui.`
}

/** Who to message today, most urgent first. Salons without a WhatsApp number are left out. */
export function followUps(salons: AdminSalonRow[], appUrl: string, now = new Date()): FollowUp[] {
  const out: FollowUp[] = []
  for (const s of salons) {
    if ((s.whatsapp ?? '').replace(/\D/g, '').length < 9) continue
    const b = billingState(s, now)
    if (b.kind !== 'experimental') continue
    const age = daysSince(s.created_at, now) ?? 0
    let stage: FollowStage | null = null
    let why = ''
    if (b.daysLeft <= 5) { stage = 'fim'; why = `Acaba em ${b.daysLeft} d` }
    else if (!s.first_online_at && age >= 3) { stage = 'dia3'; why = `${age} dias sem marcações online` }
    else if (!s.first_online_at) { stage = 'dia1'; why = age === 0 ? 'Criado hoje' : `Criado há ${age} d` }
    if (stage) out.push({ salon: s, stage, why, text: followUpText(stage, s, appUrl, now) })
  }
  const order: Record<FollowStage, number> = { fim: 0, dia3: 1, dia1: 2 }
  return out.sort((a, b) => order[a.stage] - order[b.stage])
}
