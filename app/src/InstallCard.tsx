import { useEffect, useState } from 'react'

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const KEY = 'cortecerto-install-hidden'
const hidden = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** On the panel: suggest adding the app to the home screen, once, until installed or closed. */
export default function InstallCard() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [show, setShow] = useState(() => !hidden() && !standalone())
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent) }
    const onInstalled = () => setShow(false)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  function close() {
    try { localStorage.setItem(KEY, '1') } catch { /* private mode */ }
    setShow(false)
  }

  if (!show || (!event && !ios)) return null
  return (
    <section className="card install-card">
      <img src="/icon-192.png" alt="" width={44} height={44} />
      <div>
        <strong>Instale a CorteCerto no telemóvel</strong>
        <p className="muted small">{ios
          ? 'No Safari, toque em Partilhar e depois em "Adicionar ao ecrã principal".'
          : 'Abre como uma app, sem barra do browser, e fica a um toque.'}</p>
        <div className="actions">
          {event && <button className="btn-inline" onClick={async () => { await event.prompt(); setEvent(null); close() }}>Instalar</button>}
          <button className="link" onClick={close}>Agora não</button>
        </div>
      </div>
    </section>
  )
}
