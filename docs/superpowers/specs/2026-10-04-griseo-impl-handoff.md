# 「上色」重写 · 实现方交接单

> **给需求方看的操作单。** 用途：把「重写 `assets/games/griseo.js`」这件事交给一个
> **网页端 AI**（**零上下文、看不到代码库**）。
>
> - 日期：**2026-10-04**
> - 规则来源：`docs/superpowers/specs/2026-10-04-griseo-color-game-rewrite-spec.md`
>   （以下简称《规范》）
> - ⚠ 上一轮实现已复核为**不能用**，逐条见《规范》**附录 B**。
>   本交接单的「§4 上一轮是怎么死的」就是照着那次教训写的。
> - ⛔ **第二轮（2026-10-04）又栽了，而且是同一道门** —— 见本文档 **§六**。
>   **交出去之前请先读那一节。**

---

## 一、给实现方看哪些文件（**5 份，一份不多一份不少**）

| # | 给什么 | 为什么给 | 体量 |
|---|---|---|---|
| **1** | 《规范》**全文** —— `docs/superpowers/specs/2026-10-04-griseo-color-game-rewrite-spec.md` | **唯一的规则来源**。玩法 / 接口 / 验收 / 反例全在里面 | 838 行 / 50 KB |
| **2** | `assets/bottom.js` **全文** | ⭐ **最小、收益最大的一份** —— 它 112 行里就有 `ElysiaGames[module].mount(host)` 的**真实调用点**，一举消除「契约到底长什么样」的全部歧义 | 112 行 / 5.6 KB |
| **3** | `assets/games/kosma.js` **全文** | ⭐ **风格样板** —— 同一份仓库里已经跑通的「模块自建遮罩 + `.km-close` + 保护期 + `_test` 口」的写法。照它的骨架改，别自己发明 | 461 行 / 19 KB |
| **4** | `tools/check_explore.py` 的**节选** | 让实现方**看见验收工具真正量什么**（`GAMES` 登记、四条通用断言、一个专属断言的写法）。**节选由下面的脚本生成**，别整份给 | 约 470 行 / 22 KB |
| **5** | `griseo/index.html` 里**两处接线**的原文 | 3 行。让它知道**页面已经接好线、不许再动**（附件 1 的 §1 也写了，这里是原文佐证） | 3 行 |

> ✅ **这 5 份已经被打成一份可直接粘贴的合订文件** —— 生成命令见本文档 §五。
> 你不用手工拼，跑一条命令、打开那个文件、整段复制就行。

### ⛔ 绝不要给的四样

| 不要给 | 因为 |
|---|---|
| **旧的 `assets/games/griseo.js`**（2142 行） | **那是要被替换掉的东西。** 给了它，实现方会照着旧的那套「手指跟笔」的范式去改 —— 那正是本次重写要丢掉的东西 |
| 整份 `tools/check_explore.py`（4453 行） | 噪音太大；而且里面大量 `b.js(...)` 的用法和别的页的断言会把它带偏。上一轮那份「补丁」就是照着**想象**写成了 Playwright 的 `page.evaluate(...)` |
| 整份 `griseo/index.html`（1673 行） | 与本任务无关，还会让它以为要改页面 |
| `docs/HANDOVER.md`（1986 行） | 与本任务无关 |

---

## 二、给实现方的 Prompt（**可直接粘贴，已自包含**）

> ⚠ 下面这一段**不需要改**。它已经把「你是谁、要交什么、格式怎么定、怎么自检」全部写死，
> 所以网页端 AI「没有上下文」这件事不会成为问题。

````text
# 【任务】重写 assets/games/griseo.js

## 0. 你的处境
你**没有任何代码库访问权限**，看不到这个项目的其它任何东西，也不能运行代码。
下面 5 个附件就是你全部的输入。**不要猜测任何没写在这里的东西**；
凡是附件里没写的，一律以《附件 2：规范》为准；《规范》也没写的，选**最简单**的做法。

## 1. 交付物（只有一个文件，只有一次输出）
**完整替换 `assets/games/griseo.js`**，一个文件。
- **不要**输出 `tools/check_explore.py` 的改动。那不是你的活，上一轮就是在这里翻的车。
- **不要**输出补丁 / diff / 片段 / 伪代码。
- **不要**输出 `griseo/index.html` 的改动 —— 那两处接线**已经接好了**，见附件 1。

