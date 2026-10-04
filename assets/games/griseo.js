/**
 * assets/games/griseo.js — 格蕾修的小游戏：「上色」
 *
 * 呀，她这一页最后一块拼图♥ —— 也是「每位英桀一个**真正独立**的小游戏」
 * 这个契约的第四个实现（前三位：梅比乌斯的贪吃蛇、樱的「一瞬」、科斯魔的「守灯」）。
 *
 * ── 为什么是这个玩法 ────────────────────────────────────────────────
 *   她的刻印是「繁星」，可她的母题是**画画** —— 她一辈子都在把世界涂成自己的颜色。
 *   所以这里给她一个**圈地**玩法：驶着画笔走过去，绕回自己的颜色，
 *   圈住的那块就变成她的领地。玩法叫「上色」，正对她「色彩浸染」的能力。
 *
 * ── ⚠ 2026-10-04：操作范式**整个换掉了** ──────────────────────────────
 *   旧版是「按住画布拖动、笔尖跟着手指」。需求方实测：手感 / 围地判定 /
 *   造物行为 / 碰撞断笔 / 键盘备选**五处都有问题**。
 *   根因不在参数 —— 这一款要的是**走位**，不是画画。所以：
 *
 *     · 笔由**摇杆指挥行走**（触摸设备），笔**速度与造物一致**（同一张速度表）；
 *     · 桌面端只给键盘（方向键按住 = 持续走）；
 *     · 笔**不再跟手指** —— `BRUSH_UP` / `eventToCell` / 指针拖动那一整套都删了。
 *
 *   完整规则见 `docs/superpowers/specs/2026-10-04-griseo-color-game-rewrite-spec.md`。
 *
 * ── 契约（spec §4.5）─────────────────────────────────────────────────
 *     window.ElysiaGames.griseo = { title, hint, mount(host) };
 *
 *   `ElysiaBottom.mount({ game: THEME.game })` 建出 `.bottom-game` 槽，
 *   再按 `THEME.game.module` 找到这里、调 `mount(host)`。
 *
 * ── ⚠ 这个文件的四条纪律（与另三份一致）───────────────────────────────
 *   · **一句台词都没有。** 界面上的字是**站点 UI 文案**，不是她说的话。
 *   · **和探索度完全解耦。** 玩多久、圈多大，都**不进** `__ELY_EXPLORE__`。
 *   · **绝不抛异常。** 任何一步出问题都只 `console.warn` ——
 *     一次未捕获的异常会让整页剩下的脚本集体停摆，而页面看上去还是好的。
 *   · **样式自己注入**（`injectStyles()`）—— 不给 `griseo/index.html` 加一行 CSS。
 *
 * ── ⚠ 笔的「抬起 / 落着」两态是**防线**，不是装饰 ─────────────────────
 *   碰撞断笔之后，笔**必须回到自己的领地**才能重新落笔（§5.1 第 3 条）。
 *   不这么做的话，撞断之后笔继续走会立刻画出一截**与家断开的**新笔触，
 *   而下一次结算时它会被 `fillEnclosed` 第 ⑤ 步**无条件**收编成领地
 *   ⇒ 玩家领地裂成**孤岛** ⇒ `buildLid`（只走领地）走不通 ⇒
 *   **围合判定成批静默被拒**（上游复核实测 **51.7%**）。见 spec §12.1。
 *
 * ── ⚠ 造物为什么是「颜料触须」而不是「一圈圈扩」（与 spec §7.2 的差异）──
 *   spec §7.2 推荐的「外扩矩形环」有一个**结构性缺陷**：外接矩形一旦贴到画布边，
 *   整圈就**永远扩不成**，那只造物从此只剩「巡边 + 撤销」⇒ 画面上看起来**死了**
 *   （spec §7.1 A1 明令要修）。而 §7.2 自己写着「**写法可换**，只要过 A1~A4」。
 *   所以这里改用**触须式扩张**：从领地边界（只从「有 ≥2 个自家邻居」的格子出发，
 *   防细长的刺）朝一个空方向长一条最多 `TENDRIL_MAX` 格的**活笔触**，
 *   走完**收编成自己的领地**。四条硬性要求全都天然满足：
 *     A1 领地单调增长 ✓（只要边界上还有空地就一定能长）
 *     A2 不卡死 ✓（实在没地方长 → 冷却后重试，而画面另有计时条在动）
 *     A3 不踱步 ✓（它**从不回头**，cursor 轮转保证出笔点不呆板）
 *     A4 不越界不穿墙 ✓（候选只取空白格）
 *   而且它**真的有「活笔触」** —— 玩家撞上去照样断笔（spec §3.5 的对称碰撞成立）。
 */
