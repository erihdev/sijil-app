# مواصفة ميزة نقل الطلاب (بين الفصول / خارج المدرسة) — سجلي

## الهدف
المدير من لوحة الإدارة يرى كل فصل وطلابه، وبجانب كل طالب: «نقل إلى فصل آخر» أو «خروج من المدرسة». عند النقل تنتقل كل بيانات الطالب (الرصد اليومي، الدرجات، سجل التواصل) إلى الفصل الجديد وتندمج مع ترتيبه الجديد بأرقامه الحقيقية، ويختفي من الفصل القديم في كل الشاشات، وينعكس ذلك على بقية أجهزة المعلمين عند فتح التطبيق.

## القيود المعمارية (ثابتة)
- بيانات الفصول الأساسية `classes/{cid}` مقروءة فقط (تُزرع بالسكربت) ولا تُعدَّل من العميل.
- الطلاب مُعرَّفون بفهرسهم `si` داخل مصفوفة `students` في كل فصل، وكل بيانات المعلمين مفهرسة بهذا الفهرس: `recs/{tid}_{cid}.d[date][si]`, `grades/{tid}_{cid}.g[si]`, `comms/{tid}_{cid}.c[].si`, `subs/{assign}_{si}`. لذلك **لا يُحذف الطالب من مصفوفة فصله القديم أبداً** (كي لا تنزاح فهارس زملائه)، بل يُعلَّم `moved` ويُخفى.
- المصادقة مجهولة؛ لا يمكن للقواعد التحقق من هوية المدير. الحل: مجموعة `moves` قابلة للإنشاء فقط (لا تعديل ولا حذف) بشكل مقيَّد، وكل العملاء يشتقون الفصول الفعلية = الأساسية + تطبيق `moves` بالترتيب الزمني.

## نموذج البيانات
`moves/{id}` — id: `^[a-z0-9]{4,12}$` (استخدم `shortId()` الموجود):
```json
{ "from": "c4a", "si": 7, "to": "c4b" | "out", "name": "اسم الطالب", "newSi": 21, "tn": "اسم المدير", "ts": 1725600000000 }
```
- `newSi` = فهرس الطالب في الفصل الجديد وقت النقل (طول مصفوفة الطلاب الفعلية للفصل الهدف قبل الإضافة، بعد تطبيق الحركات السابقة).
- قاعدة Firestore (تُضاف إلى `scratchpad/fbdeploy/firestore.rules` والنسخة في مجلد المشروع، وتُنشر بـ `firebase deploy --only firestore:rules --project sijil-app-de556 --account erihdev@gmail.com --non-interactive` من مجلد fbdeploy):
```
    // ── حركات نقل الطلاب: إنشاء فقط، تُطبَّق على الفصول عند كل تحميل ──
    match /moves/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && id.matches('^[a-z0-9]{4,12}$') && stamped()
          && request.resource.data.from is string && request.resource.data.to is string
          && request.resource.data.si is int && request.resource.data.si >= 0 && request.resource.data.si < 200
          && request.resource.data.newSi is int && request.resource.data.newSi >= 0 && request.resource.data.newSi < 400
          && request.resource.data.name is string && request.resource.data.name.size() <= 120
          && request.resource.data.keys().hasOnly(['from', 'si', 'to', 'newSi', 'name', 'tn', 'ts']);
      allow update, delete: if false;
    }
```

## الاشتقاق (في `js/app.js` وفي `w/index.html`)
```js
function applyMoves(classes, moves) {           // classes: مصفوفة الفصول الأساسية (تُعدَّل في مكانها) — moves مرتبة بـ ts
  moves.slice().sort((a,b)=>a.ts-b.ts).forEach(m => {
    const src = classes.find(c => c.id === m.from); const s = src && src.students[m.si];
    if (!s || s.moved) return;                    // تجاهل الحركات المكررة/غير الصالحة
    s.moved = { to: m.to, ts: m.ts };
    if (m.to !== "out") { const dst = classes.find(c => c.id === m.to); if (!dst) return;
      const copy = Object.assign({}, s); delete copy.moved; copy.from = { cid: m.from, si: m.si, ts: m.ts };
      dst.students.push(copy); m.appliedSi = dst.students.length - 1; }
  });
}
```
- في `bootCloud()` بعد تحميل الفصول: حمّل `moves` (كلها) وطبّقها على `D.classes`، واحفظ `D.moves`. في الوضع التجريبي: `DB.moves` محلياً (مصفوفة) تُطبَّق على نسخة من `window.DEMO.classes` عند الإقلاع.
- في `w/index.html`: بعد قراءة `classes/{cid}` اقرأ `moves` (استعلامان: `where('to','==',cid)` و`where('from','==',cid)`) وطبّق نفس الدالة قبل عرض الأسماء (استبعد `moved`).
- مساعدات: `activeStudents(c)` → `[{i, s}]` للطلاب غير المنقولين بالفهرس الحقيقي؛ `isActive(c, i)`.

