import { Link } from 'react-router-dom'
import SaveToHome from '../components/SaveToHome'
import { STORES, platform, useInstall } from '../lib/install'
import { qrPath } from '../lib/qr'

/**
 * cortecerto.pt/app: one link (and QR) to install CorteCerto on any device.
 * With the store apps published (STORES), phones go to their store; until then, and on a
 * computer, it installs the web app, which opens on the panel (manifest start_url /painel).
 */
export default function InstallPage() {
  const inst = useInstall()
  const p = platform()
  const store = p === 'ios' ? STORES.ios : p === 'android' ? STORES.android : ''
  const here = `${location.origin}/app`
  const qr = qrPath(here)

  return (
    <main className="page" style={{ maxWidth: 520 }}>
      <header style={{ textAlign: 'center', marginTop: 24 }}>
        <img src="/icon-192.png" alt="" width={72} height={72} style={{ borderRadius: 16 }} />
        <h1 style={{ margin: '12px 0 4px' }}>CorteCerto</h1>
        <p className="muted" style={{ margin: 0 }}>A app para gerir o salão: agenda, clientes e marcações online.</p>
      </header>

      {inst.installed ? (
        <div className="card soft" style={{ marginTop: 24 }}>
          <strong>A app já está instalada neste aparelho.</strong>
          <p style={{ margin: '8px 0 0' }}><Link to="/painel">Abrir o painel ›</Link></p>
        </div>
      ) : store ? (
        <a className="btn" style={{ marginTop: 24 }} href={store}>{p === 'ios' ? 'Instalar na App Store' : 'Instalar no Google Play'}</a>
      ) : (
        <SaveToHome desktop page="painel" name="a CorteCerto" title={p === 'desktop' ? 'Instalar neste computador' : 'Instalar neste telemóvel'}
          text="Fica com um ícone no ecrã e abre como uma app, sem a barra do browser." />
      )}

      {!inst.installed && p !== 'desktop' && (
        <p className="muted small">Depois de instalar, abra a CorteCerto pelo ícone e entre com o seu email e palavra-passe (só da primeira vez).</p>
      )}

      {p === 'desktop' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <strong>No telemóvel ou no tablet</strong>
          <p className="muted small" style={{ margin: '4px 0 12px' }}>Aponte a câmara para este código e siga o passo que aparece.</p>
          <svg viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} width="180" height="180" role="img" aria-label={`Código QR para ${here}`} style={{ background: '#fff' }} shapeRendering="crispEdges">
            <path d={qr.d} fill="#1d1b18" />
          </svg>
        </div>
      )}

      <p className="muted small" style={{ textAlign: 'center', marginTop: 24 }}>
        É cliente de um salão? Não precisa de instalar nada: marque pelo link do salão.<br />
        <Link to="/">Saber mais sobre a CorteCerto</Link>
      </p>
    </main>
  )
}
