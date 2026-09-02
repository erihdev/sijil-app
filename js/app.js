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
      ${myClasses().length ? `<button class="btn-primary" id="today-live" style="margin-bottom:12px;font-size:17px">🎬 ابدأ حصة تفاعلية (عرض على البروجكتر)</button>` : ""}
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
        <button class="btn-gold" style="flex:1 1 100%" id="sc-cert">🎓 شهادة تميّز (طباعة فاخرة)</button>
        <button class="btn-primary" style="flex:1 1 100%" onclick="window._sheetClose()">إغلاق</button></div>`,
      (o) => {
        o.querySelector("#sc-addcomm").onclick = () => commSheet(cid, i);
        o.querySelector("#sc-report").onclick = () => printReport(cid, i);
        o.querySelector("#sc-letter").onclick = () => printLetter(cid, i);
        o.querySelector("#sc-cert").onclick = () => printCertificate(cid, i);
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
          html += `<div class="comm-item"><b>أسبوع ${r.w}: ${esc(r.lesson)}</b><div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><button class="btn-soft" data-ws="${esc(r.lesson)}">🖨️ ورقة عمل</button><a class="btn-soft" style="text-decoration:none" href="https://wordwall.net/ar/community?query=${q}" target="_blank" rel="noopener">🎮 أنشطة</a></div></div>`;
        });
      }
      const body = o.querySelector("#sh-body"); if (!body) return;
      body.innerHTML = html || '<div class="empty-note">لا دروس متاحة حول هذا الأسبوع</div>';
      body.querySelectorAll("[data-ws]").forEach(b => b.onclick = () => printWorksheet(b.dataset.ws));
    });
  }
  function printWorksheet(lesson) {
    printDoc("ورقة عمل — " + lesson, `
      <div class="h"><div class="bar">${esc(META.school.name)}</div><div class="m">${esc(TE.subject)} — ${esc(hijriLabel())}</div></div>
      <div class="tt">ورقة عمل: ${esc(lesson)}</div>
      <p>اسم الطالب: ............................................ الفصل: ............ التاريخ: ............</p>
      <p><b>السؤال الأول:</b> اكتب أهم ما تعلّمته عن (${esc(lesson)}):</p><p>....................................................................................................................</p><p>....................................................................................................................</p>
      <p><b>السؤال الثاني:</b> أكمل الفراغات المناسبة:</p><p>....................................................................................................................</p>
      <p><b>السؤال الثالث:</b> ارسم أو مثّل ما فهمته:</p><div style="border:1px dashed #aaa;height:150px;border-radius:8px"></div>
      <div class="sig"><span>المعلم: ${esc(TE.name)}</span><span>الدرجة: ......</span></div>`);
  }

  /* ═══════════ وضع الحصة الحية (العرض) ═══════════ */
  const behIndex = (sub, positive) => {
    let k = BEH.findIndex(b => b.name.includes(sub));
    if (k < 0) k = BEH.findIndex(b => positive ? (+b.pts > 0) : (+b.pts < 0));
    return k;
  };
  let liveCid = null, livePrevTop = null, liveDate = null;
  function pickClassThen(cb) {
    const cls = myClasses();
    if (!cls.length) { alert("لا فصول مسندة"); return; }
    if (cls.length === 1) { cb(cls[0].id); return; }
    openSheet(`<h4>اختر الفصل</h4><div class="stategrid">${cls.map(c => `<button style="background:var(--navy)" data-c="${c.id}">${esc(c.name)}</button>`).join("")}</div>`,
      (o) => o.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { closeSheet(); cb(b.dataset.c); }));
  }
  function liveSession(cid) {
    liveCid = cid; liveDate = new Date().toISOString().slice(0, 10); livePrevTop = null;
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
            <button data-v="yt">📺 يوتيوب</button>
          </div>
          <div class="live-main" id="live-main"></div>
        </div>
        <div class="live-board" id="live-board"></div>
      </div>`;
    $("#live-exit").onclick = () => { if (timerIv) { clearInterval(timerIv); timerIv = null; } stopStory(); try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { } V.classList.add("hidden"); $("#view-app").classList.remove("hidden"); renderReg(); renderToday(); renderGrades(); };
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
    liveView("roster"); drawLiveBoard(true);
  }
  let liveMainView = "roster";
  async function liveView(v) {
    liveMainView = v;
    if (timerIv) { clearInterval(timerIv); timerIv = null; }
    stopStory();
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
  async function stageStory(box, code, wk) {
    let d = null;
    try { const r = await fetch("data/lessons/" + code + "w" + wk + ".json"); if (r.ok) d = await r.json(); } catch (e) { }
    if (!d) { box.innerHTML = `<div class="empty-note" style="color:#c9d5e3">قصة هذا الدرس قيد الإعداد</div>`; return; }
    const scenes = buildStory(d);
    let idx = 0; storyActive = true;
    // هل تتوفّر ملفات صوت سعودي مُسجّلة مسبقاً لهذا الدرس؟
    let audioBase = null;
    try { const h = await fetch("data/lessons/audio/" + code + "w" + wk + "/s0.mp3", { method: "HEAD" }); if (h.ok) audioBase = "data/lessons/audio/" + code + "w" + wk + "/"; } catch (e) { }
    if (!storyAudio) { storyAudio = new Audio(); storyAudio.preload = "auto"; }
    box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">🎬 ${esc(d.title || "")}</span><span id="st-vhint" style="color:#9fb0c4;font-size:12px;margin-inline-start:auto"></span><label style="color:#c9d5e3;font-size:13px;margin-inline-start:10px"><input type="checkbox" id="st-voice" checked> سرد صوتي</label></div>
      <div class="story" id="story-stage">
        <div class="story-dots" id="story-dots"></div>
        <div class="story-visual" id="story-v">🎬</div>
        <div class="story-text" id="story-t">اضغط ▶️ لبدء القصة</div>
        <div class="story-ctrl">
          <button class="live-btn" id="st-prev">⏮ السابق</button>
          <button class="btn-primary" id="st-play" style="min-width:120px">▶️ تشغيل</button>
          <button class="live-btn" id="st-next">التالي ⏭</button>
          <button class="live-btn" id="st-replay">↺ إعادة</button>
        </div>
      </div></div>`;
    const vEl = box.querySelector("#story-v"), tEl = box.querySelector("#story-t"), dotsEl = box.querySelector("#story-dots");
    dotsEl.innerHTML = scenes.map((_, k) => `<span class="story-dot" data-k="${k}"></span>`).join("");
    let playing = false;
    function paint() {
      const sc = scenes[idx];
      vEl.textContent = sc.v || "📘"; vEl.style.animation = "none"; void vEl.offsetWidth; vEl.style.animation = "";
      tEl.textContent = sc.t; tEl.style.animation = "none"; void tEl.offsetWidth; tEl.style.animation = "";
      dotsEl.querySelectorAll(".story-dot").forEach((x, k) => x.classList.toggle("on", k === idx));
    }
    function speakThen(text, cb) {
      const useVoice = box.querySelector("#st-voice") && box.querySelector("#st-voice").checked;
      let done = false;
      const go = () => { if (done) return; done = true; if (storyTimer) { clearTimeout(storyTimer); storyTimer = null; } cb(); };
      try { window.speechSynthesis.cancel(); } catch (e) { }
      if (useVoice && window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "ar-SA"; const v = arVoice(); if (v) u.voice = v;
        u.rate = STORY_RATE; u.pitch = 1;
        let started = false;
        u.onstart = () => { started = true; };
        u.onend = go; u.onerror = go;
        try { window.speechSynthesis.speak(u); } catch (e) { }
        // إن لم يبدأ النطق (لا صوت عربي بالجهاز) تابع بصرياً؛ وإلا ننتظر انتهاء الصوت (سرد متواصل)
        storyTimer = setTimeout(() => { if (!started) go(); }, 1300);
      } else {
        storyTimer = setTimeout(go, Math.max(2400, text.length * 65));
      }
    }
    function narrate(text, sceneIdx, cb) {
      const useVoice = box.querySelector("#st-voice") && box.querySelector("#st-voice").checked;
      if (!useVoice) { storyTimer = setTimeout(cb, Math.max(2200, text.length * 60)); return; }
      if (audioBase) {
        let done = false; const go = () => { if (!done) { done = true; cb(); } };
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { }
        storyAudio.onended = go;
        storyAudio.onerror = () => { audioBase = null; speakThen(text, cb); }; // سقوط لصوت المتصفح
        storyAudio.src = audioBase + "s" + sceneIdx + ".mp3";
        const p = storyAudio.play();
        if (p && p.catch) p.catch(() => { audioBase = null; speakThen(text, cb); });
        // تحميل مسبق للمشهد التالي
        if (sceneIdx + 1 < scenes.length) { try { new Audio(audioBase + "s" + (sceneIdx + 1) + ".mp3"); } catch (e) { } }
      } else speakThen(text, cb);
    }
    function step() {
      if (!storyActive || !playing) return;
      paint();
      narrate(scenes[idx].t, idx, () => {
        if (!playing) return;
        if (idx < scenes.length - 1) { idx++; step(); }
        else { playing = false; box.querySelector("#st-play").textContent = "▶️ تشغيل"; confetti(); }
      });
    }
    function setPlay(p) {
      playing = p; box.querySelector("#st-play").textContent = p ? "⏸ إيقاف" : "▶️ تشغيل";
      if (p) step(); else haltNarr();
    }
    const restart = () => { if (playing) { haltNarr(); step(); } };
    box.querySelector("#st-play").onclick = () => setPlay(!playing);
    box.querySelector("#st-next").onclick = () => { if (idx < scenes.length - 1) { idx++; paint(); restart(); } };
    box.querySelector("#st-prev").onclick = () => { if (idx > 0) { idx--; paint(); restart(); } };
    box.querySelector("#st-replay").onclick = () => { idx = 0; paint(); setPlay(true); };
    dotsEl.querySelectorAll(".story-dot").forEach(x => x.onclick = () => { idx = +x.dataset.k; paint(); restart(); });
    // تلميح مصدر الصوت
    setTimeout(() => {
      const hint = box.querySelector("#st-vhint"); if (!hint) return;
      if (audioBase) { hint.textContent = "🎙️ صوت سعودي احترافي"; return; }
      const v = arVoice();
      if (!v) hint.textContent = "لأفضل نطق عربي افتح الموقع في متصفح Edge";
      else if (/online|natural/i.test(v.name || "")) hint.textContent = "🎙️ صوت طبيعي: " + v.name.replace(/microsoft/i, "").trim();
      else hint.textContent = "الصوت: " + v.name + " — للأنقى استخدم Edge";
    }, 600);
    paint();
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
      box.querySelector("#wh-act").innerHTML = "";
      let ticks = 0, max = 22 + Math.floor(Math.random() * 10);
      const iv = setInterval(() => {
        const i = pool[Math.floor(Math.random() * pool.length)];
        nameEl.textContent = c.students[i].n;
        nameEl.style.transform = "scale(1.05)";
        ticks++;
        if (ticks >= max) {
          clearInterval(iv);
          const win = pool[Math.floor(Math.random() * pool.length)];
          nameEl.textContent = "🎉 " + c.students[win].n;
          nameEl.style.transform = "scale(1.15)";
          confetti();
          box.querySelector("#wh-act").innerHTML = `<button class="btn-gold" id="wh-eval" style="font-size:16px">⭐ قيّم ${esc(c.students[win].n.split(" ")[0])}</button>`;
          box.querySelector("#wh-eval").onclick = () => liveActions(win);
        }
      }, 70 + ticks * 4);
    };
  }
  // بنك أسئلة الدرس (من صلب محتوى الدرس)
  async function lessonQuestions(code, wk) {
    try {
      const r = await fetch("data/lessons/" + code + "w" + wk + ".json"); if (!r.ok) return [];
      const d = await r.json();
      if (d.questions && d.questions.length) return d.questions.map(q => ({ t: q.t || "mcq", q: q.q, opts: q.opts || [], correct: q.correct || 0, ans: q.ans || "" }));
      if (d.checks && d.checks.length) return d.checks.map(c => ({ t: "mcq", q: c.q, opts: c.opts, correct: c.correct }));
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
      if (bank.length) { wsItems = bank.map(q => ({ t: q.t, q: q.q, opts: q.opts || [], correct: q.correct || 0, ans: q.ans || "" })); wsItems._auto = true; wsLoadedFor = key; wsIdx = 0; }
    }
    box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">📝 ورقة الدرس التفاعلية</span>
      <button class="live-btn" id="iws-build" style="margin-inline-start:auto">🛠️ بناء</button>
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
