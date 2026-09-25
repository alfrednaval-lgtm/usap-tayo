/* Usap Tayo! offline support: network first (so updates show up), cached copy when offline. */
const CACHE = "usap-v5";
const SHELL = ["./", "index.html", "app.css", "app.js", "content.json", "manifest.json", "a-sys.json", "bg-music.mp3",
  "nunito-latin-700-normal.woff2", "nunito-latin-800-normal.woff2", "nunito-latin-900-normal.woff2", "andika-latin-700-normal.woff2"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
