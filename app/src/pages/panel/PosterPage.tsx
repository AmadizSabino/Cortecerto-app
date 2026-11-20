import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import Icon from '../../components/Icon'
import { initials } from '../../lib/supabase'
import { themeById, themeStyle } from '../../lib/themes'
import { usePanel } from './PanelContext'

export default function PosterPage() {
  const { salon } = usePanel()
  const link = `${location.origin}/s/${salon.slug}`
  const [kind, setKind] = useState<'marcar' | 'avaliar'>('marcar')
  const [qr, setQr] = useState('')
  const target = kind === 'avaliar' && salon.google_review_url ? salon.google_review_url : link

  useEffect(() => {
    QRCode.toDataURL(target, { width: 720, margin: 1, errorCorrectionLevel: 'M' }).then(setQr)
  }, [target])

  return (
    <main className="page wide">
      <h1 style={{ marginTop: 8 }}>Poster QR</h1>
      <p className="muted" style={{ marginTop: 4 }}>Imprima e cole ao espelho ou à porta. Os clientes apontam a câmara e marcam.</p>
      <div className="seg section">
        <button className={kind === 'marcar' ? 'on' : ''} onClick={() => setKind('marcar')}>Marcações</button>
        <button className={kind === 'avaliar' ? 'on' : ''} onClick={() => setKind('avaliar')}>Avaliações Google</button>
      </div>
      {kind === 'avaliar' && !salon.google_review_url && (
        <p className="muted small" style={{ marginTop: 8 }}>Adicione o link de avaliações Google nas Definições para usar este poster. Por agora, o QR abre a página de marcações.</p>
      )}

      <div className="section">
        <div className="poster" style={themeStyle(themeById(salon.theme))}>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
            <span className="avatar" style={{ width: 64, height: 64, fontSize: '1.5rem' }}>{initials(salon.name)}</span>
            <h1>{salon.name}</h1>
          </div>
          <div className="qr">{qr && <img src={qr} alt={`QR code para ${target}`} />}</div>
          <div>
            <h2 style={{ margin: 0 }}>{kind === 'avaliar' && salon.google_review_url ? 'Gostou? Deixe a sua avaliação' : 'Marque a sua visita'}</h2>
            <p className="muted" style={{ marginTop: 6 }}>{kind === 'avaliar' && salon.google_review_url ? 'Aponte a câmara do telemóvel' : 'Aponte a câmara · sem apps, em 30 segundos'}</p>
            <p className="small" style={{ marginTop: 10, color: 'var(--accent)', fontWeight: 600 }}>{link.replace(/^https?:\/\//, '')}</p>
          </div>
        </div>
      </div>

      <div className="stack section">
        <button className="btn primary block" onClick={() => window.print()}><Icon name="print" size={18} />Imprimir poster (A4)</button>
        {qr && <a className="btn block" href={qr} download={`qr-${salon.slug}.png`}><Icon name="qr" size={18} />Descarregar só o QR</a>}
        <button className="btn block" onClick={() => navigator.clipboard?.writeText(link)}><Icon name="copy" size={18} />Copiar link para o Instagram</button>
      </div>
    </main>
  )
}
