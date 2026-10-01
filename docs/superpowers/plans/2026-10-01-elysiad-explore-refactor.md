# 探索系统 + 下方区块 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给站点加一层「探索系统」（页面各处藏可交互物 + 收集清单 + 陪伴层）和一个「下方区块」（每位英桀的小游戏 + 生日倒计时），并让 `/mobius/` 迁移到共享层后作为第一个样板上线。

**Architecture:** 共享层从「管样式」升级成「管体验」。`site.css` / `site.js` 不动；新增 `explore.css` + `explore.js`（探索系统与陪伴层）+ `bottom.js`（下方区块外壳：游戏槽 / 倒计时槽 / 探索度）+ `games/<角色>.js`（每位一个独立游戏）。每页只声明一份 `THEME`，游戏代码永远不进共享文件。

**Tech Stack:** 原生 HTML/CSS/JS（无构建、无框架、无依赖）。验证工具是 Python + CDP（`tools/check_*.py` 与 `tools/cdp.py` 同源，走无头 Edge）。本站无 JS 单测框架——**断言一律写进 Python 检查工具**，这是本项目既有的 TDD 落点。

**Spec:** `docs/superpowers/specs/2026-10-01-elysiad-explore-refactor-design.md`

**执行方式（需求方 2026-10-01 定）**：**混合**。

| 任务段 | 方式 | 理由 |
|---|---|---|
| **1–8**（共享层 + 测试工具 + 探针页） | **Native** —— 自己一路做完 | 相互依赖紧，做完一跑就知道对不对 |
| **9–12**（mobius 迁移 + 接入 + 游戏） | **上审查** —— 每个任务由一个 subagent 实现、另一个 subagent 复核后才进下一个 | 这段风险最高：**删错一条 CSS 就是静默变样**（HANDOVER §6.2 `--gold-soft` 那次的教训），而快照对这种「值不同但名字相同」的规则**测不出来** |
| **13–16**（接线 / 验收 / 部署 / 文档） | **Native** —— 自己做完，最后整支过一次审查 | 全是登记与验证动作 |

---

## Global Constraints

以下每条对本计划的**每一个任务**都成立：

- **台词一条不编。** 12 个可发现物的 `line` 全部逐字取自 `D:\claude-code\materials\梅比乌斯\text_materials.md`，`src` 必须同时渲染进气泡。材料包里查不到的，不许写。
- **不做抽卡式不可预测。** 表层陪伴层必须是**可预期**的：冷却结束后的**第 3 次**点击说一句，台词**按顺序**推进，不随机。惊喜只来自「找到了藏起来的东西」。
- **`THEME` 只装「这一页是谁」的东西。** 逐页相同的值一律留共享层当默认值（`docs/theme-schema.md` §一）。
- **CSS 加载顺序不可调换**：`site.css` → `explore.css` → 页面内联 `<style>`。现有 9 页靠页面内联覆盖共享层。
- **Windows 上跑 Python 必须带 `PYTHONIOENCODING=utf-8`**，否则中文输出 GBK 崩。
- **临时脚本写成临时文件再执行，不要写进仓库**（Bash 工具会吞内联字符串里的反斜杠）。
- **减动断言必须双向**：偏好打开时降级生效 + 偏好关闭时动画照旧。只测一侧等于没测。
- **`/mobius/` 之外的 9 页必须零差异**。本轮新增的全是独立文件，只被 mobius 加载。
- **起服务器后先验内容再采样**；端口 8500 常残留，`check_*` 工具走 8501。
- **每个任务结束都要 commit**，消息用中文，风格照本仓库（一句话标题 + `═══` 分节正文）。

---

## Review Focus

以下是 spec 隐含、但**没有任何一个任务的测试天然覆盖**的失败模式。每一条都已在下方对应任务里加了断言：

1. **可发现物落在锚点外面或被 `overflow` 裁掉** → 它就一直存在、永远点不到，而且不报错。最像它的坑是本项目已经踩过的「选择器不存在」（HANDOVER §6.5）。→ 任务 1 断言每个节点**在视口内且 `getBoundingClientRect()` 有非零面积**。
2. **`localStorage` 抛异常**（隐私模式 / Safari ITP）→ 一次未捕获的异常会让**整页 JS 停摆**。→ 任务 3 断言写入失败时页面仍可用、进度降级到内存。
3. **12 个 find 里有一个 `id` 写错或漏注册** → 探索度**永远差一个**，解锁永远不触发。差一个的 bug 最难看见。→ 任务 4 断言「声明的 id 集合 == 已发现的 id 集合」才算齐，任务 11 断言 mobius 的 12 个 id 与 spec §6.1 表格逐字一致。
4. **触摸设备上 `slide` / `hold` 与页面滚动打架** → 用户往下滑页面时误触发可发现物。→ 任务 2 断言：纵向滚动位移超过阈值时**不**判定为 `slide`。
5. **减动下把小游戏也一起停了** → 游戏直接玩不了（它是显式点「开始」才跑的，不属于「自动播放的装饰动效」）。→ 任务 7 双向断言：面板装饰动画为 `none`，而 `#gameOverlay` 打开后蛇仍然动。

---

### Task 1: 探索系统骨架 —— 可发现物的生成与定位

