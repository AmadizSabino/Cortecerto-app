import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon from '../components/Icon'
import { initials, supabase, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can, levelLabel, NEED } from '../lib/access'
import InstallCard from '../InstallCard'
import { themeById, themeStyle } from '../lib/themes'
import HelpLink from '../HelpLink'

interface Item { to: string; icon: string; label: string; hint: string; need: keyof typeof NEED; show?: (s: Salon) => boolean }
const GROUPS: { title: string; items: Item[] }[] = [
  { title: 'No salão', items: [
    { to: '/fila', icon: 'queue', label: 'Fila de espera', hint: 'Clientes sem marcação, por ordem de chegada', need: 'fila', show: s => s.booking_mode !== 'marcacao' && s.work_place !== 'domicilio' },
    { to: '/lembretes', icon: 'bell', label: 'Lembretes', hint: 'Avisar os clientes de amanhã por WhatsApp', need: 'lembretes' },
    { to: '/poster', icon: 'qr', label: 'Poster com QR', hint: 'Para o espelho ou a porta', need: 'poster' },
  ] },
  { title: 'Clientes', items: [
    { to: '/promocoes', icon: 'spark', label: 'Social Media Manager', hint: 'Plano da semana, promoções, posts e datas', need: 'promocoes' },
    { to: '/pacotes', icon: 'gift', label: 'Pacotes', hint: 'Combos, casamentos e eventos, packs de sessões', need: 'clientes' },
    { to: '/convidar', icon: 'userPlus', label: 'Convidar clientes', hint: 'Pelo número ou dos contactos do telemóvel', need: 'convidar' },
    { to: '/clube', icon: 'crown', label: 'Clube', hint: 'Mensalidade com benefícios e receita fixa', need: 'clube' },
  ] },
  { title: 'Gestão', items: [
    { to: '/estatisticas', icon: 'chart', label: 'Estatísticas', hint: 'Faturação, serviços, clientes e comissões', need: 'estatisticas' },
    { to: '/domicilio', icon: 'home', label: 'Ao domicílio', hint: 'Zonas, deslocação, taxas e serviços que vão a casa', need: 'domicilio', show: s => s.work_place !== 'salao' },
    { to: '/horarios', icon: 'clock', label: 'Horários e folgas', hint: 'Por profissional, pausas e férias', need: 'horarios' },
    { to: '/precos', icon: 'tag', label: 'Preços por profissional', hint: 'Preços e durações diferentes', need: 'precos' },
    { to: '/marca', icon: 'camera', label: 'Marca e galeria', hint: 'Logótipo, capa, texto e fotos do seu trabalho', need: 'equipa' },
    { to: '/equipa', icon: 'users', label: 'Equipa', hint: 'Profissionais, comissões e acessos ao painel', need: 'equipa' },
    { to: '/ia', icon: 'spark', label: 'Assistente IA', hint: 'Antes e depois, relatórios, respostas e mais', need: 'ia' },
    { to: '/assinatura', icon: 'card', label: 'Assinatura', hint: 'Período grátis e pagamento', need: 'assinatura' },
    { to: '/definicoes', icon: 'settings', label: 'Definições', hint: 'Salão, serviços, sinal e estilo', need: 'definicoes' },
  ] },
]

export default function MorePage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [admin, setAdmin] = useState(false)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(m => { setSalon(m.salon); setRole(m.role) })
    supabase.rpc('is_platform_admin').then(({ data }) => setAdmin(data === true))
  }, [session])

  if (session === null) return <Navigate to="/painel" replace />
  if (session === undefined || salon === undefined) return <main className="page"><p className="muted">A carregar…</p></main>
  if (salon === null) return <Navigate to="/registar" replace />

  const link = `${location.origin}/s/${salon.slug}`
  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page">
      <div className="greet">
        <div><p className="eyebrow">Painel · acesso {levelLabel(role)}</p><h1>{salon.name}<HelpLink /></h1></div>
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
        const items = g.items.filter(i => can(role, i.need) && (!i.show || i.show(salon)))
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
      <h2>Ajuda</h2>
      <div className="card menu">
        <Link to="/ajuda"><Icon name="help" size={22} /><span>Ajuda e como fazer<small>Passo a passo para cada parte da app</small></span><span className="chev"><Icon name="chevronRight" size={18} /></span></Link>
      </div>
      <h2>App no telemóvel</h2>
      <InstallCard always />
      {admin && <div className="card menu"><Link to="/admin"><Icon name="star" size={22} /><span>Administração CorteCerto<small>Assinaturas e faturas de todos os salões</small></span><span className="chev"><Icon name="chevronRight" size={18} /></span></Link></div>}
      <div className="card menu">
        <Link to="/palavra-passe"><Icon name="shield" size={22} /><span>Palavra-passe<small>Escolher ou mudar a palavra-passe da conta</small></span><span className="chev"><Icon name="chevronRight" size={18} /></span></Link>
        <button onClick={() => supabase.auth.signOut().then(() => location.assign('/painel'))}><Icon name="logout" size={22} /><span>Sair da conta</span></button>
      </div>
    </main></div>
  )
}
