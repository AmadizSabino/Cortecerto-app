import type { Theme } from './themes'

/**
 * The picture for a promotion's post, drawn in the browser in the salon's colours,
 * with its logo and a photo: 1080 × 1350 (Instagram portrait, also fine for
 * WhatsApp Status and Facebook).
 */
const W = 1080, H = 1350
const FONT: Record<Theme['font'], string> = {
  serif: "'Playfair Display', Georgia, serif",
  bold: "'Bebas Neue', Impact, sans-serif",
  sans: "'Bricolage Grotesque', system-ui, sans-serif",
}

function load(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // public storage allows it, so the canvas can still be saved
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Lines of `text` that fit `max` pixels wide, at most `lines` of them. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w
    if (ctx.measureText(t).width > max && line) { out.push(line); line = w } else line = t
    if (out.length === lines) break
  }
  if (out.length < lines && line) out.push(line)
  return out
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const k = Math.max(w / img.width, h / img.height)
  const sw = w / k, sh = h / k
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

export async function promoImage(o: {
  theme: Theme; salonName: string; title: string; offer: string; when: string; link: string
  photo: string | null; logo: string | null
}): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  const [photo, logo] = await Promise.all([load(o.photo), load(o.logo)])
  const font = FONT[o.theme.font]

  ctx.fillStyle = o.theme.bg
  ctx.fillRect(0, 0, W, H)
  const photoH = photo ? 700 : 0
  if (photo) {
    cover(ctx, photo, 0, 0, W, photoH)
    const g = ctx.createLinearGradient(0, photoH - 220, 0, photoH)
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, o.theme.bg)
    ctx.fillStyle = g; ctx.fillRect(0, photoH - 220, W, 220)
  }

  // Logo, or the salon's name, at the top left.
  if (logo) {
    const s = 150, k = Math.min(s / logo.width, s / logo.height)
    ctx.fillStyle = o.theme.surface
    ctx.beginPath(); ctx.roundRect(56, 56, s + 24, s + 24, 28); ctx.fill()
    ctx.drawImage(logo, 68 + (s - logo.width * k) / 2, 68 + (s - logo.height * k) / 2, logo.width * k, logo.height * k)
  }

  let y = photo ? photoH - 40 : 330
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = o.theme.ink
  ctx.font = `600 40px ${FONT.sans}`
  ctx.fillText(o.salonName.toUpperCase(), 72, y); y += 30

  // The offer, big, in the accent colour.
  ctx.fillStyle = o.theme.accent
  ctx.font = `700 ${o.offer.length > 10 ? 120 : 190}px ${font}`
  for (const l of wrap(ctx, o.offer, W - 144, 2)) { y += o.offer.length > 10 ? 130 : 190; ctx.fillText(l, 72, y) }

  ctx.fillStyle = o.theme.ink
  ctx.font = `600 64px ${font}`
  for (const l of wrap(ctx, o.title, W - 144, 2)) { y += 80; ctx.fillText(l, 72, y) }

  ctx.fillStyle = o.theme.muted
  ctx.font = `400 42px ${FONT.sans}`
  for (const l of wrap(ctx, o.when, W - 144, 2)) { y += 60; ctx.fillText(l, 72, y) }

  // The booking link on a band at the bottom.
  ctx.fillStyle = o.theme.accent
  ctx.fillRect(0, H - 150, W, 150)
  ctx.fillStyle = o.theme.accentInk
  ctx.font = `700 44px ${FONT.sans}`
  ctx.fillText('Marque online', 72, H - 86)
  ctx.font = `400 34px ${FONT.sans}`
  ctx.fillText(o.link.replace(/^https?:\/\//, '').replace(/\?.*$/, ''), 72, H - 40)

  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('imagem')), 'image/jpeg', 0.9))
}

/** Shares the picture and caption (phone share sheet: Instagram, WhatsApp, Facebook…), or downloads it. */
export async function sharePost(blob: Blob, caption: string, name: string): Promise<'partilhado' | 'descarregado' | 'cancelado'> {
  const file = new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], text: caption }); return 'partilhado' } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado'
      // other failures fall back to a download
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = file.name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return 'descarregado'
}
