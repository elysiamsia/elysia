# 格蕾修（`/griseo/`）建页 + 探索系统 · 实施计划（计划 A）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零建出 `griseo/index.html`（Ⅺ·繁星·画家），接入探索系统 / 下方区块 / 生日胶囊，让这一页「逛得起来」。

**Architecture:** 照 HANDOVER §4.1 的配方——`cp su/index.html` 骨架 → **一个临时替换脚本**逐块替换（每处断言「恰好命中 N 次」，对不上就 `sys.exit(1)` 整体中止，不留改一半的页）。共享层（`explore.js` / `bottom.js` / `bday.js`）**只接线、不改动**。

**Tech Stack:** 原生 HTML/CSS/JS（无框架、无构建、无第三方库）、共享层 `ElysiaShared` / `ElysiaExplore` / `ElysiaBottom` / `ElysiaBday`、验证工具 `tools/cdp.py` + `tools/check_*.py` + `tools/snapshot*.py`。

**Spec:** `docs/superpowers/specs/2026-10-03-griseo-explore-design.md`

> ⚠ **本计划不包含小游戏「上色」** —— 它是独立文件（`assets/games/griseo.js`）、独立子系统，
> 见 **`docs/superpowers/plans/2026-10-03-griseo-game.md`（计划 B）**。
> ⚠ **但本计划里要预留游戏槽的接线**（`THEME.game = { module:'griseo' }` +
> `<script src="/assets/games/griseo.js">`）—— **等计划 B 做完再打开那两行**，
> 否则 `check_explore.py` 收了 CDP 的 `Log` 域，**游戏文件 404 会算失败**。

## Global Constraints

- **不引入任何第三方库**（Phaser / PixiJS 等一律不用）；页面只用共享层 + 本页私有代码。
- **不动任何现有页**（10 页）—— 本轮验收的安全网是「其余 10 页零差异」。
- **台词必须有出处、绝不编造**；原文照录，**一个字不改**（含 `······` 六个中点）。
- **`src` 格式**：`官方档案馆 · 事件-格蕾修 · <子事件>`
- **不使用「爰莉希雅」（源站错字）那一条台词**（spec §九）。
- **页面文案用「她」**（骨架来自 `su`＝男性，写的是「关于他」——**最容易漏的一个字**）。
- 全部 `python` 命令带 `PYTHONIOENCODING=utf-8`（Windows 中文输出会 GBK 崩）。
- 临时脚本（替换 / 抓取）**一律不进仓库**。
- 配色取 spec §3.1（`--bg-deep:#150e18` / 多色 / 金强调）。

## Review Focus

这五类是这个 spec 隐含、但没有一条现成断言覆盖的失败方式（每类都已在下面对应任务的步骤里配了断言）：

1. **骨架性别代词漏改** —— 从 `su`（男）复制，页面里散落「他 / 关于他」；快照采**计算样式、不含文本**，三项验收**全测不出**（樱页从上线挂到现在）。→ Task 2 Step 5
2. **生日胶囊串页** —— 那 15 个 `--bday-*` 变量不覆盖会回落到首页爱莉希雅的粉紫+金，**静默、快照也测不出**（`#bdayPanel` 不在 `SELECTORS` 里）。→ Task 7
3. **可发现物压在文字 / 画上** —— 12 个 finds 的坐标是**锚点宽度的百分比**，换视口就落到别处；桌面干净≠手机干净（樱页实测桌面 0 个 / 手机 4 个）。→ Task 6
4. **两幅画（彩蛋 1/2）热区互相干扰 / 压住 finds** —— 探索系统那批元素不在快照 `SELECTORS` 里，压住了**看不出来**。→ Task 5
5. **白名单静默失败** —— `KEEP_DIRS` 少一个目录，**连产物都进不去且不报错**（mobius 在 `main` 上躺了 10 天，线上一直 404）。→ Task 8

---

### Task 1: 取材 —— 12 条 finds 的逐字核准表

**Files:**
- Create: `docs/superpowers/plans/2026-10-03-griseo-finds-table.md`
- Read（临时，不进仓库）: `C:\tmp\griseo_raw.txt`（已抓的档案馆全文，7666 字符）

