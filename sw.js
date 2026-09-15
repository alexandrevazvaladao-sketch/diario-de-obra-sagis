// Service Worker mínimo do Diário de Obra — SAGIS
// Só existe pra permitir que o navegador ofereça "Instalar app".
// Não faz cache agressivo pra sempre pegar a versão mais nova do site.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Passa direto pra rede (sem cache), garantindo que o app sempre carregue a versão atual.
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
