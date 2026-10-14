/* assets/games/su.js — 苏（Ⅶ · 天慧）的小游戏《数珠》
 *
 * 玩法：念珠串成一圈，**先亮给你看**（一颗一颗、有先后），然后你照着顺序点回来。
 *       每过一轮序列长一颗；点错就停，按「再来」从头。**没有时间压力**。
 *
 * 为什么是这个玩法：全站六个游戏（樱=斩 · 科斯魔=守灯 · 梅比乌斯=躲 · 格蕾修=上色 ·
 *   华=木人桩 · 帕朵=接罐头）都是**动作/反应**类。他是「觉者」，配一个**记忆**类的正好不撞，
 *   而且「念珠」就是他的母题（页面上有 `☸`、觉者之言、菩提叶）。
 *
 * ⚠ 契约（spec §4.5）：挂 `window.ElysiaGames.<id>`，带 `title` / `hint` / `mount(host)`；
 *   `mount` 画出的卡里 `.game-card-title` 与 `.game-card-hint` 的文字必须与 `title`/`hint` **逐字一致**
 *   （`check_explore.py` 的 `check_game_card_matches_module` 会比对）。
 * ⚠ 退出键要 **400ms 保护期**（`CLOSE_GUARD_MS`）—— 断言 (25) 验这个。
 * ⚠ 画面**从第一帧就要动**（灯尘 + 呼吸光晕）—— 断言 (23) 量「点开始后两次采样必须不同」。
 * ⚠ 减动偏好下照常能玩：全程 rAF，不依赖 CSS 动画（断言 (24) 的减动那一档）。
 * ⚠ 画布**不许拉扁**：属性 340×360，CSS 只给 `width`、`height:auto` 等比缩。
 */
