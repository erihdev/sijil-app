# -*- coding: utf-8 -*-
"""خبز ملصقات الجولة (assets/intro/posters/s1..s8.webp) من المشهد الحيّ نفسه — بلا أي تكلفة خارجية.

يشغّل المقدمة في Playwright بجودة عالية مثبّتة (adapt=0) على GPU حقيقي، يقف عند كل محطة
بالكاميرا الصحيحة وبالزمن الذي تبدو فيه الشاشة الحيّة في أجمل طور، ينتظر استقرار المشهد
(الخطوط + كل النسيج + أول إطار WebGL)، يخفي نصوص الواجهة (لأن قسم الملصق يرسم نصّه بنفسه)،
ثم يلتقط اللوحة ويحفظها WebP.

  python tools/bake_posters.py                     # الثمانية إلى assets/intro/posters
  python tools/bake_posters.py --only 3,5 --hold 3 # محطات مختارة بزمن انتظار أطول
  python tools/bake_posters.py --dry --preview DIR # بلا كتابة في المستودع (معاينة فقط)
  python tools/bake_posters.py --mobile            # يضيف sN-m.webp عمودية 720×1280
  python tools/bake_posters.py --port 8942 --quality 80 --sw

ملاحظات:
- الصورة الواحدة تخدم غرضين: خلفية #intro قبل أول إطار WebGL (عنصر LCP) وأقسام وضع posters،
  وكلاهما center/cover — لذلك تُختار اللحظات التي يكون فيها الموضوع في وسط الكادر.
- --mobile يكتب نسخاً عمودية لا يشير إليها أي ملف بعد (تحتاج media query في css/intro.css)،
  فلا تُفعّله ما لم يُطلب، حتى لا ينتفخ المستودع.
"""
import sys, io, os, json, time, argparse, subprocess, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTERS = os.path.join(ROOT, 'assets', 'intro', 'posters')
GPU_ARGS = ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']

# لكل محطة: p داخل المحطة (0..1) + ثوانٍ الانتظار بعد القفزة (طور الشاشة الحيّة) + ملاحظة الإطار
SHOTS = [
    # n,  p,    hold, العنوان (للتوثيق فقط)
    (1, 0.62, 2.4, 'البوابة واللوحة'),
    (2, 0.58, 3.2, 'الطابور ولوح الرصد'),
    (3, 0.60, 3.6, 'السبورة والورقة التفاعلية'),
    (4, 0.55, 2.6, 'جدار الدروس والعدّاد'),
    (5, 0.58, 3.0, 'النافذة والطائرات الورقية'),
    (6, 0.60, 4.0, 'الخزانة وتقرير ولي الأمر'),
    (7, 0.66, 3.4, 'السطح ولوح المدير'),
    (8, 0.45, 2.2, 'ليل المدرسة'),
]

# إخفاء كل ما ليس مشهداً: نصوص المحطات والعدّاد والتلميح والشريط وHUD وطبقة الملصقات
HIDE_JS = """() => {
  const kill = ['#intro-ui', '#intro-bar', '#intro-hud', '#intro-posters', '#intro-stamp', '#intro-replay'];
  kill.forEach(s => { const e = document.querySelector(s); if (e) { e.style.setProperty('display', 'none', 'important'); } });
  const intro = document.querySelector('#intro');
  if (intro) { intro.classList.add('is-live'); intro.style.backgroundImage = 'none'; }
  document.documentElement.style.setProperty('scrollbar-width', 'none');
  const st = document.createElement('style');
  st.textContent = '::-webkit-scrollbar{width:0!important;height:0!important}';
  document.head.appendChild(st);
  return true;
}"""

# t العام لمحطة رقمها n وبنسبة p داخلها (نفس حساب core: start + p*span)
TGLOBAL_JS = """(a) => {
  const W = (SIJIL_INTRO.stations || []).map(s => s.weight || 1);
  const T = W.reduce((x, y) => x + y, 0) || 1;
  let acc = 0;
  for (let k = 0; k < a.n - 1; k++) acc += W[k];
  return (acc + (W[a.n - 1] || 1) * a.p) / T;
}"""

