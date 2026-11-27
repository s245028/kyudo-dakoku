// 通知を表示する。アプリ本体の Service Worker から読み込む（vite.config.ts）
self.addEventListener('push', (event) => {
  const message = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(message.title ?? '道場打刻', {
      body: message.body ?? '',
      icon: '/icon-192.png',
    }),
  );
});

// 通知を押したら、アプリを開く
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(([open]) => (open ? open.focus() : self.clients.openWindow('/'))),
  );
});
