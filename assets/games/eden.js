/* assets/games/eden.js — 伊甸（Ⅳ · 黄金）：《和声》
 *
 * 判据：这个玩法 ＝ 她的哪一句？——「艺术仍然能够存续下来，鼓舞活着的人们，带来希望」；
 * 她唱，你跟着。连击越高，和声越亮。
 *
 * 2026-10-15 重做：原版是「拖着声部跟一条会飘的线」，玩起来太静、手机上不抓人 ⇒
 * 改成**下落式节奏音游**（三轨、判定线、连击 / 破音）；她那一句和弦（需求方批的破例配音）
 * 落在**连击节点**上（每 8 连一次，且 3 秒内不重复响）—— 不刷屏、零音频文件。
 *
 * 手机优先：画布 min(100vw-1.6rem,420px) + 340/480；DPR 限 2；背景与轨道**预渲染到离屏 canvas**；
 * 遮罩不用 backdrop-filter；三轨每轨宽 ≈ 111 逻辑 px（够 44px 触控底线）；
 * ⚠ 这一款从「按住拖」变成**点触**⇒ GAMES 登记里**去掉了 swipe**（退出键改按 100px 口径量）。
 *
 * ⚠ 只读测试句柄 `__state()`：让验收脚本能真打（读到音符位置后按点判定）。
 */
