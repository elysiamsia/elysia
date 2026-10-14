/* assets/games/aponia.js — 阿波尼亚（Ⅲ · 戒律）的小游戏：《戒律》
 *
 * ── 为什么是这个玩法 ────────────────────────────────────────────────
 * 她的那一句：**戒律不是愿望，是她替所有人定下的结局。**
 * 所以玩法就是这句话的字面转写：把「因」牵到「果」上 ——
 *   · **牵上就不能反悔**（松手即定 ⇒ 不可撤销）；
 *   · **线不许交叉**（规矩本身就是戒律）；
 *   · 每牵一根，就有一对人被**定下结局**。
 * ⚠ 判据：答不出「这个玩法 ＝ 他的哪一句」的玩法会被打回来（凯文《碎冰》的前车之鉴）。
 *
 * ── 与 spec 的对应（docs/superpowers/specs/2026-10-15-four-games-design.md §2.1）
 * · **线画直线**：spec 风险① 指出「贝塞尔垂线 ＋ 线段相交判定」是自相矛盾的（弦线相交 ≠ 视觉相交），
 *   二选一里选了**画直线** —— 「牵上＝拉直」，小画布上更清晰。
 * · **拖动中画预览线**；松手前若会交叉 ⇒ 预览线变警示色 `#ff7a6b`（风险②：相交不许是隐形的）；
 *   **不可反悔的界线是「松手」**，松手之前都只是预览。
 * · 第一关 **2 对**（教学：一次成功的牵线就把两条规则都教会）；cap **6 对**。
 * · 命中区 ≥ **32px**、点间距 ≥ **24px**（触控）。
 * · 失败归因要说得清：交叉 ⇒ 高亮**那一条**并说「你牵出了一条交叉的线」；无解 ⇒「所有能牵的尽头都到了」。
 * · **结局只说一件事**（契约第 11 条）：一句话 + 一个数字 + 「再来一次」。
 * · `dt` **必须钳**（契约第 12 条）：内嵌浏览器切后台再回来那一下不钳就是冤死。
 * · 成绩存 `localStorage['elysia:aponia:best']`（2026-10-15 拍板：四款都存），读不到就当没有记录。
 */
