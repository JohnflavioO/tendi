/*
 * Service worker do TendiDesk (app instalável).
 * - Páginas: sempre da rede (dados de atendimento nunca ficam guardados no aparelho).
 *   Sem internet, mostra a tela /offline.html.
 * - Arquivos fixos (JS/CSS do build, fontes, logos, ícones): guardados para abrir mais rápido.
 * - API, login e serviços externos (Supabase, WhatsApp) passam direto, sem cache.
 */
const VERSION = 'tendidesk-v1';
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
