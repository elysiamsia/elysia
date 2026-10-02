# `/sakura/` 铺开探索系统 + 「一瞬」 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/sakura/` 从「一页可看的档案」变成「一页可以逛的英桀页」——修掉「鞘中刀」那个已知 bug、接上探索系统与下方区块、加上她自己的小游戏「一瞬」。

**Architecture:** 公共层上一轮已经建好并上线（`explore.js` / `bottom.js` / `bday.js` / `games/` 契约）。这一轮**不新增共享层概念**，只做三件事：① 修她页面自己的 bug；② 按契约接入已有的三层；③ 新增一个 `assets/games/sakura.js`。所有页面专属的内容（12 个可发现物、台词、游戏）都留在她自己的文件里。

**Tech Stack:** 原生 HTML/CSS/JS（无构建、无框架、无依赖）。验证工具是 Python + CDP（`tools/check_*.py` 走无头 Edge）。**本站没有 JS 单测框架——断言一律写进 Python 检查工具**，这是项目既有的 TDD 落点。

**Spec:** `docs/superpowers/specs/2026-10-01-sakura-explore-design.md`

---

## Global Constraints

以下每条对本计划的**每一个任务**都成立：

- **台词一条不编，且原文照录。** 官方档案馆里用的是 `······`（六个中点），**不许「规范化」成 `……`**——
  改标点也是改台词。`src`（出处）必须跟着抄准。
- **配色 / 布局 / 现有文案 / 专属特效一律不动**（需求方 2026-10-01 定的范围）。
  唯一允许改的既有文案是「鞘中刀」的提示行 —— 它在新行为下会变成假话（见 Task 3）。
- **加载顺序不可调换**：`site.css` → `explore.css` → 页面内联 `<style>`；
  `site.js` → `explore.js` → `bottom.js` → `data/bdays.js` → `bday.js` → `games/sakura.js`。
- **Windows 上跑 Python 必须带 `PYTHONIOENCODING=utf-8`**，否则中文输出 GBK 崩。
- **临时脚本写成临时文件再执行，不要写进仓库**（抓档案馆的脚本也不例外）。
- **减动断言必须双向**：偏好打开时降级生效 + 偏好关闭时动画照旧。只测一侧等于没测。
- **`/sakura/` 之外的 10 页必须零差异。**
- **起服务器后先验内容再采样**；端口 8500 常残留，`check_*` 工具走 8501。
- **每个任务结束都要 commit**，消息用中文，风格照本仓库（一句话标题 + `═══` 分节正文）。

---

## 12 个可发现物（**定死，不许改**）

台词与出处已逐条从官方档案馆取出（2026-10-01）。`src` 的写法统一为
`官方档案馆 · 事件-樱 · <子事件>`。

| # | `id` | `at` | `verb` | `art` | 台词（**逐字**） | `src` 子事件 |
|---|---|---|---|---|---|---|
| 1 | `sakura-01` | `#opening` | `click` | `petal` | 等待······对于此处的我们来说，又能有什么意义呢？ | 关于自身·其一 |
| 2 | `sakura-02` | `#about` | `hold` | `sheath` | 对我来说，这是必要的举措，能够在很多情境对我加以提醒，让我不会忘记自己的立场。 | 关于戒律·其一 |
| 3 | `sakura-03` | `#about` | `slide` | `glint` | 换做是任何一位融合战士，都一样能结束那场事故——因为「阻止梅比乌斯」这件事，苏其实已经做到了。 | 关于自身·其三 |
| 4 | `sakura-04` | `#blade` | `hold` | `blade` | 而这把剑每出鞘一次，那份记忆就会重现一分。 | 关于戒律·其一 |
| 5 | `sakura-05` | `#blade` | `triple_tap` | `blade` | 为了求生，我曾钻研诸武，但到最后，我仅有、却也最实用的，不过只此「一刀」。 | 落樱的追忆·其二 |
| 6 | `sakura-06` | `#blade` | `drag` | `sheath` | 是的，每当我再次对自己的同类举剑，所面对的就不再是一时权衡，而是因记忆重现成倍而来的压力。 | 关于戒律·其一 |
| 7 | `sakura-07` | `#journey` | `click` | `petal` | 在成为融合战士前，我就已隶属于一支名为「毒蛹」的秘密行动部队。和其他人不同，我们不能知道太多事。 | 关于毒蛹·其一 |
| 8 | `sakura-08` | `#journey` | `hold` | `blade` | 我······我和千劫正好相反。我不希望有其他人和我一起行动。 | 关于毒蛹·其一 |
| 9 | `sakura-09` | `#journey` | `slide` | `petal` | 看着二位，让我回想起曾经和妹妹相依为命的日子。那段时间虽然艰苦，但对我们两人来说，却是生命中最快乐的时光。 | 关于自身·其四 |
| 10 | `sakura-10` | `#quotes` | `click` | `glint` | 虽然刻印的寓意最终是由爱莉希雅决定，但它并没有那么复杂。我曾说过「刹那」是一种技艺，而它所蕴含的所有，也只有「一刀」这么简单。 | 落樱的追忆·其二 |
| 11 | `sakura-11` | `#ending` | `slide` | `silhouette` | 其实，我也已经很久没有见到过樱花了。最后一次，还是在和千劫一起执行任务的路上。 | 落樱的追忆·其七 |
| 12 | `sakura-12` | `#bottom` | `click` | `petal` | 我曾经教导过一些后继者制作简单便捷的食物，如果你有需要的话，也可以来找我。 | 关于料理·其一 |

**动词分布**：`click` ×4 / `hold` ×3 / `slide` ×3 / `triple_tap` ×1 / `drag` ×1 = 12。

> ⚠ **这 12 条要避开**（她页面上已经展示或已经用掉的）：
> 语录区那 10 条 + 彩蛋用掉的「寒狱冰天」那句、「别来无恙…收下它吧」那句、
> 「她一直是个怕寂寞的孩子…」那句。上表已避开，但 Task 1 要**再核一遍**。

**`unlock`**（找齐 12 个之后）：

| 字段 | 值 |
|---|---|
| `title` | `记忆的尽头`（**站点 UI 文案**，不是台词） |
| `text` | 「如果能够做到的话，或许······我会试着把自己从未有机会使出的那一剑交予你，它会对你有所帮助的。」 |
| `src` | `官方档案馆 · 事件-樱 · 落樱的追忆·其二` |

