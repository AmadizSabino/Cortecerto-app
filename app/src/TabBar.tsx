import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { loadMySalon } from './lib/mySalon'
import { themeById, themeStyle } from './lib/themes'
import Icon from './components/Icon'
import { TABS, UNDER_MORE } from './panelTabs'

export default function TabBar() {
  const { pathname } = useLocation()
  // Same colours as the salon's panel.
  const [theme, setTheme] = useState<string>()
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) loadMySalon(data.session.user.id).then(m => setTheme(m.salon?.theme)) })
  }, [])
  return (
    <nav className="tabbar no-print" aria-label="Painel" style={theme ? themeStyle(themeById(theme)) : undefined}>
      {TABS.map(t => (
        <NavLink key={t.to} to={t.to} end className={({ isActive }) => isActive || (t.to === '/mais' && UNDER_MORE.includes(pathname)) ? 'active' : ''}>
          <Icon name={t.icon} size={22} />{t.label}
        </NavLink>
      ))}
    </nav>
  )
}
