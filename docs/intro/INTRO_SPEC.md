# عقد بناء الجولة السينمائية «الطيران داخل المدرسة» — سجل المتابعة الرقمي

هذا الملف هو المرجع الوحيد الملزم لكل من يبني جزءاً من الجولة. أي قرار غير مذكور هنا يُتخذ بما لا يخالفه. اللغة المعروضة للمستخدم عربية فصيحة قصيرة، والكود بالإنجليزية.

الموقع: GitHub Pages بلا أدوات بناء. المستودع المحلي: `C:\Users\denin\AppData\Local\Temp\claude\sijil-app`.
المرجع السردي للمحطات (نص الاتجاه الفائز): `C:\Users\denin\AppData\Local\Temp\claude\C--Users-denin-OneDrive-Desktop--------------------\aee7c1cb-0022-4c34-809a-91c6505f75d5\scratchpad\cinema\fly_direction.json` (المفتاح `scenes[]`، ولكل محطة `scroll_choreography` و`three_elements` و`mobile`).

## 1. الهوية

- الألوان: كحلي الليل `#071322`، كحلي الهوية `#0E2033`، ذهبي `#D7A93F`، ذهبي شاحب `#F0D99A`، سماوي `#9FC4E8`، كريمي `#F8F5EF`.
- مواد المدرسة (hex): جدران كريمي `#E9DCC4`، إفريز `#CDBB99`، أرض الفناء رملي `#C9B99A`، أرض الممر `#DCD3C0`، أرض الفصل `#B9A37E`، مقاعد `#C9A46A`، خزائن `#4F7FC7`، سبورة `#0F2B1F` بإطار ذهبي، جذع النخلة `#8B5A2B`، سعف `#2F8F5B`، علم أخضر `#006C35`، سماء النهار `#9FC4E8`، سماء المغرب `#E8A46B`، سماء الليل `#071322`.
- الخطوط: العناوين Changa 700/800، النص Tajawal (موجود أصلاً في index.html). طلب Google Fonts واحد يضم الاثنين.
- الأرقام المعروضة للمستخدم بأرقام عربية-هندية: `n.toLocaleString('ar-EG')`.

## 2. القرارات الثابتة (لا تُناقش)

1. `index.html` يبقى صفحة الدخول. تُدرج الجولة قبل `<section id="view-login">` مباشرة: `<div id="intro">` (ثابت: `canvas#intro-gl` + `#intro-ui`) ثم `<div id="intro-track">` (شريط التمرير في التدفق). قسم الدخول يبقى قسماً عادياً في التدفق بعد الشريط، ولا يُنقل ولا تُغيَّر معرّفات عناصره (`#lg-teacher #lg-pin #lg-btn #lg-err #lg-demo #lg-school`) ولا ترتيبها.
2. لا `pin` إطلاقاً. `#intro` بـ `position:fixed; inset:0`، و`ScrollTrigger` واحد على `#intro-track` بـ `scrub:0.8`.
3. لا يوجد أي عنصر في سلسلة أسلاف `#lg-pin` عليه `transform` أو `perspective` أو `filter` بعد وصول البطاقة. حركة وصول البطاقة: `translateY` + `opacity` فقط عبر فئة `.is-arriving` تُزال عند الاكتمال.
4. المكتبات من cdnjs فقط، UMD، بهذا الترتيب: `three.js/0.160.0/three.min.js` → `gsap/3.12.5/gsap.min.js` → `gsap/3.12.5/ScrollTrigger.min.js` → `gsap/3.12.5/ScrollToPlugin.min.js` → ملفات الجولة. لا importmap، لا ES modules، لا Lenis، لا examples/jsm.
5. القرار عند التحميل (سكربت مضمّن في `<head>` ≤ 1.5KB، مصدره `js/intro-boot.js`):
   - `localStorage.getItem('sijil.intro.seen')==='1'` أو `DB session` محفوظة (`localStorage['sijil.db']` تحوي `"session":"t`) → **skip**: لا مكتبات، `#view-login` يظهر فوراً مع زر `#intro-replay` «شاهد الجولة 🎬».
   - `prefers-reduced-motion: reduce` أو لا WebGL أو `navigator.connection.saveData` أو `navigator.deviceMemory<=2` → **posters**: طبقة `#intro-posters` (8 أقسام HTML: ملصق webp + عنوان + نص) بلا مكتبات.
   - غير ذلك → **full**: `body.has-intro` وتحميل المكتبات بالتسلسل ثم `SIJIL_INTRO.start()`.
   - زر «دخول» الثابت في `#intro-bar` يظهر خلال ≤1.4s بـ CSS فقط ويعمل كرابط `#view-login` قبل أي مكتبة؛ بعد gsap يصير `scrollTo` ناعماً مع علم `fastJump` يمنع تشغيل الفيديو.
