import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon, { WhatsAppIcon } from '../components/Icon'
import { supabase } from '../lib/supabase'
import { mediaUrl } from '../lib/brand'
import { themeById, themeStyle } from '../lib/themes'
import { manageLink } from '../lib/clientChanges'
import { formatTime } from '../lib/time'
import { waLink } from '../lib/whatsapp'
import type { RequestStatus } from '../lib/slotRequests'

/** Row returned by slot_request_for_client (migration 0031). */
interface Req {
  id: string; status: RequestStatus; starts_at: string; alt_starts_at: string | null; duration_min: number
  proposed_starts_at: string | null; proposal_note: string | null; client_declined_at: string | null; booking_id: string | null
  client_name: string; service_name: string; professional_name: string | null; proposed_professional_name: string | null
  salon_slug: string; salon_name: string; salon_theme: string; salon_timezone: string; salon_whatsapp: string | null; salon_logo: string | null
}
const ERRORS: Record<string, string> = {
  horario_ocupado: 'Esse horário deixou de estar livre. Fale com o salão.',
  horario_passado: 'Esse horário já passou. Fale com o salão.',
  sem_proposta: 'A proposta foi alterada. Atualize a página.',
}
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** /horario/<id>: a client's request for a taken time, the salon's answer, and accepting a suggested time. */
export default function SlotRequestPage() {
  const { id = '' } = useParams()
  const [r, setR] = useState<Req | null>()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [giveUp, setGiveUp] = useState(false)
  const load = useCallback(() => supabase.rpc('slot_request_for_client', { p_request: id })
    .then(({ data }) => setR(((data ?? [])[0] as Req | undefined) ?? null)), [id])
  useEffect(() => { load() }, [load])
  // The salon's answer appears without reloading when the client comes back to the page.
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', again)
    return () => document.removeEventListener('visibilitychange', again)
  }, [load])

  if (r === undefined) return <main className="page">A carregar…</main>
  if (r === null) return <main className="page"><h1>Pedido não encontrado</h1><p className="muted">Confirme o link que recebeu.</p></main>
  const tz = r.salon_timezone
  const when = (iso: string) => { const d = new Date(iso); return `${cap(d.toLocaleDateString('pt-PT', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }))}, ${formatTime(d, tz)}` }

  async function answer(accept: boolean) {
    setSaving(true); setError('')
    const { error } = await supabase.rpc('answer_slot_proposal', { p_request: id, p_accept: accept })
    setSaving(false)
    if (error) { setError(Object.entries(ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? 'Não foi possível. Tente de novo.'); return }
    load()
  }
  async function cancel() {
    setSaving(true)
    await supabase.rpc('cancel_slot_request', { p_request: id })
    setSaving(false); setGiveUp(false); load()
  }

  const open = r.status === 'espera' || r.status === 'proposta'
  return (
    <div className="themed" style={themeStyle(themeById(r.salon_theme))}><main className="page">
      <header className="brand-head">{r.salon_logo && <img className="brand-logo" src={mediaUrl(r.salon_logo)!} alt="" />}<p className="muted" style={{ margin: 0 }}>{r.salon_name}</p></header>
      <h1>{r.status === 'marcada' ? 'Está marcado ✓' : r.status === 'proposta' ? 'O salão propõe outro horário' : 'O seu pedido de horário'}</h1>

      {r.status === 'espera' && (
        <div className="card soft request-state">
          <Icon name="clock" size={22} />
          <span><b>Está na lista de espera.</b> O salão vai ver se consegue arranjar o horário e responde-lhe por WhatsApp.{r.client_declined_at ? ' Disse que não ao horário proposto; o salão já sabe.' : ''}</span>
        </div>
      )}

      {r.status === 'proposta' && r.proposed_starts_at && (
        <section className="card warn">
          <p style={{ margin: '0 0 4px' }}>O horário que pediu não está livre. O salão guardou este para si:</p>
          <p className="big-when">{when(r.proposed_starts_at)}</p>
          {r.proposed_professional_name && <p className="muted small" style={{ margin: 0 }}>{r.service_name} com {r.proposed_professional_name}</p>}
          {r.proposal_note && <p className="about">{r.proposal_note}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button className="btn-inline" disabled={saving} onClick={() => answer(true)}><Icon name="check" size={16} />Aceitar e marcar</button>
            <button disabled={saving} onClick={() => answer(false)}>Não me dá jeito</button>
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>Se disser que não, continua na lista de espera do salão.</p>
        </section>
      )}

      {r.status === 'marcada' && (
        <div className="card raised" style={{ textAlign: 'center' }}>
          <div className="done-mark"><Icon name="check" size={34} /></div>
          <p style={{ margin: 0 }}>O seu horário no <b>{r.salon_name}</b> está marcado. Não precisa de fazer mais nada.</p>
          {r.booking_id && <p style={{ marginBottom: 0 }}><Link className="btn ghost inline sm" to={`/m/${r.booking_id}`}>Ver a marcação</Link></p>}
        </div>
      )}
      {r.status === 'recusada' && <div className="card"><p style={{ margin: 0 }}>Desta vez o salão não conseguiu arranjar o horário que pediu. Veja os horários livres e marque outro.</p><p style={{ marginBottom: 0 }}><Link className="btn-inline btn inline sm" to={`/s/${r.salon_slug}`}>Ver horários livres</Link></p></div>}
      {r.status === 'cancelada' && <div className="card"><p style={{ margin: 0 }}>Desistiu deste pedido. Pode marcar outro horário quando quiser.</p><p style={{ marginBottom: 0 }}><Link className="btn ghost inline sm" to={`/s/${r.salon_slug}`}>Página do salão</Link></p></div>}

      <div className="card">
        <dl className="kv">
          <dt>Serviço</dt><dd>{r.service_name}</dd>
          <dt>Com</dt><dd>{r.professional_name ?? 'Qualquer um'}</dd>
          <dt>{r.alt_starts_at ? '1.ª escolha' : 'Pediu'}</dt><dd>{when(r.starts_at)}</dd>
          {r.alt_starts_at && <><dt>2.ª escolha</dt><dd>{when(r.alt_starts_at)}</dd></>}
        </dl>
      </div>

      {open && (giveUp
        ? <div className="card danger"><p style={{ marginTop: 0 }}>Sair da lista de espera? O salão deixa de ver o seu pedido.</p>
            <div className="actions"><button className="btn-danger" disabled={saving} onClick={cancel}>Sim, desistir</button><button className="link" onClick={() => setGiveUp(false)}>Não</button></div></div>
        : <button className="link" onClick={() => setGiveUp(true)}>Já não preciso: desistir do pedido</button>)}

      <p className="muted small" style={{ marginTop: 16 }}>
        {r.salon_whatsapp && <a href={waLink(r.salon_whatsapp, `Olá! Sobre o meu pedido de horário (${r.service_name}, ${when(r.starts_at)}).`)} target="_blank" rel="noreferrer"><WhatsAppIcon size={14} /> Falar com o salão</a>}
        {r.salon_whatsapp && ' · '}<Link to={`/s/${r.salon_slug}`}>Página do salão</Link>
        {r.booking_id && <> · <a href={manageLink(location.origin, r.booking_id)}>Mudar ou cancelar</a></>}
      </p>
    </main></div>
  )
}
