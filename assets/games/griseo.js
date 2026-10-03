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
 * ── 任务进度 ────────────────────────────────────────────────────────
 *   Task 2：骨架 + 遮罩 + 网格 + 离屏渲染 + **玩家可拖动**（笔触落成 `2`）。
 *   Task 3（本任务）：**松手回填** —— 松手时若**笔尖挨着自己的颜色**（四邻有 `1`）
 *     就调 `fillEnclosed` 把围住的区域染成领地（带**晕染动画**）；否则整条笔触
 *     **淡去**回空白（「白画一场」）。
 *   Task 4：造物（`>=3`）；Task 5：击杀 / 结算 / 接入页面。
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
  /* ⚠ BRUSH_UP 的单位是**屏幕（CSS）像素**，不是画布像素 —— 见 `eventToCell`：
     它在 `clientY - r.top` 之后、乘 `CH/r.height` **之前**减掉，所以是在**屏幕坐标系**里
     把笔尖整体上抬 44 个 CSS px（「防手指挡视线」，跟手指大小同量级）。
     ⇒ 换算到画布坐标会随画布显示尺寸而变：
        · 桌面（画布≈1:1，576 显示宽）：44 画布 px ≈ **3.7 格**
        · 手机 375 宽（画布显示≈312×209，CH/height≈1.84）：≈ **81 画布 px ≈ 6.75 格**
     两处数字看着差很多，但**屏幕上是同一个 44px** —— 这正是想要的：
     偏移要跟着**手指**（屏幕）走，不该跟着画布缩放走。 */
  var BRUSH_UP = 44;             // 笔尖在手指**上方** 44 个屏幕 px（防手指挡视线）
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
  var MSG_STROKE = '……笔尖正跟着你的手。';
  var MSG_FILL = '围住啦 —— 这一片都染成了你的颜色。';
  var MSG_FADE = '笔尖没绕回自己的颜色，这一笔散掉了。';
  var CLOSE_GUARD_MS = 400;      // 刚打开的那一小段里拒收「收笔」的点击（照 sakura）
  var STYLE_ID = 'griseoGameStyles';

  /* ── 动画参数（Task 3 的「晕染」/「淡去」）─────────────────────────
     全部以**屏幕/墙钟毫秒**计，用 `Date.now()`（不依赖 performance 计时精度）。 */
  var FILL_MS = 260;             // 上色：每个新格从「湿笔触色」渐到「领地色」的时长
  var FILL_STEP_MS = 22;         // 上色：按「离笔触的格距」错峰，做出**由外向内晕开**的感觉
  var FILL_MAX_STEP = 14;        // 错峰档数封顶（大区域别让总时长失控）
  var FADE_MS = 260;             // 淡去：笔触整体从湿色渐回空白

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

  /* 动画状态（Task 3 的晕染 / 淡去）——
     同一时刻只跑一段动画；`animIdx[i]>=0` 表示「第 i 格此刻正被动画接管」。 */
  var animActive = false;
  var animCells = null;          // 参与动画的格索引
  var animDelay = null;          // 每格的起步延迟（ms）
  var animIdx = null;            // Int32Array(n)：格 → 在 animCells 里的下标（-1 = 不参与）
  var animFrom = null;           // 起始颜色（hex）
  var animTo = null;             // 目标颜色（hex）
  var animDur = 0;               // 单格渐变时长（ms）
  var animTotal = 0;             // 整段动画总时长（ms）
  var animStart = 0;             // 动画起点（Date.now）
  var animRaf = null;            // 动画驱动的 rAF
  var animOnSettle = null;       // 动画结束时的收尾（淡去要把格子落成 0）

  /* ══════════════════════════════════════════════════════════════════
   *  一、渲染 —— 离屏缓存 + 只画脏格
   * ══════════════════════════════════════════════════════════════════ */

  /** 铺底色：露在格子缝里的就是网格线。 */
  function paintBg() {
    if (!cctx) return;
    cctx.fillStyle = COL_LINE;
    cctx.fillRect(0, 0, CW, CH);
  }

  /* ── 颜色工具（晕染/淡去要把两个 hex 混起来）────────────────────────
     ES5：只用 charAt / parseInt / Math.round，不碰模板串与 8 进制字面量。 */
  function hexToRgb(h) {
    h = h.charAt(0) === '#' ? h.slice(1) : h;
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var v = parseInt(h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  /** 把两个 hex 按 t（0..1）线性混出一个 `rgb(...)` 串。 */
  function lerpHex(a, b, t) {
    var ca = hexToRgb(a), cb = hexToRgb(b);
    var r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
    var g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
    var bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  /** 这一格在 `grid` 里「该是什么颜色」（不管动画）。 */
  function cellColor(i) {
    var v = grid ? grid[i] : EMPTY;
    if (v === HOME) return COL_HOME;
    if (v === STROKE) return COL_STROKE;
    if (v >= 3) return '#6ea86b';                // 造物（Task 4）—— 本任务用不到
    return COL_EMPTY;
  }

  /** 把一个格子画进离屏缓存（四周留 BASE_PAD 像素 = 网格线）。 */
  function paintCell(i) {
    var c = cellColor(i);
    /* ⚠ 动画接管中：格子此刻的颜色由动画算，不看 grid（grid 已经是终值，
       只是**视觉**上还没干透）。 */
    if (animActive && animIdx && animIdx[i] >= 0) c = animColorAt(animIdx[i]);
    paintCellColor(i, c);
  }

  /** 用**指定颜色**铺一格（动画每帧直接调它，绕过 grid 查表）。 */
  function paintCellColor(i, color) {
    if (!cctx) return;
    var x = i % COLS;
    var y = (i - x) / COLS;
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
   *  一·B、动画 —— 晕染（上色）/ 淡去（白画一场）
   *
   *  ⚠ 设计要点：**grid 在动画一开始就已经是终值** —— 动画只改「视觉上这格
   *     此刻是什么颜色」，绝不改玩法状态。所以：
   *     · 中途被任何东西打断（收笔 / 重新落笔 / 关闭）都能**立刻结算到终值**，
   *       不会让玩法状态卡在中间态。
   *     · 断言读 `grid`（或画布像素）时，等动画跑完就一定是干净读数。
   * ══════════════════════════════════════════════════════════════════ */

  /** 动画进行到第 k 个格子的当前颜色（起步延迟 + 缓出）。 */
  function animColorAt(k) {
    var t = (Date.now() - animStart - animDelay[k]) / animDur;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    t = 1 - (1 - t) * (1 - t);                   // ease-out：起笔快、落定慢
    return lerpHex(animFrom, animTo, t);
  }

  function ensureAnimLoop() {
    if (animRaf) return;
    animRaf = global.requestAnimationFrame(function step() {
      animRaf = null;
      if (!animActive) return;
      if (Date.now() - animStart >= animTotal) { settleAnim(); return; }
      for (var k = 0; k < animCells.length; k++) paintCellColor(animCells[k], animColorAt(k));
      blit();
      ensureAnimLoop();
    });
  }

  /** 立刻把动画结算到终值（可被任何打断调用）。 */
  function settleAnim() {
    if (!animActive) return;
    animActive = false;
    if (animRaf) { global.cancelAnimationFrame(animRaf); animRaf = null; }
    var cells = animCells;
    if (animOnSettle) { var f = animOnSettle; animOnSettle = null; f(); }
    for (var k = 0; k < cells.length; k++) paintCell(cells[k]);
    animCells = null; animDelay = null; animIdx = null; animFrom = null; animTo = null;
    blit();
  }

  /**
   * 起一段动画。
   * @param cells  参与动画的格索引
   * @param delays 每格起步延迟（ms，与 cells 等长）
   * @param dur    单格渐变时长（ms）
   * @param from   起始色（hex）
   * @param to     目标色（hex）
   * @param settle 结算回调（在终值落定前调；淡去靠它把格子写成 0）
   */
  function startAnim(cells, delays, dur, from, to, settle) {
    if (!cells || cells.length === 0) { if (settle) settle(); return; }
    /* 先把挂着的脏渲染冲掉 —— 动画接管后每帧自己重画这几格。 */
    if (raf) { global.cancelAnimationFrame(raf); raf = null; }
    if (dirtyList.length) render();

    var n = COLS * ROWS;
    animCells = cells;
    animDelay = delays;
    animIdx = new Int32Array(n);
    var i, k;
    for (i = 0; i < n; i++) animIdx[i] = -1;
    var maxDelay = 0;
    for (k = 0; k < cells.length; k++) {
      animIdx[cells[k]] = k;
      if (delays[k] > maxDelay) maxDelay = delays[k];
    }
    animFrom = from;
    animTo = to;
    animDur = dur;
    animTotal = maxDelay + dur;
    animStart = Date.now();
    animOnSettle = settle || null;
    animActive = true;
    for (k = 0; k < cells.length; k++) paintCellColor(cells[k], animColorAt(k));
    blit();
    ensureAnimLoop();
  }

  /** 上色晕染：新格从「湿笔触色」由外向内晕到「领地色」。 */
  function startFillAnim(newCells, depths, maxDepth) {
    var capped = maxDepth > FILL_MAX_STEP ? FILL_MAX_STEP : maxDepth;
    var delays = [];
    var k;
    for (k = 0; k < newCells.length; k++) {
      var d = depths[k] > capped ? capped : depths[k];
      delays.push(d * FILL_STEP_MS);
    }
    startAnim(newCells, delays, FILL_MS, COL_STROKE, COL_HOME, null);
  }

  /** 白画一场：整条笔触从湿色淡回空白，落定时写成 `0`。 */
  function startFadeAnim(cells) {
    var delays = [];
    for (var k = 0; k < cells.length; k++) delays.push(0);
    startAnim(cells, delays, FADE_MS, COL_STROKE, COL_EMPTY, function () {
      for (var j = 0; j < cells.length; j++) grid[cells[j]] = EMPTY;
    });
  }

  /** 多米诺 BFS：算每个新格离「笔触格」的格距（0 = 本身就是笔触）。
      上色时按这个距离错峰 ⇒ 视觉上从笔触那道边**向内晕开**。 */
  function computeDepths(newCells, before) {
    var n = COLS * ROWS;
    var lookup = new Int32Array(n);
    var i, k;
    for (i = 0; i < n; i++) lookup[i] = -1;
    for (k = 0; k < newCells.length; k++) lookup[newCells[k]] = k;
    var depth = new Int32Array(newCells.length);
    for (k = 0; k < newCells.length; k++) depth[k] = -1;
    var queue = [];
    for (k = 0; k < newCells.length; k++) {
      if (before[newCells[k]] === STROKE) { depth[k] = 0; queue.push(k); }
    }
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      var ci = newCells[cur];
      var cx = ci % COLS;
      var cy = (ci - cx) / COLS;
      for (var d = 0; d < 4; d++) {
        var nx = cx + DIRS[d][0];
        var ny = cy + DIRS[d][1];
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        var nk = lookup[ny * COLS + nx];
        if (nk >= 0 && depth[nk] === -1) { depth[nk] = depth[cur] + 1; queue.push(nk); }
      }
    }
    var maxDepth = 0;
    for (k = 0; k < depth.length; k++) {
      if (depth[k] < 0) depth[k] = maxDepth;       // 兜底（理论上不会有）
      if (depth[k] > maxDepth) maxDepth = depth[k];
    }
    return { depth: depth, max: maxDepth };
  }

  /* ══════════════════════════════════════════════════════════════════
   *  二、玩法 —— 拖动，把经过的格标成笔触
   * ══════════════════════════════════════════════════════════════════ */

  /** 开局：清空网格，把中央 3×3 变成她的领地（画布原点）。 */
  function resetGame() {
    settleAnim();                                // 收掉可能挂着的动画（换 grid 之前必须先结算）
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
    settleAnim();                                // 新的一笔开始 ⇒ 上一段动画立即结算到终值
    dragging = true;
    lastCell = { x: cell.cx, y: cell.cy };
    brushX = cell.px; brushY = cell.py;          // 浮点位置：笔尖圈跟手，不跳格
    markStroke(cell.cx, cell.cy);
    if (el.msg) el.msg.textContent = MSG_STROKE;
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

  /**
   * 松手 —— Task 3 的「回填 vs 白画一场」都在这里。
   *
   * ⚠ 「笔尖落在自己的颜色上」的口径 **与算法里的 `touchesHome` 完全一致**：
   *   取笔尖那一格的**四邻**，只要有一格是 HOME(`1`) 就算「挨着自己的颜色」。
   *   · 不是「格子本身 == 1」—— 笔触永远落不到 `1` 上（`markStroke` 只在 `0` 上落笔）。
   *   · 不是 8 邻域 —— `touchesHome` 就是四邻，口径必须对齐，否则会出现
   *     「网关过了、算法却没认（或反之）」的错位。
   */
  function endStroke() {
    if (!dragging) return;
    dragging = false;
    var cell = lastCell;
    lastCell = null;
    if (!grid) { scheduleRender(); return; }

    var tip = cell ? (cell.y * COLS + cell.x) : -1;
    var anchored = tip >= 0 && touchesHome(grid, COLS, ROWS, tip);

    /* ⚠ 闸门**只查笔尖那一端**；而 `fillEnclosed` 内部要求「轨迹**两端**各自四邻都贴家」
       （`ends.length===2 && touchesHome(e0) && touchesHome(e1)`）—— 二者**不等价**：
       只一端贴家时，闸门放行、算法**收不了内部**，但按算法 ⑤「所有 `2` 格无条件变 owner」，
       这条线本身仍会被收编成领地。这是 brief「笔尖落在自己的颜色上」的直译，不是 bug。
       ⚠ **Task 4** 的对称碰撞 / 断笔触若复用 `anchored`，务必注意这处语义差（交接里已点名）。 */

    if (anchored) {
      /* ① 快照「上色前」，好算出这一笔**新染**了哪些格（晕染动画要用）。 */
      var before = new Int8Array(grid);
      fillEnclosed(grid, COLS, ROWS, HOME);        // ⚠ 原地改 grid（不是纯函数）
      /* ② 新格 = 现在 `1`、而之前不是 `1` 的格（含被无条件收编的笔触 `2`→`1`）。 */
      var newCells = [];
      for (var i = 0; i < grid.length; i++) {
        if (grid[i] === HOME && before[i] !== HOME) newCells.push(i);
      }
      if (newCells.length > 0) {
        var dd = computeDepths(newCells, before);
        startFillAnim(newCells, dd.depth, dd.max); // 带晕染动画
        if (el.msg) el.msg.textContent = MSG_FILL;
      } else {
        fullRender();                              // 空笔（没改动）—— 直接把现状画平
      }
      return;
    }

    /* 笔尖没回到自己的颜色 ⇒ **白画一场**：整条笔触淡回空白（落定后写成 `0`）。 */
    var strokeCells = [];
    for (var j = 0; j < grid.length; j++) if (grid[j] === STROKE) strokeCells.push(j);
    if (strokeCells.length > 0) {
      startFadeAnim(strokeCells);
      if (el.msg) el.msg.textContent = MSG_FADE;
    } else {
      scheduleRender();
    }
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
      /* ⚠ 固定预留**两行**高度（`min-height:3.6em` = 2 × line-height 1.8）——
         面板是垂直居中的，`.gr-msg` 一变行数，**整块画布会跟着上下跳**。
         Task 3 给消息换了文案（开场 2 行 → 松手后 1 行），实测画布因此**位移约 6px**、
         换算到格子足足差半格多 —— 手指按着画布时它自己动，是实打实的**手感事故**。
         钉成常数高度后：无论哪条文案，画布都待在原地。 */
      '.gr-msg{margin:0;font-size:.76rem;line-height:1.8;color:var(--text-dim,#b8a8c8);min-height:3.6em}',
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
    settleAnim();                                    // 收笔 ⇒ 动画立刻结算（画布停在终值，静止）
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
     ⚠ `fillEnclosed` 现在**真的被调用了** —— 由 `endStroke()` 在「松手且笔尖挨着
        自己的颜色」时调用（`fillEnclosed(grid, COLS, ROWS, HOME)`，原地改 grid）。
        Task 2 尾部那行「只搬不接」的占位 `void fillEnclosed;` 到此删掉。 */

  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.griseo = API;

})(window);
