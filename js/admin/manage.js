/* ═══════════ لوحة المدير — وحدة ⚙️ الإدارة (manage) — js/admin/manage.js ═══════════
   هيكل المدرسة والإعدادات، بطاقات مطوية (details) تعمل على الجوال أولاً:
   (1) 👤 بياناتي — تُعاد استخدام SIJIL_ADMIN.profileCard من teachers.js إن حُمّلت (وإلا بطاقة مختصرة للعرض فقط).
   (1ب) ⏰ أوقات الحصص والفسح (جدول الأجراس، مستند cfg/bell) — بداية الدوام ومدة الحصة وعددها وحتى أربع فسح،
        بمعاينة حية ونهاية دوام وطباعة صفحة واحدة وإرسال واتساب وإعادة الافتراضي. كل حساب للوقت في core.js
        (bell/periodsOf/dayEnd/bellLine/validateBell/saveBell) ولا يُحسب وقت في هذا الملف ولا يُثبَّت فيه.
   (2) 👨‍🏫 المعلمون — بطاقة لكل معلم: المادة/الفصول/الجوال/آخر رصد (من schoolDocs)/حالة الدخول (pinHash) + 📞 تواصل (SIJIL.waLink).
   (3) 🏫 الفصول — الصف، النشطون، المنقولون، معلموه ومواده، ورائد الفصل (teachers[].lead).
   (4) 🗓️ الجدول الأسبوعي الكامل — مصفوفة (اليوم×الحصة) × الفصول + طباعة أفقية بصفحة واحدة.
   (5) 🔁 سجل حركات النقل — كل D.moves بأسماء الفصول والتواريخ.
   (6) 💾 النسخة الاحتياطية — ⬇️ تصدير JSON واحد (بلا pinHash) باسم فيه التاريخ الهجري والميلادي، و⬆️ استعادة بتأكيد مزدوج
       (تجريبياً: كتابة محلية كاملة · سحابياً: كتابة دفعةً دفعة مع شريط تقدم) وكلاهما يُسجَّل في adminlog.
   (7) 🕘 سجل الإدارة adminlog (الأحدث أولاً).  (8) 🔗 المناهج (SIJIL.toolCurriculum) + ℹ️ عن البرنامج.
   لا تلمس هذه الوحدة app.js ولا بقية ملفات الوحدات؛ كل CSS خاص بها يُحقن مرة واحدة بمعرّف #adm-manage-css. */
