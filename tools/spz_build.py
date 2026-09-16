# -*- coding: utf-8 -*-
"""صقور نافس — يحوّل سحب «منصة التعلم الذاتي المركزية» (تعليم جازان) إلى ملفات المحتوى data/nafis/spz_<صف>.json
التي تقرأها رحلة الإتقان (js/nafis_journey.js). المدخل: ملف السحب الخام (spz/pull.py) لصفٍّ واحد.
يُبقي المحتوى فقط (النواتج والمؤشرات والشرح والأسئلة بمفاتيحها) ويُسقط المعرّفات وبيانات الطالب التجريبي.
  python tools/spz_build.py --grade 3 --src <g3.json>
"""
import io, os, sys, json, argparse, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument("--grade", type=int, required=True); ap.add_argument("--src", required=True)
a = ap.parse_args()
d = json.load(io.open(a.src, encoding="utf-8"))
DOM = {"ARABIC": "read", "MATH": "math", "SCIENCE": "sci"}
LET = ["أ", "ب", "ج", "د", "هـ", "و"]
out = {"grade": a.grade, "source": "منصة التعلم الذاتي المركزية — الإدارة العامة للتعليم بمنطقة جازان", "pulled": d.get("pulled"), "subjects": []}
st = collections.Counter()
for s in d["subjects"]:
    dom = DOM.get(s["key"]);
    if not dom: print("unknown subject key", s["key"]); continue
    S = {"dom": dom, "name": s["name"], "outcomes": []}
    for o in s["outcomes"]:
        O = {"n": int(o.get("number") or len(S["outcomes"]) + 1), "title": (o.get("title") or "").strip(), "domain": (o.get("domain") or "").strip(), "inds": []}
        for i in o["indicators"]:
            I = {"code": str(i.get("code") or ""), "label": (i.get("label") or "").strip(), "text": (i.get("text") or "").strip(), "explain": (i.get("explanation") or "").strip(), "q": []}
            for q in i.get("questions", []):
                opts = [str(x.get("text") or "").strip() for x in q.get("options", [])]
                letters = [str(x.get("letter") or "") for x in q.get("options", [])]
                cl = q.get("correctLetter"); ans = letters.index(cl) if cl in letters else (LET.index(cl) if cl in LET else None)
                if ans is None: st["unkeyed"] += 1
                I["q"].append({"q": (q.get("text") or "").strip(), "type": "mcq", "opts": opts, "ans": ans}); st["q"] += 1
            if not I["explain"]: st["no_explain"] += 1
            O["inds"].append(I); st["ind"] += 1
        S["outcomes"].append(O)
    out["subjects"].append(S)
p = os.path.join(ROOT, "data", "nafis", "spz_%d.json" % a.grade)
io.open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(out, ensure_ascii=False) + "\n")
print("spz_%d.json" % a.grade, dict(st), "| bytes:", os.path.getsize(p), "| subjects:", [(S["dom"], len(S["outcomes"])) for S in out["subjects"]])
