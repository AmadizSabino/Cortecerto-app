import { euros } from '../../lib/supabase'
import { waLink } from '../../lib/whatsapp'
import {
  attention, funnel, health, kpis, setupSteps, since, weeklySignups, HEALTH_LABEL, HEALTH_TAG,
  type AdminSalonRow, type Dashboard,
} from '../../lib/adminStats'

const pct = (n: number | null) => n === null ? '—' : `${Math.round(n * 100)}%`
const shortDate = (iso: string) => new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : '')).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })
/** One series of bars: a week (or a day) each, with the value on hover and on the highest bar. */
export function Bars({ data, label, format = String, daily = false }: { data: { x: string; y: number }[]; label: string; format?: (n: number) => string; daily?: boolean }) {
  const max = Math.max(1, ...data.map(d => d.y))
  const top = data.reduce((m, d, i) => (d.y > data[m].y ? i : m), 0)
  return (
    <figure className="bars" aria-label={label}>
      <div className="bars-plot">
        {data.map((d, i) => (
          <div key={d.x} className="bar-col" title={`${daily ? '' : 'Semana de '}${shortDate(d.x)}: ${format(d.y)}`}>
            {i === top && d.y > 0 && <small className="bar-val">{format(d.y)}</small>}
            <i style={{ height: `${Math.max(d.y ? 4 : 1, (d.y / max) * 100)}%` }} className={d.y ? '' : 'zero'} />
          </div>
        ))}
      </div>
      <figcaption className="bars-axis muted small"><span>{shortDate(data[0]?.x ?? '')}</span><span>{daily ? 'hoje' : 'esta semana'}</span></figcaption>
      <table className="sr-only"><caption>{label}</caption><tbody>{data.map(d => <tr key={d.x}><th>{d.x}</th><td>{format(d.y)}</td></tr>)}</tbody></table>
    </figure>
  )
}