> ⚠ **2026-10-01 改动过一行**（Task 1 核准时提出、协调方批准）：
> `sakura-11` 原先是「…从未有机会使出的那一剑交予你…」（落樱的追忆·其二），
> 现在换成了上面那句「…很久没有见到过樱花了…」（落樱的追忆·其七）。
> 理由：**让两个位置各拿到最合适的那句** ——
> · 「未曾使出的那一剑」作为**「找齐了」的奖励**份量最足（→ 给 `unlock.text`）
> · 「很久没见到樱花了」是一句**道别**，而且**樱花**放页尾本来就更贴（→ 给 `sakura-11`）
> · 换完**不再有任何重复**（原来两句相同，看着像复制粘贴的 bug）
> ⚠ 四条候选 A/B/C/D 与各自的取舍，见 `2026-10-01-sakura-finds-table.md` §四。

---

## Review Focus

以下是 spec 隐含、但**没有任何一个任务的测试天然覆盖**的失败模式。每条都在下方对应任务里加了断言：

1. **可发现物落在锚点外面或被 `overflow` 裁掉** → 一直存在、永远点不到，且不报错。
   → Task 5 断言每个节点在滚到跟前之后仍在视口内、且 `elementFromPoint` 命中自己。
2. **可发现物压在文字上** → 0.35 透明度的小简笔画压在句子上，看起来像渲染故障。
   → Task 5 断言落点背后**不是文字叶子**（上一轮踩过：12 个里 4 个压着文字）。
3. **12 个里漏一个** → 探索度**永远差一个**、解锁永远不触发。差一个的 bug 最难看见。
   → Task 5 断言「声明的 id 集合 == 已渲染的 id 集合」，且与上表**逐字一致**。
4. **`#blade` 上两套交互打架** → 可发现物是 44×44 热区，刀是整块舞台。
   → Task 7 断言：点刀不误触可发现物、点可发现物不触发刀。
5. **拿到花之后刀仍然只弹 toast**（就是这次要修的那个 bug 的回归）。
   → Task 3 断言：`gifted` 为真时再点，**仍有拒动 + 浮字 + 台词**，且 `sakuraFlower` 不被重写。

---

### Task 1: 去档案馆逐字核准那 12 条

**Files:**
- Create: `docs/superpowers/plans/2026-10-01-sakura-finds-table.md`（核准结果，进仓库）
- 临时脚本放 `%TEMP%`，**不进仓库**

**Interfaces:**
- Produces: 一张核准过的表 —— 12 条的 `line` 与 `src` 逐字确认，供 Task 5 直接抄

> ⚠ **本任务只核准、不挑选。** 挑哪 12 条已经在本计划里定死了，
> 实施者的活是**验证它们与档案馆逐字一致**，以及**补全 `src` 的准确子事件名**。

- [ ] **Step 1: 抓档案馆**

页面是 **SPA**，直接 `curl` 只拿得到 6.6 KB 的壳。必须渲染：

```bash
PYTHONIOENCODING=utf-8 python tools/cdp.py \
  "https://baike.mihoyo.com/bh3/wiki/content/881/detail" size 1280x900 sleep 9000 \
  eval "(()=>{for(var k=0;k<3;k++){[].slice.call(document.querySelectorAll('*')).forEach(function(e){if(e.children.length===0&&e.textContent.trim()==='展开')e.click()})}return 1})()" sleep 6000 \
  eval "<提取脚本，见 Step 2>"
```

⚠ **必须点开所有折叠段落。** 实测：不展开只有 51 条，展开后 **355 条**——
折叠段落里的台词**在 `innerText` 里根本不存在**，不展开会漏掉 85%。

- [ ] **Step 2: 提取「台词 + 子事件」**

页面文本里，**小标题与对话交替出现**：

```
落樱的追忆 · 其一          ← 子事件（形如 `XXX · 其N`）
樱：不知道你的旅途是否顺利……  ← 台词（以「樱：」开头）
```

提取逻辑：逐行扫，遇到匹配 `/^[^：]{2,16} · 其[一二三四五六七八九十]+$/` 的行就更新当前子事件；
遇到以 `樱：` 开头的行就记一条 `(当前子事件, 台词)`。

- [ ] **Step 3: 与现实核那 12 条**

逐条比对：

```bash
# 例：核准 sakura-05
grep -P "\t为了求生，我曾钻研诸武" "$TEMP/sakura_lines.txt"
```

Expected: 恰好 1 条命中，且子事件是 `落樱的追忆 · 其二`。

⚠ **逐字比，不是「看着像」。** 重点看 `······`（六个中点）有没有被写成 `……`。
⚠ 有任何一条对不上（档案馆里找不到 / 文字不同 / 子事件不同）→ **停下来报告，不要自己改台词**。

- [ ] **Step 4: 顺手核「不与该页重复」**

```bash
# 她语录区那 10 条
sed -n '/var quotes = \[/,/^  \];/p' sakura/index.html
```

Expected: 表里 12 条**一条都不在**这 10 条里，也不在彩蛋用掉的那 3 句里。

- [ ] **Step 5: 写核准结果并提交**

新建 `docs/superpowers/plans/2026-10-01-sakura-finds-table.md`：把上面那张表照抄一遍，
每行后面加上「✅ 已核（命中 1 条）」。**对不上的行标 ❌ 并说明**。

```bash
git add docs/superpowers/plans/2026-10-01-sakura-finds-table.md
git commit -m "樱：12 条可发现物台词与出处逐字核准（对照官方档案馆）"
```

---

### Task 2: 给探索系统补三个樱的 `art` 关键字

**Files:**
- Modify: `assets/explore.js`（`ART` 表，文件开头的对象字面量）
- Modify: `tools/check_explore.py`

**Interfaces:**
- Consumes: 现有的 `ART`（12 个关键字：`spore` / `scale` / `glint` / `record` / `shadow` /
  `throne` / `shed` / `infinity` / `mouse` / `sleeping` / `silhouette` / `brick`）
- Produces: `ART` 新增三个关键字 —— `petal` / `sheath` / `blade`

> ⚠ **为什么必须加**：现有 12 个关键字是围绕 mobius 的实验室母题设计的
> （孢子 / 鳞 / 王座 / 小白鼠……）。樱的母题是**刀 / 樱瓣 / 鞘**，硬套那 12 个会显得是别人的页面。
> `ART` 本来就是可扩展的注册表（`explore.js` 里写着「想加新的？往这儿添一条」）。

- [ ] **Step 1: 写断言**

