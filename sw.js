/* ==========================================================================
   FitTrack — Progressive Web App Service Worker
   Offline-first cache for static shell & dynamic network fallback
   ========================================================================== */

const CACHE_NAME = 'fittrack-v3';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './js/app.js',
  './js/icons.js',
  './js/theme.js',
  './js/timers.js',
  './js/ui.js',
  './js/utils.js',
  './js/data/exercises.js',
  './js/data/gemini.js',
  './js/data/metrics.js',
  './js/data/split-templates.js',
  './js/store/config.js',
  './js/store/schema.js',
  './js/store/indexeddb-adapter.js',
  './js/store/localstorage-adapter.js',
  './js/store/repository.js',
  './js/components/rest-timer.js',
  './js/components/barcode-scanner.js',
  './js/components/meal-ai.js',
  './js/components/day-exercise-editor.js',
  './js/views/dashboard.js',
  './js/views/workout.js',
  './js/views/nutrition.js',
  './js/views/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // For external APIs (Open Food Facts, Gemini), bypass cache and use network
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for app shell assets with background revalidation
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Fetch fresh copy in background
        fetch(req).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, response));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(req, responseToCache);
        });
        return response;
      });
    })
  );
});
