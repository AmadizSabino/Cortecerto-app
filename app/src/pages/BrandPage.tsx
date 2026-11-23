import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import Icon from '../components/Icon'
import { supabase, type Salon } from '../lib/supabase'
import { loadMySalon, type Role } from '../lib/mySalon'
import { can } from '../lib/access'
import { MAX_PHOTOS, mediaUrl, removeMedia, uploadMedia, type MediaKind, type Photo } from '../lib/brand'
import { themeById, themeStyle } from '../lib/themes'
import HelpLink from '../HelpLink'

/** One image slot (logo or cover): shows it, replaces it, removes it. */
function ImagePick({ label, hint, path, kind, busy, onPick, onRemove }: {
  label: string; hint: string; path: string | null; kind: MediaKind; busy: boolean
  onPick: (f: File) => void; onRemove: () => void
}) {
  const url = mediaUrl(path)
  return (
    <div className="card">
      <strong>{label}</strong>
      <p className="muted small" style={{ margin: '2px 0 8px' }}>{hint}</p>
      {url && <img src={url} alt="" className={kind === 'logo' ? 'brand-preview logo' : 'brand-preview cover'} />}
      <div className="actions">
        <label className="btn ghost inline sm" style={{ cursor: 'pointer' }}>
          <Icon name="camera" size={16} />{busy ? 'A enviar…' : url ? 'Trocar' : 'Escolher imagem'}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }} />
        </label>
        {url && <button className="link danger-link" onClick={onRemove}>Remover</button>}
      </div>
    </div>
  )
}

/**
 * Mais > Marca e galeria (migration 0019): logo, cover photo, a short text and
 * photos of the salon's work. They show on the booking page, the offer and booking
 * pages, and the QR poster, on top of the theme the salon chose.
 */
