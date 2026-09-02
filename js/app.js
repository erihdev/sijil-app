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
  function calcStudent(cid, si, recsOverride) {
    const out = { pts: 0, days: 0, st: STATES.map(() => 0), part: 0, hwY: 0, hwN: 0, sh: 0, behP: 0, behN: 0, notes: [] };
    const cd = recsOverride || DB.recs[cid] || {};
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
  function gradeTotal(cid, si, gOverride) {
    const g = (gOverride || DB.grades[cid] || {})[si] || {};
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
    let rows = [];
    try { const r = await fetch("data/curr/" + code + ".json"); rows = r.ok ? await r.json() : []; }
    catch (e) { rows = []; }
    if (CLOUD && fdb) {
      try {
        const ov = await fdb.doc("curredits/" + code).get();
        if (ov.exists) { const o = (ov.data() || {}).rows || {}; Object.keys(o).forEach(idx => { if (rows[idx]) rows[idx] = Object.assign({}, rows[idx], o[idx]); }); }
      } catch (e) { }
    }
    currCache[code] = rows;
    return rows;
  }
  async function saveCurrEdit(code, idx, patch) {
    const rows = currCache[code]; if (rows && rows[idx]) rows[idx] = Object.assign({}, rows[idx], patch);
    if (CLOUD && fdb) { try { await fdb.doc("curredits/" + code).set({ rows: { [idx]: patch }, ts: Date.now(), tn: TE.name }, { merge: true }); return true; } catch (e) { return false; } }
    return true;
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
    if (DB.session && DB.srole === "student") { DB.session = null; DB.srole = null; save(); }
    if (DB.session) {
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
    const high = all.slice().sort((a, b) => b.r.t.pts - a.r.t.pts).filter(x => x.r.t.pts > 0).slice(0, 5);
    const MED = ["🥇", "🥈", "🥉", "🎖️", "🎖️"];
    box.innerHTML = `
      <div class="card" style="background:linear-gradient(150deg,var(--navy),var(--navy2));color:#fff;border:none">
        <div style="font-size:13px;color:#c9d5e3">${esc(hijriLabel())}</div>
        <div style="font-size:19px;font-weight:800;color:var(--goldl);margin-top:2px">أهلاً أ. ${esc(TE.name.split(" ")[0])} 👋</div></div>
      <div class="kpis">
        <div class="kpi"><div class="v">${myClasses().length}</div><div class="l">فصولي</div></div>
        <div class="kpi"><div class="v">${all.length}</div><div class="l">طلابي</div></div>
        <div class="kpi"><div class="v">${mine.length}</div><div class="l">حصص اليوم</div></div></div>
      ${myClasses().length ? `<button class="btn-primary" id="today-live" style="margin-bottom:12px;font-size:17px">🎬 ابدأ حصة تفاعلية</button>` : ""}
      <div class="card"><h3><span class="dot"></span>حصص اليوم (${esc(today)})</h3><div class="periods">${per.join("")}</div></div>
      <div class="card" id="today-lesson"><h3><span class="dot"></span>درس هذا الأسبوع</h3><span class="weekpill">الأسبوع ${wk}</span><div class="empty-note" style="padding:8px">جارِ التحميل…</div></div>
      <div class="card"><h3><span class="dot"></span>🏆 لوحة الشرف — الأوائل</h3>
        <div class="alert-list">${high.length ? high.map((x, k) => `<div class="al"><span><b style="font-size:16px">${MED[k]}</b> ${esc(x.r.s.n)} <small style="color:var(--muted)">— ${esc(x.c.name)}</small></span><span class="pts" style="color:var(--ok)">${x.r.t.pts}</span></div>`).join("") : '<div class="empty-note">ابدأ الرصد وستظهر أسماء المتميزين هنا 🌟</div>'}</div></div>
      <div class="card"><h3><span class="dot"></span>طلاب يحتاجون التفاتة (الأدنى نقاطاً)</h3>
        <div class="alert-list">${low.length ? low.map(x => `<div class="al"><span>${esc(x.r.s.n)} <small style="color:var(--muted)">— ${esc(x.c.name)}</small></span><span class="pts">${x.r.t.pts}</span></div>`).join("") : '<div class="empty-note">ابدأ التحضير أولاً وستظهر القائمة هنا</div>'}</div></div>`;
    const tl = $("#today-live"); if (tl) tl.onclick = () => pickClassThen(liveSession);
    const sc = subjCode(TE.subject), grades = [...new Set(myClasses().map(c => c.gc))].sort();
    const LB = $("#today-lesson");
    if (!sc || !grades.length) { LB.querySelector(".empty-note").textContent = TE.admin ? "لوحة المدير في تبويب «المزيد»" : "لا مادة مسندة"; return; }
    let html = `<span class="weekpill">الأسبوع ${wk} — ${esc(TE.subject)}</span>`;
    for (const g of grades) {
      const code = sc + g + TERM, rows = (await loadCurr(code)).filter(r => r.w === wk);
      const main = rows.find(r => r.lesson && !String(r.lesson).includes("تابع")) || rows[0];
      const nm = main ? main.lesson : "—", off = !main || String(nm).includes("إجازة");
      html += `<div class="lesson-line" style="margin-top:9px"><span class="nm">الصف ${GNAME[g]}: ${esc(nm)}</span>${off ? "" : `<button class="btn-gold" data-g="${g}">🚀 افتح الدرس التفاعلي</button>`}</div>`;
    }
    LB.innerHTML = `<h3><span class="dot"></span>درس هذا الأسبوع</h3>` + html;
    LB.querySelectorAll("[data-g]").forEach(b => b.onclick = () => {
      const cl = myClasses().find(c => c.gc === +b.dataset.g);
      if (cl) liveSession(cl.id, "lesson");
    });
  }

  /* ═══ التحضير ═══ */
  let regClass = null, regDate = new Date().toISOString().slice(0, 10);
  function renderReg() {
    const box = $("#tab-reg"), cls = myClasses();
    if (!cls.length) { box.innerHTML = '<div class="empty-note">لا فصول مسندة لك' + (TE.admin ? " — لوحة المدير في «المزيد»" : "") + "</div>"; return; }
    if (!regClass || !cls.find(c => c.id === regClass)) regClass = cls[0].id;
    box.innerHTML = `<div class="class-chips">${cls.map(c => `<button class="chip ${c.id === regClass ? "on" : ""}" data-c="${c.id}">${esc(c.name)}</button>`).join("")}</div>
      <div class="reg-tools"><input type="date" id="reg-date" value="${regDate}"><button class="btn-soft" id="reg-all">✓ الكل حاضر</button><button class="btn-gold" id="reg-live">🎬 وضع العرض</button></div>
      <div class="card" id="reg-list" style="padding:6px 10px"></div>`;
    box.querySelectorAll(".chip").forEach(ch => ch.onclick = () => { regClass = ch.dataset.c; renderReg(); });
    $("#reg-date").onchange = (e) => { regDate = e.target.value; drawRows(); };
    $("#reg-all").onclick = () => { const c = classById(regClass); c.students.forEach((s, i) => { const e = rec(regClass, regDate, i, true); if (e.a == null) e.a = 0; }); save("recs:" + regClass); drawRows(); };
    $("#reg-live").onclick = () => liveSession(regClass);
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
        <button class="btn-gold" style="flex:1 1 100%" id="sc-prog">📈 تقدّم الطالب في كل المواد</button>
        <button class="btn-gold" style="flex:1 1 100%" id="sc-cert">🎓 شهادة تميّز (طباعة فاخرة)</button>
        <button class="btn-primary" style="flex:1 1 100%" onclick="window._sheetClose()">إغلاق</button></div>`,
      (o) => {
        o.querySelector("#sc-addcomm").onclick = () => commSheet(cid, i);
        o.querySelector("#sc-report").onclick = () => printReport(cid, i);
        o.querySelector("#sc-letter").onclick = () => printLetter(cid, i);
        o.querySelector("#sc-cert").onclick = () => printCertificate(cid, i);
        o.querySelector("#sc-prog").onclick = () => studentProgress(cid, i);
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
  const PRINT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
    *{box-sizing:border-box}body{font-family:'Tajawal',Arial,sans-serif;color:#1B2A3A;margin:0;padding:26px;background:#fff}
    .frame{border:3px solid #D7A93F;border-radius:14px;padding:26px 30px;position:relative}
    .frame::before{content:'';position:absolute;inset:6px;border:1px solid #D7A93F;border-radius:9px;pointer-events:none}
    .h{text-align:center;margin-bottom:18px}
    .h .bar{background:linear-gradient(135deg,#0E2033,#142A44);color:#F0D99A;border-radius:10px;padding:12px;font-size:20px;font-weight:800}
    .h .m{color:#555;font-size:13px;margin-top:8px}
    table{width:100%;border-collapse:collapse;margin:14px 0}td,th{border:1px solid #d8cfae;padding:7px 10px;font-size:14px;text-align:center}
    th{background:#0E2033;color:#F0D99A}tr:nth-child(even) td{background:#fbf6ea}
    .tt{font-size:22px;font-weight:800;color:#0E2033;text-align:center;margin:12px 0}
    .sig{display:flex;justify-content:space-between;margin-top:48px;font-size:14px;color:#333}
    p{line-height:2;font-size:15px}
    .seal{width:70px;height:70px;margin:0 auto 6px;background:#D7A93F;border:3px solid #0E2033;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:34px}
    .stars{color:#D7A93F;font-size:30px;letter-spacing:8px;text-align:center;margin:12px 0}
    .who{font-size:30px;font-weight:800;color:#b8860b;text-align:center;margin:14px auto;border-bottom:3px dotted #D7A93F;display:table;padding:0 34px 8px}
    .ctr{text-align:center;font-size:15px;line-height:2.1}`;
  function printDoc(title, bodyHtml, opts) {
    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}${opts && opts.land ? "@page{size:landscape}" : ""}</style></head><body><div class="frame">${bodyHtml}</div><script>onload=()=>{setTimeout(()=>print(),350)}<\/script></body></html>`);
    w.document.close();
  }
  function printCertificate(cid, i, aggPts) {
    const c = classById(cid), s = c.students[i];
    const pts = aggPts != null ? aggPts : calcStudent(cid, i).pts;
    const nStars = Math.max(1, Math.min(5, Math.round(pts > 0 ? pts / 12 + 1 : 1)));
    const stars = "★".repeat(nStars) + "☆".repeat(5 - nStars);
    printDoc("شهادة تميّز — " + s.n, `
      <div class="seal">🏆</div>
      <div class="tt" style="color:#b8860b;font-size:28px">شهادة تميّز وإنجاز</div>
      <div class="ctr">تتقدّم ${esc(META.school.name)} بخالص التقدير للطالب المتميّز</div>
      <div class="who">${esc(s.n)}</div>
      <div class="ctr">من ${esc(c.name)}، تقديراً لتميّزه وحرصه وتفاعله المستمر،<br>حيث جمع <b>${pts}</b> نقطة. فله منّا كل الفخر، ونسأل الله له دوام التوفّق والعلا.</div>
      <div class="stars">${stars}</div>
      <div class="sig"><span>معلم المادة: ${esc(TE ? TE.name : "")}</span><span>مدير المدرسة: ..............</span></div>
      <div class="ctr" style="color:#888;font-size:12px;margin-top:14px">${esc(hijriLabel())}</div>`, { land: true });
  }
  function printReport(cid, i) {
    const c = classById(cid), s = c.students[i], calc = classCalc(cid), t = calc[i].t, rank = calc[i].rank;
    const maxTot = ASSESS.reduce((a, b) => a + b.max, 0), g = (DB.grades[cid] || {})[i] || {}, gtot = gradeTotal(cid, i);
    printDoc("تقرير الطالب " + s.n, `
      <div class="h"><div class="bar">${esc(META.school.name)}</div><div class="m">تقرير متابعة الطالب — مادة ${esc(TE.subject)} — ${esc(hijriLabel())}</div></div>
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
      <div class="h"><div class="bar">${esc(META.school.name)}</div><div class="m">إشعار ولي الأمر — ${esc(hijriLabel())}</div></div>
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
    // لوحة شرف الفصل (قابلة للطباعة والتعليق)
    const top = rows.slice().sort((a, b) => b.t.pts - a.t.pts).filter(r => r.t.pts > 0).slice(0, 10);
    const MED = ["🥇", "🥈", "🥉"];
    const honor = document.createElement("div");
    honor.className = "card";
    honor.innerHTML = `<div class="rep-head"><div class="rt">🏆 لوحة شرف ${esc(c.name)}</div><div class="rs">${esc(META.school.name)} — ${esc(TE.subject)} — ${esc(hijriLabel())}</div></div>
      <h3 class="no-print"><span class="dot"></span>🏆 لوحة الشرف — ${esc(c.name)}<button class="btn-gold" style="margin-inline-start:auto" id="hon-print">🖨️ طباعة للتعليق</button></h3>
      ${top.length ? `<div class="table-scroll"><table class="report-table"><tr><th>الترتيب</th><th style="min-width:150px">الطالب المتميّز</th><th>النقاط</th></tr>
        ${top.map((r, k) => `<tr><td style="font-size:16px">${k < 3 ? MED[k] : k + 1}</td><td class="nm">${esc(r.s.n)}</td><td><b>${r.t.pts}</b></td></tr>`).join("")}</table></div>`
        : '<div class="empty-note">ابدأ الرصد وستظهر أسماء المتميزين هنا 🌟</div>'}`;
    box.appendChild(honor);
    parentReportsCard(box);
    box.querySelectorAll(".chip").forEach(ch => ch.onclick = () => { repClass = ch.dataset.c; renderRep(); });
    $("#rep-print").onclick = () => window.print();
    const hp = $("#hon-print"); if (hp) hp.onclick = () => printHonor(c, top, MED);
  }
  function printHonor(c, top, MED) {
    printDoc("لوحة شرف " + c.name, `
      <div class="h"><div class="bar">${esc(META.school.name)}</div><div class="m">${esc(TE.subject)} — ${esc(hijriLabel())}</div></div>
      <div class="tt">🏆 لوحة الشرف — ${esc(c.name)}</div>
      <table><tr><th>الترتيب</th><th>الطالب المتميّز</th><th>النقاط</th></tr>
      ${top.map((r, k) => `<tr><td style="font-size:20px">${k < 3 ? MED[k] : k + 1}</td><td style="font-weight:800">${esc(r.s.n)}</td><td><b>${r.t.pts}</b></td></tr>`).join("")}</table>
      <p style="text-align:center;color:#666;margin-top:20px">نبارك لأبنائنا المتميّزين ونسأل الله لهم دوام التفوّق 🌟</p>
      <div class="sig"><span>معلم المادة: ${esc(TE.name)}</span><span>مدير المدرسة: ..............</span></div>`);
  }

  /* ═══ المزيد (بحث + مدير + نسخة احتياطية) ═══ */
  async function renderMore() {
    const box = $("#tab-more");
    let adminHtml = "";
    if (TE.admin && CLOUD && fdb) adminHtml = '<div class="card" id="adm-card"><h3><span class="dot"></span>لوحة المدير — رصد المعلمين لحظياً</h3><div class="empty-note">جارِ التحميل…</div></div>';
    else if (TE.admin) adminHtml = `<div class="card"><h3><span class="dot"></span>لوحة المدير</h3>${D.teachers.filter(t => (t.classes || []).length).map(t => `<div class="admin-row"><span>${esc(t.name)}<div class="cls">${esc(t.subject)}</div></span><span class="cls">${(t.classes || []).length} فصول</span></div>`).join("")}</div>`;
    if (TE.admin) adminHtml += `<div class="card"><h3><span class="dot"></span>📊 مستويات الطلاب</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn-gold" id="adm-levels">📊 حسب الفصل وكل المواد</button><button class="btn-gold" id="adm-school">🏫 ملخص المدرسة حسب المادة</button></div></div>`;
    box.innerHTML = `
      <div class="card"><h3><span class="dot"></span>🧰 أدوات المعلم</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn-gold" id="tl-curr">📚 مناهجي</button>
          <button class="btn-gold" id="tl-sessions">🗓️ سجل الحصص</button>
          <button class="btn-gold" id="tl-plans">🩺 الخطط العلاجية والإثرائية</button>
          <button class="btn-gold" id="tl-calc">🧮 حاسبة المهام الأدائية</button>
          <button class="btn-gold" id="tl-sheets" style="grid-column:1/3">📝 بنك أوراق العمل</button>
        </div></div>
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
    // أدوات المعلم
    const al = $("#adm-levels"); if (al) al.onclick = adminLevels;
    const as = $("#adm-school"); if (as) as.onclick = schoolSummary;
    $("#tl-curr").onclick = toolCurriculum;
    $("#tl-sessions").onclick = toolSessions;
    $("#tl-plans").onclick = toolPlans;
    $("#tl-calc").onclick = toolCalc;
    $("#tl-sheets").onclick = toolSheets;
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

  /* ═══ أدوات المعلم (بديل الإكسل) ═══ */
  let curEdit = false;
  async function toolCurriculum() {
    const grades = [...new Set(myClasses().map(c => c.gc))].sort(), sc = subjCode(TE.subject);
    openSheet(`<h4>📚 مناهجي — ${esc(TE.subject)}</h4>
      <div style="display:flex;gap:8px;margin-bottom:8px"><button class="btn-soft" id="cur-edit">✏️ تعديل التوزيع</button><button class="btn-plain" style="flex:0 0 auto;padding:9px 14px" onclick="print()">🖨️ طباعة</button></div>
      <div id="cur-body"><div class="empty-note">جارِ التحميل…</div></div>
      <div class="sheet-actions"><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, async (o) => {
      async function build() {
        let html = "";
        for (const g of grades) {
          const code = sc + g + TERM, rows = await loadCurr(code);
          if (!rows.length) continue;
          const idxRows = rows.map((r, idx) => ({ r, idx })).sort((a, b) => a.r.w - b.r.w);
          html += `<div style="font-weight:800;color:var(--navy);margin:10px 0 4px">الصف ${GNAME[g]}</div><div class="table-scroll"><table class="report-table"><tr><th>أ</th><th style="min-width:90px">الوحدة</th><th style="min-width:120px">الدرس</th><th>${curEdit ? "" : "تفاعلي"}</th></tr>` +
            idxRows.map(({ r, idx }) => curEdit
              ? `<tr><td>${r.w}</td><td><input class="gr-in cur-in" style="width:88px" data-code="${code}" data-idx="${idx}" data-f="unit" value="${esc(r.unit || "")}"></td><td><input class="gr-in cur-in" style="width:120px" data-code="${code}" data-idx="${idx}" data-f="lesson" value="${esc(r.lesson || "")}"></td><td></td></tr>`
              : `<tr><td>${r.w}</td><td class="nm">${esc(r.unit || "")}</td><td class="nm">${esc(r.lesson || "")}</td><td>${String(r.lesson || "").includes("إجازة") ? "—" : `<a href="${lessonURL(code, r.w)}" target="_blank" rel="noopener" style="color:var(--gold);font-weight:800">🚀</a>`}</td></tr>`).join("") + `</table></div>`;
        }
        const b = o.querySelector("#cur-body"); if (!b) return;
        b.innerHTML = html || '<div class="empty-note">لا مناهج مسندة</div>';
        if (curEdit) b.querySelectorAll(".cur-in").forEach(inp => inp.onchange = () => {
          const patch = {}; patch[inp.dataset.f] = inp.value.trim();
          saveCurrEdit(inp.dataset.code, +inp.dataset.idx, patch);
          inp.style.borderColor = "var(--ok)";
        });
      }
      o.querySelector("#cur-edit").onclick = (e) => {
        curEdit = !curEdit;
        e.target.textContent = curEdit ? "✅ تم — عرض" : "✏️ تعديل التوزيع";
        e.target.style.background = curEdit ? "#dff0df" : "";
        build();
      };
      build();
    });
  }
  function toolSessions() {
    const rows = D.schedule.filter(r => r.t === TE.name);
    const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"];
    let html = `<div class="table-scroll"><table class="report-table"><tr><th>اليوم</th>${[1, 2, 3, 4, 5, 6, 7].map(p => `<th>ح${p}</th>`).join("")}</tr>`;
    days.forEach(d => { html += `<tr><td class="nm">${d}</td>` + [1, 2, 3, 4, 5, 6, 7].map(p => { const s = rows.find(x => x.d === d && x.p === p); return `<td>${s ? esc(classById(s.c).name) : ""}</td>`; }).join("") + `</tr>`; });
    html += `</table></div>`;
    openSheet(`<h4>🗓️ سجل الحصص — ${rows.length} حصة أسبوعياً</h4><div class="rep-head"><div class="rt">جدول حصص ${esc(TE.name)}</div><div class="rs">${esc(META.school.name)} — ${esc(TE.subject)}</div></div>${html}<div class="sheet-actions"><button class="btn-plain" onclick="print()">🖨️ طباعة</button><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`);
  }
  function planText(t) {
    const tips = [];
    if (t.st[1] > 1) tips.push("متابعة الغياب والتواصل مع ولي الأمر");
    if (t.hwN > 0) tips.push("متابعة إنجاز الواجبات وتقديم دعم إضافي");
    if (t.behN > 0) tips.push("تعزيز السلوك الإيجابي والتحفيز");
    if (!tips.length) tips.push("تحفيز على المشاركة وحصص دعم قصيرة");
    return tips.join("، ") + ".";
  }
  function toolPlans() {
    const cls = myClasses(); let cid = cls[0].id;
    function render(o) {
      const rows = classCalc(cid);
      const rem = rows.filter(r => r.t.pts < 0 || r.t.st[1] > 1 || r.t.hwN > 0).sort((a, b) => a.t.pts - b.t.pts);
      const enr = rows.filter(r => r.t.pts >= 5 && r.t.st[1] === 0).sort((a, b) => b.t.pts - a.t.pts).slice(0, 8);
      const body = o.querySelector("#pl-body");
      body.innerHTML = `<div style="font-weight:800;color:var(--bad);margin:10px 0 6px">🩺 خطة علاجية (${rem.length})</div>
        ${rem.length ? rem.map(r => `<div class="comm-item"><b>${esc(r.s.n)}</b> — نقاط ${r.t.pts}${r.t.st[1] ? `، غياب ${r.t.st[1]}` : ""}${r.t.hwN ? `، واجبات ناقصة ${r.t.hwN}` : ""}<div class="meta">التوصية: ${planText(r.t)}</div></div>`).join("") : '<div class="empty-note" style="padding:12px">لا طلاب بحاجة لخطة علاجية 🎉</div>'}
        <div style="font-weight:800;color:var(--ok);margin:14px 0 6px">🌟 خطة إثرائية (${enr.length})</div>
        ${enr.length ? enr.map(r => `<div class="comm-item"><b>${esc(r.s.n)}</b> — نقاط ${r.t.pts}<div class="meta">التوصية: تكليفه بمهام قيادية وإثرائية (بحث / مشروع / مساعدة زملائه) لتعزيز تميّزه.</div></div>`).join("") : '<div class="empty-note" style="padding:12px">ابدأ الرصد لتظهر أسماء المتميزين</div>'}`;
    }
    openSheet(`<h4>🩺 الخطط العلاجية والإثرائية</h4><div class="class-chips" id="pl-chips">${cls.map((x, k) => `<button class="chip ${k === 0 ? "on" : ""}" data-c="${x.id}">${esc(x.name)}</button>`).join("")}</div><div id="pl-body"></div><div class="sheet-actions"><button class="btn-plain" onclick="print()">🖨️ طباعة</button><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, (o) => {
      o.querySelectorAll("#pl-chips .chip").forEach(ch => ch.onclick = () => { cid = ch.dataset.c; o.querySelectorAll("#pl-chips .chip").forEach(x => x.classList.toggle("on", x === ch)); render(o); });
      render(o);
    });
  }
  function toolCalc() {
    openSheet(`<h4>🧮 حاسبة درجة المهمة الأدائية</h4><div style="font-size:13px;color:var(--muted);margin-bottom:8px">أدخل درجة كل معيار ودرجته العظمى، فيُحسب المجموع والنسبة والتقدير تلقائياً.</div><div id="calc-rows"></div><button class="btn-soft" id="calc-add" style="margin:8px 0">+ إضافة معيار</button><div class="ana-grid"><div class="ana"><div class="v" id="calc-tot">0</div><div class="l">المجموع</div></div><div class="ana"><div class="v" id="calc-pct">0%</div><div class="l">النسبة</div></div></div><div style="text-align:center;margin-top:6px" id="calc-lvl"></div><div class="sheet-actions"><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, (o) => {
      const rowsBox = o.querySelector("#calc-rows");
      function calc() {
        let sum = 0, max = 0;
        o.querySelectorAll("#calc-rows>div").forEach(r => { sum += +r.querySelector(".cscore").value || 0; max += +r.querySelector(".cmax").value || 0; });
        const pct = max ? Math.round(sum / max * 100) : 0, lv = levelOf(pct);
        o.querySelector("#calc-tot").textContent = (Math.round(sum * 10) / 10) + (max ? " / " + max : "");
        o.querySelector("#calc-pct").textContent = pct + "%";
        o.querySelector("#calc-lvl").innerHTML = max ? `<span class="lvl lvl${lv.i}">${lv.t}</span>` : "";
      }
      function addRow(name) {
        rowsBox.insertAdjacentHTML("beforeend", `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px"><input class="search-box" style="flex:2;margin:0" placeholder="اسم المعيار" value="${esc(name || "")}"><input class="cscore search-box" style="flex:1;margin:0" inputmode="numeric" placeholder="الدرجة"><span style="color:var(--muted)">/</span><input class="cmax search-box" style="flex:1;margin:0" inputmode="numeric" placeholder="من"></div>`);
        o.querySelectorAll(".cscore,.cmax").forEach(inp => inp.oninput = calc);
      }
      ["الأداء والإتقان", "التعاون والمشاركة", "الالتزام بالوقت"].forEach(addRow);
      o.querySelector("#calc-add").onclick = () => addRow("");
    });
  }
  async function toolSheets() {
    const grades = [...new Set(myClasses().map(c => c.gc))].sort(), sc = subjCode(TE.subject), wk = curWeek();
    openSheet(`<h4>📝 بنك أوراق العمل</h4><div style="font-size:13px;color:var(--muted);margin-bottom:8px">لكل درس: ورقة عمل جاهزة للطباعة + بحث عن أنشطة تفاعلية.</div><div id="sh-body"><div class="empty-note">جارِ التحميل…</div></div><div class="sheet-actions"><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, async (o) => {
      let html = "";
      for (const g of grades) {
        const code = sc + g + TERM, rows = (await loadCurr(code)).filter(r => r.w >= wk - 1 && r.w <= wk + 2 && r.lesson && !String(r.lesson).includes("إجازة"));
        if (!rows.length) continue;
        html += `<div style="font-weight:800;color:var(--navy);margin:8px 0 4px">الصف ${GNAME[g]}</div>`;
        rows.sort((a, b) => a.w - b.w).forEach(r => {
          const q = encodeURIComponent(r.lesson + " " + TE.subject);
          html += `<div class="comm-item"><b>أسبوع ${r.w}: ${esc(r.lesson)}</b><div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><button class="btn-soft" data-ws="${esc(r.lesson)}" data-code="${code}" data-wk="${r.w}">🖨️ ورقة عمل</button><a class="btn-soft" style="text-decoration:none" href="https://wordwall.net/ar/community?query=${q}" target="_blank" rel="noopener">🎮 أنشطة</a></div></div>`;
        });
      }
      const body = o.querySelector("#sh-body"); if (!body) return;
      body.innerHTML = html || '<div class="empty-note">لا دروس متاحة حول هذا الأسبوع</div>';
      body.querySelectorAll("[data-ws]").forEach(b => b.onclick = async () => printWorksheet(b.dataset.ws, await lessonData(b.dataset.code, +b.dataset.wk)));
    });
  }
  function printWorksheet(lesson, d) {
    const qs = d && d.questions && d.questions.length ? d.questions : ((d && d.checks) || []);
    const hero = d && (d.story || []).find(s => s.img);
    const vocab = (d && d.vocab) || [];
    const head = `
      <div class="h"><div class="bar">${esc(META.school.name)}</div><div class="m">${esc(TE.subject)} — ${esc(hijriLabel())}</div></div>
      <div class="tt">ورقة عمل: ${esc(lesson)}</div>
      <p>اسم الطالب: ............................................ الفصل: ............ التاريخ: ............</p>`;
    if (!qs.length) {
      printDoc("ورقة عمل — " + lesson, head + `
      <p><b>السؤال الأول:</b> اكتب أهم ما تعلّمته عن (${esc(lesson)}):</p><p>....................................................................................................................</p><p>....................................................................................................................</p>
      <p><b>السؤال الثاني:</b> أكمل الفراغات المناسبة:</p><p>....................................................................................................................</p>
      <p><b>السؤال الثالث:</b> ارسم أو مثّل ما فهمته:</p><div style="border:1px dashed #aaa;height:150px;border-radius:8px"></div>
      <div class="sig"><span>المعلم: ${esc(TE.name)}</span><span>الدرجة: ......</span></div>`);
      return;
    }
    const L = ["أ", "ب", "ج", "د"];
    const qHtml = qs.map((q, n) => {
      if (q.t === "fill") return `<p><b>${n + 1}.</b> ${esc(q.q)}</p>`;
      return `<p><b>${n + 1}.</b> ${esc(q.q)}</p><p style="padding-inline-start:18px">${(q.opts || []).map((o, k) => o ? `☐ ${q.t === "tf" ? "" : L[k] + ") "}${esc(o)}` : "").filter(Boolean).join(" &nbsp;&nbsp;&nbsp; ")}</p>`;
    }).join("");
    const shuf = vocab.map((v, i) => ({ i, d: v.d })).sort(() => Math.random() - .5);
    const vHtml = vocab.length ? `<p><b>ثانياً — صِل كل مصطلح بتعريفه:</b></p><table style="width:100%;border-collapse:collapse"><tr><td style="width:35%;vertical-align:top">${vocab.map((v, i) => `<div style="padding:5px 0">${i + 1}. ${esc(v.t)} ○</div>`).join("")}</td><td style="vertical-align:top">${shuf.map(x => `<div style="padding:5px 0">○ ${esc(x.d)}</div>`).join("")}</td></tr></table>` : "";
    const key = qs.map((q, n) => `${n + 1}: ${q.t === "fill" ? esc(q.ans || "—") : (q.t === "tf" ? esc(q.opts[q.correct]) : L[q.correct])}`).join(" · ") + (vocab.length ? " · المطابقة: " + vocab.map((v, i) => `${i + 1}←${shuf.findIndex(x => x.i === i) + 1}`).join(" ") : "");
    const objHtml = d.objectives && d.objectives.length ? `<div style="border:1px solid #ccc;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:13px"><b>🎯 أهداف الدرس:</b> ${d.objectives.map(esc).join(" — ")}</div>` : "";
    printDoc("ورقة عمل — " + lesson, head +
      (hero ? `<div style="text-align:center;margin:6px 0 10px"><img src="${hero.img}" style="max-height:150px;max-width:70%;border-radius:10px;border:1px solid #ccc"></div>` : "") +
      objHtml + `<p><b>أولاً — أجب عن الأسئلة التالية:</b></p>` + qHtml + vHtml +
      `<p style="margin-top:14px"><b>ثالثاً —</b> اكتب بأسلوبك أهم ما تعلّمته في هذا الدرس:</p><p>....................................................................................................................</p>
      <div class="sig"><span>المعلم: ${esc(TE.name)}</span><span>الدرجة: ......</span></div>
      <div style="font-size:9px;color:#888;margin-top:8px;transform:rotate(180deg)">مفتاح الإجابة (للمعلم): ${key}</div>`);
  }

  /* ═══════════ وضع الحصة الحية (العرض) ═══════════ */
  const behIndex = (sub, positive) => {
    let k = BEH.findIndex(b => b.name.includes(sub));
    if (k < 0) k = BEH.findIndex(b => positive ? (+b.pts > 0) : (+b.pts < 0));
    return k;
  };
  let liveCid = null, livePrevTop = null, liveDate = null;
  let liveTurns = { done: new Set(), cur: null };   // من شارك في هذه الحصة (لضمان مشاركة الجميع)
  function pickClassThen(cb) {
    const cls = myClasses();
    if (!cls.length) { alert("لا فصول مسندة"); return; }
    if (cls.length === 1) { cb(cls[0].id); return; }
    openSheet(`<h4>اختر الفصل</h4><div class="stategrid">${cls.map(c => `<button style="background:var(--navy)" data-c="${c.id}">${esc(c.name)}</button>`).join("")}</div>`,
      (o) => o.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { closeSheet(); cb(b.dataset.c); }));
  }
  function liveSession(cid, initialView) {
    liveCid = cid; liveDate = new Date().toISOString().slice(0, 10); livePrevTop = null; liveTurns = { done: new Set(), cur: null };
    const c = classById(cid);
    $("#view-app").classList.add("hidden");
    const V = $("#view-live"); V.classList.remove("hidden");
    V.innerHTML = `
      <div class="live-top">
        <button class="live-btn" id="live-exit">✕ إنهاء</button>
        <div class="live-title">🎬 ${esc(c.name)} <small id="live-sub"></small></div>
        <div style="display:flex;gap:6px">
          <button class="live-btn" id="live-tools-t" title="إخفاء/إظهار الأدوات">🎛️ إخفاء الأدوات</button>
          <button class="live-btn" id="live-board-t" title="إخفاء/إظهار لوحة الشرف">🏆 إخفاء اللوحة</button>
          <button class="live-btn" id="live-fs">⛶ ملء الشاشة</button>
        </div>
      </div>
      <div class="live-wrap">
        <div class="live-center">
          <div class="live-tools">
            <button data-v="roster" class="on">👥 الطلاب</button>
            <button data-v="wheel">🎡 العجلة</button>
            <button data-v="quiz">❓ سؤال</button>
            <button data-v="iws">📝 ورقة تفاعلية</button>
            <button data-v="timer">⏱️ مؤقّت</button>
            <button data-v="lesson">▶️ الدرس</button>
            <button data-v="story">🎬 قصة الدرس</button>
            <button data-v="games">🎮 ألعاب</button>
            <button data-v="yt">📺 يوتيوب</button>
          </div>
          <div class="live-main" id="live-main"></div>
        </div>
        <div class="live-board" id="live-board"></div>
      </div>`;
    $("#live-exit").onclick = () => { if (timerIv) { clearInterval(timerIv); timerIv = null; } stopStory(); stopGame(); try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { } V.classList.add("hidden"); $("#view-app").classList.remove("hidden"); renderReg(); renderToday(); renderGrades(); };
    $("#live-fs").onclick = () => {
      const d = document, el = V;
      const isFS = d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement;
      try {
        if (isFS) { (d.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen).call(d); }
        else { const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen; const p = req && req.call(el); if (p && p.catch) p.catch(() => { try { (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement); } catch (e) { } }); }
      } catch (e) { try { (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement); } catch (e2) { } }
      setTimeout(() => { const on = document.fullscreenElement || document.webkitFullscreenElement; const b = $("#live-fs"); if (b) b.innerHTML = on ? "⛶ إنهاء الملء" : "⛶ ملء الشاشة"; }, 350);
    };
    $("#live-board-t").onclick = () => { const h = V.classList.toggle("board-hidden"); $("#live-board-t").classList.toggle("off", h); $("#live-board-t").innerHTML = h ? "🏆 إظهار اللوحة" : "🏆 إخفاء اللوحة"; };
    $("#live-tools-t").onclick = () => { const h = V.classList.toggle("tools-hidden"); $("#live-tools-t").classList.toggle("off", h); $("#live-tools-t").innerHTML = h ? "🎛️ إظهار الأدوات" : "🎛️ إخفاء الأدوات"; };
    V.querySelectorAll(".live-tools button").forEach(b => b.onclick = () => {
      V.querySelectorAll(".live-tools button").forEach(x => x.classList.toggle("on", x === b));
      liveView(b.dataset.v);
    });
    (async () => {
      const sc = subjCode(TE.subject), wk = curWeek();
      let les = "";
      if (sc) { const rows = (await loadCurr(sc + c.gc + TERM)).filter(r => r.w === wk); const m = rows.find(r => r.lesson && !String(r.lesson).includes("تابع")) || rows[0]; les = m ? m.lesson : ""; }
      const sub = $("#live-sub"); if (sub) sub.textContent = "· الأسبوع " + wk + (les ? " · " + les : "");
    })();
    const startView = initialView || "roster";
    const tb = V.querySelector('.live-tools button[data-v="' + startView + '"]');
    if (tb) { V.querySelectorAll(".live-tools button").forEach(x => x.classList.toggle("on", x === tb)); }
    liveView(startView); drawLiveBoard(true);
  }
  let liveMainView = "roster";
  async function liveView(v) {
    liveMainView = v;
    if (timerIv) { clearInterval(timerIv); timerIv = null; }
    stopStory(); stopGame();
    const box = $("#live-main"); if (!box) return;
    const c = classById(liveCid), sc = subjCode(TE.subject), wk = curWeek(), code = sc + c.gc + TERM;
    if (v === "roster") { drawLiveRoster(); return; }
    if (v === "lesson") {
      box.innerHTML = `<div class="empty-note" style="color:#c9d5e3">جارِ تحميل الدرس…</div>`;
      const rows = (await loadCurr(code)).filter(r => r.w === wk);
      const m = rows.find(r => r.lesson && !String(r.lesson).includes("تابع")) || rows[0];
      if (!sc || !m || String(m.lesson).includes("إجازة")) { box.innerHTML = `<div class="empty-note" style="color:#c9d5e3">لا درس متاح لهذا الأسبوع</div>`; return; }
      let data = null;
      try { const r = await fetch("data/lessons/" + code + "w" + wk + ".json"); if (r.ok) data = await r.json(); } catch (e) { }
      if (data) renderRichLesson(box, data);
      else box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">▶️ ${esc(m.lesson)}</span></div><div class="rl-scroll"><div class="rl-wrap"><div class="rl-title">${esc(m.lesson)}</div><div style="color:#c9d5e3;text-align:center;margin-top:20px">درس هذا الأسبوع من وحدة «${esc(m.unit || "")}».<br>الدرس التفاعلي الغني لهذا الدرس قيد الإعداد — استخدم «سؤال» و«ورقة تفاعلية» و«العجلة» لتفعيل الحصة.</div></div></div></div>`;
      return;
    }
    if (v === "yt") { stageYouTube(box, code, wk, c); return; }
    if (v === "story") { stageStory(box, code, wk); return; }
    if (v === "wheel") { stageWheel(box, c); return; }
    if (v === "quiz") { stageQuiz(box, code, wk); return; }
    if (v === "iws") { stageWorksheet(box, code, wk); return; }
    if (v === "timer") { stageTimer(box); return; }
    if (v === "games") { stageGames(box, code, wk, c); return; }
  }
  // ▶️ درس تفاعلي غنيّ (محتوانا الخاص)
  function renderRichLesson(box, d) {
    const secs = (d.sections || []).map((s, n) => `
      <div class="rl-sec">
        <div class="rl-h"><span class="rl-n">${n + 1}</span>${esc(s.h || "")}</div>
        ${s.body ? `<div class="rl-body">${esc(s.body)}</div>` : ""}
        ${s.points ? `<ul class="rl-points">${s.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        ${s.tip ? `<div class="rl-tip">💡 ${esc(s.tip)}</div>` : ""}
      </div>`).join("");
    const vocab = (d.vocab && d.vocab.length) ? `<div class="rl-sec"><div class="rl-h"><span class="rl-n">📖</span>مصطلحات الدرس</div><div class="rl-vocab">${d.vocab.map(v => `<div class="rl-term"><b>${esc(v.t)}</b><span>${esc(v.d)}</span></div>`).join("")}</div></div>` : "";
    const checks = (d.checks && d.checks.length) ? `<div class="rl-sec"><div class="rl-h"><span class="rl-n">✅</span>تحقّق من فهمك</div><div id="rl-checks"></div></div>` : "";
    box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">▶️ ${esc(d.title || "")}</span><span style="color:#c9d5e3;font-size:13px;margin-inline-start:auto">${esc(d.unit || "")}</span></div>
      <div class="rl-scroll"><div class="rl-wrap">
        <div class="rl-title">${esc(d.title || "")}</div>
        ${(d.story || []).some(s => s.img) ? `<img class="rl-hero" src="${(d.story || []).find(s => s.img).img}" alt="">` : ""}
        ${d.objectives && d.objectives.length ? `<div class="rl-obj"><div class="rl-obj-h">🎯 أهداف الدرس</div><ul>${d.objectives.map(o => `<li>${esc(o)}</li>`).join("")}</ul></div>` : ""}
        ${d.intro ? `<div class="rl-intro">${esc(d.intro)}</div>` : ""}
        ${secs}${vocab}${checks}
        ${d.activity ? `<div class="rl-sec rl-act"><div class="rl-h"><span class="rl-n">✏️</span>نشاط تطبيقي</div><div class="rl-body">${esc(d.activity)}</div></div>` : ""}
        ${d.summary ? `<div class="rl-summary">🧾 ${esc(d.summary)}</div>` : ""}
      </div></div></div>`;
    // أسئلة التحقق التفاعلية
    if (d.checks && d.checks.length) {
      const cbox = box.querySelector("#rl-checks");
      cbox.innerHTML = d.checks.map((q, qi) => `<div style="margin-bottom:18px"><div class="rl-q">${qi + 1}. ${esc(q.q)}</div><div class="qz-grid">${q.opts.map((o, k) => `<button class="qz-opt-card" data-q="${qi}" data-k="${k}">${["أ", "ب", "ج", "د"][k]}. ${esc(o)}</button>`).join("")}</div></div>`).join("");
      cbox.querySelectorAll(".qz-opt-card").forEach(b => b.onclick = () => {
        const q = d.checks[+b.dataset.q], ok = +b.dataset.k === q.correct;
        b.classList.add(ok ? "ok" : "no");
        if (ok) confetti();
      });
    }
  }
  // 📺 يوتيوب: فيديو/قائمة درس الحصة مضمّناً في الوسط (لوحة الشرف تبقى ثابتة) — يُحفظ الرابط للدرس تلقائياً
  const ytId = (u) => { const m = String(u || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || (String(u).length === 11 ? [0, u] : null); return m ? m[1] : ""; };
  function ytEmbedSrc(url) {
    const vid = ytId(url); const lm = String(url).match(/[?&]list=([\w-]+)/); const list = lm ? lm[1] : "";
    if (vid && list) return "https://www.youtube.com/embed/" + vid + "?rel=0&modestbranding=1&list=" + list;
    if (vid) return "https://www.youtube.com/embed/" + vid + "?rel=0&modestbranding=1";
    if (list) return "https://www.youtube.com/embed/videoseries?list=" + list;
    return "";
  }
  async function stageYouTube(box, code, wk, c) {
    const key = code + "w" + wk;
    let d = null;
    try { const r = await fetch("data/lessons/" + code + "w" + wk + ".json"); if (r.ok) d = await r.json(); } catch (e) { }
    let les = d && d.title ? d.title : "";
    if (!les) { try { const rows = (await loadCurr(code)).filter(r => r.w === wk); const m = rows.find(x => x.lesson && !String(x.lesson).includes("تابع")) || rows[0]; les = m ? m.lesson : ""; } catch (e) { } }
    // رابط محفوظ سابقاً لهذا الدرس (سحابي مشترك، أو محلي)
    let saved = "";
    if (d && d.yt) saved = Array.isArray(d.yt) ? d.yt[0] : d.yt;
    if (!saved) { try { if (CLOUD && fdb) { const s = await fdb.doc("lessonyt/" + key).get(); if (s.exists) saved = (s.data() || {}).url || ""; } else { saved = localStorage.getItem("yt:" + key) || ""; } } catch (e) { } }
    const q = encodeURIComponent((les ? les + " " : "") + TE.subject + " " + GNAME[c.gc] + " ابتدائي شرح");
    const frame = (src) => `<iframe id="yt-frame" src="${src}" allow="autoplay; fullscreen" allowfullscreen style="flex:1;width:100%;border:0"></iframe>`;
    const placeholder = `<div id="yt-frame" style="flex:1;display:flex;align-items:center;justify-content:center;color:#c9d5e3;text-align:center;padding:20px">اضغط «🔎 بحث» لإيجاد شرح «${esc(les)}» في يوتيوب، ثم الصق رابط الفيديو هنا — وسيُحفظ للدرس ويظهر تلقائياً في كل مرة.</div>`;
    const src0 = saved ? ytEmbedSrc(saved) : "";
    box.innerHTML = `<div class="live-stage">
      <div class="stage-bar">
        <span style="color:#fff;font-weight:800">📺 ${esc(les || "فيديو الدرس")}</span>
        <input id="yt-url" placeholder="الصق رابط فيديو أو قائمة…" style="margin-inline-start:auto" value="${esc(saved || "")}">
        <button class="live-btn" id="yt-go">عرض</button>
        <a class="live-btn" style="text-decoration:none" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">🔎 بحث</a>
      </div>
      ${src0 ? frame(src0) : placeholder}
    </div>`;
    const show = () => {
      const url = box.querySelector("#yt-url").value.trim();
      const src = ytEmbedSrc(url);
      const fr = box.querySelector("#yt-frame");
      if (!src) { if (fr) fr.textContent = "رابط غير صحيح — انسخ رابط الفيديو من يوتيوب"; return; }
      if (fr) fr.outerHTML = frame(src);
      // احفظ الرابط للدرس (يظهر تلقائياً لك ولزملائك لاحقاً)
      try { localStorage.setItem("yt:" + key, url); } catch (e) { }
      try { if (CLOUD && fdb) fdb.doc("lessonyt/" + key).set({ url: url, tn: TE.name, ts: Date.now() }, { merge: true }); } catch (e) { }
    };
    box.querySelector("#yt-go").onclick = show;
    box.querySelector("#yt-url").addEventListener("keydown", (e) => { if (e.key === "Enter") show(); });
  }
  // 🎬 قصة الدرس (عرض مرئي متحرّك + سرد صوتي سعودي — صوت عصبي مُسجّل مسبقاً، ويعود لصوت المتصفح عند غيابه)
  let storyTimer = null, storyActive = false, storyAudio = null;
  function haltNarr() {
    if (storyTimer) { clearTimeout(storyTimer); storyTimer = null; }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { }
    if (storyAudio) { try { storyAudio.pause(); storyAudio.onended = null; storyAudio.onerror = null; } catch (e) { } }
  }
  function stopStory() { storyActive = false; haltNarr(); }
  function buildStory(d) {
    if (d.story && d.story.length) return d.story;
    const s = [{ v: "📘", t: d.title || "درسنا اليوم" }];
    if (d.intro) s.push({ v: "💡", t: d.intro });
    (d.sections || []).forEach(sec => {
      s.push({ v: sec.v || "📌", t: sec.h + (sec.body ? "؛ " + sec.body : "") });
      if (sec.points && sec.points.length) s.push({ v: "✨", t: sec.points.join(" ، ") });
    });
    if (d.summary) s.push({ v: "🌟", t: d.summary });
    return s;
  }
  const STORY_RATE = 1.12;
  function arVoice() {
    try {
      const vs = window.speechSynthesis.getVoices() || [];
      const ar = vs.filter(v => (v.lang || "").toLowerCase().startsWith("ar"));
      if (!ar.length) return null;
      const score = (v) => {
        const n = ((v.name || "") + " " + (v.lang || "")).toLowerCase(); let s = 0;
        if (/ar-sa/.test((v.lang || "").toLowerCase())) s += 6;              // السعودية أولاً
        if (/hamed|naayf|zariyah|salma|saudi|السعود|العربية/.test(n)) s += 4; // أصوات سعودية معروفة
        if (/ar-xa|gulf|خليج|zeina|hala/.test(n)) s += 2;                    // خليجي
        if (/online|natural|neural/.test(n)) s += 5;                         // الأصوات الطبيعية (Edge) أنقى وأقرب للبشر
        return s;
      };
      return ar.slice().sort((a, b) => score(b) - score(a))[0];
    } catch (e) { return null; }
  }
  const fmtT = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  async function stageStory(box, code, wk) {
    let d = null;
    try { const r = await fetch("data/lessons/" + code + "w" + wk + ".json"); if (r.ok) d = await r.json(); } catch (e) { }
    if (!d) { box.innerHTML = `<div class="empty-note" style="color:#c9d5e3">قصة هذا الدرس قيد الإعداد</div>`; return; }
    const scenes = buildStory(d);
    storyActive = true;
    // مقطع صوتي واحد متواصل لهذا الدرس؟
    const url = "data/lessons/audio/" + code + "w" + wk + ".mp3";
    let hasAudio = false;
    try { const h = await fetch(url, { method: "HEAD" }); hasAudio = h.ok; } catch (e) { }
    if (!storyAudio) { storyAudio = new Audio(); }
    storyAudio.preload = "auto";
    box.innerHTML = `<div class="live-stage">
      <div class="stage-bar"><span style="color:#fff;font-weight:800">🎬 قصة الدرس: ${esc(d.title || "")}</span><span id="st-vhint" style="color:#9fb0c4;font-size:12px;margin-inline-start:auto"></span></div>
      <div class="story" id="story-stage">
        <div class="story-visual" id="story-v">🎬</div>
        <div class="story-text" id="story-t">اضغط ▶️ لتشغيل القصة</div>
        <div class="story-player">
          <div class="story-seek" id="st-seek"><div class="story-seek-fill" id="st-fill"></div></div>
          <div class="story-ctrl">
            <span class="story-time" id="st-time" dir="ltr">0:00 / 0:00</span>
            <button class="btn-primary" id="st-play" style="min-width:130px">▶️ تشغيل</button>
          </div>
        </div>
      </div></div>`;
    const vEl = box.querySelector("#story-v"), tEl = box.querySelector("#story-t");
    const fillEl = box.querySelector("#st-fill"), timeEl = box.querySelector("#st-time"), playBtn = box.querySelector("#st-play");
    // حدود المشاهد بحسب طول النص (لمزامنة الصورة مع الصوت الواحد)
    const lens = scenes.map(s => Math.max(6, (s.t || "").length));
    const totalLen = lens.reduce((a, b) => a + b, 0);
    const bounds = []; let acc = 0; for (const l of lens) { bounds.push(acc / totalLen); acc += l; } bounds.push(1);
    let curScene = -1;
    function showScene(i) {
      if (i === curScene) return; curScene = i; const sc = scenes[i]; if (!sc) return;
      if (sc.img) vEl.innerHTML = `<img class="story-img" src="${sc.img}" alt="" onerror="this.parentNode.textContent='${sc.v || "📘"}'">`;
      else vEl.textContent = sc.v || "📘";
      vEl.style.animation = "none"; void vEl.offsetWidth; vEl.style.animation = "";
      tEl.textContent = sc.t; tEl.style.animation = "none"; void tEl.offsetWidth; tEl.style.animation = "";
    }
    function sceneAt(frac) { for (let i = 0; i < scenes.length; i++) { if (frac >= bounds[i] && frac < bounds[i + 1]) return i; } return scenes.length - 1; }

    // الصور الحقيقية من Pixabay — إظهار المصدر شرط الاستخدام المجاني
    if (scenes.some(s => s.img)) { const vh = box.querySelector("#st-vhint"); if (vh) vh.textContent = "الصور: Pixabay"; }
    if (hasAudio) {
      storyAudio.src = url;
      const sync = () => {
        const dur = storyAudio.duration || 0, cur = storyAudio.currentTime || 0;
        const frac = dur ? cur / dur : 0;
        showScene(sceneAt(frac));
        fillEl.style.width = (frac * 100) + "%";
        timeEl.textContent = fmtT(cur) + " / " + fmtT(dur);
      };
      storyAudio.ontimeupdate = sync;
      storyAudio.onloadedmetadata = sync;
      storyAudio.onplay = () => { playBtn.textContent = "⏸ إيقاف"; };
      storyAudio.onpause = () => { playBtn.textContent = "▶️ تشغيل"; };
      storyAudio.onended = () => { playBtn.textContent = "↺ إعادة"; confetti(); };
      playBtn.onclick = () => { if (storyAudio.paused) { if (storyAudio.ended) storyAudio.currentTime = 0; storyAudio.play().catch(() => { }); } else storyAudio.pause(); };
      box.querySelector("#st-seek").onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); const p = (e.clientX - r.left) / r.width; if (storyAudio.duration) storyAudio.currentTime = Math.min(1, Math.max(0, p)) * storyAudio.duration; };
      showScene(0);
    } else {
      // احتياط: قراءة القصة كاملة بصوت المتصفح كمقطع واحد متصل (بلا توقف بين الجمل)
      box.querySelector("#st-seek").style.display = "none";
      const fullText = scenes.map(s => s.t).join(" ");
      let playing = false;
      const vhint = box.querySelector("#st-vhint");
      const v = arVoice();
      vhint.textContent = v ? ((/online|natural/i.test(v.name || "") ? "🎙️ صوت طبيعي" : "الصوت: " + v.name)) : "لأنقى صوت افتح في Edge";
      const speakAll = () => {
        try { window.speechSynthesis.cancel(); } catch (e) { }
        const u = new SpeechSynthesisUtterance(fullText);
        u.lang = "ar-SA"; if (v) u.voice = v; u.rate = 1.0; u.pitch = 1;
        // مزامنة الصورة عبر onboundary إن توفّر
        u.onboundary = (ev) => { const frac = fullText.length ? (ev.charIndex || 0) / fullText.length : 0; showScene(sceneAt(frac)); fillEl.style.width = (frac * 100) + "%"; };
        u.onend = () => { playing = false; playBtn.textContent = "↺ إعادة"; fillEl.style.width = "100%"; confetti(); };
        try { window.speechSynthesis.speak(u); } catch (e) { }
      };
      playBtn.onclick = () => {
        if (!playing) { playing = true; playBtn.textContent = "⏸ إيقاف"; showScene(0); speakAll(); }
        else { playing = false; playBtn.textContent = "▶️ تشغيل"; try { window.speechSynthesis.cancel(); } catch (e) { } }
      };
      showScene(0);
    }
  }
  // 🎡 عجلة اختيار الطلاب
  function stageWheel(box, c) {
    box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">🎡 عجلة اختيار الطلاب</span>
      <label style="color:#c9d5e3;font-size:13px;margin-inline-start:auto"><input type="checkbox" id="wh-present" checked> الحاضرون فقط</label></div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px">
        <div id="wh-name" style="font-size:min(9vw,64px);font-weight:800;color:var(--goldl);text-align:center;min-height:1.2em;padding:0 12px">اضغط «أدر العجلة»</div>
        <button class="btn-primary" id="wh-spin" style="font-size:20px;max-width:280px">🎡 أدر العجلة</button>
        <div id="wh-act"></div>
      </div></div>`;
    const nameEl = box.querySelector("#wh-name");
    box.querySelector("#wh-spin").onclick = () => {
      const calc = classCalc(liveCid);
      let pool = c.students.map((s, i) => i);
      if (box.querySelector("#wh-present").checked) {
        const withPresence = pool.filter(i => { const day = (DB.recs[liveCid] || {})[liveDate]; return day && day[i] && day[i].a === 0; });
        if (withPresence.length) pool = withPresence;
      }
      // دورة مشاركة: استبعد من شارك في هذه الحصة حتى يشارك الجميع، ثم ابدأ دورة جديدة
      const fresh = pool.filter(i => !liveTurns.done.has(i));
      if (fresh.length) pool = fresh; else liveTurns.done.clear();
      box.querySelector("#wh-act").innerHTML = "";
      let ticks = 0, max = 22 + Math.floor(Math.random() * 10);
      const iv = setInterval(() => {
        const i = pool[Math.floor(Math.random() * pool.length)];
        nameEl.textContent = c.students[i].n;
        nameEl.style.transform = "scale(1.05)";
        ticks++;
        if (ticks >= max) {
          clearInterval(iv);
          const win = pool[Math.floor(Math.random() * pool.length)]; liveTurns.done.add(win); liveTurns.cur = win;
          nameEl.textContent = "🎉 " + c.students[win].n;
          nameEl.style.transform = "scale(1.15)";
          confetti();
          const pres = pool.length; const doneN = c.students.filter((s, i) => liveTurns.done.has(i)).length;
          box.querySelector("#wh-act").innerHTML = `<button class="btn-gold" id="wh-eval" style="font-size:16px">⭐ قيّم ${esc(c.students[win].n.split(" ")[0])}</button><div class="btip" style="margin-top:8px">شارك ${doneN} من ${c.students.length} — لن يتكرر اسم حتى يشارك الجميع</div>`;
          box.querySelector("#wh-eval").onclick = () => liveActions(win);
        }
      }, 70 + ticks * 4);
    };
  }
  // بنك أسئلة الدرس (من صلب محتوى الدرس)
  const lessonCache = {};
  async function lessonData(code, wk) {
    const key = code + "w" + wk;
    if (lessonCache[key] !== undefined) return lessonCache[key];
    let d = null; try { const r = await fetch("data/lessons/" + key + ".json"); if (r.ok) d = await r.json(); } catch (e) { }
    lessonCache[key] = d; return d;
  }
  // اختيار صورة من قصة الدرس تناسب نصاً (سؤال/عبارة) بتقاطع الكلمات
  const kwords = (t) => String(t || "").replace(/[^\u0600-\u06FF\w ]/g, " ").split(/\s+/).map(w => w.replace(/^(ال|لل|و|ب|ل|ف)/, "")).filter(w => w.length >= 3);
  function pickImg(d, text) {
    const scenes = ((d && d.story) || []).filter(sc => sc.img);
    if (!scenes.length) return "";
    const ws = kwords(text); let best = null, bs = 0;
    scenes.forEach(sc => { const sw = kwords(sc.t); const n = ws.filter(w => sw.some(x => x.includes(w) || w.includes(x))).length; if (n > bs) { bs = n; best = sc; } });
    return best ? best.img : "";
  }
  async function lessonQuestions(code, wk) {
    try {
      const d = await lessonData(code, wk); if (!d) return [];
      if (d.questions && d.questions.length) return d.questions.map(q => ({ t: q.t || "mcq", q: q.q, opts: q.opts || [], correct: q.correct || 0, ans: q.ans || "", img: pickImg(d, q.q) }));
      if (d.checks && d.checks.length) return d.checks.map(c => ({ t: "mcq", q: c.q, opts: c.opts, correct: c.correct, img: pickImg(d, c.q) }));
      return [];
    } catch (e) { return []; }
  }
  function qCardHTML(it) {
    if (it.t === "fill") return `<div id="q-area"><div style="font-size:22px;color:var(--goldl)" id="q-fill">✍️ اكتب أو ناقش الإجابة</div></div>`;
    return `<div id="q-area"><div class="qz-grid">${(it.opts || []).map((o, k) => o ? `<button class="qz-opt-card" data-k="${k}">${it.t === "tf" ? "" : (["أ", "ب", "ج", "د"][k] + ". ")}${esc(o)}</button>` : "").join("")}</div></div>`;
  }
  // ❓ سؤال تفاعلي — يحمّل بنك أسئلة الدرس تلقائياً
  let quizState = { q: "", opts: ["", "", "", ""], correct: 0 };
  async function stageQuiz(box, code, wk) {
    const bank = await lessonQuestions(code, wk);
    box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">❓ أسئلة الدرس</span>
      ${bank.length ? `<span style="color:#9fb0c4;font-size:12px;margin-inline-start:auto">${bank.length} سؤال من صلب الدرس</span>` : ""}
      <button class="live-btn" id="qz-edit" style="margin-inline-start:${bank.length ? "10px" : "auto"}">✏️ سؤال خاص</button></div>
      <div id="qz-body" style="flex:1;overflow:auto;padding:16px"></div></div>`;
    const body = box.querySelector("#qz-body");
    let bi = 0;
    function showBank() {
      const it = bank[bi];
      body.innerHTML = `<div style="max-width:780px;margin:0 auto;text-align:center;color:#fff">
        <div style="color:#9fb0c4;margin-bottom:8px">سؤال ${bi + 1} من ${bank.length}</div>
        ${it.img ? `<img class="q-img" src="${it.img}" alt="">` : ""}
        <div style="font-size:min(5vw,32px);font-weight:800;margin-bottom:22px">${esc(it.q)}</div>
        ${qCardHTML(it)}
        <div style="display:flex;gap:8px;justify-content:center;margin-top:22px;flex-wrap:wrap">
          ${bi > 0 ? `<button class="live-btn" id="qb-prev">◀ السابق</button>` : ""}
          <button class="btn-gold" id="qb-reveal">✅ الإجابة</button>
          ${bi < bank.length - 1 ? `<button class="btn-primary" id="qb-next">التالي ▶</button>` : ""}
        </div></div>`;
      const area = body.querySelector("#q-area");
      area.querySelectorAll(".qz-opt-card").forEach(b => b.onclick = () => { const ok = +b.dataset.k === it.correct; b.classList.add(ok ? "ok" : "no"); if (ok) confetti(); });
      body.querySelector("#qb-reveal").onclick = () => {
        if (it.t === "fill") { const f = body.querySelector("#q-fill"); if (f) { f.textContent = "✅ " + (it.ans || "—"); f.style.color = "#3ad07a"; } }
        else area.querySelectorAll(".qz-opt-card").forEach(b => b.classList.add(+b.dataset.k === it.correct ? "ok" : "no"));
        confetti();
      };
      const pv = body.querySelector("#qb-prev"); if (pv) pv.onclick = () => { bi--; showBank(); };
      const nx = body.querySelector("#qb-next"); if (nx) nx.onclick = () => { bi++; showBank(); };
    }
    function showEditor() {
      body.innerHTML = `<div style="max-width:640px;margin:0 auto;color:#fff">
        <label style="font-weight:800;color:var(--goldl)">نص السؤال</label>
        <textarea id="qz-q" class="stage-bar" style="width:100%;min-height:60px;color:#fff;margin:6px 0 12px">${esc(quizState.q)}</textarea>
        ${quizState.opts.map((o, k) => `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input type="radio" name="qzc" ${k === quizState.correct ? "checked" : ""} data-c="${k}" style="width:20px;height:20px"><input class="stage-bar qz-opt" data-k="${k}" style="flex:1;color:#fff" placeholder="الخيار ${k + 1}" value="${esc(o)}"></div>`).join("")}
        <button class="btn-primary" id="qz-show" style="margin-top:8px">▶️ اعرض السؤال</button>
        <div style="color:#9fb0c4;font-size:12px;margin-top:8px">علّم الدائرة بجانب الإجابة الصحيحة</div></div>`;
      body.querySelector("#qz-show").onclick = () => {
        quizState.q = body.querySelector("#qz-q").value.trim();
        body.querySelectorAll(".qz-opt").forEach(inp => quizState.opts[+inp.dataset.k] = inp.value.trim());
        const r = body.querySelector("input[name=qzc]:checked"); quizState.correct = r ? +r.dataset.c : 0;
        showQuestion();
      };
    }
    function showQuestion() {
      const opts = quizState.opts.map((o, k) => ({ o, k })).filter(x => x.o);
      body.innerHTML = `<div style="max-width:760px;margin:0 auto;text-align:center">
        <div style="font-size:min(5vw,34px);font-weight:800;color:#fff;margin:10px 0 24px">${esc(quizState.q || "—")}</div>
        <div class="qz-grid">${opts.map(x => `<button class="qz-opt-card" data-k="${x.k}">${["أ", "ب", "ج", "د"][x.k]}. ${esc(x.o)}</button>`).join("")}</div>
        <button class="btn-gold" id="qz-reveal" style="margin-top:22px;font-size:17px">✅ أظهر الإجابة</button></div>`;
      body.querySelector("#qz-reveal").onclick = () => {
        body.querySelectorAll(".qz-opt-card").forEach(b => { b.classList.add(+b.dataset.k === quizState.correct ? "ok" : "no"); });
        confetti();
      };
      body.querySelectorAll(".qz-opt-card").forEach(b => b.onclick = () => {
        const ok = +b.dataset.k === quizState.correct;
        b.classList.add(ok ? "ok" : "no");
        if (ok) confetti();
      });
    }
    box.querySelector("#qz-edit").onclick = showEditor;
    if (bank.length) showBank(); else showEditor();
  }
  // 📝 ورقة عمل تفاعلية (تُحمَّل من صلب الدرس تلقائياً)
  let wsItems = [], wsIdx = 0, wsLoadedFor = "";
  async function stageWorksheet(box, code, wk) {
    const key = code + "w" + wk;
    // حمّل أسئلة الدرس تلقائياً أول مرة (ما لم يبنِ المعلم ورقته الخاصة)
    if (wsLoadedFor !== key && (!wsItems.length || wsItems._auto)) {
      const bank = await lessonQuestions(code, wk);
      if (bank.length) { wsItems = bank.map(q => ({ t: q.t, q: q.q, opts: q.opts || [], correct: q.correct || 0, ans: q.ans || "", img: q.img || "" })); wsItems._auto = true; wsLoadedFor = key; wsIdx = 0; }
    }
    box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">📝 ورقة الدرس التفاعلية</span>
      <button class="live-btn" id="iws-print" style="margin-inline-start:auto">🖨️ طباعة</button>
      <button class="live-btn" id="iws-build">🛠️ بناء</button>
      ${wsItems.length ? `<button class="btn-primary" id="iws-present" style="padding:8px 14px">▶️ ابدأ العرض</button>` : ""}</div>
      <div id="iws-body" style="flex:1;overflow:auto;padding:16px"></div></div>`;
    const body = box.querySelector("#iws-body");
    function builder() {
      body.innerHTML = `<div style="max-width:680px;margin:0 auto;color:#fff">
        <div id="iws-list"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
          <button class="live-btn" data-add="mcq">➕ اختيار من متعدد</button>
          <button class="live-btn" data-add="tf">➕ صح / خطأ</button>
          <button class="live-btn" data-add="fill">➕ أكمل الفراغ</button>
        </div>
        ${wsItems.length ? `<button class="btn-primary" id="iws-start">▶️ ابدأ العرض (${wsItems.length} سؤال)</button>` : '<div style="color:#9fb0c4">أضف أسئلة لتكوين الورقة</div>'}</div>`;
      const list = body.querySelector("#iws-list");
      list.innerHTML = wsItems.map((it, n) => `<div class="comm-item" style="color:#fff;border-color:rgba(255,255,255,.15)"><b>${n + 1}. [${it.t === "mcq" ? "اختيار" : it.t === "tf" ? "صح/خطأ" : "أكمل"}]</b> ${esc(it.q || "(بلا نص)")} <button class="live-btn" data-del="${n}" style="float:left;padding:3px 9px">🗑</button></div>`).join("");
      list.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { wsItems.splice(+b.dataset.del, 1); builder(); });
      body.querySelectorAll("[data-add]").forEach(b => b.onclick = () => addItemForm(b.dataset.add));
      const st = body.querySelector("#iws-start"); if (st) st.onclick = () => { wsIdx = 0; present(); };
    }
    function addItemForm(t) {
      const it = { t, q: "", opts: t === "mcq" ? ["", "", "", ""] : (t === "tf" ? ["صح", "خطأ"] : []), correct: 0, ans: "" };
      body.innerHTML = `<div style="max-width:640px;margin:0 auto;color:#fff">
        <label style="font-weight:800;color:var(--goldl)">${t === "mcq" ? "سؤال اختيار من متعدد" : t === "tf" ? "عبارة صح/خطأ" : "جملة فيها فراغ"}</label>
        <textarea id="it-q" class="stage-bar" style="width:100%;min-height:56px;color:#fff;margin:6px 0 12px"></textarea>
        ${t === "mcq" ? it.opts.map((o, k) => `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="radio" name="itc" ${k === 0 ? "checked" : ""} data-c="${k}" style="width:18px;height:18px"><input class="stage-bar it-opt" data-k="${k}" style="flex:1;color:#fff" placeholder="الخيار ${k + 1}"></div>`).join("") : ""}
        ${t === "tf" ? `<div style="display:flex;gap:8px"><label style="color:#fff"><input type="radio" name="itc" data-c="0" checked> صح</label><label style="color:#fff"><input type="radio" name="itc" data-c="1"> خطأ</label></div>` : ""}
        ${t === "fill" ? `<input id="it-ans" class="stage-bar" style="width:100%;color:#fff" placeholder="الإجابة الصحيحة">` : ""}
        <div style="display:flex;gap:8px;margin-top:14px"><button class="live-btn" id="it-cancel">إلغاء</button><button class="btn-primary" id="it-save" style="flex:1">حفظ السؤال</button></div></div>`;
      body.querySelector("#it-cancel").onclick = builder;
      body.querySelector("#it-save").onclick = () => {
        it.q = body.querySelector("#it-q").value.trim();
        if (t === "mcq") { body.querySelectorAll(".it-opt").forEach(inp => it.opts[+inp.dataset.k] = inp.value.trim()); }
        if (t === "mcq" || t === "tf") { const r = body.querySelector("input[name=itc]:checked"); it.correct = r ? +r.dataset.c : 0; }
        if (t === "fill") it.ans = body.querySelector("#it-ans").value.trim();
        wsItems.push(it); builder();
      };
    }
    function present() {
      const it = wsItems[wsIdx]; if (!it) { builder(); return; }
      body.innerHTML = `<div style="max-width:760px;margin:0 auto;text-align:center;color:#fff">
        <div style="color:#9fb0c4;margin-bottom:8px">سؤال ${wsIdx + 1} من ${wsItems.length}</div>
        ${it.img ? `<img class="q-img" src="${it.img}" alt="">` : ""}
        <div style="font-size:min(5vw,32px);font-weight:800;margin-bottom:22px">${esc(it.q || "—")}</div>
        <div id="q-area"></div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:22px">
          ${wsIdx > 0 ? `<button class="live-btn" id="q-prev">◀ السابق</button>` : ""}
          <button class="btn-gold" id="q-reveal">✅ الإجابة</button>
          ${wsIdx < wsItems.length - 1 ? `<button class="btn-primary" id="q-next">التالي ▶</button>` : `<button class="live-btn" id="q-done">🛠️ إنهاء</button>`}
        </div></div>`;
      const area = body.querySelector("#q-area");
      if (it.t === "fill") area.innerHTML = `<div style="font-size:22px;color:var(--goldl)" id="q-fill">✍️ اكتب/ناقش الإجابة</div>`;
      else area.innerHTML = `<div class="qz-grid">${it.opts.map((o, k) => o ? `<button class="qz-opt-card" data-k="${k}">${it.t === "tf" ? "" : (["أ", "ب", "ج", "د"][k] + ". ")}${esc(o)}</button>` : "").join("")}</div>`;
      area.querySelectorAll(".qz-opt-card").forEach(b => b.onclick = () => { const ok = +b.dataset.k === it.correct; b.classList.add(ok ? "ok" : "no"); if (ok) confetti(); });
      body.querySelector("#q-reveal").onclick = () => {
        if (it.t === "fill") { const f = body.querySelector("#q-fill"); if (f) { f.textContent = "✅ " + (it.ans || "—"); f.style.color = "#3ad07a"; } }
        else area.querySelectorAll(".qz-opt-card").forEach(b => b.classList.add(+b.dataset.k === it.correct ? "ok" : "no"));
        confetti();
      };
      const pv = body.querySelector("#q-prev"); if (pv) pv.onclick = () => { wsIdx--; present(); };
      const nx = body.querySelector("#q-next"); if (nx) nx.onclick = () => { wsIdx++; present(); };
      const dn = body.querySelector("#q-done"); if (dn) dn.onclick = builder;
    }
    const bb = box.querySelector("#iws-build"); if (bb) bb.onclick = builder;
    const pb = box.querySelector("#iws-print"); if (pb) pb.onclick = async () => { const d = await lessonData(code, wk); printWorksheet((d && d.title) || "درس الأسبوع", d && wsItems._auto ? d : { title: "ورقة المعلم", questions: wsItems }); };
    const pp = box.querySelector("#iws-present"); if (pp) pp.onclick = () => { wsIdx = 0; present(); };
    if (wsItems.length) { wsIdx = 0; present(); } else builder();
  }
  // ⏱️ مؤقّت النشاط
  let timerIv = null;
  function stageTimer(box) {
    box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">⏱️ مؤقّت النشاط</span></div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px">
        <div id="tm-disp" style="font-size:min(22vw,150px);font-weight:800;color:var(--goldl);font-variant-numeric:tabular-nums">00:00</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          ${[30, 60, 120, 180, 300].map(s => `<button class="live-btn" data-s="${s}">${s < 60 ? s + " ث" : (s / 60) + " د"}</button>`).join("")}
        </div>
        <div style="display:flex;gap:10px"><button class="btn-primary" id="tm-se" style="min-width:120px">▶️ ابدأ</button><button class="live-btn" id="tm-reset">↺ صفر</button></div>
      </div></div>`;
    let left = 0, running = false;
    const disp = box.querySelector("#tm-disp");
    const fmt = () => { const m = Math.floor(left / 60), s = left % 60; disp.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0"); };
    const stop = () => { clearInterval(timerIv); timerIv = null; running = false; box.querySelector("#tm-se").textContent = "▶️ ابدأ"; };
    box.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { left = +b.dataset.s; fmt(); });
    box.querySelector("#tm-se").onclick = () => {
      if (running) { stop(); return; }
      if (left <= 0) return;
      running = true; box.querySelector("#tm-se").textContent = "⏸ إيقاف";
      timerIv = setInterval(() => { left--; fmt(); if (left <= 0) { stop(); disp.style.color = "#ff6b6b"; confetti(); } }, 1000);
    };
    box.querySelector("#tm-reset").onclick = () => { stop(); left = 0; fmt(); disp.style.color = "var(--goldl)"; };
  }
  function drawLiveRoster() {
    if (liveMainView !== "roster") return;
    const c = classById(liveCid), calc = classCalc(liveCid), box = $("#live-main"); if (!box) return;
    box.innerHTML = `<div class="live-roster">` + c.students.map((s, i) => {
      const p = calc[i].t.pts;
      return `<div class="rcard" data-i="${i}"><div class="rrk">#${calc[i].rank}</div><div class="rn">${esc(s.n)}</div><div class="rp ${p < 0 ? "neg" : ""}">${p}</div></div>`;
    }).join("") + `</div>`;
    box.querySelectorAll(".rcard").forEach(el2 => el2.onclick = () => liveActions(+el2.dataset.i));
  }
  function drawLiveBoard(silent) {
    const c = classById(liveCid), calc = classCalc(liveCid), box = $("#live-board"); if (!box) return;
    const rows = calc.slice().sort((a, b) => b.t.pts - a.t.pts || a.i - b.i);
    box.innerHTML = `<div class="bhead">🏆 لوحة الشرف</div><div class="btip">اضغط اسم الطالب للتقييم اللحظي</div>` + rows.map((r, k) => {
      const cls = k === 0 ? "t1" : k === 1 ? "t2" : k === 2 ? "t3" : "";
      const rk = k < 3 ? ["🥇", "🥈", "🥉"][k] : (k + 1);
      return `<div class="brow ${cls}" data-i="${r.i}"><span class="rk">${rk}</span><span class="bn">${esc(r.s.n)}</span><span class="bp">${r.t.pts}</span></div>`;
    }).join("");
    box.querySelectorAll(".brow").forEach(el2 => el2.onclick = () => liveActions(+el2.dataset.i));
    const topId = rows.length ? rows[0].i : null;
    if (!silent && topId != null && topId !== livePrevTop && rows[0].t.pts > 0) confetti();
    livePrevTop = topId;
  }
  function liveActions(i, ev) {
    const c = classById(liveCid), calc = classCalc(liveCid);
    const pos = behIndex("مميز", true), neg = behIndex("مخالف", false);
    openLiveBox(`<h4>${esc(c.students[i].n)}</h4><div class="cur">النقاط الحالية: ${calc[i].t.pts} · الترتيب ${calc[i].rank}</div>
      <div class="grid">
        <button class="act g" data-k="part">🙋 مشاركة <small>+${W.part}</small></button>
        <button class="act g" data-k="star">⭐ تميّز <small>${pos >= 0 ? "+" + BEH[pos].pts : ""}</small></button>
        <button class="act b" data-k="present">✅ حاضر</button>
        <button class="act b" data-k="hw">📚 واجب ✓ <small>+${W.hw}</small></button>
        <button class="act r" data-k="bad">⚠ مخالفة <small>${neg >= 0 ? BEH[neg].pts : ""}</small></button>
        <button class="act r" data-k="absent">❌ غياب</button>
        <button class="act close" data-k="x">إغلاق</button>
      </div>`, (o) => o.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { applyLive(i, b.dataset.k); closeLiveBox(); }));
  }
  function openLiveBox(html, mount) {
    const d = document.createElement("div"); d.className = "live-act"; d.id = "live-act";
    d.innerHTML = `<div class="box">${html}</div>`;
    d.addEventListener("click", (e) => { if (e.target === d) closeLiveBox(); });
    document.body.appendChild(d); if (mount) mount(d);
  }
  function closeLiveBox() { const d = $("#live-act"); if (d) d.remove(); }
  function applyLive(i, k) {
    const e = rec(liveCid, liveDate, i, true);
    const pos = behIndex("مميز", true), neg = behIndex("مخالف", false);
    let delta = 0;
    if (k === "part") { e.part++; delta = W.part; }
    else if (k === "star" && pos >= 0) { e.beh = e.beh || []; e.beh.push(pos); delta = +BEH[pos].pts; }
    else if (k === "present") { const had = e.a; e.a = 0; delta = (STATES[0].pts || 0) - (had != null && STATES[had] ? STATES[had].pts : 0); }
    else if (k === "hw") { if (e.hw !== 1) { e.hw = 1; delta = W.hw; } }
    else if (k === "bad" && neg >= 0) { e.beh = e.beh || []; e.beh.push(neg); delta = +BEH[neg].pts; }
    else if (k === "absent") { const had = e.a; e.a = 1; delta = (STATES[1].pts || 0) - (had != null && STATES[had] ? STATES[had].pts : 0); }
    save("recs:" + liveCid);
    const card = document.querySelector(`.rcard[data-i="${i}"]`);
    if (card && delta) floatPoints(card, delta);
    if (liveMainView === "roster") drawLiveRoster();
    drawLiveBoard(false);
    const brow = document.querySelector(`.brow[data-i="${i}"]`);
    if (brow) { brow.classList.add("pulse"); setTimeout(() => brow.classList.remove("pulse"), 700); if (delta) floatPoints(brow, delta); }
  }
  function floatPoints(el2, delta) {
    const r = el2.getBoundingClientRect();
    const f = document.createElement("div");
    f.className = "floatpt " + (delta >= 0 ? "pos" : "neg");
    f.textContent = (delta >= 0 ? "+" : "") + (Math.round(delta * 10) / 10);
    f.style.left = (r.left + r.width / 2 - 16) + "px";
    f.style.top = (r.top + 8) + "px";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }

  // 🎮 استوديو ألعاب الدرس — تخمين وصور وفرق (لوحة الشرف تبقى للتقييم اللحظي)
  let gameIv = null, gameIv2 = null;
  function stopGame() { if (gameIv) { clearInterval(gameIv); gameIv = null; } if (gameIv2) { clearInterval(gameIv2); gameIv2 = null; } }
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const GEN_CAPS = ["لوحة المفاتيح", "فأرة الحاسب", "طابعة", "شاشة الحاسب", "الإنترنت", "روبوت", "ميكروفون", "كتب", "مخطط بياني", "جدول بيانات", "جهاز لوحي", "ساعة ذكية", "كاميرا", "محرك البحث"];
  async function stageGames(box, code, wk, c) {
    stopGame();
    const d = await lessonData(code, wk);
    const vocab = (d && d.vocab) || [], bank = await lessonQuestions(code, wk);
    const scenes = (d && d.story) || [];
    const imgs = []; const seenCap = new Set();
    scenes.forEach(s => { if (s.img && s.cap && !seenCap.has(s.cap)) { seenCap.add(s.cap); imgs.push({ img: s.img, cap: s.cap, t: s.t }); } });
    const hero = imgs[0];
    const L = ["أ", "ب", "ج", "د"];
    const bar = (title, extra) => `<div class="stage-bar"><button class="live-btn" id="gm-back">◀ الألعاب</button><span style="color:#fff;font-weight:800">${title}</span>${extra || ""}</div>`;
    // 🎡 اختيار طالب عشوائي (الحاضرون أولاً) للإجابة
    const roster = () => { let pool = c.students.map((s, i) => i); const day = (DB.recs[liveCid] || {})[liveDate]; const pres = pool.filter(i => day && day[i] && day[i].a === 0); return (pres.length ? pres : pool).map(i => c.students[i].n); };
    const pickBtn = `<div class="gm-pickwrap"><button class="live-btn gm-pick" id="gm-pick">🎡 من يجيب؟</button><span class="gm-who" id="gm-who"></span><span class="gm-prog" id="gm-prog"></span><div class="gm-award" id="gm-award"></div></div>`;
    function wirePick() {
      const b = box.querySelector("#gm-pick"), w = box.querySelector("#gm-who"), pr = box.querySelector("#gm-prog"), aw = box.querySelector("#gm-award"); if (!b || !w) return;
      const T = liveTurns;
      const present = () => { const day = (DB.recs[liveCid] || {})[liveDate]; const pool = c.students.map((s, i) => i); const pres = pool.filter(i => day && day[i] && day[i].a === 0); return pres.length ? pres : pool; };
      const prog = () => { const p = present(); pr.textContent = `شارك ${p.filter(i => T.done.has(i)).length}/${p.length}`; };
      const land = (i) => {
        T.cur = i; T.done.add(i); w.textContent = c.students[i].n; w.classList.add("pop"); prog();
        aw.innerHTML = `<button class="gm-aw g" data-k="part">✅ أجاب +${W.part}</button><button class="gm-aw g" data-k="star">🌟 تميّز</button><button class="gm-aw r" data-k="none">😕 لم يُجب</button><button class="gm-aw y" data-k="next">👉 يختار زميلاً</button>`;
        aw.querySelectorAll(".gm-aw").forEach(x => x.onclick = () => {
          const k = x.dataset.k;
          if (k === "part" || k === "star") { applyLive(i, k); x.textContent = "✔ سُجّلت في سجله"; x.disabled = true; confetti(); }
          else if (k === "none") { x.textContent = "سنعود إليه"; x.disabled = true; }
          else chooseNext();
        });
      };
      const chooseNext = () => {
        const p = present().filter(i => !T.done.has(i));
        if (!p.length) { T.done.clear(); prog(); aw.innerHTML = `<span class="gm-fb ok">🎉 شارك الجميع! تبدأ دورة جديدة</span>`; return; }
        openLiveBox(`<h4>👉 ${esc(c.students[T.cur].n)} يختار زميلاً لم يشارك بعد</h4><div class="grid gm-choose">${p.map(i => `<button class="act b" data-i="${i}">${esc(c.students[i].n)}</button>`).join("")}</div><button class="act close" data-k="x" style="width:100%;margin-top:8px">إغلاق</button>`,
          (o) => { o.querySelectorAll("[data-i]").forEach(bt => bt.onclick = () => { closeLiveBox(); land(+bt.dataset.i); }); o.querySelector("[data-k=x]").onclick = closeLiveBox; });
      };
      prog();
      b.onclick = () => {
        let p = present().filter(i => !T.done.has(i));
        if (!p.length) { T.done.clear(); p = present(); }
        // انحياز لطيف للأقل نقاطاً حتى يشاركوا ويحسّنوا وضعهم
        const calc = classCalc(liveCid); const sorted = p.slice().sort((a, b2) => calc[a].t.pts - calc[b2].t.pts); const low = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
        const pool = Math.random() < 0.6 ? low : p;
        let n = 0; w.classList.remove("pop"); aw.innerHTML = ""; if (gameIv2) clearInterval(gameIv2);
        gameIv2 = setInterval(() => { w.textContent = c.students[p[Math.floor(Math.random() * p.length)]].n; if (++n > 16) { clearInterval(gameIv2); gameIv2 = null; land(pool[Math.floor(Math.random() * pool.length)]); } }, 80);
      };
    }
    function menu() {
      stopGame();
      const card = (g, ic, t, sub, on) => `<button class="gm-card" data-g="${g}" ${on ? "" : "disabled"}><span class="gm-ic">${ic}</span><b>${t}</b><small>${sub}</small></button>`;
      box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">🎮 ألعاب الدرس${d ? ": " + esc(d.title) : ""}</span><span style="color:#9fb0c4;font-size:12px;margin-inline-start:auto">من صور الدرس ومصطلحاته وقصته</span></div>
        <div class="gm-menu" ${hero ? `style="background-image:linear-gradient(rgba(10,20,32,.8),rgba(10,20,32,.96)),url('${hero.img}')"` : ""}>
          ${card("guess", "🖼️", "خمّن الصورة", "تنكشف الصورة قطعة قطعة… من يعرفها أولاً يفوز بأكثر النقاط", imgs.length >= 2)}
          ${card("memory", "🧠", "الذاكرة المصوّرة", "اقلب البطاقات وطابق الصورة باسمها قبل نفاد المحاولات", imgs.length >= 3 || vocab.length >= 3)}
          ${card("riddle", "🔤", "من أنا؟", "لغز المصطلح: تعريف وحروف مخفية… خمّن قبل أن تُكشف الحروف", vocab.length >= 3)}
          ${card("order", "🧩", "رتّب القصة", "مشاهد قصة الدرس مبعثرة… أعدها إلى ترتيبها الصحيح", scenes.length >= 4)}
          ${card("teams", "⚔️", "تحدّي الفرق", "الفريق الأخضر ضد الذهبي: مؤقّت، سرقة السؤال، وعجلة تختار المجيب", bank.length >= 4)}
          ${card("match", "🔗", "مطابقة المصطلحات", "صِل كل مصطلح بتعريفه ضد الساعة", vocab.length >= 3)}
          ${card("ladder", "🪜", "سلّم المليون", "اصعد بالإجابات الصحيحة ومعك مساعدة 50:50", bank.length >= 3)}
        </div>${!d ? '<div class="empty-note" style="color:#c9d5e3">لا محتوى لهذا الدرس بعد</div>' : ""}</div>`;
      box.querySelectorAll(".gm-card").forEach(b => b.onclick = () => ({ guess, memory, riddle, order, teams, match, ladder })[b.dataset.g]());
    }
    function finish(title, msg, sub) {
      stopGame();
      box.innerHTML = `<div class="live-stage">${bar(title)}
        <div class="gm-body gm-center"><div class="gm-ic" style="font-size:96px">🏆</div><div class="gm-stmt">${msg}</div>${sub ? `<div class="gm-sub">${sub}</div>` : ""}<div style="color:#c9d5e3;margin-top:6px">امنح المتميزين نقاطهم بالنقر على أسمائهم في لوحة الشرف 🏆</div>
        <button class="btn-primary" id="gm-again" style="margin-top:18px;font-size:17px">🎮 لعبة أخرى</button></div></div>`;
      box.querySelector("#gm-back").onclick = menu; box.querySelector("#gm-again").onclick = menu;
    }
    // 🖼️ خمّن الصورة — كشف تدريجي بقطع
    function guess() {
      const rounds = shuffle(imgs).slice(0, 6); let ri = 0, total = 0;
      const caps = [...new Set([...imgs.map(x => x.cap), ...GEN_CAPS])];
      function round() {
        stopGame();
        const it = rounds[ri]; if (!it) { finish("🖼️ خمّن الصورة", `مجموع النقاط ${total} من ${rounds.length * 100}`); return; }
        const opts = shuffle([it.cap, ...shuffle(caps.filter(x => x !== it.cap)).slice(0, 3)]);
        const TILES = 20; let left = TILES; let locked = false;
        box.innerHTML = `<div class="live-stage">${bar("🖼️ خمّن الصورة", `<span class="gm-hud" style="margin-inline-start:auto">جولة ${ri + 1}/${rounds.length} · ⭐ ${total}</span>`)}
          <div class="gm-body gm-center"><div class="gm-pickrow">${pickBtn}</div>
          <div class="gs-wrap"><img class="gs-img" src="${it.img}" alt=""><div class="gs-grid" id="gs-grid">${Array.from({ length: TILES }, (_, k) => `<div class="gs-tile" data-k="${k}"></div>`).join("")}</div></div>
          <div class="gm-q" id="gs-pts">النقاط الآن: 100</div>
          <div class="qz-grid" style="width:100%;max-width:760px">${opts.map((o, k) => `<button class="qz-opt-card" data-k="${k}">${esc(o)}</button>`).join("")}</div>
          <div style="display:flex;gap:8px;margin-top:14px"><button class="live-btn" id="gs-more">👁️ اكشف قطعتين</button></div></div></div>`;
        box.querySelector("#gm-back").onclick = menu; wirePick();
        const grid = box.querySelector("#gs-grid"), pts = box.querySelector("#gs-pts");
        const reveal = (n) => { const tiles = shuffle([...grid.querySelectorAll(".gs-tile:not(.off)")]).slice(0, n); tiles.forEach(t => t.classList.add("off")); left = grid.querySelectorAll(".gs-tile:not(.off)").length; pts.textContent = "النقاط الآن: " + Math.max(10, left * 5); if (!left && !locked) settle(false, true); };
        gameIv = setInterval(() => reveal(1), 1600);
        box.querySelector("#gs-more").onclick = () => reveal(2);
        function settle(ok, timeout) {
          locked = true; stopGame(); grid.querySelectorAll(".gs-tile").forEach(t => t.classList.add("off"));
          const gain = ok ? Math.max(10, left * 5) : 0; total += gain;
          box.querySelectorAll(".qz-opt-card").forEach(b => { b.onclick = null; if (opts[+b.dataset.k] === it.cap) b.classList.add("ok"); });
          pts.innerHTML = ok ? `<span class="gm-fb ok">✅ ${esc(it.cap)} — +${gain}</span>` : `<span class="gm-fb no">${timeout ? "⏰ انكشفت الصورة" : "❌ ليست هذه"} — الجواب: ${esc(it.cap)}</span>`;
          if (ok) confetti();
          setTimeout(() => { ri++; round(); }, 1700);
        }
        box.querySelectorAll(".qz-opt-card").forEach(b => b.onclick = () => { if (locked) return; if (opts[+b.dataset.k] === it.cap) settle(true); else { b.classList.add("no"); b.onclick = null; left = Math.max(0, left - 2); reveal(2); } });
      }
      round();
    }
    // 🧠 الذاكرة المصوّرة — صورة ↔ اسمها (أو مصطلح ↔ تعريف)
    function memory() {
      let pairs;
      if (imgs.length >= 3) pairs = shuffle(imgs).slice(0, 6).map((x, i) => ({ id: i, a: `<img src="${x.img}" alt="">`, b: esc(x.cap) }));
      else pairs = shuffle(vocab).slice(0, 6).map((v, i) => ({ id: i, a: `<b>${esc(v.t)}</b>`, b: `<small>${esc(v.d)}</small>` }));
      const cards = shuffle(pairs.flatMap(p => [{ id: p.id, h: p.a, k: "a" }, { id: p.id, h: p.b, k: "b" }]));
      let open = [], found = 0, moves = 0; const t0 = Date.now(); let lock = false;
      box.innerHTML = `<div class="live-stage">${bar("🧠 الذاكرة المصوّرة", `<span class="gm-hud" id="gm-hud" style="margin-inline-start:auto"></span>`)}
        <div class="gm-body"><div class="gm-pickrow">${pickBtn}<span class="btip" style="margin:0">اقلب بطاقتين: الصورة واسمها</span></div>
        <div class="mm-grid" style="--n:${cards.length <= 8 ? 4 : 4}">${cards.map((cd, i) => `<button class="mm-card" data-i="${i}"><div class="mm-in"><div class="mm-face mm-back">?</div><div class="mm-face mm-front">${cd.h}</div></div></button>`).join("")}</div></div></div>`;
      box.querySelector("#gm-back").onclick = menu; wirePick();
      const hud = box.querySelector("#gm-hud"); const tick = () => { hud.textContent = `⏱ ${fmtT((Date.now() - t0) / 1000)} · محاولات ${moves} · ${found}/${pairs.length}`; }; tick(); gameIv = setInterval(tick, 500);
      box.querySelectorAll(".mm-card").forEach(b => b.onclick = () => {
        if (lock || b.classList.contains("flip") || b.classList.contains("done")) return;
        b.classList.add("flip"); open.push(b);
        if (open.length === 2) {
          moves++; lock = true; const [x, y] = open; const same = cards[+x.dataset.i].id === cards[+y.dataset.i].id;
          setTimeout(() => { if (same) { x.classList.add("done"); y.classList.add("done"); found++; confetti(); } else { x.classList.remove("flip"); y.classList.remove("flip"); } open = []; lock = false; tick(); if (found === pairs.length) { stopGame(); setTimeout(() => finish("🧠 الذاكرة المصوّرة", `أنهيتم ${pairs.length} أزواج في ${fmtT((Date.now() - t0) / 1000)} بـ${moves} محاولة`), 500); } }, same ? 350 : 900);
        }
      });
    }
    // 🔤 من أنا؟ — لغز المصطلح بكشف الحروف
    function riddle() {
      const items = shuffle(vocab).slice(0, 6); let i = 0, total = 0;
      function show() {
        stopGame();
        const v = items[i]; if (!v) { finish("🔤 من أنا؟", `مجموع النقاط ${total}`); return; }
        const term = v.t.trim(); const chars = [...term]; const hidden = new Set(chars.map((ch, k) => ch === " " ? -1 : k).filter(k => k >= 0)); let solved = false;
        const draw = () => `<div class="rd-word" dir="rtl">${chars.map((ch, k) => ch === " " ? `<span class="rd-sp"></span>` : `<span class="rd-box ${hidden.has(k) ? "" : "on"}">${hidden.has(k) ? "" : esc(ch)}</span>`).join("")}</div>`;
        box.innerHTML = `<div class="live-stage">${bar("🔤 من أنا؟", `<span class="gm-hud" style="margin-inline-start:auto">لغز ${i + 1}/${items.length} · ⭐ ${total}</span>`)}
          <div class="gm-body gm-center"><div class="gm-pickrow">${pickBtn}</div>
          <div class="gm-q">التعريف</div><div class="gm-stmt">${esc(v.d)}</div>
          <div id="rd-w">${draw()}</div><div class="gm-q" id="rd-pts">النقاط الآن: ${10 + hidden.size * 5}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="live-btn" id="rd-letter">🔡 اكشف حرفاً</button><button class="btn-primary" id="rd-got" style="padding:10px 22px">✅ عرفناها!</button><button class="live-btn" id="rd-skip">⏭ تخطٍّ</button></div></div></div>`;
        box.querySelector("#gm-back").onclick = menu; wirePick();
        const w = box.querySelector("#rd-w"), pts = box.querySelector("#rd-pts");
        box.querySelector("#rd-letter").onclick = () => { if (solved || !hidden.size) return; const arr = [...hidden]; hidden.delete(arr[Math.floor(Math.random() * arr.length)]); w.innerHTML = draw(); pts.textContent = "النقاط الآن: " + (10 + hidden.size * 5); if (!hidden.size) { pts.innerHTML = `<span class="gm-fb no">انكشفت كلها — الجواب: ${esc(term)}</span>`; solved = true; setTimeout(() => { i++; show(); }, 1500); } };
        box.querySelector("#rd-got").onclick = () => { if (solved) return; solved = true; const gain = 10 + hidden.size * 5; total += gain; hidden.clear(); w.innerHTML = draw(); pts.innerHTML = `<span class="gm-fb ok">✅ ${esc(term)} — +${gain}</span>`; confetti(); setTimeout(() => { i++; show(); }, 1500); };
        box.querySelector("#rd-skip").onclick = () => { i++; show(); };
      }
      show();
    }
    // 🧩 رتّب القصة — مشاهد مبعثرة
    function order() {
      const src = scenes.map((s, k) => ({ k, s })).slice(0, 6); const disp = shuffle(src); let picked = [];
      box.innerHTML = `<div class="live-stage">${bar("🧩 رتّب القصة", `<span class="gm-hud" id="gm-hud" style="margin-inline-start:auto">انقر المشاهد بترتيب حدوثها</span>`)}
        <div class="gm-body"><div class="gm-pickrow">${pickBtn}<button class="live-btn" id="od-reset">↺ إعادة</button><button class="btn-primary" id="od-check" style="padding:8px 18px" disabled>✅ تحقّق</button></div>
        <div class="od-grid">${disp.map((x, i) => `<button class="od-card" data-i="${i}"><span class="od-n"></span>${x.s.img ? `<img src="${x.s.img}" alt="">` : `<div class="od-emo">${x.s.v || "📘"}</div>`}<div class="od-t">${esc(x.s.t)}</div></button>`).join("")}</div></div></div>`;
      box.querySelector("#gm-back").onclick = menu; wirePick();
      const cards = [...box.querySelectorAll(".od-card")], chk = box.querySelector("#od-check");
      const paint = () => { cards.forEach(cd => { const p = picked.indexOf(+cd.dataset.i); cd.querySelector(".od-n").textContent = p >= 0 ? (p + 1) : ""; cd.classList.toggle("sel", p >= 0); }); chk.disabled = picked.length !== disp.length; };
      cards.forEach(cd => cd.onclick = () => { const i = +cd.dataset.i; const p = picked.indexOf(i); if (p >= 0) picked.splice(p, 1); else picked.push(i); paint(); });
      box.querySelector("#od-reset").onclick = () => { picked = []; cards.forEach(cd => cd.classList.remove("ok", "no")); paint(); };
      chk.onclick = () => {
        let ok = 0; picked.forEach((di, pos) => { const right = disp[di].k === src[pos].k; cards[di].classList.add(right ? "ok" : "no"); if (right) ok++; });
        box.querySelector("#gm-hud").textContent = `${ok}/${disp.length} في مكانها الصحيح`;
        if (ok === disp.length) { confetti(); setTimeout(() => finish("🧩 رتّب القصة", "ترتيب صحيح بالكامل — القصة اكتملت!"), 900); }
      };
    }
    // ⚔️ تحدّي الفرق — الأخضر ضد الذهبي
    function teams() {
      const qs = shuffle(bank.filter(q => q.t !== "fill")).slice(0, 10);
      const T = [{ n: "الفريق الأخضر", cl: "g", s: 0 }, { n: "الفريق الذهبي", cl: "y", s: 0 }];
      let qi = 0, turn = 0, left = 15, steal = false, t0 = 0;
      function show() {
        stopGame();
        const it = qs[qi];
        if (!it) { const w = T[0].s === T[1].s ? null : (T[0].s > T[1].s ? T[0] : T[1]); confetti(); finish("⚔️ تحدّي الفرق", w ? `🏆 الفائز: ${w.n}` : "🤝 تعادل!", `${T[0].n} ${T[0].s} — ${T[1].n} ${T[1].s}`); return; }
        left = 15; steal = false; t0 = Date.now();
        const head = () => `<div class="tm-board"><div class="tm-team g ${turn === 0 ? "on" : ""}"><b>${T[0].n}</b><span>${T[0].s}</span></div><div class="tm-vs">${steal ? "🕵️ فرصة سرقة" : "دور"}</div><div class="tm-team y ${turn === 1 ? "on" : ""}"><b>${T[1].n}</b><span>${T[1].s}</span></div></div>`;
        box.innerHTML = `<div class="live-stage">${bar("⚔️ تحدّي الفرق", `<span class="gm-hud" style="margin-inline-start:auto">سؤال ${qi + 1}/${qs.length}</span>`)}
          <div class="gm-body gm-center"><div id="tm-head">${head()}</div><div class="gm-pickrow">${pickBtn}</div>
          <div class="gm-timer"><div id="gm-tf" style="width:100%"></div></div>
          ${it.img ? `<img class="q-img" src="${it.img}" alt="">` : ""}<div class="gm-stmt" id="gm-stmt">${esc(it.q)}</div>
          <div class="qz-grid" style="width:100%">${it.opts.map((o, k) => o ? `<button class="qz-opt-card" data-k="${k}">${it.t === "tf" ? "" : L[k] + ". "}${esc(o)}</button>` : "").join("")}</div></div></div>`;
        box.querySelector("#gm-back").onclick = menu; wirePick();
        const fill = box.querySelector("#gm-tf"), headEl = box.querySelector("#tm-head");
        const startTimer = (secs) => { stopGame(); left = secs; fill.style.width = "100%"; gameIv = setInterval(() => { left -= 0.1; fill.style.width = Math.max(0, left / secs * 100) + "%"; if (left <= 0) timeout(); }, 100); };
        const next = () => setTimeout(() => { qi++; turn = 1 - turn; show(); }, 1500);
        function timeout() { stopGame(); box.querySelectorAll(".qz-opt-card").forEach(b => { b.onclick = null; if (+b.dataset.k === it.correct) b.classList.add("ok"); }); box.querySelector("#gm-stmt").insertAdjacentHTML("beforeend", `<div class="gm-fb no">⏰ انتهى الوقت</div>`); next(); }
        function wire() {
          box.querySelectorAll(".qz-opt-card").forEach(b => b.onclick = () => {
            const ok = +b.dataset.k === it.correct; b.classList.add(ok ? "ok" : "no"); stopGame();
            if (ok) { const fast = (Date.now() - t0) < 5000 && !steal; const gain = steal ? 5 : (10 + (fast ? 5 : 0)); T[turn].s += gain; confetti(); box.querySelector("#gm-stmt").insertAdjacentHTML("beforeend", `<div class="gm-fb ok">✅ +${gain} لصالح ${T[turn].n}${fast ? " (سرعة!)" : ""}</div>`); headEl.innerHTML = head(); box.querySelectorAll(".qz-opt-card").forEach(x => x.onclick = null); next(); return; }
            if (!steal) { steal = true; turn = 1 - turn; headEl.innerHTML = head(); b.onclick = null; box.querySelector("#gm-stmt").insertAdjacentHTML("beforeend", `<div class="gm-fb no">❌ خطأ — الفرصة الآن لـ ${T[turn].n} (8 ثوانٍ)</div>`); t0 = Date.now(); startTimer(8); return; }
            box.querySelectorAll(".qz-opt-card").forEach(x => { x.onclick = null; if (+x.dataset.k === it.correct) x.classList.add("ok"); }); box.querySelector("#gm-stmt").insertAdjacentHTML("beforeend", `<div class="gm-fb no">❌ لا نقاط لأحد</div>`); turn = 1 - turn; next();
          });
        }
        wire(); startTimer(15);
      }
      show();
    }
    // 🔗 مطابقة المصطلحات
    function match() {
      const pairs = shuffle(vocab).slice(0, 8);
      const defs = shuffle(pairs.map((p, i) => ({ i, d: p.d })));
      let selT = null, done = 0, score = 0; const t0 = Date.now();
      box.innerHTML = `<div class="live-stage">${bar("🔗 مطابقة المصطلحات", `<span class="gm-hud" id="gm-hud" style="margin-inline-start:auto"></span>`)}
        <div class="gm-body"><div class="gm-pickrow">${pickBtn}<span class="btip" style="margin:0">انقر المصطلح ثم تعريفه</span></div><div class="gm-cols"><div class="gm-col">${pairs.map((p, i) => `<button class="gm-tile" data-t="${i}">${esc(p.t)}</button>`).join("")}</div>
        <div class="gm-col">${defs.map(x => `<button class="gm-tile gm-def" data-d="${x.i}">${esc(x.d)}</button>`).join("")}</div></div></div></div>`;
      const hud = box.querySelector("#gm-hud");
      const tick = () => { hud.textContent = `⏱ ${fmtT((Date.now() - t0) / 1000)} · ⭐ ${score} · ${done}/${pairs.length}`; };
      tick(); gameIv = setInterval(tick, 500);
      box.querySelector("#gm-back").onclick = menu; wirePick();
      box.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { if (b.classList.contains("done")) return; box.querySelectorAll("[data-t]").forEach(x => x.classList.remove("sel")); b.classList.add("sel"); selT = +b.dataset.t; });
      box.querySelectorAll("[data-d]").forEach(b => b.onclick = () => {
        if (selT === null || b.classList.contains("done")) return;
        const tb = box.querySelector(`[data-t="${selT}"]`);
        if (+b.dataset.d === selT) { b.classList.add("done"); tb.classList.add("done"); tb.classList.remove("sel"); score += 10; done++; selT = null; }
        else { b.classList.add("bad"); tb.classList.add("bad"); score = Math.max(0, score - 2); setTimeout(() => { b.classList.remove("bad"); tb.classList.remove("bad"); }, 450); }
        tick();
        if (done === pairs.length) { stopGame(); confetti(); const tt = fmtT((Date.now() - t0) / 1000); setTimeout(() => finish("🔗 مطابقة المصطلحات", `أنهيتم ${pairs.length} مطابقات في ${tt} — النقاط ${score}`), 600); }
      });
    }
    // 🪜 سلّم المليون
    function ladder() {
      const LV = [100, 200, 500, 1000, 5000, 10000, 50000, 1000000];
      let qs = shuffle(bank.filter(q => q.t === "mcq" && q.opts.filter(Boolean).length >= 3)); if (qs.length < 3) qs = shuffle(bank.filter(q => q.t !== "fill"));
      const n = Math.min(LV.length, qs.length);
      let lvl = 0, qi = 0, half = true;
      function draw() {
        if (lvl >= n) { confetti(); finish("🪜 سلّم المليون", `🏆 وصلتم إلى القمة: ${LV[n - 1].toLocaleString("en-US")} نقطة!`); return; }
        const it = qs[qi % qs.length];
        box.innerHTML = `<div class="live-stage">${bar("🪜 سلّم المليون", `<button class="live-btn" id="gm-half" ${half ? "" : "disabled"} style="margin-inline-start:auto">✂ 50:50</button>`)}
          <div class="gm-body gm-ladder"><div class="gm-steps">${LV.slice(0, n).map((v, k) => `<div class="gm-step ${k === lvl ? "cur" : k < lvl ? "won" : ""}">${k + 1}. ${v.toLocaleString("en-US")}</div>`).reverse().join("")}</div>
          <div class="gm-center" style="flex:1;display:flex;flex-direction:column"><div class="gm-pickrow">${pickBtn}</div><div class="gm-q">السؤال ${lvl + 1} — من أجل ${LV[lvl].toLocaleString("en-US")} نقطة</div>${it.img ? `<img class="q-img" src="${it.img}" alt="">` : ""}<div class="gm-stmt" id="gm-stmt">${esc(it.q)}</div>
          <div class="qz-grid" style="width:100%">${it.opts.map((o, k) => o ? `<button class="qz-opt-card" data-k="${k}">${it.t === "tf" ? "" : L[k] + ". "}${esc(o)}</button>` : "").join("")}</div></div></div></div>`;
        box.querySelector("#gm-back").onclick = menu; wirePick();
        box.querySelector("#gm-half").onclick = () => { if (!half) return; half = false; box.querySelector("#gm-half").disabled = true; shuffle([...box.querySelectorAll(".qz-opt-card")].filter(b => +b.dataset.k !== it.correct)).slice(0, 2).forEach(b => { b.style.visibility = "hidden"; }); };
        box.querySelectorAll(".qz-opt-card").forEach(b => b.onclick = () => {
          const ok = +b.dataset.k === it.correct; b.classList.add(ok ? "ok" : "no");
          box.querySelectorAll(".qz-opt-card").forEach(x => x.onclick = null);
          if (ok) { confetti(); lvl++; qi++; setTimeout(draw, 1100); }
          else { const r = box.querySelector(`.qz-opt-card[data-k="${it.correct}"]`); if (r) r.classList.add("ok"); box.querySelector("#gm-stmt").insertAdjacentHTML("beforeend", `<div class="gm-fb no">❌ للأسف… نعود إلى أول السلّم</div>`); setTimeout(() => { lvl = 0; qi++; qs = shuffle(qs); draw(); }, 1800); }
        });
      }
      draw();
    }
    menu();
  }

  /* ═══════════ 📈 تقدّم الطالب عبر المواد + لوحة مستويات المدير + تقارير أولياء الأمور ═══════════ */
  // نقاط كل يوم رصد مرتبة زمنياً (لأي سجل: مادتي أو مادة زميل)
  function daySeries(recsCid, i) {
    const out = [];
    Object.keys(recsCid || {}).sort().forEach(date => {
      const e = recsCid[date][i]; if (!e) return; let p = 0;
      if (e.a != null && STATES[e.a]) p += +STATES[e.a].pts || 0;
      if (e.part) p += e.part * W.part; if (e.hw === 1) p += W.hw; if (e.sh) p += e.sh * W.sheets;
      (e.beh || []).forEach(bi => { if (BEH[bi]) p += +BEH[bi].pts || 0; });
      out.push({ date, p: Math.round(p * 10) / 10 });
    });
    return out;
  }
  const trendOf = (ser) => { if (ser.length < 4) return ""; const h = Math.ceil(ser.length / 2); const a = ser.slice(0, h).reduce((x, y) => x + y.p, 0) / h, b = ser.slice(h).reduce((x, y) => x + y.p, 0) / (ser.length - h); return b > a + 0.5 ? "📈 في تحسّن" : b < a - 0.5 ? "📉 يحتاج متابعة" : "➡️ مستقر"; };
  const attPct = (t) => { const n = t.st.reduce((x, y) => x + y, 0); return n ? Math.round(t.st[0] / n * 100) : null; };
  // كل مواد الفصل من السحابة: [{tid, subject, tname, recs, grades}] — وفي المحلي مادتي فقط
  async function classDocs(cid) {
    const out = [];
    if (CLOUD && fdb) {
      try {
        const [rs, gs] = await Promise.all([fdb.collection("recs").get(), fdb.collection("grades").get()]);
        const byT = {}; const suf = "_" + cid;
        rs.forEach(x => { if (x.id.endsWith(suf)) { const tid = x.id.slice(0, -suf.length); byT[tid] = byT[tid] || {}; byT[tid].recs = (x.data() || {}).d || {}; } });
        gs.forEach(x => { if (x.id.endsWith(suf)) { const tid = x.id.slice(0, -suf.length); byT[tid] = byT[tid] || {}; byT[tid].grades = (x.data() || {}).g || {}; } });
        Object.keys(byT).forEach(tid => { const t = D.teachers.find(z => z.id === tid); out.push({ tid, subject: t ? t.subject : tid, tname: t ? t.name : "", recs: byT[tid].recs || {}, grades: byT[tid].grades || {} }); });
      } catch (e) { }
    }
    if (!out.length && TE && !TE.admin) out.push({ tid: TE.id, subject: TE.subject, tname: TE.name, recs: DB.recs[cid] || {}, grades: DB.grades[cid] || {} });
    return out;
  }
  const maxTotal = () => ASSESS.reduce((a, b) => a + b.max, 0);
  const pctCell = (p) => p == null ? '<td style="color:#bbb">—</td>' : `<td style="background:${p >= 90 ? "#dff5e3" : p >= 75 ? "#eef7dd" : p >= 60 ? "#fff6d6" : p >= 50 ? "#ffe9d6" : "#ffd9d9"}"><b>${Math.round(p)}</b></td>`;
  async function studentProgress(cid, i) {
    const c = classById(cid), s = c.students[i];
    openSheet(`<h4>📈 تقدّم الطالب: ${esc(s.n)}</h4><div style="color:var(--muted);font-size:13px;text-align:center;margin-bottom:8px">${esc(c.name)} — ${esc(META.school.name)}</div><div id="pg-body"><div class="empty-note">جارِ جمع البيانات من كل المواد…</div></div>
      <div class="sheet-actions"><button class="btn-plain" onclick="print()">🖨️ طباعة</button><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, async (o) => {
      const docs = await classDocs(cid), maxTot = maxTotal();
      const rows = docs.map(dc => { const t = calcStudent(cid, i, dc.recs); const hasG = Object.keys(dc.grades[i] || {}).length > 0; const gt = hasG ? gradeTotal(cid, i, dc.grades) : null; return { ...dc, t, hasG, gt, pct: hasG ? gt / maxTot * 100 : null, att: attPct(t), series: daySeries(dc.recs, i) }; });
      const mine = rows.find(r => TE && r.tid === TE.id) || rows[0];
      const ps = rows.filter(r => r.pct != null).map(r => r.pct); const overall = ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null;
      const bars = (ser) => { const last = ser.slice(-14); const mx = Math.max(5, ...last.map(x => Math.abs(x.p))); return `<div class="pg-bars">${last.map(x => `<div class="pg-bar" title="${x.date}: ${x.p}"><div style="height:${Math.round(Math.abs(x.p) / mx * 100)}%;background:${x.p >= 0 ? "var(--ok)" : "var(--bad)"}"></div><small>${x.date.slice(5).replace("-", "/")}</small></div>`).join("")}</div>`; };
      const b = o.querySelector("#pg-body"); if (!b) return;
      b.innerHTML = `
        <div class="statrow"><div class="stat"><div class="v">${overall != null ? overall + "%" : "—"}</div><div class="l">المعدل العام</div></div><div class="stat"><div class="v" style="font-size:14px">${overall != null ? esc(levelOf(overall).t) : "—"}</div><div class="l">المستوى العام</div></div><div class="stat"><div class="v">${rows.length}</div><div class="l">مواد مرصودة</div></div><div class="stat"><div class="v">${mine && mine.att != null ? mine.att + "%" : "—"}</div><div class="l">حضور ${esc(mine ? mine.subject : "")}</div></div></div>
        ${mine ? `<div style="font-weight:800;color:var(--navy);margin:8px 0 4px">نقاط ${esc(mine.subject)} في الحصص الأخيرة — ${trendOf(mine.series) || "بداية الرصد"}</div>${mine.series.length ? bars(mine.series) : '<div class="empty-note">لا رصد بعد</div>'}` : ""}
        <div class="table-scroll" style="margin-top:10px"><table class="report-table"><tr><th style="min-width:110px">المادة</th><th>النقاط</th><th>الحضور</th><th>الدرجة</th><th>المستوى</th><th>الاتجاه</th></tr>
        ${rows.map(r => `<tr><td class="nm">${esc(r.subject)}<br><small style="color:var(--muted)">${esc(r.tname)}</small></td><td><b>${r.t.pts}</b></td><td>${r.att != null ? r.att + "%" : "—"}</td><td>${r.hasG ? r.gt + "/" + maxTot : "—"}</td>${r.pct != null ? `<td>${esc(levelOf(r.pct).t)}</td>` : "<td>—</td>"}<td>${trendOf(r.series) || "—"}</td></tr>`).join("")}</table></div>
        ${!CLOUD ? '<div class="empty-note" style="padding:8px">في النسخة السحابية تظهر كل مواد الطالب من جميع معلميه</div>' : ""}`;
    });
  }
  // 📊 لوحة المدير: مستويات الطلاب حسب المادة وكل المواد
  async function adminLevels() {
    const cls = D.classes.slice().sort((a, b) => (a.gc - b.gc) || a.name.localeCompare(b.name)); let cur = cls[0].id;
    openSheet(`<h4>📊 مستويات الطلاب — كل المواد</h4><div class="class-chips" id="al-chips">${cls.map(x => `<button class="chip ${x.id === cur ? "on" : ""}" data-c="${x.id}">${esc(x.name)}</button>`).join("")}</div><div id="al-body"></div>
      <div class="sheet-actions" style="flex-wrap:wrap"><button class="btn-gold" id="al-school" style="flex:1 1 100%">🏫 ملخص المدرسة حسب المادة</button><button class="btn-plain" onclick="print()">🖨️ طباعة</button><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, (o) => {
      const body = o.querySelector("#al-body");
      async function build() {
        body.innerHTML = '<div class="empty-note">جارِ التحليل…</div>';
        const c = classById(cur), docs = await classDocs(cur), maxTot = maxTotal();
        if (!docs.length) { body.innerHTML = '<div class="empty-note">لا رصد لهذا الفصل بعد</div>'; return; }
        const rows = c.students.map((s, i) => { const per = docs.map(dc => { const has = Object.keys(dc.grades[i] || {}).length > 0; const pct = has ? gradeTotal(cur, i, dc.grades) / maxTot * 100 : null; const t = calcStudent(cur, i, dc.recs); return { pct, pts: t.pts }; }); const ps = per.filter(x => x.pct != null).map(x => x.pct); const avg = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null; const pts = Math.round(per.reduce((a, x) => a + x.pts, 0) * 10) / 10; return { s, i, per, avg, pts }; }).sort((a, b) => ((b.avg == null ? -1 : b.avg) - (a.avg == null ? -1 : a.avg)) || b.pts - a.pts);
        body.innerHTML = `<div class="table-scroll"><table class="report-table"><tr><th>م</th><th style="min-width:140px">الطالب</th>${docs.map(dc => `<th>${esc(dc.subject)}</th>`).join("")}<th>المعدل</th><th>المستوى</th><th>النقاط</th></tr>
          ${rows.map((r, k) => `<tr class="al-row" data-i="${r.i}" style="cursor:pointer"><td>${k + 1}</td><td class="nm">${esc(r.s.n)}</td>${r.per.map(x => pctCell(x.pct)).join("")}${pctCell(r.avg)}<td>${r.avg != null ? esc(levelOf(r.avg).t) : "—"}</td><td>${r.pts}</td></tr>`).join("")}
          <tr class="tot"><td></td><td class="nm">متوسط الفصل</td>${docs.map((dc, j) => { const v = rows.map(r => r.per[j].pct).filter(x => x != null); return pctCell(v.length ? v.reduce((a, b) => a + b, 0) / v.length : null); }).join("")}<td></td><td></td><td></td></tr></table></div>
          <div class="empty-note" style="padding:6px">الدرجات نسبة مئوية من ${maxTot} — انقر اسم الطالب لتقدّمه التفصيلي في كل المواد</div>`;
        body.querySelectorAll(".al-row").forEach(tr => tr.onclick = () => studentProgress(cur, +tr.dataset.i));
      }
      o.querySelectorAll("#al-chips .chip").forEach(ch => ch.onclick = () => { cur = ch.dataset.c; o.querySelectorAll("#al-chips .chip").forEach(x => x.classList.toggle("on", x === ch)); build(); });
      o.querySelector("#al-school").onclick = schoolSummary;
      build();
    });
  }
  async function schoolSummary() {
    openSheet(`<h4>🏫 ملخص المدرسة حسب المادة</h4><div id="ss-body"><div class="empty-note">جارِ التحليل…</div></div><div class="sheet-actions"><button class="btn-plain" onclick="print()">🖨️ طباعة</button><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, async (o) => {
      const body = o.querySelector("#ss-body"); const maxTot = maxTotal(), bySub = {};
      let rs, gs; try { if (!CLOUD || !fdb) throw 0; [rs, gs] = await Promise.all([fdb.collection("recs").get(), fdb.collection("grades").get()]); } catch (e) { body.innerHTML = '<div class="empty-note">يتطلب النسخة السحابية المشتركة</div>'; return; }
      const gmap = {}; gs.forEach(x => gmap[x.id] = (x.data() || {}).g || {});
      rs.forEach(x => {
        const k = x.id.indexOf("_"); const tid = x.id.slice(0, k), cid = x.id.slice(k + 1); const t = D.teachers.find(z => z.id === tid); const c = classById(cid); if (!t || !c) return;
        const sub = t.subject; bySub[sub] = bySub[sub] || { n: 0, lv: [0, 0, 0, 0, 0], att: [], cls: {} };
        const recs = (x.data() || {}).d || {}; const g = gmap[x.id] || {};
        c.students.forEach((s, i) => { const tt = calcStudent(cid, i, recs); const a = attPct(tt); if (a != null) bySub[sub].att.push(a); if (Object.keys(g[i] || {}).length) { const p = gradeTotal(cid, i, g) / maxTot * 100; bySub[sub].n++; bySub[sub].lv[levelOf(p).i]++; (bySub[sub].cls[c.name] = bySub[sub].cls[c.name] || []).push(p); } });
      });
      const LV = ["ممتاز", "جيد جداً", "جيد", "مقبول", "دون المطلوب"];
      body.innerHTML = Object.keys(bySub).length ? `<div class="table-scroll"><table class="report-table"><tr><th style="min-width:110px">المادة</th><th>بدرجات</th>${LV.map(l => `<th>${l}</th>`).join("")}<th>الحضور</th><th>أعلى فصل</th><th>أدنى فصل</th></tr>${Object.entries(bySub).map(([sub, v]) => { const ca = Object.entries(v.cls).map(([n, arr]) => ({ n, a: arr.reduce((a, b) => a + b, 0) / arr.length })).sort((a, b) => b.a - a.a); const att = v.att.length ? Math.round(v.att.reduce((a, b) => a + b, 0) / v.att.length) + "%" : "—"; return `<tr><td class="nm">${esc(sub)}</td><td>${v.n}</td>${v.lv.map(x => `<td>${x || ""}</td>`).join("")}<td>${att}</td><td>${ca.length ? esc(ca[0].n) + " " + Math.round(ca[0].a) + "%" : "—"}</td><td>${ca.length ? esc(ca[ca.length - 1].n) + " " + Math.round(ca[ca.length - 1].a) + "%" : "—"}</td></tr>`; }).join("")}</table></div>` : '<div class="empty-note">لا رصد بعد</div>';
    });
  }
  // 📤 تقارير الفترة لأولياء الأمور (قروب الواتس أو رسالة لكل ولي أمر)
  const recsInRange = (cid, from, to) => { const src = DB.recs[cid] || {}, out = {}; Object.keys(src).forEach(dt => { if ((!from || dt >= from) && (!to || dt <= to)) out[dt] = src[dt]; }); return out; };
  const waLink = (phone, text) => "https://wa.me/" + (phone ? phone : "") + "?text=" + encodeURIComponent(text);
  const phoneOf = (s) => (s.p || "").replace(/\D/g, "").replace(/^0/, "966");
  const hLabelShort = (iso) => { try { return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long" }).format(new Date(iso + "T12:00:00")); } catch (e) { return iso; } };
  function periodText(cid, from, to) {
    const c = classById(cid), recs = recsInRange(cid, from, to), maxTot = maxTotal();
    const rows = c.students.map((s, i) => ({ s, i, t: calcStudent(cid, i, recs) }));
    const days = Object.keys(recs).length; const rated = rows.filter(r => r.t.days);
    const attN = rows.reduce((a, r) => a + r.t.st.reduce((x, y) => x + y, 0), 0); const att = attN ? Math.round(rows.reduce((a, r) => a + (r.t.st[0] || 0), 0) / attN * 100) : null;
    const part = rows.reduce((a, r) => a + r.t.part, 0), hw = rows.reduce((a, r) => a + r.t.hwY, 0);
    const top = rows.filter(r => r.t.pts > 0).sort((a, b) => b.t.pts - a.t.pts).slice(0, 5);
    const need = rows.filter(r => r.t.st[1] > 0 || r.t.hwN > 0 || r.t.behN > 0).slice(0, 8);
    return `📊 *تقرير ${TE.subject} — ${c.name}*\n🏫 ${META.school.name}\n🗓️ الفترة: ${hLabelShort(from)} → ${hLabelShort(to)} (${days} حصة مرصودة)\n\n` +
      `✅ نسبة الحضور: ${att != null ? att + "%" : "لم يُرصد بعد"}\n🙋 المشاركات: ${part} | 📚 الواجبات المنجزة: ${hw}\n\n` +
      (top.length ? `🏆 *الأوائل في النقاط:*\n${top.map((r, k) => `${["🥇", "🥈", "🥉", "4.", "5."][k]} ${r.s.n} (${r.t.pts})`).join("\n")}\n\n` : "") +
      (need.length ? `🔔 *يحتاجون متابعة الأسرة:*\n${need.map(r => `• ${r.s.n}: ${[r.t.st[1] ? "غياب " + r.t.st[1] : "", r.t.hwN ? "واجب ناقص " + r.t.hwN : "", r.t.behN ? "ملاحظة سلوك" : ""].filter(Boolean).join("، ")}`).join("\n")}\n\n` : "") +
      `💡 نشكر تعاونكم، ومتابعتكم اليومية تصنع الفرق.\n👨‍🏫 معلم المادة: ${TE.name}`;
  }
  function studentText(cid, i, from, to) {
    const c = classById(cid), s = c.students[i], recs = recsInRange(cid, from, to), t = calcStudent(cid, i, recs), maxTot = maxTotal();
    const all = c.students.map((x, k) => calcStudent(cid, k, recs).pts).sort((a, b) => b - a); const rank = all.indexOf(t.pts) + 1;
    const hasG = Object.keys((DB.grades[cid] || {})[i] || {}).length > 0, gt = gradeTotal(cid, i); const a = attPct(t);
    const tip = t.st[1] > 0 ? "نرجو متابعة الحضور." : t.hwN > 0 ? "نرجو متابعة إنجاز الواجبات." : t.pts >= 10 ? "أداء مميز، بارك الله فيه." : "نأمل مزيداً من المشاركة.";
    return `السلام عليكم ورحمة الله\nولي أمر الطالب: *${s.n}* — ${c.name}\n📊 تقرير ${TE.subject} للفترة ${hLabelShort(from)} → ${hLabelShort(to)}\n` +
      `⭐ النقاط: ${t.pts} | الترتيب: ${rank} من ${c.students.length}\n✅ الحضور: ${a != null ? a + "%" : "—"} (${STATES.map((st, k) => t.st[k] ? `${st.name} ${t.st[k]}` : "").filter(Boolean).join("، ") || "لا رصد"})\n🙋 المشاركة: ${t.part} | 📚 الواجبات: ${t.hwY}${t.hwN ? ` (ناقص ${t.hwN})` : ""}${hasG ? `\n📝 الدرجة: ${gt}/${maxTot} — ${levelOf(gt / maxTot * 100).t}` : ""}\n💡 ${tip}\n${META.school.name} — ${TE.name}`;
  }
  function parentReportsCard(box) {
    const cls = myClasses(); if (!cls.length) return;
    const today = new Date().toISOString().slice(0, 10), ago = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const wa = document.createElement("div"); wa.className = "card no-print";
    wa.innerHTML = `<h3><span class="dot"></span>📤 تقارير أولياء الأمور — ${esc(classById(repClass).name)}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="field" style="margin:0"><label>من تاريخ</label><input type="date" id="wa-from" value="${ago}"></div><div class="field" style="margin:0"><label>إلى تاريخ</label><input type="date" id="wa-to" value="${today}"></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn-gold" id="wa-group" style="flex:1">💬 تقرير الفصل لقروب الواتس</button><button class="btn-gold" id="wa-each" style="flex:1">👨‍👩‍👦 رسالة لكل ولي أمر</button></div>
      <textarea class="note" id="wa-text" rows="9" style="margin-top:8px;display:none;direction:rtl"></textarea>
      <div id="wa-act" style="display:none;gap:8px;margin-top:6px"><button class="btn-plain" id="wa-copy" style="flex:1">📋 نسخ النص</button><a class="wa-btn" id="wa-share" target="_blank" rel="noopener" style="flex:2;margin:0">💬 مشاركة في واتساب (اختر القروب)</a></div>`;
    box.appendChild(wa);
    const rng = () => [wa.querySelector("#wa-from").value || ago, wa.querySelector("#wa-to").value || today];
    wa.querySelector("#wa-group").onclick = () => {
      const [f, t] = rng(); const txt = periodText(repClass, f, t);
      const ta = wa.querySelector("#wa-text"); ta.style.display = "block"; ta.value = txt;
      const act = wa.querySelector("#wa-act"); act.style.display = "flex"; wa.querySelector("#wa-share").href = waLink("", txt);
      wa.querySelector("#wa-copy").onclick = () => { try { navigator.clipboard.writeText(ta.value); wa.querySelector("#wa-copy").textContent = "✔ نُسخ"; } catch (e) { ta.select(); document.execCommand("copy"); } };
    };
    wa.querySelector("#wa-each").onclick = () => {
      const [f, t] = rng(); const c = classById(repClass);
      openSheet(`<h4>👨‍👩‍👦 رسالة لكل ولي أمر — ${esc(c.name)}</h4><div style="color:var(--muted);font-size:13px;margin-bottom:8px">الفترة ${hLabelShort(f)} → ${hLabelShort(t)} — كل زر يفتح واتساب برسالة جاهزة لولي أمر الطالب</div>
        <div id="pe-list">${c.students.map((s, i) => { const ph = phoneOf(s); return `<div class="stu"><span class="nm">${esc(s.n)}<small>${calcStudent(repClass, i, recsInRange(repClass, f, t)).pts} نقطة في الفترة</small></span><div style="display:flex;gap:6px"><button class="btn-soft" data-pg="${i}">📈</button><a class="wa-btn ${ph ? "" : "off"}" style="margin:0;padding:6px 10px;font-size:13px" target="_blank" rel="noopener" href="${waLink(ph, studentText(repClass, i, f, t))}">💬 إرسال</a></div></div>`; }).join("")}</div>
        <div class="sheet-actions"><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, (o) => o.querySelectorAll("[data-pg]").forEach(b => b.onclick = () => studentProgress(repClass, +b.dataset.pg)));
    };
  }
  function confetti() {
    const em = ["🎉", "⭐", "🏆", "✨", "🎊"];
    for (let n = 0; n < 14; n++) {
      const c = document.createElement("div");
      c.className = "conf"; c.textContent = em[n % em.length];
      c.style.left = (Math.random() * 90 + 3) + "%";
      c.style.animationDelay = (Math.random() * 0.3) + "s";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2000);
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

    // اجمع بيانات الطالب عبر كل معلميه + نقاط كل زملائه للترتيب ولوحة الشرف
    const agg = { pts: 0, st: STATES.map(() => 0), part: 0, hwY: 0, days: 0, beh: {}, grades: [], rank: 0, board: [] };
    const classPts = c.students.map(() => 0);
    function addPts(e) {
      let p = 0;
      if (e.a != null && STATES[e.a]) p += (+STATES[e.a].pts || 0);
      if (e.part) p += e.part * W.part;
      if (e.hw === 1) p += W.hw;
      if (e.sh) p += e.sh * W.sheets;
      (e.beh || []).forEach(bi => { const b = BEH[bi]; if (b) p += (+b.pts || 0); });
      return p;
    }
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
          Object.keys(day).forEach(idx => { const e = day[idx]; if (e) classPts[idx] += addPts(e); });
          const e = day[i]; if (!e) return; agg.days++;
          if (e.a != null && STATES[e.a]) agg.st[e.a]++;
          if (e.part) agg.part += e.part;
          if (e.hw === 1) agg.hwY++;
          (e.beh || []).forEach(bi => { if (BEH[bi]) agg.beh[bi] = (agg.beh[bi] || 0) + 1; });
        });
      });
      classPts.forEach((v, k) => classPts[k] = Math.round(v * 10) / 10);
      agg.pts = classPts[i];
      agg.rank = 1 + classPts.filter(v => v > classPts[i]).length;
      agg.board = c.students.map((st, k) => ({ n: st.n, pts: classPts[k], k })).filter(x => x.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 5);
      const maxTot = ASSESS.reduce((a, b) => a + b.max, 0);
      grDocs.forEach(gd => {
        const g = gd.g[i]; if (!g || !Object.keys(g).length) return;
        let sum = 0; ASSESS.forEach(a => { const v = +g[a.k]; if (!isNaN(v)) sum += Math.min(v, a.max); });
        const teacher = D.teachers.find(t => t.id === gd.tid);
        agg.grades.push({ subj: teacher ? teacher.subject : "مادة", tot: Math.round(sum * 10) / 10, max: maxTot });
      });
    }
    await gather();
    // أظهر ترتيب الطالب في الترويسة
    const cl = V.querySelector(".st-hero .cl");
    if (cl && agg.rank && classPts.some(v => v > 0)) cl.innerHTML += ` · ترتيبي: <b style="color:var(--goldl)">${agg.rank}</b> من ${c.students.length}`;

    function stSection(sec) {
      const body = $("#st-body");
      if (sec === "card") {
        body.innerHTML = `<div class="kpis" style="margin:12px"><div class="kpi"><div class="v">${agg.pts}</div><div class="l">نقاطي</div></div><div class="kpi"><div class="v">${agg.st[0]}</div><div class="l">أيام حضوري</div></div><div class="kpi"><div class="v">${agg.hwY}</div><div class="l">واجباتي ✓</div></div></div>
          <div class="card" style="margin:12px"><h3><span class="dot"></span>حضوري وسلوكي</h3>
            <div class="countchips">${STATES.map((st, k) => agg.st[k] ? `<span class="cc" style="background:${STCOLORS[k]}">${esc(st.name)} ${agg.st[k]}</span>` : "").filter(Boolean).join("") || '<span style="color:var(--muted);font-size:13px">لا رصد بعد</span>'}</div>
            <div class="countchips">${Object.keys(agg.beh).map(bi => `<span class="cc" style="background:${BEH[bi].pts >= 0 ? "var(--ok)" : "var(--bad)"}">${esc(BEH[bi].name)} ×${agg.beh[bi]}</span>`).join("")}</div></div>
          <div class="card" style="margin:12px"><h3><span class="dot"></span>درجاتي</h3>${agg.grades.length ? `<div class="table-scroll"><table class="report-table"><tr><th>المادة</th><th>الدرجة</th><th>من</th></tr>${agg.grades.map(g => `<tr><td class="nm">${esc(g.subj)}</td><td><b>${g.tot}</b></td><td>${g.max}</td></tr>`).join("")}</table></div>` : '<div class="empty-note">لم تُرصد درجات بعد</div>'}</div>
          <div class="card" style="margin:12px"><h3><span class="dot"></span>🏆 لوحة شرف فصلي</h3>${agg.board.length ? agg.board.map((b, k) => `<div class="al" style="${b.k === i ? "background:#fdf6e3;border-radius:10px;padding:6px 8px" : "padding:6px 2px"}"><span><b style="font-size:16px">${["🥇", "🥈", "🥉", "🎖️", "🎖️"][k]}</b> ${esc(b.n)}${b.k === i ? " <b style=\"color:var(--gold)\">(أنت)</b>" : ""}</span><span class="pts" style="color:var(--ok)">${b.pts}</span></div>`).join("") : '<div class="empty-note">كن أول المتميزين في فصلك 🌟</div>'}</div>`;
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
          <button class="btn-gold no-print" style="margin-top:14px" id="st-cert-print">🖨️ طباعة الشهادة (تصميم فاخر)</button></div>`;
        const pb = body.querySelector("#st-cert-print"); if (pb) pb.onclick = () => printCertificate(cid, i, agg.pts);
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
  try { if (window.speechSynthesis) { window.speechSynthesis.getVoices(); window.speechSynthesis.onvoiceschanged = () => { try { window.speechSynthesis.getVoices(); } catch (e) { } }; } } catch (e) { }
  boot();
})();
