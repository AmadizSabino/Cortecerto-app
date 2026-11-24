import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { photoToDataUrl, runAi, type AiFeature } from '../lib/ai'

/**
 * "Antes e depois" with AI: a photo, a style, and the result side by side.
 * Used by the client on the booking page (try-on) and by the salon on a client's
 * card (before-after). The photo stays in the browser and is sent only to the AI
 * for this one request; nothing is saved.
 */
export default function AiTryOn({ feature, styles, salonId, title, intro, initialStyle }: {
  feature: Extract<AiFeature, 'try-on' | 'before-after'>
  styles: string[]; salonId?: string; title: string; intro: string
  /** The style to start on, e.g. the booking's service. */
  initialStyle?: string
}) {
  const [photo, setPhoto] = useState('')
  const [style, setStyle] = useState(initialStyle && styles.includes(initialStyle) ? initialStyle : styles[0] ?? '')
  const [other, setOther] = useState(false)
  const [result, setResult] = useState('')
  const [state, setState] = useState<'' | 'a-gerar' | 'mensagem'>('')
  const [message, setMessage] = useState('')
  const [camera, setCamera] = useState(false)

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
      {camera
        ? <Camera onShot={shot => { setCamera(false); setResult(''); setMessage(''); setState(''); setPhoto(shot) }}
            onFail={() => { setCamera(false); setMessage('Não foi possível abrir a câmara. Pode escolher uma foto do seu computador.'); setState('mensagem') }}
            onCancel={() => setCamera(false)} />
        : <div className="actions">
            {hasCamera() && <button type="button" className="btn ghost inline sm" onClick={() => setCamera(true)}><Icon name="camera" size={16} />{photo ? 'Tirar outra foto' : 'Tirar foto'}</button>}
            <label className="btn ghost inline sm" style={{ cursor: 'pointer' }}>
              <Icon name="image" size={16} />{photo ? 'Escolher outra' : 'Escolher foto'}
              <input type="file" accept="image/*" hidden onChange={e => choose(e.target.files?.[0])} />
            </label>
          </div>}
      {photo && !camera && <>
        <label>Estilo
          <select value={other ? OTHER : style} onChange={e => { const v = e.target.value; setResult(''); if (v === OTHER) { setOther(true); setStyle('') } else { setOther(false); setStyle(v) } }}>
            {styles.map(s => <option key={s}>{s}</option>)}
            <option value={OTHER}>Outro (escrever)…</option>
          </select>
        </label>
        {other && <label>Descreva o estilo
          <input value={style} maxLength={80} placeholder="Ex.: fade baixo com franja curta" onChange={e => { setStyle(e.target.value); setResult('') }} />
        </label>}
        <div className="ai-compare">
          <figure><img src={photo} alt="Antes" /><figcaption>Antes</figcaption></figure>
          <figure>{result ? <img src={result} alt={`Depois: ${style}`} /> : <div className="ai-empty">{state === 'a-gerar' ? 'A gerar…' : '?'}</div>}<figcaption>Depois</figcaption></figure>
        </div>
        <button type="button" className="btn" onClick={generate} disabled={state === 'a-gerar' || !style.trim()}>{state === 'a-gerar' ? 'A gerar…' : 'Ver o depois'}</button>
      </>}
      {state === 'mensagem' && <p className="muted small" role="status">{message}</p>}
      <p className="muted small" style={{ marginTop: 8 }}>A foto não é guardada. Serve só para esta pré-visualização.</p>
    </section>
  )
}

const OTHER = '__outro__'
const hasCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

/** Takes the photo with the device's camera (the laptop's webcam, or the phone's front camera). */
function Camera({ onShot, onFail, onCancel }: { onShot: (dataUrl: string) => void; onFail: () => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const fail = useRef(onFail)
  fail.current = onFail

  useEffect(() => {
    let off = false
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then(s => {
        if (off) { s.getTracks().forEach(t => t.stop()); return }
        stream.current = s
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}) }
      })
      .catch(() => { if (!off) fail.current() })
    return () => { off = true; stream.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  function shoot() {
    const v = video.current
    if (!v || !v.videoWidth) return
    const k = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k)
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
    onShot(c.toDataURL('image/jpeg', 0.85))
  }

  return (
    <div className="ai-camera">
      <video ref={video} playsInline muted onLoadedData={() => setReady(true)} aria-label="Imagem da câmara" />
      <div className="actions">
        <button type="button" className="btn inline sm" onClick={shoot} disabled={!ready}><Icon name="camera" size={16} />{ready ? 'Tirar a foto' : 'A abrir a câmara…'}</button>
        <button type="button" className="btn ghost inline sm" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}
