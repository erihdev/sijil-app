/* ═══════════ لوحة المدير — وحدة 🗓️ الجدول العام (js/admin/schedule.js) ═══════════
   محرّر الجدول المدرسي: عرضان (حسب الفصل / حسب المعلم)، تحرير الخلية بقائمة منبثقة (معلم/فصل أو تفريغ)،
   كشف التعارض الفوري بأنواعه الثلاثة: (1) المعلم مشغول في فصل آخر (2) الفصل مشغول أصلاً (3) تجاوز النصاب 24 (تحذير فقط)،
   مع اسم المتعارض وخيار «استبدال» أو «إلغاء»، عدّاد تعارضات (= 0 شرط للحفظ)، تلوين الخلايا المعدَّلة قبل الحفظ،
   حفظ schedule/all كاملاً {rows:[{t,d,p,c}], tn, ts} مع تحديث D.schedule فوراً وتسجيل adminlog،
   طباعة الجدول العام / جدول فصل / جدول معلم عبر SIJIL.printDoc (أفقي، صفحة واحدة)، وإرسال جدول المعلم واتساب نصاً.
   الأيام تُشتق من SIJIL.DAYS[0..4] (نفس أسماء D.schedule)، والحصص 1..7 (وتتوسّع تلقائياً إن وُجدت حصة أكبر في البيانات).
   يعتمد على window.SIJIL (app.js) و window.SIJIL_ADMIN (core.js). لا يلمس ملفات الوحدات الأخرى. */
