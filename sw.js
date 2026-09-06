// سجل المتابعة الرقمي — service worker: الواجهة شبكة-أولاً، والدروس والصور والصوت من الكاش عند توفرها
const V = "sijil-v2";
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

/* ═══════════ تنبيهات الحصص ═══════════
   push            رسالة قادمة من الخادم → تُعرض كتنبيه عربي (العنوان والنص من الخادم)
   notificationclick  نقرة المعلم → تُركّز نافذة «سجلي» المفتوحة، وإن لم توجد تفتح واحدة
   التنبيه المحلي (قبل الحصة بالمهلة التي اختارها المعلم) يرسله js/notify.js عبر registration.showNotification. */
async function sijilFocus(url) {
  const root = new URL("./", self.location.href);        // جذر التطبيق = نطاق عامل الخدمة
  let target;
  try { target = new URL(url || "./", root.href); } catch (e) { target = root; }
  if (target.origin !== root.origin) target = root;      // لا نفتح إلا صفحات هذا الموقع مهما جاء من الخادم
  const isApp = (u) => {                                  // هل هذه النافذة هي «سجلي» نفسه؟ (نتجاهل ?demo و#hash)
    try { const x = new URL(u); return x.origin === root.origin && (x.pathname === root.pathname || x.pathname === root.pathname + "index.html"); }
    catch (e) { return false; }
  };
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  let other = null;
  for (const c of all) {
    // التطبيق مفتوح: نركّزه فقط — لا نعيد تحميله حتى لا يفقد المعلم حصته الحية أو ما لم يُحفظ
    if (isApp(c.url)) { try { await c.focus(); } catch (e) { } return c; }
    if (!other) { try { if (new URL(c.url).origin === root.origin) other = c; } catch (e) { } }
  }
  if (other) {                                            // نافذة أخرى من الموقع (صفحة الطالب مثلاً): ننقلها إلى التطبيق
    try { await other.focus(); } catch (e) { }
    try { if ("navigate" in other) await other.navigate(target.href); } catch (e) { }
    return other;
  }
  try { return await self.clients.openWindow(target.href); } catch (e) { return null; }
}
self.__sijilFocus = sijilFocus;   // منفذ للاختبار الآلي فقط
// waitUntil يرمي إن لم يكن الحدث قيد الإرسال الحقيقي — نحميه حتى لا تسقط بقية المعالج
const sijilWait = (e, p) => { try { e.waitUntil(p); } catch (x) { } return p; };

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { try { d = { body: e.data.text() }; } catch (y) { d = {}; } }
  if (!d || typeof d !== "object") d = {};
  const tag = String(d.tag || "sijil-push");
  const opt = {
    body: String(d.body || ""), tag, renotify: true, dir: "rtl", lang: "ar",
    icon: d.icon || "./icon-192.png", badge: d.badge || "./icon-192.png",
    data: { url: d.url || "./" }
  };
  sijilWait(e, self.registration.showNotification(String(d.title || "سجلي"), opt).catch(() => { }));
});

self.addEventListener("notificationclick", (e) => {
  try { e.notification.close(); } catch (x) { }
  const url = (e.notification && e.notification.data && e.notification.data.url) || "./";
  sijilWait(e, sijilFocus(url));
});
