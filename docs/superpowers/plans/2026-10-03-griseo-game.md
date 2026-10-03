# 小游戏「上色」· 实施计划（计划 B）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出 `assets/games/griseo.js` —— 一个原生 canvas 单文件的 IO 圈地游戏：玩家和「造物」各自圈地，把造物的领地整个吃掉；越大越凶；3 分钟。

**Architecture:** 一个 IIFE 单文件，导出 `ElysiaGames.griseo`。核心是一张**网格**（`Int8Array`）+ **洪水填充**（从画布外边界灌，灌不到的空白就是被围住的 → 上色）。玩家按住拖动画一笔、松手回填；造物是简易 AI，同样有领地、也会圈地。渲染走**离屏 canvas 缓存**，只在格子变更时增量重绘。

**Tech Stack:** 原生 JS（ES5 风格，照 `sakura.js` / `kosma.js`）、原生 canvas 2D、`localStorage` 存最高分。**无第三方库。**

**Spec:** `docs/superpowers/specs/2026-10-03-griseo-explore-design.md` §五

> ⚠ **依赖：计划 A 必须先做完**（`griseo/index.html` 要先存在，游戏才有地方挂）。
> ⚠ **本计划 Task 5 才打开页面的接线**（`<script src="/assets/games/griseo.js">` +
> `check_explore.py` 的 `GAMES`）——之前打开就是 **404，而 404 在 `check_explore.py` 里算失败**。

## Global Constraints

- **不引入任何第三方库**（Phaser / PixiJS 一律不用）。
- **游戏内不放台词**；面板文字是**站点 UI 文案**（契约硬规定）。
- IIFE 单文件；`mount(host)` 内 `try/catch`，**绝不抛异常**，出错只 `console.warn`；可重复调用。
- 自建遮罩 `#griseoGameOverlay`，`aria-hidden` 与 `.on` **同步**；关闭键挂**屏幕角落**。
- **400ms 保护期**（`CLOSE_GUARD_MS = 400`，挡双击 / 浏览器补发的延迟 click）。
- 动画走 canvas（`prefers-reduced-motion` **不关它**——由「开始」显式触发）。
- 面向**大陆手机**：不用新语法/新 CSS；`touch-action:none` 防页面跟着滚。
- 游戏**不参与探索度**（两系统解耦）。
- 全部 `python` 命令带 `PYTHONIOENCODING=utf-8`。

## Review Focus

1. **「笔触贴边 / 未闭合却贴边」** —— 最容易出「没围住却被填色 / 围住了却没填」（spec §5.4，需求方点名）。→ Task 1
2. **拖动时页面跟着滚** —— 手机上手势冲突，探索系统的 `slide` 动词踩过同类。→ Task 2 Step 4
3. **退出键离操作区太近** —— sakura 实测 55px 会误触（「点一下就退出去了」）。本作是拖动型，按**滑动面 ≥50px** 量。→ Task 5
4. **难度随领地膨胀而失控** —— 「地越大造物越快」可能瞬间崩盘。必须**分档 + 封顶**。→ Task 4
5. **造物卡死 / 原地抖动** —— AI 走进死角后要能脱身。→ Task 4 Step 3

---

### Task 1: 围地填充算法（独立原型，**先验算法再进游戏**）

**Files:**
- Create（临时原型，**不进仓库**）: `C:\tmp\griseo_fill_proto.js`
- Create（临时测试，**不进仓库**）: `C:\tmp\griseo_fill_test.js`

**Interfaces:**
- Produces: `fillEnclosed(grid, w, h, owner) -> { filled:number }` —— 纯函数，不碰 DOM。
  `grid` 是 `Int8Array(w*h)`；`0`=空白 / `1`=玩家领地 / `2`=玩家笔触 / `>=3`=造物。

- [ ] **Step 1: 写算法**

决策（不是逐行代码）：**洪水填充**——从画布**四条外边**的每一个空白格起灌，
把能到达的空白标记为「外部」；灌不到的空白格**就是被围住的** → 连同笔触一起变成 `owner`。
比「扫描线配对」好保证正确（尤其贴边那几种 case）。

- [ ] **Step 2: 写四条边界断言（需求方点名的那种 case）**

```js
// 每条都断言 filled 的数量与**具体哪些格**变了
test('笔触贴边但真的闭合 → 该填', ...);
test('笔触贴边但没闭合 → 不填（外部能绕进去）', ...);
test('笔触贴画布角落 → 不误填', ...);
test('围出的区域只有单格宽的通道 → 通道不算围住', ...);
test('已有领地贴边时，新围的区域照常填', ...);
```

- [ ] **Step 3: 跑（判据：全过；每条都试过「故意改错 → 报红」）**

```bash
node C:/tmp/griseo_fill_test.js
```

