// Service Worker — Speed Monitor
// Recebe Push Notifications e exibe notificações nativas no browser.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Speed Monitor', body: event.data.text() };
  }

  const title = payload.title || 'Speed Monitor';
  const options = {
    body:      payload.body  || '',
    icon:      payload.icon  || '/icon.png',
    badge:     '/icon.png',
    tag:       'speed-alert',
    renotify:  true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
