/** Sends errors from this browser to the Worker (/api/errors). No client data: message, stack, page path. */

const MAX_PER_PAGE = 10
const seen = new Set<string>()

export function reportError(error: unknown) {
  if (!import.meta.env.PROD) return
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error))
  const message = (e.message || 'Erro sem mensagem').slice(0, 500)
  if (seen.has(message) || seen.size >= MAX_PER_PAGE) return
  seen.add(message)
  const release = typeof __RELEASE__ === 'string' ? __RELEASE__ : 'dev'
  fetch('/api/errors', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ message, stack: e.stack?.slice(0, 4000), path: location.pathname, release }),
  }).catch(() => {})
}

/** Uncaught errors and rejected promises anywhere on the page. */
export function installErrorReporting() {
  window.addEventListener('error', ev => reportError(ev.error ?? ev.message))
  window.addEventListener('unhandledrejection', ev => reportError(ev.reason))
}
