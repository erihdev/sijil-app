# -*- coding: utf-8 -*-
"""خبز مقاطع قصيرة (4–6 ثوانٍ، صامتة، حلقية) من مولّدات الشاشات الحيّة نفسها — بلا أي تكلفة خارجية.

لا يسجّل شاشة المتصفح ولا يعتمد على MediaRecorder (توقيته بساعة الحائط فيهتزّ الطول):
يستدعي مولّد الشاشة نفسه (js/intro/screens.js) إطاراً بإطار عند أزمنة مضبوطة
age = i * cycle / N داخل صفحة Playwright، فيخرج المقطع بطول دورة المولّد بالضبط
(حلقة لا تُرى بدايتها)، ثم يرمّزه imageio-ffmpeg إلى MP4 (h264 baseline، بلا صوت)
مع نسخة جوال وملصق webp، بحجم ≤ 400KB للمقطع.

  python tools/bake_loops.py --list                          # المولّدات وأطوال دوراتها
  python tools/bake_loops.py sd-board --out DIR              # مقطع واحد إلى مجلد معاينة
  python tools/bake_loops.py sd-board --gen quiz --register  # ويسجّله في manifest.json

⚠ متى يُستعمل: media.js تعطي **الأولوية للفيديو على المولّد الحي**، فتسجيل مقطع في
manifest.json يُلغي الشاشة الحيّة لتلك المحطة ويضيف تنزيلاً. لا تفعل ذلك إلا إذا أثبت
القياس أن الشاشة الحيّة مكلفة (media.perf().msPerFrame). القياس الحالي: ‎0.31ms/إطار على
المكتب و‎0.15ms على الجوال — أي أن الشاشات الحيّة أرخص من أي فيديو، فلا مقاطع مسجّلة.
"""
import sys, io, os, json, time, base64, argparse, subprocess, shutil, tempfile
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VDIR = os.path.join(ROOT, 'assets', 'intro', 'video')
MANIFEST = os.path.join(VDIR, 'manifest.json')
GPU_ARGS = ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']
# أسماء المقاطع التي تطلبها المحطات (station.clip) ← المولّد المناسب لكل منها
CLIPS = {
    'sd-courtyard': ('s1', 'honor'),
    'sd-board': ('s3', 'live'),
    'sd-flight': ('s5', 'quiz'),
    'sd-aerial': ('s7', 'levels'),
}

HARNESS = """<!doctype html><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Changa:wght@700;800&family=Tajawal:wght@500;700;800&display=swap" rel="stylesheet">
<body style="margin:0;background:#071322"><canvas id="c"></canvas>
<script src="{src}"></script>
<script>
window.__ready = (async () => {{
  try {{ await document.fonts.load('800 40px Changa'); await document.fonts.load('700 28px Tajawal'); await document.fonts.ready; }} catch (e) {{}}
  return !!(window.SIJIL_INTRO && SIJIL_INTRO.screens);
}})();
window.__setup = (w, h) => {{
  const c = document.getElementById('c');
  c.width = w; c.height = h; c.style.width = (w / 2) + 'px';
  window.__c2d = c.getContext('2d', {{ alpha: false }});
  return true;
}};
window.__frame = (name, w, h, age, p, mobile, quality) => {{
  const fn = SIJIL_INTRO.screens.get(name);
  if (!fn) return null;
  const st = {{ age: age, p: p, k: Math.min(w, h) / 288, w: w, h: h,
               hi: w >= 768, mobile: !!mobile, reduced: false, name: name }};
  window.__c2d.save();
  fn(window.__c2d, w, h, age, p, st);
  window.__c2d.restore();
  return document.getElementById('c').toDataURL('image/jpeg', quality);
}};
</script>"""


def ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which('ffmpeg') or 'ffmpeg'


def human(n):
    return '%.1f KB' % (n / 1024.0) if n < 1024 * 1024 else '%.2f MB' % (n / 1048576.0)


def load_manifest():
    try:
        return json.load(open(MANIFEST, encoding='utf-8'))
    except Exception:
        return {'clips': {}}


