/* سجل المتابعة الرقمي — الجولة السينمائية: الشاشات الحيّة (مولّدات إجرائية على CanvasTexture)
   لا فيديو ولا صور: كل شاشة داخل المدرسة تُرسم هنا حيّة بهوية سجلي (كحلي #0E2033، ذهبي #D7A93F،
   خطوط Changa/Tajawal، عربية RTL). media.js يستدعي المولّد ≤ 12 إطاراً/ثانية ويوقفه خارج الرؤية.

   الواجهة:
     SIJIL_INTRO.screens.get(name) -> function(c2d, w, h, time, p, st) | null
     SIJIL_INTRO.screens.register(name, fn, meta)
     SIJIL_INTRO.screens.list -> ['attendance','honor','quiz','parent','schedule','levels','live']
     SIJIL_INTRO.screens.meta[name] -> { title, cycle, hint }
   st = { age: ثوانٍ منذ تفعيل المولّد، p: تقدّم المحطة 0..1، k: وحدة القياس = min(w,h)/288،
          hi، mobile، reduced: تفضيل تقليل الحركة (إطار ساكن مكتمل)، name } */
(function (win) {
  'use strict';
  var NS = win.SIJIL_INTRO = win.SIJIL_INTRO || {};
  if (NS.screens && NS.screens.version >= 1) return;

  /* ---------- الهوية ---------- */
  var P = {
    night: '#071322', navy: '#0E2033', navy2: '#13293F', gold: '#D7A93F', paleGold: '#F0D99A',
    cream: '#F8F5EF', sky: '#9FC4E8', green: '#2F8F5B', greenUp: '#4FBF86', red: '#C2604F',
    amber: '#E2A33C', chat: '#123A2C'
  };
  var SUBJ = ['#D7A93F', '#9FC4E8', '#2F8F5B', '#C2604F', '#7FA5D8', '#E2A33C', '#5FBFA8', '#B98AC9', '#8FBF5A', '#E08A6B', '#6FA0C9'];
  var LEVELS = [
    { n: 'متقدم', c: '#2F8F5B' }, { n: 'متمكن', c: '#D7A93F' },
    { n: 'نامٍ', c: '#9FC4E8' }, { n: 'مبتدئ', c: '#C2604F' }
  ];
  /* أسماء وهمية فقط (لا اسم طالب حقيقي في أي أصل) */
  var NAMES = ['فهد العتيبي', 'ريان الحربي', 'عبدالله الشمري', 'تركي المالكي', 'يزيد السبيعي',
    'ماجد الغامدي', 'سلطان الدوسري', 'بدر القحطاني', 'خالد المطيري', 'عمر الزهراني'];

  var AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  function ar(n) {
    var s = '' + n, o = '', i, d;
    for (i = 0; i < s.length; i++) { d = s.charCodeAt(i) - 48; o += (d >= 0 && d <= 9) ? AR[d] : s.charAt(i); }
    return o;
  }
  function f(px, wt, fam) { return (wt || 700) + ' ' + Math.round(px) + 'px ' + (fam || 'Tajawal') + ', Changa, system-ui, sans-serif'; }
  function fh(px, wt) { return (wt || 800) + ' ' + Math.round(px) + 'px Changa, Tajawal, system-ui, sans-serif'; }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(x, a, b) { return clamp((x - a) / ((b - a) || 1), 0, 1); }
  function eOut(x) { return 1 - Math.pow(1 - clamp(x, 0, 1), 3); }
  function eBack(x) { x = clamp(x, 0, 1); var s = 1.7; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); }
  function rnd(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  function fillRR(c, x, y, w, h, r, style) { rr(c, x, y, w, h, r); c.fillStyle = style; c.fill(); }
  function strokeRR(c, x, y, w, h, r, style, lw) { rr(c, x, y, w, h, r); c.strokeStyle = style; c.lineWidth = lw; c.stroke(); }

  /* خلفية داكنة موحّدة تناسب إضاءة المشهد */
  function panel(c, w, h) {
    var g = c.createLinearGradient(0, 0, w * 0.35, h);
    g.addColorStop(0, P.navy2); g.addColorStop(1, P.night);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  /* شريط علوي: العنوان ذهبي يميناً، حالة صغيرة يساراً، وخط ذهبي رفيع */
  function head(c, w, h, k, title, right) {
    var hh = Math.round(28 * k);
    c.fillStyle = 'rgba(7,19,34,0.55)'; c.fillRect(0, 0, w, hh);
    c.textBaseline = 'middle'; c.textAlign = 'right';
    c.fillStyle = P.gold; c.font = fh(14 * k);
    c.fillText(title, w - 9 * k, hh * 0.54);
    if (right) {
      c.textAlign = 'left'; c.font = f(9.5 * k, 700);
      c.fillStyle = 'rgba(248,245,239,0.62)';
      c.fillText(right, 9 * k, hh * 0.54);
    }
    c.fillStyle = 'rgba(215,169,63,0.45)'; c.fillRect(0, hh - Math.max(1, k), w, Math.max(1, k));
    return hh;
  }
  function check(c, x, y, r, col, prog, lw) {
    prog = clamp(prog, 0, 1);
    c.strokeStyle = col; c.lineWidth = lw || r * 0.28; c.lineCap = 'round'; c.lineJoin = 'round';
    var ax = x - r * 0.62, ay = y + r * 0.05, bx = x - r * 0.18, by = y + r * 0.48, cx = x + r * 0.62, cy = y - r * 0.46;
    var t1 = Math.min(prog / 0.4, 1), t2 = seg(prog, 0.4, 1);
    c.beginPath(); c.moveTo(ax, ay);
    c.lineTo(lerp(ax, bx, t1), lerp(ay, by, t1));
    if (t2 > 0) c.lineTo(lerp(bx, cx, t2), lerp(by, cy, t2));
    c.stroke();
  }
  function star(c, x, y, r, col, a) {
    if (r <= 0.05) return;
    c.globalAlpha = a; c.fillStyle = col;
    c.beginPath();
    c.moveTo(x, y - r); c.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y);
    c.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
    c.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y);
    c.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r);
    c.fill(); c.globalAlpha = 1;
  }
  function wrap(c, text, maxW) {
    var words = text.split(' '), lines = [], cur = '', i, t;
    for (i = 0; i < words.length; i++) {
      t = cur ? cur + ' ' + words[i] : words[i];
      if (cur && c.measureText(t).width > maxW) { lines.push(cur); cur = words[i]; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  /* زمن دوري: يعيد المولّد للبداية؛ ومع تفضيل تقليل الحركة يُجمَّد عند لقطة مكتملة */
  function cyc(st, len, freeze) {
    if (st && st.reduced) return freeze == null ? len * 0.82 : freeze;
    var a = (st && st.age) || 0;
    return a - Math.floor(a / len) * len;
  }

  /* ================= ١) الرصد اليومي ================= */
  function attendance(c, w, h, time, p, st) {
    var k = st.k, cols = w / h > 1.25 ? 2 : 1, rows = cols === 2 ? 5 : 8, n = cols * rows;
    var STEP = 0.42, T = n * STEP + 2.6, a = cyc(st, T, n * STEP + 0.6);
    var done = Math.floor(a / STEP);
    var pres = 0, pts = 0, i;
    for (i = 0; i < Math.min(done, n); i++) { if (i % 4 !== 3) pres++; pts += (i % 4 === 3) ? 1 : 2; }

    panel(c, w, h);
    var hh = head(c, w, h, k, 'الرصد اليومي', 'الحصة الثالثة');

    var padX = 8 * k, gap = 5 * k;
    var colW = (w - padX * 2 - (cols - 1) * gap) / cols;
    var top = hh + 6 * k, rowH = (h - top - 20 * k - (rows - 1) * gap) / rows;
    c.textBaseline = 'middle';

    for (i = 0; i < n; i++) {
      var col = (cols - 1) - (i % cols), row = (i / cols) | 0;
      var x = padX + col * (colW + gap), y = top + row * (rowH + gap);
      var late = (i % 4 === 3);
      var on = i < done, pop = on ? eBack(seg(a - i * STEP, 0, 0.22)) : 0;
      var sc = on ? lerp(0.94, 1, pop) : 1;
      var cy = y + rowH / 2;

      c.save();
      c.translate(x + colW / 2, cy); c.scale(sc, sc); c.translate(-(x + colW / 2), -cy);
      fillRR(c, x, y, colW, rowH, 5 * k, on ? (late ? 'rgba(226,163,60,0.14)' : 'rgba(47,143,91,0.15)') : 'rgba(248,245,239,0.05)');
      if (on) strokeRR(c, x + 0.5, y + 0.5, colW - 1, rowH - 1, 5 * k, late ? 'rgba(226,163,60,0.45)' : 'rgba(47,143,91,0.5)', Math.max(1, k));

      /* الصورة الرمزية والاسم (يمين) */
      var rad = rowH * 0.3, acx = x + colW - 7 * k - rad;
      c.beginPath(); c.arc(acx, cy, rad, 0, 6.2832);
      c.fillStyle = on ? (late ? 'rgba(226,163,60,0.85)' : 'rgba(47,143,91,0.85)') : 'rgba(159,196,232,0.28)';
      c.fill();
      c.fillStyle = on ? P.night : 'rgba(248,245,239,0.7)';
      c.font = fh(rad * 1.05); c.textAlign = 'center';
      c.fillText(NAMES[i % NAMES.length].charAt(0), acx, cy + rad * 0.06);

      c.textAlign = 'right';
      c.fillStyle = on ? P.cream : 'rgba(248,245,239,0.5)';
      c.font = f(rowH * 0.32, 700);
      c.fillText(NAMES[i % NAMES.length], acx - rad - 6 * k, cy);

      /* شريحة الحالة (يسار) */
      var chH = rowH * 0.56, chX = x + 6 * k, chY = cy - chH / 2;
      var label = on ? (late ? 'متأخر' : 'حاضر') : '—';
      c.font = f(chH * (on ? 0.52 : 0.6), 700);
      var chW = Math.min(colW * 0.38, c.measureText(label).width + chH * 0.9);
      fillRR(c, chX, chY, chW, chH, chH / 2, on ? (late ? P.amber : P.green) : 'rgba(248,245,239,0.08)');
      c.fillStyle = on ? P.night : 'rgba(248,245,239,0.35)';
      c.textAlign = 'center';
      c.fillText(label, chX + chW / 2, cy + (on ? chH * 0.03 : 0));
      if (on) {
        var lift = seg(a - i * STEP, 0, 0.9);
        c.globalAlpha = clamp(1 - seg(a - i * STEP, 0.5, 1.1), 0, 1);
        c.fillStyle = P.paleGold; c.font = fh(rowH * 0.28); c.textAlign = 'left';
        c.fillText('+' + ar(late ? 1 : 2), chX + chW + 4 * k, cy + rowH * 0.06 - rowH * 0.34 * lift);
        c.globalAlpha = 1;
      }
      c.restore();
    }

    /* شريط الحصيلة السفلي */
    var by = h - 4 * k;
    c.fillStyle = 'rgba(215,169,63,0.85)';
    c.fillRect(0, by, w * clamp(done / n, 0, 1), 4 * k);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = P.paleGold; c.font = fh(11 * k);
    c.fillText(ar(pts) + ' نقطة', 9 * k, by - 5 * k);
    c.textAlign = 'right';
    c.fillStyle = 'rgba(248,245,239,0.62)'; c.font = f(10 * k, 700);
    c.fillText('حاضر ' + ar(pres) + ' من ' + ar(n), w - 9 * k, by - 5 * k);
  }

  /* ================= ٢) لوحة الشرف ================= */
  function honor(c, w, h, time, p, st) {
    var k = st.k, T = 9.5, a = cyc(st, T, 3.2), land = w / h > 1.15;
    panel(c, w, h);
    var g = c.createRadialGradient(w / 2, h * 0.1, 2, w / 2, h * 0.1, h * 0.9);
    g.addColorStop(0, 'rgba(215,169,63,0.22)'); g.addColorStop(1, 'rgba(215,169,63,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);

    var hh = head(c, w, h, k, 'لوحة الشرف', 'الأسبوع ' + ar(6));
    /* نجوم تتلألأ */
    for (var s = 0; s < 12; s++) {
      var sx = (0.06 + rnd(s) * 0.88) * w, sy = hh + (0.05 + rnd(s + 40) * 0.9) * (h - hh);
      var ph = rnd(s + 80) * 6.28, tw = 0.35 + 0.65 * Math.abs(Math.sin(a * 2.1 + ph));
      star(c, sx, sy, (1.6 + rnd(s + 12) * 2.4) * k * tw, P.paleGold, 0.25 + 0.55 * tw);
    }

    var pods = [{ r: 2, n: 1, v: 44 }, { r: 1, n: 0, v: 52 }, { r: 3, n: 2, v: 39 }];
    var medal = ['#D7A93F', '#C9CDD3', '#C08A52'];
    var order = land ? [0, 1, 2] : [1, 0, 2];   /* المنصّة أفقياً، والقائمة عمودياً تبدأ بالأول */
    var d, i, o, x, y, cw, ch2;
    var top = hh + 8 * k, area = h - top - 8 * k;

    for (d = 0; d < 3; d++) {
      i = order[d]; o = pods[i];
      var dl = (o.r - 1) * 0.22;
      var rise = eOut(seg(a, 0.15 + dl, 0.95 + dl));
      if (rise <= 0.001) continue;
      c.globalAlpha = rise;
      if (land) {
        cw = (w - 8 * k * 4) / 3;
        ch2 = area * (o.r === 1 ? 0.94 : o.r === 2 ? 0.78 : 0.7);
        x = 8 * k + (2 - d) * (cw + 8 * k);
        y = top + (area - ch2) + (1 - rise) * 14 * k;
      } else {
        cw = w - 16 * k; ch2 = (area - 12 * k) / 3;
        x = 8 * k; y = top + d * (ch2 + 6 * k) + (1 - rise) * 14 * k;
      }
      fillRR(c, x, y, cw, ch2, 7 * k, o.r === 1 ? 'rgba(215,169,63,0.16)' : 'rgba(248,245,239,0.07)');
      strokeRR(c, x + 0.5, y + 0.5, cw - 1, ch2 - 1, 7 * k, o.r === 1 ? 'rgba(215,169,63,0.75)' : 'rgba(248,245,239,0.16)', Math.max(1, k));

      var mr = Math.min(cw, ch2) * (land ? 0.2 : 0.3);
      var mx = land ? x + cw / 2 : x + cw - mr - 8 * k;
      var my = land ? y + mr + 8 * k : y + ch2 / 2;
      var pop = eBack(seg(a, 0.35 + dl, 0.95 + dl));
      c.save(); c.translate(mx, my); c.scale(pop, pop); c.translate(-mx, -my);
      c.beginPath(); c.arc(mx, my, mr, 0, 6.2832); c.fillStyle = medal[o.r - 1]; c.fill();
      c.beginPath(); c.arc(mx, my, mr * 0.78, 0, 6.2832); c.strokeStyle = 'rgba(7,19,34,0.35)'; c.lineWidth = Math.max(1, k); c.stroke();
      c.fillStyle = P.night; c.font = fh(mr * 1.05); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(ar(o.r), mx, my + mr * 0.05);
      c.restore();

      var grow = eOut(seg(a, 0.5 + dl, 1.9 + dl));
      var val = ar(Math.round(o.v * grow)) + ' نقطة';
      c.textBaseline = 'middle';
      if (land) {
        c.textAlign = 'center';
        c.fillStyle = P.cream; c.font = f(Math.min(cw * 0.15, 13 * k), 700);
        c.fillText(NAMES[o.n], x + cw / 2, my + mr + 14 * k);
        c.fillStyle = P.paleGold; c.font = fh(Math.min(cw * 0.17, 15 * k));
        c.fillText(val, x + cw / 2, my + mr + 31 * k);
      } else {
        c.textAlign = 'right';
        c.fillStyle = P.cream; c.font = f(Math.min(ch2 * 0.3, 13 * k), 700);
        c.fillText(NAMES[o.n], mx - mr - 8 * k, y + ch2 * 0.36);
        c.fillStyle = P.paleGold; c.font = fh(Math.min(ch2 * 0.3, 13 * k));
        c.fillText(val, mx - mr - 8 * k, y + ch2 * 0.7);
        /* نجوم بعدد المستوى تملأ يسار البطاقة */
        var ns = Math.max(3, Math.round(o.v / 11)), sr = Math.min(ch2 * 0.16, 7 * k), sx0 = x + 10 * k;
        for (var q = 0; q < ns; q++) {
          var lit = seg(grow * ns, q, q + 1);
          star(c, sx0 + q * sr * 2.4, y + ch2 * 0.55, sr * (0.6 + 0.4 * lit), P.paleGold,
            (0.2 + 0.8 * lit) * (0.7 + 0.3 * Math.abs(Math.sin(a * 2.4 + q))));
        }
      }
      c.globalAlpha = 1;
    }
    /* ومضة ذهبية تعبر اللوحة */
    var sw = a / T;
    if (sw < 0.3) {
      var gx = w * (1.25 - sw / 0.3 * 1.5);
      var lg = c.createLinearGradient(gx - w * 0.18, 0, gx + w * 0.18, 0);
      lg.addColorStop(0, 'rgba(240,217,154,0)'); lg.addColorStop(0.5, 'rgba(240,217,154,0.13)'); lg.addColorStop(1, 'rgba(240,217,154,0)');
      c.fillStyle = lg; c.fillRect(0, hh, w, h - hh);
    }
  }

  /* ================= ٣) الورقة التفاعلية ================= */
  var QUIZ = [
    { q: 'ما الجهاز الذي يُدخل الصوت إلى الحاسب؟', o: ['الميكروفون', 'السمّاعة', 'الطابعة', 'الشاشة'], a: 0 },
    { q: 'أيّ هذه وحدة تخزين؟', o: ['الفأرة', 'ذاكرة فلاش', 'الماسح الضوئي', 'اللوحة'], a: 1 }
  ];
  function quiz(c, w, h, time, p, st) {
    var k = st.k, T = 7.4, a = cyc(st, T, 4.2);
    var qi = st.reduced ? 0 : (Math.floor((st.age || 0) / T) % QUIZ.length);
    var Q = QUIZ[qi], land = w / h > 1.2;
    panel(c, w, h);
    var hh = head(c, w, h, k, 'الورقة التفاعلية', 'سؤال ' + ar(qi + 1) + ' من ' + ar(5));

    var padX = 9 * k, inW = w - padX * 2;
    var qIn = eOut(seg(a, 0.1, 0.7));
    c.globalAlpha = qIn;
    c.textBaseline = 'middle'; c.textAlign = 'right';
    c.font = f(land ? 13.5 * k : 12.5 * k, 700);
    var lines = wrap(c, Q.q, inW - 18 * k), li;
    var lh0 = 17 * k, qH = 13 * k + lines.length * lh0;
    var qY = hh + 7 * k + (1 - qIn) * 8 * k;
    fillRR(c, padX, qY, inW, qH, 6 * k, 'rgba(159,196,232,0.10)');
    c.fillStyle = P.cream;
    for (li = 0; li < lines.length; li++) c.fillText(lines[li], w - padX - 9 * k, qY + 6.5 * k + lh0 * 0.5 + li * lh0);
    c.globalAlpha = 1;

    /* الخيارات */
    var oTop = qY + qH + 7 * k, oArea = h - oTop - 26 * k;
    var cols = land ? 2 : 1, rows = land ? 2 : 4, gap = 5 * k;
    var ow = (inW - (cols - 1) * gap) / cols, oh = (oArea - (rows - 1) * gap) / rows;
    var solved = seg(a, 3.0, 3.5), pick = seg(a, 1.5, 2.9), i;
    for (i = 0; i < 4; i++) {
      var col = (cols - 1) - (i % cols), row = (i / cols) | 0;
      var x = padX + col * (ow + gap), y = oTop + row * (oh + gap);
      var app = eOut(seg(a, 0.5 + i * 0.14, 1.1 + i * 0.14));
      if (app <= 0.001) continue;
      var right = i === Q.a;
      c.globalAlpha = app * (solved > 0 && !right ? lerp(1, 0.42, solved) : 1);
      var fill = right && solved > 0 ? 'rgba(47,143,91,' + (0.2 + 0.55 * solved).toFixed(3) + ')' : 'rgba(248,245,239,0.06)';
      var yy = y + (1 - app) * 8 * k;
      fillRR(c, x, yy, ow, oh, 6 * k, fill);
      strokeRR(c, x + 0.5, yy + 0.5, ow - 1, oh - 1, 6 * k,
        right && solved > 0 ? P.greenUp : (right && pick > 0.55 ? 'rgba(215,169,63,' + (0.3 + 0.5 * pick).toFixed(2) + ')' : 'rgba(248,245,239,0.16)'), Math.max(1, k));
      var rad = oh * 0.28, ccx = x + ow - 9 * k - rad, ccy = yy + oh / 2;
      c.beginPath(); c.arc(ccx, ccy, rad, 0, 6.2832);
      c.fillStyle = right && solved > 0 ? P.greenUp : 'rgba(159,196,232,0.22)'; c.fill();
      if (right && solved > 0) check(c, ccx, ccy, rad * 0.82, P.night, seg(a, 3.1, 3.6), rad * 0.2);
      else {
        c.fillStyle = P.cream; c.font = fh(rad * 1.1); c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(['أ', 'ب', 'ج', 'د'][i], ccx, ccy + rad * 0.05);
      }
      c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillStyle = P.cream; c.font = f(Math.min(oh * 0.36, 12.5 * k), 700);
      c.fillText(Q.o[i], ccx - rad - 6 * k, ccy);
      c.globalAlpha = 1;
    }

    /* المؤشّر يتحرّك نحو الإجابة ثم يختفي */
    if (pick > 0 && solved < 1) {
      var tcol = (cols - 1) - (Q.a % cols), trow = (Q.a / cols) | 0;
      var tx = padX + tcol * (ow + gap) + ow * 0.5, ty = oTop + trow * (oh + gap) + oh * 0.5;
      var px = lerp(w * 0.5, tx, eOut(pick)), py = lerp(h + 20 * k, ty, eOut(pick));
      c.globalAlpha = 0.75 * (1 - solved);
      c.beginPath(); c.arc(px, py, 9 * k * (1 + 0.25 * Math.sin(a * 8)), 0, 6.2832);
      c.fillStyle = 'rgba(240,217,154,0.35)'; c.fill();
      c.strokeStyle = P.paleGold; c.lineWidth = 1.5 * k; c.stroke();
      c.globalAlpha = 1;
    }

    /* النتيجة الفورية */
    var res = eOut(seg(a, 3.4, 4.0));
    if (res > 0.001) {
      var bh = 20 * k, bw = Math.min(inW, 200 * k), bx = (w - bw) / 2, by = h - bh - 4 * k;
      c.globalAlpha = res * (1 - seg(a, 6.5, 7.2));
      fillRR(c, bx, by, bw, bh, bh / 2, 'rgba(47,143,91,0.9)');
      c.fillStyle = P.cream; c.font = fh(10.5 * k); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('إجابة صحيحة · تصحيح فوري · ' + ar(5) + '/' + ar(5), bx + bw / 2, by + bh * 0.54);
      c.globalAlpha = 1;
    }
  }

  /* ================= ٤) تقرير ولي الأمر (واتساب) ================= */
  var MSG = ['تقرير الأسبوع لابنكم فهد', 'الحضور: ٥ من ٥', 'المشاركة: ممتازة', 'النجوم: ٧ نجوم', 'الواجبات: ٤ من ٤', 'شكراً لمتابعتكم.'];
  var MSG_CHARS = (function () { var n = 0, i; for (i = 0; i < MSG.length; i++) n += MSG[i].length + 1; return n; })();
  var ASK = 'السلام عليكم، كيف مستوى فهد؟';
  var REPLY = 'شكراً لكم، جزاكم الله خيراً';
  function parent(c, w, h, time, p, st) {
    var k = st.k, i;
    var SPEED = 26, TYPE = MSG_CHARS / SPEED, T = TYPE + 4.4, a = cyc(st, T, TYPE + 2.0);
    var shown = Math.floor(a * SPEED), doneAll = shown >= MSG_CHARS;

    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0C1E2E'); g.addColorStop(1, P.night);
    c.fillStyle = g; c.fillRect(0, 0, w, h);

    /* شريط جهة الاتصال */
    var hh = Math.round(30 * k);
    c.fillStyle = 'rgba(18,58,44,0.92)'; c.fillRect(0, 0, w, hh);
    var rad = hh * 0.34, acx = w - 10 * k - rad, acy = hh / 2;
    c.beginPath(); c.arc(acx, acy, rad, 0, 6.2832); c.fillStyle = 'rgba(240,217,154,0.85)'; c.fill();
    c.fillStyle = P.night; c.font = fh(rad * 1.05); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('ف', acx, acy + rad * 0.06);
    c.textAlign = 'right'; c.fillStyle = P.cream; c.font = f(11 * k, 700);
    c.fillText('ولي أمر فهد', acx - rad - 6 * k, hh * 0.38);
    c.fillStyle = 'rgba(79,191,134,0.9)'; c.font = f(8.5 * k, 500);
    c.fillText('متصل الآن', acx - rad - 6 * k, hh * 0.72);

    /* قياس الفقاعة الصادرة: تنمو سطراً سطراً مع الكتابة */
    var padX = 8 * k, bw = Math.min(w - padX * 2, w * 0.88);
    var lh = 15 * k, headH = 17 * k, used = 0, visLines = 0;
    for (i = 0; i < MSG.length; i++) { if (shown > used) visLines = i + 1; used += MSG[i].length + 1; }
    if (visLines < 1) visLines = 1;
    var bh = headH + visLines * lh + 16 * k;

    /* الردّ الوارد بعد اكتمال الإرسال */
    var rp = doneAll ? eBack(seg(a - TYPE, 1.1, 1.8)) : 0;
    c.font = f(10 * k, 500);
    var rw = Math.min(w - padX * 2 - 18 * k, c.measureText(REPLY).width + 20 * k), rh = 26 * k;

    /* سؤال ولي الأمر (وارد) قبل التقرير */
    c.font = f(10 * k, 500);
    var aw = Math.min(w - padX * 2 - 18 * k, c.measureText(ASK).width + 20 * k), ah = 26 * k;

    /* الرصف من الأسفل (فوق شريط الإرسال) كما في الدردشة الحقيقية */
    var inH = 20 * k, inY = h - inH - 5 * k;
    var block = bh + (rp > 0.001 ? rh + 6 * k : 0);
    var askOn = (inY - 8 * k - block - (ah + 6 * k)) > (hh + 22 * k);
    if (askOn) block += ah + 6 * k;
    var by = Math.max(hh + 6 * k, inY - 8 * k - block), bx = padX;
    if (askOn) {
      var ax2 = w - padX - aw, ay2 = by;
      c.beginPath(); c.moveTo(ax2 + aw - 2 * k, ay2 + 6 * k); c.lineTo(ax2 + aw + 5 * k, ay2 + 3 * k); c.lineTo(ax2 + aw - 2 * k, ay2 + 15 * k); c.closePath();
      c.fillStyle = '#16283B'; c.fill();
      fillRR(c, ax2, ay2, aw, ah, 7 * k, '#16283B');
      c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(248,245,239,0.86)'; c.font = f(10 * k, 500);
      c.fillText(ASK, ax2 + aw - 9 * k, ay2 + ah / 2);
      /* شارة اليوم فوق أول رسالة */
      var dw = 42 * k, dh = 14 * k;
      fillRR(c, (w - dw) / 2, ay2 - dh - 6 * k, dw, dh, dh / 2, 'rgba(248,245,239,0.08)');
      c.textAlign = 'center'; c.fillStyle = 'rgba(248,245,239,0.5)'; c.font = f(8.5 * k, 700);
      c.fillText('اليوم', w / 2, ay2 - dh / 2 - 6 * k);
      by += ah + 6 * k;
    }

    c.beginPath(); c.moveTo(bx + 2 * k, by + 6 * k); c.lineTo(bx - 5 * k, by + 3 * k); c.lineTo(bx + 2 * k, by + 15 * k); c.closePath();
    c.fillStyle = P.chat; c.fill();
    fillRR(c, bx, by, bw, bh, 7 * k, P.chat);
    strokeRR(c, bx + 0.5, by + 0.5, bw - 1, bh - 1, 7 * k, 'rgba(79,191,134,0.28)', Math.max(1, k));

    c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillStyle = P.paleGold; c.font = fh(10.5 * k);
    c.fillText('سجل المتابعة الرقمي', bx + bw - 9 * k, by + 11 * k);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(bx + 8 * k, by + 19 * k, bw - 16 * k, Math.max(1, k));

    used = 0;
    for (i = 0; i < visLines; i++) {
      var line = MSG[i], take = clamp(shown - used, 0, line.length);
      used += line.length + 1;
      if (take <= 0) break;
      c.fillStyle = i === 0 ? P.cream : 'rgba(248,245,239,0.86)';
      c.font = f(i === 0 ? 11.5 * k : 10.5 * k, i === 0 ? 700 : 500);
      var txt = line.substr(0, take);
      var ty = by + headH + 9 * k + i * lh;
      c.fillText(txt, bx + bw - 9 * k, ty);
      if (take < line.length && Math.floor(a * 3) % 2 === 0) {
        var mw = c.measureText(txt).width;
        c.fillStyle = P.paleGold;
        c.fillRect(bx + bw - 9 * k - mw - 3 * k, ty - 5 * k, 1.5 * k, 11 * k);
      }
    }

    /* الوقت وعلامتا التسليم */
    c.textAlign = 'left'; c.font = f(8 * k, 500);
    c.fillStyle = 'rgba(248,245,239,0.45)';
    c.fillText('٧:٤٢ م', bx + 9 * k, by + bh - 8 * k);
    if (doneAll) {
      var tick = seg(a - TYPE, 0.3, 0.9);
      var tx = bx + 9 * k + 32 * k, ty2 = by + bh - 8 * k;
      var col = tick > 0.5 ? '#53BDEB' : 'rgba(248,245,239,0.45)';
      check(c, tx, ty2, 4 * k, col, 1, 1.4 * k);
      check(c, tx + 4.5 * k, ty2, 4 * k, col, 1, 1.4 * k);
    }

    /* فقاعة الردّ (واردة: على اليمين في RTL) */
    if (rp > 0.001) {
      var ry = by + bh + 6 * k, rx = w - padX - rw;
      c.save();
      c.translate(rx + rw, ry + rh / 2); c.scale(rp, rp); c.translate(-(rx + rw), -(ry + rh / 2));
      c.beginPath(); c.moveTo(rx + rw - 2 * k, ry + 6 * k); c.lineTo(rx + rw + 5 * k, ry + 3 * k); c.lineTo(rx + rw - 2 * k, ry + 15 * k); c.closePath();
      c.fillStyle = '#16283B'; c.fill();
      fillRR(c, rx, ry, rw, rh, 7 * k, '#16283B');
      c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(248,245,239,0.9)'; c.font = f(10 * k, 500);
      c.fillText(REPLY, rx + rw - 9 * k, ry + rh / 2);
      c.restore();
    }

    /* شريط الإرسال */
    fillRR(c, padX, inY, w - padX * 2 - inH - 5 * k, inH, inH / 2, 'rgba(248,245,239,0.07)');
    c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(248,245,239,0.4)'; c.font = f(9 * k, 500);
    c.fillText(doneAll ? 'تم الإرسال تلقائياً' : 'يُرسل الآن…', w - padX - inH - 12 * k, inY + inH / 2);
    c.beginPath(); c.arc(w - padX - inH / 2, inY + inH / 2, inH / 2, 0, 6.2832);
    c.fillStyle = doneAll ? P.greenUp : P.green; c.fill();
    c.save(); c.translate(w - padX - inH / 2, inY + inH / 2);
    c.beginPath(); c.moveTo(-inH * 0.22, -inH * 0.17); c.lineTo(inH * 0.24, 0); c.lineTo(-inH * 0.22, inH * 0.17); c.closePath();
    c.fillStyle = P.night; c.fill(); c.restore();
  }

  /* ================= ٥) الجدول العام ================= */
  var SUBS = [
    { n: 'لغتي', c: 0 }, { n: 'رياضيات', c: 1 }, { n: 'علوم', c: 2 }, { n: 'رقمية', c: 3 },
    { n: 'إنجليزي', c: 4 }, { n: 'قرآن', c: 5 }, { n: 'اجتماعيات', c: 6 }, { n: 'فنية', c: 7 }
  ];
  var CLASSES = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
  function schedule(c, w, h, time, p, st) {
    var k = st.k, land = w / h > 1.2;
    var cols = land ? 5 : 4, rows = land ? 4 : 6, NOW = 2;
    var FILL = cols * rows * 0.055, T = FILL + 5.2, a = cyc(st, T, FILL + 2.2);
    panel(c, w, h);
    var hh = head(c, w, h, k, 'الجدول العام', 'الأحد · الحصة ' + ar(NOW + 1));

    var labW = 30 * k, padX = 6 * k;
    var gap = 3 * k, gridX = padX, gridW = w - padX * 2 - labW;
    var headH = 13 * k, top = hh + 5 * k;
    var cw = (gridW - (cols - 1) * gap) / cols;
    var areaH = h - top - headH - 6 * k;
    var ch2 = (areaH - (rows - 1) * gap) / rows;
    var ri, ci;

    c.textBaseline = 'middle'; c.textAlign = 'center';
    c.fillStyle = 'rgba(248,245,239,0.5)'; c.font = f(8.5 * k, 700);
    for (ci = 0; ci < cols; ci++) c.fillText(ar(ci + 1), gridX + (cols - 1 - ci) * (cw + gap) + cw / 2, top + headH / 2);
    c.textAlign = 'right';
    for (ri = 0; ri < rows; ri++) {
      c.fillStyle = 'rgba(248,245,239,0.62)'; c.font = f(Math.min(9.5 * k, ch2 * 0.5), 700);
      c.fillText(ar(4 + (ri % 3)) + '/' + CLASSES[ri % 6], w - padX, top + headH + ri * (ch2 + gap) + ch2 / 2);
    }

    for (ri = 0; ri < rows; ri++) {
      for (ci = 0; ci < cols; ci++) {
        var order = ri * cols + ci;
        var app = eOut(seg(a, 0.15 + order * 0.055, 0.5 + order * 0.055));
        if (app <= 0.002) continue;
        var x = gridX + (cols - 1 - ci) * (cw + gap), y = top + headH + ri * (ch2 + gap);
        var sb = SUBS[(ri * 3 + ci * 2 + ri) % SUBS.length];
        var cx0 = x + cw / 2, cy0 = y + ch2 / 2, sc = lerp(0.86, 1, app);
        c.globalAlpha = app;
        c.save(); c.translate(cx0, cy0); c.scale(sc, sc); c.translate(-cx0, -cy0);
        fillRR(c, x, y, cw, ch2, 3.5 * k, SUBJ[sb.c]);
        c.fillStyle = 'rgba(7,19,34,0.86)';
        c.font = f(Math.min(cw * 0.24, ch2 * 0.42, 9.5 * k), 700);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(sb.n, cx0, cy0 + ch2 * 0.02);
        c.restore();
        c.globalAlpha = 1;
      }
    }

    /* إبراز الحصة الحالية */
    var hl = eOut(seg(a, FILL + 0.4, FILL + 1.2));
    if (hl > 0.002) {
      var hx2 = gridX + (cols - 1 - NOW) * (cw + gap) - 2.5 * k;
      var hy2 = top + headH - 2.5 * k, hw = cw + 5 * k, hh2 = areaH + 5 * k;
      var pulse = 0.65 + 0.35 * Math.sin(a * 3.4);
      c.globalAlpha = hl;
      strokeRR(c, hx2, hy2, hw, hh2, 5 * k, 'rgba(215,169,63,' + (0.5 + 0.5 * pulse).toFixed(2) + ')', 2 * k);
      var lw = 32 * k, lh2 = 12 * k;
      fillRR(c, hx2 + hw / 2 - lw / 2, top + headH / 2 - lh2 / 2 - 1 * k, lw, lh2, lh2 / 2, P.gold);
      c.fillStyle = P.night; c.font = fh(8 * k); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('الآن', hx2 + hw / 2, top + headH / 2 - 0.5 * k);
      c.globalAlpha = 1;
    }
  }

  /* ================= ٦) المستويات ================= */
  var BARS = [
    { n: 'لغتي', v: 0.86 }, { n: 'رياضيات', v: 0.72 }, { n: 'علوم', v: 0.64 },
    { n: 'رقمية', v: 0.93 }, { n: 'إنجليزي', v: 0.57 }, { n: 'قرآن', v: 0.79 }
  ];
  function levelOf(v) { return v >= 0.85 ? 0 : v >= 0.7 ? 1 : v >= 0.55 ? 2 : 3; }
  function levels(c, w, h, time, p, st) {
    var k = st.k, land = w / h > 1.15, n = BARS.length, i;
    var T = 8.4, a = cyc(st, T, 3.8);
    var avg = eOut(seg(a, 2.6, 3.4));
    panel(c, w, h);
    var hh = head(c, w, h, k, 'مستويات الطلاب', avg > 0.6 ? 'المتوسط ٧٥٪' : ar(782) + ' رصداً');

    /* دليل المستويات */
    var lx = w - 8 * k, ly = hh + 9 * k;
    c.textBaseline = 'middle'; c.textAlign = 'right'; c.font = f(8 * k, 700);
    for (i = 0; i < 4; i++) {
      var seen = eOut(seg(a, 0.1 + i * 0.08, 0.5 + i * 0.08));
      c.globalAlpha = seen;
      c.beginPath(); c.arc(lx - 3 * k, ly, 3 * k, 0, 6.2832); c.fillStyle = LEVELS[i].c; c.fill();
      c.fillStyle = 'rgba(248,245,239,0.6)';
      c.fillText(LEVELS[i].n, lx - 9 * k, ly + 0.5 * k);
      lx -= 9 * k + c.measureText(LEVELS[i].n).width + 9 * k;
      c.globalAlpha = 1;
    }

    var top = ly + 10 * k;
    if (land) {
      var base = h - 22 * k, areaH = base - top;
      var gap = 6 * k, bw = (w - 16 * k - (n - 1) * gap) / n;
      c.fillStyle = 'rgba(248,245,239,0.14)'; c.fillRect(8 * k, base, w - 16 * k, Math.max(1, k));
      for (i = 0; i < n; i++) {
        var gr = eOut(seg(a, 0.4 + i * 0.13, 1.5 + i * 0.13));
        var L = LEVELS[levelOf(BARS[i].v)];
        var x = 8 * k + (n - 1 - i) * (bw + gap), bh = areaH * 0.86 * BARS[i].v * gr, y = base - bh;
        fillRR(c, x, top + areaH * 0.14, bw, areaH * 0.86, 4 * k, 'rgba(248,245,239,0.05)');
        if (bh > 1) {
          fillRR(c, x, y, bw, bh, 4 * k, L.c);
          c.globalAlpha = 0.35;
          fillRR(c, x, y, bw, Math.min(bh, 5 * k), 3 * k, P.cream);
          c.globalAlpha = 1;
        }
        c.textAlign = 'center'; c.textBaseline = 'alphabetic';
        if (gr > 0.05) {
          c.fillStyle = P.paleGold; c.font = fh(Math.min(bw * 0.34, 12 * k));
          c.fillText(ar(Math.round(BARS[i].v * gr * 100)) + '٪', x + bw / 2, y - 4 * k);
        }
        c.fillStyle = 'rgba(248,245,239,0.72)'; c.font = f(Math.min(bw * 0.26, 9.5 * k), 700);
        c.fillText(BARS[i].n, x + bw / 2, base + 11 * k);
      }
      if (avg > 0.002) {
        var ay = base - areaH * 0.86 * 0.75, ax0 = w - 8 * k - (w - 16 * k) * avg;
        c.globalAlpha = avg;
        c.strokeStyle = 'rgba(7,19,34,0.45)'; c.lineWidth = 3 * k;
        c.beginPath(); c.moveTo(ax0, ay); c.lineTo(w - 8 * k, ay); c.stroke();
        c.strokeStyle = P.paleGold; c.lineWidth = Math.max(1, k);
        c.setLineDash([5 * k, 4 * k]);
        c.beginPath(); c.moveTo(ax0, ay); c.lineTo(w - 8 * k, ay); c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
      }
    } else {
      var rowH = (h - top - 10 * k) / n, labW = 46 * k;
      for (i = 0; i < n; i++) {
        var gr2 = eOut(seg(a, 0.4 + i * 0.13, 1.5 + i * 0.13));
        var L2 = LEVELS[levelOf(BARS[i].v)];
        var y2 = top + i * rowH, th = Math.min(rowH * 0.42, 13 * k);
        c.textAlign = 'right'; c.textBaseline = 'middle';
        c.fillStyle = 'rgba(248,245,239,0.75)'; c.font = f(Math.min(10.5 * k, rowH * 0.34), 700);
        c.fillText(BARS[i].n, w - 8 * k, y2 + rowH / 2);
        var tx = 34 * k, tw = w - 8 * k - labW - tx;
        fillRR(c, tx, y2 + rowH / 2 - th / 2, tw, th, th / 2, 'rgba(248,245,239,0.06)');
        var fw = tw * BARS[i].v * gr2;
        if (fw > 1) fillRR(c, tx + tw - fw, y2 + rowH / 2 - th / 2, fw, th, th / 2, L2.c);
        c.textAlign = 'left';
        c.fillStyle = P.paleGold; c.font = fh(Math.min(10 * k, rowH * 0.34));
        c.fillText(ar(Math.round(BARS[i].v * gr2 * 100)) + '٪', 6 * k, y2 + rowH / 2);
      }
    }
  }

  /* ================= ٧) الحصة الحية ================= */
  var TEAM = [{ n: 'فريق النجوم', b: 12 }, { n: 'فريق الأمل', b: 9 }, { n: 'فريق الإتقان', b: 7 }];
  var HITS = [{ t: 1.5, i: 0, v: 5 }, { t: 2.9, i: 2, v: 3 }, { t: 4.3, i: 1, v: 5 }, { t: 5.8, i: 0, v: 3 }];
  function live(c, w, h, time, p, st) {
    var k = st.k, land = w / h > 1.15, T = 8.6, a = cyc(st, T, 6.6), i, hit;
    panel(c, w, h);
    var hh = head(c, w, h, k, 'الحصة الحية', 'صف ' + ar(5) + '/أ');
    var pd = 0.55 + 0.45 * Math.abs(Math.sin(a * 3.2));
    c.font = fh(14 * k);
    var titleW = c.measureText('الحصة الحية').width;
    c.beginPath(); c.arc(w - 9 * k - titleW - 8 * k, hh * 0.54, 3.2 * k * (0.85 + 0.25 * pd), 0, 6.2832);
    c.fillStyle = 'rgba(194,96,79,' + (0.55 + 0.45 * pd).toFixed(2) + ')'; c.fill();

    /* المؤقّت */
    var secs = Math.max(0, 30 - Math.floor(a * 3.6));
    var ringR = land ? Math.min(h * 0.3, w * 0.16) : Math.min(w * 0.24, h * 0.13);
    var rcx = land ? w * 0.78 : w * 0.5;
    var rcy = land ? hh + (h - hh) * 0.48 : hh + ringR + 12 * k;
    c.lineCap = 'round';
    c.beginPath(); c.arc(rcx, rcy, ringR, 0, 6.2832);
    c.strokeStyle = 'rgba(248,245,239,0.10)'; c.lineWidth = 6 * k; c.stroke();
    var frac = clamp(secs / 30, 0, 1);
    c.beginPath(); c.arc(rcx, rcy, ringR, -Math.PI / 2, -Math.PI / 2 + 6.2832 * frac);
    c.strokeStyle = frac > 0.3 ? P.gold : P.red; c.lineWidth = 6 * k; c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = P.paleGold; c.font = fh(ringR * 0.86);
    c.fillText(ar(secs), rcx, rcy + ringR * 0.04);
    c.fillStyle = 'rgba(248,245,239,0.5)'; c.font = f(ringR * 0.24, 700);
    c.fillText('ثانية', rcx, rcy + ringR * 0.62);

    /* لوحة النقاط */
    var lx = 8 * k, lw = land ? w * 0.55 : w - 16 * k;
    var lTop = land ? hh + 10 * k : rcy + ringR + 12 * k;
    var lH = h - lTop - 8 * k, rowH = Math.min(lH / 3, 44 * k);
    lTop += (lH - rowH * 3) / 2;
    for (i = 0; i < 3; i++) {
      var pts = TEAM[i].b;
      for (hit = 0; hit < HITS.length; hit++) if (HITS[hit].i === i && a >= HITS[hit].t) pts += HITS[hit].v;
      var y = lTop + i * rowH, bh = Math.min(rowH * 0.72, 28 * k);
      fillRR(c, lx, y + (rowH - bh) / 2, lw, bh, 5 * k, i === 0 ? 'rgba(215,169,63,0.13)' : 'rgba(248,245,239,0.05)');
      c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillStyle = P.cream; c.font = f(Math.min(bh * 0.42, 12 * k), 700);
      c.fillText(TEAM[i].n, lx + lw - 8 * k, y + rowH / 2);
      var maxP = 24, tw = lw * 0.4, tx = lx + 30 * k, th = bh * 0.24;
      fillRR(c, tx, y + rowH / 2 - th / 2, tw, th, th / 2, 'rgba(248,245,239,0.08)');
      var fw = tw * clamp(pts / maxP, 0, 1);
      fillRR(c, tx + tw - fw, y + rowH / 2 - th / 2, fw, th, th / 2, i === 0 ? P.gold : P.sky);
      c.textAlign = 'left';
      c.fillStyle = P.paleGold; c.font = fh(Math.min(bh * 0.48, 14 * k));
      c.fillText(ar(pts), lx + 7 * k, y + rowH / 2);
      for (hit = 0; hit < HITS.length; hit++) {
        if (HITS[hit].i !== i) continue;
        var d = a - HITS[hit].t;
        if (d < 0 || d > 1.1) continue;
        c.globalAlpha = 1 - d / 1.1;
        c.fillStyle = P.greenUp; c.font = fh(Math.min(bh * 0.5, 14 * k)); c.textAlign = 'left';
        c.fillText('+' + ar(HITS[hit].v), lx + 23 * k, y + rowH / 2 - d * 16 * k);
        c.globalAlpha = 1;
      }
    }

    /* تصفيق بصري خفيف: حلقتان تتّسعان وشرر ذهبي عند كل نقطة */
    for (hit = 0; hit < HITS.length; hit++) {
      var dd = a - HITS[hit].t;
      if (dd < 0 || dd > 0.9) continue;
      var g2 = dd / 0.9;
      c.globalAlpha = (1 - g2) * 0.55;
      c.strokeStyle = P.paleGold; c.lineWidth = 2 * k * (1 - g2);
      c.beginPath(); c.arc(rcx, rcy, ringR * (1 + g2 * 0.55), 0, 6.2832); c.stroke();
      c.beginPath(); c.arc(rcx, rcy, ringR * (1 + g2 * 0.3), 0, 6.2832); c.stroke();
      for (i = 0; i < 8; i++) {
        var an = i * 0.785 + hit, rr2 = ringR * (1.05 + g2 * 0.85);
        star(c, rcx + Math.cos(an) * rr2, rcy + Math.sin(an) * rr2, 3 * k * (1 - g2), P.paleGold, (1 - g2) * 0.8);
      }
      c.globalAlpha = 1;
    }
  }

  /* ---------- السجل ---------- */
  var REG = {
    attendance: attendance, honor: honor, quiz: quiz, parent: parent,
    schedule: schedule, levels: levels, live: live
  };
  var META = {
    attendance: { title: 'الرصد اليومي', cycle: 6.8, hint: 'شبكة أسماء تُلوَّن حاضر/متأخر ونقاط تتصاعد' },
    honor: { title: 'لوحة الشرف', cycle: 9.5, hint: 'ثلاثة أوائل بميداليات ونجوم تتلألأ' },
    quiz: { title: 'الورقة التفاعلية', cycle: 7.4, hint: 'سؤال يُحلّ ذاتياً بعلامة صح ونتيجة فورية' },
    parent: { title: 'تقرير ولي الأمر', cycle: 7.6, hint: 'فقاعة واتساب تُكتب حرفاً حرفاً' },
    schedule: { title: 'الجدول العام', cycle: 6.3, hint: 'مصفوفة حصص تُملأ وتُبرز الحصة الحالية' },
    levels: { title: 'المستويات', cycle: 8.4, hint: 'أعمدة تنمو بألوان المستويات' },
    live: { title: 'الحصة الحية', cycle: 8.6, hint: 'عدّاد ونقاط ترتفع مع تصفيق بصري' }
  };

  NS.screens = {
    version: 1,
    list: ['attendance', 'honor', 'quiz', 'parent', 'schedule', 'levels', 'live'],
    meta: META,
    palette: P,
    get: function (name) { return (name && REG[name]) || null; },
    has: function (name) { return !!(name && REG[name]); },
    register: function (name, fn, meta) {
      if (!name || typeof fn !== 'function') return false;
      REG[name] = fn;
      if (meta) META[name] = meta;
      if (NS.screens.list.indexOf(name) < 0) NS.screens.list.push(name);
      return true;
    },
    ar: ar
  };
  /* قد تكون media.js أنشأت شاشات قبل وصول هذا الملف: أعِد ربطها */
  try { if (NS.media && typeof NS.media.rebindGens === 'function') NS.media.rebindGens(); } catch (e) {}
})(window);
