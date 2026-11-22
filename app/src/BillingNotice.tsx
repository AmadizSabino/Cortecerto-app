import { Link } from 'react-router-dom'
import type { Salon } from './lib/supabase'
import { billingState, lockState, needsNotice, type BillingFields } from './lib/billing'

/** On the owner's agenda: the last week of the trial, or a payment that is needed. */
export default function BillingNotice({ salon }: { salon: Salon & BillingFields }) {
  const b = billingState(salon)
  const lock = lockState(salon)
  if (!needsNotice(b) && !lock.locked) return null
  const text = lock.locked ? 'A conta está só de leitura: pode ver tudo, mas não alterar, e as marcações online estão em pausa. Volta ao normal assim que o pagamento for registado.'
    : b.kind === 'experimental' ? `O período grátis termina ${b.daysLeft === 1 ? 'amanhã' : `daqui a ${b.daysLeft} dias`}.`
    : b.kind === 'terminou' ? 'O período grátis terminou.'
    : b.kind === 'em_atraso' ? 'Há um pagamento da assinatura por fazer.'
    : 'A assinatura foi cancelada.'
  const countdown = !lock.locked && lock.daysToLock
    ? ` Sem pagamento, a conta fica só de leitura ${lock.daysToLock === 1 ? 'amanhã' : `daqui a ${lock.daysToLock} dias`}. As marcações feitas ficam guardadas.`
    : ''
  return (
    <Link to="/assinatura" className={`card billing-notice${lock.locked ? ' locked' : ''}`}>
      <span>{text}{countdown}</span><span>Ver assinatura ›</span>
    </Link>
  )
}

/** A thin strip above the tab bar on every panel page while the account is read-only. */
export function LockedStrip({ salon }: { salon: BillingFields | null | undefined }) {
  if (!salon || !lockState(salon).locked) return null
  return <Link to="/assinatura" className="locked-strip">Conta só de leitura · Ver assinatura ›</Link>
}
