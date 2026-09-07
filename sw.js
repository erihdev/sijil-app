// سجل المتابعة الرقمي — service worker: الواجهة شبكة-أولاً، والدروس والصور والصوت من الكاش عند توفرها
const V = "sijil-v2";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).catch(() => { })
      .then(() => self.clients.claim())
  );
});

/* ═══ الكاش خدمة لا شرط ═══
   CacheStorage قد لا تعمل إطلاقاً (تصفّح خاص، مساحة ممتلئة، كاش تالف) فترمي caches.open/‏match.
   كل استعمال هنا محاط بحارس يعيد null عند الفشل، حتى يبقى عامل الخدمة شفافاً: الطلب يذهب
   إلى الشبكة كما لو لم يكن مسجّلاً، بدل أن يسقط الطلب ويظهر «تعذّر تحميل الدرس». */
const cOpen = () => { try { return caches.open(V).catch(() => null); } catch (e) { return Promise.resolve(null); } };
const cMatch = (req) => { try { return caches.match(req).catch(() => null); } catch (e) { return Promise.resolve(null); } };
const cPut = (req, res) => { cOpen().then(c => c && c.put(req, res)).catch(() => { }); };

// الدروس والمناهج: كاش أولاً ثم تحديث صامت في الخلفية
async function dataFirst(req) {
  const hit = await cMatch(req);
  if (hit) { fetch(req).then(r => { if (r && r.ok) cPut(req, r.clone()); }).catch(() => { }); return hit; }
  const r = await fetch(req);                       // فشلت الشبكة ولا نسخة؟ يُرمى الخطأ كما بلا عامل خدمة
  if (r && r.ok) cPut(req, r.clone());
  return r;
}
// الواجهة: شبكة أولاً وإلا الكاش (تعمل دون اتصال بعد أول زيارة)
async function netFirst(req) {
  let err;
  try {
    const r = await fetch(req);
    if (r && r.ok) cPut(req, r.clone());
    return r;
  } catch (e) { err = e; }
  const hit = await cMatch(req);
  if (hit) return hit;
  const idx = await cMatch("./index.html");
  if (idx) return idx;
  throw err;                                        // لا شبكة ولا كاش: خطأ شبكة حقيقي لا استجابة فارغة
}
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  const isData = /\/data\/(lessons|curr)\//.test(u.pathname);
  e.respondWith(isData ? dataFirst(e.request) : netFirst(e.request));
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
