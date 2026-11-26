import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/** "Traga um colega" (migration 0034): every invite, and the button for the free month. */
interface Row {
  referred_id: string; referred_name: string; referred_subscription: string; referred_paid_until: string | null
  referrer_id: string; referrer_name: string; created_at: string; rewarded_at: string | null
}

const ptDate = (iso: string) => new Date(iso).toLocaleDateString('pt-PT')
const paying = (r: Row) => r.referred_subscription === 'ativa' && !!r.referred_paid_until && new Date(r.referred_paid_until) > new Date()

export function AdminReferrals({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  async function load() {
    const { data, error } = await supabase.rpc('admin_referrals')
    if (error) { setMissing(/admin_referrals|function/i.test(error.message)); setRows([]); return }
    setRows((data ?? []) as Row[])
  }
  useEffect(() => { load() }, [])
  async function reward(r: Row) {
    setBusy(r.referred_id); setMsg('')
    const { error } = await supabase.rpc('admin_reward_referral', { p_referred: r.referred_id })
    setBusy('')
    if (error) return setMsg(error.message.includes('ja_dado') ? 'Este mês grátis já foi dado.' : 'Não foi possível dar o mês grátis.')
    setMsg(`Mês grátis dado a ${r.referred_name} e ${r.referrer_name}.`)
    load()
  }
  if (!rows) return null
  const toGive = rows.filter(r => !r.rewarded_at && paying(r))
  return (
    <section className="card">
      <h2>Convites entre salões{toGive.length ? ` · ${toGive.length} por dar` : ''}</h2>
      <p className="muted small">Quando o salão convidado paga o primeiro mês, dê um mês grátis aos dois: mais 30 dias no "Pago até" (ou no período grátis, se ainda não pagam).</p>
      {missing && <p className="error small">Falta correr a migração 0034 no Supabase.</p>}
      {!missing && rows.length === 0 && <p className="muted">Ainda nenhum salão foi convidado por outro.</p>}
      <ul className="todo">
        {rows.map(r => (
          <li key={r.referred_id}>
            <span>
              <button className="link" onClick={() => onOpen(r.referred_id)}>{r.referred_name}</button>
              <span className="muted"> convidado por </span>
              <button className="link" onClick={() => onOpen(r.referrer_id)}>{r.referrer_name}</button>
              <small className="muted"> · {ptDate(r.created_at)}</small>
            </span>
            {r.rewarded_at
              ? <span className="tag ok-tag">Dado a {ptDate(r.rewarded_at)}</span>
              : paying(r)
                ? <button className="btn-inline small-btn" disabled={busy === r.referred_id} onClick={() => reward(r)}>{busy === r.referred_id ? 'A dar…' : 'Dar o mês grátis aos dois'}</button>
                : <span className="tag pendente">Ainda não pagou</span>}
          </li>
        ))}
      </ul>
      {msg && <p className={msg.startsWith('Mês') ? 'ok' : 'error'}>{msg}</p>}
    </section>
  )
}
