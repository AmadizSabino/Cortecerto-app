import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { siteFunnels, SOURCE_LABEL, type SiteStats } from '../../lib/siteStats'
import { Bars } from './AdminDashboard'

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—')

function Funnel({ steps }: { steps: { label: string; count: number }[] }) {
  return (
    <ol className="funnel">
      {steps.map((s, i) => (
        <li key={s.label}>
          <span className="funnel-label">{s.label}</span>
          <span className="funnel-bar"><i style={{ width: `${steps[0].count ? (s.count / steps[0].count) * 100 : 0}%` }} /></span>
          <b>{s.count}</b>
          <small className="muted">{i > 0 ? pct(s.count, steps[i - 1].count) : ''}</small>
        </li>
      ))}
    </ol>
  )
}

/** /admin > Site: who visits, where they come from, and how many sign up or book. */
export function AdminSite({ onOpen }: { onOpen: (salonId: string) => void }) {
  const [days, setDays] = useState(30)
  const [s, setS] = useState<SiteStats | null>()
  useEffect(() => {
    setS(undefined)
    supabase.rpc('admin_site_stats', { p_days: days }).then(({ data, error }) => setS(error ? null : data as SiteStats))
  }, [days])

  const chips = (
    <div className="chips">
      {[7, 30, 90].map(d => <button key={d} className={`chip${d === days ? ' on' : ''}`} onClick={() => setDays(d)}>{d} dias</button>)}
    </div>
  )
  if (s === undefined) return <>{chips}<p className="muted">A carregar…</p></>
  if (s === null) return <>{chips}<p className="card warn small">Precisa da migração 0027 (supabase/migrations/0027_admin_site_ops.sql).</p></>

  const f = siteFunnels(s)
  const t = (k: string) => Number(s.totals[k] ?? 0)
  const devices = Object.values(s.devices).reduce((a, b) => a + Number(b), 0)
  const empty = Object.keys(s.totals).length === 0
  return (
    <>
      {chips}
      {empty && <p className="card soft small">Ainda sem visitas registadas. A contagem começa quando esta versão estiver no ar: cada visita ao site e às páginas dos salões passa a aparecer aqui, sem cookies e sem dados pessoais.</p>}
      <div className="stats kpis">
        <div className="stat"><b>{s.visitors.site ?? 0}</b><span>Visitantes do site</span></div>
        <div className="stat"><b>{t('registo:conta_criada')}</b><span>Contas criadas</span></div>
        <div className="stat"><b>{t('registo:salao_criado')}</b><span>Salões criados</span></div>
        <div className="stat"><b>{s.visitors.salao ?? 0}</b><span>Visitantes nas páginas dos salões</span></div>
        <div className="stat"><b>{t('salao:marcacao_feita')}</b><span>Marcações online</span></div>
        <div className="stat"><b>{t('salao:whatsapp')}</b><span>Cliques no WhatsApp</span></div>
        <div className="stat"><b>{t('painel:instalar')}</b><span>Apps instaladas</span></div>
        <div className="stat"><b>{devices ? pct(Number(s.devices.telemovel ?? 0), devices) : '—'}</b><span>Visitantes no telemóvel</span></div>
      </div>

      <section className="card">
        <h2>Do site ao salão criado</h2>
        <Funnel steps={f.signup} />
        <p className="muted small">Visitantes únicos por dia na página inicial. Uma conta criada que não chega a "salão criado" ficou a meio do registo: vale um contacto.</p>
      </section>

      <section className="card">
        <h2>Visitantes por dia</h2>
        <h3>Site</h3>
        <Bars daily data={s.daily.map(d => ({ x: d.day, y: Number(d.site) }))} label={`Visitantes do site por dia, últimos ${s.days} dias`} />
        <h3>Páginas dos salões</h3>
        <Bars daily data={s.daily.map(d => ({ x: d.day, y: Number(d.salao) }))} label={`Visitantes das páginas dos salões por dia, últimos ${s.days} dias`} />
      </section>

      <section className="card">
        <h2>De onde vêm</h2>
        {s.sources.length === 0 && <p className="muted">Sem visitas neste período.</p>}
        {s.sources.length > 0 && (
          <table className="money-table">
            <thead><tr><th>Origem</th><th>Visitas</th><th>Contas</th><th>Marcações</th></tr></thead>
            <tbody>
              {s.sources.map(r => (
                <tr key={`${r.source}-${r.campaign}`}>
                  <td>{SOURCE_LABEL[r.source] ?? r.source}{r.campaign && r.source !== 'cartaz' && <small className="muted"> · campanha</small>}</td>
                  <td>{r.visits}</td><td>{r.accounts}</td><td>{r.bookings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">Para saber o que resulta, junte <code>?src=</code> aos links que partilha: por exemplo <code>/?src=instagram</code> na bio, <code>/?src=folheto</code> num folheto. O QR do cartaz de cada salão já leva <code>?src=cartaz</code>.</p>
      </section>

      <section className="card">
        <h2>Das visitas às marcações</h2>
        <Funnel steps={f.booking} />
        {s.salons.length > 0 && (
          <table className="money-table">
            <thead><tr><th>Salão</th><th>Visitas</th><th>Começaram</th><th>Marcaram</th><th>WhatsApp</th></tr></thead>
            <tbody>
              {s.salons.map(r => (
                <tr key={r.id}>
                  <td><button className="link" style={{ marginTop: 0 }} onClick={() => onOpen(r.id)}>{r.name}</button></td>
                  <td>{r.visits}</td><td>{r.started}</td><td>{r.booked} <small className="muted">{pct(r.booked, r.visits)}</small></td><td>{r.whatsapp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">Muitas visitas e poucas marcações num salão costuma querer dizer poucos horários livres, preços em falta ou um serviço difícil de encontrar.</p>
      </section>
    </>
  )
}
