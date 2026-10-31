"use strict";
const V = "bfb-v56", SHELL = ["./", "index.html", "style.css", "app.js", "trajektoren.js", "geo.js", "firebase-config.js", "sync.js", "manifest.webmanifest", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "verfolgen.html", "verfolgen.js", "datenschutz.html",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css", "vendor/leaflet/images/layers.png", "vendor/leaflet/images/layers-2x.png", "vendor/leaflet/images/marker-icon.png", "vendor/leaflet/images/marker-icon-2x.png", "vendor/leaflet/images/marker-shadow.png",
  "fonts/barlow-latin-400-normal.woff2", "fonts/barlow-latin-500-normal.woff2", "fonts/barlow-latin-600-normal.woff2", "fonts/barlow-semi-condensed-latin-600-normal.woff2", "fonts/barlow-semi-condensed-latin-700-normal.woff2"];
self.addEventListener("install", e => e.waitUntil(caches.open(V).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || !(u.origin === location.origin || u.hostname === "www.gstatic.com")) return;
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request).then(r => {
      if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); }
      return r;
    }).catch(() => hit);
    return hit || net;
  }));
});
