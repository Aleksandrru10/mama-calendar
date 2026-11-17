const CACHE = 'my-schedule-mama-v2';
const ASSETS = ['./', './index.html', './style.css', './app.js', './schedule.js', './profiles.js', './money.js', './pwa.js', './manifest.webmanifest'];
const SCOPE = new URL(self.registration.scope);
const INDEX = new URL('./index.html', SCOPE).href;
const PATHS = new Set(ASSETS.map(asset => new URL(asset, SCOPE).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key === 'my-schedule-v1' || (key.startsWith('my-schedule-mama-') && key !== CACHE)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== SCOPE.origin || !PATHS.has(url.pathname)) return;
  // Network first prevents an old cached HTML file from hiding a published fix.
  // Only static application files are cached; localStorage is never touched.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = event.request.mode === 'navigate' ? INDEX : new URL(url.pathname, SCOPE.origin).href;
    const cached = await cache.match(key);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(event.request, { cache: 'no-cache', signal: controller.signal });
      if (response.ok) await cache.put(key, response.clone());
      return response.ok || !cached ? response : cached;
    } catch (error) {
      if (cached) return cached;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  })());
});
