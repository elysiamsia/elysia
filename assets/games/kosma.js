/**
 * assets/games/kosma.js — 科斯魔的小游戏：「守灯」
 *
 * 呀，他这一页最后一块拼图♥ —— 也是「每位英桀一个**真正独立**的小游戏」
 * 这个契约的第三个实现（前两位：梅比乌斯的贪吃蛇、樱的「一瞬」）。
 *
 * ── 为什么是这个玩法 ────────────────────────────────────────────────
 *   「所谓的『旭光』就在那里，而不是在我的身上。」—— 他要做的从来不是成为光，
 *   而是**在夜里守住它**（守格蕾修、守孩子们、守那盏灯）。他自己有个技能名
 *   就叫「苦守者的夜炬」，所以「守灯」不是我起的名字，是他本来就在做的事。
 *
 * ── 玩法内核借自哪儿（⚠ 只借机制，一行代码与素材都没拿）────────────────
 *   需求方 2026-10-02 指出：它和《AliceInCradle》的钓鱼手感是一族的。查了那份
 *   安装目录里的托管程序集（Unity / Mono），它的钓鱼是这么一圈循环：
 *     · `FisCatcherArea` / `col_fish_in_catch` —— 你控制一个「捕獲範囲」
 *     · `FishSwimmer` + `Fis/fish_data.csv` —— 鱼**自己**会游（那 CSV 是它的动作脚本）
 *     · `add_power_nocatch_target` —— **没罩住目标时「力量」增长**，涨满就断线
 *       （还有 `escape_spd`、`get_catching_max_velocity`、`mgm_catcher_area_extend_rod_grade`）
 *   也就是：**罩住＝进展，罩不住＝压力涨。**
 *   于是「守灯」照这个骨来：**按住往上托 / 松手往下沉**，把框罩在光点上，
 *   罩不住「风」就涨。比原来那版「点一下加一口光」的离散手感好得多。
 *
 * ── 契约（spec §4.5）─────────────────────────────────────────────────
 *     window.ElysiaGames.kosma = { title, hint, mount(host) };
 *
 *   `ElysiaBottom.mount({ game: THEME.game })` 建出 `.bottom-game` 槽，
 *   再按 `THEME.game.module` 找到这里、调 `mount(host)`。
 *
 * ── ⚠ 这个文件的三条纪律（与樱那份一致）──────────────────────────────
 *
 *   · **一句台词都没有。** 面板上的字是**站点 UI 文案**，不是他说的话。
 *     想放台词只能从官方档案馆取（有出处）—— 这一版没有合适的，所以不放。
 *
 *   · **和探索度完全解耦。** 玩多久、得多少分，都**不进** `__ELY_EXPLORE__`。
 *
 *   · **绝不抛异常。** 任何一步出问题都只 `console.warn` ——
 *     一次未捕获的异常会让整页剩下的脚本集体停摆，而页面看上去还是好的。
 *
 *   ⚠ 减动偏好（`prefers-reduced-motion`）**不该关掉这个游戏** ——
 *     它由「开始」按钮**显式触发**，不属「自动播放的装饰动效」。
 *     所以这里的动画是 canvas 画的、不走 CSS animation。
 *
 *   ⚠ **「收工」离游戏区必须够远** —— 它挂在**遮罩**的右上角，不是面板里。
 *     （樱那页实测过：贴着操作区 55px 时，玩家手指落低一点就误触退出。
 *      见 HANDOVER §10.10 五。）
 */