## 2. 输出格式（硬性，逐条照做，没有例外）
1. 正文**只放一个** ```javascript 围栏代码块，里面是从第一行到最后一行的**完整文件**：
   - 第一行必须是 `/**` 开头的那段文件头注释；
   - 最后一行必须是 `})(window);`。
2. **不许省略**：不许出现 `// ...`、`// 其余不变`、`// 同上`、`/* 略 */`、`（略）`。
3. 代码块**之后**只允许写三样，且**不要再用围栏**：
   - `完整行数：<数字>`
   - `最后一行：<逐字抄一遍>`
   - 一张对照表：**《规范》章节 → 你在代码里的哪个函数/哪一段**，外加「自检」一列。
4. **不要**写前言、不要写设计说明、不要写总结感想。
5. ⚠ 如果你判断**一次写不完 800 行以上**，**不要输出半个文件** ——
   先回一句「需要分两次」，然后给出**前半段完整可运行**的部分，等我说继续。

## 3. 交付前自检（逐条读你自己的代码确认，结论写进上面那张表的「自检」列）
1. `window.ElysiaGames.griseo` 上有 **`title` / `hint` / `mount`** 三样（**缺一样整份作废**）
2. `mount(host)` 用的是**传进来的 `host`**，不是 `document.body`
3. 遮罩**只在 `mount` 之后**才建；初始**不带** `.on`，且 `aria-hidden="true"`
4. 选择器**逐字**一致：`#griseoGameOverlay` / `.gr-canvas` / `#gr-pad` / `.gr-pad-knob` /
   `.gr-close` / `.gr-hud` / `.gr-msg` / `.gr-result` / `.gr-result-body` / `.gr-again`
5. `_test` 的方法名**逐字**照《规范》§13.1 抄（13 个）：
   `state` `dump` `tick` `setPlayerRatio` `encloseEnemy` `enemyTerritory` `finish`
   `setLeft` `resolveKills` `penCell` `setPen` `playerTerritory` `strokeCells`
6. 网格 **48 × 32**、`CELL = 12`
7. 格子编码：**`3+2k` 领地 / `4+2k` 笔触**，`slot ≤ 6`，最大码 14
8. 全文**没有** `Math.random()`
9. 全文**没有** `=>` / `const ` / `let ` / 反引号 / `?.` / 模板串 —— **ES5**
10. 玩法**不接受鼠标**（鼠标只能点「开始」「收笔」「再来一局」）
11. 摇杆上的 `pointermove` 与方向键都做了**防滚页**（`preventDefault`）
12. 方向键**没有**直接吃 `keydown` 的重复事件（步进由主循环按 `stepMs` 驱动）

## 4. 上一轮是怎么死的（照这个反面清单自查）
上一轮那份实现自称「严格遵循规范」，实际：
1. **没有 `mount` / `title` / `hint`**（只导出了 `_test`）⇒ **游戏根本不出现在页面上**
2. **选择器全不对**（用 `#gr-container` 之类）⇒ 验收工具找不到任何元素
3. **没有遮罩 / 开始按钮 / 退出键 / `aria-hidden`** ⇒ 一进页面就自己跑，没法开始也没法退出
4. **`init()` 自己就崩了**（`render()` 在网格建好之前就遍历它）⇒ 全局连 `ElysiaGames.griseo` 都没有
   ⇒ **整支代码什么都不干**

⇒ 所以 §3 那 12 条**请真的逐条读一遍自己的代码**再勾，不要凭印象打勾。

## 5. 附件
- 附件 1：`assets/bottom.js` —— `mount(host)` 的真实调用点
- 附件 2：**《规范》** —— 唯一规则来源
- 附件 3：`assets/games/kosma.js` —— 风格样板，照它的骨架写
- 附件 4：验收工具节选 —— 它真正量什么
- 附件 5：`griseo/index.html` 的两处接线原文（**不许动**）
````

---

## 三、对方回话之后，你要做的三步

