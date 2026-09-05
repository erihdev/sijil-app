/* سجل المتابعة الرقمي — الجولة السينمائية: المحطة 1 «البوابة والكشف»
   اللوحة LED فوق البوابة تصير شاشة إجرائية (فجر يتدرج من الكحلي إلى الذهبي مع ظل نخلة وغبار ذهبي)،
   الكاميرا تبدأ لصيقة باللوحة ثم تتراجع فتكشف البوابة والسور والنخلتين والعلم، وثلاثة طيور تعبر السماء. */
(function () {
  'use strict';
  var NS = window.SIJIL_INTRO = window.SIJIL_INTRO || {};
  if (typeof NS.registerStation !== 'function') return;

  var LED_POS = [0, 5.2, 0.255];
  var BIRDS = 3;
  var COLORS = { night: '#071322', navy: '#0E2033', gold: '#D7A93F', paleGold: '#F0D99A', sunset: '#E8A46B' };

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function smooth(a, b, x) { var t = clamp((x - a) / ((b - a) || 1), 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return (typeof NS.lerp === 'function') ? NS.lerp(a, b, t) : a + (b - a) * t; }
  function ease(n, x) { return (typeof NS.ease === 'function') ? NS.ease(n, x) : x; }

  /* سبرايت طائر: ظلّ جناحين مقوّسين وجسم صغير (يُرفرف بمقياس y) */
  function makeBirdTexture(THREE) {
    var c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    var g = c.getContext('2d');
    if (!g) return null;
    g.clearRect(0, 0, 64, 32);
    g.fillStyle = '#132A44';
    g.beginPath();
    g.moveTo(2, 15);
    g.quadraticCurveTo(17, 1, 32, 15);
    g.quadraticCurveTo(47, 1, 62, 15);
    g.quadraticCurveTo(47, 12, 32, 23);
    g.quadraticCurveTo(17, 12, 2, 15);
    g.closePath();
    g.fill();
    g.beginPath(); g.ellipse(32, 18, 5.5, 3.2, 0, 0, Math.PI * 2); g.fill();
    var tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  var station = {
    id: 's1',
    index: 0,
    weight: 1.0,
    text: {
      headline: 'صباحك يبدأ من البوابة',
      copy: 'تحضير، حصة حيّة، ٧٨٢ درساً، وتقارير أولياء الأمور… كلها في هاتفك.'
    },
    /* نقطة وسطى ترفع الأفق قليلاً حتى لا يملأ الرمل ثلث الكادر السفلي عند التسليم */
    cam: [
      { t: 0.0, pos: [0, 3.6, 3.2], look: [0, 5.2, 0] },
      { t: 0.72, pos: [0, 4.2, 17], look: [0, 3.3, -2] },
      { t: 1.0, pos: [0, 4.8, 22], look: [0, 2.6, -2] }
    ],
    posterTitle: 'صباحك يبدأ من البوابة',

    /* حالة داخلية */
    _scr: null,
    _birds: null,
    _birdMat: null,
    _birdTex: null,
    _tmp: null,
    _p: 0,
    _dir: -1,
    _mobile: false,
    _quality: 'high',
    _ledHidden: false,

    build: function (ctx) {
      var THREE = (ctx && ctx.THREE) || window.THREE;
      if (!THREE || !this.group) return;
      var self = this;
      this._mobile = !!(ctx && ctx.isMobile);
      this._quality = (ctx && ctx.quality) || 'high';
      this._dir = (ctx && typeof ctx.DIR === 'number') ? ctx.DIR : (typeof NS.DIR === 'number' ? NS.DIR : -1);
      this._tmp = { m: new THREE.Matrix4(), v: new THREE.Vector3(), s: new THREE.Vector3(), q: new THREE.Quaternion() };

      /* الشاشة الإجرائية مكان لوحة LED */
      try {
        var media = (ctx && ctx.media) || NS.media;
        if (media && typeof media.screen === 'function') {
          this._scr = media.screen({
            width: 6, height: 3.375,
            poster: null, video: null, clip: 'sd-courtyard',
            frame: 'none',
            open: 1, openFromProgress: false,
            base: COLORS.navy,
            name: 's1-led',
            procedural: function (c, w, h, time, p) { self._drawDawn(c, w, h, time, p); }
          });
          var m = this._scr.mesh;
          m.position.set(LED_POS[0], LED_POS[1], LED_POS[2]);
          m.name = 's1-led';
          this.group.add(m);
        }
      } catch (e) { this._scr = null; }

      /* ثلاثة طيور: سبرايت مستوٍ لكل طير في InstancedMesh واحد يواجه الكاميرا */
      try {
        this._birdTex = makeBirdTexture(THREE);
        var mat = new THREE.MeshBasicMaterial({ map: this._birdTex, transparent: true, opacity: 0, alphaTest: 0.25, depthWrite: false, side: THREE.DoubleSide, fog: true });
        var birds = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.5), mat, BIRDS);
        birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        birds.name = 's1-birds';
        birds.frustumCulled = false;
        birds.visible = false;
        for (var i = 0; i < BIRDS; i++) { this._tmp.m.makeScale(0.001, 0.001, 0.001); birds.setMatrixAt(i, this._tmp.m); }
        this.group.add(birds);
        this._birds = birds;
        this._birdMat = mat;
      } catch (e) { this._birds = null; }
    },

    load: function (ctx) {
      var world = (ctx && ctx.world) || NS.world;
      try {
        if (world && world.led && this._scr) { world.led.visible = false; this._ledHidden = true; }
        if (this._scr) this._scr.enter();
      } catch (e) {}
    },

    unload: function (ctx) {
      var world = (ctx && ctx.world) || NS.world;
      try {
        if (this._scr) this._scr.leave();
        if (world && world.led && this._ledHidden) { world.led.visible = true; this._ledHidden = false; }
        if (this._birds) { this._birds.visible = false; this._birdMat.opacity = 0; }
      } catch (e) {}
    },

    setQuality: function (q) {
      this._quality = q || 'high';
    },

    update: function (p, ctx) {
      p = clamp(+p || 0, 0, 1);
      this._p = p;
      var time = (ctx && typeof ctx.time === 'number') ? ctx.time : 0;
      /* الشاشة: التقدم يصل إلى الرسم الإجرائي (الشمس ترتفع مع التمرير) */
      if (this._scr) {
        try {
          this._scr.setProgress(p);
          /* استلام: اللوحة تسطع قليلاً وهي تملأ الشاشة ثم تعود لسطوعها الطبيعي */
          this._scr.uniforms.uBright.value = lerp(1.08, 1, ease('out', p / 0.15));
        } catch (e) {}
      }
      this._updateBirds(p, time, ctx);
    },

    /* ---------- الطيور ---------- */
    _updateBirds: function (p, time, ctx) {
      var birds = this._birds, T = this._tmp;
      if (!birds || !T) return;
      var dir = this._dir;
      var anyVisible = false, maxA = 0;
      var cam = ctx && ctx.camera;
      if (cam) T.q.copy(cam.quaternion); else T.q.identity();
      for (var i = 0; i < BIRDS; i++) {
        /* كل طير يبدأ متأخراً قليلاً عن سابقه؛ يعبر من جهة البداية (اليمين) إلى اليسار */
        var k = (p - 0.14 - i * 0.05) / 0.6;
        var a = smooth(0, 0.1, k) * (1 - smooth(0.9, 1, k));
        k = clamp(k, 0, 1);
        var cx = dir * lerp(-20, 20, k);
        /* فوق تاج البوابة وخلفه قليلاً حتى تبقى الطيور على خلفية السماء */
        var cy = 8.9 + i * 0.5 + Math.sin(k * Math.PI * 2 + i * 1.3) * 0.35;
        var cz = -3.5 - i * 1.6;
        var flap = 0.4 + 0.6 * Math.abs(Math.sin(time * 8.5 + i * 2.1));
        var span = (0.46 + i * 0.05) * 2.1;
        T.v.set(cx, cy, cz);
        T.s.set(span, span * 0.5 * flap, 1);
        T.m.compose(T.v, T.q, T.s);
        birds.setMatrixAt(i, T.m);
        if (a > maxA) maxA = a;
        if (a > 0.001) anyVisible = true;
      }
      birds.instanceMatrix.needsUpdate = true;
      birds.visible = anyVisible;
      this._birdMat.opacity = 0.9 * maxA;
    },

    /* ---------- الرسم الإجرائي للوحة: فجر يتدرج من الكحلي إلى الذهبي ---------- */
    _drawDawn: function (c, w, h, time, p) {
      var dawn = ease('out', clamp(p / 0.75, 0, 1));
      var handoff = smooth(0.78, 1, p);
      var light = this._quality === 'light';

      /* السماء */
      var sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, COLORS.navy);
      sky.addColorStop(lerp(0.5, 0.3, dawn), '#2A4468');
      sky.addColorStop(lerp(0.8, 0.62, dawn), '#B98A55');
      sky.addColorStop(1, COLORS.gold);
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h);

      /* الشمس: ترتفع مع التمرير */
      var sx = w * 0.64, sy = h * lerp(0.86, 0.6, dawn);
      var glow = c.createRadialGradient(sx, sy, 0, sx, sy, h * 0.55);
      glow.addColorStop(0, 'rgba(240,217,154,0.95)');
      glow.addColorStop(0.18, 'rgba(240,217,154,0.55)');
      glow.addColorStop(0.5, 'rgba(232,164,107,0.18)');
      glow.addColorStop(1, 'rgba(232,164,107,0)');
      c.fillStyle = glow;
      c.fillRect(0, 0, w, h);
      c.fillStyle = COLORS.paleGold;
      c.beginPath(); c.arc(sx, sy, h * 0.05, 0, Math.PI * 2); c.fill();

      /* أفق المدرسة: سور بقوس البوابة يشعّ من خلفه ضوء الصباح، بنافذتين مضيئتين */
      var hy = h * 0.8;
      c.fillStyle = 'rgba(7,19,34,0.86)';
      c.fillRect(0, hy, w, h - hy);
      c.fillRect(0, hy - 6, w, 6);
      /* نافذتان مضيئتان في السور */
      c.fillStyle = 'rgba(240,217,154,' + (0.35 + 0.45 * dawn).toFixed(3) + ')';
      c.fillRect(w * 0.27, hy + 10, w * 0.035, h * 0.05);
      c.fillRect(w * 0.7, hy + 10, w * 0.035, h * 0.05);
      /* قوس البوابة: تدرّج ذهبي بظل وحافة داكنة ثم خط ذهبي رفيع */
      var ax = w * 0.5, aw = w * 0.06, ay = hy - 18;
      var arch = c.createLinearGradient(ax - aw, 0, ax + aw, 0);
      arch.addColorStop(0, 'rgba(160,120,40,0.95)');
      arch.addColorStop(0.45, 'rgba(240,217,154,0.98)');
      arch.addColorStop(1, 'rgba(178,134,45,0.95)');
      c.beginPath();
      c.moveTo(ax - aw, h); c.lineTo(ax - aw, ay);
      c.arc(ax, ay, aw, Math.PI, 0, false);
      c.lineTo(ax + aw, h); c.closePath();
      c.fillStyle = arch;
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = 'rgba(7,19,34,0.55)';
      c.stroke();
      c.beginPath();
      c.arc(ax, ay, aw + 4, Math.PI, 0, false);
      c.strokeStyle = 'rgba(240,217,154,0.85)';
      c.lineWidth = 1.2;
      c.stroke();
      c.fillStyle = 'rgba(7,19,34,0.86)';
      c.fillRect(w * 0.41, hy - 34, w * 0.03, 34 + (h - hy));
      c.fillRect(w * 0.56, hy - 34, w * 0.03, 34 + (h - hy));
      c.fillStyle = 'rgba(240,217,154,0.9)';
      c.fillRect(w * 0.405, hy - 37, w * 0.04, 3);
      c.fillRect(w * 0.555, hy - 37, w * 0.04, 3);

      /* ظل النخلة يتمايل (جذع رفيع وسعف أنحف) */
      var sway = Math.sin(time * 0.8) * w * 0.012;
      var bx = w * 0.15, top = h * 0.4;
      c.fillStyle = 'rgba(7,19,34,0.8)';
      c.beginPath();
      c.moveTo(bx - w * 0.009, h);
      c.quadraticCurveTo(bx + sway * 0.4, h * 0.7, bx + sway - w * 0.004, top);
      c.lineTo(bx + sway + w * 0.004, top);
      c.quadraticCurveTo(bx + sway * 0.4 + w * 0.009, h * 0.7, bx + w * 0.009, h);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(7,19,34,0.8)';
      c.lineCap = 'round';
      c.lineWidth = Math.max(1.5, h * 0.008);
      var cxp = bx + sway, cyp = top;
      for (var f = 0; f < 7; f++) {
        var ang = -Math.PI * 0.95 + f * (Math.PI * 0.9 / 6);
        var len = w * (0.13 + (f % 2) * 0.025);
        var wob = Math.sin(time * 1.1 + f) * w * 0.006;
        var ex = cxp + Math.cos(ang) * len + wob, ey = cyp + Math.sin(ang) * len * 0.75 + len * 0.28;
        var mx = cxp + Math.cos(ang) * len * 0.55 + wob * 0.5, my = cyp + Math.sin(ang) * len * 0.75 * 0.55 - len * 0.12;
        c.beginPath();
        c.moveTo(cxp, cyp);
        c.quadraticCurveTo(mx, my, ex, ey);
        c.stroke();
      }

      /* إطار ذهبي رفيع داخل اللوحة */
      c.strokeStyle = 'rgba(240,217,154,0.55)';
      c.lineWidth = 2;
      c.strokeRect(8, 8, w - 16, h - 16);

      /* غبار ذهبي يطفو (يهدأ عند التسليم) */
      var n = light ? 0 : (this._mobile ? 12 : 24);
      var fade = 1 - handoff;
      for (var i = 0; i < n; i++) {
        var spd = 0.02 + (i % 4) * 0.008;
        var px = ((i * 0.618 + time * 0.012 * (1 + (i % 3))) % 1) * w;
        var py = h * (1 - (((time * spd) + i * 0.37) % 1));
        var r = 1 + (i % 3) * 0.6;
        var al = (0.3 + 0.3 * Math.sin(time * 1.4 + i)) * fade;
        c.fillStyle = 'rgba(240,217,154,' + al.toFixed(3) + ')';
        c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
      }
    }
  };

  try { NS.registerStation(station); } catch (e) {}
})();
