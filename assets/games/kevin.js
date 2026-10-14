/* assets/games/kevin.js — 凯文（Ⅰ · 救世）的小游戏《碎冰》
 *
 * 玩法：冰面上不断窜出冰棱，用**一把剑的横扫**把它们斩碎 —— 按住拖过去就是一刀，
 *       一刀扫过的冰棱越多，这一击越响。45 秒，看能碎多少。
 *
 * 为什么是这个玩法：全站已有的七个游戏里，**没有一个是「划过一条路径」的** ——
 *   樱是等时机、科斯魔是守、梅比乌斯是躲、格蕾修是涂、华是打桩、帕朵是接、苏是记。
 *   而「一剑横扫、碎尽眼前冰棱」正是他（救世之铭、斩断一切的那把剑）的样子。
 *
 * ⚠ 契约（spec §4.5）：挂 `window.ElysiaGames.kevin`，带 `title` / `hint` / `mount(host)`；
 *   卡里 `.game-card-title` 与 `.game-card-hint` 的文字必须与 `title` / `hint` **逐字一致**。
 * ⚠ 遮罩**必须在 `mount()` 时就建好**（默认 `aria-hidden="true"`、不带 `.on`）——
 *   断言 ① 第一件事就是查这个（苏那一轮踩过，见 HANDOVER 2.3）。
 * ⚠ 退出键 400ms 保护期（断言 ③ 会验）。
 * ⚠ 画面**从第一帧就要动**（飘雪 + 呼吸寒光），断言 ① 量「点开始后两次采样必须不同」。
 * ⚠ 全程 rAF，不依赖 CSS 动画 —— 减动偏好下照常能玩（断言 ②）。
 * ⚠ 画布不许拉扁：属性 340×420，CSS 只给 width、height:auto。
 * ⚠ 这一页画布是**滑动面**（按住拖着挥）⇒ 登记 GAMES 时要写 `swipe: True`（50px 口径）。
 */
