# 明信片重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页的「语录明信片」从只印台词的空背景卡，改成**左侧立绘（八张可选）+ 右侧她的台词与访客自己写的字（≤200 字）+ 二维码**的明信片。

**Architecture:** 仍是**纯前端 Canvas 出图**，没有后端。`assets/postcard.js` 重写版式（左「相片框」+ 右文字栏，两档尺寸）；访客的话术提示放新的 `data/postcard-prompts.js`（按台词逐字索引）；二维码是**预生成的静态 PNG**（不引库、不发外部请求）。验收靠新工具 `tools/check_postcard.py` —— 现有四个工具都测不到它（快照采计算样式、aria/减动/探索系统不看这段数据）。

**Tech Stack:** 原生 ES5 + Canvas 2D（无构建、无依赖）；检查工具用 Python + CDP（照 `tools/check_explore.py` 的骨架）。

**Spec:** `docs/superpowers/specs/2026-10-02-postcard-redesign-design.md`

## Global Constraints

- **只用 ES5**：`var` / 不用箭头函数 / 不用模板字符串 / 不用 `color-mix()` 之类新语法（大陆手机的老内核）。**不引第三方库、不发任何外部请求。**
- **绝不抛异常**：任何一步失败都只降级 + `console.warn`（一次未捕获的异常会让首页剩下的脚本集体停摆）。
- **卡上只印 `data/quotes.js` 里已有的那 10 条台词**（逐字）；弹幕话术是**访客的口吻**，与她的台词分开渲染。
- **不动** `data/quotes.js`、`#daily` 带子、现有三个按钮（`#postcardRedraw` / `#postcardToggle` / `#postcardSave`）的位置与文案。
- 字数硬上限 **200**；两档尺寸都要能写满 200 字而不溢出。
- 二维码指向 **`https://elysiad.top/`**（带结尾斜杠）。
- ⚠ **保留** `redraw()` 里 `document.fonts.ready` 那段等待（字体没就绪就落笔会以 fallback 字形画，字形完全不同）。
- Windows 上跑 Python 一律带 `PYTHONIOENCODING=utf-8`；**临时脚本不进仓库**；文件行尾 LF。

## Review Focus

这五类最容易让用的人踩到、而 spec 没有一条现成的判据：

1. **立绘还没加载完就出图 / 加载失败** —— 用户看到的应该是「一张空的相片框」，不是破图、更不是白屏报错。
2. **访客把 200 字全写满、中间还带换行** —— 文字不许压到底部边框，也不许溢出卡外。
3. **弹幕的键与台词对不上**（改了一个标点）—— 那是**静默**没有弹幕，页面看着一切正常。
4. **切了尺寸（竖↔横）之后** —— 访客写的字与当前立绘必须**还在**，不能被重置。
5. **快速连点「换一句」** —— 不许出现旧图残留或报错。

每一条都在下面**拥有那段代码的任务里**配了测试（Task 3/4/5/6 里各有一条）。

---

### Task 1: 弹幕话术数据 + 纯文本检查

**Files:**
- Create: `data/postcard-prompts.js`
- Create: `tools/check_postcard.py`
- Modify: `index.html:557-560`（在 `postcard.js` 之前加一行 `<script>`）

**Interfaces:**
- Consumes: `data/quotes.js` 的 `window.QUOTES.daily`（10 条，**逐字**）
- Produces: `window.POSTCARD_PROMPTS` —— `{ '<台词逐字含「」>': ['话术1','话术2','话术3'], … }`，恰好 10 个键
- Produces: `tools/check_postcard.py` 的骨架（纯文本检查跑完即退；CDP 部分 Task 3 才加）+ 支持 `--only <名字片段>`

- [ ] **Step 1: 写检查（纯文本那一条）**

在 `tools/check_postcard.py` 里实现 `check_prompt_keys_match_quotes()`：读 `data/quotes.js` 抽出 `daily` 的 10 条（正则取引号内的串），再读 `data/postcard-prompts.js`，断言 ① 键恰好 10 个 ② **每个键都能在 daily 里逐字找到** ③ 每条的值是长度 ≥ 3 的字符串数组 ④ 反向也成立（daily 的每一条都有弹幕）。失败要打出**对不上的是哪一条**。

