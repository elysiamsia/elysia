/* assets/games/kevin.js — 凯文（Ⅰ · 救世）：《五万年》堆冰合成
 *
 * 判据：这个玩法 ＝ 他的哪一句？——「无论付出多少代价，人类一定会战胜崩坏。」
 * ⇒ 合成烧掉你自己的年岁、换人间的时间；两块「冰原」相碰 = **寒潮被顶回天上**（面板清出一块）。
 *
 * ── 2026-10-15 第三版（按需求方回图 + 大西瓜工程要点重写物理）────────────
 * 需求方实测指出三件事：① 两个大球不能再合（我原档位表最大档天生不可合 ⇒ 面板必堵死）；
 * ② 大球到处乱弹、球与球压在一起（我只做位置分离、**没有速度解算**）；③ 要限时与年岁自然流失。
 * 这一版照「大西瓜」那套工程要点逐条改：
 * · **固定步长物理**（1/120 秒、每帧最多 12 步）+ 3 次子步 + 4 次迭代（物理与渲染分离）
 * · **弹性 0.05**（不再 q 弹）、空气阻尼、**速度上限 900**（防穿透）、切向摩擦 0.28
 * · **休眠阈值**（|v|<12 持续 0.35 秒即清零，防止堆叠抖动）
 * · **合成去重**：一帧只合成一对 + 新球 0.12 秒冷却（防连环爆）
 * · **越线宽限 1.2 秒**（不是一碰线就死）
 * · **预渲染球贴图**（每档一张离屏 canvas，draw 只 drawImage）—— 原版每帧给每个球新建 radialGradient
 * · **预览队列（3 个）+ 保底**：连着 5 次没给可合成的档位就强制给一个
 * · 数值：年岁自然流失 120/秒、**限时 90 秒**、合成代价/收益见 COST/GAIN 表
 */
