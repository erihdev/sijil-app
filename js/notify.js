/* ═══════════════════════════════════════════════════════════════════════════════
   سجلي — تنبيهات الحصص  (window.SIJIL_NOTIFY)
   ينبّه المعلم قبل بداية حصته بالمهلة التي اختارها (5 أو 10 أو 15 دقيقة): «الحصة الثالثة بعد 5 دقائق — رابع (أ) — 22 طالباً».

   الواجهة:
     supported()      هل يدعم هذا الجهاز التنبيهات؟
     state()          الحالة الحالية (مدعوم/مسموح/مفعّل/مشترك) مع رسالة عربية جاهزة للعرض
     enable()         تفعيل — تطلب الإذن، ولا تعمل إلا بنقرة صريحة من المعلم
     disable()        إيقاف
     tick(now)        فحص لحظي: إن اقتربت الحصة أرسلت تنبيهاً واحداً لا يتكرر
     nextClass(now)   الحصة القادمة اليوم لهذا المعلم أو null
     subscribePush()  اشتراك الدفع من الخادم (اختياري — إن فشل تبقى التنبيهات المحلية تعمل)
     mount(el)        بطاقة جاهزة (زر + شرح) تُوضع في أي حاوية داخل تبويب «المزيد»

   لا تُطلب الأذونات تلقائياً أبداً: enable() وحدها تطلب الإذن، ولا تُستدعى إلا من onclick.
   أوقات الحصص تأتي من محرك الأجراس في لوحة المدير (SIJIL_ADMIN)، وإن لم يُحمَّل فمن
   الجدول الافتراضي نفسه المستعمل في app.js (7:00 · 45 دقيقة · 7 حصص · فسحة 30 بعد الثالثة).
   ═══════════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var VAPID = "BKOng8K19p2wBbjSGrOf2fufPNku7G0fF-Qr1BMe9oxsLoQcF5sZHPbkvQXQJLwp7mxgmyK7UCVZ1EBH8A35Tjc";
  var LEAD_KEY = "sijil.notify.lead"; // خيار المعلم: 5 أو 10 أو 15 دقيقة قبل الحصة (تكتبه بطاقة «المزيد»)
  var LEAD_DEF = 5;                   // المهلة حين لا يختار شيئاً
  var ON_KEY = "sijil.notify.on";     // «المعلم فعّل التنبيهات» على هذا الجهاز
  var FLAG = "sijil.notified.";       // sijil.notified.<التاريخ>.<الحصة> = 1  → لا يتكرر التنبيه
  var TICK_MS = 30000;                // فحص كل نصف دقيقة ما دامت الصفحة مفتوحة
  var DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  var ORD = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية عشرة", "الثانية عشرة"];

  /* ═══ أدوات صغيرة ═══ */
  var S = function () { return window.SIJIL || null; };
  var A = function () { return window.SIJIL_ADMIN || null; };
  function LS(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ord(p) { var a = A(); if (a && typeof a.ord === "function") { try { return a.ord(p); } catch (e) { } } return ORD[p] || String(p); }
  // «بعد 5 دقائق» — صيغة العدد العربية الصحيحة
  function minsAr(n) { return n === 1 ? "دقيقة واحدة" : n === 2 ? "دقيقتين" : (n >= 3 && n <= 10) ? n + " دقائق" : n + " دقيقة"; }
  // المهلة التي اختارها المعلم — تُقرأ عند كل استعمال فيسري التغيير فوراً بلا إعادة تحميل
  function leadMin() { var v = LS(function () { return +localStorage.getItem(LEAD_KEY); }, 0); return (v === 5 || v === 10 || v === 15) ? v : LEAD_DEF; }
  // «22 طالباً» — صيغة العدد العربية الصحيحة
  function studAr(n) { return n === 1 ? "طالب واحد" : n === 2 ? "طالبان" : (n >= 3 && n <= 10) ? n + " طلاب" : n + " طالباً"; }
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function dayKey(d) { return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()); }
  function asDate(now) { if (now instanceof Date) return now; if (now == null) return new Date(); var d = new Date(now); return isNaN(d.getTime()) ? new Date() : d; }

  /* ═══ الجدول الافتراضي — نسخة طبق الأصل مما في app.js، ولا يُستعمل إلا إن لم تُحمَّل لوحة المدير ═══ */
  function fallbackPeriods() {
    var out = [], t = 420;
    for (var p = 1; p <= 7; p++) { out.push({ p: p, from: t, to: t + 45 }); t += 45; if (p === 3) t += 30; }
    return out;
  }
  // حصص اليوم فقط (بلا فسح) بالشكل {p, from, to} — الأوقات بالدقائق من منتصف الليل
  function periodsOf(day) {
    var a = A();
    if (a && typeof a.periodsOnly === "function") {
      var r = LS(function () { return a.periodsOnly(day); }, null);
      if (r && r.length) return r;
    }
    return fallbackPeriods();
  }
  function periodTime(p, day) {
    var a = A();
    if (a && typeof a.periodTime === "function") { var s = LS(function () { return a.periodTime(p, day); }, ""); if (s) return s; }
    var b = periodsOf(day).filter(function (x) { return x.p === +p; })[0];
    var hm = function (m) { return Math.floor(m / 60) + ":" + two(Math.round(m) % 60); };
    return b ? hm(b.from) + "–" + hm(b.to) : "";
  }

  /* ═══ الدعم والحالة ═══ */
  function supported() {
    return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
  }
  function secure() { return LS(function () { return window.isSecureContext !== false; }, true); }
  /* حالة الإذن: Notification.permission هي المصدر، ومعها Permissions API لأن بعض المتصفحات
     (ومتصفح الاختبار الآلي) تُبقي Notification.permission على "denied" رغم السماح الفعلي. */
  var permCache = null;
  function permWatch() {
    LS(function () {
      if (!navigator.permissions || !navigator.permissions.query) return;
      var map = { granted: "granted", denied: "denied", prompt: "default" };
      navigator.permissions.query({ name: "notifications" }).then(function (st) {
        permCache = map[st.state] || null;
        try { st.onchange = function () { permCache = map[st.state] || null; paint(); }; } catch (e) { }
        paint();
      }).catch(function () { });
    });
  }
  function perm() {
    if (!supported()) return "none";
    var p = LS(function () { return Notification.permission; }, "default");
    if (p === "granted") return "granted";
    return permCache || p;
  }
  function isOn() { return LS(function () { return localStorage.getItem(ON_KEY) === "1"; }, false); }
  function setOn(v) { LS(function () { if (v) localStorage.setItem(ON_KEY, "1"); else localStorage.removeItem(ON_KEY); }); }
  function teacher() { var s = S(); return (s && s.TE) || null; }

  function state() {
    var sup = supported(), sec = secure(), pm = perm(), on = isOn();
    var pushOn = LS(function () { return !!localStorage.getItem("sijil.notify.ep"); }, false);
    var ready = sup && sec && pm === "granted" && on;
    var msg;
    if (!sup) msg = "هذا المتصفح لا يدعم التنبيهات — جرّب متصفح جوالك أو ثبّت «سجلي» على الشاشة الرئيسية";
    else if (!sec) msg = "التنبيهات تعمل على العنوان الآمن للموقع فقط";
    else if (pm === "denied") msg = "التنبيهات ممنوعة لهذا الموقع — اسمح بها من إعدادات المتصفح ثم أعد المحاولة";
    else if (!on) msg = "التنبيهات متوقفة — فعّلها لتصلك رسالة قبل كل حصة بـ " + minsAr(leadMin());
    else if (pm !== "granted") msg = "بقي السماح بالتنبيهات — اضغط «تفعيل التنبيهات»";
    // مفعّل: نصدُق مع المعلم — بلا اشتراك دفع لا يصل التنبيه إلا والتطبيق مفتوح
    else if (!pushOn) msg = "التنبيهات مفعّلة — سيصلك تذكير قبل كل حصة بـ " + minsAr(leadMin()) + " ما دام «سجلي» مفتوحاً على الجهاز";
    else msg = "التنبيهات مفعّلة — سيصلك تذكير قبل كل حصة بـ " + minsAr(leadMin()) + " ما دام «سجلي» مفتوحاً؛ وإن كان مغلقاً فقد يصل قبلها بقليل";
    return {
      supported: sup, secure: sec, permission: pm, enabled: on, ready: ready,
      push: pushOn, lead: leadMin(), message: msg
    };
  }

  /* ═══ الحصة القادمة اليوم ═══
     تعيد {p, cid, cname, from, mins} لأقرب حصة لم تبدأ بعد، أو null (لا حصص / انتهى الدوام / لا بيانات) */
  function nextClass(now) {
    var s = S(), te = teacher();
    if (!s || !te || !te.name) return null;
    var D = LS(function () { return s.D; }, null);
    if (!D || !Array.isArray(D.schedule)) return null;
    var d = asDate(now), day = DAYS[d.getDay()], m = d.getHours() * 60 + d.getMinutes();
    var list = periodsOf(day), best = null;
    for (var i = 0; i < D.schedule.length; i++) {
      var r = D.schedule[i];
      if (!r || r.t !== te.name || r.d !== day) continue;
      var b = null;
      for (var k = 0; k < list.length; k++) { if (!list[k].brk && +list[k].p === +r.p) { b = list[k]; break; } }
      if (!b) continue;                       // حصة خارج جدول أجراس اليوم (يوم أقصر مثلاً)
      var mins = b.from - m;
      if (mins < 1) continue;                 // بدأت أو انتهت
      if (!best || b.from < best.from) {
        var cl = LS(function () { return s.classById(r.c); }, null);
        best = { p: +r.p, cid: r.c, cname: (cl && cl.name) || "", from: b.from, mins: mins };
      }
    }
    return best;
  }

  /* ═══ نص التنبيه ═══ */
  function textOf(nx, day) {
    var s = S(), n = 0;
    var cl = LS(function () { return s && s.classById(nx.cid); }, null);
    if (cl) n = LS(function () { return s.activeStudents(cl).length; }, 0);
    var title = "الحصة " + ord(nx.p) + " بعد " + minsAr(nx.mins);
    var parts = [];
    if (nx.cname) parts.push(nx.cname);
    if (n) parts.push(studAr(n));
    var t = periodTime(nx.p, day);
    if (!parts.length && t) parts.push(t);
    return { title: title, body: parts.join(" — ") };
  }

  /* ═══ عامل الخدمة — نضمن وجود تسجيل (index.html يسجّله على https فقط) ═══ */
  function swReg() {
    if (!("serviceWorker" in navigator)) return Promise.reject(new Error("no-sw"));
    return navigator.serviceWorker.getRegistration()
      .then(function (r) { return r || navigator.serviceWorker.register("sw.js"); })
      .then(function () { return navigator.serviceWorker.ready; });
  }

  /* ═══ إرسال تنبيه واحد لا يتكرر ═══ */
  var firing = {};   // حارس داخل نفس اللحظة قبل أن تُكتب العلامة
  function tick(now) {
    var d = asDate(now), st = state();
    if (!st.ready) return Promise.resolve({ fired: false, reason: st.supported ? (st.enabled ? "permission" : "off") : "unsupported" });
    var nx = nextClass(d);
    if (!nx) return Promise.resolve({ fired: false, reason: "no-class" });
    if (nx.mins > leadMin()) return Promise.resolve({ fired: false, reason: "early", next: nx });
    var key = FLAG + dayKey(d) + "." + nx.p;
    if (LS(function () { return localStorage.getItem(key) === "1"; }, false) || firing[key]) {
      return Promise.resolve({ fired: false, reason: "done", next: nx });
    }
    firing[key] = 1;
    LS(function () { localStorage.setItem(key, "1"); prune(dayKey(d)); });     // نُعلّم قبل الإرسال حتى لا يتكرر أبداً
    var tx = textOf(nx, DAYS[d.getDay()]);
    return swReg().then(function (reg) {
      var tag = "sijil-class-" + dayKey(d) + "-" + nx.p;
      return reg.showNotification(tx.title, {
        body: tx.body, tag: tag, renotify: false, requireInteraction: false,
        dir: "rtl", lang: "ar",
        icon: LS(function () { return new URL("icon-192.png", reg.scope).href; }, "icon-192.png"),
        badge: LS(function () { return new URL("icon-192.png", reg.scope).href; }, "icon-192.png"),
        data: { url: LS(function () { return reg.scope; }, "./"), p: nx.p, cid: nx.cid }
      }).then(function () {
        delete firing[key];
        return { fired: true, p: nx.p, cid: nx.cid, key: key, tag: tag, title: tx.title, body: tx.body, next: nx };
      });
    }).catch(function (e) {
      delete firing[key];
      LS(function () { localStorage.removeItem(key); });                        // فشل الإرسال؟ نسمح بمحاولة أخرى
      return { fired: false, reason: "error", error: String(e && e.message || e), next: nx };
    });
  }
  // تنظيف علامات الأيام السابقة حتى لا تتراكم
  function prune(today) {
    var kill = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(FLAG) === 0 && k.indexOf(FLAG + today + ".") !== 0) kill.push(k);
    }
    kill.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { } });
  }

  /* ═══ اشتراك الدفع من الخادم — اختياري تماماً ═══ */
  function b64(s) {
    var pad = "=".repeat((4 - s.length % 4) % 4);
    var raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function keyOf(sub, name) {
    try {
      var k = sub.getKey(name); if (!k) return "";
      var b = new Uint8Array(k), s = "";
      for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    } catch (e) { return ""; }
  }
  // مهلة قصوى: لا ننتظر خدمة الدفع إلى الأبد — التنبيه المحلي هو الأساس
  function within(ms, pr, dflt) {
    return new Promise(function (res) {
      var done = 0, t = setTimeout(function () { if (!done) { done = 1; res(dflt); } }, ms);
      pr.then(function (v) { if (!done) { done = 1; clearTimeout(t); res(v); } },
        function (e) { if (!done) { done = 1; clearTimeout(t); res({ ok: false, reason: String(e && e.message || e) }); } });
    });
  }
  function subscribePush() {
    return within(12000, subscribePush_(), { ok: false, reason: "timeout" });
  }
  function subscribePush_() {
    if (!supported() || !("PushManager" in window)) return Promise.resolve({ ok: false, reason: "unsupported" });
    if (perm() !== "granted") return Promise.resolve({ ok: false, reason: "permission" });
    return swReg().then(function (reg) {
      if (!reg.pushManager) throw new Error("no-push");
      return reg.pushManager.getSubscription().then(function (old) {
        if (old) return old;
        return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) });
      });
    }).then(function (sub) {
      var rec = {
        ep: sub.endpoint,
        p256dh: keyOf(sub, "p256dh"),
        auth: keyOf(sub, "auth"),
        ua: String(navigator.userAgent || "").slice(0, 200),
        tz: LS(function () { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }, ""),
        ts: Date.now()
      };
      LS(function () { localStorage.setItem("sijil.notify.ep", rec.ep); });
      var s = S(), te = teacher(), fdb = s && LS(function () { return s.fdb; }, null);
      if (!fdb || !te || !te.id) return { ok: true, saved: false, sub: rec };    // نسخة تجريبية أو بلا سحابة
      return fdb.doc("push/" + te.id).set(rec)
        .then(function () { return { ok: true, saved: true, sub: rec }; })
        .catch(function (e) { return { ok: true, saved: false, reason: String(e && e.message || e), sub: rec }; });
    }).catch(function (e) {
      return { ok: false, reason: String(e && e.message || e) };                 // التنبيه المحلي يبقى عاملاً
    });
  }

  /* ═══ التفعيل — بنقرة صريحة فقط ═══ */
  function gesture() {
    var ua = LS(function () { return navigator.userActivation; }, null);
    if (ua && typeof ua.isActive === "boolean") return ua.isActive;
    return true;                                  // متصفح لا يخبرنا — نعتمد أن الدالة مربوطة بزر
  }
  function enable() {
    if (!supported()) return Promise.resolve({ ok: false, code: "unsupported", message: state().message });
    if (!secure()) return Promise.resolve({ ok: false, code: "insecure", message: state().message });
    if (perm() === "denied") return Promise.resolve({ ok: false, code: "denied", message: state().message });
    if (!gesture()) return Promise.resolve({ ok: false, code: "gesture", message: "اضغط زر «تفعيل التنبيهات» لتفعيلها" });
    return Promise.resolve().then(function () { return Notification.requestPermission(); }).then(function (p) {
      if (p !== "granted") {
        permCache = (p === "denied") ? "denied" : "default";
        setOn(false); paint();
        return { ok: false, code: p === "denied" ? "denied" : "dismissed", message: p === "denied" ? state().message : "لم يتم السماح بالتنبيهات — أعد المحاولة" };
      }
      permCache = "granted"; permWatch();
      setOn(true);
      return swReg().then(function () { return subscribePush(); }).catch(function () { return { ok: false }; }).then(function (ps) {
        start(); tick();
        paint();
        return { ok: true, push: !!(ps && ps.ok), saved: !!(ps && ps.saved), message: "تم التفعيل — سيصلك تنبيه قبل كل حصة بـ " + minsAr(leadMin()) };
      });
    }).catch(function (e) {
      setOn(false); paint();
      return { ok: false, code: "error", message: "تعذّر تفعيل التنبيهات على هذا الجهاز", error: String(e && e.message || e) };
    });
  }
  function disable() {
    setOn(false); stop();
    LS(function () { localStorage.removeItem("sijil.notify.ep"); });
    var done = function () { paint(); return { ok: true, message: "تم إيقاف التنبيهات" }; };
    if (!supported()) return Promise.resolve(done());
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg || !reg.pushManager) return null;
      return reg.pushManager.getSubscription().then(function (sub) { return sub ? sub.unsubscribe() : null; });
    }).catch(function () { return null; }).then(function () {
      var s = S(), te = teacher(), fdb = s && LS(function () { return s.fdb; }, null);
      if (fdb && te && te.id) { try { fdb.doc("push/" + te.id).delete().catch(function () { }); } catch (e) { } }
      return done();
    });
  }

  /* ═══ المؤقّت — يفحص ما دامت الصفحة مفتوحة ═══ */
  var tm = null;
  function stop() { if (tm) { clearTimeout(tm); tm = null; } }
  function start() { stop(); if (!isOn()) return; loop(); }
  function loop() { try { tick(); } catch (e) { } tm = setTimeout(loop, TICK_MS); }

  /* ═══ بطاقة جاهزة لتبويب «المزيد» ═══ */
  var host = null;
  function paint() {
    if (!host || !host.isConnected) { host = null; return; }
    var st = state(), can = st.supported && st.secure;
    var nx = LS(function () { return nextClass(); }, null);
    var line = nx ? ("القادمة اليوم: الحصة " + ord(nx.p) + (nx.cname ? " — " + nx.cname : "") + " بعد " + minsAr(nx.mins)) : "لا حصص متبقية لك اليوم";
    host.innerHTML =
      '<div class="card"><h3><span class="dot"></span>🔔 تنبيه قبل الحصة</h3>' +
      '<button class="btn-gold" id="nt-btn" style="width:100%' + (can ? "" : ";opacity:.55") + '"' + (can ? "" : " disabled") + '>' +
      (st.ready ? "🔕 إيقاف التنبيهات" : "🔔 تفعيل التنبيهات") + "</button>" +
      '<div class="empty-note" style="padding:10px 4px 0">' + esc(st.message) +
      (st.ready ? "<br>" + esc(line) : "") + "</div>" +
      '<div class="empty-note" id="nt-msg" style="padding:6px 4px 0;color:var(--gold)"></div></div>';
    var b = host.querySelector("#nt-btn");
    if (b) b.onclick = function () {
      b.disabled = true;
      (st.ready ? disable() : enable()).then(function (r) {
        paint();
        var m = host && host.querySelector("#nt-msg");
        if (m && r && r.message) m.textContent = r.message;
      });
    };
  }
  function mount(el) {
    host = (typeof el === "string") ? document.querySelector(el) : el;
    if (!host) return null;
    permWatch(); paint();
    return host;
  }

  /* ═══ إقلاع صامت: لا إذن ولا نافذة — فقط استئناف المؤقّت لمن فعّل سابقاً ═══ */
  function boot() {
    if (!supported()) return;
    permWatch();
    LS(function () {
      document.addEventListener("visibilitychange", function () { if (!document.hidden) { try { tick(); } catch (e) { } } });
    });
    if (isOn() && perm() === "granted") start();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else setTimeout(boot, 0);

  window.SIJIL_NOTIFY = {
    supported: supported, state: state, enable: enable, disable: disable,
    tick: tick, nextClass: nextClass, subscribePush: subscribePush, mount: mount,
    VAPID: VAPID, leadMin: leadMin, refresh: paint
  };
})();
