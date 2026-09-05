/* سجل المتابعة الرقمي — الجولة السينمائية: طبقة HTML (النصوص، العدّاد، الشريط، التلميح، الختم، الملصقات) */
(function () {
  'use strict';
  var NS = window.SIJIL_INTRO = window.SIJIL_INTRO || {};
  var doc = document;
  var COLORS = { night: '#071322', navy: '#0E2033', gold: '#D7A93F', paleGold: '#F0D99A', cream: '#F8F5EF' };
  var STYLE_ID = 'intro-ui-css';

  var texts = [];
  var current = -1;
  var timers = [];
  var loginObserver = null;
  var hintOff = false;

  /* ---------- أدوات ---------- */
  function $(id) { return doc.getElementById(id); }
  function arNum(n) {
    n = Math.round(+n || 0);
    try { return n.toLocaleString('ar-EG'); } catch (e) { return String(n); }
  }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function easeIn(x) { return x * x * x; }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function ensure(id, parentId, tag) {
    var el = $(id);
    if (el) return el;
    el = doc.createElement(tag || 'div');
    el.id = id;
    var parent = parentId ? ($(parentId) || ensure(parentId, null)) : doc.body;
    parent.appendChild(el);
    return el;
  }
  function stationText(st) {
    var t = (st && st.text) || {};
    return {
      headline: t.headline || st.headline || st.posterTitle || st.title || '',
      copy: t.copy || st.copy || ''
    };
  }

  /* ---------- CSS الحركة الدقيقة (قواعد الشكل في intro.css؛ هنا احتياط بصفر خصوصية عبر :where) ---------- */
  var CSS = [
    ':where(#intro-texts .scene-text){position:absolute;top:18svh;inset-inline-start:6vw;max-width:min(560px,80vw);opacity:0;pointer-events:none;will-change:opacity,transform;text-align:start}',
    ':where(#intro-texts .scene-text h2){font-family:Changa,Tajawal,sans-serif;font-weight:800;font-size:clamp(28px,6vw,56px);line-height:1.15;margin:0 0 .35em;color:' + COLORS.paleGold + ';will-change:transform}',
    ':where(#intro-texts .scene-text p){font-family:Tajawal,sans-serif;font-weight:500;font-size:clamp(16px,2.2vw,22px);line-height:1.6;margin:0;color:' + COLORS.cream + ';will-change:transform}',
    '@media (max-width:768px){:where(#intro-texts .scene-text){top:9svh;inset-inline-start:5vw;inset-inline-end:5vw;max-width:none}:where(#intro-texts .scene-text p){display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}}',
    ':where(#intro-counter){position:absolute;inset-inline-end:6vw;bottom:14svh;text-align:center;pointer-events:none}',
    ':where(#intro-counter .num){font-family:Changa,Tajawal,sans-serif;font-weight:800;font-size:clamp(56px,14vw,120px);line-height:1;color:' + COLORS.paleGold + ';font-variant-numeric:tabular-nums;will-change:transform}',
    '#intro-counter .num.pulse{animation:introCounterPulse .28s ease-out}',
    '@keyframes introCounterPulse{50%{transform:scale(1.03)}}',
    ':where(#intro-counter .bars){display:flex;flex-direction:column;gap:5px;margin-top:10px;width:min(260px,60vw);margin-inline:auto}',
    ':where(#intro-counter .bar){display:block;height:5px;border-radius:3px;background:rgba(215,169,63,.18);overflow:hidden}',
    ':where(#intro-counter .bar i){display:block;height:100%;background:' + COLORS.gold + ';transform-origin:100% 50%;transform:scaleX(0);will-change:transform}',
    'html[dir=ltr] #intro-counter .bar i{transform-origin:0 50%}',
    ':where(#intro-hint){transition:opacity .45s}',
    '#intro-hint.is-off{opacity:0!important}',
    ':where(#intro-bar){transition:opacity .3s}',
    '#intro-bar.is-hidden{opacity:0;pointer-events:none}',
    ':where(#intro-stamp){position:fixed;inset:0;z-index:10000;display:grid;place-items:center;pointer-events:none}',
    ':where(#intro-stamp .seal){position:relative;width:120px;height:120px;border-radius:50%;background:' + COLORS.gold + ';display:grid;place-items:center;box-shadow:0 14px 44px rgba(7,19,34,.45);will-change:transform,opacity}',
    ':where(#intro-stamp .seal svg){position:absolute;inset:0;width:100%;height:100%}',
    ':where(#intro-stamp .seal b){position:relative;font-family:Changa,Tajawal,sans-serif;font-weight:800;font-size:30px;line-height:1;color:' + COLORS.navy + '}',
    '#intro-stamp .spray{position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:' + COLORS.paleGold + ';opacity:0;pointer-events:none;will-change:transform,opacity}',
    ':where(#intro-posters){display:block}',
    ':where(#intro-posters .poster){position:relative;min-height:100svh;display:grid;align-items:end;background:linear-gradient(160deg,#16304d 0%,' + COLORS.navy + ' 45%,' + COLORS.night + ' 100%);overflow:hidden}',
    ':where(#intro-posters .poster img){position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
    ':where(#intro-posters .poster .txt){position:relative;padding:8vh 6vw 10vh;background:linear-gradient(to top,rgba(7,19,34,.88),rgba(7,19,34,0))}',
    ':where(#intro-posters .poster h2){font-family:Changa,Tajawal,sans-serif;font-weight:800;font-size:clamp(28px,6vw,56px);line-height:1.15;margin:0 0 .3em;color:' + COLORS.paleGold + '}',
    ':where(#intro-posters .poster p){font-family:Tajawal,sans-serif;font-weight:500;font-size:clamp(16px,2.2vw,22px);line-height:1.6;margin:0;color:' + COLORS.cream + ';max-width:620px}',
    ':where(#intro-posters .poster-enter){display:block;text-align:center;padding:18px;font-family:Changa,Tajawal,sans-serif;font-weight:700;font-size:20px;color:' + COLORS.navy + ';background:' + COLORS.gold + ';text-decoration:none}'
  ].join('\n');

  function injectCSS() {
    if ($(STYLE_ID)) return;
    try {
      var st = doc.createElement('style');
      st.id = STYLE_ID;
      st.textContent = CSS;
      doc.head.appendChild(st);
    } catch (e) {}
  }

  /* ---------- النصوص ---------- */
  function mountTexts(stations) {
    injectCSS();
    var host = ensure('intro-texts', 'intro-ui');
    host.innerHTML = '';
    texts = [];
    current = -1;
    var list = (stations || []).slice().sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
    list.forEach(function (st, k) {
      var idx = typeof st.index === 'number' ? st.index : k;
      var t = stationText(st);
      var el = doc.createElement('div');
      el.className = 'scene-text';
      el.setAttribute('data-i', idx);
      el.setAttribute('aria-hidden', 'true');
      var h2 = doc.createElement('h2');
      h2.textContent = t.headline;
      var p = doc.createElement('p');
      p.textContent = t.copy;
      el.appendChild(h2);
      el.appendChild(p);
      el.style.opacity = '0';
      host.appendChild(el);
      /* المفتاح هو الموضع k في الترتيب (يطابق state.i من core) لا index الاسمي */
      texts[k] = { el: el, h2: h2, p: p, a: -1, ty: 0 };
    });
    try { bar.observeLogin(); } catch (e) {}
    return host;
  }

  function applyText(item, a, ty) {
    a = Math.round(a * 100) / 100;
    ty = Math.round(ty * 10) / 10;
    if (item.a === a && item.ty === ty) return;
    item.a = a; item.ty = ty;
    item.el.style.opacity = String(a);
    item.h2.style.transform = 'translate3d(0,' + ty + 'px,0)';
    item.p.style.transform = 'translate3d(0,' + (ty * 1.35) + 'px,0)';
  }

  function setActive(i, p) {
    if (current !== i && current >= 0 && texts[current]) applyText(texts[current], 0, 0);
    current = i;
    if (NS.state && typeof NS.state.t === 'number') hint.update(NS.state.t);
    var item = texts[i];
    if (!item) return;
    p = clamp(+p || 0, 0, 1);
    var a, ty, k;
    if (p < 0.1) { a = 0; ty = 24; }
    else if (p < 0.2) { k = easeOut((p - 0.1) / 0.1); a = k; ty = 24 * (1 - k); }
    else if (p <= 0.75) { a = 1; ty = 0; }
    else if (p < 0.85) { k = easeIn((p - 0.75) / 0.1); a = 1 - k; ty = -24 * k; }
    else { a = 0; ty = -24; }
    applyText(item, a, ty);
  }

  /* ---------- العدّاد ---------- */
  var counter = (function () {
    var host = null, numEl = null, barsEl = null, barEls = [], target = 1, lastHundred = -1;
    /* الكتابة إلى DOM بحد أقصى 20 مرة/ثانية وعند تغيّر القيمة الصحيحة فقط (كانت كل إطار مع إعادة تخطيط قسرية) */
    var shownVal = -1, pendingVal = -1, lastWrite = 0, flushTimer = 0;
    var WRITE_MS = 50;
    function tnow() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
    function build() {
      host = ensure('intro-counter', 'intro-ui');
      if (!numEl || numEl.parentNode !== host) {
        host.innerHTML = '';
        numEl = doc.createElement('div'); numEl.className = 'num';
        barsEl = doc.createElement('div'); barsEl.className = 'bars';
        host.appendChild(numEl); host.appendChild(barsEl);
      }
      return host;
    }
    function show(n, bars) {
      injectCSS();
      build();
      target = Math.max(1, +n || 1);
      lastHundred = -1;
      barsEl.innerHTML = '';
      barEls = [];
      var list = Array.isArray(bars) ? bars : [];
      var max = 0;
      list.forEach(function (b) { var v = (b && typeof b === 'object') ? +b.value : +b; if (v > max) max = v; });
      list.forEach(function (b, k) {
        var v = (b && typeof b === 'object') ? +b.value : +b;
        var span = doc.createElement('span');
        span.className = 'bar';
        var fill = doc.createElement('i');
        if (b && typeof b === 'object' && b.color) fill.style.background = b.color;
        span.appendChild(fill);
        if (b && typeof b === 'object' && b.name) span.setAttribute('title', b.name);
        barsEl.appendChild(span);
        barEls.push({ fill: fill, w: max > 0 ? clamp(v / max, 0.06, 1) : 0, delay: k * 0.03 });
      });
      host.hidden = false;
      shownVal = -1; pendingVal = -1; lastWrite = 0;
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; }
      write(0);
      return host;
    }
    function pulse() {
      try {
        if (typeof numEl.animate === 'function') {
          numEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 280, easing: 'ease-out' });
        } else {
          numEl.classList.remove('pulse');
          later(function () { numEl.classList.add('pulse'); }, 16);
        }
      } catch (e) {}
    }
    function write(value) {
      shownVal = value;
      lastWrite = tnow();
      numEl.textContent = arNum(value);
      var h = Math.floor(value / 100);
      if (lastHundred >= 0 && h !== lastHundred) pulse();
      lastHundred = h;
      var f = clamp(value / target, 0, 1);
      for (var i = 0; i < barEls.length; i++) {
        var b = barEls[i];
        var local = clamp((f - b.delay) / (1 - 0.3), 0, 1);
        var sx = (b.w * easeOut(local)).toFixed(3);
        if (b.last !== sx) { b.last = sx; b.fill.style.transform = 'scaleX(' + sx + ')'; }
      }
    }
    function flush() {
      flushTimer = 0;
      if (pendingVal >= 0 && pendingVal !== shownVal && numEl) write(pendingVal);
      pendingVal = -1;
    }
    function set(value) {
      if (!numEl) build();
      value = Math.max(0, Math.round(+value || 0));
      if (value === shownVal) { pendingVal = -1; return; }
      var wait = WRITE_MS - (tnow() - lastWrite);
      if (wait <= 0 || value >= target) { if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; } pendingVal = -1; write(value); return; }
      pendingVal = value;
      if (!flushTimer) flushTimer = setTimeout(flush, wait);
    }
    function hide() {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; }
      pendingVal = -1;
      if (host) host.hidden = true;
    }
    return { show: show, set: set, hide: hide, format: arNum };
  })();

  /* ---------- الشريط الثابت ---------- */
  var bar = (function () {
    var enterFn = null, bound = false;
    function el() { return $('intro-bar'); }
    function enterEl() { var b = el(); return b ? b.querySelector('.enter') : null; }
    function onEnter(fn) {
      enterFn = fn;
      var a = enterEl();
      if (a && !bound) {
        bound = true;
        a.addEventListener('click', function (e) {
          if (typeof enterFn !== 'function') return;
          try { e.preventDefault(); enterFn(e); } catch (err) {}
        });
      }
    }
    function show() { var b = el(); if (b) { b.hidden = false; b.classList.remove('is-hidden'); } }
    function hide() { var b = el(); if (b) b.classList.add('is-hidden'); }
    function setVisible(v) { if (v) show(); else hide(); }
    function observeLogin() {
      if (loginObserver || !('IntersectionObserver' in window)) return;
      var login = $('view-login');
      if (!login) return;
      try {
        loginObserver = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) setVisible(!(entries[i].isIntersecting && entries[i].intersectionRatio >= 0.5));
        }, { threshold: [0, 0.5, 1] });
        loginObserver.observe(login);
      } catch (e) { loginObserver = null; }
    }
    return { el: el, onEnter: onEnter, show: show, hide: hide, setVisible: setVisible, observeLogin: observeLogin };
  })();

  /* ---------- التلميح ---------- */
  var hint = (function () {
    function el() { return $('intro-hint'); }
    function show() { hintOff = false; var h = el(); if (h) h.classList.remove('is-off'); }
    function hide() { hintOff = true; var h = el(); if (h) h.classList.add('is-off'); }
    function update(t) {
      if (t > 0.03) { if (!hintOff) hide(); }
      else if (hintOff) show();
    }
    return { el: el, show: show, hide: hide, update: update };
  })();

  /* ---------- الختم ---------- */
  function buildStamp() {
    var el = ensure('intro-stamp', null);
    var seal = el.querySelector('.seal');
    if (!seal) {
      el.innerHTML = '';
      seal = doc.createElement('div');
      seal.className = 'seal';
      seal.innerHTML =
        '<svg viewBox="0 0 120 120" aria-hidden="true">' +
        '<circle cx="60" cy="60" r="55" fill="none" stroke="' + COLORS.navy + '" stroke-width="2" opacity=".55"/>' +
        '<g fill="' + COLORS.paleGold + '" fill-opacity=".55" stroke="' + COLORS.navy + '" stroke-width="2" stroke-linejoin="round">' +
        '<rect x="27" y="27" width="66" height="66" transform="rotate(0 60 60)"/>' +
        '<rect x="27" y="27" width="66" height="66" transform="rotate(45 60 60)"/>' +
        '</g></svg><b>سُجِّل</b>';
      el.appendChild(seal);
    }
    return { el: el, seal: seal };
  }

  /* الختم طبقة CSS مستقلة عن الجولة: يُعرض ثم يُنهي core الجولة فوراً؛ مؤقتاته منفصلة فلا يمسحها finish()
     حركة الختم نفسها CSS (#intro-stamp.is-on .seal في intro.css) والرذاذ WAAPI إن توفر */
  var stampTimers = [];
  function stampLater(fn, ms) { var t = setTimeout(fn, ms); stampTimers.push(t); return t; }
  function stamp() {
    injectCSS();
    return new Promise(function (resolve) {
      var done = false, el = null, sprays = [];
      function finish() {
        if (done) return;
        done = true;
        try {
          for (var i = 0; i < sprays.length; i++) sprays[i].remove();
          if (el) { el.hidden = true; el.classList.remove('is-on'); if (el.parentNode) el.parentNode.removeChild(el); }
          var st = $(STYLE_ID); if (st && !$('intro-texts')) st.remove();
        } catch (e) {}
        resolve();
      }
      stampLater(finish, 900);
      try {
        var parts = buildStamp();
        el = parts.el;
        var seal = parts.seal;
        try {
          var olds = (el.getAnimations ? el.getAnimations({ subtree: true }) : []);
          for (var o = 0; o < olds.length; o++) olds[o].cancel();
        } catch (e) {}
        el.hidden = false;
        el.classList.add('is-on');
        try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
        var canAnimate = typeof seal.animate === 'function';
        if (canAnimate) {
          for (var k = 0; k < 12; k++) {
            var sp = doc.createElement('i');
            sp.className = 'spray';
            el.appendChild(sp);
            sprays.push(sp);
            var ang = (k / 12) * Math.PI * 2 + 0.2;
            var dist = 70 + (k % 3) * 14;
            var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
            sp.animate(
              [
                { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
                { transform: 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0) scale(0.2)', opacity: 0 }
              ],
              { duration: 420, delay: 230 + (k % 4) * 20, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' }
            );
          }
          stampLater(function () {
            try {
              var fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
              fade.onfinish = finish;
              stampLater(finish, 240);
            } catch (e) { finish(); }
          }, 480);
        } else {
          stampLater(function () { try { el.classList.add('fade'); } catch (e) {} }, 500);
          stampLater(finish, 700);
        }
      } catch (e) { finish(); }
    });
  }

  /* ---------- الملصقات ---------- */
  function posters(list) {
    injectCSS();
    var host = ensure('intro-posters', null);
    host.innerHTML = '';
    var items = (list || []).slice().sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
    items.forEach(function (item, k) {
      var n = (typeof item.index === 'number' ? item.index : k) + 1;
      var t = stationText(item);
      var src = item.src || item.poster || ('assets/intro/posters/s' + n + '.webp');
      var sec = doc.createElement('section');
      sec.className = 'poster';
      sec.setAttribute('data-i', n);
      try {
        var img = new Image();
        img.alt = '';
        img.decoding = 'async';
        img.loading = k < 2 ? 'eager' : 'lazy';
        img.onerror = function () { sec.classList.add('no-img'); try { img.remove(); } catch (e) {} };
        img.src = src;
        sec.appendChild(img);
      } catch (e) { sec.classList.add('no-img'); }
      var txt = doc.createElement('div');
      txt.className = 'txt';
      var h2 = doc.createElement('h2'); h2.textContent = t.headline;
      var p = doc.createElement('p'); p.textContent = t.copy;
      txt.appendChild(h2); txt.appendChild(p);
      sec.appendChild(txt);
      host.appendChild(sec);
    });
    var cta = doc.createElement('a');
    cta.className = 'poster-enter';
    cta.href = '#view-login';
    cta.textContent = 'دخول';
    host.appendChild(cta);
    host.hidden = false;
    return host;
  }

  /* ---------- التنظيف (DOM فقط)؛ keepStamp يترك الختم وأنماطه ليزولا بمؤقت الختم ---------- */
  function finish(keepStamp) {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
    if (loginObserver) { try { loginObserver.disconnect(); } catch (e) {} loginObserver = null; }
    texts = [];
    current = -1;
    var ids = ['intro-texts', 'intro-counter', 'intro-hint', 'intro-bar', 'intro-posters', 'intro', 'intro-track'];
    if (!keepStamp) { ids.push('intro-stamp'); ids.push(STYLE_ID); }
    for (var k = 0; k < ids.length; k++) {
      var el = $(ids[k]);
      if (el) { try { el.remove(); } catch (e) {} }
    }
  }

  NS.ui = {
    mountTexts: mountTexts,
    setActive: setActive,
    counter: counter,
    bar: bar,
    hint: hint,
    stamp: stamp,
    finish: finish,
    posters: posters,
    arNum: arNum
  };
})();
