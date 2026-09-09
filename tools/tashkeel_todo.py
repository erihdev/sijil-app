#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سجلي — ما بقي من تشكيل السرد: يُشتقّ من القرص لا من قائمةٍ تُكتب بيد.

لماذا؟ نقلُ مئةٍ وستين مفتاح درسٍ بيدٍ إلى نداءٍ خطأٌ حتمي (وقع فعلاً: سبعة مفاتيح
لا وجود لها، وسبعة دروسٍ حقيقية سقطت من الدفعة). فكل وكيلٍ يسأل هذه الأداة عن حصّته.

  python tools/tashkeel_todo.py                          كل ما بقي، بالمواد
  python tools/tashkeel_todo.py --subjects is,ma          مادتان
  python tools/tashkeel_todo.py --subjects is,ma --shard 3/14   حصّة الوكيل الثالث
  python tools/tashkeel_todo.py --stats                   تقريرٌ بالمواد بلا قوائم

«بقي» = مشهدٌ فيه نصُّ شاشة t وليس فيه سردٌ مشكّل n مقبول (بكثافةٍ كافية ومطابقٍ للأصل).
والحصص موزَّعةٌ بالمشاهد لا بالملفات، فلا ينتظر الجميع وكيلاً واحداً.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import glob
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from tashkeel_merge import bare, density, LESSONS  # noqa: E402

MIN_DENSITY = 0.30


def subject_of(key: str) -> str:
    return "".join(ch for ch in key.split("t")[0] if not ch.isdigit())


def scan(subjects=None):
    """[{key, subject, todo, total}] لكل درسٍ فيه ما بقي."""
    out = []
    for p in sorted(glob.glob(os.path.join(LESSONS, "*.json"))):
        key = os.path.splitext(os.path.basename(p))[0]
        if key == "index":
            continue
        subj = subject_of(key)
        if subjects and subj not in subjects:
            continue
        try:
            d = json.loads(io.open(p, encoding="utf-8").read())
        except Exception:
            continue
        total = todo = 0
        for sc in (d.get("story") or []):
            t = (sc or {}).get("t") or ""
            if not t:
                continue
            total += 1
            n = (sc or {}).get("n") or ""
            n = unicodedata.normalize("NFC", str(n))
            good = bool(n) and bare(n) == bare(t) and density(n) >= MIN_DENSITY
            if not good:
                todo += 1
        if todo:
            out.append({"key": key, "subject": subj, "todo": todo, "total": total})
    return out


def shard(items, i, n):
    """توزيعٌ متوازنٌ بالمشاهد: الأثقل أولاً إلى أخفّ الحصص."""
    buckets = [[] for _ in range(n)]
    for it in sorted(items, key=lambda x: -x["todo"]):
        buckets.sort(key=lambda b: sum(x["todo"] for x in b))
        buckets[0].append(it)
    # الترتيب تغيّر بالفرز، فنُعيد بناء الحصص بترتيبٍ ثابتٍ يعتمد على المفاتيح
    buckets = [sorted(b, key=lambda x: x["key"]) for b in buckets]
    buckets.sort(key=lambda b: (b[0]["key"] if b else "~"))
    return buckets[i - 1] if 1 <= i <= n else []


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description="ما بقي من تشكيل سرد الدروس")
    ap.add_argument("--subjects", default="", help="رموز المواد مفصولةً بفواصل (is,ma,…)")
    ap.add_argument("--shard", default="", help="i/N — حصّة الوكيل i من N")
    ap.add_argument("--stats", action="store_true", help="تقريرٌ بالمواد بلا قوائم")
    ap.add_argument("--json", action="store_true", help="مخرجٌ JSON")
    a = ap.parse_args(argv)

    subs = set(x.strip() for x in a.subjects.split(",") if x.strip()) or None
    items = scan(subs)

    if a.shard:
        try:
            i, n = (int(x) for x in a.shard.split("/"))
        except Exception:
            print("✖ صيغة الحصّة: i/N")
            return 1
        items = shard(items, i, n)

    if a.stats:
        by = {}
        for it in items:
            b = by.setdefault(it["subject"], {"files": 0, "todo": 0})
            b["files"] += 1
            b["todo"] += it["todo"]
        tot = sum(b["todo"] for b in by.values())
        print("بقي %d مشهداً في %d درساً" % (tot, len(items)))
        for s in sorted(by, key=lambda x: -by[x]["todo"]):
            print("  %-4s %4d مشهداً في %3d درساً" % (s, by[s]["todo"], by[s]["files"]))
        return 0

    if a.json:
        print(json.dumps(items, ensure_ascii=False))
        return 0

    for it in items:
        print(it["key"])
    if items:
        print("# %d درساً · %d مشهداً" % (len(items), sum(x["todo"] for x in items)), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
