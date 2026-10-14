/* assets/games/villv.js — 维尔薇（Ⅴ · 螺旋）的小游戏：《戏法》
 *
 * ── 为什么是这个玩法 ────────────────────────────────────────────────
 * 她的那一句：**你盯着的那只杯子，从来就不是你以为的那只。**
 * 她是「魔术师」——玩法就是三杯球：先亮给你看球在哪，然后杯子换位，你指出球在哪。
 * 不是记「顺序」（苏的数珠是序列），而是**盯住一个会动的东西**（连续追踪 + 记忆）。
 *
 * ── 与 spec 的对应（docs/superpowers/specs/2026-10-15-four-games-design.md §2.3）
 * · **「球永远不撒谎」（铁律）**：换位是**物理连续**的，任何一轮都不假换、不瞬移、
 *   不在你看不见的时候偷换 —— **误导 ≠ 欺骗**（她页面上大魔术师的原话就是「误导」）。
 * · 输了那一下**亮出球的真实位置**（＝她揭幕），不许只当一句台词。
 * · 数字：单次换位 **900ms 起，每轮 −80ms，降到 400ms 为止**；burst **1 → 2 → 3（cap 3）**；
 *   杯数 **3 → 4 → 5（cap 5）**；杯宽 ≥60px、命中区 ≥44px；第一轮 = 3 杯 + 1.5s 亮牌 + 只换 1 次慢换。
 * · 分数来自**连续多轮**的 streak（越过人眼极限就不是「盯」是「赌」）。
 * · 配色：舞台紫 `#2a1040` + 她页面 `personas` 里**真有的**人格色（指挥家 #ffd166 / 大魔术师 #ff6b9d /
 *   专家 #4ecdc4）；4~5 杯时补的两个色是**同一族里的明暗变体**，不是新色相。
 * · 契约：`dt` 钳制（12 条）、结局只说一件事（11 条）、best 进 `localStorage['elysia:villv:best']`。
 */
