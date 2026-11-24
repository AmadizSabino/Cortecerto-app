import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { supabase, type Salon } from '../lib/supabase'
import { runAi, type AiResult } from '../lib/ai'
import { contextRange, scheduleContext } from '../lib/aiContext'
import { loadHours } from '../lib/scheduleData'
import { dateInTz } from '../lib/time'

const QUICK = ['Como é o meu dia hoje?', 'Que horas tenho livres amanhã?', 'Como está a semana?', 'Quanto faturei este mês?', 'Quem não vem há mais de 45 dias?']
const MONEY_QUICK = 'Quanto faturei este mês?'

/**
 * "Pergunte ao assistente": questions about the salon, answered by the AI. It starts from a summary
 * of the last 7 and next 7 days, and the Worker gives it read-only tools for anything else
 * (any day's diary, a client's history, free times, totals, clients who stopped coming). Never phones.
 */
/** `owner`: money figures (takings, revenue) are only for the owner; the Worker enforces it too. */
export default function AskAssistant({ salon, compact, owner }: { salon: Salon; compact?: boolean; owner: boolean }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<AiResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [context, setContext] = useState<string | null>(null)

  async function load(): Promise<string> {
    if (context) return context
    const tz = salon.timezone, now = new Date(), today = dateInTz(now, tz), range = contextRange(today, tz)
    const [sv, pr, bk, hours] = await Promise.all([
      supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', salon.id).eq('active', true),
      supabase.from('professionals').select('id,name').eq('salon_id', salon.id).eq('active', true),
      supabase.from('bookings').select('starts_at,ends_at,status,service_id,professional_id,price_cents,home_fee_cents,location')
        .eq('salon_id', salon.id).gte('starts_at', range.from).lt('starts_at', range.to),
      loadHours(salon.id),
    ])
    const text = scheduleContext({
      salonName: salon.name, salonType: salon.type, tz, now, today, hours: hours.salon,
      services: Object.fromEntries((sv.data ?? []).map(s => [s.id, s])),
      pros: Object.fromEntries((pr.data ?? []).map(p => [p.id, p])),
      bookings: bk.data ?? [], money: owner,
    })
    setContext(text)
    return text
  }

  async function ask(question: string) {
    if (!question.trim() || busy) return
    setQ(question); setBusy(true); setRes(null)
    setRes(await runAi('owner-assistant', { question, context: await load() }))
    setBusy(false)
  }

  return (
    <section className="card ai-card ask">
      <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'nowrap' }}>
        <Icon name="spark" size={20} /><strong>Pergunte ao assistente</strong><span className="tag">IA</span>
      </div>
      {!compact && <p className="muted small" style={{ margin: '6px 0 0' }}>Pergunte pela agenda, por um cliente, pelas horas livres{owner ? ' ou pelo que faturou' : ''}. Só lê, nunca marca nem cancela. Os nomes dos clientes são trocados por códigos antes de irem para a IA.</p>}
      <div className="chips">
        {QUICK.filter(t => owner || t !== MONEY_QUICK).map(t => <button key={t} type="button" className="chip" disabled={busy} onClick={() => ask(t)}>{t}</button>)}
      </div>
      <form className="ask-row" onSubmit={e => { e.preventDefault(); ask(q) }}>
        <input value={q} maxLength={500} placeholder="Ex.: A Ana tem marcação para que dia?" onChange={e => setQ(e.target.value)} aria-label="Pergunta ao assistente" />
        <button className="btn inline sm" disabled={busy || !q.trim()}>{busy ? 'A pensar…' : 'Perguntar'}</button>
      </form>
      {res && (res.status === 'feito'
        ? <div className="card soft ai-answer">{res.text?.split('\n').filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}</div>
        : <p className="muted small" role="status">{res.message}</p>)}
      {compact && <p className="small" style={{ margin: '8px 0 0' }}><Link to="/ia">Mais ferramentas de IA ›</Link></p>}
    </section>
  )
}
