import { useState } from 'react'
import Icon from './Icon'
import { photoToDataUrl, runAi, type AiFeature } from '../lib/ai'

/**
 * "Antes e depois" with AI: a photo, a style, and the result side by side.
 * Used by the client on the booking page (try-on) and by the salon on a client's
 * card (before-after). The photo stays in the browser and is sent only to the AI
 * for this one request; nothing is saved.
 */
export default function AiTryOn({ feature, styles, salonId, title, intro }: {
  feature: Extract<AiFeature, 'try-on' | 'before-after'>
  styles: string[]; salonId?: string; title: string; intro: string
}) {
  const [photo, setPhoto] = useState('')
  const [style, setStyle] = useState(styles[0] ?? '')
  const [result, setResult] = useState('')
  const [state, setState] = useState<'' | 'a-gerar' | 'mensagem'>('')
  const [message, setMessage] = useState('')

  async function choose(file: File | undefined) {
    if (!file) return
    setResult(''); setMessage(''); setState('')
    try { setPhoto(await photoToDataUrl(file)) } catch { setMessage('Não foi possível abrir essa foto.'); setState('mensagem') }
  }

  async function generate() {
    setState('a-gerar'); setMessage('')
    const r = await runAi(feature, { image: photo, style }, salonId)
    if (r.status === 'feito' && r.image) { setResult(r.image); setState('') }
    else { setMessage(r.message ?? 'Não foi possível agora.'); setState('mensagem') }
  }

  return (
    <section className="card ai-card">
      <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'nowrap' }}>
        <Icon name="spark" size={20} /><strong>{title}</strong><span className="tag">IA</span>
      </div>
      <p className="muted small" style={{ margin: '6px 0 10px' }}>{intro}</p>
      <label className="btn ghost inline sm" style={{ cursor: 'pointer' }}>
        <Icon name="camera" size={16} />{photo ? 'Trocar foto' : 'Tirar ou escolher foto'}
        <input type="file" accept="image/*" hidden onChange={e => choose(e.target.files?.[0])} />
      </label>
      {photo && <>
        <label>Estilo
          <select value={style} onChange={e => { setStyle(e.target.value); setResult('') }}>
            {styles.map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        <div className="ai-compare">
          <figure><img src={photo} alt="Antes" /><figcaption>Antes</figcaption></figure>
          <figure>{result ? <img src={result} alt={`Depois: ${style}`} /> : <div className="ai-empty">{state === 'a-gerar' ? 'A gerar…' : '?'}</div>}<figcaption>Depois</figcaption></figure>
        </div>
        <button type="button" className="btn" onClick={generate} disabled={state === 'a-gerar' || !style}>{state === 'a-gerar' ? 'A gerar…' : 'Ver o depois'}</button>
      </>}
      {state === 'mensagem' && <p className="muted small" role="status">{message}</p>}
      <p className="muted small" style={{ marginTop: 8 }}>A foto não é guardada. Serve só para esta pré-visualização.</p>
    </section>
  )
}
