// CorteCerto service worker: opens the app without network and keeps it fast.
// Pages: network first, the cached app as fallback. Built assets (hashed): cache first.
// Supabase, the Worker API and other sites always go to the network.
const VERSION = 'v1'
const CACHE = `cortecerto-${VERSION}`
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/favicon-32.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('cortecerto-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    // Every route is the same single-page app, cached under '/'.
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put('/', res.clone()))
        return res
      }).catch(() => caches.match('/').then(r => r || Response.error())),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) }
        return res
      })),
    )
    return
  }

  // Icons and the like: serve the cached copy, refresh it in the background.
  event.respondWith(
    caches.match(req).then(hit => {
      const fresh = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) }
        return res
      }).catch(() => hit || Response.error())
      return hit || fresh
    }),
  )
})
