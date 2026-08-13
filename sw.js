const CACHE_NAME = "dompetkos-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./sw.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) {
        fetch(e.request)
          .then((res) => {
            if (res.ok) {
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(e.request, res));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(e.request)
        .then((response) => {
          if (response.ok && e.request.destination === "document") {
            const clone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (e.request.destination === "document") {
            return caches.match("./index.html");
          }
        });
    }),
  );
});

self.addEventListener("sync", (e) => {
  if (e.tag === "dompetkos-sync") {
    e.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "SYNC_TRIGGER" });
        });
      }),
    );
  }
});
