/* assets/bday-intro.js — 11.11 首页开场（2026）
 *
 * 只在「11 月 11 日当天、这台设备还没看过」时出现一次；其它日子这个文件直接 return，
 * 页面一个字节都不多。想当场看效果：index.html?bday=1（可加 &t=7.2 定格某一帧）。
 *
 * 为什么不用 CSS 动画：花瓣要有景深、要能压在她的立绘前面，还要有胶片颗粒压渐变 banding，
 * 这些都得逐帧合成；所以是一条 rAF 时间轴 + 三张预烘的图层（星空 / 她的光 / 颗粒）。
 * 实测每帧 0.25ms（375×812，软件渲染）、5ms（1280×800）—— 见 tools/proto/bday-intro-v12.html。
 *
 * 三条纪律：
 *   ① 开场期间暂停首页自己的花瓣 canvas（window.__bdayIntro），别两个系统抢 CPU；
 *   ② 系统开了「减少动态效果」就给一张静帧，不跑动画；
 *   ③ 结束必须清干净：解锁滚动、删节点、记 seen。
 */
(function () {
  'use strict';

  var YEAR = 2026, MONTH = 11, DAY = 11;
  var DUR = 11.5;                       // 秒；主人 2026-11-04 定「10–12 秒」
  var ART_SRC = '/images/mid/armor-pink-700.webp';
  var SEEN_KEY = 'elysia.bday.' + YEAR + '.seen';

  var qs = new URLSearchParams(location.search);
  var forced = qs.has('bday');
  var freezeAt = (forced && qs.has('t')) ? parseFloat(qs.get('t')) : null;

  function isBirthday() {
    var d = new Date();
    return d.getMonth() === MONTH - 1 && d.getDate() === DAY;
  }
  function alreadySeen() {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; }
  }
  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* 无痕模式：那就每次都放 */ }
  }

  if (!freezeAt && !forced) {
    if (!isBirthday() || alreadySeen()) return;
  }
  if (document.getElementById('bdayIntro')) return;

  var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 骨架 ----------
  var root = document.createElement('div');
  root.id = 'bdayIntro';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '11.11 · 爱莉希雅的生日');
  root.innerHTML =
    '<canvas class="bday-canvas" aria-hidden="true"></canvas>' +
    '<div class="bday-vig" aria-hidden="true"></div>' +
    '<div class="bday-grain" aria-hidden="true"></div>' +
    '<div class="bday-copy">' +
      '<div class="bday-date">11.11</div>' +
      '<div class="bday-name">爱莉希雅</div>' +
      '<div class="bday-say">今天是我的生日哦。要一起庆祝吗？</div>' +
      '<div class="bday-sig">HAPPY BIRTHDAY</div>' +
    '</div>' +
    '<button type="button" class="bday-skip">跳过</button>';
  document.body.appendChild(root);
  document.documentElement.classList.add('bday-lock');

  var cv = root.querySelector('.bday-canvas');
  var ctx = cv.getContext('2d');
  var elCopy = root.querySelector('.bday-copy');
  var elDate = root.querySelector('.bday-date');
  var elName = root.querySelector('.bday-name');
  var elSay = root.querySelector('.bday-say');
  var elSig = root.querySelector('.bday-sig');
  var elGrain = root.querySelector('.bday-grain');
  var elSkip = root.querySelector('.bday-skip');

  var W = 0, H = 0, DPR = 1;
  var stars = [], petals = [], sprites = [], spritesSoft = [];
  var artSprite = null, artW = 0, artH = 0, artY = 0;
  var skyCv = null, lightCv = null;
  var running = false, finished = false;

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(a, b, x) { x = clamp01((x - a) / (b - a)); return x * x * (3 - 2 * x); }
  function easeOut3(x) { x = clamp01(x); return 1 - Math.pow(1 - x, 3); }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // ---------- 素材：花瓣贴图（一次画好，运行时只 blit）----------
  function makeSprite(hex, soft) {
    var S = 160, c = document.createElement('canvas');
    c.width = c.height = S;
    var g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    if (soft) g.filter = 'blur(' + (S * 0.035).toFixed(1) + 'px)';
    function path() {
      g.beginPath();
      g.moveTo(0, -S * 0.38);
      g.bezierCurveTo(S * 0.24, -S * 0.27, S * 0.33, S * 0.02, S * 0.21, S * 0.24);
      g.bezierCurveTo(S * 0.11, S * 0.38, -S * 0.11, S * 0.38, -S * 0.21, S * 0.24);
      g.bezierCurveTo(-S * 0.33, S * 0.02, -S * 0.24, -S * 0.27, 0, -S * 0.38);
      g.closePath();
    }
    path();
    var lg = g.createLinearGradient(0, -S * 0.38, 0, S * 0.38);
    lg.addColorStop(0, hexA(hex, 1));
    lg.addColorStop(0.4, hexA(hex, 0.92));
    lg.addColorStop(0.8, hexA(hex, 0.55));
    lg.addColorStop(1, hexA(hex, 0.18));
    g.fillStyle = lg; g.fill();
    g.save(); path(); g.clip();
    var rg = g.createRadialGradient(-S * 0.04, -S * 0.06, 0, 0, 0, S * 0.4);
    rg.addColorStop(0, 'rgba(255,255,255,.6)');
    rg.addColorStop(0.3, hexA(hex, 0.35));
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(-S / 2, -S / 2, S, S);
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = S * 0.012; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, -S * 0.32); g.quadraticCurveTo(S * 0.025, 0, 0, S * 0.27); g.stroke();
    g.restore();
    g.strokeStyle = hexA(hex, 0.32); g.lineWidth = S * 0.007; path(); g.stroke();
    return c;
  }

  function buildArt(img) {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    var fade = g.createLinearGradient(0, c.height * 0.80, 0, c.height);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = fade; g.fillRect(0, c.height * 0.80, c.width, c.height * 0.20);
    g.globalCompositeOperation = 'source-over';
    artSprite = c;
    layout();
  }

  function measureCopy() {
    elCopy.style.top = '0px';
    return elCopy.offsetHeight || 160;
  }

  function layout() {
    if (!artSprite) return;
    var portrait = (H >= W);
    var maxH = portrait ? H * 0.60 : H * 0.62;
    var maxW = portrait ? W * 0.96 : W * 0.44;
    var k = Math.min(maxH / artSprite.height, maxW / artSprite.width);
    artW = artSprite.width * k; artH = artSprite.height * k;
    var copyH = measureCopy();
    var gap = portrait ? Math.round(H * 0.022) : Math.round(H * 0.036);
    var pad = Math.round(H * 0.028);
    var total = artH + gap + copyH;
    if (total + pad * 2 > H) {
      var avail = H - pad * 2 - gap - copyH;
      if (avail > H * 0.34) {
        artH = avail;
        artW = artH * (artSprite.width / artSprite.height);
        total = artH + gap + copyH;
      }
    }
    artY = Math.max(pad, (H - total) / 2);
    elCopy.style.top = Math.round(artY + artH + gap) + 'px';
    bakeLight();
  }

  // 她背后的光 + 脚下的光：一次烘好，之后只按 alpha 合成
  function bakeLight() {
    lightCv = null;
    if (!artSprite) return;
    var c = document.createElement('canvas');
    c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
    var g = c.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.globalCompositeOperation = 'lighter';
    var hy = artY + artH * 0.36, hR = artW * 1.75;
    g.save(); g.translate(W / 2, hy); g.scale(1, 1.04); g.translate(-W / 2, -hy);
    var halo = g.createRadialGradient(W / 2, hy, 0, W / 2, hy, hR);
    halo.addColorStop(0, 'rgba(255,200,224,0.17)');
    halo.addColorStop(0.20, 'rgba(242,168,210,0.135)');
    halo.addColorStop(0.38, 'rgba(222,136,196,0.092)');
    halo.addColorStop(0.56, 'rgba(196,110,184,0.052)');
    halo.addColorStop(0.74, 'rgba(166,88,174,0.024)');
    halo.addColorStop(0.89, 'rgba(150,80,170,0.008)');
    halo.addColorStop(1, 'rgba(150,80,170,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(W / 2, hy, hR, 0, 6.283); g.fill();
    g.restore();

    var fy = artY + artH * 0.955, fR = artW * 0.86;
    g.save(); g.translate(W / 2, fy); g.scale(1, 0.16); g.translate(-W / 2, -fy);
    var pool = g.createRadialGradient(W / 2, fy, 0, W / 2, fy, fR);
    pool.addColorStop(0, 'rgba(255,204,230,0.30)');
    pool.addColorStop(0.35, 'rgba(255,158,196,0.12)');
    pool.addColorStop(0.7, 'rgba(238,128,186,0.035)');
    pool.addColorStop(1, 'rgba(238,128,186,0)');
    g.fillStyle = pool; g.beginPath(); g.arc(W / 2, fy, fR, 0, 6.283); g.fill();
    g.restore();
    g.save(); g.translate(W / 2, fy); g.scale(1, 0.30); g.translate(-W / 2, -fy);
    var pool2 = g.createRadialGradient(W / 2, fy, 0, W / 2, fy, fR * 1.5);
    pool2.addColorStop(0, 'rgba(255,206,232,0.10)');
    pool2.addColorStop(0.45, 'rgba(255,164,200,0.045)');
    pool2.addColorStop(1, 'rgba(255,164,200,0)');
    g.fillStyle = pool2; g.beginPath(); g.arc(W / 2, fy, fR * 1.5, 0, 6.283); g.fill();
    g.restore();
    lightCv = c;
  }

  // 星空与星云：烘一次
  function bakeSky() {
    var c = document.createElement('canvas');
    c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
    var g = c.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = '#08040f'; g.fillRect(0, 0, W, H);
    var neb = g.createRadialGradient(W * 0.34, H * 0.30, 0, W * 0.34, H * 0.30, Math.max(W, H) * 0.66);
    neb.addColorStop(0, 'rgba(92,40,142,0.24)');
    neb.addColorStop(0.45, 'rgba(58,24,96,0.13)');
    neb.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = neb; g.fillRect(0, 0, W, H);
    var neb2 = g.createRadialGradient(W * 0.76, H * 0.66, 0, W * 0.76, H * 0.66, Math.max(W, H) * 0.58);
    neb2.addColorStop(0, 'rgba(126,46,104,0.16)');
    neb2.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = neb2; g.fillRect(0, 0, W, H);
    skyCv = c;
  }

  // 胶片颗粒：交给合成层（mix-blend-mode: soft-light），不占主线程
  function buildGrain() {
    var S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    var g = c.getContext('2d'), d = g.createImageData(S, S), a = d.data;
    for (var i = 0; i < S * S; i++) {
      var v = (Math.random() * 255) | 0;
      a[i * 4] = v; a[i * 4 + 1] = v; a[i * 4 + 2] = v; a[i * 4 + 3] = 26;
    }
    g.putImageData(d, 0, 0);
    elGrain.style.backgroundImage = 'url(' + c.toDataURL('image/png') + ')';
  }

  function build() {
    stars = [];
    var ns = Math.round(W * H / 9000);
    for (var i = 0; i < ns; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H * 0.97,
        r: 0.3 + Math.random() * 1.25, ph: Math.random() * 6.283, sp: 0.4 + Math.random() * 1.4,
        warm: Math.random() < 0.2, big: Math.random() < 0.07
      });
    }
    petals = [];
    var layers = [
      { n: Math.max(46, Math.round(W * 0.13)), s: [2.2, 3.8], a: 0.34, soft: false, front: false },
      { n: Math.max(30, Math.round(W * 0.08)), s: [4.2, 7.6], a: 0.60, soft: false, front: false },
      { n: Math.max(14, Math.round(W * 0.035)), s: [9.0, 15.0], a: 0.85, soft: true, front: true },
      { n: Math.max(9, Math.round(W * 0.022)), s: [16.0, 28.0], a: 0.50, soft: true, front: true }
    ];
    for (var L = 0; L < layers.length; L++) {
      var cfg = layers[L];
      for (var j = 0; j < cfg.n; j++) {
        petals.push({
          size: cfg.s[0] + Math.random() * (cfg.s[1] - cfg.s[0]),
          alpha: cfg.a * (0.7 + Math.random() * 0.3),
          front: cfg.front,
          sp: cfg.soft ? spritesSoft : sprites,
          t0: 0.3 + Math.random() * 6.1,
          x0: W * (-0.05 + Math.random() * 1.1),
          y0: -H * (0.12 + Math.random() * 0.9),
          vy: (0.045 + Math.random() * 0.085) * H,
          vx: (Math.random() - 0.5) * W * 0.010,
          swA: 10 + Math.random() * 34,
          swW: 0.3 + Math.random() * 0.5,
          swP: Math.random() * 6.283,
          rot0: Math.random() * 6.283,
          rotV: (Math.random() - 0.5) * 0.5,
          flipP: Math.random() * 6.283,
          flipS: 0.6 + Math.random() * 1.3
        });
      }
    }
    for (var b = 0; b < petals.length; b++) petals[b].seed = (Math.random() * 6) | 0;
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = root.clientWidth || window.innerWidth;
    H = root.clientHeight || window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bakeSky();
    build();
    elCopy.style.top = '0px';
    layout();
  }

  function drawPetals(list, t) {
    for (var i = 0; i < list.length; i++) {
      var q = list[i];
      if (t < q.t0) continue;
      var dt = t - q.t0;
      var spanY = H + q.size * 3;
      var y = (q.y0 + q.vy * dt + q.size * 1.5) % spanY;
      if (y < 0) y += spanY;
      y -= q.size * 1.5;
      var spanX = W * 1.24;
      var x = q.x0 + q.vx * dt + Math.sin(t * q.swW + q.swP) * q.swA;
      x = (x + W * 0.12) % spanX; if (x < 0) x += spanX; x -= W * 0.12;
      var flip = Math.cos(q.flipP + t * q.flipS);
      var sx = Math.abs(flip) * 0.82 + 0.18;
      ctx.globalAlpha = q.alpha * (0.45 + 0.55 * Math.abs(flip)) * smooth(q.t0, q.t0 + 1.2, t);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(q.rot0 + q.rotV * dt); ctx.scale(sx, 1);
      ctx.drawImage(q.sp[q.seed % q.sp.length], -q.size / 2, -q.size / 2, q.size, q.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function draw(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    var sky = easeOut3((t - 0.05) / 2.0);
    if (skyCv) {
      ctx.globalAlpha = 0.35 + 0.65 * sky;
      ctx.drawImage(skyCv, 0, 0, W, H);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#08040f'; ctx.fillRect(0, 0, W, H);
    }

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = 0.35 + 0.65 * Math.abs(Math.sin(t * s.sp + s.ph));
      ctx.globalAlpha = sky * tw * (s.big ? 0.85 : 0.5);
      ctx.fillStyle = s.warm ? '#ffe0b8' : '#ffffff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawPetals(petals.filter(function (p) { return !p.front; }), t);

    var artIn = smooth(3.4, 6.3, t);
    var out = smooth(DUR - 1.3, DUR, t);
    var artA = artIn * (1 - out);
    if (lightCv && artA > 0.004) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = artA;
      ctx.drawImage(lightCv, 0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (artSprite && artA > 0.004) {
      var rise = (1 - artIn) * H * 0.035;
      var sc = 1 + (1 - artIn) * 0.045;
      ctx.save();
      ctx.globalAlpha = artA;
      ctx.translate(W / 2, artY + artH / 2 + rise);
      ctx.scale(sc, sc);
      ctx.drawImage(artSprite, -artW / 2, -artH / 2, artW, artH);
      ctx.restore();
    }

    drawPetals(petals.filter(function (p) { return p.front; }), t);

    var dateIn = smooth(5.9, 7.1, t);
    elDate.style.opacity = String(dateIn * (1 - out));
    elDate.style.filter = 'blur(' + ((1 - dateIn) * 14).toFixed(2) + 'px)';
    elDate.style.letterSpacing = (0.32 - 0.20 * easeOut3((t - 5.9) / 2.4)).toFixed(3) + 'em';
    elDate.style.transform = 'translateY(' + ((1 - dateIn) * 14).toFixed(1) + 'px)';

    var nameIn = smooth(7.0, 8.0, t);
    elName.style.opacity = String(nameIn * (1 - out));
    elName.style.filter = 'blur(' + ((1 - nameIn) * 9).toFixed(2) + 'px)';

    var sayIn = smooth(7.8, 8.9, t);
    elSay.style.opacity = String(sayIn * (1 - out));
    elSay.style.filter = 'blur(' + ((1 - sayIn) * 8).toFixed(2) + 'px)';

    var sigIn = smooth(8.9, 9.8, t);
    elSig.style.opacity = String(sigIn * 0.85 * (1 - out));

    root.style.opacity = String(1 - out);
    return out >= 1;
  }

  function teardown() {
    if (finished) return;
    finished = true;
    markSeen();
    window.__bdayIntro = false;
    document.documentElement.classList.remove('bday-lock');
    // 注意：draw() 每帧都写了内联 opacity，样式表里的 .is-done 盖不过它
    // ⇒ 退场淡出必须写内联，否则「减少动态效果」那条静帧路径会硬切。
    root.style.transition = 'opacity .48s ease';
    root.style.opacity = '0';
    setTimeout(function () {
      if (root.parentNode) root.parentNode.removeChild(root);
    }, 480);
  }

  // ---------- 启动 ----------
  sprites = ['#ffd8e6', '#ffc2d6', '#ffa9c3', '#ffdfc0', '#ffd166', '#f5d0ff'].map(function (h) { return makeSprite(h, false); });
  spritesSoft = ['#ffc2d6', '#ffa9c3', '#ffd166', '#f5d0ff'].map(function (h) { return makeSprite(h, true); });
  buildGrain();
  resize();
  window.__bdayIntro = true;

  var art = new Image();
  art.onload = function () {
    buildArt(art);
    if (freezeAt !== null) { draw(freezeAt); return; }
    if (REDUCE) {
      // 静帧取 9.9 秒：那一刻 11.11 / 名字 / 句子 / HAPPY BIRTHDAY 都已经显影完，
      // 是这条时间轴上唯一「四行全在、还没有开始暗下去」的构图。
      draw(9.9);
      setTimeout(teardown, 3200);
      return;
    }
    play();
  };
  art.onerror = function () {
    // 立绘取不到就退化成只有星空与花瓣的版本，不要白屏
    if (freezeAt !== null) { draw(freezeAt); return; }
    if (REDUCE) { draw(9.9); setTimeout(teardown, 2400); return; }
    play();
  };
  art.src = ART_SRC;

  window.addEventListener('resize', function () {
    resize();
    if (freezeAt !== null) draw(freezeAt);
  });
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); if (freezeAt !== null) draw(freezeAt); }).observe(root);

  elSkip.addEventListener('click', function () { stopAt(DUR); });

  var rafId = 0, t0 = 0, paused = false, skipto = null;

  function stopAt(target) {
    if (target !== null && target !== undefined) skipto = target;
  }

  function play() {
    if (running) return;
    running = true;
    t0 = performance.now();

    function frame(now) {
      if (!running) return;
      if (document.hidden) { paused = true; rafId = requestAnimationFrame(frame); return; }
      if (paused) { paused = false; t0 = now - lastT * 1000; }
      var t = (now - t0) / 1000;
      if (skipto !== null) { t = Math.max(t, skipto); skipto = null; }
      if (t >= DUR) { draw(DUR); running = false; teardown(); return; }
      var done = draw(t);
      lastT = t;
      if (done) { running = false; teardown(); return; }
      rafId = requestAnimationFrame(frame);
    }
    var lastT = 0;
    rafId = requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) paused = false;
  });
})();