- [ ] **Step 2: 跑，确认红**

Run: `PYTHONIOENCODING=utf-8 python tools/check_postcard.py`
Expected: FAIL —— `data/postcard-prompts.js` 不存在

- [ ] **Step 3: 写 `data/postcard-prompts.js`**

按 spec §5.2 那张表**逐字**写（10 条台词 × 3 句）。文件头写清：⚠ 键必须与 `quotes.js` 的 daily **逐字一致**（含 `「」` 与省略号写法），**对不上就静默没有弹幕**。EOL 提交为 LF。

- [ ] **Step 4: 在 `index.html` 里加载它**

在 `<script src="assets/postcard.js" defer></script>` **之前**加 `<script src="data/postcard-prompts.js" defer></script>`（顺序不能反 —— 两者都是 defer，按出现顺序执行）。

- [ ] **Step 5: 跑，确认绿 + 变异一次**

Run: `PYTHONIOENCODING=utf-8 python tools/check_postcard.py`
Expected: PASS
变异：把 `postcard-prompts.js` 里某个键的结尾 `。」` 改成 `。`，重跑 → **必须红**，且报出是哪一条；改回。

- [ ] **Step 6: Commit**

```bash
git add data/postcard-prompts.js tools/check_postcard.py index.html
git commit -m "明信片：弹幕话术数据（10 条台词 × 3 句）+ 键与台词对得上的纯文本检查"
```

---

### Task 2: 二维码（预生成静态图 + 实扫验证）

**Files:**
- Create: `images/qr-elysiad.png`
- Modify: `tools/check_postcard.py`（加一条 `check_qr_decodes`）

**Interfaces:**
- Produces: `images/qr-elysiad.png` —— 240×240、指向 `https://elysiad.top/`、模块 `#5a189a`、底 `#ffc8dd`、圆角
- Produces: 检查里解出 URL 的那条断言（Task 3 画它时按这个路径引用）

- [ ] **Step 1: 写检查（能解出 URL）**

`check_qr_decodes()`：读 `images/qr-elysiad.png`，用解码器解出内容，断言 `== 'https://elysiad.top/'`。⚠ 解不出来就红 —— **不许只看「像个二维码」**。

- [ ] **Step 2: 跑，确认红**（文件还不存在）

- [ ] **Step 3: 生成那张图**

用一次性脚本生成（**不进仓库**）。要点：内容 `https://elysiad.top/`、纠错等级 M、模块 `#5a189a`、底 `#ffc8dd`、**四个定位角单独画成圆角**、再叠加一层圆角遮罩（半径 ~24px）。生成后**用解码器实扫**确认内容。

> 若本机没有生成库：`pip install qrcode`（只用于这一次生成；仓库里不留依赖）。解码用 `pip install pyzbar` 或 `opencv-python`（二者其一能装即可）。

- [ ] **Step 4: 跑，确认绿**