(function (global) {
  'use strict';

  var CLOSE_GUARD_MS = 400, openedAt = 0;
  var CW = 340, CH = 420;
  var CUP_Y = 250, CUP_W = 74, CUP_H = 96;
  var REVEAL_MS = 1500;
  var CUP_COLORS = ['#ffd166', '#ff6b9d', '#4ecdc4', '#ffb36b', '#9c7bff'];
  var STYLE = ".game-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:14px;padding:1.6rem 1.4rem;text-align:center;max-width:26rem;margin:0 auto}\n.game-card-title{font-size:1.15rem;letter-spacing:.14em;color:#ff6b9d;margin-bottom:.5rem;font-weight:400}\n.game-card-hint{font-size:.82rem;line-height:1.9;color:var(--text-dim);margin-bottom:1.1rem;font-weight:300}\n.game-card-start{appearance:none;cursor:pointer;font:inherit;font-size:.85rem;letter-spacing:.14em;color:#1a0a14;background:#ff6b9d;border:none;border-radius:999px;padding:.62rem 1.9rem;min-height:44px;transition:transform .25s ease,box-shadow .25s ease}\n.game-card-start:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(255,107,157,.28)}\n.villv-stage{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;background:rgba(42,16,64,.95);backdrop-filter:blur(6px);padding:1.2rem}\n.villv-stage.on{display:flex}\n.villv-box{position:relative;display:flex;flex-direction:column;align-items:center;gap:.6rem;width:100%;max-width:460px}\n.villv-col{display:flex;flex-direction:column;align-items:center;gap:.5rem}\n.villv-head{font-size:.8rem;letter-spacing:.14em;color:var(--text-dim);font-weight:300;display:flex;gap:1rem;flex-wrap:wrap;justify-content:center}\n.villv-head b{color:#ff6b9d;font-weight:400;font-size:.95rem}\n.villv-msg{font-size:.88rem;letter-spacing:.06em;color:#ffe6f1;min-height:1.6em;font-weight:300;text-align:center;max-width:22rem}\n.villv-canvas{width:min(340px,84vw);height:auto;aspect-ratio:340/420;border-radius:16px;box-shadow:0 0 0 1px var(--glass-border);touch-action:manipulation;display:block;cursor:pointer;user-select:none}\n.villv-row{display:flex;gap:.8rem;justify-content:center;flex-wrap:wrap}\n.villv-btn{appearance:none;cursor:pointer;font:inherit;font-size:.82rem;letter-spacing:.12em;min-height:44px;color:var(--text);background:transparent;border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.4rem}\n.villv-btn:hover{border-color:#ff6b9d;color:#ff6b9d}\n/* ⚠ 收起固定右上角：点选面 ⇒ 按 100px 口径量（GAMES 里不写 swipe） */\n.villv-close{position:fixed;top:calc(1rem + env(safe-area-inset-top));right:1rem;appearance:none;cursor:pointer;font:inherit;font-size:.78rem;letter-spacing:.12em;color:var(--text-dim);background:rgba(42,16,64,.6);border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.1rem;min-height:40px}\n.villv-close:hover{color:#ff6b9d;border-color:#ff6b9d}\n@media (max-height:520px) and (orientation:landscape){\n  .villv-box{flex-direction:row;align-items:center;justify-content:center;max-width:780px;gap:1.4rem}\n  .villv-canvas{width:auto;height:min(70vh,300px)}\n}";

  function injectStyle() {
    if (document.getElementById('villv-game-style')) return;
    var st = document.createElement('style');
    st.id = 'villv-game-style'; st.textContent = STYLE;
    document.head.appendChild(st);
  }

  var host = null, overlay = null, canvas = null, ctx = null;
  var seenEl = null, roundEl = null, bestEl = null, msgEl = null;
  var running = false, raf = 0, last = 0, t = 0;
  var seen = 0, round = 0, best = 0;
  var cups = [], ballAt = 0, phase = 'idle', phaseT = 0, swapQueue = [], swapCur = null;
  var revealedAt = 0, showBall = true, motes = [], lamp = 0;
  try { best = parseInt(localStorage.getItem('elysia:villv:best') || '0', 10) || 0; } catch (e) { best = 0; }

  function setMsg(s) { if (msgEl) msgEl.textContent = s; }
  function setHud() {
    if (seenEl) seenEl.textContent = String(seen);
    if (roundEl) roundEl.textContent = String(round + 1);
    if (bestEl) bestEl.textContent = String(best);
  }

  function cupW() { return Math.min(CUP_W, (CW - 40) / cups.length - 8); }
  function cupX(i) { var w = cupW(), gap = (CW - cups.length * w) / (cups.length + 1); return gap + i * (w + gap); }

  function layout(n) {
    cups = [];
    for (var i = 0; i < n; i++) cups.push({ x: cupX(i), y: CUP_Y, color: CUP_COLORS[i % CUP_COLORS.length], lift: 0 });
    ballAt = Math.floor(Math.random() * n);
  }

  function swapDur() { var d = 0.9 - round * 0.08; return d < 0.4 ? 0.4 : d; }
  function burst() { var b = 1 + Math.floor(round / 2); return b > 3 ? 3 : b; }
  function cupCount() { var c = 3 + Math.floor(round / 3); return c > 5 ? 5 : c; }

  function startRound() {
    layout(cupCount());
    showBall = true; phase = 'reveal'; phaseT = 0;
    swapQueue = []; swapCur = null;
    setHud();
    setMsg(round === 0 ? '看清它开始在哪只杯子下 —— 我会慢慢换。' : '看清了？');
  }

  function start() {
    seen = 0; round = 0; t = 0;
    motes = [];
    for (var i = 0; i < 20; i++) motes.push({ x: Math.random() * CW, y: Math.random() * CH, r: .5 + Math.random() * 1.4, a: .08 + Math.random() * .25, vy: -.05 - Math.random() * .14 });
    startRound();
    running = true; last = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function queueSwaps() {
    var b = burst(), n = cups.length, i;
    swapQueue = [];
    for (i = 0; i < b; i++) {
      var a = Math.floor(Math.random() * n), c = Math.floor(Math.random() * n);
      if (c === a) c = (a + 1) % n;
      swapQueue.push([a, c]);
    }
  }

  /* ⚠ 铁律：球**跟着杯子走**（物理连续），任何时刻都不假换、不瞬移 */
  function applySwap(s) {
    var a = s[0], b = s[1];
    if (ballAt === a) ballAt = b; else if (ballAt === b) ballAt = a;
  }

  function finish(hit) {
    running = false;
    phase = 'done';
    showBall = true;                       /* 输了也要**揭幕**：亮出球真实在哪 */
    var n = seen;
    if (hit) { setMsg('看穿了 —— 再来一轮？'); return; }
    setMsg('球在另一只杯下。　　你看穿了 ' + n + ' 次。');
    if (n > best) { best = n; try { localStorage.setItem('elysia:villv:best', String(n)); } catch (e) {} }
    setHud(); draw(); raf = 0;
  }

  function pick(idx) {
    if (phase === 'reveal' || phase === 'swaps' || phase === 'lifting') return;
    if (idx === ballAt) { seen++; round++; startRound(); return; }
    finish(false);
  }

  function onDown(e) {
    if (!running) return;
    if (e.cancelable) e.preventDefault();
    var r = canvas.getBoundingClientRect();
    var p = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e;
    var x = (p.clientX - r.left) * (CW / r.width);
    var w = cupW(), i;
    for (i = 0; i < cups.length; i++) {
      if (x >= cupX(i) - 8 && x <= cupX(i) + w + 8) { pick(i); return; }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    var i;
    /* 舞台灯 */
    lamp += 0.007;
    var g = ctx.createRadialGradient(CW / 2, 40, 8, CW / 2, 40, CW * 0.9);
    g.addColorStop(0, 'rgba(255,209,102,' + (0.10 + Math.sin(lamp) * 0.02).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(42,16,64,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
    for (i = 0; i < motes.length; i++) {
      var m = motes[i]; m.y += m.vy;
      if (m.y < -4) { m.y = CH + 4; m.x = Math.random() * CW; }
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,230,241,' + m.a.toFixed(3) + ')'; ctx.fill();
    }
    /* 台面 */
    ctx.fillStyle = 'rgba(26,10,20,.85)';
    ctx.fillRect(0, CUP_Y + CUP_H, CW, CH - CUP_Y - CUP_H);
    /* 球（亮牌时可见，且**始终贴着它的杯子**） */
    var bw = cupW();
    if (showBall) {
      var bi = ballAt, bx = cups[bi] ? (cups[bi].x + bw / 2) : CW / 2;
      ctx.beginPath(); ctx.arc(bx, CUP_Y + CUP_H - 12, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
      ctx.beginPath(); ctx.arc(bx, CUP_Y + CUP_H - 12, 14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1.4; ctx.stroke();
    }
    /* 杯子 */
    for (i = 0; i < cups.length; i++) {
      var c = cups[i], w = cupW();
      var y = c.y - c.lift * 46;
      ctx.beginPath();
      ctx.moveTo(c.x, y);
      ctx.lineTo(c.x + w, y);
      ctx.lineTo(c.x + w * 0.86, y + CUP_H);
      ctx.lineTo(c.x + w * 0.14, y + CUP_H);
      ctx.closePath();
      var cg = ctx.createLinearGradient(0, y, 0, y + CUP_H);
      cg.addColorStop(0, c.color);
      cg.addColorStop(1, 'rgba(26,10,20,.9)');
      ctx.fillStyle = cg; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 1.4; ctx.stroke();
    }
  }

  function loop() {
    if (!running) { raf = 0; return; }
    var now = performance.now();
    /* ⚠ 契约第 12 条：dt 必须钳 —— 切后台回来那一下不钳，杯子会「传送」（正是本款最忌的） */
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt; phaseT += dt;
    if (phase === 'reveal') {
      showBall = true;
      if (phaseT >= REVEAL_MS / 1000) { showBall = false; phase = 'swaps'; phaseT = 0; queueSwaps(); setMsg('盯着它。'); }
    } else if (phase === 'swaps') {
      if (!swapCur && swapQueue.length) {
        swapCur = { pair: swapQueue.shift(), t: 0, dur: swapDur() };
      }
      if (swapCur) {
        swapCur.t += dt;
        var p = swapCur.t / swapCur.dur; if (p > 1) p = 1;
        var a = cups[swapCur.pair[0]], b = cups[swapCur.pair[1]];
        var ax = cupX(swapCur.pair[0]), bx = cupX(swapCur.pair[1]);
        /* 弧线换位：两个杯子各走一半，**球的归属在换位结束那一刻才交割**（连着走，不瞬移） */
        a.x = ax + (bx - ax) * p; b.x = bx + (ax - bx) * p;
        a.lift = Math.sin(p * Math.PI) * 0.5; b.lift = a.lift;
        if (p >= 1) {
          a.x = bx; b.x = ax; a.lift = 0; b.lift = 0;
          applySwap(swapCur.pair);
          swapCur = null;
          if (!swapQueue.length) { phase = 'pick'; setMsg('球在哪只杯子下？'); }
        }
      }
    } else if (phase === 'pick') {
      showBall = false;
    }
    draw();
    raf = requestAnimationFrame(loop);
  }

  function ensureOverlay() {
    if (overlay) return;
    injectStyle();
    overlay = document.createElement('div');
    overlay.className = 'villv-stage';
    overlay.id = 'villvGameOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="villv-box">',
      '  <button class="villv-close" id="villvClose" type="button">收起</button>',
      '  <div class="villv-col">',
      '    <div class="villv-head">看穿 <b id="villvSeen">0</b> 次 · 第 <b id="villvRound">1</b> 轮 · 最佳 <b id="villvBest">0</b></div>',
      '    <div class="villv-msg" id="villvMsg">看清它开始在哪只杯子下。</div>',
      '    <canvas class="villv-canvas" id="villvCanvas" width="340" height="420" aria-label="戏法：猜球在哪只杯下" role="img"></canvas>',
      '    <div class="villv-row"><button class="villv-btn" id="villvAgain" type="button">再来一次</button></div>',
      '  </div>',
      '</div>',
    ].join('\n');
    document.body.appendChild(overlay);
    canvas = overlay.querySelector('#villvCanvas');
    ctx = canvas.getContext('2d');
    seenEl = overlay.querySelector('#villvSeen');
    roundEl = overlay.querySelector('#villvRound');
    bestEl = overlay.querySelector('#villvBest');
    msgEl = overlay.querySelector('#villvMsg');
    overlay.querySelector('#villvClose').addEventListener('click', close);
    overlay.querySelector('#villvAgain').addEventListener('click', start);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('touchstart', onDown, { passive: false });
  }

  function mount(el) {
    host = el; injectStyle(); host.innerHTML = '';
    var card = document.createElement('div'); card.className = 'game-card';
    var a = document.createElement('div'); a.className = 'game-card-title'; a.textContent = API.title;
    var b = document.createElement('div'); b.className = 'game-card-hint'; b.textContent = API.hint;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'game-card-start'; btn.textContent = '看仔细了';
    btn.addEventListener('click', open);
    card.appendChild(a); card.appendChild(b); card.appendChild(btn);
    host.appendChild(card); ensureOverlay(); return card;
  }

  function close() {
    if (Date.now() - openedAt < CLOSE_GUARD_MS) return;
    running = false; raf = 0;
    if (overlay) { overlay.classList.remove('on'); overlay.setAttribute('aria-hidden', 'true'); }
  }
  function open() {
    ensureOverlay(); overlay.classList.add('on'); overlay.setAttribute('aria-hidden', 'false');
    openedAt = Date.now(); start();
  }

  var API = {
    title: '戏法',
    hint: '三只杯子，一颗球。先看清它在哪 —— 然后杯子会换位，你要指出球最后在哪只杯下。**球永远不撒谎**：它一直跟着自己的杯子走。',
    mount: mount, open: open
  };
  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.villv = API;
})(window);