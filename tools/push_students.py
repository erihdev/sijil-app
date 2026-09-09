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
  لا يُطبع رقم هوية ولا مفتاح صندوق ولا عنوان اشتراك ولا اسم طالب. وفي التشغيل الحقيقي لا
  يُطبع عنوانُ رسالةٍ ولا معرّف فصل أيضاً — عدّادُ النوع وحده — لأن الخرج يُصبّ في ملخّص
  مهمةٍ يقرؤه أي أحد في مستودعٍ عامّ. والتفصيل يبقى في ‎--dry-run‎ للفحص المحلي.
  واشتراكٌ يرفضه خادم الدفع بـ404/410 يُحذف مستنده.

الأسرار (من متغيرات البيئة، كما في tools/push_send.py):
  SA_JSON · VAPID_PRIVATE · VAPID_SUB

التشغيل:
  python tools/push_students.py                 إرسال حقيقي
  python tools/push_students.py --dry-run       حساب وطباعة بلا إرسال وبلا كتابة
  python tools/push_students.py --max-age 240   أقصى عمر للعنصر بالدقائق (الافتراضي 4320)

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
    # الخرج عربيٌّ وفيه ✖ و→: بلا هذا الحرس ينهار أول نداء log على أي بيئة لا تُعلن UTF-8
    #   (التشغيل اليدوي على ويندوز مثلاً) فتسقط المهمة كلها بلا إرسال شيء. نفسه في push_send.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    ap = argparse.ArgumentParser(description="إشعارات الطلاب: واجب جديد أو رسالة من المعلم")
    ap.add_argument("--dry-run", action="store_true", help="بلا إرسال وبلا كتابة")
    # الافتراضي يتجاوز فجوة الجدولة لا مدّة الحصة: نافذة cron تنتهي 13:55 بالرياض، فما يرسله
    #   المعلم عصراً لا يمرّ عليه تشغيلٌ إلا صباح الغد (فجوة ١٩ ساعة) وعطلة نهاية الأسبوع
    #   فجوتها ٥٩ ساعة. وكان الافتراضي ١٨٠ دقيقة فيُتخطّى العنصر بلا علامة ⇒ لا يصل أبداً.
    ap.add_argument("--max-age", type=int, default=4320, help="أقصى عمر للعنصر بالدقائق (٣ أيام)")
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
    sent = quiet = cleaned = gone = 0
    by_kind: dict = {}

    # الطالب المحذوف (حركة خروج to=="out") يبقى اشتراكه في spush ولا سبيل لحذفه من جهازه —
    # فلا يُرسل إليه شيء بعد خروجه. والبوابة ترفض دخوله أصلاً، فالإشعار وحده كان سيصله.
    left = set()
    for mid, mv in (store.list("moves") or {}).items():
        if str(mv.get("to") or "") == "out":
            left.add(str(mv.get("from") or "") + ":" + str(int(num(mv.get("si"), -1))))

    for mk, d in subs.items():
        cid = str(d.get("cid") or "")
        si = int(num(d.get("si"), -1))
        ep = str(d.get("ep") or "")
        if not mk or not cid or si < 0 or not ep:
            continue
        if (cid + ":" + str(si)) in left:
            gone += 1
            continue

        mark = store.get("pushlog/s_" + mk) or {}
        # علامةٌ لكل قناة: كانت علامةٌ واحدة تُكتب بزمن المُرسَل وحده، فإذا وصل الطالب
        #   «استدعاء لمقابلة» ثم ورقةُ عملٍ بعده بدقيقة ابتلع تنبيهُ الورقة تنبيهَ الاستدعاء
        #   إلى الأبد (زمنه صار أقلَّ من العلامة). وأول اشتراكٍ يبدأ من لحظته فلا تُصبّ عليه
        #   أوراق الفصل كلها.
        base = num(mark.get("last"), 0) or num(d.get("ts"), 0)
        last_of = {
            "task": num(mark.get("t_task"), 0) or base,
            "msg": num(mark.get("t_msg"), 0) or base,
        }

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

        # كل قناةٍ على حدة: أحدثُ ما فيها إن كان جديداً وليس أقدم من max-age
        due = []
        for cand, k in ((task, "task"), (msg, "msg")):
            if not cand or num(cand.get("ts")) <= last_of[k]:
                continue
            if now_ms - num(cand.get("ts")) > max_age_ms:      # قديمٌ جداً: لا نُوقظ به أحداً
                continue
            due.append((cand, k))
        if not due:
            quiet += 1
            continue
        due.sort(key=lambda x: num(x[0].get("ts")))            # الأقدم أولاً فيقرأه بترتيبه

        stamp = {"ts": now_ms}
        dead = False
        for best, kind in due:
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
            # السجل يُصبّ في ملخّص مهمةٍ عامّ في مستودعٍ عامّ: النوع وحده — لا عنوانَ يكتبه
            #   المعلم بيده ولا معرّف فصل. فـ«c2a | msg | استدعاء لمقابلة» ثلاث مرات كانت
            #   تُخبر العالم أن ثلاثة في ثاني (أ) استُدعي أولياء أمورهم ذلك الصباح.
            if args.dry_run:
                log("→ %s | %s | %s" % (cid, kind, body[:52]))
                sent += 1
                stamp["t_" + kind] = num(best.get("ts"))
                continue

            ok, code, why = send_one(alert, vp, vs)
            if ok:
                sent += 1
                by_kind[kind] = by_kind.get(kind, 0) + 1
                stamp["t_" + kind] = num(best.get("ts"))
            elif code in (404, 410):
                store.delete("spush/" + mk)
                cleaned += 1
                dead = True
                break
            else:
                log("  ✖ تعذّر الإرسال (%s %s)" % (code, why))
        if not dead and len(stamp) > 1:
            stamp["last"] = max(v for k, v in stamp.items() if k.startswith("t_"))
            if args.dry_run:
                continue
            set_doc(store, "pushlog/s_" + mk, stamp)

    if by_kind:
        log("النوع: " + " · ".join("%s %d" % (k, v) for k, v in sorted(by_kind.items())))
    log("أُرسل %d · بلا جديد %d · اشتراكات منتهية حُذفت %d · طلاب خارج القائمة %d" % (sent, quiet, cleaned, gone))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
