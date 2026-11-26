import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import { installErrorReporting } from './lib/errorReporting'
// Listens for the browser's install prompt from the very start (see lib/install.ts).
import './lib/install'
import { captureInvite } from './lib/referral'

installErrorReporting()
// ?convite=<slug>: a salon invited this one (migration 0034). Kept until the salon is created.
captureInvite()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><BrowserRouter><App /></BrowserRouter></ErrorBoundary>
  </StrictMode>,
)

// Installable app and offline shell, in production only (dev reloads must stay fresh).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
