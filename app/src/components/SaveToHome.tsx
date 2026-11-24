import { useState } from 'react'
import { inAppBrowser, manualSteps, useInstall } from '../lib/install'
import IosInstallGuide from './IosInstallGuide'
import { track, type TrackPage } from '../lib/track'

/**
 * "Guardar no ecrã": one tap where the browser allows it (Android, computer), and the guided
 * steps on iPhone. Hidden once installed, and on a computer unless `desktop`.
 */
export default function SaveToHome({ name, title, text, desktop, icon = '/icon-192.png', page }: {
  name: string; title: string; text: string; desktop?: boolean; icon?: string; page: TrackPage
}) {
  const inst = useInstall()
  const [guide, setGuide] = useState(false)
  const [steps, setSteps] = useState(false)
  if (inst.installed) return null
  if (inst.platform === 'desktop' && !desktop) return null
  const stuck = inAppBrowser()

  async function tap() {
    if (await inst.install()) { track('instalar', { page }); return }
    if (inst.platform === 'ios') setGuide(true)
    else setSteps(true)
  }

  return (
    <section className="card install-card">
      <img src={icon} alt="" width={44} height={44} />
      <div>
        <strong>{title}</strong>
        <p className="muted small">{stuck
          ? 'Este link abriu dentro de outra app. Toque em ··· e escolha "Abrir no browser" (Safari ou Chrome) para o poder guardar.'
          : steps ? manualSteps(inst.platform) : text}</p>
        {!stuck && !steps && <div className="actions"><button className="btn-inline" onClick={tap}>Guardar no ecrã</button></div>}
      </div>
      {guide && <IosInstallGuide name={name} onClose={() => setGuide(false)} />}
    </section>
  )
}
