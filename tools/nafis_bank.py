# -*- coding: utf-8 -*-
"""صقور نافس — يجمّع بنك الأسئلة data/nafis/bank.json من ملفات النقل المُراجَعة.

المدخل: مجلد فيه bank/<driveId>.json (ملف الناتج المنقول من PDF) وbank/form_NN.json (نماذج Forms).
كل ملف: {gc, dom, item, outcome, indicators, activities:[{n, page, passage, questions:[{q, type, opts,
ans_pdf, ans_sug, conf, ans_text, needs_figure, figure_desc, page}]}]}.

الربط بالناتج: ملف الـPDF يُربط بعنصر المنصة عبر معرّف Drive لملف الناتج في data/nafis/media.json
(doc)، ونماذج Forms عبر (الصف، المجال، اسم الناتج). مفتاح الإجابة المعتمد:
  ans = ans_pdf إن وُجد؛ وإلا ans_sug إن كانت الثقة ≥ 0.75؛ وإلا null (السؤال يُعرض للقائمين
  على البرنامج في القائمة «بلا مفتاح» ولا يدخل في التصحيح).

  python tools/nafis_bank.py --src <مجلد bank>
"""
import io, os, sys, json, argparse, collections, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument("--src", required=True, action="append", help="مجلد ملفات النقل (يتكرر)"); ap.add_argument("--min-conf", type=float, default=0.75)
a = ap.parse_args()
a.src.append(os.path.join(ROOT, "data", "nafis", "src"))   # المصادر المحفوظة في المستودع (diag_*.json …)
media = json.load(io.open(os.path.join(ROOT, "data", "nafis", "media.json"), encoding="utf-8"))
doc2item = {}
for gc, g in media["grades"].items():
    for dom, d in g.items():
        for it in d["items"]:
            if it.get("doc"): doc2item[it["doc"]] = (gc, dom, it["k"], it["name"])
name2item = {}
for gc, g in media["grades"].items():
    for dom, d in g.items():
        for it in d["items"]: name2item[(gc, dom, it["name"].strip())] = it["k"]

def norm_q(q, act):
    t = q.get("type") or "mcq"
    ans = q.get("ans_pdf")
    src = "pdf" if ans is not None else None
    if ans is None and t in ("mcq", "tf") and q.get("ans_sug") is not None and float(q.get("conf") or 0) >= a.min_conf:
        ans, src = int(q["ans_sug"]), "solver"
    if t == "fill" and (q.get("ans_text") or "").strip(): src = src or "solver"
    return {"q": (q.get("q") or "").strip(), "type": t, "opts": [str(o).strip() for o in (q.get("opts") or [])],
            "ans": (int(ans) if ans is not None and t != "fill" else None), "ans_text": (q.get("ans_text") or "").strip() if t == "fill" else "",
            "src": src, "conf": q.get("conf"), "needs_figure": bool(q.get("needs_figure")), "figure_desc": (q.get("figure_desc") or "").strip(),
            "act": act, "page": q.get("page")}

bank = {"grades": {}, "built": None, "stats": {}}
stats = collections.Counter(); unkeyed = []
def slot(gc, dom, k, name):
    G = bank["grades"].setdefault(str(gc), {"domains": {}}); D = G["domains"].setdefault(dom, {"items": []})
    for it in D["items"]:
        if it["k"] == k: return it
    it = {"k": k, "name": name, "outcome": "", "indicators": [], "q": [], "sources": []}; D["items"].append(it); return it
