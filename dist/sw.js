const CACHE='svoi-dengi-account-v31';
const ASSETS=['/','/sb','/finance','/zkh','/index.html','/app.css','/app.js','/portal.js','/zkh.js','/zkh.css','/finance.js','/finance-tables.js','/finance-import.js','/finance-bank-header.js','/finance-ledgers.js','/finance.css','/model.js','/auth.js','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png','/icon-maskable.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('svoi-dengi-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!ASSETS.includes(u.pathname))return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(c=>c||fetch(e.request)));});

