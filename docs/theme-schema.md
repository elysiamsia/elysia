# `THEME` Schema —— 13 页的模板

> **这是 Task 7 / Task 8 的权威规格说明。** 动手前请连同 `docs/HANDOVER.md` §5.1 一起读。
> 最后更新：2026-09-17
>
> 为什么值得单独开一份：`THEME` **就是未来 6 位英桀页的模板** —— 抽成什么样，新页面就长什么样。
> 形状定在这里，改一次影响 13 页。

---

## 一、设计原则（比字段本身重要）

> ### **`THEME` 只装「逐页不同」的东西。逐页相同的，一律留共享层当默认值。**

`hintText`（都是「点击切换」）、`fadeMs`（都是 400）、进场阈值（都是 0.15 / `0px 0px -50px 0px`）
—— 这些 **13 页一模一样**。要是也塞进 `THEME`，那 13 页就得分头抄一遍，
**P1 就白做了**，又回到复制粘贴的老路。

所以 `THEME` 的角色是：**「这一页是谁」的那部分**。

推论：**新开一页时，先问「这个值和别人一样吗？」**
一样 → 留共享层；不一样 → 才写进 `THEME`。

---

## 二、共享层默认值清单

> ⚠ **本节的存在意义：防止后人误以为「漏写了」而重复添加。**
> 下面这些值**刻意不在 `THEME` 里**，因为 7 页（及未来的 13 页）完全一致。
> 要是哪天发现某页需要改其中一个，**先想清楚它是不是真的变成了「性格」** ——
> 如果是，再提升为 `THEME` 字段，并同步更新本表。

| 默认值 | 取值 | 定义位置 | 为什么不必逐页写 |
|---|---|---|---|
| 语录卡提示文案 | `'点击切换'` | `buildQuoteCards` | 7 页逐字一致 |
| 语录卡淡出时长 | `400` ms | `buildQuoteCards` | 7 页逐字一致 |
| 进场观察阈值 | `0.15` | `observeReveal` | 7 页逐字一致 |
| 进场 `rootMargin` | `'0px 0px -50px 0px'` | `observeReveal` | 7 页逐字一致 |
| 结尾观察阈值 | `0.3` | 调用方（子页一致） | 7 页逐字一致 |
| 结尾目标元素 | `endingQuote` / `endingAttr` / `backLink` | 调用方 | 6 个子页一致（index 是 Task 10 专项） |
| 打字机 DOM 元素 | `#typewriterText` / `#typingCursor` / `#openingSub` / `#scrollHint` | `makeTypewriter` | **7 页都有这些 id** |
| 打字机 `hintEl` 元素 | `#openingHint` | `makeTypewriter` | 该 id 只存在于 kalpas/su/villv，查不到即跳过 |

> 上表里「7 页都有」是**实测过**的（2026-09-17，逐页 `grep id="…"` 核对）。

---

## 三、Schema 完整定义

```js
  var THEME = {
    /* ── 1. 结尾星屑 ── （Task 6 已有形状，本次不动）──────────
       逐页不同：配色、粒子数、时长                                */
    endingStars: {
      count: [80, 12],        // min(80, floor(视口宽 / 12))
      size:  [0.5, 2],        // 尺寸区间 px —— ⚠ 不做 toFixed
      minO:  [0.1, 0.3],      // 最小不透明度 [lo, span]
      maxO:  [0.5, 0.5],      // 最大不透明度 [lo, span]
      dur:   [2, 4],          // 动画时长（秒）[lo, span]
      delay: [0, 5],          // 起始延迟（秒）[lo, span]
      colors: { base: '#fff', alt: '#a8d4f5', altChance: 0.3 },
      // 三色及以上用 pool 形式（两种形态与原始写法逐位对应，见 site.js 文件头）
      // colors: { pool: ['#fff', '#ffd166', '#ff6b9d'] }
    },

    /* ── 2. 语录卡 ── （Task 7 新增）─────────────────────────
       逐页不同：语录内容、aria-label。后者是**必填**，见下方说明      */
    quotes: {
      list: [
        '「…」',
        '「…」',
      ],
      ariaLabel: '救世铭文，点击切换',   // ⚠ 必填，理由见 §四
      // onShow: function (i) { … },     // 预留扩展点：index 的配音用；子页不写
    },

    /* ── 3. 打字机 ── （Task 8 新增）─────────────────────────
       逐页不同：文本 + 五个时间数值 + 两个元素开关                   */
    typewriter: {
      text: '我是凯文，持有「救世」之铭的战士。除此之外，再无其它了。',

      delay:      130,        // 每字基础延迟（ms）
      jitter:      70,        // 每字额外随机：delay + Math.random() * jitter
      startDelay: 800,        // 开打前等待（ms）
      tailDelay:  600,        // 打完 → 光标隐藏 + 副标题显示（ms）
      hintDelay: 1200,        // 副标题 → 滚动提示（ms）

      hintEl:  true,          // 是否点亮 #openingHint（kalpas/su/villv 为 true）
      preReveal: 'openingOrn',// 打字前同步点亮的装饰 id；**无则传 null**
                              //   （string | null —— 共享层做防御性判空）
    },
  };
```