**Interfaces:**
- Produces: 一张核准表（12 行 `(id, line, src, 情感倾向)`），Task 6 的 `THEME.explore.finds` 直接照抄。

**取材现状（已完成，不必重抓）**：档案馆 `https://baike.mihoyo.com/bh3/wiki/content/1676/detail`，
**10 个折叠段全部展开（判据「剩余 `[展开]` = 0」）**，得**格蕾修台词 112 条（G1–G112）+
给予刻印独白 17 条（M1–M17）**。⚠ 抓取脚本在 `C:\tmp\`，**不进仓库**。

- [ ] **Step 1: 定 12 条（初选清单，逐条与原文核字）**

| id | 落点 | 台词（初选，**须逐字核**） | 来源（子事件） |
|---|---|---|---|
| `griseo-01` | `#opening` | 「我······想为你画一幅画。」 | 关于绘画·其一 |
| `griseo-02` | `#about` | 「嗯，这里有很多新的灵感，能画出许多朋友。」 | 画家的追忆·其一 |
| `griseo-03` | `#about` | 「再后来的事······我记得不是很清楚了。」 | 画家的追忆·其一 |
| `griseo-04` | `#palette` | 「颜料，找不到了······没有颜料的话······就找不到朋友们了。」 | 给予刻印·其一 |
| `griseo-05` | `#palette` | 「蓝色的太阳、紫色的湖、红色的猎人和绿宝石的猫······」 | 给予刻印·其九 |
| `griseo-06` | `#journey` | 「爸爸妈妈都在这里工作，他们告诉我，基地是世界上最安全的地方。」 | 画家的追忆·其八 |
| `griseo-07` | `#journey` | 「好像睡了很长的一觉，醒来的时候，爸爸妈妈都不见了······」 | 画家的追忆·其一 |
| `griseo-08` | `#journey` | 「一艘小船，坐着它，可以飞往天上。」 | 画家的追忆·九 |
| `griseo-09` | `#journey` | 「他更想像芽衣姐姐说的那样，去「战斗」。」 | 画家的追忆·九 |
| `griseo-10` | `#quotes` | 「星星们住的地方······一定很美吧？你也想和我一起住到那里去吗？」 | 给予刻印·其十三 |
| `griseo-11` | `#ending` | 「芽衣姐姐到这里来，时间应该已经过去很久了吧。」 | 画家的追忆·九 |
| `griseo-12` | `#bottom` | 「帕朵姐姐的尾巴很暖，很舒服······」 | 给予刻印·其十二 |

- [ ] **Step 2: 逐字核准（判据：原文里逐字找得到，含 `······` 的中点数）**

对每一条，从 `C:\tmp\griseo_raw.txt` 里 `grep` 出**完整原文行**，与上表**逐字比对**。
⚠ **长句只截前半**的做法在这里**不允许**——要么照录全句，要么换一条；截断会读出半句话。
⚠ 记录**情感倾向**（温暖 / 孤独 / 坚定 / 调皮），Task 6 排「情绪节奏」时用。

- [ ] **Step 3: 查重（判据：全部为 0）**