(function (global) {
  'use strict';
  var GUARD = 400, openedAt = 0;
  var VW = 340, VH = 480;
  var LANES = 3, LANE_W = VW / LANES;
  var LINE = 400;
  var WIN = 46;
  var DURATION = 45, MISS_MAX = 5;
  var NOTES = ['♩', '♪', '♫'];
  var STYLE = ".game-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:14px;padding:1.6rem 1.4rem;text-align:center;max-width:26rem;margin:0 auto}\n.game-card-title{font-size:1.15rem;letter-spacing:.14em;color:#ffd166;margin-bottom:.5rem;font-weight:400}\n.game-card-hint{font-size:.82rem;line-height:1.9;color:var(--text-dim);margin-bottom:1.1rem;font-weight:300}\n.game-card-start{appearance:none;cursor:pointer;font:inherit;font-size:.85rem;letter-spacing:.14em;color:#0a0608;background:#ffd166;border:none;border-radius:999px;padding:.66rem 2rem;min-height:48px}\n.eden-stage{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;background:rgba(10,6,8,.97);padding:max(.6rem,env(safe-area-inset-top)) .8rem max(.6rem,env(safe-area-inset-bottom))}\n.eden-stage.on{display:flex}\n.eden-box{position:relative;display:flex;flex-direction:column;align-items:center;gap:.45rem;width:100%;max-width:460px}\n.eden-head{display:flex;gap:.7rem;flex-wrap:nowrap;justify-content:center;font-size:.78rem;letter-spacing:.06em;color:var(--text-dim);font-weight:300;white-space:nowrap}\n.eden-head b{color:#ffd166;font-weight:400;font-size:.92rem}\n.eden-msg{font-size:.84rem;letter-spacing:.04em;color:#ffe9b8;min-height:1.5em;font-weight:300;text-align:center;max-width:22rem}\n.eden-canvas{width:min(100vw - 1.6rem,420px);height:auto;aspect-ratio:340/480;border-radius:14px;box-shadow:0 0 0 1px var(--glass-border);touch-action:manipulation;display:block;user-select:none}\n.eden-btn{appearance:none;cursor:pointer;font:inherit;font-size:.82rem;letter-spacing:.12em;min-height:44px;color:var(--text);background:transparent;border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.5rem}\n.eden-close{position:fixed;top:calc(.8rem + env(safe-area-inset-top));right:.8rem;appearance:none;cursor:pointer;font:inherit;font-size:.78rem;letter-spacing:.12em;color:var(--text-dim);background:rgba(10,6,8,.7);border:1px solid var(--glass-border2);border-radius:999px;padding:.55rem 1.15rem;min-height:44px}\n@media (max-height:560px) and (orientation:landscape){\n  .eden-box{flex-direction:row;align-items:center;justify-content:center;max-width:820px;gap:1.2rem}\n  .eden-canvas{width:auto;height:min(78vh,420px)}\n}";
  function injectStyle() {
    if (document.getElementById('eden-game-style')) return;
    var st = document.createElement('style');
    st.id = 'eden-game-style'; st.textContent = STYLE; document.head.appendChild(st);
  }
  var host = null, overlay = null, canvas = null, ctx = null, bg = null;
  var scoreEl = null, comboEl = null, missEl = null, bestEl = null, msgEl = null, timeEl = null;
  var running = false, raf = 0, last = 0, t = 0;
  var notes = [], score = 0, combo = 0, best = 0, misses = 0, spawnT = 0, over = false;
  var hits = [], motes = [], audioCtx = null, lastChord = 0, laneGlow = [0, 0, 0];
  try { best = parseInt(localStorage.getItem('elysia:eden:best') || '0', 10) || 0; } catch (e) { best = 0; }
  function setMsg(s) { if (msgEl) msgEl.textContent = s; }
  function setHud() {
    if (scoreEl) scoreEl.textContent = String(Math.round(score));
    if (comboEl) comboEl.textContent = String(combo);
    if (missEl) missEl.textContent = misses + ' / ' + MISS_MAX;
    if (bestEl) bestEl.textContent = String(best);
    if (timeEl) timeEl.textContent = String(Math.max(0, Math.ceil(DURATION - t)));
  }
  function playChord() {
    try {
      if (!audioCtx) {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t0 = audioCtx.currentTime;
      [1, 5 / 4, 3 / 2].forEach(function (ratio, i) {
        var osc = audioCtx.createOscillator(), g = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 261.63 * ratio;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.05 - i * 0.011, t0 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.9);
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(t0 + i * 0.02); osc.stop(t0 + 2.0);
      });
    } catch (e) {}
  }
  function beat() { var b = 1.05 - Math.min(0.45, t * 0.012); return b; }
  function reset() {
    notes = []; hits = []; motes = [];
    score = 0; combo = 0; misses = 0; t = 0; spawnT = 0; over = false; lastChord = 0;
    laneGlow = [0, 0, 0];
    for (var i = 0; i < 22; i++) motes.push({ x: Math.random() * VW, y: Math.random() * VH, r: .6 + Math.random() * 1.4, vy: -.06 - Math.random() * .18, a: .08 + Math.random() * .28 });
    setHud(); setMsg('音符落到线上时，点它所在的那一轨。连击越高，和声越亮。');
    running = true; last = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function spawn() {
    notes.push({ lane: Math.floor(Math.random() * LANES), y: -24, hit: false, sym: NOTES[Math.floor(Math.random() * NOTES.length)] });
  }
  function tap(lane) {
    if (!running || over) return;
    laneGlow[lane] = 1;
    var bi = -1, bd = 1e9;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.lane !== lane || n.hit) continue;
      var d = Math.abs(n.y - LINE);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi < 0 || bd > WIN) { combo = 0; setHud(); return; }
    notes[bi].hit = true;
    combo++;
    score += 10 + Math.min(20, combo);
    hits.push({ x: (lane + .5) * LANE_W, y: LINE, life: 1, text: combo % 10 === 0 ? '和声 ×' + combo : '' });
    if (combo > 0 && combo % 8 === 0 && t - lastChord > 3) { lastChord = t; playChord(); }
    setHud();
  }
  function finish(kind) {
    running = false; over = true;
    var n = Math.round(score);
    if (n > best) { best = n; try { localStorage.setItem('elysia:eden:best', String(best)); } catch (e) {} }
    setMsg((kind === 'miss' ? '歌声散了。' : '这一曲，唱完了。') + '　　你留下了 ' + n + ' 分和声。');
    setHud(); draw(); raf = 0;
  }
  function makeBg(w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    var lin = g.createLinearGradient(0, 0, 0, h);
    lin.addColorStop(0, '#140b0d'); lin.addColorStop(.55, '#0f0809'); lin.addColorStop(1, '#0a0608');
    g.fillStyle = lin; g.fillRect(0, 0, w, h);
    var rad = g.createRadialGradient(w / 2, h * .78, 8, w / 2, h * .78, w * .85);
    rad.addColorStop(0, 'rgba(255,209,102,.10)'); rad.addColorStop(1, 'rgba(10,6,8,0)');
    g.fillStyle = rad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,209,102,.10)'; g.lineWidth = 1;
    for (var i = 1; i < LANES; i++) { g.beginPath(); g.moveTo(w * i / LANES, 0); g.lineTo(w * i / LANES, h); g.stroke(); }
    g.strokeStyle = 'rgba(255,209,102,.75)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, h * (LINE / VH)); g.lineTo(w, h * (LINE / VH)); g.stroke();
    return c;
  }
  function draw() {
    var s = canvas.width / VW, i;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, VW, VH);
    if (bg) ctx.drawImage(bg, 0, 0, VW, VH);
    for (i = 0; i < motes.length; i++) {
      var m = motes[i];
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.284);
      ctx.fillStyle = 'rgba(255,233,184,' + m.a.toFixed(3) + ')'; ctx.fill();
    }
    for (i = 0; i < LANES; i++) {
      if (laneGlow[i] > 0) {
        ctx.fillStyle = 'rgba(255,209,102,' + (laneGlow[i] * .16).toFixed(3) + ')';
        ctx.fillRect(i * LANE_W, 0, LANE_W, VH);
        laneGlow[i] -= .06;
      }
    }
    if (running || over) {
      var col = 'rgba(255,209,102,' + (0.85 + Math.sin(t * 3) * 0.1).toFixed(3) + ')';
      ctx.strokeStyle = col; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(0, LINE); ctx.lineTo(VW, LINE); ctx.stroke();
    }
    for (i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.hit) continue;
      var near = Math.abs(n.y - LINE) < WIN;
      ctx.beginPath(); ctx.arc((n.lane + .5) * LANE_W, n.y, near ? 15 : 12, 0, 6.284);
      ctx.fillStyle = near ? 'rgba(255,244,214,.98)' : 'rgba(255,209,102,.9)'; ctx.fill();
      ctx.font = '14px -apple-system,PingFang SC,Microsoft YaHei,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(26,14,6,.9)';
      ctx.fillText(n.sym, (n.lane + .5) * LANE_W, n.y + 5);
    }
    for (i = hits.length - 1; i >= 0; i--) {
      var f = hits[i]; f.life -= .045;
      if (f.life <= 0) { hits.splice(i, 1); continue; }
      ctx.beginPath(); ctx.arc(f.x, f.y, 18 * (1.4 - f.life), 0, 6.284);
      ctx.strokeStyle = 'rgba(255,244,214,' + (f.life * .8).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.stroke();
      if (f.text) {
        ctx.font = '13px -apple-system,PingFang SC,Microsoft YaHei,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,244,214,' + f.life.toFixed(3) + ')';
        ctx.fillText(f.text, f.x, f.y - 26 - (1 - f.life) * 14);
      }
    }
    ctx.fillStyle = 'rgba(255,209,102,.2)'; ctx.fillRect(14, VH - 12, VW - 28, 2);
    ctx.fillStyle = 'rgba(255,209,102,.8)'; ctx.fillRect(14, VH - 12, (VW - 28) * Math.min(1, t / DURATION), 2);
  }
  function loop() {
    if (!running) { raf = 0; return; }
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt; spawnT += dt;
    if (spawnT >= beat()) { spawnT = 0; spawn(); if (t > 12 && Math.random() < .35) spawn(); }
    var speed = 150 + Math.min(120, t * 3);
    var i;
    for (i = notes.length - 1; i >= 0; i--) {
      var n = notes[i];
      if (n.hit) { notes.splice(i, 1); continue; }
      n.y += speed * dt;
      if (n.y > LINE + WIN + 26) {
        notes.splice(i, 1); misses++; combo = 0; setHud();
        if (misses >= MISS_MAX) { finish('miss'); return; }
        setMsg('破音了 —— 跟她走。');
      }
    }
    for (i = 0; i < motes.length; i++) { var m = motes[i]; m.y += m.vy; if (m.y < -4) { m.y = VH + 4; m.x = Math.random() * VW; } }
    setHud();
    if (t >= DURATION) { finish('end'); return; }
    draw();
    raf = requestAnimationFrame(loop);
  }
  function laneOf(e) {
    var r = canvas.getBoundingClientRect();
    var p = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e;
    var x = (p.clientX - r.left) * (VW / r.width);
    return Math.max(0, Math.min(LANES - 1, Math.floor(x / LANE_W)));
  }
  function onDown(e) { if (!running || over) return; if (e.cancelable) e.preventDefault(); tap(laneOf(e)); }
  function fit() {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || VW;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr * (VH / VW));
    bg = makeBg(canvas.width, canvas.height);
    draw();
  }
  function ensureOverlay() {
    if (overlay) return;
    injectStyle();
    overlay = document.createElement('div');
    overlay.className = 'eden-stage';
    overlay.id = 'edenGameOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="eden-box">',
      '  <button class="eden-close" id="edenClose" type="button">收起</button>',
      '  <div class="eden-head">和声 <b id="edenScore">0</b> · 连击 <b id="edenCombo">0</b> · 破音 <b id="edenMiss">0 / 5</b> · <b id="edenTime">45</b> 秒 · 最佳 <b id="edenBest">0</b></div>',
      '  <div class="eden-msg" id="edenMsg">音符落到线上时点它那一轨。</div>',
      '  <canvas class="eden-canvas" id="edenCanvas" width="340" height="480" aria-label="和声：下落式节奏" role="img"></canvas>',
      '  <button class="eden-btn" id="edenAgain" type="button">再来一次</button>',
      '</div>',
    ].join('\n');
    document.body.appendChild(overlay);
    canvas = overlay.querySelector('#edenCanvas');
    ctx = canvas.getContext('2d');
    scoreEl = overlay.querySelector('#edenScore');
    comboEl = overlay.querySelector('#edenCombo');
    missEl = overlay.querySelector('#edenMiss');
    timeEl = overlay.querySelector('#edenTime');
    bestEl = overlay.querySelector('#edenBest');
    msgEl = overlay.querySelector('#edenMsg');
    overlay.querySelector('#edenClose').addEventListener('click', close);
    overlay.querySelector('#edenAgain').addEventListener('click', function () { reset(); });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    global.addEventListener('resize', function () { if (overlay && overlay.classList.contains('on')) fit(); });
  }
  function mount(el) {
    host = el; injectStyle(); host.innerHTML = '';
    var card = document.createElement('div'); card.className = 'game-card';
    var a = document.createElement('div'); a.className = 'game-card-title'; a.textContent = API.title;
    var b = document.createElement('div'); b.className = 'game-card-hint'; b.textContent = API.hint;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'game-card-start'; btn.textContent = '跟着唱';
    btn.addEventListener('click', open);
    card.appendChild(a); card.appendChild(b); card.appendChild(btn);
    host.appendChild(card); ensureOverlay(); return card;
  }
  function close() {
    if (Date.now() - openedAt < GUARD) return;
    running = false; raf = 0;
    if (overlay) { overlay.classList.remove('on'); overlay.setAttribute('aria-hidden', 'true'); }
  }
  function open() {
    ensureOverlay();
    overlay.classList.add('on'); overlay.setAttribute('aria-hidden', 'false');
    openedAt = Date.now(); fit(); reset();
  }
  var API = {
    title: '和声',
    hint: '她的音符从上面落下来 —— 落到那条金线上时，点它所在的那一轨。连击越高和声越亮，破音 5 次这一曲就散了。',
    mount: mount, open: open,
    __state: function () {
      return { score: Math.round(score), combo: combo, misses: misses, t: Math.round(t * 10) / 10, over: over,
        line: LINE, win: WIN, lanes: LANES,
        notes: notes.map(function (n) { return { lane: n.lane, y: Math.round(n.y) }; }),
        css: canvas ? Math.round(canvas.getBoundingClientRect().width) + 'x' + Math.round(canvas.getBoundingClientRect().height) : null };
    }
  };
  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.eden = API;
})(window);