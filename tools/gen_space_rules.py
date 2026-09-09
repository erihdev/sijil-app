# -*- coding: utf-8 -*-
"""يولّد نسخةً معزولة من قواعد المدرسة تحت المسار sp/{space} — كل مدرسةٍ جديدة مساحةٌ
مستقلة ببياناتها وقواعدها نفسها حرفاً بحرف، ومدرستنا الحالية تبقى في الجذر بلا ترحيل.

كيف؟ يُنسخ جسم `match /databases/{database}/documents` كاملاً داخل `match /sp/{space}`،
وتُصحَّح فيه المسارات المطلقة (get/exists) لتشير إلى مساحة المدرسة لا إلى الجذر — وإلا
لقرأ معلمُ مدرسةٍ جديدة مطالبةَ جلسةٍ من مدرستنا. والدوال المعرَّفة داخل الكتلة تُظلّل
نظيراتها في الخارج، فالنصّ المنسوخ يعمل كما هو بلا تعديل.

يُعاد تشغيله بعد أي تعديل في القواعد الجذرية:
    python scratchpad/gen_space_rules.py
"""
import io, os, re, sys

REPO = r"C:\Users\denin\AppData\Local\Temp\claude\sijil-app"
SRC = os.path.join(REPO, "firestore.rules")

START = "  match /databases/{database}/documents {"
SP_START = "    /* ═════════ ==SPACE-COPY-START== مُولَّدة بـscratchpad/gen_space_rules.py — لا تُحرَّر يدوياً ═════════"
SP_END = "    /* ==SPACE-COPY-END== */"

s = io.open(SRC, encoding="utf-8", newline="").read()
NL = "\r\n" if "\r\n" in s else "\n"
lines = s.split(NL)

# ── 1) اقتطاع أي نسخةٍ مولَّدة سابقاً ──
try:
    a = next(i for i, l in enumerate(lines) if l.startswith(SP_START[:40]))
    b = next(i for i, l in enumerate(lines) if l.strip() == SP_END.strip())
    lines = lines[:a] + lines[b + 1:]
    print("أُزيلت نسخةٌ سابقة (%d سطراً)" % (b - a + 1))
except StopIteration:
    pass

# ── 2) حدود جسم مستندات القاعدة ──
i0 = next(i for i, l in enumerate(lines) if l.rstrip() == START)
depth, j = 1, i0 + 1
while j < len(lines) and depth:
    depth += lines[j].count("{") - lines[j].count("}")
    if depth == 0:
        break
    j += 1
body = lines[i0 + 1:j]                       # بلا سطر الفتح وبلا سطر الإغلاق

# الحارس الأخير (deny-all) لا يُنسخ: هو في الجذر يكفي، ونسخُه داخل المساحة عبثٌ
body = [l for l in body if "match /{document=**}" not in l]

# ── 3) المسارات المطلقة تشير إلى مساحة المدرسة لا إلى الجذر ──
ABS = "/databases/$(database)/documents/"
n_abs = sum(l.count(ABS) for l in body)
copy = [l.replace(ABS, ABS + "sp/$(space)/") for l in body]

# ── 3ب) أسماء الدوال تُلاحَق بـ_sp ──
#    فايرستور يحلّ أسماء الدوال في نطاقٍ واحد لا بالتظليل: تعريفان بالاسم نفسه (واحد في
#    الجذر وواحد داخل المساحة) يمرّان في التصريف ثم يرميان evaluation error عند كل نداء
#    — تحقّقنا منه فعلاً: كل كتابةٍ تشترط isAdminClaim() صارت تُخطئ بعد إدراج النسخة.
FN = sorted(set(re.findall(r"^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(", "\n".join(copy), re.M)),
            key=len, reverse=True)
if not FN:
    sys.exit("لم يُعثر على دوال في الجسم — تحقّق من الاقتطاع")
for name in FN:
    copy = [re.sub(r"\b%s\s*\(" % re.escape(name), name + "_sp(", l) for l in copy]

