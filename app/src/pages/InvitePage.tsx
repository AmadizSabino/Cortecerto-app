import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon, { WhatsAppIcon } from '../components/Icon'
import { supabase, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import { canPickContacts, inviteText, pickContacts, type Picked } from '../lib/contacts'
import { themeById, themeStyle } from '../lib/themes'
import { formatPhone, waLink, waNumber } from '../lib/whatsapp'

interface Invited { phone_key: string; name: string; phone: string; invited_at: string | null; source: string }

/**
 * Invite clients to book online: type a number or pick from the phone's contacts,
 * then send the booking link by WhatsApp. Each invited client goes into the
 * salon's client list (salon_clients, migration 0018).
 */
export default function InvitePage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [picked, setPicked] = useState<Picked[]>([])
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [recent, setRecent] = useState<Invited[]>([])
  const [ready, setReady] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => { setRole(r.role); setSalon(r.salon) })
  }, [session])
  useEffect(() => {
    if (!salon) return
    supabase.from('salon_clients').select('phone_key,name,phone,invited_at,source').eq('salon_id', salon.id)
      .not('invited_at', 'is', null).order('invited_at', { ascending: false }).limit(30)
      .then(({ data, error }) => { setReady(!error); setRecent((data ?? []) as Invited[]) })
  }, [salon, sent])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (!can(role, 'convidar')) return <Navigate to="/painel" replace />

  const link = `${location.origin}/s/${salon.slug}`

  /** Saves the client to the list (keeps an existing name) and opens WhatsApp with the invitation. */
  async function send(p: Picked, source: 'convite' | 'contactos') {
    const key = waNumber(p.phone)
    if (key.length < 11) { setError('Indique um telemóvel válido.'); return }
    setError('')
    // Open WhatsApp first, while it still counts as the tap (browsers block pop-ups opened after waiting).
    window.open(waLink(p.phone, inviteText(p.name, salon!.name, link)), '_blank', 'noreferrer')
    if (ready) {
      const { data: existing } = await supabase.from('salon_clients').select('phone_key').eq('salon_id', salon!.id).eq('phone_key', key).maybeSingle()
      if (existing) await supabase.from('salon_clients').update({ invited_at: new Date().toISOString() }).eq('salon_id', salon!.id).eq('phone_key', key)
      else await supabase.from('salon_clients').insert({ salon_id: salon!.id, phone_key: key, name: p.name.trim() || 'Cliente', phone: p.phone.trim(), source, invited_at: new Date().toISOString() })
    }
    setSent(s => new Set(s).add(key))
  }

  async function fromContacts() {
    setError('')
    try {
      const list = await pickContacts()
      if (list.length === 0) setError('Nenhum contacto com telemóvel escolhido.')
      setPicked(list)
    } catch { setError('Não foi possível abrir os contactos.') }
  }

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page">
      <header className="row"><h1>Convidar clientes</h1><Link to="/mais">‹ Mais</Link></header>
      <p className="muted">Envie o link de marcação por WhatsApp. Cada convidado fica na sua lista de clientes.</p>
      {!ready && <p className="banner small">Para guardar os convidados na lista de clientes, corra <code>supabase/migrations/0018_team_clients_club_ai.sql</code>. O convite por WhatsApp já funciona.</p>}

      {canPickContacts() && (
        <button className="btn ghost" onClick={fromContacts}><Icon name="users" size={18} />Escolher dos contactos</button>
      )}

      {picked.length > 0 && (
        <section className="card">
          <strong>{picked.length} {picked.length === 1 ? 'contacto' : 'contactos'}</strong>
          <p className="muted small">Toque em cada um para abrir o WhatsApp com o convite pronto.</p>
          {picked.map(p => {
            const done = sent.has(waNumber(p.phone))
            return (
              <div key={p.phone} className="row invite-row">
                <span><b>{p.name}</b><br /><small className="muted">{formatPhone(p.phone)}</small></span>
                <button className={done ? '' : 'btn-inline'} onClick={() => send(p, 'contactos')}>{done ? 'Enviado ✓' : 'Convidar'}</button>
              </div>
            )
          })}
        </section>
      )}

      <form className="card" onSubmit={e => { e.preventDefault(); send({ name, phone }, 'convite').then(() => { setName(''); setPhone('') }) }}>
        <strong>Escrever o número</strong>
        <label>Nome<input value={name} onChange={e => setName(e.target.value)} autoComplete="off" placeholder="Ex.: Rui Almeida" /></label>
        <label>Telemóvel<input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="off" placeholder="912 345 678" required /></label>
        {!canPickContacts() && <p className="muted small">Neste telemóvel o browser não deixa escolher dos contactos: escreva o número.</p>}
        <button className="btn wa"><WhatsAppIcon />Enviar convite</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      <details className="card">
        <summary>Ver a mensagem</summary>
        <p className="small" style={{ marginBottom: 0 }}>{inviteText(name || 'Cliente', salon.name, link)}</p>
      </details>

      {recent.length > 0 && <>
        <h2>Convidados recentemente</h2>
        {recent.map(c => (
          <div key={c.phone_key} className="card row">
            <span><b>{c.name}</b><br /><small className="muted">{formatPhone(c.phone)} · {new Date(c.invited_at!).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}</small></span>
            <a href={waLink(c.phone, inviteText(c.name, salon.name, link))} target="_blank" rel="noreferrer">Reenviar</a>
          </div>
        ))}
      </>}
    </main></div>
  )
}
