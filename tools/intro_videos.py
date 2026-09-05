# -*- coding: utf-8 -*-
"""تجهيز مقاطع Seedance للجولة: تحويل إلى 720p (h264 baseline، صامت) + نسخة 540p للجوال + ملصق webp،
وتحديث assets/intro/video/manifest.json الذي تقرأه media.js لتفعيل الفيديو على الشاشات.

الاستخدام:
  python tools/intro_videos.py add sd-board path/to/downloaded.mp4
  python tools/intro_videos.py add sd-courtyard https://.../clip.mp4      (يُنزَّل أولاً)
  python tools/intro_videos.py list
الأسماء المعتمدة: sd-courtyard (لوحة البوابة s1)، sd-board (السبورة s3)، sd-flight (النافذة s5)، sd-aerial (لوح المدير s7)
"""
import sys, io, os, json, subprocess, urllib.request, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VDIR = os.path.join(ROOT, 'assets', 'intro', 'video'); os.makedirs(VDIR, exist_ok=True)
MANIFEST = os.path.join(VDIR, 'manifest.json')
NAMES = {'sd-courtyard': 's1', 'sd-board': 's3', 'sd-flight': 's5', 'sd-aerial': 's7'}

def ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which('ffmpeg') or 'ffmpeg'

def load():
    try: return json.load(open(MANIFEST, encoding='utf-8'))
    except Exception: return {'clips': {}}

def save(m):
    json.dump(m, open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

def add(name, src):
    if name not in NAMES: raise SystemExit('اسم غير معتمد: ' + name + ' — المسموح: ' + ', '.join(NAMES))
    if src.startswith('http'):
        tmp = os.path.join(VDIR, name + '.src.mp4'); print('تنزيل…', src); urllib.request.urlretrieve(src, tmp); src = tmp
    ff = ffmpeg(); out = os.path.join(VDIR, name + '.mp4'); outm = os.path.join(VDIR, name + '-m.mp4'); poster = os.path.join(VDIR, name + '.webp')
    base = [ff, '-y', '-i', src, '-an', '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-preset', 'slow']
    subprocess.check_call(base + ['-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720', '-b:v', '2500k', '-maxrate', '2800k', '-bufsize', '5000k', out])
    subprocess.check_call(base + ['-vf', 'scale=960:540:force_original_aspect_ratio=increase,crop=960:540', '-b:v', '1400k', '-maxrate', '1600k', '-bufsize', '3000k', outm])
    subprocess.check_call([ff, '-y', '-ss', '1', '-i', out, '-frames:v', '1', '-vf', 'scale=960:-1', '-q:v', '80', poster])
    if src.endswith('.src.mp4'): os.remove(src)
    m = load(); m['clips'][name] = {'mp4': f'assets/intro/video/{name}.mp4', 'mobile': f'assets/intro/video/{name}-m.mp4', 'poster': f'assets/intro/video/{name}.webp', 'station': NAMES[name]}
    save(m)
    for p in (out, outm, poster): print(os.path.relpath(p, ROOT), os.path.getsize(p) // 1024, 'KB')
    print('manifest محدّث:', list(m['clips']))

if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] == 'list': print(json.dumps(load(), ensure_ascii=False, indent=1))
    elif a[0] == 'add' and len(a) == 3: add(a[1], a[2])
    else: print(__doc__)
