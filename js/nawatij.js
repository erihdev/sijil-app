/* نجوم المدرسة — نواتج التعلم المستهدفة (window.NAWATIJ)

   مصدر البيانات «منصة دعم نواتج التعلم 1448» للإدارة العامة للتعليم بمنطقة جازان: لكل أسبوعٍ
   في الصفين الثالث والسادس الابتدائي ناتجُ تعلّمٍ مستهدف في القراءة والرياضيات (والعلوم للسادس)
   ومعه فيديو واختبار ومهمة أدائية وعرض، ومنصةُ تعلّمٍ ذاتي لكل مجال، وخطةُ تدريبٍ للمعلمين،
   واختبارٌ تشخيصي في الأسبوع الأول. المنصة تُفتح بالرقم الإحصائي وتُغلق كل شيء خلف خمس نقرات؛
   هنا يصل الناتجُ إلى مكانه: عند المعلم في «درس هذا الأسبوع»، وعند الطالب المستهدف في «دروسي»،
   وعند المدير في لوحته — بلا دخولٍ ولا بحث.

   البيانات ملف ثابت data/nawatij.json (روابط عامة فقط، لا بيانات مدارس) يولّده tools/nawatij_build.py.
   يُحمَّل عند الحاجة فقط: لا شيء يُجلب لمعلمٍ لا يدرّس الصفين أو لطالبٍ خارجهما. */
