import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { atLeast, can, LEVELS, levelLabel, type Level } from '../lib/access'
import { NO_PAY, parsePay, payLabel, type Pay } from '../lib/commission'
import { themeById, themeStyle } from '../lib/themes'
import { waLink } from '../lib/whatsapp'
import HelpLink from '../HelpLink'
import { publicOrigin } from '../lib/publicOrigin'

interface Pro { id?: string; name: string; active: boolean }
interface Member { user_id: string; email: string; professional_id: string | null; created_at: string; access?: Level }
interface Invite { id: string; email: string; professional_id: string | null; created_at: string; access?: Level }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const TYPES: { id: Pay['commission_type']; label: string }[] = [
  { id: 'nenhuma', label: 'Sem comissão' },
  { id: 'percentagem', label: 'Percentagem (%)' },
  { id: 'montante', label: 'Montante fixo (€)' },
]

/** One professional: name, active, and commission. */
function ProRow({ salonId, pro, pay, payReady, onSaved }: {
  salonId: string; pro: Pro; pay: Pay | undefined; payReady: boolean; onSaved: () => void
}) {
  const [name, setName] = useState(pro.name)
  const [active, setActive] = useState(pro.active)
  const [type, setType] = useState<Pay['commission_type']>(pay?.commission_type ?? 'nenhuma')
  const [value, setValue] = useState(pay?.commission_type === 'percentagem' ? String(pay.commission_percent ?? '').replace('.', ',')
    : pay?.commission_type === 'montante' ? ((pay.commission_cents ?? 0) / 100).toFixed(2).replace('.', ',') : '')
  const [state, setState] = useState<{ ok: boolean; text: string }>()

  async function save() {
    setState(undefined)
    if (!name.trim()) { setState({ ok: false, text: 'Indique o nome.' }); return }
    const parsed = parsePay(type, value)
    if (typeof parsed === 'string') { setState({ ok: false, text: parsed }); return }
    const row = { salon_id: salonId, name: name.trim(), active }
    const res = pro.id
      ? await supabase.from('professionals').update(row).eq('id', pro.id).select('id').single()
      : await supabase.from('professionals').insert(row).select('id').single()
    if (res.error || !res.data) { setState({ ok: false, text: 'Não foi possível guardar.' }); return }
    if (payReady) {
      const p = await supabase.from('professional_pay').upsert({
        professional_id: res.data.id, salon_id: salonId, commission_type: type,
        commission_percent: parsed.percent, commission_cents: parsed.cents, updated_at: new Date().toISOString(),
      })
      if (p.error) { setState({ ok: false, text: 'O nome ficou guardado, a comissão não. Tente de novo.' }); return }
    }
    setState({ ok: true, text: 'Guardado ✓' })
    onSaved()
  }

  return (
    <div className={active ? 'card team-pro' : 'card team-pro off'}>
      <div className="row">
        <input aria-label="Nome do profissional" placeholder="Nome" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1 }} />
        <label className="check"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Ativo</label>
      </div>
      {payReady && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label style={{ flex: 1 }}>Comissão
            <select value={type} onChange={e => setType(e.target.value as Pay['commission_type'])}>
              {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          {type !== 'nenhuma' && (
            <label style={{ width: 120 }}>{type === 'percentagem' ? '% por visita' : '€ por visita'}
              <input inputMode="decimal" value={value} placeholder={type === 'percentagem' ? '40' : '5,00'} onChange={e => setValue(e.target.value)} />
            </label>
          )}
        </div>
      )}
      <div className="row">
        <small className="muted">{payReady ? payLabel(pay, euros) : ''}</small>
        <span className="row">
          {state && <span className={state.ok ? 'ok small' : 'error small'}>{state.text}</span>}
          <button onClick={save}>{pro.id ? 'Guardar' : 'Adicionar'}</button>
        </span>
      </div>
    </div>
  )
}

