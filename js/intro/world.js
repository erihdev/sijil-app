/* js/intro/world.js — عالم المدرسة للجولة السينمائية (سجل المتابعة الرقمي)
   يصدّر SIJIL_INTRO.buildWorld(ctx) ويعيد مراجع مسمّاة وفق القسم 5 من INTRO_SPEC.md.
   لا modules، لا مكتبات إضافية؛ كل الهندسة الثابتة تُدمج في شبكات قليلة لتقليل draw calls. */
(function () {
  'use strict';
  var NS = window.SIJIL_INTRO = window.SIJIL_INTRO || {};

  var COL = {
    navyNight: 0x071322, navy: 0x0E2033, gold: 0xD7A93F, goldPale: 0xF0D99A, sky: 0x9FC4E8, cream: 0xF8F5EF,
    wall: 0xE9DCC4, cornice: 0xCDBB99, sand: 0xC9B99A, corridorFloor: 0xDCD3C0, classFloor: 0xB9A37E,
    wood: 0xC9A46A, locker: 0x4F7FC7, board: 0x0F2B1F, trunk: 0x8B5A2B, frond: 0x2F8F5B, flag: 0x006C35,
    skyDay: 0x9FC4E8, skySunset: 0xE8A46B, skyNight: 0x071322,
    skin: 0xE0B48F, robe: 0xF8F5EF, screen: 0x0B1A2C, dates: 0xC9772B, farGround: 0xB5A78B,
    ceiling: 0xF1E8D6, roofTop: 0xDCCFB4
  };

  // ألوان المواد الإحدى عشرة لبلاطات جدار الدروس
  var SUBJECTS = [0x0E2033, 0x1D3A5C, 0x2F6B8F, 0x4F7FC7, 0x9FC4E8, 0x2F8F5B, 0x6FA36B, 0xD7A93F, 0xF0D99A, 0xC9772B, 0x8B5A2B];

  var DEG = Math.PI / 180, HALF = Math.PI / 2, PI = Math.PI;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function seeded(seed) {
    var s = seed >>> 0 || 1;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  NS.buildWorld = function (ctx) {
    ctx = ctx || {};
    var THREE = ctx.THREE || window.THREE;
    if (!THREE) return null;
    try {
      return build(THREE, ctx);
    } catch (e) {
      try { console.warn('[intro/world] build failed', e); } catch (_) {}
      return null;
    }
  };

  function build(THREE, ctx) {
    var isMobile = !!ctx.isMobile;
    var useLambert = isMobile || ctx.quality === 'light';
    var renderer = ctx.renderer || null;
    var scene = ctx.scene || null;
    // الإضاءة الفيزيائية (r155+) لا تضرب الشدة في π؛ نعوّض حتى تبقى قيم العقد كما هي بصرياً
    var physical = (parseInt(THREE.REVISION, 10) || 160) >= 155;
    var LIGHT_K = physical ? 2.3 : 1;

    var rnd = seeded(20260905);
    var ONE = new THREE.Vector3(1, 1, 1);
    var UP = new THREE.Vector3(0, 1, 0);
    var tmpM = new THREE.Matrix4(), tmpM2 = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(),
        tmpS = new THREE.Vector3(), tmpE = new THREE.Euler(), tmpC = new THREE.Color(), tmpC2 = new THREE.Color();

    var group = new THREE.Group();
    group.name = 'world';

    var world = {
      group: group, THREE: THREE, isMobile: isMobile,
      palms: [], benches: [], windows: [], lockers: [], lights: {},
      students: null, corridor: null, classroom: null, lessonsWall: null,
      led: null, flag: null, window: null, roof: null, adminBoard: null, stars: null,
      nightAmount: 0, skyColor: new THREE.Color(COL.skyDay)
    };

    /* ---------- المواد ----------
       كل مادة مضاءة لها «توأم» Lambert يُبنى عند البناء (المكتب) ويُترجم مسبقاً من core، فتبديل الجودة يبدّل المراجع فقط */
    var litDefs = [], litByName = {};
    function mkLit(opts) {
      opts = opts || {};
      function make(lam) {
        var p = {
          color: opts.color == null ? 0xffffff : opts.color,
          vertexColors: !!opts.vertexColors,
          side: opts.side || THREE.FrontSide
        };
        if (opts.emissive != null) { p.emissive = opts.emissive; p.emissiveIntensity = opts.emissiveIntensity == null ? 1 : opts.emissiveIntensity; }
        if (opts.map) p.map = opts.map;
        if (opts.transparent) { p.transparent = true; p.opacity = opts.opacity == null ? 1 : opts.opacity; }
        var m;
        if (lam) m = new THREE.MeshLambertMaterial(p);
        else { p.roughness = 0.85; p.metalness = 0; m = new THREE.MeshStandardMaterial(p); }
        m.name = opts.name || '';
        return m;
      }
      var mat = make(useLambert);
      var def = { mat: mat, make: make, twin: useLambert ? null : make(true), vertexColors: !!opts.vertexColors, sample: null };
      litDefs.push(def);
      if (opts.name) litByName[opts.name] = def;
      return mat;
    }

    var matStatic = mkLit({ vertexColors: true, name: 'static' });
    var matGold = mkLit({ color: COL.gold, emissive: COL.gold, emissiveIntensity: 0.3, name: 'gold' });
    var matWhiteInst = mkLit({ color: 0xffffff, name: 'inst' });         // مع instanceColor
    var matRobe = mkLit({ color: COL.robe, name: 'robe' });
    var matSkin = mkLit({ color: COL.skin, name: 'skin' });
    var matFrond = mkLit({ vertexColors: true, side: THREE.DoubleSide, name: 'frond' });
    var matFlag = mkLit({ color: COL.flag, side: THREE.DoubleSide, name: 'flag' });
    var matCream = mkLit({ color: COL.wall, name: 'cream' });
    // الأسقف تواجه الأسفل فلا تصلها الشمس؛ emissive خفيف يحاكي الضوء المرتد عن الأرض
    var matCeiling = mkLit({ color: COL.ceiling, emissive: 0xEFE4CF, emissiveIntensity: 0.42, name: 'ceiling' });
    var matRoof = mkLit({ vertexColors: true, side: THREE.DoubleSide, name: 'roof' });
    var matCorridorFloor = mkLit({ color: COL.corridorFloor, name: 'corridorFloor' });
    var matClassFloor = mkLit({ color: COL.classFloor, name: 'classFloor' });
    var matLamp = mkLit({ color: 0xF8F5EF, emissive: 0xFFF1D0, emissiveIntensity: 0.45, name: 'lamp' });
    var matDoor = mkLit({ vertexColors: true, emissive: 0xFFF1D0, emissiveIntensity: 0.14, name: 'lockerDoor' });

    /* ---------- أدوات الهندسة ---------- */
    var S = [];   // أجزاء الشبكة الثابتة (ألوان رؤوس)
    var G = [];   // أجزاء الذهب (مادة emissive مشتركة)

    function colorize(geo, hex, k) {
      tmpC.setHex(hex);
      if (k && k !== 1) tmpC.multiplyScalar(k);
      var n = geo.attributes.position.count, arr = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) { arr[i * 3] = tmpC.r; arr[i * 3 + 1] = tmpC.g; arr[i * 3 + 2] = tmpC.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return geo;
    }
    function xf(geo, x, y, z, rx, ry, rz, sx, sy, sz) {
      tmpE.set(rx || 0, ry || 0, rz || 0);
      tmpQ.setFromEuler(tmpE);
      tmpS.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
      tmpM.compose(tmpV.set(x || 0, y || 0, z || 0), tmpQ, tmpS);
      geo.applyMatrix4(tmpM);
      return geo;
    }
    // صندوق ملوّن يُضاف إلى القائمة المعطاة؛ k تفاوت لمعان بسيط («طلاء غير متساوٍ»)
    function box(list, w, h, d, x, y, z, hex, k, rx, ry, rz) {
      var g = xf(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
      if (hex != null) colorize(g, hex, k || (1 + (rnd() - 0.5) * 0.05));
      list.push(g);
      return g;
    }
    function plane(list, w, h, x, y, z, rx, ry, rz, hex, k) {
      var g = xf(new THREE.PlaneGeometry(w, h), x, y, z, rx, ry, rz);
      if (hex != null) colorize(g, hex, k || 1);
      list.push(g);
      return g;
    }
    function cyl(list, rt, rb, h, seg, open, x, y, z, hex, k, rx, ry, rz) {
      var g = xf(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!open), x, y, z, rx, ry, rz);
      if (hex != null) colorize(g, hex, k || 1);
      list.push(g);
      return g;
    }

    function mergeGeos(list, withColor) {
      var vCount = 0, iCount = 0, i, g, k;
      for (i = 0; i < list.length; i++) {
        g = list[i];
        if (!g.attributes.normal) g.computeVertexNormals();
        vCount += g.attributes.position.count;
        iCount += g.index ? g.index.count : g.attributes.position.count;
      }
      var pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
      var col = withColor ? new Float32Array(vCount * 3) : null;
      var idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
      var vo = 0, io = 0;
      for (i = 0; i < list.length; i++) {
        g = list[i];
        var n = g.attributes.position.count;
        pos.set(g.attributes.position.array, vo * 3);
        nor.set(g.attributes.normal.array, vo * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
        if (col) {
          if (g.attributes.color) col.set(g.attributes.color.array, vo * 3);
          else for (k = 0; k < n * 3; k++) col[vo * 3 + k] = 1;
        }
        if (g.index) { var ia = g.index.array; for (k = 0; k < ia.length; k++) idx[io + k] = ia[k] + vo; io += ia.length; }
        else { for (k = 0; k < n; k++) idx[io + k] = vo + k; io += n; }
        vo += n;
        g.dispose();
      }
      var out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      out.setIndex(new THREE.BufferAttribute(idx, 1));
      return out;
    }

    function addMesh(geo, mat, name) {
      var m = new THREE.Mesh(geo, mat);
      m.name = name || '';
      m.matrixAutoUpdate = false;
      group.add(m);
      return m;
    }
    function instBounds(m, pad) {
      try {
        if (m.computeBoundingSphere) { m.computeBoundingSphere(); if (pad && m.boundingSphere) m.boundingSphere.radius += pad; }
        else m.frustumCulled = false;
      } catch (e) { m.frustumCulled = false; }
    }
    // شاشة مؤقتة: مستوٍ بمادة داكنة تُستبدل من المحطات (media.screen)
    function screenMesh(w, h, x, y, z, ry, hex, name) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: hex == null ? COL.screen : hex }));
      m.position.set(x, y, z);
      m.rotation.y = ry || 0;
      m.name = name;
      m.userData.screen = name;
      m.userData.size = [w, h];
      group.add(m);
      return m;
    }

    /* ---------- الأرض ---------- */
    plane(S, 320, 320, 0, -0.03, -30, -HALF, 0, 0, COL.farGround);
    plane(S, 40, 26, 0, 0, -13, -HALF, 0, 0, COL.sand);

    /* ---------- السور والبوابة (z=0) ---------- */
    (function buildFence() {
      var side;
      for (side = -1; side <= 1; side += 2) {
        box(S, 12, 3, 0.4, side * 8, 1.5, 0, COL.wall);
        box(S, 12.2, 0.25, 0.56, side * 8, 3.125, 0, COL.cornice);
        box(S, 12, 0.4, 0.46, side * 8, 0.2, 0, COL.navy);
        [6, 10, 14].forEach(function (px) {
          box(S, 0.56, 3.4, 0.56, side * px, 1.7, 0, COL.wall, 1.03);
          box(G, 0.72, 0.1, 0.72, side * px, 3.44, 0);
        });
        // عمودا البوابة
        box(S, 0.7, 4.2, 0.7, side * 2.35, 2.1, 0, COL.wall, 1.03);
        box(S, 0.8, 0.12, 0.8, side * 2.35, 4.24, 0, COL.cornice);
        box(G, 0.86, 0.1, 0.86, side * 2.35, 4.35, 0);
      }
      // قوس البوابة (نصف حلقة مبثوقة)
      function arc(rIn, rOut, depth, segs) {
        var sh = new THREE.Shape();
        sh.absarc(0, 0, rOut, 0, PI, false);
        sh.lineTo(-rIn, 0);
        sh.absarc(0, 0, rIn, PI, 0, true);
        sh.closePath();
        var g = new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: false, curveSegments: segs });
        g.translate(0, 0, -depth / 2);
        return g;
      }
      var band = arc(2.0, 2.3, 0.4, 14); band.translate(0, 1.25, 0); colorize(band, COL.wall, 1.02); S.push(band);
      var gline = arc(2.3, 2.37, 0.44, 14); gline.translate(0, 1.25, 0); G.push(gline);
      box(S, 0.5, 0.5, 0.46, 0, 3.4, 0, COL.cornice);
      // لوحة LED: صفيحة خلفية كحلية + إطار كحلي 0.15 + الشاشة نفسها عند z=0.25
      box(S, 6.4, 3.75, 0.16, 0, 5.2, 0.16, COL.navy, 1);
      box(S, 6.3, 0.15, 0.12, 0, 5.2 + 1.6875 + 0.075, 0.2, COL.navy, 1.15);
      box(S, 6.3, 0.15, 0.12, 0, 5.2 - 1.6875 - 0.075, 0.2, COL.navy, 1.15);
      box(S, 0.15, 3.375, 0.12, 3.075, 5.2, 0.2, COL.navy, 1.15);
      box(S, 0.15, 3.375, 0.12, -3.075, 5.2, 0.2, COL.navy, 1.15);
      world.led = screenMesh(6, 3.375, 0, 5.2, 0.25, 0, COL.screen, 'led');
      // تاج البوابة: منشور مثلث فوق اللوحة بحافتين ذهبيتين وكرة ذهبية
      var tri = new THREE.Shape();
      tri.moveTo(-3.3, 0); tri.lineTo(3.3, 0); tri.lineTo(0, 0.95); tri.closePath();
      var crown = new THREE.ExtrudeGeometry(tri, { depth: 0.16, bevelEnabled: false });
      crown.translate(0, 7.05, 0.07); colorize(crown, COL.cornice, 1.02); S.push(crown);
      var slope = Math.atan2(0.95, 3.3), len = Math.sqrt(3.3 * 3.3 + 0.95 * 0.95) + 0.1;
      box(G, len, 0.07, 0.2, -1.65, 7.05 + 0.475 + 0.03, 0.15, null, null, 0, 0, slope);
      box(G, len, 0.07, 0.2, 1.65, 7.05 + 0.475 + 0.03, 0.15, null, null, 0, 0, -slope);
      var ball = new THREE.IcosahedronGeometry(0.14, 0); ball.translate(0, 8.12, 0.15); G.push(ball);
    })();

    /* ---------- النخلتان ---------- */
    function buildPalm(x, z, lean, phase) {
      var segs = 6, h = 5 / segs, p = new THREE.Vector3(x, 0, z), dir = new THREE.Vector3(0, 1, 0);
      var tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), lean * 3 * DEG);
      var q = new THREE.Quaternion(), i, g;
      for (i = 0; i < segs; i++) {
        dir.applyQuaternion(tilt).normalize();
        var rb = 0.28 - 0.10 * (i / segs), rt = 0.28 - 0.10 * ((i + 1) / segs);
        g = new THREE.CylinderGeometry(rt, rb, h, 7, 1, i < segs - 1);
        q.setFromUnitVectors(UP, dir);
        tmpM.compose(tmpV.copy(p).addScaledVector(dir, h / 2), q, ONE);
        g.applyMatrix4(tmpM);
        colorize(g, COL.trunk, i % 2 ? 0.88 : 1.08);
        S.push(g);
        p.addScaledVector(dir, h);
        if (i < segs - 1) {
          // عقدة حلقية بين كل أسطوانتين
          g = new THREE.CylinderGeometry(rt + 0.035, rt + 0.035, 0.1, 7, 1, true);
          tmpM.compose(p, q, ONE); g.applyMatrix4(tmpM);
          colorize(g, COL.trunk, 0.72); S.push(g);
        }
      }
      // التاج: 7 سعفات مثنية تربيعياً ومتفاوتة الرفع، بوجهين
      var lifts = [34, 22, 30, 18, 28, 24, 32], fronds = [];
      for (i = 0; i < 7; i++) {
        var f = new THREE.PlaneGeometry(2.6, 0.7, 6, 1);
        f.rotateX(-HALF); f.translate(1.3, 0, 0);
        var pa = f.attributes.position, n = pa.count, cc = new Float32Array(n * 3), k = 0.96 + rnd() * 0.08;
        tmpC2.setHex(0x74C48C);
        for (var v = 0; v < n; v++) {
          var fx = pa.getX(v), u = fx / 2.6, pz = pa.getZ(v) * (1.15 - 0.85 * u);
          pa.setZ(v, pz);
          pa.setY(v, -0.15 * fx * fx + Math.abs(pz) * 0.3);   // ثني تربيعي + طيّة وسطية
          tmpC.setHex(COL.frond).lerp(tmpC2, Math.pow(u, 1.4)).multiplyScalar(k);
          cc[v * 3] = tmpC.r; cc[v * 3 + 1] = tmpC.g; cc[v * 3 + 2] = tmpC.b;
        }
        f.setAttribute('color', new THREE.BufferAttribute(cc, 3));
        f.computeVertexNormals();
        f.rotateZ(lifts[i] * DEG);
        f.rotateY(i * (2 * PI / 7) + phase);
        fronds.push(f);
      }
      var crown = new THREE.Mesh(mergeGeos(fronds, true), matFrond);
      crown.position.copy(p);
      crown.name = 'palmCrown';
      group.add(crown);
      // عنقودا تمر
      for (i = 0; i < 2; i++) {
        g = new THREE.IcosahedronGeometry(0.22, 0);
        g.translate(p.x + (i ? -0.26 : 0.24), p.y - 0.34, p.z + (i ? 0.18 : -0.12));
        colorize(g, COL.dates, 1); S.push(g);
      }
      world.palms.push({ crown: crown, phase: phase, base: crown.rotation.clone() });
    }
    buildPalm(9, 1.5, 1, 0.3);
    buildPalm(-10, 1.2, -1, 1.9);
    /* حوضا نبات عند عمودي البوابة يملآن مقدمة الكادر في الكشف الافتتاحي */
    [-3.5, 3.5].forEach(function (px) {
      box(S, 0.9, 0.5, 0.9, px, 0.25, 1.4, COL.cornice, 1.02);
      box(S, 0.82, 0.06, 0.82, px, 0.53, 1.4, COL.trunk, 0.7);
      var bush = new THREE.IcosahedronGeometry(0.42, 1); bush.translate(px, 0.82, 1.4); colorize(bush, COL.frond, 0.95); S.push(bush);
      var bush2 = new THREE.IcosahedronGeometry(0.28, 1); bush2.translate(px + 0.22, 1.02, 1.55); colorize(bush2, 0x74C48C, 0.9); S.push(bush2);
    });

    /* ---------- سارية العلم ---------- */
    (function buildFlag() {
      cyl(S, 0.05, 0.06, 7, 6, false, -5, 3.5, -5, COL.navy, 1.4);
      box(S, 0.7, 0.3, 0.7, -5, 0.15, -5, COL.cornice);
      var ball = new THREE.IcosahedronGeometry(0.1, 0); ball.translate(-5, 7.08, -5); G.push(ball);
      var fg = new THREE.PlaneGeometry(1.6, 1.0, 12, 1);
      fg.translate(0.8, 0, 0);
      var flag = new THREE.Mesh(fg, matFlag);
      flag.position.set(-4.95, 6.35, -5);
      flag.name = 'flag';
      flag.frustumCulled = false;
      flag.userData.base = Float32Array.from(fg.attributes.position.array);
      group.add(flag);
      world.flag = flag;
    })();

    /* ---------- الفناء: بلاط المسار + الطابور + المقاعد ---------- */
    (function buildCourtyard() {
      var tiles = [], r, c;
      for (r = 0; r < 24; r++) for (c = -1; c <= 0; c++) tiles.push([c + 0.5, -0.5 - r]);
      [0, 1, 22, 23].forEach(function (rr) { tiles.push([-1.5, -0.5 - rr]); tiles.push([1.5, -0.5 - rr]); });
      var tg = new THREE.PlaneGeometry(0.94, 0.94); tg.rotateX(-HALF);
      var tm = new THREE.InstancedMesh(tg, matWhiteInst, tiles.length);
      var col = new THREE.Color();
      for (var i = 0; i < tiles.length; i++) {
        tmpM.makeTranslation(tiles[i][0], 0.012, tiles[i][1]);
        tm.setMatrixAt(i, tmpM);
        /* درجتان رمليتان متقاربتان (لا رقعة شطرنج) وصف حدّي كحلي عند طرفي المسار */
        var edge = Math.abs(tiles[i][0]) > 1;
        var dark = (Math.round(tiles[i][0] + 0.5) + Math.round(-tiles[i][1] - 0.5)) % 2 === 0;
        if (edge) col.setHex(COL.navy).multiplyScalar(2.1);
        else col.setHex(dark ? 0xB8A98C : 0xD6C9AC).multiplyScalar(0.97 + rnd() * 0.05);
        tm.setColorAt(i, col);
      }
      tm.name = 'pathTiles';
      instBounds(tm, 0);
      group.add(tm);
      world.pathTiles = tm;

      // الطابور: 30 طالباً (جسم + رأس)
      var N = 30;
      /* أوجه أنعم: الكاميرا تمر بينهم على بعد < 1م في المحطة 2 */
      var bodyG = new THREE.CapsuleGeometry(0.22, 0.5, 2, 12);
      var headG = new THREE.SphereGeometry(0.16, 12, 8);
      var bodies = new THREE.InstancedMesh(bodyG, matRobe, N);
      var heads = new THREE.InstancedMesh(headG, matSkin, N);
      var feet = [], phases = [];
      for (var row = 0; row < 5; row++) for (c = 0; c < 6; c++) {
        var idx = row * 6 + c;
        feet.push([-5 + c * 2 + (rnd() - 0.5) * 0.3, -8 - row * 2 + (rnd() - 0.5) * 0.3]);
        phases.push(rnd() * PI * 2);
        tmpM.makeTranslation(feet[idx][0], 0.47, feet[idx][1]); bodies.setMatrixAt(idx, tmpM);
        tmpM.makeTranslation(feet[idx][0], 1.08, feet[idx][1]); heads.setMatrixAt(idx, tmpM);
      }
      bodies.name = 'students'; heads.name = 'studentHeads';
      bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instBounds(bodies, 0.5); instBounds(heads, 0.5);
      group.add(bodies); group.add(heads);
      world.students = { bodies: bodies, heads: heads, count: N, feet: feet, phases: phases };

      // 6 مقاعد بأرجل وظهر مائل، كل مقعد بمادته (تضيء عبر material.emissive)
      var parts = [];
      box(parts, 1.6, 0.09, 0.5, 0, 0.445, 0);
      box(parts, 0.06, 0.4, 0.06, 0.72, 0.2, 0.19); box(parts, 0.06, 0.4, 0.06, -0.72, 0.2, 0.19);
      box(parts, 0.06, 0.4, 0.06, 0.72, 0.2, -0.19); box(parts, 0.06, 0.4, 0.06, -0.72, 0.2, -0.19);
      box(parts, 1.6, 0.34, 0.05, 0, 0.68, -0.245, null, null, -0.14, 0, 0);
      var benchG = mergeGeos(parts, false);
      [-10, -7, -4, 4, 7, 10].forEach(function (bx, i) {
        var bm = new THREE.Mesh(benchG, mkLit({ color: COL.wood, emissive: COL.gold, emissiveIntensity: 0, name: 'bench' + i }));
        bm.position.set(bx, 0, -19);
        bm.name = 'bench' + i;
        group.add(bm);
        world.benches.push(bm);
      });
    })();

    /* ---------- واجهة المبنى (z=−24) وهيكل المبنى ---------- */
    (function buildFacade() {
      box(S, 14.5, 4.2, 0.4, -8.75, 2.1, -24, COL.wall);
      box(S, 14.5, 4.2, 0.4, 8.75, 2.1, -24, COL.wall);
      box(S, 3, 1.4, 0.4, 0, 3.5, -24, COL.wall);
      box(S, 32.6, 0.3, 0.62, 0, 4.05, -24, COL.cornice);
      box(S, 32, 0.6, 0.44, 0, 0.3, -24, COL.navy);
      // إطار الباب الكحلي وعتبة ذهبية ومظلة
      box(S, 0.18, 2.8, 0.5, -1.59, 1.4, -23.9, COL.navy, 1.1);
      box(S, 0.18, 2.8, 0.5, 1.59, 1.4, -23.9, COL.navy, 1.1);
      box(G, 3.36, 0.16, 0.5, 0, 2.88, -23.9);
      box(S, 4.2, 0.12, 1.3, 0, 3.15, -23.3, COL.cornice, 1.04);
      box(S, 0.1, 0.5, 0.1, -1.9, 2.85, -22.75, COL.navy, 1.1);
      box(S, 0.1, 0.5, 0.1, 1.9, 2.85, -22.75, COL.navy, 1.1);
      // 8 نوافذ: صفيحة إطار + عتبة + مستوٍ زجاجي بمادة مستقلة
      [-13.5, -10.5, -7.5, -4.5, 4.5, 7.5, 10.5, 13.5].forEach(function (wx, i) {
        box(S, 1.62, 1.32, 0.06, wx, 2.4, -23.78, COL.cornice, 1.0);
        box(S, 1.74, 0.08, 0.18, wx, 1.72, -23.72, COL.cornice, 0.96);
        // زجاج داكن بمادة مضاءة مستقلة لكل نافذة؛ emissive/emissiveIntensity حقيقيان (تضيء تباعاً في المحطة 7)
        var wm = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1),
          mkLit({ color: 0x0B1A2C, emissive: COL.goldPale, emissiveIntensity: 0, name: 'window' + i }));
        wm.position.set(wx, 2.4, -23.74);
        wm.name = 'facadeWindow' + i;
        group.add(wm);
        world.windows.push(wm);
      });
      // هيكل المبنى الخارجي (يظهر من الأعلى ومن الخلف)
      box(S, 0.4, 4.2, 48, -16, 2.1, -48, COL.wall);
      box(S, 0.4, 4.2, 48, 16, 2.1, -48, COL.wall);
      box(S, 32.4, 4.2, 0.4, 0, 2.1, -72, COL.wall);
      box(S, 32.8, 0.3, 0.62, 0, 4.05, -72, COL.cornice);
      box(S, 32.4, 0.6, 0.44, 0, 0.3, -72, COL.navy);
      box(S, 0.62, 0.3, 48.4, -16, 4.05, -48, COL.cornice);
      box(S, 0.62, 0.3, 48.4, 16, 4.05, -48, COL.cornice);
      box(S, 0.44, 0.6, 48, -16, 0.3, -48, COL.navy);
      box(S, 0.44, 0.6, 48, 16, 0.3, -48, COL.navy);
    })();

    /* ---------- الممر (z=−24..−70، عرض 8) ---------- */
    (function buildCorridor() {
      var fg = new THREE.PlaneGeometry(8.8, 46.4); fg.rotateX(-HALF); fg.translate(0, 0.02, -47);
      var floor = addMesh(fg, matCorridorFloor, 'corridorFloor');
      // خط ذهبي وسطي على الأرض
      box(G, 0.05, 0.006, 44, 0, 0.024, -47);
      // السقف y=4 مع كوّة عند (0,4,−68): 2.2×2.6 (مسافة أمان لمرور الكاميرا)
      var cp = [];
      plane(cp, 8.8, 42.7, 0, 4, -45.35, HALF);
      plane(cp, 8.8, 0.9, 0, 4, -69.75, HALF);
      plane(cp, 3.3, 2.6, -2.75, 4, -68, HALF);
      plane(cp, 3.3, 2.6, 2.75, 4, -68, HALF);
      plane(cp, 8, 12, -8, 4, -36, HALF);   // سقف الفصل (نفس المادة)
      var ceiling = addMesh(mergeGeos(cp, false), matCeiling, 'corridorCeiling');
      // الجدار الأيسر بفتحة الفصل z∈[−31,−41] وعتب فوقها
      var wl = [];
      box(wl, 0.4, 4, 7, -4.2, 2, -27.5);
      box(wl, 0.4, 4, 29, -4.2, 2, -55.5);
      box(wl, 0.4, 0.7, 10, -4.2, 3.65, -36);
      var wallL = addMesh(mergeGeos(wl, false), matCream, 'corridorWallL');
      var wr = [];
      box(wr, 0.4, 4, 46, 4.2, 2, -47);
      var wallR = addMesh(mergeGeos(wr, false), matCream, 'corridorWallR');
      // جدار النهاية z=−70 وشرائط كحلية سفلية وعتب ذهبي لفتحة الفصل
      box(S, 8.8, 4, 0.4, 0, 2, -70.2, COL.wall);
      box(S, 0.03, 0.9, 7, -3.985, 0.45, -27.5, COL.navy);
      box(S, 0.03, 0.9, 29, -3.985, 0.45, -55.5, COL.navy);
      box(S, 0.02, 0.9, 46, 3.99, 0.45, -47, COL.navy);
      box(S, 8.8, 0.9, 0.03, 0, 0.45, -69.985, COL.navy);
      box(G, 0.06, 0.08, 10.2, -3.98, 3.3, -36);
      // 8 مصابيح سقفية emissive
      var lp = [];
      for (var i = 0; i < 8; i++) box(lp, 1.2, 0.08, 0.3, 0, 3.95, -28 - i * 5.3);
      var lamps = addMesh(mergeGeos(lp, false), matLamp, 'corridorLamps');
      world.corridor = { floor: floor, ceiling: ceiling, wallL: wallL, wallR: wallR, lamps: lamps };
      // الكوّة: إطار ذهبي تحت السقف وحافة مرتفعة فوق السطح
      box(G, 0.1, 0.06, 2.8, -1.15, 3.97, -68); box(G, 0.1, 0.06, 2.8, 1.15, 3.97, -68);
      box(G, 2.4, 0.06, 0.1, 0, 3.97, -66.65); box(G, 2.4, 0.06, 0.1, 0, 3.97, -69.35);
      box(S, 0.14, 0.4, 2.9, -1.17, 4.38, -68, COL.wall); box(S, 0.14, 0.4, 2.9, 1.17, 4.38, -68, COL.wall);
      box(S, 2.5, 0.4, 0.14, 0, 4.38, -66.63, COL.wall); box(S, 2.5, 0.4, 0.14, 0, 4.38, -69.37, COL.wall);
      box(G, 0.2, 0.04, 2.96, -1.17, 4.6, -68); box(G, 0.2, 0.04, 2.96, 1.17, 4.6, -68);
      box(G, 2.56, 0.04, 0.2, 0, 4.6, -66.63); box(G, 2.56, 0.04, 0.2, 0, 4.6, -69.37);
    })();

    /* ---------- الفصل (x∈[−12,−4], z∈[−30,−42]) ---------- */
    (function buildClassroom() {
      var fg = new THREE.PlaneGeometry(8, 12); fg.rotateX(-HALF); fg.translate(-8, 0.02, -36);
      var floor = addMesh(fg, matClassFloor, 'classFloor');
      box(S, 0.3, 4, 12.6, -12.15, 2, -36, COL.wall);
      box(S, 8, 4, 0.3, -8, 2, -29.85, COL.wall);
      box(S, 8, 4, 0.3, -8, 2, -42.15, COL.wall);
      box(S, 0.03, 0.9, 12, -11.985, 0.45, -36, COL.navy);
      box(S, 8, 0.9, 0.03, -8, 0.45, -29.985, COL.navy);
      box(S, 8, 0.9, 0.03, -8, 0.45, -42.015, COL.navy);
      // السبورة عند (−11.9,2.2,−36) بوجه نحو +x، إطار ذهبي ورف طباشير
      var board = screenMesh(4, 2.25, -11.9, 2.2, -36, HALF, COL.board, 'board');
      box(G, 0.1, 0.12, 4.24, -11.93, 2.2 + 1.185, -36);
      box(G, 0.1, 0.12, 4.24, -11.93, 2.2 - 1.185, -36);
      box(G, 0.1, 2.25, 0.12, -11.93, 2.2, -36 + 2.06);
      box(G, 0.1, 2.25, 0.12, -11.93, 2.2, -36 - 2.06);
      box(S, 0.16, 0.05, 3.6, -11.84, 1.0, -36, COL.cornice);
      // 12 مقعداً (4 صفوف × 3): سطح + 4 أرجل أسطوانية + لوح أمامي + كرسي
      var desks = [], xs = [-10.2, -8.7, -7.2, -5.7], zs = [-33.6, -36, -38.4];
      xs.forEach(function (dx) {
        zs.forEach(function (dz) {
          box(S, 0.6, 0.06, 0.9, dx, 0.72, dz, COL.wood);
          [[-0.26, -0.41], [0.26, -0.41], [-0.26, 0.41], [0.26, 0.41]].forEach(function (o) {
            cyl(S, 0.025, 0.025, 0.72, 4, true, dx + o[0], 0.36, dz + o[1], COL.navy, 1.3);
          });
          box(S, 0.03, 0.32, 0.86, dx - 0.29, 0.53, dz, COL.wood, 0.9);
          box(S, 0.36, 0.42, 0.36, dx + 0.55, 0.21, dz, COL.wood, 0.94);
          var a = new THREE.Object3D();
          a.position.set(dx, 0.75, dz);
          a.name = 'desk' + desks.length;
          a.userData.index = desks.length;
          group.add(a);
          desks.push(a);
        });
      });
      // طاولة المعلم
      box(S, 0.7, 0.06, 1.4, -10.9, 0.74, -31.4, COL.wood, 0.95);
      [[-0.3, -0.62], [0.3, -0.62], [-0.3, 0.62], [0.3, 0.62]].forEach(function (o) {
        cyl(S, 0.03, 0.03, 0.72, 4, true, -10.9 + o[0], 0.36, -31.4 + o[1], COL.navy, 1.3);
      });
      world.classroom = { board: board, desks: desks, floor: floor };
    })();

    /* ---------- جدار الدروس (x=+3.95, z=−44..−56) ---------- */
    var atlasTex = null;
    (function buildLessonsWall() {
      var origin = [3.95, 2.1, -50];
      var atlasUV = function (i) {
        var c = i % 8, r = Math.floor(i / 8) % 6;
        return [c / 8, 1 - (r + 1) / 6, (c + 1) / 8, 1 - r / 6];
      };
      /* الأطلس لا يُطلب هنا: المحطتان 3 و4 تستدعيان lessonsWall.setAtlas() من load() (القسم 4) */
      // 24 لوحاً كبيراً: هندسة مدمجة بإزاحة UV لكل لوح (رسمة واحدة)
      var cells = [], bigParts = [], i, r, c, y, z;
      var rowsY = [0.975, 1.725, 2.475, 3.225], colsZ = [-45, -47, -49, -51, -53, -55];
      for (r = 0; r < 4; r++) for (c = 0; c < 6; c++) {
        i = r * 6 + c;
        var ai = (i * 2) % 48;
        var g = new THREE.PlaneGeometry(1, 1);
        var uv = atlasUV(ai), ua = g.attributes.uv;
        for (var v = 0; v < ua.count; v++) ua.setXY(v, uv[0] + ua.getX(v) * (uv[2] - uv[0]), uv[1] + ua.getY(v) * (uv[3] - uv[1]));
        y = rowsY[3 - r]; z = colsZ[c];
        xf(g, 3.93, y, z, 0, -HALF, 0, 0.7, 0.7, 1);
        bigParts.push(g);
        cells.push({ index: i, atlasIndex: ai, pos: [3.93, y, z], size: 0.7, uv: uv });
        box(S, 0.04, 0.8, 0.8, 3.965, y, z, 0xF3EADA, 1);
      }
      var bigMat = new THREE.MeshBasicMaterial({ map: null, color: 0xD9CDB5 });
      var big = addMesh(mergeGeos(bigParts, false), bigMat, 'lessonsBig');
      /* تعيين الأطلس عند جاهزيته (من media.atlas أو تحميل مباشر إن غاب media) */
      function setAtlas(tex) {
        if (!tex || !tex.isTexture) return;
        atlasTex = tex;
        world.lessonsWall.atlas = tex;
        var apply = function () {
          if (world.lessonsWall.atlas !== tex) return;
          bigMat.map = tex; bigMat.color.setHex(0xffffff); bigMat.needsUpdate = true;
        };
        if (tex.userData && tex.userData.ready === false && ctx.media && typeof ctx.media.onReady === 'function') ctx.media.onReady(tex, apply);
        else apply();
      }
      function ensureAtlas() {
        if (atlasTex) return atlasTex;
        try {
          if (ctx.media && typeof ctx.media.atlas === 'function') { setAtlas(ctx.media.atlas()); return atlasTex; }
          var url = 'assets/intro/lessons-atlas' + (isMobile ? '-m' : '') + '.webp';
          var t = new THREE.TextureLoader().load(url, function (tx) { tx.needsUpdate = true; }, undefined, function () {});
          t.colorSpace = THREE.SRGBColorSpace;
          t.minFilter = THREE.LinearFilter;
          t.generateMipmaps = false;
          setAtlas(t);
        } catch (e) {}
        return atlasTex;
      }
      // 782 بلاطة صغيرة خلفها: شبكة 49×16 مع إسقاط بلاطتين مخفيتين خلف لوحين كبيرين
      var COLS = 49, ROWS = 16, total = 782;
      var pz = 12 / COLS, py = 3.0 / ROWS, z0 = -44 - pz / 2, y0 = 0.6 + py / 2;
      var skip = {};
      var cnt = 0;
      for (r = 0; r < ROWS && cnt < 2; r++) for (c = 0; c < COLS && cnt < 2; c++) {
        z = z0 - c * pz; y = y0 + r * py;
        if (Math.abs(z - colsZ[0]) < 0.25 && Math.abs(y - rowsY[0]) < 0.2) { skip[r * COLS + c] = 1; cnt++; }
        else if (Math.abs(z - colsZ[5]) < 0.25 && Math.abs(y - rowsY[3]) < 0.2) { skip[r * COLS + c] = 1; cnt++; }
      }
      var tg = new THREE.PlaneGeometry(0.22, 0.22); tg.rotateY(-HALF);
      var tiles = new THREE.InstancedMesh(tg, matWhiteInst, total);
      var col = new THREE.Color(), n = 0;
      for (r = 0; r < ROWS && n < total; r++) for (c = 0; c < COLS && n < total; c++) {
        if (skip[r * COLS + c]) continue;
        z = z0 - c * pz; y = y0 + r * py;
        tmpM.compose(tmpV.set(3.972, y, z), tmpQ.identity(), tmpS.set(1, 0.78, 1));
        tiles.setMatrixAt(n, tmpM);
        var subj = Math.min(10, Math.floor(c * 11 / COLS));
        col.setHex(SUBJECTS[subj]).multiplyScalar(0.9 + rnd() * 0.22);
        tiles.setColorAt(n, col);
        n++;
      }
      tiles.count = n;
      tiles.name = 'lessonsTiles';
      instBounds(tiles, 0);
      group.add(tiles);
      world.lessonsWall = { big: big, tiles: tiles, origin: origin, cells: cells, atlasUV: atlasUV, atlas: null, subjects: SUBJECTS.slice(), setAtlas: setAtlas, ensureAtlas: ensureAtlas };
    })();

    /* ---------- النافذة (x=−3.95, z=−58) ---------- */
    (function buildWindow() {
      var w = screenMesh(4, 2.6, -3.95, 2.0, -58, HALF, 0x0B1A2C, 'window');
      box(S, 0.1, 0.12, 4.24, -3.95, 2 + 1.36, -58, COL.cream, 1);
      box(S, 0.1, 0.12, 4.24, -3.95, 2 - 1.36, -58, COL.cream, 1);
      box(S, 0.1, 2.84, 0.12, -3.95, 2, -58 + 2.06, COL.cream, 1);
      box(S, 0.1, 2.84, 0.12, -3.95, 2, -58 - 2.06, COL.cream, 1);
      box(S, 0.16, 0.06, 4.3, -3.9, 0.64, -58, COL.cornice, 1);
      world.window = w;
    })();

    /* ---------- الخزائن (x=+3.9, z=−60..−68) ---------- */
    (function buildLockers() {
      // BoxGeometry(0.7,1.8,0.45) مدارة 90° حتى يكون العرض 0.7 بمحاذاة الجدار (z) والعمق 0.45 نحو الممر (x)
      var N = 10, bodyG = new THREE.BoxGeometry(0.7, 1.8, 0.45); bodyG.rotateY(HALF);
      var bodies = new THREE.InstancedMesh(bodyG, matWhiteInst, N);
      // الباب: صندوق + مقبض ذهبي + لوحة اسم، محوره على حافته +z؛ وجهه الداخلي (+x) كريمي فلا يبدو كتلة سوداء حين يُفتح
      var dp = [];
      var doorBox = box(dp, 0.04, 1.74, 0.66, 0, 0, -0.33, COL.locker, 1);
      (function () {
        var nrm = doorBox.attributes.normal, cc = doorBox.attributes.color;
        tmpC.setHex(0xF3EADA);
        for (var v = 0; v < nrm.count; v++) if (nrm.getX(v) > 0.5) cc.setXYZ(v, tmpC.r, tmpC.g, tmpC.b);
      })();
      cyl(dp, 0.018, 0.018, 0.14, 5, false, -0.035, 0, -0.57, COL.gold, 1);
      box(dp, 0.006, 0.05, 0.16, -0.023, 0.55, -0.33, COL.gold, 1);
      var doorG = mergeGeos(dp, true);
      var doors = new THREE.InstancedMesh(doorG, matDoor, N);
      doors.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      var col = new THREE.Color();
      for (var i = 0; i < N; i++) {
        var zc = -60.4 - 0.8 * i;
        tmpM.makeTranslation(3.775, 0.9, zc);
        bodies.setMatrixAt(i, tmpM);
        col.setHex(COL.locker).multiplyScalar(1 + (i % 2 ? 0.03 : -0.03));
        bodies.setColorAt(i, col);
        var pivot = new THREE.Object3D();
        pivot.position.set(3.52, 0.9, zc + 0.33);
        pivot.name = 'lockerDoor' + i;
        pivot.userData.index = i;
        group.add(pivot);
        pivot.updateMatrix();
        doors.setMatrixAt(i, pivot.matrix);
        var anchor = new THREE.Object3D();
        anchor.position.set(3.775, 0.9, zc);
        anchor.name = 'lockerBody' + i;
        anchor.userData.index = i;
        group.add(anchor);
        world.lockers.push({ index: i, body: anchor, door: pivot, z: zc, lastRot: 0 });
      }
      bodies.name = 'lockerBodies'; doors.name = 'lockerDoors';
      instBounds(bodies, 0); doors.frustumCulled = false;
      group.add(bodies); group.add(doors);
      box(S, 0.5, 0.08, 8.3, 3.75, 0.04, -64, COL.navy);
      box(S, 0.5, 0.08, 8.3, 3.75, 1.84, -64, COL.cornice, 0.95);
      world.lockerBodies = bodies;
      world.lockerDoors = doors;
      // فتح خزانة: k من 0 (مغلق) إلى 1 (مفتوح)؛ الدوران الموجب حول y يفتح الباب نحو الممر
      world.setLockerOpen = function (i, k) {
        var L = world.lockers[i];
        if (L) L.door.rotation.y = clamp(k, 0, 1) * 1.9;
      };
    })();

    /* ---------- السطح ولوح المدير ---------- */
    (function buildRoof() {
      var rp = [];
      plane(rp, 36, 2.7, 0, 4.2, -70.65, -HALF, 0, 0, COL.roofTop);
      plane(rp, 36, 44.7, 0, 4.2, -44.35, -HALF, 0, 0, COL.roofTop);
      plane(rp, 16.9, 2.6, -9.55, 4.2, -68, -HALF, 0, 0, COL.roofTop);
      plane(rp, 16.9, 2.6, 9.55, 4.2, -68, -HALF, 0, 0, COL.roofTop);
      box(rp, 36, 0.6, 0.3, 0, 4.5, -22.15, COL.wall); box(rp, 36, 0.6, 0.3, 0, 4.5, -71.85, COL.wall);
      box(rp, 0.3, 0.6, 50, -17.85, 4.5, -47, COL.wall); box(rp, 0.3, 0.6, 50, 17.85, 4.5, -47, COL.wall);
      box(rp, 36, 0.08, 0.36, 0, 4.82, -22.15, COL.cornice); box(rp, 36, 0.08, 0.36, 0, 4.82, -71.85, COL.cornice);
      box(rp, 0.36, 0.08, 50, -17.85, 4.82, -47, COL.cornice); box(rp, 0.36, 0.08, 50, 17.85, 4.82, -47, COL.cornice);
      // خزان ماء ووحدتا تكييف وقواعد لوح المدير
      cyl(rp, 0.9, 0.9, 1.4, 10, false, 12, 4.9, -60, COL.cornice, 1.05);
      box(rp, 1.2, 0.8, 1, -12, 4.6, -40, COL.cornice, 0.95); box(rp, 1.2, 0.8, 1, -13.6, 4.6, -43, COL.cornice, 0.95);
      cyl(rp, 0.08, 0.08, 4.4, 6, false, -1.7, 6.4, -52, COL.navy, 1.2);
      cyl(rp, 0.08, 0.08, 4.4, 6, false, 1.7, 6.4, -52, COL.navy, 1.2);
      box(rp, 4.4, 2.65, 0.1, 0, 9.5, -51.93, COL.navy, 1);
      box(rp, 4.3, 0.15, 0.12, 0, 9.5 + 1.125 + 0.075, -52, COL.navy, 1.15);
      box(rp, 4.3, 0.15, 0.12, 0, 9.5 - 1.125 - 0.075, -52, COL.navy, 1.15);
      box(rp, 0.15, 2.25, 0.12, 2.075, 9.5, -52, COL.navy, 1.15);
      box(rp, 0.15, 2.25, 0.12, -2.075, 9.5, -52, COL.navy, 1.15);
      var roof = addMesh(mergeGeos(rp, true), matRoof, 'roof');
      box(G, 4.3, 0.05, 0.14, 0, 9.5 + 1.125 + 0.175, -52);
      world.roof = roof;
      world.adminBoard = screenMesh(4, 2.25, 0, 9.5, -52, PI, COL.screen, 'adminBoard');
    })();

    /* ---------- الشبكتان المدمجتان ---------- */
    world.staticMesh = addMesh(mergeGeos(S, true), matStatic, 'static');
    world.goldMesh = addMesh(mergeGeos(G, false), matGold, 'gold');

    /* ---------- السماء والنجوم ---------- */
    (function buildStars() {
      var n = isMobile ? 300 : 600, R = 120, pos = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) {
        var th = rnd() * PI * 2, ph = Math.acos(1 - rnd() * 0.92);
        pos[i * 3] = R * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = R * Math.cos(ph);
        pos[i * 3 + 2] = R * Math.sin(ph) * Math.sin(th) - 40;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var sprite = null;
      try {
        var cv = document.createElement('canvas'); cv.width = cv.height = 32;
        var c2 = cv.getContext('2d');
        var gr = c2.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,248,230,0.85)'); gr.addColorStop(1, 'rgba(255,248,230,0)');
        c2.fillStyle = gr; c2.fillRect(0, 0, 32, 32);
        sprite = new THREE.CanvasTexture(cv);
        sprite.colorSpace = THREE.SRGBColorSpace;
      } catch (e) { sprite = null; }
      var m = new THREE.PointsMaterial({
        size: isMobile ? 2.4 : 2.2, sizeAttenuation: false, map: sprite, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: 0xF0D99A
      });
      var stars = new THREE.Points(g, m);
      stars.name = 'stars';
      stars.frustumCulled = false;
      stars.visible = false;
      group.add(stars);
      world.stars = stars;
    })();

    /* ---------- الإضاءة ---------- */
    var hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a6a3a, 0.95 * LIGHT_K);
    var sun = new THREE.DirectionalLight(0xfff1d0, 1.15 * LIGHT_K);
    sun.position.set(12, 22, 8);
    sun.target.position.set(0, 0, -20);
    group.add(hemi); group.add(sun); group.add(sun.target);
    world.lights = { hemi: hemi, sun: sun, scale: LIGHT_K };

    var fog = new THREE.FogExp2(COL.skyDay, 0.018);
    world.fog = fog;
    if (scene) {
      scene.add(group);
      scene.fog = fog;
      if (!scene.background || scene.background.isColor) scene.background = world.skyColor;
    }

    /* ---------- الزمن: السماء والضباب والإضاءة ---------- */
    var cDay = new THREE.Color(COL.skyDay), cSunset = new THREE.Color(COL.skySunset), cNight = new THREE.Color(COL.skyNight);
    var cDusk = new THREE.Color(0x2B3F66);   // محطة وسطى أزرق-بترولي بين المغرب والليل (لا بنفسجي موحل)
    var sunDay = new THREE.Color(0xfff1d0), sunSet = new THREE.Color(0xffb070), sunNight = new THREE.Color(0x8fa6d6);
    var hemiDay = new THREE.Color(0xbfd8ff), hemiSet = new THREE.Color(0xF4D6B6), hemiNight = new THREE.Color(0x4A5C80);
    var groundDay = new THREE.Color(0x8a6a3a), groundSet = new THREE.Color(0x8C7A62), groundNight = new THREE.Color(0x2A3040);
    var lastT = -1;
    world.setTime = function (t) {
      t = clamp(+t || 0, 0, 1);
      if (Math.abs(t - lastT) < 1e-4) return;
      lastT = t;
      var a = smooth(0.55, 0.70, t), b = smooth(0.70, 0.86, t);
      world.nightAmount = b;
      world.skyColor.copy(cDay).lerp(cSunset, a);
      if (b < 0.5) world.skyColor.lerp(cDusk, b * 2);
      else world.skyColor.copy(cDusk).lerp(cNight, (b - 0.5) * 2);
      fog.color.copy(world.skyColor);
      fog.density = 0.018 + (0.006 - 0.018) * b;   /* ليلاً أخف حتى تظهر الواجهة والنخيل خلف بطاقة الدخول */
      if (scene && scene.background && scene.background.isColor) scene.background.copy(world.skyColor);
      sun.intensity = (1.15 + (0.25 - 1.15) * b) * LIGHT_K;
      sun.color.copy(sunDay).lerp(sunSet, a).lerp(sunNight, b);
      hemi.intensity = (0.95 + (0.55 - 0.95) * b) * LIGHT_K;
      hemi.color.copy(hemiDay).lerp(hemiSet, a).lerp(hemiNight, b);
      hemi.groundColor.copy(groundDay).lerp(groundSet, a).lerp(groundNight, b);
      litByName.lamp.mat.emissiveIntensity = 0.45 + 1.3 * b;
      litByName.gold.mat.emissiveIntensity = 0.3 + 0.3 * b;
      var st = smooth(0.75, 0.92, t);
      world.stars.visible = st > 0.001;
      world.stars.material.opacity = st;
      // النوافذ تضيء تلقائياً في آخر الرحلة (المحطة 7 تضيئها تباعاً قبل ذلك)، وتنطفئ عند العودة نهاراً
      var auto = smooth(0.86, 0.96, t);
      for (var i = 0; i < world.windows.length; i++) {
        var w = world.windows[i], wm = w.material;
        if (auto > 0) { if (wm.emissiveIntensity < auto) wm.emissiveIntensity = auto; w.userData.autoLit = true; }
        else if (w.userData.autoLit) { wm.emissiveIntensity = 0; w.userData.autoLit = false; }
      }
    };

    /* ---------- الحركة: العلم والنخلة والطابور وأبواب الخزائن والنوافذ ---------- */
    var flagBase = world.flag.userData.base, flagPos = world.flag.geometry.attributes.position;
    var offBody = new THREE.Matrix4().makeTranslation(0, 0.47, 0), offHead = new THREE.Matrix4().makeTranslation(0, 1.08, 0);
    world.update = function (time, t) {
      time = +time || 0;
      var i, n;
      // تموّج العلم يزيد نحو الطرف الحر
      for (i = 0, n = flagPos.count; i < n; i++) {
        var fx = flagBase[i * 3], u = fx / 1.6;
        flagPos.setY(i, flagBase[i * 3 + 1] + Math.sin(u * 4 + time * 2.4) * 0.03 * u);
        flagPos.setZ(i, Math.sin(u * 6 + time * 3) * 0.12 * u);
      }
      flagPos.needsUpdate = true;
      // تمايل تاج النخلة
      for (i = 0; i < world.palms.length; i++) {
        var p = world.palms[i];
        p.crown.rotation.z = Math.sin(time * 0.8 + p.phase) * 0.02;
        p.crown.rotation.x = Math.cos(time * 0.65 + p.phase) * 0.015;
      }
      // تمايل الطلاب ±1°
      var st = world.students;
      if (st) {
        for (i = 0; i < st.count; i++) {
          var f = st.feet[i], ang = Math.sin(time * 1.3 + st.phases[i]) * 0.017;
          tmpE.set(0, 0, ang); tmpQ.setFromEuler(tmpE);
          tmpM.compose(tmpV.set(f[0], 0, f[1]), tmpQ, ONE);
          st.bodies.setMatrixAt(i, tmpM2.copy(tmpM).multiply(offBody));
          st.heads.setMatrixAt(i, tmpM.multiply(offHead));
        }
        st.bodies.instanceMatrix.needsUpdate = true;
        st.heads.instanceMatrix.needsUpdate = true;
      }
      // أبواب الخزائن: مزامنة المحاور مع النسخ
      var dirty = false;
      for (i = 0; i < world.lockers.length; i++) {
        var L = world.lockers[i];
        if (L.door.rotation.y !== L.lastRot) {
          L.lastRot = L.door.rotation.y;
          L.door.updateMatrix();
          world.lockerDoors.setMatrixAt(i, L.door.matrix);
          dirty = true;
        }
      }
      if (dirty) world.lockerDoors.instanceMatrix.needsUpdate = true;
      if (t != null) world.setTime(t);
    };

    /* ---------- الجودة والتحرير ---------- */
    // عيّنة كائن لكل مادة (نوعه يحدد مفتاح البرنامج: InstancedMesh/instanceColor)
    group.traverse(function (o) {
      var m = o.material; if (!m) return;
      for (var i = 0; i < litDefs.length; i++) if (litDefs[i].mat === m && !litDefs[i].sample) litDefs[i].sample = o;
    });
    // كائنات مؤقتة بمواد التوائم ليترجمها core مسبقاً (تُضاف للمشهد لحظة الترجمة ثم تُزال)
    world.twinObjects = function () {
      var g = new THREE.Group(); g.name = 'materialTwins';
      var any = false;
      for (var i = 0; i < litDefs.length; i++) {
        var d = litDefs[i];
        if (!d.twin || !d.sample) continue;
        var geo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
        if (d.vertexColors) colorize(geo, 0xffffff, 1);
        var o;
        if (d.sample.isInstancedMesh) {
          o = new THREE.InstancedMesh(geo, d.twin, 1);
          tmpM.makeTranslation(0, -60, 0); o.setMatrixAt(0, tmpM);
          if (d.sample.instanceColor) o.setColorAt(0, tmpC.setHex(0xffffff));
        } else {
          o = new THREE.Mesh(geo, d.twin);
          o.position.set(0, -60, 0);
        }
        o.frustumCulled = false;
        g.add(o);
        any = true;
      }
      return any ? g : null;
    };
    world.disposeTwinObjects = function (g) {
      try { g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); } catch (e) {}
    };

    world.setQuality = function (q) {
      var lam = q === 'light' || isMobile;
      for (var i = 0; i < litDefs.length; i++) {
        var d = litDefs[i];
        var isLam = d.mat.isMeshLambertMaterial === true;
        if (isLam === lam) continue;
        var nm = d.twin || d.make(lam);
        nm.emissiveIntensity = d.mat.emissiveIntensity;
        if (d.mat.emissive && nm.emissive) nm.emissive.copy(d.mat.emissive);
        if (d.mat.color && nm.color) nm.color.copy(d.mat.color);
        group.traverse(function (o) { if (o.material === d.mat) o.material = nm; });
        d.twin = d.mat;   // نُبقي الاثنين حيّين (برنامجاهما مترجمان)
        d.mat = nm;
      }
    };

    world.dispose = function () {
      try {
        group.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
          }
        });
        for (var i = 0; i < litDefs.length; i++) { try { if (litDefs[i].twin) litDefs[i].twin.dispose(); } catch (e) {} }
        if (atlasTex) atlasTex.dispose();
        if (group.parent) group.parent.remove(group);
      } catch (e) {}
    };

    world.setTime(0);
    world.update(0);
    return world;
  }
})();
