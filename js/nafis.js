/* نجوم المدرسة — صقور نافس (window.NAFIS): محاكاةُ منصات تعليم جازان داخل التطبيق

   ما كان موزَّعاً على خمس منصات (منصة دعم نواتج التعلم، ونماذج Microsoft Forms، وملفات Drive،
   ومواقع المهام الأدائية، ومنصة التعلم الذاتي) يصير هنا شيئاً واحداً لطالب الثالث والسادس:
     ▶️ فيديو الناتج يُعرض داخل التطبيق (Drive/YouTube مضمَّنان)،
     📖 ملف الناتج يُعرض داخل التطبيق،
     ✅ اختبار الناتج يُحلّ داخل التطبيق ويُصحَّح فوراً — أسئلته منقولةٌ من ملفات الإدارة ونماذجها،
     📋 المهمة الأدائية ببطاقة الطالب،
   والنتائج تُكتب في subs (المجموعة القائمة، بمعرّف a = nf<صف><مجال><رقم>) فتراها الإدارة
   والمعلمون والقائمون على صقور نافس في لوحة النتائج — بلا مجموعةٍ جديدة في القواعد.

   البيانات: data/nafis/bank.json (بنك الأسئلة)، data/nafis/media.json (الفيديو والملفات)،
   data/nafis/tasks_<صف><مجال>.json (المهام الأدائية) — تُجلب عند الحاجة فقط. */
