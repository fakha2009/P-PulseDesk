const APP_CACHE = 'pulsedesk-app-v3';
const APP_SHELL = [
    '/',
    '/app',
    '/app.html',
    '/auth',
    '/auth.html',
    '/styles.css',
    '/app.js',
    '/auth.js',
    '/config.js',
    '/api-config.js',
    '/lib/api-client.js',
    '/ui/helpers.js',
    '/ui/task-datetime.js',
    '/manifest.webmanifest',
    '/favicon.svg',
    '/assets/logo.png',
    '/assets/pwa-192.png',
    '/assets/pwa-512.png',
    '/assets/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(APP_CACHE);
        await Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => null)));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key !== APP_CACHE).map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
        return;
    }

    event.respondWith((async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        try {
            const response = await fetch(request);
            if (response.ok) {
                const cache = await caches.open(APP_CACHE);
                cache.put(request, response.clone());
            }
            return response;
        } catch (error) {
            if (request.mode === 'navigate') {
                return caches.match('/app.html');
            }
            throw error;
        }
    })());
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || '/tasks';
    event.waitUntil((async () => {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = clients.find((client) => client.url.includes('/app') || client.url.includes('/dashboard'));
        if (existing) {
            await existing.focus();
            existing.postMessage({ type: 'navigate', page: event.notification.data?.page || 'tasks' });
            return;
        }
        await self.clients.openWindow(targetUrl);
    })());
});