---

## 四、`quotes.ariaLabel` 为什么是必填

计划原文（Task 7 Step 2）把它写死成 `'语录：' + q + '（点击切换下一句）'`。
**照那样做会静默抹掉 6 段文案**：

| 页 | 现在的 `aria-label` |
|---|---|
| aponia | 低语卡片，点击切换 |
| eden | 黄金诗句，点击切换 |
| kalpas | 鏖灭之言，点击切换 |
| kevin | 救世铭文，点击切换 |
| su | 觉者之言，点击切换 |
| villv | 台词卡片，点击切换 |

两点要害：

1. **这些文案本身就是世界观设定（Lore），不是通用 UI 标签。**
   把它们统一成「语录」，是对角色塑造的破坏 —— 不只是读屏体验问题。
2. **`snapshot.py` 测不出来。** 它采的是**计算样式**，不含属性。
   照计划做，它会报「✅ 无差异」—— 这正是 §4.4「金色徽章静默变白」那一类坑。
   为此另加了属性断言测试（见 §六）。

**决定（2026-09-17 需求方拍板）：选「参数化保留」，`ariaLabel` 为必填项。**

---

## 五、逐页数值总表

> ⚠ **照这张抄，不要依赖默认值。** 每个数字都实测于 2026-09-17。

### 5.1 打字机

| 页 | `delay` | `jitter` | `startDelay` | `tailDelay` | `hintDelay` | `hintEl` | `preReveal` |
|---|---|---|---|---|---|---|---|
| index | 160 | 80 | 800 | 600 | 1200 | ✗ | **`null`** |
| aponia | 140 | 70 | 800 | 600 | 1200 | ✗ | `openingOrn` |
| eden | 140 | 70 | 800 | 600 | 1200 | ✗ | `openingOrn` |
| kalpas | **110** | **80** | **700** | **550** | **1000** | ✓ | `openingOrn` |
| kevin | 130 | 70 | 800 | 600 | 1200 | ✗ | `openingOrn` |
| su | **150** | **80** | 800 | 600 | **1000** | ✓ | **`openingMoon`** |
| villv | 130 | 70 | **700** | **500** | **1000** | **✓** | `openingOrn` |

**加粗 = 与「多数页」不同的值**，也就是漏掉就会改变行为的那些。

三个数值怎么读：
- `delay + Math.random() * jitter` —— 每字之间的间隔
- `startDelay` —— `setTimeout(typeNext, startDelay)`，开打前的静默
- `tailDelay` —— 打完最后一个字 → 光标隐藏 / 副标题显示的等待
- `hintDelay` —— 副标题显示 → `#scrollHint` 点亮的等待（嵌在 `tailDelay` 之内）

### 5.2 `endingStars`

逐页不同处：**配色**（eden/kalpas/su/villv 用 `pool`）、kalpas 的 `count`、
kalpas/su 的 `minO`/`maxO`、su 的 `dur`。其余页与默认值相同。
各页现值以源码为准（`grep -A5 'endingStars: {' <页>`）。

### 5.3 语录卡

7 页均为 **10 条**语录。`ariaLabel` 见 §四。

---

## 六、待办与已知偏差

### 6.1 待办：`colors` 统一为 `pool` + `weights`