def encode(ff, frames_dir, out, fps, w, crf, scale=None):
    vf = 'scale=%d:-2:flags=lanczos' % scale if scale else 'null'
    cmd = [ff, '-y', '-framerate', str(fps), '-i', os.path.join(frames_dir, 'f%04d.jpg'),
           '-an', '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-c:v', 'libx264',
           '-profile:v', 'baseline', '-level', '3.1', '-preset', 'slow', '-crf', str(crf),
           '-g', str(fps * 2), '-vf', vf, out]
    subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return os.path.getsize(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('clip', nargs='?', default='', help='اسم المقطع: ' + ', '.join(CLIPS))
    ap.add_argument('--gen', default='', help='اسم المولّد (افتراضه مرتبط باسم المقطع)')
    ap.add_argument('--port', type=int, default=8942)
    ap.add_argument('--base', default=None)
    ap.add_argument('--size', default='1024x576', help='دقة المقطع، مثل 1024x576 أو 576x1024')
    ap.add_argument('--fps', type=int, default=24)
    ap.add_argument('--seconds', type=float, default=0, help='طول التشغيل بالثواني (0 = تلقائي 4–6)')
    ap.add_argument('--exact', action='store_true', help='سرعة ١× (الطول = دورة المولّد كاملة ولو تجاوزت 6ث)')
    ap.add_argument('--p', type=float, default=0.6, help='تقدّم المحطة الممرَّر للمولّد')
    ap.add_argument('--max-kb', type=int, default=400)
    ap.add_argument('--out', default='', help='مجلد الإخراج (افتراضه assets/intro/video)')
    ap.add_argument('--register', action='store_true', help='يحدّث assets/intro/video/manifest.json')
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--sw', action='store_true')
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright
    from PIL import Image

    srv = None
    base = a.base
    if not base:
        srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(a.port), '--bind', '127.0.0.1',
                                '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.3)
        base = 'http://127.0.0.1:%d/' % a.port
    out_dir = a.out or VDIR
    os.makedirs(out_dir, exist_ok=True)
    rc = 0
    try:
        with sync_playwright() as pw:
            br = pw.chromium.launch(args=([] if a.sw else GPU_ARGS))
            pg = br.new_page(viewport={'width': 900, 'height': 700})
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.set_content(HARNESS.format(src=base + 'js/intro/screens.js'), wait_until='load')
            ok = pg.evaluate('window.__ready')
            if not ok:
                print('تعذّر تحميل js/intro/screens.js من', base); return 2
            meta = pg.evaluate('SIJIL_INTRO.screens.meta')
            if a.list or not a.clip:
                print('المولّدات:')
                for k, v in meta.items():
                    print('  %-11s %-16s دورة %.1f ث — %s' % (k, v.get('title', ''), v.get('cycle', 0), v.get('hint', '')))
                print('\nالمقاطع المعتمدة (station.clip):')
                for k, (stn, gen) in CLIPS.items():
                    print('  %-13s → %s (المولّد الافتراضي: %s)' % (k, stn, gen))
                print('\nmanifest الحالي:', json.dumps(load_manifest(), ensure_ascii=False))
                return 0
            if a.clip not in CLIPS:
                print('اسم مقطع غير معتمد:', a.clip, '— المسموح:', ', '.join(CLIPS)); return 2
            station, gen = CLIPS[a.clip]
            gen = a.gen or gen
            if gen not in meta:
                print('مولّد غير معروف:', gen, '— المتاح:', ', '.join(meta)); return 2
            w, h = [int(x) for x in a.size.lower().split('x')]
            cycle = float(meta[gen].get('cycle') or 6.0)
            # الحلقة تُغطّي دورة المولّد كاملة دائماً (وإلا ظهر قطع عند التكرار)؛
            # إن كانت الدورة أطول من الميزانية تُضغط زمنياً (سرعة cycle/dur) بدل بترها.
            dur = a.seconds or (cycle if a.exact else max(4.0, min(6.0, cycle)))
            n = max(2, int(round(dur * a.fps)))
            speed = cycle / dur
            pg.evaluate('([w,h]) => window.__setup(w,h)', [w, h])
            tmp = tempfile.mkdtemp(prefix='sijil_loop_')
            t0 = time.time()
            for i in range(n):
                # الزمن يلفّ على دورة المولّد بالضبط ⇒ الإطار الأخير يسبق الأول مباشرة (حلقة سلسة)
                age = i * cycle / n
                url = pg.evaluate('(a) => window.__frame(a.n, a.w, a.h, a.age, a.p, a.m, 0.95)',
                                  {'n': gen, 'w': w, 'h': h, 'age': age, 'p': a.p, 'm': w < h})
                if not url:
                    print('فشل رسم الإطار', i); return 2
                with open(os.path.join(tmp, 'f%04d.jpg' % (i + 1)), 'wb') as f:
                    f.write(base64.b64decode(url.split(',', 1)[1]))
            print('%d إطاراً بـ %dx%d (%s، دورة %.1fث، طول %.1fث، سرعة %.2f×) في %.1fث'
                  % (n, w, h, gen, cycle, dur, speed, time.time() - t0))
            if errs:
                print('⚠ أخطاء الصفحة:', errs[:3])

            ff = ffmpeg()
            out = os.path.join(out_dir, a.clip + '.mp4')
            outm = os.path.join(out_dir, a.clip + '-m.mp4')
            poster = os.path.join(out_dir, a.clip + '.webp')
            size = 0
            for crf in (24, 27, 30, 34):
                size = encode(ff, tmp, out, a.fps, w, crf)
                if size <= a.max_kb * 1024:
                    break
            msize = encode(ff, tmp, outm, a.fps, w, min(crf + 4, 36), scale=(w // 2 // 2) * 2)
            Image.open(os.path.join(tmp, 'f%04d.jpg' % (n // 2 + 1))).convert('RGB').save(poster, 'WEBP', quality=82, method=6)
            shutil.rmtree(tmp, ignore_errors=True)
            for p in (out, outm, poster):
                print(' ', os.path.relpath(p, ROOT).replace('\\', '/'), human(os.path.getsize(p)))
            if size > a.max_kb * 1024:
                print('⚠ المقطع تجاوز %d KB حتى عند crf=%d' % (a.max_kb, crf)); rc = 1

            entry = {'mp4': 'assets/intro/video/%s.mp4' % a.clip, 'mobile': 'assets/intro/video/%s-m.mp4' % a.clip,
                     'poster': 'assets/intro/video/%s.webp' % a.clip, 'station': station, 'gen': gen,
                     'seconds': round(dur, 2), 'speed': round(speed, 2)}
            if a.register:
                if os.path.abspath(out_dir) != os.path.abspath(VDIR):
                    print('⚠ --register يتطلب الإخراج داخل assets/intro/video'); return 1
                m = load_manifest(); m.setdefault('clips', {})[a.clip] = entry
                json.dump(m, open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
                print('manifest محدّث:', list(m['clips']),
                      '\n⚠ هذه المحطة صارت فيديو بدل الشاشة الحيّة — تأكد أن هذا مقصود.')
            else:
                print('لم يُسجَّل في manifest (استعمل --register). القيد الجاهز:')
                print(' ', json.dumps({a.clip: entry}, ensure_ascii=False))
            br.close()
    finally:
        if srv:
            srv.terminate()
    return rc


if __name__ == '__main__':
    sys.exit(main())
