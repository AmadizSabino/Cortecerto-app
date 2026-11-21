import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Salon } from '../lib/supabase'
import type { Walkin } from '../lib/queue'
import { formatTime } from '../lib/time'
import { formatPhone, waLink } from '../lib/whatsapp'
import { themeById, themeStyle } from '../lib/themes'

/** The salon's walk-in queue: open or close it, call people by WhatsApp, add people at the counter. */
export default function QueuePage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<(Salon & { queue_open?: boolean }) | null>()
  const [list, setList] = useState<Walkin[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    supabase.from('salons').select('*').eq('owner_id', session.user.id).maybeSingle().then(({ data }) => setSalon(data))
  }, [session])

  const refresh = useCallback(async () => {
    if (!salon) return
    const { data, error } = await supabase.from('walkins').select('*').eq('salon_id', salon.id)
      .in('status', ['espera', 'chamado']).order('created_at')
    // Before migration 0008 the table doesn't exist.
    if (error) { setMissing(true); setList([]); return }
    setList(data ?? [])
  }, [salon])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 15000)
    return () => clearInterval(t)
  }, [refresh])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />

  const tz = salon.timezone
  const joinLink = `${location.origin}/f/${salon.slug}`
  const waiting = (list ?? []).filter(w => w.status === 'espera')

  async function toggle() {
    const open = !salon!.queue_open
    const { error } = await supabase.from('salons').update({ queue_open: open }).eq('id', salon!.id)
    if (!error) setSalon({ ...salon!, queue_open: open })
  }

  async function setStatus(w: Walkin, status: Walkin['status']) {
    const now = new Date().toISOString()
    const patch = status === 'chamado' ? { status, called_at: now } : { status, finished_at: now }
    const { error } = await supabase.from('walkins').update(patch).eq('id', w.id)
    if (!error) refresh()
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const digits = phone.replace(/\D/g, '')
    if (!name.trim()) { setError('Indique o nome.'); return }
    if (digits && digits.length < 9) { setError('Telemóvel inválido.'); return }
    const { error } = await supabase.from('walkins').insert({ salon_id: salon!.id, client_name: name.trim(), client_phone: phone.trim() || null })
    if (error) { setError(error.message.includes('walkins_one_per_phone') ? 'Esse telemóvel já está na fila.' : 'Não foi possível adicionar.'); return }
    setName(''); setPhone(''); refresh()
  }

  const first = (n: string) => n.trim().split(/\s+/)[0]
  const turnMsg = (w: Walkin) => `Olá ${first(w.client_name)}! É a sua vez no ${salon.name}. Pode vir ao balcão.`
  const soonMsg = (w: Walkin) => `Olá ${first(w.client_name)}! Está quase a sua vez no ${salon.name}. Venha até ao salão, por favor.`

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page wide">
      <header className="row">
        <h1>Fila de espera</h1>
        <Link to="/painel">‹ Agenda</Link>
      </header>

      {missing ? (
        <p className="banner">Para usar a fila, corra <code>supabase/migrations/0008_walkin_queue.sql</code> no editor SQL do Supabase.</p>
      ) : <>
        <div className="card row">
          <span><strong>{salon.queue_open ? 'Fila aberta' : 'Fila fechada'}</strong><br />
            <small className="muted">{salon.queue_open ? 'Os clientes podem entrar pelo QR.' : 'Abra a fila para aceitar clientes sem marcação.'}</small></span>
          <button className={salon.queue_open ? '' : 'btn-inline'} onClick={toggle}>{salon.queue_open ? 'Fechar fila' : 'Abrir fila'}</button>
        </div>
        <p className="muted small">Link da fila: <a href={joinLink}>{joinLink}</a> · <Link to="/poster?fila=1">Poster com QR da fila</Link></p>

        {list === null ? <p className="muted">A carregar…</p> : <>
          <p>{waiting.length === 0 ? 'Ninguém à espera.' : `${waiting.length} ${waiting.length === 1 ? 'pessoa' : 'pessoas'} à espera`}</p>
          {list.map(w => {
            const pos = waiting.indexOf(w) + 1
            return (
              <article key={w.id} className={`card booking ${w.status === 'chamado' ? 'called' : ''}`}>
                <div className="row">
                  <strong>{w.status === 'chamado' ? 'Chamado' : `${pos}.º`}</strong>
                  <span>{w.client_name}</span>
                  <span className="muted small">chegou às {formatTime(new Date(w.created_at), tz)}</span>
                </div>
                {w.client_phone && <div className="muted">{formatPhone(w.client_phone)}</div>}
                <div className="actions">
                  {w.status === 'espera' && <>
                    {w.client_phone
                      ? <a className="wa" href={waLink(w.client_phone, turnMsg(w))} target="_blank" rel="noreferrer" onClick={() => setStatus(w, 'chamado')}>Chamar</a>
                      : <button onClick={() => setStatus(w, 'chamado')}>Chamar</button>}
                    {w.client_phone && pos > 1 && pos <= 3 && <a className="wa" href={waLink(w.client_phone, soonMsg(w))} target="_blank" rel="noreferrer">Avisar que está quase</a>}
                  </>}
                  <button onClick={() => setStatus(w, 'atendido')}>Atendido</button>
                  <button onClick={() => setStatus(w, 'saiu')}>Saiu</button>
                </div>
              </article>
            )
          })}
        </>}

        <form className="card" onSubmit={add}>
          <strong>Adicionar quem está no balcão</strong>
          <label>Nome<input value={name} onChange={e => setName(e.target.value)} /></label>
          <label>Telemóvel (opcional)<input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" /></label>
          {error && <p className="error">{error}</p>}
          <button>Adicionar à fila</button>
        </form>
      </>}
    </main></div>
  )
}
