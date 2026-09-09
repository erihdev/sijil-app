#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سجلي — مُرسل إشعارات الطلاب (يُشغَّل من المهمة المجدولة في GitHub Actions)

ماذا يفعل؟
  يقرأ بحساب خدمة: اشتراكات الطلاب ``spush/*``، وفهرس أوراق كل فصل ``assignidx/{cid}``،
  وصندوق رسائل كل طالب ``smsg/{mk}``. فإن وُجد فيها ما هو أحدثُ من آخر إشعارٍ أُرسل لهذا
  الطالب، أرسل إليه تنبيهاً عربياً واحداً:
      «✏️ واجب جديد من معلمك» — «ورقة عمل: كذا»
      «📬 رسالة من معلمك»     — «استدعاء لمقابلة — كذا»
  ثم يدخل الطالب (أو وليّ أمره) البوابة ليرى التفاصيل.

لماذا علامة لكل طالب؟
  ``pushlog/s_{mk}.last`` = زمن أحدث عنصر أُشعر به. فلا يُرسل عنصرٌ مرتين ولو تعطّلت المهمة
  يوماً ثم عادت. وأول اشتراكٍ يبدأ من لحظته (``spush.ts``) فلا تُصبّ عليه أوراقُ الفصل كلها.

الخصوصية:
  لا يُطبع رقم هوية ولا مفتاح صندوق ولا عنوان اشتراك ولا اسم طالب — السجل يذكر الفصل والنوع
  والعنوان وحدها. واشتراكٌ يرفضه خادم الدفع بـ404/410 يُحذف مستنده.

الأسرار (من متغيرات البيئة، كما في tools/push_send.py):
  SA_JSON · VAPID_PRIVATE · VAPID_SUB

التشغيل:
  python tools/push_students.py                 إرسال حقيقي
  python tools/push_students.py --dry-run       حساب وطباعة بلا إرسال وبلا كتابة
  python tools/push_students.py --max-age 240   أقصى عمر للعنصر بالدقائق (الافتراضي 180)

رمز الخروج: 0 عند النجاح (ولو لم يكن هناك ما يُرسل)، 1 عند خطأ يمنع العمل.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from push_send import PROJECT, Store, load_sa, log, send_one  # noqa: E402

RIYADH = dt.timezone(dt.timedelta(hours=3), "Asia/Riyadh")
MODE_AR = {"ws": "ورقة عمل", "quiz": "اختبار قصير", "race": "سباق أسئلة"}
KIND_AR = {"level": "تقرير عن مستواك", "call": "استدعاء لمقابلة", "thanks": "شكر وتقدير",
           "hw": "متابعة واجب", "beh": "ملاحظة سلوكية", "free": "رسالة"}


def num(v, d=0.0):
    try:
        return float(v)
    except Exception:
        return d


def newest(items):
    """أحدث عنصرٍ بزمنه (أو None). العناصر خرائط حرّة داخل قائمة."""
    best = None
    for it in items or []:
        if not isinstance(it, dict) or num(it.get("ts")) <= 0:
            continue
        if best is None or num(it.get("ts")) > num(best.get("ts")):
            best = it
    return best


def set_doc(store: "Store", path: str, data: dict) -> bool:
    """كتابةٌ باستبدال (upsert) — Store.create ذرّيٌّ لا يصلح لعلامةٍ تُحدَّث."""
    body = {"fields": {}}
    for k, v in data.items():
        if isinstance(v, bool):
            body["fields"][k] = {"booleanValue": v}
        elif isinstance(v, int):
            body["fields"][k] = {"integerValue": str(v)}
        elif isinstance(v, float):
            body["fields"][k] = {"doubleValue": v}
        else:
            body["fields"][k] = {"stringValue": str(v)}
    r = store.s.patch("%s/%s" % (store.base, path), json=body, timeout=40)
    return r.status_code in (200, 201)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="إشعارات الطلاب: واجب جديد أو رسالة من المعلم")
    ap.add_argument("--dry-run", action="store_true", help="بلا إرسال وبلا كتابة")
    ap.add_argument("--max-age", type=int, default=180, help="أقصى عمر للعنصر بالدقائق")
    args = ap.parse_args(argv)

    sa_raw = os.environ.get("SA_JSON", "")
    vp = os.environ.get("VAPID_PRIVATE", "")
    vs = os.environ.get("VAPID_SUB", "mailto:erihdev@gmail.com")
    if not sa_raw:
        log("✖ لا SA_JSON — لا يمكن القراءة من Firestore")
        return 1
    if not vp and not args.dry_run:
        log("✖ لا VAPID_PRIVATE — لا يمكن الإرسال")
        return 1

    store = Store(load_sa(sa_raw))
    subs = store.list("spush")            # {mk: fields}
    if not subs:
        log("لا اشتراكات طلاب — لا شيء يُرسل")
        return 0
    log("اشتراكات الطلاب: %d" % len(subs))

    now_ms = dt.datetime.now(RIYADH).timestamp() * 1000
    max_age_ms = max(1, args.max_age) * 60_000
    idx: dict = {}
    sent = quiet = cleaned = 0

    for mk, d in subs.items():
        cid = str(d.get("cid") or "")
        si = int(num(d.get("si"), -1))
        ep = str(d.get("ep") or "")
        if not mk or not cid or si < 0 or not ep:
            continue

        mark = store.get("pushlog/s_" + mk) or {}
        last = num(mark.get("last"), 0) or num(d.get("ts"), 0)

        # ── أوراق فصله (والورقة الموجَّهة to لغيره لا تُحسب) ──
        if cid not in idx:
            idx[cid] = (store.get("assignidx/" + cid) or {}).get("list") or []
        mine = []
        for it in idx[cid]:
            if not isinstance(it, dict):
                continue
            to = it.get("to")
            if isinstance(to, list) and to and si not in [int(num(x, -1)) for x in to]:
                continue
            mine.append(it)
        task = newest(mine)
        msg = newest((store.get("smsg/" + mk) or {}).get("list") or [])

        best, kind = None, ""
        for cand, k in ((task, "task"), (msg, "msg")):
            if not cand or num(cand.get("ts")) <= last:
                continue
            if now_ms - num(cand.get("ts")) > max_age_ms:      # قديمٌ جداً: لا نُوقظ به أحداً
                continue
            if best is None or num(cand.get("ts")) > num(best.get("ts")):
                best, kind = cand, k
        if not best:
            quiet += 1
            continue

        if kind == "task":
            title = "✏️ واجب جديد من معلمك"
            body = MODE_AR.get(str(best.get("mode") or "ws"), "ورقة") + ": " + str(best.get("t") or "")[:70]
        else:
            title = "📬 رسالة من معلمك"
            body = KIND_AR.get(str(best.get("k") or "free"), "رسالة") + " — " + str(best.get("t") or "")[:70]

        alert = {
            "payload": {"title": title, "body": body, "tag": "sijil-s-" + kind, "url": "./s/"},
            "sub": {"ep": ep, "p256dh": str(d.get("p256dh") or ""), "auth": str(d.get("auth") or "")},
        }
        log("→ %s | %s | %s" % (cid, kind, body[:52]))
        if args.dry_run:
            sent += 1
            continue

        ok, code, why = send_one(alert, vp, vs)
        if ok:
            sent += 1
            set_doc(store, "pushlog/s_" + mk, {"last": num(best.get("ts")), "ts": now_ms, "kind": kind})
        elif code in (404, 410):
            store.delete("spush/" + mk)
            cleaned += 1
        else:
            log("  ✖ تعذّر الإرسال (%s %s)" % (code, why))

    log("أُرسل %d · بلا جديد %d · اشتراكات منتهية حُذفت %d" % (sent, quiet, cleaned))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
