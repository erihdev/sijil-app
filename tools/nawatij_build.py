# -*- coding: utf-8 -*-
"""نواتج التعلم — يولّد data/nawatij.json من «منصة دعم نواتج التعلم 1448» (تعليم جازان).

المنصة تطبيق Google Apps Script يضع كتالوجه كله في الصفحة بعد الدخول بالرقم الإحصائي للمدرسة:
  OC.items[i] = [فهرس الصف, فهرس المجال, [الأسابيع], الاسم, [ناتج, فيديو, اختبار, مهمة, عرض]]  (−1 = لا يوجد)
  OC.urls     = جدول الروابط · SELF["صف|مجال"] منصة التعلم الذاتي · LEAD.training خطة التدريب · EXTRAS الاختبار التشخيصي
نأخذ الصفين الثالث والسادس الابتدائي فقط، وروابط عامة فقط — لا شيء من قاعدة المدارس (DB) يُقرأ أو يُحفظ.

  python tools/nawatij_build.py --school <الرقم الإحصائي للمدرسة>
(الرقم مفتاحُ دخول المنصة — لا يُكتب في المستودع ولا في السجلات.)
"""
import io, os, sys, json, argparse, collections
from playwright.sync_api import sync_playwright
URL = "https://script.google.com/macros/s/AKfycbxPE-GC9PctQdqg25euVEPlWrtOofuCwtbn7r3xVoi6fzECqJ8xhyXaZbOYufzrhYZE/exec"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument("--school", required=True, help="الرقم الإحصائي للمدرسة (للدخول فقط)"); ap.add_argument("--out", default=os.path.join(ROOT, "data", "nawatij.json"))
a = ap.parse_args()
with sync_playwright() as pw:
    b = pw.chromium.launch(); p = b.new_page(viewport={"width": 1366, "height": 900}, locale="ar-SA")
    p.goto(URL, wait_until="load", timeout=90000); p.wait_for_timeout(4000)
    f = None
    for _ in range(40):
        for g in p.frames:
            try:
                if g != p.main_frame and g.locator("input").count() > 0: f = g
            except Exception: pass
        if f: break
        p.wait_for_timeout(500)
    if not f: sys.exit("لم يظهر إطار المنصة")
    f.locator("input").first.fill(a.school); f.get_by_text("تسجيل الدخول").first.click(); p.wait_for_timeout(6000)
    d = f.evaluate("() => ({OC: OC, OC_GRADES: OC_GRADES, OC_DOMAINS: OC_DOMAINS, SELF: SELF, LEAD: LEAD, EXTRAS: EXTRAS})")
    b.close()
OC, G, D, SELF, LEAD, EXTRAS = d["OC"], d["OC_GRADES"], d["OC_DOMAINS"], d["SELF"], d["LEAD"], d["EXTRAS"]
urls = OC["urls"]
# حارس: الجدول قد يحوي عناصر ليست روابط («قريبا») — لا تُصدَّر
U = lambda i: (urls[i] if isinstance(i, int) and 0 <= i < len(urls) and str(urls[i]).startswith("http") else "")
KEYS = ["outcome", "video", "quiz", "tasks", "enrich"]
gcmap = {"الصف الثالث الابتدائي": 3, "الصف السادس الابتدائي": 6}; dommap = {"القراءة": "read", "الرياضيات": "math", "العلوم": "sci"}
import datetime
out = {"src": "منصة دعم نواتج التعلم 1448 — الإدارة العامة للتعليم بمنطقة جازان", "fetched": datetime.date.today().isoformat(), "grades": {},
       "extras": [{"name": e["name"], "desc": e["desc"], "url": e["url"], "weeks": e["weeks"], "gc": [gcmap[g] for g in e["grades"] if g in gcmap]} for e in EXTRAS]}
for gi, gname in enumerate(G):
    if gname not in gcmap: continue
    gobj = {"name": gname, "domains": {}}
    for di, dname in enumerate(D):
        its = [x for x in OC["items"] if x[0] == gi and x[1] == di]
        if not its: continue
        gobj["domains"][dommap[dname]] = {"name": dname, "self": SELF.get("%d|%d" % (gi, di), ""), "training": (LEAD.get("training") or {}).get("%d|%d" % (gi, di), ""),
            "items": [{"w": x[2], "name": x[3], "res": {k: U(x[4][j]) for j, k in enumerate(KEYS) if U(x[4][j])}} for x in its]}
    out["grades"][str(gcmap[gname])] = gobj
io.open(a.out, "w", encoding="utf-8", newline="\n").write(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
for gc, g in out["grades"].items():
    for k, dm in g["domains"].items(): print("gc%s %-5s %2d ناتجاً" % (gc, k, len(dm["items"])))
print("كُتب:", a.out)