export default function BrandPage() {
  const [session, setSession] = useState<Session | null>()
  const [salon, setSalon] = useState<Salon | null>()
  const [role, setRole] = useState<Role>('dono')
  const [logo, setLogo] = useState<string | null>(null)
  const [cover, setCover] = useState<string | null>(null)
  const [about, setAbout] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [busy, setBusy] = useState<MediaKind | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [missing, setMissing] = useState(false)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  useEffect(() => {
    if (!session) return
    loadMySalon(session.user.id).then(r => {
      setRole(r.role); setSalon(r.salon)
      if (r.salon) { setLogo(r.salon.logo_path ?? null); setCover(r.salon.cover_path ?? null); setAbout(r.salon.about ?? '') }
    })
  }, [session])
  const loadPhotos = useCallback(async () => {
    if (!salon) return
    const { data, error } = await supabase.from('salon_photos').select('id,path,caption,position').eq('salon_id', salon.id).order('position').order('created_at')
    setMissing(Boolean(error)); setPhotos((data ?? []) as Photo[])
  }, [salon])
  useEffect(() => { loadPhotos() }, [loadPhotos])

  if (session === undefined) return <main className="page">A carregar…</main>
  if (!session) return <Navigate to="/painel" replace />
  if (salon === undefined) return <main className="page">A carregar…</main>
  if (salon === null) return <Navigate to="/registar" replace />
  if (!can(role, 'equipa')) return <Navigate to="/painel" replace />

  /** Saves logo, cover and text together (set_salon_brand). */
  async function save(next: { logo?: string | null; cover?: string | null; about?: string }) {
    const v = { logo: next.logo !== undefined ? next.logo : logo, cover: next.cover !== undefined ? next.cover : cover, about: next.about ?? about }
    const { error } = await supabase.rpc('set_salon_brand', { p_salon: salon!.id, p_logo: v.logo, p_cover: v.cover, p_about: v.about })
    if (error) { setMsg({ ok: false, text: error.message.includes('set_salon_brand') ? 'Para usar a marca, corra supabase/migrations/0019_free_slots_branding.sql no Supabase.' : 'Não foi possível guardar.' }); return false }
    setLogo(v.logo); setCover(v.cover); setMsg({ ok: true, text: 'Guardado ✓' })
    return true
  }

  async function pick(kind: 'logo' | 'capa', file: File) {
    setBusy(kind); setMsg(undefined)
    try {
      const path = await uploadMedia(salon!.id, file, kind)
      const old = kind === 'logo' ? logo : cover
      if (await save(kind === 'logo' ? { logo: path } : { cover: path })) removeMedia([old])
      else removeMedia([path])
    } catch { setMsg({ ok: false, text: 'Não foi possível enviar a imagem. Use JPG ou PNG.' }) }
    setBusy(null)
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    setBusy('galeria'); setMsg(undefined)
    let pos = photos.length
    for (const f of Array.from(files).slice(0, MAX_PHOTOS - photos.length)) {
      try {
        const path = await uploadMedia(salon!.id, f, 'galeria')
        const { error } = await supabase.from('salon_photos').insert({ salon_id: salon!.id, path, position: pos++ })
        if (error) { removeMedia([path]); setMsg({ ok: false, text: error.message.includes('limite_fotos') ? `Máximo de ${MAX_PHOTOS} fotos.` : 'Não foi possível juntar a foto.' }); break }
      } catch { setMsg({ ok: false, text: 'Não foi possível enviar uma das fotos.' }); break }
    }
    await loadPhotos(); setBusy(null)
  }

  async function removePhoto(p: Photo) {
    const { error } = await supabase.from('salon_photos').delete().eq('id', p.id)
    if (!error) { removeMedia([p.path]); setPhotos(ps => ps.filter(x => x.id !== p.id)) }
  }
  async function caption(p: Photo, text: string) {
    await supabase.from('salon_photos').update({ caption: text.trim() || null }).eq('id', p.id)
  }
  async function moveFirst(p: Photo) {
    const order = [p, ...photos.filter(x => x.id !== p.id)]
    setPhotos(order)
    await Promise.all(order.map((x, i) => supabase.from('salon_photos').update({ position: i }).eq('id', x.id)))
  }

  return (
    <div className="themed" style={themeStyle(themeById(salon.theme))}><main className="page">
      <header className="row"><h1>Marca e galeria<HelpLink /></h1><Link to="/mais">‹ Mais</Link></header>
      <p className="muted">O seu logótipo, uma foto de capa, um texto curto e fotos do seu trabalho. Aparecem na página de marcação, por cima do estilo que escolheu, e no poster com QR. <a href={`/s/${salon.slug}`} target="_blank" rel="noreferrer">Ver a página</a></p>
      {missing && <p className="banner small">Para usar a marca, corra <code>supabase/migrations/0019_free_slots_branding.sql</code> no editor SQL do Supabase.</p>}
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}

      <ImagePick label="Logótipo" hint="Quadrado ou redondo fica melhor. PNG com fundo transparente, se tiver." path={logo} kind="logo" busy={busy === 'logo'}
        onPick={f => pick('logo', f)} onRemove={async () => { const old = logo; if (await save({ logo: null })) removeMedia([old]) }} />
      <ImagePick label="Foto de capa" hint="Aparece no topo da página. Uma foto do espaço ou de um trabalho, na horizontal." path={cover} kind="capa" busy={busy === 'capa'}
        onPick={f => pick('capa', f)} onRemove={async () => { const old = cover; if (await save({ cover: null })) removeMedia([old]) }} />

      <form className="card" onSubmit={e => { e.preventDefault(); save({ about }) }}>
        <strong>Sobre o salão</strong>
        <textarea rows={4} maxLength={600} value={about} placeholder="Ex.: Barbearia de bairro desde 1998. Cortes clássicos e degradés, sempre com café." onChange={e => setAbout(e.target.value)} />
        <div className="row"><small className="muted">{about.length}/600</small><button>Guardar texto</button></div>
      </form>

      <h2>Galeria de trabalhos</h2>
      <p className="muted small">As fotos ajudam quem não o conhece a marcar. A primeira aparece primeiro. Peça autorização ao cliente antes de publicar a foto dele.</p>
      <div className="gallery-grid">
        {photos.map((p, i) => (
          <figure key={p.id} className="card">
            <img src={mediaUrl(p.path)!} alt={p.caption ?? ''} />
            <input aria-label="Legenda" placeholder="Legenda (opcional)" defaultValue={p.caption ?? ''} maxLength={120} onBlur={e => caption(p, e.target.value)} />
            <div className="row">
              {i > 0 ? <button className="link" onClick={() => moveFirst(p)}>Pôr primeiro</button> : <small className="muted">Primeira</small>}
              <button className="link danger-link" onClick={() => removePhoto(p)}>Apagar</button>
            </div>
          </figure>
        ))}
      </div>
      {photos.length < MAX_PHOTOS && !missing && (
        <label className="btn ghost" style={{ cursor: 'pointer' }}>
          <Icon name="plus" size={18} />{busy === 'galeria' ? 'A enviar…' : 'Juntar fotos'}
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden disabled={busy === 'galeria'} onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
        </label>
      )}
      <p className="muted small">{photos.length}/{MAX_PHOTOS} fotos. As imagens são reduzidas no telemóvel antes de serem enviadas.</p>
    </main></div>
  )
}