(function () {
  "use strict";
  if (!window.SIJIL || !window.SIJIL_ADMIN) return;
  const S = () => window.SIJIL, A = () => window.SIJIL_ADMIN;
  const H = () => A().H;
  const esc = (s) => S().esc(s == null ? "" : String(s));
  const $ = (q, root) => (root || document).querySelector(q);
  const warn = (...a) => { try { console.warn("[admin/manage]", ...a); } catch (e) { } };
  const DAYS5 = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"];
  const PER = [1, 2, 3, 4, 5, 6, 7];
  const pad2 = (n) => String(n).padStart(2, "0");
  const isDemo = () => !(S().CLOUD && S().fdb);
  const ACTS = { pin: "🔑 رقم دخول", edit: "✏️ تعديل", add: "➕ إضافة معلم", lead: "🎖️ رائد فصل", schedule: "🗓️ الجدول", move: "🔁 نقل طالب", sedit: "👤 بيانات طالب", backup: "⬇️ نسخة احتياطية", restore: "⬆️ استعادة", bell: "⏰ أوقات الحصص", school: "🏫 أسماء الإدارة" };
  let curBox = null, logAll = false, busy = false, lastRestore = null;

  /* ═══ CSS الوحدة (مرة واحدة) ═══ */
  function css() {
    if ($("#adm-manage-css")) return;
    const st = document.createElement("style"); st.id = "adm-manage-css";
    st.textContent = `
.mg-sec{padding:0}
.mg-sec>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;padding:13px 14px;font-size:15px;font-weight:800;color:var(--navy);border-bottom:1px solid transparent}
.mg-sec>summary::-webkit-details-marker{display:none}
.mg-sec>summary .dot{width:8px;height:8px;border-radius:50%;background:var(--gold);flex:0 0 auto}
.mg-sec>summary .n{margin-inline-start:auto;background:var(--navy);color:var(--goldl);border-radius:12px;padding:1px 9px;font-size:11.5px;font-weight:800}
.mg-sec>summary .ar{transition:transform .18s;color:var(--muted);font-size:12px}
.mg-sec[open]>summary{border-bottom-color:var(--line)}
.mg-sec[open]>summary .ar{transform:rotate(180deg)}
.mg-bd{padding:12px 14px 14px}
.mg-me{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.mg-me .av{width:48px;height:48px;border-radius:50%;background:linear-gradient(150deg,var(--navy),var(--navy2));color:var(--goldl);display:flex;align-items:center;justify-content:center;font-size:24px;border:2px solid var(--gold);flex:0 0 auto}
.mg-me .nm{font-size:16px;font-weight:800;color:var(--navy)}
.mg-me .sb{font-size:12.5px;color:var(--muted)}
.mg-cards{display:grid;grid-template-columns:1fr;gap:9px}
@media(min-width:620px){.mg-cards{grid-template-columns:1fr 1fr}}
@media(min-width:980px){.mg-cards{grid-template-columns:1fr 1fr 1fr}}
.mg-it{border:1.5px solid var(--line);border-radius:13px;padding:10px 11px;background:#fff;display:flex;flex-direction:column;gap:7px}
.mg-it .hd{display:flex;align-items:flex-start;gap:8px}
.mg-it .hd .t{font-weight:800;color:var(--navy);font-size:14px;line-height:1.4}
.mg-it .hd .s{color:var(--muted);font-size:11.5px;display:block;font-weight:400}
.mg-it .hd .b{margin-inline-start:auto;flex:0 0 auto}
.mg-it .ch{display:flex;flex-wrap:wrap;gap:4px}
.mg-it .ch .cc{padding:2px 8px;font-size:10.5px;white-space:nowrap}
.mg-it .mt{display:flex;flex-wrap:wrap;gap:5px 12px;font-size:12px;color:var(--muted)}
.mg-it .mt b{color:var(--navy);font-weight:800}
.mg-it .ok{color:var(--ok);font-weight:800}.mg-it .no{color:var(--bad);font-weight:800}
.mg-it .wa{text-align:center;text-decoration:none;padding:8px 10px;font-size:13px;border-radius:10px;display:block}
.mg-it .wa.off{opacity:.5;pointer-events:none}
.mg-grid td,.mg-grid th{font-size:10px;padding:3px 2px;line-height:1.25}
.mg-grid td.dy{font-weight:800;background:#f3efe4;white-space:nowrap;font-size:10.5px}
.mg-grid td.pn{font-weight:800;background:#fbf6ea;width:20px}
.mg-grid td .s{display:block;font-size:8.5px;color:#777}
.mg-bd .adm-tools>.btn-gold,.mg-bd .adm-tools>.btn-plain{flex:1 1 150px;padding:11px 12px;font-size:14px}
.mg-prog{margin-top:10px}
.mg-prog .bar{height:10px;border-radius:6px;background:#eee4cf;overflow:hidden;border:1px solid var(--line)}
.mg-prog .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--gold),#c2942e);transition:width .2s}
.mg-prog .tx{font-size:12px;color:var(--muted);margin-top:5px;text-align:center}
.mg-sum{font-size:13px;line-height:2}
.mg-sum b{color:var(--navy)}
.mg-about{font-size:13.5px;line-height:2;color:var(--muted)}
.mg-about b{color:var(--navy)}
.bl-g{display:grid;grid-template-columns:1fr;gap:2px 9px;margin-top:2px}
@media(min-width:520px){.bl-g{grid-template-columns:repeat(3,1fr)}}
.bl-g .field{margin-bottom:8px}
.bl-g input{padding:10px 12px;font-size:15px;text-align:center}
.bl-hd{display:flex;align-items:center;gap:8px;margin:4px 0 8px;font-weight:800;color:var(--navy);font-size:14px}
.bl-hd b{color:var(--gold)}
.bl-hd button{margin-inline-start:auto;flex:0 0 auto;padding:8px 12px;font-size:13px}
.bl-hd button:disabled{opacity:.45;cursor:not-allowed}
.bl-br{display:grid;grid-template-columns:1fr 1fr;gap:6px 8px;border:1.5px solid var(--line);border-radius:12px;padding:8px 10px;background:#fbf9f4;margin-bottom:8px}
.bl-br .hd{grid-column:1/-1;display:flex;align-items:center;font-size:13px;font-weight:800;color:var(--navy)}
.bl-br .hd .del{margin-inline-start:auto;display:inline-flex;align-items:center;justify-content:center;min-width:40px;min-height:40px;border:1.5px solid var(--line);background:#fff;border-radius:9px;padding:7px 12px;font-size:16px;line-height:1;cursor:pointer}
.bl-br .hd .del:hover{border-color:var(--bad);background:#fff5f5}
.bl-br label{display:block;font-size:11.5px;font-weight:700;color:var(--muted)}
.bl-br .nmf{grid-column:1/-1}
.bl-br select,.bl-br input{width:100%;margin-top:3px;padding:9px 10px;border:1.5px solid var(--line);border-radius:10px;font-family:inherit;font-size:14px;background:#fff;color:var(--navy)}
.bl-pv{margin-top:8px}
.bl-pv .hd{display:flex;flex-wrap:wrap;gap:3px 8px;align-items:baseline;font-weight:800;color:var(--navy);font-size:13.5px;margin-bottom:6px}
.bl-pv .hd .ln{font-weight:400;color:var(--muted);font-size:12px}
.bl-pv .hd .un{color:var(--bad);font-weight:800;font-size:12px}
.bl-tb td,.bl-tb th{font-size:12px;padding:5px 6px;white-space:nowrap}
.bl-tb tr.brk td{background:#fdf6e3;color:#7a6520;font-weight:700}
.mg-bd .adm-tools>a.bl-wa{text-decoration:none;text-align:center;color:var(--navy)}
.bl-wa.off{opacity:.5;pointer-events:none}
@media print{.mg-sec>summary .ar,.mg-it .wa{display:none!important}}`;
    document.head.appendChild(st);
  }

  /* ═══ أدوات ═══ */
  const clsName = (cid) => cid === "out" ? "خارج المدرسة" : ((S().classById(cid) || {}).name || cid);
  const mobOf = (t) => (typeof A().mobOf === "function" ? A().mobOf(t) : String((t && (t.mob || t.phone)) || "").trim());
  const leaderOf = (cid) => (typeof A().leaderOf === "function" ? A().leaderOf(cid) : (S().D.teachers || []).find(t => (t.lead || []).includes(cid)) || null);
  const nActive = (c) => S().activeCount(c);
  const nMoved = (c) => ((c && c.students) || []).filter(s => s.moved && !s.gap).length;
  const loginTxt = (t) => t.pinHash ? { c: "ok", t: "✅ سجّل هويته" } : isDemo() ? { c: "ok", t: "🧪 تجريبي (1234)" } : { c: "no", t: "⏳ لم يسجّل" };
  const schedRows = () => (Array.isArray(S().D.schedule) ? S().D.schedule : []).filter(r => r && r.t && r.c && DAYS5.includes(r.d) && PER.includes(+r.p));
  const subjOfName = (n) => { const t = (S().D.teachers || []).find(x => x.name === n); return t ? (t.subject || "") : ""; };
  const shortName = (n) => String(n || "").replace(/^(أ\.|الأستاذ)\s*/, "").split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  const hijStamp = () => { const h = S().hijriParts(); return `${h.y}-${pad2(h.m)}-${pad2(h.d)}هـ`; };
  // آخر رصد لكل معلم (يُعاد استخدام lastByTeacher من وحدة المعلمين إن وُجدت)
  function lastMap(sd) {
    const Ad = A();
    if (typeof Ad.lastByTeacher === "function") { try { return Ad.lastByTeacher(sd); } catch (e) { warn("lastByTeacher", e); } }
    const out = {};
    Object.keys(sd.recs || {}).forEach(id => { const k = Ad.splitKey(id), d = Ad.lastRecDate(sd.recs[id]); if (d && (!out[k.tid] || d > out[k.tid])) out[k.tid] = d; });
    return out;
  }
  const sec = (id, title, bodyHtml, opts) => {
    opts = opts || {};
    return `<details class="card mg-sec" id="${id}"${opts.open ? " open" : ""}><summary><span class="dot"></span><span class="t">${title}</span>${opts.n != null ? `<span class="n">${opts.n}</span>` : '<span class="n" style="background:none"></span>'}<span class="ar">▾</span></summary><div class="mg-bd">${bodyHtml}</div></details>`;
  };

  /* ═══ (1) 👤 بياناتي ═══ */
  function drawProfile(el) {
    if (!el) return;
    const Ad = A();
    if (typeof Ad.profileCard === "function") { try { Ad.profileCard(el); return; } catch (e) { warn("profileCard", e); } }
    const s = S(), h = H(), me = s.TE || {};
    const cls = Ad.sortedClasses().filter(c => (me.classes || []).includes(c.id));
    const st = loginTxt(me), mob = mobOf(me);
    el.innerHTML = h.card("👤 بياناتي", `<div class="mg-me"><div class="av">${me.admin ? "🏫" : "👨‍🏫"}</div><div><div class="nm">${esc(me.name)}</div><div class="sb">${esc(me.admin ? "مدير المدرسة" : (me.subject || "—"))} · ${esc(me.id || "")}</div></div></div>` +
      h.row("الفصول", cls.length ? `<span class="ch" style="display:inline-flex;flex-wrap:wrap;gap:4px">${cls.map(c => `<span class="cc" style="background:var(--navy);padding:2px 8px;font-size:10.5px">${esc(c.name)}</span>`).join("")}</span>` : "—") +
      h.row("الجوال", esc(Ad.normMob(mob) || mob || "—")) +
      h.row("حالة الدخول", `<span class="${st.c === "ok" ? "ok" : "no"}" style="font-weight:800;color:var(--${st.c === "ok" ? "ok" : "bad"})">${st.t}</span>`) +
      h.note("لتعديل الجوال أو تغيير رقم الدخول: تبويب «👨‍🏫 المعلمون» ← زر «👤 بياناتي»."));
  }

  /* ═══ (1ب) ⏰ أوقات الحصص والفسح — جدول الأجراس (cfg/bell) ═══
     مسودة التحرير draft = {start, len, n, breaks[{after,min,n}], lens, days} تُبنى من SIJIL_ADMIN.bell()
     (وlens/days من المستند الخام كما كتبها المدير حتى لا تتجمّد على قيم قديمة عند الحفظ).
     لا يُحسب أي وقت هنا: المعاينة والطباعة والواتساب كلها من محرك core عبر withDraft() الذي يضع المسودة
     لحظياً في D.bell/DB.bell ثم يستعيد القيمة الأصلية فوراً (متزامن بلا await بينهما). */
  let draft = null, draftBase = "", parked = [];
  const isObj = (o) => !!o && typeof o === "object" && !Array.isArray(o);
  const rawBell = () => { const s = S(); return (s.D && s.D.bell) || (s.DB && s.DB.bell) || null; };
  const numOf = (v) => { const x = Math.round(Number(String(v == null ? "" : v).trim())); return isFinite(x) ? x : NaN; };
  const autoNm = (i) => "الفسحة " + A().ord(i + 1);
  const AUTO_RE = /^الفسحة(\s|$)/;
  // شارة عدد الحصص بصيغة عربية سليمة: حصة واحدة · حصتان · 7 حصص · 11 حصة — الدالة في core.js (مصدر واحد)
  const nPer = (n) => { const Ad = A(); return (Ad && typeof Ad.nPer === "function") ? Ad.nPer(n) : (n === 1 ? "حصة واحدة" : n === 2 ? "حصتان" : n + (n <= 10 ? " حصص" : " حصة")); };
  function newDraft() {
    const c = A().bell(), raw = rawBell() || {};
    return {
      start: c.start, len: c.len, n: c.n,
      breaks: c.breaks.map(b => ({ after: b.after, min: b.min, n: b.n })),
      lens: isObj(raw.lens) ? Object.assign({}, raw.lens) : {},
      days: isObj(raw.days) ? S().clone(raw.days) : {}
    };
  }
  // الشكل الذي يُمرَّر إلى validateBell/saveBell (مدد الحصص المخالفة تُقصّ على عدد الحصص الحالي)
  function cfgOf(d) {
    const out = { start: d.start, len: d.len, n: d.n, breaks: (d.breaks || []).map(b => ({ after: b.after, min: b.min, n: b.n })) };
    const lens = {}; Object.keys(d.lens || {}).forEach(k => { const p = numOf(k); if (p >= 1 && p <= d.n) lens[String(p)] = d.lens[k]; });
    if (Object.keys(lens).length) out.lens = lens;
    if (Object.keys(d.days || {}).length) out.days = d.days;
    return out;
  }
  function withDraft(fn) {
    const s = S(), D = s.D || {}, DB = s.DB || {};
    const hD = ("bell" in D), hB = ("bell" in DB), oD = D.bell, oB = DB.bell;
    const c = cfgOf(draft); c.days = {};                       // المعاينة للجدول العام لا لتجاوزات الأيام
    D.bell = c; DB.bell = c;
    try { return fn(); }
    finally {
      if (hD) D.bell = oD; else { try { delete D.bell; } catch (e) { } }
      if (hB) DB.bell = oB; else { try { delete DB.bell; } catch (e) { } }
    }
  }
  const bellErr = () => A().validateBell(cfgOf(draft));
  const bellItems = () => withDraft(() => { const Ad = A(), day = Ad.todayName(); return { list: Ad.periodsOf(day), end: Ad.dayEnd(day), line: Ad.bellLine(day) }; });
  const bellDirty = () => JSON.stringify(cfgOf(draft)) !== JSON.stringify(cfgOf(newDraft()));
  const renumber = () => draft.breaks.forEach((b, i) => { if (!b.n || AUTO_RE.test(b.n)) b.n = autoNm(i); });
  const sortBreaks = () => draft.breaks.sort((a, b) => (isFinite(a.after) ? a.after : 99) - (isFinite(b.after) ? b.after : 99));
  // أول حصة تصلح لفسحة جديدة (بلا تكرار ولا فسحة بعد الأخيرة) أو 0 إن لم يبقَ موضع
  function freeSlot() {
    const d = draft;
    if (!d || d.breaks.length >= 4 || !(isFinite(d.n) && d.n >= 2)) return 0;
    const used = d.breaks.map(x => x.after);
    for (let p = 1; p <= d.n - 1; p++) if (used.indexOf(p) < 0) return p;
    return 0;
  }
  // «فسحة محفوظة مؤقتاً»: موضعها أكبر من عدد الحصص الحالي، تعود تلقائياً متى اتّسع العدد (لا تُفقد أثناء الكتابة)
  const parkNote = () => parked.length
    ? H().note(`☕ ${parked.length === 1 ? "فسحة واحدة محفوظة مؤقتاً" : parked.length + " فسح محفوظة مؤقتاً"} (موضعها خارج عدد الحصص الحالي) — تعود تلقائياً إذا زدت عدد الحصص.`)
    : "";
  function breaksHtml() {
    const h = H(), Ad = A(), d = draft;
    if (!d.breaks.length) return h.note("لا فسح — اضغط «➕ إضافة فسحة» لإضافة فسحة بين حصتين.") + parkNote();
    const top = (isFinite(d.n) && d.n >= 2) ? d.n - 1 : 0;
    return d.breaks.map((b, i) => {
      const others = d.breaks.filter((x, j) => j !== i).map(x => x.after);
      const vals = [];
      if (isFinite(b.after)) vals.push(b.after);
      for (let p = 1; p <= top; p++) if (p !== b.after && others.indexOf(p) < 0) vals.push(p);
      vals.sort((x, y) => x - y);
      const opts = vals.map(p => `<option value="${p}"${p === b.after ? " selected" : ""}>بعد الحصة ${esc(Ad.ord(p))}</option>`).join("");
      return `<div class="bl-br">
        <div class="hd"><span>☕ ${esc(b.n || autoNm(i))}</span><button class="del" data-del="${i}" title="حذف هذه الفسحة" aria-label="حذف هذه الفسحة">🗑️</button></div>
        <label>موضعها<select class="bl-af" data-i="${i}">${opts}</select></label>
        <label>مدتها (دقيقة)<input type="number" class="bl-mn" data-i="${i}" min="1" max="90" inputmode="numeric" value="${isFinite(b.min) ? b.min : ""}"></label>
        <label class="nmf">اسمها كما يظهر للمعلمين<input class="bl-nm" data-i="${i}" maxlength="40" value="${esc(b.n)}" placeholder="${esc(autoNm(i))}" autocomplete="off"></label>
      </div>`;
    }).join("") + parkNote();
  }
  function previewHtml() {
    const h = H(), Ad = A(), err = bellErr();
    if (err) return `<div class="bl-pv">` + h.alert("⚠️ " + esc(err) + "<br><span style=\"color:var(--muted)\">صحّح المدخلات لتظهر المعاينة.</span>", "bad") + `</div>`;
    const p = bellItems();
    const rows = p.list.map(x => `<tr${x.brk ? ' class="brk"' : ""}><td class="nm">${x.brk ? "☕ " + esc(x.n) : "الحصة " + esc(Ad.ord(x.p))}</td><td>${esc(Ad.hm(x.from))}</td><td>${esc(Ad.hm(x.to))}</td><td>${x.to - x.from}</td></tr>`);
    return `<div class="bl-pv">
      <div class="hd"><span>👁️ المعاينة</span><span class="ln">${esc(p.line)}</span>${bellDirty() ? '<span class="un">● تغييرات غير محفوظة</span>' : ""}</div>
      ${h.table([{ t: "الحصة / الفسحة", w: 120 }, "من", "إلى", "دقيقة"], rows, { cls: "bl-tb", foot: ["🔚 نهاية الدوام", "", esc(Ad.hm(p.end)), ""] })}
    </div>`;
  }
  // نص واتساب للمعلمين — كل الأوقات من المحرك
  function bellText() {
    const s = S(), Ad = A(), p = bellItems();
    return [`⏰ جدول الأجراس — ${s.META.school.name}`, s.hijriLabel(), ""]
      .concat(p.list.map(x => x.brk ? `☕ ${x.n}: ${Ad.hm(x.from)} – ${Ad.hm(x.to)}` : `${x.p}) الحصة ${Ad.ord(x.p)}: ${Ad.hm(x.from)} – ${Ad.hm(x.to)}`))
      .concat(["", `🔚 نهاية الدوام: ${Ad.hm(p.end)}`, "", s.TE ? `إدارة المدرسة — ${s.TE.name}` : ""]).filter(x => x !== null).join("\n");
  }
  function printBell() {
    const Ad = A(), err = bellErr();
    if (err) { Ad.toast("⚠️ " + err, 3200); return; }
    const p = bellItems();
    const rows = p.list.map(x => `<tr><td class="nm">${x.brk ? "☕ " + esc(x.n) : "الحصة " + esc(Ad.ord(x.p))}</td><td>${esc(Ad.hm(x.from))}</td><td>${esc(Ad.hm(x.to))}</td><td>${x.to - x.from}</td></tr>`).join("");
    Ad.printHtml("جدول الأجراس — أوقات الحصص والفسح",
      `<table class="compact"><tr><th>الحصة / الفسحة</th><th>من</th><th>إلى</th><th>الدقائق</th></tr>${rows}` +
      `<tr class="tot"><td class="nm"><b>🔚 نهاية الدوام</b></td><td colspan="3"><b>${esc(Ad.hm(p.end))}</b></td></tr></table>` +
      `<div class="ctr">${esc(p.line)}</div>` +
      (bellDirty() ? `<div class="note">هذه معاينة غير محفوظة — اضغط «💾 حفظ الأوقات» لاعتمادها في التطبيق.</div>` : "") +
      Ad.sigLine(["principal", "vice"]),
      { sub: "⏰ أوقات الحصص والفسح", cls: "compact" });
  }
  function bellHtml() {
    const h = H(), Ad = A();
    // إعادة رسم التبويب لسبب آخر (سجل الإدارة، حفظ أسماء الإدارة، العودة للتبويب) لا تُضيّع تحريراً غير محفوظ
    const base = JSON.stringify(cfgOf(newDraft()));
    if (!(draft && draftBase === base && bellDirty())) { draft = newDraft(); draftBase = base; parked = []; }
    return h.note("جدول الأجراس مصدر كل وقت في التطبيق: إبراز الحصة الجارية، وأوقات الحصص في الجدول، وشريط «الحصة الحالية» عند المعلمين. اضبطه مرة واحدة لمدرستك.") +
      `<div class="bl-g">
        <div class="field"><label>⏱️ بداية الدوام</label><input type="time" id="bl-start" value="${esc(Ad.hhmm(draft.start))}"></div>
        <div class="field"><label>⌛ مدة الحصة (دقيقة)</label><input type="number" id="bl-len" min="5" max="120" inputmode="numeric" value="${draft.len}"></div>
        <div class="field"><label>🔢 عدد الحصص</label><input type="number" id="bl-n" min="1" max="12" inputmode="numeric" value="${draft.n}"></div>
      </div>
      <div class="bl-hd"><span>☕ الفسح <b id="bl-bn">${draft.breaks.length}</b> من 4</span><button class="btn-plain" id="bl-add">➕ إضافة فسحة</button></div>
      <div id="bl-brks">${breaksHtml()}</div>
      <div id="bl-prev">${previewHtml()}</div>
      <div class="login-err" id="bl-err" style="margin-top:4px"></div>` +
      h.tools(`${h.btn("💾 حفظ الأوقات", 'id="bl-save"')}${h.btn("🖨️ طباعة جدول الأجراس", 'id="bl-print"', "btn-plain")}` +
        `${h.btn("↺ إعادة الافتراضي", 'id="bl-def"', "btn-plain")}<a class="btn-plain bl-wa" id="bl-wa" target="_blank" rel="noopener">💬 إرسال للمعلمين</a>`);
  }
  /* ربط النموذج: كل تغيير يحدّث المسودة ثم المعاينة (بلا حفظ)، وتغيير الموضع/العدد يعيد بناء صفوف الفسح فقط */
  function bindBell(b) {
    const Ad = A(), q = (id) => $("#" + id, b);
    const upPrev = () => {
      const pv = q("bl-prev"); if (pv) pv.innerHTML = previewHtml();
      const er = q("bl-err"); if (er) er.textContent = "";
      const bn = q("bl-bn"); if (bn) bn.textContent = draft.breaks.length;
      const add = q("bl-add"); if (add) add.disabled = !freeSlot();
      const err = bellErr(), wa = q("bl-wa");
      if (wa) { wa.classList.toggle("off", !!err); if (err) wa.removeAttribute("href"); else wa.href = S().waLink("", bellText()); }
    };
    const upBreaks = () => { const el = q("bl-brks"); if (el) { el.innerHTML = breaksHtml(); bindRows(); } upPrev(); };
    function bindRows() {
      const box = q("bl-brks"); if (!box) return;
      box.querySelectorAll(".bl-af").forEach(sel => sel.onchange = () => { const i = +sel.dataset.i; draft.breaks[i].after = numOf(sel.value); sortBreaks(); renumber(); upBreaks(); });
      box.querySelectorAll(".bl-mn").forEach(inp => inp.oninput = () => { draft.breaks[+inp.dataset.i].min = numOf(inp.value); upPrev(); });
      box.querySelectorAll(".bl-nm").forEach(inp => inp.oninput = () => { draft.breaks[+inp.dataset.i].n = inp.value.slice(0, 40); upPrev(); });
      box.querySelectorAll(".del").forEach(bt => bt.onclick = () => { draft.breaks.splice(+bt.dataset.del, 1); renumber(); upBreaks(); });   // حذف صريح: لا يُركن
    }
    const st = q("bl-start"); if (st) st.oninput = () => { draft.start = Ad.parseHM(st.value); upPrev(); };
    const ln = q("bl-len"); if (ln) ln.oninput = () => { draft.len = numOf(ln.value); upPrev(); };
    /* تغيير «عدد الحصص» يمرّ حتماً بأرقام وسيطة: من 7 إلى 10 يُكتب «1» أولاً. لو أُسقطت الفسح عندها
       لضاعت كلها بلا تنبيه ولا تراجع — لذلك تُركن جانباً في parked وتعود بترتيبها متى اتّسع العدد. */
    const nn = q("bl-n"); if (nn) nn.oninput = () => {
      draft.n = numOf(nn.value);
      if (isFinite(draft.n) && draft.n >= 1) {
        const top = draft.n - 1, fits = (x) => x && x.after >= 1 && x.after <= top;
        parked = parked.concat(draft.breaks.filter(x => !fits(x)));
        draft.breaks = draft.breaks.filter(fits);
        const back = parked.filter(fits);
        if (back.length) {
          parked = parked.filter(x => back.indexOf(x) < 0);
          const used = draft.breaks.map(x => x.after);
          back.forEach(b => { if (used.indexOf(b.after) < 0 && draft.breaks.length < 4) { draft.breaks.push(b); used.push(b.after); } });
        }
        sortBreaks(); renumber();
      }
      upBreaks();
    };
    const ad = q("bl-add"); if (ad) ad.onclick = () => {
      const p = freeSlot(); if (!p) { Ad.toast("لا يمكن إضافة فسحة أخرى — أربع فسح كحد أقصى، ولا فسحة بعد الحصة الأخيرة", 3200); return; }
      const last = draft.breaks[draft.breaks.length - 1], def = (Ad.defaultBell().breaks[0] || {}).min || 15;
      draft.breaks.push({ after: p, min: (last && isFinite(last.min) && last.min) || def, n: "" });
      sortBreaks(); renumber(); upBreaks();
    };
    const df = q("bl-def"); if (df) df.onclick = () => {
      const d = Ad.defaultBell();
      draft = { start: d.start, len: d.len, n: d.n, breaks: d.breaks.map(x => ({ after: x.after, min: x.min, n: x.n })), lens: {}, days: {} }; parked = [];
      const s1 = q("bl-start"), l1 = q("bl-len"), n1 = q("bl-n");
      if (s1) s1.value = Ad.hhmm(draft.start); if (l1) l1.value = draft.len; if (n1) n1.value = draft.n;
      upBreaks();
      Ad.toast("↺ أُعيدت القيم الافتراضية في النموذج — اضغط «💾 حفظ الأوقات» لاعتمادها", 3600);
    };
    const pr = q("bl-print"); if (pr) pr.onclick = printBell;
    const sv = q("bl-save"); if (sv) sv.onclick = async () => {
      if (busy) return;
      const er = q("bl-err"), err = bellErr();
      if (err) { if (er) er.textContent = "⚠️ " + err; Ad.toast("⚠️ " + err, 3400); return; }
      busy = true; sv.disabled = true; const lbl = sv.textContent; sv.textContent = "⏳ جارِ الحفظ…";
      let r = null;
      try { r = await Ad.saveBell(cfgOf(draft)); }
      catch (e) { warn("saveBell", e); r = { ok: false, err: (e && e.message) || String(e) }; }
      busy = false;
      if (r && r.ok) Ad.toast("✔ حُفظت أوقات الحصص — تظهر للمعلمين عند فتح التطبيق", 3600);
      else {
        const m = (r && r.err) || "تعذّر الحفظ";
        const er2 = $("#bl-err", b); if (er2) er2.textContent = "⚠️ " + m;
        Ad.toast("⚠️ " + m, 3600);
      }
      const sv2 = $("#bl-save", b); if (sv2) { sv2.disabled = false; sv2.textContent = lbl; }
    };
    bindRows();
    upPrev();
  }
  // يفتح البطاقة ويمرّر إليها (يستدعيها تبويب «🗓️ الجدول» عبر SIJIL_ADMIN.openBell)
  function openBell() {
    // البطاقة قد تكون في DOM لكن لوحة ⚙️ الإدارة مخفية، ولا تُرسم إلا بعد schoolDocs — لذلك ننتظرها
    const go = () => {
      const p = document.querySelector("#tab-adm-manage"), el = $("#mg-s-bell");
      if (!p || p.classList.contains("hidden") || !el) return false;
      el.open = true;
      try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { try { el.scrollIntoView(); } catch (e2) { } }
      return true;
    };
    if (go()) return;
    try { S().switchTab("manage"); } catch (e) { try { A().render("manage"); } catch (e2) { warn("openBell", e2); } }
    let n = 0;
    const t = setInterval(() => { if (go() || ++n > 14) clearInterval(t); }, 150);
  }

  /* ═══ (2) 👨‍🏫 المعلمون ═══ */
  function teachersHtml(sd) {
    const s = S(), h = H(), Ad = A(), last = lastMap(sd);
    const list = (s.D.teachers || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (!list.length) return h.empty("لا معلمين مسجّلين بعد");
    const cards = list.map(t => {
      const st = loginTxt(t), mob = mobOf(t), lr = last[t.id], dd = Ad.daysAgo(lr);
      const cls = Ad.sortedClasses().filter(c => (t.classes || []).includes(c.id));
      const leads = (t.lead || []).map(clsName);
      const msg = `السلام عليكم أ. ${t.name}\n${s.META.school.name} — إدارة المدرسة\n`;
      return `<div class="mg-it">
        <div class="hd"><div><span class="t">${esc(t.name)}</span><span class="s">${esc(t.subject || "—")} · ${esc(t.id)}</span></div>${t.admin ? '<span class="b cc" style="background:var(--gold);color:var(--navy);padding:2px 8px;font-size:10.5px">المدير</span>' : ""}</div>
        <div class="ch">${cls.length ? cls.map(c => `<span class="cc" style="background:${(t.lead || []).includes(c.id) ? "var(--gold);color:var(--navy)" : "var(--navy)"}">${(t.lead || []).includes(c.id) ? "🎖️ " : ""}${esc(c.name)}</span>`).join("") : '<span style="color:#bbb;font-size:12px">لا فصول مسندة</span>'}</div>
        <div class="mt"><span>📱 <b>${esc(Ad.normMob(mob) || mob || "—")}</b></span><span>⏱️ آخر رصد: <b>${lr ? esc(Ad.fmtDate(lr)) + (dd === 0 ? " (اليوم)" : " (قبل " + dd + " يوم)") : ((t.classes || []).length ? "لا رصد" : "—")}</b></span><span class="${st.c}">${st.t}</span>${leads.length ? `<span>🎖️ رائد ${esc(leads.join("، "))}</span>` : ""}</div>
        <a class="btn-gold wa${mob && Ad.waPhone(mob) ? "" : " off"}" ${mob && Ad.waPhone(mob) ? `href="${Ad.waHref(mob, msg)}" target="_blank" rel="noopener"` : ""}>📞 تواصل</a>
      </div>`;
    }).join("");
    const nReg = list.filter(t => t.pinHash).length, nNo = list.filter(t => !t.admin && (t.classes || []).length && !last[t.id]).length;
    const nStaff = (typeof Ad.staff === "function" ? Ad.staff() : list.filter(t => !t.admin && (t.classes || []).length)).length;
    return h.kpis([{ v: nStaff, l: "معلماً بفصول" }, { v: nReg, l: isDemo() ? "بصمة دخول" : "سجّلوا هويتهم" }, { v: nNo, l: "بلا رصد" }]) +
      h.note(`البطاقات أدناه ${list.length} حساباً (منها حساب المدير والحسابات بلا فصول)، والمؤشر يعدّ ${nStaff} معلماً بفصول.`) +
      `<div class="mg-cards">${cards}</div>` + h.tools(h.printBtn("mg-p-tch", "🖨️ طباعة قائمة المعلمين"));
  }

  /* ═══ (3) 🏫 الفصول ═══ */
  function classesHtml() {
    const s = S(), h = H(), Ad = A(), cls = Ad.sortedClasses();
    if (!cls.length) return h.empty("لا فصول");
    const cards = cls.map(c => {
      const ts = (s.D.teachers || []).filter(t => (t.classes || []).includes(c.id));
      const ld = leaderOf(c.id), mv = nMoved(c);
      return `<div class="mg-it">
        <div class="hd"><div><span class="t">${esc(c.name)}</span><span class="s">${esc(s.GNAME[c.gc] ? "الصف " + s.GNAME[c.gc] : c.id)} · ${esc(c.id)}</span></div><span class="b cc" style="background:var(--navy);padding:2px 9px;font-size:11px">${nActive(c)} طالباً</span></div>
        <div class="mt"><span>👥 نشط: <b>${nActive(c)}</b></span><span>🔁 منقول/خارج: <b>${mv}</b></span><span>📚 مواد: <b>${new Set(ts.map(t => t.subject).filter(Boolean)).size}</b></span><span>🎖️ الرائد: <b>${ld ? esc(ld.name) : "—"}</b></span></div>
        <div class="ch">${ts.length ? ts.map(t => `<span class="cc" style="background:var(--navy2)">${esc(shortName(t.name))} · ${esc(t.subject || "—")}</span>`).join("") : '<span style="color:#bbb;font-size:12px">لا معلمين</span>'}</div>
      </div>`;
    }).join("");
    const tot = cls.reduce((a, c) => a + nActive(c), 0), totM = cls.reduce((a, c) => a + nMoved(c), 0);
    return h.kpis([{ v: cls.length, l: "فصلاً" }, { v: tot, l: "طالباً نشطاً" }, { v: totM, l: "منقولاً/خارجاً" }]) +
      `<div class="mg-cards">${cards}</div>` + h.tools(h.printBtn("mg-p-cls", "🖨️ طباعة الفصول"));
  }

  /* ═══ (4) 🗓️ الجدول الأسبوعي الكامل ═══ */
  function gridHtml(cls, rows, forPrint) {
    const cell = (d, p, cid) => rows.find(r => r.d === d && +r.p === p && r.c === cid) || null;
    let h = `<table class="report-table mg-grid"><tr><th>اليوم</th><th>ح</th>${cls.map(c => `<th>${esc(c.name)}</th>`).join("")}</tr>`;
    DAYS5.forEach(d => PER.forEach((p, i) => {
      h += `<tr>${i === 0 ? `<td class="dy" rowspan="${PER.length}">${esc(d)}</td>` : ""}<td class="pn">${p}</td>` +
        cls.map(c => { const r = cell(d, p, c.id); return `<td>${r ? esc(shortName(r.t)) + `<span class="s">${esc(subjOfName(r.t))}</span>` : ""}</td>`; }).join("") + "</tr>";
    }));
    return forPrint ? h + "</table>" : `<div class="table-scroll">${h}</table></div>`;
  }
  function scheduleHtml() {
    const h = H(), Ad = A(), cls = Ad.sortedClasses(), rows = schedRows();
    if (!cls.length) return h.empty("لا فصول");
    if (!rows.length) return h.empty("لا جدول مدرسي بعد — أنشئه من تبويب «🗓️ الجدول»") + h.tools(h.printBtn("mg-p-sch", "🖨️ طباعة الجدول"));
    const names = new Set(rows.map(r => r.t));
    return h.kpis([{ v: rows.length, l: "حصة أسبوعياً" }, { v: cls.length, l: "فصلاً" }, { v: names.size, l: "معلماً في الجدول" }]) +
      h.note("مصفوفة الأيام × الحصص لكل فصل — للتحرير استخدم تبويب «🗓️ الجدول».") +
      gridHtml(cls, rows, false) + h.tools(h.printBtn("mg-p-sch", "🖨️ طباعة الجدول العام"));
  }
  function printSchedule() {
    const Ad = A(), cls = Ad.sortedClasses(), rows = schedRows();
    const SC = window.SIJIL_ADMIN_SCHEDULE;
    if (SC && typeof SC.printAll === "function") { try { SC.printAll(); return; } catch (e) { warn("printAll", e); } }
    Ad.printHtml("الجدول المدرسي العام",
      `<style>.mgp table{margin:6px 0}.mgp th,.mgp td{padding:3px 4px;font-size:10.5px;line-height:1.25}.mgp td.dy{font-weight:800;background:#f3efe4}.mgp td.pn{font-weight:800;background:#fbf6ea;width:22px}.mgp td .s{display:block;font-size:8.5px;color:#666}</style>` +
      `<div class="mgp">${gridHtml(cls, rows, true)}<div style="font-size:11px;color:#555;margin-top:6px;text-align:center">${rows.length} حصة أسبوعياً — ${cls.length} فصلاً</div></div>`,
      { land: true, sub: "الجدول المدرسي العام" });
  }

  /* ═══ (5) 🔁 سجل حركات النقل ═══ */
  const movesList = () => (S().D.moves || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  function movesHtml() {
    const h = H(), Ad = A(), mv = movesList();
    if (!mv.length) return h.empty("لا حركات نقل بعد") + h.tools(h.btn("👥 نقل الطلاب", 'id="mg-mv-open"'));
    const rows = mv.map((m, i) => [String(i + 1), esc(m.name || "—"), esc(clsName(m.from)), esc(clsName(m.to)), Ad.fmtTs(m.ts), esc(m.tn || "—"),
      m.conflict ? '<span style="color:var(--bad);font-weight:800">⚠️ لم تُطبَّق</span>' : (m.migFailed && m.migFailed.length ? '<span style="color:var(--bad)">⚠️ ترحيل ناقص</span>' : '<span style="color:var(--ok)">✔</span>')]);
    const out = mv.filter(m => m.to === "out").length;
    return h.kpis([{ v: mv.length, l: "حركة" }, { v: mv.length - out, l: "نقل بين الفصول" }, { v: out, l: "خروج من المدرسة" }]) +
      h.table(["م", { t: "الطالب", w: 130 }, "من", "إلى", "التاريخ", "بواسطة", "الحالة"], rows, { id: "mg-mv-tb", nameIdx: 1 }) +
      h.tools(`${h.btn("👥 نقل الطلاب", 'id="mg-mv-open"')}${h.printBtn("mg-p-mv", "🖨️ طباعة السجل")}`);
  }

  /* ═══ (6) 💾 النسخة الاحتياطية الشاملة ═══ */
  async function allSubs() {
    const s = S(); if (isDemo()) return [];
    try { const q = await s.fdb.collection("subs").get(); const out = []; q.forEach(d => out.push(Object.assign({ id: d.id }, d.data() || {}))); return out; }
    catch (e) { warn("subs", e && e.message); return []; }
  }
  function download(text, name) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) { } }, 4000);
  }
  // يستدعيها أيضاً زر «⬇️ نسخة احتياطية شاملة» في لوحة القيادة (home.js يبحث عن SIJIL_ADMIN.backupAll)
  async function backupAll() {
    const s = S(), Ad = A();
    Ad.toast("⏳ جارِ تجميع بيانات المدرسة…");
    const sd = await Ad.schoolDocs(true), subs = await allSubs();
    const teachers = (s.D.teachers || []).map(t => { const x = Object.assign({}, t); delete x.pinHash; return x; });
    const out = {
      v: 3, kind: "sijil-school-backup", school: s.META.school.name, by: s.TE ? s.TE.name : "", cloud: !!(s.CLOUD && s.fdb),
      ts: Date.now(), hijri: hijStamp(), greg: Ad.isoDate(), meta: s.D.meta || null,
      teachers, classes: s.D.classes || [], schedule: s.D.schedule || [],
      recs: sd.recs || {}, grades: sd.grades || {}, comms: sd.comms || {},
      moves: sd.moves || [], assign: sd.assign || [], subs, sedits: sd.sedits || {}, adminlog: sd.adminlog || []
    };
    const txt = JSON.stringify(out);
    download(txt, `نسخة سجلي الشاملة - ${s.META.school.name} - ${hijStamp()} - ${Ad.isoDate()}.json`);
    Ad.toast(`⬇️ نُزّلت النسخة (${Math.round(txt.length / 1024)} كيلوبايت)`, 3000);
    try { await Ad.adminlog("backup", `تصدير نسخة احتياطية شاملة (${teachers.length} معلماً، ${(out.classes || []).length} فصلاً، ${Object.keys(out.recs).length} مستند رصد)`); } catch (e) { warn("log/backup", e); }
    return out;
  }
  const cnt = (o) => o ? Object.keys(o).length : 0;
  /* طيّ خرائط النسخة (tid_cid → cid) — تُستعمل في العدّ قبل التنفيذ وفي التنفيذ نفسه حتى لا يختلف الرقمان */
  function foldMap(map, kind) {
    const out = {}, Ad = A();
    Object.keys(map || {}).forEach(id => {
      const cid = Ad.splitKey(id).cid || id, v = map[id];
      if (kind === "recs") { out[cid] = out[cid] || {}; Object.keys(v || {}).forEach(dt => { out[cid][dt] = Object.assign({}, out[cid][dt] || {}, v[dt] || {}); }); }
      else if (kind === "grades") out[cid] = Object.assign({}, out[cid] || {}, v || {});
      else out[cid] = (out[cid] || []).concat(Array.isArray(v) ? v : []);
    });
    return out;
  }
  // عدد المستندات التي ستُكتب محلياً (تجريبياً) — المصدر الوحيد للرقم في التأكيد والنتيجة
  function demoDocs(b) {
    return cnt(foldMap(b.recs, "recs")) + cnt(foldMap(b.grades, "grades")) + cnt(foldMap(b.comms, "comms")) +
      (b.moves || []).length + cnt(b.sedits && typeof b.sedits === "object" ? b.sedits : {}) +
      (Array.isArray(b.schedule) ? 1 : 0) +
      ((Array.isArray(b.classes) && b.classes.length) ? b.classes.length : 0) +
      ((Array.isArray(b.teachers) && b.teachers.length) ? b.teachers.length : 0);
  }
  function summarize(b) {
    return {
      teachers: (b.teachers || []).length, classes: (b.classes || []).length,
      students: (b.classes || []).reduce((a, c) => a + ((c.students || []).filter(x => x && !x.gap && !x.moved).length), 0),
      schedule: (b.schedule || []).length, recs: cnt(b.recs), grades: cnt(b.grades), comms: cnt(b.comms),
      moves: (b.moves || []).length, assign: (b.assign || []).length, subs: (b.subs || []).length, sedits: cnt(b.sedits)
    };
  }
  function summaryHtml(b, sm) {
    const line = (l, v, note) => `<div>• <b>${l}:</b> ${v}${note ? ` <span style="color:var(--muted);font-size:12px">${note}</span>` : ""}</div>`;
    return `<div class="mg-sum">
      <div style="margin-bottom:6px">📦 <b>${esc(b.school || "—")}</b> — ${esc(b.hijri || "")} ${esc(b.greg || "")} ${b.by ? "· بواسطة " + esc(b.by) : ""} ${b.cloud ? "☁️" : "🧪"}</div>
      ${line("المعلمون", sm.teachers, isDemo() ? "" : "تُحدَّث بياناتهم (يبقى رقم الدخول كما هو)")}
      ${line("الفصول والطلاب", `${sm.classes} فصلاً · ${sm.students} طالباً نشطاً`, isDemo() ? "للجلسة الحالية" : "لا تُكتب سحابياً (محميّة بقواعد الأمان)")}
      ${line("الجدول المدرسي", sm.schedule + " حصة")}
      ${line("الرصد اليومي", sm.recs + " مستنداً")}
      ${line("الدرجات", sm.grades + " مستنداً")}
      ${line("سجل التواصل", sm.comms + " مستنداً")}
      ${line("حركات النقل", sm.moves + " حركة", isDemo() ? "" : "تُضاف الجديدة فقط (لا تُعدَّل القديمة)")}
      ${line("الأوراق التفاعلية", `${sm.assign} ورقة · ${sm.subs} تسليماً`)}
      ${line("تعديلات بيانات الطلاب", sm.sedits + " فصلاً")}
    </div>`;
  }
  // بناء مهام الكتابة السحابية (مستند لكل مهمة) — القواعد تمنع classes/meta وتمنع تعديل moves القديمة
  function cloudTasks(b) {
    const s = S(), Ad = A(), T = [], tn = (s.TE && s.TE.name) || "الإدارة";
    const push = (sec, run) => T.push({ sec, run });
    if (typeof Ad.writeTeacher === "function") (b.teachers || []).forEach(t => {
      if (!/^t[0-9]{2,3}$/.test(String(t.id || ""))) return;
      push("المعلمون", () => Ad.writeTeacher(t.id, { name: t.name, subject: t.subject || "", mob: t.mob || t.phone || "", classes: t.classes || [], lead: t.lead || [] }, false));
    });
    const rows = (b.schedule || []).map(r => ({ t: String(r.t || ""), d: String(r.d || ""), p: +r.p || 0, c: String(r.c || "") })).filter(r => r.t && r.c).slice(0, 600);
    if (rows.length) push("الجدول", () => s.fdb.doc("schedule/all").set({ rows, tn, ts: Date.now() }));
    Object.keys(b.recs || {}).forEach(id => push("الرصد", () => s.fdb.doc("recs/" + id).set({ d: b.recs[id] || {}, tn, ts: Date.now() })));
    Object.keys(b.grades || {}).forEach(id => push("الدرجات", () => s.fdb.doc("grades/" + id).set({ g: b.grades[id] || {}, tn, ts: Date.now() })));
    Object.keys(b.comms || {}).forEach(id => push("التواصل", () => s.fdb.doc("comms/" + id).set({ c: (b.comms[id] || []).slice(-500), tn, ts: Date.now() })));
    Object.keys(b.sedits || {}).forEach(cid => { const d = b.sedits[cid] || {}; if (d.s) push("بيانات الطلاب", () => s.fdb.doc("sedits/" + cid).set({ s: d.s, tn, ts: Date.now() }, { merge: true })); });
    const have = new Set((s.D.moves || []).map(m => m.id));
    (b.moves || []).forEach(m => {
      if (!m.id || have.has(m.id)) return;
      push("حركات النقل", () => s.fdb.doc("moves/" + m.id).set({ from: String(m.from || ""), si: +m.si || 0, to: String(m.to || ""), newSi: +m.newSi || 0, name: String(m.name || "").slice(0, 120), tn: String(m.tn || tn).slice(0, 80), ts: +m.ts || Date.now() }));
    });
    (b.assign || []).forEach(a => { if (!a.id) return; const x = Object.assign({}, a); delete x.id; push("الأوراق", () => s.fdb.doc("assign/" + a.id).set(x)); });
    (b.subs || []).forEach(u => { if (!u.id) return; const x = Object.assign({}, u); delete x.id; push("التسليمات", () => s.fdb.doc("subs/" + u.id).set(x)); });
    return T;
  }
  // الوضع التجريبي: كتابة كاملة في DB المحلية + D الحية (بلا إعادة تطبيق الحركات — اللقطة مطبَّقة أصلاً)
  function restoreDemo(b) {
    const s = S(), D = s.D, DB = s.DB, Ad = A(), done = {};
    DB.recs = foldMap(b.recs, "recs"); done["الرصد"] = cnt(DB.recs);
    DB.grades = foldMap(b.grades, "grades"); done["الدرجات"] = cnt(DB.grades);
    DB.comms = foldMap(b.comms, "comms"); done["التواصل"] = cnt(DB.comms);
    DB.moves = (b.moves || []).slice(); D.moves = DB.moves; done["حركات النقل"] = DB.moves.length;
    DB.sedits = (b.sedits && typeof b.sedits === "object") ? b.sedits : {}; D.sedits = DB.sedits; done["بيانات الطلاب"] = cnt(DB.sedits);
    if (Array.isArray(b.schedule)) { DB.schedule = b.schedule.slice(); D.schedule = DB.schedule; done["الجدول"] = DB.schedule.length; }
    if (Array.isArray(b.classes) && b.classes.length) { D.classes = s.clone(b.classes); done["الفصول"] = D.classes.length; }
    // المعلمون: الحقول المسموحة فقط، مع الحفاظ على admin وبصمة الدخول الحالية
    if (Array.isArray(b.teachers) && b.teachers.length) {
      DB.tedits = (DB.tedits && typeof DB.tedits === "object" && !Array.isArray(DB.tedits)) ? DB.tedits : {};
      b.teachers.forEach(t => {
        const tid = String(t.id || ""); if (!/^t[0-9]{2,3}$/.test(tid)) return;
        let cur = (D.teachers || []).find(x => x.id === tid);
        const doc = { name: String(t.name || "").slice(0, 80), subject: String(t.subject || "").slice(0, 80), mob: String(t.mob || t.phone || "").slice(0, 20), classes: (t.classes || []).slice(0, 40), ts: Date.now() };
        if ((t.lead || []).length) doc.lead = t.lead.slice(0, 40);
        if (cur && typeof cur.admin === "boolean") doc.admin = cur.admin; else if (typeof t.admin === "boolean") doc.admin = t.admin;
        if (cur && cur.pinHash) doc.pinHash = cur.pinHash;
        if (!doc.name) return;
        if (!cur) { cur = { id: tid }; D.teachers.push(cur); }
        Object.keys(cur).forEach(k => { if (k !== "id" && !(k in doc)) delete cur[k]; });
        Object.assign(cur, doc);
        DB.tedits[tid] = doc;
      });
      D.teachers.sort((a, b2) => String(a.id).localeCompare(String(b2.id)));
      done["المعلمون"] = b.teachers.length;
    }
    s.save();
    try { if (typeof Ad.refreshHeader === "function") Ad.refreshHeader(); } catch (e) { }
    // العدد نفسه المعروض في التأكيد (demoDocs) — مستند لكل فصل/معلم + مستند الجدول
    return { done, docs: demoDocs(b) };
  }
  async function doRestore(b, prog, tasks) {
    const s = S(), Ad = A();
    const set = (p, txt) => { if (!prog) return; const bar = $(".bar i", prog), tx = $(".tx", prog); if (bar) bar.style.width = Math.max(0, Math.min(100, p)) + "%"; if (tx) tx.textContent = txt; };
    prog && prog.classList.remove("hidden");
    set(4, "جارِ التحضير…");
    if (isDemo()) {
      const r = restoreDemo(b), detail = Object.keys(r.done).map(k => `${k} ${r.done[k]}`).join(" · ");
      set(100, "✔ اكتملت الاستعادة محلياً");
      await Ad.adminlog("restore", `استعادة نسخة (${b.hijri || ""}): ` + detail);
      return { ok: r.docs, fail: 0, notes: ["الوضع التجريبي: كل البيانات على هذا الجهاز فقط", detail] };
    }
    const T = tasks || cloudTasks(b);
    if (!T.length) { set(100, "لا شيء لاستعادته"); return { ok: 0, fail: 0, notes: ["لا مستندات قابلة للكتابة في هذه النسخة"] }; }
    let ok = 0, fail = 0; const failSec = {};
    for (let i = 0; i < T.length; i += 6) {
      const chunk = T.slice(i, i + 6);
      const res = await Promise.all(chunk.map(t => t.run().then(() => true).catch(e => { warn("restore/" + t.sec, e && e.message); failSec[t.sec] = (failSec[t.sec] || 0) + 1; return false; })));
      res.forEach(r => r ? ok++ : fail++);
      set(4 + Math.round((i + chunk.length) / T.length * 92), `${chunk[chunk.length - 1].sec} — ${i + chunk.length}/${T.length}`);
    }
    set(100, `✔ ${ok} مستنداً` + (fail ? ` · ⚠️ ${fail} فشل` : ""));
    const notes = ["الفصول وبيانات المدرسة الأساسية لا تُكتب سحابياً (قواعد الأمان)", "سجل الإدارة القديم لا يُستعاد (سجل للإنشاء فقط)"];
    Object.keys(failSec).forEach(k => notes.push(`تعذّرت كتابة ${failSec[k]} مستنداً في «${k}»`));
    await Ad.adminlog("restore", `استعادة نسخة (${b.hijri || ""}): ${ok} مستنداً${fail ? ` — ${fail} فشل` : ""}`);
    return { ok, fail, notes };
  }
  function backupHtml() {
    const h = H();
    return h.note("نسخة واحدة بصيغة JSON تضم: المعلمين (بلا أرقام الدخول)، الفصول والطلاب، الجدول، الرصد اليومي، الدرجات، سجل التواصل، حركات النقل، الأوراق التفاعلية وتسليماتها، تعديلات بيانات الطلاب، وسجل الإدارة.") +
      h.tools(`${h.btn("⬇️ تصدير نسخة شاملة", 'id="mg-bk"')}${h.btn("⬆️ استعادة من ملف", 'id="mg-rs"', "btn-plain")}`) +
      `<input type="file" id="mg-file" accept="application/json,.json" style="display:none">` +
      `<div class="mg-prog hidden" id="mg-prog"><div class="bar"><i></i></div><div class="tx"></div></div>` +
      h.alert(isDemo()
        ? "🧪 <b>الوضع التجريبي:</b> الاستعادة تكتب في بيانات هذا الجهاز فقط، وتُطبَّق فوراً على الشاشات."
        : "⚠️ <b>الاستعادة تستبدل بيانات المدرسة السحابية</b> بما في الملف (الرصد والدرجات والتواصل والجدول وبيانات المعلمين). صدّر نسخة قبلها، ولا تستعد إلا من ملف تثق به.", isDemo() ? "" : "bad") +
      (lastRestore ? h.alert(`✔ <b>آخر استعادة:</b> ${lastRestore.ok} من ${lastRestore.plan != null ? lastRestore.plan : lastRestore.ok} مستنداً${lastRestore.fail ? ` · تعذّر ${lastRestore.fail}` : ""}<br>${(lastRestore.notes || []).map(n => "• " + esc(n)).join("<br>")}`, "ok") : "");
  }

  /* ═══ (7) 🕘 سجل الإدارة ═══ */
  function logHtml(sd) {
    const h = H(), Ad = A(), all = (sd.adminlog || []).slice();
    if (!all.length) return h.empty("لا عمليات إدارية بعد");
    const show = logAll ? all : all.slice(0, 25);
    const rows = show.map(l => [ACTS[l.act] || esc(l.act || "—"), `<span style="white-space:normal;font-weight:400;text-align:right;display:block">${esc(l.note || "")}</span>`, esc(l.tn || "—"), Ad.fmtTs(l.ts)]);
    return h.table([{ t: "العملية", w: 110 }, { t: "التفاصيل", w: 200 }, "بواسطة", "الوقت"], rows, { id: "mg-log-tb", nameCol: false }) +
      h.tools(`${all.length > 25 ? h.btn(logAll ? "▲ عرض الأحدث فقط" : `▼ عرض الكل (${all.length})`, 'id="mg-log-more"', "btn-plain") : ""}${h.printBtn("mg-p-log", "🖨️ طباعة السجل")}`);
  }

  /* ═══ (8) 🔗 المناهج وعن البرنامج ═══ */
  function linksHtml() {
    const s = S(), h = H();
    return h.tools(`${h.btn("📚 توزيع المناهج", 'id="mg-curr"')}`) +
      `<div class="mg-about">سجلي — سجل المتابعة الرقمي — ${s.CLOUD ? "النسخة السحابية المشتركة ☁️" : "نسخة تجريبية محلية 🧪"}.<br>يعمل على أي جهاز: جوال، تابلت، وكمبيوتر.<br><b>المدرسة:</b> ${esc(s.META.school.name)} · <b>العام:</b> ${esc(s.META.school.year || "")} · ${esc(s.META.school.term_lbl || "")}<br><b>المطوّر:</b> أ. ضيف الله أحمد محمد مشني</div>`;
  }

  /* ═══ الرسم والربط ═══ */
  async function render(b) {
    css(); curBox = b;
    const h = H();
    b.innerHTML = h.card("⚙️ الإدارة", h.empty("جارِ تحميل بيانات المدرسة…"));
    const sd = await A().schoolDocs();
    draw(b, sd);
  }
  function draw(b, sd) {
    const s = S(), h = H(), Ad = A();
    const cls = Ad.sortedClasses(), tch = (s.D.teachers || []);
    b.innerHTML =
      `<div id="mg-profile"></div>` +
      sec("mg-s-bell", "⏰ أوقات الحصص والفسح", bellHtml(), { open: true, n: nPer(A().bell().n) }) +
      sec("mg-s-tch", "👨‍🏫 المعلمون", teachersHtml(sd), { open: true, n: tch.length }) +
      sec("mg-s-cls", "🏫 الفصول", classesHtml(), { open: true, n: cls.length }) +
      sec("mg-s-sch", "🗓️ الجدول الأسبوعي", scheduleHtml(), { n: schedRows().length }) +
      sec("mg-s-mv", "🔁 حركات نقل الطلاب", movesHtml(), { n: (s.D.moves || []).length }) +
      sec("mg-s-bk", "💾 النسخة الاحتياطية الشاملة", backupHtml(), { open: true }) +
      sec("mg-s-log", "🕘 سجل الإدارة", logHtml(sd), { n: (sd.adminlog || []).length }) +
      sec("mg-s-lk", "📚 المناهج وعن البرنامج", linksHtml(), {});
    drawProfile($("#mg-profile", b));
    bind(b, sd);
  }
  const again = async () => { A().invalidate(); if (curBox) draw(curBox, await A().schoolDocs(true)); };

  function bind(b, sd) {
    const s = S(), Ad = A();
    const on = (id, fn) => { const el = $("#" + id, b); if (el) el.onclick = fn; };
    // ⏰ أوقات الحصص والفسح
    try { bindBell(b); } catch (e) { warn("bell", e); }
    // طباعة المعلمين
    on("mg-p-tch", () => {
      const last = lastMap(sd);
      Ad.printTable("قائمة المعلمين وبياناتهم", ["م", "المعلم", "المادة", "الفصول", "الجوال", "حالة الدخول", "آخر رصد", "رائد"],
        (s.D.teachers || []).map((t, i) => [String(i + 1), esc(t.name) + (t.admin ? " (المدير)" : ""), esc(t.subject || "—"),
          esc(Ad.sortedClasses().filter(c => (t.classes || []).includes(c.id)).map(c => c.name).join("، ") || "—"),
          esc(Ad.normMob(mobOf(t)) || mobOf(t) || "—"), t.pinHash ? "سجّل" : (isDemo() ? "تجريبي" : "لم يسجّل"),
          last[t.id] ? esc(Ad.fmtDate(last[t.id])) : "—", esc((t.lead || []).map(clsName).join("، ") || "—")]),
        { sub: "⚙️ الإدارة — المعلمون", land: true });
    });
    // طباعة الفصول
    on("mg-p-cls", () => {
      Ad.printTable("فصول المدرسة", ["الفصل", "الصف", "نشط", "منقول", "المواد", "المعلمون", "رائد الفصل"],
        Ad.sortedClasses().map(c => {
          const ts = (s.D.teachers || []).filter(t => (t.classes || []).includes(c.id)), ld = leaderOf(c.id);
          return [esc(c.name), esc(s.GNAME[c.gc] || "—"), String(nActive(c)), String(nMoved(c)),
            String(new Set(ts.map(t => t.subject).filter(Boolean)).size), esc(ts.map(t => shortName(t.name)).join("، ") || "—"), ld ? esc(ld.name) : "—"];
        }),
        { sub: "⚙️ الإدارة — الفصول", foot: ["الإجمالي", "", String(Ad.sortedClasses().reduce((a, c) => a + nActive(c), 0)), String(Ad.sortedClasses().reduce((a, c) => a + nMoved(c), 0)), "", "", ""] });
    });
    on("mg-p-sch", printSchedule);
    // حركات النقل
    on("mg-mv-open", () => { try { s.adminMoves(); } catch (e) { warn("adminMoves", e); Ad.toast("تعذّر فتح نافذة النقل"); } });
    on("mg-p-mv", () => Ad.printTable("سجل حركات نقل الطلاب", ["م", "الطالب", "من", "إلى", "التاريخ", "بواسطة", "الحالة"],
      movesList().map((m, i) => [String(i + 1), esc(m.name || "—"), esc(clsName(m.from)), esc(clsName(m.to)), esc(Ad.fmtTs(m.ts)), esc(m.tn || "—"), m.conflict ? "لم تُطبَّق" : "تمّت"]),
      { sub: "⚙️ الإدارة — حركات النقل" }));
    // سجل الإدارة
    on("mg-log-more", () => { logAll = !logAll; draw(b, sd); });
    on("mg-p-log", () => Ad.printTable("سجل عمليات الإدارة", ["العملية", "التفاصيل", "بواسطة", "الوقت"],
      (sd.adminlog || []).map(l => [esc((ACTS[l.act] || l.act || "").replace(/^\S+\s/, "")), esc(l.note || ""), esc(l.tn || "—"), esc(Ad.fmtTs(l.ts))]),
      { sub: "⚙️ الإدارة — السجل" }));
    // المناهج
    on("mg-curr", () => { try { const r = s.toolCurriculum(); if (r && typeof r.catch === "function") r.catch(e => warn("curriculum", e)); } catch (e) { warn("curriculum", e); Ad.toast("تعذّر فتح المناهج"); } });
    // النسخة الاحتياطية
    on("mg-bk", async () => {
      if (busy) return; busy = true;
      const el = $("#mg-bk", b); if (el) { el.disabled = true; el.textContent = "⏳ جارِ التجهيز…"; }
      try { await backupAll(); } catch (e) { warn("backup", e); Ad.toast("⚠️ تعذّر إنشاء النسخة: " + ((e && e.message) || e), 3200); }
      finally { busy = false; if (el) { el.disabled = false; el.textContent = "⬇️ تصدير نسخة شاملة"; } }
    });
    const file = $("#mg-file", b);
    on("mg-rs", () => { if (!busy && file) { file.value = ""; file.click(); } });
    if (file) file.onchange = async () => {
      const f = file.files && file.files[0]; if (!f || busy) return;
      busy = true;
      try { await restoreFlow(f, b); }
      catch (e) { warn("restore", e); Ad.toast("⚠️ " + ((e && e.message) || e), 3600); }
      finally { busy = false; }
    };
  }

  async function restoreFlow(f, b) {
    const Ad = A();
    let data = null;
    try { data = JSON.parse(await f.text()); } catch (e) { throw new Error("الملف ليس JSON صالحاً"); }
    if (!data || typeof data !== "object" || data.kind !== "sijil-school-backup") throw new Error("هذا ليس ملف نسخة احتياطية من «سجلي»");
    const sm = summarize(data);
    if (!(sm.teachers + sm.classes + sm.recs + sm.grades + sm.comms + sm.schedule)) throw new Error("الملف لا يحوي بيانات لاستعادتها");
    const ok1 = await Ad.confirm("⬆️ استعادة نسخة احتياطية", summaryHtml(data, sm) +
      `<div class="adm-alert ${isDemo() ? "" : "bad"}" style="margin-top:8px">${isDemo() ? "🧪 ستُكتب في بيانات هذا الجهاز فقط." : "⚠️ ستُستبدل مستندات المدرسة السحابية بما في الملف."}</div>`, { ok: "متابعة", no: "إلغاء" });
    if (!ok1) return;
    // رقم واحد للعملية: نفس القائمة التي ستُكتب فعلاً (المهام السحابية أو مستندات الجهاز)
    const tasks = isDemo() ? null : cloudTasks(data);
    const plan = isDemo() ? demoDocs(data) : tasks.length;
    const ok2 = await Ad.confirm("تأكيد نهائي", `<div style="text-align:center;line-height:2">سيبدأ الآن كتابة <b>${plan}</b> مستنداً${isDemo() ? " محلياً" : " في قاعدة المدرسة"}.<br><b style="color:var(--bad)">لا يمكن التراجع عن هذه العملية.</b><br>هل أنت متأكد؟</div>`, { ok: "نعم، استعد الآن", no: "تراجع", danger: true });
    if (!ok2) return;
    const prog = $("#mg-prog", b);
    const btn = $("#mg-rs", b); if (btn) btn.disabled = true;
    let res = null;
    try { res = await doRestore(data, prog, tasks); }
    finally { if (btn) btn.disabled = false; }
    lastRestore = res;
    if (!isDemo()) res.notes.push("اطلب من المعلمين إعادة فتح التطبيق لتظهر لهم البيانات المستعادة");
    Ad.invalidate();
    res.plan = plan;
    Ad.toast(`✔ اكتملت الاستعادة — ${res.ok} من ${plan} مستنداً` + (res.fail ? ` · ${res.fail} فشل` : ""), 3600);
    try { await again(); } catch (e) { warn("refresh", e); }
  }

  /* ═══ التسجيل والتصدير ═══ */
  A().register("manage", render);
  Object.assign(window.SIJIL_ADMIN, { backupAll, restoreSummary: summarize, openBell });
})();
