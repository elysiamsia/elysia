/**
 * assets/games/griseo.js — 格蕾修的小游戏：「上色」
 *
 * 呀，她这一页最后一块拼图♥ —— 也是「每位英桀一个**真正独立**的小游戏」
 * 这个契约的第三个实现。前两位是梅比乌斯的贪吃蛇、樱的「一瞬」。
 *
 * ── 为什么是这个玩法（spec §6.1 / §3.3）──────────────────────────────
 *   她的刻印是「繁星」，可她的母题是**画画** —— 她一辈子都在把世界涂成自己的颜色。
 *   所以这里给她一个**圈地**玩法：拖着自己的笔尖在画布上走一笔，绕回自己的颜色，
 *   圈住的那块就变成她的领地。玩法叫「上色」，正对她「色彩浸染」的能力。
 *
 * ── 契约（spec §4.5）─────────────────────────────────────────────────
 *     window.ElysiaGames.griseo = { title, hint, mount(host) };
 *
 *   `ElysiaBottom.mount({ game: THEME.game })` 建出 `.bottom-game` 槽，
 *   再按 `THEME.game.module` 找到这里、调 `mount(host)`。
 *
 * ── ⚠ 这个文件的纪律（照 sakura.js / mobius.js 那两条）───────────────
 *   · **一句台词都没有。** 遮罩上的字是**站点 UI 文案**，不是她说的话。
 *   · **和探索度完全解耦。** 玩多久、圈多大，都**不进** `__ELY_EXPLORE__`。
 *   · **绝不抛异常。** 任何一步出问题都只 `console.warn` ——
 *     一次未捕获的异常会让整页剩下的脚本集体停摆，而页面看上去还是好的。
 *   · **遮罩、样式都自给自足。** 不给 `griseo/index.html` 加一行 CSS ——
 *     本模块把需要的样式**自己注入**（`injectStyles()`），
 *     这样页面那边只留两处「接线」（script 标签 + mount 传 game），一个字节都不多。
 *   · ⚠ 减动偏好（`prefers-reduced-motion`）**不该关掉这个游戏** ——
 *     它由「开始」按钮**显式触发**，不属「自动播放的装饰动效」。
 *
 * ── 本任务（Task 2）到哪儿为止 ──────────────────────────────────────
 *   骨架 + 遮罩 + 网格 + 离屏渲染 + **玩家可拖动**（笔触落成 `2`）。
 *   **围地回填（松手 → fillEnclosed）是 Task 3**；造物是 Task 4。
 *   但按照 R24，**算法在本任务已经移植进来**（见文件下半 `fillEnclosed` 那一节），
 *   本任务只**不调用**它 —— 等 Task 3 把「松手」接上去。
 *
 * ── ⚠ 拖动时**绝不能让页面跟着滚**（本任务最容易踩的坑）──────────────
 *   三层一起上，缺一不可：
 *     ① 画布 / 遮罩 CSS `touch-action:none`
 *     ② `pointerdown` / `pointermove` 里 `preventDefault()`
 *     ③ 画布上再挂一个 `touchmove` 兜底 `preventDefault()`（老内核里
 *        `touch-action` 未必认，这一层保证拖到哪儿都不滚）
 *   探索系统的 `slide` 动词踩过同类坑（可发现物那边**刻意没写** touch-action，
 *   理由见 explore.css）—— 但游戏台不一样：手指落在上面就该是画，不是滚页。
 */