(function (global) {
  'use strict';
  var GUARD = 400, openedAt = 0;
  var VW = 340, VH = 500, TOP = 78, G = 1350;
  var R = [15, 22, 31, 43, 57, 72, 90];        // 七级：碎冰…冰原…寒潮（两块寒潮相碰 = 顶回天上）
  var NAMES = ['碎冰', '冰棱', '冰柱', '冰墙', '冰川', '冰原', '寒潮'];
  /* ⚠ 合成**不再**扣年岁（需求方 2026-10-15 明确）：年岁只由时间流走 —— 它就是那条钟 */
  var GAIN = [40, 90, 190, 400, 780, 1500, 2600];
  var CLEAR_GAIN = 6000;                       // 两块「冰原」相碰 = 寒潮被顶回天上
  var MY_YEARS = 50000, LIMIT = 90;
  var DRAIN = MY_YEARS / LIMIT;   // ⚠ 90 秒刚好流完（≈555.6 年/秒）—— 年岁＝倒计时本身
  var MAXV = 900, REST = 0.05, AIR = 0.4, SLEEP_V = 12, SLEEP_T = 0.35;
  var ITER = 4, SUBS = 3, FIXED = 1 / 120;
  var OVER_GRACE = 1.2;
  var STYLE = ".game-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:14px;padding:1.6rem 1.4rem;text-align:center;max-width:26rem;margin:0 auto}\n.game-card-title{font-size:1.15rem;letter-spacing:.14em;color:#8fc7ff;margin-bottom:.5rem;font-weight:400}\n.game-card-hint{font-size:.82rem;line-height:1.9;color:var(--text-dim);margin-bottom:1.1rem;font-weight:300}\n.game-card-start{appearance:none;cursor:pointer;font:inherit;font-size:.85rem;letter-spacing:.14em;color:#04101c;background:#8fc7ff;border:none;border-radius:999px;padding:.66rem 2rem;min-height:48px}\n.kv-stage{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;background:rgba(4,8,16,.97);padding:max(.6rem,env(safe-area-inset-top)) .8rem max(.6rem,env(safe-area-inset-bottom))}\n.kv-stage.on{display:flex}\n.kv-box{position:relative;display:flex;flex-direction:column;align-items:center;gap:.4rem;width:100%;max-width:460px}\n.kv-head{display:flex;gap:.55rem;flex-wrap:nowrap;justify-content:center;font-size:.76rem;letter-spacing:.03em;color:var(--text-dim);font-weight:300;white-space:nowrap}\n.kv-head b{color:#8fc7ff;font-weight:400;font-size:.9rem}\n.kv-msg{font-size:.84rem;letter-spacing:.04em;color:#dceaff;min-height:1.5em;font-weight:300;text-align:center;max-width:22rem}\n.kv-canvas{width:min(100vw - 1.6rem,420px);height:auto;aspect-ratio:340/500;border-radius:14px;box-shadow:0 0 0 1px var(--glass-border);touch-action:none;display:block;user-select:none}\n.kv-btn{appearance:none;cursor:pointer;font:inherit;font-size:.82rem;letter-spacing:.12em;min-height:44px;color:var(--text);background:transparent;border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.5rem}\n.kv-close{position:fixed;top:calc(.8rem + env(safe-area-inset-top));right:.8rem;appearance:none;cursor:pointer;font:inherit;font-size:.78rem;letter-spacing:.12em;color:var(--text-dim);background:rgba(4,8,16,.7);border:1px solid var(--glass-border2);border-radius:999px;padding:.55rem 1.15rem;min-height:44px}\n@media (max-height:560px) and (orientation:landscape){\n  .kv-box{flex-direction:row;align-items:center;justify-content:center;max-width:820px;gap:1.2rem}\n  .kv-canvas{width:auto;height:min(80vh,430px)}\n}";
  function injectStyle() {
    if (document.getElementById('kv-game-style')) return;
    var st = document.createElement('style');
    st.id = 'kv-game-style'; st.textContent = STYLE; document.head.appendChild(st);
  }
  var host = null, overlay = null, canvas = null, ctx = null, bg = null, sprite = [];
  var yearsEl = null, humanEl = null, timeEl = null, bestEl = null, msgEl = null;
  var running = false, raf = 0, last = 0, t = 0, acc = 0;
  var bodies = [], pool = [], dropX = VW / 2, queue = [], years = MY_YEARS, human = 0, best = 0;
  var over = false, overT = 0, flash = [], snow = [], lastTier = -1, pity = 0;
  try { best = parseInt(localStorage.getItem('elysia:kevin:best') || '0', 10) || 0; } catch (e) { best = 0; }
  function setMsg(s) { if (msgEl) msgEl.textContent = s; }
  function setHud() {
    if (yearsEl) yearsEl.textContent = Math.max(0, Math.round(years)).toLocaleString('en-US');
    if (humanEl) humanEl.textContent = String(Math.round(human));
    if (timeEl) timeEl.textContent = String(Math.max(0, Math.ceil(LIMIT - t)));
    if (bestEl) bestEl.textContent = String(best);
  }
  function newBody() { return pool.pop() || { x: 0, y: 0, vx: 0, vy: 0, r: 15, tier: 0, age: 0, cd: 0, sleep: 0, dead: false }; }
  function spawnTier() {
    /* 保底：连着 5 次都没给出可合成的档位，就强制给一个和场上最多的档位相同的（避免挫败） */
    if (pity >= 5) { pity = 0; var c = {}; var mx = -1, mt = 0;
      for (var i = 0; i < bodies.length; i++) { var k = bodies[i].tier; c[k] = (c[k] || 0) + 1; if (c[k] > mx) { mx = c[k]; mt = k; } }
      if (mx >= 2 && mt < 3) return mt; }
    return Math.random() < 0.6 ? 0 : 1;
  }
  function reset() {
    bodies = []; pool = []; flash = []; snow = []; queue = [];
    for (var i = 0; i < 26; i++) snow.push({ x: Math.random() * VW, y: Math.random() * VH, r: .6 + Math.random() * 1.6, vy: 12 + Math.random() * 26, a: .1 + Math.random() * .3 });
    years = MY_YEARS; human = 0; over = false; overT = 0; t = 0; acc = 0; pity = 0;
    dropX = VW / 2; queue = [spawnTier(), spawnTier(), spawnTier()];
    setHud(); setMsg('年岁在流走 —— 点一下投冰。同级相碰就合成更大的 —— 一路合到「寒潮」，再合就把它顶回天上。');
    running = true; last = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function drop() {
    if (over || !running) return;
    var tier = queue.shift(); queue.push(spawnTier());
    if (tier >= 2) pity++; else pity = 0;
    var r = R[tier], b = newBody();
    b.x = Math.max(r + 2, Math.min(VW - r - 2, dropX)); b.y = TOP - r - 6;
    b.vx = 0; b.vy = 0; b.r = r; b.tier = tier; b.age = 0; b.cd = 0; b.sleep = 0; b.dead = false;
    bodies.push(b); if (lastTier >= 0 && tier === lastTier) pity = 0; lastTier = tier;
  }
  function finish(kind) {
    running = false; over = true;
    var n = Math.round(human);
    if (n > best) { best = n; try { localStorage.setItem('elysia:kevin:best', String(best)); } catch (e) {} }
    var line = kind === 'overflow' ? '寒潮压到了人间。' : '你的年岁，走到了尽头。';
    setMsg(line + '　　你给人类留下了 ' + n + ' 年。');
    setHud(); draw(); raf = 0;
  }
  function physics(dt) {
    var i, j, b;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      b.age += dt; if (b.cd > 0) b.cd -= dt;
      b.vy += G * dt;
      b.vx -= b.vx * AIR * dt;
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp > MAXV) { b.vx = b.vx / sp * MAXV; b.vy = b.vy / sp * MAXV; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * REST; }
      if (b.x > VW - b.r) { b.x = VW - b.r; if (b.vx > 0) b.vx = -b.vx * REST; }
      if (b.y > VH - b.r) { b.y = VH - b.r; if (b.vy > 0) b.vy = -b.vy * REST; b.vx *= (1 - 2.2 * dt); }
    }
    var merged = null;
    for (var it = 0; it < ITER; it++) {
      for (i = 0; i < bodies.length; i++) {
        for (j = i + 1; j < bodies.length; j++) {
          var a = bodies[i], c = bodies[j];
          var dx = c.x - a.x, dy = c.y - a.y, rr = a.r + c.r;
          var d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 < 1e-6) continue;
          var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          var ov = rr - d, corr = ov * (it === 0 ? 0.7 : 0.45);
          a.x -= nx * corr; a.y -= ny * corr; c.x += nx * corr; c.y += ny * corr;
          var rvx = c.vx - a.vx, rvy = c.vy - a.vy;
          var vn = rvx * nx + rvy * ny;
          if (vn < 0) {
            var imp = -(1 + REST) * vn / 2;
            a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny;
            var tx = -ny, ty = nx, vt = (c.vx - a.vx) * tx + (c.vy - a.vy) * ty;
            a.vx += tx * vt * 0.28; a.vy += ty * vt * 0.28; c.vx -= tx * vt * 0.28; c.vy -= ty * vt * 0.28;
          }
          if (!merged && a.tier === c.tier && a.age > 0.15 && c.age > 0.15 && a.cd <= 0 && c.cd <= 0) {
            merged = { a: a, c: c, mx: (a.x + c.x) / 2, my: (a.y + c.y) / 2 };
          }
        }
      }
      if (merged) break;
    }
    if (merged) {
      var A = merged.a, B = merged.c, tier = A.tier;
      A.dead = true; B.dead = true;
      if (tier < R.length - 1) {
        var nt = tier + 1, nb = newBody();
        nb.x = Math.max(R[nt] + 2, Math.min(VW - R[nt] - 2, merged.mx));
        nb.y = merged.my; nb.vx = 0; nb.vy = 0; nb.r = R[nt]; nb.tier = nt;
        nb.age = 0.3; nb.cd = 0.12; nb.sleep = 0; nb.dead = false;
        bodies.push(nb);
        human += GAIN[nt - 1];
        flash.push({ x: nb.x, y: nb.y, r: R[nt], life: 1, text: '' });
      } else {
        human += CLEAR_GAIN;
        flash.push({ x: merged.mx, y: merged.my, r: 110, life: 1, text: '寒潮被顶回天上' });
        setMsg('两块「寒潮」相碰 —— 天，被顶回去了。人间又多了 ' + CLEAR_GAIN + ' 年。');
      }
      var alive = [];
      for (i = 0; i < bodies.length; i++) {
        if (bodies[i].dead) pool.push(bodies[i]); else alive.push(bodies[i]);
      }
      bodies = alive;
      setHud();
      if (years <= 0) { years = 0; setHud(); finish('years'); return; }
    }
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (b.age > 0.4 && Math.abs(b.vx) < SLEEP_V && Math.abs(b.vy) < SLEEP_V) {
        b.sleep += dt;
        if (b.sleep > SLEEP_T) { b.vx = 0; b.vy = 0; }
      } else b.sleep = 0;
    }
    var above = false;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (b.age > 0.8 && b.y - b.r < TOP && b.sleep > 0.2) above = true;
    }
    overT = above ? overT + dt : 0;
    if (overT > OVER_GRACE) { finish('overflow'); return; }
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
    g.beginPath(); g.moveTo(0, TOP * (h / VH)); g.lineTo(w, TOP * (h / VH)); g.stroke();
    g.setLineDash([6, 7]); g.strokeStyle = 'rgba(143,199,255,.16)';
    g.beginPath(); g.moveTo(0, (TOP - 46) * (h / VH)); g.lineTo(w, (TOP - 46) * (h / VH)); g.stroke();
    g.setLineDash([]);
    return c;
  }
  function makeSprites(scale) {
    sprite = [];
    for (var i = 0; i < R.length; i++) {
      var r = R[i] * scale;
      var c = document.createElement('canvas'); c.width = c.height = Math.ceil(r * 2 + 4);
      var g = c.getContext('2d'), cx = c.width / 2;
      var rg = g.createRadialGradient(cx - r * .3, cx - r * .35, r * .12, cx, cx, r);
      rg.addColorStop(0, '#eaf5ff'); rg.addColorStop(.62, '#9fc9f2'); rg.addColorStop(1, '#5d84b0');
      g.beginPath(); g.arc(cx, cx, r, 0, 6.284); g.fillStyle = rg; g.fill();
      g.strokeStyle = 'rgba(255,255,255,.32)'; g.lineWidth = Math.max(1, r * .04); g.stroke();
      sprite.push(c);
    }
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
      for (i = 0; i < queue.length; i++) {
        var qr = R[queue[i]], qy = TOP - 96 - i * 26;
        ctx.globalAlpha = 1 - i * 0.32;
        if (sprite[queue[i]]) ctx.drawImage(sprite[queue[i]], dropX - qr, qy - qr, qr * 2, qr * 2);
        ctx.globalAlpha = 1;
      }
    }
    for (i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (sprite[b.tier]) ctx.drawImage(sprite[b.tier], b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }
    for (i = flash.length - 1; i >= 0; i--) {
      var m = flash[i]; m.life -= .045;
      if (m.life <= 0) { flash.splice(i, 1); continue; }
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (1 + (1 - m.life) * .5), 0, 6.284);
      ctx.strokeStyle = 'rgba(214,236,255,' + (m.life * .85).toFixed(3) + ')'; ctx.lineWidth = 2.4; ctx.stroke();
      if (m.text) {
        ctx.font = '13px -apple-system,PingFang SC,Microsoft YaHei,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(214,236,255,' + m.life.toFixed(3) + ')';
        ctx.fillText(m.text, VW / 2, VH / 2 - 20);
      }
    }
    var lit = Math.min(1, human / 20000);
    for (i = 0; i < 9; i++) {
      ctx.beginPath(); ctx.arc((i + .5) * (VW / 9), VH - 12, 2 + lit * 1.8, 0, 6.284);
      ctx.fillStyle = 'rgba(255,231,170,' + (.28 + lit * .6).toFixed(3) + ')'; ctx.fill();
    }
  }
  function loop() {
    if (!running) { raf = 0; return; }
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt;
    years -= DRAIN * dt;
    if (years <= 0) { years = 0; setHud(); finish('years'); return; }
    acc += dt;
    var guard = 0;
    while (acc >= FIXED && guard < 12) { acc -= FIXED; guard++; physics(FIXED); if (!running) return; }
    var i;
    for (i = 0; i < snow.length; i++) { snow[i].y += snow[i].vy * dt; if (snow[i].y > VH + 4) { snow[i].y = -4; snow[i].x = Math.random() * VW; } }
    setHud();
    if (t >= LIMIT) { finish('time'); return; }
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
    makeSprites(canvas.width / VW);
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
      '  <div class="kv-head">年岁 <b id="kvMine">50,000</b> · 人间 <b id="kvHuman">0</b> 年 · <b id="kvTime">90</b> 秒 · 最佳 <b id="kvBest">0</b></div>',
      '  <div class="kv-msg" id="kvMsg">点一下投冰。</div>',
      '  <canvas class="kv-canvas" id="kvCanvas" width="340" height="500" aria-label="五万年：堆冰合成" role="img"></canvas>',
      '  <button class="kv-btn" id="kvAgain" type="button">再来一次</button>',
      '</div>',
    ].join('\n');
    document.body.appendChild(overlay);
    canvas = overlay.querySelector('#kvCanvas');
    ctx = canvas.getContext('2d');
    yearsEl = overlay.querySelector('#kvMine');
    humanEl = overlay.querySelector('#kvHuman');
    timeEl = overlay.querySelector('#kvTime');
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
    title: '五万年',
    hint: '冰块落下，两块同级相碰就合成更大的；两块「寒潮」相碰会**把它顶回天上**。⏳ 你自己的年岁一直在流走（90 秒流完），合成只做一件事：给人间多留几年。',
    mount: mount, open: open,
    /* ⚠ 测试用投放钩子（只给验收脚本用）：直接投一块指定档位的冰 */
    __drop: function (tier) {
      if (over || !running) return;
      if (tier < 0 || tier >= R.length) return;
      var r = R[tier], b = newBody();
      b.x = Math.max(r + 2, Math.min(VW - r - 2, dropX)); b.y = TOP - r - 6;
      b.vx = 0; b.vy = 0; b.r = r; b.tier = tier; b.age = 0; b.cd = 0; b.sleep = 0; b.dead = false;
      bodies.push(b);
    },
    __state: function () {
      return { years: Math.round(years), human: Math.round(human), t: Math.round(t * 10) / 10, bodies: bodies.length,
        tiers: bodies.map(function (b) { return b.tier; }),
        pos: bodies.map(function (b) { return [Math.round(b.x), Math.round(b.y), b.r]; }), over: over,
        maxV: bodies.reduce(function (m, b) { return Math.max(m, Math.abs(b.vx) + Math.abs(b.vy)); }, 0),
        css: canvas ? Math.round(canvas.getBoundingClientRect().width) + 'x' + Math.round(canvas.getBoundingClientRect().height) : null };
    }
  };
  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.kevin = API;
})(window);