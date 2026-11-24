/**
 * Phone pictures for the landing page, drawn in HTML so they stay sharp, light and in step with
 * the real screens: the client booking page, Hoje, Lembretes, a client's card and a WhatsApp chat.
 * Names and numbers are examples (the demo salon "Barba e Beer").
 */
import type { ReactNode } from 'react'
import Icon from '../../components/Icon'

export function Phone({ children, label, dark, className = '' }: { children: ReactNode; label: string; dark?: boolean; className?: string }) {
  return (
    <figure className={`mk-phone ${dark ? 'mk-dark' : ''} ${className}`} role="img" aria-label={label}>
      <div className="mk-status" aria-hidden="true"><span>9:41</span><span className="mk-notch" /><span className="mk-bars">▮▮▮</span></div>
      <div className="mk-screen" aria-hidden="true">{children}</div>
    </figure>
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

/** Mais > Assistente IA: the owner asks about the diary in plain Portuguese. */
export function MockAssistant() {
  return (
    <Phone label="Assistente do salão: o dono pergunta e a IA responde com a agenda real">
      <p className="mk-back">‹ Mais</p>
      <p className="mk-h">Assistente IA</p>
      <div className="mk-ai-body">
        <p className="mk-q">Tenho buracos amanhã?</p>
        <p className="mk-a"><b>Amanhã, terça:</b> 7 marcações.<br />Livre: 11:00–12:30 com o Rui e 15:30–17:00 com o Nuno.<br />Quer um texto para oferecer a vaga das 11h aos seus clientes?</p>
        <p className="mk-q">Quem não vem há mais de 2 meses?</p>
        <p className="mk-a">6 clientes habituais. Os primeiros: Hugo M. (78 dias), Pedro A. (71 dias), Duarte P. (64 dias). Quer uma mensagem para os convidar a voltar?</p>
      </div>
      <div className="mk-ai-input"><span>Pergunte pelo seu dia…</span><em><Icon name="spark" size={12} /></em></div>
    </Phone>
  )
}


/** A real screenshot of the app (demo data), in a phone frame. Made with scripts in the landing PR; see public/landing/. */
export function Shot({ src, label, className = '' }: { src: string; label: string; className?: string }) {
  return (
    <figure className={`mk-phone mk-shot ${className}`}>
      <div className="mk-status" aria-hidden="true"><span>9:41</span><span className="mk-notch" /><span className="mk-bars">▮▮▮</span></div>
      <div className="mk-screen"><img src={`/landing/${src}.webp`} alt={label} width={430} height={932} loading="lazy" decoding="async" /></div>
    </figure>
  )
}