6. الجوال أولاً: DPR ≤ 1.5 على الجوال و≤ 2 على المكتب؛ لا ظلال؛ لا post-processing؛ لا `backdrop-filter` داخل `#intro` على الجوال؛ ≤ 25k مثلث مكتب و≤ 15k جوال في أي لحظة؛ ≤ 90 draw calls مكتب و≤ 60 جوال.
7. مسار كاميرا واحد للمكتب والجوال؛ الاختلاف فقط في `fov` (45 مكتب، 62 جوال عمودي) وارتفاع الكاميرا (+0.4 على الجوال).
8. الفيديو: `<video muted playsinline loop preload="none">`، فيديو واحد نشط في أي لحظة، ولا يُطلب قبل دخول نطاق التحميل المسبق (محطة ±1)، ولا شيء في السرد يعتمد على أحداث الفيديو. إن لم يتوفر الملف تُعرض صورة الملصق أو الوضع الإجرائي (procedural) تلقائياً. ملفات الفيديو غير موجودة الآن (بانتظار رصيد Seedance) — كل شاشة تعمل بالوضع الإجرائي.
9. الرسم عند الطلب: تُرسم اللقطة فقط إذا تغيّر التمرير أو الميل أو كان فيديو يعمل أو مرّ 250ms، وتتوقف الحلقة عند إخفاء التبويب وبعد الدخول.
10. مراقب تكيّفي: يقيس FPS أول ثانيتين وباستمرار؛ < 45fps لثانيتين → DPR −0.25 (حتى 1) وتنصيف الجزيئات؛ < 30fps لثانيتين → «وضع خفيف» (`quality='light'`: بلا جزيئات، الشاشات ملصقات، المواد Lambert).
11. RTL: `html[dir=rtl]` كما هو. ثابت `DIR = -1` يُضرب في إحداثيات x «جهة البداية» عند الحاجة (المسارات الأفقية التي «تبدأ من اليمين»). CSS يستخدم `inset-inline-start/end`.
12. الشاشات داخل العالم تعرض لقطات الوضع التجريبي فقط من `assets/intro/ui/*.webp` (أسماء وهمية). لا اسم طالب حقيقي في أي أصل.
13. الإنهاء عند الدخول: `MutationObserver` على `class` لـ `#view-login`؛ عند إضافة `hidden`: إن كان `userClicked` (مستمع capture على `#lg-btn`) يُعرض الختم `#intro-stamp` ≤ 900ms ثم الإنهاء، وإلا الإنهاء فوراً. الإنهاء: إيقاف rAF، `ScrollTrigger.killAll()`، `renderer.dispose()` + dispose لكل النسيج والهندسة، إفراغ `src` لكل فيديو، إزالة `#intro` و`#intro-track` و`#intro-stamp`، `body.classList.remove('has-intro')`، `window.scrollTo(0,0)`، `localStorage.setItem('sijil.intro.seen','1')`.
14. `app.js` و`css/app.css` لا يُعدَّلان. `index.html` يُعدَّل بالإضافة فقط (وإضافة `<link>` لـ `css/intro.css` ورفع `?v=` إلى 37 لكل الملفات).

## 3. الملفات والوحدات

