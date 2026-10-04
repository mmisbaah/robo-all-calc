/* Service worker: cache-first app shell with background refresh. */
const CACHE_NAME = 'calculator-vf730c7ad';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=f730c7ad',
  './js/calculator.js?v=f730c7ad',
  './js/app.js?v=f730c7ad',
  './js/grapher.js?v=f730c7ad',
  './js/grapher-ui.js?v=f730c7ad',
  './js/grapher-math.js?v=f730c7ad',
  './js/grapher-geometry.js?v=f730c7ad',
  './js/units.js?v=f730c7ad',
  './js/currency.js?v=f730c7ad',
  './js/currency-names.js?v=f730c7ad',
  './js/i18n.js?v=f730c7ad',
  './js/keyboard-target.js?v=f730c7ad',
  './js/symbolic.js?v=f730c7ad',
  './js/cas-solve.js?v=f730c7ad',
  './js/cas-worker.js?v=f730c7ad',
  './manifest.json',
  './robots.txt',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

/**
 * Not precached: vendor/nerdamer.js.
 *
 * At 528 KB it was 63% of a first visit's 840 KB payload, yet the solver only
 * needs it once someone opens the panel. Precaching it charged every visitor for
 * a feature most never touch, so the first visit now costs about 312 KB.
 *
 * It is cached on demand instead. A dedicated worker's importScripts() request is
 * not reliably routed through the fetch handler across browsers, so the page does
 * it explicitly: symbolic.js posts {type:'cache-urls'} here the first time the
 * solver reports ready, and the message handler below stores the bundle.
 *
 * Trade-off, stated plainly: solving offline now requires having opened the
 * solver once while online. Everything else still works offline immediately.
 */

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

/**
 * Cache the deferred CAS bundle once the page reports the solver is in use.
 *
 * Sent once, from symbolic.js, the first time the worker signals ready. Failures
 * are logged and swallowed: not caching the bundle costs offline solving, it
 * must never break the page.
 */
self.addEventListener('message', function (event) {
  var msg = (event.data) || {};
  if (msg.type !== 'cache-urls' || !Array.isArray(msg.urls)) return;
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(msg.urls.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function (err) {
          console.warn('[sw] deferred cache failed', url, err && err.message);
        });
      }));
    })
  );
});

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

  const isNavigation = event.request.mode === 'navigate';

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      // A navigation with a query string (?v=…, a bookmarked parameter) will
      // not match the cached entry, because Cache API matching includes the
      // search string. Retry ignoring the query before giving up.
      //
      // Only for navigations. Applying this to assets would let
      // styles.css?v=<anything> be answered with the cached styles.css?v=<old>,
      // which silently defeats version cache-busting.
      const retry = isNavigation
        ? caches.match(event.request, { ignoreSearch: true })
        : Promise.resolve(undefined);

      return retry.then((loose) => {
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
            if (isNavigation) {
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
