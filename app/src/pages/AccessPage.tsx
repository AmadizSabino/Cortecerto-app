import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Professional, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { waLink } from '../lib/whatsapp'

interface Member { user_id: string; email: string; professional_id: string | null; created_at: string }
interface Invite { id: string; email: string; professional_id: string | null; created_at: string }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** The owner gives team members their own sign-in to the panel. */
export default function AccessPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [pros, setPros] = useState<Professional[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [missing, setMissing] = useState(false)
  const [email, setEmail] = useState('')
  const [proId, setProId] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [lastInvite, setLastInvite] = useState<string | null>(null)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => { setRole(r.role); setSalon(r.salon) })
  }, [session])

  const load = useCallback(async () => {
    if (!salon) return
    const [pr, mb, iv] = await Promise.all([
      supabase.from('professionals').select('id,name').eq('salon_id', salon.id).eq('active', true).order('name'),
      supabase.from('salon_members').select('user_id,email,professional_id,created_at').eq('salon_id', salon.id).order('created_at'),
      supabase.from('salon_invites').select('id,email,professional_id,created_at').eq('salon_id', salon.id).is('accepted_at', null).order('created_at'),
    ])
    // Before migration 0013 the tables don't exist.
    setMissing(Boolean(mb.error))
    setPros(pr.data ?? []); setMembers(mb.data ?? []); setInvites(iv.data ?? [])
  }, [salon])
  useEffect(() => { load() }, [load])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (role !== 'dono') return <Navigate to="/painel" replace />

  const proName = (id: string | null) => (id && pros.find(p => p.id === id)?.name) || 'Sem profissional associado'
  const shareText = (to: string) => `Olá! Dei-te acesso à agenda do ${salon.name} na CorteCerto. Entra em ${location.origin}/painel com o email ${to} e segue o link que recebes.`

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setMsg(undefined)
    const to = email.trim().toLowerCase()
    if (!EMAIL.test(to)) { setMsg({ ok: false, text: 'Indique um email válido.' }); return }
    if (to === session!.user.email?.toLowerCase()) { setMsg({ ok: false, text: 'Esse é o seu próprio email.' }); return }
    if (members.some(m => m.email === to)) { setMsg({ ok: false, text: 'Essa pessoa já tem acesso.' }); return }
    const { error } = await supabase.from('salon_invites').insert({ salon_id: salon!.id, email: to, professional_id: proId || null })
    if (error) { setMsg({ ok: false, text: error.message.includes('salon_invites_open') ? 'Já há um convite para esse email.' : 'Não foi possível criar o convite.' }); return }
    setLastInvite(to); setEmail(''); setProId('')
    setMsg({ ok: true, text: `Convite criado. Quando ${to} entrar no painel com esse email, fica com acesso.` })
    load()
  }

  async function removeMember(m: Member) {
    const { error } = await supabase.from('salon_members').delete().eq('salon_id', salon!.id).eq('user_id', m.user_id)
    if (!error) setMembers(ms => ms.filter(x => x.user_id !== m.user_id))
  }

  async function removeInvite(i: Invite) {
    const { error } = await supabase.from('salon_invites').delete().eq('id', i.id)
    if (!error) setInvites(is => is.filter(x => x.id !== i.id))
  }

  return (
    <main className="page">
      <header className="row"><h1>Acessos da equipa</h1><Link to="/mais">‹ Mais</Link></header>
      {missing ? <p className="banner">Para dar acesso à equipa, corra <code>supabase/migrations/0013_team_accounts.sql</code> no editor SQL do Supabase.</p> : <>
        <p className="muted">Quem tem acesso vê e gere a agenda, a semana, os clientes, a fila e os lembretes. As definições, os preços, os horários, as estatísticas e a exportação de dados ficam só consigo.</p>

        <form className="card" onSubmit={invite}>
          <strong>Dar acesso</strong>
          <label>Email da pessoa<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" /></label>
          {pros.length > 0 && (
            <label>É o profissional
              <select value={proId} onChange={e => setProId(e.target.value)}>
                <option value="">Ninguém em particular (receção)</option>
                {pros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          <button>Criar convite</button>
        </form>
        {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
        {lastInvite && (
          <div className="actions">
            <a className="wa" href={waLink('', shareText(lastInvite))} target="_blank" rel="noreferrer">Avisar por WhatsApp</a>
          </div>
        )}

        <h2>Com acesso</h2>
        {members.length === 0 ? <p className="muted">Ainda ninguém além de si.</p> : members.map(m => (
          <div key={m.user_id} className="card row">
            <span><strong>{m.email}</strong><br /><small className="muted">{proName(m.professional_id)}</small></span>
            <button className="link danger-link" onClick={() => removeMember(m)}>Tirar acesso</button>
          </div>
        ))}

        {invites.length > 0 && <>
          <h2>Convites por aceitar</h2>
          {invites.map(i => (
            <div key={i.id} className="card row">
              <span><strong>{i.email}</strong><br /><small className="muted">{proName(i.professional_id)} · válido 14 dias</small></span>
              <span className="row">
                <a href={waLink('', shareText(i.email))} target="_blank" rel="noreferrer">Avisar</a>
                <button className="link" onClick={() => removeInvite(i)}>Cancelar</button>
              </span>
            </div>
          ))}
        </>}
      </>}
    </main>
  )
}
