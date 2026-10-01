/* Career Buddha 360 Suite — service worker for basic offline support */
const CACHE = "cb360-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Never cache API traffic — always hit the network.
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/api/")) return;

  // Navigations: network-first, fall back to cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, net.clone());
          return net;
        } catch {
          return (await caches.match(req)) || (await caches.match("/")) ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })()
    );
    return;
  }

  // Static assets: cache-first, then network (only cache same-origin OK responses).
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net.ok && url.origin === self.location.origin) {
          const cache = await caches.open(CACHE);
          cache.put(req, net.clone());
        }
        return net;
      } catch {
        return cached || new Response("", { status: 503 });
      }
    })()
  );
});