STATE_JS = """() => ({
  i: SIJIL_INTRO.state.i, p: +SIJIL_INTRO.state.p.toFixed(3), t: +SIJIL_INTRO.state.t.toFixed(4),
  q: SIJIL_INTRO.state.quality, dpr: SIJIL_INTRO.state.dpr,
  tris: SIJIL_INTRO.state.tris, calls: SIJIL_INTRO.state.calls,
  live: !!document.querySelector('#intro') && document.querySelector('#intro').classList.contains('is-live'),
  screens: (SIJIL_INTRO.media && SIJIL_INTRO.media.screens || [])
    .filter(s => s.visible !== false && s.mesh && s.mesh.visible)
    .map(s => (s.mesh.name || '?') + ':' + (s.genName || s.source) + ':' + s.pw + 'x' + s.ph +
              (s.st ? ':age' + s.st.age.toFixed(1) : ''))
})"""


def human(n):
    return '%.1f KB' % (n / 1024.0) if n < 1024 * 1024 else '%.2f MB' % (n / 1048576.0)


def dir_size(path):
    tot = 0
    for r, _d, fs in os.walk(path):
        for f in fs:
            tot += os.path.getsize(os.path.join(r, f))
    return tot


def encode(png_bytes, out_path, quality, target_w=None):
    from PIL import Image
    im = Image.open(io.BytesIO(png_bytes)).convert('RGB')
    if target_w and im.width != target_w:
        h = int(round(im.height * target_w / float(im.width)))
        im = im.resize((target_w, h), Image.LANCZOS)
    im.save(out_path, 'WEBP', quality=quality, method=6)
    return im.size, os.path.getsize(out_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8942)
    ap.add_argument('--base', default=None, help='قاعدة URL جاهزة بدل تشغيل خادم')
    ap.add_argument('--only', default='', help='أرقام محطات مفصولة بفواصل، مثل 3,5')
    ap.add_argument('--quality', type=int, default=78)
    ap.add_argument('--width', type=int, default=1280, help='عرض الملصق الأفقي')
    ap.add_argument('--height', type=int, default=800)
    ap.add_argument('--mobile', action='store_true', help='يخبز أيضاً sN-m.webp عمودية 720×1280')
    ap.add_argument('--hold', type=float, default=0, help='يتجاوز زمن الانتظار المضبوط لكل محطة')
    ap.add_argument('--p', default='', help='يتجاوز p لمحطات بعينها، مثل 1:0.3,4:0.75')
    ap.add_argument('--dry', action='store_true', help='لا يكتب في assets/intro/posters')
    ap.add_argument('--tag', default='', help='لاحقة اسم للمعاينة فقط (مع --dry)')
    ap.add_argument('--preview', default='', help='مجلد يحفظ فيه PNG الخام + ورقة تباين')
    ap.add_argument('--sw', action='store_true', help='بلا GPU (SwiftShader) — أبطأ وأقل مطابقة')
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright

    only = set(int(x) for x in a.only.replace(' ', '').split(',') if x) if a.only else None
    pov = {}
    for it in a.p.replace(' ', '').split(','):
        if ':' in it:
            k, v = it.split(':', 1); pov[int(k)] = float(v)
    shots = [(n, pov.get(n, p), hold, note) for (n, p, hold, note) in SHOTS if not only or n in only]
    os.makedirs(POSTERS, exist_ok=True)
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
        os.makedirs(os.path.join(a.preview, 'after'), exist_ok=True)

    before_total = dir_size(os.path.join(ROOT, 'assets', 'intro'))
    before_posters = dir_size(POSTERS)
    print('assets/intro قبل:', human(before_total), '| منها posters:', human(before_posters))

    srv = None
    base = a.base
    if not base:
        srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(a.port), '--bind', '127.0.0.1',
                                '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.3)
        base = 'http://127.0.0.1:%d/' % a.port
    url = base + 'index.html?demo&intro=1&adapt=0'
    rows = []
    try:
        with sync_playwright() as pw:
            br = pw.chromium.launch(args=([] if a.sw else GPU_ARGS))
            for label, vw, vh, dsf, tw, suffix in (
                    ('desk', a.width, a.height, 1, a.width, ''),
                    ('mob', 360, 640, 2, 720, '-m')):
                if label == 'mob' and not a.mobile:
                    continue
                ctx = br.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=dsf,
                                     is_mobile=(label == 'mob'), has_touch=(label == 'mob'), locale='ar-SA')
                pg = ctx.new_page(); pg.set_default_timeout(30000)
                errs = []
                pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
                pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
                pg.goto(url, wait_until='domcontentloaded')
                pg.wait_for_function('window.SIJIL_INTRO && SIJIL_INTRO.state && SIJIL_INTRO.state.started',
                                     timeout=60000)
                # استقرار: الخطوط + أول إطار WebGL (is-live) + سكون الشبكة (كل النسيج والأطلس)
                pg.evaluate('document.fonts ? document.fonts.ready : true')
                pg.wait_for_function("document.querySelector('#intro') && "
                                     "document.querySelector('#intro').classList.contains('is-live')", timeout=40000)
                try:
                    pg.wait_for_load_state('networkidle', timeout=20000)
                except Exception:
                    pass
                pg.evaluate(HIDE_JS)
                gpu = pg.evaluate("""() => { try { const c = document.createElement('canvas');
                    const gl = c.getContext('webgl'); const d = gl.getExtension('WEBGL_debug_renderer_info');
                    return gl.getParameter(d.UNMASKED_RENDERER_WEBGL); } catch (e) { return '?' } }""")
                print('[%s] %dx%d dsf=%d — %s' % (label, vw, vh, dsf, gpu))

                for n, p, hold, note in shots:
                    t = pg.evaluate(TGLOBAL_JS, {'n': n, 'p': p})
                    pg.evaluate('(t) => SIJIL_INTRO.jumpTo(t)', t)
                    pg.wait_for_timeout(600)
                    try:
                        pg.wait_for_load_state('networkidle', timeout=8000)
                    except Exception:
                        pass
                    pg.wait_for_timeout(int((a.hold or hold) * 1000))
                    st = pg.evaluate(STATE_JS)
                    png = pg.locator('#intro-gl').screenshot(type='png')
                    name = 's%d%s%s.webp' % (n, suffix, a.tag)
                    out = os.path.join(POSTERS, name)
                    tmp = out if not a.dry else os.path.join(a.preview or POSTERS, '_dry_' + name)
                    size, nbytes = encode(png, tmp, a.quality, tw)
                    if a.preview:
                        with open(os.path.join(a.preview, 'after', 's%d%s%s.png' % (n, suffix, a.tag)), 'wb') as f:
                            f.write(png)
                        if not a.dry:
                            shutil.copyfile(out, os.path.join(a.preview, 'after', name))
                    rows.append({'n': n, 'file': name, 'px': '%dx%d' % size, 'bytes': nbytes,
                                 't': round(t, 4), 'p': p, 'hold': (a.hold or hold), 'note': note,
                                 'state': st})
                    print('  s%d %-26s %-9s %-9s i=%d p=%.2f tris=%d calls=%d %s'
                          % (n, note, '%dx%d' % size, human(nbytes), st['i'], st['p'], st['tris'],
                             st['calls'], ','.join(st['screens'])[:70]))
                if errs:
                    print('  ⚠ أخطاء console:', errs[:5])
                ctx.close()
            br.close()
    finally:
        if srv:
            srv.terminate()

    after_total = dir_size(os.path.join(ROOT, 'assets', 'intro'))
    after_posters = dir_size(POSTERS)
    print('assets/intro بعد:', human(after_total), '| منها posters:', human(after_posters),
          '| الفرق:', human(after_total - before_total))
    if a.preview:
        json.dump(rows, open(os.path.join(a.preview, 'bake_report.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
    if after_total > 6 * 1024 * 1024:
        print('⚠ assets/intro تجاوز 6 ميجابايت!')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
