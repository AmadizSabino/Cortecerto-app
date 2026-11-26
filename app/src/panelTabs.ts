import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'

/** Pages of the salon panel that show the bottom tabs. */
export const PANEL = ['/painel', '/semana', '/clientes', '/mais', '/fila', '/lembretes', '/poster', '/estatisticas', '/definicoes', '/horarios', '/precos', '/acessos', '/assinatura', '/equipa', '/convidar', '/clube', '/ia', '/estilos', '/loja', '/marca', '/promocoes', '/domicilio', '/pacotes', '/ajuda']
export const TABS = [
  { to: '/painel', label: 'Hoje', icon: 'calendar' },
  { to: '/semana', label: 'Semana', icon: 'week' },
  { to: '/clientes', label: 'Clientes', icon: 'users' },
  { to: '/mais', label: 'Mais', icon: 'menu' },
]
// Pages reached from "Mais" keep that tab lit.
export const UNDER_MORE = PANEL.filter(p => !TABS.some(t => t.to === p))

export function usePanelTabs() {
  const { pathname } = useLocation()
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(Boolean(s)))
    return () => data.subscription.unsubscribe()
  }, [])
  return signedIn && PANEL.includes(pathname)
}

