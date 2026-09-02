/* سجل المتابعة الرقمي — تطبيق الويب (نسخة تجريبية محلية + جاهز للربط السحابي) */
(function () {
  "use strict";
  const D = window.DEMO;
  const META = D.meta;
  const W = META.weights;
  const STATES = META.states;           // 7 حالات حضور
  const BEH = META.behaviors;           // مكتبة السلوك
  const STCOLORS = ["var(--st0)", "var(--st1)", "var(--st2)", "var(--st3)",
    "var(--st4)", "var(--st5)", "var(--st6)"];
  const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const $ = (s) => document.querySelector(s);
  const el = (h) => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ═══ التخزين المحلي ═══ */
  const KEY = "sijil.v1";
  let DB = { recs: {}, session: null };
  try { const raw = localStorage.getItem(KEY); if (raw) DB = JSON.parse(raw); } catch (e) { }
  let saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { } }, 250);
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
    const p = {};
    f.formatToParts(dt || new Date()).forEach(x => p[x.type] = x.value);
    return { d: +p.day, m: +p.month, y: +p.year };
  }
  function hnum(h) { return h.y * 10000 + h.m * 100 + h.d; }
  function parseH(s) { const p = String(s || "").split("/"); return p.length === 3 ? (+p[2]) * 10000 + (+p[1]) * 100 + (+p[0]) : 0; }
  function hijriLabel(dt) {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura",
      { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(dt || new Date());
  }
  const TERM = (META.school.term_lbl || "").includes("الثاني") ? "t2" : "t1";
  function curWeek() {
    const t = hnum(hijriParts());
    let best = 1;
    for (const wk of (META.weeks[TERM] || [])) {
      const a = parseH(wk.from), b = parseH(wk.to);
      if (a && a <= t) best = wk.w;
      if (a && b && a <= t && t <= b) return wk.w;
    }
    return best;
  }

  /* ═══ جلسة ═══ */
  let TE = null; // المعلم الحالي
  function classById(id) { return D.classes.find(c => c.id === id); }
  function myClasses() { return (TE.classes || []).map(classById).filter(Boolean); }

  /* ═══ النقاط ═══ */
  function calcStudent(cid, si) {
    const out = { pts: 0, days: 0, st: STATES.map(() => 0), part: 0, hwY: 0, hwN: 0, sh: 0, behP: 0, behN: 0, notes: [] };
    const cd = DB.recs[cid] || {};
    for (const date of Object.keys(cd)) {
      const e = cd[date][si];
      if (!e) continue;
      out.days++;
      if (e.a != null && STATES[e.a]) { out.st[e.a]++; out.pts += (+STATES[e.a].pts || 0); }
      if (e.part) { out.part += e.part; out.pts += e.part * W.part; }
      if (e.hw === 1) { out.hwY++; out.pts += W.hw; }
      if (e.hw === 0) { out.hwN++; }
      if (e.sh) { out.sh += e.sh; out.pts += e.sh * W.sheets; }
      (e.beh || []).forEach(bi => {
        const b = BEH[bi];
        if (!b) return;
        out.pts += (+b.pts || 0);
        if ((+b.pts || 0) >= 0) out.behP++; else out.behN++;
      });
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

  /* ═══ الدروس ═══ */
  const SUBJ_CODE = [["رقمية", "dg"], ["رياضيات", "ma"], ["عربية", "ar"], ["نجليزية", "en"],
  ["علوم", "sc"], ["إسلامية", "is"], ["قرآن", "qu"], ["اجتماعية", "so"],
  ["فنية", "rt"], ["بدنية", "pe"], ["حياتية", "lf"]];
  function subjCode(subj) { for (const [k, v] of SUBJ_CODE) if ((subj || "").includes(k)) return v; return ""; }
  const currCache = {};
  async function loadCurr(code) {
    if (currCache[code]) return currCache[code];
    try {
      const r = await fetch("data/curr/" + code + ".json");
      if (!r.ok) throw 0;
      currCache[code] = await r.json();
    } catch (e) { currCache[code] = []; }
    return currCache[code];
  }
  function lessonURL(code, w) { return META.lessonsBase + code + "w" + w + ".html"; }

  /* ═══ منبثقات ═══ */
  const OV = $("#overlay-root");
  function openSheet(html, onMount) {
    OV.innerHTML = "";
    const o = el('<div class="overlay"><div class="sheet">' + html + "</div></div>");
    o.addEventListener("click", (e) => { if (e.target === o) closeSheet(); });
    OV.appendChild(o);
    if (onMount) onMount(o);
  }
  function closeSheet() { OV.innerHTML = ""; }

  /* ═══ الدخول ═══ */
  function initLogin() {
    $("#lg-school").textContent = META.school.name;
    const sel = $("#lg-teacher");
    sel.innerHTML = '<option value="">— اختر اسمك —</option>' +
      D.teachers.filter(t => t.classes.length || t.admin)
        .map(t => `<option value="${t.id}">${esc(t.name)}${t.admin ? " (المدير)" : ""}</option>`).join("");
    $("#lg-btn").onclick = () => {
      const tid = sel.value, pin = $("#lg-pin").value.trim();
      const t = D.teachers.find(x => x.id === tid);
      if (!t) { $("#lg-err").textContent = "اختر اسمك من القائمة"; return; }
      if (pin !== "1234") { $("#lg-err").textContent = "رقم الدخول غير صحيح (التجريبي: 1234)"; return; }
      DB.session = tid; save();
      enter(t);
    };
  }
  function enter(t) {
    TE = t;
    $("#view-login").classList.add("hidden");
    $("#view-app").classList.remove("hidden");
    $("#ab-who").textContent = t.name + " — " + (t.admin ? "مدير المدرسة" : t.subject);
    renderToday(); renderReg(); renderRep(); renderMore();
    switchTab("today");
  }
  $("#ab-logout").onclick = () => { DB.session = null; save(); location.reload(); };

  /* ═══ التبويبات ═══ */
  function switchTab(name) {
    document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
    ["today", "reg", "rep", "more"].forEach(n => $("#tab-" + n).classList.toggle("hidden", n !== name));
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => switchTab(b.dataset.tab));

  /* ═══ لوحة اليوم ═══ */
  async function renderToday() {
    const box = $("#tab-today");
    const wk = curWeek();
    const today = DAYS[new Date().getDay()];
    const mine = D.schedule.filter(r => r.t === TE.name && r.d === today).sort((a, b) => a.p - b.p);
    const per = [];
    for (let p = 1; p <= 7; p++) {
      const s = mine.find(x => x.p === p);
      per.push(`<div class="period ${s ? "" : "empty"}"><span class="p">ح${p}</span><div class="c">${s ? esc(classById(s.c).name) : "—"}</div></div>`);
    }
    // إجمالي طلابي وأدناهم نقاطاً
    let all = [];
    myClasses().forEach(c => { classCalc(c.id).forEach(r => all.push({ c, r })); });
    const low = all.slice().sort((a, b) => a.r.t.pts - b.r.t.pts).slice(0, 5);
    box.innerHTML = `
      <div class="card" style="background:linear-gradient(150deg,var(--navy),var(--navy2));color:#fff;border:none">
        <div style="font-size:13px;color:#c9d5e3">${esc(hijriLabel())}</div>
        <div style="font-size:19px;font-weight:800;color:var(--goldl);margin-top:2px">أهلاً أ. ${esc(TE.name.split(" ")[0])} 👋</div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="v">${myClasses().length}</div><div class="l">فصولي</div></div>
        <div class="kpi"><div class="v">${all.length}</div><div class="l">طلابي</div></div>
        <div class="kpi"><div class="v">${mine.length}</div><div class="l">حصص اليوم</div></div>
      </div>
      <div class="card"><h3><span class="dot"></span>حصص اليوم (${esc(today)})</h3>
        <div class="periods">${per.join("")}</div></div>
      <div class="card" id="today-lesson"><h3><span class="dot"></span>درس هذا الأسبوع</h3>
        <span class="weekpill">الأسبوع ${wk}</span><div class="empty-note" style="padding:8px">جارِ التحميل…</div></div>
      <div class="card"><h3><span class="dot"></span>طلاب يحتاجون التفاتة (الأدنى نقاطاً)</h3>
        <div class="alert-list">${low.length ? low.map(x => `
          <div class="al"><span>${esc(x.r.s.n)} <small style="color:var(--muted)">— ${esc(x.c.name)}</small></span>
          <span class="pts">${x.r.t.pts}</span></div>`).join("") :
        '<div class="empty-note">ابدأ التحضير أولاً وستظهر القائمة هنا</div>'}</div></div>`;
    // درس الأسبوع لكل صف من صفوف المعلم
    const sc = subjCode(TE.subject);
    const grades = [...new Set(myClasses().map(c => c.gc))].sort();
    const LB = $("#today-lesson");
    if (!sc || !grades.length) {
      LB.querySelector(".empty-note").textContent = TE.admin ? "لوحة المدير في تبويب «المزيد»" : "لا مادة مسندة";
      return;
    }
    let html = `<span class="weekpill">الأسبوع ${wk} — ${esc(TE.subject)}</span>`;
    for (const g of grades) {
      const code = sc + g + TERM;
      const rows = (await loadCurr(code)).filter(r => r.w === wk);
      const main = rows.find(r => r.lesson && !String(r.lesson).includes("تابع")) || rows[0];
      const nm = main ? main.lesson : "—";
      const off = !main || String(nm).includes("إجازة");
      html += `<div class="lesson-line" style="margin-top:9px">
        <span class="nm">الصف ${["", "", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"][g]}: ${esc(nm)}</span>
        ${off ? "" : `<a class="btn-gold" target="_blank" rel="noopener" href="${lessonURL(code, wk)}">🚀 افتح الدرس التفاعلي</a>`}</div>`;
    }
    LB.innerHTML = `<h3><span class="dot"></span>درس هذا الأسبوع</h3>` + html;
  }

  /* ═══ التحضير ═══ */
  let regClass = null, regDate = new Date().toISOString().slice(0, 10);
  function renderReg() {
    const box = $("#tab-reg");
    const cls = myClasses();
    if (!cls.length) { box.innerHTML = '<div class="empty-note">لا فصول مسندة لك' + (TE.admin ? " — لوحة المدير في «المزيد»" : "") + "</div>"; return; }
    if (!regClass || !cls.find(c => c.id === regClass)) regClass = cls[0].id;
    box.innerHTML = `
      <div class="class-chips">${cls.map(c => `<button class="chip ${c.id === regClass ? "on" : ""}" data-c="${c.id}">${esc(c.name)}</button>`).join("")}</div>
      <div class="reg-tools">
        <input type="date" id="reg-date" value="${regDate}">
        <button class="btn-soft" id="reg-all">✓ الكل حاضر</button>
        <span style="font-size:12px;color:var(--muted)" id="reg-hint"></span>
      </div>
      <div class="card" id="reg-list" style="padding:6px 10px"></div>`;
    box.querySelectorAll(".chip").forEach(ch => ch.onclick = () => { regClass = ch.dataset.c; renderReg(); });
    $("#reg-date").onchange = (e) => { regDate = e.target.value; drawRows(); };
    $("#reg-all").onclick = () => {
      const c = classById(regClass);
      c.students.forEach((s, i) => { const e = rec(regClass, regDate, i, true); if (e.a == null) e.a = 0; });
      save(); drawRows(); renderToday();
    };
    drawRows();
  }
  function drawRows() {
    const c = classById(regClass);
    const list = $("#reg-list");
    const calc = classCalc(regClass);
    list.innerHTML = c.students.map((s, i) => {
      const e = rec(regClass, regDate, i, false) || {};
      const st = e.a != null ? STATES[e.a] : null;
      const t = calc[i].t;
      return `<div class="stu" data-i="${i}">
        <span class="num">${i + 1}</span>
        <span class="nm" data-act="card">${esc(s.n)}<small>الترتيب ${calc[i].rank} من ${c.students.length}</small></span>
        <button class="statepill" data-act="state" style="${st ? "background:" + STCOLORS[e.a] : ""}">${st ? esc(st.name) : "الحالة"}</button>
        <button class="mini ${e.part ? "on" : ""}" data-act="part" title="مشاركة">🙋${e.part ? `<span class="b">${e.part}</span>` : ""}</button>
        <button class="mini ${e.hw != null ? "on" : ""}" data-act="hw" title="واجب">${e.hw === 1 ? "✅" : e.hw === 0 ? "❌" : "📚"}</button>
        <button class="mini ${(e.beh || []).length ? "on" : ""}" data-act="beh" title="سلوك">⭐${(e.beh || []).length ? `<span class="b">${e.beh.length}</span>` : ""}</button>
        <span class="pts ${t.pts < 0 ? "neg" : ""}">${t.pts}</span>
      </div>`;
    }).join("");
    $("#reg-hint").textContent = "اضغط اسم الطالب لبطاقته";
    list.querySelectorAll(".stu").forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll("[data-act]").forEach(b => b.onclick = () => act(b.dataset.act, i));
    });
  }
  function act(what, i) {
    const e = rec(regClass, regDate, i, true);
    if (what === "part") { e.part = (e.part + 1) % 6; save(); drawRows(); }
    else if (what === "hw") { e.hw = e.hw === null ? 1 : e.hw === 1 ? 0 : null; save(); drawRows(); }
    else if (what === "state") stateSheet(i, e);
    else if (what === "beh") behSheet(i, e);
    else if (what === "card") studentCard(regClass, i);
  }
  function stateSheet(i, e) {
    const c = classById(regClass);
    openSheet(`<h4>${esc(c.students[i].n)} — حالة الحضور</h4>
      <div class="stategrid">${STATES.map((s, k) =>
      `<button style="background:${STCOLORS[k]}" data-k="${k}">${esc(s.name)} <small>(${s.pts >= 0 ? "+" : ""}${s.pts})</small></button>`).join("")}
      <button style="background:#c9cfd6" data-k="-1">مسح الحالة</button></div>`,
      (o) => o.querySelectorAll("[data-k]").forEach(b => b.onclick = () => {
        const k = +b.dataset.k;
        e.a = k < 0 ? null : k;
        save(); closeSheet(); drawRows(); renderToday();
      }));
  }
  function behSheet(i, e) {
    const c = classById(regClass);
    const sel = new Set(e.beh || []);
    openSheet(`<h4>${esc(c.students[i].n)} — السلوك والتقييم</h4>
      <div class="behgrid">${BEH.map((b, k) =>
      `<button data-k="${k}" class="${sel.has(k) ? "sel" : ""}">${esc(b.name)}
       <span class="p ${b.pts >= 0 ? "pos" : "neg"}">${b.pts >= 0 ? "+" : ""}${b.pts}</span></button>`).join("")}</div>
      <textarea class="note" id="bh-note" rows="2" placeholder="ملاحظة (اختياري)…">${esc(e.note || "")}</textarea>
      <div class="sheet-actions"><button class="btn-plain" id="bh-x">إغلاق</button>
      <button class="btn-primary" id="bh-ok">حفظ</button></div>`,
      (o) => {
        o.querySelectorAll("[data-k]").forEach(b => b.onclick = () => {
          const k = +b.dataset.k;
          if (sel.has(k)) sel.delete(k); else sel.add(k);
          b.classList.toggle("sel");
        });
        o.querySelector("#bh-x").onclick = closeSheet;
        o.querySelector("#bh-ok").onclick = () => {
          e.beh = [...sel]; e.note = o.querySelector("#bh-note").value.trim();
          save(); closeSheet(); drawRows(); renderToday();
        };
      });
  }

  /* ═══ بطاقة الطالب ═══ */
  function studentCard(cid, i) {
    const c = classById(cid);
    const s = c.students[i];
    const calc = classCalc(cid);
    const t = calc[i].t, rank = calc[i].rank;
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🎖️";
    const behAgg = {};
    Object.values(DB.recs[cid] || {}).forEach(day => {
      const e = day[i]; if (!e) return;
      (e.beh || []).forEach(bi => { behAgg[bi] = (behAgg[bi] || 0) + 1; });
    });
    const waTxt = encodeURIComponent(
      `السلام عليكم ورحمة الله\nولي أمر الطالب: ${s.n} — ${c.name}\n` +
      `تقرير مختصر من معلم ${TE.subject}:\n` +
      `النقاط: ${t.pts} | الترتيب: ${rank} من ${c.students.length}\n` +
      STATES.map((st, k) => t.st[k] ? `${st.name}: ${t.st[k]}` : "").filter(Boolean).join(" | ") +
      `\nالمشاركة: ${t.part} | الواجبات: ${t.hwY}\n${META.school.name}`);
    const phone = (s.p || "").replace(/\D/g, "").replace(/^0/, "966");
    openSheet(`
      <div class="stu-head"><div style="font-size:34px">${medal}</div>
        <div class="big">${esc(s.n)}</div>
        <div class="sub">${esc(c.name)} — الترتيب ${rank} من ${c.students.length}</div></div>
      <div class="statrow">
        <div class="stat"><div class="v">${t.pts}</div><div class="l">النقاط</div></div>
        <div class="stat"><div class="v">${t.part}</div><div class="l">مشاركة</div></div>
        <div class="stat"><div class="v">${t.hwY}</div><div class="l">واجبات ✓</div></div>
        <div class="stat"><div class="v">${t.days}</div><div class="l">أيام مرصودة</div></div>
      </div>
      <div class="countchips">${STATES.map((st, k) => t.st[k] ?
        `<span class="cc" style="background:${STCOLORS[k]}">${esc(st.name)} ${t.st[k]}</span>` : "").filter(Boolean).join("") || '<span style="color:var(--muted);font-size:13px">لا حضور مرصود بعد</span>'}</div>
      <div class="countchips">${Object.keys(behAgg).map(bi =>
          `<span class="cc" style="background:${BEH[bi].pts >= 0 ? "var(--ok)" : "var(--bad)"}">${esc(BEH[bi].name)} ×${behAgg[bi]}</span>`).join("")}</div>
      ${t.notes.length ? `<div style="font-size:13px;color:var(--muted)"><b>ملاحظات:</b> ${t.notes.map(n => esc(n.note)).join(" • ")}</div>` : ""}
      <a class="wa-btn ${phone ? "" : "off"}" target="_blank" rel="noopener"
         href="https://wa.me/${phone}?text=${waTxt}">💬 واتساب ولي الأمر${phone ? "" : " (لا رقم في النسخة التجريبية)"}</a>
      <div class="sheet-actions"><button class="btn-plain" onclick="document.querySelector('#overlay-root').innerHTML=''">إغلاق</button></div>`);
  }

  /* ═══ التقارير ═══ */
  let repClass = null;
  function renderRep() {
    const box = $("#tab-rep");
    const cls = myClasses();
    if (!cls.length) { box.innerHTML = '<div class="empty-note">لا فصول مسندة</div>'; return; }
    if (!repClass || !cls.find(c => c.id === repClass)) repClass = cls[0].id;
    const c = classById(repClass);
    const rows = classCalc(repClass);
    const tot = { st: STATES.map(() => 0), part: 0, hwY: 0, behP: 0, behN: 0 };
    rows.forEach(r => { STATES.forEach((s, k) => tot.st[k] += r.t.st[k]); tot.part += r.t.part; tot.hwY += r.t.hwY; tot.behP += r.t.behP; tot.behN += r.t.behN; });
    box.innerHTML = `
      <div class="class-chips no-print">${cls.map(x => `<button class="chip ${x.id === repClass ? "on" : ""}" data-c="${x.id}">${esc(x.name)}</button>`).join("")}</div>
      <div class="card">
        <div class="rep-head"><div class="rt">سجل متابعة الفصل — ${esc(c.name)}</div>
          <div class="rs">${esc(META.school.name)} — معلم المادة: ${esc(TE.name)} — ${esc(hijriLabel())}</div></div>
        <h3 class="no-print"><span class="dot"></span>كشف متابعة ${esc(c.name)}
          <button class="btn-gold" style="margin-inline-start:auto" id="rep-print">🖨️ طباعة / PDF</button></h3>
        <div class="table-scroll"><table class="report-table">
          <tr><th>م</th><th style="min-width:130px">اسم الطالب</th>${STATES.map(s => `<th>${esc(s.name)}</th>`).join("")}
              <th>مشاركة</th><th>واجبات</th><th>سلوك+</th><th>سلوك−</th><th>النقاط</th><th>الترتيب</th></tr>
          ${rows.map((r, i) => `<tr><td>${i + 1}</td><td class="nm">${esc(r.s.n)}</td>
            ${STATES.map((s, k) => `<td>${r.t.st[k] || ""}</td>`).join("")}
            <td>${r.t.part || ""}</td><td>${r.t.hwY || ""}</td><td>${r.t.behP || ""}</td><td>${r.t.behN || ""}</td>
            <td><b>${r.t.pts}</b></td><td>${r.rank}</td></tr>`).join("")}
          <tr class="tot"><td></td><td class="nm">المجموع</td>${STATES.map((s, k) => `<td>${tot.st[k] || ""}</td>`).join("")}
            <td>${tot.part || ""}</td><td>${tot.hwY || ""}</td><td>${tot.behP || ""}</td><td>${tot.behN || ""}</td><td></td><td></td></tr>
        </table></div></div>`;
    box.querySelectorAll(".chip").forEach(ch => ch.onclick = () => { repClass = ch.dataset.c; renderRep(); });
    $("#rep-print").onclick = () => window.print();
  }

  /* ═══ المزيد ═══ */
  function renderMore() {
    const box = $("#tab-more");
    let adminHtml = "";
    if (TE.admin) {
      adminHtml = `<div class="card"><h3><span class="dot"></span>لوحة المدير — المعلمون (${D.teachers.filter(t => t.classes.length).length})</h3>
        ${D.teachers.filter(t => t.classes.length).map(t => `
          <div class="admin-row"><span>${esc(t.name)}<div class="cls">${esc(t.subject)}</div></span>
          <span class="cls">${t.classes.length} فصول</span></div>`).join("")}
        <div class="empty-note" style="padding:12px">في النسخة السحابية يرى المدير رصد جميع المعلمين لحظياً هنا</div></div>`;
    }
    box.innerHTML = adminHtml + `
      <div class="card"><h3><span class="dot"></span>النسخة الاحتياطية</h3>
        <div style="display:flex;gap:8px">
          <button class="btn-gold" id="bk-out" style="flex:1;text-align:center">⬇️ تصدير بياناتي</button>
          <button class="btn-gold" id="bk-in" style="flex:1;text-align:center">⬆️ استعادة نسخة</button>
          <input type="file" id="bk-file" accept=".json" class="hidden">
        </div>
        <div class="empty-note" style="padding:10px 4px 0">ملف JSON يمكن حفظه أو إرساله واتساب ثم استعادته على أي جهاز</div></div>
      <div class="card"><h3><span class="dot"></span>مكتبة التقييمات</h3>
        <div class="countchips">${STATES.map((s, k) => `<span class="cc" style="background:${STCOLORS[k]}">${esc(s.name)} ${s.pts >= 0 ? "+" : ""}${s.pts}</span>`).join("")}</div>
        <div class="countchips">${BEH.map(b => `<span class="cc" style="background:${b.pts >= 0 ? "var(--ok)" : "var(--bad)"}">${esc(b.name)} ${b.pts >= 0 ? "+" : ""}${b.pts}</span>`).join("")}</div></div>
      <div class="card"><h3><span class="dot"></span>عن البرنامج</h3>
        <div style="font-size:13.5px;line-height:2;color:var(--muted)">
        سجل المتابعة الرقمي — نسخة الويب التجريبية.<br>
        يعمل على أي جهاز: جوال، تابلت (هواوي وغيره)، وكمبيوتر.<br>
        هذه النسخة تحفظ البيانات على جهازك؛ النسخة السحابية المشتركة قيد الإعداد.<br>
        <b>المطوّر:</b> أ. ضيف الله أحمد محمد مشني — ${esc(META.school.name)}</div></div>`;
    $("#bk-out").onclick = () => {
      const blob = new Blob([JSON.stringify({ v: 1, teacher: TE.id, recs: DB.recs })], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "نسخة سجل المتابعة - " + TE.name + ".json";
      a.click();
    };
    $("#bk-in").onclick = () => $("#bk-file").click();
    $("#bk-file").onchange = (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const j = JSON.parse(rd.result);
          if (!j.recs) throw 0;
          DB.recs = j.recs; save();
          renderToday(); renderReg(); renderRep();
          alert("تمت الاستعادة بنجاح ✓");
        } catch (e) { alert("ملف غير صالح"); }
      };
      rd.readAsText(f);
    };
  }

  /* ═══ إقلاع ═══ */
  initLogin();
  if (DB.session) {
    const t = D.teachers.find(x => x.id === DB.session);
    if (t) enter(t);
  }
})();
