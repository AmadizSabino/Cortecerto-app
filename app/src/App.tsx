import { Route, Routes } from 'react-router-dom'
import { supabaseConfigured } from './lib/supabase'
import BookingPage from './pages/BookingPage'
import AgendaPage from './pages/AgendaPage'
import OnboardingPage from './pages/OnboardingPage'
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
import LegalPage from './pages/LegalPage'
import { LEGAL_DOCS } from './lib/legal'

export default function App() {
  return (
    <>
      {!supabaseConfigured && (
        <div className="banner">Falta configurar o Supabase: copie <code>.env.example</code> para <code>.env.local</code>.</div>
      )}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/s/:slug" element={<BookingPage />} />
        <Route path="/painel" element={<AgendaPage />} />
        <Route path="/registar" element={<OnboardingPage />} />
        <Route path="/definicoes" element={<SettingsPage />} />
        <Route path="/clientes" element={<ClientsPage />} />
        <Route path="/poster" element={<PosterPage />} />
        <Route path="/lembretes" element={<RemindersPage />} />
        <Route path="/m/:id" element={<ManagePage />} />
        <Route path="/fila" element={<QueuePage />} />
        <Route path="/horarios" element={<SchedulePage />} />
        <Route path="/semana" element={<WeekPage />} />
        <Route path="/precos" element={<PricesPage />} />
        <Route path="/estatisticas" element={<StatsPage />} />
        <Route path="/f/:slug" element={<QueueJoinPage />} />
        {LEGAL_DOCS.map(d => <Route key={d.id} path={d.path} element={<LegalPage doc={d} />} />)}
        <Route path="*" element={<main className="page"><h1>Página não encontrada</h1></main>} />
      </Routes>
    </>
  )
}
