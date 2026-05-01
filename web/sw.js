self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || '/app';
    event.waitUntil((async () => {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = clients.find((client) => client.url.includes('/app'));
        if (existing) {
            await existing.focus();
            existing.postMessage({ type: 'navigate', page: event.notification.data?.page || 'tasks' });
            return;
        }
        await self.clients.openWindow(targetUrl);
    })());
});