**Files:**
- Create: `tools/check_explore.py`
- Create: `tools/explore-fixture.html`
- Create: `assets/explore.css`
- Create: `assets/explore.js`

**Interfaces:**
- Consumes: 无（第一个任务）
- Produces:
  - `window.ElysiaExplore.init(cfg)` — `cfg` 为 `THEME.explore`，返回 `undefined`
  - 生成的 DOM：每个 find 一个 `<div class="explore-find" data-find-id="<id>" role="button" tabindex="0">`
  - `window.__ELY_EXPLORE__` — 调试快照，`{ declared: string[], found: string[] }`（**只用于测试**，生产无副作用）
  - `tools/check_explore.py [页面路径]` — 默认 `tools/explore-fixture.html`；退出码 0/1

- [ ] **Step 1: 写 `tools/explore-fixture.html`**

一个只服务测试的探针页，**放在 `tools/` 里**（部署白名单已经把 `tools` 排除，不会上线）。
仿 `tools/og-card.html` 的定位。它要有：两个足够高的锚点区段（`#sec-a` / `#sec-b`）、
加载 `/assets/site.css` → `/assets/explore.css` → 内联 `<style>`，然后加载 `/assets/explore.js`，
最后声明 `THEME.explore`，**5 个 find 覆盖 5 种动词各一个**，`line` 用占位中文（fixture 不校验出处）。

- [ ] **Step 2: 写 `tools/check_explore.py` 的第一组断言，跑它，确认失败**

仿 `tools/check_aria_labels.py` 的结构：自带 8501 服务器、CDP 连无头 Edge、逐条断言、退出码 0/1。
本步只写三条：

```python
# ① 声明了几个就生成几个（fixture 是 5）
assert len(ids_rendered) == len(window.__ELY_EXPLORE__.declared)
# ② 每个都有 role="button" 与 tabindex="0"
assert all(el.getAttribute('role') == 'button' and el.tabIndex == 0)
# ③ 每个都在视口内且面积非零（Review Focus #1）
assert all(r.width > 0 and r.height > 0 for r in rects)
```

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: FAIL —— `assets/explore.js` 还不存在，`window.ElysiaExplore` 是 `undefined`。

- [ ] **Step 3: 写 `assets/explore.css` 与 `assets/explore.js` 的 `init`**

`explore.css` 本步只要：`.explore-find` 的定位（`position:absolute`）、
触控热区 **≥ 44×44px**（用 `::after` 撑开，不改变视觉大小）、`explore.css` 用 CSS 变量取色。

`explore.js` 本步只要：`init(cfg)` 读 `cfg.finds`，对每个 find 用
`document.querySelector(f.at)` 找锚点（**找不到就 `console.warn` 并跳过，不抛**），
按 `x`/`y` 百分比 `absolute` 定位，注入节点，并维护 `window.__ELY_EXPLORE__`。
文件结构照 `assets/site.js`：IIFE + `global.ElysiaExplore = {...}`。

- [ ] **Step 4: 跑，确认通过**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: PASS —— 3/3。

- [ ] **Step 5: Commit**

```bash
git add tools/check_explore.py tools/explore-fixture.html assets/explore.css assets/explore.js
git commit -m "探索系统：可发现物的生成与定位（+ 测试工具与探针页）"
```

---

### Task 2: 五种互动动词

**Files:**
- Modify: `assets/explore.js`
- Modify: `tools/check_explore.py`

**Interfaces:**
- Consumes: Task 1 的 `ElysiaExplore.init` 与 `.explore-find` 节点
- Produces: 动词判定内部函数 `matchVerb(el, verb)`；触发后该节点加 `class="explore-find found"`，
  且 `window.__ELY_EXPLORE__.found` 数组里出现该 `data-find-id`

- [ ] **Step 1: 在 `check_explore.py` 加 5 条断言（走真实用户路径）**

逐动词派发**真实输入事件**（不是直接调函数）：

| 动词 | 派发方式 |
|---|---|
| `click` | `Input.dispatchMouseEvent` press + release |
| `hold` | press → `sleep 700` → release |
| `triple_tap` | 1.2 秒内 press/release 三次 |
| `drag` | press → 移动 40px → release |
| `slide` | press → 沿水平方向快速移动 → release |

每条断言：触发前 `found` 不含该 id，触发后包含。

**外加 Review Focus #4 的反向断言**：纵向（`dy > 60, dx < 10`）滑动后，
**不得**有任何 find 被判定为已发现。

- [ ] **Step 2: 跑，确认这 6 条失败**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: FAIL —— 只有「已发现」那侧失败，前 3 条仍通过。

- [ ] **Step 3: 在 `explore.js` 实现 `matchVerb`**

按 `verb` 分派；`hold` 用 600ms 定时器 + `pointerdown/pointerup`；
`slide` 判定「按下后水平位移 ≥ 24px **且** |dx| > |dy|」（这条就是 Review Focus #4 的落点）；
`triple_tap` 用 1200ms 滑动窗口计数。
用 `pointerdown/pointerup/pointercancel` 而不是分别写 mouse/touch——一个事件族覆盖两端。

- [ ] **Step 4: 跑，确认通过**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: PASS —— 9/9。

- [ ] **Step 5: Commit**

```bash
git add assets/explore.js tools/check_explore.py
git commit -m "探索系统：五种互动动词（click/hold/drag/triple_tap/slide）"
```

