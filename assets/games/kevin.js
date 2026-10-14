/* assets/games/kevin.js — 凯文（Ⅰ · 救世）的小游戏：《五万年》
 *
 * ── 为什么是这个玩法（2026-10-15 重做）────────────────────────────────
 * ⚠ 第一版是《碎冰》：冰棱窜出来、拖着横扫斩碎。**它被否掉了** —— 需求方的原话是
 *   「游戏意义不明」：那只是「冰 + 剑」的皮，**跟凯文这个人没有关系**。
 *   跟樱的「一瞬」（刻印「刹那」＝时机）、科斯魔的「守灯」（他要做的不是成为光、
 *   而是在夜里守住它）一比就露馅了：别人那个玩法**本身就是那句话**。
 *
 * 那凯文那句话是什么？——
 *   「在燃尽的大地上，我向她，向所有人许下承诺 —— **无论付出多少代价**，
 *     人类，一定会战胜崩坏。」
 *   他一生的形状就是这一句：**他把自己烧掉，换人类的时间**。五万年，一个人扛。
 *
 * 所以玩法就是这句话的字面转写：
 *   · 画布上半边是**寒潮**（冰、黑），下半边是**人间**（灯火），中间那条线顶着它们；
 *   · **按住屏幕 = 烧掉你自己的年岁**，把寒潮顶回天上去；松手它就往下压；
 *   · 顶得越高，**人间**攒得越快；你的年岁却是**只减不增**的；
 *   · 你一共只有 **50,000 年** —— 烧完 / 让寒潮压到人间，就结束了。
 * 结局给的不是「你赢了多少分」，而是**你用自己换来了多少年**。
 *
 * ⚠ 契约（spec §4.5）：挂 `window.ElysiaGames.kevin`，带 `title` / `hint` / `mount(host)`；
 *   卡里 `.game-card-title` / `.game-card-hint` 必须与 `title` / `hint` **逐字一致**。
 * ⚠ 遮罩**必须在 mount() 时就建好**（默认 `aria-hidden="true"`、不带 `.on`）——
 *   断言 ① 第一件事就是查这个。
 * ⚠ 退出键 400ms 保护期；画面从第一帧就在动（飘雪 + 心跳般的暖光）。
 * ⚠ 全程 rAF，不依赖 CSS 动画 ⇒ 减动偏好下照常能玩。
 * ⚠ 画布边框用 `box-shadow` 画：`aspect-ratio` 算的是边框盒、断言量的是内容盒，
 *   留 1px 边框会差 ~1px 被判「拉扁」（第一版就栽在这儿）。
 */