| الملف | المالك | يصدّر (على `window.SIJIL_INTRO`) |
|---|---|---|
| `js/intro-boot.js` + نسخته المضمّنة في `<head>` | framework-boot | قرار skip/posters/full، تحميل المكتبات، `#intro-bar` |
| `css/intro.css` | framework-boot | كل قواعد الجولة تحت `body.has-intro` أو `#intro*` |
| `index.html` (إضافات فقط) | framework-boot | البنية أدناه |
| `js/intro/core.js` | framework-core | `SIJIL_INTRO.registerStation`, `start`, `state`, `ctx`, `ease`, `lerp`, `clamp`, `remap`, `setQuality` |
| `js/intro/media.js` | framework-media | `SIJIL_INTRO.media`: `texture(url)`, `ui(name)`, `atlas()`, `atlasUV(i)`, `canvasTexture(w,h,draw)`, `screen(opts)` |
| `js/intro/ui.js` | framework-media | `SIJIL_INTRO.ui`: `mountTexts`, `setActive(i,p)`, `counter`, `bar`, `hint`, `stamp`, `finish`, `posters` |
| `js/intro/world.js` | world | `SIJIL_INTRO.world = buildWorld(ctx)` → مراجع مسمّاة (القسم 5) |
| `js/intro/stations/s1.js` … `s8.js` | station-N | `SIJIL_INTRO.registerStation({...})` |
| `assets/intro/ui/*.webp` | جاهز | 14 لقطة (today, reg, grades, rep, more, live-roster, live-wheel, live-wheel-spun, live-games, live-quiz, live-timer, admin-today, admin-rep, admin-more) بحجم 780×1386 (الجوال) و1640×1120 (admin) |
| `assets/intro/lessons-atlas.webp`, `-m.webp`, `.json` | جاهز | 8×6 خلايا (256px مكتب / 128px جوال)، 48 صورة درس حقيقية |
| `assets/intro/posters/s1..s8.webp` | integration | لقطات المحطات للفولباك (تُلتقط بعد البناء بـ Playwright) |
| `assets/intro/video/*.mp4` | لاحقاً | غير موجودة الآن |

بنية `index.html` المطلوبة (تُدرج قبل `<section id="view-login">`):

```html
<div id="intro" hidden>
  <canvas id="intro-gl"></canvas>
  <div id="intro-ui">
    <div id="intro-texts"></div>          <!-- .scene-text لكل محطة، تُبنى من ui.mountTexts -->
    <div id="intro-counter" hidden></div>  <!-- العدّادات الكبيرة (٧٨٢) -->
    <div id="intro-hint">مرّر</div>
  </div>
</div>
<div id="intro-track" hidden></div>
<div id="intro-bar" hidden><span class="brand">سجل المتابعة الرقمي</span><a class="enter" href="#view-login">دخول</a></div>
<div id="intro-posters" hidden></div>
<div id="intro-stamp" hidden><div class="seal"><svg …نجمة ثمانية…></svg><b>سُجِّل</b></div></div>
```
وداخل `#view-login` بعد `.login-foot`: `<button id="intro-replay" class="btn-ghost" hidden>🎬 شاهد الجولة</button>` (يزيل المفتاح ويعيد التحميل).

## 4. واجهة المحطة (core.js) — ملزمة حرفياً

```js
// كل ملف محطة يستدعي:
SIJIL_INTRO.registerStation({
  id: 's3',                       // 's1'..'s8'
  index: 2,                       // 0..7
  weight: 1.15,                   // حصة المحطة من شريط التمرير
  text: { headline: 'حصة حيّة لا ينام فيها أحد', copy: '…' },  // ≤ 6 كلمات للعنوان
  cam: [                          // نقاط الكاميرا داخل المحطة، t محلي 0..1 (≥ نقطة واحدة)
    { t: 0.0, pos: [-6.5, 1.9, -36], look: [-11.9, 2.2, -36] },
  ],
  build(ctx) { /* أنشئ الكائنات وأضفها إلى this.group (THREE.Group جاهزة من core) */ },
  load(ctx) { /* تحميل النسيج/الفيديو عند الاقتراب (محطة ±1) — اختياري */ },
  unload(ctx) { /* تحرير الموارد الثقيلة عند الابتعاد — اختياري */ },
  update(p, ctx) { /* يُستدعى كل إطار نشط بـ p محلي 0..1 (مرحلة: 0–.15 استلام، .15–.55 نهوض، .55–.75 ذروة، .75–1 تسليم) */ },
  posterTitle: '…', // للفولباك
});
```
- `ctx = { THREE, scene, camera, renderer, world, media, ui, isMobile, quality /* 'high'|'mid'|'light' */, DIR, dpr, time /* ثوانٍ */, velocity /* سرعة التمرير المخمّدة -1..1 */, tilt /* {x,y} -1..1 */, state }`.
- core ينشئ `station.group = new THREE.Group()` باسم id ويضيفه للمشهد قبل `build`، ويضبط `group.visible` = المحطة النشطة ±1 فقط.
- `SIJIL_INTRO.ease(name, x)` يدعم `'out'|'in'|'inOut'|'back'|'expo'` (تنفيذ داخلي بسيط، لا يعتمد على gsap). `lerp(a,b,t)`, `clamp(x,a,b)`, `remap(x,a,b,c,d)`.
- الكاميرا: core يجمع نقاط `cam` من كل المحطات مرتبةً ويبني `CatmullRomCurve3(points,false,'centripetal')` مع `tGlobal` لكل نقطة؛ `camera.position` تُنعَّم بـ `lerp 0.12` و`lookAt` بـ `lerp 0.08`؛ على الجوال `pos.y += 0.4` و`fov=62`.
- `SIJIL_INTRO.state = { t, i, p, fps, dpr, tris, calls, quality, fastJump }`؛ `?debug=1` يعرض HUD صغيراً؛ `?station=3&p=0.5` يقفز مباشرة (للاختبار)؛ `?intro=1` يفرض full حتى مع المفتاح.
- core يستدعي `ui.setActive(i, p)` كل إطار نشط، و`media.tick()`.

