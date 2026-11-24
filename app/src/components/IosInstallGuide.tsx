import { iphoneSafari } from '../lib/install'

const ShareIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
)
const AddIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" />
  </svg>
)

const CheckIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)

/**
 * iPhone and iPad: Apple lets no website show an install button, so this shows the three taps,
 * with the icons as they look on the phone and, in iPhone Safari, an arrow to the Share button.
 */
export default function IosInstallGuide({ name, onClose }: { name: string; onClose: () => void }) {
  const safari = iphoneSafari()
  const chrome = /crios/i.test(navigator.userAgent)
  return (
    <div className="ios-guide" role="dialog" aria-modal="true" aria-label="Como guardar no ecrã principal" onClick={onClose}>
      <div className="ios-sheet" onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Guardar {name} no ecrã</h3>
        <ol className="ios-steps">
          <li><span className="ios-ico"><ShareIcon /></span><span>Toque em <b>Partilhar</b>{chrome ? ', ao lado da barra de endereço, em cima' : safari ? ', na barra de baixo (se não a vir, toque em ··· primeiro)' : ''}.</span></li>
          <li><span className="ios-ico"><AddIcon /></span><span>Escolha <b>Adicionar ao ecrã principal</b>. Se não aparecer, deslize a lista para cima.</span></li>
          <li><span className="ios-ico"><CheckIcon /></span><span>Toque em <b>Adicionar</b>, no canto de cima. O ícone fica no ecrã, como uma app.</span></li>
        </ol>
        <button className="btn" onClick={onClose}>Percebi</button>
      </div>
      {safari && <div className="ios-arrow" aria-hidden="true">↓</div>}
    </div>
  )
}
