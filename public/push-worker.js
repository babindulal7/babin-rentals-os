// =============================================================================
// public/push-worker.js — Service Worker Web Push Listener (T5-09, W62)
//
// Handles incoming Web Push notifications and notification clicks:
//   - Shows native OS pop-up alert on phones (iPhone / Android) and iPad (W62).
//   - Law 6 money blindness is enforced server-side before the push is delivered.
//   - Clicking the pop-up opens or focuses the specific record URL.
// =============================================================================

self.addEventListener('push', function (event) {
  if (!event.data) {
    return;
  }

  var data = {};
  try {
    data = event.data.json();
  } catch (err) {
    data = {
      title: 'Babin Rentals Alert',
      body: event.data.text() || 'New operational alert',
      link_url: '/today',
    };
  }

  var title = data.title || 'Babin Rentals';
  var body = data.body || '';
  var icon = data.icon || '/icons/192.png';
  var badge = data.badge || '/icons/192.png';
  var tag = data.tag || 'babin-alert';
  var url = data.link_url || data.url || (data.data && data.data.url) || '/today';

  var options = {
    body: body,
    icon: icon,
    badge: badge,
    tag: tag,
    data: {
      url: url,
      tag: tag,
      received_at: new Date().toISOString(),
    },
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // Focus existing open window if available
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url && 'focus' in client) {
          if (client.url.indexOf(targetUrl) !== -1 || client.url.indexOf(self.location.origin) !== -1) {
            if (client.navigate && targetUrl && targetUrl !== '/') {
              client.navigate(targetUrl);
            }
            return client.focus();
          }
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
