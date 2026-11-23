import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase, type Booking, type Salon, type Service } from '../lib/supabase'
import { addDays, dateInTz, zonedToUtc } from '../lib/time'
import { computeStats, monthlyRevenue, PERIODS, periodRange, type Period, type Ranked } from '../lib/stats'
import { themeById, themeStyle } from '../lib/themes'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import { commissions, payLabel, type Pay } from '../lib/commission'
import HelpLink from '../HelpLink'

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** One horizontal bar per item, single hue, value labelled at the end. */
function BarList({ items, value, label, format }: {
  items: Ranked[]; value: (r: Ranked) => number; label: (r: Ranked) => string; format: (r: Ranked) => string
}) {
  const max = Math.max(1, ...items.map(value))
  if (items.length === 0) return <p className="muted small">Sem visitas concluídas neste período.</p>
  return (
    <div className="bars" role="table">
      {items.map(r => (
        <div key={r.id} className="bar-row" role="row" title={`${label(r)}: ${format(r)}`}>
          <span role="cell" className="bar-label">{label(r)}</span>
          <span role="cell" className="bar-track"><span className="bar-fill" style={{ width: `${(value(r) / max) * 100}%` }} /></span>
          <span role="cell" className="bar-value">{format(r)}</span>
        </div>
      ))}
    </div>
  )
}