## 5. مخطط العالم (world.js) — الإحداثيات ملزمة

الوحدة متر. `y` للأعلى. الكاميرا تبدأ أمام البوابة على `+z` وتتقدم نحو `−z`.

| المكان | الموضع | التفاصيل |
|---|---|---|
| السور والبوابة | جدار على `z=0` من `x=−14..14`، ارتفاع 3، سمك 0.4، فتحة البوابة `x∈[−2,2]` بقوس (BoxGeometry مقطّع + قوس من `CylinderGeometry` نصف) | إفريز علوي `#CDBB99` 0.25، عمودان جانبيان للبوابة ارتفاع 4.2 |
| لوحة LED فوق البوابة | `PlaneGeometry(6, 3.375)` مركزها `(0, 5.2, 0.25)`، وجهها نحو `+z` | إطار كحلي سمك 0.15 حولها؛ هذه شاشة الافتتاح `world.led` (تُعطى للمحطة 1) |
| النخلة | جذع `CylinderGeometry(0.18,0.28,5,7)` عند `(9,0,1.5)`، 7 سعفات `PlaneGeometry(2.6,0.5)` مقوّسة بـ `rotation` شعاعية عند القمة، لون `#2F8F5B`، وجهان | نخلة ثانية عند `(−10,0,1.2)` |
| سارية العلم | `CylinderGeometry(0.05,0.06,7,6)` عند `(−5,0,−5)`، علم `PlaneGeometry(1.6,1.0,12,1)` أخضر `#006C35` بتموّج vertex بسيط (يحرّكه world.update(time)) | `world.flag` |
| الفناء | أرض `PlaneGeometry(40,26)` عند `y=0` مركزها `(0,0,−13)` رملي `#C9B99A`، مسار مبلّط بلاطات 1×1 كحلية/كريمية على شكل مسار من البوابة للمبنى (InstancedMesh ≤ 80) | صفوف الطابور: 30 طالباً = `InstancedMesh` واحد لجسم `CapsuleGeometry(0.22,0.5,4,8)` أبيض `#F8F5EF` + `InstancedMesh` للرأس `SphereGeometry(0.16,8,6)` بلون `#E0B48F`، مواضع 5 صفوف × 6 في `x∈[−5,5]`، `z∈[−8,−16]`؛ `world.students = {bodies, heads, count:30}` |
| المقاعد الخارجية | 6 مقاعد `BoxGeometry(1.6,0.45,0.5)` `#C9A46A` قرب الفناء `z=−18..−20` | `world.benches[]` (تضيء في المحطة 2 عبر `material.emissive`) |
| واجهة المبنى | جدار `z=−24` من `x=−16..16`، ارتفاع 4.2، كريمي؛ باب `x∈[−1.5,1.5]`؛ 8 نوافذ `PlaneGeometry(1.4,1.1)` عند `y=2.4` بمادة `MeshBasicMaterial` كحلية داكنة وحقل `emissive` مستقل | `world.windows[]` (تضيء تباعاً في المحطة 7) |
| الممر | من `z=−26` إلى `z=−70`، عرض 8 (`x∈[−4,4]`)، ارتفاع 4؛ أرض `#DCD3C0`، سقف كريمي، جداران؛ مصابيح سقفية 8 `BoxGeometry(1.2,0.08,0.3)` emissive | `world.corridor = {floor, ceiling, wallL, wallR}` |
| الفصل | على اليسار: فتحة في الجدار الأيسر `z∈[−31,−41]`؛ غرفة `x∈[−12,−4]`، `z∈[−30,−42]`؛ أرض `#B9A37E`؛ 12 مقعداً `BoxGeometry(0.9,0.75,0.6)` `#C9A46A` في 4×3؛ سبورة `PlaneGeometry(4,2.25)` على الجدار `x=−11.9` مركزها `(−11.9, 2.2, −36)` وجهها نحو `+x` بإطار ذهبي | `world.classroom = {board, desks[], floor}`; السبورة شاشة المحطة 3 |
| جدار الدروس | الجدار الأيمن للممر `x=+3.95` من `z=−44..−56`، وجهه نحو `−x`: 24 لوحاً `PlaneGeometry(1,1)` (InstancedMesh واحد بمادة الأطلس، UV لكل نسخة عبر `instanceUV` attribute أو 24 mesh تشترك في geometry مع `geometry.clone()` وإزاحة UV) في شبكة 6×4 من `y=0.6..3.6`، + 782 بلاطة صغيرة `PlaneGeometry(0.22,0.22)` InstancedMesh بألوان المواد (11 لوناً) خلفها | `world.lessonsWall = {big, tiles, origin:[3.95, 2.1, −50]}` (المحطة 4) |
| النافذة | الجدار الأيسر `x=−3.95` عند `z∈[−56,−60]`: `PlaneGeometry(4,2.6)` مركزها `(−3.95, 2.0, −58)` وجهها نحو `+x`، بإطار كريمي | `world.window` شاشة المحطة 5 |
| الخزائن | الجدار الأيمن `x=+3.9` من `z=−60..−68`: 10 خزائن `BoxGeometry(0.7,1.8,0.45)` `#4F7FC7` مع باب منفصل `BoxGeometry(0.66,1.74,0.04)` محوره على الحافة (Group لكل باب) | `world.lockers[] = {body, door}` (المحطة 6 تفتح `lockers[4]`) |
| الكوّة والسطح | نهاية الممر `z=−70` جدار بكوّة سقفية `2×2` عند `(0,4,−68)`؛ سطح المبنى `PlaneGeometry(36,50)` عند `y=4.2` مركزه `(0,4.2,−47)` كريمي مع حواف؛ لوح المدير `PlaneGeometry(4,2.25)` عند `(0, 9.5, −52)` وجهه نحو `−z` | `world.roof`, `world.adminBoard` (المحطة 7) |
| السماء والنجوم | `scene.background = Color` تُلَرَّب: نهار `#9FC4E8` (t<0.55) → مغرب `#E8A46B` (0.55–0.8) → ليل `#071322` (>0.8)؛ الضباب `FogExp2` بنفس اللون كثافة 0.018 نهاراً و0.012 ليلاً؛ نجوم `Points` 600 (300 جوال) نصف قطر 120 تظهر بعد t>0.75 | `world.setTime(t)` تُستدعى من core كل إطار |
| الإضاءة | `HemisphereLight(0xbfd8ff, 0x8a6a3a, 0.95)` + `DirectionalLight(0xfff1d0, 1.15)` عند `(12,22,8)` بلا ظلال؛ ليلاً تخفت الشمس إلى 0.25 وتضيء مصابيح الممر والنوافذ | `world.lights` |

