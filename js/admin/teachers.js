/* ═══════════ لوحة المدير — وحدة 👨‍🏫 المعلمون (teachers) + 👤 بياناتي (profile) — js/admin/teachers.js ═══════════
   تعتمد على window.SIJIL (app.js) و window.SIJIL_ADMIN (core.js).
   • teachers: جدول المعلمين (الاسم/المادة/الفصول/الجوال/حالة الدخول/آخر رصد/الرائد) + ✏️ تعديل + 🔑 إعادة تعيين رقم الدخول (توليد عشوائي)
               + ➕ إضافة معلم (معرّف tNN غير مستخدم) + 🎖️ رواد الفصول (رائد واحد لكل فصل يُحفظ في teachers/{tid}.lead)
               + تحذير أمني يُعرض مرة واحدة (localStorage sijil.adm.secwarn) + آخر عمليات المعلمين من adminlog.
   • profile:  بطاقة الحساب + تعديل الجوال + تغيير رقم الدخول بالتحقق من الحالي محلياً sha256(pin|tid|SALT) — نفس صيغة الدخول في app.js
               + 🏫 أسماء إدارة المدرسة (cfg/school: مدير المدرسة والوكيلان والمرشد) للمدير وحده، تُحفظ بزر واحد عبر SIJIL_ADMIN.saveStaff
               (هو من يتحقق ويُسجّل في adminlog)، ويستعملها sigLine في تواقيع كل المطبوعات — المعلم لا يرى الحقول ويستفيد منها في مطبوعاته.
   • التصدير: SIJIL_ADMIN.profileCard(el, {flat}) و SIJIL_ADMIN.leadBadge(tid) — للاستخدام من الوحدات الأخرى ومن app.js
               (في «المزيد» للمعلم العادي: window.SIJIL_ADMIN && SIJIL_ADMIN.profileCard(box.querySelector('#me-slot'))).
   الكتابة في teachers/{tid}: مستند كامل مُنظَّف بالحقول name/subject/mob/phone/classes/pinHash/admin/lead/ts فقط (admin لا يتغير أبداً)
   — مطابق لقاعدة teacherShape() في firestore.rules. تجريبياً: التعديلات في الذاكرة (D.teachers) وتُحفظ في DB.tedits وتُعاد على D عند التحميل.
   كل عملية تُسجَّل في adminlog عبر SIJIL_ADMIN.adminlog. */
