/* سجل المتابعة الرقمي — تطبيق الويب: معلم (سحابي/تجريبي) + بوابة طالب */
(function () {
  "use strict";
  const SALT = "sijil1448";
  const CLOUD = !!(window.FIREBASE_CONFIG && window.firebase && !/[?&]demo/.test(location.search));
  let D = null, META = null, W = null, STATES = null, BEH = null, TERM = "t1", ASSESS = null;
  let fdb = null;
  let MOVES_OK = true;                 // هل حُمِّلت حركات النقل من السحابة عند الإقلاع؟ (false ⇒ النقل معطّل وتُعرض آخر حركات محفوظة على الجهاز)
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
  const pad2 = (n) => (n < 10 ? "0" : "") + n;
  // تاريخ اليوم بتقويم الجهاز المحلي — toISOString() يعطي تاريخ الأمس بين منتصف الليل والثالثة فجراً بتوقيت السعودية (UTC+3)
  const todayISO = (dt) => { const d = dt || new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); };
  // أرقام عربية‑هندية (٠١٢) وفارسية (۰۱۲) وفاصلة عشرية عربية ⇒ صيغة يفهمها Number
  const arNum = (t) => String(t == null ? "" : t)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[٫،]/g, ".").trim();
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
  /* مفتاح التخزين المحلي يحمل المساحة: جهازٌ واحد قد يفتح مدرستين (مندوب بيعٍ يعرض
     التطبيق، أو مدير يجرّب حسابه ومدرسته) فلا تختلط قاعدتاهما على الجهاز. */
  const SPACE = String(window.SIJIL_SPACE || "");
  const KEY = (CLOUD ? "sijil.cloud.v1" : "sijil.v1") + (SPACE ? "." + SPACE : "");
  let DB = { recs: {}, grades: {}, comms: {}, session: null, srole: null };
  try { const raw = localStorage.getItem(KEY); if (raw) DB = Object.assign(DB, JSON.parse(raw)); } catch (e) { }
  const dirty = new Set();
  /* وسومٌ حُذف منها يوم رصد أو سجل: الرفع بـ set(...,{merge:true}) يدمج الخرائط المتداخلة فلا
     يحذف مفتاحاً أبداً، فتبقى الأيام الفارغة في السحابة إلى الأبد وتُقرأ «آخر رصد» في لوحة
     المدير. هذه الوسوم تُرفع باستبدال كامل (القواعد تسمح بالتقليص لمن له مطالبة sess). */
  const shrink = new Set();
  const dropped = {};                  // "recs:cid" → Set(تواريخ حُذفت على هذا الجهاز)
  function markDrop(cid, date) {
    const tag = "recs:" + cid;
    shrink.add(tag);
    if (date) { (dropped[tag] = dropped[tag] || new Set()).add(date); }
  }
  // رفضٌ من القواعد لا انقطاعُ شبكة (نسخة محلية من js/auth.js:isPerm — غير مُصدَّرة هناك)
  const isPerm = (e) => {
    const c = String((e && (e.code || e.message)) || "").toLowerCase();
    return c.indexOf("permission-denied") >= 0 || c.indexOf("permission_denied") >= 0;
  };
  let saveT = null, pushT = null;
  function save(tag) {
    if (tag) dirty.add(tag);           // "recs:cid" | "grades:cid" | "comms:cid"
    // تجريبياً: DB لا تحمل معرّف المعلم — نسجّل صاحب كل مستند حتى تنسب لوحة المدير الرصد لمن رصده فعلاً
    if (tag && !CLOUD && TE) { try { DB.by = (DB.by && typeof DB.by === "object" && !Array.isArray(DB.by)) ? DB.by : {}; DB.by[tag] = TE.id; } catch (e) { } }
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { } }, 250);
    if (CLOUD && TE) { clearTimeout(pushT); pushT = setTimeout(pushDirty, 1100); }
  }
  async function pushDirty() {
    if (!fdb || !TE) return;
    await refreshMoves({ render: true });          // جهاز آخر قد نقل طالباً والجلسة هنا مفتوحة: طبّق الجديد وأعد الرسم قبل الرفع
    for (const tag of [...dirty]) {
      dirty.delete(tag);
      const [kind, cid] = tag.split(":");
      const full = kind === "recs" && shrink.has(tag);      // استبدال كامل: حذفٌ لا يصله الدمج
      try {
        const payload = { tn: TE.name, ts: Date.now() };
        if (kind === "recs" && !full) payload.d = clone(DB.recs[cid] || {});
        if (full) {
          /* ننطلق من نسخة السحابة حتى لا تضيع أيام جهاز آخر لم تصل هذا الجهاز بعد:
             يومٌ موجود محلياً ⇒ النسخة المحلية · يومٌ حُذف هنا عمداً ⇒ يُسقط ·
             ما عداه ⇒ نسخة السحابة بعد نزع سجلاتها الفارغة. */
          let cd = {};
          try { const cur = await fdb.doc("recs/" + TE.id + "_" + cid).get(); if (cur.exists) cd = (cur.data() || {}).d || {}; } catch (e) { }
          const loc = DB.recs[cid] || {}, drop = dropped[tag] || new Set(), out = {};
          Object.keys(cd).forEach(dt => {
            if (loc[dt] || drop.has(dt)) return;
            const day = {}; Object.keys(cd[dt] || {}).forEach(si => { if (!emptyRec(cd[dt][si])) day[si] = cd[dt][si]; });
            if (Object.keys(day).length) out[dt] = day;
          });
          Object.keys(loc).forEach(dt => out[dt] = loc[dt]);
          payload.d = clone(out);
        }
        if (kind === "grades") payload.g = clone(DB.grades[cid] || {});
        if (kind === "comms") {                    // القائمة تُستبدل لا تُدمج بـ merge — فادمج مع النسخة السحابية أولاً حتى لا تضيع عناصر رُحِّلت من فصل آخر (نقل طالب) أو أُضيفت من جهاز آخر
          let list = clone(DB.comms[cid] || []);
          try {
            const cur = await fdb.doc("comms/" + TE.id + "_" + cid).get();
            const cl = cur.exists ? ((cur.data() || {}).c || []) : [];
            if (cl.length) { list = mergeComms(cl, list); if (list.length !== (DB.comms[cid] || []).length) { DB.comms[cid] = clone(list); save(); } }
          } catch (e) { }
          payload.c = list.slice(-500);
        }
        const ref = fdb.doc(kind + "/" + TE.id + "_" + cid);
        if (full) {
          /* التقليص يحتاج مطالبة sess (mayShrink في القواعد). جهاز بلا مطالبة يُرفض —
             ولا يجوز أن تتوقف مزامنة الرصد كلها من أجل تنظيف: نرجع إلى الدمج فيصل كل جديد،
             ويُؤجَّل التنظيف حتى يُعتمد الجهاز برقم المعلم (وشريط التنبيه يقولها). */
          try { await ref.set(payload); shrink.delete(tag); delete dropped[tag]; }
          catch (e2) {
            if (!isPerm(e2)) throw e2;
            shrink.delete(tag); delete dropped[tag];
            try { claimBar(); } catch (x) { }
            await ref.set({ tn: payload.tn, ts: payload.ts, d: clone(DB.recs[cid] || {}) }, { merge: true });
          }
        } else await ref.set(payload, { merge: true });
        syncBadge(true);
      } catch (e) {
        dirty.add(tag);
        // رفض صلاحية ≠ انقطاع إنترنت: «سيُرفع تلقائياً عند عودة الإنترنت» وعدٌ كاذب هنا
        if (isPerm(e)) { syncBadge("perm"); try { claimBar(); } catch (x) { } }
        else syncBadge(false);
      }
    }
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  // هوية عنصر التواصل (لا معرّف له): الطالب + الوقت + التاريخ + النص — للاتحاد بلا تكرار
  const commKey = (x) => [x.si, x.ts || "", x.date || "", x.why || "", x.via || "", x.note || ""].join("|");
  function mergeComms(base, extra) {             // اتحاد بالهوية مع حفظ الترتيب: الأساس ثم الجديد
    const seen = new Set(), out = [];
    (base || []).concat(extra || []).forEach(x => { if (!x) return; const k = commKey(x); if (seen.has(k)) return; seen.add(k); out.push(x); });
    return out;
  }
  window.addEventListener("online", () => { if (dirty.size) pushDirty(); });
  function syncBadge(ok) {
    const el2 = $("#demo-strip");
    if (!el2 || !CLOUD) return;
    // الحالة السليمة لا تُعرض إطلاقاً (شريط أخضر دائم بلا فائدة يأكل من الشاشة)؛ الشريط للمشاكل وحدها
    if (ok === true) { el2.style.display = "none"; el2.textContent = ""; return; }
    el2.style.display = "";
    el2.textContent = ok === "perm" ? "⛔ رُفض الحفظ لأن هذا الجهاز غير معتمد برقمك — سجّل خروجاً ثم دخولاً برقمك (ليست مشكلة إنترنت)"
      : "⚠️ لا اتصال الآن — سيُرفع رصدك تلقائياً عند عودة الإنترنت";
    el2.style.background = ok === "perm" ? "#d64545" : "#e8a23d"; el2.style.color = "#fff";
  }
  function rec(cid, date, si, make) {
    if (!make) { const day = (DB.recs[cid] || {})[date]; return (day && day[si]) || null; }   // قراءة محضة: لا تُنشئ يوماً ولا سجلاً
    DB.recs[cid] = DB.recs[cid] || {};
    DB.recs[cid][date] = DB.recs[cid][date] || {};
    if (!DB.recs[cid][date][si]) DB.recs[cid][date][si] = { a: null, part: 0, hw: null, sh: 0, beh: [], note: "" };
    return DB.recs[cid][date][si];
  }
  /* سجل يوم بلا رصد فعلي: يتخلّف عن فتح بطاقة الطالب أو نافذة الحالة ثم الإغلاق، أو عن «مسح الحالة».
     لا يُعدّ «يوم رصد» في calcStudent (فلا يهبط الحضور ولا الدرجة التلقائية)، ويُحذف من المخزون فور صيرورته فارغاً. */
  const emptyRec = (e) => !e || (e.a == null && !e.part && e.hw == null && !e.sh && !((e.beh || []).length) && !String(e.note || "").trim());
  /* الأجهزة العاملة تحمل بالفعل سجلات وأياماً فارغة تراكمت قبل هذا الإصلاح:
     تُكنس مرة واحدة عند الدخول، ولا يُرفع شيء إن لم يُحذف شيء. */
  function sweepRecs() {
    let n = 0;
    Object.keys(DB.recs || {}).forEach(cid => {
      const days = DB.recs[cid] || {}; let hit = false;
      Object.keys(days).forEach(dt => {
        const day = days[dt] || {};
        Object.keys(day).forEach(si => { if (emptyRec(day[si])) { delete day[si]; hit = true; } });
        if (!Object.keys(day).length) { delete days[dt]; markDrop(cid, dt); hit = true; }
      });
      if (hit) { markDrop(cid); n++; save("recs:" + cid); }
    });
    return n;
  }
  function pruneRec(cid, date, si) {
    const day = ((DB.recs[cid] || {})[date]); if (!day) return;
    if (emptyRec(day[si])) { delete day[si]; markDrop(cid); }
    if (!Object.keys(day).length) { delete DB.recs[cid][date]; markDrop(cid, date); }
  }

  /* ═══ الرصد بلا خوف: تراجع فوري عن كل إجراء ═══
     applyLive وact وstateSheet وbehSheet كانت تكتب بلا أي نظير يحذف (e.beh.push في ثلاثة مواضع)،
     فضغطة إبهام على الاسم المجاور تبقى سلوكاً سالباً على طفل بريء ينتقل إلى درجته ثم إلى رسالة أهله.
     المبدأ هنا واحد لكل الإجراءات: لقطةٌ من سجل الطالب (أو من اليوم كله في الإجراءات الجماعية)
     تُؤخذ قبل الكتابة وتُعاد كما هي عند التراجع — فيُسحب آخر عنصر من beh، وتعود الحالة السابقة،
     وينقص part، بلا حالة خاصة لكل إجراء ولا احتمال أن ينسى إجراءٌ جديد نظيرَه. */
  const snapRec = (cid, dt, i) => { const e = ((DB.recs[cid] || {})[dt] || {})[i]; return e ? clone(e) : null; };
  const snapDay = (cid, dt) => { const d = (DB.recs[cid] || {})[dt]; return d ? clone(d) : null; };
  function restoreRec(cid, dt, i, snap) {
    if (snap) { const e = rec(cid, dt, i, true); Object.keys(e).forEach(k => delete e[k]); Object.assign(e, clone(snap)); }
    else { const day = (DB.recs[cid] || {})[dt]; if (day) delete day[i]; }
    pruneRec(cid, dt, i); markDrop(cid); save("recs:" + cid);
  }
  function restoreDay(cid, dt, snap) {
    DB.recs[cid] = DB.recs[cid] || {};
    if (snap && Object.keys(snap).length) DB.recs[cid][dt] = clone(snap);
    else { delete DB.recs[cid][dt]; markDrop(cid, dt); }
    markDrop(cid); save("recs:" + cid);
  }
  /* الشريط يُلحق بـ fullscreenElement عند وجوده: ملء الشاشة لا يرسم إلا عنصر الملء وأبناءه،
     فشريطٌ في body يصير غير مرئي داخل الحصة الحية وهي أكثر مكان يُحتاج فيه. */
  let undoT = null;
  function undoBar(label, fn) {
    clearTimeout(undoT);
    const old = document.getElementById("undobar"); if (old) old.remove();
    const live = !!(document.fullscreenElement || ($("#view-live") && !$("#view-live").classList.contains("hidden")));
    const onsheet = !live && !!OV.querySelector(".overlay");   // نافذة مفتوحة: الشريط أعلى الشاشة حتى لا يغطي أزرارها
    const b = document.createElement("div");
    b.id = "undobar"; b.className = "undobar" + (live ? " onlive" : "") + (onsheet ? " onsheet" : "");
    b.innerHTML = '<span class="ut"></span><button type="button" class="ub">↩ تراجع</button>';
    b.querySelector(".ut").textContent = label;
    (document.fullscreenElement || document.body).appendChild(b);
    b.querySelector(".ub").onclick = () => { clearTimeout(undoT); b.remove(); try { fn(); } catch (e) { } };
    undoT = setTimeout(() => { const x = document.getElementById("undobar"); if (x) x.remove(); }, 6000);
  }
  const dropUndo = () => { clearTimeout(undoT); const x = document.getElementById("undobar"); if (x) x.remove(); };
  const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";
  // إشارة سالبة عربية (−) لا شرطة، وصفرٌ بلا إشارة
  const signN = (v) => { const x = Math.round((+v || 0) * 10) / 10; return (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x); };
  // أيقونة حالة الحضور — مشتركة بين بطاقات الروستر ونافذة التقييم وشريط التراجع (كانت محبوسة داخل liveActions)
  const ST_ICON = (n) => /حاضر/.test(n) ? "✅" : /متأخر/.test(n) ? "⏰" : /مستأذن/.test(n) ? "🚪" : /بعذر/.test(n) ? "📄" : /بعد/.test(n) ? "💻" : /هارب/.test(n) ? "🏃" : "❌";
  /* ═══ مفتاح الرصد: ماذا تعني 🙋 و📚 و⭐ وكيف يُتراجع ═══
     الشرح الوحيد قبل هذا كان في خاصية title ولا تظهر على الجوال أبداً، و📚 تدور بين ثلاث حالات
     بلا إعلان: من ينقر مرتين ظنّاً أنه يتراجع يضع على الطالب «لم يحلّ الواجب». */
  function keysHelpHTML() {
    const stChips = assessView(STATES).map(x => `<span class="kchip">${ST_ICON(x.name || "")} ${esc(x.name)} <b>${signN(x.pts || 0)}</b></span>`).join("");
    const bhChips = assessView(BEH).map(b => `<span class="kchip ${(+b.pts || 0) < 0 ? "neg" : ""}">${(+b.pts || 0) < 0 ? "⚠" : "⭐"} ${esc(b.name)} <b>${signN(b.pts || 0)}</b></span>`).join("");
    return `<h4>❔ مفتاح الرصد والتراجع</h4><div class="keyhelp">
      <p><b>🙋 المشاركة</b> — نقرة = <b>${signN(W.part)}</b> لكل مرة بلا سقف، والرقم على الزر عدّاد اليوم. و<b>ضغطة مطوّلة</b> على الزر تُصفّر العدّاد.</p>
      <p><b>📚 الواجب</b> — ثلاث حالات تدور بالنقر: <b>📚 لم يُرصد</b> ← <b>✅ حلّ (${signN(W.hw)})</b> ← <b>❌ لم يحلّ (0)</b> ← ثم تعود. فنقرتان <u>لا</u> تتراجعان بل تضعان «لم يحلّ».</p>
      <p><b>⭐ السلوك</b> — يفتح قائمة السلوكيات بقيمها، والتكرار مسموح ويظهر <span class="kx">×العدد</span>.</p>
      <p><b>الحالة</b> — الزر الملوّن يفتح حالات الحضور، و«مسح الحالة» يعيد الطالب إلى «لم يُرصد» ولا يُحسب عليه يوم.</p>
      <p class="und"><b>↩ التراجع</b> — بعد كل إجراء يظهر شريط أسفل الشاشة <b>ست ثوانٍ</b> فيه «↩ تراجع»، يُلغي ما سُجّل فعلاً ويعيد الحالة السابقة (في التحضير وفي الحصة الحية).</p>
      <div class="lsec2">📌 حالات الحضور وقيمها</div><div class="kchips">${stChips}</div>
      <div class="lsec2">⭐ السلوكيات وقيمها</div><div class="kchips">${bhChips}</div></div>`;
  }
  function keysHelp(inLive) {
    // داخل ملء الشاشة لا تُرسم نوافذ #overlay-root إطلاقاً — فنسخة الحصة الحية تمرّ عبر openLiveBox
    if (inLive) openLiveBox(keysHelpHTML() + `<div class="grid" style="margin-top:10px"><button type="button" class="act close" id="kh-x" style="grid-column:1/-1">تم</button></div>`, (o) => { o.querySelector("#kh-x").onclick = closeLiveBox; });
    else openSheet(keysHelpHTML() + `<div class="sheet-actions"><button class="btn-primary" onclick="window._sheetClose()">تم</button></div>`);
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

  /* ═══ نقل الطلاب: الفصول الفعلية = الأساسية + الحركات بالترتيب الزمني ═══
     الطالب المنقول لا يُحذف من مصفوفة فصله القديم (حتى لا تنزاح فهارس زملائه) بل يُعلَّم moved ويُخفى،
     وتُوضع نسخة منه في مصفوفة الفصل الجديد عند الفهرس newSi المسجَّل في الحركة (لا بالدفع الأعمى) لأن بياناته رُحِّلت إلى هذا الفهرس بعينه.
     - الموضع أبعد من الطول: تُملأ الفجوة بعناصر شاغرة (gap) حتى يبقى كل فهرس مطابقاً لما في السحابة.
     - الموضع محجوز بطالب فعلي (حركتان بنفس newSi من جهازين): تُهمل الحركة وتُعلَّم conflict ويبقى الطالب في فصله القديم — لا يُلصق ببيانات طالب آخر.
     - كل حركة تستهلك موضعها (to,newSi) حتى لو أُهملت لتكرارها، فلا يُعاد استخدام الموضع لطالب آخر.
     - حركة لم يوجد مصدرها بعد (سلسلة نقل بترتيب ts مقلوب) تُؤجَّل ويُعاد فحصها بعد البقية.
     synth: في صفحة الورقة لا يُحمَّل إلا فصل واحد، فيُركَّب الطالب القادم من فصل غير محمَّل من اسم الحركة. */
  const MOVE_CONFLICTS = [];
  const isGap = (s) => !!(s && s.gap);
  function applyMoves(classes, moves, synth) {     // classes: مصفوفة الفصول (تُعدَّل في مكانها) — moves بأي ترتيب
    const byId = {}; (classes || []).forEach(c => { c.students = c.students || []; byId[c.id] = c; });
    const gapItem = () => ({ n: "", p: "", gap: true, moved: { to: "gap", ts: 0 } });
    const slotOf = (m, dst) => (Number.isInteger(m.newSi) && m.newSi >= 0 && m.newSi < 400) ? m.newSi : dst.students.length;
    const reserve = (dst, nsi) => { while (dst.students.length <= nsi) dst.students.push(gapItem()); return dst.students[nsi]; };
    const done = new Set();                        // مفاتيح from:si المطبَّقة (لرفض المكرر حتى مع الطلاب المركَّبين)
    let pending = (moves || []).slice().sort((a, b) => ((a.ts || 0) - (b.ts || 0)) || String(a.id || "").localeCompare(String(b.id || "")));
    for (let pass = 0; pending.length && pass < 8; pass++) {
      const later = [];
      pending.forEach(m => {
        const key = m.from + ":" + m.si, src = byId[m.from], dst = m.to === "out" ? null : (byId[m.to] || null);
        const s = src ? src.students[m.si] : ((synth || isNewFrom(m.from)) ? { n: m.name || "", p: "" } : null);
        if (!s || isGap(s)) { later.push(m); return; }                                    // المصدر لم يوجد بعد — أجّل
        if (done.has(key) || s.moved) { if (dst) reserve(dst, slotOf(m, dst)); return; }  // مكررة: تستهلك موضعها فقط
        if (dst) {
          const nsi = slotOf(m, dst), occ = reserve(dst, nsi);
          if (!isGap(occ)) {                                                              // الموضع محجوز بطالب فعلي — لا تُطبَّق
            m.conflict = true; if (MOVE_CONFLICTS.indexOf(m) < 0) MOVE_CONFLICTS.push(m);
            try { console.warn("[moves] تعارض: الموضع " + m.to + "[" + nsi + "] محجوز — أُهملت الحركة " + (m.id || "") + " للطالب " + (m.name || "")); } catch (e) { }
            return;
          }
          /* fromChain: سلسلة المواضع التي مرّ بها الطالب من الأقدم إلى الأحدث. الاكتفاء بـfrom
             (خطوةٌ واحدة) كان يقطع الخيط عند النقلة الثانية: جوال وليّ الأمر لا يوجد إلا في
             sedits/{الفصل الذي كان فيه وقت الترقية}، فيختفي الرقم بلا رسالة بعد نقلتين. */
          const copy = Object.assign({}, s); delete copy.moved; delete copy.gap;
          copy.from = { cid: m.from, si: m.si, ts: m.ts };
          copy.fromChain = (s.fromChain || []).concat([{ cid: m.from, si: m.si }]);
          dst.students[nsi] = copy; m.appliedSi = nsi;
        }
        if (src) s.moved = { to: m.to, ts: m.ts };
        done.add(key);
      });
      if (later.length === pending.length) break;                                        // لا تقدم — البقية بلا مصدر
      pending = later;
    }
    pending.forEach(m => { const dst = m.to !== "out" && byId[m.to]; if (dst) reserve(dst, slotOf(m, dst)); });   // حركات بلا مصدر: تستهلك موضعها فقط
  }
  // معرّف الحركة مشتق من الموضع المحجوز: إلى فصل ⇒ {to}s{newSi} (مثل c4bs021)، خروج ⇒ {from}x{si} — والإنشاء فقط مسموح بالقواعد فلا يُحجز الموضع نفسه مرتين ولو من جهازين
  const moveId = (m) => { const pad = (n) => String(n).padStart(3, "0"); const id = m.to === "out" ? m.from + "x" + pad(m.si) : m.to + "s" + pad(m.newSi); return /^[a-z0-9]{4,12}$/.test(id) ? id : shortId(); };
  /* ═══ ➕ طالب مستجد ═══
     مستندات الفصول **مقفلة للكتابة** في القواعد (`allow write: if false`) — وهذا مقصود: قائمة
     الطلاب سجلٌّ رسمي لا يكتب عليه أربعة وعشرون معلماً. فالطالب الجديد لا يُضاف إلى classes، وإنما
     بحركةٍ **بلا فصلٍ مصدر**: from = "new_{cid}"، فيركّبه applyMoves من اسم الحركة (وهي الحيلة
     نفسها التي تركّب بها صفحة الورقة طالباً قادماً من فصل غير محمَّل). فيظهر المستجد عند كل معلم
     وفي بوابة الطالب وفي المطبوعات بلا مسار بيانات جديد ولا قاعدة جديدة ولا كتابة في مستند الفصل.
     ولماذا يحمل المفتاح اسم الفصل؟ لأن مفتاح التطبيق في applyMoves هو from:si، فمستجدّان في
     فصلين مختلفين بالموضع نفسه كانا سيتصادمان على المفتاح "new:21" فيسقط أحدهما صامتاً.
     والموضع يُحجز ذرّياً بمعرّف مشتق منه (moveId) والقواعد لا تسمح إلا بالإنشاء — فلا يأخذ
     جهازان الموضع نفسه. ولا ترحيل بيانات هنا: المستجد لا سجل له. */
  const NEW_FROM = (cid) => "new_" + cid;
  const isNewFrom = (f) => /^new(_[A-Za-z0-9]{1,12})?$/.test(String(f || ""));
  const NEW_LBL = "مستجد (طالب جديد)";
  /* ═══ 🗑 حذف طالب ═══
     الحذف الحقيقي ممنوع بقصد: مستند الفصل مقفل، وحركات النقل لا تُحدَّث ولا تُحذف في القواعد.
     ولو حُذفت الحركة لعاد الموضع فارغاً، ولوَرِثَ الطالبُ التالي رصدَ من كان قبله (recs مفاتيحها
     أرقام المواضع لا الأسماء) — وهذه أسوأ من أي زر. فالحذف = حركة خروج (to:"out"): يختفي من
     قوائم كل معلميه ومن المطبوعات ومن بوابته، ويبقى موضعه محجوزاً إلى الأبد فلا يرث أحدٌ رصده،
     ويبقى رصده السابق محفوظاً لا يُمحى. ومعرّف الحركة {cid}x{si} فريدٌ لكل موضع، فحذفٌ مكرر من
     جهازين لا يكتب مرتين — ويُقرأ الرفض «موجود» نجاحاً لا فشلاً. */
  async function removeStudent(cid, si) {
    const c = classById(cid);
    if (!c) return { ok: false, err: "لا فصل بهذا المعرّف" };
    if (!TE || !TE.admin) return { ok: false, err: "حذف الطلاب لمدير المدرسة وحده" };
    const i = +si, st = (c.students || [])[i];
    if (!st || st.gap) return { ok: false, err: "لا طالب في هذا الموضع" };
    if (st.moved) return { ok: true, already: true, name: String(st.n || ""), no: activeCount(c) };
    const nm = String(st.n || "").slice(0, 120);
    const m = { from: cid, si: i, to: "out", name: nm, newSi: 0, tn: TE ? TE.name : "", ts: Date.now() };
    const id = moveId(m);
    try {
      if (CLOUD && fdb) {
        const ref = fdb.doc("moves/" + id);
        await fdb.runTransaction(async tx => { const ex = await tx.get(ref); if (ex.exists) throw new Error("SLOT_TAKEN"); tx.set(ref, m); });
      } else {
        let stored = []; try { const raw = JSON.parse(localStorage.getItem(KEY) || "null"); stored = (raw && Array.isArray(raw.moves)) ? raw.moves : []; } catch (e) { }
        if (stored.concat(D.moves || []).some(x => x && x.id === id)) throw new Error("SLOT_TAKEN");
      }
      const rec = Object.assign({ id }, m);
      applyMoves(D.classes, [rec]); delete rec.appliedSi;
      D.moves = D.moves || []; D.moves.push(rec);
      if (!CLOUD) { DB.moves = D.moves; save(); } else saveCloudD();
      return { ok: true, name: nm, no: activeCount(classById(cid)), id: id, cname: c.name };
    } catch (e) {
      if (e && e.message === "SLOT_TAKEN") {
        // خروجُه مسجَّل من جهاز آخر: نُحدِّث القائمة ونعدّه نجاحاً — النتيجة المطلوبة قائمة
        try { await refreshMoves({ from: cid }); } catch (x) { }
        return { ok: true, already: true, name: nm, no: activeCount(classById(cid) || c) };
      }
      return { ok: false, err: "تعذّر الحذف — تحقق من الاتصال ثم أعد المحاولة" };
    }
  }
  async function addStudent(cid, name) {
    const c = classById(cid);
    if (!c) return { ok: false, err: "لا فصل بهذا المعرّف" };
    if (!TE || !TE.admin) return { ok: false, err: "إضافة الطلاب لمدير المدرسة وحده" };
    const nm = String(name || "").trim().replace(/\s+/g, " ").slice(0, 120);
    if (!nm) return { ok: false, err: "اكتب اسم الطالب" };
    const newSi = (c.students || []).length;
    if (newSi > 198) return { ok: false, err: "بلغ الفصل الحد الأقصى للمواضع (199)" };
    const m = { from: NEW_FROM(cid), si: newSi, to: cid, name: nm, newSi: newSi, tn: TE ? TE.name : "", ts: Date.now() };
    const id = moveId(m);
    let rec = null;
    try {
      if (CLOUD && fdb) {
        // حجز الموضع ذرّياً — كما في نقل الطالب حرفاً بحرف
        const ref = fdb.doc("moves/" + id);
        await fdb.runTransaction(async tx => { const ex = await tx.get(ref); if (ex.exists) throw new Error("SLOT_TAKEN"); tx.set(ref, m); });
      } else {
        let stored = []; try { const raw = JSON.parse(localStorage.getItem(KEY) || "null"); stored = (raw && Array.isArray(raw.moves)) ? raw.moves : []; } catch (e) { }
        if (stored.concat(D.moves || []).some(x => x && x.id === id)) throw new Error("SLOT_TAKEN");
      }
      rec = Object.assign({ id }, m);
      applyMoves(D.classes, [rec]); delete rec.appliedSi;
      D.moves = D.moves || []; D.moves.push(rec);
      if (!CLOUD) { DB.moves = D.moves; save(); } else saveCloudD();
      const st = ((classById(cid) || {}).students || [])[newSi];
      if (!st || st.gap || String(st.n || "") !== nm) return { ok: false, err: "لم يظهر الطالب في القائمة — أعد تحميل الصفحة ثم تحقّق قبل إعادة الإضافة" };
      return { ok: true, si: newSi, no: activeCount(classById(cid)), id: id, cname: c.name };
    } catch (e) {
      if (e && e.message === "SLOT_TAKEN") {
        try { await refreshMoves({ to: cid }); } catch (x) { }
        return { ok: false, retry: true, err: "أُضيف طالب في الموضع نفسه من جهاز آخر — حُدِّثت القائمة، أعد المحاولة" };
      }
      return { ok: false, err: "تعذّر الحفظ — تحقق من الاتصال ثم أعد المحاولة" };
    }
  }
  /* إعادة قراءة الحركات بعد الإقلاع (جهاز آخر أو تبويب أقدم نقل طالباً): تُطبَّق الجديدة فقط ثم يُعاد الرسم.
     سحابياً: نافذة 24 ساعة قبل آخر ts معروف (تحسّباً لانحراف الساعات) + استعلامان مستهدفان (to/from) عند تنفيذ نقل — تجريبياً: من localStorage لتزامن التبويبات. */
  let refreshingMv = false;
  const saveCloudD = () => { try { localStorage.setItem("sijil.cloudD", JSON.stringify(D)); } catch (e) { } };
  function absorbMoves(fresh) {
    const known = new Set((D.moves || []).map(m => m.id)), list = (fresh || []).filter(m => m && m.id && !known.has(m.id));
    if (!list.length) return 0;
    applyMoves(D.classes, list);
    applySedits(D.classes, D.sedits);
    D.moves = D.moves || []; list.forEach(m => { delete m.appliedSi; D.moves.push(m); });
    D.moves.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (CLOUD) saveCloudD();
    return list.length;
  }
  async function refreshMoves(opts) {
    if (!D || refreshingMv) return 0;
    refreshingMv = true;
    try {
      const fresh = [];
      if (!CLOUD) {
        try { const raw = JSON.parse(localStorage.getItem(KEY) || "null"); (raw && Array.isArray(raw.moves) ? raw.moves : []).forEach(m => fresh.push(Object.assign({}, m))); } catch (e) { }
      } else {
        if (!fdb || !MOVES_OK) return 0;
        const last = (D.moves || []).reduce((a, m) => Math.max(a, m.ts || 0), 0);
        const qs = [fdb.collection("moves").where("ts", ">", last - 86400000).get()];
        if (opts && opts.to && opts.to !== "out") qs.push(fdb.collection("moves").where("to", "==", opts.to).get());
        if (opts && opts.from) qs.push(fdb.collection("moves").where("from", "==", opts.from).get());
        const seen = new Set();
        (await Promise.all(qs)).forEach(snap => snap.forEach(d2 => { if (!seen.has(d2.id)) { seen.add(d2.id); fresh.push({ id: d2.id, ...d2.data() }); } }));
      }
      const n = absorbMoves(fresh);
      if (n && opts && opts.render && TE) rerenderTab();
      return n;
    } catch (e) { return 0; } finally { refreshingMv = false; }
  }
  function rerenderTab() {
    try { const tb = document.querySelector("#tabs button.on"); const nm = tb && tb.dataset.tab; if (adminView()) { window.SIJIL_ADMIN.render(nm); return; } if (nm === "today") renderToday(); else if (nm === "reg") renderReg(); else if (nm === "grades") renderGrades(); else if (nm === "rep") renderRep(); else if (nm === "more") renderMore(); } catch (e) { }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && TE) refreshMoves({ render: true }); });
  // مؤقّت شريطي «الحصة الحالية» و«الحصة القادمة»: يتوقف فور إخفاء الصفحة، ويعود عند الرجوع إليها
  document.addEventListener("visibilitychange", () => {
    try {
      if (document.hidden) { stopBell(); return; }
      const t = $("#tab-today");
      if (TE && t && !t.classList.contains("hidden") && $("#today-bell")) startBell();
    } catch (e) { }
  });
  const isActive = (c, i) => !!(c && c.students && c.students[i] && !c.students[i].moved);
  const activeStudents = (c) => ((c && c.students) || []).map((s, i) => ({ i, s })).filter(x => !x.s.moved);   // [{i, s}] بالفهرس الحقيقي
  const activeCount = (c) => activeStudents(c).length;

  /* ═══ تعديلات المدير على بيانات الطلاب: sedits/{cid} = { s: { "<si>": { p?: "05xxxxxxxx", n?: "الاسم المصحح" } }, tn, ts } ═══
     تُطبَّق بعد حركات النقل: الطالب المنقول يحمل from{cid,si} فتُطبَّق عليه تعديلات فصله الأصلي أولاً ثم تعديلات فصله الجديد (idempotent). */
  /* حقول بيانات الطالب التي يملكها المدير (وحدها تُطبَّق — ما عداها في المستند يُهمل):
       n الاسم · p جوال ولي الأمر · p2 جوال آخر · rel صفة وليّه · nat الجنسية · noor رقم نور
       health ملاحظات صحية · need احتياج خاص · note ملاحظة إدارية
     وكلها تُقرأ بمطالبة معلم وحدها (قاعدة sedits) فلا تصل بوابة الطالب ولا جهازاً مجهولاً —
     وفيها ملاحظاتٌ صحية، وهذا موضعها الصحيح. والقيمة الفارغة تمحو الحقل قصداً (المدير يفرّغه). */
  const SED_FIELDS = ["n", "p", "p2", "rel", "nat", "noor", "health", "need", "note"];
  function applySedits(classes, sedits) {
    if (!sedits || typeof sedits !== "object") return;
    const one = (s, e) => {
      if (!e || typeof e !== "object") return;
      SED_FIELDS.forEach(k => {
        const v = e[k];
        if (typeof v !== "string") return;
        if (k === "n") { if (v.trim()) s.n = v.trim(); return; }   // الاسم لا يُفرَّغ أبداً
        s[k] = v;
      });
    };
    const of = (cid, si) => (((sedits[cid] || {}).s || {})[si]);
    (classes || []).forEach(c => (c.students || []).forEach((s, i) => {
      if (!s || s.gap) return;
      // السلسلة من الأقدم إلى الأحدث، ثم تعديل الفصل الحالي فوقها — فتعديل اليوم يغلب دائماً
      (s.fromChain || (s.from && s.from.cid ? [s.from] : [])).forEach(f => { if (f && f.cid) one(s, of(f.cid, f.si)); });
      one(s, of(c.id, i));
    }));
  }

  /* ═══ النقاط والدرجات ═══ */
  /* تعريف واحد لحالات الحضور تستعمله الدرجة التلقائية ونسبة الحضور في البطاقة ورسائل أولياء الأمور:
     «عن بعد» حضور كامل · «متأخر» نصف حضور · «مستأذن/غائب بعذر» خارج المقام (غياب مأذون لا يُحاسَب). */
  /* العدّ بمسحةٍ واحدة على المكتبة كلها لا بأول تطابق: المدير يُعيد تسمية الحالات بحرية من
     لوحته (لا قيد على النصّ)، فحالتان تحملان «مستأذن» كانت تُحسب أُولاهما وحدها، وحالةٌ
     واحدة تحمل «مستأذن بعذر» كانت تُعدّ مرتين فيهبط مقام الحضور إلى الصفر أو دونه —
     ويتعدّى الأثر النسبة إلى الدرجة التلقائية. وهذا تعريف s/index.html نفسه. */
  const stSum = (t, re) => STATES.reduce((n, x, k) => n + (re.test(x.name || "") ? (t.st[k] || 0) : 0), 0);
  const stCnt = (t, name) => stSum(t, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const RE_EXC = /مستأذن|بعذر/;                          // غياب مأذون: خارج مقام الحضور
  /* غياب فعلي = «غائب» + «هارب» (والمأذون ليس منه) — التعريف نفسه في admin/core.js:attBucketOf===1.
     كانت المطبوعات والتقارير تقرأ st[1] وحدها فتطبع «0 غياب» لطالب هرب من حصتين. */
  const absCnt = (t) => (t.st || []).reduce((n, v, k) => {
    const nm = (STATES[k] || {}).name || "";
    return n + ((v && !/عذر|مستأذن/.test(nm) && /غائب|هارب/.test(nm)) ? v : 0);
  }, 0);
  /* آخر حالة مرصودة للطالب غياب/استئذان/هروب ⇒ لا يُصدّر لوحة الشرف اليوم.
     كان المرشّح في تبويب «التقارير» وحده، فيتصدّر الغائبُ لوحةَ شرف تبويب «اليوم». */
  function lastAwayOf(cid, i) {
    const cd = DB.recs[cid] || {}, dates = Object.keys(cd).sort().reverse();
    for (const d of dates) { const e = cd[d][i]; if (e && e.a != null && STATES[e.a]) return /غائب|مستأذن|بعذر|هارب/.test(STATES[e.a].name || ""); }
    return false;
  }
  const attPct = (t) => {
    const tot = t.st.reduce((x, y) => x + y, 0); if (!tot) return null;
    const denom = tot - stSum(t, RE_EXC); if (denom <= 0) return null;   // مسحةٌ واحدة: لا ازدواج
    const attended = stCnt(t, "حاضر") + stCnt(t, "عن بعد") + 0.5 * stCnt(t, "متأخر");
    return Math.round(Math.min(1, attended / denom) * 100);
  };
  function calcStudent(cid, si, recsOverride) {
    const out = { pts: 0, days: 0, st: STATES.map(() => 0), part: 0, hwY: 0, hwN: 0, sh: 0, behP: 0, behN: 0, notes: [] };
    const cd = recsOverride || DB.recs[cid] || {};
    for (const date of Object.keys(cd)) {
      const e = cd[date][si]; if (emptyRec(e)) continue;      // سجل فارغ (فتح بطاقة/نافذة حالة) ليس يوم رصد
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
  // صفوف بفهرس الطالب الحقيقي (calc[i]) — المنقول active:false وبلا ترتيب، والترتيب بين النشطين فقط بلا فجوة
  /* الترتيب التنافسي: المتساوون في النقاط يأخذون الرقم نفسه (1،1،1،4…). دالةٌ واحدة
     يستدعيها classCalc (البطاقة والشهادة ورسالة «مستوى ابنكم») وstudentText (رسالة الفترة)
     — وكان الثاني يحسبه بموضع الاسم في المصفوفة، فيستلم وليّ الأمر رقمين لابنه في اليوم نفسه.
     المدخل مرتَّبٌ تنازلياً بالنقاط. */
  function rankMap(sortedRows) {
    const rk = {}; let lastP = null, lastR = 0;
    (sortedRows || []).forEach((r, k) => { if (lastP === null || r.pts !== lastP) { lastR = k + 1; lastP = r.pts; } rk[r.i] = lastR; });
    return rk;
  }
  function classCalc(cid) {
    const c = classById(cid);
    const rows = c.students.map((s, i) => ({ i, s, active: !s.moved, t: calcStudent(cid, i) }));
    const sorted = rows.filter(r => r.active).sort((a, b) => b.t.pts - a.t.pts);
    // ترتيب تنافسي: المتساوون في النقاط يأخذون الرقم نفسه (1،1،1،4…) — الترتيب يُطبع لولي الأمر فلا يكسره موضع الاسم في المصفوفة
    const rk = rankMap(sorted.map(r => ({ i: r.i, pts: r.t.pts })));
    rows.forEach(r => r.rank = r.active ? (rk[r.i] || 0) : 0);
    return rows;
  }
  /* ═══ الدرجات التلقائية من الرصد اليومي وأوراق العمل التفاعلية ═══
     الحضور والمشاركة = حضور 60% + مشاركة 40% · السلوك = الدرجة العظمى + مجموع نقاط السلوك · أوراق العمل = متوسط (الواجبات، الأوراق التفاعلية)
     ما يكتبه المعلم يدوياً يغلب دائماً، ومسحه يعيد القيمة التلقائية. */
  const SUBS = {};   // cid → { ts, rows: [{si, sc, mx}] } تسليمات الأوراق التفاعلية لهذا المعلم
  async function loadSubs(cid) {
    if (!CLOUD || !fdb || !TE) return [];
    const c = SUBS[cid]; if (c && Date.now() - c.ts < 60000) return c.rows;
    try {
      const q = await fdb.collection("subs").where("cid", "==", cid).where("tid", "==", TE.id).get();
      const rows = []; q.forEach(d => { const x = d.data() || {}; if (+x.mx) rows.push({ si: +x.si, sc: +x.sc || 0, mx: +x.mx }); });
      SUBS[cid] = { ts: Date.now(), rows }; return rows;
    } catch (e) { SUBS[cid] = SUBS[cid] || { ts: Date.now(), rows: [] }; return SUBS[cid].rows; }
  }
  function autoGrade(cid, si, recsOverride) {
    const t = calcStudent(cid, si, recsOverride); const v = {}, why = {};
    const A = (k) => ASSESS.find(a => a.k === k);
    const cnt = (name) => stCnt(t, name);
    /* مقام الحضور = مقام attPct حرفاً بحرف (بطاقة الطالب ورسالة ولي الأمر ولوحة المدير):
       أيامُ الحالات وحدها، ناقصَ المأذون. اليوم الذي رُصدت فيه مشاركة أو سلوك بلا اختيار حالة
       — وهو المسار الطبيعي للحصة الحية — لا حالةَ له فلا يدخل المقام؛ كان يُحسب حضوراً صفرياً
       فيقتطع 60% من البند بينما تقول البطاقة «لا حضور مرصود». */
    const stD = t.st.reduce((x, y) => x + y, 0);          // أيام رُصدت فيها حالة حضور
    const excD = stSum(t, RE_EXC);                        // غياب مأذون: خارج المقام (مسحةٌ واحدة)
    const noSt = t.days - stD;                            // أيام رصد بلا حالة حضور
    const denom = stD - excD;
    if (t.days && A("part") && denom > 0) {
      const pres = cnt("حاضر"), late = cnt("متأخر"), remote = cnt("عن بعد");
      const attended = pres + remote + 0.5 * late, presD = pres + remote + late;
      // المشاركة تُنسب إلى أيام الحضور: بلا يوم حضور واحد لا تصير 100% — كان Math.max(1,…) يمنح الغائبَ الأربعين كاملة
      const attRate = Math.min(1, attended / denom), partRate = presD ? Math.min(1, t.part / presD) : 0;
      const mx = A("part").max; v.part = Math.round((mx * 0.6 * attRate + mx * 0.4 * partRate) * 10) / 10;
      const skip = [excD ? "استُثني " + excD + " بعذر" : "", noSt ? noSt + " بلا حالة حضور" : ""].filter(Boolean);
      why.part = "حضور " + Math.round(attRate * 100) + "% (60%) + مشاركة " + Math.round(partRate * 100) + "% (40%) من " + denom + " يوم حالة مرصودة" + (skip.length ? " (" + skip.join(" و") + ")" : "");
    }
    /* «لا مخالفات مرصودة» هدية لا تُمنح لمن لا يوم حضور له أصلاً: الطالب الغائب بعذر في كل أيامه
       كان يخرج 15/15 ⇒ «ممتاز 100%» في الدرجات والمستويات، وتهنئةً لولي أمره. */
    if (t.days && A("behave") && (denom > 0 || t.behP || t.behN)) {
      let sum = 0; const cd = recsOverride || DB.recs[cid] || {};
      for (const date of Object.keys(cd)) { const e = cd[date][si]; if (!e) continue; (e.beh || []).forEach(bi => { const b = BEH[bi]; if (b) sum += (+b.pts || 0); }); }
      const mx = A("behave").max; v.behave = Math.max(0, Math.min(mx, Math.round((mx + sum) * 10) / 10));
      why.behave = sum ? mx + (sum > 0 ? " + " : " − ") + Math.abs(Math.round(sum * 10) / 10) + " من سجل السلوك" : mx + " (لا مخالفات مرصودة)";
    }
    if (A("sheets")) {
      const comps = [], parts = []; const mx = A("sheets").max;
      if (t.hwY + t.hwN) { comps.push(t.hwY / (t.hwY + t.hwN)); parts.push("واجبات " + t.hwY + "/" + (t.hwY + t.hwN)); }
      const mine = ((SUBS[cid] || {}).rows || []).filter(r => r.si === si && r.mx);
      if (mine.length) { comps.push(mine.reduce((a, r) => a + Math.min(1, r.sc / r.mx), 0) / mine.length); parts.push(mine.length + " ورقة تفاعلية"); }
      if (comps.length) { v.sheets = Math.round(comps.reduce((a, b) => a + b, 0) / comps.length * mx * 10) / 10; why.sheets = parts.join(" + "); }
    }
    return { v, why };
  }
  function effGrades(cid, si, gOverride, recsOverride) {
    const manual = (gOverride || DB.grades[cid] || {})[si] || {};
    const out = Object.assign({}, autoGrade(cid, si, recsOverride).v);
    Object.keys(manual).forEach(k => { if (manual[k] != null && manual[k] !== "") out[k] = manual[k]; });
    return out;
  }
  const hasGrades = (cid, si, gOverride, recsOverride) => Object.keys(effGrades(cid, si, gOverride, recsOverride)).length > 0;
  function gradeTotal(cid, si, gOverride, recsOverride) {
    const g = effGrades(cid, si, gOverride, recsOverride);
    let sum = 0;
    ASSESS.forEach(a => { const v = +g[a.k]; if (!isNaN(v)) sum += Math.min(v, a.max); });
    return Math.round(sum * 10) / 10;
  }
  /* النسبة المئوية من البنود المرصودة فعلاً لا من maxTotal الثابت — نفس قاعدة بطاقة الطالب (studentSummary.filledMax):
     البنود التلقائية (مشاركة/سلوك/أوراق) سقفها 40 من 100، فحساب النسبة من 100 قبل رصد الاختبارات
     يجعل كل طالب منتظم «دون المطلوب». gradedMax = مجموع العظمى للبنود التي لها قيمة · gradePct = null إن لا بند. */
  function gradedMax(cid, si, gOverride, recsOverride) {
    const g = effGrades(cid, si, gOverride, recsOverride);
    return ASSESS.reduce((x, a) => x + (g[a.k] != null && g[a.k] !== "" && !isNaN(+g[a.k]) ? a.max : 0), 0);
  }
  function gradePct(cid, si, gOverride, recsOverride) {
    const g = effGrades(cid, si, gOverride, recsOverride);
    let sum = 0, mx = 0;
    ASSESS.forEach(a => { if (g[a.k] == null || g[a.k] === "") return; const v = +g[a.k]; if (isNaN(v)) return; sum += Math.min(v, a.max); mx += a.max; });
    return mx ? sum / mx * 100 : null;
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
  // طباعة النافذة المفتوحة كمستند نظيف (بلا أزرار ولا عناصر تحكم) في صفحة واحدة
  function printSheet() {
    const sh = OV.querySelector(".sheet"); if (!sh) return;
    const clone = sh.cloneNode(true);
    clone.querySelectorAll(".sheet-actions, button, .no-print, .class-chips, select, input[type=checkbox], input[type=date], input[type=datetime-local], .search-box").forEach(x => x.remove());
    clone.querySelectorAll("input, textarea").forEach(x => { const sp = document.createElement("span"); sp.textContent = x.value || ""; x.replaceWith(sp); });
    const h = clone.querySelector("h4"); const title = h ? h.textContent.trim() : document.title; if (h) h.remove();
    const wide = clone.querySelectorAll("table").length && Math.max(...[...clone.querySelectorAll("table tr")].map(tr => tr.children.length)) > 8;
    printDoc(title, `<div class="h"><div class="bar">${esc(META.school.name)}</div><div class="m">${esc(TE ? TE.subject : "")} — ${esc(TE ? TE.name : "")} — ${esc(hijriLabel())}</div></div><div class="tt">${esc(title)}</div><div class="sheetdoc">${clone.innerHTML}</div>`, { appCss: true, land: !!wide });
  }
  window._printSheet = printSheet;
  window._sheetClose = closeSheet;

  /* ═══════════ مكتبة التقييمات: cfg/assess فوق meta/app ═══════════
     meta/app مقفل للكتابة في القواعد، فتحكّم المدير في الدرجات يُحفظ في مستند cfg/assess ويُدمج
     فوقه هنا قبل أول رسم (كما يفعل cfg/bell وcfg/school). شكل التخزين:
       { states:[{k,t,v,c}], behaviors:[{k,t,v}], weights:{present,part,hw,absent,bad,sheets}, tn, ts }
     غياب المستند = ما في meta/app حرفياً (زائد الإضافات أدناه)، فلا تتغير مدرسة لم يضبطها مديرها.
     وأهمّ قاعدة هنا: فهرس العنصر لا يُزاح أبداً — rec.a وrec.beh مخزَّنان في recs بالرقم منذ أول يوم،
     فحذف سلوك يُبقيه هنا في موضعه شاهداً off:true (لا يظهر في أي قائمة اختيار، وتبقى نقاطه المرصودة
     سابقاً كما هي)، والجديد يُلحق في آخر المصفوفة. و🗑 في اللوحة تكتب off:true على العنصر (فتُحفظ
     درجته الأخيرة)؛ وإسقاطه من القائمة المحفوظة رأساً يُبقيه مخفياً كذلك لكن بدرجته في meta/app. وترتيب المدير يُحمل في o
     ويُطبَّق عند العرض وحده (assessView) لا في الفهارس. */
  const ASSESS_C = { ok: "var(--st0)", bad: "var(--st1)", warn: "var(--st2)", gray: "var(--st3)", info: "var(--st4)", violet: "var(--st5)", brown: "var(--st6)" };
  const ASSESS_CK = ["ok", "bad", "warn", "gray", "info", "violet", "brown"];
  const ASSESS_WK = ["present", "part", "hw", "absent", "bad", "sheets"];
  const ASSESS_MAX = 40;
  // إضافات صدرت بعد meta/app وهو مقفل لا يُعدَّل: تُلحق بالافتراضي فتظهر لكل مدرسة لم تضبط شيئاً
  const ASSESS_ADD = [{ k: "sleep", t: "النوم أثناء الحصة", v: -1 }];
  const aNum = (v) => { const x = Math.round((+v || 0) * 2) / 2; return isFinite(x) ? Math.min(20, Math.max(-20, x)) : 0; };
  const aTxt = (v, n) => String(v == null ? "" : v).trim().replace(/\s+/g, " ").slice(0, n);
  // المكتبة الافتراضية بشكل التخزين — مفاتيح ثابتة s0…/b0… مشتقة من ترتيب meta/app نفسه
  function assessDefault() {
    const m = (D && D.meta) || {};
    const states = (m.states || []).map((x, i) => ({ k: "s" + i, t: aTxt(x && x.name, 40), v: aNum(x && x.pts), c: ASSESS_CK[i] || "gray" }));
    const behaviors = (m.behaviors || []).map((x, i) => ({ k: "b" + i, t: aTxt(x && x.name, 40), v: aNum(x && x.pts) }));
    // بالمفتاح وبالاسم كليهما: مدرسة زُرع في meta/app لديها السلوك نفسه بمفتاح آخر لا يُكرَّر عليها
    ASSESS_ADD.forEach(a => { if (!behaviors.some(b => b.k === a.k || b.t === a.t)) behaviors.push({ k: a.k, t: a.t, v: a.v }); });
    const weights = {}; ASSESS_WK.forEach(k => { weights[k] = aNum((m.weights || {})[k]); });
    return { states, behaviors, weights };
  }
  function assessItem(x, wantC) {
    if (!x || typeof x !== "object" || Array.isArray(x)) return null;
    const k = aTxt(x.k, 12), t = aTxt(x.t, 40);
    if (!k || !t) return null;
    const o = { k, t, v: aNum(x.v) };
    if (wantC) o.c = (ASSESS_CK.indexOf(String(x.c || "")) >= 0) ? String(x.c) : "gray";
    if (x.off === true) o.off = true;      // مخفي: حذفه المدير من القوائم وبقيت درجته لما رُصد به سابقاً
    return o;
  }
  // تطبيع قائمة مخزَّنة: يُسقط ما لا يصلح والمكرر وما يتجاوز 40 (مستند مكتوب يدوياً قد يمرّ من القواعد)
  function assessNorm(raw, wantC) {
    const out = [], seen = {};
    if (!Array.isArray(raw)) return out;
    for (let i = 0; i < raw.length && out.length < ASSESS_MAX; i++) {
      const it = assessItem(raw[i], wantC);
      if (!it || seen[it.k]) continue;
      seen[it.k] = 1; out.push(it);
    }
    return out;
  }
  // الإعداد الفعّال بشكل التخزين وبترتيب المدير — كائن جديد في كل نداء، آمن لتعديل المستدعي
  function assessEff() {
    const def = assessDefault(), raw = (D && D.cfgAssess) || null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return def;
    const st = Array.isArray(raw.states) ? assessNorm(raw.states, true) : def.states;
    const bh = Array.isArray(raw.behaviors) ? assessNorm(raw.behaviors, false) : def.behaviors;
    const weights = {}; ASSESS_WK.forEach(k => { const v = (raw.weights || {})[k]; weights[k] = (v == null || !isFinite(+v)) ? def.weights[k] : aNum(v); });
    return { states: st.length ? st : def.states, behaviors: bh, weights };
  }
  // الدمج بترتيب المواضع (الافتراضي أولاً في مواضعه، ثم الجديد) → [{k, name, pts, c, o, off}]
  function assessMerge(def, eff) {
    const by = {}; eff.forEach((x, i) => { if (!(x.k in by)) by[x.k] = { x: x, o: i }; });
    const out = [], used = {};
    def.forEach(d => {
      const h = by[d.k];
      if (h) { used[d.k] = 1; out.push({ k: d.k, name: h.x.t, pts: h.x.v, c: h.x.c || d.c, o: h.o, off: !!h.x.off }); }
      else out.push({ k: d.k, name: d.t, pts: d.v, c: d.c, o: 1e6 + out.length, off: true });
    });
    eff.forEach((x, i) => { if (!used[x.k]) { used[x.k] = 1; out.push({ k: x.k, name: x.t, pts: x.v, c: x.c, o: i, off: !!x.off }); } });
    return out;
  }
  /* يُنادى قبل أول رسم وبعد كل حفظ: يعيد بناء META.states/behaviors/weights وSTATES/BEH/W والألوان.
     لا يمسّ D.meta أبداً (META نسخة سطحية): النسخة الاحتياطية في لوحة المدير تحفظ D.meta الخام. */
  function assessApply() {
    if (!META) return;
    const def = assessDefault(), eff = assessEff();
    META.states = assessMerge(def.states, eff.states);
    META.behaviors = assessMerge(def.behaviors, eff.behaviors);
    META.weights = Object.assign({}, def.weights, eff.weights);
    STCOLORS.length = 0;
    META.states.forEach(x => STCOLORS.push(ASSESS_C[x.c] || ASSESS_C.gray));
    W = META.weights; STATES = META.states; BEH = META.behaviors;
  }
  /* عناصر المكتبة للعرض: بترتيب المدير، بلا المحذوف، ومع الفهرس الحقيقي i الذي تُخزَّن به السجلات */
  const assessView = (list) => (list || []).map((x, i) => ({ i: i, k: x.k, name: x.name, pts: +x.pts || 0, c: x.c, o: (x.o == null ? i : x.o), off: !!x.off }))
    .filter(x => !x.off).sort((a, b) => (a.o - b.o) || (a.i - b.i));

  /* ═══ اتصال ═══ */
  async function bootCloud() {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    // App Check: لا تُقبل طلبات Firestore إلا من موقعنا (reCAPTCHA Enterprise غير مرئي)
    try { if (firebase.appCheck && window.APPCHECK_SITE_KEY) firebase.appCheck().activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(window.APPCHECK_SITE_KEY), true); } catch (e) { }
    await firebase.auth().signInAnonymously();
    // مساحة المدرسة: كل مسارٍ يُسبق بها (js/fb.js) — ومدرستنا الأولى في الجذر بلا بادئة
    fdb = (window.sijilSpaceDb ? window.sijilSpaceDb(firebase.firestore()) : firebase.firestore());
    // مستند المساحة: اسم المدرسة وخطتها ومتى تنتهي تجربتها — قراءةٌ واحدة عند الإقلاع
    try { await loadSpace(); } catch (e) { }
    const [metaS, teachS, clsS, schS] = await Promise.all([
      fdb.doc("meta/app").get(), fdb.collection("teachers").get(),
      fdb.collection("classes").get(), fdb.doc("schedule/all").get()]);
    const teachers = []; teachS.forEach(d2 => teachers.push({ id: d2.id, ...d2.data() }));
    teachers.sort((a, b) => a.id.localeCompare(b.id));
    const classes = []; clsS.forEach(d2 => classes.push({ id: d2.id, ...d2.data() }));
    // حركات نقل الطلاب (كلها) تُطبَّق على الفصول الأساسية قبل أي عرض وقبل enter()
    let moves = null;
    try { const mv = await fdb.collection("moves").get(); moves = []; mv.forEach(d2 => moves.push({ id: d2.id, ...d2.data() })); } catch (e) { moves = null; }
    MOVES_OK = !!moves;
    if (!moves) {   // لا نبتلع الفشل: فصول أساسية بلا حركات تُظهر المنقولين نشطين وتُفسد newSi — نستعمل آخر حركات محفوظة على الجهاز (والنقل معطّل)، وإلا نُفشل الإقلاع
      try { const old = JSON.parse(localStorage.getItem("sijil.cloudD") || "null"); if (old && Array.isArray(old.moves)) moves = old.moves.map(m => { const x = Object.assign({}, m); delete x.appliedSi; delete x.conflict; return x; }); } catch (e) { }
      if (!moves) throw new Error("MOVES_UNAVAILABLE");
    }
    moves.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    applyMoves(classes, moves);
    // تعديلات المدير على أرقام أولياء الأمور/الأسماء (sedits) — بعد الحركات حتى تلحق بالمنقولين
    let sedits = {};
    try { const se = await fdb.collection("sedits").get(); se.forEach(d2 => sedits[d2.id] = d2.data() || {}); } catch (e) { sedits = {}; }
    applySedits(classes, sedits);
    // إعدادات المدرسة: cfg/bell (جدول الأجراس) وcfg/school (أسماء الإدارة) وcfg/assess (مكتبة التقييمات ودرجاتها)
    //   — غيابها أو تعذّر قراءتها = الافتراضي ولا يُفشل الإقلاع
    let bellCfg = null, schoolCfg = null, assessCfg = null;
    try {
      const [bs, ss, as] = await Promise.all([fdb.doc("cfg/bell").get(), fdb.doc("cfg/school").get(), fdb.doc("cfg/assess").get()]);
      if (bs.exists) bellCfg = bs.data() || null; if (ss.exists) schoolCfg = ss.data() || null; if (as.exists) assessCfg = as.data() || null;
    }
    catch (e) {
      // فشل القراءة (قاعدة غير منشورة أو App Check أو انقطاع) ≠ «لم يضبط المدير شيئاً»: نُبقي آخر إعداد محفوظ
      // على الجهاز حتى لا ترتدّ المدرسة كلها إلى الأوقات الافتراضية بصمت، ونترك أثراً في الكونسول.
      try { const old = JSON.parse(localStorage.getItem("sijil.cloudD") || "null"); if (old) { bellCfg = old.bell || null; schoolCfg = old.cfgSchool || null; assessCfg = old.cfgAssess || null; } } catch (x) { }
      try { console.warn("[سجلي] تعذّرت قراءة إعدادات المدرسة (cfg/bell وcfg/school وcfg/assess) — استُعملت النسخة المحفوظة على الجهاز إن وُجدت:", (e && e.message) || e); } catch (x) { }
    }
    /* meta/app هو أصل كل شيء (الأوزان والحالات والسلوكيات واسم المدرسة). كان يُمرَّر
       metaS.data() كما هو، فإن لم يوجد المستند أو رُفضت قراءته صار undefined ثم انفجر
       `META.weights` بعد الـtry فمات الإقلاع صامتاً: الشاشة تقول «☁️ متصل بقاعدة المدرسة —
       دخول المعلم» وقائمة المعلمين فارغة تماماً بلا أي تفسير. نعامله معاملة حركات النقل:
       آخر نسخة محفوظة على الجهاز، وإلا فشل صريح برسالة. */
    let meta = (metaS && metaS.exists) ? (metaS.data() || null) : null;
    if (!meta) {
      try { const old = JSON.parse(localStorage.getItem("sijil.cloudD") || "null"); if (old && old.meta) meta = old.meta; } catch (e) { }
      try { console.warn("[سجلي] تعذّرت قراءة meta/app — " + (meta ? "استُعملت النسخة المحفوظة على الجهاز" : "لا نسخة محفوظة")); } catch (e) { }
    }
    if (!meta) throw new Error("META_UNAVAILABLE");
    D = { meta, teachers, classes, schedule: (schS.data() || {}).rows || [], moves, sedits, bell: bellCfg, cfgSchool: schoolCfg, cfgAssess: assessCfg };
    try { localStorage.setItem("sijil.cloudD", JSON.stringify(D)); } catch (e) { }
  }
  function bootOffline() {
    try { const raw = localStorage.getItem("sijil.cloudD"); if (raw) { D = JSON.parse(raw); return true; } } catch (e) { }
    return false;
  }
  async function boot() {
    if (CLOUD) {
      $("#lg-demo").innerHTML = "جارِ الاتصال بقاعدة المدرسة… ⏳";
      try { await bootCloud(); $("#lg-demo").innerHTML = "☁️ متصل بقاعدة المدرسة<br><b>دخول المعلم: رقم هويتك المسجل — الطالب: يختار صفه واسمه</b>" + (MOVES_OK ? "" : "<br>⚠️ تعذّر تحميل حركات نقل الطلاب — تُعرض آخر قائمة محفوظة على هذا الجهاز، والنقل معطّل حتى إعادة التحميل"); }
      catch (e) {
        if (e && e.message === "MOVES_UNAVAILABLE") { $("#lg-demo").innerHTML = "❌ تعذّر تحميل حركات نقل الطلاب من السحابة ولا نسخة محفوظة على هذا الجهاز — لا يُفتح السجل بقائمة قديمة. أعد تحميل الصفحة."; return; }
        if (e && e.message === "META_UNAVAILABLE") { $("#lg-demo").innerHTML = "❌ تعذّر تحميل بيانات المدرسة الأساسية (meta/app) ولا نسخة محفوظة على هذا الجهاز. أعد تحميل الصفحة، وإن تكرّر فتواصل مع أ. ضيف الله."; return; }
        if (bootOffline()) $("#lg-demo").innerHTML = "⚠️ لا اتصال بالإنترنت — نسخة محفوظة على جهازك، وسيُرفع رصدك عند عودة الاتصال";
        else { $("#lg-demo").innerHTML = "❌ تعذر الاتصال. تأكد من الإنترنت وأعد تحميل الصفحة."; return; }
      }
    } else {
      D = clone(window.DEMO);                       // نسخة عميقة حتى لا تتراكم الحركات على window.DEMO عند إعادة التحميل
      if (!Array.isArray(DB.moves)) DB.moves = [];
      applyMoves(D.classes, DB.moves); D.moves = DB.moves;
      if (!DB.sedits || typeof DB.sedits !== "object" || Array.isArray(DB.sedits)) DB.sedits = {};
      applySedits(D.classes, DB.sedits); D.sedits = DB.sedits;
      D.bell = DB.bell || null; D.cfgSchool = DB.cfgSchool || null; D.cfgAssess = DB.cfgAssess || null;   // الوضع التجريبي: إعدادات المدرسة على هذا الجهاز
    }
    /* META نسخة سطحية من D.meta لا هو نفسه: دمج مكتبة التقييمات يكتب states/behaviors/weights،
       ولو كتبها في D.meta لسرت المكتبة المدموجة إلى sijil.cloudD وإلى النسخة الاحتياطية بدل الأصل. */
    META = Object.assign({}, D.meta || {}); META.school = META.school || { name: "مدرستي", term_lbl: "" };
    assessApply();                       // cfg/assess فوق META.states/behaviors/weights — قبل أول رسم
    W = META.weights || {}; STATES = META.states || []; BEH = META.behaviors || [];
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
  /* رقم دخول قصير (أقل من ٦ خانات): js/auth.js يعيد weak:true ولم يكن أحد يقرؤه، فالتنبيه
     الذي يَعِد به التصميم لا يظهر لأحد. يُعرض سطراً واحداً في «المزيد» فوق بطاقة الحساب
     (حيث زر «🔐 تغيير رقم الدخول»)، ويُخفى نهائياً إن صرفه المعلم. */
  let PIN_WEAK = false;
  const weakSeenKey = () => "sijil.pinweak.off." + ((TE && TE.id) || "");
  function initLogin() {
    $("#lg-school").textContent = META.school.name;
    /* مدخل «مدرسة جديدة»: يظهر سحابياً لكل من يقف على شاشة الدخول — الزائر يؤسّس مدرسته
       في ثوانٍ، ومعلمو مدرستنا لا يعنيهم فهو سطرٌ صغير أسفل البطاقة. */
    const nb = $("#lg-new");
    if (nb && CLOUD) { nb.hidden = false; nb.onclick = () => signupSchool(); }
    const pb = $("#pt-start");
    if (pb) pb.onclick = () => { if (CLOUD) signupSchool(); else alert("التجربة تحتاج النسخة السحابية"); };
    try { trialBar(); } catch (e) { }
    const sel = $("#lg-teacher");
    sel.innerHTML = '<option value="">— اختر اسمك —</option>' +
      D.teachers.filter(t => (t.classes || []).length || t.admin || t.reg === true).map(t => `<option value="${t.id}">${esc(t.name)}${t.admin ? " (المدير)" : ""}</option>`).join("");
    $("#lg-btn").onclick = async () => {
      const t = D.teachers.find(x => x.id === sel.value);
      const pin = $("#lg-pin").value.trim();
      if (!t) { $("#lg-err").textContent = "اختر اسمك من القائمة"; return; }
      // التحقق عبر js/auth.js (بصمات في pins بدل مستند المعلم) — وإن لم يُحمَّل الملف يبقى التحقق القديم حرفياً
      const AU = window.SIJIL_AUTH;
      // تجريبياً: الرقم 1234 يبطل لمن غيّر رقمه على هذا الجهاز — فلا نرشده إلى رقم لم يعد يعمل.
      //   تُقرأ الحالة بعد التحقق لا قبله، لأن js/auth.js يستعيد حالة الحسابات عند أول تحقق.
      const badMsg = () => CLOUD ? "رقم الهوية غير صحيح"
        : ((AU && typeof AU.isRegistered === "function" && AU.isRegistered(t))
          ? "رقم الدخول غير صحيح — هذا الحساب غُيّر رقمه على هذا الجهاز، فاستعمل الرقم الجديد"
          : "رقم الدخول غير صحيح (التجريبي: 1234)");
      if (AU && typeof AU.verify === "function") {
        $("#lg-err").textContent = "جارِ التحقق…";
        let vr = null;
        try { vr = await AU.verify(t.id, pin); } catch (e) { vr = null; }
        PIN_WEAK = !!(vr && vr.ok && vr.weak);
        if (!vr || !vr.ok) {
          const m = vr && vr.err, M = AU.MSG || {};
          $("#lg-err").textContent = (!m || m === M.bad || m === M.fmt || m === M.pick) ? badMsg() : m;
          return;
        }
      } else if (CLOUD) {
        if (!t.pinHash) { $("#lg-err").textContent = "لم تُسجل هويتك بعد — تواصل مع أ. ضيف الله"; return; }
        $("#lg-err").textContent = "جارِ التحقق…";
        if (await sha256(pin + "|" + t.id + "|" + SALT) !== t.pinHash) { $("#lg-err").textContent = badMsg(); return; }
      } else if (pin !== "1234") { $("#lg-err").textContent = badMsg(); return; }
      $("#lg-err").textContent = ""; DB.session = t.id; DB.srole = "teacher"; save();
      enter(t);
    };
  }
  /* مطالبة الجلسة (sess/{uid}) تُكتب في js/auth.js:verify وحدها. كل جهاز كانت جلسته محفوظة
     قبل نشر الميزة يستأنف بلا مطالبة، فتُرفض كل كتابة مشروطة بها: إعدادات المدرسة وأسماء
     الإدارة، إضافة معلم، إنقاص فصوله، حذف حصة من الجدول العام، وتقليص أيام الرصد. */
  const claimOK = () => {
    if (!CLOUD) return true;
    const AU = window.SIJIL_AUTH;
    if (!AU || typeof AU.hasClaim !== "function" || !TE) return true;
    try { return !!AU.hasClaim(TE.id); } catch (e) { return true; }
  };
  function claimBar(again) {
    const host = $("#view-app"); if (!host || !TE) return;
    /* js/auth.js يُنفَّذ بعد js/app.js في الصفحة، وقد يصل enter() قبله على اتصال سريع:
       فحصٌ مبكّر يقول «لا مطالبة مفقودة» زوراً — نعيد الفحص مرة بعد لحظة. */
    const AU = window.SIJIL_AUTH;
    if (CLOUD && !(AU && typeof AU.hasClaim === "function") && !again) { setTimeout(() => claimBar(true), 1500); return; }
    let el = $("#claim-bar");
    if (claimOK()) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div"); el.id = "claim-bar"; el.className = "claim-bar";
      const hd = host.querySelector(".appbar");
      host.insertBefore(el, hd ? hd.nextSibling : host.firstChild);
    }
    el.innerHTML = `<span>🔐 هذا الجهاز لم يُعتمد برقمك بعد تحديث التطبيق، فتُرفض عليه: <b>إرسال الأوراق إلى حسابات الطلاب</b> و<b>رسائل حساب الطالب</b> و<b>قراءة الأوراق المرسلة ونتائجها</b> والحفظ في إعدادات المدرسة والمعلمين والجدول (وليس سببه الإنترنت). أدخل رقمك مرة واحدة ويبقى الجهاز معتمداً.</span><button class="btn-gold" id="claim-go">🔓 اعتماد الجهاز الآن</button>`;
    const b = $("#claim-go"); if (b) b.onclick = () => { DB.session = null; DB.srole = null; save(); setTimeout(() => location.reload(), 250); };
  }
  /* ═══ البيانات الخاصة (sedits): جوالات أولياء الأمور وتصحيحات الأسماء ═══
     جوال ولي الأمر كان داخل مستند الفصل، ومستندات الفصول تُقرأ من أي جهاز مصادَق — وبوابة
     الطالب تفتح بحساب مجهول، فكان أي طالب يفتح الطرفية ويقرأ أسماء المدرسة كلها وجوالات
     أولياء أمورهم. فانتقلت الأرقام إلى sedits وقراءتها تشترط مطالبة معلم (sess)، وصارت تُقرأ
     بعد الدخول لا في الإقلاع. الإقلاع يُحاول أيضاً (الجلسة المستأنفة مطالبتها قائمة).
     وتُطبَّق بـapplySedits نفسها: هي وحدها التي تلحق بالطالب المنقول عبر s.from. */
  async function loadPrivate() {
    if (!CLOUD || !fdb || !TE) return false;
    let sedits = null;
    try {
      const se = await fdb.collection("sedits").get();
      sedits = {}; se.forEach(d => sedits[d.id] = d.data() || {});
    } catch (e) { return false; }
    if (!Object.keys(sedits).length && D.sedits && Object.keys(D.sedits).length) return false;
    applySedits(D.classes, sedits);
    D.sedits = sedits;
    try { localStorage.setItem("sijil.cloudD", JSON.stringify(D)); } catch (e) { }
    return true;
  }
  async function enter(t) {
    TE = t;
    $("#view-login").classList.add("hidden");
    // قسم المزايا والسعر يُخفى معها: هو للزائر لا لمن دخل
    try { const pt = $("#view-pitch"); if (pt) pt.classList.add("hidden"); } catch (e) { }
    $("#view-app").classList.remove("hidden");
    $("#ab-who").textContent = t.name + " — " + (t.admin ? "مدير المدرسة" : t.subject);
    // 🎖️ شارة «رائد فصل» بجانب الاسم (js/admin/teachers.js) — بعد كتابة النص لأنها تستبدل محتوى #ab-who
    try { if (window.SIJIL_ADMIN && typeof window.SIJIL_ADMIN.refreshHeader === "function") window.SIJIL_ADMIN.refreshHeader(); } catch (e) { }
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
    // جوالات أولياء الأمور وتصحيحات الأسماء: قراءتها تشترط مطالبة معلم، ولا تُقرأ في الإقلاع المجهول
    try { await loadPrivate(); } catch (e) { }
    try { sweepRecs(); } catch (e) { }                        // تنظيف أيام الرصد الفارغة المتراكمة قبل أول رسم
    try { loadLogo(true); } catch (e) { }                     // شعار المدرسة لترويسة المطبوعات (لا ينتظره أحد)
    renderToday(); renderReg(); renderGrades(); renderRep(); renderMore();
    // لوحة المدير (js/admin/core.js): تعيد بناء شريط التبويبات — سبعة إدارية، أو تبويبات المعلم مع زر التبديل في الرأس إن كان للمدير فصول
    let adm = false;
    if (t.admin && window.SIJIL_ADMIN && typeof window.SIJIL_ADMIN.init === "function") { try { adm = !!window.SIJIL_ADMIN.init(t); } catch (e) { adm = false; try { console.error("[admin] init", e); } catch (x) { } } }
    switchTab(adm ? "home" : "today");
    try { claimBar(); } catch (e) { }
  }
  $("#ab-logout").onclick = () => { DB.session = null; DB.srole = null; save(); setTimeout(() => location.reload(), 300); };

  /* ═══════════ أوقات الحصص وسطر التواقيع — المصدر الوحيد: لوحة المدير (js/admin/core.js) ═══════════
     BELL() تعيد محرك جدول الأجراس من SIJIL_ADMIN (أوقات مدرسة المستخدم من cfg/bell)، وإن لم تُحمَّل اللوحة
     تعيد FALLBACK: الجدول الافتراضي القديم حرفياً (7:00 · 45 دقيقة · 7 حصص · فسحة 30 بعد الثالثة).
     ولا يُكتب أي وقت ثابت في هذا الملف خارج هذه الكتلة.
     sigLine(roles) سطر تواقيع المطبوعات: الاسم من cfg/school إن ضبطه المدير وإلا النقاط كما كانت. */
  const SIG_LBL = { principal: "مدير المدرسة", vice: "وكيل الشؤون التعليمية", agent: "وكيل شؤون الطلاب", counselor: "المرشد الطلابي" };
  const FALLBACK = (function () {
    const ORD = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية عشرة", "الثانية عشرة"];
    const hm = (m) => `${Math.floor(m / 60)}:${String(Math.round(m) % 60).padStart(2, "0")}`;
    const LIST = [];
    for (let p = 1, t = 420; p <= 7; p++) { LIST.push({ p, from: t, to: t + 45 }); t += 45; if (p === 3) { LIST.push({ brk: true, n: "الفسحة", from: t, to: t + 30 }); t += 30; } }
    const at = (d, brk) => { const x = d || new Date(), m = x.getHours() * 60 + x.getMinutes(); return LIST.find(b => !!b.brk === brk && m >= b.from && m < b.to) || null; };
    const cp = (b) => Object.assign({}, b);
    const dots = (n) => new Array(Math.max(4, +n || 14) + 1).join(".");
    const cell = (r) => {
      if (typeof r === "string") r = SIG_LBL[r] ? { k: r } : { l: r };
      r = r || {};
      const cfg = (D && D.cfgSchool) || null;
      const val = String((r.v != null ? r.v : (r.k && cfg ? (cfg[r.k] || "") : "")) || "").trim();
      return `<span>${esc(r.l || SIG_LBL[r.k] || "")}: ${val ? esc(val) : dots(r.dots)}</span>`;
    };
    return {
      hm, ord: (p) => ORD[p] || String(p),
      periodsOf: () => LIST.map(cp),
      periodsOnly: () => LIST.filter(b => !b.brk).map(cp),
      periodNow: (d) => { const b = at(d, false); return b ? b.p : 0; },
      breakNow: (d) => { const b = at(d, true); return b ? { n: b.n, from: b.from, to: b.to, ends: hm(b.to), toString() { return this.n; } } : null; },
      periodTime: (p) => { const b = LIST.find(x => !x.brk && x.p === +p); return b ? hm(b.from) + "–" + hm(b.to) : ""; },
      sigLine: (roles) => `<div class="sig">${(Array.isArray(roles) ? roles : [roles]).map(cell).join("")}</div>`
    };
  })();
  const BELL = () => { const A = window.SIJIL_ADMIN; return (A && typeof A.periodsOf === "function" && typeof A.breakNow === "function") ? A : FALLBACK; };
  // أيام الدراسة من المحرك (الأحد…الخميس) — نفس مصدر لوحة المدير حتى لا يقول الشريط «الحصة الثالثة» يوم الجمعة
  const SDAYS = () => { const A = window.SIJIL_ADMIN; try { if (A && typeof A.schoolDays === "function") { const d = A.schoolDays(); if (Array.isArray(d) && d.length) return d; } } catch (e) { } return DAYS.slice(0, 5); };
  const sigLine = (roles) => { const A = window.SIJIL_ADMIN; return (A && typeof A.sigLine === "function") ? A.sigLine(roles) : FALLBACK.sigLine(roles); };
  /* ═══ اسم وكيل المدرسة ومديرها في الشهادات ═══
     الشهادة ورقةٌ يعلّقها البيت ويوقّعها المدير: سطرُ تواقيعها يحمل الاسمين المضبوطين في «🏫 أسماء
     الإدارة» لا نقاطاً فارغة. والوكيل = وكيل الشؤون التعليمية، وإن لم يُضبط فوكيل شؤون الطلاب. */
  const staffCfg = () => { const A = window.SIJIL_ADMIN; try { if (A && typeof A.schoolStaff === "function") return A.schoolStaff() || {}; } catch (e) { } return (D && D.cfgSchool) || {}; };
  const viceKey = () => { const c = staffCfg(); return (!c.vice && c.agent) ? "agent" : "vice"; };
  // سطر تواقيع الشهادة المطبوعة: معلم المادة · الوكيل · المدير
  const certSig = () => sigLine([{ l: "معلم المادة", v: TE ? TE.name : "" }, viceKey(), "principal"]);
  // الاسمان أسفل الشهادة على الشاشة ("" إن لم يضبط المدير شيئاً فيبقى «إدارة المدرسة» كما كان)
  function certStaffHtml() {
    const c = staffCfg(), vk = viceKey(), v = c[vk] || "", p = c.principal || "";
    if (!v && !p) return "";
    const cell = (l, n) => n ? `<span><small>${esc(l)}</small><b>${esc(n)}</b></span>` : "";
    return `<div class="certsig">${cell(SIG_LBL[vk], v)}${cell(SIG_LBL.principal, p)}</div>`;
  }

  /* ═══ تبويبات المعلم ═══ */
  // لوحة المدير فعّالة؟ مدير + النواة محمَّلة + لم يختر «واجهتي كمعلم» (localStorage sijil.adminView === 'teacher')
  const adminView = () => { if (!TE || !TE.admin || !window.SIJIL_ADMIN) return false; try { return localStorage.getItem("sijil.adminView") !== "teacher"; } catch (e) { return true; } };
  function switchTab(name) {
    stopBell();                                     // مؤقّت شريط «الحصة الحالية» يعمل في تبويب «اليوم» وحده
    document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
    const adm = adminView();
    ["today", "reg", "grades", "rep", "more"].forEach(n => $("#tab-" + n).classList.toggle("hidden", adm || n !== name));
    if (adm) { try { window.SIJIL_ADMIN.render(name); } catch (e) { try { console.error("[admin] render", e); } catch (x) { } } window.scrollTo(0, 0); return; }
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
    // عدد حصص اليوم وأوقاتها من جدول أجراس المدرسة (لا رقم ثابت)
    const B = BELL();
/* خلية الحصة زر لا لافتة: نقرة تفتح رصد ذلك الفصل بتاريخ اليوم. وعليها علامة الرصد
       (✓ رُصد · ⚠ ناقص) من recs نفسها، فلا يخرج المعلم عند 12:45 غير متأكد ماذا رصد. */
    const dtToday = todayISO();
    const cell = (p, tm) => {
      const s = mine.find(x => +x.p === p), c = s ? classById(s.c) : null;
      if (!c) return `<div class="period empty" data-p="${p}"><span class="p">ح${p}</span><div class="c">—</div><div class="tm">${esc(tm)}</div></div>`;
      const k = classDayMark(c.id, dtToday);
      const mk = k.mark === "full" ? '<span class="mk ok">✓</span>' : k.mark === "part" ? '<span class="mk part">⚠</span>' : "";
      return `<button type="button" class="period" data-p="${p}" data-c="${esc(c.id)}"><span class="p">ح${p}</span><div class="c">${esc(c.name)}${mk}</div><div class="tm">${esc(tm)}</div></button>`;
    };
    const have = {}, per = [];
    B.periodsOnly(today).forEach(b => { have[b.p] = 1; per.push(cell(b.p, B.periodTime(b.p, today))); });
    // حصة مسندة في الجدول ورقمها خارج عدد حصص الإعداد (خفّضه المدير) تظهر بلا وقت بدل أن تختفي — نفس سلوك لوحة المدير
    const ex = [];
    mine.forEach(r => { const p = Number(r.p) || 0; if (p > 0 && p <= 12 && !have[p] && ex.indexOf(p) < 0) ex.push(p); });
    ex.sort((a, b) => a - b).forEach(p => per.push(cell(p, "")));
    let all = []; myClasses().forEach(c => classCalc(c.id).forEach(r => { if (r.active) all.push({ c, r }); }));
    // من لا رصد له ليس «الأدنى نقاطاً» — كما تُرشَّح لوحة الشرف المجاورة
    const low = all.filter(x => x.r.t.days > 0 || x.r.t.pts < 0).sort((a, b) => a.r.t.pts - b.r.t.pts).slice(0, 5);
    const high = all.slice().sort((a, b) => b.r.t.pts - a.r.t.pts).filter(x => x.r.t.pts > 0 && !lastAwayOf(x.c.id, x.r.i)).slice(0, 5);
    const MED = ["🥇", "🥈", "🥉", "🎖️", "🎖️"];
    box.innerHTML = `
      <div class="card" style="background:linear-gradient(150deg,var(--navy),var(--navy2));color:#fff;border:none">
        <div style="font-size:13px;color:#c9d5e3">${esc(hijriLabel())}</div>
        <div style="font-size:19px;font-weight:800;color:var(--goldl);margin-top:2px">أهلاً أ. ${esc(TE.name.split(" ")[0])} 👋</div></div>
      <div id="today-bell" class="bellbar"></div>
      <div id="today-next" class="nextbar"></div>
      <div id="today-reg"></div>
      ${myClasses().length ? `<button class="btn-primary" id="today-live" style="margin-bottom:12px;font-size:17px">🎬 ابدأ حصة تفاعلية</button>` : ""}
      <div class="card"><h3><span class="dot"></span>حصص اليوم (${esc(today)})</h3><div class="periods">${per.join("")}</div></div>
      <div class="card" id="today-lesson"><h3><span class="dot"></span>درس هذا الأسبوع</h3><span class="weekpill">الأسبوع ${wk}</span><div class="empty-note" style="padding:8px">جارِ التحميل…</div></div>
      <div class="card"><h3><span class="dot"></span>🏆 لوحة الشرف — الأوائل</h3>
        <div class="alert-list">${high.length ? high.map((x, k) => `<div class="al"><span><b style="font-size:16px">${MED[k]}</b> ${esc(x.r.s.n)} <small style="color:var(--muted)">— ${esc(x.c.name)}</small></span><span class="pts" style="color:var(--ok)">${x.r.t.pts}</span></div>`).join("") : '<div class="empty-note">ابدأ الرصد وستظهر أسماء المتميزين هنا 🌟</div>'}</div></div>
      <div class="card"><h3><span class="dot"></span>طلاب يحتاجون التفاتة (الأدنى نقاطاً)</h3>
        <div class="alert-list">${low.length ? low.map(x => `<div class="al"><span>${esc(x.r.s.n)} <small style="color:var(--muted)">— ${esc(x.c.name)}</small></span><span class="pts">${x.r.t.pts}</span></div>`).join("") : '<div class="empty-note">ابدأ التحضير أولاً وستظهر القائمة هنا</div>'}</div></div>`;
    paintDayCard();                                 // «رُصد ٢ من ٥ · غياب اليوم ٣» — تُقرأ من recs في كل رسم
    startBell();                                    // شريط «الحصة الحالية» + إبراز الحصة في الشبكة
    box.querySelectorAll(".periods [data-c]").forEach(b => b.onclick = () => openReg(b.dataset.c, dtToday));
    // خانة الحصة الجارية تُمرَّر إلى المنظور (سبع خانات في شريط عرضه ٣٦٠px: ح٥ كانت خارج الشاشة)
    try {
      const strip = box.querySelector(".periods"), pn = box.querySelector(".periods .period.now");
      if (strip && pn) strip.scrollLeft += pn.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - pn.offsetWidth) / 2;
    } catch (e) { }
    const tl = $("#today-live"); if (tl) tl.onclick = () => pickClassThen(liveSession);
    const sc = subjCode(TE.subject), grades = [...new Set(myClasses().map(c => c.gc))].sort();
    const LB = $("#today-lesson");
    if (!sc || !grades.length) { LB.querySelector(".empty-note").textContent = TE.admin ? "لوحة المدير في تبويب «المزيد»" : "لا مادة مسندة"; return; }
    let html = `<span class="weekpill">الأسبوع ${wk} — ${esc(TE.subject)}</span>`;
    for (const g of grades) {
      const code = sc + g + TERM, rows = (await loadCurr(code)).filter(r => r.w === wk);
      const main = rows.find(r => r.lesson && !String(r.lesson).includes("تابع")) || rows[0];
      const nm = main ? main.lesson : "—", off = !main || String(nm).includes("إجازة");
      html += `<div class="lesson-line" style="margin-top:9px"><span class="nm">الصف ${GNAME[g]}: ${esc(nm)}</span>${off ? "" : `<span style="display:flex;gap:6px;flex-wrap:wrap">${FILES() ? `<button class="btn-soft" data-fg="${g}" data-code="${code}">📎 مرفقات الدرس</button>` : ""}<button class="btn-gold" data-g="${g}">🚀 افتح الدرس التفاعلي</button></span>`}</div>`;
    }
    LB.innerHTML = `<h3><span class="dot"></span>درس هذا الأسبوع</h3>` + html;
    LB.querySelectorAll("[data-fg]").forEach(b => b.onclick = () => filesSheet("📎 مرفقات الدرس — الصف " + GNAME[+b.dataset.fg], "lesson", { code: b.dataset.code, wk },
      "ملفات تخصّ درس هذا الأسبوع: صور، أوراق عمل، عروض بصيغة PDF — تظهر أيضاً داخل الحصة الحية."));
    /* كان يفتح أول فصل في الصف (myClasses().find) فيرصد المعلمُ حصةً كاملة على «سادس (أ)»
       وهو واقف في «سادس (ب)». الآن: فصل الحصة الجارية، ثم القادمة اليوم، وإلا اختيار صريح. */
    LB.querySelectorAll("[data-g]").forEach(b => b.onclick = () => {
      const g = +b.dataset.g, S = currentOrNextClass(), mineG = myClasses().filter(c => c.gc === g);
      if (!mineG.length) return;
      const hit = mineG.find(c => c.id === S.cid) || mineG.find(c => S.next && c.id === S.next.cid);
      if (hit) { liveSession(hit.id, "lesson"); return; }
      if (mineG.length === 1) { liveSession(mineG[0].id, "lesson"); return; }
      pickClassThen((cid) => liveSession(cid, "lesson"), mineG, "🚀 افتح الدرس التفاعلي — اختر الفصل");
    });
  }


  /* بطاقة اليوم الحيّة: بديل «٨ فصول · ١٥٧ طالباً · ٥ حصص» (ثلاثة أرقام لا تتغيّر طوال الفصل
     الدراسي وثالثها مكرَّر حرفياً في الشبكة تحتها). تُنقر فتفتح قائمة حصص اليوم بحالة كل حصة. */
  function paintDayCard() {
    const box = $("#today-reg"); if (!box) return;
    const S = currentOrNextClass(), G = dayRegSummary(S);
    /* نصاب المعلم انتهى فعلاً: لا حصة قادمة اليوم — سواء انتهى الدوام أو بقيت حصص فراغ.
       عندها تصير البطاقة نداءً («بقي بلا رصد: سادس (ب)») لا إحصاءً. */
    const dayDone = !S.next && (S.st === "after" || S.st === "off" || S.st === "free");
    const warn = dayDone && G.gaps.length;
    if (!G.total) {
      const n = myClasses().length, all = myClasses().reduce((a, c) => a + activeCount(c), 0);
      box.innerHTML = `<div class="daycard flat"><span class="ic">📋</span><span class="tx"><b>لا حصص لك اليوم</b><small>${esc(cntAr(n, "فصل واحد", "فصلان", "فصول", "فصلاً"))} · ${all} طالباً — اضغط لفتح رصد أي فصل</small></span><span class="chev">‹</span></div>`;
    } else {
      // «لا غياب اليوم» ادّعاءٌ ما دامت حصةٌ بلا رصد — لا تُقال إلا بعد اكتمال رصد اليوم
      const pill = G.absent ? `<span class="pill bad">غياب اليوم ${G.absent}</span>`
        : (!G.none && !G.part) ? `<span class="pill">لا غياب اليوم</span>` : "";
      const partsN = G.rows.filter(r => r.mark === "part").map(r => r.cname).filter((v, i, a) => a.indexOf(v) === i);
      const sub = warn ? `بقي بلا رصد: ${G.gaps.join(" · ")}${partsN.length ? ` · ناقص: ${partsN.join(" · ")}` : ""}`
        : G.none ? `${cntAr(G.none, "حصة واحدة لم تُرصد", "حصتان لم تُرصدا", "حصص لم تُرصد", "حصة لم تُرصد")}${G.part ? ` و${cntAr(G.part, "واحدة ناقصة", "اثنتان ناقصتان", "ناقصة", "ناقصة")}` : ""} — اضغط للتفصيل`
          : G.part ? `${cntAr(G.part, "حصة واحدة ناقصة", "حصتان ناقصتان", "حصص ناقصة", "حصة ناقصة")} — اضغط للتفصيل`
            : "اكتمل رصد اليوم 🎉";
      box.innerHTML = `<div class="daycard${warn ? " warn" : G.none || G.part ? "" : " done"}"><span class="ic">${warn ? "⚠️" : "📋"}</span><span class="tx"><b>رُصد ${G.full} من ${G.total}</b><small>${esc(sub)}</small></span>${pill}<span class="chev">‹</span></div>`;
    }
    const card = box.firstChild;
    box.setAttribute("role", "button"); box.setAttribute("tabindex", "0");
    box.onclick = daySheet;
    box.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); daySheet(); } };
    return card;
  }

  /* ═══ شريط «الحصة الحالية» في تبويب اليوم ═══
     يعرض اسم الحصة ووقتها والدقائق المتبقية، أو اسم الفسحة ووقت انتهائها، أو «انتهى الدوام».
     يُحدَّث عند بداية كل دقيقة، ويُلغى مؤقّته فور مغادرة التبويب (switchTab) أو دخول الحصة الحية. */
  let bellTm = null;
  /* صيغتان إعرابيتان: مرفوعة بعد «تبقّى» («تبقّى دقيقتان») ومجرورة بعد «بعد» («بعد دقيقتين»).
     كانت دالة واحدة مرفوعة تُركَّب في الموضعين فيخرج «بعد دقيقتان». */
  const minsAr = (n) => n === 1 ? "دقيقة واحدة" : n === 2 ? "دقيقتان" : (n >= 3 && n <= 10) ? n + " دقائق" : n + " دقيقة";
  const minsArObl = (n) => n === 1 ? "دقيقة واحدة" : n === 2 ? "دقيقتين" : (n >= 3 && n <= 10) ? n + " دقائق" : n + " دقيقة";
  function stopBell() { if (bellTm) { clearTimeout(bellTm); bellTm = null; } }
  // أول رسم فوري، ثم إعادة رسم على المهمة التالية (قد تُحمَّل js/admin/core.js بعد app.js فتتغير أوقات المدرسة)
  function startBell() { stopBell(); tickBell(); setTimeout(paintBell, 0); }
  function tickBell() {
    paintBell();
    if (!$("#today-bell")) return;
    const d = new Date();
    bellTm = setTimeout(tickBell, Math.max(1000, (60 - d.getSeconds()) * 1000 - d.getMilliseconds()));
  }
  function paintBell() {
    const el = $("#today-bell"); if (!el) { stopBell(); return; }
    const B = BELL(), now = new Date(), day = DAYS[now.getDay()], m = now.getHours() * 60 + now.getMinutes();
    // يوم دراسة؟ الجمعة والسبت لا دوام — ويوم لا يقع داخل أي أسبوع من meta.weeks إجازة رسمية
    const term = inTermNow(now), work = term && SDAYS().indexOf(day) >= 0;
    const list = work ? B.periodsOf(day) : [], p = work ? B.periodNow(now) : 0;
    /* المصدر الوحيد لِما يُكتب هنا: محرك «الآن». كان الشريط يقرأ رقم الحصة من الجرس وحده فيقول
       «الحصة الحالية: الثالثة» والمعلم في فراغ وخانة ح٣ في الشبكة تحته تقول «—». */
    const S = currentOrNextClass(now);
    const nextTx = S.next ? ` · القادمة: <b>${esc(S.next.cname)}</b> ح${S.next.p} <span class="tm">${esc(B.hm(S.next.from))}</span>` : "";
    let cls, html, tap = null;
    if (!work) {
      cls = "off";
      html = term ? `<span class="ic">🌙</span><span class="tx"><b>لا دوام اليوم</b> — ${esc(day)}</span>`
        : `<span class="ic">🌴</span><span class="tx"><b>إجازة — لا دوام اليوم</b> — ${esc(day)}</span>`;
    } else if (S.st === "now") {
      cls = "on"; tap = S.cid;
      html = `<span class="ic">🔔</span><span class="tx">الحصة الحالية: <b>${esc(B.ord(S.p))}</b> <span class="tm">(${esc(B.periodTime(S.p, day))})</span> · <b>${esc(S.cname)}</b></span><span class="left">تبقّى ${esc(minsAr(S.left))}</span><span class="go">📋 افتح الرصد</span>`;
    } else if (S.st === "free" && S.slotName) {
      cls = "brk"; tap = S.next ? S.next.cid : null;
      html = `<span class="ic">☕</span><span class="tx"><b>${esc(S.slotName)}</b> — تنتهي <span class="tm">${esc(B.hm(S.slotEnd))}</span>${nextTx || " · لا حصص لك بعدها اليوم"}</span><span class="left">تبقّى ${esc(minsAr(Math.max(1, S.slotEnd - m)))}</span>${tap ? '<span class="go">📋 افتح رصدها</span>' : ""}`;
    } else if (S.st === "free") {
      // حصة فراغ: لون محايد وبلا جرس — ويقول إلى أين بعدها بدل أن يدّعي حصة جارية
      cls = "free"; tap = S.next ? S.next.cid : null;
      html = `<span class="ic">☕</span><span class="tx"><b>حصة فراغ</b> — تنتهي <span class="tm">${esc(B.hm(S.slotEnd))}</span>${nextTx || " · انتهى نصابك اليوم"}</span>${tap ? '<span class="go">📋 افتح رصدها</span>' : ""}`;
    } else if (S.st === "before") {
      cls = "soon"; tap = S.next ? S.next.cid : null;
      html = `<span class="ic">⏳</span><span class="tx">لم يبدأ الدوام بعد — الحصة <b>${esc(B.ord(list[0].p))}</b> <span class="tm">(${esc(B.periodTime(list[0].p, day))})</span>${S.next ? ` · أولى حصصك: <b>${esc(S.next.cname)}</b> ح${S.next.p}` : " · لا حصص لك اليوم"}</span>`;
    } else {
      cls = "off";
      html = `<span class="ic">🌙</span><span class="tx"><b>انتهى الدوام</b>${list.length ? ` — نهايته <span class="tm">${esc(B.hm(list[list.length - 1].to))}</span>` : ""}</span>`;
    }
    el.className = "bellbar " + cls + (tap ? " tap" : "");
    el.innerHTML = html;
    /* الشريط نفسه زر: نقرة تفتح رصد الفصل الجاري (أو القادم في الفراغ) — بدل تبويب + سحب أفقي
       + بحث بصري + نقرة، خمس مرات في اليوم. */
    el.onclick = tap ? (() => openReg(tap, todayISO())) : null;
    if (tap) { el.setAttribute("role", "button"); el.setAttribute("tabindex", "0"); }
    else { el.removeAttribute("role"); el.removeAttribute("tabindex"); }
    document.querySelectorAll("#tab-today .periods .period").forEach(n => n.classList.toggle("now", p > 0 && +n.dataset.p === p));
    paintNext();
  }

  /* ═══ ⏰ شريط «الحصة القادمة» + مهلة التنبيه وصوته ═══
     يظهر فوق شريط الحصة الحالية حين تقترب الحصة بمقدار المهلة المختارة (5 أو 10 أو 15 دقيقة)،
     ومعه زر «ابدأ الحصة الحية». يُرسم مع مؤقّت الجرس نفسه (كل دقيقة) فيُلغى معه عند مغادرة
     التبويب أو إخفاء الصفحة. مصدر الحصة القادمة js/notify.js، وإن لم يُحمَّل فحساب محلي مطابق. */
  const NLEAD_KEY = "sijil.notify.lead", NSND_KEY = "sijil.notify.sound";
  /* مفتاح بصمة الجدول لكل معلم على حدة (js/ics.js:fpKey): كان عامّاً للجهاز، فمعلم ثانٍ على
     الجهاز نفسه — لم ينزّل ملف تقويم قط — يرى لافتة «تغيّر جدولك» فور فتح «المزيد». */
  const fpKeyOf = () => {
    const I = window.SIJIL_ICS;
    if (I && typeof I.fpKey === "function" && TE) { try { return I.fpKey(TE.id); } catch (e) { } }
    return "sijil.ics.fp" + (TE && TE.id ? "." + TE.id : "");
  };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { } };
  const notifyLead = () => { const v = +lsGet(NLEAD_KEY); return (v === 5 || v === 10 || v === 15) ? v : 5; };
  const soundOn = () => lsGet(NSND_KEY) === "1";
  function nextClassLocal(now) {
    if (!TE) return null;
    const d = now || new Date(), day = DAYS[d.getDay()], m = d.getHours() * 60 + d.getMinutes();
    if (SDAYS().indexOf(day) < 0) return null;
    const list = BELL().periodsOnly(day);
    let best = null;
    (D.schedule || []).forEach(r => {
      if (!r || r.t !== TE.name || r.d !== day) return;
      const b = list.find(x => !x.brk && +x.p === +r.p); if (!b) return;
      const mins = b.from - m; if (mins < 1) return;
      if (!best || b.from < best.from) { const cl = classById(r.c); best = { p: +r.p, cid: r.c, cname: (cl && cl.name) || "", from: b.from, mins }; }
    });
    return best;
  }
  /* SIJIL_NOTIFY.nextClass لا تفحص أيام الدوام (SDAYS) بينما nextClassLocal تفحصها، فكان صفُّ جدولٍ
     يوم الجمعة يُظهر «الحصة القادمة» وشريط الجرس فوقه يقول «لا دوام اليوم — الجمعة». الفحص هنا لكليهما. */
  function nextClassOf(now) {
    const d = now || new Date();
    if (SDAYS().indexOf(DAYS[d.getDay()]) < 0) return null;
    const N = window.SIJIL_NOTIFY;
    if (N && typeof N.nextClass === "function") { try { return N.nextClass(now); } catch (e) { } }
    return nextClassLocal(now);
  }
  /* يوم لا يقع داخل أي أسبوع من meta.weeks = إجازة: js/notify.js يصمت (reason:"holiday")
     وjs/ics.js يكتب له EXDATE — وكان app.js وحده يرسم الشريط ويُرسل الإشعار في صباح العطلة. */
  function inTermNow(now) {
    const N = window.SIJIL_NOTIFY;
    if (!N || typeof N.inTerm !== "function") return true;
    try { return N.inTerm(now || new Date()) !== false; } catch (e) { return true; }
  }

  /* ═══ محرك «الآن»: الجدول يقود كل مدخل ═══
     مصدر واحد لكل شاشة تسأل «أين المعلم الآن؟» — يُبنى فوق nextClassLocal()/nextClassOf() أعلاه
     ومحرك أجراس المدرسة نفسه الذي تقرأ منه لوحة المدير، فلا يتناقض شريطٌ مع شبكة مع شريحة. يعيد:
       st    "now"    حصةٌ للمعلم جارية الآن
             "free"   الدوام قائم ولا حصة له: حصة فراغ أو فسحة  ← الشريط لا يدّعي حصة
             "before" لم يبدأ الدوام · "after" انتهى · "off" لا دوام (جمعة/سبت/إجازة)
       p,cid,cname,to,left   الحصة الجارية ووقت نهايتها والدقائق المتبقية (st==="now")
       slotEnd, slotName     نهاية الفراغ/الفسحة واسم الفسحة إن كانت فسحة (st==="free")
       next  {p,cid,cname,from,mins} أقرب حصة للمعلم بعد اللحظة اليوم، أو null
       rows  حصص المعلم اليوم مرتّبة {p,cid,cname,from,to} — from/to = null لحصة خارج جدول الأجراس */
  function currentOrNextClass(now) {
    const d = now || new Date(), day = DAYS[d.getDay()], m = d.getHours() * 60 + d.getMinutes();
    const B = BELL();
    const out = { st: "off", day, m, p: 0, cid: null, cname: "", from: 0, to: 0, left: 0, slotEnd: 0, slotName: "", next: null, rows: [] };
    if (!TE || !D) return out;
    const work = inTermNow(d) && SDAYS().indexOf(day) >= 0;
    const only = work ? B.periodsOnly(day) : [];
    (D.schedule || []).forEach(r => {
      if (!r || r.t !== TE.name || r.d !== day) return;
      const b = only.find(x => +x.p === +r.p), cl = classById(r.c);
      if (!cl) return;                                        // صفُّ جدولٍ لفصل محذوف لا يقود شاشة
      out.rows.push({ p: +r.p, cid: r.c, cname: cl.name || "—", from: b ? b.from : null, to: b ? b.to : null });
    });
    out.rows.sort((a, b) => a.p - b.p);
    if (!work) return out;
    const list = B.periodsOf(day), pn = B.periodNow(d), br = pn ? null : B.breakNow(d);
    /* القادمة تُحسب من صفوف المعلم لا من nextClassOf: تلك تصمت داخل الحصة الجارية (mins < 1)
       بينما شريط الفراغ وبطاقة اليوم يحتاجان «إلى أين بعد هذه» في كل الحالات. */
    const nx = out.rows.filter(r => r.from != null && r.from > m).sort((a, b) => a.from - b.from)[0] || null;
    if (nx) out.next = { p: nx.p, cid: nx.cid, cname: nx.cname, from: nx.from, mins: nx.from - m };
    const cur = pn ? out.rows.find(r => r.p === pn && r.from != null) : null;
    if (cur) { out.st = "now"; out.p = cur.p; out.cid = cur.cid; out.cname = cur.cname; out.from = cur.from; out.to = cur.to; out.left = Math.max(1, cur.to - m); return out; }
    if (list.length && m < list[0].from) { out.st = "before"; out.slotEnd = list[0].from; return out; }
    if (pn) { const b = list.find(x => !x.brk && x.p === pn); out.st = "free"; out.p = pn; out.slotEnd = b ? b.to : 0; out.slotName = ""; return out; }
    if (br) { out.st = "free"; out.slotEnd = br.to; out.slotName = String(br.n); return out; }
    out.st = "after"; out.slotEnd = list.length ? list[list.length - 1].to : 0;
    return out;
  }
  /* مفتاح «اللحظة المدرسية»: يتغيّر عند تغيّر الحصة الجارية وحدها. به تتبع شرائحُ التحضير الجدولَ
     عند دخول حصة جديدة، ولا تنقض اختيار المعلم إن اختار فصلاً آخر داخل الحصة نفسها. */
  const nowKey = (S) => { const s = S || currentOrNextClass(); return todayISO() + "|" + s.st + "|" + (s.st === "now" ? s.p : (s.next ? "n" + s.next.p : "-")); };
  // الفصل الذي يقود الشاشة الآن: الجاري، فإن لم يكن فالقادم اليوم
  const nowClassId = (S) => { const s = S || currentOrNextClass(); return s.cid || (s.next && s.next.cid) || null; };

  /* ═══ «رُصد ٢ من ٥»: حالة رصد اليوم من recs نفسها ═══ */
  // غياب فعلي (غائب · غائب بعذر · هارب) لا مجرّد نقاط سالبة — «متأخر» ليس غياباً
  const isAbsentState = (a) => { const st = STATES[a]; return !!st && /غائب|هارب/.test(String(st.name || "")); };
  // حالة رصد فصل في يوم: done/total بحالة الحضور (المصدر نفسه الذي يُبنى منه تقرير المدير) وعدد الغائبين
  function classDayMark(cid, dt) {
    const c = classById(cid);
    if (!c) return { done: 0, total: 0, absent: 0, mark: "none" };
    const act = activeStudents(c); let done = 0, ab = 0;
    act.forEach(({ i }) => { const e = rec(cid, dt, i, false); if (e && e.a != null) { done++; if (isAbsentState(e.a)) ab++; } });
    return { done, total: act.length, absent: ab, mark: (act.length && done >= act.length) ? "full" : done ? "part" : "none" };
  }
  // خلاصة اليوم: حصص اليوم بحالتها + «رُصد س من ص» + غياب اليوم (بلا تكرار فصلٍ يتكرر في حصتين)
  function dayRegSummary(S) {
    const s = S || currentOrNextClass(), dt = todayISO(), seen = {}, rows = [];
    let full = 0, part = 0, none = 0, absent = 0;
    s.rows.forEach(r => {
      const k = seen[r.cid] || (seen[r.cid] = classDayMark(r.cid, dt));
      if (!seen["+" + r.cid]) { seen["+" + r.cid] = 1; absent += k.absent; }
      if (k.mark === "full") full++; else if (k.mark === "part") part++; else none++;
      rows.push(Object.assign({}, r, k));
    });
    const gaps = rows.filter(r => r.mark === "none").map(r => r.cname).filter((v, i, a) => a.indexOf(v) === i);
    return { dt, rows, full, part, none, absent, total: s.rows.length, gaps, st: s.st, day: s.day };
  }
  // قائمة حصص اليوم — كل سطر زر ينقل إلى رصد ذلك الفصل بتاريخ اليوم
  function daySheet() {
    const S = currentOrNextClass(), G = dayRegSummary(S), B = BELL();
    const MK = { full: ["✅", "رُصد"], part: ["⚠️", "ناقص"], none: ["⭕️", "لم يُرصد"] };
    const rows = G.rows.length ? G.rows
      : myClasses().map(c => Object.assign({ p: 0, cid: c.id, cname: c.name, from: null }, classDayMark(c.id, G.dt)));
    const li = rows.map(r => {
      const mk = MK[r.mark] || MK.none, isNow = S.st === "now" && S.cid === r.cid && S.p === r.p;
      return `<button type="button" class="regrow ${r.mark}${isNow ? " isnow" : ""}" data-c="${esc(r.cid)}">
        <span class="mk">${mk[0]}</span>
        <span class="ttl"><span class="ln">${r.p ? `<b>ح${r.p}</b> ` : ""}${esc(r.cname)}${isNow ? '<span class="nowtag">الآن</span>' : ""}</span><small>${esc(mk[1])}${r.total ? " " + r.done + "/" + r.total : ""}${r.from != null ? " · " + esc(B.hm(r.from)) : ""}${r.absent ? " · غياب " + r.absent : ""}</small></span>
        <span class="go">رصد ›</span></button>`;
    }).join("");
    const head = G.total ? `رُصد <b>${G.full}</b> من <b>${G.total}</b>${G.absent ? ` · غياب اليوم <b>${G.absent}</b>` : ""}` : "لا حصص لك اليوم — هذه فصولك";
    openSheet(`<h4>📋 رصد اليوم — ${esc(G.day)}</h4><div class="daysum">${head}</div><div class="regrows">${li || '<div class="empty-note">لا فصول</div>'}</div>`,
      (o) => o.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { closeSheet(); openReg(b.dataset.c, G.dt); }));
  }
  // المدخل الموحّد إلى ورقة الرصد: من شريط الجرس، ومن خلية حصة اليوم، ومن قائمة حصص اليوم
  function openReg(cid, date) {
    if (cid) regClass = cid;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) regDate = String(date);
    regNowKey = nowKey();                            // اختيارٌ صريح: لا ينقضه محرك «الآن» في هذه الحصة
    switchTab("reg");
  }
  // نغمة قصيرة داخل التطبيق (بلا ملف صوت) — تعمل بعد أول لمسة من المعلم، وصمتها لا يُعطّل شيئاً
  function beep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ctx = new AC(), o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = "sine"; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1174, t + 0.18);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.62);
      setTimeout(() => { try { ctx.close(); } catch (e) { } }, 1000);
    } catch (e) { }
  }
  let nextKey = "";
  function paintNext() {
    const el = $("#today-next"); if (!el) return;
    const lead = notifyLead();
    let nx = null; try { nx = inTermNow() ? nextClassOf() : null; } catch (e) { nx = null; }
    if (!nx || nx.mins > lead) { el.className = "nextbar"; el.innerHTML = ""; nextKey = ""; return; }
    const B = BELL();
    el.className = "nextbar on";
    el.innerHTML = `<span class="ic">⏰</span><span class="tx">بعد <b>${esc(minsArObl(nx.mins))}</b>: الحصة <b>${esc(B.ord(nx.p))}</b>${nx.cname ? ` — <b>${esc(nx.cname)}</b>` : ""}</span><button class="btn-gold" id="next-live">🎬 ابدأ الحصة الحية</button>`;
    const b = $("#next-live"); if (b) b.onclick = () => liveSession(nx.cid);
    const k = nx.cid + "|" + nx.p + "|" + new Date().toDateString();
    if (k !== nextKey) { nextKey = k; if (soundOn()) beep(); }
    leadNotify(nx, lead);
  }
  /* تنبيه الجهاز من تبويب «اليوم» (js/notify.js يرسله أيضاً بالمهلة نفسها خارج التبويب):
     نُعلّم العلامة نفسها التي يستعملها ذلك الملف قبل الإرسال، فلا يصل التنبيه مرتين أبداً. */
  let leadBusy = false;
  function leadNotify(nx, lead) {
    if (lead <= 5 || nx.mins <= 5 || leadBusy || !inTermNow()) return;
    const N = window.SIJIL_NOTIFY; if (!N || typeof N.state !== "function") return;
    let st = null; try { st = N.state(); } catch (e) { return; }
    if (!st || !st.ready) return;
    const d = new Date(), two = (n) => (n < 10 ? "0" : "") + n;
    const day = d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
    // العلامة نفسها التي يستعملها js/notify.js — ومفتاحها صار مقروناً برقم المعلم هناك
    const key = "sijil.notified." + TE.id + "." + day + "." + nx.p;
    if (lsGet(key) === "1") return;
    lsSet(key, "1"); leadBusy = true;
    const B = BELL(), cl = classById(nx.cid), n = cl ? activeCount(cl) : 0;
    const title = "الحصة " + B.ord(nx.p) + " بعد " + minsArObl(nx.mins);
    const body = [nx.cname, n ? (n === 1 ? "طالب واحد" : n === 2 ? "طالبان" : (n <= 10 ? n + " طلاب" : n + " طالباً")) : ""].filter(Boolean).join(" — ");
    const ready = (navigator.serviceWorker && navigator.serviceWorker.ready) ? navigator.serviceWorker.ready : Promise.reject(new Error("no-sw"));
    ready.then(reg => reg.showNotification(title, { body, tag: "sijil-class-" + day + "-" + nx.p, dir: "rtl", lang: "ar", icon: "icon-192.png", badge: "icon-192.png" }))
      .then(() => { leadBusy = false; })
      .catch(() => { lsDel(key); leadBusy = false; });
  }
  // المدير يحفظ أوقاتاً جديدة (SIJIL_ADMIN.saveBell) → إعادة رسم فورية
  // ويُطلق أيضاً عند اكتمال تحميل js/admin/core.js بعد رسم «اليوم» (جلسة محفوظة/وضع تجريبي) فتُصحَّح خلايا الشبكة
  try {
    window.addEventListener("sijil:bell", () => {
      if (!TE) return;                                                            // قبل الدخول لا شيء لِيُرسم
      paintBell();
      try { const t = $("#tab-today"); if (t && !t.classList.contains("hidden")) Promise.resolve(renderToday()).catch(() => { }); } catch (e) { }
    });
  } catch (e) { }

  /* ═══ التحضير ═══ */
  let regClass = null, regAuto = todayISO(), regDate = regAuto, regMsgT = null;
  // آخر «لحظة مدرسية» تبعتها الشرائح — به يفرَّق بين تغيّر الحصة (يقود) واختيار المعلم (يُحترم)
  let regNowKey = "";
  /* أقصى تاريخ رصد = الغد، بالقاعدة نفسها التي تحرس بها لوحة المدير إحصاءاتها
     (js/admin/core.js:maxRecDate) — والغدُ لا اليومُ تحمّلاً لفارق ساعات الأجهزة. */
  const maxRegDate = () => { const d = new Date(); d.setDate(d.getDate() + 1); return todayISO(d); };
  /* التطبيق PWA يبقى مفتوحاً أياماً: التاريخ يتبع اليوم الجديد ما لم يكن المعلم قد اختار تاريخاً بنفسه */
  function refreshRegDate() {
    const t = todayISO();
    if (t !== regAuto) { if (regDate === regAuto) regDate = t; regAuto = t; }
  }
  function renderReg() {
    refreshRegDate();
    const box = $("#tab-reg"), cls = myClasses();
    if (!cls.length) { box.innerHTML = '<div class="empty-note">لا فصول مسندة لك' + (TE.admin ? " — لوحة المدير في «المزيد»" : "") + "</div>"; return; }
    /* محرك «الآن» يقود ورقة الرصد: كانت تفتح على cls[0] (رابع أ) مهما كانت الحصة الجارية،
       فيرصد المعلم حصةً كاملة على الفصل الخطأ، أو يبحث عن شريحته في سحبٍ أفقي كل حصة.
       والاختيار اليدوي يبقى محترماً داخل الحصة نفسها (regNowKey)، ويتبع الجدولَ عند تغيّرها. */
    const S = currentOrNextClass(), K = nowKey(S), B = BELL(), dtNow = todayISO(), isToday = regDate === dtNow;
    const inMine = (id) => !!(id && cls.find(c => c.id === id));
    const lead = isToday ? nowClassId(S) : null;
    if (!inMine(regClass) || (K !== regNowKey && inMine(lead))) regClass = inMine(lead) ? lead : (inMine(regClass) ? regClass : cls[0].id);
    regNowKey = K;
    // ترتيب الشرائح بترتيب حصص اليوم (ح١ ثم ح٢…) ثم بقية الفصول كما هي في إسناد المعلم
    const ordC = {}; if (isToday) S.rows.forEach((r, k) => { if (ordC[r.cid] == null) ordC[r.cid] = k; });
    const chips = cls.map((c, k) => ({ c, k })).sort((a, b) => {
      const oa = ordC[a.c.id] == null ? 900 : ordC[a.c.id], ob = ordC[b.c.id] == null ? 900 : ordC[b.c.id];
      return (oa - ob) || (a.k - b.k);
    }).map(x => x.c);
    const chipHtml = chips.map(c => {
      const k = classDayMark(c.id, regDate), on = c.id === regClass;
      const isNow = isToday && S.st === "now" && S.cid === c.id;
      const isNext = isToday && !isNow && S.next && S.next.cid === c.id;
      const mk = k.mark === "full" ? '<span class="ck ok" title="رُصد اليوم">✓</span>' : k.mark === "part" ? `<span class="ck part" title="رصد ناقص">⚠</span>` : "";
      const tag = isNow ? `<small class="nowt">الآن — ح${S.p} ${esc(B.hm(S.from))}</small>`
        : isNext ? `<small class="nxt">القادمة — ح${S.next.p} ${esc(B.hm(S.next.from))}</small>` : "";
      return `<button class="chip ${on ? "on" : ""}${isNow ? " isnow" : ""}" data-c="${c.id}"><span class="cn">${esc(c.name)}${mk}</span>${tag}</button>`;
    }).join("");
    box.innerHTML = `<div class="class-chips">${chipHtml}</div>
      <div class="reg-tools"><input type="date" id="reg-date" value="${regDate}" max="${maxRegDate()}"><button class="btn-soft" id="reg-all">✓ الكل حاضر</button><button class="btn-gold" id="reg-live">🎬 وضع العرض</button></div>
      <div class="empty-note" id="reg-msg" hidden style="padding:2px 4px 6px;text-align:right;min-height:0;color:var(--bad)"></div>
      <button type="button" class="reglegend" id="reg-legend"><span><b>🙋</b> مشاركة ${signN(W.part)}</span><span><b>📚</b> الواجب ✓/✗</span><span><b>⭐</b> سلوك</span><span class="q">❔ الشرح والتراجع</span></button>
      <div id="reg-absbar" class="no-print"></div>
      <div class="card" id="reg-list" style="padding:6px 10px"></div>`;
    box.querySelectorAll(".chip").forEach(ch => ch.onclick = () => { regClass = ch.dataset.c; regNowKey = nowKey(); renderReg(); });
    /* الشريحة النشطة تُمرَّر إلى المنظور: بلا هذا يبقى فصل الحصة السادسة خارج الشاشة يميناً
       في شريط ثمانِ شرائح، فيُظنّ أن التطبيق فتح على الفصل الأول كما كان. */
    try {
      const strip = box.querySelector(".class-chips"), onch = box.querySelector(".chip.on");
      if (strip && onch) strip.scrollLeft += onch.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - onch.offsetWidth) / 2;
    } catch (e) { }
    /* حقل التاريخ كان بلا سقف ولا حارس: يومٌ في المستقبل (خطأ كتابة: 2027 بدل 2026) يُرصد فيه
       الحضور فيراه المعلم «يوم رصد وحضور 100%» بينما لوحة المدير تتجاهله فتقول «لم يبدأ» —
       بلا إشعار لأحد. وتفريغ الحقل كان يكتب الرصد تحت مفتاح تاريخ فارغ لا يظهر في أي شاشة. */
    $("#reg-date").onchange = (e) => {
      const v = e.target.value, mx = maxRegDate(), msg = $("#reg-msg");
      const warn = (t) => { if (!msg) return; msg.textContent = t; msg.hidden = false; clearTimeout(regMsgT); regMsgT = setTimeout(() => { msg.hidden = true; }, 6000); };
      // عزلٌ ثنائي الاتجاه حول التاريخ: بلا LRI…PDI يُقلب 2026-09-08 إلى 08-09-2026 داخل جملة عربية
      const day = "⁦" + regDate + "⁩";
      if (!v) { e.target.value = regDate; warn("⚠️ لا بدّ من تاريخ للرصد — أُعيد التاريخ إلى " + day); return; }
      if (v > mx) { e.target.value = regDate; warn("⚠️ لا يمكن الرصد بتاريخ لاحق لليوم — أُعيد التاريخ إلى " + day); return; }
      if (msg) msg.hidden = true;
      regDate = v; drawRows();
    };
    $("#reg-legend").onclick = () => keysHelp(false);
    /* إجراء جماعي على ٢١ طالباً بلا رجعة: اللقطة على مستوى اليوم كله فيعود كل شيء كما كان بنقرة واحدة */
    $("#reg-all").onclick = () => {
      const cid = regClass, dt = regDate, snap = snapDay(cid, dt), c = classById(cid);
      let n = 0;
      activeStudents(c).forEach(({ i }) => { const e = rec(cid, dt, i, true); if (e.a == null) { e.a = 0; n++; } });
      save("recs:" + cid); drawRows();
      if (n) undoBar(`✅ سُجّل ${n} حاضراً — ${c.name}`, () => { restoreDay(cid, dt, snap); if (regClass === cid && regDate === dt && document.getElementById("reg-list")) drawRows(); });
    };
    // الزر ملاصق لحقل التاريخ: كان يتجاهله ويكتب على اليوم دائماً، فيرى المعلم ورقته السابقة خاليةً بعد الإنهاء
    $("#reg-live").onclick = () => liveSession(regClass, null, regDate);
    drawRows();
  }
  /* «الغياب الفعلي» له تعريف واحد في التطبيق (absCnt أعلاه): غائب أو هارب، والمأذون ليس منه.
     وكان مسار ولي الأمر (خلاصة الحصة ونافذة الإبلاغ) يقرأ /غائب|هارب/ عارية فيبتلع «غائب بعذر» —
     أي رسالة واتساب إلى بيتٍ أرسل العذر صباحاً، وعدّ «غائبان» في خلاصة حصةٍ أحدهما مأذون. */
  const isAbsent = (n) => !/عذر|مستأذن/.test(n) && /غائب|هارب/.test(n);
  // «غائب/متأخر/هارب» يستدعي بيتاً — و«مستأذن/بعذر» لا. هذا الشرط وحده يقرر ظهور سطر الإبلاغ.
  const needParent = (n) => /متأخر/.test(n) || isAbsent(n);
  /* صف الطالب: سطران تحت 400px — الاسم كاملاً بخط 15 على عرض الشاشة مع نقطة حالة ملوّنة والنقاط في
     الطرف، ثم شريط الأزرار الثلاثة بـ44px (التوزيع كله في css/app.css: .stu .s1/.s2). و«الترتيب 3 من
     21» حُذف من القائمة — مكانه بطاقة الطالب، وكان يسرق سطراً من كل صف في أكثر شاشة تُلمس في اليوم. */
  function drawRows() {
    const c = classById(regClass), list = $("#reg-list"); if (!list) return;
    const calc = classCalc(regClass), actv = activeStudents(c);
    list.innerHTML = actv.map(({ s, i }, k) => {
      const e = rec(regClass, regDate, i, false) || {}, st = e.a != null ? STATES[e.a] : null, t = calc[i].t;
      const stn = st ? String(st.name || "") : "", pn = needParent(stn), sent = pn ? lastParentComm(regClass, i, regDate) : null;
      return `<div class="stu" data-i="${i}"><div class="s1"><span class="num">${k + 1}</span>
        <span class="nm" data-act="card">${esc(s.n)}</span>
        <button class="statepill${st ? " set" : ""}" data-act="state" title="${st ? esc(stn) : "حالة الحضور"}" style="${st ? "background:" + STCOLORS[e.a] : ""}"><b class="si">${st ? ST_ICON(stn) : ""}</b><i class="sx">${st ? esc(stn) : "الحالة"}</i></button>
        <span class="pts ${t.pts < 0 ? "neg" : ""}">${t.pts}</span></div>
        <div class="s2"><button class="mini ${e.part ? "on" : ""}" data-act="part" title="نقرة: مشاركة إضافية · ضغطة مطوّلة: تصفير العدّاد">🙋${e.part ? `<span class="b">${e.part}</span>` : ""}</button>
        <button class="mini ${e.hw != null ? "on" : ""}" data-act="hw">${e.hw === 1 ? "✅" : e.hw === 0 ? "❌" : "📚"}</button>
        <button class="mini ${(e.beh || []).length ? "on" : ""}" data-act="beh">⭐${(e.beh || []).length ? `<span class="b">${e.beh.length}</span>` : ""}</button></div>${pn ? `
        <button type="button" class="pnotify${sent ? " done" : ""}" data-act="pn">${sent ? `✔ أُبلغ ولي الأمر ${esc(agoLabel(sent.ts))}` : "💬 أبلغ ولي الأمر"}</button>` : ""}</div>`;
    }).join("");
    list.querySelectorAll(".stu").forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll("[data-act]").forEach(b => { if (b.dataset.act === "part") bindPart(b, i); else b.onclick = () => act(b.dataset.act, i); });
    });
    drawAbsBar();
  }
  /* زر تجميعي فوق القائمة: «📨 أبلغ أولياء الغائبين (٣)» — يُعاد رسمه مع كل تغيير حالة، وعدده هو
     عدد صفوف نافذة الإبلاغ نفسها (absentNotify) فلا يختلف الرقم عمّا يراه المعلم بعد النقر. */
  function absentIdx(cid, dt) {
    const c = classById(cid), out = [];
    if (!c) return out;
    activeStudents(c).forEach(({ i }) => {
      const e = ((DB.recs[cid] || {})[dt] || {})[i];
      const stn = (e && e.a != null && STATES[e.a]) ? String(STATES[e.a].name || "") : "";
      if (isAbsent(stn)) out.push(i);
    });
    return out;
  }
  function drawAbsBar() {
    const bar = document.getElementById("reg-absbar"); if (!bar) return;
    const n = absentIdx(regClass, regDate).length, cid = regClass, dt = regDate;
    bar.innerHTML = n ? `<button type="button" class="absbtn" id="reg-abs">📨 أبلغ أولياء الغائبين (${n})</button>` : "";
    const b = bar.querySelector("#reg-abs");
    if (b) b.onclick = () => absentNotify(cid, dt, null);
  }
  /* 🙋 المشاركة: نقرة = +1 بلا سقف — نفس قاعدة الحصة الحية (applyLive) حتى لا تنهار مشاركات الحصة إلى بقية القسمة على 6.
     والتصحيح بضغطة مطوّلة (أو الزر الأيمن) تُصفّر العدّاد. */
  function bindPart(b, i) {
    let tm = null, held = false;
    const clear = () => { if (tm) { clearTimeout(tm); tm = null; } };
    const zero = () => {
      held = true; clear();
      const cid = regClass, dt = regDate, e = rec(cid, dt, i, false);
      if (e && e.part) {
        const snap = snapRec(cid, dt, i), was = e.part, nm = firstName(classById(cid).students[i].n);
        e.part = 0; pruneRec(cid, dt, i); save("recs:" + cid); drawRows();
        undoReg(`🙋 صُفّر عدّاد ${nm} (كان ${was})`, cid, dt, i, snap);
      }
    };
    b.addEventListener("pointerdown", () => { held = false; clear(); tm = setTimeout(zero, 600); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => b.addEventListener(ev, clear));
    b.addEventListener("contextmenu", (ev) => { ev.preventDefault(); zero(); });
    b.onclick = () => { if (held) { held = false; return; } act("part", i); };
  }
  function act(what, i) {
    // فتح البطاقة أو نافذة الحالة أو نافذة السلوك قراءةٌ لا رصد: لا يُنشأ سجل يوم إلا عند تسجيل شيء فعلاً
    if (what === "card") { studentCard(regClass, i); return; }
    if (what === "state") { stateSheet(i); return; }
    if (what === "beh") { behSheet(i); return; }
    if (what === "pn") { parentAlert(regClass, regDate, i); return; }
    const cid = regClass, dt = regDate, snap = snapRec(cid, dt, i), nm = firstName(classById(cid).students[i].n);
    const e = rec(cid, dt, i, true);
    if (what === "part") { e.part = (+e.part || 0) + 1; save("recs:" + cid); drawRows(); undoReg(`🙋 مشاركة لـ ${nm} ${signN(W.part)}`, cid, dt, i, snap); }
    else if (what === "hw") {
      e.hw = e.hw === null ? 1 : e.hw === 1 ? 0 : null; pruneRec(cid, dt, i); save("recs:" + cid); drawRows();
      undoReg(`📚 ${e.hw === 1 ? "واجب ✓ " + signN(W.hw) : e.hw === 0 ? "لم يحلّ الواجب" : "مُسح رصد الواجب"} — ${nm}`, cid, dt, i, snap);
    }
  }
  // تراجع عن إجراء على طالب واحد في ورقة التحضير (يُعيد الرسم فقط إن كانت الورقة نفسها ما تزال مفتوحة)
  const undoReg = (lbl, cid, dt, i, snap) => undoBar(lbl, () => { restoreRec(cid, dt, i, snap); if (regClass === cid && regDate === dt && document.getElementById("reg-list")) drawRows(); });
  function stateSheet(i) {
    const c = classById(regClass), cur = rec(regClass, regDate, i, false) || {};
    openSheet(`<h4>${esc(c.students[i].n)} — حالة الحضور</h4><div class="stategrid">${assessView(STATES).map(s => `<button style="background:${STCOLORS[s.i]}" class="${cur.a === s.i ? "sel" : ""}" data-k="${s.i}">${esc(s.name)} <small>(${s.pts >= 0 ? "+" : ""}${s.pts})</small></button>`).join("")}<button style="background:#c9cfd6" data-k="-1">مسح الحالة</button></div>`,
      (o) => o.querySelectorAll("[data-k]").forEach(b => b.onclick = () => {
        const k = +b.dataset.k, cid = regClass, dt = regDate, snap = snapRec(cid, dt, i), nm = firstName(classById(cid).students[i].n);
        // «مسح الحالة» يمحو السجل إن لم يبقَ فيه رصد — وإلا بقي يوماً وهمياً يخفض الحضور والدرجة التلقائية
        if (k < 0) { const e = rec(cid, dt, i, false); if (e) { e.a = null; pruneRec(cid, dt, i); save("recs:" + cid); } }
        else { rec(cid, dt, i, true).a = k; save("recs:" + cid); }
        closeSheet(); drawRows();
        undoReg(k < 0 ? `🧹 مُسحت حالة ${nm}` : `${ST_ICON(STATES[k].name || "")} ${STATES[k].name} — ${nm} ${signN(STATES[k].pts || 0)}`, cid, dt, i, snap);
      }));
  }
  /* السلوك يتكرّر: الحصة الحية تسجّل «مميز» في كل مرة (beh=[3,3,3] أي ثلاث نقاط).
     فالنافذة تعرض عدد المرات وتحفظها كما هي — لا تسحقها بـ Set كما كانت تفعل، فتضيع نقاط الحصة بضغطة «حفظ» بريئة.
     إلغاء تحديد سلوك يحذف كل مراته (قصد صريح)، وتحديد سلوك جديد يضيفه مرة واحدة. */
  function behSheet(i) {
    const c = classById(regClass), cur = rec(regClass, regDate, i, false) || {};
    const orig = (cur.beh || []).slice(), cnt = {};
    orig.forEach(k => cnt[k] = (cnt[k] || 0) + 1);
    const sel = new Set(orig), rep = Object.keys(cnt).some(k => cnt[k] > 1);
    openSheet(`<h4>${esc(c.students[i].n)} — السلوك والتقييم</h4><div class="behgrid">${assessView(BEH).map(b => `<button data-k="${b.i}" class="${sel.has(b.i) ? "sel" : ""}">${esc(b.name)}${cnt[b.i] > 1 ? `<span class="x">×${cnt[b.i]}</span>` : ""} <span class="p ${b.pts >= 0 ? "pos" : "neg"}">${b.pts >= 0 ? "+" : ""}${b.pts}</span></button>`).join("")}</div>${rep ? `<div class="empty-note" style="padding:2px 4px 6px;text-align:right;font-size:12px">×العدد = مرات رُصدت في الحصة الحية، وتبقى كما هي بعد الحفظ.</div>` : ""}<textarea class="note" id="bh-note" rows="2" placeholder="ملاحظة (اختياري)…">${esc(cur.note || "")}</textarea><div class="sheet-actions"><button class="btn-plain" id="bh-x">إغلاق</button><button class="btn-primary" id="bh-ok">تم</button></div>`,
      (o) => {
        o.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { const k = +b.dataset.k; if (sel.has(k)) sel.delete(k); else sel.add(k); b.classList.toggle("sel"); });
        o.querySelector("#bh-x").onclick = closeSheet;
        o.querySelector("#bh-ok").onclick = () => {
          const note = o.querySelector("#bh-note").value.trim();
          const cid = regClass, dt = regDate, snap = snapRec(cid, dt, i), nm = firstName(c.students[i].n);
          const kept = orig.filter(k => sel.has(k));                       // التكرارات محفوظة بترتيبها
          const added = [];
          sel.forEach(k => { if (orig.indexOf(k) < 0) { kept.push(k); added.push(k); } });    // ما أضافه المعلم الآن: مرة واحدة
          if (rec(cid, dt, i, false) || kept.length || note) {
            const e = rec(cid, dt, i, true);
            e.beh = kept; e.note = note;
            pruneRec(cid, dt, i);
            save("recs:" + cid);
          }
          closeSheet(); drawRows();
          const chg = added.length || kept.length !== orig.length || note !== String(cur.note || "");
          if (chg) {
            const one = added.length === 1 ? BEH[added[0]] : null;
            undoReg(one ? `${(+one.pts || 0) < 0 ? "⚠" : "⭐"} ${one.name} لـ ${nm} ${signN(one.pts || 0)}` : `⭐ تعديل سلوك ${nm}`, cid, dt, i, snap);
          }
        };
      });
  }

  /* ═══ الدرجات ═══ */
  let grClass = null, grOne = false, grCol = null;
  function renderGrades() {
    const box = $("#tab-grades"), cls = myClasses();
    if (!cls.length) { box.innerHTML = '<div class="empty-note">لا فصول مسندة</div>'; return; }
    if (!grClass || !cls.find(c => c.id === grClass)) grClass = cls[0].id;
    if (!grCol || !ASSESS.some(a => a.k === grCol)) grCol = (ASSESS[0] || {}).k;
    /* «وضع العمود الواحد»: أحد عشر عموداً بعرض ~٨٧٣px داخل حاوية ~٣٤٢px — يختار المعلم بند التقييم
       فتصير الشاشة اسماً وحقلاً واحداً لكل صف بلا تمرير أفقي، وينتقل التركيز إلى الطالب التالي. */
    const one = !!(grOne && grCol), aOne = one ? ASSESS.find(a => a.k === grCol) : null;
    const c = classById(grClass); const maxTot = ASSESS.reduce((s, a) => s + a.max, 0);
    const act = activeStudents(c);
    box.innerHTML = `<div class="class-chips">${cls.map(x => `<button class="chip ${x.id === grClass ? "on" : ""}" data-c="${x.id}">${esc(x.name)}</button>`).join("")}</div>
      <div class="card" style="padding:8px"><h3 style="margin:4px 6px 8px"><span class="dot"></span>رصد درجات ${esc(c.name)} — ${esc(TE.subject)}
        <button class="btn-gold no-print" style="margin-inline-start:auto" id="gr-print">🖨️ طباعة</button></h3>
        <div class="rep-head"><div class="rt">كشف درجات — ${esc(c.name)}</div><div class="rs">${esc(META.school.name)} — ${esc(TE.name)} — ${esc(TE.subject)}</div></div>
        <div class="gr-mode no-print"><button type="button" class="btn-soft${one ? " on" : ""}" id="gr-mode">${one ? "📋 كل البنود" : "📱 وضع عمود واحد"}</button>${one ? `<select id="gr-col" title="بند التقييم">${ASSESS.map(a => `<option value="${esc(a.k)}"${a.k === grCol ? " selected" : ""}>${esc(a.n)} (${a.max})</option>`).join("")}</select>` : `<span style="color:var(--muted);font-size:12.5px">عمودا «م» و«الطالب» مثبّتان عند التمرير</span>`}</div>
        <div class="table-scroll"><table class="grade-table${one ? " gr1" : ""}" id="gr-table">
          ${one ? `<tr><th>م</th><th style="min-width:120px">الطالب</th><th>${esc(aOne.n)}<br>(${aOne.max})</th></tr>` : `<tr><th>م</th><th style="min-width:120px">الطالب</th>${ASSESS.map(a => `<th>${esc(a.n)}<br>(${a.max})</th>`).join("")}<th>المجموع<br><small>(من المرصود)</small></th><th>التقدير</th></tr>`}
          ${act.map(({ s, i }, k) => one ? gr1Row(i, s, k + 1, aOne) : grRow(i, s, maxTot, k + 1)).join("")}
        </table></div></div>
      <div class="empty-note" style="padding:6px 10px;text-align:right">${one ? "اكتب الدرجة وينتقل التركيز تلقائياً إلى الطالب التالي (أو بزر ⏎ والسهمين ↑↓). الخانة الرمادية درجة محسوبة تلقائياً، واكتب فوقها لتصير يدوية، وامسحها لتعود تلقائية." : "الخلايا الرمادية تُحسب تلقائياً ولحظياً من التحضير اليومي (الحضور والمشاركة، السلوك) ومن الواجبات والأوراق التفاعلية المصحَّحة، وتتغير مع كل رصد. اكتب درجة لتعديلها يدوياً، وامسحها لتعود تلقائية. مرّر على الخلية لترى طريقة الحساب."}</div>
      <div class="card" id="gr-analysis"></div>`;
    if (CLOUD && !(SUBS[grClass] && Date.now() - SUBS[grClass].ts < 60000)) { const want = grClass; loadSubs(want).then(() => { if (grClass === want && !$("#tab-grades").classList.contains("hidden")) renderGrades(); }); }
    box.querySelectorAll(".chip").forEach(ch => ch.onclick = () => { grClass = ch.dataset.c; renderGrades(); });
    /* الخانة اليدوية: النص غير الرقمي لا يُخزَّن صفراً صامتاً (كان «abc» يصير 0 فيهبط التقدير)،
       والدرجة الأكبر من العظمى تُقصّ وتُصحَّح في الخانة نفسها عند مغادرتها فلا يرى المعلم رقماً غير المخزَّن. */
    const grSync = (inp, i, k) => {
      const au = autoGrade(grClass, i), man = (DB.grades[grClass] || {})[i] || {};
      const has = man[k] != null;
      inp.placeholder = !has && au.v[k] != null ? au.v[k] : "";
      inp.classList.toggle("auto", !has && au.v[k] != null);
      inp.title = has ? "درجة يدوية" : (au.why[k] || "");
      const gp = gradePct(grClass, i), lv = gp == null ? null : levelOf(gp);
      // في «وضع العمود الواحد» لا خليتا مجموع وتقدير في الصف — لا يجوز أن ينفجر الرصد لأجل خلية عرض
      const tr = inp.closest("tr"), tc = tr && tr.querySelector(".tot"), lc = tr && tr.querySelector(".lvlcell");
      if (tc) tc.textContent = gp == null ? "—" : gradeTotal(grClass, i) + " / " + gradedMax(grClass, i);
      if (lc) lc.innerHTML = lv ? `<span class="lvl lvl${lv.i}">${lv.t}</span>` : '<span style="color:#bbb">—</span>';
      save("grades:" + grClass); drawAnalysis(maxTot);
    };
    /* التنقّل بالعمود لا بالصف: ⏎ و↓ ينقلان إلى الطالب التالي في البند نفسه (لا إلى البند التالي
       للطالب نفسه) — وهذا هو ترتيب الرصد الحقيقي: بند واحد على كل الفصل. */
    const ins = [...box.querySelectorAll(".gr-in")];
    const hop = (el, d) => {
      const col = ins.filter(x => x.dataset.k === el.dataset.k), t = col[col.indexOf(el) + d];
      if (!t) return false;
      try { t.focus(); t.select(); } catch (e) { }
      try { t.scrollIntoView({ block: "center" }); } catch (e) { }
      return true;
    };
    ins.forEach(inp => {
      const i = +inp.dataset.i, k = inp.dataset.k, a = ASSESS.find(x => x.k === k);
      inp.onfocus = () => { const tr = inp.closest("tr"); box.querySelectorAll("tr.focused").forEach(x => x.classList.remove("focused")); if (tr) tr.classList.add("focused"); };
      inp.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); hop(inp, 1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); hop(inp, -1); }
      };
      inp.oninput = () => {
        DB.grades[grClass] = DB.grades[grClass] || {}; DB.grades[grClass][i] = DB.grades[grClass][i] || {};
        // ٠١٢… و۰۱۲… أرقام يكتبها جوال المعلم افتراضياً: كانت +value تعطي NaN فتُمسح الدرجة
        const v = arNum(inp.value);
        const num = v === "" ? null : Number(v);
        if (v === "" || num == null || !isFinite(num)) { delete DB.grades[grClass][i][k]; inp.classList.toggle("bad", v !== ""); }
        else { DB.grades[grClass][i][k] = Math.max(0, Math.min(num, a.max)); inp.classList.remove("bad"); }
        grSync(inp, i, k);
        // وضع العمود الواحد: رقمٌ لا يقبل خانة أخرى (٣ في بند سقفه ١٥) ⇒ الطالب التالي بلا نقرة
        if (one && v !== "" && num != null && isFinite(num) && num * 10 > a.max) hop(inp, 1);
      };
      inp.onblur = () => {
        const cur = ((DB.grades[grClass] || {})[i] || {})[k], want = cur != null ? String(cur) : "";
        if (inp.value === want && !inp.classList.contains("bad")) return;   // لا شيء يُصحَّح: لا رفع ولا إعادة حساب
        inp.value = want;                        // ما يراه المعلم = ما هو مخزَّن فعلاً (بعد القصّ)
        inp.classList.remove("bad");
        grSync(inp, i, k);
      };
    });
    const gm = box.querySelector("#gr-mode"); if (gm) gm.onclick = () => { grOne = !grOne; renderGrades(); };
    const gc = box.querySelector("#gr-col"); if (gc) gc.onchange = () => { grCol = gc.value; renderGrades(); };
    /* ظلّ خفيف على العمود المثبّت عند التمرير الأفقي (scrollLeft سالب في RTL) — بلا الظلّ لا يُدرك
       المعلم أن هناك أعمدة خلف الاسم. */
    const sc = box.querySelector(".table-scroll");
    if (sc) { const upd = () => sc.classList.toggle("sx", Math.abs(sc.scrollLeft) > 2); sc.addEventListener("scroll", upd, { passive: true }); upd(); }
    $("#gr-print").onclick = () => printGrades(grClass);
    drawAnalysis(maxTot);
  }
  // صف «وضع العمود الواحد»: م + الاسم + حقل واحد — ثلاثة أعمدة تسع الشاشة بلا تمرير أفقي
  function gr1Row(i, s, n, a) {
    const g = (DB.grades[grClass] || {})[i] || {}, au = autoGrade(grClass, i);
    const auto = g[a.k] == null && au.v[a.k] != null;
    return `<tr><td>${n}</td><td class="nm">${esc(s.n)}</td><td class="gcell"><input class="gr-in${auto ? " auto" : ""}" data-i="${i}" data-k="${esc(a.k)}" inputmode="numeric" value="${g[a.k] != null ? g[a.k] : ""}" placeholder="${auto ? au.v[a.k] : ""}" title="${esc(g[a.k] != null ? "درجة يدوية" : (au.why[a.k] || ""))}"></td></tr>`;
  }
  function printGrades(cid) {
    const c = classById(cid), maxTot = ASSESS.reduce((a, b) => a + b.max, 0);
    const rows = activeStudents(c).map(({ s, i }) => { const g = effGrades(cid, i), man = (DB.grades[cid] || {})[i] || {}, tot = gradeTotal(cid, i), gp = gradePct(cid, i), lv = gp == null ? null : levelOf(gp); return { s, i, g, man, tot, gp, lv }; });
    const scored = rows.filter(r => Object.keys(r.g).length);
    const avg = scored.length ? (scored.reduce((a, r) => a + r.tot, 0) / scored.length).toFixed(1) : "—";
    printDoc("كشف درجات " + c.name, `
      <div class="h"><div class="bar">${esc(META.school.name)}</div><div class="m">${esc(TE.subject)} — معلم المادة: ${esc(TE.name)} — ${esc(hijriLabel())}</div></div>
      <div class="tt">كشف درجات ${esc(c.name)}</div>
      <table class="compact"><tr><th>م</th><th style="min-width:150px">الطالب</th>${ASSESS.map(a => `<th>${esc(a.n)}<br><small>(${a.max})</small></th>`).join("")}<th>المجموع<br><small>(من المرصود)</small></th><th>التقدير</th></tr>
      ${rows.map((r, k) => `<tr><td>${k + 1}</td><td class="nm">${esc(r.s.n)}</td>${ASSESS.map(a => `<td class="${r.man[a.k] == null && r.g[a.k] != null ? "auto" : ""}">${r.g[a.k] != null ? r.g[a.k] : ""}</td>`).join("")}<td><b>${r.gp == null ? "—" : r.tot + " / " + gradedMax(cid, r.i)}</b></td><td class="${r.lv ? "lv" + r.lv.i : ""}">${r.lv ? r.lv.t : "—"}</td></tr>`).join("")}
      <tr><td></td><td class="nm"><b>متوسط الفصل</b></td>${ASSESS.map(a => { const v = scored.map(r => +r.g[a.k]).filter(x => !isNaN(x)); return `<td>${v.length ? (v.reduce((x, y) => x + y, 0) / v.length).toFixed(1) : ""}</td>`; }).join("")}<td><b>${avg}</b></td><td></td></tr></table>
      <div class="note">التقدير من البنود المرصودة حتى الآن (لا من ${maxTot} قبل رصد الاختبارات). الدرجات الرمادية محسوبة تلقائياً من الرصد اليومي (الحضور والمشاركة، السلوك) والواجبات والأوراق التفاعلية، وما كتبه المعلم يدوياً مُثبت بالأسود.</div>
      ${sigLine([{ l: "معلم المادة", v: TE.name }, "principal"])}`, { land: ASSESS.length >= 6 });
  }
  // التقدير من البنود المرصودة حتى الآن (gradePct) لا من 100 — البنود التلقائية سقفها 40، فالنسبة من 100 تجعل المنتظم «دون المطلوب»
  function grRow(i, s, maxTot, n) {
    const g = (DB.grades[grClass] || {})[i] || {}, au = autoGrade(grClass, i), tot = gradeTotal(grClass, i), gp = gradePct(grClass, i), lv = gp == null ? null : levelOf(gp);
    return `<tr><td>${n || i + 1}</td><td class="nm">${esc(s.n)}</td>${ASSESS.map(a => `<td><input class="gr-in${g[a.k] == null && au.v[a.k] != null ? " auto" : ""}" data-i="${i}" data-k="${a.k}" inputmode="numeric" value="${g[a.k] != null ? g[a.k] : ""}" placeholder="${g[a.k] == null && au.v[a.k] != null ? au.v[a.k] : ""}" title="${esc(g[a.k] != null ? "درجة يدوية" : (au.why[a.k] || ""))}"></td>`).join("")}<td class="tot">${gp == null ? "—" : tot + " / " + gradedMax(grClass, i)}</td><td class="lvlcell">${lv ? `<span class="lvl lvl${lv.i}">${lv.t}</span>` : '<span style="color:#bbb">—</span>'}</td></tr>`;
  }
  function drawAnalysis(maxTot) {
    const c = classById(grClass);
    const scored = activeStudents(c).map(({ s, i }) => ({ s, i, tot: gradeTotal(grClass, i), p: gradePct(grClass, i), has: hasGrades(grClass, i) })).filter(x => x.has && x.p != null);
    const box = $("#gr-analysis");
    if (!scored.length) { box.innerHTML = '<h3><span class="dot"></span>تحليل النتائج</h3><div class="empty-note">أدخل الدرجات وسيظهر التحليل تلقائياً</div>'; return; }
    /* المقارنة بالنسبة (gradePct) لا بالمجموع الخام: طالب رُصد له بند واحد 15/15 = 100% «ممتاز»
       كان يتصدّر «يحتاجون دعماً» فوق زملائه بـ 24/30 (80%). */
    const pcts = scored.map(x => x.p), avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    // القائمتان متمايزتان: لا يظهر الطالب نفسه في «الأعلى» و«يحتاجون دعماً» حين يقلّ العدد عن عشرة
    const hi = scored.slice().sort((a, b) => b.p - a.p || b.tot - a.tot);
    const hiTop = hi.slice(0, Math.min(5, Math.ceil(hi.length / 2)));
    const lo = hi.slice(Math.max(hiTop.length, hi.length - 5)).reverse();
    const cell = (x) => `${esc(x.s.n)} — <b>${Math.round(x.p)}%</b> <small style="color:var(--muted)">(${x.tot})</small>`;
    const dist = [0, 0, 0, 0, 0]; scored.forEach(x => dist[levelOf(x.p).i]++);
    const passCount = scored.filter(x => x.p >= 50).length;
    const LB = ["ممتاز", "جيد جداً", "جيد", "مقبول", "دون المطلوب"], LC = ["#2e9e5b", "#58a6d8", "#e8a23d", "#b3541e", "#d64545"];
    box.innerHTML = `<h3><span class="dot"></span>تحليل نتائج ${esc(c.name)}</h3>
      <div class="ana-grid">
        <div class="ana"><div class="v">${scored.length}</div><div class="l">طلاب مرصودون</div></div>
        <div class="ana"><div class="v">${Math.round(avg)}%</div><div class="l">المتوسط — من البنود المرصودة</div></div>
        <div class="ana"><div class="v">${Math.round(Math.max(...pcts))}%</div><div class="l">أعلى نسبة</div></div>
        <div class="ana"><div class="v">${Math.round(Math.min(...pcts))}%</div><div class="l">أدنى نسبة</div></div>
      </div>
      <div style="font-weight:800;color:var(--navy);margin:6px 0">نسبة الإتقان: ${Math.round(passCount / scored.length * 100)}% (${passCount} من ${scored.length}) <small style="font-weight:500;color:var(--muted)">— من البنود المرصودة حتى الآن</small></div>
      ${dist.map((n, k) => `<div class="bar-row"><span class="lb">${LB[k]}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n / scored.length * 100)}%;background:${LC[k]}">${n || ""}</div></div></div>`).join("")}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
        <div><div style="font-weight:800;color:var(--ok);margin-bottom:4px">🏅 الأعلى</div>${hiTop.map(x => `<div style="font-size:13px;padding:3px 0">${cell(x)}</div>`).join("")}</div>
        <div><div style="font-weight:800;color:var(--bad);margin-bottom:4px">📉 يحتاجون دعماً</div>${lo.length ? lo.map(x => `<div style="font-size:13px;padding:3px 0">${cell(x)}</div>`).join("") : '<div style="font-size:13px;padding:3px 0;color:var(--muted)">—</div>'}</div>
      </div>`;
  }

  /* ═══ بطاقة الطالب + سجل التواصل ═══ */
  /* ═══ ملخص الطالب (يُستخدم في البطاقة ورسالة ولي الأمر) ═══ */
  function studentSummary(cid, i) {
    const c = classById(cid), s = c.students[i], calc = classCalc(cid), t = calc[i].t, rank = calc[i].rank;
    const maxTot = ASSESS.reduce((a, b) => a + b.max, 0), g = effGrades(cid, i), gtot = gradeTotal(cid, i), hasG = hasGrades(cid, i);
    // التقدير يُحسب من الأعمدة المرصودة فقط (حتى لا يظهر «دون المطلوب» قبل رصد الاختبارات)
    const filledMax = ASSESS.filter(a => g[a.k] != null).reduce((x, a) => x + a.max, 0);
    const pct = hasG && filledMax ? gtot / filledMax * 100 : null, lv = pct != null ? levelOf(pct) : null;
    let att = null; try { att = attPct(t); } catch (e) { att = null; }
    const behAgg = {}; Object.values(DB.recs[cid] || {}).forEach(day => { const e = day[i]; if (!e) return; (e.beh || []).forEach(bi => behAgg[bi] = (behAgg[bi] || 0) + 1); });
    const pos = [], neg = []; Object.keys(behAgg).forEach(bi => { const b = BEH[bi]; if (!b) return; (((+b.pts) || 0) >= 0 ? pos : neg).push(`${b.name}${behAgg[bi] > 1 ? " ×" + behAgg[bi] : ""}`); });
    const subs = ((SUBS[cid] || {}).rows || []).filter(r => r.si === i && r.mx);
    const subsAvg = subs.length ? Math.round(subs.reduce((a, r) => a + Math.min(1, r.sc / r.mx), 0) / subs.length * 100) : null;
    const why = pct != null ? (pct >= 75 ? "إشعار تميّز" : pct < 50 ? "إشعار ضعف" : "تقرير متابعة") : (t.pts > 0 && rank <= 3 ? "إشعار تميّز" : t.pts < 0 ? "إشعار ضعف" : "تقرير متابعة");
    return { c, s, t, rank, maxTot, filledMax, g, gtot, hasG, pct, lv, att, behAgg, pos, neg, subs, subsAvg, why };
  }
  function parentMessage(cid, i) {
    const S = studentSummary(cid, i), L = [];
    L.push("السلام عليكم ورحمة الله وبركاته");
    L.push(`ولي أمر الطالب: *${S.s.n}* — ${S.c.name}`);
    L.push(`تقرير متابعة مادة ${TE.subject} — ${hijriLabel()}`);
    L.push("");
    if (S.t.days) {
      const parts = STATES.map((st, k) => S.t.st[k] ? `${st.name} ${S.t.st[k]}` : "").filter(Boolean).join("، ");
      L.push(`📅 الحضور (${S.t.days} ${S.t.days === 1 ? "يوم" : "أيام"} مرصودة): ${parts}${S.att != null ? ` — نسبة الحضور ${Math.round(S.att)}%` : ""}`);
      L.push(`🙋 المشاركة: ${S.t.part} | 📚 الواجبات: ${S.t.hwY} منجزة${S.t.hwN ? `، ${S.t.hwN} غير منجزة` : ""}`);
      if (S.pos.length || S.neg.length) L.push(`⭐ السلوك: ${S.pos.join("، ") || "—"}${S.neg.length ? ` | ⚠️ ملاحظات: ${S.neg.join("، ")}` : ""}`);
    } else {
      L.push("📅 لم يُرصد حضور بعد في هذه المادة.");
    }
    L.push(`🏅 النقاط: ${S.t.pts} — الترتيب ${S.rank} من ${activeCount(S.c)}`);
    if (S.hasG) {
      L.push(S.filledMax < S.maxTot ? `💯 الدرجة حتى الآن: *${S.gtot} من ${S.filledMax}* مرصودة (من أصل ${S.maxTot}) — التقدير: ${S.lv.t}` : `💯 الدرجة: *${S.gtot} من ${S.maxTot}* — التقدير: ${S.lv.t}`);
      const cols = ASSESS.filter(a => S.g[a.k] != null).map(a => `${a.n} ${S.g[a.k]}/${a.max}`);
      if (cols.length) L.push("   " + cols.join(" · "));
    }
    if (S.subs.length) L.push(`📝 الأوراق التفاعلية: ${S.subs.length} ${S.subs.length === 1 ? "ورقة" : "أوراق"} — متوسط ${S.subsAvg}%`);
    L.push("");
    const lvI = S.lv ? S.lv.i : -1;
    L.push(lvI === 0 ? "نبارك لكم تميّز ابنكم، ونشكر لكم حسن المتابعة 🌟" :
      (lvI === 1 || lvI === 2) ? "مستوى جيد، ونأمل مواصلة المتابعة اليومية للواجبات والمشاركة 👍" :
      lvI === 3 ? "يحتاج ابنكم مزيداً من المتابعة في الواجبات والمشاركة، ونحن معكم 💪" :
      lvI === 4 ? "نرجو التواصل معنا لوضع خطة دعم مشتركة تعين ابنكم 🤝" :
      (S.t.pts > 0 ? "بداية طيبة، ونأمل الاستمرار 🌱" : "نسعد بتواصلكم ومتابعتكم 🌹"));
    // 📎 أدلة وأعمال: روابط عرض عامة تُفتح بلا تسجيل (تُحمَّل قائمتها عند فتح بطاقة الطالب)
    const F0 = FILES(), fl0 = SFILES[cid + ":" + i] || [];
    if (F0 && fl0.length) {
      L.push("");
      L.push("📎 أدلة وأعمال ابنكم:");
      fl0.slice(0, 5).forEach(f => L.push(`• ${f.n}: ${F0.viewURL(f.id)}`));
      if (fl0.length > 5) L.push(`• وغيرها ${fl0.length - 5} ملفاً`);
    }
    L.push("");
    L.push(`معلم المادة: ${TE.name}`);
    L.push(META.school.name);
    return L.join("\n");
  }
  const cardOpen = (i) => { const h = OV.querySelector(".stu-head"); return !!(h && h.dataset.si === String(i)); };
  function studentCard(cid, i) {
    if (CLOUD && fdb && !SUBS[cid]) { loadSubs(cid).then(() => { if (cardOpen(i)) studentCard(cid, i); }); }
    if (FILES() && !SFILES[cid + ":" + i]) loadStudentFiles(cid, i, () => { if (cardOpen(i)) studentCard(cid, i); });
    const S = studentSummary(cid, i), c = S.c, s = S.s, t = S.t, rank = S.rank;
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🎖️";
    const comms = ((DB.comms[cid] || []).filter(x => x.si === i)).slice(-4).reverse();
    const phone = (s.p || "").replace(/\D/g, "").replace(/^0/, "966");
    const waTxt = encodeURIComponent(parentMessage(cid, i));
    const phone2 = (s.p2 || "").replace(/\D/g, "").replace(/^0/, "966");
    // شارات بيانات الطالب: ما ملأه المدير وحده يظهر — الصحة والاحتياج أولاً لأنهما يغيّران تعامل المعلم
    const infoChips = [
      s.health ? { ic: "⚕️", t: "صحة", v: s.health, c: "var(--bad)" } : null,
      s.need ? { ic: "♿", t: "احتياج", v: s.need, c: "var(--st5)" } : null,
      s.nat ? { ic: "🌍", t: "الجنسية", v: s.nat, c: "var(--st4)" } : null,
      s.noor ? { ic: "🆔", t: "نور", v: s.noor, c: "var(--st3)" } : null,
      s.rel ? { ic: "👤", t: "وليّه", v: s.rel, c: "var(--st3)" } : null,
      s.note ? { ic: "📝", t: "ملاحظة", v: s.note, c: "var(--st6)" } : null
    ].filter(Boolean);
    const sfl = SFILES[cid + ":" + i] || [];
    const gradeChips = ASSESS.filter(a => S.g[a.k] != null).map(a => `<span class="cc" style="background:${(DB.grades[cid] || {})[i] && (DB.grades[cid][i][a.k] != null) ? "var(--navy)" : "#6b7280"}" title="${(DB.grades[cid] || {})[i] && (DB.grades[cid][i][a.k] != null) ? "درجة يدوية" : "محسوبة تلقائياً من الرصد"}">${esc(a.n)} ${S.g[a.k]}/${a.max}</span>`).join("");
    openSheet(`
      <div class="stu-head" data-si="${i}"><div style="font-size:34px">${medal}</div><div class="big">${esc(s.n)}</div><div class="sub">${esc(c.name)} — الترتيب ${rank} من ${activeCount(c)}${S.lv ? ` — <span class="lvl lvl${S.lv.i}">${S.lv.t}</span>` : ""}</div></div>
      <div class="statrow">
        <div class="stat"><div class="v">${t.pts}</div><div class="l">النقاط</div></div>
        <div class="stat" title="${S.filledMax && S.filledMax < S.maxTot ? `من البنود المرصودة حتى الآن — ${S.maxTot} عند اكتمال الرصد` : ""}"><div class="v">${S.hasG ? S.gtot : "—"}</div><div class="l">الدرجة من ${S.filledMax || S.maxTot}</div></div>
        <div class="stat"><div class="v">${S.att != null ? Math.round(S.att) + "%" : "—"}</div><div class="l">الحضور</div></div>
        <div class="stat"><div class="v">${t.hwY}${t.hwN ? `<small style="color:var(--bad)">/${t.hwN}✗</small>` : ""}</div><div class="l">واجبات ✓</div></div>
        <div class="stat"><div class="v">${t.days}</div><div class="l">أيام مرصودة</div></div></div>
      <div class="countchips">${STATES.map((st, k) => t.st[k] ? `<span class="cc" style="background:${STCOLORS[k]}">${esc(st.name)} ${t.st[k]}</span>` : "").filter(Boolean).join("") || '<span style="color:var(--muted);font-size:13px">لا حضور مرصود بعد</span>'}</div>
      <div class="countchips">${Object.keys(S.behAgg).map(bi => `<span class="cc" style="background:${BEH[bi].pts >= 0 ? "var(--ok)" : "var(--bad)"}">${esc(BEH[bi].name)} ×${S.behAgg[bi]}</span>`).join("")}</div>
      ${gradeChips ? `<div class="countchips" style="margin-top:4px">${gradeChips}</div><div class="empty-note" style="padding:2px 4px 0;text-align:right;font-size:12px">الرمادي محسوب تلقائياً من الرصد، والكحلي أدخلته يدوياً. تُعدَّل من تبويب الدرجات.</div>` : ""}
      ${S.subs.length ? `<div class="empty-note" style="padding:4px;text-align:right">📝 الأوراق التفاعلية: ${S.subs.length} — متوسط ${S.subsAvg}%</div>` : ""}
      ${FILES() ? `<div style="border-top:1px solid var(--line);margin:12px 0 8px;padding-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center"><b style="color:var(--navy)">📎 أدلة وأعمال</b><button class="btn-soft" id="sc-files">+ إضافة</button></div>
        <div id="sc-flist" style="margin-top:6px">${sfl.length ? sfl.slice(0, 6).map(f => `<div class="comm-item"><button class="lnk" data-fopen="${esc(f.id)}">📎 ${esc(f.n)}</button><div class="meta">${esc(FILES().fmt(f.sz))}${f.tn ? " — " + esc(f.tn) : ""}</div></div>`).join("") : '<div class="empty-note" style="padding:10px">لا مرفقات — أضف صورة عمل الطالب أو ورقته لتصل ولي الأمر مع التقرير</div>'}</div></div>` : ""}
      <div style="border-top:1px solid var(--line);margin:12px 0 8px;padding-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center"><b style="color:var(--navy)">📞 سجل التواصل</b><button class="btn-soft" id="sc-addcomm">+ إضافة</button></div>
        <div id="sc-comms" style="margin-top:6px">${comms.length ? comms.map(x => `<div class="comm-item"><span class="tag">${esc(x.why)}</span> ${esc(x.note || "")}<div class="meta">${esc(x.via)} — ${esc(x.date)}</div></div>`).join("") : '<div class="empty-note" style="padding:10px">لا مراسلات مسجلة</div>'}</div></div>
      ${infoChips.length ? `<div class="countchips" style="margin-top:6px">${infoChips.map(x => `<span class="cc" style="background:${x.c}" title="${esc(x.t)}: ${esc(x.v)}">${x.ic} ${esc(x.v.length > 46 ? x.v.slice(0, 46) + "…" : x.v)}</span>`).join("")}</div>` : ""}
      <a class="wa-btn ${phone ? "" : "off"}" id="sc-wa" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${waTxt}">💬 واتساب ولي الأمر${phone ? "" : " (لا رقم مسجل)"}</a>
      ${phone2 ? `<a class="wa-btn" style="background:#128C7E;margin-top:6px" target="_blank" rel="noopener" href="https://wa.me/${phone2}?text=${waTxt}">💬 الرقم الآخر${s.rel ? ` (${esc(s.rel)})` : ""}</a>` : ""}
      <div class="empty-note" style="padding:4px 2px 0;text-align:right;font-size:12px">تُرسل رسالة كاملة (الحضور، المشاركة، الواجبات، السلوك، النقاط، الدرجات، التوصية) وتُسجَّل في سجل التواصل تلقائياً.</div>
      ${phone ? "" : askPhoneHtml(cid, i, "sc")}
      <div class="sheet-actions" style="flex-wrap:wrap">
        <button class="btn-plain" style="flex:1 1 46%" id="sc-report">📄 تقرير للطباعة</button>
        <button class="btn-plain" style="flex:1 1 46%" id="sc-letter">✉️ إشعار ولي الأمر</button>
        <button class="btn-gold" style="flex:1 1 100%" id="sc-msg">📬 رسالة إلى حسابه ووليّه</button>
        <button class="btn-gold" style="flex:1 1 100%" id="sc-prog">📈 تقدّم الطالب في كل المواد</button>
        <button class="btn-gold" style="flex:1 1 100%" id="sc-cert">🎓 شهادة تميّز (طباعة فاخرة)</button>
        <button class="btn-primary" style="flex:1 1 100%" onclick="window._sheetClose()">إغلاق</button></div>`,
      (o) => {
        o.querySelector("#sc-addcomm").onclick = () => commSheet(cid, i);
        /* الباب كان مغلقاً بلا لافتة: المعلم هو من يعرف رقم ولي الأمر ولا يستطيع حفظه (التعديل محصور
           في لوحة المدير)، فيخرج من «سجلي» ويرسل من جواله الشخصي فلا يبقى أثر. */
        bindAskPhone(o, cid, i, "sc", () => setTimeout(() => { if (cardOpen(i)) studentCard(cid, i); }, 1200));
        const fb = o.querySelector("#sc-files");
        if (fb) fb.onclick = () => filesSheet("📎 أدلة وأعمال — " + s.n, "student", { c: cid, i },
          "صور أعمال الطالب وأوراقه — تُرسل روابطها مع رسالة ولي الأمر.",
          () => loadStudentFiles(cid, i, () => studentCard(cid, i)));   // إغلاق نافذة المرفقات يعيد فتح بطاقة الطالب
        o.querySelectorAll("[data-fopen]").forEach(b => b.onclick = () => { const F = FILES(); if (F) { try { F.open(b.dataset.fopen); } catch (e) { } } });
        o.querySelector("#sc-report").onclick = () => printReport(cid, i);
        { const mb = o.querySelector("#sc-msg"); if (mb) mb.onclick = () => msgSheet(cid, [i], { after: () => { if (cardOpen(i)) studentCard(cid, i); } }); }
        o.querySelector("#sc-letter").onclick = () => printLetter(cid, i);
        o.querySelector("#sc-cert").onclick = () => printCertificate(cid, i);
        o.querySelector("#sc-prog").onclick = () => studentProgress(cid, i);
        const wa = o.querySelector("#sc-wa");
        if (wa && phone) wa.addEventListener("click", () => {
          DB.comms[cid] = DB.comms[cid] || [];
          DB.comms[cid].push({ si: i, why: S.why, via: "واتساب", note: "تقرير متابعة تلقائي" + (S.hasG ? ` — الدرجة ${S.gtot}/${S.maxTot}` : "") + ` — النقاط ${t.pts}` + (sfl.length ? ` — مع ${sfl.length} مرفقاً` : ""), date: hijriLabel(), ts: Date.now() });
          save("comms:" + cid);
          setTimeout(() => { if (OV.querySelector(".stu-head")) studentCard(cid, i); }, 400);
        });
      });
  }
  function commSheet(cid, i) {
    const c = classById(cid);
    openSheet(`<h4>تواصل مع ولي أمر: ${esc(c.students[i].n)}</h4>
      <div class="field"><label>السبب</label><select id="cm-why" class="search-box">${["إشعار تميّز", "إشعار ضعف", "غياب متكرر", "سلوك", "واجبات", "دعوة لمقابلة", "أخرى"].map(x => `<option>${x}</option>`).join("")}</select></div>
      <div class="field"><label>الوسيلة</label><select id="cm-via" class="search-box">${["واتساب", "اتصال هاتفي", "رسالة", "مقابلة", "نور"].map(x => `<option>${x}</option>`).join("")}</select></div>
      <textarea class="note" id="cm-note" rows="2" placeholder="ملاحظة (اختياري)…"></textarea>
      ${FILES() ? '<button class="btn-soft" id="cm-file" style="width:100%;margin-bottom:8px">📎 إرفاق ملف بهذه المراسلة</button><div class="empty-note" id="cm-fmsg" style="padding:0 2px 6px;min-height:0"></div>' : ""}
      <div class="sheet-actions"><button class="btn-plain" onclick="window._sheetClose()">إلغاء</button><button class="btn-primary" id="cm-ok">حفظ</button></div>`,
      (o) => {
        const added = [];
        const fb = o.querySelector("#cm-file");
        if (fb) fb.onclick = async () => {
          const F = FILES(); if (!F) return;
          let got = [];
          try { got = await F.attach({ scope: "comm", ref: { c: cid, i }, title: "مرفق المراسلة" }) || []; } catch (e) { got = []; }
          got.forEach(r => added.push(r));
          const m = o.querySelector("#cm-fmsg");
          if (m) m.textContent = added.length ? `📎 ${added.length} مرفقاً — يُحفظ رابطه مع المراسلة` : "";
        };
        o.querySelector("#cm-ok").onclick = () => {
          const F = FILES();
          const extra = (F && added.length) ? ("\n" + added.map(r => "📎 " + r.n + ": " + F.viewURL(r.id)).join("\n")) : "";
          DB.comms[cid] = DB.comms[cid] || [];
          DB.comms[cid].push({ si: i, why: o.querySelector("#cm-why").value, via: o.querySelector("#cm-via").value, note: o.querySelector("#cm-note").value.trim() + extra, date: hijriLabel() });
          save("comms:" + cid); closeSheet(); studentCard(cid, i);
        };
      });
  }
  /* خطّ الطباعة يُحمَّل بوسم link في آخر المستند لا بـ@import داخل <style> في رأسه:
     ورقة نمطٍ في الرأس تحجب تنفيذ كل سكربت بعدها حتى تُحسم، وشبكةُ مدرسةٍ تبتلع طلب
     fonts.googleapis تُبقي المستند في «loading» فلا يُنفَّذ سكربت الملاءمة ولا تُنادى
     print() أبداً — نافذة بيضاء بلا حوار طباعة ولا رسالة. */
  const PRINT_FONT = "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap";
  const PRINT_CSS = `
    @page{size:A4;margin:10mm}
    *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{font-family:'Tajawal',Arial,sans-serif;color:#1B2A3A;padding:4px;overflow:hidden}
    .frame{border:3px solid #D7A93F;border-radius:14px;padding:22px 26px;position:relative;page-break-inside:avoid}
    .ws p{line-height:1.75;font-size:13.5px;margin:4px 0}.ws .h{margin-bottom:10px}.ws .h .bar{padding:9px;font-size:18px}.ws .tt{font-size:19px;margin:6px 0}
    .ws .ops{display:flex;flex-wrap:wrap;gap:2px 14px;padding-inline-start:16px;margin:0 0 6px}.ws .op{flex:1 1 42%;font-size:13px;line-height:1.7}
    .ws table td{padding:3px 8px;font-size:12.5px;text-align:start;border:0;vertical-align:top}.ws table{margin:4px 0}
    .ws .sig{margin-top:18px}.ws .key{font-size:8px;color:#999;margin-top:6px;transform:rotate(180deg)}
    .compact td,.compact th{padding:3px 6px;font-size:12.5px;line-height:1.35}.compact td{white-space:nowrap}.compact .nm{text-align:start}
    .compact .auto{color:#555}.compact .lv0{color:#2e9e5b}.compact .lv4{color:#d64545}.note{font-size:11.5px;color:#666;margin-top:6px}
    .sheetdoc{font-size:13px}.sheetdoc .card{box-shadow:none;border:1px solid #e5dcc5;border-radius:10px;padding:10px 12px;margin:8px 0;background:#fff}
    .sheetdoc h3{font-size:15px;margin:6px 0}.sheetdoc table{margin:6px 0}.sheetdoc td,.sheetdoc th{padding:4px 6px;font-size:12px}
    .sheetdoc .empty-note{font-size:12px}.sheetdoc .ana-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.sheetdoc .ana{border:1px solid #e5dcc5;border-radius:8px;padding:6px;text-align:center}
    .sheetdoc .bar-row{display:flex;align-items:center;gap:8px;margin:3px 0}.sheetdoc .bar-track{flex:1;height:10px;background:#eee;border-radius:6px;overflow:hidden}.sheetdoc .bar-fill{height:100%}
    .sheetdoc .rep-head{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
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
    .ctr{text-align:center;font-size:15px;line-height:2.1}
    .h .bar .plogo{height:38px;width:auto;vertical-align:middle;margin-inline-end:12px;border-radius:7px;background:#fff;padding:3px}`;

  /* ═══ شعار المدرسة في ترويسة كل مطبوع ═══
     يرفعه المدير من «⚙️ الإدارة ← 🗂️ مكتبة المدرسة» كمرفق بنطاق school ووصف {kind:"logo"}.
     يُقرأ مرة واحدة ويُحفظ نصاً (data URI) لأن نافذة الطباعة تُكتب فوراً بلا انتظار. */
  let LOGO = "", logoTries = 0;
  async function loadLogo(force) {
    try {
      const F = window.SIJIL_FILES;
      // js/files.js يُحمَّل بعد app.js: إن لم يصل بعد أعدنا المحاولة مرة واحدة قبل أول طباعة
      if (!F || typeof F.list !== "function") {
        if (logoTries++ < 3) setTimeout(() => { try { loadLogo(force); } catch (e) { } }, 1500);
        return "";
      }
      if (LOGO && !force) return LOGO;
      const arr = await F.list("school", { kind: "logo" });
      if (!arr || !arr.length) { LOGO = ""; return ""; }
      const got = await F.blobOf(arr[0].id);
      LOGO = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result || "")); r.onerror = () => res(""); r.readAsDataURL(got.blob); });
      return LOGO;
    } catch (e) { return LOGO; }
  }
  const LOGO_ANCHOR = '<div class="h"><div class="bar">';
  const withLogo = (html) => (LOGO && String(html).indexOf(LOGO_ANCHOR) >= 0)
    ? String(html).replace(LOGO_ANCHOR, LOGO_ANCHOR + '<img class="plogo" src="' + LOGO + '" alt="">')
    : html;

  // حجب النوافذ المنبثقة (سفاري على الآيفون والتطبيق المثبّت) يجعل window.open تعيد null: رسالة صريحة بدل استثناء صامت يُميت كل أزرار الطباعة
  function printBlocked() {
    const old = document.getElementById("print-blocked"); if (old) old.remove();
    const b = document.createElement("div");
    b.id = "print-blocked";
    b.style.cssText = "position:fixed;inset-inline:12px;bottom:16px;z-index:99999;background:#7a1f1f;color:#fff;padding:12px 14px;border-radius:14px;font:600 14px/1.7 inherit;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.35)";
    b.textContent = "تعذّر فتح نافذة الطباعة — المتصفح يحجب النوافذ المنبثقة. اسمح بالنوافذ لهذا الموقع ثم أعد المحاولة، أو افتح التطبيق من المتصفح بدل الأيقونة المثبّتة.";
    b.onclick = () => b.remove();
    (document.fullscreenElement || document.body).appendChild(b);
    setTimeout(() => { if (b.parentNode) b.remove(); }, 9000);
  }
  function printDoc(title, bodyHtml, opts) {
    bodyHtml = withLogo(bodyHtml);
    const w = window.open("", "_blank");
    if (!w || !w.document) { printBlocked(); return; }
    const land = !!(opts && opts.land);
    const cls = (opts && opts.cls) ? " " + opts.cls : "";
    const appLink = (opts && opts.appCss) ? (() => { const l = document.querySelector('link[href*="css/app.css"]'); return l ? `<link rel="stylesheet" href="${l.href}">` : ""; })() : "";
    // ملاءمة المحتوى لصفحة A4 واحدة: القياس بعد تحميل الخطوط، ثم تصغير متناسب إن لزم، والإطار يملأ الصفحة
    /* التهيئة كانت معلَّقة على حدث load وحده. أي مورد لا يُحسم — خطوط Google على شبكة مدرسة
       تبتلع الطلب — يُبقي المستند في «loading» فلا تُنادى print() أبداً: نافذة بيضاء بلا حوار طباعة
       ولا رسالة. الآن الدالة مُسمّاة ومحروسة بعلَم، وتُنادى من load ومن مؤقّت احتياطي معاً. */
    const fit = `function __fit(){if(window.__fitRan)return;window.__fitRan=1;var avail=Math.floor(${land ? 190 : 277}*3.7795)-10;function go(){var f=document.querySelector('.frame');if(!f)return print();var h=f.getBoundingClientRect().height;var s=Math.min(1,avail/h);if(s<0.995){f.style.width=(100/s)+'%';f.style.transformOrigin='top right';f.style.transform='scale('+s+')';}f.style.minHeight=Math.floor(avail/s)+'px';document.body.style.height=avail+'px';document.documentElement.style.height=avail+'px';document.documentElement.style.overflow='hidden';document.body.setAttribute('data-fit',s.toFixed(3));setTimeout(function(){print();},250);}var done=false;function once(){if(done)return;done=true;go();}if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){setTimeout(once,120);});}setTimeout(once,1400);}`;
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>${appLink}<style>${PRINT_CSS}html,body{width:${land ? 277 : 190}mm}${land ? "@page{size:A4 landscape;margin:10mm}" : ""}</style></head><body><div class="frame${cls}">${bodyHtml}</div><script>${fit}if(document.readyState==='complete')__fit();else{addEventListener('load',__fit);setTimeout(__fit,2600);}<\/script><link rel="stylesheet" href="${PRINT_FONT}"></body></html>`);
    w.document.close();
    /* حارس من النافذة الأم: إن بقي المستند محجوباً فلم يُنفَّذ سكربته أصلاً، اطبع كما هو
       بعد ثلاث ثوانٍ ونصف. __fitRan يُضبط أولاً فلا يُطبع مرتين إن استيقظ السكربت متأخراً. */
    setTimeout(() => {
      try {
        if (w.closed || w.__fitRan) return;
        if (typeof w.__fit === "function") { w.__fit(); return; }
        w.__fitRan = 1; w.focus(); w.print();
      } catch (e) { }
    }, 3500);
  }
  /* صيغ العدد العربية في المطبوعات (كما في js/ics.js): «9 نقاط» لا «9 نقطة»، و«غيابين» لا «2 غياب» */
  function cntAr(n, one, two, few, many) {
    const v = Number(n);
    if (!isFinite(v) || v !== Math.floor(v) || v < 0) return `${n} ${many}`;
    if (v === 1) return one;
    if (v === 2) return two;
    if (v >= 3 && v <= 10) return `${v} ${few}`;
    return `${v} ${many}`;
  }
  const ptsAr = (n) => cntAr(n, "نقطة واحدة", "نقطتين", "نقاط", "نقطة");
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
      <div class="ctr">من ${esc(c.name)}، تقديراً لتميّزه وحرصه وتفاعله المستمر،<br>حيث جمع <b>${esc(ptsAr(pts))}</b>. فله منّا كل الفخر، ونسأل الله له دوام التوفيق والعلا.</div>
      <div class="stars">${stars}</div>
      ${certSig()}
      <div class="ctr" style="color:#888;font-size:12px;margin-top:14px">${esc(hijriLabel())}</div>`, { land: true });
  }
  function printReport(cid, i) {
    const c = classById(cid), s = c.students[i], calc = classCalc(cid), t = calc[i].t, rank = calc[i].rank;
    const maxTot = ASSESS.reduce((a, b) => a + b.max, 0), g = effGrades(cid, i), gtot = gradeTotal(cid, i);
    const gmax = gradedMax(cid, i), gp = gradePct(cid, i), lv = gp == null ? null : levelOf(gp);   // التقدير من المرصود لا من 100 الثابتة
    printDoc("تقرير الطالب " + s.n, `
      <div class="h"><div class="bar">${esc(META.school.name)}</div><div class="m">تقرير متابعة الطالب — مادة ${esc(TE.subject)} — ${esc(hijriLabel())}</div></div>
      <div class="tt">${esc(s.n)}</div>
      <table><tr><th>الفصل</th><td>${esc(c.name)}</td><th>الترتيب</th><td>${rank} من ${activeCount(c)}</td></tr>
      <tr><th>مجموع النقاط</th><td>${t.pts}</td><th>الدرجة</th><td>${gmax ? `${gtot} / ${gmax}${lv ? ` — ${esc(lv.t)}` : ""}` : "لم تُرصد بعد"}</td></tr></table>
      ${gmax && gmax < maxTot ? `<div class="note">الدرجة والتقدير من البنود المرصودة حتى الآن (${gmax} درجة)، لا من ${maxTot} قبل رصد بقية الاختبارات.</div>` : ""}
      <table><tr><th>الحضور</th>${STATES.map(st => `<th>${esc(st.name)}</th>`).join("")}</tr>
      <tr><td>عدد</td>${STATES.map((st, k) => `<td>${t.st[k] || 0}</td>`).join("")}</tr></table>
      <table><tr><th>المشاركة</th><td>${t.part}</td><th>الواجبات المنجزة</th><td>${t.hwY}</td><th>أيام الرصد</th><td>${t.days}</td></tr></table>
      <table><tr>${ASSESS.map(a => `<th>${esc(a.n)}</th>`).join("")}</tr><tr>${ASSESS.map(a => `<td>${g[a.k] != null ? g[a.k] : "—"}</td>`).join("")}</tr></table>
      ${sigLine([{ l: "معلم المادة", v: TE.name }, { k: "principal", dots: 21 }])}`);
  }
  function printLetter(cid, i) {
    const c = classById(cid), s = c.students[i], t = calcStudent(cid, i);
    const abs = absCnt(t), att = attPct(t);                  // الغياب الفعلي = غائب + هارب (كبطاقة الطالب ورسالة الواتساب)
    const weak = t.pts < 0 || abs > 1 || t.hwN > 1;
    printDoc("إشعار ولي أمر " + s.n, `
      <div class="h"><div class="bar">${esc(META.school.name)}</div><div class="m">إشعار ولي الأمر — ${esc(hijriLabel())}</div></div>
      <div class="tt">${weak ? "إشعار متابعة" : "إشعار تميّز"}</div>
      <p>المكرّم ولي أمر الطالب / <b>${esc(s.n)}</b> — الصف ${esc(c.name)} &nbsp;&nbsp; حفظه الله</p>
      <p>السلام عليكم ورحمة الله وبركاته،</p>
      <p>${weak
        ? `نحيطكم علماً بأن ابنكم بحاجة إلى مزيد من المتابعة في مادة ${esc(TE.subject)}؛ حيث بلغت نقاطه ${t.pts}، و${abs ? `سجّل ${esc(cntAr(abs, "غياباً واحداً", "غيابين", "غيابات", "غياباً"))}` : "لم يسجّل غياباً"}، و${t.hwN ? `تخلّف عن ${esc(cntAr(t.hwN, "واجب واحد", "واجبين", "واجبات", "واجباً"))}` : "لم يتخلّف عن أي واجب"}${att != null ? ` (نسبة الحضور ${att}%)` : ""}. نأمل تعاونكم في متابعته وحثّه على الانتظام وأداء الواجبات.`
        : `يسعدنا إشعاركم بتميّز ابنكم في مادة ${esc(TE.subject)}؛ حيث بلغت نقاطه ${t.pts} مع انتظام في الحضور وأداء الواجبات. نشكر لكم حسن متابعتكم، ونسأل الله له دوام التوفيق.`}</p>
      <p>شاكرين لكم تعاونكم الدائم مع المدرسة.</p>
      ${sigLine([{ l: "معلم المادة", v: TE.name }, "principal", { l: "توقيع ولي الأمر", dots: 16 }])}`);
  }

  /* ═══ التقارير ═══ */
  let repClass = null;
  // 🎖️ تقرير الفصل الشامل لرائد الفصل (js/admin/teachers.js → SIJIL_ADMIN.leadReport) — يُلحق أسفل تقارير المعلم
  function leadSlot(box) {
    try {
      const ADM = window.SIJIL_ADMIN;
      if (!TE || !(TE.lead || []).length || !ADM || typeof ADM.leadReport !== "function") return;
      let slot = box.querySelector("#lead-slot");
      if (!slot) { slot = document.createElement("div"); slot.id = "lead-slot"; box.appendChild(slot); }
      const r = ADM.leadReport(slot); if (r && typeof r.catch === "function") r.catch(() => { });
    } catch (e) { }
  }
  function renderRep() {
    const box = $("#tab-rep"), cls = myClasses();
    if (!cls.length) { box.innerHTML = '<div class="empty-note">لا فصول مسندة</div>'; leadSlot(box); return; }
    if (!repClass || !cls.find(c => c.id === repClass)) repClass = cls[0].id;
    const c = classById(repClass), rows = classCalc(repClass).filter(r => r.active);
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
    // آخر حالة مرصودة للطالب: الغائب/المستأذن/الغائب بعذر/الهارب لا يظهر في لوحة الشرف
    const lastAway = (i) => lastAwayOf(repClass, i);
    const top = rows.slice().sort((a, b) => b.t.pts - a.t.pts).filter(r => r.t.pts > 0 && !lastAway(r.i)).slice(0, 10);
    const MED = ["🥇", "🥈", "🥉"];
    // ترتيب تنافسي داخل اللوحة: المتساوون في النقاط يأخذون الميدالية نفسها، لا يكسر التعادلَ موضعُ الاسم في المصفوفة
    { let hr = 0, hp = null; top.forEach((r, k) => { if (hp === null || r.t.pts !== hp) { hr = k + 1; hp = r.t.pts; } r.hrank = hr; }); }
    const honor = document.createElement("div");
    honor.className = "card";
    honor.innerHTML = `<div class="rep-head"><div class="rt">🏆 لوحة شرف ${esc(c.name)}</div><div class="rs">${esc(META.school.name)} — ${esc(TE.subject)} — ${esc(hijriLabel())}</div></div>
      <h3 class="no-print"><span class="dot"></span>🏆 لوحة الشرف — ${esc(c.name)}<button class="btn-gold" style="margin-inline-start:auto" id="hon-print">🖨️ طباعة للتعليق</button></h3>
      ${top.length ? `<div class="table-scroll"><table class="report-table"><tr><th>الترتيب</th><th style="min-width:150px">الطالب المتميّز</th><th>النقاط</th></tr>
        ${top.map((r, k) => { const hk = r.hrank || k + 1; return `<tr><td style="font-size:16px">${hk <= 3 ? MED[hk - 1] : hk}</td><td class="nm">${esc(r.s.n)}</td><td><b>${r.t.pts}</b></td></tr>`; }).join("")}</table></div>`
        : '<div class="empty-note">ابدأ الرصد وستظهر أسماء المتميزين هنا 🌟</div>'}`;
    box.appendChild(honor);
    parentReportsCard(box);
    box.querySelectorAll(".chip").forEach(ch => ch.onclick = () => { repClass = ch.dataset.c; renderRep(); });
    $("#rep-print").onclick = () => printFollowup(c, rows, tot);
    const hp = $("#hon-print"); if (hp) hp.onclick = () => printHonor(c, top, MED);
    leadSlot(box);   // بعد ربط شرائح الفصول حتى لا تُلتقط شرائح تقرير الرائد
  }
  function printFollowup(c, rows, tot) {
    printDoc("كشف متابعة " + c.name, `
      <div class="h"><div class="bar">${esc(META.school.name)}</div><div class="m">${esc(TE.subject)} — معلم المادة: ${esc(TE.name)} — ${esc(hijriLabel())}</div></div>
      <div class="tt">سجل متابعة الفصل — ${esc(c.name)}</div>
      <table class="compact"><tr><th>م</th><th style="min-width:150px">اسم الطالب</th>${STATES.map(st => `<th>${esc(st.name)}</th>`).join("")}<th>مشاركة</th><th>واجبات</th><th>سلوك+</th><th>سلوك−</th><th>النقاط</th><th>الترتيب</th></tr>
      ${rows.map((r, i) => `<tr><td>${i + 1}</td><td class="nm">${esc(r.s.n)}</td>${STATES.map((st, k) => `<td>${r.t.st[k] || ""}</td>`).join("")}<td>${r.t.part || ""}</td><td>${r.t.hwY || ""}</td><td>${r.t.behP || ""}</td><td>${r.t.behN || ""}</td><td><b>${r.t.pts}</b></td><td>${r.rank}</td></tr>`).join("")}
      <tr><td></td><td class="nm"><b>المجموع</b></td>${STATES.map((st, k) => `<td>${tot.st[k] || ""}</td>`).join("")}<td>${tot.part || ""}</td><td>${tot.hwY || ""}</td><td>${tot.behP || ""}</td><td>${tot.behN || ""}</td><td></td><td></td></tr></table>
      ${sigLine([{ l: "معلم المادة", v: TE.name }, "principal"])}`, { land: true });
  }
  function printHonor(c, top, MED) {
    printDoc("لوحة شرف " + c.name, `
      <div class="h"><div class="bar">${esc(META.school.name)}</div><div class="m">${esc(TE.subject)} — ${esc(hijriLabel())}</div></div>
      <div class="tt">🏆 لوحة الشرف — ${esc(c.name)}</div>
      <table><tr><th>الترتيب</th><th>الطالب المتميّز</th><th>النقاط</th></tr>
      ${top.map((r, k) => { const hk = r.hrank || k + 1; return `<tr><td style="font-size:20px">${hk <= 3 ? MED[hk - 1] : hk}</td><td style="font-weight:800">${esc(r.s.n)}</td><td><b>${r.t.pts}</b></td></tr>`; }).join("")}</table>
      <p style="text-align:center;color:#666;margin-top:20px">نبارك لأبنائنا المتميّزين ونسأل الله لهم دوام التفوّق 🌟</p>
      ${sigLine([{ l: "معلم المادة", v: TE.name }, "principal"])}`);
  }

  /* ═══ 📎 المرفقات (js/files.js) — كل نداء محاط بحارس فإن لم يُحمَّل الملف يبقى كل شيء عاملاً ═══ */
  const FILES = () => { const F = window.SIJIL_FILES; return (F && typeof F.libraryCard === "function") ? F : null; };
  const SFILES = {};                                   // "cid:si" → قائمة مرفقات الطالب (لتضمينها في رسالة ولي الأمر)
  function loadStudentFiles(cid, i, after) {
    const F = FILES(), k = cid + ":" + i;
    if (!F) { SFILES[k] = []; if (after) after([]); return; }
    F.list("student", { c: cid, i }).then(a => { SFILES[k] = a || []; if (after) after(SFILES[k]); })
      .catch(() => { SFILES[k] = SFILES[k] || []; if (after) after(SFILES[k]); });
  }
  // نافذة مرفقات جاهزة (قائمة + إرفاق + حذف) لأي موضع في التطبيق — لا تُستعمل داخل الحصة الحية
  function filesSheet(title, scope, ref, hint, onClose) {
    const F = FILES();
    if (!F) { alert("المرفقات غير متاحة الآن — أعد تحميل الصفحة"); return; }
    openSheet(`<h4>${esc(title)}</h4><div id="fx-box"><div class="empty-note">جارِ التحميل…</div></div>
      <div class="sheet-actions"><button class="btn-primary" id="fx-x">إغلاق</button></div>`, (o) => {
      const box = o.querySelector("#fx-box");
      o.querySelector("#fx-x").onclick = () => { closeSheet(); if (onClose) { try { onClose(); } catch (e) { } } };
      Promise.resolve(F.libraryCard(box, { scope, ref, title, hint }))
        .catch(() => { box.innerHTML = '<div class="empty-note">تعذّر تحميل المرفقات — تحقق من الاتصال</div>'; });
    });
  }
  // شريط مرفقات الدرس داخل الحصة الحية (نافذة المرفقات نفسها تعلو شاشة العرض)
  function lessonFilesBar(box, code, wk) {
    const F = FILES(); if (!F || !box) return;
    const wrap = document.createElement("div"); wrap.className = "rl-files";
    box.appendChild(wrap);
    // حذفُ ملف من أي شاشة أخرى يجب أن يُسقط بطاقته من هنا فوراً
    const onChg = () => { if (wrap.isConnected) paint(); else window.removeEventListener("sijil:files", onChg); };
    window.addEventListener("sijil:files", onChg);
    const paint = async () => {
      let arr = [];
      try { arr = await F.list("lesson", { code, wk }); } catch (e) { arr = []; }
      wrap.innerHTML = `<span class="rf-h">📎 مرفقات الدرس</span>` +
        (arr.length ? arr.map(f => `<button class="rf-i" data-o="${esc(f.id)}">${esc(f.n)}</button>`).join("") : `<span class="rf-e">لا مرفقات بعد</span>`) +
        `<button class="rf-add" id="rf-add">＋ إضافة مرفق</button>`;
      const ab = wrap.querySelector("#rf-add");
      if (ab) ab.onclick = async () => { try { await F.attach({ scope: "lesson", ref: { code, wk }, title: "مرفقات الدرس" }); } catch (e) { } paint(); };
      wrap.querySelectorAll("[data-o]").forEach(b => b.onclick = () => { try { F.open(b.dataset.o); } catch (e) { } });
    };
    paint();
  }

  /* ═══ المزيد (بحث + مدير + نسخة احتياطية) ═══ */
  async function renderMore() {
    const box = $("#tab-more");
    let adminHtml = "";
    if (TE.admin && CLOUD && fdb) adminHtml = '<div class="card" id="adm-card"><h3><span class="dot"></span>لوحة المدير — رصد المعلمين لحظياً</h3><div class="empty-note">جارِ التحميل…</div></div>';
    else if (TE.admin) adminHtml = `<div class="card"><h3><span class="dot"></span>لوحة المدير</h3>${D.teachers.filter(t => (t.classes || []).length).map(t => `<div class="admin-row"><span>${esc(t.name)}<div class="cls">${esc(t.subject)}</div></span><span class="cls">${(t.classes || []).length} فصول</span></div>`).join("")}</div>`;
    if (TE.admin) adminHtml += `<div class="card"><h3><span class="dot"></span>📊 مستويات الطلاب</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn-gold" id="adm-levels">📊 حسب الفصل وكل المواد</button><button class="btn-gold" id="adm-school">🏫 ملخص المدرسة حسب المادة</button></div></div>`;
    if (TE.admin) { const mvOff = CLOUD && (!fdb || !MOVES_OK); adminHtml += `<div class="card"><h3><span class="dot"></span>👥 إدارة الطلاب</h3><button class="btn-gold" id="adm-moves" style="width:100%${mvOff ? ";opacity:.55" : ""}" ${mvOff ? "disabled" : ""}>👥 نقل الطلاب</button><div class="empty-note" style="padding:8px 4px 0">نقل طالب إلى فصل آخر مع كل بياناته، أو تسجيل خروجه من المدرسة — ينعكس على كل المعلمين عند فتح التطبيق${(D.moves || []).length ? ` · ${D.moves.length} حركة مسجلة` : ""}${MOVE_CONFLICTS.length ? ` · <span style="color:var(--bad)">⚠️ ${MOVE_CONFLICTS.length} حركة متعارضة لم تُطبَّق (انظر سجل الحركات)</span>` : ""}${mvOff ? '<div style="color:var(--bad);margin-top:6px">⚠️ النقل معطّل: لم تُحمَّل حركات النقل من السحابة عند فتح التطبيق (تُعرض آخر قائمة محفوظة على هذا الجهاز) — أعد تحميل الصفحة مع اتصال بالإنترنت</div>' : ""}</div></div>`; }
    box.innerHTML = `
      ${PIN_WEAK && lsGet(weakSeenKey()) !== "1" ? '<div class="nt-warn" id="pin-weak">🔐 رقم دخولك قصير (أقل من ٦ خانات) ويسهل تخمينه — غيّره من «🔐 تغيير رقم الدخول» أدناه. <button class="btn-soft" id="pin-weak-x" style="margin-right:6px;padding:3px 10px">لا تُذكّرني</button></div>' : ""}
      <div id="me-slot"></div>
      <div class="card"><h3><span class="dot"></span>🧰 أدوات المعلم</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn-gold" id="tl-curr">📚 مناهجي</button>
          <button class="btn-gold" id="tl-sessions">🗓️ سجل الحصص</button>
          <button class="btn-gold" id="tl-plans">🩺 الخطط العلاجية والإثرائية</button>
          <button class="btn-gold" id="tl-calc">🧮 حاسبة المهام الأدائية</button>
          <button class="btn-gold" id="tl-sheets">📝 بنك أوراق العمل</button>
          <button class="btn-gold" id="tl-assign">📤 الأوراق المرسلة</button>
        </div></div>
      <div class="card" id="nt-card"><h3><span class="dot"></span>🔔 تنبيهات الحصص</h3>
        <div id="nt-mount"></div><div id="nt-opts"></div></div>
      <div class="card${TE.admin ? "" : " ro"}" id="more-lib"><h3><span class="dot"></span>🗂️ مكتبة المدرسة</h3>
        <div id="more-lib-box"><div class="empty-note">جارِ التحميل…</div></div></div>
      <div class="card"><h3><span class="dot"></span>🔍 بحث عن طالب</h3>
        <input class="search-box" id="mo-search" placeholder="اكتب اسم الطالب…">
        <div class="search-res" id="mo-res"></div></div>
      ${adminHtml}
      <div class="card"><h3><span class="dot"></span>النسخة الاحتياطية</h3>
        <div style="display:flex;gap:8px"><button class="btn-gold" id="bk-out" style="flex:1;text-align:center">⬇️ تصدير بياناتي</button><button class="btn-gold" id="bk-in" style="flex:1;text-align:center">⬆️ استعادة نسخة</button><input type="file" id="bk-file" accept=".json" class="hidden"></div>
        <div class="empty-note" style="padding:10px 4px 0">${CLOUD ? "بياناتك محفوظة سحابياً تلقائياً — التصدير نسخة إضافية بيدك" : "ملف JSON يُحفظ أو يُرسل واتساب ثم يُستعاد على أي جهاز"}</div></div>
      <div class="card"><h3><span class="dot"></span>مكتبة التقييمات</h3>
        <div class="countchips">${assessView(STATES).map(s => `<span class="cc" style="background:${STCOLORS[s.i]}">${esc(s.name)} ${s.pts >= 0 ? "+" : ""}${s.pts}</span>`).join("")}</div>
        <div class="countchips">${assessView(BEH).map(b => `<span class="cc" style="background:${b.pts >= 0 ? "var(--ok)" : "var(--bad)"}">${esc(b.name)} ${b.pts >= 0 ? "+" : ""}${b.pts}</span>`).join("")}</div></div>
      <div class="card"><h3><span class="dot"></span>عن البرنامج</h3><div style="font-size:13.5px;line-height:2;color:var(--muted)">سجلي — سجل المتابعة الرقمي — ${CLOUD ? "النسخة السحابية المشتركة ☁️" : "نسخة تجريبية محلية"}.<br>يعمل على أي جهاز: جوال، تابلت، وكمبيوتر.<br><b>المطوّر:</b> أ. ضيف الله أحمد محمد مشني</div></div>`;
    // 👤 بياناتي (js/admin/teachers.js) — بطاقة الحساب وتغيير رقم الدخول للمعلم داخل «المزيد».
    // في لوحة المدير تظهر داخل «⚙️ الإدارة» — فلا نكررها هنا (تفادي تكرار معرّفات #me-*)
    try {
      const slot = $("#me-slot"), ADM = window.SIJIL_ADMIN;
      if (slot && ADM && typeof ADM.profileCard === "function") {
        if (adminView()) slot.innerHTML = "";
        else { document.querySelectorAll(".adm-pane.hidden #mg-profile").forEach(x => { x.innerHTML = ""; }); ADM.profileCard(slot); }
      }
    } catch (e) { }
    const pwx = $("#pin-weak-x");
    if (pwx) pwx.onclick = () => { lsSet(weakSeenKey(), "1"); const w = $("#pin-weak"); if (w) w.remove(); };
    // أدوات المعلم
    const al = $("#adm-levels"); if (al) al.onclick = adminLevels;
    const as = $("#adm-school"); if (as) as.onclick = schoolSummary;
    const am = $("#adm-moves"); if (am) am.onclick = adminMoves;
    $("#tl-curr").onclick = toolCurriculum;
    $("#tl-sessions").onclick = toolSessions;
    $("#tl-plans").onclick = toolPlans;
    $("#tl-calc").onclick = toolCalc;
    $("#tl-sheets").onclick = toolSheets;
    $("#tl-assign").onclick = toolAssign;
    // 🔔 التنبيهات و📅 التقويم و🗂️ مكتبة المدرسة
    try { paintNotifyCard(); } catch (e) { }
    try { paintMoreLib(); } catch (e) { }
    // بحث
    const res = $("#mo-res");
    $("#mo-search").oninput = (e) => {
      const q = e.target.value.trim();
      if (q.length < 2) { res.innerHTML = ""; return; }
      const hits = [];
      myClasses().forEach(c => activeStudents(c).forEach(({ s, i }) => { if (s.n.includes(q)) hits.push({ c, s, i }); }));
      res.innerHTML = hits.slice(0, 20).map(h => `<div class="stu" data-c="${h.c.id}" data-i="${h.i}"><span class="nm">${esc(h.s.n)}<small>${esc(h.c.name)}</small></span><span style="color:var(--gold)">›</span></div>`).join("") || '<div class="empty-note">لا نتائج</div>';
      res.querySelectorAll(".stu").forEach(row => row.onclick = () => studentCard(row.dataset.c, +row.dataset.i));
    };
    // نسخة احتياطية
    $("#bk-out").onclick = () => {
      const blob = new Blob([JSON.stringify({ v: 2, teacher: TE.id, recs: DB.recs, grades: DB.grades, comms: DB.comms })], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "نسخة سجل المتابعة - " + TE.name + ".json"; a.click();
    };
    $("#bk-in").onclick = () => $("#bk-file").click();
    /* الاستعادة تستبدل كل الرصد ولا تُراجَع: لا تُنفَّذ إلا بعد ملخّص صريح لما سيُفقد،
       ومع تحذير إضافي إن كان الملف لمعلم آخر (فيصير سجل زميله سجلَّك ويُرفع سحابياً باسمك). */
    $("#bk-file").onchange = (ev) => {
      const f = ev.target.files[0]; ev.target.value = ""; if (!f) return;
      const rd = new FileReader();
      const nDays = (o) => Object.keys(o || {}).reduce((a, cid) => a + Object.keys((o[cid]) || {}).length, 0);
      rd.onload = () => {
        let j = null;
        try { j = JSON.parse(rd.result); } catch (e) { j = null; }
        if (!j || !j.recs || typeof j.recs !== "object" || Array.isArray(j.recs)) { alert("ملف غير صالح"); return; }
        if (j.teacher && TE && j.teacher !== TE.id) {
          const who = (D.teachers.find(x => x.id === j.teacher) || {}).name || j.teacher;
          if (!confirm("⚠️ هذه النسخة تخصّ المعلم: " + who + "، لا حسابك.\n\nاستعادتها تجعل سجلك سجلَّه — بما فيه فصول لا تدرّسها — ويُرفع باسمك أنت.\n\nهل تريد المتابعة رغم ذلك؟")) return;
        }
        if (!confirm("سيُستبدل رصدك الحالي بالكامل ولا يمكن التراجع:\n\nالحالي: " + nDays(DB.recs) + " يوم رصد في " + Object.keys(DB.recs).length + " فصلاً\nالملف:  " + nDays(j.recs) + " يوم رصد في " + Object.keys(j.recs).length + " فصلاً\n\nهل تريد المتابعة؟")) return;
        const before = Object.keys(DB.recs).concat(Object.keys(DB.grades), Object.keys(DB.comms));
        DB.recs = j.recs || {}; DB.grades = (j.grades && typeof j.grades === "object") ? j.grades : {}; DB.comms = (j.comms && typeof j.comms === "object") ? j.comms : {};
        // كل فصل مسّته الاستعادة (في الملف أو في سجلك قبلها) يُعلَّم للرفع، لا فصول الملف وحدها
        [...new Set(before.concat(Object.keys(DB.recs), Object.keys(DB.grades), Object.keys(DB.comms)))].forEach(cid => { save("recs:" + cid); save("grades:" + cid); save("comms:" + cid); });
        alert("تمت الاستعادة بنجاح ✓"); renderToday();
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

  /* ═══ 🔔 بطاقة تنبيهات الحصص + 📅 تقويم الجوال ═══ */
  function paintNotifyCard() {
    const card = $("#nt-card"); if (!card || !TE) return;
    const N = window.SIJIL_NOTIFY, I = window.SIJIL_ICS, mount = $("#nt-mount"), opts = $("#nt-opts");
    if (mount) {
      if (N && typeof N.mount === "function") { try { N.mount(mount); } catch (e) { mount.innerHTML = ""; } }
      else mount.innerHTML = '<div class="empty-note">تنبيهات الحصص غير متاحة على هذا الجهاز</div>';
    }
    if (!opts) return;
    const lead = notifyLead(), snd = soundOn();
    let fp = "", changed = false;
    if (I && typeof I.fingerprint === "function") { try { fp = I.fingerprint(TE.id); } catch (e) { fp = ""; } }
    const old = lsGet(fpKeyOf());
    changed = !!(fp && old && old !== fp);
    opts.innerHTML = `
      ${changed ? '<div class="nt-warn">📅 تغيّر جدولك — حدّث تقويمك بإعادة إضافة الملف.</div>' : ""}
      <div class="nt-row"><label for="nt-lead">ينبّهني قبل الحصة بـ</label>
        <select id="nt-lead">${[5, 10, 15].map(v => `<option value="${v}"${v === lead ? " selected" : ""}>${minsAr(v)}</option>`).join("")}</select></div>
      <div class="nt-row"><label>صوت داخل التطبيق</label>
        <button class="btn-soft" id="nt-snd">${snd ? "🔊 مفعّل" : "🔇 متوقف"}</button></div>
      ${I && typeof I.download === "function" ? '<button class="btn-gold" id="nt-ics" style="width:100%;margin-top:10px">📅 أضف جدولي إلى تقويم جوالي</button>' : ""}
      <div class="empty-note" id="nt-cal-msg" style="padding:8px 4px 0">يُنزَّل ملف تقويم؛ افتحه فتُضاف حصصك مواعيدَ أسبوعية إلى نهاية الفصل، مع تنبيه قبل كل حصة.</div>`;
    const sel = $("#nt-lead");
    if (sel) sel.onchange = () => {
      lsSet(NLEAD_KEY, String(+sel.value || 5));
      nextKey = ""; try { paintNext(); } catch (e) { }
      try { const N2 = window.SIJIL_NOTIFY; if (N2 && typeof N2.refresh === "function") N2.refresh(); } catch (e) { }
      const m = $("#nt-cal-msg");
      if (m) m.textContent = "✔ سيصلك التنبيه قبل الحصة بـ " + minsArObl(notifyLead()) + " ما دام «سجلي» مفتوحاً؛ وإن كان مغلقاً فقد يصل قبلها بقليل.";
    };
    const sb = $("#nt-snd");
    if (sb) sb.onclick = () => { if (soundOn()) lsDel(NSND_KEY); else { lsSet(NSND_KEY, "1"); beep(); } paintNotifyCard(); };
    const ib = $("#nt-ics");
    if (ib) ib.onclick = () => {
      const m = $("#nt-cal-msg");
      try {
        const r = I.download(TE.id, { alarm: notifyLead() });
        /* البصمة تُختم لحظةَ التنزيل لا لحظةَ رسم البطاقة: تغيّرُ الأجراس أو الجدول بعد فتح
           «المزيد» كان يختم البصمة القديمة، فتبقى لافتة «تغيّر جدولك» معلّقة أبداً ولو نزّل
           المعلم الملف الجديد للتوّ. ولا تُختم البصمة ولا تُرفع اللافتة إن لم يُنزَّل ملفٌ
           أصلاً (فصل منتهٍ أو جدول فارغ) — كان الختم يقع في الحالتين فيضيع التنبيه. */
        let now = fp;
        if (I && typeof I.fingerprint === "function") { try { now = I.fingerprint(TE.id); } catch (e2) { } }
        if (r && r.downloaded && now) { fp = now; lsSet(fpKeyOf(), now); }
        /* نصّ الرسالة من js/ics.js وحده (message): يجمع صيغة العدد العربية الصحيحة، و«تغطّي
           N حصة أسبوعياً» حين يكون موعدٌ واحد لأكثر من حصة (BYDAY مزدوج)، وحالتَي الفصل
           المنتهي والمواعيد الملغاة. وnote للحصص التي لا وقت لها في جدول الأجراس. */
        const note = (r && r.skippedNote) ? " " + r.skippedNote : "";
        if (m) {
          m.textContent = ((r && r.message) || "لا حصص في جدولك لإضافتها إلى التقويم.") + note;
          m.style.color = note ? "var(--bad)" : "";
        }
        if (r && r.downloaded) { const w = card.querySelector(".nt-warn"); if (w) w.remove(); }
      } catch (e) { if (m) m.textContent = "تعذّر إنشاء ملف التقويم — أعد تحميل الصفحة ثم حاول مرة أخرى."; }
    };
  }
  // 🗂️ مكتبة المدرسة داخل «المزيد»: المدير يرفع ويحذف، والمعلم يقرأ (الأزرار مخفية بصنف ro في css/app.css)
  function paintMoreLib() {
    const F = FILES(), box = $("#more-lib-box"); if (!box) return;
    if (!F) { box.innerHTML = '<div class="empty-note">المرفقات غير متاحة الآن</div>'; return; }
    Promise.resolve(F.libraryCard(box, { scope: "school", title: "🗂️ مكتبة المدرسة", hint: "مستندات المدرسة لكل المعلمين: الجدول الرسمي، النماذج، التعاميم." }))
      .catch(() => { box.innerHTML = '<div class="empty-note">تعذّر تحميل مكتبة المدرسة — تحقق من الاتصال</div>'; });
  }

  /* ═══ أدوات المعلم (بديل الإكسل) ═══ */
  let curEdit = false;
  async function toolCurriculum() {
    const grades = [...new Set(myClasses().map(c => c.gc))].sort(), sc = subjCode(TE.subject);
    openSheet(`<h4>📚 مناهجي — ${esc(TE.subject)}</h4>
      <div style="display:flex;gap:8px;margin-bottom:8px"><button class="btn-soft" id="cur-edit">✏️ تعديل التوزيع</button><button class="btn-plain" style="flex:0 0 auto;padding:9px 14px" onclick="window._printSheet()">🖨️ طباعة</button></div>
      <div id="cur-body"><div class="empty-note">جارِ التحميل…</div></div>
      <div class="sheet-actions"><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, async (o) => {
      async function build() {
        let html = "";
        for (const g of grades) {
          const code = sc + g + TERM, rows = await loadCurr(code);
          if (!rows.length) continue;
          const idxRows = rows.map((r, idx) => ({ r, idx })).sort((a, b) => a.r.w - b.r.w);
          html += `<div style="font-weight:800;color:var(--navy);margin:10px 0 4px">الصف ${GNAME[g]}</div><div class="table-scroll"><table class="report-table"><tr><th>أ</th><th style="min-width:90px">الوحدة</th><th style="min-width:120px">الدرس</th><th>${curEdit ? "" : "الدرس الغني"}</th></tr>` +
            idxRows.map(({ r, idx }) => curEdit
              ? `<tr><td>${r.w}</td><td><input class="gr-in cur-in" style="width:88px" data-code="${code}" data-idx="${idx}" data-f="unit" value="${esc(r.unit || "")}"></td><td><input class="gr-in cur-in" style="width:120px" data-code="${code}" data-idx="${idx}" data-f="lesson" value="${esc(r.lesson || "")}"></td><td></td></tr>`
              : `<tr><td>${r.w}</td><td class="nm">${esc(r.unit || "")}</td><td class="nm">${esc(r.lesson || "")}</td><td style="white-space:nowrap">${String(r.lesson || "").includes("إجازة") ? "—" : `<button class="btn-soft au-btn" data-code="${code}" data-wk="${r.w}" data-name="${esc(r.lesson || "")}" style="padding:4px 8px">✏️ تأليف</button>`}</td></tr>`).join("") + `</table></div>`;
        }
        const b = o.querySelector("#cur-body"); if (!b) return;
        b.innerHTML = html || '<div class="empty-note">لا مناهج مسندة</div>';
        b.querySelectorAll(".au-btn").forEach(bt => bt.onclick = () => authorLesson(bt.dataset.code, +bt.dataset.wk, bt.dataset.name, build));
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
  /* أعمدة سجل الحصص من محرك أجراس المدرسة (وليست ح1..ح7 ثابتة): تظهر الأوقات والفسح،
     وتُضاف حصة مسندة رقمها خارج إعداد المدرسة بلا وقت بدل أن تختفي من الجدول وحده بينما يعدّها العنوان. */
  function toolSessions() {
    const rows = D.schedule.filter(r => r.t === TE.name);
    const B = BELL(), days = SDAYS();
    const cols = B.periodsOf().map(b => b.brk ? { brk: true, n: b.n || "الفسحة", tm: B.hm(b.from) + "–" + B.hm(b.to) } : { p: b.p, tm: B.periodTime(b.p) });
    const have = {}; cols.forEach(x => { if (!x.brk) have[x.p] = 1; });
    const ex = []; rows.forEach(r => { const p = Number(r.p) || 0; if (p > 0 && p <= 12 && !have[p] && ex.indexOf(p) < 0) ex.push(p); });
    ex.sort((a, b) => a - b).forEach(p => cols.push({ p, tm: "" }));
    let html = `<div class="table-scroll"><table class="report-table"><tr><th>اليوم</th>${cols.map(x => x.brk ? `<th>${esc(x.n)}<br><small>${esc(x.tm)}</small></th>` : `<th>ح${x.p}${x.tm ? `<br><small>${esc(x.tm)}</small>` : ""}</th>`).join("")}</tr>`;
    days.forEach(d => {
      html += `<tr><td class="nm">${esc(d)}</td>` + cols.map(x => {
        if (x.brk) return `<td style="color:var(--muted)">☕</td>`;
        const s = rows.find(y => y.d === d && +y.p === x.p), c = s ? classById(s.c) : null;
        return `<td>${c ? esc(c.name) : ""}</td>`;
      }).join("") + `</tr>`;
    });
    html += `</table></div>`;
    openSheet(`<h4>🗓️ سجل الحصص — ${rows.length} حصة أسبوعياً</h4><div class="rep-head"><div class="rt">جدول حصص ${esc(TE.name)}</div><div class="rs">${esc(META.school.name)} — ${esc(TE.subject)}</div></div>${html}<div class="sheet-actions"><button class="btn-plain" onclick="window._printSheet()">🖨️ طباعة</button><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`);
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
      const rows = classCalc(cid).filter(r => r.active);
      const rem = rows.filter(r => r.t.pts < 0 || r.t.st[1] > 1 || r.t.hwN > 0).sort((a, b) => a.t.pts - b.t.pts);
      const enr = rows.filter(r => r.t.pts >= 5 && r.t.st[1] === 0).sort((a, b) => b.t.pts - a.t.pts).slice(0, 8);
      const body = o.querySelector("#pl-body");
      body.innerHTML = `<div style="font-weight:800;color:var(--bad);margin:10px 0 6px">🩺 خطة علاجية (${rem.length})</div>
        ${rem.length ? rem.map(r => `<div class="comm-item"><b>${esc(r.s.n)}</b> — نقاط ${r.t.pts}${r.t.st[1] ? `، غياب ${r.t.st[1]}` : ""}${r.t.hwN ? `، واجبات ناقصة ${r.t.hwN}` : ""}<div class="meta">التوصية: ${planText(r.t)}</div></div>`).join("") : '<div class="empty-note" style="padding:12px">لا طلاب بحاجة لخطة علاجية 🎉</div>'}
        <div style="font-weight:800;color:var(--ok);margin:14px 0 6px">🌟 خطة إثرائية (${enr.length})</div>
        ${enr.length ? enr.map(r => `<div class="comm-item"><b>${esc(r.s.n)}</b> — نقاط ${r.t.pts}<div class="meta">التوصية: تكليفه بمهام قيادية وإثرائية (بحث / مشروع / مساعدة زملائه) لتعزيز تميّزه.</div></div>`).join("") : '<div class="empty-note" style="padding:12px">ابدأ الرصد لتظهر أسماء المتميزين</div>'}`;
    }
    openSheet(`<h4>🩺 الخطط العلاجية والإثرائية</h4><div class="class-chips" id="pl-chips">${cls.map((x, k) => `<button class="chip ${k === 0 ? "on" : ""}" data-c="${x.id}">${esc(x.name)}</button>`).join("")}</div><div id="pl-body"></div><div class="sheet-actions"><button class="btn-plain" onclick="window._printSheet()">🖨️ طباعة</button><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, (o) => {
      o.querySelectorAll("#pl-chips .chip").forEach(ch => ch.onclick = () => { cid = ch.dataset.c; o.querySelectorAll("#pl-chips .chip").forEach(x => x.classList.toggle("on", x === ch)); render(o); });
      render(o);
    });
  }
  /* ═══ حاسبة المهمة الأدائية: معايير قابلة للحفظ + اعتماد الدرجة لطالب ═══ */
  const CALC_DEFAULT = [{ n: "الأداء والإتقان", mx: 10 }, { n: "التعاون والمشاركة", mx: 5 }, { n: "الالتزام بالوقت", mx: 5 }];
  async function calcTemplate() {
    if (Array.isArray(DB.calcTpl) && DB.calcTpl.length) return DB.calcTpl;
    if (CLOUD && fdb && TE) {
      try { const d = await fdb.doc("prefs/" + TE.id).get(); const rows = d.exists && d.data().calc && d.data().calc.rows; if (Array.isArray(rows) && rows.length) { DB.calcTpl = rows; save(); return rows; } } catch (e) { }
    }
    return CALC_DEFAULT;
  }
  async function toolCalc() {
    const cls = myClasses();
    const tpl = await calcTemplate();
    let cid = (typeof regClass !== "undefined" && regClass && cls.find(c => c.id === regClass)) ? regClass : (cls.length ? cls[0].id : null);
    openSheet(`<h4>🧮 حاسبة درجة المهمة الأدائية</h4>
      <div style="font-size:13px;color:var(--muted);margin-bottom:8px">أدخل درجة كل معيار ودرجته العظمى، فيُحسب المجموع والنسبة والتقدير تلقائياً. احفظ معاييرك لتعود كما هي في كل مرة، واعتمد الدرجة لطالب فتظهر في الدرجات والتقارير ومستويات المدرسة.</div>
      <div id="calc-rows"></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0"><button class="btn-soft" id="calc-add">+ إضافة معيار</button><button class="btn-soft" id="calc-save-tpl">💾 حفظ المعايير</button><button class="btn-plain" id="calc-reset">↺ المعايير الافتراضية</button></div>
      <div class="ana-grid"><div class="ana"><div class="v" id="calc-tot">0</div><div class="l">المجموع</div></div><div class="ana"><div class="v" id="calc-pct">0%</div><div class="l">النسبة</div></div></div>
      <div style="text-align:center;margin-top:6px" id="calc-lvl"></div>
      ${cls.length ? `<div class="field" style="margin-top:12px"><label>اعتماد الدرجة لطالب</label>
        <div class="class-chips" id="calc-cls">${cls.map(c => `<button class="chip ${c.id === cid ? "on" : ""}" data-c="${c.id}">${esc(c.name)}</button>`).join("")}</div>
        <select class="search-box" id="calc-stu" style="margin:6px 0 0"></select>
        <select class="search-box" id="calc-col" style="margin:6px 0 0">${ASSESS.map(a => `<option value="${a.k}" ${a.k === "p1" ? "selected" : ""}>${esc(a.n)} (من ${a.max})</option>`).join("")}</select>
        <div class="empty-note" id="calc-preview" style="padding:6px 2px 0;text-align:right"></div>
        <button class="btn-primary" id="calc-apply" style="margin-top:8px;width:100%">✅ اعتماد الدرجة للطالب</button>
        <div class="empty-note" id="calc-msg" style="padding:6px 2px 0;text-align:right;min-height:18px"></div></div>` : ""}
      <div class="sheet-actions"><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, (o) => {
      const rowsBox = o.querySelector("#calc-rows");
      const rows = () => [...o.querySelectorAll("#calc-rows>div")].map(r => ({ n: r.querySelector(".cname").value.trim(), sc: +r.querySelector(".cscore").value || 0, mx: +r.querySelector(".cmax").value || 0 }));
      /* المعيار الذي تُرك حقل «من» فيه فارغاً ناقص: كان يدخل بدرجته كاملة في المجموع ولا يدخل في السقف،
         فتتجاوز النسبة 100% وتُحفظ درجة أكبر من الدرجة العظمى للعمود. الآن يُستبعد من الطرفين ويُنبَّه عليه. */
      function totals() {
        const all = rows(), rs = all.filter(r => r.mx > 0);
        const sum = rs.reduce((a, r) => a + Math.min(Math.max(0, r.sc), r.mx), 0), max = rs.reduce((a, r) => a + r.mx, 0);
        const skipped = all.filter(r => !(r.mx > 0) && (r.sc || r.n)).length;
        return { sum: Math.round(sum * 10) / 10, max, skipped, pct: max ? Math.min(100, Math.round(sum / max * 100)) : 0 };
      }
      function preview() {
        const pv = o.querySelector("#calc-preview"); if (!pv) return;
        const a = ASSESS.find(x => x.k === o.querySelector("#calc-col").value) || ASSESS[0], t = totals();
        const v = t.max ? Math.min(a.max, Math.round(t.sum / t.max * a.max * 10) / 10) : 0;
        const st = o.querySelector("#calc-stu"); const nm = st && st.selectedOptions[0] ? st.selectedOptions[0].textContent : "";
        const curV = st ? effGrades(cid, +st.value)[a.k] : null;
        pv.textContent = (t.max ? `ستُسجَّل ${v} من ${a.max} في «${a.n}» ${nm ? "للطالب " + nm : ""}` : "أدخل الدرجات العظمى أولاً") + (curV != null ? ` · الدرجة الحالية المسجّلة: ${curV}` : " · لا درجة مسجّلة بعد") + (t.skipped ? ` · ⚠️ ${t.skipped} معياراً بلا حقل «من» لم يُحتسب` : "");
      }
      function calc() {
        const t = totals(), lv = levelOf(t.pct);
        o.querySelector("#calc-tot").textContent = t.sum + (t.max ? " / " + t.max : "");
        o.querySelector("#calc-pct").textContent = t.pct + "%";
        o.querySelector("#calc-lvl").innerHTML = t.max ? `<span class="lvl lvl${lv.i}">${lv.t}</span>` : "";
        preview();
      }
      function addRow(name, mx) {
        rowsBox.insertAdjacentHTML("beforeend", `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px"><input class="cname search-box" style="flex:2;margin:0" placeholder="اسم المعيار" value="${esc(name || "")}"><input class="cscore search-box" style="flex:1;margin:0" inputmode="decimal" placeholder="الدرجة"><span style="color:var(--muted)">/</span><input class="cmax search-box" style="flex:1;margin:0" inputmode="decimal" placeholder="من" value="${mx ? esc(mx) : ""}"><button class="btn-plain cdel" title="حذف المعيار" style="padding:6px 10px;color:var(--bad)">✕</button></div>`);
        const r = rowsBox.lastElementChild;
        r.querySelectorAll(".cscore,.cmax,.cname").forEach(inp => inp.oninput = calc);
        r.querySelector(".cdel").onclick = () => { r.remove(); calc(); };
      }
      tpl.forEach(t => addRow(t.n, t.mx));
      o.querySelector("#calc-add").onclick = () => { addRow("", ""); rowsBox.lastElementChild.querySelector(".cname").focus(); };
      o.querySelector("#calc-reset").onclick = () => { rowsBox.innerHTML = ""; CALC_DEFAULT.forEach(t => addRow(t.n, t.mx)); calc(); };
      o.querySelector("#calc-save-tpl").onclick = async () => {
        const b = o.querySelector("#calc-save-tpl");
        const list = rows().filter(r => r.n).slice(0, 20).map(r => ({ n: r.n.slice(0, 60), mx: r.mx }));
        if (!list.length) { b.textContent = "أضف معياراً واحداً على الأقل"; return; }
        DB.calcTpl = list; save(); b.textContent = "✔ حُفظت";
        if (CLOUD && fdb && TE) { try { await fdb.doc("prefs/" + TE.id).set({ calc: { rows: list }, tn: TE.name, ts: Date.now() }); b.textContent = "✔ حُفظت وستظهر على كل أجهزتك"; } catch (e) { b.textContent = "✔ حُفظت على هذا الجهاز"; } }
        setTimeout(() => { b.textContent = "💾 حفظ المعايير"; }, 2500);
      };
      // اعتماد الدرجة لطالب
      const fillStudents = () => {
        const st = o.querySelector("#calc-stu"); if (!st) return;
        const c = classById(cid); st.innerHTML = activeStudents(c).map(({ s, i }) => `<option value="${i}">${esc(s.n)}</option>`).join("");
        preview();
      };
      o.querySelectorAll("#calc-cls .chip").forEach(ch => ch.onclick = () => { cid = ch.dataset.c; o.querySelectorAll("#calc-cls .chip").forEach(x => x.classList.toggle("on", x === ch)); fillStudents(); });
      const colSel = o.querySelector("#calc-col"); if (colSel) colSel.onchange = preview;
      const stuSel = o.querySelector("#calc-stu"); if (stuSel) stuSel.onchange = preview;
      const ap = o.querySelector("#calc-apply");
      if (ap) ap.onclick = () => {
        const t = totals(); const msg = o.querySelector("#calc-msg");
        if (!t.max) { msg.textContent = "أدخل الدرجات العظمى للمعايير أولاً"; return; }
        const a = ASSESS.find(x => x.k === o.querySelector("#calc-col").value) || ASSESS[0];
        const si = +o.querySelector("#calc-stu").value; const c = classById(cid); const stu = c && c.students && c.students[si];
        if (!stu) { msg.textContent = "اختر الطالب"; return; }
        const v = Math.min(a.max, Math.round(t.sum / t.max * a.max * 10) / 10);
        DB.grades[cid] = DB.grades[cid] || {}; DB.grades[cid][si] = DB.grades[cid][si] || {};
        DB.grades[cid][si][a.k] = v; save("grades:" + cid);
        msg.innerHTML = `✔ سُجِّلت <b>${v} من ${a.max}</b> في «${esc(a.n)}» للطالب ${esc(stu.n)} — انعكست فوراً في الدرجات والتقارير ومستوياته.`;
        preview();
        // انعكاس لحظي: إعادة رسم التبويب الظاهر خلف النافذة
        try { const tb = document.querySelector("#tabs button.on"); const nm = tb && tb.dataset.tab; if (nm === "grades") renderGrades(); else if (nm === "reg") renderReg(); else if (nm === "today") renderToday(); else if (nm === "rep") renderRep(); } catch (e) { }
      };
      fillStudents(); calc();
    });
  }
  async function toolSheets() {
    const grades = [...new Set(myClasses().map(c => c.gc))].sort(), sc = subjCode(TE.subject), wk = curWeek();
    openSheet(`<h4>📝 بنك أوراق العمل</h4><div style="font-size:13px;color:var(--muted);margin-bottom:8px">لكل درس: أرسل ورقة تفاعلية للطلاب بالواتس تُصحَّح آلياً، أو اطبعها ورقياً.</div><div id="sh-body"><div class="empty-note">جارِ التحميل…</div></div><div class="sheet-actions"><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, async (o) => {
      let html = "";
      for (const g of grades) {
        const code = sc + g + TERM, rows = (await loadCurr(code)).filter(r => r.w >= wk - 1 && r.w <= wk + 2 && r.lesson && !String(r.lesson).includes("إجازة"));
        if (!rows.length) continue;
        html += `<div style="font-weight:800;color:var(--navy);margin:8px 0 4px">الصف ${GNAME[g]}</div>`;
        rows.sort((a, b) => a.w - b.w).forEach(r => {
          html += `<div class="comm-item"><b>أسبوع ${r.w}: ${esc(r.lesson)}</b><div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><button class="btn-gold" data-send="${esc(r.lesson)}" data-code="${code}" data-wk="${r.w}">📤 إرسال للطلاب</button><button class="btn-soft" data-ws="${esc(r.lesson)}" data-code="${code}" data-wk="${r.w}">🖨️ طباعة</button>${FILES() ? `<button class="btn-soft" data-up="${esc(r.lesson)}" data-code="${code}" data-wk="${r.w}">⬆️ ورقة من جهازي</button>` : ""}</div></div>`;
        });
      }
      const body = o.querySelector("#sh-body"); if (!body) return;
      body.innerHTML = html || '<div class="empty-note">لا دروس متاحة حول هذا الأسبوع</div>';
      body.querySelectorAll("[data-ws]").forEach(b => b.onclick = async () => printWorksheet(b.dataset.ws, await lessonData(b.dataset.code, +b.dataset.wk)));
      body.querySelectorAll("[data-up]").forEach(b => b.onclick = () => filesSheet("⬆️ ورقة من جهازي — " + b.dataset.up, "lesson", { code: b.dataset.code, wk: +b.dataset.wk },
        "ورقة عمل جاهزة من جهازك (صورة أو PDF) تُحفظ مع هذا الدرس وتظهر في «📎 مرفقات الدرس» داخل الحصة."));
      body.querySelectorAll("[data-send]").forEach(b => b.onclick = async () => {
        // sendSheet تفتح نافذتها بنفسها (openSheet يستبدل المحتوى)، وتخرج بتنبيه في الوضع
        // التجريبي أو حين لا أسئلة — فكان closeSheet المسبق يُفقد المعلم قائمته بلا مقابل
        const qs = await lessonQuestions(b.dataset.code, +b.dataset.wk);
        sendSheet(b.dataset.code, +b.dataset.wk, b.dataset.send, qs);
      });
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
      <div class="sig"><span>المعلم: ${esc(TE.name)}</span><span>الدرجة: ......</span></div>`, { cls: "ws" });
      return;
    }
    const L = ["أ", "ب", "ج", "د"];
    const qHtml = qs.map((q, n) => {
      if (q.t === "fill") return `<p><b>${n + 1}.</b> ${esc(q.q)}</p>`;
      return `<p><b>${n + 1}.</b> ${esc(q.q)}</p><div class="ops">${(q.opts || []).map((o, k) => o ? `<span class="op">☐ ${q.t === "tf" ? "" : L[k] + ") "}${esc(o)}</span>` : "").filter(Boolean).join("")}</div>`;
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
      <div class="key">مفتاح الإجابة (للمعلم): ${key}</div>`, { cls: "ws" });
  }

  /* ═══════════ وضع الحصة الحية (العرض) ═══════════ */
  const behIndex = (sub, positive) => {
    let k = BEH.findIndex(b => !b.off && b.name.includes(sub));
    if (k < 0) k = BEH.findIndex(b => !b.off && (positive ? (+b.pts > 0) : (+b.pts < 0)));
    return k;
  };
  let liveCid = null, livePrevTop = null, liveDate = null, liveLesson = "";
  let liveTurns = { done: new Set(), cur: null };   // من شارك في هذه الحصة (لضمان مشاركة الجميع)
  /* نافذة اختيار الفصل: الفصل الجاري (أو القادم) في الأعلى بحجم مضاعف ووقته تحته، وبقية
     الفصول شبكةً كما كانت — فلا يبحث المعلم بصرياً في ثمانِ شرائح متشابهة وسط الحصة. */
  function pickClassThen(cb, list, title) {
    const cls = (list && list.length) ? list : myClasses();
    if (!cls.length) { alert("لا فصول مسندة"); return; }
    if (cls.length === 1) { cb(cls[0].id); return; }
    const S = currentOrNextClass(), B = BELL();
    const now = cls.find(c => c.id === S.cid) || null;
    const nx = !now && S.next ? (cls.find(c => c.id === S.next.cid) || null) : null;
    const lead = now || nx;
    const rest = lead ? cls.filter(c => c.id !== lead.id) : cls;
    const head = lead ? `<button class="picknow" data-c="${esc(lead.id)}"><b>${esc(lead.name)}</b><small>${now ? `🔔 الآن — الحصة ${esc(B.ord(S.p))} (${esc(B.periodTime(S.p, S.day))})` : `⏰ القادمة — ح${S.next.p} ${esc(B.hm(S.next.from))}`}</small></button>` : "";
    openSheet(`<h4>${esc(title || "اختر الفصل")}</h4>${head}${rest.length ? `<div class="stategrid">${rest.map(c => `<button style="background:var(--navy)" data-c="${c.id}">${esc(c.name)}</button>`).join("")}</div>` : ""}`,
      (o) => o.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { closeSheet(); cb(b.dataset.c); }));
  }
  function liveSession(cid, initialView, date) {
    stopBell();
    // التاريخ يأتي من ورقة التحضير حين تُفتح الحصة منها (استدراك يوم فائت)، وإلا فاليوم
    liveCid = cid; liveDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? String(date) : todayISO(); liveLesson = "";
    livePrevTop = null; liveTurns = { done: new Set(), cur: null };
    const c = classById(cid), pastDay = liveDate !== todayISO();
    $("#view-app").classList.add("hidden");
    const V = $("#view-live"); V.classList.remove("hidden");
    // V.innerHTML يُعاد بناؤه لكن الأصناف تبقى: بلا هذا السطر تبدأ كل حصة تالية بلا أدوات ولا لوحة، وزراهما يقولان «إخفاء»
    V.classList.remove("board-hidden", "tools-hidden");
    timerReset();
    V.innerHTML = `
      <div class="live-top">
        <button class="live-btn" id="live-exit">✕ إنهاء</button>
        <div class="live-title">🎬 ${esc(c.name)}${pastDay ? `<span class="live-day">📅 رصد يوم ${esc(liveDate)}</span>` : ""} <small id="live-sub"></small></div>
        <div style="display:flex;gap:6px">
          <button class="live-btn" id="live-att" title="تعديل الحضور — لمن دخل متأخراً بعد ربع ساعة">👥<span class="lbl"> الحضور</span></button>
          <button class="live-btn live-tchip" id="live-tchip" hidden title="مؤقّت النشاط — اضغط للعودة إليه">⏱ 00:00</button>
          <button class="live-btn" id="live-tools-t" title="إخفاء/إظهار الأدوات">🎛️ <span class="lbl">إخفاء الأدوات</span><span class="sh">إخفاء</span></button>
          <button class="live-btn" id="live-board-t" title="إخفاء/إظهار لوحة الشرف">🏆 <span class="lbl">إخفاء اللوحة</span><span class="sh">إخفاء</span></button>
          <button class="live-btn" id="live-fs"><span class="ic">⛶</span><span class="lbl"> ملء الشاشة</span></button>
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
            <button data-v="files">📎 مرفقات</button>
          </div>
          <div class="live-main" id="live-main"></div>
          <!-- إطار يوتيوب يعيش هنا ولا يُهدم عند تبديل المحطة، فيُكمل من موضعه عند العودة -->
          <div class="live-main" id="yt-keep" style="display:none"></div>
        </div>
        <div class="live-board" id="live-board"></div>
      </div>`;
    $("#live-exit").onclick = () => endLiveSession(V);
    $("#live-fs").onclick = () => {
      const d = document, el = V;
      const isFS = d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement;
      try {
        if (isFS) { (d.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen).call(d); }
        else { const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen; const p = req && req.call(el); if (p && p.catch) p.catch(() => { try { (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement); } catch (e) { } }); }
      } catch (e) { try { (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement); } catch (e2) { } }
      setTimeout(() => { const on = document.fullscreenElement || document.webkitFullscreenElement; const b = $("#live-fs"); if (b) b.innerHTML = on ? `<span class="ic">⛶</span><span class="lbl"> إنهاء الملء</span>` : `<span class="ic">⛶</span><span class="lbl"> ملء الشاشة</span>`; }, 350);
    };
    // التسمية تُشتق من الحالة الفعلية دائماً (لا من نصّ ثابت) فلا ينقلب معنى الزر
    const togLbl = (id, ic, h, what) => { const b = $(id); if (!b) return; b.classList.toggle("off", h); b.innerHTML = `${ic} <span class="lbl">${h ? "إظهار" : "إخفاء"} ${what}</span><span class="sh">${h ? "إظهار" : "إخفاء"}</span>`; };
    $("#live-board-t").onclick = () => togLbl("#live-board-t", "🏆", V.classList.toggle("board-hidden"), "اللوحة");
    $("#live-tools-t").onclick = () => togLbl("#live-tools-t", "🎛️", V.classList.toggle("tools-hidden"), "الأدوات");
    // 👥 في رأس الحصة: يفتح شاشة الحضور السريعة نفسها لمن دخل بعد ربع ساعة، ثم يعود إلى محطته
    const attB = $("#live-att"); if (attB) attB.onclick = () => attSheet();
    const tchip = $("#live-tchip"); if (tchip) tchip.onclick = () => { const b = V.querySelector('.live-tools button[data-v="timer"]'); if (b) b.click(); };
    V.querySelectorAll(".live-tools button").forEach(b => b.onclick = () => {
      V.querySelectorAll(".live-tools button").forEach(x => x.classList.toggle("on", x === b));
      liveView(b.dataset.v);
    });
    // وقت الحصة الجارية في عنوان الحصة الحية (من جدول أجراس المدرسة)
    /* الوقت في العنوان يتبع حصةَ هذا الفصل في جدول اليوم، لا الحصةَ الجارية في جرس المدرسة:
       زر «افتح الحصة القادمة» في خلاصة الحصة يفتح فصل ح3 وأنت ما زلت داخل ح2،
       فكان العنوان يقول «الحصة الثانية» على فصلٍ حصته الثالثة. */
    const LB0 = BELL(), S0 = pastDay ? null : currentOrNextClass();
    const own = S0 ? ((S0.st === "now" && S0.cid === cid) ? S0.p : (((S0.rows || []).filter(r => r.cid === cid && r.from != null)[0] || {}).p || 0)) : 0;
    const lp = own || LB0.periodNow(), lbr = lp ? null : LB0.breakNow();
    const when = lp ? `· الحصة ${LB0.ord(lp)} (${LB0.periodTime(lp)}) ` : (lbr ? `· ${lbr.n} (تنتهي ${lbr.ends}) ` : "");
    const sub0 = $("#live-sub"); if (sub0) sub0.textContent = when.trim();
    (async () => {
      const sc = subjCode(TE.subject), wk = curWeek();
      let les = "";
      if (sc) { const rows = (await loadCurr(sc + c.gc + TERM)).filter(r => r.w === wk); const m = rows.find(r => r.lesson && !String(r.lesson).includes("تابع")) || rows[0]; les = m ? m.lesson : ""; }
      liveLesson = les || "";   // يُقرأ في خلاصة الحصة عند الإنهاء («الدرس: كذا»)
      const sub = $("#live-sub"); if (sub) sub.textContent = when + "· الأسبوع " + wk + (les ? " · " + les : "");
    })();
    const startView = initialView || "roster";
    const tb = V.querySelector('.live-tools button[data-v="' + startView + '"]');
    if (tb) { V.querySelectorAll(".live-tools button").forEach(x => x.classList.toggle("on", x === tb)); }
    liveView(startView); drawLiveBoard(true);
    /* شاشة الحضور السريعة: مرة واحدة عند فتح حصة لفصل لم يُرصد حضوره في هذا اليوم.
       بعد الرسم لا قبله، حتى تُبنى فوق حصة ظاهرة لا فوق شاشة فارغة. */
    setTimeout(attAsk, 60);
  }
  let liveMainView = "roster", liveViewSeq = 0;
  /* محطات الدرس والقصة والألعاب تنتظر ملفات الدرس من الشبكة ثم تكتب في #live-main.
     على شبكة المدرسة البطيئة قد يكون المعلم قد انتقل إلى «الطلاب» قبل وصول الملف، فتخطف المحطة المتأخرة
     الشاشةَ بينما يُبرز شريط الأدوات محطةً أخرى. liveFresh(seq) يوقف كل كتابة متأخرة. */
  const liveFresh = (seq) => seq === liveViewSeq && !!$("#live-main");
  /* ── يوتيوب: إطار واحد يعيش في #yt-keep طوال الحصة ──
     تبديل المحطة يُخفيه ويوقفه مؤقتاً (postMessage) بدل هدمه، فيُكمل من الثانية نفسها عند العودة.
     إعادة بنائه لا تقع إلا عند تغيير الرابط أو إنهاء الحصة. */
  let ytUrlNow = "";
  function ytCmd(func) {
    try {
      const fr = $("#yt-keep iframe");
      if (fr && fr.contentWindow) fr.contentWindow.postMessage(JSON.stringify({ event: "command", func: func, args: [] }), "*");
    } catch (e) { }
  }
  function ytHide() { const k = $("#yt-keep"); if (!k) return; if (k.style.display !== "none") ytCmd("pauseVideo"); k.style.display = "none"; const lm = $("#live-main"); if (lm) lm.style.display = ""; }
  function ytDrop() { ytUrlNow = ""; const k = $("#yt-keep"); if (k) { k.innerHTML = ""; k.style.display = "none"; } const lm = $("#live-main"); if (lm) lm.style.display = ""; }
  async function liveView(v) {
    liveMainView = v;
    const seq = ++liveViewSeq;
    stopStory(); stopGame(); stopWheel();   // المؤقّت لا يُوقَف هنا: نشاط الطلاب يستمر بينما يعرض المعلم قائمةً أو سؤالاً
    if (v !== "yt") ytHide();
    const box = $("#live-main"); if (!box) return;
    const c = classById(liveCid), sc = subjCode(TE.subject), wk = curWeek(), code = sc + c.gc + TERM;
    if (v === "roster") { drawLiveRoster(); return; }
    if (v === "lesson") {
      box.innerHTML = `<div class="empty-note" style="color:#c9d5e3">جارِ تحميل الدرس…</div>`;
      const rows = (await loadCurr(code)).filter(r => r.w === wk);
      if (!liveFresh(seq)) return;
      const m = rows.find(r => r.lesson && !String(r.lesson).includes("تابع")) || rows[0];
      if (!sc || !m || String(m.lesson).includes("إجازة")) { box.innerHTML = `<div class="empty-note" style="color:#c9d5e3">لا درس متاح لهذا الأسبوع</div>`; return; }
      const data = await lessonData(code, wk);
      if (!liveFresh(seq)) return;
      if (data) renderRichLesson(box, data);
      else box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">▶️ ${esc(m.lesson)}</span></div><div class="rl-scroll"><div class="rl-wrap"><div class="rl-title">${esc(m.lesson)}</div><div style="color:#c9d5e3;text-align:center;margin-top:20px">درس هذا الأسبوع من وحدة «${esc(m.unit || "")}».<br>الدرس التفاعلي الغني لهذا الدرس قيد الإعداد — استخدم «سؤال» و«ورقة تفاعلية» و«العجلة» لتفعيل الحصة.<br><br><button class="btn-gold" id="rl-author" style="font-size:16px">✏️ ألّف هذا الدرس الآن (يعمل عليه كل شيء فوراً)</button></div></div></div></div>`;
      const ab = box.querySelector("#rl-author"); if (ab) ab.onclick = () => authorLesson(code, wk, m.lesson, () => liveView("lesson"));
      try { lessonFilesBar(box, code, wk); } catch (e) { }
      return;
    }
    if (v === "yt") { stageYouTube(box, code, wk, c, seq); return; }
    if (v === "files") { stageFiles(box, code, wk, c, seq); return; }
    if (v === "story") { stageStory(box, code, wk, seq); return; }
    if (v === "wheel") { stageWheel(box, c); return; }
    if (v === "quiz") { stageQuiz(box, code, wk, seq); return; }
    if (v === "iws") { stageWorksheet(box, code, wk, seq); return; }
    if (v === "timer") { stageTimer(box); return; }
    if (v === "games") { stageGames(box, code, wk, c, seq); return; }
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
    box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">▶️ ${esc(d.title || "")}</span><span style="color:#c9d5e3;font-size:13px;margin-inline-start:auto">${esc(d.unit || "")}</span><button class="live-btn" id="rl-edit" title="تعديل الدرس">✏️</button></div>
      <div class="rl-scroll"><div class="rl-wrap">
        <div class="rl-title">${esc(d.title || "")}</div>
        ${(d.story || []).some(s => s.img) ? `<img class="rl-hero" src="${(d.story || []).find(s => s.img).img}" alt="">` : ""}
        ${d.objectives && d.objectives.length ? `<div class="rl-obj"><div class="rl-obj-h">🎯 أهداف الدرس</div><ul>${d.objectives.map(o => `<li>${esc(o)}</li>`).join("")}</ul></div>` : ""}
        ${d.intro ? `<div class="rl-intro">${esc(d.intro)}</div>` : ""}
        ${secs}${vocab}${checks}
        ${d.activity ? `<div class="rl-sec rl-act"><div class="rl-h"><span class="rl-n">✏️</span>نشاط تطبيقي</div><div class="rl-body">${esc(d.activity)}</div></div>` : ""}
        ${d.summary ? `<div class="rl-summary">🧾 ${esc(d.summary)}</div>` : ""}
      </div></div></div>`;
    const eb = box.querySelector("#rl-edit"); if (eb) eb.onclick = () => { const c = classById(liveCid); authorLesson(subjCode(TE.subject) + c.gc + TERM, curWeek(), d.title, () => liveView("lesson")); };
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
    const api = "&enablejsapi=1&playsinline=1";   // للتحكم بالإيقاف المؤقت عبر postMessage عند مغادرة المحطة
    if (vid && list) return "https://www.youtube.com/embed/" + vid + "?rel=0&modestbranding=1&list=" + list + api;
    if (vid) return "https://www.youtube.com/embed/" + vid + "?rel=0&modestbranding=1" + api;
    if (list) return "https://www.youtube.com/embed/videoseries?list=" + list + api;
    return "";
  }
  async function stageYouTube(box, code, wk, c, seq) {
    const key = code + "w" + wk;
    const d = await lessonData(code, wk);
    if (!liveFresh(seq)) return;
    let les = d && d.title ? d.title : "";
    if (!les) { try { const rows = (await loadCurr(code)).filter(r => r.w === wk); const m = rows.find(x => x.lesson && !String(x.lesson).includes("تابع")) || rows[0]; les = m ? m.lesson : ""; } catch (e) { } }
    // رابط محفوظ سابقاً لهذا الدرس (سحابي مشترك، أو محلي)
    let saved = "";
    if (d && d.yt) saved = Array.isArray(d.yt) ? d.yt[0] : d.yt;
    if (!saved) { try { if (CLOUD && fdb) { const s = await fdb.doc("lessonyt/" + key).get(); if (s.exists) saved = (s.data() || {}).url || ""; } else { saved = localStorage.getItem("yt:" + key) || ""; } } catch (e) { } }
    if (!liveFresh(seq)) return;
    const q = encodeURIComponent((les ? les + " " : "") + TE.subject + " " + GNAME[c.gc] + " ابتدائي شرح");
    const frame = (src) => `<iframe id="yt-frame" src="${src}" allow="autoplay; fullscreen" allowfullscreen style="flex:1;width:100%;border:0"></iframe>`;
    const placeholder = `<div id="yt-frame" style="flex:1;display:flex;align-items:center;justify-content:center;color:#c9d5e3;text-align:center;padding:20px">اضغط «🔎 بحث» لإيجاد شرح «${esc(les)}» في يوتيوب، ثم الصق رابط الفيديو هنا — وسيُحفظ للدرس ويظهر تلقائياً في كل مرة.</div>`;
    const src0 = saved ? ytEmbedSrc(saved) : "";
    const keep = $("#yt-keep");
    // عودة إلى المحطة والإطار قائم بالرابط نفسه: أظهره وأكمل من موضعه بلا إعادة بناء
    if (keep && ytUrlNow && ytUrlNow === (saved || "") && keep.querySelector("iframe")) {
      box.style.display = "none"; keep.style.display = ""; ytCmd("playVideo"); return;
    }
    const host = keep || box;
    if (keep) { box.style.display = "none"; keep.style.display = ""; }
    ytUrlNow = saved || "";
    host.innerHTML = `<div class="live-stage">
      <div class="stage-bar">
        <span style="color:#fff;font-weight:800">📺 ${esc(les || "فيديو الدرس")}</span>
        <input id="yt-url" placeholder="الصق رابط فيديو أو قائمة…" style="margin-inline-start:auto" value="${esc(saved || "")}">
        <button class="live-btn" id="yt-go">عرض</button>
        <a class="live-btn" style="text-decoration:none" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">🔎 بحث</a>
      </div>
      ${src0 ? frame(src0) : placeholder}
    </div>`;
    const show = () => {
      const url = host.querySelector("#yt-url").value.trim();
      const src = ytEmbedSrc(url);
      const fr = host.querySelector("#yt-frame");
      if (!src) { if (fr) fr.textContent = "رابط غير صحيح — انسخ رابط الفيديو من يوتيوب"; return; }
      if (fr) fr.outerHTML = frame(src);
      ytUrlNow = url;
      // احفظ الرابط للدرس (يظهر تلقائياً لك ولزملائك لاحقاً)
      try { localStorage.setItem("yt:" + key, url); } catch (e) { }
      try { if (CLOUD && fdb) fdb.doc("lessonyt/" + key).set({ url: url, tn: TE.name, ts: Date.now() }, { merge: true }); } catch (e) { }
    };
    host.querySelector("#yt-go").onclick = show;
    host.querySelector("#yt-url").addEventListener("keydown", (e) => { if (e.key === "Enter") show(); });
  }
  /* ═══ 📎 محطة المرفقات: المرفق ملء المسرح، وفوقه سبورة شفافة ═══
     المعلم يعرض ورقة أو صورة من جهازه ويكتب عليها أمام الفصل: قلم بأربعة ألوان وثلاثة سماكات،
     وتظليل، وممحاة، ومربع نص يُكتب في أي موضع، وتراجع ومسح، وحفظ الصورة المشروحة في مرفقات الدرس.
     الإحداثيات محفوظة كنِسَب (0..1) فلا يفسد الرسم عند تدوير الجوال أو ملء الشاشة. */
  let anState = null;
  async function stageFiles(box, code, wk, c, seq) {
    const F = (typeof FILES === "function") ? FILES() : (window.SIJIL_FILES || null);
    if (!F) { box.innerHTML = `<div class="empty-note" style="color:#c9d5e3">المرفقات غير متاحة في هذه النسخة</div>`; return; }
    let scope = (anState && anState.scope) || "lesson";
    async function paint() {
      box.innerHTML = `<div class="live-stage">
        <div class="stage-bar"><span style="color:#fff;font-weight:800">📎 مرفقات الدرس</span>
          <span class="gm-hud" style="margin-inline-start:auto">اضغط المرفق ليُعرض ملء الشاشة وتكتب عليه</span></div>
        <div class="gm-body"><div class="gm-pickrow">
          <button class="live-btn fl-sc${scope === "lesson" ? " on" : ""}" data-s="lesson">📘 مرفقات الدرس</button>
          <button class="live-btn fl-sc${scope === "school" ? " on" : ""}" data-s="school">🗂️ مكتبة المدرسة</button>
          <button class="live-btn" id="fl-add">＋ إضافة مرفق</button></div>
        <div id="fl-list" class="fl-grid"><div class="empty-note" style="color:#c9d5e3">جارِ التحميل…</div></div></div></div>`;
      box.querySelectorAll(".fl-sc").forEach(b => b.onclick = () => { scope = b.dataset.s; paint(); });
      const add = box.querySelector("#fl-add");
      if (add) add.onclick = async () => { try { await F.attach({ scope: scope, ref: scope === "lesson" ? { code, wk } : {}, title: scope === "lesson" ? "مرفقات الدرس" : "مكتبة المدرسة" }); } catch (e) { } paint(); };
      let arr = [];
      try { arr = await F.list(scope, scope === "lesson" ? { code, wk } : {}); } catch (e) { arr = []; }
      if (!liveFresh(seq)) return;
      const list = box.querySelector("#fl-list"); if (!list) return;
      list.innerHTML = arr.length ? arr.map(f => `<button class="fl-card" data-id="${esc(f.id)}" data-t="${esc(f.t || "")}" data-n="${esc(f.n || "")}">
          <span class="fl-ic">${/^image\//.test(f.t || "") ? "🖼️" : (f.t === "application/pdf" ? "📄" : "🎵")}</span>
          <b>${esc(f.n || "ملف")}</b><small>${/^image\//.test(f.t || "") ? "اضغط للعرض والكتابة عليه" : "اضغط للعرض"}</small>
          <i class="fl-del" data-del="${esc(f.id)}" title="حذف">🗑</i></button>`).join("")
        : `<div class="empty-note" style="color:#c9d5e3">لا مرفقات بعد — أضف صورة الورقة أو السبورة من جهازك، ثم اعرضها هنا واكتب عليها أمام الفصل.</div>`;
      list.querySelectorAll(".fl-card").forEach(b => b.onclick = () => openAnnot(b.dataset.id, b.dataset.t, b.dataset.n));
      list.querySelectorAll(".fl-del").forEach(b => b.onclick = async (ev) => {
        ev.stopPropagation();
        try { if (await F.remove(b.dataset.del)) paint(); } catch (e) { }
      });
    }
    // أي حذف أو إضافة من أي شاشة يُحدِّث هذه القائمة فوراً
    const onFilesChg = () => { if (box.querySelector("#fl-list")) paint(); else window.removeEventListener("sijil:files", onFilesChg); };
    window.addEventListener("sijil:files", onFilesChg);
    // ── عارض المرفق مع السبورة ──
    async function openAnnot(id, type, name) {
      const isImg = /^image\//.test(type || "");
      box.innerHTML = `<div class="live-stage an-stage">
        <div class="stage-bar an-bar">
          <button class="live-btn" id="an-back">← المرفقات</button>
          <span style="color:#fff;font-weight:800;max-width:34vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name || "مرفق")}</span>
          ${isImg ? `<span class="an-tools">
            <button class="an-t on" data-k="pen" title="قلم">✏️</button>
            <button class="an-t" data-k="mark" title="تظليل">🖍️</button>
            <button class="an-t" data-k="text" title="مربع نص">🔤</button>
            <button class="an-t" data-k="erase" title="ممحاة">🧽</button>
            <span class="an-sep"></span>
            ${["#ff4d4d", "#ffd447", "#2ee06a", "#4db2ff", "#ffffff"].map((cl, i) => `<button class="an-c${i === 0 ? " on" : ""}" data-c="${cl}" style="background:${cl}"></button>`).join("")}
            <span class="an-sep"></span>
            ${[3, 6, 12].map((w2, i) => `<button class="an-w${i === 1 ? " on" : ""}" data-w="${w2}"><i style="width:${w2 + 2}px;height:${w2 + 2}px"></i></button>`).join("")}
            <span class="an-sep"></span>
            <button class="live-btn" id="an-undo">↩︎ تراجع</button>
            <button class="live-btn" id="an-clear">🗑 مسح</button>
            <button class="live-btn" id="an-save">💾 احفظ</button>
          </span>` : ""}
        </div>
        <div class="an-wrap" id="an-wrap">${isImg ? `<canvas id="an-c"></canvas>` : `<div class="empty-note" style="color:#c9d5e3">جارِ فتح الملف…</div>`}</div></div>`;
      box.querySelector("#an-back").onclick = () => paint();
      if (!isImg) { try { await F.open(id); } catch (e) { } const w = box.querySelector("#an-wrap"); if (w) w.innerHTML = `<div class="empty-note" style="color:#c9d5e3">فُتح الملف في نافذة جديدة. الكتابة والتظليل متاحان على الصور — صوّر الورقة وأرفقها صورةً لتكتب عليها هنا.</div>`; return; }
      let blob = null;
      try { const r = await F.blobOf(id); blob = r && r.blob; } catch (e) { }
      if (!liveFresh(seq)) return;
      if (!blob) { const w = box.querySelector("#an-wrap"); if (w) w.innerHTML = `<div class="empty-note" style="color:#c9d5e3">تعذّر فتح الصورة</div>`; return; }
      const url = URL.createObjectURL(blob), img = new Image();
      const cv = box.querySelector("#an-c"), wrap = box.querySelector("#an-wrap");
      let items = [], cur = null, tool = "pen", color = "#ff4d4d", width = 6;
      const ctx = cv.getContext("2d");
      function fit() {
        const r = wrap.getBoundingClientRect();
        const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
        const sc = Math.min(r.width / iw, r.height / ih);
        cv.width = Math.max(2, Math.round(iw * sc)); cv.height = Math.max(2, Math.round(ih * sc));
        redraw();
      }
      function redraw() {
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        items.concat(cur ? [cur] : []).forEach(it => {
          if (it.k === "t") {
            ctx.save(); ctx.font = `700 ${Math.round(it.s * cv.height)}px Tajawal, sans-serif`; ctx.textAlign = "right"; ctx.direction = "rtl";
            ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.strokeText(it.v, it.x * cv.width, it.y * cv.height);
            ctx.fillStyle = it.c; ctx.fillText(it.v, it.x * cv.width, it.y * cv.height); ctx.restore(); return;
          }
          ctx.save();
          ctx.lineCap = "round"; ctx.lineJoin = "round";
          ctx.strokeStyle = it.c; ctx.lineWidth = it.w * cv.height / 500;
          if (it.k === "m") { ctx.globalAlpha = .35; ctx.lineWidth = it.w * cv.height / 160; }
          if (it.k === "e") { ctx.globalCompositeOperation = "destination-over"; }
          ctx.beginPath();
          (it.p || []).forEach((pt, i) => { const x = pt[0] * cv.width, y = pt[1] * cv.height; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
          ctx.stroke(); ctx.restore();
        });
      }
      img.onload = () => { fit(); };
      img.onerror = () => { wrap.innerHTML = `<div class="empty-note" style="color:#c9d5e3">تعذّر عرض الصورة</div>`; };
      img.src = url;
      const ro = (typeof ResizeObserver === "function") ? new ResizeObserver(() => fit()) : null; if (ro) ro.observe(wrap);
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
      cv.addEventListener("pointerdown", (e) => {
        cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
        const p = pos(e);
        if (tool === "text") {
          wrap.querySelectorAll(".an-tbox").forEach(x => x.remove());
          /* مربع النص لا يُغلق بفقدان التركيز: على الجوال تفتح لوحة المفاتيح وتُغلقها فيضيع ما كُتب.
             يُثبَّت بزر ✓ أو Enter، ويُلغى بـ ✕ أو Escape. */
          const boxT = document.createElement("div"); boxT.className = "an-tbox";
          boxT.innerHTML = `<input class="an-tin" placeholder="اكتب هنا…"><button class="an-tok" type="button">✓</button><button class="an-tno" type="button">✕</button>`;
          const r = cv.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
          boxT.style.right = Math.max(4, wr.right - r.left - p[0] * r.width) + "px";
          boxT.style.top = Math.max(4, r.top - wr.top + p[1] * r.height - 20) + "px";
          wrap.appendChild(boxT);
          const inp = boxT.querySelector(".an-tin");
          setTimeout(() => { try { inp.focus(); } catch (e) { } }, 30);
          const done = () => { const v = inp.value.trim(); boxT.remove(); if (v) { items.push({ k: "t", v: v, x: p[0], y: p[1], c: color, s: 0.055 }); redraw(); } };
          inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); done(); } if (ev.key === "Escape") boxT.remove(); });
          boxT.querySelector(".an-tok").onclick = done;
          boxT.querySelector(".an-tno").onclick = () => boxT.remove();
          return;
        }
        cur = { k: tool === "mark" ? "m" : (tool === "erase" ? "e" : "p"), c: tool === "erase" ? "#000" : color, w: width, p: [p] };
      });
      cv.addEventListener("pointermove", (e) => { if (!cur) return; cur.p.push(pos(e)); redraw(); });
      const end = () => { if (cur && cur.p.length > 1) items.push(cur); cur = null; redraw(); };
      cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end); cv.addEventListener("pointerleave", end);
      box.querySelectorAll(".an-t").forEach(b => b.onclick = () => { tool = b.dataset.k; box.querySelectorAll(".an-t").forEach(x => x.classList.toggle("on", x === b)); });
      box.querySelectorAll(".an-c").forEach(b => b.onclick = () => { color = b.dataset.c; box.querySelectorAll(".an-c").forEach(x => x.classList.toggle("on", x === b)); });
      box.querySelectorAll(".an-w").forEach(b => b.onclick = () => { width = +b.dataset.w; box.querySelectorAll(".an-w").forEach(x => x.classList.toggle("on", x === b)); });
      const ub = box.querySelector("#an-undo"); if (ub) ub.onclick = () => { items.pop(); redraw(); };
      const cb = box.querySelector("#an-clear"); if (cb) cb.onclick = () => { items = []; redraw(); };
      const sb = box.querySelector("#an-save");
      if (sb) sb.onclick = () => {
        sb.disabled = true; sb.textContent = "جارِ الحفظ…";
        cv.toBlob(async (bl) => {
          if (!bl) { sb.disabled = false; sb.textContent = "💾 احفظ"; return; }
          const f = new File([bl], "شرح — " + (name || "مرفق") + ".webp", { type: "image/webp" });
          try { await F.upload(f, { scope: "lesson", ref: { code, wk } }); sb.textContent = "✔ حُفظ في مرفقات الدرس"; }
          catch (e) { sb.textContent = "تعذّر الحفظ"; sb.disabled = false; }
        }, "image/webp", 0.9);
      };
    }
    paint();
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
  /* ═══ سرعة السرد وصوته ═══
     المعلم اشتكى أن الصوت أسرع وأعلى مما ينبغي لطفلٍ في الثامنة. فالافتراضي صار 0.85
     (أهدأ من الطبيعي بوضوح) والصوت 0.9، ومفتاحٌ في شريط المشغّل يغيّرها ويحفظها لهذا
     الجهاز — يتبعه الصوت المسجَّل وصوت المتصفح معاً. */
  const NARR_KEY = "sijil.narr.rate";
  const NARR_STEPS = [0.7, 0.85, 1, 1.15];
  const NARR_LBL = { 0.7: "🐢 بطيء", 0.85: "🚶 هادئ", 1: "▶️ عادي", 1.15: "🐇 سريع" };
  function narrRate() {
    let v = 0.85;
    try { const raw = parseFloat(localStorage.getItem(NARR_KEY)); if (raw >= 0.6 && raw <= 1.3) v = raw; } catch (e) { }
    return v;
  }
  function narrSet(v) { try { localStorage.setItem(NARR_KEY, String(v)); } catch (e) { } }
  function narrNext(v) { const i = NARR_STEPS.indexOf(v); return NARR_STEPS[(i < 0 ? 1 : i + 1) % NARR_STEPS.length]; }
  const NARR_VOL = 0.9;
  /* نصّ النطق ≠ نصّ الشاشة: محرّك النطق يقرأ الرموز والإيموجي حرفاً حرفاً، ويصل الجُمل
     بلا وقفة إن لم تنتهِ بنقطة. والتشكيل — إن وُجد في البيانات — يُترك كما هو لأنه هو
     ما يضبط النطق (حقل n في المشهد يحمل النصّ المشكول حين يُضاف، وإلا فنصّ الشاشة). */
  const TTS_SYM = [[/\u066A|%/g, " بالمئة "], [/=/g, " يساوي "], [/\+/g, " زائد "],
    [/×|\*/g, " ضرب "], [/÷/g, " على "], [/(\d)\s*\/\s*(\d)/g, "$1 على $2"],
    [/&/g, " و "], [/<|>/g, " "], [/[_~^|]/g, " "]];
  function ttsText(x) {
    let t = String((x && typeof x === "object") ? (x.n || x.t || "") : (x || ""));
    // الإيموجي ورموز الترقيم المكررة: تُقرأ أسماءً طويلة أو تُربك الوقفات
    t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu, " ");
    TTS_SYM.forEach(p => { t = t.replace(p[0], p[1]); });
    t = t.replace(/\s+/g, " ").trim();
    if (t && !/[.؟!،؛:]$/.test(t)) t += ".";        // وقفة في آخر كل مشهد
    return t;
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
  /* فهرس المقاطع الصوتية: وعد واحد يُنشأ مرة ويُعاد استعماله (لا شيء يُجلب قبل أول قصة). */
  let audioIdxP = null;
  function audioHas(key) {
    if (!audioIdxP) audioIdxP = fetch("data/lessons/audio/index.json")
      .then(r => r.ok ? r.json() : []).catch(() => []);
    return audioIdxP.then(l => Array.isArray(l) && l.indexOf(key) > -1).catch(() => false);
  }
  async function stageStory(box, code, wk, seq) {
    const d = await lessonData(code, wk);
    if (!liveFresh(seq)) return;
    if (!d) { box.innerHTML = `<div class="empty-note" style="color:#c9d5e3">قصة هذا الدرس قيد الإعداد</div>`; return; }
    const scenes = buildStory(d);
    // مقطع صوتي واحد متواصل لهذا الدرس؟
    const key = code + "w" + wk, url = "data/lessons/audio/" + key + ".mp3";
    /* الصوت المسجَّل موجود لبعض الدروس فقط (٥١ من ٧٨٢). كان كل فتح لمحطة القصة في مادة بلا صوت
       يجسّ الملف فيردّ 404 — طلب فاشل وخطأ console في كل مرة، ولكل معلم مادةٍ بلا صوت كل حصة.
       الآن فهرس واحد يُجلب مرة في العمر ويُقرأ من الذاكرة، فلا طلب فاشل إطلاقاً. */
    const hasAudio = await audioHas(key);
    if (!liveFresh(seq)) return;                 // غادر المعلم أثناء انتظار الصوت: لا تُعِد تفعيل القصة فوق محطته الجديدة
    storyActive = true;
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
            <button class="story-rate" id="st-rate" title="سرعة السرد">🚶 هادئ</button>
            <button class="btn-primary" id="st-play" style="min-width:130px">▶️ تشغيل</button>
          </div>
        </div>
      </div></div>`;
    const vEl = box.querySelector("#story-v"), tEl = box.querySelector("#story-t");
    const fillEl = box.querySelector("#st-fill"), timeEl = box.querySelector("#st-time"), playBtn = box.querySelector("#st-play");
    const rateBtn = box.querySelector("#st-rate");
    let rate = narrRate();
    const paintRate = () => { if (rateBtn) rateBtn.textContent = NARR_LBL[rate] || (rate + "×"); };
    paintRate();
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
      storyAudio.volume = NARR_VOL;
      storyAudio.playbackRate = rate;                 // المتصفح يحافظ على طبقة الصوت
      if (rateBtn) rateBtn.onclick = () => { rate = narrNext(rate); narrSet(rate); storyAudio.playbackRate = rate; paintRate(); };
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
      const fullText = scenes.map(ttsText).filter(Boolean).join(" ");
      let playing = false;
      const vhint = box.querySelector("#st-vhint");
      const v = arVoice();
      vhint.textContent = v ? ((/online|natural/i.test(v.name || "") ? "🎙️ صوت طبيعي" : "الصوت: " + v.name)) : "لأنقى صوت افتح في Edge";
      const speakAll = () => {
        try { window.speechSynthesis.cancel(); } catch (e) { }
        const u = new SpeechSynthesisUtterance(fullText);
        // أهدأ وأخفض قليلاً: هذه قصةٌ تُروى لطفلٍ في الثامنة لا نشرةُ أخبار
        u.lang = "ar-SA"; if (v) u.voice = v; u.rate = rate; u.pitch = 0.95; u.volume = NARR_VOL;
        // مزامنة الصورة عبر onboundary إن توفّر
        u.onboundary = (ev) => { const frac = fullText.length ? (ev.charIndex || 0) / fullText.length : 0; showScene(sceneAt(frac)); fillEl.style.width = (frac * 100) + "%"; };
        u.onend = () => { playing = false; playBtn.textContent = "↺ إعادة"; fillEl.style.width = "100%"; confetti(); };
        try { window.speechSynthesis.speak(u); } catch (e) { }
      };
      playBtn.onclick = () => {
        if (!playing) { playing = true; playBtn.textContent = "⏸ إيقاف"; showScene(0); speakAll(); }
        else { playing = false; playBtn.textContent = "▶️ تشغيل"; try { window.speechSynthesis.cancel(); } catch (e) { } }
      };
      // تغيير السرعة أثناء القراءة يُعيد النطق من أوله: محرّك المتصفح لا يقبل تعديلها جارية
      if (rateBtn) rateBtn.onclick = () => {
        rate = narrNext(rate); narrSet(rate); paintRate();
        if (playing) speakAll();
      };
      showScene(0);
    }
  }
  // 🎡 عجلة اختيار الطلاب
  let wheelIv = null;
  function stopWheel() { if (wheelIv) { clearTimeout(wheelIv); wheelIv = null; } }   // دورة جارية لا تُكمل فوق محطة أخرى
  function stageWheel(box, c) {
    /* «الحاضرون فقط» كانت تعدّ غير المرصود حاضراً، فتنادي العجلة اسم غائب أمام عشرين طالباً.
       الآن: المرصود حاضراً وحده، وإن لم يُرصد أحد فالشريط يقولها ويعرض تسجيل الحضور بنقرة. */
    const K = classDayMark(liveCid, liveDate);
    const okPool = () => activeStudents(c).map(x => x.i).filter(i => liveMarked(i) && !liveAway(i));
    const anyPool = () => activeStudents(c).map(x => x.i).filter(i => !liveAway(i));
    const hint = !K.done
      ? `<div class="whhint none"><span>⚠️ الحضور لم يُسجَّل — العجلة تشمل الجميع (${K.total}) وقد تنادي غائباً</span><button type="button" class="ab" id="wh-allp">✓ الكل حاضر</button></div>`
      : K.done < K.total
        ? `<div class="whhint part"><span>⚠️ رُصد ${K.done}/${K.total} — العجلة تنادي المرصودين حاضرين فقط (${okPool().length})</span><button type="button" class="ab" id="wh-allp">✓ أكمل الباقي</button></div>`
        : `<div class="whhint ok"><span>✅ الحضور مسجَّل — ${okPool().length} حاضراً${K.absent ? ` · مستبعَد ${K.absent} غائباً` : ""}</span></div>`;
    box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">🎡 عجلة اختيار الطلاب</span>
      <label style="color:#c9d5e3;font-size:13px;margin-inline-start:auto"><input type="checkbox" id="wh-present" checked> الحاضرون فقط</label></div>
      ${hint}
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px">
        <div id="wh-name" style="font-size:min(9vw,64px);font-weight:800;color:var(--goldl);text-align:center;min-height:1.2em;padding:0 12px">اضغط «أدر العجلة»</div>
        <button class="btn-primary" id="wh-spin" style="font-size:20px;max-width:280px">🎡 أدر العجلة</button>
        <div id="wh-act"></div>
      </div></div>`;
    const nameEl = box.querySelector("#wh-name");
    const wap = box.querySelector("#wh-allp"); if (wap) wap.onclick = liveMarkAllPresent;
    box.querySelector("#wh-spin").onclick = () => {
      stopWheel();
      let pool = activeStudents(c).map(x => x.i);
      /* «الحاضر» = من رُصدت حالته وليست غياباً/استئذاناً/عذراً/هرباً (liveAway هو تعريف لوحة الشرف نفسه).
         غير المرصود يخرج صراحةً: هو الاحتمال الأكبر أن يكون غائباً لم يُسجَّل بعد.
         وإن لم يُرصد أحد إطلاقاً بقيت البِركة كما كانت (والشريط أعلاه يقولها) حتى لا تتوقف العجلة. */
      if (box.querySelector("#wh-present").checked) {
        const here = okPool();
        pool = here.length ? here : (anyPool().length ? anyPool() : pool);
      }
      // دورة مشاركة: استبعد من شارك في هذه الحصة حتى يشارك الجميع، ثم ابدأ دورة جديدة
      const fresh = pool.filter(i => !liveTurns.done.has(i));
      if (fresh.length) pool = fresh; else liveTurns.done.clear();
      box.querySelector("#wh-act").innerHTML = "";
      const here = okPool().length ? okPool() : anyPool();   // مقام العدّاد = البِركة نفسها التي تدور عليها العجلة
      let ticks = 0, max = 22 + Math.floor(Math.random() * 10);
      /* سلسلة setTimeout لا setInterval: مهلة setInterval تُقيَّم مرة واحدة وticks حينها صفر،
         فكانت العجلة تدور بسرعة واحدة (70ms) ثم تقف فجأة بلا تمهيد. */
      const spin = () => {
        const i = pool[Math.floor(Math.random() * pool.length)];
        nameEl.textContent = c.students[i].n;
        nameEl.style.transform = "scale(1.05)";
        ticks++;
        if (ticks < max) { wheelIv = setTimeout(spin, 70 + ticks * 4); return; }
        {
          stopWheel();
          const win = pool[Math.floor(Math.random() * pool.length)]; liveTurns.done.add(win); liveTurns.cur = win;
          nameEl.textContent = "🎉 " + c.students[win].n;
          nameEl.style.transform = "scale(1.15)";
          confetti();
          const base = here.length ? here : activeStudents(c).map(x => x.i);
          const doneN = base.filter(i => liveTurns.done.has(i)).length;
          box.querySelector("#wh-act").innerHTML = `<button class="btn-gold" id="wh-eval" style="font-size:16px">⭐ قيّم ${esc(c.students[win].n.split(" ")[0])}</button><div class="btip" style="margin-top:8px">شارك ${doneN} من ${base.length} — لن يتكرر اسم حتى يشارك الجميع</div>`;
          box.querySelector("#wh-eval").onclick = () => liveActions(win);
        }
      };
      wheelIv = setTimeout(spin, 70);
    };
  }
  // بنك أسئلة الدرس (من صلب محتوى الدرس)
  const lessonCache = {};
  async function lessonData(code, wk) {
    const key = code + "w" + wk;
    if (lessonCache[key] !== undefined) return lessonCache[key];
    let d = null; try { const r = await fetch("data/lessons/" + key + ".json"); if (r.ok) d = await r.json(); } catch (e) { }
    const ov = await lessonOverride(key); if (ov) d = ov;   // درس ألّفه المعلم أونلاين
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
  async function stageQuiz(box, code, wk, seq) {
    const bank = await lessonQuestions(code, wk);
    if (!liveFresh(seq)) return;
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
  async function stageWorksheet(box, code, wk, seq) {
    const key = code + "w" + wk;
    // حمّل أسئلة الدرس تلقائياً أول مرة (ما لم يبنِ المعلم ورقته الخاصة)
    if (wsLoadedFor !== key && (!wsItems.length || wsItems._auto)) {
      const bank = await lessonQuestions(code, wk);
      if (!liveFresh(seq)) return;
      if (bank.length) { wsItems = bank.map(q => ({ t: q.t, q: q.q, opts: q.opts || [], correct: q.correct || 0, ans: q.ans || "", img: q.img || "" })); wsItems._auto = true; wsLoadedFor = key; wsIdx = 0; }
    }
    box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">📝 ورقة الدرس التفاعلية</span>
      <button class="live-btn" id="iws-send" style="margin-inline-start:auto">📤 إرسال للطلاب</button>
      <button class="live-btn" id="iws-print">🖨️ طباعة</button>
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
      // الحذف/الإضافة يجعلان الورقة ورقةَ المعلم: تُطبع كما هي بدل الورقة الأصلية كاملةً كأنه لم يعدّل شيئاً
      list.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { wsItems.splice(+b.dataset.del, 1); wsItems._auto = false; builder(); });
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
        wsItems.push(it); wsItems._auto = false; builder();
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
    const sb = box.querySelector("#iws-send");
    if (sb) sb.onclick = async () => { const d = await lessonData(code, wk); sendSheet(code, wk, (d && d.title) || "ورقة عمل", wsItems, liveCid); };
    const pb = box.querySelector("#iws-print"); if (pb) pb.onclick = async () => { const d = await lessonData(code, wk); printWorksheet((d && d.title) || "درس الأسبوع", (d && wsItems._auto) ? d : { title: (d && d.title) || "ورقة المعلم", questions: wsItems.slice(), vocab: (d && wsItems._auto) ? d.vocab : [], objectives: (d && d.objectives) || [], story: (d && d.story) || [] }); };
    const pp = box.querySelector("#iws-present"); if (pp) pp.onclick = () => { wsIdx = 0; present(); };
    if (wsItems.length) { wsIdx = 0; present(); } else builder();
  }
  /* ⏱️ مؤقّت النشاط — حالته خارج محطته:
     كان العدّ يموت صامتاً بمجرد عرض قائمة الطلاب أو سؤال أثناء النشاط، ويعود 00:00 كأن شيئاً لم يكن.
     الآن يواصل العدّ عبر المحطات، وشارة في رأس الحصة تعرض المتبقّي وتعيد المعلم إليه بنقرة. */
  let timerIv = null, timerLeft = 0, timerRun = false, timerDone = false;
  const timerFmt = (n) => { const v = Math.max(0, n | 0); return String(Math.floor(v / 60)).padStart(2, "0") + ":" + String(v % 60).padStart(2, "0"); };
  function timerPaint() {
    const d = $("#tm-disp"); if (d) { d.textContent = timerFmt(timerLeft); d.style.color = timerDone ? "#ff6b6b" : "var(--goldl)"; }
    const b = $("#tm-se"); if (b) b.textContent = timerRun ? "⏸ إيقاف" : "▶️ ابدأ";
    const chip = $("#live-tchip");
    if (chip) {
      chip.hidden = !(timerRun || timerDone || timerLeft > 0);
      chip.textContent = (timerDone ? "⏰ " : "⏱ ") + timerFmt(timerLeft);
      chip.classList.toggle("done", !!timerDone);
      chip.classList.toggle("run", !!timerRun);
    }
  }
  function timerStop() { if (timerIv) { clearInterval(timerIv); timerIv = null; } timerRun = false; timerPaint(); }
  function timerStart() {
    if (timerLeft <= 0) timerLeft = 60;               // افتراضي دقيقة إن لم يُختر وقت
    timerDone = false; timerRun = true;
    if (timerIv) clearInterval(timerIv);
    timerIv = setInterval(() => {
      timerLeft--;
      if (timerLeft <= 0) { timerLeft = 0; timerDone = true; timerStop(); confetti(); return; }
      timerPaint();
    }, 1000);
    timerPaint();
  }
  function timerReset() { timerStop(); timerLeft = 0; timerDone = false; timerPaint(); }
  function stageTimer(box) {
    box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">⏱️ مؤقّت النشاط</span><span style="color:#9fb0c4;font-size:12px;margin-inline-start:auto">يواصل العدّ ولو انتقلت إلى محطة أخرى</span></div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px">
        <div id="tm-disp" style="font-size:min(22vw,150px);font-weight:800;color:var(--goldl);font-variant-numeric:tabular-nums">00:00</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          ${[30, 60, 120, 180, 300].map(s => `<button class="live-btn" data-s="${s}">${s < 60 ? s + " ث" : (s / 60) + " د"}</button>`).join("")}
        </div>
        <div style="display:flex;gap:10px"><button class="btn-primary" id="tm-se" style="min-width:120px">▶️ ابدأ</button><button class="live-btn" id="tm-reset">↺ صفر</button></div>
      </div></div>`;
    box.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { timerLeft = +b.dataset.s; timerDone = false; timerPaint(); });
    box.querySelector("#tm-se").onclick = () => { if (timerRun) timerStop(); else timerStart(); };
    box.querySelector("#tm-reset").onclick = timerReset;
    timerPaint();
  }
  /* ═══ الحضور من داخل الحصة الحية ═══
     المعلم الذي يبدأ من «🎬 ابدأ حصة تفاعلية» لا يفتح ورقة التحضير أبداً، فتمرّ الحصة كاملة بلا
     حالة حضور واحدة: الدرجة التلقائية تُسقط اليوم من حسابها، والغياب لا يصل البيت، وتقرير الحضور
     الذي يطبعه المدير ويوقّعه يُبنى من هذه الخانات نفسها. الشريط دائم في محطة «الطلاب». */
  const liveRec = (i) => ((DB.recs[liveCid] || {})[liveDate] || {})[i] || {};
  // «مرصود» = حالة حضور مسجَّلة فعلاً (لا مجرّد غياب سجل) — عليها يقوم استبعادُ العجلة
  const liveMarked = (i) => { const e = liveRec(i); return e.a != null && !!STATES[e.a]; };
  /* ═══ الحاضرون فقط ═══
     قائمة الحصة الحية = من هو في الفصل الآن: الحاضر والمتأخر وعن بعد، ومن لم تُرصد حالته بعد.
     الغائب والمستأذن والغائب بعذر والهارب لا تظهر بطاقاتهم إطلاقاً — بطاقةُ من ليس في الفصل هي
     رصدٌ ينتظر ضغطة إبهام خاطئة، ومصدرُ «لماذا لأحمد مشاركة اليوم وهو غائب؟».
     ورأس القائمة يقول «21 حاضراً · 3 غياب» حتى يعرف المعلم أنهم مُستبعدون قصداً لا أنهم ضاعوا. */
  function liveSplit() {
    const c = classById(liveCid), here = [], away = [], none = [];
    activeStudents(c).forEach(o => {
      const e = liveRec(o.i);
      if (e.a == null || !STATES[e.a]) none.push(o);
      else if (liveAway(o.i)) away.push(o);
      else here.push(o);
    });
    return { c, here, away, none };
  }
  function liveRosterHead(S) {
    /* أخضر = رُصد الكل وفي الفصل أحد. أحمر = لم يُرصد أحد. كهرماني = رصدٌ ناقص، أو
       رُصد الكل ولا حاضر واحد (فصلٌ كامل غائب: حالةٌ تستحق نظرةً لا شارةً خضراء). */
    const kls = S.none.length ? ((S.here.length || S.away.length) ? "part" : "none") : (S.here.length ? "full" : "part");
    const bits = [`<b>✅ ${cntAr(S.here.length, "حاضر واحد", "حاضران", "حاضرين", "حاضراً")}</b>`];
    if (S.away.length) bits.push(`🚫 ${cntAr(S.away.length, "غائب واحد", "غائبان", "غائبين", "غائباً")}`);
    if (S.none.length) bits.push(`⭕️ ${S.none.length} بلا حالة`);
    const note = S.away.length ? "<small>الغائب والمستأذن والهارب مستبعدون من هذه القائمة قصداً</small>" : "";
    return `<div class="liveatt lvhead ${kls}"><span class="t">${bits.join(" · ")}${note}</span>`
      + (S.none.length ? `<button type="button" class="ab" id="lv-allp">✓ ${(S.here.length || S.away.length) ? "أكمل الباقي" : "الكل حاضر"} (${S.none.length})</button>` : "")
      + `<button type="button" class="ab2" id="lv-att">👥 تعديل الحضور</button>`
      + `<button type="button" class="qb" id="lv-help" title="مفتاح الرصد والتراجع">❔</button></div>`;
  }
  /* ═══ شاشة الحضور السريعة ═══
     المعلم الذي يبدأ يومه من «🎬 ابدأ حصة تفاعلية» لا يفتح ورقة التحضير أبداً، فكانت الحصة تمرّ
     كاملة بلا حالة حضور واحدة: تسقط من الدرجة التلقائية، ولا يصل غيابٌ إلى بيت، ويخرج تقرير الحضور
     الذي يوقّعه المدير ناقصاً. وبما أن قائمة الحصة صارت «الحاضرون فقط» فلا بدّ من هذه الثواني أولاً.
     تظهر مرة واحدة لكل (فصل|يوم) وفقط إن لم يُرصد شيء، ولا تعود — ويبقى زر 👥 في الرأس لمن تأخّر. */
  const attAsked = new Set();
  const attOff = (st) => !!st && /غائب|مستأذن|بعذر|هارب/.test(String(st.name || ""));
  // حالات الشاشة السريعة بالاسم لا بالفهرس (المدير يعدّل المكتبة ويعيد ترتيبها)، والمُعاد فهرسُ التخزين i
  function attStates() {
    const v = assessView(STATES);
    const by = (re, not) => v.find(x => re.test(String(x.name || "")) && !(not && not.test(String(x.name || ""))));
    const p = by(/حاضر/, /غائب/) || v[0] || null;
    const a = by(/غائب/, /بعذر/) || v.find(x => x.pts < 0 && (!p || x.i !== p.i)) || null;
    const cyc = [p, a, by(/متأخر/), by(/مستأذن/)]
      .filter((x, k, arr) => x && arr.findIndex(y => y && y.i === x.i) === k);
    return { p, a, cyc };
  }
  function attSheet(after) {
    const A = attStates();
    if (!A.p || A.cyc.length < 2) { if (after) after(); return; }   // مكتبة بلا «حاضر» أو بلا بديل له: لا شاشة
    const cid = liveCid, dt = liveDate, c = classById(cid); if (!c) { if (after) after(); return; }
    const list = activeStudents(c), snap = snapDay(cid, dt), pick = {};
    list.forEach(({ i }) => { const e = liveRec(i); if (e.a != null && STATES[e.a]) pick[i] = e.a; });
    const had = Object.keys(pick).length;                          // رصدٌ سابق (من التحضير أو من زر 👥)
    // النقرة الأولى تعني «غائب» — هي المقصودة في عامة النقرات، ثم تدور: متأخر ← مستأذن ← حاضر
    const nx = (cur) => {
      if (cur == null) return (A.a || A.cyc[1]).i;
      const k = A.cyc.findIndex(x => x.i === cur);
      return k < 0 ? (A.a || A.cyc[1]).i : A.cyc[(k + 1) % A.cyc.length].i;
    };
    const kls = (st, off) => !st ? "n" : off ? "x" : ((+st.pts || 0) < 0 ? "w" : "y");   // «متأخر» حاضرٌ بدرجة سالبة
    const chip = (i, s) => {
      const st = pick[i] != null ? STATES[pick[i]] : null, off = attOff(st);
      return `<button type="button" class="atc ${kls(st, off)}" data-i="${i}"><span class="ai">${st ? ST_ICON(st.name || "") : "⭕️"}</span><span class="an">${esc(s.n)}</span><span class="as">${st ? esc(st.name) : "لم تُرصد"}</span></button>`;
    };
    const setChip = (b) => { const i = +b.dataset.i; const st = pick[i] != null ? STATES[pick[i]] : null, off = attOff(st);
      b.className = "atc " + kls(st, off);
      b.querySelector(".ai").textContent = st ? ST_ICON(st.name || "") : "⭕️";
      b.querySelector(".as").textContent = st ? st.name : "لم تُرصد";
    };
    const tally = () => { let h = 0, w = 0, n = 0; list.forEach(({ i }) => { const st = pick[i] != null ? STATES[pick[i]] : null; if (!st) n++; else if (attOff(st)) w++; else h++; }); return { h, w, n }; };
    const commit = () => {
      const T = tally();
      let ch = 0;
      Object.keys(pick).forEach(k => { const i = +k; if (pick[i] == null) return; const e = rec(cid, dt, i, true); if (e.a !== pick[i]) { e.a = pick[i]; ch++; } });
      if (ch) save("recs:" + cid);
      closeLiveBox();
      const redraw = () => {
        if (liveCid !== cid || liveDate !== dt) return;
        if (liveMainView === "roster") drawLiveRoster(); else if (liveMainView === "wheel") liveView("wheel");
        drawLiveBoard(true);
      };
      redraw();
      if (regClass === cid && regDate === dt && document.getElementById("reg-list")) drawRows();
      if (ch) undoBar(`👥 حضور ${c.name} — ${cntAr(T.h, "حاضر واحد", "حاضران", "حاضرين", "حاضراً")}${T.w ? " · " + cntAr(T.w, "غائب واحد", "غائبان", "غائبين", "غائباً") : ""}`, () => {
        restoreDay(cid, dt, snap); redraw();
        if (regClass === cid && regDate === dt && document.getElementById("reg-list")) drawRows();
      });
      if (after) after();
    };
    const T0 = tally();
    openLiveBox(`<button type="button" class="lx" id="at-x" title="إغلاق">✕</button>
      <h4>👥 ${had ? "تعديل الحضور" : "سجّل الحضور أولاً"}</h4>
      <div class="cur"><b>${esc(c.name)}</b> · ${had ? "انقر الاسم ليدور: ❌ غائب ← ⏰ متأخر ← 🚪 مستأذن ← ✅ حاضر" : "اضغط «✓ الكل حاضر» ثم انقر الغائبين — ولن تعود هذه الشاشة"}</div>
      <div class="attsum"><span class="y" id="at-h">✅ ${T0.h}</span><span class="x" id="at-w">🚫 ${T0.w}</span><span class="n" id="at-n">⭕️ ${T0.n} بلا حالة</span>
        <button type="button" class="ab" id="at-all">✓ ${had ? "أكمل الباقي حاضرين" : "الكل حاضر"} (${T0.n})</button></div>
      <div class="attgrid">${list.map(o => chip(o.i, o.s)).join("")}</div>
      <div class="grid" style="margin-top:10px"><button type="button" class="act g" id="at-ok" style="grid-column:1/-1">✅ تم — ابدأ الحصة</button></div>`,
      (o) => {
        const paint = () => {
          const T = tally();
          const hEl = o.querySelector("#at-h"), wEl = o.querySelector("#at-w");
          hEl.textContent = "✅ " + T.h + " حاضر"; hEl.hidden = !T.h;
          wEl.textContent = "🚫 " + T.w + " غياب"; wEl.hidden = !T.w;
          const nEl = o.querySelector("#at-n"), all = o.querySelector("#at-all");
          nEl.textContent = "⭕️ " + T.n + " بلا حالة"; nEl.hidden = !T.n;
          all.hidden = !T.n; all.textContent = "✓ " + ((T.h || T.w) ? "أكمل الباقي حاضرين" : "الكل حاضر") + " (" + T.n + ")";
        };
        // تحديثٌ في موضعه لا إعادة رسم: قائمة 24 اسماً تُمرَّر، وإعادة الرسم تُرجع التمرير إلى أعلى بعد كل نقرة
        o.querySelectorAll(".atc").forEach(b => b.onclick = () => { const i = +b.dataset.i; pick[i] = nx(pick[i]); setChip(b); paint(); });
        // يملأ غير المرصود وحده دائماً: معلمٌ نقر الغائبين أولاً ثم ضغط هذا الزر كان يفقد نقراته كلها
        o.querySelector("#at-all").onclick = () => { list.forEach(({ i }) => { if (pick[i] == null) pick[i] = A.p.i; }); o.querySelectorAll(".atc").forEach(setChip); paint(); };
        o.querySelector("#at-ok").onclick = commit;
        o.querySelector("#at-x").onclick = commit;   // ✕ يحفظ ما نُقر فعلاً: نقرةُ المعلم بيانات، وشريط التراجع يغطّيها
        paint();
      }, true);
  }
  function attAsk() {
    if (!liveCid || !$("#view-live") || $("#view-live").classList.contains("hidden")) return;
    const k = liveCid + "|" + liveDate;
    if (attAsked.has(k)) return;                                   // ظهرت في هذه الجلسة: لا تعود
    if (classDayMark(liveCid, liveDate).done) return;               // مرصود من التحضير: لا تظهر إطلاقاً
    attAsked.add(k);
    attSheet();
  }
  function liveMarkAllPresent() {
    const cid = liveCid, dt = liveDate, c = classById(cid), snap = snapDay(cid, dt);
    let n = 0;
    activeStudents(c).forEach(({ i }) => { const e = rec(cid, dt, i, true); if (e.a == null) { e.a = 0; n++; } });
    save("recs:" + cid);
    if (liveMainView === "roster") drawLiveRoster(); else if (liveMainView === "wheel") liveView("wheel");
    drawLiveBoard(true);
    if (n) undoBar(`✅ سُجّل ${n} حاضراً — ${c.name}`, () => {
      restoreDay(cid, dt, snap);
      if (liveCid === cid && liveDate === dt) { if (liveMainView === "roster") drawLiveRoster(); else if (liveMainView === "wheel") liveView("wheel"); drawLiveBoard(true); }
      if (regClass === cid && regDate === dt && document.getElementById("reg-list")) drawRows();
    });
  }
  /* ضغطة مطوّلة على البطاقة = غائب مباشرة بلا نافذة (نمط bindPart نفسه في التحضير).
     الحارس الزمني يمنع نقرةً طائشة على البطاقة التي تحتل الموضع نفسه بعد إعادة الرسم. */
  let liveHoldAt = 0;
  function bindRosterCard(el2) {
    const i = +el2.dataset.i; let tm = null, held = false;
    const clear = () => { if (tm) { clearTimeout(tm); tm = null; } };
    const mark = () => { held = true; liveHoldAt = Date.now(); clear(); applyLive(i, "absent"); };
    el2.addEventListener("pointerdown", () => { held = false; clear(); tm = setTimeout(mark, 600); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => el2.addEventListener(ev, clear));
    el2.addEventListener("contextmenu", (ev) => { ev.preventDefault(); mark(); });
    el2.onclick = () => { if (held || Date.now() - liveHoldAt < 500) { held = false; return; } liveActions(i); };
  }
  function drawLiveRoster() {
    if (liveMainView !== "roster") return;
    const S = liveSplit(), c = S.c, calc = classCalc(liveCid), box = $("#live-main"); if (!box) return;
    const rows = S.here.concat(S.none).sort((a, b) => a.i - b.i);   // ترتيب الفصل نفسه، بلا بطاقات الغائبين
    const cards = rows.map(({ s, i }) => {
      const p = calc[i].t.pts, e = liveRec(i), has = e.a != null && !!STATES[e.a];
      const pv = has ? (+STATES[e.a].pts || 0) : 0;
      const cls = !has ? "st-none" : pv < 0 ? "st-warn" : "st-ok";
      const ic = has ? `<div class="ric" title="${esc(STATES[e.a].name)}">${ST_ICON(STATES[e.a].name || "")}</div>` : `<div class="ric" title="لم تُرصد حالته">⭕️</div>`;
      // ⚕ ملاحظة صحية أو احتياج خاص: المعلم يحتاج معرفتها وهو ينظر إلى القائمة لا في بطاقة يفتحها
      const flag = s.health ? `<div class="rfl" title="${esc(s.health)}">⚕️</div>` : s.need ? `<div class="rfl" title="${esc(s.need)}">♿</div>` : "";
      return `<div class="rcard ${cls}" data-i="${i}"><div class="rrk">#${calc[i].rank}</div>${ic}${flag}<div class="rn">${esc(s.n)}</div><div class="rp ${p < 0 ? "neg" : ""}">${p}</div></div>`;
    }).join("");
    box.innerHTML = liveRosterHead(S) + `<div class="live-roster">`
      + (rows.length ? cards : `<div class="empty-note" style="grid-column:1/-1;color:#c9d5e3">لا أحد في القائمة: كل الطلاب مرصودون غياباً أو استئذاناً — اضغط «👥 تعديل الحضور» لتصحيح الحضور.</div>`)
      + `</div>` + (rows.length ? `<div class="btip">اضغط الاسم للتقييم · <b>ضغطة مطوّلة = غائب</b> (يخرج من القائمة فوراً)</div>` : "");
    const ap = box.querySelector("#lv-allp"); if (ap) ap.onclick = liveMarkAllPresent;
    const at = box.querySelector("#lv-att"); if (at) at.onclick = () => attSheet();
    const hb = box.querySelector("#lv-help"); if (hb) hb.onclick = () => keysHelp(true);
    box.querySelectorAll(".rcard").forEach(bindRosterCard);
  }
  // حالات لا تظهر في لوحة الشرف: غائب، مستأذن، غائب بعذر، هارب
  function liveAway(i) {
    const e = ((DB.recs[liveCid] || {})[liveDate] || {})[i];
    if (!e || e.a == null || !STATES[e.a]) return false;
    const n = STATES[e.a].name || "";
    return /غائب|مستأذن|بعذر|هارب/.test(n);
  }
  function drawLiveBoard(silent) {
    const c = classById(liveCid), calc = classCalc(liveCid), box = $("#live-board"); if (!box) return;
    const act = calc.filter(r => r.active);
    const rows = act.filter(r => !liveAway(r.i)).sort((a, b) => b.t.pts - a.t.pts || a.i - b.i);
    const away = act.length - rows.length;
    box.innerHTML = `<div class="bhead">🏆 لوحة الشرف</div><div class="btip">اضغط اسم الطالب للتقييم اللحظي${away ? ` · الحاضرون ${rows.length} من ${act.length}` : ""}</div>` + rows.map((r, k) => {
      const cls = k === 0 ? "t1" : k === 1 ? "t2" : k === 2 ? "t3" : "";
      const rk = k < 3 ? ["🥇", "🥈", "🥉"][k] : (k + 1);
      return `<div class="brow ${cls}" data-i="${r.i}"><span class="rk">${rk}</span><span class="bn">${esc(r.s.n)}</span><span class="bp">${r.t.pts}</span></div>`;
    }).join("");
    box.querySelectorAll(".brow").forEach(el2 => el2.onclick = () => liveActions(+el2.dataset.i));
    const topId = rows.length ? rows[0].i : null;
    if (!silent && topId != null && topId !== livePrevTop && rows[0].t.pts > 0) confetti();
    livePrevTop = topId;
  }
  /* ═══ «الأكثر استعمالاً»: أربعة أزرار يثبّتها المعلم بنفسه مرة واحدة ═══
     لا تتعلّم ولا تعيد ترتيب نفسها: أزرارٌ تتحرك تحت الإبهام وسط الحصة تصنع بالضبط الخطأ الذي
     تعالجه هذه النافذة. تُخزَّن بالاسم لا بالفهرس، فتعديل المدير لقائمة السلوكيات لا يقلب معناها. */
  const FAVKEY = () => "sijil.fav." + ((TE && TE.id) || "x");
  /* الافتراضي = الأربعة المدفونة خلف الطيّ (مميز · مخالف · غائب · متأخر) لا 🙋 و📚:
     هذان في القسم المفتوح دائماً فوقهما، وتكرارهما في الصفّ يضيّع نصف الصفّ بلا فائدة. */
  function favDefault() {
    const v = assessView(BEH);
    const out = [];
    const add = (b) => { if (!b) return; const t = "beh|" + b.name; if (out.length < 4 && out.indexOf(t) < 0) out.push(t); };
    ["مميز", "مخالف", "حفظ", "التحدث أثناء الشرح"].forEach(n => add(v.find(x => x.name === n)));
    if (out.length < 4) {                                  // مكتبة عدّلها المدير: أعلى الموجب ثم أدنى السالب
      v.slice().sort((a, b) => b.pts - a.pts).forEach(b => { if (b.pts > 0) add(b); });
      v.slice().sort((a, b) => a.pts - b.pts).forEach(b => { if (b.pts < 0) add(b); });
    }
    return out.length ? out.slice(0, 4) : ["part", "hw"];
  }
  function favGet() {
    let v = null; try { v = JSON.parse(lsGet(FAVKEY()) || "null"); } catch (e) { v = null; }
    const out = (Array.isArray(v) ? v.filter(x => typeof x === "string") : []).slice(0, 4);
    return out.length ? out : favDefault();
  }
  const favSet = (a) => lsSet(FAVKEY(), JSON.stringify((a || []).slice(0, 4)));
  // كل خيار ممكن في النافذة، بالرمز نفسه الذي يُخزَّن به
  function favAll() {
    return [{ t: "part", lbl: "🙋 مشاركة", pts: W.part, cls: "g" },
      { t: "hw", lbl: "📚 واجب ✓", pts: W.hw, cls: "b" },
      { t: "hwno", lbl: "📚 لم يحلّ", pts: 0, cls: "r" }]
      .concat(assessView(BEH).map(b => ({ t: "beh|" + b.name, lbl: ((+b.pts || 0) < 0 ? "⚠ " : "⭐ ") + b.name, pts: +b.pts || 0, cls: (+b.pts || 0) > 0 ? "g" : (+b.pts || 0) < 0 ? "r" : "n" })));
  }
  const favFind = (tok) => favAll().find(x => x.t === tok) || null;
  // رمز ⇒ (k, idx) اللذين تفهمهما applyLive
  function favArgs(tok) {
    const p = String(tok || "").split("|");
    if (p.length === 1) return { k: p[0], idx: null };
    if (p[0] === "state") { const k = STATES.findIndex(x => x.name === p[1]); return k < 0 ? null : { k: "state", idx: k }; }
    if (p[0] === "beh") { const k = BEH.findIndex(x => x.name === p[1]); return k < 0 ? null : { k: "beh", idx: k }; }
    return null;
  }
  function favSheet(i) {
    let sel = favGet().filter(t => favFind(t));
    const draw = () => {
      const items = favAll().map(x => `<button type="button" class="favp ${sel.indexOf(x.t) >= 0 ? "sel" : ""} ${x.cls}" data-t="${esc(x.t)}">${esc(x.lbl)} <small>${signN(x.pts)}</small></button>`).join("");
      openLiveBox(`<button type="button" class="lx" id="fv-x" title="إغلاق">✕</button><h4>📌 الأكثر استعمالاً</h4>
        <div class="cur">اختر حتى أربعة أزرار تظهر في أعلى نافذة التقييم — تبقى في مكانها ولا تتغيّر (<b id="fv-n">${sel.length}</b>/4)</div>
        <div class="favpick">${items}</div>
        <div class="grid" style="margin-top:10px"><button type="button" class="act close" id="fv-rst">استعادة الافتراضي</button><button type="button" class="act g" id="fv-ok">تم</button></div>`,
        (o) => {
          o.querySelector("#fv-x").onclick = () => liveActions(i);
          o.querySelectorAll(".favp").forEach(b => b.onclick = () => {
            const t = b.dataset.t, k = sel.indexOf(t);
            if (k >= 0) sel.splice(k, 1); else { if (sel.length >= 4) sel.shift(); sel.push(t); }
            draw();
          });
          o.querySelector("#fv-rst").onclick = () => { sel = favDefault(); draw(); };
          o.querySelector("#fv-ok").onclick = () => { favSet(sel); liveActions(i); };
        });
    };
    draw();
  }
  /* ═══ نافذة التقييم ═══
     كانت 1015px فيها 26 زراً بلا ✕ ولا صفٍّ سريع: زر الإغلاق يحتاج تمريراً داخل نافذة يفتحها
     المعلم عشرين مرة في الحصة. الآن: ✕ ثابت، وأربعة أزرار مثبَّتة في الأعلى.
     وثلاثة أقسام فقط: 🙋 المشاركة · 📚 الواجب · ⭐ السلوك. لا قسم حضور ولا حالةٌ في «الأكثر استعمالاً»:
     الحضور صار له شاشته السريعة وزر 👥 في رأس الحصة، والقائمة هنا للحاضرين وحدهم فلا معنى لخانة غياب
     في نافذة طالبٍ حاضر — وكانت أطول قسم في النافذة وأكثر ما يُنقر خطأً بجوار السلوكيات. */
  function liveActions(i, ev) {
    const c = classById(liveCid), calc = classCalc(liveCid);
    const e = liveRec(i);
    const favs = favGet().map(t => ({ t, x: favFind(t), a: favArgs(t) })).filter(o => o.x && o.a);
    const favHtml = favs.map(o => `<button class="act ${o.x.cls}" data-k="${esc(o.a.k)}"${o.a.idx != null ? ` data-i="${o.a.idx}"` : ""}>${esc(o.x.lbl)} <small>${signN(o.x.pts)}</small></button>`).join("");
    const behs = assessView(BEH).map(b => `<button class="act ${(+b.pts || 0) > 0 ? "g" : (+b.pts || 0) < 0 ? "r" : "n"}" data-k="beh" data-i="${b.i}">${(+b.pts || 0) > 0 ? "⭐" : (+b.pts || 0) < 0 ? "⚠" : "•"} ${esc(b.name)} <small>${signN(b.pts || 0)}</small></button>`).join("");
    const stCur = e.a != null && STATES[e.a] ? `${ST_ICON(STATES[e.a].name || "")} ${esc(STATES[e.a].name)}` : "لم تُرصد";
    openLiveBox(`<button type="button" class="lx" data-k="x" title="إغلاق">✕</button><h4>${esc(c.students[i].n)}</h4>
      <div class="cur">النقاط ${calc[i].t.pts} · الترتيب ${calc[i].rank} · الحالة: ${stCur}${e.part ? ` · مشاركات اليوم ${e.part}` : ""}</div>
      ${favHtml ? `<div class="lsec favh">📌 الأكثر استعمالاً <button type="button" class="favedit" id="fav-edit">تعديل</button></div><div class="grid favrow">${favHtml}</div>` : ""}
      <div class="lsec">🙋 المشاركة</div>
      <div class="grid"><button class="act g" data-k="part" style="grid-column:1/-1">🙋 شارك <small>${signN(W.part)}</small></button></div>
      <div class="lsec">📚 الواجب</div>
      <div class="grid">
        <button class="act ${e.hw === 1 ? "on " : ""}b" data-k="hw">📚 حلّ الواجب ✓ <small>${signN(W.hw)}</small></button>
        <button class="act ${e.hw === 0 ? "on " : ""}r" data-k="hwno">📚 لم يحلّ <small>0</small></button>
      </div>
      <div class="lsec">⭐ السلوك</div>
      <div class="grid g3">${behs}</div>
      <div class="grid" style="margin-top:10px"><button class="act close" data-k="x" style="grid-column:1/-1">تم</button></div>`,
      (o) => {
        o.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { applyLive(i, b.dataset.k, b.dataset.i != null ? +b.dataset.i : null); closeLiveBox(); });
        const fe = o.querySelector("#fav-edit"); if (fe) fe.onclick = () => favSheet(i);
      });
  }
  // sticky: نقرةُ الخلفية لا تُغلق — شاشة الحضور السريعة لا يجوز أن تُصرَف بلمسة طائشة قبل تسجيل الحضور
  function openLiveBox(html, mount, sticky) {
    closeLiveBox();                              // نافذةٌ تفتح فوق نافذة (تعديل «الأكثر استعمالاً» ثم العودة) كانت تترك عنصرين بالمعرّف نفسه
    const d = document.createElement("div"); d.className = "live-act" + (sticky ? " sticky" : ""); d.id = "live-act";
    d.innerHTML = `<div class="box">${html}</div>`;
    if (!sticky) d.addEventListener("click", (e) => { if (e.target === d) closeLiveBox(); });
    // ملء الشاشة لا يرسم إلا عنصر الملء وأبناءه: نافذة التقييم المُلحقة بـ body تصير غير مرئية وتبتلع النقرات
    (document.fullscreenElement || document.body).appendChild(d); if (mount) mount(d);
  }
  function closeLiveBox() { const d = $("#live-act"); if (d) d.remove(); }
  function applyLive(i, k, idx) {
    if (k === "x") return;                       // «إغلاق» قراءة: لا يُنشئ سجل يوم فارغاً للطالب
    const cid0 = liveCid, dt0 = liveDate, snap = snapRec(cid0, dt0, i);
    const e = rec(liveCid, liveDate, i, true);
    const pos = behIndex("مميز", true), neg = behIndex("مخالف", false);
    let delta = 0;
    if (k === "state" && STATES[idx]) { const had = e.a; e.a = idx; delta = (+STATES[idx].pts || 0) - (had != null && STATES[had] ? (+STATES[had].pts || 0) : 0); }
    else if (k === "beh" && BEH[idx]) { e.beh = e.beh || []; e.beh.push(idx); delta = +BEH[idx].pts || 0; }
    else if (k === "hwno") { const had = e.hw; e.hw = 0; delta = had === 1 ? -W.hw : 0; }
    else if (k === "part") { e.part++; delta = W.part; }
    else if (k === "star" && pos >= 0) { e.beh = e.beh || []; e.beh.push(pos); delta = +BEH[pos].pts; }
    else if (k === "present") { const had = e.a; e.a = 0; delta = (STATES[0].pts || 0) - (had != null && STATES[had] ? STATES[had].pts : 0); }
    else if (k === "hw") { if (e.hw !== 1) { e.hw = 1; delta = W.hw; } }
    else if (k === "bad" && neg >= 0) { e.beh = e.beh || []; e.beh.push(neg); delta = +BEH[neg].pts; }
    else if (k === "absent") { const had = e.a; e.a = 1; delta = (STATES[1].pts || 0) - (had != null && STATES[had] ? STATES[had].pts : 0); }
    pruneRec(liveCid, liveDate, i);              // إجراء لم يغيّر شيئاً (واجب مسجَّل مسبقاً) لا يترك سجلاً فارغاً
    save("recs:" + liveCid);
    const card = document.querySelector(`.rcard[data-i="${i}"]`);
    if (card && delta) floatPoints(card, delta);
    if (liveMainView === "roster") drawLiveRoster();
    drawLiveBoard(false);
    const brow = document.querySelector(`.brow[data-i="${i}"]`);
    if (brow) { brow.classList.add("pulse"); setTimeout(() => brow.classList.remove("pulse"), 700); if (delta) floatPoints(brow, delta); }
    /* شريط التراجع: كل ما فوق يكتب، وهذا أول نظير يحذف في واجهة المعلم كلها */
    const nm = firstName(classById(cid0).students[i].n);
    let lbl = "";
    if (k === "state" && STATES[idx]) lbl = `${ST_ICON(STATES[idx].name || "")} ${STATES[idx].name} — ${nm}`;
    else if (k === "beh" && BEH[idx]) lbl = `${(+BEH[idx].pts || 0) < 0 ? "⚠" : "⭐"} ${BEH[idx].name} لـ ${nm}`;
    else if (k === "part") lbl = `🙋 مشاركة لـ ${nm}`;
    else if (k === "hw") lbl = `📚 واجب ✓ — ${nm}`;
    else if (k === "hwno") lbl = `📚 لم يحلّ الواجب — ${nm}`;
    else if (k === "absent") lbl = `❌ غائب — ${nm}`;
    else if (k === "present") lbl = `✅ حاضر — ${nm}`;
    else if (k === "star" && BEH[pos]) lbl = `⭐ ${BEH[pos].name} لـ ${nm}`;
    else if (k === "bad" && BEH[neg]) lbl = `⚠ ${BEH[neg].name} لـ ${nm}`;
    if (lbl) undoBar(lbl + (delta ? " " + signN(delta) : ""), () => {
      restoreRec(cid0, dt0, i, snap);
      if (liveCid === cid0 && liveDate === dt0) { if (liveMainView === "roster") drawLiveRoster(); drawLiveBoard(true); }
      if (regClass === cid0 && regDate === dt0 && document.getElementById("reg-list")) drawRows();
    });
  }
  function floatPoints(el2, delta) {
    const r = el2.getBoundingClientRect();
    const f = document.createElement("div");
    f.className = "floatpt " + (delta >= 0 ? "pos" : "neg");
    f.textContent = (delta >= 0 ? "+" : "") + (Math.round(delta * 10) / 10);
    f.style.left = (r.left + r.width / 2 - 16) + "px";
    f.style.top = (r.top + 8) + "px";
    (document.fullscreenElement || document.body).appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }

  /* ═══ خلاصة الحصة عند «✕ إنهاء» ═══
     كل هذه الأرقام محسوبة أصلاً وكانت تُرمى عند الخروج: ٤٥ دقيقة تنتهي بلا أثر، وهي بالضبط
     الأسطر التي يكتبها المعلم في دفتره بعد الحصة. وسؤال «نُفّذ الدرس؟» بذرة كشف تنفيذ توزيع
     المنهج — التطبيق يعرف الجدول ودرس الأسبوع ويعرف أن الحصة فُتحت عليه.
     الإجابات تُحفظ على الجهاز لكل فصل وأسبوع (sijil.exec.<معرّف المعلم>) بانتظار مجموعة سحابية. */
  const EXECKEY = () => "sijil.exec." + ((TE && TE.id) || "x");
  const execKey = (cid, wk) => cid + "|w" + wk;
  function execAll() { try { return JSON.parse(lsGet(EXECKEY()) || "{}") || {}; } catch (e) { return {}; } }
  function execGet(cid, wk) { const a = execAll(); return a[execKey(cid, wk)] || null; }
  function execSet(cid, wk, patch) {
    const a = execAll(), k = execKey(cid, wk);
    a[k] = Object.assign({ cid: cid, w: wk }, a[k] || {}, patch, { ts: Date.now(), tn: TE ? TE.name : "" });
    try { lsSet(EXECKEY(), JSON.stringify(a)); } catch (e) { }
  }
  function endLiveSession(V) {
    const cid = liveCid, dt = liveDate;
    timerReset(); stopStory(); stopGame(); stopWheel(); closeLiveBox(); dropUndo();
    /* إخفاء #view-live وحده كان يترك إطار يوتيوب حيّاً في الشجرة: صوتٌ يعمل بلا مشغّل ظاهر
       ولا وسيلة لإيقافه إلا إعادة تحميل الصفحة. وbump للتسلسل يوقف أي كتابة متأخرة من محطة كانت تنتظر الشبكة. */
    liveViewSeq++;
    ytDrop();
    const lm = $("#live-main"); if (lm) lm.innerHTML = "";
    const back = () => {
      (V || $("#view-live")).classList.add("hidden"); $("#view-app").classList.remove("hidden");
      renderReg(); renderToday(); renderGrades();
      setTimeout(() => sessionSummary(cid, dt), 40);
    };
    /* الخروج من ملء الشاشة غير متزامن، ونوافذ #overlay-root لا تُرسم داخل ملء الشاشة إطلاقاً:
       بلا الانتظار تُبنى بطاقة الخلاصة في شجرة غير مرئية ويخرج المعلم كأن شيئاً لم يكن. */
    let p = null; try { if (document.fullscreenElement) p = document.exitFullscreen(); } catch (e) { }
    if (p && p.then) p.then(back).catch(back); else back();
  }
  // نقاط هذه الحصة وحدها (لا المجموع التراكمي) — بها يُعرف «متصدّر الحصة»
  const sessPts = (e) => (e.a != null && STATES[e.a] ? (+STATES[e.a].pts || 0) : 0)
    + (+e.part || 0) * W.part + (e.hw === 1 ? W.hw : 0)
    + (e.beh || []).reduce((a, bi) => a + (BEH[bi] ? (+BEH[bi].pts || 0) : 0), 0);
  function sessionStats(cid, dt) {
    const c = classById(cid); if (!c) return null;
    const act = activeStudents(c), K = classDayMark(cid, dt);
    let part = 0, bad = 0, good = 0, hwY = 0, topP = 0, top = null;
    const absent = [], quiet = [];
    act.forEach(({ s, i }) => {
      const e = ((DB.recs[cid] || {})[dt] || {})[i] || {};
      part += (+e.part || 0);
      if (e.hw === 1) hwY++;
      (e.beh || []).forEach(bi => { const b = BEH[bi]; if (!b) return; if ((+b.pts || 0) < 0) bad++; else if ((+b.pts || 0) > 0) good++; });
      const stn = (e.a != null && STATES[e.a]) ? String(STATES[e.a].name || "") : "";
      if (isAbsent(stn)) absent.push({ i: i, n: s.n, st: stn });
      if (/غائب|مستأذن|بعذر|هارب/.test(stn)) return;              // من ليس في الفصل لا يُحاسب على «لم يشارك»
      if (!(+e.part) && !((e.beh || []).length) && e.hw == null) quiet.push({ i: i, n: s.n });
      const p = sessPts(e); if (p > topP) { topP = p; top = { i: i, n: s.n, p: Math.round(p * 10) / 10 }; }
    });
    return { c: c, K: K, part: part, bad: bad, good: good, hwY: hwY, absent: absent, quiet: quiet, top: top, total: act.length };
  }
  const nameList = (a, mx) => a.slice(0, mx).map(x => esc(x.n)).join("، ") + (a.length > mx ? ` وآخرون (${a.length - mx})` : "");
  function sessionSummary(cid, dt) {
    const S = sessionStats(cid, dt); if (!S) return;
    const wk = curWeek(), ex = execGet(cid, wk) || {};
    const NX = currentOrNextClass(), B = BELL();
    const nx = (dt === todayISO() && NX.next) ? NX.next : null;
    const les = liveLesson || ex.lesson || "";
    /* «انتهت الحصة ولم يُسجَّل الحضور — تسجيله الآن؟» — والحالة الأخطر عملياً هي الرصد الناقص:
       المعلم سجّل الغائبين وحدهم فيظهر الباقون «بلا حالة» في تقرير المدير الموقَّع. */
    const left = Math.max(0, S.total - S.K.done);
    const warn = !S.K.done
      ? `<div class="sumwarn">⚠️ <b>لم يُسجَّل الحضور لهذه الحصة</b> — فتسقط من الدرجة التلقائية ومن تقرير الحضور الذي يوقّعه المدير، ولا يصل غيابٌ إلى بيت.<button type="button" id="ss-all">✓ سجّل الكل حاضراً (${S.total})</button></div>`
      : left
        ? `<div class="sumwarn part">⚠️ <b>رُصد ${S.K.done} من ${S.total} فقط</b> — الباقون بلا حالة حضور، فلا يدخلون تقرير الحضور ولا الدرجة التلقائية.<button type="button" id="ss-all">✓ أكمل الباقي حاضرين (${left})</button></div>`
        : "";
    const XV = [["yes", "✅ نعم"], ["part", "◐ جزئياً"], ["no", "✖ لا"]];
    openSheet(`<h4>🎬 خلاصة الحصة — ${esc(S.c.name)}</h4>
      ${warn}
      <div class="sumgrid">
        <div class="sc"><b>${S.part}</b><span>مشاركة</span></div>
        <div class="sc ${S.bad ? "bad" : ""}"><b>${S.bad}</b><span>مخالفة</span></div>
        <div class="sc ${S.good ? "ok" : ""}"><b>${S.good}</b><span>تقدير</span></div>
        <div class="sc"><b>${S.K.done}/${S.K.total}</b><span>حضور مرصود</span></div>
      </div>
      <div class="sumline">❌ <b>${S.absent.length ? cntAr(S.absent.length, "غائب واحد", "غائبان", "غائبين", "غائباً") : "لا غياب"}</b>${S.absent.length ? " — " + nameList(S.absent, 6) : " 🌿"}</div>
      <div class="sumline">🤫 <b>لم يشارك ${S.quiet.length}</b>${S.quiet.length ? " — " + nameList(S.quiet, 8) : " — شارك الجميع 🎉"}</div>
      <div class="sumline">📘 الدرس: <b>${les ? esc(les) : "لم يُحدَّد"}</b> · الأسبوع ${wk}</div>
      <div class="lsec2">نُفّذ الدرس؟</div>
      <div class="execrow">${XV.map(v => `<button type="button" class="${ex.v === v[0] ? "sel" : ""}" data-x="${v[0]}">${v[1]}</button>`).join("")}</div>
      <textarea class="note" id="ss-note" rows="2" placeholder="ملاحظة على الحصة (تُحفظ لهذا الفصل وهذا الأسبوع)…">${esc(ex.note || "")}</textarea>
      <div class="sheet-actions" style="flex-wrap:wrap">
        <button class="btn-plain" style="flex:1 1 46%" id="ss-abs"${S.absent.length ? "" : " disabled"}>📨 أبلغ أولياء الغائبين${S.absent.length ? " (" + S.absent.length + ")" : ""}</button>
        <button class="btn-plain" style="flex:1 1 46%" id="ss-cert"${S.top ? "" : " disabled"}>🎓 شهادة لمتصدّر الحصة${S.top ? "" : " (لا رصد)"}</button>
        ${nx ? `<button class="btn-gold" style="flex:1 1 100%" id="ss-next">▶️ افتح الحصة القادمة: ${esc(nx.cname)} — ح${nx.p} ${esc(B.hm(nx.from))}</button>` : `<div class="empty-note" style="flex:1 1 100%;padding:6px">${dt === todayISO() ? "انتهى نصابك اليوم ✔" : "رصد يوم سابق"}</div>`}
        <button class="btn-primary" style="flex:1 1 100%" id="ss-done">تم</button></div>`,
      (o) => {
        const note = () => { const t = o.querySelector("#ss-note"); return t ? t.value.trim() : ""; };
        const keep = (patch) => execSet(cid, wk, Object.assign({ lesson: les, note: note() }, patch || {}));
        o.querySelectorAll("[data-x]").forEach(b => b.onclick = () => {
          o.querySelectorAll("[data-x]").forEach(x => x.classList.toggle("sel", x === b));
          keep({ v: b.dataset.x });
        });
        const tx = o.querySelector("#ss-note"); if (tx) tx.onchange = () => keep({});
        const sa = o.querySelector("#ss-all");
        if (sa) sa.onclick = () => {
          const snap = snapDay(cid, dt); let n = 0;
          activeStudents(S.c).forEach(({ i }) => { const e = rec(cid, dt, i, true); if (e.a == null) { e.a = 0; n++; } });
          save("recs:" + cid);
          if (regClass === cid && regDate === dt && document.getElementById("reg-list")) drawRows();
          sessionSummary(cid, dt);
          if (n) undoBar(`✅ سُجّل ${n} حاضراً — ${S.c.name}`, () => { restoreDay(cid, dt, snap); if (document.getElementById("reg-list")) drawRows(); sessionSummary(cid, dt); });
        };
        const ab = o.querySelector("#ss-abs"); if (ab && S.absent.length) ab.onclick = () => { keep({}); absentNotify(cid, dt, () => sessionSummary(cid, dt)); };
        const ce = o.querySelector("#ss-cert"); if (ce && S.top) ce.onclick = () => printCertificate(cid, S.top.i, S.top.p);
        const nb = o.querySelector("#ss-next"); if (nb && nx) nb.onclick = () => { keep({}); closeSheet(); liveSession(nx.cid); };
        o.querySelector("#ss-done").onclick = () => { keep({}); closeSheet(); };
      });
  }
  /* ═══ إبلاغ أولياء الغائبين ═══
     رسالة فردية قصيرة لكل غائب وحده (لا قروب ولا أسماء منشورة)، ومعاينةٌ تعمل بلا رقم — فالوضع
     التجريبي بلا أرقام إطلاقاً، ولا تُفتح محادثة واتساب مع رقم مُختلق. وكل إرسال يُسجَّل في سجل التواصل. */
  function absentMessage(cid, i, stName, dt) {
    const c = classById(cid), s = c.students[i];
    let when = ""; try { when = hijriLabel(new Date(dt + "T09:00:00")); } catch (e) { when = hijriLabel(); }
    return ["السلام عليكم ورحمة الله وبركاته",
      `ولي أمر الطالب: *${s.n}* — ${c.name}`,
      `نفيدكم بأن ابنكم سُجّل «${stName}» في حصة ${TE.subject} — ${when}.`,
      "نأمل متابعته، والتواصل معنا إن كان له عذر 🌹", "",
      `معلم المادة: ${TE.name}`, META.school.name].join("\n");
  }
  function logAbsentComm(cid, i, stName, dt) {
    DB.comms[cid] = DB.comms[cid] || [];
    DB.comms[cid].push({ si: i, why: "غياب متكرر", via: "واتساب", note: `إبلاغ غياب (${stName}) — ${dt}`, date: hijriLabel(), ts: Date.now() });
    save("comms:" + cid);
  }
  /* ═══ سلسلة ولي الأمر: من لحظة الغياب إلى سجل موثّق ═══
     كل تواصل يمرّ على DB.comms نفسها (سجل التواصل الذي تقرأه بطاقة الطالب ولوحة المدير)، فلا يبقى
     إرسالٌ بلا أثر حين يسأل المرشد أو المشرف «هل تُوُوصل مع ولي أمر فلان؟». */
  const logComm = (cid, i, why, via, note) => {
    DB.comms[cid] = DB.comms[cid] || [];
    DB.comms[cid].push({ si: i, why: why, via: via, note: note, date: hijriLabel(), ts: Date.now() });
    save("comms:" + cid);
  };
  // «أمس»/«قبل يومين» — التوثيق يُقرأ بالعين لا بحساب في الرأس
  function agoLabel(ts) {
    if (!ts) return "";
    const d = Math.floor((Date.now() - (+ts || 0)) / 864e5);
    if (d <= 0) return "اليوم";
    if (d === 1) return "أمس";
    if (d === 2) return "قبل يومين";
    if (d < 11) return `قبل ${d} أيام`;
    return `قبل ${d} يوماً`;
  }
  // آخر تواصل عن هذا اليوم بعينه (المقترحات ليست تواصلاً فتُستثنى بـ !x.ph)
  const lastParentComm = (cid, i, dt) => ((DB.comms[cid] || []).filter(x => x.si === i && !x.ph && String(x.note || "").indexOf(dt) >= 0).slice(-1)[0]) || null;
  const lastCommWhy = (cid, i, why) => ((DB.comms[cid] || []).filter(x => x.si === i && !x.ph && x.why === why).slice(-1)[0]) || null;
  /* مقترح رقم ولي الأمر من المعلم: يُحفظ عنصراً في سجل التواصل نفسه (يصل السحابة بقواعدها القائمة
     بلا مجموعة جديدة) ولا يُكتب في سجل الطلاب — يعتمده المدير بنقرة في تبويب «الطلاب» ويُقيَّد في
     سجل الإدارة. بيانات أولياء الأمور سجل رسمي لا يكتب عليه ٢٤ معلماً بلا اعتماد. */
  const normPh = (p) => { let d = String(p || "").replace(/[^\d]/g, ""); if (/^9665\d{8}$/.test(d)) d = "0" + d.slice(3); else if (/^5\d{8}$/.test(d)) d = "0" + d; return /^05\d{8}$/.test(d) ? d : null; };
  const phoneSug = (cid, i) => ((DB.comms[cid] || []).filter(x => x.si === i && x.ph).slice(-1)[0]) || null;
  function savePhoneSug(cid, i, ph) {
    DB.comms[cid] = DB.comms[cid] || [];
    DB.comms[cid].push({ si: i, why: "مقترح جوال", via: "مقترح", ph: ph, note: `مقترح جوال ولي الأمر ${ph} — بانتظار اعتماد الإدارة`, date: hijriLabel(), ts: Date.now() });
    save("comms:" + cid);
  }
  // كتلة «📱 أضف جوال ولي الأمر» — تُستعمل في بطاقة الطالب وفي نافذة الإرسال
  function askPhoneHtml(cid, i, idp) {
    const sug = phoneSug(cid, i);
    return `<div class="pask">📱 لا رقم مسجل لولي أمر هذا الطالب${sug ? ` — <b>اقترحتَ <span dir="ltr">${esc(sug.ph)}</span></b> وهو بانتظار اعتماد الإدارة` : ""}
      <div class="pin"><input id="${idp}-ph" class="search-box" inputmode="tel" maxlength="14" placeholder="05xxxxxxxx" value="${esc(sug ? sug.ph : "")}" style="direction:ltr;text-align:right" autocomplete="off"><button type="button" class="btn-soft" id="${idp}-save">💾 اقترح</button></div>
      <small>يُحفظ باسمك مقترحاً يعتمده المدير بنقرة في «الطلاب» — لا يُكتب في سجل الطلاب مباشرة.</small>
      <div id="${idp}-msg" style="font-weight:800;min-height:17px;font-size:12.5px"></div></div>`;
  }
  function bindAskPhone(o, cid, i, idp, after) {
    const sv = o.querySelector("#" + idp + "-save"); if (!sv) return;
    sv.onclick = () => {
      const el = o.querySelector("#" + idp + "-ph"), msg = o.querySelector("#" + idp + "-msg"), n = normPh(el.value);
      if (!n) { msg.style.color = "var(--bad)"; msg.textContent = "صيغة الجوال غير صحيحة — 05xxxxxxxx أو 9665xxxxxxxx"; return; }
      savePhoneSug(cid, i, n);
      msg.style.color = "var(--ok)"; msg.textContent = "✔ حُفظ مقترحاً — يعتمده المدير من لوحة «الطلاب»";
      sv.disabled = true;
      if (after) after();
    };
  }
  /* نافذة الإرسال الموحّدة: معاينة + واتساب + نسخ + «✔ سجّل التواصل» — الواتساب والتسجيل على مسار
     واحد، فما وصل البيت يظهر في سجل الطالب وفي لوحة المدير بلا خطوة إضافية ينساها المعلم. */
  /* الاسم parentSendSheet لا sendSheet: في الملف دالةٌ باسم sendSheet لإرسال أوراق العمل (أسفلُه)،
     وتصريحان بالاسم نفسه في نطاق واحد ⇒ يفوز الأخير صامتاً. فكان «💬 أبلغ ولي الأمر» و«👁 معاينة»
     في تقارير أولياء الأمور ينادِيان مُرسِلَ الأوراق فيردّ «لا أسئلة في هذه الورقة» — سلسلةُ
     ولي الأمر كلها ميتة بلا رسالة خطأ واحدة. */
  function parentSendSheet(o) {
    const cid = o.cid, i = o.i, c = classById(cid), s = c.students[i];
    const ph = phoneOf(s), txt = o.text, done = o.done ? o.done() : null;
    const refresh = () => { if (o.after) o.after(); };
    const log = () => { logComm(cid, i, o.why, "واتساب", o.note); refresh(); };
    openSheet(`<h4>${esc(o.title)}</h4>
      <div class="msgprev">${esc(txt)}</div>
      ${done ? `<div class="pask ok" style="margin-top:8px">✔ سُجّل تواصل سابق — ${esc(done.date)} (${esc(agoLabel(done.ts))})</div>` : ""}
      ${ph ? "" : askPhoneHtml(cid, i, "ps")}
      <div class="sheet-actions" style="flex-wrap:wrap">
        <button class="btn-plain" style="flex:1 1 46%" id="ps-copy">📋 نسخ النص</button>
        <button class="btn-plain" style="flex:1 1 46%" id="ps-log">✔ سجّل التواصل</button>
        <a class="wa-btn ${ph ? "" : "off"}" style="flex:1 1 100%;margin:8px 0 0" id="ps-wa" target="_blank" rel="noopener" href="${waLink(ph, txt)}">💬 واتساب ولي الأمر${ph ? "" : " (لا رقم مسجل)"}</a>
        <button class="btn-primary" style="flex:1 1 100%" id="ps-x">${esc(o.backLbl || "تم")}</button></div>`,
      (ov) => {
        const back = () => { if (o.back) o.back(); else closeSheet(); };
        ov.querySelector("#ps-x").onclick = back;
        ov.querySelector("#ps-copy").onclick = (ev) => {
          const b = ev.currentTarget;
          try { navigator.clipboard.writeText(txt).then(() => { b.textContent = "✔ نُسخ"; }, () => { b.textContent = "تعذّر النسخ"; }); }
          catch (e) { b.textContent = "تعذّر النسخ"; }
        };
        ov.querySelector("#ps-log").onclick = () => { log(); back(); };
        const wa = ov.querySelector("#ps-wa");
        if (wa && ph) wa.addEventListener("click", () => { log(); setTimeout(back, 400); });
        bindAskPhone(ov, cid, i, "ps", () => { refresh(); });
      });
  }
  /* ═══════════ ✉️ رسالة إلى حساب الطالب ووليّه (smsg) ═══════════
     الواتساب يصل ولي أمرٍ سجّل رقمه، والقروب يصل الجميع بلا خصوصية. والرسالة الشخصية —
     استدعاء أو مستوى ابن — تحتاج صندوقاً لطالبٍ واحد: smsg/{mk} حيث mk مفتاحٌ عشوائي داخل
     بصمة هويته، فمن لا يعرفه لا يجد المستند، وسردُ الصناديق ممنوع في القواعد. المعلم يقرأ
     المفاتيح من mkeys/{cid} بمطالبته. ولا يُلغى شيء من الطريق القديم: كل رسالة تُسجَّل في سجل
     التواصل كما هي اليوم، وزر الواتساب باقٍ لمن يريده. */
  /* سلسلة المواضع التي مرّ بها الطالب — من الأحدث إلى الأقدم. فهرسا الحساب (sids وmkeys)
     مبنيّان على (الفصل، الموضع) لا على هوية ثابتة، فالنقل يُبطلهما حتى يُرحَّلا. */
  function chainOf(cid, si) {
    const c = classById(cid), st = c ? (c.students || [])[si] : null;
    if (!st) return [];
    const ch = (st.fromChain && st.fromChain.length) ? st.fromChain : (st.from && st.from.cid ? [st.from] : []);
    return ch.slice().reverse();
  }
  const mkeysRawCache = {};
  const mkeysCache = {};
  /* mkDenied: رفضُ القواعد (جهاز بلا مطالبة جلسة) لا يُشبه «لا مفاتيح لهذا الفصل» — وكان
     المعلم يُقرأ عليه «لا حساب لهؤلاء الطلاب بعد» فيرسل رسالةً إلى العدم وهو مطمئن. */
  let mkDenied = false;
  async function mkeysRaw(cid) {
    if (!CLOUD || !fdb || !cid) return null;
    if (cid in mkeysRawCache) return mkeysRawCache[cid];
    let v = null;
    try {
      const d = await fdb.doc("mkeys/" + cid).get();
      if (d.exists) v = ((d.data() || {}).k) || {};
      else v = {};
    } catch (e) {
      if (e && e.code === "permission-denied") mkDenied = true;
      v = null;
    }
    mkeysRawCache[cid] = v; return v;
  }
  /* المفاتيح الفعلية للفصل: مستنده، ومعه مفتاح كل طالبٍ نُقل إليه — يُقرأ من فهرس فصله
     السابق بموضعه هناك. المفتاح هو نفسه (صندوق الرسائل واحد لا يتبدّل بالنقل)، وبغير هذا
     كان المعلم يُقرأ عليه «لا حساب لهؤلاء الطلاب» فيمتنع عن مراسلة طالبٍ حسابه حيّ. */
  async function mkeysOf(cid) {
    if (!CLOUD || !fdb || !cid) return null;
    if (cid in mkeysCache) return mkeysCache[cid];
    const base = await mkeysRaw(cid);
    if (!base) { mkeysCache[cid] = null; return null; }
    const out = Object.assign({}, base), c = classById(cid);
    const list = c ? (c.students || []) : [];
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      if (!st || st.moved || st.gap || out[String(i)]) continue;
      const ch = chainOf(cid, i);
      for (let k = 0; k < ch.length; k++) {
        const f = ch[k]; if (!f || !f.cid || f.cid === cid) continue;
        const old = await mkeysRaw(f.cid);
        const mk = old ? old[String(f.si)] : null;
        if (mk) { out[String(i)] = mk; break; }
      }
    }
    mkeysCache[cid] = out; return out;
  }
  /* الإضافة إلى صندوق الطالب: القائمة تنمو ولا تنقص كما تشترط القاعدة، وعند بلوغ الخمسين
     تُسقط أقدم عشر. محاولتان ثم استسلام صامت — الرسالة ليست رصداً يُخشى فقده. */
  async function msgPush(mk, item) {
    if (!CLOUD || !fdb || !mk || !item) return false;
    const ref = fdb.doc("smsg/" + mk);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const snap = await ref.get();
        const cur = (snap.exists ? (snap.data() || {}).list : null) || [];
        if (cur.some(x => x && x.i === item.i)) return true;
        /* القاعدة تسمح بإسقاط **عشرة** من أقدم القائمة لا أكثر (list[10:] ⊆ الجديدة).
           والقصّ إلى خمسين كان يُسقط أحد عشر عند الرسالة الحادية والستين، فتُرفض الكتابة
           ويتجمّد صندوق الطالب عند ستين رسالة إلى الأبد. */
        let list = cur.concat([item]);
        if (list.length > 60) list = cur.slice(cur.length - 50).concat([item]);
        await ref.set({ list: list, n: list.length, tn: TE.name, ts: Date.now() }, { merge: false });
        return true;
      } catch (e) { if (attempt) return false; await new Promise(r => setTimeout(r, 600)); }
    }
    return false;
  }
  // حصة المعلم القادمة مع هذا الفصل — لتعبئة موعد الاستدعاء بلا كتابة
  function nextLessonWith(cid) {
    try {
      const B = BELL(), days = SDAYS();
      const rows = (D.schedule || []).filter(r => r.c === cid && String(r.t || "") === TE.name);
      if (!rows.length) return null;
      const now = new Date(), todayK = days[now.getDay() === 6 ? 0 : now.getDay()] || days[0];
      for (let add = 0; add < 7; add++) {
        const d = new Date(now.getTime() + add * 864e5), dk = DAYS[d.getDay()];
        if (days.indexOf(dk) < 0) continue;
        const cand = rows.filter(r => r.d === dk).sort((a, b) => (+a.p || 0) - (+b.p || 0));
        for (const r of cand) {
          const tm = B.periodTime(+r.p, dk);
          if (add === 0) { const pn = B.periodNow(now); if (pn && +r.p <= pn) continue; }
          return { day: dk, p: +r.p, time: tm, in: add };
        }
      }
    } catch (e) { }
    return null;
  }
  function msgTemplates(cid, i) {
    const S = studentSummary(cid, i), s = S.s, c = S.c;
     const nx = nextLessonWith(cid);
    const when = nx ? `${nx.in === 0 ? "اليوم" : nx.in === 1 ? "غداً" : "يوم " + nx.day} — الحصة ${BELL().ord ? BELL().ord(nx.p) : nx.p}${nx.time ? " (" + nx.time + ")" : ""}` : "";
    const hwN = S.t.hwN || 0;
    /* تسليمات الطالب لا تُدَّعى من ذاكرةٍ لم تُحمَّل: SUBS[cid] تُملأ بـloadSubs، وقبلها
       «لا تسليمات» تعني «لا أعرف» لا «لم يحلّ». وكان يُقال لولي الأمر إن ابنه لم يحلّ شيئاً
       وهو قد سلّم — أو على جهازٍ رُفض عليه سرد subs أصلاً. */
    const unsolved = (() => {
      try {
        const cache = SUBS[cid];
        if (!cache || !Array.isArray(cache.rows)) return null;      // غير محمَّلة ⇒ لا ندّعي
        return cache.rows.some(r => r.si === i) ? null : "لم يحلّ أي ورقة أرسلتُها";
      } catch (e) { return null; }
    })();
    const head = `ولي أمر الطالب: ${s.n} — ${c.name}`;
    const foot = `\n\nمعلم المادة: ${TE.name}\n${META.school.name}`;
    return [
      { k: "level", ic: "📊", n: "مستوى ابنكم", t: `مستوى ابنكم في مادة ${TE.subject}`, b: parentMessage(cid, i) },
      { k: "call", ic: "📣", n: "استدعاء", t: `استدعاء لمقابلة معلم ${TE.subject}`,
        b: `السلام عليكم ورحمة الله وبركاته\n${head}\n\nنرجو تشريفكم لمقابلة معلم المادة لمناقشة مستوى ابنكم${when ? `\n📅 الموعد المقترح: ${when}` : ""}\n\nوإن لم يوافقكم الموعد فأخبرونا بالمناسب لكم.${foot}` },
      { k: "thanks", ic: "🌟", n: "شكر وتقدير", t: "شكرٌ وتقدير لابنكم",
        b: `السلام عليكم ورحمة الله وبركاته\n${head}\n\nيسرّني إبلاغكم بتميّز ابنكم في مادة ${TE.subject}: ${S.pos.length ? S.pos.join("، ") : "حرصه وانتظامه"}${S.rank <= 3 ? `\n🏅 ترتيبه ${S.rank} في الفصل` : ""}\n\nنسأل الله له دوام التوفيق، وشاكرين متابعتكم.${foot}` },
      { k: "hw", ic: "📚", n: "تنبيه واجب", t: `الواجبات في مادة ${TE.subject}`,
        b: `السلام عليكم ورحمة الله وبركاته\n${head}\n\nنودّ إبلاغكم بأن ابنكم ${hwN ? `لم يُنجز ${hwN} ${hwN === 1 ? "واجباً" : "واجبات"}` : "يحتاج متابعةً في واجباته"}${unsolved ? `\n📝 ${unsolved}` : ""}\n\nنرجو متابعته في المنزل — وأوراقه وواجباته كلها في حسابه على بوابة الطالب.${foot}` },
      { k: "beh", ic: "⚠️", n: "تنبيه سلوك", t: `ملاحظة سلوكية في حصة ${TE.subject}`,
        b: `السلام عليكم ورحمة الله وبركاته\n${head}\n\nنودّ إبلاغكم بملاحظة على سلوك ابنكم في الحصة: ${S.neg.length ? S.neg.join("، ") : "يحتاج تنبيهاً وتوجيهاً"}\n\nنرجو توجيهه، وشاكرين تعاونكم.${foot}` },
      { k: "free", ic: "✍️", n: "نص حر", t: `رسالة من معلم ${TE.subject}`,
        b: `السلام عليكم ورحمة الله وبركاته\n${head}\n\n${foot}` }
    ];
  }
  /* نافذة الرسالة: طالب واحد أو مجموعة. قوالبٌ تُعبَّأ من سجل المعلم نفسه، ونصٌّ قابل للتعديل
     قبل الإرسال، وتسجيلٌ في سجل التواصل، وزر واتساب لمن يريد الطريقين. */
  function msgSheet(cid, list, opts) {
    opts = opts || {};
    if (!CLOUD || !fdb) { alert("إرسال الرسائل إلى حسابات الطلاب يحتاج النسخة السحابية"); return; }
    if (!claimGate("إرسال رسالة إلى حساب الطالب")) return;
    const c = classById(cid); if (!c) return;
    const idx = (list || []).filter(i => c.students[i] && !c.students[i].moved);
    if (!idx.length) { alert("لا طالب محدد"); return; }
    const one = idx.length === 1 ? idx[0] : null;
    const tpl = one != null ? msgTemplates(cid, one) : null;
    let pick = opts.kind || (tpl ? "level" : "free");
    let keys = null;
    const cur = () => (tpl ? (tpl.find(x => x.k === pick) || tpl[0]) : null);
    const groupBody = (k) => {
      const T = { call: ["استدعاء لمقابلة معلم " + TE.subject, "نرجو تشريفكم لمقابلة معلم المادة لمناقشة مستوى ابنكم."],
        hw: ["الواجبات في مادة " + TE.subject, "نرجو متابعة ابنكم في واجباته — وأوراقه كلها في حسابه على بوابة الطالب."],
        thanks: ["شكرٌ وتقدير", "نشكر لابنكم حرصه وانتظامه في مادة " + TE.subject + "."],
        beh: ["ملاحظة سلوكية", "نرجو توجيه ابنكم إلى الالتزام في الحصة."],
        level: ["متابعة مستوى ابنكم", "نرجو متابعة مستوى ابنكم في مادة " + TE.subject + " من حسابه على بوابة الطالب."],
        free: ["رسالة من معلم " + TE.subject, ""] }[k] || ["رسالة من معلم " + TE.subject, ""];
      return { t: T[0], b: `السلام عليكم ورحمة الله وبركاته\n\n${T[1]}\n\nمعلم المادة: ${TE.name}\n${META.school.name}` };
    };
    const who = one != null ? esc(c.students[one].n) : `${idx.length} طالباً من ${esc(c.name)}`;
    const chips = (tpl || [{ k: "level", ic: "📊", n: "متابعة المستوى" }, { k: "call", ic: "📣", n: "استدعاء" },
      { k: "thanks", ic: "🌟", n: "شكر" }, { k: "hw", ic: "📚", n: "واجب" }, { k: "beh", ic: "⚠️", n: "سلوك" },
      { k: "free", ic: "✍️", n: "نص حر" }]);
    openSheet(`<h4>✉️ رسالة إلى حساب ${one != null ? "الطالب ووليّه" : "الطلاب وأوليائهم"}</h4>
      <div style="font-size:13px;color:var(--muted);margin-bottom:8px">${who} — تظهر في «📬 رسائلي» داخل حسابه على بوابة الطالب، ويراها وليّ أمره معه.</div>
      <div class="field"><label>القالب</label><div class="msg-tpl" id="mg-tpl">${chips.map(x => `<button class="as-mode ${x.k === pick ? "on" : ""}" data-k="${x.k}"><span>${x.ic}</span>${x.n}</button>`).join("")}</div></div>
      <div class="field"><label>العنوان</label><input class="search-box" id="mg-t" style="margin:0" maxlength="80"></div>
      <div class="field"><label>النص</label><textarea class="search-box" id="mg-b" style="margin:0;height:190px;font-size:13.5px;line-height:1.9" maxlength="700"></textarea>
        <div class="empty-note" style="padding:4px 2px 0;text-align:right"><span id="mg-len">0</span>/700 محرف — عدّله كما تشاء قبل الإرسال</div></div>
      <div id="mg-out"></div>
      <div class="sheet-actions" style="flex-wrap:wrap"><button class="btn-plain" style="flex:1 1 46%" onclick="window._sheetClose()">إلغاء</button>
        <button class="btn-primary" style="flex:1 1 46%" id="mg-send">📬 أرسِل إلى الحساب</button></div>`, async (o) => {
      const $$ = (q) => o.querySelector(q);
      const fill = () => {
        const v = one != null ? cur() : groupBody(pick);
        $$("#mg-t").value = v.t; $$("#mg-b").value = v.b;
        $$("#mg-len").textContent = String(v.b.length);
      };
      fill();
      $$("#mg-b").oninput = () => { $$("#mg-len").textContent = String($$("#mg-b").value.length); };
      o.querySelectorAll("#mg-tpl [data-k]").forEach(b => b.onclick = () => {
        pick = b.dataset.k;
        o.querySelectorAll("#mg-tpl [data-k]").forEach(x => x.classList.toggle("on", x === b));
        fill();
      });
      keys = await mkeysOf(cid);
      if (!keys && mkDenied) {
        // رفضٌ لا نقصُ بيانات: يُقال سببه ولا يُترك المعلم يظن أن الطلاب بلا حسابات
        $$("#mg-out").innerHTML = `<div class="as-sum bad">⛔ تعذّر قراءة حسابات الطلاب: لم يُعتمد هذا الجهاز برقمك — اعتمده من الشريط الأعلى ثم أعد المحاولة. (وليس سببه الإنترنت)</div>`;
        const sb = $$("#mg-send"); if (sb) sb.disabled = true;
      } else {
        const noKey = keys ? idx.filter(i => !keys[String(i)]).length : idx.length;
        if (noKey) $$("#mg-out").innerHTML = `<div class="as-sum warn">⚠ ${noKey === idx.length ? "لا حساب لهؤلاء الطلاب بعد" : noKey + " من الطلاب بلا حساب"} — تُسجَّل هوياتهم من لوحة المدير ← ⚙️ الإدارة ← 🆔 أرقام هويات الطلاب</div>`;
      }
      $$("#mg-send").onclick = async () => {
        const btn = $$("#mg-send"), t = $$("#mg-t").value.trim().slice(0, 80), b = $$("#mg-b").value.trim().slice(0, 700);
        if (!t || !b) { alert("اكتب عنواناً ونصاً"); return; }
        btn.disabled = true; btn.textContent = "جارِ الإرسال…";
        if (!keys) keys = await mkeysOf(cid);
        let ok = 0, miss = 0, fail = 0;
        for (const i of idx) {
          const mk = keys ? keys[String(i)] : null;
          if (!mk) { miss++; continue; }
          const item = { i: shortId() + shortId().slice(0, 2), k: pick, t: t, b: b, tid: TE.id, tn: TE.name, subj: TE.subject, ts: Date.now() };
          const done = await msgPush(mk, item);
          if (done) { ok++; try { logComm(cid, i, MSG_WHY[pick] || "رسالة", "حساب الطالب", t); } catch (e) { } }
          else fail++;
        }
        $$("#mg-out").innerHTML = `<div class="as-sum ${ok ? "ok" : "bad"}">${ok ? `✅ وصلت إلى <b>${ok} ${ok === 1 ? "حساب" : "حساباً"}</b> — تظهر في «📬 رسائلي» عندهم` : "لم تصل أي رسالة"}`
          + (miss ? `<div class="s warn">⚠ ${miss} بلا حساب مسجَّل</div>` : "")
          + (fail ? `<div class="s warn">تعثّر الإرسال إلى ${fail} — أعد المحاولة</div>` : "") + `</div>`;
        btn.textContent = ok ? "✔ أُرسلت" : "📬 أرسِل إلى الحساب";
        btn.disabled = !!ok;
        if (ok && opts.after) { try { opts.after(); } catch (e) { } }
      };
    });
  }
  const MSG_WHY = { level: "تقرير متابعة", call: "استدعاء", thanks: "إشعار تميّز", hw: "متابعة واجب", beh: "ملاحظة سلوك", free: "رسالة" };
  // سطر «💬 أبلغ ولي الأمر» داخل صف الطالب بعد غائب/متأخر/هارب
  function parentAlert(cid, dt, i) {
    const e = ((DB.recs[cid] || {})[dt] || {})[i] || {};
    const stn = (e.a != null && STATES[e.a]) ? String(STATES[e.a].name || "") : "غياب";
    parentSendSheet({
      cid: cid, i: i, title: "💬 أبلغ ولي الأمر — " + classById(cid).students[i].n,
      text: absentMessage(cid, i, stn, dt), why: "غياب متكرر", note: `إبلاغ غياب (${stn}) — ${dt}`,
      done: () => lastParentComm(cid, i, dt),
      after: () => { if (regClass === cid && regDate === dt && document.getElementById("reg-list")) drawRows(); }
    });
  }
  function msgPreview(title, text, back) {
    openSheet(`<h4>👁 ${esc(title)}</h4><div class="msgprev">${esc(text)}</div>
      <div class="sheet-actions"><button class="btn-plain" id="mp-back">رجوع</button><button class="btn-primary" id="mp-copy">📋 نسخ النص</button></div>`,
      (o) => {
        o.querySelector("#mp-back").onclick = () => { if (back) back(); else closeSheet(); };
        o.querySelector("#mp-copy").onclick = (ev) => {
          const b = ev.currentTarget;
          try { navigator.clipboard.writeText(text).then(() => { b.textContent = "✔ نُسخ"; }, () => { b.textContent = "تعذّر النسخ"; }); }
          catch (e) { b.textContent = "تعذّر النسخ"; }
        };
      });
  }
  function absentNotify(cid, dt, back) {
    const c = classById(cid), rows = [];
    activeStudents(c).forEach(({ s, i }) => {
      const e = ((DB.recs[cid] || {})[dt] || {})[i];
      const stn = (e && e.a != null && STATES[e.a]) ? String(STATES[e.a].name || "") : "";
      if (isAbsent(stn)) rows.push({ i: i, s: s, stn: stn });
    });
    if (!rows.length) {
      openSheet(`<h4>📨 أولياء أمور الغائبين</h4><div class="empty-note">لا غياب مسجَّل في هذه الحصة 🌿</div><div class="sheet-actions"><button class="btn-primary" id="ab-x">تم</button></div>`,
        (o) => o.querySelector("#ab-x").onclick = () => { if (back) back(); else closeSheet(); });
      return;
    }
    const li = rows.map(r => {
      const ph = String(r.s.p || "").replace(/\D/g, "").replace(/^0/, "966");
      const txt = encodeURIComponent(absentMessage(cid, r.i, r.stn, dt));
      const sent = ((DB.comms[cid] || []).filter(x => x.si === r.i && /غياب/.test(x.why || "")).slice(-1)[0]) || null;
      return `<div class="absrow"><div class="an">${esc(r.s.n)} <span class="tag">${esc(r.stn)}</span>${sent ? `<small>✔ سُجّل تواصل سابق — ${esc(sent.date)}</small>` : ""}</div>
        <div class="ab2"><button type="button" class="btn-plain" data-prev="${r.i}">👁 معاينة</button>
        <a class="wa-btn ${ph ? "" : "off"}" data-wa="${r.i}" target="_blank" rel="noopener" href="https://wa.me/${ph}?text=${txt}">💬 واتساب${ph ? "" : " (لا رقم مسجل)"}</a></div></div>`;
    }).join("");
    openSheet(`<h4>📨 أبلغ أولياء الغائبين (${rows.length})</h4><div class="absl">${li}</div>
      <div class="empty-note" style="padding:6px 2px 0;text-align:right;font-size:12px">كل رسالة فردية وتُسجَّل في سجل التواصل باسم «غياب متكرر»، فتبقى موثّقة عند أي شكوى أو زيارة إشرافية.</div>
      <div class="sheet-actions"><button class="btn-primary" id="ab-x">تم</button></div>`,
      (o) => {
        o.querySelector("#ab-x").onclick = () => { if (back) back(); else closeSheet(); };
        o.querySelectorAll("[data-prev]").forEach(b => b.onclick = () => {
          const i = +b.dataset.prev, r = rows.find(x => x.i === i);
          msgPreview("رسالة ولي أمر — " + r.s.n, absentMessage(cid, i, r.stn, dt), () => absentNotify(cid, dt, back));
        });
        o.querySelectorAll("[data-wa]").forEach(a => a.addEventListener("click", () => {
          const i = +a.dataset.wa, r = rows.find(x => x.i === i); if (!r) return;
          if (!String(r.s.p || "").replace(/\D/g, "")) return;              // زر بلا رقم لا يُسجَّل إرسالاً لم يقع
          logAbsentComm(cid, i, r.stn, dt);
          setTimeout(() => { if (OV.querySelector(".absl")) absentNotify(cid, dt, back); }, 500);
        }));
      });
  }
  // 🎮 استوديو ألعاب الدرس — تخمين وصور وفرق (لوحة الشرف تبقى للتقييم اللحظي)
  let gameIv = null, gameIv2 = null;
  /* كل مؤجَّل داخل لعبة يُسجَّل هنا: الجولة التالية بعد التسوية، وقلب البطاقات، وشاشة النهاية…
     بلا ذلك كانت الجولة التالية تنطلق بعد 1.7 ثانية فتخطف الشاشة إن بدّل المعلم إلى «الطلاب»، أو تُعيد رسم الحصة بعد إنهائها. */
  const gameTOs = [];
  const gameWait = (fn, ms) => { const t = setTimeout(() => { const k = gameTOs.indexOf(t); if (k >= 0) gameTOs.splice(k, 1); fn(); }, ms); gameTOs.push(t); return t; };
  function stopGame() { if (gameIv) { clearInterval(gameIv); gameIv = null; } if (gameIv2) { clearInterval(gameIv2); gameIv2 = null; } while (gameTOs.length) clearTimeout(gameTOs.pop()); }
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const GEN_CAPS = ["لوحة المفاتيح", "فأرة الحاسب", "طابعة", "شاشة الحاسب", "الإنترنت", "روبوت", "ميكروفون", "كتب", "مخطط بياني", "جدول بيانات", "جهاز لوحي", "ساعة ذكية", "كاميرا", "محرك البحث"];
  async function stageGames(box, code, wk, c, seq) {
    stopGame();
    const d = await lessonData(code, wk);
    const vocab = (d && d.vocab) || [], bank = await lessonQuestions(code, wk);
    if (!liveFresh(seq)) return;
    const scenes = (d && d.story) || [];
    const imgs = []; const seenCap = new Set();
    scenes.forEach(s => { if (s.img && s.cap && !seenCap.has(s.cap)) { seenCap.add(s.cap); imgs.push({ img: s.img, cap: s.cap, t: s.t }); } });
    /* صور مرفقات الدرس: صور الدروس الجاهزة موجودة في المهارات الرقمية وحدها (51 درساً من
       782)، فكانت «خمّن الصورة» معطَّلة عند كل معلمٍ آخر بلا سبب معلن. والمرفقات موجودة
       أصلاً لكل درس (📎) وترفع صورها بيد المعلم — فتصير مصدراً ثانياً للّعبتين، واسم الملف
       (بلا امتداده) هو الجواب. تُقرأ من الجهاز فلا طلب شبكة لكل صورة. */
    const fileImgs = [], FF = (typeof FILES === "function") ? FILES() : (window.SIJIL_FILES || null);
    try {
      const arr = FF ? await FF.list("lesson", { code, wk }) : [];
      const pics = (arr || []).filter(x => x && /^image\//.test(x.t || "")).slice(0, 8);
      for (const r of pics) {
        try {
          const g = await FF.blobOf(r.id, r);
          fileImgs.push({ img: URL.createObjectURL(g.blob), cap: String(r.n || "صورة").replace(/\.[a-z0-9]{2,5}$/i, "").slice(0, 40) });
        } catch (e) { }
      }
    } catch (e) { }
    if (!liveFresh(seq)) { fileImgs.forEach(x => { try { URL.revokeObjectURL(x.img); } catch (e) { } }); return; }
    fileImgs.forEach(x => { if (!seenCap.has(x.cap)) { seenCap.add(x.cap); imgs.push(x); } });
    const hero = imgs[0];
    const L = ["أ", "ب", "ج", "د"];
    const bar = (title, extra) => `<div class="stage-bar"><button class="live-btn" id="gm-back">◀ الألعاب</button><span style="color:#fff;font-weight:800">${title}</span>${extra || ""}</div>`;
    // 🎡 اختيار طالب عشوائي (الحاضرون أولاً) للإجابة
    const roster = () => { const pool = activeStudents(c).map(x => x.i), pres = pool.filter(i => !liveAway(i)); return (pres.length ? pres : pool).map(i => c.students[i].n); };
    const pickBtn = `<div class="gm-pickwrap"><button class="live-btn gm-pick" id="gm-pick">🎡 من يجيب؟</button><span class="gm-who" id="gm-who"></span><span class="gm-prog" id="gm-prog"></span><div class="gm-award" id="gm-award"></div></div>`;
    function wirePick() {
      /* كل جولة تُعيد كتابة #live-main: نافذة «يختار زميلاً» المفتوحة كانت تبقى فوق الجولة الجديدة
         وتشير إلى #gm-who/#gm-award القديمة المنفصلة — فيُضاف الطالب إلى دورة المشاركة بلا اسمٍ
         ولا أزرار تقييم: رصدٌ ضائع وعدّاد مغشوش. تُغلق هنا، وعناصر الشاشة تُقرأ لحظة الاستعمال. */
      closeLiveBox();
      const b = box.querySelector("#gm-pick"), w = box.querySelector("#gm-who"); if (!b || !w) return;
      const T = liveTurns;
      const el = (id) => box.querySelector(id);
      const present = () => { const pool = activeStudents(c).map(x => x.i), pres = pool.filter(i => !liveAway(i)); return pres.length ? pres : pool; };
      const prog = () => { const pr = el("#gm-prog"); if (!pr) return; const p = present(); pr.textContent = `شارك ${p.filter(i => T.done.has(i)).length}/${p.length}`; };
      const land = (i) => {
        const w2 = el("#gm-who"), aw = el("#gm-award");
        if (!w2 || !aw) return;                       // المحطة تغيّرت: لا يُضاف إلى الدورة بلا أثر مرئي
        T.cur = i; T.done.add(i); w2.textContent = c.students[i].n; w2.classList.add("pop"); prog();
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
        if (!p.length) { T.done.clear(); prog(); const aw = el("#gm-award"); if (aw) aw.innerHTML = `<span class="gm-fb ok">🎉 شارك الجميع! تبدأ دورة جديدة</span>`; return; }
        if (T.cur == null || !c.students[T.cur]) return;
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
        let n = 0; const w2 = el("#gm-who"), aw = el("#gm-award");
        if (w2) w2.classList.remove("pop"); if (aw) aw.innerHTML = ""; if (gameIv2) clearInterval(gameIv2);
        gameIv2 = setInterval(() => { const wx = el("#gm-who"); if (!wx) { clearInterval(gameIv2); gameIv2 = null; return; } wx.textContent = c.students[p[Math.floor(Math.random() * p.length)]].n; if (++n > 16) { clearInterval(gameIv2); gameIv2 = null; land(pool[Math.floor(Math.random() * pool.length)]); } }, 80);
      };
    }
    function menu() {
      stopGame();
      /* البطاقة المعطَّلة تقول ما ينقصها: كان المعلم يرى بطاقةً رمادية لا تستجيب ولا تشرح،
         فيظنّ اللعبة معطوبة. والسبب دائماً نقصُ محتوى، وله حلٌّ بيده. */
      const card = (g, ic, t, sub, on, why) => `<button class="gm-card" data-g="${g}" ${on ? "" : "disabled"}><span class="gm-ic">${ic}</span><b>${t}</b><small>${on ? sub : "🔒 " + why}</small></button>`;
      const NEED_IMG = "تحتاج صورتين — ارفعهما في 📎 المرفقات ويصير اسم الملف هو الجواب";
      box.innerHTML = `<div class="live-stage"><div class="stage-bar"><span style="color:#fff;font-weight:800">🎮 ألعاب الدرس${d ? ": " + esc(d.title) : ""}</span><span style="color:#9fb0c4;font-size:12px;margin-inline-start:auto">${imgs.length ? "من صور الدرس ومصطلحاته وقصته" : "ارفع صور الدرس في 📎 المرفقات لتنفتح ألعاب الصور"}</span></div>
        <div class="gm-menu" ${hero ? `style="background-image:linear-gradient(rgba(10,20,32,.8),rgba(10,20,32,.96)),url('${hero.img}')"` : ""}>
          ${card("guess", "🖼️", "خمّن الصورة", "تنكشف الصورة قطعة قطعة… من يعرفها أولاً يفوز بأكثر النقاط", imgs.length >= 2, NEED_IMG)}
          ${card("memory", "🧠", "الذاكرة المصوّرة", imgs.length >= 2 ? "أربع بطاقات سريعة: طابق الصورة باسمها" : "أربع بطاقات سريعة: طابق المصطلح بتعريفه", imgs.length >= 2 || vocab.length >= 2, "تحتاج مصطلحين في الدرس أو صورتين في 📎 المرفقات")}
          ${card("riddle", "🔤", "من أنا؟", "لغز المصطلح: تعريف وحروف مخفية… خمّن قبل أن تُكشف الحروف", vocab.length >= 3, "تحتاج ثلاثة مصطلحات في الدرس")}
          ${card("order", "🧩", "رتّب القصة", "مشهد واحد في كل خطوة: أيّها أولاً؟ ثم ماذا بعده؟", scenes.length >= 3, "تحتاج قصةً من ثلاثة مشاهد")}
          ${card("teams", "⚔️", "تحدّي الفرق", "الفريق الأخضر ضد الذهبي: مؤقّت، سرقة السؤال، وعجلة تختار المجيب", bank.length >= 4, "تحتاج أربعة أسئلة في بنك الدرس")}
          ${card("match", "🔗", "مطابقة المصطلحات", "صِل كل مصطلح بتعريفه ضد الساعة", vocab.length >= 3, "تحتاج ثلاثة مصطلحات في الدرس")}
          ${card("ladder", "🪜", "سلّم المليون", "اصعد بالإجابات الصحيحة ومعك مساعدة 50:50", bank.length >= 3, "تحتاج ثلاثة أسئلة في بنك الدرس")}
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
          gameWait(() => { ri++; round(); }, 1700);
        }
        box.querySelectorAll(".qz-opt-card").forEach(b => b.onclick = () => { if (locked) return; if (opts[+b.dataset.k] === it.cap) settle(true); else { b.classList.add("no"); b.onclick = null; left = Math.max(0, left - 2); reveal(2); } });
      }
      round();
    }
    // 🧠 الذاكرة المصوّرة — صورة ↔ اسمها (أو مصطلح ↔ تعريف)
    /* 🧠 الذاكرة المصوّرة — زوجان فقط (أربع بطاقات) افتراضياً:
       جولة الحصة يجب أن تنتهي في نصف دقيقة لا في خمس دقائق، والمعلم يزيد العدد بنفسه إن أراد.
       والمطابقة صورة باسمها دائماً ما دامت للدرس صور (تُجمع من صور الدرس ومن مشاهد القصة)،
       ولا يُلجأ إلى مصطلح+تعريف إلا إذا خلا الدرس من الصور تماماً. */
    let memoPairs = 2;
    function memoSource() {
      const pics = [];
      (imgs || []).forEach(x => { if (x && x.img && x.cap) pics.push({ img: x.img, cap: x.cap }); });
      (scenes || []).forEach(x => { if (x && x.img && x.t && !pics.some(p => p.img === x.img)) pics.push({ img: x.img, cap: x.t }); });
      return pics;
    }
    function memory() {
      const pics = memoSource(), withPics = pics.length >= 2;
      const n = Math.max(2, Math.min(memoPairs, withPics ? pics.length : (vocab || []).length));
      let pairs;
      if (withPics) pairs = shuffle(pics).slice(0, n).map((x, i) => ({ id: i, a: `<img src="${x.img}" alt="">`, b: `<b>${esc(x.cap)}</b>` }));
      else pairs = shuffle(vocab).slice(0, n).map((v, i) => ({ id: i, a: `<b>${esc(v.t)}</b>`, b: `<small>${esc(v.d)}</small>` }));
      const cards = shuffle(pairs.flatMap(p => [{ id: p.id, h: p.a, k: "a" }, { id: p.id, h: p.b, k: "b" }]));
      let open = [], found = 0, moves = 0; const t0 = Date.now(); let lock = false;
      const maxP = withPics ? pics.length : (vocab || []).length;
      const sizeBtn = [2, 3, 4].filter(k => k <= maxP).map(k => `<button class="live-btn mm-size${k === n ? " on" : ""}" data-p="${k}">${k * 2} بطاقات</button>`).join("");
      box.innerHTML = `<div class="live-stage">${bar("🧠 الذاكرة المصوّرة", `<span class="gm-hud" id="gm-hud" style="margin-inline-start:auto"></span>`)}
        <div class="gm-body"><div class="gm-pickrow">${pickBtn}<span class="btip" style="margin:0">${withPics ? "اقلب بطاقتين: الصورة واسمها" : "اقلب بطاقتين: المصطلح وتعريفه"}</span>${sizeBtn}</div>
        <div class="mm-grid" style="--n:${cards.length <= 4 ? 2 : 4};max-width:${cards.length <= 4 ? "460px" : "820px"}">${cards.map((cd, i) => `<button class="mm-card" data-i="${i}"><div class="mm-in"><div class="mm-face mm-back">?</div><div class="mm-face mm-front">${cd.h}</div></div></button>`).join("")}</div></div></div>`;
      box.querySelector("#gm-back").onclick = menu; wirePick();
      box.querySelectorAll(".mm-size").forEach(b2 => b2.onclick = () => { memoPairs = +b2.dataset.p; memory(); });
      const hud = box.querySelector("#gm-hud"); const tick = () => { hud.textContent = `⏱ ${fmtT((Date.now() - t0) / 1000)} · محاولات ${moves} · ${found}/${pairs.length}`; }; tick(); gameIv = setInterval(tick, 500);
      box.querySelectorAll(".mm-card").forEach(b => b.onclick = () => {
        if (lock || b.classList.contains("flip") || b.classList.contains("done")) return;
        b.classList.add("flip"); open.push(b);
        if (open.length === 2) {
          moves++; lock = true; const [x, y] = open; const same = cards[+x.dataset.i].id === cards[+y.dataset.i].id;
          gameWait(() => { if (same) { x.classList.add("done"); y.classList.add("done"); found++; confetti(); } else { x.classList.remove("flip"); y.classList.remove("flip"); } open = []; lock = false; tick(); if (found === pairs.length) { stopGame(); gameWait(() => finish("🧠 الذاكرة المصوّرة", `أنهيتم ${pairs.length} أزواج في ${fmtT((Date.now() - t0) / 1000)} بـ${moves} محاولة`), 500); } }, same ? 350 : 900);
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
        box.querySelector("#rd-letter").onclick = () => { if (solved || !hidden.size) return; const arr = [...hidden]; hidden.delete(arr[Math.floor(Math.random() * arr.length)]); w.innerHTML = draw(); pts.textContent = "النقاط الآن: " + (10 + hidden.size * 5); if (!hidden.size) { pts.innerHTML = `<span class="gm-fb no">انكشفت كلها — الجواب: ${esc(term)}</span>`; solved = true; gameWait(() => { i++; show(); }, 1500); } };
        box.querySelector("#rd-got").onclick = () => { if (solved) return; solved = true; const gain = 10 + hidden.size * 5; total += gain; hidden.clear(); w.innerHTML = draw(); pts.innerHTML = `<span class="gm-fb ok">✅ ${esc(term)} — +${gain}</span>`; confetti(); gameWait(() => { i++; show(); }, 1500); };
        box.querySelector("#rd-skip").onclick = () => { i++; show(); };
      }
      show();
    }
    /* 🧩 رتّب القصة — سؤال واحد في كل خطوة.
       الشكل السابق (ست بطاقات تُرتَّب دفعة واحدة ثم «تحقّق») كان فوق طاقة طفل أمام الفصل:
       ذاكرة عاملة لست جُمل، وبلا أي تغذية راجعة حتى النهاية، فيخطئ في واحدة فيبدو كأنه أخطأ في الكل.
       الآن: «أيّها يأتي أولاً؟» ثم «وماذا بعده؟» — اختيار واحد، وجواب فوري، والمشهد الصحيح ينضم إلى شريط القصة. */
    let odCount = 4;
    function order() {
      const all = scenes.map((s, k) => ({ k, s })).filter(x => x.s && (x.s.t || x.s.img));
      const n = Math.max(3, Math.min(odCount, all.length));
      const src = all.slice(0, n);
      let step = 0, tries = 0, wrong = 0;
      let rest = shuffle(src.slice());
      const face = (x, small) => `${x.s.img ? `<img src="${x.s.img}" alt="">` : `<div class="od-emo">${x.s.v || "📘"}</div>`}${small ? "" : `<div class="od-t">${esc(x.s.t)}</div>`}`;
      function draw() {
        const done = src.slice(0, step);
        const sizeBtn = [3, 4, 5, 6].filter(k => k <= all.length).map(k => `<button class="live-btn od-size${k === n ? " on" : ""}" data-n="${k}">${k} مشاهد</button>`).join("");
        box.innerHTML = `<div class="live-stage">${bar("🧩 رتّب القصة", `<span class="gm-hud" id="gm-hud" style="margin-inline-start:auto">${step}/${src.length} · محاولات ${tries}</span>`)}
          <div class="gm-body"><div class="gm-pickrow">${pickBtn}${sizeBtn}<button class="live-btn" id="od-reset">↺ من البداية</button></div>
          <div class="od-strip">${done.length ? done.map((x, i) => `<div class="od-done"><span class="od-n">${i + 1}</span>${face(x, true)}<div class="od-t">${esc(x.s.t)}</div></div>`).join('<span class="od-arrow">←</span>') : `<div class="od-empty">شريط القصة فارغ… ابدأ بالمشهد الأول</div>`}</div>
          <div class="gm-q" id="od-ask">${step === 0 ? "أيّ مشهد يأتي <b>أولاً</b>؟" : `وماذا يأتي <b>بعد</b> «${esc(src[step - 1].s.t)}»؟`}</div>
          <div class="od-grid">${rest.map((x, i) => `<button class="od-card" data-k="${x.k}"><span class="od-n">؟</span>${face(x)}</button>`).join("")}</div></div></div>`;
        box.querySelector("#gm-back").onclick = menu; wirePick();
        box.querySelectorAll(".od-size").forEach(b2 => b2.onclick = () => { odCount = +b2.dataset.n; order(); });
        box.querySelector("#od-reset").onclick = () => order();
        box.querySelectorAll(".od-card").forEach(cd => cd.onclick = () => {
          if (cd.classList.contains("no") || cd.classList.contains("ok")) return;
          tries++;
          const k = +cd.dataset.k, want = src[step].k;
          if (k === want) {
            cd.classList.add("ok"); confetti();
            rest = rest.filter(x => x.k !== k); step++;
            gameWait(() => { if (step >= src.length) { confetti(); finish("🧩 رتّب القصة", `القصة اكتملت! ${src.length} مشاهد بترتيبها`, wrong ? `بعد ${tries} محاولة` : "من أول مرة بلا خطأ 🌟"); } else draw(); }, 700);
          } else {
            wrong++; cd.classList.add("no");
            const ask = box.querySelector("#od-ask");
            if (ask && !ask.querySelector(".gm-fb")) ask.insertAdjacentHTML("beforeend", `<div class="gm-fb no">ليس هذا — انظر إلى الصورة وفكّر ماذا يحدث ${step === 0 ? "في البداية" : "بعدها"}</div>`);
            gameWait(() => cd.classList.remove("no"), 900);
          }
          const hud = box.querySelector("#gm-hud"); if (hud) hud.textContent = `${step}/${src.length} · محاولات ${tries}`;
        });
      }
      draw();
    }
    // ⚔️ تحدّي الفرق — الأخضر ضد الذهبي
    function teams() {
      const qs = shuffle(bank.filter(q => q.t !== "fill")).slice(0, 10);
      /* لاعب واحد لكل فريق باسمه: الأخضر يميناً والذهبي يساراً (الترتيب في RTL).
         الاختيار من الحاضرين، وينحاز لمن لم يشارك بعد في الحصة حتى تدور المشاركة على الجميع. */
      const T = [{ n: "الفريق الأخضر", cl: "g", s: 0, si: null }, { n: "الفريق الذهبي", cl: "y", s: 0, si: null }];
      const nameOfSi = (i) => (i == null || !c.students[i]) ? "" : c.students[i].n;
      function pickPlayers() {
        const pool = activeStudents(c).map(x => x.i).filter(i => !liveAway(i));
        const list = pool.length >= 2 ? pool : activeStudents(c).map(x => x.i);
        const fresh = list.filter(i => !liveTurns.done.has(i));
        const bag = fresh.length >= 2 ? fresh : list;
        const sh = shuffle(bag.slice());
        T[0].si = sh[0] != null ? sh[0] : null;
        T[1].si = sh.find(i => i !== T[0].si);
        if (T[1].si == null) T[1].si = sh[1] != null ? sh[1] : null;
        [T[0].si, T[1].si].forEach(i => { if (i != null) liveTurns.done.add(i); });
      }
      pickPlayers();
      let qi = 0, turn = 0, left = 15, steal = false, t0 = 0;
      function show() {
        stopGame();
        const it = qs[qi];
        if (!it) {
          const w = T[0].s === T[1].s ? null : (T[0].s > T[1].s ? T[0] : T[1]); confetti();
          const nm = (x) => x.si != null ? `${x.n} (${esc(nameOfSi(x.si))})` : x.n;
          finish("⚔️ تحدّي الفرق", w ? `🏆 الفائز: ${w.si != null ? esc(nameOfSi(w.si)) : w.n}` : "🤝 تعادل!", `${nm(T[0])} ${T[0].s} — ${nm(T[1])} ${T[1].s}`);
          // تقييم فوري للمتنافسَين من شاشة النتيجة (رصد حقيقي في سجل اليوم)
          const body = box.querySelector(".gm-body") || box;
          const row = document.createElement("div"); row.className = "gm-award"; row.style.marginTop = "10px";
          row.innerHTML = T.filter(x => x.si != null).map(x => `<button class="live-btn tm-eval" data-i="${x.si}">⭐ قيّم ${esc(nameOfSi(x.si))}</button>`).join(" ")
            + ` <button class="live-btn" id="tm-again">🔁 متنافسان جديدان</button>`;
          body.appendChild(row);
          row.querySelectorAll(".tm-eval").forEach(b2 => b2.onclick = () => {
            const i2 = +b2.dataset.i; applyLive(i2, "part"); b2.textContent = "✔ سُجّلت لـ " + nameOfSi(i2); b2.disabled = true; confetti();
          });
          const ag = row.querySelector("#tm-again"); if (ag) ag.onclick = () => teams();
          return;
        }
        left = 15; steal = false; t0 = Date.now();
        const teamBox = (x, on) => `<div class="tm-team ${x.cl} ${on ? "on" : ""}"><b>${x.n}</b>${x.si != null ? `<i class="tm-pl">${esc(nameOfSi(x.si))}</i>` : ""}<span>${x.s}</span></div>`;
        const head = () => `<div class="tm-board">${teamBox(T[0], turn === 0)}<div class="tm-vs">${steal ? "🕵️ فرصة سرقة" : "دور"}</div>${teamBox(T[1], turn === 1)}</div>`;
        box.innerHTML = `<div class="live-stage">${bar("⚔️ تحدّي الفرق", `<span class="gm-hud" style="margin-inline-start:auto">سؤال ${qi + 1}/${qs.length}</span>`)}
          <div class="gm-body gm-center"><div id="tm-head">${head()}</div>
          <div class="gm-pickrow"><button class="live-btn" id="tm-swap">🔁 غيّر المتنافسين</button><span class="btip" style="margin:0">${T[0].si != null && T[1].si != null ? `${esc(nameOfSi(T[0].si))} ضد ${esc(nameOfSi(T[1].si))}` : "اختر متنافسين"}</span></div>
          <div class="gm-timer"><div id="gm-tf" style="width:100%"></div></div>
          ${it.img ? `<img class="q-img" src="${it.img}" alt="">` : ""}<div class="gm-stmt" id="gm-stmt">${esc(it.q)}</div>
          <div class="qz-grid" style="width:100%">${it.opts.map((o, k) => o ? `<button class="qz-opt-card" data-k="${k}">${it.t === "tf" ? "" : L[k] + ". "}${esc(o)}</button>` : "").join("")}</div></div></div>`;
        box.querySelector("#gm-back").onclick = menu;
        const sw = box.querySelector("#tm-swap"); if (sw) sw.onclick = () => { pickPlayers(); show(); };
        const fill = box.querySelector("#gm-tf"), headEl = box.querySelector("#tm-head");
        const startTimer = (secs) => { stopGame(); left = secs; fill.style.width = "100%"; gameIv = setInterval(() => { left -= 0.1; fill.style.width = Math.max(0, left / secs * 100) + "%"; if (left <= 0) timeout(); }, 100); };
        const next = () => gameWait(() => { qi++; turn = 1 - turn; show(); }, 1500);
        function timeout() { stopGame(); box.querySelectorAll(".qz-opt-card").forEach(b => { b.onclick = null; if (+b.dataset.k === it.correct) b.classList.add("ok"); }); box.querySelector("#gm-stmt").insertAdjacentHTML("beforeend", `<div class="gm-fb no">⏰ انتهى الوقت</div>`); next(); }
        function wire() {
          box.querySelectorAll(".qz-opt-card").forEach(b => b.onclick = () => {
            const ok = +b.dataset.k === it.correct; b.classList.add(ok ? "ok" : "no"); stopGame();
            if (ok) { const fast = (Date.now() - t0) < 5000 && !steal; const gain = steal ? 5 : (10 + (fast ? 5 : 0)); T[turn].s += gain; confetti(); box.querySelector("#gm-stmt").insertAdjacentHTML("beforeend", `<div class="gm-fb ok">✅ +${gain} لصالح ${T[turn].si != null ? esc(nameOfSi(T[turn].si)) : T[turn].n}${fast ? " (سرعة!)" : ""}</div>`); headEl.innerHTML = head(); box.querySelectorAll(".qz-opt-card").forEach(x => x.onclick = null); next(); return; }
            if (!steal) { steal = true; turn = 1 - turn; headEl.innerHTML = head(); b.onclick = null; box.querySelector("#gm-stmt").insertAdjacentHTML("beforeend", `<div class="gm-fb no">❌ خطأ — الفرصة الآن لـ ${T[turn].si != null ? esc(nameOfSi(T[turn].si)) : T[turn].n} (8 ثوانٍ)</div>`); t0 = Date.now(); startTimer(8); return; }
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
        else { b.classList.add("bad"); tb.classList.add("bad"); score = Math.max(0, score - 2); gameWait(() => { b.classList.remove("bad"); tb.classList.remove("bad"); }, 450); }
        tick();
        if (done === pairs.length) { stopGame(); confetti(); const tt = fmtT((Date.now() - t0) / 1000); gameWait(() => finish("🔗 مطابقة المصطلحات", `أنهيتم ${pairs.length} مطابقات في ${tt} — النقاط ${score}`), 600); }
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
          if (ok) { confetti(); lvl++; qi++; gameWait(draw, 1100); }
          else { const r = box.querySelector(`.qz-opt-card[data-k="${it.correct}"]`); if (r) r.classList.add("ok"); box.querySelector("#gm-stmt").insertAdjacentHTML("beforeend", `<div class="gm-fb no">❌ للأسف… نعود إلى أول السلّم</div>`); gameWait(() => { lvl = 0; qi++; qs = shuffle(qs); draw(); }, 1800); }
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
      const e = recsCid[date][i]; if (emptyRec(e)) return; let p = 0;
      if (e.a != null && STATES[e.a]) p += +STATES[e.a].pts || 0;
      if (e.part) p += e.part * W.part; if (e.hw === 1) p += W.hw; if (e.sh) p += e.sh * W.sheets;
      (e.beh || []).forEach(bi => { if (BEH[bi]) p += +BEH[bi].pts || 0; });
      out.push({ date, p: Math.round(p * 10) / 10 });
    });
    return out;
  }
  const trendOf = (ser) => { if (ser.length < 4) return ""; const h = Math.ceil(ser.length / 2); const a = ser.slice(0, h).reduce((x, y) => x + y.p, 0) / h, b = ser.slice(h).reduce((x, y) => x + y.p, 0) / (ser.length - h); return b > a + 0.5 ? "📈 في تحسّن" : b < a - 0.5 ? "📉 يحتاج متابعة" : "➡️ مستقر"; };
  // كل مواد الفصل من السحابة: [{tid, subject, tname, recs, grades}] — وفي المحلي مادتي فقط
  /* مواد الطالب عبر كل معلميه. الاحتياطي المحلي كان مشروطاً بـ !TE.admin، فتفتح «البطاقة
     الشاملة» و«المستويات» فارغة تماماً للمدير في الوضع التجريبي («0 مواد مرصودة» وجدول فارغ)
     بينما صفّ الطالب نفسه يعرض نقاطاً. ويُعلَّم فشل القراءة السحابية بدل بطاقة خالية صامتة. */
  async function classDocs(cid) {
    const out = []; let failed = false;
    if (CLOUD && fdb) {
      try {
        const [rs, gs] = await Promise.all([fdb.collection("recs").get(), fdb.collection("grades").get()]);
        const byT = {}; const suf = "_" + cid;
        rs.forEach(x => { if (x.id.endsWith(suf)) { const tid = x.id.slice(0, -suf.length); byT[tid] = byT[tid] || {}; byT[tid].recs = (x.data() || {}).d || {}; } });
        gs.forEach(x => { if (x.id.endsWith(suf)) { const tid = x.id.slice(0, -suf.length); byT[tid] = byT[tid] || {}; byT[tid].grades = (x.data() || {}).g || {}; } });
        Object.keys(byT).forEach(tid => { const t = D.teachers.find(z => z.id === tid); out.push({ tid, subject: t ? t.subject : tid, tname: t ? t.name : "", recs: byT[tid].recs || {}, grades: byT[tid].grades || {} }); });
      } catch (e) { failed = true; }
    }
    if (!out.length && TE && (DB.recs[cid] || DB.grades[cid])) {
      /* صاحب الرصد لا المُطَّلِع عليه: DB.by["recs:cid"] يكتبه save() عند كل حفظ تجريبي، وهو
         مصدر النسبة نفسه الذي تستعمله لوحة المدير (js/admin/core.js) — فلا تُنسب مادة زميل
         إلى المدير في بطاقة الطالب بينما اللوحة تنسبها إلى صاحبها. */
      const by = (DB.by && typeof DB.by === "object" && !Array.isArray(DB.by)) ? DB.by : {};
      const oid = by["recs:" + cid] || by["grades:" + cid] || "";
      const ot = (D.teachers || []).find(x => x.id === oid)
        || (((TE.classes || []).indexOf(cid) >= 0) ? TE : null)
        || (D.teachers || []).find(x => !x.admin && (x.classes || []).indexOf(cid) >= 0)
        || TE;
      out.push({ tid: ot.id, subject: ot.subject, tname: ot.name, recs: DB.recs[cid] || {}, grades: DB.grades[cid] || {} });
    }
    try { Object.defineProperty(out, "failed", { value: failed, enumerable: false }); } catch (e) { }
    return out;
  }
  const maxTotal = () => ASSESS.reduce((a, b) => a + b.max, 0);
  /* تعريفٌ واحد لـ«المستوى العام» يستهلكه الثلاثة: بطاقة تقدّم الطالب، ولوحة المدير
     (admin/core.js:aggStudent)، وشاشة وليّ الأمر في البوابة. موزونٌ بحجم المرصود
     (Σtot/Σmax) لا متوسطَ نسبٍ: مادةٌ رُصد فيها بندٌ واحد لا تعادل مادةً برصد سبعة.
     كان المعروض لوليّ الأمر رقماً وللمعلم رقماً آخر تحت العنوان نفسه. */
  const overallPct = (rows) => {
    let tot = 0, mx = 0;
    (rows || []).forEach(r => { if (r && +r.mx > 0) { tot += (+r.tot || 0); mx += (+r.mx); } });
    return mx > 0 ? Math.round(tot / mx * 100) : null;
  };
  const pctCell = (p) => p == null ? '<td style="color:#bbb">—</td>' : `<td style="background:${p >= 90 ? "#dff5e3" : p >= 75 ? "#eef7dd" : p >= 60 ? "#fff6d6" : p >= 50 ? "#ffe9d6" : "#ffd9d9"}"><b>${Math.round(p)}</b></td>`;
  async function studentProgress(cid, i) {
    const c = classById(cid), s = c.students[i];
    openSheet(`<h4>📈 تقدّم الطالب: ${esc(s.n)}</h4><div style="color:var(--muted);font-size:13px;text-align:center;margin-bottom:8px">${esc(c.name)} — ${esc(META.school.name)}</div><div id="pg-body"><div class="empty-note">جارِ جمع البيانات من كل المواد…</div></div>
      <div class="sheet-actions"><button class="btn-plain" onclick="window._printSheet()">🖨️ طباعة</button><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, async (o) => {
      const docs = await classDocs(cid), maxTot = maxTotal();
      const rows = docs.map(dc => { const t = calcStudent(cid, i, dc.recs); const hasG = hasGrades(cid, i, dc.grades, dc.recs); const gt = hasG ? gradeTotal(cid, i, dc.grades, dc.recs) : null; const gm = hasG ? gradedMax(cid, i, dc.grades, dc.recs) : 0; return { ...dc, t, hasG, gt, gm, pct: hasG ? gradePct(cid, i, dc.grades, dc.recs) : null, att: attPct(t), series: daySeries(dc.recs, i) }; });
      const mine = rows.find(r => TE && r.tid === TE.id) || rows[0];
      const overall = overallPct(rows.filter(r => r.pct != null).map(r => ({ tot: r.gt, mx: r.gm })));
      const bars = (ser) => { const last = ser.slice(-14); const mx = Math.max(5, ...last.map(x => Math.abs(x.p))); return `<div class="pg-bars">${last.map(x => `<div class="pg-bar" title="${x.date}: ${x.p}"><div style="height:${Math.round(Math.abs(x.p) / mx * 100)}%;background:${x.p >= 0 ? "var(--ok)" : "var(--bad)"}"></div><small>${x.date.slice(5).replace("-", "/")}</small></div>`).join("")}</div>`; };
      const b = o.querySelector("#pg-body"); if (!b) return;
      if (!rows.length) {
        b.innerHTML = docs.failed
          ? '<div class="empty-note">تعذّر جلب مواد الطالب من السحابة — تحقق من الاتصال ثم أعد فتح البطاقة.</div>'
          : '<div class="empty-note">لا رصد لهذا الطالب في أي مادة بعد.</div>';
        return;
      }
      b.innerHTML = `
        <div class="statrow"><div class="stat"><div class="v">${overall != null ? overall + "%" : "—"}</div><div class="l">المعدل العام</div></div><div class="stat"><div class="v" style="font-size:14px">${overall != null ? esc(levelOf(overall).t) : "—"}</div><div class="l">المستوى العام</div></div><div class="stat"><div class="v">${rows.length}</div><div class="l">مواد مرصودة</div></div><div class="stat"><div class="v">${mine && mine.att != null ? mine.att + "%" : "—"}</div><div class="l">حضور ${esc(mine ? mine.subject : "")}</div></div></div>
        ${mine ? `<div style="font-weight:800;color:var(--navy);margin:8px 0 4px">نقاط ${esc(mine.subject)} في الحصص الأخيرة — ${trendOf(mine.series) || "بداية الرصد"}</div>${mine.series.length ? bars(mine.series) : '<div class="empty-note">لا رصد بعد</div>'}` : ""}
        <div class="table-scroll" style="margin-top:10px"><table class="report-table"><tr><th style="min-width:110px">المادة</th><th>النقاط</th><th>الحضور</th><th>الدرجة</th><th>المستوى</th><th>الاتجاه</th></tr>
        ${rows.map(r => `<tr><td class="nm">${esc(r.subject)}<br><small style="color:var(--muted)">${esc(r.tname)}</small></td><td><b>${r.t.pts}</b></td><td>${r.att != null ? r.att + "%" : "—"}</td><td>${r.hasG ? r.gt + "/" + r.gm : "—"}</td>${r.pct != null ? `<td>${esc(levelOf(r.pct).t)}</td>` : "<td>—</td>"}<td>${trendOf(r.series) || "—"}</td></tr>`).join("")}</table></div>
        <div class="empty-note" style="padding:6px">الدرجة والمستوى من البنود المرصودة حتى الآن (من أصل ${maxTot} عند اكتمال الرصد)</div>
        ${!CLOUD ? '<div class="empty-note" style="padding:8px">في النسخة السحابية تظهر كل مواد الطالب من جميع معلميه</div>' : ""}`;
    });
  }
  // 📊 لوحة المدير: مستويات الطلاب حسب المادة وكل المواد
  async function adminLevels() {
    const cls = D.classes.slice().sort((a, b) => (a.gc - b.gc) || a.name.localeCompare(b.name)); let cur = cls[0].id;
    openSheet(`<h4>📊 مستويات الطلاب — كل المواد</h4><div class="class-chips" id="al-chips">${cls.map(x => `<button class="chip ${x.id === cur ? "on" : ""}" data-c="${x.id}">${esc(x.name)}</button>`).join("")}</div><div id="al-body"></div>
      <div class="sheet-actions" style="flex-wrap:wrap"><button class="btn-gold" id="al-school" style="flex:1 1 100%">🏫 ملخص المدرسة حسب المادة</button><button class="btn-plain" onclick="window._printSheet()">🖨️ طباعة</button><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, (o) => {
      const body = o.querySelector("#al-body");
      async function build() {
        body.innerHTML = '<div class="empty-note">جارِ التحليل…</div>';
        const c = classById(cur), docs = await classDocs(cur), maxTot = maxTotal();
        if (!docs.length) { body.innerHTML = '<div class="empty-note">لا رصد لهذا الفصل بعد</div>'; return; }
        const rows = activeStudents(c).map(({ s, i }) => { const per = docs.map(dc => { const has = hasGrades(cur, i, dc.grades, dc.recs); const pct = has ? gradePct(cur, i, dc.grades, dc.recs) : null; const t = calcStudent(cur, i, dc.recs); return { pct, pts: t.pts }; }); const ps = per.filter(x => x.pct != null).map(x => x.pct); const avg = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null; const pts = Math.round(per.reduce((a, x) => a + x.pts, 0) * 10) / 10; return { s, i, per, avg, pts }; }).sort((a, b) => ((b.avg == null ? -1 : b.avg) - (a.avg == null ? -1 : a.avg)) || b.pts - a.pts);
        body.innerHTML = `<div class="table-scroll"><table class="report-table"><tr><th>م</th><th style="min-width:140px">الطالب</th>${docs.map(dc => `<th>${esc(dc.subject)}</th>`).join("")}<th>المعدل</th><th>المستوى</th><th>النقاط</th></tr>
          ${rows.map((r, k) => `<tr class="al-row" data-i="${r.i}" style="cursor:pointer"><td>${k + 1}</td><td class="nm">${esc(r.s.n)}</td>${r.per.map(x => pctCell(x.pct)).join("")}${pctCell(r.avg)}<td>${r.avg != null ? esc(levelOf(r.avg).t) : "—"}</td><td>${r.pts}</td></tr>`).join("")}
          <tr class="tot"><td></td><td class="nm">متوسط الفصل</td>${docs.map((dc, j) => { const v = rows.map(r => r.per[j].pct).filter(x => x != null); return pctCell(v.length ? v.reduce((a, b) => a + b, 0) / v.length : null); }).join("")}<td></td><td></td><td></td></tr></table></div>
          <div class="empty-note" style="padding:6px">النسب من البنود المرصودة حتى الآن (من أصل ${maxTot} عند اكتمال الرصد) — انقر اسم الطالب لتقدّمه التفصيلي في كل المواد</div>`;
        body.querySelectorAll(".al-row").forEach(tr => tr.onclick = () => studentProgress(cur, +tr.dataset.i));
      }
      o.querySelectorAll("#al-chips .chip").forEach(ch => ch.onclick = () => { cur = ch.dataset.c; o.querySelectorAll("#al-chips .chip").forEach(x => x.classList.toggle("on", x === ch)); build(); });
      o.querySelector("#al-school").onclick = schoolSummary;
      build();
    });
  }
  async function schoolSummary() {
    openSheet(`<h4>🏫 ملخص المدرسة حسب المادة</h4><div id="ss-body"><div class="empty-note">جارِ التحليل…</div></div><div class="sheet-actions"><button class="btn-plain" onclick="window._printSheet()">🖨️ طباعة</button><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, async (o) => {
      const body = o.querySelector("#ss-body"); const maxTot = maxTotal(), bySub = {};
      let rs, gs; try { if (!CLOUD || !fdb) throw 0; [rs, gs] = await Promise.all([fdb.collection("recs").get(), fdb.collection("grades").get()]); } catch (e) { body.innerHTML = '<div class="empty-note">يتطلب النسخة السحابية المشتركة</div>'; return; }
      const gmap = {}; gs.forEach(x => gmap[x.id] = (x.data() || {}).g || {});
      rs.forEach(x => {
        const k = x.id.indexOf("_"); const tid = x.id.slice(0, k), cid = x.id.slice(k + 1); const t = D.teachers.find(z => z.id === tid); const c = classById(cid); if (!t || !c) return;
        const sub = t.subject; bySub[sub] = bySub[sub] || { n: 0, lv: [0, 0, 0, 0, 0], att: [], cls: {} };
        const recs = (x.data() || {}).d || {}; const g = gmap[x.id] || {};
        activeStudents(c).forEach(({ s, i }) => { const tt = calcStudent(cid, i, recs); const a = attPct(tt); if (a != null) bySub[sub].att.push(a); if (hasGrades(cid, i, g, recs)) { const p = gradePct(cid, i, g, recs); if (p == null) return; bySub[sub].n++; bySub[sub].lv[levelOf(p).i]++; (bySub[sub].cls[c.name] = bySub[sub].cls[c.name] || []).push(p); } });
      });
      const LV = ["ممتاز", "جيد جداً", "جيد", "مقبول", "دون المطلوب"];
      body.innerHTML = Object.keys(bySub).length ? `<div class="table-scroll"><table class="report-table"><tr><th style="min-width:110px">المادة</th><th>بدرجات</th>${LV.map(l => `<th>${l}</th>`).join("")}<th>الحضور</th><th>أعلى فصل</th><th>أدنى فصل</th></tr>${Object.entries(bySub).map(([sub, v]) => { const ca = Object.entries(v.cls).map(([n, arr]) => ({ n, a: arr.reduce((a, b) => a + b, 0) / arr.length })).sort((a, b) => b.a - a.a); const att = v.att.length ? Math.round(v.att.reduce((a, b) => a + b, 0) / v.att.length) + "%" : "—"; return `<tr><td class="nm">${esc(sub)}</td><td>${v.n}</td>${v.lv.map(x => `<td>${x || ""}</td>`).join("")}<td>${att}</td><td>${ca.length ? esc(ca[0].n) + " " + Math.round(ca[0].a) + "%" : "—"}</td><td>${ca.length ? esc(ca[ca.length - 1].n) + " " + Math.round(ca[ca.length - 1].a) + "%" : "—"}</td></tr>`; }).join("")}</table></div>` : '<div class="empty-note">لا رصد بعد</div>';
    });
  }
  /* ═══════════ 👥 نقل الطلاب (المدير): إنشاء الحركة → ترحيل البيانات → تطبيقها محلياً ═══════════ */
  // نقاط الطالب مجموعةً من كل معلمي الفصل (سحابياً) أو من رصد هذا الجهاز (محلياً) — null إن لا رصد
  async function classPointsMap(cid) {
    const c = classById(cid); const out = {};
    let docs = []; try { docs = await classDocs(cid); } catch (e) { docs = []; }
    if (!docs.length && DB.recs[cid]) docs = [{ recs: DB.recs[cid] }];
    if (!docs.length) return null;
    activeStudents(c).forEach(({ i }) => { out[i] = Math.round(docs.reduce((a, dc) => a + calcStudent(cid, i, dc.recs).pts, 0) * 10) / 10; });
    return out;
  }
  // ترحيل بيانات الطالب المنقول (رصد/درجات/تواصل) من from[si] إلى to[newSi] لكل معلم يدرّس الفصلين،
  // وللسجل المحلي إن كان المدير معلماً لهما (أو في الوضع التجريبي حيث السجل المحلي هو سجل هذا الجهاز).
  // الكتابة بالدمج والاتحاد (idempotent) فتصلح لإعادة الترحيل بعد فشل جزئي دون تكرار. بصمة المستند تبقى للمعلم صاحبه (tn) مع ts الأصلي إن وُجد.
  /* ترحيل فهرسَي الحساب مع الحركة: sids/{cid} (من سُجّلت هويته) وmkeys/{cid} (مفتاح صندوق
     رسائله). كلاهما مبنيٌّ على (cid, si) لا على هوية ثابتة، وكاتبهما الوحيد كان لوحة تسجيل
     الهويات — فالنقل يُبطلهما: نافذة الإرسال تعدّ الطالب «بلا هوية مسجَّلة»، وmsgSheet تقول
     «لا حساب لهؤلاء الطلاب» وترفض الإرسال، مع أن حساب الطالب حيّ (بصمته باقية والبوابة
     تُدخله بمسار الفصول التي نُقل منها). المفتاح **هو نفسه** ولا يُولَّد جديداً وإلا فقد
     صندوقه. والموضع القديم يصير moved فيخرج من activeStudents، فبقاؤه في فهرس فصله غير ضارّ
     (والقواعد لا تسمح بالإنقاص أصلاً). فشلُ هذا الترحيل لا يُفشل الحركة. */
  async function migrateIndex(from, to, si, nsi) {
    if (!CLOUD || !fdb || !from || !to || to === "out") return { sids: false, mkeys: false };
    const out = { sids: false, mkeys: false };
    try {
      const d = await fdb.doc("sids/" + from).get();
      const raw = d.exists ? ((d.data() || {}).list || []) : [];
      if (raw.map(x => +x).indexOf(si) >= 0) {
        const cur = await fdb.doc("sids/" + to).get();
        const seen = {}, list = [];
        (((cur.exists ? cur.data() : {}) || {}).list || []).concat([nsi]).forEach(v => {
          const n = +v; if (Number.isInteger(n) && n >= 0 && n < 400 && !seen[n]) { seen[n] = 1; list.push(n); }
        });
        list.sort((a, b) => a - b);
        await fdb.doc("sids/" + to).set({ list, n: list.length, tn: (TE || {}).name || "", ts: Date.now() });
        delete sidsCache[to]; delete sidsRawCache[to];
        out.sids = true;
      }
    } catch (e) { }
    try {
      const d = await fdb.doc("mkeys/" + from).get();
      const mk = d.exists ? (((d.data() || {}).k || {})[String(si)]) : null;
      if (mk) {
        const cur = await fdb.doc("mkeys/" + to).get();
        const k = Object.assign({}, ((cur.exists ? cur.data() : {}) || {}).k || {});
        k[String(nsi)] = mk;                              // المفتاح نفسه — لا مفتاحٌ جديد
        await fdb.doc("mkeys/" + to).set({ k, n: Object.keys(k).length, tn: (TE || {}).name || "", ts: Date.now() });
        delete mkeysCache[to]; delete mkeysRawCache[to];
        out.mkeys = true;
      }
    } catch (e) { }
    return out;
  }
  async function migrateMove(m) {
    const res = { teachers: 0, failed: 0, failedNames: [] };
    if (m.to === "out") return res;
    const from = m.from, to = m.to, si = m.si, nsi = m.newSi;
    const both = (t) => (t.classes || []).includes(from) && (t.classes || []).includes(to);
    const recsOf = (d) => { const out = {}; Object.keys(d || {}).forEach(date => { const e = (d[date] || {})[si]; if (e) out[date] = { [nsi]: clone(e) }; }); return out; };
    if (!CLOUD || both(TE)) {
      const md = recsOf(DB.recs[from]);
      if (Object.keys(md).length) { DB.recs[to] = DB.recs[to] || {}; Object.keys(md).forEach(date => { DB.recs[to][date] = DB.recs[to][date] || {}; DB.recs[to][date][nsi] = md[date][nsi]; }); }
      const g = (DB.grades[from] || {})[si];
      if (g && Object.keys(g).length) { DB.grades[to] = DB.grades[to] || {}; DB.grades[to][nsi] = Object.assign({}, DB.grades[to][nsi] || {}, clone(g)); }
      const cm = (DB.comms[from] || []).filter(x => x.si === si).map(x => Object.assign(clone(x), { si: nsi }));
      if (cm.length) DB.comms[to] = mergeComms(DB.comms[to] || [], cm);
      save();
    }
    if (!CLOUD || !fdb) return res;
    try { res.idx = await migrateIndex(from, to, si, nsi); } catch (e) { res.idx = null; }
    for (const t of D.teachers) {
      if (!both(t)) continue;
      const pf = t.id + "_" + from, pt = t.id + "_" + to;
      const stampOf = (snap) => ({ tn: t.name, ts: (snap && snap.exists && typeof (snap.data() || {}).ts === "number") ? snap.data().ts : Date.now() });
      try {
        const [r, g, cs] = await Promise.all([fdb.doc("recs/" + pf).get(), fdb.doc("grades/" + pf).get(), fdb.doc("comms/" + pf).get()]);
        const md = r.exists ? recsOf((r.data() || {}).d) : {};
        if (Object.keys(md).length) { const cur = await fdb.doc("recs/" + pt).get(); await fdb.doc("recs/" + pt).set(Object.assign({ d: md }, stampOf(cur)), { merge: true }); }
        const gi = g.exists ? (((g.data() || {}).g || {})[si] || null) : null;
        if (gi && Object.keys(gi).length) { const cur = await fdb.doc("grades/" + pt).get(); await fdb.doc("grades/" + pt).set(Object.assign({ g: { [nsi]: gi } }, stampOf(cur)), { merge: true }); }
        const items = cs.exists ? ((cs.data() || {}).c || []).filter(x => x.si === si).map(x => Object.assign({}, x, { si: nsi })) : [];
        if (items.length) { const ct = await fdb.doc("comms/" + pt).get(); const list = mergeComms(ct.exists ? ((ct.data() || {}).c || []) : [], items); await fdb.doc("comms/" + pt).set(Object.assign({ c: list.slice(-500) }, stampOf(ct)), { merge: true }); }
        res.teachers++;
      } catch (e) { res.failed++; res.failedNames.push(t.name); }
    }
    return res;
  }
  async function adminMoves() {
    const cls = D.classes.slice().sort((a, b) => (a.gc - b.gc) || a.name.localeCompare(b.name)); let cur = cls[0].id, busy = false;
    openSheet(`<h4>👥 نقل الطلاب بين الفصول</h4>
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px;line-height:1.8">اختر الفصل ثم «نقل إلى…» أو «🚪 خروج». تنتقل كل بيانات الطالب (الرصد اليومي والدرجات وسجل التواصل) لدى كل معلم يدرّس الفصلين، ويختفي من فصله القديم في كل الشاشات وعلى كل الأجهزة عند فتح التطبيق.</div>
      <div class="class-chips" id="mv-chips">${cls.map(x => `<button class="chip ${x.id === cur ? "on" : ""}" data-c="${x.id}">${esc(x.name)}</button>`).join("")}</div>
      <div id="mv-msg" class="empty-note" style="padding:0 2px 6px;text-align:right;min-height:0"></div>
      <div id="mv-body"><div class="empty-note">جارِ التحميل…</div></div>
      <div style="border-top:1px solid var(--line);margin-top:12px;padding-top:8px"><b style="color:var(--navy)">🕘 آخر الحركات</b><div id="mv-log"></div></div>
      <div class="sheet-actions"><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, (o) => {
      const body = o.querySelector("#mv-body"), msg = o.querySelector("#mv-msg"), log = o.querySelector("#mv-log");
      const nameOf = (cid) => cid === "out" ? "خارج المدرسة" : isNewFrom(cid) ? NEW_LBL : ((classById(cid) || {}).name || cid);
      const persist = () => { if (!CLOUD) { DB.moves = D.moves; save(); } else saveCloudD(); };
      function drawLog() {
        const mv = (D.moves || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 10);
        log.innerHTML = mv.length ? mv.map(m => `<div class="comm-item" data-id="${esc(m.id || "")}"><b>${esc(m.name)}</b> — ${esc(nameOf(m.from))} ← ${esc(nameOf(m.to))}${m.conflict ? ' <span style="color:var(--bad)">⚠️ لم تُطبَّق: الموضع محجوز بحركة أخرى — الطالب باقٍ في فصله، أعد نقله</span>' : ""}${m.migFailed && m.migFailed.length ? ` <span style="color:var(--bad)">⚠️ تعذّر ترحيل بياناته لدى: ${esc(m.migFailed.join("، "))}</span>` : ""}<div class="meta">${esc(m.tn || "")} — ${esc(hijriLabel(new Date(m.ts || 0)))}${m.to !== "out" && !m.conflict ? ` · <button class="btn-plain mv-redo" data-id="${esc(m.id || "")}" style="padding:2px 8px;font-size:12px">🔁 إعادة الترحيل</button>` : ""}</div></div>`).join("") : '<div class="empty-note" style="padding:8px">لا حركات بعد</div>';
        log.querySelectorAll(".mv-redo").forEach(b => b.onclick = () => redo(b.dataset.id));
      }
      // إعادة ترحيل حركة مسجَّلة (بعد فشل جزئي أو انقطاع): الكتابة بالدمج فلا تتكرر البيانات
      async function redo(id) {
        if (busy) return; const m = (D.moves || []).find(x => x.id === id); if (!m) return;
        busy = true; msg.textContent = "جارِ إعادة الترحيل…";
        try {
          const r = await migrateMove(m); m.migFailed = r.failedNames.slice(); persist();
          msg.innerHTML = `✔ أُعيد ترحيل بيانات <b>${esc(m.name)}</b>${CLOUD ? ` لدى ${r.teachers} معلماً${r.failed ? ` (تعذّر لدى: ${esc(r.failedNames.join("، "))})` : ""}` : " على هذا الجهاز"} — بالدمج، فلا تتكرر البيانات.`;
        } catch (e) { msg.textContent = "تعذّرت إعادة الترحيل — تحقق من الاتصال ثم أعد المحاولة"; }
        busy = false; drawLog(); rerenderTab();
      }
      async function build() {
        const c = classById(cur); if (!c) return;
        body.innerHTML = '<div class="empty-note">جارِ حساب النقاط…</div>';
        const pts = await classPointsMap(cur); if (cur !== c.id) return;
        const act = activeStudents(c), others = cls.filter(x => x.id !== cur), movedN = c.students.filter(s => s.moved && !s.gap).length;
        body.innerHTML = `<div style="font-size:12.5px;color:var(--muted);margin:0 2px 6px">${esc(c.name)} — ${act.length} طالباً نشطاً${movedN ? ` (${movedN} منقول)` : ""}${pts ? "" : " · لا رصد بعد"}</div>` +
          (act.length ? act.map(({ s, i }, k) => `<div class="stu mv-row" data-i="${i}"><span class="num" title="الفهرس الحقيقي ${i}">${k + 1}</span><span class="nm" style="cursor:default">${esc(s.n)}<small>#${i + 1}${s.from ? ` · منقول من ${esc(nameOf(s.from.cid))}` : ""}${pts && pts[i] != null ? ` · النقاط ${pts[i]}` : ""}</small></span>
            <select class="search-box mv-to" data-i="${i}" style="width:auto;margin:0;padding:7px 8px;font-size:12.5px"><option value="">نقل إلى…</option>${others.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>
            <button class="btn-plain mv-out" data-i="${i}" title="خروج من المدرسة" style="flex:0 0 auto;padding:7px 9px;font-size:12.5px;color:var(--bad)">🚪 خروج</button></div>`).join("") : '<div class="empty-note">لا طلاب نشطين في هذا الفصل</div>');
        body.querySelectorAll(".mv-to").forEach(sel => sel.onchange = () => { const to = sel.value; sel.value = ""; if (to) doMove(+sel.dataset.i, to); });
        body.querySelectorAll(".mv-out").forEach(b => b.onclick = () => doMove(+b.dataset.i, "out"));
      }
      async function doMove(si, to) {
        if (busy) return;
        if (CLOUD && (!fdb || !MOVES_OK)) { msg.textContent = "النقل معطّل الآن: لم تُحمَّل حركات النقل من السحابة عند فتح التطبيق — أعد تحميل الصفحة مع اتصال بالإنترنت"; return; }
        busy = true; msg.textContent = "جارِ التحقق من آخر الحركات…";
        // أعد قراءة الحركات (جهاز آخر أو تبويب أقدم قد نقل طالباً) قبل حساب newSi حتى لا يُحسب من طول قديم
        const fresh = await refreshMoves({ to, from: cur });
        busy = false;
        if (fresh) { drawLog(); await build(); }
        const c = classById(cur), s = c && c.students[si]; if (!s) return;
        if (s.moved) { msg.textContent = `«${s.n}» نُقل بالفعل من جهاز آخر — حُدِّثت القائمة`; return; }
        const dst = to === "out" ? null : classById(to); if (to !== "out" && !dst) return;
        const newSi = dst ? dst.students.length : 0, newNo = dst ? activeCount(dst) + 1 : 0;   // newSi = طول مصفوفة الهدف الفعلية (بعد كل الحركات المعروفة) قبل الإضافة
        const txt = dst
          ? `نقل الطالب «${s.n}»\nمن: ${c.name}\nإلى: ${dst.name}\n\nستنتقل كل بياناته (الرصد اليومي والدرجات وسجل التواصل) لدى كل معلم يدرّس الفصلين، وترتيبه الجديد رقم ${newNo} في ${dst.name}.\nلا تنتقل نتائج الأوراق التفاعلية المرسلة سابقاً (تبقى محفوظة باسمه في فصله القديم).\n\nهل تريد المتابعة؟`
          : `تسجيل خروج الطالب «${s.n}» من المدرسة (${c.name})؟\n\nسيختفي من كل الشاشات لدى جميع المعلمين، وتبقى بياناته السابقة محفوظة ولا تتأثر فهارس زملائه.`;
        if (!confirm(txt)) return;
        busy = true; msg.textContent = "جارِ التنفيذ…";
        const m = { from: cur, si, to, name: String(s.n || "").slice(0, 120), newSi, tn: TE.name, ts: Date.now() };
        const id = moveId(m); let rec2 = null;
        try {
          if (CLOUD && fdb) {
            // حجز الموضع (to,newSi) ذرّياً داخل transaction: المعرّف مشتق من الموضع، والقواعد تسمح بالإنشاء فقط — فلا يمكن لجهازين حجز الموضع نفسه
            const ref = fdb.doc("moves/" + id);
            await fdb.runTransaction(async tx => { const ex = await tx.get(ref); if (ex.exists) throw new Error("SLOT_TAKEN"); tx.set(ref, m); });
          } else {
            let stored = []; try { const raw = JSON.parse(localStorage.getItem(KEY) || "null"); stored = (raw && Array.isArray(raw.moves)) ? raw.moves : []; } catch (e) { }
            if (stored.concat(D.moves || []).some(x => x && x.id === id)) throw new Error("SLOT_TAKEN");
          }
          rec2 = Object.assign({ id }, m);
          applyMoves(D.classes, [rec2]); delete rec2.appliedSi;
          D.moves = D.moves || []; D.moves.push(rec2); persist();       // الحركة مسجَّلة — الترحيل بعدها (وإن فشل جزئياً يُعاد من السجل)
          const mig = await migrateMove(m);
          rec2.migFailed = mig.failedNames.slice(); persist();
          msg.innerHTML = dst ? `✔ نُقل <b>${esc(s.n)}</b> إلى ${esc(dst.name)} برقم ${newNo}${CLOUD ? ` — رُحِّلت بياناته لدى ${mig.teachers} معلماً${mig.failed ? ` (تعذّر لدى: ${esc(mig.failedNames.join("، "))} — استعمل «🔁 إعادة الترحيل» في السجل)` : ""}` : " — رُحِّلت بياناته على هذا الجهاز"}.` : `✔ سُجِّل خروج <b>${esc(s.n)}</b> من المدرسة.`;
        } catch (e) {
          if (e && e.message === "SLOT_TAKEN") { msg.textContent = "تعارض: نُفِّذ نقل آخر إلى هذا الفصل في الوقت نفسه من جهاز آخر — حُدِّثت القائمة، أعد المحاولة"; await refreshMoves({ to, from: cur }); }
          else if (rec2) { rec2.migFailed = ["تعذّر الترحيل"]; persist(); msg.innerHTML = `⚠️ سُجِّلت الحركة لكن تعذّر ترحيل بيانات <b>${esc(s.n)}</b> — استعمل «🔁 إعادة الترحيل» في سجل الحركات`; }
          else msg.textContent = "تعذّر تنفيذ النقل — تحقق من الاتصال ثم أعد المحاولة";
        }
        busy = false; drawLog(); build(); rerenderTab();
      }
      o.querySelectorAll("#mv-chips .chip").forEach(ch => ch.onclick = () => { cur = ch.dataset.c; o.querySelectorAll("#mv-chips .chip").forEach(x => x.classList.toggle("on", x === ch)); build(); });
      drawLog(); build();
    });
  }
  // 📤 تقارير الفترة لأولياء الأمور (قروب الواتس أو رسالة لكل ولي أمر)
  const recsInRange = (cid, from, to) => { const src = DB.recs[cid] || {}, out = {}; Object.keys(src).forEach(dt => { if ((!from || dt >= from) && (!to || dt <= to)) out[dt] = src[dt]; }); return out; };
  const waLink = (phone, text) => "https://wa.me/" + (phone ? phone : "") + "?text=" + encodeURIComponent(text);
  const phoneOf = (s) => (s.p || "").replace(/\D/g, "").replace(/^0/, "966");
  const hLabelShort = (iso) => { try { return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long" }).format(new Date(iso + "T12:00:00")); } catch (e) { return iso; } };
  function periodText(cid, from, to) {
    const c = classById(cid), recs = recsInRange(cid, from, to), maxTot = maxTotal();
    const rows = activeStudents(c).map(({ s, i }) => ({ s, i, t: calcStudent(cid, i, recs) }));
    const days = Object.keys(recs).filter(dt => Object.keys(recs[dt] || {}).some(k => !emptyRec(recs[dt][k]))).length; const rated = rows.filter(r => r.t.days);
    // نسبة حضور الفصل بنفس تعريف بطاقة الطالب والدرجة التلقائية، لا «حاضر» وحدها على كل الحالات
    const att = attPct({ st: STATES.map((x, k) => rows.reduce((a, r) => a + (r.t.st[k] || 0), 0)) });
    const part = rows.reduce((a, r) => a + r.t.part, 0), hw = rows.reduce((a, r) => a + r.t.hwY, 0);
    const top = rows.filter(r => r.t.pts > 0).sort((a, b) => b.t.pts - a.t.pts).slice(0, 5);
    const need = rows.filter(r => absCnt(r.t) > 0 || r.t.hwN > 0 || r.t.behN > 0).slice(0, 8);
    return `📊 *تقرير ${TE.subject} — ${c.name}*\n🏫 ${META.school.name}\n🗓️ الفترة: ${hLabelShort(from)} → ${hLabelShort(to)} (${days} حصة مرصودة)\n\n` +
      `✅ نسبة الحضور: ${att != null ? att + "%" : "لم يُرصد بعد"}\n🙋 المشاركات: ${part} | 📚 الواجبات المنجزة: ${hw}\n\n` +
      (top.length ? `🏆 *الأوائل في النقاط:*\n${top.map((r, k) => `${["🥇", "🥈", "🥉", "4.", "5."][k]} ${r.s.n} (${r.t.pts})`).join("\n")}\n\n` : "") +
      (need.length ? `🔔 *يحتاجون متابعة الأسرة:*\n${need.map(r => `• ${r.s.n}: ${[absCnt(r.t) ? "غياب " + absCnt(r.t) : "", r.t.hwN ? "واجب ناقص " + r.t.hwN : "", r.t.behN ? "ملاحظة سلوك" : ""].filter(Boolean).join("، ")}`).join("\n")}\n\n` : "") +
      `💡 نشكر تعاونكم، ومتابعتكم اليومية تصنع الفرق.\n👨‍🏫 معلم المادة: ${TE.name}`;
  }
  function studentText(cid, i, from, to) {
    const c = classById(cid), s = c.students[i], recs = recsInRange(cid, from, to), t = calcStudent(cid, i, recs), maxTot = maxTotal();
    // الترتيب التنافسي نفسه الذي في classCalc (rankMap): المتساوون رقمٌ واحد. وكان findIndex
    // يعطيهم أرقاماً متسلسلة يقرّرها موضع الاسم في المصفوفة لا نقاطه.
    const ord = activeStudents(c).map(x => ({ i: x.i, pts: calcStudent(cid, x.i, recs).pts })).sort((a, b) => b.pts - a.pts);
    const rank = rankMap(ord)[i] || 0;
    const hasG = hasGrades(cid, i), gt = gradeTotal(cid, i), gm = gradedMax(cid, i), gp = gradePct(cid, i); const a = attPct(t);
    const tip = absCnt(t) > 0 ? "نرجو متابعة الحضور." : t.hwN > 0 ? "نرجو متابعة إنجاز الواجبات." : t.pts >= 10 ? "أداء مميز، بارك الله فيه." : "نأمل مزيداً من المشاركة.";
    return `السلام عليكم ورحمة الله\nولي أمر الطالب: *${s.n}* — ${c.name}\n📊 تقرير ${TE.subject} للفترة ${hLabelShort(from)} → ${hLabelShort(to)}\n` +
      `⭐ النقاط: ${t.pts} | الترتيب: ${rank} من ${activeCount(c)}\n✅ الحضور: ${a != null ? a + "%" : "—"} (${STATES.map((st, k) => t.st[k] ? `${st.name} ${t.st[k]}` : "").filter(Boolean).join("، ") || "لا رصد"})\n🙋 المشاركة: ${t.part} | 📚 الواجبات: ${t.hwY}${t.hwN ? ` (ناقص ${t.hwN})` : ""}${hasG && gp != null ? `\n📝 الدرجة: ${gt}/${gm}${gm < maxTot ? ` مرصودة (من أصل ${maxTot})` : ""} — ${levelOf(gp).t}` : ""}\n💡 ${tip}\n${META.school.name} — ${TE.name}`;
  }
  function parentReportsCard(box) {
    const cls = myClasses(); if (!cls.length) return;
    // toISOString يعطي تاريخ الأمس بين منتصف الليل و2:59 فجراً بتوقيت الرياض، فيسقط رصد اليوم من كل الرسائل
    const today = todayISO(), ago = todayISO(new Date(Date.now() - 6 * 864e5));
    const wa = document.createElement("div"); wa.className = "card no-print";
    wa.innerHTML = `<h3><span class="dot"></span>📤 تقارير أولياء الأمور — ${esc(classById(repClass).name)}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="field" style="margin:0"><label>من تاريخ</label><input type="date" id="wa-from" value="${ago}"></div><div class="field" style="margin:0"><label>إلى تاريخ</label><input type="date" id="wa-to" value="${today}"></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn-gold" id="wa-group" style="flex:1">💬 تقرير الفصل لقروب الواتس</button><button class="btn-gold" id="wa-each" style="flex:1">👨‍👩‍👦 رسالة لكل ولي أمر</button></div>
      <textarea class="note" id="wa-text" rows="9" style="margin-top:8px;display:none;direction:rtl"></textarea>
      <div id="wa-act" style="display:none;gap:8px;margin-top:6px"><button class="btn-plain" id="wa-copy" style="flex:1">📋 نسخ النص</button><a class="wa-btn" id="wa-share" target="_blank" rel="noopener" style="flex:2;margin:0">💬 مشاركة في واتساب (اختر القروب)</a></div>
      ${(() => { const a2 = activeStudents(classById(repClass)), n = a2.filter(x => !phoneOf(x.s)).length; return n ? `<div class="empty-note" style="padding:8px 2px 0;text-align:right;font-size:12.5px;color:var(--bad)">📱 ${n} من ${a2.length} بلا رقم ولي أمر — اقترح الرقم من بطاقة الطالب ويعتمده المدير بنقرة.</div>` : ""; })()}`;
    box.appendChild(wa);
    const rng = () => [wa.querySelector("#wa-from").value || ago, wa.querySelector("#wa-to").value || today];
    wa.querySelector("#wa-group").onclick = () => {
      const [f, t] = rng(); const txt = periodText(repClass, f, t);
      const ta = wa.querySelector("#wa-text"); ta.style.display = "block"; ta.value = txt;
      const act = wa.querySelector("#wa-act"); act.style.display = "flex"; wa.querySelector("#wa-share").href = waLink("", txt);
      wa.querySelector("#wa-copy").onclick = () => { try { navigator.clipboard.writeText(ta.value); wa.querySelector("#wa-copy").textContent = "✔ نُسخ"; } catch (e) { ta.select(); document.execCommand("copy"); } };
    };
    wa.querySelector("#wa-each").onclick = () => { const [f, t] = rng(); parentEachSheet(f, t); };
  }
  /* روابط «رسالة لكل ولي أمر» كانت وسوم <a> عارية بلا أي تسجيل: يرسل المعلم عشرين رسالة ولا يبقى منها
     سطر واحد في سجل التواصل. صارت تمرّ على مسار التسجيل نفسه بوسم «تقرير فترة»، ويظهر بجانب كل اسم
     «✔ أُرسل قبل يومين»، و«👁» تعرض النص وتعمل بلا رقم (وتفتح حقل اقتراح الرقم). */
  function parentEachSheet(f, t) {
    const c = classById(repClass), act = activeStudents(c);
    const noPh = act.filter(x => !phoneOf(x.s)).length;
    openSheet(`<h4>👨‍👩‍👦 رسالة لكل ولي أمر — ${esc(c.name)}</h4>
      <div style="color:var(--muted);font-size:13px;margin-bottom:8px">الفترة ${hLabelShort(f)} → ${hLabelShort(t)} — كل إرسال يُسجَّل في سجل التواصل بوسم «تقرير فترة»${noPh ? ` · <b style="color:var(--bad)">${noPh} من ${act.length} بلا رقم</b>` : ""}</div>
      <div id="pe-list">${act.map(({ s, i }) => {
      const ph = phoneOf(s), sent = lastCommWhy(repClass, i, "تقرير فترة");
      return `<div class="stu"><span class="nm">${esc(s.n)}<small>${calcStudent(repClass, i, recsInRange(repClass, f, t)).pts} نقطة في الفترة${sent ? ` · <b style="color:var(--ok)">✔ أُرسل ${esc(agoLabel(sent.ts))}</b>` : ""}</small></span><div style="display:flex;gap:6px"><button class="btn-soft" data-pg="${i}">📈</button><button class="btn-soft" data-pv="${i}" title="معاينة النص وتسجيل التواصل">👁</button><a class="wa-btn ${ph ? "" : "off"}" data-pw="${i}" style="margin:0;padding:6px 10px;font-size:13px" target="_blank" rel="noopener" href="${waLink(ph, studentText(repClass, i, f, t))}">💬 إرسال</a></div></div>`;
    }).join("")}</div>
      <div class="sheet-actions"><button class="btn-primary" id="pe-x">إغلاق</button></div>`,
      (o) => {
        o.querySelector("#pe-x").onclick = closeSheet;
        o.querySelectorAll("[data-pg]").forEach(b => b.onclick = () => studentProgress(repClass, +b.dataset.pg));
        o.querySelectorAll("[data-pv]").forEach(b => b.onclick = () => {
          const i = +b.dataset.pv;
          parentSendSheet({
            cid: repClass, i: i, title: "تقرير الفترة — " + c.students[i].n, text: studentText(repClass, i, f, t),
            why: "تقرير فترة", note: `تقرير الفترة ${hLabelShort(f)} → ${hLabelShort(t)}`,
            done: () => lastCommWhy(repClass, i, "تقرير فترة"), backLbl: "رجوع", back: () => parentEachSheet(f, t)
          });
        });
        o.querySelectorAll("[data-pw]").forEach(a => a.addEventListener("click", () => {
          const i = +a.dataset.pw; if (!phoneOf(c.students[i])) return;      // زر بلا رقم لا يُسجَّل إرسالاً لم يقع
          logComm(repClass, i, "تقرير فترة", "واتساب", `تقرير الفترة ${hLabelShort(f)} → ${hLabelShort(t)}`);
          setTimeout(() => { if (OV.querySelector("#pe-list")) parentEachSheet(f, t); }, 500);
        }));
      });
  }

  /* ═══════════ ✏️ تأليف الدروس أونلاين (لكل المواد) — يُحفظ سحابياً ويعمل عليه الدرس والقصة والأسئلة والألعاب والورقة ═══════════ */
  const lessonKey = (code, wk) => code + "w" + wk;
  async function lessonOverride(key) {
    if (CLOUD && fdb) { try { const s = await fdb.doc("lessons/" + key).get(); if (s.exists) { const d = s.data() || {}; if (d.title) return d; } } catch (e) { } return null; }
    try { const j = localStorage.getItem("lesson:" + key); return j ? JSON.parse(j) : null; } catch (e) { return null; }
  }
  const lines = (t) => String(t || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  // تحويل نص المعلم البسيط → بنية الدرس
  function parseLessonForm(o) {
    const g = (id) => o.querySelector(id).value;
    const d = { title: g("#au-title").trim(), unit: g("#au-unit").trim(), objectives: lines(g("#au-obj")), intro: g("#au-intro").trim(), sections: [], vocab: [], checks: [], questions: [], story: [], activity: g("#au-act").trim(), summary: g("#au-sum").trim() };
    String(g("#au-sec")).split(/\n\s*\n/).forEach(block => { const ls = lines(block); if (!ls.length) return; const sec = { h: ls[0].replace(/^#+\s*/, ""), points: [] }; ls.slice(1).forEach(l => { if (/^💡/.test(l)) sec.tip = l.replace(/^💡\s*/, ""); else sec.points.push(l.replace(/^[-•*]\s*/, "")); }); if (!sec.points.length) delete sec.points; d.sections.push(sec); });
    lines(g("#au-vocab")).forEach(l => { const m = l.split(/\s*[:：]\s*/); if (m.length >= 2) d.vocab.push({ t: m[0].trim(), d: m.slice(1).join(":").trim() }); });
    lines(g("#au-q")).forEach(l => {
      let m;
      if ((m = l.match(/^(صح|خطأ)\s*[:：]\s*(.+)$/))) d.questions.push({ t: "tf", q: m[2].trim(), opts: ["صح", "خطأ"], correct: m[1] === "صح" ? 0 : 1 });
      else if ((m = l.match(/^أكمل\s*[:：]\s*(.+?)\s*\|\s*(.+)$/))) d.questions.push({ t: "fill", q: m[1].trim(), ans: m[2].trim() });
      else { const parts = l.replace(/^س\s*[:：]\s*/, "").split("|").map(x => x.trim()).filter(Boolean); if (parts.length >= 3) { let correct = 0; const opts = parts.slice(1).map((x, k) => { if (/\*$/.test(x)) { correct = k; return x.replace(/\*+$/, "").trim(); } return x; }); d.questions.push({ t: "mcq", q: parts[0], opts: opts.slice(0, 4), correct }); } }
    });
    d.checks = d.questions.filter(q => q.t === "mcq").slice(0, 3).map(q => ({ q: q.q, opts: q.opts, correct: q.correct }));
    lines(g("#au-story")).forEach(l => { const [txt, url] = l.split("|").map(x => x.trim()); const m = txt.match(/^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*(.*)$/u); const sc = m ? { v: m[1], t: m[2] } : { v: "📘", t: txt }; if (url && /^https?:\/\//.test(url)) { sc.img = url; sc.cap = sc.t.split(/\s+/).slice(0, 3).join(" "); } d.story.push(sc); });
    return d;
  }
  // بنية الدرس → نص المعلم (للتعبئة المسبقة)
  function lessonToForm(d) {
    d = d || {};
    return {
      obj: (d.objectives || []).join("\n"),
      sec: (d.sections || []).map(s => [s.h, ...(s.points || []).map(p => "- " + p), s.tip ? "💡 " + s.tip : ""].filter(Boolean).join("\n")).join("\n\n"),
      vocab: (d.vocab || []).map(v => v.t + " : " + v.d).join("\n"),
      q: (d.questions || d.checks || []).map(q => q.t === "tf" ? (q.correct === 0 ? "صح: " : "خطأ: ") + q.q : q.t === "fill" ? "أكمل: " + q.q + " | " + (q.ans || "") : "س: " + q.q + " | " + (q.opts || []).map((o, k) => o + (k === q.correct ? "*" : "")).join(" | ")).join("\n"),
      story: (d.story || []).map(s => (s.v || "📘") + " " + s.t + (s.img && /^https?:\/\//.test(s.img) ? " | " + s.img : "")).join("\n"),
    };
  }
  async function authorLesson(code, wk, lessonName, onSaved) {
    const key = lessonKey(code, wk);
    const cur = await lessonData(code, wk); const f = lessonToForm(cur);
    const ta = (id, label, val, rows, hint) => `<div class="field"><label>${label}${hint ? ` <small style="color:var(--muted);font-weight:500">${hint}</small>` : ""}</label><textarea id="${id}" class="note" rows="${rows}" style="width:100%">${esc(val)}</textarea></div>`;
    openSheet(`<h4>✏️ تأليف الدرس — ${esc(lessonName || key)}</h4>
      <div style="font-size:12.5px;color:var(--muted);line-height:1.9;margin-bottom:8px">اكتب المحتوى بالصيغة البسيطة أدناه، وبعد الحفظ يعمل عليه فوراً: ▶️ الدرس، 🎬 القصة (بصوت المتصفح)، ❓ الأسئلة، 📝 الورقة، و🎮 الألعاب — لك ولزملاء المادة.</div>
      <div class="field"><label>عنوان الدرس</label><input id="au-title" class="search-box" style="margin:0" value="${esc(cur ? cur.title : (lessonName || ""))}"></div>
      <div class="field"><label>الوحدة</label><input id="au-unit" class="search-box" style="margin:0" value="${esc(cur ? cur.unit : "")}"></div>
      ${ta("au-obj", "🎯 الأهداف", f.obj, 3, "هدف في كل سطر")}
      ${ta("au-intro", "المقدمة", cur ? cur.intro : "", 2)}
      ${ta("au-sec", "📚 الأقسام", f.sec, 8, "السطر الأول عنوان القسم، ثم نقطة في كل سطر، و💡 للتلميح — سطر فارغ بين الأقسام")}
      ${ta("au-vocab", "📖 المصطلحات", f.vocab, 4, "المصطلح : التعريف")}
      ${ta("au-q", "❓ بنك الأسئلة", f.q, 7, "س: السؤال | خيار | الخيار الصحيح* | خيار | خيار — أو: صح: عبارة / خطأ: عبارة — أو: أكمل: جملة ...... | الجواب")}
      ${ta("au-story", "🎬 قصة الدرس", f.story, 7, "مشهد في كل سطر يبدأ بإيموجي، ويمكن إضافة | رابط صورة")}
      ${ta("au-act", "✏️ النشاط", cur ? cur.activity : "", 2)}
      ${ta("au-sum", "🧾 الخلاصة", cur ? cur.summary : "", 2)}
      <div id="au-msg" class="empty-note" style="padding:4px"></div>
      <div class="sheet-actions"><button class="btn-plain" onclick="window._sheetClose()">إلغاء</button><button class="btn-primary" id="au-save">💾 حفظ الدرس</button></div>`, (o) => {
      o.querySelector("#au-save").onclick = async () => {
        const d = parseLessonForm(o);
        if (!d.title) { o.querySelector("#au-msg").textContent = "اكتب عنوان الدرس"; return; }
        d.tn = TE.name; d.ts = Date.now(); d.by = TE.id;
        let ok = true;
        if (CLOUD && fdb) { try { await fdb.doc("lessons/" + key).set(d); } catch (e) { ok = false; } }
        else { try { localStorage.setItem("lesson:" + key, JSON.stringify(d)); } catch (e) { ok = false; } }
        if (!ok) { o.querySelector("#au-msg").textContent = "تعذّر الحفظ — تحقق من الاتصال"; return; }
        delete lessonCache[key]; closeSheet(); if (onSaved) onSaved();
      };
    });
  }

  /* ═══════════ 📤 الأوراق التفاعلية: إرسال بالرابط + نتائج حيّة + اعتماد الدرجات ═══════════ */
  const ASSIGN_BASE = location.origin + location.pathname.replace(/[^/]*$/, "") + "w/?a=";
  const MODES = [
    { k: "ws", ic: "📝", n: "ورقة عمل", d: "مفتوحة حتى الموعد · محاولات متعددة · التصحيح فوراً" },
    { k: "quiz", ic: "⏱️", n: "اختبار", d: "مؤقّت · محاولة واحدة · أسئلة مخلوطة" },
    { k: "race", ic: "🏆", n: "تحدٍّ", d: "سريع · محاولة واحدة · ترتيب الفصل" },
  ];
  const shortId = () => Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 4);
  const dueLocal = (h) => { const d = new Date(Date.now() + h * 3600e3); d.setMinutes(0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
  const shuffleQ = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // نافذة الإرسال — تُستدعى بأسئلة جاهزة (بنك الدرس أو ورقة المعلم)
  /* فهرس الأوراق المرسلة لكل فصل: بوابة الطالب لا تستطيع سرد assign (وفتحه يسلّم الطفل
     مفاتيح إجابات كل اختبارات المدرسة)، فيُكتب لها ملخّص بلا أسئلة ولا إجابات.
     القائمة تنمو ولا تنقص كما تشترط القاعدة، وعند بلوغ السقف تُسقط الأقدم. */
  /* تُعيد true إن كُتب الفهرس، وfalse إن رُفض أو تعثّر — وكان يبتلع الرفض صامتاً، فيقول
     التطبيق للمعلم «وصلت إلى 21 حساباً» والورقة لا تظهر في «مهامي» أبداً ولا يصل إشعار. */
  async function idxAssign(cid, item) {
    if (!CLOUD || !fdb || !cid || !item) return false;
    const ref = fdb.doc("assignidx/" + cid);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const snap = await ref.get();
        const cur = (snap.exists ? (snap.data() || {}).list : null) || [];
        if (cur.some(x => x && x.a === item.a)) return true;
        let list = cur.concat([item]);
        if (list.length > 190) list = list.slice(list.length - 190);
        await ref.set({ list: list, tn: TE.name, ts: Date.now() }, { merge: false });
        return true;
      } catch (e) {
        const denied = !!(e && e.code === "permission-denied");
        if (denied || attempt) { try { console.warn("[assignidx] " + (denied ? "مرفوض (لا مطالبة جلسة)" : "تعثّر") + " — " + cid); } catch (x) { } return false; }
        await new Promise(r => setTimeout(r, 600));
      }
    }
    return false;
  }
  /* حارس الاعتماد: العمليات التي تشترط مطالبة الجلسة (sess) في القواعد — إرسال الأوراق
     وفهرسها ورسائل الطلاب وقراءة النتائج. تُستدعى قبل فتح النافذة لا بعد الكتابة، فلا
     يُنشئ المعلم ورقةً لا تصل أحداً ثم يُقال له إنها وصلت. */
  function claimGate(what) {
    if (!CLOUD || claimOK()) return true;
    try { claimBar(); } catch (e) { }
    openSheet(`<h4>🔐 اعتماد الجهاز مطلوب</h4>
      <div style="font-size:14px;line-height:2;color:var(--ink)">هذا الجهاز لم يُعتمد برقمك بعد تحديث التطبيق، و<b>${esc(what)}</b> يحتاج اعتماداً.
      <br><br>لو أرسلتَ الآن لأُنشئ الرابط ولم تظهر الورقة في «✏️ مهامي» عند الطلاب ولم يصلهم إشعار —
      فالأفضل اعتماد الجهاز أولاً: تُدخل رقمك مرة واحدة ويبقى معتمداً.</div>
      <div class="sheet-actions" style="flex-wrap:wrap"><button class="btn-plain" style="flex:1 1 46%" onclick="window._sheetClose()">لاحقاً</button>
        <button class="btn-primary" style="flex:1 1 46%" id="cg-go">🔓 اعتماد الجهاز الآن</button></div>`, (o) => {
      const b = o.querySelector("#cg-go");
      if (b) b.onclick = () => { DB.session = null; DB.srole = null; save(); setTimeout(() => location.reload(), 250); };
    });
    return false;
  }
  const SOME_SEL = '#as-who-t [data-w="some"]';
  /* ═══ من يستطيع الدخول فعلاً: sids/{cid} ═══
     بصمات الهويات (spins) لا تُسرد بالقواعد قصداً، فلا يعرف المعلم من فتح حسابه من طلابه. تكتب
     لوحة المدير في sids فهارسَ من سُجّلت هويته (لا رقماً ولا اسماً)، فتقول نافذة الإرسال الحقيقة.
     غياب المستند = مدرسة لم تسجّل الهويات بعد: لا عدد يُذكر ولا كذب يُقال. */
  const sidsRawCache = {};
  const sidsCache = {};
  async function sidsRaw(cid) {
    if (!CLOUD || !fdb || !cid) return null;
    if (cid in sidsRawCache) return sidsRawCache[cid];
    let v = null;
    try {
      const d = await fdb.doc("sids/" + cid).get();
      if (d.exists) {
        const raw = (d.data() || {}).list;
        v = Array.isArray(raw) ? raw.map(x => +x).filter(x => Number.isInteger(x) && x >= 0 && x < 400) : [];
      }
    } catch (e) { v = null; }
    sidsRawCache[cid] = v; return v;
  }
  /* من سُجّلت هويته في هذا الفصل: مستنده، ومعه كل طالبٍ نُقل إليه وكانت هويته مسجَّلة في
     فصله السابق — حسابه يعمل (البوابة تجرّب فصوله السابقة) فعدّه «بلا هوية» كذبٌ ينقص
     سطر «تصل إلى N حساباً» واحداً في كل نقلة. */
  async function sidsOf(cid) {
    if (!CLOUD || !fdb || !cid) return null;
    if (cid in sidsCache) return sidsCache[cid];
    const base = await sidsRaw(cid);
    if (!Array.isArray(base)) { sidsCache[cid] = base; return base; }
    const set = {}, out = base.slice();
    base.forEach(i => set[i] = 1);
    const c = classById(cid), list = c ? (c.students || []) : [];
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      if (!st || st.moved || st.gap || set[i]) continue;
      const ch = chainOf(cid, i);
      for (let k = 0; k < ch.length; k++) {
        const f = ch[k]; if (!f || !f.cid || f.cid === cid) continue;
        const old = await sidsRaw(f.cid);
        if (Array.isArray(old) && old.indexOf(+f.si) >= 0) { set[i] = 1; out.push(i); break; }
      }
    }
    out.sort((a, b) => a - b);
    sidsCache[cid] = out; return out;
  }

  /* ═══════════════ تأسيس مدرسة جديدة (تجربة ٧ أيام) ═══════════════
     المدير يكتب ثلاثة أشياء: اسم مدرسته واسمه ورقم دخوله. فتُكتب أربعة مستندات بالترتيب،
     كلٌّ منها يفتح الذي بعده ثم يُغلق على نفسه (انظر sp/{space} في firestore.rules):
       sp/{code}                ← اسم المدرسة وخطتها ونهاية تجربتها، ومعرّف مديرها وبصمة رقمه
       sp/{code}/teachers/t01   ← حساب المدير (وهو الوحيد الذي يُنشأ بصلاحية مدير)
       sp/{code}/pins/{ph}      ← رقم دخوله
       sp/{code}/meta/app       ← اسم المدرسة وسنتها ومكتبة التقييمات الافتراضية
     ثم يُحفظ الرمز في الجهاز ويُعاد تحميل التطبيق داخل مدرسته الجديدة، فارغةً تماماً:
     لا معلم غيره ولا فصل ولا طالب — يضيفهم من لوحته كما تفعل كل مدرسة. */
  const TRIAL_DAYS = 7;
  const SP_ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";
  function spCode() {
    let out = "";
    try {
      const a = new Uint8Array(8); crypto.getRandomValues(a);
      for (const x of a) out += SP_ALPHA[x % SP_ALPHA.length];
    } catch (e) { for (let i = 0; i < 8; i++) out += SP_ALPHA[Math.floor(Math.random() * SP_ALPHA.length)]; }
    return out;
  }
  const spLink = (code) => location.origin + location.pathname.replace(/[^/]*$/, "") + "?s=" + code;
  /* الأصل الخام بلا بادئة المساحة: التأسيس يكتب في مساحةٍ لم تُختر بعد */
  function rawDb() {
    if (fdb && fdb.__raw) return fdb.__raw;
    try { return firebase.firestore(); } catch (e) { return null; }
  }
  async function signupSchool() {
    if (!CLOUD) { alert("تسجيل مدرسة جديدة يحتاج النسخة السحابية"); return; }
    openSheet(`<h4>🏫 مدرسة جديدة — تجربة ٧ أيام مجاناً</h4>
      <div style="font-size:13.5px;color:var(--muted);line-height:1.9;margin-bottom:10px">تبدأ مدرستك فارغة تماماً: تضيف معلميك وفصولك وجدولك المعتمد، ويضيف كل معلم طلابه. بياناتك لا ترتبط بأي مدرسة أخرى.</div>
      <div class="field"><label>اسم المدرسة</label><input id="ns-school" maxlength="80" placeholder="مثال: مدرسة النور الابتدائية"></div>
      <div class="field"><label>اسمك (مدير المدرسة)</label><input id="ns-name" maxlength="80" placeholder="مثال: خالد بن محمد"></div>
      <div class="field"><label>رقم دخولك (٦ أرقام تختارها وتحفظها)</label><input id="ns-pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="off"></div>
      <div class="field"><label>أعد رقم الدخول</label><input id="ns-pin2" type="password" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="off"></div>
      <div id="ns-out" class="empty-note" style="padding:6px 2px 0;text-align:right"></div>
      <div class="sheet-actions"><button class="btn-plain" onclick="window._sheetClose()">إلغاء</button><button class="btn-primary" id="ns-go">🚀 أنشئ مدرستي</button></div>`, (o) => {
      const out = o.querySelector("#ns-out"), go = o.querySelector("#ns-go");
      const say = (t, bad) => { out.innerHTML = bad ? `<span style="color:var(--bad)">${t}</span>` : t; };
      go.onclick = async () => {
        const school = (o.querySelector("#ns-school").value || "").trim();
        const name = (o.querySelector("#ns-name").value || "").trim();
        const pin = (o.querySelector("#ns-pin").value || "").replace(/\D/g, "");
        const pin2 = (o.querySelector("#ns-pin2").value || "").replace(/\D/g, "");
        if (school.length < 3) return say("اكتب اسم المدرسة كاملاً", true);
        if (name.length < 3) return say("اكتب اسمك كاملاً", true);
        if (pin.length !== 6) return say("رقم الدخول ستة أرقام", true);
        if (pin !== pin2) return say("الرقمان غير متطابقين", true);
        go.disabled = true; say("جارِ إنشاء مدرستك…");
        const db = rawDb();
        if (!db) { go.disabled = false; return say("تعذّر الاتصال — أعد المحاولة", true); }
        const code = spCode(), now = Date.now();
        let ph = "";
        try { ph = await sha256(pin + "|t01|" + SALT); } catch (e) { ph = ""; }
        if (!/^[0-9a-f]{64}$/.test(ph)) { go.disabled = false; return say("تعذّر حساب البصمة على هذا المتصفح", true); }
        const base = "sp/" + code + "/";
        try {
          await db.doc("sp/" + code).set({ name: school, plan: "trial", exp: now + TRIAL_DAYS * 864e5, ts: now, adm: "t01", ph: ph });
          await db.doc(base + "teachers/t01").set({ name: name, subject: "الإدارة", classes: [], admin: true, reg: false, ts: now });
          await db.doc(base + "pins/" + ph).set({ tid: "t01", ts: now });
          await db.doc(base + "meta/app").set(newSchoolMeta(school));
        } catch (e) {
          go.disabled = false;
          return say("تعذّر إنشاء المدرسة: " + ((e && (e.code || e.message)) || "خطأ غير معروف") + " — تحقق من الاتصال ثم أعد المحاولة", true);
        }
        try { localStorage.setItem("sijil.space", code); } catch (e) { }
        closeSheet();
        openSheet(`<h4>✅ جاهزة! مدرستك: ${esc(school)}</h4>
          <div style="font-size:14px;line-height:2;color:var(--ink)">رمز مدرستك — احفظه، وبه يدخل معلموك وطلابك:</div>
          <div class="spcode">${esc(code)}</div>
          <div style="font-size:13px;color:var(--muted);line-height:1.9">رابط الدخول لمدرستك (أرسله لمعلميك):<br>
            <b style="word-break:break-all;direction:ltr;unicode-bidi:isolate;display:inline-block">${esc(spLink(code))}</b></div>
          <div class="as-sum" style="margin-top:10px">🔑 ادخل باسمك <b>${esc(name)}</b> وبالرقم الذي اخترته — ثم أضف معلميك وفصولك من ⚙️ الإدارة.</div>
          <div class="sheet-actions" style="flex-wrap:wrap">
            <button class="btn-plain" style="flex:1 1 46%" id="ns-copy">📋 نسخ الرابط</button>
            <button class="btn-primary" style="flex:1 1 46%" id="ns-enter">ادخل مدرستي الآن</button></div>`, (o2) => {
          const cp = o2.querySelector("#ns-copy");
          if (cp) cp.onclick = () => { try { navigator.clipboard.writeText(spLink(code)); cp.textContent = "✔ نُسخ"; } catch (e) { } };
          const en = o2.querySelector("#ns-enter");
          if (en) en.onclick = () => { location.href = spLink(code); };
        });
      };
    });
  }
  /* المدرسة الجديدة تبدأ بمكتبة التقييمات الافتراضية نفسها التي في مدرستنا — يعدّلها
     مديرها بعدها من ⚙️ الإدارة ← مكتبة التقييمات (cfg/assess) بلا لمس هذا المستند. */
  function newSchoolMeta(school) {
    const hy = hijriParts ? hijriParts() : null;
    const yr = hy && hy.y ? (hy.y + " / " + (hy.y + 1)) : "";
    return {
      school: { name: school, year: yr, term_lbl: "الفصل الأول" },
      states: [{ name: "حاضر", pts: 3 }, { name: "غائب", pts: -5 }, { name: "متأخر", pts: -1 },
               { name: "مستأذن", pts: 0 }, { name: "غائب بعذر", pts: 0 }, { name: "عن بعد", pts: 2 },
               { name: "هارب", pts: -4 }],
      behaviors: [{ name: "ملتزم", pts: 0 }, { name: "مخالف", pts: -3 }, { name: "حفظ", pts: 2 },
                  { name: "مميز", pts: 1 }, { name: "مؤدب", pts: 1 }, { name: "تطبيق عملي", pts: 2 },
                  { name: "إنجاز مشروع", pts: 3 }],
      weights: { part: 1, hw: 2, sheets: 1 },
      assess: DEFAULT_ASSESS ? clone(DEFAULT_ASSESS) : [],
      term: "t1",
      ts: Date.now()
    };
  }
  /* ═══ شريط التجربة ═══ يقرأ مستند المساحة مرة عند الإقلاع فيعرف كم بقي. */
  let SPACE_DOC = null;
  async function loadSpace() {
    if (!SPACE || !CLOUD || !fdb) return null;
    try {
      const d = await (fdb.__raw || fdb).doc("sp/" + SPACE).get();
      SPACE_DOC = d.exists ? (d.data() || {}) : null;
    } catch (e) { SPACE_DOC = null; }
    return SPACE_DOC;
  }
  function trialBar() {
    if (!SPACE_DOC || SPACE_DOC.plan !== "trial") return;
    const left = Math.ceil(((+SPACE_DOC.exp || 0) - Date.now()) / 864e5);
    let el = $("#trial-bar");
    if (!el) {
      el = document.createElement("div"); el.id = "trial-bar"; el.className = "trialbar";
      document.body.insertBefore(el, document.body.firstChild);
    }
    el.className = "trialbar" + (left <= 0 ? " over" : "");
    el.innerHTML = left > 0
      ? `<span>🎁 تجربة ${esc(SPACE_DOC.name || "مدرستك")} — بقي <b>${arNum(left)}</b> ${left === 1 ? "يوم" : left === 2 ? "يومان" : left <= 10 ? "أيام" : "يوماً"}</span><button class="tb-a" id="tb-buy">اشترك الآن</button>`
      : `<span>⏳ انتهت تجربة ${esc(SPACE_DOC.name || "مدرستك")} — بياناتك محفوظة كما هي، وتعود بالاشتراك</span><button class="tb-a" id="tb-buy">اشترك الآن</button>`;
    const b = el.querySelector("#tb-buy");
    if (b) b.onclick = () => { try { window.open("https://wa.me/966?text=" + encodeURIComponent("أرغب الاشتراك في «سجلي» — رمز مدرستي: " + SPACE), "_blank"); } catch (e) { } };
  }
  /* ═══ نافذة الإرسال ═══
     الورقة تصل حساب الطالب في «مهامي» لحظة إنشائها (فهرس assignidx)، فالرسالة الأولى تقول ذلك
     بعدد الحسابات لا «أنشئ الرابط»، والواتساب خيارٌ ثانٍ لمن لم يفتح بوابته. وثلاثة أشياء تُختار:
       • الفصول: اختيار متعدد — المعلم عنده ثمانية فصول وكان يعيد العملية ثماني مرات.
       • المقصودون: الفصل كله أو طلاب محدَّدون (علاجي/إثرائي) ⇒ doc.to، وتُخفى الورقة عن غيرهم.
       • ورقة لكل فصل (لا مستند مشترك) حتى تبقى النتائج والمحاولات والدرجات منفصلة كما هي. */
  async function sendSheet(code, wk, title, qs, cid) {
    if (!CLOUD || !fdb) { alert("الإرسال للطلاب يحتاج النسخة السحابية (ليس وضع التجربة)"); return; }
    if (!qs || !qs.length) { alert("لا أسئلة في هذه الورقة"); return; }
    /* الأسئلة الصالحة وحدها: التنقية أدناه تُسقط سؤالاً بلا خيارين أو بلا إجابة، فورقةٌ
       كل أسئلتها ناقصة كانت تُرسل فارغة (n=0) ويُقال «وصلت إلى 21 حساباً». */
    const okQ = (q) => !!(q && String(q.q || "").trim() && (q.t === "fill" ? String(q.ans || "").trim() : (q.opts || []).filter(Boolean).length >= 2));
    if (!qs.filter(okQ).length) { alert("أسئلة هذه الورقة ناقصة (سؤال بلا خيارين أو بلا إجابة) — أكملها قبل الإرسال"); return; }
    if (!claimGate("إرسال الأوراق إلى حسابات الطلاب")) return;
    const cls = myClasses(); if (!cls.length) { alert("لا فصول مسندة"); return; }
    let mode = "ws";
    const first = (cid && cls.some(c => c.id === cid)) ? cid : cls[0].id;
    const sel = new Set([first]);          // الفصول المختارة
    const toSet = new Set();               // فهارس المقصودين داخل الفصل الواحد (فارغة = الفصل كله)
    const act = (c) => activeStudents(c).map(x => x.i);
    const someOn = (o) => { const b = o.querySelector(SOME_SEL); return !!(b && b.classList.contains("on")); };
    openSheet(`<h4>📤 إرسال «${esc(title)}» إلى حسابات الطلاب</h4>
      <div style="font-size:13px;color:var(--muted);margin-bottom:10px">${qs.length} أسئلة تُصحَّح آلياً وتظهر في «✏️ مهامي» داخل حساب الطالب مباشرة.</div>
      <div class="field"><label>الفصول <small style="color:var(--muted);font-weight:400">— اضغط أكثر من فصل لإرسالها لها كلها</small></label>
        <div class="class-chips" id="as-cls">${cls.map(c => `<button class="chip ${sel.has(c.id) ? "on" : ""}" data-c="${c.id}">${esc(c.name)}</button>`).join("")}</div></div>
      <div class="field" id="as-who-w"><label>المقصودون</label>
        <div class="as-modes" id="as-who-t"><button class="as-mode on" data-w="all"><span>👥</span>كل الفصل</button><button class="as-mode" data-w="some"><span>🎯</span>طلاب محدَّدون</button></div>
        <div id="as-who" style="display:none"></div></div>
      <div class="field"><label>الوضع</label><div class="as-modes" id="as-modes">${MODES.map(m => `<button class="as-mode ${m.k === "ws" ? "on" : ""}" data-m="${m.k}"><span>${m.ic}</span>${m.n}</button>`).join("")}</div>
        <div class="empty-note" id="as-desc" style="padding:6px 2px 0;text-align:right">${MODES[0].d}</div></div>
      <div class="field" id="as-try-w"><label>عدد المحاولات المسموحة للطالب</label>
        <select class="search-box" id="as-tries" style="margin:0">
          <option value="1">محاولة واحدة فقط</option>
          <option value="2">محاولتان</option>
          <option value="3" selected>3 محاولات</option>
          <option value="5">5 محاولات</option>
          <option value="10">10 محاولات</option>
          <option value="0">بلا حد (حتى 12 محاولة)</option>
        </select>
        <div class="empty-note" style="padding:6px 2px 0;text-align:right">الدرجة المسجّلة عند المعلم تبقى دائماً من المحاولة الأولى، والطالب يرى عدد المحاولات المتبقية، وأنت ترى عدد محاولاته وأفضل نتيجة.</div></div>
      <div class="field" id="as-secs-w" style="display:none"><label>مدة الاختبار (دقائق)</label><input class="search-box" id="as-secs" style="margin:0" inputmode="numeric" value="10"></div>
      <div class="field"><label>موعد التسليم</label><input type="datetime-local" class="search-box" id="as-due" style="margin:0" value="${dueLocal(28)}"></div>
      <div id="as-sum"></div>
      <button class="btn-soft" id="as-prev" style="width:100%;margin:2px 0 0">👁️ معاينة الأسئلة كما يراها الطالب</button>
      <div id="as-out"></div>
      <div class="sheet-actions"><button class="btn-plain" onclick="window._sheetClose()">إلغاء</button><button class="btn-primary" id="as-make">📨 أرسِل إلى حسابات الطلاب</button></div>`, (o) => {
      const $$ = (q) => o.querySelector(q);
      /* سطر الوصول: الحقيقة كما هي — كم حساباً تصله الورقة، وكم طالباً لم تُسجَّل هويته فلن تصله.
         قبل الإرسال بصيغة المستقبل وبعده بصيغة الماضي، من حسابٍ واحد لا نصّين يفترقان. */
      /* ids: الفصول المحسوبة — قبل الإرسال المحدَّدة، وبعده التي نجح فهرسها فعلاً.
         فسطرٌ يقول «وصلت 62 حساباً» عن فصلٍ فشل إرساله أو رُفض فهرسه كذبٌ صريح. */
      function reach(ids) {
        let accounts = 0, miss = 0, students = 0, known = true;
        [...(ids || sel)].forEach(id => {
          const c = classById(id); if (!c) return;
          const all = act(c);
          const pick = (sel.size === 1 && toSet.size) ? all.filter(i => toSet.has(i)) : all;
          students += pick.length;
          const reg = sidsCache[id];
          if (Array.isArray(reg)) { const st = new Set(reg), k = pick.filter(i => st.has(i)).length; accounts += k; miss += pick.length - k; }
          else known = false;
        });
        return { accounts, miss, students, known, cls: [...(ids || sel)].length };
      }
      function sumHtml(past, ids) {
        if (!sel.size) return `<div class="as-sum bad">اختر فصلاً واحداً على الأقل</div>`;
        if (past && ids && !ids.length) return "";
        const r = reach(ids), v = past ? ["وصلت", "لم تصلهم"] : ["تصل", "لن تصلهم"];
        const who = r.cls > 1 ? `${cntAr(r.cls, "فصل واحد", "فصلين", "فصول", "فصلاً")} · ${r.students} طالباً` : `${r.students} طالباً${toSet.size ? " (مختارون)" : ""}`;
        if (!r.known) return `<div class="as-sum ok">📨 ${v[0]} إلى <b>${who}</b> — تظهر في «✏️ مهامي» لكل طالب سجّلت الإدارة هويته<div class="s">ومن لم يفتح حسابه بعد، أرسل له الرابط في الواتساب.</div></div>`;
        return `<div class="as-sum ok">✅ ${v[0]} إلى <b>${r.accounts} ${r.accounts === 1 ? "حساب" : "حساباً"}</b> من ${who} — تظهر لهم في «✏️ مهامي» فوراً`
          + (r.miss ? `<div class="s warn">⚠ ${r.miss} ${r.miss === 1 ? "طالباً لم تُسجَّل هويته" : "طالباً لم تُسجَّل هوياتهم"} فـ${v[1]} — تُسجَّل من لوحة المدير ← ⚙️ الإدارة ← 🆔 أرقام هويات الطلاب</div>` : "")
          + `<div class="s">ومن لم يفتح حسابه بعد، أرسل له الرابط في الواتساب.</div></div>`;
      }
      const paintSum = () => { const e = $$("#as-sum"); if (e) e.innerHTML = sumHtml(false); };
      // قائمة المقصودين: مربعات اختيار + أزرار جاهزة تُبنى من رصد المعلم نفسه
      function paintWho() {
        const box = $$("#as-who"), one = sel.size === 1;
        $$("#as-who-w").style.display = one ? "block" : "none";
        if (!one) { toSet.clear(); box.style.display = "none"; box.innerHTML = ""; return; }
        if (!someOn(o)) { box.style.display = "none"; box.innerHTML = ""; return; }
        box.style.display = "block";
        const c = classById([...sel][0]); if (!c) return;
        const reg = sidsCache[c.id], st = Array.isArray(reg) ? new Set(reg) : null;
        box.innerHTML = `<div class="adm-tools" style="margin:2px 0 8px">
            <button class="btn-soft" id="aw-all">الكل</button><button class="btn-soft" id="aw-none">لا أحد</button>
            <button class="btn-soft" id="aw-nosub">⚡ من لم يحلّ أوراقي</button><button class="btn-soft" id="aw-weak">📉 دون 50%</button></div>
          <div class="as-who-grid">${activeStudents(c).map(x => `<label class="as-who-c${toSet.has(x.i) ? " on" : ""}" data-i="${x.i}"><input type="checkbox" ${toSet.has(x.i) ? "checked" : ""}><span>${esc(c.students[x.i].n)}</span>${st && !st.has(x.i) ? `<small title="لم تُسجَّل هويته">🚫</small>` : ""}</label>`).join("")}</div>
          <div class="empty-note" style="padding:6px 2px 0;text-align:right"><b id="aw-n">${toSet.size}</b> مختارون — لا تظهر الورقة لغيرهم في حساباتهم، ومن يفتح رابطها وليس منهم لا يجد اسمه.</div>`;
        const sync = () => {
          box.querySelectorAll(".as-who-c").forEach(l => { const i = +l.dataset.i, on = toSet.has(i); l.classList.toggle("on", on); const cb = l.querySelector("input"); if (cb) cb.checked = on; });
          const n = box.querySelector("#aw-n"); if (n) n.textContent = toSet.size;
          paintSum();
        };
        box.querySelectorAll(".as-who-c").forEach(l => l.onclick = (ev) => { ev.preventDefault(); const i = +l.dataset.i; if (toSet.has(i)) toSet.delete(i); else toSet.add(i); sync(); });
        box.querySelector("#aw-all").onclick = () => { act(c).forEach(i => toSet.add(i)); sync(); };
        box.querySelector("#aw-none").onclick = () => { toSet.clear(); sync(); };
        box.querySelector("#aw-nosub").onclick = async (ev) => {
          const b = ev.currentTarget; b.disabled = true; b.textContent = "…";
          let rows = []; try { rows = (await loadSubs(c.id)) || []; } catch (e) { rows = []; }
          const did = new Set(rows.map(x => +x.si));
          toSet.clear(); act(c).forEach(i => { if (!did.has(i)) toSet.add(i); });
          sync(); b.disabled = false; b.textContent = "⚡ من لم يحلّ أوراقي";
        };
        box.querySelector("#aw-weak").onclick = () => {
          toSet.clear();
          act(c).forEach(i => { let p = null; try { p = gradePct(c.id, i); } catch (e) { p = null; } if (p != null && isFinite(p) && p < 50) toSet.add(i); });
          sync();
          if (!toSet.size) alert("لا طالب دون 50% في رصدك حتى الآن — اختر يدوياً");
        };
      }
      // بصمات الفصول تُقرأ مرة واحدة عند الفتح ثم يُحدَّث السطر — لا انتظار أمام المعلم
      paintSum();
      (async () => { for (const c of cls) { await sidsOf(c.id); } paintSum(); paintWho(); })();
      o.querySelectorAll("#as-cls .chip").forEach(b => b.onclick = () => {
        const id = b.dataset.c;
        if (sel.has(id)) { if (sel.size === 1) return; sel.delete(id); } else sel.add(id);
        if (sel.size !== 1) toSet.clear();
        o.querySelectorAll("#as-cls .chip").forEach(x => x.classList.toggle("on", sel.has(x.dataset.c)));
        paintWho(); paintSum();
      });
      o.querySelectorAll("#as-who-t [data-w]").forEach(b => b.onclick = () => {
        o.querySelectorAll("#as-who-t [data-w]").forEach(x => x.classList.toggle("on", x === b));
        if (b.dataset.w === "all") toSet.clear();
        else { const c = classById([...sel][0]); if (c) act(c).forEach(i => toSet.add(i)); }
        paintWho(); paintSum();
      });
      o.querySelectorAll(".as-mode[data-m]").forEach(b => b.onclick = () => {
        mode = b.dataset.m; o.querySelectorAll(".as-mode[data-m]").forEach(x => x.classList.toggle("on", x === b));
        $$("#as-desc").textContent = (MODES.find(m => m.k === mode) || {}).d || "";
        $$("#as-secs-w").style.display = mode === "ws" ? "none" : "block";
        $$("#as-tries").value = mode === "ws" ? "3" : "1";
      });
      $$("#as-prev").onclick = () => {
        const out = $$("#as-out"), btn = $$("#as-prev");
        if (out.dataset.pv === "1") { out.innerHTML = ""; out.dataset.pv = ""; btn.textContent = "👁️ معاينة الأسئلة كما يراها الطالب"; return; }
        out.dataset.pv = "1"; btn.textContent = "🙈 إخفاء المعاينة";
        const LT = ["أ", "ب", "ج", "د", "هـ", "و"];
        out.innerHTML = `<div style="border:1.5px solid var(--line);border-radius:12px;padding:12px;background:#fff;max-height:46vh;overflow:auto">
          <div style="font-weight:800;color:var(--navy);margin-bottom:8px">👁️ معاينة ما سيراه الطالب — ${qs.length} أسئلة${mode !== "ws" ? " (يُعاد ترتيبها عشوائياً لكل فصل)" : ""}</div>
          ${qs.map((q, i) => `<div style="margin:0 0 10px;padding:0 0 8px;border-bottom:1px dashed var(--line)">
            <div style="font-weight:700;font-size:14px;color:var(--navy)">${i + 1}. ${esc(q.q || "")}</div>
            ${(q.t === "fill")
              ? `<div style="font-size:13px;color:var(--ok);margin-top:4px">✔ الإجابة: ${esc(q.ans || "")}</div>`
              : `<div style="margin-top:4px">${(q.opts || []).filter(Boolean).map((op, j) => `<div style="font-size:13px;color:${j === (+q.correct || 0) ? "var(--ok)" : "var(--muted)"};font-weight:${j === (+q.correct || 0) ? "700" : "400"}">${j === (+q.correct || 0) ? "✔" : "◦"} ${LT[j] || (j + 1)}. ${esc(op)}</div>`).join("")}</div>`}
          </div>`).join("")}
          <div class="empty-note" style="padding:2px">الإجابات الصحيحة تظهر لك أنت فقط — الطالب يراها بعد التسليم.</div></div>`;
      };
      // رسالة الواتساب — تبقى كما كانت لمن يريد الطريق القديم، ولكل فصل رسالته برابطه
      const msgFor = (c, url, n, doc) => {
        const kind = doc.mode === "ws" ? "ورقة عمل تفاعلية" : doc.mode === "quiz" ? "اختبار قصير تفاعلي" : "سباق أسئلة";
        const triesTxt = doc.tries === 1 ? "محاولة واحدة فقط" : doc.tries === 0 ? "محاولات غير محدودة (حتى 12)" : `${doc.tries} محاولات`;
        const dueFull = doc.due ? new Date(doc.due).toLocaleString("ar-SA", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) : "";
        return `السلام عليكم ورحمة الله وبركاته\n📝 *${kind}* — مادة ${TE.subject}\n📚 الدرس: *${title}*\n🏫 الفصل: ${c.name} — المعلم: ${TE.name}\n\n🔢 ${n} أسئلة تُصحَّح آلياً وتظهر النتيجة فوراً${doc.mode !== "ws" ? `\n⏱️ مدة الحل: ${Math.round(doc.secs / 60)} دقيقة` : ""}\n🔁 المحاولات: ${triesTxt} — والدرجة المعتمدة من المحاولة الأولى${dueFull ? `\n⏰ آخر موعد للتسليم: ${dueFull}` : ""}\n\n👇 الورقة موجودة في حساب الطالب («✏️ مهامي» في بوابة الطالب)، وهذا رابطها المباشر لمن لم يفتح حسابه:\n${url}\n\nشاكرين متابعتكم 🌹\n${TE.name}`;
      };
      $$("#as-make").onclick = async () => {
        const btn = $$("#as-make");
        if (!sel.size) return;
        if (sel.size === 1 && someOn(o) && !toSet.size) { alert("اختر طالباً واحداً على الأقل، أو أعد الاختيار إلى «كل الفصل»"); return; }
        btn.disabled = true; btn.textContent = "جارِ الإرسال…";
        const to = (sel.size === 1) ? [...toSet].sort((a, b) => a - b) : [];
        const due = $$("#as-due").value || "";
        const secs = mode === "ws" ? 0 : Math.max(60, (+$$("#as-secs").value || 10) * 60);
        const tries = Math.max(0, Math.min(12, +$$("#as-tries").value || 0));
        const made = [], failed = [];
        for (const id of [...sel]) {
          const c = classById(id); if (!c) continue;
          const aid = shortId();
          const clean = (mode === "ws" ? qs : shuffleQ(qs)).map(q => ({
            t: q.t || "mcq", q: String(q.q || ""), opts: (q.opts || []).filter(Boolean),
            correct: +q.correct || 0, ans: String(q.ans || "")
          })).filter(q => q.q && (q.t === "fill" ? q.ans : q.opts.length >= 2));
          const doc = {
            t: title, subj: TE.subject, tid: TE.id, tn: TE.name, cid: id, cname: c.name,
            mode, due, code, wk, secs, qs: clean, n: clean.length, ts: Date.now(),
            tries, retry: tries !== 1
          };
          if (to.length) doc.to = to;
          try { await fdb.doc("assign/" + aid).set(doc); } catch (e) { failed.push(c.name); continue; }
          // الفهرس ليس شرطاً لنجاح الإرسال: فشلُه لا يمنع الرابط، وأقصى أثره ألا تظهر في حساب الطالب
          /* الورقة الموجَّهة **لا تدخل فهرس الفصل**: الفهرس يقرؤه كل طلاب الفصل (وأي جهاز
             مصادَق)، وقائمة to غالباً «من هم دون 50%» أو «من لم يحلّ» — فنشرُها فضيحةٌ
             لأصحابها. فتُسلَّم في صندوق كل طالبٍ الخاص smsg/{mk}: مستندٌ لا يُسرد ولا يجده
             من لا يعرف مفتاحه. والورقة العامة تبقى في الفهرس كما هي. */
          let idxOk = false, privOk = 0, privMiss = 0;
          if (to.length) {
            const keys = await mkeysOf(id);
            for (const si2 of to) {
              const mk = keys ? keys[String(si2)] : null;
              if (!mk) { privMiss++; continue; }
              const it = { i: "t" + aid + "_" + si2, k: "task", a: aid, t: title, due, tid: TE.id, tn: TE.name,
                subj: TE.subject, mode, n: clean.length, wk, code, tries, ts: doc.ts };
              let done = false;
              try { done = await msgPush(mk, it); } catch (e) { done = false; }
              if (done) privOk++; else privMiss++;
            }
            idxOk = privOk > 0;
          } else {
            try {
              const item = { a: aid, t: title, due, tid: TE.id, mode, n: clean.length, wk, code, tries, ts: doc.ts };
              idxOk = await idxAssign(id, item);
            } catch (e) { idxOk = false; }
          }
          made.push({ cid: id, cname: c.name, id: aid, url: ASSIGN_BASE + aid, n: clean.length, doc, idx: idxOk, privOk, privMiss });
        }
        if (!made.length) { btn.disabled = false; btn.textContent = "📨 أرسِل إلى حسابات الطلاب"; alert("تعذّر الإرسال — تحقق من الاتصال"); return; }
        const out = $$("#as-out"); out.dataset.pv = "";
        const one = made.length === 1;
        const msg1 = one ? msgFor(classById(made[0].cid), made[0].url, made[0].n, made[0].doc) : "";
        const okIdx = made.filter(m => m.idx), noIdx = made.filter(m => !m.idx);
        out.innerHTML = sumHtml(true, okIdx.map(m => m.cid))
          + (noIdx.length ? `<div class="as-sum bad">⚠ ${noIdx.length === made.length ? "الورقة أُنشئت ورابطها يعمل" : `${noIdx.map(m => esc(m.cname)).join(" · ")}: الرابط يعمل`}، لكنها <b>لن تظهر في «✏️ مهامي»</b> ولن يصل إشعار — لم يُعتمد هذا الجهاز برقمك.<div class="s">أرسل الرابط في الواتساب الآن، ثم اعتمد الجهاز من الشريط الأعلى ليصل التالي إلى الحسابات.</div></div>` : "")
          + (to.length ? `<div class="as-sum warn">🎯 لطلاب محدَّدين: ${to.length} — تُسلَّم في حساب كل واحد منهم وحده، ولا يظهر في فهرس الفصل أنها موجَّهة`
            + (made[0] && made[0].privMiss ? `<div class="s warn">⚠ ${made[0].privMiss} منهم لم تُسجَّل هويته فلم تصله — أرسل له الرابط</div>` : "") + `</div>` : "")
          + (failed.length ? `<div class="as-sum bad">تعذّر الإرسال إلى: ${esc(failed.join(" · "))}</div>` : "")
          + (one
            ? `<div class="as-link"><code>${esc(made[0].url)}</code><button class="btn-soft" id="as-copy-url">🔗 الرابط فقط</button></div>
               <textarea class="search-box" id="as-msg" style="margin:8px 0 6px;height:140px;font-size:13px;line-height:1.7" readonly>${esc(msg1)}</textarea>
               <button class="btn-soft" id="as-copy" style="width:100%">📋 نسخ الرسالة كاملة مع الرابط</button>
               <a class="btn-soft" target="_blank" rel="noopener" href="${esc(made[0].url)}&pv=1" style="display:block;width:100%;box-sizing:border-box;text-align:center;margin:8px 0 0;text-decoration:none">🧪 جرّبها كطالب (معاينة لا تُسجَّل)</a>
               <a class="wa-btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg1)}">💬 أرسلها في الواتساب أيضاً (اختياري)</a>`
            : `<div class="as-rows">${made.map(m => `<div class="as-row"><b>${esc(m.cname)}</b><code>${esc(m.url)}</code><button class="btn-soft as-cp" data-u="${esc(m.url)}">📋 نسخ</button><a class="btn-soft" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msgFor(classById(m.cid), m.url, m.n, m.doc))}">💬 واتساب</a></div>`).join("")}</div>`)
          + `<div class="empty-note" style="padding:8px 2px 0">تابع من فتح وحلّ من «المزيد ← 📤 الأوراق المرسلة»</div>`;
        const cp = $$("#as-copy"); if (cp) cp.onclick = () => { try { navigator.clipboard.writeText(msg1); cp.textContent = "✔ نُسخت الرسالة"; } catch (e) { const m = $$("#as-msg"); if (m) m.select(); } };
        const cu = $$("#as-copy-url"); if (cu) cu.onclick = () => { try { navigator.clipboard.writeText(made[0].url); cu.textContent = "✔ نُسخ"; } catch (e) { } };
        out.querySelectorAll(".as-cp").forEach(b => b.onclick = () => { try { navigator.clipboard.writeText(b.dataset.u); b.textContent = "✔"; } catch (e) { } });
        btn.style.display = "none";
        const pv = $$("#as-prev"); if (pv) pv.style.display = "none";
      };
    });
  }
  // ── لوحة الأوراق المرسلة ونتائجها ──
  async function toolAssign() {
    if (!CLOUD || !fdb) { alert("يحتاج النسخة السحابية"); return; }
    openSheet(`<h4>📤 الأوراق المرسلة</h4><div id="ag-body"><div class="empty-note">جارِ التحميل…</div></div>
      <div class="sheet-actions"><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, async (o) => {
      let list = [], denied = false;
      try { const s = await fdb.collection("assign").where("tid", "==", TE.id).get(); s.forEach(d => list.push(Object.assign({ id: d.id }, d.data()))); }
      catch (e) { denied = !!(e && e.code === "permission-denied"); }
      list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const body = o.querySelector("#ag-body"); if (!body) return;
      // رفضُ السرد كان يُعرض «لم ترسل ورقة بعد» — فيظن المعلم أن أوراقه ضاعت
      if (denied) { body.innerHTML = '<div class="empty-note" style="color:var(--bad);line-height:1.9">⛔ تعذّرت قراءة أوراقك: لم يُعتمد هذا الجهاز برقمك.<br>اعتمده من الشريط الأعلى (🔓 اعتماد الجهاز الآن) ثم أعد فتح هذه النافذة — أوراقك ونتائجها محفوظة ولم تضع.</div>'; return; }
      if (!list.length) { body.innerHTML = '<div class="empty-note">لم ترسل ورقة بعد. أرسل من «📝 ورقة تفاعلية» داخل الحصة أو من بنك أوراق العمل.</div>'; return; }
      const M = { ws: "📝 ورقة عمل", quiz: "⏱️ اختبار", race: "🏆 تحدٍّ" };
      body.innerHTML = list.slice(0, 25).map(a => `<div class="comm-item"><b>${esc(a.t)}</b>
        <div class="meta">${M[a.mode] || ""} · ${esc(a.cname)} · ${a.n} أسئلة · ${esc(hijriLabel(new Date(a.ts)))}${Array.isArray(a.to) && a.to.length ? ` · <b style="color:var(--gold)">🎯 ${a.to.length} طلاب محدَّدون</b>` : ""}</div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          <button class="btn-soft" data-res="${a.id}">📊 النتائج</button>
          <button class="btn-soft" data-lnk="${a.id}">🔗 الرابط</button></div></div>`).join("");
      body.querySelectorAll("[data-lnk]").forEach(b => b.onclick = () => { const u = ASSIGN_BASE + b.dataset.lnk; try { navigator.clipboard.writeText(u); b.textContent = "✔ نُسخ"; } catch (e) { prompt("الرابط:", u); } });
      body.querySelectorAll("[data-res]").forEach(b => b.onclick = () => assignResults(list.find(x => x.id === b.dataset.res)));
    });
  }

  async function assignResults(A) {
    openSheet(`<h4>📊 ${esc(A.t)}</h4><div style="font-size:13px;color:var(--muted);margin-bottom:8px">${esc(A.cname)} · ${A.n} أسئلة</div>
      <div id="ar-body"><div class="empty-note">جارِ جمع النتائج…</div></div>
      <div class="sheet-actions" style="flex-wrap:wrap"><button class="btn-plain" onclick="window._printSheet()">🖨️ طباعة</button><button class="btn-primary" onclick="window._sheetClose()">إغلاق</button></div>`, async (o) => {
      const c = classById(A.cid) || { students: [] };
      let subs = {};
      try { const s = await fdb.collection("subs").where("a", "==", A.id).get(); s.forEach(d => { const v = d.data(); subs[v.si] = v; }); } catch (e) { }
      /* الورقة الموجَّهة (A.to): الجدول والمتوسط ونسبة «سلّموا من» تُحسب على المقصودين وحدهم —
         وإلا قال «سلّم 4 من 21» عن ورقة أُرسلت إلى خمسة، فيظنّها المعلم كارثة تسليم. */
      const toArr = Array.isArray(A.to) ? A.to.map(x => +x).filter(x => Number.isInteger(x) && x >= 0) : [];
      const rows = activeStudents(c).filter(({ i }) => !toArr.length || toArr.indexOf(i) >= 0)
        .map(({ s, i }) => ({ i, n: s.n, s: subs[i] || null }));   // تسليمات المنقولين تبقى في subs ولا تُعرض
      const donerows = rows.filter(r => r.s);
      const avg = donerows.length ? (donerows.reduce((a, r) => a + r.s.sc, 0) / donerows.length) : 0;
      // تحليل الأسئلة
      const wrong = A.qs.map(() => 0);
      donerows.forEach(r => A.qs.forEach((q, k) => {
        const a = (r.s.ans || [])[k];
        const ok = q.t === "fill" ? (String(a || "").trim() && normAr(a) === normAr(q.ans)) : (a === q.correct);
        if (!ok) wrong[k]++;
      }));
      const order = A.qs.map((q, k) => ({ k, q: q.q, w: wrong[k] })).sort((a, b) => b.w - a.w);
      const worst = order[0];
      const body = o.querySelector("#ar-body"); if (!body) return;
      body.innerHTML = `
        <div class="statrow"><div class="stat"><div class="v">${donerows.length}</div><div class="l">سلّموا من ${rows.length}</div></div>
          <div class="stat"><div class="v">${donerows.length ? avg.toFixed(1) : "—"}</div><div class="l">متوسط من ${A.n}</div></div>
          <div class="stat"><div class="v">${donerows.filter(r => (r.s.att || 1) > 1).length}</div><div class="l">أعادوا المحاولة</div></div>
          <div class="stat"><div class="v">${A.tries === 0 ? "∞" : (A.tries || (A.retry === false ? 1 : "∞"))}</div><div class="l">محاولات مسموحة</div></div>
          <div class="stat"><div class="v">${worst && worst.w ? "س" + (worst.k + 1) : "—"}</div><div class="l">أكثر خطأً</div></div></div>
        <div class="table-scroll"><table class="report-table"><tr><th>الطالب</th><th>الحالة</th><th>الدرجة</th><th>محاولات</th><th>الأفضل</th><th>الوقت</th></tr>
        ${rows.sort((a, b) => (b.s ? b.s.sc : -1) - (a.s ? a.s.sc : -1)).map(r => { const v = r.s, at = v ? (v.att || 1) : 0, bs = v ? (v.best != null ? v.best : v.sc) : 0; return `<tr><td class="nm">${esc(r.n)}</td>
          <td>${v ? `<span class="cc" style="background:var(--ok);font-size:11px">سلّم${v.late ? " متأخراً" : ""}</span>` : `<span style="color:var(--muted);font-size:12px">لم يفتح</span>`}</td>
          <td><b>${v ? v.sc + " / " + v.mx : "—"}</b></td>
          <td>${v ? (at > 3 ? `<span class="cc" style="background:var(--st2);font-size:11px">${at}</span>` : at) : "—"}</td>
          <td>${v ? (bs > v.sc ? `<b style="color:var(--ok)">${bs}</b>` : "—") : "—"}</td>
          <td>${v ? Math.max(1, Math.round(v.secs / 60)) + " د" : "—"}</td></tr>`; }).join("")}
        </table></div>
        <div class="empty-note" style="text-align:right;padding:6px 2px 0">الدرجة من <b>المحاولة الأولى</b> دائماً، وعمود «الأفضل» يظهر إن تحسّن بالتدريب.${toArr.length ? `<br>🎯 هذه ورقة موجَّهة إلى ${toArr.length} من طلاب ${esc(A.cname)} — لا تظهر لغيرهم ولا يُحسب عليهم تسليمها.` : ""}</div>
        ${donerows.length ? `<div style="font-weight:800;color:var(--navy);margin:14px 0 6px">نسبة الخطأ في كل سؤال</div>
        <div class="table-scroll"><table class="report-table">${order.map(x => `<tr><td style="width:46px">س${x.k + 1}</td>
          <td class="nm" style="font-weight:500">${esc(x.q)}</td>
          <td style="width:120px"><span class="ar-bar"><i style="width:${Math.round(x.w / donerows.length * 100)}%;background:${x.w / donerows.length > .4 ? "var(--bad)" : "var(--ok)"}"></i></span></td>
          <td style="width:74px">${x.w} من ${donerows.length}</td></tr>`).join("")}</table></div>
        ${worst && worst.w / donerows.length > .4 ? `<div class="empty-note" style="text-align:right;padding:10px 2px 0">💡 أعد شرح «${esc(worst.q)}» في بداية الحصة القادمة.</div>` : ""}
        <div style="display:flex;gap:8px;margin-top:14px"><button class="btn-gold" id="ar-grade" style="flex:1">💯 اعتماد المحاولة الأولى</button>
        <button class="btn-soft" id="ar-grade-b" style="flex:1">🌟 اعتماد الأفضل</button></div>` : ""}`;
      const applyG = (useBest, btn) => {
        const a = ASSESS.find(x => x.k === "sheets") || ASSESS[1];
        DB.grades[A.cid] = DB.grades[A.cid] || {};
        let n = 0;
        donerows.forEach(r => {
          const v = useBest ? (r.s.best != null ? r.s.best : r.s.sc) : r.s.sc;
          DB.grades[A.cid][r.i] = DB.grades[A.cid][r.i] || {};
          DB.grades[A.cid][r.i][a.k] = Math.round(v / r.s.mx * a.max * 10) / 10; n++;
        });
        save("grades:" + A.cid); renderGrades();
        btn.textContent = `✔ اعتُمدت ${n} درجة`;
        body.querySelectorAll("#ar-grade,#ar-grade-b").forEach(x => x.disabled = true);
      };
      const gb = body.querySelector("#ar-grade"); if (gb) gb.onclick = () => applyG(false, gb);
      const gb2 = body.querySelector("#ar-grade-b"); if (gb2) gb2.onclick = () => applyG(true, gb2);
    });
  }
  const normAr = (s) => String(s || "").trim().replace(/[ً-ْـ]/g, "").replace(/[إأآا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/^ال/, "").replace(/\s+/g, " ").toLowerCase();
  function confetti() {
    const em = ["🎉", "⭐", "🏆", "✨", "🎊"];
    for (let n = 0; n < 14; n++) {
      const c = document.createElement("div");
      c.className = "conf"; c.textContent = em[n % em.length];
      c.style.left = (Math.random() * 90 + 3) + "%";
      c.style.animationDelay = (Math.random() * 0.3) + "s";
      (document.fullscreenElement || document.body).appendChild(c);
      setTimeout(() => c.remove(), 2000);
    }
  }

  /* بوابة الطالب صارت صفحة مستقلة s/ (دخول بالهوية، خمسة تبويبات، شهادة تُحفظ صورةً).
     وشاشتها القديمة داخل هذا الملف (renderStudent وloadStudentLessons) كانت شاشةً ميتة: لا نداء
     لها في المشروع، وسطر الإقلاع يمحو أي جلسة srole==="student" أصلاً — فحُذفت بشهادتها المكرّرة
     كي لا تُصان شهادتان ولا تفترق إحداهما عن الأخرى. الشهادة المطبوعة هنا: printCertificate. */

  /* ═══ واجهة عامة للوحدات الخارجية (js/admin/*.js): الحالة الحية عبر getters — لا تُنسخ القيم وقت التحميل ═══ */
  window.SIJIL = {
    get D() { return D; }, get DB() { return DB; }, get TE() { return TE; }, set TE(v) { TE = v; }, get fdb() { return fdb; },
    get META() { return META; }, get ASSESS() { return ASSESS; }, get STATES() { return STATES; }, get BEH() { return BEH; }, get W() { return W; }, get TERM() { return TERM; },
    get MOVES_OK() { return MOVES_OK; }, MOVE_CONFLICTS, CLOUD, SALT, KEY, DAYS, GNAME, STCOLORS, SUBS, DEFAULT_ASSESS, PRINT_CSS,
    // مكتبة التقييمات (cfg/assess): النموذج هنا، والتحقق والحفظ في js/admin/core.js
    assessDefault, assessEff, assessApply, assessView, assessMerge, ASSESS_C, ASSESS_CK, ASSESS_WK, ASSESS_MAX,
    $, esc, clone, save, syncBadge, mergeComms, rec,
    classById, myClasses, activeStudents, activeCount, isActive, applyMoves, applySedits, refreshMoves, absorbMoves, moveId, migrateMove, classPointsMap, adminMoves,
    addStudent, removeStudent, isNewFrom,
    signupSchool, trialBar,
    calcStudent, classCalc, rankMap, autoGrade, effGrades, gradeTotal, gradedMax, gradePct, hasGrades, levelOf, attPct, overallPct, maxTotal, pctCell, daySeries, trendOf, studentSummary,
    hijriLabel, hijriParts, curWeek, subjCode, loadCurr, saveCurrEdit, lessonURL,
    openSheet, closeSheet, printSheet, printDoc, printCertificate, printReport, printLetter,
    sha256, shortId, waLink,
    studentProgress, studentCard, adminLevels, schoolSummary, classDocs, loadSubs,
    switchTab, rerenderTab, renderToday, renderReg, renderGrades, renderRep, renderMore,
    toolCurriculum, toolSessions, toolPlans, toolCalc, toolSheets, toolAssign, sendSheet, liveSession, enter,
    msgSheet, msgTemplates, mkeysOf,
    loadLogo, filesSheet, nextClassOf, notifyLead, paintNotifyCard,
    // مطالبة الجلسة: تُتيح للوحة المدير أن تشرح الرفض قبل وقوعه بدل نسبته إلى الإنترنت
    claimOK, claimBar, attBucketAbs: absCnt, lastAwayOf, arNum
  };

  /* ═══ إقلاع ═══ */
  if (!CLOUD) { const ds = $("#demo-strip"); if (ds) ds.textContent = "نسخة تجريبية — طلاب بأسماء وهمية، والبيانات على هذا الجهاز فقط"; }
  else { const ds = $("#demo-strip"); if (ds) ds.style.display = "none"; }
  /* رابط بوابة الطالب في شاشة الدخول وسمٌ ثابت href="s/": من فتح ?demo كان يهبط في نسخة
     البوابة السحابية فتقف عند «جارِ التحميل…» بلا بيانات — طريقٌ مسدود أمام مدرسةٍ تجرّب. */
  if (!CLOUD) { const sl = document.querySelector(".stu-link"); if (sl) sl.setAttribute("href", "s/?demo"); }
  try { if (window.speechSynthesis) { window.speechSynthesis.getVoices(); window.speechSynthesis.onvoiceschanged = () => { try { window.speechSynthesis.getVoices(); } catch (e) { } }; } } catch (e) { }
  boot();
})();

// ═══ PWA: تثبيت على الجوال/التابلت + عمل دون اتصال للواجهة والدروس المزارة ═══
if ("serviceWorker" in navigator && location.protocol === "https:") { window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => { }); }); }
