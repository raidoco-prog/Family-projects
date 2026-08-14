/* Service worker: push delivery, and keeping the shopping list reachable
   with no reception (N6). */

const CACHE = "family-v1";

/**
 * Only the shopping list is served from cache.
 *
 * That is where the reception is bad and where failing to add an item costs
 * the whole habit (S1). The other screens are read-mostly and a stale
 * calendar is worse than an honest "no connection".
 */
const OFFLINE_PATHS = ["/shopping"];

const isOfflinePath = (url) => OFFLINE_PATHS.includes(url.pathname);

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    // Opaque and error responses must not replace a good cached copy.
    if (fresh.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, fresh.clone());
  }
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Build assets are addressed by content: production hashes the filename and
  // `next dev` appends a `?v=` that changes on rebuild. Either way the URL is
  // a promise about the bytes, and the Cache API keys on the whole URL —
  // so a cached copy is never the wrong one and a rebuild simply misses.
  //
  // These have to be cached, not just the HTML: a cached page that cannot
  // fetch its own scripts renders and then fails to hydrate, which looks
  // exactly like a broken app rather than an offline one.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Both the cold open (a navigation) and the in-app tap (an RSC fetch)
  // land on the same path, and both have to work.
  if (isOfflinePath(url)) {
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener("push", (event) => {
  let payload = { title: "הבית שלנו", body: "", url: "/home" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      dir: "rtl",
      lang: "he",
      data: { url: payload.url },
      // Same tag replaces an unread notification rather than stacking.
      tag: payload.url,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/home";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
