/* assets/games/eden.js — 伊甸（Ⅳ · 黄金）的小游戏：《和声》
 *
 * ── 为什么是这个玩法 ────────────────────────────────────────────────
 * 她的那一句：**美好的东西会走音、会散 —— 她要做的，是把它调回该在的地方。**
 * 玩法就是这句话的字面转写：一条在飘的音准线（她的歌声），你拖着自己的声部**一直跟着它**。
 * 全站八个玩法里没有一个需要「持续微调、跟住一个会跑的目标」—— 手要一直放在上面。
 *
 * ── 与 spec 的对应（docs/superpowers/specs/2026-10-15-four-games-design.md §2.2）
 * · 视觉偏移 **只偏一次**：手指挡画面 ⇒ 声部线画在手指上方 ~40px，**输入映射到那条线上**（别偏两遍）。
 * · 走音 = 偏离 **> ±30px** 且**持续 > 600ms**（短滑/抖一下**原谅**）；满 **5** 次结束。
 * · **45 秒歌尽**是**正面**收尾（她唱完了），不是超时判负。
 * · 走音反馈**不只靠变红**（色觉障碍）：同时把光带**亮度掉一档**，并让两条线**分开可见**。
 * · 教学：前 8 秒歌速 ≈ 一秒走完半个画布高、摆幅 < 10px。
 * · **破例配音**（2026-10-15 需求方拍板）：一个「乐句」完成时响一声很轻的和弦 ——
 *   与 `eden/index.html` 里「她的歌」同款（主音 + 三度 + 五度、缓慢衰减、低增益、手势触发、零音频文件）。
 *   其余三款游戏不配音，界线不变。
 * · 契约：`dt` 钳制（第 12 条）、结局只说一件事（第 11 条）、best 进 `localStorage['elysia:eden:best']`。
 */
