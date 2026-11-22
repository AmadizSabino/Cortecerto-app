import { useState } from 'react'
import { manualSteps, useInstall } from './lib/install'

const KEY = 'cortecerto-install-hidden'
const hidden = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

/**
 * Install the app on the phone. On the agenda it shows once, until installed or
 * closed ("Agora não"); in Mais it is always there (`always`).
 * The button always does something: the browser's install dialog when it offers
 * one, otherwise the steps for this phone.
 */
export default function InstallCard({ always = false }: { always?: boolean }) {
  const inst = useInstall()
  const [show, setShow] = useState(() => always || !hidden())
  const [steps, setSteps] = useState(false)

  function close() {
    try { localStorage.setItem(KEY, '1') } catch { /* private mode */ }
    setShow(false)
  }

  if (inst.installed) return always ? <p className="muted small">A app já está instalada neste aparelho.</p> : null
  if (!show) return null
  return (
    <section className="card install-card">
      <img src="/icon-192.png" alt="" width={44} height={44} />
      <div>
        <strong>Instale a CorteCerto no telemóvel</strong>
        <p className="muted small">{steps || (inst.platform === 'ios' && !inst.canPrompt)
          ? manualSteps(inst.platform)
          : 'Abre como uma app, sem barra do browser, e fica a um toque.'}</p>
        <div className="actions">
          {!(inst.platform === 'ios' && !inst.canPrompt) && (
            <button className="btn-inline" onClick={async () => {
              const opened = await inst.install()
              if (!opened) setSteps(true)
              else if (!always) close()
            }}>Instalar</button>
          )}
          {!always && <button className="link" onClick={close}>Agora não</button>}
        </div>
      </div>
    </section>
  )
}
