"use strict";
const CACHE_NAME="ballonflugbuch-v10-cache-1";
const APP_FILES=["./","./index.html","./manifest.webmanifest","./icon-180.png","./icon-192.png","./icon-512.png"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_FILES)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;let url=new URL(event.request.url);if(url.origin!==location.origin)return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(resp=>{if(resp&&resp.status===200){let copy=resp.clone();caches.open(CACHE_NAME).then(c=>c.put(event.request,copy))}return resp}).catch(()=>event.request.mode==="navigate"?caches.match("./index.html"):new Response("Offline nicht verfügbar.",{status:503}))))});