(function (global) {
  'use strict';

  var CLOSE_GUARD_MS = 400;
  var openedAt = 0;
  var CW = 340, CH = 420;
  var DURATION = 45;            // 歌长（秒）—— 唱完是正面收尾
  var NEAR = 26;                // 「贴着」的判定（px）
  var FAR = 30;                 // 超过它才算「偏了」（px，spec 的 ±30px）
  var FAR_MS = 0.6;             // 偏了要**持续**这么久才记一次走音（短滑原谅）
  var MAX_SLIP = 5;             // 走音满 5 次，歌就散了
  var OFFSET = 40;              // 视觉偏移：线画在手指上方（只偏一次）
  var PHRASE_S = 3;             // 贴满 3 秒 = 一个乐句
  var TEACH_S = 8;              // 前 8 秒是教学：慢、近平
  var CAP_AMP = 74, CAP_SPD = 1.55;

  var STYLE = ".game-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:14px;padding:1.6rem 1.4rem;text-align:center;max-width:26rem;margin:0 auto}\n.game-card-title{font-size:1.15rem;letter-spacing:.14em;color:var(--gold);margin-bottom:.5rem;font-weight:400}\n.game-card-hint{font-size:.82rem;line-height:1.9;color:var(--text-dim);margin-bottom:1.1rem;font-weight:300}\n.game-card-start{appearance:none;cursor:pointer;font:inherit;font-size:.85rem;letter-spacing:.14em;color:#0a0608;background:var(--gold);border:none;border-radius:999px;padding:.62rem 1.9rem;min-height:44px;transition:transform .25s ease,box-shadow .25s ease}\n.game-card-start:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(255,209,102,.28)}\n.eden-stage{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;background:rgba(10,6,8,.95);backdrop-filter:blur(6px);padding:1.2rem}\n.eden-stage.on{display:flex}\n.eden-box{position:relative;display:flex;flex-direction:column;align-items:center;gap:.6rem;width:100%;max-width:460px}\n.eden-col{display:flex;flex-direction:column;align-items:center;gap:.5rem}\n.eden-head{font-size:.8rem;letter-spacing:.14em;color:var(--text-dim);font-weight:300;display:flex;gap:1rem;flex-wrap:wrap;justify-content:center}\n.eden-head b{color:var(--gold);font-weight:400;font-size:.95rem}\n.eden-msg{font-size:.88rem;letter-spacing:.06em;color:#ffe9b8;min-height:1.6em;font-weight:300;text-align:center;max-width:22rem}\n.eden-canvas{width:min(340px,84vw);height:auto;aspect-ratio:340/420;border-radius:16px;box-shadow:0 0 0 1px var(--glass-border);touch-action:none;display:block;cursor:ns-resize;user-select:none}\n.eden-row{display:flex;gap:.8rem;justify-content:center;flex-wrap:wrap}\n.eden-btn{appearance:none;cursor:pointer;font:inherit;font-size:.82rem;letter-spacing:.12em;min-height:44px;color:var(--text);background:transparent;border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.4rem}\n.eden-btn:hover{border-color:var(--gold);color:var(--gold)}\n/* ⚠ 收起固定右上角：这款是**按住拖的拖动面** ⇒ 按 50px 口径量（GAMES 里 swipe: True） */\n.eden-close{position:fixed;top:calc(1rem + env(safe-area-inset-top));right:1rem;appearance:none;cursor:pointer;font:inherit;font-size:.78rem;letter-spacing:.12em;color:var(--text-dim);background:rgba(10,6,8,.6);border:1px solid var(--glass-border2);border-radius:999px;padding:.5rem 1.1rem;min-height:40px}\n.eden-close:hover{color:var(--gold);border-color:var(--gold)}\n@media (max-height:520px) and (orientation:landscape){\n  .eden-box{flex-direction:row;align-items:center;justify-content:center;max-width:780px;gap:1.4rem}\n  .eden-canvas{width:auto;height:min(70vh,300px)}\n}";

  function injectStyle() {
    if (document.getElementById('eden-game-style')) return;
    var st = document.createElement('style');
    st.id = 'eden-game-style';
    st.textContent = STYLE;
    document.head.appendChild(st);
  }

  var host = null, overlay = null, canvas = null, ctx = null;
  var scoreEl = null, phraseEl = null, slipEl = null, bestEl = null, msgEl = null, timeEl = null;
  var running = false, raf = 0, last = 0, t = 0;
  var score = 0, phrases = 0, slips = 0, best = 0;
  var herY = CH / 2, myY = CH / 2, dragging = false, farMs = 0, nearMs = 0, bright = 1;
  var motes = [], groovePhase = 0, over = false;
  var audioCtx = null;

  try { best = parseInt(localStorage.getItem('elysia:eden:best') || '0', 10) || 0; } catch (e) { best = 0; }

  /* ⚠ 破例配音：与 eden/index.html「她的歌」同款的一小段和弦（主音 + 三度 + 五度，缓慢衰减）。
     只在**一个乐句完成**时响一次 —— 不刷屏、不循环、零音频文件。 */
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
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 261.63 * ratio;          // 中央 C 起
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.055 - i * 0.012, t0 + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(t0 + i * 0.02); osc.stop(t0 + 2.3);
      });
    } catch (e) {}
  }

  function setMsg(s) { if (msgEl) msgEl.textContent = s; }
  function setHud() {
    if (scoreEl) scoreEl.textContent = String(Math.round(score));
    if (phraseEl) phraseEl.textContent = String(phrases);
    if (slipEl) slipEl.textContent = slips + ' / ' + MAX_SLIP;
    if (bestEl) bestEl.textContent = String(best);
    if (timeEl) timeEl.textContent = String(Math.max(0, Math.ceil(DURATION - t)));
  }

  function start() {
    t = 0; score = 0; phrases = 0; slips = 0; farMs = 0; nearMs = 0; bright = 1; over = false;
    herY = CH / 2; myY = CH / 2; dragging = false;
    motes = [];
    for (var i = 0; i < 26; i++) motes.push({ x: Math.random() * CW, y: Math.random() * CH, r: .5 + Math.random() * 1.4, vy: -.05 - Math.random() * .16, a: .07 + Math.random() * .26 });
    setHud();
    setMsg('按住屏幕，跟着那条金线 —— 别让它一个人飘。');
    running = true; last = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  /* 她的歌声：前 8 秒慢而近平（教学），之后加速加幅，但**都有上限** */
  function herAt(tt) {
    var ramp = Math.min(1, Math.max(0, (tt - TEACH_S) / 22));
    var amp = (8 + 66 * ramp) * (1 + Math.sin(tt * 0.33) * 0.12);
    if (amp > CAP_AMP) amp = CAP_AMP;
    var spd = 0.55 + 1.0 * ramp;
    if (spd > CAP_SPD) spd = CAP_SPD;
    return CH / 2 + Math.sin(tt * spd) * amp * 0.55 + Math.sin(tt * spd * 2.3 + 1.1) * amp * 0.22;
  }

  function finish(kind) {
    running = false; over = true;
    var n = Math.round(score);
    if (kind === 'slip') setMsg('歌声散了。　　你留下了 ' + n + ' 分和声。');
    else setMsg('这一曲，唱完了。　　你留下了 ' + n + ' 分和声。');
    if (n > best) { best = n; try { localStorage.setItem('elysia:eden:best', String(best)); } catch (e) {} }
    setHud();
    draw();
    raf = 0;
  }

  function onDown(e) {
    if (!running) return;
    if (e.cancelable) e.preventDefault();
    dragging = true; onMove(e);
  }
  function onMove(e) {
    if (!running || !dragging) return;
    if (e.cancelable) e.preventDefault();
    var r = canvas.getBoundingClientRect();
    var p = e.touches && e.touches[0] ? e.touches[0] : e;
    var y = (p.clientY - r.top) * (CH / r.height);
    /* ⚠ 偏移**只在这一处**发生：线画在手指上方 40px，而判定用的就是这条线的位置。
       别在渲染里再偏一次（spec §2.2「偏移只是视觉的，别把映射也偏了」）。 */
    myY = Math.max(8, Math.min(CH - 8, y - OFFSET));
  }
  function onUp() { dragging = false; }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    var i;
    /* 唱片纹（在转 —— 第一帧就在动） */
    groovePhase += 0.006;
    ctx.save();
    ctx.translate(CW / 2, CH / 2);
    ctx.rotate(groovePhase);
    for (i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 60 + i * 24, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,209,102,' + (0.045 - i * 0.004).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
    /* 暖金光晕：贴近时更亮，走音时掉一档（**不只靠颜色**） */
    var near = Math.abs(herY - myY) <= NEAR;
    var g = ctx.createRadialGradient(CW / 2, CH / 2, 6, CW / 2, CH / 2, CW * 0.72);
    g.addColorStop(0, 'rgba(255,209,102,' + (0.05 * bright * (near ? 1.7 : 1)).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(10,6,8,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
    /* 浮尘 */
    for (i = 0; i < motes.length; i++) {
      var m = motes[i]; m.y += m.vy;
      if (m.y < -4) { m.y = CH + 4; m.x = Math.random() * CW; }
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,233,184,' + (m.a * bright).toFixed(3) + ')'; ctx.fill();
    }
    /* 两条线：她的（金）/ 你的（月白）。合上时叠成一条发亮的光带 */
    if (near) {
      ctx.beginPath();
      ctx.moveTo(16, (herY + myY) / 2); ctx.lineTo(CW - 16, (herY + myY) / 2);
      ctx.strokeStyle = 'rgba(255,236,200,' + (0.85 * bright).toFixed(3) + ')';
      ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(16, herY); ctx.lineTo(CW - 16, herY);
      ctx.strokeStyle = 'rgba(255,209,102,' + (0.9 * bright).toFixed(3) + ')'; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, myY); ctx.lineTo(CW - 16, myY);
      ctx.strokeStyle = 'rgba(232,232,255,' + (0.85 * bright).toFixed(3) + ')'; ctx.lineWidth = 2.4; ctx.stroke();
    }
    /* 她的那一端留一颗亮点 */
    ctx.beginPath(); ctx.arc(CW - 26, herY, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,209,102,' + (0.95 * bright).toFixed(3) + ')'; ctx.fill();
    /* 走音提示：**分开可见 + 亮度掉档**（不是只变红） */
    if (farMs > 0.15 && running) {
      ctx.font = '12px -apple-system,PingFang SC,Microsoft YaHei,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,233,184,.75)';
      ctx.fillText('走音了', CW / 2, 26);
    }
    /* 时间条 */
    var p = Math.min(1, t / DURATION);
    ctx.fillStyle = 'rgba(255,209,102,.18)'; ctx.fillRect(16, CH - 12, CW - 32, 2);
    ctx.fillStyle = 'rgba(255,209,102,.75)'; ctx.fillRect(16, CH - 12, (CW - 32) * p, 2);
  }

  function loop() {
    if (!running) { raf = 0; return; }
    var now = performance.now();
    /* ⚠ 契约第 12 条：dt 必须钳 —— 切后台回来那一下不钳，计时会跳、两条线会瞬移 */
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    herY = herAt(t);
    var d = Math.abs(herY - myY);
    if (d <= NEAR) {
      nearMs += dt; farMs = 0; bright = Math.min(1, bright + dt * 2.2);
      score += dt * 10;
      if (nearMs >= PHRASE_S) { nearMs = 0; phrases++; playChord(); setMsg('合上了 —— 这一句，成了。'); }
    } else {
      nearMs = 0;
      if (d > FAR) {
        farMs += dt; bright = Math.max(0.55, bright - dt * 2.4);
        if (farMs > FAR_MS) { farMs = 0; slips++; if (slips >= MAX_SLIP) { setHud(); finish('slip'); return; } setMsg('走音了 —— 拉回来。'); }
      } else { farMs = 0; }
    }
    setHud();
    if (t >= DURATION) { finish('end'); return; }
    draw();
    raf = requestAnimationFrame(loop);
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
      '  <div class="eden-col">',
      '    <div class="eden-head">和声 <b id="edenScore">0</b> · 乐句 <b id="edenPhrase">0</b> · 走音 <b id="edenSlip">0 / 5</b> · <b id="edenTime">45</b> 秒 · 最佳 <b id="edenBest">0</b></div>',
      '    <div class="eden-msg" id="edenMsg">按住屏幕，跟着那条金线。</div>',
      '    <canvas class="eden-canvas" id="edenCanvas" width="340" height="420" aria-label="和声：跟住她的歌声" role="img"></canvas>',
      '    <div class="eden-row"><button class="eden-btn" id="edenAgain" type="button">再来一次</button></div>',
      '  </div>',
      '</div>',
    ].join('\n');
    document.body.appendChild(overlay);
    canvas = overlay.querySelector('#edenCanvas');
    ctx = canvas.getContext('2d');
    scoreEl = overlay.querySelector('#edenScore');
    phraseEl = overlay.querySelector('#edenPhrase');
    slipEl = overlay.querySelector('#edenSlip');
    timeEl = overlay.querySelector('#edenTime');
    bestEl = overlay.querySelector('#edenBest');
    msgEl = overlay.querySelector('#edenMsg');
    overlay.querySelector('#edenClose').addEventListener('click', close);
    overlay.querySelector('#edenAgain').addEventListener('click', start);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp);
    canvas.addEventListener('touchcancel', onUp);
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
    btn.type = 'button'; btn.className = 'game-card-start'; btn.textContent = '跟着唱';
    btn.addEventListener('click', open);
    card.appendChild(a); card.appendChild(b); card.appendChild(btn);
    host.appendChild(card);
    ensureOverlay();
    return card;
  }

  function close() {
    if (Date.now() - openedAt < CLOSE_GUARD_MS) return;
    running = false; raf = 0; dragging = false;
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
    title: '和声',
    hint: '她唱，你跟着 —— 按住屏幕上下拖，把自己的声部贴在她的音准上。贴住就有和声，越贴越亮。',
    mount: mount,
    open: open
  };
  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.eden = API;
})(window);