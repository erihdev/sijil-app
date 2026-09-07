/* ═══════════════════════════════════════════════════════════════════════════════════════
   سجلي — تحصين أرقام الدخول (window.SIJIL_AUTH)
   ───────────────────────────────────────────────────────────────────────────────────────
   المشكلة القديمة: بصمة رقم الدخول كانت محفوظة في مستند المعلم teachers/{tid}.pinHash،
   ومستندات المعلمين مقروءة لأي جهاز مصادَق (الموقع يصادق مجهولاً) — فأي زائر ينسخ البصمات
   كلها ويجرّب عليها ملايين الأرقام على جهازه بلا اتصال، وأي جهاز يستطيع استبدال بصمة معلم.

   النموذج الجديد (بلا خادم، بقواعد Firestore فقط):
   • pins/{h} = { tid, ts }  —  h هي البصمة نفسها sha256(الرقم|معرّف المعلم|الملح).
     get مسموح لأي جهاز مصادَق، وlist ممنوع تماماً ⇒ لا تبقى أي بصمة في مستند يُتصفَّح،
     ولا يُعرف وجود بصمة إلا بمعرفة رقمها أولاً (تخمين عبر الشبكة فقط، لا خارجها).
   • الدخول: نحسب h من الرقم المكتوب ⇒ نقرأ pins/{h} ⇒ نقبل إن كان tid فيه هو المعلم المختار
     وكان ختمه ts مطابقاً لختم مستند المعلم teachers/{tid}.pt (إن وُجد). الختم هو ما يُبطل
     الرقم القديم فور التغيير، حتى لو تعذّر حذف مستند بصمته — وهو ضروري لإعادة تعيين المدير،
     لأن المدير بعد الترحيل لا يعرف رقم المعلم القديم فلا يستطيع حذف مستند بصمته.
   • قناة الإثبات pinreq/{tid} = { h, old?, by?, byPin?, ts, tn } — read ممنوع للجميع،
     ولا تُنشأ إلا بإثبات: إما معرفة المعلم رقمه الحالي (exists(pins/old) وtid مطابق)،
     وإما معرفة المدير رقمه هو (exists(pins/byPin) وtid مطابق وteachers/by.admin == true)،
     ووجودها هو ما يسمح بإنشاء pins/{h} الجديدة وبختم مستند المعلم، ثم تُحذف بعد النجاح.
   • teachers/{tid}.reg = true تعني «سُجّل رقمه في pins» ولا تعود false أبداً (قاعدة)،
     وteachers/{tid}.pt ختم الرقم الحالي — رقم لا يفشي شيئاً، ولا يتغيّر إلا بقيمة ts
     الموجودة في قناة الإثبات نفسها (فلا يستطيع زائر تعطيل حساب بختم عشوائي).
   • teachers/{tid}.pinHash لا تُكتب بقيمة جديدة أبداً بعد اليوم — تُزال فقط.

   ترتيب آمن دائماً: تُنشأ البصمة الجديدة ويُتحقق من وصولها فعلاً، ثم يُختم مستند المعلم،
   ثم تُحذف البصمة القديمة، ثم تُحذف قناة الإثبات. أي انقطاع في المنتصف يترك الرقم القديم
   صالحاً — ولا يُقفل حساب أبداً.

   الدخول بلا إنترنت: بعد أول دخول ناجح على الجهاز نحفظ إثباتاً محلياً مُشتقاً بـ PBKDF2
   (١٥٠ ألف دورة وملح عشوائي) لا البصمة نفسها — حتى لا يُخمَّن الرقم من تخزين الجهاز.

   الوضع التجريبي (?demo): تُحاكى قاعدة البيانات محلياً بالمسارات نفسها والتسلسل نفسه،
   فيُختبر المنطق كاملاً بلا سحابة. ويبقى الرقم 1234 صالحاً لمن لم يغيّر رقمه.

   التوافق أثناء الترحيل: verify يجرّب pins أولاً ثم يسقط إلى pinHash القديمة لمن لم يُسجَّل
   بعد (reg != true)، وعند نجاح السقوط يرقّي الحساب صامتاً: ينشئ pins/{h} ثم يمسح pinHash.

   • مطالبة الجلسة sess/{uid} = { tid, bp, ts } — read ممنوع للجميع، وuid هو معرّف المصادقة
     المجهولة لهذا الجهاز. تُكتب بعد كل دخول ناجح وbp بصمة الرقم إثباتاً (القواعد تتحقق أنها
     بصمة حيّة لهذا المعلم)، ثم لا تُقرأ أبداً — وجودها وحده هو الهوية التي تحتجّ بها القواعد.
     وهي الجواب على «الخادم لا يعرف من يكتب»: الكتابة التي تُنمّي البيانات تبقى مفتوحة كما
     كانت، أما المُتلِفة (تفريغ رصد أو درجات أو جدول، أو سلب فصول معلم فيختفي من قائمة الدخول،
     أو تعيين رقم أول لحساب لم يُسجَّل، أو تغيير إعدادات المدرسة) فلا تمرّ إلا بمطالبة.
     أثرها على المستخدم: صفر — تُكتب في الخلفية ولا تُبطئ الدخول ولا تُفشله إن تعذّرت.

   حدّ النموذج (مشروح في docs/AUTH_SPEC.md): يبقى تخمين الرقم عبر الشبكة ممكناً — قراءة
   لكل محاولة. لذلك يُنصح برقم من ٦ خانات فأكثر، ونعيد weak:true للواجهة لتنبّه المستخدم.
   ═══════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const S = () => window.SIJIL || null;
  const PIN_RE = /^[0-9]{4,12}$/;        // المقبول (توافقاً مع الأرقام القائمة)
  const STRONG_RE = /^[0-9]{6,12}$/;     // المُوصى به
  const HEX_RE = /^[0-9a-f]{64}$/;
  const TID_RE = /^t[0-9]{2,3}$/;
  const DEMO_PIN = "1234";
  const DKEY = "sijil.auth.demo";        // قاعدة الوضع التجريبي (محاكاة fdb)
  const LKEY = "sijil.auth.local";       // إثبات محلي للدخول عند انقطاع الإنترنت
  const LMAX = 4;                        // أكثر عدد حسابات يحتفظ الجهاز بإثباتها
  const KDF_IT = 150000;                 // دورات PBKDF2 للإثبات المحلي
  const RTO = 9000, WTO = 12000;         // مهلة القراءة والكتابة (بالمللي ثانية)
  const DEL = { __del: true };           // علامة «احذف هذا الحقل»

  const MSG = {
    pick: "اختر اسمك من القائمة",
    bad: "رقم الدخول غير صحيح",
    fmt: "رقم الدخول: من 4 إلى 12 رقماً",
    short: "الرقم الجديد: من 6 إلى 12 رقماً — الأرقام الأقصر يسهل تخمينها",
    noreg: "لم تُسجل هويتك بعد — تواصل مع أ. ضيف الله",
    net: "تعذّر التحقق — تأكد من الإنترنت وأعد المحاولة",
    off: "تعذّر التحقق — لا اتصال بالإنترنت، وهذا الجهاز لم يسبق أن سجّل دخولك",
    needNet: "هذه الخطوة تحتاج اتصالاً بالإنترنت",
    same: "الرقم الجديد هو نفسه الحالي",
    cur: "رقم الدخول الحالي غير صحيح",
    proof: "تعذّر إثبات هويتك — أعد إدخال رقمك الحالي ثم حاول مرة أخرى",
    half: "لم يكتمل التغيير — رقمك القديم لا يزال يعمل، أعد المحاولة",
    taken: "هذا الرقم لا يصلح — اختر رقماً آخر",
    already: "لهذا الحساب رقم دخول مسجّل — استعمل «إعادة تعيين رقم الدخول»",
    notAdmin: "إعادة التعيين للمدير وحده",
    byOld: "رقم دخولك أنت لم يُنقل بعد إلى الحفظ الآمن، ولا يمكن تعيين أرقام المعلمين قبله — تواصل مع مطوّر التطبيق لتهيئة حساب المدير مرة واحدة",
    noTeacher: "لم أجد هذا المعلم",
    // بصمة الرقم الحالي منشورة في مستند المعلم (وهو مقروء لأي جهاز) ⇒ لا تصلح إثباتاً في القواعد،
    //   وكانت تُردّ برسالة «تعذّر إثبات هويتك» فيظنّ المعلم أنه أخطأ في رقمه ويعيد المحاولة بلا طائل.
    exposed: "رقمك الحالي محفوظ بالطريقة القديمة فلا يصلح لإثبات هويتك — اطلب من المدير «إعادة تعيين رقم الدخول»، ثم غيّره بنفسك متى شئت",
    claim: "هذه الخطوة تحتاج جلسة أثبتَّ فيها رقم دخولك على هذا الجهاز — سجّل خروجاً ثم دخولاً برقمك وأعد المحاولة",
    advice: "رقم من 6 خانات فأكثر أصعب في التخمين"
  };

  const warn = (w, e) => { try { console.warn("[auth] " + w, e); } catch (x) { } };
  // رفضٌ من القواعد لا انقطاعُ شبكة: يُقال للمستخدم ما يفعله بدل «تأكد من الإنترنت»
  const isPerm = (e) => {
    const c = String((e && (e.code || e.message)) || "").toLowerCase();
    return c.indexOf("permission-denied") >= 0 || c.indexOf("permission_denied") >= 0;
  };
  const cloud = () => !!(S() && S().CLOUD);
  const teacherById = (tid) => { const s = S(); return (s && s.D && (s.D.teachers || []).find(t => t.id === tid)) || null; };
  const nameOf = (tid) => { const t = teacherById(tid); return (t && t.name) ? String(t.name).slice(0, 80) : String(tid || ""); };
  const weakOf = (pin) => !STRONG_RE.test(String(pin || ""));

  /* ═══ البصمة ═══ */
  const hexOf = (buf) => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
  function subtle() { try { return (window.crypto && window.crypto.subtle) || null; } catch (e) { return null; } }
  async function sha256(msg) {
    const s = S();
    if (s && typeof s.sha256 === "function") return s.sha256(msg);
    return hexOf(await subtle().digest("SHA-256", new TextEncoder().encode(msg)));
  }
  const salt = () => (S() && S().SALT) || "sijil1448";
  function hash(pin, tid) { return sha256(String(pin) + "|" + String(tid) + "|" + salt()); }

  /* ═══ قاعدة الوضع التجريبي: محاكاة كاملة لواجهة fdb.doc(path).get/set/delete ═══ */
  function dread() { try { return JSON.parse(localStorage.getItem(DKEY) || "{}") || {}; } catch (e) { return {}; } }
  function dwrite(o) { try { localStorage.setItem(DKEY, JSON.stringify(o)); } catch (e) { } }
  const demoDb = {
    doc(path) {
      return {
        get() {
          const v = dread()[path];
          return Promise.resolve({ exists: !!v, id: String(path).split("/").pop(), data: () => v ? JSON.parse(JSON.stringify(v)) : undefined });
        },
        set(data, opt) {
          const all = dread(), merge = !!(opt && opt.merge);
          const out = (merge && all[path]) ? Object.assign({}, all[path]) : {};
          Object.keys(data).forEach(k => { if (data[k] === DEL) delete out[k]; else out[k] = data[k]; });
          all[path] = out; dwrite(all); return Promise.resolve();
        },
        delete() { const all = dread(); delete all[path]; dwrite(all); return Promise.resolve(); }
      };
    }
  };

  /* قاعدة البيانات المستعملة: السحابة سحابياً، والمحاكاة تجريبياً.
     window.SIJIL_AUTH_DB حقن للاختبار — لا يُلتفت إليه إطلاقاً في الوضع السحابي. */
  function DBX() {
    const s = S();
    if (s && s.CLOUD) return s.fdb || null;
    if (window.SIJIL_AUTH_DB) return window.SIJIL_AUTH_DB;
    return demoDb;
  }
  function fvDel() {
    try { if (cloud() && window.firebase && firebase.firestore && firebase.firestore.FieldValue) return firebase.firestore.FieldValue.delete(); } catch (e) { }
    return DEL;
  }
  function withTo(p, ms, tag) {
    return new Promise((res, rej) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; rej(new Error("TIMEOUT:" + tag)); } }, ms);
      Promise.resolve(p).then(v => { if (!done) { done = true; clearTimeout(t); res(v); } },
        e => { if (!done) { done = true; clearTimeout(t); rej(e); } });
    });
  }
  function getDoc(path) { const db = DBX(); if (!db) return Promise.reject(new Error("NODB")); return withTo(db.doc(path).get(), RTO, "get " + path); }
  function setDoc(path, data, merge) {
    const db = DBX(); if (!db) return Promise.reject(new Error("NODB"));
    const out = {};
    Object.keys(data).forEach(k => { out[k] = (data[k] === DEL) ? fvDel() : data[k]; });
    return withTo(db.doc(path).set(out, merge ? { merge: true } : undefined), WTO, "set " + path);
  }
  function delDoc(path) { const db = DBX(); if (!db) return Promise.reject(new Error("NODB")); return withTo(db.doc(path).delete(), WTO, "del " + path); }

  /* ═══ الإثبات المحلي (PBKDF2): يسمح بالدخول من هذا الجهاز وحده عند انقطاع الإنترنت ═══
     لا نحفظ البصمة نفسها: من يفتح تخزين الجهاز لا يجد ما يُخمَّن عليه بسرعة. */
  function randHex(n) { try { const a = new Uint8Array(n); crypto.getRandomValues(a); return hexOf(a.buffer); } catch (e) { return ""; } }
  function hexBytes(hex) { const a = new Uint8Array(hex.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16); return a; }
  async function kdf(h, sHex, it) {
    const c = subtle();
    if (!c || !c.importKey || !c.deriveBits || !sHex) return "";
    try {
      const key = await c.importKey("raw", new TextEncoder().encode(h), { name: "PBKDF2" }, false, ["deriveBits"]);
      return hexOf(await c.deriveBits({ name: "PBKDF2", salt: hexBytes(sHex), iterations: it, hash: "SHA-256" }, key, 256));
    } catch (e) { warn("kdf", e); return ""; }
  }
  function lread() { try { return JSON.parse(localStorage.getItem(LKEY) || "{}") || {}; } catch (e) { return {}; } }
  /* الحفظ متسلسل: اشتقاق PBKDF2 بطيء، ولو تزامن حفظان لكتب كلٌّ منهما الخريطة كاملة فمحا الآخر.
     saveLocal تُعيد سلسلة الانتظار (لا ترمي أبداً) — وflush تنتظر ما بقي منها. */
  let lq = Promise.resolve();
  function saveLocal(tid, h, pt) {
    lq = lq.then(() => doSaveLocal(tid, h, pt)).catch(() => { });
    return lq;
  }
  async function doSaveLocal(tid, h, pt) {
    const sHex = randHex(16); if (!sHex) return;
    const k = await kdf(h, sHex, KDF_IT); if (!k) return;          // متصفح بلا PBKDF2 ⇒ لا إثبات محلي (ولا بصمة مكشوفة)
    try {
      const a = lread();
      a[tid] = { s: sHex, k: k, it: KDF_IT, pt: +pt || 0, ts: Date.now() };
      Object.keys(a).sort((x, y) => (a[y].ts || 0) - (a[x].ts || 0)).slice(LMAX).forEach(x => { delete a[x]; });
      localStorage.setItem(LKEY, JSON.stringify(a));
    } catch (e) { }
  }
  async function localOk(tid, h) {
    const r = lread()[tid];
    if (!r || !r.s || !r.k) return false;
    const k = await kdf(h, r.s, +r.it || KDF_IT);
    return !!k && k === r.k;
  }

  /* ═══ مطالبة الجلسة sess/{uid}: إثبات «هذا الجهاز يخصّ هذا المعلم» تحتجّ به القواعد ═══
     تُكتب مرة واحدة بعد كل دخول ناجح، في الخلفية، ولا يتوقف عليها شيء في تجربة المستخدم:
     من فشلت مطالبته يعمل كل شيء عنده كما كان، ولا يُمنع إلا من الكتابة المُتلِفة. */
  const CKEY = "sijil.auth.claim";     // أثر محلي «كُتبت مطالبة لهذا الجهاز» (القواعد تمنع قراءتها)
  function authUid() {
    try {
      if (!cloud() || !window.firebase || !firebase.auth) return "";
      const u = firebase.auth().currentUser;
      return (u && u.uid) ? String(u.uid) : "";
    } catch (e) { return ""; }
  }
  let claimKey = "";                   // آخر مطالبة كُتبت في هذه الصفحة — فلا تتكرر الكتابة عبثاً
  let cq = Promise.resolve();          // سلسلة المطالبات (ينتظرها flush في الاختبارات)
  function claimSession(tid, h) {
    tid = String(tid || ""); h = String(h || "");
    if (!cloud() || !TID_RE.test(tid) || !HEX_RE.test(h)) return Promise.resolve(false);
    const u = authUid();
    if (!u) return Promise.resolve(false);
    const k = u + "|" + tid + "|" + h;
    if (claimKey === k) return Promise.resolve(true);
    claimKey = k;
    const p = setDoc("sess/" + u, { tid: tid, bp: h, ts: Date.now() }, false).then(
      () => { try { localStorage.setItem(CKEY, u + "|" + tid); } catch (e) { } return true; },
      (e) => { claimKey = ""; warn("claim " + tid, e); return false; });
    cq = cq.then(() => p).catch(() => { });
    return p;
  }
  // هل لهذا الجهاز مطالبة كُتبت من هذا التطبيق؟ (للواجهة: تفسير رفضٍ قبل وقوعه)
  function hasClaim(tid) {
    const u = authUid(); if (!u) return false;
    let v = ""; try { v = localStorage.getItem(CKEY) || ""; } catch (e) { }
    const p = v.split("|");
    return p[0] === u && (!tid || p[1] === String(tid));
  }

  /* ═══ مستند المعلم: الختم والعلم — نقرأهما من بيانات المدرسة المحمّلة، ونكتبهما دمجاً ═══ */
  const ptOf = (t) => (t && typeof t.pt === "number" && t.pt > 0) ? t.pt : 0;
  /* ختم جديد: لا يجوز أن يساوي ختماً حياً آخر لهذا المعلم، وإلا بقي رقم قديم صالحاً.
     لذلك: أكبر من ختم المعلم الحالي، وأكبر من كل ختم صنعناه في هذه الجلسة، ومع تشتيت
     عشوائي دون الثانية حتى لا يتصادم جهازان كتبا في المللي ثانية نفسها. */
  let lastTs = 0;
  function stampTs(tid) {
    let n = Date.now() + Math.floor(Math.random() * 997);
    if (n <= lastTs) n = lastTs + 1;
    const pt = ptOf(teacherById(tid));
    if (n <= pt) n = pt + 1;
    lastTs = n;
    return n;
  }
  // «سجّل هويته»: علم التسجيل، أو بصمة قديمة في مستنده، أو أنه المدير سحابياً (رقمه يُدار من الكونسول)
  const isReg = (t) => !!(t && (t.reg === true || (typeof t.pinHash === "string" && t.pinHash) || (cloud() && t.admin === true)));
  function stampOk(d, t) {
    const pt = ptOf(t);
    if (!pt) return true;                       // لم يُختم بعد ⇒ مستند البصمة الوحيد يكفي
    return (+(d && d.ts) || 0) === pt;
  }
  // انعكاس فوري على البيانات المحمّلة حتى ترى الواجهة والدخول التالي الحالة الجديدة بلا إعادة تحميل
  //   (حساب المدير: علمه reg مجمّد في القواعد فلا يُرفع محلياً أيضاً، وإلا تعطّل مسار دخوله القديم في الجلسة نفسها)
  function markLocalTeacher(tid, ts, dropped) {
    const t = teacherById(tid); if (!t) return;
    if (t.admin !== true) t.reg = true;
    if (ts) t.pt = +ts;
    if (dropped) { try { delete t.pinHash; } catch (e) { } }
    const s = S();
    try { if (s && s.CLOUD && s.D) localStorage.setItem("sijil.cloudD", JSON.stringify(s.D)); } catch (e) { }
  }
  // تجريبياً: أعِد ما حُفظ من علم/ختم على بيانات المدرسة بعد إعادة تحميل الصفحة
  let demoApplied = false;
  function ensureDemoMeta() {
    if (demoApplied || cloud()) return;
    const s = S(); if (!s || !s.D) return;
    demoApplied = true;
    const all = dread();
    Object.keys(all).forEach(p => {
      if (p.indexOf("teachers/") !== 0) return;
      const t = teacherById(p.slice(9)); if (!t) return;
      const d = all[p] || {};
      if (d.reg === true) t.reg = true;
      if (typeof d.pt === "number" && d.pt > 0) t.pt = d.pt;
    });
  }

  /* ═══ إنشاء مستند بصمة والتأكد من وصوله فعلاً (لا نمسح شيئاً قبل هذا) ═══
     canDel: هل توجد قناة إثبات تسمح بحذف مستند قديم بالبصمة نفسها وإعادة إنشائه بختم جديد؟ */
  async function ensurePin(tid, h, ts, canDel) {
    let cur = null;
    try { cur = await getDoc("pins/" + h); } catch (e) { return { ok: false, why: "net" }; }
    if (cur && cur.exists) {
      const d = cur.data() || {};
      if (d.tid !== tid) return { ok: false, why: "taken" };
      if ((+d.ts || 0) === ts) return { ok: true, ts: ts };
      if (!canDel) return { ok: true, ts: +d.ts || 0 };          // مستند سليم بختم أقدم: نستعمله كما هو
      try { await delDoc("pins/" + h); } catch (e) { return { ok: false, why: "stale" }; }
    }
    try { await setDoc("pins/" + h, { tid: tid, ts: ts }); }
    catch (e) { warn("pins " + tid, e); return { ok: false, why: isPerm(e) ? "perm" : "write" }; }
    let back = null;
    try { back = await getDoc("pins/" + h); } catch (e) { return { ok: false, why: "net" }; }
    return (back && back.exists) ? { ok: true, ts: ts } : { ok: false, why: "lost" };
  }
  /* ختم مستند المعلم: رفع علم التسجيل ومسح البصمة القديمة من المستند المقروء.
     pt يُكتب فقط حين توجد قناة إثبات (تغيير/إعادة تعيين) — لأن القواعد تشترط
     أن يساوي ختمَ القناة نفسها، وأول تسجيل لا قناة له ولا يحتاج إبطال رقم سابق. */
  /* ═══ هل يجوز محو البصمة القديمة من مستند المعلم المقروء؟ ═══
     القواعد لا تسمح إلا ببصمة ميتة تماماً: الحساب مسجّل في pins، ولا مستند pins يحمل هذه
     البصمة نفسها. والسبب: بصمةٌ نُشرت في مستند مقروء ولها مستند pins حيّ تصلح «إثباتاً»
     لمن قرأها، والقواعد ترفضها إثباتاً ما دامت منشورة — فمحوها يرفع الحماية عمّن نسخها. */
  async function canDropHash(t) {
    if (!t || t.reg !== true) return false;
    const h = (typeof t.pinHash === "string") ? t.pinHash : "";
    if (!HEX_RE.test(h)) return false;
    try { const s = await getDoc("pins/" + h); return !(s && s.exists); } catch (e) { return false; }
  }
  /* تنظيف صامت بعد دخول ناجح: تُمحى البصمة الميتة وحدها، ولا يُزعج المعلم إن تعذّر */
  async function dropStaleHash(tid) {
    if (!cloud()) return false;
    const t = teacherById(tid);
    if (!(await canDropHash(t))) return false;
    try { await setDoc("teachers/" + tid, { pinHash: DEL, ts: Date.now() }, true); }
    catch (e) { warn("drop " + tid, e); return false; }
    markLocalTeacher(tid, 0, true);
    return true;
  }
  async function stampTeacher(tid, ts, withPt) {
    // ts (ختم آخر تعديل للمستند): القواعد تشترط وجوده رقماً في كل كتابة على مستند المعلم،
    // ومستندات المدرسة الحالية أُنشئت بلا هذا الحقل — فبدونه تُرفض كتابة الدمج ويفشل تغيير الرقم.
    const t = teacherById(tid);
    const patch = { ts: Date.now() };
    if (!(t && t.admin === true)) patch.reg = true;      // علم المدير مجمّد في القواعد: إرساله يُبطل الكتابة كلها
    if (withPt) patch.pt = +ts || Date.now();
    // البصمة القديمة لا تُرسل للمحو إلا إن صارت ميتة، وإلا رُفضت الكتابة كاملة فضاع الختم معها
    const asAfter = t ? Object.assign({}, t, patch.reg === true ? { reg: true } : {}) : null;
    if (await canDropHash(asAfter)) patch.pinHash = DEL;
    for (let i = 0; i < 2; i++) {
      try {
        await setDoc("teachers/" + tid, patch, true);
        markLocalTeacher(tid, withPt ? ts : 0, patch.pinHash === DEL);
        return true;
      } catch (e) { warn("stamp " + tid, e); }
    }
    return false;
  }

  /* ═══ ترقية صامتة: من البصمة القديمة في مستند المعلم إلى pins ═══ */
  async function upgrade(tid, h) {
    const ts = stampTs(tid);
    const r = await ensurePin(tid, h, ts, false);
    if (!r.ok) return { ok: false, ts: 0 };
    return { ok: await stampTeacher(tid, 0, false), ts: r.ts || ts };
  }

  /* ═══ (1) التحقق من رقم الدخول ═══ */
  async function verify(tid, pin) {
    ensureDemoMeta();
    tid = String(tid || "");
    pin = String(pin == null ? "" : pin).trim();
    if (!tid) return { ok: false, err: MSG.pick };
    if (!PIN_RE.test(pin)) return { ok: false, err: MSG.fmt };
    const t = teacherById(tid), demo = !cloud();
    const h = await hash(pin, tid);
    let online = true;
    try {
      const snap = await getDoc("pins/" + h);
      if (snap && snap.exists) {
        const d = snap.data() || {};
        if (d.tid === tid && stampOk(d, t)) {
          saveLocal(tid, h, +d.ts || 0).catch(() => { });
          claimSession(tid, h).catch(() => { });    // مطالبة هذا الجهاز بهذه الهوية (في الخلفية)
          dropStaleHash(tid).catch(() => { });      // تنظيف صامت لبصمة ميتة بقيت في المستند المقروء
          return { ok: true, via: "pins", weak: weakOf(pin) };
        }
      }
    } catch (e) { online = false; }
    if (online && t && t.reg !== true && typeof t.pinHash === "string" && t.pinHash === h) {
      const up = await upgrade(tid, h);          // نجح الرقم بالطريقة القديمة ⇒ رقِّ الحساب الآن
      saveLocal(tid, h, up.ts || 0).catch(() => { });
      if (up.ts) claimSession(tid, h).catch(() => { });   // البصمة صارت في pins ⇒ تصلح مطالبة
      return { ok: true, via: "legacy", upgraded: up.ok, weak: weakOf(pin) };
    }
    if (demo && (!t || t.reg !== true) && pin === DEMO_PIN) return { ok: true, via: "demo", weak: weakOf(pin) };
    if (!online) {
      if (await localOk(tid, h)) return { ok: true, via: "offline", weak: weakOf(pin) };
      if (t && t.reg !== true && t.pinHash === h) return { ok: true, via: "offline-legacy", weak: weakOf(pin) };
      return { ok: false, err: MSG.off };
    }
    // «لم تُسجل هويتك» تُقال بعد أن نتأكد أن رقمه ليس في pins أصلاً — لا قبل السؤال:
    //   حساب رُحّل رقمه إلى pins ومُسحت بصمته القديمة كان يُردّ بهذه الرسالة خطأً فيُمنع من الدخول.
    if (!demo && t && t.reg !== true && !t.pinHash) return { ok: false, err: MSG.noreg };
    return { ok: false, err: MSG.bad };
  }

  /* ═══ (2) أول تسجيل لرقم معلم لا رقم له (إضافة معلم جديد) ═══ */
  async function registerFirst(tid, pin) {
    ensureDemoMeta();
    tid = String(tid || ""); pin = String(pin == null ? "" : pin).trim();
    if (!TID_RE.test(tid)) return { ok: false, err: MSG.noTeacher };
    if (!STRONG_RE.test(pin)) return { ok: false, err: MSG.short };   // كل رقم جديد: 6 خانات فأكثر
    const t = teacherById(tid);
    if (t && t.reg === true) return { ok: false, err: MSG.already };
    const ts = stampTs(tid);
    const h = await hash(pin, tid);
    const r = await ensurePin(tid, h, ts, false);
    if (!r.ok) return { ok: false, err: r.why === "taken" ? MSG.taken : r.why === "perm" ? MSG.claim : MSG.net };
    if (!(await stampTeacher(tid, 0, false))) return { ok: false, err: MSG.half, pinLive: true };
    return { ok: true, ts: r.ts || ts, weak: weakOf(pin) };
  }

  /* ═══ (3) المعلم يغيّر رقمه بنفسه ═══ */
  async function changePin(tid, oldPin, newPin) {
    ensureDemoMeta();
    tid = String(tid || "");
    oldPin = String(oldPin == null ? "" : oldPin).trim();
    newPin = String(newPin == null ? "" : newPin).trim();
    if (!TID_RE.test(tid)) return { ok: false, err: MSG.noTeacher };
    if (!STRONG_RE.test(newPin)) return { ok: false, err: MSG.short };   // كل رقم جديد: 6 خانات فأكثر
    if (oldPin === newPin) return { ok: false, err: MSG.same };
    const v = await verify(tid, oldPin);
    if (!v.ok) return { ok: false, err: v.err === MSG.off ? MSG.needNet : (v.err || MSG.cur) };
    if (v.via === "offline" || v.via === "offline-legacy") return { ok: false, err: MSG.needNet };
    const ts = stampTs(tid);
    const hOld = await hash(oldPin, tid), hNew = await hash(newPin, tid);
    // القواعد ترفض بصمةً منشورة في المستند المقروء إثباتاً (وإلا ادّعى بها كل من قرأها). وهذه
    //   حال كل حساب رُحّل رقمه ولم تُمحَ بصمته بعد — فكانت المحاولة تنتهي بـ«تعذّر إثبات هويتك».
    if (cloud() && HEX_RE.test(String((teacherById(tid) || {}).pinHash || "")) &&
        String(teacherById(tid).pinHash) === hOld) return { ok: false, err: MSG.exposed };
    try { await setDoc("pinreq/" + tid, { h: hNew, old: hOld, ts: ts, tn: nameOf(tid) }); }
    catch (e) { warn("pinreq", e); return { ok: false, err: isPerm(e) ? MSG.exposed : MSG.proof }; }
    const r = await ensurePin(tid, hNew, ts, true);
    if (!r.ok) { cleanup(tid); return { ok: false, err: r.why === "taken" ? MSG.taken : r.why === "perm" ? MSG.claim : MSG.net }; }
    if (!(await stampTeacher(tid, ts, true))) { await rollback(tid, hNew); return { ok: false, err: MSG.half }; }
    saveLocal(tid, hNew, ts).catch(() => { });
    claimSession(tid, hNew).catch(() => { });      // مطالبة هذا الجهاز بالبصمة الجديدة (القديمة ستُحذف)
    try { await delDoc("pins/" + hOld); } catch (e) { warn("drop old", e); }   // أُبطلت بالختم أصلاً
    cleanup(tid);
    dropStaleHash(tid).catch(() => { });        // ماتت البصمة القديمة الآن ⇒ تُمحى من المستند المقروء
    return { ok: true, ts: ts, weak: weakOf(newPin) };
  }

  /* ═══ (4) المدير يعيد تعيين رقم معلم — بإثبات رقمه هو ═══ */
  async function resetPin(targetTid, adminTid, adminPin, newPin) {
    ensureDemoMeta();
    targetTid = String(targetTid || ""); adminTid = String(adminTid || "");
    adminPin = String(adminPin == null ? "" : adminPin).trim();
    newPin = String(newPin == null ? "" : newPin).trim();
    if (!TID_RE.test(targetTid) || !teacherById(targetTid)) return { ok: false, err: MSG.noTeacher };
    if (!STRONG_RE.test(newPin)) return { ok: false, err: MSG.short };   // كل رقم جديد: 6 خانات فأكثر
    const adm = teacherById(adminTid);
    if (!adm || adm.admin !== true) return { ok: false, err: MSG.notAdmin };
    const v = await verify(adminTid, adminPin);
    if (!v.ok) return { ok: false, err: v.err === MSG.off ? MSG.needNet : MSG.cur };
    if (v.via === "offline" || v.via === "offline-legacy") return { ok: false, err: MSG.needNet };
    // دخل المدير برقمه القديم (بصمة في مستنده) لا من pins ⇒ لا إثبات له تقبله القواعد
    if (v.via === "legacy" && !v.upgraded) return { ok: false, err: MSG.byOld };
    const ts = stampTs(targetTid);
    const byPin = await hash(adminPin, adminTid), hNew = await hash(newPin, targetTid);
    // بصمة المدير نفسه منشورة في مستنده ⇒ القواعد لا تقبلها إثباتاً (كما في changePin)
    if (cloud() && HEX_RE.test(String(adm.pinHash || "")) && String(adm.pinHash) === byPin)
      return { ok: false, err: MSG.byOld };
    const tgt = teacherById(targetTid);
    const req = { h: hNew, by: adminTid, byPin: byPin, ts: ts, tn: nameOf(adminTid) };
    // البصمة القديمة معروفة فقط ما دامت في مستند المعلم (قبل ترحيله) — نمرّرها ليُسمح بحذفها
    if (tgt && typeof tgt.pinHash === "string" && HEX_RE.test(tgt.pinHash)) req.old = tgt.pinHash;
    try { await setDoc("pinreq/" + targetTid, req); }
    catch (e) { warn("pinreq/admin", e); return { ok: false, err: MSG.proof }; }
    const r = await ensurePin(targetTid, hNew, ts, true);
    if (!r.ok) { cleanup(targetTid); return { ok: false, err: r.why === "taken" ? MSG.taken : r.why === "perm" ? MSG.claim : MSG.net }; }
    if (!(await stampTeacher(targetTid, ts, true))) { await rollback(targetTid, hNew); return { ok: false, err: MSG.half }; }
    if (req.old) { try { await delDoc("pins/" + req.old); } catch (e) { warn("drop old/admin", e); } }
    cleanup(targetTid);
    dropStaleHash(targetTid).catch(() => { });   // ماتت البصمة القديمة الآن ⇒ تُمحى من المستند المقروء
    return { ok: true, ts: ts, weak: weakOf(newPin) };
  }

  function cleanup(tid) { delDoc("pinreq/" + tid).catch(() => { }); }
  /* تراجع: تعذّر ختم مستند المعلم بعد إنشاء البصمة الجديدة ⇒ نحذفها ما دامت قناة الإثبات قائمة
     (القواعد تسمح بحذفها لأن pinreq.h تساويها)، فلا يبقى رقمان صالحان. والرقم القديم يعمل كما كان. */
  async function rollback(tid, hNew) {
    try { await delDoc("pins/" + hNew); } catch (e) { warn("rollback", e); }
    cleanup(tid);
  }

  /* ═══ (5) ترحيل جماعي: ينقل بصمات كل المعلمين من المستند المقروء إلى pins ═══
     الترتيب لكل معلم: أنشئ pins/{بصمته الحالية} ⇒ تأكد من وصولها ⇒ ثم اختم وامسح البصمة.
     من فشل عنده الإنشاء يبقى كما هو تماماً (رقمه القديم يعمل) ويُذكر في التقرير. */
  async function migrateAll(onStep) {
    ensureDemoMeta();
    const s = S(), list = (s && s.D && s.D.teachers) || [];
    const out = { total: 0, done: 0, skipped: 0, failed: [], cleaned: 0, exposed: [] };
    for (const t of list) {
      if (!t || !TID_RE.test(String(t.id || ""))) continue;
      // حساب مُرحَّل بقيت في مستنده بصمة قديمة: تُمحى إن ماتت، وإلا سُجّل أنه يحتاج رقماً جديداً
      if (t.reg === true && typeof t.pinHash === "string" && HEX_RE.test(t.pinHash)) {
        if (await dropStaleHash(t.id)) out.cleaned++; else out.exposed.push(t.id);
        continue;
      }
      if (t.reg === true || typeof t.pinHash !== "string" || !HEX_RE.test(t.pinHash)) { out.skipped++; continue; }
      out.total++;
      const r = await ensurePin(t.id, t.pinHash, stampTs(t.id), false);
      if (!r.ok) { out.failed.push(t.id); if (onStep) { try { onStep(t, false); } catch (e) { } } continue; }
      const st = await stampTeacher(t.id, 0, false);
      if (st) out.done++; else out.failed.push(t.id);
      if (onStep) { try { onStep(t, st); } catch (e) { } }
    }
    return out;
  }

  window.SIJIL_AUTH = {
    hash: hash,
    verify: verify,
    changePin: changePin,
    resetPin: resetPin,
    registerFirst: registerFirst,
    migrateAll: migrateAll,
    isRegistered: (x) => isReg(typeof x === "string" ? teacherById(x) : x),
    // بصمة رقمه ما تزال منشورة في مستنده المقروء ⇒ رقمه في حكم المكشوف ويحتاج رقماً جديداً
    exposed: (x) => { const t = (typeof x === "string") ? teacherById(x) : x; return !!(cloud() && t && typeof t.pinHash === "string" && HEX_RE.test(t.pinHash)); },
    dropStaleHash: dropStaleHash,
    // مطالبة الجلسة: يكتبها الدخول تلقائياً، وhasClaim تخبر الواجهة أن الكتابة المُتلِفة ستُقبل
    claim: claimSession,
    hasClaim: hasClaim,
    PIN_RE: PIN_RE,
    STRONG_RE: STRONG_RE,
    MSG: MSG,
    flush: () => Promise.all([lq, cq]),
    demoReset: () => { try { localStorage.removeItem(DKEY); localStorage.removeItem(LKEY); localStorage.removeItem(CKEY); } catch (e) { } demoApplied = false; claimKey = ""; }
  };
})();
