import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { billingState, type BillingFields } from '../lib/billing'
import { PLAN } from '../lib/plan'

const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })

/** The salon's plan: trial days left, paid until, and how to pay (gateway still to connect). */
export default function BillingPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<(Salon & BillingFields) | null>()
  const [role, setRole] = useState<Role>('dono')

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => { setRole(r.role); setSalon(r.salon) })
  }, [session])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (role !== 'dono') return <Navigate to="/painel" replace />

  const b = billingState(salon)
  const status = {
    sem_dados: 'Período grátis',
    experimental: b.kind === 'experimental' ? `Período grátis: ${b.daysLeft === 1 ? 'falta 1 dia' : `faltam ${b.daysLeft} dias`}` : '',
    ativa: 'Assinatura ativa',
    terminou: 'O período grátis terminou',
    em_atraso: 'Pagamento em atraso',
    cancelada: 'Assinatura cancelada',
  }[b.kind]

  return (
    <main className="page">
      <header className="row"><h1>Assinatura</h1><Link to="/mais">‹ Mais</Link></header>
      <section className="card">
        <strong>{status}</strong>
        {b.kind === 'experimental' && salon.trial_ends_at && <p className="muted">Até {fmt(salon.trial_ends_at)}. Até lá pode usar tudo, sem pagar nada.</p>}
        {b.kind === 'ativa' && b.until && <p className="muted">Pago até {fmt(b.until)}.</p>}
        <p>{PLAN.name}: {euros(PLAN.priceCents)} por mês, com tudo incluído e sem limites de marcações, clientes ou profissionais.</p>
      </section>
      <section className="card">
        <strong>Como pagar</strong>
        <p className="muted">Em breve vai poder pagar aqui por MB Way ou referência Multibanco, com fatura emitida automaticamente. Avisamos antes de o período grátis terminar.</p>
      </section>
      <p className="muted small">Pode cancelar quando quiser, sem fidelização. Antes disso, exporte os seus dados em <Link to="/definicoes">Definições</Link>.</p>
    </main>
  )
}
