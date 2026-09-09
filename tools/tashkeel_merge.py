#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سجلي — دمج تشكيل السرد في بيانات الدروس، بفحصٍ صارم لا يمرّ عليه تحريف.

المشكلة: محرّك النطق في المتصفح يقرأ العربية غير المشكّلة تخميناً، فيقول «عَلَم» موضع
«عِلْم» و«كَتَبَ» موضع «كُتُب». والحلّ نصُّ سردٍ مشكّل يُقرأ بدل نصّ الشاشة — وهو حقل
`n` في كل مشهدٍ من `story` (js/app.js:ttsText وjs/student/content.js:ttsText يقدّمانه
على `t`، فإن غاب قرأا نصّ الشاشة كما كان).

الخطر: من يشكّل النصّ قد «يُصلح» كلمةً أو يحذف علامة ترقيم أو يوحّد ألفاً — فيصير
المسموع غير المكتوب، ولا أحد يلاحظ في ٥٤٨٣ مشهداً. فالضمانة هنا حسابية لا بشرية:

    إسقاط كل علامات التشكيل من n  ==  t  حرفاً بحرف

فإن اختلفا رُفض المشهد وبقي بلا تشكيل (النطق يعود إلى `t` كما كان — لا خسارة).
وآيات القرآن بين ﴿ ﴾ مشكّلةٌ أصلاً في المصدر، فتُقارن بالقاعدة نفسها فتمرّ كما هي.

الاستعمال:
  python tools/tashkeel_merge.py <مجلد الملفات الجانبية>            دمجٌ فعلي
  python tools/tashkeel_merge.py <مجلد الملفات الجانبية> --dry-run  فحصٌ وتقرير بلا كتابة

الملف الجانبي: <المجلد>/<مفتاح الدرس>.json  =  {"n": ["…", "…", …]}
                طوله بعدد مشاهد story وبترتيبها نفسه. والمشهد الذي لا يُشكَّل: "" أو null.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
LESSONS = os.path.join(REPO, "data", "lessons")

# علامات التشكيل والتطويل التي تُسقط قبل المقارنة:
#   064B–0652 التنوين والحركات والشدة والسكون · 0653–0655 المدّة والهمزات الفوقية/التحتية
#   0656–065F علامات قرائية · 0670 الألف الخنجرية · 06D6–06ED علامات الوقف والتلاوة
#   0640 التطويل (لا يُضاف قصداً، وإسقاطه يمنع إخفاء تحريفٍ خلفه)
MARKS = re.compile("[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]")
HARAKA = re.compile("[\u064B-\u0652\u0670]")
LETTER = re.compile("[\u0621-\u064A]")


def bare(s: str) -> str:
    """النصّ بلا تشكيل، بمسافاتٍ موحَّدة — صورةٌ تُقارن بها الأصل."""
    s = unicodedata.normalize("NFC", str(s or ""))
    return re.sub(r"\s+", " ", MARKS.sub("", s)).strip()


def density(s: str) -> float:
    """نسبة الحركات إلى الحروف — مقياسُ «هل شُكِّل فعلاً أم وُضعت شدّةٌ واحدة؟»"""
    n = len(LETTER.findall(s))
    return (len(HARAKA.findall(s)) / n) if n else 0.0


