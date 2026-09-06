#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سجلي — مُرسل تنبيهات الحصص (يُشغَّل من المهمة المجدولة في GitHub Actions)

ماذا يفعل؟
  يقرأ من Firestore بحساب خدمة: جدول الحصص ``schedule/all``، وأوقات الأجراس ``cfg/bell``،
  والمعلمين ``teachers``، والفصول ``classes``، واشتراكات الإشعارات ``push/*``.
  ثم يحسب بتوقيت الرياض أي حصة ستبدأ خلال نافذة 3–12 دقيقة، ويرسل لصاحبها إشعاراً
  عربياً عنوانه «الحصة الثالثة بعد قليل» ونصه «رابع (أ) — تبدأ 9:15».

منع التكرار:
  قبل كل إرسال يُنشأ المستند ``pushlog/{معرّف المعلم}_{التاريخ}_{رقم الحصة}``.
  الإنشاء بمعرّف محدَّد عملية ذرّية في Firestore: إن كان المستند موجوداً يرجع الخادم 409
  فنعرف أن التنبيه أُرسل في تشغيل سابق ونتخطّاه. لا يُرسل تنبيه واحد مرتين أبداً.

التنظيف:
  اشتراك يرفضه خادم الدفع بـ 404 أو 410 يعني أن المعلم أزال التطبيق أو انتهت صلاحية
  اشتراكه، فيُحذف المستند ``push/{معرّف المعلم}`` تلقائياً.

الأسرار (من متغيرات البيئة فقط — ولا يُطبع أي منها ولا أي عنوان اشتراك):
  SA_JSON        محتوى مفتاح حساب الخدمة (JSON نصاً، أو مُرمَّزاً بـ base64)
  VAPID_PRIVATE  المفتاح الخاص لـ VAPID (base64url خام 32 بايت، أو PEM، أو مسار ملف)
  VAPID_SUB      عنوان المسؤول، مثل mailto:someone@example.com

متغيرات اختيارية:
  SIJIL_PROJECT  معرّف مشروع Firebase (الافتراضي sijil-app-de556)
  SIJIL_URL      الرابط الذي تفتحه نقرة الإشعار (الافتراضي ./ أي جذر التطبيق)

التشغيل:
  python tools/push_send.py                     إرسال حقيقي
  python tools/push_send.py --dry-run           حساب وطباعة بلا إرسال وبلا كتابة
  python tools/push_send.py --dry-run --now 09:10 --day الأحد     تجربة لحظة بعينها
  python tools/push_send.py --window 3 12       تغيير نافذة الدقائق

رمز الخروج: 0 عند النجاح (ولو لم يكن هناك ما يُرسل)، 1 عند خطأ يمنع العمل.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import datetime as dt
import json
import math
import os
import sys

# ═══════════════════════ ثوابت المدرسة ═══════════════════════

# المملكة على توقيت واحد طوال السنة (UTC+3) بلا توقيت صيفي، فنثبّته بدل الاعتماد
# على قاعدة بيانات المناطق الزمنية التي قد تغيب عن بعض الأنظمة.
RIYADH = dt.timezone(dt.timedelta(hours=3), "Asia/Riyadh")

# ترتيب الأيام كما في js/app.js: الأحد = 0 (نفس ترتيب Date.getDay في المتصفح)
DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
ORD = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة",
       "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية عشرة", "الثانية عشرة"]

# الافتراضي عند غياب cfg/bell — نسخة طبق الأصل من BELL_DEF في js/admin/core.js
BELL_DEF = {"start": 420, "len": 45, "n": 7,
            "breaks": [{"after": 3, "min": 30, "n": "الفسحة"}], "lens": {}, "days": {}}
MAXDAY = 24 * 60

PROJECT = os.environ.get("SIJIL_PROJECT", "sijil-app-de556")
API = "https://firestore.googleapis.com/v1"
SCOPE = "https://www.googleapis.com/auth/datastore"

# نافذة الإرسال بالدقائق قبل بداية الحصة: أوسع من فترة الجدولة (5 دقائق) حتى لا تُفوَّت حصة
LEAD_LO, LEAD_HI = 3, 12


def log(*parts: object) -> None:
    """طباعة سطر عربي على الخرج القياسي."""
    print(" ".join(str(p) for p in parts), flush=True)


# ═══════════════════════ محرك الأجراس ═══════════════════════
# نقل حرفي عن js/admin/core.js (BELL_DEF · normLens · normBreaks · fitDay · normBell · periodsOf).
# **مصدر الحقيقة هو core.js**: أي تعديل هناك على حساب الأوقات يجب أن يُنقل إلى هنا حرفياً،
# وإلا اختلف ما يراه المعلم في التطبيق عمّا يحسبه المُرسِل، فوصله تنبيه في الوقت الخطأ.
# للتأكد من التطابق يوجد في مجلد العمل المؤقّت مقارِن يشغّل core.js داخل Node على عشرات
# الإعدادات ويطابق نتائجها بهذا الملف (bell_ref.js مع test_push_send.py).

def ordn(p: object) -> str:
    """«الثالثة» لرقم الحصة 3."""
    try:
        i = int(p)
    except (TypeError, ValueError):
        return str(p)
    return ORD[i] if 0 <= i < len(ORD) else str(i)


def hm(m: int) -> str:
    """دقائق من منتصف الليل إلى «9:15»."""
    m = int(round(m))
    return "%d:%02d" % (m // 60, m % 60)


def num(v: object):
    """يقابل num() في core.js: عدد صحيح مقرَّب أو None إن لم يكن عدداً."""
    if isinstance(v, bool) or v is None:
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(x) or math.isinf(x):
        return None
    return int(math.floor(x + 0.5))       # Math.round يقرّب النصف إلى الأعلى


def clamp(v: object, lo: int, hi: int, dflt):
    x = num(v)
    if x is None:
        return dflt
    return min(hi, max(lo, x))


def norm_lens(raw: object, n: int) -> dict:
    out: dict = {}
    if not isinstance(raw, dict):
        return out
    for k, val in raw.items():
        p = num(k)
        v = clamp(val, 5, 120, 0)
        if p is not None and 1 <= p <= n and v:
            out[str(p)] = v
    return out


def norm_breaks(raw: object, n: int) -> list:
    if not isinstance(raw, list):
        return []
    seen: set = set()
    out: list = []
    for b in raw:
        if not isinstance(b, dict) or len(out) >= 4:
            continue
        after = num(b.get("after"))
        mins = clamp(b.get("min"), 1, 90, 0)
        if after is None or after < 1 or after > n - 1 or not mins or after in seen:
            continue
        seen.add(after)
        name = str(b.get("n") if b.get("n") is not None else "").strip()[:40]
        out.append({"after": after, "min": mins,
                    "n": name or ("فسحة بعد الحصة " + ordn(after))})
    out.sort(key=lambda x: x["after"])
    return out


def def_day() -> dict:
    """الجدول الاحتياطي ليوم واحد — نسخة جديدة في كل نداء."""
    return {"start": BELL_DEF["start"], "len": BELL_DEF["len"], "n": BELL_DEF["n"],
            "breaks": [dict(b) for b in BELL_DEF["breaks"]], "lens": {}}


def fit_day(c: dict, fb: dict) -> dict:
    """حدّ منتصف الليل (يقابل fitDay في core.js): تُقصّ الحصص التي تتخطّى 24:00،
    وإن لم تتّسع ولو حصة واحدة عاد اليوم إلى الجدول الاحتياطي."""
    t = c["start"]
    fit = 0
    for p in range(1, c["n"] + 1):
        L = c["lens"].get(str(p)) or c["len"]
        if t + L > MAXDAY:
            break
        t += L
        fit = p
        b = next((x for x in c["breaks"] if x["after"] == p), None)
        if b and p < c["n"]:
            if t + b["min"] > MAXDAY:
                break
            t += b["min"]
    if fit >= c["n"]:
        return c
    if fit < 1:
        return fb
    c["n"] = fit
    c["breaks"] = [x for x in c["breaks"] if x["after"] <= fit - 1]
    c["lens"] = norm_lens(c["lens"], fit)
    return c


def norm_bell(raw: object) -> dict:
    """الإعداد الفعّال (المخزَّن أو الافتراضي) — يتجاهل ما لا يصلح ويكمل الناقص."""
    src = raw if isinstance(raw, dict) else {}
    n = clamp(src.get("n"), 1, 12, BELL_DEF["n"])
    cfg = fit_day({
        "start": clamp(src.get("start"), 0, MAXDAY - 1, BELL_DEF["start"]),
        "len": clamp(src.get("len"), 5, 120, BELL_DEF["len"]),
        "n": n,
        "breaks": norm_breaks(src["breaks"] if "breaks" in src else BELL_DEF["breaks"], n),
        "lens": norm_lens(src.get("lens"), n),
    }, def_day())
    cfg["days"] = {}
    days = src.get("days")
    if isinstance(days, dict):
        for d in DAYS:
            o = days.get(d)
            if not isinstance(o, dict):
                continue
            dn = clamp(o["n"], 1, 12, cfg["n"]) if "n" in o else cfg["n"]
            cfg["days"][d] = fit_day({
                "n": dn,
                "start": clamp(o["start"], 0, MAXDAY - 1, cfg["start"]) if "start" in o else cfg["start"],
                "len": clamp(o["len"], 5, 120, cfg["len"]) if "len" in o else cfg["len"],
                "breaks": norm_breaks(o["breaks"] if "breaks" in o else cfg["breaks"], dn),
                "lens": norm_lens(o["lens"] if "lens" in o else cfg["lens"], dn),
            }, {"n": cfg["n"], "start": cfg["start"], "len": cfg["len"],
                "breaks": [dict(b) for b in cfg["breaks"]],
                "lens": norm_lens(cfg["lens"], cfg["n"])})
    return cfg


def eff_of(cfg: dict, day: str | None) -> dict:
    return (cfg.get("days") or {}).get(day) or cfg


def periods_of(cfg: dict, day: str | None) -> list:
    """كل عناصر اليوم بالترتيب: حصص {p, from, to} وفسح {brk, n, from, to} بالدقائق."""
    c = eff_of(cfg, day)
    out: list = []
    t = c["start"]
    for p in range(1, c["n"] + 1):
        L = c["lens"].get(str(p)) or c["len"]
        out.append({"p": p, "from": t, "to": t + L})
        t += L
        b = next((x for x in c["breaks"] if x["after"] == p), None)
        if b and p < c["n"]:
            out.append({"brk": True, "n": b["n"], "from": t, "to": t + b["min"]})
            t += b["min"]
    return out


def periods_only(cfg: dict, day: str | None) -> list:
    return [x for x in periods_of(cfg, day) if not x.get("brk")]


# ═══════════════════════ حساب من يستحق تنبيهاً الآن ═══════════════════════

def plan_alerts(now: dt.datetime, rows: list, bell_raw: object, teachers: list,
                classes: dict, subs: dict, lo: int = LEAD_LO, hi: int = LEAD_HI,
                url: str = "./") -> list:
    """
    دالة خالصة (بلا شبكة) — قلب الحساب، وعليها تقوم اختبارات الوحدات.

    now       لحظة بتوقيت الرياض
    rows      صفوف schedule/all: [{t: اسم المعلم, d: اسم اليوم, p: رقم الحصة, c: معرّف الفصل}]
    bell_raw  محتوى cfg/bell كما هو (أو None للافتراضي)
    teachers  [{id, name}]
    classes   {معرّف الفصل: اسمه}
    subs      {معرّف المعلم: {ep, p256dh, auth}}
    lo, hi    نافذة الدقائق قبل بداية الحصة

    تعيد قائمة تنبيهات جاهزة للإرسال، ومعها سبب تخطّي من لا اشتراك له.
    """
    cfg = norm_bell(bell_raw)
    day = DAYS[(now.weekday() + 1) % 7]           # weekday: الإثنين 0 → نُعيده لترتيب getDay
    m = now.hour * 60 + now.minute
    date = now.strftime("%Y-%m-%d")

    starts = {int(b["p"]): int(b["from"]) for b in periods_only(cfg, day)}
    by_name: dict = {}
    for t in teachers:
        nm = str((t or {}).get("name") or "").strip()
        tid = str((t or {}).get("id") or "").strip()
        if nm and tid:
            by_name.setdefault(nm, []).append(tid)

    # تجميع: لكل (معلم، حصة) قائمة فصول — قد يحمل المعلم فصلين في حصة واحدة (نادر لكنه وارد)
    hits: dict = {}
    for r in rows or []:
        if not isinstance(r, dict) or str(r.get("d") or "") != day:
            continue
        p = num(r.get("p"))
        if p is None or p not in starts:
            continue                              # حصة خارج جدول أجراس هذا اليوم
        mins = starts[p] - m
        if mins < lo or mins > hi:
            continue
        tname = str(r.get("t") or "").strip()
        if not tname:
            continue
        for tid in by_name.get(tname, []):
            key = (tid, p)
            slot = hits.setdefault(key, {"tid": tid, "tname": tname, "p": p,
                                         "start": starts[p], "mins": mins, "classes": []})
            cname = str(classes.get(str(r.get("c") or "")) or "").strip()
            if cname and cname not in slot["classes"]:
                slot["classes"].append(cname)

    out: list = []
    for (tid, p), slot in sorted(hits.items(), key=lambda kv: (kv[1]["start"], kv[0][0])):
        names = " و".join(slot["classes"])
        title = "الحصة %s بعد قليل" % ordn(p)
        body = ("%s — تبدأ %s" % (names, hm(slot["start"]))) if names else ("تبدأ " + hm(slot["start"]))
        sub = subs.get(tid)
        out.append({
            "tid": tid, "tname": slot["tname"], "p": p, "classes": slot["classes"],
            "start": slot["start"], "mins": slot["mins"], "day": day, "date": date,
            "logid": "%s_%s_%d" % (tid, date, p),
            "tag": "sijil-class-%s-%d" % (date, p),
            "title": title, "body": body,
            "payload": {"title": title, "body": body,
                        "tag": "sijil-class-%s-%d" % (date, p), "url": url},
            "sub": sub, "skip": None if sub else "لا اشتراك",
        })
    return out


# ═══════════════════════ عميل Firestore بحساب الخدمة ═══════════════════════

def load_sa(raw: str) -> dict:
    """يقبل مفتاح حساب الخدمة نصاً JSON أو مُرمَّزاً بـ base64. لا يطبع شيئاً من محتواه."""
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("المتغيّر SA_JSON فارغ")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    try:
        return json.loads(base64.b64decode(raw + "=" * (-len(raw) % 4)).decode("utf-8"))
    except (ValueError, binascii.Error, UnicodeDecodeError):
        raise ValueError("المتغيّر SA_JSON ليس JSON صالحاً ولا base64 لمفتاح حساب خدمة")


def decode(v: object):
    """قيمة Firestore REST → قيمة بايثون عادية."""
    if not isinstance(v, dict):
        return None
    if "stringValue" in v:
        return v["stringValue"]
    if "integerValue" in v:
        try:
            return int(v["integerValue"])
        except (TypeError, ValueError):
            return None
    if "doubleValue" in v:
        try:
            return float(v["doubleValue"])
        except (TypeError, ValueError):
            return None
    if "booleanValue" in v:
        return bool(v["booleanValue"])
    if "timestampValue" in v:
        return v["timestampValue"]
    if "nullValue" in v:
        return None
    if "mapValue" in v:
        return {k: decode(x) for k, x in ((v.get("mapValue") or {}).get("fields") or {}).items()}
    if "arrayValue" in v:
        return [decode(x) for x in ((v.get("arrayValue") or {}).get("values") or [])]
    return None


def fields(doc: object) -> dict:
    return {k: decode(x) for k, x in ((doc or {}).get("fields") or {}).items()}


class Store:
    """أقل ما يلزم من Firestore REST: قراءة مستند، سرد مجموعة، إنشاء بمعرّف، حذف."""

    def __init__(self, sa: dict):
        from google.oauth2 import service_account
        import google.auth.transport.requests as gar
        creds = service_account.Credentials.from_service_account_info(sa, scopes=[SCOPE])
        self.s = gar.AuthorizedSession(creds)
        self.base = "%s/projects/%s/databases/(default)/documents" % (API, PROJECT)

    def get(self, path: str):
        r = self.s.get("%s/%s" % (self.base, path), timeout=40)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return fields(r.json())

    def list(self, coll: str) -> dict:
        """يعيد {معرّف المستند: حقوله} لكل المجموعة مع تتبّع الصفحات."""
        out: dict = {}
        token = None
        while True:
            params = {"pageSize": 300}
            if token:
                params["pageToken"] = token
            r = self.s.get("%s/%s" % (self.base, coll), params=params, timeout=40)
            if r.status_code == 404:
                return out
            r.raise_for_status()
            j = r.json() or {}
            for d in (j.get("documents") or []):
                out[str(d.get("name", "")).rsplit("/", 1)[-1]] = fields(d)
            token = j.get("nextPageToken")
            if not token:
                return out

    def create(self, coll: str, doc_id: str, data: dict) -> bool:
        """إنشاء ذرّي بمعرّف محدَّد: True إن أُنشئ، False إن كان موجوداً (409)."""
        body = {"fields": {}}
        for k, v in data.items():
            if isinstance(v, bool):
                body["fields"][k] = {"booleanValue": v}
            elif isinstance(v, int):
                body["fields"][k] = {"integerValue": str(v)}
            else:
                body["fields"][k] = {"stringValue": str(v)}
        r = self.s.post("%s/%s" % (self.base, coll), params={"documentId": doc_id},
                        json=body, timeout=40)
        if r.status_code == 409:
            return False
        r.raise_for_status()
        return True

    def delete(self, path: str) -> bool:
        r = self.s.delete("%s/%s" % (self.base, path), timeout=40)
        return r.status_code in (200, 204, 404)


# ═══════════════════════ الإرسال ═══════════════════════

def send_one(alert: dict, vapid_private: str, vapid_sub: str) -> tuple:
    """يعيد (نجاح, رمز الحالة أو None, سبب الفشل المختصر)."""
    from pywebpush import webpush, WebPushException
    sub = alert["sub"]
    info = {"endpoint": sub["ep"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}}
    try:
        webpush(
            subscription_info=info,
            data=json.dumps(alert["payload"], ensure_ascii=False),
            vapid_private_key=vapid_private,
            vapid_claims={"sub": vapid_sub},      # نسخة جديدة كل مرة: pywebpush يضيف aud/exp
            ttl=600,
        )
        return True, 201, ""
    except WebPushException as e:
        code = getattr(getattr(e, "response", None), "status_code", None)
        return False, code, ("رفض الخادم" if code else "تعذّر الاتصال بخدمة الدفع")
    except Exception as e:                        # noqa: BLE001 — لا نُسقط بقية المعلمين
        return False, None, type(e).__name__


# ═══════════════════════ التشغيل ═══════════════════════

def parse_args(argv=None):
    ap = argparse.ArgumentParser(
        description="إرسال تنبيهات الحصص لمعلمي سجلي قبل بداية الحصة بدقائق.")
    ap.add_argument("--dry-run", action="store_true",
                    help="حساب وطباعة فقط: بلا إرسال وبلا كتابة أي شيء")
    ap.add_argument("--now", metavar="HH:MM", help="ساعة افتراضية بتوقيت الرياض (للتجربة)")
    ap.add_argument("--day", metavar="اليوم", help="اسم يوم عربي يتجاوز اليوم الفعلي (للتجربة)")
    ap.add_argument("--window", nargs=2, type=int, metavar=("من", "إلى"),
                    default=[LEAD_LO, LEAD_HI], help="نافذة الدقائق قبل الحصة (الافتراضي 3 12)")
    return ap.parse_args(argv)


def when(args) -> dt.datetime:
    now = dt.datetime.now(RIYADH)
    if args.now:
        try:
            h, mi = str(args.now).split(":")[:2]
            now = now.replace(hour=int(h), minute=int(mi), second=0, microsecond=0)
        except (ValueError, IndexError):
            raise SystemExit("قيمة --now يجب أن تكون بصيغة HH:MM")
    if args.day:
        if args.day not in DAYS:
            raise SystemExit("قيمة --day يجب أن تكون اسم يوم عربي مثل: الأحد")
        shift = (DAYS.index(args.day) - (now.weekday() + 1) % 7) % 7
        now = now + dt.timedelta(days=shift)
    return now


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    args = parse_args(argv)
    lo, hi = int(args.window[0]), int(args.window[1])
    now = when(args)
    url = (os.environ.get("SIJIL_URL") or "./").strip() or "./"

    log("سجلي — تنبيهات الحصص")
    log("اللحظة بتوقيت الرياض:", now.strftime("%Y-%m-%d %H:%M"),
        "·", DAYS[(now.weekday() + 1) % 7], "· النافذة: من", lo, "إلى", hi, "دقيقة")

    vapid_private = os.environ.get("VAPID_PRIVATE", "").strip()
    vapid_sub = os.environ.get("VAPID_SUB", "").strip()
    # مفتاح حساب الخدمة لازم دائماً (حتى للتجربة، لأن البيانات تُقرأ من قاعدة البيانات)،
    # ومفاتيح التوقيع لازمة للإرسال الحقيقي وحده.
    need = [("SA_JSON", os.environ.get("SA_JSON"))]
    if not args.dry_run:
        need += [("VAPID_PRIVATE", vapid_private), ("VAPID_SUB", vapid_sub)]
    missing = [n for n, v in need if not (v or "").strip()]
    if missing:
        log("توقّف: لم تُضبط الأسرار التالية في بيئة التشغيل:", "، ".join(missing))
        log("الخطوات كاملة في docs/PUSH_SETUP.md")
        return 1

    # ── القراءة ──
    try:
        st = Store(load_sa(os.environ.get("SA_JSON", "")))
        bell_raw = st.get("cfg/bell")
        sched = st.get("schedule/all") or {}
        rows = sched.get("rows") if isinstance(sched.get("rows"), list) else []
        teachers = [{"id": tid, "name": f.get("name")} for tid, f in st.list("teachers").items()]
        classes = {cid: (f.get("name") or "") for cid, f in st.list("classes").items()}
        subs_raw = st.list("push")
    except Exception as e:                        # noqa: BLE001
        log("توقّف: تعذّر قراءة البيانات من قاعدة البيانات —", type(e).__name__)
        return 1

    subs = {}
    for tid, f in subs_raw.items():
        if f.get("ep") and f.get("p256dh") and f.get("auth"):
            subs[tid] = {"ep": f["ep"], "p256dh": f["p256dh"], "auth": f["auth"]}

    # صيغة «الاسم: العدد» تقرأ صحيحة مع أي رقم بلا تعقيد صيغ الجمع العربية
    log("قُرئ — حصص الجدول:", len(rows), "· المعلمون:", len(teachers),
        "· الفصول:", len(classes), "· الأجهزة المشتركة:", len(subs))

    alerts = plan_alerts(now, rows, bell_raw, teachers, classes, subs, lo, hi, url)
    if not alerts:
        log("لا حصة تبدأ ضمن النافذة الآن — لا شيء يُرسل.")
        return 0

    sent = skipped = failed = removed = 0
    for a in alerts:
        who = "%s (%s)" % (a["tname"], a["tid"])
        what = "الحصة %s%s" % (ordn(a["p"]),
                               (" — " + " و".join(a["classes"])) if a["classes"] else "")
        if a["skip"]:
            skipped += 1
            log("  تخطّي:", who, "·", what, "·", a["skip"])
            continue
        if args.dry_run:
            log("  (تجربة) كان سيُرسل:", who, "·", what, "·", a["title"], "|", a["body"])
            sent += 1
            continue
        try:
            fresh = st.create("pushlog", a["logid"],
                              {"tid": a["tid"], "p": a["p"], "date": a["date"],
                               "ts": int(now.timestamp() * 1000)})
        except Exception as e:                    # noqa: BLE001
            failed += 1
            log("  فشل:", who, "·", what, "· تعذّر تسجيل الإرسال —", type(e).__name__)
            continue
        if not fresh:
            skipped += 1
            log("  تخطّي:", who, "·", what, "· أُرسل سابقاً اليوم")
            continue
        ok, code, why = send_one(a, vapid_private, vapid_sub)
        if ok:
            sent += 1
            log("  أُرسل:", who, "·", what)
            continue
        failed += 1
        if code in (404, 410):
            st.delete("push/" + a["tid"])
            removed += 1
            log("  حُذف اشتراك منتهٍ:", who, "· لم يعد جهازه يستقبل التنبيهات")
        else:
            # فشل عابر: نمسح سجل الإرسال ليُعاد المحاولة في التشغيل التالي داخل النافذة
            st.delete("pushlog/" + a["logid"])
            log("  فشل:", who, "·", what, "·", why, ("(%s)" % code) if code else "")

    log("الملخص — أُرسل:", sent, "· مُتخطّى:", skipped, "· فشل:", failed,
        "· اشتراكات محذوفة:", removed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
