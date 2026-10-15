/* assets/games/kalpas.js — 千劫（Ⅵ · 鏖灭）：《鏖灭》
 *
 * 判据：这个玩法 ＝ 他的哪一句？—— **烧的是别人，也是自己；什么时候收手，只有他自己知道。**
 * ⇒ 风险取舍（push your luck）：每拳都烧自己的火，打得越狠连击越高 —— **收手**是你唯一要做的决定。
 *
 * 数值照 spec §2.4 定稿：火 100 起、每拳 −3.5、伤害 10×(1+0.15×连击)、连击上限 8（倍率 ≈2.2×）、
 * 每秒最多记 6 拳；**头 3 拳不烧火**（教学：先让人看懂两条火条的方向）。
 * 结束语（照契约第 11 条，一句话 + 一个数字）：
 *   收手 ⇒「你替他决定了什么时候收手。　　留下 N 点伤害。」
 *   火尽 ⇒「这一次，他烧到了最后一刻。　　留下 0 点伤害。」
 *
 * ⚠ **契约第 14 条专为这一款立的**：游戏内第二个键（「收手」）要 ——
 *   ① 离玩家操作面（画布）≥ **100px**：靠 `.kal-spacer`(min-height:100px) 顶开，
 *      并且画布宽度里那项 `calc((100dvh - 250px) * 0.68)` 就是为了**短屏也留得出这 100px**；
 *   ② 开局 **150ms** 内忽略（连点屏幕时手指落偏不会提前入账）。实测值记在 HANDOVER。
 *
 * 手机优先：DPR 限 2、背景预渲染、遮罩不用 backdrop-filter、点触面 ⇒ 退出键 100px 口径。
 * 减动偏好：屏幕抖动完全关掉，只保留颜色变化（WCAG 2.3.1）。
 */
