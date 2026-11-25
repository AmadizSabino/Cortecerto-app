import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import TabBar from './TabBar'
import { usePanelTabs } from './panelTabs'
import MorePage from './pages/MorePage'
import AdminPage from './pages/AdminPage'
import { supabaseConfigured } from './lib/supabase'
import BookingPage from './pages/BookingPage'
import AgendaPage from './pages/AgendaPage'
import OnboardingPage from './pages/OnboardingPage'
import LivePage from './pages/LivePage'
import SettingsPage from './pages/SettingsPage'
import ClientsPage from './pages/ClientsPage'
import PosterPage from './pages/PosterPage'
import RemindersPage from './pages/RemindersPage'
import ManagePage from './pages/ManagePage'
import QueuePage from './pages/QueuePage'
import QueueJoinPage from './pages/QueueJoinPage'
import SchedulePage from './pages/SchedulePage'
import WeekPage from './pages/WeekPage'
import PricesPage from './pages/PricesPage'
import StatsPage from './pages/StatsPage'
import LandingPage from './pages/LandingPage'
import TeamPage from './pages/TeamPage'
import InvitePage from './pages/InvitePage'
import ClubPage from './pages/ClubPage'
import AiPage from './pages/AiPage'
import BrandPage from './pages/BrandPage'
import OfferPage from './pages/OfferPage'
import PromosPage from './pages/PromosPage'
import HomeSettingsPage from './pages/HomeSettingsPage'
import PackagesPage from './pages/PackagesPage'
import PackagePage from './pages/PackagePage'
import RequestPage from './pages/RequestPage'
import BillingPage from './pages/BillingPage'
import PasswordPage from './pages/PasswordPage'
import LegalPage from './pages/LegalPage'
import InstallPage from './pages/InstallPage'
import HelpPage from './pages/HelpPage'
import StylesPage from './pages/StylesPage'
import { LEGAL_DOCS } from './lib/legal'

export default function App() {
  const tabs = usePanelTabs()
  // Room at the bottom of every panel page for the tab bar.
  useEffect(() => { document.body.classList.toggle('has-tabs', tabs) }, [tabs])
  return (
    <>
      {!supabaseConfigured && (
        <div className="banner">Falta configurar o Supabase: copie <code>.env.example</code> para <code>.env.local</code>.</div>
      )}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/s/:slug" element={<BookingPage />} />
        <Route path="/s/:slug/pacote/:id" element={<PackagePage />} />
        <Route path="/pedido/:id" element={<RequestPage />} />
        <Route path="/painel" element={<AgendaPage />} />
        <Route path="/registar" element={<OnboardingPage />} />
        <Route path="/no-ar" element={<LivePage />} />
        <Route path="/definicoes" element={<SettingsPage />} />
        <Route path="/clientes" element={<ClientsPage />} />
        <Route path="/poster" element={<PosterPage />} />
        <Route path="/lembretes" element={<RemindersPage />} />
        <Route path="/m/:id" element={<ManagePage />} />
        <Route path="/vaga/:id" element={<OfferPage />} />
        <Route path="/marca" element={<BrandPage />} />
        <Route path="/promocoes" element={<PromosPage />} />
        <Route path="/domicilio" element={<HomeSettingsPage />} />
        <Route path="/pacotes" element={<PackagesPage />} />
        <Route path="/fila" element={<QueuePage />} />
        <Route path="/horarios" element={<SchedulePage />} />
        <Route path="/semana" element={<WeekPage />} />
        <Route path="/mais" element={<MorePage />} />
        <Route path="/ajuda" element={<HelpPage />} />
        <Route path="/app" element={<InstallPage />} />
        <Route path="/instalar" element={<InstallPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/precos" element={<PricesPage />} />
        <Route path="/estatisticas" element={<StatsPage />} />
        <Route path="/equipa" element={<TeamPage />} />
        <Route path="/acessos" element={<TeamPage />} />
        <Route path="/convidar" element={<InvitePage />} />
        <Route path="/clube" element={<ClubPage />} />
        <Route path="/ia" element={<AiPage />} />
        <Route path="/estilos" element={<StylesPage />} />
        <Route path="/assinatura" element={<BillingPage />} />
        <Route path="/palavra-passe" element={<PasswordPage />} />
        <Route path="/f/:slug" element={<QueueJoinPage />} />
        {LEGAL_DOCS.map(d => <Route key={d.id} path={d.path} element={<LegalPage doc={d} />} />)}
        <Route path="*" element={<main className="page"><h1>Página não encontrada</h1></main>} />
      </Routes>
      {tabs && <TabBar />}
    </>
  )
}