## أين يجب استبعاد الطالب المنقول (كل حلقة تمر على `students`)
التحضير `renderReg`، كشف الدرجات `renderGrades/grRow/drawAnalysis/printGrades`، التقارير `renderRep/printFollowup/honor/printHonor/parentReportsCard`، الحصة الحية `drawLiveRoster/drawLiveBoard/liveActions` + العجلة والمسابقات والألعاب (قوائم الأسماء)، `classCalc` (الترتيب بين النشطين فقط؛ أعد الحقل `rank` للنشطين فقط)، بطاقة الطالب/التقدم/`studentProgress`/`adminLevels`/`schoolSummary`/`classDocs`، بوابة الطالب `renderStudent` واختيار الاسم، البحث عن طالب في «المزيد»، الشهادات والتقارير المطبوعة، حاسبة المهمة (قائمة الطلاب)، نافذة إرسال الورقة وصفحة الطالب `w/index.html` ونتائج الأوراق `assignResults` (احتفظ بتسليمات القدامى لكن اعرض النشطين). ابحث بـ `grep -n "students" js/app.js` وعالج كل موضع.

## ترحيل البيانات عند النقل (ينفّذه عميل المدير فور إنشاء الحركة)
لكل معلم `T` في `D.teachers` يملك `from` ضمن `classes` **ويملك `to` أيضاً**:
- `recs/T_from` → لكل تاريخ فيه `d[date][si]`: اكتب في `recs/T_to` تحت `d[date][newSi]` (set بـ merge:true للمستند `{d:{[date]:{[newSi]: entry}}, tn, ts}`).
- `grades/T_from.g[si]` → `grades/T_to.g[newSi]` (merge).
- `comms/T_from.c` عناصر `si` → تُضاف إلى `comms/T_to.c` بـ `si: newSi` (اقرأ ثم اكتب القائمة كاملة).
- المعلم الذي لا يدرّس الفصل الجديد: تبقى بياناته في مستند الفصل القديم (مخفية) ولا تُنقل.
- إن كان المدير نفسه معلماً لأحد الفصلين: حدّث `DB.recs/DB.grades/DB.comms` المحلية بالمثل ثم `save()`.
- «خروج من المدرسة» (`to:"out"`): لا ترحيل؛ يُعلَّم منقولاً فقط.
- المعلمون الآخرون يرون الفصول الجديدة والبيانات المرحَّلة عند فتح التطبيق (enter() يحمّل مستنداتهم من السحابة)؛ أضف في `bootCloud` تحميل `moves` قبل `enter()`.

## واجهة المدير
في تبويب «المزيد» للمدير (`TE.admin`): زر «👥 نقل الطلاب» يفتح نافذة: شرائح الفصول → قائمة الطلاب النشطين مع الفهرس الحقيقي والنقاط الحالية (اجمع نقاط كل معلمي الفصل إن أمكن، وإلا العدد فقط)، وبجانب كل طالب: قائمة «نقل إلى…» (الفصول الأخرى) وزر «🚪 خروج من المدرسة». عند الاختيار: تأكيد بنص واضح (الاسم، من، إلى، «ستنتقل كل بياناته وترتيبه الجديد رقم N») ثم تنفيذ: إنشاء `moves/{id}` → الترحيل → تطبيق الحركة محلياً على `D.classes` → رسالة نجاح → إعادة رسم القائمة. سجل «آخر الحركات» أسفل النافذة (من `D.moves` آخر 10).
- في الوضع التجريبي تعمل الميزة محلياً (DB.moves + ترحيل DB المحلية) لاختبارها.

## القبول (اختبار محلي بالوضع التجريبي عبر Playwright)
1. المدير ينقل الطالب رقم 3 من رابع (أ) إلى رابع (ب): يختفي من رابع (أ) في التحضير والدرجات والتقارير والحصة الحية، ويظهر آخر رابع (ب) بفهرس = طول المصفوفة السابق، وترتيب رابع (أ) يُعاد حسابه بلا فجوة.
2. رصد سابق للطالب (حضور/مشاركة/درجة يدوية) في رابع (أ) لدى معلم يدرّس الفصلين يظهر له في رابع (ب) بعد النقل (بطاقة الطالب في الفصل الجديد تحمل نقاطه ودرجاته القديمة).
3. «خروج من المدرسة»: يختفي من كل الشاشات ولا يؤثر في فهارس زملائه (رصدهم كما هو).
4. لا أخطاء console، `node --check` ناجح، والفصل القديم يحتفظ بمصفوفته كاملة (الطالب معلَّم `moved`).
5. إعادة تحميل الصفحة تُبقي الحالة (الحركات محفوظة في DB.moves محلياً / moves سحابياً).