在 `tools/check_explore.py` 加一条**通用**断言（不加 `@fixture_only` / `@mobius_only`）：

```python
@check
def check_art_keywords_resolve(b, page, expected):
    """每个 find 的 `art` 都要能解出真正的图形，不能悄悄回落到默认。

    ⚠ `artSvg()` 遇到未知关键字会 `console.warn` 并**回落到默认**（`glint`）——
      于是「关键字打错字」在页面上只表现为「那个东西长得不对」，不报错。
      这里直接比「节点里那个 svg 的内容」与「ART[关键字] 的内容」是否一致。
    """
```

判据（JS 侧）：

```js
(() => {
  var bad = [];
  document.querySelectorAll('.explore-find').forEach(function (n) {
    var key = n.getAttribute('data-art');
    if (!key || !window.ElysiaExplore.ART[key]) bad.push(n.getAttribute('data-find-id') + ':' + key);
  });
  return JSON.stringify(bad);
})()
```

Expected: `bad` 为空数组。

- [ ] **Step 2: 跑，确认它在补齐之前是红的**

⚠ 这条对新页会红（`sakura-*` 还没接线，`ART` 里也还没有那三个关键字）。
**先记下当前状态**（探针页应当仍是绿的）。

- [ ] **Step 3: 在 `ART` 里加三个关键字**

`assets/explore.js` 的 `ART` 对象里追加。⚠ 照现有条目的写法：
**24×24 viewBox、只用 `stroke` 不用 `fill`、只用 `path` / `circle` / `rect` / `ellipse`**。

```js
petal:      /* 一枚五瓣的樱花 */
sheath:     /* 一柄带鞘的刀（横放） */
blade:      /* 出鞘的刀身（带刀镡） */
```

具体路径由实施者画，但**必须满足**：
- 在 24×24 里**居中**（视觉重心在 12,12 附近）
- 不超出 viewBox（超出会被裁）
- 只用 `stroke` —— `explore.css` 靠 `currentColor` 给它上色，`fill` 会盖掉

- [ ] **Step 4: 跑，确认探针页仍全绿**

```bash
PYTHONIOENCODING=utf-8 python tools/check_explore.py
```

Expected: 全绿（探针页的 6 个 find 用的都是已有关键字，不受影响）。

- [ ] **Step 5: Commit**

```bash
git add assets/explore.js tools/check_explore.py
git commit -m "探索系统：补三个 art 关键字（petal / sheath / blade）"
```

---

### Task 3: 修「鞘中刀」的四件事

**Files:**
- Modify: `sakura/index.html`（`SECTION: blade (鞘中刀)` 与 `SECTION: easter egg - 结尾的勿忘我` 两段）
- Modify: `tools/check_explore.py`

**Interfaces:**
- Produces: `#bladeStage` 在**任何状态下**都还响应点击；
  结尾跨彩蛋的渲染被抽成一个函数 `renderEndingFlower()`，可在收花时**立即**调用

- [ ] **Step 1: 写断言（三条）**

在 `tools/check_explore.py` 加（都带 `@sakura_only` —— 见下方 Step 1.5）：

```
① gifted 为真时再点 #bladeStage：
   仍有拒动（.refused 出现过）、仍浮出「纹丝不动」、仍弹台词
   且 localStorage['sakuraFlower'] 不被重写（值不变）
② 同一次会话里：先把 sakuraFlower 置空、点三次拿到花，
   紧接着读 #endingSub —— 必须**已经有**那句台词、且 #endingFlower 有 .bloom
   （不需要刷新）
③ 点三次之后，localStorage 里**没有** 'sakuraTries' 这个键
```

⚠ 这三条都要**走真实用户路径**（`cdp.py` 的 `click` 或 `Input.dispatchMouseEvent`），
不能直接调内部函数 —— 页面脚本是 IIFE 包裹的，内部函数**不是全局的**。

- [ ] **Step 1.5: 加 `@sakura_only` 装饰器**

`tools/check_explore.py` 的「断言注册表」一节已有 `@fixture_only` 与 `@mobius_only`，
照它们的样式加一个：

```python
def sakura_only(fn):
    """收窄成「只对樱这一页成立」。"""
    fn.pages = ('sakura/index.html',)
    return fn
```

- [ ] **Step 2: 跑，确认这三条是红的**

```bash
python -m http.server 8500 &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8500/sakura/   # 必须 200
PYTHONIOENCODING=utf-8 python tools/check_explore.py sakura/index.html
```

Expected: ①②③ 全红（③ 因为现在还在写 `sakuraTries`）。

- [ ] **Step 3: 改 `tryDraw()` —— 收窄 `gifted` 的语义**

现在的写法（`sakura/index.html`，`SECTION: blade`）：

```js
function tryDraw(){
  if (gifted){ showToast('……嗯。花还开着。', false); return; }   // ← 到此为止
  tries++;
  …
}
```

改成：**`gifted` 只决定「还会不会再送花」，不决定「刀还能不能点」**。

- `gifted` 为真时：照常走完整个反馈（`bladeSound()` / `refuseShake()` / 浮出「纹丝不动」/ 瓣迸发），
  然后弹**「拒绝」那句台词**（`关于自身·其二`，与第一次相同）
- `gifted` 为真时**不再** `tries++`、**不再**判定 `tries >= 3`、**不再**写 `sakuraFlower`

⚠ 保持 `gifted === false` 时的行为**一字不变**（那是已经验收过的）。

- [ ] **Step 4: 改 `renderBlade()` 的提示行**

现在的写法：

```js
bladeHintEl.textContent = gifted
  ? '刀还在鞘里。你没有再伸手——这样很好。'
  : '刀在鞘里。你可以试试。';
```

⚠ **「你没有再伸手」在刀重新可点的那一刻自己就变成假话了** —— 必须改。

改成不含「你没有再伸手」的说法，且**不要**写成「你可以再试一次」那种催促口气
（她是「你越用力她越不肯」的性格）。

- [ ] **Step 5: 删掉 `sakuraTries` 的写入**

```js
try { localStorage.setItem('sakuraTries', String(tries)); } catch(err){}
```

**整行删掉。** 理由：它只写不读，页面上是 `var tries = 0`，存进去永远没人看。

- [ ] **Step 6: 把结尾跨彩蛋抽成函数并在收花时调用**

现在那段（`SECTION: easter egg - 结尾的勿忘我`）是**页面加载时判一次**的裸代码块：

