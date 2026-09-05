/* سجل المتابعة الرقمي — الجولة السينمائية: المحطة 2 «الطابور والتحضير»
   المقاعد تضيء تباعاً، نجمة ذهبية فوق كل صف من الطابور، لوح جوال بلقطة التحضير يطفو قرب الكاميرا،
   وعدّاد حضور ٠→٣٠. كل شيء على window.SIJIL_INTRO بلا وحدات. */
(function (win) {
  'use strict';
  var NS = win.SIJIL_INTRO;
  if (!NS || typeof NS.registerStation !== 'function') return;

  var STUDENTS = 30;
  var ROWS = 5;
  var TABLET_W = 1.2, TABLET_H = 2.13;
  /* أبعد قليلاً وأقرب إلى مركز الكادر من نقطة العقد؛ يدخل بالحجم والقناع لا بالصعود من تحت الكاميرا */
  var TABLET_POS = [2.4, 1.75, -10.6];
  var TABLET_SCALE = 0.85;
  var CAM_POS = [5, 2.4, -8], CAM_LOOK = [0, 1.2, -14];
  var GOLD = '#D7A93F', GOLD_PALE = '#F0D99A';
  var UI_NAME = 'reg';

  var station = null;
  var group = null;
  var tablet = null;          /* كائن media.screen */
  var tabletBase = null;      /* THREE.Vector3 موضع الاستقرار */
  var tabletScale = 1;
  var stars = [];             /* [{sprite, x, z, phase}] */
  var starTex = null;
  var benches = [];           /* مرتبة من جهة البداية (اليمين) */
  var counterOn = false;
  var counterVal = -1;
  var tmpV = null;

  function ease(n, x) { return NS.ease(n, x); }
  function lerp(a, b, t) { return NS.lerp(a, b, t); }
  function clamp(x, a, b) { return NS.clamp(x, a, b); }
  function seg(p, a, b) { return clamp((p - a) / ((b - a) || 1), 0, 1); }

  /* ---------- نسيج النجمة ---------- */
  function makeStarTexture(THREE) {
    var c = document.createElement('canvas');
    c.width = c.height = 96;
    var g = c.getContext('2d');
    if (!g) return null;
    var cx = 48, cy = 48;
    var glow = g.createRadialGradient(cx, cy, 4, cx, cy, 46);
    glow.addColorStop(0, 'rgba(240,217,154,0.55)');
    glow.addColorStop(0.5, 'rgba(215,169,63,0.16)');
    glow.addColorStop(1, 'rgba(215,169,63,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 96, 96);
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = (i % 2 === 0) ? 26 : 11;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = GOLD_PALE;
    g.fill();
    g.lineWidth = 2.2;
    g.lineJoin = 'round';
    g.strokeStyle = GOLD;
    g.stroke();
    var tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  /* ---------- موضع اللوح: المكتب حسب العقد، والجوال يُقرَّب إلى وسط الشاشة ---------- */
  function computeTabletBase(THREE, ctx) {
    var v = new THREE.Vector3(TABLET_POS[0], TABLET_POS[1], TABLET_POS[2]);
    if (!ctx.isMobile) return v;
    try {
      var cam = new THREE.Vector3(CAM_POS[0], CAM_POS[1] + 0.4, CAM_POS[2]);
      var look = new THREE.Vector3(CAM_LOOK[0], CAM_LOOK[1], CAM_LOOK[2]);
      var fwd = look.clone().sub(cam).normalize();
      var right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      var up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      v.copy(cam).addScaledVector(fwd, 3.4).addScaledVector(right, -0.05).addScaledVector(up, -0.3);
    } catch (e) {}
    return v;
  }

  /* ---------- البناء ---------- */
  function build(ctx) {
    var THREE = ctx.THREE || win.THREE;
    if (!THREE || !group) return;
    tmpV = new THREE.Vector3();
    tabletBase = computeTabletBase(THREE, ctx);
    tabletScale = ctx.isMobile ? 1 : TABLET_SCALE;

    /* النجوم: واحدة فوق كل صف من الطابور */
    try {
      starTex = makeStarTexture(THREE);
      var st = ctx.world && ctx.world.students;
      var feet = st && st.feet;
      for (var r = 0; r < ROWS; r++) {
        var sx = 0, sz = -8 - r * 2, n = 0;
        if (feet) {
          for (var c = 0; c < 6; c++) {
            var f = feet[r * 6 + c];
            if (f) { sx += f[0]; sz += f[1]; n++; }
          }
          if (n) { sx /= n; sz = (sz + 8 + r * 2) / n; }
        }
        var mat = new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false, opacity: 0 });
        var sp = new THREE.Sprite(mat);
        sp.name = 'star-row' + r;
        sp.position.set(sx, 1.75, sz);
        sp.scale.set(0.001, 0.001, 1);
        sp.visible = false;
        group.add(sp);
        stars.push({ sprite: sp, x: sx, z: sz, phase: r * 1.3 });
      }
    } catch (e) { stars = []; }

    /* المقاعد: ترتيب الإضاءة من جهة البداية (اليمين في RTL) */
    try {
      var list = (ctx.world && ctx.world.benches) ? ctx.world.benches.slice() : [];
      list.sort(function (a, b) { return (NS.DIR * a.position.x) - (NS.DIR * b.position.x); });
      benches = list;
    } catch (e) { benches = []; }

    applyBenches(0, 0);
  }

  /* ---------- اللوح (يُنشأ عند أول اقتراب حتى لا يُطلب النسيج مبكراً) ---------- */
  function ensureTablet(ctx) {
    if (tablet || !group) return;
    var media = ctx.media || NS.media;
    if (!media || typeof media.screen !== 'function') return;
    try {
      tablet = media.screen({
        width: TABLET_W, height: TABLET_H,
        texture: media.ui(UI_NAME),
        fit: 'cover',
        frame: 'navy', frameWidth: 0.05, frameDepth: 0.05,
        open: 0, openFromProgress: false,
        name: 's2-tablet'
      });
      tablet.mesh.visible = false;
      tablet.mesh.position.copy(tabletBase);
      group.add(tablet.mesh);
      /* media.tick تستدعي tick الشاشة كل إطار حتى والمحطة غير نشطة: نستغلها لمزامنة الحالة الساكنة
         (التمرير السريع قد يترك آخر update عند p<1 فيبقى اللوح أو العدّاد ظاهرين) */
      var baseTick = tablet.tick;
      tablet.tick = function (time) {
        try { baseTick(time); } catch (e) {}
        syncIdle();
      };
    } catch (e) { tablet = null; }
  }

  var idleApplied = false;
  function syncIdle() {
    var st = NS.state, ctx = NS.ctx;
    if (!st || !ctx || !station) return;
    var k = NS.stations ? NS.stations.indexOf(station) : -1;
    if (k < 0) return;
    if (st.i === k) { idleApplied = false; return; }
    if (idleApplied) return;
    idleApplied = true;
    applyIdle(ctx);
  }

  /* ---------- الحالة حسب p ---------- */
  function applyBenches(p, time) {
    for (var i = 0; i < benches.length; i++) {
      var m = benches[i] && benches[i].material;
      if (!m || !('emissiveIntensity' in m)) continue;
      var t0 = 0.3 + i * 0.055;
      var k = ease('out', seg(p, t0, t0 + 0.09));
      var pulse = Math.sin(seg(p, t0, t0 + 0.16) * Math.PI) * 0.35;
      var breathe = k * (0.04 + 0.04 * Math.sin(time * 1.5 + i * 0.9));
      var off = 1 - ease('in', seg(p, 0.8, 0.94));
      var v = (k * 0.55 + pulse + breathe) * off;
      if (p < 0.02) v = 0;
      m.emissiveIntensity = v;
    }
  }

  function applyStars(p, time) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i], sp = s.sprite;
      var t0 = 0.3 + i * 0.065;
      var k = ease('back', seg(p, t0, t0 + 0.1));
      var out = ease('in', seg(p, 0.8, 0.94));
      var sc = 0.6 * k * (1 - out);
      var vis = sc > 0.005 && p > 0.02;
      sp.visible = vis;
      if (!vis) continue;
      sp.scale.set(sc, sc, 1);
      sp.material.opacity = clamp(k, 0, 1) * (1 - out);
      sp.position.set(s.x, 1.75 + Math.sin(time * 1.6 + s.phase) * 0.04 + out * 0.5, s.z);
      sp.material.rotation = Math.sin(time * 0.9 + s.phase) * 0.12;
    }
  }

  /* اللوح يدخل بالحجم والقناع الدائري بعد استقرار الكاميرا (p≈.12–.3) ويغادر بالانكماش والإغلاق */
  function applyTablet(p, ctx) {
    if (!tablet) return;
    var mesh = tablet.mesh;
    var enter = ease('out', seg(p, 0.12, 0.3));
    var leave = ease('in', seg(p, 0.78, 0.95));
    var open = enter * (1 - ease('in', seg(p, 0.82, 0.94)));
    var vis = p > 0.12 && p < 0.95;
    mesh.visible = vis;
    if (!vis) return;
    var time = ctx.time || 0;
    mesh.position.copy(tabletBase);
    mesh.position.y += 0.35 * leave + Math.sin(time * 1.2) * 0.03;
    var sc = tabletScale * lerp(0.6, 1, enter) * (1 - 0.45 * leave);
    mesh.scale.set(sc, sc, sc);
    if (ctx.camera) {
      tmpV.copy(ctx.camera.position);
      mesh.lookAt(tmpV);
    }
    mesh.rotateY(ctx.isMobile ? -0.21 : -0.3);
    mesh.rotateX(-0.06 + Math.sin(time * 0.8) * 0.015);
    tablet.setOpen(open);
  }

  /* العدّاد هنا شارة صغيرة (لا العدّاد البطل كما في المحطة 4): خلفية كحلية وحجم أصغر؛
     على المكتب أعلى يسار تحت الشريط (النص أسفل يمين)، وعلى الجوال أسفل الشاشة بعيداً عن نص المحطة. */
  function styleCounter(host, on, isMobile) {
    if (!host) return;
    var num = host.querySelector('.num');
    try {
      if (on) {
        host.style.zIndex = '3';
        if (isMobile) { host.style.top = 'auto'; host.style.bottom = '7svh'; }
        else { host.style.top = '14svh'; host.style.bottom = 'auto'; host.style.insetInlineEnd = '6vw'; }
        if (num) {
          num.style.fontSize = 'clamp(40px,7vw,72px)';
          num.style.padding = '.08em .45em .14em';
          num.style.borderRadius = '999px';
          num.style.background = 'rgba(14,32,51,.78)';
          num.style.boxShadow = '0 8px 28px rgba(7,19,34,.35)';
          num.style.minWidth = '2.2em';
        }
      } else {
        host.style.zIndex = ''; host.style.top = ''; host.style.bottom = ''; host.style.insetInlineEnd = '';
        if (num) { num.style.fontSize = ''; num.style.padding = ''; num.style.borderRadius = ''; num.style.background = ''; num.style.boxShadow = ''; num.style.minWidth = ''; }
      }
    } catch (e) {}
  }

  function counterHost() { return document.getElementById('intro-counter'); }

  function applyCounter(p, ctx) {
    var ui = ctx.ui || NS.ui;
    if (!ui || !ui.counter) return;
    var inWindow = p >= 0.28 && p < 0.85;
    if (!inWindow) {
      if (counterOn) { counterOn = false; counterVal = -1; try { ui.counter.hide(); } catch (e) {} styleCounter(counterHost(), false, ctx.isMobile); }
      return;
    }
    if (!counterOn) {
      counterOn = true; counterVal = -1;
      try { ui.counter.show(STUDENTS, []); } catch (e) {}
      styleCounter(counterHost(), true, ctx.isMobile);
    }
    var v = Math.round(STUDENTS * ease('out', seg(p, 0.3, 0.64)));
    if (v !== counterVal) { counterVal = v; try { ui.counter.set(v); } catch (e) {} }
  }

  function update(p, ctx) {
    p = clamp(+p || 0, 0, 1);
    var time = ctx.time || 0;
    ensureTablet(ctx);
    applyTablet(p, ctx);
    applyStars(p, time);
    applyBenches(p, time);
    applyCounter(p, ctx);
  }

  /* حالة ساكنة عندما تكون المحطة ضمن ±1 وليست النشطة (لا شيء «يقفز» عند العودة) */
  function applyIdle(ctx) {
    var k = NS.stations ? NS.stations.indexOf(station) : -1;
    var i = ctx.state ? ctx.state.i : -1;
    if (k < 0 || i === k) return;
    var p = i < k ? 0 : 1;
    applyTablet(p, ctx);
    applyStars(p, 0);
    applyBenches(p, 0);
    applyCounter(p, ctx);
  }

  function load(ctx) {
    ensureTablet(ctx);
    var media = ctx.media || NS.media;
    try { if (tablet && media && typeof tablet.setPoster === 'function') tablet.setPoster(media.ui(UI_NAME)); } catch (e) {}
    try { if (tablet) tablet.enter(); } catch (e) {}
    applyIdle(ctx);
  }

  function unload(ctx) {
    try { if (tablet) tablet.leave(); } catch (e) {}
    if (counterOn) { counterOn = false; counterVal = -1; try { (ctx.ui || NS.ui).counter.hide(); } catch (e) {} styleCounter(counterHost(), false, ctx.isMobile); }
    applyBenches(0, 0);
    applyStars(0, 0);
    if (tablet) tablet.mesh.visible = false;
    /* تحرير لقطة التحضير (GPU + الصورة المفكوكة)؛ تُعاد من مخبأ المتصفح عند الاقتراب */
    try { var media = ctx.media || NS.media; if (media && typeof media.release === 'function') media.release(UI_NAME); } catch (e) {}
  }

  function setQuality(q) {
    for (var i = 0; i < stars.length; i++) {
      try { stars[i].sprite.material.needsUpdate = true; } catch (e) {}
    }
  }

  station = NS.registerStation({
    id: 's2',
    index: 1,
    weight: 1.0,
    text: {
      headline: 'الحضور والنجوم بضغطة',
      copy: 'افتح الفصل، واضغط اسم الطالب: حاضر، شارك، نجمة. ينتهي التحضير قبل أن يجلس آخر طالب.'
    },
    /* نقطة عبور البوابة (تُؤخَّر تلقائياً إلى 0.15 بقاعدة التصادم) حتى لا يخترق الطيران من s1 سور المدرسة،
       ثم نقطة العقد، ثم نقطة ثبات شبه مطابقة حتى الذروة، ثم نقطة تسليم في منتصف باب الواجهة تنظر داخل الممر
       (لا إطار ميت على قائم الباب) */
    cam: [
      { t: 0.0, pos: [0, 2.6, 0.6], look: [0.5, 1.6, -10] },
      { t: 0.26, pos: [5, 2.4, -8], look: [0, 1.2, -14] },
      { t: 0.72, pos: [4.85, 2.38, -8.2], look: [0.2, 1.15, -14.2] },
      { t: 1.0, pos: [0.3, 2.3, -21], look: [0, 2, -30] }
    ],
    build: function (ctx) { group = this.group; build(ctx); },
    load: load,
    unload: unload,
    update: update,
    setQuality: setQuality,
    posterTitle: 'الحضور والنجوم بضغطة'
  });
})(window);
