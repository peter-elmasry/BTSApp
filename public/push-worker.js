/* D069: handle our short-lived round alerts before Angular's generic push handler. */
self.addEventListener('push', (event) => {
  let notification;
  try {
    notification = event.data?.json()?.notification;
  } catch {
    return;
  }
  if (notification?.data?.btsRoundPush !== true) return;
  event.stopImmediatePropagation();
  event.waitUntil(
    (async () => {
      if (!(Date.parse(notification.data.expiresAt) > Date.now())) return;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visible = windows.some(
        (client) =>
          new URL(client.url).origin === self.location.origin &&
          client.visibilityState === 'visible',
      );
      if (visible && notification.data.test !== true) return;
      const { title, ...options } = notification;
      await self.registration.showNotification(title, options);
    })(),
  );
});
self.addEventListener('notificationclick', (event) => {
  if (event.notification.data?.btsRoundPush !== true) return;
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil(
    (async () => {
      // Never accept a remote navigation target, even from a malformed provider payload.
      const url = new URL('/home', self.location.origin).href;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) {
        await existing.navigate(url);
        await existing.focus();
      } else await self.clients.openWindow(url);
    })(),
  );
});
importScripts('./ngsw-worker.js');
