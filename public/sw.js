// Block 42000 — SmartSend Roofing Crew App v1
// Service Worker for Offline Support
// public/sw.js

const CACHE_NAME = 'smartsend-crew-v1';
const urlsToCache = [
  '/',
  '/crew/today',
  '/offline',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached version or fetch from network
      return response || fetch(event.request).catch(() => {
        // If offline and request is a page, return offline page
        if (event.request.mode === 'navigate') {
          return caches.match('/offline');
        }
      });
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-queued-actions') {
    event.waitUntil(syncQueuedActions());
  }
});

async function syncQueuedActions() {
  // This will be handled by the client-side code
  // Service worker just triggers the sync
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_QUEUED_ACTIONS' });
  });
}































