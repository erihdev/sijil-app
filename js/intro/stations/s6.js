/* سجل المتابعة الرقمي — الجولة السينمائية: المحطة 6 (الخزائن وملف الطالب)
   خزانة تُفتح، لوح «الدرجات» يخرج منها مائلاً نحو الكاميرا، 11 شريط تقدّم تمتلئ تباعاً داخل حدود الخزائن،
   وبطاقة «تقرير ولي الأمر» تنطلق كفقاعة عند التسليم. */
(function () {
  'use strict';
  var NS = window.SIJIL_INTRO = window.SIJIL_INTRO || {};
  if (typeof NS.registerStation !== 'function') return;

  var GOLD = 0xD7A93F, NAVY = 0x0E2033, TRACK = 0x223B58;
  var SUBJECTS = [0x0E2033, 0x1D3A5C, 0x2F6B8F, 0x4F7FC7, 0x9FC4E8, 0x2F8F5B, 0x6FA36B, 0xD7A93F, 0xF0D99A, 0xC9772B, 0x8B5A2B];
  var FILLS = [0.92, 0.78, 0.86, 0.64, 0.7, 0.9, 0.58, 0.82, 0.74, 0.62, 0.96];
  var LOCKER = 4;
  var HALF = Math.PI / 2;
  var HEADLINE = 'كل طالب… ملفّ يكبر معه';
  var UI_NAME = 'grades';

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function lerp(a, b, t) { return typeof NS.lerp === 'function' ? NS.lerp(a, b, t) : a + (b - a) * t; }
  function ease(n, x) { return typeof NS.ease === 'function' ? NS.ease(n, x) : clamp(x, 0, 1); }
  /* نسبة p داخل مقطع [a,b] مقيّدة 0..1 */
  function seg(p, a, b) { return clamp((p - a) / ((b - a) || 1), 0, 1); }

  /* ---------- مراجع المحطة ---------- */
  var R = {
    built: false, THREE: null, isMobile: false, layout: null,
    screen: null, panel: null, glow: null, glowTex: null, bars: null,
    bubble: null, bubbleTex: null, world: null, tmpM: null, tmpV: null, tmpS: null, tmpQ: null, tmpC: null,
    lastP: -1
  };

  /* تخطيط المكتب/الجوال: مواضع اللوح والأشرطة (الوحدة متر)؛ الأشرطة داخل ارتفاع جسم الخزائن (0.45..1.6) */
  function makeLayout(isMobile) {
    if (isMobile) {
      return {
        scale: 0.66,
        home: [3.0, 1.8, -63.72],
        start: [3.62, 1.05, -63.6],
        tiltY: 0.28,
        barH: 0.038, barD: 0.03, barX: 3.3,
        /* عمودان: 6 أشرطة يميناً و5 يساراً، تمتلئ من اليمين (+z) نحو اليسار */
        bars: (function () {
          var out = [], k;
          for (k = 0; k < 11; k++) {
            var col = k < 6 ? 0 : 1, row = k < 6 ? k : k - 6;
            out.push({ z0: col === 0 ? -62.6 : -64.35, len: 0.5, y: 1.3 - row * 0.09 });
          }
          return out;
        })(),
        bubbleFrom: [2.92, 1.9, -63.72], bubbleTo: [2.5, 2.7, -63.6], bubbleScale: 0.9
      };
    }
    return {
      scale: 0.7,
      home: [3.0, 1.62, -64.15],
      start: [3.62, 1.05, -63.6],
      tiltY: 0.3,
      barH: 0.05, barD: 0.03, barX: 3.3,
      bars: (function () {
        var out = [], k;
        for (k = 0; k < 11; k++) out.push({ z0: -64.62, len: 0.58, y: 1.55 - k * 0.1 });
        return out;
      })(),
      bubbleFrom: [2.92, 1.5, -64.05], bubbleTo: [2.55, 2.25, -63.85], bubbleScale: 1
    };
  }

  /* ---------- رسم فقاعة «تقرير ولي الأمر» ---------- */
  function drawBubble(c, w, h) {
    var pad = 8, r = 28, tail = 30;
    var bw = w - pad * 2, bh = h - pad - tail;
    var x = pad, y = pad;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + bw, y, x + bw, y + bh, r);
    c.arcTo(x + bw, y + bh, x, y + bh, r);
    c.lineTo(w / 2 + 18, y + bh);
    c.lineTo(w / 2, h - 3);
    c.lineTo(w / 2 - 18, y + bh);
    c.arcTo(x, y + bh, x, y, r);
    c.arcTo(x, y, x + bw, y, r);
    c.closePath();
    c.fillStyle = '#F8F5EF';
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = '#D7A93F';
    c.stroke();
    c.direction = 'rtl';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#0E2033';
    c.font = '800 36px Changa, Tajawal, sans-serif';
    c.fillText('تقرير ولي الأمر', w / 2, y + bh * 0.38);
    c.fillStyle = '#2F8F5B';
    c.font = '700 22px Tajawal, sans-serif';
    c.fillText('أُرسل عبر واتساب ✓', w / 2, y + bh * 0.74);
  }

  /* ---------- البناء ---------- */
  function build(ctx) {
    var THREE = (ctx && ctx.THREE) || window.THREE;
    var group = this && this.group ? this.group : null;
    if (!THREE || !group || R.built) return;
    R.built = true;
    R.THREE = THREE;
    R.isMobile = !!(ctx && ctx.isMobile);
    R.layout = makeLayout(R.isMobile);
    R.world = ctx && ctx.world;
    R.tmpM = new THREE.Matrix4(); R.tmpV = new THREE.Vector3(); R.tmpS = new THREE.Vector3();
    R.tmpQ = new THREE.Quaternion(); R.tmpC = new THREE.Color();
    var L = R.layout, media = ctx && ctx.media, k;

    /* لوح الدرجات: شاشة media بقناع فتح ذهبي وإطار كحلي كبيزل الجوال؛ اللقطة تُطلب في load() */
    try {
      if (media && typeof media.screen === 'function') {
        R.screen = media.screen({
          width: 1.2, height: 2.13, texture: null, frame: 'navy', frameWidth: 0.05, frameDepth: 0.05,
          fit: 'cover', open: 0, openFromProgress: false, bright: 1.05, name: 's6-grades'
        });
        R.panel = R.screen.mesh;
      } else {
        R.panel = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.13), new THREE.MeshBasicMaterial({ color: 0x0E2033 }));
      }
      R.panel.visible = false;
      group.add(R.panel);
    } catch (e) { R.panel = null; R.screen = null; }

    /* توهّج ذهبي ناعم من داخل الخزانة (تدرّج شعاعي على canvas صغير) */
    try {
      var glowTex = null;
      if (media && typeof media.canvasTexture === 'function') {
        R.glowTex = media.canvasTexture(64, 128, function (c, w, h) {
          var gr = c.createRadialGradient(w / 2, h * 0.45, 4, w / 2, h * 0.45, h * 0.62);
          gr.addColorStop(0, 'rgba(240,217,154,1)');
          gr.addColorStop(0.45, 'rgba(215,169,63,0.55)');
          gr.addColorStop(1, 'rgba(215,169,63,0)');
          c.fillStyle = gr;
          c.fillRect(0, 0, w, h);
        });
        glowTex = R.glowTex.texture;
      }
      R.glow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.66),
        new THREE.MeshBasicMaterial({ map: glowTex, color: glowTex ? 0xffffff : GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      R.glow.position.set(3.47, 0.9, -63.6);
      R.glow.rotation.y = -HALF;
      R.glow.visible = false;
      group.add(R.glow);
    } catch (e) { R.glow = null; }

    /* 11 شريطاً: مسار خافت + تعبئة بلون المادة، في InstancedMesh واحد (22 نسخة) */
    try {
      var barG = new THREE.BoxGeometry(1, 1, 1);
      R.bars = new THREE.InstancedMesh(barG, new THREE.MeshBasicMaterial({ color: 0xffffff }), 22);
      R.bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (k = 0; k < 22; k++) {
        R.tmpC.setHex(k < 11 ? TRACK : SUBJECTS[k - 11]);
        R.bars.setColorAt(k, R.tmpC);
      }
      R.bars.frustumCulled = false;
      R.bars.visible = false;
      group.add(R.bars);
    } catch (e) { R.bars = null; }

    /* فقاعة تقرير ولي الأمر (canvas) */
    try {
      var bt = null;
      if (media && typeof media.canvasTexture === 'function') {
        R.bubbleTex = media.canvasTexture(256, 160, drawBubble);
        bt = R.bubbleTex.texture;
      }
      R.bubble = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.4),
        new THREE.MeshBasicMaterial({ map: bt, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      R.bubble.renderOrder = 5;
      R.bubble.visible = false;
      group.add(R.bubble);
    } catch (e) { R.bubble = null; }

    apply(0, ctx);
  }

  /* ---------- الحالة من p (دالة صرفة في p والزمن) ---------- */
  function apply(p, ctx) {
    var L = R.layout;
    if (!L) return;
    var time = (ctx && typeof ctx.time === 'number') ? ctx.time : 0;
    var world = (ctx && ctx.world) || R.world;
    var light = !!(ctx && ctx.quality === 'light');
    var i;

    /* الاستلام: الباب يُفتح؛ التسليم: يُغلق */
    var open = ease('inOut', seg(p, 0.0, 0.18)) * (1 - ease('inOut', seg(p, 0.86, 1)));
    try {
      var Lk = world && world.lockers && world.lockers[LOCKER];
      if (Lk && Lk.door) Lk.door.rotation.y = open * 1.9;
    } catch (e) {}

    /* النهوض: اللوح يخرج من الخزانة ويكبر ويميل نحو الكاميرا؛ التسليم: يعود */
    var rise = ease('out', seg(p, 0.15, 0.5));
    var back = ease('in', seg(p, 0.8, 0.95));
    var m = rise * (1 - back);
    var peak = seg(p, 0.5, 0.6) * (1 - seg(p, 0.75, 0.85));
    if (R.panel) {
      var s = lerp(0.15, L.scale, m);
      var bob = Math.sin(time * 1.3) * 0.012 * peak;
      R.panel.position.set(lerp(L.start[0], L.home[0], m), lerp(L.start[1], L.home[1], m) + bob, lerp(L.start[2], L.home[2], m));
      R.panel.scale.set(s, s, s);
      R.panel.rotation.set(0, -HALF + L.tiltY * m, Math.sin(time * 0.9) * 0.01 * peak);
      R.panel.visible = m > 0.001 && p > 0.1;
      var openMask = ease('out', seg(p, 0.2, 0.5)) * (1 - ease('in', seg(p, 0.8, 0.93)));
      if (R.screen) { try { R.screen.setOpen(openMask); } catch (e) {} }
    }
    if (R.glow) {
      var g = open * (1 - back) * (R.glowTex ? 0.75 : 0.2);
      R.glow.material.opacity = g;
      R.glow.visible = !light && g > 0.01;
    }

    /* الأشرطة: المسار يدخل من اليمين، ثم التعبئة تباعاً؛ تخرج بهدوء عند التسليم */
    if (R.bars) {
      var enter = ease('out', seg(p, 0.16, 0.34));
      var exit = ease('in', seg(p, 0.78, 0.92));
      var vis = enter * (1 - exit);
      for (i = 0; i < 11; i++) {
        var b = L.bars[i];
        var trackLen = b.len * vis;
        setBar(i, L.barX, b.y, b.z0, trackLen, L.barH, L.barD);
        var fill = FILLS[i] * ease('out', seg(p, 0.22 + i * 0.026, 0.44 + i * 0.026)) * (1 - exit);
        var fillLen = b.len * Math.min(fill, vis);
        setBar(11 + i, L.barX - 0.012, b.y, b.z0, fillLen, L.barH * 0.72, L.barD);
      }
      R.bars.instanceMatrix.needsUpdate = true;
      R.bars.visible = vis > 0.001;
    }

    /* التسليم: بطاقة التقرير تنطلق كفقاعة إلى الأعلى ثم تذوب */
    if (R.bubble) {
      var u = seg(p, 0.74, 0.98);
      if (u > 0 && u < 1) {
        var fly = ease('inOut', u);
        var alpha = ease('out', seg(u, 0, 0.25)) * (1 - ease('in', seg(u, 0.55, 1)));
        var sc = L.bubbleScale * lerp(0.25, 1, ease('back', seg(u, 0, 0.45)));
        R.bubble.position.set(
          lerp(L.bubbleFrom[0], L.bubbleTo[0], fly),
          lerp(L.bubbleFrom[1], L.bubbleTo[1], fly),
          lerp(L.bubbleFrom[2], L.bubbleTo[2], fly) + Math.sin(u * 9) * 0.06 * (1 - u)
        );
        R.bubble.scale.set(sc, sc, sc);
        R.bubble.rotation.set(0, -HALF + L.tiltY + 0.15, Math.sin(u * 7) * 0.05);
        R.bubble.material.opacity = alpha;
        R.bubble.visible = alpha > 0.005;
      } else {
        R.bubble.visible = false;
        R.bubble.material.opacity = 0;
      }
    }
  }

  /* مصفوفة نسخة شريط يمتلئ من اليمين (+z) نحو اليسار (−z) */
  function setBar(idx, x, y, z0, len, h, d) {
    var l = Math.max(len, 0.0001);
    R.tmpV.set(x, y, z0 - l / 2);
    R.tmpS.set(d, h, l);
    R.tmpQ.identity();
    R.tmpM.compose(R.tmpV, R.tmpQ, R.tmpS);
    R.bars.setMatrixAt(idx, R.tmpM);
  }

  function update(p, ctx) {
    p = clamp(+p || 0, 0, 1);
    try { apply(p, ctx); } catch (e) {}
  }

  function load(ctx) {
    /* لقطة الدرجات تُطلب هنا عند الاقتراب (القسم 4) */
    try {
      if (R.screen && typeof R.screen.setPoster === 'function') { R.screen.setPoster(UI_NAME); R.screen.setMode('poster'); }
    } catch (e) {}
    try { if (R.screen) R.screen.enter(); } catch (e) {}
  }

  function unload(ctx) {
    try { if (R.screen) R.screen.leave(); } catch (e) {}
    /* تحرير نسيج الدرجات (GPU + الصورة المفكوكة)؛ يُعاد جلبه من مخبأ المتصفح عند الاقتراب */
    try {
      var media = (ctx && ctx.media) || NS.media;
      if (media && typeof media.release === 'function') media.release(UI_NAME);
    } catch (e) {}
  }

  function setQuality(q, ctx) {
    try { if (R.glow && q === 'light') R.glow.visible = false; } catch (e) {}
  }

  NS.registerStation({
    id: 's6',
    index: 5,
    weight: 1.1,
    text: {
      headline: HEADLINE,
      copy: 'تقدّم الطالب في كل المواد في مكان واحد، وتقرير ولي الأمر بضغطة واتساب.'
    },
    /* كاميرا أخفض قليلاً ونظرة أدنى حتى لا يشغل السقف ثلث الكادر؛ نقطة ثبات حتى نهاية الذروة
       ثم نقطة تسليم تحت الكوّة تنظر إلى الأعلى (لا زاوية سقف أصم) */
    cam: [
      { t: 0.0, pos: [0.3, 1.5, -63], look: [3.9, 1.3, -64] },
      { t: 0.78, pos: [0.28, 1.5, -63.1], look: [3.9, 1.28, -64.05] },
      /* التسليم: تقدّم على محور الممر ونظرة صاعدة نحو فتحة الكوّة المؤطّرة ذهبياً (لا مسح للسقف الأصم) */
      { t: 0.9, pos: [0.24, 1.9, -65], look: [0.2, 3.2, -67] },
      { t: 1.0, pos: [0.2, 2.4, -66.4], look: [0.2, 3.9, -67.9] }
    ],
    build: build,
    load: load,
    unload: unload,
    update: update,
    setQuality: setQuality,
    posterTitle: HEADLINE
  });
})();