Run: `PYTHONIOENCODING=utf-8 python tools/check_postcard.py --only qr`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add images/qr-elysiad.png tools/check_postcard.py
git commit -m "明信片：二维码静态图（指向 elysiad.top，圆角 + 她的配色）+ 实扫验证"
```

---

### Task 3: 版式重排（左立绘相片框 / 右文字栏）+ 立绘加载与降级

**Files:**
- Modify: `assets/postcard.js`（重写 `draw()` 的版式部分）
- Modify: `tools/check_postcard.py`（加 CDP 骨架 + `check_all_artworks_render` + 一条降级测试）

**Interfaces:**
- Consumes: `images/qr-elysiad.png`（Task 2）
- Produces: 模块内 `var ART = [...]` —— 8 个立绘路径（顺序：`armor-pink`、`armor-elf`、`armor-ego`、`skin-1`…`skin-5`）
- Produces: `var COL = { vert: {art:{x:0.05,y:0.07,w:0.42,h:0.82}, qr:{x:0.80,y:0.86,r:0.075}}, horz: {art:{x:0.04,y:0.10,w:0.36,h:0.80}, qr:{x:0.84,y:0.82,r:0.09}} }`（都是**比例**，乘以 `size().w/h` 用）
- Produces: `function drawArt(x, y, w, h)` —— 在给定矩形里画圆角相片框 + contain 摆放当前立绘；**图片没就绪或解码失败时只画空框**
- Produces: `function drawQR(x, y, r)` —— 画二维码；**加载失败就只画 `elysiad.top` 文字**
- Produces: `tools/check_postcard.py` 的 CDP 骨架（自带 8501 服务器 + 无头 Edge，照 `tools/check_explore.py`）

- [ ] **Step 1: 写检查（六条里的第 ⑥ 条 + 降级那半）**

`check_all_artworks_render()`：真页面上依次切到 8 张立绘（切法见 Task 6 的缩略图；本步先用 `window.__ELY_POSTCARD__.setArt(i)` 这个**只读测试句柄**驱动），每次断言：① 无 JS 报错 ② 画布**左栏区域**（`COL` 那个矩形）里有非底色像素。
再加 `check_art_failure_degrades()`（**两条降级一起验**）：
· 把某张立绘的路径改成不存在的文件 → 断言**仍无报错**、且左栏变成「空框」（框边在、内部无图）
· 把二维码的路径改成不存在的文件 → 断言**仍无报错**、右下角只剩 `elysiad.top` 那行文字

- [ ] **Step 2: 跑，确认红**（版式还是旧的居中排，且没有那个句柄）

- [ ] **Step 3: 实现版式与立绘**

- `redraw()` 里先 `loadArt()`：8 张 `new Image()`，`onload` 标记就绪、`onerror` 标记失败（**都只记状态，不抛**）；**全部有结果后再 `draw()`**，超时 1.5s 也照画（没就绪的当失败）。
- `draw()`：底色 / 星屑 / 描边 / 四角水晶花**照旧**；把台词与落款从「居中」挪到**右栏**（左对齐，宽度 `1 - COL.art.w - 0.13`）；`drawArt()` / `drawQR()` 按 `COL` 画。
- 右栏文字块**从 y=0.16·h 起**、**到 0.90·h 必须结束**（Task 4 的缩放就是为这条服务）。
- 加测试句柄 `window.__ELY_POSTCARD__ = { size: size, col: function(){return COL[vert?'vert':'horz'];}, setArt: function(i){ cur=i; redraw(); } }`。

- [ ] **Step 4: 跑，确认绿**

Run: `PYTHONIOENCODING=utf-8 python tools/check_postcard.py --only art`
Expected: PASS（8 张逐张不报错 + 左栏有内容 + 坏路径降级为空框）

- [ ] **Step 5: 视觉核对**

桌面 `1280×900` + 手机 `375×812` 各截一张「明信片」那一节，确认：立绘在左、台词在右、录音框不破图、二维码与 `elysiad.top` 在下角。（那 5 张带背景的图也各看一眼。）

- [ ] **Step 6: Commit**

```bash
git add assets/postcard.js tools/check_postcard.py
git commit -m "明信片：版式重排（左相片框 / 右文字栏）+ 八张立绘加载与失败降级"
```

---

### Task 4: 访客写的字（200 字 / 折行 / 缩放到不溢出）

**Files:**
- Modify: `index.html`（`#postcard` 区加输入框与字数）+ `assets/postcard.js`
- Modify: `tools/check_postcard.py`（加 `check_input_cap_and_no_overflow`）

**Interfaces:**
- Consumes: Task 3 的 `COL`（右栏几何）
- Produces: DOM —— `<textarea id="postcardInput" maxlength="200">` 与 `<span id="postcardCount">0 / 200</span>`
- Produces: `function fitText(text, maxW, maxH, font0)` → `{font: <字号>, lines: [...]}` —— 从 `font0` 起，每轮 ×0.94，**下限 0.7×font0**，取第一个能塞进 `maxH` 的
- Produces: `function drawUserText(x, y, w, h)` —— 用 `fitText` 的结果画访客的字（保留访客自己打的换行）

- [ ] **Step 1: 写检查**

`check_input_cap_and_no_overflow()`：
① 在 `#postcardInput` 里 `fill` 200 个中文 → 断言 `value.length === 200`、字数显示是 `200 / 200`、**无 JS 报错**、画布与「空输入」时**不同**（说明真画上去了）；
② **溢出判据**：取卡片下方那条「安全带」（`y` 从 `0.92·h` 到 `0.96·h`、`x` 从 `0.05·w` 到 `0.45·w`）的像素，与「空输入」时**逐点相同** —— 那里本来什么都不该画，文字要是压下来就会不同。两档尺寸各测一遍。
③ 再往输入框里塞 300 字（脚本绕过 `maxlength` 直接设 `value`）→ 断言画布**仍然不溢出**（安全带判据同上）。

