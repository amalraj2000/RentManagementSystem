// Service worker. Bump VERSION to drop old caches. A new worker waits until the page asks it to take over (SKIP_WAITING).
// Only the public pages are cached; account / admin / API responses never are.
const VERSION = "v2";
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PUBLIC_PAGES = ["/", "/login"];
const MAX_PAGES = 40;
const MAX_STATIC = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE_URL, "/icon-192.png", "/icon-512.png"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function put(name, key, res, max) {
  const c = await caches.open(name);
  await c.put(key, res);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]); // oldest first
}

const isStatic = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/splash/") || /\.(?:png|svg|ico|woff2?)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    const isPublic = PUBLIC_PAGES.includes(url.pathname);
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (isPublic && res.ok && !res.redirected) event.waitUntil(put(PAGES, url.pathname, res.clone(), MAX_PAGES));
          return res;
        })
        .catch(async () => (isPublic && (await caches.match(url.pathname, { cacheName: PAGES }))) || caches.match(OFFLINE_URL)),
    );
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) event.waitUntil(put(STATIC, req, res.clone(), MAX_STATIC));
            return res;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { /* ignore */ }
  const url = typeof d.url === "string" && d.url.startsWith("/") && !d.url.startsWith("//") ? d.url : "/";
  event.waitUntil(self.registration.showNotification(d.title || "Loveshore", { body: d.body || "", icon: "/icon-192.png", badge: "/icon-192.png", data: { url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const w = wins[0];
      if (w) return w.focus().then(() => ("navigate" in w ? w.navigate(url) : undefined));
      return self.clients.openWindow(url);
    }),
  );
});
