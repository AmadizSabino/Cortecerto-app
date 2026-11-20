import { Link, Route, Routes } from 'react-router-dom'
import Icon from './components/Icon'
import { supabaseConfigured } from './lib/supabase'
import BookingPage from './pages/BookingPage'
import OnboardingPage from './pages/OnboardingPage'
import SettingsPage from './pages/SettingsPage'
import ClientsPage from './pages/panel/ClientsPage'
import PanelLayout from './pages/panel/PanelLayout'
import PosterPage from './pages/panel/PosterPage'
import TodayPage from './pages/panel/TodayPage'

function Home() {
  return (
    <div className="themed">
      <div className="cover" style={{ height: 220 }} />
      <main className="page" style={{ marginTop: -80 }}>
        <span className="avatar" style={{ width: 72, height: 72, fontSize: '1.6rem', border: '4px solid var(--bg)', borderRadius: 20 }}><Icon name="scissors" size={32} /></span>
        <h1 style={{ marginTop: 16, fontSize: '2.4rem' }}>CorteCerto</h1>
        <p style={{ marginTop: 10, fontSize: '1.1rem' }}>A agenda online da sua barbearia ou salão. Os clientes marcam sozinhos, pagam o sinal por MB Way e recebem lembretes por WhatsApp.</p>
        <div className="stack section">
          <div className="card row"><Icon name="calendar" /><span>Marcações 24 horas por dia, num link para o Instagram</span></div>
          <div className="card row"><Icon name="euro" /><span>Sinal por MB Way direto para o salão, menos faltas</span></div>
          <div className="card row"><Icon name="bell" /><span>Lembretes por WhatsApp num toque</span></div>
          <div className="card row"><Icon name="qr" /><span>Poster QR pronto a imprimir</span></div>
        </div>
        <div className="stack section">
          <Link className="btn primary block" to="/painel">Entrar ou criar o meu salão</Link>
        </div>
        <p className="foot muted">Feito em Portugal · CorteCerto</p>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <>
      {!supabaseConfigured && <div className="banner">Falta configurar o Supabase: copie <code>.env.example</code> para <code>.env.local</code>.</div>}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/s/:slug" element={<BookingPage />} />
        <Route path="/registar" element={<OnboardingPage />} />
        <Route path="/painel" element={<PanelLayout />}>
          <Route index element={<TodayPage />} />
          <Route path="clientes" element={<ClientsPage />} />
          <Route path="poster" element={<PosterPage />} />
          <Route path="definicoes" element={<SettingsPage />} />
        </Route>
        <Route path="/definicoes" element={<PanelLayout />}><Route index element={<SettingsPage />} /></Route>
        <Route path="*" element={<main className="page"><h1>Página não encontrada</h1><p className="muted" style={{ marginTop: 8 }}><Link to="/">Voltar ao início</Link></p></main>} />
      </Routes>
    </>
  )
}
