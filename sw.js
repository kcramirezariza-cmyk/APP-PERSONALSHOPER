/* ARMADIUSA · Service Worker (PWA)
   Estrategia: "network-first" para el contenido propio (siempre lo más nuevo
   cuando hay internet) con respaldo en caché para funcionar sin conexión.
   Firebase / CDNs pasan directo a la red. */
const CACHE = "armadiusa-v2";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./logo.svg",
  "./firebase-config.js", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // Firebase/CDN → red directa
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
  );
});