(function (global) {
  'use strict';

  var CLOSE_GUARD_MS = 400;
  var openedAt = 0;
  var CW = 340, CH = 420;
  var TOP = 56;          // 寒潮能顶到的最上面（顶到头就几乎没威胁了）
  var BOTTOM = 366;      // 人间那条线；寒潮压到这儿 = 世界冰封
  var MY_YEARS = 50000;  // 你一共只有五万年
  var BURN = 1500;       // 按住时每秒烧掉的年岁
  var PUSH = 108;        // 按住时每秒把线往上顶多少像素

  var STYLE = ".game-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:14px;padding:1.6rem 1.4rem;text-align:center;max-width:26rem;margin:0 auto}\n.game-card-title{font-size:1.15rem;letter-spacing:.14em;color:#cfe6ff;margin-bottom:.5rem;font-weight:400}\n.game-card-hint{font-size:.82rem;line-height:1.9;color:var(--text-dim);margin-bottom:1.1rem;font-weight:300}\n.game-card-start{appearance:none;cursor:pointer;font:inherit;font-size:.85rem;letter-spacing:.14em;color:#06121e;background:#cfe6ff;border:none;border-radius:999px;padding:.62rem 1.9rem;min-height:44px;transition:transform .25s ease,box-shadow .25s ease}\n.game-card-start:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(207,230,255,.28)}\n.kv-stage{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;background:rgba(3,8,15,.95);backdrop-filter:blur(6px);padding:1.2rem}\n.kv-stage.on{display:flex}\n.kv-box{position:relative;display:flex;flex-direction:column;align-items:center;gap:.6rem;width:100%;max-width:460px}\n.kv-col{display:flex;flex-direction:column;align-items:center;gap:.5rem}\n.kv-head{font-size:.8rem;letter-spacing:.14em;color:var(--text-dim);font-weight:300;display:flex;gap:1rem;flex-wrap:wrap;justify-content:center}\n.kv-head b{font-weight:400;font-size:.95rem}\n.kv-mine b{color:#ffd9a0}\n.kv-theirs b{color:#cfe6ff}\n.kv-msg{font-size:.88rem;letter-spacing:.08em;color:#e8f4ff;min-height:1.6em;font-weight:300;text-align:center;max-width:22rem}\n.kv-canvas{width:min(340px,84vw);height:auto;aspect-ratio:340/420;border-radius:16px;box-shadow:0 0 0 1px var(--glass-border);touch-action:none;display:block;cursor:pointer;user-select:none}\n.kv-row{display:flex;gap:.8rem;justify-content:center;flex-wrap:wrap}\n.kv-btn{appearance:none;cursor:pointer;font:inherit;font-size:.82rem;letter-spacing:.12em;min-height:44px;color:var(--text);background:transparent;border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.4rem}\n.kv-btn:hover{border-color:#cfe6ff;color:#cfe6ff}\n/* ⚠ 收起固定在**右上角** —— 断言 ③ 要求退出键离操作区 ≥100px（画布是按住不放的面，按严的算） */\n.kv-close{position:fixed;top:calc(1rem + env(safe-area-inset-top));right:1rem;appearance:none;cursor:pointer;font:inherit;font-size:.78rem;letter-spacing:.12em;color:var(--text-dim);background:rgba(3,8,15,.6);border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.1rem;min-height:40px}\n.kv-close:hover{color:#cfe6ff;border-color:#cfe6ff}\n/* ⚠ 横屏塞不下（遮罩 fixed、没有滚动条）—— 左右两栏 + 画布按 vh 缩 */\n@media (max-height:520px) and (orientation:landscape){\n  .kv-box{flex-direction:row;align-items:center;justify-content:center;max-width:780px;gap:1.4rem}\n  .kv-canvas{width:auto;height:min(70vh,300px)}\n}";

  function injectStyle() {
    if (document.getElementById('kv-game-style')) return;
    var s = document.createElement('style');
    s.id = 'kv-game-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  var host = null, overlay = null, canvas = null, ctx = null;
  var mineEl = null, theirsEl = null, msgEl = null;
  var running = false, raf = 0, last = 0;
  var myYears = MY_YEARS, human = 0, line = 300, holding = false;
  var flakes = [], t = 0, ending = '';

  function makeFlakes() {
    flakes = [];
    for (var i = 0; i < 30; i++) {
      flakes.push({ x: Math.random() * CW, y: Math.random() * CH, r: 0.6 + Math.random() * 1.8,
                    vy: 0.25 + Math.random() * 0.7, vx: (Math.random() - 0.5) * 0.2,
                    a: 0.12 + Math.random() * 0.38 });
    }
  }

  function pressure() {
    /* ⚠ 寒潮不是匀速的：越到后面越凶（`t` 是秒）。玩家能感觉到「它一波一波地来」。 */
    var ramp = 6 + Math.min(30, t * 0.9);
    return ramp + Math.sin(t * 0.8) * 5 + Math.sin(t * 2.3) * 3;
  }

  function start() {
    myYears = MY_YEARS;
    human = 0;
    line = 300;
    t = 0;
    holding = false;
    ending = '';
    makeFlakes();
    running = true;
    last = performance.now();
    if (mineEl) mineEl.textContent = '50,000';
    if (theirsEl) theirsEl.textContent = '0';
    if (msgEl) msgEl.textContent = '寒潮在往下压 —— 按住屏幕，烧你自己的年岁，把它顶回去。';
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function fmt(n) { return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    /* 人间：一条暖光带 */
    var hg = ctx.createLinearGradient(0, BOTTOM - 90, 0, CH);
    hg.addColorStop(0, 'rgba(255,214,150,0.03)');
    hg.addColorStop(1, 'rgba(255,214,150,0.22)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, BOTTOM - 90, CW, CH - (BOTTOM - 90));
    /* 寒潮：从顶上压下来，压到哪画到哪 */
    var cg = ctx.createLinearGradient(0, 0, 0, line);
    cg.addColorStop(0, 'rgba(24,48,78,0.96)');
    cg.addColorStop(0.75, 'rgba(46,86,126,0.90)');
    cg.addColorStop(1, 'rgba(120,170,215,0.75)');
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(CW, 0);
    ctx.lineTo(CW, line);
    for (var x = CW; x >= 0; x -= 17) {
      var jag = Math.sin((x + t * 26) * 0.09) * 5 + Math.sin((x + t * 11) * 0.21) * 3;
      ctx.lineTo(x, line + jag);
    }
    ctx.closePath();
    ctx.fillStyle = cg;
    ctx.fill();
    /* 那条线：亮一道冷光 */
    ctx.beginPath();
    ctx.moveTo(0, line);
    for (var x2 = 0; x2 <= CW; x2 += 17) {
      ctx.lineTo(x2, line + Math.sin((x2 + t * 26) * 0.09) * 5);
    }
    ctx.strokeStyle = 'rgba(220,240,255,' + (holding ? 0.95 : 0.5) + ')';
    ctx.lineWidth = holding ? 2.5 : 1.5;
    ctx.stroke();
    /* 他：线中间一个小小的、发着暖光的人形 —— 他就是在撑这条线 */
    var cx = CW / 2;
    var pulse = 1 + Math.sin(t * 3.4) * 0.12;
    var rg = ctx.createRadialGradient(cx, line - 6, 2, cx, line - 6, 46 * pulse);
    rg.addColorStop(0, 'rgba(255,224,170,' + (holding ? 0.55 : 0.28) + ')');
    rg.addColorStop(1, 'rgba(255,224,170,0)');
    ctx.beginPath();
    ctx.arc(cx, line - 6, 46 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,236,200,.92)';
    ctx.fillRect(cx - 2, line - 16, 4, 14);
    ctx.beginPath();
    ctx.arc(cx, line - 20, 3.4, 0, Math.PI * 2);
    ctx.fill();
    /* 人间的灯火（越安全越亮） */
    var safe = (BOTTOM - line) / (BOTTOM - TOP);
    for (var k = 0; k < 9; k++) {
      var lx = 26 + k * ((CW - 52) / 8);
      var ly = BOTTOM + 16 + Math.sin(k * 1.7) * 6;
      ctx.beginPath();
      ctx.arc(lx, ly, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,214,150,' + (0.25 + safe * 0.6).toFixed(3) + ')';
      ctx.fill();
    }
    /* 雪 */
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.x += f.vx; f.y += f.vy;
      if (f.y > CH) { f.y = -4; f.x = Math.random() * CW; }
      if (f.x < -4) f.x = CW + 4;
      if (f.x > CW + 4) f.x = -4;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(226,240,255,' + f.a.toFixed(3) + ')';
      ctx.fill();
    }
  }

  function loop() {
    if (!running) { raf = 0; return; }
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    if (holding) {
      line -= PUSH * dt;
      myYears -= BURN * dt;
    } else {
      line += pressure() * dt;
    }
    if (line < TOP) line = TOP;
    if (line > BOTTOM) line = BOTTOM;
    var safe = (BOTTOM - line) / (BOTTOM - TOP);
    human += safe * 62 * dt;          // 顶着多久，人间就攒多久
    if (mineEl) mineEl.textContent = fmt(myYears);
    if (theirsEl) theirsEl.textContent = fmt(human);
    if (myYears <= 0) { finish('你的年岁，烧完了。'); return; }
    if (line >= BOTTOM) { finish('寒潮压到了人间。'); return; }
    draw();
    raf = requestAnimationFrame(loop);
  }

  function finish(why) {
    running = false;
    raf = 0;
    holding = false;
    ending = why;
    if (mineEl) mineEl.textContent = fmt(Math.max(0, myYears));
    if (theirsEl) theirsEl.textContent = fmt(human);
    if (msgEl) msgEl.textContent = why + '　　你给人类留下了 ' + fmt(human) + ' 年。';
    draw();
  }

  function onDown(e) {
    if (!running) return;
    if (e.cancelable) e.preventDefault();
    holding = true;
  }
  function onUp() { holding = false; }

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
      '    <div class="kv-head"><span class="kv-mine">你的年岁 <b id="kvMine">50,000</b></span><span class="kv-theirs">人间 <b id="kvTheirs">0</b> 年</span></div>',
      '    <div class="kv-msg" id="kvMsg">寒潮在往下压 —— 按住屏幕，烧你自己的年岁，把它顶回去。</div>',
      '    <canvas class="kv-canvas" id="kvCanvas" width="340" height="420" aria-label="五万年：寒潮与人间" role="img"></canvas>',
      '    <div class="kv-row"><button class="kv-btn" id="kvAgain" type="button">再来一次</button></div>',
      '  </div>',
      '</div>',
    ].join('\n');
    document.body.appendChild(overlay);
    canvas = overlay.querySelector('#kvCanvas');
    ctx = canvas.getContext('2d');
    mineEl = overlay.querySelector('#kvMine');
    theirsEl = overlay.querySelector('#kvTheirs');
    msgEl = overlay.querySelector('#kvMsg');
    overlay.querySelector('#kvClose').addEventListener('click', close);
    overlay.querySelector('#kvAgain').addEventListener('click', start);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchend', onUp);
    canvas.addEventListener('touchcancel', onUp);
  }

  function mount(el) {
    host = el;
    injectStyle();
    host.innerHTML = '';
    var card = document.createElement('div');
    card.className = 'game-card';
    var t2 = document.createElement('div'); t2.className = 'game-card-title'; t2.textContent = API.title;
    var h = document.createElement('div'); h.className = 'game-card-hint'; h.textContent = API.hint;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'game-card-start';
    btn.textContent = '撑住';
    btn.addEventListener('click', open);
    card.appendChild(t2); card.appendChild(h); card.appendChild(btn);
    host.appendChild(card);
    ensureOverlay();
    return card;
  }

  function close() {
    if (Date.now() - openedAt < CLOSE_GUARD_MS) return;
    running = false; raf = 0; holding = false;
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
    title: '五万年',
    hint: '寒潮从天上一直往下压，人间在下头。按住屏幕 —— 烧掉你自己的年岁，把它顶回天上；顶得越高，人间攒下的时间越多。你一共只有五万年。',
    mount: mount,
    open: open
  };
  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.kevin = API;
})(window);