```js
var gotFlower = false;
try { gotFlower = localStorage.getItem('sakuraFlower') === '1'; } catch(err){ gotFlower = false; }
if (gotFlower){ endingSub.textContent = '…'; endingSub.classList.add('visible'); if (endingFlower) endingFlower.classList.add('bloom'); }
```

改成：

```js
function renderEndingFlower(){ /* 上面的 if 体，去掉 gotFlower 变量本身 */ }
renderEndingFlower();          // 加载时一次
```

然后在 `tryDraw()` **送花的那一支里**、写完 `localStorage` 之后，调一次 `renderEndingFlower()`。

⚠ `renderEndingFlower` 要**幂等**（重复调用不产生副作用）—— 它可能被调多次。

- [ ] **Step 7: 跑，确认三条断言全绿**

```bash
PYTHONIOENCODING=utf-8 python tools/check_explore.py sakura/index.html
```

Expected: ①②③ 全绿。

- [ ] **Step 8: 变异测试（证明判据不是恒真式）**

⚠ 这一步不能省 —— 上一轮的教训是「看不出判据有没有牙齿的断言等于没写」。

- 把 `tryDraw` 改回 `if (gifted){ showToast(…); return; }` → 断言 ① 必须报红
- 把 `renderEndingFlower()` 从送花那支里删掉 → 断言 ② 必须报红
- 把 `setItem('sakuraTries', …)` 加回去 → 断言 ③ 必须报红

**三条都要实测**，并在 commit 正文里写出实测结果。

- [ ] **Step 9: Commit**

⚠ 正文要标明**这是修 bug，不是纯重构**，并逐条写清改了什么、为什么。

```bash
git add sakura/index.html tools/check_explore.py
git commit -m "樱：修「鞘中刀」四处（拿到花后刀仍在、结尾当场解锁、去掉死写入）"
```

---

### Task 4: 接线（探索 / 下方区块 / 生日）

**Files:**
- Modify: `sakura/index.html`（`<head>` 加一个 `<link>`，body 末尾加四个 `<script>` 与调用）
- Modify: `tools/check_explore.py`（`EXPECTED_FINDS`）

**Interfaces:**
- Consumes: `ElysiaExplore.init(cfg)` / `ElysiaBottom.mount({game})` / `ElysiaBday.mount({…})`
- Produces: 页面上出现 `#bottom`、`.explore-count`、`#bdayEgg`

- [ ] **Step 1: 登记声明数**

`tools/check_explore.py` 的 `EXPECTED_FINDS` 里加：

```python
'sakura/index.html': 12,
```

- [ ] **Step 2: 跑，确认 ① 号断言报红**

```bash
PYTHONIOENCODING=utf-8 python tools/check_explore.py sakura/index.html
```

Expected: ① 报「声明 12 / 渲染 0」—— 这是红态起点。

- [ ] **Step 3: 改 `sakura/index.html`**

`<head>` 里，`site.css` 那行**之后**、页面内联 `<style>` **之前**加：

```html
<link rel="stylesheet" href="/assets/explore.css">
```

body 末尾（现有的 `site.js` 之后）按**这个顺序**加：

```html
<script src="/assets/explore.js"></script>
<script src="/assets/bottom.js"></script>
<script src="/data/bdays.js"></script>
<script src="/assets/bday.js"></script>
<script src="/assets/games/sakura.js"></script>   <!-- Task 6 才建；先不加这一行 -->
```

⚠ **`games/sakura.js` 是 Task 6 才建的** —— 本步**先不加那一行**，否则 404 会让
「页面无报错」断言红（`check_explore.py` 收了 CDP 的 `Log` 域，404 算失败）。

调用（`THEME` 对象里先只加 `explore` 与 `game` 两项，内容由 Task 5 / Task 6 填）：

```js
ElysiaExplore.init(THEME.explore);
ElysiaBottom.mount({ game: THEME.game });
ElysiaBday.mount({ birthMsg: '…', src: '…' });   // 台词见下
```

⚠ `ElysiaBday` 的生日台词（`birthMsg` + `src`）**要是有出处的才有资格传**：
  · 先去 Task 1 抓下来的文本里找**她说的、能和生日/礼物搭上**的一句
    （候选子事件：`落樱的追忆·其三` —— 那一段正是她**送礼物**的场景）
  · **找不到就不传 `birthMsg`** —— 胶囊照常工作，只是生日当天不多那一句
  · ⚠ **绝对不许**拿首页爱莉希雅那句顶替，更不许现编。**没有就空着。**

⚠ `ElysiaExplore.init` 与 `ElysiaBottom.mount` 的**先后顺序怎么写都对**
（共享层的 `ensureAttached` 会补扫后建的锚点），但**保持先 init 再 mount** 与 mobius 一致。

- [ ] **Step 4: 跑，确认接线生效**

```bash
PYTHONIOENCODING=utf-8 python tools/check_explore.py sakura/index.html
```

Expected: 与「12 个可发现物尚未填」相关的断言仍红（`finds` 是空的），
但**下方区块 / 生日胶囊 / 无报错**相关的应当转绿。

- [ ] **Step 5: Commit**

```bash
git add sakura/index.html tools/check_explore.py
git commit -m "樱：接上探索系统 / 下方区块 / 生日胶囊（先把线接好，内容下一步填）"
```

---

### Task 5: 填 12 个可发现物

**Files:**
- Modify: `sakura/index.html`（`THEME.explore`）
- Modify: `tools/check_explore.py`

**Interfaces:**
- Consumes: Task 1 核准过的 12 条（`line` + `src`）、Task 2 的三个 `art` 关键字
- Produces: `THEME.explore` 完整（`finds` 12 条 + `unlock` + `whisper` + 两个阈值）

- [ ] **Step 1: 写断言（四条）**

```
① 渲染出的 12 个 data-find-id 与计划表**逐字一致**（比集合，不比顺序）
② 每个 find 的 src 非空，且渲染出的气泡里确实含该 src 文本
③ 页面上出现的每一句引号内台词，都能在**档案馆抓下来的原文**里逐字找到
   （⚠ 含 ······ 写法；这条要带 Task 1 的文本做比对）
④ 12 条与语录区的 10 条**零重复**
```

⚠ ③ 是最重要的一条（「台词一条不编」）。它**必须有牙齿**：
先往页面里塞一句编的，确认它报红，再删掉。

- [ ] **Step 2: 跑，确认红**

- [ ] **Step 3: 填 `THEME.explore`**

