/* Service worker: makes the app installable on the home screen. It caches nothing -
   never /api or /oauth2 - so every page load sees the current plan. Push notifications
   join in a later step. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
