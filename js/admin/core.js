/* ═══════════ لوحة مدير المدرسة — النواة (js/admin/core.js) ═══════════
   تُحمَّل بعد app.js وتعتمد على window.SIJIL (حالة حية عبر getters: D/DB/TE/fdb/META…).
   الوحدات تسجّل نفسها:  SIJIL_ADMIN.register("home" | "students" | "teachers" | "schedule" | "levels" | "reports" | "manage", fn)
   حيث fn(box, name) ترسم داخل الحاوية box (قد تكون async). غير المسجَّل يظهر «قيد الإعداد».
   app.js: switchTab(name) يستدعي SIJIL_ADMIN.render(name) حين TE.admin && localStorage sijil.adminView !== 'teacher'،
           وenter() يستدعي SIJIL_ADMIN.init(TE) الذي يعيد بناء شريط التبويبات (7 إدارية أو 5 للمعلم + زر التبديل في الرأس إن كان للمدير فصول). */
(function () {
  "use strict";
  const S = () => window.SIJIL;
  const VIEW_KEY = "sijil.adminView";
  const TABS = [
    { k: "home", ic: "🏫", t: "المدرسة" },
    { k: "students", ic: "👥", t: "الطلاب" },
    { k: "teachers", ic: "👨‍🏫", t: "المعلمون" },
    { k: "schedule", ic: "🗓️", t: "الجدول" },
    { k: "levels", ic: "📊", t: "المستويات" },
    { k: "reports", ic: "📄", t: "التقارير" },
    { k: "manage", ic: "⚙️", t: "الإدارة" }];
  const TEACHER_TABS = [
    { k: "today", ic: "📌", t: "اليوم" },
    { k: "reg", ic: "🗒️", t: "التحضير" },
    { k: "grades", ic: "💯", t: "الدرجات" },
    { k: "rep", ic: "📄", t: "التقارير" },
    { k: "more", ic: "⚙️", t: "المزيد" }];
  const TEACHER_PANES = ["today", "reg", "grades", "rep", "more"];
  const MODS = {};
  let TE = null, cur = null;
  const esc = (s) => S().esc(s);
  const $ = (q, root) => (root || document).querySelector(q);
  const warn = (...a) => { try { console.warn("[admin]", ...a); } catch (e) { } };

  /* ═══ العرض الحالي: لوحة المدير أم واجهة المعلم ═══ */
  const storedView = () => { try { return localStorage.getItem(VIEW_KEY); } catch (e) { return null; } };
  const isAdminView = () => !!(TE && TE.admin && storedView() !== "teacher");
  function setView(v) { try { if (v === "teacher") localStorage.setItem(VIEW_KEY, "teacher"); else localStorage.removeItem(VIEW_KEY); } catch (e) { } }

  /* ═══ شريط التبويبات والحاويات ═══ */
  function buildTabs(list, adm) {
    const nav = $("#tabs"); if (!nav) return;
    nav.classList.toggle("adm", !!adm);
    nav.innerHTML = list.map((t, i) => `<button data-tab="${t.k}" class="${i === 0 ? "on" : ""}"><span class="ic">${t.ic}</span>${t.t}</button>`).join("");
    nav.querySelectorAll("button").forEach(b => b.onclick = () => S().switchTab(b.dataset.tab));
    showActiveTab();
  }
  /* الشريط الإداري قابل للتمرير أفقياً على الجوال (سبعة تبويبات في 390px): نُظهر التبويب النشط دائماً،
     ونضع صنف has-x على الشريط حين يوجد محتوى مخفي (تدرّج على الحافة يدل على وجود المزيد). */
  function showActiveTab() {
    const nav = $("#tabs"); if (!nav) return;
    const go = () => {
      const b = nav.querySelector("button.on");
      if (b && nav.scrollWidth > nav.clientWidth + 2) { try { b.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) { try { nav.scrollLeft = b.offsetLeft - (nav.clientWidth - b.offsetWidth) / 2; } catch (x) { } } }
      nav.classList.toggle("has-x", nav.scrollWidth > nav.clientWidth + 2);
    };
    go(); try { requestAnimationFrame(go); } catch (e) { }
  }
  function ensurePanes() {
    const wrap = $("#view-app .wrap"); if (!wrap) return;
    const foot = wrap.querySelector(".footer-sig");
    TABS.forEach(t => {
      if ($("#tab-adm-" + t.k)) return;
      const d = document.createElement("div"); d.id = "tab-adm-" + t.k; d.className = "hidden adm-pane"; d.dataset.mod = t.k;
      if (foot) wrap.insertBefore(d, foot); else wrap.appendChild(d);
    });
  }
  const pane = (k) => $("#tab-adm-" + k);
  const hideAdminPanes = () => document.querySelectorAll(".adm-pane").forEach(p => p.classList.add("hidden"));

  // زر التبديل في الرأس (يظهر فقط للمدير الذي له فصول)
  function headerToggle(show) {
    const row = $("#view-app .appbar .row1"); if (!row) return;
    let acts = $("#ab-actions");
    if (!acts) {
      acts = document.createElement("div"); acts.id = "ab-actions"; acts.className = "acts";
      const lo = $("#ab-logout");
      if (lo) { row.insertBefore(acts, lo); acts.appendChild(lo); } else row.appendChild(acts);
    }
    let b = $("#ab-view");
    if (!show) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("button"); b.id = "ab-view"; b.className = "btn-ghost"; acts.insertBefore(b, acts.firstChild); }
    const adm = isAdminView();
    b.textContent = adm ? "🎒 واجهتي كمعلم" : "🏫 لوحة المدير";
    b.onclick = () => { setView(adm ? "teacher" : "admin"); const now = init(TE); S().switchTab(now ? "home" : "today"); toast(now ? "🏫 لوحة المدير" : "🎒 واجهة المعلم"); };
  }

  // يُستدعى من enter() — يعيد true إن كانت لوحة المدير هي الفعّالة
  function init(te) {
    TE = te || S().TE;
    if (!TE || !TE.admin) return false;
    const hasCls = !!(TE.classes || []).length;
    if (!hasCls && storedView() === "teacher") setView("admin");     // مدير بلا فصول: لوحة المدير دائماً
    const adm = isAdminView();
    ensurePanes();
    if (adm) { buildTabs(TABS, true); TEACHER_PANES.forEach(n => { const p = $("#tab-" + n); if (p) p.classList.add("hidden"); }); }
    else { buildTabs(TEACHER_TABS, false); hideAdminPanes(); }
    headerToggle(hasCls);
    return adm;
  }

  /* ═══ التوجيه إلى الوحدات ═══ */
  function register(name, fn) {
    if (typeof fn !== "function") return;
    MODS[name] = fn;
    const p = pane(name);
    if (cur === name && isAdminView() && p && !p.classList.contains("hidden")) render(name);
  }
  const wip = (name) => { const t = TABS.find(x => x.k === name) || {}; return H.card(`${t.ic || ""} ${esc(t.t || name)}`, H.empty("🛠️ قيد الإعداد — هذه الوحدة لم تُحمَّل بعد")); };
  function fail(box, e) { warn("render " + cur, e); box.innerHTML = H.card("⚠️ تعذّر العرض", H.empty(esc((e && e.message) || String(e)))); }
  function render(name) {
    if (!TABS.find(t => t.k === name)) name = "home";
    cur = name; ensurePanes();
    TABS.forEach(t => { const p = pane(t.k); if (p) p.classList.toggle("hidden", t.k !== name); });
    const box = pane(name); if (!box) return;
    showActiveTab();                                  // على 390px: التبويب النشط قد يكون خارج الشاشة (سبعة تبويبات)
    const fn = MODS[name];
    if (!fn) { box.innerHTML = wip(name); return; }
    try { const r = fn(box, name); if (r && typeof r.catch === "function") r.catch(e => fail(box, e)); } catch (e) { fail(box, e); }
  }
  const refresh = () => { if (cur && isAdminView()) render(cur); };

  /* ═══ schoolDocs(): كل مستندات المدرسة مرة واحدة (مخبّأة 60 ثانية) ═══
     { ts, cloud, recs: {tid_cid: d}, grades: {tid_cid: g}, comms: {tid_cid: c[]}, moves: [], assign: [], sedits: {cid: doc}, adminlog: [] (الأحدث أولاً) }
     تجريبياً: رصد هذا الجهاز DB.recs[cid] يُنسب إلى أول معلم يدرّس الفصل (DB لا تحمل معرّف المعلم). */
  let cache = null, inflight = null;
  function splitKey(id) { const k = id.indexOf("_"); return k < 0 ? { tid: id, cid: "" } : { tid: id.slice(0, k), cid: id.slice(k + 1) }; }
  async function schoolDocs(force) {
    if (!force && cache && Date.now() - cache.ts < 60000) return cache;
    if (inflight && !force) return inflight;
    inflight = (async () => {
      const s = S(), D = s.D, DB = s.DB;
      const out = { ts: Date.now(), cloud: !!(s.CLOUD && s.fdb), recs: {}, grades: {}, comms: {}, moves: [], assign: [], sedits: {}, adminlog: [], demoGuess: [] };
      if (out.cloud) {
        const fdb = s.fdb;
        const get = async (col) => { try { return await fdb.collection(col).get(); } catch (e) { warn("schoolDocs/" + col, e && e.message); return null; } };
        const [rs, gs, cs, as, ls] = await Promise.all([get("recs"), get("grades"), get("comms"), get("assign"), get("adminlog")]);
        if (rs) rs.forEach(d => { out.recs[d.id] = (d.data() || {}).d || {}; });
        if (gs) gs.forEach(d => { out.grades[d.id] = (d.data() || {}).g || {}; });
        if (cs) cs.forEach(d => { out.comms[d.id] = (d.data() || {}).c || []; });
        if (as) as.forEach(d => { out.assign.push(Object.assign({ id: d.id }, d.data())); });
        if (ls) ls.forEach(d => { out.adminlog.push(Object.assign({ id: d.id }, d.data())); });
        out.sedits = D.sedits || {};
      } else {
        /* الوضع التجريبي: DB لا تحمل معرّف معلم داخل المستند — نأخذه من DB.by["recs:cid"] الذي يكتبه app.js عند كل حفظ
           (من رصد فعلاً على هذا الجهاز)، وإلا نقدّره: المعلم الحالي إن كان يدرّس الفصل، ثم أول معلم غير مدير يدرّسه.
           out.demoGuess = مفاتيح نُسبت بالتقدير — تُعلنها الواجهة حتى لا يُنسب رصد إلى معلم لم يرصده. */
        const me = s.TE, by = (DB.by && typeof DB.by === "object") ? DB.by : {};
        const guess = {};
        const owner = (kind, cid) => {
          const w = by[kind + ":" + cid];
          if (w && (D.teachers || []).some(x => x.id === w)) return w;
          guess[kind + ":" + cid] = 1;
          if (me && !me.admin && (me.classes || []).includes(cid)) return me.id;
          const t = (D.teachers || []).find(x => !x.admin && (x.classes || []).includes(cid)) || (D.teachers || []).find(x => (x.classes || []).includes(cid));
          return t ? t.id : (me ? me.id : "t00");
        };
        Object.keys(DB.recs || {}).forEach(cid => { if (Object.keys(DB.recs[cid] || {}).length) out.recs[owner("recs", cid) + "_" + cid] = DB.recs[cid]; });
        Object.keys(DB.grades || {}).forEach(cid => { if (Object.keys(DB.grades[cid] || {}).length) out.grades[owner("grades", cid) + "_" + cid] = DB.grades[cid]; });
        Object.keys(DB.comms || {}).forEach(cid => { if ((DB.comms[cid] || []).length) out.comms[owner("comms", cid) + "_" + cid] = DB.comms[cid]; });
        out.demoGuess = Object.keys(guess);
        out.sedits = DB.sedits || {};
        out.adminlog = (DB.adminlog || []).slice();
      }
      out.moves = (D.moves || []).slice();
      out.adminlog.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      cache = out; return out;
    })();
    try { return await inflight; } finally { inflight = null; }
  }
  const invalidate = () => { cache = null; };
  // مواد الفصل من الخرائط المخبّأة (مرادف classDocs بلا استعلام): [{tid, subject, tname, recs, grades, comms}]
  function classDocsOf(sd, cid) {
    const D = S().D, byT = {};
    const add = (map, key) => Object.keys(map).forEach(id => { const k = splitKey(id); if (k.cid !== cid) return; byT[k.tid] = byT[k.tid] || {}; byT[k.tid][key] = map[id]; });
    add(sd.recs, "recs"); add(sd.grades, "grades"); add(sd.comms, "comms");
    return Object.keys(byT).sort().map(tid => { const t = (D.teachers || []).find(z => z.id === tid); return { tid, subject: t ? t.subject : tid, tname: t ? t.name : "", recs: byT[tid].recs || {}, grades: byT[tid].grades || {}, comms: byT[tid].comms || [] }; });
  }
  // مستندات معلم عبر فصوله: [{cid, cname, recs, grades, comms}]
  function teacherDocsOf(sd, tid) {
    const byC = {};
    const add = (map, key) => Object.keys(map).forEach(id => { const k = splitKey(id); if (k.tid !== tid) return; byC[k.cid] = byC[k.cid] || {}; byC[k.cid][key] = map[id]; });
    add(sd.recs, "recs"); add(sd.grades, "grades"); add(sd.comms, "comms");
    return Object.keys(byC).sort().map(cid => { const c = S().classById(cid); return { cid, cname: c ? c.name : cid, recs: byC[cid].recs || {}, grades: byC[cid].grades || {}, comms: byC[cid].comms || [] }; });
  }
  /* ═══ تعريف واحد لـ«الحضور» في كل شاشات لوحة المدير ═══
     كانت الشاشات تختلف: bucketOf يعدّ «عن بعد» حضوراً بينما att كان st[0] وحده (حاضر فقط) — فيظهر الطالب
     نفسه 100% في تقرير الحضور و0% في عمود الطالب. المصدر الآن واحد هنا: الحاضر = «حاضر» أو «عن بعد»،
     والغائب = «غائب» أو «هارب» (لا «غائب بعذر»)، والمعذور = «بعذر/مستأذن»، والمتأخر وحده، وما عداها «أخرى». */
  const BUCKET_N = ["حاضر", "غائب", "متأخر", "مستأذن", "أخرى"];
  const BUCKET_PRIO = { 1: 4, 2: 3, 3: 2, 0: 1, 4: 0 };     // الأسوأ يغلب عند تعدد المعلمين في اليوم نفسه
  let bucketMap = null;
  function attBuckets() {
    if (!bucketMap) {
      const st = (S() && S().STATES) || [];
      bucketMap = st.map(x => { const n = (x && x.name) || ""; return /عذر|مستأذن/.test(n) ? 3 : /غائب|هارب/.test(n) ? 1 : /متأخر/.test(n) ? 2 : /حاضر|عن بعد/.test(n) ? 0 : 4; });
      if (!bucketMap.length) bucketMap = null;
    }
    return bucketMap || [];
  }
  const attBucketOf = (a) => { const b = attBuckets()[a]; return b == null ? 4 : b; };
  /* نسبة الحضور من عدّاد الحالات st[] (نفس ترتيب STATES) — null إن لا رصد.
     المصدر الأول SIJIL.attPct (تعريف app.js الواحد: «عن بعد» حضور كامل، «متأخر» نصف حضور، والمأذون خارج
     المقام) حتى يتطابق رقم لوحة المدير مع بطاقة الطالب ورسائل أولياء الأمور. والحساب المحلي احتياط فقط. */
  function attOf(st) {
    if (!Array.isArray(st)) return null;
    const s = S();
    if (s && typeof s.attPct === "function") { try { const v = s.attPct({ st: st }); if (v !== undefined) return v; } catch (e) { } }
    const n = st.reduce((a, b) => a + (b || 0), 0); if (!n) return null;
    let p = 0; st.forEach((v, k) => { if (v && attBucketOf(k) === 0) p += v; });
    return Math.round(p / n * 100);
  }
  // تجميع الطالب عبر كل معلميه: { pts, days, st[], att (نسبة الحاضرين من المرصود أو null), n (مواد بها رصد), grades: [{tid, subject, pct}], avg }
  function aggStudent(sd, cid, si) {
    const s = S(), docs = classDocsOf(sd, cid);
    const out = { pts: 0, days: 0, st: s.STATES.map(() => 0), att: null, n: 0, grades: [], avg: null, docs };
    docs.forEach(dc => {
      const t = s.calcStudent(cid, si, dc.recs);
      if (t.days) { out.n++; out.days += t.days; out.pts += t.pts; t.st.forEach((v, k) => out.st[k] += v); }
      // النسبة من البنود المرصودة حتى الآن (SIJIL.gradePct) لا من maxTotal الثابت: البنود التلقائية سقفها 40 من 100
      if (s.hasGrades(cid, si, dc.grades, dc.recs)) { const p = s.gradePct(cid, si, dc.grades, dc.recs); if (p != null) out.grades.push({ tid: dc.tid, subject: dc.subject, pct: p, max: s.gradedMax(cid, si, dc.grades, dc.recs) }); }
    });
    out.pts = Math.round(out.pts * 10) / 10;
    out.att = attOf(out.st);
    if (out.grades.length) out.avg = Math.round(out.grades.reduce((a, g) => a + g.pct, 0) / out.grades.length);
    return out;
  }
  /* سجل فارغ (فتح بطاقة الطالب أو نافذة الحالة بلا اختيار) ليس رصداً — نفس تعريف emptyRec في app.js.
     كنس app.js للأيام الفارغة يعمل على نسخة الجهاز ولا يصل السحابة (الرفع بـ set/merge لا يحذف مفتاحاً
     متداخلاً)، ولوحة المدير تقرأ السحابة مباشرة — فكان اليوم الذي لا يحمل إلا سجلات فارغة يُحسب «يوم
     رصد»: «آخر رصد» بتاريخ لم يرصد فيه المعلم شيئاً، ومعلمٌ يسقط من عدّاد «لم يرصدوا منذ 7 أيام». */
  const emptyRec = (e) => !e || (e.a == null && !e.part && e.hw == null && !e.sh && !((e.beh || []).length) && !String(e.note || "").trim());
  const hasMarks = (day) => { const d = day || {}; return Object.keys(d).some(si => !emptyRec(d[si])); };
  /* سقف تواريخ الرصد المعتبرة: حقل التاريخ في «التحضير» بلا حدّ أعلى، فيكفي خطأ في كتابته (2026-12-25)
     ليصير «آخر رصد» تاريخاً في المستقبل — فتُطبع «قبل ‎−110‎ يوم»، ويسقط المعلم من تنبيه «لم يرصدوا منذ
     7 أيام» ولو لم يرصد منذ شهر، ويُحسب ذلك اليوم البعيد ضمن «أيام الرصد هذا الأسبوع». السقف هو الغد
     لا اليوم، حتى لا يُخفى رصدُ جهازٍ تسبق ساعته ساعة جهاز المدير بساعات. */
  function maxRecDate() { const d = new Date(); d.setDate(d.getDate() + 1); return isoDate(d); }
  // آخر تاريخ رصد (yyyy-mm-dd) في خرائط recs لمعلم/فصل — null إن لا رصد. cap: أحدث تاريخ يُعتدّ به (الغد افتراضاً)
  function lastRecDate(recs, cap) {
    const mx = cap || maxRecDate(); let best = null;
    Object.keys(recs || {}).forEach(date => { if (date <= mx && hasMarks(recs[date]) && (!best || date > best)) best = date; });
    return best;
  }

  /* ═══ سجل الإدارة adminlog/{id} = { act: 'pin'|'edit'|'schedule'|'move'|'sedit'|'add', tid?, note, tn, ts } — إنشاء فقط ═══ */
  const logId = () => (Date.now().toString(36) + S().shortId()).replace(/[^a-z0-9]/g, "").slice(0, 20);
  async function adminlog(act, note, tid) {
    const s = S(); if (!s.TE) return false;
    const rec = { act: String(act || "").slice(0, 20), note: String(note || "").slice(0, 300), tn: s.TE.name, ts: Date.now() };
    if (tid) rec.tid = String(tid).slice(0, 12);
    if (s.CLOUD && s.fdb) {
      try { await s.fdb.doc("adminlog/" + logId()).set(rec); } catch (e) { warn("adminlog", e && e.message); return false; }
    } else {
      const DB = s.DB; DB.adminlog = Array.isArray(DB.adminlog) ? DB.adminlog : [];
      DB.adminlog.push(rec); if (DB.adminlog.length > 300) DB.adminlog.splice(0, DB.adminlog.length - 300);
      s.save();
    }
    if (cache) cache.adminlog.unshift(rec);
    return true;
  }

  /* ═══ تعديل بيانات طالب من المدير: sedits/{cid} = { s: { si: { p?, n? } }, tn, ts } ═══ */
  async function saveSedit(cid, si, patch) {
    const s = S(), D = s.D, DB = s.DB, p = {};
    if (typeof patch.p === "string") p.p = patch.p;
    if (typeof patch.n === "string" && patch.n.trim()) p.n = patch.n.trim();
    if (!Object.keys(p).length) return false;
    if (s.CLOUD && s.fdb) {
      try { await s.fdb.doc("sedits/" + cid).set({ s: { [si]: p }, tn: s.TE.name, ts: Date.now() }, { merge: true }); } catch (e) { warn("sedits", e && e.message); return false; }
      D.sedits = D.sedits || {}; D.sedits[cid] = D.sedits[cid] || { s: {} }; D.sedits[cid].s = D.sedits[cid].s || {};
      D.sedits[cid].s[si] = Object.assign({}, D.sedits[cid].s[si] || {}, p); D.sedits[cid].ts = Date.now(); D.sedits[cid].tn = s.TE.name;
      try { localStorage.setItem("sijil.cloudD", JSON.stringify(D)); } catch (e) { }
    } else {
      DB.sedits = DB.sedits || {}; DB.sedits[cid] = DB.sedits[cid] || { s: {} }; DB.sedits[cid].s = DB.sedits[cid].s || {};
      DB.sedits[cid].s[si] = Object.assign({}, DB.sedits[cid].s[si] || {}, p); DB.sedits[cid].ts = Date.now(); DB.sedits[cid].tn = s.TE.name;
      D.sedits = DB.sedits; s.save();
    }
    s.applySedits(D.classes, D.sedits);
    if (cache) cache.sedits = D.sedits;
    return true;
  }

  /* ═══ مساعدات الطباعة (كلها عبر SIJIL.printDoc — مستند نظيف صفحة واحدة) ═══ */
  function printHead(sub) { const s = S(); return `<div class="h"><div class="bar">${esc(s.META.school.name)}</div><div class="m">${esc(sub || "لوحة مدير المدرسة")} — ${esc(s.TE ? s.TE.name : "")} — ${esc(s.hijriLabel())}</div></div>`; }
  // printHtml(title, bodyHtml, {land, sub, cls, sig}) — sig: أدوار سطر التواقيع (سلسلة أو مصفوفة) تُضاف أسفل المستند
  function printHtml(title, bodyHtml, opts) {
    opts = opts || {};
    const body = bodyHtml + (opts.sig ? sigLine(opts.sig) : "");
    S().printDoc(title, printHead(opts.sub) + `<div class="tt">${esc(title)}</div><div class="sheetdoc">${body}</div>`, { appCss: true, land: !!opts.land, cls: opts.cls });
  }
  function cleanClone(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll(".sheet-actions, button, .no-print, .class-chips, select, input[type=checkbox], input[type=date], input[type=file], .search-box, .adm-tools, .hidden").forEach(x => x.remove());
    c.querySelectorAll("input, textarea").forEach(x => { const sp = document.createElement("span"); sp.textContent = x.value || ""; x.replaceWith(sp); });
    return c;
  }
  const isWide = (root) => [...root.querySelectorAll("table tr")].some(tr => tr.children.length > 8);
  // طباعة عنصر من الصفحة (يُنظَّف من الأزرار والحقول) — أفقي تلقائياً إن كان الجدول عريضاً
  function printEl(el, title, opts) { if (!el) return; const c = cleanClone(el); printHtml(title, c.innerHTML, Object.assign({ land: isWide(c) }, opts || {})); }
  // printTable(title, cols, rows, {land, sub, foot, sig})
  function printTable(title, cols, rows, opts) { opts = opts || {}; printHtml(title, H.table(cols, rows, { foot: opts.foot }), Object.assign({ land: cols.length > 8 }, opts)); }

  /* ═══ مكوّنات مشتركة (HTML) — الخلايا/النصوص تُهرَّب من المستدعي بـ SIJIL.esc ═══ */
  const H = {
    card: (title, body, attrs) => `<div class="card"${attrs ? " " + attrs : ""}>${title ? `<h3><span class="dot"></span>${title}</h3>` : ""}${body || ""}</div>`,
    empty: (msg) => `<div class="empty-note">${msg}</div>`,
    note: (msg) => `<div class="empty-note" style="padding:6px 4px;text-align:right;min-height:0">${msg}</div>`,
    kpis: (items, cols) => `<div class="kpis"${cols ? ` style="grid-template-columns:repeat(${cols},1fr)"` : ""}>${items.map(k => `<div class="kpi"${k.id ? ` id="${k.id}"` : ""}${k.title ? ` title="${esc(k.title)}"` : ""}><div class="v">${k.v}</div><div class="l">${k.l}</div></div>`).join("")}</div>`,
    // cols: ["م", {t:"الطالب", w:140}] — rows: مصفوفة خلايا HTML (العمود الأول اسم .nm إلا nameCol:false) أو سلاسل <tr> جاهزة
    table: (cols, rows, opts) => {
      opts = opts || {};
      const th = cols.map(c => typeof c === "string" ? `<th>${c}</th>` : `<th${c.w ? ` style="min-width:${c.w}px"` : ""}>${c.t}</th>`).join("");
      const body = (rows || []).map(r => Array.isArray(r) ? `<tr${opts.rowAttr ? " " + opts.rowAttr(r) : ""}>${r.map((x, j) => `<td${j === opts.nameIdx || (opts.nameIdx == null && j === 0 && opts.nameCol !== false) ? ' class="nm"' : ""}>${x == null ? "" : x}</td>`).join("")}</tr>` : r).join("");
      const foot = opts.foot ? `<tr class="tot">${opts.foot.map(x => `<td>${x == null ? "" : x}</td>`).join("")}</tr>` : "";
      return `<div class="table-scroll"${opts.id ? ` id="${opts.id}"` : ""}><table class="report-table${opts.cls ? " " + opts.cls : ""}"><tr>${th}</tr>${body}${foot}</table></div>`;
    },
    chips: (items, curK, attr) => `<div class="class-chips">${items.map(x => `<button class="chip ${x.k === curK ? "on" : ""}" data-${attr || "k"}="${esc(x.k)}">${x.t}</button>`).join("")}</div>`,
    bindChips: (root, onPick, attr) => { const a = attr || "k"; root.querySelectorAll(".chip").forEach(ch => ch.onclick = () => { root.querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === ch)); onPick(ch.dataset[a], ch); }); },
    btn: (label, attrs, cls) => `<button class="${cls || "btn-gold"}" ${attrs || ""}>${label}</button>`,
    tools: (html) => `<div class="adm-tools">${html}</div>`,
    printBtn: (id, label) => `<button class="btn-plain adm-print" id="${id}" style="flex:0 0 auto;padding:9px 14px">${label || "🖨️ طباعة"}</button>`,
    search: (id, ph) => `<input class="search-box" id="${id}" placeholder="${esc(ph || "اكتب اسم الطالب…")}" autocomplete="off">`,
    pill: (txt, color) => `<span class="cc" style="background:${color || "var(--navy)"}">${txt}</span>`,
    pct: (p) => S().pctCell(p),
    row: (l, r) => `<div class="admin-row"><span>${l}</span><span class="cls">${r}</span></div>`,
    alert: (html, tone) => `<div class="adm-alert ${tone || ""}">${html}</div>`
  };

  /* ═══ أدوات عامة ═══ */
  const sortedClasses = () => (S().D.classes || []).slice().sort((a, b) => ((a.gc || 0) - (b.gc || 0)) || String(a.name).localeCompare(String(b.name)));
  /* تعريف واحد لـ«المعلمين» في كل الشاشات: حساب غير إداري وله فصل مسند (حساب المدير و«حسابات بلا فصول» خارج العدّ).
     allAccounts = كل مستندات teachers كما هي (يشمل المدير) — للجداول لا للمؤشرات. */
  const allAccounts = () => (S().D.teachers || []).slice();
  const staff = () => allAccounts().filter(t => !t.admin && (t.classes || []).length);
  const classTeachers = (cid) => (S().D.teachers || []).filter(t => (t.classes || []).includes(cid));
  const teacherOf = (tid) => (S().D.teachers || []).find(t => t.id === tid) || null;
  const teacherByName = (name) => (S().D.teachers || []).find(t => t.name === name) || null;
  const todayName = () => S().DAYS[new Date().getDay()];
  /* مفتاح اليوم بالتوقيت المحلي لا بـ UTC: في الرياض (UTC+3) كان toISOString() يعيد يوم أمس بين 00:00 و02:59،
     فيخالف todayName() وhijriLabel() وperiodNow() ويقرأ تقرير «حضور اليوم» رصد اليوم السابق تحت عنوان اليوم. */
  const pad2n = (n) => String(n).padStart(2, "0");
  const isoDate = (d) => { const x = (d == null) ? new Date() : (d instanceof Date ? d : new Date(d)); return x.getFullYear() + "-" + pad2n(x.getMonth() + 1) + "-" + pad2n(x.getDate()); };
  // فرق الأيام بين تاريخين محليين (منتصف ليل محلي إلى منتصف ليل محلي) — لا يعود بسالب في نافذة ما بعد منتصف الليل
  function daysAgo(dateStr) {
    if (!dateStr) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr)); if (!m) return null;
    const a = new Date(+m[1], +m[2] - 1, +m[3]), n = new Date(), b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((b - a) / 864e5);
  }
  const fmtDate = (dateStr) => dateStr ? String(dateStr).slice(5).replace("-", "/") : "—";
  const fmtTs = (ts) => { if (!ts) return "—"; try { return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ts)); } catch (e) { return new Date(ts).toLocaleString("ar"); } };
  /* ═══════════ جدول الأجراس: أوقات الحصص والفسح — المصدر الوحيد لأي وقت في التطبيق ═══════════
     الإعداد مستند cfg/bell يقرؤه app.js عند الإقلاع (D.bell، وتجريبياً DB.bell):
       { start:420, len:45, n:7, breaks:[{after,min,n}], lens:{"7":40}, days:{"الخميس":{n:5}}, tn, ts }
     غياب المستند = السلوك التاريخي حرفياً: بداية 7:00 · حصة 45 دقيقة · 7 حصص · فسحة 30 دقيقة بعد الثالثة.
     كل الأوقات بالدقائق من منتصف الليل، ولا يحسب أي ملف آخر وقتاً بنفسه:
       bell() periodsOf(day) periodNow(d) breakNow(d) periodTime(p, day) bellLine(day) dayEnd(day) */
  const BELL_DEF = { start: 420, len: 45, n: 7, breaks: [{ after: 3, min: 30, n: "الفسحة" }], lens: {}, days: {} };
  const MAXDAY = 24 * 60;
  const ORD = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية عشرة", "الثانية عشرة"];
  const BRKW = ["بلا فسح", "فسحة واحدة", "فسحتان", "ثلاث فسح", "أربع فسح"];
  const ord = (p) => ORD[p] || String(p);
  // صيغ عربية سليمة للعدد (لا «1 حصص» ولا «2 دقيقة») — يستعملها bellLine وبطاقة الأوقات في manage.js
  const nPer = (n) => n === 1 ? "حصة واحدة" : n === 2 ? "حصتان" : n + (n <= 10 ? " حصص" : " حصة");
  const mins = (n) => n === 1 ? "دقيقة واحدة" : n === 2 ? "دقيقتان" : n + ((n >= 3 && n <= 10) ? " دقائق" : " دقيقة");
  const dayList = () => (S() && S().DAYS) || ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  /* أيام الدراسة (أول خمسة: الأحد…الخميس) — مصدر واحد لكل الشاشات: لوحة المدير وتبويب الجدول وشريط «الحصة الحالية» عند المعلم.
     الجمعة والسبت لا دوام فيهما، فلا تُبرز حصة ولا يُعرض شريط حصة جارية. */
  const schoolDays = () => dayList().slice(0, 5);
  const isSchoolDay = (d) => schoolDays().indexOf(d == null ? todayName() : d) >= 0;
  const num = (v) => { const x = Math.round(Number(v)); return isFinite(x) ? x : NaN; };
  const clamp = (v, lo, hi, d) => { const x = num(v); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const hm = (m) => `${Math.floor(m / 60)}:${String(Math.round(m) % 60).padStart(2, "0")}`;                              // 7:05
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;   // 07:05 — لحقل <input type="time">
  const parseHM = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s == null ? "" : s).trim()); if (!m) return NaN; const t = +m[1] * 60 + +m[2]; return (t >= 0 && t < MAXDAY) ? t : NaN; };

  /* تطبيع أي إعداد خام إلى شكل صالح: يتجاهل ما لا يصلح ويكمل الناقص من الافتراضي */
  function normLens(raw, n) {
    const out = {}; if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(k => { const p = num(k), v = clamp(raw[k], 5, 120, 0); if (p >= 1 && p <= n && v) out[String(p)] = v; });
    return out;
  }
  function normBreaks(raw, n) {
    if (!Array.isArray(raw)) return [];
    const seen = {}, out = [];
    raw.forEach(b => {
      if (!b || typeof b !== "object" || out.length >= 4) return;
      const after = num(b.after), min = clamp(b.min, 1, 90, 0);
      if (!(after >= 1) || after > n - 1 || !min || seen[after]) return;
      seen[after] = 1;
      out.push({ after, min, n: String(b.n == null ? "" : b.n).trim().slice(0, 40) || ("فسحة بعد الحصة " + ord(after)) });
    });
    return out.sort((a, b) => a.after - b.after);
  }
  /* حدّ منتصف الليل داخل التطبيع نفسه لا في التحقق وحده: مستند مكتوب يدوياً من كونسول Firebase أو من أي
     جهاز مصادَق يمرّ من القواعد (start ≤ 1439، len ≤ 120، n ≤ 12) وقد يتجاوز 24:00 — تُقصّ الحصص التي
     تتخطّى منتصف الليل، وإن لم تتّسع ولو حصة واحدة عاد اليوم إلى الجدول الاحتياطي بدل طباعة 25:20. */
  function fitDay(c, fb) {
    let t = c.start, fit = 0;
    for (let p = 1; p <= c.n; p++) {
      const L = c.lens[String(p)] || c.len;
      /* يوم ينتهي عند 24:00 بالتمام ممنوع لا مسموح: hm(1440) يطبع «24:00»، وملف التقويم (ics.js) يلفّ
         الساعة بـ %24 بلا تقديم التاريخ فيخرج DTEND أبكر من DTSTART فيرفض التطبيق الموعد أو الملف كله. */
      if (t + L >= MAXDAY) break;
      t += L; fit = p;
      const b = c.breaks.find(x => x.after === p);
      if (b && p < c.n) { if (t + b.min >= MAXDAY) break; t += b.min; }
    }
    if (fit >= c.n) return c;
    if (fit < 1) return fb;
    c.n = fit;
    c.breaks = c.breaks.filter(x => x.after <= fit - 1);
    c.lens = normLens(c.lens, fit);
    return c;
  }
  const defDay = () => ({ start: BELL_DEF.start, len: BELL_DEF.len, n: BELL_DEF.n, breaks: BELL_DEF.breaks.map(b => ({ after: b.after, min: b.min, n: b.n })), lens: {} });
  function normBell(raw) {
    const src = (raw && typeof raw === "object") ? raw : {};
    const n = clamp(src.n, 1, 12, BELL_DEF.n);
    const cfg = fitDay({
      start: clamp(src.start, 0, MAXDAY - 1, BELL_DEF.start),
      len: clamp(src.len, 5, 120, BELL_DEF.len), n,
      breaks: normBreaks(("breaks" in src) ? src.breaks : BELL_DEF.breaks, n),
      lens: normLens(src.lens, n)
    }, defDay());
    cfg.days = {};
    if (src.days && typeof src.days === "object") dayList().forEach(d => {
      const o = src.days[d]; if (!o || typeof o !== "object") return;
      const dn = ("n" in o) ? clamp(o.n, 1, 12, cfg.n) : cfg.n;
      cfg.days[d] = fitDay({
        n: dn,
        start: ("start" in o) ? clamp(o.start, 0, MAXDAY - 1, cfg.start) : cfg.start,
        len: ("len" in o) ? clamp(o.len, 5, 120, cfg.len) : cfg.len,
        breaks: normBreaks(("breaks" in o) ? o.breaks : cfg.breaks, dn),
        lens: normLens(("lens" in o) ? o.lens : cfg.lens, dn)
      }, { n: cfg.n, start: cfg.start, len: cfg.len, breaks: cfg.breaks.map(b => ({ after: b.after, min: b.min, n: b.n })), lens: normLens(cfg.lens, cfg.n) });
    });
    return cfg;
  }
  const bellRaw = () => { const s = S(); if (!s) return null; return (s.D && s.D.bell) || (s.DB && s.DB.bell) || null; };
  // الإعداد الفعّال (المخزَّن أو الافتراضي) — كائن جديد في كل نداء، آمن لتعديل المستدعي
  const bell = () => normBell(bellRaw());
  const defaultBell = () => normBell(null);
  const effOf = (day) => { const c = bell(); return (day && c.days[day]) || c; };
  // كل عناصر اليوم بالترتيب: حصص {p, from, to} وفسح {brk:true, n, from, to} — الأوقات بالدقائق
  function periodsOf(day) {
    const c = effOf(day == null ? todayName() : day), out = [];
    let t = c.start;
    for (let p = 1; p <= c.n; p++) {
      const L = c.lens[String(p)] || c.len;
      out.push({ p, from: t, to: t + L }); t += L;
      const b = c.breaks.find(x => x.after === p);
      if (b && p < c.n) { out.push({ brk: true, n: b.n, from: t, to: t + b.min }); t += b.min; }
    }
    return out;
  }
  const periodsOnly = (day) => periodsOf(day).filter(x => !x.brk);
  const dayEnd = (day) => { const a = periodsOf(day); return a.length ? a[a.length - 1].to : effOf(day).start; };
  const mOf = (d) => { const x = d || new Date(); return x.getHours() * 60 + x.getMinutes(); };
  const dayOf = (d) => dayList()[(d || new Date()).getDay()];
  // رقم الحصة الجارية أو 0 (خارج الدوام أو داخل فسحة)
  function periodNow(d) { const x = d || new Date(), m = mOf(x), hit = periodsOf(dayOf(x)).find(b => !b.brk && m >= b.from && m < b.to); return hit ? hit.p : 0; }
  /* الفسحة الجارية أو null — الكائن يُطبع باسمه مباشرة (`${breakNow()}` = «الفسحة الأولى») ويحمل from/to/ends */
  function breakNow(d) {
    const x = d || new Date(), m = mOf(x), b = periodsOf(dayOf(x)).find(z => z.brk && m >= z.from && m < z.to);
    return b ? { n: b.n, from: b.from, to: b.to, ends: hm(b.to), toString() { return this.n; } } : null;
  }
  const periodTime = (p, day) => { const b = periodsOnly(day).find(x => x.p === num(p)); return b ? hm(b.from) + "–" + hm(b.to) : ""; };
  // «بداية 7:00 · الحصة 45 دقيقة · 7 حصص · فسحتان: بعد الأولى 15د وبعد الرابعة 15د · نهاية الدوام 12:45»
  function bellLine(day) {
    const c = effOf(day == null ? todayName() : day);
    const bl = c.breaks.length
      ? (BRKW[c.breaks.length] || c.breaks.length + " فسح") + ": " + c.breaks.map(b => `بعد ${ord(b.after)} ${b.min}د`).join(" و")
      : BRKW[0];
    return `بداية ${hm(c.start)} · الحصة ${mins(c.len)} · ${nPer(c.n)} · ${bl} · نهاية الدوام ${hm(dayEnd(day))}`;
  }
  /* تحقق قبل الحفظ — يعيد رسالة عربية أو null، ويفحص الشكل الخام كما أدخله المدير (لا المطبَّع) */
  function checkOne(o, where) {
    const w = where ? where + ": " : "";
    const start = num(o.start), len = num(o.len), n = num(o.n);
    if (!isFinite(start) || start < 0 || start > MAXDAY - 1) return w + "وقت بداية الدوام غير صحيح";
    if (!isFinite(len) || len < 5 || len > 120) return w + "مدة الحصة يجب أن تكون بين 5 و120 دقيقة";
    if (!isFinite(n) || n < 1 || n > 12) return w + "عدد الحصص يجب أن يكون بين 1 و12";
    const br = (o.breaks == null) ? [] : o.breaks;
    if (!Array.isArray(br)) return w + "قائمة الفسح غير صحيحة";
    if (br.length > 4) return w + "لا يمكن تجاوز أربع فسح";
    let prev = 0;
    for (let i = 0; i < br.length; i++) {
      const b = br[i] || {}, a = num(b.after), mn = num(b.min);
      if (!isFinite(a) || a < 1) return w + "الفسحة " + (i + 1) + ": رقم الحصة التي تليها غير صحيح";
      if (a >= n) return w + "لا يمكن وضع فسحة بعد الحصة الأخيرة (" + n + ")";
      if (a <= prev) return w + "رتّب الفسح تصاعدياً بلا تكرار على نفس الحصة";
      prev = a;
      if (!isFinite(mn) || mn < 1 || mn > 90) return w + "مدة الفسحة " + (i + 1) + " يجب أن تكون بين 1 و90 دقيقة";
      if (b.n != null && String(b.n).length > 40) return w + "اسم الفسحة طويل (40 حرفاً كحد أقصى)";
    }
    if (o.lens != null) {
      if (typeof o.lens !== "object" || Array.isArray(o.lens)) return w + "مدد الحصص المخالفة غير صحيحة";
      const ks = Object.keys(o.lens);
      for (let i = 0; i < ks.length; i++) {
        const p = num(ks[i]), v = num(o.lens[ks[i]]);
        if (!isFinite(p) || p < 1 || p > n) return w + "مدة مخالفة لحصة غير موجودة (" + ks[i] + ")";
        if (!isFinite(v) || v < 5 || v > 120) return w + "مدة الحصة " + ord(p) + " يجب أن تكون بين 5 و120 دقيقة";
      }
    }
    let t = start;
    for (let p = 1; p <= n; p++) {
      t += ((o.lens && num(o.lens[String(p)])) || len);
      const b = br.find(x => num((x || {}).after) === p);
      if (b && p < n) t += num(b.min);
    }
    if (t >= MAXDAY) return w + "الدوام يبلغ منتصف الليل أو يتجاوزه — راجع وقت البداية والمدد";
    return null;
  }
  function validateBell(cfg) {
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return "لا توجد إعدادات للحفظ";
    const e = checkOne(cfg, ""); if (e) return e;
    if (cfg.days != null) {
      if (typeof cfg.days !== "object" || Array.isArray(cfg.days)) return "تجاوزات الأيام غير صحيحة";
      const ks = Object.keys(cfg.days), all = dayList();
      for (let i = 0; i < ks.length; i++) {
        if (all.indexOf(ks[i]) < 0) return "يوم غير معروف: " + ks[i];
        const o = cfg.days[ks[i]];
        if (!o || typeof o !== "object" || Array.isArray(o)) return "تجاوز يوم " + ks[i] + " غير صحيح";
        /* الموروث من الإعداد العام يُنقّى قبل الفحص تماماً كما تُسقطه normBreaks/normLens بهدوء: يوم مختصر
           (الخميس n:4) مع فسحة عامة بعد الخامسة يعرض جدولاً سليماً، فلا يصحّ أن يمنع الحفظ برسالة لا يملك
           المدير في الواجهة ما يصححها به. أما ما كتبه المدير لليوم نفسه فيُفحص كما هو. */
        const dn = ("n" in o) ? num(o.n) : num(cfg.n);
        const inhBr = (a) => (Array.isArray(a) && isFinite(dn)) ? a.filter(b => { const x = num((b || {}).after); return !isFinite(x) || x < dn; }) : a;
        const inhLn = (m) => { if (!m || typeof m !== "object" || Array.isArray(m) || !isFinite(dn)) return m; const r = {}; Object.keys(m).forEach(k => { const x = num(k); if (!isFinite(x) || x <= dn) r[k] = m[k]; }); return r; };
        const e2 = checkOne({
          start: ("start" in o) ? o.start : cfg.start, len: ("len" in o) ? o.len : cfg.len, n: ("n" in o) ? o.n : cfg.n,
          breaks: ("breaks" in o) ? o.breaks : inhBr(cfg.breaks), lens: ("lens" in o) ? o.lens : inhLn(cfg.lens)
        }, ks[i]);
        if (e2) return e2;
      }
    }
    return null;
  }
  /* الحفظ: cfg/bell + adminlog + تحديث فوري (D.bell وإعادة رسم اللوحة وحدث sijil:bell) → {ok:true} أو {ok:false, err} */
  async function saveBell(cfg) {
    const err = validateBell(cfg); if (err) return { ok: false, err };
    const s = S(); if (!s || !s.TE) return { ok: false, err: "لا توجد جلسة" };
    const c = normBell(cfg);
    const rec = { start: c.start, len: c.len, n: c.n, breaks: c.breaks.map(b => ({ after: b.after, min: b.min, n: b.n })), tn: s.TE.name, ts: Date.now() };
    if (Object.keys(c.lens).length) rec.lens = c.lens;
    if (Object.keys(c.days).length) rec.days = c.days;
    if (s.CLOUD && s.fdb) {
      try { await s.fdb.doc("cfg/bell").set(rec); } catch (e) { warn("saveBell", e && e.message); return { ok: false, err: writeErr(e, "حفظ أوقات الحصص") }; }
      s.D.bell = rec;
      try { localStorage.setItem("sijil.cloudD", JSON.stringify(s.D)); } catch (e) { }
    } else { s.DB.bell = rec; s.D.bell = rec; s.save(); }
    await adminlog("bell", "أوقات الحصص: " + bellLine());
    cfgChanged();
    return { ok: true };
  }
  function cfgChanged() {
    try { window.dispatchEvent(new CustomEvent("sijil:bell")); } catch (e) { }
    refresh();
  }

  /* ═══ أسماء إدارة المدرسة (cfg/school) — سطر التواقيع في كل مطبوع ═══ */
  const STAFF_KEYS = ["principal", "vice", "agent", "counselor"];
  const STAFF_LBL = { principal: "مدير المدرسة", vice: "وكيل الشؤون التعليمية", agent: "وكيل شؤون الطلاب", counselor: "المرشد الطلابي" };
  // الأسماء المضبوطة فقط ({} إن لم يضبط المدير شيئاً فتبقى النقاط كما هي اليوم)
  function schoolStaff() {
    const s = S(), raw = s ? ((s.D && s.D.cfgSchool) || (s.DB && s.DB.cfgSchool) || null) : null, out = {};
    if (raw && typeof raw === "object") STAFF_KEYS.forEach(k => { const v = String(raw[k] == null ? "" : raw[k]).trim().slice(0, 80); if (v) out[k] = v; });
    return out;
  }
  const dots = (n) => new Array(Math.max(4, num(n) || 14) + 1).join(".");
  /* sigLine(roles) → <div class="sig">…</div> — roles عنصر واحد أو مصفوفة:
       "principal" | "vice" | "agent" | "counselor"   الاسم إن وُجد وإلا النقاط
       {k:"principal", dots:21}                        نفسه بعدد نقاط مخصص
       {l:"معلم المادة", v:"أ. فلان"}                    نص حر
       {l:"توقيع ولي الأمر", dots:16}                    نقاط دائماً */
  function sigCell(r) {
    if (typeof r === "string") r = (STAFF_KEYS.indexOf(r) >= 0) ? { k: r } : { l: r };
    r = r || {};
    const lbl = r.l || STAFF_LBL[r.k] || "";
    const val = String((r.v != null ? r.v : (r.k ? (schoolStaff()[r.k] || "") : "")) || "").trim();
    return `<span>${esc(lbl)}: ${val ? esc(val) : dots(r.dots)}</span>`;
  }
  const sigLine = (roles) => `<div class="sig">${(Array.isArray(roles) ? roles : [roles]).map(sigCell).join("")}</div>`;
  function validateStaff(cfg) {
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return "لا توجد بيانات للحفظ";
    for (let i = 0; i < STAFF_KEYS.length; i++) {
      const v = cfg[STAFF_KEYS[i]];
      if (v == null) continue;
      if (typeof v !== "string") return STAFF_LBL[STAFF_KEYS[i]] + ": القيمة غير نصية";
      if (v.trim().length > 80) return STAFF_LBL[STAFF_KEYS[i]] + ": الاسم طويل (80 حرفاً كحد أقصى)";
    }
    return null;
  }
  // حفظ أسماء الإدارة: cfg/school + adminlog + تحديث فوري → {ok:true} أو {ok:false, err}
  async function saveStaff(cfg) {
    const err = validateStaff(cfg); if (err) return { ok: false, err };
    const s = S(); if (!s || !s.TE) return { ok: false, err: "لا توجد جلسة" };
    const rec = { tn: s.TE.name, ts: Date.now() };
    STAFF_KEYS.forEach(k => { const v = String(cfg[k] == null ? "" : cfg[k]).trim().slice(0, 80); if (v) rec[k] = v; });
    if (s.CLOUD && s.fdb) {
      try { await s.fdb.doc("cfg/school").set(rec); } catch (e) { warn("saveStaff", e && e.message); return { ok: false, err: writeErr(e, "حفظ أسماء الإدارة") }; }
      s.D.cfgSchool = rec;
      try { localStorage.setItem("sijil.cloudD", JSON.stringify(s.D)); } catch (e) { }
    } else { s.DB.cfgSchool = rec; s.D.cfgSchool = rec; s.save(); }
    await adminlog("school", "أسماء الإدارة: " + (STAFF_KEYS.filter(k => rec[k]).map(k => STAFF_LBL[k] + " " + rec[k]).join("، ") || "مسح الكل"));
    cfgChanged();
    return { ok: true };
  }
  /* ═══════════ مكتبة التقييمات ودرجاتها (cfg/assess) ═══════════
     المكتبة الأصل في meta/app وهو مقفل للكتابة في القواعد، فتحكّم المدير يُحفظ في مستند cfg/assess
     ويُدمج فوقه في app.js قبل أول رسم (assessApply) — النمط نفسه الذي يسير عليه cfg/bell وcfg/school.
       assess()            الإعداد الفعّال بشكل التخزين: {states:[{k,t,v,c}], behaviors:[{k,t,v}], weights:{…}}
       defaultAssess()     المكتبة الافتراضية (زر «↺ إعادة الافتراضي») = meta/app + «النوم أثناء الحصة»
       validateAssess(cfg) رسالة عربية أو null
       saveAssess(cfg)     كتابة cfg/assess + adminlog + تحديث حي + حدث window «sijil:assess»
       assessScore(a,cfg)  نقاط طالب من رصده الخام بمكتبة معيّنة — لبطاقة «أثر التغيير» قبل الحفظ
     الحذف = إسقاط العنصر من القائمة المحفوظة لا إزاحة الفهارس: app.js يُبقيه في موضعه شاهداً off:true،
     فلا يظهر لمعلم ولا تنكسر نقطة رُصدت به من قبل (rec.a وrec.beh أرقام في recs منذ أول يوم). */
  const ASSESS_KEYS = ["states", "behaviors", "weights", "tn", "ts"];
  const ITEM_KEYS = ["k", "t", "v", "c", "off"];
  const ASSESS_WK = ["present", "part", "hw", "absent", "bad", "sheets"];
  const ASSESS_WLBL = { present: "الحاضر", part: "المشاركة", hw: "الواجب", absent: "الغائب", bad: "المخالفة", sheets: "ورقة العمل" };
  const ASSESS_COLORS = ["ok", "bad", "warn", "gray", "info", "violet", "brown"];
  const ASSESS_CLBL = { ok: "أخضر", bad: "أحمر", warn: "برتقالي", gray: "رمادي", info: "أزرق", violet: "بنفسجي", brown: "بنّي" };
  const ASSESS_MAX = 40, KMAX = 12, TMAX = 40, VMAX = 20;
  // الحالتان اللتان يخاطبهما app.js بالفهرس (زرّا «حاضر» و«غائب» السريعان في الحصة الحية): لا تُحذفان
  const ASSESS_LOCK = ["s0", "s1"];
  const EMPTY_ASSESS = { states: [], behaviors: [], weights: {} };
  const sgn = (v) => { const x = Math.round((+v || 0) * 10) / 10; return (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x); };
  const half = (v) => Math.round(Number(v) * 2) / 2;
  const assess = () => { const s = S(); return (s && typeof s.assessEff === "function") ? s.assessEff() : EMPTY_ASSESS; };
  const defaultAssess = () => { const s = S(); return (s && typeof s.assessDefault === "function") ? s.assessDefault() : EMPTY_ASSESS; };
  // «7 حالات · 16 سلوكاً · مشاركة +3 · واجب +5» — لسجل الإدارة وبطاقة اللوحة
  function assessLine(cfg) {
    const a = cfg || assess(), w = a.weights || {}, on = (l) => (l || []).filter(x => !x.off).length;
    return `${on(a.states)} حالات · ${on(a.behaviors)} سلوكاً · مشاركة ${sgn(w.part)} · واجب ${sgn(w.hw)}`;
  }
  /* تحقق قبل الحفظ — يفحص ما أدخله المدير كما هو (لا المطبَّع) ويعيد رسالة عربية أو null */
  function checkItems(a, what, wantC, lock) {
    if (!Array.isArray(a)) return "قائمة " + what + " غير صحيحة";
    if (!a.length) return what + ": لا يمكن ترك القائمة فارغة";
    if (a.length > ASSESS_MAX) return what + ": لا يمكن تجاوز " + ASSESS_MAX + " عنصراً (المُدخل " + a.length + ")";
    const seen = {};
    for (let i = 0; i < a.length; i++) {
      const o = a[i], at = what + " — العنصر " + (i + 1) + ": ";
      if (!o || typeof o !== "object" || Array.isArray(o)) return at + "بيانات غير صحيحة";
      const extra = Object.keys(o).filter(k => ITEM_KEYS.indexOf(k) < 0);
      if (extra.length) return at + "حقل غير معروف (" + extra[0] + ")";
      const k = String(o.k == null ? "" : o.k).trim();
      if (!k) return at + "المفتاح مفقود";
      if (k.length > KMAX) return at + "المفتاح طويل (" + KMAX + " محرفاً كحد أقصى، والمُدخل " + k.length + ")";
      if (!/^[A-Za-z0-9_-]+$/.test(k)) return at + "المفتاح يقبل الحروف اللاتينية والأرقام و«_» و«-» فقط";
      if (seen[k]) return at + "المفتاح «" + k + "» مكرر";
      seen[k] = 1;
      const t = String(o.t == null ? "" : o.t).trim();
      if (!t) return at + "الاسم مفقود";
      if (t.length > TMAX) return at + "الاسم طويل (" + TMAX + " محرفاً كحد أقصى، والمُدخل " + t.length + ")";
      const v = Number(o.v);
      if (o.v == null || o.v === "" || !isFinite(v)) return at + "الدرجة غير رقمية";
      if (v < -VMAX || v > VMAX) return at + "الدرجة يجب أن تكون بين −" + VMAX + " و+" + VMAX + " (المُدخل " + v + ")";
      if (half(v) !== v) return at + "الدرجة تتغيّر بخطوة نصف درجة (مثل 2 أو 2.5)";
      if (wantC && o.c != null && ASSESS_COLORS.indexOf(String(o.c)) < 0) return at + "لون غير معروف (" + o.c + ")";
      if (!wantC && o.c != null) return at + "حقل غير معروف (c)";
      if (o.off != null && o.off !== true && o.off !== false) return at + "قيمة الإخفاء (off) يجب أن تكون true أو false";
      if (o.off === true) delete seen[k];    // مخفي = محذوف من قوائم المعلم، فلا يسدّ مكان حالة لازمة
      seen[k] = seen[k] || (o.off === true ? 2 : 1);
    }
    if (lock) {
      const miss = lock.filter(k => seen[k] !== 1);
      if (miss.length) {
        const d = defaultAssess().states || [];
        return "لا يمكن حذف «" + miss.map(k => (d.find(x => x.k === k) || {}).t || k).join("» و«") + "» — يعتمد عليها رصد الحصة الحية والتقارير بالفهرس";
      }
    }
    return null;
  }
  function validateAssess(cfg) {
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return "لا توجد مكتبة للحفظ";
    const extra = Object.keys(cfg).filter(k => ASSESS_KEYS.indexOf(k) < 0);
    if (extra.length) return "حقل غير معروف في المكتبة (" + extra[0] + ")";
    const e1 = checkItems(cfg.states, "حالات الحضور", true, ASSESS_LOCK); if (e1) return e1;
    const e2 = checkItems(cfg.behaviors, "السلوكيات", false, null); if (e2) return e2;
    const w = cfg.weights;
    if (w != null) {
      if (typeof w !== "object" || Array.isArray(w)) return "أوزان التقييم غير صحيحة";
      const ks = Object.keys(w);
      for (let i = 0; i < ks.length; i++) {
        const lbl = ASSESS_WLBL[ks[i]];
        if (!lbl) return "وزن غير معروف (" + ks[i] + ")";
        const v = Number(w[ks[i]]);
        if (w[ks[i]] == null || w[ks[i]] === "" || !isFinite(v)) return "درجة " + lbl + " غير رقمية";
        if (v < -VMAX || v > VMAX) return "درجة " + lbl + " يجب أن تكون بين −" + VMAX + " و+" + VMAX + " (المُدخل " + v + ")";
        if (half(v) !== v) return "درجة " + lbl + " تتغيّر بخطوة نصف درجة (مثل 3 أو 3.5)";
      }
    }
    return null;
  }
  /* نقاط طالب من رصده الخام بمكتبة معيّنة — بالحساب نفسه الذي يعرضه التطبيق (calcStudent).
     entries: مصفوفة سجلات {a, part, hw, sh, beh[]}، وcfg بشكل التخزين (أو غيابه = المكتبة الفعّالة). */
  function assessScore(entries, cfg) {
    const s = S(); if (!s || typeof s.assessMerge !== "function") return 0;
    const def = s.assessDefault(), eff = (cfg && Array.isArray(cfg.states)) ? cfg : s.assessEff();
    const st = s.assessMerge(def.states, eff.states || def.states);
    const bh = s.assessMerge(def.behaviors, Array.isArray(eff.behaviors) ? eff.behaviors : def.behaviors);
    const w = Object.assign({}, def.weights, eff.weights || {});
    let p = 0;
    (entries || []).forEach(e => {
      if (!e) return;
      if (e.a != null && st[e.a]) p += (+st[e.a].pts || 0);
      if (e.part) p += (+e.part || 0) * (+w.part || 0);
      if (e.hw === 1) p += (+w.hw || 0);
      if (e.sh) p += (+e.sh || 0) * (+w.sheets || 0);
      (e.beh || []).forEach(bi => { if (bh[bi]) p += (+bh[bi].pts || 0); });
    });
    return Math.round(p * 10) / 10;
  }
  /* الحفظ: cfg/assess + adminlog + تحديث فوري (الدمج فوق META وحدث sijil:assess) → {ok:true} أو {ok:false, err} */
  async function saveAssess(cfg) {
    const err = validateAssess(cfg); if (err) return { ok: false, err };
    const s = S(); if (!s || !s.TE) return { ok: false, err: "لا توجد جلسة" };
    const norm = (a, wantC) => a.map(o => {
      const it = { k: String(o.k).trim(), t: String(o.t).trim().replace(/\s+/g, " "), v: half(o.v) };
      if (wantC) it.c = (ASSESS_COLORS.indexOf(String(o.c)) >= 0) ? String(o.c) : "gray";
      if (o.off === true) it.off = true;
      return it;
    });
    const dw = defaultAssess().weights || {}, w = {};
    ASSESS_WK.forEach(k => { const v = (cfg.weights || {})[k]; w[k] = (v == null || v === "") ? (+dw[k] || 0) : half(v); });
    const rec = { states: norm(cfg.states, true), behaviors: norm(cfg.behaviors, false), weights: w, tn: s.TE.name, ts: Date.now() };
    if (s.CLOUD && s.fdb) {
      try { await s.fdb.doc("cfg/assess").set(rec); } catch (e) { warn("saveAssess", e && e.message); return { ok: false, err: writeErr(e, "حفظ مكتبة التقييمات") }; }
      s.D.cfgAssess = rec;
      try { localStorage.setItem("sijil.cloudD", JSON.stringify(s.D)); } catch (e) { }
    } else { s.DB.cfgAssess = rec; s.D.cfgAssess = rec; s.save(); }
    // الدمج فوق META فوراً: كل حساب لاحق يقرأ الأوزان لحظة العرض، فتتغيّر النقاط في كل شاشة بلا إعادة تحميل
    try { if (typeof s.assessApply === "function") s.assessApply(); } catch (e) { warn("assessApply", e && e.message); }
    await adminlog("assess", "مكتبة التقييمات: " + assessLine());
    assessChanged();
    return { ok: true };
  }
  function assessChanged() {
    /* خريطة دلاء الحضور (attBuckets) تُبنى مرة واحدة من أسماء الحالات وتبقى في bucketMap:
       تسميةُ حالةٍ من جديد أو إضافةُ حالة تجعلها بائتة، فتحسب اللوحة «حاضراً» ما صار «غائباً».
       الفهارس لا تُزاح أبداً، لكن الأسماء تتغيّر — فنُبطلها عند كل حفظ. */
    bucketMap = null;
    try { window.dispatchEvent(new CustomEvent("sijil:assess")); } catch (e) { }
    refresh();
  }

  // الجوال: تطبيع إلى 05xxxxxxxx (يقبل 9665… و5…) أو null إن لم يصلح
  const normMob = (p) => { let d = String(p || "").replace(/[^\d]/g, ""); if (/^9665\d{8}$/.test(d)) d = "0" + d.slice(3); else if (/^5\d{8}$/.test(d)) d = "0" + d; return /^05\d{8}$/.test(d) ? d : null; };
  const waPhone = (p) => { const n = normMob(p); return n ? "966" + n.slice(1) : ""; };
  const waHref = (p, text) => S().waLink(waPhone(p), text || "");
  const nextTeacherId = () => { const used = new Set((S().D.teachers || []).map(t => t.id)); for (let n = 1; n < 1000; n++) { const id = "t" + String(n).padStart(2, "0"); if (!used.has(id)) return id; } return "t" + Date.now() % 1000; };

  /* ═══ سبب فشل الكتابة: رفضُ قواعد أم انقطاعُ شبكة؟ ═══
     كان كل رفض يُنسب إلى الإنترنت («تحقّق من الاتصال») أو يُعرض نصاً خاماً من محرك القواعد بأرقام
     أسطره داخل النافذة — فيعيد المستخدم المحاولة بلا نهاية ولا يعرف ما يفعل. نميّزهما هنا مرة واحدة
     لكل وحدات اللوحة، ولا نُظهر نص المحرك أبداً (يبقى في console وحده للمطوّر). */
  function isPermErr(e) {
    try { const a = window.SIJIL_AUTH; if (a && typeof a.isPerm === "function") return !!a.isPerm(e); } catch (x) { }
    const c = String((e && (e.code || e.name)) || "").toLowerCase();
    if (c.indexOf("permission-denied") >= 0 || c.indexOf("permission_denied") >= 0) return true;
    return /permission[_-]denied|insufficient permissions/i.test(String((e && e.message) || e || ""));
  }
  function writeErr(e, what) {
    const w = what || "الحفظ";
    if (!isPermErr(e)) return `تعذّر ${w} — تحقّق من الاتصال ثم أعد المحاولة.`;
    let noClaim = false;
    try { const a = window.SIJIL_AUTH, s = S(); noClaim = !!(a && typeof a.hasClaim === "function" && s && s.TE && !a.hasClaim(s.TE.id)); } catch (x) { }
    return noClaim
      ? `⛔ رُفض ${w}: هذا الجهاز لم يعد مُثبِتاً هويتك. اضغط «خروج» ثم ادخل برقمك مرة أخرى، وأعد المحاولة.`
      : `⛔ رُفض ${w}: صلاحيات حسابك لا تسمح بهذه العملية — وليست المشكلة في الاتصال.`;
  }

  /* ═══ إشعار وتأكيد ═══ */
  let toastT = null;
  function toast(msg, ms) {
    let el = $("#adm-toast"); if (!el) { el = document.createElement("div"); el.id = "adm-toast"; el.className = "adm-toast"; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), ms || 2200);
  }
  /* confirm(title, html, {ok, no, danger}) → Promise<boolean> (النقر خارج النافذة = false)
     نافذة مستقلة تُضاف فوق ما هو مفتوح ولا تمرّ بـ openSheet: openSheet يمسح #overlay-root كاملاً،
     فكان طلب تأكيد من داخل نافذة (حذف مرفق مثلاً) يمحو النافذة الأصلية ثم يغلق كل شيء بعد التأكيد.
     وhtml اختياري: نداء بوسيط واحد كان يطبع كلمة «undefined» تحت السؤال. */
  function confirm(title, html, opts) {
    opts = opts || {};
    const txt = (html == null || html === "") ? "" : String(html);
    return new Promise(res => {
      const root = $("#overlay-root");
      const t = document.createElement("template");
      t.innerHTML = `<div class="overlay adm-cf"><div class="sheet"><h4>${title}</h4>${txt ? `<div style="font-size:14px;line-height:1.9;margin:6px 0 4px">${txt}</div>` : ""}<div class="sheet-actions"><button class="btn-plain" id="adm-cf-no">${opts.no || "إلغاء"}</button><button class="btn-primary" id="adm-cf-ok"${opts.danger ? ' style="background:var(--bad)"' : ""}>${opts.ok || "تأكيد"}</button></div></div></div>`;
      const o = t.content.firstChild;
      if (!root || !o) { res(false); return; }
      let done = false;
      const fin = (v) => { if (done) return; done = true; try { o.remove(); } catch (e) { } try { document.removeEventListener("keydown", onKey, true); } catch (e) { } res(v); };
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); fin(false); } };
      o.addEventListener("click", (e) => { if (e.target === o) fin(false); });
      root.appendChild(o);
      o.querySelector("#adm-cf-no").onclick = () => fin(false);
      o.querySelector("#adm-cf-ok").onclick = () => fin(true);
      try { document.addEventListener("keydown", onKey, true); } catch (e) { }
    });
  }

  window.SIJIL_ADMIN = {
    TABS, TEACHER_TABS, VIEW_KEY,
    init, render, register, refresh, currentTab: () => cur, isAdminView, setView, get TE() { return TE; }, modules: () => Object.keys(MODS),
    schoolDocs, invalidate, splitKey, classDocsOf, teacherDocsOf, aggStudent, lastRecDate, maxRecDate, emptyRec, hasMarks,
    // تعريف الحضور الموحّد (لوحة المدير كلها): الحاضر = حاضر أو عن بعد
    attBucketOf, attOf, BUCKET_N, BUCKET_PRIO,
    adminlog, saveSedit,
    printHead, printHtml, printEl, printTable, cleanClone,
    H, toast, confirm, isPermErr, writeErr,
    sortedClasses, staff, allAccounts, showActiveTab, classTeachers, teacherOf, teacherByName, todayName, schoolDays, isSchoolDay, isoDate, daysAgo, fmtDate, fmtTs, normMob, waPhone, waHref, nextTeacherId,
    // جدول الأجراس (PERIODS = الحصص فقط بلا الفسح، محسوبة الآن من الإعداد — بنفس شكلها القديم [{p, from, to}])
    bell, defaultBell, normBell, periodsOf, periodsOnly, periodNow, breakNow, periodTime, bellLine, dayEnd, validateBell, saveBell, hm, hhmm, parseHM, ord, nPer, mins,
    get PERIODS() { return periodsOnly(); },
    // أسماء إدارة المدرسة وسطر التواقيع
    schoolStaff, sigLine, saveStaff, validateStaff, STAFF_KEYS, STAFF_LBL,
    // مكتبة التقييمات ودرجاتها (cfg/assess)
    assess, defaultAssess, validateAssess, saveAssess, assessLine, assessScore,
    ASSESS_KEYS, ASSESS_WK, ASSESS_WLBL, ASSESS_COLORS, ASSESS_CLBL, ASSESS_MAX, ASSESS_LOCK
  };

  // إن كان app.js قد أعاد جلسة محفوظة قبل تحميل هذا الملف (الوضع التجريبي متزامن بلا await): هيّئ اللوحة الآن
  try { const s = S(); if (s && s.TE && s.TE.admin) { const adm = init(s.TE); s.switchTab(adm ? "home" : "today"); } } catch (e) { warn("late init", e); }
  /* app.js يرسم تبويب «اليوم» قبل تنفيذ هذا الملف (جلسة محفوظة أو الوضع التجريبي) فيبني خلايا «حصص اليوم»
     من جدوله الاحتياطي القديم. إعلان جاهزية المحرك يجعله يعيد رسم التبويب بأوقات المدرسة الفعلية. */
  try { window.dispatchEvent(new CustomEvent("sijil:bell")); } catch (e) { }
})();
