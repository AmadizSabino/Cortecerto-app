import { supabase } from './supabase'

/**
 * Phone notifications for the salon (Web Push, worker/push.ts and migration 0029).
 * Free: they go through the phone's own push service. On iPhone they need iOS 16.4 or later
 * and the app added to the home screen; on Android and computers they work in the browser too.
 */

export type PushState = 'ligado' | 'desligado' | 'bloqueado' | 'instalar' | 'sem-suporte'

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** iPhone and iPad only allow notifications to apps added to the home screen. */
export function needsInstall(ua = navigator.userAgent, standalone = window.matchMedia?.('(display-mode: standalone)').matches): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return ios && !standalone && !(navigator as Navigator & { standalone?: boolean }).standalone
}

export async function pushState(): Promise<PushState> {
  if (needsInstall() && !supported()) return 'instalar'
  if (!supported()) return needsInstall() ? 'instalar' : 'sem-suporte'
  if (Notification.permission === 'denied') return 'bloqueado'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'ligado' : 'desligado'
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const t = b64.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '='.repeat((4 - t.length % 4) % 4))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Asks permission, subscribes this device and saves it for the salon. Returns the new state, or an error text. */
export async function turnOn(): Promise<PushState | string> {
  if (!supported()) return needsInstall() ? 'instalar' : 'sem-suporte'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'bloqueado' : 'desligado'
  try {
    const res = await fetch('/api/push/key')
    if (!res.ok) return 'Os avisos ainda não estão disponíveis. Tente mais tarde.'
    const { key } = await res.json() as { key: string }
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) })
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
    const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth })
    if (error) { await sub.unsubscribe(); return 'Não foi possível guardar. Tente de novo.' }
    return 'ligado'
  } catch {
    return 'Não foi possível ligar os avisos neste aparelho.'
  }
}

export async function turnOff(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
    await sub.unsubscribe()
  }
  return 'desligado'
}

/** After a booking made in the panel: tells the rest of the salon. Best effort. */
export async function announceBooking(bookingId: string): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return
  fetch('/api/push/booking', {
    method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: bookingId }),
  }).catch(() => {})
}