- المواد: `MeshLambertMaterial` (جوال) / `MeshStandardMaterial` (مكتب) بألوان hex أعلاه، بلا نسيج إلا الشاشات والأطلس. مواد مشتركة قدر الإمكان؛ `InstancedMesh` لكل ما يتكرر.
- الميزانية: العالم كله ≤ 12k مثلث و≤ 40 draw calls. الأرض والجدران `BoxGeometry` بسيطة (لا subdivisions).
- `world.update(time, t)` تحرّك العلم والنخلة قليلاً؛ `world.setTime(t)` للسماء والإضاءة.

## 6. الكاميرا والمحطات

| # | id | الوزن | الكاميرا (نقاط داخل المحطة) | الفكرة (من fly_direction.json) |
|---|---|---|---|---|
| 1 | s1-gate | 1.0 | t0: pos `(0,3.6,3.2)` look `(0,5.2,0)` (اللوحة تملأ الشاشة) → t1: pos `(0,4.8,22)` look `(0,2.6,−2)` | الكشف: اللوحة ثم البوابة كاملة، طيور/جزيئات ذهبية |
| 2 | s2-desk | 1.0 | pos `(5,2.4,−8)` look `(0,1.2,−14)` | الطابور والمقاعد تضيء مع التحضير؛ لوح جوال `ui('reg')` يطفو قرب الكاميرا |
| 3 | s3-board | 1.15 | pos `(−6.5,1.9,−36)` look `(−11.9,2.2,−36)` | العجلة تخرج من السبورة (`ui('live-wheel-spun')` على الشاشة + قرص ثلاثي يدور)، بطاقات الألعاب السبع |
| 4 | s4-library | 1.15 | t0: pos `(0,1.8,−45)` look `(3.9,2.1,−49)` → t1: pos `(0,1.8,−55)` look `(3.9,2.1,−56)` | الدولي على جدار الدروس، 3 «بلاطات بطلة» تطير للكاميرا، عدّاد ٠→٧٨٢، 11 شريط مادة |
| 5 | s5-window | 1.1 | pos `(0.5,1.8,−58)` look `(−3.9,2,−58)` | ورقة عمل تُطوى إلى طائرات ورقية تخرج من النافذة وتعود علامات ✓، فقاعة واتساب، شريط الأخطاء |
| 6 | s6-lockers | 1.1 | pos `(0.3,1.7,−63)` look `(3.9,1.6,−64)` | خزانة تُفتح على ملف الطالب (`ui('grades')` أو canvas) و11 شريط تقدّم |
| 7 | s7-roof | 1.2 | t0: pos `(0,3,−67)` look `(0,4,−68)` → t1: pos `(0,12,−66)` look `(0,2,−30)` | الصعود عبر الكوّة، الغروب، النوافذ تضيء، لوح المدير (`ui('admin-more')` + أعمدة مستويات) |
| 8 | s8-login | 0.6 | pos `(0,14,−82)` look `(0,3,−40)` | ليل ونجوم فوق المدرسة؛ خلفية بطاقة الدخول؛ الجزيئات تتباطأ |