# ── 3ج) فروقُ المساحة عن الجذر ──
#    مدرستنا الأولى زُرعت بسكربت، فمستنداتها الأساسية (meta وclasses) مقفلةٌ للكتابة.
#    والمدرسة الجديدة تُنشئ نفسها من التطبيق، فتحتاج ثلاثة أبواب مضبوطة:
#      • meta/app يُكتب مرة واحدة عند التأسيس (create وحده — لا تحديث ولا حذف).
#      • الفصول يُنشئها المدير ويعدّلها (شكلٌ مفحوص، وأسماء الطلاب فيها).
#      • المؤسِّس نفسه: مستند المساحة يحمل معرّفه adm وبصمة رقمه ph — وهما ثابتان لأن
#        المستند لا يُعدَّل، فيُقبل إنشاء حسابه ورقمه مرة واحدة ثم يُغلق الباب بوجودهما.
SPD = "get(/databases/$(database)/documents/sp/$(space)).data"
SPE = "exists(/databases/$(database)/documents/sp/$(space))"
OVERRIDES = [
 ("meta",
  "    match /meta/{doc}      { allow read: if signedIn_sp(); allow write: if false; }",
  """    /* مستند المدرسة الأساسي: يُكتب مرة واحدة لحظة التأسيس ثم يُقفل كما في الجذر تماماً.
       (ما يضبطه المدير بعدها من أوزانٍ وحالاتٍ يذهب إلى cfg/assess وcfg/school.) */
    match /meta/{doc} {
      allow read: if signedIn_sp();
      allow create: if signedIn_sp() && doc == 'app' && %(SPE)s
          && request.resource.data.keys().hasOnly(['school', 'states', 'behaviors', 'weights', 'assess', 'term', 'ts'])
          && request.resource.data.school is map
          && request.resource.data.school.name is string
          && request.resource.data.school.name.size() > 0
          && request.resource.data.school.name.size() <= 80;
      allow update, delete: if false;
    }""" % {"SPE": SPE}),
 ("classes",
  "    match /classes/{cid}   { allow read: if signedIn_sp(); allow write: if false; }",
  """    /* الفصول: يُنشئها المدير من لوحته ويعدّل أسماءها — بخلاف مدرستنا الأولى التي زُرعت
       بسكربت فقُفلت. والحذف ممنوع دائماً: فصلٌ يُحذف يتيتم رصدُه ودرجاتُه وحركاتُه. */
    match /classes/{cid} {
      allow read: if signedIn_sp();
      allow create, update: if signedIn_sp() && cid.matches('^[A-Za-z0-9]{1,12}$') && isAdminClaim_sp()
          && request.resource.data.keys().hasOnly(['name', 'grade', 'gc', 'students', 'tn', 'ts'])
          && request.resource.data.name is string
          && request.resource.data.name.size() > 0 && request.resource.data.name.size() <= 40
          && request.resource.data.gc is int && request.resource.data.gc >= 1 && request.resource.data.gc <= 12
          && request.resource.data.students is list
          && request.resource.data.students.size() <= 400;
      allow delete: if false;
    }"""),
 ("teachers-create",
  """      allow create: if signedIn_sp() && tid.matches('^t[0-9]{2,3}$') && teacherShape_sp()
          && isAdminClaim_sp()
          && request.resource.data.get('admin', false) == false
          // معلم جديد يولد غير مسجّل وبلا ختم — التسجيل يمرّ بقناة الإثبات وحدها
          && request.resource.data.get('reg', false) == false
          && !('pt' in request.resource.data)
          && !('pinHash' in request.resource.data);""",
  """      /* المؤسِّس: أول حسابٍ في المدرسة الجديدة، وهو مديرها وحده. لا مطالبةَ بعدُ لأحد،
         فالإذن من مستند المساحة نفسه (adm) — وهو غير قابل للتعديل، والباب يُغلق بمجرد
         وجود الحساب (create لا يمرّ على موجود). وما سواه معلمٌ عاديّ بمطالبة مدير كالجذر. */
      allow create: if signedIn_sp() && tid.matches('^t[0-9]{2,3}$') && teacherShape_sp()
          && request.resource.data.get('reg', false) == false
          && !('pt' in request.resource.data)
          && !('pinHash' in request.resource.data)
          && ((%(SPE)s
               && %(SPD)s.get('adm', '') == tid
               && request.resource.data.get('admin', false) == true)
              || (isAdminClaim_sp()
                  && request.resource.data.get('admin', false) == false));""" % {"SPE": SPE, "SPD": SPD}),
 ("pins-create",
  """          && tHas_sp(request.resource.data.tid)
          && ((reqHas_sp(request.resource.data.tid)""",
  """          && tHas_sp(request.resource.data.tid)
          // رقم المؤسِّس: بصمته مختومةٌ في مستند المساحة لحظة التأسيس، فيُقبل مرة واحدة
          && ((%(SPE)s && %(SPD)s.get('ph', '') == h
               && %(SPD)s.get('adm', '') == request.resource.data.tid)
              || (reqHas_sp(request.resource.data.tid)""" % {"SPE": SPE, "SPD": SPD}),
]
txt = NL.join(copy)
for name, a, b in OVERRIDES:
    a = a.replace("\n", NL); b = b.replace("\n", NL)
    if txt.count(a) != 1:
        sys.exit("تعذّر تطبيق فرق المساحة «%s» (وُجد %d)" % (name, txt.count(a)))
    txt = txt.replace(a, b, 1)