```bash
cd D:\claude-code\elysia-main

# ① 先看它有没有守格式（这一步不打开浏览器、10 秒）
#    判据：只有一个代码块、结尾是 })(window);、行数 ≥ 600、通篇没有「略」这个字

# ② 落盘（⚠ 用代码块的「复制」按钮，别用鼠标框选复制）
#    存成 assets/games/griseo.js

# ③ 跑《规范》§11.0 那一关（20 秒，能当场否掉一份实现）
grep -c "mount:" assets/games/griseo.js              # 必须 ≥ 1
grep -c "griseoGameOverlay" assets/games/griseo.js   # 必须 ≥ 1
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/griseo/index.html \
  size 375x812 sleep 3000 \
  eval "JSON.stringify(Object.keys(window.ElysiaGames.griseo||{}))" \
  eval "!!document.querySelector('#griseoGameOverlay')" \
  eval "!!document.querySelector('.bottom-game .game-card-start')"
# 期望依次是：["title","hint","mount","_test"]  /  true  /  true
```

> ⚠ **③ 过不了就别往下走。** 上一轮那份 600 行的东西，
> 本来在第 10 秒就能被这 5 行命令否掉。
>
> ✅ **③ 过了**，再交给我跑 `tools/check_explore.py` 与那 7 条专属断言
> （**那部分由我方来写** —— 它需要仓库里 `b.js(...)` 那套 API，网页端 AI 写不出来）。

---

## 四、⚠ 复制粘贴这条链路上的坑（上一轮真栽过）

| 环节 | 坑 | 做法 |
|---|---|---|
| 网页 AI → 你 | **鼠标框选复制**会把 Markdown 字符吃掉：`dx*dx` 变成 `ddx`、`state.grid[y][x]` 变成 `gridy\x`、`*100` 消失 | **用代码块右上角的「复制」按钮**。这也是 Prompt §2 要求「只能有一个代码块」的原因 —— 只有一个块，就没有选错的机会 |
| 你 → 落盘 | 手抖改到一个字符 | 存完之后 `node --check assets/games/griseo.js`（语法错会当场报出来） |
| 你 → 我 | 别再贴聊天窗口 | **落盘成文件**，我直接读文件 |

---

## 五、生成「可直接粘贴的合订文件」

下面这条命令把**本文档 §二 的 Prompt** + **5 个附件**按顺序拼成**一个文件**：

