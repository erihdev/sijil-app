/* سجل المتابعة الرقمي — الجولة السينمائية: المحطة 4 «جدار الدروس»
   الكاميرا تدولي على جدار الدروس: البلاطات الصغيرة تنبثق موجةً من اليمين، ثلاث بلاطات بطلة
   تطير نحو الكاميرا وتستقر ثم تعود، عدّاد ٠→٧٨٢ مع 11 شريط مادة، وشريط أسماء المواد أسفل الجدار. */
(function () {
  'use strict';
  var NS = window.SIJIL_INTRO = window.SIJIL_INTRO || {};
  if (typeof NS.registerStation !== 'function') return;

  var TOTAL = 782;
  var HALF = Math.PI / 2;
  var WALL_X = 3.972;
  var GOLD_PALE = 0xF0D99A;
  var SUBJECTS = [
    { name: 'القرآن الكريم', value: 96 },
    { name: 'التوحيد', value: 54 },
    { name: 'الفقه', value: 62 },
    { name: 'الحديث', value: 48 },
    { name: 'اللغة العربية', value: 118 },
    { name: 'الرياضيات', value: 104 },
    { name: 'العلوم', value: 88 },
    { name: 'الاجتماعيات', value: 60 },
    { name: 'اللغة الإنجليزية', value: 70 },
    { name: 'المهارات الرقمية', value: 46 },
    { name: 'التربية الفنية', value: 36 }
  ];
  var FALLBACK_COLORS = [0x0E2033, 0x1D3A5C, 0x2F6B8F, 0x4F7FC7, 0x9FC4E8, 0x2F8F5B, 0x6FA36B, 0xD7A93F, 0xF0D99A, 0xC9772B, 0x8B5A2B];
  /* البلاطات البطلة: فهرس اللوح الكبير على الجدار (r*6+c) + احتياط إن غابت خلايا العالم */
  var HERO_CELLS = [
    { cell: 7, atlas: 14, pos: [3.93, 2.475, -47] },
    { cell: 15, atlas: 30, pos: [3.93, 1.725, -51] },
    { cell: 23, atlas: 46, pos: [3.93, 0.975, -55] }
  ];
  /* مواضع الاستقرار أمام الكاميرا (يمين/أعلى/بُعد/انعراج/حجم) */
  var SLOTS_DESKTOP = [
    { right: -0.92, up: 0.16, dist: 2.0, yaw: 0.16, size: 0.62 },
    { right: 0.0, up: 0.38, dist: 2.05, yaw: 0.0, size: 0.62 },
    { right: 0.92, up: 0.10, dist: 2.0, yaw: -0.16, size: 0.62 }
  ];
  var SLOTS_MOBILE = [
    { right: -0.14, up: -0.36, dist: 2.0, yaw: 0.12, size: 0.46 },
    { right: 0.05, up: -0.62, dist: 2.0, yaw: 0.0, size: 0.46 },
    { right: 0.24, up: -0.88, dist: 2.0, yaw: -0.12, size: 0.46 }
  ];
  /* توقيت الطيران (p محلي): انطلاق، مدة الصعود، بدء العودة، مدة العودة */
  var FLIGHT = [
    { go: 0.44, up: 0.13, back: 0.77, down: 0.13 },
    { go: 0.49, up: 0.13, back: 0.80, down: 0.13 },
    { go: 0.54, up: 0.13, back: 0.83, down: 0.13 }
  ];

  function arNum(n) {
    n = Math.round(+n || 0);
    try { return n.toLocaleString('ar-EG'); } catch (e) { return String(n); }
  }
  function hex(c) { return '#' + ('000000' + (c >>> 0).toString(16)).slice(-6); }
  function ease(name, x) { return typeof NS.ease === 'function' ? NS.ease(name, x) : x; }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function remap(x, a, b) { return clamp((x - a) / ((b - a) || 1), 0, 1); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  NS.registerStation({
    id: 's4-library',
    index: 3,
    weight: 1.15,
    /* الرقم ٧٨٢ يبقى مفاجأة العدّاد؛ العنوان لا يحرقها */
    text: {
      headline: 'مكتبة دروس جاهزة للعرض',
      copy: '١١ مادة للصفوف ٢–٦، بصور وصوت، تُفتح على السبورة بضغطة.'
    },
    /* look.y أخفض قليلاً ليدخل صف أسماء المواد في الكادر؛ نقطة تسليم تنظر نحو النافذة (لا فراغ رمادي) */
    cam: [
      { t: 0.0, pos: [0, 1.8, -45], look: [3.9, 1.8, -49] },
      { t: 0.86, pos: [0, 1.8, -55], look: [3.9, 1.8, -56] },
      { t: 1.0, pos: [0, 1.8, -56.2], look: [-3.9, 2, -58] }
    ],
    posterTitle: 'مكتبة دروس جاهزة للعرض',

    /* ---------- البناء ---------- */
    build: function (ctx) {
      var THREE = ctx.THREE || window.THREE;
      var st = this;
      st._tmp = null;
      st._heroes = [];
      st._strip = null;
      st._tiles = null;
      st._orig = null;
      st._lastP = -1;
      st._counterOn = false;
      st._counterHost = null;
      if (!THREE || !st.group) return;

      st._tmp = {
        m: new THREE.Matrix4(), v: new THREE.Vector3(), s: new THREE.Vector3(), q: new THREE.Quaternion(),
        fwd: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(),
        rest: new THREE.Vector3(), tgt: new THREE.Vector3(), wallQ: new THREE.Quaternion(), yawQ: new THREE.Quaternion(),
        camQ: new THREE.Quaternion(), e: new THREE.Euler()
      };
      st._tmp.wallQ.setFromEuler(st._tmp.e.set(0, -HALF, 0));

      var wall = ctx.world && ctx.world.lessonsWall;

      /* البلاطات الصغيرة (782) من العالم: نحفظ مصفوفاتها الأصلية ونحرّكها بالتمرير */
      try {
        if (wall && wall.tiles && wall.tiles.isInstancedMesh) {
          st._tiles = wall.tiles;
          st._orig = Float32Array.from(wall.tiles.instanceMatrix.array);
          st._count = wall.tiles.count;
          if (wall.tiles.instanceMatrix.setUsage) wall.tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          /* لكل بلاطة: لحظة الظهور (موجة من اليمين z=−44 نحو −56 مع ميل طفيف بالارتفاع)*/
          var starts = new Float32Array(st._count);
          for (var i = 0; i < st._count; i++) {
            var o = i * 16;
            var y = st._orig[o + 13], z = st._orig[o + 14];
            var az = clamp((-44 - z) / 12, 0, 1), ay = clamp((y - 0.6) / 3, 0, 1);
            var jitter = ((i * 7919) % 97) / 97 * 0.025;
            /* الموجة تبدأ بعد مرحلة الاستلام (0.15) وتكتمل قبل 0.65 فيبقى العدّاد «٠» حتى 0.15 و«٧٨٢» من 0.70 */
            starts[i] = 0.155 + az * 0.34 + ay * 0.04 + jitter;
          }
          st._starts = starts;
        }
      } catch (e) { st._tiles = null; st._orig = null; }

      /* مادة الأطلس للبلاطات البطلة: الخريطة تُضبط في load() عند جاهزية الأطلس */
      var heroMat = new THREE.MeshBasicMaterial({ map: null, color: 0xD9CDB5, side: THREE.DoubleSide });
      st._heroMat = heroMat;
      var frameMat = new THREE.MeshBasicMaterial({ color: GOLD_PALE, side: THREE.DoubleSide });

      function cellUV(def) {
        var c = wall && wall.cells && wall.cells[def.cell];
        if (c && c.uv && c.uv.length === 4) return c.uv;
        try {
          if (ctx.media && typeof ctx.media.atlasUV === 'function') {
            var a = ctx.media.atlasUV(def.atlas);
            return [a.u, a.v, a.u + a.w, a.v + a.h];
          }
        } catch (e) {}
        var col = def.atlas % 8, row = Math.floor(def.atlas / 8);
        return [col / 8, 1 - (row + 1) / 6, (col + 1) / 8, 1 - row / 6];
      }

      for (var h = 0; h < HERO_CELLS.length; h++) {
        try {
          var def = HERO_CELLS[h];
          var c = wall && wall.cells && wall.cells[def.cell];
          var pos = (c && c.pos) ? c.pos : def.pos;
          var size = (c && c.size) ? c.size : 0.7;
          var uv = cellUV(def);
          var g = new THREE.PlaneGeometry(1, 1);
          var ua = g.attributes.uv;
          for (var v = 0; v < ua.count; v++) ua.setXY(v, uv[0] + ua.getX(v) * (uv[2] - uv[0]), uv[1] + ua.getY(v) * (uv[3] - uv[1]));
          var mesh = new THREE.Mesh(g, heroMat);
          mesh.name = 'heroTile' + h;
          mesh.visible = false;
          mesh.frustumCulled = false;
          var frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), frameMat);
          frame.name = 'heroFrame' + h;
          frame.position.z = -0.004;
          frame.scale.set(1.07, 1.07, 1);
          mesh.add(frame);
          st.group.add(mesh);
          st._heroes.push({
            mesh: mesh, frame: frame,
            rest: new THREE.Vector3(pos[0] - 0.03, pos[1], pos[2]),
            size: size, k: 0
          });
        } catch (e) {}
      }

      /* شريط أسماء المواد أسفل الجدار (نسيج canvas واحد، رسمة واحدة) */
      try {
        if (ctx.media && typeof ctx.media.canvasTexture === 'function') {
          var colors = (wall && wall.subjects && wall.subjects.length === 11) ? wall.subjects : FALLBACK_COLORS;
          var W = 2048, H = 64;
          var ct = ctx.media.canvasTexture(W, H, function (c2d, w, hh) {
            var cw = w / SUBJECTS.length;
            /* كل مادة في خلية: نقطة بلون المادة، الاسم (يُصغَّر ليتّسع)، وتحته عدد الدروس */
            for (var k = 0; k < SUBJECTS.length; k++) {
              var x1 = w - k * cw, x0 = x1 - cw;
              c2d.fillStyle = 'rgba(240,217,154,0.10)';
              c2d.fillRect(x0 + 3, 5, cw - 6, hh - 10);
              c2d.fillStyle = hex(colors[k]);
              c2d.beginPath(); c2d.arc(x1 - 14, 22, 5, 0, Math.PI * 2); c2d.fill();
              c2d.textBaseline = 'middle';
              c2d.textAlign = 'right';
              c2d.direction = 'rtl';
              var fs = 24, maxW = cw - 34, name = SUBJECTS[k].name, tw = 0;
              for (var tries = 0; tries < 6; tries++) {
                c2d.font = '700 ' + fs + 'px Tajawal, Changa, system-ui, sans-serif';
                try { tw = c2d.measureText(name).width; } catch (e) { tw = 0; }
                if (tw <= maxW || fs <= 15) break;
                fs -= 2;
              }
              c2d.fillStyle = '#F0D99A';
              c2d.fillText(name, x1 - 26, 22);
              c2d.fillStyle = 'rgba(248,245,239,0.8)';
              c2d.font = '500 15px Tajawal, system-ui, sans-serif';
              c2d.fillText(arNum(SUBJECTS[k].value) + ' درساً', x1 - 26, 48);
            }
          });
          st._stripTex = ct;
          var stripMat = new THREE.MeshBasicMaterial({ map: ct.texture, transparent: true, opacity: 0, depthWrite: false });
          var sg = new THREE.PlaneGeometry(12, 12 * H / W);
          var strip = new THREE.Mesh(sg, stripMat);
          strip.position.set(3.955, 0.41, -50);
          strip.rotation.y = -HALF;
          strip.name = 'subjectStrip';
          strip.visible = false;
          st.group.add(strip);
          st._strip = strip;
        }
      } catch (e) { st._strip = null; }

      st._bars = SUBJECTS.map(function (s) { return { name: s.name, value: s.value }; });
    },

    load: function (ctx) {
      var st = this;
      try {
        var wall = ctx.world && ctx.world.lessonsWall;
        var tex = null;
        if (wall && typeof wall.ensureAtlas === 'function') tex = wall.ensureAtlas();
        else if (ctx.media && typeof ctx.media.atlas === 'function') tex = ctx.media.atlas();
        if (tex && st._heroMat && st._heroMat.map !== tex) {
          var apply = function () {
            if (!st._heroMat) return;
            st._heroMat.map = tex; st._heroMat.color.setHex(0xffffff); st._heroMat.needsUpdate = true;
          };
          if (tex.userData && tex.userData.ready === false && ctx.media && typeof ctx.media.onReady === 'function') ctx.media.onReady(tex, apply);
          else apply();
        }
      } catch (e) {}
    },

    unload: function (ctx) {
      this._settle(ctx);
    },

    /* إعادة كل شيء إلى حالته الساكنة (عند الابتعاد أو قفزة تتخطى مرحلة التسليم) */
    _settle: function (ctx) {
      var st = this;
      st._lastP = -1;
      try { st._restoreTiles(); } catch (e) {}
      try { st._counter(ctx || NS.ctx, 0, false); } catch (e) {}
      for (var i = 0; i < (st._heroes ? st._heroes.length : 0); i++) { st._heroes[i].mesh.visible = false; st._heroes[i].k = 0; }
      if (st._strip) { st._strip.visible = false; st._strip.material.opacity = 0; }
    },

    /* حارس خفيف أثناء ظهور العدّاد: إن غادرت المحطة بقفزة دون المرور بمرحلة التسليم يُخفى كل شيء */
    _watch: function (on) {
      var st = this;
      if (on && !st._watchId) {
        st._watchId = setInterval(function () {
          var s = NS.state;
          if (!s || s.finished || s.active !== 's4-library') { try { st._settle(NS.ctx); } catch (e) {} }
        }, 250);
      } else if (!on && st._watchId) {
        clearInterval(st._watchId);
        st._watchId = 0;
      }
    },

    setQuality: function () {},

    /* ---------- أدوات داخلية ---------- */
    _restoreTiles: function () {
      var st = this;
      if (!st._tiles || !st._orig) return;
      st._tiles.instanceMatrix.array.set(st._orig);
      st._tiles.instanceMatrix.needsUpdate = true;
    },

    /* موجة البلاطات: تعيد عدد البلاطات الظاهرة (للعدّاد) */
    _wave: function (p) {
      var st = this;
      if (!st._tiles || !st._orig) return Math.round(TOTAL * ease('out', remap(p, 0.155, 0.62)));
      var WAVE_END = 0.64;
      if (p >= WAVE_END && st._lastP >= WAVE_END) return st._count;
      var arr = st._tiles.instanceMatrix.array, orig = st._orig, starts = st._starts;
      var shown = 0, DUR = 0.07;
      for (var i = 0; i < st._count; i++) {
        var o = i * 16;
        var x = (p - starts[i]) / DUR;
        var s;
        if (x <= 0) s = 0;
        else if (x >= 1) { s = 1; shown++; }
        else { s = ease('back', x); if (x >= 0.5) shown++; }
        var pop = (x > 0 && x < 1) ? Math.sin(x * Math.PI) * 0.03 : 0;
        arr[o] = orig[o] * s; arr[o + 5] = orig[o + 5] * s; arr[o + 10] = orig[o + 10] * s;
        arr[o + 12] = orig[o + 12] - pop;
      }
      st._tiles.instanceMatrix.needsUpdate = true;
      return shown;
    },

    _counter: function (ctx, value, on, alpha) {
      var st = this;
      var ui = ctx.ui || NS.ui;
      if (!ui || !ui.counter) return;
      if (on && !st._counterOn) {
        st._counterOn = true;
        st._counterA = -1;
        st._counterHost = ui.counter.show(TOTAL, st._bars) || document.getElementById('intro-counter');
        /* على الجوال يتزاحم العدّاد مع نص المحطة في الثلث العلوي فنُنزله تحته؛
           على المكتب يقف أعلى اليمين فوق الجدار الفارغ لا فوق صور الدروس (النص أسفل اليمين) */
        if (st._counterHost) {
          try {
            var hs = st._counterHost.style;
            if (ctx.isMobile) { hs.top = '32vh'; hs.top = '32svh'; }
            else { hs.top = '16svh'; hs.bottom = 'auto'; hs.insetInlineStart = '6vw'; hs.insetInlineEnd = 'auto'; }
          } catch (e) {}
        }
        st._watch(true);
      } else if (!on && st._counterOn) {
        st._counterOn = false;
        st._watch(false);
        ui.counter.hide();
        if (st._counterHost) {
          try {
            var hs2 = st._counterHost.style;
            hs2.top = ''; hs2.bottom = ''; hs2.insetInlineStart = ''; hs2.insetInlineEnd = ''; hs2.opacity = ''; hs2.transform = '';
          } catch (e) {}
        }
        return;
      }
      if (!st._counterOn) return;
      ui.counter.set(value);
      if (st._counterHost) {
        var a = Math.round(clamp(alpha == null ? 1 : alpha, 0, 1) * 100) / 100;
        if (st._counterA !== a) {
          st._counterA = a;
          st._counterHost.style.opacity = String(a);
          st._counterHost.style.transform = 'translate3d(0,' + ((1 - a) * 14).toFixed(1) + 'px,0)';
        }
      }
    },

    _flyHeroes: function (p, ctx) {
      var st = this, T = st._tmp;
      var cam = ctx.camera;
      if (!T || !cam || !st._heroes.length) return;
      var slots = ctx.isMobile ? SLOTS_MOBILE : SLOTS_DESKTOP;
      cam.updateMatrixWorld();
      cam.getWorldDirection(T.fwd);
      T.right.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
      T.up.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
      T.camQ.copy(cam.quaternion);
      for (var i = 0; i < st._heroes.length; i++) {
        var hr = st._heroes[i], f = FLIGHT[i] || FLIGHT[0], sl = slots[i] || slots[0];
        var k;
        if (p < f.go) k = 0;
        else if (p < f.go + f.up) k = ease('out', (p - f.go) / f.up);
        else if (p < f.back) k = 1;
        else k = 1 - ease('inOut', (p - f.back) / f.down);
        hr.k = k;
        var vis = k > 0.002;
        hr.mesh.visible = vis;
        if (!vis) continue;
        T.tgt.copy(cam.position)
          .addScaledVector(T.fwd, sl.dist)
          .addScaledVector(T.right, sl.right)
          .addScaledVector(T.up, sl.up);
        var arc = Math.sin(k * Math.PI);
        hr.mesh.position.copy(hr.rest).lerp(T.tgt, k)
          .addScaledVector(T.up, arc * 0.22)
          .addScaledVector(T.right, arc * (i - 1) * 0.12);
        T.yawQ.setFromEuler(T.e.set(0, sl.yaw, 0));
        T.q.copy(T.camQ).multiply(T.yawQ);
        hr.mesh.quaternion.slerpQuaternions(T.wallQ, T.q, ease('inOut', k));
        var s = lerp(hr.size, sl.size, k);
        hr.mesh.scale.set(s, s, 1);
        hr.frame.visible = k > 0.05;
        var fs = 1 + 0.07 * ease('out', remap(k, 0.05, 0.6));
        hr.frame.scale.set(fs, fs, 1);
      }
    },

    /* ---------- الإطار ---------- */
    update: function (p, ctx) {
      var st = this;
      p = clamp(+p || 0, 0, 1);
      if (!st._tmp && !st._tiles) { st._lastP = p; return; }

      /* 0–.15 استلام: العدّاد يدخل على «٠»؛ .15–.65 نهوض: موجة البلاطات تكتمل والعدّاد يعدّ حتى ٧٨٢؛
         .55–.75 ذروة: البلاطات البطلة أمام الكاميرا؛ .75–1 تسليم: تعود والعدّاد يخفت */
      var shown = st._wave(p);

      var on = p > 0.03 && p < 0.93;
      var alpha = ease('out', remap(p, 0.04, 0.14)) * (1 - ease('in', remap(p, 0.80, 0.90)));
      st._counter(ctx, Math.min(TOTAL, shown), on, alpha);

      if (st._strip) {
        var so = ease('out', remap(p, 0.08, 0.32)) * (1 - ease('in', remap(p, 0.80, 0.92)));
        st._strip.visible = so > 0.003;
        st._strip.material.opacity = so;
      }

      st._flyHeroes(p, ctx);
      st._lastP = p;
    }
  });
})();
