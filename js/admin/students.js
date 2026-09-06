/* ═══════════ لوحة مدير المدرسة — 👥 الطلاب (js/admin/students.js) ═══════════
   شرائح الفصول → جدول الطلاب النشطين (م، الاسم، جوال ولي الأمر، النقاط المجمّعة عبر كل معلمي الفصل، نسبة الحضور، المواد المرصودة)
   الإجراءات: 👤 البطاقة الشاملة (SIJIL.studentProgress) · ✏️ تعديل الاسم/جوال ولي الأمر (sedits/{cid} عبر SIJIL_ADMIN.saveSedit)
              🔁 نقل إلى فصل… / 🚪 خروج (تعيد استعمال نافذة النقل الموجودة SIJIL.adminMoves — لا تكرار لمنطق doMove)
              💬 واتساب ولي الأمر (رسالة المدير عبر كل المواد، الرقم بصيغة 966…)
   بحث بالاسم (أو بأرقام الجوال) عبر كل فصول المدرسة أعلى الجدول، وطباعة كل عرض عبر SIJIL_ADMIN.printTable (صفحة واحدة).
   كل تعديل وكل حركة نقل/خروج تُسجَّل في adminlog. يعتمد على window.SIJIL (app.js) وwindow.SIJIL_ADMIN (core.js) — لا يلمس ملفات الوحدات الأخرى. */
