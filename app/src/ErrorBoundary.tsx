import { Component, type ReactNode } from 'react'
import { reportError } from './lib/errorReporting'

/** If a page crashes, show a way back instead of a blank screen, and report it. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: unknown) { reportError(error) }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="page">
        <h1>Esta página deixou de responder</h1>
        <p>O erro foi registado para ser corrigido. Recarregue a página para continuar; os seus dados estão guardados.</p>
        <p><button className="btn" onClick={() => location.reload()}>Recarregar a página</button></p>
        <p><a href="/painel">Ir para a agenda</a></p>
      </main>
    )
  }
}
