import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { euros, supabase, type Booking, type Salon, type Service } from '../lib/supabase'
import { dateInTz } from '../lib/time'
import { computeStats, monthlyRevenue, PERIODS, periodRange, type Period, type Ranked } from '../lib/stats'
import { themeById, themeStyle } from '../lib/themes'

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
  const [salon, setSalon] = useState<Salon | null>()
  const [services, setServices] = useState<Record<string, Service>>({})
  const [pros, setPros] = useState<Record<string, string>>({})
  const [all, setAll] = useState<Booking[] | null>(null)
  const [period, setPeriod] = useState<Period>('mes')

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    (async () => {
      const { data: s } = await supabase.from('salons').select('*').eq('owner_id', session.user.id).maybeSingle()
      setSalon(s)
      if (!s) return
      const [sv, pr, bk] = await Promise.all([
        supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', s.id),
        supabase.from('professionals').select('id,name').eq('salon_id', s.id),
        supabase.from('bookings').select('*').eq('salon_id', s.id).order('starts_at').limit(50000),
      ])
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

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />

  const pct = (x: number) => `${Math.round(x * 100)}%`
  const maxMonth = Math.max(1, ...months.map(m => m.revenue))
  const maxWd = stats ? Math.max(1, ...stats.byWeekday) : 1
  const monthName = (k: string) => new Date(k + '-15T12:00:00Z').toLocaleDateString('pt-PT', { month: 'short' })

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page wide">
      <header className="row"><h1>Estatísticas</h1><Link to="/painel">‹ Agenda</Link></header>
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