- `finds`：照本计划上方那张表**逐字**抄（Task 1 已核过）
- `pageId: 'sakura'`（⚠ 必填；改名 = 玩家进度丢失）
- `unlock`：见上方表（`title` 是站点 UI 文案，`text`/`src` 是台词）
- `whisper`：从档案馆取 **4 条**有出处的（⚠ 一条不许编），
  `whisperCooldownMs: 11000`（她沉静，比默认 8000 稀疏）
- `hintAfterRatio` 用默认 `0.5`（不写）

- [ ] **Step 4: 跑，确认全绿**

```bash
PYTHONIOENCODING=utf-8 python tools/check_explore.py sakura/index.html
```

- [ ] **Step 5: 落点复查（Review Focus 1 / 2）**

用临时探针（照上一轮的做法）确认：
- 12 个**全部落在容器上**，没有一个压在文字上
- 滚到跟前之后，中心点 `elementFromPoint` 命中的是它自己

⚠ 有压在文字上的 → **改 `x`/`y`**，不要改 `at`。
⚠ **不要**用缩略图肉眼找 —— 0.35 透明度的小图缩放后根本看不见，必须用探针。

- [ ] **Step 6: Commit**

```bash
git add sakura/index.html tools/check_explore.py
git commit -m "樱：12 个可发现物 + 解锁 + 陪伴层（台词全部有出处）"
```

---

### Task 6: 小游戏「一瞬」

**Files:**
- Create: `assets/games/sakura.js`
- Modify: `sakura/index.html`（加载 `<script src="/assets/games/sakura.js">`；`THEME.game` 填上）
- Modify: `tools/check_explore.py`

**Interfaces:**
- Consumes: `.bottom-game` 槽（`ElysiaBottom.mount` 建出来的）
- Produces: `window.ElysiaGames.sakura = { title, hint, mount(host) }`

- [x] **Step 1: 写断言（两条）**

```
① 点「开始」之后：目标在动、且出刀判定真的生效
   —— 判据：隔一段时间取两次画面状态，**必须不同**
② ⚠ Review Focus #5：`--reduced` 模式下重复 ① —— 游戏**仍然在动**
```

⚠ ①② 都最容易写成恒真式。**先证明判据抓得到「不动」**：
把游戏停掉再采两次，看它报不报红。不做这步等于没测。

⚠ 参考 mobius 那条的做法（`check_mobius_game_runs`）：用 canvas 的 `toDataURL()` 比对。
樱这个游戏也用 canvas 画，同样适用。

- [x] **Step 2: 跑，确认红**

- [x] **Step 3: 实现 `assets/games/sakura.js`**

契约（照 `assets/games/mobius.js` 那份样板）：

```js
window.ElysiaGames = window.ElysiaGames || {};
window.ElysiaGames.sakura = {
  title: '一瞬',
  hint:  '在那一下出刀。',
  mount: function (host) { /* 自己渲染进 host，自给自足 */ },
};
```

玩法（spec §6.2）：

| | |
|---|---|
| 场景 | 屏幕正中一条竖的**斩线**；目标从一侧向它移动 |
| 操作 | 手机点屏幕 / 电脑按空格或点 |
| 判定 | 目标在判定窗内 → 「**刹那**」；还没到 → 「太早了」；已经过去 → 「晚了」 |
| 连击 | 连续「刹那」累积；**目标速度随连击加快**（否则 30 秒会无聊） |
| 一局 | 30 秒 |
| 计分 | 正中次数 + 最高连击；最高分存 `localStorage` |
| 文案 | **站点 UI 文案，不是台词** —— 本版**不放台词** |

⚠ 硬约束：
- **与探索度解耦**（玩游戏的分数不计入探索度）
- **减动偏好下游戏内部动画保留** —— 它由「开始」显式触发，不属「自动播放的装饰动效」
  （`explore.css` 的 `@media (prefers-reduced-motion)` 段里**不要**把游戏动画关掉）
- 站点面向**大陆手机**：别用老内核不认的 CSS/JS
  （先例：`color-mix()` 被特意避开、`classList.toggle(cls, force)` 换成 add/remove）
- 触摸与鼠标**都要能玩**

- [x] **Step 4: 跑，确认全绿（含 `--reduced`）**

```bash
PYTHONIOENCODING=utf-8 python tools/check_explore.py sakura/index.html
PYTHONIOENCODING=utf-8 python tools/check_explore.py sakura/index.html --reduced
```

- [x] **Step 5: Commit**

```bash
git add assets/games/sakura.js sakura/index.html tools/check_explore.py
git commit -m "樱：小游戏「一瞬」—— 斩线 + 时机判定（刹那）"
```


#### 实施记录（2026-10-02）—— 与计划的偏差

**是从 `wip/sakura-task6` 那份草稿接着做的。** 草稿自己标着「一行都没验证过」，
所以下面每一条都是**重新实测**的，不是照抄。**七处变异全部实测过**（把实现故意改错、
看断言报不报红）：判定恒真 / 判定从不生效 / 循环冻住 / 关掉不停 / 脚本整行拿掉 /
两处 `aria-hidden` 不同步 —— 七条全被抓住。

| 计划 | 实际 | 为什么 |
|---|---|---|
| 断言**两条** | **五条** | 计划 ① 里「出刀判定真的生效」那半句**没有任何判据覆盖** —— `toDataURL` 比对只证明**循环在跑**。补了真正验判定的那条（`check_sakura_judgment`，正反两半都验）；另把遮罩的 `aria-hidden` 同步也纳入 `_sk_game_probe` |
| （计划没提） | 判据改成**读画面** | 时间模型不可靠：`dt` 有 50ms 上限，掉帧时游戏钟比墙钟慢 —— 而实测这台机器 headless 只有 **40fps**，不是 60。改成取画布上粉色像素的**质心**，像玩家一样看着花瓣出刀 |
| 空挥不消耗目标 | **一枚花瓣只够出一刀** | 实测：空挥不消耗时，60ms 连点 13 秒 = **12 次正中**（花瓣步长 9px，而判定窗有 32px 宽，跨不过去）。那就成了「按住就赢」，和「只有那一下」正相反 |
| `.sk-canvas` 用 `max-width:88vw` | `calc(100vw - 4rem)` **+ `max-height`** | `88vw` 没算面板自己的左右内边距，**360px 宽的手机上余量只剩 1px**（面板 364 / 视口 366，靠 flex 硬收进去）；**横屏是真的溢出** —— 画布 320 → 面板 542 > 360，而 fixed 遮罩没有滚动条，切掉的**够不着**。<br>⚠ **更正**：这一行原先写「360 上溢出约 4px」，那是**按算式推的、没量过**。2026-10-02 补量后确认它当时**没有溢出**，提交信息里那句同样不准 |
| 判定窗 `rgba(...,.16)` | `rgba(...,.3)` | 实测只画出约 **6%** 的对比度（`(7,10,20)` → `(17,26,38)`），手机上白天看不见 —— 而代码自己的注释写着「让人看得见『分寸』在哪」 |

