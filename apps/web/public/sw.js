/*
 * Service worker do TendiDesk (app instalável).
 * - Páginas: sempre da rede (dados de atendimento nunca ficam guardados no aparelho).
 *   Sem internet, mostra a tela /offline.html.
 * - Arquivos fixos (JS/CSS do build, fontes, logos, ícones): guardados para abrir mais rápido.
 * - API, login e serviços externos (Supabase, WhatsApp) passam direto, sem cache.
 */
const VERSION = 'tendidesk-v2';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/brand/tendidesk-logo.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => !key.startsWith(VERSION)).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const isStaticAsset = url =>
  url.pathname.startsWith('/_next/static/') ||
  url.pathname.startsWith('/brand/') ||
  url.pathname.startsWith('/icons/') ||
  /\.(?:woff2?|png|svg|jpg|jpeg|webp|ico)$/.test(url.pathname);

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});


/*
 * Web Push (including iOS Home Screen web apps).
 * The backend will send an authenticated push payload after device enrollment.
 * Never cache notification payloads or display arbitrary external destinations.
 */
function notificationPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/inbox';
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : '/inbox';
  } catch {
    return '/inbox';
  }
}

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  if (!payload || typeof payload !== 'object') payload = {};
  // FCM HTTP v1 data messages may arrive as { data: {...} } rather than at the root.
  const details = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const title = typeof details.title === 'string' ? details.title.slice(0, 120) : 'TendiDesk';
  const body = typeof details.body === 'string' ? details.body.slice(0, 240) : 'Você tem um novo lembrete.';
  const path = notificationPath(details.path);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: typeof details.tag === 'string' ? details.tag.slice(0, 100) : undefined,
    data: { path },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = notificationPath(event.notification.data && event.notification.data.path);
  const target = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  })());
});
