/* assets/games/aponia.js — 阿波尼亚（Ⅲ · 戒律）：《戒律》
 *
 * 判据：这个玩法 ＝ 她的哪一句？—— 戒律不是愿望，是**她替所有人定下的结局**。
 * ⇒ 把「因」牵到「果」上：**松手就算定了**（不可反悔）、**线不许交叉**。
 *
 * 2026-10-15 重做：原版是「牵到死」的一局制，可玩性太薄；这一版改成**关卡制解谜** ——
 * 每关 2~6 对因果，牵满过关；牵出交叉线则**这一关重来**（不可反悔的界线仍是松手那一刻），
 * 连续牵错 3 次才结束整局。两个结局文案都保留。
 *
 * 手机优先：画布 min(100vw-1.6rem,420px) + 340/480；DPR 限 2；背景**预渲染到离屏 canvas**；
 * 遮罩不用 backdrop-filter；命中半径 30（直径 60 ≥ 44px 触控底线）；拖动面 ⇒ 退出键 50px 口径。
 *
 * ⚠ 只读测试句柄 `__state()`：让验收脚本能真解一关（不是「放得下」就算过）。
 */
(function (global) {
  'use strict';
  var GUARD = 400, openedAt = 0;
  var VW = 340, VH = 480;
  var COL_L = 72, COL_R = VW - 72;
  var PAD_T = 96, PAD_B = 420;
  var HIT = 30;                       // 命中半径（逻辑单位 ≈ 屏幕 px，直径 60 ≥ 44px 触控底线）
  var WARN = '#ff7a6b';
  var LEVELS = [2, 3, 3, 4, 4, 5, 5, 6];
  var FAILS_MAX = 3;
  var LINES = ['定了。', '这一条，落下了。', '她的戒律，又定了一桩。', '就这样吧。'];
  var STYLE = ".game-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:14px;padding:1.6rem 1.4rem;text-align:center;max-width:26rem;margin:0 auto}\n.game-card-title{font-size:1.15rem;letter-spacing:.14em;color:#e8c98a;margin-bottom:.5rem;font-weight:400}\n.game-card-hint{font-size:.82rem;line-height:1.9;color:var(--text-dim);margin-bottom:1.1rem;font-weight:300}\n.game-card-start{appearance:none;cursor:pointer;font:inherit;font-size:.85rem;letter-spacing:.14em;color:#08060e;background:#e8c98a;border:none;border-radius:999px;padding:.66rem 2rem;min-height:48px}\n.apo-stage{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;background:rgba(8,6,14,.97);padding:max(.6rem,env(safe-area-inset-top)) .8rem max(.6rem,env(safe-area-inset-bottom))}\n.apo-stage.on{display:flex}\n.apo-box{position:relative;display:flex;flex-direction:column;align-items:center;gap:.45rem;width:100%;max-width:460px}\n.apo-head{display:flex;gap:.7rem;flex-wrap:nowrap;justify-content:center;font-size:.78rem;letter-spacing:.06em;color:var(--text-dim);font-weight:300;white-space:nowrap}\n.apo-head b{color:#e8c98a;font-weight:400;font-size:.92rem}\n.apo-msg{font-size:.84rem;letter-spacing:.04em;color:#efe7ff;min-height:1.5em;font-weight:300;text-align:center;max-width:22rem}\n.apo-canvas{width:min(100vw - 1.6rem,420px);height:auto;aspect-ratio:340/480;border-radius:14px;box-shadow:0 0 0 1px var(--glass-border);touch-action:none;display:block;user-select:none}\n.apo-btn{appearance:none;cursor:pointer;font:inherit;font-size:.82rem;letter-spacing:.12em;min-height:44px;color:var(--text);background:transparent;border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.5rem}\n.apo-close{position:fixed;top:calc(.8rem + env(safe-area-inset-top));right:.8rem;appearance:none;cursor:pointer;font:inherit;font-size:.78rem;letter-spacing:.12em;color:var(--text-dim);background:rgba(8,6,14,.7);border:1px solid var(--glass-border2);border-radius:999px;padding:.55rem 1.15rem;min-height:44px}\n@media (max-height:560px) and (orientation:landscape){\n  .apo-box{flex-direction:row;align-items:center;justify-content:center;max-width:820px;gap:1.2rem}\n  .apo-canvas{width:auto;height:min(78vh,420px)}\n}";
  function injectStyle() {
    if (document.getElementById('apo-game-style')) return;
    var st = document.createElement('style');
    st.id = 'apo-game-style'; st.textContent = STYLE; document.head.appendChild(st);
  }
  var host = null, overlay = null, canvas = null, ctx = null, bg = null;
  var lvEl = null, doneEl = null, bestEl = null, msgEl = null;
  var running = false, raf = 0, last = 0, t = 0;
  var level = 0, locked = 0, fails = 0, best = 0;
  var srcs = [], tgts = [], links = [], drag = null, preview = null;
  var flash = [], motes = [], over = false, pend = 0;
  try { best = parseInt(localStorage.getItem('elysia:aponia:best') || '0', 10) || 0; } catch (e) { best = 0; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function setMsg(s) { if (msgEl) msgEl.textContent = s; }
  function setHud() {
    if (lvEl) lvEl.textContent = String(Math.min(level + 1, LEVELS.length));
    if (doneEl) doneEl.textContent = String(locked);
    if (bestEl) bestEl.textContent = String(best);
  }
  function buildLevel() {
    var n = LEVELS[Math.min(level, LEVELS.length - 1)], i;
    var span = PAD_B - PAD_T, gap = span / (n - 1);
    srcs = []; tgts = []; links = []; drag = null; preview = null; flash = [];
    for (i = 0; i < n; i++) {
      srcs.push({ x: COL_L + rnd(-10, 10), y: PAD_T + gap * i + rnd(-gap * .18, gap * .18), used: false, gl: Math.random() * 6.28 });
      tgts.push({ x: COL_R + rnd(-10, 10), y: PAD_T + gap * i + rnd(-gap * .18, gap * .18), used: false });
    }
    srcs.sort(function (a, b) { return a.y - b.y; });
    tgts.sort(function (a, b) { return a.y - b.y; });
    srcs.forEach(function (s, k) { s.sol = k; });
  }
  function reset() {
    level = 0; locked = 0; fails = 0; over = false; t = 0;
    motes = [];
    for (var i = 0; i < 22; i++) motes.push({ x: Math.random() * VW, y: Math.random() * VH, r: .6 + Math.random() * 1.5, vy: -.05 - Math.random() * .18, a: .08 + Math.random() * .3 });
    buildLevel(); setHud();
    setMsg('把左边的「因」牵到右边的「果」上 —— 松手就算定了，线之间不许交叉。');
    running = true; last = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function segCross(p1, p2, p3, p4) {
    function o(a, b, c) { var v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); return v > 1e-9 ? 1 : (v < -1e-9 ? -1 : 0); }
    var d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
    return d1 !== d2 && d3 !== d4;
  }
  function wouldCross(sx, sy, tx, ty) {
    for (var i = 0; i < links.length; i++) {
      var L = links[i];
      if (segCross({ x: sx, y: sy }, { x: tx, y: ty }, { x: L.sx, y: L.sy }, { x: L.tx, y: L.ty })) return true;
    }
    return false;
  }
  function commit(si, ti) {
    var s = srcs[si], q = tgts[ti];
    if (s.used || q.used) return;
    if (wouldCross(s.x, s.y, q.x, q.y)) {
      links.push({ sx: s.x, sy: s.y, tx: q.x, ty: q.y, bad: true });
      fails++; setHud();
      if (fails >= FAILS_MAX) { finish('cross'); return; }
      setMsg('你牵出了一条交叉的线 —— 这一关重来。');
      buildLevel(); return;
    }
    s.used = true; q.used = true;
    links.push({ sx: s.x, sy: s.y, tx: q.x, ty: q.y, bad: false });
    locked++;
    flash.push({ x: (s.x + q.x) / 2, y: (s.y + q.y) / 2, text: LINES[locked % LINES.length], life: 1 });
    setHud();
    var done = srcs.filter(function (a) { return a.used; }).length;
    if (done >= srcs.length) {
      if (level >= LEVELS.length - 1) { finish('clear'); return; }
      level++; buildLevel(); setHud();
      setMsg('这一串都定下了。接着来 —— 这次更多。');
      return;
    }
    setMsg('定下了。');
  }
  function finish(kind) {
    running = false; over = true;
    var n = locked;
    if (n > best) { best = n; try { localStorage.setItem('elysia:aponia:best', String(best)); } catch (e) {} }
    var line = kind === 'cross' ? '有一根线，牵到了不该去的地方。' : '你替他们把结局都定好了。';
    setMsg(line + '　　一共定下 ' + n + ' 个结局。');
    setHud(); draw(); raf = 0;
  }
  function makeBg(w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    var lin = g.createLinearGradient(0, 0, 0, h);
    lin.addColorStop(0, '#0b0816'); lin.addColorStop(.6, '#08060e'); lin.addColorStop(1, '#06040c');
    g.fillStyle = lin; g.fillRect(0, 0, w, h);
    var rad = g.createRadialGradient(w / 2, h * .42, 6, w / 2, h * .42, w * .7);
    rad.addColorStop(0, 'rgba(232,201,138,.07)'); rad.addColorStop(1, 'rgba(8,6,14,0)');
    g.fillStyle = rad; g.fillRect(0, 0, w, h);
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
      ctx.fillStyle = 'rgba(232,201,138,' + m.a.toFixed(3) + ')'; ctx.fill();
    }
    for (i = 0; i < links.length; i++) {
      var L = links[i];
      ctx.beginPath(); ctx.moveTo(L.sx, L.sy); ctx.lineTo(L.tx, L.ty);
      ctx.strokeStyle = L.bad ? 'rgba(255,122,107,.85)' : 'rgba(232,201,138,.55)';
      ctx.lineWidth = L.bad ? 2.6 : 1.7; ctx.stroke();
    }
    if (drag && preview) {
      ctx.beginPath(); ctx.moveTo(srcs[drag.i].x, srcs[drag.i].y); ctx.lineTo(preview.x, preview.y);
      ctx.strokeStyle = preview.warn ? WARN : 'rgba(255,236,200,.9)';
      ctx.lineWidth = preview.warn ? 2.8 : 1.9; ctx.stroke();
    }
    for (i = 0; i < srcs.length; i++) {
      var a = srcs[i];
      var pulse = 1 + Math.sin(t * 2.2 + a.gl) * .12;
      if (!a.used) { ctx.beginPath(); ctx.arc(a.x, a.y, 28 * pulse, 0, 6.284); ctx.fillStyle = 'rgba(232,201,138,.07)'; ctx.fill(); }
      ctx.beginPath(); ctx.arc(a.x, a.y, 6, 0, 6.284);
      ctx.fillStyle = a.used ? 'rgba(232,201,138,.35)' : 'rgba(255,236,200,.95)'; ctx.fill();
    }
    for (i = 0; i < tgts.length; i++) {
      var q = tgts[i];
      ctx.beginPath(); ctx.arc(q.x, q.y, 11, 0, 6.284);
      ctx.strokeStyle = q.used ? 'rgba(157,143,208,.3)' : 'rgba(157,143,208,.85)'; ctx.lineWidth = 1.7; ctx.stroke();
      if (!q.used) { ctx.beginPath(); ctx.arc(q.x, q.y, 2.6, 0, 6.284); ctx.fillStyle = 'rgba(157,143,208,.85)'; ctx.fill(); }
    }
    for (i = flash.length - 1; i >= 0; i--) {
      var f = flash[i]; f.life -= .014;
      if (f.life <= 0) { flash.splice(i, 1); continue; }
      ctx.font = '13px -apple-system,PingFang SC,Microsoft YaHei,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,236,200,' + (f.life * .9).toFixed(3) + ')';
      ctx.fillText(f.text, f.x, f.y - 14 - (1 - f.life) * 16);
    }
  }
  function loop() {
    if (!running) { raf = 0; return; }
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt;
    for (var i = 0; i < motes.length; i++) { var m = motes[i]; m.y += m.vy; if (m.y < -4) { m.y = VH + 4; m.x = Math.random() * VW; } }
    draw();
    raf = requestAnimationFrame(loop);
  }
  function pos(e) {
    var r = canvas.getBoundingClientRect();
    var p = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: (p.clientX - r.left) * (VW / r.width), y: (p.clientY - r.top) * (VH / r.height) };
  }
  function near(list, p) {
    var bi = -1, bd = HIT * HIT;
    for (var i = 0; i < list.length; i++) {
      var d = (list[i].x - p.x) * (list[i].x - p.x) + (list[i].y - p.y) * (list[i].y - p.y);
      if (d <= bd) { bd = d; bi = i; }
    }
    return bi;
  }
  function onDown(e) {
    if (!running || over) return;
    if (e.cancelable) e.preventDefault();
    var p = pos(e), i = near(srcs, p);
    if (i < 0 || srcs[i].used) return;
    drag = { i: i }; preview = { x: p.x, y: p.y, warn: false };
  }
  function onMove(e) {
    if (!running || !drag) return;
    if (e.cancelable) e.preventDefault();
    var p = pos(e); preview = { x: p.x, y: p.y, warn: false };
    var j = near(tgts, p);
    if (j >= 0 && !tgts[j].used) preview.warn = wouldCross(srcs[drag.i].x, srcs[drag.i].y, tgts[j].x, tgts[j].y);
  }
  function onUp(e) {
    if (!running || !drag) return;
    var p = pos(e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e);
    var j = near(tgts, p), i = drag.i;
    drag = null; preview = null;
    if (j >= 0 && !tgts[j].used) commit(i, j);
  }
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
    overlay.className = 'apo-stage';
    overlay.id = 'apoGameOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="apo-box">',
      '  <button class="apo-close" id="apoClose" type="button">收起</button>',
      '  <div class="apo-head">第 <b id="apoLev">1</b> 关 · 定下 <b id="apoDone">0</b> 个结局 · 最佳 <b id="apoBest">0</b></div>',
      '  <div class="apo-msg" id="apoMsg">把「因」牵到「果」上。</div>',
      '  <canvas class="apo-canvas" id="apoCanvas" width="340" height="480" aria-label="戒律：因果连线" role="img"></canvas>',
      '  <button class="apo-btn" id="apoAgain" type="button">再来一次</button>',
      '</div>',
    ].join('\n');
    document.body.appendChild(overlay);
    canvas = overlay.querySelector('#apoCanvas');
    ctx = canvas.getContext('2d');
    lvEl = overlay.querySelector('#apoLev');
    doneEl = overlay.querySelector('#apoDone');
    bestEl = overlay.querySelector('#apoBest');
    msgEl = overlay.querySelector('#apoMsg');
    overlay.querySelector('#apoClose').addEventListener('click', close);
    overlay.querySelector('#apoAgain').addEventListener('click', function () { reset(); });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp);
    global.addEventListener('resize', function () { if (overlay && overlay.classList.contains('on')) fit(); });
  }
  function mount(el) {
    host = el; injectStyle(); host.innerHTML = '';
    var card = document.createElement('div'); card.className = 'game-card';
    var a = document.createElement('div'); a.className = 'game-card-title'; a.textContent = API.title;
    var b = document.createElement('div'); b.className = 'game-card-hint'; b.textContent = API.hint;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'game-card-start'; btn.textContent = '牵一根';
    btn.addEventListener('click', open);
    card.appendChild(a); card.appendChild(b); card.appendChild(btn);
    host.appendChild(card); ensureOverlay(); return card;
  }
  function close() {
    if (Date.now() - openedAt < GUARD) return;
    running = false; raf = 0; drag = null; preview = null;
    if (overlay) { overlay.classList.remove('on'); overlay.setAttribute('aria-hidden', 'false'); overlay.setAttribute('aria-hidden', 'true'); }
  }
  function open() {
    ensureOverlay();
    overlay.classList.add('on'); overlay.setAttribute('aria-hidden', 'false');
    openedAt = Date.now(); fit(); reset();
  }
  var API = {
    title: '戒律',
    hint: '左边是「因」，右边是「果」—— 按住拖一条线把它们牵起来。松手就算定了，不能反悔；而且线之间不许交叉。牵满一关就过关。',
    mount: mount, open: open,
    __state: function () {
      return { level: level, locked: locked, fails: fails, over: over,
        srcs: srcs.map(function (a) { return { x: a.x, y: a.y, used: a.used }; }),
        tgts: tgts.map(function (a) { return { x: a.x, y: a.y, used: a.used }; }),
        links: links.length, canvas: canvas ? canvas.width + 'x' + canvas.height : null,
        css: canvas ? Math.round(canvas.getBoundingClientRect().width) + 'x' + Math.round(canvas.getBoundingClientRect().height) : null };
    }
  };
  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.aponia = API;
})(window);