**顺手给工具加的口子**：`check_explore.py --only <名字片段>`。
变异测试要把同一条断言跑很多遍，而整轮 34 组要两分钟 —— 加了口子之后一轮只要几十秒。
⚠ 报告里**会写明这是筛过的**（开头一行 + 结尾一行），别把它当成一次全量验收。

**实测数字**（留下来，将来调手感时当基准）：

| 项 | 值 |
|---|---|
| headless Edge 的 rAF | **40fps** —— 时机类判据别按 60 算 |
| 修复后狂点 60 / 125 / 250ms，各 6 秒 | 正中 **0** 次 |
| 对着花瓣掐准了砍，6 秒 | 正中 **6** 次 · 连击 **6** |
| 面板宽 | 367px = 画布 320 + 2×1.4rem 内边距 + 2px 边框 |
| 四种视口实测 | 375 / 360 / 320 / 横屏 640×360 —— 面板**都放得下**，画布等比缩（120~320） |

---

### Task 7: 刀 × 可发现物不打架（Review Focus 4）

**Files:**
- Modify: `sakura/index.html`
- Modify: `tools/check_explore.py`

**Interfaces:**
- Consumes: Task 3 的 `tryDraw`、Task 5 的 `#blade` 那三个 find

- [x] **Step 1: 写断言（两条，都要走真实用户路径）**

```
① 点 #bladeStage（整块舞台的正中，避开那三个可发现物的热区）：
   刀的反馈出现（.refused 出现过），且**探索度不变**
② 点 #blade 上那三个可发现物各自的中心点：
   那条 find 被记为「已发现」，且**刀没有反应**（没有 .refused、没有浮字）
```

⚠ 这两条是**互相印证的一对**：只验 ① 的话，一个「可发现物永远点不到」的实现照样能过；
只验 ② 的话，一个「点哪都触发刀」的实现也能过。

- [x] **Step 2: 跑，确认现状**

⚠ 现在很可能是**红的** —— 三个 find 的热区就压在刀舞台上，
`elementFromPoint` 在它们的中心点会命中 find，刀收不到。

- [x] **Step 3: 按实测结果调整**

三条可能的处理（**按实测选，不要预设**）：

1. 把 `#blade` 那三个 find 的 `x`/`y` **移出刀舞台的矩形**（优先选这条）
2. 若移不开（舞台太大占满区段），在 `tryDraw` 的入口加一句：
   **事件来自可发现物热区时直接返回**（`if (e.target.closest('.explore-find')) return;`）
3. 若 find 被刀舞台挡住点不到，给 `.explore-find` 提高层级

⚠ 无论选哪条，**① ② 都要绿**，且**刀原有的手感（鞘鸣 / 拒动 / 浮字）一字不变**。

- [x] **Step 4: 跑，确认两条全绿**

- [x] **Step 5: Commit**

```bash
git add sakura/index.html tools/check_explore.py
git commit -m "樱：刀舞台与可发现物互不误触（两向断言）"
```


#### 实施记录（2026-10-02）

**计划 Step 2 那句预测是错的 —— 实测两条都绿，`sakura/index.html` 一行都不用改。**
「三个 find 的热区就压在刀舞台上」不成立：Task 5 挑坐标时已经绕着舞台选了。

| find | 坐标 | 桌面 1280 | 手机 375 / 360 / 320 |
|---|---|---|---|
| sakura-04 | (0.10, 0.30) | 在舞台左侧 333px | **在舞台上方 22px** |
| sakura-05 | (0.90, 0.10) | 在舞台右侧 333px | 在舞台右侧 111px |
| sakura-06 | (0.50, 0.86) | 在舞台下方 82px | 在舞台下方 62px |

⚠ **手机上 sakura-04 只剩 22px（拾取框边距）**，是全站最紧的一处。
根因是舞台的占比**随视口剧变**：1280 下它占 `#blade` 的 x `0.379~0.621`，
**360 宽下是 `0.071~0.929`** —— `x:0.10` 这种坐标在桌面上离舞台很远，在手机上就贴着它。

**没有动坐标** —— 它还没坏，而动它就是改视觉、得另跑一轮视觉核对（而且可能把它挪到文字上）。
改成**由断言守着**，并且让摘要把余量报出来：
`3 个都躲开了刀舞台（两个视口，最小余量 44px：sakura-04 @ 375）`。
**绿色也说清楚绿得有多勉强** —— 缩水了看得见。

**断言写成了三条**：计划那两条（一环扣一环的**行为**断言），外加一条**几何**的。
理由是实测出来的：

| 变异 | ①点舞台 | ②点 find | ③几何 |
|---|---|---|---|
| 把 sakura-06 挪到舞台**正中** | ✗ | ✓ | ✗（两个视口都报） |
| 刀改成监听整个 `#blade`（点哪都拔刀） | ✓ | ✗ | ✓ |
| 挪到舞台**左三分之一**（不在正中） | **✓** | ✓ | ✗ |
| 挪到**桌面安全、手机压在舞台上**的位置 | **✓** | ✓ | ✗（只有 375 那一遍报） |

①② 只采舞台**正中**那**一个点** —— 表的第 3、4 行就是它们漏掉的两种。
所以补了 ③（口径与 `check_finds_not_on_text` 一致：取 find 的**中心**），
并且**两个视口都量** —— 第 4 行那一次，只有「手机那一遍」报得出来。

> 💡 ② 那个变异还带出一个副作用值得记：刀被误触发时 `tries` 一起涨，
> **三次之后她会把「勿忘我」送出去**（实测计数行直接从 `已伸手 × 0` 跳到
> 「她给了你一朵花」）。也就是说「我只是想点个东西」会**莫名其妙改掉这一页的状态**。
> 这正是 ② 要守的东西，比「两种效果叠在一起」严重得多。

---

### Task 8: 三项验收

**Files:**
- 无源码改动（只产快照与报告）

**Interfaces:**
- Consumes: Task 1–7 的全部产物
- Produces: `screenshots/snap/after-sakura/`

