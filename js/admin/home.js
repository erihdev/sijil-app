/* ═══════════ لوحة مدير المدرسة — 🏫 المدرسة (home) + 📄 التقارير (reports) + 📊 المستويات (levels) (js/admin/home.js) ═══════════
   تعتمد على window.SIJIL (الحالة الحية) وwindow.SIJIL_ADMIN (النواة: schoolDocs / classDocsOf / الطباعة / المكوّنات).
   كل الاشتقاق من schoolDocs() مرة واحدة ثم حسابات محلية — لا استعلام داخل الحلقات. كل جدول داخل .table-scroll وكل عرض يُطبع عبر SIJIL.printDoc (صفحة واحدة). */
(function () {
  "use strict";
  const S = () => window.SIJIL, A = () => window.SIJIL_ADMIN;
  if (!A()) return;
  const esc = (s) => S().esc(s);
  const H = () => A().H;
  const $ = (q, root) => (root || document).querySelector(q);
  const WDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"];
  const LV = ["ممتاز", "جيد جداً", "جيد", "مقبول", "دون المطلوب"];
  const MED = ["🥇", "🥈", "🥉"];
  const r1 = (x) => Math.round(x * 10) / 10;
  const avgOf = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const pctTxt = (p) => p == null ? "—" : Math.round(p) + "%";
  // نسبة داخل نص عربي: تُعزل حتى لا تنقلب علامة % في RTL — وكذلك المدى الزمني «7:00–7:45»
  const pctB = (p) => p == null ? "—" : `<bdi>${Math.round(p)}%</bdi>`;
  const ltr = (s) => `<bdi dir="ltr">${s}</bdi>`;
  const shortName = (n) => String(n || "").replace(/^(أ\.|الأستاذ)\s*/, "").split(/\s+/).slice(0, 2).join(" ");
  // تمييز العدد في العربية (جمع القلة 3–10 ثم التمييز المفرد المنصوب)
  const nDays = (n) => n === 1 ? "يوم واحد" : n === 2 ? "يومان" : (n >= 3 && n <= 10) ? `${n} أيام` : `${n} يوماً`;
  const nTeachers = (n) => n === 1 ? "معلم واحد" : n === 2 ? "معلمان" : (n >= 3 && n <= 10) ? `${n} معلمين` : `${n} معلماً`;
  // تعريف «المعلمين» واحد في كل اللوحة (core.js): غير إداري وله فصل مسند — حتى لا تختلف الأعداد بين التبويبات
  const staff = () => (typeof A().staff === "function" ? A().staff() : (S().D.teachers || []).filter(t => !t.admin && (t.classes || []).length));

  /* ═══ CSS الوحدة (يُحقن مرة واحدة) ═══ */
  function css() {
    if ($("#adm-home-css")) return;
    const st = document.createElement("style"); st.id = "adm-home-css";
    st.textContent = `
.adm-hero{background:linear-gradient(150deg,var(--navy),var(--navy2));color:#fff;border:none;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.adm-hero .d{font-size:13px;color:#c9d5e3}.adm-hero .w{font-size:19px;font-weight:800;color:var(--goldl);margin-top:2px}
.adm-hero .now{background:rgba(215,169,63,.18);border:1px solid var(--gold);color:var(--goldl);border-radius:12px;padding:8px 12px;font-weight:800;font-size:13px;white-space:nowrap}
.kpis.six{grid-template-columns:repeat(3,1fr)}@media(min-width:640px){.kpis.six{grid-template-columns:repeat(6,1fr)}}
.kpi .s{font-size:10.5px;color:#9fb0c3;margin-top:1px}
.adm-grid{table-layout:fixed;min-width:620px}.adm-grid td{padding:4px 3px;font-size:11px;line-height:1.35;vertical-align:middle}
.adm-grid th:first-child,.adm-grid td.nm{position:sticky;right:0;z-index:2}
.adm-grid td.nm{min-width:78px;background:#fff;box-shadow:1px 0 0 var(--line)}
.adm-grid tr:nth-child(even) td.nm{background:#fbf8f1}
.adm-grid td .sj{font-weight:800;color:var(--navy);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal}
.adm-grid td .tn{color:var(--muted);font-size:10px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.adm-grid th.now,.adm-grid td.now{background:#fdf6e3!important;box-shadow:inset 0 0 0 2px var(--gold)}
.adm-grid th.now{background:var(--gold)!important;color:var(--navy)!important}
.adm-grid .pt{display:block;font-size:9px;font-weight:500;opacity:.8}
.adm-grid th .dot{display:none}.adm-grid th.now .dot{display:inline}
.adm-grid th.brk,.adm-grid td.brk{background:#f3efe4;color:#8a7a4e;min-width:34px;width:34px;padding:2px 1px;text-align:center;font-size:10px}
.adm-grid th.brk .pt{font-size:7.5px;line-height:1.2;opacity:.9;white-space:normal}
.hm-brk{background:#fff8e6;border:1.5px solid #f0d9a0;color:#7a5a0d;border-radius:12px;padding:9px 12px;font-weight:800;font-size:13.5px;text-align:center;margin-bottom:8px}
.hm-brk[hidden]{display:none!important}
.adm-alerts{display:grid;grid-template-columns:1fr;gap:10px}@media(min-width:700px){.adm-alerts{grid-template-columns:1fr 1fr}}
.adm-alerts .card{margin:0}.adm-alerts h3{justify-content:space-between}.adm-alerts h3 .n{background:var(--bad);color:#fff;border-radius:12px;padding:1px 9px;font-size:12px}
.adm-alerts h3 .n.ok{background:var(--ok)}.adm-alerts .al span:first-child{line-height:1.5}
.adm-alerts .more{background:none;border:none;color:var(--navy);font-weight:800;cursor:pointer;font-family:inherit;padding:6px 2px;font-size:13px}
.adm-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px}@media(min-width:640px){.adm-acts{grid-template-columns:repeat(4,1fr)}}
.adm-acts .btn-gold{text-align:center;padding:12px 8px;font-size:14px}
.adm-sec{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.adm-sec .t{font-weight:800;color:var(--navy);font-size:15px}.adm-sec .sub{color:var(--muted);font-size:12px}
.adm-rep{border-top:3px solid var(--gold)}
.adm-honor{display:grid;grid-template-columns:1fr;gap:8px}@media(min-width:640px){.adm-honor{grid-template-columns:1fr 1fr 1fr}}
.adm-honor .hc{background:#fbf8f1;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:13px}
.adm-honor .hc b{display:block;color:var(--navy);margin-bottom:4px}.adm-honor .hc div{padding:2px 0;display:flex;justify-content:space-between}
.adm-lvl .chip-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
.lvbar{display:flex;height:12px;border-radius:6px;overflow:hidden;background:#eee;min-width:90px}.lvbar i{display:block;height:100%}
.lv0{background:#2e9e5b}.lv1{background:#7cc242}.lv2{background:#e6b422}.lv3{background:#ef8a3c}.lv4{background:#d64545}
.adm-legend{display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);margin-top:6px}.adm-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;vertical-align:-1px;margin-inline-end:3px}
@media print{.adm-acts,.adm-sec button{display:none!important}}`;
    document.head.appendChild(st);
  }

  /* ═══ أدوات زمنية ═══ */
  const today = () => A().isoDate();
  function weekStart() { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return A().isoDate(d); }     // الأحد
  const hCache = {};
  function hijriMonthKey(dateStr) { if (hCache[dateStr]) return hCache[dateStr]; let k = ""; try { const h = S().hijriParts(new Date(dateStr + "T12:00:00")); k = h.y + "-" + h.m; } catch (e) { k = String(dateStr).slice(0, 7); } return hCache[dateStr] = k; }
  const thisHijriMonth = () => hijriMonthKey(today());
  const hijriMonthName = () => { try { return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { month: "long" }).format(new Date()); } catch (e) { return "هذا الشهر"; } };
  // تصنيف حالة الحضور إلى 5 فئات: 0 حاضر · 1 غائب · 2 متأخر · 3 مستأذن/بعذر · 4 أخرى — والأسوأ يغلب عند تعدد المعلمين في اليوم نفسه
  const BUCKET_N = ["حاضر", "غائب", "متأخر", "مستأذن", "أخرى"];
  const PRIO = { 1: 4, 2: 3, 3: 2, 0: 1, 4: 0 };
  let bucketMap = null;
  function bucketOf(a) {
    if (!bucketMap) bucketMap = S().STATES.map(st => { const n = st.name || ""; return /عذر|مستأذن/.test(n) ? 3 : /غائب|هارب/.test(n) ? 1 : /متأخر/.test(n) ? 2 : /حاضر|عن بعد/.test(n) ? 0 : 4; });
    const b = bucketMap[a]; return b == null ? 4 : b;
  }

  /* ═══ اشتقاقات من schoolDocs (مخبّأة لكل عملية رسم) ═══ */
  function ctx(sd) { return { sd, ag: {}, docs: {} }; }
  // «جارِ الجمع…» تظهر أول مرة فقط — إعادة الرسم بعدها (شريحة/تنبيه) لا تُومض المحتوى
  function loading(box, title) { if (box.dataset.ready) return; box.innerHTML = H().card(title, H().empty("جارِ جمع بيانات المدرسة…")); }
  const docsOf = (cx, cid) => cx.docs[cid] || (cx.docs[cid] = A().classDocsOf(cx.sd, cid));
  // تجميع طلاب الفصل النشطين عبر كل معلميه: [{i, s, per:[{tid,subject,t,pct}], pts, days, n, st[], att, avg, low:[]}]
  function classAgg(cx, cid) {
    if (cx.ag[cid]) return cx.ag[cid];
    const s = S(), c = s.classById(cid); if (!c) return cx.ag[cid] = { c: null, docs: [], rows: [], maxTot: 0 };
    const docs = docsOf(cx, cid), maxTot = s.maxTotal();
    const rows = s.activeStudents(c).map(({ s: st, i }) => {
      // النسبة من البنود المرصودة حتى الآن (SIJIL.gradePct) لا من 100 — قبل رصد الاختبارات سقف البنود التلقائية 40
      const per = docs.map(dc => { const t = s.calcStudent(cid, i, dc.recs || {}); const has = s.hasGrades(cid, i, dc.grades || {}, dc.recs || {}); return { tid: dc.tid, subject: dc.subject, tname: dc.tname, t, pct: has ? s.gradePct(cid, i, dc.grades || {}, dc.recs || {}) : null, gmax: has ? s.gradedMax(cid, i, dc.grades || {}, dc.recs || {}) : 0 }; });
      let pts = 0, days = 0, n = 0; const stc = s.STATES.map(() => 0);
      per.forEach(x => { if (x.t.days) { n++; days += x.t.days; pts += x.t.pts; x.t.st.forEach((v, k) => stc[k] += v); } });
      const marks = stc.reduce((a, b) => a + b, 0), att = marks ? Math.round(stc[0] / marks * 100) : null;
      const ps = per.filter(x => x.pct != null).map(x => x.pct), avg = ps.length ? Math.round(avgOf(ps)) : null;
      return { i, s: st, c, per, pts: r1(pts), days, n, st: stc, att, avg, low: per.filter(x => x.pct != null && x.pct < 50) };
    });
    return cx.ag[cid] = { c, docs, rows, maxTot };
  }
  // علامات يوم واحد لفصل: { si: bucket } (الأسوأ يغلب) — وdates(cx,cid) كل تواريخ الرصد في الفصل
  function dayMarks(cx, cid, date) {
    const out = {};
    docsOf(cx, cid).forEach(dc => { const day = (dc.recs || {})[date] || {}; Object.keys(day).forEach(si => { const e = day[si]; if (!e || e.a == null) return; const b = bucketOf(e.a); if (out[si] == null || PRIO[b] > PRIO[out[si]]) out[si] = b; }); });
    return out;
  }
  function classDates(cx, cid) { const set = new Set(); docsOf(cx, cid).forEach(dc => Object.keys(dc.recs || {}).forEach(d => { if (Object.keys(dc.recs[d] || {}).length) set.add(d); })); return [...set].sort(); }
  // حضور فصل عبر تواريخ: { cnt:[5], marked, absentees:[{si, n}] }
  function attendance(cx, cid, dates) {
    const c = S().classById(cid), cnt = [0, 0, 0, 0, 0], abs = {}; let marked = 0;
    dates.forEach(d => { const m = dayMarks(cx, cid, d); Object.keys(m).forEach(si => { if (!S().isActive(c, +si)) return; cnt[m[si]]++; marked++; if (m[si] === 1) abs[si] = (abs[si] || 0) + 1; }); });
    return { cnt, marked, absentees: Object.keys(abs).map(si => ({ si: +si, s: c.students[si], n: abs[si] })).sort((a, b) => b.n - a.n) };
  }
  const attPctOf = (att) => att.marked ? Math.round(att.cnt[0] / att.marked * 100) : null;
  /* الوضع التجريبي: مستندات DB بلا معرّف معلم — ما رُصد على هذا الجهاز يُنسب لمن رصده فعلاً (DB.by)،
     وما جاء مع البيانات التجريبية يُنسب تقديراً إلى أحد معلمي الفصل. نُعلنها في الشاشات التي تسمّي معلماً. */
  const demoNote = (sd) => (sd && (sd.demoGuess || []).length)
    ? H().note("🧪 في النسخة التجريبية لا يحمل الرصد معرّف معلم: ما رصدته على هذا الجهاز يُنسب إليك، وبقية الرصد يُنسب إلى أحد معلمي الفصل تقديراً — لا إلى معلم بعينه.")
    : "";
  const demoNoteP = (sd) => (sd && (sd.demoGuess || []).length) ? '<div class="note">🧪 نسخة تجريبية: نسبة الرصد إلى المعلمين تقديرية.</div>' : "";
  // آخر رصد لمعلم عبر كل فصوله + أيام الرصد منذ تاريخ
  function teacherStats(cx, tid, since) {
    const docs = A().teacherDocsOf(cx.sd, tid); let last = null; const days = new Set(); let comms = 0;
    docs.forEach(dc => { const l = A().lastRecDate(dc.recs); if (l && (!last || l > last)) last = l; Object.keys(dc.recs || {}).forEach(d => { if (d >= since && Object.keys(dc.recs[d] || {}).length) days.add(d); }); comms += (dc.comms || []).length; });
    const assign = (cx.sd.assign || []).filter(a => a.tid === tid).length;
    return { last, weekDays: days.size, comms, assign, classes: docs.length };
  }
  // طلاب غابوا ≥ 3 أيام في الشهر الهجري الحالي (يوم الغياب يُعدّ مرة واحدة ولو رصده أكثر من معلم)
  function absentAlerts(cx) {
    const mk = thisHijriMonth(), out = [];
    A().sortedClasses().forEach(c => {
      const dates = classDates(cx, c.id).filter(d => hijriMonthKey(d) === mk), per = {};
      dates.forEach(d => { const m = dayMarks(cx, c.id, d); Object.keys(m).forEach(si => { if (m[si] === 1 && S().isActive(c, +si)) per[si] = (per[si] || 0) + 1; }); });
      Object.keys(per).forEach(si => { if (per[si] >= 3) out.push({ c, si: +si, s: c.students[si], n: per[si] }); });
    });
    return out.sort((a, b) => b.n - a.n);
  }
  const noRecClasses = (cx) => { const ws = weekStart(); return A().sortedClasses().filter(c => !classDates(cx, c.id).some(d => d >= ws)); };
  const idleTeachers = (cx) => staff().map(t => ({ t, st: teacherStats(cx, t.id, weekStart()) })).filter(x => { const dd = A().daysAgo(x.st.last); return dd == null || dd >= 7; }).sort((a, b) => (A().daysAgo(b.st.last) == null ? 9999 : A().daysAgo(b.st.last)) - (A().daysAgo(a.st.last) == null ? 9999 : A().daysAgo(a.st.last)));
  const lowStudents = (cx) => { const out = []; A().sortedClasses().forEach(c => classAgg(cx, c.id).rows.forEach(r => { if (r.low.length) out.push(r); })); return out.sort((a, b) => b.low.length - a.low.length || (a.avg || 0) - (b.avg || 0)); };

  /* ═══ نسخة احتياطية شاملة (JSON واحد بلا كلمات سر) ═══ */
  async function fullBackup() {
    const s = S(), Ad = A();
    if (typeof Ad.backupAll === "function") return Ad.backupAll();     // وحدة الإدارة إن وفّرتها
    const sd = await Ad.schoolDocs(true);
    const teachers = (s.D.teachers || []).map(t => { const x = Object.assign({}, t); delete x.pinHash; return x; });
    const out = { v: 3, kind: "sijil-school-backup", school: s.META.school.name, ts: Date.now(), cloud: !!s.CLOUD, teachers, classes: s.D.classes, schedule: s.D.schedule || [], recs: sd.recs, grades: sd.grades, comms: sd.comms, moves: sd.moves, assign: sd.assign, sedits: sd.sedits, adminlog: sd.adminlog, subs: s.SUBS || {} };
    const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "نسخة مدرسية شاملة - " + s.META.school.name + " - " + today() + ".json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    Ad.toast("⬇️ جارِ تنزيل النسخة الشاملة");
    return out;
  }

  /* ═══ جدول اليوم من محرك الأجراس (core.js) — لا وقت ولا عدد حصص مثبّت هنا ═══ */
  // أعمدة اليوم بالترتيب: حصص {p, t:"7:00–7:45"} وفسح {brk, n, t} — وأي حصة في الجدول المحفوظ خارج الإعداد تُضاف بلا وقت حتى لا تُخفى
  function dayCols(day, rows) {
    const Ad = A(), out = [], have = {};
    (Ad.periodsOf(day) || []).forEach(x => {
      const t = Ad.hm(x.from) + "–" + Ad.hm(x.to);
      if (x.brk) out.push({ brk: true, n: x.n, t: t }); else { out.push({ p: x.p, t: t }); have[x.p] = 1; }
    });
    const ex = [];
    (rows || []).forEach(r => { const p = Number(r.p) || 0; if (p > 0 && p <= 12 && !have[p] && ex.indexOf(p) < 0) ex.push(p); });
    ex.sort((a, b) => a - b).forEach(p => out.push({ p: p, t: "" }));
    return out;
  }
  // نص «الآن» في الترويسة: فسحة جارية ⇐ اسمها ووقت انتهائها، وإلا الحصة الحالية بوقتها
  function nowText(tName, pNow, bNow) {
    const Ad = A();
    if (!WDAYS.includes(tName)) return "لا دوام اليوم";
    if (bNow) return `☕ ${esc(String(bNow.n))} — تنتهي ${ltr(bNow.ends)}`;
    return pNow ? `الآن: الحصة ${esc(Ad.ord(pNow))} ${ltr(Ad.periodTime(pNow))}` : "خارج وقت الحصص";
  }
  const brkBarTxt = (b) => `☕ ${esc(String(b.n))} — تنتهي ${ltr(b.ends)}`;
  /* «الآن» يتحدّث كل نصف دقيقة بلا إعادة رسم: نص الترويسة وشريط الفسحة وعمود الحصة الجارية */
  let nowTimer = null;
  function startTicker(box, day, tName) {
    if (nowTimer) { clearInterval(nowTimer); nowTimer = null; }
    const upd = () => {
      try {
        const Ad = A(), nowEl = $("#hm-now", box);
        if (!nowEl || !document.body.contains(nowEl)) { clearInterval(nowTimer); nowTimer = null; return; }
        const pN = Ad.periodNow(), bN = Ad.breakNow(), isT = day === tName;
        nowEl.innerHTML = "🕐 " + nowText(tName, pN, bN);
        const bar = $("#hm-brk", box);
        if (bar) { bar.hidden = !(isT && bN); if (isT && bN) bar.innerHTML = brkBarTxt(bN); }
        box.querySelectorAll("#hm-grid [data-p]").forEach(el => el.classList.toggle("now", !!(isT && Number(el.dataset.p) === pN)));
        box.querySelectorAll("#hm-grid th[data-brk]").forEach(el => el.classList.toggle("now", !!(isT && bN && el.dataset.brk === String(bN.n))));
      } catch (e) { clearInterval(nowTimer); nowTimer = null; }
    };
    try { nowTimer = setInterval(upd, 30000); } catch (e) { }
  }

  /* ═══════════ 🏫 المدرسة — لوحة القيادة ═══════════ */
  let homeDay = null, showAll = {};
  async function admHome(box) {
    css(); const s = S(), Ad = A(), h = H();
    loading(box, "🏫 المدرسة");
    const sd = await Ad.schoolDocs(), cx = ctx(sd);
    const D = s.D, cls = Ad.sortedClasses(), tName = Ad.todayName(), td = today(), pNow = Ad.periodNow(), bNow = Ad.breakNow();
    const day = homeDay || (WDAYS.includes(tName) ? tName : WDAYS[0]);
    // ── المؤشرات الستة
    const students = cls.reduce((a, c) => a + s.activeCount(c), 0), teachers = staff();
    const todayRows = (D.schedule || []).filter(r => r.d === tName);
    const marked = teachers.filter(t => Ad.teacherDocsOf(sd, t.id).some(dc => Object.keys(((dc.recs || {})[td]) || {}).length)).length;
    let allMarks = 0, present = 0; cls.forEach(c => { const m = dayMarks(cx, c.id, td); Object.keys(m).forEach(si => { if (!s.isActive(c, +si)) return; allMarks++; if (m[si] === 0) present++; }); });
    const attToday = allMarks ? Math.round(present / allMarks * 100) : null;
    const kpis = h.kpis([
      { v: cls.length, l: "الفصول", id: "kp-classes" }, { v: students, l: "الطلاب النشطون", id: "kp-students" }, { v: teachers.length, l: "المعلمون", id: "kp-teachers" },
      { v: todayRows.length, l: "حصص اليوم", id: "kp-periods", title: tName }, { v: `${marked}<span style="font-size:13px;color:#c9d5e3">/${teachers.length}</span>`, l: "من رصد اليوم", id: "kp-marked" },
      { v: attToday == null ? "—" : attToday + "%", l: "حضور اليوم", id: "kp-att", title: allMarks ? `${present} حاضر من ${allMarks} مرصود` : "لا رصد اليوم بعد" }]).replace('class="kpis"', 'class="kpis six"');
    // ── جدول اليوم: الحصص × الفصول (الأعمدة كلها من محرك الأجراس، والفسح أعمدة فاصلة)
    const rowsDay = (D.schedule || []).filter(r => r.d === day);
    const cols = dayCols(day, rowsDay), isToday = day === tName;
    const isNow = (p) => p === pNow && isToday;
    const brkOn = (x) => !!(isToday && bNow && x.n === bNow.n);
    const cell = (c, p) => { const r = rowsDay.find(x => x.c === c.id && x.p === p); if (!r) return `<td class="${isNow(p) ? "now" : ""}" data-p="${p}" style="color:#ccc">—</td>`; const t = Ad.teacherByName(r.t); return `<td class="${isNow(p) ? "now" : ""}" data-p="${p}" title="${esc(r.t + (t ? " — " + t.subject : ""))}"><span class="sj">${esc(t ? t.subject : "—")}</span><span class="tn">${esc(shortName(r.t))}</span></td>`; };
    const grid = `<div class="table-scroll" id="hm-grid"><table class="report-table adm-grid"><tr><th style="min-width:78px">الفصل</th>${cols.map(x => x.brk
      ? `<th class="brk${brkOn(x) ? " now" : ""}" data-brk="${esc(x.n)}" title="${esc(x.n + " " + x.t)}">☕<span class="pt">${ltr(x.t)}</span></th>`
      : `<th class="${isNow(x.p) ? "now" : ""}" data-p="${x.p}">ح${x.p}<span class="dot"> ●</span><span class="pt">${x.t ? ltr(x.t) : "&nbsp;"}</span></th>`).join("")}</tr>
      ${cls.map(c => `<tr><td class="nm">${esc(c.name)}</td>${cols.map(x => x.brk ? `<td class="brk" data-brk="${esc(x.n)}"></td>` : cell(c, x.p)).join("")}</tr>`).join("")}</table></div>`;
    const brkBar = `<div class="hm-brk" id="hm-brk"${(isToday && bNow) ? "" : " hidden"}>${(isToday && bNow) ? brkBarTxt(bNow) : ""}</div>`;
    const nowTxt = nowText(tName, pNow, bNow);
    // ── التنبيهات الذكية الأربعة
    const abs = absentAlerts(cx), noRec = noRecClasses(cx), idle = idleTeachers(cx), low = lowStudents(cx);
    const list = (key, items, render, emptyMsg) => {
      const all = !!showAll[key], vis = all ? items : items.slice(0, 5);
      return `<div class="alert-list">${items.length ? vis.map(render).join("") : `<div class="empty-note" style="padding:12px 6px">${emptyMsg}</div>`}</div>${items.length > 5 ? `<button class="more" data-more="${key}">${all ? "إخفاء" : `عرض الكل (${items.length})`} ›</button>` : ""}`;
    };
    const badge = (n) => `<span class="n ${n ? "" : "ok"}">${n ? n : "✓"}</span>`;
    const alerts = `<div class="adm-alerts">
      ${h.card(`<span>🚨 غياب متكرر (${esc(hijriMonthName())})</span>${badge(abs.length)}`, list("abs", abs, x => `<div class="al"><span>${esc(x.s.n)} <small style="color:var(--muted)">— ${esc(x.c.name)}</small></span><span class="pts">${nDays(x.n)}</span></div>`, "لا طلاب غابوا 3 أيام فأكثر هذا الشهر 🌟"))}
      ${h.card(`<span>📭 فصول بلا رصد هذا الأسبوع</span>${badge(noRec.length)}`, list("norec", noRec, c => `<div class="al"><span>${esc(c.name)}</span><span style="color:var(--muted);font-size:12px">${nTeachers(Ad.classTeachers(c.id).filter(t => !t.admin).length)}</span></div>`, "كل الفصول فيها رصد هذا الأسبوع ✅"))}
      ${h.card(`<span>⏳ معلمون بلا رصد منذ 7 أيام</span>${badge(idle.length)}`, list("idle", idle, x => `<div class="al"><span>${esc(x.t.name)} <small style="color:var(--muted)">— ${esc(x.t.subject)}</small></span><span class="pts">${x.st.last ? `منذ ${nDays(Ad.daysAgo(x.st.last))}` : "لم يبدأ"}</span></div>`, "كل المعلمين رصدوا خلال الأسبوع 👏"))}
      ${h.card(`<span>📉 طلاب دون 50% في مادة</span>${badge(low.length)}`, list("low", low, r => `<div class="al"><span>${esc(r.s.n)} <small style="color:var(--muted)">— ${esc(r.c.name)}</small></span><span class="pts" style="font-size:12px">${r.low.map(x => `${esc(x.subject)} ${pctB(x.pct)}`).join("، ")}</span></div>`, "لا طلاب دون 50% في أي مادة 🌟"))}
    </div>`;
    box.innerHTML = `
      <div class="card adm-hero"><div><div class="d">${esc(s.hijriLabel())}</div><div class="w">أهلاً بك يا مدير المدرسة 👋</div><div class="d" style="margin-top:3px">${esc(s.META.school.name)}</div></div><div class="now" id="hm-now">🕐 ${nowTxt}</div></div>
      ${kpis}
      ${demoNote(sd)}
      ${h.card(`🗓️ جدول حصص ${esc(day === tName ? "اليوم" : "يوم")} (${esc(day)})`, `<div class="adm-sec"><div class="class-chips" id="hm-days" style="padding:0;margin:0">${WDAYS.map(d => `<button class="chip ${d === day ? "on" : ""}" data-k="${d}" style="padding:6px 12px;font-size:12.5px">${d}</button>`).join("")}</div>${h.printBtn("hm-print-grid", "🖨️ طباعة")}</div>${brkBar}${grid}<div class="adm-legend"><span>● الحصة الحالية</span><span>☕ فسحة</span><span>${esc(Ad.bellLine(day))}</span></div>`)}
      <div class="adm-sec"><div class="t">🔔 تنبيهات ذكية</div><button class="btn-plain" id="hm-refresh" style="flex:0 0 auto;padding:8px 12px">🔄 تحديث</button></div>
      ${alerts}
      ${h.card("⚡ إجراءات سريعة", `<div class="adm-acts"><button class="btn-gold" id="qa-moves">👥 نقل الطلاب</button><button class="btn-gold" id="qa-levels">📊 مستويات المدرسة</button><button class="btn-gold" id="qa-att">🖨️ تقرير حضور اليوم</button><button class="btn-gold" id="qa-backup">⬇️ نسخة احتياطية شاملة</button></div>`)}`;
    box.dataset.ready = "1";
    startTicker(box, day, tName);
    h.bindChips($("#hm-days", box), (k) => { homeDay = k; admHome(box); });
    box.querySelectorAll("[data-more]").forEach(b => b.onclick = () => { showAll[b.dataset.more] = !showAll[b.dataset.more]; admHome(box); });
    $("#hm-refresh", box).onclick = async () => { Ad.invalidate(); delete box.dataset.ready; await admHome(box); Ad.toast("🔄 حُدِّثت البيانات"); };
    $("#hm-print-grid", box).onclick = () => Ad.printHtml(`جدول حصص يوم ${day}`, gridPrint(cls, rowsDay, cols, isToday ? pNow : 0) + `<div class="note">🔔 ${esc(Ad.bellLine(day))}</div>` + Ad.sigLine(["vice", "principal"]), { land: true, sub: "الجدول المدرسي" });
    $("#qa-moves", box).onclick = () => { if ((Ad.modules() || []).includes("students")) s.switchTab("students"); else s.adminMoves(); };
    $("#qa-levels", box).onclick = () => s.switchTab("levels");
    $("#qa-att", box).onclick = () => printAttendance(cx, "day");
    $("#qa-backup", box).onclick = () => fullBackup().catch(e => Ad.toast("⚠️ تعذّر إنشاء النسخة"));
  }
  function gridPrint(cls, rows, cols, pNow) {
    const Ad = A();
    const head = cols.map(x => x.brk
      ? `<th style="background:#f3efe4;color:#7a6a44;width:30px;font-size:9px">☕<br><small dir="ltr" style="font-size:7px">${esc(x.t)}</small></th>`
      : `<th${x.p === pNow ? ' style="background:#D7A93F;color:#0E2033"' : ""}>ح${x.p}<br><small dir="ltr">${esc(x.t)}</small></th>`).join("");
    return `<table class="compact"><tr><th>الفصل</th>${head}</tr>
      ${cls.map(c => `<tr><td class="nm"><b>${esc(c.name)}</b></td>${cols.map(x => { if (x.brk) return '<td style="background:#f7f3e8"></td>'; const r = rows.find(y => y.c === c.id && y.p === x.p); if (!r) return "<td>—</td>"; const t = Ad.teacherByName(r.t); return `<td><b>${esc(t ? t.subject : "")}</b><br><small>${esc(shortName(r.t))}</small></td>`; }).join("")}</tr>`).join("")}</table>`;
  }

  /* ═══════════ 📄 التقارير الأربعة ═══════════ */
  // 1) الحضور: اليوم / الأسبوع لكل الفصول
  function attendanceData(cx, mode) {
    const ws = weekStart(), td = today(), cls = A().sortedClasses();
    const rows = cls.map(c => { const dates = mode === "day" ? [td] : classDates(cx, c.id).filter(d => d >= ws && d <= td); const a = attendance(cx, c.id, dates); return { c, a, days: dates.length }; });
    const tot = [0, 0, 0, 0, 0]; let marked = 0; rows.forEach(r => { r.a.cnt.forEach((v, k) => tot[k] += v); marked += r.a.marked; });
    const absentees = []; rows.forEach(r => r.a.absentees.forEach(x => absentees.push({ c: r.c, s: x.s, n: x.n })));
    const range = `من ${A().fmtDate(ws)} إلى ${A().fmtDate(td)}`;
    // sub: عنوان فرعي على الشاشة · psub: للطباعة (رأس المستند يطبع التاريخ الهجري أصلاً فلا نكرره)
    return { rows, tot, marked, absentees, title: mode === "day" ? "تقرير حضور اليوم" : "تقرير حضور الأسبوع", sub: mode === "day" ? S().hijriLabel() : range, psub: mode === "day" ? "حضور اليوم — كل الفصول" : "حضور الأسبوع — " + range };
  }
  function attendanceTable(d, print) {
    const other = d.tot[4] > 0;                                  // عمود «أخرى» يظهر فقط إن وُجدت حالات خارج الفئات الأربع
    const cols = ["الفصل"].concat(BUCKET_N.slice(0, other ? 5 : 4), ["المرصود", "نسبة الحضور"]);
    // خلية عددية: 0 صريح حين يوجد رصد، و«—» رمادية حين لا رصد أصلاً في الفصل (لا خانات فارغة تُقرأ خطأً)
    const dash = '<span style="color:#bbb">—</span>';
    const trs = d.rows.map(r => {
      const z = (v) => r.a.marked ? String(v || 0) : dash;
      const c = [esc(r.c.name), z(r.a.cnt[0]), r.a.marked ? (r.a.cnt[1] ? `<b style="color:var(--bad)">${r.a.cnt[1]}</b>` : "0") : dash, z(r.a.cnt[2]), z(r.a.cnt[3])];
      if (other) c.push(z(r.a.cnt[4]));
      return c.concat([r.a.marked || dash, pctTxt(attPctOf(r.a))]);
    });
    const foot = ["الإجمالي", d.tot[0], d.tot[1], d.tot[2], d.tot[3]].concat(other ? [d.tot[4]] : [], [d.marked, d.marked ? Math.round(d.tot[0] / d.marked * 100) + "%" : "—"]);
    if (print) return `<table class="compact"><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>${trs.map(r => `<tr>${r.map((x, j) => `<td${j === 0 ? ' class="nm"' : ""}>${x}</td>`).join("")}</tr>`).join("")}<tr style="font-weight:800;background:#F0D99A">${foot.map(x => `<td>${x}</td>`).join("")}</tr></table>`;
    return H().table(cols, trs, { foot });
  }
  const absenteesHtml = (d, mode) => d.absentees.length ? `<div style="font-weight:800;color:var(--navy);margin:8px 0 4px">${mode === "day" ? "الغائبون اليوم" : "الأكثر غياباً هذا الأسبوع"} (${d.absentees.length})</div><div style="font-size:12.5px;line-height:1.9">${d.absentees.slice(0, 60).map(x => `${esc(x.s.n)} <small style="color:var(--muted)">(${esc(x.c.name)}${mode === "day" ? "" : ` · ${x.n}`})</small>`).join("، ")}${d.absentees.length > 60 ? " …" : ""}</div>` : `<div class="empty-note" style="padding:8px">${d.marked ? "لا غائبين 🌟" : "لا رصد في هذه الفترة بعد"}</div>`;
  function printAttendance(cx, mode) {
    const d = attendanceData(cx, mode);
    A().printHtml(d.title, attendanceTable(d, true) + `<div class="note">${absenteesHtml(d, mode)}</div>` + A().sigLine(["agent", "principal"]), { sub: d.psub, cls: "compact" });
  }
  // 2) نشاط المعلمين
  function teacherRows(cx) { const ws = weekStart(); return staff().map(t => ({ t, st: teacherStats(cx, t.id, ws) })).sort((a, b) => b.st.weekDays - a.st.weekDays || (b.st.last || "").localeCompare(a.st.last || "")); }
  function teacherTable(rows, print) {
    const Ad = A(), cols = ["المعلم", "المادة", "الفصول", "أيام الرصد هذا الأسبوع", "آخر رصد", "أوراق تفاعلية", "رسائل أولياء الأمور"];
    // الأعمدة العددية تُطبع صفراً صريحاً (لا خانة فارغة تُقرأ «لا بيانات»)
    const trs = rows.map(x => { const dd = Ad.daysAgo(x.st.last); return [esc(x.t.name), esc(x.t.subject), (x.t.classes || []).length, x.st.weekDays ? `<b>${x.st.weekDays}</b>` : '<span style="color:var(--bad)">0</span>', x.st.last ? `${Ad.fmtDate(x.st.last)}${dd ? ` <small style="color:${dd >= 7 ? "var(--bad)" : "var(--muted)"}">(منذ ${dd} ي)</small>` : " <small style=\"color:var(--ok)\">(اليوم)</small>"}` : '<span style="color:var(--bad)">لم يبدأ</span>', String(x.st.assign || 0), String(x.st.comms || 0)]; });
    if (print) return `<table class="compact"><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>${trs.map(r => `<tr>${r.map((x, j) => `<td${j === 0 ? ' class="nm"' : ""}>${x}</td>`).join("")}</tr>`).join("")}</table>`;
    return H().table(cols, trs);
  }
  // 3) أوائل المدرسة + لوحة شرف كل فصل
  function topData(cx) {
    const all = []; const perClass = A().sortedClasses().map(c => { const rows = classAgg(cx, c.id).rows.filter(r => r.n > 0).sort((a, b) => b.pts - a.pts || (b.avg || 0) - (a.avg || 0)); rows.forEach(r => all.push(r)); return { c, top: rows.filter(r => r.pts > 0).slice(0, 3) }; });
    return { top10: all.sort((a, b) => b.pts - a.pts || (b.avg || 0) - (a.avg || 0)).filter(r => r.pts > 0).slice(0, 10), perClass };
  }
  function topHtml(d, print) {
    const cols = ["#", "الطالب", "الفصل", "النقاط", "المواد", "المعدل"];
    const trs = d.top10.map((r, k) => [k < 3 ? `<span style="font-size:16px">${MED[k]}</span>` : k + 1, esc(r.s.n), esc(r.c.name), `<b>${r.pts}</b>`, r.n, pctTxt(r.avg)]);
    const table = print ? `<table class="compact"><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>${trs.map(r => `<tr>${r.map((x, j) => `<td${j === 1 ? ' class="nm"' : ""}>${x}</td>`).join("")}</tr>`).join("")}</table>` : H().table(cols, trs, { nameIdx: 1 });
    const hcS = print ? ' style="border:1px solid #e5dcc5;border-radius:8px;padding:5px 7px;background:#fbf8f1"' : "";
    const rwS = print ? ' style="display:flex;justify-content:space-between;gap:6px;padding:1px 0"' : "";
    const nmS = print ? ' style="display:block;font-weight:800;color:#0E2033;margin-bottom:2px;border-bottom:1px solid #e5dcc5;padding-bottom:2px"' : "";
    const honor = `<div class="adm-honor"${print ? ' style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:11px"' : ""}>${d.perClass.map(x => `<div class="hc"${hcS}><b${nmS}>${esc(x.c.name)}</b>${x.top.length ? x.top.map((r, k) => `<div${rwS}><span>${MED[k]} ${esc(r.s.n)}</span><span>${r.pts}</span></div>`).join("") : '<div style="color:#999">لا رصد بعد</div>'}</div>`).join("")}</div>`;
    return { table: d.top10.length ? table : H().empty("لا نقاط مرصودة بعد — ستظهر الأسماء بعد بدء الرصد 🌟"), honor };
  }
  // 4) المتعثرون: دون 50% في مادتين فأكثر
  const strugglers = (cx) => lowStudents(cx).filter(r => r.low.length >= 2);
  function strugglersTable(rows, print) {
    const cols = ["م", "الطالب", "الفصل", "المواد دون 50%", "المعدل العام", "الحضور"];
    const trs = rows.map((r, k) => [k + 1, esc(r.s.n), esc(r.c.name), r.low.map(x => `${esc(x.subject)} <b style="color:var(--bad)">${pctB(x.pct)}</b>`).join("، "), pctTxt(r.avg), pctTxt(r.att)]);
    if (!rows.length) return H().empty("لا طلاب دون 50% في مادتين فأكثر 🌟");
    if (print) return `<table class="compact"><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>${trs.map(r => `<tr>${r.map((x, j) => `<td${j === 1 ? ' class="nm"' : ""}>${x}</td>`).join("")}</tr>`).join("")}</table>`;
    return H().table(cols, trs, { nameIdx: 1 });
  }

  let attMode = "day";
  async function admReports(box) {
    css(); const s = S(), Ad = A(), h = H();
    loading(box, "📄 التقارير");
    const sd = await Ad.schoolDocs(), cx = ctx(sd);
    const att = attendanceData(cx, attMode), tr = teacherRows(cx), td = topData(cx), th = topHtml(td), sg = strugglers(cx);
    const sec = (title, sub, id) => `<div class="adm-sec"><div><div class="t">${title}</div><div class="sub">${sub}</div></div>${h.printBtn(id, "🖨️ طباعة")}</div>`;
    box.innerHTML = `
      <div class="card adm-rep" id="rp-att">${sec("📅 حضور الفصول", esc(att.sub), "rp-p-att")}<div class="class-chips" id="rp-mode" style="padding:0 0 8px">${[["day", "اليوم"], ["week", "هذا الأسبوع"]].map(([k, t]) => `<button class="chip ${k === attMode ? "on" : ""}" data-k="${k}" style="padding:6px 14px;font-size:13px">${t}</button>`).join("")}</div>${attendanceTable(att)}${absenteesHtml(att, attMode)}</div>
      <div class="card adm-rep" id="rp-teachers">${sec("👨‍🏫 نشاط المعلمين", `${tr.length} معلماً بفصول — الأسبوع من ${esc(Ad.fmtDate(weekStart()))}`, "rp-p-teachers")}${tr.length ? teacherTable(tr) : h.empty("لا معلمين مسندين")}${demoNote(sd)}</div>
      <div class="card adm-rep" id="rp-top">${sec("🏆 أوائل المدرسة", "أعلى 10 طلاب بالنقاط المجمّعة عبر كل المواد + لوحة شرف كل فصل", "rp-p-top")}${th.table}<div style="font-weight:800;color:var(--navy);margin:12px 0 6px">🎖️ لوحة شرف الفصول</div>${th.honor}</div>
      <div class="card adm-rep" id="rp-weak">${sec("🩺 الطلاب المتعثرون", `دون 50% في مادتين فأكثر — للخطط العلاجية (${sg.length})`, "rp-p-weak")}${strugglersTable(sg)}</div>`;
    box.dataset.ready = "1";
    h.bindChips($("#rp-mode", box), (k) => { attMode = k; admReports(box); });
    $("#rp-p-att", box).onclick = () => printAttendance(cx, attMode);
    $("#rp-p-teachers", box).onclick = () => Ad.printHtml("تقرير نشاط المعلمين", teacherTable(tr, true) + demoNoteP(sd) + `<div class="note">الأسبوع من ${esc(Ad.fmtDate(weekStart()))} إلى ${esc(Ad.fmtDate(today()))} — أيام الرصد = أيام مختلفة سُجّل فيها حضور أو نقاط.</div>` + Ad.sigLine(["vice", "principal"]), { sub: `نشاط المعلمين (${tr.length} معلماً)`, cls: "compact" });
    $("#rp-p-top", box).onclick = () => { const p = topHtml(td, true); Ad.printHtml("أوائل المدرسة", p.table + `<div class="tt" style="font-size:16px;margin-top:10px">🎖️ لوحة شرف الفصول</div>` + p.honor + `<p style="text-align:center;color:#666;margin-top:10px">نبارك لأبنائنا المتميّزين ونسأل الله لهم دوام التفوّق 🌟</p>` + Ad.sigLine([{ l: "رائد النشاط" }, "principal"]), { sub: "أعلى 10 طلاب بالنقاط + لوحة شرف كل فصل", cls: "compact" }); };
    $("#rp-p-weak", box).onclick = () => Ad.printHtml("الطلاب المتعثرون — للخطط العلاجية", strugglersTable(sg, true) + `<div class="note">الطالب المتعثر: دون 50% من الدرجة الفعلية (المرصودة والمحسوبة) في مادتين فأكثر. يُحوَّل إلى المرشد الطلابي ومعلمي المواد لإعداد خطة علاجية.</div>` + Ad.sigLine(["counselor", "principal"]), { sub: `الخطط العلاجية (${sg.length} طالباً)`, cls: "compact" });
  }

  /* ═══════════ 📊 المستويات (مضمّنة): حسب الفصل / حسب المادة / المدرسة كلها ═══════════ */
  let lvMode = "class", lvClass = null, lvSubject = null;
  const lvBar = (lv) => { const n = lv.reduce((a, b) => a + b, 0); return n ? `<div class="lvbar" title="${lv.map((x, k) => `${LV[k]} ${x}`).join(" · ")}">${lv.map((x, k) => x ? `<i class="lv${k}" style="width:${x / n * 100}%"></i>` : "").join("")}</div>` : "—"; };
  const legend = () => `<div class="adm-legend">${LV.map((l, k) => `<span><i class="lv${k}"></i>${l}</span>`).join("")}</div>`;
  const pcell = (p) => S().pctCell(p);
  // حسب الفصل: طالب × مواده
  function levelsClass(cx, cid, print) {
    const s = S(), ag = classAgg(cx, cid), c = ag.c; if (!c) return "";
    if (!ag.docs.length) return H().empty("لا رصد لهذا الفصل بعد");
    const rows = ag.rows.slice().sort((a, b) => ((b.avg == null ? -1 : b.avg) - (a.avg == null ? -1 : a.avg)) || b.pts - a.pts);
    const head = `<tr><th>م</th><th style="min-width:140px">الطالب</th>${ag.docs.map(dc => `<th title="${esc(dc.tname)}">${esc(dc.subject)}</th>`).join("")}<th>المعدل</th><th>المستوى</th><th>النقاط</th><th>الحضور</th></tr>`;
    const body = rows.map((r, k) => `<tr class="lv-row" data-i="${r.i}" style="cursor:pointer"><td>${k + 1}</td><td class="nm">${esc(r.s.n)}</td>${r.per.map(x => pcell(x.pct)).join("")}${pcell(r.avg)}<td>${r.avg != null ? esc(s.levelOf(r.avg).t) : "—"}</td><td>${r.pts}</td><td>${pctTxt(r.att)}</td></tr>`).join("");
    const foot = `<tr class="tot"><td></td><td class="nm">متوسط الفصل</td>${ag.docs.map((dc, j) => pcell(avgOf(rows.map(r => r.per[j].pct).filter(x => x != null)))).join("")}${pcell(avgOf(rows.map(r => r.avg).filter(x => x != null)))}<td></td><td>${r1(avgOf(rows.map(r => r.pts)) || 0)}</td><td>${pctTxt(avgOf(rows.map(r => r.att).filter(x => x != null)))}</td></tr>`;
    return `<div class="table-scroll"><table class="report-table${print ? " compact" : ""}">${head}${body}${foot}</table></div><div class="empty-note" style="padding:6px">النسب من البنود المرصودة حتى الآن لكل مادة (من أصل ${ag.maxTot} عند اكتمال رصد الاختبارات)${print ? "" : " — انقر اسم الطالب لتقدّمه التفصيلي"}</div>`;
  }
  // حسب المادة: فصل (ومعلمه) × مؤشرات المادة
  function subjectRows(cx, subj) {
    const s = S(), out = [];
    A().sortedClasses().forEach(c => { const ag = classAgg(cx, c.id); ag.docs.forEach((dc, j) => { if (dc.subject !== subj) return; const ps = [], att = [], lv = [0, 0, 0, 0, 0]; let pts = 0; ag.rows.forEach(r => { const x = r.per[j]; if (x.pct != null) { ps.push(x.pct); lv[s.levelOf(x.pct).i]++; } const a = s.attPct(x.t); if (a != null) att.push(a); pts += x.t.pts; }); out.push({ c, dc, n: ps.length, avg: avgOf(ps), att: avgOf(att), lv, pts: r1(pts), students: ag.rows.length }); }); });
    return out;
  }
  const allSubjects = () => [...new Set(staff().map(t => t.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
  function levelsSubject(cx, subj, print) {
    const rows = subjectRows(cx, subj); if (!rows.length) return H().empty("لا رصد في هذه المادة بعد");
    const head = `<tr><th style="min-width:90px">الفصل</th><th style="min-width:120px">المعلم</th><th>الطلاب</th><th>بدرجات</th>${LV.map(l => `<th>${l}</th>`).join("")}<th>المعدل</th><th>الحضور</th><th>النقاط</th>${print ? "" : "<th>التوزيع</th>"}</tr>`;
    const body = rows.map(r => `<tr><td class="nm">${esc(r.c.name)}</td><td class="nm">${esc(shortName(r.dc.tname))}</td><td>${r.students}</td><td>${r.n || ""}</td>${r.lv.map(x => `<td>${x || ""}</td>`).join("")}${pcell(r.avg)}<td>${pctTxt(r.att)}</td><td>${r.pts}</td>${print ? "" : `<td>${lvBar(r.lv)}</td>`}</tr>`).join("");
    const lvT = [0, 0, 0, 0, 0]; rows.forEach(r => r.lv.forEach((x, k) => lvT[k] += x));
    const foot = `<tr class="tot"><td class="nm">المادة كلها</td><td></td><td>${rows.reduce((a, r) => a + r.students, 0)}</td><td>${rows.reduce((a, r) => a + r.n, 0)}</td>${lvT.map(x => `<td>${x || ""}</td>`).join("")}${pcell(avgOf(rows.filter(r => r.avg != null).map(r => r.avg)))}<td>${pctTxt(avgOf(rows.filter(r => r.att != null).map(r => r.att)))}</td><td></td>${print ? "" : `<td>${lvBar(lvT)}</td>`}</tr>`;
    return `<div class="table-scroll"><table class="report-table${print ? " compact" : ""}">${head}${body}${foot}</table></div>${print ? "" : legend()}`;
  }
  // المدرسة كلها: المواد × المستويات + الفصول × المعدل
  function schoolRows(cx) {
    const bySub = {};
    allSubjects().forEach(subj => { const rows = subjectRows(cx, subj); if (!rows.length) return; const lv = [0, 0, 0, 0, 0]; rows.forEach(r => r.lv.forEach((x, k) => lv[k] += x)); const withAvg = rows.filter(r => r.avg != null).sort((a, b) => b.avg - a.avg); bySub[subj] = { n: rows.reduce((a, r) => a + r.n, 0), lv, att: avgOf(rows.filter(r => r.att != null).map(r => r.att)), avg: avgOf(withAvg.map(r => r.avg)), hi: withAvg[0] || null, lo: withAvg.length ? withAvg[withAvg.length - 1] : null }; });
    const classes = A().sortedClasses().map(c => { const ag = classAgg(cx, c.id); const av = ag.rows.map(r => r.avg).filter(x => x != null), at = ag.rows.map(r => r.att).filter(x => x != null); const lv = [0, 0, 0, 0, 0]; av.forEach(p => lv[S().levelOf(p).i]++); return { c, subjects: ag.docs.length, students: ag.rows.length, graded: av.length, avg: avgOf(av), att: avgOf(at), lv, low: ag.rows.filter(r => r.low.length >= 2).length }; });
    return { bySub, classes };
  }
  function levelsSchool(cx, print) {
    const d = schoolRows(cx), subs = Object.keys(d.bySub);
    const t1 = subs.length ? `<div class="table-scroll"><table class="report-table${print ? " compact" : ""}"><tr><th style="min-width:110px">المادة</th><th>بدرجات</th>${LV.map(l => `<th>${l}</th>`).join("")}<th>المعدل</th><th>الحضور</th><th>أعلى فصل</th><th>أدنى فصل</th>${print ? "" : "<th>التوزيع</th>"}</tr>
      ${subs.map(subj => { const v = d.bySub[subj]; return `<tr><td class="nm">${esc(subj)}</td><td>${v.n || ""}</td>${v.lv.map(x => `<td>${x || ""}</td>`).join("")}${pcell(v.avg)}<td>${pctTxt(v.att)}</td><td>${v.hi ? `${esc(v.hi.c.name)} ${pctB(v.hi.avg)}` : "—"}</td><td>${v.lo ? `${esc(v.lo.c.name)} ${pctB(v.lo.avg)}` : "—"}</td>${print ? "" : `<td>${lvBar(v.lv)}</td>`}</tr>`; }).join("")}</table></div>` : H().empty("لا رصد بعد");
    const t2 = `<div class="table-scroll"><table class="report-table${print ? " compact" : ""}"><tr><th style="min-width:90px">الفصل</th><th>الطلاب</th><th>مواد مرصودة</th><th>بدرجات</th>${LV.map(l => `<th>${l}</th>`).join("")}<th>المعدل</th><th>الحضور</th><th>متعثرون</th>${print ? "" : "<th>التوزيع</th>"}</tr>
      ${d.classes.map(x => `<tr><td class="nm">${esc(x.c.name)}</td><td>${x.students}</td><td>${x.subjects || ""}</td><td>${x.graded || ""}</td>${x.lv.map(v => `<td>${v || ""}</td>`).join("")}${pcell(x.avg)}<td>${pctTxt(x.att)}</td><td>${x.low ? `<b style="color:var(--bad)">${x.low}</b>` : ""}</td>${print ? "" : `<td>${lvBar(x.lv)}</td>`}</tr>`).join("")}</table></div>`;
    return `<div style="font-weight:800;color:var(--navy);margin:4px 0 6px">حسب المادة</div>${t1}<div style="font-weight:800;color:var(--navy);margin:12px 0 6px">حسب الفصل (معدل الطالب عبر كل مواده)</div>${t2}${print ? "" : legend()}`;
  }
  async function admLevels(box) {
    css(); const s = S(), Ad = A(), h = H();
    loading(box, "📊 المستويات");
    const sd = await Ad.schoolDocs(), cx = ctx(sd), cls = Ad.sortedClasses(), subs = allSubjects();
    if (!lvClass || !s.classById(lvClass)) lvClass = cls.length ? cls[0].id : null;
    if (!lvSubject || !subs.includes(lvSubject)) lvSubject = subs[0] || null;
    let body = "", title = "", sub = "";
    if (lvMode === "class") { const c = s.classById(lvClass); title = `مستويات ${c ? c.name : ""} — كل المواد`; sub = "حسب الفصل"; body = `<div id="lv-cls">${h.chips(cls.map(c => ({ k: c.id, t: esc(c.name) })), lvClass)}</div><div id="lv-body">${lvClass ? levelsClass(cx, lvClass) : h.empty("لا فصول")}</div>`; }
    else if (lvMode === "subject") { title = `مستويات مادة ${lvSubject || ""}`; sub = "حسب المادة"; body = `<div class="adm-tools"><select id="lv-subj">${subs.map(x => `<option value="${esc(x)}" ${x === lvSubject ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div><div id="lv-body">${lvSubject ? levelsSubject(cx, lvSubject) : h.empty("لا مواد")}</div>`; }
    else { title = "ملخص مستويات المدرسة"; sub = "المدرسة كلها"; body = `<div id="lv-body">${levelsSchool(cx)}</div>`; }
    box.innerHTML = '<div class="adm-lvl">' + h.card(`📊 المستويات`, `<div class="adm-sec"><div class="class-chips" id="lv-mode" style="padding:0;margin:0">${[["class", "🏫 حسب الفصل"], ["subject", "📚 حسب المادة"], ["school", "🏛️ المدرسة كلها"]].map(([k, t]) => `<button class="chip ${k === lvMode ? "on" : ""}" data-k="${k}" style="padding:7px 12px;font-size:13px">${t}</button>`).join("")}</div>${h.printBtn("lv-print", "🖨️ طباعة")}</div>${body}`) + "</div>";
    box.dataset.ready = "1";
    h.bindChips($("#lv-mode", box), (k) => { lvMode = k; admLevels(box); });
    if (lvMode === "class") { const ch = $("#lv-cls .class-chips", box); if (ch) h.bindChips(ch, (k) => { lvClass = k; admLevels(box); }); box.querySelectorAll(".lv-row").forEach(tr => tr.onclick = () => s.studentProgress(lvClass, +tr.dataset.i)); }
    const sel = $("#lv-subj", box); if (sel) sel.onchange = () => { lvSubject = sel.value; admLevels(box); };
    $("#lv-print", box).onclick = () => {
      const html = lvMode === "class" ? levelsClass(cx, lvClass, true) : lvMode === "subject" ? levelsSubject(cx, lvSubject, true) : levelsSchool(cx, true);
      Ad.printHtml(title, html.replace(/<div class="table-scroll">/g, "<div>") + Ad.sigLine(["vice", "principal"]), { land: true, sub: "المستويات — " + sub, cls: "compact" });
    };
  }

  A().register("home", admHome);
  A().register("reports", admReports);
  A().register("levels", admLevels);
  A().home = { classAgg, ctx, attendanceData, absentAlerts, noRecClasses, idleTeachers, lowStudents, strugglers, teacherRows, topData, schoolRows, fullBackup, printAttendance };
})();
