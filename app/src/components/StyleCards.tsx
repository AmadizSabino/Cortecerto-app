import { useEffect, type ReactNode } from 'react'
import Icon from './Icon'
import { cardImage, type StyleCard } from '../lib/styleCatalog'

/** The AI label every style photo carries: the people in them are not real. */
export const AI_PHOTO_NOTE = 'Imagem ilustrativa, criada por IA. Não é uma pessoa real.'

/** A row of style photos to scroll sideways (booking page). */
export function StyleStrip({ cards, chosen, onOpen }: { cards: StyleCard[]; chosen?: string; onOpen: (c: StyleCard) => void }) {
  return (
    <div className="style-strip">
      {cards.map(c => (
        <button key={c.id} type="button" className={c.id === chosen ? 'picked' : ''} onClick={() => onOpen(c)} aria-label={`Ver ${c.name}`}>
          <img src={cardImage(c)} alt="" loading="lazy" width={120} height={150} />
          <span>{c.id === chosen && <Icon name="check" size={14} />}{c.name}</span>
        </button>
      ))}
    </div>
  )
}

/** A grid of style photos (the salon's Estilos page). */
export function StyleGrid({ cards, hidden = [], onOpen }: { cards: StyleCard[]; hidden?: string[]; onOpen: (c: StyleCard) => void }) {
  return (
    <div className="style-grid">
      {cards.map(c => (
        <button key={c.id} type="button" className={hidden.includes(c.id) ? 'off' : ''} onClick={() => onOpen(c)}>
          <img src={cardImage(c)} alt="" loading="lazy" width={240} height={300} />
          <span className="t">{c.name}</span>
          {hidden.includes(c.id) && <span className="tag">Escondido</span>}
        </button>
      ))}
    </div>
  )
}

/** One style, full: the photo on top and what each page adds below it. Closes with Esc or a tap outside. */
export function StyleSheet({ card, onClose, children }: { card: StyleCard; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    document.body.classList.add('no-scroll')
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('no-scroll') }
  }, [onClose])
  return (
    <div className="style-sheet-wrap" role="dialog" aria-modal="true" aria-label={card.name} onClick={onClose}>
      <div className="style-sheet" onClick={e => e.stopPropagation()}>
        <button type="button" className="style-close" onClick={onClose} aria-label="Fechar"><Icon name="x" size={20} /></button>
        <figure className="style-photo">
          <img src={cardImage(card)} alt={`Exemplo de ${card.name}`} width={480} height={600} />
          <figcaption>{AI_PHOTO_NOTE}</figcaption>
        </figure>
        <h2>{card.name}</h2>
        {children}
      </div>
    </div>
  )
}

/** What the client reads: what it is, who it suits, how long it lasts. */
export function ClientFacts({ card }: { card: StyleCard }) {
  return <>
    <p>{card.about}</p>
    <dl className="kv style-kv">
      <dt>Para quem</dt><dd>{card.suits}</dd>
      <dt>Dura</dt><dd>{card.upkeep}</dd>
    </dl>
  </>
}

/** The video, when the salon partner recorded one (unlisted YouTube, no cookies until played). */
export function StyleVideo({ card }: { card: StyleCard }) {
  if (!card.video) return <div className="style-video soon"><Icon name="camera" size={20} /><span>Vídeo em breve, gravado num salão parceiro.</span></div>
  return (
    <div className="style-video">
      <iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(card.video)}?rel=0`} title={`Vídeo: ${card.name}`}
        allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
    </div>
  )
}