- [x] **Step 1: 建快照**

```bash
cd D:\claude-code\elysia-main
python -m http.server 8500 &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8500/assets/site.css   # 必须 200
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-sakura
```

⚠ **等它真的跑完**：输出末尾必须出现 `快照存入 ……` 且进程真的退出。
⚠ **重跑同一个 label 时文件数判据会骗你**（旧文件还在目录里）—— 只认那一行 + 进程退出。

- [x] **Step 2: 差分**

```bash
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py after-bday after-sakura; echo "退出码 $?"
```

**期望**：差异**全部落在 `sakura/index.html`**，且**逐条可解释**
（新增的可发现物 + 下方区块 + 生日胶囊 + 刀的状态）。

⚠ **其余 10 页零差异**。任何一处落在别的页上 → 停下来查。

- [x] **Step 3: 属性与减动断言**

```bash
PYTHONIOENCODING=utf-8 python tools/check_aria_labels.py        # 10/10
PYTHONIOENCODING=utf-8 python tools/check_reduced_motion.py     # 7/7
PYTHONIOENCODING=utf-8 python tools/check_explore.py sakura/index.html
PYTHONIOENCODING=utf-8 python tools/check_explore.py            # 探针页，别弄坏
PYTHONIOENCODING=utf-8 python tools/check_explore.py --reduced  # 探针页减动
```

- [x] **Step 4: 视觉核对**

桌面 `1280×900` + 移动 `375×812` 各一轮截图，逐节看。

⚠ **不接受「看起来差不多」。** 重点看：
- 12 个可发现物**有没有压在文字上**（⚠ 缩略图上看不出来，用 Task 5 的探针）
- 「一瞬」在手机上能不能玩（触摸）
- 生日胶囊在樱的配色下**顺不顺眼**（她那一页是冷靛 + 樱粉）

- [x] **Step 5: 关服务器 + Commit**

```bash
netstat -ano | grep ":8500 " | grep LISTENING
taskkill //F //PID <pid>
git add -A
git commit -m "验收：樱页三项断言全绿（其余 10 页零差异）"
```


#### 验收记录（2026-10-02）

| 项 | 结果 |
|---|---|
| 快照 | `after-sakura` **33 json + 33 png**（11 页 × 3 视口）—— 末尾有「快照存入」、进程退出码 0 |
| 差分 `after-bday` → `after-sakura` | **9 处，全落在 `sakura/index.html`，逐条可解释**；其余 **10 页零差异** |
| 属性断言 | `check_aria_labels.py` **10/10** |
| 减动断言 | `check_reduced_motion.py` **7/7**（另有 2 个场景） |
| 探索系统（樱页） | **38/38** |
| 探针页 | 普通 **35/35** · 减动 **5/5** |

**那 9 处差异全是高度**，而且**正好等于 `#bottom` 的高度** —— 实测 490 / 477 / 431px
分别对应 1920 / 768 / 375，正是 Task 4 的探索度 + Task 6 的游戏卡那一块。
误差 0.3px 以内，**没有一分钱解释不了**。

> ⚠ **mobius 一处差异都没有** —— 和 HANDOVER §10.10 三 里那条预告相反。
> 根因：**快照的 `SELECTORS`（39 个）里根本没有探索系统那批元素**
> （`.explore-find` / `.bottom-*` / `.game-card` / `#bdayEgg` / `#blade*` 一个都没登记），
> 所以 `lab-06` 那次改坐标**在快照里本来就看不见** —— 那条预告是想当然写的，已更正。
> **推论**：这三块在差分里**只看得到高度、看不到内容**；它们的正确性靠
> `check_explore` / `check_aria_labels` 守，不靠快照。

#### 视觉核对（桌面 1280 / 1920，移动 375 / 360 / 320 / 横屏，逐节看）

抓到一件真东西：

**生日胶囊在樱页上一直是「别人的配色」。** `explore.css` 里那 15 个 `--bday-*`
**全都带兜底**，而兜底值是**首页爱莉希雅的粉紫 + 金**；`mobius` 逐页覆盖过
（它那段注释原话：「不覆盖的话它会吃共享层的默认值，那是首页爱莉希雅的粉紫，**串页**」），
**而樱页一个都没覆盖** —— 于是她的生日面板是紫底金字。
已补上（照本页 `:root` 取色：壳子走冰蓝、圆点与强调走樱粉、倒计时四位数走冰蓝）。
实测计算样式已变：面板底 → `rgba(7,10,20,.92)`/`rgba(19,28,51,.92)`、数字色 → `rgb(143,220,255)`。

> ⚠ 这属于 §6.5 那一类 —— **静默**：不报错，快照也测不出来
> （`#bdayPanel` / `#bdayEgg` 不在 `SELECTORS` 里）。是**肉眼看截图**看出来的。

另外三条看下来的（都**不是**缺陷）：

· **12 个可发现物的落点**干净 —— 肉眼 + 断言（两个视口）都对过，没有压在文字上
· **「一瞬」在手机上**：面板放得下、卡片与遮罩都正常（另有一条断言守着，见 Task 6）
· **全页截图里「结尾」那一大段是空的** —— 那是**快照的已知特性**（`.ending-*` 靠
  IntersectionObserver 出 `.visible`，全页截图没滚过去 → `opacity:0`），**不是页面坏了**

#### ⚠ 与计划的两处偏差

1. **计划说「无源码改动」，实际动了两处**：`sakura/index.html` 的 `:root`（补生日变量）
   + `check_explore.py`（第 ④ 条断言「手机上放得下 + 摸得到」）。
   后者是因为 Step 4 那句「手机上能不能玩」原本只是**手工核对**，
   而它是 spec 的硬约束、又零覆盖 —— 固化成断言比每次手工看可靠。
2. **顺带查出一个工具级的坑**，见下。它比这一轮的任何页面改动都值钱。

#### ⚠⚠ 工具坑：CDP 的输入坐标 ≠ `getBoundingClientRect()` 的坐标

**症状**：在 320 宽的手机模拟下「点」游戏卡的「开始」按钮，CDP 报
`clicked (160,504)`，页面自己的 `elementFromPoint(160,504)` 也命中的是
`BUTTON.game-card-start` —— 但遮罩**不开**。

**根因**（实测数据）：

```
Emulation.setDeviceMetricsOverride(width:320, height:568, mobile:true)
  → innerWidth/innerHeight        = 355 / 631     （布局视口）
  → visualViewport.width/height   = 320 / 568     （视觉视口）
  → visualViewport.offsetTop      =  63
```