(function (global) {
  'use strict';
  var GUARD = 400, BANNER_IGNORE = 150, openedAt = 0;
  var VW = 340, VH = 500;
  var FIRE0 = 100, COST = 3.5, FREE_PUNCH = 3;
  var BASE = 10, PER = 0.15, COMBO_CAP = 8, MAXRATE = 6;
  var STYLE = ".game-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:14px;padding:1.6rem 1.4rem;text-align:center;max-width:26rem;margin:0 auto}\n.game-card-title{font-size:1.15rem;letter-spacing:.14em;color:#ff6b35;margin-bottom:.5rem;font-weight:400}\n.game-card-hint{font-size:.82rem;line-height:1.9;color:var(--text-dim);margin-bottom:1.1rem;font-weight:300}\n.game-card-start{appearance:none;cursor:pointer;font:inherit;font-size:.85rem;letter-spacing:.14em;color:#0c0503;background:#ff6b35;border:none;border-radius:999px;padding:.66rem 2rem;min-height:48px}\n.kal-stage{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;background:rgba(12,5,3,.97);padding:max(.5rem,env(safe-area-inset-top)) .8rem max(.5rem,env(safe-area-inset-bottom))}\n.kal-stage.on{display:flex}\n.kal-box{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;max-width:460px;height:100%;gap:.4rem}\n.kal-head{display:flex;gap:.55rem;flex-wrap:nowrap;justify-content:center;font-size:.76rem;letter-spacing:.03em;color:var(--text-dim);font-weight:300;white-space:nowrap}\n.kal-head b{color:#ff6b35;font-weight:400;font-size:.9rem}\n.kal-msg{font-size:.84rem;letter-spacing:.04em;color:#ffd9c4;min-height:1.5em;font-weight:300;text-align:center;max-width:22rem}\n/* ⚠ 宽度里那一项 calc((100dvh - 250px) * 0.68)：短屏时按高度反推宽度，\n   目的是**保证「收手」键离画布 ≥100px**（契约第 14 条）—— 不要改成 max-height，那会破坏固有比例 */\n/* ⚠ 340px 的预留 = 收起键(~57) + 100 + 100 + 底部两个键(~60) + 留白 ⇒ 保证画布与两个键都 ≥100px */\n.kal-canvas{width:min(100vw - 1.6rem,420px,calc((100dvh - 340px) * 0.68));height:auto;aspect-ratio:340/500;border-radius:14px;box-shadow:0 0 0 1px var(--glass-border);touch-action:manipulation;display:block;user-select:none}\n.kal-spacer{flex:1 1 auto;min-height:100px}\n.kal-bank{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(.9rem + env(safe-area-inset-bottom));appearance:none;cursor:pointer;font:inherit;font-size:1rem;letter-spacing:.2em;min-height:56px;width:min(100% - 1.6rem,320px);color:#0c0503;background:linear-gradient(180deg,#ff8a4c,#ff5a1f);border:none;border-radius:14px;font-weight:500;box-shadow:0 6px 20px rgba(255,90,31,.28)}\n.kal-bank:active{transform:translateY(1px)}\n.kal-btn{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(5.4rem + env(safe-area-inset-bottom));appearance:none;cursor:pointer;font:inherit;font-size:.8rem;letter-spacing:.12em;min-height:40px;color:var(--text);background:transparent;border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.5rem}\n.kal-close{position:fixed;top:calc(.8rem + env(safe-area-inset-top));right:.8rem;appearance:none;cursor:pointer;font:inherit;font-size:.78rem;letter-spacing:.12em;color:var(--text-dim);background:rgba(12,5,3,.7);border:1px solid var(--glass-border2);border-radius:999px;padding:.55rem 1.15rem;min-height:44px}\n@media (max-height:560px) and (orientation:landscape){\n  .kal-box{flex-direction:row;align-items:center;justify-content:center;max-width:900px;gap:1.4rem;height:auto}\n  .kal-canvas{width:auto;height:min(76vh,430px)}\n  .kal-spacer{display:none}\n}";
  function injectStyle() {
    if (document.getElementById('kal-game-style')) return;
    var st = document.createElement('style');
    st.id = 'kal-game-style'; st.textContent = STYLE; document.head.appendChild(st);
  }
  var host = null, overlay = null, canvas = null, ctx = null, bg = null, bankBtn = null;
  var fireEl = null, comboEl = null, multEl = null, dmgEl = null, bestEl = null, msgEl = null;
  var running = false, raf = 0, last = 0, t = 0;
  var fire = FIRE0, combo = 0, dmg = 0, banked = 0, best = 0, punches = 0, over = false;
  var sparks = [], shake = 0, motes = [], lastPunchT = -9;
  try { best = parseInt(localStorage.getItem('elysia:kalpas:best') || '0', 10) || 0; } catch (e) { best = 0; }
  function setMsg(s) { if (msgEl) msgEl.textContent = s; }
  function mult() { return 1 + PER * Math.min(combo, COMBO_CAP); }
  function setHud() {
    if (fireEl) fireEl.textContent = String(Math.max(0, Math.round(fire * 10) / 10));
    if (comboEl) comboEl.textContent = String(combo);
    if (multEl) multEl.textContent = mult().toFixed(1) + '×';
    if (dmgEl) dmgEl.textContent = String(Math.round(dmg));
    if (bestEl) bestEl.textContent = String(best);
    if (bankBtn) bankBtn.textContent = '收手 —— 留下 ' + Math.round(dmg) + ' 点伤害';
  }
  function reset() {
    fire = FIRE0; combo = 0; dmg = 0; banked = 0; punches = 0; over = false; t = 0; shake = 0;
    sparks = []; motes = [];
    for (var i = 0; i < 26; i++) motes.push({ x: Math.random() * VW, y: Math.random() * VH, r: .6 + Math.random() * 1.6, vy: -18 - Math.random() * 30, a: .08 + Math.random() * .3 });
    setHud(); setMsg('点火 —— 头三拳不烧自己的火。打得越狠烧得越快，什么时候收手，你说了算。');
    running = true; last = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function punch() {
    if (!running || over) return;
    if (t - lastPunchT < 1 / MAXRATE) return;
    lastPunchT = t;
    punches++;
    combo++;
    dmg += BASE * mult();
    if (punches > FREE_PUNCH) fire -= COST;
    sparks.push({ x: VW * (.28 + Math.random() * .44), y: VH * (.34 + Math.random() * .28), life: 1, r: 18 + Math.random() * 26 });
    shake = Math.min(6, shake + 1.6);
    setHud();
    if (fire <= 0) { fire = 0; finish('burn'); return; }
  }
  function bank() {
    if (!running || over) return;
    if (Date.now() - openedAt < BANNER_IGNORE) return;
    finish('bank');
  }
  function finish(kind) {
    running = false; over = true;
    var n = kind === 'bank' ? Math.round(dmg) : 0;
    if (kind === 'bank') { banked = n; if (n > best) { best = n; try { localStorage.setItem('elysia:kalpas:best', String(best)); } catch (e) {} } }
    setMsg(kind === 'bank' ? '你替他决定了什么时候收手。　　留下 ' + n + ' 点伤害。' : '这一次，他烧到了最后一刻。　　留下 0 点伤害。');
    if (msgEl) msgEl.setAttribute('data-end', kind);
    setHud(); draw(); raf = 0;
  }
  function makeBg(w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    var lin = g.createLinearGradient(0, 0, 0, h);
    lin.addColorStop(0, '#1a0a04'); lin.addColorStop(.55, '#0c0503'); lin.addColorStop(1, '#080302');
    g.fillStyle = lin; g.fillRect(0, 0, w, h);
    var rad = g.createRadialGradient(w / 2, h * .92, 8, w / 2, h * .92, w * .9);
    rad.addColorStop(0, 'rgba(255,107,53,.16)'); rad.addColorStop(1, 'rgba(12,5,3,0)');
    g.fillStyle = rad; g.fillRect(0, 0, w, h);
    return c;
  }
  function draw() {
    var s = canvas.width / VW, i;
    var heat = 1 - fire / FIRE0;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, VW, VH);
    if (bg) ctx.drawImage(bg, 0, 0, VW, VH);
    /* 屏幕边缘随火势泛红（越接近崩落越红）—— 减动偏好下只变色不抖 */
    if (heat > 0.02) {
      var eg = ctx.createRadialGradient(VW / 2, VH / 2, VW * .34, VW / 2, VH / 2, VW * .78);
      eg.addColorStop(0, 'rgba(255,59,48,0)');
      eg.addColorStop(1, 'rgba(255,59,48,' + (heat * 0.42).toFixed(3) + ')');
      ctx.fillStyle = eg; ctx.fillRect(0, 0, VW, VH);
    }
    for (i = 0; i < motes.length; i++) {
      var m = motes[i];
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.284);
      ctx.fillStyle = 'rgba(255,140,80,' + (m.a * (0.4 + heat)).toFixed(3) + ')'; ctx.fill();
    }
    for (i = sparks.length - 1; i >= 0; i--) {
      var k = sparks[i]; k.life -= .05;
      if (k.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.beginPath(); ctx.arc(k.x, k.y, k.r * (1.3 - k.life), 0, 6.284);
      ctx.strokeStyle = 'rgba(255,' + Math.round(120 + 110 * k.life) + ',60,' + (k.life * .85).toFixed(3) + ')';
      ctx.lineWidth = 2.6; ctx.stroke();
    }
    /* 他的火（一条竖着的火柱，越烧越短） */
    var bw = 26, bh = VH * 0.62, bx = VW / 2 - bw / 2, by0 = VH * 0.78;
    ctx.fillStyle = 'rgba(255,107,53,.10)';
    ctx.fillRect(bx, by0 - bh, bw, bh);
    var fh = bh * (fire / FIRE0);
    var fg = ctx.createLinearGradient(0, by0 - fh, 0, by0);
    fg.addColorStop(0, 'rgba(255,209,102,.95)'); fg.addColorStop(1, 'rgba(255,59,48,.85)');
    ctx.fillStyle = fg;
    ctx.fillRect(bx, by0 - fh, bw, fh);
    ctx.font = '12px -apple-system,PingFang SC,Microsoft YaHei,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,217,196,.7)';
    ctx.fillText('他的火', VW / 2, by0 + 18);
  }
  function loop() {
    if (!running) { raf = 0; return; }
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt;
    var i;
    for (i = 0; i < motes.length; i++) { var m = motes[i]; m.y += m.vy * dt; if (m.y < -6) { m.y = VH + 6; m.x = Math.random() * VW; } }
    /* 连击衰减：1.2 秒不出拳就断连 */
    if (combo > 0 && t - lastPunchT > 1.2) { combo = 0; setHud(); }
    if (shake > 0.05) {
      if (!global.matchMedia || !global.matchMedia('(prefers-reduced-motion: reduce)').matches) shake *= 0.9;
      else shake = 0;
    }
    draw();
    raf = requestAnimationFrame(loop);
  }
  function onDown(e) { if (running && !over) { if (e.cancelable) e.preventDefault(); punch(); } }
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
    overlay.className = 'kal-stage';
    overlay.id = 'kalpasGameOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="kal-box">',
      '  <button class="kal-close" id="kalpasClose" type="button">收起</button>',
      '  <div class="kal-head">他的火 <b id="kalFire">100</b> · 连击 <b id="kalCombo">0</b> · 倍率 <b id="kalMult">1.0×</b> · 本局 <b id="kalDmg">0</b> · 最佳 <b id="kalBest">0</b></div>',
      '  <div class="kal-msg" id="kalMsg">点火。</div>',
      '  <canvas class="kal-canvas" id="kalpasCanvas" width="340" height="500" aria-label="鏖灭：出拳与收手" role="img"></canvas>',
      '  <button class="kal-bank" id="kalBank" type="button">收手</button>',
      '  <button class="kal-btn" id="kalAgain" type="button">再来一次</button>',
      '</div>',
    ].join('\n');
    document.body.appendChild(overlay);
    canvas = overlay.querySelector('#kalpasCanvas');
    ctx = canvas.getContext('2d');
    fireEl = overlay.querySelector('#kalFire');
    comboEl = overlay.querySelector('#kalCombo');
    multEl = overlay.querySelector('#kalMult');
    dmgEl = overlay.querySelector('#kalDmg');
    bestEl = overlay.querySelector('#kalBest');
    msgEl = overlay.querySelector('#kalMsg');
    bankBtn = overlay.querySelector('#kalBank');
    overlay.querySelector('#kalpasClose').addEventListener('click', close);
    bankBtn.addEventListener('click', bank);
    overlay.querySelector('#kalAgain').addEventListener('click', function () { reset(); });
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
    btn.type = 'button'; btn.className = 'game-card-start'; btn.textContent = '点火';
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
    title: '鏖灭',
    hint: '点火之后，点屏幕就是出拳 —— 打得越狠连击越高，但**每一拳都在烧你自己的火**。什么时候收手，只有你说了算：收手就把伤害留下，火尽就一点不剩。',
    mount: mount, open: open,
    __punch: function () { punch(); },
    __bank: function () { bank(); },
    __state: function () {
      var gap = null;
      if (canvas && bankBtn) {
        var cr = canvas.getBoundingClientRect(), br = bankBtn.getBoundingClientRect();
        gap = Math.round(br.top - cr.bottom);
      }
      return { fire: Math.round(fire * 10) / 10, combo: combo, mult: Math.round(mult() * 100) / 100, dmg: Math.round(dmg), banked: banked,
        punches: punches, over: over, t: Math.round(t * 10) / 10, gapToBank: gap,
        css: canvas ? Math.round(canvas.getBoundingClientRect().width) + 'x' + Math.round(canvas.getBoundingClientRect().height) : null };
    }
  };
  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.kalpas = API;
})(window);