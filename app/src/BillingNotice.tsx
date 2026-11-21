import { Link } from 'react-router-dom'
import type { Salon } from './lib/supabase'
import { billingState, needsNotice, type BillingFields } from './lib/billing'

/** On the owner's agenda: the last week of the trial, or a payment that is needed. */
export default function BillingNotice({ salon }: { salon: Salon & BillingFields }) {
  const b = billingState(salon)
  if (!needsNotice(b)) return null
  const text = b.kind === 'experimental'
    ? `O período grátis termina ${b.daysLeft === 1 ? 'amanhã' : `daqui a ${b.daysLeft} dias`}.`
    : b.kind === 'terminou' ? 'O período grátis terminou.'
    : b.kind === 'em_atraso' ? 'Há um pagamento da assinatura por fazer.'
    : 'A assinatura foi cancelada.'
  return (
    <Link to="/assinatura" className="card billing-notice">
      <span>{text}</span><span>Ver assinatura ›</span>
    </Link>
  )
}
