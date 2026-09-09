#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سجلي — فحصُ ملفٍ جانبيّ واحد من تشكيل السرد، ليصحّح المُشكِّل نفسَه قبل التسليم.

  python tools/tashkeel_check.py <مسار الملف الجانبي>

يطبع لكل مشهد: ✔ مقبول · ⚠ تشكيلٌ رقيق · ✖ نصٌّ مختلف (ومعه موضع أول اختلاف).
ورمز الخروج 0 إن كان كل شيء مقبولاً، و2 إن بقي مشهدٌ مرفوض.

القاعدة الوحيدة: إسقاط التشكيل من نصّك يجب أن يُعيد نصّ الشاشة حرفاً بحرف.
"""

from __future__ import annotations

import io
import json
import os
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from tashkeel_merge import bare, density, LESSONS  # noqa: E402


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    args = list(argv if argv is not None else sys.argv[1:])
    if not args:
        print("الاستعمال: python tools/tashkeel_check.py <مسار الملف الجانبي>")
        return 1
    p = args[0]
    key = os.path.splitext(os.path.basename(p))[0]
    lesson = os.path.join(LESSONS, key + ".json")
    if not os.path.isfile(lesson):
        print("✖ لا درس بهذا المفتاح: " + key)
        return 1

    side = json.loads(io.open(p, encoding="utf-8").read())
    doc = json.loads(io.open(lesson, encoding="utf-8").read())
    story = doc.get("story") or []
    narr = side.get("n") if isinstance(side, dict) else None

    if not isinstance(narr, list):
        print("✖ الملف الجانبي يجب أن يكون {\"n\": [...]}")
        return 2
    if len(narr) != len(story):
        print("✖ الطول %d والمشاهد %d — يجب أن يتساويا وبالترتيب نفسه" % (len(narr), len(story)))
        return 2

    bad = 0
    for i, sc in enumerate(story):
        t = (sc or {}).get("t") or ""
        n = narr[i]
        if not t:
            print("  %2d ○ مشهدٌ بلا نصّ (اتركه \"\")" % i)
            continue
        if not n or not str(n).strip():
            print("  %2d ○ لم يُشكَّل" % i)
            bad += 1
            continue
        n = unicodedata.normalize("NFC", str(n))
        b1, b2 = bare(n), bare(t)
        if b1 != b2:
            j = next((k for k in range(min(len(b1), len(b2))) if b1[k] != b2[k]),
                     min(len(b1), len(b2)))
            print("  %2d ✖ نصٌّ مختلف عند المحرف %d" % (i, j))
            print("        الأصل : …%s…" % b2[max(0, j - 26):j + 26])
            print("        نصّك  : …%s…" % b1[max(0, j - 26):j + 26])
            bad += 1
            continue
        d = density(n)
        if d < 0.30:
            print("  %2d ⚠ تشكيلٌ رقيق (%.2f) — شكّل كل حرفٍ يقبل حركة" % (i, d))
            bad += 1
            continue
        print("  %2d ✔ %.2f" % (i, d))

    print("─" * 40)
    print("%s: %d مشهداً · مرفوض %d" % (key, len(story), bad))
    return 0 if bad == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
