import { Link, Route, Routes } from 'react-router-dom'
import { supabaseConfigured } from './lib/supabase'
import BookingPage from './pages/BookingPage'
import AgendaPage from './pages/AgendaPage'

function Home() {
  return (
    <main className="page">
      <h1>CorteCerto</h1>
      <p>Marcações simples para barbearias, cabeleireiros, unhas e depilação.</p>
      <p><Link className="btn" to="/painel">Entrar no painel do salão</Link></p>
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
        <Route path="*" element={<main className="page"><h1>Página não encontrada</h1></main>} />
      </Routes>
    </>
  )
}