```bash
# 与语录区 10 条、调色盘 5 条、unlock 1 条、whisper 4 条、彩蛋 7 条 零重复
# 逐条 grep 核准表里的 12 句，确认不出现在上面那些池子里
```
⚠ 语录区 10 条 = M8 / M10 / M3 / G4 / G62 / G69 / G71 / G99 / G100 / G107；
调色盘 5 条 = G79 / G47 / G39 / G73 / G44；unlock = M7；彩蛋 = G105 / G13 / G15 / G58。

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-10-03-griseo-finds-table.md
git commit -m "文档：格蕾修 12 条可发现物逐字核准表（含出处与情感倾向）"
```

---

### Task 2: 建页 —— `griseo/index.html`（骨架 + 配色 + 文案）

**Files:**
- Create: `griseo/index.html`（用临时脚本从 `su/index.html` 生成）
- Create（临时，不进仓库）: `C:\tmp\build_griseo.py`

**Interfaces:**
- Consumes: Task 1 的核准表（语录区 / 时间轴文案的来源）
- Produces: 一个**能打开、能看**的页面（此时**还没有**探索系统与游戏）；后续 Task 3–7 都在它上面加东西。

**必须替换的块**（照 `kosma/index.html` 那次的做法：每处断言命中次数）：

- [ ] **Step 1: 写替换脚本（判据：每处断言「恰好命中 N 次」，否则 `sys.exit(1)` 且不写盘）**

替换清单（62 处量级，逐块列清）：

| # | 从（su） | 到（griseo） |
|---|---|---|
| 1 | `<title>` / meta description / canonical / JSON-LD ×2 | 「致格蕾修」/ 刻印「繁星」/ `/griseo/` |
| 2 | `:root` 配色（§3.1 的 14 个变量） | 多色主角那一套 |
| 3 | `#bodhiCanvas` → | `#paintCanvas` |
| 4 | 开场：标题 / 副标题 / 打字机五数值 / `#openingMoon` | 她的开场（**打字机换成她的性格：细碎、跳跃**） |
| 5 | `#about` 档案卡（位次 Ⅺ / 繁星 / 画家 / 异能·星尘 / 十字架 / CV / 生日 12/21 / 穆 / 色彩浸染） | 全部按材料包 |
| 6 | `#journey` 9 个 `.timeline-node` | 她的 9 段旅途（见下） |
| 7 | `#quotes` 10 句 | Task 1 定的语录池 |
| 8 | `#ending` 文案 / `ariaLabel`「繁星之画，点击切换」 | |
| 9 | 全部「他 / 他的 / 关于他」 | 「她 / 她的 / 关于她」 |

**时间轴 9 个节点**（材料包 §二）：穆大陆出身 → 幼年在基地（梅比乌斯的糖）→ 认识科斯魔与黛丝多比娅 →
第八次崩坏（母亲布兰卡离去）→ 超变手术（「活下去的方法」）→ 阿波尼亚与科斯魔的守护、她开始画画 →
成为第十一位「繁星」→ **方舟计划（她替科斯魔登船）** → 沉睡约 1537 年后苏醒。
⚠ **成长形态那一节**接在「方舟 / 星尘装甲解锁」节点**之后**（spec §3.5），用
`给予刻印·其十三` 的独白 + 立绘切换。

- [ ] **Step 2: 跑脚本生成页面**

```bash
PYTHONIOENCODING=utf-8 python C:/tmp/build_griseo.py
# 期望输出：每处替换打印「命中 N 次」，最后「已写入 griseo/index.html」
# 任何一处对不上 → 脚本 sys.exit(1)，且**不写盘**（不留改一半的页）
```

- [ ] **Step 3: 反向核对（判据：全部为 0 或符合预期）**

```bash
cd D:/claude-code/elysia-main
grep -c "关于他\|他的\|苏\|bodhiCanvas\|shaVeil\|muyu" griseo/index.html   # 期望 0
grep -n "关于她" griseo/index.html                                          # 期望 ≥1
grep -n "致格蕾修\|Ⅺ\|繁星" griseo/index.html                               # 期望都能命中
```

- [ ] **Step 4: 起服务器 + 截图核对（桌面 1280×900 / 手机 375×812）**

```bash
python -m http.server 8500 &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8500/griseo/index.html   # 期望 200
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/griseo/index.html \
  size 1280x900 sleep 2500 shot screenshots/griseo-desktop.png
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/griseo/index.html \
  size 375x812 sleep 2500 shot screenshots/griseo-mobile.png
```
⚠ 照 HANDOVER §6.4：**不接受「看起来差不多」**，逐节看。

- [ ] **Step 5: 「关于他」文本类核对（三项验收测不出的那一类）**

```bash
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/griseo/index.html \
  size 1280x900 sleep 2500 eval "document.querySelector('#about .section-title').textContent"
# 期望包含「她」而非「他」
```

- [ ] **Step 6: 与 aponia / villv 并排截图核对配色（像素差分，非肉眼）**

```bash
# 照 HANDOVER §6.4：相近的浅色肉眼分不出，用 PIL.ImageChops 比对
# 目的：确认本页底色 / 主色与 aponia(#9d8fd0 紫) / villv(#4ecdc4 teal) 不同
```

- [ ] **Step 7: Commit**

```bash
git add griseo/index.html
git commit -m "格蕾修：新建 /griseo/ 页面（配色 / 档案 / 时间轴 / 语录 / 开场 / 结尾）"
```

