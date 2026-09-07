/* ═══════════════════════════════════════════════════════════════════════════════
   سجلي — مولّد ملف التقويم (.ics) لجدول حصص المعلم
   ───────────────────────────────────────────────────────────────────────────────
   يحوّل جدول المعلم (SIJIL.D.schedule) إلى ملف تقويم قياسي RFC 5545 يفتحه تقويم
   الجوال (آيفون/أندرويد/جوجل/أوتلوك) فيصير لكل حصة موعد أسبوعي متكرر مع تنبيه.

   الواجهة:
     window.SIJIL_ICS.build(tid, opts)        → نص الملف (سلسلة نصية)
     window.SIJIL_ICS.download(tid, opts)     → ينزّل الملف ويعيد {name, count, bytes, skipped, skippedRows}
     window.SIJIL_ICS.fingerprint(tid)        → بصمة ثابتة 16 خانة تتغيّر إذا تغيّر الجدول
     window.SIJIL_ICS.plan(tid, opts)         → (للفحص) قائمة المواعيد قبل التحويل

   tid: رقم المعلم ("t11") أو اسمه أو كائن المعلم، وإن تُرك فارغاً فالمعلم الحالي SIJIL.TE.
   opts: { alarm: 5|10|15 , from: "YYYY-MM-DD" , until: "YYYY-MM-DD" }
   المهلة: مصدرها الوحيد خيار المعلم المحفوظ sijil.notify.lead (تكتبه بطاقة «المزيد»)، ويُقرأ
   لحظة البناء لا لحظة رسم البطاقة، فلا يخرج الملف بمهلة قديمة. opts.alarm احتياطي حين لا خيار.

   هوية الموعد (UID): المعلم + رقم الحصة + الفصل فقط — بلا وقت وبلا أيام. تغيير أوقات الأجراس
   أو نقل الحصة إلى يوم آخر يُحدِّث الموعد القائم في تقويم المعلم (مع SEQUENCE) بدل تكراره.

   الإجازات: أسابيع الفصل في meta.weeks بها فجوات (إجازة منتصف الفصل، رمضان، العيدان)، فتُكتب
   EXDATE لكل يوم دراسي يقع خارجها حتى لا يرنّ الجوال في يوم عطلة.

   الأوقات: من محرك الأجراس SIJIL_ADMIN.periodsOnly/periodsOf — وإن لم تُحمّل لوحة
   المدير فالافتراضي التاريخي: بداية 7:00 · حصة 45 دقيقة · 7 حصص · فسحة 30 دقيقة
   بعد الحصة الثالثة. لا يحسب هذا الملف أي وقت بنفسه خارج هذا الحارس.

   المنطقة الزمنية: Asia/Riyadh بإزاحة ثابتة +03:00 بلا توقيت صيفي، وتُكتب VTIMEZONE
   كاملة داخل الملف حتى يعرض التقويم الوقت صحيحاً ولو كان الجهاز في بلد آخر.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const S = () => window.SIJIL || null;
  const A = () => window.SIJIL_ADMIN || null;

  /* ═══ أيام الأسبوع ═══ */
  const DAYS_DEF = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];   // نفس ترتيب Date.getDay()
  const days = () => { const s = S(); return (s && s.DAYS && s.DAYS.length === 7) ? s.DAYS : DAYS_DEF; };

  const ORD_DEF = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية عشرة", "الثانية عشرة"];
  function ord(p) {
    const a = A();
    if (a && typeof a.ord === "function") { try { const r = a.ord(p); if (r) return r; } catch (e) { } }
    return ORD_DEF[p] || String(p);
  }

  /* ═══ أوقات الحصص: محرك الأجراس أولاً، ثم الافتراضي التاريخي ═══ */
  const FB = { start: 420, len: 45, n: 7, brkAfter: 3, brkMin: 30 };   // 7:00 · 45د · 7 حصص · فسحة 30د بعد الثالثة
  function fallbackPeriods() {
    const out = []; let t = FB.start;
    for (let p = 1; p <= FB.n; p++) {
      out.push({ p, from: t, to: t + FB.len }); t += FB.len;
      if (p === FB.brkAfter && p < FB.n) t += FB.brkMin;
    }
    return out;
  }
  function periodsOnly(day) {
    const a = A();
    if (a && typeof a.periodsOnly === "function") {
      try { const r = a.periodsOnly(day); if (Array.isArray(r) && r.length) return r; } catch (e) { }
    }
    if (a && typeof a.periodsOf === "function") {
      try { const r = a.periodsOf(day); if (Array.isArray(r) && r.length) return r.filter(x => !x.brk); } catch (e) { }
    }
    return fallbackPeriods();
  }
  const slotOf = (p, day) => periodsOnly(day).find(x => +x.p === +p) || null;
  // هل جاءت الأوقات من محرك الأجراس فعلاً؟ (يظهر في تقرير الفحص فقط)
  function bellReady() { const a = A(); return !!(a && (typeof a.periodsOnly === "function" || typeof a.periodsOf === "function")); }

  /* ═══ التاريخ: هجري → ميلادي ═══
     تواريخ الأسابيع في meta.weeks هجرية "يوم/شهر/سنة". نحوّلها بتقدير أولي بمتوسط
     طول السنة والشهر ثم مسح ±40 يوماً حول التقدير بمقارنة تقويم أم القرى نفسه،
     فلا يوجد جدول تحويل مضمّن ولا فارق بين نسخ المتصفحات. */
  let HF = null;
  function hnumOf(dt) {
    if (!HF) HF = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
    const p = {}; HF.formatToParts(dt).forEach(x => p[x.type] = x.value);
    return (+p.year) * 10000 + (+p.month) * 100 + (+p.day);
  }
  function fromHijri(str) {
    const a = String(str == null ? "" : str).trim().split("/");
    if (a.length !== 3) return null;
    const hd = +a[0], hm = +a[1], hy = +a[2];
    if (!(hd >= 1 && hd <= 30) || !(hm >= 1 && hm <= 12) || !(hy > 1000 && hy < 2000)) return null;
    const target = hy * 10000 + hm * 100 + hd;
    const est = Math.round((hy - 1) * 354.367 + (hm - 1) * 29.5306 + hd - 492149);   // أيام تقريبية منذ 1970-01-01
    for (let k = 0; k <= 40; k++) {
      const tries = k ? [-k, k] : [0];
      for (let i = 0; i < tries.length; i++) {
        const d = new Date((est + tries[i]) * 864e5);
        try { if (hnumOf(d) === target) return d; } catch (e) { return null; }
      }
    }
    return null;
  }
  const utcDay = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const todayUTC = () => utcDay(new Date());
  function fromISO(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str == null ? "" : str).trim());
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return isFinite(d.getTime()) ? d : null;
  }
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  /* وقت محلي بلا Z (مع TZID). الدقيقة تتجاوز 1440 حين ينتهي يوم الدوام عند منتصف الليل أو
     بعده (إعداد أجراس قديم أو مكتوب من جهة أخرى): كان `% 24` يلفّ الساعة على التاريخ نفسه
     فتخرج حصةُ آخرِ اليوم بـ DTEND (00:00) أبكرَ من DTSTART (22:00) — VEVENT مخالف لـ RFC 5545
     تُسقطه تطبيقات التقويم أو ترفض معه الملف كلَّه. الصواب تقديم التاريخ يوماً لكل 1440 دقيقة. */
  const localAt = (d, min) => {
    const t = Math.max(0, Math.round(min)), over = Math.floor(t / 1440), r = t % 1440;
    const dd = over ? new Date(d.getTime() + over * 86400000) : d;
    return `${ymd(dd)}T${pad(Math.floor(r / 60))}${pad(r % 60)}00`;
  };
  // UNTIL يجب أن يكون بتوقيت UTC: نهاية آخر يوم في الرياض 23:59:59+03:00 = 20:59:59Z من اليوم نفسه
  const untilUTC = (d) => `${ymd(d)}T205959Z`;
  function stampUTC(t) {
    const d = t ? new Date(t) : new Date();
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  }

  /* ═══ طي الأسطر عند 75 بايت (UTF-8) بلا شطر حرف عربي إلى نصفين ═══
     RFC 5545: السطر لا يتجاوز 75 ثمانية، والسطر التالي يبدأ بمسافة واحدة تُحسب ضمن الـ75.
     نمشي بالأحرف الكاملة (for…of) لا بوحدات UTF-16، فلا ينكسر أي رمز مركّب. */
  function u8(ch) { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  function fold(line) {
    const out = []; let cur = "", n = 0;
    for (const ch of String(line)) {
      const w = u8(ch);
      if (n + w > 75) { out.push(cur); cur = " "; n = 1; }
      cur += ch; n += w;
    }
    out.push(cur);
    return out.join("\r\n");
  }
  /* هروب نصوص RFC 5545: الشرطة المائلة أولاً ثم الفاصلة المنقوطة والفاصلة والسطر الجديد */
  const T = (s) => String(s == null ? "" : s)
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");

  /* ═══ بصمة ثابتة (لا تعتمد على تاريخ اليوم) ═══ */
  function hash16(str) {
    let h1 = 0x811c9dc5 >>> 0, h2 = 0x01000193 >>> 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = (Math.imul(h2 ^ (h2 >>> 13), 2246822519) + c) >>> 0;
    }
    return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
  }

  /* ═══ قراءة الحالة ═══ */
  function teacherOf(tid) {
    const s = S(); if (!s) return null;
    if (tid && typeof tid === "object") return tid;
    const list = (s.D && s.D.teachers) || [];
    if (tid == null || tid === "") return s.TE || null;
    const k = String(tid);
    return list.find(t => t && t.id === k) || list.find(t => t && t.name === k) || null;
  }
  function classOf(cid) {
    const s = S(); if (!s) return null;
    if (typeof s.classById === "function") { try { const c = s.classById(cid); if (c) return c; } catch (e) { } }
    return ((s.D && s.D.classes) || []).find(c => c && c.id === cid) || null;
  }
  function countOf(c) {
    const s = S();
    if (c && s && typeof s.activeCount === "function") { try { const n = s.activeCount(c); if (isFinite(n)) return n; } catch (e) { } }
    return c && Array.isArray(c.students) ? c.students.filter(x => x && !x.moved && !x.gap).length : 0;
  }
  const schoolName = () => { const s = S(); const m = (s && (s.META || (s.D && s.D.meta))) || {}; return (m.school && m.school.name) || "المدرسة"; };
  const termLbl = () => { const s = S(); const m = (s && (s.META || (s.D && s.D.meta))) || {}; return (m.school && m.school.term_lbl) || ""; };
  function termWeeks() {
    const s = S(); const m = (s && (s.META || (s.D && s.D.meta))) || {};
    const t = (s && s.TERM) || (String((m.school && m.school.term_lbl) || "").includes("الثاني") ? "t2" : "t1");
    const w = (m.weeks || {})[t];
    return Array.isArray(w) && w.length ? w : [];
  }

  /* ═══ مدد الأسابيع الدراسية ميلادياً — ما بينها إجازة لا حصص فيها ═══
     تُحسب مرة واحدة لكل نداء build لأن fromHijri مسح تقويمي لا نداء رخيص. */
  function termSpans() {
    const out = [];
    termWeeks().forEach(w => {
      const a = fromHijri(w && w.from), b = fromHijri(w && w.to);
      if (a && b && b.getTime() >= a.getTime()) out.push([a.getTime(), b.getTime()]);
    });
    return out;
  }

  /* ═══ المدى الزمني: من بداية الفصل (أو اليوم إن كنا داخله) إلى آخر أسبوع فيه ═══ */
  function range(opts) {
    opts = opts || {};
    const wks = termWeeks();
    let from = wks.length ? fromHijri(wks[0].from) : null;
    let to = wks.length ? fromHijri(wks[wks.length - 1].to) : null;
    const t0 = todayUTC();
    if (!from) from = t0;
    if (!to || to.getTime() <= from.getTime()) to = new Date(from.getTime() + 120 * 864e5);
    if (t0.getTime() > from.getTime() && t0.getTime() <= to.getTime()) from = t0;   // استيراد في منتصف الفصل: لا نملأ التقويم بحصص ماضية
    const of = fromISO(opts.from); if (of) from = of;
    const ou = fromISO(opts.until); if (ou) to = ou;
    if (to.getTime() < from.getTime()) to = new Date(from.getTime() + 6 * 864e5);
    return { from, to };
  }

  const ALARMS = [5, 10, 15];
  const LEAD_KEY = "sijil.notify.lead";                                              // خيار المعلم — يكتبه تبويب «المزيد» ويقرؤه js/notify.js
  function storedLead() {
    try { const v = +localStorage.getItem(LEAD_KEY); return ALARMS.indexOf(v) > -1 ? v : null; } catch (e) { return null; }
  }
  function nearest(v) { return ALARMS.reduce((b, x) => Math.abs(x - v) < Math.abs(b - v) ? x : b, 10); }
  /* المهلة: خيار المعلم المحفوظ هو المصدر — يُقرأ الآن لا حين رُسمت البطاقة، فزرّ التقويم
     بعد تغيير القائمة مباشرةً يُخرج الملف بالمهلة الجديدة. opts.alarm احتياطي حين لا خيار محفوظ. */
  function alarmOf(opts) {
    const live = storedLead();
    if (live != null) return live;
    const raw = (opts || {}).alarm;
    if (raw == null || raw === "") return 10;                                        // لا خيار ولا وسيط → 10 دقائق
    const v = Math.round(Number(raw));
    if (!isFinite(v)) return 10;
    return ALARMS.indexOf(v) > -1 ? v : nearest(v);                                  // أي رقم آخر → أقرب خيار مسموح
  }

  /* ═══ تجميع الحصص: كل (حصة + فصل + وقت) موعد واحد يتكرر في أيامه ═══
     التجميع يشمل الوقت في المفتاح لأن محرك الأجراس قد يعطي اليوم الواحد بداية أو
     مدة مختلفة (إعداد days في cfg/bell)، فلا تُدمج أوقات متباينة في تكرار واحد. */
  function plan(tid, opts) {
    const s = S(), te = teacherOf(tid);
    if (!s || !te) return { teacher: null, groups: [], rows: 0, skipped: 0, skippedRows: [], range: range(opts), alarm: alarmOf(opts), bell: bellReady() };
    const DL = days(), rows = ((s.D && s.D.schedule) || []).filter(r => r && r.t === te.name);
    const map = new Map(), skippedRows = [];
    rows.forEach(r => {
      const di = DL.indexOf(r.d), b = slotOf(r.p, r.d);
      // حصة برقم يتجاوز حصص ذلك اليوم في جدول الأجراس: لا وقت لها فلا موعد — تُسجَّل ليُخبَر المعلم
      if (di < 0 || !b || !(b.to > b.from)) {
        const c0 = classOf(r.c);
        skippedRows.push({ p: +r.p, day: r.d, cid: r.c, cname: (c0 && c0.name) || r.c });
        return;
      }
      const key = `${+r.p}|${r.c}|${b.from}|${b.to}`;
      let g = map.get(key);
      if (!g) { g = { p: +r.p, cid: r.c, from: b.from, to: b.to, days: [] }; map.set(key, g); }
      if (g.days.indexOf(di) < 0) g.days.push(di);
    });
    const groups = Array.from(map.values());
    groups.forEach(g => {
      g.days.sort((a, b) => a - b);
      const c = classOf(g.cid);
      g.cname = (c && c.name) || g.cid;
      g.n = countOf(c);
      g.byday = g.days.map(i => BYDAY[i]);
      g.dnames = g.days.map(i => DL[i]);
      g.title = `الحصة ${ord(g.p)} — ${g.cname}`;
    });
    groups.sort((a, b) => (a.days[0] - b.days[0]) || (a.p - b.p) || String(a.cid).localeCompare(String(b.cid)));
    /* هوية الموعد: رقم الحصة + الفصل. لا وقت فيها (فتغيير الأجراس يُحدِّث لا يُكرّر) ولا أيام
       (فنقل الحصة إلى يوم آخر يُحدِّث كذلك). وحين يُقسّم محرك الأجراس الحصةَ الواحدة إلى
       مجموعتين بأوقات مختلفة (إعداد days) نضيف الأيام للتمييز — وإلا تصادمت الهويتان. */
    const dup = new Map();
    groups.forEach(g => { const k = g.p + "|" + g.cid; dup.set(k, (dup.get(k) || 0) + 1); });
    groups.forEach(g => {
      const cid = String(g.cid).replace(/[^A-Za-z0-9_-]/g, "") || "c";
      g.ukey = `p${g.p}-${cid}` + (dup.get(g.p + "|" + g.cid) > 1 ? "-" + g.byday.join("") : "");
    });
    return { teacher: te, groups, rows: rows.length, skipped: skippedRows.length, skippedRows, range: range(opts), alarm: alarmOf(opts), bell: bellReady() };
  }

  /* ═══ بناء نص الملف ═══ */
  function build(tid, opts) {
    const P = plan(tid, opts), te = P.teacher;
    const L = [];
    L.push("BEGIN:VCALENDAR");
    L.push("VERSION:2.0");
    L.push("PRODID:-//ERIHDEV//Sijil Student Tracker//AR");
    L.push("CALSCALE:GREGORIAN");
    L.push("X-WR-CALNAME:" + T("حصص " + ((te && te.name) || "") + (termLbl() ? " — " + termLbl() : "")));
    L.push("X-WR-CALDESC:" + T(schoolName() + (te && te.subject ? " — " + te.subject : "")));
    L.push("X-WR-TIMEZONE:Asia/Riyadh");
    // الرياض +03:00 ثابتة بلا توقيت صيفي — تعريف واحد سارٍ من 1970
    L.push("BEGIN:VTIMEZONE");
    L.push("TZID:Asia/Riyadh");
    L.push("X-LIC-LOCATION:Asia/Riyadh");
    L.push("BEGIN:STANDARD");
    L.push("TZOFFSETFROM:+0300");
    L.push("TZOFFSETTO:+0300");
    L.push("TZNAME:+03");
    L.push("DTSTART:19700101T000000");
    L.push("END:STANDARD");
    L.push("END:VTIMEZONE");

    const stamp = stampUTC();
    const seq = Math.floor(Date.now() / 864e5);          // يزيد يومياً: إعادة الاستيراد تحدّث الموعد بدل تكراره
    const until = untilUTC(P.range.to);
    const loc = schoolName(), subj = (te && te.subject) || "";
    const tkey = String((te && te.id) || (te && te.name) || "t").replace(/[^A-Za-z0-9_-]/g, "") || "t";

    const spans = termSpans();
    const inTerm = (t) => !spans.length || spans.some(sp => t >= sp[0] && t <= sp[1]);

    P.groups.forEach(g => {
      // كل أيام هذه الحصة داخل المدى، ثم أولها الواقع في أسبوع دراسي = DTSTART
      const occ = [];
      for (let t = P.range.from.getTime(); t <= P.range.to.getTime(); t += 864e5) {
        if (g.days.indexOf(new Date(t).getUTCDay()) > -1) occ.push(t);
      }
      let i0 = 0;
      while (i0 < occ.length && !inTerm(occ[i0])) i0++;
      if (i0 >= occ.length) return;                       // لا يوم دراسياً لهذه الحصة داخل المدى
      const d0 = new Date(occ[i0]);
      // ما بقي خارج الأسابيع الدراسية (إجازة منتصف الفصل، رمضان، العيدان) يُستثنى من التكرار
      const ex = [];
      for (let k = i0 + 1; k < occ.length; k++) if (!inTerm(occ[k])) ex.push(localAt(new Date(occ[k]), g.from));

      const uid = `sijil-${tkey}-${g.ukey}@sijil.erihdev.com`;
      L.push("BEGIN:VEVENT");
      L.push("UID:" + uid);
      L.push("DTSTAMP:" + stamp);
      L.push("SEQUENCE:" + seq);
      L.push("DTSTART;TZID=Asia/Riyadh:" + localAt(d0, g.from));
      L.push("DTEND;TZID=Asia/Riyadh:" + localAt(d0, g.to));
      L.push("RRULE:FREQ=WEEKLY;BYDAY=" + g.byday.join(",") + ";UNTIL=" + until);
      if (ex.length) L.push("EXDATE;TZID=Asia/Riyadh:" + ex.join(","));
      L.push("SUMMARY:" + T(g.title));
      L.push("LOCATION:" + T(loc));
      L.push("DESCRIPTION:" + T("المادة: " + (subj || "—") + "\nعدد الطلاب: " + g.n));
      L.push("TRANSP:OPAQUE");
      L.push("STATUS:CONFIRMED");
      L.push("BEGIN:VALARM");
      L.push("ACTION:DISPLAY");
      L.push("TRIGGER:-PT" + P.alarm + "M");
      L.push("DESCRIPTION:" + T(g.title));
      L.push("END:VALARM");
      L.push("END:VEVENT");
    });

    L.push("END:VCALENDAR");
    return L.map(fold).join("\r\n") + "\r\n";
  }

  /* ═══ بصمة الجدول: تتغيّر متى تغيّر جدول المعلم أو أوقات الأجراس أو مدى الفصل ═══
     ولا تتغيّر بنقل طالب أو إضافته: عدد الطلاب سطرٌ في وصف الموعد لا في الجدول، وإدخاله هنا
     كان يُطلق لافتة «تغيّر جدولك» على كل المعلمين مع كل حركة نقل. */
  function fingerprint(tid) {
    const s = S(), te = teacherOf(tid);
    if (!s || !te) return "0000000000000000";
    const DL = days(), rows = ((s.D && s.D.schedule) || []).filter(r => r && r.t === te.name);
    const key = rows.map(r => `${DL.indexOf(r.d)}:${+r.p}:${r.c}`).sort().join(",");
    const usedDays = Array.from(new Set(rows.map(r => r.d))).sort();
    const times = usedDays.map(d => d + "=" + periodsOnly(d).map(b => b.p + "@" + b.from + "-" + b.to).join("/")).join(";");
    const names = Array.from(new Set(rows.map(r => r.c))).sort().map(cid => { const c = classOf(cid); return cid + ":" + ((c && c.name) || ""); }).join(",");
    const wks = termWeeks(), span = wks.map(w => w.from + ">" + w.to).join("~") || "-";
    return hash16([te.id || "", te.name || "", te.subject || "", schoolName(), termLbl(), span, key, times, names].join("|"));
  }

  /* ═══ التنزيل ═══ */
  // نصّ عربي جاهز للعرض عن الحصص التي لا وقت لها في جدول الأجراس (تظهر «بلا وقت» في بقية الشاشات)
  function skippedNote(rowsOut) {
    const a = rowsOut || [];
    if (!a.length) return "";
    const one = (r) => `${ord(r.p)} — ${r.cname} (${r.day})`;
    const n = a.length === 1 ? "حصة واحدة" : a.length === 2 ? "حصتان" : (a.length <= 10 ? a.length + " حصص" : a.length + " حصة");
    return `⚠️ لم تُضَف ${n} إلى التقويم لأن رقمها خارج عدد حصص ذلك اليوم في جدول الأجراس: ${a.map(one).join("، ")} — راجع المدير.`;
  }

  function download(tid, opts) {
    const te = teacherOf(tid), P = plan(tid, opts), text = build(tid, opts);
    const count = (text.match(/BEGIN:VEVENT/g) || []).length;
    const name = `حصص ${(te && te.name) || "المعلم"}${termLbl() ? " - " + termLbl() : ""}.ics`;
    const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) { } }, 4000);
    return {
      name, count, bytes: blob.size, text, alarm: P.alarm,
      skipped: P.skipped, skippedRows: P.skippedRows, skippedNote: skippedNote(P.skippedRows)
    };
  }

  /* مفتاح تخزين البصمة — لكل معلم على حدة: لافتة «تغيّر جدولك» تخصّ من نزّل الملف، فلا يراها
     زميله على الجهاز نفسه وهو لم ينزّل شيئاً قط. */
  function fpKey(tid) {
    const te = teacherOf(tid), k = String((te && te.id) || (te && te.name) || "").replace(/[^A-Za-z0-9_-]/g, "");
    return "sijil.ics.fp" + (k ? "." + k : "");
  }

  window.SIJIL_ICS = { build, download, fingerprint, fpKey, plan, fold, fromHijri, periodsOnly, skippedNote };
})();
