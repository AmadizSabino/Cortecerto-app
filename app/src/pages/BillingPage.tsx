import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { billingState, type BillingFields } from '../lib/billing'
import { PLAN } from '../lib/plan'
import { listInvoices, openInvoice, type Invoice } from '../lib/invoices'
import { themeById, themeStyle } from '../lib/themes'
import HelpLink from '../HelpLink'

const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })

/** The salon's plan: trial days left, paid until, and how to pay (gateway still to connect). */
export default function BillingPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<(Salon & BillingFields) | null>()
  const [role, setRole] = useState<Role>('dono')
  const [invoices, setInvoices] = useState<Invoice[] | null>()
  const [openError, setOpenError] = useState('')

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => {
      setRole(r.role); setSalon(r.salon)
      if (r.salon && r.role === 'dono') listInvoices(r.salon.id).then(setInvoices)
    })
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
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page">
      <header className="row"><h1>Assinatura<HelpLink /></h1><Link to="/mais">‹ Mais</Link></header>
      <section className="card">
        <strong>{status}</strong>
        {b.kind === 'experimental' && salon.trial_ends_at && <p className="muted">Até {fmt(salon.trial_ends_at)}. Até lá pode usar tudo, sem pagar nada.</p>}
        {b.kind === 'ativa' && b.until && <p className="muted">Pago até {fmt(b.until)}.</p>}
        <p>{PLAN.name}: {euros(PLAN.priceCents)} + IVA por mês ({euros(Math.round(PLAN.priceCents * (1 + PLAN.vatRate)))} com IVA), com tudo incluído e sem limites de marcações, clientes ou profissionais.</p>
      </section>
      <section className="card">
        <strong>Como pagar</strong>
        <p className="muted">Todos os meses recebe aqui a fatura, com os dados para pagamento. Avisamos antes de o período grátis terminar.</p>
      </section>
      <h2>Faturas</h2>
      {invoices === undefined && <p className="muted">A carregar…</p>}
      {invoices === null && <p className="muted">As faturas ainda não estão disponíveis.</p>}
      {invoices && invoices.length === 0 && <p className="muted">Ainda não há faturas. A primeira aparece aqui quando terminar o período grátis.</p>}
      {invoices && invoices.length > 0 && (
        <div className="card menu">
          {invoices.map(inv => (
            <button key={inv.id} onClick={async () => { setOpenError(''); if (!await openInvoice(inv)) setOpenError('Não foi possível abrir a fatura. Tente de novo.') }}>
              <span>{inv.kind === 'pedido' ? 'Pedido de pagamento ' : ''}{inv.number}{inv.period && ` · ${inv.period}`}<small>{new Date(inv.issued_on + 'T12:00:00Z').toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })} · {euros(inv.amount_cents)}{inv.status === 'paga' ? ' · paga' : inv.status === 'por_pagar' && inv.due_on ? ` · por pagar, vence ${new Date(inv.due_on + 'T12:00:00Z').toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}` : inv.status === 'anulada' ? ' · anulada' : ''}</small></span>
              <span className="chev">Descarregar</span>
            </button>
          ))}
        </div>
      )}
      {openError && <p className="error" role="alert">{openError}</p>}
      <p className="muted small">Pode cancelar quando quiser, sem fidelização. Antes disso, exporte os seus dados em <Link to="/definicoes">Definições</Link>.</p>
    </main></div>
  )
}
