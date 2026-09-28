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
  // Navegação (abrir o app / recarregar a página): sempre busca a versão mais nova,
  // ignorando o cache HTTP do navegador — sem isso, o GitHub Pages pode servir uma
  // versão em cache por alguns minutos mesmo depois de um deploy novo.
  if(event.request.mode === 'navigate'){
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request)));
    return;
  }
  // Demais recursos (ícones, etc): passa direto pra rede, sem cache agressivo.
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
