/**
 * Phone pictures for the landing page, drawn in HTML so they stay sharp, light and in step with
 * the real screens: the client booking page, Hoje, Lembretes, a client's card and a WhatsApp chat.
 * Names and numbers are examples (the demo salon "Barba e Beer").
 */
import type { ReactNode } from 'react'
import Icon, { WhatsAppIcon } from '../../components/Icon'

export function Phone({ children, label, dark, className = '' }: { children: ReactNode; label: string; dark?: boolean; className?: string }) {
  return (
    <figure className={`mk-phone ${dark ? 'mk-dark' : ''} ${className}`} role="img" aria-label={label}>
      <div className="mk-status" aria-hidden="true"><span>9:41</span><span className="mk-notch" /><span className="mk-bars">▮▮▮</span></div>
      <div className="mk-screen" aria-hidden="true">{children}</div>
    </figure>
  )
}

/** The salon's own booking page, as a client sees it (Barba e Beer theme). */
export function MockBooking() {
  const services: [string, string, string][] = [['Corte', '30 min', '14 €'], ['Corte + barba', '45 min', '20 €'], ['Barba desenhada', '20 min', '9 €'], ['Corte criança', '25 min', '11 €']]
  return (
    <Phone label="Página de marcação do salão, vista pelo cliente" dark>
      <div className="mk-bk-cover" />
      <div className="mk-bk-head"><span className="mk-bk-logo">BB</span><b>Barba e Beer</b></div>
      <p className="mk-bk-info"><Icon name="pin" size={12} /> Rua da Prata 120, Lisboa</p>
      <div className="mk-bk-steps"><i className="on" /><i /><i /><i /></div>
      <p className="mk-bk-title">O que vai ser?</p>
      {services.map(([n, d, p], i) => (
        <div key={n} className={`mk-bk-svc ${i === 1 ? 'sel' : ''}`}><span><b>{n}</b><small>{d}</small></span><strong>{p}</strong></div>
      ))}
      <div className="mk-bk-btn">Escolher hora</div>
    </Phone>
  )
}

/** Hoje: the salon's day. */
export function MockToday() {
  const rows: [string, string, string, string, string][] = [
    ['09:30', 'Tiago Mendes', 'Corte + barba · Rui · 20 €', 'confirmada', 'Confirmada'],
    ['10:15', 'André Costa', 'Corte · Rui · 14 €', 'pendente', 'Por confirmar'],
    ['11:00', 'Miguel Sousa', 'Barba desenhada · Nuno · 9 €', 'concluida', 'Concluída'],
  ]
  return (
    <Phone label="Ecrã Hoje do salão: marcações do dia e lembretes">
      <p className="mk-eyebrow">BARBA E BEER · 24 NOV</p>
      <p className="mk-h">Bom dia</p>
      <div className="mk-stats"><span><b>9</b>Marcações hoje</span><span><b>162 €</b>Faturação prevista</span><span><b>1</b>Sinais por confirmar</span></div>
      <div className="mk-card mk-remind"><Icon name="bell" size={14} /><span><b>Lembretes de amanhã</b><small>7 clientes · cerca de 2 minutos</small></span><em>Abrir</em></div>
      {rows.map(([t, n, s, st, l]) => (
        <div key={t} className={`mk-card mk-bkg st-${st}`}>
          <span className="mk-time">{t}</span>
          <span className="mk-body"><span className="mk-who"><b>{n}</b><i className={`mk-tag ${st}`}>{l}</i></span><small>{s}</small>
            <span className="mk-acts"><em>Concluída</em><em>Faltou</em><em className="mk-wab"><WhatsAppIcon size={11} />WhatsApp</em></span></span>
        </div>
      ))}
      <div className="mk-tabs"><span className="on"><Icon name="calendar" size={14} />Hoje</span><span><Icon name="week" size={14} />Semana</span><span><Icon name="users" size={14} />Clientes</span><span><Icon name="menu" size={14} />Mais</span></div>
    </Phone>
  )
}

/** Lembretes: one tap per client, the salon's own WhatsApp opens with the message written. */
export function MockReminders() {
  const rows: [string, string, boolean][] = [['09:30', 'Tiago Mendes', true], ['10:15', 'André Costa', true], ['11:00', 'Rita Lopes', false], ['12:30', 'Hugo Martins', false], ['15:00', 'Duarte Pinto', false]]
  return (
    <Phone label="Ecrã Lembretes: um toque por cliente abre o WhatsApp com a mensagem escrita">
      <p className="mk-back">‹ Mais</p>
      <p className="mk-h">Lembretes</p>
      <p className="mk-sub">Amanhã, terça · 7 marcações</p>
      <div className="mk-progress"><i style={{ width: '29%' }} /><small>2 de 7 enviados</small></div>
      {rows.map(([t, n, sent]) => (
        <div key={t} className="mk-card mk-rem">
          <span className="mk-time">{t}</span><b>{n}</b>
          <em className={sent ? 'sent' : 'mk-wab'}>{sent ? <><Icon name="check" size={11} />Enviado</> : <><WhatsAppIcon size={11} />Enviar</>}</em>
        </div>
      ))}
    </Phone>
  )
}

/** A client's card: history, notes, birthday. */
export function MockClient() {
  const visits: [string, string, string][] = [['3 nov', 'Corte + barba', 'Rui'], ['13 out', 'Corte + barba', 'Rui'], ['22 set', 'Corte', 'Nuno'], ['1 set', 'Corte + barba', 'Rui']]
  return (
    <Phone label="Ficha de um cliente: visitas, notas e aniversário">
      <p className="mk-back">‹ Clientes</p>
      <div className="mk-client-head"><span className="mk-av">TM</span><span><b>Tiago Mendes</b><small>912 345 678</small></span></div>
      <div className="mk-stats"><span><b>14</b>Visitas</span><span><b>3 sem.</b>Desde a última</span><span><b>12 mar</b>Aniversário</span></div>
      <div className="mk-card mk-note"><small>Notas</small>Degradê baixo, máquina 1 dos lados. Gosta da barba curta e da conversa sobre o Vitória.</div>
      <p className="mk-label">Visitas</p>
      {visits.map(([d, s, p]) => <div key={d} className="mk-visit"><span>{d}</span><span>{s}</span><small>{p}</small></div>)}
      <div className="mk-row-btns"><em className="mk-wab"><WhatsAppIcon size={11} />WhatsApp</em><em className="solid">Marcar</em></div>
    </Phone>
  )
}

/** The reminder as the client receives it, sent from the salon's own WhatsApp. */
export function MockChat() {
  return (
    <Phone label="Lembrete no WhatsApp do cliente, com link para mudar de hora" className="mk-wa">
      <div className="mk-wa-head"><span className="mk-av sm">BB</span><span><b>Barba e Beer</b><small>online</small></span></div>
      <div className="mk-wa-body">
        <p className="mk-msg in">Olá Tiago! Lembramos a sua marcação de Corte + barba amanhã, terça, às 18:30. Se não puder vir, mude aqui: cortecerto.pt/m/a1b2<small>20:02</small></p>
        <p className="mk-msg out">Amanhã não dá, já passei para quinta às 10h 👍<small>20:05 ✓✓</small></p>
        <p className="mk-sys">A vaga de terça às 18:30 ficou livre</p>
      </div>
    </Phone>
  )
}
