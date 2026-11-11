// PWA online-first: guarda somente uma página pública de indisponibilidade.
// Nunca armazena respostas autenticadas, dados do Supabase, APIs, OS ou arquivos.
const CACHE_NAME = "evolusystem-offline-v2-__EVOLUSYSTEM_BUILD_ID__";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll([OFFLINE_URL, "/evolusystem-icon.svg"])) 
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

/* A atualização é aplicada somente após a confirmação do usuário no aplicativo. */
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});


/*
 * Preparação para Web Push V4. Não ativa inscrições ou envio por conta própria:
 * estes exigirão backend autenticado, VAPID e armazenamento autorizado.
 * O payload não pode definir URL arbitrária nem texto confidencial.
 */
const PUSH_NOTICE_KINDS = {
  assignment: { text: "Você recebeu uma nova responsabilidade.", destination: "order" },
  art_inbox: { text: "Uma nova OS entrou no setor de Arte.", destination: "art" },
  production_released: { text: "Uma OS foi liberada para Produção.", destination: "production" },
  installation_scheduled: { text: "Uma instalação foi agendada.", destination: "installations" },
  installation_rescheduled: { text: "Uma instalação teve o agendamento alterado.", destination: "installations" },
};
const SAFE_ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function destinationForPush(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const definition = Object.prototype.hasOwnProperty.call(PUSH_NOTICE_KINDS, payload.kind)
    ? PUSH_NOTICE_KINDS[payload.kind]
    : null;
  if (!definition) return null;
  const id = typeof payload.orderId === "string" ? payload.orderId : "";
  if (!SAFE_ORDER_ID.test(id)) return null;
  const path = definition.destination === "order" ? "/os/" + id :
    definition.destination === "art" ? "/os/arte" :
    definition.destination === "production" ? "/os/producao" :
    "/instalacoes";
  return { path, text: definition.text, tag: "evolusystem-" + payload.kind + "-" + id };
}

self.addEventListener("push", event => {
  let payload = null;
  try { payload = event.data?.json(); } catch { /* Ignora mensagem malformada. */ }
  const resolved = destinationForPush(payload);
  if (!resolved) return;
  event.waitUntil(
    self.registration.showNotification("EvoluSystem", {
      body: resolved.text,
      icon: "/evolusystem-icon.svg",
      badge: "/evolusystem-icon.svg",
      tag: resolved.tag,
      data: { path: resolved.path },
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const path = event.notification.data?.path;
  const safePath = typeof path === "string" && (
    /^\/os\/[0-9a-f-]{36}$/i.test(path) && SAFE_ORDER_ID.test(path.slice(4)) ||
    path === "/os/arte" ||
    path === "/os/producao" ||
    path === "/instalacoes"
  ) ? path : "/";
  const target = new URL(safePath, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const current = windows.find(client => {
      try { return new URL(client.url).origin === self.location.origin; }
      catch { return false; }
    });
    if (current) {
      if (typeof current.navigate === "function") {
        const redirected = await current.navigate(target);
        if (redirected && typeof redirected.focus === "function") return redirected.focus();
      }
      return current.focus();
    }
    return self.clients.openWindow(target);
  })());
});
