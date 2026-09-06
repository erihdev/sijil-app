/* سجل المتابعة الرقمي — الجولة السينمائية: المحطة 4 «جدار الدروس»
   الكاميرا تدولي على جدار الدروس: البلاطات الصغيرة تنبثق موجةً من اليمين، ثلاث بلاطات بطلة
   تطير نحو الكاميرا وتستقر ثم تعود، عدّاد ٠→٧٨٢ مع 11 شريط مادة، وشريط أسماء المواد أسفل الجدار.
   الجوال العمودي (ctx.portrait): الكاميرا أبعد وشبه عمودية على الجدار (mpos/mlook) فيظهر كشبكة
   مستوية داخل الحزام الأوسط، البلاطات البطلة أصغر وتحت العدّاد،
   وأسماء المواد على شريط قريب من الكاميرا (4 صفوف) داخل الكادر بدل الشريط الطويل على الجدار. */
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
  /* مواضع الاستقرار أمام الكاميرا (يمين/أعلى/بُعد/انعراج/حجم) — بالمتر في فضاء الكاميرا */
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
  /* الجوال العمودي: كسور من عرض/ارتفاع الشاشة المرئي عند البُعد dist (sx يمين موجب، sy أعلى موجب)؛
     حرف V صغير تحت العدّاد داخل الحزام 54%–78% من الارتفاع، وعرضه الكلي ≈ 83% من الشاشة */
  var SLOTS_PORTRAIT = [
    { sx: -0.27, sy: -0.10, dist: 2.0, yaw: 0.12, size: 0.25 },
    { sx: 0.0, sy: -0.26, dist: 2.0, yaw: 0.0, size: 0.25 },
    { sx: 0.27, sy: -0.10, dist: 2.0, yaw: -0.12, size: 0.25 }
  ];
  /* الشريط القريب (أسماء المواد) واللوحة الكحلية خلف العدّاد في العمودي — كسور شاشة */
  var RIBBON_P = { sx: 0.0, sy: -0.375, dist: 2.4, w: 0.84, h: 0.097 };
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
  function isPortrait(ctx) {
    if (ctx && ctx.portrait != null) return !!ctx.portrait;
    try { return !!(ctx && ctx.isMobile && window.innerHeight > window.innerWidth); } catch (e) { return false; }
  }
  function roundRect(c2d, x, y, w, h, r) {
    c2d.beginPath();
    c2d.moveTo(x + r, y);
    c2d.lineTo(x + w - r, y); c2d.quadraticCurveTo(x + w, y, x + w, y + r);
    c2d.lineTo(x + w, y + h - r); c2d.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c2d.lineTo(x + r, y + h); c2d.quadraticCurveTo(x, y + h, x, y + h - r);
    c2d.lineTo(x, y + r); c2d.quadraticCurveTo(x, y, x + r, y);
    c2d.closePath();
  }

  NS.registerStation({
    id: 's4-library',
    index: 3,
    weight: 1.15,
    /* الرقم ٧٨٢ يبقى مفاجأة العدّاد؛ العنوان لا يحرقها */
    text: {
      headline: 'مكتبة دروس جاهزة للعرض',
      copy: '١١ مادة للصفوف ٢–٦، بصور وصوت، تُفتح على السبورة بضغطة.'
    },
    /* look.y أخفض قليلاً ليدخل صف أسماء المواد في الكادر؛ نقطة تسليم تنظر نحو النافذة (لا فراغ رمادي).
       المكتب/الأفقي: النقاط الثلاث نفسها بلا تغيير (pos/look).
       العمودي (mpos/mlook): دخول من قرب وسط الممر x≈−2.4 (الخط من نهاية المحطة 3 يعبر فتحة الفصل) ثم
       انزياح بطيء إلى الجهة اليسرى x≈−3.3 (6.3→7.3م من الجدار) والنظر شبه عمودياً على الجدار مع رفع الهدف (y≈2.75) لينزل الجدار
       تحت كتلة النص والعدّاد (ui: 23–30svh): قمّته ≈ 40% وقاعدته ≈ 75% من ارتفاع الشاشة. */
    cam: [
      { t: 0.0, pos: [0, 1.8, -45], look: [3.9, 1.8, -49], mpos: [-2.4, 2.4, -44.9], mlook: [3.9, 2.85, -47.6] },
      { t: 0.86, pos: [0, 1.8, -55], look: [3.9, 1.8, -56], mpos: [-3.3, 2.4, -50.7], mlook: [3.9, 2.75, -51.1] },
      { t: 1.0, pos: [0, 1.8, -56.2], look: [-3.9, 2, -58], mpos: [-1.6, 2.0, -55.6], mlook: [-3.9, 2.0, -58] }
    ],
    posterTitle: 'مكتبة دروس جاهزة للعرض',

    /* ---------- البناء ---------- */
    build: function (ctx) {
      var THREE = ctx.THREE || window.THREE;
      var st = this;
      st._tmp = null;
      st._heroes = [];
      st._strip = null;
      st._ribbon = null;
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
          var starts = new Float32Array(st._count), startsP = new Float32Array(st._count);
          for (var i = 0; i < st._count; i++) {
            var o = i * 16;
            var y = st._orig[o + 13], z = st._orig[o + 14];
            var az = clamp((-44 - z) / 12, 0, 1), ay = clamp((y - 0.6) / 3, 0, 1);
            var jitter = ((i * 7919) % 97) / 97 * 0.025;
            /* الموجة تبدأ بعد مرحلة الاستلام (0.15) وتكتمل قبل 0.65 فيبقى العدّاد «٠» حتى 0.15 و«٧٨٢» من 0.70 */
            starts[i] = 0.155 + az * 0.34 + ay * 0.04 + jitter;
            /* العمودي: الكادر عند p≈0.2 يغطي z≈−46.6..−50.6 فتبدأ الموجة من أصل القسم المؤطَّر (z −46.6) لا من طرف الجدار
               (تكتمل عند z −56 بحلول ≈0.56 كما في المكتب فلا يتغيّر إيقاع العدّاد) */
            var azP = clamp((-46.6 - z) / 9.4, 0, 1);
            startsP[i] = 0.155 + azP * 0.34 + ay * 0.04 + jitter;
          }
          st._starts = starts;
          st._startsP = startsP;
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

      var colors = (wall && wall.subjects && wall.subjects.length === 11) ? wall.subjects : FALLBACK_COLORS;

      /* شريط أسماء المواد أسفل الجدار (نسيج canvas واحد، رسمة واحدة) — المكتب والجوال الأفقي */
      try {
        if (ctx.media && typeof ctx.media.canvasTexture === 'function') {
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

      /* الجوال العمودي: شريط قريب من الكاميرا (فضاء الكاميرا) بأربعة صفوف × 3 خلايا؛
         يُبنى فقط على الجوال (لا كلفة على المكتب) ويُحرَّك كل إطار في _placeOnScreen */
      if (ctx.isMobile) {
        try {
          if (ctx.media && typeof ctx.media.canvasTexture === 'function') {
            var RW = 768, RH = 192, ROWH = 48, COLS = 3;
            var rt = ctx.media.canvasTexture(RW, RH, function (c2d, w, hh) {
              try { c2d.clearRect(0, 0, w, hh); } catch (e) {}
              var cw = w / COLS;
              var rows = Math.ceil(SUBJECTS.length / COLS);
              for (var k = 0; k < SUBJECTS.length; k++) {
                var row = Math.floor(k / COLS), colI = k % COLS;
                var inRow = Math.min(COLS, SUBJECTS.length - row * COLS);
                var shift = (COLS - inRow) * cw / 2; /* الصف الأخير (خليتان) يتوسّط */
                var x1 = w - colI * cw - shift, x0 = x1 - cw;
                var y0 = row * ROWH, yc = y0 + ROWH / 2;
                c2d.fillStyle = 'rgba(14,32,51,0.78)';
                roundRect(c2d, x0 + 3, y0 + 3, cw - 6, ROWH - 6, 8); c2d.fill();
                c2d.fillStyle = hex(colors[k]);
                c2d.beginPath(); c2d.arc(x1 - 16, yc, 6, 0, Math.PI * 2); c2d.fill();
                c2d.textBaseline = 'middle';
                c2d.textAlign = 'right';
                c2d.direction = 'rtl';
                var cnt = arNum(SUBJECTS[k].value);
                c2d.font = '500 20px Tajawal, system-ui, sans-serif';
                var cntW = 0;
                try { cntW = c2d.measureText(cnt).width; } catch (e) { cntW = 30; }
                var fs = 30, maxW = cw - 44 - cntW - 8, name = SUBJECTS[k].name, tw = 0;
                for (var tries = 0; tries < 8; tries++) {
                  c2d.font = '700 ' + fs + 'px Tajawal, Changa, system-ui, sans-serif';
                  try { tw = c2d.measureText(name).width; } catch (e) { tw = 0; }
                  if (tw <= maxW || fs <= 18) break;
                  fs -= 2;
                }
                c2d.fillStyle = '#F0D99A';
                c2d.fillText(name, x1 - 30, yc);
                c2d.fillStyle = 'rgba(248,245,239,0.72)';
                c2d.font = '500 20px Tajawal, system-ui, sans-serif';
                c2d.textAlign = 'left';
                c2d.fillText(cnt, x0 + 12, yc + 1);
              }
              if (rows < 1) return;
            });
            st._ribbonTex = rt;
            var ribbonMat = new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
            var ribbon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ribbonMat);
            ribbon.name = 'subjectRibbon';
            ribbon.visible = false;
            ribbon.frustumCulled = false;
            ribbon.renderOrder = 6;
            st.group.add(ribbon);
            st._ribbon = ribbon;

          }
        } catch (e) { st._ribbon = null; }
      }

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
      if (st._ribbon) { st._ribbon.visible = false; st._ribbon.material.opacity = 0; }
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
    _wave: function (p, portrait) {
      var st = this;
      if (!st._tiles || !st._orig) return Math.round(TOTAL * ease('out', remap(p, 0.155, 0.62)));
      var WAVE_END = 0.64;
      if (p >= WAVE_END && st._lastP >= WAVE_END) return st._count;
      var arr = st._tiles.instanceMatrix.array, orig = st._orig, starts = (portrait && st._startsP) ? st._startsP : st._starts;
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
        /* على الجوال الأفقي يتزاحم العدّاد مع نص المحطة في الثلث العلوي فنُنزله تحته (في العمودي يحكم css/intro.css: 23svh)؛
           على المكتب يقف أعلى اليمين فوق الجدار الفارغ لا فوق صور الدروس (النص أسفل اليمين) */
        if (st._counterHost) {
          try {
            var hs = st._counterHost.style;
            if (ctx.isMobile) { if (!isPortrait(ctx)) { hs.top = '32vh'; hs.top = '32svh'; } }
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

    /* يحسب محاور الكاميرا مرة لكل إطار (fwd/right/up/camQ) */
    _camAxes: function (cam) {
      var T = this._tmp;
      cam.updateMatrixWorld();
      cam.getWorldDirection(T.fwd);
      T.right.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
      T.up.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
      T.camQ.copy(cam.quaternion);
    },

    /* الأبعاد المرئية عند بُعد dist من الكاميرا: [عرض، ارتفاع] بالمتر */
    _viewSize: function (cam, dist) {
      var fov = (cam && +cam.fov) || 62, asp = (cam && +cam.aspect) || 0.46;
      var hv = 2 * dist * Math.tan(fov * Math.PI / 360);
      return [hv * asp, hv];
    },

    /* يضع لوحاً 1×1 في فضاء الكاميرا وفق كسور الشاشة (sx يمين، sy أعلى) وعرض/ارتفاع كسور المرئي */
    _placeOnScreen: function (mesh, cam, spec) {
      var T = this._tmp;
      var vs = this._viewSize(cam, spec.dist);
      mesh.position.copy(cam.position)
        .addScaledVector(T.fwd, spec.dist)
        .addScaledVector(T.right, spec.sx * vs[0])
        .addScaledVector(T.up, spec.sy * vs[1]);
      mesh.quaternion.copy(T.camQ);
      mesh.scale.set(spec.w * vs[0], spec.h * vs[1], 1);
    },

    _flyHeroes: function (p, ctx, portrait) {
      var st = this, T = st._tmp;
      var cam = ctx.camera;
      if (!T || !cam || !st._heroes.length) return;
      var slots = portrait ? SLOTS_PORTRAIT : (ctx.isMobile ? SLOTS_MOBILE : SLOTS_DESKTOP);
      var arcUp = portrait ? 0.10 : 0.22, arcSide = portrait ? 0.05 : 0.12;
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
        var rightM, upM, sizeM;
        if (portrait) {
          var vs = st._viewSize(cam, sl.dist);
          rightM = sl.sx * vs[0]; upM = sl.sy * vs[1]; sizeM = sl.size * vs[0];
        } else { rightM = sl.right; upM = sl.up; sizeM = sl.size; }
        T.tgt.copy(cam.position)
          .addScaledVector(T.fwd, sl.dist)
          .addScaledVector(T.right, rightM)
          .addScaledVector(T.up, upM);
        var arc = Math.sin(k * Math.PI);
        hr.mesh.position.copy(hr.rest).lerp(T.tgt, k)
          .addScaledVector(T.up, arc * arcUp)
          .addScaledVector(T.right, arc * (i - 1) * arcSide);
        T.yawQ.setFromEuler(T.e.set(0, sl.yaw, 0));
        T.q.copy(T.camQ).multiply(T.yawQ);
        hr.mesh.quaternion.slerpQuaternions(T.wallQ, T.q, ease('inOut', k));
        var s = lerp(hr.size, sizeM, k);
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
      var portrait = isPortrait(ctx);
      var cam = ctx.camera;
      if (st._tmp && cam) st._camAxes(cam);

      /* 0–.15 استلام: العدّاد يدخل على «٠»؛ .15–.65 نهوض: موجة البلاطات تكتمل والعدّاد يعدّ حتى ٧٨٢؛
         .55–.75 ذروة: البلاطات البطلة أمام الكاميرا؛ .75–1 تسليم: تعود والعدّاد يخفت */
      var shown = st._wave(p, portrait);

      var on = p > 0.03 && p < 0.93;
      var alpha = ease('out', remap(p, 0.04, 0.14)) * (1 - ease('in', remap(p, 0.80, 0.90)));
      st._counter(ctx, Math.min(TOTAL, shown), on, alpha);

      var so = ease('out', remap(p, 0.08, 0.32)) * (1 - ease('in', remap(p, 0.80, 0.92)));
      if (st._strip) {
        var stripOn = !portrait && so > 0.003;
        st._strip.visible = stripOn;
        st._strip.material.opacity = stripOn ? so : 0;
      }
      if (st._ribbon) {
        var ribOn = portrait && st._tmp && cam && so > 0.003;
        st._ribbon.visible = ribOn;
        st._ribbon.material.opacity = ribOn ? so : 0;
        if (ribOn) st._placeOnScreen(st._ribbon, cam, RIBBON_P);
      }

      st._flyHeroes(p, ctx, portrait);
      st._lastP = p;
    }
  });
})();
