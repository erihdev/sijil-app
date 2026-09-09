/* ═══════════ لوحة المدير — وحدة ⚙️ الإدارة (manage) — js/admin/manage.js ═══════════
   هيكل المدرسة والإعدادات، بطاقات مطوية (details) تعمل على الجوال أولاً:
   (1) 👤 بياناتي — تُعاد استخدام SIJIL_ADMIN.profileCard من teachers.js إن حُمّلت (وإلا بطاقة مختصرة للعرض فقط).
   (1ب) ⏰ أوقات الحصص والفسح (جدول الأجراس، مستند cfg/bell) — بداية الدوام ومدة الحصة وعددها وحتى أربع فسح،
        بمعاينة حية ونهاية دوام وطباعة صفحة واحدة وإرسال واتساب وإعادة الافتراضي. كل حساب للوقت في core.js
        (bell/periodsOf/dayEnd/bellLine/validateBell/saveBell) ولا يُحسب وقت في هذا الملف ولا يُثبَّت فيه.
   (1ج) 🎛️ مكتبة التقييمات ودرجاتها (مستند cfg/assess) — جدولا حالات الحضور والسلوكيات (اسم · درجة · لون · ترتيب · حذف)
        ودرجات المشاركة والواجب وورقة العمل، بمعاينة كما يراها المعلم، وسطر «أثر التغيير» بمثال محسوب من رصد المدرسة،
        وطباعة ورقة واحدة. كل تحقق وحفظ وحساب في core.js (assess/validateAssess/saveAssess/assessScore).
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
  const pad2 = (n) => String(n).padStart(2, "0");
  const isDemo = () => !(S().CLOUD && S().fdb);
  const ACTS = { pin: "🔑 رقم دخول", edit: "✏️ تعديل", add: "➕ إضافة معلم", addst: "➕ طالب جديد", delst: "🗑 حذف طالب", lead: "🎖️ رائد فصل", schedule: "🗓️ الجدول", move: "🔁 نقل طالب", sedit: "👤 بيانات طالب", backup: "⬇️ نسخة احتياطية", restore: "⬆️ استعادة", bell: "⏰ أوقات الحصص", school: "🏫 أسماء الإدارة", assess: "🎛️ مكتبة التقييمات" };
  let curBox = null, logAll = false, busy = false, lastRestore = null;

  /* ═══ CSS الوحدة (مرة واحدة) ═══ */
  function css() {
    if ($("#adm-manage-css")) return;
    const st = document.createElement("style"); st.id = "adm-manage-css";
    st.textContent = `
.mg-sec{padding:0}
.mg-logo-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid var(--line);border-radius:14px;padding:11px 12px;margin-bottom:12px;background:#fff}
.mg-logo-box{width:64px;height:64px;border-radius:12px;border:1.5px dashed var(--line);display:flex;align-items:center;justify-content:center;font-size:26px;background:#fbf6ea;overflow:hidden;flex:0 0 auto}
.mg-logo-box img{max-width:100%;max-height:100%;object-fit:contain}
.mg-logo-tx{flex:1;min-width:150px;font-size:14px;color:var(--ink)}
.mg-logo-hint{color:var(--muted);font-size:12.5px;margin-top:3px;font-weight:600}
.mg-logo-ac{display:flex;gap:6px;flex-wrap:wrap}
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
.as-hd{display:flex;align-items:center;gap:8px;margin:12px 0 8px;font-weight:800;color:var(--navy);font-size:14px}
.as-hd b{color:var(--gold)}
.as-hd .off{color:var(--muted);font-weight:700;font-size:11.5px}
.as-hd button{margin-inline-start:auto;flex:0 0 auto;padding:8px 12px;font-size:13px}
.as-hd button:disabled{opacity:.45;cursor:not-allowed}
.as-it{border:1.5px solid var(--line);border-radius:12px;padding:7px 9px;background:#fbf9f4;margin-bottom:7px}
.as-it .hd{display:flex;align-items:center;gap:7px}
.as-it .hd input{flex:1;min-width:0;padding:9px 10px;border:1.5px solid var(--line);border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;background:#fff;color:var(--navy)}
.as-it .ct{display:flex;align-items:flex-end;gap:6px;margin-top:6px;flex-wrap:wrap}
.as-it .ct .f{display:block;font-size:11.5px;font-weight:700;color:var(--muted);flex:1 1 84px;min-width:72px}
.as-it .ct .f input,.as-it .ct .f select{width:100%;margin-top:3px;padding:9px 4px;border:1.5px solid var(--line);border-radius:10px;font-family:inherit;font-size:14px;text-align:center;background:#fff;color:var(--navy)}
.as-it .ac{display:flex;gap:5px;flex:0 0 auto;margin-inline-start:auto}
.as-it .ac button{min-width:40px;min-height:40px;border:1.5px solid var(--line);background:#fff;border-radius:9px;font-size:15px;line-height:1;cursor:pointer;color:var(--navy)}
.as-it .ac button:disabled{opacity:.3;cursor:not-allowed}
.as-it .ac .as-del:hover:not(:disabled){border-color:var(--bad);background:#fff5f5}
.as-it.off{background:#f4f5f7;border-style:dashed}
.as-it.off .nm{font-size:13px;font-weight:800;color:var(--muted);text-decoration:line-through}
.as-it.off .hb{font-size:11px;font-weight:800;color:var(--muted)}
.as-it.off .as-on{margin-inline-start:auto;flex:0 0 auto;border:1.5px solid var(--line);background:#fff;border-radius:9px;min-height:38px;padding:6px 10px;font-size:12.5px;font-weight:800;cursor:pointer;color:var(--navy)}
.as-wg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}
.as-wg .f{display:block;font-size:11.5px;font-weight:700;color:var(--muted)}
.as-wg .f small{color:#b08d3c;font-weight:700}
.as-wg .f input{width:100%;margin-top:3px;padding:9px 4px;border:1.5px solid var(--line);border-radius:10px;font-family:inherit;font-size:15px;font-weight:800;text-align:center;background:#fff;color:var(--navy)}
.as-pv{margin-top:10px;border:1.5px solid var(--line);border-radius:12px;padding:9px 10px;background:#fff}
.as-pv .hd{display:flex;flex-wrap:wrap;gap:3px 8px;align-items:baseline;font-weight:800;color:var(--navy);font-size:13.5px}
.as-pv .hd .ln{font-weight:400;color:var(--muted);font-size:12px}
.as-pv .hd .un{color:var(--bad);font-weight:800;font-size:12px}
.as-pv .lb{font-size:11.5px;font-weight:800;color:var(--muted);margin:8px 0 4px}
.as-pv .kchip{display:inline-flex;align-items:center;gap:4px}
.as-pv .kchip .dt{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
@media(max-width:379px){.as-wg{grid-template-columns:1fr 1fr}.as-it .ct .f{flex:1 1 66px;min-width:62px}.as-it .ac button{min-width:38px}}
@media print{.mg-sec>summary .ar,.mg-it .wa{display:none!important}}`;
    document.head.appendChild(st);
  }

  /* ═══ أدوات ═══ */
  const clsName = (cid) => cid === "out" ? "خارج المدرسة" : ((S().classById(cid) || {}).name || cid);
  const mobOf = (t) => (typeof A().mobOf === "function" ? A().mobOf(t) : String((t && (t.mob || t.phone)) || "").trim());
  const leaderOf = (cid) => (typeof A().leaderOf === "function" ? A().leaderOf(cid) : (S().D.teachers || []).find(t => (t.lead || []).includes(cid)) || null);
  const nActive = (c) => S().activeCount(c);
  const nMoved = (c) => ((c && c.students) || []).filter(s => s.moved && !s.gap).length;
  // «سجّل هويته» = علم التسجيل الجديد (js/auth.js) أو البصمة القديمة قبل الترحيل
  function isReg(t) {
    if (!t) return false;
    const a = window.SIJIL_AUTH;
    if (a && typeof a.isRegistered === "function") { try { return !!a.isRegistered(t); } catch (e) { } }
    return t.reg === true || !!t.pinHash;
  }
  const loginTxt = (t) => isReg(t) ? { c: "ok", t: "✅ سجّل هويته" } : isDemo() ? { c: "ok", t: "🧪 تجريبي (1234)" } : { c: "no", t: "⏳ لم يسجّل" };
  /* الحصص المعروضة تتبع جدول الأجراس وبيانات الجدول — لا رقم مثبّت. كانت [1..7] فتختفي كل حصة رقمها 8
     فأكثر من الشبكة ومن الشارة ومن مؤشر «حصة أسبوعياً»، بينما يطبعها زر «🖨️ طباعة الجدول العام» في
     البطاقة نفسها (يفوّض إلى SIJIL_ADMIN_SCHEDULE.printAll الذي يبني أعمدته من محرك الأجراس). */
  function perList() {
    const Ad = A(); let mx = 1;
    try { DAYS5.forEach(d => { const k = (Ad.periodsOnly(d) || []).length; if (k > mx) mx = k; }); } catch (e) { mx = 7; }
    (Array.isArray(S().D.schedule) ? S().D.schedule : []).forEach(r => { const p = Number(r && r.p) || 0; if (p > mx && p <= 12) mx = p; });
    mx = Math.min(12, Math.max(1, mx));
    const out = []; for (let p = 1; p <= mx; p++) out.push(p);
    return out;
  }
  const schedRows = () => { const per = perList(); return (Array.isArray(S().D.schedule) ? S().D.schedule : []).filter(r => r && r.t && r.c && DAYS5.includes(r.d) && per.indexOf(+r.p) >= 0); };
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
  /* ما فتحه المدير يبقى مفتوحاً بعد إعادة الرسم: كل حفظ في هذا التبويب يعيد بناءه كاملاً
     (again/refresh)، وكانت البطاقة التي يعمل فيها تُطبَق عليه لحظة الحفظ — يحفظ مكتبة
     التقييمات فلا يرى أثر حفظه ولا زر «🖨️ طباعة المكتبة» إلا بفتح البطاقة من جديد. */
  const mgOpen = {};
  const sec = (id, title, bodyHtml, opts) => {
    opts = opts || {};
    const isOpen = (mgOpen[id] == null) ? !!opts.open : !!mgOpen[id];
    return `<details class="card mg-sec" id="${id}"${isOpen ? " open" : ""}><summary><span class="dot"></span><span class="t">${title}</span>${opts.n != null ? `<span class="n">${opts.n}</span>` : '<span class="n" style="background:none"></span>'}<span class="ar">▾</span></summary><div class="mg-bd">${bodyHtml}</div></details>`;
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
  // شارة عدد الحصص بصيغة عربية سليمة: حصة واحدة · حصتان · 7 حصص · 11 حصة — الدالة في core.js (مصدر واحد)
  const nPer = (n) => { const Ad = A(); return (Ad && typeof Ad.nPer === "function") ? Ad.nPer(n) : (n === 1 ? "حصة واحدة" : n === 2 ? "حصتان" : n + (n <= 10 ? " حصص" : " حصة")); };
  function newDraft() {
    const c = A().bell(), raw = rawBell() || {};
    return {
      start: c.start, len: c.len, n: c.n,
      // auto: هل الاسم مولَّد تلقائياً؟ (لا نستنتجه من نصّ يكتبه المدير — «الفسحة الكبرى» كانت تُمحى بصمت)
      breaks: c.breaks.map((b, i) => ({ after: b.after, min: b.min, n: b.n, auto: !b.n || b.n === autoNm(i) })),
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
  /* حصص مسندة في الجدول المدرسي خارج عدد الحصص المضبوط: التطبيق يُبقيها في شبكة «حصص اليوم» بلا وقت،
     لكنه يُسقطها صامتةً من ملف التقويم (.ics) ومن تنبيهات الحصص ومن شريط «الحصة القادمة» لأن لا وقت لها.
     البطاقة تحذّر المدير بعددها وأماكنها قبل أن يحفظ عدداً أقل مما يستعمله جدوله فعلاً. */
  function outOfRange() {
    const s = S(), Ad = A(), rows = Array.isArray(s.D.schedule) ? s.D.schedule : [];
    if (!rows.length) return null;
    return withDraft(() => {
      const cap = {}, per = {}; let n = 0;
      rows.forEach(r => {
        const d = String((r && r.d) || ""), p = Number(r && r.p) || 0;
        if (!p || DAYS5.indexOf(d) < 0) return;
        if (cap[d] == null) { try { cap[d] = (Ad.periodsOnly(d) || []).length; } catch (e) { cap[d] = 0; } }
        if (p > cap[d]) { n++; (per[d] = per[d] || {})[p] = (per[d][p] || 0) + 1; }
      });
      if (!n) return null;
      return { n: n, txt: Object.keys(per).map(d => `${d}: ${Object.keys(per[d]).sort((a, b) => a - b).map(x => "ح" + x).join("، ")}`).join(" · ") };
    });
  }
  const renumber = () => draft.breaks.forEach((b, i) => { if (!b.n || b.auto) { b.n = autoNm(i); b.auto = true; } });
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
    const oo = outOfRange();
    return `<div class="bl-pv">
      <div class="hd"><span>👁️ المعاينة</span><span class="ln">${esc(p.line)}</span>${bellDirty() ? '<span class="un">● تغييرات غير محفوظة</span>' : ""}</div>
      ${h.table([{ t: "الحصة / الفسحة", w: 120 }, "من", "إلى", "دقيقة"], rows, { cls: "bl-tb", foot: ["🔚 نهاية الدوام", "", esc(Ad.hm(p.end)), ""] })}
    </div>` + (oo ? h.alert(`⚠️ <b>${oo.n} حصة</b> في الجدول المدرسي خارج عدد الحصص هذا فتبقى بلا وقت: تظهر في «حصص اليوم» بخانة وقت فارغة، وتُسقط من ملف التقويم ومن تنبيهات الحصص.<br><span style="color:var(--muted)">${esc(oo.txt)}</span>`, "bad") : "");
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
      box.querySelectorAll(".bl-nm").forEach(inp => inp.oninput = () => { const b = draft.breaks[+inp.dataset.i]; b.n = inp.value.slice(0, 40); b.auto = !b.n.trim(); upPrev(); });
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
      draft.breaks.push({ after: p, min: (last && isFinite(last.min) && last.min) || def, n: "", auto: true });
      sortBreaks(); renumber(); upBreaks();
    };
    const df = q("bl-def"); if (df) df.onclick = () => {
      const d = Ad.defaultBell();
      draft = { start: d.start, len: d.len, n: d.n, breaks: d.breaks.map(x => ({ after: x.after, min: x.min, n: x.n, auto: true })), lens: {}, days: {} }; parked = []; renumber();
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
      /* تقليل «عدد الحصص» دون أعلى حصة موجودة فعلاً في الجدول العام كان يُحفظ صامتاً: يبقى عمود الحصة
         في كل الجداول لكن بلا وقت، فلا يطابقه شريط «الحصة الحالية» عند المعلمين ولا يدخل في «نهاية
         الدوام»، ومع ذلك تظل حصصه في البيانات وتُصدَّر في النسخة الاحتياطية. المعاينة تحذّر منه أصلاً،
         فيبقى أن يُطلب تأكيد صريح قبل الحفظ (الرفع لا يحتاج تأكيداً — الشبكة تنمو والأوقات تُحسب). */
      const oo = outOfRange();
      if (oo) {
        const go = await Ad.confirm("⚠️ حصص ستبقى بلا وقت", `الجدول العام يحوي <b>${oo.n}</b> حصة خارج عدد الحصص الذي تحفظه الآن (<b>${draft.n}</b> حصص).<br>ستبقى هذه الحصص في الجدول لكن <b>بلا وقت</b>: لا يبرزها شريط «الحصة الحالية» عند المعلمين، ولا تدخل في «نهاية الدوام»، ولا تُصدَّر في ملف التقويم.<br><span style="color:var(--muted)">${esc(oo.txt)}</span><br>احذفها من 🗓️ الجدول أولاً، أو ارفع عدد الحصص.`, { ok: "أحفظ رغم ذلك", no: "أعود للتعديل", danger: true });
        if (!go) { if (er) er.textContent = ""; return; }
      }
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

  /* ═══ (1ج) 🎛️ مكتبة التقييمات ودرجاتها — حالات الحضور والسلوكيات ودرجات الرصد (cfg/assess) ═══
     مسودة التحرير aDraft = {states:[{k,t,v,c,off}], behaviors:[{k,t,v,off}], weights:{…}} تُبنى من
     SIJIL_ADMIN.assess() (المكتبة الفعّالة بترتيب المدير). لا يُحسب في هذا الملف شيء: التحقق
     validateAssess والحفظ saveAssess ونقاط الطالب assessScore كلها في core.js، والمعاينة تمرّ
     بخطّ المعلم نفسه (SIJIL.assessMerge ← SIJIL.assessView) فما تُظهره البطاقة هو ما سيراه المعلم.
     و🗑 لا تحذف العنصر من المصفوفة أبداً بل تضع عليه off:true: rec.a وrec.beh أرقام مخزَّنة في recs
     منذ أول يوم، فإسقاط عنصر يُزيح فهارس ما بعده ويُفسد كل رصد سابق. والمخفي يبقى في البطاقة
     بزر «↩ إرجاع»، ونقاطه المرصودة سابقاً تبقى كما هي.
     «↺ إعادة الافتراضي» تُخفي ما أضافه المدير ولا تُسقطه — لو أُسقط لانزاح ما بعده من إضافاته. */
  let aDraft = null, aBase = "", aSd = null, aTimer = null, aCache = null;
  const aLIST = { st: "states", bh: "behaviors" };
  const aWHAT = { st: "الحالة", bh: "السلوك" };
  // درجات الرصد اليومي الثلاث التي تدخل فعلاً في حساب النقاط (present/absent/bad في المستند مرايا قديمة لا يقرؤها أي حساب)
  /* «ورقة العمل» لا تُعرض هنا: وزنها يضرب الحقل e.sh في السجل اليومي، وهذا الحقل **لا كاتب له**
     في المشروع كله (يُنشأ صفراً ويبقى صفراً) — فمقبضٌ يضبطه المدير ولا يتحرّك به رقمٌ واحد أسوأ
     من غيابه. وأوراق العمل التفاعلية تدخل الدرجة فعلاً من عمود «الأوراق» في الدرجة التلقائية
     (autoGrade: تسليمات subs + الواجبات)، لا من هذا الوزن. والقيمة المحفوظة في المستند تبقى كما هي. */
  const A_WSHOW = [["part", "🙋", "المشاركة", "لكل نقرة"], ["hw", "📚", "الواجب", "عند الحل"]];
  // إشارة سالبة عربية (−) لا شرطة، وصفرٌ بلا إشارة — كما في signN في app.js
  const aSgn = (v) => { const x = Math.round((+v || 0) * 10) / 10; return (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x); };
  const aFix = (v) => { const x = Math.round((+v || 0) * 10) / 10; return (x < 0 ? "−" : "") + Math.abs(x); };
  // أيقونة حالة الحضور — مرآة ST_ICON في app.js (زينة المعاينة وحدها؛ الأصل هناك)
  const aIcon = (n) => /حاضر/.test(n) ? "✅" : /متأخر/.test(n) ? "⏰" : /مستأذن/.test(n) ? "🚪" : /بعذر/.test(n) ? "📄" : /بعد/.test(n) ? "💻" : /هارب/.test(n) ? "🏃" : "❌";
  /* قيمة الدرجة كما في النموذج: رقماً إن صلحت (فلا تُحسب «3» تغييراً عن 3) وإلا نصاً كما كتبه المدير
     ليشرحه validateAssess بالعربية — لا يُصحَّح مدخل المستخدم صامتاً ولا يُبتلع. */
  const aVal = (raw) => { const t = String(raw == null ? "" : raw).trim(); if (t === "") return ""; const x = Number(t); return isFinite(x) ? x : t; };
  const aColors = () => (A().ASSESS_COLORS || ["ok", "bad", "warn", "gray", "info", "violet", "brown"]);
  const aClbl = () => (A().ASSESS_CLBL || {});
  const aLocked = (k) => (A().ASSESS_LOCK || []).indexOf(String(k)) >= 0;
  const aMax = () => (+A().ASSESS_MAX || 40);
  const aOn = (l) => (l || []).filter(x => x && !x.off).length;
  const aBadge = () => { const c = A().assess() || {}; return (aOn(c.states) + aOn(c.behaviors)) + " بنداً"; };

  function aNewDraft() {
    const c = A().assess() || {};
    return {
      states: (c.states || []).map(x => ({ k: x.k, t: x.t, v: x.v, c: x.c || "gray", off: x.off === true })),
      behaviors: (c.behaviors || []).map(x => ({ k: x.k, t: x.t, v: x.v, off: x.off === true })),
      weights: Object.assign({}, c.weights || {})
    };
  }
  // الشكل الذي يُمرَّر إلى validateAssess/saveAssess (لا حقل زائد: القواعد ترفض المستند بحقل مجهول)
  function aCfgOf(d) {
    const it = (x, wantC) => { const o = { k: x.k, t: x.t, v: x.v }; if (wantC) o.c = x.c; if (x.off) o.off = true; return o; };
    return {
      states: (d.states || []).map(x => it(x, true)),
      behaviors: (d.behaviors || []).map(x => it(x, false)),
      weights: Object.assign({}, d.weights || {})
    };
  }
  const aErr = () => { try { return A().validateAssess(aCfgOf(aDraft)); } catch (e) { warn("validateAssess", e); return "تعذّر التحقق من المكتبة"; } };
  const aDirty = () => JSON.stringify(aCfgOf(aDraft)) !== aBase;
  // مفتاح جديد لا يشبه مستعملاً ولا مخفياً ولا افتراضياً (المخفي يبقى شاهداً في المصفوفة فلا يُعاد استعماله)
  function aNewKey() {
    const used = {}, add = (l) => (l || []).forEach(x => { if (x) used[String(x.k)] = 1; });
    add(aDraft.states); add(aDraft.behaviors);
    const d = A().defaultAssess() || {}; add(d.states); add(d.behaviors);
    for (let n = 1; n < 900; n++) { const k = "c" + n; if (!used[k]) return k; }
    return "c" + (Date.now() % 100000);
  }

  /* ═══ صفوف الجدولين ═══ */
  function aRowHtml(x, i, L, last) {
    if (x.off) return `<div class="as-it off" data-l="${L}" data-i="${i}">
      <div class="hd"><span class="nm">${esc(x.t || "—")} <b>${esc(aSgn(x.v))}</b></span><span class="hb">مخفي عن المعلمين</span>
      <button class="as-on" data-l="${L}" data-i="${i}">↩ إرجاع</button></div></div>`;
    const lock = L === "st" && aLocked(x.k);
    const cSel = L === "st"
      ? `<label class="f">اللون<select class="as-c" data-l="${L}" data-i="${i}">${aColors().map(c => `<option value="${c}"${x.c === c ? " selected" : ""}>${esc(aClbl()[c] || c)}</option>`).join("")}</select></label>`
      : "";
    return `<div class="as-it" data-l="${L}" data-i="${i}">
      <div class="hd"><input class="as-t" data-l="${L}" data-i="${i}" maxlength="40" value="${esc(x.t)}" placeholder="اسم ${esc(aWHAT[L])} كما يظهر للمعلم" autocomplete="off"></div>
      <div class="ct">
        <label class="f">الدرجة<input type="number" class="as-v" data-l="${L}" data-i="${i}" step="0.5" min="-20" max="20" inputmode="decimal" value="${esc(x.v)}"></label>
        ${cSel}
        <div class="ac">
          <button class="as-mv" data-l="${L}" data-i="${i}" data-d="-1" title="نقل لأعلى" aria-label="نقل لأعلى"${i === 0 ? " disabled" : ""}>↑</button>
          <button class="as-mv" data-l="${L}" data-i="${i}" data-d="1" title="نقل لأسفل" aria-label="نقل لأسفل"${i >= last ? " disabled" : ""}>↓</button>
          <button class="as-del" data-l="${L}" data-i="${i}" title="${lock ? "لا تُحذف: يعتمد عليها رصد الحصة الحية والتقارير" : "حذف — يُخفى عن المعلمين وتبقى نقاطه المرصودة سابقاً"}" aria-label="حذف"${lock ? " disabled" : ""}>🗑️</button>
        </div>
      </div></div>`;
  }
  function aBoxHtml(L) {
    const l = aDraft[aLIST[L]] || [], nOff = l.length - aOn(l), h = H();
    return `<div class="as-hd"><span>${L === "st" ? "📌 حالات الحضور" : "⭐ السلوكيات"} <b>${aOn(l)}</b>${nOff ? ` <span class="off">+${nOff} مخفي</span>` : ""}</span>
      <button class="btn-plain as-add" data-l="${L}"${l.length >= aMax() ? " disabled" : ""}>➕ ${L === "st" ? "حالة جديدة" : "سلوك جديد"}</button></div>` +
      (l.length ? l.map((x, i) => aRowHtml(x, i, L, l.length - 1)).join("") : h.note("لا عناصر — اضغط زر الإضافة."));
  }
  function aWeightsHtml() {
    return `<div class="as-hd"><span>⚖️ درجات الرصد اليومي</span></div>
      <div class="as-wg">${A_WSHOW.map(w => `<label class="f">${w[1]} ${w[2]} <small>${w[3]}</small><input type="number" class="as-wv" data-k="${w[0]}" step="0.5" min="-20" max="20" inputmode="decimal" value="${esc(aDraft.weights[w[0]])}"></label>`).join("")}</div>` +
      H().note("درجة «الحاضر» و«الغائب» و«المخالف» من الجدولين أعلاه لا من هنا — والقيم القديمة المسمّاة بها في المستند تبقى كما هي ولا يقرؤها أي حساب. وأوراق العمل التفاعلية تدخل الدرجة من عمود «الأوراق» في الدرجة التلقائية (تسليمات الطلاب) لا بوزنٍ هنا.");
  }

  /* ═══ المعاينة: بخطّ المعلم نفسه — الدمج فوق الافتراضي ثم إسقاط المخفي وترتيب المدير ═══ */
  function aViewOf(d) {
    const s = S();
    if (!s || typeof s.assessMerge !== "function" || typeof s.assessView !== "function" || typeof s.assessDefault !== "function") return null;
    const def = s.assessDefault();
    return { st: s.assessView(s.assessMerge(def.states, d.states || [])), bh: s.assessView(s.assessMerge(def.behaviors, d.behaviors || [])) };
  }
  function aPrevHtml() {
    const h = H(), err = aErr();
    if (err) return `<div class="as-pv">` + h.alert("⚠️ " + esc(err) + '<br><span style="color:var(--muted)">صحّح المدخلات لتظهر المعاينة وأثر التغيير.</span>', "bad") + `</div>`;
    const v = aViewOf(aDraft); if (!v) return "";
    const C = S().ASSESS_C || {}, w = aDraft.weights;
    const chip = (ic, nm, pts, col) => `<span class="kchip${(+pts || 0) < 0 ? " neg" : ""}">${col ? `<i class="dt" style="background:${col}"></i>` : ""}${ic} ${esc(nm)} <b>${esc(aSgn(pts))}</b></span>`;
    const st = v.st.map(x => chip(aIcon(x.name || ""), x.name, x.pts, C[x.c] || C.gray)).join("");
    const bh = v.bh.map(x => chip((+x.pts || 0) < 0 ? "⚠" : "⭐", x.name, x.pts, "")).join("");
    const wc = A_WSHOW.map(k => chip(k[1], k[2] + " (" + k[3] + ")", w[k[0]], "")).join("");
    return `<div class="as-pv">
      <div class="hd"><span>👁️ المعاينة كما يراها المعلم</span><span class="ln">${esc(A().assessLine(aCfgOf(aDraft)))}</span>${aDirty() ? '<span class="un">● تغييرات غير محفوظة</span>' : ""}</div>
      <div class="lb">📌 حالات الحضور — نافذة «التحضير» (${v.st.length})</div><div class="kchips">${st}</div>
      <div class="lb">⭐ السلوكيات — نافذة «⭐ السلوك» في الحصة الحية (${v.bh.length})</div><div class="kchips">${bh}</div>
      <div class="lb">⚖️ درجات الرصد اليومي</div><div class="kchips">${wc}</div>
    </div>`;
  }

  /* ═══ أثر التغيير: مثال محسوب من رصد المدرسة نفسه لا رقماً مفترضاً ═══
     رصد الطالب الخام من schoolDocs (كل معلميه)، ثم نقاطه بالمكتبة المحفوظة وبالمسودة عبر
     SIJIL_ADMIN.assessScore (حساب calcStudent نفسه). المثال المعروض = أكبر فرق، ويُقدَّم الطالب
     النشط على المنقول. القائمة تُبنى مرة واحدة لكل لقطة schoolDocs (aCache). */
  function aStudents() {
    const sd = aSd; if (!sd || !sd.recs) return [];
    if (aCache && aCache.sd === sd) return aCache.list;
    const s = S(), Ad = A(), by = {};
    Object.keys(sd.recs).forEach(id => {
      const cid = Ad.splitKey(id).cid; if (!cid) return;
      const days = sd.recs[id] || {};
      Object.keys(days).forEach(dt => {
        const day = days[dt] || {};
        Object.keys(day).forEach(si => {
          const e = day[si];
          if (!e || typeof e !== "object" || Ad.emptyRec(e)) return;
          (by[cid + "|" + si] = by[cid + "|" + si] || []).push(e);
        });
      });
    });
    const list = [];
    Object.keys(by).forEach(key => {
      const p = key.split("|"), cid = p[0], si = +p[1];
      const c = s.classById(cid), st = (c && c.students) ? c.students[si] : null;
      if (!st || st.gap) return;                       // فراغ في قائمة الفصل ليس طالباً
      list.push({ name: st.n || "طالب", cls: (c && c.name) || cid, moved: !!st.moved, e: by[key] });
    });
    aCache = { sd: sd, list: list };
    return list;
  }
  function aImpact() {
    const Ad = A(), list = aStudents();
    if (!list.length) return { none: true, n: 0, nCh: 0, best: null };
    let cfg = null; try { cfg = aCfgOf(aDraft); } catch (e) { return { none: true, n: 0, nCh: 0, best: null }; }
    let best = null, nCh = 0;
    list.forEach(x => {
      let a = 0, b = 0;
      try { a = Ad.assessScore(x.e); b = Ad.assessScore(x.e, cfg); } catch (e) { return; }
      const d = Math.round((b - a) * 10) / 10, ad = Math.abs(d);
      if (d) nCh++;
      // أكبر فرق أولاً، ثم الطالب النشط، ثم أكبر رصيد — حتى لا يُضرب المثال بطالب منقول أو بلا نقاط
      if (!best || ad > best.ad || (ad === best.ad && ((best.moved && !x.moved) || (best.moved === x.moved && Math.abs(a) > Math.abs(best.a)))))
        best = { name: x.name, cls: x.cls, moved: x.moved, a: a, b: b, d: d, ad: ad };
    });
    return { none: false, n: list.length, nCh: nCh, best: best };
  }
  function aImpHtml() {
    const h = H();
    if (aErr()) return "";
    const w = "<b>أثر التغيير:</b> تغيير الدرجات يُعيد حساب نقاط الطلاب في كل التقارير والمطبوعات ورسائل أولياء الأمور من أول الفصل، لا في الرصد الجديد وحده. والرصد نفسه لا يتغيّر.";
    let im = null; try { im = aImpact(); } catch (e) { warn("impact", e); }
    if (!im || im.none) return h.alert("⚠️ " + w + '<br><span style="color:var(--muted)">لا رصد في المدرسة بعد، فلا مثال يُحسب.</span>');
    const b = im.best;
    if (!im.nCh) return h.alert("✔ <b>أثر التغيير:</b> لا تتغيّر نقاط أي طالب من " + im.n + " لهم رصد" + (b ? ` — مثال: <b>${esc(b.name)}</b> (${esc(b.cls)}) نقاطه <b>${esc(aFix(b.a))}</b> وتبقى كما هي.` : "."), "ok");
    return h.alert("⚠️ " + w +
      `<br>📊 مثال محسوب من رصد مدرستك: <b>${esc(b.name)}</b> (${esc(b.cls)}) — نقاطه اليوم <b>${esc(aFix(b.a))}</b> تصير <b>${esc(aFix(b.b))}</b> (${esc(aSgn(b.d))})` +
      `<br><span style="color:var(--muted)">يتغيّر رصيد ${im.nCh} من ${im.n} طالباً لهم رصد.</span>`, "bad");
  }

  /* ═══ الطباعة: ورقة واحدة للمعلمين — الجدولان جنباً إلى جنب ثم درجات الرصد ═══ */
  function printAssess() {
    const Ad = A(), err = aErr();
    if (err) { Ad.toast("⚠️ " + err, 3200); return; }
    const v = aViewOf(aDraft); if (!v) { Ad.toast("⚠️ تعذّر بناء المكتبة للطباعة", 3000); return; }
    const C = S().ASSESS_C || {}, cl = aClbl(), w = aDraft.weights;
    const sw = (c) => `<span style="display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-1px;background:${C[c] || C.gray}"></span>`;
    const st = v.st.map((x, i) => `<tr><td>${i + 1}</td><td class="nm">${esc(x.name)}</td><td>${esc(aSgn(x.pts))}</td><td>${sw(x.c)} ${esc(cl[x.c] || "")}</td></tr>`).join("");
    const bh = v.bh.map((x, i) => `<tr><td>${i + 1}</td><td class="nm">${esc(x.name)}</td><td>${esc(aSgn(x.pts))}</td></tr>`).join("");
    Ad.printHtml("مكتبة التقييمات ودرجاتها",
      `<div style="display:flex;gap:12px;align-items:flex-start">
        <table class="compact" style="flex:1 1 0;margin:0"><tr><th colspan="4">📌 حالات الحضور (${v.st.length})</th></tr><tr><th>م</th><th>الحالة</th><th>الدرجة</th><th>اللون</th></tr>${st}</table>
        <table class="compact" style="flex:1 1 0;margin:0"><tr><th colspan="3">⭐ السلوكيات (${v.bh.length})</th></tr><tr><th>م</th><th>السلوك</th><th>الدرجة</th></tr>${bh}</table>
      </div>
      <table class="compact" style="margin-top:10px"><tr><th colspan="3">⚖️ درجات الرصد اليومي</th></tr>` +
      `<tr>${A_WSHOW.map(k => `<th>${k[1]} ${k[2]}</th>`).join("")}</tr>` +
      `<tr>${A_WSHOW.map(k => `<td><b>${esc(aSgn(w[k[0]]))}</b> <span style="color:#666">${k[3]}</span></td>`).join("")}</tr></table>` +
      `<div class="note">حالة الحضور تُحسب مرة واحدة في اليوم لكل مادة، والسلوك بعدد مرات رصده، والمشاركة بعدد النقرات بلا سقف.</div>` +
      (aDirty() ? `<div class="note">هذه معاينة غير محفوظة — اضغط «💾 حفظ المكتبة» لاعتمادها في التطبيق.</div>` : ""),
      { sub: "⚙️ الإدارة — مكتبة التقييمات", cls: "compact", sig: ["vice", "principal"] });
  }

  function assessHtml(sd) {
    const h = H();
    aSd = sd || aSd;
    // إعادة رسم التبويب لسبب آخر (سجل الإدارة، حفظ الأجراس، العودة للتبويب) لا تُضيّع تحريراً غير محفوظ
    const base = JSON.stringify(aCfgOf(aNewDraft()));
    if (!(aDraft && aBase === base && aDirty())) { aDraft = aNewDraft(); aBase = base; }
    return h.note("هذه المكتبة هي كل ما يرصده المعلم على الطالب ودرجة كل بند: حالات الحضور في «التحضير»، والسلوكيات في «⭐ السلوك»، ودرجات المشاركة والواجب وورقة العمل. اضبطها مرة واحدة لمدرستك.") +
      `<div id="as-b-st">${aBoxHtml("st")}</div>
       <div id="as-b-bh">${aBoxHtml("bh")}</div>
       <div id="as-b-w">${aWeightsHtml()}</div>
       <div id="as-prev">${aPrevHtml()}</div>
       <div id="as-imp">${aImpHtml()}</div>
       <div class="login-err" id="as-err" style="margin-top:4px"></div>` +
      h.tools(`${h.btn("💾 حفظ المكتبة", 'id="as-save"')}${h.btn("🖨️ طباعة المكتبة", 'id="as-print"', "btn-plain")}${h.btn("↺ إعادة الافتراضي", 'id="as-def"', "btn-plain")}`);
  }

  /* ربط النموذج: الكتابة تحدّث المسودة والمعاينة وحدها (بلا إعادة رسم يفقد التركيز)، والإضافة
     والحذف والترتيب تعيد بناء الجدول المعني فقط. أثر التغيير يُحسب متأخراً 220ms (237 طالباً). */
  function bindAssess(b) {
    const Ad = A(), q = (id) => $("#" + id, b);
    const upImp = () => { const el = q("as-imp"); if (el) el.innerHTML = aImpHtml(); };
    const upPrev = () => {
      const pv = q("as-prev"); if (pv) pv.innerHTML = aPrevHtml();
      const er = q("as-err"); if (er) er.textContent = "";
      clearTimeout(aTimer); aTimer = setTimeout(() => { try { upImp(); } catch (e) { warn("impact", e); } }, 220);
    };
    const upBox = (L) => { const el = q("as-b-" + L); if (el) { el.innerHTML = aBoxHtml(L); bindRows(); } upPrev(); };
    const itemOf = (el) => { const L = el.dataset.l, l = aDraft[aLIST[L]] || []; return { L: L, l: l, i: +el.dataset.i, x: l[+el.dataset.i] }; };
    function bindRows() {
      ["st", "bh"].forEach(L => {
        const box = q("as-b-" + L); if (!box) return;
        box.querySelectorAll(".as-t").forEach(inp => inp.oninput = () => { const o = itemOf(inp); if (o.x) { o.x.t = inp.value.slice(0, 40); upPrev(); } });
        box.querySelectorAll(".as-v").forEach(inp => inp.oninput = () => { const o = itemOf(inp); if (o.x) { o.x.v = aVal(inp.value); upPrev(); } });
        box.querySelectorAll(".as-c").forEach(sel => sel.onchange = () => { const o = itemOf(sel); if (o.x) { o.x.c = sel.value; upPrev(); } });
        box.querySelectorAll(".as-mv").forEach(bt => bt.onclick = () => {
          const o = itemOf(bt), j = o.i + (+bt.dataset.d);
          if (!o.x || j < 0 || j >= o.l.length) return;
          o.l[o.i] = o.l[j]; o.l[j] = o.x; upBox(o.L);
        });
        box.querySelectorAll(".as-del").forEach(bt => bt.onclick = async () => {
          const o = itemOf(bt); if (!o.x) return;
          const go = await Ad.confirm("🗑️ حذف " + aWHAT[o.L] + "؟", `<b>${esc(o.x.t || "—")}</b> ${esc(aSgn(o.x.v))} — يُخفى عن كل المعلمين ولا يظهر في قوائم الرصد.<br><span style="color:var(--muted)">ما رُصد به سابقاً يبقى محفوظاً بدرجته، ويمكنك إرجاعه من هذه البطاقة متى شئت.</span>`, { ok: "أخفيه", no: "إلغاء", danger: true });
          if (!go) return;
          const o2 = itemOf(bt); if (!o2.x) return;
          o2.x.off = true; upBox(o2.L);
        });
        box.querySelectorAll(".as-on").forEach(bt => bt.onclick = () => { const o = itemOf(bt); if (!o.x) return; o.x.off = false; upBox(o.L); });
        box.querySelectorAll(".as-add").forEach(bt => bt.onclick = () => {
          const L = bt.dataset.l, l = aDraft[aLIST[L]] || [];
          if (l.length >= aMax()) { Ad.toast("⚠️ لا يمكن تجاوز " + aMax() + " عنصراً في القائمة (المخفي محسوب لأن فهارس الرصد تُحفظ به)", 3600); return; }
          const it = { k: aNewKey(), t: "", v: 0, off: false };
          if (L === "st") it.c = "info";
          l.push(it); upBox(L);
          const box2 = q("as-b-" + L); if (box2) { const fs = box2.querySelectorAll(".as-t"); const el = fs[fs.length - 1]; if (el) { try { el.focus(); } catch (e) { } } }
        });
      });
      const wb = q("as-b-w");
      if (wb) wb.querySelectorAll(".as-wv").forEach(inp => inp.oninput = () => { aDraft.weights[inp.dataset.k] = aVal(inp.value); upPrev(); });
    }
    bindRows();
    const pr = q("as-print"); if (pr) pr.onclick = printAssess;
    const df = q("as-def"); if (df) df.onclick = async () => {
      const d = Ad.defaultAssess() || {};
      const extra = (l, def) => (l || []).filter(x => x && !(def || []).some(y => y.k === x.k));
      const nEx = extra(aDraft.states, d.states).length + extra(aDraft.behaviors, d.behaviors).length;
      const go = await Ad.confirm("↺ إعادة الافتراضي", "تُستعاد أسماء البنود ودرجاتها الافتراضية في النموذج" + (nEx ? `، و<b>${nEx}</b> من البنود التي أضفتها تُخفى ولا تُحذف (فهارس الرصد محفوظة بها)` : "") + `.<br><span style="color:var(--muted)">لا شيء يُحفظ قبل أن تضغط «💾 حفظ المكتبة».</span>`, { ok: "أعِد الافتراضي", no: "إلغاء" });
      if (!go) return;
      const keep = (l, def, wantC) => (def || []).map(x => { const o = { k: x.k, t: x.t, v: x.v, off: false }; if (wantC) o.c = x.c || "gray"; return o; })
        .concat(extra(l, def).map(x => { const o = { k: x.k, t: x.t, v: x.v, off: true }; if (wantC) o.c = x.c || "gray"; return o; }));
      aDraft = { states: keep(aDraft.states, d.states, true), behaviors: keep(aDraft.behaviors, d.behaviors, false), weights: Object.assign({}, d.weights || {}) };
      upBox("st"); upBox("bh");
      const wb = q("as-b-w"); if (wb) { wb.innerHTML = aWeightsHtml(); bindRows(); }
      upPrev(); upImp();
      Ad.toast("↺ أُعيدت المكتبة الافتراضية في النموذج — اضغط «💾 حفظ المكتبة» لاعتمادها", 3800);
    };
    const sv = q("as-save"); if (sv) sv.onclick = async () => {
      if (busy) return;
      const er = q("as-err"), err = aErr();
      if (err) { if (er) er.textContent = "⚠️ " + err; Ad.toast("⚠️ " + err, 3600); return; }
      if (!aDirty()) { Ad.toast("لا تغييرات لحفظها", 2200); return; }
      clearTimeout(aTimer);
      let im = null; try { im = aImpact(); } catch (e) { warn("impact", e); }
      if (im && im.nCh && im.best) {
        const go = await Ad.confirm("⚠️ إعادة حساب نقاط الطلاب", `سيتغيّر رصيد <b>${im.nCh}</b> من <b>${im.n}</b> طالباً لهم رصد، في كل التقارير والمطبوعات ورسائل أولياء الأمور من أول الفصل.<br>مثال: <b>${esc(im.best.name)}</b> (${esc(im.best.cls)}) — من <b>${esc(aFix(im.best.a))}</b> إلى <b>${esc(aFix(im.best.b))}</b>.<br><span style="color:var(--muted)">الرصد نفسه لا يتغيّر، والبنود المخفية تبقى محفوظة بدرجاتها.</span>`, { ok: "أحفظ المكتبة", no: "أعود للتعديل" });
        if (!go) { if (er) er.textContent = ""; return; }
      }
      busy = true; sv.disabled = true; const lbl = sv.textContent; sv.textContent = "⏳ جارِ الحفظ…";
      let r = null;
      try { r = await Ad.saveAssess(aCfgOf(aDraft)); }
      catch (e) { warn("saveAssess", e); r = { ok: false, err: (e && e.message) || String(e) }; }
      busy = false;
      if (r && r.ok) Ad.toast("✔ حُفظت مكتبة التقييمات — تظهر للمعلمين عند فتح التطبيق", 3600);
      else {
        const m = (r && r.err) || "تعذّر الحفظ";
        const er2 = $("#as-err", b); if (er2) er2.textContent = "⚠️ " + m;
        Ad.toast("⚠️ " + m, 3600);
      }
      const sv2 = $("#as-save", b); if (sv2) { sv2.disabled = false; sv2.textContent = lbl; }
    };
    upPrev();
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
    const nReg = list.filter(t => isReg(t)).length, nNo = list.filter(t => !t.admin && (t.classes || []).length && !last[t.id]).length;
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
    const per = perList();
    let h = `<table class="report-table mg-grid"><tr><th>اليوم</th><th>ح</th>${cls.map(c => `<th>${esc(c.name)}</th>`).join("")}</tr>`;
    DAYS5.forEach(d => per.forEach((p, i) => {
      h += `<tr>${i === 0 ? `<td class="dy" rowspan="${per.length}">${esc(d)}</td>` : ""}<td class="pn">${p}</td>` +
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
      { land: true, sub: "الجدول المدرسي العام", sig: ["vice", "principal"] });
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
      moves: sd.moves || [], assign: sd.assign || [], subs, sedits: sd.sedits || {}, adminlog: sd.adminlog || [],
      /* إعدادات المدرسة الثلاث: بدونها تعود المدرسة بعد الاستعادة إلى جرس 7:00 · 45د · 7 حصص، وإلى نقاط
         بدل أسماء الإدارة في كل مطبوع، وإلى درجات meta/app الافتراضية فتُحسب نقاط كل الطلاب من جديد. */
      bell: (s.D && s.D.bell) || (s.DB && s.DB.bell) || null,
      cfgSchool: (s.D && s.D.cfgSchool) || (s.DB && s.DB.cfgSchool) || null,
      cfgAssess: (s.D && s.D.cfgAssess) || (s.DB && s.DB.cfgAssess) || null
    };
    const txt = JSON.stringify(out);
    download(txt, `نسخة سجلي الشاملة - ${s.META.school.name} - ${hijStamp()} - ${Ad.isoDate()}.json`);
    Ad.toast(`⬇️ نُزّلت النسخة (${Math.round(txt.length / 1024)} كيلوبايت)`, 3000);
    try { await Ad.adminlog("backup", `تصدير نسخة احتياطية شاملة (${teachers.length} معلماً، ${(out.classes || []).length} فصلاً، ${Object.keys(out.recs).length} مستند رصد)`); } catch (e) { warn("log/backup", e); }
    return out;
  }
  const cnt = (o) => o ? Object.keys(o).length : 0;
  /* إعدادات المدرسة داخل النسخة: تُطبَّع قبل الكتابة (normBell) فلا يدخل مستند cfg/bell معطوب من ملف قديم أو محرَّر يدوياً */
  function bellRec(b, tn) {
    const Ad = A(), src = b && b.bell;
    if (!src || typeof src !== "object" || Array.isArray(src) || typeof Ad.normBell !== "function") return null;
    let c = null; try { c = Ad.normBell(src); } catch (e) { warn("bellRec", e); return null; }
    if (!c) return null;
    const rec = { start: c.start, len: c.len, n: c.n, breaks: (c.breaks || []).map(x => ({ after: x.after, min: x.min, n: x.n })), tn: tn || "", ts: Date.now() };
    if (c.lens && Object.keys(c.lens).length) rec.lens = c.lens;
    if (c.days && Object.keys(c.days).length) rec.days = c.days;
    return rec;
  }
  /* مكتبة التقييمات داخل النسخة: تمرّ على validateAssess كاملة قبل أن تُكتب — ملف قديم أو محرَّر
     يدوياً قد يحمل مكتبة معطوبة، وكتابتها تُزيح فهارس الرصد وتُفسد نقاط المدرسة كلها. */
  function assessRec(b, tn) {
    const Ad = A(), src = b && b.cfgAssess;
    if (!src || typeof src !== "object" || Array.isArray(src) || typeof Ad.validateAssess !== "function") return null;
    const it = (o, wantC) => { const x = o || {}, y = { k: String(x.k == null ? "" : x.k).trim(), t: String(x.t == null ? "" : x.t).trim().replace(/\s+/g, " "), v: Number(x.v) }; if (wantC) y.c = String(x.c == null ? "gray" : x.c); if (x.off === true) y.off = true; return y; };
    const cfg = {};
    if (Array.isArray(src.states)) cfg.states = src.states.map(o => it(o, true));
    if (Array.isArray(src.behaviors)) cfg.behaviors = src.behaviors.map(o => it(o, false));
    const dw = (Ad.defaultAssess() || {}).weights || {}, w = {}, sw = (src.weights && typeof src.weights === "object" && !Array.isArray(src.weights)) ? src.weights : {};
    (Ad.ASSESS_WK || []).forEach(k => { const raw = (sw[k] == null || sw[k] === "") ? dw[k] : sw[k], x = Number(raw); w[k] = isFinite(x) ? Math.round(x * 2) / 2 : 0; });
    cfg.weights = w;
    const err = Ad.validateAssess(cfg);
    if (err) { warn("assessRec", err); return null; }
    cfg.tn = String(tn || "").slice(0, 80); cfg.ts = Date.now();
    return cfg;
  }
  function staffRec(b, tn) {
    const Ad = A(), src = b && b.cfgSchool;
    if (!src || typeof src !== "object" || Array.isArray(src)) return null;
    const keys = Array.isArray(Ad.STAFF_KEYS) ? Ad.STAFF_KEYS : ["principal", "vice", "agent", "counselor"];
    const rec = { tn: tn || "", ts: Date.now() }; let n = 0;
    keys.forEach(k => { const v = String(src[k] == null ? "" : src[k]).trim().slice(0, 80); if (v) { rec[k] = v; n++; } });
    return n ? rec : null;
  }
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
      ((Array.isArray(b.teachers) && b.teachers.length) ? b.teachers.length : 0) +
      (bellRec(b) ? 1 : 0) + (staffRec(b) ? 1 : 0) + (assessRec(b) ? 1 : 0);
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
      ${line("⏰ أوقات الحصص والفسح", bellRec(b) ? "مشمولة — ستُستبدل الأوقات الحالية" : "<span style=\"color:var(--muted)\">غير مشمولة في هذا الملف — تبقى الأوقات الحالية</span>")}
      ${line("🏫 أسماء إدارة المدرسة", staffRec(b) ? "مشمولة — ستُستبدل أسماء التواقيع" : "<span style=\"color:var(--muted)\">غير مشمولة في هذا الملف — تبقى الأسماء الحالية</span>")}
      ${line("🎛️ مكتبة التقييمات ودرجاتها", assessRec(b) ? "مشمولة — ستُستبدل الدرجات وتُعاد نقاط الطلاب في كل التقارير" : "<span style=\"color:var(--muted)\">غير مشمولة في هذا الملف (أو غير صالحة) — تبقى المكتبة الحالية</span>")}
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
    // إعدادات المدرسة (القواعد تسمح: match /cfg/{doc}) — وتُحدَّث الحالة الحية فوراً بعد نجاح الكتابة
    const bl = bellRec(b, tn);
    if (bl) push("أوقات الحصص", async () => { await s.fdb.doc("cfg/bell").set(bl); s.D.bell = bl; cacheD(s); bellEvent(); });
    const sc = staffRec(b, tn);
    if (sc) push("أسماء الإدارة", async () => { await s.fdb.doc("cfg/school").set(sc); s.D.cfgSchool = sc; cacheD(s); bellEvent(); });
    const as = assessRec(b, tn);
    if (as) push("مكتبة التقييمات", async () => { await s.fdb.doc("cfg/assess").set(as); s.D.cfgAssess = as; cacheD(s); assessEvent(); });
    return T;
  }
  const cacheD = (s) => { try { localStorage.setItem("sijil.cloudD", JSON.stringify(s.D)); } catch (e) { } };
  const bellEvent = () => { try { window.dispatchEvent(new CustomEvent("sijil:bell")); } catch (e) { } };
  // مكتبة التقييمات المستعادة تُدمج فوق META فوراً (assessApply) ثم يُعلن الحدث — وتبقى دلاء الحضور في core على أسماء الحالات السابقة حتى إعادة التحميل
  const assessEvent = () => {
    try { const s = S(); if (typeof s.assessApply === "function") s.assessApply(); } catch (e) { warn("assessApply", e); }
    try { window.dispatchEvent(new CustomEvent("sijil:assess")); } catch (e) { }
  };
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
    const tn = String((s.TE && s.TE.name) || "الإدارة").slice(0, 80);
    const bl = bellRec(b, tn); if (bl) { DB.bell = bl; D.bell = bl; done["أوقات الحصص"] = 1; }
    const sc = staffRec(b, tn); if (sc) { DB.cfgSchool = sc; D.cfgSchool = sc; done["أسماء الإدارة"] = 1; }
    const as = assessRec(b, tn); if (as) { DB.cfgAssess = as; D.cfgAssess = as; done["مكتبة التقييمات"] = 1; }
    s.save();
    if (bl || sc) bellEvent();
    if (as) assessEvent();
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
      const nt = ["الوضع التجريبي: كل البيانات على هذا الجهاز فقط", detail];
      if (assessRec(b)) nt.push("🎛️ استُعيدت مكتبة التقييمات — أعد تحميل الصفحة مرة واحدة لتنطبق على كل الشاشات");
      return { ok: r.docs, fail: 0, notes: nt };
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
    if (assessRec(b) && !failSec["مكتبة التقييمات"]) notes.push("🎛️ استُعيدت مكتبة التقييمات — أعد تحميل الصفحة مرة واحدة لتنطبق على كل الشاشات");
    Object.keys(failSec).forEach(k => notes.push(`تعذّرت كتابة ${failSec[k]} مستنداً في «${k}»`));
    await Ad.adminlog("restore", `استعادة نسخة (${b.hijri || ""}): ${ok} مستنداً${fail ? ` — ${fail} فشل` : ""}`);
    return { ok, fail, notes };
  }
  function backupHtml() {
    const h = H();
    return h.note("نسخة واحدة بصيغة JSON تضم: المعلمين (بلا أرقام الدخول)، الفصول والطلاب، الجدول، الرصد اليومي، الدرجات، سجل التواصل، حركات النقل، الأوراق التفاعلية وتسليماتها، تعديلات بيانات الطلاب، وسجل الإدارة، وأوقات الحصص والفسح، وأسماء إدارة المدرسة، ومكتبة التقييمات ودرجاتها.") +
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
  /* ═══ 🗂️ مكتبة المدرسة (js/files.js) + 🏫 شعار المدرسة في ترويسة المطبوعات ═══
     المكتبة مستندات تظهر لكل المعلمين (الجدول الرسمي، النماذج، التعاميم) — يرفعها المدير من هنا،
     ويقرؤها المعلم من «المزيد». والشعار مرفق واحد بنطاق school ووصف {kind:"logo"} يقرؤه
     SIJIL.loadLogo فيظهر في ترويسة كل مطبوع. */
  const FL = () => { const F = window.SIJIL_FILES; return (F && typeof F.libraryCard === "function") ? F : null; };
  let libCard = null;                                   // مقبض تحديث قائمة المكتبة بعد تغيير الشعار
  function libHtml() {
    const h = H();
    if (!FL()) return h.empty("المرفقات غير متاحة الآن — أعد تحميل الصفحة");
    return `<div id="mg-logo">${h.empty("جارِ تحميل الشعار…")}</div><div id="mg-lib">${h.empty("جارِ تحميل المكتبة…")}</div>`;
  }
  async function drawLib(b) {
    const F = FL(); if (!F) return;
    const lg = $("#mg-logo", b), box = $("#mg-lib", b);
    if (lg) paintLogo(lg);
    if (box) {
      try { libCard = await F.libraryCard(box, { scope: "school", title: "🗂️ ملفات المدرسة", hint: "تظهر لكل المعلمين داخل «المزيد»: الجدول الرسمي، النماذج، التعاميم." }); }
      catch (e) { warn("libraryCard", e); box.innerHTML = H().empty("تعذّر تحميل المكتبة — تحقق من الاتصال"); }
    }
  }
  async function paintLogo(el) {
    const F = FL(), h = H(); if (!F || !el) return;
    let arr = [];
    try { arr = await F.list("school", { kind: "logo" }) || []; } catch (e) { arr = []; }
    const cur = arr[0] || null;
    let src = "";
    if (cur) { try { const got = await F.blobOf(cur.id); src = URL.createObjectURL(got.blob); } catch (e) { src = ""; } }
    if (!el.isConnected) return;
    el.innerHTML = `<div class="mg-logo-row">
      <div class="mg-logo-box">${src ? `<img src="${src}" alt="شعار المدرسة">` : "🏫"}</div>
      <div class="mg-logo-tx"><b>شعار المدرسة في المطبوعات</b>
        <div class="mg-logo-hint">${cur ? "يظهر الآن في ترويسة كل تقرير وشهادة وإشعار تطبعه." : "أضف صورة الشعار (PNG أو JPG) لتظهر في ترويسة كل مطبوع."}</div></div>
      <div class="mg-logo-ac"><button class="btn-gold" id="mg-logo-up">${cur ? "🔄 تغيير" : "🖼️ إضافة"}</button>${cur ? '<button class="btn-plain" id="mg-logo-rm">🗑️ حذف</button>' : ""}</div>
    </div>`;
    const up = $("#mg-logo-up", el);
    if (up) up.onclick = async () => {
      let got = [];
      try { got = await F.attach({ scope: "school", ref: { kind: "logo" }, title: "🏫 شعار المدرسة" }) || []; } catch (e) { got = []; }
      if (got.length) {
        // شعار واحد فقط: تُحذف النسخ السابقة بعد نجاح رفع الجديد
        const keep = got[got.length - 1].id;
        for (const old of arr) { if (old.id !== keep) { try { await F.remove(old.id, { silent: true }); } catch (e) { } } }
        try { await S().loadLogo(true); } catch (e) { }
        if (libCard && libCard.refresh) { try { await libCard.refresh(); } catch (e) { } }
        await A().adminlog("school", "تحديث شعار المدرسة في المطبوعات");
      }
      paintLogo(el);
    };
    const rm = $("#mg-logo-rm", el);
    if (rm) rm.onclick = async () => {
      if (!(await A().confirm("حذف شعار المدرسة من المطبوعات؟"))) return;
      for (const old of arr) { try { await F.remove(old.id, { silent: true }); } catch (e) { } }
      try { await S().loadLogo(true); } catch (e) { }
      if (libCard && libCard.refresh) { try { await libCard.refresh(); } catch (e) { } }
      await A().adminlog("school", "حذف شعار المدرسة من المطبوعات");
      A().toast("🗑️ حُذف الشعار");
      paintLogo(el);
    };
  }

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
      sec("mg-s-as", "🎛️ مكتبة التقييمات ودرجاتها", assessHtml(sd), { n: aBadge() }) +
      sec("mg-s-tch", "👨‍🏫 المعلمون", teachersHtml(sd), { open: true, n: tch.length }) +
      sec("mg-s-cls", "🏫 الفصول", classesHtml(), { open: true, n: cls.length }) +
      sec("mg-s-sch", "🗓️ الجدول الأسبوعي", scheduleHtml(), { n: schedRows().length }) +
      sec("mg-s-mv", "🔁 حركات نقل الطلاب", movesHtml(), { n: (s.D.moves || []).length }) +
      sec("mg-s-sid", "🆔 أرقام هويات الطلاب", '<div id="mg-sids"></div>', {}) +
      sec("mg-s-fix", "🧰 صيانة الفهارس", '<div id="mg-fix"></div>', {}) +
      sec("mg-s-lib", "🗂️ مكتبة المدرسة وشعارها", libHtml(), {}) +
      sec("mg-s-bk", "💾 النسخة الاحتياطية الشاملة", backupHtml(), { open: true }) +
      sec("mg-s-log", "🕘 سجل الإدارة", logHtml(sd), { n: (sd.adminlog || []).length }) +
      sec("mg-s-lk", "📚 المناهج وعن البرنامج", linksHtml(), {});
    drawProfile($("#mg-profile", b));
    bind(b, sd);
    try { drawLib(b); } catch (e) { warn("lib", e); }
    try { const sb = $("#mg-sids", b); if (sb) { sb.innerHTML = ""; sidCard(sb); } } catch (e) { warn("sids", e); }
    try { const fb = $("#mg-fix", b); if (fb) { fb.innerHTML = ""; fixCard(fb); } } catch (e) { warn("fix", e); }
  }
  const again = async () => { A().invalidate(); if (curBox) draw(curBox, await A().schoolDocs(true)); };

  function bind(b, sd) {
    const s = S(), Ad = A();
    const on = (id, fn) => { const el = $("#" + id, b); if (el) el.onclick = fn; };
    // ما فتحه المدير أو طواه يُحفظ ليُعاد في الرسم القادم (mgOpen فوق sec)
    b.querySelectorAll("details.mg-sec").forEach(d => { if (d.id) d.addEventListener("toggle", () => { mgOpen[d.id] = d.open; }); });
    // ⏰ أوقات الحصص والفسح
    try { bindBell(b); } catch (e) { warn("bell", e); }
    // 🎛️ مكتبة التقييمات ودرجاتها
    try { bindAssess(b); } catch (e) { warn("assess", e); }
    // طباعة المعلمين
    on("mg-p-tch", () => {
      const last = lastMap(sd);
      Ad.printTable("قائمة المعلمين وبياناتهم", ["م", "المعلم", "المادة", "الفصول", "الجوال", "حالة الدخول", "آخر رصد", "رائد"],
        (s.D.teachers || []).map((t, i) => [String(i + 1), esc(t.name) + (t.admin ? " (المدير)" : ""), esc(t.subject || "—"),
          esc(Ad.sortedClasses().filter(c => (t.classes || []).includes(c.id)).map(c => c.name).join("، ") || "—"),
          esc(Ad.normMob(mobOf(t)) || mobOf(t) || "—"), isReg(t) ? "سجّل" : (isDemo() ? "تجريبي" : "لم يسجّل"),
          last[t.id] ? esc(Ad.fmtDate(last[t.id])) : "—", esc((t.lead || []).map(clsName).join("، ") || "—")]),
        { sub: "⚙️ الإدارة — المعلمون", land: true, sig: ["vice", "principal"] });
    });
    // طباعة الفصول
    on("mg-p-cls", () => {
      Ad.printTable("فصول المدرسة", ["الفصل", "الصف", "نشط", "منقول", "المواد", "المعلمون", "رائد الفصل"],
        Ad.sortedClasses().map(c => {
          const ts = (s.D.teachers || []).filter(t => (t.classes || []).includes(c.id)), ld = leaderOf(c.id);
          return [esc(c.name), esc(s.GNAME[c.gc] || "—"), String(nActive(c)), String(nMoved(c)),
            String(new Set(ts.map(t => t.subject).filter(Boolean)).size), esc(ts.map(t => shortName(t.name)).join("، ") || "—"), ld ? esc(ld.name) : "—"];
        }),
        { sub: "⚙️ الإدارة — الفصول", sig: ["vice", "principal"], foot: ["الإجمالي", "", String(Ad.sortedClasses().reduce((a, c) => a + nActive(c), 0)), String(Ad.sortedClasses().reduce((a, c) => a + nMoved(c), 0)), "", "", ""] });
    });
    on("mg-p-sch", printSchedule);
    // حركات النقل
    on("mg-mv-open", () => { try { s.adminMoves(); } catch (e) { warn("adminMoves", e); Ad.toast("تعذّر فتح نافذة النقل"); } });
    on("mg-p-mv", () => Ad.printTable("سجل حركات نقل الطلاب", ["م", "الطالب", "من", "إلى", "التاريخ", "بواسطة", "الحالة"],
      movesList().map((m, i) => [String(i + 1), esc(m.name || "—"), esc(clsName(m.from)), esc(clsName(m.to)), esc(Ad.fmtTs(m.ts)), esc(m.tn || "—"), m.conflict ? "لم تُطبَّق" : "تمّت"]),
      { sub: "⚙️ الإدارة — حركات النقل", sig: ["agent", "principal"] }));
    // سجل الإدارة
    on("mg-log-more", () => { logAll = !logAll; draw(b, sd); });
    on("mg-p-log", () => Ad.printTable("سجل عمليات الإدارة", ["العملية", "التفاصيل", "بواسطة", "الوقت"],
      (sd.adminlog || []).map(l => [esc((ACTS[l.act] || l.act || "").replace(/^\S+\s/, "")), esc(l.note || ""), esc(l.tn || "—"), esc(Ad.fmtTs(l.ts))]),
      { sub: "⚙️ الإدارة — السجل", sig: ["principal"] }));
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
    /* ═══ 🆔 أرقام هويات الطلاب — مدخل بوابة الطالب ═══
     البصمة sha256(الهوية|الفصل|الملح) تُحسب في المتصفح، والرقم الخام لا يُرفع ولا يُخزَّن
     ولا يُطبع في سجل الإدارة. مجموعة spins لا تُسرد بالقواعد، فالعدّ يجري بـ get لكل بصمة
     يحسبها المتصفح من اللصقة نفسها — لا استعلام. */
  var SID_SALT = "sijil1448";
  function sidNorm(t) {
    return String(t || "").replace(/[\u064B-\u0652\u0640]/g, "")
      .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
      .replace(/\s+/g, " ").trim();
  }
  function sidDigits(t) {
    var ar = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
    return String(t || "").replace(/[٠-٩]/g, function (d) { return ar[d]; }).replace(/\D/g, "");
  }
  function sidParse(text) {
    var out = [], lines = String(text || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim(); if (!ln) continue;
      var parts = ln.split(/\t|,|;|\s{2,}/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (parts.length < 2) {
        var m = ln.match(/^(.*?)[\s,;]+([0-9٠-٩][0-9٠-٩\s-]{7,})$/);
        if (!m) { out.push({ raw: ln, bad: "سطر غير مفهوم" }); continue; }
        parts = [m[1], m[2]];
      }
      var nid = sidDigits(parts[parts.length - 1]);
      var name = parts.slice(0, parts.length - 1).join(" ");
      if (nid.length < 9 || nid.length > 12) { out.push({ raw: ln, name: name, bad: "رقم غير صالح" }); continue; }
      out.push({ name: name, nid: nid });
    }
    return out;
  }
  function sidIndex() {
    var S = window.SIJIL, map = {}, cls = (S.D.classes || []);
    for (var c = 0; c < cls.length; c++) {
      var st = cls[c].students || [];
      for (var i = 0; i < st.length; i++) {
        if (!st[i] || st[i].moved || st[i].gap) continue;
        var k = sidNorm(st[i].n);
        (map[k] = map[k] || []).push({ cid: cls[c].id, si: i, cname: cls[c].name });
      }
    }
    return map;
  }
  /* sids/{cid} — فهارس من سُجّلت هويته (لا رقم ولا اسم). البصمات spins لا تُسرد بالقواعد،
     فبلا هذا المستند لا يعرف المعلم من تصله ورقته: يرسلها ويظنّها وصلت الفصل كله. تُدمج
     مع الموجود (اتحاد) لأن المدير يلصق الهويات على دفعات، ولا تُنقص أبداً. */
  async function sidsWrite(byClass) {
    var S = window.SIJIL, ids = Object.keys(byClass), done = 0;
    for (var k = 0; k < ids.length; k++) {
      var cid = ids[k], add = byClass[cid] || [];
      if (!add.length) continue;
      try {
        var cur = [];
        if (S.CLOUD && S.fdb) {
          var d = await S.fdb.doc('sids/' + cid).get();
          if (d.exists) cur = ((d.data() || {}).list) || [];
        } else { var DBx = S.DB || window.DB || {}; cur = ((DBx.sids || {})[cid] || {}).list || []; }
        var set = {}, list = [];
        cur.concat(add).forEach(function (v) { var n = +v; if (n === Math.floor(n) && n >= 0 && n < 400 && !set[n]) { set[n] = 1; list.push(n); } });
        list.sort(function (a, b) { return a - b; });
        var rec = { list: list, n: list.length, tn: (S.TE || {}).name || '', ts: Date.now() };
        if (S.CLOUD && S.fdb) await S.fdb.doc('sids/' + cid).set(rec);
        else { var DBy = S.DB || window.DB || {}; DBy.sids = DBy.sids || {}; DBy.sids[cid] = rec; try { S.save('sids'); } catch (e2) { } }
        done++;
      } catch (e) { }
    }
    return done;
  }
  /* مفتاح صندوق رسائل الطالب: عشوائيٌّ ٢٤ محرفاً يُخزَّن داخل بصمة هويته (spins) وفي فهرس
     المعلمين (mkeys). الرسالة الشخصية — استدعاء أو مستوى ابن — لا يجوز أن تُخزَّن في مستند
     فصلٍ يقرؤه كل طلابه، فصندوقُها smsg/{mk}: من لا يعرف المفتاح لا يجد المستند، والسرد ممنوع.
     والمفتاح **لا يُبدَّل** عند إعادة الاستيراد وإلا فقد الطالب صندوقه. */
  function mkNew() {
    var CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', out = '';
    try {
      var a = new Uint8Array(24); (window.crypto || window.msCrypto).getRandomValues(a);
      for (var i = 0; i < a.length; i++) out += CH[a[i] % CH.length];
    } catch (e) { out = ''; }
    while (out.length < 24) out += CH[Math.floor(Math.random() * CH.length)];
    return out.slice(0, 24);
  }
  const isMk = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{16,32}$/.test(v);
  // فهرس المفاتيح للمعلمين — دمجٌ لا استبدال (المدير يلصق الهويات على دفعات)
  async function mkeysWrite(byClass) {
    var S = window.SIJIL, ids = Object.keys(byClass), done = 0;
    for (var n = 0; n < ids.length; n++) {
      var cid = ids[n], add = byClass[cid] || {};
      if (!Object.keys(add).length) continue;
      try {
        var cur = {};
        if (S.CLOUD && S.fdb) {
          var d = await S.fdb.doc('mkeys/' + cid).get();
          if (d.exists) cur = ((d.data() || {}).k) || {};
        } else { var DBx = S.DB || window.DB || {}; cur = ((DBx.mkeys || {})[cid] || {}).k || {}; }
        var k = Object.assign({}, cur, add);
        var rec = { k: k, n: Object.keys(k).length, tn: (S.TE || {}).name || '', ts: Date.now() };
        if (S.CLOUD && S.fdb) await S.fdb.doc('mkeys/' + cid).set(rec);
        else { var DBy = S.DB || window.DB || {}; DBy.mkeys = DBy.mkeys || {}; DBy.mkeys[cid] = rec; try { S.save('mkeys'); } catch (e2) { } }
        done++;
      } catch (e) { }
    }
    return done;
  }
  /* ═══ 🧰 صيانة الفهارس: إعادة بناء assignidx من مجموعة assign ═══
     فهرس الفصل (assignidx/{cid}) هو ما تقرؤه بوابة الطالب في «✏️ مهامي»، وهو كذلك مصدر
     بند «أوراق العمل والواجبات» في تقدير وليّ الأمر. أما المعلم فيحسب البند من تسليمات
     subs كلها. فأي ورقةٍ خارج الفهرس — أُرسلت قبل أن يوجد الفهرس، أو فشلت كتابته على جهاز
     بلا مطالبة جلسة — تدخل حساب المعلم ولا تدخل حساب الطالب، فيقرأ وليّ الأمر تقديراً
     غير الذي في دفتر المعلم. هذا الزر يعيد بناء الفهرس من المصدر: مجموعة assign كاملةً.
     والورقة الموجَّهة (to) لا تدخل الفهرس أصلاً — تُسلَّم في صندوق كل طالبٍ الخاص. */
  function fixCard(box) {
    var S = window.SIJIL, A = window.SIJIL_ADMIN;
    var wrap = document.createElement("div");
    wrap.innerHTML = '<div class="card"><h3><span class="dot"></span>🧰 إعادة بناء فهرس الأوراق</h3>'
      + '<div class="empty-note" style="padding:2px 2px 8px;text-align:right">'
      + 'يقرأ كل أوراق العمل المرسلة ويعيد بناء فهرس كل فصل منها، فتظهر في «✏️ مهامي» عند الطلاب '
      + 'كما هي عند معلميهم — ويتّحد بند «أوراق العمل» في تقدير وليّ الأمر مع دفتر المعلم. '
      + 'لا يحذف شيئاً ولا يرسل إشعاراً، وتشغيله مرة واحدة يكفي (أو بعد أي إرسال قال إن الورقة لن تظهر).</div>'
      + '<div class="adm-tools"><button class="btn-primary" id="fx-idx">🔁 أعد بناء الفهرس</button></div>'
      + '<div id="fx-out" class="empty-note" style="padding:8px 2px 0;text-align:right"></div></div>';
    box.appendChild(wrap);
    var out = wrap.querySelector("#fx-out");
    var say = function (h) { out.innerHTML = h; };
    wrap.querySelector("#fx-idx").onclick = async function () {
      var btn = wrap.querySelector("#fx-idx"); btn.disabled = true;
      say("جارِ قراءة الأوراق…");
      if (!S.CLOUD || !S.fdb) { say('<span style="color:var(--bad)">هذه الصيانة للنسخة السحابية فقط</span>'); btn.disabled = false; return; }
      var snap = null;
      try { snap = await S.fdb.collection("assign").get(); }
      catch (e) {
        say('<span style="color:var(--bad)">⛔ تعذّرت قراءة الأوراق: '
          + (e && e.code === "permission-denied" ? "لم يُعتمد هذا الجهاز برقمك — اعتمده من الشريط الأعلى ثم أعد المحاولة" : "تحقق من الاتصال")
          + "</span>");
        btn.disabled = false; return;
      }
      var by = {}, skipped = 0, all = 0;
      snap.forEach(function (d) {
        var x = d.data() || {}; all++;
        var cid = String(x.cid || ""); if (!cid) { skipped++; return; }
        // الموجَّهة إلى أفرادٍ لا تدخل فهرس الفصل: قائمتها تفضح أصحابها لكل زملائهم
        if (Array.isArray(x.to) && x.to.length) { skipped++; return; }
        (by[cid] = by[cid] || []).push({
          a: d.id, t: String(x.t || "ورقة").slice(0, 90), due: String(x.due || ""),
          tid: String(x.tid || ""), mode: String(x.mode || "ws"), n: +x.n || 0, wk: +x.wk || 0,
          code: String(x.code || ""), tries: (x.tries == null ? null : +x.tries), ts: +x.ts || 0
        });
      });
      var ids = Object.keys(by), okc = 0, err = 0, added = 0;
      for (var i = 0; i < ids.length; i++) {
        var cid2 = ids[i], list = by[cid2];
        try {
          var cur = [];
          try { var dd = await S.fdb.doc("assignidx/" + cid2).get(); if (dd.exists) cur = ((dd.data() || {}).list) || []; } catch (e2) { cur = []; }
          var seen = {}, merged = [];
          cur.concat(list).forEach(function (it) {
            if (!it || !it.a || seen[it.a]) return; seen[it.a] = 1; merged.push(it);
          });
          added += merged.length - cur.length;
          merged.sort(function (a2, b2) { return (+a2.ts || 0) - (+b2.ts || 0); });   // الأقدم أولاً كما يكتبها الإرسال
          if (merged.length > 190) merged = merged.slice(merged.length - 190);
          await S.fdb.doc("assignidx/" + cid2).set({ list: merged, tn: (S.TE || {}).name || "", ts: Date.now() });
          okc++;
        } catch (e3) { err++; }
        say("جارِ البناء… " + (i + 1) + " من " + ids.length + " فصلاً");
      }
      say(okc
        ? ("<b>أُعيد بناء فهرس " + okc + " فصلاً</b> من " + all + " ورقة" + (added > 0 ? (" — أُضيفت " + added + " ورقة لم تكن مفهرسة") : " — لا ناقص")
           + (skipped ? (" · تُخطّيت " + skipped + " ورقة موجَّهة أو بلا فصل (وهي تُسلَّم في حساب كل طالبٍ وحده)") : "")
           + (err ? (' · <span style="color:var(--bad)">تعثّر ' + err + "</span>") : ""))
        : '<span style="color:var(--bad)">لم يُبنَ شيء' + (err ? " — تعثّرت " + err + " كتابة" : " — لا أوراق") + "</span>");
      try { await A.adminlog("idx", "إعادة بناء فهرس الأوراق: " + okc + " فصلاً"); } catch (e4) { }
      btn.disabled = false;
    };
  }
  function sidCard(box) {
    var S = window.SIJIL, A = window.SIJIL_ADMIN;
    var wrap = document.createElement("div");
    wrap.innerHTML = '<div class="card"><h3><span class="dot"></span>🆔 أرقام هويات الطلاب</h3>'
      + '<div class="empty-note" style="padding:2px 2px 8px;text-align:right">مدخل بوابة الطالب: الطالب يختار صفه وشعبته ثم يكتب رقم هويته. '
      + 'الصق من نور أو إكسل سطراً لكل طالب: <b>الاسم ثم رقم الهوية</b>. '
      + 'يُحسب الرقم في جهازك وتُرفع بصمته فقط — الرقم نفسه لا يُرفع ولا يُخزَّن ولا يظهر في السجل.</div>'
      + '<textarea id="sid-paste" class="search-box" style="margin:0;height:130px;font-size:13px;line-height:1.8" placeholder="محمد أحمد الزهراني&#9;1012345678"></textarea>'
      + '<div class="adm-tools" style="margin-top:8px"><button class="btn-primary" id="sid-check">🔎 طابِق الأسماء</button>'
      + '<button class="btn-gold" id="sid-save" disabled>💾 سجّل الهويات</button>'
      + '<button class="btn-soft" id="sid-count">📊 كم مسجّل؟</button></div>'
      + '<div id="sid-out" class="empty-note" style="padding:8px 2px 0;text-align:right"></div></div>';
    box.appendChild(wrap);
    var ready = null;
    var out = wrap.querySelector("#sid-out");
    function say(h) { out.innerHTML = h; }
    wrap.querySelector("#sid-check").onclick = function () {
      var rows = sidParse(wrap.querySelector("#sid-paste").value), idx = sidIndex();
      var ok = [], dup = [], miss = [], bad = [], seen = {};
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.bad) { bad.push(r); continue; }
        var hits = idx[sidNorm(r.name)] || [];
        if (hits.length === 1) {
          var key = hits[0].cid + ":" + hits[0].si;
          if (seen[key]) { dup.push(r); continue; }
          seen[key] = 1; ok.push({ name: r.name, nid: r.nid, cid: hits[0].cid, si: hits[0].si, cname: hits[0].cname });
        } else if (hits.length > 1) dup.push({ name: r.name, n: hits.length });
        else miss.push(r);
      }
      ready = ok;
      var h = "<b>طابق " + ok.length + "</b> من " + rows.length;
      if (dup.length) h += " · مكرر أو متشابه " + dup.length;
      if (miss.length) h += " · غير موجود " + miss.length;
      if (bad.length) h += " · أسطر غير مفهومة " + bad.length;
      if (miss.length) h += '<div style="margin-top:6px;color:var(--bad)">لم تُطابق: ' + miss.slice(0, 12).map(function (x) { return A.esc ? A.esc(x.name) : x.name; }).join(" · ") + (miss.length > 12 ? " …" : "") + "</div>";
      if (dup.length) h += '<div style="margin-top:6px;color:var(--gold)">متشابهة الأسماء تحتاج تمييزاً يدوياً: ' + dup.slice(0, 8).map(function (x) { return (A.esc ? A.esc(x.name) : x.name); }).join(" · ") + "</div>";
      say(h);
      wrap.querySelector("#sid-save").disabled = !ok.length;
    };
    wrap.querySelector("#sid-save").onclick = async function () {
      if (!ready || !ready.length) return;
      var btn = wrap.querySelector("#sid-save"); btn.disabled = true;
      var okc = 0, err = 0, lastErr = "", byCls = {}, byMk = {};
      for (var i = 0; i < ready.length; i++) {
        var r = ready[i];
        try {
          var h = await S.sha256(r.nid + "|" + r.cid + "|" + SID_SALT);
          // المفتاح القائم يبقى (وكذلك رمز الطالب إن ضبطه) — تبديلُه يُفقد الطالب صندوق رسائله
          // قراءةٌ فاشلة لا تُولّد مفتاحاً جديداً (تفقده صندوق رسائله) — تُحسب تعثّراً
          var pd = {}, pdOk = true;
          if (S.CLOUD && S.fdb) { try { var pv = await S.fdb.doc("spins/" + h).get(); pd = pv.exists ? (pv.data() || {}) : {}; } catch (e3) { pdOk = false; } }
          else { var DB0 = S.DB || window.DB || {}; pd = ((DB0.spins || {})[h]) || {}; }
          if (!pdOk) throw new Error("READ_FAIL");
          /* طالبٌ نُقل بين الفصول: بصمته تُحسب بالفصل الجديد فلا مستند لها — نحمل مفتاح
             صندوقه ورمزه السرّي من بصمة فصله السابق (سلسلة fromChain) قبل توليد أيّ جديد،
             ثم نحذف القديمة. بغير هذا تضيع رسائل معلميه ويصير باب بوابته بلا رمز. */
          var old = null;
          if (!isMk(pd.mk) && S.CLOUD && S.fdb && A.oldPinOf) { try { old = await A.oldPinOf(r.cid, r.si, r.nid); } catch (e4) { old = null; } }
          var mk = isMk(pd.mk) ? pd.mk : ((old && old.mk) ? old.mk : mkNew());
          var recS = { cid: r.cid, si: r.si, ts: Date.now(), mk: mk };
          var cc = (typeof pd.c === "string" && pd.c) ? pd.c : ((old && old.c) ? old.c : "");
          if (cc) recS.c = cc;
          if (S.CLOUD && S.fdb) await S.fdb.doc("spins/" + h).set(recS);
          else { var DBx = S.DB || window.DB || {}; DBx.spins = DBx.spins || {}; DBx.spins[h] = recS; try { S.save("spins"); } catch (e2) { } }
          if (old && old.h !== h && S.CLOUD && S.fdb) { try { await S.fdb.doc("spins/" + old.h).delete(); } catch (e5) { } }
          (byMk[r.cid] = byMk[r.cid] || {})[String(r.si)] = mk;
          okc++; (byCls[r.cid] = byCls[r.cid] || []).push(r.si);
        } catch (e) { err++; if (err === 1) lastErr = String((e && (e.code || e.message)) || e).slice(0, 90); }
        if (i % 20 === 0) say("جارِ التسجيل… " + (i + 1) + " من " + ready.length);
      }
      say(okc ? ("<b>سُجّل " + okc + "</b>" + (err ? " · تعثّر " + err : "") + " — يستطيع هؤلاء الدخول الآن من «بوابة الطالب» برقم هويتهم.")
        : ("<span style=\"color:var(--bad)\">لم يُسجَّل أحد — تعثّرت " + err + " محاولة" + (lastErr ? ": " + (A.esc ? A.esc(lastErr) : lastErr) : "") + "</span>"));
      // فهرس من يستطيع الدخول — يقرأه المعلم في نافذة الإرسال (ولا يمنع فشلُه نجاح التسجيل)
      var nc = 0; try { nc = await sidsWrite(byCls); } catch (e) { nc = 0; }
      try { await mkeysWrite(byMk); } catch (e) { }
      if (okc && nc) say(((wrap.querySelector("#sid-out") || {}).innerHTML || "") + '<div style="margin-top:6px">📇 حُدِّث فهرس ' + nc + ' فصلاً — يظهر لمعلميهم عدد الحسابات في نافذة إرسال الأوراق.</div>');
      try { await A.adminlog("sids", "تسجيل هويات " + okc + " طالباً"); } catch (e) { }
      btn.disabled = false;
    };
    wrap.querySelector("#sid-count").onclick = async function () {
      var b = wrap.querySelector("#sid-count"); b.disabled = true; say("جارِ العدّ…");
      var rows = sidParse(wrap.querySelector("#sid-paste").value);
      if (!rows.length) { say("الصق القائمة أولاً ثم اضغط «كم مسجّل؟» — العدّ يقارن قائمتك بما هو مسجّل فعلاً."); b.disabled = false; return; }
      var idx = sidIndex(), have = 0, tried = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i]; if (r.bad) continue;
        var hits = idx[sidNorm(r.name)] || []; if (hits.length !== 1) continue;
        tried++;
        try {
          var h = await S.sha256(r.nid + "|" + hits[0].cid + "|" + SID_SALT);
          var d = (S.CLOUD && S.fdb) ? await S.fdb.doc("spins/" + h).get() : { exists: !!(((S.DB || window.DB || {}).spins || {})[h]) };
          if (d.exists) have++;
        } catch (e) { }
      }
      var total = 0, cls = (S.D.classes || []);
      for (var c = 0; c < cls.length; c++) total += (cls[c].students || []).filter(function (x) { return x && !x.moved && !x.gap; }).length;
      say("<b>مسجّل " + have + "</b> من " + tried + " في قائمتك · وطلاب المدرسة " + total);
      b.disabled = false;
    };
  }

  A().register("manage", render);
  Object.assign(window.SIJIL_ADMIN, { backupAll, restoreSummary: summarize, openBell });
})();