(function (global) {
  'use strict';

  /* ── 玩法参数 ────────────────────────────────────────────────────────
     ⚠ 这几个数是**手感**，改它们等于改这一页的手感。
     ⚠ COLS/ROWS **会变**（阶段扩张）—— 任何派生量（CW/CH/出生点/遍历）
       都必须在**用到的时候**按当时的 COLS/ROWS 现算，绝不能再抄一份快照。 */
  var COLS = 48, ROWS = 32;      // 网格（初始档；扩张后更大）
  var CELL = 12;                 // 一格多少画布像素
  var CW = COLS * CELL;          // 576（初始档）
  var CH = ROWS * CELL;          // 384（3:2）
  var HOME_R = 3;                // 玩家起始占**中央 3×3**（「画布原点」）

  /* ════════════════════════════════════════════════════════════════════
   *  格子的编码 —— **一套数字，三方共用**（玩家 / 造物 / 算法）。
   *
   *   ⚠ 这套编码是 `fillEnclosed` 的契约，**别动**：
   *     · `0` 空白、`1` 玩家领地、`2` 玩家笔触 —— **只有 `1` 和 `2` 是墙**。
   *     · **`>= 3` 一律是造物**，而造物格在算法里是**可通行的、不是墙**
   *       —— 所以玩家能把自己的笔触从造物领地「外面」绕一圈，把它整块圈进去。
   *
   *   造物 k 的**领地** = `3 + 2k`（偶数档：3, 5, 7, 9, 11, 13）
   *   造物 k 的**笔触** = `4 + 2k`（奇数档：4, 6, 8, 10, 12, 14）
   *   ⇒ `slot = (v - 3) >> 1`；槽位最多 `ENEMY_MAX = 6` 个，最大码 14。
   *
   *   ⚠ **造物笔触为什么不能借用 `2`**：算法的「轨迹」写死只认 `2`（玩家的笔触）。
   *     造物若也用 `2`，它自己那一条会被当成**玩家的**轨迹参与围合判定 —— 错得离谱。 */
  var EMPTY = 0;     // 空白
  var HOME = 1;      // 玩家领地
  var STROKE = 2;    // 玩家笔触
  var ENEMY_BASE = 3;

  /* ── 造物参数 ──────────────────────────────────────────────────────── */
  var ENEMY_MAX = 6;             // 槽位上限（编码 / 颜色 / 出生角的数组长度）
  var ENEMY_HOME_R = 2;          // 造物起始领地：2×2 一小块
  /* 速度**分档**（毫秒 / 格）—— 下标就是「速度档」（0 最慢）。⚠ 越低越快。
     ⚠ **玩家笔用的是同一张表**（spec §4.1：笔的速度要和造物一样）。 */
  var ENEMY_STEP_MS = [200, 150, 105, 70];
  /* 难度：**分档 + 封顶**。占 0.2 加一个（封顶 = 本档 cap）；占 0.15 升一档（封顶 3）。 */
  var DIFF_NUM_STEP = 0.2;
  var DIFF_SPD_STEP = 0.15, DIFF_SPD_CAP = 3;
  var TENDRIL_MAX = 4;           // 一条「颜料触须」最多长几格
  /* 围地环：绕**领地外接矩形外扩 `RING_PAD` 格**的周长走一圈。
     ⚠ **为什么是外扩 2 而不是 1**：环内部 = box 外扩 1 的区域。
       外扩 1 时环内部正好是「自己已有的地」⇒ 围了等于没围（只把环本身收编成地）；
       外扩 2 才围得住**新东西** —— 那一圈空白，以及**恰好落在里面的玩家的地**。
       这正是需求方 2026-10-04 要的「完全对称」：玩家围地吃造物的地，造物围地吃玩家的地。
     ⚠ 环是**闭合回路**（`ends.length === 0`）⇒ 算法走「自己成环」那一支，
       **不需要封口线、也不依赖「家 4 连通」** ⇒ 造物这条路**没有**玩家侧那个孤岛风险。
     ⚠ `RING_MAX` 是周长上限：box 长大之后环越来越长（一圈要走几十秒），
       超过就交回触须 —— 自然收敛，不会卡在描边。 */
  var RING_PAD = 2;
  var RING_MAX = 44;             // 环的格数上限（约对应 box 9×9）
  var ENEMY_COOLDOWN_MS = 260;   // 两笔之间的停顿（它的「呼吸」）
  var ENEMY_STUCK_MS = 1500;     // 彻底没地方长时的冷却（到期重试 —— 玩家的地会变）

  /* ── 阶段 —— 累计击杀解锁更大的画布 ─────────────────────────────────
     下标 = 阶段号；`atKills` 是进入这一档所需的累计击杀数（0 = 开局）。
     · `cols/rows` —— 画布网格；三档都保持 3:2，扩张时既有内容**搬到正中央**。
     · `cap`       —— 这一档场上造物的**同时上限**（难度公式的封顶）。
     · `floor`     —— 这一档的造物**保底数量**：地变大了以后「占比」会被稀释，
                      光靠占比公式反而会掉回 1 只 ⇒ 用保底把「更多造物上场」钉住。 */
  var STAGES = [
    { cols: 48, rows: 32, cap: 4, floor: 1, atKills: 0 },
    { cols: 60, rows: 40, cap: 5, floor: 3, atKills: 2 },
    { cols: 72, rows: 48, cap: 6, floor: 4, atKills: 4 }
  ];
  var KILLS_PER_STAGE = 2;

  /* ── 一局与结算 ────────────────────────────────────────────────────── */
  var ROUND_MS = 180000;             // 一局 3 分钟
  var BEST_KEY = 'griseoColorBest';  // 「最高纪录」= 历史最好**完成度(%)**
  var FLASH_MS = 380;                // 造物被吃时闪它「朋友色」的时长（ms）

  /* ── 动画（上色的「晕染」）─────────────────────────────────────────── */
  var FILL_MS = 260;             // 每个新格从「湿笔触色」渐到「领地色」的时长
  var FILL_STEP_MS = 22;         // 按「离笔触的格距」错峰 ⇒ 由外向内晕开
  var FILL_MAX_STEP = 14;        // 错峰档数封顶（大区域别让总时长失控）
  var FADE_MS = 300;             // **白画一场**：笔触整体淡回空白（第 3 条）

  /* ── 命（第 2 条，2026-10-04 需求方）────────────────────────────────
     画笔被造物**截断** = 倒下一次（扣一条命），在**自己的区域里随机位置**复活；
     命用完 ⇒ 本局结束。
     造物被截断 ⇒ **当场散掉，不复活**（`slayEnemy`）。 */
  var START_LIVES = 3;

  /* ── 攻击欲望（第 4 条）────────────────────────────────────────────
     造物原本只在自己周围慢慢扩，玩家在它旁边它也不理。
     现在：玩家领地离它 ≤ `ATTACK_RANGE` 格时，它**优先扑过去**（把「长触须」提到
     「扩圈」前面），而且出笔方向**朝着玩家的地**排。 */
  var ATTACK_RANGE = 16;

  var CLOSE_GUARD_MS = 400;      // 刚打开那一小段里拒收「收笔」（照 sakura / kosma）
  var STYLE_ID = 'griseoGameStyles';

  /* ── 造物登场位置（2×2 的左上角）—— 四角**向里收一点**，别贴着画布边。
     ⚠ 按当时的 COLS/ROWS **现算**（扩张后画布更大，出生点跟着挪）。 */
  function enemySpawnCorners() {
    return [
      [6, 5], [COLS - 8, 5], [6, ROWS - 7], [COLS - 8, ROWS - 7],
      [COLS >> 1, 5], [COLS >> 1, ROWS - 7]
    ];
  }

  /* 「朋友色」—— 呼应她调色盘上的那几抹（天青留给了玩家自己）。 */
  var ENEMY_COLORS = ['#c9a0ff', '#ff9b5e', '#4fa870', '#5eead4', '#f2c14e', '#e585c8'];
  var ENEMY_STROKE_COLORS = ['#e3d2ff', '#ffd0b0', '#a6dcbb', '#b0f2e6', '#f7e2a6', '#f4c2e1'];

  /* 配色 —— 从她这一页的 :root 里取（画布用不了 CSS 变量，只能硬编码）。 */
  var COL_LINE = '#33203a';      // 底色（露在格子缝里 = 网格线）
  var COL_EMPTY = '#150e18';     // 空白格：未上色的画布（= --bg-deep）
  var COL_HOME = '#7dd3fc';      // 领地：她的天青（--sky）
  var COL_STROKE = '#c2ecff';    // 笔触：未干的、更浅的天青
  /* 笔尖（第 1 条）：**深色描边 + 亮金环** 两层叠 —— 单靠一个亮圈，
     笔走进自家天青或造物那些鲜色底上就看不见了。 */
  var COL_BRUSH = '#ffd97a';                     // 环：金（--gold）
  var COL_BRUSH_IDLE = 'rgba(255,217,122,.75)';  // 抬起：环细一点、淡一点（仍看得清）
  var COL_BRUSH_HALO = 'rgba(16,11,19,.9)';      // 描边：--bg-abyss，深底浅底都压得住

  /* ── 站点 UI 文案（⚠ 不是角色台词 —— 契约硬规定）──────────────────── */
  var MSG_OPEN = '推摇杆，让笔走出去，再绕回你自己的颜色。';
  var MSG_STROKE = '……笔尖正沿着你的方向走。';
  var MSG_FILL = '围住啦 —— 这一片都染成了你的颜色。';
  /* ⚠ 第 3 条（2026-10-04）：**没围住就不留颜色** —— 笔触淡去回空白。
     （原来是「笔触本身留下颜色」，那会让「一路扫过去」也能白拿地。） */
  var MSG_FADE = '这一笔没有围住任何东西 —— 颜色散掉了。';
  var MSG_HIT = '被造物截断了 —— 笔断了，你也倒下一次。';
  var MSG_EAT = '这一块也归你了 —— 造物被你整个吃掉了。';
  var MSG_SLAY = '造物被截断，当场散了。';
  var MSG_GROW = '画布亮起了一片新天地 —— 更大的画布、更多的造物上场了。';
  var MSG_BACK = '笔尖抬着 —— 先回自己的颜色，再走出去。';
  /* ⚠ 这条是给「地被对方啃断」准备的 —— 见 `settleStroke` 的文案判据。
     没有它的话，那种失败是**完全静默**的（笔触变了色、圈里却没填，一个字都不说）。 */
  var MSG_BLOCKED = '围地没连上 —— 你的领地断开成几块了，先去把它接回来。';
  var MSG_DEAD = '三条命都用完了 —— 画笔落下了。';

  var UI_HUD = '剩余 %s · 命 %s · 击杀 %d · 完成度 %s';
  var UI_RESULT_TITLE = '本局结束';
  var UI_RESULT_BODY = '完成度 %s（上色 %d / 总格 %d）· 击杀 %d 个 · 最高纪录 %s';
  var UI_RESULT_NEW = ' · 新纪录';
  var UI_AGAIN = '再来一局';
  var UI_CLOSE = '收笔';
  var UI_PAD_HINT = '用方向键走笔<br>同时按两个键可以斜着走';

  /* ── DOM 引用 & 单实例状态 ───────────────────────────────────────────
     `el` 里是 DOM；下面这些是**模块级**的单实例状态，不放在 mount 里。 */
  var el = {};
  var bound = false;             // 遮罩上的监听只挂一次（mount 可能被重复调用）
  var raf = null;                // 当前挂着的渲染调度 rAF
  var running = false;           // 遮罩是否开着
  var openedAt = 0;              // 打开遮罩的时刻（给保护期用）
  var best = 0;                  // 最高纪录 —— **完成度百分比**
  var hasTouch = false;          // 触摸设备？（决定摇杆显不显示）

  /* 阶段 / 击杀 / 计时 —— `kills` 是本局累计击杀。 */
  var kills = 0;
  var lives = START_LIVES;       // 画笔的命（第 2 条）：被截断一次扣一条，用完就结束
  var stageIdx = 0;
  var enemyCap = STAGES[0].cap;
  var enemyFloor = STAGES[0].floor;
  var leftMs = ROUND_MS;
  var finished = false;
  /* 「朋友色一闪」——{ cells:[idx], color, start }；画在**主画布**上（不进缓存），
     所以它只影响视觉、绝不污染 grid / 缓存。 */
  var flashGroups = [];

  /* 网格与渲染状态 */
  var grid = null;               // Int8Array(COLS*ROWS)，行主序 idx = y*COLS + x
  var cache = null;              // 离屏 canvas：格子的缓存层
  var cctx = null;
  var dirtyFlags = null;
  var dirtyList = [];

  /* 笔的状态（§5.1：**只有两态**） */
  var drawing = false;           // 落着：走过空白格会留下笔触
  var penX = 0, penY = 0;
  var penAcc = 0;                // 笔的步进累加器（与造物共用同一张速度表）
  var axisToggle = false;        // 斜向时交替走哪个轴（保证 4 连通）

  /* 输入 */
  var joyActive = false, joyVX = 0, joyVY = 0;
  var padCX = 0, padCY = 0, padR = 1;
  var keys = {};

  /* 动画状态 */
  var animActive = false;
  var animCells = null;
  var animDelay = null;
  var animIdx = null;
  var animFrom = null, animTo = null;
  var animDur = 0, animTotal = 0, animStart = 0;
  var animOnSettle = null;       // 落定时要做的事（「白画一场」靠它把格子写成 0）

  /* 造物状态 */
  var enemies = [];
  var speedTier = 0;
  var tickRaf = null;
  var lastTick = 0;

  /* ══════════════════════════════════════════════════════════════════
   *  一、渲染 —— 离屏缓存 + 只画脏格
   * ══════════════════════════════════════════════════════════════════ */

  function paintBg() {
    if (!cctx) return;
    cctx.fillStyle = COL_LINE;
    cctx.fillRect(0, 0, CW, CH);
  }

  /* ── 颜色工具（晕染要把两个 hex 混起来）—— 纯 ES5，不碰模板串 */
  function hexToRgb(h) {
    h = h.charAt(0) === '#' ? h.slice(1) : h;
    if (h.length === 3) {
      h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    var v = parseInt(h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function lerpHex(a, b, t) {
    var ca = hexToRgb(a), cb = hexToRgb(b);
    return 'rgb(' + Math.round(ca[0] + (cb[0] - ca[0]) * t) + ','
                  + Math.round(ca[1] + (cb[1] - ca[1]) * t) + ','
                  + Math.round(ca[2] + (cb[2] - ca[2]) * t) + ')';
  }

  /** 这一格在 `grid` 里「该是什么颜色」（不管动画）。 */
  function cellColor(i) {
    var v = grid ? grid[i] : EMPTY;
    if (v === HOME) return COL_HOME;
    if (v === STROKE) return COL_STROKE;
    if (v >= ENEMY_BASE) {
      var slot = (v - ENEMY_BASE) >> 1;
      if (((v - ENEMY_BASE) & 1) === 1) return ENEMY_STROKE_COLORS[slot] || ENEMY_STROKE_COLORS[0];
      return ENEMY_COLORS[slot] || ENEMY_COLORS[0];
    }
    return COL_EMPTY;
  }

  /** 把一个格子画进离屏缓存（四周留 1px = 网格线）。 */
  function paintCell(i) {
    var c = cellColor(i);
    /* ⚠ 动画接管中：格子此刻的颜色由动画算，不看 grid（grid 已是终值，
       只是**视觉**上还没干透）。 */
    if (animActive && animIdx && animIdx[i] >= 0) c = animColorAt(animIdx[i]);
    paintCellColor(i, c);
  }

  function paintCellColor(i, color) {
    if (!cctx) return;
    var x = i % COLS;
    var y = (i - x) / COLS;
    cctx.fillStyle = color;
    cctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
  }

  function markDirty(i) {
    if (!dirtyFlags || dirtyFlags[i]) return;
    dirtyFlags[i] = 1;
    dirtyList.push(i);
    scheduleRender();
  }

  function scheduleRender() {
    if (raf || !running) return;
    raf = global.requestAnimationFrame(function () {
      raf = null;
      try { render(); } catch (err) { console.warn('[ElysiaGames.griseo] render 出错：', err); }
    });
  }

  /** 把离屏缓存贴到主画布，再画：① 朋友色一闪、② 剩余时间条、③ 笔尖金圈。
      ⚠ 这三样都**只画主画布、绝不进缓存** —— 缓存里永远是 grid 的干净颜色，
        所以「关掉之后画布静止」那条反向判据读到的还是缓存贴出来的画面。 */
  function blit() {
    if (!el.ctx || !cache) return;
    el.ctx.clearRect(0, 0, CW, CH);
    el.ctx.drawImage(cache, 0, 0);
    drawFlash();
    drawTimerBar();
    /* ── 笔尖（第 1 条，2026-10-04）────────────────────────────────────
       ⚠ 原来只在**亮金细圈**与「半透明 0.35、1.2px 的暗圈」之间切 ——
         笔一旦走进**自家天青**那片亮色（或者造物那些同样鲜的颜色）上，那一圈就
         **看不见了**，玩家当场丢失「笔在哪、往哪走」。
       现在两层叠：**深色描边 + 亮金环**，落着再点一个实心中心点 ——
         深底靠金环跳出来、浅底靠深描边压得住，任何底色上都认得出。 */
    var bx = (penX + 0.5) * CELL, by = (penY + 0.5) * CELL;
    var pr = CELL * 0.72;
    el.ctx.save();
    el.ctx.beginPath(); el.ctx.arc(bx, by, pr, 0, Math.PI * 2);
    el.ctx.strokeStyle = COL_BRUSH_HALO;
    el.ctx.lineWidth = drawing ? 5 : 4;
    el.ctx.stroke();
    el.ctx.beginPath(); el.ctx.arc(bx, by, pr, 0, Math.PI * 2);
    el.ctx.strokeStyle = drawing ? COL_BRUSH : COL_BRUSH_IDLE;
    el.ctx.lineWidth = drawing ? 2.4 : 1.8;
    el.ctx.stroke();
    if (drawing) {
      el.ctx.beginPath(); el.ctx.arc(bx, by, CELL * 0.3, 0, Math.PI * 2);
      el.ctx.fillStyle = COL_BRUSH;
      el.ctx.fill();
    }
    el.ctx.restore();
  }

  function drawFlash() {
    if (flashGroups.length === 0) return;
    var now = Date.now();
    var alive = [];
    for (var g = 0; g < flashGroups.length; g++) {
      var fg = flashGroups[g];
      var t = (now - fg.start) / FLASH_MS;
      if (t >= 1) continue;
      alive.push(fg);
      el.ctx.save();
      el.ctx.globalAlpha = 1 - t;
      el.ctx.fillStyle = fg.color;
      for (var k = 0; k < fg.cells.length; k++) {
        var i = fg.cells[k];
        var x = i % COLS, y = (i - x) / COLS;
        el.ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      }
      el.ctx.restore();
    }
    flashGroups = alive;
  }

  /** 剩余时间条：画布顶上一道细线，随剩余时间收短
      —— 也是「开局画面在动」的一个**不依赖造物**的真实来源。 */
  function drawTimerBar() {
    if (!running || !el.ctx) return;
    var f = leftMs / ROUND_MS;
    if (f < 0) f = 0; else if (f > 1) f = 1;
    el.ctx.save();
    el.ctx.fillStyle = 'rgba(125,211,252,.85)';
    el.ctx.fillRect(0, 0, CW * f, 3);
    el.ctx.restore();
  }

  function render() {
    if (!el.ctx || !cache) return;
    for (var k = 0; k < dirtyList.length; k++) {
      paintCell(dirtyList[k]);
      dirtyFlags[dirtyList[k]] = 0;
    }
    dirtyList.length = 0;
    blit();
  }

  function fullRender() {
    if (!cctx || !grid) return;
    paintBg();
    for (var i = 0; i < grid.length; i++) paintCell(i);
    if (dirtyFlags) { for (var k = 0; k < dirtyList.length; k++) dirtyFlags[dirtyList[k]] = 0; }
    dirtyList.length = 0;
    blit();
  }

  /* ══════════════════════════════════════════════════════════════════
   *  一·B、上色晕染动画
   *
   *  ⚠ 设计要点：**grid 在动画一开始就已经是终值** —— 动画只改「视觉上这格
   *     此刻是什么颜色」，绝不改玩法状态。所以：
   *     · 中途被任何东西打断（收笔 / 碰撞 / 阶段扩张）都能**立刻结算到终值**，
   *       不会让玩法状态卡在中间态；
   *     · 断言读 `grid`（或画布像素）时，等动画跑完就一定是干净读数。
   * ══════════════════════════════════════════════════════════════════ */

  function animColorAt(k) {
    var t = (Date.now() - animStart - animDelay[k]) / animDur;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    t = 1 - (1 - t) * (1 - t);                   // ease-out：起笔快、落定慢
    return lerpHex(animFrom, animTo, t);
  }

  /** 立刻把动画结算到终值（可被任何打断调用）。 */
  function settleAnim() {
    if (!animActive) return;
    animActive = false;
    var cells = animCells;
    var fin = animOnSettle;
    animOnSettle = null;
    if (fin) fin();                       // ⚠ 先结算回调（淡去要把 grid 写成 0），再重画
    for (var k = 0; k < cells.length; k++) paintCell(cells[k]);
    animCells = null; animDelay = null; animIdx = null;
    animFrom = null; animTo = null;
    if (el.ctx) blit();
  }

  /** 动画的通用起手：`cells` 逐格从 `from` 渐变到 `to`，每格按 `delays` 错峰。 */
  function startAnim(cells, delays, dur, from, to, settle) {
    if (!cells || cells.length === 0) { if (settle) settle(); return; }
    settleAnim();
    /* 先把挂着的脏渲染冲掉 —— 动画接管后每帧自己重画这几格。 */
    if (raf) { global.cancelAnimationFrame(raf); raf = null; }
    if (dirtyList.length) render();

    var maxDelay = 0, k;
    for (k = 0; k < cells.length; k++) if (delays[k] > maxDelay) maxDelay = delays[k];

    var n = COLS * ROWS;
    animCells = cells;
    animDelay = delays;
    animIdx = new Int32Array(n);
    for (var i = 0; i < n; i++) animIdx[i] = -1;
    for (k = 0; k < cells.length; k++) animIdx[cells[k]] = k;

    animFrom = from;
    animTo = to;
    animDur = dur;
    animTotal = maxDelay + dur;
    animStart = Date.now();
    animOnSettle = settle || null;
    animActive = true;

    for (k = 0; k < cells.length; k++) paintCellColor(cells[k], animColorAt(k));
    blit();
  }

  /** 上色晕染：新格从「湿笔触色」由外向内晕到「领地色」。 */
  function startFillAnim(newCells, depths, maxDepth) {
    var capped = maxDepth > FILL_MAX_STEP ? FILL_MAX_STEP : maxDepth;
    var delays = [];
    for (var k = 0; k < newCells.length; k++) {
      delays.push((depths[k] > capped ? capped : depths[k]) * FILL_STEP_MS);
    }
    startAnim(newCells, delays, FILL_MS, COL_STROKE, COL_HOME, null);
  }

  /** **白画一场**（第 3 条）：整条笔触从湿色淡回空白，落定时把格子写成 `0`。 */
  function startFadeAnim(cells) {
    var delays = [];
    for (var k = 0; k < cells.length; k++) delays.push(0);
    startAnim(cells, delays, FADE_MS, COL_STROKE, COL_EMPTY, function () {
      for (var j = 0; j < cells.length; j++) grid[cells[j]] = EMPTY;
    });
  }

  /** 每帧推一次动画（由主循环调用 —— 不另开 rAF，免得「关掉之后还在动」）。 */
  function paintAnimFrame() {
    if (!animActive) return;
    if (Date.now() - animStart >= animTotal) { settleAnim(); return; }
    for (var k = 0; k < animCells.length; k++) {
      paintCellColor(animCells[k], animColorAt(k));
    }
    blit();
  }

  /** 多米诺 BFS：算每个新格离「原笔触格」的格距（0 = 本身就是笔触）。
      上色时按这个距离错峰 ⇒ 视觉上从笔触那道边**向内晕开**。 */
  function computeDepths(newCells, before) {
    var n = COLS * ROWS;
    var lookup = new Int32Array(n);
    var i, k;
    for (i = 0; i < n; i++) lookup[i] = -1;
    for (k = 0; k < newCells.length; k++) lookup[newCells[k]] = k;
    var depth = new Int32Array(newCells.length);
    for (k = 0; k < depth.length; k++) depth[k] = -1;
    var queue = [];
    for (k = 0; k < newCells.length; k++) {
      if (before[newCells[k]] === STROKE) { depth[k] = 0; queue.push(k); }
    }
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      var ci = newCells[cur];
      var cx = ci % COLS, cy = (ci - cx) / COLS;
      for (var d = 0; d < 4; d++) {
        var nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
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
   *  二、笔 —— 摇杆/键盘指挥它走，踩回自己的颜色就结算
   * ══════════════════════════════════════════════════════════════════ */

  /** 把摇杆向量量化到 **8 向**（死区 0.2；主分量不足 tan22.5° 就归零该轴）。 */
  function quantize(vx, vy) {
    var ax = Math.abs(vx), ay = Math.abs(vy);
    var m = ax > ay ? ax : ay;
    if (m < 0.2) return { dx: 0, dy: 0 };
    var sx = vx > 0 ? 1 : (vx < 0 ? -1 : 0);
    var sy = vy > 0 ? 1 : (vy < 0 ? -1 : 0);
    if (ax / m < 0.4142) sx = 0;
    if (ay / m < 0.4142) sy = 0;
    return { dx: sx, dy: sy };
  }

  /** 键盘：方向键（或 WASD）。同时按相邻两键 = 斜向。 */
  function keyDir() {
    var dx = 0, dy = 0;
    if (keys.up) dy -= 1;
    if (keys.down) dy += 1;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;
    return { dx: dx, dy: dy };
  }

  /** 当前方向：**摇杆优先**，没推杆才看键盘。 */
  function currentDir() {
    if (joyActive) return quantize(joyVX, joyVY);
    return keyDir();
  }

  /**
   * 走一步。⚠ 斜向**必须**拆成两格正交单步（交替走两个轴）——
   * 围地算法要求轨迹**4 连通**（spec §6.3 约束 (j)），走对角步会把一笔切成
   * 好几个分量，围地**直接判不出来**。顺带：交替步让斜向与直向的格速率一致。
   */
  function stepPen(dir) {
    var dx = dir.dx, dy = dir.dy;
    if (!dx && !dy) return;
    if (dx && dy) {
      if (axisToggle) dx = 0; else dy = 0;
      axisToggle = !axisToggle;
    }
    stepTo(penX + dx, penY + dy);
  }

  /**
   * 笔走到 (nx,ny)。**§5.1 的三条转移规则全在这里**：
   *   ① 从自己的领地格踏入非领地格 ⇒ 转入落着，从这一格开始留痕
   *   ② 在落着态下踏入自己的领地格 ⇒ **立刻结算这一笔**，转入抬起
   *   ③ 碰撞 ⇒ 清空全部笔触 + 转入抬起（此后必须回领地才能重新落笔）
   */
  function stepTo(nx, ny) {
    if (!grid) return;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;   // 画布边：停住
    var fromIdx = penY * COLS + penX;
    var toIdx = ny * COLS + nx;
    var fromHome = grid[fromIdx] === HOME;
    var toV = grid[toIdx];
    penX = nx; penY = ny;

    if (toV === HOME) {
      if (drawing) { settleStroke(); drawing = false; }
      scheduleRender();
      return;
    }
    if (!drawing && fromHome) {
      drawing = true;
      if (el.msg) el.msg.textContent = MSG_STROKE;
    } else if (!drawing && el.msg && el.msg.textContent !== MSG_BACK && el.msg.textContent !== MSG_HIT) {
      /* 抬起态、又不在自家领地上 —— 提醒一句（别让玩家以为是坏了） */
      el.msg.textContent = MSG_BACK;
    }
    if (drawing) {
      if (toV === EMPTY) {
        grid[toIdx] = STROKE; markDirty(toIdx);
      } else if (isEnemyStroke(toV)) {
        /* 落在**造物笔触**上 = 撞上（对称碰撞的另一面）。 */
        handleCollision(enemyByStrokeCode(toV));
        return;
      } else if (toV >= ENEMY_BASE) {
        /* 落在**造物的已定型领地**上 ⇒ **盖掉它**（需求方 2026-10-04 第 5 条：
           「画笔轨迹可以填充其他 AI 的区域，其他 AI 也一样」）。
           ⚠ 这一条是**对称的前提**：不放开它，玩家就画不出「穿过造物领地的圈」，
             也就永远围不到「圈里含造物地」的局面 —— 那样第 5 条在观感上等于没做
             （一笔闭环的墙里既然没有对方的格子，按几何可证**永远**只能整块围住或
              一根毫毛都碰不到，见下方 `fillEnclosed` ⑤ 的注释）。 */
        grid[toIdx] = STROKE; markDirty(toIdx);
      }
      var hit = adjacentEnemyStroke(nx, ny);
      if (hit) { handleCollision(hit); return; }
    }
    scheduleRender();
  }

  /** 一笔的收口：围地 → 重算难度 → 结算击杀（可能阶段扩张）→ 晕染动画 + 文案。 */
  function settleStroke() {
    if (!grid) return;
    var before = new Int8Array(grid);
    var res = fillEnclosed(grid, COLS, ROWS, HOME);      // ⚠ 原地改 grid
    /* ⚠ 难度重算放在「结算击杀」**之前** —— 否则刚吃掉的造物会被公式当场补一个回来，
         击杀就白杀了。补位只在这一步发生；击杀留下的空位不补。 */
    recomputeDifficulty();
    var rk = resolveKills();
    if (rk.expanded) {
      /* 阶段扩张：画布整个换成更大的一张、既有内容搬到中央 —— 这一笔的晕染
         就免了（画面本来刚大改过），直接画平 + 播一句扩张文案。 */
      if (el.msg) el.msg.textContent = MSG_GROW;
      syncHud();
      fullRender();
      return;
    }
    var newCells = [];
    for (var i = 0; i < grid.length; i++) {
      if (grid[i] === HOME && before[i] !== HOME) newCells.push(i);
    }
    /* ⚠ **第 3 条的安全闸**：`filled > 0` **不等于**「真的围住了什么」——
       一个**单格分量**（出门一步就回头）也会被算法判成「入选」而把自己那一格收编。
       需求方要的是「**只有圈到才上色**」，所以这里再加一道：
       **既没围出空白（`interior`）也没吃到对方的地（`ate`）⇒ 整笔复原**（`grid` 回滚到
       这一笔之前），随后走下面的「白画一场」。 */
    var real = (res.interior > 0 || res.ate > 0);
    if (!real && rk.captured === 0 && newCells.length > 0) {
      for (i = 0; i < grid.length; i++) grid[i] = before[i];
      newCells = [];
    }
    if (newCells.length > 0) {
      var dd = computeDepths(newCells, before);
      startFillAnim(newCells, dd.depth, dd.max);
      if (el.msg) {
        /* ⚠ **诚实文案**（判据三样）：
             · 整块吃掉了造物（击杀）→ MSG_EAT
             · 两端都贴家、但那两块家被啃断了 ⇒ 封不上口 → MSG_BLOCKED
             · 其余（围出了空白 / 吃掉了圈里对方的地）→ MSG_FILL
           到这一支就**一定**是「真的围住了什么」—— 没围住的那一支在下面。 */
        el.msg.textContent = rk.captured > 0 ? MSG_EAT
                           : (res.blocked > 0 ? MSG_BLOCKED : MSG_FILL);
      }
    } else {
      /* ⚠ **第 3 条：没围住就白画一场。**
         没有分量入选（或入选了却没围出东西）⇒ `fillEnclosed` 没留下任何颜色，
         笔触还留在 grid 里当 `STROKE`。让它们**淡回空白** ——
         既不留颜色，也不留下一条挡着下一笔的墙。
         ⚠ 「白画」不等于「静默」：如果是**地断开了**（`blocked`）得说清楚。 */
      var left = [];
      for (var j = 0; j < grid.length; j++) if (grid[j] === STROKE) left.push(j);
      if (left.length > 0) {
        startFadeAnim(left);
        if (el.msg) el.msg.textContent = res.blocked > 0 ? MSG_BLOCKED : MSG_FADE;
      } else {
        fullRender();
      }
    }
    syncHud();
  }

  /* ══════════════════════════════════════════════════════════════════
   *  二·B、造物 —— 「颜料触须」（见文件头「为什么是触须」）
   * ══════════════════════════════════════════════════════════════════ */

  function isEnemyStroke(v) {
    return v >= ENEMY_BASE && ((v - ENEMY_BASE) & 1) === 1;
  }
  function enemyByStrokeCode(code) {
    for (var k = 0; k < enemies.length; k++) {
      if (enemies[k].strokeCode === code) return enemies[k];
    }
    return null;
  }
  /** (x,y) 的四邻里有没有造物笔触？有就把那个造物返回（碰撞用）。 */
  function adjacentEnemyStroke(x, y) {
    if (!grid) return null;
    for (var d = 0; d < DIRS.length; d++) {
      var nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      var v = grid[ny * COLS + nx];
      if (isEnemyStroke(v)) return enemyByStrokeCode(v);
    }
    return null;
  }
  /** (x,y) 的四邻里有没有玩家笔触？ */
  function touchesPlayerStroke(x, y) {
    if (!grid) return false;
    for (var d = 0; d < DIRS.length; d++) {
      var nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      if (grid[ny * COLS + nx] === STROKE) return true;
    }
    return false;
  }

  /**
   * 对称碰撞的**唯一**收口。
   * ⚠ 玩家笔触**整条清光**（不是只清碰到的那一截）—— 留下任何一截「与家断开」的
   *   笔触，会被 `fillEnclosed` 第 ⑤ 步无条件收编成领地 ⇒ 领地裂成**孤岛**
   *   ⇒ 之后围合判定成批静默被拒（spec §12.1，上游实测 51.7%）。清光就没有孤岛。
   */
  function handleCollision(enemy) {
    if (!grid) return;
    var changed = false;
    for (var i = 0; i < grid.length; i++) {
      if (grid[i] === STROKE) { grid[i] = EMPTY; markDirty(i); changed = true; }
    }
    /* ── 第 2 条（2026-10-04 需求方）：**双方都死**，而且是不对称的死法 ──
         · 画笔被截断 ⇒ **倒下一次**（扣一条命）⇒ 在**自己的区域里随机位置**复活；
           三条命用完 ⇒ 本局结束。
         · 造物被截断 ⇒ **当场散掉，不复活**。
       ⚠ 截断是**对称发生**的（谁碰到谁，两条笔触一起断），所以每次碰撞
         一定是「玩家掉一条命 + 那只造物没了」——这是这位需求方要的规则。 */
    if (enemy) slayEnemy(enemy);
    drawing = false;
    penAcc = 0;
    lives--;
    if (lives <= 0) {
      lives = 0;
      if (changed) scheduleRender();
      syncHud();
      finish(MSG_DEAD);
      return;
    }
    respawnPen();
    if (el.msg) el.msg.textContent = MSG_HIT;
    if (changed) scheduleRender();
    syncHud();
  }

  /**
   * 画笔「复活」：**在自己的领地里随机挑一格**落脚（第 2 条）。
   * ⚠ 一定得落在**自己的地上**：落在空地 ⇒ 笔处在「抬起」态、还得先摸回领地；
   *   落在别人地上 ⇒ 等于凭空占了对方一格。只有落在家上说得通。
   */
  function respawnPen() {
    if (!grid) return;
    var home = [];
    for (var i = 0; i < grid.length; i++) if (grid[i] === HOME) home.push(i);
    if (home.length === 0) return;
    var pick = home[Math.floor(Math.random() * home.length)];
    var x = pick % COLS;
    penX = x;
    penY = (pick - x) / COLS;
    drawing = false;      // 站在自家地上；下一格踏出去就重新落笔
    penAcc = 0;
    scheduleRender();
  }

  /** 造物被**截断** ⇒ 当场散掉：地清空、笔触清空、下场，**不复活**（第 2 条）。 */
  function slayEnemy(e) {
    if (!grid || !e || e.dead) return;
    clearEnemyCells(e);
    e.dead = true;
    e.plan = null; e.planIdx = 0; e.planRect = null;
    var alive = [];
    for (var k = 0; k < enemies.length; k++) if (!enemies[k].dead) alive.push(enemies[k]);
    enemies = alive;
    kills++;              // 下场就算一次击杀（难度 / 阶段跟着它走）
    scheduleRender();
  }

  function retractEnemyStroke(e) {
    if (!grid || !e) return;
    for (var i = 0; i < grid.length; i++) {
      if (grid[i] === e.strokeCode) { grid[i] = EMPTY; markDirty(i); }
    }
  }

  /* ── 难度：**分档 + 封顶**（占比重算，绝不线性）────────────────────── */

  function playerRatio() {
    if (!grid) return 0;
    var c = 0;
    for (var i = 0; i < grid.length; i++) if (grid[i] === HOME) c++;
    return c / (COLS * ROWS);
  }
  function enemyCountForRatio(r) {
    var n = 1 + Math.floor(r / DIFF_NUM_STEP);
    if (n < enemyFloor) n = enemyFloor;
    if (n > enemyCap) n = enemyCap;
    return n;
  }
  function speedTierForRatio(r) {
    var t = Math.floor(r / DIFF_SPD_STEP);
    return t > DIFF_SPD_CAP ? DIFF_SPD_CAP : t;
  }

  function freeSlot() {
    for (var s = 0; s < ENEMY_MAX; s++) {
      var used = false;
      for (var k = 0; k < enemies.length; k++) if (enemies[k].slot === s) { used = true; break; }
      if (!used) return s;
    }
    return null;
  }

  function clearEnemyCells(e) {
    if (!grid || !e) return;
    for (var i = 0; i < grid.length; i++) {
      if (grid[i] === e.homeCode || grid[i] === e.strokeCode) { grid[i] = EMPTY; markDirty(i); }
    }
  }

  function recomputeDifficulty() {
    if (!grid) return;
    var r = playerRatio();
    var want = enemyCountForRatio(r);
    speedTier = speedTierForRatio(r);
    while (enemies.length < want) {
      if (!spawnEnemy(freeSlot())) break;          // 找不到空地就别硬塞
    }
    while (enemies.length > want) {
      clearEnemyCells(enemies.pop());
    }
    for (var k = 0; k < enemies.length; k++) {
      enemies[k].tier = speedTier;
      enemies[k].stepMs = ENEMY_STEP_MS[speedTier];
    }
  }

  function freeBlock(x, y, r) {
    if (x < 0 || y < 0 || x + r > COLS || y + r > ROWS) return false;
    for (var yy = y; yy < y + r; yy++) {
      for (var xx = x; xx < x + r; xx++) if (grid[yy * COLS + xx] !== EMPTY) return false;
    }
    return true;
  }

  /** 先试这个槽位的角落，被占了就两格一步地扫一圈，找第一块空地。 */
  function findSpawn(slot) {
    var corners = enemySpawnCorners();
    var pref = corners[slot % corners.length];
    if (freeBlock(pref[0], pref[1], ENEMY_HOME_R)) return { x: pref[0], y: pref[1] };
    for (var y = 1; y + ENEMY_HOME_R <= ROWS - 1; y += 2) {
      for (var x = 1; x + ENEMY_HOME_R <= COLS - 1; x += 2) {
        if (freeBlock(x, y, ENEMY_HOME_R)) return { x: x, y: y };
      }
    }
    return null;
  }

  function spawnEnemy(slot) {
    if (!grid || slot === null || slot === undefined) return null;
    var pos = findSpawn(slot);
    if (!pos) return null;
    var e = {
      slot: slot,
      homeCode: ENEMY_BASE + slot * 2,
      strokeCode: ENEMY_BASE + slot * 2 + 1,
      color: ENEMY_COLORS[slot % ENEMY_COLORS.length],
      x: pos.x, y: pos.y,
      acc: 0, stepMs: ENEMY_STEP_MS[speedTier], tier: speedTier,
      /* `box` = 自己领地的**外接矩形**（围地环就绕它外扩 `RING_PAD` 格画）。
         ⚠ 触须长大之后它会落后 —— 每轮收笔都 `refreshBox()` 重算。 */
      box: { x0: pos.x, y0: pos.y,
             x1: pos.x + ENEMY_HOME_R - 1, y1: pos.y + ENEMY_HOME_R - 1 },
      plan: null, planIdx: 0, planRect: null, cursor: slot, cooldown: 0, dead: false
    };
    for (var yy = pos.y; yy < pos.y + ENEMY_HOME_R; yy++) {
      for (var xx = pos.x; xx < pos.x + ENEMY_HOME_R; xx++) {
        grid[yy * COLS + xx] = e.homeCode;
        markDirty(yy * COLS + xx);
      }
    }
    enemies.push(e);
    return e;
  }

  /** 重算「领地外接矩形」。
      ⚠ **触须长大之后 box 会落后于真实领地** —— 不重算的话，下一圈的环会**压在自己
        刚长出来的地上** ⇒ `planRing` 永远返回 null ⇒ 造物从此只会长触须、
        再也围不了地（静默退化）。每次收笔都重算一遍，简单可靠（O(格数)，一秒才几次）。 */
  function refreshBox(e) {
    if (!grid || !e) return;
    var minX = COLS, minY = ROWS, maxX = -1, maxY = -1, i, x, y;
    for (i = 0; i < grid.length; i++) {
      if (grid[i] !== e.homeCode) continue;
      x = i % COLS; y = (i - x) / COLS;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxX >= 0) e.box = { x0: minX, y0: minY, x1: maxX, y1: maxY };
  }

  /**
   * 围地计划：绕 `box` 外扩 `RING_PAD` 格的**周长**走一圈（顺时针，闭合回路）。
   * 圈上每一格必须是**空白且不出界**，且整圈不超过 `RING_MAX` 格。
   * 成功时记下 `planRect`（走完由 `finishPlan` 决定「这一轮是围地不是触须」）。
   */
  function planRing(e) {
    if (!grid || !e.box) return null;
    var b = e.box;
    var r = { x0: b.x0 - RING_PAD, y0: b.y0 - RING_PAD,
              x1: b.x1 + RING_PAD, y1: b.y1 + RING_PAD };
    if (r.x0 < 0 || r.y0 < 0 || r.x1 >= COLS || r.y1 >= ROWS) return null;
    /* ⚠⚠ 路径元素是**格索引**（`y*COLS+x`），不是 `[x,y]` 数对 ——
       `stepEnemy` 拿它直接当 `grid` 的下标用（`planTendril` 给的也是索引）。
       2026-10-04 真踩过：这里原先推的是数对，于是 `grid[[4,3]]` 得到 `undefined`
       ⇒ 每一圈都**当场 abort** ⇒ **只要环一成功，那只造物就卡住不动**。
       症状是「造物偶尔发呆」而不是报错，靠 ⑯ 那条断言才逮到。 */
    var path = [], x, y, k;
    for (x = r.x0; x <= r.x1; x++) path.push(r.y0 * COLS + x);       // 上边 →
    for (y = r.y0 + 1; y <= r.y1; y++) path.push(y * COLS + r.x1);   // 右边 ↓
    for (x = r.x1 - 1; x >= r.x0; x--) path.push(r.y1 * COLS + x);   // 下边 ←
    for (y = r.y1 - 1; y > r.y0; y--) path.push(y * COLS + r.x0);    // 左边 ↑
    if (path.length > RING_MAX) return null;                         // 太大 ⇒ 交回触须
    for (k = 0; k < path.length; k++) {
      var rv = grid[path[k]];
      /* ⚠ 空白 **或玩家已定型的地**（`HOME`）—— 后者照盖（第 5 条 + 第 4 条）。
         ⚠ 不放宽这一条的话，造物**永远围不到玩家的地**：环要围住一块玩家的地，
           它自己就不能被那块地挡住。放宽之后它才真的会「切过来」把地圈走。 */
      if (rv !== EMPTY && rv !== HOME) return null;
    }
    e.planRect = r;
    return path;
  }

  /**
   * 计划一条「触须」：从领地边界（**只从有 ≥2 个自家邻居的格子出发** ——
   * 防细长的刺，让它长成胖乎乎的色块）朝一个空方向直走最多 `TENDRIL_MAX` 格。
   * ⚠ `cursor` 轮转保证出笔点不呆板、也**从不回头**（A3 不踱步）。
   *
   * @param {object} [target] 攻击目标（`{x,y}` = 玩家最近的地）。传了它 ⇒
   *   **朝目标出笔**（第 4 条「攻击欲望」）；不传 ⇒ 退化成原来的轮转。
   */
  function planTendril(e, target) {
    if (!grid) return null;
    var cands = [];
    var n = COLS * ROWS;
    var i, d;
    for (i = 0; i < n; i++) {
      if (grid[i] !== e.homeCode) continue;
      var x = i % COLS, y = (i - x) / COLS;
      var own = 0;
      for (d = 0; d < 4; d++) {
        var ax = x + DIRS[d][0], ay = y + DIRS[d][1];
        if (ax < 0 || ax >= COLS || ay < 0 || ay >= ROWS) continue;
        if (grid[ay * COLS + ax] === e.homeCode) own++;
      }
      if (own < 2) continue;                     // 细刺的尖端不作出笔点
      for (d = 0; d < 4; d++) {
        var nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        var cv = grid[ny * COLS + nx];
        /* ⚠ 空白 **或玩家已定型的地**（`HOME`）—— 后者照盖，对称那一半。
           玩家的**笔触**(`STROKE`)不在候选里：那是碰撞的事了，见 `stepEnemy`。 */
        if (cv !== EMPTY && cv !== HOME) continue;
        cands.push({ x: nx, y: ny, dx: DIRS[d][0], dy: DIRS[d][1] });
      }
    }
    if (cands.length === 0) return null;

    /* ── 第 4 条：**攻击欲望**（2026-10-04 需求方）────────────────────
       出笔点不再纯轮转 —— 有目标时，**离目标近的排前面**；
       同样近就**优先踩玩家的地**（那才是真的在抢）；最后才按 `cursor` 破平。
       ⚠ 没有目标（场上没有玩家的地）⇒ 完全退化成原来的轮转，行为与从前一致。 */
    var k, c;
    if (target) {
      var t0 = e.cursor % cands.length;
      for (k = 0; k < cands.length; k++) {
        c = cands[k];
        c.d = Math.abs(c.x - target.x) + Math.abs(c.y - target.y);
        c.hm = (grid[c.y * COLS + c.x] === HOME) ? 0 : 1;
        c.tn = (k - t0 + cands.length) % cands.length;
      }
      cands.sort(function (a, b) {
        if (a.d !== b.d) return a.d - b.d;
        if (a.hm !== b.hm) return a.hm - b.hm;
        return a.tn - b.tn;
      });
    } else {
      var st = e.cursor % cands.length;
      cands = cands.slice(st).concat(cands.slice(0, st));
    }

    for (k = 0; k < cands.length; k++) {
      c = cands[k];
      var path = [], px = c.x, py = c.y;
      for (var s = 0; s < TENDRIL_MAX; s++) {
        if (px < 0 || px >= COLS || py < 0 || py >= ROWS) break;
        var sv = grid[py * COLS + px];
        if (sv !== EMPTY && sv !== HOME) break;   // 同上：空白或玩家的地
        path.push(py * COLS + px);
        px += c.dx; py += c.dy;
      }
      if (path.length > 0) { e.cursor++; return path; }
    }
    return null;
  }

  /** 找离 (x,y) 最近的**玩家领地**格；场上没有玩家的地就返回 null（第 4 条用）。
      返回 `{x, y, d}`，`d` 是曼哈顿距离。 */
  function nearestHome(x, y) {
    if (!grid) return null;
    var bx = -1, by = -1, bd = 1e9;
    for (var i = 0; i < grid.length; i++) {
      if (grid[i] !== HOME) continue;
      var cx = i % COLS, cy = (i - cx) / COLS;
      var d = Math.abs(cx - x) + Math.abs(cy - y);
      if (d < bd) { bd = d; bx = cx; by = cy; if (d === 0) break; }
    }
    return bx < 0 ? null : { x: bx, y: by, d: bd };
  }

  /** 走一个计划步：落一格造物笔触，并查一次对称碰撞。 */
  function stepEnemy(e) {
    if (!grid || e.dead) return;
    if (!e.plan) {
      /* ⚠ 顺序：**玩家近就先扑过去**（第 4 条「攻击欲望」），否则才先围自己的圈。
         · 玩家领地离它 ≤ `ATTACK_RANGE` ⇒ 直接出触须、**朝着玩家的地**排 ——
           触须能盖在玩家的地上（第 5 条），所以这一步是真的在抢地。
         · 玩家远 ⇒ 老规矩：先试围地环，不行再退回触须。
         · 都不行 = 真被堵死了 ⇒ 冷却后重试（场上的地会变）。 */
      e.planRect = null;
      var th = nearestHome(e.x, e.y);
      var path = null;
      if (th && th.d <= ATTACK_RANGE) path = planTendril(e, th);
      if (!path) path = planRing(e);
      if (!path) path = planTendril(e, th);
      if (!path) { e.cooldown = ENEMY_STUCK_MS; return; }
      e.plan = path;
      e.planIdx = 0;
    }
    var idx = e.plan[e.planIdx];
    if (idx === undefined) { finishPlan(e); return; }
    var v = grid[idx];
    if (v === STROKE) {
      /* 落在**玩家笔触**上 = 撞上（`handleCollision` 会把玩家整条清光 + 断自己这一笔）。
         ⚠ 一律走碰撞、**不走"覆盖"**：覆盖只会打掉玩家笔触的**一格** ⇒ 把一条笔触
           切成两截 ⇒ 破坏「笔触恒为单一 4 连通分量」这条不变量（`fillEnclosed` 会
           把两截当两个分量处理）。碰撞则是整条清光，干净。 */
      handleCollision(e);
      return;
    }
    if (v !== EMPTY && v !== HOME) { abortPlan(e); return; }   // 被别的造物 / 自己占了 ⇒ 作废
    var x = idx % COLS, y = (idx - x) / COLS;
    e.x = x; e.y = y;
    /* ⚠ `HOME`（玩家的地）也照盖 —— 这是第 5 条的对称那一半：
       玩家能盖造物的地，造物也能盖玩家的地。 */
    grid[idx] = e.strokeCode;
    markDirty(idx);
    e.planIdx++;
    if (touchesPlayerStroke(x, y)) { handleCollision(e); return; }
    if (e.planIdx >= e.plan.length) finishPlan(e);
  }

  /**
   * 计划走完。两条路：
   *   · **围地环** → 调 `fillEnclosed`（自己的码）⇒ 环内**空白 + 玩家的地**一起收编
   *   · **触须**   → 只把这一条收编（颜料干了）
   * ⚠ 围地那条走的是**参数化**的 `fillEnclosed` —— 与玩家侧**同一个函数**，
   *   所以「围地填充连对方一起填」这条规则对双方**字面上就是同一条**。
   * ⚠ `fillEnclosed` **不 markDirty**（它只改 grid）⇒ 围地之后必须**整屏重画**，
   *   否则这一圈在画面上根本不出现（「改了却没画出来」的那类假绿）。
   */
  function finishPlan(e) {
    var k, i;
    if (e.planRect) {
      fillEnclosed(grid, COLS, ROWS, e.homeCode, e.strokeCode, e.homeCode);
      e.box = e.planRect;
      e.cooldown = ENEMY_COOLDOWN_MS >> 1;
      refreshBox(e);
      fullRender();
    } else {
      for (k = 0; k < e.plan.length; k++) {
        i = e.plan[k];
        if (grid[i] === e.strokeCode) { grid[i] = e.homeCode; markDirty(i); }
      }
      e.cooldown = ENEMY_COOLDOWN_MS;
      refreshBox(e);   // ⚠ 不刷新的话 box 落后 ⇒ 下一圈的环会压到自己刚长出来的地
      scheduleRender();
    }
    e.plan = null; e.planIdx = 0; e.planRect = null;
  }

  /** 计划作废（半路被占）：撤销笔触、停顿、下一轮重来。 */
  function abortPlan(e) {
    retractEnemyStroke(e);
    e.plan = null; e.planIdx = 0; e.planRect = null;
    e.cooldown = ENEMY_COOLDOWN_MS;
  }

  /* ── 击杀：玩家把造物**整块领地**围死 → 全染成玩家色、造物消失 ───────── */

  /**
   * 结算「被吃掉的造物」：把玩家领地当墙，从画布四条外边泛洪；
   * 某个造物**每一格领地**都灌不到 ⇒ 它被整块围死 ⇒ 吃掉。
   * ⚠ 返回 `{ captured }`，并顺手摘除死掉的造物。
   */
  function resolveCaptures() {
    if (!grid || enemies.length === 0) return 0;
    var n = COLS * ROWS;
    var reach = new Uint8Array(n);
    var stack = [];
    var i, j, x, y, d, k;
    function seed(sx, sy) {
      var si = sy * COLS + sx;
      if (grid[si] !== HOME && reach[si] === 0) { reach[si] = 1; stack.push(si); }
    }
    for (x = 0; x < COLS; x++) { seed(x, 0); seed(x, ROWS - 1); }
    for (y = 0; y < ROWS; y++) { seed(0, y); seed(COLS - 1, y); }
    while (stack.length > 0) {
      i = stack.pop();
      x = i % COLS; y = (i - x) / COLS;
      for (d = 0; d < 4; d++) {
        var nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        j = ny * COLS + nx;
        if (grid[j] !== HOME && reach[j] === 0) { reach[j] = 1; stack.push(j); }
      }
    }
    var captured = [];
    for (k = 0; k < enemies.length; k++) {
      var e = enemies[k], total = 0, unreach = 0;
      for (i = 0; i < n; i++) {
        if (grid[i] === e.homeCode) { total++; if (reach[i] === 0) unreach++; }
      }
      /* ⚠ 2026-10-04：**`unreach === total` 就够了，`total > 0` 那个前提已去掉**。
         因为「围地填充连对方一起填」会把圈里的造物地**直接填成玩家色** ——
         那只造物的地**先没了**（`total` 变 0），随后 `resolveCaptures` 才跑。
         不去掉的话，它地被填光了却**不算被吃掉**：画面上已经没它的颜色了，
         而 `kills` 不动、它也不下场 —— 一个看不见的幽灵造物。 */
      if (unreach === total) captured.push(e);
    }
    for (k = 0; k < captured.length; k++) captureEnemy(captured[k]);
    if (captured.length > 0) {
      var alive = [];
      for (k = 0; k < enemies.length; k++) if (!enemies[k].dead) alive.push(enemies[k]);
      enemies = alive;
    }
    return captured.length;
  }

  /** 击杀结算的**唯一收口**（真实路径与 `_test` 诊断口都走它）。 */
  function resolveKills() {
    var captured = resolveCaptures();
    kills += captured;
    var expanded = false;
    if (captured > 0) expanded = maybeExpand();
    return { captured: captured, expanded: expanded };
  }

  function captureEnemy(e) {
    if (!grid || !e) return;
    e.dead = true;
    e.plan = null;
    var flashCells = [];
    for (var i = 0; i < grid.length; i++) {
      if (grid[i] === e.homeCode) {
        flashCells.push(i);
        grid[i] = HOME; markDirty(i);
      } else if (grid[i] === e.strokeCode) {
        grid[i] = EMPTY; markDirty(i);
      }
    }
    if (flashCells.length > 0) {
      flashGroups.push({ cells: flashCells, color: e.color, start: Date.now() });
    }
  }

  /* ── 主循环：遮罩开着时一直转 ─────────────────────────────────────── */

  function tickEnemies(dt) {
    if (!grid) return;
    for (var k = 0; k < enemies.length; k++) {
      var e = enemies[k];
      if (e.dead) continue;
      if (e.cooldown > 0) { e.cooldown -= dt; if (e.cooldown < 0) e.cooldown = 0; continue; }
      e.acc += dt;
      var guard = 0;
      while (e.acc >= e.stepMs && guard++ < 2) {   // 一帧最多走两格，掉帧时别瞬移
        e.acc -= e.stepMs;
        stepEnemy(e);
        if (e.cooldown > 0 || !e.plan) break;
      }
    }
  }

  function tickLoop() {
    tickRaf = null;
    if (!running) return;
    var now = Date.now();
    var dt = now - lastTick;
    lastTick = now;
    if (dt > 250) dt = 250;                       // 掉帧 / 切后台回来，别让造物瞬移
    if (dt < 0) dt = 0;

    leftMs -= dt;
    if (leftMs <= 0) { leftMs = 0; syncHud(); finish(); return; }

    /* ① 笔：与造物**同一张速度表**（spec §4.1）。没有冷却。 */
    var pd = currentDir();
    if (!pd.dx && !pd.dy) {
      penAcc = 0;
    } else {
      penAcc += dt;
      var pm = ENEMY_STEP_MS[speedTier];
      var pg = 0;
      while (penAcc >= pm && pg++ < 4 && running) {
        penAcc -= pm;
        stepPen(pd);
        pd = currentDir();
        if (!pd.dx && !pd.dy) { penAcc = 0; break; }
      }
    }

    /* ② 造物 */
    try { tickEnemies(dt); }
    catch (err) { console.warn('[ElysiaGames.griseo] 造物循环出错：', err); }

    /* ③ 画面：晕染动画 + 贴一次缓存（时间条要连续收短、朋友色一闪要逐帧衰减）。
       ⚠ 关掉遮罩这个 loop 就停，画布随即静止 —— `check_game_runs` 的反向那半段靠它。 */
    try { paintAnimFrame(); blit(); }
    catch (err2) { console.warn('[ElysiaGames.griseo] blit 出错：', err2); }
    syncHud();
    tickRaf = global.requestAnimationFrame(tickLoop);
  }

  function startLoop() {
    if (tickRaf) return;
    lastTick = Date.now();
    tickRaf = global.requestAnimationFrame(tickLoop);
  }
  function stopLoop() {
    if (tickRaf) { global.cancelAnimationFrame(tickRaf); tickRaf = null; }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  二·C、阶段扩张 —— 累计击杀解锁更大的画布
   *
   *  ⚠ 扩张时**所有既有状态都要跟着搬**，一类都不能漏：
   *     · grid 的全部内容 → 整体搬到新画布**正中央**（dx = (新-旧)>>1）
   *     · 每个造物的 x / y → +dx / +dy
   *     · 「朋友色一闪」的格索引 → 重新映射（**不搬会闪到错位**）
   *     · 主画布 width/height 与离屏缓存**同步**
   *     · 脏格表重新分配、清空；笔尖位置搬到中央（索引已作废）
   *     · 所有造物的计划**作废**（它们基于旧坐标）+ 进入冷却
   * ══════════════════════════════════════════════════════════════════ */

  function setCanvasSize(nc, nr) {
    COLS = nc; ROWS = nr;
    CW = COLS * CELL; CH = ROWS * CELL;
    if (el.canvas) { el.canvas.width = CW; el.canvas.height = CH; }
    if (cache) { cache.width = CW; cache.height = CH; }
    dirtyFlags = new Uint8Array(COLS * ROWS);
    dirtyList.length = 0;
  }

  function applyStageCaps(st) { enemyCap = st.cap; enemyFloor = st.floor; }

  function stageIndexFor(k) {
    var s = Math.floor(k / KILLS_PER_STAGE);
    return s > STAGES.length - 1 ? STAGES.length - 1 : s;
  }

  function maybeExpand() {
    var si = stageIndexFor(kills);
    if (si <= stageIdx) return false;
    stageIdx = si;
    growCanvas(STAGES[si].cols, STAGES[si].rows);
    applyStageCaps(STAGES[si]);
    recomputeDifficulty();
    return true;
  }

  function growCanvas(nc, nr) {
    if (!grid || (nc === COLS && nr === ROWS)) return;
    settleAnim();                                  // 先收掉挂着的动画（格索引马上作废）
    var oldCols = COLS, oldRows = ROWS, oldGrid = grid;
    var dx = (nc - oldCols) >> 1, dy = (nr - oldRows) >> 1;
    var ng = new Int8Array(nc * nr);
    for (var y = 0; y < oldRows; y++) {
      for (var x = 0; x < oldCols; x++) {
        var v = oldGrid[y * oldCols + x];
        if (v !== EMPTY) ng[(y + dy) * nc + (x + dx)] = v;
      }
    }
    setCanvasSize(nc, nr);
    grid = ng;
    for (var k = 0; k < enemies.length; k++) {
      var e = enemies[k];
      e.x += dx; e.y += dy;
      /* ⚠ 领地外接矩形也要搬 —— 不搬的话下一圈的环会画到**旧坐标**上去，
         而且不会报错（它只是围到一片空白上）。 */
      if (e.box) {
        e.box = { x0: e.box.x0 + dx, y0: e.box.y0 + dy,
                  x1: e.box.x1 + dx, y1: e.box.y1 + dy };
      }
      e.plan = null; e.planIdx = 0; e.planRect = null;
      e.cooldown = ENEMY_COOLDOWN_MS;
    }
    /* 朋友色一闪：格索引要按新宽度重新映射（否则会闪到错位）。 */
    for (var g = 0; g < flashGroups.length; g++) {
      var cells = flashGroups[g].cells;
      for (var c = 0; c < cells.length; c++) {
        var i = cells[c];
        var ox = i % oldCols, oy = (i - ox) / oldCols;
        cells[c] = (oy + dy) * nc + (ox + dx);
      }
    }
    penX += dx; penY += dy;
    if (penX >= COLS) penX = COLS - 1;
    if (penY >= ROWS) penY = ROWS - 1;
    drawing = false;
    penAcc = 0;
  }

  /* ── 完成度 / 计时 / 结算 ─────────────────────────────────────────── */

  function completionStat() {
    var total = COLS * ROWS, colored = 0;
    if (grid) for (var i = 0; i < grid.length; i++) if (grid[i] === HOME) colored++;
    return { total: total, colored: colored, pct: total > 0 ? (colored / total) * 100 : 0 };
  }

  function fmtClock(ms) {
    if (ms < 0) ms = 0;
    var s = Math.ceil(ms / 1000);
    var m = Math.floor(s / 60); s = s - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function syncHud() {
    if (!el.hud) return;
    var d = completionStat();
    var txt = UI_HUD.replace('%s', fmtClock(leftMs))
                    .replace('%s', String(lives))
                    .replace('%d', String(kills))
                    .replace('%s', d.pct.toFixed(1) + '%');
    if (el.hud.textContent !== txt) el.hud.textContent = txt;
  }

  /**
   * 一局结束 —— 结算：完成度 / 击杀 / 命 / 最高纪录（存 localStorage）。
   * @param {string} [why] 提前结束的原因（例如三条命用完）；到点结束不传。
   */
  function finish(why) {
    if (finished) return;
    finished = true;
    settleAnim();
    stopLoop();
    running = false;                              // 到此画面静止；遮罩仍开着，显示结算面板
    drawing = false;
    penAcc = 0;
    var d = completionStat();
    var isNew = d.pct > best;
    if (isNew) {
      best = d.pct;
      /* ⚠ 隐私模式 / 配额满时 setItem 会抛 —— 包住，别让结算整段崩掉。 */
      try { global.localStorage.setItem(BEST_KEY, String(best)); } catch (err) { /* 隐私模式 */ }
    }
    showResult(d.pct, d.colored, d.total, isNew, why || '');
    fullRender();
  }

  function showResult(pct, colored, total, isNew, why) {
    if (!el.result) return;
    var body = (why ? why + ' · ' : '') + UI_RESULT_BODY
      .replace('%s', pct.toFixed(1) + '%')
      .replace('%d', String(colored))
      .replace('%d', String(total))
      .replace('%d', String(kills))
      .replace('%s', best.toFixed(1) + '%');
    if (isNew) body += UI_RESULT_NEW;
    if (el.resultBody) el.resultBody.textContent = body;
    el.result.classList.add('on');
  }

  function hideResult() { if (el.result) el.result.classList.remove('on'); }

  /** 「再来一局」—— 回到开局档、重新计时。 */
  function startRound() {
    if (!el.overlay) return;
    resetGame();
    running = true;
    lastTick = Date.now();
    startLoop();
  }

  function resetGame() {
    settleAnim();
    stageIdx = 0;
    kills = 0;
    lives = START_LIVES;         // 三条命（第 2 条）
    finished = false;
    leftMs = ROUND_MS;
    flashGroups = [];
    applyStageCaps(STAGES[0]);
    setCanvasSize(STAGES[0].cols, STAGES[0].rows);
    hideResult();

    grid = new Int8Array(COLS * ROWS);
    dirtyFlags = new Uint8Array(COLS * ROWS);
    dirtyList.length = 0;
    drawing = false;
    penAcc = 0;
    axisToggle = false;
    enemies = [];
    speedTier = 0;

    var cx = COLS >> 1, cy = ROWS >> 1;
    var half = HOME_R >> 1;
    for (var y = cy - half; y <= cy + half; y++) {
      for (var x = cx - half; x <= cx + half; x++) {
        if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue;
        grid[y * COLS + x] = HOME;
      }
    }
    penX = cx; penY = cy;
    recomputeDifficulty();
    if (el.msg) el.msg.textContent = MSG_OPEN;
    syncHud();
    fullRender();
  }

  /* ══════════════════════════════════════════════════════════════════
   *  三、遮罩 —— 自己建一个（照 sakura / kosma 的做法）
   * ══════════════════════════════════════════════════════════════════ */

  /** 把游戏用的样式注入 `<head>` —— 页面那边因此**一行 CSS 都不用加**。
      ⚠ 连 `.game-card*` 也在这里注入：另三页把那几条写在**各自页面的 `<style>`** 里，
        而 griseo 这页只留了两处「接线」、没有卡片的样式 —— 不补的话
        「开始」会是一枚**没有样式的默认按钮**。 */
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
      '#griseoGameOverlay{position:fixed;top:0;right:0;bottom:0;left:0;z-index:9995;',
      'display:none;align-items:center;justify-content:center;',
      'padding:4.5rem 1rem 1.5rem;box-sizing:border-box;background:rgba(10,7,13,.94);',
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);',
      'touch-action:none;-webkit-user-select:none;user-select:none;',
      '-webkit-tap-highlight-color:transparent}',
      '#griseoGameOverlay.on{display:flex}',
      '.gr-panel{position:relative;display:flex;flex-direction:column;align-items:center;',
      'max-width:100%;box-sizing:border-box;padding:.9rem;border-radius:18px;text-align:center;',
      'background:linear-gradient(135deg,rgba(21,14,24,.96),rgba(58,36,64,.94));',
      'border:1px solid var(--glass-border,rgba(255,217,122,.14));box-shadow:0 12px 40px rgba(0,0,0,.5)}',
      /* `.gr-body` 把「文字 + 画布」收成一列 —— 横屏时它和摇杆并排（见下面的 media） */
      '.gr-body{display:flex;flex-direction:column;align-items:center;max-width:100%}',
      '.gr-title{margin:0 0 .4rem;font-size:1rem;letter-spacing:.3em;color:var(--sky,#7dd3fc)}',
      /* HUD 一行：`white-space:nowrap` 保证**永远只有一行**
         （它一变行，居中面板就会把画布往下顶、手指下的画面会跟着挪）。 */
      '.gr-hud{margin:0 0 .4rem;font-size:.72rem;line-height:1.6;letter-spacing:.05em;',
      'color:var(--text-dim,#b8a8c8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}',
      /* ⚠ 只给上限、**绝不给 width/height**：一旦显式定宽，max-height 生效时
         高度被压而宽度不变，画面就被**拉扁**了（照 sakura `.sk-canvas` 那条注释）。 */
      '.gr-canvas{display:block;margin:0 auto .5rem;max-width:100%;',
      'max-height:calc(100vh - 22rem);border-radius:10px;',
      'border:1px solid var(--glass-border,rgba(255,217,122,.14));',
      'touch-action:none;user-select:none;-webkit-user-select:none}',
      /* ⚠ 固定预留**两行**高度（`min-height:3.6em`）—— 面板是垂直居中的，
         `.gr-msg` 一变行数，**整块画布会跟着上下跳**：玩家推着摇杆时画面自己动，
         是实打实的手感事故。钉成常数高度后，无论哪条文案画布都待在原地。 */
      '.gr-msg{margin:0 0 .5rem;font-size:.74rem;line-height:1.8;color:var(--text-dim,#b8a8c8);',
      'min-height:3.6em;max-width:100%}',
      /* 摇杆：固定圆盘，挂在面板里（竖屏在画布下面；横屏见 media） */
      '.gr-pad{position:relative;flex:0 0 auto;width:132px;height:132px;border-radius:50%;',
      'touch-action:none;user-select:none;-webkit-user-select:none;',
      'background:radial-gradient(circle at 50% 42%,rgba(201,160,255,.16),rgba(201,160,255,.04) 62%,rgba(0,0,0,0) 72%);',
      'border:1px solid rgba(201,160,255,.28)}',
      '.gr-pad-knob{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;',
      'border-radius:50%;background:rgba(255,217,122,.22);border:1px solid rgba(255,217,122,.5);',
      'pointer-events:none}',
      /* 桌面端（没有触摸）：摇杆**不许显示成「可推」的样子**，改成一行提示 */
      '.gr-pad-off{opacity:.5}',
      '.gr-pad-hint{display:none;position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);',
      'padding:0 .7rem;text-align:center;font-size:.68rem;line-height:1.7;color:var(--text-muted,#7d6e8c)}',
      '.gr-pad-off .gr-pad-hint{display:block}',
      '.gr-pad-off .gr-pad-knob{display:none}',
      /* 「收笔」挂在**屏幕角落**（整个遮罩的右上角），不在面板里 ——
         离游戏区够远，手指落低一点不会误触退出（樱 / mobius / 科斯魔 三页都栽过）。 */
      '.gr-close{position:absolute;top:1rem;right:1rem;z-index:1;min-height:44px;padding:.5rem 1.2rem;',
      'border-radius:999px;cursor:pointer;font-size:.78rem;letter-spacing:.14em;',
      'color:var(--text,#f2e9f8);background:rgba(255,217,122,.1);',
      'border:1px solid var(--glass-border,rgba(255,217,122,.14));transition:background .25s ease}',
      '.gr-close:hover{background:rgba(255,217,122,.2)}',
      /* 结算面板：到点时**覆盖在整块面板上**（绝对定位，不改基础面板的布局/高度，
         所以「手机上放得下」那条断言不受影响）。文字全是站点 UI 文案。 */
      '.gr-result{position:absolute;top:0;right:0;bottom:0;left:0;display:none;',
      'flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:1.4rem;',
      'border-radius:18px;box-sizing:border-box;text-align:center;',
      'background:linear-gradient(135deg,rgba(21,14,24,.98),rgba(58,36,64,.97))}',
      '.gr-result.on{display:flex}',
      '.gr-result-title{margin:0;font-size:1.05rem;letter-spacing:.3em;color:var(--sky,#7dd3fc)}',
      '.gr-result-body{margin:0;font-size:.8rem;line-height:1.9;color:var(--text,#f2e9f8)}',
      '.gr-again{min-height:44px;padding:.6rem 1.6rem;border-radius:999px;cursor:pointer;',
      'font-size:.82rem;letter-spacing:.14em;color:var(--text,#f2e9f8);',
      'background:rgba(125,211,252,.12);border:1px solid var(--glass-border,rgba(255,217,122,.14));',
      'transition:background .25s ease}',
      '.gr-again:hover{background:rgba(125,211,252,.22)}',

      /* ── 矮屏（320×568 / 360×640 那一档）：整体收紧，保证**放得下** ──
         ⚠ fixed 遮罩没有滚动条，超出去的部分**够不着**。 */
      '@media (max-height:640px){',
      '#griseoGameOverlay{padding:3.4rem .7rem .7rem}',
      '.gr-panel{padding:.6rem}',
      '.gr-title{font-size:.9rem;margin-bottom:.25rem}',
      '.gr-msg{min-height:1.8em;font-size:.7rem;margin-bottom:.35rem}',
      '.gr-canvas{max-height:calc(100vh - 24rem);margin-bottom:.35rem}',
      '.gr-pad{width:106px;height:106px}',
      '.gr-pad-knob{width:44px;height:44px;margin:-22px 0 0 -22px}',
      '}',

      /* ── 横屏且矮（640×360）：改成**横排** —— 画布一列、摇杆一列 ──
         ⚠ 选择器必须**带上 `.on`**：基础规则 `#griseoGameOverlay.on{display:flex}`
           特异性更高，只写不带 `.on` 的那条会被它压掉。 */
      '@media (max-height:520px) and (orientation:landscape){',
      '#griseoGameOverlay.on{display:flex}',
      '#griseoGameOverlay{padding:3.2rem .8rem .6rem}',
      '.gr-panel{flex-direction:row;align-items:center;gap:.7rem;padding:.6rem}',
      '.gr-body{flex-direction:column}',
      '.gr-title{display:none}',
      '.gr-hud{margin-bottom:.25rem}',
      '.gr-canvas{max-height:calc(100vh - 11rem);margin-bottom:.25rem}',
      '.gr-msg{min-height:1.8em;margin-bottom:0}',
      '.gr-pad{width:92px;height:92px}',
      '.gr-pad-knob{width:38px;height:38px;margin:-19px 0 0 -19px}',
      '.gr-pad-hint{font-size:.6rem;padding:0 .4rem}',
      '}'
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

    hasTouch = ('ontouchstart' in global) || ((navigator.maxTouchPoints | 0) > 0);

    var ov = document.createElement('div');
    ov.id = 'griseoGameOverlay';
    ov.setAttribute('aria-hidden', 'true');

    var panel = document.createElement('div');
    panel.className = 'gr-panel';

    var body = document.createElement('div');
    body.className = 'gr-body';

    var title = document.createElement('p');
    title.className = 'gr-title';
    title.textContent = API.title;
    body.appendChild(title);

    var hud = document.createElement('p');
    hud.className = 'gr-hud';
    body.appendChild(hud);

    var cv = document.createElement('canvas');
    cv.width = CW;                 // 只设**固有**尺寸；显示尺寸交给 CSS 等比缩
    cv.height = CH;
    cv.className = 'gr-canvas';
    body.appendChild(cv);

    var msg = document.createElement('p');
    msg.className = 'gr-msg';
    body.appendChild(msg);

    panel.appendChild(body);

    /* ── 摇杆（只有触摸设备才「可推」；桌面端降成一行提示）── */
    var pad = document.createElement('div');
    pad.id = 'gr-pad';
    pad.className = hasTouch ? 'gr-pad' : 'gr-pad gr-pad-off';
    pad.setAttribute('aria-hidden', 'true');
    var knob = document.createElement('div');
    knob.className = 'gr-pad-knob';
    pad.appendChild(knob);
    var padHint = document.createElement('p');
    padHint.className = 'gr-pad-hint';
    padHint.innerHTML = UI_PAD_HINT;      // 固定串，不含任何外部输入
    pad.appendChild(padHint);
    panel.appendChild(pad);

    /* 结算面板：绝对定位覆盖在整块面板上，平时 `display:none`（不影响布局）。 */
    var result = document.createElement('div');
    result.className = 'gr-result';
    var rTitle = document.createElement('p');
    rTitle.className = 'gr-result-title';
    rTitle.textContent = UI_RESULT_TITLE;
    var rBody = document.createElement('p');
    rBody.className = 'gr-result-body';
    var again = document.createElement('button');
    again.type = 'button';
    again.className = 'gr-again';
    again.textContent = UI_AGAIN;
    result.appendChild(rTitle);
    result.appendChild(rBody);
    result.appendChild(again);
    panel.appendChild(result);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'gr-close';
    close.textContent = UI_CLOSE;
    close.setAttribute('aria-label', '收起画笔，关闭小游戏');

    ov.appendChild(panel);
    ov.appendChild(close);
    document.body.appendChild(ov);

    el.overlay = ov;
    el.panel = panel;
    el.canvas = cv;
    el.ctx = cv.getContext('2d');
    el.msg = msg;
    el.hud = hud;
    el.pad = pad;
    el.knob = knob;
    el.result = result;
    el.resultBody = rBody;
    el.again = again;
    el.close = close;

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
    startLoop();                                      // 造物开始动（「开局画面在动」靠它）
  }

  function close() {
    if (!el.overlay) return;
    settleAnim();                                     // 收笔 ⇒ 动画立刻结算（画布停在终值）
    stopLoop();                                       // 造物停手（关掉之后画布要静止）
    if (raf) { global.cancelAnimationFrame(raf); raf = null; }
    el.overlay.classList.remove('on');
    el.overlay.setAttribute('aria-hidden', 'true');
    running = false;
    drawing = false;
    penAcc = 0;
    joyActive = false; joyVX = 0; joyVY = 0;
    keys = {};
  }

  /* ── 输入 ─────────────────────────────────────────────────────────── */

  function setKnob(dx, dy) {
    if (!el.knob) return;
    el.knob.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px)';
  }

  function readPad(clientX, clientY) {
    var dx = clientX - padCX, dy = clientY - padCY;
    var r = padR;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > r) {
      var k = r / d;
      dx *= k; dy *= k;
    }
    setKnob(dx, dy);
    joyVX = dx / r;
    joyVY = dy / r;
    joyActive = true;
  }

  function releasePad() {
    joyActive = false;
    joyVX = 0; joyVY = 0;
    setKnob(0, 0);
  }

  /**
   * 输入接线。
   * ⚠ 三条防滚页的闸门**缺一不可**（spec §9.3）：
   *   ① CSS `touch-action:none`（在 injectStyles 里）
   *   ② `pointerdown` / `pointermove` 里 `preventDefault()`
   *   ③ 老内核未必认 `touch-action` —— 再挂一层 `touchmove` 兜底
   * ⚠ **摇杆上的 `pointermove` 尤其必须 preventDefault** —— 否则推杆会把页面滚走。
   */
  function bindOverlay() {
    if (bound) return;
    bound = true;

    /* 最高纪录：读 localStorage。⚠ 隐私模式 / 损坏数据都会抛 —— 包住，退 0。 */
    try {
      var v = parseFloat(global.localStorage.getItem(BEST_KEY));
      best = (v > 0) ? v : 0;
    } catch (err) { best = 0; }

    /* ⚠ 刚打开的那一下不算：「收笔」是屏幕角落的按钮，可浏览器补发的延迟 click
       仍可能落在它上面 —— 400ms 保护期内拒收（与另三页同一条理由）。
       Escape 与内部调用不受这条限制：键盘不会「幽灵点击」。 */
    el.close.addEventListener('click', function () {
      if (Date.now() - openedAt < CLOSE_GUARD_MS) return;
      close();
    });
    if (el.again) el.again.addEventListener('click', function () { startRound(); });

    /* ── 摇杆：**只认触摸**（spec §4.3：鼠标不参与玩法）── */
    function allowPadPointer(e) {
      if (e.pointerType && e.pointerType !== 'touch') return false;
      if (e.isPrimary === false) return false;
      return true;
    }
    function padDown(e) {
      if (!allowPadPointer(e)) return;
      e.preventDefault();
      var r = el.pad.getBoundingClientRect();
      padCX = r.left + r.width / 2;
      padCY = r.top + r.height / 2;
      padR = r.width / 2 || 1;
      readPad(e.clientX, e.clientY);
    }
    function padMove(e) {
      if (!joyActive) return;
      if (e.pointerType && e.pointerType !== 'touch') return;
      e.preventDefault();
      readPad(e.clientX, e.clientY);
    }
    function padUp(e) {
      if (!joyActive) return;
      if (e && e.preventDefault) e.preventDefault();
      releasePad();
    }
    if (global.PointerEvent) {
      el.pad.addEventListener('pointerdown', padDown);
      document.addEventListener('pointermove', padMove);
      document.addEventListener('pointerup', padUp);
      document.addEventListener('pointercancel', padUp);
    } else {
      el.pad.addEventListener('touchstart', function (e) {
        e.preventDefault();
        var t = e.touches[0]; if (!t) return;
        var r = el.pad.getBoundingClientRect();
        padCX = r.left + r.width / 2;
        padCY = r.top + r.height / 2;
        padR = r.width / 2 || 1;
        readPad(t.clientX, t.clientY);
      }, false);
      document.addEventListener('touchmove', function (e) {
        if (joyActive) { e.preventDefault(); var t = e.touches[0]; if (t) readPad(t.clientX, t.clientY); }
      }, false);
      document.addEventListener('touchend', function () { if (joyActive) releasePad(); }, false);
      document.addEventListener('touchcancel', function () { if (joyActive) releasePad(); }, false);
    }
    /* ⚠ 摇杆上的 touchmove 一律拦掉（老内核里 touch-action 未必生效）—— 这是最后一道闸。 */
    el.pad.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

    /* ── 键盘（桌面端唯一的玩法入口）────────────────────────────────
       ⚠⚠ **绝不能直接吃 `keydown` 的重复事件**：操作系统的自动重复是首延迟约 500ms、
       之后约 30 次/秒 —— 直接拿它走格，笔会忽快忽慢、按一下冲出去好几格。
       这里 `keydown` 只**记下方向**，实际步进由主循环按 `stepMs` 驱动（spec §4.2）。 */
    var KEYMAP = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right'
    };
    document.addEventListener('keydown', function (e) {
      if (!el.overlay || !el.overlay.classList.contains('on')) return;
      if (e.key === 'Escape' || e.key === 'Esc') { close(); return; }
      /* ⚠ 焦点落在**遮罩内**的表单控件上时一律放行 —— 让 Tab + Enter/Space 能操作
         「收笔」「再来一局」。判据必须含「在遮罩内」：点完「开始」焦点还留在
         **遮罩外**那颗按钮上，只看 tagName 会把方向键一并吞掉，键盘玩法直接失效。 */
      var t = e.target;
      if (t && t.tagName && el.overlay.contains(t) &&
          /^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      var k = KEYMAP[e.key] || KEYMAP[e.code];
      if (k) {
        /* ⚠ 必须 preventDefault，否则方向键会让**页面滚**（正是 spec §4.2 那条）。 */
        e.preventDefault();
        keys[k] = true;
      } else if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
        /* 本作**没有**「松手」这个动作（踩回自己的颜色就自动回填），
           空格 / 回车不做任何玩法动作 —— 只拦掉，别让页面滚。 */
        e.preventDefault();
      }
    }, false);
    document.addEventListener('keyup', function (e) {
      var k = KEYMAP[e.key] || KEYMAP[e.code];
      if (k) keys[k] = false;
    }, false);
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
      if (el.msg && !running) el.msg.textContent = MSG_OPEN;
      syncHud();
      render();
    } catch (err) {
      /* ⚠ 绝不抛：游戏坏了只是没得玩，不该让整页停摆 */
      console.warn('[ElysiaGames.griseo] mount 出错：', err);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  五、诊断口 —— **仅供本地验收脚本读取，不参与玩法**
   *
   *  ⚠⚠ 玩法状态是 IIFE 私有的，外面看不见。没有这个口，
   *     「人为把占比设到 0.5，看造物变没变」这类断言**没法证伪**。
   *     正常路径一行都不会碰它。
   * ══════════════════════════════════════════════════════════════════ */

  function testState() {
    var list = [];
    for (var k = 0; k < enemies.length; k++) {
      var e = enemies[k];
      list.push({ slot: e.slot, x: e.x, y: e.y, tier: e.tier, stepMs: e.stepMs,
                  homeCode: e.homeCode, strokeCode: e.strokeCode, color: e.color });
    }
    return {
      ratio: playerRatio(), enemyCount: enemies.length, speedTier: speedTier,
      kills: kills, lives: lives, stage: stageIdx, cols: COLS, rows: ROWS,
      cap: enemyCap, floor: enemyFloor, leftMs: leftMs, best: best, finished: finished,
      drawing: drawing, penX: penX, penY: penY, enemies: list
    };
  }

  /** 整张 grid 打成字符图（`.` 空 / `H` 玩家地 / `S` 玩家笔 / `E` 造物地 / `s` 造物笔）。
      ⚠ 只**导出状态**，判据（连通性 / 计数）由验收脚本在外部分析 —— 免得「自己证自己」。 */
  function testDump() {
    if (!grid) return '';
    var rows = [], y, x, v;
    for (y = 0; y < ROWS; y++) {
      var row = '';
      for (x = 0; x < COLS; x++) {
        v = grid[y * COLS + x];
        if (v === EMPTY) row += '.';
        else if (v === HOME) row += 'H';
        else if (v === STROKE) row += 'S';
        else if (isEnemyStroke(v)) row += 's';
        else row += 'E';
      }
      rows.push(row);
    }
    return rows.join('\n');
  }

  /** 直接推进造物 `seconds` 秒（**不依赖真实时间**，给确定性断言用）。 */
  function testTick(seconds) {
    var left = Math.round((seconds || 0) * 1000);
    var guard = 0;
    while (left > 0 && guard++ < 20000) { tickEnemies(100); left -= 100; }
    return testState();
  }

  /** 把玩家领地铺成占比 ≈ r 的**一整块矩形**（连通），并重排造物 —— 难度断言用。 */
  function testSetPlayerRatio(r) {
    if (!grid) return null;
    settleAnim();
    var n = COLS * ROWS;
    var target = Math.round((r || 0) * n);
    if (target < 0) target = 0; else if (target > n) target = n;
    grid = new Int8Array(n);
    if (dirtyFlags) dirtyFlags = new Uint8Array(n);
    dirtyList.length = 0;
    enemies = [];
    drawing = false;
    var k = 0, x, y;
    for (y = 0; y < ROWS && k < target; y++) {
      for (x = 0; x < COLS && k < target; x++) { grid[y * COLS + x] = HOME; k++; }
    }
    recomputeDifficulty();
    fullRender();
    return testState();
  }

  /** 给造物 `k` 的领地**套一圈玩家色的墙**（击杀结算的正面用例）。 */
  function testEncloseEnemy(k) {
    if (!grid || !enemies[k]) return null;
    var minX = COLS, minY = ROWS, maxX = -1, maxY = -1, i, x, y;
    for (i = 0; i < grid.length; i++) {
      if (grid[i] !== enemies[k].homeCode) continue;
      x = i % COLS; y = (i - x) / COLS;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxX < 0) return null;
    function putHome(px, py) {
      if (px < 0 || px >= COLS || py < 0 || py >= ROWS) return;
      var idx = py * COLS + px;
      if (grid[idx] === HOME) return;
      if (grid[idx] === enemies[k].homeCode) return;   // 别把它的地覆盖掉
      grid[idx] = HOME;
      markDirty(idx);
    }
    for (x = minX - 1; x <= maxX + 1; x++) { putHome(x, minY - 1); putHome(x, maxY + 1); }
    for (y = minY - 1; y <= maxY + 1; y++) { putHome(minX - 1, y); putHome(maxX + 1, y); }
    scheduleRender();
    return testState();
  }

  /** 造物 `k` 的**领地格数**（验「会自己长」/「被吃掉」用）。 */
  function testEnemyTerritory(k) {
    if (!grid || !enemies[k]) return 0;
    var code = enemies[k].homeCode, c = 0;
    for (var i = 0; i < grid.length; i++) if (grid[i] === code) c++;
    return c;
  }

  /**
   * 让造物 `k` 在 (x,y) 落一格笔触，并**走一次真实的碰撞判定**（`stepEnemy` 的同一条路）。
   * ⚠ 只给本地验收脚本用 —— 「碰撞断笔」那条断言需要一个**确定性的**碰撞入口：
   *   真实路径要玩家把笔开到某只造物旁边、再等它长过来，落点根本控不住。
   *   这里触发的是**同一个** `handleCollision`，所以断笔行为一字不差。
   */
  function testEnemyStrokeTo(k, x, y) {
    var e = enemies[k];
    if (!grid || !e) return null;
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
    var idx = y * COLS + x;
    if (grid[idx] !== EMPTY) return null;
    e.x = x; e.y = y;
    grid[idx] = e.strokeCode;
    markDirty(idx);
    if (touchesPlayerStroke(x, y)) handleCollision(e);
    else scheduleRender();
    return testState();
  }

  function testPlayerTerritory() {
    if (!grid) return 0;
    var c = 0;
    for (var i = 0; i < grid.length; i++) if (grid[i] === HOME) c++;
    return c;
  }

  function testStrokeCells() {
    if (!grid) return 0;
    var c = 0;
    for (var i = 0; i < grid.length; i++) if (grid[i] === STROKE) c++;
    return c;
  }

  function testFinish() {
    finish();
    return {
      state: testState(),
      shown: el.result ? el.result.classList.contains('on') : null,
      text: el.resultBody ? el.resultBody.textContent : null
    };
  }

  function testSetLeft(ms) {
    leftMs = (ms < 0) ? 0 : ms;
    syncHud();
    return testState();
  }

  /** 把笔尖直接放到 (x,y)（确定性断言用）。`down` 可选：给落着 / 抬起定态。 */
  function testSetPen(x, y, down) {
    penX = Math.max(0, Math.min(COLS - 1, x | 0));
    penY = Math.max(0, Math.min(ROWS - 1, y | 0));
    if (typeof down === 'boolean') drawing = down;
    scheduleRender();
    return testState();
  }

  /**
   * **精确走一步**（调真实的 `stepTo`）。
   * ⚠ 摇杆与键盘都是**按时间步进**的，走几格不可控；要画一个**确定的形状**
   *   （比如「精确把造物的某一格围起来」）只能用这个口。
   */
  function testStep(dx, dy) {
    if (!grid) return null;
    stepTo(penX + (dx | 0), penY + (dy | 0));
    return testState();
  }

  /**
   * 立刻走一次**真实的收口**（`settleStroke`）—— 不必等笔踩回自己的领地。
   * 给「用 `setPen` + `step` 摆好一笔、马上结算」的确定性断言用。
   */
  function testSettle() {
    settleStroke();
    return testState();
  }

  /**
   * 强制造物 `k` 现在就走一次**围地环**：`planRing` → 逐步走完 → `finishPlan` 收口。
   * 返回 `{ ok, reason }`；`ok=false` 时 reason 说明环为什么没成。
   * ⚠ 真实路径里「环成不成」取决于它 box 周围的局面，**落点根本控不住** ——
   *   所以「造物围地会吃掉圈里玩家的地」那条断言需要一个**强制入口**。
   *   它走的是**同一个** `finishPlan`，收口行为一字不差。
   */
  function testForceRing(k) {
    var e = enemies[k];
    if (!grid || !e) return { ok: false, reason: 'no-enemy' };
    refreshBox(e);
    e.planRect = null;
    var path = planRing(e);
    if (!path) return { ok: false, reason: 'no-ring' };
    e.plan = path;
    e.planIdx = 0;
    var guard = 0;
    while (e.plan && guard++ < 5000) stepEnemy(e);
    return { ok: true, reason: 'ok', state: testState() };
  }

  var API = {
    title: '上色',
    hint: '把这张画，涂成你的颜色。',
    mount: mount,
    /* ⚠ 见上面「诊断口」那段 —— 仅供本地验收脚本，不参与玩法。 */
    _test: {
      state: testState,
      dump: testDump,
      tick: testTick,
      setPlayerRatio: testSetPlayerRatio,
      encloseEnemy: testEncloseEnemy,
      enemyTerritory: testEnemyTerritory,
      enemyStrokeTo: testEnemyStrokeTo,
      finish: testFinish,
      setLeft: testSetLeft,
      resolveKills: function () {
        var r = resolveKills();
        fullRender();
        return { captured: r.captured, expanded: r.expanded, state: testState() };
      },
      penCell: function () { return { x: penX, y: penY }; },
      setPen: testSetPen,
      step: testStep,
      settle: testSettle,
      forceRing: testForceRing,
      playerTerritory: testPlayerTerritory,
      strokeCells: testStrokeCells
    }
  };

  /* ══════════════════════════════════════════════════════════════════
   *  六、围地算法 —— 从 Task 1 的原型**原样移植**（R24）
   *
   *  来源：`C:\tmp\griseo_fill_proto.js`（生效原型 R33，210 行，已过 10 轮复核）。
   *  ⚠ 移植改动只有两处：**去掉文件尾的 `module.exports`**（游戏文件是 IIFE），
   *    以及把 `buildLid` 的 Dijkstra 换成**等价的最短 BFS**
   *    （spec §6.3(k)：封口线等长时取哪一条都行，tie-break 是实现细节，实测无害）。
   *
   *  ── 接口 ──────────────────────────────────────────────────────────
   *    fillEnclosed(grid, w, h, owner) -> { filled, interior }
   *      grid : Int8Array(w*h)，**行主序** idx = y*w + x
   *             0 = 空白 / 1 = 玩家领地 / 2 = 玩家笔触 / >=3 = 造物
   *      owner: 填充成谁（玩家 = 1）；**1 / 2 是写死的哨兵**，owner 只决定输出颜色
   *      返回 : { filled }   = 本次**新填**的格数
   *             { interior } = 其中**「被围出来的空白」**的格数（不含被收编的笔触本身）——
   *              `settleStroke` 靠它选文案：interior==0 ⇒ 没围住，不许说「围住啦」。
   *   ⚠ **原地改 grid**（不是纯函数），除此之外无副作用 / 不碰 DOM / ES5。
   *
   *  ── ⚠ 移植时**不许动**的几条（改了结论就变）──────────────────────────
   *   (a) `1` / `2` 是**写死的哨兵**：`touchesHome` 里写 `=== 1`、收集轨迹写 `=== 2`；
   *       `owner` 只决定输出颜色 ⇒ 传非玩家 owner 会**静默错**。
   *   (i) ⚠ **玩家领地必须保持 4 连通**：`buildLid` **只走领地** ⇒ 两端都贴着家、
   *       但两块领地**不 4 连通**时，封口线走不通 ⇒ **整笔被静默拒绝**。
   *       复核实测：家连成一片 0/1200 被拒；家是两座孤岛 620/1200 = **51.7% 被拒**。
   *       ⇒ 防线在 `stepTo` 的「抬起态」（碰撞后必须回领地才能重新落笔）。
   *   (j) ⚠ **墙与泛洪都必须 4 连通**（对角不算连通）。复核穷举 4×4 上「单分量 +
   *       0 自由端」的轨迹 382 个，其中 4 个（1.0%）在 4/8 连通下结论不同
   *       ⇒ **别顺手改成 8 邻域**。
   *   (k) 封口线**等长时取哪一条都行**（tie-break 是实现细节，实测无害）。
   *       不必复刻具体 tie-break，但**必须**保持「只走领地格、走不通就不入选」。
   *   (c) 「笔尖落在自己颜色上」≠「端点在 `1` 的四邻」：`touchesHome` 是**四邻判定**。
   *       ⚠ 「`touchesHome` 冗余」这个结论**已被撤回**：两自由端**彼此 4 相邻**
   *       （组件是一枚 2 格「插头」）时，`buildLid` 一步就够、空 lid 也算成功
   *       ⇒ 那半句是**唯一**那道闸。原版 filled=15，把它换成 `true` 变 16 ✗ —— 别删。
   *
   *  ── 适用边界（别当它「全对」）─────────────────────────────────────
   *   · 只认轨迹：领地与外沿都不参与围合 ⇒「轨迹 + 画布外沿」围出的**贴边区域不算围住**。
   *   · ④ 内部判定 = 「墙 + 从画布四条外边泛洪，**灌不到的空白 = 内部**」——
   *     ⚠ **绝对不要**退回「逐行 span」：凹形闭合环上它会多填 111%。
   *   · ⑤ 上色：内部空白 → owner；**所有 `2` 格 → owner（无条件）**；领地(1)/造物(>=3) 不动。
   * ══════════════════════════════════════════════════════════════════ */

  var DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  /* 某个格子的四邻里有没有「家」（默认玩家领地 `1`）。 */
  function touchesHome(grid, w, h, i, homeCode) {
    if (homeCode === undefined) homeCode = HOME;
    var x = i % w;
    var y = (i - x) / w;
    for (var d = 0; d < DIRS.length; d++) {
      var nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (grid[ny * w + nx] === homeCode) return true;
    }
    return false;
  }

  /* 封口线：从 from 到 to 的**最短 4 连通路径**（不含两端）。
     · ⚠ **中间格只许走玩家领地(1)** —— 不许横穿空白（否则会画出一道「幻影墙」）。
     · 只走四邻 ⇒ **绝不会有对角步**。
     · 走不通 ⇒ 返回 null ⇒ 调用方判这一笔不入选（不围合，也不假装封口）。
     ⚠ 等价实现：原型的 Dijkstra 权重是「领地 2 / 终点 3」，即**除终点外等权**
       ⇒ 一条普通的 BFS 给出同一族最短路（spec §6.3(k)：等长取哪条都行）。 */
  function buildLid(grid, w, h, from, to, out, homeCode) {
    if (homeCode === undefined) homeCode = HOME;
    var n = w * h;
    var seen = new Uint8Array(n);
    var prev = new Int32Array(n);
    var i;
    for (i = 0; i < n; i++) prev[i] = -1;
    var q = [from];
    seen[from] = 1;
    var head = 0, found = false;
    while (head < q.length) {
      var u = q[head++];
      if (u === to) { found = true; break; }
      var x = u % w, y = (u - x) / w;
      for (var d = 0; d < DIRS.length; d++) {
        var nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        var j = ny * w + nx;
        if (seen[j] === 1) continue;
        if (j !== to && grid[j] !== homeCode) continue;   /* ⚠ 中间格只许走领地 */
        seen[j] = 1; prev[j] = u; q.push(j);
      }
    }
    if (!found) return null;
    var path = [];
    var k = to;
    while (k !== -1 && k !== from) { path.push(k); k = prev[k]; }
    for (i = path.length - 1; i >= 0; i--) {
      if (path[i] !== to && path[i] !== from) out.push(path[i]);
    }
    return out;
  }

  function fillEnclosed(grid, w, h, owner, trailCode, homeCode) {
    if (trailCode === undefined) trailCode = STROKE;
    if (homeCode === undefined) homeCode = HOME;
    if (!w || !h) return { filled: 0, interior: 0 };
    var n = w * h;
    var i, t, d, x, y, nx, ny, j;

    /* ① 收集轨迹 + 按 4 连通切成【连通分量】 */
    var trail = [];
    for (i = 0; i < n; i++) if (grid[i] === trailCode) trail.push(i);
    if (trail.length === 0) return { filled: 0, interior: 0 };

    var seen = new Uint8Array(n);
    var comps = [];
    for (t = 0; t < trail.length; t++) {
      var start = trail[t];
      if (seen[start] === 1) continue;
      var cells = [], ends = [], q = [start];
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
          if (grid[j] === trailCode) {
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
    var blocked = 0;                  // 有多少分量「两端都贴家、但家不连通」⇒ 封不上口
    for (t = 0; t < comps.length; t++) {
      var c = comps[t];
      var ok = false;
      var lid = [];
      /* "两端各自四邻都贴着某一格玩家领地(1)" —— **不要求领地连成一片**
         ⚠ 这半句**不能省**（两格「插头」时它是唯一那道闸）。 */
      var anchored = (c.ends.length === 2 &&
                      touchesHome(grid, w, h, c.ends[0], homeCode) &&
                      touchesHome(grid, w, h, c.ends[1], homeCode));
      if (c.ends.length === 0 || c.ends.length === 1) {
        /* 自己成环；**或**「一个封死的环 + 一根死尾巴」。
           为什么 ends==1 一定是这种形状：连通图里若只有一个度为 1 的顶点、其余度为 2
           （或 0，单格），则它必含**唯一的环**，环上挂一条路径（lollipop）——
           环是封死的、尾巴是死路、都不漏 ⇒ 与「自己成环」同理，**无需封口线**。 */
        ok = true;
      } else if (anchored) {
        ok = true;
        if (buildLid(grid, w, h, c.ends[0], c.ends[1], lid, homeCode) === null) {
          ok = false;
          /* ⚠ **这不是普通的不入选**：两端各自都贴着家，只是那两块家**不 4 连通**
             （玩家的地被啃断成几块时会这样）⇒ 封口线走不通 ⇒ 整笔静默被拒。
             单列出来给调用方**说一声**，别让它悄悄失败（spec §6.3(i) / §12.1）。 */
          blocked++;
        }
      }
      if (!ok) continue;
      var k;
      for (k = 0; k < c.cells.length; k++) wall[c.cells[k]] = 1;
      for (k = 0; k < lid.length; k++) wall[lid[k]] = 1;
    }

    /* ④ 内部判定：把「墙」当墙、从**画布四条外边**泛洪；灌不到的空白 = 内部。 */
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

    /* ⑤ 上色：内部空白 → owner；**内部「对方的地」也 → owner**；
       **所有 trail 格 → owner（无条件）**；owner 自己的领地(`homeCode`) 不动。

       ⚠ **「围地填充时连对方一起填」是 2026-10-04 需求方点名要的改进（第 5 条）**：
         谁围住一片，那片里**对方的地也一并归自己** —— 不必等把对方**整块**围死
         （「整块围死」是 `resolveCaptures` 的事，那是**击杀**；这里是**抢地**）。
         ⚠ 双方**共用这一条** ⇒ 玩家围地会吃掉圈里的造物地，
           造物围地也会吃掉圈里玩家的地 —— 这就是需求方要的「完全对称」。
         ⚠ 顺带：被围住的**对方笔触**（不是自家 trailCode 的那一档）也归 owner。

       `interior` = **只数「被围出来的空白」**；`ate` = 被吃掉的**对方格子**数。
       文案靠这两个选：**两个都是 0** 才说明「这一笔没围住什么」，那时才不许说「围住啦」。 */
    var filled = 0, interior = 0, ate = 0;
    for (i = 0; i < n; i++) {
      if (grid[i] === trailCode) {
        /* ⚠ **第 3 条（2026-10-04 需求方）**：只收编**入选分量**里的笔触。
           原来这里是**无条件全收** —— 于是「什么都没围住的一笔」也会把自己的线
           染成领地色（文案还写着「只有笔触本身留下了颜色」）。
           需求方要的是 **没围住就不上色**（白画一场），所以闸门挪到这里：
           分量没入选 ⇒ 这一格**留在 `trailCode`**，交给 `settleStroke` 淡去。
           ⚠ 顺带把 §6.5「无条件收编」那条老规则**改掉了** —— 见规范附录 C.6。 */
        if (wall[i] === 1) { grid[i] = owner; filled++; }
        continue;
      }
      if (outside[i] !== 0) continue;                       // 外面的，一律不动
      if (grid[i] === 0) { grid[i] = owner; filled++; interior++; continue; }
      if (grid[i] !== homeCode) { grid[i] = owner; filled++; ate++; }   // 圈里对方的地 → 归我
    }
    return { filled: filled, interior: interior, ate: ate, blocked: blocked };
  }

  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.griseo = API;

})(window);