- [ ] **Step 4: 每条断言配一处变异**（把算法改错 → 必须报红；⚠ **红灯也要看失败原因**，别把脚本崩了当成断言抓住了）

---

### Task 2: 游戏骨架 + 遮罩 + 玩家可动

**Files:**
- Create: `assets/games/griseo.js`

**Interfaces:**
- Consumes: Task 1 的 `fillEnclosed`
- Produces: `ElysiaGames.griseo = { title:'上色', hint:'把这张画，涂成你的颜色。', mount: mount }`
  DOM：遮罩 `#griseoGameOverlay`（`.on`）、画布 `.gr-canvas`、关闭键 `.gr-close`

- [ ] **Step 1: 写骨架**（照 `sakura.js` 的标准骨架）

模块级单实例状态（`raf` / `running` / `best` / `openedAt`）；`mount(host)` 建 `.game-card`
（标题 / 提示 / 「开始」按钮）；`buildOverlay()` 建遮罩（关闭键挂**屏幕角落**、`aria-hidden='true'`）；
`open()` / `close()`；`bindOverlay()`（`bound` 标志只挂一次 + 400ms 保护期 + Escape 退出）。

- [ ] **Step 2: 网格与渲染**

`COLS=48, ROWS=32`；`grid = Int8Array(COLS*ROWS)`；玩家起始占中央 `3×3`（「画布原点」）。
渲染：**离屏 canvas 缓存**，只在格子变更时 `fillRect` 那几格，再 `drawImage` 到主画布。

- [ ] **Step 3: 玩家移动（按住拖动）**

笔尖**跟随手指 / 鼠标**，整体**向上偏移约 44px**（手指落点 = 笔尖下方，防挡视线）。
移动经过的格：在自己领地外 → 标 `2`（笔触）。⚠ 用**浮点位置 + 逐格标记**（别跳格漏标）。

- [ ] **Step 4: 验「拖动时页面没有滚动」（判据：`scrollY` 不变）**

```bash
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/griseo/index.html \
  size 375x812 sleep 2500 \
  eval "(()=>{const y=scrollY;const s=document.querySelector('#griseoGameOverlay .gr-canvas');/* 真派发 pointer 拖动 */return y})()"
# 期望：拖动前后 scrollY 相同
```

- [ ] **Step 5: Commit**

```bash
git add assets/games/griseo.js
git commit -m "格蕾修小游戏：骨架 + 遮罩 + 玩家可拖动（网格与离屏渲染）"
```

---

### Task 3: 上色 —— 松手回填

**Files:**
- Modify: `assets/games/griseo.js`

**Interfaces:**
- Consumes: Task 1 `fillEnclosed`、Task 2 的笔触标记

- [ ] **Step 1: 写回填**

松手时：**若笔尖落在自己的颜色上** → 调 `fillEnclosed` 把围住区域变 `1`（带晕染动画）；
**否则** → 笔触淡去（回 `0`，白画）。

- [ ] **Step 2: 验「拖动能真的上色」（判据：上色**格数变多**，不是「画了个圈」）**

```bash
# 断言读「玩家领地格数」，而不是「canvas 上有没有线条」——
# 后者「画了个圈但没回填」照样绿（HANDOVER §10.10 五：出刀判定曾经只证明「循环在跑」）
```

- [ ] **Step 3: 配变异**（把 `fillEnclosed` 的调用注释掉 → 必须报红）

- [ ] **Step 4: Commit**

```bash
git add assets/games/griseo.js
git commit -m "格蕾修小游戏：圈地回填（松手落回自己的颜色即上色）"
```

---

### Task 4: 造物（AI 圈地 + 碰撞 + 难度）

**Files:**
- Modify: `assets/games/griseo.js`

**Interfaces:**
- Produces: `enemies[]`（每个有 `{x, y, owner, speed, color}`）；`ENEMY_COLORS`（对应调色盘的朋友色）

- [ ] **Step 1: 造物登场**

每个造物：**带一种「朋友色」**（墨绿 / 暖橙 / 紫罗兰…，呼应 spec §3.3 的调色盘）+
起始一小块领地。

- [ ] **Step 2: 造物 AI（会自己圈地）**

简单策略：从自己的领地出发 → 沿当前方向走 N 格 → 转向绕回领地 → 回填。⚠ 卡住（前方是
自己领地 / 边界）就换向。**行为要看起来「有意图」**，别原地抖动。

- [ ] **Step 3: 碰撞（对称）**

- 造物笔触碰到**玩家笔触** → 玩家笔触**全断**，笔尖从自己的颜色重新出发（「灵感中断」）
- 玩家笔触碰到**造物笔触** → 造物那一笔断（退回它自己领地）

- [ ] **Step 4: 难度（分档 + 封顶）**

