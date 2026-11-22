import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { euros, supabase } from '../lib/supabase'
import { mediaUrl } from '../lib/brand'
import { eventMilestones } from '../lib/packages'
import { themeById, themeStyle } from '../lib/themes'
import { formatTime } from '../lib/time'
import { formatPhone, waLink } from '../lib/whatsapp'

/** Row returned by package_request_for_client (migration 0022). */
interface Req {
  id: string; status: 'pedido' | 'proposta' | 'aceite' | 'recusado' | 'cancelado'; package_name: string; package_description: string
  includes_trial: boolean; extra_hour_cents: number | null; event_date: string; event_time: string | null; place: string; guests: number
  estimate_cents: number; proposal_cents: number | null; deposit_cents: number | null; proposal_note: string | null
  trial_at: string | null; event_at: string | null; valid_until: string | null; client_name: string
  salon_slug: string; salon_name: string; salon_theme: string; salon_timezone: string; salon_whatsapp: string | null
  mbway_number: string | null; salon_logo: string | null; professional_name: string | null
}
const ERRORS: Record<string, string> = {
  horario_ocupado: 'Um dos horários da proposta deixou de estar livre. Fale com o salão.',
  proposta_expirada: 'A proposta já passou da validade. Fale com o salão.',
  sem_proposta: 'A proposta foi alterada. Atualize a página.',
}

/** /pedido/<id>: the client's event request and the salon's proposal, to accept or decline. */
export default function RequestPage() {
  const { id = '' } = useParams()
  const [r, setR] = useState<Req | null>()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const load = useCallback(() => supabase.rpc('package_request_for_client', { p_request: id }).then(({ data }) => setR(((data ?? [])[0] as Req | undefined) ?? null)), [id])
  useEffect(() => { load() }, [load])

  if (r === undefined) return <main className="page">A carregar…</main>
  if (r === null) return <main className="page"><h1>Pedido não encontrado</h1><p className="muted">Confirme o link que recebeu.</p></main>
  const tz = r.salon_timezone
  const when = (iso: string) => { const d = new Date(iso); return `${d.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })}, ${formatTime(d, tz)}` }
  const eventDay = new Date(r.event_date + 'T12:00:00Z').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

  async function act(accept: boolean) {
    setSaving(true); setError('')
    const { error } = await supabase.rpc(accept ? 'accept_package_proposal' : 'decline_package_proposal', { p_request: id })
    setSaving(false)
    if (error) { setError(Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? 'Não foi possível. Tente de novo.'); return }
    load()
  }

  return (
    <div className="themed" style={themeStyle(themeById(r.salon_theme))}><main className="page">
      <header className="brand-head">{r.salon_logo && <img className="brand-logo" src={mediaUrl(r.salon_logo)!} alt="" />}<p className="muted" style={{ margin: 0 }}>{r.salon_name}</p></header>
      <h1>{r.package_name}</h1>
      <div className="card">
        <dl className="kv">
          <dt>Evento</dt><dd>{eventDay}{r.event_time ? `, ${r.event_time.slice(0, 5)}` : ''}</dd>
          <dt>Onde</dt><dd>{r.place === 'local' ? 'No local do evento' : 'No salão'}</dd>
          <dt>Pessoas</dt><dd>{1 + r.guests}</dd>
          <dt>Estimativa</dt><dd>{euros(r.estimate_cents)}</dd>
        </dl>
      </div>

      {r.status === 'pedido' && <p className="muted">O salão está a preparar a proposta. Vai recebê-la por WhatsApp com este link.</p>}

      {(r.status === 'proposta' || r.status === 'aceite') && r.proposal_cents != null && (
        <section className={r.status === 'proposta' ? 'card warn' : 'card'}>
          <h2 style={{ marginTop: 0 }}>{r.status === 'proposta' ? 'Proposta do salão' : 'Combinado ✓'}</h2>
          <dl className="kv">
            <dt>Preço</dt><dd><b>{euros(r.proposal_cents)}</b></dd>
            {r.deposit_cents ? <><dt>Sinal</dt><dd>{euros(r.deposit_cents)}{r.mbway_number ? ` por MB Way (${formatPhone(r.mbway_number)})` : ''}</dd></> : null}
            {r.trial_at && <><dt>Prova</dt><dd>{when(r.trial_at)}</dd></>}
            {r.event_at && <><dt>No dia</dt><dd>{when(r.event_at)}</dd></>}
            {r.professional_name && <><dt>Com</dt><dd>{r.professional_name}</dd></>}
            {r.extra_hour_cents ? <><dt>Espera extra</dt><dd>{euros(r.extra_hour_cents)} por hora</dd></> : null}
            {r.valid_until && r.status === 'proposta' && <><dt>Válida até</dt><dd>{new Date(r.valid_until + 'T12:00:00Z').toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', timeZone: 'UTC' })}</dd></>}
          </dl>
          {r.proposal_note && <p className="about">{r.proposal_note}</p>}
          {r.status === 'proposta' && <>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="actions">
              <button className="btn-inline" disabled={saving} onClick={() => act(true)}>Aceitar proposta</button>
              <button disabled={saving} onClick={() => act(false)}>Não aceito</button>
            </div>
          </>}
          {r.status === 'aceite' && r.event_at && (
            <ul className="small">{eventMilestones(new Date(r.event_at), r.trial_at ? new Date(r.trial_at) : null, new Date()).map(m => (
              <li key={m.label} className={m.done ? 'muted' : ''}>{m.done ? '✓ ' : ''}{m.label}: {when(m.at.toISOString())}</li>
            ))}</ul>
          )}
          {r.status === 'aceite' && r.deposit_cents ? <p className="small">O sinal confirma as datas. {r.mbway_number ? `Envie ${euros(r.deposit_cents)} por MB Way para ${formatPhone(r.mbway_number)}.` : ''}</p> : null}
        </section>
      )}
      {r.status === 'recusado' && <p className="muted">Recusou esta proposta. Se mudar de ideias, fale com o salão.</p>}
      {r.status === 'cancelado' && <p className="muted">O salão cancelou este pedido.</p>}

      <p className="muted small">
        {r.salon_whatsapp && <a href={waLink(r.salon_whatsapp, `Olá! Sobre o pedido ${r.package_name} de ${eventDay}.`)} target="_blank" rel="noreferrer">Falar com o salão</a>}
        {' · '}<Link to={`/s/${r.salon_slug}`}>Página do salão</Link>
      </p>
    </main></div>
  )
}