(function () {
  "use strict";
  var DATA = null, P = null, CSS = false;
  var DOM_OF = { ar: "read", ma: "math", sc: "sci" };                    // كود مادة التطبيق → مجال المنصة
  var DOM_NAME = { read: "القراءة", math: "الرياضيات", sci: "العلوم" };
  var DOM_ICON = { read: "📖", math: "➗", sci: "🔬" };
  var RES = [["outcome", "🎯", "ناتج التعلم"], ["video", "▶️", "الفيديو"], ["quiz", "✅", "الاختبار"], ["tasks", "📋", "المهمة الأدائية"], ["enrich", "🖥️", "العرض"]];
  // جذر الموقع من مسار هذا الملف نفسه: index.html يحمّله من js/ والبوابة من ../js/
  var BASE = (function () { try { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/js\/nawatij\.js.*$/, "") : ""; } catch (e) { return ""; } })();
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function css() {
    if (CSS) return; CSS = true;
    var st = document.createElement("style");
    st.textContent = ".nw{margin-top:10px;border:1.5px dashed rgba(215,169,63,.55);border-radius:14px;padding:10px 12px;background:rgba(215,169,63,.06)}" +
      ".nw .nwh{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;color:var(--navy,#0E2033);flex-wrap:wrap}" +
      ".nw .nwh small{font-weight:700;color:var(--muted,#6b7a8f);font-size:12px}" +
      ".nw .nwi{margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,.07)}.nw .nwi:first-of-type{border-top:none;padding-top:0}" +
      ".nw .nwn{font-weight:800;font-size:14px;color:var(--navy,#0E2033);margin-bottom:6px}" +
      ".nw .nwb{display:flex;gap:6px;flex-wrap:wrap}" +
      ".nw .nwb a{display:inline-flex;align-items:center;gap:5px;text-decoration:none;font-weight:800;font-size:12.5px;padding:6px 10px;border-radius:999px;background:#fff;color:var(--navy,#0E2033);border:1.5px solid rgba(14,32,51,.14);line-height:1}" +
      ".nw .nwb a.g{background:var(--gold,#D7A93F);border-color:var(--gold,#D7A93F);color:#0E2033}" +
      ".nw .nwb a.s{background:rgba(76,211,168,.16);border-color:rgba(76,211,168,.5)}" +
      ".nw .nwf{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--muted,#6b7a8f)}" +
      ".nw .nwe{font-size:12.5px;color:var(--muted,#6b7a8f);padding:4px 0}";
    document.head.appendChild(st);
  }
  function load() {
    if (DATA) return Promise.resolve(DATA);
    if (P) return P;
    P = fetch(BASE + "data/nawatij.json?v=1").then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { DATA = d || null; return DATA; }).catch(function () { P = null; return null; });
    return P;
  }
  function domainOf(subject) {
    var s = String(subject || "");
    if (/عربية|لغتي|قراءة/.test(s)) return "read";
    if (/رياضيات/.test(s)) return "math";
    if (/علوم/.test(s)) return "sci";
    return "";
  }
  function grade(gc) { return (DATA && DATA.grades && DATA.grades[String(gc)]) || null; }
  function hasGrade(gc) { return !!grade(gc); }
  /* عناصر الأسبوع: الأسبوع رقمٌ في المنصة، و«ف2» لما يخصّ الفصل الثاني كله، و«غم» لغير المجدول */
  function items(gc, dom, wk, term) {
    var g = grade(gc); if (!g || !g.domains[dom]) return [];
    var key = term === "t2" ? "ف2" : +wk;
    return g.domains[dom].items.filter(function (it) { return it.w.indexOf(key) >= 0; });
  }
  function link(href, cls, txt) { return href ? '<a class="' + cls + '" href="' + esc(href) + '" target="_blank" rel="noopener">' + txt + '</a>' : ""; }
  function rowHtml(it) {
    var b = RES.map(function (r) { return link(it.res[r[0]], r[0] === "outcome" ? "g" : "", r[1] + " " + r[2]); }).join("");
    return '<div class="nwi"><div class="nwn">' + esc(it.name) + '</div><div class="nwb">' + b + '</div></div>';
  }
  /* كتلة مجالٍ واحد لأسبوعٍ واحد. opt.staff: يُظهر خطة تدريب المعلمين. opt.wkNow: لعنوان «هذا الأسبوع». */
  function block(gc, dom, wk, opt) {
    opt = opt || {}; css();
    var g = grade(gc); if (!g || !g.domains[dom]) return "";
    var d = g.domains[dom], list = items(gc, dom, wk, opt.term), h = "";
    var diag = wk === 1 ? (DATA.extras || []).filter(function (e) { return e.gc.indexOf(+gc) >= 0 && e.weeks.indexOf(1) >= 0; }) : [];
    if (!list.length && !diag.length && !opt.always) return "";
    h += '<div class="nw"><div class="nwh">' + DOM_ICON[dom] + ' نواتج التعلم — ' + esc(DOM_NAME[dom]) + ' <small>' + (opt.term === "t2" ? "الفصل الثاني" : "الأسبوع " + wk) + ' · الصف ' + (gc === 3 || gc === "3" ? "الثالث" : "السادس") + '</small></div>';
    diag.forEach(function (e) { h += '<div class="nwi"><div class="nwn">' + esc(e.name) + '</div><div class="nwe">' + esc(e.desc) + '</div><div class="nwb">' + link(e.url, "g", "✅ افتح الاختبار التشخيصي") + '</div></div>'; });
    if (list.length) list.forEach(function (it) { h += rowHtml(it); });
    else if (!diag.length) h += '<div class="nwe">لا ناتج مستهدف لهذا الأسبوع في هذا المجال.</div>';
    var foot = [];
    if (d.self) foot.push(link(d.self, "s", "🧭 منصة التعلم الذاتي — " + esc(DOM_NAME[dom])));
    if (opt.staff && d.training) foot.push(link(d.training, "", "🎓 خطة تدريب المعلمين"));
    if (foot.length) h += '<div class="nwf">' + foot.join("") + '</div>';
    h += '<div class="nwe" style="margin-top:6px">المصدر: منصة دعم نواتج التعلم ١٤٤٨ — تعليم جازان</div></div>';
    return h;
  }
  /* للمدير: كل مجالات الصف لأسبوعٍ واحد */
  function gradeHtml(gc, wk, opt) {
    var g = grade(gc); if (!g) return "";
    return Object.keys(g.domains).map(function (dom) { return block(gc, dom, wk, Object.assign({ always: true }, opt || {})); }).join("");
  }
  /* الأسابيع التي فيها نواتج لصفٍّ (لشريط الأسابيع) */
  function weeksOf(gc) {
    var g = grade(gc), set = {}; if (!g) return [];
    Object.keys(g.domains).forEach(function (dom) { g.domains[dom].items.forEach(function (it) { it.w.forEach(function (w) { if (+w) set[+w] = 1; }); }); });
    (DATA.extras || []).forEach(function (e) { if (e.gc.indexOf(+gc) >= 0) e.weeks.forEach(function (w) { set[w] = 1; }); });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }
  window.NAWATIJ = { load: load, domainOf: domainOf, hasGrade: hasGrade, grade: grade, items: items, block: block, gradeHtml: gradeHtml, weeksOf: weeksOf, DOM_OF: DOM_OF, DOM_NAME: DOM_NAME };
})();
