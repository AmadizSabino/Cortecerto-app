import { Link, Route, Routes } from 'react-router-dom'
import { supabaseConfigured } from './lib/supabase'
import BookingPage from './pages/BookingPage'
import AgendaPage from './pages/AgendaPage'
import OnboardingPage from './pages/OnboardingPage'
import SettingsPage from './pages/SettingsPage'
import ClientsPage from './pages/ClientsPage'
import PosterPage from './pages/PosterPage'
import LegalPage from './pages/LegalPage'
import { LEGAL_DOCS } from './lib/legal'

function Home() {
  return (
    <main className="page">
      <h1>CorteCerto</h1>
      <p>Marcações simples para barbearias, cabeleireiros, unhas e depilação.</p>
      <p><Link className="btn" to="/painel">Entrar no painel do salão</Link></p>
      <p className="muted">Ainda não tem conta? Entre com o seu email e crie o salão a seguir.</p>
      <nav className="foot">{LEGAL_DOCS.map(d => <p key={d.id}><Link to={d.path}>{d.title}</Link></p>)}</nav>
    </main>
  )
}

export default function App() {
  return (
    <>
      {!supabaseConfigured && (
        <div className="banner">Falta configurar o Supabase: copie <code>.env.example</code> para <code>.env.local</code>.</div>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/s/:slug" element={<BookingPage />} />
        <Route path="/painel" element={<AgendaPage />} />
        <Route path="/registar" element={<OnboardingPage />} />
        <Route path="/definicoes" element={<SettingsPage />} />
        <Route path="/clientes" element={<ClientsPage />} />
        <Route path="/poster" element={<PosterPage />} />
        {LEGAL_DOCS.map(d => <Route key={d.id} path={d.path} element={<LegalPage doc={d} />} />)}
        <Route path="*" element={<main className="page"><h1>Página não encontrada</h1></main>} />
      </Routes>
    </>
  )
}