- ارتفاع الشريط: `sum(weights) × 180svh` مكتب و`× 160svh` جوال (محسوب مرة واحدة؛ `ScrollTrigger.config({ignoreMobileResize:true})`).
- `#view-login` يأتي بعد الشريط مباشرة؛ ScrollTrigger صغير ثانٍ (`start:'top 85%'`, `end:'top 20%'`, `scrub:0.6`) يحرّك `.login-card` بـ `translateY(40px→0)` و`opacity` فقط، ثم يزيل `.is-arriving`.
- زر «دخول» الثابت يختفي حين يكون `#view-login` مرئياً ≥ 50%.

## 7. الشاشات داخل العالم (media.screen)

```js
const scr = SIJIL_INTRO.media.screen({
  width: 6, height: 3.375,
  poster: 'assets/intro/ui/live-wheel-spun.webp' | null,   // نسيج ثابت
  video: 'assets/intro/video/sd-board.mp4' | null,         // إن وُجد (غير موجود الآن)
  procedural: (ctx2d, w, h, time, p) => { … }              // رسم canvas 512×288 يُحدَّث ≤ 12 مرة/ثانية عندما لا فيديو
  frame: 'gold' | 'navy' | 'none',
});
scr.mesh  // أضفه للمجموعة
scr.enter(); scr.leave();   // تشغيل/إيقاف الفيديو وفق قاعدة «فيديو واحد نشط»
scr.setProgress(p)          // للفتح/القناع إن لزم
```
- الشادر: قناع فتح `uOpen` (0..1) بحافة ذهبية رفيعة، `uMode` 0 فيديو / 1 ملصق / 2 إجرائي.
- `media.ui(name)` تُرجع `THREE.Texture` من `assets/intro/ui/{name}.webp` بـ `colorSpace = SRGBColorSpace`، `minFilter = LinearFilter`، بلا mipmaps، ومخبّأة.
- `media.canvasTexture(w,h,draw)` تُرجع `{texture, redraw()}` مع dirty-flag؛ النص العربي على canvas بـ `ctx.direction='rtl'`, `textAlign='right'`, خط `'700 28px Tajawal'` بعد `document.fonts.ready`.

## 8. النصوص المعروضة (ui.js)

