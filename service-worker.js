// Knight Watts Auto Parts - Service Worker
// Enables offline functionality and app-like experience
// GitHub Pages compatible, safe with Supabase API calls
//
// IMPORTANT: bump CACHE_NAME on every admin auth / role change so iPhone PWAs
// drop stale admin.js (old allowlists that rejected ceo/cfo/coo/cos).

const CACHE_NAME = 'knight-watts-v1.4.3-custom-domain';
const OFFLINE_PATH = '/offline.html';

// Site root from SW script directory — works for:
//   /service-worker.js                         (custom domain apex)
//   /knight-watts-auto-parts/service-worker.js  (GitHub Pages project URL)
const basePath = self.location.pathname.replace(/\/[^/]*$/, '');

// Files to cache for offline use (static UI only)
const STATIC_ASSETS = [
  basePath + '/',
  basePath + '/index.html',
  basePath + '/checkout.html',
  basePath + '/checkout.css',
  basePath + '/terms.html',
  basePath + '/3d-printing.html',
  basePath + '/filaments.html',
  basePath + '/filaments.css',
  basePath + '/filaments.js',
  basePath + '/login.html',
  basePath + '/signup.html',
  basePath + '/styles.css',
  basePath + '/app.js',
  basePath + '/js/site-base.js',
  basePath + '/js/pwa-nav.js',
  basePath + '/js/referral.js',
  basePath + '/js/backend-integration.js',
  basePath + '/grokbot.js',
  basePath + '/ai-chat-widget.js',
  basePath + '/ai-chat-widget.css',
  basePath + '/3d-print-system.js',
  basePath + '/3d-printing-ui.js',
  basePath + '/manifest.json',
  basePath + '/offline.html',
  basePath + '/robots.txt',
  basePath + '/admin/index.html',
  basePath + '/admin/admin.js',
  basePath + '/admin/admin.css',
  basePath + '/admin/jarvis-theme.css',
  basePath + '/admin/sales.js',
  basePath + '/admin/sales.css',
  basePath + '/admin/roles.js',
  basePath + '/admin/passkeys.js',
  basePath + '/admin/staff.js'
].filter(path => path);

function isAdminShellRequest(url) {
  // Admin HTML/JS/CSS must not stick on cache-first — stale allowlists lock out new roles
  const p = url.pathname;
  return (
    p.includes('/admin/') &&
    (p.endsWith('.js') ||
      p.endsWith('.css') ||
      p.endsWith('.html') ||
      p.endsWith('/admin') ||
      p.endsWith('/admin/'))
  );
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing', CACHE_NAME);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting()) // Activate immediately — force update
  );
});

// Activate event - clean up old caches and force clients onto this version
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating', CACHE_NAME);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clientList) => {
        clientList.forEach((client) => {
          client.postMessage({
            type: 'FORCE_RELOAD',
            cacheName: CACHE_NAME,
            reason: 'service-worker-activated'
          });
        });
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NEVER cache these (to avoid stale data):
  // - Supabase API requests
  // - Storage bucket requests (product images, 3D models)
  // - External APIs
  const shouldBypassCache =
    url.hostname.includes('supabase') ||
    url.pathname.includes('/storage/v1/') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/functions/v1/') ||
    !url.hostname.includes(self.location.hostname);

  if (shouldBypassCache) {
    return event.respondWith(fetch(event.request));
  }

  if (event.request.method !== 'GET') {
    return;
  }

  const networkFirst =
    event.request.destination === 'document' ||
    event.request.mode === 'navigate' ||
    isAdminShellRequest(url);

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (networkFirst) {
        return fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
                // Also refresh unversioned admin script keys so old precache entries update
                if (isAdminShellRequest(url)) {
                  const bare = url.origin + url.pathname;
                  if (bare !== event.request.url) {
                    cache.put(bare, response.clone()).catch(() => {});
                  }
                }
              });
            }
            return response;
          })
          .catch(() => {
            if (cachedResponse) return cachedResponse;
            return caches.match(basePath + OFFLINE_PATH);
          });
      }

      // Storefront static assets: cache-first
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return response;
        })
        .catch(() => {
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_CACHE_NAME') {
    event.source?.postMessage({ type: 'CACHE_NAME', cacheName: CACHE_NAME });
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.addAll(event.data.urls))
    );
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncOrders());
  }
});

async function syncOrders() {
  console.log('[Service Worker] Syncing offline orders...');
}

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};

  const options = {
    body: data.body || 'New update from Knight Watts Auto Parts',
    icon: basePath + '/icon-192x192.png',
    badge: basePath + '/icon-192x192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'default',
    data: data.url ? { url: data.url } : {}
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'Knight Watts Auto Parts',
      options
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});

console.log('[Service Worker] Loaded', CACHE_NAME);
