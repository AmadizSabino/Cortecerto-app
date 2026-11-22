import { useEffect, useState } from 'react'

/**
 * Installing the app on the phone.
 *
 * Chrome fires `beforeinstallprompt` once, early, often before the panel has
 * loaded the salon. The install card used to start listening only when it
 * appeared, so it missed the event and the "Instalar" button never showed or did
 * nothing. This module listens from the moment the app starts (imported first
 * in main.tsx) and keeps the event for whoever needs it.
 */
export interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let saved: InstallEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(f => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); saved = e as InstallEvent; notify() })
  window.addEventListener('appinstalled', () => { saved = null; installed = true; notify() })
}

export const isStandalone = () => typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

export type Platform = 'ios' | 'android' | 'desktop'
export function platform(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): Platform {
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && /mobile/i.test(ua))) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'desktop'
}

/** Steps to install by hand, when the browser doesn't offer the one-tap prompt. */
export function manualSteps(p: Platform, ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  if (p === 'ios') return /crios|fxios|edgios/i.test(ua)
    ? 'No iPhone, abra este link no Safari, toque em Partilhar e depois em "Adicionar ao ecrã principal".'
    : 'Toque em Partilhar (o quadrado com a seta) e depois em "Adicionar ao ecrã principal".'
  if (p === 'android') return /samsungbrowser/i.test(ua)
    ? 'Toque no menu ☰ e depois em "Adicionar página a" > "Ecrã principal".'
    : 'Toque no menu ⋮ do Chrome e depois em "Instalar app" ou "Adicionar ao ecrã principal".'
  return 'No Chrome ou no Edge, clique no ícone de instalar na barra de endereço, ou no menu ⋮ > "Instalar CorteCerto".'
}

/** Install state for a component: whether the one-tap prompt is available, and a function to use it. */
export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force(n => n + 1)
    listeners.add(f)
    return () => { listeners.delete(f) }
  }, [])
  return {
    canPrompt: saved !== null,
    installed: installed || isStandalone(),
    platform: platform(),
    /** Opens the browser's install dialog. Returns false when the browser doesn't offer one (show manualSteps). */
    async install(): Promise<boolean> {
      const e = saved
      if (!e) return false
      saved = null // the event can be used only once
      notify()
      await e.prompt()
      const { outcome } = await e.userChoice
      if (outcome === 'accepted') { installed = true; notify() }
      return true
    },
  }
}