- `.scene-text` لكل محطة: `h2` (Changa 800، `clamp(28px, 6vw, 56px)`) و`p` (Tajawal 500، ≤ 2 سطر على الجوال)، في الثلث العلوي على الجوال وعلى الجانب الأيمن (البداية) على المكتب، `pointer-events:none`. الظهور: `opacity` و`translateY(24px)` عكس اتجاه التمرير، فعّال بين `p∈[0.1, 0.85]`.
- `#intro-counter`: رقم كبير Changa 800 `clamp(56px,14vw,120px)` ذهبي شاحب مع 11 شريط مادة تحته (`ui.counter.show(n, bars)`).
- `#intro-hint`: خط ذهبي عمودي 36px ينبض + «مرّر»، يختفي بعد 3% تمرير.
- `#intro-bar`: اسم المنتج يمين، زر «دخول» ذهبي 40px يسار (RTL طبيعي)، خلفية `rgba(14,32,51,.72)` بلا backdrop-filter على الجوال.
- الختم: دائرة 120px ذهبية بنجمة ثمانية وكلمة «سُجِّل» Changa: `scale 1.6→0.92→1`, `rotate −12°→0` خلال 450ms + 12 رذاذة CSS + `navigator.vibrate(8)` إن دُعم، ثم fade 200ms؛ الإجمالي ≤ 900ms.
- الملصقات: `ui.posters(list)` تبني 8 أقسام في `#intro-posters` من `assets/intro/posters/sN.webp` (إن غاب الملف تُعرض خلفية كحلية متدرجة بدلاً منه).

## 9. الاختبار المحلي

- خادم: `python -m http.server <port> --directory C:\Users\denin\AppData\Local\Temp\claude\sijil-app` (استخدم منفذاً فريداً 8800+N لكل عامل، وأوقفه بعد الانتهاء).
- Playwright (Python) مثبت: `from playwright.sync_api import sync_playwright`. افتح `http://127.0.0.1:<port>/index.html?demo&intro=1&debug=1` (demo = وضع تجريبي بلا Firebase؛ intro=1 يفرض الجولة). للقفز لمحطة: `&station=3&p=0.5`.
- تحقق دائماً: لا أخطاء في console، `SIJIL_INTRO.state.tris` و`calls` ضمن الميزانية، لقطة شاشة للمحطة على 1200×800 و390×800.
- الدخول التجريبي: اختر أي معلم من `#lg-teacher` + رقم `1234` في `#lg-pin` ثم `#lg-btn`؛ بعدها يجب أن يظهر `#view-app` ويختفي كل ما يخص الجولة من DOM.

## 10. الجودة البصرية (ليس low-poly رخيصاً)

- إضاءة نصف كروية دافئة + شمس واحدة، ضباب يذيب البعيد، ألوان مكتومة (لا ألوان مشبعة إلا الذهب والعلم).
- تفاصيل قرب الكاميرا: إفريز، أعمدة البوابة، إطار اللوحة، سعف النخلة بوجهين، بلاط المسار، مصابيح الممر emissive، إطار السبورة، مقابض الخزائن (أسطوانات صغيرة).
- لا حواف حادة سوداء: لا `EdgesGeometry`. لا نسيج ضوضاء. لا حركة عشوائية على العناصر الثابتة.
- الجزيئات الذهبية (`Points` 1200 مكتب / 400 جوال، سبرايت دائري ناعم، additive) تنساب بسرعة تتناسب مع `velocity`.

## 11. مراجع غير ملزمة في الإحداثيات، ملزمة في الحرفة

- `docs/intro/spec_fly.json`: المواصفة النهائية من المخرج الفني (world_build بـ17 عنصراً مع ملاحظات الجمال لكل عنصر، seedance_clips ببرومبتاتها، acceptance). عند تعارض الإحداثيات أو أسماء الملفات مع هذا الملف، هذا الملف (INTRO_SPEC.md) يغلب. لكن ملاحظات «كيف يبدو جميلاً لا رخيصاً» في `world_build[].notes` ملزمة لبانِي العالم بقدر الإمكان (مثلاً: جذع النخلة من أسطوانات متدرجة بميل تراكمي وعُقد، تاج البوابة، أعمدة السور بأغطية ذهبية، بلاط الفناء بخطوط، مقاعد بأرجل، مقابض الخزائن).
- `docs/intro/fly_direction.json`: السرد الأصلي للمحطات (`scenes[]`).
