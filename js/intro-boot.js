/* الجولة السينمائية — الإقلاع: قرار skip/posters/full، تحميل المكتبات، شريط الدخول، الملصقات، ومراقبة الدخول قبل بدء الجولة.
   نسخة مصغّرة من منطق القرار مضمّنة في <head> داخل index.html؛ هذا الملف يُكمل ما بعد القرار. */
(function () {
  'use strict';
  var W = window, D = document, V = '38';
  var NS = W.SIJIL_INTRO = W.SIJIL_INTRO || {};
  var CDN = 'https://cdnjs.cloudflare.com/ajax/libs/';
  var LIBS = [
    CDN + 'three.js/0.160.0/three.min.js',
    CDN + 'gsap/3.12.5/gsap.min.js',
    CDN + 'gsap/3.12.5/ScrollTrigger.min.js',
    CDN + 'gsap/3.12.5/ScrollToPlugin.min.js'
  ];
  var TOUR = ['core', 'media', 'ui', 'world', 'stations/s1', 'stations/s2', 'stations/s3', 'stations/s4',
    'stations/s5', 'stations/s6', 'stations/s7', 'stations/s8'].map(function (n) { return 'js/intro/' + n + '.js?v=' + V; });
  /* ملصق المحطة الأولى: خلفية #intro حتى أول إطار WebGL (عنصر LCP) */
  var FIRST_POSTER = 'assets/intro/posters/s1.webp';

  /* الملصقات الثابتة (القسم 6) — تُستخدم في وضع posters بلا مكتبات */
  var POSTERS = [
    ['صباحك يبدأ من البوابة', 'تحضير، حصة حيّة، ٧٨٢ درساً، وتقارير أولياء الأمور… كلها في هاتفك.'],
    ['الحضور والنجوم بضغطة', 'افتح الفصل واضغط اسم الطالب: حاضر، شارك، نجمة. ينتهي التحضير قبل أن يجلس آخر طالب.'],
    ['حصة حيّة لا ينام فيها أحد', 'عجلة الأسماء، مسابقة، مؤقت، قصة مصوّرة، و٧ ألعاب. من يُجب يختار من بعده.'],
    ['مكتبة دروس جاهزة للعرض', '٧٨٢ درساً في ١١ مادة، الصفوف ٢–٦، بصور وصوت، تُفتح على السبورة بضغطة.'],
    ['ورقة عمل تصل عبر واتساب', 'أوراق عمل واختبارات تُرسل للطلاب وتُصحَّح آلياً مع تحليل الأخطاء.'],
    ['كل طالب… ملفّ يكبر معه', 'تقدّم الطالب في كل المواد في مكان واحد، وتقرير ولي الأمر بضغطة واتساب.'],
    ['المدير يرى المدرسة كلّها', 'مستويات الطلاب حسب المادة والصف، في لوحة واحدة تتحدّث مع كل رصد.'],
    ['ادخل… الحصة تنتظرك', 'آمن بـ Firebase ويعمل دون اتصال.']
  ];

  function $(s) { return D.querySelector(s); }
  function warn(m) { try { if (W.console) console.warn('[intro-boot] ' + m); } catch (e) { } }

  /* ─── القرار (يُعاد حسابه هنا فقط إن غاب سكربت الرأس) ─── */
  function decide() {
    var q = location.search, force = /[?&]intro=1(&|$)/.test(q);
    var seen = false;
    try {
      seen = localStorage.getItem('sijil.intro.seen') === '1';
      ['sijil.v1', 'sijil.cloud.v1', 'sijil.db'].forEach(function (k) {
        var r = localStorage.getItem(k);
        if (r && r.indexOf('"session":"t') > -1) seen = true;
      });
    } catch (e) { }
    if (seen && !force) return 'skip';
    var gl = false;
    try { var c = D.createElement('canvas'); gl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { }
    var n = navigator, reduce = false;
    try { reduce = W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
    if (reduce || !gl || (n.connection && n.connection.saveData) || (n.deviceMemory && n.deviceMemory <= 2)) return 'posters';
    return 'full';
  }
  NS.mode = NS.mode || decide();
  /* علم على <html> يُظهر شريط «دخول» بـ CSS وحده قبل أي سكربت أو مكتبة (القرار 5) */
  if (NS.mode !== 'skip') { try { D.documentElement.classList.add('intro-bar'); } catch (e) { } }
  NS.version = V;
  NS.state = NS.state || { t: 0, i: 0, p: 0, fps: 0, dpr: 1, tris: 0, calls: 0, quality: 'high', fastJump: false };

  var aborted = false;   /* دخل المعلم قبل أن تبدأ الجولة → لا start ولا ملصقات */
  var loginMO = null;

  function markSeen() { try { localStorage.setItem('sijil.intro.seen', '1'); } catch (e) { } }
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function remove(id) { try { var el = D.getElementById(id); if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) { } }

  /* ─── تحميل السكربتات: تُدرج دفعة واحدة فور القرار؛ التنزيل متوازٍ والتنفيذ مرتّب بـ async=false ─── */
  function loadScript(src) {
    return new Promise(function (resolve) {
      try {
        var s = D.createElement('script');
        s.src = src; s.async = false;
        s.onload = function () { resolve(true); };
        s.onerror = function () { warn('تعذّر تحميل ' + src); resolve(false); };
        D.head.appendChild(s);
      } catch (e) { warn('تعذّر إدراج ' + src); resolve(false); }
    });
  }
  function loadAll(list) { return Promise.all(list.map(loadScript)); }
  function preloadImage(url) {
    try { var l = D.createElement('link'); l.rel = 'preload'; l.as = 'image'; l.href = url; D.head.appendChild(l); } catch (e) { }
  }

  /* ─── انتظار عناصر الجولة والدخول (تُنشأ قبل سكربتات Firebase الحاجبة، فلا ننتظر DOMContentLoaded) ─── */
  function whenDom(fn) {
    if (D.readyState !== 'loading') { fn(); return; }
    D.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  function introDomReady() { return !!(D.body && D.getElementById('view-app') && D.getElementById('intro-track') && D.getElementById('intro-bar')); }
  function whenIntroDom(fn) {
    if (introDomReady()) { fn(); return; }
    var done = false, mo = null;
    function fire() { if (done) return; done = true; if (mo) { try { mo.disconnect(); } catch (e) { } } fn(); }
    try {
      if ('MutationObserver' in W) {
        mo = new MutationObserver(function () { if (introDomReady()) fire(); });
        mo.observe(D.documentElement, { childList: true, subtree: true });
      }
    } catch (e) { mo = null; }
    whenDom(fire);
  }

  /* ─── مراقبة الدخول من الإقلاع: إن أُخفي #view-login قبل start() نزيل كل ما يخص الجولة فوراً ─── */
  function cleanupAll() {
    aborted = true;
    if (loginMO) { try { loginMO.disconnect(); } catch (e) { } loginMO = null; }
    try { D.body.classList.remove('has-intro'); } catch (e) { }
    try { D.documentElement.classList.remove('intro-bar'); D.documentElement.classList.remove('has-intro'); } catch (e) { }
    try { if (NS.ui && typeof NS.ui.finish === 'function') NS.ui.finish(); } catch (e) { }
    ['intro', 'intro-track', 'intro-bar', 'intro-posters', 'intro-stamp', 'intro-hud', 'intro-ui-css'].forEach(remove);
    markSeen();
    try { W.scrollTo(0, 0); } catch (e) { }
  }
  function watchLogin() {
    var login = $('#view-login');
    if (!login) return;
    if (login.classList.contains('hidden')) { cleanupAll(); return; }
    if (!('MutationObserver' in W) || loginMO) return;
    try {
      loginMO = new MutationObserver(function () {
        if (NS.state && NS.state.started) { /* بعد start(): core يملك الإنهاء */
          if (loginMO) { loginMO.disconnect(); loginMO = null; }
          return;
        }
        if (login.classList.contains('hidden')) cleanupAll();
      });
      loginMO.observe(login, { attributes: true, attributeFilter: ['class'] });
    } catch (e) { loginMO = null; }
  }

  /* ─── زر «دخول» الثابت ─── */
  function initBar() {
    var bar = $('#intro-bar'); if (!bar) return;
    show(bar);
    var a = bar.querySelector('.enter');
    if (a) a.addEventListener('click', function (ev) {
      var g = W.gsap, ok = false;
      if (NS.state && NS.state.started) return; /* بعد start(): core يملك الزر */
      try { ok = !!(g && g.plugins && g.plugins.scrollTo); } catch (e) { }
      if (!ok) return; /* قبل gsap: رابط عادي إلى #view-login */
      ev.preventDefault();
      NS.state.fastJump = true;
      try {
        g.to(W, { duration: 0.9, ease: 'power2.inOut', scrollTo: { y: '#view-login', autoKill: false },
          onComplete: function () { NS.state.fastJump = false; } });
      } catch (e) { NS.state.fastJump = false; location.hash = '#view-login'; }
    });
    /* يختفي حين تكون بطاقة الدخول مرئية ≥ 50% */
    try {
      var login = $('#view-login');
      if (login && 'IntersectionObserver' in W) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) { bar.classList.toggle('is-off', e.intersectionRatio >= 0.5); });
        }, { threshold: [0, 0.5, 1] }).observe(login);
      }
    } catch (e) { }
  }

  /* ─── زر «شاهد الجولة» في وضع skip ─── */
  function initReplay() {
    var b = $('#intro-replay'); if (!b) return;
    show(b);
    b.addEventListener('click', function () {
      try { localStorage.removeItem('sijil.intro.seen'); } catch (e) { }
      var ps = location.search.replace(/^\?/, '').split('&').filter(function (x) { return x && !/^intro=/.test(x); });
      ps.push('intro=1');
      location.href = location.pathname + '?' + ps.join('&');
    });
  }

  /* ─── الملصقات (بلا مكتبات) ─── */
  function buildPosters() {
    var root = $('#intro-posters'); if (!root || aborted) return;
    if (NS.ui && typeof NS.ui.posters === 'function') { try { NS.ui.posters(POSTERS); show(root); return; } catch (e) { } }
    root.innerHTML = '';
    POSTERS.forEach(function (p, i) {
      var sec = D.createElement('section');
      sec.className = 'poster'; sec.setAttribute('data-i', String(i + 1));
      var body = D.createElement('div'); body.className = 'poster-body';
      var h = D.createElement('h2'); h.textContent = p[0];
      var t = D.createElement('p'); t.textContent = p[1];
      var num = D.createElement('span'); num.className = 'poster-num'; num.textContent = (i + 1).toLocaleString('ar-EG');
      body.appendChild(num); body.appendChild(h); body.appendChild(t);
      sec.appendChild(body); root.appendChild(sec);
      try {
        var url = 'assets/intro/posters/s' + (i + 1) + '.webp', img = new Image();
        img.onload = function () { sec.style.backgroundImage = 'url("' + url + '")'; sec.classList.add('has-img'); };
        img.src = url;
      } catch (e) { }
    });
    var last = root.lastElementChild;
    if (last) {
      var a = D.createElement('a'); a.className = 'poster-cta'; a.href = '#view-login'; a.textContent = 'دخول';
      last.querySelector('.poster-body').appendChild(a);
    }
    show(root);
  }

  /* ─── التراجع من full إلى posters عند فشل المكتبات ─── */
  function fallbackToPosters(reason) {
    if (aborted) return;
    warn('الرجوع إلى الملصقات: ' + reason);
    NS.mode = 'posters';
    try { D.body.classList.remove('has-intro'); D.documentElement.classList.remove('has-intro'); } catch (e) { }
    hide($('#intro')); hide($('#intro-track'));
    buildPosters();
    watchLogin();
  }

  /* ─── الوضع الكامل: المكتبات وملفات الجولة دفعة واحدة، ثم start() فور جاهزية عناصر الجولة ─── */
  function startFull() {
    preloadImage(FIRST_POSTER);
    var libs = loadAll(LIBS.concat(TOUR));
    whenIntroDom(function () {
      if (aborted) return;
      try { D.body.classList.add('has-intro'); } catch (e) { }
      show($('#intro')); show($('#intro-track'));
      initBar();
      watchLogin();
    });
    libs.then(function () {
      if (aborted) return;
      if (!W.THREE || !W.gsap || !W.ScrollTrigger) { whenIntroDom(function () { fallbackToPosters('مكتبة أساسية مفقودة'); }); return; }
      try { W.gsap.registerPlugin(W.ScrollTrigger); if (W.ScrollToPlugin) W.gsap.registerPlugin(W.ScrollToPlugin); } catch (e) { }
      if (typeof NS.start !== 'function') { whenIntroDom(function () { fallbackToPosters('SIJIL_INTRO.start غير متوفر'); }); return; }
      whenIntroDom(function () {
        if (aborted) return;
        var ok = false;
        try { ok = NS.start(); } catch (e) { warn('فشل start(): ' + (e && e.message)); fallbackToPosters('خطأ في start'); return; }
        /* start() يعيد false عند تعذّر WebGL أو المكتبات؛ أما إن أنهى الجولة فوراً (جلسة محفوظة) فلا تراجع */
        if (ok === false && !(NS.state && NS.state.finished)) fallbackToPosters('start() لم يكتمل');
      });
    }).catch(function (e) { whenIntroDom(function () { fallbackToPosters('خطأ في التحميل: ' + (e && e.message)); }); });
  }

  function run() {
    try {
      if (NS.mode === 'skip') { markSeen(); whenIntroDom(initReplay); return; }
      if (NS.mode === 'posters') { whenIntroDom(function () { initBar(); buildPosters(); watchLogin(); }); return; }
      startFull();
    } catch (e) { warn('خطأ في الإقلاع: ' + (e && e.message)); }
  }
  run();
})();
