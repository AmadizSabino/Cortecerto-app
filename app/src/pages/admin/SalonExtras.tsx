import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { METHOD_LABEL, type PaymentMethod } from '../../lib/invoices'

interface Billing { legal_name: string; nif: string; address: string; postal_code: string; city: string; email: string }
interface Note { id: string; body: string; created_at: string }
const EMPTY: Billing = { legal_name: '', nif: '', address: '', postal_code: '', city: '', email: '' }

/** Who CorteCerto invoices for this salon (migration 0025). */
export function BillingDetails({ salonId }: { salonId: string }) {
  const [b, setB] = useState<Billing>(EMPTY)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  useEffect(() => {
    supabase.from('salon_billing').select('*').eq('salon_id', salonId).maybeSingle().then(({ data }) => {
      if (data) setB(Object.fromEntries(Object.keys(EMPTY).map(k => [k, (data as Record<string, string | null>)[k] ?? ''])) as unknown as Billing)
    })
  }, [salonId])

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(undefined)
    const nif = b.nif.replace(/\s/g, '')
    if (nif && !/^\d{9}$/.test(nif)) return setMsg({ ok: false, text: 'O NIF tem 9 dígitos.' })
    if (b.postal_code && !/^\d{4}-\d{3}$/.test(b.postal_code.trim())) return setMsg({ ok: false, text: 'Código postal no formato 2900-123.' })
    const row = Object.fromEntries(Object.entries({ ...b, nif }).map(([k, v]) => [k, v.trim() || null]))
    const { error } = await supabase.from('salon_billing').upsert({ salon_id: salonId, ...row, updated_at: new Date().toISOString() })
    setMsg(error ? { ok: false, text: 'Não foi possível guardar. Verifique o email.' } : { ok: true, text: 'Guardado.' })
  }
  const field = (k: keyof Billing, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <label className="grow">{label}<input value={b[k]} onChange={e => setB({ ...b, [k]: e.target.value })} {...extra} /></label>

  return (
    <form onSubmit={save} className="card soft">
      <strong>Dados de faturação</strong>
      {field('legal_name', 'Nome ou empresa', { placeholder: 'Ex.: João Silva, ou Barbearia Silva, Lda.' })}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {field('nif', 'NIF', { inputMode: 'numeric', placeholder: '123456789' })}
        {field('email', 'Email para faturas', { type: 'email' })}
      </div>
      {field('address', 'Morada')}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {field('postal_code', 'Código postal', { placeholder: '2900-123' })}
        {field('city', 'Localidade')}
      </div>
      <p className="muted small">Os lembretes de pagamento vão para o email para faturas, ou para o email do dono se estiver vazio.</p>
      <button className="btn">Guardar dados</button>
      {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
    </form>
  )
}

/** The admin's own notes about a salon: calls, visits, promises. Only admins see them. */
export function SalonNotes({ salonId }: { salonId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [text, setText] = useState('')
  const load = () => supabase.from('admin_notes').select('id,body,created_at').eq('salon_id', salonId).order('created_at', { ascending: false })
    .then(({ data }) => setNotes((data ?? []) as Note[]))
  useEffect(() => { load() }, [salonId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    const { error } = await supabase.from('admin_notes').insert({ salon_id: salonId, body: text.trim() })
    if (!error) { setText(''); load() }
  }
  async function remove(id: string) {
    await supabase.from('admin_notes').delete().eq('id', id)
    load()
  }
  return (
    <div>
      <h3 style={{ marginTop: 20 }}>Notas</h3>
      <form onSubmit={add} className="row" style={{ alignItems: 'flex-end' }}>
        <label className="grow">Nova nota<input value={text} maxLength={2000} placeholder="Ex.: liguei, paga na sexta" onChange={e => setText(e.target.value)} /></label>
        <button className="btn-inline">Juntar</button>
      </form>
      {notes.length === 0 && <p className="muted small">Ainda sem notas.</p>}
      <ul className="notes">
        {notes.map(n => (
          <li key={n.id}>
            <small className="muted">{new Date(n.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}</small>
            <span>{n.body}</span>
            <button className="link danger-link" style={{ marginTop: 0 }} onClick={() => remove(n.id)}>Apagar</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface AuditRow { id: number; at: string; actor_email: string | null; salon_id: string | null; salon_name: string | null; action: string; details: Record<string, unknown> }
const ACTION: Record<string, string> = {
  assinatura: 'Assinatura alterada', fatura_enviada: 'Fatura enviada', fatura_paga: 'Fatura paga', fatura_alterada: 'Fatura alterada',
  fatura_apagada: 'Fatura apagada', dados_faturacao: 'Dados de faturação', definicoes: 'Definições',
}
const d = (v: unknown) => typeof v === 'string' && v ? new Date(v).toLocaleDateString('pt-PT') : '—'

/** One line saying what changed. */
function describe(r: AuditRow): string {
  const x = r.details
  if (r.action === 'assinatura') {
    const a = (x.antes ?? {}) as Record<string, unknown>, b = (x.depois ?? {}) as Record<string, unknown>
    const parts: string[] = []
    if (a.estado !== b.estado) parts.push(`${a.estado} → ${b.estado}`)
    if (a.pago_ate !== b.pago_ate) parts.push(`pago até ${d(a.pago_ate)} → ${d(b.pago_ate)}`)
    if (a.gratis_ate !== b.gratis_ate) parts.push(`grátis até ${d(a.gratis_ate)} → ${d(b.gratis_ate)}`)
    return parts.join(' · ')
  }
  if (r.action.startsWith('fatura')) return [x.numero, typeof x.valor_cents === 'number' && `${(x.valor_cents / 100).toFixed(2).replace('.', ',')} €`, x.metodo && (METHOD_LABEL[x.metodo as PaymentMethod] ?? x.metodo)].filter(Boolean).join(' · ')
  if (r.action === 'definicoes') return String(x.chave ?? '')
  if (r.action === 'dados_faturacao') return [x.nome, x.nif && `NIF ${x.nif}`].filter(Boolean).join(' · ')
  return ''
}

/** The latest changes to plans, invoices, billing details and settings. */
export function AuditLog() {
  const [rows, setRows] = useState<AuditRow[] | null>()
  useEffect(() => { supabase.rpc('admin_audit_recent', { p_limit: 100 }).then(({ data, error }) => setRows(error ? null : (data ?? []) as AuditRow[])) }, [])
  return (
    <section className="card">
      <h2>Registo de alterações</h2>
      {rows === undefined && <p className="muted">A carregar…</p>}
      {rows === null && <p className="muted small">Precisa da migração 0025.</p>}
      {rows?.length === 0 && <p className="muted">Ainda sem alterações registadas.</p>}
      <ul className="errors">
        {rows?.map(r => (
          <li key={r.id}>
            <span><b>{ACTION[r.action] ?? r.action}</b>{r.salon_name && ` · ${r.salon_name}`}</span>
            <span className="small">{describe(r)}</span>
            <small className="muted">{new Date(r.at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })} · {r.actor_email ?? 'sistema'}</small>
          </li>
        ))}
      </ul>
    </section>
  )
}
