const CACHE = 'svoi-dengi-account-v7';
const ASSETS = ['./','./index.html','./app.css','./app.js','./model.js','./auth.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./icon-maskable.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('svoi-dengi-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  // Cache only the app shell; sign-in responses and unrelated endpoints stay on the network.
  const relative = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (!['','index.html','app.css','app.js','model.js','auth.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','icon-maskable.png'].includes(relative)) return;
  event.respondWith(caches.match(event.request, {ignoreSearch:true}).then(cached => cached || fetch(event.request)));
});
