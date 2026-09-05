/* سجل المتابعة الرقمي — الجولة السينمائية: المحطة 5 «النافذة وواتساب»
   ورقة عمل تُطوى إلى طائرات ورقية تخرج من النافذة وتعود علامات ✓ ذهبية تستقر على فقاعة واتساب
   مع أعمدة تحليل الأخطاء. الإيقاع: 0–.15 استلام، .15–.55 نهوض، .55–.75 ذروة، .75–1 تسليم. */
(function () {
  'use strict';
  var NS = window.SIJIL_INTRO;
  if (!NS || typeof NS.registerStation !== 'function') return;

  var PI = Math.PI, HALF = Math.PI / 2;
  var C = {
    navy: '#0E2033', night: '#071322', gold: '#D7A93F', paleGold: '#F0D99A', cream: '#F8F5EF',
    wa: '#25D366', green: '#3FB47A', red: '#D64545', ink: '#2B3A4E', muted: '#5A6B80'
  };
  var HEADLINE = 'ورقة عمل تصل عبر واتساب';
  var AR = ['١', '٢', '٣', '٤', '٥'];
  var QUESTIONS = [
    { q: 'أي الأجهزة يُعدّ جهاز إدخال؟', o: ['لوحة المفاتيح', 'الشاشة', 'الطابعة'], a: 0 },
    { q: 'ما امتداد ملف الصورة؟', o: ['.png', '.docx', '.mp3'], a: 0 },
    { q: 'اختصار النسخ في الحاسب:', o: ['Ctrl+C', 'Ctrl+V', 'Ctrl+Z'], a: 0 },
    { q: 'وحدة قياس سعة التخزين:', o: ['جيجابايت', 'متر', 'كيلوجرام'], a: 0 },
    { q: 'كلمة المرور القوية تكون:', o: ['٨ رموز فأكثر', 'اسمك', '١٢٣٤'], a: 0 }
  ];
  var PLANES = 6, CHECKS = 6;
  var BAR_H = [0.10, 0.06, 0.19, 0.08];
  var BAR_RED = 2;

  function ease(n, x) { return NS.ease(n, x); }
  function lerp(a, b, t) { return NS.lerp(a, b, t); }
  function clamp(x, a, b) { return NS.clamp(x, a, b); }
  function span(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function seeded(seed) {
    var s = seed >>> 0 || 1;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  var S = { p: 0, mats: [], built: false };

  /* ───────────── رسومات canvas ───────────── */
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  /* ورقة العمل 512×704 */
  function drawSheet(c, w, h) {
    c.fillStyle = '#FBF8F1';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(14,32,51,0.06)';
    c.lineWidth = 1;
    for (var ly = 120; ly < h - 20; ly += 36) { c.beginPath(); c.moveTo(24, ly); c.lineTo(w - 24, ly); c.stroke(); }
    c.fillStyle = C.navy;
    c.fillRect(0, 0, w, 86);
    c.fillStyle = C.gold;
    c.fillRect(0, 86, w, 4);
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.fillStyle = C.paleGold;
    c.font = '800 30px Changa, Tajawal, sans-serif';
    c.fillText('ورقة عمل — المهارات الرقمية', w - 26, 34);
    c.fillStyle = 'rgba(248,245,239,0.8)';
    c.font = '500 19px Tajawal, sans-serif';
    c.fillText('الوحدة الثالثة · الصف الخامس · ٥ أسئلة', w - 26, 64);
    c.fillStyle = C.gold;
    c.beginPath(); c.arc(38, 43, 18, 0, PI * 2); c.fill();
    c.fillStyle = C.navy;
    c.font = '800 20px Changa, Tajawal, sans-serif';
    c.textAlign = 'center';
    c.fillText('٥', 38, 44);
    var y = 124;
    for (var i = 0; i < QUESTIONS.length; i++) {
      var q = QUESTIONS[i];
      c.textAlign = 'right';
      c.fillStyle = C.navy;
      c.font = '700 24px Tajawal, sans-serif';
      c.fillText(AR[i] + '. ' + q.q, w - 30, y);
      var x = w - 40;
      c.font = '500 21px Tajawal, sans-serif';
      for (var k = 0; k < q.o.length; k++) {
        var tw = c.measureText(q.o[k]).width;
        c.beginPath(); c.arc(x - 9, y + 38, 8, 0, PI * 2);
        c.strokeStyle = C.navy; c.lineWidth = 2; c.stroke();
        if (k === q.a) { c.fillStyle = C.gold; c.fill(); }
        c.fillStyle = C.ink;
        c.fillText(q.o[k], x - 24, y + 38);
        x -= tw + 56;
      }
      y += 108;
    }
    c.fillStyle = C.muted;
    c.font = '500 18px Tajawal, sans-serif';
    c.textAlign = 'right';
    c.fillText('الدرجة: ــــ / ٥', w - 30, h - 34);
    c.textAlign = 'left';
    c.fillText('تُرسل عبر واتساب', 30, h - 34);
  }

  /* قناع الفقاعة 704×512 (أبيض على أسود) */
  function bubblePath(c, w, h) {
    roundRect(c, 16, 16, w - 32, h - 40, 42);
    c.moveTo(w - 30, 20); c.lineTo(w - 6, 6); c.lineTo(w - 12, 44); c.closePath();
  }
  function drawBubbleMask(c, w, h) {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; bubblePath(c, w, h); c.fill();
  }

  /* فقاعة واتساب 704×512 */
  function drawBubble(c, w, h) {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#FDFCF8';
    bubblePath(c, w, h); c.fill();
    c.lineWidth = 8; c.strokeStyle = C.wa;
    roundRect(c, 16, 16, w - 32, h - 40, 42); c.stroke();
    c.fillStyle = C.wa;
    c.beginPath(); c.moveTo(w - 30, 20); c.lineTo(w - 6, 6); c.lineTo(w - 12, 44); c.closePath(); c.fill();
    /* الرأس */
    c.fillStyle = C.wa;
    c.beginPath(); c.arc(w - 64, 70, 26, 0, PI * 2); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(w - 64, 70, 13, 0, PI * 2); c.fill();
    c.beginPath(); c.moveTo(w - 76, 78); c.lineTo(w - 82, 88); c.lineTo(w - 68, 82); c.closePath(); c.fill();
    c.fillStyle = C.wa;
    c.beginPath(); c.arc(w - 64, 70, 6, 0, PI * 2); c.fill();
    c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillStyle = C.navy;
    c.font = '700 28px Tajawal, sans-serif';
    c.fillText('واتساب · المهارات الرقمية', w - 104, 60);
    c.fillStyle = C.muted;
    c.font = '500 19px Tajawal, sans-serif';
    c.fillText('الأستاذ · اليوم ٢:١٥ م', w - 104, 90);
    c.strokeStyle = 'rgba(14,32,51,0.12)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(40, 112); c.lineTo(w - 40, 112); c.stroke();
    /* الرسالة */
    c.fillStyle = C.navy;
    c.font = '700 27px Tajawal, sans-serif';
    c.fillText('وصلت ورقة عمل: الوحدة الثالثة', w - 44, 150);
    c.fillStyle = C.ink;
    c.font = '500 23px Tajawal, sans-serif';
    c.fillText('٥ أسئلة اختيار · تُصحَّح آلياً فور الإرسال', w - 44, 190);
    /* مواضع العلامات */
    c.setLineDash([5, 6]);
    c.strokeStyle = 'rgba(215,169,63,0.55)'; c.lineWidth = 2;
    for (var i = 0; i < CHECKS; i++) {
      var cx = w / 2 + (i - (CHECKS - 1) / 2) * 100;
      c.beginPath(); c.arc(cx, 250, 26, 0, PI * 2); c.stroke();
    }
    c.setLineDash([]);
    /* منطقة التحليل */
    c.fillStyle = C.navy;
    c.font = '700 23px Tajawal, sans-serif';
    c.fillText('تحليل الأخطاء بحسب السؤال', w - 44, 306);
    c.fillStyle = C.red;
    c.font = '500 19px Tajawal, sans-serif';
    c.fillText('س٣: هنا يتكرر الخطأ', w - 44, 338);
    c.strokeStyle = 'rgba(14,32,51,0.25)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(96, 420); c.lineTo(400, 420); c.stroke();
    c.fillStyle = C.muted;
    c.font = '500 17px Tajawal, sans-serif';
    c.textAlign = 'center';
    var labels = ['س١', 'س٢', 'س٣', 'س٤'];
    for (var b = 0; b < 4; b++) c.fillText(labels[b], 355 - b * 70, 440);
    /* التذييل: قفل + المحاولة الأولى */
    c.textAlign = 'right';
    c.fillStyle = C.gold;
    roundRect(c, w - 62, 452, 18, 14, 3); c.fill();
    c.lineWidth = 3; c.strokeStyle = C.gold;
    c.beginPath(); c.arc(w - 53, 452, 6, PI, 0); c.stroke();
    c.fillStyle = C.ink;
    c.font = '700 19px Tajawal, sans-serif';
    c.fillText('المحاولة الأولى هي المعتمدة', w - 74, 460);
  }

  /* علامة ✓ ذهبية 128×128 */
  function drawCheck(c, w, h) {
    c.clearRect(0, 0, w, h);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.shadowColor = 'rgba(215,169,63,0.9)'; c.shadowBlur = 16;
    c.strokeStyle = C.gold; c.lineWidth = 16;
    c.beginPath(); c.moveTo(28, 68); c.lineTo(54, 94); c.lineTo(100, 38); c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = C.paleGold; c.lineWidth = 6;
    c.beginPath(); c.moveTo(28, 68); c.lineTo(54, 94); c.lineTo(100, 38); c.stroke();
  }

  /* سماء بعد الظهر خلف النافذة 512×288 (إجرائي، ≤ 12 إطاراً/ثانية) */
  var rnd = seeded(20260905);
  var HOUSES = [], CLOUDS = [], BIRDS = [];
  (function () {
    var x = -10;
    while (x < 540) {
      var w = 22 + rnd() * 50, h = 22 + rnd() * 56;
      var wins = [];
      var nw = Math.floor(rnd() * 3);
      for (var k = 0; k < nw; k++) wins.push([rnd() * 0.7 + 0.1, rnd() * 0.6 + 0.15]);
      HOUSES.push({ x: x, w: w, h: h, wins: wins, tank: rnd() < 0.3, para: rnd() < 0.5 });
      x += w + 4 + rnd() * 18;
    }
    for (var i = 0; i < 5; i++) CLOUDS.push({ x: rnd() * 700, y: 30 + rnd() * 110, s: 0.6 + rnd() * 0.9, v: 5 + rnd() * 6 });
    for (var b = 0; b < 3; b++) BIRDS.push({ x: rnd() * 500, y: 70 + rnd() * 60, v: 14 + rnd() * 8, ph: rnd() * 6 });
  })();

  function cloud(c, x, y, s) {
    c.beginPath();
    c.arc(x, y, 18 * s, 0, PI * 2);
    c.arc(x + 22 * s, y - 10 * s, 22 * s, 0, PI * 2);
    c.arc(x + 48 * s, y - 4 * s, 18 * s, 0, PI * 2);
    c.arc(x + 26 * s, y + 8 * s, 16 * s, 0, PI * 2);
    c.fill();
  }

  function drawSky(c, w, h, time) {
    time = +time || 0;
    var warm = 0.35 + 0.4 * S.p;
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5F97CF');
    g.addColorStop(0.5, '#A6C9E9');
    g.addColorStop(0.8, warm > 0.5 ? '#F3CFA2' : '#EED6B9');
    g.addColorStop(1, '#F4C48C');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    var sx = w * 0.74, sy = h * 0.62;
    var rg = c.createRadialGradient(sx, sy, 0, sx, sy, h * 0.6);
    rg.addColorStop(0, 'rgba(255,240,196,0.95)');
    rg.addColorStop(0.1, 'rgba(255,226,160,0.6)');
    rg.addColorStop(1, 'rgba(255,220,160,0)');
    c.fillStyle = rg; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.86)';
    var i;
    for (i = 0; i < CLOUDS.length; i++) {
      var cl = CLOUDS[i];
      var cx = ((cl.x + time * cl.v) % (w + 260)) - 130;
      cloud(c, cx, cl.y, cl.s);
    }
    c.strokeStyle = 'rgba(30,51,80,0.7)'; c.lineWidth = 1.5;
    for (i = 0; i < BIRDS.length; i++) {
      var bd = BIRDS[i];
      var bx = ((bd.x + time * bd.v) % (w + 60)) - 30;
      var by = bd.y + Math.sin(time * 1.3 + bd.ph) * 4;
      var fl = 3 + Math.sin(time * 9 + bd.ph) * 2.5;
      c.beginPath(); c.moveTo(bx - 6, by - fl * 0.4); c.quadraticCurveTo(bx, by + fl, bx + 6, by - fl * 0.4); c.stroke();
    }
    /* تلال بعيدة */
    c.fillStyle = 'rgba(120,140,175,0.45)';
    c.beginPath(); c.moveTo(0, h * 0.8);
    for (var hx = 0; hx <= w; hx += 32) c.lineTo(hx, h * 0.8 - 14 - Math.sin(hx * 0.021) * 12 - Math.sin(hx * 0.07) * 5);
    c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
    /* البيوت كظلال */
    var base = h * 0.86;
    c.fillStyle = '#1E3350';
    for (i = 0; i < HOUSES.length; i++) {
      var ho = HOUSES[i];
      c.fillRect(ho.x, base - ho.h, ho.w, ho.h);
      if (ho.para) c.fillRect(ho.x - 2, base - ho.h - 4, ho.w + 4, 5);
      if (ho.tank) { c.fillRect(ho.x + ho.w * 0.3, base - ho.h - 12, 10, 12); }
    }
    /* مئذنة */
    c.fillRect(150, base - 96, 8, 96);
    c.beginPath(); c.arc(154, base - 98, 8, PI, 0); c.fill();
    c.fillRect(153, base - 112, 2, 8);
    /* نوافذ مضيئة قليلة */
    c.fillStyle = 'rgba(240,217,154,0.85)';
    for (i = 0; i < HOUSES.length; i++) {
      var hh = HOUSES[i];
      for (var k = 0; k < hh.wins.length; k++) {
        c.fillRect(hh.x + hh.wins[k][0] * hh.w, base - hh.h + hh.wins[k][1] * hh.h, 4, 5);
      }
    }
    c.fillStyle = '#172A44';
    c.fillRect(0, base, w, h - base);
  }

  /* ───────────── البناء ───────────── */
  function makeLit(T, opts) {
    var lam = S.mobile || (S.ctx && S.ctx.quality === 'light');
    function make(useLam) {
      var p = { color: opts.color == null ? 0xffffff : opts.color, side: opts.side || T.FrontSide, vertexColors: !!opts.vertexColors };
      if (opts.emissive != null) { p.emissive = opts.emissive; p.emissiveIntensity = opts.emissiveIntensity == null ? 1 : opts.emissiveIntensity; }
      if (opts.transparent) { p.transparent = true; p.opacity = opts.opacity == null ? 1 : opts.opacity; }
      var m = useLam ? new T.MeshLambertMaterial(p) : new T.MeshStandardMaterial(p);
      if (!useLam) { m.roughness = 0.9; m.metalness = 0; }
      return m;
    }
    var def = { mat: make(lam), make: make, users: [] };
    S.mats.push(def);
    return def;
  }

  function bezier(out, a, b, c, t) {
    var u = 1 - t;
    out.set(
      u * u * a.x + 2 * u * t * b.x + t * t * c.x,
      u * u * a.y + 2 * u * t * b.y + t * t * c.y,
      u * u * a.z + 2 * u * t * b.z + t * t * c.z
    );
    return out;
  }
  function bezierTangent(out, a, b, c, t) {
    out.set(
      2 * (1 - t) * (b.x - a.x) + 2 * t * (c.x - b.x),
      2 * (1 - t) * (b.y - a.y) + 2 * t * (c.y - b.y),
      2 * (1 - t) * (b.z - a.z) + 2 * t * (c.z - b.z)
    );
    return out;
  }

  function build(ctx) {
    var T = ctx.THREE;
    var g = this.group;
    if (!T || !g) return;
    S.ctx = ctx;
    S.T = T;
    S.mobile = !!ctx.isMobile;
    S.media = ctx.media || NS.media || null;
    var V = function (x, y, z) { return new T.Vector3(x, y, z); };
    S.tmpV = V(0, 0, 0); S.tmpV2 = V(0, 0, 0); S.tmpV3 = V(0, 0, 0);
    S.dummy = new T.Object3D();
    S.tmpM = new T.Matrix4();
    S.tmpC = new T.Color();

    var m = S.mobile;
    /* الورقة يسار مركز الكادر (+z) بعيداً عن صندوق نص المحطة على اليمين */
    S.sheet0 = m ? V(-2.25, 2.1, -57.5) : V(-2.35, 1.95, -57.2);
    S.anchor = m ? V(-2.35, 1.40, -57.72) : V(-2.25, 1.50, -57.15);
    S.resultScale = m ? 0.82 : 1;

    /* 1) النافذة → شاشة سماء بعد الظهر */
    try {
      if (S.media && typeof S.media.screen === 'function') {
        S.screen = S.media.screen({
          width: 4, height: 2.6, procedural: drawSky, frame: 'none', clip: 'sd-flight',
          open: 0, openFromProgress: false, base: '#1B3A5C', name: 's5-window'
        });
        S.screen.mesh.position.set(-3.94, 2.0, -58);
        S.screen.mesh.rotation.y = HALF;
        g.add(S.screen.mesh);
        if (ctx.world && ctx.world.window) ctx.world.window.visible = false;
      }
    } catch (e) { S.screen = null; }

    /* 2) ورقة العمل: 3 شرائح بمفاصل */
    try {
      var SW = 0.8, SH = 1.1, h = SH / 3;
      S.sheetMat = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, transparent: true, opacity: 1 });
      /* شفاف وبوجهين: تمريرة واحدة لا اثنتان (r151+) */
      S.sheetMat.forceSinglePass = true;
      S.sheetMat.name = 's5-sheet';
      var strip = function (k) {
        var geo = new T.PlaneGeometry(SW, h, 1, 1);
        var uv = geo.attributes.uv;
        for (var i = 0; i < uv.count; i++) uv.setY(i, 1 - (k + (1 - uv.getY(i))) / 3);
        var mesh = new T.Mesh(geo, S.sheetMat);
        mesh.name = 's5-strip' + k;
        return mesh;
      };
      S.sheet = new T.Group(); S.sheet.name = 's5-sheet';
      var top = strip(0); top.position.y = h;
      S.piv1 = new T.Object3D(); S.piv1.position.y = h / 2;
      var mid = strip(1); mid.position.y = -h / 2; mid.position.z = -0.004;
      S.piv2 = new T.Object3D(); S.piv2.position.y = -h;
      var bot = strip(2); bot.position.y = -h / 2; bot.position.z = 0.004;
      S.piv2.add(bot); S.piv1.add(mid); S.piv1.add(S.piv2);
      S.sheet.add(top); S.sheet.add(S.piv1);
      S.sheet.rotation.y = HALF;
      S.sheet.visible = false;
      g.add(S.sheet);
    } catch (e) { S.sheet = null; }

    /* 3) الطائرات الورقية: InstancedMesh من معينات مطوية */
    try {
      var pg = new T.BufferGeometry();
      var nose = [0, 0, 0.24], L = [-0.17, -0.03, -0.12], R = [0.17, -0.03, -0.12], K = [0, 0.06, -0.16];
      var pos = new Float32Array([].concat(nose, L, K, nose, K, R));
      var gold = [0.91, 0.78, 0.42], cream = [0.97, 0.96, 0.94];
      var col = new Float32Array([].concat(gold, cream, cream, gold, cream, cream));
      pg.setAttribute('position', new T.BufferAttribute(pos, 3));
      pg.setAttribute('color', new T.BufferAttribute(col, 3));
      pg.computeVertexNormals();
      S.planeDef = makeLit(T, { color: 0xffffff, vertexColors: true, side: T.DoubleSide, emissive: 0xF0D99A, emissiveIntensity: 0.12 });
      S.planes = new T.InstancedMesh(pg, S.planeDef.mat, PLANES);
      S.planeDef.users.push(S.planes);
      S.planes.name = 's5-planes';
      S.planes.frustumCulled = false;
      S.planes.visible = false;
      S.planePaths = [];
      for (var i = 0; i < PLANES; i++) {
        var sp = (i - (PLANES - 1) / 2);
        S.planePaths.push({
          a: V(S.sheet0.x - 0.05, S.sheet0.y + 0.1 - 0.05 * i, S.sheet0.z + sp * 0.06),
          b: V(-3.2, S.sheet0.y + 0.55 + (i % 3) * 0.18, -58 + sp * 0.3 + (i % 2 ? 0.25 : -0.2)),
          c: V(-6.6, 2.4 + (i % 3) * 0.28, -58 + sp * 0.55),
          delay: 0.022 * i
        });
        S.dummy.position.copy(S.planePaths[i].a);
        S.dummy.scale.setScalar(0.001);
        S.dummy.updateMatrix();
        S.planes.setMatrixAt(i, S.dummy.matrix);
      }
      S.planes.instanceMatrix.setUsage(T.DynamicDrawUsage);
      g.add(S.planes);
    } catch (e) { S.planes = null; }

    /* 4) النتيجة: الفقاعة + الأعمدة + العلامات */
    try {
      S.result = new T.Group(); S.result.name = 's5-result';
      S.result.position.copy(S.anchor);
      S.result.rotation.y = HALF;
      S.result.visible = false;
      g.add(S.result);

      S.bubbleMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: T.FrontSide });
      S.bubbleMat.name = 's5-bubble';
      S.bubble = new T.Mesh(new T.PlaneGeometry(1.1, 0.8), S.bubbleMat);
      S.bubble.name = 's5-bubble';
      S.result.add(S.bubble);

      var bg = new T.BoxGeometry(0.07, 1, 0.045);
      bg.translate(0, 0.5, 0);
      S.barDef = makeLit(T, { color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.15 });
      S.bars = new T.InstancedMesh(bg, S.barDef.mat, 4);
      S.barDef.users.push(S.bars);
      S.bars.name = 's5-bars';
      S.bars.frustumCulled = false;
      S.bars.instanceMatrix.setUsage(T.DynamicDrawUsage);
      S.barBase = 0.4 - 420 / 640;
      S.barX = [];
      for (var b = 0; b < 4; b++) {
        S.barX.push((355 - b * 70 - 352) / 640);
        S.tmpC.set(b === BAR_RED ? C.red : C.green);
        S.bars.setColorAt(b, S.tmpC);
        S.dummy.position.set(S.barX[b], S.barBase, 0.035);
        S.dummy.scale.set(1, 0.001, 1);
        S.dummy.updateMatrix();
        S.bars.setMatrixAt(b, S.dummy.matrix);
      }
      S.result.add(S.bars);

      S.checkMat = new T.SpriteMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
      S.checkMat.name = 's5-check';
      S.checks = [];
      S.checkPaths = [];
      for (var k = 0; k < CHECKS; k++) {
        var spr = new T.Sprite(S.checkMat);
        spr.name = 's5-check' + k;
        spr.scale.setScalar(0.001);
        spr.visible = false;
        S.result.add(spr);
        S.checks.push(spr);
        /* نقطة الانطلاق على الزجاج (عالمي) → محلي المجموعة (دوران y = 90°) */
        var wx = -3.86, wy = 2.0 + ((k % 3) - 1) * 0.4, wz = -58 + ((k % 2) ? 0.55 : -0.55) + (k - 2.5) * 0.1;
        var lx = -(wz - S.anchor.z) / S.resultScale, ly = (wy - S.anchor.y) / S.resultScale, lz = (wx - S.anchor.x) / S.resultScale;
        var slot = V(-(k - (CHECKS - 1) / 2) * 0.15625, 0.4 - 250 / 640, 0.03);
        S.checkPaths.push({
          a: V(lx, ly, lz),
          b: V((lx + slot.x) / 2 + (k % 2 ? 0.15 : -0.15), Math.max(ly, slot.y) + 0.55, (lz + slot.z) / 2 + 0.9),
          c: slot, delay: 0.03 * k
        });
      }
      S.result.scale.setScalar(S.resultScale);
    } catch (e) { S.result = null; }

    S.built = true;
  }

  /* ───────────── الموارد الثقيلة (نسيج canvas) ───────────── */
  function load() {
    if (!S.built || !S.media || typeof S.media.canvasTexture !== 'function') return;
    var T = S.T;
    try {
      if (!S.sheetTex && S.sheetMat) {
        S.sheetTex = S.media.canvasTexture(512, 704, drawSheet);
        S.sheetMat.map = S.sheetTex.texture;
        S.sheetMat.needsUpdate = true;
      }
    } catch (e) { S.sheetTex = null; }
    try {
      if (!S.bubbleTex && S.bubbleMat) {
        S.bubbleTex = S.media.canvasTexture(704, 512, drawBubble);
        S.bubbleAlpha = S.media.canvasTexture(704, 512, drawBubbleMask);
        if (T.NoColorSpace != null) S.bubbleAlpha.texture.colorSpace = T.NoColorSpace;
        S.bubbleMat.map = S.bubbleTex.texture;
        S.bubbleMat.alphaMap = S.bubbleAlpha.texture;
        S.bubbleMat.needsUpdate = true;
      }
    } catch (e) { S.bubbleTex = null; }
    try {
      if (!S.checkTex && S.checkMat) {
        S.checkTex = S.media.canvasTexture(128, 128, drawCheck);
        S.checkMat.map = S.checkTex.texture;
        S.checkMat.needsUpdate = true;
      }
    } catch (e) { S.checkTex = null; }
    try { if (S.screen) S.screen.enter(); } catch (e) {}
  }

  function unload() {
    try { if (S.screen) S.screen.leave(); } catch (e) {}
    try {
      if (S.sheetTex) { S.sheetTex.dispose(); S.sheetTex = null; }
      if (S.sheetMat) { S.sheetMat.map = null; S.sheetMat.needsUpdate = true; }
    } catch (e) {}
    try {
      if (S.bubbleTex) { S.bubbleTex.dispose(); S.bubbleTex = null; }
      if (S.bubbleAlpha) { S.bubbleAlpha.dispose(); S.bubbleAlpha = null; }
      if (S.bubbleMat) { S.bubbleMat.map = null; S.bubbleMat.alphaMap = null; S.bubbleMat.needsUpdate = true; }
    } catch (e) {}
    try {
      if (S.checkTex) { S.checkTex.dispose(); S.checkTex = null; }
      if (S.checkMat) { S.checkMat.map = null; S.checkMat.needsUpdate = true; }
    } catch (e) {}
  }

  /* ───────────── الإطار ───────────── */
  function update(p, ctx) {
    if (!S.built) return;
    p = clamp(+p || 0, 0, 1);
    S.p = p;
    var time = (ctx && +ctx.time) || 0;
    var i;

    /* النافذة تُفتح في الاستلام وتبقى مفتوحة */
    if (S.screen) { try { S.screen.setOpen(ease('out', span(p, 0.0, 0.14))); } catch (e) {} }

    /* الورقة: دخول 0–.15، طيّ .16–.32، تلاشٍ .32–.40 */
    if (S.sheet) {
      var inK = ease('out', span(p, 0.0, 0.15));
      var fold = ease('inOut', span(p, 0.16, 0.32));
      var gone = ease('in', span(p, 0.32, 0.40));
      var show = p > 0.002 && gone < 1;
      S.sheet.visible = show;
      if (show) {
        var bob = Math.sin(time * 1.6) * 0.02 * (1 - fold);
        S.sheet.position.set(S.sheet0.x, S.sheet0.y - 0.6 * (1 - inK) + bob, S.sheet0.z);
        var sc = lerp(0.35, 1, ease('back', inK)) * (1 - 0.55 * gone);
        S.sheet.scale.setScalar(Math.max(0.001, sc));
        S.sheet.rotation.set(0.05 * (1 - inK) + Math.sin(time * 1.1) * 0.015 * (1 - fold), HALF + 0.18 * (1 - inK) - 0.4 * gone, 0.02 * Math.sin(time * 0.9) * (1 - fold));
        S.piv1.rotation.x = fold * 0.93 * PI;
        S.piv2.rotation.x = -fold * 0.93 * PI;
        S.sheetMat.opacity = 1 - gone;
      }
    }

    /* الطائرات: تنطلق من الورقة المطوية وتعبر الزجاج */
    if (S.planes) {
      var any = false;
      for (i = 0; i < PLANES; i++) {
        var pp = S.planePaths[i];
        var u = span(p, 0.33 + pp.delay, 0.49 + pp.delay);
        if (u <= 0 || u >= 1) {
          S.dummy.position.copy(u <= 0 ? pp.a : pp.c);
          S.dummy.scale.setScalar(0.001);
          S.dummy.rotation.set(0, 0, 0);
        } else {
          any = true;
          var ue = ease('inOut', u);
          bezier(S.tmpV, pp.a, pp.b, pp.c, ue);
          bezierTangent(S.tmpV2, pp.a, pp.b, pp.c, ue);
          S.dummy.position.copy(S.tmpV);
          S.tmpV3.copy(S.tmpV).add(S.tmpV2);
          S.dummy.up.set(0, 1, 0);
          S.dummy.lookAt(S.tmpV3);
          S.dummy.rotateZ(Math.sin(u * PI * 2 + i) * 0.35);
          /* أكبر ×1.8 حتى تُقرأ الطائرات في لحظة الذروة */
          S.dummy.scale.setScalar(Math.max(0.001, 1.8 * lerp(0.45, 1, ease('out', span(u, 0, 0.3)))));
        }
        S.dummy.updateMatrix();
        S.planes.setMatrixAt(i, S.dummy.matrix);
      }
      S.planes.instanceMatrix.needsUpdate = true;
      S.planes.visible = any;
    }

    /* النتيجة: الفقاعة .45–.55، العلامات من .47، الأعمدة .62–.83، التسليم .84–1 */
    if (S.result) {
      var hk = ease('in', span(p, 0.84, 1.0));
      var vis = p > 0.45 && hk < 0.999;
      S.result.visible = vis;
      if (vis) {
        var rs = S.resultScale * (1 - 0.999 * hk);
        S.result.scale.setScalar(Math.max(0.001, rs));
        S.result.position.set(S.anchor.x + 0.1 * hk, S.anchor.y + 0.5 * hk, S.anchor.z - 0.8 * hk);
        var bk = ease('back', span(p, 0.45, 0.55));
        S.bubble.scale.setScalar(Math.max(0.001, bk));
        S.bubble.position.y = Math.sin(time * 1.2) * 0.008;
        S.bubbleMat.opacity = span(p, 0.45, 0.51) * (1 - hk);
        for (i = 0; i < 4; i++) {
          var bh = ease('out', span(p, 0.62 + 0.03 * i, 0.74 + 0.03 * i));
          var hgt = BAR_H[i] * bh + 0.002;
          if (i === BAR_RED && bh > 0.99) hgt *= 1 + 0.04 * Math.sin(time * 4);
          S.dummy.position.set(S.barX[i], S.barBase, 0.035);
          S.dummy.rotation.set(0, 0, 0);
          S.dummy.scale.set(1, hgt, 1);
          S.dummy.updateMatrix();
          S.bars.setMatrixAt(i, S.dummy.matrix);
        }
        S.bars.instanceMatrix.needsUpdate = true;
        S.bars.visible = p > 0.6;
        for (i = 0; i < CHECKS; i++) {
          var cp = S.checkPaths[i], spr = S.checks[i];
          var cu = span(p, 0.47 + cp.delay, 0.6 + cp.delay);
          if (cu <= 0) { spr.visible = false; continue; }
          spr.visible = true;
          if (cu >= 1) {
            spr.position.copy(cp.c);
            spr.scale.setScalar(0.15 + 0.006 * Math.sin(time * 3 + i));
          } else {
            bezier(spr.position, cp.a, cp.b, cp.c, ease('inOut', cu));
            var ssc = 0.15 * ease('out', span(cu, 0, 0.3)) * (1 + 0.35 * Math.sin(PI * cu));
            spr.scale.setScalar(Math.max(0.001, ssc));
          }
        }
      }
    }
  }

  /* ───────────── الجودة ───────────── */
  function setQuality(q) {
    if (!S.built || !S.T) return;
    var lam = q === 'light' || S.mobile;
    for (var i = 0; i < S.mats.length; i++) {
      var d = S.mats[i];
      if ((d.mat.isMeshLambertMaterial === true) === lam) continue;
      var nm = d.make(lam);
      for (var k = 0; k < d.users.length; k++) d.users[k].material = nm;
      try { d.mat.dispose(); } catch (e) {}
      d.mat = nm;
    }
  }

  NS.registerStation({
    id: 's5',
    index: 4,
    weight: 1.1,
    text: {
      headline: HEADLINE,
      copy: 'أوراق عمل واختبارات تصل الطلاب عبر واتساب وتُصحَّح آلياً مع تحليل الأخطاء — والمحاولة الأولى هي المعتمدة.'
    },
    /* نقطة العقد عند t=0 ونقطة تثبيت شبه مطابقة عند .8 حتى تبقى الكاميرا على النافذة طوال الذروة ثم تلتف نحو الخزائن في التسليم */
    cam: [
      { t: 0.0, pos: [0.5, 1.8, -58], look: [-3.9, 2, -58] },
      { t: 0.8, pos: [0.42, 1.8, -58.08], look: [-3.9, 2, -58.06] },
      /* نقطة تسليم تنظر نحو الخزائن مباشرة (الالتفاف يمرّ بعمق الممر لا بالجدار الأصم) */
      { t: 1.0, pos: [0.4, 1.75, -60], look: [3.9, 1.6, -63] }
    ],
    posterTitle: HEADLINE,
    build: build,
    load: load,
    unload: unload,
    update: update,
    setQuality: setQuality
  });
})();
