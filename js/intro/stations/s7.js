/* سجل المتابعة الرقمي — الجولة السينمائية: المحطة 7 «السطح ولوح المدير»
   الكاميرا تصعد عبر الكوّة إلى السطح؛ نوافذ الواجهة تضيء تباعاً، لوح المدير يصير شاشة
   بملصق «admin-more»، و55 عموداً (5 صفوف × 11 مادة) ترتفع فوق السطح بألوان من الأخضر إلى الذهبي،
   وأضواء الحي البعيدة تظهر مع الليل. السماء والإضاءة يقودهما core عبر world.setTime (لا نكررهما هنا). */
(function () {
  'use strict';
  var NS = window.SIJIL_INTRO = window.SIJIL_INTRO || {};
  if (typeof NS.registerStation !== 'function') return;

  var HEADLINE = 'المدير يرى المدرسة كلّها';
  var COPY = 'مستويات الطلاب بالمادة والصف والمدرسة كاملة، في لوحة واحدة تتحدّث مع كل رصد.';
  var PI = Math.PI;
  var ROWS = 5, SUBJECTS = 11, COLS_N = ROWS * SUBJECTS;
  var GREEN = 0x2F8F5B, GOLD = 0xD7A93F, GOLD_PALE = 0xF0D99A, NAVY = '#0E2033', NIGHT = '#071322';
  var ROOF_Y = 4.2;
  var GRID = { x0: 0, z0: -54.5, step: 0.5, w: 0.28, hMin: 0.25, hMax: 1.6 };
  var BOARD = { x: 0, y: 9.5, z: -52.005, w: 4, h: 2.25 };
  var LEVEL_COLORS = ['#2E9E5B', '#6FA36B', '#D7A93F', '#F0D99A', '#d64545'];
  var TABS = ['مستوى المدرسة', 'حسب المادة'];

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function lerp(a, b, t) { return typeof NS.lerp === 'function' ? NS.lerp(a, b, t) : a + (b - a) * t; }
  function ease(n, x) { return typeof NS.ease === 'function' ? NS.ease(n, x) : clamp(x, 0, 1); }
  function seg(p, a, b) { return clamp((p - a) / ((b - a) || 1), 0, 1); }
  function seeded(seed) {
    var s = seed >>> 0 || 1;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ---------- مراجع المحطة ---------- */
  var R = {
    built: false, THREE: null, isMobile: false, DIR: -1, world: null,
    screen: null, boardMesh: null, placeholder: null,
    caption: null, captionTex: null, tab: -1,
    columns: null, heights: null, phases: null, colBase: null,
    lights: null,
    tmpM: null, tmpV: null, tmpS: null, tmpQ: null, tmpC: null
  };

  /* ---------- رسم: شبكة مستويات ملوّنة (البديل الإجرائي للوح) ---------- */
  function drawLevels(c, w, h, time) {
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#12253c'); g.addColorStop(1, NIGHT);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#F0D99A';
    c.font = '800 26px Changa, Tajawal, sans-serif';
    c.textAlign = 'right'; c.textBaseline = 'middle'; c.direction = 'rtl';
    c.fillText('لوحة المدير — مستويات المدرسة', w - 22, 28);
    var pad = 22, top = 54, cw = (w - pad * 2) / SUBJECTS, ch = (h - top - pad) / ROWS;
    var rnd = seeded(7);
    for (var r = 0; r < ROWS; r++) {
      for (var s = 0; s < SUBJECTS; s++) {
        var v = rnd();
        var k = v < 0.42 ? 0 : v < 0.62 ? 1 : v < 0.82 ? 2 : v < 0.93 ? 3 : 4;
        var pulse = 0.85 + 0.15 * Math.sin((time || 0) * 1.5 + s * 0.7 + r * 1.1);
        c.globalAlpha = pulse;
        c.fillStyle = LEVEL_COLORS[k];
        var x = w - pad - (s + 1) * cw + 3, y = top + r * ch + 3;
        c.fillRect(x, y, cw - 6, ch - 6);
      }
    }
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(240,217,154,0.75)';
    c.font = '700 16px Tajawal, sans-serif';
    c.textAlign = 'left';
    c.fillText('٥ صفوف × ١١ مادة', 22, 28);
  }

  /* ---------- رسم: تبويبا اللوح («مستوى المدرسة» / «حسب المادة») ---------- */
  function drawTabs(c, w, h) {
    var gap = 14, tw = (w - gap * 3) / 2, y = 8, th = h - 16, rr = th / 2;
    c.font = '700 30px Tajawal, Changa, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl';
    for (var i = 0; i < 2; i++) {
      var x = i === 0 ? w - gap - tw : gap;
      var on = R.tab === i;
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + tw, y, x + tw, y + th, rr);
      c.arcTo(x + tw, y + th, x, y + th, rr);
      c.arcTo(x, y + th, x, y, rr);
      c.arcTo(x, y, x + tw, y, rr);
      c.closePath();
      c.fillStyle = on ? '#D7A93F' : 'rgba(14,32,51,0.82)';
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = on ? '#F0D99A' : 'rgba(215,169,63,0.6)';
      c.stroke();
      c.fillStyle = on ? NAVY : '#F0D99A';
      c.fillText(TABS[i], x + tw / 2, y + th / 2 + 2);
    }
  }

  /* ---------- البناء ---------- */
  function build(ctx) {
    var THREE = (ctx && ctx.THREE) || window.THREE;
    var group = this && this.group ? this.group : null;
    if (!THREE || !group || R.built) return;
    R.built = true;
    R.THREE = THREE;
    R.isMobile = !!(ctx && ctx.isMobile);
    R.DIR = (ctx && typeof ctx.DIR === 'number') ? ctx.DIR : (typeof NS.DIR === 'number' ? NS.DIR : -1);
    R.world = (ctx && ctx.world) || NS.world || null;
    /* على المكتب تنزاح الشبكة قليلاً نحو يسار الشاشة (+x) بعيداً عن نص المحطة على اليمين */
    GRID.x0 = R.isMobile ? 0 : 0.8;
    R.tmpM = new THREE.Matrix4(); R.tmpV = new THREE.Vector3(); R.tmpS = new THREE.Vector3();
    R.tmpQ = new THREE.Quaternion(); R.tmpC = new THREE.Color();
    var media = ctx && ctx.media, k;

    /* لوح المدير: شاشة media بملصق admin-more (الإطار الكحلي موجود في العالم)؛ نخفي المستوي المؤقت */
    try {
      var ph = R.world && R.world.adminBoard;
      if (ph && ph.isMesh) { R.placeholder = ph; ph.visible = false; }
      if (media && typeof media.screen === 'function') {
        /* لقطة admin-more تُطلب في load() لا هنا (القسم 4) */
        R.screen = media.screen({
          width: BOARD.w, height: BOARD.h, poster: null, frame: 'none', fit: 'contain',
          open: 0, openFromProgress: false, bright: 1.04, procedural: drawLevels, name: 's7-admin'
        });
        R.boardMesh = R.screen.mesh;
      } else {
        var tex = media && typeof media.ui === 'function' ? media.ui('admin-more') : null;
        R.boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), new THREE.MeshBasicMaterial({ map: tex || null, color: 0xffffff }));
      }
      R.boardMesh.position.set(BOARD.x, BOARD.y, BOARD.z);
      R.boardMesh.rotation.y = PI;
      group.add(R.boardMesh);
    } catch (e) { R.boardMesh = null; R.screen = null; }

    /* تبويبا اللوح فوق الإطار (canvas صغير) */
    try {
      var ct = null;
      if (media && typeof media.canvasTexture === 'function') {
        R.captionTex = media.canvasTexture(512, 80, drawTabs);
        ct = R.captionTex.texture;
      }
      if (ct) {
        R.caption = new THREE.Mesh(new THREE.PlaneGeometry(2.56, 0.4),
          new THREE.MeshBasicMaterial({ map: ct, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
        R.caption.position.set(BOARD.x, BOARD.y + BOARD.h / 2 + 0.52, BOARD.z);
        R.caption.rotation.y = PI;
        R.caption.renderOrder = 4;
        R.caption.visible = false;
        group.add(R.caption);
      }
    } catch (e) { R.caption = null; }

    /* 55 عموداً + 55 غطاءً ذهبياً في InstancedMesh واحد (110 نسخة، رسمة واحدة)؛ تظليل بسيط بألوان الرؤوس */
    try {
      var bg = new THREE.BoxGeometry(1, 1, 1);
      var nrm = bg.attributes.normal, n = nrm.count, vc = new Float32Array(n * 3);
      for (k = 0; k < n; k++) {
        var ny = nrm.getY(k), nx = nrm.getX(k);
        var shade = ny > 0.5 ? 1.0 : ny < -0.5 ? 0.6 : (Math.abs(nx) > 0.5 ? 0.78 : 0.9);
        vc[k * 3] = vc[k * 3 + 1] = vc[k * 3 + 2] = shade;
      }
      bg.setAttribute('color', new THREE.BufferAttribute(vc, 3));
      R.columns = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }), COLS_N * 2);
      R.columns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      R.heights = new Float32Array(COLS_N);
      R.phases = new Float32Array(COLS_N);
      R.colBase = [];
      var rnd = seeded(20260907), cGreen = new THREE.Color(GREEN), cGold = new THREE.Color(GOLD);
      for (k = 0; k < COLS_N; k++) {
        var r = Math.floor(k / SUBJECTS), s = k % SUBJECTS;
        /* ارتفاعات متدرجة: موجة ناعمة عبر المواد والصفوف مع تفاوت طفيف مثبّت */
        var f = clamp(0.5 + 0.34 * Math.sin(s * 0.85 + r * 0.55 + 0.6) + 0.16 * (rnd() - 0.5) + 0.06 * r, 0.05, 1);
        R.heights[k] = lerp(GRID.hMin, GRID.hMax, f);
        R.phases[k] = rnd() * PI * 2;
        /* المواد تبدأ من جهة البداية (اليمين من منظور الكاميرا الناظرة نحو +z أي −x) */
        R.colBase.push([GRID.x0 + R.DIR * (5 - s) * GRID.step, GRID.z0 - r * GRID.step]);
        R.tmpC.copy(cGreen).lerp(cGold, ease('inOut', f)).multiplyScalar(0.96 + rnd() * 0.08);
        R.columns.setColorAt(k, R.tmpC);
        R.tmpC.setHex(GOLD_PALE).multiplyScalar(0.98 + rnd() * 0.04);
        R.columns.setColorAt(COLS_N + k, R.tmpC);
      }
      R.columns.frustumCulled = false;
      R.columns.visible = false;
      R.columns.name = 's7-columns';
      group.add(R.columns);
    } catch (e) { R.columns = null; }

    /* أضواء الحي البعيدة: نقاط ذهبية على مستوى الأرض خارج السور، تظهر مع الليل */
    try {
      var N = R.isMobile ? 50 : 90, pos = new Float32Array(N * 3), lr = seeded(9091), i = 0, guard = 0;
      while (i < N && guard++ < N * 20) {
        var ang = lr() * PI * 2, rad = 42 + lr() * 70;
        var x = Math.cos(ang) * rad, z = -35 + Math.sin(ang) * rad;
        if (z < -80 || (Math.abs(x) < 20 && z < 4 && z > -76)) continue;
        pos[i * 3] = x; pos[i * 3 + 1] = 0.35 + lr() * 2.2; pos[i * 3 + 2] = z;
        i++;
      }
      var lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      lg.setDrawRange(0, i);
      var sprite = null;
      try { if (R.world && R.world.stars && R.world.stars.material && R.world.stars.material.map) sprite = R.world.stars.material.map; } catch (e2) { sprite = null; }
      R.lights = new THREE.Points(lg, new THREE.PointsMaterial({
        size: R.isMobile ? 3.2 : 3.0, sizeAttenuation: false, map: sprite, color: GOLD_PALE, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      R.lights.frustumCulled = false;
      R.lights.visible = false;
      R.lights.name = 's7-townLights';
      group.add(R.lights);
    } catch (e) { R.lights = null; }

    apply(0, ctx);
  }

  /* ---------- مصفوفة عمود/غطاء ---------- */
  function setColumn(k, x, z, h) {
    var hh = Math.max(h, 0.001);
    R.tmpQ.identity();
    R.tmpM.compose(R.tmpV.set(x, ROOF_Y + hh / 2, z), R.tmpQ, R.tmpS.set(GRID.w, hh, GRID.w));
    R.columns.setMatrixAt(k, R.tmpM);
    var cap = Math.min(0.024, hh * 0.5);
    R.tmpM.compose(R.tmpV.set(x, ROOF_Y + hh + cap / 2, z), R.tmpQ, R.tmpS.set(GRID.w + 0.04, cap, GRID.w + 0.04));
    R.columns.setMatrixAt(COLS_N + k, R.tmpM);
  }

  /* ---------- الحالة من p (دالة صرفة في p والزمن) ---------- */
  function apply(p, ctx) {
    var time = (ctx && typeof ctx.time === 'number') ? ctx.time : 0;
    var world = (ctx && ctx.world) || R.world;
    var i, k;

    /* النوافذ تضيء تباعاً (0.2 → 0.58) من جهة البداية؛ عند p=0 مطفأة. world.setTime يرفعها آخر الرحلة ولا يعارضنا.
       الكاميرا فوق السطح لا ترى زجاج الواجهة، فنُظهر اشتعالها كبقع ضوء فوق حافة السطح (spill من المحطة 8) */
    try {
      var ws = world && world.windows;
      if (ws && ws.length) {
        var n = ws.length, lits = [];
        for (i = 0; i < n; i++) {
          var order = R.DIR < 0 ? (n - 1 - i) : i;
          var a = 0.2 + order * (0.32 / Math.max(n - 1, 1));
          var lit = ease('out', seg(p, a, a + 0.07));
          lits.push(lit);
          var w = ws[i], wm = w && w.material;
          if (!wm || !wm.emissive) continue;
          wm.emissiveIntensity = lit * (1.0 + 0.06 * Math.sin(time * 2.1 + i));
          if (w.userData) w.userData.autoLit = false;
        }
        if (NS.s8Spill && typeof NS.s8Spill.set === 'function' && p < 1) NS.s8Spill.set(lits, 0.9 + 0.1 * Math.sin(time * 1.7));
      }
    } catch (e) {}

    /* لوح المدير: يُفتح بقناع ذهبي مع صعود الكاميرا فوق السطح، ويبقى مفتوحاً للمحطة الأخيرة */
    if (R.screen) {
      try { R.screen.setOpen(ease('out', seg(p, 0.16, 0.44))); } catch (e) {}
    }
    if (R.caption) {
      var ca = ease('out', seg(p, 0.3, 0.44)) * (1 - ease('in', seg(p, 0.8, 0.93)));
      R.caption.material.opacity = ca;
      R.caption.visible = ca > 0.005;
      R.caption.position.y = BOARD.y + BOARD.h / 2 + 0.52 + 0.08 * (1 - ease('out', seg(p, 0.3, 0.5)));
      var tab = p < 0.6 ? 0 : 1;
      if (tab !== R.tab) { R.tab = tab; try { if (R.captionTex) R.captionTex.redraw(); } catch (e) {} }
    }

    /* الأعمدة: تنهض تباعاً (0.15 → 0.6)، تتنفس في الذروة، وتبقى مضاءة كإضاءة السطح عند التسليم */
    if (R.columns) {
      var breathe = seg(p, 0.5, 0.62) * (1 - seg(p, 0.8, 0.92));
      var maxH = 0;
      for (k = 0; k < COLS_N; k++) {
        var a0 = 0.15 + k * 0.006;
        var g = ease('out', seg(p, a0, a0 + 0.12));
        var h = R.heights[k] * g * (1 + 0.035 * breathe * Math.sin(time * 1.6 + R.phases[k]));
        if (h > maxH) maxH = h;
        setColumn(k, R.colBase[k][0], R.colBase[k][1], h);
      }
      R.columns.instanceMatrix.needsUpdate = true;
      R.columns.visible = maxH > 0.004;
    }

    /* أضواء الحي: مع الليل (world.nightAmount) وفي مرحلة الذروة/التسليم */
    if (R.lights) {
      var night = (world && typeof world.nightAmount === 'number') ? world.nightAmount : seg(p, 0.5, 1);
      var la = ease('out', seg(p, 0.45, 0.8)) * clamp(night * 1.2, 0, 1);
      R.lights.material.opacity = la;
      R.lights.visible = la > 0.01;
    }
  }

  function update(p, ctx) {
    p = clamp(+p || 0, 0, 1);
    try { apply(p, ctx); } catch (e) {}
  }

  function load(ctx) {
    try { if (R.placeholder) R.placeholder.visible = false; } catch (e) {}
    try {
      if (R.screen && typeof R.screen.setPoster === 'function') { R.screen.setPoster('admin-more'); R.screen.setMode('poster'); }
    } catch (e) {}
    try { if (R.screen) R.screen.enter(); } catch (e) {}
  }

  function unload(ctx) {
    try { if (R.screen) R.screen.leave(); } catch (e) {}
    /* تحرير ملصق المدير الكبير (1640×1120): GPU والصورة المفكوكة؛ يُعاد جلبه من مخبأ المتصفح عند الاقتراب */
    try {
      var media = (ctx && ctx.media) || NS.media;
      if (media && typeof media.release === 'function') media.release('admin-more');
    } catch (e) {}
    /* عند الابتعاد نهاراً: النوافذ تعود مطفأة إن لم يُضئها العالم بنفسه */
    try {
      var world = (ctx && ctx.world) || R.world;
      var ws = world && world.windows;
      if (ws && !(world.nightAmount > 0.999)) {
        for (var i = 0; i < ws.length; i++) {
          var w = ws[i];
          if (w && w.material && w.material.emissive && !(w.userData && w.userData.autoLit)) w.material.emissiveIntensity = 0;
        }
      }
    } catch (e) {}
  }

  function setQuality(q, ctx) {
    /* لا ظلال ولا نسيج ثقيل هنا؛ الشاشة تتولّى وضعها بنفسها (ملصق في الوضع الخفيف) */
  }

  NS.registerStation({
    id: 's7-roof',
    index: 6,
    weight: 1.2,
    text: { headline: HEADLINE, copy: COPY },
    /* صعود عمودي عبر الكوّة ثم اقتراب إلى ~6م من لوح المدير (يملأ نحو نصف العرض) قبل الالتفاف نحو الفناء */
    cam: [
      { t: 0.0, pos: [0, 3, -67], look: [0, 4, -68] },
      { t: 0.2, pos: [0, 5.6, -67.6], look: [0, 7.6, -56] },
      { t: 0.45, pos: [0, 7.2, -58], look: [0, 9.3, -52] },
      { t: 0.68, pos: [0, 7.4, -58.6], look: [0, 9.2, -52.2] },
      { t: 1.0, pos: [0, 12, -66], look: [0, 2, -30] }
    ],
    build: build,
    load: load,
    unload: unload,
    update: update,
    setQuality: setQuality,
    posterTitle: HEADLINE
  });
})();