(function () {
  "use strict";
  const S = () => window.SIJIL, A = () => window.SIJIL_ADMIN;
  const esc = (s) => S().esc(s == null ? "" : String(s));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /* ═══ حالة الوحدة (تبقى بين عمليات الرسم) ═══ */
  let curCid = null, query = "", sortBy = "list", lastMoves = -1;
  let mvWatch = null;                 // مراقب نافذة النقل (لتسجيل الحركات في adminlog)
  const loggedMoves = new Set();      // حركات سُجِّلت في adminlog من هذه الجلسة — لا تتكرر

  /* ═══ CSS خاص بالوحدة — يُحقن مرة واحدة ═══ */
  function ensureCss() {
    if (document.getElementById("adm-students-css")) return;
    const st = document.createElement("style"); st.id = "adm-students-css";
    st.textContent = `
.ads-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0 8px;font-size:12.5px;color:var(--muted)}
.ads-head b{color:var(--navy);font-size:14.5px}
.ads-tools .search-box{flex:1 1 210px;width:auto;margin:0;padding:10px 12px;font-size:14px}
.ads-tools select{flex:0 0 auto}
.ads-tools .btn-plain{flex:0 0 auto;padding:9px 14px}
.ads-tools .btn-gold{flex:0 0 auto;padding:9px 12px;font-size:13px}
.report-table.ads td{white-space:nowrap;vertical-align:middle}
.report-table.ads td.nm{line-height:1.35}
.report-table.ads td.nm small{display:block;color:var(--muted);font-weight:400;font-size:10.5px}
.report-table.ads .ads-nm{cursor:pointer;border-bottom:1px dotted var(--gold)}
.report-table.ads .ads-nm:hover{color:var(--gold)}
.report-table.ads .ads-ph{font-weight:700;color:var(--navy);cursor:pointer;border-bottom:1px dotted transparent}
.report-table.ads .ads-ph:hover{border-bottom-color:var(--gold)}
.report-table.ads .ads-ph.off{color:#bbb;font-weight:400}
.report-table.ads .ads-ph.bad{color:#b8860b}
.report-table.ads .ads-pts{font-weight:800;color:var(--navy)}
.report-table.ads .ads-pts.neg{color:var(--bad)}
.report-table.ads .ads-dash{color:#bbb}
.ads-act{display:flex;gap:4px;justify-content:center;align-items:center;flex-wrap:nowrap}
.ads-act button,.ads-act a,.ads-act select{padding:5px 7px;font-size:12.5px;line-height:1.3;border-radius:8px;border:1.5px solid var(--line);background:#fff;color:var(--navy);cursor:pointer;font-family:inherit;font-weight:700;text-decoration:none;white-space:nowrap}
.ads-act button:hover,.ads-act a:hover,.ads-act select:hover{border-color:var(--gold);background:#fdf6e3}
.ads-act .ads-wa{background:#25d366;border-color:#25d366;color:#fff}
.ads-act .ads-wa:hover{background:#1fb457;border-color:#1fb457}
.ads-act .ads-wa.off{background:#e6e8eb;border-color:#e6e8eb;color:#9aa3ad;pointer-events:none}
.ads-act .ads-out{color:var(--bad)}
.ads-act select{max-width:104px;padding-inline:4px}
.ads-act button:disabled,.ads-act select:disabled{opacity:.45;cursor:not-allowed}
.report-table.ads tr.hl td{background:#fdf6e3!important}
.ads-sub{font-size:12px;color:var(--muted);margin:-4px 0 8px;line-height:1.8}
.ads-cnt{font-size:12px;color:var(--muted);margin:8px 2px 0;line-height:1.7}
@media (max-width:520px){.ads-tools .search-box{flex-basis:100%}.ads-tools select{flex:1 1 auto}}`;
    document.head.appendChild(st);
  }

  /* ═══ أدوات ═══ */
  const cls = () => A().sortedClasses();
  const byId = (cid) => S().classById(cid);
  const movesOff = () => { const s = S(); return !!(s.CLOUD && (!s.fdb || !s.MOVES_OK)); };
  const toast = (txt) => A().toast(txt);
  const clsName = (cid) => cid === "out" ? "خارج المدرسة" : ((byId(cid) || {}).name || cid);
  const fmtPts = (p) => `<span class="ads-pts${p < 0 ? " neg" : ""}"${p < 0 ? ' dir="ltr"' : ""}>${p}</span>`;
  const fmtAtt = (a) => a == null ? '<span class="ads-dash">—</span>' : `<span style="font-weight:800;color:${a >= 90 ? "var(--ok)" : a >= 75 ? "#b8860b" : "var(--bad)"}">${a}%</span>`;
  // تطبيع عربي للبحث: تُحذف الحركات والتطويل، وتُوحَّد الألف والياء والتاء المربوطة
  const norm = (s) => String(s == null ? "" : s).replace(/[ً-ْٰـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ئ/g, "ي").replace(/ؤ/g, "و").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
  const digitsOf = (p) => String(p == null ? "" : p).replace(/[^\d]/g, "");

  function phoneCell(st, c, i) {
    const raw = String(st.p || "").trim(), n = A().normMob(raw);
    const inner = n ? `<span dir="ltr">${esc(n)}</span>` : raw ? `<span dir="ltr">${esc(raw)}</span> ⚠️` : "— لا رقم —";
    const tip = n ? "اضغط لتعديل الرقم" : raw ? "صيغة غير قياسية — اضغط للتصحيح" : "اضغط لإضافة رقم ولي الأمر";
    return `<span class="ads-ph${n ? "" : raw ? " bad" : " off"}" data-c="${esc(c.id)}" data-i="${i}" title="${tip}">${inner}</span>`;
  }
  const fromLabel = (st) => st.from && st.from.cid ? ` · منقول من ${esc(clsName(st.from.cid))}` : "";
  const nameCell = (st, i, c, withClass) => `<span class="ads-nm" data-c="${esc(c.id)}" data-i="${i}" title="البطاقة الشاملة عبر كل المواد">${esc(st.n)}</span><small>${withClass ? esc(c.name) + " · " : ""}#${i + 1}${fromLabel(st)}</small>`;

  // صفوف الفصل: [{i, s, agg}] مرتبة حسب sortBy
  function classRows(sd, c) {
    const rows = S().activeStudents(c).map(({ i, s: st }) => ({ i, s: st, agg: A().aggStudent(sd, c.id, i) }));
    if (sortBy === "pts") rows.sort((a, b) => b.agg.pts - a.agg.pts);
    else if (sortBy === "att") rows.sort((a, b) => ((b.agg.att == null ? -1 : b.agg.att) - (a.agg.att == null ? -1 : a.agg.att)) || b.agg.pts - a.agg.pts);
    else if (sortBy === "name") rows.sort((a, b) => String(a.s.n).localeCompare(String(b.s.n), "ar"));
    return rows;
  }
  // البحث عبر المدرسة: [{c, i, s, agg}] — كل كلمات البحث في الاسم، أو أرقام في جوال ولي الأمر
  const SEARCH_MAX = 120;
  function searchRows(sd, q) {
    const out = [], dg = digitsOf(q), byPhone = dg.length >= 3 && !/[^\d\s+\-()]/.test(q);
    const parts = norm(q).split(" ").filter(Boolean);
    if (!byPhone && !parts.length) return out;
    let more = 0;
    cls().forEach(c => S().activeStudents(c).forEach(({ i, s: st }) => {
      const hit = byPhone ? digitsOf(st.p).includes(dg) : parts.every(p => norm(st.n).indexOf(p) >= 0);
      if (!hit) return;
      if (out.length >= SEARCH_MAX) { more++; return; }
      out.push({ c, i, s: st, agg: A().aggStudent(sd, c.id, i) });
    }));
    out.more = more;
    return out;
  }

  /* ═══ رسالة المدير لولي الأمر عبر كل المواد ═══ */
  function adminMessage(c, si, agg) {
    const s = S(), st = c.students[si] || { n: "" }, L = [];
    L.push("السلام عليكم ورحمة الله وبركاته");
    L.push(`ولي أمر الطالب: *${st.n}* — ${c.name}`);
    L.push(`📋 تقرير إدارة المدرسة عن كل المواد — ${s.hijriLabel()}`);
    L.push("");
    if (agg.n) {
      const parts = s.STATES.map((x, k) => agg.st[k] ? `${x.name} ${agg.st[k]}` : "").filter(Boolean).join("، ");
      L.push(`✅ الحضور العام: ${agg.att != null ? agg.att + "%" : "—"}${parts ? ` (${parts})` : ""}`);
      L.push(`🏅 النقاط المجمّعة: ${agg.pts} عبر ${agg.n} ${agg.n === 1 ? "مادة" : agg.n <= 10 ? "مواد" : "مادة"}${agg.avg != null ? ` | 💯 المعدل: ${agg.avg}% — ${s.levelOf(agg.avg).t}` : ""}`);
      L.push("📚 المواد:");
      agg.docs.forEach(dc => {
        const t = s.calcStudent(c.id, si, dc.recs); if (!t.days && !s.hasGrades(c.id, si, dc.grades, dc.recs)) return;
        const a = s.attPct(t), g = agg.grades.find(x => x.tid === dc.tid);
        L.push(`• ${dc.subject}: ${t.pts} نقطة${a != null ? ` · حضور ${a}%` : ""}${t.hwN ? ` · واجبات ناقصة ${t.hwN}` : ""}${g ? ` · الدرجة ${Math.round(g.pct)}% (${s.levelOf(g.pct).t})` : ""}`);
      });
      L.push("");
      const absent = agg.st[1] || 0, low = agg.grades.filter(g => g.pct < 50).length;
      L.push(absent >= 3 ? "⚠️ نرجو متابعة انتظام الحضور، فالغياب يؤثر في التحصيل." : low ? "🤝 نرجو التواصل مع إدارة المدرسة لوضع خطة دعم مشتركة." : agg.avg != null && agg.avg >= 85 ? "🌟 نبارك لكم تميّز ابنكم في جميع المواد، ونشكر حسن متابعتكم." : "👍 مستوى طيب، ونأمل مواصلة المتابعة اليومية للواجبات والمشاركة.");
    } else {
      L.push("📅 لم يُرصد له بعد في أي مادة.");
      L.push("نسعد بتواصلكم ومتابعتكم 🌹");
    }
    L.push("");
    L.push(`🏫 ${s.META.school.name}`);
    L.push(`مدير المدرسة: ${s.TE ? s.TE.name : ""}`);
    return L.join("\n");
  }

  /* ═══ النقل/الخروج: إعادة استعمال نافذة النقل الموجودة في app.js (SIJIL.adminMoves) ═══
     تُفتح النافذة نفسها التي يستعملها المدير يدوياً (تأكيدها وترحيلها وسجلها ومعالجتها للتعارض كما هي)،
     ثم تُختار شريحة الفصل ويُنتظر بناء الصف ويُنقر الإجراء. لا نسخة ثانية من منطق doMove هنا. */
  async function viaMoves(cid, si, to) {
    const s = S(), c = byId(cid), st = c && c.students[si];
    if (typeof s.adminMoves !== "function") { toast("نافذة النقل غير متاحة"); return false; }
    if (movesOff()) { toast("النقل معطّل: أعد تحميل الصفحة مع اتصال بالإنترنت"); return false; }
    if (!st || st.moved) { toast("لم يعد الطالب نشطاً في هذا الفصل — حُدِّثت القائمة"); return false; }
    try { const r = s.adminMoves(); if (r && typeof r.catch === "function") r.catch(() => { }); } catch (e) { toast("تعذّر فتح نافذة النقل"); return false; }
    watchMoves();
    const chips = [].slice.call(document.querySelectorAll("#mv-chips .chip"));
    const chip = chips.filter(x => x.dataset.c === cid)[0];
    if (chip && !chip.classList.contains("on")) chip.click();
    for (let k = 0; k < 60; k++) {
      const row = document.querySelector('#mv-body .mv-row[data-i="' + si + '"]');
      if (row) {
        row.style.background = "#fdf6e3"; row.style.borderRadius = "10px";
        try { row.scrollIntoView({ block: "center" }); } catch (e) { }
        if (to === "out") { const b = row.querySelector(".mv-out"); if (b) { b.click(); return true; } }
        else if (to) {
          const sel = row.querySelector(".mv-to");
          if (sel && [].some.call(sel.options, o => o.value === to)) { sel.value = to; sel.dispatchEvent(new Event("change")); return true; }
          toast("الفصل غير متاح في قائمة النقل — اختره يدوياً"); return false;
        }
        return true;
      }
      await sleep(100);
    }
    toast("لم يظهر الطالب في نافذة النقل — اختره يدوياً");
    return false;
  }
  /* مراقبة نافذة النقل: كل حركة جديدة تُسجَّل في adminlog (المدير هو من نفّذها) وتُبطل ذاكرة schoolDocs
     — منطق النقل نفسه يبقى في app.js، وهذا رصد لما نُفِّذ فقط. */
  function watchMoves() {
    if (mvWatch) return;
    const s = S(), a = A(), t0 = Date.now(), root = document.getElementById("overlay-root");
    const seen = new Set((s.D.moves || []).map(m => m && m.id).filter(Boolean));
    mvWatch = setInterval(() => {
      let n = 0;
      (s.D.moves || []).forEach(m => {
        if (!m || !m.id || seen.has(m.id) || loggedMoves.has(m.id)) return;
        seen.add(m.id); loggedMoves.add(m.id); n++;
        const note = `${m.name || ""} — ${clsName(m.from)} ← ${clsName(m.to)}${m.conflict ? " (لم تُطبَّق: الموضع محجوز)" : ""}`;
        try { const p = a.adminlog("move", note); if (p && p.catch) p.catch(() => { }); } catch (e) { }
      });
      if (n) a.invalidate();
      const open = !!(root && root.firstChild), age = Date.now() - t0;
      if ((!open && age > 1500) || age > 6e5) { clearInterval(mvWatch); mvWatch = null; }
    }, 500);
  }

  /* ═══ تعديل بيانات الطالب (الاسم + جوال ولي الأمر) → sedits/{cid} عبر SIJIL_ADMIN.saveSedit ═══ */
  function editSheet(cid, si, onDone) {
    const s = S(), a = A(), c = byId(cid), st = c && c.students[si];
    if (!st) { toast("تعذّر إيجاد الطالب"); return; }
    const curP = a.normMob(st.p) || String(st.p || "").trim();
    s.openSheet(`<h4>✏️ تعديل بيانات الطالب</h4>
      <div style="text-align:center;color:var(--muted);font-size:13px;margin-bottom:10px">${esc(c.name)} — رقم ${si + 1}${fromLabel(st)}</div>
      <div class="field"><label>اسم الطالب (للتصحيح الإملائي فقط)</label><input id="ads-ed-n" class="search-box" maxlength="80" value="${esc(st.n)}" autocomplete="off"></div>
      <div class="field"><label>جوال ولي الأمر</label><input id="ads-ed-p" class="search-box" inputmode="tel" placeholder="05xxxxxxxx" value="${esc(curP)}" autocomplete="off" style="direction:ltr;text-align:right"></div>
      <div class="empty-note" style="padding:2px 4px 6px;text-align:right;font-size:12px;min-height:0">يُقبل 05xxxxxxxx أو 9665xxxxxxxx، ويُحفظ باسمك في سجل تعديلات الفصل وينعكس لدى كل المعلمين عند فتح التطبيق. اترك الجوال فارغاً لحذف الرقم.</div>
      <div id="ads-ed-msg" style="color:var(--bad);font-size:13px;font-weight:700;min-height:18px;text-align:right"></div>
      <div class="sheet-actions"><button class="btn-plain" onclick="window._sheetClose()">إلغاء</button><button class="btn-primary" id="ads-ed-ok">💾 حفظ</button></div>`, (o) => {
      const nEl = o.querySelector("#ads-ed-n"), pEl = o.querySelector("#ads-ed-p"), msg = o.querySelector("#ads-ed-msg"), ok = o.querySelector("#ads-ed-ok");
      let busy = false;
      ok.onclick = async () => {
        if (busy) return;
        const n = nEl.value.trim().replace(/\s+/g, " "), pRaw = pEl.value.trim();
        if (!n) { msg.style.color = "var(--bad)"; msg.textContent = "اسم الطالب لا يمكن أن يكون فارغاً"; return; }
        if (n.length > 80) { msg.style.color = "var(--bad)"; msg.textContent = "الاسم طويل جداً (80 حرفاً كحد أقصى)"; return; }
        let p = "";
        if (pRaw) { p = a.normMob(pRaw); if (!p) { msg.style.color = "var(--bad)"; msg.textContent = "صيغة الجوال غير صحيحة — 05xxxxxxxx أو 9665xxxxxxxx"; return; } }
        const patch = {}, changes = [];
        if (n !== String(st.n || "").trim()) { patch.n = n; changes.push(`الاسم: «${st.n}» ← «${n}»`); }
        if (p !== curP) { patch.p = p; changes.push(p ? `الجوال: ${p}` : "حذف الجوال"); }
        if (!changes.length) { s.closeSheet(); return; }
        busy = true; ok.disabled = true; msg.style.color = "var(--muted)"; msg.textContent = "جارِ الحفظ…";
        let saved = false;
        try { saved = await a.saveSedit(cid, si, patch); } catch (e) { saved = false; }
        if (!saved) { busy = false; ok.disabled = false; msg.style.color = "var(--bad)"; msg.textContent = "تعذّر الحفظ — تحقق من الاتصال ثم أعد المحاولة"; return; }
        try { await a.adminlog("sedit", `${c.name} #${si + 1} ${n}: ${changes.join(" · ")}`); } catch (e) { }
        s.closeSheet(); toast("✔ حُفظ التعديل");
        if (onDone) onDone();
      };
      pEl.onkeydown = nEl.onkeydown = (e) => { if (e.key === "Enter") ok.click(); };
      try { nEl.focus(); } catch (e) { }
    });
  }

  /* ═══ الجدول ═══ */
  const COLS = ["م", { t: "الطالب", w: 150 }, { t: "جوال ولي الأمر", w: 108 }, "النقاط", "الحضور", "المواد", { t: "الإجراءات", w: 206 }];
  function actCell(c, i, st, agg, others) {
    const off = movesOff(), hasP = !!A().waPhone(st.p);
    const wa = hasP ? A().waHref(st.p, adminMessage(c, i, agg)) : "#";
    return `<div class="ads-act" data-c="${esc(c.id)}" data-i="${i}">
      <button class="ads-card" type="button" title="البطاقة الشاملة عبر كل المواد">👤</button>
      <button class="ads-edit" type="button" title="تعديل الاسم/جوال ولي الأمر">✏️</button>
      <a class="ads-wa${hasP ? "" : " off"}" target="_blank" rel="noopener"${hasP ? "" : ' tabindex="-1" aria-disabled="true"'} href="${wa}" title="${hasP ? "واتساب ولي الأمر — رسالة المدير عبر كل المواد" : "لا رقم مسجل لولي الأمر"}">💬</a>
      <select class="ads-mv" title="نقل إلى فصل آخر"${off ? " disabled" : ""}><option value="">🔁 نقل إلى…</option>${others.filter(x => x.id !== c.id).map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select>
      <button class="ads-out" type="button" title="تسجيل خروج من المدرسة"${off ? " disabled" : ""}>🚪</button></div>`;
  }
  function tableHtml(rows, withClass, id) {
    const others = cls();
    const body = rows.map((r, k) => {
      const c = r.c || byId(curCid);
      return [k + 1, nameCell(r.s, r.i, c, withClass), phoneCell(r.s, c, r.i), fmtPts(r.agg.pts), fmtAtt(r.agg.att), r.agg.n || '<span class="ads-dash">—</span>', actCell(c, r.i, r.s, r.agg, others)];
    });
    return A().H.table(COLS, body, { id, cls: "ads", nameIdx: 1 });
  }
  function bindTable(root, rerender) {
    const open = (el, fn) => { const cid = el.dataset.c, i = +el.dataset.i; el.onclick = () => fn(cid, i); };
    root.querySelectorAll(".ads-nm").forEach(el => open(el, (cid, i) => S().studentProgress(cid, i)));
    root.querySelectorAll(".ads-ph").forEach(el => open(el, (cid, i) => editSheet(cid, i, rerender)));
    root.querySelectorAll(".ads-act").forEach(act => {
      const cid = act.dataset.c, i = +act.dataset.i, q = (sel) => act.querySelector(sel);
      q(".ads-card").onclick = () => S().studentProgress(cid, i);
      q(".ads-edit").onclick = () => editSheet(cid, i, rerender);
      q(".ads-out").onclick = () => viaMoves(cid, i, "out");
      const mv = q(".ads-mv"); mv.onchange = () => { const to = mv.value; mv.value = ""; if (to) viaMoves(cid, i, to); };
      const tr = act.closest("tr");
      if (tr) act.querySelectorAll("button,select,a").forEach(el => { el.addEventListener("focus", () => tr.classList.add("hl")); el.addEventListener("blur", () => tr.classList.remove("hl")); });
    });
  }
  // صفوف نظيفة للطباعة (بلا إجراءات)
  const PCOLS = ["م", { t: "الطالب", w: 160 }, "جوال ولي الأمر", "النقاط", "الحضور", "المواد المرصودة"];
  const printRows = (rows, withClass) => rows.map((r, k) => {
    const c = r.c || byId(curCid), n = A().normMob(r.s.p), raw = String(r.s.p || "").trim();
    return [k + 1, `${esc(r.s.n)}${withClass ? `<br><small>${esc(c.name)}</small>` : ""}`, n ? `<span dir="ltr">${esc(n)}</span>` : raw ? `<span dir="ltr">${esc(raw)}</span>` : "—", r.agg.pts < 0 ? `<span dir="ltr">${r.agg.pts}</span>` : r.agg.pts, r.agg.att == null ? "—" : r.agg.att + "%", r.agg.n || "—"];
  });

  /* ═══ الرسم ═══ */
  async function render(box) {
    ensureCss();
    const s = S(), a = A(), H = a.H, list = cls();
    if (!list.length) { box.innerHTML = H.card("👥 الطلاب", H.empty("لا فصول مسجلة بعد")); return; }
    if (!curCid || !byId(curCid)) curCid = list[0].id;
    // حركة نقل جديدة منذ آخر رسم ⇒ رصد الفصول تغيّر (رُحِّلت مستندات) — أبطل الذاكرة المخبّأة
    const mvN = (s.D.moves || []).length;
    if (lastMoves >= 0 && mvN !== lastMoves) a.invalidate();
    lastMoves = mvN;

    const totalActive = list.reduce((n, c) => n + s.activeCount(c), 0);
    const withPhone = list.reduce((n, c) => n + s.activeStudents(c).filter(x => a.normMob(x.s.p)).length, 0);
    const movedOut = (s.D.moves || []).filter(m => m.to === "out" && !m.conflict).length;
    box.innerHTML = H.kpis([{ v: totalActive, l: "طالباً نشطاً" }, { v: list.length, l: "فصلاً" }, { v: withPhone, l: "بأرقام أولياء أمور" }]) +
      H.card("👥 طلاب المدرسة", `
        <div class="adm-tools ads-tools"><input class="search-box" id="ads-q" placeholder="🔎 ابحث باسم الطالب أو جواله في كل الفصول…" autocomplete="off" value="${esc(query)}">
          <select id="ads-sort" title="الترتيب"><option value="list">ترتيب القائمة</option><option value="pts">الأعلى نقاطاً</option><option value="att">الأعلى حضوراً</option><option value="name">أبجدياً</option></select>
          ${H.printBtn("ads-print")}<button class="btn-gold" id="ads-refresh" title="إعادة تحميل رصد كل المعلمين">🔄</button></div>
        <div id="ads-chips">${H.chips(list.map(c => ({ k: c.id, t: `${esc(c.name)} <small style="opacity:.75">${s.activeCount(c)}</small>` })), curCid, "c")}</div>
        <div id="ads-body"><div class="empty-note">جارِ جمع رصد كل المعلمين…</div></div>
        <div class="ads-cnt">👤 البطاقة الشاملة · ✏️ تعديل الاسم/الجوال · 💬 واتساب ولي الأمر · 🔁 نقل · 🚪 خروج${movedOut ? ` — ${movedOut} مسجَّل خروجه من المدرسة` : ""}</div>`);
    box.querySelector("#ads-sort").value = sortBy;

    const body = box.querySelector("#ads-body"), qEl = box.querySelector("#ads-q"), chips = box.querySelector("#ads-chips");
    let sd = null;
    try { sd = await a.schoolDocs(); } catch (e) { sd = { recs: {}, grades: {}, comms: {}, moves: [], assign: [], sedits: {}, adminlog: [] }; }
    if (!box.isConnected || box.querySelector("#ads-body") !== body) return;   // رُسم من جديد أثناء الانتظار
    let view = null;   // آخر عرض (للطباعة)

    function draw() {
      const q = query.trim();
      if (q.length >= 2) {
        const rows = searchRows(sd, q), nc = new Set(rows.map(r => r.c.id)).size;
        view = { title: `نتائج البحث عن «${q}»`, rows, withClass: true };
        chips.style.display = "none";
        body.innerHTML = `<div class="ads-head"><b>🔎 نتائج البحث عن «${esc(q)}»</b><span>${rows.length ? `${rows.length} طالباً في ${nc} ${nc === 1 ? "فصل" : "فصول"}${rows.more ? ` (عُرضت أول ${SEARCH_MAX})` : ""}` : ""}</span></div>` +
          (rows.length ? tableHtml(rows, true, "ads-table") : H.empty("لا طالب بهذا الاسم في المدرسة"));
      } else {
        chips.style.display = "";
        const c = byId(curCid), rows = classRows(sd, c), movedN = (c.students || []).filter(x => x.moved && !x.gap).length;
        // معلمو الفصل في سطر واحد (المادة ظاهرة، واسم المعلم في التلميح) — الجوال أولاً
        const tl = a.classTeachers(c.id).filter(t => !t.admin);
        const tHead = tl.length === 1 ? "معلم واحد" : tl.length === 2 ? "معلمان" : tl.length + " معلمين";
        const teachers = tl.map(t => `<span title="${esc(t.name)}">${esc(t.subject)}</span>`);
        const rated = rows.filter(r => r.agg.n).length, attAll = rows.filter(r => r.agg.att != null);
        const attAvg = attAll.length ? Math.round(attAll.reduce((x, r) => x + r.agg.att, 0) / attAll.length) : null;
        view = { title: `طلاب ${c.name}`, rows, withClass: false };
        body.innerHTML = `<div class="ads-head"><b>${esc(c.name)}</b><span>${rows.length} طالباً نشطاً${movedN ? ` · ${movedN} منقول` : ""}${rated ? ` · مرصود ${rated}` : " · لا رصد بعد"}${attAvg != null ? ` · متوسط الحضور ${attAvg}%` : ""}</span></div>` +
          (teachers.length ? `<div class="ads-sub">👨‍🏫 ${tHead}: ${teachers.join(" · ")}</div>` : "") +
          (rows.length ? tableHtml(rows, false, "ads-table") : H.empty("لا طلاب نشطين في هذا الفصل"));
      }
      bindTable(body, () => render(box));
    }
    H.bindChips(chips, (k) => { curCid = k; query = ""; qEl.value = ""; draw(); }, "c");
    let qT = null;
    qEl.oninput = () => { clearTimeout(qT); qT = setTimeout(() => { query = qEl.value; draw(); }, 160); };
    qEl.onkeydown = (e) => { if (e.key === "Escape") { clearTimeout(qT); qEl.value = ""; query = ""; draw(); } };
    box.querySelector("#ads-sort").onchange = (e) => { sortBy = e.target.value; draw(); };
    box.querySelector("#ads-refresh").onclick = async () => {
      body.innerHTML = '<div class="empty-note">جارِ التحديث…</div>';
      try { sd = await a.schoolDocs(true); } catch (e) { }
      draw(); toast("🔄 حُدِّث الرصد");
    };
    box.querySelector("#ads-print").onclick = () => {
      if (!view || !view.rows.length) { toast("لا صفوف للطباعة"); return; }
      const att = view.rows.filter(r => r.agg.att != null), avg = att.length ? Math.round(att.reduce((x, r) => x + r.agg.att, 0) / att.length) : null;
      const pts = Math.round(view.rows.reduce((x, r) => x + r.agg.pts, 0) * 10) / 10;
      try {
        a.printTable(view.title, PCOLS, printRows(view.rows, view.withClass), {
          sub: "👥 قائمة الطلاب — لوحة مدير المدرسة", cls: "compact",
          foot: ["", `الإجمالي: ${view.rows.length} طالباً`, "", pts, avg == null ? "—" : avg + "%", ""]
        });
      } catch (e) { toast("تعذّر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة"); }
    };
    draw();
    if (query.trim().length >= 2) { try { qEl.focus(); qEl.setSelectionRange(qEl.value.length, qEl.value.length); } catch (e) { } }
  }

  window.SIJIL_ADMIN_STUDENTS = { render, adminMessage, editSheet, viaMoves, searchRows, get cid() { return curCid; }, set cid(v) { curCid = v; } };
  if (window.SIJIL_ADMIN && typeof window.SIJIL_ADMIN.register === "function") window.SIJIL_ADMIN.register("students", render);
})();