(function () {
  "use strict";
  var BANK = null, MEDIA = null, TASKS = {}, P = {};
  var DOMN = { read: "القراءة", math: "الرياضيات", sci: "العلوم" }, DOMI = { read: "📖", math: "➗", sci: "🔬" };
  var LETTER = ["أ", "ب", "ج", "د", "هـ", "و"];
  var BASE = (function () { try { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/js\/nafis\.js.*$/, "") : ""; } catch (e) { return ""; } })();
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fetchJson(rel) {
    if (P[rel]) return P[rel];
    P[rel] = fetch(BASE + rel).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return P[rel];
  }
  /* البنك مقسوم بالصف (bank_3 / bank_6): الطالب يحمّل صفه فقط، والإدارة الصفين. الاستدعاء المتكرر لا يعيد الجلب. */
  var LOADED = {};
  function load(gcs) {
    var want = (gcs && gcs.length ? gcs : [3, 6]).map(String).filter(function (g) { return !LOADED[g]; });
    var jobs = want.map(function (g) { return fetchJson("data/nafis/bank_" + g + ".json?v=1").then(function (d) { if (d && d.grades) { BANK = BANK || { grades: {} }; Object.keys(d.grades).forEach(function (k) { BANK.grades[k] = d.grades[k]; }); LOADED[g] = 1; } }); });
    if (!MEDIA) jobs.push(fetchJson("data/nafis/media.json?v=1").then(function (d) { MEDIA = d; }));
    return Promise.all(jobs).then(function () { return !!(BANK && MEDIA); });
  }
  function tasksOf(gc, dom) {
    var k = gc + dom; if (TASKS[k]) return Promise.resolve(TASKS[k]);
    return fetchJson("data/nafis/tasks_" + gc + dom + ".json?v=1").then(function (d) { TASKS[k] = d || []; return TASKS[k]; });
  }
  var CSS = false;
  function css() {
    if (CSS) return; CSS = true;
    var st = document.createElement("style");
    st.textContent =
      ".nf{border:1.5px solid rgba(215,169,63,.5);border-radius:16px;padding:12px 12px 10px;background:#fff;margin-top:10px;box-shadow:0 4px 14px rgba(14,32,51,.06)}" +
      ".nf .nfh{display:flex;align-items:center;gap:8px;font-weight:900;font-size:15px;color:#0E2033}.nf .nfh small{font-weight:700;color:#6b7a8f;font-size:12px}" +
      ".nf .nfo{font-weight:800;font-size:14px;color:#0E2033;margin:8px 0 6px;line-height:1.6}" +
      ".nf .nfb{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}" +
      ".nf .nfb button,.nf .nfb a{display:flex;align-items:center;justify-content:center;gap:6px;border:1.5px solid rgba(14,32,51,.12);background:#fff;border-radius:12px;padding:10px 8px;font:inherit;font-weight:800;font-size:13px;color:#0E2033;cursor:pointer;text-decoration:none;min-height:44px}" +
      ".nf .nfb .g{background:#D7A93F;border-color:#D7A93F}.nf .nfb .done{background:rgba(76,211,168,.16);border-color:rgba(76,211,168,.55)}.nf .nfb .off{opacity:.45;pointer-events:none}" +
      ".nf .nfb small{font-weight:700;font-size:11px;color:#3a4a63}" +
      ".nfv{margin-top:8px;border-radius:12px;overflow:hidden;background:#0E2033;position:relative}.nfv iframe{width:100%;height:56vh;border:0;display:block;background:#000}" +
      ".nfv .x{position:absolute;top:6px;left:6px;background:rgba(255,255,255,.92);border:0;border-radius:999px;padding:6px 10px;font:inherit;font-weight:800;cursor:pointer;z-index:2}" +
      ".nft{margin-top:8px;background:#F6F1E4;border-radius:12px;padding:12px}.nft h4{margin:0 0 6px;font-size:14px;color:#0E2033}.nft p,.nft li{font-size:13px;line-height:1.8;color:#2b3a4e;margin:0}.nft ol{padding-right:18px;margin:4px 0}.nft .lbl{font-size:12px;color:#6b7a8f;font-weight:800;margin-top:8px}" +
      ".nfq{position:fixed;inset:0;background:#F6F1E4;z-index:60;overflow:auto;padding:14px 14px 90px}.nfq .top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.nfq .top b{font-size:15px;color:#0E2033}" +
      ".nfq .bar{height:8px;background:rgba(14,32,51,.1);border-radius:99px;overflow:hidden}.nfq .bar i{display:block;height:100%;background:#D7A93F}" +
      ".nfq .card{background:#fff;border-radius:16px;padding:14px;margin-top:12px;box-shadow:0 4px 14px rgba(14,32,51,.06)}.nfq .pas{background:#F6F1E4;border-radius:10px;padding:10px;font-size:14px;line-height:1.9;color:#2b3a4e;margin-bottom:10px;max-height:38vh;overflow:auto}" +
      ".nfq .qn{font-size:12px;color:#6b7a8f;font-weight:800}.nfq .qs{font-size:16.5px;font-weight:800;line-height:1.8;color:#0E2033;margin:4px 0 10px}.nfq .fig{font-size:12.5px;color:#a15c00;background:#fff4dd;border-radius:8px;padding:6px 8px;margin-bottom:8px}" +
      ".nfq .opt{display:flex;align-items:center;gap:10px;width:100%;text-align:right;border:1.5px solid rgba(14,32,51,.14);background:#fff;border-radius:12px;padding:11px 12px;margin-top:8px;font:inherit;font-size:15px;color:#0E2033;cursor:pointer;line-height:1.6}.nfq .opt b{width:26px;height:26px;border-radius:50%;background:#F6F1E4;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex:none}" +
      ".nfq .opt.on{border-color:#D7A93F;background:#fff8e6}.nfq .opt.ok{border-color:#4CD3A8;background:rgba(76,211,168,.14)}.nfq .opt.bad{border-color:#e05a5a;background:#ffecec}" +
      ".nfq .fill{width:100%;border:1.5px solid rgba(14,32,51,.14);border-radius:12px;padding:10px;font:inherit;font-size:16px}" +
      ".nfq .nav{position:fixed;bottom:0;right:0;left:0;background:#fff;border-top:1px solid rgba(14,32,51,.1);padding:10px 14px calc(10px + env(safe-area-inset-bottom));display:flex;gap:8px}.nfq .nav button{flex:1;border:0;border-radius:12px;padding:12px;font:inherit;font-weight:900;font-size:15px;cursor:pointer}.nfq .nav .p{background:#e9e4d6;color:#0E2033}.nfq .nav .n{background:#0E2033;color:#F2CC6B}.nfq .nav .s{background:#D7A93F;color:#0E2033}" +
      ".nfq .res{text-align:center;padding:16px 8px}.nfq .res .big{font-size:56px;line-height:1}.nfq .res h2{margin:6px 0 2px;font-size:22px;color:#0E2033}.nfq .res p{color:#6b7a8f;font-weight:700;margin:2px 0}" +
      ".nfq .rv{margin-top:10px;text-align:right}.nfq .rv .it{border-radius:12px;padding:10px;margin-top:8px;font-size:13.5px;line-height:1.7}.nfq .rv .it.ok{background:rgba(76,211,168,.14)}.nfq .rv .it.bad{background:#ffecec}" +
      ".nfr table{width:100%;border-collapse:collapse;font-size:12.5px}.nfr th,.nfr td{border:1px solid rgba(14,32,51,.12);padding:5px 6px;text-align:center}.nfr th{background:#0E2033;color:#F2CC6B;font-weight:800;position:sticky;top:0}.nfr td.nm{text-align:right;font-weight:800;white-space:nowrap}.nfr .p{display:inline-block;min-width:34px;border-radius:8px;padding:2px 5px;font-weight:800}" +
      ".nfr .p.hi{background:rgba(76,211,168,.2)}.nfr .p.mid{background:#fff4dd}.nfr .p.lo{background:#ffecec}.nfr .p.no{color:#b7c0cc}";
    document.head.appendChild(st);
  }
  /* ═══ البنك ═══ */
  function grade(gc) { return (BANK && BANK.grades && BANK.grades[String(gc)]) || null; }
  function items(gc, dom) { var g = grade(gc); return (g && g.domains[dom] && g.domains[dom].items) || []; }
  function mediaItems(gc, dom) { var g = MEDIA && MEDIA.grades && MEDIA.grades[String(gc)]; return (g && g[dom] && g[dom].items) || []; }
  function mediaDom(gc, dom) { var g = MEDIA && MEDIA.grades && MEDIA.grades[String(gc)]; return (g && g[dom]) || null; }
  function key(gc, dom, k) { return "nf" + gc + dom[0] + String(k).padStart(2, "0"); }        // nf6s03 — ضمن ^[a-z0-9]{4,12}$
  function forWeek(gc, dom, wk, term) {
    var m = mediaItems(gc, dom), out = [], keyW = wk === "غم" ? "غم" : (term === "t2" ? "ف2" : +wk);
    m.forEach(function (it) { if ((it.w || []).indexOf(keyW) >= 0) out.push(it.k); });
    return out;
  }
  function bankItem(gc, dom, k) { return items(gc, dom).filter(function (x) { return x.k === k; })[0] || null; }
  /* الأسئلة القابلة للتصحيح: مفتاحُ الملف إن وُجد، وإلا حلّ المُحلِّلَين المتفقَين بثقة */
  var MAXQ = 40;   // قاعدة subs: ans.size() <= 40
  function graded(bi) { return ((bi && bi.q) || []).filter(function (q) { return q.ans != null; }).slice(0, MAXQ); }
  /* رقم الناتج/المؤشر من اسمه العربي: «ناتج التعلم التاسع عشر» → 19، «المؤشر الثالث» → 3 */
  var ONES = { "اول": 1, "واحد": 1, "حادي": 1, "ثاني": 2, "ثالث": 3, "رابع": 4, "خامس": 5, "سادس": 6, "سابع": 7, "ثامن": 8, "تاسع": 9, "عاشر": 10 };
  var TENS = { "عشر": 10, "عشرون": 20, "ثلاثون": 30, "ثلاتون": 30, "اربعون": 40 };
  function ordinal(name) {
    var m = String(name || "").match(/[٠-٩0-9]+/); if (m) return +m[0].replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
    var w = String(name || "").replace(/[ًٌٍَُِّْ]/g, "").replace(/[أإآ]/g, "ا").split(/\s+/), ten = 0, one = 0;
    w.forEach(function (x) { x = x.replace(/^و/, "").replace(/^ال/, ""); if (TENS[x] != null) ten = TENS[x]; else if (ONES[x] != null) one = ONES[x]; });
    if (ten === 10) return 10 + (one === 10 ? 0 : one);        // «الحادي عشر» = 11، «الثاني عشر» = 12
    if (ten) return ten + (one === 10 ? 0 : one);              // «الواحد وعشرون» = 21، «السادس و عشرون» = 26
    return one || 0;
  }
  function driveId(u) { var m = String(u || "").match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]{20,})/); return m ? m[1] : ""; }
  function embedUrl(v) {
    if (!v) return "";
    if (v.type === "drive") return "https://drive.google.com/file/d/" + v.id + "/preview";
    if (v.type === "yt") return "https://www.youtube-nocookie.com/embed/videoseries?list=" + v.list + "&rel=0&playsinline=1";
    return "";
  }
  /* ═══ الواجهة: كتلة ناتجٍ واحد ═══ */
  function block(ctx, gc, dom, k, sub) {
    css();
    var m = mediaItems(gc, dom).filter(function (x) { return x.k === k; })[0]; if (!m) return "";
    var bi = bankItem(gc, dom, k), nq = graded(bi).length, done = sub && sub.mx;
    var pct = done ? Math.round(sub.sc / sub.mx * 100) : null;
    var vid = embedUrl(m.video), ext = (m.video && m.video.type === "link") ? m.video.url : "";
    return '<div class="nf" data-nf="' + gc + "|" + dom + "|" + k + '"><div class="nfh">' + DOMI[dom] + ' ' + esc(DOMN[dom]) + ' <small>' + esc(m.name) + '</small></div>' +
      '<div class="nfo">' + esc((bi && bi.outcome) || m.name) + '</div>' +
      '<div class="nfb">' +
      (vid ? '<button data-act="video">▶️ الفيديو</button>' : ext ? '<a href="' + esc(ext) + '" target="_blank" rel="noopener">▶️ الفيديو <small>(خارجي)</small></a>' : '<button class="off">▶️ لا فيديو</button>') +
      (m.doc ? '<button data-act="doc">📖 ملف الناتج</button>' : '<button class="off">📖 لا ملف</button>') +
      (nq ? '<button data-act="quiz" class="' + (done ? "done" : "g") + '">✅ الاختبار <small>' + (done ? pct + "٪ · " + (sub.att || 1) + (sub.att > 1 ? " محاولات" : " محاولة") : nq + " سؤالاً") + '</small></button>' : '<button class="off">✅ الاختبار <small>قيد التجهيز</small></button>') +
      '<button data-act="task">📋 المهمة الأدائية</button>' +
      (m.enrich ? '<button data-act="enrich">🖥️ العرض</button>' : "") +
      '</div><div class="nfx"></div></div>';
  }
  function viewer(url) { return '<div class="nfv"><button class="x" data-act="close">✕ إغلاق</button><iframe src="' + esc(url) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>'; }
  function taskHtml(t) {
    if (!t) return '<div class="nft"><p>لا مهمة أدائية مسجَّلة لهذا الناتج بعد.</p></div>';
    var st = t.st || {}, steps = Array.isArray(st.steps) ? st.steps : (Array.isArray(t.steps) ? t.steps : []);
    return '<div class="nft"><h4>📋 ' + esc(t.taskTitle || t.title || "المهمة الأدائية") + '</h4>' +
      (st.mission ? '<div class="lbl">مهمتي</div><p>' + esc(st.mission) + '</p>' : (t.taskDesc ? '<p>' + esc(t.taskDesc) + '</p>' : "")) +
      (st.needs ? '<div class="lbl">ما أحتاجه</div><p>' + esc(Array.isArray(st.needs) ? st.needs.join("، ") : st.needs) + '</p>' : "") +
      (steps.length ? '<div class="lbl">خطوات عملي</div><ol>' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join("") + '</ol>' : "") +
      (st.success ? '<div class="lbl">أعرف أنني نجحت إذا…</div><p>' + esc(Array.isArray(st.success) ? st.success.join("، ") : st.success) + '</p>' : "") +
      (st.reflect ? '<div class="lbl">تأمّلي في تعلمي</div><p>' + esc(Array.isArray(st.reflect) ? st.reflect.join("، ") : st.reflect) + '</p>' : "") +
      (t.time ? '<div class="lbl">الزمن: ' + esc(t.time) + (t.mode ? ' · ' + esc(t.mode) : "") + '</div>' : "") + '</div>';
  }
  function findTask(list, m, k) {
    if (!list || !list.length) return null;
    // موقع المهام مرتّب برقم الناتج/المؤشر (١..ن)، وعناصر المنصة قد لا تكون مرتّبة رقمياً → نطابق بالرقم المستخرج من الاسم
    var n = ordinal(m && m.name); if (n >= 1 && n <= list.length) return list[n - 1];
    return list[k] || null;
  }
  /* ═══ الربط: نقرات الكتل ═══ */
  function bind(root, ctx) {
    root.querySelectorAll(".nf").forEach(function (box) {
      var p = box.getAttribute("data-nf").split("|"), gc = +p[0], dom = p[1], k = +p[2];
      var m = mediaItems(gc, dom).filter(function (x) { return x.k === k; })[0], x = box.querySelector(".nfx");
      box.querySelectorAll("[data-act]").forEach(function (b) {
        b.onclick = function () {
          var act = b.getAttribute("data-act");
          if (act === "close") { x.innerHTML = ""; return; }
          if (act === "video") { x.innerHTML = viewer(embedUrl(m.video)); x.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
          if (act === "doc") { x.innerHTML = viewer("https://drive.google.com/file/d/" + m.doc + "/preview"); return; }
          if (act === "enrich") { x.innerHTML = viewer("https://drive.google.com/file/d/" + m.enrich + "/preview"); return; }
          if (act === "task") {
            var did = driveId(m.tasks_url);
            if (did) { x.innerHTML = viewer("https://drive.google.com/file/d/" + did + "/preview"); return; }   // مهمة الرياضيات ملفٌ على Drive
            x.innerHTML = '<div class="nft"><p>جارِ التحميل…</p></div>'; tasksOf(gc, dom).then(function (list) { x.innerHTML = taskHtml(findTask(list, m, k)); }); return;
          }
          if (act === "quiz") { quiz(ctx, gc, dom, k); return; }
        };
        var close = x.querySelector("[data-act=close]");
      });
      x.addEventListener("click", function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute("data-act") === "close") x.innerHTML = ""; });
    });
  }
  /* ═══ الاختبار داخل التطبيق ═══
     الأسئلة من البنك؛ التصحيح فوري؛ التسليم في subs/{a}_{si} بمنطق الورقة التفاعلية نفسه:
     المحاولة الأولى مسجَّلةٌ لا تتبدّل (ans/sc/ts)، وتُزاد att وbest وlsc. ثلاث محاولات. */
  var TRIES = 3;
  function quiz(ctx, gc, dom, k) {
    css();
    var bi = bankItem(gc, dom, k), qs = graded(bi); if (!qs.length) return;
    var a = key(gc, dom, k), S = ctx.S, docId = a + "_" + S.si;
    var wrap = document.createElement("div"); wrap.className = "nfq"; document.body.appendChild(wrap);
    var qi = 0, answers = new Array(qs.length).fill(null), PREV = null;
    function close() { try { document.body.removeChild(wrap); } catch (e) { } if (ctx.onDone) ctx.onDone(); }
    function draw() {
      var q = qs[qi], cur = answers[qi];
      var opts = (q.type === "fill") ? '<input class="fill" id="nf-fill" placeholder="اكتب الإجابة" value="' + esc(cur || "") + '">' :
        (q.opts || []).map(function (o, i) { return '<button class="opt' + (cur === i ? " on" : "") + '" data-i="' + i + '"><b>' + (LETTER[i] || i + 1) + '</b><span>' + esc(o) + '</span></button>'; }).join("");
      wrap.innerHTML = '<div class="top"><b>✅ اختبار: ' + esc(bi.name || "") + '</b><button class="x" id="nf-x" style="border:0;background:#fff;border-radius:999px;padding:6px 10px;font:inherit;font-weight:800">✕</button></div>' +
        '<div class="bar"><i style="width:' + Math.round(qi / qs.length * 100) + '%"></i></div>' +
        '<div class="card">' + (q.passage ? '<div class="pas">' + esc(q.passage) + '</div>' : "") +
        '<div class="qn">السؤال ' + (qi + 1) + ' من ' + qs.length + (q.act ? ' · ' + esc(q.act) : "") + '</div>' +
        (q.needs_figure ? '<div class="fig">🖼️ هذا السؤال مرتبط بشكلٍ في الملف الأصلي' + (q.figure_desc ? ': ' + esc(q.figure_desc) : "") + ' — افتح «ملف الناتج» لرؤيته.</div>' : "") +
        '<div class="qs">' + esc(q.q) + '</div>' + opts + '</div>' +
        '<div class="nav">' + (qi > 0 ? '<button class="p" id="nf-prev">→ السابق</button>' : "") + (qi < qs.length - 1 ? '<button class="n" id="nf-next">التالي ←</button>' : '<button class="s" id="nf-submit">سلّم إجاباتي ✅</button>') + '</div>';
      wrap.querySelectorAll(".opt").forEach(function (b) { b.onclick = function () { answers[qi] = +b.getAttribute("data-i"); draw(); }; });
      var f = wrap.querySelector("#nf-fill"); if (f) f.oninput = function () { answers[qi] = f.value; };
      var px = wrap.querySelector("#nf-prev"); if (px) px.onclick = function () { qi--; draw(); };
      var nx = wrap.querySelector("#nf-next"); if (nx) nx.onclick = function () { qi++; draw(); };
      var sb = wrap.querySelector("#nf-submit"); if (sb) sb.onclick = submit;
      wrap.querySelector("#nf-x").onclick = function () { if (confirm("تخرج من الاختبار؟ لن تُحفظ إجاباتك.")) close(); };
      wrap.scrollTop = 0;
    }
    var norm = function (s) { return String(s || "").replace(/[ً-ْـ]/g, "").replace(/^ال/, "").replace(/[أإآ]/g, "ا").replace(/ة$/, "ه").replace(/\s+/g, "").trim(); };
    function gradeAll() {
      var sc = 0, detail = [];
      qs.forEach(function (q, i) {
        var a2 = answers[i], ok;
        if (q.type === "fill") ok = a2 != null && norm(a2) === norm(q.ans_text || "") && norm(q.ans_text || "") !== "";
        else ok = a2 === q.ans;
        if (ok) sc++; detail.push({ ok: ok, right: q.type === "fill" ? (q.ans_text || "") : ((q.opts || [])[q.ans] || ""), q: q.q, a: a2 });
      });
      return { sc: sc, detail: detail };
    }
    function submit() {
      var missing = answers.filter(function (x) { return x == null || x === ""; }).length;
      if (missing && !confirm("بقي " + missing + " سؤالاً بلا إجابة — تسلّم الآن؟")) return;
      wrap.innerHTML = '<div class="res"><div class="big">⏳</div><p>جارِ التصحيح…</p></div>';
      var g = gradeAll(), now = Date.now();
      var ansArr = answers.map(function (x) { return x == null ? -1 : (typeof x === "string" ? x.slice(0, 60) : x); });
      var rec;
      var go = function () {
        if (PREV && (PREV.att || 1) >= TRIES) { rec = PREV; return Promise.resolve("max"); }
        if (PREV) { rec = Object.assign({}, PREV, { best: Math.max(PREV.best != null ? PREV.best : PREV.sc, g.sc), lsc: g.sc, att: Math.min(99, (PREV.att || 1) + 1), lts: now }); }
        else rec = { a: a, si: S.si, n: String(S.name || "").slice(0, 80), cid: S.cid, tid: "nafis", ans: ansArr, sc: g.sc, mx: qs.length, best: g.sc, lsc: g.sc, att: 1, ts: now };
        return ctx.db.doc("subs/" + docId).set(rec).then(function () { return "ok"; }).catch(function (e) { return "err:" + (e && e.code || e); });
      };
      ctx.db.doc("subs/" + docId).get().then(function (d) { PREV = d.exists ? (d.data() || null) : null; }).catch(function () { PREV = null; }).then(go).then(function (st) {
        var pct = Math.round(g.sc / qs.length * 100), face = pct >= 80 ? "🏆" : pct >= 50 ? "👍" : "💪";
        wrap.innerHTML = '<div class="res"><div class="big">' + face + '</div><h2>' + g.sc + ' من ' + qs.length + '</h2><p>' + (pct >= 80 ? "ممتاز يا صقر نافس!" : pct >= 50 ? "جيد — راجع ما أخطأت فيه وأعد المحاولة" : "شاهد الفيديو مرة أخرى ثم أعد المحاولة") + '</p>' +
          (st === "max" ? '<p>استُنفدت المحاولات الثلاث — درجتك المسجّلة ' + rec.sc + ' من ' + rec.mx + '</p>' : st === "ok" ? '<p>سُجّلت محاولتك رقم ' + (rec.att || 1) + (rec.att > 1 ? ' · درجتك المسجّلة عند معلمك ' + rec.sc + ' من ' + rec.mx + ' (المحاولة الأولى)، وأفضل نتيجة ' + rec.best : "") + '</p>' : '<p style="color:#b33">تعذّر حفظ النتيجة الآن 📡 — درجتك محسوبة لكن لم تُسجَّل: ' + esc(st) + '</p>') +
          '<div class="rv">' + g.detail.map(function (d, i) { return '<div class="it ' + (d.ok ? "ok" : "bad") + '"><b>' + (i + 1) + '.</b> ' + esc(d.q).slice(0, 160) + '<br>' + (d.ok ? "✅ صحيح" : "❌ الإجابة الصحيحة: " + esc(d.right)) + '</div>'; }).join("") + '</div>' +
          '<div class="nav"><button class="p" id="nf-close">إغلاق</button>' + (st === "ok" && (rec.att || 1) < TRIES ? '<button class="n" id="nf-again">↺ محاولة أخرى</button>' : "") + '</div></div>';
        wrap.querySelector("#nf-close").onclick = close;
        var ag = wrap.querySelector("#nf-again"); if (ag) ag.onclick = function () { qi = 0; answers = new Array(qs.length).fill(null); draw(); };
      });
    }
    draw();
  }
  /* ═══ تقدّم الطالب: تسليماته لكل ناتج (get لكل مستند — القائمة ممنوعة على الطالب) ═══ */
  function progress(ctx, gc, doms) {
    var jobs = [];
    doms.forEach(function (dom) { mediaItems(gc, dom).forEach(function (m) { var a = key(gc, dom, m.k); jobs.push(ctx.db.doc("subs/" + a + "_" + ctx.S.si).get().then(function (d) { return [a, d.exists ? d.data() : null]; }).catch(function () { return [a, null]; })); }); });
    return Promise.all(jobs).then(function (rows) { var o = {}; rows.forEach(function (r) { if (r[1]) o[r[0]] = r[1]; }); return o; });
  }
  /* ═══ الحاضنة للبوابة: كتل الأسبوع لكل مجالات الصف ═══ */
  function weekHtml(ctx, gc, doms, wk, term, subs) {
    var h = "";
    doms.forEach(function (dom) {
      forWeek(gc, dom, wk, term).forEach(function (k) { h += block(ctx, gc, dom, k, subs[key(gc, dom, k)]); });
    });
    return h;
  }
  /* ═══ لوحة النتائج (للمعلم والمدير والقائمين على صقور نافس) ═══ */
  function results(ctx, opts) {
    css();
    var db = ctx.db, classes = opts.classes || [];
    return db.collection("subs").where("tid", "==", "nafis").get().then(function (snap) {
      var rows = []; snap.forEach(function (d) { rows.push(d.data()); });
      var byC = {};
      rows.forEach(function (r) { (byC[r.cid] = byC[r.cid] || []).push(r); });
      var html = "";
      classes.forEach(function (c) {
        var gc = +c.gc; if (!(gc === 3 || gc === 6)) return;
        var list = byC[c.id] || [], doms = Object.keys((MEDIA.grades[String(gc)] || {}));
        var cols = [];
        doms.forEach(function (dom) { mediaItems(gc, dom).forEach(function (m) { var bi = bankItem(gc, dom, m.k); if (bi && graded(bi).length) cols.push({ a: key(gc, dom, m.k), t: DOMI[dom] + " " + (/المؤشر/.test(m.name) ? "م" : "ن") + (ordinal(m.name) || m.k + 1), full: m.name, dom: dom, k: m.k }); }); });
        var students = (c.students || []).map(function (s, i) { return { i: i, n: s && s.n, gone: !s || !s.n || s.moved || s.gap }; }).filter(function (s) { return !s.gone; });
        var bySi = {}; list.forEach(function (r) { (bySi[r.si] = bySi[r.si] || {})[r.a] = r; });
        var solved = list.length, avg = list.length ? Math.round(list.reduce(function (t, r) { return t + r.sc / r.mx; }, 0) / list.length * 100) : null;
        html += '<div class="nfr" style="margin-top:12px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px"><b>' + esc(c.name) + '</b><span style="font-size:12.5px;color:#6b7a8f">' + students.length + ' طالباً · ' + solved + ' تسليماً' + (avg != null ? ' · متوسط <bdi>' + avg + '%</bdi>' : "") + '</span></div>' +
          '<div style="overflow:auto;max-height:60vh;margin-top:6px"><table><tr><th>الطالب</th>' + cols.map(function (x) { return '<th title="' + esc(x.full || x.t) + '">' + esc(x.t) + '</th>'; }).join("") + '<th>المعدل</th></tr>' +
          students.map(function (s) {
            var r = bySi[s.i] || {}, tot = 0, n = 0;
            var cells = cols.map(function (x) { var q = r[x.a]; if (!q) return '<td><span class="p no">—</span></td>'; var p = Math.round(q.sc / q.mx * 100); tot += p; n++; return '<td><span class="p ' + (p >= 80 ? "hi" : p >= 50 ? "mid" : "lo") + '" title="' + q.sc + '/' + q.mx + ' · محاولات ' + (q.att || 1) + '"><bdi>' + p + '%</bdi></span></td>'; }).join("");
            return '<tr><td class="nm">' + esc(s.n) + '</td>' + cells + '<td>' + (n ? '<b><bdi>' + Math.round(tot / n) + '%</bdi></b>' : "—") + '</td></tr>';
          }).join("") + '</table></div></div>';
      });
      // أكثر الأسئلة خطأً (على مستوى المدرسة)
      var wrong = {};
      rows.forEach(function (r) {
        var p = r.a.match(/^nf(\d)([rms])(\d\d)$/); if (!p) return;
        var dom = { r: "read", m: "math", s: "sci" }[p[2]], bi = bankItem(+p[1], dom, +p[3]); if (!bi) return;
        var qs = graded(bi); (r.ans || []).forEach(function (a2, i) { var q = qs[i]; if (!q) return; var k2 = r.a + "#" + i; wrong[k2] = wrong[k2] || { q: q.q, n: 0, w: 0, t: p[1] + " " + DOMN[dom] + " · " + bi.name }; wrong[k2].n++; if (q.type === "fill" ? true : a2 !== q.ans) wrong[k2].w++; });
      });
      var top = Object.keys(wrong).map(function (k2) { return wrong[k2]; }).filter(function (x) { return x.n >= 3; }).sort(function (a2, b2) { return b2.w / b2.n - a2.w / a2.n; }).slice(0, 8);
      if (top.length) html += '<div class="nfr" style="margin-top:14px"><b>❗ أكثر الأسئلة خطأً</b>' + top.map(function (x) { return '<div style="font-size:13px;line-height:1.7;margin-top:6px;padding:8px;border-radius:10px;background:#fff4dd"><span style="color:#6b7a8f;font-size:12px">' + esc(x.t) + '</span><br>' + esc(x.q).slice(0, 140) + ' — <b><bdi>' + Math.round(x.w / x.n * 100) + '%</bdi></b> أخطؤوا (' + x.n + ')</div>'; }).join("") + '</div>';
      return { html: html || '<div class="empty-note">لا تسليمات بعد.</div>', n: rows.length };
    });
  }
  window.NAFIS = { load: load, grade: grade, items: items, mediaItems: mediaItems, mediaDom: mediaDom, key: key, forWeek: forWeek, bankItem: bankItem, graded: graded, block: block, bind: bind, weekHtml: weekHtml, progress: progress, quiz: quiz, results: results, tasksOf: tasksOf, DOMN: DOMN, DOMI: DOMI };
})();
