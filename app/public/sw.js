// CorteCerto service worker: opens the app without network and keeps it fast.
// Pages: network first, the cached app as fallback. Built assets (hashed): cache first.
// Supabase, the Worker API and other sites always go to the network.
const VERSION = 'v3'
const CACHE = `cortecerto-${VERSION}`
// '/' is the pre-rendered landing page; every other route is the empty app shell, cached as '/painel'.
const SHELL = ['/painel', '/manifest.webmanifest', '/icon-192.png', '/favicon-32.png']

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
    // Every route but '/' is the same single-page app shell, cached under '/painel'.
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok && url.pathname !== '/') caches.open(CACHE).then(c => c.put('/painel', res.clone()))
        return res
      }).catch(() => caches.match('/painel').then(r => r || Response.error())),
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

// Phone notifications for the salon (worker/push.ts): show them, and open the panel when tapped.
self.addEventListener('push', event => {
  let msg = { title: 'CorteCerto', body: '', url: '/painel', tag: 'marcacao' }
  try { msg = { ...msg, ...event.data.json() } } catch { /* plain or empty */ }
  event.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body, tag: `${msg.tag}-${Date.now()}`, data: { url: msg.url },
    icon: '/icon-192.png', badge: '/favicon-32.png', lang: 'pt-PT',
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/painel'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => new URL(c.url).origin === location.origin)
    if (open) { open.focus(); return open.navigate(url) }
    return self.clients.openWindow(url)
  }))
})