seen = set()
for src in a.src:
  if not os.path.isdir(src): continue
  for fn in sorted(os.listdir(src)):
    if not fn.endswith(".json") or fn in seen: continue
    seen.add(fn)
    try: d = json.load(io.open(os.path.join(src, fn), encoding="utf-8"))
    except Exception as e: stats["bad_json"] += 1; print("BAD", fn, e); continue
    fid = fn[:-5]
    if fn.startswith("diag_"):
        gc = str(d.get("gc")); it = slot(gc, "diag", 0, d.get("item") or "الاختبار التشخيصي"); it["outcome"] = d.get("title", ""); it["sources"].append({"kind": "diag", "form_id": d.get("form_id", "")})
        for act in d.get("activities", []):
            for q in act.get("questions", []):
                nq = norm_q(q, (act.get("n") or "").strip()); nq["passage"] = (act.get("passage") or "").strip(); it["q"].append(nq)
    elif fn.startswith("form_"):
        gc, dom, name = str(d.get("gc")), d.get("dom"), (d.get("item") or "").strip()
        k = name2item.get((gc, dom, name))
        if k is None: stats["form_unmatched"] += 1; print("form unmatched:", fn, gc, dom, name); continue
        it = slot(gc, dom, k, name); it["sources"].append({"kind": "form", "i": d.get("i"), "title": d.get("title", "")})
        passage = (d.get("passage") or "").strip()
        for act in d.get("activities", []):
            for q in act.get("questions", []):
                nq = norm_q(q, "اختبار تجريبي"); nq["passage"] = passage or (act.get("passage") or "").strip(); it["q"].append(nq)
    else:
        m = doc2item.get(fid)
        if not m: stats["pdf_unmatched"] += 1; print("pdf unmatched:", fid, d.get("gc"), d.get("dom"), d.get("item")); continue
        gc, dom, k, name = m
        it = slot(gc, dom, k, name); it["sources"].append({"kind": "pdf", "fid": fid})
        if d.get("outcome") and not it["outcome"]: it["outcome"] = d["outcome"].strip()
        if d.get("indicators") and not it["indicators"]: it["indicators"] = [str(x).strip() for x in d["indicators"] if str(x).strip()]
        for act in d.get("activities", []):
            for q in act.get("questions", []):
                nq = norm_q(q, (act.get("n") or "").strip()); nq["passage"] = (act.get("passage") or "").strip(); it["q"].append(nq)
    stats["files"] += 1
# ترتيب وإحصاء
for gc, G in bank["grades"].items():
    for dom, D in G["domains"].items():
        D["items"].sort(key=lambda x: x["k"])
        for it in D["items"]:
            for i, q in enumerate(it["q"]):
                stats["q"] += 1
                if q["type"] in ("mcq", "tf"):
                    if q["ans"] is None: stats["unkeyed"] += 1; unkeyed.append({"gc": gc, "dom": dom, "k": it["k"], "i": i, "q": q["q"][:80]})
                    else: stats["keyed_" + (q["src"] or "?")] += 1
                if q["needs_figure"]: stats["needs_figure"] += 1
import datetime
bank["built"] = datetime.date.today().isoformat(); bank["stats"] = dict(stats); bank["unkeyed"] = unkeyed
# ملف لكل صف (الطالب يحمّل صفه فقط) + ملف وصفي للإحصاء وقائمة «بلا مفتاح» (للقائمين على البرنامج)
sizes = {}
for gc in ("3", "6"):
    out = os.path.join(ROOT, "data", "nafis", "bank_%s.json" % gc)
    io.open(out, "w", encoding="utf-8", newline="\n").write(json.dumps({"built": bank["built"], "grades": {gc: bank["grades"].get(gc, {"domains": {}})}}, ensure_ascii=False) + "\n")
    sizes[gc] = os.path.getsize(out)
meta = os.path.join(ROOT, "data", "nafis", "bank_meta.json")
io.open(meta, "w", encoding="utf-8", newline="\n").write(json.dumps({"built": bank["built"], "stats": bank["stats"], "unkeyed": unkeyed}, ensure_ascii=False, indent=1) + "\n")
old = os.path.join(ROOT, "data", "nafis", "bank.json")
if os.path.exists(old): os.remove(old)
print(json.dumps(dict(stats), ensure_ascii=False), "| items:", sum(len(D["items"]) for G in bank["grades"].values() for D in G["domains"].values()), "| bytes:", sizes)