- [ ] **Step 2: 跑，确认红**

- [ ] **Step 3: 实现输入与缩放**

- 输入框 `input` 事件 → 更新字数 → `scheduleRedraw()`（**防抖 120ms**）；空输入不画那一段。
- `fitText()` 按上面的规则逐档缩小；**下限之后仍塞不下就继续用小字号排**（宁可挤，不许裁掉访客的字）。
- ⚠ **换台词（`#postcardRedraw`）不清空输入框**（Review Focus 4 的那半：切尺寸也是）。

- [ ] **Step 4: 加两条针对 Review Focus 的测试**

`check_quote_change_keeps_input()`：输入一段字 → 点「换一句」→ 断言输入框的值**没变**、且画布重绘过（与前一张不同）。
`check_size_toggle_keeps_state()`：输入一段字 + 切一档尺寸 → 断言字**还在**、立绘索引**没变**。
`check_rapid_quote_change()`（**Review Focus 5**）：在 300ms 内连点「换一句」8 次 → 等 600ms → 断言 ① 无 JS 报错 ② 画布非空且与「一次都没点」不同（说明最后一次真的落笔了，没有被中间的红rawing 卡住）。

- [ ] **Step 5: 跑，确认绿**（`--only input` / `--only keeps`）

- [ ] **Step 6: Commit**

```bash
git add index.html assets/postcard.js tools/check_postcard.py
git commit -m "明信片：访客写字（200 字硬上限 / 折行 / 缩放到不溢出）+ 换台词与切尺寸不丢状态"
```

---

### Task 5: 弹幕圆片

**Files:**
- Modify: `index.html`（`#postcard` 区加圆片容器 + 样式）+ `assets/postcard.js`
- Modify: `tools/check_postcard.py`（加 `check_prompt_chip_fills_input`）

**Interfaces:**
- Consumes: Task 1 的 `POSTCARD_PROMPTS`、Task 4 的 `#postcardInput`
- Produces: DOM —— `<div id="postcardPrompts" role="group" aria-label="参考话术"></div>`，里面 3 个 `<button class="postcard-chip">`
- Produces: `function renderPrompts()` —— 按 `pool[current]` 取话术重建 3 个圆片；**键对不上就清空（静默没有弹幕）**；`input` 获得焦点时该容器可见、失焦且内容为空时收起

- [ ] **Step 1: 写检查**

`check_prompt_chip_fills_input()`：清空输入框 → 点第 1 个圆片 → 断言**输入框的值等于那个圆片上的字**（不是直接上了卡）；再断言画布已重绘（防抖后）。
另测两条 Review Focus：
· **键对不上**（脚本临时把 `POSTCARD_PROMPTS` 的某个键改坏）→ 断言**圆片数为 0 且无报错**
· **整个 `POSTCARD_PROMPTS` 缺失**（脚本临时 `delete window.POSTCARD_PROMPTS`）→ 断言**输入框照常能打字、画布照常重绘、无报错**

- [ ] **Step 2: 跑，确认红**

- [ ] **Step 3: 实现**

点圆片 → `input.value = 圆片文字` → 触发 `input` 的同一套更新（字数 + 防抖重绘）→ 圆片**不消失**（访客还能点别的）。

- [ ] **Step 4: 跑，确认绿**（`--only prompt`）

- [ ] **Step 5: Commit**

```bash
git add index.html assets/postcard.js tools/check_postcard.py
git commit -m "明信片：弹幕圆片（贴着当前台词的 3 句预设，点了填进输入框、可改）"
```

---

### Task 6: 立绘缩略图（8 张 + 随机）

**Files:**
- Modify: `index.html`（`#postcard` 区加缩略图一行）+ `assets/postcard.js`
- Modify: `tools/check_postcard.py`（扩 `check_all_artworks_render`：改走缩略图这条**真用户路径**）

