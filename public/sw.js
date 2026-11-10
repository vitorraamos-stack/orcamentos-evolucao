// PWA online-first: guarda somente uma página pública de indisponibilidade.
// Nunca armazena respostas autenticadas, dados do Supabase, APIs, OS ou arquivos.
const CACHE_NAME = "evolusystem-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_URL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.filter(name => name.startsWith("evolusystem-") && name !== CACHE_NAME).map(name => caches.delete(name)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cached = await caches.match(OFFLINE_URL);
    return cached || Response.error();
  }));
});
