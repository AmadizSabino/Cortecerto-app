import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon from '../components/Icon'
import { initials, supabase, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { themeById, themeStyle } from '../lib/themes'

interface Item { to: string; icon: string; label: string; hint: string; owner?: boolean }
const GROUPS: { title: string; items: Item[] }[] = [
  { title: 'No salão', items: [
    { to: '/fila', icon: 'queue', label: 'Fila de espera', hint: 'Clientes sem marcação, por ordem de chegada' },
    { to: '/lembretes', icon: 'bell', label: 'Lembretes', hint: 'Avisar os clientes de amanhã por WhatsApp' },
    { to: '/poster', icon: 'qr', label: 'Poster com QR', hint: 'Para o espelho ou a porta' },
  ] },
  { title: 'Gestão', items: [
    { to: '/estatisticas', icon: 'chart', label: 'Estatísticas', hint: 'Faturação, serviços e clientes', owner: true },
    { to: '/horarios', icon: 'clock', label: 'Horários e folgas', hint: 'Por profissional, pausas e férias', owner: true },
    { to: '/precos', icon: 'tag', label: 'Preços por profissional', hint: 'Preços e durações diferentes', owner: true },
    { to: '/acessos', icon: 'users', label: 'Equipa', hint: 'Dar acesso ao painel', owner: true },
    { to: '/assinatura', icon: 'card', label: 'Assinatura', hint: 'Período grátis e pagamento', owner: true },
    { to: '/definicoes', icon: 'settings', label: 'Definições', hint: 'Salão, serviços, sinal e estilo', owner: true },
  ] },
]

export default function MorePage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(m => { setSalon(m.salon); setRole(m.role) })
  }, [session])

  if (session === null) return <Navigate to="/painel" replace />
  if (session === undefined || salon === undefined) return <main className="page"><p className="muted">A carregar…</p></main>
  if (salon === null) return <Navigate to="/registar" replace />

  const link = `${location.origin}/s/${salon.slug}`
  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page">
      <div className="greet">
        <div><p className="eyebrow">Painel</p><h1>{salon.name}</h1></div>
        <span className="avatar">{initials(salon.name)}</span>
      </div>
      <div className="card soft">
        <p className="small muted" style={{ margin: 0 }}>Link de marcação</p>
        <p style={{ margin: '4px 0 10px', wordBreak: 'break-all', fontWeight: 600 }}>{link.replace(/^https?:\/\//, '')}</p>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <a className="btn inline sm" href={link} target="_blank" rel="noreferrer">Ver como cliente</a>
          <button className="sm" onClick={() => navigator.clipboard?.writeText(link)}><Icon name="copy" size={16} />Copiar</button>
        </div>
      </div>
      {GROUPS.map(g => {
        const items = g.items.filter(i => !i.owner || role === 'dono')
        if (!items.length) return null
        return (
          <section key={g.title}>
            <h2>{g.title}</h2>
            <div className="card menu">
              {items.map(i => (
                <Link key={i.to} to={i.to}>
                  <Icon name={i.icon} size={22} />
                  <span>{i.label}<small>{i.hint}</small></span>
                  <span className="chev"><Icon name="chevronRight" size={18} /></span>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
      <div className="card menu">
        <button onClick={() => supabase.auth.signOut().then(() => location.assign('/painel'))}><Icon name="logout" size={22} /><span>Sair da conta</span></button>
      </div>
    </main></div>
  )
}
