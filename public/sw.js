self.addEventListener("push", (event) => {
  let payload = {
    title: "Magic Key Monitor",
    body: "Your watchlist changed.",
    url: "/",
  };

  try {
    payload = { ...payload, ...(event.data ? event.data.json() : {}) };
  } catch {
    // Keep the default payload if parsing fails.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/branding/enchant-icon.png",
      badge: "/branding/enchant-icon.png",
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }

      return undefined;
    })
  );
});
