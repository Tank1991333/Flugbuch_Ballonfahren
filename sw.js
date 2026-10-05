"use strict";
const V = "bfb-v11", SHELL = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "favicon.svg"];
self.addEventListener("install", e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || !(u.origin === location.origin || u.hostname === "unpkg.com")) return;
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request).then(r => {
      if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); }
      return r;
    }).catch(() => hit);
    return hit || net;
  }));
});
