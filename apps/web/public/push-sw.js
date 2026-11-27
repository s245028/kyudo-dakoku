// 通知を表示する。アプリ本体の Service Worker から読み込む（vite.config.ts）
self.addEventListener('push', (event) => {
  const message = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(message.title ?? '道場打刻', {
      body: message.body ?? '',
      icon: '/icon-192.png',
      data: { open: message.open },
    }),
  );
});

// 通知を押したら、アプリの該当する画面を開く
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const open = event.notification.data?.open;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(([app]) => {
      if (!app) {
        return self.clients.openWindow(open ? `/?open=${encodeURIComponent(open)}` : '/');
      }
      app.postMessage({ type: 'open', open });
      return app.focus();
    }),
  );
});