---

### Task 3: 专属特效 `#paintCanvas` ——「颜料晕开成星」

**Files:**
- Modify: `griseo/index.html`（`<canvas id="paintCanvas">` + 页内 `<script>`）

**Interfaces:**
- Consumes: `ElysiaShared.makeResize(canvas, state)`（已有的 resize 工厂）
- Produces: 一个自绘的粒子系统；**不导出任何东西**（页面私有，照现有页的做法）。

- [ ] **Step 1: 写实现（全站唯一「留下痕迹、会变色」的粒子）**

要点（不是逐行代码，是决策）：
- 一颗颜料滴从上方飘落（比花瓣**慢**、比余烬**轻**）
- 落到某处 → **晕开**：半径渐大、透明度渐低（这就是「面」，区别于全站的「点」）
- 颜色从 §3.1 五色里随机取
- 偶发：几颗晕开的光点**凝成一颗四角星**（复现 `glint` 的形状语言），再淡去
- ⚠ 走 `ElysiaShared.makeResize`，别自己写 resize

- [ ] **Step 2: 减动核对（判据：减动下**粒子停住**、且光标仍可见）**

```bash
# check_reduced_motion.py 在 Task 9 加进 PAGES 后统一跑 —— 这里先手工验：
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/griseo/index.html \
  size 1280x900 sleep 2500 eval "getComputedStyle(document.body).cursor"
```

- [ ] **Step 3: 截图核对（桌面 + 手机，判据：能看到**晕圈**而非点）**

- [ ] **Step 4: Commit**

```bash
git add griseo/index.html
git commit -m "格蕾修：专属特效 #paintCanvas —— 颜料晕开成星"
```

---

### Task 4: 专属互动模块 ——「她的调色盘 · 色彩浸染」

**Files:**
- Modify: `griseo/index.html`（新增 `<section id="palette">` + 私有 `<script>`）

**Interfaces:**
- Produces: `#paletteStage`（点击容器）、`#paletteLine`（她的那句话）、`#paletteAttr`（出处）。
  Task 5 的彩蛋与 Task 6 的 finds 会锚在 `#palette` 上。

- [ ] **Step 1: 写 DOM + 样式**

五抹色块（`data-color="tail|kosma|aponia|mobius|self"`）+ 一块「她说话」的区域。
⚠ **`#paletteStage` 要加进点击涟漪的排除名单**（照 `su` 排除 `#muyuStage` 的先例）。

- [ ] **Step 2: 写交互（判据：点每一抹 → 换色 + 换台词 + 换 src）**

五色 → 五句（**全部有出处**）：

| `data-color` | 对应 | 台词 | src |
|---|---|---|---|
| `tail` | 帕朵菲莉丝 | 「一起去『搞票大的』······！」 | 画家的追忆·其六 |
| `kosma` | 科斯魔 | 「唔······因为科斯魔说，更喜欢这样······」 | 画家的追忆·其二 |
| `aponia` | 阿波尼亚 | 「嗯，阿波尼亚对我很好，就像妈妈一样。」 | 画家的追忆·其一 |
| `mobius` | 梅比乌斯 | 「是梅比乌斯阿姨。」 | 画家的追忆·其五 |
| `self` | 她自己 | 「那之后，我就一直在画画。因为阿波尼亚妈妈说这样能帮到大家，画里也有很多朋友。」 | 画家的追忆·其一 |

⚠ 每句**逐字核准**（进 Task 1 那张表的同名核对流程）。

- [ ] **Step 3: 真点一遍（五个色块逐一，判据：文字与颜色都变，且**不是**只变一个）**

```bash
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/griseo/index.html \
  size 1280x900 sleep 2500 \
  eval "document.querySelectorAll('#paletteStage [data-color]').length"   # 期望 5
# 逐块 .click() 后读 #paletteLine.textContent，确认五次都不同
```
⚠ 照 HANDOVER §6.4：**点之前先把 `rect.top` 打出来看一眼**（视口外的元素派发事件会静默无操作）。

- [ ] **Step 4: Commit**

```bash
git add griseo/index.html
git commit -m "格蕾修：专属模块「她的调色盘 · 色彩浸染」（五色五句，均有出处）"
```

