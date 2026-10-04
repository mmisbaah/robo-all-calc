/* Service worker: cache-first app shell with background refresh. */
const CACHE_NAME = 'calculator-v31';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=31',
  './js/calculator.js?v=31',
  './js/app.js?v=31',
  './js/grapher.js?v=31',
  './js/grapher-ui.js?v=31',
  './js/grapher-math.js?v=31',
  './js/units.js?v=31',
  './js/currency.js?v=31',
  './js/currency-names.js?v=31',
  './js/i18n.js?v=31',
  './js/symbolic.js?v=31',
  './js/cas-solve.js?v=31',
  './js/cas-worker.js?v=31',
  './vendor/nerdamer.js?v=31',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

/**
 * Cache each asset independently.
 *
 * `cache.addAll` is all-or-nothing: a single failed request rejects the whole
 * promise and nothing is stored, which silently breaks the app offline. Doing
 * them one at a time means one missing file cannot take the rest with it.
 */
function cacheAssets() {
  return caches.open(CACHE_NAME).then(function (cache) {
    return Promise.all(ASSETS.map(function (asset) {
      return cache.add(new Request(asset, { cache: 'reload' })).catch(function (err) {
        // Report but keep going.
        console.warn('[sw] could not cache', asset, err && err.message);
      });
    }));
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    cacheAssets().then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      // A navigation with a query string (?v=…, a bookmarked parameter) will
      // not match the cached entry, because Cache API matching includes the
      // search string. Retry ignoring the query before giving up.
      return caches.match(event.request, { ignoreSearch: true }).then((loose) => {
        if (loose) return loose;

        return fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(function () {
            // Last resort for an offline navigation: serve the app shell.
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html').then(function (shell) {
                return shell || new Response(
                  '<!doctype html><meta charset="utf-8">'
                  + '<title>Offline</title>'
                  + '<body style="font-family:system-ui;padding:2rem">'
                  + '<h1>Offline</h1>'
                  + '<p>This app has not been cached yet. Reconnect once, then it '
                  + 'will work offline.</p>',
                  { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
                );
              });
            }
            return Response.error();
          });
      });
    })
  );
});
