/* صقور نافس — «رحلة الإتقان»: محاكاة منصة التعلم الذاتي المركزية (تعليم جازان) داخل التطبيق.
   المسار نفسه: المادة ← ناتج التعلم ← المؤشر ← (١) الشرح ← (٢) التدريب بتحقق فوري ← (٣) اختبار الإتقان
   (مقفل حتى إكمال التدريب) ← نسبة الإنجاز ← الشهادة عند إتقان كل المؤشرات.
   المحتوى: نواتج المنصة ومؤشراتها وأسئلة ملفات النواتج الرسمية (data/nafis/bank_<صف>.json).
   الحفظ في subs (بلا مجموعات جديدة):
     nf<صف><مجال><ناتج>p_<si>   مستند تقدّم الناتج: best = قناع المؤشرات المُتقنة (لا ينقص)، lsc = قناع المؤشرات
                                 المكتمل تدريبها، att عدّاد التحديث (قاعدة subs: att يزيد وbest لا ينقص).
     nf<صف><مجال><ناتج>i<مؤشر>_<si>  محاولات اختبار المؤشر (محرك الاختبار نفسه: المحاولة الأولى ثابتة).
   يعتمد على window.NAFIS (البنك والوسائط ومحرك الاختبار). */
(function () {
  "use strict";
  var F = window.NAFIS; if (!F) return;
  var esc = F.esc, TRAIN_N = 5, TEST_N = 5, MASTER = 0.8, CACHE_MS = 10 * 60 * 1000;
  var AR = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];
  var STATE = { screen: "dash", dom: null, k: null, i: null, stage: null, ctx: null, gc: null, root: null, prog: {}, cacheTs: 0, model: null };
  var CSS = false;
  function css() {
    if (CSS) return; CSS = true; F.css();
    var st = document.createElement("style");
    st.textContent =
      ".nj{margin-top:8px}.nj .njc{background:#fff;border:1.5px solid rgba(14,32,51,.1);border-radius:16px;padding:12px;margin-top:10px;box-shadow:0 4px 14px rgba(14,32,51,.05)}" +
      ".nj .njc.click{cursor:pointer}.nj .njc.click:active{transform:scale(.99)}" +
      ".nj .njh{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.nj .njh b{font-size:15px;color:#0E2033}" +
      ".nj .pill{display:inline-block;border-radius:999px;padding:3px 10px;font-size:11.5px;font-weight:800;background:#eef1f5;color:#4a5a70}.nj .pill.go{background:#fff4dd;color:#8a5a00}.nj .pill.ok{background:#e3f7ee;color:#0b6b46}" +
      ".nj .bar{height:8px;border-radius:999px;background:#eef1f5;overflow:hidden;margin-top:8px}.nj .bar i{display:block;height:100%;background:linear-gradient(90deg,#D7A93F,#F2CC6B);border-radius:999px}" +
      ".nj .meta{font-size:12.5px;color:#6b7a8f;margin-top:6px;line-height:1.7}.nj .t{font-weight:800;font-size:14px;color:#0E2033;line-height:1.7;margin-top:6px}" +
      ".nj .back{border:0;background:#eef1f5;border-radius:999px;padding:6px 12px;font:inherit;font-weight:800;color:#0E2033;margin-bottom:4px}" +
      ".nj .big{font-size:30px;font-weight:900;color:#0E2033;line-height:1.2}.nj .cert{background:linear-gradient(150deg,#0E2033,#16304D);color:#fff;border:none;text-align:center}.nj .cert.on{background:linear-gradient(150deg,#7a5300,#D7A93F)}" +
      ".nj .steps{display:flex;gap:6px;margin-top:10px}.nj .steps div{flex:1;border-radius:12px;padding:8px 6px;text-align:center;font-size:12px;font-weight:800;background:#eef1f5;color:#6b7a8f;line-height:1.5}.nj .steps div.on{background:#0E2033;color:#F2CC6B}.nj .steps div.done{background:#e3f7ee;color:#0b6b46}.nj .steps div.lock{opacity:.6}" +
      ".nj .ib{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.nj .ib button{border:1.5px solid rgba(14,32,51,.12);background:#fff;border-radius:12px;padding:8px 12px;font:inherit;font-weight:800;color:#0E2033;cursor:pointer}.nj .ib button.g{background:#0E2033;color:#F2CC6B;border-color:#0E2033}.nj .ib button.lock{opacity:.5}.nj .ib button.done{background:#e3f7ee;border-color:#9ad9bd;color:#0b6b46}" +
      ".nj .expl{background:#f6f1e4;border-radius:12px;padding:10px 12px;margin-top:8px;font-size:14px;line-height:1.9;color:#0E2033;white-space:pre-wrap}.nj .lbl{font-size:12px;font-weight:800;color:#8a5a00;margin-top:10px}" +
      ".nj .q{font-size:16px;font-weight:800;color:#0E2033;line-height:1.8;margin-top:8px}.nj .pas{background:#f6f1e4;border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.9;margin-top:8px;white-space:pre-wrap}" +
      ".nj .opt{display:flex;align-items:center;gap:10px;width:100%;text-align:start;border:1.5px solid rgba(14,32,51,.12);background:#fff;border-radius:14px;padding:10px 12px;margin-top:8px;font:inherit;font-size:15px;color:#0E2033;cursor:pointer}.nj .opt b{min-width:30px;height:30px;border-radius:999px;background:#eef1f5;display:inline-flex;align-items:center;justify-content:center}.nj .opt.on{border-color:#D7A93F;background:#fff9ea}.nj .opt.ok{border-color:#2fb37f;background:#e3f7ee}.nj .opt.bad{border-color:#e0524f;background:#fde8e8}" +
      ".nj .fb{margin-top:10px;border-radius:12px;padding:10px 12px;font-weight:800;font-size:14px}.nj .fb.ok{background:#e3f7ee;color:#0b6b46}.nj .fb.bad{background:#fde8e8;color:#8f1d1b}" +
      ".nj .act{width:100%;border:0;border-radius:14px;padding:13px;font:inherit;font-weight:900;font-size:16px;background:#0E2033;color:#F2CC6B;margin-top:10px;cursor:pointer}.nj .act[disabled]{opacity:.5}.nj .act.soft{background:#eef1f5;color:#0E2033}" +
      ".nj .cnt{font-size:12.5px;color:#6b7a8f;display:flex;justify-content:space-between;margin-top:6px}";
    document.head.appendChild(st);
  }
  /* ═══ النموذج: مواد ← نواتج ← مؤشرات (بأسئلتها) ═══ */
  function norm(s) { return String(s || "").replace(/[ًٌٍَُِّْـ]/g, "").replace(/\s+/g, " ").trim(); }
  function indNo(act) { var m = norm(act).match(/المؤشر\s*[\(]?\s*([٠-٩0-9]+)/); return m ? +m[1].replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }) : 0; }
  /* محتوى المنصة المسحوب (spz_<صف>.json): {subjects:[{dom,name,outcomes:[{n,title,domain,inds:[{code,label,text,explain,q:[{q,type,opts,ans}]}]}]}]} */
  var SPZ = {};
  function loadSpz(gc) {
    if (SPZ[gc] !== undefined) return Promise.resolve(SPZ[gc]);
    return F.fetchJson("data/nafis/spz_" + gc + ".json?v=1").then(function (d) { SPZ[gc] = d || null; return SPZ[gc]; });   // المسار نسبي لجذر التطبيق (BASE في nafis.js)
  }
  function mediaByOrdinal(gc, dom, n) { return F.mediaItems(gc, dom).filter(function (m) { return F.ordinal(m.name) === n; })[0] || null; }
  function buildFromSpz(gc, spz) {
    var subjects = [];
    spz.subjects.forEach(function (S) {
      var dom = S.dom, subj = { dom: dom, name: F.DOMN[dom] || S.name, icon: F.DOMI[dom] || "📚", outcomes: [] };
      S.outcomes.forEach(function (O) {
        var k = O.n - 1, om = dom === "read" ? null : mediaByOrdinal(gc, dom, O.n), inds = [];
        O.inds.forEach(function (I, ti) {
          var codeN = parseInt(String(I.code).split("-").pop(), 10) || (ti + 1);
          var media = dom === "read" ? mediaByOrdinal(gc, dom, parseInt(I.code, 10) || 0) : om;
          inds.push({ k: k, ok: k, i: ti, code: I.code || String(ti + 1), label: I.label || ("المؤشر " + codeN), text: I.text, explain: I.explain || "", media: media || {},
            qs: (I.q || []).filter(function (q) { return q.ans != null; }).map(function (q) { return { q: q.q, type: "mcq", opts: q.opts, ans: q.ans, act: I.label || "", passage: "", needs_figure: false, figure_desc: "" }; }) });
        });
        subj.outcomes.push({ k: k, number: O.n, title: O.title, domain: O.domain, inds: inds, media: om });
      });
      subjects.push(subj);
    });
    return { gc: gc, subjects: subjects, src: "spz" };
  }
  function buildModel(gc) {
    if (SPZ[gc]) return buildFromSpz(gc, SPZ[gc]);
    var subjects = [];
    ["read", "math", "sci"].forEach(function (dom) {
      var items = F.mediaItems(gc, dom); if (!items.length) return;
      var subj = { dom: dom, name: F.DOMN[dom], icon: F.DOMI[dom], outcomes: [] };
      if (dom === "read") {
        // كل عنصر في المنصة مؤشرٌ («المؤشر الأول»…)؛ الناتج هو نص outcome في ملفه — نجمع المؤشرات تحته
        var groups = [], byKey = {};
        items.slice().sort(function (a, b) { return (F.ordinal(a.name) || 99) - (F.ordinal(b.name) || 99); }).forEach(function (it) {
          // مفتاح التجميع: أول كلمتين من نص الناتج بعد التطبيع (ملفات المؤشرات تكتب الناتج بصياغات وتشكيل مختلف)
          var bi = F.bankItem(gc, dom, it.k), oname = norm(bi && bi.outcome).replace(/[أإآ]/g, "ا").replace(/[،,:؛.()]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 2).join(" ") || ("المؤشر " + (F.ordinal(it.name) || it.k + 1));
          var g = byKey[oname]; if (!g) { g = byKey[oname] = { title: (bi && bi.outcome) || it.name, inds: [], k: it.k }; groups.push(g); }
          g.inds.push({ k: it.k, code: F.ordinal(it.name) || it.k + 1, text: (bi && bi.indicators && bi.indicators[0]) || it.name, qs: F.graded(bi), media: it });
        });
        groups.forEach(function (g, gi) { subj.outcomes.push({ k: g.k, number: gi + 1, title: g.title, inds: g.inds.map(function (x, xi) { x.i = xi; x.ok = g.k; return x; }) }); });
      } else {
        items.slice().sort(function (a, b) { return (F.ordinal(a.name) || 99) - (F.ordinal(b.name) || 99); }).forEach(function (it) {
          var bi = F.bankItem(gc, dom, it.k), qs = F.graded(bi), texts = (bi && bi.indicators && bi.indicators.length) ? bi.indicators : [it.name], inds = [];
          texts.forEach(function (t, ti) { inds.push({ k: it.k, ok: it.k, i: ti, code: ti + 1, text: t, qs: [], media: it }); });
          qs.forEach(function (q) { var n = indNo(q.act); var tgt = (n >= 1 && n <= inds.length) ? inds[n - 1] : inds[0]; tgt.qs.push(q); });
          subj.outcomes.push({ k: it.k, number: F.ordinal(it.name) || it.k + 1, title: (bi && bi.outcome) || it.name, inds: inds });
        });
      }
      subjects.push(subj);
    });
    return { gc: gc, subjects: subjects };
  }
  function allInds(model) { var out = []; model.subjects.forEach(function (s) { s.outcomes.forEach(function (o) { o.inds.forEach(function (x) { out.push({ s: s, o: o, x: x }); }); }); }); return out; }
  /* ═══ التقدّم: مستند لكل ناتج (قناعان) + ذاكرة محلية ═══ */
  function pkey(gc, dom, k) { return F.key(gc, dom, k) + "p"; }
  function ikey(gc, dom, k, i) { return F.key(gc, dom, k) + "i" + i; }
  function lsKey() { return "nfj." + (window.SIJIL_SPACE || "") + "." + STATE.ctx.S.cid + "." + STATE.ctx.S.si; }
  function loadCache() { try { var o = JSON.parse(localStorage.getItem(lsKey()) || "null"); if (o && o.prog) { STATE.prog = o.prog; STATE.cacheTs = o.ts || 0; } } catch (e) { } }
  function saveCache() { try { localStorage.setItem(lsKey(), JSON.stringify({ prog: STATE.prog, ts: STATE.cacheTs })); } catch (e) { } }
  function refresh(force) {
    var ctx = STATE.ctx, gc = STATE.gc, model = STATE.model;
    if (!force && Date.now() - STATE.cacheTs < CACHE_MS) return Promise.resolve();
    var jobs = [];
    model.subjects.forEach(function (s) { s.outcomes.forEach(function (o) {
      var a = pkey(gc, s.dom, o.k);
      jobs.push(ctx.db.doc("subs/" + a + "_" + (ctx.S.mk || ctx.S.si)).get().then(function (d) { STATE.prog[a] = d.exists ? d.data() : null; }).catch(function () { }));
    }); });
    return Promise.all(jobs).then(function () { STATE.cacheTs = Date.now(); saveCache(); });
  }
  function bit(mask, i) { return !!(Math.floor((mask || 0) / Math.pow(2, i)) % 2); }
  function setBit(mask, i) { return bit(mask, i) ? (mask || 0) : (mask || 0) + Math.pow(2, i); }
  function mastered(s, o, x) { var p = STATE.prog[pkey(STATE.gc, s.dom, o.k)]; return !!(p && bit(p.best, x.i)); }
  function trained(s, o, x) { var p = STATE.prog[pkey(STATE.gc, s.dom, o.k)]; return !!(p && bit(p.lsc, x.i)); }
  function markProg(s, o, x, field) {
    var ctx = STATE.ctx, a = pkey(STATE.gc, s.dom, o.k), ref = ctx.db.doc("subs/" + a + "_" + (ctx.S.mk || ctx.S.si));
    return ref.get().then(function (d) {
      var prev = d.exists ? d.data() : null, rec;
      if (prev) { rec = Object.assign({}, prev, { att: (prev.att || 1) + 1, lts: Date.now() }); rec[field] = setBit(prev[field], x.i); if (rec.best < (prev.best || 0)) rec.best = prev.best; }
      else { rec = { a: a, si: ctx.S.si, n: String(ctx.S.name || "").slice(0, 80), cid: ctx.S.cid, tid: "nafis", ans: [], sc: 0, mx: o.inds.length, best: 0, lsc: 0, att: 1, ts: Date.now() }; rec[field] = setBit(0, x.i); }
      return ref.set(rec).then(function () { STATE.prog[a] = rec; saveCache(); return true; });
    }).catch(function () { return false; });
  }
  /* ═══ الشاشات ═══ */
  function stats(model) {
    var tot = 0, ok = 0; allInds(model).forEach(function (r) { if (r.x.qs.length) { tot++; if (mastered(r.s, r.o, r.x)) ok++; } });
    return { tot: tot, ok: ok, pct: tot ? Math.round(ok / tot * 100) : 0 };
  }
  function subjStats(s) { var tot = 0, ok = 0, co = 0, ip = 0; s.outcomes.forEach(function (o) { var t = 0, k = 0; o.inds.forEach(function (x) { if (x.qs.length) { t++; tot++; if (mastered(s, o, x)) { k++; ok++; } } }); if (t && k === t) co++; else if (k) ip++; }); return { tot: tot, ok: ok, pct: tot ? Math.round(ok / tot * 100) : 0, done: co, ip: ip }; }
  function statusPill(pct, started) { return pct >= 100 ? '<span class="pill ok">مكتمل</span>' : (pct > 0 || started) ? '<span class="pill go">قيد التقدم</span>' : '<span class="pill">لم يبدأ</span>'; }
  function dash() {
    var m = STATE.model, S = STATE.ctx.S, st = stats(m), first = String(S.first || S.name || "").split(" ")[0];
    var h = F.diagHtml(STATE.ctx, STATE.gc, STATE.diag) + '<div class="njc"><div class="njh"><b>مرحباً ' + esc(first) + ' 👋</b><span class="pill">' + esc(S.cname || "") + '</span></div>' +
      '<div class="meta">نسبة الإنجاز الإجمالية</div><div class="big"><bdi>' + st.pct + '%</bdi></div><div class="bar"><i style="width:' + st.pct + '%"></i></div>' +
      '<div class="meta">' + st.ok + ' مؤشر مُجتاز من ' + st.tot + ' مؤشراً</div></div>' +
      '<div class="njc cert' + (st.tot && st.ok === st.tot ? " on click" : "") + '" data-go="cert"><div style="font-size:30px">🎓</div><div class="t" style="color:#fff">شهادتك</div><div class="meta" style="color:#e8e0c8">' + (st.tot && st.ok === st.tot ? "أتقنت جميع المؤشرات — اضغط لعرض الشهادة" : "تُفتح بعد إتقان جميع المؤشرات") + '</div></div>' +
      '<div class="lbl">موادك الدراسية</div>';
    m.subjects.forEach(function (s) {
      var ss = subjStats(s);
      h += '<div class="njc click" data-go="subj" data-dom="' + s.dom + '"><div class="njh"><b>' + s.icon + ' ' + esc(s.name) + '</b>' + statusPill(ss.pct, ss.ip > 0) + '</div>' +
        '<div class="meta">' + s.outcomes.length + ' ناتج تعلم · ' + ss.done + ' مكتمل · ' + ss.ok + '/' + ss.tot + ' مؤشر</div><div class="bar"><i style="width:' + ss.pct + '%"></i></div><div class="meta"><bdi>' + ss.pct + '%</bdi></div></div>';
    });
    return h;
  }
  function subj() {
    var s = curSubj(), h = '<button class="back" data-go="dash">→ لوحة الطالب</button><div class="t">' + s.icon + ' ' + esc(s.name) + ' <small style="color:#6b7a8f;font-weight:700">— نواتج التعلم والمؤشرات</small></div>';
    s.outcomes.forEach(function (o) {
      var t = 0, k = 0, nq = 0, started = false; o.inds.forEach(function (x) { if (x.qs.length) { t++; nq += Math.min(TRAIN_N, x.qs.length); if (mastered(s, o, x)) k++; if (trained(s, o, x)) started = true; } });
      var pct = t ? Math.round(k / t * 100) : 0;
      h += '<div class="njc click" data-go="out" data-k="' + o.k + '"><div class="njh"><b>ناتج ' + o.number + '</b>' + statusPill(pct, started) + '</div><div class="t">' + esc(o.title) + '</div>' +
        '<div class="meta">' + k + '/' + t + ' مؤشر مُجتاز · ' + nq + ' سؤال' + (t ? "" : " · لم تُنقل أسئلته بعد") + '</div><div class="bar"><i style="width:' + pct + '%"></i></div></div>';
    });
    return h;
  }
  function out() {
    var s = curSubj(), o = curOut(), h = '<button class="back" data-go="subj">→ ' + esc(s.name) + '</button><div class="njc"><div class="njh"><b>ناتج ' + o.number + '</b><span class="pill">' + (o.domain ? esc(o.domain) + ' · ' : '') + s.icon + ' ' + esc(s.name) + '</span></div><div class="t">' + esc(o.title) + '</div></div>';
    o.inds.forEach(function (x) {
      var mk = mastered(s, o, x), tr = trained(s, o, x), n = Math.min(TRAIN_N, x.qs.length);
      h += '<div class="njc"><div class="njh"><b>' + esc(x.label || ("المؤشر " + x.code)) + '</b>' + (mk ? '<span class="pill ok">مُتقَن</span>' : tr ? '<span class="pill go">جاهز للاختبار</span>' : '<span class="pill">لم يبدأ</span>') + '</div><div class="t">' + esc(x.text) + '</div>' +
        '<div class="ib"><button data-go="ind" data-i="' + x.i + '" data-stage="expl">📘 شرح</button>' +
        (n ? '<button data-go="ind" data-i="' + x.i + '" data-stage="train" class="' + (tr ? "done" : "g") + '">✍️ تدريب (' + n + ')</button><button data-go="ind" data-i="' + x.i + '" data-stage="test" class="' + (mk ? "done" : tr ? "g" : "lock") + '">🏁 اختبار' + (tr ? "" : " <small>بعد إكمال التدريب</small>") + '</button>' : '<button class="lock" disabled>✍️ لا أسئلة منقولة بعد</button>') +
        '</div><div class="meta">المرحلة: ' + (mk ? "مُتقَن ✅" : tr ? "التدريب مكتمل — الاختبار متاح" : "لم تبدأ") + '</div></div>';
    });
    return h;
  }
  function stepper(stage, tr, mk) {
    return '<div class="steps"><div class="' + (stage === "expl" ? "on" : "done") + '">الشرح<br><small>المرحلة 1</small></div><div class="' + (stage === "train" ? "on" : tr ? "done" : "") + '">التدريب<br><small>المرحلة 2</small></div><div class="' + (stage === "test" ? "on" : mk ? "done" : tr ? "" : "lock") + '">الاختبار<br><small>' + (tr ? "المرحلة 3" : "مقفلة حتى إكمال التدريب") + '</small></div></div>';
  }
  function explanation(s, o, x) {
    if (x.explain) return esc(x.explain);
    var bi = F.bankItem(STATE.gc, s.dom, o.k), ex = bi && bi.explain && bi.explain[x.i];
    if (ex) return esc(ex);
    return 'في هذا المؤشر ستتدرّب على: ' + esc(x.text) + '\n• الخطوة الأولى: اقرأ المؤشر جيداً وافهم ما المطلوب منك بالضبط.\n• الخطوة الثانية: راجع درسك في الكتاب المدرسي وشاهد فيديو الناتج.\n• الخطوة الثالثة: حُلّ أسئلة التدريب وتحقق من كل إجابة قبل الانتقال.\nانتبه: لا تدخل الاختبار قبل أن تكون واثقاً من فهمك للمؤشر.';
  }
  function ind() {
    var s = curSubj(), o = curOut(), x = o.inds[STATE.i], tr = trained(s, o, x), mk = mastered(s, o, x), stage = STATE.stage || "expl";
    if (stage === "test" && !tr) stage = STATE.stage = "expl";
    var h = '<button class="back" data-go="out">→ نواتج التعلم</button><div class="njc"><div class="njh"><b>' + esc(x.label || ("المؤشر " + x.code)) + '</b>' + (mk ? '<span class="pill ok">مُتقَن</span>' : "") + '</div><div class="t">' + esc(x.text) + '</div><div class="meta">' + esc(s.name) + ' — ' + esc(o.title) + '</div>' + stepper(stage, tr, mk) + '</div>';
    if (stage === "expl") {
      var m = x.media || {}, vid = F.embedUrl(m.video);
      h += '<div class="njc"><div class="lbl">ناتج التعلم ' + o.number + '</div><div class="t">' + esc(o.title) + '</div><div class="lbl">المؤشر المطلوب إتقانه</div><div class="t">' + esc(x.text) + '</div>' +
        '<div class="lbl">شرح مبسّط لهذه المهارة</div><div class="expl">' + explanation(s, o, x) + '</div>' +
        '<div class="ib">' + (vid ? '<button data-act="video">▶️ فيديو الناتج</button>' : "") + (m.doc ? '<button data-act="doc">📖 ملف الناتج</button>' : "") + '</div><div class="nfx"></div>' +
        '<div class="meta">قبل أن تبدأ: راجع درسك في الكتاب المدرسي المرتبط بهذا المؤشر، ثم انتقل إلى التدريب للتأكد من فهمك، وبعد إكمال التدريب يمكنك دخول اختبار الإتقان (' + Math.min(TEST_N, x.qs.length) + ' أسئلة اختيار من متعدد).</div>' +
        (x.qs.length ? '<button class="act" data-go="ind" data-i="' + x.i + '" data-stage="train">انتقل إلى التدريب</button>' : '<div class="meta">لم تُنقل أسئلة هذا المؤشر بعد.</div>') + '</div>';
    } else if (stage === "train") h += '<div class="njc" id="nj-train"></div>';
    else if (stage === "test") {
      h += '<div class="njc"><div class="t">اختبار الإتقان — ' + Math.min(TEST_N, x.qs.length) + ' أسئلة اختيار من متعدد</div><div class="meta">الإتقان عند ' + Math.round(MASTER * 100) + '٪ فأكثر. تُسجَّل محاولتك الأولى لدى معلمك، ولك ثلاث محاولات.</div>' +
        (mk ? '<div class="fb ok">✅ أتقنت هذا المؤشر</div>' : "") + '<button class="act" id="nj-test">ابدأ الاختبار</button></div>';
    }
    return h;
  }
  function cert() {
    var S = STATE.ctx.S, st = stats(STATE.model), d = new Date(), code = (S.cid + "-" + S.si + "-" + STATE.gc + "-" + st.ok).toUpperCase();
    return '<button class="back" data-go="dash">→ لوحة الطالب</button><div class="njc cert on" style="padding:22px 14px"><div style="font-size:44px">🎓</div><div class="big" style="color:#fff;font-size:22px">شهادة إتقان نواتج التعلم</div>' +
      '<div class="meta" style="color:#fff8e6;font-size:14px;margin-top:10px">تشهد إدارة المدرسة بأن الطالب</div><div class="big" style="color:#fff;font-size:24px">' + esc(S.name || "") + '</div>' +
      '<div class="meta" style="color:#fff8e6;font-size:14px">' + esc(S.cname || "") + ' · الصف ' + (STATE.gc === 3 ? "الثالث" : "السادس") + ' الابتدائي</div>' +
      '<div class="meta" style="color:#fff8e6;font-size:14px;margin-top:8px">أتقن جميع مؤشرات نواتج التعلم المستهدفة (' + st.ok + ' مؤشراً) في برنامج صقور نافس</div>' +
      '<div class="meta" style="color:#fff8e6;font-size:12px;margin-top:10px">' + d.toLocaleDateString("ar-SA") + ' · رمز التحقق ' + esc(code) + '</div></div>' +
      '<button class="act soft" onclick="window.print()">🖨️ طباعة الشهادة</button>';
  }
  /* ═══ التدريب: سؤال سؤال بتحقق فوري ═══ */
  function train(box) {
    var s = curSubj(), o = curOut(), x = o.inds[STATE.i], qs = x.qs.slice(0, TRAIN_N), qi = 0, right = 0, picked = null, checked = false;
    // إعادة الرسم (رسالة وصلت، أو تحميل التقدّم) لا تُعيد التدريب إلى السؤال الأول
    var tkey = s.dom + "|" + o.k + "|" + x.i, T = STATE.train || (STATE.train = {});
    if (T.key === tkey && T.qi < qs.length) { qi = T.qi; right = T.right; } else { T.key = tkey; T.qi = 0; T.right = 0; }
    var remember = function () { T.qi = qi; T.right = right; };
    var LETTER = ["أ", "ب", "ج", "د", "هـ", "و"];
    function draw() {
      var q = qs[qi];
      box.innerHTML = '<div class="cnt"><span>سؤال ' + (qi + 1) + ' من ' + qs.length + '</span><span>' + right + ' صحيحة</span></div>' +
        (q.passage ? '<div class="pas">' + esc(q.passage) + '</div>' : "") + (q.needs_figure ? '<div class="meta">🖼️ هذا السؤال مرتبط بشكلٍ في ملف الناتج' + (q.figure_desc ? ': ' + esc(q.figure_desc) : "") + '</div>' : "") +
        '<div class="q">' + esc(q.q) + '</div>' +
        (q.type === "fill" ? '<input class="fill" id="nj-fill" placeholder="اكتب الإجابة" style="width:100%;box-sizing:border-box;border:1.5px solid rgba(14,32,51,.15);border-radius:12px;padding:10px;font:inherit;margin-top:8px">' :
          (q.opts || []).map(function (op, i) { return '<button class="opt" data-i="' + i + '"><b>' + LETTER[i] + '</b><span>' + esc(op) + '</span></button>'; }).join("")) +
        '<div id="nj-fb"></div><button class="act" id="nj-check" disabled>تحقق من الإجابة</button>';
      box.querySelectorAll(".opt").forEach(function (b) { b.onclick = function () { if (checked) return; picked = +b.getAttribute("data-i"); box.querySelectorAll(".opt").forEach(function (z) { z.classList.remove("on"); }); b.classList.add("on"); box.querySelector("#nj-check").disabled = false; }; });
      var f = box.querySelector("#nj-fill"); if (f) f.oninput = function () { picked = f.value; box.querySelector("#nj-check").disabled = !f.value.trim(); };
      box.querySelector("#nj-check").onclick = check;
    }
    var nz = function (v) { return String(v || "").replace(/[ً-ْـ]/g, "").replace(/^ال/, "").replace(/[أإآ]/g, "ا").replace(/ة$/, "ه").replace(/\s+/g, "").trim(); };
    function check() {
      if (checked) return next();
      var q = qs[qi], ok = q.type === "fill" ? !!(nz(picked) === nz(q.ans_text) && nz(q.ans_text)) : picked === q.ans; checked = true; if (ok) right++; remember();
      box.querySelectorAll(".opt").forEach(function (z) { var i = +z.getAttribute("data-i"); if (i === q.ans) z.classList.add("ok"); else if (i === picked && !ok) z.classList.add("bad"); });
      box.querySelector("#nj-fb").innerHTML = ok ? '<div class="fb ok">✅ إجابة صحيحة! أحسنت</div>' : '<div class="fb bad">❌ إجابة غير صحيحة — الإجابة الصحيحة: ' + esc(q.type === "fill" ? q.ans_text : LETTER[q.ans] + " · " + (q.opts || [])[q.ans]) + '</div>';
      box.querySelector(".cnt span:last-child").textContent = right + " صحيحة";
      var b = box.querySelector("#nj-check"); b.textContent = qi < qs.length - 1 ? "السؤال التالي" : "إنهاء التدريب"; b.disabled = false;
    }
    function next() {
      if (qi < qs.length - 1) { qi++; picked = null; checked = false; remember(); draw(); return; }
      T.qi = qs.length; T.right = right;
      box.innerHTML = '<div class="fb ok">🎉 أكملت التدريب — أجبت ' + right + ' من ' + qs.length + ' إجابة صحيحة</div><div class="meta">يمكنك الآن دخول اختبار الإتقان.</div><button class="act" id="nj-go" disabled>جارِ الحفظ…</button>';
      var saveTrain = function () {
        var b0 = box.querySelector("#nj-go"); if (b0) { b0.disabled = true; b0.textContent = "جارِ الحفظ…"; }
        markProg(s, o, x, "lsc").then(function (ok) {
          var b = box.querySelector("#nj-go"); if (!b) return;
          b.disabled = false;
          if (ok) { b.textContent = "انتقل إلى الاختبار"; b.onclick = function () { STATE.stage = "test"; render(); }; }
          else { b.textContent = "↻ لم يُحفظ — أعد المحاولة"; b.onclick = saveTrain; }
        });
      };
      saveTrain();
    }
    draw();
  }
  function startTest() {
    var s = curSubj(), o = curOut(), x = o.inds[STATE.i], qs = x.qs.slice(0, TEST_N);
    F.quiz(Object.assign({}, STATE.ctx, { onDone: function () { render(); } }), STATE.gc, s.dom, o.k, {
      qs: qs, a: ikey(STATE.gc, s.dom, o.k, x.i), title: (x.label || ("المؤشر " + x.code)) + " — " + s.name, tries: 99, tid: "nafisi",
      onResult: function (rec, st, g) { if (g && qs.length && g.sc / qs.length >= MASTER) markProg(s, o, x, "best"); }
    });
  }
  /* ═══ التوجيه والعرض ═══ */
  function curSubj() { return STATE.model.subjects.filter(function (s) { return s.dom === STATE.dom; })[0] || STATE.model.subjects[0]; }
  function curOut() { var s = curSubj(); return s.outcomes.filter(function (o) { return o.k === STATE.k; })[0] || s.outcomes[0]; }
  function render() {
    css();
    var root = STATE.root; if (!root) return;
    var sc = STATE.screen, h = sc === "subj" ? subj() : sc === "out" ? out() : sc === "ind" ? ind() : sc === "cert" ? cert() : dash();
    root.innerHTML = '<div class="nj">' + h + '</div>';
    root.querySelectorAll("[data-go]").forEach(function (b) {
      b.onclick = function (e) {
        if (e.target && e.target.closest && e.target.closest("[data-act]")) return;
        var go = b.getAttribute("data-go");
        if (go === "cert" && !(stats(STATE.model).tot && stats(STATE.model).ok === stats(STATE.model).tot)) return;
        if (b.getAttribute("data-dom")) STATE.dom = b.getAttribute("data-dom");
        if (b.getAttribute("data-k") != null) STATE.k = +b.getAttribute("data-k");
        if (b.getAttribute("data-i") != null) STATE.i = +b.getAttribute("data-i");
        if (b.getAttribute("data-stage")) STATE.stage = b.getAttribute("data-stage"); else if (go !== "ind") STATE.stage = null;
        if (b.classList.contains("lock")) return;
        STATE.screen = go; render(); try { root.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (err) { }
      };
    });
    F.bind(root, Object.assign({}, STATE.ctx, { onDone: function () { loadDiag().then(render); } }));   // بطاقة التشخيصي
    var tb = root.querySelector("#nj-train"); if (tb) train(tb);
    var tt = root.querySelector("#nj-test"); if (tt) tt.onclick = startTest;
    // الفيديو وملف الناتج داخل شاشة الشرح
    var s = STATE.screen === "ind" && curSubj(), o = s && curOut(), x = o && o.inds[STATE.i];
    root.querySelectorAll("[data-act]").forEach(function (b) {
      if (b.closest(".nf")) return;   // أزرار بطاقة التشخيصي ربطها F.bind — كانت تُستبدل هنا فيموت زر الاختبار
      b.onclick = function () {
        var act = b.getAttribute("data-act"), xb = root.querySelector(".nfx"), m = (x && x.media) || {};
        if (act === "video") xb.innerHTML = F.viewer(F.embedUrl(m.video));
        if (act === "doc") xb.innerHTML = F.viewer("https://drive.google.com/file/d/" + m.doc + "/preview");
        if (act === "close") xb.innerHTML = "";
        var c = xb.querySelector("[data-act=close]"); if (c) c.onclick = function () { xb.innerHTML = ""; };
      };
    });
  }
  /* ═══ الواجهة العامة ═══ */
  function loadDiag() {
    var ctx = STATE.ctx, gc = STATE.gc; if (!F.graded(F.bankItem(gc, "diag", 0)).length) return Promise.resolve();
    return ctx.db.doc("subs/" + F.key(gc, "diag", 0) + "_" + (ctx.S.mk || ctx.S.si)).get().then(function (d) { STATE.diag = d.exists ? d.data() : null; }).catch(function () { });
  }
  function open(ctx, gc, root) {
    STATE.ctx = ctx; STATE.gc = gc; STATE.root = root;
    return loadSpz(gc).then(function () {
      STATE.model = buildModel(gc); loadCache(); render();
      return Promise.all([refresh(false), loadDiag()]).then(function () { render(); });
    });
  }
  /* ملخّص لِلوحة النتائج: عدد المؤشرات المُتقنة لكل طالب من مستندات التقدّم */
  function summarize(rows, gc) {
    var model = buildModel(gc), tot = 0;   // مع محتوى المنصة إن كان محمّلاً (loadSpz) وإلا بنك الملفات
    allInds(model).forEach(function (r) { if (r.x.qs.length) tot++; });
    var by = {};
    rows.forEach(function (r) { var p = String(r.a || "").match(/^nf(\d)([rms])(\d\d)p$/); if (!p || +p[1] !== gc) return; var n = 0, b = Number(r.best); if (!isFinite(b) || b < 1 || b > 9e15) b = 0; b = Math.floor(b); while (b >= 1) { if (b % 2 >= 1) n++; b = Math.floor(b / 2); } by[r.cid + "|" + r.si] = (by[r.cid + "|" + r.si] || 0) + n; });
    return { tot: tot, by: by };
  }
  function preload(gcs) { return Promise.all((gcs || [3, 6]).map(loadSpz)); }
  window.NAFIS_J = { open: open, render: render, buildModel: buildModel, summarize: summarize, preload: preload, STATE: STATE };
})();