```bash
cd /d/claude-code/elysia-main
HANDOFF=docs/superpowers/specs/2026-10-04-griseo-impl-handoff.md
SPEC=docs/superpowers/specs/2026-10-04-griseo-color-game-rewrite-spec.md
OUT=/c/tmp/griseo-impl-brief.md
{
  echo "===== 先读这一段：任务、输出格式、自检清单 ====="; echo
  sed -n '/^````text$/,/^````$/p' "$HANDOFF" | sed '1d;$d'
  echo; echo "===== 附件 1：assets/bottom.js（mount 的真实调用点）====="; echo
  echo '```javascript'; cat assets/bottom.js; echo '```'
  echo; echo "===== 附件 2：重写规范（唯一规则来源）====="; echo
  cat "$SPEC"
  echo; echo "===== 附件 3：assets/games/kosma.js（风格样板）====="; echo
  echo '```javascript'; cat assets/games/kosma.js; echo '```'
  echo; echo "===== 附件 4：tools/check_explore.py 节选（验收真正量什么）====="; echo
  echo '```python'
  sed -n '2310,2336p;2339,2396p;2397,2489p;2490,2667p;2669,2775p' tools/check_explore.py
  echo '```'
  echo; echo "===== 附件 5：griseo/index.html 里那三处接线（不许动）====="; echo
  echo '```html'
  sed -n '824,827p;1629,1631p;1641,1644p' griseo/index.html
  echo '```'
} > "$OUT"
wc -l "$OUT"      # 约 1960 行 / 100 KB；整段复制进网页 AI 即可
```

> 产出的就是 **`C:/tmp/griseo-impl-brief.md`** —— 打开它、`Ctrl+A`、`Ctrl+C`、
> 粘进网页 AI 就完事了。
>
> ⚠ 合订文件里有**多个**代码块（附件各自带围栏），所以
> **「只允许一个代码块」这条约束只对实现方的*输出*成立**，对输入不成立 —— 别搞混。
>
> ⚠ 附件 4 用的是**行号区间**，`tools/check_explore.py` 改了行号就会取歪。
> 重跑前先 `sed -n '2310,2336p' tools/check_explore.py | head -3` 看一眼是不是 `GAMES = {`。

### 如果网页 AI 说「输入太长」，按这个顺序砍

> ✅ **精简版已经预先产好了**：`C:/tmp/griseo-impl-brief-lite.md`（**1501 行 / 80 KB**，
> 就是砍掉附件 4 的那一版）。直接用那个就行，不用自己拼。

合订文件约 **100 KB**，中文占比不小。免费 / 小上下文的网页 AI 有可能吃不下。
**按下面的顺序砍，砍到能被接受为止：**

| 顺序 | 砍什么 | 代价 |
|---|---|---|
| **1** | **附件 4**（`check_explore.py` 节选，约 22 KB） | 最小 —— 《规范》§11 已经把它量什么写清楚了，而且 `check_explore.py` 的改动**本来就不是实现方的活** |
| **2** | **附件 3** 的 `kosma.js`（约 19 KB） | ⚠ 代价变大 —— 它会失去风格样板，得自己从头写 IIFE / 遮罩 / 保护期那套骨架 |
| **3** | ⛔ **别砍附件 2**（《规范》） | 那是唯一的规则来源，砍了这份交接单就白写了 |

> 砍 1 之后的合订文件约 **78 KB**；砍 1+2 之后约 **59 KB**，但那时
> **《规范》§2 与 §9 就是它唯一的骨架依据了** —— 值得在 Prompt 里再强调一句
> 「照《规范》§9 自己写遮罩，不要照别的页抄」。

---

## 六、第二轮：**同一道门，又栽了一次**（2026-10-04）

**结论：不能用。**

### 这次错在哪

它把「**建** DOM」理解成了「**找** DOM」：

```js
overlay   = host.querySelector('#griseoGameOverlay');
canvas    = host.querySelector('.gr-canvas');
pad       = host.querySelector('#gr-pad');
closeBtn  = host.querySelector('.gr-close');
if (!overlay || !canvas || !pad || !closeBtn) return;   // ← 一句就退出去了
```

`host` 是下方区块里那个 **`.bottom-game` 槽 —— 它是空的**。
这四个元素**本来就不存在**，它们**要由模块自己建**
（`kosma.js` 就是这么做的，而 `kosma.js` **就在附件 3 里**）。
⇒ `mount()` 第一句就 `return`，**游戏依旧不出现在页面上**。

**同一份实现还漏了 `injectStyles()`** —— 它的对照表写着「样式自注入由 HTML 负责」，
而《规范》§10.6 明说「**不给页面加一行 CSS**」，页面里也确实没有。
⇒ 就算挂上了，也是没有样式的一堆 `<div>`。

顺带（不是致命，但都是《规范》点过名的）：笔由**鼠标点击**切换落笔（§4.3 明令鼠标不参与玩法）、
没有 48×32 的三档扩张、没有难度分档、没有 3 分钟与结算、`fillEnclosed` 不是 §6 那套
（没有自由端判定、没有 `buildLid`、而且玩家的初始领地贴在画布边上 ⇒ 泛洪必碰边界 ⇒ **永远围不住**）。

### 值得记下来的一件事

它**这次确实读到了《规范》** —— `_test` 那 13 个方法名一字不差、选择器也对、400ms 也在。
**缺的不是信息。**

缺的是：**它没法验收自己。** 不能跑、不能开页面、不能跑那 20 秒的 §11.0。

⇒ **一件它没法验证的活，交给一个看不见现场的 AI，产出必然是「读起来对」的东西。**
这正是《规范》§12.2 那条 —— **「写出来了」≠「生效了」**。

### 所以改法有两条（⭐ 推荐第一条）

| | 做法 | 为什么 |
|---|---|---|
| **1** ⭐ | **由有仓库上下文、能跑验收的一方来写这个文件** | §11.0、通用四条、7 条专属断言都能当场跑。「能不能挂上」这件事**只有能跑的一方能证** |
| 2 | 还想用网页端 AI 的话：**先把「壳体」写好给它**（约 150 行：契约 + `injectStyles` + `buildOverlay` + `mount` + `_test` 空壳 + 主循环骨架），**只让它填游戏逻辑**（`fillEnclosed` / 造物 AI / 难度 / 阶段 / 结算） | 把它**最容易错、又最难自检**的那部分（DOM 与契约）由能跑的一方固定住；留给它的部分是可以「读一遍就验」的纯逻辑 |

> ⚠ 无论走哪条，**§11.0 那一关都要先跑**。
> 两轮加起来近千行，**两次都能在第 20 秒被那 5 行命令否掉**。
