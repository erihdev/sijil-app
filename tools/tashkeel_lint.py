#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سجلي — تفتيشُ صحّة التشكيل، لا مطابقةِ الحروف.

`tashkeel_merge` يضمن شيئاً واحداً: أن الحروف لم تُمسّ. لكنه لا يعرف أن «سَعُود» صواب
و«سُعُود» خطأ — كلاهما يعطي «سعود» عند إسقاط التشكيل. وقد وقع هذا فعلاً: اسمُ الطفل
سعود شُكِّل بالضمّ في ١١٤ موضعاً، فينطقه محرّك النطق «سُعود» في كل درس.

فهذه الأداة تحمل معجماً صغيراً من الكلمات التي **لها قراءةٌ واحدة صحيحة** — أسماء
الأطفال وأشهر كلمات المدرسة — وتُبلّغ عن كل خروجٍ عنها.

ثلاثة أشياء تجعل المقارنة عادلة، وكلُّها لزمت بعد أن أخطأت الأداة أولَ مرة:

1. **ترتيب العلامات يُوحَّد** قبل المقارنة: «النَّبِيُّ» تُكتب بالضمّة ثم الشدّة، وتُكتب
   بالشدّة ثم الضمّة — والصورتان على الشاشة واحدة والبايتات مختلفة. فتُرتَّب العلامات
   بعد كل حرف ترتيباً واحداً (الشدّة أولاً) ثم تُقارن.
2. **حركةُ الآخر تُقشَر** فالإعراب حرٌّ كما يجب (فَهْدٌ · فَهْدَ · فَهْدُ · فَهْدْ)،
   أما الشدّةُ فمن جسم الكلمة لا من إعرابها فتبقى (النَّبِيّ · الصَّفّ).
3. **الكلماتُ ذات القراءتين الصحيحتين ليست في المعجم قصداً** (العِلْم/العَلَم ·
   عُمَر الاسم / عَمَّرَ الفعل · مُعَلِّم / مَعْلَم · شُكْرًا/شُكْراً — فموضع
   التنوين قبل الألف أو بعدها كلاهما شائعٌ صحيح).

  python tools/tashkeel_lint.py                    تفتيشُ كل الدروس
  python tools/tashkeel_lint.py --subjects is,ma   موادُّ بعينها
  python tools/tashkeel_lint.py --fix              يصحّح ما في المعجم ويكتب
  python tools/tashkeel_lint.py --words            يطبع المعجم لتعليمات المُشكِّل