(function (global) {
  'use strict';

  var CLOSE_GUARD_MS = 400;
  var openedAt = 0;
  var CW = 340, CH = 420;
  var PAD_T = 76, PAD_B = 356;      // 两列点的纵向活动范围
  var COL_L = 74, COL_R = CW - 74;  // 因 / 果 两列 x
  var HIT = 32;                     // 命中半径（≥32px，触控）
  var WARN = '#ff7a6b';
  var PAIRS = [2, 4, 5, 6];         // 第一关 2 对 → cap 6 对
  var LINES = ['定了。', '这一条，落下了。', '她的戒律，又定了一桩。', '就这样吧。'];

  var STYLE = ".game-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:14px;padding:1.6rem 1.4rem;text-align:center;max-width:26rem;margin:0 auto}\n.game-card-title{font-size:1.15rem;letter-spacing:.14em;color:#e8c98a;margin-bottom:.5rem;font-weight:400}\n.game-card-hint{font-size:.82rem;line-height:1.9;color:var(--text-dim);margin-bottom:1.1rem;font-weight:300}\n.game-card-start{appearance:none;cursor:pointer;font:inherit;font-size:.85rem;letter-spacing:.14em;color:#08060e;background:#e8c98a;border:none;border-radius:999px;padding:.62rem 1.9rem;min-height:44px;transition:transform .25s ease,box-shadow .25s ease}\n.game-card-start:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(232,201,138,.28)}\n.apo-stage{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;background:rgba(8,6,14,.95);backdrop-filter:blur(6px);padding:1.2rem}\n.apo-stage.on{display:flex}\n.apo-box{position:relative;display:flex;flex-direction:column;align-items:center;gap:.6rem;width:100%;max-width:460px}\n.apo-col{display:flex;flex-direction:column;align-items:center;gap:.5rem}\n.apo-head{font-size:.8rem;letter-spacing:.14em;color:var(--text-dim);font-weight:300;display:flex;gap:1rem;flex-wrap:wrap;justify-content:center}\n.apo-head b{color:#e8c98a;font-weight:400;font-size:.95rem}\n.apo-msg{font-size:.88rem;letter-spacing:.06em;color:#efe7ff;min-height:1.6em;font-weight:300;text-align:center;max-width:22rem}\n.apo-canvas{width:min(340px,84vw);height:auto;aspect-ratio:340/420;border-radius:16px;box-shadow:0 0 0 1px var(--glass-border);touch-action:none;display:block;cursor:crosshair;user-select:none}\n.apo-row{display:flex;gap:.8rem;justify-content:center;flex-wrap:wrap}\n.apo-btn{appearance:none;cursor:pointer;font:inherit;font-size:.82rem;letter-spacing:.12em;min-height:44px;color:var(--text);background:transparent;border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.4rem}\n.apo-btn:hover{border-color:#e8c98a;color:#e8c98a}\n/* ⚠ 收起固定右上角：这款画布是**拖动面** ⇒ 按 50px 口径量（GAMES 里 swipe: True） */\n.apo-close{position:fixed;top:calc(1rem + env(safe-area-inset-top));right:1rem;appearance:none;cursor:pointer;font:inherit;font-size:.78rem;letter-spacing:.12em;color:var(--text-dim);background:rgba(8,6,14,.6);border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.1rem;min-height:40px}\n.apo-close:hover{color:#e8c98a;border-color:#e8c98a}\n@media (max-height:520px) and (orientation:landscape){\n  .apo-box{flex-direction:row;align-items:center;justify-content:center;max-width:780px;gap:1.4rem}\n  .apo-canvas{width:auto;height:min(70vh,300px)}\n}";

  function injectStyle() {
    if (document.getElementById('apo-game-style')) return;
    var st = document.createElement('style');
    st.id = 'apo-game-style';
    st.textContent = STYLE;
    document.head.appendChild(st);
  }

  var host = null, overlay = null, canvas = null, ctx = null;
  var levEl = null, countEl = null, bestEl = null, msgEl = null;
  var running = false, raf = 0, last = 0, t = 0;
  var level = 0, total = 0, best = 0;
  var srcs = [], tgts = [], links = [], drag = null, preview = null;
  var motes = [], flashes = [];
  var over = false;

  try { best = parseInt(localStorage.getItem('elysia:aponia:best') || '0', 10) || 0; } catch (e) { best = 0; }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ── 生成一关：两列各 n 个点，**先定解、再抖动** ───────────────────────
     解 = 两边各自按 y 排序后**同序配对**（两列之间，同序配对必然不相交 —— 这是个几何事实）。
     抖动只动 y 的细节，不动两列内部的相对顺序 ⇒ 解依旧成立，但**看起来**是乱的。
     ⚠ 并保证：相邻点间距 ≥ 24px（触控底线）。 */
  function buildLevel(n) {
    var span = PAD_B - PAD_T;
    var gapS = span / (n - 1), gapT = gapS;
    srcs = []; tgts = []; links = []; drag = null; preview = null;
    for (var i = 0; i < n; i++) {
      var yS = PAD_T + gapS * i + rnd(-gapS * 0.16, gapS * 0.16);
      var yT = PAD_T + gapT * i + rnd(-gapT * 0.16, gapT * 0.16);
      srcs.push({ x: COL_L, y: yS, used: false, glow: Math.random() * 6.28 });
      tgts.push({ x: COL_R, y: yT, used: false });
    }
    srcs.sort(function (a, b) { return a.y - b.y; });
    tgts.sort(function (a, b) { return a.y - b.y; });
    for (var k = 0; k < n; k++) srcs[k].sol = k;   // 同序配对就是解
  }

  function segCross(p1, p2, p3, p4) {
    function o(a, b, c) { var v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); return v > 1e-9 ? 1 : (v < -1e-9 ? -1 : 0); }
    var d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
    return d1 !== d2 && d3 !== d4;
  }

  function wouldCross(sx, sy, tx, ty) {
    for (var i = 0; i < links.length; i++) {
      var L2 = links[i];
      if (segCross({ x: sx, y: sy }, { x: tx, y: ty },
                    { x: L2.sx, y: L2.sy }, { x: L2.tx, y: L2.ty })) return L2;
    }
    return null;
  }

  function hasMove() {
    for (var i = 0; i < srcs.length; i++) {
      if (srcs[i].used) continue;
      for (var j = 0; j < tgts.length; j++) {
        if (tgts[j].used) continue;
        if (!wouldCross(srcs[i].x, srcs[i].y, tgts[j].x, tgts[j].y)) return true;
      }
    }
    return false;
  }

  function setMsg(s) { if (msgEl) msgEl.textContent = s; }
  function setHud() {
    if (levEl) levEl.textContent = String(level + 1);
    if (countEl) countEl.textContent = String(total);
    if (bestEl) bestEl.textContent = String(best);
  }

  function start() {
    level = 0; total = 0; over = false;
    motes = []; flashes = [];
    for (var i = 0; i < 22; i++) motes.push({ x: Math.random() * CW, y: Math.random() * CH, r: .6 + Math.random() * 1.5, vy: -.06 - Math.random() * .18, a: .08 + Math.random() * .30 });
    buildLevel(PAIRS[0]);
    setHud();
    setMsg('从左边牵一条线到右边 —— 松手就算定了，线之间不许交叉。');
    running = true;
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function commit(src, tgt) {
    var hit = wouldCross(src.x, src.y, tgt.x, tgt.y);
    if (hit) {
      links.push({ sx: src.x, sy: src.y, tx: tgt.x, ty: tgt.y, bad: true, a: 1 });
      finish('有一根线，牵到了不该去的地方。', hit);
      return;
    }
    src.used = true; tgt.used = true;
    links.push({ sx: src.x, sy: src.y, tx: tgt.x, ty: tgt.y, bad: false, a: 0 });
    total++;
    flashes.push({ x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2, text: LINES[Math.floor(Math.random() * LINES.length)], life: 1 });
    if (total > best) { best = total; try { localStorage.setItem('elysia:aponia:best', String(best)); } catch (e) {} }
    setHud();
    var done = links.filter(function (l) { return !l.bad; }).length;
    if (done >= srcs.length) {
      level++;
      buildLevel(PAIRS[Math.min(level, PAIRS.length - 1)]);
      setHud();
      setMsg('这一串，都定下了。接着来 —— 这次更多。');
      return;
    }
    if (!hasMove()) { finish('你替他们把结局都定好了。', null); return; }
    setMsg('定下了。');
  }

  function finish(line, badLink) {
    running = false; over = true;
    if (line.indexOf('不该去') >= 0) {
      setMsg(line + '　　你定下了 ' + total + ' 个结局。');
    } else {
      setMsg(line + '　　一共定下 ' + total + ' 个结局。');
    }
    if (line.indexOf('不该去') >= 0) setMsg('有一根线，牵到了不该去的地方。　　你定下了 ' + total + ' 个结局。');
    draw();
    raf = 0;
  }

  function toCanvas(e) {
    var r = canvas.getBoundingClientRect();
    var p = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: (p.clientX - r.left) * (CW / r.width), y: (p.clientY - r.top) * (CH / r.height) };
  }

  function nearest(list, p) {
    var bi = -1, bd = HIT * HIT;
    for (var i = 0; i < list.length; i++) {
      var d = (list[i].x - p.x) * (list[i].x - p.x) + (list[i].y - p.y) * (list[i].y - p.y);
      if (d <= bd) { bd = d; bi = i; }
    }
    return bi;
  }

  function onDown(e) {
    if (!running) return;
    if (e.cancelable) e.preventDefault();
    var p = toCanvas(e);
    var i = nearest(srcs, p);
    if (i < 0 || srcs[i].used) return;
    drag = { i: i, x: p.x, y: p.y };
    preview = { x: p.x, y: p.y, warn: false };
  }
  function onMove(e) {
    if (!running || !drag) return;
    if (e.cancelable) e.preventDefault();
    var p = toCanvas(e);
    preview = { x: p.x, y: p.y, warn: false };
    var j = nearest(tgts, p);
    if (j >= 0 && !tgts[j].used) preview.warn = !!wouldCross(srcs[drag.i].x, srcs[drag.i].y, tgts[j].x, tgts[j].y);
  }
  function onUp(e) {
    if (!running || !drag) return;
    var p = toCanvas(e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e);
    var j = nearest(tgts, p);
    var src = srcs[drag.i];
    var ok = j >= 0 && !tgts[j].used;
    drag = null; preview = null;
    if (!ok) return;                     // ⚠ 牵到空白处 = 什么也没发生（不扣分）
    commit(src, tgts[j]);
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    var i;
    /* 烛光底 */
    var g = ctx.createRadialGradient(CW / 2, CH * .42, 4, CW / 2, CH * .42, CW * .62);
    g.addColorStop(0, 'rgba(232,201,138,' + (0.05 + Math.sin(t * 1.6) * 0.012).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(8,6,14,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
    /* 浮尘（第一帧就在动 —— 契约「开局第一帧得动」） */
    for (i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.y += m.vy;
      if (m.y < -4) { m.y = CH + 4; m.x = Math.random() * CW; }
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232,201,138,' + m.a.toFixed(3) + ')';
      ctx.fill();
    }
    /* 已牵的线（直线 —— spec 风险① 二选一里选的这条） */
    for (i = 0; i < links.length; i++) {
      var L2 = links[i];
      L2.a = Math.min(1, (L2.a || 0) + .08);
      ctx.beginPath();
      ctx.moveTo(L2.sx, L2.sy);
      ctx.lineTo(L2.tx, L2.ty);
      ctx.strokeStyle = L2.bad ? 'rgba(255,122,107,' + (.55 + L2.a * .45).toFixed(3) + ')'
                                : 'rgba(232,201,138,' + (.35 + L2.a * .5).toFixed(3) + ')';
      ctx.lineWidth = L2.bad ? 2.4 : 1.6;
      ctx.stroke();
    }
    /* 预览线 */
    if (drag && preview) {
      var s0 = srcs[drag.i];
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(preview.x, preview.y);
      ctx.strokeStyle = preview.warn ? WARN : 'rgba(255,236,200,.85)';
      ctx.lineWidth = preview.warn ? 2.6 : 1.8;
      ctx.stroke();
      if (preview.warn) {
        ctx.beginPath();
        ctx.arc(preview.x, preview.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,122,107,.85)';
        ctx.fill();
      }
    }
    /* 因（左） */
    for (i = 0; i < srcs.length; i++) {
      var s = srcs[i];
      var pulse = 1 + Math.sin(t * 2.2 + s.glow) * .12;
      if (s.used) {
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,201,138,.35)'; ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(s.x, s.y, 26 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,201,138,.07)'; ctx.fill();
        ctx.beginPath(); ctx.arc(s.x, s.y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,236,200,.95)'; ctx.fill();
      }
    }
    /* 果（右） */
    for (i = 0; i < tgts.length; i++) {
      var q = tgts[i];
      ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = q.used ? 'rgba(157,143,208,.30)' : 'rgba(157,143,208,.85)';
      ctx.lineWidth = 1.6; ctx.stroke();
      if (!q.used) { ctx.beginPath(); ctx.arc(q.x, q.y, 2.4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(157,143,208,.8)'; ctx.fill(); }
    }
    /* 浮出的那句话 */
    for (i = flashes.length - 1; i >= 0; i--) {
      var f = flashes[i];
      f.life -= .012;
      if (f.life <= 0) { flashes.splice(i, 1); continue; }
      ctx.font = '12px -apple-system,PingFang SC,Microsoft YaHei,sans-serif';
      ctx.fillStyle = 'rgba(255,236,200,' + (f.life * .9).toFixed(3) + ')';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y - 12 - (1 - f.life) * 14);
    }
  }

  function loop() {
    if (!running) { raf = 0; return; }
    var now = performance.now();
    /* ⚠ 契约第 12 条：dt 必须钳 —— 切后台再回前台那一下不钳，点会瞬移 */
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    draw();
    raf = requestAnimationFrame(loop);
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
      '  <div class="apo-col">',
      '    <div class="apo-head">第 <b id="apoLev">1</b> 关 · 定下 <b id="apoCount">0</b> 个结局 · 最佳 <b id="apoBest">0</b></div>',
      '    <div class="apo-msg" id="apoMsg">从左边牵一条线到右边。</div>',
      '    <canvas class="apo-canvas" id="apoCanvas" width="340" height="420" aria-label="戒律：因果连线" role="img"></canvas>',
      '    <div class="apo-row"><button class="apo-btn" id="apoAgain" type="button">再来一次</button></div>',
      '  </div>',
      '</div>',
    ].join('\n');
    document.body.appendChild(overlay);
    canvas = overlay.querySelector('#apoCanvas');
    ctx = canvas.getContext('2d');
    levEl = overlay.querySelector('#apoLev');
    countEl = overlay.querySelector('#apoCount');
    bestEl = overlay.querySelector('#apoBest');
    msgEl = overlay.querySelector('#apoMsg');
    overlay.querySelector('#apoClose').addEventListener('click', close);
    overlay.querySelector('#apoAgain').addEventListener('click', start);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', function () { drag = null; preview = null; });
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp);
    canvas.addEventListener('touchcancel', function () { drag = null; preview = null; });
  }

  function mount(el) {
    host = el;
    injectStyle();
    host.innerHTML = '';
    var card = document.createElement('div');
    card.className = 'game-card';
    var a = document.createElement('div'); a.className = 'game-card-title'; a.textContent = API.title;
    var b = document.createElement('div'); b.className = 'game-card-hint'; b.textContent = API.hint;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'game-card-start';
    btn.textContent = '牵一根';
    btn.addEventListener('click', open);
    card.appendChild(a); card.appendChild(b); card.appendChild(btn);
    host.appendChild(card);
    ensureOverlay();
    return card;
  }

  function close() {
    if (Date.now() - openedAt < CLOSE_GUARD_MS) return;
    running = false; raf = 0; drag = null; preview = null;
    if (overlay) { overlay.classList.remove('on'); overlay.setAttribute('aria-hidden', 'true'); }
  }

  function open() {
    ensureOverlay();
    overlay.classList.add('on');
    overlay.setAttribute('aria-hidden', 'false');
    openedAt = Date.now();
    start();
  }

  var API = {
    title: '戒律',
    hint: '左边是「因」，右边是「果」—— 按住拖一条线把它们牵起来。**松手就算定了，不能反悔**；而且线之间**不许交叉**。',
    mount: mount,
    open: open
  };
  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.aponia = API;
})(window);