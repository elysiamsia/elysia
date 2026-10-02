/**
 * assets/games/sakura.js — 樱的小游戏：「一瞬」
 *
 * 呀，她这一页的最后一块拼图♥ —— 也是「每位英桀一个**真正独立**的小游戏」
 * 这个契约的第二个实现。第一位是梅比乌斯的贪吃蛇。
 *
 * ── 为什么是这个玩法（spec §6.1）────────────────────────────────────
 *   「**刹那**」是她的刻印；「刀」是她的母题。而**时机**正好能把这两件事变成玩法 ——
 *   她一生只做一件事：**在那一下出刀**。
 *
 *   和贪吃蛇在类型上**完全不同**：那个是「一直活着」，这个是「**只有那一下**」。
 *
 * ── 契约（spec §4.5）─────────────────────────────────────────────────
 *     window.ElysiaGames.sakura = { title, hint, mount(host) };
 *
 *   `ElysiaBottom.mount({ game: THEME.game })` 建出 `.bottom-game` 槽，
 *   再按 `THEME.game.module` 找到这里、调 `mount(host)`。
 *
 * ── ⚠ 这个文件的三条纪律 ──────────────────────────────────────────────
 *
 *   · **一句台词都没有。** 结算面板上的字是**站点 UI 文案**，不是她说的话。
 *     想放台词只能从官方档案馆取（有出处）—— 这一版没有合适的，所以不放。
 *     （这和贪吃蛇那边是同一条纪律，见 spec §6.3 ②。）
 *
 *   · **和探索度完全解耦。** 玩多久、得多少分，都**不进** `__ELY_EXPLORE__`。
 *
 *   · **一枚花瓣只够出一刀。** 空挥也算用掉（见 `strike()` 上那段）——
 *     这条不「显然」，但少了它整个玩法就塌了，所以特意写在这里。
 *
 *   · **绝不抛异常。** 任何一步出问题都只 `console.warn` ——
 *     一次未捕获的异常会让整页剩下的脚本集体停摆，而页面看上去还是好的。
 *
 *   ⚠ 减动偏好（`prefers-reduced-motion`）**不该关掉这个游戏** ——
 *     它由「开始」按钮**显式触发**，不属「自动播放的装饰动效」。
 *     所以这里的动画是 canvas 画的、不走 CSS animation，
 *     `explore.css` 末尾那个 `@media` 段也管不到它。（有专门的断言守着。）
 */
