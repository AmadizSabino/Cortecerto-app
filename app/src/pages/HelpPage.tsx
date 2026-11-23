import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon, { WhatsAppIcon } from '../components/Icon'
import { supabase, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { themeById, themeStyle } from '../lib/themes'
import { HELP_GROUPS, SCREEN_LABEL, helpMessage, searchHelp, topicsFor, type HelpTopic } from '../lib/help'
import { COMPANY_DETAILS } from '../lib/legal'

function Topic({ t, open, here }: { t: HelpTopic; open?: boolean; here?: boolean }) {
  return (
    <details className="help-topic" id={`ajuda-${t.id}`} open={open}>
      <summary>{t.title}</summary>
      <ol>{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      {t.tip && <p className="help-tip"><b>Dica:</b> {t.tip}</p>}
      <div className="actions">
        {t.screen && !here && <Link className="btn inline sm" to={t.screen}>Abrir {SCREEN_LABEL[t.screen] ?? 'este ecrã'}</Link>}
        <a className="btn inline sm wa" href={`https://wa.me/?text=${encodeURIComponent(helpMessage(t))}`} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />Enviar a alguém</a>
      </div>
    </details>
  )
}

/** /ajuda: how-tos for the salon panel. ?ecra=/painel puts that screen's first; ?t=<id> opens one. */
export default function HelpPage() {
  const [params] = useSearchParams()
  const screen = params.get('ecra') ?? ''
  const only = params.get('t') ?? ''
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [q, setQ] = useState('')

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => { if (session) loadMySalon(session.user.id).then(m => { setSalon(m.salon); setRole(m.role) }) }, [session])
  useEffect(() => { if (only) document.getElementById(`ajuda-${only}`)?.scrollIntoView({ block: 'start' }) }, [only, salon])

  const all = useMemo(() => topicsFor(role), [role])
  const found = useMemo(() => searchHelp(all, q), [all, q])

  if (session === null) return <Navigate to="/painel" replace />
  if (session === undefined || salon === undefined) return <main className="page"><p className="muted">A carregar…</p></main>
  if (salon === null) return <Navigate to="/registar" replace />

  const hereTopics = screen && !q ? all.filter(t => t.screen === screen) : []
  const back = screen && SCREEN_LABEL[screen] ? { to: screen, label: SCREEN_LABEL[screen] } : { to: '/mais', label: 'Mais' }
  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page help-page">
      <header className="row"><h1>Ajuda</h1><Link to={back.to}>‹ {back.label}</Link></header>
      <label className="help-search">
        <span className="sr-only">Procurar na ajuda</span>
        <Icon name="search" size={18} />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Procurar: folga, sinal, lembrete…" />
      </label>

      {hereTopics.length > 0 && (
        <section>
          <h2>Neste ecrã: {SCREEN_LABEL[screen]}</h2>
          {hereTopics.map(t => <Topic key={t.id} t={t} open={hereTopics.length === 1 || t.id === only} here />)}
        </section>
      )}

      {q && found.length === 0 && <p className="card muted">Nada encontrado para "{q}". Tente outra palavra, ou fale connosco em baixo.</p>}
      {HELP_GROUPS.map(g => {
        const list = found.filter(t => t.group === g && !hereTopics.includes(t))
        if (!list.length) return null
        return (
          <section key={g}>
            <h2>{g}</h2>
            {list.map(t => <Topic key={t.id} t={t} open={t.id === only || (Boolean(q) && found.length <= 3)} />)}
          </section>
        )
      })}

      <section className="card soft">
        <strong>Ainda com dúvidas?</strong>
        <p className="muted small" style={{ margin: '4px 0 10px' }}>Escreva-nos com o nome do salão e o que estava a tentar fazer.</p>
        <a className="btn inline sm" href={`mailto:${COMPANY_DETAILS.email}?subject=${encodeURIComponent(`Ajuda: ${salon.name}`)}`}>Enviar email</a>
      </section>
    </main></div>
  )
}