(function (global) {
  'use strict';

  var CLOSE_GUARD_MS = 400;
  var openedAt = 0;
  var CW = 340, CH = 360;
  var BEADS = 6;
  var R = 116, BR = 26;
  var SHOW_MS = 520, GAP_MS = 190;

  var STYLE = ".game-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:14px;padding:1.6rem 1.4rem;text-align:center;max-width:26rem;margin:0 auto}\n.game-card-title{font-size:1.15rem;letter-spacing:.14em;color:var(--lamp);margin-bottom:.5rem;font-weight:400}\n.game-card-hint{font-size:.82rem;line-height:1.9;color:var(--text-dim);margin-bottom:1.1rem;font-weight:300}\n.game-card-start{appearance:none;cursor:pointer;font:inherit;font-size:.85rem;letter-spacing:.14em;color:var(--bg-deep);background:var(--lamp);border:none;border-radius:999px;padding:.62rem 1.9rem;min-height:44px;transition:transform .25s ease,box-shadow .25s ease}\n.game-card-start:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(232,201,138,.28)}\n.su-stage{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;background:rgba(5,11,16,.94);backdrop-filter:blur(6px);padding:1.2rem}\n.su-stage.on{display:flex}\n.su-box{position:relative;display:flex;flex-direction:column;align-items:center;gap:.7rem;width:100%;max-width:460px}\n.su-col{display:flex;flex-direction:column;align-items:center;gap:.6rem}\n.su-head{font-size:.82rem;letter-spacing:.16em;color:var(--text-dim);font-weight:300}\n.su-head b{color:var(--lamp);font-weight:400;font-size:1rem}\n.su-msg{font-size:.9rem;letter-spacing:.1em;color:var(--moon);min-height:1.6em;font-weight:300;text-align:center}\n.su-canvas{width:min(340px,84vw);height:auto;aspect-ratio:340/360;border-radius:16px;background:radial-gradient(circle at 50% 45%,rgba(45,212,191,.10),transparent 62%);border:1px solid var(--glass-border);touch-action:none;display:block}\n.su-row{display:flex;gap:.8rem;justify-content:center;flex-wrap:wrap}\n.su-btn{appearance:none;cursor:pointer;font:inherit;font-size:.82rem;letter-spacing:.12em;min-height:44px;color:var(--text);background:transparent;border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.4rem}\n.su-btn:hover{border-color:var(--lamp);color:var(--lamp)}\n/* ⚠ 收起固定在**右上角** —— 断言 (25) 要求退出键离操作区 ≥100px，固定在角落最稳 */\n.su-close{position:fixed;top:calc(1rem + env(safe-area-inset-top));right:1rem;appearance:none;cursor:pointer;font:inherit;font-size:.78rem;letter-spacing:.12em;color:var(--text-dim);background:rgba(5,11,16,.6);border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.1rem;min-height:40px}\n.su-close:hover{color:var(--lamp);border-color:var(--lamp)}\n/* ⚠ 横屏塞不下（遮罩是 fixed，没有滚动条）—— 改左右两栏、画布按 vh 缩 */\n@media (max-height:520px) and (orientation:landscape){\n  .su-box{flex-direction:row;align-items:center;justify-content:center;max-width:760px;gap:1.4rem}\n  .su-canvas{width:auto;height:min(70vh,300px)}\n}";

  function injectStyle() {
    if (document.getElementById('su-game-style')) return;
    var s = document.createElement('style');
    s.id = 'su-game-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  var host = null, overlay = null, canvas = null, ctx = null;
  var roundEl = null, bestEl = null, msgEl = null;
  var running = false, raf = 0;
  var seq = [], step = 0, round = 1, best = 0, phase = 'idle';
  var lit = -1, nextAt = 0, dust = [], flash = 0, ringPhase = 0;

  try { best = parseInt(localStorage.getItem('elysia:su:best') || '0', 10) || 0; } catch (e) { best = 0; }

  function beadPos(i) {
    var a = -Math.PI / 2 + i * (Math.PI * 2 / BEADS);
    return { x: CW / 2 + Math.cos(a) * R, y: CH / 2 + Math.sin(a) * R };
  }

  function makeDust() {
    dust = [];
    for (var i = 0; i < 18; i++) {
      dust.push({ x: Math.random() * CW, y: Math.random() * CH, r: 0.7 + Math.random() * 1.6,
                  vy: -0.08 - Math.random() * 0.22, vx: (Math.random() - 0.5) * 0.14,
                  a: 0.10 + Math.random() * 0.35 });
    }
  }

  function setMsg(t) { if (msgEl) msgEl.textContent = t; }

  function newSequence() {
    seq = []; step = 0;
    for (var i = 0; i < round + 1; i++) seq.push(Math.floor(Math.random() * BEADS));
    phase = 'show';
    nextAt = performance.now() + 240;
    lit = -1;
    setMsg('看好了……');
  }

  function start() {
    round = 1;
    if (roundEl) roundEl.textContent = '1';
    if (bestEl) bestEl.textContent = String(best);
    makeDust();
    running = true;
    newSequence();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      d.x += d.vx; d.y += d.vy;
      if (d.y < -4) { d.y = CH + 4; d.x = Math.random() * CW; }
      if (d.x < -4) d.x = CW + 4;
      if (d.x > CW + 4) d.x = -4;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232,201,138,' + d.a.toFixed(3) + ')';
      ctx.fill();
    }
    ringPhase += 0.02;
    var pr = 26 + Math.sin(ringPhase) * 6;
    var g = ctx.createRadialGradient(CW / 2, CH / 2, 2, CW / 2, CH / 2, pr + 26);
    g.addColorStop(0, 'rgba(45,212,191,' + (0.18 + Math.sin(ringPhase) * 0.05).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(45,212,191,0)');
    ctx.beginPath();
    ctx.arc(CW / 2, CH / 2, pr + 26, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    for (var b = 0; b < BEADS; b++) {
      var p = beadPos(b);
      var on = (b === lit);
      var pulse = 1 + Math.sin(ringPhase * 1.6 + b) * 0.03;
      ctx.beginPath();
      ctx.arc(p.x, p.y, BR * pulse, 0, Math.PI * 2);
      ctx.fillStyle = on ? 'rgba(232,201,138,.92)' : 'rgba(45,212,191,.13)';
      ctx.fill();
      ctx.lineWidth = on ? 3 : 1.5;
      ctx.strokeStyle = on ? 'rgba(253,246,227,.95)' : 'rgba(45,212,191,.42)';
      ctx.stroke();
      if (on) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, BR + 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232,201,138,.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (flash > 0) {
      ctx.fillStyle = 'rgba(253,246,227,' + (flash * 0.22).toFixed(3) + ')';
      ctx.fillRect(0, 0, CW, CH);
      flash = Math.max(0, flash - 0.06);
    }
  }

  function loop() {
    if (!running) { raf = 0; return; }
    var now = performance.now();
    if (phase === 'show' && now >= nextAt) {
      if (lit >= 0) {
        lit = -1;
        step++;
        if (step >= seq.length) { phase = 'turn'; step = 0; setMsg('该你了 —— 一共 ' + seq.length + ' 颗'); nextAt = now + 420; }
        else nextAt = now + GAP_MS;
      } else {
        lit = seq[step];
        nextAt = now + SHOW_MS;
      }
    }
    draw();
    raf = requestAnimationFrame(loop);
  }

  function hitBead(x, y) {
    for (var i = 0; i < BEADS; i++) {
      var p = beadPos(i);
      var dx = x - p.x, dy = y - p.y;
      if (dx * dx + dy * dy <= (BR + 14) * (BR + 14)) return i;
    }
    return -1;
  }

  function toCanvas(e) {
    var r = canvas.getBoundingClientRect();
    var t = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (CW / r.width), y: (t.clientY - r.top) * (CH / r.height) };
  }

  function onTap(e) {
    if (!running || phase !== 'turn') return;
    if (e.cancelable) e.preventDefault();
    var i = hitBead(toCanvas(e).x, toCanvas(e).y);
    if (i < 0) return;
    if (i === seq[step]) {
      lit = i; flash = 0.6;
      setTimeout(function () { if (phase === 'turn') lit = -1; }, 170);
      step++;
      if (step >= seq.length) {
        phase = 'idle';
        round++;
        if (roundEl) roundEl.textContent = String(round);
        if (round - 1 > best) {
          best = round - 1;
          if (bestEl) bestEl.textContent = String(best);
          try { localStorage.setItem('elysia:su:best', String(best)); } catch (err) {}
        }
        setMsg('对了。下一轮 —— ' + (round + 1) + ' 颗……');
        setTimeout(function () { if (running) newSequence(); }, 760);
      }
    } else {
      phase = 'idle';
      lit = i; flash = 1;
      setMsg('断了。这一轮是 ' + (round + 1) + ' 颗 —— 按「再来」接着数。');
      running = false;
      draw();
      raf = 0;
    }
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
    btn.textContent = '拈一颗';
    btn.addEventListener('click', open);
    card.appendChild(t); card.appendChild(h); card.appendChild(btn);
    host.appendChild(card);
    ensureOverlay();          // ⚠ 见上面那条注释：遮罩要在这个时候就存在
    return card;
  }

  function close() {
    if (Date.now() - openedAt < CLOSE_GUARD_MS) return;
    running = false; raf = 0; phase = 'idle';
    if (overlay) {
      overlay.classList.remove('on');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  /* ⚠ 遮罩**在 mount() 的时候就建好**（默认 `aria-hidden`、不显示）——
     断言 ① 会先看「它存不存在、是不是关着的」，等到点「开始」才建就来不及了。 */
  function ensureOverlay() {
    if (overlay) return;
    injectStyle();
    injectStyle();
    overlay = document.createElement('div');
    overlay.className = 'su-stage';
    overlay.id = 'suBeadOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="su-box">',
      '  <button class="su-close" id="suClose" type="button">收起</button>',
      '  <div class="su-col">',
      '    <div class="su-head">第 <b id="suRound">1</b> 轮 · 最长 <b id="suBest">0</b> 珠</div>',
      '    <div class="su-msg" id="suMsg">看好了……</div>',
      '    <canvas class="su-canvas" id="suCanvas" width="340" height="360" aria-label="数珠：念珠画面" role="img"></canvas>',
      '    <div class="su-row"><button class="su-btn" id="suAgain" type="button">再来</button></div>',
      '  </div>',
      '</div>',
    ].join('\n');
    document.body.appendChild(overlay);
    canvas = overlay.querySelector('#suCanvas');
    ctx = canvas.getContext('2d');
    roundEl = overlay.querySelector('#suRound');
    bestEl = overlay.querySelector('#suBest');
    msgEl = overlay.querySelector('#suMsg');
    overlay.querySelector('#suClose').addEventListener('click', close);
    overlay.querySelector('#suAgain').addEventListener('click', start);
    canvas.addEventListener('pointerdown', onTap);
    canvas.addEventListener('touchstart', onTap, { passive: false });
  }

  function open() {
    ensureOverlay();
    overlay.classList.add('on');
    overlay.setAttribute('aria-hidden', 'false');
    openedAt = Date.now();     // ⚠ 保护期起点（见 close()）
    start();
  }

  var API = {
    title: '数珠',
    hint: '念珠会先亮给你看 —— 记住顺序，一颗一颗照原样点回来。没有时间限制，点错就从这一轮重来。',
    mount: mount,
    open: open
  };
  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.su = API;
})(window);