/** Team: professionals and their commission (managers), and who has access to the panel at which level (owner). */
export default function TeamPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [pros, setPros] = useState<Pro[]>([])
  const [pay, setPay] = useState<Record<string, Pay>>({})
  const [payReady, setPayReady] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [missing, setMissing] = useState(false)
  const [levelsReady, setLevelsReady] = useState(false)
  const [email, setEmail] = useState('')
  const [proId, setProId] = useState('')
  const [level, setLevel] = useState<Level>('agenda')
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [lastInvite, setLastInvite] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => { setRole(r.role); setSalon(r.salon) })
  }, [session])

  const load = useCallback(async () => {
    if (!salon) return
    const [pr, py, mb, iv] = await Promise.all([
      supabase.from('professionals').select('id,name,active').eq('salon_id', salon.id).order('name'),
      supabase.from('professional_pay').select('professional_id,commission_type,commission_percent,commission_cents').eq('salon_id', salon.id),
      role === 'dono' ? supabase.from('salon_members').select('*').eq('salon_id', salon.id).order('created_at') : Promise.resolve({ data: [], error: null }),
      role === 'dono' ? supabase.from('salon_invites').select('*').eq('salon_id', salon.id).is('accepted_at', null).order('created_at') : Promise.resolve({ data: [], error: null }),
    ])
    setPros(pr.data ?? [])
    // Before migration 0018 there are no commissions or levels; before 0013, no team accounts.
    setPayReady(!py.error)
    setPay(Object.fromEntries(((py.data ?? []) as Pay[]).map(p => [p.professional_id, p])))
    setMissing(Boolean(mb.error))
    setLevelsReady(!mb.error && (mb.data?.length ? 'access' in (mb.data[0] as object) : !py.error))
    setMembers((mb.data ?? []) as Member[]); setInvites((iv.data ?? []) as Invite[])
    setVersion(v => v + 1)
  }, [salon, role])
  useEffect(() => { load() }, [load])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (!can(role, 'equipa')) return <Navigate to="/painel" replace />

  const active = pros.filter(p => p.active)
  const proName = (id: string | null) => (id && pros.find(p => p.id === id)?.name) || 'Sem profissional associado'
  const shareText = (to: string) => `Olá! Dei-te acesso à agenda do ${salon.name} na CorteCerto. Entra em ${publicOrigin()}/painel com o email ${to} e segue o link que recebes.`

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setMsg(undefined)
    const to = email.trim().toLowerCase()
    if (!EMAIL.test(to)) { setMsg({ ok: false, text: 'Indique um email válido.' }); return }
    if (to === session!.user.email?.toLowerCase()) { setMsg({ ok: false, text: 'Esse é o seu próprio email.' }); return }
    if (members.some(m => m.email === to)) { setMsg({ ok: false, text: 'Essa pessoa já tem acesso.' }); return }
    const { error } = await supabase.from('salon_invites').insert({ salon_id: salon!.id, email: to, professional_id: proId || null, ...(levelsReady ? { access: level } : {}) })
    if (error) { setMsg({ ok: false, text: error.message.includes('salon_invites_open') ? 'Já há um convite para esse email.' : 'Não foi possível criar o convite.' }); return }
    setLastInvite(to); setEmail(''); setProId('')
    setMsg({ ok: true, text: `Convite criado com acesso ${levelLabel(level)}. Quando ${to} entrar no painel com esse email, fica com acesso.` })
    load()
  }

  async function changeLevel(m: Member, access: Level) {
    const { data, error } = await supabase.from('salon_members').update({ access }).eq('salon_id', salon!.id).eq('user_id', m.user_id).select('user_id')
    if (!error && data?.length) setMembers(ms => ms.map(x => x.user_id === m.user_id ? { ...x, access } : x))
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
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page">
      <header className="row"><h1>Equipa<HelpLink /></h1><Link to="/mais">‹ Mais</Link></header>

      <h2>Profissionais e comissões</h2>
      {!payReady && <p className="banner small">Para registar comissões, corra <code>supabase/migrations/0018_team_clients_club_ai.sql</code> no editor SQL do Supabase.</p>}
      <p className="muted small">A comissão conta em cada visita concluída: uma percentagem do preço da marcação ou um montante fixo. O total por profissional aparece nas <Link to="/estatisticas">Estatísticas</Link>.</p>
      {pros.map(p => <ProRow key={`${p.id}-${version}`} salonId={salon.id} pro={p} pay={p.id ? pay[p.id] ?? NO_PAY(p.id) : undefined} payReady={payReady} onSaved={load} />)}
      {adding
        ? <ProRow key={`novo-${version}`} salonId={salon.id} pro={{ name: '', active: true }} pay={undefined} payReady={payReady} onSaved={() => { setAdding(false); load() }} />
        : <button type="button" onClick={() => setAdding(true)}>+ Adicionar profissional</button>}

      {role === 'dono' && <>
        <h2>Acessos ao painel</h2>
        {missing ? <p className="banner">Para dar acesso à equipa, corra <code>supabase/migrations/0013_team_accounts.sql</code> no editor SQL do Supabase.</p> : <>
          <div className="levels">
            {LEVELS.map(l => (
              <div key={l.id} className="card level">
                <strong>{l.label}</strong> <small className="muted">· {l.short}</small>
                <ul className="small">{l.can.map(c => <li key={c}>{c}</li>)}</ul>
                <p className="muted small" style={{ margin: 0 }}>{l.cannot}</p>
              </div>
            ))}
          </div>
          {!levelsReady && <p className="banner small">Para escolher o nível de acesso, corra <code>supabase/migrations/0018_team_clients_club_ai.sql</code>. Até lá, quem tem acesso fica como Receção.</p>}

          <form className="card" onSubmit={invite}>
            <strong>Dar acesso</strong>
            <label>Email da pessoa<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" /></label>
            {levelsReady && (
              <label>Nível de acesso
                <select value={level} onChange={e => setLevel(e.target.value as Level)}>
                  {LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}: {l.short}</option>)}
                </select>
              </label>
            )}
            {active.length > 0 && (
              <label>É o profissional
                <select value={proId} onChange={e => setProId(e.target.value)}>
                  <option value="">Ninguém em particular (receção)</option>
                  {active.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
            <div key={m.user_id} className="card">
              <div className="row">
                <span><strong>{m.email}</strong><br /><small className="muted">{proName(m.professional_id)}</small></span>
                <button className="link danger-link" onClick={() => removeMember(m)}>Tirar acesso</button>
              </div>
              {levelsReady && (
                <label>Nível
                  <select value={m.access ?? 'rececao'} onChange={e => changeLevel(m, e.target.value as Level)}>
                    {LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}: {l.short}</option>)}
                  </select>
                </label>
              )}
            </div>
          ))}

          {invites.length > 0 && <>
            <h2>Convites por aceitar</h2>
            {invites.map(i => (
              <div key={i.id} className="card row">
                <span><strong>{i.email}</strong><br /><small className="muted">{levelsReady ? `${levelLabel(i.access ?? 'rececao')} · ` : ''}{proName(i.professional_id)} · válido 14 dias</small></span>
                <span className="row">
                  <a href={waLink('', shareText(i.email))} target="_blank" rel="noreferrer">Avisar</a>
                  <button className="link" onClick={() => removeInvite(i)}>Cancelar</button>
                </span>
              </div>
            ))}
          </>}
        </>}
      </>}
      {role !== 'dono' && atLeast(role, 'gestor') && <p className="muted small">Os acessos ao painel são geridos pelo dono do salão.</p>}
    </main></div>
  )
}