---

### Task 3: 探索度与存储

**Files:**
- Modify: `assets/explore.js`
- Modify: `tools/check_explore.py`

**Interfaces:**
- Consumes: Task 2 的 `found` 数组
- Produces:
  - `ElysiaExplore.mark(key, val)` / `ElysiaExplore.load()` / `ElysiaExplore.save()`
  - `localStorage` 键：`elysia:explore:<页 id>`，值为 `{"found":[…],"unlocked":bool}`
  - 页 id 由 `cfg.pageId` 给出（**必填**）

- [ ] **Step 1: 加 4 条断言**

```
① 触发一个 find 后，localStorage 里的 found 数组含该 id
② 重载页面，已发现的仍在（进度持久）
③ 探索度文案 == '已发现 1 / 5'（数字随 found 走）
④ **Review Focus #2**：把 localStorage.setItem 打桩成 throw 之后重载，
   页面里依然能触发 find、探索度照常更新（降级到内存，不抛到顶层）
```

- [ ] **Step 2: 跑，确认失败**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: FAIL —— `① ② ④` 失败，`③` 需要先有渲染元素。

- [ ] **Step 3: 实现存储与探索度渲染**

全部读写包 `try/catch`；失败时改用模块内的内存对象，**不提示、不改变行为**。
探索度元素：`<p class="explore-count" role="status" aria-live="polite">已发现 1 / 5</p>`。
本步先把「探索度」渲染在 fixture 页的固定位置；**它挂进下方区块是 Task 8 的事**。

- [ ] **Step 4: 跑，确认通过**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: PASS —— 13/13。

- [ ] **Step 5: Commit**

```bash
git add assets/explore.js tools/check_explore.py
git commit -m "探索系统：探索度与进度存储（localStorage，失败降级内存）"
```

---

### Task 4: 找齐解锁

**Files:**
- Modify: `assets/explore.js`
- Modify: `tools/check_explore.py`

**Interfaces:**
- Consumes: Task 3 的 `found` / `save()`
- Produces: `<section class="explore-unlock" role="status" aria-live="polite" hidden>` → 解锁时移除 `hidden`；
  `window.__ELY_EXPLORE__.unlocked` 布尔

- [ ] **Step 1: 加 3 条断言**

```
① 未找齐时 .explore-unlock 带 hidden
② **逐个**触发全部 find，触发最后一个的**同一个动作之后**，unlock 立即出现
③ Review Focus #3：解锁判据是「声明的 id 集合 ⊆ found」，不是「found.length == 声明数」
   —— 测试用「同一个 id 触发两次」构造重复，确认它不是靠计数判齐
```

- [ ] **Step 2: 跑，确认失败**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: FAIL —— `①②` 失败。

- [ ] **Step 3: 实现解锁**

判定写成 `declared.every(id => found.includes(id))`。解锁后写 `unlocked: true` 进存储，
重载不再重复触发出现动画（**它只出现这一次**）。

- [ ] **Step 4: 跑，确认通过**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: PASS —— 16/16。

- [ ] **Step 5: Commit**

```bash
git add assets/explore.js tools/check_explore.py
git commit -m "探索系统：找齐 12 个解锁隐藏寄语（按 id 集合判齐，不靠计数）"
```

---

### Task 5: 渐进提示

**Files:**
- Modify: `assets/explore.js`
- Modify: `assets/explore.css`
- Modify: `tools/check_explore.py`

**Interfaces:**
- Consumes: `cfg.hintAfterRatio`（默认 `0.5`）
- Produces: 未发现节点上追加 `class="explore-find hinted"`

- [ ] **Step 1: 加 2 条断言**

```
① 已发现比例 < hintAfterRatio 时，没有任何 .hinted
② 跨过比例后，未发现的全部带 .hinted（已发现的**不带**）
```

- [ ] **Step 2: 跑，确认失败**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: FAIL —— 两条都失败。

- [ ] **Step 3: 实现提示**

`.explore-find.hinted` 加一个**轻微闪烁**的 `@keyframes`。
⚠ **不改变位置**——移动会变成误触。

- [ ] **Step 4: 跑，确认通过**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: PASS —— 18/18。

- [ ] **Step 5: Commit**

```bash
git add assets/explore.js assets/explore.css tools/check_explore.py
git commit -m "探索系统：找过半后给未发现物渐进提示（只闪不动，避免误触）"
```

---

### Task 6: 陪伴层（whisper）

**Files:**
- Modify: `assets/explore.js`
- Modify: `assets/explore.css`
- Modify: `tools/check_explore.py`

**Interfaces:**
- Consumes: `cfg.whisper`（字符串数组）、`cfg.whisperCooldownMs`（默认 `8000`）
- Produces: `<div class="explore-whisper" role="status" aria-live="polite">`；调试计数 `window.__ELY_EXPLORE__.whisperShown`

- [ ] **Step 1: 加 4 条断言**

```
① 冷却期内连点 10 次，一次低语都没有
② 冷却结束后：第 1、2 次点击仍无低语，**第 3 次**才出现（次数固定，不随机）
③ 台词按数组顺序推进，不是随机抽（连说 3 句应与数组前三项逐字相同）
④ 低语节点 2.5 秒后自己消失
```