(function () {
  "use strict";
  if (!window.SIJIL || !window.SIJIL_ADMIN) return;
  const S = () => window.SIJIL, A = () => window.SIJIL_ADMIN;
  const H = A().H;
  const esc = (s) => S().esc(s);
  const $ = (q, root) => (root || document).querySelector(q);
  const warn = (...a) => { try { console.warn("[admin/teachers]", ...a); } catch (e) { } };
  const SEC_KEY = "sijil.adm.secwarn";
  const PIN_RE = /^\d{6,12}$/;      // كل رقم دخول جديد: 6 خانات فأكثر (الأقصر يُخمَّن بسرعة)
  let q = "";                         // نص البحث في جدول المعلمين
  let dupOk = "";                     // اسم مكرر وافق المدير على إضافته (نقرة ثانية)

  /* ═══ CSS خاص بالوحدة (يُحقن مرة) ═══ */
  function css() {
    if ($("#adm-teachers-css")) return;
    const st = document.createElement("style"); st.id = "adm-teachers-css";
    st.textContent = `
.tch-tools .search-box{flex:1 1 200px;width:auto;margin:0;padding:10px 12px;font-size:14px}
.tch-tools .btn-gold,.tch-tools .btn-plain{flex:0 0 auto;padding:9px 13px;font-size:13.5px}
.tch-cls{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}
.tch-cls label{border:1.5px solid var(--line);border-radius:18px;padding:5px 11px;font-size:13px;font-weight:700;color:var(--navy);cursor:pointer;background:#fff;user-select:none}
.tch-cls label.on{background:var(--navy);color:var(--goldl);border-color:var(--navy)}
.tch-cls input{display:none}
.tch-chips{display:flex;flex-wrap:wrap;gap:3px;justify-content:center}
.tch-chips .cc{background:var(--navy);padding:2px 7px;font-size:10.5px;white-space:nowrap}
.tch-chips .cc.more{background:var(--gold);color:var(--navy);cursor:default}
.tch-tag{background:var(--gold);color:var(--navy);border-radius:12px;padding:1px 7px;font-size:10px;font-weight:800;white-space:nowrap}
.tch-id{color:var(--muted);font-size:10.5px;font-weight:400}
.tch-act{display:flex;gap:4px;justify-content:center;white-space:nowrap}
.tch-act button{border:1.5px solid var(--line);background:#fff;border-radius:8px;padding:4px 8px;font-size:15px;cursor:pointer;line-height:1.3}
.tch-act button:hover{border-color:var(--gold);background:#fdf6e3}
.tch-act button:active{transform:scale(.95)}
.tch-mob{color:var(--navy);text-decoration:none;direction:ltr;unicode-bidi:embed;font-weight:700}
.tch-pin{font-size:28px;font-weight:800;letter-spacing:8px;color:var(--navy);text-align:center;background:#fdf6e3;border:1.5px dashed var(--gold);border-radius:12px;padding:12px 8px;margin:10px 0;direction:ltr;font-family:ui-monospace,Consolas,monospace}
.tch-status{white-space:nowrap;font-weight:700;font-size:11.5px}
.tch-status.ok{color:var(--ok)} .tch-status.no{color:var(--bad)}
.tch-lead select{width:100%;padding:7px 8px;border:1.5px solid var(--line);border-radius:9px;font-family:inherit;font-size:13px;background:#fff;color:var(--navy);min-width:150px}
.tch-lead select:disabled{opacity:.5}
.tch-none{color:#bbb}
.adm-alert .x{float:left;border:none;background:none;font-size:18px;cursor:pointer;color:var(--muted);line-height:1;padding:0 4px}
.me-head{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.me-avatar{width:52px;height:52px;border-radius:50%;background:linear-gradient(150deg,var(--navy),var(--navy2));color:var(--goldl);display:flex;align-items:center;justify-content:center;font-size:26px;flex:0 0 auto;border:2px solid var(--gold)}
.me-name{font-size:17px;font-weight:800;color:var(--navy)}
.me-sub{font-size:12.5px;color:var(--muted)}
.me-lead{display:inline-block;background:#fdf6e3;border:1px solid var(--gold);color:#7a6520;border-radius:14px;padding:2px 9px;font-size:12px;font-weight:800;margin:4px 3px 0 0}
.me-mobrow{display:flex;gap:6px}
.me-mobrow input{flex:1;min-width:0;padding:10px 12px;border:1.5px solid var(--line);border-radius:12px;font-size:15px;font-family:inherit;background:#fbf9f4;color:var(--ink);direction:ltr;text-align:right}
.me-mobrow button{flex:0 0 auto;padding:8px 14px}
.me-form .field input{font-size:16px;direction:ltr;text-align:right;letter-spacing:2px}
.ab-lead{display:inline-block;background:var(--gold);color:var(--navy);border-radius:10px;padding:0 6px;font-size:11px;font-weight:800;margin-inline-start:6px}
.me-staff{margin-top:14px;border-top:1.5px dashed var(--line);padding-top:12px}
.me-staff .hd{font-size:14.5px;font-weight:800;color:var(--navy);margin-bottom:4px}
.me-staff .sb{font-size:12px;color:var(--muted);line-height:1.8;margin-bottom:10px}
.me-staff .field{margin-bottom:9px}
.me-staff .field input{padding:10px 12px;font-size:14.5px}
.me-staff .btn-primary{width:100%}
@media print{.tch-act,.tch-tools,.adm-alert,.me-form,.tch-lead,.me-staff{display:none!important}}`;
    document.head.appendChild(st);
  }

  /* ═══ أدوات ═══ */
  // رسالة فشل الكتابة من النواة (تميّز رفض القواعد عن انقطاع الشبكة) — واحتياط لو كانت النواة قديمة في الكاش
  const wErr = (e, what) => { const f = A().writeErr; try { if (typeof f === "function") return f(e, what); } catch (x) { } return "تعذّر " + (what || "الحفظ") + " — تحقّق من الاتصال ثم أعد المحاولة."; };
  const teachers = () => (S().D.teachers || []);
  const byId = (tid) => teachers().find(t => t.id === tid) || null;
  const mobOf = (t) => String((t && (t.mob || t.phone)) || "").trim();
  const isDemo = () => !(S().CLOUD && S().fdb);
  const clsName = (cid) => { const c = S().classById(cid); return c ? c.name : cid; };
  const nActive = (c) => (S().activeCount ? S().activeCount(c) : S().activeStudents(c).length);
  // «سجّل هويته» = علم التسجيل الجديد (js/auth.js) أو البصمة القديمة قبل الترحيل
  const AU = () => { const a = window.SIJIL_AUTH; return (a && typeof a.verify === "function") ? a : null; };
  function isReg(t) {
    if (!t) return false;
    const a = AU();
    if (a && typeof a.isRegistered === "function") { try { return !!a.isRegistered(t); } catch (e) { } }
    return t.reg === true || !!t.pinHash;
  }
  // بصمة رقمه ما تزال محفوظة في مستنده المقروء ⇒ رقمه في حكم المكشوف حتى يُعيَّن له رقم جديد
  const exposedPin = (t) => { const a = AU(); return !!(a && typeof a.exposed === "function" && a.exposed(t)); };
  const loginState = (t) => exposedPin(t) ? { ok: false, t: "⚠️ يحتاج رقماً جديداً" }
    : isReg(t) ? { ok: true, t: "✅ سجّل هويته" } : isDemo() ? { ok: true, t: "🧪 تجريبي (1234)" } : { ok: false, t: "⏳ لم يسجّل" };
  /* كان حساب المدير مقفلاً دائماً في الوضع السحابي لأن القواعد آنذاك جمّدت ختم الرقم pt له فلا يُغيَّر
     رقمه إلا من كونسول Firebase. القواعد المنشورة اليوم تسمح له (firestore.rules: «ختم الرقم pt يتبع
     قناة الإثبات» — وقناة المدير لا تُفتح إلا بمعرفة رقمه هو)، ولم تبقَ بصمة منشورة في مستندات المعلمين
     بعد الحذف الجماعي، وهو ما تَعِد به docs/AUTH_SPEC.md §8. فبقي القفل حاجزاً بلا سبب: المدير وحده
     عاجز عن تغيير رقمه لو تسرّب. القفل الآن للحالة الوحيدة التي تعجز عنها القواعد فعلاً: بصمة قديمة
     ما تزال منشورة في مستند المدير — لا تصلح إثباتاً، ولا مديرَ فوقه يعيد تعيينها له. */
  const pinLocked = (t) => !isDemo() && !!(t && t.admin) && exposedPin(t);
  const PIN_LOCK = "رقم دخول حساب المدير محفوظ بالطريقة القديمة فلا يصلح لإثبات هويته — يُحذف حقل pinHash من مستند الحساب في كونسول Firebase، ثم يصير الرقم قابلاً للتغيير من هنا.";
  const randPin = () => { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(100000 + (a[0] % 900000)); } catch (e) { return String(100000 + Math.floor(Math.random() * 900000)); } };
  const subjects = () => [...new Set(teachers().map(t => t.subject).filter(Boolean))].sort();
  const leadOf = (t) => ((t && t.lead) || []).filter(cid => !!S().classById(cid));
  const leaderOf = (cid) => teachers().find(t => (t.lead || []).includes(cid)) || null;
  // شارة الرائد (تُصدَّر) — tid أو كائن المعلم
  function leadBadge(tid) {
    css();
    const t = (tid && typeof tid === "object") ? tid : byId(tid);
    const ids = leadOf(t); if (!ids.length) return "";
    return ids.map(cid => `<span class="me-lead">🎖️ رائد ${esc(clsName(cid))}</span>`).join("");
  }
  // آخر تاريخ رصد لكل معلم من خرائط schoolDocs (مسح واحد)
  function lastByTeacher(sd) {
    const out = {};
    Object.keys((sd && sd.recs) || {}).forEach(id => { const k = A().splitKey(id); const d = A().lastRecDate(sd.recs[id]); if (d && (!out[k.tid] || d > out[k.tid])) out[k.tid] = d; });
    return out;
  }
  // تنظيف مستند المعلم قبل الكتابة: الحقول المسموحة فقط (teacherShape في القواعد)، admin من المستند الأصلي (لا يتغير)، ts الآن
  function cleanDoc(src, base) {
    const ids = new Set((S().D.classes || []).map(c => c.id));
    const out = { name: String(src.name || "").trim().slice(0, 80), classes: [...new Set((src.classes || []).filter(c => ids.has(c)))].slice(0, 40), ts: Date.now() };
    if (src.subject != null && String(src.subject).trim()) out.subject = String(src.subject).trim().slice(0, 80);
    if (typeof src.mob === "string" && src.mob.trim()) out.mob = src.mob.trim().slice(0, 20);
    else if (typeof src.phone === "string" && src.phone.trim()) out.phone = src.phone.trim().slice(0, 20);
    if (typeof src.pinHash === "string" && src.pinHash) out.pinHash = src.pinHash.slice(0, 64);
    // علم التسجيل وختم الرقم (js/auth.js) — يمرّان كما هما وإلا أُبطل رقم دخول المعلم عند أي تعديل لبياناته
    if (src.reg === true) out.reg = true;
    if (typeof src.pt === "number" && src.pt > 0) out.pt = src.pt;
    if (base && typeof base.admin === "boolean") out.admin = base.admin;
    const lead = [...new Set((src.lead || []).filter(c => ids.has(c)))].slice(0, 40); if (lead.length) out.lead = lead;
    return out;
  }
  // تطبيق مستند على D.teachers (في مكانه حتى يبقى مرجع TE حياً) + انعكاس فوري على الجلسة
  function applyLocal(tid, doc) {
    const s = S(), D = s.D; let t = byId(tid);
    if (!t) { t = { id: tid }; D.teachers.push(t); D.teachers.sort((a, b) => String(a.id).localeCompare(String(b.id))); }
    Object.keys(t).forEach(k => { if (k !== "id" && !(k in doc)) delete t[k]; });
    Object.assign(t, doc);
    if (s.TE && s.TE.id === tid) { s.TE = t; refreshHeader(); }
    rebuildLoginSelect();
    return t;
  }
  /* ═══ إعادة تسمية معلم ⇒ إعادة كتابة صفوف الجدول ═══
     صفوف الجدول تُخزَّن باسم المعلم نصاً (r.t) ويرشّحها كل مستهلكيها بـ r.t === TE.name، فكان تصحيح
     الاسم يقطع صلة المعلم بجدوله بصمت: «حصص اليوم» صفر، وشبكة الحصص كلها «—»، ولا تنبيه حصة،
     وملف التقويم بلا مواعيد، والاسم القديم يبقى معلماً شبحاً في الجدول العام. */
  const schedCount = (name) => (Array.isArray(S().D.schedule) ? S().D.schedule : []).filter(r => r && r.t === name).length;
  /* حين يتشارك الاسمَ معلمان (خطأ في التعديل مثلاً) لم يعد الاسم يميّز صاحب الصف، فكانت إعادة التسمية
     تنقل «كل» الصفوف الحاملة للاسم — بما فيها حصص الزميل — فيفقد جدوله كاملاً بلا تنبيه ولا تراجع.
     نقصرها الآن على فصول هذا المعلم وحده، ونستثني الفصول التي يشاركه فيها حاملُ الاسم نفسه (ملتبسة).
     null = الاسم فريد ⇒ كل صفوفه له (السلوك الطبيعي). */
  function renameScope(oldName, tid) {
    const others = teachers().filter(t => t.id !== tid && String(t.name || "") === oldName);
    if (!tid || !others.length) return null;
    const mine = new Set(((byId(tid) || {}).classes) || []);
    others.forEach(t => (t.classes || []).forEach(c => mine.delete(c)));
    return mine;
  }
  // ⇒ { n: صفوف أُعيدت تسميتها, skipped: صفوف بالاسم نفسه تُركت لأنها ملتبسة بين معلمين }
  async function renameInSchedule(oldName, newName, tid) {
    const s = S(), all = Array.isArray(s.D.schedule) ? s.D.schedule : [];
    const scope = renameScope(oldName, tid);
    const hit = (r) => !!(r && r.t === oldName && (!scope || scope.has(r.c)));
    const n = all.filter(hit).length, skipped = all.filter(r => r && r.t === oldName).length - n;
    if (!n) return { n: 0, skipped: skipped };
    const rows = all.map(r => ({ t: hit(r) ? newName : String((r && r.t) || ""), d: String((r && r.d) || ""), p: Number(r && r.p) || 0, c: String((r && r.c) || "") }));
    if (s.CLOUD && s.fdb) {
      await s.fdb.doc("schedule/all").set({ rows: rows, tn: String((s.TE && s.TE.name) || "الإدارة").slice(0, 80), ts: Date.now() });
      s.D.schedule = rows;
      try { localStorage.setItem("sijil.cloudD", JSON.stringify(s.D)); } catch (e) { }
    } else { s.D.schedule = rows; s.DB.schedule = rows; s.save(); }
    // نمرّر نطاق التسمية لمحرّر الجدول ليطبّقه على تعديلاته المعلّقة بدل أن يعيد بناءها فيفقدها المدير
    try { const SC = window.SIJIL_ADMIN_SCHEDULE; if (SC && typeof SC.reload === "function") SC.reload({ from: oldName, to: newName, cids: scope ? [...scope] : null }); } catch (e) { }
    return { n: n, skipped: skipped };
  }
  // الكتابة: سحابياً مستند كامل مُنظَّف (بعد قراءة الحالي حتى لا نمسح pinHash حديثاً من جهاز آخر) — تجريبياً DB.tedits
  async function writeTeacher(tid, patch, isNew) {
    const s = S(), cur = byId(tid);
    if (!isDemo()) {
      const ref = s.fdb.doc("teachers/" + tid); let base = {};
      if (!isNew) { try { const snap = await ref.get(); base = snap.exists ? (snap.data() || {}) : (cur || {}); } catch (e) { base = cur || {}; } }
      const doc = cleanDoc(Object.assign({}, base, patch), base);
      await ref.set(doc);
      const t = applyLocal(tid, doc);
      try { localStorage.setItem("sijil.cloudD", JSON.stringify(s.D)); } catch (e) { }
      return t;
    }
    const doc = cleanDoc(Object.assign({}, cur || {}, patch), cur || {});
    const t = applyLocal(tid, doc);
    const DB = s.DB; DB.tedits = (DB.tedits && typeof DB.tedits === "object" && !Array.isArray(DB.tedits)) ? DB.tedits : {}; DB.tedits[tid] = doc; s.save();
    return t;
  }
  // تجريبياً: إعادة تعديلات المعلمين المحفوظة على D بعد التحميل
  function applyTedits() {
    const s = S(); if (!s.D || !isDemo()) return;
    const te = s.DB.tedits; if (!te || typeof te !== "object") return;
    Object.keys(te).forEach(tid => { if (/^t\d{2,3}$/.test(tid) && te[tid] && te[tid].name) { try { applyLocal(tid, te[tid]); } catch (e) { warn("tedit " + tid, e); } } });
  }
  // قائمة الدخول: تعكس الاسم الجديد/المعلم الجديد فوراً (نفس مرشّح initLogin في app.js)
  function rebuildLoginSelect() {
    const sel = $("#lg-teacher"); if (!sel) return; const v = sel.value;
    sel.innerHTML = '<option value="">— اختر اسمك —</option>' + teachers().filter(t => (t.classes || []).length || t.admin).map(t => `<option value="${esc(t.id)}">${esc(t.name)}${t.admin ? " (المدير)" : ""}</option>`).join("");
    sel.value = v;
  }
  // رأس التطبيق: الاسم — الدور + شارة الرائد
  function refreshHeader() {
    const s = S(), t = s.TE, el = $("#ab-who"); if (!t || !el) return;
    const leads = leadOf(t).map(clsName);
    el.innerHTML = esc(t.name) + " — " + esc(t.admin ? "مدير المدرسة" : (t.subject || "")) + (leads.length ? `<span class="ab-lead">🎖️ رائد ${esc(leads.join("، "))}</span>` : "");
  }
  // app.js يكتب #ab-who كنص عند كل دخول — نعيد الشارة بعده (مراقب واحد، بلا حلقة: بعد كتابتنا توجد .ab-lead)
  let hdrOb = null;
  function hookHeader() {
    const el = $("#ab-who"); if (!el || hdrOb) return;
    try {
      hdrOb = new MutationObserver(() => {
        const t = S().TE; if (!t || !leadOf(t).length) return;
        if (el.querySelector(".ab-lead")) return;
        css(); refreshHeader();
      });
      hdrOb.observe(el, { childList: true, characterData: true, subtree: true });
    } catch (e) { warn("hdr", e); }
  }

  /* ═══ نماذج (داخل openSheet) ═══ */
  const clsPicker = (sel) => `<div class="tch-cls">${A().sortedClasses().map(c => `<label class="${(sel || []).includes(c.id) ? "on" : ""}"><input type="checkbox" value="${esc(c.id)}"${(sel || []).includes(c.id) ? " checked" : ""}>${esc(c.name)}</label>`).join("")}</div>`;
  const bindPicker = (o) => o.querySelectorAll(".tch-cls input").forEach(i => i.onchange = () => i.parentNode.classList.toggle("on", i.checked));
  const pickedCls = (o) => [...o.querySelectorAll(".tch-cls input:checked")].map(i => i.value);
  function formHtml(t, isNew) {
    t = t || {};
    return `<div class="field"><label>الاسم</label><input id="tf-name" maxlength="80" value="${esc(t.name || "")}" autocomplete="off"></div>
      <div class="field"><label>المادة</label><input id="tf-subj" list="tf-subs" maxlength="80" value="${esc(t.subject || "")}" autocomplete="off"><datalist id="tf-subs">${subjects().map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
      <div class="field"><label>الجوال (05xxxxxxxx)</label><input id="tf-mob" inputmode="tel" maxlength="20" value="${esc(mobOf(t))}" autocomplete="off" style="direction:ltr;text-align:right"></div>
      <div class="field"><label>الفصول المسندة</label>${clsPicker(t.classes || [])}</div>
      ${isNew ? `<div class="field"><label>رقم الدخول الأولي (6–12 رقماً)</label><div class="me-mobrow"><input id="tf-pin" inputmode="numeric" maxlength="12" autocomplete="off" style="letter-spacing:3px"><button class="btn-gold" id="tf-gen" type="button">🎲 توليد</button></div></div>` : ""}
      <div class="login-err" id="tf-err"></div>
      <div class="sheet-actions"><button class="btn-plain" id="tf-no">إلغاء</button><button class="btn-primary" id="tf-ok">${isNew ? "➕ إضافة" : "💾 حفظ"}</button></div>`;
  }
  // قراءة النموذج والتحقق → {patch} أو {err}
  function readForm(o, isNew) {
    const name = $("#tf-name", o).value.trim().replace(/\s+/g, " "), subject = $("#tf-subj", o).value.trim(), mobRaw = $("#tf-mob", o).value.trim();
    if (!name) return { err: "اكتب اسم المعلم" };
    if (name.length > 80) return { err: "الاسم طويل جداً" };
    let mob = "";
    if (mobRaw) { mob = A().normMob(mobRaw); if (!mob) return { err: "صيغة الجوال غير صحيحة — مثال: 0501234567" }; }
    const patch = { name, subject, mob, classes: pickedCls(o) };
    if (isNew) { const pin = $("#tf-pin", o).value.trim(); if (!PIN_RE.test(pin)) return { err: "رقم الدخول: من 6 إلى 12 رقماً" }; patch.pin = pin; }
    return { patch };
  }
  function diffNote(oldT, p) {
    const ch = [];
    if ((oldT.name || "") !== p.name) ch.push("الاسم");
    if ((oldT.subject || "") !== p.subject) ch.push("المادة");
    if ((A().normMob(mobOf(oldT)) || mobOf(oldT)) !== (p.mob || "")) ch.push("الجوال");
    const a = (oldT.classes || []).slice().sort().join(","), b = p.classes.slice().sort().join(",");
    if (a !== b) ch.push(`الفصول (${(oldT.classes || []).length}→${p.classes.length})`);
    return ch;
  }

  /* ═══ ✏️ تعديل معلم ═══ */
  function editTeacher(tid, after) {
    const t = byId(tid); if (!t) return;
    css(); dupOk = "";
    S().openSheet(`<h4>✏️ تعديل بيانات المعلم <span class="tch-id">(${esc(tid)})</span></h4>` + formHtml(t, false), (o) => {
      bindPicker(o);
      $("#tf-no", o).onclick = () => S().closeSheet();
      $("#tf-ok", o).onclick = async () => {
        const r = readForm(o, false), err = $("#tf-err", o);
        if (r.err) { err.textContent = r.err; return; }
        const ch = diffNote(t, r.patch);
        if (!ch.length) { S().closeSheet(); A().toast("لا تغيير"); return; }
        /* الاسم المكرر يُدمج جدولَي المعلمَين فوراً (صفوف الجدول تُخزَّن بالاسم نصاً) ولا سبيل لفصلهما
           بعدها — نطلب تأكيداً صريحاً كما يفعل نموذج الإضافة، بدل الحفظ الصامت. */
        if (r.patch.name !== String(t.name || "") && teachers().some(x => x.id !== tid && String(x.name || "") === r.patch.name) && dupOk !== r.patch.name) {
          dupOk = r.patch.name;
          err.textContent = "⚠️ يوجد معلم آخر بالاسم نفسه — وصفوف الجدول تُخزَّن بالاسم، فسيندمج جدولاهما. اضغط «حفظ» مرة أخرى للتأكيد.";
          return;
        }
        $("#tf-ok", o).disabled = true; err.textContent = "جارِ الحفظ…";
        try {
          const s = S(), wasMe = !!(s.TE && s.TE.id === tid), clsChanged = ch.some(x => x.indexOf("الفصول") === 0);
          const p = Object.assign({}, r.patch); p.phone = "";                       // الجوال الجديد يحل محل القديم (phone القديم يُسقط دائماً)
          /* الجدول أولاً ثم مستند المعلم: لو تعذّرت كتابة الجدول لم يُغيَّر شيء أصلاً، ولو تعذّرت كتابة
             المستند بعدها أعدنا الجدول إلى الاسم القديم — فلا يبقى الجدول معلَّقاً باسم لا وجود له. */
          const oldName = t.name || "", newName = r.patch.name, renamed = oldName !== newName;
          let moved = 0;
          let skipped = 0;
          if (renamed) {
            try { const rs = await renameInSchedule(oldName, newName, tid); moved = rs.n; skipped = rs.skipped; }
            catch (e2) { warn("rename/schedule", e2); err.textContent = wErr(e2, "تحديث الجدول بالاسم الجديد") + " — لم يُحفظ التعديل."; $("#tf-ok", o).disabled = false; return; }
          }
          try { await writeTeacher(tid, p, false); }
          catch (e3) { if (moved) { try { await renameInSchedule(newName, oldName, tid); } catch (e4) { warn("rollback/schedule", e4); } } throw e3; }
          const skipTxt = skipped ? ` — وتُركت ${skipped} حصة باسمه القديم لأن معلماً آخر يحمل الاسم نفسه في الفصل ذاته` : "";
          await A().adminlog("edit", `تعديل بيانات ${newName}: ${ch.join("، ")}` + (moved ? ` (أُعيدت تسمية ${moved} حصة في الجدول)` : "") + (skipped ? ` (تُركت ${skipped} حصة ملتبسة)` : ""), tid);
          s.closeSheet(); A().toast("✔ حُفظت بيانات " + newName + (moved ? ` — وحُدِّث اسمه في ${moved} حصة بالجدول` : "") + skipTxt, (moved || skipped) ? 5200 : 2200);
          if (moved) { try { s.rerenderTab(); } catch (e5) { } }
          if (wasMe && s.TE.admin && clsChanged) { A().init(s.TE); s.switchTab(A().currentTab() || "teachers"); }   // زر «واجهتي كمعلم» يظهر/يختفي
          else if (after) after();
        } catch (e) { warn("edit", e); err.textContent = wErr(e, "حفظ بيانات المعلم"); $("#tf-ok", o).disabled = false; }
      };
    });
  }

  /* ═══ ➕ إضافة معلم ═══ */
  function addTeacher(after) {
    const tid = A().nextTeacherId(); dupOk = "";
    css();
    S().openSheet(`<h4>➕ معلم جديد <span class="tch-id">(${esc(tid)})</span></h4>` + formHtml(null, true), (o) => {
      bindPicker(o);
      $("#tf-gen", o).onclick = () => { $("#tf-pin", o).value = randPin(); };
      $("#tf-no", o).onclick = () => S().closeSheet();
      $("#tf-ok", o).onclick = async () => {
        const r = readForm(o, true), err = $("#tf-err", o);
        if (r.err) { err.textContent = r.err; return; }
        if (byId(tid)) { err.textContent = "المعرّف مستخدم — أعد فتح النموذج"; return; }
        if (teachers().some(x => x.name === r.patch.name) && dupOk !== r.patch.name) { dupOk = r.patch.name; err.textContent = "يوجد معلم بالاسم نفسه — اضغط «إضافة» مرة أخرى للتأكيد"; return; }
        $("#tf-ok", o).disabled = true; err.textContent = "جارِ الإضافة…";
        try {
          const p = r.patch, pin = p.pin; delete p.pin;
          if (!p.mob) delete p.mob;
          const au = AU();
          if (!au) { err.textContent = "تعذّر تجهيز رقم الدخول — أعد تحميل الصفحة ثم أضف المعلم"; $("#tf-ok", o).disabled = false; return; }
          await writeTeacher(tid, p, true);
          // رقم الدخول يُسجَّل في «pins» وحدها — ولا تُكتب بصمته في مستند المعلم أبداً لأنه مقروء لأي جهاز
          const rr = await au.registerFirst(tid, pin).catch(() => null);
          if (!rr || !rr.ok) {
            await A().adminlog("add", `إضافة معلم ${p.name} — بلا رقم دخول بعد`, tid);
            if (after) { try { const r2 = after(); if (r2 && r2.catch) r2.catch(() => { }); } catch (e2) { warn("after/add", e2); } }
            err.textContent = "أُضيف المعلم، لكن لم يُسجَّل رقم دخوله (" + ((rr && rr.err) || "تحقق من الإنترنت") + ") — عيّنه من بطاقته بزر «🔑 إعادة تعيين رقم الدخول».";
            $("#tf-ok", o).disabled = false; return;
          }
          await A().adminlog("add", `إضافة معلم ${p.name} (${p.subject || "بلا مادة"}) — ${p.classes.length} فصول`, tid);
          if (after) { try { const r2 = after(); if (r2 && r2.catch) r2.catch(() => { }); } catch (e2) { warn("after/add", e2); } }   // الجدول يتحدّث فور نجاح الكتابة مهما أُغلقت النافذة
          showPin(o, p.name, tid, pin, "➕ أُضيف المعلم", after);
        } catch (e) { warn("add", e); err.textContent = wErr(e, "إضافة المعلم"); $("#tf-ok", o).disabled = false; }
      };
    });
  }

  /* ═══ 🔑 إعادة تعيين رقم الدخول ═══ */
  function resetPin(tid, after) {
    const t = byId(tid); if (!t) return;
    css();
    const au = AU(), me = S().TE;
    S().openSheet(`<h4>🔑 إعادة تعيين رقم الدخول</h4>
      <div style="text-align:center;font-weight:800;color:var(--navy);margin-bottom:8px">${esc(t.name)} <span class="tch-id">(${esc(tid)})</span></div>
      <div class="field"><label>رقم الدخول الجديد (6–12 رقماً)</label><div class="me-mobrow"><input id="tp-pin" inputmode="numeric" maxlength="12" autocomplete="off" style="letter-spacing:3px"><button class="btn-gold" id="tp-gen" type="button">🎲 توليد عشوائي</button></div></div>
      ${au ? '<div class="field"><label>رقم دخولك أنت (للتأكيد)</label><input type="password" id="tp-my" inputmode="numeric" maxlength="12" autocomplete="current-password"></div>' : ""}
      <div class="empty-note" style="padding:4px 2px;text-align:right;min-height:0">تُحفظ بصمة الرقم فقط لا الرقم نفسه، وسيُطلب من المعلم الرقم الجديد على كل أجهزته${au ? "، ولن يعمل رقمه القديم بعدها" : ""}.</div>
      <div class="login-err" id="tp-err"></div>
      <div class="sheet-actions"><button class="btn-plain" id="tp-no">إلغاء</button><button class="btn-primary" id="tp-ok">🔑 تعيين</button></div>`, (o) => {
      $("#tp-gen", o).onclick = () => { $("#tp-pin", o).value = randPin(); };
      $("#tp-no", o).onclick = () => S().closeSheet();
      $("#tp-ok", o).onclick = async () => {
        const pin = $("#tp-pin", o).value.trim(), err = $("#tp-err", o);
        const myEl = $("#tp-my", o), my = myEl ? myEl.value.trim() : "";
        if (!PIN_RE.test(pin)) { err.textContent = "رقم الدخول: من 6 إلى 12 رقماً"; return; }
        if (au && !my) { err.textContent = "اكتب رقم دخولك أنت للتأكيد"; return; }
        $("#tp-ok", o).disabled = true; err.textContent = "جارِ الحفظ…";
        try {
          if (!au) { err.textContent = "تعذّر تجهيز رقم الدخول — أعد تحميل الصفحة ثم حاول"; $("#tp-ok", o).disabled = false; return; }
          const rr = await au.resetPin(tid, (me && me.id) || "", my, pin);
          if (!rr || !rr.ok) { err.textContent = (rr && rr.err) || "تعذّر الحفظ"; $("#tp-ok", o).disabled = false; return; }
          await A().adminlog("pin", `إعادة تعيين رقم دخول ${t.name}`, tid);
          if (after) { try { const r2 = after(); if (r2 && r2.catch) r2.catch(() => { }); } catch (e2) { warn("after/pin", e2); } }
          showPin(o, t.name, tid, pin, "✔ عُيّن رقم الدخول", after);
        } catch (e) { warn("pin", e); err.textContent = wErr(e, "تعيين رقم الدخول"); $("#tp-ok", o).disabled = false; }
      };
    });
  }
  // عرض الرقم مرة واحدة بعد التعيين + نسخ + واتساب (الرقم لا يُكتب في سجل الإدارة)
  function showPin(o, name, tid, pin, title, after) {
    const t = byId(tid) || {}, mob = mobOf(t);
    const msg = `السلام عليكم أ. ${name}\nرقم دخولك إلى «سجلي» (${S().META.school.name}): ${pin}\nيمكنك تغييره من «👤 بياناتي» داخل التطبيق.`;
    const sh = o.querySelector(".sheet") || o;
    sh.innerHTML = `<h4>${esc(title)}</h4>
      <div style="text-align:center;font-weight:800;color:var(--navy)">${esc(name)} <span class="tch-id">(${esc(tid)})</span></div>
      <div class="tch-pin" id="tp-show">${esc(pin)}</div>
      <div class="empty-note" style="padding:0 0 8px;min-height:0">أرسل الرقم للمعلم الآن — لن يُعرض مرة أخرى.${isDemo() ? "<br>🧪 وفي النسخة التجريبية: بعد هذا التعيين لن يعمل الرقم 1234 لهذا المعلم." : ""}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn-gold" id="tp-copy">📋 نسخ الرقم</button>${mob ? `<a class="btn-gold" style="text-align:center;text-decoration:none" target="_blank" rel="noopener" href="${A().waHref(mob, msg)}">💬 واتساب</a>` : `<button class="btn-gold" disabled style="opacity:.55">💬 لا جوال مسجّل</button>`}</div>
      <div class="sheet-actions"><button class="btn-plain" id="tp-done">إغلاق</button></div>`;
    $("#tp-copy", sh).onclick = async () => { try { await navigator.clipboard.writeText(pin); A().toast("📋 نُسخ الرقم"); } catch (e) { A().toast("تعذّر النسخ — انسخه يدوياً"); } };
    $("#tp-done", sh).onclick = () => { S().closeSheet(); if (after) after(); };
  }

  /* ═══ 🎖️ رواد الفصول: رائد واحد لكل فصل، ويُزال الفصل من الرائد السابق ═══ */
  async function assignLead(cid, tid) {
    const prev = leaderOf(cid);
    if (prev && prev.id === tid) return false;
    if (!tid && !prev) return false;
    // الترتيب مقصود: نُسند الجديد أولاً ثم نزيل السابق — إن فشلت الثانية بقي للفصل رائدان (يُصلحان بنقرة) لا صفر رائد
    if (tid) { const t = byId(tid); if (!t) throw new Error("معلم غير موجود"); await writeTeacher(tid, { lead: [...new Set([...(t.lead || []), cid])] }, false); }
    let halfWay = "";
    if (prev) {
      try { await writeTeacher(prev.id, { lead: (prev.lead || []).filter(c => c !== cid) }, false); }
      catch (e) { warn("lead/prev", e); halfWay = ` — ${wErr(e, "رفع الفصل عن الرائد السابق " + prev.name)}`; }
    }
    const nm = tid ? (byId(tid) || {}).name : "";
    await A().adminlog("lead", (tid ? `تعيين ${nm} رائداً لفصل ${clsName(cid)}${prev ? ` بدل ${prev.name}` : ""}` : `إلغاء رائد فصل ${clsName(cid)}${prev ? ` (${prev.name})` : ""}`) + halfWay, tid || (prev ? prev.id : undefined));
    if (halfWay) throw new Error("عُيّن الرائد الجديد" + halfWay);
    return true;
  }

  /* ═══ التحذير الأمني (مرة واحدة) ═══ */
  const secSeen = () => { try { return localStorage.getItem(SEC_KEY) === "1"; } catch (e) { return true; } };
  const secWarn = () => secSeen() ? "" : H.alert(`<button class="x" id="tch-sec-x" title="إغلاق">✕</button>🔒 <b>تنبيه أمني:</b> الحسابات مبنية على ثقة داخل المدرسة؛ لا تشارك أرقام الدخول خارج الفريق، وأعد تعيين رقم أي معلم تشك في تسرّبه.`);

  /* ═══ 👨‍🏫 التبويب ═══ */
  async function renderTeachers(box) {
    css(); hookHeader();
    box.innerHTML = H.card("👨‍🏫 المعلمون", H.empty("جارِ التحميل…"));
    draw(box, await A().schoolDocs());
  }
  function draw(box, sd) {
    const last = lastByTeacher(sd), list = teachers().slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const ql = q.trim();
    const shown = ql ? list.filter(t => [t.name, t.subject, t.id, mobOf(t)].some(x => String(x || "").includes(ql))) : list;
    const nReg = list.filter(t => isReg(t)).length;
    const nStaff = (typeof A().staff === "function" ? A().staff() : list.filter(t => !t.admin && (t.classes || []).length)).length;
    const nIdle = list.filter(t => !t.admin && (t.classes || []).length && (!last[t.id] || A().daysAgo(last[t.id]) >= 7)).length;
    const clsOf = (t) => A().sortedClasses().filter(c => (t.classes || []).includes(c.id));
    // شرائح الفصول: ثلاث ظاهرة ثم «+ن» (وإلا صار الصف عمودياً طويلاً على الجوال) — الأسماء كاملة في tooltip وفي الطباعة
    const clsChips = (t) => {
      const cs = clsOf(t); if (!cs.length) return '<span class="tch-none">—</span>';
      const head = cs.slice(0, 3).map(c => `<span class="cc">${esc(c.name)}</span>`).join("");
      return `<div class="tch-chips" title="${esc(cs.map(c => c.name).join("، "))}">${head}${cs.length > 3 ? `<span class="cc more">+${cs.length - 3}</span>` : ""}</div>`;
    };
    const rows = shown.map((t, i) => {
      const st = loginState(t), ld = leadOf(t).map(clsName), lr = last[t.id], mob = mobOf(t), nCls = (t.classes || []).length;
      return [String(i + 1),
      `${esc(t.name)}${t.admin ? ' <span class="tch-tag">المدير</span>' : ""}<div class="tch-id">${esc(t.id)}</div>`,
      esc(t.subject || "—"),
      clsChips(t),
      String(nCls),
      mob ? `<a class="tch-mob" href="${A().waHref(mob, "")}" target="_blank" rel="noopener">${esc(A().normMob(mob) || mob)}</a>` : '<span class="tch-none">—</span>',
      `<span class="tch-status ${st.ok ? "ok" : "no"}">${st.t}</span>`,
      lr ? `${A().fmtDate(lr)}<div class="tch-id">${A().daysAgo(lr) <= 0 ? "اليوم" : "قبل " + A().daysAgo(lr) + " يوم"}</div>` : (nCls ? '<span style="color:var(--bad)">لا رصد</span>' : "—"),
      ld.length ? `🎖️ ${esc(ld.join("، "))}` : '<span class="tch-none">—</span>',
      `<div class="tch-act"><button data-act="edit" data-tid="${esc(t.id)}" title="تعديل بيانات المعلم">✏️</button>${pinLocked(t)
        ? `<button disabled style="opacity:.4;cursor:not-allowed" title="${esc(PIN_LOCK)}">🔒</button>`
        : `<button data-act="pin" data-tid="${esc(t.id)}" title="إعادة تعيين رقم الدخول">🔑</button>`}</div>`];
    });
    const cols = ["م", { t: "المعلم", w: 150 }, { t: "المادة", w: 96 }, { t: "الفصول", w: 130 }, "عدد", { t: "الجوال", w: 96 }, "الدخول", "آخر رصد", "الرائد", "إجراءات"];
    // 🎖️ رواد الفصول
    const tOpts = (cid) => {
      const cur = leaderOf(cid), all = teachers().filter(t => !t.admin);
      const mine = all.filter(t => (t.classes || []).includes(cid)), others = all.filter(t => mine.indexOf(t) < 0);
      const op = (t) => `<option value="${esc(t.id)}"${cur && cur.id === t.id ? " selected" : ""}>${esc(t.name)}${t.subject ? " — " + esc(t.subject) : ""}</option>`;
      return `<option value="">— بلا رائد —</option>${mine.length ? `<optgroup label="معلمو الفصل">${mine.map(op).join("")}</optgroup>` : ""}${others.length ? `<optgroup label="بقية المعلمين">${others.map(op).join("")}</optgroup>` : ""}`;
    };
    const leadRows = A().sortedClasses().map(c => { const cur = leaderOf(c.id); return [`${esc(c.name)}<div class="tch-id">${esc(c.id)}</div>`, String(nActive(c)), `<div class="tch-lead"><select data-cid="${esc(c.id)}" aria-label="رائد ${esc(c.name)}">${tOpts(c.id)}</select></div>`, cur ? esc(cur.subject || "—") : '<span class="tch-none">—</span>']; });
    const logRows = ((sd && sd.adminlog) || []).filter(l => ["pin", "edit", "add", "lead"].indexOf(l.act) >= 0).slice(0, 8)
      .map(l => [`<span style="white-space:normal;font-weight:400">${esc(l.note)}</span>`, esc(l.tn || "—"), A().fmtTs(l.ts)]);
    box.innerHTML = secWarn() +
      H.card("👨‍🏫 المعلمون",
        H.kpis([{ v: nStaff, l: "معلماً بفصول", title: "غير حساب المدير والحسابات بلا فصول — نفس العدد في «🏫 المدرسة» و«📄 التقارير»" }, { v: nReg, l: isDemo() ? "لهم بصمة دخول" : "سجّلوا هويتهم" }, { v: nIdle, l: "بلا رصد ٧ أيام" }]) +
        H.note(`الجدول أدناه يعرض <b>${list.length}</b> حساباً في «المعلمون» (منها حساب المدير والحسابات بلا فصول)، والمؤشر يعدّ <b>${nStaff}</b> معلماً بفصول.`) +
        `<div class="adm-tools tch-tools">${H.search("tch-q", "ابحث باسم المعلم أو المادة…")}${H.btn("➕ إضافة معلم", 'id="tch-add"')}${H.btn("👤 بياناتي", 'id="tch-me"', "btn-plain")}${H.printBtn("tch-print")}</div>` +
        (shown.length ? H.table(cols, rows, { id: "tch-table", nameIdx: 1 }) : H.empty("لا نتائج مطابقة للبحث"))) +
      H.card("🎖️ رواد الفصول",
        H.note("رائد واحد لكل فصل — تظهر الشارة للمعلم في «بياناتي» وفي رأس التطبيق، ويرى تقرير فصله الشامل. تعيين رائد جديد يزيل الفصل من الرائد السابق.") +
        H.table(["الفصل", "الطلاب", { t: "الرائد", w: 175 }, "مادته"], leadRows, { id: "tch-leads" }) +
        `<div class="adm-tools tch-tools">${H.printBtn("tch-print-leads", "🖨️ طباعة الرواد")}</div>`) +
      H.card("🕘 آخر عمليات المعلمين", logRows.length ? H.table([{ t: "العملية", w: 220 }, "بواسطة", "الوقت"], logRows) : H.empty("لا عمليات بعد"));
    /* ═══ الربط ═══ */
    const sx = $("#tch-sec-x", box); if (sx) sx.onclick = () => { try { localStorage.setItem(SEC_KEY, "1"); } catch (e) { } const a = sx.closest(".adm-alert"); if (a) a.remove(); };
    const qi = $("#tch-q", box);
    qi.value = q;
    qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; draw(box, sd); const n = $("#tch-q", box); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } } };
    const again = async () => draw(box, await A().schoolDocs());     // بيانات المعلمين من D (لا حاجة لإبطال الخبيئة؛ adminlog يُحدَّث في النواة)
    $("#tch-add", box).onclick = () => addTeacher(again);
    $("#tch-me", box).onclick = () => S().openSheet('<div id="tch-me-box"></div><div class="sheet-actions"><button class="btn-plain" id="tch-me-x">إغلاق</button></div>', (o) => {
      profileCard($("#tch-me-box", o), { flat: true });
      $("#tch-me-x", o).onclick = () => { S().closeSheet(); again(); };
    });
    box.querySelectorAll(".tch-act button").forEach(b => b.onclick = () => (b.dataset.act === "edit" ? editTeacher : resetPin)(b.dataset.tid, again));
    box.querySelectorAll("#tch-leads select").forEach(sel => sel.onchange = async () => {
      sel.disabled = true;
      try { const ch = await assignLead(sel.dataset.cid, sel.value || null); if (ch) A().toast(sel.value ? "🎖️ عُيّن الرائد" : "أُلغي الرائد"); again(); }
      catch (e) { warn("lead", e); A().toast(wErr(e, "حفظ رائد الفصل"), 5200); sel.disabled = false; again(); }   // إعادة الرسم تُظهر الحالة الحقيقية بعد فشل جزئي
    });
    $("#tch-print", box).onclick = () => A().printTable("قائمة المعلمين" + (ql ? " — بحث: " + ql : ""),
      ["م", "المعلم", "المادة", "الفصول", "الجوال", "الدخول", "آخر رصد", "الرائد"],
      shown.map((t, i) => [String(i + 1), esc(t.name) + (t.admin ? " (المدير)" : ""), esc(t.subject || "—"), esc(clsOf(t).map(c => c.name).join("، ") || "—"),
      esc(A().normMob(mobOf(t)) || mobOf(t) || "—"), isReg(t) ? "سجّل" : isDemo() ? "تجريبي" : "لم يسجّل",
      last[t.id] ? A().fmtDate(last[t.id]) : "—", esc(leadOf(t).map(clsName).join("، ") || "—")]),
      { sub: "👨‍🏫 المعلمون", land: true, sig: ["vice", "principal"], foot: ["", `${shown.length} معلماً`, "", "", "", `${nReg} سجّلوا`, "", ""] });
    $("#tch-print-leads", box).onclick = () => A().printTable("رواد الفصول", ["الفصل", "الطلاب", "الرائد", "مادته"],
      A().sortedClasses().map(c => { const cur = leaderOf(c.id); return [esc(c.name), String(nActive(c)), cur ? esc(cur.name) : "—", cur ? esc(cur.subject || "—") : "—"]; }),
      { sub: "🎖️ رواد الفصول", sig: ["vice", "principal"] });
  }

  /* ═══ 🏫 أسماء إدارة المدرسة (cfg/school) — داخل «بياناتي» وللمدير وحده ═══
     تُكتب مرة واحدة فتحلّ محل النقاط في سطر التواقيع بكل المطبوعات (SIJIL_ADMIN.sigLine).
     الحفظ والتحقق والتسجيل في adminlog كلها في core.js (validateStaff/saveStaff). */
  const staffOn = () => { const Ad = A(); return typeof Ad.saveStaff === "function" && Array.isArray(Ad.STAFF_KEYS); };
  function staffHtml() {
    const Ad = A(), cur = Ad.schoolStaff ? Ad.schoolStaff() : {};
    return `<div class="me-staff">
      <div class="hd">🏫 أسماء إدارة المدرسة</div>
      <div class="sb">تُكتب مرة واحدة فتظهر في تواقيع كل المطبوعات (كشوف الدرجات والتقارير والشهادات وخطابات أولياء الأمور) بدل النقاط. اترك الحقل فارغاً لتبقى النقاط كما هي.</div>
      ${Ad.STAFF_KEYS.map(k => `<div class="field"><label>${esc(Ad.STAFF_LBL[k] || k)}</label><input id="me-sf-${k}" maxlength="80" value="${esc(cur[k] || "")}" placeholder="..............." autocomplete="off"></div>`).join("")}
      <div class="login-err" id="me-sf-err" style="margin-top:0"></div>
      <button class="btn-primary" id="me-sf-save">💾 حفظ أسماء الإدارة</button>
    </div>`;
  }
  function bindStaff(el, opts) {
    const Ad = A(), btn = $("#me-sf-save", el); if (!btn) return;
    btn.onclick = async () => {
      const err = $("#me-sf-err", el), cfg = {};
      Ad.STAFF_KEYS.forEach(k => { const i = $("#me-sf-" + k, el); cfg[k] = i ? String(i.value || "").trim() : ""; });
      const bad = Ad.validateStaff(cfg);
      if (bad) { err.textContent = "⚠️ " + bad; return; }
      btn.disabled = true; err.textContent = "جارِ الحفظ…";
      let r = null;
      try { r = await Ad.saveStaff(cfg); } catch (e) { warn("staff", e); r = { ok: false, err: (e && e.message) || String(e) }; }
      if (r && r.ok) {
        Ad.toast("✔ حُفظت أسماء الإدارة — تظهر في تواقيع المطبوعات", 3400);
        if (el.isConnected !== false) profileCard(el, opts);
      } else { err.textContent = "⚠️ " + ((r && r.err) || "تعذّر الحفظ"); btn.disabled = false; }
    };
  }

  /* ═══ 👤 بياناتي — profileCard(el, {flat}) — تُستدعى من «الإدارة» ومن «المزيد» للمعلم العادي ═══ */
  function profileCard(el, opts) {
    opts = opts || {}; css(); hookHeader();
    const s = S(), me = (s.TE && byId(s.TE.id)) || s.TE; if (!el || !me) return;
    const leads = new Set(leadOf(me));
    const cls = A().sortedClasses().filter(c => (me.classes || []).includes(c.id)).sort((a, b) => (leads.has(b.id) ? 1 : 0) - (leads.has(a.id) ? 1 : 0));
    const st = loginState(me), mob = mobOf(me), mobN = A().normMob(mob) || mob;
    const body = `<div class="me-head"><div class="me-avatar">${me.admin ? "🏫" : "👨‍🏫"}</div><div><div class="me-name">${esc(me.name)}</div><div class="me-sub">${esc(me.admin ? "مدير المدرسة" : (me.subject || "—"))} · ${esc(me.id)}</div>${leadBadge(me)}</div></div>
      ${H.row("الفصول", cls.length ? `<span class="tch-chips" style="justify-content:flex-start">${cls.map(c => `<span class="cc" style="background:${leads.has(c.id) ? "var(--gold)" : "var(--navy)"};color:${leads.has(c.id) ? "var(--navy)" : "#fff"}">${leads.has(c.id) ? "🎖️ " : ""}${esc(c.name)}</span>`).join("")}</span>` : "—")}
      ${H.row("حالة التسجيل", `<span class="tch-status ${st.ok ? "ok" : "no"}">${st.t}</span>`)}
      ${(exposedPin(me) && !pinLocked(me)) ? H.alert("⚠️ رقم دخولك الحالي قديم ومحفوظ بطريقة يمكن كشفها — غيّره الآن من الزر أدناه ليصبح محفوظاً بالطريقة الآمنة.") : ""}
      <div class="field" style="margin-top:12px"><label>📱 جوالي</label><div class="me-mobrow"><input id="me-mob" inputmode="tel" maxlength="20" value="${esc(mobN)}" placeholder="05xxxxxxxx" autocomplete="off"><button class="btn-gold" id="me-mob-save">حفظ</button></div></div>
      <div class="login-err" id="me-mob-err" style="margin-top:0"></div>
      ${pinLocked(me) ? H.alert("🔒 " + esc(PIN_LOCK)) : `<button class="btn-gold" id="me-pin-btn" style="width:100%">🔐 تغيير رقم الدخول</button>`}
      <div class="me-form hidden" id="me-form" style="margin-top:10px${pinLocked(me) ? ";display:none" : ""}">
        <div class="field"><label>رقم الدخول الحالي</label><input type="password" id="me-p0" inputmode="numeric" maxlength="12" autocomplete="current-password"></div>
        <div class="field"><label>الرقم الجديد (6–12 رقماً)</label><input type="password" id="me-p1" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
        <div class="field"><label>تأكيد الرقم الجديد</label><input type="password" id="me-p2" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
        <div class="empty-note" style="padding:0 2px 8px;text-align:right;min-height:0">سيُطلب الرقم الجديد على كل أجهزتك.${isDemo() ? " 🧪 وفي النسخة التجريبية أيضاً: بعد الحفظ لن يعمل الرقم 1234 لحسابك، فاحفظ رقمك الجديد." : ""}</div>
        <div class="login-err" id="me-err" style="margin-top:0"></div>
        <button class="btn-primary" id="me-pin-save">💾 حفظ الرقم الجديد</button>
      </div>
      ${me.admin && staffOn() ? staffHtml() : ""}
      <div id="me-files" style="margin-top:12px"></div>`;
    el.innerHTML = opts.flat ? `<h4>👤 بياناتي</h4>${body}` : H.card("👤 بياناتي", body, 'id="me-card-in"');
    if (me.admin && staffOn()) bindStaff(el, opts);
    // 📎 مرفقات بطاقة المعلم (js/files.js) — صور شهاداته ونماذجه، خاصة به
    try {
      const F = window.SIJIL_FILES, fbox = $("#me-files", el);
      if (fbox && F && typeof F.libraryCard === "function") {
        Promise.resolve(F.libraryCard(fbox, { scope: "profile", ref: { t: me.id }, title: "📎 مرفقاتي", hint: "ملفات تخصّك: شهادة، نموذج، أو صورة تحتاجها سريعاً." }))
          .catch(() => { fbox.innerHTML = ""; });
      }
    } catch (e) { warn("files/profile", e); }
    // 📱 الجوال
    $("#me-mob-save", el).onclick = async () => {
      const raw = $("#me-mob", el).value.trim(), err = $("#me-mob-err", el), btn = $("#me-mob-save", el); let val = "";
      if (raw) { val = A().normMob(raw); if (!val) { err.textContent = "صيغة الجوال غير صحيحة — مثال: 0501234567"; return; } }
      if (val === mobN) { err.textContent = ""; A().toast("لا تغيير"); return; }
      btn.disabled = true; err.textContent = "جارِ الحفظ…";
      try {
        await writeTeacher(me.id, { mob: val, phone: "" }, false);
        await A().adminlog("edit", `${me.name} حدّث رقم جواله`, me.id);
        A().toast(val ? "✔ حُفظ الجوال" : "✔ حُذف الجوال"); profileCard(el, opts);
      } catch (e) { warn("mob", e); err.textContent = wErr(e, "حفظ الجوال"); btn.disabled = false; }
    };
    // 🔐 تغيير رقم الدخول (التحقق من الحالي محلياً بالبصمة نفسها التي يستخدمها الدخول)
    const pinBtn = $("#me-pin-btn", el);
    if (pinBtn) pinBtn.onclick = () => { const f = $("#me-form", el); f.classList.toggle("hidden"); if (!f.classList.contains("hidden")) $("#me-p0", el).focus(); };
    if (pinBtn) $("#me-pin-save", el).onclick = async () => {
      const p0 = $("#me-p0", el).value.trim(), p1 = $("#me-p1", el).value.trim(), p2 = $("#me-p2", el).value.trim(), err = $("#me-err", el), btn = $("#me-pin-save", el);
      if (!p0) { err.textContent = "اكتب رقم الدخول الحالي"; return; }
      if (!PIN_RE.test(p1)) { err.textContent = "الرقم الجديد: من 6 إلى 12 رقماً"; return; }
      if (p1 !== p2) { err.textContent = "التأكيد لا يطابق الرقم الجديد"; return; }
      if (p1 === p0) { err.textContent = "الرقم الجديد هو نفسه الحالي"; return; }
      btn.disabled = true; err.textContent = "جارِ التحقق…";
      try {
        const au = AU();
        if (!au) { err.textContent = "تعذّر تجهيز رقم الدخول — أعد تحميل الصفحة ثم حاول"; btn.disabled = false; return; }
        const rr = await au.changePin(me.id, p0, p1);
        if (!rr || !rr.ok) { err.textContent = (rr && rr.err) || "رقم الدخول الحالي غير صحيح"; btn.disabled = false; return; }
        await A().adminlog("pin", `${me.name} غيّر رقم دخوله بنفسه`, me.id);
        A().toast("✔ تغيّر رقم الدخول — سيُطلب الجديد على كل أجهزتك", 3200);
        profileCard(el, opts);
      } catch (e) { warn("pin/self", e); err.textContent = wErr(e, "تغيير رقم الدخول"); btn.disabled = false; }
    };
  }

  /* ═══ 🎖️ تقرير فصلي كرائد (ADMIN_SPEC سطر 61) — يظهر للمعلم داخل «📄 التقارير» عبر app.js (leadSlot → leadReport) ═══
     الرائد يرى فصله كاملاً عبر كل المواد ولو لم يدرّسه: مؤشرات + جدول الطلاب × المواد + لوحة شرف الفصل
     + الغياب المتكرر + واتساب لقروب أولياء الأمور + طباعة. المصدر schoolDocs (لا استعلام لكل فصل).
     ملاحظة تصميم: فصل الريادة لا يُضاف إلى فصول التدريس (اليوم/التحضير/الدرجات) حتى لا يكتب الرائد رصداً
     في مادة لا يدرّسها (recs/{tid}_{cid} باسمه) — الريادة قراءة وتواصل لا رصد. */
  let leadCid = null;
  async function leadReport(el) {
    if (!el) return;
    const s = S(), Ad = A(), me = (s.TE && byId(s.TE.id)) || s.TE;
    const ids = leadOf(me);
    if (!ids.length) { el.innerHTML = ""; el.removeAttribute("data-ready"); return; }
    css();
    if (!leadCid || ids.indexOf(leadCid) < 0) leadCid = ids[0];
    if (!el.dataset.ready) el.innerHTML = H.card("🎖️ تقرير فصلي كرائد", H.empty("جارِ جمع رصد كل المواد…"));
    let sd; try { sd = await Ad.schoolDocs(); } catch (e) { warn("lead/docs", e); el.innerHTML = H.card("🎖️ تقرير فصلي كرائد", H.empty("تعذّر جمع بيانات الفصل")); return; }
    const cid = leadCid, c = s.classById(cid);
    if (!c) { el.innerHTML = H.card("🎖️ تقرير فصلي كرائد", H.empty("الفصل غير موجود")); return; }
    const docs = Ad.classDocsOf(sd, cid);
    const rows = s.activeStudents(c).map(x => ({ i: x.i, s: x.s, agg: Ad.aggStudent(sd, cid, x.i) }));
    // الغياب المتكرر: يوم الغياب يُعدّ مرة واحدة ولو رصده أكثر من معلم
    /* تعريف الغياب نفسه في كل الشاشات (core.attBucketOf): «غائب بعذر» عذر لا غياب — كان /غائب/ يبتلعه
       فينفخ عدّاد «الغياب المتكرر» في تقرير الرائد وفي رسالة قروب أولياء الأمور بخلاف لوحة القيادة. */
    const absA = new Set(s.STATES.map((x, k) => (typeof Ad.attBucketOf === "function" ? Ad.attBucketOf(k) === 1 : (!/عذر|مستأذن/.test(x.name || "") && /غائب|هارب/.test(x.name || ""))) ? k : -1).filter(k => k >= 0));
    const byDate = {};
    docs.forEach(dc => Object.keys(dc.recs || {}).forEach(date => {
      const day = dc.recs[date] || {};
      Object.keys(day).forEach(si => { const e = day[si]; if (!e || e.a == null || !absA.has(e.a)) return; (byDate[date] = byDate[date] || {})[si] = 1; });
    }));
    const absN = {};
    Object.keys(byDate).forEach(d => Object.keys(byDate[d]).forEach(si => absN[si] = (absN[si] || 0) + 1));
    const absList = rows.filter(r => (absN[r.i] || 0) >= 3).sort((a, b) => (absN[b.i] || 0) - (absN[a.i] || 0));
    const att = rows.filter(r => r.agg.att != null), attAvg = att.length ? Math.round(att.reduce((a, r) => a + r.agg.att, 0) / att.length) : null;
    const avgs = rows.filter(r => r.agg.avg != null), avg = avgs.length ? Math.round(avgs.reduce((a, r) => a + r.agg.avg, 0) / avgs.length) : null;
    const top = rows.filter(r => r.agg.pts > 0).sort((a, b) => b.agg.pts - a.agg.pts).slice(0, 5);
    const MED = ["🥇", "🥈", "🥉", "🏅", "🏅"];
    const pctT = (p) => p == null ? "—" : `<bdi>${Math.round(p)}%</bdi>`;
    const cols = ["م", { t: "الطالب", w: 140 }].concat(docs.map(d => ({ t: esc(d.subject) })), ["المعدل", "النقاط", "الحضور", "غياب"]);
    const body = rows.slice().sort((a, b) => ((b.agg.avg == null ? -1 : b.agg.avg) - (a.agg.avg == null ? -1 : a.agg.avg)) || (b.agg.pts - a.agg.pts))
      .map((r, k) => [String(k + 1), esc(r.s.n)].concat(
        docs.map(dc => { const g = r.agg.grades.find(x => x.tid === dc.tid); return g ? String(Math.round(g.pct)) : '<span style="color:#bbb">—</span>'; }),
        [pctT(r.agg.avg), String(r.agg.pts), pctT(r.agg.att), (absN[r.i] || 0) >= 3 ? `<b style="color:var(--bad)">${absN[r.i]}</b>` : String(absN[r.i] || 0)]));
    const waText = [`🎖️ تقرير ${c.name} — ${s.META.school.name}`, s.hijriLabel(), "",
      `👥 الطلاب: ${rows.length} · 📚 المواد المرصودة: ${docs.length}`,
      attAvg != null ? `✅ متوسط الحضور: ${attAvg}%` : "✅ لا رصد حضور بعد",
      avg != null ? `💯 متوسط المستوى (من البنود المرصودة): ${avg}%` : "",
      top.length ? "\n🏆 لوحة شرف الفصل:\n" + top.map((r, k) => `${MED[k]} ${r.s.n} — ${r.agg.pts} نقطة`).join("\n") : "",
      absList.length ? `\n⚠️ غياب متكرر (٣ أيام فأكثر): ${absList.length} — نرجو متابعة الحضور` : "\n🌟 لا غياب متكرر، شكراً لمتابعتكم",
      "", `رائد الفصل: ${me.name}`, s.META.school.name].filter(Boolean).join("\n");
    const chips = ids.length > 1 ? `<div class="class-chips" id="lead-chips" style="padding:0 0 8px">${ids.map(x => `<button class="chip ${x === cid ? "on" : ""}" data-k="${esc(x)}" style="padding:6px 12px;font-size:12.5px">🎖️ ${esc(clsName(x))}</button>`).join("")}</div>` : "";
    el.innerHTML = H.card(`🎖️ تقرير فصلي كرائد — ${esc(c.name)}`,
      H.note("بصفتك رائد الفصل ترى فصلك عبر كل المواد ولو لم تدرّسه — والنسب من البنود المرصودة حتى الآن.") + chips +
      H.kpis([{ v: rows.length, l: "طالباً" }, { v: docs.length, l: "مادة مرصودة" }, { v: attAvg == null ? "—" : attAvg + "%", l: "متوسط الحضور" }, { v: absList.length, l: "غياب متكرر" }]) +
      (docs.length ? H.table(cols, body, { id: "lead-tb", nameIdx: 1 }) : H.empty("لا رصد في هذا الفصل بعد")) +
      `<div style="font-weight:800;color:var(--navy);margin:12px 0 6px">🏆 لوحة شرف ${esc(c.name)}</div>` +
      (top.length ? `<div class="adm-honor"><div class="hc" style="background:#fbf8f1;border:1px solid var(--line);border-radius:10px;padding:8px 10px"><b style="display:block;color:var(--navy);margin-bottom:4px">الأعلى نقاطاً عبر كل المواد</b>${top.map((r, k) => `<div style="display:flex;justify-content:space-between;padding:2px 0"><span>${MED[k]} ${esc(r.s.n)}</span><span>${r.agg.pts}</span></div>`).join("")}</div></div>` : H.empty("ابدأ الرصد وستظهر أسماء المتميزين 🌟")) +
      `<div style="font-weight:800;color:var(--navy);margin:12px 0 6px">⚠️ الغياب المتكرر (٣ أيام فأكثر)</div>` +
      (absList.length ? H.table(["م", { t: "الطالب", w: 150 }, "أيام الغياب", "الحضور"], absList.map((r, k) => [String(k + 1), esc(r.s.n), `<b style="color:var(--bad)">${absN[r.i]}</b>`, pctT(r.agg.att)]), { nameIdx: 1 }) : H.empty("لا طلاب غابوا ٣ أيام فأكثر 🌟")) +
      `<div class="adm-tools" style="margin-top:10px"><a class="btn-gold" id="lead-wa" style="text-align:center;text-decoration:none;flex:1 1 180px;padding:11px" target="_blank" rel="noopener" href="${S().waLink("", waText)}">💬 إرسال لقروب أولياء الأمور</a>${H.printBtn("lead-print", "🖨️ طباعة تقرير الفصل")}</div>`);
    el.dataset.ready = "1";
    const ch = $("#lead-chips", el);
    if (ch) ch.querySelectorAll(".chip").forEach(b => b.onclick = () => { leadCid = b.dataset.k; leadReport(el); });
    const pb = $("#lead-print", el);
    if (pb) pb.onclick = () => Ad.printHtml(`تقرير ${c.name} — رائد الفصل`,
      (docs.length ? H.table(cols, body, {}) : "<div>لا رصد بعد</div>").replace('<div class="table-scroll">', "<div>") +
      `<div class="tt" style="font-size:15px;margin-top:10px">🏆 لوحة الشرف</div><table class="compact"><tr><th>الترتيب</th><th>الطالب</th><th>النقاط</th></tr>${top.map((r, k) => `<tr><td>${MED[k]}</td><td class="nm">${esc(r.s.n)}</td><td>${r.agg.pts}</td></tr>`).join("") || '<tr><td colspan="3">لا رصد بعد</td></tr>'}</table>` +
      `<div class="tt" style="font-size:15px;margin-top:10px">⚠️ الغياب المتكرر</div><table class="compact"><tr><th>م</th><th>الطالب</th><th>أيام الغياب</th></tr>${absList.map((r, k) => `<tr><td>${k + 1}</td><td class="nm">${esc(r.s.n)}</td><td>${absN[r.i]}</td></tr>`).join("") || '<tr><td colspan="3">لا غياب متكرر</td></tr>'}</table>` +
      (typeof Ad.sigLine === "function" ? Ad.sigLine([{ l: "رائد الفصل", v: me.name }, "principal"])
        : `<div class="sig"><span>رائد الفصل: ${esc(me.name)}</span><span>مدير المدرسة: ..............</span></div>`),
      { land: cols.length > 8, sub: `🎖️ تقرير الفصل الشامل — ${c.name}`, cls: "compact" });
  }

  /* ═══ التسجيل والتصدير ═══ */
  A().register("teachers", renderTeachers);
  A().register("profile", (box) => profileCard(box));
  Object.assign(window.SIJIL_ADMIN, { profileCard, leadBadge, leadReport, writeTeacher, assignLead, resetPin, editTeacher, addTeacher, leaderOf, leadOf, refreshHeader, lastByTeacher, mobOf });
  // تجريبياً: إعادة تعديلات المعلمين المحفوظة + شارة الرائد في الرأس (الآن وبعد كل دخول)
  try { applyTedits(); css(); hookHeader(); if (S().TE) refreshHeader(); } catch (e) { warn("late init", e); }
})();
