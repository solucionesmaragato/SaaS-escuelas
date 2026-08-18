// Minimal service worker required by Chrome's PWA installability criteria.
// Intentionally network-passthrough (no caching) so it cannot break Supabase
// calls, auth, or SSR responses.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