**Interfaces:**
- Consumes: Task 3 的 `ART` 与 `setArt`
- Produces: DOM —— `<div id="postcardArt" role="group" aria-label="换一张立绘">`，里面 9 个 `<button class="postcard-thumb">`（前 8 个是立绘，第 9 个「随机」）；选中的那个 `aria-pressed="true"`

- [ ] **Step 1: 写检查**

扩 `check_all_artworks_render()`：**不再用测试句柄**，改成逐个点 `#postcardArt` 里的 9 个按钮（真鼠标路径），每次断言无报错 + 左栏有非底色像素 + 被点的那个 `aria-pressed === 'true'`。

- [ ] **Step 2: 跑，确认红**

- [ ] **Step 3: 实现**

初始化时 `cur = Math.floor(Math.random() * 8)`；点第 i 张 → `setArt(i)`；点「随机」→ 随机一个（**不等于当前**）。

- [ ] **Step 4: 跑，确认绿**（`--only art`）+ 变异

变异：把某个缩略图的 `data-art` 索引写错 → 断言报红（左栏空白）；改回。

- [ ] **Step 5: Commit**

```bash
git add index.html assets/postcard.js tools/check_postcard.py
git commit -m "明信片：立绘缩略图一行（八张可选 + 随机），断言改走真用户路径"
```

---

### Task 7: 保存那条判据 + 三项验收 + 文档

**Files:**
- Modify: `tools/check_postcard.py`（加 `check_save_canvas_not_blank`）
- Modify: `docs/HANDOVER.md`（§2.2 功能一览那一行、§4.5 工具表加 `check_postcard.py`、§七 速查加一行）

**Interfaces:**
- Consumes: 前面全部
- Produces: 验收记录

- [ ] **Step 1: 写检查（保存）**

`check_save_canvas_not_blank()`：输入一段字 → 点 `#postcardSave`（真点击；文件会落到下载目录，**本步只验画布**）→ 断言 ① 画布尺寸等于当前档位（`1080×1440` 或 `1200×800`）② **左栏与二维码那两块区域都有非底色像素**（采样 `COL.art` 与 `COL.qr` 的中心一带）。

- [ ] **Step 2: 跑，确认绿**

Run: `PYTHONIOENCODING=utf-8 python tools/check_postcard.py`（不带 `--only`，六条全跑）
Expected: PASS

- [ ] **Step 3: 三项验收**

```bash
python -m http.server 8500 &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8500/assets/site.css   # 必须 200
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-postcard
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py after-postcard-home after-postcard; echo "退出码 $?"
PYTHONIOENCODING=utf-8 python tools/check_aria_labels.py      # 10/10
PYTHONIOENCODING=utf-8 python tools/check_reduced_motion.py   # 7/7
```

⚠ 参照点用**新的** `after-postcard-home`（拍照前先在 `dev` 上跑一次、只留 `index.html` 的差异），别照抄旧 label（HANDOVER §4.3.1）。
**期望**：差异**只落在 `index.html`**（明信片那一节）；其余页零差异。任何一处落在别的页上 → 停下来查。

- [ ] **Step 4: 视觉核对**

桌面 / 手机各一轮，**两档尺寸都看**：立绘在左（八张各看一张）、台词与访客的字在右、二维码与 `elysiad.top` 在下角、四角水晶花还在。

- [ ] **Step 5: 文档**

- §2.2 功能一览里「明信片生成」那一行改成新面貌（左立绘 / 右文字 / 弹幕 / 二维码）
- §4.5 工具表加 `check_postcard.py` 一行（说明：**现有四个工具都测不到它**）
- §七 速查加：`PYTHONIOENCODING=utf-8 python tools/check_postcard.py`
- §5.3「等需求方提供素材」里，如果还写着明信片那两条 → 标已完成

- [ ] **Step 6: Commit**

```bash
git add tools/check_postcard.py docs/HANDOVER.md
git commit -m "明信片：保存那条判据 + 三项验收 + 文档同步"
```

---

## 收尾（不在任务里，做完前面再看）

- **推送**：`git push origin dev`（⚠ 别替需求方合并到 `main`）
- **上线后线上验**：`curl -s https://elysiad.top/assets/postcard.js | head -3` 有内容；再用 `cdp.py` 指线上点一次弹幕、输一次字、存一张图
