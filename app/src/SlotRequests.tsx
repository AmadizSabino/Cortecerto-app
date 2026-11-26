import { useEffect, useMemo, useState } from 'react'
import Icon, { WhatsAppIcon } from './components/Icon'
import { supabase, type Booking, type Professional, type Salon, type Service } from './lib/supabase'
import { freeSlots } from './lib/slots'
import { hoursFor, NO_HOURS, type SalonHours } from './lib/schedule'
import { loadHours } from './lib/scheduleData'
import { addDays, dateInTz, formatTime, zonedToUtc } from './lib/time'
import { formatPhone, waLink } from './lib/whatsapp'
import { manageLink } from './lib/clientChanges'
import { acceptedMessage, askToMoveMessage, declinedMessage, isOpen, proposalMessage, requestLink, shortWhen, sittingOn, type SlotRequest } from './lib/slotRequests'
import ProposeTime from './ProposeTime'
import { publicOrigin } from './lib/publicOrigin'

const ERRORS: Record<string, string> = {
  horario_ocupado: 'Esse horário ainda está ocupado. Mude primeiro a outra marcação (o cliente tem de aceitar o novo horário) e depois tente de novo.',
  horario_passado: 'Esse horário já passou.',
  pedido_fechado: 'Este pedido já foi respondido.',
  profissional_invalido: 'Escolha quem faz o serviço.',
  sem_permissao: 'O seu acesso não permite responder a pedidos.',
  salao_bloqueado: 'A conta está só de leitura. Regularize a assinatura para responder.',
}
const errorText = (m: string) => Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? 'Não foi possível. Verifique a ligação e tente de novo.'