---

### Task 5: 三个彩蛋

**Files:**
- Modify: `griseo/index.html`

**Interfaces:**
- Consumes: `#paletteStage` 的排除涟漪写法（Task 4）
- Produces: `#paintingKosma` / `#paintingElsia` / 踩画布计数（均页内私有）。

- [ ] **Step 1: 彩蛋 1《星空下的少年》（点画，递进显形）**

点 → **暖色渐显**（墨绿 + 旭光橙，呼应科斯魔那页）→ 再点 → 画面多画出来一点 → 她说
`G105`（「我喜欢小船，也喜欢月亮先生。我有画笔和颜料，可以画出好多朋友。我让科斯魔不要担心。」）。
⚠ **视觉上要「一次比一次多」**，让玩家看出这是「正在画」。

- [ ] **Step 2: 彩蛋 2《那幅空白的画》（点画，**始终空白**）**

点第 1 次 → 沉默；点第 2 次 → `G13`（「没关系。我为她画出的景象，只有一片空白。」）；
再点 → `G15`（「也可能，是因为我无法走进她的内心。」）。
⚠ **点完之后画布**仍然是空白**（只留一层极淡微光）** —— 「空白」本身就是内容。

- [ ] **Step 3: 彩蛋 3《你踩到画布了》（在页面任意处点 → 留颜料脚印）**

累积到第 N 个脚印 → `G58`（「······不可以用自己的衣服和手当调色板，不可以在床单和墙上画画。」）。
⚠ **与全局点击涟漪互斥**：脚印只在计数触发时出现，平时仍走涟漪。
⚠ 涟漪的排除名单要含 `#paletteStage` / `#paintingKosma` / `#paintingElsia`。

- [ ] **Step 4: 验「两幅画互不干扰 + 不压 finds」（判据：三条都过）**

```bash
# ① 点 #paintingKosma 只触发彩蛋 1；点 #paintingElsia 只触发彩蛋 2（各自读 DOM 确认）
# ② 两个热区不相交（getBoundingClientRect 取交，面积期望 0）
# ③ 中心点上 elementFromPoint 不命中任何 .explore-find（后者在 Task 6 加，届时重跑）
```
⚠ ②③ 是**几何判据**（照 sakura Task 7 的做法：只采一个点会漏，必须量**交集**与**中心点**）。

- [ ] **Step 5: Commit**

```bash
git add griseo/index.html
git commit -m "格蕾修：三个彩蛋（两幅画 + 踩画布留痕），机制避开既有 15 种"
```

---

### Task 6: 探索系统接入

**Files:**
- Modify: `assets/explore.js`（**新增 art 关键字**，`ART` 对象在 `:66-94`）
- Modify: `griseo/index.html`（`THEME.explore` + 接线）
- Modify: `docs/theme-schema.md`（art 关键字清单登记，`:134-143`）

**Interfaces:**
- Consumes: Task 1 的 12 条核准表（`finds` 的 `line` / `src` 逐字照抄）
- Produces: `THEME.explore = { pageId:'griseo', finds:[12], unlock, whisper, whisperCooldownMs:9000 }`

- [ ] **Step 1: 新增 art 关键字（她的母题不在现有 17 个里）**

至少需要：`brush`（画笔）、`palette`（调色盘）、`frame`（画框）、`crab`（螃蟹）、`moon`（月亮）、
`ark`（方舟）。⚠ 格式：24×24 viewBox、**只用 stroke**、不引外部资源、不写 `<svg>` 外壳；
写错一个字母**只 warn 并静默回落** `glint`（`explore.js:106-109`）。

- [ ] **Step 2: 写 `THEME.explore`**

12 条 `finds`（落点按 spec §4.2：opening 1 / about 2 / palette 2 / journey 4 / quotes 1 / ending 1 / bottom 1）
+ `unlock`（`M7`）+ `whisper`（4 条：`M16` / `M14` / `M15` / `M2`）+ `whisperCooldownMs: 9000`。

- [ ] **Step 3: 接线（四个 `<script>` + 一个 `<link>`）**