copy = txt.split(NL)
print("فروق المساحة المطبَّقة: %d" % len(OVERRIDES))

# ── 4) تفتيشٌ قبل الإدراج: لا مسارٌ مطلق بقي بلا مساحة ──
# يُشطب المقبولان — مسارٌ داخل المساحة، ومستند المساحة نفسه — فما بقي مسارٌ جذريٌّ ساهٍ
SELF = ABS + "sp/$(space))"
def stray(l):
    return ABS in l.replace(ABS + "sp/$(space)/", "").replace(SELF, "")
left = [l.strip()[:90] for l in copy if stray(l)]
if left:
    sys.exit("مسارات مطلقة بلا مساحة:\n  " + "\n  ".join(left[:5]))

head = [
    SP_START,
    "       كل مدرسةٍ مساحةٌ مستقلة: sp/{space}/teachers · sp/{space}/classes · sp/{space}/recs …",
    "       والقواعد نفسها حرفاً بحرف، والمسارات المطلقة (المطالبة وأرقام الدخول ومستندات المعلمين)",
    "       تشير إلى مساحة المدرسة وحدها — فلا يقرأ معلمُ مدرسةٍ شيئاً من مدرسةٍ أخرى.",
    "       ═════════════════════════════════════════════════════════════════════════════════ */",
    "    match /sp/{space} {",
    "      /* مستند المساحة نفسه: اسم المدرسة وخطتها وتاريخ انتهاء التجربة. يقرؤه كل جهاز",
    "         (ليعرف التطبيق أن المساحة قائمة ومتى تنتهي)، ويُنشأ مرة واحدة عند التسجيل،",
    "         ولا يُعدَّل بعدها إلا من الخادم — فلا يمدّد أحدٌ تجربته بنفسه، ولا يُحذف. */",
    "      allow get: if signedIn();",
    "      allow list, update, delete: if false;",
    "      allow create: if signedIn()",
    "          && space.matches('^[a-z0-9]{6,12}$')",
    "          && request.resource.data.keys().hasOnly(['name', 'plan', 'exp', 'ts', 'adm', 'ph'])",
    "          && request.resource.data.name is string",
    "          && request.resource.data.name.size() > 0 && request.resource.data.name.size() <= 80",
    "          && request.resource.data.plan == 'trial'",
    "          && request.resource.data.exp is number",
    "          && request.resource.data.ts is number",
    "          && request.resource.data.adm is string && request.resource.data.adm.matches('^t[0-9]{2,3}$')",
    "          /* ph: بصمة رقم دخول المؤسِّس. تُختم هنا لأن المستند لا يُعدَّل أبداً، فتصير إذناً",
    "             سُلطَته لحظةٌ واحدة: يُنشأ بها حسابه ورقمه ثم لا تفتح شيئاً بعدهما. */",
    "          && request.resource.data.ph is string && request.resource.data.ph.matches('^[0-9a-f]{64}$');",
    "",
]
tail = ["    }", SP_END]
gen = head + ["  " + l if l.strip() else l for l in copy] + tail

out = lines[:j] + gen + lines[j:]
io.open(SRC, "w", encoding="utf-8", newline="").write(NL.join(out))
print("أُدرجت نسخة المساحة: %d سطراً · مسارات مطلقة صُحّحت: %d" % (len(gen), n_abs))
print("حجم الملف: %.1f كيلوبايت (الحدّ 256)" % (len(NL.join(out).encode("utf-8")) / 1024.0))
