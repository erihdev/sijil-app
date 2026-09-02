/* سجل المتابعة الرقمي — تطبيق الويب: معلم (سحابي/تجريبي) + بوابة طالب */
(function () {
  "use strict";
  const SALT = "sijil1448";
  const CLOUD = !!(window.FIREBASE_CONFIG && window.firebase && !/[?&]demo/.test(location.search));
  let D = null, META = null, W = null, STATES = null, BEH = null, TERM = "t1", ASSESS = null;
  let fdb = null;
  const STCOLORS = ["var(--st0)", "var(--st1)", "var(--st2)", "var(--st3)", "var(--st4)", "var(--st5)", "var(--st6)"];
  const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const GNAME = ["", "", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];
  const DEFAULT_ASSESS = [
    { k: "part", n: "الحضور والمشاركة", max: 15 },
    { k: "sheets", n: "أوراق العمل والواجبات", max: 10 },
    { k: "behave", n: "السلوك والالتزام", max: 15 },
    { k: "q1", n: "اختبار قصير 1", max: 15 },
    { k: "q2", n: "اختبار قصير 2", max: 15 },
    { k: "p1", n: "تطبيق عملي 1", max: 15 },
    { k: "p2", n: "تطبيق عملي 2", max: 15 },
  ];
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  async function sha256(msg) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  }
  function levelOf(pct) {
    if (pct >= 90) return { i: 0, t: "ممتاز" };
    if (pct >= 75) return { i: 1, t: "جيد جداً" };
    if (pct >= 60) return { i: 2, t: "جيد" };
    if (pct >= 50) return { i: 3, t: "مقبول" };
    return { i: 4, t: "دون المطلوب" };
  }

  /* ═══ تخزين + مزامنة ═══ */
  const KEY = CLOUD ? "sijil.cloud.v1" : "sijil.v1";
  let DB = { recs: {}, grades: {}, comms: {}, session: null, srole: null };
  try { const raw = localStorage.getItem(KEY); if (raw) DB = Object.assign(DB, JSON.parse(raw)); } catch (e) { }
  const dirty = new Set();
  let saveT = null, pushT = null;
  function save(tag) {
    if (tag) dirty.add(tag);           // "recs:cid" | "grades:cid" | "comms:cid"
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { } }, 250);
    if (CLOUD && TE) { clearTimeout(pushT); pushT = setTimeout(pushDirty, 1100); }
  }
  async function pushDirty() {
    if (!fdb || !TE) return;
    for (const tag of [...dirty]) {
      dirty.delete(tag);
      const [kind, cid] = tag.split(":");
      try {
        const payload = { tn: TE.name, ts: Date.now() };
        if (kind === "recs") payload.d = clone(DB.recs[cid] || {});
        if (kind === "grades") payload.g = clone(DB.grades[cid] || {});
        if (kind === "comms") payload.c = clone(DB.comms[cid] || []);
        await fdb.doc(kind + "/" + TE.id + "_" + cid).set(payload, { merge: true });
        syncBadge(true);
      } catch (e) { dirty.add(tag); syncBadge(false); }
    }
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  window.addEventListener("online", () => { if (dirty.size) pushDirty(); });
  function syncBadge(ok) {
    const el2 = $("#demo-strip");
    if (!el2 || !CLOUD) return;
    el2.textContent = ok ? "☁️ متصل بقاعدة المدرسة — بياناتك تُحفظ سحابياً وتظهر على كل أجهزتك"
      : "⚠️ لا اتصال الآن — سيُرفع رصدك تلقائياً عند عودة الإنترنت";
    el2.style.background = ok ? "#2e9e5b" : "#e8a23d"; el2.style.color = "#fff";
  }
  function rec(cid, date, si, make) {
    DB.recs[cid] = DB.recs[cid] || {};
    DB.recs[cid][date] = DB.recs[cid][date] || {};
    if (make && !DB.recs[cid][date][si]) DB.recs[cid][date][si] = { a: null, part: 0, hw: null, sh: 0, beh: [], note: "" };
    return DB.recs[cid][date][si] || null;
  }

  /* ═══ التاريخ الهجري ═══ */
  function hijriParts(dt) {
    const f = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric" });
    const p = {}; f.formatToParts(dt || new Date()).forEach(x => p[x.type] = x.value);
    return { d: +p.day, m: +p.month, y: +p.year };
  }
  const hnum = (h) => h.y * 10000 + h.m * 100 + h.d;
  const parseH = (s) => { const p = String(s || "").split("/"); return p.length === 3 ? (+p[2]) * 10000 + (+p[1]) * 100 + (+p[0]) : 0; };
  const hijriLabel = (dt) => new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(dt || new Date());
  function curWeek() {
    const t = hnum(hijriParts()); let best = 1;
    for (const wk of ((META.weeks || {})[TERM] || [])) {
      const a = parseH(wk.from), b = parseH(wk.to);
      if (a && a <= t) best = wk.w;
      if (a && b && a <= t && t <= b) return wk.w;
    }
    return best;
  }

  /* ═══ جلسة ═══ */
  let TE = null;
  const classById = (id) => D.classes.find(c => c.id === id);
  const myClasses = () => (TE.classes || []).map(classById).filter(Boolean);

  /* ═══ النقاط والدرجات ═══ */
  function calcStudent(cid, si) {
    const out = { pts: 0, days: 0, st: STATES.map(() => 0), part: 0, hwY: 0, hwN: 0, sh: 0, behP: 0, behN: 0, notes: [] };
    const cd = DB.recs[cid] || {};
    for (const date of Object.keys(cd)) {
      const e = cd[date][si]; if (!e) continue;
      out.days++;
      if (e.a != null && STATES[e.a]) { out.st[e.a]++; out.pts += (+STATES[e.a].pts || 0); }
      if (e.part) { out.part += e.part; out.pts += e.part * W.part; }
      if (e.hw === 1) { out.hwY++; out.pts += W.hw; }
      if (e.hw === 0) out.hwN++;
      if (e.sh) { out.sh += e.sh; out.pts += e.sh * W.sheets; }
      (e.beh || []).forEach(bi => { const b = BEH[bi]; if (!b) return; out.pts += (+b.pts || 0); if ((+b.pts || 0) >= 0) out.behP++; else out.behN++; });
      if (e.note) out.notes.push({ date, note: e.note });
    }
    out.pts = Math.round(out.pts * 10) / 10;
    return out;
  }
  function classCalc(cid) {
    const c = classById(cid);
    const rows = c.students.map((s, i) => ({ i, s, t: calcStudent(cid, i) }));
    const sorted = rows.slice().sort((a, b) => b.t.pts - a.t.pts);
    rows.forEach(r => r.rank = sorted.findIndex(x => x.i === r.i) + 1);
    return rows;
  }
  function gradeTotal(cid, si) {
    const g = (DB.grades[cid] || {})[si] || {};
    let sum = 0;
    ASSESS.forEach(a => { const v = +g[a.k]; if (!isNaN(v)) sum += Math.min(v, a.max); });
    return Math.round(sum * 10) / 10;
  }

  /* ═══ الدروس ═══ */
  const SUBJ_CODE = [["رقمية", "dg"], ["رياضيات", "ma"], ["عربية", "ar"], ["نجليزية", "en"], ["علوم", "sc"], ["إسلامية", "is"], ["قرآن", "qu"], ["اجتماعية", "so"], ["فنية", "rt"], ["بدنية", "pe"], ["حياتية", "lf"]];
  const subjCode = (s) => { for (const [k, v] of SUBJ_CODE) if ((s || "").includes(k)) return v; return ""; };
  const currCache = {};
  async function loadCurr(code) {
    if (currCache[code]) return currCache[code];
    try { const r = await fetch("data/curr/" + code + ".json"); currCache[code] = r.ok ? await r.json() : []; }
    catch (e) { currCache[code] = []; }
    return currCache[code];
  }
  const lessonURL = (code, w) => META.lessonsBase + code + "w" + w + ".html";

  /* ═══ منبثقات ═══ */
  const OV = $("#overlay-root");
  function openSheet(html, onMount) {
    OV.innerHTML = "";
    const t = document.createElement("template");
    t.innerHTML = '<div class="overlay"><div class="sheet">' + html + "</div></div>";
    const o = t.content.firstChild;
    o.addEventListener("click", (e) => { if (e.target === o) closeSheet(); });
    OV.appendChild(o); if (onMount) onMount(o);
  }
  const closeSheet = () => { OV.innerHTML = ""; };
  window._sheetClose = closeSheet;

  /* ═══ اتصال ═══ */
  async function bootCloud() {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    await firebase.auth().signInAnonymously();
    fdb = firebase.firestore();
    const [metaS, teachS, clsS, schS] = await Promise.all([
      fdb.doc("meta/app").get(), fdb.collection("teachers").get(),
      fdb.collection("classes").get(), fdb.doc("schedule/all").get()]);
    const teachers = []; teachS.forEach(d2 => teachers.push({ id: d2.id, ...d2.data() }));
    teachers.sort((a, b) => a.id.localeCompare(b.id));
    const classes = []; clsS.forEach(d2 => classes.push({ id: d2.id, ...d2.data() }));
    D = { meta: metaS.data(), teachers, classes, schedule: (schS.data() || {}).rows || [] };
    try { localStorage.setItem("sijil.cloudD", JSON.stringify(D)); } catch (e) { }
  }
  function bootOffline() {
    try { const raw = localStorage.getItem("sijil.cloudD"); if (raw) { D = JSON.parse(raw); return true; } } catch (e) { }
    return false;
  }
  async function boot() {
    if (CLOUD) {
      $("#lg-demo").innerHTML = "جارِ الاتصال بقاعدة المدرسة… ⏳";
      try { await bootCloud(); $("#lg-demo").innerHTML = "☁️ متصل بقاعدة المدرسة<br><b>دخول المعلم: رقم هويتك المسجل — الطالب: يختار صفه واسمه</b>"; }
      catch (e) {
        if (bootOffline()) $("#lg-demo").innerHTML = "⚠️ لا اتصال بالإنترنت — نسخة محفوظة على جهازك، وسيُرفع رصدك عند عودة الاتصال";
        else { $("#lg-demo").innerHTML = "❌ تعذر الاتصال. تأكد من الإنترنت وأعد تحميل الصفحة."; return; }
      }
    } else { D = window.DEMO; }
    META = D.meta; W = META.weights; STATES = META.states; BEH = META.behaviors;
    ASSESS = (META.assess && META.assess.length) ? META.assess : DEFAULT_ASSESS;
    TERM = (META.school.term_lbl || "").includes("الثاني") ? "t2" : "t1";
    initLogin();
    if (DB.session) {
      if (DB.srole === "student") { renderStudent(DB.session); return; }
      const t = D.teachers.find(x => x.id === DB.session);
      if (t) await enter(t);
    }
  }

  /* ═══ الدخول ═══ */
  function initLogin() {
    $("#lg-school").textContent = META.school.name;
    const sel = $("#lg-teacher");
    sel.innerHTML = '<option value="">— اختر اسمك —</option>' +
      D.teachers.filter(t => (t.classes || []).length || t.admin).map(t => `<option value="${t.id}">${esc(t.name)}${t.admin ? " (المدير)" : ""}</option>`).join("");
    // منتقيات الطالب
    const csel = $("#ls-class");
    csel.innerHTML = '<option value="">— اختر صفك —</option>' + D.classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    csel.onchange = () => {
      const c = classById(csel.value);
      const ns = $("#ls-name");
      ns.innerHTML = c ? '<option value="">— اختر اسمك —</option>' + c.students.map((s, i) => `<option value="${i}">${esc(s.n)}</option>`).join("") : "";
    };
    let mode = "teacher";
    $("#lg-switch").onclick = () => {
      mode = mode === "teacher" ? "student" : "teacher";
      $("#lg-teacher-form").classList.toggle("hidden", mode !== "teacher");
      $("#lg-student-form").classList.toggle("hidden", mode !== "student");
      $("#lg-switch").textContent = mode === "teacher" ? "👦 أنا طالب — دخول الطلاب" : "👨‍🏫 أنا معلم — دخول المعلمين";
      $("#lg-err").textContent = "";
    };
    $("#lg-btn").onclick = async () => {
      const t = D.teachers.find(x => x.id === sel.value);
      const pin = $("#lg-pin").value.trim();
      if (!t) { $("#lg-err").textContent = "اختر اسمك من القائمة"; return; }
      if (CLOUD) {
        if (!t.pinHash) { $("#lg-err").textContent = "لم تُسجل هويتك بعد — تواصل مع أ. ضيف الله"; return; }
        $("#lg-err").textContent = "جارِ التحقق…";
        if (await sha256(pin + "|" + t.id + "|" + SALT) !== t.pinHash) { $("#lg-err").textContent = "رقم الهوية غير صحيح"; return; }
      } else if (pin !== "1234") { $("#lg-err").textContent = "رقم الدخول غير صحيح (التجريبي: 1234)"; return; }
      $("#lg-err").textContent = ""; DB.session = t.id; DB.srole = "teacher"; save();
      enter(t);
    };
    $("#ls-btn").onclick = () => {
      const cid = $("#ls-class").value, si = $("#ls-name").value;
      if (!cid || si === "") { $("#lg-err").textContent = "اختر صفك واسمك"; return; }
      $("#lg-err").textContent = ""; DB.session = cid + ":" + si; DB.srole = "student"; save();
      renderStudent(cid + ":" + si);
    };
  }
  async function enter(t) {
    TE = t;
    $("#view-login").classList.add("hidden");
    $("#view-app").classList.remove("hidden");
    $("#ab-who").textContent = t.name + " — " + (t.admin ? "مدير المدرسة" : t.subject);
    if (CLOUD) {
      syncBadge(true);
      try {
        for (const cid of (t.classes || [])) {
          const [r, g, c] = await Promise.all([
            fdb.doc("recs/" + t.id + "_" + cid).get(),
            fdb.doc("grades/" + t.id + "_" + cid).get(),
            fdb.doc("comms/" + t.id + "_" + cid).get()]);
          if (r.exists) DB.recs[cid] = (r.data() || {}).d || {};
          if (g.exists) DB.grades[cid] = (g.data() || {}).g || {};
          if (c.exists) DB.comms[cid] = (c.data() || {}).c || [];
        }
        save();
      } catch (e) { syncBadge(false); }
    }
    renderToday(); renderReg(); renderGrades(); renderRep(); renderMore();
    switchTab("today");
  }
  $("#ab-logout").onclick = () => { DB.session = null; DB.srole = null; save(); setTimeout(() => location.reload(), 300); };

  /* ═══ تبويبات المعلم ═══ */
  function switchTab(name) {
    document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
    ["today", "reg", "grades", "rep", "more"].forEach(n => $("#tab-" + n).classList.toggle("hidden", n !== name));
    if (name === "today") renderToday();
    if (name === "reg") renderReg();
    if (name === "grades") renderGrades();
    if (name === "rep") renderRep();
    if (name === "more") renderMore();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => switchTab(b.dataset.tab));

  /* ═══ اليوم ═══ */
  async function renderToday() {
    const box = $("#tab-today"), wk = curWeek(), today = DAYS[new Date().getDay()];
    const mine = D.schedule.filter(r => r.t === TE.name && r.d === today).sort((a, b) => a.p - b.p);
    const per = [];
    for (let p = 1; p <= 7; p++) { const s = mine.find(x => x.p === p); per.push(`<div class="period ${s ? "" : "empty"}"><span class="p">ح${p}</span><div class="c">${s ? esc(classById(s.c).name) : "—"}</div></div>`); }
    let all = []; myClasses().forEach(c => classCalc(c.id).forEach(r => all.push({ c, r })));
    const low = all.slice().sort((a, b) => a.r.t.pts - b.r.t.pts).slice(0, 5);
    box.innerHTML = `
      <div class="card" style="background:linear-gradient(150deg,var(--navy),var(--navy2));color:#fff;border:none">
        <div style="font-size:13px;color:#c9d5e3">${esc(hijriLabel())}</div>
        <div style="font-size:19px;font-weight:800;color:var(--goldl);margin-top:2px">أهلاً أ. ${esc(TE.name.split(" ")[0])} 👋</div></div>
      <div class="kpis">
        <div class="kpi"><div class="v">${myClasses().length}</div><div class="l">فصولي</div></div>
        <div class="kpi"><div class="v">${all.length}</div><div class="l">طلابي</div></div>
        <div class="kpi"><div class="v">${mine.length}</div><div class="l">حصص اليوم</div></div></div>
      <div class="card"><h3><span class="dot"></span>حصص اليوم (${esc(today)})</h3><div class="periods">${per.join("")}</div></div>
      <div class="card" id="today-lesson"><h3><span class="dot"></span>درس هذا الأسبوع</h3><span class="weekpill">الأسبوع ${wk}</span><div class="empty-note" style="padding:8px">جارِ التحميل…</div></div>
      <div class="card"><h3><span class="dot"></span>طلاب يحتاجون التفاتة (الأدنى نقاطاً)</h3>
        <div class="alert-list">${low.length ? low.map(x => `<div class="al"><span>${esc(x.r.s.n)} <small style="color:var(--muted)">— ${esc(x.c.name)}</small></span><span class="pts">${x.r.t.pts}</span></div>`).join("") : '<div class="empty-note">ابدأ التحضير أولاً وستظهر القائمة هنا</div>'}</div></div>`;
    const sc = subjCode(TE.subject), grades = [...new Set(myClasses().map(c => c.gc))].sort();
    const LB = $("#today-lesson");
    if (!sc || !grades.length) { LB.querySelector(".empty-note").textContent = TE.admin ? "لوحة المدير في تبويب «المزيد»" : "لا مادة مسندة"; return; }
    let html = `<span class="weekpill">الأسبوع ${wk} — ${esc(TE.subject)}</span>`;
    for (const g of grades) {
      const code = sc + g + TERM, rows = (await loadCurr(code)).filter(r => r.w === wk);
      const main = rows.find(r => r.lesson && !String(r.lesson).includes("تابع")) || rows[0];
      const nm = main ? main.lesson : "—", off = !main || String(nm).includes("إجازة");
      html += `<div class="lesson-line" style="margin-top:9px"><span class="nm">الصف ${GNAME[g]}: ${esc(nm)}</span>${off ? "" : `<a class="btn-gold" target="_blank" rel="noopener" href="${lessonURL(code, wk)}">🚀 افتح الدرس التفاعلي</a>`}</div>`;
    }
    LB.innerHTML = `<h3><span class="dot"></span>درس هذا الأسبوع</h3>` + html;
  }

  /* ═══ التحضير ═══ */
  let regClass = null, regDate = new Date().toISOString().slice(0, 10);
  function renderReg() {
    const box = $("#tab-reg"), cls = myClasses();
    if (!cls.length) { box.innerHTML = '<div class="empty-note">لا فصول مسندة لك' + (TE.admin ? " — لوحة المدير في «المزيد»" : "") + "</div>"; return; }
    if (!regClass || !cls.find(c => c.id === regClass)) regClass = cls[0].id;
    box.innerHTML = `<div class="class-chips">${cls.map(c => `<button class="chip ${c.id === regClass ? "on" : ""}" data-c="${c.id}">${esc(c.name)}</button>`).join("")}</div>
      <div class="reg-tools"><input type="date" id="reg-date" value="${regDate}"><button class="btn-soft" id="reg-all">✓ الكل حاضر</button><span style="font-size:12px;color:var(--muted)">اضغط اسم الطالب لبطاقته</span></div>
      <div class="card" id="reg-list" style="padding:6px 10px"></div>`;
    box.querySelectorAll(".chip").forEach(ch => ch.onclick = () => { regClass = ch.dataset.c; renderReg(); });
    $("#reg-date").onchange = (e) => { regDate = e.target.value; drawRows(); };
    $("#reg-all").onclick = () => { const c = classById(regClass); c.students.forEach((s, i) => { const e = rec(regClass, regDate, i, true); if (e.a == null) e.a = 0; }); save("recs:" + regClass); drawRows(); };
    drawRows();
  }
  function drawRows() {
    const c = classById(regClass), list = $("#reg-list"), calc = classCalc(regClass);
    list.innerHTML = c.students.map((s, i) => {
      const e = rec(regClass, regDate, i, false) || {}, st = e.a != null ? STATES[e.a] : null, t = calc[i].t;
      return `<div class="stu" data-i="${i}"><span class="num">${i + 1}</span>
        <span class="nm" data-act="card">${esc(s.n)}<small>الترتيب ${calc[i].rank} من ${c.students.length}</small></span>
        <button class="statepill" data-act="state" style="${st ? "background:" + STCOLORS[e.a] : ""}">${st ? esc(st.name) : "الحالة"}</button>
        <button class="mini ${e.part ? "on" : ""}" data-act="part">🙋${e.part ? `<span class="b">${e.part}</span>` : ""}</button>
        <button class="mini ${e.hw != null ? "on" : ""}" data-act="hw">${e.hw === 1 ? "✅" : e.hw === 0 ? "❌" : "📚"}</button>
        <button class="mini ${(e.beh || []).length ? "on" : ""}" data-act="beh">⭐${(e.beh || []).length ? `<span class="b">${e.beh.length}</span>` : ""}</button>
        <span class="pts ${t.pts < 0 ? "neg" : ""}">${t.pts}</span></div>`;
    }).join("");
    list.querySelectorAll(".stu").forEach(row => { const i = +row.dataset.i; row.querySelectorAll("[data-act]").forEach(b => b.onclick = () => act(b.dataset.act, i)); });
  }
  function act(what, i) {
    const e = rec(regClass, regDate, i, true);
    if (what === "part") { e.part = (e.part + 1) % 6; save("recs:" + regClass); drawRows(); }
    else if (what === "hw") { e.hw = e.hw === null ? 1 : e.hw === 1 ? 0 : null; save("recs:" + regClass); drawRows(); }
    else if (what === "state") stateSheet(i, e);
    else if (what === "beh") behSheet(i, e);
    else if (what === "card") studentCard(regClass, i);
  }
  function stateSheet(i, e) {
    const c = classById(regClass);
    openSheet(`<h4>${esc(c.students[i].n)} — حالة الحضور</h4><div class="stategrid">${STATES.map((s, k) => `<button style="background:${STCOLORS[k]}" data-k="${k}">${esc(s.name)} <small>(${s.pts >= 0 ? "+" : ""}${s.pts})</small></button>`).join("")}<button style="background:#c9cfd6" data-k="-1">مسح الحالة</button></div>`,
      (o) => o.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { const k = +b.dataset.k; e.a = k < 0 ? null : k; save("recs:" + regClass); closeSheet(); drawRows(); }));
  }
  function behSheet(i, e) {
    const c = classById(regClass), sel = new Set(e.beh || []);
    openSheet(`<h4>${esc(c.students[i].n)} — السلوك والتقييم</h4><div class="behgrid">${BEH.map((b, k) => `<button data-k="${k}" class="${sel.has(k) ? "sel" : ""}">${esc(b.name)} <span class="p ${b.pts >= 0 ? "pos" : "neg"}">${b.pts >= 0 ? "+" : ""}${b.pts}</span></button>`).join("")}</div><textarea class="note" id="bh-note" rows="2" placeholder="ملاحظة (اختياري)…">${esc(e.note || "")}</textarea><div class="sheet-actions"><button class="btn-plain" id="bh-x">إغلاق</button><button class="btn-primary" id="bh-ok">حفظ</button></div>`,
      (o) => {
        o.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { const k = +b.dataset.k; if (sel.has(k)) sel.delete(k); else sel.add(k); b.classList.toggle("sel"); });
        o.querySelector("#bh-x").onclick = closeSheet;
        o.querySelector("#bh-ok").onclick = () => { e.beh = [...sel]; e.note = o.querySelector("#bh-note").value.trim(); save("recs:" + regClass); closeSheet(); drawRows(); };
      });
  }

  /* ═══ الدرجات ═══ */
  let grClass = null;
  function renderGrades() {
    const box = $("#tab-grades"), cls = myClasses();
    if (!cls.length) { box.innerHTML = '<div class="empty-note">لا فصول مسندة</div>'; return; }
    if (!grClass || !cls.find(c => c.id === grClass)) grClass = cls[0].id;
    const c = classById(grClass); const maxTot = ASSESS.reduce((s, a) => s + a.max, 0);
    box.innerHTML = `<div class="class-chips">${cls.map(x => `<button class="chip ${x.id === grClass ? "on" : ""}" data-c="${x.id}">${esc(x.name)}</button>`).join("")}</div>
      <div class="card" style="padding:8px"><h3 style="margin:4px 6px 8px"><span class="dot"></span>رصد درجات ${esc(c.name)} — ${esc(TE.subject)}
        <button class="btn-gold no-print" style="margin-inline-start:auto" id="gr-print">🖨️ طباعة</button></h3>
        <div class="rep-head"><div class="rt">كشف درجات — ${esc(c.name)}</div><div class="rs">${esc(META.school.name)} — ${esc(TE.name)} — ${esc(TE.subject)}</div></div>
        <div class="table-scroll"><table class="grade-table" id="gr-table">
          <tr><th>م</th><th style="min-width:120px">الطالب</th>${ASSESS.map(a => `<th>${esc(a.n)}<br>(${a.max})</th>`).join("")}<th>المجموع<br>(${maxTot})</th><th>التقدير</th></tr>
          ${c.students.map((s, i) => grRow(i, s, maxTot)).join("")}
        </table></div></div>
      <div class="card" id="gr-analysis"></div>`;
    box.querySelectorAll(".chip").forEach(ch => ch.onclick = () => { grClass = ch.dataset.c; renderGrades(); });
    box.querySelectorAll(".gr-in").forEach(inp => {
      inp.oninput = () => {
        const i = +inp.dataset.i, k = inp.dataset.k;
        DB.grades[grClass] = DB.grades[grClass] || {}; DB.grades[grClass][i] = DB.grades[grClass][i] || {};
        let v = inp.value.trim();
        if (v === "") delete DB.grades[grClass][i][k];
        else { const a = ASSESS.find(x => x.k === k); let n = Math.max(0, Math.min(+v || 0, a.max)); DB.grades[grClass][i][k] = n; }
        const tot = gradeTotal(grClass, i), lv = levelOf(maxTot ? tot / maxTot * 100 : 0);
        inp.closest("tr").querySelector(".tot").textContent = tot;
        const lc = inp.closest("tr").querySelector(".lvlcell"); lc.innerHTML = `<span class="lvl lvl${lv.i}">${lv.t}</span>`;
        save("grades:" + grClass); drawAnalysis(maxTot);
      };
    });
    $("#gr-print").onclick = () => window.print();
    drawAnalysis(maxTot);
  }
  function grRow(i, s, maxTot) {
    const g = (DB.grades[grClass] || {})[i] || {}, tot = gradeTotal(grClass, i), lv = levelOf(maxTot ? tot / maxTot * 100 : 0);
    return `<tr><td>${i + 1}</td><td class="nm">${esc(s.n)}</td>${ASSESS.map(a => `<td><input class="gr-in" data-i="${i}" data-k="${a.k}" inputmode="numeric" value="${g[a.k] != null ? g[a.k] : ""}"></td>`).join("")}<td class="tot">${tot}</td><td class="lvlcell"><span class="lvl lvl${lv.i}">${lv.t}</span></td></tr>`;
  }
  function drawAnalysis(maxTot) {
    const c = classById(grClass);
    const scored = c.students.map((s, i) => ({ s, i, tot: gradeTotal(grClass, i), has: Object.keys((DB.grades[grClass] || {})[i] || {}).length > 0 })).filter(x => x.has);
    const box = $("#gr-analysis");
    if (!scored.length) { box.innerHTML = '<h3><span class="dot"></span>تحليل النتائج</h3><div class="empty-note">أدخل الدرجات وسيظهر التحليل تلقائياً</div>'; return; }
    const totals = scored.map(x => x.tot), avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    const pct = (v) => maxTot ? v / maxTot * 100 : 0;
    const hi = scored.slice().sort((a, b) => b.tot - a.tot), lo = hi.slice().reverse();
    const dist = [0, 0, 0, 0, 0]; scored.forEach(x => dist[levelOf(pct(x.tot)).i]++);
    const passCount = scored.filter(x => pct(x.tot) >= 50).length;
    const LB = ["ممتاز", "جيد جداً", "جيد", "مقبول", "دون المطلوب"], LC = ["#2e9e5b", "#58a6d8", "#e8a23d", "#b3541e", "#d64545"];
    box.innerHTML = `<h3><span class="dot"></span>تحليل نتائج ${esc(c.name)}</h3>
      <div class="ana-grid">
        <div class="ana"><div class="v">${scored.length}</div><div class="l">طلاب مرصودون</div></div>
        <div class="ana"><div class="v">${avg.toFixed(1)}</div><div class="l">المتوسط (من ${maxTot})</div></div>
        <div class="ana"><div class="v">${Math.max(...totals)}</div><div class="l">أعلى درجة</div></div>
        <div class="ana"><div class="v">${Math.min(...totals)}</div><div class="l">أدنى درجة</div></div>
      </div>
      <div style="font-weight:800;color:var(--navy);margin:6px 0">نسبة الإتقان: ${Math.round(passCount / scored.length * 100)}% (${passCount} من ${scored.length})</div>
      ${dist.map((n, k) => `<div class="bar-row"><span class="lb">${LB[k]}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n / scored.length * 100)}%;background:${LC[k]}">${n || ""}</div></div></div>`).join("")}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
        <div><div style="font-weight:800;color:var(--ok);margin-bottom:4px">🏅 الأعلى</div>${hi.slice(0, 5).map(x => `<div style="font-size:13px;padding:3px 0">${esc(x.s.n)} — <b>${x.tot}</b></div>`).join("")}</div>
        <div><div style="font-weight:800;color:var(--bad);margin-bottom:4px">📉 يحتاجون دعماً</div>${lo.slice(0, 5).map(x => `<div style="font-size:13px;padding:3px 0">${esc(x.s.n)} — <b>${x.tot}</b></div>`).join("")}</div>
      </div>`;
  }

  /* ═══ بطاقة الطالب + سجل التواصل ═══ */
  function studentCard(cid, i) {
    const c = classById(cid), s = c.students[i], calc = classCalc(cid), t = calc[i].t, rank = calc[i].rank;
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🎖️";
    const maxTot = ASSESS.reduce((a, b) => a + b.max, 0), gtot = gradeTotal(cid, i), hasG = Object.keys((DB.grades[cid] || {})[i] || {}).length > 0;
    const behAgg = {}; Object.values(DB.recs[cid] || {}).forEach(day => { const e = day[i]; if (!e) return; (e.beh || []).forEach(bi => behAgg[bi] = (behAgg[bi] || 0) + 1); });
    const comms = ((DB.comms[cid] || []).filter(x => x.si === i)).slice(-4).reverse();
    const phone = (s.p || "").replace(/\D/g, "").replace(/^0/, "966");
    const waTxt = encodeURIComponent(`السلام عليكم ورحمة الله\nولي أمر الطالب: ${s.n} — ${c.name}\nتقرير من معلم ${TE.subject}:\nالنقاط: ${t.pts} | الترتيب: ${rank} من ${c.students.length}${hasG ? ` | الدرجة: ${gtot}/${maxTot}` : ""}\n${STATES.map((st, k) => t.st[k] ? `${st.name}: ${t.st[k]}` : "").filter(Boolean).join(" | ")}\nالمشاركة: ${t.part} | الواجبات: ${t.hwY}\n${META.school.name}`);
    openSheet(`
      <div class="stu-head"><div style="font-size:34px">${medal}</div><div class="big">${esc(s.n)}</div><div class="sub">${esc(c.name)} — الترتيب ${rank} من ${c.students.length}</div></div>
      <div class="statrow">
        <div class="stat"><div class="v">${t.pts}</div><div class="l">النقاط</div></div>
        <div class="stat"><div class="v">${hasG ? gtot : "—"}</div><div class="l">الدرجة</div></div>
        <div class="stat"><div class="v">${t.hwY}</div><div class="l">واجبات ✓</div></div>
        <div class="stat"><div class="v">${t.days}</div><div class="l">أيام مرصودة</div></div></div>
      <div class="countchips">${STATES.map((st, k) => t.st[k] ? `<span class="cc" style="background:${STCOLORS[k]}">${esc(st.name)} ${t.st[k]}</span>` : "").filter(Boolean).join("") || '<span style="color:var(--muted);font-size:13px">لا حضور مرصود بعد</span>'}</div>
      <div class="countchips">${Object.keys(behAgg).map(bi => `<span class="cc" style="background:${BEH[bi].pts >= 0 ? "var(--ok)" : "var(--bad)"}">${esc(BEH[bi].name)} ×${behAgg[bi]}</span>`).join("")}</div>
      <div style="border-top:1px solid var(--line);margin:12px 0 8px;padding-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center"><b style="color:var(--navy)">📞 سجل التواصل</b><button class="btn-soft" id="sc-addcomm">+ إضافة</button></div>
        <div id="sc-comms" style="margin-top:6px">${comms.length ? comms.map(x => `<div class="comm-item"><span class="tag">${esc(x.why)}</span> ${esc(x.note || "")}<div class="meta">${esc(x.via)} — ${esc(x.date)}</div></div>`).join("") : '<div class="empty-note" style="padding:10px">لا مراسلات مسجلة</div>'}</div></div>
      <a class="wa-btn ${phone ? "" : "off"}" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${waTxt}">💬 واتساب ولي الأمر${phone ? "" : " (لا رقم مسجل)"}</a>
      <div class="sheet-actions" style="flex-wrap:wrap">
        <button class="btn-plain" style="flex:1 1 46%" id="sc-report">📄 تقرير للطباعة</button>
        <button class="btn-plain" style="flex:1 1 46%" id="sc-letter">✉️ إشعار ولي الأمر</button>
        <button class="btn-primary" style="flex:1 1 100%" onclick="window._sheetClose()">إغلاق</button></div>`,
      (o) => {
        o.querySelector("#sc-addcomm").onclick = () => commSheet(cid, i);
        o.querySelector("#sc-report").onclick = () => printReport(cid, i);
        o.querySelector("#sc-letter").onclick = () => printLetter(cid, i);
      });
  }
  function commSheet(cid, i) {
    const c = classById(cid);
    openSheet(`<h4>تواصل مع ولي أمر: ${esc(c.students[i].n)}</h4>
      <div class="field"><label>السبب</label><select id="cm-why" class="search-box">${["إشعار تميّز", "إشعار ضعف", "غياب متكرر", "سلوك", "واجبات", "دعوة لمقابلة", "أخرى"].map(x => `<option>${x}</option>`).join("")}</select></div>
      <div class="field"><label>الوسيلة</label><select id="cm-via" class="search-box">${["واتساب", "اتصال هاتفي", "رسالة", "مقابلة", "نور"].map(x => `<option>${x}</option>`).join("")}</select></div>
      <textarea class="note" id="cm-note" rows="2" placeholder="ملاحظة (اختياري)…"></textarea>
      <div class="sheet-actions"><button class="btn-plain" onclick="window._sheetClose()">إلغاء</button><button class="btn-primary" id="cm-ok">حفظ</button></div>`,
      (o) => o.querySelector("#cm-ok").onclick = () => {
        DB.comms[cid] = DB.comms[cid] || [];
        DB.comms[cid].push({ si: i, why: o.querySelector("#cm-why").value, via: o.querySelector("#cm-via").value, note: o.querySelector("#cm-note").value.trim(), date: hijriLabel() });
        save("comms:" + cid); closeSheet(); studentCard(cid, i);
      });
  }
  function printDoc(title, bodyHtml) {
    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>body{font-family:'Tajawal',Arial,sans-serif;padding:36px;color:#1B2A3A}
      .h{text-align:center;border-bottom:3px solid #D7A93F;padding-bottom:12px;margin-bottom:20px}
      .h .s{font-size:20px;font-weight:800;color:#0E2033}.h .m{color:#666;font-size:13px}
      table{width:100%;border-collapse:collapse;margin:14px 0}td,th{border:1px solid #ccc;padding:7px 10px;font-size:14px}
      th{background:#0E2033;color:#F0D99A}.tt{font-size:22px;font-weight:800;color:#0E2033;text-align:center;margin:10px 0}
      .sig{display:flex;justify-content:space-between;margin-top:50px;font-size:14px;color:#444}p{line-height:2;font-size:15px}</style></head>
      <body>${bodyHtml}<script>onload=()=>{print()}<\/script></body></html>`);
    w.document.close();
  }
  function printReport(cid, i) {
    const c = classById(cid), s = c.students[i], calc = classCalc(cid), t = calc[i].t, rank = calc[i].rank;
    const maxTot = ASSESS.reduce((a, b) => a + b.max, 0), g = (DB.grades[cid] || {})[i] || {}, gtot = gradeTotal(cid, i);
    printDoc("تقرير الطالب " + s.n, `
      <div class="h"><div class="s">${esc(META.school.name)}</div><div class="m">تقرير متابعة الطالب — مادة ${esc(TE.subject)} — ${esc(hijriLabel())}</div></div>
      <div class="tt">${esc(s.n)}</div>
      <table><tr><th>الفصل</th><td>${esc(c.name)}</td><th>الترتيب</th><td>${rank} من ${c.students.length}</td></tr>
      <tr><th>مجموع النقاط</th><td>${t.pts}</td><th>الدرجة</th><td>${gtot} / ${maxTot}</td></tr></table>
      <table><tr><th>الحضور</th>${STATES.map(st => `<th>${esc(st.name)}</th>`).join("")}</tr>
      <tr><td>عدد</td>${STATES.map((st, k) => `<td>${t.st[k] || 0}</td>`).join("")}</tr></table>
      <table><tr><th>المشاركة</th><td>${t.part}</td><th>الواجبات المنجزة</th><td>${t.hwY}</td><th>أيام الرصد</th><td>${t.days}</td></tr></table>
      <table><tr>${ASSESS.map(a => `<th>${esc(a.n)}</th>`).join("")}</tr><tr>${ASSESS.map(a => `<td>${g[a.k] != null ? g[a.k] : "—"}</td>`).join("")}</tr></table>
      <div class="sig"><span>معلم المادة: ${esc(TE.name)}</span><span>مدير المدرسة: .....................</span></div>`);
  }
  function printLetter(cid, i) {
    const c = classById(cid), s = c.students[i], t = calcStudent(cid, i);
    const weak = t.pts < 0 || t.st[1] > 1 || t.hwN > 1;
    printDoc("إشعار ولي أمر " + s.n, `
      <div class="h"><div class="s">${esc(META.school.name)}</div><div class="m">إشعار ولي الأمر — ${esc(hijriLabel())}</div></div>
      <div class="tt">${weak ? "إشعار متابعة" : "إشعار تميّز"}</div>
      <p>المكرّم ولي أمر الطالب / <b>${esc(s.n)}</b> — الصف ${esc(c.name)} &nbsp;&nbsp; حفظه الله</p>
      <p>السلام عليكم ورحمة الله وبركاته،</p>
      <p>${weak
        ? `نحيطكم علماً بأن ابنكم بحاجة إلى مزيد من المتابعة في مادة ${esc(TE.subject)}؛ حيث بلغت نقاطه ${t.pts}، وسجّل ${t.st[1]} غياب و${t.hwN} واجب غير منجز. نأمل تعاونكم في متابعته وحثّه على الانتظام وأداء الواجبات.`
        : `يسعدنا إشعاركم بتميّز ابنكم في مادة ${esc(TE.subject)}؛ حيث بلغت نقاطه ${t.pts} مع انتظام في الحضور وأداء الواجبات. نشكر لكم حسن متابعتكم، ونسأل الله له دوام التوفيق.`}</p>
      <p>شاكرين لكم تعاونكم الدائم مع المدرسة.</p>
      <div class="sig"><span>معلم المادة: ${esc(TE.name)}</span><span>توقيع ولي الأمر: ................</span></div>`);
  }

  /* ═══ التقارير ═══ */
  let repClass = null;
  function renderRep() {
    const box = $("#tab-rep"), cls = myClasses();
    if (!cls.length) { box.innerHTML = '<div class="empty-note">لا فصول مسندة</div>'; return; }
    if (!repClass || !cls.find(c => c.id === repClass)) repClass = cls[0].id;
    const c = classById(repClass), rows = classCalc(repClass);
    const tot = { st: STATES.map(() => 0), part: 0, hwY: 0, behP: 0, behN: 0 };
    rows.forEach(r => { STATES.forEach((s, k) => tot.st[k] += r.t.st[k]); tot.part += r.t.part; tot.hwY += r.t.hwY; tot.behP += r.t.behP; tot.behN += r.t.behN; });
    box.innerHTML = `<div class="class-chips no-print">${cls.map(x => `<button class="chip ${x.id === repClass ? "on" : ""}" data-c="${x.id}">${esc(x.name)}</button>`).join("")}</div>
      <div class="card"><div class="rep-head"><div class="rt">سجل متابعة الفصل — ${esc(c.name)}</div><div class="rs">${esc(META.school.name)} — معلم المادة: ${esc(TE.name)} — ${esc(hijriLabel())}</div></div>
        <h3 class="no-print"><span class="dot"></span>كشف متابعة ${esc(c.name)}<button class="btn-gold" style="margin-inline-start:auto" id="rep-print">🖨️ طباعة / PDF</button></h3>
        <div class="table-scroll"><table class="report-table">
          <tr><th>م</th><th style="min-width:130px">اسم الطالب</th>${STATES.map(s => `<th>${esc(s.name)}</th>`).join("")}<th>مشاركة</th><th>واجبات</th><th>سلوك+</th><th>سلوك−</th><th>النقاط</th><th>الترتيب</th></tr>
          ${rows.map((r, i) => `<tr><td>${i + 1}</td><td class="nm">${esc(r.s.n)}</td>${STATES.map((s, k) => `<td>${r.t.st[k] || ""}</td>`).join("")}<td>${r.t.part || ""}</td><td>${r.t.hwY || ""}</td><td>${r.t.behP || ""}</td><td>${r.t.behN || ""}</td><td><b>${r.t.pts}</b></td><td>${r.rank}</td></tr>`).join("")}
          <tr class="tot"><td></td><td class="nm">المجموع</td>${STATES.map((s, k) => `<td>${tot.st[k] || ""}</td>`).join("")}<td>${tot.part || ""}</td><td>${tot.hwY || ""}</td><td>${tot.behP || ""}</td><td>${tot.behN || ""}</td><td></td><td></td></tr>
        </table></div></div>`;
    box.querySelectorAll(".chip").forEach(ch => ch.onclick = () => { repClass = ch.dataset.c; renderRep(); });
    $("#rep-print").onclick = () => window.print();
  }

  /* ═══ المزيد (بحث + مدير + نسخة احتياطية) ═══ */
  async function renderMore() {
    const box = $("#tab-more");
    let adminHtml = "";
    if (TE.admin && CLOUD && fdb) adminHtml = '<div class="card" id="adm-card"><h3><span class="dot"></span>لوحة المدير — رصد المعلمين لحظياً</h3><div class="empty-note">جارِ التحميل…</div></div>';
    else if (TE.admin) adminHtml = `<div class="card"><h3><span class="dot"></span>لوحة المدير</h3>${D.teachers.filter(t => (t.classes || []).length).map(t => `<div class="admin-row"><span>${esc(t.name)}<div class="cls">${esc(t.subject)}</div></span><span class="cls">${(t.classes || []).length} فصول</span></div>`).join("")}</div>`;
    box.innerHTML = `
      <div class="card"><h3><span class="dot"></span>🔍 بحث عن طالب</h3>
        <input class="search-box" id="mo-search" placeholder="اكتب اسم الطالب…">
        <div class="search-res" id="mo-res"></div></div>
      ${adminHtml}
      <div class="card"><h3><span class="dot"></span>النسخة الاحتياطية</h3>
        <div style="display:flex;gap:8px"><button class="btn-gold" id="bk-out" style="flex:1;text-align:center">⬇️ تصدير بياناتي</button><button class="btn-gold" id="bk-in" style="flex:1;text-align:center">⬆️ استعادة نسخة</button><input type="file" id="bk-file" accept=".json" class="hidden"></div>
        <div class="empty-note" style="padding:10px 4px 0">${CLOUD ? "بياناتك محفوظة سحابياً تلقائياً — التصدير نسخة إضافية بيدك" : "ملف JSON يُحفظ أو يُرسل واتساب ثم يُستعاد على أي جهاز"}</div></div>
      <div class="card"><h3><span class="dot"></span>مكتبة التقييمات</h3>
        <div class="countchips">${STATES.map((s, k) => `<span class="cc" style="background:${STCOLORS[k]}">${esc(s.name)} ${s.pts >= 0 ? "+" : ""}${s.pts}</span>`).join("")}</div>
        <div class="countchips">${BEH.map(b => `<span class="cc" style="background:${b.pts >= 0 ? "var(--ok)" : "var(--bad)"}">${esc(b.name)} ${b.pts >= 0 ? "+" : ""}${b.pts}</span>`).join("")}</div></div>
      <div class="card"><h3><span class="dot"></span>عن البرنامج</h3><div style="font-size:13.5px;line-height:2;color:var(--muted)">سجل المتابعة الرقمي — ${CLOUD ? "النسخة السحابية المشتركة ☁️" : "نسخة تجريبية محلية"}.<br>يعمل على أي جهاز: جوال، تابلت، وكمبيوتر.<br><b>المطوّر:</b> أ. ضيف الله أحمد محمد مشني</div></div>`;
    // بحث
    const res = $("#mo-res");
    $("#mo-search").oninput = (e) => {
      const q = e.target.value.trim();
      if (q.length < 2) { res.innerHTML = ""; return; }
      const hits = [];
      myClasses().forEach(c => c.students.forEach((s, i) => { if (s.n.includes(q)) hits.push({ c, s, i }); }));
      res.innerHTML = hits.slice(0, 20).map(h => `<div class="stu" data-c="${h.c.id}" data-i="${h.i}"><span class="nm">${esc(h.s.n)}<small>${esc(h.c.name)}</small></span><span style="color:var(--gold)">›</span></div>`).join("") || '<div class="empty-note">لا نتائج</div>';
      res.querySelectorAll(".stu").forEach(row => row.onclick = () => studentCard(row.dataset.c, +row.dataset.i));
    };
    // نسخة احتياطية
    $("#bk-out").onclick = () => {
      const blob = new Blob([JSON.stringify({ v: 2, teacher: TE.id, recs: DB.recs, grades: DB.grades, comms: DB.comms })], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "نسخة سجل المتابعة - " + TE.name + ".json"; a.click();
    };
    $("#bk-in").onclick = () => $("#bk-file").click();
    $("#bk-file").onchange = (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const j = JSON.parse(rd.result); if (!j.recs) throw 0;
          DB.recs = j.recs || {}; DB.grades = j.grades || {}; DB.comms = j.comms || {};
          Object.keys(DB.recs).forEach(cid => save("recs:" + cid));
          Object.keys(DB.grades).forEach(cid => save("grades:" + cid));
          alert("تمت الاستعادة بنجاح ✓"); renderToday();
        } catch (e) { alert("ملف غير صالح"); }
      };
      rd.readAsText(f);
    };
    if (TE.admin && CLOUD && fdb) {
      try {
        const all = await fdb.collection("recs").get(), per = {};
        all.forEach(d2 => { const [tid, cid] = d2.id.split("_"); per[tid] = per[tid] || { c: new Set(), days: 0 }; per[tid].c.add(cid); per[tid].days += Object.keys((d2.data() || {}).d || {}).length; });
        const card = $("#adm-card");
        if (card) card.innerHTML = `<h3><span class="dot"></span>لوحة المدير — رصد المعلمين لحظياً</h3>` + D.teachers.filter(t => (t.classes || []).length).map(t => { const p = per[t.id]; return `<div class="admin-row"><span>${esc(t.name)}<div class="cls">${esc(t.subject)}</div></span><span class="cls">${p ? `${p.c.size} فصول · ${p.days} يوم رصد` : "لم يبدأ بعد"}</span></div>`; }).join("");
      } catch (e) { }
    }
  }

  /* ═══════════ بوابة الطالب ═══════════ */
  async function renderStudent(sid) {
    const [cid, si] = sid.split(":"); const i = +si;
    const c = classById(cid); if (!c) { DB.session = null; DB.srole = null; save(); location.reload(); return; }
    const s = c.students[i];
    $("#view-login").classList.add("hidden");
    const V = $("#view-student"); V.classList.remove("hidden");
    V.innerHTML = `<div class="st-hero"><button class="btn-ghost out" id="st-out">خروج</button><div class="medal">🎒</div><div class="nm">${esc(s.n)}</div><div class="cl">${esc(c.name)} — ${esc(META.school.name)}</div></div>
      <div class="seg"><button data-s="card" class="on">بطاقتي</button><button data-s="lessons">دروسي</button><button data-s="cert">شهادتي</button></div>
      <div id="st-body"><div class="empty-note">جارِ التحميل…</div></div>`;
    V.querySelector("#st-out").onclick = () => { DB.session = null; DB.srole = null; save(); setTimeout(() => location.reload(), 200); };
    V.querySelectorAll(".seg button").forEach(b => b.onclick = () => { V.querySelectorAll(".seg button").forEach(x => x.classList.toggle("on", x === b)); stSection(b.dataset.s); });

    // اجمع بيانات الطالب عبر كل معلميه
    const agg = { pts: 0, st: STATES.map(() => 0), part: 0, hwY: 0, days: 0, beh: {}, grades: [] };
    async function gather() {
      let recDocs = [], grDocs = [];
      if (CLOUD && fdb) {
        try {
          const [rs, gs] = await Promise.all([fdb.collection("recs").get(), fdb.collection("grades").get()]);
          rs.forEach(d2 => { if (d2.id.endsWith("_" + cid)) recDocs.push({ tid: d2.id.split("_")[0], d: (d2.data() || {}).d || {} }); });
          gs.forEach(d2 => { if (d2.id.endsWith("_" + cid)) grDocs.push({ tid: d2.id.split("_")[0], g: (d2.data() || {}).g || {} }); });
        } catch (e) { }
      } else {
        if (DB.recs[cid]) recDocs.push({ tid: "local", d: DB.recs[cid] });
        if (DB.grades[cid]) grDocs.push({ tid: "local", g: DB.grades[cid] });
      }
      recDocs.forEach(rd => {
        Object.values(rd.d).forEach(day => {
          const e = day[i]; if (!e) return; agg.days++;
          if (e.a != null && STATES[e.a]) { agg.st[e.a]++; agg.pts += (+STATES[e.a].pts || 0); }
          if (e.part) { agg.part += e.part; agg.pts += e.part * W.part; }
          if (e.hw === 1) { agg.hwY++; agg.pts += W.hw; }
          if (e.sh) agg.pts += e.sh * W.sheets;
          (e.beh || []).forEach(bi => { const b = BEH[bi]; if (b) { agg.pts += (+b.pts || 0); agg.beh[bi] = (agg.beh[bi] || 0) + 1; } });
        });
      });
      agg.pts = Math.round(agg.pts * 10) / 10;
      const maxTot = ASSESS.reduce((a, b) => a + b.max, 0);
      grDocs.forEach(gd => {
        const g = gd.g[i]; if (!g || !Object.keys(g).length) return;
        let sum = 0; ASSESS.forEach(a => { const v = +g[a.k]; if (!isNaN(v)) sum += Math.min(v, a.max); });
        const teacher = D.teachers.find(t => t.id === gd.tid);
        agg.grades.push({ subj: teacher ? teacher.subject : "مادة", tot: Math.round(sum * 10) / 10, max: maxTot });
      });
    }
    await gather();

    function stSection(sec) {
      const body = $("#st-body");
      if (sec === "card") {
        body.innerHTML = `<div class="kpis" style="margin:12px"><div class="kpi"><div class="v">${agg.pts}</div><div class="l">نقاطي</div></div><div class="kpi"><div class="v">${agg.st[0]}</div><div class="l">أيام حضوري</div></div><div class="kpi"><div class="v">${agg.hwY}</div><div class="l">واجباتي ✓</div></div></div>
          <div class="card" style="margin:12px"><h3><span class="dot"></span>حضوري وسلوكي</h3>
            <div class="countchips">${STATES.map((st, k) => agg.st[k] ? `<span class="cc" style="background:${STCOLORS[k]}">${esc(st.name)} ${agg.st[k]}</span>` : "").filter(Boolean).join("") || '<span style="color:var(--muted);font-size:13px">لا رصد بعد</span>'}</div>
            <div class="countchips">${Object.keys(agg.beh).map(bi => `<span class="cc" style="background:${BEH[bi].pts >= 0 ? "var(--ok)" : "var(--bad)"}">${esc(BEH[bi].name)} ×${agg.beh[bi]}</span>`).join("")}</div></div>
          <div class="card" style="margin:12px"><h3><span class="dot"></span>درجاتي</h3>${agg.grades.length ? `<div class="table-scroll"><table class="report-table"><tr><th>المادة</th><th>الدرجة</th><th>من</th></tr>${agg.grades.map(g => `<tr><td class="nm">${esc(g.subj)}</td><td><b>${g.tot}</b></td><td>${g.max}</td></tr>`).join("")}</table></div>` : '<div class="empty-note">لم تُرصد درجات بعد</div>'}</div>`;
      } else if (sec === "lessons") {
        body.innerHTML = `<div class="empty-note">جارِ تحميل دروس هذا الأسبوع…</div>`;
        loadStudentLessons(c, body);
      } else {
        const rank = "—", stars = "★".repeat(Math.max(1, Math.min(5, Math.round(agg.pts > 0 ? Math.min(5, agg.pts / 10 + 1) : 1))));
        body.innerHTML = `<div class="cert"><div class="seal">🏆</div><div class="t">شهادة إنجاز</div>
          <div class="body">تشهد ${esc(META.school.name)} بأن الطالب</div>
          <div class="who">${esc(s.n)}</div>
          <div class="body">من ${esc(c.name)} قد أظهر تفاعلاً وحرصاً في دروسه،<br>وجمع <b>${agg.pts}</b> نقطة. نسأل الله له دوام التوفّق والتميّز.</div>
          <div class="stars" style="color:var(--gold)">${stars}</div>
          <div class="foot"><span>${esc(hijriLabel())}</span><span>إدارة المدرسة</span></div>
          <button class="btn-gold no-print" style="margin-top:14px" onclick="print()">🖨️ طباعة الشهادة</button></div>`;
      }
    }
    stSection("card");
  }
  async function loadStudentLessons(c, body) {
    const wk = curWeek();
    // مواد فصله = مواد المعلمين الذين يدرّسونه
    const subs = [...new Set(D.teachers.filter(t => (t.classes || []).includes(c.id)).map(t => t.subject))];
    let html = `<div style="text-align:center;margin:12px"><span class="weekpill">دروس الأسبوع ${wk}</span></div>`;
    let any = false;
    for (const subj of subs) {
      const sc = subjCode(subj); if (!sc) continue;
      const code = sc + c.gc + TERM, rows = (await loadCurr(code)).filter(r => r.w === wk);
      const main = rows.find(r => r.lesson && !String(r.lesson).includes("تابع")) || rows[0];
      if (!main) continue;
      const nm = main.lesson, off = String(nm).includes("إجازة"); any = true;
      html += `<div class="lesson-card"><div class="sj">${esc(subj)}</div><div class="ls">${esc(nm)}</div>${off ? '<span style="color:var(--muted)">إجازة</span>' : `<a class="btn-gold" target="_blank" rel="noopener" href="${lessonURL(code, wk)}">🚀 ابدأ الدرس التفاعلي</a>`}</div>`;
    }
    body.innerHTML = any ? html : '<div class="empty-note">لا دروس تفاعلية متاحة لهذا الأسبوع</div>';
  }

  /* ═══ إقلاع ═══ */
  if (!CLOUD) { const ds = $("#demo-strip"); if (ds) ds.textContent = "نسخة تجريبية — طلاب بأسماء وهمية، والبيانات على هذا الجهاز فقط"; }
  boot();
})();
