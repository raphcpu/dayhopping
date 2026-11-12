// DayHop Service Worker: Web-Push anzeigen, beim Tippen den passenden Tab öffnen,
// und die App-Hülle zwischenspeichern, damit sie auch bei schlechtem Netz startet.
const CACHE = 'dayhop-v1';
const BASE = new URL(self.registration.scope).pathname;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Seiten: erst Netz, sonst die zwischengespeicherte Hülle. Statische Dateien: Cache zuerst.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(BASE, copy));
      return res;
    }).catch(() => caches.match(BASE)));
    return;
  }
  if (/\/_expo\/static\/|\/assets\/|\/icons\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })));
  }
});

self.addEventListener('push', (e) => {
  let msg = { title: 'DayHop', body: '', data: {} };
  try { msg = { ...msg, ...e.data.json() }; } catch { /* leere Mitteilung */ }
  e.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body,
    data: msg.data,
    icon: BASE + 'icons/icon-192.png',
    badge: BASE + 'icons/badge-96.png',
    tag: msg.data && msg.data.type === 'chat' ? 'chat-' + msg.data.roundId : undefined,
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  const tab = d.type === 'expense' ? '/kosten' : d.type === 'report' ? '/dashboard' : d.type === 'status' ? '' : '/chat';
  const target = d.roundId ? BASE + 'round/' + d.roundId + tab : BASE;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('navigate' in w) {
        await w.focus();
        return w.navigate(target);
      }
    }
    return self.clients.openWindow(target);
  })());
});
