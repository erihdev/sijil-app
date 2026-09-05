/* سجل المتابعة الرقمي — الجولة السينمائية: المحطة 3 «السبورة والعجلة»
   السبورة تصير شاشة (طباشير يرسم دائرة ← ملصق live-wheel-spun بفتح دائري)، قرص عجلة الأسماء يخرج من السبورة
   ويدور بسرعة تتناسب مع التمرير ثم يستقر على اسم مع وميض ذهبي، وسبع بطاقات ألعاب تدور في مدار حوله. */
(function () {
  'use strict';
  var NS = window.SIJIL_INTRO = window.SIJIL_INTRO || {};
  if (typeof NS.registerStation !== 'function') return;

  var HALF = Math.PI / 2, TAU = Math.PI * 2;
  var BOARD_POS = [-11.9, 2.2, -36];
  var BOARD_HEX = '#0F2B1F';
  var COLORS = { night: '#071322', navy: '#0E2033', gold: '#D7A93F', paleGold: '#F0D99A', cream: '#F8F5EF' };
  var SECTORS = 12;
  /* أسماء وهمية قصيرة (لا اسم طالب حقيقي) */
  var NAMES = ['سلطان', 'يزيد', 'مالك', 'عمّار', 'تركي', 'راكان', 'وليد', 'باسل', 'نايف', 'قصي', 'حمزة', 'زياد'];
  var WINNER = 5;
  var GAMES = [
    ['🎯', 'خمّن'], ['🧠', 'الذاكرة'], ['🧩', 'لغز'], ['🔢', 'ترتيب'],
    ['👥', 'فرق'], ['🔗', 'توصيل'], ['🪜', 'سلّم']
  ];
  var CARD_COLS = 4, CARD_ROWS = 2;
  /* زاوية الاستقرار: 3 دورات كاملة + ما يضع قطاع الفائز تحت المؤشر العلوي */
  var SPIN_TOTAL = 3 * TAU + (WINNER + 0.5) * (TAU / SECTORS);

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function lerp(a, b, t) { return (typeof NS.lerp === 'function') ? NS.lerp(a, b, t) : a + (b - a) * t; }
  function ease(n, x) { return (typeof NS.ease === 'function') ? NS.ease(n, x) : clamp(x, 0, 1); }
  function smooth(a, b, x) { var t = clamp((x - a) / ((b - a) || 1), 0, 1); return t * t * (3 - 2 * t); }
  function nowSec() { return (window.performance && performance.now ? performance.now() : Date.now()) / 1000; }

  /* دمج هندسات مفهرسة/غير مفهرسة في هندسة واحدة (رسمة واحدة) */
  function mergeGeos(THREE, list) {
    var vCount = 0, iCount = 0, i, g, k;
    for (i = 0; i < list.length; i++) {
      g = list[i];
      if (!g.attributes.normal) g.computeVertexNormals();
      vCount += g.attributes.position.count;
      iCount += g.index ? g.index.count : g.attributes.position.count;
    }
    var pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
    var idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
    var vo = 0, io = 0;
    for (i = 0; i < list.length; i++) {
      g = list[i];
      var n = g.attributes.position.count;
      pos.set(g.attributes.position.array, vo * 3);
      nor.set(g.attributes.normal.array, vo * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
      if (g.index) { var ia = g.index.array; for (k = 0; k < ia.length; k++) idx[io + k] = ia[k] + vo; io += ia.length; }
      else { for (k = 0; k < n; k++) idx[io + k] = vo + k; io += n; }
      vo += n;
      g.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  /* شادر البطاقات: نسخ متعددة تتقاسم أطلساً واحداً مع إزاحة UV وشفافية لكل نسخة */
  var CARD_VERT = [
    'attribute vec4 aCell;',
    'attribute float aFade;',
    'varying vec2 vUv;',
    'varying float vFade;',
    'void main(){',
    '  vUv = vec2(aCell.x + uv.x * aCell.z, aCell.y + uv.y * aCell.w);',
    '  vFade = aFade;',
    '  vec4 wp = vec4(position, 1.0);',
    '  #ifdef USE_INSTANCING',
    '  wp = instanceMatrix * wp;',
    '  #endif',
    '  gl_Position = projectionMatrix * modelViewMatrix * wp;',
    '}'
  ].join('\n');
  var CARD_FRAG = [
    'precision highp float;',
    'uniform sampler2D uMap;',
    'varying vec2 vUv;',
    'varying float vFade;',
    'void main(){',
    '  vec4 c = texture2D(uMap, vUv);',
    '  float a = c.a * vFade;',
    '  if (a < 0.02) discard;',
    '  gl_FragColor = vec4(c.rgb, a);',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  var station = {
    id: 's3',
    index: 2,
    weight: 1.15,
    text: {
      headline: 'حصة حيّة لا ينام فيها أحد',
      copy: 'عجلة الأسماء، مسابقة، مؤقت، قصة مصوّرة، و٧ ألعاب. من يُجب يختار من بعده.'
    },
    /* ثبات على السبورة حتى تختفي العجلة (.86) ثم نقطة تسليم عند فتحة الفصل تنظر نحو جدار الدروس (لا جدار أصم) */
    cam: [
      { t: 0.0, pos: [-6.5, 1.9, -36], look: [-11.9, 2.2, -36] },
      { t: 0.86, pos: [-6.8, 1.92, -36], look: [-11.9, 2.2, -36] },
      { t: 1.0, pos: [-4.6, 1.9, -38], look: [2, 2.1, -46] }
    ],
    posterTitle: 'حصة حيّة لا ينام فيها أحد',

    /* حالة داخلية */
    _THREE: null,
    _mobile: false,
    _quality: 'high',
    _scr: null,
    _mode: '',
    _wheel: null,
    _disk: null,
    _body: null,
    _face: null,
    _faceMat: null,
    _goldMesh: null,
    _goldMat: null,
    _cards: null,
    _cardMat: null,
    _cardFade: null,
    _flash: null,
    _halo: null,
    _label: null,
    _labelMat: null,
    _tex: null,
    _restX: -10.9,
    _wheelZ: -35.3,
    _wheelScale: 1,
    _cardScale: 1,
    _orbitR: 1.6,
    _spinExtra: 0,
    _lastTime: -1,
    _p: 0,
    _tmp: null,

    /* ───────── البناء ───────── */
    build: function (ctx) {
      var THREE = (ctx && ctx.THREE) || window.THREE;
      if (!THREE || !this.group) return;
      var self = this;
      this._THREE = THREE;
      this._mobile = !!(ctx && ctx.isMobile);
      this._quality = (ctx && ctx.quality) || 'high';
      /* المكتب: العجلة تزاح يساراً (نحو +z) بعيداً عن نص المحطة الذي يشغل يمين الشاشة؛ الجوال: في الوسط وأصغر */
      this._restX = this._mobile ? -11.0 : -10.9;
      this._wheelZ = this._mobile ? BOARD_POS[2] : BOARD_POS[2] + 0.7;
      this._wheelScale = this._mobile ? 0.78 : 0.9;
      this._cardScale = this._mobile ? 0.72 : 1;
      /* مدار أضيق حتى لا تُقطع البطاقات عند حافة الكادر */
      this._orbitR = this._mobile ? 0.8 : 1.05;
      this._tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), s: new THREE.Vector3() };
      var media = (ctx && ctx.media) || NS.media;

      /* الشاشة مكان السبورة */
      try {
        if (media && typeof media.screen === 'function') {
          /* الملصق يُطلب في load() لا هنا (القسم 4) */
          this._scr = media.screen({
            width: 4, height: 2.25,
            poster: null, video: null,
            fit: 'contain', frame: 'none',
            open: 1, openFromProgress: false,
            base: BOARD_HEX,
            name: 's3-board',
            procedural: function (c, w, h, time, p) { self._drawChalk(c, w, h, time, p); }
          });
          var sm = this._scr.mesh;
          sm.position.set(BOARD_POS[0] + 0.012, BOARD_POS[1], BOARD_POS[2]);
          sm.rotation.y = HALF;
          sm.name = 's3-board';
          this.group.add(sm);
          this._scr.setMode('procedural');
          this._mode = 'procedural';
        }
      } catch (e) { this._scr = null; }

      /* مجموعة العجلة: +z المحلي نحو الكاميرا (+x عالمي)، +x المحلي يمين الشاشة */
      try {
        var wheel = new THREE.Group();
        wheel.name = 's3-wheel';
        wheel.position.set(-11.8, this._mobile ? BOARD_POS[1] : BOARD_POS[1] - 0.15, this._wheelZ);
        wheel.rotation.y = HALF;
        wheel.visible = false;
        this.group.add(wheel);
        this._wheel = wheel;

        var disk = new THREE.Group();
        disk.name = 's3-disk';
        wheel.add(disk);
        this._disk = disk;

        this._goldMat = this._makeGold(THREE, this._mobile || this._quality === 'light');

        var bodyG = new THREE.CylinderGeometry(1.1, 1.1, 0.08, 12);
        bodyG.rotateX(HALF);
        var body = new THREE.Mesh(bodyG, this._goldMat);
        body.name = 's3-wheel-body';
        disk.add(body);
        this._body = body;

        this._faceMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
        var face = new THREE.Mesh(new THREE.CircleGeometry(1.08, 48), this._faceMat);
        face.position.z = 0.041;
        face.name = 's3-wheel-face';
        disk.add(face);
        this._face = face;

        /* الحافة + المؤشر + المحور: هندسة ذهبية واحدة ثابتة */
        var parts = [];
        parts.push(new THREE.TorusGeometry(1.14, 0.06, 8, 48));
        var cone = new THREE.ConeGeometry(0.09, 0.26, 8);
        cone.rotateZ(Math.PI);
        cone.translate(0, 1.22, 0.05);
        parts.push(cone);
        var hub = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12);
        hub.rotateX(HALF);
        hub.translate(0, 0, 0.07);
        parts.push(hub);
        var gold = new THREE.Mesh(mergeGeos(THREE, parts), this._goldMat);
        gold.name = 's3-wheel-gold';
        wheel.add(gold);
        this._goldMesh = gold;

        /* الوميض الذهبي على قطاع الفائز + الهالة خلف العجلة */
        var glowGeo = new THREE.PlaneGeometry(1, 1);
        var flashMat = new THREE.MeshBasicMaterial({ color: 0xF0D99A, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
        var flash = new THREE.Mesh(glowGeo, flashMat);
        flash.position.set(0, 0.78, 0.06);
        flash.scale.set(0.75, 0.75, 1);
        flash.visible = false;
        flash.name = 's3-flash';
        wheel.add(flash);
        this._flash = flash;

        var haloMat = new THREE.MeshBasicMaterial({ color: 0xD7A93F, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
        var halo = new THREE.Mesh(glowGeo, haloMat);
        halo.position.set(0, 0, -0.25);
        halo.scale.set(4.4, 4.4, 1);
        halo.visible = false;
        halo.name = 's3-halo';
        wheel.add(halo);
        this._halo = halo;

        /* شريحة «دورك» فوق المؤشر */
        this._labelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, fog: false });
        var label = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.375), this._labelMat);
        label.position.set(0, 1.5, 0.16);
        label.visible = false;
        label.name = 's3-label';
        wheel.add(label);
        this._label = label;

        /* بطاقات الألعاب السبع: InstancedMesh واحد */
        var cardGeo = new THREE.PlaneGeometry(0.5, 0.7);
        var cells = new Float32Array(GAMES.length * 4);
        var fades = new Float32Array(GAMES.length);
        for (var j = 0; j < GAMES.length; j++) {
          var col = j % CARD_COLS, row = Math.floor(j / CARD_COLS);
          cells[j * 4] = col / CARD_COLS;
          cells[j * 4 + 1] = 1 - (row + 1) / CARD_ROWS;
          cells[j * 4 + 2] = 1 / CARD_COLS;
          cells[j * 4 + 3] = 1 / CARD_ROWS;
          fades[j] = 0;
        }
        cardGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 4));
        var fadeAttr = new THREE.InstancedBufferAttribute(fades, 1);
        if (fadeAttr.setUsage && THREE.DynamicDrawUsage) fadeAttr.setUsage(THREE.DynamicDrawUsage);
        cardGeo.setAttribute('aFade', fadeAttr);
        this._cardFade = fadeAttr;
        var placeholder = (media && typeof media.texture === 'function') ? media.texture('') : null;
        this._cardMat = new THREE.ShaderMaterial({
          uniforms: { uMap: { value: placeholder } },
          vertexShader: CARD_VERT, fragmentShader: CARD_FRAG,
          transparent: true, depthWrite: true, side: THREE.DoubleSide, toneMapped: false
        });
        var cards = new THREE.InstancedMesh(cardGeo, this._cardMat, GAMES.length);
        cards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        cards.frustumCulled = false;
        cards.visible = false;
        cards.name = 's3-cards';
        for (var k = 0; k < GAMES.length; k++) { this._tmp.m.makeScale(0.001, 0.001, 0.001); cards.setMatrixAt(k, this._tmp.m); }
        wheel.add(cards);
        this._cards = cards;
      } catch (e) { this._wheel = null; }
    },

    _makeGold: function (THREE, lambert) {
      var p = { color: 0xD7A93F, emissive: 0xD7A93F, emissiveIntensity: 0.28 };
      var m;
      try {
        if (lambert) m = new THREE.MeshLambertMaterial(p);
        else { p.roughness = 0.42; p.metalness = 0.35; m = new THREE.MeshStandardMaterial(p); }
      } catch (e) { m = new THREE.MeshBasicMaterial({ color: 0xD7A93F }); }
      m.name = 's3-gold';
      return m;
    },

    /* ───────── النسيج (ثقيل: يُنشأ عند الاقتراب ويُحرَّر عند الابتعاد) ───────── */
    load: function (ctx) {
      var media = (ctx && ctx.media) || NS.media;
      var self = this;
      var world = (ctx && ctx.world) || NS.world;
      try {
        if (world && world.classroom && world.classroom.board && this._scr) world.classroom.board.visible = false;
      } catch (e) {}
      /* الملصق وأطلس الدروس (للمحطة التالية) يُطلبان هنا عند الاقتراب */
      try { if (this._scr && typeof this._scr.setPoster === 'function') this._scr.setPoster('live-wheel-spun'); } catch (e) {}
      try { if (world && world.lessonsWall && typeof world.lessonsWall.ensureAtlas === 'function') world.lessonsWall.ensureAtlas(); } catch (e) {}
      if (this._scr) { try { this._scr.enter(); } catch (e) {} }
      if (this._tex || !media || typeof media.canvasTexture !== 'function') return;
      var tex = {};
      try {
        tex.face = media.canvasTexture(512, 512, function (c, w, h) { self._drawFace(c, w, h); });
        if (this._faceMat) { this._faceMat.map = tex.face.texture; this._faceMat.needsUpdate = true; }
      } catch (e) { tex.face = null; }
      try {
        tex.cards = media.canvasTexture(1024, 720, function (c, w, h) { self._drawCards(c, w, h); });
        if (this._cardMat) this._cardMat.uniforms.uMap.value = tex.cards.texture;
      } catch (e) { tex.cards = null; }
      try {
        tex.label = media.canvasTexture(256, 96, function (c, w, h) { self._drawLabel(c, w, h); });
        if (this._labelMat) { this._labelMat.map = tex.label.texture; this._labelMat.needsUpdate = true; }
      } catch (e) { tex.label = null; }
      try {
        tex.glow = media.canvasTexture(128, 128, function (c, w, h) { self._drawGlow(c, w, h); });
        if (this._flash) { this._flash.material.map = tex.glow.texture; this._flash.material.needsUpdate = true; }
        if (this._halo) { this._halo.material.map = tex.glow.texture; this._halo.material.needsUpdate = true; }
      } catch (e) { tex.glow = null; }
      this._tex = tex;
    },

    unload: function (ctx) {
      try {
        var world = (ctx && ctx.world) || NS.world;
        if (world && world.classroom && world.classroom.board) world.classroom.board.visible = true;
      } catch (e) {}
      if (this._scr) { try { this._scr.leave(); } catch (e) {} }
      try { var md = (ctx && ctx.media) || NS.media; if (md && typeof md.release === 'function') md.release('live-wheel-spun'); } catch (e) {}
      var tex = this._tex;
      this._tex = null;
      if (!tex) return;
      try { if (this._faceMat) { this._faceMat.map = null; this._faceMat.needsUpdate = true; } } catch (e) {}
      try { if (this._labelMat) { this._labelMat.map = null; this._labelMat.needsUpdate = true; } } catch (e) {}
      try { if (this._flash) { this._flash.material.map = null; this._flash.material.needsUpdate = true; } } catch (e) {}
      try { if (this._halo) { this._halo.material.map = null; this._halo.material.needsUpdate = true; } } catch (e) {}
      try {
        var media = (ctx && ctx.media) || NS.media;
        if (this._cardMat) this._cardMat.uniforms.uMap.value = (media && typeof media.texture === 'function') ? media.texture('') : null;
      } catch (e) {}
      for (var k in tex) { try { if (tex[k] && typeof tex[k].dispose === 'function') tex[k].dispose(); } catch (e) {} }
    },

    setQuality: function (q, ctx) {
      this._quality = q || 'high';
      var THREE = this._THREE;
      if (!THREE || !this._goldMat) return;
      try {
        var wantLambert = this._mobile || q === 'light';
        var isLambert = this._goldMat.isMeshLambertMaterial === true;
        if (wantLambert !== isLambert) {
          var nm = this._makeGold(THREE, wantLambert);
          if (this._body) this._body.material = nm;
          if (this._goldMesh) this._goldMesh.material = nm;
          this._goldMat.dispose();
          this._goldMat = nm;
        }
      } catch (e) {}
    },

    /* ───────── الحركة (p محلي 0..1) ───────── */
    update: function (p, ctx) {
      p = clamp(+p || 0, 0, 1);
      this._p = p;
      var time = (ctx && typeof ctx.time === 'number') ? ctx.time : nowSec();
      var dt = this._lastTime < 0 ? 0 : clamp(time - this._lastTime, 0, 0.1);
      this._lastTime = time;
      var vel = (ctx && typeof ctx.velocity === 'number') ? ctx.velocity : 0;

      /* الشاشة: طباشير (0–.15) ← ملصق بفتح دائري (.15–.82) ← إغلاق (.82–.88) ← طباشير يُطبع (.88–1) */
      var scr = this._scr;
      if (scr) {
        try {
          scr.setProgress(p);
          var mode, open;
          if (p < 0.15) { mode = 'procedural'; open = 1; }
          else if (p < 0.82) { mode = 'poster'; open = ease('out', (p - 0.15) / 0.17); }
          else if (p < 0.88) { mode = 'poster'; open = 1 - ease('in', (p - 0.82) / 0.06); }
          else { mode = 'procedural'; open = 1; }
          if (mode !== this._mode) { this._mode = mode; scr.setMode(mode); if (mode === 'procedural') scr.redraw(time); }
          scr.setOpen(open);
        } catch (e) {}
      }

      var wheel = this._wheel;
      if (!wheel) return;

      /* خروج العجلة من السبورة ثم عودتها إليها */
      var emerge = ease('back', clamp((p - 0.15) / 0.22, 0, 1));
      var slide = ease('out', clamp((p - 0.15) / 0.25, 0, 1));
      /* الخروج بالانكماش إلى السبورة قبل أن تستدير الكاميرا (.72–.88) */
      var leave = ease('in', clamp((p - 0.72) / 0.16, 0, 1));
      var sc = this._wheelScale * emerge * (1 - leave);
      var wx = lerp(lerp(-11.8, this._restX, slide), -11.82, leave);
      wheel.position.x = wx;
      wheel.scale.set(Math.max(sc, 0.0001), Math.max(sc, 0.0001), Math.max(sc, 0.0001));
      wheel.visible = sc > 0.002;
      if (!wheel.visible) { this._spinExtra *= Math.exp(-2.2 * dt); return; }

      /* الدوران: أساس بطيء التوقف مع التمرير + دفعة تتناسب مع السرعة تتلاشى قبل الاستقرار */
      var settle = smooth(0.5, 0.56, p);
      if (p < 0.5) this._spinExtra += vel * dt * 5;
      this._spinExtra *= Math.exp(-2.2 * dt);
      var base = ease('out', clamp((p - 0.15) / 0.4, 0, 1)) * SPIN_TOTAL;
      this._disk.rotation.z = base + this._spinExtra * (1 - settle);

      /* الوميض الذهبي على الاسم الفائز + الهالة + شريحة «دورك» */
      var flashK = smooth(0.53, 0.58, p) * (1 - smooth(0.74, 0.8, p));
      var pulse = 0.68 + 0.32 * Math.sin(time * 5.5);
      this._flash.material.opacity = flashK * pulse;
      this._flash.visible = flashK > 0.002;
      var haloK = smooth(0.2, 0.45, p) * (1 - smooth(0.78, 0.9, p)) * 0.3 + flashK * 0.25 * pulse;
      this._halo.material.opacity = haloK;
      this._halo.visible = haloK > 0.002 && this._quality !== 'light';
      var labelIn = ease('back', smooth(0.55, 0.62, p));
      var labelOut = ease('in', smooth(0.74, 0.8, p));
      var ls = labelIn * (1 - labelOut);
      this._label.scale.set(Math.max(ls, 0.0001), Math.max(ls, 0.0001), 1);
      this._label.visible = ls > 0.002;

      /* مدار البطاقات: تظهر تباعاً، تدور حول العجلة، ثم تنكمش إليها */
      var cards = this._cards, T = this._tmp, R = this._orbitR;
      var any = false, fades = this._cardFade;
      var orbit = HALF + (p - 0.33) * TAU * 1.1;
      for (var j = 0; j < GAMES.length; j++) {
        var aIn = ease('back', smooth(0.33 + j * 0.025, 0.42 + j * 0.025, p));
        var aOut = ease('in', smooth(0.7 + j * 0.012, 0.8 + j * 0.012, p));
        var s = this._cardScale * aIn * (1 - aOut);
        var fade = clamp(smooth(0.33 + j * 0.025, 0.4 + j * 0.025, p) * (1 - aOut), 0, 1);
        var a = orbit + j * TAU / GAMES.length;
        var r = R * (1 - aOut * 0.85);
        var ca = Math.cos(a), sa = Math.sin(a);
        T.v.set(r * ca, 0.55 * r * sa, 0.9 * sa * (r / R));
        T.e.set(-sa * 0.12, ca * 0.18, 0);
        T.q.setFromEuler(T.e);
        T.s.set(Math.max(s, 0.0001), Math.max(s, 0.0001), 1);
        T.m.compose(T.v, T.q, T.s);
        cards.setMatrixAt(j, T.m);
        if (fades) fades.setX(j, fade);
        if (s > 0.002) any = true;
      }
      cards.instanceMatrix.needsUpdate = true;
      if (fades) fades.needsUpdate = true;
      cards.visible = any;
    },

    /* ───────── الرسم على canvas ───────── */
    _darkHex: function () {
      try { return '#' + new this._THREE.Color(BOARD_HEX).multiplyScalar(0.55).getHexString(); } catch (e) { return '#091E15'; }
    },

    /* السبورة الإجرائية: طباشير يرسم عجلة (استلام) أو يطبعها (تسليم)، والخلفية تعتم لتطابق الشاشة المغلقة */
    _drawChalk: function (c, w, h, time, p) {
      var intake = p < 0.5;
      var q = intake ? clamp(p / 0.15, 0, 1) : clamp((p - 0.88) / 0.12, 0, 1);
      var dark = intake ? smooth(0.78, 1, q) : 1 - ease('out', q);
      var prog = intake ? clamp(q / 0.8, 0, 1) : 1;
      var alpha = intake ? (1 - smooth(0.8, 1, q)) : ease('out', q);
      c.fillStyle = BOARD_HEX;
      c.fillRect(0, 0, w, h);
      if (dark > 0) { c.globalAlpha = dark; c.fillStyle = this._darkHex(); c.fillRect(0, 0, w, h); c.globalAlpha = 1; }
      if (alpha <= 0.001 || prog <= 0.001) return;
      var cx = w * 0.5, cy = h * 0.5, R = h * 0.36;
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(248,245,239,' + (0.85 * alpha).toFixed(3) + ')';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(cx, cy, R, -HALF, -HALF + TAU * clamp(prog / 0.55, 0, 1));
      c.stroke();
      c.strokeStyle = 'rgba(248,245,239,' + (0.28 * alpha).toFixed(3) + ')';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(cx, cy, R + 1.5, -HALF, -HALF + TAU * clamp(prog / 0.55, 0, 1));
      c.stroke();
      c.strokeStyle = 'rgba(248,245,239,' + (0.7 * alpha).toFixed(3) + ')';
      c.lineWidth = 2;
      for (var i = 0; i < SECTORS; i++) {
        var k = clamp((prog - 0.5 - i * 0.03) / 0.08, 0, 1);
        if (k <= 0) break;
        var ang = -HALF + i * TAU / SECTORS;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + Math.cos(ang) * R * k, cy + Math.sin(ang) * R * k);
        c.stroke();
      }
      var tk = smooth(0.86, 1, prog);
      if (tk > 0) {
        c.fillStyle = 'rgba(240,217,154,' + (0.9 * alpha * tk).toFixed(3) + ')';
        c.beginPath();
        c.moveTo(cx - 9, cy - R - 16); c.lineTo(cx + 9, cy - R - 16); c.lineTo(cx, cy - R + 2); c.closePath();
        c.fill();
        c.font = '700 26px Tajawal, Changa, sans-serif';
        c.textAlign = 'center';
        c.fillStyle = 'rgba(248,245,239,' + (0.9 * alpha * tk).toFixed(3) + ')';
        c.fillText('عجلة الأسماء', cx, cy + R + 26);
      }
    },

    /* وجه العجلة: 12 قطاعاً كحلي/ذهبي/كريمي بأسماء وهمية */
    _drawFace: function (c, w, h) {
      var cx = w / 2, cy = h / 2, R = w * 0.485;
      var fills = [COLORS.navy, COLORS.gold, COLORS.cream];
      var inks = [COLORS.paleGold, COLORS.navy, COLORS.navy];
      c.clearRect(0, 0, w, h);
      for (var i = 0; i < SECTORS; i++) {
        var a0 = -HALF + i * TAU / SECTORS, a1 = a0 + TAU / SECTORS;
        c.beginPath();
        c.moveTo(cx, cy);
        c.arc(cx, cy, R, a0, a1);
        c.closePath();
        c.fillStyle = fills[i % 3];
        c.fill();
        c.strokeStyle = 'rgba(215,169,63,0.85)';
        c.lineWidth = 2;
        c.stroke();
      }
      c.font = '700 34px Tajawal, Changa, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (var k = 0; k < SECTORS; k++) {
        var mid = -HALF + (k + 0.5) * TAU / SECTORS;
        c.save();
        c.translate(cx, cy);
        if (Math.cos(mid) < 0) { c.rotate(mid + Math.PI); c.fillStyle = inks[k % 3]; c.fillText(NAMES[k], -R * 0.64, 0); }
        else { c.rotate(mid); c.fillStyle = inks[k % 3]; c.fillText(NAMES[k], R * 0.64, 0); }
        c.restore();
      }
      c.beginPath();
      c.arc(cx, cy, R * 0.16, 0, TAU);
      c.fillStyle = COLORS.gold;
      c.fill();
      c.strokeStyle = COLORS.navy;
      c.lineWidth = 4;
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, R, 0, TAU);
      c.strokeStyle = COLORS.gold;
      c.lineWidth = 8;
      c.stroke();
    },

    /* أطلس البطاقات السبع: بطاقة كريمية بإطار كحلي، إيموجي واسم اللعبة */
    _drawCards: function (c, w, h) {
      var cw = w / CARD_COLS, ch = h / CARD_ROWS;
      c.clearRect(0, 0, w, h);
      for (var j = 0; j < GAMES.length; j++) {
        var x0 = (j % CARD_COLS) * cw, y0 = Math.floor(j / CARD_COLS) * ch;
        var pad = 10, rr = 26;
        var x = x0 + pad, y = y0 + pad, bw = cw - pad * 2, bh = ch - pad * 2;
        c.beginPath();
        c.moveTo(x + rr, y);
        c.arcTo(x + bw, y, x + bw, y + bh, rr);
        c.arcTo(x + bw, y + bh, x, y + bh, rr);
        c.arcTo(x, y + bh, x, y, rr);
        c.arcTo(x, y, x + bw, y, rr);
        c.closePath();
        c.fillStyle = COLORS.cream;
        c.fill();
        c.lineWidth = 8;
        c.strokeStyle = COLORS.navy;
        c.stroke();
        c.lineWidth = 3;
        c.strokeStyle = COLORS.gold;
        c.beginPath();
        c.moveTo(x + 22, y + bh * 0.66); c.lineTo(x + bw - 22, y + bh * 0.66);
        c.stroke();
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = COLORS.navy;
        c.font = '112px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
        c.fillText(GAMES[j][0], x0 + cw / 2, y0 + ch * 0.4);
        c.font = '700 44px Changa, Tajawal, sans-serif';
        c.fillText(GAMES[j][1], x0 + cw / 2, y0 + ch * 0.82);
      }
    },

    _drawLabel: function (c, w, h) {
      c.clearRect(0, 0, w, h);
      var rr = h / 2 - 4;
      c.beginPath();
      c.moveTo(4 + rr, 4);
      c.arcTo(w - 4, 4, w - 4, h - 4, rr);
      c.arcTo(w - 4, h - 4, 4, h - 4, rr);
      c.arcTo(4, h - 4, 4, 4, rr);
      c.arcTo(4, 4, w - 4, 4, rr);
      c.closePath();
      c.fillStyle = COLORS.navy;
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = COLORS.gold;
      c.stroke();
      c.font = '800 40px Changa, Tajawal, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = COLORS.paleGold;
      c.fillText('دورك يا ' + NAMES[WINNER], w / 2, h / 2 + 2);
    },

    _drawGlow: function (c, w, h) {
      c.clearRect(0, 0, w, h);
      var g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
  };

  try { NS.registerStation(station); } catch (e) {}
})();
