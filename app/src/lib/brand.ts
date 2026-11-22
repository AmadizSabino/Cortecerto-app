import { supabase } from './supabase'

/**
 * The salon's own brand (migration 0019): logo, cover photo, a short text and a
 * gallery of work. Files go to the public bucket "salon-media", in the salon's folder.
 */
export const BUCKET = 'salon-media'
export const MAX_PHOTOS = 24

const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
/** Public address of a stored file, or null. */
export const mediaUrl = (path: string | null | undefined) => path ? `${base}/storage/v1/object/public/${BUCKET}/${path}` : null

export type MediaKind = 'logo' | 'capa' | 'galeria'
const SIZE: Record<MediaKind, number> = { logo: 512, capa: 1600, galeria: 1280 }

/** Shrinks a photo in the browser: logos stay PNG (keeps transparency), photos become JPEG. */
export function shrink(file: File, kind: MediaKind): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, SIZE[kind] / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      const png = kind === 'logo'
      c.toBlob(b => b ? resolve(b) : reject(new Error('imagem')), png ? 'image/png' : 'image/jpeg', png ? undefined : 0.85)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem')) }
    img.src = url
  })
}

/** Uploads a photo to the salon's folder and returns its path. */
export async function uploadMedia(salonId: string, file: File, kind: MediaKind): Promise<string> {
  const blob = await shrink(file, kind)
  const ext = blob.type === 'image/png' ? 'png' : 'jpg'
  const path = `${salonId}/${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })
  if (error) throw error
  return path
}

/** Removes files no longer used (best effort: a leftover file only takes space). */
export async function removeMedia(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => Boolean(p))
  if (list.length) await supabase.storage.from(BUCKET).remove(list)
}

export interface Photo { id: string; path: string; caption: string | null; position: number; package_id?: string | null }