```html
<link rel="stylesheet" href="/assets/explore.css">   <!-- ⚠ 页面 <style> 之前 -->
<script src="/assets/explore.js"></script>
<script src="/assets/bottom.js"></script>
<script src="/data/bdays.js"></script>
<script src="/assets/bday.js"></script>
```
⚠ **顺序不可换**（site → explore → bottom → bdays → bday）。
⚠ `assets/games/griseo.js` **这一行先不加**（计划 B 做完再加）——现在加就是 404，**404 算失败**。

- [ ] **Step 4: 跑探索断言（判据：全绿，且**两个视口**——1256 与 375）**

```bash
PYTHONIOENCODING=utf-8 python tools/check_explore.py griseo/index.html
```
⚠ 新页要在 `EXPECTED_FINDS` 里登记（Task 8），否则这一跑会**先挂一条与内容无关的断言**。

- [ ] **Step 5: 验落点（判据：**两个视口**都 0 个 find 压在文字上）**

```bash
# check_explore.py 的「可发现物不压文字」断言已扩成两视口（HANDOVER §10.10 二）
# ⚠ 桌面干净 ≠ 手机干净（樱页实测桌面 0 / 手机 4）
```

- [ ] **Step 6: Commit**

```bash
git add assets/explore.js griseo/index.html docs/theme-schema.md
git commit -m "格蕾修：接入探索系统（12 个可发现物 + 解锁 + 陪伴层）+ 6 个 art 关键字"
```

---

### Task 7: 下方区块 + 生日胶囊（含 15 个 `--bday-*` 变量）

**Files:**
- Modify: `griseo/index.html`

**Interfaces:**
- Consumes: `ElysiaBottom.mount(opts)` / `ElysiaBday.mount(opts)`
- Produces: `#bottom`（探索度 + 游戏槽）、`#bdayEgg` / `#bdayPanel`

- [ ] **Step 1: 覆盖 15 个 `--bday-*` 变量（照 `mobius/index.html` 的写法）**

`--bday-ink / accent / title / date / num / unit / egg-bg / egg-border / egg-glow / egg-glow-hover /
panel-bg / panel-border / panel-glow / cell-bg / cell-border` × 15，值照 §3.1 的**多色 + 金**取。
⚠ **不覆盖 = 串页成首页爱莉希雅的粉紫+金，静默、快照测不出**（`#bdayPanel` 不在 `SELECTORS` 里）。

- [ ] **Step 2: 写挂载调用**

```js
ElysiaExplore.init(THEME.explore);
ElysiaBottom.mount({ game: THEME.game });   // ⚠ 先只给 module 名，脚本到计划 B 才加
ElysiaBday.mount({ birthMsg: '……', src: '官方档案馆 · 事件-格蕾修 · ……' });
```
⚠ 生日当天那句（12/21）**必须从档案馆取**，别拿首页爱莉希雅那句顶替。

- [ ] **Step 3: 真渲染核对（判据：胶囊颜色**不是**粉紫+金，四格齐全、秒数在走）**

```bash
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/griseo/index.html \
  size 1280x900 sleep 2500 \
  eval "(()=>{const e=document.getElementById('bdayEgg');return e?getComputedStyle(e).borderColor+'|'+getComputedStyle(document.documentElement).getPropertyValue('--bday-accent'):'无胶囊'})()"
# 期望：--bday-accent 是**本页**的值，不是首页那套粉紫
```

- [ ] **Step 4: Commit**

```bash
git add griseo/index.html
git commit -m "格蕾修：下方区块 + 生日胶囊（覆盖 15 个 --bday-* 变量，防串页）"
```

---

### Task 8: 八个登记点

**Files:**
- Modify: `.github/workflows/static.yml:47`（`KEEP_DIRS`）
- Modify: `sitemap.xml:61`（`<url>` 块）
- Modify: `data/timeline-data.js:224`（`her-11` 加 `url`）
- Modify: `tools/snapshot.py:66`（`PAGES`）
- Modify: `tools/check_aria_labels.py:55`（`EXPECTED`）
- Modify: `tools/check_reduced_motion.py:36`（`PAGES`）
- Modify: `tools/check_explore.py:56`（`EXPECTED_FINDS`）
- Modify: `tools/check_explore.py:2306`（`GAMES`，**等计划 B**）

