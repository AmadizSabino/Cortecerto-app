import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { waLink } from '../../lib/whatsapp'
import {
  followUpsDue, instagramUrl, prospectCounts, sortProspects, PROSPECT_LABEL, PROSPECT_STATUS,
  type Prospect, type ProspectStatus,
} from '../../lib/growth'

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
const plusDays = (n: number) => { const d = new Date(today() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const ptDate = (iso: string | null) => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }) : ''
const TAG: Record<ProspectStatus, string> = {
  por_contactar: 'pendente', contactado: 'pendente', demo_marcada: 'confirmada', em_experiencia: 'confirmada', cliente: 'concluida', sem_interesse: 'cancelada',
}
type Form = Omit<Prospect, 'id' | 'created_at' | 'updated_at' | 'salon_id'>
const EMPTY: Form = { name: '', contact_name: '', city: '', phone: '', instagram: '', email: '', source: '', status: 'por_contactar', next_on: null, notes: '' }

function ProspectForm({ initial, salons, onSaved, onCancel }: { initial?: Prospect; salons: { id: string; name: string }[]; onSaved: () => void; onCancel: () => void }) {
  const [f, setF] = useState<Form & { salon_id: string }>({ ...EMPTY, ...initial, salon_id: initial?.salon_id ?? '' })
  const [msg, setMsg] = useState('')
  const field = (k: keyof Form, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <label className="grow">{label}<input value={(f[k] as string | null) ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} {...extra} /></label>

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg('')
    if (!f.name.trim()) return setMsg('Escreva o nome do salão.')
    const clean = (v: string | null) => (v ?? '').trim() || null
    const row = {
      name: f.name.trim(), contact_name: clean(f.contact_name), city: clean(f.city), phone: clean(f.phone), instagram: clean(f.instagram),
      email: clean(f.email), source: clean(f.source), status: f.status, next_on: f.next_on || null, notes: f.notes.trim(),
      salon_id: f.salon_id || null, updated_at: new Date().toISOString(),
    }
    const { error } = initial
      ? await supabase.from('prospects').update(row).eq('id', initial.id)
      : await supabase.from('prospects').insert(row)
    if (error) return setMsg(error.message.includes('email') ? 'Email inválido.' : 'Não foi possível guardar.')
    onSaved()
  }
  async function remove() {
    if (!initial) return
    await supabase.from('prospects').delete().eq('id', initial.id)
    onSaved()
  }

  return (
    <form onSubmit={save} className="card soft">
      <strong>{initial ? 'Editar contacto' : 'Novo contacto'}</strong>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {field('name', 'Salão', { placeholder: 'Ex.: Barbearia do Zé', autoFocus: !initial })}
        {field('city', 'Localidade')}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {field('contact_name', 'Pessoa')}
        {field('phone', 'Telefone ou WhatsApp', { inputMode: 'tel' })}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {field('instagram', 'Instagram', { placeholder: '@barbeariadoze' })}
        {field('email', 'Email', { type: 'email' })}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="grow">Estado
          <select value={f.status} onChange={e => setF({ ...f, status: e.target.value as ProspectStatus })}>
            {PROSPECT_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="grow">Voltar a falar a<input type="date" value={f.next_on ?? ''} onChange={e => setF({ ...f, next_on: e.target.value || null })} /></label>
      </div>
      <div className="chips">
        {[['Amanhã', 1], ['Daqui a 3 dias', 3], ['Daqui a 1 semana', 7], ['Daqui a 1 mês', 30]].map(([l, n]) => (
          <button type="button" key={l} className="chip" onClick={() => setF({ ...f, next_on: plusDays(n as number) })}>{l}</button>
        ))}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {field('source', 'Como o encontrou', { placeholder: 'Ex.: Instagram, passei à porta, indicação do Rui' })}
        <label className="grow">Já criou conta?
          <select value={f.salon_id} onChange={e => setF({ ...f, salon_id: e.target.value })}>
            <option value="">Ainda não</option>
            {[...salons].sort((a, b) => a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <label>Notas<textarea rows={3} maxLength={4000} value={f.notes} placeholder="Ex.: 3 cadeiras, usa agenda de papel, pediu para voltar depois das 15h" onChange={e => setF({ ...f, notes: e.target.value })} /></label>
      <div className="row">
        <button className="btn-inline">Guardar</button>
        <button type="button" className="link" onClick={onCancel}>Cancelar</button>
        {initial && <button type="button" className="link danger-link" onClick={remove}>Apagar</button>}
      </div>
      {msg && <p className="error">{msg}</p>}
    </form>
  )
}

/** /admin > Contactos: the salons being approached, and who to call back today. */
export function AdminProspects({ salons, onOpen }: { salons: { id: string; name: string }[]; onOpen: (salonId: string) => void }) {
  const [list, setList] = useState<Prospect[] | null>()
  const [filter, setFilter] = useState<ProspectStatus | 'abertos' | 'todos'>('abertos')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Prospect | 'novo' | null>(null)
  const load = () => supabase.from('prospects').select('*').then(({ data, error }) => setList(error ? null : (data ?? []) as Prospect[]))
  useEffect(() => { load() }, [])

  if (list === undefined) return <p className="muted">A carregar…</p>
  if (list === null) return <p className="card warn small">Os contactos precisam da migração 0028 (supabase/migrations/0028_admin_growth.sql).</p>

  const t = today()
  const due = followUpsDue(list, t)
  const counts = prospectCounts(list)
  const names = new Map(salons.map(s => [s.id, s.name]))
  const needle = q.trim().toLowerCase()
  const shown = sortProspects(list, t)
    .filter(p => filter === 'todos' || (filter === 'abertos' ? !['cliente', 'sem_interesse'].includes(p.status) : p.status === filter))
    .filter(p => !needle || [p.name, p.city, p.contact_name, p.phone, p.instagram, p.notes].some(v => (v ?? '').toLowerCase().includes(needle)))
  const done = () => { setEditing(null); load() }
  const open = list.length - counts.cliente - counts.sem_interesse

  return (
    <>
      <div className="stats kpis">
        <div className="stat"><b>{open}</b><span>Em conversa</span></div>
        <div className="stat"><b>{due.length}</b><span>Para falar hoje</span></div>
        <div className="stat"><b>{counts.demo_marcada}</b><span>Demos marcadas</span></div>
        <div className="stat"><b>{counts.cliente}</b><span>Passaram a clientes</span></div>
      </div>

      {due.length > 0 && (
        <section className="card">
          <h2>Para falar hoje</h2>
          <ul className="todo">
            {due.map(p => (
              <li key={p.id}>
                <span className={`dot ${p.next_on! < t ? 'alta' : 'media'}`} aria-hidden />
                <button className="link" onClick={() => setEditing(p)}>{p.name}</button>
                <span className="muted">{PROSPECT_LABEL[p.status]}{p.next_on! < t ? ` · desde ${ptDate(p.next_on)}` : ''}{p.notes ? ` · ${p.notes.slice(0, 80)}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && <ProspectForm key={editing === 'novo' ? 'novo' : editing.id} initial={editing === 'novo' ? undefined : editing} salons={salons} onSaved={done} onCancel={() => setEditing(null)} />}

      <section className="card">
        <div className="row"><h2>Contactos</h2>{!editing && <button className="btn-inline" onClick={() => setEditing('novo')}>Novo contacto</button>}</div>
        <div className="chips">
          {([['abertos', `Em conversa (${open})`], ...PROSPECT_STATUS.map(([k, l]) => [k, `${l} (${counts[k]})`]), ['todos', `Todos (${list.length})`]] as [typeof filter, string][]).map(([k, l]) => (
            <button key={k} className={`chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <label>Procurar<input type="search" value={q} placeholder="Nome, localidade, telefone, notas" onChange={e => setQ(e.target.value)} /></label>
        {shown.length === 0 && <p className="muted">{list.length ? 'Nenhum contacto neste filtro.' : 'Ainda sem contactos. Junte os salões com quem vai falar, e a data para voltar a falar: aparecem aqui no dia.'}</p>}
        <ul className="history docs">
          {shown.map(p => {
            const ig = instagramUrl(p.instagram)
            const phone = (p.phone ?? '').replace(/\D/g, '')
            return (
              <li key={p.id}>
                <span className={`tag ${TAG[p.status]}`}>{PROSPECT_LABEL[p.status]}</span>
                <span>
                  <button className="link" style={{ marginTop: 0 }} onClick={() => setEditing(p)}><b>{p.name}</b></button>
                  {p.city && ` · ${p.city}`}{p.contact_name && ` · ${p.contact_name}`}
                  {p.salon_id && <> · <button className="link" style={{ marginTop: 0 }} onClick={() => onOpen(p.salon_id!)}>conta: {names.get(p.salon_id) ?? 'salão'}</button></>}
                  <small className="muted"><br />{[p.next_on && `voltar a falar ${ptDate(p.next_on)}`, p.source, p.notes && p.notes.slice(0, 120)].filter(Boolean).join(' · ')}</small>
                </span>
                <span className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                  {phone.length >= 9 && <a href={waLink(phone, `Olá! Fala o Francisco, da CorteCerto.`)} target="_blank" rel="noreferrer">WhatsApp</a>}
                  {phone.length >= 9 && <a href={`tel:${phone}`}>Ligar</a>}
                  {ig && <a href={ig} target="_blank" rel="noreferrer">Instagram</a>}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
