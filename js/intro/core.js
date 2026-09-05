/* سجل المتابعة الرقمي — الجولة السينمائية: النواة (core)
   المشهد والكاميرا ومسار الطيران، شريط التمرير، حلقة الرسم عند الطلب، الجزيئات الذهبية،
   المراقب التكيّفي، وتكامل الدخول والإنهاء. كل شيء على window.SIJIL_INTRO بلا وحدات. */
(function (win, doc) {
  'use strict';

  var NS = win.SIJIL_INTRO = win.SIJIL_INTRO || {};
  var DIR = -1;
  var CLEAR_COLOR = 0x071322;
  var GOLD = 0xD7A93F;
  var TILT_RAD = 6 * Math.PI / 180;
  var PARTICLES_DESKTOP = 1200;
  var PARTICLES_MOBILE = 400;
  var WARM_SEC = 2;          /* نافذة الإحماء: رسم متواصل وقياس حقيقي ثم قرار */
  var WARM_SKIP = 0.6;       /* أول 0.6s من الإحماء لا تُحتسب (ترجمة الشادرات ورفع النسيج) */
  var IDLE_MS = 250;         /* رسمة السكون كل 250ms (القرار 9) */

  var params;
  try { params = new URLSearchParams(win.location.search); } catch (e) { params = { get: function () { return null; } }; }
  var debug = params.get('debug') === '1';
  /* ?adapt=0 يعطّل المراقب التكيّفي (للاختبار تحت SwiftShader فقط) */
  var adaptive = params.get('adapt') !== '0';

  /* ───────────── أدوات عامة ───────────── */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function nowSec() { return (win.performance && performance.now ? performance.now() : Date.now()) / 1000; }
  function remapNum(x, a, b, c, d) { var s = (b - a) === 0 ? 0 : (x - a) / (b - a); return c + clamp(s, 0, 1) * (d - c); }

  function ease(name, x) {
    x = clamp(+x || 0, 0, 1);
    switch (name) {
      case 'in': return x * x * x;
      case 'inOut': return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      case 'back': { var c1 = 1.7, c3 = c1 + 1, u = x - 1; return 1 + c3 * u * u * u + c1 * u * u; }
      case 'expo': return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
      case 'out':
      default: return 1 - Math.pow(1 - x, 3);
    }
  }

  function log() { if (debug && win.console) { try { console.info.apply(console, ['[intro]'].concat([].slice.call(arguments))); } catch (e) {} } }
  function warn() { if (debug && win.console) { try { console.warn.apply(console, ['[intro]'].concat([].slice.call(arguments))); } catch (e) {} } }

  /* استدعاء آمن لدالة اختيارية على كائن (this = الكائن) */
  function callOn(obj, name, a, b) {
    if (!obj || typeof obj[name] !== 'function') return undefined;
    try { return obj[name](a, b); } catch (e) { warn(name + '()', e); }
  }

  /* ───────────── الحالة والسياق ───────────── */
  var state = NS.state = {
    t: 0, i: 0, p: 0, fps: 60, dpr: 1, tris: 0, calls: 0,
    quality: 'high', fastJump: false, velocity: 0, active: null, started: false, finished: false
  };
  var ctx = NS.ctx = {
    THREE: win.THREE || null, scene: null, camera: null, renderer: null, world: null, media: null, ui: null,
    isMobile: false, quality: 'high', DIR: DIR, dpr: 1, time: 0, velocity: 0, tilt: { x: 0, y: 0 }, state: state
  };

  /* ───────────── المحطات ───────────── */
  var stations = [];
  var sumW = 1;
  var started = false;

  function layoutStations() {
    var i, sum = 0, acc = 0;
    for (i = 0; i < stations.length; i++) sum += stations[i].weight;
    sumW = sum > 0 ? sum : 1;
    for (i = 0; i < stations.length; i++) {
      var s = stations[i];
      s.k = i;
      s.start = acc / sumW;
      acc += s.weight;
      s.end = acc / sumW;
      s.span = s.end - s.start;
    }
  }

  function registerStation(def) {
    if (!def || typeof def !== 'object') return null;
    var s = def;
    s.id = s.id || ('s' + (stations.length + 1));
    s.index = (typeof s.index === 'number') ? s.index : stations.length;
    s.weight = (+s.weight > 0) ? +s.weight : 1;
    s._loaded = false;
    s._built = false;
    if (!s.group && win.THREE) { s.group = new win.THREE.Group(); s.group.name = s.id; }
    for (var k = 0; k < stations.length; k++) {
      if (stations[k].id === s.id) {
        var old = stations[k];
        if (old.group && old.group.parent) old.group.parent.remove(old.group);
        stations.splice(k, 1);
        break;
      }
    }
    stations.push(s);
    stations.sort(function (a, b) { return a.index - b.index; });
    layoutStations();
    if (started) attachLate(s);
    return s;
  }

  /* تسجيل متأخر بعد start(): نضيف المجموعة ونبني ونعيد المسار */
  function attachLate(s) {
    try {
      if (s.group && scene && !s.group.parent) scene.add(s.group);
      buildStation(s);
      buildCurves();
      if (track) {
        track.style.height = trackHeight();
        if (win.ScrollTrigger) win.ScrollTrigger.refresh();
      }
      wake();
    } catch (e) { warn('late station', e); }
  }

  function buildStation(s) {
    if (s._built) return;
    s._built = true;
    if (typeof s.build === 'function') { try { s.build(ctx); } catch (e) { warn('build ' + s.id, e); } }
  }

  /* remap(t) → {i,p} أو remap(x,a,b,c,d) → رقم */
  function remap(x, a, b, c, d) {
    if (arguments.length >= 5) return remapNum(+x, +a, +b, +c, +d);
    var t = clamp(+x || 0, 0, 1);
    if (!stations.length) return { i: 0, p: t };
    var i = stations.length - 1;
    for (var k = 0; k < stations.length; k++) { if (t < stations[k].end) { i = k; break; } }
    var s = stations[i];
    return { i: i, p: s.span > 0 ? clamp((t - s.start) / s.span, 0, 1) : (t >= s.end ? 1 : 0) };
  }

  /* ───────────── مسار الكاميرا ───────────── */
  var curvePos = null, curveLook = null, curveT = [];

  function v3(arr) {
    var T = win.THREE;
    if (arr && arr.isVector3) return arr.clone();
    return new T.Vector3(+arr[0] || 0, +arr[1] || 0, +arr[2] || 0);
  }

  function buildCurves() {
    var T = win.THREE;
    if (!T) return;
    var pts = [], looks = [], ts = [], owners = [];
    stations.forEach(function (s) {
      var cam = Array.isArray(s.cam) ? s.cam.slice() : [];
      cam.sort(function (a, b) { return (+a.t || 0) - (+b.t || 0); });
      cam.forEach(function (c, ci) {
        if (!c || !c.pos) return;
        var tl = clamp(+c.t || 0, 0, 1);
        var tg = s.start + tl * s.span;
        if (ts.length && tg - ts[ts.length - 1] < 1e-5) {
          /* تصادم زمني: داخل المحطة نفسها تُهمل النقطة؛ بين محطتين تُؤخَّر نقطة الاستلام إلى نهاية مرحلة الاستلام (0.15) */
          if (owners[owners.length - 1] === s) return;
          var nextT = cam[ci + 1] ? clamp(+cam[ci + 1].t || 0, 0, 1) : 1;
          tl = Math.min(0.15, nextT * 0.5);
          tg = s.start + tl * s.span;
          if (tg - ts[ts.length - 1] < 1e-5) return;
          log('cam collision', s.id, 'point moved to local t', tl);
        }
        var pos = v3(c.pos);
        var look = c.look ? v3(c.look) : pos.clone().add(new T.Vector3(0, -0.3, -6));
        pts.push(pos); looks.push(look); ts.push(tg); owners.push(s);
      });
    });
    if (!pts.length) {
      pts = [new T.Vector3(0, 4, 20), new T.Vector3(0, 2, -60)];
      looks = [new T.Vector3(0, 3, 0), new T.Vector3(0, 1, -80)];
      ts = [0, 1];
    }
    if (pts.length === 1) { pts.push(pts[0].clone()); looks.push(looks[0].clone()); ts.push(1); }
    curvePos = new T.CatmullRomCurve3(pts, false, 'centripetal');
    curveLook = new T.CatmullRomCurve3(looks, false, 'centripetal');
    curveT = ts;
    NS.curves = { pos: curvePos, look: curveLook, t: curveT };
  }

  /* t عالمي → معامل المنحنى (كل مقطع بين نقطتين يُقطع خطياً حسب tGlobal) */
  function curveParam(t) {
    var n = curveT.length;
    if (n < 2) return 0;
    if (t <= curveT[0]) return 0;
    if (t >= curveT[n - 1]) return 1;
    var k = 0;
    while (k < n - 2 && t >= curveT[k + 1]) k++;
    var f = (t - curveT[k]) / (curveT[k + 1] - curveT[k]);
    return (k + f) / (n - 1);
  }

  /* ───────────── متغيرات المشهد ───────────── */
  var renderer, scene, camera, world;
  var intro, canvas, track, bar, login, card, lgBtn, hud;
  var isMobile = false, dprBase = 1, trackPx = 0, lastW = 0, lastH = 0;
  var camPos, camLook, tgtPos, tgtLook, fwd, right, upv;
  var tilt = ctx.tilt, tiltTarget = { x: 0, y: 0 }, lastTouch = null;
  var running = false, rafId = 0, idleTimer = 0, dirty = true, settling = false, snapNext = true, firstFrameDone = false;
  var t0 = 0, lastFrame = 0, lastRender = -1, prevDrawn = false, hudStamp = 0;
  var velTarget = 0, velStamp = 0, lastTT = 0;
  var fpsEma = 0, lowAcc = 0, lowAcc30 = 0, coolUntil = 0, warmDecided = false, warmSamples = 0;
  var proxy = { t: 0 }, scrubTween = null, loginTween = null, scrollTween = null;
  var io = null, mo = null, userClicked = false, finishing = false, cardDone = false;
  var particles = null, particleArr = null, particleN = 0, particleCount = 0, halvings = 0, particlesFresh = true;
  var resizeTimer = 0, precompileTimer = 0, precompiled = false;
  var fovBase = 45, fovWant = 45;

  /* ───────────── البدء ───────────── */
  function start() {
    if (started) return true;
    var T = win.THREE;
    if (!T || !win.gsap || !win.ScrollTrigger) { warn('missing libs'); return bail(); }
    intro = doc.getElementById('intro');
    canvas = doc.getElementById('intro-gl');
    track = doc.getElementById('intro-track');
    if (!intro || !canvas || !track) {
      if (doc.readyState === 'loading') { doc.addEventListener('DOMContentLoaded', function () { start(); }, { once: true }); return false; }
      warn('intro DOM missing'); return bail();
    }
    started = true;
    state.started = true;
    ctx.THREE = T;

    bar = doc.getElementById('intro-bar');
    login = doc.getElementById('view-login');
    card = login ? login.querySelector('.login-card') : null;
    lgBtn = doc.getElementById('lg-btn');

    try {
      if (login && login.classList.contains('hidden')) { finish(false); return false; }

      var w = win.innerWidth, h = win.innerHeight;
      var coarse = false;
      try { coarse = win.matchMedia('(pointer: coarse)').matches; } catch (e) {}
      isMobile = w < 900 || (coarse && w < 1200);
      ctx.isMobile = isMobile;
      /* الجوال يبدأ عند 1.25 مع MSAA (لا يمكن إطفاؤه لاحقاً)؛ المكتب ≤ 2 */
      dprBase = Math.min(win.devicePixelRatio || 1, isMobile ? 1.25 : 2);
      state.dpr = ctx.dpr = dprBase;
      lastW = w; lastH = h;

      doc.body.classList.add('has-intro');
      intro.hidden = false;
      track.hidden = false;
      if (bar) bar.hidden = false;
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';

      renderer = new T.WebGLRenderer({
        canvas: canvas, antialias: state.dpr < 2, alpha: false,
        powerPreference: 'high-performance', stencil: false
      });
      renderer.setClearColor(CLEAR_COLOR, 1);
      if ('outputColorSpace' in renderer) renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.setPixelRatio(state.dpr);
      renderer.info.autoReset = true;

      scene = new T.Scene();
      scene.background = new T.Color(CLEAR_COLOR);
      fovBase = (isMobile && h > w) ? 62 : 45;
      fovWant = fovBase;
      camera = new T.PerspectiveCamera(fovBase, w / h, 0.1, 300);
      camPos = new T.Vector3(); camLook = new T.Vector3();
      tgtPos = new T.Vector3(); tgtLook = new T.Vector3();
      fwd = new T.Vector3(); right = new T.Vector3(); upv = new T.Vector3();

      ctx.scene = scene; ctx.camera = camera; ctx.renderer = renderer;
      ctx.media = NS.media || null; ctx.ui = NS.ui || null;
      renderer.setSize(w, h, false);

      /* العالم */
      world = null;
      try {
        if (typeof NS.buildWorld === 'function') world = NS.buildWorld(ctx);
        else if (typeof NS.world === 'function') world = NS.world(ctx);
        else if (NS.world && typeof NS.world === 'object') world = NS.world;
      } catch (e) { warn('world', e); world = null; }
      NS.world = world || null;
      ctx.world = world || null;

      /* المحطات: المجموعة تُضاف قبل build */
      stations.forEach(function (s) {
        if (!s.group) { s.group = new T.Group(); s.group.name = s.id; }
        if (!s.group.parent) scene.add(s.group);
        s.group.visible = false;
      });
      stations.forEach(buildStation);
      buildCurves();
      buildParticles();
      applyParticleBudget();

      var texts = doc.getElementById('intro-texts');
      if (NS.ui && (!texts || !texts.children.length)) callOn(NS.ui, 'mountTexts', stations, ctx);

      setupScroll();
      setupLogin();
      setupInput();
      if (debug) makeHud();

      win.addEventListener('resize', onResize, { passive: true });
      win.addEventListener('orientationchange', onResize, { passive: true });
      doc.addEventListener('visibilitychange', onVisibility);

      t0 = nowSec();
      lastTT = t0;
      state.t = 0;
      snapNext = true;
      startLoop();
      try { win.ScrollTrigger.refresh(); } catch (e) {}
      /* ترجمة كل الشادرات (بما فيها توائم Lambert) بعد أول إطارين حتى لا تتجمّد المحطات عند أول دخول */
      precompileTimer = setTimeout(precompile, 120);
      if (params.get('station') != null) setTimeout(applyJump, 80);
      log('started', { mobile: isMobile, dpr: state.dpr, stations: stations.length });
      return true;
    } catch (e) {
      warn('start failed', e);
      return bail();
    }
  }

  /* فشل التهيئة: نعيد الصفحة العادية بلا كسر */
  function bail() {
    try {
      var el;
      if ((el = doc.getElementById('intro'))) el.hidden = true;
      if ((el = doc.getElementById('intro-track'))) el.hidden = true;
      doc.body.classList.remove('has-intro');
    } catch (e) {}
    return false;
  }

  /* ───────────── الحجم ───────────── */
  /* ارتفاع الشريط بالبكسل يُحسب مرة واحدة (لا svh): لوحة المفاتيح أو شريط العنوان لا يغيّران طول الوثيقة */
  function trackHeight() {
    if (!trackPx) trackPx = Math.round(sumW * (win.innerHeight || 800) * (isMobile ? 1.6 : 1.8));
    return trackPx + 'px';
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  }

  function loginVisible() {
    if (!login) return false;
    try {
      var ae = doc.activeElement;
      if (ae && ae !== doc.body && login.contains(ae)) return true;
      var r = login.getBoundingClientRect();
      return r.top <= (win.innerHeight || 0) * 0.5 && r.bottom > 0;
    } catch (e) { return false; }
  }

  /* بعد إعادة الحساب: بطاقة الدخول تبقى ظاهرة وفي مكانها إن كانت هي المشهد قبل التغيير */
  function keepLoginVisible() {
    if (!login) return;
    finalizeCard();
    try {
      var y = login.getBoundingClientRect().top + (win.scrollY || win.pageYOffset || 0);
      win.scrollTo(0, Math.round(y));
    } catch (e) {}
    try { win.ScrollTrigger.update(); } catch (e) {}
    setT(1);
    snapNext = true;
  }

  function resize() {
    if (!renderer || state.finished) return;
    var w = win.innerWidth, h = win.innerHeight;
    var big = (w !== lastW) || Math.abs(h - lastH) > lastH * 0.25;
    var wasLogin = big && loginVisible();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    fovBase = (isMobile && h > w) ? 62 : 45;
    camera.updateProjectionMatrix();
    if (particles) particles.material.uniforms.uScale.value = state.dpr * h * 0.5;
    if (big) {
      lastW = w; lastH = h;
      /* تدوير الجهاز أو لوحة المفاتيح: لا نعتمد على refresh الداخلي (ignoreMobileResize) */
      try { win.ScrollTrigger.refresh(); } catch (e) {}
      if (wasLogin) keepLoginVisible();
    }
    wake();
  }

  /* ───────────── التمرير ───────────── */
  function setupScroll() {
    var ST = win.ScrollTrigger, g = win.gsap;
    try { g.registerPlugin(ST); if (win.ScrollToPlugin) g.registerPlugin(win.ScrollToPlugin); } catch (e) {}
    try { ST.config({ ignoreMobileResize: true }); } catch (e) {}
    track.style.height = trackHeight();
    scrubTween = g.to(proxy, {
      t: 1, ease: 'none', overwrite: true,
      scrollTrigger: { trigger: track, start: 'top top', end: 'bottom bottom', scrub: 0.8, id: 'intro-track' },
      onUpdate: function () { setT(proxy.t); }
    });
  }

  function setT(t) {
    var now = nowSec();
    var dt = now - lastTT;
    if (dt > 0.004) {
      var raw = (t - state.t) / dt * Math.max(stations.length, 1) / 2.5;
      velTarget = clamp(raw, -1, 1);
      velStamp = now;
      lastTT = now;
    }
    state.t = t;
    wake();
  }

  /* قفزة الاختبار ?station=N&p=x (N رقم المحطة 1..8) */
  function applyJump() {
    if (state.finished) return;
    var raw = String(params.get('station') || '0');
    var m = /(\d+)/.exec(raw);
    var n = m ? parseInt(m[1], 10) : 0;
    var idx = clamp(n >= 1 ? n - 1 : 0, 0, Math.max(stations.length - 1, 0));
    var p = clamp(parseFloat(params.get('p') || '0') || 0, 0, 1);
    var t = stations.length ? stations[idx].start + p * stations[idx].span : p;
    jumpTo(t);
  }

  function jumpTo(t) {
    t = clamp(t, 0, 1);
    var top = track.getBoundingClientRect().top + (win.scrollY || win.pageYOffset || 0);
    var range = Math.max(track.offsetHeight - win.innerHeight, 0);
    win.scrollTo(0, Math.round(top + t * range));
    try { win.ScrollTrigger.update(); } catch (e) {}
    try { if (scrubTween) scrubTween.progress(t); } catch (e) {}
    proxy.t = t;
    state.t = t;
    velTarget = 0; state.velocity = ctx.velocity = 0; lastTT = nowSec();
    snapNext = true;
    wake();
  }

  /* زر «دخول» الثابت: تمرير ناعم مع fastJump */
  function goLogin() {
    if (!login || state.finished) return;
    var y = login.getBoundingClientRect().top + (win.scrollY || win.pageYOffset || 0);
    state.fastJump = true;
    wake();
    var done = false;
    var end = function () { if (!done) { done = true; state.fastJump = false; wake(); } };
    try {
      if (win.gsap && win.ScrollToPlugin) {
        if (scrollTween) scrollTween.kill();
        scrollTween = win.gsap.to(win, {
          duration: 1.6, ease: 'power2.inOut', scrollTo: { y: y, autoKill: false },
          onComplete: end, onInterrupt: end
        });
      } else {
        try { win.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) { win.scrollTo(0, y); }
        setTimeout(end, 1700);
      }
    } catch (e) { win.scrollTo(0, y); end(); }
    setTimeout(end, 2000);
  }

  /* ───────────── تكامل الدخول ───────────── */
  function setupLogin() {
    var g = win.gsap;
    if (bar) {
      var enter = bar.querySelector('.enter');
      if (enter) enter.addEventListener('click', function (e) { e.preventDefault(); goLogin(); });
    }
    if (!login) return;

    if (card) {
      try {
        loginTween = g.fromTo(card, { y: 40, opacity: 0 }, {
          y: 0, opacity: 1, ease: 'none', immediateRender: true,
          scrollTrigger: { trigger: login, start: 'top 85%', end: 'top 20%', scrub: 0.6, id: 'intro-login' },
          onUpdate: function () { if (!cardDone && this.progress() < 1) card.classList.add('is-arriving'); },
          onComplete: cardArrived
        });
        card.classList.add('is-arriving');
      } catch (e) { warn('login tween', e); }
      /* تركيز حقل داخل البطاقة = وصلت نهائياً؛ لا تعود للاختفاء مع لوحة المفاتيح أو التدوير */
      try { login.addEventListener('focusin', finalizeCard); } catch (e) {}
    }

    if ('IntersectionObserver' in win && bar) {
      try {
        io = new IntersectionObserver(function (entries) {
          var en = entries[entries.length - 1];
          var vis = en.isIntersecting && en.intersectionRatio >= 0.5;
          bar.classList.toggle('is-off', vis);
          bar.style.opacity = vis ? '0' : '';
          bar.style.pointerEvents = vis ? 'none' : '';
        }, { threshold: [0, 0.5, 1] });
        io.observe(login);
      } catch (e) {}
    }

    if (lgBtn) {
      lgBtn.addEventListener('pointerdown', function () { userClicked = true; }, true);
      lgBtn.addEventListener('click', function () { userClicked = true; }, true);
    }
    if ('MutationObserver' in win) {
      mo = new MutationObserver(function () {
        if (login.classList.contains('hidden')) onLoginHidden();
      });
      mo.observe(login, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function cardArrived() {
    if (!card) return;
    card.classList.remove('is-arriving');
    card.style.transform = '';
    card.style.opacity = '';
  }

  /* وصول نهائي: يُقتل مشغّل الوصول فلا تختفي البطاقة مجدداً */
  function finalizeCard() {
    if (cardDone) return;
    cardDone = true;
    try { if (loginTween && loginTween.scrollTrigger) loginTween.scrollTrigger.kill(); } catch (e) {}
    try { if (loginTween) loginTween.kill(); } catch (e) {}
    loginTween = null;
    cardArrived();
  }

  /* عند إخفاء #view-login: تحرير WebGL وإزالة الطبقة فوراً؛ الختم طبقة CSS مستقلة تزول بمؤقتها */
  function onLoginHidden() {
    if (state.finished || finishing) return;
    finishing = true;
    stopLoop();
    var ui = NS.ui, keep = false;
    if (userClicked && ui && typeof ui.stamp === 'function') {
      try { ui.stamp(); keep = true; } catch (e) { keep = false; }
    }
    finish(keep);
  }

  /* الإنهاء الكامل (القرار 13) */
  function finish(keepStamp) {
    if (state.finished) return;
    state.finished = true;
    finishing = true;
    stopLoop();
    clearTimeout(precompileTimer);
    var ui = NS.ui;
    try { if (ui && typeof ui.finish === 'function') ui.finish(!!keepStamp); } catch (e) {}

    try { if (scrollTween) scrollTween.kill(); } catch (e) {}
    try { if (win.gsap) win.gsap.killTweensOf(win); } catch (e) {}
    try {
      var ST = win.ScrollTrigger;
      if (ST) { if (typeof ST.killAll === 'function') ST.killAll(); else ST.getAll().forEach(function (t) { t.kill(); }); }
    } catch (e) {}
    try { if (scrubTween) scrubTween.kill(); } catch (e) {}
    try { if (loginTween) loginTween.kill(); } catch (e) {}
    cardArrived();

    try { if (io) io.disconnect(); } catch (e) {}
    try { if (mo) mo.disconnect(); } catch (e) {}
    win.removeEventListener('resize', onResize);
    win.removeEventListener('orientationchange', onResize);
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pointermove', onPointerMove);
    win.removeEventListener('touchstart', onTouchStart);
    win.removeEventListener('touchmove', onTouchMove);
    try { if (login) login.removeEventListener('focusin', finalizeCard); } catch (e) {}

    try { callOn(NS.media, 'dispose'); } catch (e) {}
    try {
      var vids = [].slice.call(doc.querySelectorAll('video'));
      if (NS.media && Array.isArray(NS.media.videos)) vids = vids.concat(NS.media.videos);
      vids.forEach(function (v) {
        try {
          v.pause();
          v.removeAttribute('src');
          [].slice.call(v.querySelectorAll('source')).forEach(function (s) { s.remove(); });
          v.load();
        } catch (e) {}
      });
    } catch (e) {}

    try {
      stations.forEach(function (s) { if (s._loaded) { s._loaded = false; try { if (typeof s.unload === 'function') s.unload(ctx); } catch (e) {} } });
    } catch (e) {}
    try { disposeScene(); } catch (e) {}
    try { callOn(world, 'dispose'); } catch (e) {}
    try { if (renderer) { renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss(); } } catch (e) {}

    var ids = ['intro', 'intro-track', 'intro-bar', 'intro-hud'];
    if (!keepStamp) ids.push('intro-stamp');
    ids.forEach(function (id) {
      try { var el = doc.getElementById(id); if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) {}
    });
    doc.body.classList.remove('has-intro');
    try { doc.documentElement.classList.remove('intro-bar'); } catch (e) {}
    try { win.scrollTo(0, 0); } catch (e) {}
    try { win.localStorage.setItem('sijil.intro.seen', '1'); } catch (e) {}
    log('finished');
  }

  function disposeTexturesOf(m) {
    if (!m) return;
    for (var k in m) { var v = m[k]; if (v && v.isTexture) { try { v.dispose(); } catch (e) {} } }
    if (m.uniforms) {
      for (var u in m.uniforms) { var uv = m.uniforms[u] && m.uniforms[u].value; if (uv && uv.isTexture) { try { uv.dispose(); } catch (e) {} } }
    }
    try { m.dispose(); } catch (e) {}
  }

  function disposeScene() {
    if (!scene) return;
    var seen = [];
    scene.traverse(function (o) {
      if (o.geometry && seen.indexOf(o.geometry) < 0) { seen.push(o.geometry); try { o.geometry.dispose(); } catch (e) {} }
      var m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach(function (mm) { if (seen.indexOf(mm) < 0) { seen.push(mm); disposeTexturesOf(mm); } });
    });
    if (scene.background && scene.background.isTexture) { try { scene.background.dispose(); } catch (e) {} }
    if (scene.environment && scene.environment.isTexture) { try { scene.environment.dispose(); } catch (e) {} }
    while (scene.children.length) scene.remove(scene.children[0]);
  }

  /* ───────────── الإدخال (الميل) ───────────── */
  function setupInput() {
    if (isMobile) {
      win.addEventListener('touchstart', onTouchStart, { passive: true });
      win.addEventListener('touchmove', onTouchMove, { passive: true });
    } else {
      win.addEventListener('pointermove', onPointerMove, { passive: true });
    }
  }

  function onPointerMove(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    tiltTarget.x = clamp((e.clientX / win.innerWidth) * 2 - 1, -1, 1);
    tiltTarget.y = clamp((e.clientY / win.innerHeight) * 2 - 1, -1, 1);
    wake();
  }

  function onTouchStart(e) {
    var t = e.touches && e.touches[0];
    lastTouch = t ? [t.clientX, t.clientY] : null;
  }

  function onTouchMove(e) {
    var t = e.touches && e.touches[0];
    if (!t) return;
    if (!lastTouch) { lastTouch = [t.clientX, t.clientY]; return; }
    var dx = (t.clientX - lastTouch[0]) / win.innerWidth;
    var dy = (t.clientY - lastTouch[1]) / win.innerHeight;
    lastTouch = [t.clientX, t.clientY];
    tiltTarget.x = clamp(tiltTarget.x + dx * 3, -1, 1);
    tiltTarget.y = clamp(tiltTarget.y + dy * 1.2, -1, 1);
    wake();
  }

  /* ───────────── الحلقة (رسم عند الطلب؛ تسكن في الخمول وتستيقظ بالأحداث) ───────────── */
  function startLoop() {
    if (running || state.finished) return;
    running = true;
    lastFrame = 0;
    prevDrawn = false;
    dirty = true;
    schedule();
  }

  function stopLoop() {
    running = false;
    if (rafId) { win.cancelAnimationFrame(rafId); rafId = 0; }
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
  }

  function schedule() {
    if (!running || rafId) return;
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
    rafId = win.requestAnimationFrame(frame);
  }

  function wake() {
    dirty = true;
    if (running && !rafId) schedule();
  }

  function onVisibility() {
    if (doc.hidden) stopLoop();
    else if (!finishing) startLoop();
  }

  function mediaActive() {
    var m = NS.media;
    if (!m) return false;
    try {
      if (typeof m.isPlaying === 'function') return !!m.isPlaying();
      if (typeof m.activeVideo === 'function') return !!m.activeVideo();
      if (typeof m.active === 'function') return !!m.active();
      return !!(m.activeVideo || m.playing || m.active);
    } catch (e) { return false; }
  }

  function frame(ms) {
    rafId = 0;
    if (!running) return;
    var now = ms / 1000;
    var dt = lastFrame ? clamp(now - lastFrame, 0.001, 0.1) : 1 / 60;
    lastFrame = now;
    ctx.time = nowSec() - t0;

    if (now - velStamp > 0.12) velTarget = 0;
    var v = lerp(state.velocity, velTarget, 0.1);
    if (Math.abs(v) < 0.0005) v = 0;
    if (v !== state.velocity) { state.velocity = ctx.velocity = v; dirty = true; }

    if (isMobile) { tiltTarget.x *= 0.93; tiltTarget.y *= 0.93; }
    var tx = lerp(tilt.x, tiltTarget.x, 0.08), ty = lerp(tilt.y, tiltTarget.y, 0.08);
    if (Math.abs(tx - tilt.x) > 0.0004 || Math.abs(ty - tilt.y) > 0.0004) { tilt.x = tx; tilt.y = ty; dirty = true; }

    if (hud && now - hudStamp > 0.25) { hudStamp = now; updateHud(); }

    var need = dirty || settling || (ctx.time < WARM_SEC) || mediaActive() || (now - lastRender > IDLE_MS / 1000);
    if (!need) {
      prevDrawn = false;
      /* سكون تام: لا rAF؛ رسمة السكون بعد 250ms أو فور أي حدث عبر wake() */
      if (!idleTimer) idleTimer = setTimeout(function () { idleTimer = 0; schedule(); }, IDLE_MS);
      return;
    }
    dirty = false;
    render(dt);
    lastRender = now;
    monitor(now, dt);
    schedule();
  }

  function render(dt) {
    updateStations();
    updateCamera(dt, snapNext);
    snapNext = false;
    if (world) {
      callOn(world, 'update', ctx.time, state.t);
      callOn(world, 'setTime', state.t, ctx);
    }
    callOn(NS.ui, 'setActive', state.i, state.p);
    callOn(NS.media, 'tick', ctx.time);
    updateParticles(dt);
    renderer.render(scene, camera);
    var inf = renderer.info && renderer.info.render;
    if (inf) { state.tris = inf.triangles; state.calls = inf.calls; }
    if (!firstFrameDone) {
      firstFrameDone = true;
      try { intro.classList.add('is-live'); } catch (e) {}
    }
  }

  function updateStations() {
    var r = remap(state.t);
    state.i = r.i; state.p = r.p;
    for (var k = 0; k < stations.length; k++) {
      var s = stations[k];
      var near = Math.abs(k - r.i) <= 1;
      if (s.group) s.group.visible = near;
      if (near && !s._loaded) { s._loaded = true; callOn(s, 'load', ctx); }
      else if (!near && s._loaded) { s._loaded = false; callOn(s, 'unload', ctx); }
    }
    var a = stations[r.i];
    state.active = a ? a.id : null;
    /* زاوية الرؤية: 62 جوال عمودي، وإلا قيمة المحطة (fovDesktop) أو 45 */
    fovWant = (isMobile && win.innerHeight > win.innerWidth) ? 62 : ((a && +a.fovDesktop) || fovBase);
    if (a && typeof a.update === 'function') { try { a.update(r.p, ctx); } catch (e) { warn('update ' + a.id, e); } }
  }

  function updateCamera(dt, snap) {
    var u = curveParam(state.t);
    curvePos.getPoint(u, tgtPos);
    curveLook.getPoint(u, tgtLook);
    if (isMobile) tgtPos.y += 0.4;
    var f = dt * 60;
    if (snap) { camPos.copy(tgtPos); camLook.copy(tgtLook); if (camera.fov !== fovWant) { camera.fov = fovWant; camera.updateProjectionMatrix(); } }
    else {
      camPos.lerp(tgtPos, 1 - Math.pow(1 - 0.12, f));
      camLook.lerp(tgtLook, 1 - Math.pow(1 - 0.08, f));
      if (Math.abs(camera.fov - fovWant) > 0.01) {
        camera.fov = lerp(camera.fov, fovWant, 1 - Math.pow(1 - 0.06, f));
        if (Math.abs(camera.fov - fovWant) <= 0.01) camera.fov = fovWant;
        camera.updateProjectionMatrix();
      }
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    if (tilt.x || tilt.y) { camera.rotateY(-tilt.x * TILT_RAD); camera.rotateX(-tilt.y * TILT_RAD); }
    settling = camPos.distanceToSquared(tgtPos) > 4e-6 || camLook.distanceToSquared(tgtLook) > 4e-6 || camera.fov !== fovWant;
  }

  /* ───────────── ترجمة الشادرات مسبقاً ─────────────
     كل مجموعات المحطات مرئية + توائم Lambert من العالم في مشهد الترجمة، ثم رسمة إلى هدف 4×4 لإجبار الترجمة الفعلية */
  function precompile() {
    precompileTimer = 0;
    if (precompiled || state.finished || !renderer || !scene) return;
    precompiled = true;
    var T = win.THREE, prev = [], twins = null, t1 = nowSec();
    stations.forEach(function (s) { if (s.group) { prev.push(s.group.visible); s.group.visible = true; } });
    try { if (world && typeof world.twinObjects === 'function') { twins = world.twinObjects(); if (twins) scene.add(twins); } } catch (e) { twins = null; }
    try { renderer.compile(scene, camera); } catch (e) { warn('compile', e); }
    var rt = null;
    try {
      rt = new T.WebGLRenderTarget(4, 4);
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
    } catch (e) { warn('precompile render', e); }
    try { renderer.setRenderTarget(null); } catch (e) {}
    try { if (rt) rt.dispose(); } catch (e) {}
    if (twins) { try { scene.remove(twins); if (typeof world.disposeTwinObjects === 'function') world.disposeTwinObjects(twins); } catch (e) {} }
    stations.forEach(function (s, k) { if (s.group) s.group.visible = prev[k]; });
    wake();
    log('precompiled in', Math.round((nowSec() - t1) * 1000) + 'ms', 'programs', renderer.info.programs ? renderer.info.programs.length : '?');
  }

  /* ───────────── المراقب التكيّفي (القرار 10) ─────────────
     الإحماء (أول ثانيتين، رسم متواصل): يُراكم زمن الإطارات تحت 45/30fps ويقرر عند نهايته قبل أول تمرير.
     بعدها: تُقاس الإطارات المتتالية المرسومة فقط (لا رسمات السكون) ويُقرَّر بعد ثانيتين من البطء. */
  function monitor(now, dt) {
    if (!prevDrawn) { prevDrawn = true; return; }
    var inst = 1 / dt;
    fpsEma = fpsEma ? lerp(fpsEma, inst, 0.15) : inst;
    state.fps = Math.round(fpsEma);
    if (!adaptive) return;
    if (ctx.time < WARM_SEC) {
      if (ctx.time < WARM_SKIP) return;
      warmSamples++;
      if (inst < 45) lowAcc += dt;
      if (inst < 30) lowAcc30 += dt;
      return;
    }
    if (!warmDecided) {
      warmDecided = true;
      var win45 = lowAcc >= (WARM_SEC - WARM_SKIP) * 0.5, win30 = lowAcc30 >= (WARM_SEC - WARM_SKIP) * 0.5;
      if (win30 && state.quality !== 'light') { degrade(); setQuality('light'); log('adaptive(warm): quality → light', Math.round(fpsEma) + 'fps'); }
      else if (win45) { degrade(); log('adaptive(warm): degrade', Math.round(fpsEma) + 'fps'); }
      lowAcc = 0; lowAcc30 = 0;
      coolUntil = now + 1.5;
      return;
    }
    if (now < coolUntil) { lowAcc = 0; return; }
    if (fpsEma < 45) lowAcc += dt; else lowAcc = 0;
    if (lowAcc >= 2) {
      lowAcc = 0;
      coolUntil = now + 1.5;
      if (fpsEma < 30 && state.quality !== 'light') { degrade(); setQuality('light'); log('adaptive: quality → light', Math.round(fpsEma) + 'fps'); }
      else degrade();
    }
  }

  function degrade() {
    var d = Math.max(1, Math.round((state.dpr - 0.25) * 100) / 100);
    if (d < state.dpr) {
      state.dpr = ctx.dpr = d;
      try { renderer.setPixelRatio(d); } catch (e) {}
      resize();
    }
    halvings = Math.min(halvings + 1, 2);
    if (state.quality === 'high') setQuality('mid'); else applyParticleBudget();
    log('adaptive: dpr', state.dpr, 'particles', particleCount, 'fps', Math.round(fpsEma));
  }

  function setQuality(q) {
    if (q !== 'high' && q !== 'mid' && q !== 'light') return;
    state.quality = ctx.quality = q;
    if (q === 'mid' && halvings < 1) halvings = 1;
    applyParticleBudget();
    ['world', 'media', 'ui'].forEach(function (n) { callOn(NS[n], 'setQuality', q, ctx); });
    stations.forEach(function (s) { callOn(s, 'setQuality', q, ctx); });
    try { win.dispatchEvent(new CustomEvent('sijil-intro-quality', { detail: { quality: q } })); } catch (e) {}
    wake();
  }

  /* ───────────── الجزيئات الذهبية (القسم 10) ───────────── */
  var PART_VERT = [
    'attribute float aSize;',
    'attribute float aPhase;',
    'uniform float uTime;',
    'uniform float uScale;',
    'varying float vAlpha;',
    'void main(){',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  float d = max(-mv.z, 0.001);',
    '  float tw = 0.65 + 0.35 * sin(uTime * 1.7 + aPhase);',
    '  vAlpha = tw * smoothstep(0.35, 2.2, d) * smoothstep(30.0, 14.0, d);',
    '  gl_PointSize = aSize * uScale / d;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');
  var PART_FRAG = [
    'uniform sampler2D uMap;',
    'uniform vec3 uColor;',
    'uniform float uOpacity;',
    'varying float vAlpha;',
    'void main(){',
    '  float a = texture2D(uMap, gl_PointCoord).a * vAlpha * uOpacity;',
    '  gl_FragColor = vec4(uColor * a, a);',
    '}'
  ].join('\n');

  function makeSprite() {
    var T = win.THREE;
    var c = doc.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.22, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    var tex = new T.CanvasTexture(c);
    tex.minFilter = T.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  function buildParticles() {
    var T = win.THREE;
    try {
      particleN = isMobile ? PARTICLES_MOBILE : PARTICLES_DESKTOP;
      var geo = new T.BufferGeometry();
      particleArr = new Float32Array(particleN * 3);
      var size = new Float32Array(particleN), phase = new Float32Array(particleN);
      for (var i = 0; i < particleN; i++) { size[i] = rand(0.08, 0.26); phase[i] = rand(0, Math.PI * 2); }
      geo.setAttribute('position', new T.BufferAttribute(particleArr, 3));
      geo.setAttribute('aSize', new T.BufferAttribute(size, 1));
      geo.setAttribute('aPhase', new T.BufferAttribute(phase, 1));
      var mat = new T.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: state.dpr * win.innerHeight * 0.5 },
          uMap: { value: makeSprite() },
          uColor: { value: new T.Color(GOLD) },
          uOpacity: { value: 0.85 }
        },
        vertexShader: PART_VERT, fragmentShader: PART_FRAG,
        transparent: true, depthWrite: false, depthTest: true, blending: T.AdditiveBlending
      });
      particles = new T.Points(geo, mat);
      particles.name = 'gold-particles';
      particles.frustumCulled = false;
      particles.renderOrder = 10;
      scene.add(particles);
      particlesFresh = true;
      NS.particles = particles;
    } catch (e) { warn('particles', e); particles = null; }
  }

  function applyParticleBudget() {
    if (!particles) return;
    if (state.quality === 'light') { particles.visible = false; particleCount = 0; return; }
    particleCount = Math.max(50, particleN >> halvings);
    particles.geometry.setDrawRange(0, particleCount);
    particles.visible = true;
  }

  function respawn(i, mode, speed) {
    var dz;
    if (mode === 'fresh') dz = rand(1, 24);
    else if (speed > 0.5) dz = rand(18, 26);
    else if (speed < -0.5) dz = rand(-1.4, 3);
    else dz = rand(1, 24);
    var dx = rand(-9, 9), dy = rand(-4, 5);
    var ix = i * 3, cp = camera.position;
    particleArr[ix] = cp.x + fwd.x * dz + right.x * dx + upv.x * dy;
    particleArr[ix + 1] = cp.y + fwd.y * dz + right.y * dx + upv.y * dy;
    particleArr[ix + 2] = cp.z + fwd.z * dz + right.z * dx + upv.z * dy;
  }

  function updateParticles(dt) {
    if (!particles || !particles.visible) return;
    camera.updateMatrixWorld();
    camera.getWorldDirection(fwd);
    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    upv.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    var speed = state.velocity * 14;
    var cp = camera.position, time = ctx.time;
    var fresh = particlesFresh;
    particlesFresh = false;
    for (var i = 0; i < particleCount; i++) {
      var ix = i * 3;
      var x = particleArr[ix] - cp.x, y = particleArr[ix + 1] - cp.y, z = particleArr[ix + 2] - cp.z;
      var depth = x * fwd.x + y * fwd.y + z * fwd.z;
      var lat = x * right.x + y * right.y + z * right.z;
      var vert = x * upv.x + y * upv.y + z * upv.z;
      if (fresh || depth < -1.5 || depth > 26 || lat > 12 || lat < -12 || vert > 9 || vert < -9) {
        respawn(i, fresh ? 'fresh' : 'flow', speed);
        continue;
      }
      var drift = Math.sin(time * 0.7 + i * 0.37) * 0.22;
      particleArr[ix] += (-fwd.x * speed + right.x * drift) * dt;
      particleArr[ix + 1] += (-fwd.y * speed + 0.1 + upv.y * drift * 0.3) * dt;
      particleArr[ix + 2] += (-fwd.z * speed + right.z * drift) * dt;
    }
    particles.geometry.attributes.position.needsUpdate = true;
    particles.material.uniforms.uTime.value = time;
  }

  /* ───────────── HUD للتصحيح ───────────── */
  function makeHud() {
    hud = doc.createElement('div');
    hud.id = 'intro-hud';
    hud.style.cssText = 'position:fixed;inset-inline-start:8px;bottom:8px;z-index:2147483000;font:12px/1.45 monospace;' +
      'color:#F0D99A;background:rgba(7,19,34,.78);padding:6px 9px;border-radius:6px;pointer-events:none;direction:ltr;white-space:pre';
    doc.body.appendChild(hud);
  }

  function updateHud() {
    if (!hud) return;
    hud.textContent =
      'fps ' + state.fps + '  dpr ' + state.dpr + '  q ' + state.quality + '\n' +
      'tris ' + state.tris + '  calls ' + state.calls + '\n' +
      'i ' + state.i + ' (' + (state.active || '-') + ')  p ' + state.p.toFixed(3) + '  t ' + state.t.toFixed(3) + '\n' +
      'vel ' + state.velocity.toFixed(2) + (state.fastJump ? '  fast' : '') + (isMobile ? '  mobile' : '');
  }

  /* ───────────── التصدير ───────────── */
  NS.registerStation = registerStation;
  NS.start = start;
  NS.ease = ease;
  NS.lerp = lerp;
  NS.clamp = clamp;
  NS.remap = remap;
  NS.setQuality = setQuality;
  NS.DIR = DIR;
  NS.finish = finish;
  NS.jumpTo = jumpTo;
  NS.wake = wake;
  NS.stations = stations;
})(window, document);