(function (global) {
  'use strict';

  /* ── 玩法参数 ────────────────────────────────────────────────────────
     ⚠ 这几个数是**手感**，改它们等于改这一页的手感。 */
  var W = 320, H = 320;
  var COL_X = 148, COL_W = 24;        // 光柱：屏幕正中一条竖柱
  var COL_TOP = 22, COL_BOT = 298;
  var COL_H = COL_BOT - COL_TOP;      // 276
  var FRAME = 0.24;                   // 「守」的框有多高（占光柱的比例）
  var ROUND_MS = 30000;               // 一局 30 秒
  var UP_SPD = 0.62;                  // 按住：框往上托（每秒多少比例）
  var DOWN_SPD = 0.50;                // 松手：框往下沉
  var WIND_UP0 = 0.24;                // 罩不住时「风」涨得多快（开头）
  var WIND_UP1 = 0.60;                // 结尾（难度曲线）
  var WIND_DOWN = 0.42;               // 罩住时风退得多快
  var DART0 = 0.55, DART1 = 1.7;      // 光点「猛冲」的频率（次/秒，开头→结尾）
  var BEST_KEY = 'kosmaKeepLightBest';
  /* ⚠ 刚打开的那一小段里，**拒收「收工」的点击** —— 挡双击 / 浏览器补发的延迟 click
     （与樱那页同一个理由，见她那份 `.sk-close` 的注释）。 */
  var CLOSE_GUARD_MS = 400;

  var el = {};
  var bound = false;                  // 遮罩上的监听只挂一次（mount 可能被重复调用）

  /* 游戏状态。**模块级**，不放在 mount 里 —— 它是单实例的。 */
  var raf = null, lastT = 0, running = false, openedAt = 0;
  var frame = 0.35;                   // 框的中心位置（0 = 柱底，1 = 柱顶）
  var mote = 0.6, moteV = 0;          // 光点：位置与速度
  var leftMs = ROUND_MS;
  var wind = 0;                       // 「风」：罩不住就涨，涨满灯灭
  var held = false;                   // 输入是否按住
  var keptMs = 0, runMs = 0, bestRunMs = 0;   // 守住总时长 / 当前连续 / 最长连续
  var best = 0;                       // 最高分（本机）
  var flash = '', flashT = 0;

  function now01() { return 1 - Math.max(0, leftMs) / ROUND_MS; }   // 0 → 1 的进度

  /* ── 画面 ──────────────────────────────────────────────────────────── */

  function draw() {
    var ctx = el.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    /* 夜。与他那一页的 --bg-abyss 一脉 */
    ctx.fillStyle = '#070a08';
    ctx.fillRect(0, 0, W, H);

    var covered = isCovered();

    /* 光柱的底子：罩住时暖一点，罩不住时发凉 */
    ctx.fillStyle = covered ? 'rgba(249,161,82,.07)' : 'rgba(143,160,130,.05)';
    ctx.fillRect(COL_X, COL_TOP, COL_W, COL_H);
    ctx.strokeStyle = covered ? 'rgba(249,161,82,.34)' : 'rgba(143,160,130,.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(COL_X + .5, COL_TOP + .5, COL_W - 1, COL_H - 1);

    /* 「守」的框 —— 就是玩家能到的范围。画成一条横带 + 上下两条亮边 */
    var fh = COL_H * FRAME;
    var cy = COL_BOT - frame * COL_H;
    var fy = cy - fh / 2;
    var g = ctx.createLinearGradient(0, fy, 0, fy + fh);
    g.addColorStop(0, 'rgba(249,161,82,.30)');
    g.addColorStop(.5, 'rgba(249,161,82,.14)');
    g.addColorStop(1, 'rgba(249,161,82,.30)');
    ctx.fillStyle = g;
    ctx.fillRect(COL_X, fy, COL_W, fh);
    ctx.strokeStyle = 'rgba(255,220,170,.75)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(COL_X - 5, fy); ctx.lineTo(COL_X + COL_W + 5, fy);
    ctx.moveTo(COL_X - 5, fy + fh); ctx.lineTo(COL_X + COL_W + 5, fy + fh);
    ctx.stroke();

    /* 光点 —— 一枚**半轮的日轮**（他开场徽记上那个）。
       ⚠ 只画半轮：他从不觉得自己是完整的那道光。 */
    if (running) {
      var my = COL_BOT - mote * COL_H;
      var mx = COL_X + COL_W / 2;
      ctx.save();
      ctx.shadowColor = '#f9a152';
      ctx.shadowBlur = covered ? 22 : 12;
      ctx.fillStyle = covered ? '#ffd7a8' : '#f9a152';
      ctx.beginPath();
      ctx.arc(mx, my, 7, Math.PI, 0);      // 上半轮（半圆）
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      /* 地平线那一道：光点的「底」 */
      ctx.strokeStyle = 'rgba(255,215,168,.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(mx - 10, my); ctx.lineTo(mx + 10, my);
      ctx.stroke();
    }

    /* 「风」—— 罩不住时从两侧压进来的几道线 */
    if (running && wind > 0.02) {
      ctx.save();
      ctx.strokeStyle = 'rgba(143,220,255,' + (0.10 + wind * 0.35).toFixed(2) + ')';
      ctx.lineWidth = 1;
      for (var k = 0; k < 5; k++) {
        var wy = COL_TOP + 20 + k * 52 + (1 - wind) * 6;
        ctx.beginPath();
        ctx.moveTo(6, wy);
        ctx.lineTo(COL_X - 6 - wind * 10, wy + 4);
        ctx.moveTo(W - 6, wy + 14);
        ctx.lineTo(COL_X + COL_W + 6 + wind * 10, wy + 18);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* 判定那一闪（守住了 / 溜了）*/
    if (flashT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, flashT / 240);
      ctx.textAlign = 'center';
      ctx.font = '600 13px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = flash === '守住了' ? '#ffd7a8' : 'rgba(143,220,255,.9)';
      ctx.fillText(flash, W / 2, 14);
      ctx.restore();
    }

    /* 剩时：顶上一条细线 */
    if (running) {
      ctx.fillStyle = 'rgba(249,161,82,.55)';
      ctx.fillRect(COL_X, 12, COL_W * Math.max(0, leftMs / ROUND_MS), 1.6);
    }

    /* 风压槽：柱子右边一竖条，涨满就是灯灭 */
    ctx.fillStyle = 'rgba(143,160,130,.35)';
    ctx.fillRect(COL_X + COL_W + 4, COL_TOP, 3, COL_H);
    var wh = COL_H * Math.min(1, wind);
    ctx.fillStyle = wind > 0.7 ? 'rgba(143,220,255,.95)' : 'rgba(143,220,255,.6)';
    ctx.fillRect(COL_X + COL_W + 4, COL_BOT - wh, 3, wh);
  }

  function isCovered() {
    var half = FRAME / 2;
    return mote >= frame - half && mote <= frame + half;
  }

  function syncHud() {
    if (el.kept) el.kept.textContent = (keptMs / 1000).toFixed(1);
    if (el.bestRun) el.bestRun.textContent = (bestRunMs / 1000).toFixed(1);
    /* ⚠ `best` 本来就是**秒**（`finish()` 里存的 `keptMs / 1000`）——
       这里再除一次 1000 的话，「最佳」会永远显示 0.0。探针跑出来过。 */
    if (el.best) el.best.textContent = best.toFixed(1);
  }

  /* ── 玩法 ──────────────────────────────────────────────────────────── */

  function resetGame() {
    frame = 0.35; mote = 0.62; moteV = 0;
    leftMs = ROUND_MS; wind = 0;
    keptMs = 0; runMs = 0; bestRunMs = 0;
    flash = ''; flashT = 0; held = false;
    syncHud();
    if (el.msg) el.msg.textContent = '按住把光托住 —— 别让它灭，也别让它跑掉。';
    draw();
  }

  function loop(ts) {
    if (!running) return;
    if (!lastT) lastT = ts;
    var dt = Math.min(0.05, (ts - lastT) / 1000);   // 掉帧时钳住，别让光点瞬移
    lastT = ts;

    leftMs -= dt * 1000;
    if (flashT > 0) flashT -= dt * 1000;

    var p = now01();

    /* ① 框：按住往上托，松手往下沉 */
    frame += (held ? UP_SPD : -DOWN_SPD) * dt;
    if (frame < FRAME / 2) frame = FRAME / 2;
    if (frame > 1 - FRAME / 2) frame = 1 - FRAME / 2;

    /* ② 光点自己飘 —— 这是这一局的「对手」。
         速度带阻尼的随机游走 + 偶发猛冲；越到后面越野。 */
    var dart = DART0 + (DART1 - DART0) * p;
    if (Math.random() < dart * dt) {
      moteV += (Math.random() < 0.5 ? -1 : 1) * (0.22 + Math.random() * 0.26);
    }
    moteV += (Math.random() - 0.5) * 0.9 * dt;
    moteV *= 0.995;
    if (moteV > 0.9) moteV = 0.9;
    if (moteV < -0.9) moteV = -0.9;
    mote += moteV * dt;
    if (mote < 0) { mote = 0; moteV = Math.abs(moteV) * 0.6; }
    if (mote > 1) { mote = 1; moteV = -Math.abs(moteV) * 0.6; }

    /* ③ 罩住了吗 —— 这一局的全部规则就在这三行 */
    if (isCovered()) {
      keptMs += dt * 1000;
      runMs += dt * 1000;
      if (runMs > bestRunMs) bestRunMs = runMs;
      wind -= WIND_DOWN * dt;
      if (wind < 0) wind = 0;
    } else {
      if (runMs > 0) { flash = '溜了'; flashT = 700; }
      runMs = 0;
      wind += (WIND_UP0 + (WIND_UP1 - WIND_UP0) * p) * dt;
    }

    if (wind >= 1) { finish('灯灭了'); return; }
    if (leftMs <= 0) { finish(''); return; }

    draw();
    syncHud();
    raf = global.requestAnimationFrame(loop);
  }

  function startGame() {
    resetGame();
    running = true;
    lastT = 0;
    if (el.start) el.start.textContent = '再来一次';
    if (raf) global.cancelAnimationFrame(raf);
    raf = global.requestAnimationFrame(loop);
  }

  /** @param {string} why 非空 = 提前结束的原因 */
  function finish(why) {
    running = false;
    if (raf) { global.cancelAnimationFrame(raf); raf = null; }
    var sco = keptMs / 1000;
    var line = (why ? why + ' · ' : '')
             + '守住 ' + sco.toFixed(1) + ' 秒 · 最长连续 ' + (bestRunMs / 1000).toFixed(1) + ' 秒';
    if (sco > best) {
      best = sco;
      try { global.localStorage.setItem(BEST_KEY, String(best)); } catch (err) { /* 隐私模式 */ }
      line += ' · 新纪录';
    }
    if (el.msg) el.msg.textContent = line;
    syncHud();
    draw();
  }

  /* ── 遮罩：自己造一个（他这一页也没有现成的）────────────────────────
     ⚠ 与樱那份同一个做法：建好后**留在 DOM 里**（关闭只是去掉 `.on`）——
       关掉之后画布仍然存在、内容是静止的，测试才能拿它做
       「同一判据也认得出不动」的反向验证。 */

  function buildOverlay() {
    if (el.overlay) return el.overlay;

    var ov = document.createElement('div');
    ov.id = 'kosmaGameOverlay';
    ov.setAttribute('aria-hidden', 'true');

    var panel = document.createElement('div');
    panel.className = 'km-panel';

    var hd = document.createElement('p');
    hd.className = 'km-title';
    hd.textContent = '守灯';
    panel.appendChild(hd);

    var hud = document.createElement('p');
    hud.className = 'km-hud';
    hud.innerHTML = '守住 <b class="km-kept">0.0</b> 秒 · 最长 <b class="km-run">0.0</b>'
                  + ' · 最佳 <b class="km-best">0.0</b>';
    panel.appendChild(hud);

    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    cv.className = 'km-canvas';
    panel.appendChild(cv);

    var msg = document.createElement('p');
    msg.className = 'km-msg';
    panel.appendChild(msg);

    /* ⚠ 「收工」是 `.km-panel` 的**兄弟**、直接挂在遮罩上 ——
       它必须离游戏区够远（樱那页实测过：贴着操作区会误触）。见文件头。 */
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'km-close';
    close.textContent = '收工';

    ov.appendChild(panel);
    ov.appendChild(close);
    document.body.appendChild(ov);

    el.overlay = ov;
    el.canvas = cv;
    el.ctx = cv.getContext('2d');
    el.kept = panel.querySelector('.km-kept');
    /* ⚠ 只有一个「最长」—— 原来这里写了两遍 querySelector('.km-run')，删掉那个多余的 */
    el.bestRun = panel.querySelector('.km-run');
    el.best = panel.querySelector('.km-best');
    el.msg = msg;
    el.close = close;
    return ov;
  }

  function open() {
    buildOverlay();
    if (!el.overlay) return;
    openedAt = Date.now();          // ⚠ 给「收工」的保护期用，见 bindOverlay
    el.overlay.classList.add('on');
    el.overlay.setAttribute('aria-hidden', 'false');
    /* ⚠ 卡片上写着「开始」，那它就该**真的开始**（与另两页同一条理由）。 */
    startGame();
  }

  function close() {
    if (!el.overlay) return;
    el.overlay.classList.remove('on');
    el.overlay.setAttribute('aria-hidden', 'true');
    running = false; held = false;
    if (raf) { global.cancelAnimationFrame(raf); raf = null; }
  }

  /** 遮罩上的监听**只挂一次**（mount 可能被重复调用）。 */
  function bindOverlay() {
    if (bound) return;
    bound = true;

    try { best = parseFloat(global.localStorage.getItem(BEST_KEY) || '0') || 0; } catch (err) { best = 0; }

    el.close.addEventListener('click', function () {
      if (Date.now() - openedAt < CLOSE_GUARD_MS) return;
      close();
    });

    /* 按住 / 松手：**pointerdown + pointerup** —— 触摸与鼠标都吃。
       ⚠ 用 pointer 而不是 mouse/touch 各写一套：一处搞定，也是共享层
         `explore.js` 已经在用的写法（大陆手机的老内核认它）。 */
    el.canvas.addEventListener('pointerdown', function (e) {
      if (e.preventDefault) e.preventDefault();
      held = true;
    });
    var release = function () { held = false; };
    el.canvas.addEventListener('pointerup', release);
    el.canvas.addEventListener('pointercancel', release);
    el.canvas.addEventListener('pointerleave', release);
    global.addEventListener('pointerup', release);      // 手指滑出画布也算松手

    /* ⚠ 空格按住 = 托住。只在遮罩开着时才拦 —— 别把页面别处的空格吃掉。 */
    document.addEventListener('keydown', function (e) {
      if (!el.overlay.classList.contains('on')) return;
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); held = true; }
      else if (e.key === 'Escape') { close(); }
    });
    document.addEventListener('keyup', function (e) {
      if (!el.overlay.classList.contains('on')) return;
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); held = false; }
    });
  }

  /**
   * 把游戏卡渲染进下方区块的游戏槽。
   *
   * ⚠ 可以重复调用（`ElysiaBottom.mount` 重画时会再调一次）——
   *   卡片重建，但遮罩上的监听**不会重复挂**（`bound` 挡着）。
   *
   * @param {HTMLElement} host `.bottom-game` 槽
   */
  function mount(host) {
    if (!host) return;
    try {
      host.innerHTML = '';

      var card = document.createElement('div');
      card.className = 'game-card';

      var t = document.createElement('p');
      t.className = 'game-card-title';
      t.textContent = API.title;
      card.appendChild(t);

      var h = document.createElement('p');
      h.className = 'game-card-hint';
      h.textContent = API.hint;
      card.appendChild(h);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'game-card-start';
      btn.textContent = '开始';
      btn.addEventListener('click', open);
      card.appendChild(btn);

      host.appendChild(card);

      buildOverlay();
      bindOverlay();
      if (el.best) el.best.textContent = (best).toFixed(1);
      if (el.msg && !running) el.msg.textContent = '按住把光托住 —— 别让它灭，也别让它跑掉。';
      draw();
    } catch (err) {
      /* ⚠ 绝不抛：游戏坏了只是没得玩，不该让整页停摆 */
      console.warn('[ElysiaGames.kosma] mount 出错：', err);
    }
  }

  var API = {
    title: '守灯',
    hint: '按住把光托住，别让它溜走。',
    mount: mount,
  };

  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.kosma = API;

})(window);
