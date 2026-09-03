// سجل المتابعة الرقمي — service worker: الواجهة شبكة-أولاً، والدروس والصور والصوت من الكاش عند توفرها
const V = "sijil-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  const isData = /\/data\/(lessons|curr)\//.test(u.pathname);
  if (isData) {   // كاش أولاً ثم تحديث في الخلفية
    e.respondWith(caches.open(V).then(async c => { const hit = await c.match(e.request); const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit); return hit || net; }));
  } else {        // شبكة أولاً وإلا الكاش (يعمل دون اتصال بعد أول زيارة)
    e.respondWith(fetch(e.request).then(r => { if (r.ok) caches.open(V).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match("./index.html"))));
  }
});