/** The admin's home: headline numbers, what needs attention, growth and bookings. */
export function AdminOverview({ data, onOpen }: { data: Dashboard; onOpen: (salonId: string) => void }) {
  const now = new Date()
  const k = kpis(data.salons, now)
  const todo = attention(data.salons, now)
  const steps = funnel(data.salons)
  const signups = weeklySignups(data.salons, now).map(w => ({ x: w.week, y: w.count }))
  const bookings = data.weeks.map(w => ({ x: w.week, y: Number(w.online) + Number(w.salao) }))
  const value = data.weeks.map(w => ({ x: w.week, y: Number(w.value_cents) }))
  const onlineWeeks = data.weeks.reduce((t, w) => t + Number(w.online), 0)
  const allWeeks = bookings.reduce((t, w) => t + w.y, 0)

  return (
    <>
      <div className="stats kpis">
        <div className="stat"><b>{euros(k.mrrCents)}</b><span>Receita mensal (MRR, sem IVA)</span></div>
        <div className="stat"><b>{k.paying}</b><span>A pagar</span></div>
        <div className="stat"><b>{k.trial}</b><span>Em período grátis{k.trialsEnding7 > 0 && ` · ${k.trialsEnding7} acabam em 7 d`}</span></div>
        <div className="stat"><b>{k.unpaid}</b><span>Por pagar</span></div>
        <div className="stat"><b>{k.locked}</b><span>Bloqueadas</span></div>
        <div className="stat"><b>{k.signupsThisMonth}</b><span>Novos salões este mês</span></div>
        <div className="stat"><b>{pct(k.trialConversion)}</b><span>Grátis → pago</span></div>
        <div className="stat"><b>{k.activeOwners7} de {k.salons}</b><span>Donos ativos em 7 d</span></div>
      </div>

      <section className="card">
        <h2>Precisa de atenção</h2>
        {todo.length === 0 && <p className="muted">Nada pendente hoje.</p>}
        <ul className="todo">
          {todo.map((t, i) => (
            <li key={i}>
              <span className={`dot ${t.severity}`} aria-hidden />
              <button className="link" onClick={() => onOpen(t.salonId)}>{t.salon}</button>
              <span className="muted">{t.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Do registo ao pagamento</h2>
        <ol className="funnel">
          {steps.map((s, i) => {
            const prev = i ? steps[i - 1].count : s.count
            return (
              <li key={s.label}>
                <span className="funnel-label">{s.label}</span>
                <span className="funnel-bar"><i style={{ width: `${steps[0].count ? (s.count / steps[0].count) * 100 : 0}%` }} /></span>
                <b>{s.count}</b>
                <small className="muted">{i > 0 && prev > 0 ? pct(s.count / prev) : ''}</small>
              </li>
            )
          })}
        </ol>
        <p className="muted small">Antes do registo: visitas ao site e contas criadas estão no separador Site.</p>
      </section>

      <section className="card">
        <h2>Novos salões por semana</h2>
        <Bars data={signups} label="Salões criados por semana, últimas 12 semanas" />
      </section>

      <section className="card">
        <h2>Marcações por semana</h2>
        <p className="muted small">{allWeeks} em 12 semanas, {allWeeks ? pct(onlineWeeks / allWeeks) : '—'} feitas online pelos clientes.</p>
        <Bars data={bookings} label="Marcações criadas por semana, todos os salões" />
        <h3>Valor marcado por semana</h3>
        <Bars data={value} label="Valor dos serviços marcados por semana" format={n => `${Math.round(n / 100).toLocaleString('pt-PT')} €`} />
        <p className="muted small">Nos últimos 30 dias: {k.bookings30} marcações, {euros(k.value30Cents)} em serviços já feitos.</p>
      </section>

      <section className="card">
        <h2>Salões com mais marcações (30 d)</h2>
        <ul className="history top-salons">
          {[...data.salons].sort((a, b) => b.bookings_30d - a.bookings_30d).slice(0, 5).map(s => (
            <li key={s.id}>
              <button className="link" onClick={() => onOpen(s.id)}>{s.name}</button>
              <span>{s.bookings_30d} marcações · {s.bookings_30d ? pct(s.online_30d / s.bookings_30d) : '—'} online</span>
              <span>{euros(s.value_30d_cents)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

/** Facts about one salon, shown above its subscription and invoices. */
export function SalonFacts({ s }: { s: AdminSalonRow }) {
  const h = health(s)
  return (
    <div className="facts">
      <p className="row" style={{ justifyContent: 'flex-start' }}>
        <span className={`tag ${HEALTH_TAG[h.level]}`}>Saúde: {HEALTH_LABEL[h.level]} · {h.score}</span>
        {h.reasons.map(r => <small key={r} className="muted">{r}</small>)}
      </p>
      <dl className="facts-grid">
        <dt>Dono</dt><dd>{s.owner_email ? <a href={`mailto:${s.owner_email}`}>{s.owner_email}</a> : '—'}</dd>
        <dt>WhatsApp</dt><dd>{s.whatsapp ? <a href={waLink(s.whatsapp, `Olá! Fala o Francisco, da CorteCerto.`)} target="_blank" rel="noreferrer">{s.whatsapp}</a> : '—'}</dd>
        <dt>Último login</dt><dd>{since(s.last_sign_in_at)}</dd>
        <dt>Morada</dt><dd>{s.address || '—'}</dd>
        <dt>Marcações</dt><dd>{s.bookings} no total · {s.bookings_30d} em 30 d ({s.online_30d} online) · {s.noshow_30d} faltas</dd>
        <dt>Valor 30 d</dt><dd>{euros(s.value_30d_cents)}</dd>
        <dt>Equipa</dt><dd>{s.professionals} profissionais · {s.team} com acesso ao painel</dd>
        <dt>Clientes</dt><dd>{s.clients}</dd>
        <dt>Usa</dt><dd>{[s.walkins_30d && `fila (${s.walkins_30d})`, s.promotions && `promoções (${s.promotions})`, s.packs && `packs (${s.packs})`, s.ai_30d && `IA (${s.ai_30d})`].filter(Boolean).join(' · ') || '—'}</dd>
        <dt>Configuração</dt><dd>{setupSteps(s).map(st => `${st.done ? '✓' : '✗'} ${st.label}`).join('  ')}</dd>
      </dl>
      <p><a href={`/s/${s.slug}`} target="_blank" rel="noreferrer">Abrir página de marcações ›</a></p>
    </div>
  )
}

const AI_STATUS: Record<string, string> = { feito: 'feitos', erro: 'erros', limite: 'no limite', indisponivel: 'sem IA ligada' }

/** Errors, scheduled jobs and AI use. */
export function AdminSystem({ data }: { data: Dashboard }) {
  const features = [...new Set(data.ai.map(a => a.feature))]
  return (
    <>
      <section className="card">
        <h2>Tarefas automáticas</h2>
        {data.jobs.length === 0 && <p className="muted">Nenhuma tarefa agendada encontrada.</p>}
        <ul className="history">
          {data.jobs.map(j => (
            <li key={j.jobname}>
              <span className={`tag ${j.last_status === 'failed' || j.failed_7d > 0 ? 'faltou' : j.last_status ? 'concluida' : 'pendente'}`}>
                {j.last_status === 'failed' ? 'Falhou' : j.last_status === 'succeeded' ? 'OK' : j.last_status ?? 'Ainda não correu'}
              </span>
              <span>{j.jobname}{!j.active && ' (desligada)'}{j.failed_7d > 0 && ` · ${j.failed_7d} falhas em 7 d`}</span>
              <small className="muted">{j.last_run ? new Date(j.last_run).toLocaleString('pt-PT') : ''}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Erros na app (7 dias)</h2>
        {data.errors.length === 0 && <p className="muted">Nenhum erro registado. </p>}
        <ul className="errors">
          {data.errors.map(e => (
            <li key={e.message}>
              <b>{e.n}×</b> <span>{e.message}</span>
              <small className="muted">{e.path ?? ''} · último {new Date(e.last_at).toLocaleString('pt-PT')}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Inteligência artificial este mês</h2>
        {features.length === 0 && <p className="muted">Ainda sem pedidos este mês.</p>}
        <ul className="history">
          {features.map(f => {
            const rows = data.ai.filter(a => a.feature === f)
            return (
              <li key={f}>
                <b>{f}</b>
                <span>{rows.map(r => `${r.n} ${AI_STATUS[r.status] ?? r.status}`).join(' · ')}</span>
                <small className="muted">{Math.max(...rows.map(r => Number(r.salons)))} salões</small>
              </li>
            )
          })}
        </ul>
      </section>

      <p className="muted small">Dados de {new Date(data.generated_at).toLocaleString('pt-PT')}.</p>
    </>
  )
}