玩家的地越大 → 造物**数量 +1**（`1 + floor(占比/0.2)`，**封顶 4**）、**速度升一档**
（`floor(占比/0.15)`，**封顶 3**）。⚠ **分档、不是线性**，且**封顶** —— 否则瞬间崩盘。

- [ ] **Step 5: 验「领地变大 → 造物真的变了」+「造物不卡死」**

```bash
# ① 断言：人为把玩家领地占比设到 0.5 → 造物数量/速度档确实变了（可证伪）
# ② 造物连续跑 30 秒，位置方差 > 阈值（证明没卡死）
```

- [ ] **Step 6: Commit**

```bash
git add assets/games/griseo.js
git commit -m "格蕾修小游戏：造物（AI 圈地 / 对称碰撞 / 分档难度）"
```

---

### Task 5: 击杀与阶段 / 结算 / 接入页面

**Files:**
- Modify: `assets/games/griseo.js`
- Modify: `griseo/index.html`（**打开那两行接线**）
- Modify: `tools/check_explore.py:2306`（`GAMES`）

**Interfaces:**
- Consumes: 计划 A Task 7 预留的 `THEME.game = { module:'griseo' }` 与 `ElysiaBottom.mount`

- [ ] **Step 1: 击杀 + 阶段扩张**

造物的领地**全部染成玩家颜色** → 造物消失（闪过它自己的「朋友色」）。
累计**杀掉 2 个** → **画布解锁更大区域**（`COLS/ROWS` 增大，网格扩张）+ 更多造物上场。

- [ ] **Step 2: 结算（3 分钟）**

`ROUND_MS = 180000`。到点 → 结算面板：**完成度**（上色格 / 总格）+ 击杀数 + **最高纪录**
（存 `localStorage`，读写包 `try/catch` —— 隐私模式会抛）。⚠ 随时可「收笔」退出。

- [ ] **Step 3: 打开页面接线**

```html
<!-- griseo/index.html：⚠ 必须在 bottom.js 之后 -->
<script src="/assets/games/griseo.js"></script>
```
```python
# tools/check_explore.py 的 GAMES 加：
'griseo/index.html': {'overlay': 'griseoGameOverlay', 'canvas': '.gr-canvas',
                      'close': '.gr-close', 'play': None, 'guard': True},
```
⚠ `play: None` —— 本作是**拖动**型，没有连点区；退出键的间距按**滑动面 ≥50px** 量。

- [ ] **Step 4: 跑通用四条 + 专属断言**

```bash
PYTHONIOENCODING=utf-8 python tools/check_explore.py griseo/index.html
# 通用四条：开局在动 / 手机上放得下+摸得到 / 退出键离操作区够远 / 减动下仍在动
# 专属（照 check_sakura_judgment 的模式）：
#   ① 拖动能真的上色  ② 被撞 → 笔触断  ③ 领地变大 → 造物变了  ④ 击杀 → 画布扩张
```
⚠ 专属断言里凡是**写死 `griseo` 页名**的，要用 `@griseo_only` 收窄（否则跑别的页会先挂一堆无关断言）。

- [ ] **Step 5: 每条专属断言配变异**（改错实现 → 必须报红；⚠ 红时**看失败原因**）

- [ ] **Step 6: 线上真点一遍（推 `main` 之后）**

```bash
# 照 HANDOVER §4.4：本地全绿 ≠ 线上全绿
PYTHONIOENCODING=utf-8 python tools/cdp.py "https://elysiad.top/griseo/" size 375x812 sleep 6000 \
  eval "(()=>{const s=document.querySelector('#griseoGameOverlay .gr-canvas');/* 真触摸拖动 */return 1})()"
```

- [ ] **Step 7: Commit**

```bash
git add assets/games/griseo.js griseo/index.html tools/check_explore.py
git commit -m "格蕾修小游戏：击杀/阶段扩张/结算 + 接入页面（GAMES 登记）"
```

---

## Self-Review

- **Spec coverage**：spec §5.1 玩法→Task 2/3/4/5；§5.2 操作→Task 2 Step 3-4；§5.3 契约→Task 2/5；
  §5.4 风险→Task 1（算法）/ Task 4（AI + 难度）/ Task 2 Step 4（手势）；§5.5 断言→Task 3/5。
- **Type consistency**：`fillEnclosed(grid,w,h,owner)`、`Int8Array` 的 `0/1/2/>=3` 编码、
  `#griseoGameOverlay` / `.gr-canvas` / `.gr-close`、`ROUND_MS=180000`、`CLOSE_GUARD_MS=400` —— 全篇一致。
- **Review Focus**：五行各自在 Task 1 Step 2 / Task 2 Step 4 / Task 5 Step 4 / Task 4 Step 4 / Task 4 Step 5 有对应验证。
- **比例**：五个任务、单文件，与 spec §五 的篇幅相称（未把代码抄进计划）。