def load(path):
    return json.loads(io.open(path, encoding="utf-8", newline="").read())


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    ap = argparse.ArgumentParser(description="دمج تشكيل السرد في دروس سجلي")
    ap.add_argument("side", help="مجلد الملفات الجانبية")
    ap.add_argument("--dry-run", action="store_true", help="فحصٌ وتقرير بلا كتابة")
    ap.add_argument("--min-density", type=float, default=0.30,
                    help="أدنى كثافة تشكيل تُقبل (الافتراضي 0.30 — دون ذلك ليس تشكيلاً)")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)

    if not os.path.isdir(a.side):
        print("✖ لا مجلد: " + a.side)
        return 1

    stat = dict(files=0, written=0, scenes=0, ok=0, same=0, mismatch=0, thin=0,
                missing=0, badlen=0, quran=0)
    bad_samples, thin_samples = [], []

    for name in sorted(os.listdir(a.side)):
        if not name.endswith(".json"):
            continue
        key = name[:-5]
        lesson = os.path.join(LESSONS, key + ".json")
        if not os.path.isfile(lesson):
            stat["missing"] += 1
            continue
        stat["files"] += 1
        try:
            side = load(os.path.join(a.side, name))
            doc = load(lesson)
        except Exception as e:
            stat["missing"] += 1
            print("✖ %s — تعذّرت القراءة: %s" % (key, str(e)[:80]))
            continue

        story = doc.get("story") or []
        narr = side.get("n") if isinstance(side, dict) else None
        if not isinstance(narr, list) or len(narr) != len(story):
            stat["badlen"] += 1
            print("✖ %s — طول الملف الجانبي %s وعدد المشاهد %d"
                  % (key, (len(narr) if isinstance(narr, list) else "?"), len(story)))
            continue

        changed = False
        for i, sc in enumerate(story):
            if not isinstance(sc, dict):
                continue
            t = sc.get("t")
            if not t:
                continue
            stat["scenes"] += 1
            n = narr[i]
            if not n or not str(n).strip():
                continue
            n = unicodedata.normalize("NFC", str(n))

            # الضمانة: النصّ نفسه حرفاً بحرف، والفرقُ تشكيلٌ فقط
            if bare(n) != bare(t):
                stat["mismatch"] += 1
                if len(bad_samples) < 6:
                    b1, b2 = bare(n), bare(t)
                    j = next((k for k in range(min(len(b1), len(b2))) if b1[k] != b2[k]),
                             min(len(b1), len(b2)))
                    bad_samples.append("%s[%d] عند المحرف %d:\n      الأصل : …%s…\n      المشكّل: …%s…"
                                       % (key, i, j, b2[max(0, j - 22):j + 22], b1[max(0, j - 22):j + 22]))
                continue

            if "\u0653" in t or "﴿" in t:      # آيةٌ مشكّلةٌ أصلاً
                stat["quran"] += 1

            if n == unicodedata.normalize("NFC", t):
                stat["same"] += 1              # لم يُضف شيء
                continue
            if density(n) < a.min_density:
                stat["thin"] += 1
                if len(thin_samples) < 4:
                    thin_samples.append("%s[%d] كثافة %.2f: %s" % (key, i, density(n), n[:60]))
                continue

            stat["ok"] += 1
            if sc.get("n") != n:
                sc["n"] = n
                changed = True

        if changed and not a.dry_run:
            io.open(lesson, "w", encoding="utf-8", newline="\n").write(
                json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
            stat["written"] += 1

    if not a.quiet:
        print("─" * 62)
        print("ملفات: %d · كُتبت: %d · مشاهد: %d" % (stat["files"], stat["written"], stat["scenes"]))
        print("  ✔ مُشكَّلة ومقبولة : %d" % stat["ok"])
        print("  ○ بلا تغيير       : %d" % stat["same"])
        print("  ⚠ تشكيلٌ رقيق     : %d (دون %.2f — رُفضت)" % (stat["thin"], a.min_density))
        print("  ✖ نصٌّ مختلف       : %d (رُفضت — النطق يعود إلى نصّ الشاشة)" % stat["mismatch"])
        print("  ✖ طولٌ غير مطابق  : %d ملفاً" % stat["badlen"])
        print("  ✖ ملفٌ مفقود      : %d" % stat["missing"])
        print("  ۝ آياتٌ مرّت      : %d" % stat["quran"])
        for s in bad_samples:
            print("\n  ✖ " + s)
        for s in thin_samples:
            print("  ⚠ " + s)
    return 0 if (stat["mismatch"] == 0 and stat["badlen"] == 0) else 2


if __name__ == "__main__":
    raise SystemExit(main())
