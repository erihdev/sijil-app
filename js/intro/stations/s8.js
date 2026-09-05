/* سجل المتابعة الرقمي — الجولة السينمائية: المحطة 8 «الليل والدخول»
   الكاميرا معلّقة عالياً خلف المدرسة ليلاً وتنظر فوق السطح نحو البوابة. السماء والنجوم والإضاءة الليلية
   يقودها core عبر world.setTime؛ هنا نضيف فقط ما يهدّئ المشهد: قمر صغير ناعم، توهّج خط الأفق البعيد،
   ضوء النوافذ يتسرّب فوق حافة السطح (نافذةً نافذة من جهة البداية)، وضوء الممر يصعد من الكوّة.
   لا عنوان في #intro-texts لهذه المحطة: بطاقة الدخول هي المشهد. */
(function () {
  'use strict';
  var NS = window.SIJIL_INTRO = window.SIJIL_INTRO || {};
  if (typeof NS.registerStation !== 'function') return;

  var ID = 's8-login', INDEX = 7, WEIGHT = 0.6;
  var POSTER_TITLE = 'ادخل… الحصة تنتظرك';
  var COPY = 'آمن بـ Firebase ويعمل دون اتصال.';
  var PI = Math.PI;
  var GOLD = 0xD7A93F, GOLD_PALE = 0xF0D99A;
  /* مواضع نوافذ الواجهة (x) كما في world.js؛ ضوءها يظهر فوق حافة السطح عند z=−23.6 */
  var WINDOW_X = [-13.5, -10.5, -7.5, -4.5, 4.5, 7.5, 10.5, 13.5];
  var SPILL = { y: 5.05, z: -23.6, w: 3.4, h: 2.6 };
  var MOON = { x: 14, y: 20, z: 12, size: 5.4, lift: 1.2 };
  var SKYLIGHT = { x: 0, y: 4.23, z: -68, w: 2.1, d: 2.5, haloY: 4.9 };
  /* شريط أفق عريض وناعم تحت حافة السطح (لا خط حاد يقطع السماء) */
  var HORIZON = { y: 3.4, z: 128, w: 720, h: 28 };

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function lerp(a, b, t) { return typeof NS.lerp === 'function' ? NS.lerp(a, b, t) : a + (b - a) * t; }
  function ease(n, x) { return typeof NS.ease === 'function' ? NS.ease(n, x) : clamp(x, 0, 1); }
  function seg(p, a, b) { return clamp((p - a) / ((b - a) || 1), 0, 1); }

  /* ---------- مراجع المحطة ---------- */
  var R = {
    built: false, THREE: null, isMobile: false, DIR: -1, world: null,
    moon: null, horizon: null, spill: null, skylight: null, halo: null,
    textures: [], tmpM: null, tmpV: null, tmpS: null, tmpQ: null, tmpC: null
  };

  /* ---------- نسيج canvas ناعم (تدرّج شعاعي أو عمودي) ---------- */
  function makeTexture(THREE, w, h, draw) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var c = cv.getContext('2d');
    if (!c) return null;
    draw(c, w, h);
    var tex = new THREE.CanvasTexture(cv);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    R.textures.push(tex);
    return tex;
  }

  function drawMoon(c, w, h) {
    var r = w / 2;
    var g = c.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(252,248,236,1)');
    g.addColorStop(0.27, 'rgba(250,244,226,1)');
    g.addColorStop(0.31, 'rgba(246,236,206,0.92)');
    g.addColorStop(0.36, 'rgba(240,217,154,0.42)');
    g.addColorStop(0.6, 'rgba(240,217,154,0.12)');
    g.addColorStop(1, 'rgba(240,217,154,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    /* ظلّ خفيف على طرف القرص حتى لا يبدو قرصاً مسطّحاً */
    var s = c.createRadialGradient(r * 1.22, r * 0.86, r * 0.02, r * 1.22, r * 0.86, r * 0.42);
    s.addColorStop(0, 'rgba(120,110,90,0.22)');
    s.addColorStop(1, 'rgba(120,110,90,0)');
    c.fillStyle = s; c.fillRect(0, 0, w, h);
  }

  function drawHalo(c, w, h) {
    var g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }

  /* بقعة ضوء النافذة: بؤرتها في الثلث السفلي (عند حافة السطح) وتخبو صعوداً */
  function drawSpill(c, w, h) {
    var cx = w / 2, cy = h * 0.62;
    var g = c.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.28, 'rgba(255,255,255,0.4)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.09)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }

  /* توهّج الأفق: شفاف من الأعلى، شريط أزرق-بنفسجي عند خط الأفق، ولمسة ذهبية خافتة تحته (أضواء بعيدة) */
  function drawHorizon(c, w, h) {
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(58,90,140,0)');
    g.addColorStop(0.35, 'rgba(58,90,140,0.08)');
    g.addColorStop(0.6, 'rgba(78,110,170,0.3)');
    g.addColorStop(0.78, 'rgba(120,120,130,0.16)');
    g.addColorStop(0.92, 'rgba(215,169,63,0.08)');
    g.addColorStop(1, 'rgba(215,169,63,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }

  /* ---------- نص المحطة في #intro-texts: نتركه فارغاً (البطاقة هي المشهد) ---------- */
  function muteSceneText() {
    try {
      var host = document.getElementById('intro-texts');
      if (!host) return;
      var els = host.querySelectorAll('.scene-text[data-i="' + INDEX + '"]');
      for (var i = 0; i < els.length; i++) {
        var h2 = els[i].querySelector('h2'), p = els[i].querySelector('p');
        if (h2 && h2.textContent) h2.textContent = '';
        if (p && p.textContent) p.textContent = '';
      }
    } catch (e) {}
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
    R.tmpM = new THREE.Matrix4(); R.tmpV = new THREE.Vector3(); R.tmpS = new THREE.Vector3(1, 1, 1);
    R.tmpQ = new THREE.Quaternion(); R.tmpC = new THREE.Color();
    var add = THREE.AdditiveBlending;

    /* القمر: Sprite واحد ناعم على جهة البداية، فوق الأفق بقليل */
    try {
      var moonTex = makeTexture(THREE, 128, 128, drawMoon);
      R.moon = new THREE.Sprite(new THREE.SpriteMaterial({
        map: moonTex, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false
      }));
      R.moon.scale.set(MOON.size, MOON.size, 1);
      R.moon.position.set(R.DIR * MOON.x, MOON.y - MOON.lift, MOON.z);
      R.moon.renderOrder = 2;
      R.moon.visible = false;
      R.moon.name = 's8-moon';
      group.add(R.moon);
      /* هالة ناعمة حول القمر حتى لا يبدو قرصاً مسطحاً */
      var mhTex = makeTexture(THREE, 64, 64, drawHalo);
      R.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: mhTex, color: 0xF0D99A, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false, blending: add
      }));
      R.moonHalo.scale.set(MOON.size * 2.6, MOON.size * 2.6, 1);
      R.moonHalo.position.copy(R.moon.position);
      R.moonHalo.renderOrder = 1;
      R.moonHalo.visible = false;
      R.moonHalo.name = 's8-moonHalo';
      group.add(R.moonHalo);
    } catch (e) { R.moon = null; R.moonHalo = null; }

    /* خط الأفق: شريط عريض بعيد جداً بتدرّج عمودي، بلا ضباب، يواجه الكاميرا (−z) */
    try {
      var hzTex = makeTexture(THREE, 4, 128, drawHorizon);
      R.horizon = new THREE.Mesh(new THREE.PlaneGeometry(HORIZON.w, HORIZON.h), new THREE.MeshBasicMaterial({
        map: hzTex, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false, blending: add
      }));
      R.horizon.position.set(0, HORIZON.y, HORIZON.z);
      R.horizon.rotation.y = PI;
      R.horizon.renderOrder = 1;
      R.horizon.visible = false;
      R.horizon.name = 's8-horizon';
      group.add(R.horizon);
    } catch (e) { R.horizon = null; }

    /* ضوء النوافذ فوق حافة السطح: 8 نسخ في InstancedMesh واحد؛ شدة كل نافذة عبر instanceColor */
    try {
      var spTex = makeTexture(THREE, 64, 64, drawSpill);
      R.spill = new THREE.InstancedMesh(new THREE.PlaneGeometry(SPILL.w, SPILL.h), new THREE.MeshBasicMaterial({
        map: spTex, color: 0xffffff, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: add
      }), WINDOW_X.length);
      R.tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), PI);
      for (var i = 0; i < WINDOW_X.length; i++) {
        R.tmpM.compose(R.tmpV.set(WINDOW_X[i], SPILL.y, SPILL.z), R.tmpQ, R.tmpS.set(1, 1, 1));
        R.spill.setMatrixAt(i, R.tmpM);
        R.spill.setColorAt(i, R.tmpC.setHex(0x000000));
      }
      R.spill.instanceMatrix.needsUpdate = true;
      if (R.spill.instanceColor) { R.spill.instanceColor.setUsage(THREE.DynamicDrawUsage); R.spill.instanceColor.needsUpdate = true; }
      R.spill.frustumCulled = false;
      R.spill.renderOrder = 3;
      R.spill.visible = false;
      R.spill.name = 's8-windowSpill';
      group.add(R.spill);
      /* واجهة للمحطة 7: تضيء البقع نافذةً نافذة من فوق السطح قبل أن تصل المحطة 8 */
      NS.s8Spill = {
        set: function (lits, k) {
          if (!R.spill) return;
          var maxLit = 0, n = WINDOW_X.length, mul = (k == null ? 1 : +k) * 0.62;
          for (var j = 0; j < n; j++) {
            var v = clamp(+(lits && lits[j]) || 0, 0, 1) * mul;
            if (v > maxLit) maxLit = v;
            R.spill.setColorAt(j, R.tmpC.setHex(GOLD_PALE).multiplyScalar(v));
          }
          if (R.spill.instanceColor) R.spill.instanceColor.needsUpdate = true;
          R.spill.visible = maxLit > 0.004;
        }
      };
    } catch (e) { R.spill = null; }

    /* الكوّة: مستوٍ ذهبي مضيء على فتحة السطح + هالة Sprite فوقه */
    try {
      R.skylight = new THREE.Mesh(new THREE.PlaneGeometry(SKYLIGHT.w, SKYLIGHT.d), new THREE.MeshBasicMaterial({
        color: GOLD_PALE, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false, blending: add
      }));
      R.skylight.position.set(SKYLIGHT.x, SKYLIGHT.y, SKYLIGHT.z);
      R.skylight.rotation.x = -PI / 2;
      R.skylight.renderOrder = 3;
      R.skylight.visible = false;
      R.skylight.name = 's8-skylight';
      group.add(R.skylight);
      var haloTex = makeTexture(THREE, 64, 64, drawHalo);
      R.halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTex, color: GOLD, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false, blending: add
      }));
      R.halo.scale.set(5.2, 3.8, 1);
      R.halo.position.set(SKYLIGHT.x, SKYLIGHT.haloY, SKYLIGHT.z);
      R.halo.renderOrder = 4;
      R.halo.visible = false;
      R.halo.name = 's8-skylightHalo';
      group.add(R.halo);
    } catch (e) { R.halo = null; }

    muteSceneText();
    apply(0, ctx);
  }

  /* شدة ضوء النافذة i كما يضبطها العالم (تضيء آخر الرحلة)؛ إن غاب المرجع نعتبرها مضاءة */
  function windowLit(world, i) {
    try {
      var w = world && world.windows && world.windows[i];
      var m = w && w.material;
      if (!m || typeof m.emissiveIntensity !== 'number') return 1;
      return clamp(m.emissiveIntensity, 0, 1);
    } catch (e) { return 1; }
  }

  /* ---------- الحالة من p (دالة صرفة في p والزمن) ----------
     0–.15 استلام: الأفق والقمر يتنفّسان للظهور. .15–.55 نهوض: القمر يرتفع قليلاً، النوافذ تضيء تباعاً،
     ضوء الكوّة يصعد. .55–.75 ذروة: تنفّس هادئ. .75–1 تسليم: كل شيء يخفت قليلاً ويستقر كخلفية للبطاقة. */
  function apply(p, ctx) {
    var time = (ctx && typeof ctx.time === 'number') ? ctx.time : 0;
    var world = (ctx && ctx.world) || R.world;
    var recv = ease('out', seg(p, 0, 0.15));
    var rise = ease('inOut', seg(p, 0.15, 0.55));
    var peak = ease('inOut', seg(p, 0.5, 0.62)) * (1 - ease('inOut', seg(p, 0.72, 0.9)));
    var calm = 1 - 0.28 * ease('inOut', seg(p, 0.75, 1));
    var v, i;

    if (R.moon) {
      v = recv * lerp(0.82, 1, rise) * lerp(1, 0.92, seg(p, 0.75, 1));
      R.moon.material.opacity = v;
      R.moon.visible = v > 0.004;
      R.moon.position.y = MOON.y - MOON.lift * (1 - ease('out', seg(p, 0, 0.4)));
      var ms = MOON.size * (1 + 0.025 * peak * Math.sin(time * 0.9));
      R.moon.scale.set(ms, ms, 1);
      if (R.moonHalo) {
        R.moonHalo.position.copy(R.moon.position);
        R.moonHalo.material.opacity = 0.35 * v;
        R.moonHalo.visible = R.moon.visible;
      }
    }

    if (R.horizon) {
      v = 0.9 * recv * calm;
      R.horizon.material.opacity = v;
      R.horizon.visible = v > 0.004;
    }

    if (R.spill) {
      var n = WINDOW_X.length, maxLit = 0;
      for (i = 0; i < n; i++) {
        /* جهة البداية (يمين الشاشة = −x) تضيء أولاً */
        var order = R.DIR < 0 ? i : (n - 1 - i);
        var a = 0.15 + order * (0.3 / Math.max(n - 1, 1));
        var lit = ease('out', seg(p, a, a + 0.1)) * windowLit(world, i) * calm;
        lit *= 0.62 + 0.06 * Math.sin(time * 1.7 + i * 1.3) * peak;
        if (lit > maxLit) maxLit = lit;
        R.spill.setColorAt(i, R.tmpC.setHex(GOLD_PALE).multiplyScalar(lit));
      }
      if (R.spill.instanceColor) R.spill.instanceColor.needsUpdate = true;
      R.spill.visible = maxLit > 0.004;
    }

    if (R.skylight) {
      var sk = ease('out', seg(p, 0.2, 0.5)) * calm * (0.92 + 0.08 * Math.sin(time * 2.2) * peak);
      R.skylight.material.opacity = 0.55 * sk;
      R.skylight.visible = sk > 0.004;
      if (R.halo) {
        R.halo.material.opacity = 0.45 * sk;
        R.halo.visible = sk > 0.004;
      }
    }
  }

  function update(p, ctx) {
    p = clamp(+p || 0, 0, 1);
    try { apply(p, ctx); } catch (e) {}
  }

  function load(ctx) {
    muteSceneText();
  }

  function unload(ctx) {
    /* لا نسيج كبير هنا (canvas 4×128 و64×64 و128×128)؛ core يحرّر كل شيء عند الإنهاء */
  }

  function setQuality(q, ctx) {
    /* عناصر المحطة كلها خفيفة (5 رسمات، بلا ظلال ولا نسيج ثقيل)؛ لا تغيير حسب الجودة */
  }

  NS.registerStation({
    id: ID,
    index: INDEX,
    weight: WEIGHT,
    text: { headline: '', copy: COPY },
    /* النظر نحو الفناء والبوابة المضاءة (لا بلاطة السطح)، وزاوية أوسع على المكتب في هذه المحطة فقط */
    cam: [
      { t: 0.0, pos: [0, 14, -82], look: [0, 3.5, -26] }
    ],
    fovDesktop: 50,
    build: build,
    load: load,
    unload: unload,
    update: update,
    setQuality: setQuality,
    posterTitle: POSTER_TITLE
  });
})();
