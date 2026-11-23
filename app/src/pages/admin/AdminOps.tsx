import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { parseAmount } from '../../lib/invoices'
import {
  ALERT_LABEL, budgetState, eurText, formatUptime, uptimePct, usdToEur,
  type AiSettings, type DigestSettings, type Ops,
} from '../../lib/siteStats'

const DEFAULT_AI: AiSettings = { orcamento_eur: 10, eur_por_usd: 0.87, precos: {} }
const when = (iso: string) => new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })
const num = (v: number | undefined) => v === undefined ? '' : String(v).replace('.', ',')
const monthName = (ym: string) => new Date(ym + '-15T12:00:00Z').toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' })

/** /admin > Sistema: is the site up, what the AI costs, and the admin's alert emails. */
export function AdminOps() {
  const [ops, setOps] = useState<Ops | null>()
  const [ai, setAi] = useState<AiSettings>(DEFAULT_AI)
  const [digest, setDigest] = useState<DigestSettings>({ diario: false, email: '' })
  const [prices, setPrices] = useState<Record<string, { entrada: string; saida: string; imagem: string }>>({})
  const [budget, setBudget] = useState({ orcamento: '10', taxa: '0,87' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  async function load() {
    const [o, st] = await Promise.all([supabase.rpc('admin_ops'), supabase.from('platform_settings').select('key,value').in('key', ['ia', 'resumo'])])
    setOps(o.error ? null : o.data as Ops)
    for (const row of (st.data ?? []) as { key: string; value: Record<string, unknown> }[]) {
      if (row.key === 'ia') {
        const v = { ...DEFAULT_AI, ...(row.value as Partial<AiSettings>) }
        setAi(v)
        setBudget({ orcamento: num(v.orcamento_eur), taxa: num(v.eur_por_usd) })
        setPrices(Object.fromEntries(Object.entries(v.precos).map(([m, p]) => [m, { entrada: num(p.entrada), saida: num(p.saida), imagem: num(p.imagem) }])))
      }
      if (row.key === 'resumo') setDigest({ diario: row.value.diario === true, email: String(row.value.email ?? '') })
    }
  }
  useEffect(() => { load() }, [])

  if (ops === undefined) return <p className="muted">A carregar…</p>
  if (ops === null) return <p className="card warn small">O estado do site e o custo da IA precisam da migração 0027 (supabase/migrations/0027_admin_site_ops.sql).</p>

  const last = ops.last_check
  const cost = Number(ops.ai_month?.cost_eur ?? 0)
  const limit = Number(ops.ai_month?.budget_eur ?? ai.orcamento_eur)
  const b = budgetState(cost, limit)

  async function saveAi(e: React.FormEvent) {
    e.preventDefault(); setMsg(undefined)
    const orcamento = parseAmount(budget.orcamento) / 100, taxa = Number(budget.taxa.trim().replace(',', '.'))
    if (isNaN(orcamento) || orcamento < 0 || isNaN(taxa) || taxa <= 0) return setMsg({ ok: false, text: 'Orçamento ou taxa inválidos.' })
    const precos: AiSettings['precos'] = {}
    for (const [m, p] of Object.entries(prices)) {
      const out: AiSettings['precos'][string] = {}
      for (const k of ['entrada', 'saida', 'imagem'] as const) {
        if (!p[k].trim()) continue
        const v = Number(p[k].replace(',', '.'))
        if (isNaN(v) || v < 0) return setMsg({ ok: false, text: `Preço inválido em ${m}.` })
        out[k] = v
      }
      precos[m] = out
    }
    const value = { orcamento_eur: orcamento, eur_por_usd: taxa, precos }
    const { error } = await supabase.from('platform_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', 'ia')
    setMsg(error ? { ok: false, text: 'Não foi possível guardar.' } : { ok: true, text: 'Guardado. Os novos preços contam a partir dos próximos pedidos.' })
    if (!error) load()
  }
  async function saveDigest(next: DigestSettings) {
    const email = next.email.trim()
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setMsg({ ok: false, text: 'Email inválido.' })
    const { error } = await supabase.from('platform_settings').update({ value: { diario: next.diario, email }, updated_at: new Date().toISOString() }).eq('key', 'resumo')
    if (!error) setDigest({ ...next, email })
    setMsg(error ? { ok: false, text: 'Não foi possível guardar.' } : { ok: true, text: 'Guardado.' })
  }

  return (
    <>
      <section className="card">
        <h2>O site está no ar?</h2>
        <div className="stats kpis">
          <div className="stat"><b className={last && !last.ok ? 'error' : ''}>{last ? (last.ok ? 'Sim' : 'Não') : '—'}</b>
            <span>{last ? `Verificado ${when(last.at)}${last.ok ? ` · ${last.ms} ms` : ` · ${last.detail ?? ''}`}` : 'Ainda sem verificações'}</span></div>
          <div className="stat"><b>{formatUptime(uptimePct(ops.uptime?.['24h']))}</b><span>No ar, últimas 24 h</span></div>
          <div className="stat"><b>{formatUptime(uptimePct(ops.uptime?.['7d']))}</b><span>No ar, 7 dias</span></div>
          <div className="stat"><b>{formatUptime(uptimePct(ops.uptime?.['30d']))}</b><span>No ar, 30 dias</span></div>
        </div>
        {ops.failures.length > 0 && (
          <ul className="errors">
            {ops.failures.map(f => <li key={f.at}><span>{f.detail ?? (f.db_ok ? 'App' : 'Base de dados')}</span><small className="muted">{when(f.at)}</small></li>)}
          </ul>
        )}
        <p className="muted small">De 5 em 5 minutos a app verifica se as páginas abrem e se a base de dados responde. Depois de duas falhas seguidas recebe um email, e outro quando voltar.
          Como esta verificação corre dentro da Cloudflare, junte um monitor externo grátis (UptimeRobot ou Better Stack) a vigiar o endereço do site.</p>
      </section>

      <section className="card">
        <h2>Custo da IA este mês</h2>
        <div className="budget">
          <div className="row"><b>{eurText(cost)}</b><span className="muted">de {eurText(limit)}</span></div>
          <span className="funnel-bar"><i className={b.level} style={{ width: `${Math.min(100, b.share * 100)}%` }} /></span>
          <p className={`small ${b.level === 'ok' ? 'muted' : 'error'}`}>
            {b.level === 'passou' ? 'Orçamento passado. Recebeu um email; a IA continua a funcionar dentro dos limites de cada salão.'
              : b.level === 'aviso' ? 'Perto do orçamento do mês.' : `${ops.ai_month?.requests ?? 0} pedidos feitos este mês.`}
            {Number(ops.ai_month?.unpriced ?? 0) > 0 && ` ${ops.ai_month?.unpriced} pedidos sem preço (modelo sem preço abaixo, ou feitos antes da migração 0027).`}
          </p>
        </div>
        {ops.ai_features.length > 0 && (
          <table className="money-table">
            <thead><tr><th>Funcionalidade</th><th>Pedidos</th><th>Tokens</th><th>Custo</th></tr></thead>
            <tbody>
              {ops.ai_features.map(f => (
                <tr key={`${f.feature}-${f.model}`}>
                  <td>{f.feature}<small className="muted"> · {f.model}</small></td>
                  <td>{f.n}</td>
                  <td>{f.images ? `${f.images} imagens` : `${Math.round((Number(f.input_tokens ?? 0) + Number(f.output_tokens ?? 0)) / 1000)} mil`}</td>
                  <td>{f.cost_usd === null ? 'sem preço' : eurText(usdToEur(f.cost_usd, ai.eur_por_usd))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {ops.ai_months.length > 1 && (
          <p className="muted small">Meses anteriores: {ops.ai_months.map(m => `${monthName(m.month)} ${eurText(usdToEur(m.cost_usd, ai.eur_por_usd))}`).join(' · ')}</p>
        )}
      </section>

      <form className="card" onSubmit={saveAi}>
        <h2>Orçamento e preços da IA</h2>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="grow">Orçamento por mês (€)<input inputMode="decimal" value={budget.orcamento} onChange={e => setBudget({ ...budget, orcamento: e.target.value })} /></label>
          <label className="grow">1 dólar em euros<input inputMode="decimal" value={budget.taxa} onChange={e => setBudget({ ...budget, taxa: e.target.value })} /></label>
        </div>
        <p className="muted small">Preços em dólares, como os fornecedores os publicam: por milhão de tokens de entrada e de saída, ou por imagem feita.</p>
        <table className="money-table price-table">
          <thead><tr><th>Modelo</th><th>Entrada</th><th>Saída</th><th>Imagem</th></tr></thead>
          <tbody>
            {Object.entries(prices).map(([m, p]) => (
              <tr key={m}>
                <td className="small">{m}</td>
                {(['entrada', 'saida', 'imagem'] as const).map(k => (
                  <td key={k}><input inputMode="decimal" aria-label={`${m}: ${k}`} value={p[k]} onChange={e => setPrices({ ...prices, [m]: { ...p, [k]: e.target.value } })} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn">Guardar</button>
      </form>

      <section className="card">
        <h2>Emails para si</h2>
        <label className="check"><input type="checkbox" checked={digest.diario} onChange={e => saveDigest({ ...digest, diario: e.target.checked })} />
          <span>Resumo diário por volta das 8h</span></label>
        <p className="muted small">Visitas, contas e salões novos, marcações, dinheiro por receber, lembretes por enviar, erros e o estado do site, num só email. Os alertas de site em baixo e de orçamento saem sempre.</p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="grow">Enviar para<input type="email" placeholder="O seu email de login" value={digest.email} onChange={e => setDigest({ ...digest, email: e.target.value })} /></label>
          <button className="btn-inline" onClick={() => saveDigest(digest)}>Guardar</button>
        </div>
        <p className="muted small">Enquanto o domínio não estiver verificado no Resend, os emails só chegam ao email da conta Resend.</p>
        {ops.alerts.length > 0 && (
          <>
            <h3>Últimos enviados</h3>
            <ul className="errors">
              {ops.alerts.map(a => <li key={a.kind + a.period}><span>{ALERT_LABEL[a.kind] ?? a.kind}</span><small className="muted">{when(a.sent_at)}</small></li>)}
            </ul>
          </>
        )}
      </section>
      {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
    </>
  )
}