"""

from __future__ import annotations

import argparse
import collections
import glob
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from tashkeel_merge import MARKS, LESSONS  # noqa: E402

WORD = re.compile(r"[ء-يـً-ْٰ]+")
MARKSET = set("ًٌٍَُِّْٰ")
FINAL = set("ًٌٍَُِْٰ")   # لا الشدّة
SHADDA = "ّ"

# ── المعجم: الصورة المجرّدة ← جسم الكلمة مشكّلاً (بلا حركة الآخر) ──
STEMS = {
    # أسماء الأطفال في القصص
    "سعود": "سَعُود", "ريان": "رَيَّان", "نورة": "نُورَة", "فهد": "فَهْد",
    "بدر": "بَدْر", "خالد": "خَالِد", "ناصر": "نَاصِر", "راكان": "رَاكَان",
    "زياد": "زِيَاد", "تركي": "تُرْكِي", "جود": "جُود", "سالم": "سَالِم",
    "محمد": "مُحَمَّد", "مريم": "مَرْيَم", "سارة": "سَارَة",
    "يوسف": "يُوسُف", "أحمد": "أَحْمَد", "عائشة": "عَائِشَة",
    # المدرسة
    "المعلم": "الْمُعَلِّم", "المعلمة": "الْمُعَلِّمَة",
    "المدرسة": "الْمَدْرَسَة", "مدرسة": "مَدْرَسَة", "الطالب": "الطَّالِب",
    "الطلاب": "الطُّلَّاب", "الفصل": "الْفَصْل", "الحصة": "الْحِصَّة",
    "الصف": "الصَّفّ", "الدرس": "الدَّرْس", "الكتاب": "الْكِتَاب",
    "الواجب": "الْوَاجِب", "السبورة": "السَّبُّورَة", "المدير": "الْمُدِير",
    # كلماتٌ متكرّرة في السرد
    "الله": "اللَّه", "النبي": "النَّبِيّ", "سبحان": "سُبْحَان",
    "الصباح": "الصَّبَاح", "المساء": "الْمَسَاء", "الشمس": "الشَّمْس",
    "القمر": "الْقَمَر", "الماء": "الْمَاء", "السماء": "السَّمَاء",
    "أحسنت": "أَحْسَنْت", "الحديقة": "الْحَدِيقَة", "البيت": "الْبَيْت",
    "أمي": "أُمِّي", "أبي": "أَبِي", "جدي": "جَدِّي",
    "الجدة": "الْجَدَّة", "أخي": "أَخِي", "أختي": "أُخْتِي",
}


def bare_w(w: str) -> str:
    return MARKS.sub("", w)


def canon(w: str) -> str:
    """ترتيبٌ واحد لعلامات كل حرف (الشدّة أولاً) — فالمقارنة لا تُخطئ بسبب الترتيب."""
    out, i, n = [], 0, len(w)
    while i < n:
        ch = w[i]
        i += 1
        if ch in MARKSET:                 # علامةٌ بلا حرفٍ قبلها: تُترك موضعها
            out.append(ch)
            continue
        run = []
        while i < n and w[i] in MARKSET:
            run.append(w[i])
            i += 1
        run.sort(key=lambda c: (0 if c == SHADDA else 1, c))
        out.append(ch)
        out.extend(run)
    return "".join(out)


def stem(w: str) -> str:
    """جسم الكلمة: بلا حركة الآخر، وبالشدّة إن كانت عليه."""
    c = canon(w)
    sh = False
    i = len(c)
    while i > 0 and c[i - 1] in MARKSET:
        if c[i - 1] == SHADDA:
            sh = True
        i -= 1
    return c[:i] + (SHADDA if sh else "")


WANT = {k: stem(v) for k, v in STEMS.items()}


def subject_of(key: str) -> str:
    return "".join(c for c in key.split("t")[0] if not c.isdigit())


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description="تفتيش صحّة تشكيل السرد")
    ap.add_argument("--subjects", default="")
    ap.add_argument("--fix", action="store_true", help="يصحّح ما في المعجم ويكتب الملفات")
    ap.add_argument("--words", action="store_true", help="يطبع المعجم لتعليمات المُشكِّل")
    a = ap.parse_args(argv)

    if a.words:
        print(" · ".join("%s = %s" % (k, v) for k, v in STEMS.items()))
        return 0

    subs = set(x.strip() for x in a.subjects.split(",") if x.strip()) or None
    hits = collections.Counter()
    per_word = collections.defaultdict(collections.Counter)
    fixed_files = checked = 0

    # مسحةٌ أولى: أيُّ كلماتِ المعجم لها أكثر من جسمٍ في الدروس؟ تلك مشتبهةٌ لا مخطئة
    #   (اسمٌ يشبه صفة: لِينَا/لَيِّناً)، فيُمتنع عن تصحيحها آلياً ولو خرجت عن المعجم.
    stems_seen = collections.defaultdict(set)
    for _p in sorted(glob.glob(os.path.join(LESSONS, "*.json"))):
        _k = os.path.splitext(os.path.basename(_p))[0]
        if _k == "index" or (subs and subject_of(_k) not in subs):
            continue
        try:
            _d = json.loads(io.open(_p, encoding="utf-8").read())
        except Exception:
            continue
        for _sc in (_d.get("story") or []):
            for _w in WORD.findall((_sc or {}).get("n") or ""):
                _b = bare_w(_w)
                if _b in WANT:
                    stems_seen[_b].add(stem(_w))
    ambiguous = {b for b, v in stems_seen.items() if len(v) > 1}

    for p in sorted(glob.glob(os.path.join(LESSONS, "*.json"))):
        key = os.path.splitext(os.path.basename(p))[0]
        if key == "index" or (subs and subject_of(key) not in subs):
            continue
        d = json.loads(io.open(p, encoding="utf-8").read())
        changed = False
        for sc in (d.get("story") or []):
            n = (sc or {}).get("n") or ""
            if not n:
                continue
            checked += 1
            out = n
            for w in sorted(set(WORD.findall(n)), key=len, reverse=True):
                want = WANT.get(bare_w(w))
                if not want or stem(w) == want:
                    continue
                hits[bare_w(w)] += n.count(w)
                per_word[bare_w(w)][w] += n.count(w)
                if a.fix and bare_w(w) not in ambiguous:
                    # حركةُ الآخر تبقى كما كتبها المُشكِّل — الجسمُ وحده يُصحَّح
                    c = canon(w)
                    body = stem(w)
                    tail = "".join(x for x in c[len(body.rstrip(SHADDA)):] if x in FINAL)
                    out = out.replace(w, STEMS[bare_w(w)] + tail)
            if a.fix and out != n:
                sc["n"] = out
                changed = True
        if a.fix and changed:
            io.open(p, "w", encoding="utf-8", newline="\n").write(
                json.dumps(d, ensure_ascii=False, indent=2) + "\n")
            fixed_files += 1

    print("مشاهدُ فُتِّشت: %d · كلماتُ المعجم: %d" % (checked, len(STEMS)))
    if not hits:
        print("✔ لا خروجَ عن المعجم")
        return 0
    print("✖ خروجٌ عن المعجم في %d موضعاً:" % sum(hits.values()))
    for b, c in hits.most_common(30):
        forms = " | ".join("%s×%d" % (f, k) for f, k in per_word[b].most_common(3))
        print("  %-12s الصواب %-16s ×%-4d الموجود: %s" % (b, STEMS[b], c, forms))
    amb = [b for b in hits if b in ambiguous]
    if amb:
        print(chr(10) + "⚠ مشتبهةٌ لا تُصحَّح آلياً (لها أكثر من جسمٍ في الدروس — راجعها بنفسك):")
        for b in amb:
            print("   %-12s %s" % (b, " | ".join(sorted(stems_seen[b]))))
    if a.fix:
        print("\n✔ صُحِّحت وكُتبت في %d ملفاً" % fixed_files)
        return 2 if amb else 0
    print("\nللتصحيح: python tools/tashkeel_lint.py --fix")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
