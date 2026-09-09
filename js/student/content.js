/* ═══════════════════════════════════════════════════════════════════════════════════════
   سجلي — بوابة الطالب: محتوى التبويبات (موادي · مهامي · دروسي · شهادتي) + التدرّب والشارات
   ───────────────────────────────────────────────────────────────────────────────────────
   يُحمَّل من s/index.html **بعد** النواة، فـwindow.SIJIL_STUDENT جاهزة عند تنفيذه. النواة
   تملك الدخول والجلسة وشريط التبويبات وتبويب «بطاقتي»، وهذا الملف يملأ الأربعة الباقية
   ويغذّي ثلاث شرائح داخل «بطاقتي»: سطر «مهامي اليوم» (today) والشارات (badges) وشريحة
   التقدّم وزر «لوالديّ» (extra).

   ﴿قاعدة﴾ البوابة **قراءة فقط**: لا يكتب هذا الملف أي بيان تعليمي إطلاقاً — لا رصداً ولا
   درجة ولا تسليماً ولا نقطة. وألعاب «تدرّب» بلا رصد ولا نقاط رسمية، ونتيجتها لا تغادر الشاشة.
   والكتابة الوحيدة هنا زرعُ بياناتٍ وهمية في **الوضع التجريبي وحده** داخل مخزن المتصفح
   (كما تفعل demoSeed في النواة حرفاً بحرف)، ولا تعمل سطراً واحداً على السحابة.

   ﴿الواجهة المعلنة﴾ ST.tab · ST.badges · ST.today · ST.extra · ST.S · ST.D · ST.fdoc …
   (انظر رأس النواة في s/index.html).

   ﴿مصدر «مهامي»﴾ سرد assign ممنوع لغير جلسة معلم (firestore.rules)، وفتحه يسلّم الطفل
   مفاتيح إجابات كل الاختبارات (qs[].correct وqs[].ans داخل المستند نفسه). فالمصدر هنا
   فهرسٌ **بلا أسئلة**:
       assignidx/{cid} = { list:[{a,t,due,tid,mode,n,wk,code,tries,ts}], tn, ts }
   وقاعدته منشورة (get لأي مصادَق · list لمن أثبت رقم معلم · الكتابة لمن أثبت رقم معلم،
   والقائمة تنمو ولا تنقص). يكتبه المعلم لحظة إرسال الورقة — انظر «طلب دمج» في التقرير.
   وحتى يُدمج ذلك: كل ورقة يفتحها الطفل من رابط معلمه تُسجَّل في مخزن متصفحه من w/index.html
   (المفتاح sijil.s.seen على الأصل نفسه)، فتظهر في «مهامي» بحالتها ونتيجتها من يومها.
   ═══════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var ST = window.SIJIL_STUDENT;
  if (!ST) return;                 // حُمّل خارج البوابة — لا شيء يُفعل

  var esc = ST.esc;
  var SEEN = "sijil.s.seen";       // أوراق فتحها الطفل من رابط معلمه (يكتبها w/index.html)

  /* ═══ ثوابت المواد ═══ */
  var SUBJ_CODE = [["رقمية", "dg"], ["رياضيات", "ma"], ["عربية", "ar"], ["نجليزية", "en"], ["علوم", "sc"],
  ["إسلامية", "is"], ["قرآن", "qu"], ["اجتماعية", "so"], ["فنية", "rt"], ["بدنية", "pe"], ["حياتية", "lf"]];
  function subjCode(s) { s = String(s || ""); for (var i = 0; i < SUBJ_CODE.length; i++) if (s.indexOf(SUBJ_CODE[i][0]) >= 0) return SUBJ_CODE[i][1]; return ""; }
  // لون وأيقونة لكل مادة — ولا أحمر في القائمة كلها
  var TH = {
    dg: { e: "💻", c: "#2F86C9" }, ma: { e: "➗", c: "#8B5CF6" }, ar: { e: "📖", c: "#35B37E" },
    en: { e: "🔤", c: "#E07B3E" }, sc: { e: "🔬", c: "#2E9E5B" }, is: { e: "🕌", c: "#1E7A45" },
    qu: { e: "📿", c: "#0E7C66" }, so: { e: "🗺️", c: "#B8862B" }, rt: { e: "🎨", c: "#C4569B" },
    pe: { e: "⚽", c: "#3DA5D9" }, lf: { e: "🏡", c: "#C06C2E" }, "": { e: "📘", c: "#193A5B" }
  };
  function th(code) { return TH[code] || TH[""]; }

  // بنود التقييم: نسخة عن js/app.js:DEFAULT_ASSESS (لا يُستورد الملف — البوابة لا تحمّل شيئاً من واجهة المعلم)
  var DEFAULT_ASSESS = [
    { k: "part", n: "الحضور والمشاركة", max: 15 },
    { k: "sheets", n: "أوراق العمل والواجبات", max: 10 },
    { k: "behave", n: "السلوك والالتزام", max: 15 },
    { k: "q1", n: "اختبار قصير 1", max: 15 },
    { k: "q2", n: "اختبار قصير 2", max: 15 },
    { k: "p1", n: "تطبيق عملي 1", max: 15 },
    { k: "p2", n: "تطبيق عملي 2", max: 15 }
  ];
  function ASSESS() { var m = ST.META || {}; return (m.assess && m.assess.length) ? m.assess : DEFAULT_ASSESS; }
  function TERM() { var sc = (ST.META || {}).school || {}; return String(sc.term_lbl || "").indexOf("الثاني") >= 0 ? "t2" : "t1"; }

  /* ═══ أدوات صغيرة ═══ */
  function r1(n) { return Math.round((+n || 0) * 10) / 10; }
  function byId(root, id) { return root ? root.querySelector(id) : null; }
  function each(root, sel, fn) { if (!root) return; [].slice.call(root.querySelectorAll(sel)).forEach(fn); }
  // مسار أصل الموقع من داخل s/ — صور الدروس وملفاتها مكتوبة بمسارات من الجذر
  function url(p) { p = String(p || ""); return (/^(https?:|data:|blob:|\/)/.test(p)) ? p : "../" + p; }
  function hijri(dt) {
    try { return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }).format(dt || new Date()); }
    catch (e) { return ""; }
  }
  function hParts(dt) {
    try {
      var f = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric" }), p = {};
      f.formatToParts(dt || new Date()).forEach(function (x) { p[x.type] = x.value; });
      return { d: +p.day, m: +p.month, y: +p.year };
    } catch (e) { return { d: 1, m: 1, y: 1448 }; }
  }
  function hnum(h) { return h.y * 10000 + h.m * 100 + h.d; }
  function parseH(s) { var p = String(s || "").split("/"); return p.length === 3 ? (+p[2]) * 10000 + (+p[1]) * 100 + (+p[0]) : 0; }
  // الأسبوع الدراسي الحالي — منقول عن js/app.js:curWeek
  function curWeek() {
    var t = hnum(hParts()), best = 1, list = ((ST.META || {}).weeks || {})[TERM()] || [];
    for (var i = 0; i < list.length; i++) {
      var a = parseH(list[i].from), b = parseH(list[i].to);
      if (a && a <= t) best = list[i].w;
      if (a && b && a <= t && t <= b) return list[i].w;
    }
    return best;
  }
  // أسبوع تاريخ ميلادي بحسب جدول الأسابيع (لرسم التقدّم)
  function weekOfDate(iso) {
    var p = String(iso || "").split("-"); if (p.length !== 3) return 0;
    var t = hnum(hParts(new Date(+p[0], +p[1] - 1, +p[2]))), list = ((ST.META || {}).weeks || {})[TERM()] || [];
    for (var i = 0; i < list.length; i++) { var a = parseH(list[i].from), b = parseH(list[i].to); if (a && b && a <= t && t <= b) return list[i].w; }
    return 0;
  }
  function levelOf(pct) {
    if (pct >= 90) return { i: 0, t: "ممتاز", c: "#2e9e5b" };
    if (pct >= 75) return { i: 1, t: "جيد جداً", c: "#2F86C9" };
    if (pct >= 60) return { i: 2, t: "جيد", c: "#B8862B" };
    if (pct >= 50) return { i: 3, t: "مقبول", c: "#E07B3E" };
    return { i: 4, t: "دون المطلوب", c: "#C06C2E" };
  }
  /* الكلمة التي يقرؤها الطفل: الحساب نفسه حرفاً بحرف، والكلمة الأدنى وحدها تُلطَّف —
     «دون المطلوب» على شاشة طفل في العاشرة رسالةُ إحباط لا رسالةُ نموّ. وولي أمره يقرأ
     الكلمة الرسمية كما هي في ملخّص «لوالديّ». */
  function levelKid(lv) { return lv.i === 4 ? "تقدر ترفعها 🌱" : lv.t; }
  // العربية لا تكرّر العدد مع المثنّى: «ورقتان» لا «2 ورقتان»
  function papersWord(n) {
    if (n === 1) return "ورقة واحدة";
    if (n === 2) return "ورقتان";
    if (n <= 10) return n + " أوراق";
    return n + " ورقة";
  }
  function othersWord(n) {
    if (n === 1) return "واحدة";
    if (n === 2) return "اثنتان";
    return String(n);
  }
  function daysWord(n) {
    n = Math.abs(n | 0);
    if (n === 1) return "يوم واحد";
    if (n === 2) return "يومان";
    if (n <= 10) return n + " أيام";
    return n + " يوماً";
  }
  function confetti() {
    var C = ["#D7A93F", "#35B37E", "#3DA5D9", "#8B5CF6", "#FFC53D", "#FF8A5B"];
    for (var i = 0; i < 22; i++) {
      var d = document.createElement("div");
      d.className = "cfti";
      d.style.left = Math.random() * 96 + "vw";
      d.style.background = C[i % C.length];
      d.style.animationDelay = (Math.random() * 0.35) + "s";
      document.body.appendChild(d);
      (function (x) { setTimeout(function () { try { document.body.removeChild(x); } catch (e) { } }, 2100); })(d);
    }
  }

  /* ═══ ذاكرة القراءات: كل مستند يُقرأ مرة واحدة في الجلسة ═══ */
  var C = { grades: null, tasks: null, subs: {}, fidx: {}, curr: {}, yt: {}, lesson: {} };
  var RECS = null;

  /* كل قراءة تمرّ على «جاهزية الوضع التجريبي» أولاً: سحابياً لا شيء، وتجريبياً تُزرع بيانات
     الفصل الوهمية مرة واحدة قبل أول قراءة (لا يمكن زرعها عند تحميل الملف لأن الفصول لم تصل بعد). */
  function safeDoc(path) {
    return demoReady()
      .then(function () { return ST.fdoc(path); })
      .then(function (s) { return (s && s.exists) ? (s.data() || {}) : null; }, function () { return null; });
  }

  // درجات كل معلم: grades/{tid}_{cid} = { g: { si: {…} } } — بالقراءة نفسها سحابياً وتجريبياً
  function loadGrades() {
    if (C.grades) return Promise.resolve(C.grades);
    var list = ST.myTeachers(), cid = ST.S.cid;
    return Promise.all(list.map(function (t) { return safeDoc("grades/" + t.id + "_" + cid); })).then(function (rows) {
      var out = {}, si = ST.S.si;
      // «اقرأ ثم انسَ»: مستند الدرجات يحمل الفصل كله، ولا يُحفظ منه إلا صفّ الطالب نفسه
      rows.forEach(function (d, k) {
        if (!d) return;
        var mine = (d.g || {})[si], one = {};
        if (mine != null) one[si] = mine;
        out[list[k].id] = one;
      });
      C.grades = out; return out;
    });
  }

  /* ═══ حساب المواد ═══ */
  function recsOf(tid) { return (RECS || {})[tid] || {}; }
  function calcT(tid) { return ST.calcOne(recsOf(tid), ST.S.si); }
  function stIdx(name) { var S = ST.STATES || []; for (var i = 0; i < S.length; i++) if (String(S[i].name || "").indexOf(name) >= 0) return i; return -1; }
  function stCnt(t, name) { var k = stIdx(name); return k >= 0 ? (t.st[k] || 0) : 0; }

  /* الدرجة التلقائية — منقولة عن js/app.js:autoGrade بمقاماتها نفسها.
     بند «الأوراق» يجمع الواجبات اليدوية مع الأوراق التفاعلية المعروفة لنا (تسليمات قرأناها
     بمعرّفها)؛ وسردُ subs ممنوع على الطالب، فما لم نعرف ورقةً لم تدخل الحساب — تماماً كما
     لا تدخل عند المعلم قبل أن تصله. */
  function autoGrade(tid) {
    var t = calcT(tid), v = {}, why = {}, A = ASSESS(), BEH = ST.BEH || [];
    var find = function (k) { for (var i = 0; i < A.length; i++) if (A[i].k === k) return A[i]; return null; };
    var stD = t.st.reduce(function (x, y) { return x + y; }, 0);
    var excD = stCnt(t, "مستأذن") + stCnt(t, "بعذر");
    var noSt = t.days - stD, denom = stD - excD;
    if (t.days && find("part") && denom > 0) {
      var pres = stCnt(t, "حاضر"), late = stCnt(t, "متأخر"), remote = stCnt(t, "عن بعد");
      var attended = pres + remote + 0.5 * late, presD = pres + remote + late;
      var attRate = Math.min(1, attended / denom), partRate = presD ? Math.min(1, t.part / presD) : 0;
      var mx = find("part").max;
      v.part = r1(mx * 0.6 * attRate + mx * 0.4 * partRate);
      var skip = [excD ? "استُثني " + excD + " بعذر" : "", noSt ? noSt + " بلا حالة حضور" : ""].filter(Boolean);
      why.part = "حضور " + Math.round(attRate * 100) + "% + مشاركة " + Math.round(partRate * 100) + "%" + (skip.length ? " (" + skip.join(" و") + ")" : "");
    }
    if (t.days && find("behave") && (denom > 0 || t.behP || t.behN)) {
      var sum = 0, cd = recsOf(tid), si = ST.S.si;
      Object.keys(cd).forEach(function (date) {
        var e = (cd[date] || {})[si]; if (!e) return;
        (e.beh || []).forEach(function (bi) { var b = BEH[bi]; if (b) sum += (+b.pts || 0); });
      });
      var mb = find("behave").max;
      v.behave = Math.max(0, Math.min(mb, r1(mb + sum)));
      why.behave = sum ? "من سجل السلوك" : "لا مخالفات مرصودة";
    }
    if (find("sheets")) {
      var comps = [], parts = [], ms = find("sheets").max;
      if (t.hwY + t.hwN) { comps.push(t.hwY / (t.hwY + t.hwN)); parts.push("واجبات " + t.hwY + "/" + (t.hwY + t.hwN)); }
      var mine = knownSubs(tid);
      if (mine.length) {
        comps.push(mine.reduce(function (a, r) { return a + Math.min(1, r.sc / r.mx); }, 0) / mine.length);
        parts.push(mine.length + " ورقة تفاعلية");
      }
      if (comps.length) { v.sheets = r1(comps.reduce(function (a, b) { return a + b; }, 0) / comps.length * ms); why.sheets = parts.join(" + "); }
    }
    return { v: v, why: why };
  }
  // تسليمات الطالب المعروفة لنا في مادة معلم بعينه
  function knownSubs(tid) {
    var out = [];
    (C.tasks || []).forEach(function (x) {
      if (x.tid !== tid) return;
      var s = C.subs[x.a];
      if (s && +s.mx) out.push({ sc: +s.sc || 0, mx: +s.mx });
    });
    return out;
  }
  function effGrades(tid) {
    var manual = ((C.grades || {})[tid] || {})[ST.S.si] || {};
    var auto = autoGrade(tid), out = {};
    Object.keys(auto.v).forEach(function (k) { out[k] = auto.v[k]; });
    Object.keys(manual).forEach(function (k) { if (manual[k] != null && manual[k] !== "") out[k] = manual[k]; });
    return { g: out, why: auto.why, manual: manual };
  }
  /* الدرجة والتقدير من البنود **المرصودة حتى الآن** لا من 100 — قاعدة js/app.js نفسها
     (البنود التلقائية سقفها 40، فالنسبة من 100 قبل الاختبارات تجعل كل منتظم «دون المطلوب»). */
  function gradeInfo(tid) {
    var e = effGrades(tid), A = ASSESS(), sum = 0, mx = 0, all = 0;
    A.forEach(function (a) {
      all += a.max;
      var val = e.g[a.k];
      if (val == null || val === "" || isNaN(+val)) return;
      sum += Math.min(+val, a.max); mx += a.max;
    });
    if (!mx) return null;
    var pct = sum / mx * 100;
    return { tot: r1(sum), max: mx, all: all, pct: pct, lv: levelOf(pct), why: e.why };
  }

  /* آخر ملاحظة إيجابية: ملاحظات المعلم نصٌّ حرّ قد يحمل عتاباً، وشاشة الطفل ليست مكانه.
     فلا تُعرض ملاحظة إلا إذا صحبها سلوك موجب في يومها أو حملت لفظاً مشجّعاً، ولم تحمل أي
     لفظ عتاب ولا سلوكاً سالباً. وما عدا ذلك يبقى بين المعلم وولي الأمر حيث موضعه. */
  var GOOD_RE = /ممتاز|أحسنت|احسنت|رائع|متميز|متميّز|تميّز|تميز|مبدع|إبداع|ابداع|نشيط|متعاون|ملتزم|مجتهد|شكر|تفوق|تفوّق|بارك|ما شاء|مشارك|هادئ|مؤدب|حفظ|أجاد|اجاد|جميل|قدوة|مثالي/;
  var BAD_RE = /لم |لا ي|عدم|مخالف|إزعاج|ازعاج|تأخر|تاخر|شجار|ضرب|إهمال|اهمال|ناقص|تحذير|مشكلة|سلبي|يهمل|ينسى|فوضى|تنبيه|قصور|ضعف|يرجى|يجب/;
  function goodNote(tid) {
    var cd = recsOf(tid), si = ST.S.si, BEH = ST.BEH || [], best = null;
    Object.keys(cd).sort().forEach(function (date) {
      var e = (cd[date] || {})[si]; if (!e) return;
      var note = String(e.note || "").trim(); if (!note) return;
      var pos = (e.beh || []).some(function (bi) { return BEH[bi] && (+BEH[bi].pts || 0) > 0; });
      var neg = (e.beh || []).some(function (bi) { return BEH[bi] && (+BEH[bi].pts || 0) < 0; });
      if (neg || BAD_RE.test(note)) return;
      if (!pos && !GOOD_RE.test(note)) return;
      best = { date: date, note: note };
    });
    return best;
  }

  /* ═══ نقاط الأسابيع (رسم التقدّم) ═══ */
  function dayPts(date) {
    var si = ST.S.si, STATES = ST.STATES || [], BEH = ST.BEH || [], W = ST.W || {}, p = 0, any = false;
    Object.keys(RECS || {}).forEach(function (tid) {
      var e = ((RECS[tid] || {})[date] || {})[si]; if (!e) return;
      any = true;
      if (e.a != null && STATES[e.a]) p += (+STATES[e.a].pts || 0);
      if (e.part) p += e.part * (+W.part || 0);
      if (e.hw === 1) p += (+W.hw || 0);
      if (e.sh) p += e.sh * (+W.sheets || 0);
      (e.beh || []).forEach(function (bi) { var b = BEH[bi]; if (b) p += (+b.pts || 0); });
    });
    return any ? r1(p) : null;
  }
  function weekSeries() {
    var dates = {};
    Object.keys(RECS || {}).forEach(function (tid) { Object.keys(RECS[tid] || {}).forEach(function (d) { dates[d] = 1; }); });
    var all = Object.keys(dates).sort(), buckets = {}, order = [];
    all.forEach(function (d) {
      var p = dayPts(d); if (p === null) return;
      var wk = weekOfDate(d), key = wk ? "w" + wk : d.slice(0, 7);
      if (!buckets[key]) { buckets[key] = { key: key, wk: wk, pts: 0, days: 0 }; order.push(key); }
      buckets[key].pts = r1(buckets[key].pts + p);
      buckets[key].days++;                 // عدد أيامه المرصودة — بها يُقارَن أسبوعٌ ناقص بأسبوع تام
    });
    return order.map(function (k) { return buckets[k]; }).slice(-5);
  }

  /* ═══ فهرس المهام ═══ */
  function seenList() {
    try {
      var raw = localStorage.getItem(SEEN), arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function normTask(x) {
    return {
      a: String(x.a || x.id || ""), t: String(x.t || "ورقة"), due: String(x.due || ""),
      tid: String(x.tid || ""), tn: String(x.tn || ""), subj: String(x.subj || ""),
      mode: String(x.mode || "ws"), n: +x.n || 0, wk: +x.wk || 0, code: String(x.code || ""),
      tries: (x.tries == null ? null : +x.tries), ts: +x.ts || 0,
      // to: من أُرسلت إليهم وحدهم — الورقة لا تظهر لغيرهم في «مهامي»
      to: Array.isArray(x.to) ? x.to.map(function (v) { return +v; }).filter(function (v) { return v === Math.floor(v) && v >= 0; }) : []
    };
  }
  function loadTasks() {
    if (C.tasks) return Promise.resolve(C.tasks);
    var cid = ST.S.cid, si = ST.S.si, mine = {};
    ST.myTeachers().forEach(function (t) { mine[t.id] = t; });
    return safeDoc("assignidx/" + cid).then(function (d) {
      var map = {};
      ((d && d.list) || []).forEach(function (x) { var o = normTask(x); if (o.a) map[o.a] = o; });
      // ما فتحه الطفل بنفسه من رابط معلمه (سجّلته w/index.html على الأصل نفسه)
      seenList().forEach(function (x) {
        if (String(x.cid || "") !== cid) return;
        var o = normTask(x); if (!o.a || map[o.a]) return;
        map[o.a] = o;
      });
      var list = Object.keys(map).map(function (k) { return map[k]; })
        // الورقة الموجَّهة لبعض الطلاب: يراها المقصودون وحدهم (والفهرس يُقرأ للفصل كله)
        .filter(function (x) { return !x.to.length || x.to.indexOf(si) >= 0; });
      // مادة الورقة ومعلمها من قائمة معلميه هو، لا من نصٍّ مرسل
      list.forEach(function (x) { var t = mine[x.tid]; if (t) { x.tn = t.name; x.subj = t.subject; } });
      C.tasks = list;
      return Promise.all(list.map(function (x) {
        return safeDoc("subs/" + x.a + "_" + si).then(function (s) { if (s) C.subs[x.a] = s; });
      })).then(function () { return list; });
    });
  }
  function loadTasksSafe() { return loadTasks().catch(function () { C.tasks = C.tasks || []; return C.tasks; }); }
  function taskState(x) {
    var s = C.subs[x.a] || null;
    var due = x.due ? new Date(x.due).getTime() : 0;
    if (isNaN(due)) due = 0;
    var left = due ? Math.ceil((due - Date.now()) / 86400000) : null;
    var allowed = (x.tries == null || x.tries === 0) ? 12 : x.tries;
    var att = s ? (+s.att || 1) : 0;
    return { sub: s, due: due, left: left, allowed: allowed, att: att, more: Math.max(0, allowed - att) };
  }

  /* ═══ الدروس ═══ */
  function loadCurr(code) {
    if (C.curr[code]) return C.curr[code];
    C.curr[code] = fetch(url("data/curr/" + code + ".json"))
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (rows) {
        rows = Array.isArray(rows) ? rows : [];
        return safeDoc("curredits/" + code).then(function (ov) {
          var o = (ov && ov.rows) || {};
          Object.keys(o).forEach(function (i) { if (rows[i]) rows[i] = Object.assign({}, rows[i], o[i]); });
          return rows;
        });
      });
    return C.curr[code];
  }
  function loadLesson(code, wk) {
    var key = code + "w" + wk;
    if (C.lesson[key]) return C.lesson[key];
    C.lesson[key] = fetch(url("data/lessons/" + key + ".json"))
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (d) { return safeDoc("lessons/" + key).then(function (ov) { return (ov && ov.title) ? ov : d; }); });
    return C.lesson[key];
  }
  function loadYT(key) {
    if (C.yt[key]) return C.yt[key];
    C.yt[key] = safeDoc("lessonyt/" + key).then(function (d) { return (d && d.url) ? String(d.url) : ""; });
    return C.yt[key];
  }
  function loadFidx(tid) {
    if (C.fidx[tid]) return C.fidx[tid];
    C.fidx[tid] = safeDoc("filesidx/" + tid).then(function (d) { return (d && Array.isArray(d.list)) ? d.list : []; });
    return C.fidx[tid];
  }
  function ytId(u) { var m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,20})/.exec(String(u || "")); return m ? m[1] : ""; }
  function fIcon(t) { t = String(t || ""); return t === "application/pdf" ? "📄" : /^image\//.test(t) ? "🖼️" : /^audio\//.test(t) ? "🎧" : "📎"; }

  /* ═══ رسم مشترك ═══ */
  var RSEQ = 0;
  // كل رسم غير متزامن يحمل رقمه: تبديل التبويب أثناء التحميل لا يكتب فوق الشاشة الجديدة
  function guard() { var s = ++RSEQ; return function () { return s === RSEQ; }; }
  function head(e, t, s) { return '<div class="hd"><span class="e">' + e + '</span><div><h1>' + esc(t) + '</h1><p>' + esc(s || "") + '</p></div></div>'; }
  function loading(el) { el.innerHTML = '<div class="load"><div class="spin"></div>لحظة…</div>'; }
  function oops(el) {
    el.innerHTML = '<div class="card mid"><div class="big">📡</div><h1>ما وصلت البيانات</h1>' +
      '<p class="sub">تأكد من الإنترنت.</p><button class="go gold" id="rt">↻ حاول مرة أخرى</button></div>';
    var b = byId(el, "#rt"); if (b) b.onclick = function () { ST.refresh(); };
  }
  function empty(icon, title, sub) {
    return '<div class="card mid"><div class="big">' + icon + '</div><h1>' + esc(title) + '</h1>' +
      '<p class="sub" style="margin:0">' + esc(sub || "") + '</p></div>';
  }

  /* ══════════════════════════ ١) موادي ══════════════════════════ */
  ST.tab("subj", {
    render: function (el) {
      var ok = guard();
      loading(el);
      Promise.all([ST.loadRecs(), loadTasksSafe()]).then(function (r) {
        RECS = r[0];
        return loadGrades();
      }).then(function () {
        if (!ok()) return;
        var list = ST.myTeachers();
        if (!list.length) {
          el.innerHTML = head("📚", "موادي", "") + empty("🌱", "ما سُجّلت لك مواد بعد", "معلموك سيظهرون هنا قريباً.");
          return;
        }
        var rows = list.map(function (t) {
          var tt = calcT(t.id);
          return { t: t, code: subjCode(t.subject), c: tt, att: ST.attPct(tt), g: gradeInfo(t.id), note: goodNote(t.id) };
        });
        // الأنشط أولاً حتى يرى الطفل أفضل ما عنده في أول شاشة
        rows.sort(function (a, b) { return (b.c.pts - a.c.pts) || (b.c.days - a.c.days); });
        var anyData = rows.some(function (x) { return x.c.days > 0; });
        var partial = rows.some(function (x) { return x.g && x.g.max < x.g.all; });
        el.innerHTML = head("📚", "موادي", anyData ? "كل ما جمعه عنك معلموك في مكان واحد" : "بوابتك جاهزة، وأول رصد قريب") +
          (partial ? '<div class="gnote" style="margin:-4px 2px 12px">الدرجات من البنود المرصودة حتى الآن — وبقية الاختبارات لم تُرصد بعد.</div>' : "") +
          rows.map(cardSubj).join("");
      }, function () { if (ok()) oops(el); });
    }
  });
  function cardSubj(x) {
    var H = th(x.code), t = x.c, g = x.g;
    var attTxt = x.att == null ? "—" : x.att + "%";
    var attC = x.att == null ? "var(--muted)" : x.att >= 90 ? "var(--ok)" : x.att >= 70 ? "#B8862B" : "var(--peach)";
    var gh;
    if (g) {
      gh = '<div class="gline"><div class="t"><span>درجتي حتى الآن</span>' +
        '<i style="color:' + g.lv.c + '">' + g.tot + ' من ' + g.max + ' · ' + esc(levelKid(g.lv)) + '</i></div>' +
        '<div class="gbar"><i style="width:' + Math.max(3, Math.min(100, Math.round(g.pct))) + '%;background:' + g.lv.c + '"></i></div>' +
        '</div>';
    } else {
      gh = '<div class="gnote" style="margin-top:10px">لم تُرصد درجات في هذه المادة بعد 🌱</div>';
    }
    var nh = x.note ? '<div class="good">💬 ' + esc(x.note.note) + '<small>ملاحظة معلمك</small></div>' : "";
    return '<div class="sj">' +
      '<div class="top" style="background:' + H.c + '"><div class="ic">' + H.e + '</div>' +
      '<div><b>' + esc(x.t.subject || "مادة") + '</b><small>👨‍🏫 ' + esc(x.t.name || "") + '</small></div></div>' +
      '<div class="bd"><div class="mini">' +
      '<div><div class="v" style="color:var(--gold)">' + (t.days ? t.pts : "—") + '</div><div class="l">نقاطي</div></div>' +
      '<div><div class="v" style="color:' + attC + '">' + attTxt + '</div><div class="l">حضوري</div></div>' +
      '<div><div class="v" style="color:var(--sky)">' + t.part + '</div><div class="l">مشاركاتي</div></div>' +
      '</div>' + gh + nh + '</div></div>';
  }

  /* ══════════════════════════ ٢) مهامي ══════════════════════════ */
  var MODE_T = { ws: "📝 ورقة عمل", quiz: "⏱️ اختبار قصير", race: "🏁 سباق أسئلة" };
  ST.tab("task", {
    render: function (el) {
      var ok = guard();
      loading(el);
      loadTasksSafe().then(function (list) {
        if (!ok()) return;
        if (!list.length) {
          el.innerHTML = head("✏️", "مهامي", "أوراق معلميك واختباراتهم") +
            empty("🎉", "ما عندك مهام الآن", "حين يرسل لك معلمك ورقة تظهر هنا مباشرة.");
          return;
        }
        var open = [], done = [];
        list.forEach(function (x) { var s = taskState(x); (s.sub ? done : open).push({ x: x, s: s }); });
        open.sort(function (a, b) { return (a.s.due || 9e15) - (b.s.due || 9e15); });
        done.sort(function (a, b) { return ((b.s.sub || {}).ts || 0) - ((a.s.sub || {}).ts || 0); });
        el.innerHTML = head("✏️", "مهامي", open.length ? "عندك " + papersWord(open.length) + " تنتظرك" : "كل مهامك محلولة 🎉") +
          (open.length ? '<h2 style="margin:6px 2px 8px">🕒 تنتظرك</h2>' + open.map(taskCard).join("") : "") +
          (done.length ? '<h2 style="margin:16px 2px 8px">✅ أنجزتها</h2>' + done.map(taskCard).join("") : "");
        each(el, "[data-open]", function (b) {
          b.onclick = function () { window.open("../w/?a=" + encodeURIComponent(b.getAttribute("data-open")), "_blank", "noopener"); };
        });
      }, function () { if (ok()) oops(el); });
    }
  });
  function taskCard(r) {
    var x = r.x, s = r.s, sub = s.sub, pills = [], cls = "tk";
    var meta = [MODE_T[x.mode] || "📝 ورقة", x.subj ? esc(x.subj) : "", x.n ? x.n + " أسئلة" : ""].filter(Boolean).join(" · ");
    if (sub) {
      cls += " done";
      var sc = +sub.sc || 0, mx = +sub.mx || x.n || 0, pctv = mx ? Math.round(sc / mx * 100) : 0;
      pills.push('<span class="pill g">🌟 نتيجتك ' + sc + ' من ' + mx + '</span>');
      if (pctv >= 90) pills.push('<span class="pill p">ما شاء الله!</span>');
      if (s.more > 0) pills.push('<span class="pill b">🔁 بقيت لك ' + (s.more === 1 ? "محاولة" : s.more === 2 ? "محاولتان" : s.more + " محاولات") + '</span>');
      else pills.push('<span class="pill y">انتهت محاولاتك</span>');
    } else if (s.left === null) {
      pills.push('<span class="pill b">متى ما جهزت 🙂</span>');
    } else if (s.left < 0) {
      cls += " late"; pills.push('<span class="pill y">⏰ فات الموعد — حلّها ولو متأخراً</span>');
    } else if (s.left === 0) {
      pills.push('<span class="pill y">⏰ آخر يوم اليوم</span>');
    } else {
      pills.push('<span class="pill b">⏳ تبقّى ' + daysWord(s.left) + '</span>');
    }
    return '<div class="' + cls + '"><b>' + esc(x.t) + '</b>' +
      '<div class="m">' + meta + (x.tn ? ' · 👨‍🏫 ' + esc(x.tn) : '') + '</div>' +
      '<div class="row">' + pills.join("") + '</div>' +
      '<button class="go ' + (sub ? "soft" : "gold") + ' small" data-open="' + esc(x.a) + '">' +
      (sub ? "👁️ افتحها مرة أخرى" : "✏️ ابدأ الحل") + '</button></div>';
  }

  /* ══════════════════════════ ٣) دروسي ══════════════════════════ */
  var LESSTATE = { wk: 0 };
  ST.tab("less", {
    render: function (el) {
      var ok = guard();
      loading(el);
      var wkNow = curWeek();
      if (!LESSTATE.wk) LESSTATE.wk = wkNow;
      var list = ST.myTeachers().map(function (t) { return { t: t, code: subjCode(t.subject) }; })
        .filter(function (x) { return x.code; });
      if (!list.length) {
        el.innerHTML = head("🎒", "دروسي", "") + empty("🌱", "ما ربطنا موادك بعد", "اسأل معلمك عن دروس مادتك.");
        return;
      }
      var gc = ST.S.gc, term = TERM(), wk = LESSTATE.wk;
      Promise.all(list.map(function (x) { return loadCurr(x.code + gc + term); })).then(function (currs) {
        if (!ok()) return;
        var weeks = [];
        currs.forEach(function (rows) { (rows || []).forEach(function (r) { if (+r.w && weeks.indexOf(+r.w) < 0) weeks.push(+r.w); }); });
        weeks = weeks.filter(function (w) { return w <= wkNow; }).sort(function (a, b) { return b - a; });
        if (!weeks.length) weeks = [wkNow];
        if (weeks.indexOf(wk) < 0) { wk = weeks[0]; LESSTATE.wk = wk; }
        var cards = list.map(function (x, k) {
          var rows = (currs[k] || []).filter(function (r) { return +r.w === wk; });
          var main = rows.filter(function (r) { return r.lesson && String(r.lesson).indexOf("تابع") < 0; })[0] || rows[0];
          return main ? lessonCard(x.t, x.code, x.code + gc + term, wk, main) : "";
        }).filter(Boolean);
        el.innerHTML = head("🎒", "دروسي", wk === wkNow ? "دروس هذا الأسبوع" : "دروس الأسبوع " + wk) +
          '<div class="wkbar">' + weeks.map(function (w) {
            return '<button data-w="' + w + '" class="' + (w === wk ? "on" : "") + '">' + (w === wkNow ? "هذا الأسبوع" : "أسبوع " + w) + '</button>';
          }).join("") + '</div>' +
          (cards.length ? cards.join("") : empty("🌱", "لا دروس في هذا الأسبوع", "جرّب أسبوعاً آخر من الشريط أعلاه."));
        each(el, "[data-w]", function (b) { b.onclick = function () { LESSTATE.wk = +b.getAttribute("data-w"); ST.refresh(); }; });
        each(el, "[data-lsn]", function (b) { b.onclick = function () { toggleLesson(b); }; });
      }, function () { if (ok()) oops(el); });
    }
  });
  function lessonCard(t, sc, code, wk, row) {
    var H = th(sc), off = String(row.lesson || "").indexOf("إجازة") >= 0;
    return '<div class="lsn">' +
      '<button class="h" data-lsn="' + esc(code) + '" data-wk="' + wk + '" data-tid="' + esc(t.id) + '">' +
      '<span class="ic" style="background:' + H.c + '">' + H.e + '</span>' +
      '<span><b>' + esc(row.lesson || "درس") + '</b><small>' + esc(t.subject || "") + (row.unit ? " · " + esc(row.unit) : "") + '</small></span>' +
      '<span class="ar">' + (off ? "🌴" : "▾") + '</span></button>' +
      '<div class="bd" hidden></div></div>';
  }
  function toggleLesson(btn) {
    var card = btn.parentNode, bd = card.querySelector(".bd"), ar = btn.querySelector(".ar");
    if (!bd.hidden) { bd.hidden = true; if (ar.textContent === "▴") ar.textContent = "▾"; return; }
    bd.hidden = false; if (ar.textContent === "▾") ar.textContent = "▴";
    if (bd.getAttribute("data-done")) return;
    bd.setAttribute("data-done", "1");
    var code = btn.getAttribute("data-lsn"), wk = +btn.getAttribute("data-wk"), tid = btn.getAttribute("data-tid");
    var key = code + "w" + wk, base = (ST.META || {}).lessonsBase || "";
    bd.innerHTML = '<div class="empty">جارِ تجهيز الدرس…</div>';
    Promise.all([loadLesson(code, wk), loadYT(key), loadFidx(tid)]).then(function (r) {
      var d = r[0], vid = ytId(r[1]), fl = r[2] || [], h = "";
      var files = fl.filter(function (f) {
        return f && f.scope === "lesson" && f.ref && String(f.ref.code) === code && String(f.ref.wk) === String(wk);
      }).slice(0, 8);
      var canPlay = !!(d && (((d.story || []).length >= 3) || ((d.vocab || []).length >= 2)));
      if (d && d.summary) h += '<div class="gnote" style="margin:10px 0 0">' + esc(String(d.summary).slice(0, 220)) + '</div>';
      /* «افتح الدرس التفاعلي» يفتح مسرح الدرس داخل البوابة بهيكل حصة المعلم نفسه (محطات +
         لوحة شرف)، والنسخة الخارجية القديمة تبقى زراً ثانياً لمن اعتادها. */
      h += '<button class="go gold small" data-stage="1">🎬 افتح الدرس كما في الحصة</button>';
      if (base) h += '<a class="go soft small" style="text-decoration:none;text-align:center;box-sizing:border-box;margin-top:9px" target="_blank" rel="noopener" href="' + esc(base + key + ".html") + '">🚀 النسخة الخارجية للدرس</a>';
      if (vid) h += '<a class="yt" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=' + esc(vid) + '">' +
        '<img src="https://i.ytimg.com/vi/' + esc(vid) + '/hqdefault.jpg" alt="" loading="lazy"><i>▶️</i></a>';
      files.forEach(function (f) {
        h += '<a class="att" target="_blank" rel="noopener" href="../v/?f=' + esc(f.id) + '">' +
          '<span class="e">' + fIcon(f.t) + '</span>' + esc(String(f.n || "مرفق").slice(0, 46)) + '<small>افتح</small></a>';
      });
      if (canPlay) h += '<button class="go soft small" data-play="' + esc(code) + '" data-pw="' + wk + '">🎮 تدرّب على هذا الدرس</button>';
      if (!h) h = '<div class="empty">لا محتوى إضافي لهذا الدرس بعد 🌱</div>';
      bd.innerHTML = h;
      each(bd, "[data-play]", function (b) {
        b.onclick = function () { practice(b.getAttribute("data-play"), +b.getAttribute("data-pw")); };
      });
      each(bd, "[data-stage]", function (b) {
        b.onclick = function () { var nm = btn.querySelector("b"); lessonStage(code, wk, tid, (d && d.title) || (nm ? nm.textContent : "") || "الدرس"); };
      });
    }, function () { bd.innerHTML = '<div class="empty">ما وصل محتوى الدرس الآن 📡</div>'; bd.setAttribute("data-done", ""); });
  }

  /* ══════════════════════════ 🎬 الدرس كما في الحصة ══════════════════════════
     الطالب ووليّه يريان **هيكل الدرس التفاعلي نفسه** الذي يعرضه المعلم على الشاشة: المحطات في
     الأعلى، والمسرح في الوسط، ولوحة الشرف على جانبه. والقواعد المرئية (.rl-* و.story-*) مأخوذة
     من css/app.css حرفاً بحرف (كتلة STAGE-COPY في s/index.html) فلا يختلف الشكل عن شاشة الحصة.
     وما يخصّ المعلم لا يُنقل: لا عجلة اختيار طالب، ولا أزرار تقييم، ولا حضور، ولا إرسال أوراق. */
  var LS = null;             // حالة المسرح المفتوح
  var LST = [
    { v: "lesson", ic: "▶️", t: "الدرس" },
    { v: "story", ic: "🎬", t: "قصة الدرس" },
    { v: "vocab", ic: "🔤", t: "المصطلحات" },
    { v: "check", ic: "✅", t: "تحقّق من فهمي" },
    { v: "games", ic: "🎮", t: "ألعاب" },
    { v: "yt", ic: "📺", t: "المقطع" },
    { v: "files", ic: "📎", t: "المرفقات" }
  ];
  /* لوحة الشرف بجانب المسرح: لوحة **اليوم** أولاً (وهي التي تتحرّك في الحصة) ثم لوحة الفصل
     العامة. من ليس في الخمسة لا يُعرف موضعه — والطفل يرى نقاطه هو في «بطاقتي». */
  function lsBoardHtml() {
    var med = ["🥇", "🥈", "🥉", "🎖️", "🎖️"];
    var rows = function (list) {
      return list.map(function (x, k) {
        return '<div class="lsb-r' + (x.me ? " me" : "") + '"><span class="m">' + med[k] + '</span>'
          + '<span class="n">' + esc(x.n || "طالب") + (x.me ? " (أنا)" : "") + '</span>'
          + '<span class="p">' + x.pts + '</span></div>';
      }).join("");
    };
    var lb = (typeof ST.liveBoard === "function") ? ST.liveBoard() : null;
    var b = (typeof ST.board === "function") ? ST.board() : [];
    var h = "";
    if (lb && lb.board.length) {
      h += '<div class="lsb-h">🔴 لوحة اليوم</div>' + rows(lb.board);
      if (lb.mine) h += '<div class="lsb-me">نقاطك اليوم <b>' + lb.mine.pts + '</b> · مرتبتك <b>' + lb.mine.rank + '</b> من ' + lb.of + '</div>';
    }
    if (b.length) h += '<div class="lsb-h"' + (h ? ' style="margin-top:11px"' : '') + '>🏆 لوحة الفصل</div>' + rows(b);
    if (!h) return '<div class="lsb-e">🏆<span>لوحة الشرف تظهر هنا حين تُرصد نقاط الفصل</span></div>';
    return h + '<div class="lsb-f">النقاط من الحضور والمشاركة والواجبات والسلوك</div>';
  }
  function lessonStage(code, wk, tid, title) {
    var ov = document.createElement("div");
    ov.className = "ovg lsg";
    ov.innerHTML = '<div class="tp"><button id="ls-x">✖ خروج</button><span id="ls-t">🎬 ' + esc(title || "الدرس") + '</span>'
      + '<button id="ls-bt" class="bt">🏆</button></div>'
      + '<div class="lsw" id="ls-wrap">'
      // اللوحة أولاً في التركيب ⇒ تقع يمين الشاشة في العربية، والدرس على يسارها كما طُلب
      + '<div class="lsb" id="ls-board">' + lsBoardHtml() + '</div>'
      + '<div class="lsc"><div class="lst" id="ls-tools">'
      + LST.map(function (x, k) { return '<button data-v="' + x.v + '"' + (k === 0 ? ' class="on"' : "") + '>' + x.ic + ' ' + esc(x.t) + '</button>'; }).join("")
      + '</div><div class="lsm" id="ls-main"><div class="load"><div class="spin"></div>لحظة…</div></div></div></div>';
    document.body.appendChild(ov);
    try { document.body.style.overflow = "hidden"; } catch (e) { }
    LS = { ov: ov, code: code, wk: wk, tid: tid, d: null, v: "lesson", audio: null, timer: null };
    ov.querySelector("#ls-x").onclick = lsClose;
    ov.querySelector("#ls-bt").onclick = function () { ov.classList.toggle("noboard"); };
    each(ov, "#ls-tools [data-v]", function (b) {
      b.onclick = function () {
        each(ov, "#ls-tools [data-v]", function (x) { x.classList.toggle("on", x === b); });
        lsView(b.getAttribute("data-v"));
      };
    });
    loadLesson(code, wk).then(function (d) {
      if (!LS) return;
      LS.d = d || null;
      lsView("lesson");
    }, function () { if (LS) lsView("lesson"); });
    /* اللوحة وحدها تُعاد رسمها مع كل رصد جديد — لا المحطة، فلا تُقطع قصةٌ ولا يُعاد سؤال. */
    if (typeof ST.watchRecs === "function") {
      LS.stop = ST.watchRecs(function () {
        if (!LS) return;
        var bx = LS.ov.querySelector("#ls-board");
        if (bx) bx.innerHTML = lsBoardHtml();
      });
    }
  }
  function lsClose() {
    if (!LS) return;
    lsStop();
    try { if (LS.stop) { LS.stop(); LS.stop = null; } } catch (e) { }
    try { document.body.removeChild(LS.ov); } catch (e) { }
    try { document.body.style.overflow = ""; } catch (e) { }
    LS = null;
  }
  function lsStop() {
    if (!LS) return;
    try { if (LS.audio) { LS.audio.pause(); LS.audio.src = ""; LS.audio = null; } } catch (e) { }
    try { if (LS.timer) { clearInterval(LS.timer); LS.timer = null; } } catch (e) { }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { }
  }
  function lsBox() { return LS ? LS.ov.querySelector("#ls-main") : null; }
  function lsEmpty(msg) { return '<div class="lse">' + esc(msg) + '</div>'; }
  function lsView(v) {
    if (!LS) return;
    lsStop();
    LS.v = v;
    var box = lsBox(), d = LS.d;
    if (!box) return;
    if (!d && v !== "yt" && v !== "files") { box.innerHTML = lsEmpty("درس هذا الأسبوع قيد الإعداد — جرّب «المقطع» أو «المرفقات»"); return; }
    if (v === "lesson") return lsLesson(box, d);
    if (v === "story") return lsStory(box, d);
    if (v === "vocab") return lsVocab(box, d);
    if (v === "check") return lsCheck(box, d);
    if (v === "games") { var c0 = LS.code, w0 = LS.wk; lsClose(); practice(c0, w0); return; }
    if (v === "yt") return lsYt(box);
    if (v === "files") return lsFiles(box);
  }
  /* ▶️ الدرس — بمركّب renderRichLesson نفسه في js/app.js: العنوان والصورة والأهداف والتمهيد
     والأقسام والمصطلحات والنشاط والخلاصة، بالأصناف نفسها فيخرج الشكل واحداً. */
  function lsLesson(box, d) {
    var secs = (d.sections || []).map(function (sc, n) {
      return '<div class="rl-sec"><div class="rl-h"><span class="rl-n">' + (n + 1) + '</span>' + esc(sc.h || "") + '</div>'
        + (sc.body ? '<div class="rl-body">' + esc(sc.body) + '</div>' : "")
        + (sc.points ? '<ul class="rl-points">' + sc.points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + '</ul>' : "")
        + (sc.tip ? '<div class="rl-tip">💡 ' + esc(sc.tip) + '</div>' : "") + '</div>';
    }).join("");
    var hero = (d.story || []).filter(function (x) { return x && x.img; })[0];
    box.innerHTML = '<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">▶️ ' + esc(d.title || "") + '</span>'
      + '<span style="color:#c9d5e3;font-size:13px;margin-inline-start:auto">' + esc(d.unit || "") + '</span></div>'
      + '<div class="rl-scroll"><div class="rl-wrap">'
      + '<div class="rl-title">' + esc(d.title || "") + '</div>'
      + (hero ? '<img class="rl-hero" src="' + esc(url(hero.img)) + '" alt="">' : "")
      + ((d.objectives || []).length ? '<div class="rl-obj"><div class="rl-obj-h">🎯 أهداف الدرس</div><ul>'
        + d.objectives.map(function (o) { return "<li>" + esc(o) + "</li>"; }).join("") + '</ul></div>' : "")
      + (d.intro ? '<div class="rl-intro">' + esc(d.intro) + '</div>' : "")
      + secs
      + ((d.vocab || []).length ? '<div class="rl-sec"><div class="rl-h"><span class="rl-n">📖</span>مصطلحات الدرس</div><div class="rl-vocab">'
        + d.vocab.map(function (x) { return '<div class="rl-term"><b>' + esc(x.t) + '</b><span>' + esc(x.d) + '</span></div>'; }).join("") + '</div></div>' : "")
      + (d.activity ? '<div class="rl-sec rl-act"><div class="rl-h"><span class="rl-n">✍️</span>نشاط</div><div class="rl-body">' + esc(d.activity) + '</div></div>' : "")
      + (d.summary ? '<div class="rl-summary">🌟 ' + esc(d.summary) + '</div>' : "")
      + '</div></div></div>';
  }
  /* 🎬 قصة الدرس — نفس مشاهد المعلم: صورة/رمز ونصّ، وصوتٌ مسجَّل إن وُجد لهذا الدرس،
     وإلا خطوةً بخطوة بزرّي السابق والتالي (لا نطق آلي في جهاز طفل بلا إذن). */
  function lsStory(box, d) {
    var scenes = (d.story || []).filter(function (x) { return x && (x.t || x.img); });
    if (!scenes.length) { box.innerHTML = lsEmpty("قصة هذا الدرس قيد الإعداد"); return; }
    var i = 0, key = LS.code + "w" + LS.wk;
    box.innerHTML = '<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">🎬 قصة الدرس: ' + esc(d.title || "") + '</span>'
      + '<span id="ls-sh" style="color:#9fb0c4;font-size:12px;margin-inline-start:auto"></span></div>'
      + '<div class="story" id="ls-story"><div class="story-visual" id="ls-v">🎬</div>'
      + '<div class="story-text" id="ls-tx"></div>'
      + '<div class="story-player"><div class="story-seek" id="ls-seek"><div class="story-seek-fill" id="ls-fill"></div></div>'
      + '<div class="story-ctrl"><span class="story-time" id="ls-tm" dir="ltr">—</span>'
      + '<button class="go soft small" id="ls-prev" style="min-width:92px">◀ السابق</button>'
      + '<button class="go gold small" id="ls-next" style="min-width:92px">التالي ▶</button>'
      + '</div></div></div></div>';
    var vEl = byId(box, "#ls-v"), tEl = byId(box, "#ls-tx"), fill = byId(box, "#ls-fill"), tm = byId(box, "#ls-tm");
    function show(k) {
      i = Math.max(0, Math.min(scenes.length - 1, k));
      var sc = scenes[i];
      if (sc.img) vEl.innerHTML = '<img class="story-img" src="' + esc(url(sc.img)) + '" alt="">';
      else vEl.textContent = sc.v || "📘";
      tEl.textContent = sc.t || "";
      fill.style.width = Math.round((i + 1) / scenes.length * 100) + "%";
      tm.textContent = (i + 1) + " / " + scenes.length;
    }
    byId(box, "#ls-prev").onclick = function () { show(i - 1); };
    byId(box, "#ls-next").onclick = function () { show(i + 1); };
    if (scenes.some(function (x) { return x.img; })) { var sh = byId(box, "#ls-sh"); if (sh) sh.textContent = "الصور: Pixabay"; }
    show(0);
    // صوتٌ مسجَّل لهذا الدرس؟ فهرسٌ واحد يُجلب مرة (كما في js/app.js:audioHas) فلا طلب فاشل
    lsAudioHas(key).then(function (has) {
      if (!has || !LS || LS.v !== "story") return;
      var a = new Audio(); a.preload = "auto"; a.src = url("data/lessons/audio/" + key + ".mp3");
      LS.audio = a;
      var lens = scenes.map(function (x) { return Math.max(6, String(x.t || "").length); });
      var tot = lens.reduce(function (p, c) { return p + c; }, 0), bnd = [], acc = 0;
      lens.forEach(function (l) { bnd.push(acc / tot); acc += l; }); bnd.push(1);
      var pb = document.createElement("button");
      pb.className = "go gold small"; pb.style.minWidth = "112px"; pb.textContent = "▶️ اسمع القصة";
      var ctrl = box.querySelector(".story-ctrl"); if (ctrl) ctrl.appendChild(pb);
      a.ontimeupdate = function () {
        var dur = a.duration || 0, cur = a.currentTime || 0, f = dur ? cur / dur : 0;
        for (var k = 0; k < scenes.length; k++) { if (f >= bnd[k] && f < bnd[k + 1]) { if (k !== i) show(k); break; } }
        fill.style.width = (f * 100) + "%";
        tm.textContent = lsT(cur) + " / " + lsT(dur);
      };
      a.onended = function () { pb.textContent = "🔁 أعِد"; };
      pb.onclick = function () {
        if (a.paused) { a.play().then(function () { pb.textContent = "⏸️ إيقاف"; }, function () { }); }
        else { a.pause(); pb.textContent = "▶️ اسمع القصة"; }
      };
    });
  }
  var LSAUD = null;
  function lsAudioHas(key) {
    if (!LSAUD) LSAUD = fetch(url("data/lessons/audio/index.json")).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    return LSAUD.then(function (l) { return Array.isArray(l) && l.indexOf(key) > -1; }).catch(function () { return false; });
  }
  function lsT(x) { x = Math.max(0, Math.round(x || 0)); var m = Math.floor(x / 60); return m + ":" + ("0" + (x % 60)).slice(-2); }
  // 🔤 المصطلحات — بطاقاتٌ يقلبها الطالب
  function lsVocab(box, d) {
    var v = (d.vocab || []).filter(function (x) { return x && x.t; });
    if (!v.length) { box.innerHTML = lsEmpty("لا مصطلحات في هذا الدرس"); return; }
    box.innerHTML = '<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">🔤 مصطلحات الدرس</span></div>'
      + '<div class="rl-scroll"><div class="rl-wrap"><div class="rl-vocab">'
      + v.map(function (x) { return '<div class="rl-term"><b>' + esc(x.t) + '</b><span>' + esc(x.d || "") + '</span></div>'; }).join("")
      + '</div></div></div></div>';
  }
  /* ✅ تحقّق من فهمي — أسئلة الدرس نفسها بلا رصد ولا درجة: تصحيحٌ فوري وتفسيرٌ لطيف. */
  function lsCheck(box, d) {
    var qs = ((d.checks || []).concat(d.questions || [])).filter(function (q) { return q && q.q && (q.opts || []).length >= 2; }).slice(0, 12);
    if (!qs.length) { box.innerHTML = lsEmpty("لا أسئلة في هذا الدرس"); return; }
    var L2 = ["أ", "ب", "ج", "د", "هـ", "و"];
    box.innerHTML = '<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">✅ تحقّق من فهمي</span>'
      + '<span style="color:#c9d5e3;font-size:13px;margin-inline-start:auto">تدريبٌ حرّ — لا تُسجَّل نتيجته</span></div>'
      + '<div class="rl-scroll"><div class="rl-wrap">'
      + qs.map(function (q, n) {
        return '<div class="rl-sec" data-q="' + n + '"><div class="rl-q">' + (n + 1) + '. ' + esc(q.q) + '</div>'
          + '<div class="lsq">' + (q.opts || []).map(function (o, k) {
            return '<button class="lsq-b" data-q="' + n + '" data-k="' + k + '">' + (L2[k] || (k + 1)) + '. ' + esc(o) + '</button>';
          }).join("") + '</div><div class="lsq-fb" id="lsfb' + n + '"></div></div>';
      }).join("")
      + '</div></div></div>';
    each(box, ".lsq-b", function (b) {
      b.onclick = function () {
        var n = +b.getAttribute("data-q"), k = +b.getAttribute("data-k"), q = qs[n], ok = k === (+q.correct || 0);
        each(box, '.lsq-b[data-q="' + n + '"]', function (x) {
          x.disabled = true;
          if (+x.getAttribute("data-k") === (+q.correct || 0)) x.classList.add("ok");
          else if (x === b) x.classList.add("no");
        });
        var fb = byId(box, "#lsfb" + n);
        if (fb) { fb.className = "lsq-fb " + (ok ? "ok" : "no"); fb.textContent = ok ? "✔ صحيح، أحسنت!" : "الصواب: " + ((q.opts || [])[+q.correct || 0] || ""); }
        if (ok) { try { confetti(); } catch (e) { } }
      };
    });
  }
  // 📺 المقطع — نفس مصدر محطة المعلم (yt/{code}w{wk})
  function lsYt(box) {
    box.innerHTML = '<div class="load"><div class="spin"></div>لحظة…</div>';
    loadYT(LS.code + "w" + LS.wk).then(function (raw) {
      if (!LS || LS.v !== "yt") return;
      var id = ytId(raw);
      if (!id) { box.innerHTML = lsEmpty("لم يُضف معلمك مقطعاً لهذا الدرس"); return; }
      box.innerHTML = '<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">📺 مقطع الدرس</span></div>'
        + '<div class="lsyt"><iframe src="https://www.youtube-nocookie.com/embed/' + esc(id) + '?rel=0&playsinline=1" '
        + 'title="مقطع الدرس" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div></div>';
    }, function () { if (LS && LS.v === "yt") box.innerHTML = lsEmpty("ما وصل المقطع — تأكد من الإنترنت"); });
  }
  // 📎 المرفقات — مرفقات هذا الدرس من معلمه (نفس فهرس filesidx)
  function lsFiles(box) {
    box.innerHTML = '<div class="load"><div class="spin"></div>لحظة…</div>';
    loadFidx(LS.tid).then(function (fl) {
      if (!LS || LS.v !== "files") return;
      var files = (fl || []).filter(function (f) {
        return f && f.scope === "lesson" && f.ref && String(f.ref.code) === String(LS.code) && String(f.ref.wk) === String(LS.wk);
      }).slice(0, 12);
      if (!files.length) { box.innerHTML = lsEmpty("لا مرفقات لهذا الدرس"); return; }
      box.innerHTML = '<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">📎 مرفقات الدرس</span></div>'
        + '<div class="rl-scroll"><div class="rl-wrap">'
        + files.map(function (f) {
          return '<a class="att" target="_blank" rel="noopener" href="' + esc(url("v/?f=" + f.id)) + '">'
            + '<span class="e">' + fIcon(f.t) + '</span>' + esc(String(f.n || "مرفق").slice(0, 60)) + '<small>افتح</small></a>';
        }).join("")
        + '</div></div></div>';
    }, function () { if (LS && LS.v === "files") box.innerHTML = lsEmpty("ما وصلت المرفقات"); });
  }
  /* ══════════════════════════ ٤) وضع التدرّب — لاعب واحد، بلا رصد ولا نقاط رسمية ══════════════════════════
     منطق الألعاب منقول عن js/app.js (memory · order · riddle) بعد نزع كل ما يخصّ المعلم:
     لا عجلة اختيار طالب، ولا أزرار تقييم، ولا لوحة شرف، ولا نقطة تُكتب في أي مكان. */
  var TOs = [];
  function wait(fn, ms) { var t = setTimeout(function () { var k = TOs.indexOf(t); if (k >= 0) TOs.splice(k, 1); fn(); }, ms); TOs.push(t); return t; }
  function stopAll() { while (TOs.length) clearTimeout(TOs.pop()); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }

  function practice(code, wk) {
    var ov = document.createElement("div");
    ov.className = "ovg";
    ov.innerHTML = '<div class="tp"><button id="pv-x">✖ خروج</button><span id="pv-t">🎮 تدرّب</span></div>' +
      '<div class="in" id="pv-in"><div class="load"><div class="spin"></div>لحظة…</div></div>';
    document.body.appendChild(ov);
    try { document.body.style.overflow = "hidden"; } catch (e) { }
    var box = ov.querySelector("#pv-in"), ttl = ov.querySelector("#pv-t");
    ov.querySelector("#pv-x").onclick = function () {
      stopAll();
      try { document.body.removeChild(ov); } catch (e) { }
      try { document.body.style.overflow = ""; } catch (e) { }
    };

    loadLesson(code, wk).then(function (d) {
      if (!d) { box.innerHTML = '<div class="win"><div class="e">🌱</div><h2>لا محتوى لهذا الدرس بعد</h2><p>جرّب درساً آخر.</p></div>'; return; }
      var scenes = (d.story || []).filter(function (s) { return s && (s.t || s.img); });
      var vocab = (d.vocab || []).filter(function (v) { return v && v.t && v.d; });
      // صور الدرس بعناوينها (كما في js/app.js:memoSource)
      var pics = [], seen = {};
      scenes.forEach(function (s) { if (s.img && s.cap && !seen[s.cap]) { seen[s.cap] = 1; pics.push({ img: s.img, cap: s.cap }); } });
      scenes.forEach(function (s) {
        if (!s.img || !s.t) return;
        if (!pics.some(function (p) { return p.img === s.img; })) pics.push({ img: s.img, cap: s.t });
      });
      var back = '<button class="go soft small" id="gback" style="margin:0 0 10px">◀ كل الألعاب</button>';
      function wireBack() { var b = box.querySelector("#gback"); if (b) b.onclick = menu; }
      function card(g, e, t, s, on) {
        return '<button class="gmc" data-g="' + g + '"' + (on ? "" : " disabled") + '><span class="e">' + e + '</span>' +
          '<span><b>' + t + '</b><small>' + esc(s) + '</small></span></button>';
      }
      function menu() {
        stopAll();
        ttl.textContent = "🎮 " + (d.title || "تدرّب");
        var okM = pics.length >= 2 || vocab.length >= 2, okR = vocab.length >= 3, okO = scenes.length >= 3;
        box.innerHTML = '<div class="hud">تدريب حرّ — بلا رصد ولا درجات. العب كما تحب 🌈</div>' +
          card("mem", "🧠", "الذاكرة", pics.length >= 2 ? "أربع بطاقات: طابق الصورة باسمها" : "أربع بطاقات: طابق المصطلح بتعريفه", okM) +
          card("ord", "🧩", "رتّب القصة", "مشهد واحد في كل خطوة: أيّها أولاً؟", okO) +
          card("rid", "🔤", "من أنا؟", "تعريف وحروف مخفية… خمّن الكلمة", okR) +
          ((okM || okR || okO) ? "" : '<div class="win"><div class="e">🌱</div><h2>هذا الدرس ما فيه ألعاب بعد</h2><p>جرّب درساً آخر.</p></div>');
        each(box, "[data-g]", function (b) {
          b.onclick = function () { ({ mem: memory, ord: order, rid: riddle })[b.getAttribute("data-g")](); };
        });
      }
      function win(t, msg, sub) {
        stopAll(); confetti();
        box.innerHTML = '<div class="win"><div class="e">🏆</div><h2>' + esc(t) + '</h2>' +
          '<p>' + esc(msg) + (sub ? '<br>' + esc(sub) : '') + '</p>' +
          '<button class="go gold" id="ag">🎮 العب مرة أخرى</button>' +
          '<button class="go soft" id="bk" style="margin-top:9px">◀ كل الألعاب</button></div>';
        box.querySelector("#ag").onclick = menu;
        box.querySelector("#bk").onclick = menu;
      }

      /* 🧠 الذاكرة — أربع بطاقات (زوجان): صورة ↔ اسمها، وإلا مصطلح ↔ تعريفه */
      function memory() {
        stopAll(); ttl.textContent = "🧠 الذاكرة";
        var withPics = pics.length >= 2, pairs;
        if (withPics) pairs = shuffle(pics).slice(0, 2).map(function (x, i) { return { id: i, a: '<img src="' + esc(url(x.img)) + '" alt="">', b: '<b>' + esc(x.cap) + '</b>' }; });
        else pairs = shuffle(vocab).slice(0, 2).map(function (v, i) { return { id: i, a: '<b>' + esc(v.t) + '</b>', b: '<span style="font-size:13px;font-weight:700">' + esc(v.d) + '</span>' }; });
        var cards = [];
        pairs.forEach(function (p) { cards.push({ id: p.id, h: p.a }); cards.push({ id: p.id, h: p.b }); });
        cards = shuffle(cards);
        var open = [], found = 0, moves = 0, lock = false;
        box.innerHTML = back + '<div class="hud" id="h">اقلب بطاقتين متطابقتين</div><div class="mm">' +
          cards.map(function (cd, i) {
            return '<button data-i="' + i + '"><div class="in2"><div class="f bk">؟</div><div class="f fr">' + cd.h + '</div></div></button>';
          }).join("") + '</div>';
        wireBack();
        var hud = box.querySelector("#h");
        each(box, ".mm button", function (b) {
          b.onclick = function () {
            if (lock || b.className.indexOf("flip") >= 0 || b.className.indexOf("done") >= 0) return;
            b.classList.add("flip"); open.push(b);
            if (open.length !== 2) return;
            moves++; lock = true;
            var x = open[0], y = open[1], same = cards[+x.getAttribute("data-i")].id === cards[+y.getAttribute("data-i")].id;
            wait(function () {
              if (same) { x.classList.add("done"); y.classList.add("done"); found++; confetti(); }
              else { x.classList.remove("flip"); y.classList.remove("flip"); }
              open = []; lock = false;
              hud.textContent = "محاولات " + moves + " · " + found + "/" + pairs.length;
              if (found === pairs.length) wait(function () { win("🧠 الذاكرة", "طابقت " + pairs.length + " أزواج بـ" + moves + " محاولة", "ممتاز! ✨"); }, 520);
            }, same ? 380 : 900);
          };
        });
      }

      /* 🧩 رتّب القصة — خطوة واحدة في كل مرة، وجواب فوري */
      function order() {
        stopAll(); ttl.textContent = "🧩 رتّب القصة";
        var src = scenes.slice(0, Math.min(4, scenes.length));
        var step = 0, tries = 0, wrong = 0;
        var rest = shuffle(src.map(function (s, k) { return { k: k, s: s }; }));
        function face(x) {
          return (x.s.img ? '<img src="' + esc(url(x.s.img)) + '" alt="">' : '<span class="em">' + esc(x.s.v || "📘") + '</span>') +
            esc(String(x.s.t || "").slice(0, 90));
        }
        function draw() {
          box.innerHTML = back +
            '<div class="strip">' + (step ? src.slice(0, step).map(function (s, i) {
              return '<span>' + (i + 1) + '. ' + esc(String(s.t || "").slice(0, 18)) + '</span>';
            }).join("") : '<span>شريط القصة فارغ…</span>') + '</div>' +
            '<div class="ask">' + (step === 0 ? "أيّ مشهد يأتي <b>أولاً</b>؟" : "وماذا يأتي <b>بعده</b>؟") + '</div>' +
            rest.map(function (x) { return '<button class="odc" data-k="' + x.k + '">' + face(x) + '</button>'; }).join("") +
            '<div class="hud" style="margin-top:6px">' + step + '/' + src.length + ' · محاولات ' + tries + '</div>';
          wireBack();
          each(box, "[data-k]", function (b) {
            b.onclick = function () {
              if (b.className.indexOf("ok") >= 0) return;
              tries++;
              if (+b.getAttribute("data-k") === step) {
                b.classList.add("ok"); confetti();
                rest = rest.filter(function (x) { return x.k !== step; });
                step++;
                wait(function () {
                  if (step >= src.length) win("🧩 رتّب القصة", "رتّبت " + src.length + " مشاهد!", wrong ? "بعد " + tries + " محاولة" : "من أول مرة بلا خطأ 🌟");
                  else draw();
                }, 700);
              } else {
                wrong++; b.classList.add("no");
                wait(function () { b.classList.remove("no"); }, 900);
              }
            };
          });
        }
        draw();
      }

      /* 🔤 من أنا؟ — التعريف ظاهر والكلمة مخفية، وحروفها تنكشف حرفاً حرفاً */
      function riddle() {
        stopAll(); ttl.textContent = "🔤 من أنا؟";
        var items = shuffle(vocab).slice(0, 5), i = 0, got = 0;
        function show() {
          stopAll();
          var v = items[i];
          if (!v) return win("🔤 من أنا؟", "عرفت " + got + " من " + items.length, got === items.length ? "كلها صح! 🌟" : "واصل، أنت تتحسّن 💪");
          var term = String(v.t).trim(), chars = term.split(""), hid = {}, nh = 0, solved = false;
          chars.forEach(function (ch, k) { if (ch !== " ") { hid[k] = 1; nh++; } });
          function word() {
            return '<div class="rd">' + chars.map(function (ch, k) {
              return ch === " " ? '<i class="sp"></i>' : '<i class="' + (hid[k] ? "" : "on") + '">' + (hid[k] ? "" : esc(ch)) + '</i>';
            }).join("") + '</div>';
          }
          box.innerHTML = back + '<div class="hud">لغز ' + (i + 1) + ' من ' + items.length + '</div>' +
            '<div class="ask">' + esc(v.d) + '</div><div id="w">' + word() + '</div>' +
            '<button class="go soft small" id="lt">🔡 اكشف حرفاً</button>' +
            '<button class="go gold small" id="gt" style="margin-top:9px">✅ عرفتها!</button>' +
            '<button class="go soft small" id="sk" style="margin-top:9px">⏭ التالي</button>';
          wireBack();
          var w = box.querySelector("#w");
          box.querySelector("#lt").onclick = function () {
            if (solved || !nh) return;
            var keys = Object.keys(hid);
            delete hid[keys[Math.floor(Math.random() * keys.length)]];
            nh--; w.innerHTML = word();
            if (!nh) { solved = true; wait(function () { i++; show(); }, 1300); }
          };
          box.querySelector("#gt").onclick = function () {
            if (solved) return;
            solved = true; got++;
            Object.keys(hid).forEach(function (k) { delete hid[k]; });
            w.innerHTML = word(); confetti();
            wait(function () { i++; show(); }, 1300);
          };
          box.querySelector("#sk").onclick = function () { i++; show(); };
        }
        show();
      }
      menu();
    }, function () {
      box.innerHTML = '<div class="win"><div class="e">📡</div><h2>ما وصل الدرس</h2><p>تأكد من الإنترنت.</p></div>';
    });
  }

  /* اسم وكيل المدرسة ومديرها في الشهادة — من «🏫 أسماء الإدارة» في لوحة المدير (cfg/school).
     الشهادة تُطبع وتُعلَّق في البيت: اسمُ من يعتمدها جزءٌ منها لا تفصيل. */
  function sigNames() { try { return (typeof ST.staff === "function") ? ST.staff() : null; } catch (e) { return null; } }
  function sigHtml() {
    var st = sigNames();
    if (!st || (!st.vice && !st.principal)) return "";
    var cell = function (l, n) { return n ? '<span><small>' + esc(l) + '</small><b>' + esc(n) + '</b></span>' : ""; };
    return '<div class="csig">' + cell(st.lbl[st.viceKey], st.vice) + cell(st.lbl.principal, st.principal) + '</div>';
  }
  /* ══════════════════════════ ٦) 📬 رسائلي — صندوق الطالب ووليّه ══════════════════════════
     يقرأ smsg/{mk} حيث mk مفتاح صندوقه داخل بصمة هويته: مستندٌ لطالبٍ واحد، لا يُسرد بالقواعد
     ولا يجده من لا يعرف المفتاح. فالاستدعاء ومستوى الابن لا يمرّان بمستند فصلٍ يقرؤه كل طلابه.
     غير المقروء يُحسب على جهاز الطفل (localStorage) وتُكتب نسخةٌ منه في sack/{mk} ليعرف المعلم
     أن رسالته قُرئت. والاستماع الحيّ يُظهر الجديد بلا إعادة تحميل — وهو إشعاره داخل البوابة. */
  var MSGS = null, MSUB = null, MSEEN = null;
  var MKIND = { level: ["📊", "مستوى ابنكم"], call: ["📣", "استدعاء"], thanks: ["🌟", "شكر وتقدير"],
    hw: ["📚", "متابعة واجب"], beh: ["⚠️", "ملاحظة سلوك"], free: ["✉️", "رسالة"] };
  function seenKey() { return "sijil.s.msgseen." + ((ST.S || {}).cid || "") + "." + ((ST.S || {}).si || 0); }
  function seenGet() {
    if (MSEEN) return MSEEN;
    var o = {};
    try { var raw = localStorage.getItem(seenKey()); if (raw) { var a = JSON.parse(raw); if (a && typeof a === "object") o = a; } } catch (e) { o = {}; }
    MSEEN = o; return o;
  }
  function seenPut(ids) {
    var o = seenGet(), now = Date.now(), ch = 0;
    (ids || []).forEach(function (i) { if (i && !o[i]) { o[i] = now; ch++; } });
    if (!ch) return false;
    // لا تنمو بلا حدّ: أحدث ستين يكفي (سقف الصندوق نفسه)
    var ks = Object.keys(o);
    if (ks.length > 60) { ks.sort(function (a, b) { return o[a] - o[b]; }).slice(0, ks.length - 60).forEach(function (k) { delete o[k]; }); }
    try { localStorage.setItem(seenKey(), JSON.stringify(o)); } catch (e) { }
    MSEEN = o;
    // «قرأها» للمعلم — مستندٌ منفصل لا يمسّ نصّ الرسالة، وفشلُه لا يُهمّ الطفل
    try {
      var mk = (ST.S || {}).mk;
      if (mk && ST.CLOUD && ST.db) ST.db.doc("sack/" + mk).set({ seen: o, ts: Date.now() }, { merge: true });
    } catch (e) { }
    return true;
  }
  // متى وصلت: اليوم/أمس/قبل كذا — لا ساعة دقيقة، فالطفل لا يحتاجها
  function msgWhen(ts) {
    if (!ts) return "";
    var d = Math.floor((Date.now() - ts) / 864e5);
    if (d <= 0) return "اليوم";
    if (d === 1) return "أمس";
    return "قبل " + daysWord(d);
  }
  function normMsg(x) {
    if (!x || typeof x !== "object") return null;
    var i = String(x.i || "").slice(0, 24); if (!i) return null;
    return { i: i, k: String(x.k || "free"), t: String(x.t || "رسالة").slice(0, 90),
      b: String(x.b || "").slice(0, 900), tn: String(x.tn || ""), subj: String(x.subj || ""),
      tid: String(x.tid || ""), ts: +x.ts || 0 };
  }
  function loadMsgs() {
    var mk = (ST.S || {}).mk;
    if (!mk) { MSGS = []; return Promise.resolve(MSGS); }
    if (MSGS) return Promise.resolve(MSGS);
    return safeDoc("smsg/" + mk).then(function (d) {
      var list = (((d || {}).list) || []).map(normMsg).filter(Boolean);
      list.sort(function (a, b) { return b.ts - a.ts; });
      MSGS = list; return list;
    }, function () { MSGS = []; return MSGS; });
  }
  function unreadCount(list) {
    var o = seenGet();
    return (list || []).filter(function (m) { return !o[m.i]; }).length;
  }
  function msgBadge() {
    return loadMsgs().then(function (list) {
      try { ST.tabCount("msg", unreadCount(list)); } catch (e) { }
      return list;
    });
  }
  /* استماعٌ حيّ: رسالةٌ تصل والطفل في البوابة ⇒ شارة وتنبيه فوري بلا إعادة تحميل. */
  function watchMsgs() {
    var mk = (ST.S || {}).mk;
    if (!mk || MSUB || typeof ST.sub !== "function") return;
    MSUB = ST.sub("smsg/" + mk, function (data) {
      var list = (((data || {}).list) || []).map(normMsg).filter(Boolean);
      list.sort(function (a, b) { return b.ts - a.ts; });
      var before = MSGS ? MSGS.length : 0;
      MSGS = list;
      var n = unreadCount(list);
      try { ST.tabCount("msg", n); } catch (e) { }
      if (before && list.length > before) {
        try { ST.toast("📬 وصلتك رسالة جديدة من معلمك"); } catch (e) { }
        try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) { }
      }
      if (before !== list.length) { try { if (ST.S) ST.refresh(); } catch (e) { } }
    });
  }
  ST.tab("msg", {
    render: function (el) {
      var ok = guard();
      loading(el);
      loadMsgs().then(function (list) {
        if (!ok()) return;
        watchMsgs();
        var seen = {};
        Object.keys(seenGet()).forEach(function (k) { seen[k] = 1; });
        var h = head("📬", "رسائلي", "رسائل معلميك — اقرأها مع أمك أو أبيك");
        if (!(ST.S || {}).mk) {
          h += '<div class="card mid"><div class="big">📪</div><h1>صندوقك ما جهز بعد</h1>'
            + '<p class="sub" style="margin:0">اطلب من إدارة المدرسة تحديث تسجيل هويتك، فيصلك بريد معلميك هنا.</p></div>';
          el.innerHTML = h; return;
        }
        if (!list.length) {
          h += '<div class="card mid"><div class="big">📭</div><h1>ما وصلك شيء</h1>'
            + '<p class="sub" style="margin:0">حين يرسل لك معلمك رسالة أو استدعاءً أو تقريراً عن مستواك، تجدها هنا 🌱</p></div>';
          el.innerHTML = h; ST.tabCount("msg", 0); return;
        }
        h += list.map(function (m) {
          var K = MKIND[m.k] || MKIND.free, isNew = !seen[m.i];
          return '<div class="msgc ' + (m.k === "call" ? "call" : (isNew ? "new" : "")) + '">'
            + '<div class="hd"><span class="e">' + K[0] + '</span><span>' + esc(m.t) + '</span>'
            + (isNew ? '<span class="nw">جديدة</span>' : "") + '</div>'
            + '<div class="mt">' + esc(K[1]) + (m.tn ? " · " + esc(m.tn) : "") + (m.subj ? " · " + esc(m.subj) : "")
            + (m.ts ? " · " + esc(msgWhen(m.ts)) : "") + '</div>'
            + '<div class="bd">' + esc(m.b) + '</div></div>';
        }).join("");
        h += '<div class="card no-print" style="margin-top:4px">'
          + '<button class="go soft" id="m-share">💬 أرسل آخر رسالة لوالديّ</button></div>';
        el.innerHTML = h;
        // فتحُ التبويب = قراءةٌ: الشارة تنزل، ويعرف المعلم أنها قُرئت
        seenPut(list.map(function (m) { return m.i; }));
        try { ST.tabCount("msg", 0); } catch (e) { }
        var sb = byId(el, "#m-share");
        if (sb) sb.onclick = function () {
          var m = list[0], txt = m.t + "\n\n" + m.b;
          try { if (navigator.share) { navigator.share({ text: txt }).then(function () { }, function () { }); return; } } catch (e) { }
          try { navigator.clipboard.writeText(txt); ST.toast("نُسخت الرسالة ✅"); } catch (e) { ST.toast("انسخها يدوياً 🙂"); }
        };
      }, function () { if (ok()) oops(el); });
    }
  });
  // الشارة تُحسب مع الدخول لا عند فتح التبويب — وإلا لم يعرف الطفل أن عنده جديداً
  /* تُحسب الشارة عند الدخول (حدثٌ تُطلقه النواة) لا بمؤقّت أعمى: الطفل قد يمكث في شاشة الدخول
     دقيقةً، ومؤقّتٌ يسبق جلسته يمرّ بلا شيء فلا يرى شارة إلا إن فتح التبويب بنفسه. */
  function msgStart() { if (!ST.S) return; msgBadge(); watchMsgs(); }
  try { window.addEventListener("sijil:student-in", msgStart); } catch (e) { }
  try { setTimeout(msgStart, 1200); } catch (e) { }
  /* ══════════════════════════ ٥) شهادتي ══════════════════════════ */
  ST.tab("cert", {
    render: function (el) {
      var ok = guard();
      loading(el);
      Promise.all([ST.loadRecs(), loadTasksSafe()]).then(function (r) {
        if (!ok()) return;
        RECS = r[0];
        var t = ST.calcAll(ST.S.si), att = ST.attPct(t), stk = ST.streak(ST.S.si);
        var solved = (C.tasks || []).filter(function (x) { return C.subs[x.a]; }).length;
        var stars = Math.max(1, Math.min(5, 1 + Math.round(Math.max(0, t.pts) / 12)));
        var sch = ((ST.META || {}).school || {}).name || "مدرستي", sg = sigHtml();
        el.innerHTML = head("🏅", "شهادتي", "احفظها أو اطبعها أو أرسلها لأهلك") +
          '<div class="printme"><div class="cert">' +
          '<div class="seal">🏆</div><div class="sch">' + esc(sch) + '</div>' +
          '<div class="ttl">شهادة تميّز</div>' +
          '<div class="ln">تشهد المدرسة بأن الطالب</div>' +
          '<div class="who">' + esc(ST.S.name) + '</div>' +
          '<div class="ln">من ' + esc(ST.S.cname) + '، قد أظهر حرصاً وتفاعلاً في دروسه' +
          (t.days ? '، وجمع <b>' + t.pts + '</b> نقطة' : '') + '.<br>نسأل الله له دوام التوفيق والتميّز.</div>' +
          '<div class="kv">' +
          (att != null ? '<span>🎒 حضور ' + att + '%</span>' : '') +
          (stk > 0 ? '<span>🔥 سلسلة ' + stk + '</span>' : '') +
          (t.part ? '<span>🙋 مشاركة ' + t.part + '</span>' : '') +
          (solved ? '<span>✏️ ' + solved + ' ورقة</span>' : '') +
          '</div>' +
          '<div class="stars">' + new Array(stars + 1).join("★") + '</div>' +
          sg +
          '<div class="ft"><span>' + esc(hijri()) + '</span><span>' + (sg ? '' : 'إدارة المدرسة') + '</span></div>' +
          '</div></div>' +
          '<div class="card no-print" style="margin-top:13px">' +
          '<button class="go gold" id="c-img">🖼️ احفظها صورة</button>' +
          '<button class="go" id="c-share" style="margin-top:9px" hidden>💬 أرسلها لأهلي</button>' +
          '<button class="go soft" id="c-print" style="margin-top:9px">🖨️ اطبعها</button></div>';
        byId(el, "#c-print").onclick = function () { try { window.print(); } catch (e) { ST.toast("الطباعة غير متاحة هنا"); } };
        byId(el, "#c-img").onclick = function () { certImage(false); };
        var sh = byId(el, "#c-share");
        try { if (navigator.share && navigator.canShare) sh.hidden = false; } catch (e) { }
        sh.onclick = function () { certImage(true); };
      }, function () { if (ok()) oops(el); });
    }
  });
  /* الشهادة صورةً: تُرسم على canvas بخط الصفحة نفسه (fillText يشكّل العربية تشكيلاً صحيحاً)
     ثم تُحفظ أو تُشارك. لا مكتبة خارجية ولا صورة من الشبكة، فلا يتلوّث الـcanvas ولا يفشل. */
  function certImage(share) {
    var t = ST.calcAll(ST.S.si), att = ST.attPct(t), stk = ST.streak(ST.S.si);
    var sch = ((ST.META || {}).school || {}).name || "مدرستي";
    var W = 1600, H = 1130, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    var x = cv.getContext("2d");
    if (!x) { ST.toast("ما قدرنا نحفظها هنا"); return; }
    function finish() {
      if (!cv.toBlob) { ST.toast("ما قدرنا نحفظها هنا"); return; }
      cv.toBlob(function (blob) {
        if (!blob) { ST.toast("ما قدرنا نحفظها هنا"); return; }
        var f = null;
        try { f = new File([blob], "شهادتي.png", { type: "image/png" }); } catch (e) { f = null; }
        if (share && f && navigator.canShare && navigator.canShare({ files: [f] })) {
          navigator.share({ files: [f], title: "شهادتي" }).then(function () { }, function () { });
          return;
        }
        var u = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = u; a.download = "شهادتي.png";
        document.body.appendChild(a); a.click();
        setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(u); } catch (e) { } }, 800);
        ST.toast("تمام! حُفظت شهادتك 🏅");
      }, "image/png");
    }
    function draw() {
      x.fillStyle = "#FFFDF7"; x.fillRect(0, 0, W, H);
      x.strokeStyle = "#D7A93F"; x.lineWidth = 12; x.strokeRect(34, 34, W - 68, H - 68);
      x.lineWidth = 3; x.strokeRect(60, 60, W - 120, H - 120);
      x.textAlign = "center";
      try { x.direction = "rtl"; } catch (e) { }
      var F = function (w, s) { x.font = w + " " + s + 'px Tajawal, "Segoe UI", system-ui, sans-serif'; };
      F(700, 34); x.fillStyle = "#8a7434"; x.fillText(sch, W / 2, 150);
      F(400, 108); x.fillText("🏆", W / 2, 272);
      F(900, 72); x.fillStyle = "#0E2033"; x.fillText("شهادة تميّز", W / 2, 376);
      F(500, 38); x.fillStyle = "#1B2A3A"; x.fillText("تشهد المدرسة بأن الطالب", W / 2, 458);
      F(900, 76); x.fillStyle = "#8a6a1c"; x.fillText(String(ST.S.name).slice(0, 40), W / 2, 568);
      F(500, 38); x.fillStyle = "#1B2A3A";
      x.fillText("من " + ST.S.cname + "، قد أظهر حرصاً وتفاعلاً في دروسه", W / 2, 650);
      x.fillText(t.days ? ("وجمع " + t.pts + " نقطة. نسأل الله له دوام التوفيق والتميّز.") : "نسأل الله له دوام التوفيق والتميّز.", W / 2, 708);
      var kv = [];
      if (att != null) kv.push("حضور " + att + "%");
      if (stk > 0) kv.push("سلسلة " + daysWord(stk));
      if (t.part) kv.push("مشاركة " + t.part);
      if (kv.length) { F(700, 36); x.fillStyle = "#7a5200"; x.fillText(kv.join("   ·   "), W / 2, 792); }
      var stars = Math.max(1, Math.min(5, 1 + Math.round(Math.max(0, t.pts) / 12)));
      F(400, 56); x.fillStyle = "#D7A93F"; x.fillText(new Array(stars + 1).join("★"), W / 2, 880);
      var sg = sigNames();
      if (sg && (sg.vice || sg.principal)) {
        // الاسم سطراً تحت وظيفته (لا "الوظيفة: الاسم"): النقطتان في canvas ثنائي الاتجاه تقفز
        var side = function (align, cx, lbl, nm) {
          x.textAlign = align;
          F(500, 26); x.fillStyle = "#8b95a1"; x.fillText(lbl, cx, 950);
          F(700, 32); x.fillStyle = "#3b4553"; x.fillText(String(nm).slice(0, 34), cx, 992);
        };
        if (sg.vice) side("right", W - 130, sg.lbl[sg.viceKey], sg.vice);
        if (sg.principal) side("left", 130, sg.lbl.principal, sg.principal);
        F(600, 28); x.fillStyle = "#7c8794"; x.textAlign = "center"; x.fillText(hijri(), W / 2, 1042);
      } else {
        F(600, 30); x.fillStyle = "#7c8794";
        x.textAlign = "right"; x.fillText(hijri(), W - 110, 1022);
        x.textAlign = "left"; x.fillText("إدارة المدرسة", 110, 1022);
      }
      finish();
    }
    try {
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw, draw);
      else draw();
    } catch (e) { draw(); }
  }

  /* ══════════════════════════ ٦) شرائح «بطاقتي»: اليوم · الشارات · التقدّم ولوالديّ ══════════════════════════ */
  /* الشرائح الثلاث تُستدعى **متزامنة** من داخل «بطاقتي»، وبياناتها (الرصد والمهام) غير
     متزامنة. فأول رسم يقع بما توفّر، ثم يُعاد الرسم **مرة واحدة** حين تصل — لا أكثر، فلا حلقة. */
  var DATA_TRIED = false, DATA_PAINTED = false;
  function ensureData() {
    if (DATA_TRIED || !ST.S) return;
    DATA_TRIED = true;
    Promise.all([
      ST.loadRecs().then(function (r) { RECS = r; }, function () { }),
      loadTasksSafe()
    ]).then(function () {
      if (DATA_PAINTED) return;
      DATA_PAINTED = true;
      try { ST.refresh(); } catch (e) { }
    });
  }

  /* عودة الطفل من الورقة (w/ يُفتح في تبويب آخر على الأصل نفسه): نعيد قراءة المهام
     وتسليماته فيرى نتيجته فور رجوعه، بلا زر «تحديث» يفهمه. وبفاصل عشر ثوانٍ حتى لا
     يتكرر مع كل تبديل تبويب في المتصفح، وعلى شاشتَي «مهامي» و«بطاقتي» وحدهما. */
  var LASTSYNC = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden || !ST.S) return;
    if (Date.now() - LASTSYNC < 10000) return;
    var on = document.querySelector("#tabs button.on");
    var cur = on ? on.getAttribute("data-t") : "";
    if (cur !== "task" && cur !== "card") return;
    LASTSYNC = Date.now();
    C.tasks = null; C.subs = {};
    loadTasksSafe().then(function () { try { ST.refresh(); } catch (e) { } });
  });

  ST.today(function () {
    ensureData();
    if (!C.tasks) return "";
    var openT = C.tasks.filter(function (x) { return !C.subs[x.a]; });
    if (!openT.length) return '<div class="today">🎉 ما عليك مهام اليوم — استمتع بيومك!</div>';
    var soon = openT.slice().sort(function (a, b) {
      var da = a.due ? new Date(a.due).getTime() : 9e15, db2 = b.due ? new Date(b.due).getTime() : 9e15;
      return (isNaN(da) ? 9e15 : da) - (isNaN(db2) ? 9e15 : db2);
    })[0];
    var s = taskState(soon);
    var when = s.left === null ? "" : s.left < 0 ? " (فات موعدها — حلّها ولو متأخراً)" : s.left === 0 ? " اليوم!" : " خلال " + daysWord(s.left);
    return '<div class="today">✏️ عندك «' + esc(String(soon.t).slice(0, 34)) + '»' + esc(when) +
      (openT.length > 1 ? ' ومعها ' + othersWord(openT.length - 1) + ' غيرها' : '') + '</div>';
  });

  ST.badges(function () {
    ensureData();
    var si = ST.S.si, t = ST.calcAll(si), stk = ST.streak(si), att = ST.attPct(t);
    var ws = weekSeries(), grew = ws.length >= 2 && ws[ws.length - 1].pts > ws[ws.length - 2].pts;
    var solved = (C.tasks || []).filter(function (x) { return C.subs[x.a]; });
    var onTime = solved.filter(function (x) { var s = C.subs[x.a]; return s && !s.late; }).length;
    var full = solved.filter(function (x) { var s = C.subs[x.a]; return s && +s.mx && (+s.sc >= +s.mx); }).length;
    return [
      { icon: "🔥", label: "سلسلة ٥ أيام", on: stk >= 5 },
      { icon: "🏅", label: "سلسلة ١٠ أيام", on: stk >= 10 },
      { icon: "🎒", label: "حضور كامل", on: att === 100 && t.days >= 3 },
      { icon: "🙋", label: "مشارك نشيط", on: t.part >= 5 },
      { icon: "⭐", label: "نجم المشاركة", on: t.part >= 15 },
      { icon: "📚", label: "واجباتي كلها", on: t.hwY >= 3 && t.hwN === 0 },
      { icon: "✏️", label: "حللت ورقتك", on: solved.length >= 1 },
      { icon: "⏰", label: "في الوقت", on: onTime >= 2 },
      { icon: "💯", label: "درجة كاملة", on: full >= 1 },
      { icon: "🌟", label: "تميّز عند معلمك", on: t.behP >= 1 },
      { icon: "📈", label: "تقدّمت هالأسبوع", on: grew }
    ];
  });

  ST.extra(function () {
    ensureData();
    var ws = weekSeries(), out = "";
    if (ws.length >= 2) {
      var mx = Math.max.apply(null, ws.map(function (w) { return Math.max(0, w.pts); })) || 1;
      /* الرسالة تُقارن **معدّل اليوم** لا مجموع الأسبوع: الأسبوع الجاري ناقص الأيام دائماً،
         فمقارنة مجموعه بمجموع أسبوعٍ تام كانت تقول لكل طفل «هذا الأسبوع أهدأ» يوم الأحد. */
      var wN = ws[ws.length - 1], wP = ws[ws.length - 2];
      var aN = wN.days ? wN.pts / wN.days : 0, aP = wP.days ? wP.pts / wP.days : 0;
      var partial = wN.days && wP.days && wN.days < wP.days;
      var msg = (aN > aP + 0.05 ? "أيامك هذا الأسبوع أقوى من الأسبوع الماضي 📈"
        : aN < aP - 0.05 ? "هذا الأسبوع أهدأ قليلاً… وأنت تقدر ترجع أعلى 💪"
          : "ثابت مثل الأسبوع الماضي — وخطوة صغيرة ترفعك 🌱")
        + (partial ? " (وأسبوعك لم يكتمل بعد ⏳)" : "");
      out += '<div class="card"><h2>تقدّمي 📈</h2><div class="chart">' +
        ws.map(function (w, i) {
          var h = Math.round(Math.max(0, w.pts) / mx * 86) + 12;
          return '<div class="col' + (i === ws.length - 1 ? " now" : "") + '">' +
            '<span class="val">' + w.pts + '</span>' +
            '<span class="bar" style="height:' + h + '%"></span>' +
            '<span class="lb">' + (i === ws.length - 1 ? "هذا الأسبوع" : (w.wk ? "أسبوع " + w.wk : "سابق")) + '</span></div>';
        }).join("") + '</div><div class="trend">' + esc(msg) + '</div></div>';
    }
    out += '<div class="card mid"><h2>لوالديّ 👨‍👩‍👦</h2>' +
      '<p class="sub" style="margin:0 0 12px">اعرض لأمك أو أبيك ملخّصك، أو أرسله لهم.</p>' +
      '<button class="go" id="pw-open">👨‍👩‍👦 ملخّص لوالديّ</button></div>';
    setTimeout(function () { var b = document.getElementById("pw-open"); if (b) b.onclick = parentSheet; }, 0);
    return out;
  });

  /* ═══ ملخّص ولي الأمر: لغة الكبار، والكلمات الرسمية كما يسجّلها المعلم ═══
     ﴿حاجز﴾ لا يُفتح إلا بعد خطوة «أعطِ الجوال لأمك 👩». وكان يُفتح بضغطة واحدة فيقرأ الطفل
     في شاشته ما تُخفيه بقية التبويبات بعناية: رتبته عارية وعدد ما لم يُنجزه. وهو ليس حاجزاً
     تقنياً — بل حاجزٌ نفسي يكفي طفلاً في العاشرة، ومعه نُزع من النصّ ما لا يُقال أمامه:
     الرتبة لا تُذكر إلا لمن يُعرض له رقمه أصلاً (الثلث الأعلى)، والواجبات بصيغة «كم من كم».
     ﴿واتساب﴾ الرابط يُملأ برقم ولي أمره من مستند فصله، فلا يختار الطفلُ المستقبِل بنفسه
     (كان wa.me بلا رقم، فيقدر أن يرسل سجلّه كاملاً إلى مجموعة الفصل). */
  function parentText() {
    var S = ST.S, t = ST.calcAll(S.si), att = ST.attPct(t), stk = ST.streak(S.si);
    var rk = t.pts > 0 ? ST.rank(S.si) : null, L = [];
    L.push("📋 ملخّص متابعة — " + (((ST.META || {}).school || {}).name || "المدرسة"));
    L.push("الطالب: " + S.name + " — " + S.cname);
    L.push("التاريخ: " + hijri());
    L.push("");
    L.push("• مجموع النقاط: " + (t.days ? t.pts : "لم يُرصد بعد"));
    if (att != null) L.push("• نسبة الحضور: " + att + "% من " + t.days + " حصة مرصودة");
    if (stk > 0) L.push("• الحضور المتصل: " + daysWord(stk));
    L.push("• المشاركة الصفية: " + t.part + " مرة");
    if (t.hwY + t.hwN) L.push("• الواجبات المُنجزة: " + t.hwY + " من " + (t.hwY + t.hwN));
    if (t.behP) L.push("• مواقف تميّز مسجّلة: " + t.behP);
    if (rk && rk.show) L.push("• الترتيب داخل الفصل: " + rk.rank + " من " + rk.of);
    var gl = [];
    ST.myTeachers().forEach(function (tt) {
      var g = gradeInfo(tt.id);
      if (g) gl.push("   – " + (tt.subject || "مادة") + ": " + g.tot + "/" + g.max + " (" + g.lv.t + ")");
    });
    if (gl.length) { L.push(""); L.push("📚 الدرجات المرصودة حتى الآن:"); L = L.concat(gl); }
    var tasks = C.tasks || [];
    if (tasks.length) {
      var done = tasks.filter(function (x) { return C.subs[x.a]; }).length;
      L.push("");
      L.push("✏️ الأوراق والاختبارات: " + done + " من " + tasks.length + " مُسلَّم" + ((tasks.length - done) ? " — وبقي " + (tasks.length - done) : ""));
    }
    L.push("");
    L.push("يُعرض هذا الملخّص من بوابة الطالب في تطبيق «سجلي»، والدرجات من البنود المرصودة حتى تاريخه.");
    return L.join("\n");
  }
  // رقم ولي الأمر كما في مستند الفصل ⇒ صيغة دولية 9665… (والرقم لا يظهر للطفل في أي شاشة)
  function parentWa() {
    var d = String((ST.S || {}).parent || "").replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); }).replace(/\D/g, "");
    d = d.replace(/^00/, "");
    if (/^9665[0-9]{8}$/.test(d)) return d;
    if (/^05[0-9]{8}$/.test(d)) return "966" + d.slice(1);
    if (/^5[0-9]{8}$/.test(d)) return "966" + d;
    return "";
  }
  function parentSheet() {
    // الحاجز: خطوة واحدة تقول للطفل إن هذه الشاشة ليست له
    ST.sheet('<h2>هذا لأمك أو أبيك 👩</h2>' +
      '<p class="sub mid">فيه كلام الكبار عن متابعتك. أعطِ الجوال لأمك أو أبيك، ثم اضغط الزر.</p>' +
      '<button class="go gold" id="pw-go">أعطيته لأمي أو أبي — اعرض الملخّص</button>' +
      '<button class="go soft" id="pw-no" style="margin-top:9px">ليس الآن</button>',
      function (box, close) {
        box.querySelector("#pw-no").onclick = close;
        box.querySelector("#pw-go").onclick = function () { close(); parentShow(); };
      });
  }
  /* ═══════════ 👨‍👩‍👦 شاشة وليّ الأمر: المستوى الكامل وتقييم اليوم لحظةً بلحظة ═══════════
     البطاقات مختصرةٌ لطفل، ووليّ الأمر يحتاج الصورة كاملة: كل حصة اليوم بحالتها، وكل مادة
     بدرجتها وحضورها وواجباتها وسلوكها، وأسابيعه الأخيرة، وما يحتاج تدخّله. والرصد يُستمع إليه
     حياً (ST.watchRecs) فما يسجّله المعلم في الحصة يظهر في جوال الأب قبل أن ينتهي الدرس. */
  var PSTOP = null, POV = null;
  var PDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  var PJS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  function pHm(m) { var h = Math.floor(m / 60), x = Math.round(m) % 60; return h + ":" + (x < 10 ? "0" : "") + x; }
  // أوقات الحصص من cfg/bell (وإلا الافتراضي: 7:00 · 45د · 7 حصص · فسحة 30 بعد الثالثة)
  function pBell(day) {
    var c = (ST.D || {}).bell || null, o = { start: 420, len: 45, n: 7, breaks: [{ after: 3, min: 30, n: "الفسحة" }], lens: {} };
    if (c && typeof c === "object") {
      if (+c.start >= 0) o.start = +c.start;
      if (+c.len > 0) o.len = +c.len;
      if (+c.n > 0) o.n = +c.n;
      if (Array.isArray(c.breaks)) o.breaks = c.breaks.map(function (b) { return { after: +b.after || 0, min: +b.min || 0, n: String(b.n || "الفسحة") }; });
      if (c.lens && typeof c.lens === "object") o.lens = c.lens;
      var dv = (c.days && typeof c.days === "object") ? c.days[day] : null;
      if (dv && typeof dv === "object") {
        if (+dv.start >= 0) o.start = +dv.start;
        if (+dv.len > 0) o.len = +dv.len;
        if (+dv.n > 0) o.n = +dv.n;
        if (Array.isArray(dv.breaks)) o.breaks = dv.breaks.map(function (b) { return { after: +b.after || 0, min: +b.min || 0, n: String(b.n || "الفسحة") }; });
      }
    }
    return o;
  }
  function pPeriods(day) {
    var c = pBell(day), out = [], t = c.start;
    for (var p = 1; p <= c.n; p++) {
      var len = +(c.lens || {})[String(p)] || c.len;
      out.push({ p: p, from: t, to: t + len }); t += len;
      for (var k = 0; k < c.breaks.length; k++) if (c.breaks[k].after === p && p < c.n) { t += c.breaks[k].min; }
    }
    return out;
  }
  // حصص الابن اليوم: من الجدول المدرسي لفصله، مرتَّبةً بالحصة، مع مادة كل معلم ووقتها
  function pToday(dt) {
    var d = dt || new Date(), day = PJS[d.getDay()], cid = (ST.S || {}).cid;
    var rows = ((ST.D || {}).schedule || []).filter(function (r) { return r && r.c === cid && r.d === day; });
    var per = pPeriods(day), by = {};
    per.forEach(function (x) { by[x.p] = x; });
    var TS = (ST.D || {}).teachers || [], grp = {}, order = [];
    /* الرصد في «سجلي» يومي لكل معلم لا لكل حصة (مستند recs/{tid}_{cid} مفتاحه التاريخ)،
       فمعلمٌ له حصتان اليوم كان يظهر صفّين متطابقين كأنهما تقييمان — والصواب صفٌّ واحد
       يحمل رقمي حصتيه. وإن صار الرصد يوماً لكل حصة انفصلت هذه الصفوف بلا تغييرٍ هنا. */
    rows.forEach(function (r) {
      var t = null;
      for (var k = 0; k < TS.length; k++) if (String(TS[k].name || "") === String(r.t || "")) { t = TS[k]; break; }
      var key = (t ? t.id : "") || ("n:" + String(r.t || ""));
      var b = by[+r.p] || null;
      if (!grp[key]) { grp[key] = { tid: t ? t.id : "", tn: String(r.t || ""), subj: t ? (t.subject || "") : "", ps: [], from: 0, to: 0 }; order.push(key); }
      var g = grp[key];
      g.ps.push(+r.p || 0);
      if (b) { if (!g.from || b.from < g.from) g.from = b.from; if (b.to > g.to) g.to = b.to; }
    });
    var out = order.map(function (k) { var g = grp[k]; g.ps.sort(function (a, b2) { return a - b2; }); g.p = g.ps[0]; return g; });
    out.sort(function (a, b2) { return a.p - b2.p; });
    return { day: day, list: out, isSchool: out.length > 0 };
  }
  function pDateKey(d) { d = d || new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  // تقييم حصةٍ واحدة اليوم كما رصده معلمها
  function pCell(tid, dk) {
    var e = ((recsOf(tid) || {})[dk] || {})[(ST.S || {}).si] || null;
    if (!e) return null;
    var STATES = ST.STATES || [], BEH = ST.BEH || [];
    var st = (e.a != null && STATES[e.a]) ? String(STATES[e.a].name || "") : "";
    var beh = (e.beh || []).map(function (bi) { return BEH[bi] ? { n: BEH[bi].name, p: +BEH[bi].pts || 0 } : null; }).filter(Boolean);
    return { st: st, part: +e.part || 0, hw: (e.hw === 1 ? 1 : (e.hw === 0 ? 0 : null)), beh: beh, note: String(e.note || "") };
  }
  var P_OFF = /غائب|مستأذن|بعذر|هارب/;
  function pStateCls(st) { if (!st) return "n"; if (P_OFF.test(st)) return "x"; if (/متأخر/.test(st)) return "w"; return "y"; }
  // مجموع اليوم: حاضر في كم حصة، ومشاركاته، وواجباته، وسلوكه
  function pDaySum(dk, tids) {
    /* على معلمي اليوم وحدهم: مقامٌ من كل معلمي الفصل يقول «حاضر في 1 من 6» ليوم فيه حصتان. */
    var out = { here: 0, off: 0, none: 0, part: 0, hwY: 0, hwN: 0, pos: 0, neg: 0 };
    var T = (tids && tids.length) ? tids.map(function (id) { return { id: id }; }) : ST.myTeachers();
    T.forEach(function (t) {
      if (!t.id) { out.none++; return; }
      var c = pCell(t.id, dk);
      if (!c) { out.none++; return; }
      if (!c.st) out.none++; else if (P_OFF.test(c.st)) out.off++; else out.here++;
      out.part += c.part;
      if (c.hw === 1) out.hwY++; if (c.hw === 0) out.hwN++;
      c.beh.forEach(function (b) { if (b.p >= 0) out.pos++; else out.neg++; });
    });
    return out;
  }
  /* شاشة كاملة لا نافذة صغيرة: هي التقرير الذي يفتحه الأب مرة كل يوم. */
  function parentShow() {
    var ov = document.createElement("div");
    ov.className = "ovg par";
    ov.innerHTML = '<div class="tp"><button id="p-x">✖ إغلاق</button><span>👨‍👩‍👦 متابعة ' + esc((ST.S || {}).first || "ابني") + '</span></div>'
      + '<div class="in" id="p-in"><div class="load"><div class="spin"></div>لحظة…</div></div>';
    document.body.appendChild(ov); POV = ov;
    try { document.body.style.overflow = "hidden"; } catch (e) { }
    var box = ov.querySelector("#p-in");
    ov.querySelector("#p-x").onclick = pClose;
    // الرصد والدرجات والمهام معاً، ثم رسمٌ واحد — ثم استماعٌ حيّ يعيد الرسم عند كل تغيير
    Promise.all([ST.loadRecs().then(function (r) { RECS = r; }, function () { }), loadGrades().catch(function () { }), loadTasksSafe()])
      .then(function () {
        pDraw(box);
        if (!PSTOP && typeof ST.watchRecs === "function") {
          PSTOP = ST.watchRecs(function () { if (POV && document.body.contains(POV)) pDraw(box); });
        }
      }, function () { box.innerHTML = '<div class="win"><div class="e">📡</div><h2>ما وصلت البيانات</h2><p>تأكد من الإنترنت.</p></div>'; });
  }
  function pClose() {
    try { if (PSTOP) { PSTOP(); PSTOP = null; } } catch (e) { }
    try { if (POV) document.body.removeChild(POV); } catch (e) { }
    POV = null;
    try { document.body.style.overflow = ""; } catch (e) { }
  }
  function pDraw(box) {
    var S = ST.S, dk = pDateKey(), T = pToday();
    var sum = pDaySum(dk, T.list.map(function (x) { return x.tid; }).filter(Boolean));
    var t = ST.calcAll(S.si), att = ST.attPct(t), stk = ST.streak(S.si);
    var now = new Date(), mnow = now.getHours() * 60 + now.getMinutes();
    var h = "";
    // ── الرأس ──
    var gl = [], tot = 0, mx = 0;
    ST.myTeachers().forEach(function (tt) { var g = gradeInfo(tt.id); if (g) { gl.push({ t: tt, g: g }); tot += g.tot; mx += g.max; } });
    var overall = mx ? (tot / mx * 100) : null, olv = overall != null ? levelOf(overall) : null;
    h += '<div class="pcard phead"><div class="nm">' + esc(S.name) + '</div>'
      + '<div class="sb">' + esc(S.cname) + ' · ' + esc(((ST.META || {}).school || {}).name || "") + '</div>'
      + '<div class="kpis">'
      + '<div class="kpi"><div class="v">' + (overall != null ? Math.round(overall) + "%" : "—") + '</div><div class="l">المستوى العام</div></div>'
      + '<div class="kpi"><div class="v">' + (att != null ? att + "%" : "—") + '</div><div class="l">الحضور</div></div>'
      + '<div class="kpi"><div class="v">' + t.pts + '</div><div class="l">النقاط</div></div>'
      + '</div>'
      + (olv ? '<div class="lvb lv' + olv.i + '">' + esc(olv.t) + '</div>' : "")
      + '</div>';
    /* ── 🔴 الحصة الآن: لوحة شرف اليوم ونقاط ابنه ومرتبته لحظةً بلحظة ──
       الأب يفتح البوابة وابنه داخل الحصة: هذه البطاقة تصله بها. الأسماء الخمسة الأولى وحدها
       (لوحة الشرف عُرفٌ معلن)، ومعها نقاط ابنه ومرتبته — لا ترتيب كل طفل في الفصل. */
    var LB = (typeof ST.liveBoard === "function") ? ST.liveBoard() : null;
    var livePer = null;
    T.list.forEach(function (r) { if (r.from && mnow >= r.from && mnow < r.to) livePer = r; });
    if (LB && (LB.board.length || LB.mine)) {
      h += '<div class="psec">' + (livePer ? '🔴 الحصة الآن' : '🏆 لوحة شرف اليوم') + '<i>' + (livePer ? 'مباشر' : 'اليوم') + '</i></div>';
      h += '<div class="pcard lbc">';
      if (livePer) h += '<div class="lbnow">📚 ' + esc(livePer.subj || 'حصة') + ' — ' + esc(livePer.tn || '') + '<span>الحصة ' + esc(livePer.ps && livePer.ps.length > 1 ? livePer.ps.join(' و') : String(livePer.p)) + '</span></div>';
      if (LB.mine) {
        h += '<div class="lbme"><div><b>' + LB.mine.pts + '</b><small>نقاط ابنكم اليوم</small></div>'
          + '<div><b>' + LB.mine.rank + '</b><small>مرتبته اليوم من ' + LB.of + '</small></div></div>';
      }
      if (LB.board.length) {
        var med2 = ['🥇', '🥈', '🥉', '🎖️', '🎖️'];
        h += '<div class="lbrows">' + LB.board.map(function (x, k) {
          return '<div class="lbr' + (x.me ? ' me' : '') + '"><span>' + med2[k] + '</span>'
            + '<b>' + esc(x.n || 'طالب') + (x.me ? ' (ابنكم)' : '') + '</b><i>' + x.pts + '</i></div>';
        }).join('') + '</div>';
      }
      h += '<div class="pnote">تتحدّث تلقائياً مع رصد المعلم — نقاط اليوم من الحضور والمشاركة والواجب والسلوك.</div></div>';
    }
    // ── اليوم لحظةً بلحظة ──
    h += '<div class="psec">📅 اليوم — ' + esc(T.day) + ' ' + esc(hijri()) + '<i>يتحدّث تلقائياً</i></div>';
    if (!T.isSchool) {
      h += '<div class="pcard mid2">' + (/الجمعة|السبت/.test(T.day) ? "🌴 عطلة نهاية الأسبوع — لا حصص اليوم" : "لا حصص مسجَّلة لفصله اليوم في الجدول المدرسي") + '</div>';
    } else {
      h += '<div class="ptl">';
      T.list.forEach(function (r) {
        var c = r.tid ? pCell(r.tid, dk) : null;
          var live = r.from && mnow >= r.from && mnow < r.to;
        var done = r.to && mnow >= r.to;
        var cls = pStateCls(c ? c.st : "");
        h += '<div class="pl ' + cls + (live ? " live" : "") + '">'
          + '<div class="pp">' + esc(r.ps && r.ps.length > 1 ? r.ps.join(" و") : String(r.p)) + '<i>' + (r.from ? esc(pHm(r.from)) : "") + '</i></div>'
          + '<div class="pm"><b>' + esc(r.subj || "مادة") + '</b><small>' + esc(r.tn) + '</small></div>'
          + '<div class="pv">'
          + (c && c.st ? '<span class="tg ' + cls + '">' + esc(c.st) + '</span>' : (done ? '<span class="tg n">لم تُرصد</span>' : '<span class="tg n">' + (live ? "الحصة الآن" : "لم تبدأ") + '</span>'))
          + (c && c.part ? '<span class="tg y">🙋 ' + c.part + '</span>' : "")
          + (c && c.hw === 1 ? '<span class="tg y">📚 حلّ الواجب</span>' : "")
          + (c && c.hw === 0 ? '<span class="tg w">📚 لم يحلّ</span>' : "")
          + (c ? c.beh.map(function (b) { return '<span class="tg ' + (b.p >= 0 ? "y" : "x") + '">' + (b.p >= 0 ? "⭐ " : "⚠ ") + esc(b.n) + '</span>'; }).join("") : "")
          + '</div></div>';
      });
      h += '</div>';
      h += '<div class="pcard sumline">'
        + '<span>✅ حاضر في <b>' + sum.here + '</b> من ' + T.list.length + ' ' + (T.list.length === 1 ? 'مادة' : 'مواد') + '</span>'
        + (sum.off ? '<span class="bad">🚫 غياب ' + sum.off + '</span>' : "")
        + (sum.part ? '<span>🙋 مشاركات ' + sum.part + '</span>' : "")
        + (sum.hwY ? '<span>📚 واجبات ' + sum.hwY + '</span>' : "")
        + (sum.hwN ? '<span class="bad">📚 لم يحلّ ' + sum.hwN + '</span>' : "")
        + (sum.neg ? '<span class="bad">⚠ ملاحظات ' + sum.neg + '</span>' : "")
        + (sum.pos ? '<span>⭐ تميّز ' + sum.pos + '</span>' : "")
        + '</div>';
    }
    // ── تنبيهات تحتاج تدخّلاً ──
    var alerts = [];
    if (sum.off) alerts.push({ e: "🚫", t: "غياب اليوم في " + sum.off + " حصة", k: "bad" });
    if (sum.hwN) alerts.push({ e: "📚", t: "لم يحلّ الواجب اليوم في " + sum.hwN + " مادة", k: "warn" });
    if (sum.neg) alerts.push({ e: "⚠️", t: sum.neg + " ملاحظة سلوكية اليوم", k: "warn" });
    if (att != null && att < 85) alerts.push({ e: "📉", t: "نسبة حضوره " + att + "% — دون المعتاد", k: "warn" });
    var late = (C.tasks || []).filter(function (x) { var st = taskState(x); return !C.subs[x.a] && st.left !== null && st.left < 0; });
    if (late.length) alerts.push({ e: "⏰", t: late.length + " ورقة فات موعدها ولم تُحلّ", k: "warn" });
    var open2 = (C.tasks || []).filter(function (x) { return !C.subs[x.a]; }).length;
    if (open2 && !late.length) alerts.push({ e: "✏️", t: open2 + " ورقة أو واجب في انتظاره", k: "info" });
    gl.forEach(function (x) { if (x.g.pct < 50) alerts.push({ e: "📕", t: "مستواه في " + (x.t.subject || "مادة") + " " + Math.round(x.g.pct) + "% — يحتاج متابعة", k: "bad" }); });
    if (alerts.length) {
      h += '<div class="psec">🔔 ما يحتاج متابعتكم</div><div class="pcard alerts">'
        + alerts.map(function (a) { return '<div class="al ' + a.k + '"><span>' + a.e + '</span>' + esc(a.t) + '</div>'; }).join("")
        + '</div>';
    } else {
      h += '<div class="psec">🔔 ما يحتاج متابعتكم</div><div class="pcard mid2 ok2">✅ لا شيء يحتاج تدخّلكم اليوم — بارك الله فيه</div>';
    }
    // ── كل مادة ──
    h += '<div class="psec">📚 مستواه في كل مادة</div>';
    if (!gl.length) {
      h += '<div class="pcard mid2">لم تُرصد درجات بعد في أي مادة</div>';
    } else {
      h += '<div class="pcard nopad"><div class="ptbl"><table><tr><th>المادة</th><th>الدرجة</th><th>النسبة</th><th>التقدير</th><th>الحضور</th><th>مشاركة</th><th>واجبات</th></tr>';
      gl.forEach(function (x) {
        var tt = calcT(x.t.id), a2 = ST.attPct(tt);
        h += '<tr><td class="nm">' + esc(x.t.subject || "مادة") + '<small>' + esc(x.t.name) + '</small></td>'
          + '<td><b>' + x.g.tot + '</b>/' + x.g.max + '</td>'
          + '<td>' + Math.round(x.g.pct) + '%</td>'
          + '<td><span class="lvb sm lv' + x.g.lv.i + '">' + esc(x.g.lv.t) + '</span></td>'
          + '<td>' + (a2 != null ? a2 + "%" : "—") + '</td>'
          + '<td>' + tt.part + '</td>'
          + '<td>' + tt.hwY + (tt.hwN ? '<b class="bad"> / ' + tt.hwN + '</b>' : "") + '</td></tr>';
      });
      h += '</table></div></div>';
    }
    // ── الأسابيع الأخيرة (weekSeries نفسها التي يرسم بها تبويب بطاقتي) ──
    var wk = weekSeries().slice(-4);
    if (wk.length) {
      var top = Math.max.apply(null, wk.map(function (x) { return Math.abs(x.pts); }).concat([1]));
      h += '<div class="psec">📈 آخر أسابيعه</div><div class="pcard"><div class="pbars">'
        + wk.map(function (x) {
          var pc = Math.max(5, Math.round(Math.abs(x.pts) / top * 100));
          return '<div class="pb"><i style="height:' + pc + '%;background:' + (x.pts < 0 ? "var(--bad)" : "var(--ok)") + '"></i>'
            + '<b>' + x.pts + '</b><small>' + esc(x.wk ? ("أسبوع " + x.wk) : x.key) + '</small></div>';
        }).join("") + '</div><div class="pnote">النقاط تجمع الحضور والمشاركة والواجبات والسلوك بأوزان مدرستكم.</div></div>';
    }
    // ── أزرار ──
    h += '<div class="pcard nb"><button class="go gold" id="p-wa">💬 أرسل الملخّص في الواتساب</button>'
      + '<button class="go soft" id="p-msg" style="margin-top:9px">📬 رسائل المعلمين</button>'
      + '<button class="go soft" id="p-cp" style="margin-top:9px">📋 انسخ الملخّص</button></div>';
    box.innerHTML = h;
    var txt = parentText();
    var wa = byId(box, "#p-wa");
    if (wa) wa.onclick = function () {
      var n = parentWa();
      var url = "https://wa.me/" + (n || "") + "?text=" + encodeURIComponent(txt);
      try { window.open(url, "_blank", "noopener"); } catch (e) { location.href = url; }
    };
    var cp = byId(box, "#p-cp");
    if (cp) cp.onclick = function () { try { navigator.clipboard.writeText(txt); ST.toast("نُسخ ✅"); } catch (e) { ST.toast("انسخه يدوياً 🙂"); } };
    var mb = byId(box, "#p-msg");
    if (mb) mb.onclick = function () { pClose(); try { ST.go("msg"); } catch (e) { } };
  }
  /* ══════════════════════════ الوضع التجريبي: بيانات وهمية على هذا الجهاز وحده ══════════════════════════
     تُزرع بالمسارات نفسها التي تُقرأ بها من السحابة، فيُختبر المنطق كاملاً بلا شبكة ولا App Check
     (وهو ما فعلته النواة في demoSeed لبصمات الهويات). ولا تعمل ذرّةً منها على النسخة السحابية،
     ولا تُزرع إلا لفصل الطالب الذي دخل — فلا تُملأ ذاكرة المتصفح ببيانات فصول لا يراها. */
  var DEMOP = null;
  function demoReady() {
    if (ST.CLOUD) return Promise.resolve();
    if (DEMOP) return DEMOP;
    DEMOP = seedDemo();
    return DEMOP;
  }
  function seedDemo() {
    var db = ST.db, S = ST.S;
    if (!db || !db.doc || !S) return Promise.resolve();
    var KEY = "sijil.s.demoContent." + S.cid;
    try { if (localStorage.getItem(KEY)) return Promise.resolve(); } catch (e) { return Promise.resolve(); }
    var mine = ST.myTeachers();
    if (!mine.length) return Promise.resolve();
    var now = Date.now(), day = 86400000, wk = curWeek(), term = TERM(), jobs = [], list = [];
    var isoLocal = function (ms) {
      var d = new Date(ms), q = function (n) { return (n < 10 ? "0" : "") + n; };
      return d.getFullYear() + "-" + q(d.getMonth() + 1) + "-" + q(d.getDate()) + "T" + q(d.getHours()) + ":" + q(d.getMinutes());
    };
    // ثلاث أوراق: واحدة مضى موعدها ومحلولة، وواحدة قادمة بعد يومين، وواحدة فات موعدها ولم تُحلّ
    [["ورقة عمل الأسبوع", "ws", -2 * day, 3], ["اختبار قصير", "quiz", 2 * day, 1], ["تدريب إضافي", "ws", -1 * day, 3]]
      .forEach(function (row, k) {
        var t = mine[k % mine.length];
        list.push({
          a: "d" + String(S.cid).replace(/[^a-z0-9]/g, "") + k,
          t: row[0] + " — " + (t.subject || "مادة"),
          due: isoLocal(now + row[2]), tid: t.id, mode: row[1], n: 6,
          wk: wk, code: subjCode(t.subject) + (S.gc || 4) + term, tries: row[3], ts: now - (k + 1) * day
        });
      });
    jobs.push(db.doc("assignidx/" + S.cid).set({ list: list, tn: "تجريبي", ts: now }));
    jobs.push(db.doc("subs/" + list[0].a + "_" + S.si).set({
      a: list[0].a, si: S.si, n: "", sc: 5, mx: 6, att: 1, best: 5, secs: 300, late: false, ts: now - 2 * day
    }));
    // مقطع يوتيوب ومرفق لدرس الأسبوع الحالي في مادة أول معلم له كود منهج (لاختبار «دروسي»)
    var withCode = mine.filter(function (t) { return subjCode(t.subject); })[0];
    if (withCode) {
      var code = subjCode(withCode.subject) + (S.gc || 4) + term;
      jobs.push(db.doc("lessonyt/" + code + "w" + wk).set({ url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", tn: "تجريبي", ts: now }));
      jobs.push(db.doc("filesidx/" + withCode.id).set({
        list: [{ id: "demo01", n: "ورقة تدريب الدرس.pdf", t: "application/pdf", sz: 120000, scope: "lesson", ref: { code: code, wk: wk }, ts: now }],
        tn: "تجريبي", ts: now
      }));
    }
    return Promise.all(jobs).then(function () {
      try { localStorage.setItem(KEY, "1"); } catch (e) { }
    }, function () { });
  }
})();