**Interfaces:**
- Produces: 页面进得了产物、被快照拍得到、被各项断言守得到。

- [ ] **Step 1: 逐个加（判据：`grep griseo` 在每个文件里都命中一次）**

```bash
cd D:/claude-code/elysia-main
grep -n "griseo" .github/workflows/static.yml sitemap.xml data/timeline-data.js \
  tools/snapshot.py tools/check_aria_labels.py tools/check_reduced_motion.py tools/check_explore.py
```
⚠ `check_aria_labels.EXPECTED` 的值**必须与页面 `ariaLabel` 逐字一致**（本页定「繁星之画，点击切换」）。

- [ ] **Step 2: 验「线上真的会存在」（判据：本地全绿 ≠ 线上存在）**

```bash
# ⚠ 推 main 之后才能验；推 dev 时先本地核对 KEEP_DIRS 那一行
grep -n "KEEP_DIRS" .github/workflows/static.yml
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/static.yml sitemap.xml data/timeline-data.js tools/
git commit -m "格蕾修：八个登记点（白名单/站点地图/名片/三个工具/探索声明）"
```

---

### Task 9: 三项验收（含**先建基线**）

**Files:**
- Create: `screenshots/snap/before-griseo/`（动手前的基线，**先跑**）

**Interfaces:**
- Consumes: 全部前面的产物

- [ ] **Step 1: ⚠ 先建本轮参照点（**动手前**的基线）**

```bash
# 在动手前那个 commit 上 worktree → 跑 snapshot.py → 得 before-griseo
# （照 HANDOVER §4.3.1：本轮要 bench 的是「新建一页」，拿 after-postcard 比会把整页当新增噪音）
git worktree add C:/tmp/elysia-before-griseo <动手前的 sha>
```

- [ ] **Step 2: 拍本轮快照 + 差分**

```bash
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-griseo
# ⚠ **跑完才落盘**；判据：末尾出现「快照存入」且进程真的退出（重跑时文件数判据会骗你）
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py before-griseo after-griseo; echo "退出码 $?"
# 期望：/griseo/ 的差异**逐条可解释**；其余 10 页零差异
```

- [ ] **Step 3: 属性断言**

```bash
PYTHONIOENCODING=utf-8 python tools/check_aria_labels.py      # 期望 11 / 11
PYTHONIOENCODING=utf-8 python tools/check_reduced_motion.py   # 期望 8 / 8
PYTHONIOENCODING=utf-8 python tools/check_explore.py           # 探针页，全绿
PYTHONIOENCODING=utf-8 python tools/check_explore.py griseo/index.html
```

- [ ] **Step 4: 清掉 8500 服务器（别留给下一个人）**

```bash
netstat -ano | grep ":8500 " | grep LISTENING | head -1   # 查 PID
taskkill //F //PID <pid>
```

---

### Task 10: 文档 + 推送

**Files:**
- Modify: `docs/HANDOVER.md`（§2.3 新增一节「上一轮」/ §10.12 / §4.2 机制表 / §5.2）

- [ ] **Step 1: 更新 HANDOVER**（照樱 / 科斯魔那两轮的写法：§2.3 补一轮、§10.12 收「最值钱的收获」）

- [ ] **Step 2: 推 `dev`（**不替需求方合并到 `main`**）**

```bash
git push origin dev
```

---

## Self-Review

- **Spec coverage**：spec §3.1 配色→Task 2；§3.2 特效→Task 3；§3.3 模块→Task 4；§3.4 彩蛋→Task 5；
  §3.5 成长一节→Task 2 Step 1；§四 探索→Task 6；§六 下方/生日→Task 7；§七 登记点→Task 8；
  §八 验收→Task 9；§五 游戏→**计划 B**。
- **Type consistency**：`pageId:'griseo'`、`THEME.game={module:'griseo'}`、`ariaLabel:'繁星之画，点击切换'`、
  `#paintCanvas` / `#palette` / `#paletteStage` / `#paletteLine` / `#paintingKosma` / `#paintingElsia`
  —— 全篇一致。
- **Review Focus**：五行各自在 Task 2 Step 5 / Task 7 Step 1 / Task 6 Step 5 / Task 5 Step 4 / Task 8 有对应验证。
