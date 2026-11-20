import { useCallback, useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon from '../../components/Icon'
import { supabase, type Professional, type Salon, type Service } from '../../lib/supabase'
import type { OpeningHours } from '../../lib/slots'
import { themeById, themeStyle } from '../../lib/themes'
import { PanelCtx } from './PanelContext'
import Login from './Login'

type Svc = Service & { active?: boolean }
type Pro = Professional & { active?: boolean }

export default function PanelLayout() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Svc[]>([])
  const [pros, setPros] = useState<Pro[]>([])
  const [hours, setHours] = useState<OpeningHours[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const reload = useCallback(async () => {
    if (!session) return
    const { data: s } = await supabase.from('salons').select('*').eq('owner_id', session.user.id).maybeSingle()
    setSalon(s)
    if (!s) return
    const [sv, pr, hr] = await Promise.all([
      supabase.from('services').select('id,name,duration_min,price_cents,active').eq('salon_id', s.id).order('price_cents'),
      supabase.from('professionals').select('id,name,active').eq('salon_id', s.id).order('name'),
      supabase.from('opening_hours').select('weekday,opens,closes').eq('salon_id', s.id),
    ])
    setServices(sv.data ?? []); setPros(pr.data ?? []); setHours(hr.data ?? [])
  }, [session])
  useEffect(() => { reload() }, [reload])

  if (session === undefined) return <main className="page"><p className="muted">A carregar…</p></main>
  if (!session) return <Login />
  if (salon === undefined) return <main className="page"><p className="muted">A carregar…</p></main>
  if (salon === null) return <Navigate to="/registar" replace />

  const tabs = [
    { to: '/painel', icon: 'calendar', label: 'Hoje', end: true },
    { to: '/painel/clientes', icon: 'users', label: 'Clientes' },
    { to: '/painel/poster', icon: 'qr', label: 'Poster' },
    { to: '/painel/definicoes', icon: 'settings', label: 'Definições' },
  ]
  return (
    <PanelCtx.Provider value={{ salon, services, pros, hours, reload }}>
      <div className="themed panel" style={themeStyle(themeById(salon.theme))}>
        <Outlet />
        <nav className="tabbar">
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => isActive ? 'active' : ''}>
              <Icon name={t.icon} size={22} />{t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </PanelCtx.Provider>
  )
}
