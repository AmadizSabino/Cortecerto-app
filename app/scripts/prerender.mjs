// Writes dist/landing.html: the app shell with the landing page already rendered inside #root,
// plus structured data for search engines. The Worker serves it for "/" (worker/meta.ts).
// dist/index.html stays an empty shell, so other routes (/painel, /s/...) never flash the landing.
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const dist = resolve('dist')
const { render } = await import(pathToFileURL(resolve('dist-ssr/prerender.js')).href)
const shell = readFileSync(resolve(dist, 'index.html'), 'utf8')
if (!shell.includes('<div id="root"></div>')) throw new Error('index.html has no empty #root')

const ld = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'CorteCerto',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, iOS, Android',
  inLanguage: 'pt-PT',
  description: 'Software de marcações online para barbearias, cabeleireiros, unhas e estética em Portugal: agenda online, lembretes por WhatsApp, fila de espera e ferramentas de IA.',
  offers: { '@type': 'Offer', price: '19.90', priceCurrency: 'EUR', description: 'Por mês, mais IVA. 30 dias grátis, sem cartão.' },
  publisher: { '@type': 'Organization', name: 'Amadiz Sabino Consulting, Lda.' },
}
const html = shell
  .replace('<div id="root"></div>', `<div id="root">${render()}</div>`)
  .replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld)}</script></head>`)
writeFileSync(resolve(dist, 'landing.html'), html)
rmSync(resolve('dist-ssr'), { recursive: true, force: true })
console.log(`prerender: dist/landing.html (${Math.round(html.length / 1024)} KB)`)
