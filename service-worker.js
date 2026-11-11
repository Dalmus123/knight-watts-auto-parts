// Knight Watts Auto Parts - Service Worker
// Enables offline functionality and app-like experience
// GitHub Pages compatible, safe with Supabase API calls

const CACHE_NAME = 'knight-watts-v1.0.9';
const OFFLINE_URL = '/offline.html';

// Get the base path for GitHub Pages (e.g., /knight-watts-auto-parts)
const BASE_PATH = self.location.pathname.split('/')[1] || '';
const basePath = BASE_PATH ? `/${BASE_PATH}` : '';

// Files to cache for offline use (static UI only)
const STATIC_ASSETS = [
  basePath + '/',
  basePath + '/index.html',
  basePath + '/checkout.html',
  basePath + '/3d-printing.html',
  basePath + '/login.html',
  basePath + '/signup.html',
  basePath + '/styles.css',
  basePath + '/app.js',
  basePath + '/grokbot.js',
  basePath + '/ai-chat-widget.js',
  basePath + '/ai-chat-widget.css',
  basePath + '/3d-print-system.js',
  basePath + '/3d-printing-ui.js',
  basePath + '/manifest.json',
  basePath + '/offline.html',
  basePath + '/admin/index.html',
  basePath + '/admin/admin.js',
  basePath + '/admin/admin.css',
  basePath + '/admin/jarvis-theme.css'
].filter(path => path);

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
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
      .then(() => self.clients.claim()) // Take control immediately
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
    // Always fetch fresh from network for API/storage/external
    return event.respondWith(fetch(event.request));
  }
  
  // Skip non-GET requests (POST, PUT, DELETE, etc.)
  if (event.request.method !== 'GET') {
    return;
  }

  // Cache-first strategy for static assets only
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // For HTML pages, use network-first (for admin uploads to work)
        if (event.request.destination === 'document' || event.request.mode === 'navigate') {
          return fetch(event.request)
            .then((response) => {
              // Cache the response
              if (response && response.status === 200) {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(event.request, responseToCache));
              }
              return response;
            })
            .catch(() => {
              // Fallback to cache if offline
              if (cachedResponse) {
                return cachedResponse;
              }
              // Show offline page
              return caches.match(basePath + OFFLINE_URL);
            });
        }
        
        // For other static assets (CSS, JS), use cache-first
        if (cachedResponse) {
          return cachedResponse;
        }

        // Fetch from network if not in cache
        return fetch(event.request)
          .then((response) => {
            // Cache successful responses
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(event.request, responseToCache));
            }
            return response;
          })
          .catch(() => {
            // Return generic offline response for failed requests
            return new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then((cache) => cache.addAll(event.data.urls))
    );
  }
});

// Background sync for offline orders (future feature)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncOrders());
  }
});

async function syncOrders() {
  // Get pending orders from IndexedDB
  // Send to server when online
  // This will be implemented with backend integration
  console.log('[Service Worker] Syncing offline orders...');
}

// Push notifications (future feature)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'New update from Knight Watts Auto Parts',
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
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

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});

console.log('[Service Worker] Loaded successfully');