- [ ] **Step 2: 跑，确认失败**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: FAIL —— 四条都失败。

- [ ] **Step 3: 实现陪伴层**

状态机：`{ lastAt, clicksSinceCooldown, lineIdx }`。
点击非交互元素时：若 `now - lastAt < whisperCooldownMs` → 只记 `lastAt` 不计数；
否则 `clicksSinceCooldown++`；等于 3 时出下一句、归零、重置 `lastAt`。
⚠ **这条「第 3 次」是全局约束的落点**——需求方明确不要不可预测。注释里写明理由。

- [ ] **Step 4: 跑，确认通过**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: PASS —— 22/22。

- [ ] **Step 5: Commit**

```bash
git add assets/explore.js assets/explore.css tools/check_explore.py
git commit -m "探索系统：陪伴层低语（冷却后第 3 次点击，台词顺序推进，不做抽卡）"
```

---

### Task 7: 减动降级

**Files:**
- Modify: `assets/explore.css`
- Modify: `tools/check_explore.py`

**Interfaces:**
- Consumes: 前六个任务的产物
- Produces: `tools/check_explore.py` 新增 `--reduced` 模式，用 `Emulation.setEmulatedMedia` 双向断言

- [ ] **Step 1: 加双向断言**

`--reduced` 打开时：

```
① 可发现物的漂浮/呼吸动画停（computed animation-name === 'none'）
② .hinted 不闪（animation-name === 'none'），但**仍有可见的静态标记**（outline 非 none）
③ 低语只出文字，不带粒子节点
```

`--reduced` 关闭时（**反向，证明减动段没泄漏**）：

```
④ 同一批选择器的 animation-name 不为 'none'
```

- [ ] **Step 2: 跑，确认失败**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py --reduced`
Expected: FAIL —— 四条都失败（`explore.css` 里还没有 `@media` 段）。

- [ ] **Step 3: 在 `explore.css` 写 `@media (prefers-reduced-motion: reduce)`**

⚠ 只关**装饰性自动播放**的动效。**不要**碰任何由用户点击显式触发的东西。

- [ ] **Step 4: 跑，确认通过**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py --reduced`
Expected: PASS —— 26/26（两个模式合计）。

- [ ] **Step 5: Commit**

```bash
git add assets/explore.css tools/check_explore.py
git commit -m "探索系统：减动降级（装饰动画停、提示改静态标记，双向断言）"
```

---

### Task 8: 下方区块外壳 `bottom.js` + `data/bdays.js` + 生日倒计时

**Files:**
- Create: `assets/bottom.js`
- Create: `data/bdays.js`
- Modify: `assets/explore.css`（下方区块的样式也住这里，保持「一个共享探索样式表」）
- Modify: `tools/explore-fixture.html`
- Modify: `tools/check_explore.py`

**Interfaces:**
- Consumes: Task 3 的探索度节点
- Produces:
  - `window.ElysiaBottom.mount({ game })` — `game` 可选
  - `window.ELYSIA_BDAYS` —— `{ '<页路径>': [月(0起), 日] }`
  - DOM：`<section id="bottom">` 内含 `.bottom-count`（探索度）/ `.bottom-bday`（倒计时）/ `.bottom-game`（游戏槽）
  - 倒计时槽在 `ELYSIA_BDAYS[路径]` 缺失时**整个不渲染**

- [ ] **Step 1: 写 `data/bdays.js`**

照 spec §4.4 的表写全（`index.html` / `sakura/index.html` / `mobius/index.html` / `hua/index.html` / `griseo/index.html`）。
纯数据，无 DOM、无格式化。注释写明「月份从 0 起，与页面里 `var BM = 3, BD = 30` 一致」。

- [ ] **Step 2: 加 5 条断言**

```
① fixture 页路径不在表里 → 完全没有 .bottom-bday（不是隐藏，是不渲染）
② 临时把 fixture 的路径塞进 ELYSIA_BDAYS → .bottom-bday 出现
③ 倒计时数字与「现在到下一个该日的天数」一致（用固定时钟算，别用真实时钟）
④ ELYSIA_BDAYS 的每一项：月份 0..11、日 1..31
⑤ 探索度**在下方区块里也有一份**（Task 3 那个是临时的，本步搬过来）
```

- [ ] **Step 3: 跑，确认失败**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: FAIL —— ①③④⑤ 失败。

- [ ] **Step 4: 实现 `bottom.js`**

槽位按 spec §4.3：游戏槽（有 `game` 才渲染）/ 倒计时槽（查表有才渲染）/ 探索度（恒有）。
倒计时算法照 `/mobius/` 现有的 `nextBday()` 语义（生日当天显示「今天是她的生日！」）。
⚠ **不要**照抄 index.html 的 `#bdayEgg` 定位（那是右下角悬浮）——需求方要求「页面**下方**」。

