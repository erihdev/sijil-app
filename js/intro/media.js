/* سجل المتابعة الرقمي — الجولة السينمائية: الوسائط (نسيج، أطلس، شاشات، فيديو) */
(function () {
  'use strict';
  var NS = window.SIJIL_INTRO = window.SIJIL_INTRO || {};
  var THREE = window.THREE;
  if (!THREE) return;

  var UI_DIR = 'assets/intro/ui/';
  var ATLAS_DESKTOP = 'assets/intro/lessons-atlas.webp';
  var ATLAS_MOBILE = 'assets/intro/lessons-atlas-m.webp';
  var ATLAS_COLS = 8, ATLAS_ROWS = 6;
  var PROC_W = 512, PROC_H = 288, PROC_INTERVAL = 1000 / 12, PROC_INTERVAL_IDLE = 1000 / 8;
  var COLORS = { night: '#071322', navy: '#0E2033', gold: '#D7A93F', paleGold: '#F0D99A', sky: '#9FC4E8', cream: '#F8F5EF' };
  var SRGB = THREE.SRGBColorSpace || 'srgb';

  var textureCache = {};
  var allTextures = [];
  var canvasItems = [];
  var screens = [];
  var atlasTex = null;
  var activeVideoScreen = null;
  var placeholderCanvas = null;
  var placeholderTex = null;
  var frameMats = {};
  var fontsPromise = null;
  var flushQueued = false;

  /* ---------- أدوات ---------- */
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function isMobile() {
    if (NS.ctx && typeof NS.ctx.isMobile === 'boolean') return NS.ctx.isMobile;
    try { return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches; } catch (e) { return false; }
  }
  function quality() { return (NS.state && NS.state.quality) || (NS.ctx && NS.ctx.quality) || 'high'; }
  function fastJump() { return !!(NS.state && NS.state.fastJump); }
  function ctxTime() { return (NS.ctx && typeof NS.ctx.time === 'number') ? NS.ctx.time : now() / 1000; }

  function prepTexture(tex) {
    tex.colorSpace = SRGB;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 1;
    return tex;
  }

  function placeholder() {
    if (placeholderCanvas) return placeholderCanvas;
    placeholderCanvas = document.createElement('canvas');
    placeholderCanvas.width = 2; placeholderCanvas.height = 2;
    try {
      var c = placeholderCanvas.getContext('2d');
      c.fillStyle = COLORS.navy; c.fillRect(0, 0, 2, 2);
    } catch (e) {}
    return placeholderCanvas;
  }
  function placeholderTexture() {
    if (placeholderTex) return placeholderTex;
    placeholderTex = prepTexture(new THREE.Texture(placeholder()));
    placeholderTex.needsUpdate = true;
    placeholderTex.userData = { url: '', ready: true, failed: false, aspect: 1, waiters: [] };
    return placeholderTex;
  }

  function whenFonts(fn) {
    if (!(document.fonts && document.fonts.ready)) { fn(); return; }
    if (!fontsPromise) {
      var loads = [];
      try { loads.push(document.fonts.load('700 28px Tajawal')); } catch (e) {}
      try { loads.push(document.fonts.load('800 28px Changa')); } catch (e) {}
      fontsPromise = Promise.all(loads.map(function (p) { return p.then(null, function () { return null; }); }))
        .then(function () { return document.fonts.ready; })
        .then(null, function () { return null; });
    }
    fontsPromise.then(fn, fn);
  }

  /* ---------- النسيج ---------- */
  function fireReady(tex) {
    var w = tex.userData.waiters || [];
    tex.userData.waiters = [];
    for (var i = 0; i < w.length; i++) { try { w[i](tex); } catch (e) {} }
  }
  function onReady(tex, fn) {
    if (!tex || !tex.userData) { try { fn(tex); } catch (e) {} return; }
    if (tex.userData.ready || tex.userData.failed) { try { fn(tex); } catch (e) {} return; }
    (tex.userData.waiters = tex.userData.waiters || []).push(fn);
  }

  function texture(url) {
    if (!url) return placeholderTexture();
    if (textureCache[url]) return textureCache[url];
    var tex = prepTexture(new THREE.Texture(placeholder()));
    tex.needsUpdate = true;
    tex.userData = { url: url, ready: false, failed: false, aspect: 1, waiters: [] };
    textureCache[url] = tex;
    allTextures.push(tex);
    try {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = function () {
        if (tex.userData.disposed) return;
        try { tex.dispose(); } catch (e) {}
        tex.image = img;
        tex.needsUpdate = true;
        tex.userData.ready = true;
        tex.userData.aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);
        fireReady(tex);
      };
      img.onerror = function () { tex.userData.failed = true; fireReady(tex); };
      img.src = url;
    } catch (e) { tex.userData.failed = true; }
    return tex;
  }

  function urlOf(name) {
    if (!name) return '';
    if (name.indexOf('/') >= 0 || /\.(webp|png|jpe?g)$/i.test(name)) return name;
    return UI_DIR + name + '.webp';
  }
  function ui(name) {
    if (!name) return placeholderTexture();
    return texture(urlOf(name));
  }
  /* تحرير كامل (نسخة GPU + الصورة المفكوكة): يُحذف من المخبأ فيُعاد جلبه من مخبأ المتصفح عند الطلب التالي */
  function release(name) {
    var url = (name && name.isTexture) ? (name.userData && name.userData.url) : urlOf(name);
    if (!url) return;
    var tex = textureCache[url];
    if (!tex) return;
    delete textureCache[url];
    var k = allTextures.indexOf(tex); if (k >= 0) allTextures.splice(k, 1);
    tex.userData.disposed = true;
    tex.userData.ready = false;
    try { tex.dispose(); } catch (e) {}
    try { tex.image = placeholder(); } catch (e) {}
    if (atlasTex === tex) atlasTex = null;
  }

  function atlas() {
    if (atlasTex) return atlasTex;
    atlasTex = texture(isMobile() ? ATLAS_MOBILE : ATLAS_DESKTOP);
    return atlasTex;
  }
  function atlasUV(i) {
    var n = ATLAS_COLS * ATLAS_ROWS;
    i = ((Math.floor(i) % n) + n) % n;
    var col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
    var w = 1 / ATLAS_COLS, h = 1 / ATLAS_ROWS;
    return { u: col * w, v: 1 - (row + 1) * h, w: w, h: h };
  }

  /* ---------- نسيج canvas ---------- */
  function setArabicDefaults(c2d) {
    c2d.direction = 'rtl';
    c2d.textAlign = 'right';
    c2d.textBaseline = 'middle';
    c2d.font = '700 28px Tajawal, Changa, system-ui, sans-serif';
  }
  function queueFlush() {
    if (flushQueued) return;
    flushQueued = true;
    var raf = window.requestAnimationFrame || function (f) { setTimeout(f, 16); };
    raf(function () { flushQueued = false; flushCanvases(); });
  }
  function flushCanvases() {
    for (var i = 0; i < canvasItems.length; i++) if (canvasItems[i].dirty) canvasItems[i].paint();
  }

  function canvasTexture(w, h, draw) {
    w = w || 512; h = h || 288;
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var c2d = null;
    try { c2d = canvas.getContext('2d'); } catch (e) {}
    var tex = prepTexture(new THREE.CanvasTexture(canvas));
    tex.userData = { url: '', ready: true, failed: false, aspect: w / h, waiters: [] };
    allTextures.push(tex);
    var item = { dirty: false, disposed: false, texture: tex };
    item.paint = function () {
      if (item.disposed) return;
      item.dirty = false;
      if (!c2d) return;
      try {
        c2d.save();
        c2d.setTransform(1, 0, 0, 1, 0, 0);
        c2d.clearRect(0, 0, w, h);
        setArabicDefaults(c2d);
        if (typeof draw === 'function') draw(c2d, w, h);
        c2d.restore();
      } catch (e) { try { c2d.restore(); } catch (e2) {} }
      tex.needsUpdate = true;
    };
    function redraw(immediate) {
      if (item.disposed) return;
      if (immediate) { item.paint(); return; }
      item.dirty = true;
      queueFlush();
    }
    canvasItems.push(item);
    item.paint();
    whenFonts(function () { redraw(); });
    return {
      texture: tex, canvas: canvas, redraw: redraw,
      dispose: function () {
        item.disposed = true;
        var k = canvasItems.indexOf(item); if (k >= 0) canvasItems.splice(k, 1);
        k = allTextures.indexOf(tex); if (k >= 0) allTextures.splice(k, 1);
        try { tex.dispose(); } catch (e) {}
      }
    };
  }

  /* ---------- الشادر ---------- */
  var VERT = [
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform sampler2D uMap;',
    'uniform float uOpen, uMode, uTime, uAspect, uTexAspect, uFit, uBright;',
    'uniform vec3 uBase, uGold;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec2 uv = vUv;',
    '  float ratio = max(uTexAspect, 0.001) / max(uAspect, 0.001);',
    '  vec2 sc = vec2(1.0);',
    '  if (uFit > 0.5 && uFit < 1.5) { sc = ratio > 1.0 ? vec2(1.0, ratio) : vec2(1.0 / ratio, 1.0); }',
    '  else if (uFit >= 1.5) { sc = ratio > 1.0 ? vec2(1.0 / ratio, 1.0) : vec2(1.0, ratio); }',
    '  vec2 tuv = (uv - 0.5) * sc + 0.5;',
    '  float inside = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);',
    '  vec3 col = mix(uBase, texture2D(uMap, clamp(tuv, 0.0, 1.0)).rgb, inside) * uBright;',
    '  vec2 c = (uv - 0.5) * vec2(uAspect, 1.0);',
    '  float dn = length(vec2(uAspect * 0.5, 0.5));',
    '  float d = length(c) / dn;',
    '  col *= 1.0 - 0.22 * smoothstep(0.45, 1.1, d);',
    '  if (uMode > 0.5 && uMode < 1.5) {',
    '    float gl = smoothstep(0.35, 0.0, abs((uv.x + uv.y * 0.35) - 0.9 - sin(uTime * 0.4) * 0.05));',
    '    col += uGold * 0.035 * gl;',
    '  }',
    '  float r = uOpen * 1.02;',
    '  float m = 1.0 - smoothstep(r, r + 0.01, d);',
    '  col = mix(uBase * 0.55, col, m);',
    '  float ring = (1.0 - smoothstep(0.0, 0.012, abs(d - r))) * (1.0 - smoothstep(0.97, 1.0, uOpen)) * step(0.001, uOpen);',
    '  float shimmer = 0.85 + 0.15 * sin(uTime * 6.0 + d * 40.0);',
    '  col = mix(col, uGold * shimmer * 1.3, ring);',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  function frameMaterial(kind) {
    if (frameMats[kind]) return frameMats[kind];
    var color = kind === 'gold' ? COLORS.gold : COLORS.navy;
    var mat;
    try {
      if (isMobile() || quality() === 'light') {
        mat = new THREE.MeshLambertMaterial({ color: color, emissive: color, emissiveIntensity: kind === 'gold' ? 0.18 : 0.05 });
      } else {
        mat = new THREE.MeshStandardMaterial({ color: color, metalness: kind === 'gold' ? 0.55 : 0.1, roughness: kind === 'gold' ? 0.38 : 0.7, emissive: color, emissiveIntensity: kind === 'gold' ? 0.12 : 0.04 });
      }
    } catch (e) { mat = new THREE.MeshBasicMaterial({ color: color }); }
    frameMats[kind] = mat;
    return mat;
  }

  function fitCode(fit) {
    if (fit === 'contain') return 1;
    if (fit === 'cover') return 2;
    return 0;
  }

  function defaultProcedural(c, w, h, time) {
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#12253c'); g.addColorStop(1, COLORS.night);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(215,169,63,0.35)'; c.lineWidth = 2;
    for (var i = 1; i < 5; i++) {
      var y = h * i / 5 + Math.sin(time * 0.8 + i) * 6;
      c.beginPath(); c.moveTo(w * 0.1, y); c.lineTo(w * 0.9, y); c.stroke();
    }
    var gx = w * (0.5 + 0.35 * Math.sin(time * 0.5));
    var rg = c.createRadialGradient(gx, h * 0.5, 0, gx, h * 0.5, h * 0.7);
    rg.addColorStop(0, 'rgba(240,217,154,0.35)'); rg.addColorStop(1, 'rgba(240,217,154,0)');
    c.fillStyle = rg; c.fillRect(0, 0, w, h);
    c.fillStyle = COLORS.paleGold;
    c.font = '800 40px Changa, Tajawal, sans-serif';
    c.textAlign = 'center';
    c.fillText('سجل المتابعة الرقمي', w / 2, h / 2);
  }

  function worldVisible(obj) {
    var o = obj, guard = 0;
    while (o && guard++ < 64) { if (o.visible === false) return false; o = o.parent; }
    return true;
  }

  /* ---------- مقاطع الفيديو: assets/intro/video/manifest.json ---------- */
  var clipsPromise = null, clipsMap = null;
  function loadClips() {
    if (clipsPromise) return clipsPromise;
    clipsPromise = new Promise(function (resolve) {
      var done = function (m) { clipsMap = m || {}; resolve(clipsMap); };
      try {
        if (typeof fetch !== 'function') return done({});
        fetch('assets/intro/video/manifest.json?v=38', { cache: 'no-cache' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { done(j && j.clips ? j.clips : {}); }, function () { done({}); });
      } catch (e) { done({}); }
    });
    return clipsPromise;
  }
  function isMobileCtx() { try { return !!(NS.ctx && NS.ctx.isMobile); } catch (e) { return false; } }

  /* ---------- الشاشة ---------- */
  function screen(opts) {
    opts = opts || {};
    if (opts.clip && !opts.video) {
      loadClips().then(function (map) {
        var k = map && map[opts.clip];
        if (!k || !k.mp4 || !s || s.disposed) return;
        opts.video = (isMobileCtx() && k.mobile) ? k.mobile : k.mp4;
        if (s.active) { try { startVideo(); } catch (e) {} }
      });
    }
    var width = opts.width || 6, height = opts.height || 3.375;
    var fit = opts.fit || ((opts.poster || opts.texture) ? 'contain' : 'stretch');
    var uniforms = {
      uMap: { value: placeholderTexture() },
      uOpen: { value: opts.open != null ? clamp(opts.open, 0, 1) : 1 },
      uMode: { value: 2 },
      uTime: { value: 0 },
      uAspect: { value: width / height },
      uTexAspect: { value: width / height },
      uFit: { value: fitCode(fit) },
      uBright: { value: opts.bright != null ? opts.bright : 1 },
      uBase: { value: new THREE.Color(opts.base || COLORS.navy) },
      uGold: { value: new THREE.Color(COLORS.gold) }
    };
    var material = new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: VERT, fragmentShader: FRAG, toneMapped: false, side: opts.side || THREE.FrontSide });
    var geometry = new THREE.PlaneGeometry(width, height);
    var mesh = new THREE.Mesh(geometry, material);
    mesh.name = opts.name || 'screen';

    var frame = null;
    var frameKind = opts.frame || 'none';
    if (frameKind === 'gold' || frameKind === 'navy') {
      var b = opts.frameWidth || clamp(0.05 * Math.min(width, height), 0.04, 0.2);
      var depth = opts.frameDepth || 0.06;
      try {
        frame = new THREE.Mesh(new THREE.BoxGeometry(width + 2 * b, height + 2 * b, depth), frameMaterial(frameKind));
        frame.position.z = -depth / 2 - 0.003;
        frame.name = mesh.name + '-frame';
        mesh.add(frame);
      } catch (e) { frame = null; }
    }

    var s = {
      mesh: mesh, material: material, uniforms: uniforms, frame: frame, opts: opts,
      width: width, height: height,
      active: false, mode: 2, progress: 0,
      poster: null, videoTex: null, videoFailed: false, videoEl: null,
      canvas: null, c2d: null, procTex: null, lastProc: -1e9, procDrawn: false, disposed: false
    };

    function setUniformMap(tex) {
      uniforms.uMap.value = tex || placeholderTexture();
      var a = tex && tex.userData && tex.userData.aspect;
      if (tex && tex.image && tex.image.videoWidth) a = tex.image.videoWidth / (tex.image.videoHeight || 1);
      uniforms.uTexAspect.value = a || uniforms.uAspect.value;
    }
    function applyMode(m) {
      s.mode = m;
      uniforms.uMode.value = m;
      if (m === 0 && s.videoTex) { setUniformMap(s.videoTex); return; }
      if (m === 1 && s.poster) { setUniformMap(s.poster); return; }
      ensureProc();
      if (!s.procDrawn) drawProc(ctxTime(), true);
      setUniformMap(s.procTex);
    }
    function fallbackMode() {
      if (s.poster && !s.poster.userData.failed) applyMode(1); else applyMode(2);
    }

    /* الملصق: عند الإنشاء أو لاحقاً عبر setPoster (تحميل كسول من load في المحطة) */
    s.wantMode = 2;
    function attachPoster(tex) {
      s.poster = tex;
      onReady(tex, function (t) {
        if (s.disposed || s.poster !== t) return;
        if (t.userData.failed) { if (s.mode === 1) applyMode(2); return; }
        if (s.wantMode === 1) applyMode(1);
      });
    }
    s.setPoster = function (src) {
      if (s.disposed) return s;
      var tex = (src && src.isTexture) ? src : (src ? ui(src) : null);
      if (!tex) { s.poster = null; if (s.mode === 1) applyMode(2); return s; }
      attachPoster(tex);
      if (s.wantMode === 1 && !tex.userData.failed) applyMode(1);
      return s;
    };
    var posterSrc = opts.texture || opts.poster;
    if (posterSrc) attachPoster(posterSrc.isTexture ? posterSrc : ui(posterSrc));

    /* الإجرائي */
    function ensureProc() {
      if (s.procTex) return;
      try {
        s.canvas = document.createElement('canvas');
        s.canvas.width = PROC_W; s.canvas.height = PROC_H;
        s.c2d = s.canvas.getContext('2d');
        s.procTex = prepTexture(new THREE.CanvasTexture(s.canvas));
        s.procTex.userData = { url: '', ready: true, failed: false, aspect: PROC_W / PROC_H, waiters: [] };
      } catch (e) { s.procTex = placeholderTexture(); s.c2d = null; }
    }
    function drawProc(time, force, slow) {
      if (!s.c2d) return;
      var t = now();
      if (!force && t - s.lastProc < (slow ? PROC_INTERVAL_IDLE : PROC_INTERVAL)) return;
      s.lastProc = t;
      var fn = typeof opts.procedural === 'function' ? opts.procedural : defaultProcedural;
      try {
        s.c2d.save();
        s.c2d.setTransform(1, 0, 0, 1, 0, 0);
        setArabicDefaults(s.c2d);
        fn(s.c2d, PROC_W, PROC_H, time || 0, s.progress);
        s.c2d.restore();
      } catch (e) { try { s.c2d.restore(); } catch (e2) {} }
      s.procTex.needsUpdate = true;
      s.procDrawn = true;
    }

    /* الفيديو */
    function stopVideo(silent) {
      var v = s.videoEl;
      if (v) {
        try { v.onerror = null; v.oncanplay = null; v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
        s.videoEl = null;
      }
      if (s.videoTex) { try { s.videoTex.dispose(); } catch (e) {} s.videoTex = null; }
      if (activeVideoScreen === s) activeVideoScreen = null;
      if (!silent && !s.disposed) fallbackMode();
    }
    function startVideo() {
      if (!opts.video || s.videoFailed || s.videoEl || quality() === 'light' || fastJump()) return;
      if (activeVideoScreen && activeVideoScreen !== s) { try { activeVideoScreen.leave(); } catch (e) {} }
      activeVideoScreen = s;
      var v;
      try {
        v = document.createElement('video');
        v.muted = true; v.defaultMuted = true;
        v.loop = true;
        v.playsInline = true;
        v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('loop', '');
        v.preload = 'none';
        v.setAttribute('preload', 'none');
        s.videoEl = v;
        v.oncanplay = function () {
          if (s.videoEl !== v || s.disposed) return;
          if (!s.videoTex) {
            try {
              s.videoTex = prepTexture(new THREE.VideoTexture(v));
              s.videoTex.userData = { url: opts.video, ready: true, failed: false, aspect: (v.videoWidth || 16) / (v.videoHeight || 9), waiters: [] };
            } catch (e) { s.videoTex = null; }
          }
          if (s.videoTex) applyMode(0);
        };
        v.onerror = function () {
          if (s.videoEl !== v) return;
          s.videoFailed = true;
          stopVideo();
        };
        v.src = opts.video;
        v.load();
        var p = v.play();
        if (p && typeof p.then === 'function') {
          p.then(null, function () { if (s.videoEl === v) stopVideo(); });
        }
      } catch (e) { s.videoFailed = true; stopVideo(); }
    }

    s.enter = function () {
      if (s.disposed) return s;
      s.active = true;
      if (s.mode === 2) { ensureProc(); drawProc(ctxTime(), true); }
      startVideo();
      return s;
    };
    s.leave = function () {
      s.active = false;
      stopVideo();
      return s;
    };
    s.setProgress = function (p) {
      p = clamp(+p || 0, 0, 1);
      s.progress = p;
      if (opts.openFromProgress !== false) {
        var r = opts.openRange;
        uniforms.uOpen.value = r ? clamp((p - r[0]) / ((r[1] - r[0]) || 1), 0, 1) : p;
      }
      return s;
    };
    s.setOpen = function (v) { uniforms.uOpen.value = clamp(+v || 0, 0, 1); return s; };
    s.setMode = function (m) {
      if (m === 'video') m = 0; else if (m === 'poster') m = 1; else if (m === 'procedural') m = 2;
      m = m | 0;
      s.wantMode = m;
      if (m === 0) { if (s.videoTex) applyMode(0); else { fallbackMode(); startVideo(); } }
      else if (m === 1) { if (s.poster && !s.poster.userData.failed) applyMode(1); else applyMode(2); }
      else applyMode(2);
      return s;
    };
    s.redraw = function (time) { if (s.mode === 2) { ensureProc(); drawProc(time == null ? ctxTime() : time, true); } return s; };
    s.tick = function (time) {
      uniforms.uTime.value = time || 0;
      var q = quality();
      if (s.mode === 0 && q === 'light') { stopVideo(); return; }
      if (s.mode !== 2) return;
      if (q === 'light' && s.poster && s.poster.userData.ready && !s.poster.userData.failed) { applyMode(1); return; }
      if (q === 'light' && s.procDrawn) return;
      /* الشاشات المجاورة غير النشطة تبقى على آخر إطار (رسمة واحدة فقط إن لم تُرسم بعد) */
      if (!s.active) { if (!s.procDrawn && worldVisible(mesh)) { ensureProc(); drawProc(time, true); } return; }
      ensureProc();
      var vel = NS.state ? Math.abs(+NS.state.velocity || 0) : 1;
      drawProc(time, false, vel < 0.001);
    };
    s.dispose = function () {
      if (s.disposed) return;
      s.disposed = true;
      stopVideo(true);
      var k = screens.indexOf(s); if (k >= 0) screens.splice(k, 1);
      try { if (frame) { frame.geometry.dispose(); mesh.remove(frame); } } catch (e) {}
      try { if (s.procTex && s.procTex !== placeholderTex) s.procTex.dispose(); } catch (e) {}
      try { geometry.dispose(); material.dispose(); } catch (e) {}
      if (mesh.parent) { try { mesh.parent.remove(mesh); } catch (e) {} }
    };

    /* الوضع الابتدائي */
    if (s.poster) { s.wantMode = 1; applyMode(1); } else applyMode(2);
    screens.push(s);
    return s;
  }

  /* ---------- الدورة ---------- */
  function tick(time) {
    if (typeof time !== 'number' || time !== time) time = ctxTime();
    flushCanvases();
    for (var i = 0; i < screens.length; i++) { try { screens[i].tick(time); } catch (e) {} }
  }

  function disposeAll() {
    var list = screens.slice();
    for (var i = 0; i < list.length; i++) { try { list[i].dispose(); } catch (e) {} }
    for (var k in textureCache) { try { textureCache[k].userData.disposed = true; textureCache[k].dispose(); } catch (e) {} }
    for (var j = 0; j < allTextures.length; j++) { try { allTextures[j].dispose(); } catch (e) {} }
    for (var f in frameMats) { try { frameMats[f].dispose(); } catch (e) {} }
    textureCache = {}; allTextures.length = 0; canvasItems.length = 0; frameMats = {};
    atlasTex = null; activeVideoScreen = null;
    if (placeholderTex) { try { placeholderTex.dispose(); } catch (e) {} placeholderTex = null; }
  }

  NS.media = {
    texture: texture,
    ui: ui,
    release: release,
    atlas: atlas,
    atlasUV: atlasUV,
    canvasTexture: canvasTexture,
    screen: screen,
    clips: loadClips,
    tick: tick,
    onReady: onReady,
    whenFonts: whenFonts,
    dispose: disposeAll,
    screens: screens,
    textures: allTextures,
    colors: COLORS,
    activeVideo: function () { return activeVideoScreen; }
  };
})();