/** The salon suggests another time for a request: a day, a free time and who does it. */
function ProposeForRequest({ salon, req, pros, onDone, onClose }: {
  salon: Salon; req: SlotRequest; pros: Professional[]; onDone: (when: Date, note: string) => void; onClose: () => void
}) {
  const tz = salon.timezone
  const [hours, setHours] = useState<SalonHours>(NO_HOURS)
  const [date, setDate] = useState(() => dateInTz(new Date(req.starts_at), tz))
  const [pro, setPro] = useState(req.professional_id ?? pros[0]?.id ?? '')
  const [busy, setBusy] = useState<{ professional_id: string; start: Date; end: Date }[]>([])
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { loadHours(salon.id).then(setHours) }, [salon.id])
  useEffect(() => {
    const from = zonedToUtc(date, '00:00', tz).toISOString(), to = zonedToUtc(addDays(date, 1), '00:00', tz).toISOString()
    supabase.rpc('busy_slots', { p_salon: salon.id, p_from: from, p_to: to }).then(({ data }) => setBusy((data ?? [])
      .map((x: { professional_id: string; starts_at: string; ends_at: string }) => ({ professional_id: x.professional_id, start: new Date(x.starts_at), end: new Date(x.ends_at) }))))
  }, [date, salon.id, tz])
  const slots = useMemo(() => pro ? freeSlots({ date, tz, hours: hoursFor(hours, pro), durationMin: req.duration_min, now: new Date(),
    busy: busy.filter(b => b.professional_id === pro
      // Its own held time doesn't count, so the salon can move it.
      && !(req.proposed_starts_at && req.proposed_professional_id === pro && b.start.getTime() === new Date(req.proposed_starts_at).getTime())) }) : [],
  [date, tz, hours, pro, busy, req])

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!time) { setError('Escolha a hora a propor.'); return }
    const when = zonedToUtc(date, time, tz)
    setSaving(true)
    const { error } = await supabase.rpc('propose_slot_request', { p_request: req.id, p_starts_at: when.toISOString(), p_professional: pro, p_note: note.trim() || null })
    setSaving(false)
    if (error) { setError(errorText(error.message)); return }
    onDone(when, note.trim())
  }
  return (
    <form className="next-visit" onSubmit={save}>
      <div className="row"><strong>Propor outro horário</strong><button type="button" className="link" onClick={onClose}>Fechar</button></div>
      <p className="muted small" style={{ margin: '4px 0' }}>O horário fica guardado para {req.client_name.split(' ')[0]} até responder pelo link. Se disser que não, volta à lista de espera.</p>
      <div className="row">
        <label>Dia<input type="date" value={date} min={dateInTz(new Date(), tz)} onChange={e => { setDate(e.target.value); setTime('') }} /></label>
        {pros.length > 1 && <label>Com<select value={pro} onChange={e => { setPro(e.target.value); setTime('') }}>{pros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      </div>
      <div className="slots">
        {slots.length === 0 && <span className="muted small">Sem horários livres neste dia.</span>}
        {slots.map(t => { const hhmm = formatTime(t, tz); return <button type="button" key={t.getTime()} className={hhmm === time ? 'slot on' : 'slot'} onClick={() => setTime(hhmm)}>{hhmm}</button> })}
      </div>
      <label><span>Mensagem <span className="muted">(opcional)</span></span><input value={note} maxLength={300} placeholder="Ex.: Às 15h é impossível, mas às 16h30 fica consigo." onChange={e => setNote(e.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <button className="btn" disabled={saving || !time}>{saving ? 'A guardar…' : time ? `Propor ${time}` : 'Escolha uma hora'}</button>
    </form>
  )
}

type Sent = { kind: 'aceite' | 'proposta' | 'recusado'; text: string; phone: string; name: string }

/**
 * "Pedidos de horário" in Hoje (migration 0031): clients who asked for a taken time and are on
 * the waiting list. For each time asked for, who sits there and a WhatsApp to ask them to move;
 * then give the time, suggest another one, or say no. Every message is a one-tap WhatsApp send.
 */
export default function SlotRequests({ salon, services, pros, locked, refresh, onBooked }: {
  salon: Salon; services: Record<string, Service>; pros: Record<string, Professional>; locked: boolean
  refresh: number; onBooked: () => void
}) {
  const tz = salon.timezone
  const [reqs, setReqs] = useState<SlotRequest[] | null>(null)
  const [around, setAround] = useState<Booking[]>([])
  const [error, setError] = useState<{ id: string; text: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [proposing, setProposing] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null) // booking id with "Sugerir outro horário" open
  const [sent, setSent] = useState<Record<string, Sent>>({})
  const [pick, setPick] = useState<Record<string, string>>({}) // who does it, for requests made with "Qualquer um"
  const [asked, setAsked] = useState<Set<string>>(new Set()) // bookings whose client was asked to move

  useEffect(() => {
    supabase.from('slot_requests').select('*').eq('salon_id', salon.id).in('status', ['espera', 'proposta']).order('created_at')
      .then(({ data, error }) => setReqs(error ? [] : ((data ?? []) as SlotRequest[]).filter(r => isOpen(r))))
  }, [salon.id, refresh])

  // The bookings on the days asked for, to show who sits on each time.
  useEffect(() => {
    if (!reqs?.length) { setAround([]); return }
    const times = reqs.flatMap(r => [r.starts_at, r.alt_starts_at].filter((x): x is string => Boolean(x))).map(t => new Date(t).getTime())
    const from = new Date(Math.min(...times) - 86_400_000).toISOString(), to = new Date(Math.max(...times) + 86_400_000).toISOString()
    supabase.from('bookings').select('*').eq('salon_id', salon.id).in('status', ['pendente', 'confirmada']).gte('starts_at', from).lt('starts_at', to).limit(2000)
      .then(({ data }) => setAround((data ?? []) as Booking[]))
  }, [reqs, salon.id, refresh])

  const proList = useMemo(() => Object.values(pros), [pros])
  // Opened from the phone notification (/painel#pedidos): scroll to the list once it's there.
  useEffect(() => {
    if (reqs?.length && location.hash === '#pedidos') requestAnimationFrame(() => document.getElementById('pedidos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [reqs])
  if (!reqs || (reqs.length === 0 && Object.keys(sent).length === 0)) return null

  async function act(r: SlotRequest, fn: () => PromiseLike<{ error: { message: string } | null }>, after: () => void) {
    setBusyId(r.id); setError(null)
    const { error } = await fn()
    setBusyId(null)
    if (error) { setError({ id: r.id, text: errorText(error.message) }); return }
    after()
  }
  const svcName = (r: SlotRequest) => services[r.service_id]?.name ?? 'Serviço'
  const done = (r: SlotRequest, s: Sent) => { setSent(x => ({ ...x, [r.id]: s })); setReqs(rs => (rs ?? []).filter(x => x.id !== r.id)) }

  function give(r: SlotRequest, choice: 1 | 2, freePro: string | null) {
    const when = new Date(choice === 2 ? r.alt_starts_at! : r.starts_at)
    const p = r.professional_id ? null : (pick[r.id] || freePro)
    act(r, () => supabase.rpc('accept_slot_request', { p_request: r.id, p_choice: choice, p_professional: p }), () => {
      // The booking id is not needed for the message: the client's link comes from the request.
      supabase.from('slot_requests').select('booking_id').eq('id', r.id).maybeSingle().then(({ data }) => {
        done(r, { kind: 'aceite', name: r.client_name, phone: r.client_phone,
          text: acceptedMessage(r.client_name, salon.name, svcName(r), when, tz, data?.booking_id ? manageLink(publicOrigin(), data.booking_id) : requestLink(publicOrigin(), r.id)) })
      })
      onBooked()
    })
  }

  return (
    <section className="card requests" id="pedidos" aria-label="Pedidos de horário">
      <div className="between">
        <h2 style={{ margin: 0 }}>Pedidos de horário</h2>
        {reqs.length > 0 && <span className="tag warn">{reqs.length} na lista de espera</span>}
      </div>
      <p className="muted small" style={{ margin: '4px 0 6px' }}>Clientes que querem um horário que já está ocupado. Ficam na lista de espera até lhes responder.</p>

      {Object.entries(sent).map(([id, s]) => (
        <div key={id} className="request sent-row">
          <span>{s.kind === 'aceite' ? <><b>{s.name}</b> ficou marcado ✓ Avise-o:</> : s.kind === 'proposta' ? <>Proposta guardada para <b>{s.name}</b>. Envie-lhe o link:</> : <>Pedido de <b>{s.name}</b> recusado. Avise-o:</>}</span>
          <div className="actions">
            {/\d{6}/.test(s.phone) && <a className="wa" href={waLink(s.phone, s.text)} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />Enviar por WhatsApp</a>}
            <button className="link" onClick={() => setSent(x => { const n = { ...x }; delete n[id]; return n })}>Feito</button>
          </div>
        </div>
      ))}

      {reqs.map(r => {
        const choices = [r.starts_at, r.alt_starts_at].filter((x): x is string => Boolean(x)).map(t => new Date(t))
        const proposed = r.status === 'proposta' && r.proposed_starts_at ? new Date(r.proposed_starts_at) : null
        const link = requestLink(publicOrigin(), r.id)
        return (
          <article key={r.id} className="request">
            <div className="who">
              <span className="avatar sm"><Icon name="clock" size={16} /></span>
              <span><b>{r.client_name}</b> pede <b>{svcName(r)}</b>{r.professional_id ? <> com {pros[r.professional_id]?.name}</> : <> · qualquer profissional</>}
                <small className="muted">{r.duration_min} min · pedido {new Date(r.created_at).toLocaleDateString('pt-PT', { timeZone: tz, day: 'numeric', month: 'short' })}{/\d{6}/.test(r.client_phone) && <> · <a href={`tel:+${formatPhone(r.client_phone).replace(/\D/g, '')}`}>{formatPhone(r.client_phone)}</a></>}</small>
              </span>
            </div>
            {r.note && <p className="about small">“{r.note}”</p>}
            {r.client_declined_at && r.status === 'espera' && <p className="small"><span className="tag warn">Não aceitou o horário proposto</span></p>}
            {proposed && (
              <div className="proposal">
                Propôs <b>{shortWhen(proposed, tz)}</b>{r.proposed_professional_id && pros[r.proposed_professional_id] ? ` com ${pros[r.proposed_professional_id].name}` : ''} · à espera da resposta
                {/\d{6}/.test(r.client_phone) && <div className="actions"><a className="wa" href={waLink(r.client_phone, proposalMessage(r.client_name, salon.name, proposed, tz, link, r.proposal_note))} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />Reenviar</a></div>}
              </div>
            )}
            <ul className="choices-list">
              {choices.map((when, i) => {
                const on = sittingOn(around, when, r.duration_min, r.professional_id)
                // For "Qualquer um": someone free at that time, if there is.
                const freePro = r.professional_id ? null : proList.find(p => sittingOn(around, when, r.duration_min, p.id).length === 0)?.id ?? null
                const free = r.professional_id ? on.length === 0 : freePro !== null
                const past = when.getTime() < Date.now()
                return (
                  <li key={when.getTime()}>
                    <div className="between">
                      <span>{choices.length > 1 && <small className="muted">{i + 1}.ª escolha · </small>}<b>{shortWhen(when, tz)}</b></span>
                      {past ? <span className="tag">Já passou</span> : free ? <span className="tag ok-tag">Livre agora</span> : <span className="tag">Ocupado</span>}
                    </div>
                    {!past && !free && on.map(b => (
                      <div key={b.id} className="small sitting">
                        Está {b.client_name} ({services[b.service_id]?.name ?? 'serviço'}{!r.professional_id && pros[b.professional_id] ? `, ${pros[b.professional_id].name}` : ''}, {formatTime(new Date(b.starts_at), tz)}–{formatTime(new Date(b.ends_at), tz)})
                        {b.proposed_starts_at && <> · já lhe sugeriu {shortWhen(new Date(b.proposed_starts_at), tz)}</>}
                        {!locked && (
                          <div className="actions">
                            {/\d{6}/.test(b.client_phone) && <a className={asked.has(b.id) ? 'wa sent' : 'wa'} href={waLink(b.client_phone, askToMoveMessage(b.client_name, salon.name, services[b.service_id]?.name ?? '', new Date(b.starts_at), tz))}
                              target="_blank" rel="noreferrer" onClick={() => setAsked(s => new Set(s).add(b.id))}><WhatsAppIcon size={16} />{asked.has(b.id) ? 'Perguntado' : `Pedir a ${b.client_name.split(' ')[0]} para mudar`}</a>}
                            {!b.proposed_starts_at && moving !== b.id && <button onClick={() => setMoving(b.id)}>Mudar {b.client_name.split(' ')[0]} de hora</button>}
                          </div>
                        )}
                        {moving === b.id && (
                          <ProposeTime salon={salon} booking={b} serviceName={services[b.service_id]?.name ?? ''} onClose={() => setMoving(null)}
                            onDone={nb => setAround(bs => bs.map(x => x.id === nb.id ? nb : x))} />
                        )}
                      </div>
                    ))}
                    {!past && free && !locked && (
                      <div className="actions">
                        {!r.professional_id && proList.length > 1 && (
                          <select aria-label="Quem faz" value={pick[r.id] || freePro || ''} onChange={e => setPick(x => ({ ...x, [r.id]: e.target.value }))} style={{ width: 'auto' }}>
                            {proList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                        <button className="btn-inline" disabled={busyId === r.id} onClick={() => give(r, (i + 1) as 1 | 2, freePro)}><Icon name="check" size={16} />Dar {formatTime(when, tz)} a {r.client_name.split(' ')[0]}</button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            {error?.id === r.id && <p className="error small" role="alert">{error.text}</p>}
            {!locked && proposing !== r.id && (
              <div className="actions">
                <button onClick={() => setProposing(r.id)}>Propor outro horário</button>
                <button className="link" disabled={busyId === r.id} onClick={() => act(r, () => supabase.rpc('decline_slot_request', { p_request: r.id }),
                  () => done(r, { kind: 'recusado', name: r.client_name, phone: r.client_phone, text: declinedMessage(r.client_name, salon.name, `${publicOrigin()}/s/${salon.slug}`) }))}>Recusar</button>
              </div>
            )}
            {proposing === r.id && (
              <ProposeForRequest salon={salon} req={r} pros={proList} onClose={() => setProposing(null)}
                onDone={(when, note) => { setProposing(null); done(r, { kind: 'proposta', name: r.client_name, phone: r.client_phone, text: proposalMessage(r.client_name, salon.name, when, tz, link, note) }) }} />
            )}
          </article>
        )
      })}
    </section>
  )
}
