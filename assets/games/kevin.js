/* assets/games/kevin.js — 凯文（Ⅰ · 救世）：《五万年》
 *
 * 判据：这个玩法 ＝ 他的哪一句？——「无论付出多少代价，人类一定会战胜崩坏。」
 * ⇒ 每一次合成都烧掉你自己的年岁，换人间多一点时间；堆过顶线就是寒潮压到人间。
 * 结局只报一件事：你给人类留下了多少年。
 *
 * 重做史：①《碎冰》被否（意义不明）→ ②《五万年》按住烧年岁（意义对、可玩性薄）→
 * ③ 本版：堆冰合成（大西瓜那类），需求方 2026-10-15 提的。
 *
 * 手机优先：画布铺满窄屏（100vw-1.6rem，上限 420px）、DPR 限到 2、背景渐变预渲染缓存、
 * 遮罩不用 backdrop-filter（首页 43 处毛玻璃实测掉到 30fps）；拖动面 ⇒ 退出键 50px 口径。
 */
(function (global) {
  'use strict';
  var CLOSE_GUARD_MS = 400, openedAt = 0;
  var VW = 340, VH = 480, TOP = 74, G = 1500;
  var R = [15, 22, 31, 43, 57, 72];
  var COST = [120, 260, 520, 980, 1800, 3200];
  var GAIN = [60, 140, 300, 620, 1200, 2200];
  var MY_YEARS = 50000;
  var STYLE = ".game-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:14px;padding:1.6rem 1.4rem;text-align:center;max-width:26rem;margin:0 auto}\n.game-card-title{font-size:1.15rem;letter-spacing:.14em;color:#8fc7ff;margin-bottom:.5rem;font-weight:400}\n.game-card-hint{font-size:.82rem;line-height:1.9;color:var(--text-dim);margin-bottom:1.1rem;font-weight:300}\n.game-card-start{appearance:none;cursor:pointer;font:inherit;font-size:.85rem;letter-spacing:.14em;color:#04101c;background:#8fc7ff;border:none;border-radius:999px;padding:.66rem 2rem;min-height:48px}\n.kv-stage{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;background:rgba(4,8,16,.97);padding:max(.6rem,env(safe-area-inset-top)) .8rem max(.6rem,env(safe-area-inset-bottom))}\n.kv-stage.on{display:flex}\n.kv-box{position:relative;display:flex;flex-direction:column;align-items:center;gap:.45rem;width:100%;max-width:460px}\n.kv-head{display:flex;gap:.7rem;flex-wrap:nowrap;justify-content:center;font-size:.78rem;letter-spacing:.06em;color:var(--text-dim);font-weight:300;white-space:nowrap}\n.kv-head b{color:#8fc7ff;font-weight:400;font-size:.92rem}\n.kv-msg{font-size:.84rem;letter-spacing:.04em;color:#dceaff;min-height:1.5em;font-weight:300;text-align:center;max-width:22rem}\n.kv-canvas{width:min(100vw - 1.6rem,420px);height:auto;aspect-ratio:340/480;border-radius:14px;box-shadow:0 0 0 1px var(--glass-border);touch-action:none;display:block;user-select:none}\n.kv-btn{appearance:none;cursor:pointer;font:inherit;font-size:.82rem;letter-spacing:.12em;min-height:44px;color:var(--text);background:transparent;border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.5rem}\n.kv-close{position:fixed;top:calc(.8rem + env(safe-area-inset-top));right:.8rem;appearance:none;cursor:pointer;font:inherit;font-size:.78rem;letter-spacing:.12em;color:var(--text-dim);background:rgba(4,8,16,.7);border:1px solid var(--glass-border2);border-radius:999px;padding:.55rem 1.15rem;min-height:44px}\n@media (max-height:560px) and (orientation:landscape){\n  .kv-box{flex-direction:row;align-items:center;justify-content:center;max-width:820px;gap:1.2rem}\n  .kv-canvas{width:auto;height:min(78vh,420px)}\n}";
  function injectStyle() {
    if (document.getElementById('kv-game-style')) return;
    var st = document.createElement('style');
    st.id = 'kv-game-style'; st.textContent = STYLE; document.head.appendChild(st);
  }
  var host = null, overlay = null, canvas = null, ctx = null, bg = null;
  var yearsEl = null, humanEl = null, bestEl = null, msgEl = null;
  var running = false, raf = 0, last = 0, t = 0;
  var bodies = [], dropX = 170, nextTier = 0, years = MY_YEARS, human = 0, best = 0;
  var over = false, overT = 0, mergeFlash = [], snow = [];
  try { best = parseInt(localStorage.getItem('elysia:kevin:best') || '0', 10) || 0; } catch (e) { best = 0; }
  function setMsg(s) { if (msgEl) msgEl.textContent = s; }
  function setHud() {
    if (yearsEl) yearsEl.textContent = Math.max(0, Math.round(years)).toLocaleString('en-US');
    if (humanEl) humanEl.textContent = String(Math.round(human));
    if (bestEl) bestEl.textContent = String(best);
  }
  function reset() {
    bodies = []; mergeFlash = []; snow = [];
    for (var i = 0; i < 26; i++) snow.push({ x: Math.random() * VW, y: Math.random() * VH, r: .6 + Math.random() * 1.6, vy: 12 + Math.random() * 26, a: .1 + Math.random() * .3 });
    years = MY_YEARS; human = 0; over = false; overT = 0; t = 0; dropX = VW / 2; nextTier = 0;
    setHud(); setMsg('点一下投冰 —— 两块同级冰碰在一起就会合成更大的。每次合成都烧掉你的年岁。');
    running = true; last = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function drop() {
    if (over || !running) return;
    var r = R[nextTier];
    bodies.push({ x: Math.max(r + 2, Math.min(VW - r - 2, dropX)), y: TOP - r - 6, vx: 0, vy: 0, r: r, tier: nextTier, age: 0 });
    nextTier = Math.random() < 0.6 ? 0 : 1;
  }
  function finish(kind) {
    running = false; over = true;
    var n = Math.round(human);
    if (n > best) { best = n; try { localStorage.setItem('elysia:kevin:best', String(best)); } catch (e) {} }
    setMsg((kind === 'years' ? '你的年岁，烧完了。' : '寒潮压到了人间。') + '　　你给人类留下了 ' + n + ' 年。');
    setHud(); draw(); raf = 0;
  }
  function step(dt) {
    var i, j, b;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      b.vy += G * dt; b.age += dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * .2; }
      if (b.x > VW - b.r) { b.x = VW - b.r; b.vx = -Math.abs(b.vx) * .2; }
      if (b.y > VH - b.r) { b.y = VH - b.r; b.vy = -Math.abs(b.vy) * .12; b.vx *= .86; }
    }
    var merged = false;
    for (i = 0; i < bodies.length && !merged; i++) {
      for (j = i + 1; j < bodies.length; j++) {
        var a = bodies[i], c = bodies[j];
        var dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy, rr = a.r + c.r;
        if (d2 >= rr * rr || d2 === 0) continue;
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = rr - d;
        a.x -= nx * ov * .5; a.y -= ny * ov * .5; c.x += nx * ov * .5; c.y += ny * ov * .5;
        if (a.tier === c.tier && a.tier < R.length - 1 && a.age > .12 && c.age > .12) {
          var nt = a.tier + 1;
          a.dead = true; c.dead = true; merged = true;
          bodies.push({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, vx: 0, vy: -40, r: R[nt], tier: nt, age: .2 });
          years -= COST[nt - 1]; human += GAIN[nt - 1];
          mergeFlash.push({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, r: R[nt], life: 1 });
          setHud();
          if (years <= 0) { years = 0; setHud(); finish('years'); return; }
          break;
        }
      }
    }
    if (merged) {
      var alive = [];
      for (i = 0; i < bodies.length; i++) if (!bodies[i].dead) alive.push(bodies[i]);
      bodies = alive;
    }
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (b.age > .8 && b.y - b.r < TOP && Math.abs(b.vy) < 40) overT += dt;
    }
    if (overT > .5) { finish('overflow'); return; }
    if (bodies.length > 46) bodies.splice(0, bodies.length - 46);
  }
  function makeBg(w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    var lin = g.createLinearGradient(0, 0, 0, h);
    lin.addColorStop(0, '#0b1a33'); lin.addColorStop(.55, '#0a1426'); lin.addColorStop(1, '#070d18');
    g.fillStyle = lin; g.fillRect(0, 0, w, h);
    var rad = g.createRadialGradient(w / 2, h * .16, 6, w / 2, h * .16, w * .8);
    rad.addColorStop(0, 'rgba(143,199,255,.10)'); rad.addColorStop(1, 'rgba(7,13,24,0)');
    g.fillStyle = rad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(143,199,255,.34)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, TOP); g.lineTo(w, TOP); g.stroke();
    return c;
  }
  function draw() {
    var s = canvas.width / VW, i;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, VW, VH);
    if (bg) ctx.drawImage(bg, 0, 0, VW, VH);
    for (i = 0; i < snow.length; i++) {
      var f = snow[i];
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.284);
      ctx.fillStyle = 'rgba(214,236,255,' + f.a.toFixed(3) + ')'; ctx.fill();
    }
    if (running && !over) {
      ctx.strokeStyle = 'rgba(143,199,255,.42)'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 6]);
      ctx.beginPath(); ctx.moveTo(dropX, TOP - 6); ctx.lineTo(dropX, VH); ctx.stroke();
      ctx.setLineDash([]);
      var pr = R[nextTier];
      ctx.beginPath(); ctx.arc(dropX, TOP - pr - 6, pr, 0, 6.284);
      ctx.fillStyle = 'rgba(214,236,255,.85)'; ctx.fill();
    }
    for (i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      var g2 = ctx.createRadialGradient(b.x - b.r * .3, b.y - b.r * .35, b.r * .15, b.x, b.y, b.r);
      g2.addColorStop(0, '#eaf5ff'); g2.addColorStop(.65, '#9fc9f2'); g2.addColorStop(1, '#5d84b0');
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.284); ctx.fillStyle = g2; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
    }
    for (i = mergeFlash.length - 1; i >= 0; i--) {
      var m = mergeFlash[i]; m.life -= .05;
      if (m.life <= 0) { mergeFlash.splice(i, 1); continue; }
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (1 + (1 - m.life) * .6), 0, 6.284);
      ctx.strokeStyle = 'rgba(214,236,255,' + (m.life * .8).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.stroke();
    }
    var lit = Math.min(1, human / 6000);
    for (i = 0; i < 9; i++) {
      ctx.beginPath(); ctx.arc((i + .5) * (VW / 9), VH - 12, 2 + lit * 1.6, 0, 6.284);
      ctx.fillStyle = 'rgba(255,231,170,' + (.28 + lit * .6).toFixed(3) + ')'; ctx.fill();
    }
  }
  function loop() {
    if (!running) { raf = 0; return; }
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt;
    step(dt / 2); if (!running) return;
    step(dt / 2); if (!running) return;
    for (var i = 0; i < snow.length; i++) { snow[i].y += snow[i].vy * dt; if (snow[i].y > VH + 4) { snow[i].y = -4; snow[i].x = Math.random() * VW; } }
    draw();
    raf = requestAnimationFrame(loop);
  }
  function pos(e) {
    var r = canvas.getBoundingClientRect();
    var p = e.touches && e.touches[0] ? e.touches[0] : e;
    return (p.clientX - r.left) * (VW / r.width);
  }
  function onDown(e) { if (running && !over) { if (e.cancelable) e.preventDefault(); dropX = Math.max(8, Math.min(VW - 8, pos(e))); } }
  function onMove(e) { if (running && !over) { if (e.cancelable) e.preventDefault(); dropX = Math.max(8, Math.min(VW - 8, pos(e))); } }
  function onUp() { drop(); }
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
    overlay.className = 'kv-stage';
    overlay.id = 'kevinGameOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="kv-box">',
      '  <button class="kv-close" id="kvClose" type="button">收起</button>',
      '  <div class="kv-head">你的年岁 <b id="kvMine">50,000</b> · 人间 <b id="kvHuman">0</b> 年 · 最佳 <b id="kvBest">0</b></div>',
      '  <div class="kv-msg" id="kvMsg">点一下投冰。</div>',
      '  <canvas class="kv-canvas" id="kvCanvas" width="340" height="480" aria-label="五万年：堆冰合成" role="img"></canvas>',
      '  <button class="kv-btn" id="kvAgain" type="button">再来一次</button>',
      '</div>',
    ].join('\n');
    document.body.appendChild(overlay);
    canvas = overlay.querySelector('#kvCanvas');
    ctx = canvas.getContext('2d');
    yearsEl = overlay.querySelector('#kvMine');
    humanEl = overlay.querySelector('#kvHuman');
    bestEl = overlay.querySelector('#kvBest');
    msgEl = overlay.querySelector('#kvMsg');
    overlay.querySelector('#kvClose').addEventListener('click', close);
    overlay.querySelector('#kvAgain').addEventListener('click', function () { reset(); });
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
    btn.type = 'button'; btn.className = 'game-card-start'; btn.textContent = '投一块冰';
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
    ensureOverlay();
    overlay.classList.add('on'); overlay.setAttribute('aria-hidden', 'false');
    openedAt = Date.now(); fit(); reset();
  }
  var API = {
    title: '五万年',
    hint: '冰块从上面落下来，两块同级的冰碰到一起会合成更大的。堆过顶线，寒潮就压到人间了。⚠ 每一次合成都烧掉你自己的年岁 —— 结局只报一件事：你给人类留下了多少年。',
    mount: mount, open: open
  };
  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.kevin = API;
})(window);