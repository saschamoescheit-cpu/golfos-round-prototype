// GolfOS push notifications in the service worker (final list, Sascha 23.10.2026) – loaded by the generated service
// worker (vite.config.ts, workbox importScripts). Shows what the function golfos-push sends and opens the app at its place:
// "#review=<round>" (check that round), "#sign" (the rounds to sign), "#games".
self.addEventListener('push', (event) => {
  let note = { title: 'GolfOS', body: '', tag: 'golfos', url: './' };
  try {
    note = { ...note, ...event.data.json() };
  } catch {
    if (event.data) note.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(note.title, {
      body: note.body,
      tag: note.tag,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: note.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const app = open.find((c) => c.url.startsWith(self.registration.scope));
      if (app) {
        // the app is open: go there in it (the app follows the place in the address)
        try {
          await app.focus();
          return await app.navigate(url);
        } catch {
          /* not controlled by this worker yet – open it anew */
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