现存的 `{ base, alt, altChance }` 与 `{ pool: [...] }` 两种形态
**各自与原始写法逐位对应**，是 Task 6 刻意的设计（见 `site.js` 文件头：
用四种颜色去凑 eden 的 0.35 会变成 0.25）。

未来若要加更多配色变体，可统一为 `pool` + 可选 `weights`。
**标记为 TODO，不阻塞当前进度** —— 现在改会触碰 Task 6 已验证的随机数路径。

### 6.2 属性断言测试（✅ 已落地）

针对 §四 那类「快照测不出来」的静默回归，新增独立断言：

```bash
PYTHONIOENCODING=utf-8 python tools/check_aria_labels.py
```

**断言两件事**：①页面源码声明 ↔ 浏览器 DOM 实际值一致（抓「参数没传到位」）；
②实际值等于该文件 `EXPECTED` 的登记值（抓「文案被改掉」）。
7 页全覆盖（含 index 那份 inline 实现的）。

> 已做**负向测试**（一个永远通过的测试等于没测）：分别模拟
> 「文案被统一成通用值」与「共享层忽略 `ariaLabel` 参数」两种情况，
> 确认脚本都会以退出码 1 失败。

### 6.3 不在本 schema 范围内的

- **`index.html` 不参与 Task 7**：它的语录卡有配音逻辑（`window.QUOTE_AUDIO`），
  结尾观察器用 `epilogueQuote` 且没有 `backLink`。归 Task 10 专项。
- **`armor.html` 不参与 Task 7/8**：异形页，归 Task 11。
- **`villv` 缺粒子 resize 守卫**：Inventory R10 已记，**保持现状，不要顺手补**。

---

## 七、给未来 6 位英桀的性格锚点

> ⚠ **以下仅为注释级指引，不是实现依据。**
> 遵循项目「绝不编造」纪律：**不预设具体 ms 数值** —— 那些要等对应页面开工时按实际观感实测确定。
> 本表只提供**相对基调**，供届时定数值时参考。

| 英桀 | 性格锚点（定性） | 可能的落点 |
|---|---|---|
| 樱 | 快、利落 | 剑士气质，`jitter` 宜偏低（少犹豫） |
| 科斯魔 | 沉、缓、断续 | 少年感 + 犹豫，`startDelay` 可长 |
| 梅比乌斯 | 极快、压迫 | 蛇的嘶吐，`delay` 下限候选 |
| 格蕾修 | 慢、柔和 | 绘画节奏，`jitter` 可偏高（模拟笔触） |
| 华 | 稳、匀速 | 武者定力，`jitter` 宜最低 |
| 帕朵菲莉丝 | 轻快、跳跃 | 猫系灵动，`tailDelay` 可短 |

**为什么连打字速度也要进 `THEME`**：在这 7 页里，
kalpas（110 / 80）和 su（150 / 80）读起来就是**两种性格** ——
前者急促、后者从容。**打字速度也是角色塑造的一部分**，不是随手填的实现细节。

---

## 八、这份 schema 与 P1 计划的六处偏差

> 记录在此，供后续任务（Task 9–12）参考 ——
> 计划在 Task 7/8 上有**过度泛化**倾向，遇到类似表述请先实测。

| # | 计划的说法 | 实测 | 影响 |
|---|---|---|---|
| ① | `aria-label` 写死为通用文案 | 6 页各有一份 Lore 文案 | **P0 可访问性回归，快照测不出** → §四 |
| ② | `hintEl` 为 kalpas/su 独有 | **villv 也有** | villv 提示不再点亮 |
| ③ | `tailDelay` 写死 600 | kalpas **550** / villv **500** | 两页收尾节奏改变 |
| ④ | `hintDelay` 默认 1200 | kalpas/su/villv 是 **1000** | 三页提示点亮变慢 |
| ⑤ | `startDelay` 默认 800 | kalpas/villv 是 **700** | 两页入场变慢 |
| ⑥ | 未提及 | aponia/eden/kalpas/kevin/villv 有 `#openingOrn`、su 有 `#openingMoon`，**在打字前同步点亮** | **6 页入场装饰不亮（演出事故）** → `preReveal` |