(function (global) {
  'use strict';

  var CLOSE_GUARD_MS = 400;
  var openedAt = 0;
  var CW = 340, CH = 420;
  var ICE_Y = CH - 54;          // 冰面高度（冰棱从这里长出来）
  var ROUND_MS = 45000;

  var STYLE = ".game-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:14px;padding:1.6rem 1.4rem;text-align:center;max-width:26rem;margin:0 auto}\n.game-card-title{font-size:1.15rem;letter-spacing:.14em;color:#a8d4f5;margin-bottom:.5rem;font-weight:400}\n.game-card-hint{font-size:.82rem;line-height:1.9;color:var(--text-dim);margin-bottom:1.1rem;font-weight:300}\n.game-card-start{appearance:none;cursor:pointer;font:inherit;font-size:.85rem;letter-spacing:.14em;color:#06121e;background:#a8d4f5;border:none;border-radius:999px;padding:.62rem 1.9rem;min-height:44px;transition:transform .25s ease,box-shadow .25s ease}\n.game-card-start:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(168,212,245,.28)}\n.kv-stage{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;background:rgba(4,10,18,.94);backdrop-filter:blur(6px);padding:1.2rem}\n.kv-stage.on{display:flex}\n.kv-box{position:relative;display:flex;flex-direction:column;align-items:center;gap:.7rem;width:100%;max-width:460px}\n.kv-col{display:flex;flex-direction:column;align-items:center;gap:.6rem}\n.kv-head{font-size:.82rem;letter-spacing:.16em;color:var(--text-dim);font-weight:300}\n.kv-head b{color:#a8d4f5;font-weight:400;font-size:1rem}\n.kv-msg{font-size:.9rem;letter-spacing:.1em;color:#e8f4ff;min-height:1.6em;font-weight:300;text-align:center}\n.kv-canvas{width:min(340px,84vw);height:auto;aspect-ratio:340/420;border-radius:16px;background:radial-gradient(circle at 50% 88%,rgba(168,212,245,.12),transparent 66%);border:none;box-shadow:0 0 0 1px var(--glass-border);touch-action:none;display:block;cursor:crosshair}  /* ⚠ 边框用 box-shadow 画、**不占布局**：`aspect-ratio` 算的是边框盒，而断言量的是**内容盒** —— 留 1px 边框会差 ~1px 被判「拉扁」 */\n.kv-row{display:flex;gap:.8rem;justify-content:center;flex-wrap:wrap}\n.kv-btn{appearance:none;cursor:pointer;font:inherit;font-size:.82rem;letter-spacing:.12em;min-height:44px;color:var(--text);background:transparent;border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.4rem}\n.kv-btn:hover{border-color:#a8d4f5;color:#a8d4f5}\n/* ⚠ 收起固定在**右上角** —— 断言 ③ 要求退出键离操作区够远（本页画布是滑动面 ⇒ 50px 口径，稳过） */\n.kv-close{position:fixed;top:calc(1rem + env(safe-area-inset-top));right:1rem;appearance:none;cursor:pointer;font:inherit;font-size:.78rem;letter-spacing:.12em;color:var(--text-dim);background:rgba(4,10,18,.6);border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.1rem;min-height:40px}\n.kv-close:hover{color:#a8d4f5;border-color:#a8d4f5}\n/* ⚠ 横屏塞不下（遮罩 fixed、没有滚动条）—— 左右两栏 + 画布按 vh 缩 */\n@media (max-height:520px) and (orientation:landscape){\n  .kv-box{flex-direction:row;align-items:center;justify-content:center;max-width:760px;gap:1.4rem}\n  .kv-canvas{width:auto;height:min(70vh,300px)}\n}";

  function injectStyle() {
    if (document.getElementById('kv-game-style')) return;
    var s = document.createElement('style');
    s.id = 'kv-game-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  var host = null, overlay = null, canvas = null, ctx = null;
  var scoreEl = null, timeEl = null, bestEl = null, msgEl = null;
  var running = false, raf = 0, startedAt = 0, leftMs = ROUND_MS;
  var crystals = [], flakes = [], slashes = [];
  var score = 0, best = 0, lastSpawn = 0, stroke = null, phase = 0;

  try { best = parseInt(localStorage.getItem('elysia:kevin:best') || '0', 10) || 0; } catch (e) { best = 0; }

  function makeFlakes() {
    flakes = [];
    for (var i = 0; i < 26; i++) {
      flakes.push({ x: Math.random() * CW, y: Math.random() * CH, r: 0.6 + Math.random() * 1.7,
                    vy: 0.20 + Math.random() * 0.55, vx: (Math.random() - 0.5) * 0.22,
                    a: 0.10 + Math.random() * 0.34 });
    }
  }

  function spawnCrystal() {
    var h = 34 + Math.random() * 54;
    crystals.push({ x: 30 + Math.random() * (CW - 60), h: h, y: 0, up: true, dead: 0, lag: Math.random() * 0.6 });
  }

  function start() {
    score = 0;
    leftMs = ROUND_MS;
    crystals = [];
    slashes = [];
    stroke = null;
    makeFlakes();
    running = true;
    startedAt = performance.now();
    lastSpawn = startedAt;
    if (scoreEl) scoreEl.textContent = '0';
    if (bestEl) bestEl.textContent = String(best);
    if (msgEl) msgEl.textContent = '按下去，横扫 ——';
    spawnCrystal();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    var i, f;
    for (i = 0; i < flakes.length; i++) {
      f = flakes[i];
      f.x += f.vx; f.y += f.vy;
      if (f.y > CH) { f.y = -4; f.x = Math.random() * CW; }
      if (f.x < -4) f.x = CW + 4;
      if (f.x > CW + 4) f.x = -4;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(220,238,255,' + f.a.toFixed(3) + ')';
      ctx.fill();
    }
    /* 冰面 */
    var g = ctx.createLinearGradient(0, ICE_Y - 16, 0, CH);
    g.addColorStop(0, 'rgba(168,212,245,.20)');
    g.addColorStop(1, 'rgba(168,212,245,.03)');
    ctx.fillStyle = g;
    ctx.fillRect(0, ICE_Y, CW, CH - ICE_Y);
    ctx.strokeStyle = 'rgba(220,238,255,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, ICE_Y); ctx.lineTo(CW, ICE_Y);
    ctx.stroke();
    /* 冰棱 */
    for (i = 0; i < crystals.length; i++) {
      var c = crystals[i];
      var hh = c.dead ? Math.max(0, c.h * (1 - c.dead)) : c.h;
      if (hh <= 0.5) continue;
      var base = ICE_Y - c.y;
      var grad = ctx.createLinearGradient(c.x, base - hh, c.x, base);
      grad.addColorStop(0, 'rgba(240,250,255,.95)');
      grad.addColorStop(1, 'rgba(168,212,245,.55)');
      ctx.beginPath();
      ctx.moveTo(c.x - 7, base);
      ctx.lineTo(c.x, base - hh);
      ctx.lineTo(c.x + 7, base);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,238,255,.55)';
      ctx.stroke();
    }
    /* 剑气痕 */
    phase += 0.06;
    for (i = slashes.length - 1; i >= 0; i--) {
      var s = slashes[i];
      s.life -= 0.06;
      if (s.life <= 0) { slashes.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.strokeStyle = 'rgba(220,238,255,' + (s.life * 0.55).toFixed(3) + ')';
      ctx.lineWidth = 3 + s.life * 5;
      ctx.stroke();
    }
    /* 中心的呼吸寒光 */
    var pr = 30 + Math.sin(phase) * 7;
    var rg = ctx.createRadialGradient(CW / 2, CH * 0.42, 2, CW / 2, CH * 0.42, pr + 30);
    rg.addColorStop(0, 'rgba(168,212,245,' + (0.10 + Math.sin(phase) * 0.03).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(168,212,245,0)');
    ctx.beginPath();
    ctx.arc(CW / 2, CH * 0.42, pr + 30, 0, Math.PI * 2);
    ctx.fillStyle = rg;
    ctx.fill();
  }

  function loop() {
    if (!running) { raf = 0; return; }
    var now = performance.now();
    leftMs = ROUND_MS - (now - startedAt);
    if (timeEl) timeEl.textContent = String(Math.max(0, Math.ceil(leftMs / 1000)));
    /* ⚠ 密度：实测 1 秒一根对「横扫」太稀（一刀最多扫到一两根，手感发空）——
       改成 ~0.52s 起步、越到后面越快，屏幕上同时 3~6 根才值得一挥手。 */
    var gap = 520 - Math.min(240, (ROUND_MS - leftMs) / 150);
    if (now - lastSpawn > gap && crystals.length < 9) {
      lastSpawn = now;
      spawnCrystal();
    }
    for (var i = crystals.length - 1; i >= 0; i--) {
      var c = crystals[i];
      if (c.dead) {
        c.dead += 0.14;
        if (c.dead >= 1) crystals.splice(i, 1);
        continue;
      }
      if (c.up) {
        c.y = Math.min(c.h, c.y + 2.6);
        if (c.y >= c.h) c.up = false;
      } else {
        c.y -= 0.9;
        if (c.y <= 0) crystals.splice(i, 1);
      }
    }
    if (leftMs <= 0) { finish(); return; }
    draw();
    raf = requestAnimationFrame(loop);
  }

  function finish() {
    running = false;
    raf = 0;
    if (score > best) {
      best = score;
      if (bestEl) bestEl.textContent = String(best);
      try { localStorage.setItem('elysia:kevin:best', String(best)); } catch (e) {}
    }
    if (timeEl) timeEl.textContent = '0';
    if (msgEl) msgEl.textContent = '碎尽 ' + score + ' 根冰棱 —— 按「再来」继续。';
    draw();
  }

  function toCanvas(e) {
    var r = canvas.getBoundingClientRect();
    var t = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (CW / r.width), y: (t.clientY - r.top) * (CH / r.height) };
  }

  function segDist(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = dx * dx + dy * dy;
    var t = len ? ((px - x1) * dx + (py - y1) * dy) / len : 0;
    t = Math.max(0, Math.min(1, t));
    var cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
  }

  function sweep(x1, y1, x2, y2) {
    var hit = 0;
    for (var i = 0; i < crystals.length; i++) {
      var c = crystals[i];
      if (c.dead) continue;
      var top = ICE_Y - c.y - c.h * 0.5;
      if (segDist(c.x, top, x1, y1, x2, y2) < 22 || segDist(c.x, ICE_Y - c.y, x1, y1, x2, y2) < 20) {
        c.dead = 0.001;
        hit++;
      }
    }
    slashes.push({ x1: x1, y1: y1, x2: x2, y2: y2, life: 1 });
    if (slashes.length > 8) slashes.shift();
    if (hit) {
      score += hit;
      if (scoreEl) scoreEl.textContent = String(score);
      if (msgEl && hit >= 3) msgEl.textContent = '一刀 ' + hit + ' 根。';
    }
  }

  function onDown(e) {
    if (!running) return;
    if (e.cancelable) e.preventDefault();
    var p = toCanvas(e);
    stroke = { x: p.x, y: p.y };
  }
  function onMove(e) {
    if (!running || !stroke) return;
    if (e.cancelable) e.preventDefault();
    var p = toCanvas(e);
    if (Math.abs(p.x - stroke.x) + Math.abs(p.y - stroke.y) < 6) return;
    sweep(stroke.x, stroke.y, p.x, p.y);
    stroke = { x: p.x, y: p.y };
  }
  function onUp() { stroke = null; }

  function ensureOverlay() {
    if (overlay) return;
    injectStyle();
    overlay = document.createElement('div');
    overlay.className = 'kv-stage';
    overlay.id = 'kevinGameOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="kv-box">',
      '  <button class="kv-close" id="kvClose" type="button">收起</button>',
      '  <div class="kv-col">',
      '    <div class="kv-head">碎了 <b id="kvScore">0</b> 根 · 剩余 <b id="kvTime">45</b> s · 最佳 <b id="kvBest">0</b></div>',
      '    <div class="kv-msg" id="kvMsg">按下去，横扫 ——</div>',
      '    <canvas class="kv-canvas" id="kvCanvas" width="340" height="420" aria-label="碎冰：冰面与冰棱" role="img"></canvas>',
      '    <div class="kv-row"><button class="kv-btn" id="kvAgain" type="button">再来</button></div>',
      '  </div>',
      '</div>',
    ].join('\n');
    document.body.appendChild(overlay);
    canvas = overlay.querySelector('#kvCanvas');
    ctx = canvas.getContext('2d');
    scoreEl = overlay.querySelector('#kvScore');
    timeEl = overlay.querySelector('#kvTime');
    bestEl = overlay.querySelector('#kvBest');
    msgEl = overlay.querySelector('#kvMsg');
    overlay.querySelector('#kvClose').addEventListener('click', close);
    overlay.querySelector('#kvAgain').addEventListener('click', start);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp);
  }

  function mount(el) {
    host = el;
    injectStyle();
    host.innerHTML = '';
    var card = document.createElement('div');
    card.className = 'game-card';
    var t = document.createElement('div'); t.className = 'game-card-title'; t.textContent = API.title;
    var h = document.createElement('div'); h.className = 'game-card-hint'; h.textContent = API.hint;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'game-card-start';
    btn.textContent = '拔剑';
    btn.addEventListener('click', open);
    card.appendChild(t); card.appendChild(h); card.appendChild(btn);
    host.appendChild(card);
    ensureOverlay();
    return card;
  }

  function close() {
    if (Date.now() - openedAt < CLOSE_GUARD_MS) return;
    running = false; raf = 0;
    if (overlay) {
      overlay.classList.remove('on');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function open() {
    ensureOverlay();
    overlay.classList.add('on');
    overlay.setAttribute('aria-hidden', 'false');
    openedAt = Date.now();
    start();
  }

  var API = {
    title: '碎冰',
    hint: '冰棱会从冰面上窜出来 —— 按住、拖着横扫过去，把它们一起斩碎。一刀扫中的越多，这一剑越响。',
    mount: mount,
    open: open
  };
  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.kevin = API;
})(window);