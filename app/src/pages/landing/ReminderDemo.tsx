import { useMemo, useState } from 'react'
import { reminderMessage } from '../../lib/reminders'
import { WhatsAppIcon } from '../../components/Icon'

/** Per kind of salon: an example name, client and services, so every visitor sees their own business. */
const KINDS: { label: string; salon: string; client: string; services: string[] }[] = [
  { label: 'Barbearia', salon: 'Barbearia do Rui', client: 'Tiago', services: ['Corte', 'Corte + barba', 'Barba'] },
  { label: 'Cabeleireiro', salon: 'Cabeleireiro Ana', client: 'Marta', services: ['Corte e brushing', 'Madeixas', 'Coloração'] },
  { label: 'Unhas', salon: 'Unhas da Sofia', client: 'Inês', services: ['Manicure gel', 'Verniz gel', 'Pedicure'] },
  { label: 'Estética', salon: 'Estética Bela', client: 'Rita', services: ['Depilação a laser', 'Limpeza de pele', 'Sobrancelhas'] },
]
const TIMES = ['10:00', '14:30', '18:30']
const TZ = 'Europe/Lisbon'

/** Tomorrow at hh:mm, Lisbon time (close enough for a demo: the text only shows the day and the time). */
function tomorrowAt(hm: string): Date {
  const d = new Date(Date.now() + 864e5)
  const ymd = d.toLocaleDateString('en-CA', { timeZone: TZ })
  const offset = new Date(`${ymd}T12:00:00Z`).toLocaleString('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)?/)?.[1] ?? '+0'
  return new Date(`${ymd}T${hm}:00${(Number(offset) >= 0 ? '+' : '-') + String(Math.abs(Number(offset))).padStart(2, '0')}:00`)
}

/**
 * "Veja o lembrete que o seu cliente recebe": the visitor picks a name, service and time and sees
 * the exact text the app writes (lib/reminders.ts). Honest about how it is sent: one tap by the salon.
 */
export default function ReminderDemo() {
  const [kind, setKind] = useState(KINDS[0])
  const [name, setName] = useState(KINDS[0].client)
  const [salon, setSalon] = useState(KINDS[0].salon)
  const [service, setService] = useState(KINDS[0].services[1])
  const pickKind = (label: string) => {
    const k = KINDS.find(x => x.label === label)!
    setKind(k); setName(k.client); setSalon(k.salon); setService(k.services[1])
  }
  const [time, setTime] = useState(TIMES[2])
  const text = useMemo(() => reminderMessage({
    clientName: name.trim() || kind.client, serviceName: service, startsAt: tomorrowAt(time), tz: TZ,
    salonName: salon.trim() || kind.salon, isTomorrow: true, manageUrl: 'cortecerto.pt/m/a1b2',
  }), [name, service, time, salon, kind])
  const chips = (list: string[], value: string, set: (v: string) => void, label: string) => (
    <div className="rd-chips" role="radiogroup" aria-label={label}>
      {list.map(v => <button key={v} type="button" role="radio" aria-checked={v === value} className={v === value ? 'sel' : ''} onClick={() => set(v)}>{v}</button>)}
    </div>
  )
  return (
    <div className="rd">
      <div className="rd-controls">
        <p className="rd-label">Tipo de salão</p>
        {chips(KINDS.map(k => k.label), kind.label, pickKind, 'Tipo de salão')}
        <label>Nome do cliente<input value={name} maxLength={30} onChange={e => setName(e.target.value)} /></label>
        <label>Nome do salão<input value={salon} maxLength={40} onChange={e => setSalon(e.target.value)} /></label>
        <p className="rd-label">Serviço</p>
        {chips(kind.services, service, setService, 'Serviço')}
        <p className="rd-label">Amanhã às</p>
        {chips(TIMES, time, setTime, 'Hora')}
      </div>
      <div className="rd-out">
        <div className="rd-chat" aria-live="polite">
          <div className="rd-head"><span className="mk-av sm">{(salon.trim() || 'S')[0].toUpperCase()}</span><span><b>{salon.trim() || kind.salon}</b><small>a escrever para {name.trim() || kind.client}</small></span></div>
          <p className="rd-msg">{text}<small>20:02 ✓✓</small></p>
        </div>
        <p className="rd-how"><WhatsAppIcon size={16} />Esta mensagem sai do WhatsApp do salão. Na app, toca no cliente e ela abre pronta: só carrega em enviar.</p>
        <a className="lp-cta wa block" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><WhatsAppIcon size={18} />Ver no meu WhatsApp</a>
      </div>
    </div>
  )
}
