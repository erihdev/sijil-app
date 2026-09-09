/* ═══════════════════════════════════════════════════════════════════════════════
   سجلي — المرفقات  (window.SIJIL_FILES)
   إرفاق صورة أو ملف PDF أو مقطع صوتي من جهاز المعلم، وحفظه بلا أي تكلفة داخل
   قاعدة بيانات التطبيق نفسها: بطاقة تعريف للملف + محتواه مقسّم على «قطع» صغيرة.

   الواجهة:
     attach(opts)        نافذة الإرفاق: اختيار ملف أو التقاط صورة، ضغط، رفع بشريط تقدّم وإلغاء
     list(scope, ref)    قائمة الملفات من الفهرس الخفيف (بلا تنزيل المحتوى)
     open(id)            فتح الملف: صورة أو PDF أو صوت داخل نافذة عرض
     remove(id)          حذف بعد تأكيد — يحذف القطع والبطاقة والفهرس
     waLink(id)          رابط مشاركة عبر واتساب يفتح صفحة عرض عامة بلا تسجيل
     libraryCard(el)     بطاقة جاهزة (أزرار + عدّاد الحصة + قائمة الملفات) تُوضع في أي حاوية

   نموذج التخزين:
     files/{id}              = { n, t, sz, scope, ref, tid, tn, ts, nc }
     files/{id}/parts/{i}    = { d }   نص base64 لا يتجاوز 700000 حرف
     filesidx/{tid}          = { list:[{id,n,t,sz,scope,ref,ts}], tn, ts }
     filesidx/school         = فهرس مشترك لملفات مكتبة المدرسة (يراها كل المعلمين)

   في النسخة التجريبية (بلا سحابة) يُحفظ كل ذلك في مخزن المتصفح على الجهاز نفسه،
   بالبنية ذاتها، فتعمل الصفحة العامة v/ على الجهاز نفسه أيضاً.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ═══ ثوابت ═══ */
  const MAX_SRC = 6 * 1024 * 1024;   // أكبر ملف يُحفظ في القاعدة: 6 ميجابايت
  const MAX_IMG = 32 * 1024 * 1024;  // أكبر صورة تُقبل من الجهاز قبل الضغط (كاميرات الجوالات)
  const TARGET = 700 * 1024;         // هدف ضغط الصورة: 700 كيلوبايت
  const PART = 700000;               // حروف القطعة الواحدة (تقبل القسمة على 4 فتُفكّ كل قطعة وحدها)
  const IMG_W = 1600;                // أقصى عرض للصورة بعد الضغط
  const QUOTA = 60;                  // ملفاً لكل معلم في الشهر
  const MAX_LIST = 400;              // أقصى طول لقائمة الفهرس
  const IDB_NAME = "sijil-files";
  const SCOPES = { lesson: "الدروس", student: "الطلاب", school: "مكتبة المدرسة", comm: "التواصل", profile: "الملف" };

  /* ═══ أدوات صغيرة ═══ */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const S = () => window.SIJIL || null;
  const fdb = () => { const s = S(); return (s && s.fdb) ? s.fdb : null; };
  const TEAM = () => { const s = S(), t = s && s.TE; return { id: (t && t.id) || "demo", name: (t && t.name) || "معلم" }; };
  const newId = () => { const s = S(); return (s && typeof s.shortId === "function") ? s.shortId() : (Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 4)); };
  const VIEW_BASE = () => location.origin + location.pathname.replace(/[^/]*$/, "") + "v/?f=";
  function fmt(b) {
    b = +b || 0;
    if (b < 1024) return b + " بايت";
    if (b < 1024 * 1024) return Math.round(b / 1024) + " كيلوبايت";
    return (Math.round(b / 1024 / 1024 * 10) / 10).toFixed(1) + " ميجابايت";
  }
  function ymOf(ts) { const d = new Date(ts || Date.now()); return d.getFullYear() * 100 + d.getMonth(); }
  function dateAr(ts) {
    try { return new Date(ts).toLocaleDateString("ar-SA", { day: "numeric", month: "long" }); } catch (e) { return ""; }
  }
  function toast(msg) {
    const A = window.SIJIL_ADMIN;
    if (A && typeof A.toast === "function") { try { return A.toast(msg); } catch (e) { } }
    style();
    let el = document.getElementById("sjf-toast");
    if (!el) { el = document.createElement("div"); el.id = "sjf-toast"; el.className = "sjf-toast"; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("on"), 2600);
  }
  function fail(msg, code) { const e = new Error(msg); e.ar = msg; e.code = code || "bad"; return e; }
  /* ═══ مهلة لكل عملية سحابية ═══
     وعد فايربيس لا يُحسم أبداً ما دام الجهاز بلا اتصال — لا set() ولا get() ولا delete().
     فبغير مهلة تتجمّد نافذة الإرفاق على «الجزء ٢ من ٤» أو نافذة العرض على «جارِ فتح الملف…»
     إلى الأبد بلا رسالة ولا مخرج، وتبقى في القاعدة بطاقةُ ملفٍ لا يراه أحد ولا يُحذف.
     (صفحة الورقة w/ والصفحة العامة v/ تحرسان نفسيهما بالمهلة ذاتها.) */
  const TMO = { op: 20000, tx: 15000, del: 10000, net: 4000 };
  function wt(p, ms) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(fail("تعذّر الوصول إلى الخادم — تحقق من الاتصال ثم أعد المحاولة.", "timeout")), ms || TMO.op);
      Promise.resolve(p).then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
    });
  }
  const IMG_RE = /^image\//, AUD_RE = /^audio\//;
  // SVG مستند برمجي لا صورة: يُنفَّذ ما فيه من سكربت على أصل الموقع إن فُتح كصفحة،
  //   وصفحة ولي الأمر تفتح المرفق برابط blob على الأصل نفسه — فيُردّ عند الباب لا بعده.
  const isSVG = (t, n) => String(t || "").toLowerCase().indexOf("svg") >= 0 || /\.svgz?$/.test(String(n || "").toLowerCase());
  function kindOf(f) {
    const t = String(f.type || "").toLowerCase(), n = String(f.name || "").toLowerCase();
    if (isSVG(t, n)) return null;
    if (IMG_RE.test(t) || /\.(jpe?g|png|gif|bmp|webp|heic|heif)$/.test(n)) return "image";
    if (t === "application/pdf" || /\.pdf$/.test(n)) return "pdf";
    if (AUD_RE.test(t) || /\.(mp3|m4a|aac|ogg|wav|opus)$/.test(n)) return "audio";
    return null;
  }
  const kindOfType = (t) => { t = String(t || "").toLowerCase(); return IMG_RE.test(t) ? "image" : (t === "application/pdf" ? "pdf" : (AUD_RE.test(t) ? "audio" : "other")); };
  // نوع يُعرض داخل الصفحة بأمان. ما عداه (SVG، ونوع غريب في بطاقة قديمة) يُسلَّم عند
  //   الخروج من الصفحة بنوع محايد فيُحفظ ولا يُنفَّذ.
  const VIEW_OK = /^(image\/(jpeg|png|gif|webp|bmp|avif|heic|heif)|audio\/[a-z0-9.+-]{1,24}|application\/pdf)$/;
  const viewSafe = (t) => VIEW_OK.test(String(t || "").toLowerCase());
  // نوع مقبول في قواعد الأمان: application/pdf أو image|audio بلا وسائط. النوع الذي يصل
  //   من المتصفح قد يكون فارغاً أو بمعامل ("audio/mp4;codecs=…") فيرفضه الخادم بلا تفسير.
  const TYPE_OK = /^(application\/pdf|(image|audio)\/[a-z0-9.+-]{1,24})$/;
  function normType(kind, t, name) {
    let s = String(t || "").toLowerCase().split(";")[0].trim();
    if (s === "image/jpg") s = "image/jpeg";
    if (TYPE_OK.test(s) && kindOfType(s) === kind && !isSVG(s, "")) return s;
    const n = String(name || "").toLowerCase();
    if (kind === "pdf") return "application/pdf";
    if (kind === "audio") return /\.(m4a|aac|mp4)$/.test(n) ? "audio/mp4" : /\.(ogg|opus)$/.test(n) ? "audio/ogg" : /\.wav$/.test(n) ? "audio/wav" : "audio/mpeg";
    return /\.png$/.test(n) ? "image/png" : /\.webp$/.test(n) ? "image/webp" : /\.gif$/.test(n) ? "image/gif"
      : /\.bmp$/.test(n) ? "image/bmp" : /\.(heic|heif)$/.test(n) ? "image/heic" : "image/jpeg";
  }
  const ICON = { image: "🖼️", pdf: "📕", audio: "🎧", other: "📄" };
  // زر «التقاط صورة» للأجهزة التي إصبعها هي المؤشر (جوال/لوحي) — لا لكل متصفح يعلن دعم اللمس
  // تنظيف وصف الموضع: Firestore يرفض القيم غير المعرّفة، والقيم الفارغة لا معنى لها في الفهرس
  function cleanRef(r) {
    const out = {};
    if (r && typeof r === "object") Object.keys(r).forEach(k => { const v = r[k]; if (v !== undefined && v !== null && v !== "") out[k] = v; });
    return out;
  }
  // عنوانٌ يبدأ برمز تعبيري لا يُسبق برمز ثانٍ: كان «أدلة وأعمال» يصير «مرّتين» برمزين
  function headTitle(t) {
    const s = String(t == null ? "" : t).trim();
    if (!s) return "\u{1F4CE} إضافة مرفق";
    return s.codePointAt(0) >= 0x2000 ? s : "\u{1F4CE} " + s;
  }
  // العنوان مرة واحدة لكل نافذة: مَن يرسم عنوان نافذته بنفسه (نافذة المرفقات في التطبيق)
  //   يمرّر العنوان نفسه ليكون اسماً لنافذة الإرفاق، فكان يُرسم مرتين متتاليتين حرفياً.
  const flat = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  function headAbove(el, title) {
    const t = flat(title);
    if (!t || !el) return false;
    for (let n = el, hop = 0; n && hop < 4; n = n.parentElement, hop++) {
      for (let p = n.previousElementSibling; p; p = p.previousElementSibling) {
        if (/^H[1-6]$/.test(p.tagName) && flat(p.textContent) === t) return true;
      }
    }
    return false;
  }
  const isTouch = () => { try { return matchMedia("(pointer:coarse)").matches && navigator.maxTouchPoints > 0; } catch (e) { return false; } };
  const isIOS = () => { try { return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); } catch (e) { return false; } };

  /* ═══ مخزن الجهاز (النسخة التجريبية) — بنفس بنية السحابة ═══ */
  let idbP = null;
  function idb() {
    if (idbP) return idbP;
    idbP = new Promise((res, rej) => {
      let r;
      try { r = indexedDB.open(IDB_NAME, 1); } catch (e) { return rej(e); }
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "id" });
        if (!d.objectStoreNames.contains("parts")) d.createObjectStore("parts", { keyPath: "k" });
        if (!d.objectStoreNames.contains("idx")) d.createObjectStore("idx", { keyPath: "k" });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error("idb"));
    });
    return idbP;
  }
  function idbDo(store, mode, fn) {
    return idb().then(d => new Promise((res, rej) => {
      let rq = null;
      const tx = d.transaction(store, mode);
      try { rq = fn(tx.objectStore(store)); } catch (e) { rej(e); return; }
      tx.oncomplete = () => res(rq ? rq.result : undefined);
      tx.onerror = () => rej(tx.error || new Error("idb"));
      tx.onabort = () => rej(tx.error || new Error("idb"));
    }));
  }

  /* ═══ طبقة التخزين: السحابة إن وُجدت، وإلا مخزن الجهاز ═══ */
  async function metaGet(id) {
    const db = fdb();
    if (db) { const s = await wt(db.doc("files/" + id).get()); return s.exists ? Object.assign({ id }, s.data()) : null; }
    const r = await idbDo("meta", "readonly", st => st.get(id));
    return r || null;
  }
  async function metaSet(id, rec) {
    const db = fdb();
    if (db) return wt(db.doc("files/" + id).set(rec));
    return idbDo("meta", "readwrite", st => st.put(Object.assign({ id }, rec)));
  }
  async function metaDel(id) {
    const db = fdb();
    if (db) return wt(db.doc("files/" + id).delete(), TMO.del);
    return idbDo("meta", "readwrite", st => st.delete(id));
  }
  async function partSet(id, i, d) {
    const db = fdb();
    if (db) return wt(db.doc("files/" + id + "/parts/" + i).set({ d }));
    return idbDo("parts", "readwrite", st => st.put({ k: id + ":" + i, d }));
  }
  async function partGet(id, i) {
    const db = fdb();
    if (db) { const s = await wt(db.doc("files/" + id + "/parts/" + i).get()); return s.exists ? (s.data() || {}).d : null; }
    const r = await idbDo("parts", "readonly", st => st.get(id + ":" + i));
    return r ? r.d : null;
  }
  async function partDel(id, i) {
    const db = fdb();
    if (db) return wt(db.doc("files/" + id + "/parts/" + i).delete(), TMO.del);
    return idbDo("parts", "readwrite", st => st.delete(id + ":" + i));
  }
  async function idxGet(key) {
    const db = fdb();
    if (db) { const s = await wt(db.doc("filesidx/" + key).get()); return s.exists ? (s.data() || {}) : {}; }
    const r = await idbDo("idx", "readonly", st => st.get(key));
    return r || {};
  }
  async function idxWrite(key, fn, tn) {
    const db = fdb();
    if (db) {
      const ref = db.doc("filesidx/" + key);
      try {
        await wt(db.runTransaction(async (tx) => {
          const s = await tx.get(ref);
          const cur = s.exists ? ((s.data() || {}).list || []) : [];
          tx.set(ref, { list: fn(cur).slice(0, MAX_LIST), tn: tn || "", ts: Date.now() });
        }), TMO.tx);
      } catch (e) {                       // بعض الشبكات ترفض المعاملات — قراءة ثم كتابة
        // إلا أن تكون المعاملة قد انتهت مهلتها: الشبكة ميتة، وإعادة المحاولة بقراءة
        //   ثم كتابة تضاعف الانتظار بلا أمل وتؤخّر رسالة الفشل دقيقةً كاملة.
        if (e && e.code === "timeout") throw e;
        const s = await wt(ref.get());
        const cur = s.exists ? ((s.data() || {}).list || []) : [];
        await wt(ref.set({ list: fn(cur).slice(0, MAX_LIST), tn: tn || "", ts: Date.now() }));
      }
      return;
    }
    const cur = await idxGet(key);
    await idbDo("idx", "readwrite", st => st.put({ k: key, list: fn(cur.list || []).slice(0, MAX_LIST), tn: tn || "", ts: Date.now() }));
  }

  /* ═══ الصور: ضغط في المتصفح إلى عرض 1600 وجودة تتناقص حتى 700 كيلوبايت ═══ */
  const WEBP = (() => {
    try { const c = document.createElement("canvas"); c.width = c.height = 1; return c.toDataURL("image/webp").indexOf("data:image/webp") === 0; } catch (e) { return false; }
  })();
  function loadBitmap(file) {
    if (window.createImageBitmap) {
      try { return createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file)); } catch (e) { }
    }
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(u), 5000); };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("img")); };
      im.src = u;
    });
  }
  const toBlob = (cv, type, q) => new Promise((res) => {
    if (cv.toBlob) cv.toBlob(b => res(b), type, q);
    else { try { const d = cv.toDataURL(type, q), i = d.indexOf(","); res(b64ToBlob(d.slice(i + 1), type)); } catch (e) { res(null); } }
  });
  async function compressImage(file) {
    const src = await loadBitmap(file);
    const W0 = src.width || src.naturalWidth || 0, H0 = src.height || src.naturalHeight || 0;
    if (!W0 || !H0) { if (src.close) src.close(); throw new Error("size"); }
    const type = WEBP ? "image/webp" : "image/jpeg";
    const widths = [Math.min(IMG_W, W0), 1200, 900].filter((w, i, a) => w > 0 && a.indexOf(w) === i);
    let best = null;
    for (const w of widths) {
      const h = Math.max(1, Math.round(H0 * (w / W0)));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const cx = cv.getContext("2d");
      cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h);
      cx.drawImage(src, 0, 0, w, h);
      for (const q of [0.8, 0.6, 0.45, 0.32]) {
        const b = await toBlob(cv, type, q);
        if (!b || !b.size) continue;
        if (!best || b.size < best.size) best = b;
        if (b.size <= TARGET) { if (src.close) src.close(); return b; }
      }
    }
    if (src.close) src.close();
    if (!best) throw new Error("encode");
    return best;
  }

  /* ═══ تحويل ═══ */
  const toB64 = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result || ""), i = s.indexOf(","); res(i < 0 ? "" : s.slice(i + 1)); };
    r.onerror = () => rej(new Error("read"));
    r.readAsDataURL(blob);
  });
  function b64ToBlob(b64, mime) {
    const bin = atob(String(b64 || "")), n = bin.length, u = new Uint8Array(n);
    for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: mime || "application/octet-stream" });
  }

  /* ═══ الحصة الشهرية ═══ */
  async function quota() {
    const me = TEAM();
    let list = [];
    try { list = (await idxGet(me.id)).list || []; } catch (e) { list = []; }
    const now = ymOf(Date.now());
    const used = list.filter(x => x && ymOf(x.ts) === now).length;
    return { used, quota: QUOTA, left: Math.max(0, QUOTA - used), total: list.length };
  }

  /* ═══ الرفع ═══ */
  // مسحُ ما كُتب قبل التعثّر. متوازٍ ولا يُنتظر: رسالة الفشل تصل المعلم فوراً، وما
  //   تعثّر من الحذف يبقى في طابور مكتبة فايربيس فيُطبّق وحده حين يعود الاتصال.
  async function wipe(id, upto) {
    const jobs = [];
    for (let i = 0; i < upto; i++) jobs.push(Promise.resolve(partDel(id, i)).catch(() => { }));
    jobs.push(Promise.resolve(metaDel(id)).catch(() => { }));
    await Promise.all(jobs);
  }
  function wipeBg(id, upto) { const p = wipe(id, upto); wipeBg.last = p; p.catch(() => { }); return p; }
  async function upload(file, opts, ui) {
    ui = ui || {};
    const say = ui.phase || function () { };
    const prog = ui.progress || function () { };
    const stop = ui.cancelled || function () { return false; };
    const kind = kindOf(file);
    if (!kind) throw fail("هذا النوع غير مدعوم — أرفق صورة أو ملف PDF أو مقطعاً صوتياً.");
    if (!file.size) throw fail("هذا الملف فارغ — اختر ملفاً آخر.");
    // الصورة تُقاس بعد الضغط لا قبله: صور كاميرات الجوالات تتجاوز الحد أصلاً، وهي بالضبط
    //   ما بُني الضاغط لها. الحد الأعلى قبل الضغط أوسع لأنه حدّ ذاكرة لا حدّ تخزين.
    const cap = kind === "image" ? MAX_IMG : MAX_SRC;
    if (file.size > cap) throw fail("حجم الملف " + fmt(file.size) + "، والحد الأعلى " + Math.round(cap / 1024 / 1024) + " ميجابايت. اضغط الملف أو أرسله رابطاً.");
    const q = await quota();
    if (q.left <= 0) throw fail("انتهت حصتك لهذا الشهر (" + QUOTA + " ملفاً). احذف ملفاً قديماً أو انتظر بداية الشهر.");
    // الفهرس يقف عند 400 عنصر، وما يُزاح عنه يصير ملفاً لا يراه أحد ولا يُحذف ويظل يشغل حجمه
    //   في القاعدة: فيُقال للمعلم «امتلأت القائمة» بدل أن يُبتلع أقدم ملفاته صامتاً.
    if (q.total >= MAX_LIST) throw fail("امتلأت قائمة مرفقاتك (" + MAX_LIST + " ملفاً). احذف ملفات قديمة ثم أعد المحاولة.");
    if (String((opts && opts.scope) || "school") === "school") {
      let n = 0;
      try { n = (((await idxGet("school")) || {}).list || []).length; } catch (e) { n = 0; }
      if (n >= MAX_LIST) throw fail("امتلأت مكتبة المدرسة (" + MAX_LIST + " ملفاً). احذف ملفات قديمة ثم أعد المحاولة.");
    }

    let blob = file, name = String(file.name || "ملف"), type = file.type || "";
    if (kind === "image") {
      say("جارِ ضغط الصورة…");
      try {
        blob = await compressImage(file);
        type = blob.type || "image/webp";
        name = name.replace(/\.[^.]+$/, "") + (type === "image/webp" ? ".webp" : ".jpg");
      } catch (e) { blob = file; type = file.type || ""; }   // صورة يعجز المتصفح عن فكّها (HEIC مثلاً): تُرفع كما هي
    }
    type = normType(kind, type, name);
    if (blob.size > MAX_SRC) throw fail(kind === "image"
      ? "الصورة بعد الضغط " + fmt(blob.size) + "، والحد الأعلى 6 ميجابايت — أرسلها بصيغة JPG أو صوّرها بدقة أقل."
      : "الملف " + fmt(blob.size) + "، والحد الأعلى 6 ميجابايت.");

    say("جارِ التحضير…");
    const b64 = await toB64(blob);
    if (!b64) throw fail("تعذّرت قراءة الملف من جهازك.");
    const nc = Math.max(1, Math.ceil(b64.length / PART));
    const me = TEAM();
    const id = newId();
    const rec = {
      n: name.slice(0, 120), t: String(type).slice(0, 40), sz: blob.size,
      scope: String((opts && opts.scope) || "school"), ref: cleanRef(opts && opts.ref),
      tid: me.id, tn: me.name, ts: Date.now(), nc
    };
    say(nc > 1 ? "جارِ الرفع — الملف على " + nc + " أجزاء" : "جارِ الرفع…");
    // انتظارُ كتابةٍ واحدة لا يجوز أن يبتلع ضغطَ «إلغاء» ولا انقطاعَ الشبكة: كان الفحص بين
    //   قطعتين فقط، فإن تعلّقت القطعة بقي كل شيء واقفاً أبداً وزرّ الإلغاء بلا أثر. فيُفحص
    //   الآن كل ثلث ثانية أثناء الانتظار نفسه، ويخرج الرفع فوراً بسبب مفهوم.
    const guard = (p) => new Promise((res, rej) => {
      let end = false, off = 0;
      const fin = (f, v) => { if (end) return; end = true; clearInterval(iv); f(v); };
      const iv = setInterval(() => {
        if (stop()) return fin(rej, fail("أُلغي الرفع.", "cancel"));
        // onLine=false تعني «لا واجهة شبكة أصلاً» — ومهلة قصيرة قبل التسليم تتجاوز الانقطاع العابر
        if (navigator.onLine === false) {
          if (!off) off = Date.now();
          else if (Date.now() - off > TMO.net) fin(rej, fail("انقطع الاتصال أثناء الرفع، فلم يُحفظ المرفق. أعد المحاولة حين يعود الإنترنت.", "offline"));
        } else off = 0;
      }, 300);
      Promise.resolve(p).then(v => fin(res, v), e => fin(rej, e));
    });
    // بطاقة الملف أولاً ثم قطعه: قواعد الأمان لا تقبل قطعة إلا تحت بطاقة موجودة تُعلن عدد قطعها،
    //   وبذلك لا يستطيع أحد ضخّ محتوى بلا بطاقة ولا بلا حدّ. وإن تعثّر الرفع مُحيت البطاقة وقطعها.
    try {
      await guard(metaSet(id, rec));
      for (let i = 0; i < nc; i++) {
        if (stop()) throw fail("أُلغي الرفع.", "cancel");
        prog(i / nc, i, nc);
        await guard(partSet(id, i, b64.slice(i * PART, (i + 1) * PART)));
      }
      if (stop()) throw fail("أُلغي الرفع.", "cancel");
    } catch (e) { wipeBg(id, nc); throw e; }
    prog(0.98, nc, nc);
    // nc وtn في عنصر الفهرس: بهما تُرسم القائمة وتُفتح المصغّرة ويظهر صاحب الملف في مكتبة
    //   المدرسة بلا قراءة بطاقة كل ملف على حدة.
    const item = { id, n: rec.n, t: rec.t, sz: rec.sz, scope: rec.scope, ref: rec.ref, ts: rec.ts, nc: rec.nc, tn: String(rec.tn || "").slice(0, 40) };
    const add = (cur) => [item].concat((cur || []).filter(x => x && x.id !== id));
    const drop = (cur) => (cur || []).filter(x => x && x.id !== id);
    // الفهرس ليس زينة للملف بل هو الملف: ما خرج عنه لا يراه أحد ولا يُحذف ولا يُفتح، ويظل
    //   يشغل حجمه في القاعدة أبداً. فإن تعثّرت كتابته مُحي كل ما كُتب قبل إعلان الفشل.
    let idxTried = 0;
    try {
      idxTried = 1; await guard(idxWrite(me.id, add, me.name));
      if (rec.scope === "school") { idxTried = 2; await guard(idxWrite("school", add, me.name)); }
    } catch (e) {
      // التراجع لا يؤخّر رسالة الفشل: يُطلَق في الخلفية كما يُطلَق مسحُ القطع، فما تعثّر
      //   منه يبقى في طابور المكتبة فيُطبّق حين يعود الاتصال. ويشمل الكتابةَ التي تعثّرت: قد تكون
      //   وصلت الخادم وضاع ردّها، فلا يبقى في الفهرس عنصرٌ لملف مُحي.
      if (idxTried >= 1) Promise.resolve(idxWrite(me.id, drop, me.name)).catch(() => { });
      if (idxTried >= 2) Promise.resolve(idxWrite("school", drop, me.name)).catch(() => { });
      wipeBg(id, nc);
      // سبب الفشل يُقال كما هو (إلغاء/انقطاع/مهلة)؛ وما عداه رسالة الفهرس العامة
      throw (e && (e.code === "cancel" || e.code === "offline" || e.code === "timeout")) ? e
        : fail("تعذّر حفظ المرفق. تحقق من الاتصال ثم أعد المحاولة.", "idx");
    }
    prog(1, nc, nc);
    changed("upload", id, rec);
    return Object.assign({ id }, rec);
  }

  /* ═══ القراءة ═══ */
  async function joinParts(id, nc) {
    const n = Math.max(1, +nc || 1), out = new Array(n);
    for (let i = 0; i < n; i += 4) {
      const batch = [];
      for (let j = i; j < Math.min(n, i + 4); j++) batch.push(partGet(id, j).then(d => { out[j] = d; }));
      await Promise.all(batch);
    }
    if (out.some(x => x == null)) throw fail("الملف ناقص — أعد رفعه من جديد.");
    return out.join("");
  }
  async function blobOf(id, rec) {
    rec = rec || await metaGet(id);
    if (!rec) throw fail("لم يُعثر على هذا الملف.");
    const b64 = await joinParts(id, rec.nc);
    return { rec, blob: b64ToBlob(b64, rec.t) };
  }

  /* ═══ المصغّرات ═══
     مربع 44×44 في القائمة كان يُنزّل الملف كاملاً في كل رسم — وبطاقة «مكتبة المدرسة» تُرسم
     كلما فُتح تبويب «المزيد». فتُبنى المصغّرة مرة واحدة (64 بكسل) وتُحفظ نصاً على الجهاز،
     والقائمة لا تقرأ بطاقة الملف أصلاً لأن نوعه وعدد قطعه صارا في الفهرس. */
  const THUMB_W = 64, THUMB_KEEP = 40, THKEY = "sijil.fth.";
  const thMem = new Map();
  function thKeys() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(THKEY) === 0) out.push(k); } } catch (e) { }
    return out;
  }
  function thGet(id) {
    if (thMem.has(id)) return thMem.get(id);
    let v = null;
    try { v = localStorage.getItem(THKEY + id); } catch (e) { v = null; }
    if (v != null) thMem.set(id, v);
    return v;
  }
  function thPut(id, url) {
    thMem.set(id, url);
    if (thMem.size > 300) { thMem.clear(); thMem.set(id, url); }
    try {
      const ks = thKeys();
      if (ks.length >= THUMB_KEEP) ks.forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
      localStorage.setItem(THKEY + id, url);
    } catch (e) { thKeys().forEach(k => { try { localStorage.removeItem(k); } catch (e2) { } }); }
  }
  function thDrop(id) {
    thMem.delete(id);
    try { localStorage.removeItem(THKEY + id); } catch (e) { }
  }
  async function shrink(blob) {
    const src = await loadBitmap(blob);
    const W0 = src.width || src.naturalWidth || 0, H0 = src.height || src.naturalHeight || 0;
    if (!W0 || !H0) { if (src.close) src.close(); throw new Error("size"); }
    const w = Math.max(1, Math.min(THUMB_W, W0)), h = Math.max(1, Math.round(H0 * (w / W0)));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); cx.drawImage(src, 0, 0, w, h);
    if (src.close) src.close();
    return cv.toDataURL(WEBP ? "image/webp" : "image/jpeg", 0.5);
  }
  async function thumbFor(id, k, nc, t) {
    const c = thGet(id);
    if (c != null) return c;                    // "" تعني: لا مصغّرة لهذا الملف — بلا قراءة ثانية
    if (!k || !nc) {                            // عنصر فهرس قديم بلا نوع ولا عدد قطع
      const rec = await metaGet(id);
      if (!rec) { thMem.set(id, ""); return ""; }
      k = kindOfType(rec.t); nc = Math.max(1, +rec.nc || 1); t = rec.t;
    }
    if (k !== "image" || nc > 2) { thMem.set(id, ""); return ""; }   // صورة على قطعتين تُبنى مرة واحدة ثم تُحفظ
    const got = await blobOf(id, { t: t, nc: nc });
    const url = await shrink(got.blob);
    thPut(id, url);
    return url;
  }

  /* ═══ القائمة ═══ */
  const sameRef = (a, b) => {
    if (!b) return true;
    a = a || {};
    return Object.keys(b).every(k => String(a[k] == null ? "" : a[k]) === String(b[k] == null ? "" : b[k]));
  };
  async function list(scope, ref) {
    const me = TEAM();
    const key = scope === "school" ? "school" : me.id;
    let arr = [];
    try { arr = (await idxGet(key)).list || []; } catch (e) { arr = []; }
    return arr.filter(x => x && (!scope || x.scope === scope) && sameRef(x.ref, ref))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }

  /* ═══ الحذف ═══ */
  // ترتيب الحذف (قطع ← بطاقة ← فهرس) يجعل أي تعثّر قابلاً لإعادة المحاولة بلا أثر جانبي،
  //   ولا تُبتلع أخطاؤه: ما دامت البطاقة حيّة فرابط ولي الأمر العام يعمل ويعرض صورة الطالب،
  //   فإعلان نجاح كاذب هنا أسوأ من الفشل نفسه.
  async function purge(id, rec) {
    if (rec === undefined) rec = await metaGet(id);
    const nc = rec ? Math.max(1, +rec.nc || 1) : 16;
    // القطع معاً لا واحدة إثر أخرى: مع مهلة لكل حذف، كان حذفُ بطاقة بلا سجل (16 قطعة
    //   احتياطاً) على شبكة ميتة يحبس الزرّ دقيقتين ونصف. وأولُ تعثّر يُرفع كما كان فلا يُعلن نجاح كاذب.
    const jobs = []; for (let i = 0; i < nc; i++) jobs.push(partDel(id, i));
    await Promise.all(jobs);
    await metaDel(id);
    const drop = (cur) => (cur || []).filter(x => x && x.id !== id);
    const tid = (rec && rec.tid) || TEAM().id;
    const tn = (rec && rec.tn) || TEAM().name;
    await idxWrite(tid, drop, tn);
    if (!rec || rec.scope === "school") await idxWrite("school", drop, tn);
    thDrop(id);
  }
  async function remove(id, opts) {
    let rec = null;
    try { rec = await metaGet(id); }
    catch (e) { toast("⚠️ تعذّر الوصول إلى الملف — تحقق من الاتصال"); return false; }
    const nm = rec ? rec.n : "هذا الملف";
    if (!(opts && opts.silent)) {
      const A = window.SIJIL_ADMIN;
      let ok;
      if (A && typeof A.confirm === "function") ok = await A.confirm("حذف «" + nm + "» نهائياً؟ لا يمكن التراجع.");
      else ok = window.confirm("حذف «" + nm + "» نهائياً؟ لا يمكن التراجع.");
      if (!ok) return false;
    }
    try { await purge(id, rec); }
    catch (e) { toast("⚠️ تعذّر حذف الملف — تحقق من الاتصال ثم أعد المحاولة"); return false; }
    changed("remove", id, rec);
    toast("🗑️ حُذف الملف");
    return true;
  }

  /* ═══ المشاركة ═══ */
  const viewURL = (id) => VIEW_BASE() + encodeURIComponent(id);
  function waLink(id, phone, note) {
    const txt = (note ? note + "\n" : "") + viewURL(id);
    const s = S();
    if (s && typeof s.waLink === "function") return s.waLink(phone || "", txt);
    return "https://wa.me/" + (phone || "") + "?text=" + encodeURIComponent(txt);
  }

  /* ═══ الشكل ═══ */
  const CSS = `
.sjf-ov{position:fixed;inset:0;background:rgba(10,20,32,.6);z-index:100;display:flex;align-items:flex-end;justify-content:center;font-family:'Tajawal',system-ui,sans-serif}
.sjf-sheet{background:#fff;width:100%;max-width:560px;border-radius:18px 18px 0 0;max-height:90vh;overflow-y:auto;padding:16px 14px 24px;animation:sjfup .18s ease;color:#1B2A3A;direction:rtl;text-align:right}
@keyframes sjfup{from{transform:translateY(40px);opacity:.6}to{transform:none;opacity:1}}
.sjf-sheet h4{margin:0 0 10px;font-size:16px;font-weight:800;color:#0E2033;text-align:center}
.sjf-x{position:sticky;top:0;float:left;background:#EFE9DC;border:0;border-radius:10px;width:32px;height:32px;font-size:17px;color:#6B5B33;cursor:pointer}
.sjf-btn{display:block;width:100%;border:0;border-radius:13px;padding:13px;font-weight:800;font-size:15.5px;cursor:pointer;font-family:inherit;margin-bottom:9px}
.sjf-btn.gold{background:linear-gradient(135deg,#D7A93F,#c2942e);color:#0E2033}
.sjf-btn.navy{background:#0E2033;color:#F0D99A}
.sjf-btn.soft{background:#EFE9DC;color:#6B5B33}
.sjf-btn.bad{background:#FBE9E9;color:#d64545}
.sjf-btn:active{transform:scale(.99)}
.sjf-btn[disabled]{opacity:.45;cursor:default}
.sjf-row{display:flex;gap:8px}.sjf-row>*{flex:1}
.sjf-note{background:#FDF8EC;border:1.5px solid #D7A93F;border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.7;margin-bottom:11px}
.sjf-note b{color:#0E2033}
.sjf-err{background:#FBE9E9;border:1.5px solid #d64545;color:#8a2020;border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.7;margin-bottom:11px;font-weight:700}
.sjf-muted{color:#7c8794;font-size:12.5px}
.sjf-prog{height:10px;background:#E8E2D5;border-radius:99px;overflow:hidden;margin:10px 0 6px}
.sjf-prog i{display:block;height:100%;width:0;background:#D7A93F;border-radius:99px;transition:width .2s}
.sjf-item{display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #e8e2d5;border-radius:13px;padding:9px 10px;margin-bottom:8px}
.sjf-item .th{width:44px;height:44px;border-radius:10px;background:#F8F5EF;display:flex;align-items:center;justify-content:center;font-size:21px;flex:0 0 44px;overflow:hidden}
.sjf-item .th img{width:100%;height:100%;object-fit:cover}
.sjf-item .tx{flex:1;min-width:0}
.sjf-item .nm{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sjf-item .mt{font-size:11.5px;color:#7c8794}
.sjf-item .ac{display:flex;gap:5px;flex:0 0 auto}
.sjf-mini{border:0;background:#EFE9DC;border-radius:9px;width:32px;height:32px;font-size:15px;cursor:pointer;text-decoration:none;display:flex;align-items:center;justify-content:center;color:#6B5B33}
.sjf-mini.bad{background:#FBE9E9;color:#d64545}
.sjf-empty{text-align:center;color:#7c8794;font-size:13.5px;padding:14px 6px}
.sjf-view{width:100%;border-radius:12px;border:1px solid #e8e2d5;background:#F8F5EF;display:block}
.sjf-view.img{max-height:62vh;object-fit:contain}
.sjf-view.pdf{height:62vh}
.sjf-card{background:#fff;border:1px solid #e8e2d5;border-radius:16px;padding:13px 12px;margin-bottom:12px}
.sjf-card h5{margin:0 0 4px;font-size:15px;font-weight:800;color:#0E2033}
.sjf-toast{position:fixed;bottom:76px;right:50%;transform:translateX(50%) translateY(20px);background:#0E2033;color:#F0D99A;padding:10px 18px;border-radius:12px;font-weight:800;font-size:13.5px;z-index:110;opacity:0;pointer-events:none;transition:.2s;font-family:'Tajawal',system-ui,sans-serif}
.sjf-toast.on{opacity:1;transform:translateX(50%)}
@media(max-width:420px){.sjf-sheet{padding:14px 12px 22px}.sjf-btn{font-size:15px}}
`;
  function style() {
    if (document.getElementById("sjf-css")) return;
    const s = document.createElement("style"); s.id = "sjf-css"; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  let onClose = null;
  function sheet(html, mount) {
    style();
    // نافذة تحلّ محلّ أخرى تُغلق الأولى إغلاقاً كاملاً: كان إغلاقها «صامتاً» يُسقط onClose بلا
    //   استدعاء، فيبقى وعد attach() معلَّقاً أبداً ولا تتحدّث البطاقة التي خلفه.
    closeSheet();
    const host = document.createElement("div"); host.id = "sjf-ov"; host.className = "sjf-ov";
    host.innerHTML = '<div class="sjf-sheet">' + html + "</div>";
    host.addEventListener("click", (e) => { if (e.target === host) closeSheet(); });
    document.body.appendChild(host);
    if (mount) mount(host);
    return host;
  }
  function closeSheet() {
    const h = document.getElementById("sjf-ov");
    if (h) h.remove();
    const f = onClose; onClose = null;
    if (f) { try { f(); } catch (e) { } }
  }

  /* ═══ نافذة الإرفاق ═══ */
  function attach(opts) {
    opts = opts || {};
    style();
    return new Promise(async (resolve) => {
      const done = [];
      let busy = false, cancelled = false;
      const title = opts.title || "إضافة مرفق";
      // سطر الحصة يُكتب في موضع واحد ويُحدَّث بعد ظهور النافذة: كان قراءةُ الفهرس تسبق
      //   فتحها، فيُضغط «إرفاق» على شبكة ضعيفة فلا يحدث شيء عشرين ثانية وكأن الزرّ معطّل.
      const qLine = (q) => `<b>ما الذي يُقبل؟</b> صورة (تُصغَّر تلقائياً) · ملف PDF حتى 6 ميجابايت · مقطع صوتي.<br>`
        + (q ? `لك ${QUOTA} ملفاً في الشهر — استُخدم <b>${q.used}</b>، وبقي <b>${q.left}</b>.`
             : `لك ${QUOTA} ملفاً في الشهر — <span class="sjf-muted">جارِ حساب المتبقي…</span>`);
      const html = `
        <button class="sjf-x" id="sjf-close">✕</button>
        <h4>${esc(headTitle(title))}</h4>
        <div class="sjf-note" id="sjf-q">${qLine(null)}</div>
        <div id="sjf-msg"></div>
        <div id="sjf-work" style="display:none">
          <div style="font-weight:800;font-size:14.5px" id="sjf-phase">جارِ العمل…</div>
          <div class="sjf-prog"><i id="sjf-bar"></i></div>
          <div class="sjf-muted" id="sjf-sub"></div>
          <button class="sjf-btn soft" id="sjf-cancel" style="margin-top:10px">إلغاء</button>
        </div>
        <div id="sjf-pick">
          <button class="sjf-btn gold" id="sjf-file">📎 إرفاق ملف من جهازي</button>
          ${isTouch() ? '<button class="sjf-btn navy" id="sjf-cam">📷 التقاط صورة</button>' : ""}
        </div>
        <div id="sjf-added"></div>
        <input type="file" id="sjf-in" accept="image/*,application/pdf,audio/*" multiple hidden>
        <input type="file" id="sjf-in2" accept="image/*" capture="environment" hidden>`;
      const host = sheet(html, (h) => {
        const $ = (s) => h.querySelector(s);
        const msg = $("#sjf-msg"), work = $("#sjf-work"), pick = $("#sjf-pick"), added = $("#sjf-added");
        const bar = $("#sjf-bar"), phase = $("#sjf-phase"), sub = $("#sjf-sub");
        const show = (on) => { work.style.display = on ? "" : "none"; pick.style.display = on ? "none" : ""; };
        const err = (t) => { msg.innerHTML = '<div class="sjf-err">' + esc(t) + "</div>"; };
        async function refreshQuota() {
          const q2 = await quota().catch(() => null);
          const el = h.querySelector("#sjf-q");
          if (q2 && el && el.isConnected) el.innerHTML = qLine(q2);
        }
        refreshQuota();

        async function run(files) {
          if (busy) return;
          busy = true; cancelled = false; msg.innerHTML = ""; show(true);
          for (const f of Array.from(files || [])) {
            try {
              const rec = await upload(f, opts, {
                phase: (t) => { phase.textContent = t; sub.textContent = f.name; },
                progress: (p, i, n) => { bar.style.width = Math.round(p * 100) + "%"; sub.textContent = n > 1 ? "الجزء " + Math.min(i + 1, n) + " من " + n + " · " + f.name : f.name; },
                cancelled: () => cancelled
              });
              done.push(rec);
              added.insertAdjacentHTML("afterbegin", itemHTML(rec, { del: true }));
              wireItems(added, refreshQuota);
              toast("✅ حُفظ المرفق");
            } catch (e) {
              const code = e && e.code;
              if (code === "cancel") { err("أُلغي الرفع، ولم يُحفظ شيء."); break; }
              err((e && e.ar) || "تعذّر رفع الملف. تحقق من الاتصال ثم أعد المحاولة.");
              // الشبكة ميتة: بقية الملفات المختارة ستقف الانتظار نفسه بلا طائل
              if (code === "offline" || code === "timeout") break;
            }
          }
          bar.style.width = "0%"; show(false); busy = false;
          await refreshQuota();
          if (typeof opts.onDone === "function" && done.length) { try { opts.onDone(done); } catch (e) { } }
        }
        $("#sjf-file").onclick = () => $("#sjf-in").click();
        const cam = $("#sjf-cam"); if (cam) cam.onclick = () => $("#sjf-in2").click();
        // تصفير قيمة الحقل بعد كل اختيار: بغيرها لا يُطلق المتصفح حدث change حين يختار المعلم
        //   الملف نفسه مرة ثانية (بعد حذفه مثلاً) فلا يحدث شيء إطلاقاً عند الضغط.
        const pickRun = async (e) => { const f = e.target.files; try { await run(f); } finally { try { e.target.value = ""; } catch (x) { } } };
        $("#sjf-in").onchange = pickRun;
        $("#sjf-in2").onchange = pickRun;
        $("#sjf-cancel").onclick = () => { cancelled = true; phase.textContent = "جارِ الإلغاء…"; };
        $("#sjf-close").onclick = () => { cancelled = true; closeSheet(); };
      });
      onClose = () => resolve(done);
      host.dataset.sjf = "attach";
    });
  }

  /* ═══ بطاقة ملف داخل قائمة ═══ */
  function itemHTML(rec, o) {
    o = o || {};
    const k = kindOfType(rec.t);
    return `<div class="sjf-item" data-id="${esc(rec.id)}">
      <div class="th" data-th="${esc(rec.id)}" data-k="${esc(k)}" data-nc="${esc(rec.nc || "")}" data-t="${esc(rec.t || "")}">${ICON[k]}</div>
      <div class="tx"><div class="nm">${esc(rec.n)}</div>
        <div class="mt">${esc(fmt(rec.sz))} · ${esc(dateAr(rec.ts))}${o.who && rec.tn ? " · " + esc(rec.tn) : ""}</div></div>
      <div class="ac">
        <button class="sjf-mini" data-open="${esc(rec.id)}" title="فتح">👁️</button>
        <a class="sjf-mini" target="_blank" rel="noopener" href="${esc(waLink(rec.id))}" title="مشاركة واتساب">💬</a>
        ${o.del === false ? "" : `<button class="sjf-mini bad" data-del="${esc(rec.id)}" title="حذف">🗑️</button>`}
      </div></div>`;
  }
  function wireItems(root, after) {
    root.querySelectorAll("[data-open]").forEach(b => { if (b._w) return; b._w = 1; b.onclick = () => open(b.dataset.open); });
    root.querySelectorAll("[data-del]").forEach(b => {
      if (b._w) return; b._w = 1;
      b.onclick = async () => {
        if (b.disabled) return;
        b.disabled = true;
        try { if (await remove(b.dataset.del)) { const it = b.closest(".sjf-item"); if (it) it.remove(); if (after) after(); } }
        catch (e) { toast("⚠️ تعذّر حذف الملف — تحقق من الاتصال ثم أعد المحاولة"); }
        b.disabled = false;
      };
    });
    root.querySelectorAll("[data-th]").forEach(async (el) => {
      if (el._w) return; el._w = 1;
      if (!el.closest(".sjf-item")) return;
      try {
        const url = await thumbFor(el.dataset.th, el.dataset.k || "", +el.dataset.nc || 0, el.dataset.t || "");
        if (url && el.isConnected) el.innerHTML = '<img alt="" src="' + url + '">';
      } catch (e) { }
    });
  }

  /* ═══ نافذة العرض ═══ */
  async function open(id) {
    style();
    sheet('<button class="sjf-x" id="sjf-close">✕</button><h4>جارِ فتح الملف…</h4><div class="sjf-prog"><i style="width:35%"></i></div>',
      (h) => { h.querySelector("#sjf-close").onclick = () => closeSheet(); });
    let data;
    try { data = await blobOf(id); }
    catch (e) {
      sheet('<button class="sjf-x" id="sjf-close">✕</button><h4>تعذّر فتح الملف</h4><div class="sjf-err">' + esc((e && e.ar) || "تحقق من الاتصال ثم أعد المحاولة.") + "</div>",
        (h) => { h.querySelector("#sjf-close").onclick = () => closeSheet(); });
      return null;
    }
    const rec = data.rec, url = URL.createObjectURL(data.blob), k = kindOfType(rec.t);
    // داخل <img> لا يُنفَّذ شيء، أما الفتح في نافذة جديدة فيجعل الملف وثيقة عليا على أصل
    //   الموقع — فالنوع غير المأمون (SVG وما شابهه) يُسلَّم محايداً فيُحفظ ولا يُنفَّذ.
    const raw = viewSafe(rec.t) ? null : new Blob([data.blob], { type: "application/octet-stream" });
    const out = raw ? URL.createObjectURL(raw) : url;
    const body = k === "image" ? `<img class="sjf-view img" alt="${esc(rec.n)}" src="${url}">`
      : k === "pdf" ? (isIOS()
        ? `<div class="sjf-note" style="text-align:center">📕 ملف PDF جاهز — اضغط «نافذة جديدة» لفتحه بقارئ جهازك.</div>`
        : `<iframe class="sjf-view pdf" title="${esc(rec.n)}" src="${url}"></iframe>`)
        : k === "audio" ? `<audio class="sjf-view" style="padding:10px" controls src="${url}"></audio>`
          : `<div class="sjf-empty">لا يمكن عرض هذا النوع هنا — افتحه في نافذة جديدة.</div>`;
    sheet(`<button class="sjf-x" id="sjf-close">✕</button>
      <h4>${ICON[k]} ${esc(rec.n)}</h4>
      <div class="sjf-muted" style="text-align:center;margin-bottom:9px">${esc(fmt(rec.sz))} · ${esc(dateAr(rec.ts))}${rec.nc > 1 ? " · محفوظ على " + rec.nc + " أجزاء" : ""}</div>
      ${body}
      <div class="sjf-row" style="margin-top:11px">
        <a class="sjf-btn soft" style="text-align:center;text-decoration:none;line-height:1.4" target="_blank" rel="noopener" ${raw ? `download="${esc(rec.n)}"` : ""} href="${out}">${raw ? "⬇️ حفظ الملف" : "↗️ نافذة جديدة"}</a>
        <a class="sjf-btn gold" style="text-align:center;text-decoration:none;line-height:1.4" target="_blank" rel="noopener" href="${esc(waLink(id))}">💬 مشاركة</a>
      </div>
      <button class="sjf-btn bad" id="sjf-del">🗑️ حذف الملف</button>`,
      (h) => {
        h.querySelector("#sjf-close").onclick = () => closeSheet();
        h.querySelector("#sjf-del").onclick = async () => { if (await remove(id)) closeSheet(); };
      });
    // تحرير روابط blob مهما أُغلقت النافذة: كان التحرير معلّقاً بزرّ ✕ وحده، فإن أغلقها
    //   المعلم بالضغط خارجها أو فتح ملفاً آخر بقي الملف كله في ذاكرة اللوح حتى يُعاد تحميل الصفحة.
    onClose = () => setTimeout(() => { URL.revokeObjectURL(url); if (raw) URL.revokeObjectURL(out); }, 1000);
    return rec;
  }

  /* ═══ بطاقة جاهزة تُوضع في أي حاوية ═══ */
  async function libraryCard(el, opts) {
    opts = opts || {};
    if (typeof el === "string") el = document.querySelector(el);
    if (!el) return null;
    style();
    const scope = opts.scope || "school", ref = opts.ref || null;
    const title = opts.title || (scope === "school" ? "🗂️ مكتبة المدرسة" : "📎 المرفقات");
    const hint = opts.hint || (scope === "school" ? "مستندات تظهر لكل المعلمين: الجدول الرسمي، النماذج، التعاميم." : "صور وملفات مرتبطة بهذه البطاقة.");
    el.innerHTML = `<div class="sjf-card">
      ${headAbove(el, title) ? "" : `<h5>${esc(title)}</h5>`}
      <div class="sjf-muted" style="margin-bottom:9px">${esc(hint)}</div>
      <div class="sjf-row"><button class="sjf-btn gold" data-add="1">📎 إرفاق</button>${isTouch() ? '<button class="sjf-btn navy" data-cam="1">📷 التقاط صورة</button>' : ""}</div>
      <div class="sjf-muted" id="sjf-quota" style="margin:2px 0 9px"></div>
      <div id="sjf-list"><div class="sjf-empty">جارِ التحميل…</div></div>
    </div>`;
    const listEl = el.querySelector("#sjf-list"), qEl = el.querySelector("#sjf-quota");
    async function paint() {
      const [arr, q] = await Promise.all([list(scope, ref).catch(() => []), quota().catch(() => null)]);
      qEl.textContent = q ? "حصتك هذا الشهر: استُخدم " + q.used + " من " + QUOTA + " (بقي " + q.left + ")" : "";
      listEl.innerHTML = arr.length ? arr.map(r => itemHTML(r, { who: scope === "school" })).join("")
        : '<div class="sjf-empty">لا مرفقات بعد — اضغط «إرفاق» لإضافة أول ملف.</div>';
      wireItems(listEl, paint);
    }
    el.querySelector("[data-add]").onclick = async () => { await attach({ scope, ref, title: opts.title }); paint(); };
    const cam = el.querySelector("[data-cam]");
    if (cam) cam.onclick = async () => { await attach({ scope, ref, title: opts.title, camera: true }); paint(); };
    await paint();
    return { refresh: paint };
  }

  /* كل واجهة تعرض مرفقات (شريط الدرس، محطة المرفقات، بطاقة الطالب، مكتبة المدرسة) تسمع هذا الحدث
     فتُعيد الرسم فوراً — فلا تبقى بطاقةُ ملفٍ محذوف على الشاشة حتى إعادة التحميل. */
  function changed(action, id, rec) {
    try { window.dispatchEvent(new CustomEvent("sijil:files", { detail: { action: action, id: id, scope: rec && rec.scope, ref: rec && rec.ref, tid: rec && rec.tid } })); } catch (e) { }
  }

  window.SIJIL_FILES = {
    attach, list, open, remove, waLink, libraryCard, changed,
    upload, quota, viewURL, itemHTML, wireItems, blobOf, purge, fmt, kindOf, normType, viewSafe,
    MAX_SRC, MAX_IMG, TARGET, PART, QUOTA, IMG_W, TMO
  };
})();