(function (global) {
  'use strict';

  /* ── 玩法参数 ────────────────────────────────────────────────────────
     ⚠ 这几个数是**手感**，改它们等于改这一页的手感。 */
  var COLS = 48, ROWS = 32;      // 网格（brief 钉死）
  var CELL = 12;                 // 一格多少画布像素 —— 只影响清晰度，不影响玩法
  var CW = COLS * CELL;          // 576
  var CH = ROWS * CELL;          // 384（3:2，照 ROWS/COLS）
  var HOME_R = 3;                // 玩家起始占**中央 3×3**（「画布原点」）
  var BRUSH_UP = 44;             // 笔尖在手指**上方** 44px（防手指挡视线）
  var BASE_PAD = 1;              // 每格四周留 1px 当网格线

  /* 格子的编码（**哨兵，写死，别改成通用 owner**）——
     ⚠ 这套编码是 `fillEnclosed` 的契约（见下半节的文件头），别动。 */
  var EMPTY = 0;     // 空白
  var HOME = 1;      // 玩家领地
  var STROKE = 2;    // 玩家笔触
  // >= 3 是造物（Task 4 才登场）；本任务不会出现，但绘制要兜住。

  /* 配色 —— 从她这一页的五罐颜料里取（硬编码，与 sakura/mobius 同一个做法）。 */
  var COL_LINE = '#33203a';      // 底色（露在格子缝里 = 网格线）
  var COL_EMPTY = '#150e18';     // 空白格：未上色的画布
  var COL_HOME = '#7dd3fc';      // 领地：她的天青（--sky）
  var COL_STROKE = '#c2ecff';    // 笔触：未干的、更浅的天青
  var COL_BRUSH = 'rgba(255,217,122,.9)';   // 笔尖圈：金（她的发饰色）

  var MSG_OPEN = '按住画布拖动 —— 笔尖跟着你的手，画过的地方就是你的颜色。';
  var CLOSE_GUARD_MS = 400;      // 刚打开的那一小段里拒收「收笔」的点击（照 sakura）
  var STYLE_ID = 'griseoGameStyles';

  /* ── DOM 引用 & 单实例状态 ───────────────────────────────────────────
     `el` 里是 DOM；下面这些是**模块级**的单实例状态，不放在 mount 里。 */
  var el = {};
  var bound = false;             // 遮罩上的监听只挂一次（mount 可能被重复调用）
  var raf = null;                // 当前挂着的 rAF（渲染调度 / 关掉时取消）
  var running = false;           // 遮罩是否开着
  var openedAt = 0;              // 打开遮罩的时刻（给保护期用）
  var best = 0;                  // 最好成绩 —— 领地计分归 Task 3/4，本任务先占位

  /* 网格与渲染状态 */
  var grid = null;               // Int8Array(COLS*ROWS)，行主序 idx = y*COLS + x
  var cache = null;              // 离屏 canvas：格子的缓存层
  var cctx = null;
  var dirtyFlags = null;         // 每格「脏了没」
  var dirtyList = [];            // 脏格列表（避免每次全图重画）

  /* 拖动状态 */
  var dragging = false;
  var lastCell = null;           // 上一次标到的格（用来补中间漏掉的格）
  var brushX = 0, brushY = 0;    // 笔尖的**浮点**画布坐标（画那枚金圈用）

  /* ══════════════════════════════════════════════════════════════════
   *  一、渲染 —— 离屏缓存 + 只画脏格
   * ══════════════════════════════════════════════════════════════════ */

  /** 铺底色：露在格子缝里的就是网格线。 */
  function paintBg() {
    if (!cctx) return;
    cctx.fillStyle = COL_LINE;
    cctx.fillRect(0, 0, CW, CH);
  }

  /** 把一个格子画进离屏缓存（四周留 BASE_PAD 像素 = 网格线）。 */
  function paintCell(i) {
    if (!cctx) return;
    var x = i % COLS;
    var y = (i - x) / COLS;
    var v = grid ? grid[i] : EMPTY;
    var color;
    if (v === HOME) color = COL_HOME;
    else if (v === STROKE) color = COL_STROKE;
    else if (v >= 3) color = '#6ea86b';       // 造物（Task 4）—— 本任务用不到
    else color = COL_EMPTY;
    cctx.fillStyle = color;
    cctx.fillRect(x * CELL + BASE_PAD, y * CELL + BASE_PAD, CELL - BASE_PAD * 2, CELL - BASE_PAD * 2);
  }

  /** 标脏：这一格得重画（去重 + 排一次渲染）。 */
  function markDirty(i) {
    if (!dirtyFlags || dirtyFlags[i]) return;
    dirtyFlags[i] = 1;
    dirtyList.push(i);
    scheduleRender();
  }

  function scheduleRender() {
    if (raf) return;
    raf = global.requestAnimationFrame(function () {
      raf = null;
      try { render(); } catch (err) { console.warn('[ElysiaGames.griseo] render 出错：', err); }
    });
  }

  /** 把离屏缓存贴到主画布，再画笔尖那枚金圈。 */
  function blit() {
    if (!el.ctx || !cache) return;
    el.ctx.clearRect(0, 0, CW, CH);
    el.ctx.drawImage(cache, 0, 0);
    if (dragging) {
      el.ctx.save();
      el.ctx.strokeStyle = COL_BRUSH;
      el.ctx.lineWidth = 2;
      el.ctx.beginPath();
      el.ctx.arc(brushX, brushY, CELL * 0.72, 0, Math.PI * 2);
      el.ctx.stroke();
      el.ctx.restore();
    }
  }

  /** 只重画脏格，再贴一次。 */
  function render() {
    if (!el.ctx || !cache) return;
    for (var k = 0; k < dirtyList.length; k++) {
      paintCell(dirtyList[k]);
      dirtyFlags[dirtyList[k]] = 0;
    }
    dirtyList.length = 0;
    blit();
  }

  /** 全图重画（开局 / 重置时用）。 */
  function fullRender() {
    if (!cctx || !grid) return;
    paintBg();
    for (var i = 0; i < grid.length; i++) paintCell(i);
    if (dirtyFlags) for (var k = 0; k < dirtyList.length; k++) dirtyFlags[dirtyList[k]] = 0;
    dirtyList.length = 0;
    blit();
  }

  /* ══════════════════════════════════════════════════════════════════
   *  二、玩法 —— 拖动，把经过的格标成笔触
   * ══════════════════════════════════════════════════════════════════ */

  /** 开局：清空网格，把中央 3×3 变成她的领地（画布原点）。 */
  function resetGame() {
    grid = new Int8Array(COLS * ROWS);
    if (dirtyFlags) dirtyFlags = new Uint8Array(COLS * ROWS);
    dirtyList.length = 0;
    dragging = false;
    lastCell = null;

    var cx = COLS >> 1, cy = ROWS >> 1;         // 48>>1 = 24 / 32>>1 = 16
    var half = HOME_R >> 1;                      // 3×3 → 半径 1
    for (var y = cy - half; y <= cy + half; y++) {
      for (var x = cx - half; x <= cx + half; x++) {
        if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue;
        grid[y * COLS + x] = HOME;
      }
    }
    if (el.msg) el.msg.textContent = MSG_OPEN;
    fullRender();
  }

  /** 屏幕坐标 → 格子。笔尖整体**上移 44px**（防手指挡视线）后再换算。 */
  function eventToCell(clientX, clientY) {
    if (!el.canvas) return null;
    var r = el.canvas.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return null;
    /* 画布可能被 CSS 缩小了（手机上），所以要先减掉偏移、再按比例换回内部像素 */
    var px = (clientX - r.left) * CW / r.width;
    var py = (clientY - r.top - BRUSH_UP) * CH / r.height;
    var fx = px / CELL;
    var fy = py / CELL;
    var cx = Math.floor(fx);
    var cy = Math.floor(fy);
    if (cx < 0) cx = 0; else if (cx > COLS - 1) cx = COLS - 1;
    if (cy < 0) cy = 0; else if (cy > ROWS - 1) cy = ROWS - 1;
    return { cx: cx, cy: cy, px: px, py: py };
  }

  /** 在自己领地**外**的空白格上落笔触（领地 / 造物 / 已有笔触一律不动）。 */
  function markStroke(cx, cy) {
    if (!grid) return;
    var i = cy * COLS + cx;
    if (grid[i] === EMPTY) {
      grid[i] = STROKE;
      markDirty(i);
    }
  }

  /**
   * 从 (x0,y0) 走到 (x1,y1)，沿途**逐格**标笔触。
   * ⚠ 每次只走一个正交步（先吃掉差距大的那根轴）⇒ 走出来的路径**必然 4 连通**。
   *   这一点很要紧：`fillEnclosed` 切轨迹连通分量、以及泛洪判定**都按 4 连通** ——
   *   若这里走出对角步，一笔会被切成好几个分量，围地就判不出来了。
   *   同时也顺手解决了「手一快就跳格漏标」：跳多远都补得出中间那些格。
   */
  function strokeWalk(x0, y0, x1, y1) {
    var x = x0, y = y0;
    var guard = COLS * ROWS;                     // 兜底，别死循环
    while ((x !== x1 || y !== y1) && guard-- > 0) {
      var adx = x1 > x ? x1 - x : x - x1;
      var ady = y1 > y ? y1 - y : y - y1;
      if (adx >= ady) x += (x1 > x) ? 1 : -1;
      else y += (y1 > y) ? 1 : -1;
      markStroke(x, y);
    }
  }

  function beginStroke(clientX, clientY) {
    var cell = eventToCell(clientX, clientY);
    if (!cell) return;
    dragging = true;
    lastCell = { x: cell.cx, y: cell.cy };
    brushX = cell.px; brushY = cell.py;          // 浮点位置：笔尖圈跟手，不跳格
    markStroke(cell.cx, cell.cy);
    if (el.msg) el.msg.textContent = '……笔尖正跟着你的手。';
    scheduleRender();
  }

  function moveStroke(clientX, clientY) {
    if (!dragging) return;
    var cell = eventToCell(clientX, clientY);
    if (!cell) return;
    brushX = cell.px; brushY = cell.py;
    if (lastCell) strokeWalk(lastCell.x, lastCell.y, cell.cx, cell.cy);
    lastCell = { x: cell.cx, y: cell.cy };
    scheduleRender();
  }

  function endStroke() {
    if (!dragging) return;
    dragging = false;
    lastCell = null;
    /* ⚠ Task 3 在这里接「松手回填」：若笔尖落在自己的颜色上 → 调 fillEnclosed。
       本任务先只收笔，不判定。 */
    scheduleRender();
  }

  /* ── 指针 / 触摸接线（三层防滚页，见文件头）────────────────────────── */

  /** addEventListener 的 passive:false 版本（老内核不认 options 时退回布尔）。 */
  function addActive(target, type, fn) {
    try { target.addEventListener(type, fn, { passive: false }); }
    catch (err) { target.addEventListener(type, fn, false); }
  }

  function bindDrag() {
    var cv = el.canvas;
    if (!cv) return;

    if (global.PointerEvent) {
      /* 现代内核（含大陆 Android Chrome / Edge）—— mouse 与 touch 都会派 pointer 事件 */
      addActive(cv, 'pointerdown', function (e) { e.preventDefault(); beginStroke(e.clientX, e.clientY); });
      addActive(document, 'pointermove', function (e) { if (dragging) e.preventDefault(); moveStroke(e.clientX, e.clientY); });
      document.addEventListener('pointerup', function () { endStroke(); }, false);
      document.addEventListener('pointercancel', function () { endStroke(); }, false);
    } else {
      cv.addEventListener('mousedown', function (e) { e.preventDefault(); beginStroke(e.clientX, e.clientY); }, false);
      document.addEventListener('mousemove', function (e) { moveStroke(e.clientX, e.clientY); }, false);
      document.addEventListener('mouseup', function () { endStroke(); }, false);

      addActive(cv, 'touchstart', function (e) {
        var t = e.touches[0]; if (!t) return;
        e.preventDefault();
        beginStroke(t.clientX, t.clientY);
      });
      addActive(document, 'touchmove', function (e) {
        if (!dragging) return;
        var t = e.touches[0]; if (!t) return;
        e.preventDefault();
        moveStroke(t.clientX, t.clientY);
      });
      document.addEventListener('touchend', function () { endStroke(); }, false);
      document.addEventListener('touchcancel', function () { endStroke(); }, false);
    }

    /* ⚠ 兜底：不论走哪条路，画布上的 touchmove 一律 `preventDefault` ——
       老内核里 `touch-action:none` 未必生效，这一层是「拖动不滚页」的最后一道闸。
       画布是**游戏台**，落在上面的滑动本来就该是画画，不是滚页面。 */
    addActive(cv, 'touchmove', function (e) { e.preventDefault(); });
  }

  /* ══════════════════════════════════════════════════════════════════
   *  三、遮罩（自己建一个，照 sakura.js 的做法）
   * ══════════════════════════════════════════════════════════════════ */

  /** 把游戏用的样式注入 `<head>` —— 页面那边因此一行 CSS 都不用加。
      ⚠ 连 `.game-card*` 也在这里注入：别的页（樱 / 科斯魔 / 梅比乌斯）把这几条
        写在**各自页面的 `<style>`** 里，而 griseo 这页只留了两处「接线」、
        没有卡片的样式 —— 不补的话「开始」会是一枚**没有样式的默认按钮**。
         所以本模块把卡片样式也一起带上，配色走她的天青（--sky）。 */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      /* 下方区块里那张游戏卡 */
      '.game-card{max-width:26rem;margin:0 auto;padding:1.6rem 1.5rem;border-radius:16px;',
      'background:rgba(255,255,255,.03);border:1px solid var(--glass-border,rgba(255,217,122,.14))}',
      '.game-card-title{margin:0 0 .6rem;font-size:1.05rem;letter-spacing:.1em;color:var(--sky,#7dd3fc)}',
      '.game-card-hint{margin:0 0 1.2rem;font-size:.8rem;line-height:1.9;color:var(--text-muted,#7d6e8c)}',
      '.game-card-start{min-height:44px;padding:.6rem 1.8rem;border-radius:999px;cursor:pointer;',
      'font-size:.85rem;letter-spacing:.14em;color:var(--text,#f2e9f8);',
      'background:rgba(125,211,252,.12);border:1px solid var(--glass-border,rgba(255,217,122,.14));',
      'transition:background .25s ease,box-shadow .25s ease}',
      '.game-card-start:hover{background:rgba(125,211,252,.22);box-shadow:0 0 20px rgba(125,211,252,.25)}',
      /* 遮罩 */
      '#griseoGameOverlay{',
      'position:fixed;top:0;right:0;bottom:0;left:0;z-index:9995;',
      'display:none;align-items:center;justify-content:center;',
      'padding:4.5rem 1rem 1.5rem;box-sizing:border-box;',
      'background:rgba(10,7,13,.94);',
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);',
      'touch-action:none;-webkit-user-select:none;user-select:none;',
      '-webkit-tap-highlight-color:transparent;',
      '}',
      '#griseoGameOverlay.on{display:flex}',
      '.gr-panel{',
      'padding:1rem;border-radius:18px;text-align:center;max-width:100%;',
      'background:linear-gradient(135deg,rgba(21,14,24,.96),rgba(58,36,64,.94));',
      'border:1px solid var(--glass-border,rgba(255,217,122,.14));',
      'box-shadow:0 12px 40px rgba(0,0,0,.5);',
      '}',
      '.gr-title{margin:0 0 .5rem;font-size:1.05rem;letter-spacing:.3em;color:var(--sky,#7dd3fc)}',
      /* ⚠ 只给上限、**绝不给 width/height**：一旦显式定宽，max-height 生效时
         高度被压而宽度不变，画面就被**拉扁**了（照 sakura `.sk-canvas` 那条注释）。 */
      '.gr-canvas{display:block;margin:0 auto .6rem;max-width:100%;',
      'max-height:calc(100vh - 15rem);border-radius:10px;',
      'border:1px solid var(--glass-border,rgba(255,217,122,.14));',
      'touch-action:none;user-select:none;-webkit-user-select:none;cursor:crosshair}',
      '.gr-msg{margin:0;font-size:.76rem;line-height:1.8;color:var(--text-dim,#b8a8c8);min-height:2.6em}',
      /* 「收笔」挂在**屏幕角落**（整个遮罩的右上角），不在面板里 ——
         理由同 sakura `.sk-close`：离游戏区够远，手指落低一点不会误触退出。 */
      '.gr-close{position:absolute;top:1rem;right:1rem;z-index:1;',
      'min-height:44px;padding:.5rem 1.2rem;border-radius:999px;cursor:pointer;',
      'font-size:.78rem;letter-spacing:.14em;color:var(--text,#f2e9f8);',
      'background:rgba(255,217,122,.1);border:1px solid var(--glass-border,rgba(255,217,122,.14));',
      'transition:background .25s ease}',
      '.gr-close:hover{background:rgba(255,217,122,.2)}',
    ].join('');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  /**
   * 建遮罩。**只建一次**，建好后留在 DOM 里（关闭只是去掉 `.on`）——
   * 这样关掉之后画布仍然存在、内容是静止的，测试才能拿它做反向验证。
   */
  function buildOverlay() {
    if (el.overlay) return el.overlay;
    injectStyles();

    var ov = document.createElement('div');
    ov.id = 'griseoGameOverlay';
    ov.setAttribute('aria-hidden', 'true');

    var panel = document.createElement('div');
    panel.className = 'gr-panel';

    var title = document.createElement('p');
    title.className = 'gr-title';
    title.textContent = API.title;
    panel.appendChild(title);

    var cv = document.createElement('canvas');
    cv.width = CW;                 // 只设**固有**尺寸；显示尺寸交给 CSS 等比缩
    cv.height = CH;
    cv.className = 'gr-canvas';
    panel.appendChild(cv);

    var msg = document.createElement('p');
    msg.className = 'gr-msg';
    panel.appendChild(msg);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'gr-close';
    close.textContent = '收笔';
    close.setAttribute('aria-label', '收起画笔，关闭小游戏');

    ov.appendChild(panel);
    ov.appendChild(close);
    document.body.appendChild(ov);

    el.overlay = ov;
    el.panel = panel;
    el.canvas = cv;
    el.ctx = cv.getContext('2d');
    el.msg = msg;
    el.close = close;

    /* 离屏缓存 —— 格子画在这里，只在变更时重画那几格。 */
    cache = document.createElement('canvas');
    cache.width = CW;
    cache.height = CH;
    cctx = cache.getContext('2d');
    dirtyFlags = new Uint8Array(COLS * ROWS);
    dirtyList = [];

    return ov;
  }

  function open() {
    buildOverlay();
    if (!el.overlay) return;
    openedAt = Date.now();                            // 保护期起点，见 bindOverlay
    running = true;
    resetGame();
    el.overlay.classList.add('on');
    el.overlay.setAttribute('aria-hidden', 'false');
  }

  function close() {
    if (!el.overlay) return;
    el.overlay.classList.remove('on');
    el.overlay.setAttribute('aria-hidden', 'true');
    running = false;
    dragging = false;
    lastCell = null;
    if (raf) { global.cancelAnimationFrame(raf); raf = null; }
  }

  /** 遮罩上的监听只挂一次（mount 可能被重复调用）。 */
  function bindOverlay() {
    if (bound) return;
    bound = true;

    /* ⚠ 刚打开的那一下不算：「收笔」是屏幕角落的按钮，可浏览器补发的延迟 click
       仍可能落在它上面 —— 400ms 保护期内拒收（与 sakura 同一条理由）。
       Escape 与内部调用不受这条限制：键盘不会「幽灵点击」。 */
    el.close.addEventListener('click', function () {
      if (Date.now() - openedAt < CLOSE_GUARD_MS) return;
      close();
    });

    document.addEventListener('keydown', function (e) {
      if (!el.overlay || !el.overlay.classList.contains('on')) return;
      if (e.key === 'Escape' || e.key === 'Esc') close();
    });

    bindDrag();
  }

  /* ══════════════════════════════════════════════════════════════════
   *  四、mount —— 把游戏卡渲染进下方区块的游戏槽
   * ══════════════════════════════════════════════════════════════════ */

  /**
   * @param {HTMLElement} host `.bottom-game` 槽
   * ⚠ 可以重复调用（`ElysiaBottom.mount` 重画时会再调一次）——
   *   卡片重建，但样式与遮罩上的监听**不会重复挂**（`STYLE_ID` / `bound` 挡着）。
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
      if (!grid) resetGame();       // 先摆好那块中央 3×3（遮罩还没开，画在暗处）
      if (el.msg) el.msg.textContent = MSG_OPEN;
    } catch (err) {
      /* ⚠ 绝不抛：游戏坏了只是没得玩，不该让整页停摆 */
      console.warn('[ElysiaGames.griseo] mount 出错：', err);
    }
  }

  var API = {
    title: '上色',
    hint: '把这张画，涂成你的颜色。',
    mount: mount,
  };

  /* ══════════════════════════════════════════════════════════════════
   *  五、围地填充算法 —— 从 Task 1 的原型**原样移植**（R24）
   *
   *  来源：`C:\tmp\griseo_fill_proto.js`（生效原型 R33，210 行，已过 10 轮复核）。
   *  移植清单执行情况见 `task-1-report.md` §11.6（含 (i)(j)(k)）与 §9.8 的 (a)(c)(f)。
   *  唯一改动：**去掉文件尾的 `module.exports`**（那是给 node 测试用的，游戏文件是 IIFE）。
   *
   *  ── 接口 ──────────────────────────────────────────────────────────
   *    fillEnclosed(grid, w, h, owner) -> { filled }
   *      grid : Int8Array(w*h)，**行主序** idx = y*w + x
   *             0 = 空白 / 1 = 玩家领地 / 2 = 玩家笔触 / >=3 = 造物
   *      owner: 填充成谁（玩家 = 1）；**1 / 2 是写死的哨兵**，owner 只决定输出颜色
   *      返回 : { filled } = 本次**新填**的格数
   *   ⚠ **原地改 grid**（不是纯函数），除此之外无副作用 / 不碰 DOM / ES5。
   *
   *  ── ⚠ 移植时**不许动**的几条（复核点名，改了结论就变）──────────────
   *   (a) `1` / `2` 是**写死的哨兵**：`touchesHome` 里写 `=== 1`、收集轨迹写 `=== 2`；
   *       `owner` 只决定输出颜色 ⇒ 传非玩家 owner 会**静默错**（Task 4 若复用要先参数化）。
   *   (i) ⚠ **玩家领地必须保持 4 连通**（Task 4 的断笔触有要求）：`buildLid` **只走领地** ⇒
   *       两端都贴着家、但两块领地**不 4 连通**时，封口线走不通 ⇒ **整笔被静默拒绝**。
   *       复核实测：家连成一片 0/1200 被拒；家是两座孤岛 620/1200 = **51.7% 被拒**。
   *       ⇒ Task 4 的碰撞/断裂逻辑**要么保证领地连通，要么在调用前把断开的笔触清掉**。
   *   (j) ⚠ **墙与泛洪都必须 4 连通**（对角不算连通）。复核穷举 4×4 上「单分量 + 0 自由端」
   *       的轨迹 382 个，其中 4 个（1.0%）在 4/8 连通下结论不同 ⇒ **别顺手改成 8 邻域**。
   *   (k) 封口线**等长时取哪一条都行**（Dijkstra 的 tie-break 是实现细节，实测无害）。
   *       不必复刻具体 tie-break，但**必须**保持「只走领地格、走不通就不入选」。
   *   (c) 「笔尖落在自己颜色上」≠「端点在 `1` 的四邻」：`touchesHome` 是**四邻判定**。
   *   ⚠ 「`touchesHome` 冗余」这个结论**已被撤回**（§11.7）：两自由端**彼此 4 相邻**
   *      （组件是一枚 2 格「插头」）时，`buildLid` 一步就够、空 lid 也算成功 ⇒
   *      那半句是**唯一**那道闸。原版 filled=15，把它换成 `true` 变 16 ✗ —— 别删。
   *
   *  ── 适用边界（别当它「全对」）─────────────────────────────────────
   *   · 只认轨迹：领地与外沿都不参与围合 ⇒「轨迹 + 画布外沿」围出的贴边区域**不算围住**。
   *   · ④ 内部判定 = 「墙 + 从画布四条外边泛洪，**灌不到的空白 = 内部**」——
   *     ⚠ **绝对不要**退回「逐行 span」：凹形闭合环上它会多填 111%（= 断言㉛ 守的那条）。
   *   · ⑤ 上色：内部空白 → owner；**所有 `2` 格 → owner（无条件）**；领地(1)/造物(>=3) 不动。
   * ══════════════════════════════════════════════════════════════════ */

  var DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  /* 封口线：从 from 到 to 的**最短 4 连通路径**（不含两端）。
     · ⚠ **中间格只许走玩家领地(1)** —— 不许横穿空白（否则会画出一道「幻影墙」）。
     · 只走四邻 ⇒ **绝不会有对角步**。
     · 走不通 ⇒ 返回 null ⇒ 调用方判这一笔不入选（不围合，也不假装封口）。 */
  function buildLid(grid, w, h, from, to, out) {
    var n = w * h;
    var INF = 1 << 28;
    var bestD = new Int32Array(n);
    var prev = new Int32Array(n);
    var done = new Uint8Array(n);
    var i, d, x, y, nx, ny, j;
    for (i = 0; i < n; i++) { bestD[i] = INF; prev[i] = -1; }
    bestD[from] = 0;
    for (;;) {
      var u = -1;
      var bu = INF;
      for (i = 0; i < n; i++) if (done[i] === 0 && bestD[i] < bu) { bu = bestD[i]; u = i; }
      if (u < 0) break;
      if (u === to) break;
      done[u] = 1;
      x = u % w;
      y = (u - x) / w;
      for (d = 0; d < DIRS.length; d++) {
        nx = x + DIRS[d][0];
        ny = y + DIRS[d][1];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        j = ny * w + nx;
        if (done[j] === 1) continue;
        if (j !== to && grid[j] !== 1) continue;      /* ⚠ 中间格只许走领地 */
        var step = (grid[j] === 1) ? 2 : 3;
        if (bestD[u] + step < bestD[j]) { bestD[j] = bestD[u] + step; prev[j] = u; }
      }
    }
    if (bestD[to] >= INF) return null;
    var path = [];
    var k = to;
    while (k !== -1 && k !== from) { path.push(k); k = prev[k]; }
    for (i = path.length - 1; i >= 0; i--) {
      if (path[i] !== to && path[i] !== from) out.push(path[i]);
    }
    return out;
  }

  /* 某个格子的四邻里有没有玩家领地(1) */
  function touchesHome(grid, w, h, i) {
    var x = i % w;
    var y = (i - x) / w;
    for (var d = 0; d < DIRS.length; d++) {
      var nx = x + DIRS[d][0];
      var ny = y + DIRS[d][1];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (grid[ny * w + nx] === 1) return true;
    }
    return false;
  }

  function fillEnclosed(grid, w, h, owner) {
    if (!w || !h) return { filled: 0 };
    var n = w * h;
    var i, t, d, x, y, nx, ny, j;

    /* ① 收集轨迹 + 按 4 连通切成【连通分量】 */
    var trail = [];
    for (i = 0; i < n; i++) if (grid[i] === 2) trail.push(i);
    if (trail.length === 0) return { filled: 0 };

    var seen = new Uint8Array(n);
    var comps = [];
    for (t = 0; t < trail.length; t++) {
      var start = trail[t];
      if (seen[start] === 1) continue;
      var cells = [];
      var ends = [];
      var q = [start];
      seen[start] = 1;
      while (q.length > 0) {
        i = q.pop();
        cells.push(i);
        x = i % w;
        y = (i - x) / w;
        var deg = 0;
        for (d = 0; d < DIRS.length; d++) {
          nx = x + DIRS[d][0];
          ny = y + DIRS[d][1];
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          j = ny * w + nx;
          if (grid[j] === 2) {
            deg++;
            if (seen[j] === 0) { seen[j] = 1; q.push(j); }
          }
        }
        if (deg <= 1) ends.push(i);
      }
      comps.push({ cells: cells, ends: ends });
    }

    /* ② / ③ 只留一份「墙」= 所有入选分量的格 + 它们的封口线 */
    var wall = new Uint8Array(n);
    for (t = 0; t < comps.length; t++) {
      var c = comps[t];
      var ok = false;
      var lid = [];
      var e0, e1;
      /* "两端各自四邻都贴着某一格玩家领地(1)" —— **不要求领地连成一片**
         ⚠ 这半句**不能省**（§11.7：2 格「插头」时它是唯一那道闸）。 */
      var anchored = (c.ends.length === 2 &&
                      touchesHome(grid, w, h, c.ends[0]) &&
                      touchesHome(grid, w, h, c.ends[1]));
      if (c.ends.length === 0) {
        ok = true;                                     /* 自己成环 */
      } else if (anchored) {
        ok = true;
        e0 = c.ends[0];
        e1 = c.ends[1];
        if (buildLid(grid, w, h, e0, e1, lid) === null) { ok = false; }   /* 走不通 ⇒ 不入选 */
      }
      if (!ok) continue;
      var k;
      for (k = 0; k < c.cells.length; k++) wall[c.cells[k]] = 1;
      for (k = 0; k < lid.length; k++) wall[lid[k]] = 1;
    }

    /* ④ 内部判定：把「墙」当墙、从**画布四条外边**泛洪；灌不到的空白 = 内部。
          （⚠ 别退回「逐行 span」——见本节小标题下的边界。） */
    var outside = new Uint8Array(n);
    var stack = [];
    for (x = 0; x < w; x++) {
      if (wall[x] === 0 && outside[x] === 0) { outside[x] = 1; stack.push(x); }
      j = (h - 1) * w + x;
      if (wall[j] === 0 && outside[j] === 0) { outside[j] = 1; stack.push(j); }
    }
    for (y = 0; y < h; y++) {
      j = y * w;
      if (wall[j] === 0 && outside[j] === 0) { outside[j] = 1; stack.push(j); }
      j = y * w + w - 1;
      if (wall[j] === 0 && outside[j] === 0) { outside[j] = 1; stack.push(j); }
    }
    while (stack.length > 0) {
      i = stack.pop();
      x = i % w;
      y = (i - x) / w;
      for (d = 0; d < DIRS.length; d++) {
        nx = x + DIRS[d][0];
        ny = y + DIRS[d][1];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        j = ny * w + nx;
        if (wall[j] === 0 && outside[j] === 0) { outside[j] = 1; stack.push(j); }
      }
    }

    /* ⑤ 上色：内部空白 → owner；**所有 2 格 → owner**；领地(1)/造物(>=3) 一律不动。 */
    var filled = 0;
    for (i = 0; i < n; i++) {
      if (grid[i] === 2) { grid[i] = owner; filled++; continue; }
      if (grid[i] !== 0) continue;
      if (outside[i] === 0) { grid[i] = owner; filled++; }
    }
    return { filled: filled };
  }

  /* ⚠ 原型文件尾那段 `module.exports` **已按移植清单 (f) 去掉**（游戏文件是 IIFE）。
     ⚠ Task 3 才会在 `endStroke()` 里调用 `fillEnclosed(grid, COLS, ROWS, HOME)` ——
        本任务只把它搬进来、不接上（这正是 Task 2 / Task 3 的分界）。 */
  void fillEnclosed;

  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.griseo = API;

})(window);