- [ ] **Step 5: 跑，确认通过**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py`
Expected: PASS —— 31/31。

- [ ] **Step 6: Commit**

```bash
git add assets/bottom.js data/bdays.js assets/explore.css tools/explore-fixture.html tools/check_explore.py
git commit -m "下方区块：外壳 + 生日倒计时（数据源 data/bdays.js 全站唯一）"
```

---

### Task 9: `/mobius/` 迁移到共享层 —— CSS

**Files:**
- Modify: `mobius/index.html`
- Reference: `assets/site.css`、`docs/superpowers/plans/2026-09-15-extraction-inventory.md`

**Interfaces:**
- Consumes: `assets/site.css`（现有）
- Produces: `mobius/index.html` 的 `<head>` 里出现 `<link rel="stylesheet" href="/assets/site.css">`，
  位置在 `<style>` **之前**

- [ ] **Step 1: 建基线快照（迁移前）**

```bash
python -m http.server 8500 &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8500/mobius/    # 必须 200
PYTHONIOENCODING=utf-8 python tools/snapshot.py pre-migrate
ls screenshots/snap/pre-migrate/*.json | wc -l    # ⚠ 必须等于 len(PAGES) × 3 = 30
```

> ⚠ 本步 `snapshot.PAGES` **还没加 mobius**（那是 Task 13 的事），所以这一步拍不到 mobius。
> **本任务改用截图核对**：迁移前后各拍桌面 `1280×900` + 移动 `375×812` 的全页图，
> 用 `PIL.ImageChops` 做像素差分（HANDOVER §6.4：颜色/样式类改动必须像素差分，不接受「看着差不多」）。

- [ ] **Step 2: 逐个删掉与 `site.css` 同名的 31 条规则**

先在 `mobius/index.html` 的 `<style>` 里加上 `<link rel="stylesheet" href="/assets/site.css">`（在 `<style>` 之前）。

⚠ **不能只按名字删**：HANDOVER §6.5 记着「CSS 变量缺失是静默的」，
同选择器**值不同**的必须留下（那正是页面专属的部分）。逐条核对：
名字相同 **且** 声明体也相同 → 删；否则留。

- [ ] **Step 3: 截图差分，逐条核对差异**

```bash
PYTHONIOENCODING=utf-8 python tools/cdp.py "http://localhost:8500/mobius/" size 1280x900 sleep 4000 shot screenshots/mobius-post-css.png
```

用 `PIL.ImageChops` 比对 `mobius-desktop.png`（迁移前）。
Expected: **零差异**。任何一处差异都要能解释到具体删掉的那条规则上；解释不了就回滚那条。

- [ ] **Step 4: 关掉服务器再走**

```bash
netstat -ano | grep ":8500 " | grep LISTENING      # 查 PID
taskkill //F //PID <pid>
```

- [ ] **Step 5: Commit**

```bash
git add mobius/index.html
git commit -m "mobius：迁移到共享层 —— 删掉 31 条与 site.css 同名的规则"
```

---

### Task 10: `/mobius/` 迁移到共享层 —— JS

**Files:**
- Modify: `mobius/index.html`

**Interfaces:**
- Consumes: `assets/site.js` 的 `ElysiaShared.{makeResize, spawnEndingStars, buildQuoteCards, observeReveal, makeTypewriter}`
- Produces: `mobius/index.html` 里出现 `var THEME = {...}`，且 5 个 `ElysiaShared.*` 调用

- [ ] **Step 1: 加断言（先写下来，后面用）**

```bash
grep -c 'ElysiaShared\.' mobius/index.html     # 期望 ≥ 5（现在是 0）
grep -c 'var THEME' mobius/index.html          # 期望 1（现在是 0）
```

- [ ] **Step 2: 按 `docs/theme-schema.md` 逐项接线**

⚠ **五个打字机数值必须传原值**（`delay` / `jitter` / `startDelay` / `tailDelay` / `hintDelay`），
照 mobius 现状抄，别用别的页的值。`endingStars` 的区间写法是 `[lo, span]`。
`THEME` 现在只装 `endingStars` / `quotes` / `typewriter` 三项；`explore` / `game` 是 Task 11 的事。

- [ ] **Step 3: 删掉被替换掉的内联实现**

每删一处都确认没有别的地方调用它（这些页是同模板各自复制出来的，私有函数每页一套、名字不同）。

- [ ] **Step 4: 验证**

```bash
grep -c 'ElysiaShared\.' mobius/index.html     # ≥ 5
```

再用 `tools/cdp.py` 走用户路径：打字机打完、语录卡能切、结尾星屑生成、滚动进场触发。

- [ ] **Step 5: Commit**

```bash
git add mobius/index.html
git commit -m "mobius：迁移到共享层 —— 五个共享函数改用 ElysiaShared + 补 THEME"
```

---

### Task 11: `/mobius/` 接入新模块（12 个可发现物 + 彩蛋取舍 + 接线）

**Files:**
- Modify: `mobius/index.html`
- Modify: `tools/explore-fixture.html`（探针页照抄接线方式，给后续页做参照）

**Interfaces:**
- Consumes: Task 1–8 的全部产物
- Produces: mobius 页面里 `THEME.explore`（12 个 find）与 `THEME.game`；`ElysiaExplore.init` / `ElysiaBottom.mount` 两行调用

- [ ] **Step 1: 加断言**

```
① 12 个 find 的 data-find-id 与 spec §6.1 表格**逐字一致**（Review Focus #3）
② 每个 find 的 src 都非空，且渲染出的气泡里确实含该 src 文本
③ 页面里出现的每个「」引号内的台词，都能在 text_materials.md 里逐字找到（防编造）
④ .bottom-bday 存在（mobius 在 bdays.js 里）
⑤ .bottom-game 存在
⑥ **改机制后的 B**：拖拽 `.profile-name` → 说出台词（走真实鼠标路径：press → 移动 → release）
⑦ **改机制后的 D**：先在结尾停住，再**向上滚** → 浮出临别句
```

> ⚠ ⑥⑦ 必须**走用户路径触发**，不能直接调函数 ——
> 这些页的脚本是 IIFE 包裹的，内部函数**不是全局的**（HANDOVER §10.6 Task 9 踩过：
> `typeof fireKevinKiller666 === 'function'` 得到 `undefined`）。

- [ ] **Step 2: 跑，确认失败**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py mobius/index.html`
Expected: FAIL —— 全部失败（还没接线）。这是本计划的红→绿起点。

- [ ] **Step 3: 写 `THEME.explore`**

12 条照 spec §6.1 表格逐条抄，**一条都不许自己编**。
`at` 用实测过的锚点：`#opening` / `#about` / `#creations` / `#journey` / `#quotes` / `#daily-sec` / `#ending`
（⚠ **是 `#daily-sec` 不是 `#daily`**——`daily` 那个名字被 `data-snark` 占了）。
`whisper` 用材料包里剩下的有出处台词；`whisperCooldownMs` 梅比乌斯设**稀疏**一些。

- [ ] **Step 4: 按 spec §八 处置 6 个彩蛋**

✅ **需求方已于 2026-10-01 拍板**：B / D **不删，改机制**。

| 彩蛋 | 动作 |
|---|---|
| A 蛇瞳凝视 | 原样保留 |
| C 标题吐槽 | 原样保留 |
| E 小白鼠出没 | 原样保留 |
| **B 点名字** | **改机制** → spec §8.1「**拖走她的名字**」：drag 名字，松手后它自己游回原位；台词「你要是有什么想评判的…」（关于黄金庭园·其一） |
| **D 结尾循环** | **改机制** → spec §8.2「**在结尾往回滚**」：从结尾向上滚回上一节时触发；台词「人类称呼自己能够理解的答案为「真相」…」（关于千劫·其二） |
| F 贪吃蛇 | 留到 Task 12 搬进游戏槽 |

⚠ 两条新台词**是从 spec §6.5 的余量里取的**，取完要在 §6.5 表里标掉（已标）。
⚠ 删掉旧 B / D 的实现之前，先 `grep` 确认没有别的地方调用那些函数
（这些页是同模板各自复制出来的，私有函数每页一套、名字不同）。

- [ ] **Step 5: 加两行调用**

```js
ElysiaExplore.init(THEME.explore);
ElysiaBottom.mount({ game: THEME.game });
```

- [ ] **Step 6: 跑，确认通过**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py mobius/index.html`
Expected: PASS —— 7/7。

- [ ] **Step 7: Commit**

```bash
git add mobius/index.html tools/explore-fixture.html
git commit -m "mobius：接入探索系统 —— 12 个可发现物 + 下方区块（台词全部有出处）"
```

---

### Task 12: `assets/games/mobius.js` —— 贪吃蛇搬进游戏槽

**Files:**
- Create: `assets/games/mobius.js`
- Modify: `mobius/index.html`
- Modify: `tools/check_explore.py`

**Interfaces:**
- Consumes: `ElysiaBottom.mount` 的 `.bottom-game` 槽
- Produces: `window.ElysiaGames.mobius = { title, hint, mount(host) }`

- [ ] **Step 1: 加 2 条断言**

```
① 点 .bottom-game 里的「开始」按钮后，#gameOverlay 打开，蛇的坐标在变（真的在跑）
② **Review Focus #5**：--reduced 模式下重复 ① —— 蛇**仍然在动**（游戏不受减动影响）
```

- [ ] **Step 2: 跑，确认失败**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py mobius/index.html`
Expected: FAIL —— 游戏槽还是空的。

- [ ] **Step 3: 把贪吃蛇从内联搬进 `assets/games/mobius.js`**

**不重写玩法**：键盘 ↑↓←→/WASD、触摸滑动、十字键 `#dpad` 三套操作原样搬。
只改三处（spec §6.3）：① 外壳换成游戏卡 + 保留原 overlay；② 文案主题化
（「实验素材」/「实验失败」/「进化度」）；③ 与探索度解耦。
⚠ **结算面板的文字是站点 UI 文案，不是她说的台词**——要放台词只能从 spec §6.5 的余量里取。

- [ ] **Step 4: 跑，确认通过**

Run: `PYTHONIOENCODING=utf-8 python tools/check_explore.py mobius/index.html`
Expected: PASS —— 7/7。

- [ ] **Step 5: Commit**

```bash
git add assets/games/mobius.js mobius/index.html tools/check_explore.py
git commit -m "mobius：贪吃蛇搬进下方区块的游戏槽（玩法不变，文案主题化）"
```

---

### Task 13: 接线六点 + `<head>` 补齐 + 首页过期注释

**Files:**
- Modify: `.github/workflows/static.yml:47`
- Modify: `sitemap.xml`
- Modify: `data/timeline-data.js:270`
- Modify: `mobius/index.html`（`<head>`）
- Modify: `tools/check_explore.py`（`EXPECTED` 式的页面清单）
- Modify: `tools/snapshot.py:60-66`
- Modify: `tools/check_reduced_motion.py:35`
- Modify: `index.html:1237`

**Interfaces:**
- Consumes: 前 12 个任务的产物
- Produces: mobius 进入部署白名单与三张工具清单

- [ ] **Step 1: 六点全改**

| # | 文件 | 动作 |
|---|---|---|
| 1 | `static.yml` | `KEEP_DIRS` 加 `mobius` |
| 2 | `sitemap.xml` | 加 `<loc>https://elysiad.top/mobius/</loc>` |
| 3 | `data/timeline-data.js` | 第 270 行那位补 `url: '/mobius/'` |
| 4 | `mobius/index.html` | `<head>` 补 `canonical` + JSON-LD + `favicon` + `description` + `og:` 四件套 |
| 5 | 三张工具清单 | `snapshot.PAGES` / `check_reduced_motion.PAGES` / `check_explore.py` 的页面清单 各加 `mobius/index.html` |
| 6 | `index.html:1237` | 那行「还没建页面的这几位」注释里划掉梅比乌斯 |

- [ ] **Step 2: 验证六点都生效**

```bash
grep -c mobius .github/workflows/static.yml sitemap.xml data/timeline-data.js
grep -c "rel=\"canonical\"" mobius/index.html
grep -n "mobius" tools/snapshot.py tools/check_reduced_motion.py
grep -n "梅比乌斯" index.html    # 应只剩「建设中」逻辑引用的那处，注释里不再有
```

- [ ] **Step 3: 跑 aria 断言**

⚠ 先在 `tools/check_aria_labels.py` 的 `EXPECTED` 加
`'mobius/index.html': ('无限之言，点击切换', 'inline')` —— 它是**共享层文案**吗？
mobius 的语录卡走的是自己那套（Task 10 才接 `ElysiaShared.buildQuoteCards`，接完就是 `'shared'`）。
按 Task 10 的实际结果填 `'shared'` 或 `'inline'`。

Run: `PYTHONIOENCODING=utf-8 python tools/check_aria_labels.py`
Expected: PASS —— **10/10**。

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/static.yml sitemap.xml data/timeline-data.js mobius/index.html index.html tools/
git commit -m "mobius：接线六点 + <head> 补齐 + 首页过期注释收尾"
```

---

### Task 14: 新基线 + 三项验收

**Files:**
- 无源码改动（只产快照与报告）

**Interfaces:**
- Consumes: Task 13 的全部产物
- Produces: `screenshots/snap/post-refactor/`、`screenshots/snap/baseline-pre-refactor/`

- [ ] **Step 1: 建迁移前的基线**

```bash
cd D:\claude-code\elysia-main
python -m http.server 8500 &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8500/assets/site.css   # 必须 200
PYTHONIOENCODING=utf-8 python tools/snapshot.py baseline-pre-refactor
```

⚠ **等它真的跑完**（末尾出现「快照存入 ……」且进程退出）再继续。
`snapshot.PAGES` 里已经有 mobius 了，所以这次的基线**包含 mobius 迁移后的样子**——
它作为「后续 9 页铺开」的参照点，不是拿来看迁移差异的。

- [ ] **Step 2: 建最终快照 + 差分**

```bash
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-explore
ls screenshots/snap/after-explore/*.json | wc -l    # ⚠ 必须 = len(PAGES) × 3 = 33
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline-eggs after-explore; echo "退出码 $?"
```

**期望**：差异**全部落在 `mobius/index.html`**（新增一节 + 新增探索节点）。
**其余 9 页零差异**。任何一处落在别的页上，停下来查。

- [ ] **Step 3: 属性与减动断言**

```bash
PYTHONIOENCODING=utf-8 python tools/check_aria_labels.py        # 10/10
PYTHONIOENCODING=utf-8 python tools/check_reduced_motion.py     # 7/7
PYTHONIOENCODING=utf-8 python tools/check_explore.py mobius/index.html
```

- [ ] **Step 4: 视觉核对**

桌面 `1280×900` + 移动 `375×812` 各一轮截图，逐节看。
**不接受「看起来差不多」**。

- [ ] **Step 5: 关服务器 + Commit**

```bash
netstat -ano | grep ":8500 " | grep LISTENING
taskkill //F //PID <pid>
git add -A
git commit -m "验收：探索系统三项断言全绿（aria 10/10、减动 7/7、其余 9 页零差异）"
```

---

### Task 15: 推送、部署、线上验证

**Files:**
- 无源码改动

**Interfaces:**
- Consumes: Task 14 全绿的产物
- Produces: `elysiad.top/mobius/` 返回 200

- [ ] **Step 1: push 到 dev，交给需求方合并**

⚠ **不要替他合并到 main**（HANDOVER §3.2）。

- [ ] **Step 2: （需求方合并后）验证线上**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://elysiad.top/mobius/          # 期望 200
curl -s https://elysiad.top/sitemap.xml | grep -c mobius                       # 期望 1
curl -s https://elysiad.top/ | grep -c "建设中"                                 # 首页名片应已可达
```

- [ ] **Step 3: 线上真机跑一个可发现物**

```bash
PYTHONIOENCODING=utf-8 python tools/cdp.py "https://elysiad.top/mobius/" size 1280x900 sleep 6000 \
  eval "(()=>{document.querySelector('[data-find-id=lab-01]').click();return 1})()" \
  sleep 1200 eval "document.querySelector('.explore-count').textContent"
```

Expected: `已发现 1 / 12`。

- [ ] **Step 4: 记一笔**

线上验证的结果写进 HANDOVER 的对应小节（Task 16）。

---

### Task 16: 文档更新

**Files:**
- Modify: `docs/HANDOVER.md`
- Modify: `docs/theme-schema.md`
- Modify: `tools/README.md`
- Modify: `docs/superpowers/specs/2026-10-01-elysiad-explore-refactor-design.md`（把已决策的「待确认」收敛）

- [ ] **Step 1: `docs/theme-schema.md`**

§三 schema 补 `explore` / `game` 两个字段；§二 共享层默认值清单补
`whisperCooldownMs`(8000) / `hintAfterRatio`(0.5) / 可发现物的 `aria-label`。
⚠ 照 §一 的原则逐条问：「这个值和别人一样吗？」一样就留共享层。

- [ ] **Step 2: `tools/README.md`**

补 `check_explore.py`（用法、它守什么、为什么快照守不住它）。

- [ ] **Step 3: `docs/HANDOVER.md`**

| 节 | 改什么 |
|---|---|
| §2.1 页面表 | Ⅹ 梅比乌斯 从 ⬜ **待建** → ✅；**待建从 4 位降到 3 位** |
| §2.2 功能一览 | 加「探索系统 / 下方区块 / 每页小游戏 / 生日倒计时」 |
| §2.3 | 加一轮「2026-10-01」的记录 |
| §2.4 下一步 | 改成「其余 9 页铺开新模块 + 其余 12 位的小游戏 + 明信片」 |
| §4.1 配方 | 加「新页要接 `ElysiaExplore.init` / `ElysiaBottom.mount`」与 §7 的迁移步骤 |
| §6.4 判据 | `10 × 3 = 30` → **`11 × 3 = 33`**；总文件数 66 |
| §6.4 工具表 | 加 `tools/check_explore.py` |
| §5.1 | 配音疑点表补 mobius（`蔡书瑾 / 林簌（汉语）· 大久保瑠美（日语）`，与 kalpas 同款格式） |
| §七 速查 | 加探索系统的验收命令 |
| §十 附录 | 加「10.8 公共层重构：探索系统 + 下方区块（2026-10-01）」 |

- [ ] **Step 4: Commit**

```bash
git add docs/ tools/README.md
git commit -m "文档：交接文档 + theme-schema + tools/README 同步探索系统"
```

---

## Self-Review

**1. Spec coverage** —— 逐个 spec 小节对任务：

| Spec | 任务 |
|---|---|
| §3.1 文件划分 | 1（explore）/ 8（bottom, bdays）/ 12（games） |
| §3.2 加载顺序 | 1（fixture 里就按这个顺序搭，作业模板）/ 9 / 11 |
| §4.1 `THEME.explore` | 11 |
| §4.2 `ElysiaExplore` | 1–7 |
| §4.3 `ElysiaBottom` | 8 |
| §4.4 `data/bdays.js` | 8 |
| §4.5 games 契约 | 12 |
| §5.1 五种动词 | 2 |
| §5.2 外观关键字 | 1（骨架）/ 11（mobius 用到的那几个） |
| §5.3 陪伴层 | 6 |
| §5.4 存储 | 3 |
| §5.5 减动 | 7 |
| §5.6 无障碍 | 2（role/tabindex）+ 3（aria-live）+ 13（aria 断言） |
| §6.1 12 个可发现物 | 11 |
| §6.2 生日倒计时 | 8 |
| §6.3 贪吃蛇 | 12 |
| §6.4 `<head>` 补齐 | 13 |
| §6.5 余量台词 | 11（whisper 取材） |
| §七 迁移到共享层 | 9（CSS）+ 10（JS）+ 7.3 的验证分散在两处 |
| §八 彩蛋处置 | 11（B / D **改机制**：拖名字 / 往回滚，各带一条用户路径断言） |
| §九 上线清单 | 13 |
| §十 验收 | 14 + 15 |
| §十一 待确认 | 11 Step 4（彩蛋）+ 13/16 |
| §十二 文档 | 16 |

无遗漏。

**2. Step scan** —— 每一步都写清了「跑什么、期望什么」，没有「处理边界情况」这类空话。
没有把函数体代抄一遍：只给签名、断言与「对不上就停下」的判据。

**3. Type consistency** —— `ElysiaExplore.init` / `ElysiaBottom.mount({game})` / `ElysiaGames.<id>.mount(host)` /
`window.__ELY_EXPLORE__.{declared,found,unlocked,whisperShown}` / `window.ELYSIA_BDAYS` /
`.explore-find` / `.explore-count` / `.explore-unlock` / `.explore-whisper` / `.bottom-*`
在各任务里**同名同义**，无 `clearLayers` / `clearFullLayers` 那类漂移。

**4. Review Focus** —— 5 条都已在对应任务里有断言（#1→T1、#2→T3、#3→T4+T11、#4→T2、#5→T12）。

**5. Proportion** —— 本计划约 500 行，spec 约 500 行，接近 1:1。代码块只出现在必须固定值的断言与两行调用处。
