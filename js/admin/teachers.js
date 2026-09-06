/* ═══════════ لوحة المدير — وحدة 👨‍🏫 المعلمون (teachers) + 👤 بياناتي (profile) — js/admin/teachers.js ═══════════
   تعتمد على window.SIJIL (app.js) و window.SIJIL_ADMIN (core.js).
   • teachers: جدول المعلمين (الاسم/المادة/الفصول/الجوال/حالة الدخول/آخر رصد/الرائد) + ✏️ تعديل + 🔑 إعادة تعيين رقم الدخول (توليد عشوائي)
               + ➕ إضافة معلم (معرّف tNN غير مستخدم) + 🎖️ رواد الفصول (رائد واحد لكل فصل يُحفظ في teachers/{tid}.lead)
               + تحذير أمني يُعرض مرة واحدة (localStorage sijil.adm.secwarn) + آخر عمليات المعلمين من adminlog.
   • profile:  بطاقة الحساب + تعديل الجوال + تغيير رقم الدخول بالتحقق من الحالي محلياً sha256(pin|tid|SALT) — نفس صيغة الدخول في app.js.
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
  const PIN_RE = /^\d{4,12}$/;
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
@media print{.tch-act,.tch-tools,.adm-alert,.me-form,.tch-lead{display:none!important}}`;
    document.head.appendChild(st);
  }

  /* ═══ أدوات ═══ */
  const teachers = () => (S().D.teachers || []);
  const byId = (tid) => teachers().find(t => t.id === tid) || null;
  const mobOf = (t) => String((t && (t.mob || t.phone)) || "").trim();
  const isDemo = () => !(S().CLOUD && S().fdb);
  const clsName = (cid) => { const c = S().classById(cid); return c ? c.name : cid; };
  const nActive = (c) => (S().activeCount ? S().activeCount(c) : S().activeStudents(c).length);
  const loginState = (t) => t.pinHash ? { ok: true, t: "✅ سجّل هويته" } : isDemo() ? { ok: true, t: "🧪 تجريبي (1234)" } : { ok: false, t: "⏳ لم يسجّل" };
  const randPin = () => { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(100000 + (a[0] % 900000)); } catch (e) { return String(100000 + Math.floor(Math.random() * 900000)); } };
  // بصمة رقم الدخول — نفس صيغة app.js في initLogin: sha256(pin|tid|SALT)
  const pinHash = (pin, tid) => S().sha256(pin + "|" + tid + "|" + S().SALT);
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
      ${isNew ? `<div class="field"><label>رقم الدخول الأولي (4–12 رقماً)</label><div class="me-mobrow"><input id="tf-pin" inputmode="numeric" maxlength="12" autocomplete="off" style="letter-spacing:3px"><button class="btn-gold" id="tf-gen" type="button">🎲 توليد</button></div></div>` : ""}
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
    if (isNew) { const pin = $("#tf-pin", o).value.trim(); if (!PIN_RE.test(pin)) return { err: "رقم الدخول: 4 إلى 12 رقماً" }; patch.pin = pin; }
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
    css();
    S().openSheet(`<h4>✏️ تعديل بيانات المعلم <span class="tch-id">(${esc(tid)})</span></h4>` + formHtml(t, false), (o) => {
      bindPicker(o);
      $("#tf-no", o).onclick = () => S().closeSheet();
      $("#tf-ok", o).onclick = async () => {
        const r = readForm(o, false), err = $("#tf-err", o);
        if (r.err) { err.textContent = r.err; return; }
        const ch = diffNote(t, r.patch);
        if (!ch.length) { S().closeSheet(); A().toast("لا تغيير"); return; }
        $("#tf-ok", o).disabled = true; err.textContent = "جارِ الحفظ…";
        try {
          const s = S(), wasMe = !!(s.TE && s.TE.id === tid), clsChanged = ch.some(x => x.indexOf("الفصول") === 0);
          const p = Object.assign({}, r.patch); p.phone = "";                       // الجوال الجديد يحل محل القديم (phone القديم يُسقط دائماً)
          await writeTeacher(tid, p, false);
          await A().adminlog("edit", `تعديل بيانات ${r.patch.name}: ${ch.join("، ")}`, tid);
          s.closeSheet(); A().toast("✔ حُفظت بيانات " + r.patch.name);
          if (wasMe && s.TE.admin && clsChanged) { A().init(s.TE); s.switchTab(A().currentTab() || "teachers"); }   // زر «واجهتي كمعلم» يظهر/يختفي
          else if (after) after();
        } catch (e) { warn("edit", e); err.textContent = "تعذّر الحفظ: " + ((e && e.message) || e); $("#tf-ok", o).disabled = false; }
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
          p.pinHash = await pinHash(pin, tid);
          await writeTeacher(tid, p, true);
          await A().adminlog("add", `إضافة معلم ${p.name} (${p.subject || "بلا مادة"}) — ${p.classes.length} فصول`, tid);
          showPin(o, p.name, tid, pin, "➕ أُضيف المعلم", after);
        } catch (e) { warn("add", e); err.textContent = "تعذّرت الإضافة: " + ((e && e.message) || e); $("#tf-ok", o).disabled = false; }
      };
    });
  }

  /* ═══ 🔑 إعادة تعيين رقم الدخول ═══ */
  function resetPin(tid, after) {
    const t = byId(tid); if (!t) return;
    css();
    S().openSheet(`<h4>🔑 إعادة تعيين رقم الدخول</h4>
      <div style="text-align:center;font-weight:800;color:var(--navy);margin-bottom:8px">${esc(t.name)} <span class="tch-id">(${esc(tid)})</span></div>
      <div class="field"><label>رقم الدخول الجديد (4–12 رقماً)</label><div class="me-mobrow"><input id="tp-pin" inputmode="numeric" maxlength="12" autocomplete="off" style="letter-spacing:3px"><button class="btn-gold" id="tp-gen" type="button">🎲 توليد عشوائي</button></div></div>
      <div class="empty-note" style="padding:4px 2px;text-align:right;min-height:0">تُحفظ بصمة الرقم فقط لا الرقم نفسه، وسيُطلب من المعلم الرقم الجديد على كل أجهزته.</div>
      <div class="login-err" id="tp-err"></div>
      <div class="sheet-actions"><button class="btn-plain" id="tp-no">إلغاء</button><button class="btn-primary" id="tp-ok">🔑 تعيين</button></div>`, (o) => {
      $("#tp-gen", o).onclick = () => { $("#tp-pin", o).value = randPin(); };
      $("#tp-no", o).onclick = () => S().closeSheet();
      $("#tp-ok", o).onclick = async () => {
        const pin = $("#tp-pin", o).value.trim(), err = $("#tp-err", o);
        if (!PIN_RE.test(pin)) { err.textContent = "رقم الدخول: 4 إلى 12 رقماً"; return; }
        $("#tp-ok", o).disabled = true; err.textContent = "جارِ الحفظ…";
        try {
          await writeTeacher(tid, { pinHash: await pinHash(pin, tid) }, false);
          await A().adminlog("pin", `إعادة تعيين رقم دخول ${t.name}`, tid);
          showPin(o, t.name, tid, pin, "✔ عُيّن رقم الدخول", after);
        } catch (e) { warn("pin", e); err.textContent = "تعذّر الحفظ: " + ((e && e.message) || e); $("#tp-ok", o).disabled = false; }
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
      <div class="empty-note" style="padding:0 0 8px;min-height:0">أرسل الرقم للمعلم الآن — لن يُعرض مرة أخرى.${isDemo() ? "<br>🧪 في الوضع التجريبي يبقى الدخول برقم 1234." : ""}</div>
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
    if (prev) await writeTeacher(prev.id, { lead: (prev.lead || []).filter(c => c !== cid) }, false);
    if (tid) { const t = byId(tid); if (!t) throw new Error("معلم غير موجود"); await writeTeacher(tid, { lead: [...new Set([...(t.lead || []), cid])] }, false); }
    const nm = tid ? (byId(tid) || {}).name : "";
    await A().adminlog("lead", tid ? `تعيين ${nm} رائداً لفصل ${clsName(cid)}${prev ? ` بدل ${prev.name}` : ""}` : `إلغاء رائد فصل ${clsName(cid)}${prev ? ` (${prev.name})` : ""}`, tid || (prev ? prev.id : undefined));
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
    const nReg = list.filter(t => t.pinHash).length;
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
      lr ? `${A().fmtDate(lr)}<div class="tch-id">${A().daysAgo(lr) === 0 ? "اليوم" : "قبل " + A().daysAgo(lr) + " يوم"}</div>` : (nCls ? '<span style="color:var(--bad)">لا رصد</span>' : "—"),
      ld.length ? `🎖️ ${esc(ld.join("، "))}` : '<span class="tch-none">—</span>',
      `<div class="tch-act"><button data-act="edit" data-tid="${esc(t.id)}" title="تعديل بيانات المعلم">✏️</button><button data-act="pin" data-tid="${esc(t.id)}" title="إعادة تعيين رقم الدخول">🔑</button></div>`];
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
        H.kpis([{ v: list.length, l: "معلماً" }, { v: nReg, l: isDemo() ? "لهم بصمة دخول" : "سجّلوا هويتهم" }, { v: nIdle, l: "بلا رصد ٧ أيام" }]) +
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
      catch (e) { warn("lead", e); A().toast("تعذّر الحفظ: " + ((e && e.message) || e)); sel.disabled = false; again(); }   // إعادة الرسم تُظهر الحالة الحقيقية بعد فشل جزئي
    });
    $("#tch-print", box).onclick = () => A().printTable("قائمة المعلمين" + (ql ? " — بحث: " + ql : ""),
      ["م", "المعلم", "المادة", "الفصول", "الجوال", "الدخول", "آخر رصد", "الرائد"],
      shown.map((t, i) => [String(i + 1), esc(t.name) + (t.admin ? " (المدير)" : ""), esc(t.subject || "—"), esc(clsOf(t).map(c => c.name).join("، ") || "—"),
      esc(A().normMob(mobOf(t)) || mobOf(t) || "—"), t.pinHash ? "سجّل" : isDemo() ? "تجريبي" : "لم يسجّل",
      last[t.id] ? A().fmtDate(last[t.id]) : "—", esc(leadOf(t).map(clsName).join("، ") || "—")]),
      { sub: "👨‍🏫 المعلمون", land: true, foot: ["", `${shown.length} معلماً`, "", "", "", `${nReg} سجّلوا`, "", ""] });
    $("#tch-print-leads", box).onclick = () => A().printTable("رواد الفصول", ["الفصل", "الطلاب", "الرائد", "مادته"],
      A().sortedClasses().map(c => { const cur = leaderOf(c.id); return [esc(c.name), String(nActive(c)), cur ? esc(cur.name) : "—", cur ? esc(cur.subject || "—") : "—"]; }),
      { sub: "🎖️ رواد الفصول" });
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
      <div class="field" style="margin-top:12px"><label>📱 جوالي</label><div class="me-mobrow"><input id="me-mob" inputmode="tel" maxlength="20" value="${esc(mobN)}" placeholder="05xxxxxxxx" autocomplete="off"><button class="btn-gold" id="me-mob-save">حفظ</button></div></div>
      <div class="login-err" id="me-mob-err" style="margin-top:0"></div>
      <button class="btn-gold" id="me-pin-btn" style="width:100%">🔐 تغيير رقم الدخول</button>
      <div class="me-form hidden" id="me-form" style="margin-top:10px">
        <div class="field"><label>رقم الدخول الحالي</label><input type="password" id="me-p0" inputmode="numeric" maxlength="12" autocomplete="current-password"></div>
        <div class="field"><label>الرقم الجديد (4–12 رقماً)</label><input type="password" id="me-p1" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
        <div class="field"><label>تأكيد الرقم الجديد</label><input type="password" id="me-p2" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
        <div class="empty-note" style="padding:0 2px 8px;text-align:right;min-height:0">سيُطلب الرقم الجديد على كل أجهزتك.${isDemo() ? " 🧪 في الوضع التجريبي يبقى الدخول برقم 1234." : ""}</div>
        <div class="login-err" id="me-err" style="margin-top:0"></div>
        <button class="btn-primary" id="me-pin-save">💾 حفظ الرقم الجديد</button>
      </div>`;
    el.innerHTML = opts.flat ? `<h4>👤 بياناتي</h4>${body}` : H.card("👤 بياناتي", body, 'id="me-card-in"');
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
      } catch (e) { warn("mob", e); err.textContent = "تعذّر الحفظ: " + ((e && e.message) || e); btn.disabled = false; }
    };
    // 🔐 تغيير رقم الدخول (التحقق من الحالي محلياً بالبصمة نفسها التي يستخدمها الدخول)
    $("#me-pin-btn", el).onclick = () => { const f = $("#me-form", el); f.classList.toggle("hidden"); if (!f.classList.contains("hidden")) $("#me-p0", el).focus(); };
    $("#me-pin-save", el).onclick = async () => {
      const p0 = $("#me-p0", el).value.trim(), p1 = $("#me-p1", el).value.trim(), p2 = $("#me-p2", el).value.trim(), err = $("#me-err", el), btn = $("#me-pin-save", el);
      if (!p0) { err.textContent = "اكتب رقم الدخول الحالي"; return; }
      if (!PIN_RE.test(p1)) { err.textContent = "الرقم الجديد: 4 إلى 12 رقماً"; return; }
      if (p1 !== p2) { err.textContent = "التأكيد لا يطابق الرقم الجديد"; return; }
      if (p1 === p0) { err.textContent = "الرقم الجديد هو نفسه الحالي"; return; }
      btn.disabled = true; err.textContent = "جارِ التحقق…";
      try {
        const cur = (byId(me.id) || me).pinHash;
        const ok = cur ? (await pinHash(p0, me.id)) === cur : (isDemo() && p0 === "1234");
        if (!ok) { err.textContent = "رقم الدخول الحالي غير صحيح"; btn.disabled = false; return; }
        await writeTeacher(me.id, { pinHash: await pinHash(p1, me.id) }, false);
        await A().adminlog("pin", `${me.name} غيّر رقم دخوله بنفسه`, me.id);
        A().toast("✔ تغيّر رقم الدخول — سيُطلب الجديد على كل أجهزتك", 3200);
        profileCard(el, opts);
      } catch (e) { warn("pin/self", e); err.textContent = "تعذّر الحفظ: " + ((e && e.message) || e); btn.disabled = false; }
    };
  }

  /* ═══ التسجيل والتصدير ═══ */
  A().register("teachers", renderTeachers);
  A().register("profile", (box) => profileCard(box));
  Object.assign(window.SIJIL_ADMIN, { profileCard, leadBadge, writeTeacher, assignLead, resetPin, editTeacher, addTeacher, leaderOf, leadOf, refreshHeader, lastByTeacher, mobOf });
  // تجريبياً: إعادة تعديلات المعلمين المحفوظة + شارة الرائد في الرأس (الآن وبعد كل دخول)
  try { applyTedits(); css(); hookHeader(); if (S().TE) refreshHeader(); } catch (e) { warn("late init", e); }
})();