(function (global) {
  'use strict';

  /* ── 玩法参数 ────────────────────────────────────────────────────────
     ⚠ 这几个数是**手感**，改它们等于改这一页的手感。 */
  var W = 320, H = 320;
  var LINE_X = 160;          // 斩线：画布正中（竖线）
  var WIN = 16;              // 判定窗半径（px）—— 落在 [144, 176] 之间算「刹那」
  var ROUND_MS = 30000;      // 一局 30 秒
  var SPD0 = 150;            // 初速（px/秒）
  var SPD_UP = 14;           // 每连击 +14
  var SPD_MAX = 460;         // 封顶 —— 再快就不是「把握分寸」而是「拼手速」了
  var BEST_KEY = 'sakuraIsshunBest';

  var el = {};
  var bound = false;         // 遮罩上的监听只挂一次（mount 可能被重复调用）

  /* 游戏状态。**模块级**，不放在 mount 里 —— 它是单实例的。 */
  var raf = null, lastT = 0, running = false;
  var tgtX = 0, spd = SPD0, leftMs = ROUND_MS;
  var hits = 0, combo = 0, maxCombo = 0, best = 0;
  var flash = '', flashT = 0;

  /* ── 画面 ──────────────────────────────────────────────────────────── */

  function draw() {
    var ctx = el.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);

    /* 底色：夜。和页面的 --bg-abyss 一脉 */
    ctx.fillStyle = '#070a14';
    ctx.fillRect(0, 0, W, H);

    /* 斩线 —— 冰蓝一道光（她那柄「寒狱冰天」） */
    ctx.save();
    ctx.strokeStyle = 'rgba(143,220,255,.75)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#8fdcff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(LINE_X, 12);
    ctx.lineTo(LINE_X, H - 12);
    ctx.stroke();
    ctx.restore();

    /* 判定窗：两条极淡的界线，让人看得见「分寸」在哪。
       ⚠ 0.16 太淡了 —— 2026-10-02 量过：画在背景 (7,10,20) 上只有 (17,26,38)，
         差值约 6%，手机上白天基本看不见，等于没画。0.3 是「看得见但不抢戏」。 */
    ctx.strokeStyle = 'rgba(143,220,255,.3)';
    ctx.lineWidth = 1;
    [LINE_X - WIN, LINE_X + WIN].forEach(function (x) {
      ctx.beginPath(); ctx.moveTo(x, 26); ctx.lineTo(x, H - 26); ctx.stroke();
    });

    /* 目标：一枚会飞的樱瓣（用两个弧凑出来，不引外部资源） */
    if (running) {
      ctx.save();
      ctx.translate(tgtX, H / 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffb7c5';
      ctx.shadowColor = '#ffb7c5';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      /* 一枚花瓣：两段对称的贝塞尔 */
      ctx.moveTo(0, -9);
      ctx.bezierCurveTo(9, -4, 9, 4, 0, 9);
      ctx.bezierCurveTo(-9, 4, -9, -4, 0, -9);
      ctx.fill();
      ctx.restore();
    }

    /* 判定那一闪 —— 就在斩线上说话 */
    if (flashT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, flashT / 260);
      ctx.textAlign = 'center';
      ctx.font = '600 20px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      if (flash === '刹那') {
        ctx.fillStyle = '#ffb7c5';
        ctx.shadowColor = '#ffb7c5';
        ctx.shadowBlur = 18;
      } else {
        ctx.fillStyle = 'rgba(174,187,216,.85)';
      }
      ctx.fillText(flash, LINE_X, H / 2 - 46);
      ctx.restore();
    }

    /* 连击 —— 只在 2 以上才显示，免得喧哗 */
    if (running && combo >= 2) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '300 15px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#ffd6e0';
      ctx.fillText('连击 ' + combo, LINE_X, H / 2 + 62);
      ctx.restore();
    }

    /* 剩时：一条很细的进度线，贴在顶上 */
    if (running) {
      var p = Math.max(0, leftMs / ROUND_MS);
      ctx.fillStyle = 'rgba(143,220,255,.5)';
      ctx.fillRect(0, 0, W * p, 2);
    }
  }

  function syncHud() {
    if (el.hits) el.hits.textContent = String(hits);
    if (el.combo) el.combo.textContent = String(combo);
    if (el.best) el.best.textContent = String(best);
  }

  /* ── 玩法 ──────────────────────────────────────────────────────────── */

  function spawn() {
    tgtX = -12;
    spd = Math.min(SPD_MAX, SPD0 + combo * SPD_UP);
  }

  function resetGame() {
    hits = 0; combo = 0; maxCombo = 0;
    leftMs = ROUND_MS;
    flash = ''; flashT = 0;
    spawn();
    syncHud();
    if (el.msg) el.msg.textContent = '点屏幕（或按空格）出刀 —— 在斩线那一瞬。';
    draw();
  }

  function loop(ts) {
    if (!running) return;
    if (!lastT) lastT = ts;
    var dt = Math.min(0.05, (ts - lastT) / 1000);   // 掉帧时钳住，别让目标瞬移
    lastT = ts;

    leftMs -= dt * 1000;
    if (flashT > 0) flashT -= dt * 1000;

    tgtX += spd * dt;
    if (tgtX > W + 14) {
      /* 飞过去了 —— 「错过了」。连击断，但没有惩罚分 */
      combo = 0;
      flash = '错过了'; flashT = 700;
      syncHud();
      spawn();
    }

    if (leftMs <= 0) { finish(); return; }

    draw();
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

  function finish() {
    running = false;
    if (raf) { global.cancelAnimationFrame(raf); raf = null; }
    if (el.msg) {
      el.msg.textContent = '正中 ' + hits + ' 次 · 最高连击 ' + maxCombo;
    }
    if (hits > best) {
      best = hits;
      try { global.localStorage.setItem(BEST_KEY, String(best)); } catch (err) { /* 隐私模式 */ }
      if (el.msg) el.msg.textContent = '正中 ' + hits + ' 次 · 最高连击 ' + maxCombo + ' · 新纪录';
    }
    syncHud();
    draw();
  }

  /**
   * 出刀。
   * ⚠ 判定按「目标离斩线多远」分三档 —— 这是整个游戏的全部规则。
   *
   * ⚠⚠ **一枚花瓣只够出一刀。** 无论中没中，这一刀都算用掉了，接着换下一枚
   *   （所以 `spawn()` 在分支**外面**）。
   *
   *   为什么这条这么要紧：2026-10-02 实测，如果空挥**不消耗**花瓣，
   *   「一直点」会稳定拿到约**每秒一次**正中 —— 花瓣从 −12 飞完全程要 2.3 秒，
   *   而判定窗有 32px 宽、连点（60ms 一次）的落点间隔只有 9px，**跨不过去**。
   *   实测：60ms 一次连点 13 秒 = 156 刀 → **12 次正中**。
   *   那样「一瞬」就塌成了「按住就赢」，和「只有那一下」正好相反。
   */
  function strike() {
    if (!running) return;
    var d = tgtX - LINE_X;
    if (Math.abs(d) <= WIN) {
      hits++;
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      flash = '刹那'; flashT = 500;
    } else {
      /* 空挥：花瓣被这一刀惊散了。连击断，没有惩罚分 ——
         但「这一枚没了」本身就是惩罚。 */
      combo = 0;
      flash = d < 0 ? '太早了' : '晚了';
      flashT = 600;
    }
    spawn();                 // 中没中都换下一枚 —— 见上面那段
    syncHud();
    draw();
  }

  /* ── 遮罩：自己造一个（樱没有现成的）────────────────────────────────
     ⚠ 和 mobius 不一样 —— 那边页面里本来就有 `#gameOverlay`，模块只负责打开它。
       樱没有那个，所以这里**自给自足**地建一个。
     ⚠ 建好后**留在 DOM 里**（关闭只是去掉 `.on`）—— 这样关掉之后画布仍然存在、
       内容是静止的，测试才能拿它做「同一判据也认得出不动」的反向验证。 */

  function buildOverlay() {
    if (el.overlay) return el.overlay;

    var ov = document.createElement('div');
    ov.id = 'sakuraGameOverlay';
    ov.setAttribute('aria-hidden', 'true');

    var panel = document.createElement('div');
    panel.className = 'sk-panel';

    var hd = document.createElement('p');
    hd.className = 'sk-title';
    hd.textContent = '一瞬';
    panel.appendChild(hd);

    var hud = document.createElement('p');
    hud.className = 'sk-hud';
    hud.innerHTML = '正中 <b class="sk-hits">0</b> · 连击 <b class="sk-combo">0</b>'
                  + ' · 最佳 <b class="sk-best">0</b>';
    panel.appendChild(hud);

    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    cv.className = 'sk-canvas';
    panel.appendChild(cv);

    var msg = document.createElement('p');
    msg.className = 'sk-msg';
    panel.appendChild(msg);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'sk-close';
    close.textContent = '收刀';
    panel.appendChild(close);

    ov.appendChild(panel);
    document.body.appendChild(ov);

    el.overlay = ov;
    el.canvas = cv;
    el.ctx = cv.getContext('2d');
    el.hits = panel.querySelector('.sk-hits');
    el.combo = panel.querySelector('.sk-combo');
    el.best = panel.querySelector('.sk-best');
    el.msg = msg;
    el.close = close;
    return ov;
  }

  function open() {
    buildOverlay();
    if (!el.overlay) return;
    el.overlay.classList.add('on');
    el.overlay.setAttribute('aria-hidden', 'false');
    /* ⚠ 卡片上写着「开始」，那它就该**真的开始**（与 mobius 同一条理由：
       只开遮罩、还要再点一次的话，按钮的文案就是在说谎）。 */
    startGame();
  }

  function close() {
    if (!el.overlay) return;
    el.overlay.classList.remove('on');
    el.overlay.setAttribute('aria-hidden', 'true');
    running = false;
    if (raf) { global.cancelAnimationFrame(raf); raf = null; }
  }

  /** 遮罩上的监听**只挂一次**（mount 可能被重复调用）。 */
  function bindOverlay() {
    if (bound) return;
    bound = true;

    try { best = parseInt(global.localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (err) { best = 0; }

    el.close.addEventListener('click', close);

    /* 出刀：**点画布**（手机上就是点屏幕）。
       ⚠ 用 pointerdown 而不是 click —— 反应类游戏差那一两百毫秒。 */
    el.canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      strike();
    });

    /* ⚠ 空格出刀。只在遮罩开着时才拦 —— 别把页面别处的空格吃掉。 */
    document.addEventListener('keydown', function (e) {
      if (!el.overlay.classList.contains('on')) return;
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); strike(); }
      else if (e.key === 'Escape') { close(); }
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
      if (el.best) el.best.textContent = String(best);
      if (el.msg && !running) el.msg.textContent = '点屏幕（或按空格）出刀 —— 在斩线那一瞬。';
      draw();
    } catch (err) {
      /* ⚠ 绝不抛：游戏坏了只是没得玩，不该让整页停摆 */
      console.warn('[ElysiaGames.sakura] mount 出错：', err);
    }
  }

  var API = {
    title: '一瞬',
    hint: '在那一下出刀。',
    mount: mount,
  };

  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.sakura = API;

})(window);