CDP 的 `Input.dispatchMouseEvent` / `dispatchTouchEvent` 坐标走的是**视觉视口**，
而页面里量出来的是**布局视口** —— 于是「照着 rect 派发」会**统一偏低 offsetTop 像素**。
实测：派发 (160,504) 的事件自报 `clientY=566`，落到了 `sakura-12` 上；
减掉 63 之后 `clientY=503`，命中的才是那个按钮。

⚠ **默认视口（不设 mobile）下 offsetTop 恒为 0**，所以现有断言全都没受影响。
但**任何将来要在手机视口上点/摸东西的断言，都必须先减这个偏移** ——
否则它会「点到了别的东西」，而且**不报错**（点空、点偏都是静默的）。
`check_explore.py` 里已加了 `_vv_offset()` 并在触摸路径上用它；
`Browser.press/release/center_of` **还没改**（它们在默认视口下是对的，
但谁要在 mobile 视口上用它们，得先自己减）。

---

### Task 9: 文档

**Files:**
- Modify: `docs/HANDOVER.md`
- Modify: `docs/theme-schema.md`（`ART` 关键字清单）
- Modify: `docs/superpowers/specs/2026-10-01-sakura-explore-design.md`（把「待确认」收敛）

- [ ] **Step 1: HANDOVER**

| 节 | 改什么 |
|---|---|
| §2.1 页面表 | Ⅷ 樱那一行注明「已接入探索系统」 |
| §2.2 功能一览 | 不必改（探索系统那一行已覆盖） |
| §2.3 | 加一轮「2026-10-01（第二轮：按位铺开）」的记录 |
| §2.4 | 改成「下一位：科斯魔 / 或按材料齐备程度选」 |
| §4.3.1 | 参照点换成 `after-sakura` |
| §10.9 | 追加一节记这一轮踩到的（尤其**取材方法**：SPA 要渲染、必须展开折叠段落） |

- [ ] **Step 2: `theme-schema.md`**

`ART` 关键字清单从 12 个变 15 个（加 `petal` / `sheath` / `blade`）。

- [ ] **Step 3: spec 收敛**

`2026-10-01-sakura-explore-design.md` 头部标注「已执行完毕」，
并把 §十「待确认」里已经有了答案的收敛掉。

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "文档：交接文档 + theme-schema 同步樱页那一轮"
```

---

### Task 10: 推送上线

**Files:**
- 无源码改动

- [x] **Step 1: push 到 dev**

⚠ **不要替需求方合并到 main**。

- [x] **Step 2:（需求方合并后）线上验证**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://elysiad.top/sakura/          # 期望 200
PYTHONIOENCODING=utf-8 python tools/cdp.py "https://elysiad.top/sakura/" size 1280x900 sleep 6000 \
  eval "(()=>{document.querySelector('[data-find-id=sakura-01]').scrollIntoView({block:'center',behavior:'instant'});return 1})()" \
  sleep 1200 \
  eval "'探索度: '+document.querySelector('.explore-count').textContent"
```

Expected: `已发现 0 / 12`。

- [x] **Step 3: 线上真机点一个可发现物**

⚠ 用 `cdp.py` 的 `click`（**真实指针事件**），**不要**用 `.click()` ——
共享层监听的是 `pointerdown` / `pointerup`，合成 `click()` 触发不了。


#### 上线记录（2026-10-02）

需求方合并 `dev` → `main`：`origin/main` = **`101996f`**（Merge PR #36），dev 已全部合进去。

| 项 | 结果 |
|---|---|
| `/sakura/` | **200** |
| **`/assets/games/sakura.js`**（**本轮新增的文件**） | **200** —— ⚠ 白名单是**静默**的，这条必须单独验（HANDOVER §6.1：不在名单里连产物都进不去、**而且不报错**） |
| 探索系统 | 滚到 `sakura-01` → 「已发现 **0 / 12**」；**真指针点一下** → 「**1 / 12**」，`found=["sakura-01"]` |
| 生日胶囊 | 面板底 = 她自己的 `rgba(7,10,20,.92)`→`rgba(19,28,51,.92)`、数字色 = `rgb(143,220,255)` —— **Task 8 那处配色补课线上生效** |
| 游戏「一瞬」 | 点卡片 → 遮罩开、`aria-hidden=false`、画布画出来了；点「收刀」关得掉 |
| 鞘中刀（Task 3 修的） | 点三次 → 「**她给了你一朵花**」+ 刀光 `lit`；**收花之后再点，仍然有「纹丝不动」** —— 那个 bug 线上确认修好了 |

⚠ Step 3 用的是 `cdp.py` 的 `click`（**真实指针事件**）—— 共享层监听的是
`pointerdown` / `pointerup`，**合成 `.click()` 触发不了**。

✅ **十个任务全部完成，`/sakura/` 已上线。**

---

## Self-Review

**1. Spec coverage** —— 逐个 spec 小节对任务：

| Spec | 任务 |
|---|---|
| §二 范围（动/不动） | 全局约束 + Task 3（唯一动文案的地方） |
| §三 鞘中刀四处 | Task 3 |
| §四 台词来源与纪律 | Task 1 |
| §五 探索系统接入 | Task 4（接线）/ Task 5（内容） |
| §五.2 落点分布 | Task 5 的表 |
| §六「一瞬」 | Task 6 |
| §七 下方区块 + 生日 | Task 4 |
| §七 接线清单 | Task 4 |
| §八 彩蛋处置 | Task 3（跨彩蛋）/ Task 7（不打架） |
| §九 验收 | Task 8 |
| §十 取舍 | 全局约束 |

**2. Step scan** —— 每一步都写清了「跑什么、期望什么」。没有「处理边界情况」这类空话。
函数体只给了 Task 3 的 `renderEndingFlower()`（因为它要**幂等**，那是签名和测试定不下来的）。

**3. Type consistency** —— `sakura-01`…`sakura-12` / `#bladeStage` / `.refused` /
`sakuraFlower` / `renderEndingFlower` / `ElysiaGames.sakura` / `ART.{petal,sheath,blade}` /
`@sakura_only` 在各任务里**同名同义**。

**4. Review Focus** —— 5 条都对到了任务（#1/#2→Task 5、#3→Task 5、#4→Task 7、#5→Task 3）。

**5. Proportion** —— 本计划约 400 行，spec 约 330 行，接近 1:1。代码块只出现在必须定死的
断言、契约与那一处函数签名上。