/** The salon's numbers: revenue, visits, no-shows, clients, top services and team. */
export default function StatsPage() {
  const [session, setSession] = useState<Session | null>()
  const [role, setRole] = useState<Role>('dono')
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Record<string, Service>>({})
  const [pros, setPros] = useState<Record<string, string>>({})
  const [all, setAll] = useState<Booking[] | null>(null)
  const [period, setPeriod] = useState<Period>('mes')
  const [pay, setPay] = useState<Record<string, Pay> | null>(null)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    (async () => {
      const mine = await loadMySalon(session.user.id)
      const s = mine.salon
      setRole(mine.role)
      setSalon(s)
      if (!s) return
      const [sv, pr, bk, py] = await Promise.all([
        supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', s.id),
        supabase.from('professionals').select('id,name').eq('salon_id', s.id),
        supabase.from('bookings').select('*').eq('salon_id', s.id).order('starts_at').limit(50000),
        // Commissions (migration 0018); none before it.
        supabase.from('professional_pay').select('professional_id,commission_type,commission_percent,commission_cents').eq('salon_id', s.id),
      ])
      setPay(py.error ? null : Object.fromEntries(((py.data ?? []) as Pay[]).map(p => [p.professional_id, p])))
      setServices(Object.fromEntries((sv.data ?? []).map(x => [x.id, x])))
      setPros(Object.fromEntries((pr.data ?? []).map((x: { id: string; name: string }) => [x.id, x.name])))
      setAll(bk.data ?? [])
    })()
  }, [session])

  const tz = salon?.timezone ?? 'Europe/Lisbon'
  const today = dateInTz(new Date(), tz)
  const range = periodRange(period, today)
  const stats = useMemo(() => all ? computeStats(all, services, tz, range.from, range.to) : null, [all, services, tz, range.from, range.to])
  const months = useMemo(() => all ? monthlyRevenue(all, services, tz, today) : [], [all, services, tz, today])
  const comm = useMemo(() => all && pay
    ? commissions(all, pay, services, zonedToUtc(range.from, '00:00', tz).toISOString(), zonedToUtc(addDays(range.to, 1), '00:00', tz).toISOString())
    : null, [all, pay, services, tz, range.from, range.to])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  // Revenue is for the owner and managers (access levels, migration 0018).
  if (!can(role, 'estatisticas')) return <Navigate to="/painel" replace />

  const pct = (x: number) => `${Math.round(x * 100)}%`
  const maxMonth = Math.max(1, ...months.map(m => m.revenue))
  const maxWd = stats ? Math.max(1, ...stats.byWeekday) : 1
  const monthName = (k: string) => new Date(k + '-15T12:00:00Z').toLocaleDateString('pt-PT', { month: 'short' })

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page wide">
      <header className="row"><h1>Estatísticas<HelpLink /></h1><Link to="/mais">‹ Mais</Link></header>
      <div className="days">
        {PERIODS.map(p => <button key={p.id} className={p.id === period ? 'day on' : 'day'} onClick={() => setPeriod(p.id)}>{p.label}</button>)}
      </div>

      {!stats ? <p className="muted">A carregar…</p> : <>
        <div className="tiles">
          <div className="tile"><span className="tile-label">Faturado</span><strong className="tile-value">{euros(stats.revenue)}</strong>
            {stats.expected > 0 && <span className="tile-sub">+ {euros(stats.expected)} marcados</span>}</div>
          <div className="tile"><span className="tile-label">Visitas</span><strong className="tile-value">{stats.done}</strong>
            <span className="tile-sub">de {stats.bookings} marcações</span></div>
          <div className="tile"><span className="tile-label">Valor médio</span><strong className="tile-value">{euros(stats.avgTicket)}</strong>
            <span className="tile-sub">por visita</span></div>
          <div className="tile"><span className="tile-label">Faltas</span><strong className="tile-value">{pct(stats.noShowRate)}</strong>
            <span className="tile-sub">{stats.noShows} {stats.noShows === 1 ? 'falta' : 'faltas'} · {stats.cancelledByClient} {stats.cancelledByClient === 1 ? 'cancelou' : 'cancelaram'}</span></div>
          <div className="tile"><span className="tile-label">Clientes novos</span><strong className="tile-value">{stats.newClients}</strong>
            <span className="tile-sub">{stats.returningClients} voltaram</span></div>
        </div>

        <section className="card">
          <h2>Faturado nos últimos 6 meses</h2>
          <div className="cols" role="table">
            {months.map(m => (
              <div key={m.month} className="col" role="row" title={`${monthName(m.month)}: ${euros(m.revenue)}`}>
                <span className="col-value" role="cell">{m.revenue ? euros(m.revenue).replace(/,00\s?€/, ' €') : ''}</span>
                <span className="col-track"><span className={`col-fill ${m.month === today.slice(0, 7) ? 'current' : ''}`} style={{ height: `${(m.revenue / maxMonth) * 100}%` }} /></span>
                <span className="col-label" role="cell">{monthName(m.month)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Serviços</h2>
          <BarList items={stats.byService} value={r => r.revenue} label={r => services[r.id]?.name ?? 'Serviço'} format={r => `${euros(r.revenue)} · ${r.count}`} />
        </section>

        {Object.keys(pros).length > 1 && (
          <section className="card">
            <h2>Equipa</h2>
            <BarList items={stats.byProfessional} value={r => r.revenue} label={r => pros[r.id] ?? 'Profissional'} format={r => `${euros(r.revenue)} · ${r.count}`} />
          </section>
        )}

        {comm && Object.values(pay ?? {}).some(p => p.commission_type !== 'nenhuma') && (
          <section className="card">
            <h2>Comissões</h2>
            <table className="comm-table">
              <thead><tr><th>Profissional</th><th>Visitas</th><th>Faturado</th><th>Comissão</th></tr></thead>
              <tbody>
                {Object.entries(pros).map(([id, name]) => {
                  const r = comm[id] ?? { visits: 0, revenue: 0, commission: 0 }
                  return <tr key={id}><td>{name}<br /><small className="muted">{payLabel(pay?.[id], euros)}</small></td><td>{r.visits}</td><td>{euros(r.revenue)}</td><td><b>{euros(r.commission)}</b></td></tr>
                })}
              </tbody>
              <tfoot><tr><td>Total</td><td></td><td></td><td><b>{euros(Object.values(comm).reduce((s, r) => s + r.commission, 0))}</b></td></tr></tfoot>
            </table>
            <p className="muted small">Visitas concluídas no período, ao preço da marcação. Defina as comissões em <Link to="/equipa">Mais &gt; Equipa</Link>.</p>
          </section>
        )}

        <section className="card">
          <h2>Dias com mais visitas</h2>
          <div className="cols" role="table">
            {[1, 2, 3, 4, 5, 6, 0].map(wd => (
              <div key={wd} className="col" role="row" title={`${WEEKDAY_SHORT[wd]}: ${stats.byWeekday[wd]} visitas`}>
                <span className="col-value" role="cell">{stats.byWeekday[wd] || ''}</span>
                <span className="col-track"><span className="col-fill" style={{ height: `${(stats.byWeekday[wd] / maxWd) * 100}%` }} /></span>
                <span className="col-label" role="cell">{WEEKDAY_SHORT[wd]}</span>
              </div>
            ))}
          </div>
        </section>
        <p className="muted small">Faturado conta as visitas concluídas ao preço da marcação. Faltas: em relação às visitas que deviam ter acontecido.</p>
      </>}
    </main></div>
  )
}