(function () {
  "use strict";
  const S = () => window.SIJIL, A = () => window.SIJIL_ADMIN;
  const QUOTA = 24;                                                            // النصاب الافتراضي (حصة/أسبوع) — تحذير فقط
  // أيام الدراسة: أول خمسة من SIJIL.DAYS (الأحد…الخميس) — نفس النص المخزَّن في D.schedule[].d
  const DAYS = (function () { try { const d = S().DAYS; if (Array.isArray(d) && d.length >= 5) return d.slice(0, 5); } catch (e) { } return ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"]; })();
  let PER = [1, 2, 3, 4, 5, 6, 7];                                             // الحصص المعروضة (تتوسّع إن حوى الجدول حصة أكبر)
  const esc = (s) => S().esc(s == null ? "" : String(s));
  const $ = (q, root) => (root || document).querySelector(q);
  const warn = (...a) => { try { console.warn("[admin/schedule]", ...a); } catch (e) { } };

  /* ═══ الحالة ═══ */
  let work = null, orig = null, extra = [];   // نسخة العمل + لقطة الأصل (لتلوين المعدَّل) + صفوف خارج الشبكة تُحفظ كما هي
  let mode = "class", sel = "";               // "class" | "teacher" — sel: cid أو اسم المعلم
  let box = null, saving = false;

  const rowsNow = () => (S().D && Array.isArray(S().D.schedule)) ? S().D.schedule : [];
  const normRow = (r) => ({ t: String((r && r.t) || "").trim(), d: String((r && r.d) || "").trim(), p: Number(r && r.p) || 0, c: String((r && r.c) || "").trim() });
  const inGrid = (r) => DAYS.indexOf(r.d) >= 0 && PER.indexOf(r.p) >= 0;
  function load(force) {
    if (work && !force) return;
    const all = rowsNow().map(normRow).filter(r => r.t && r.c && r.d && r.p > 0);
    let mx = 7; all.forEach(r => { if (r.p > mx && r.p <= 12) mx = r.p; });     // لا نُسقط حصة موجودة في البيانات
    PER = []; for (let p = 1; p <= mx; p++) PER.push(p);
    const seen = {}, uniq = [];
    all.forEach(r => { const k = r.t + "|" + r.d + "|" + r.p + "|" + r.c; if (seen[k]) return; seen[k] = 1; uniq.push(r); });
    extra = uniq.filter(r => !inGrid(r));                                      // أيام خارج أيام الدراسة (الجمعة/السبت) — تُحفظ كما هي بلا تحرير
    orig = uniq.filter(inGrid);
    work = orig.map(r => ({ t: r.t, d: r.d, p: r.p, c: r.c }));
  }

  /* ═══ مساعدات المدرسة ═══ */
  const classes = () => A().sortedClasses();
  const clsName = (cid) => { const c = S().classById(cid); return c ? c.name : cid; };
  const teachers = () => (S().D.teachers || []).filter(t => !t.admin && t.name);
  const teacherByName = (n) => (S().D.teachers || []).find(t => t.name === n) || null;
  const subjOf = (name) => { const t = teacherByName(name); return t ? (t.subject || "") : ""; };
  const shortName = (n) => String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  // كل الأسماء المتاحة للاختيار: معلمو المدرسة + أي اسم موجود في الجدول ولو لم يعد في قائمة المعلمين
  function teacherOpts() {
    const known = teachers().map(t => t.name), extraN = [];
    (work || []).concat(extra).forEach(r => { if (known.indexOf(r.t) < 0 && extraN.indexOf(r.t) < 0) extraN.push(r.t); });
    return known.concat(extraN);
  }

  /* ═══ استعلامات على نسخة العمل ═══ */
  const cellC = (d, p, c, rows) => (rows || work).find(r => r.d === d && r.p === p && r.c === c) || null;
  const cellT = (t, d, p, rows) => (rows || work).find(r => r.t === t && r.d === d && r.p === p) || null;
  const loadOf = (t, rows) => (rows || work).filter(r => r.t === t).length;
  function setClassCell(d, p, c, t) {           // t فارغ = تفريغ
    work = work.filter(r => !(r.d === d && r.p === p && r.c === c));
    if (t) work.push({ t: t, d: d, p: p, c: c });
  }
  function setTeacherCell(t, d, p, c) {         // c فارغ = تفريغ
    work = work.filter(r => !(r.t === t && r.d === d && r.p === p));
    if (c) work.push({ t: t, d: d, p: p, c: c });
  }
  // كل تعارضات نسخة العمل: hard (المعلم في فصلين / الفصل مع معلمين) + quota (تحذير فقط)
  function conflicts(rows) {
    rows = rows || work || [];
    const byT = {}, byC = {}, hard = [], quota = [], cnt = {};
    rows.forEach(r => {
      const a = r.t + "|" + r.d + "|" + r.p, b = r.c + "|" + r.d + "|" + r.p;
      (byT[a] = byT[a] || []).push(r); (byC[b] = byC[b] || []).push(r); cnt[r.t] = (cnt[r.t] || 0) + 1;
    });
    Object.keys(byT).forEach(k => { const g = byT[k]; if (g.length > 1) hard.push({ kind: "teacher", rows: g, msg: `المعلم <b>${esc(g[0].t)}</b> في ${g.map(r => esc(clsName(r.c))).join(" و")} معاً — ${esc(g[0].d)} ح${g[0].p}` }); });
    Object.keys(byC).forEach(k => { const g = byC[k]; if (g.length > 1) hard.push({ kind: "class", rows: g, msg: `الفصل <b>${esc(clsName(g[0].c))}</b> لديه ${g.length} معلمين — ${esc(g[0].d)} ح${g[0].p}: ${g.map(r => esc(shortName(r.t))).join("، ")}` }); });
    Object.keys(cnt).forEach(t => { if (cnt[t] > QUOTA) quota.push({ t: t, n: cnt[t] }); });
    return { hard: hard, quota: quota };
  }
  const conflictRows = (cf) => { const s = new Set(); cf.hard.forEach(h => h.rows.forEach(r => s.add(r))); return s; };
  // عدد الخلايا المعدَّلة: مفتاح الخلية يوم|حصة|فصل، والقيمة اسم المعلم
  function changeCount() {
    const o = {}, w = {}, s = {};
    orig.forEach(r => o[r.d + "|" + r.p + "|" + r.c] = r.t);
    work.forEach(r => w[r.d + "|" + r.p + "|" + r.c] = r.t);
    Object.keys(o).forEach(k => { if (w[k] !== o[k]) s[k] = 1; });
    Object.keys(w).forEach(k => { if (o[k] !== w[k]) s[k] = 1; });
    return Object.keys(s).length;
  }
  // هل تغيّرت خلية العرض الحالي؟ (تلوين أخضر قبل الحفظ)
  function cellModified(d, p) {
    if (mode === "class") { const a = cellC(d, p, sel, orig), b = cellC(d, p, sel, work); return (a ? a.t : "") !== (b ? b.t : ""); }
    const a = cellT(sel, d, p, orig), b = cellT(sel, d, p, work); return (a ? a.c : "") !== (b ? b.c : "");
  }
  // فحص فوري قبل التطبيق: التعارضات الصلبة التي سيسببها هذا الاختيار + تحذير النصاب
  function check(t, d, p, c) {
    const out = { hard: [], quota: null };
    if (!t || !c) return out;
    const busyT = cellT(t, d, p);
    if (busyT && busyT.c !== c) out.hard.push({ kind: "teacher", row: busyT, msg: `المعلم <b>${esc(t)}</b> عنده حصة في <b>${esc(clsName(busyT.c))}</b> في نفس اليوم والحصة (${esc(d)} ح${p})` });
    const busyC = cellC(d, p, c);
    if (busyC && busyC.t !== t) out.hard.push({ kind: "class", row: busyC, msg: `الفصل <b>${esc(clsName(c))}</b> مشغول أصلاً مع <b>${esc(busyC.t)}</b>${subjOf(busyC.t) ? " (" + esc(subjOf(busyC.t)) + ")" : ""} — ${esc(d)} ح${p}` });
    const n = loadOf(t) - (busyT ? 1 : 0) + 1;
    if (n > QUOTA) out.quota = { t: t, n: n };
    return out;
  }

  /* ═══ CSS للوحدة (يُحقن مرة واحدة) ═══ */
  function css() {
    if ($("#adm-sched-css")) return;
    const st = document.createElement("style"); st.id = "adm-sched-css";
    st.textContent = `
.sch-grid{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;background:#fff;min-width:560px}
.sch-grid th{background:var(--navy);color:var(--goldl);padding:7px 4px;font-size:11.5px}
.sch-grid th.day,.sch-grid td.day{position:sticky;right:0;z-index:2;background:var(--navy);color:var(--goldl);font-weight:800;white-space:nowrap;text-align:right;padding:6px 8px;min-width:64px}
.sch-grid td.day{background:#f3efe4;color:var(--navy);border-bottom:1px solid var(--line)}
.sch-grid td.cell{border:1px solid var(--line);padding:0;min-width:74px;height:48px;text-align:center;vertical-align:middle;cursor:pointer;transition:background .15s;position:relative}
.sch-grid td.cell:hover{background:#fdf6e3}
.sch-grid td.cell .t{font-weight:800;color:var(--navy);font-size:12px;line-height:1.3;display:block;padding:4px 3px 0}
.sch-grid td.cell .s{display:block;font-size:10.5px;color:var(--muted);line-height:1.3;padding:0 3px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;margin:0 auto}
.sch-grid td.cell.free .t{color:#c9c2b3;font-weight:400}
.sch-grid td.cell.mod{background:#eaf6ee;box-shadow:inset 0 0 0 2px var(--ok)}
.sch-grid td.cell.conf{background:#fff0f0;box-shadow:inset 0 0 0 2px var(--bad)}
.sch-grid td.cell.conf .t{color:var(--bad)}
.sch-grid td.cell.now{outline:2px dashed var(--gold);outline-offset:-3px}
.sch-badge{display:inline-flex;align-items:center;gap:5px;border-radius:20px;padding:6px 12px;font-weight:800;font-size:13px;background:#eef8f0;color:var(--ok);border:1.5px solid #c6e6cf;white-space:nowrap}
.sch-badge.bad{background:#fff0f0;color:var(--bad);border-color:#f3c2c2}
.sch-badge.warn{background:#fff8e6;color:#8a6d1c;border-color:#f0d9a0}
.sch-badge.off{background:#eef0f3;color:var(--muted);border-color:var(--line)}
.sch-tools .btn-gold,.sch-tools .btn-plain,.sch-tools .btn-primary{flex:0 0 auto;width:auto;padding:9px 13px;font-size:13.5px;border-radius:10px}
.sch-tools .btn-primary{font-size:14px}
.sch-tools .btn-primary[disabled],.sch-tools .btn-plain[disabled]{opacity:.45;cursor:not-allowed}
.sch-pick{display:flex;flex-direction:column;gap:6px;max-height:46vh;overflow:auto;padding:2px}
.sch-pick .grp{font-size:12px;font-weight:800;color:var(--muted);margin:6px 2px 0}
.sch-pick button{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:right;background:#fff;border:1.5px solid var(--line);border-radius:12px;padding:10px 12px;font-family:inherit;font-size:14px;color:var(--navy);cursor:pointer}
.sch-pick button:hover{border-color:var(--gold);background:#fdf6e3}
.sch-pick button.cur{border-color:var(--navy);background:#f3efe4}
.sch-pick button.clear{color:var(--bad);border-style:dashed;justify-content:center}
.sch-pick button small{color:var(--muted);font-size:12px;display:block;font-weight:400}
.sch-pick button .ld{background:#eef0f3;border-radius:14px;padding:2px 8px;font-size:11.5px;font-weight:800;color:var(--navy);white-space:nowrap}
.sch-pick button .ld.over{background:#fff0f0;color:var(--bad)}
.sch-conf{background:#fff0f0;border:1.5px solid #f3c2c2;color:#8a1f1f;border-radius:12px;padding:10px 12px;margin:10px 0 4px;font-size:13.5px;line-height:1.9}
.sch-conf.warn{background:#fff8e6;border-color:#f0d9a0;color:#7a5a0d}
.sch-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:8px}
.sch-legend i{display:inline-block;width:14px;height:14px;border-radius:4px;vertical-align:middle;margin-left:4px;border:1px solid var(--line)}
.sch-sum{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.sch-sum .it{background:#f7f4ec;border:1px solid var(--line);border-radius:12px;padding:7px 11px;font-size:12.5px;color:var(--navy)}
.sch-sum .it.over{background:#fff0f0;border-color:#f3c2c2;color:var(--bad)}
.sch-sel{max-width:100%;min-width:170px}
.sch-wa{background:#f7f4ec;border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.9;white-space:pre-wrap;max-height:38vh;overflow:auto;text-align:right}
@media(max-width:520px){.sch-grid{min-width:520px}.sch-grid td.cell{min-width:66px;height:44px}.sch-grid td.cell .s{max-width:74px}.sch-sel{min-width:140px}}
@media print{.sch-tools,.sch-legend{display:none!important}}`;
    document.head.appendChild(st);
  }

  /* ═══ الرسم الرئيسي ═══ */
  function render(b) {
    box = b; css(); load();
    const H = A().H, cls = classes(), tOpts = teacherOpts();
    if (!cls.length) { box.innerHTML = H.card("🗓️ الجدول العام", H.empty("لا فصول في المدرسة بعد")); return; }
    if (mode === "class" && !cls.some(c => c.id === sel)) sel = cls[0].id;
    if (mode === "teacher" && tOpts.indexOf(sel) < 0) sel = tOpts[0] || "";
    const cf = conflicts();
    const opts = mode === "class"
      ? cls.map(c => `<option value="${esc(c.id)}"${c.id === sel ? " selected" : ""}>${esc(c.name)}</option>`).join("")
      : tOpts.map(n => `<option value="${esc(n)}"${n === sel ? " selected" : ""}>${esc(n)}${subjOf(n) ? " — " + esc(subjOf(n)) : ""}</option>`).join("");
    box.innerHTML = H.card("🗓️ الجدول العام — محرّر الجدول المدرسي", `
      ${H.chips([{ k: "class", t: "🏫 حسب الفصل" }, { k: "teacher", t: "👨‍🏫 حسب المعلم" }], mode, "mode")}
      <div class="adm-tools sch-tools">
        <select id="sch-sel" class="sch-sel" aria-label="${mode === "class" ? "اختر الفصل" : "اختر المعلم"}">${opts}</select>
        <span class="sch-badge" id="sch-cf">✅ لا تعارضات</span>
        <span class="sch-badge warn" id="sch-q" style="display:none">⚠️ 0 فوق النصاب</span>
        <span class="sch-badge off" id="sch-mod">✏️ 0 خلية معدَّلة</span>
      </div>
      <div id="sch-msg"></div>
      <div id="sch-grid"></div>
      <div class="sch-legend"><span><i style="background:#eaf6ee;border-color:var(--ok)"></i>معدَّل (غير محفوظ)</span><span><i style="background:#fff0f0;border-color:var(--bad)"></i>تعارض</span><span><i style="background:#fff;border:2px dashed var(--gold)"></i>الحصة الحالية</span><span>انقر أي خلية لتغييرها</span></div>
      <div id="sch-sum"></div>
      <div class="adm-tools sch-tools" style="margin-top:12px">
        <button class="btn-primary" id="sch-save">💾 حفظ الجدول</button>
        <button class="btn-plain" id="sch-undo">↩️ تراجع عن التعديلات</button>
        ${mode === "teacher" ? `<button class="btn-plain" id="sch-auto" style="flex:0 0 auto">🪄 توزيع تلقائي لبقية الحصص</button>` : ""}
      </div>
      <div class="adm-tools sch-tools">
        <button class="btn-gold" id="sch-print-all">🖨️ طباعة الجدول العام</button>
        <button class="btn-gold" id="sch-print-one">🖨️ طباعة ${mode === "class" ? "جدول الفصل" : "جدول المعلم"}</button>
        ${mode === "teacher" ? `<button class="btn-gold" id="sch-wa">💬 إرسال جدول المعلم واتساب</button>` : ""}
      </div>
      <div class="empty-note" id="sch-tot" style="padding:6px 4px;text-align:right;min-height:0;font-size:12px">${work.length + extra.length} حصة في الجدول · ${DAYS.length} أيام × ${PER.length} حصص · النصاب ${QUOTA} حصة${extra.length ? ` · ${extra.length} حصة خارج أيام الدراسة تُحفظ كما هي` : ""}</div>`, 'id="sch-card"');
    H.bindChips(box, (k) => { mode = k; sel = ""; render(box); }, "mode");
    $("#sch-sel", box).onchange = (e) => { sel = e.target.value; drawGrid(); drawSummary(); };
    $("#sch-save", box).onclick = save;
    $("#sch-undo", box).onclick = undo;
    const au = $("#sch-auto", box); if (au) au.onclick = autoFill;
    $("#sch-print-all", box).onclick = printAll;
    $("#sch-print-one", box).onclick = () => mode === "class" ? printClass(sel) : printTeacher(sel);
    const wa = $("#sch-wa", box); if (wa) wa.onclick = () => waSheet(sel);
    drawGrid(); drawSummary(); drawMsg(cf);
    if (!tOpts.length && mode === "teacher") $("#sch-msg", box).innerHTML = A().H.empty("لا معلمين في المدرسة بعد");
  }

  function drawMsg(cf) {
    const m = $("#sch-msg", box); if (!m) return;
    cf = cf || conflicts();
    let html = "";
    if (cf.hard.length) html += `<div class="sch-conf">⛔ <b>${cf.hard.length} تعارض</b> يجب حلّها قبل الحفظ:<br>${cf.hard.slice(0, 6).map(h => "• " + h.msg).join("<br>")}${cf.hard.length > 6 ? `<br>… و${cf.hard.length - 6} أخرى` : ""}</div>`;
    if (cf.quota.length) html += `<div class="sch-conf warn">⚠️ فوق النصاب (${QUOTA} حصة): ${cf.quota.map(q => `<b>${esc(q.t)}</b> ${q.n} حصة`).join("، ")} — تحذير فقط، لا يمنع الحفظ.</div>`;
    m.innerHTML = html;
  }
  function refreshBadges() {
    const cf = conflicts(), nMod = changeCount();
    const b = $("#sch-cf", box); if (b) { b.className = "sch-badge" + (cf.hard.length ? " bad" : ""); b.textContent = cf.hard.length ? `⛔ ${cf.hard.length} تعارض` : "✅ لا تعارضات"; }
    const q = $("#sch-q", box); if (q) { q.style.display = cf.quota.length ? "" : "none"; q.title = cf.quota.map(x => x.t + " " + x.n).join("، "); q.textContent = `⚠️ ${cf.quota.length} فوق النصاب`; }
    const m = $("#sch-mod", box); if (m) { m.className = "sch-badge " + (nMod ? "warn" : "off"); m.textContent = `✏️ ${nMod} خلية معدَّلة`; }
    const sv = $("#sch-save", box); if (sv) { sv.disabled = !nMod || !!cf.hard.length || saving; sv.textContent = saving ? "⏳ جارِ الحفظ…" : `💾 حفظ الجدول${nMod ? ` (${nMod})` : ""}`; }
    const un = $("#sch-undo", box); if (un) un.disabled = !nMod || saving;
    const tt = $("#sch-tot", box); if (tt) tt.textContent = `${work.length + extra.length} حصة في الجدول · ${DAYS.length} أيام × ${PER.length} حصص · النصاب ${QUOTA} حصة` + (extra.length ? ` · ${extra.length} حصة خارج أيام الدراسة تُحفظ كما هي` : "");
    drawMsg(cf);
  }

  /* ═══ الشبكة: الأيام × الحصص ═══ */
  function gridHtml() {
    const cks = conflictRows(conflicts()), today = A().todayName(), pNow = A().periodNow();
    let h = `<table class="sch-grid"><tr><th class="day">اليوم</th>${PER.map(p => `<th>ح${p}<div dir="ltr" style="font-weight:400;font-size:9.5px;color:#c9d5e3">${esc(A().periodTime(p))}</div></th>`).join("")}</tr>`;
    DAYS.forEach(d => {
      h += `<tr><td class="day">${esc(d)}</td>` + PER.map(p => {
        const r = mode === "class" ? cellC(d, p, sel) : cellT(sel, d, p);
        let tx, cls = "cell";
        if (mode === "class") tx = r ? `<span class="t">${esc(shortName(r.t))}</span><span class="s">${esc(subjOf(r.t) || "—")}</span>` : `<span class="t">—</span>`;
        else tx = r ? `<span class="t">${esc(clsName(r.c))}</span>` : `<span class="t">—</span>`;
        if (!r) cls += " free";
        if (cellModified(d, p)) cls += " mod";
        if (r && cks.has(r)) cls += " conf";
        if (d === today && p === pNow) cls += " now";
        const ttl = `${d} — الحصة ${p}` + (r ? ` — ${r.t} / ${clsName(r.c)}` : " — فارغة");
        return `<td class="${cls}" data-d="${esc(d)}" data-p="${p}" role="button" tabindex="0" title="${esc(ttl)}">${tx}</td>`;
      }).join("") + "</tr>";
    });
    return h + "</table>";
  }
  function drawGrid() {
    const g = $("#sch-grid", box); if (!g) return;
    if (mode === "teacher" && !sel) { g.innerHTML = A().H.empty("اختر معلماً"); return; }
    g.innerHTML = `<div class="table-scroll" id="sch-scroll">${gridHtml()}</div>`;
    g.querySelectorAll("td.cell").forEach(td => {
      const open = () => openPicker(td.dataset.d, Number(td.dataset.p));
      td.onclick = open;
      td.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
    refreshBadges();
  }
  function drawSummary() {
    const s = $("#sch-sum", box); if (!s) return;
    if (mode === "class") {
      const cnt = {}; work.filter(r => r.c === sel).forEach(r => cnt[r.t] = (cnt[r.t] || 0) + 1);
      const tot = Object.keys(cnt).reduce((a, k) => a + cnt[k], 0);
      s.innerHTML = `<div class="sch-sum"><span class="it"><b>${tot}</b> / ${DAYS.length * PER.length} حصة معبّأة</span>${Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).map(t => `<span class="it">${esc(shortName(t))} <small style="color:var(--muted)">${esc(subjOf(t))}</small> <b>${cnt[t]}</b></span>`).join("")}</div>`;
    } else {
      const n = loadOf(sel), cnt = {}; work.filter(r => r.t === sel).forEach(r => cnt[r.c] = (cnt[r.c] || 0) + 1);
      const t = teacherByName(sel), assigned = t ? (t.classes || []) : [];
      const missing = assigned.filter(c => !cnt[c]);
      s.innerHTML = `<div class="sch-sum"><span class="it ${n > QUOTA ? "over" : ""}">النصاب <b>${n}</b> / ${QUOTA}</span>${Object.keys(cnt).map(c => `<span class="it">${esc(clsName(c))} <b>${cnt[c]}</b></span>`).join("")}${missing.length ? `<span class="it" style="color:var(--muted)">بلا حصص: ${missing.map(c => esc(clsName(c))).join("، ")}</span>` : ""}</div>`;
    }
  }
  function afterEdit() { drawGrid(); drawSummary(); }

  /* ═══ القائمة المنبثقة لتحرير خلية ═══ */
  function openPicker(d, p) {
    if (!sel) return;
    const s = S();
    const cur = mode === "class" ? cellC(d, p, sel) : cellT(sel, d, p);
    const title = mode === "class" ? `${esc(clsName(sel))} — ${esc(d)} الحصة ${p}` : `${esc(shortName(sel))} — ${esc(d)} الحصة ${p}`;
    let list = "", filt = "";
    if (mode === "class") {
      const own = A().classTeachers(sel).filter(t => !t.admin && t.name).map(t => t.name), all = teacherOpts();
      const item = (n) => {
        const ld = loadOf(n), busy = cellT(n, d, p);
        return `<button data-t="${esc(n)}" data-q="${esc(n + " " + subjOf(n))}" class="${cur && cur.t === n ? "cur" : ""}"><span>${esc(n)}<small>${esc(subjOf(n) || "—")}${busy && busy.c !== sel ? ` · مشغول مع ${esc(clsName(busy.c))}` : ""}</small></span><span class="ld ${ld >= QUOTA ? "over" : ""}">${ld}/${QUOTA}</span></button>`;
      };
      const rest = all.filter(n => own.indexOf(n) < 0);
      list = (own.length ? `<div class="grp">معلمو الفصل</div>` + own.map(item).join("") : "") + (rest.length ? `<div class="grp">بقية المعلمين</div>` + rest.map(item).join("") : "");
      filt = `<input class="search-box" id="sch-pk-q" placeholder="ابحث باسم المعلم أو المادة…" autocomplete="off" style="margin-bottom:8px">`;
    } else {
      const t = teacherByName(sel), own = t ? (t.classes || []).filter(c => s.classById(c)) : [];
      const item = (c) => {
        const busy = cellC(d, p, c);
        return `<button data-c="${esc(c)}" data-q="${esc(clsName(c))}" class="${cur && cur.c === c ? "cur" : ""}"><span>${esc(clsName(c))}${busy && busy.t !== sel ? `<small>مشغول مع ${esc(shortName(busy.t))}${subjOf(busy.t) ? " (" + esc(subjOf(busy.t)) + ")" : ""}</small>` : ""}</span></button>`;
      };
      const rest = classes().map(c => c.id).filter(c => own.indexOf(c) < 0);
      list = (own.length ? `<div class="grp">فصول المعلم المسندة</div>` + own.map(item).join("") : "") + (rest.length ? `<div class="grp">بقية الفصول</div>` + rest.map(item).join("") : "");
    }
    s.openSheet(`<h4>${title}</h4>
      <div style="font-size:13px;color:var(--muted);text-align:center;margin-bottom:8px">${cur ? `الحالي: <b style="color:var(--navy)">${mode === "class" ? esc(cur.t) + (subjOf(cur.t) ? " — " + esc(subjOf(cur.t)) : "") : esc(clsName(cur.c))}</b>` : "الخلية فارغة"}</div>
      <div id="sch-pk-msg"></div>
      ${filt}
      <div class="sch-pick" id="sch-pick">${cur ? `<button class="clear" data-clear="1">🗑️ تفريغ الحصة</button>` : ""}${list}</div>
      <div class="sheet-actions"><button class="btn-plain" id="sch-pk-close">إغلاق</button></div>`, (o) => {
      o.querySelector("#sch-pk-close").onclick = () => s.closeSheet();
      const q = o.querySelector("#sch-pk-q");
      if (q) q.oninput = () => {
        const v = q.value.trim();
        o.querySelectorAll("#sch-pick button[data-q]").forEach(b => { b.style.display = (!v || b.dataset.q.indexOf(v) >= 0) ? "" : "none"; });
      };
      o.querySelectorAll("#sch-pick button").forEach(b => b.onclick = () => {
        if (b.dataset.clear) {
          if (mode === "class") setClassCell(d, p, sel, ""); else setTeacherCell(sel, d, p, "");
          s.closeSheet(); afterEdit(); A().toast("🗑️ فُرِّغت الحصة"); return;
        }
        const t = mode === "class" ? b.dataset.t : sel, c = mode === "class" ? sel : b.dataset.c;
        tryApply(o, t, d, p, c);
      });
    });
  }
  // تطبيق الاختيار: بلا تعارض ⇒ مباشرة، ومع تعارض ⇒ رسالة حمراء باسم المتعارض + «استبدال» أو «إلغاء»
  function tryApply(o, t, d, p, c) {
    const s = S(), cf = check(t, d, p, c), msg = o.querySelector("#sch-pk-msg");
    const apply = (replace) => {
      if (replace) cf.hard.forEach(h => { work = work.filter(r => r !== h.row); });
      if (mode === "class") setClassCell(d, p, c, t); else setTeacherCell(t, d, p, c);
      s.closeSheet(); afterEdit();
      A().toast(replace ? "🔁 استُبدلت الحصة" : "✅ عُدِّلت الحصة");
      if (cf.quota) A().toast(`⚠️ ${shortName(t)}: ${cf.quota.n} حصة (فوق النصاب ${QUOTA})`, 3200);
    };
    if (!cf.hard.length) { apply(false); return; }
    msg.innerHTML = `<div class="sch-conf" id="sch-pk-conf">⛔ <b>تعارض:</b><br>${cf.hard.map(h => "• " + h.msg).join("<br>")}${cf.quota ? `<br>⚠️ وسيصبح نصاب المعلم ${cf.quota.n} حصة (فوق ${QUOTA})` : ""}
      <div class="sheet-actions" style="margin-top:8px"><button class="btn-plain" id="sch-pk-no">إلغاء</button><button class="btn-primary" id="sch-pk-rep" style="background:var(--bad);color:#fff">🔁 استبدال</button></div></div>`;
    msg.querySelector("#sch-pk-no").onclick = () => { msg.innerHTML = ""; };
    msg.querySelector("#sch-pk-rep").onclick = () => apply(true);
    try { msg.scrollIntoView({ block: "nearest" }); } catch (e) { }
  }

  /* ═══ تراجع ═══ */
  async function undo() {
    const n = changeCount(); if (!n || saving) return;
    const ok = await A().confirm("↩️ تراجع", `إلغاء <b>${n}</b> خلية معدَّلة والعودة إلى الجدول المحفوظ؟`, { ok: "نعم، تراجع", danger: true });
    if (!ok) return;
    load(true); render(box); A().toast("↩️ أُلغيت التعديلات");
  }

  /* ═══ توزيع تلقائي لبقية حصص المعلم الحالي (فصوله المسندة، بلا تعارض، حتى النصاب) ═══ */
  async function autoFill() {
    if (mode !== "teacher" || !sel) return;
    const t = teacherByName(sel); if (!t) { A().toast("المعلم غير موجود في قائمة المعلمين"); return; }
    const own = (t.classes || []).filter(c => S().classById(c)); if (!own.length) { A().toast("لا فصول مسندة لهذا المعلم"); return; }
    const room = QUOTA - loadOf(sel); if (room <= 0) { A().toast(`النصاب مكتمل (${loadOf(sel)}/${QUOTA})`); return; }
    const ok = await A().confirm("🪄 توزيع تلقائي", `يملأ الحصص الفارغة عند <b>${esc(sel)}</b> بفصوله المسندة (${own.map(c => esc(clsName(c))).join("، ")}) دون أي تعارض، حتى ${QUOTA} حصة (المتاح: ${room}). يمكنك التراجع قبل الحفظ.`, { ok: "نفّذ" });
    if (!ok) return;
    let added = 0;
    const cnt = {}; own.forEach(c => cnt[c] = work.filter(r => r.t === sel && r.c === c).length);
    for (let di = 0; di < DAYS.length && added < room; di++) {
      for (let pi = 0; pi < PER.length && added < room; pi++) {
        const d = DAYS[di], p = PER[pi];
        if (cellT(sel, d, p)) continue;
        const cand = own.slice().sort((a, b) => cnt[a] - cnt[b] || own.indexOf(a) - own.indexOf(b));
        // الفصل الأقل حصصاً أولاً، مع تجنّب تكرار الفصل نفسه في اليوم نفسه إن أمكن
        const pick = cand.find(c => !cellC(d, p, c) && !work.some(r => r.t === sel && r.d === d && r.c === c)) || cand.find(c => !cellC(d, p, c));
        if (!pick) continue;
        work.push({ t: sel, d: d, p: p, c: pick }); cnt[pick]++; added++;
      }
    }
    afterEdit();
    A().toast(added ? `🪄 أُضيفت ${added} حصة — راجع ثم احفظ` : "لا خلايا فارغة متاحة بلا تعارض", 3000);
  }

  /* ═══ الحفظ: schedule/all كاملاً ثم D.schedule فوراً ═══ */
  const sortRows = (rows) => rows.slice().sort((a, b) => String(a.t).localeCompare(String(b.t), "ar") || DAYS.indexOf(a.d) - DAYS.indexOf(b.d) || a.p - b.p);
  async function save() {
    const s = S(), cf = conflicts(), nMod = changeCount();
    if (saving) return;
    if (!nMod) { A().toast("لا تعديلات للحفظ"); return; }
    if (cf.hard.length) { A().toast(`⛔ حلّ ${cf.hard.length} تعارض قبل الحفظ`, 3000); drawMsg(cf); return; }
    const rows = sortRows(work.concat(extra)).map(r => ({ t: r.t, d: r.d, p: r.p, c: r.c }));
    if (rows.length > 600) { A().toast("⛔ الجدول يتجاوز 600 حصة — لا يمكن حفظه", 4000); return; }
    saving = true; refreshBadges();
    const payload = { rows: rows, tn: String((s.TE && s.TE.name) || "الإدارة").slice(0, 80), ts: Date.now() };
    try {
      if (s.CLOUD && s.fdb) {
        await s.fdb.doc("schedule/all").set(payload);
        s.D.schedule = rows;
        try { localStorage.setItem("sijil.cloudD", JSON.stringify(s.D)); } catch (e) { }
      } else {
        s.D.schedule = rows; s.DB.schedule = rows; s.save();
      }
      await A().adminlog("schedule", `حفظ الجدول: ${nMod} خلية معدَّلة — ${rows.length} حصة`);
      saving = false; load(true); render(box);
      A().toast(`💾 حُفظ الجدول (${rows.length} حصة، ${nMod} خلية)`, 3000);
    } catch (e) {
      warn("save", e && e.message); saving = false; refreshBadges();
      A().toast("❌ تعذّر حفظ الجدول: " + ((e && e.message) || e), 4000);
    }
  }

  /* ═══ الطباعة (SIJIL.printDoc أفقي، صفحة واحدة) ═══ */
  const PCSS = `<style>
    .sd table{margin:6px 0}.sd th,.sd td{padding:3px 4px;font-size:10.5px;line-height:1.25}.sd td.dy{font-weight:800;background:#f3efe4;white-space:nowrap}
    .sd td.pn{font-weight:800;background:#fbf6ea;width:22px}.sd td .s{display:block;font-size:8.5px;color:#666}.sd .one td{font-size:13px;padding:7px 6px}.sd .one td .s{font-size:10.5px}
    .sd .foot{font-size:11px;color:#555;margin-top:6px;text-align:center;line-height:1.7}</style>`;
  const rowsForPrint = () => { load(); return work; };
  const unsavedNote = () => changeCount() ? " — (يشمل تعديلات غير محفوظة)" : "";
  // الجدول العام: صفوف = اليوم×الحصة، أعمدة = الفصول — A4 أفقي في صفحة واحدة
  function printAll() {
    const cls = classes(), rows = rowsForPrint();
    let h = `<table><tr><th>اليوم</th><th>ح</th>${cls.map(c => `<th>${esc(c.name)}</th>`).join("")}</tr>`;
    DAYS.forEach(d => PER.forEach((p, i) => {
      h += `<tr>${i === 0 ? `<td class="dy" rowspan="${PER.length}">${esc(d)}</td>` : ""}<td class="pn">${p}</td>` +
        cls.map(c => { const r = cellC(d, p, c.id, rows); return `<td>${r ? esc(shortName(r.t)) + `<span class="s">${esc(subjOf(r.t))}</span>` : ""}</td>`; }).join("") + "</tr>";
    }));
    h += "</table>";
    const cf = conflicts(rows);
    A().printHtml("الجدول المدرسي العام", PCSS + `<div class="sd">${h}<div class="foot">${rows.length} حصة أسبوعياً — ${cls.length} فصلاً — ${teacherOpts().length} معلماً${cf.hard.length ? ` — ⚠️ ${cf.hard.length} تعارض غير محلول` : ""}${unsavedNote()}</div></div>`, { land: true, sub: "الجدول المدرسي العام" });
  }
  function oneGrid(fnCell) {
    let h = `<table class="one"><tr><th>اليوم</th>${PER.map(p => `<th>ح${p}<div dir="ltr" style="font-weight:400;font-size:9px">${esc(A().periodTime(p))}</div></th>`).join("")}</tr>`;
    DAYS.forEach(d => { h += `<tr><td class="dy">${esc(d)}</td>${PER.map(p => `<td>${fnCell(d, p)}</td>`).join("")}</tr>`; });
    return h + "</table>";
  }
  function printClass(cid) {
    const c = S().classById(cid); if (!c) return;
    const rows = rowsForPrint(), cnt = {};
    rows.filter(r => r.c === cid).forEach(r => cnt[r.t] = (cnt[r.t] || 0) + 1);
    const body = oneGrid((d, p) => { const r = cellC(d, p, cid, rows); return r ? esc(r.t) + `<span class="s">${esc(subjOf(r.t))}</span>` : "—"; });
    A().printHtml(`جدول ${c.name}`, PCSS + `<div class="sd">${body}<div class="foot">${Object.keys(cnt).map(t => `${esc(shortName(t))}${subjOf(t) ? " (" + esc(subjOf(t)) + ")" : ""} ${cnt[t]}`).join(" · ")}${unsavedNote()}</div></div>`, { land: true, sub: "الجدول الأسبوعي للفصل" });
  }
  function printTeacher(name) {
    if (!name) return;
    const rows = rowsForPrint(), n = loadOf(name, rows), cnt = {};
    rows.filter(r => r.t === name).forEach(r => cnt[r.c] = (cnt[r.c] || 0) + 1);
    const body = oneGrid((d, p) => { const r = cellT(name, d, p, rows); return r ? esc(clsName(r.c)) : "—"; });
    A().printHtml(`جدول حصص ${name}`, PCSS + `<div class="sd"><div style="text-align:center;font-size:13px;color:#555;margin-bottom:4px">${esc(subjOf(name) || "")} — ${n} حصة أسبوعياً</div>${body}<div class="foot">${Object.keys(cnt).map(c => `${esc(clsName(c))} ${cnt[c]}`).join(" · ")}${unsavedNote()}</div></div>`, { land: true, sub: "جدول حصص المعلم" });
  }

  /* ═══ إرسال جدول المعلم واتساب (نص) ═══ */
  function teacherText(name) {
    const s = S(), rows = (work && work.length) ? work : (load(), work);
    const lines = [`🗓️ جدول حصص أ. ${name}`, `${s.META.school.name}${subjOf(name) ? " — " + subjOf(name) : ""}`, ""];
    DAYS.forEach(d => {
      const dr = rows.filter(r => r.t === name && r.d === d).sort((a, b) => a.p - b.p);
      lines.push(`▪️ ${d}: ` + (dr.length ? dr.map(r => `ح${r.p} ${clsName(r.c)}`).join(" · ") : "لا حصص"));
    });
    lines.push("", `المجموع: ${loadOf(name, rows)} حصة أسبوعياً`, `— ${(s.TE && s.TE.name) || "الإدارة"} · ${s.hijriLabel()}`);
    return lines.join("\n");
  }
  function waSheet(name) {
    if (!name) return;
    const s = S(), t = teacherByName(name), ph = t ? (t.mob || t.phone || "") : "", wp = A().waPhone(ph);
    const txt = teacherText(name);
    s.openSheet(`<h4>💬 إرسال جدول ${esc(shortName(name))} واتساب</h4>
      <div style="font-size:13px;color:var(--muted);text-align:center;margin-bottom:8px">${wp ? `سيُفتح واتساب على الرقم <b style="color:var(--navy)">${esc(A().normMob(ph) || ph)}</b>` : "لا رقم جوال مسجَّل لهذا المعلم — سيُفتح واتساب لاختيار المستلم"}${changeCount() ? "<br>⚠️ النص يشمل تعديلات غير محفوظة" : ""}</div>
      <div class="sch-wa" id="sch-wa-txt">${esc(txt)}</div>
      <div class="sheet-actions">
        <button class="btn-plain" id="sch-wa-copy">📋 نسخ النص</button>
        <a class="btn-primary" id="sch-wa-go" style="flex:1;padding:12px;text-align:center;text-decoration:none;display:block" target="_blank" rel="noopener" href="${esc(wp ? A().waHref(ph, txt) : s.waLink("", txt))}">💬 فتح واتساب</a>
      </div>
      <div class="sheet-actions"><button class="btn-plain" id="sch-wa-close">إغلاق</button></div>`, (o) => {
      o.querySelector("#sch-wa-close").onclick = () => s.closeSheet();
      o.querySelector("#sch-wa-go").onclick = () => setTimeout(() => s.closeSheet(), 400);
      o.querySelector("#sch-wa-copy").onclick = async () => {
        try { await navigator.clipboard.writeText(txt); A().toast("📋 نُسخ نص الجدول"); }
        catch (e) { A().toast("تعذّر النسخ — حدّد النص يدوياً"); }
      };
    });
  }

  /* ═══ التسجيل ═══ */
  // تجريبياً: جدول محفوظ على هذا الجهاز (DB.schedule) يُطبَّق على D.schedule عند التحميل — app.js لا يقرؤه بنفسه
  try {
    const s = S();
    if (s && !s.CLOUD && s.D && Array.isArray(s.DB.schedule) && s.DB.schedule.length) { s.D.schedule = s.DB.schedule; if (s.TE) { try { s.rerenderTab(); } catch (e) { } } }
  } catch (e) { warn("demo schedule restore", e); }
  if (window.SIJIL_ADMIN && typeof window.SIJIL_ADMIN.register === "function") window.SIJIL_ADMIN.register("schedule", (b) => { render(b); });

  window.SIJIL_ADMIN_SCHEDULE = {
    DAYS, QUOTA, get PERIODS() { return PER.slice(); },
    conflicts: () => { load(); return conflicts(); }, check, changeCount: () => { load(); return changeCount(); },
    printAll, printClass, printTeacher, teacherText, save,
    get work() { return work; }, get extra() { return extra; }, get mode() { return mode; }, get sel() { return sel; },
    setView: (m, s2) => { mode = (m === "teacher") ? "teacher" : "class"; if (s2 != null) sel = s2; if (box) render(box); },
    reload: () => load(true)
  };
})();
