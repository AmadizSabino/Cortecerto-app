/**
 * Build-time render of the landing page (scripts/prerender.mjs), so Google and link previews
 * read the page's text without running JavaScript. The browser then renders the app as usual.
 */
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import LandingPage from './pages/LandingPage'

export function render(): string {
  return renderToString(<StaticRouter location="/"><LandingPage /></StaticRouter>)
}
