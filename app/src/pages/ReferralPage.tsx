import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon, { WhatsAppIcon } from '../components/Icon'
import { supabase, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import { inviteLink, inviteMessage } from '../lib/referral'
import { themeById, themeStyle } from '../lib/themes'
import { waLink } from '../lib/whatsapp'
import HelpLink from '../HelpLink'

interface Referral { name: string; joined_at: string; paying: boolean; rewarded_at: string | null }

/** Mais > Convidar um colega (migration 0034): a link for other salons, and the salons that joined through it. */
export default function ReferralPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [list, setList] = useState<Referral[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => { setRole(r.role); setSalon(r.salon) })
  }, [session])
  useEffect(() => {
    if (!salon) return
    supabase.rpc('my_referrals', { p_salon: salon.id }).then(({ data, error }) => { setMissing(Boolean(error)); setList((data ?? []) as Referral[]) })
  }, [salon])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (!can(role, 'assinatura')) return <Navigate to="/painel" replace />

  const link = inviteLink(location.origin, salon.slug)
  const msg = inviteMessage(salon.name, link)
  const earned = (list ?? []).filter(r => r.rewarded_at).length
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page">
      <header className="row"><h1>Convidar um colega<HelpLink /></h1><Link to="/mais">‹ Mais</Link></header>
      {missing ? <p className="banner">Para convidar colegas, corra <code>supabase/migrations/0034_referrals.sql</code> no editor SQL do Supabase.</p> : <>
        <div className="card raised referral-hero">
          <span className="referral-gift" aria-hidden="true"><Icon name="gift" size={30} /></span>
          <h2 style={{ margin: '8px 0 4px' }}>Um mês grátis para os dois</h2>
          <p style={{ margin: 0 }}>Conhece outro barbeiro ou cabeleireiro? Envie-lhe o seu link. Experimenta 30 dias grátis e, quando pagar o primeiro mês, <b>ganham os dois um mês grátis</b>.</p>
        </div>

        <div className="card">
          <strong>O seu link de convite</strong>
          <p style={{ margin: '4px 0 10px', wordBreak: 'break-all', fontWeight: 600 }}>{link.replace(/^https?:\/\//, '')}</p>
          <div className="actions" style={{ marginTop: 0 }}>
            <a className="wa" href={waLink('', msg)} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />Enviar por WhatsApp</a>
            <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true) }}><Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copiado' : 'Copiar link'}</button>
          </div>
          <details className="help-note" style={{ marginTop: 12 }}>
            <summary>Ver a mensagem</summary>
            <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{msg}</p>
          </details>
        </div>

        <ol className="referral-steps small">
          <li>O seu colega abre o link e cria o salão dele, como o seu.</li>
          <li>Tem 30 dias grátis para experimentar, sem cartão.</li>
          <li>Quando pagar o primeiro mês, a CorteCerto junta um mês grátis à sua assinatura e à dele.</li>
        </ol>

        <h2>Colegas que convidou{earned > 0 ? ` · ${earned} ${earned === 1 ? 'mês ganho' : 'meses ganhos'}` : ''}</h2>
        {list && list.length === 0 && <p className="muted">Ainda ninguém se juntou pelo seu link. Os salões que se juntarem aparecem aqui.</p>}
        {list?.map(r => (
          <div key={r.name + r.joined_at} className="card row">
            <span><b>{r.name}</b><br /><small className="muted">Juntou-se a {fmt(r.joined_at)}</small></span>
            <span className={`tag ${r.rewarded_at ? 'concluida' : r.paying ? 'confirmada' : ''}`}>
              {r.rewarded_at ? 'Mês grátis dado' : r.paying ? 'Já paga: mês grátis a caminho' : 'Em experiência'}
            </span>
          </div>
        ))}
        <p className="muted small">O mês grátis é juntado pela CorteCerto, normalmente no próprio dia em que o seu colega paga. Não há limite de colegas.</p>
      </>}
    </main></div>
  )
}
