import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon from '../components/Icon'
import { euros, supabase, type Booking, type Salon, type Service } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import { AI_FEATURES, runAi, type AiFeature, type AiResult } from '../lib/ai'
import { computeStats } from '../lib/stats'
import { addDays, dateInTz, zonedToUtc } from '../lib/time'
import { themeById, themeStyle } from '../lib/themes'
import HelpLink from '../HelpLink'

/** A text feature: optional fields, a button, and the answer. */
function TextTool({ feature, label, fields, build }: {
  feature: AiFeature; label: string
  fields?: { key: string; label: string; rows?: number; placeholder?: string }[]
  build: (values: Record<string, string>) => Record<string, unknown>
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [res, setRes] = useState<AiResult | null>(null)
  const [busy, setBusy] = useState(false)
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setRes(null)
    setRes(await runAi(feature, build(values)))
    setBusy(false)
  }
  return (
    <form onSubmit={go} className="ai-tool">
      {fields?.map(f => (
        <label key={f.key}>{f.label}
          {f.rows ? <textarea rows={f.rows} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })} />
            : <input placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })} />}
        </label>
      ))}
      <button disabled={busy}>{busy ? 'A pensar…' : label}</button>
      {res && (res.status === 'feito'
        ? <div className="card soft ai-answer">{res.text?.split('\n').map((l, i) => <p key={i}>{l}</p>)}<button type="button" className="link" onClick={() => navigator.clipboard?.writeText(res.text ?? '')}>Copiar</button></div>
        : <p className="muted small" role="status">{res.message}</p>)}
    </form>
  )
}

/** Mais > Assistente IA: every AI feature, where it lives, and the tools for the owner. */
export default function AiPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [services, setServices] = useState<Record<string, Service>>({})
  const [recent, setRecent] = useState<Booking[]>([])
  const [open, setOpen] = useState<AiFeature | null>(null)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    (async () => {
      const r = await loadMySalon(session.user.id)
      setRole(r.role); setSalon(r.salon)
      if (!r.salon) return
      const tz = r.salon.timezone, today = dateInTz(new Date(), tz)
      const [sv, bk] = await Promise.all([
        supabase.from('services').select('id,name,duration_min,price_cents').eq('salon_id', r.salon.id).eq('active', true),
        supabase.from('bookings').select('*').eq('salon_id', r.salon.id)
          .gte('starts_at', zonedToUtc(addDays(today, -7), '00:00', tz).toISOString())
          .lt('starts_at', zonedToUtc(addDays(today, 8), '00:00', tz).toISOString()),
      ])
      setServices(Object.fromEntries((sv.data ?? []).map(x => [x.id, x])))
      setRecent(bk.data ?? [])
    })()
  }, [session])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (!can(role, 'ia')) return <Navigate to="/painel" replace />

  const tz = salon.timezone
  const today = dateInTz(new Date(), tz)
  // Only numbers go to the AI, never client names or phones.
  const lastWeek = computeStats(recent, services, tz, addDays(today, -7), addDays(today, -1))
  const nextWeek = recent.filter(b => b.starts_at >= new Date().toISOString() && (b.status === 'pendente' || b.status === 'confirmada'))
  const context = [
    `Salão: ${salon.name} (${salon.type}).`,
    `Últimos 7 dias: ${lastWeek.done} visitas, ${euros(lastWeek.revenue)} faturados, ${lastWeek.noShows} faltas, ${lastWeek.newClients} clientes novos.`,
    `Próximos 7 dias: ${nextWeek.length} marcações.`,
    `Serviços: ${Object.values(services).map(s => `${s.name} ${euros(s.price_cents)} (${s.duration_min} min)`).join('; ')}.`,
  ].join('\n')

  const tools: Partial<Record<AiFeature, React.ReactNode>> = {
    'owner-assistant': <TextTool feature="owner-assistant" label="Perguntar" fields={[{ key: 'q', label: 'Pergunta', rows: 2, placeholder: 'Ex.: Como correu a semana? Que dias tenho mais livres?' }]} build={v => ({ question: v.q, context })} />,
    'weekly-report': <TextTool feature="weekly-report" label="Fazer o relatório da semana" build={() => ({ context })} />,
    'review-reply': <TextTool feature="review-reply" label="Escrever resposta" fields={[{ key: 'stars', label: 'Estrelas (1 a 5)', placeholder: '5' }, { key: 'review', label: 'Texto da avaliação', rows: 4 }]} build={v => ({ review: v.review, stars: v.stars, salon: salon.name })} />,
    'price-suggestions': <TextTool feature="price-suggestions" label="Ver sugestões" fields={[{ key: 'city', label: 'Zona', placeholder: 'Ex.: Lisboa, Arroios' }]}
      build={v => ({ city: v.city || salon.address || '', type: salon.type, services: Object.values(services).map(s => `${s.name}: ${euros(s.price_cents)}, ${s.duration_min} min`).join('\n') })} />,
  }

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page">
      <header className="row"><h1>Assistente IA<HelpLink /></h1><Link to="/mais">‹ Mais</Link></header>
      <p className="muted">As funcionalidades de IA da CorteCerto. Enquanto a IA não estiver ligada, aparecem como "Em breve".</p>
      {AI_FEATURES.map(f => (
        <section key={f.id} className="card">
          <button className="client-head" onClick={() => setOpen(open === f.id ? null : f.id)} aria-expanded={open === f.id}>
            <span><strong><Icon name={f.kind === 'image' ? 'camera' : 'spark'} size={16} /> {f.title}</strong><small className="muted">{f.what}</small></span>
            <span className="tags"><span className="tag">{f.where}</span></span>
          </button>
          {open === f.id && (tools[f.id] ?? <p className="muted small">{f.id === 'whatsapp-assistant'
            ? 'Em desenvolvimento: precisa da API do WhatsApp Business. Fará parte do extra Assistente IA.'
            : `Usa-se em ${f.where}.`}</p>)}
        </section>
      ))}
      <p className="muted small">Só números e nomes de serviços são enviados à IA, nunca nomes ou telemóveis de clientes. As fotos não são guardadas.</p>
    </main></div>
  )
}
