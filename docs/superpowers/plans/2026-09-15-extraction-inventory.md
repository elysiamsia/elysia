# 8 页 CSS/JS 抽取分析 · Inventory

> 目标：把 8 个页面各自内联复制的 CSS/JS 收敛为共享的 `assets/site.css` + `assets/site.js`。
> 本文档只做**抽取前分析**，不改动任何现有文件。
> 生成日期：2026-09-15 · 基准 commit 状态：工作区当前内容

## 0. 覆盖范围与方法

### 0.1 目标文件

| 代号 | 路径 | 字节 | 总行数 | `<style>` 块 | `<script>` 块 |
|---|---|---|---|---|---|
| index | `index.html` | 52680 | 1156 | 3 个（L11-377 / L1006-1014 / L1074-1091） | 4 个（L575-969 / L970-1004 / L1015-1070 / L1107-1154） |
| armor | `armor.html` | 12711 | 233 | 1 个（L8-105） | 1 个（L130-232） |
| aponia | `aponia/index.html` | 30590 | 675 | 1 个（L9-221） | 1 个（L384-673） |
| eden | `eden/index.html` | 28651 | 636 | 1 个（L9-222） | 1 个（L385-634） |
| kalpas | `kalpas/index.html` | 41060 | 917 | 1 个（L9-287） | 1 个（L487-915） |
| kevin | `kevin/index.html` | 30195 | 674 | 1 个（L9-221） | 1 个（L382-672） |
| su | `su/index.html` | 41329 | 931 | 1 个（L9-291） | 1 个（L489-929） |
| villv | `villv/index.html` | 54820 | 1169 | 1 个（L9-397） | 1 个（L612-1167） |

> 注意：`index.html` 的样式被拆在 3 个块里（第 2 块是 `#heroToast`，第 3 块是 `#bdayEgg` 彩蛋），抽取时要三块一起算。其余 7 页都是单块。

### 0.2 比对方法

- 用脚本按**规则粒度**切分每个 `<style>`：先去注释（注释替换为等长空白，保证行号不漂移），再做 `{}` 深度匹配，得到 `(选择器, 声明体, 起始行号)`。
- 归一化：折叠空白、`:` 与 `;` 两侧空格、去掉末尾分号。**不改变声明顺序、不内联变量。**
- 分类规则：
  - **A 组**：同名选择器在出现它的所有页面里归一化结果**完全一致**。
  - **B 组**：同名选择器出现在 ≥2 页，但声明体有差异。
  - **C 组**：只出现在单一页面的选择器。
- JS 同理：按 `function NAME(){...}` 花括号匹配抽函数体，去注释后归一化比对。

### 0.3 一句话结论

| 组 | 数量 |
|---|---|
| 选择器总数（去重） | 303 |
| **A 组**（可抽出，跨页完全一致） | **31** |
| **B 组**（同选择器，值不同 → 留页面主题覆盖） | **47** |
| **C 组**（页面专属） | **225** |
| JS 具名函数总数 | 38 |
| JS 跨页同名且**完全一致**的函数 | **0** |
| JS 跨页同名但实现不同的函数 | 8 |

---

# 1. CSS 共用子集

## 1.1 A 组 · 可抽出（31 条）

「完全一致」= 归一化后逐字节相同（含 `var(--x)` 的写法、含 `0.5rem` vs `.5rem` 这类写法差异）。
**凡是用 `var(--xxx)` 的地方一律照抄，不要内联颜色** —— 颜色由各页 `:root` 提供（见 §1.4）。

### A 组清单

| # | 选择器 | 出现在 | 页面数 |
|---|---|---|---|
| 1 | `*,*::before,*::after` | 全部 8 页 | 8 |
| 2 | `html` | 全部 8 页 | 8 |
| 3 | `::-webkit-scrollbar` | 全部 8 页 | 8 |
| 4 | `.timeline-node.visible` | 全部 8 页 | 8 |
| 5 | `.timeline-node:nth-child(odd)` | 全部 8 页 | 8 |
| 6 | `.timeline-node:nth-child(even)` | 全部 8 页 | 8 |
| 7 | `.timeline-node:nth-child(odd) .timeline-card` | 全部 8 页 | 8 |
| 8 | `.timeline-node:nth-child(even) .timeline-card` | 全部 8 页 | 8 |
| 9 | `::-webkit-scrollbar-track` | 除 armor 外 7 页 | 7 |
| 10 | `.typing-cursor.hidden` | 除 armor 外 7 页 | 7 |
| 11 | `@keyframes blink-cursor` | 除 armor 外 7 页 | 7 |
| 12 | `.opening-subtitle.visible` | 除 armor 外 7 页 | 7 |
| 13 | `@keyframes chevron-bounce` | 除 armor 外 7 页 | 7 |
| 14 | `.section-title-wrap` | 除 armor 外 7 页 | 7 |
| 15 | `.profile-card-inner` | 除 armor 外 7 页 | 7 |
| 16 | `.profile-divider` | 除 armor 外 7 页 | 7 |
| 17 | `.profile-label` | 除 armor 外 7 页 | 7 |
| 18 | `.profile-value` | 除 armor 外 7 页 | 7 |
| 19 | `.quotes-grid` | 除 armor 外 7 页 | 7 |
| 20 | `.quote-text.fading` | 除 armor 外 7 页 | 7 |
| 21 | `.section-ending` | 除 armor 外 7 页 | 7 |
| 22 | `.ending-stars` | 除 armor 外 7 页 | 7 |
| 23 | `.ending-star` | 除 armor 外 7 页 | 7 |
| 24 | `@keyframes twinkle` | 除 armor 外 7 页 | 7 |
| 25 | `.ending-quote.visible` | 除 armor 外 7 页 | 7 |
| 26 | `.ending-fade` | 除 armor 外 7 页 | 7 |
| 27 | `@keyframes card-rotate` | index,aponia,eden,kevin,su,villv（**无 kalpas**） | 6 |
| 28 | `.back-link.visible` | aponia,eden,kalpas,kevin,su,villv（**无 index**） | 6 |
| 29 | `.opening-hint.visible` | kalpas,su,villv | 3 |
| 30 | `.ending-sub` | kalpas,su | 2 |
| 31 | `.ending-sub.visible` | kalpas,su | 2 |

> `armor.html` 是唯一的「异形页」：没有 `.content-section` / `.profile-card` / `.opening-*` / `.quotes-grid` 结构，只共享 timeline 骨架和滚动条基础样式。抽取时 armor 只能吃到第 1-8 条。

### A 组合并后的完整 CSS 源码（`assets/site.css` 初稿）

```css
/* ==========================================================================
   assets/site.css — 8 页共享样式
   本文件只放「跨页逐字节一致」的规则（A 组，31 条）。
   颜色/主题差异一律通过 var(--*) 注入，由各页 <style> 的 :root 覆盖块提供。
   不要在此文件内联任何具体色值（除极少数与主题无关的 neutral，见 §3 风险）。
   ========================================================================== */

/* ---------- 0. 基础重置 ---------- */
*,*::before,*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

/* ---------- 1. 滚动条 ---------- */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: var(--bg-abyss);
}

/* ---------- 2. 开场：打字机 + 副标题 + 滚动提示 ---------- */
.typing-cursor.hidden {
  display: none;
}

@keyframes blink-cursor {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}

.opening-subtitle.visible {
  opacity: 1;
}

@keyframes chevron-bounce {
  0%, 100% { transform: rotate(45deg) translateY(0); }
  50%      { transform: rotate(45deg) translateY(6px); }
}

.opening-hint.visible {
  opacity: .65;
}

/* ---------- 3. 通用小节标题 ---------- */
.section-title-wrap {
  text-align: center;
  margin-bottom: 3.5rem;
}

/* ---------- 4. 人物档案卡 ---------- */
/* 注意：.profile-card 本体在 B 组，本文件不接管 */
.profile-card-inner {
  position: relative;
  z-index: 1;
}

.profile-divider {
  width: 100%;
  height: 1px;
  margin: 1.5rem 0;
  background: linear-gradient(90deg, transparent, var(--glass-border), var(--glass-border2), transparent);
}

.profile-label {
  color: var(--text-muted);
  white-space: nowrap;
  font-weight: 400;
}

.profile-value {
  color: var(--text);
  font-weight: 300;
}

@keyframes card-rotate {
  to { transform: rotate(360deg); }
}

/* ---------- 5. 时间轴骨架 ---------- */
.timeline-node.visible {
  opacity: 1;
  transform: translateY(0);
}

.timeline-node:nth-child(odd) {
  flex-direction: row;
}

.timeline-node:nth-child(even) {
  flex-direction: row-reverse;
}

.timeline-node:nth-child(odd) .timeline-card {
  margin-right: auto;
}

.timeline-node:nth-child(even) .timeline-card {
  margin-left: auto;
}

/* ---------- 6. 语录卡 ---------- */
.quotes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.2rem;
  max-width: 1000px;
  margin: 0 auto;
}

.quote-text.fading {
  opacity: 0;
}

/* ---------- 7. 结尾 ---------- */
.section-ending {
  position: relative;
  z-index: 2;
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 4rem 2rem;
  background: linear-gradient(180deg, transparent, var(--bg-abyss) 30%, var(--bg-abyss));
}

.ending-quote.visible {
  opacity: 1;
  transform: translateY(0);
}

.ending-attr.visible {
  /* 严格说这条属于 B 组：index:225 写 opacity:0.7，其余 6 页写 .7 —— 数值等价，
     归一化前导零后即可并入 A 组（见 §3-R1）。这里先按无前导零写法给出。 */
  opacity: .7;
}

.ending-sub {
  margin-top: 1.6rem;
  font-size: .85rem;
  color: var(--text-muted);
  letter-spacing: .1em;
  line-height: 2;
  max-width: 560px;
  opacity: 0;
  transition: opacity 1s ease;
  min-height: 1.4em;
}

.ending-sub.visible {
  opacity: .85;
}

.ending-stars {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

/* 每颗星的 --dur / --delay / --min-o / --max-o 由 JS 内联注入，见 §2.4 */
.ending-star {
  position: absolute;
  border-radius: 50%;
  background: #fff;
  animation: twinkle var(--dur) ease-in-out infinite;
  animation-delay: var(--delay);
}

@keyframes twinkle {
  0%, 100% { opacity: var(--min-o); }
  50%      { opacity: var(--max-o); }
}

.ending-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 120px;
  background: linear-gradient(transparent, var(--bg-abyss));
  pointer-events: none;
}

/* ---------- 8. 返回链接（子页专用，index 无 .back-link） ---------- */
.back-link.visible {
  opacity: 1;
  transition: opacity 1.5s ease 1.2s, background .3s ease, box-shadow .3s ease, transform .3s ease;
}
```

### A 组各规则在源文件中的**精确落点**（脚本按选择器文本匹配，可直接核对）

> 格式：`页:行`。行号 = 该选择器关键字所在行。

| 选择器 | 页面数 | 落点 |
|---|---|---|
| `*,*::before,*::after` | 8 | index:12 · armor:9 · aponia:10 · eden:10 · kalpas:10 · kevin:10 · su:10 · villv:10 |
| `html` | 8 | index:22 · armor:18 · aponia:19 · eden:19 · kalpas:18 · kevin:19 · su:19 · villv:21 |
| `::-webkit-scrollbar` | 8 | index:27 · armor:24 · aponia:24 · eden:24 · kalpas:23 · kevin:24 · su:24 · villv:26 |
| `.timeline-node.visible` | 8 | index:139 · armor:64 · aponia:127 · eden:127 · kalpas:189 · kevin:127 · su:169 · villv:183 |
| `.timeline-node:nth-child(odd)` | 8 | index:140 · armor:65 · aponia:128 · eden:128 · kalpas:190 · kevin:128 · su:170 · villv:184 |
| `.timeline-node:nth-child(even)` | 8 | index:141 · armor:66 · aponia:129 · eden:129 · kalpas:191 · kevin:129 · su:171 · villv:185 |
| `.timeline-node:nth-child(odd) .timeline-card` | 8 | index:156 · armor:77 · aponia:142 · eden:142 · kalpas:204 · kevin:142 · su:184 · villv:198 |
| `.timeline-node:nth-child(even) .timeline-card` | 8 | index:157 · armor:78 · aponia:143 · eden:143 · kalpas:205 · kevin:143 · su:185 · villv:199 |
| `::-webkit-scrollbar-track` | 7 | index:28 · aponia:25 · eden:25 · kalpas:24 · kevin:25 · su:25 · villv:27 |
| `.typing-cursor.hidden` | 7 | index:49 · aponia:45 · eden:45 · kalpas:92 · kevin:45 · su:52 · villv:57 |
| `@keyframes blink-cursor` | 7 | index:50 · aponia:46 · eden:46 · kalpas:93 · kevin:46 · su:53 · villv:58 |
| `.opening-subtitle.visible` | 7 | index:55 · aponia:51 · eden:51 · kalpas:98 · kevin:51 · su:58 · villv:63 |
| `@keyframes chevron-bounce` | 7 | index:66 · aponia:62 · eden:62 · kalpas:114 · kevin:62 · su:74 · villv:79 |
| `.section-title-wrap` | 7 | index:73 · aponia:69 · eden:69 · kalpas:121 · kevin:69 · su:81 · villv:86 |
| `.profile-card-inner` | 7 | index:103 · aponia:96 · eden:96 · kalpas:138 · kevin:96 · su:109 · villv:113 |
| `.profile-divider` | 7 | index:113 · aponia:105 · eden:105 · kalpas:167 · kevin:105 · su:120 · villv:124 |
| `.profile-label` | 7 | index:118 · aponia:107 · eden:107 · kalpas:169 · kevin:107 · su:122 · villv:126 |
| `.profile-value` | 7 | index:119 · aponia:108 · eden:108 · kalpas:170 · kevin:108 · su:123 · villv:127 |
| `.quotes-grid` | 7 | index:170 · aponia:148 · eden:148 · kalpas:210 · kevin:148 · su:190 · villv:204 |
| `.quote-text.fading` | 7 | index:196 · aponia:163 · eden:163 · kalpas:225 · kevin:163 · su:205 · villv:219 |
| `.section-ending` | 7 | index:202 · aponia:167 · eden:167 · kalpas:229 · kevin:167 · su:209 · villv:259 |
| `.ending-stars` | 7 | index:207 · aponia:172 · eden:172 · kalpas:234 · kevin:172 · su:214 · villv:264 |
| `.ending-star` | 7 | index:208 · aponia:173 · eden:173 · kalpas:235 · kevin:173 · su:215 · villv:265 |
| `@keyframes twinkle` | 7 | index:213 · aponia:174 · eden:174 · kalpas:236 · kevin:174 · su:216 · villv:266 |
| `.ending-quote.visible` | 7 | index:220 · aponia:180 · eden:180 · kalpas:242 · kevin:180 · su:222 · villv:272 |
| `.ending-fade` | 7 | index:226 · aponia:196 · eden:196 · kalpas:262 · kevin:196 · su:242 · villv:288 |
| `@keyframes card-rotate` | 6 | index:102 · aponia:91 · eden:91 · kevin:91 · su:104 · villv:108 |
| `.back-link.visible` | 6 | aponia:194 · eden:194 · kalpas:260 · kevin:194 · su:240 · villv:286 |
| `.opening-hint.visible` | 3 | kalpas:103 · su:63 · villv:68 |
| `.ending-sub` | 2 | kalpas:243 · su:223 |
| `.ending-sub.visible` | 2 | kalpas:247 · su:227 |

---

## 1.2 B 组 · 同选择器但值不同（47 条）

这些**必须留在各页**做主题覆盖（或用「共享基础 + 页面 override」双层写法）。
下表按「涉及页数」降序。`~` 表示值不同，`+` 表示该页多出来的声明，`-` 表示该页少掉的声明。

### B-1 · 8 页都有，但每页值都不同（核心主题规则）

| 选择器 | 差异摘要 |
|---|---|
| `:root` | 见 §1.4 完整变量表。8 页的变量名集合都不一样（17~23 个）。 |
| `body` | index/aponia/eden/kalpas/kevin/su/villv 都是 `background:var(--bg-abyss)`；**armor:19 用的是 `background:linear-gradient(180deg,var(--bg-abyss) 0%,var(--bg-deep) 25%,var(--bg-purple) 55%,var(--bg-deep) 100%)` + `background-attachment:fixed`**。 |
| `::-webkit-scrollbar-thumb` | 底色各异：index:29=`--purple-deep`、armor:25=`--purple-deep`、aponia:26=`--violet-deep`、eden:26=`--gold-warm`、kalpas:25=`--blood`、kevin:26=`--ice-deep`、su:26=`--jade-deep`、villv:28=`--magenta-deep`。`border-radius:3px` 一致。 |
| `.timeline` | 7 页（除 armor）完全一致 `max-width:800px;...;padding:2rem 0`；armor:60 是 `z-index:2;max-width:900px;margin:3.5rem auto 0;padding:1rem 1.5rem 4rem`。 |
| `.timeline-node` | 6 页（aponia/eden/kalpas/kevin/su/villv）一致；index:135 只是 `0.7s`→`.7s` 写法差异（**视觉等价**）；armor:63 是真差异 `margin-bottom:2.6rem` / `translateY(24px)` / `.6s`。 |
| `.timeline-card` | 7 页只在 `box-shadow` 颜色 alpha 上不同；**armor:69 另有 `width:calc(50% - 2.4rem)`、`padding:1.2rem 1.4rem`、`cursor:pointer`、`transition`** —— 结构差异，不能合并。 |
| `.timeline-dot` | index/eden/kalpas/villv 是 14px，**aponia/kevin/su 是 12px**，**armor 是 13px + `top:.6rem` + 无 transition**；border 色与 box-shadow 各页不同。 |
| `.timeline-line` | **aponia/kevin/su 是 `width:1px`，其余是 `2px`**；渐变色标各页不同（armor 的 stop 是 8%/92%，其他是 10%/90%；kalpas 是 4 段、villv 是 5 段）。 |
| `.timeline-node.visible .timeline-dot` | `background` 各页主题色不同（index/armor=`--pink`，aponia=`--violet`，eden/villv=`--gold`，kalpas=`--ember`，kevin=`--ice`，su=`--jade`）。 |
| `@media(max-width:768px)` | 见 §1.2-B6。 |
| `@media(max-width:480px)` | 6 页一致；index 多一个第二段（L301 的 `.af-badge`/`.af-meta`）；villv:391 多 `.persona-grid{grid-template-columns:1fr}`。 |

### B-2 · 7 页（除 armor）

| 选择器 | 差异摘要 |
|---|---|
| `.section-opening` | 7 页都有；**6 个子页都带 `padding-bottom:calc(2rem + env(safe-area-inset-bottom))`，index 没有**；背景 5 种写法（kalpas/su/villv 还叠了 `radial-gradient` 光斑）。 |
| `.opening-title` | 字号/字距/颜色/min-height/max-width 每页都不同（index 是 `clamp(2rem,6vw,4rem)` + `min-height:1.4em` 无 max-width；子页都在 1.35~1.6rem 起、`min-height:2.6~3.2em`、有 max-width）。 |
| `.opening-subtitle` | 5 页一致（aponia/eden/kalpas/kevin/villv）；**index:51 是 `clamp(0.9rem,2.5vw,1.3rem)`+`0.3em`，su:54 是 `.4em`**。 |
| `.typing-cursor` | 颜色各页不同；其余一致（含 `0.8s` vs `.8s` 写法差异）。 |
| `.section-title` | 颜色/阴影各页不同；**kalpas:122 是 `font-weight:400`（其余 300），su:82 是 `letter-spacing:.24em`（其余 `.2em`）**。 |
| `.section-title-line` | 只有渐变色不同（`var(--pink)` / `--violet` / `--gold` / `--crimson` / `--ice-deep` / `--lamp-deep` / `--accent`）。 |
| `.profile-card` | 盒阴影 + `animation:glow-pulse Ns` 各页不同（aponia 7s / eden 6s / kevin 7s / su 8s / villv 5s）。**index 拆成两条：L88 定义外观、L264 单独加 `animation:glow-pulse 6s`；kalpas:130 完全没有 glow-pulse 动画。** |
| `.profile-name` | 颜色各页不同；**kalpas/su/villv 额外带 `cursor:pointer;user-select:none`**（有名字点击彩蛋）；**kalpas `font-weight:400`、villv `font-weight:300`（其余 200）**；**su 字号更大 `clamp(2rem,5.5vw,3rem)` 且带 `text-indent:.3em`**；**villv 用渐变裁字 `background-clip:text` + `color:transparent`**。 |
| `.profile-name-en` | 颜色/字距/字号各页不同；**kalpas 去掉了 text-shadow 且 `margin-bottom:1rem`（其余 2rem）**；**su 用 `filter:brightness(1.35)` 且字号 `.85rem` 起**；**kevin 字号 `.85rem` 起**。 |
| `.profile-grid` / `.profile-desc` / `.quote-hint` / `.quote-text` / `.timeline-card p` / `.scroll-hint` / `.scroll-hint span` / `.scroll-hint.visible` / `.ending-attr.visible` | **仅 `0.5rem` vs `.5rem` 这类前导零写法差异，视觉 100% 等价** → 见 §3-R1，合并安全。 |
| `.profile-value .highlight` | 颜色各页不同（index=`--pink`，aponia=`--violet`，eden/villv=`--gold`，kalpas=`--crimson`，kevin=`--ice`，su=`--jade`）。 |
| `.quote-card` | 只在 `box-shadow` 颜色 alpha 不同；villv:205 是 `rgba(255,209,107,.04)`（**写成 107 而不是 102，疑似笔误**，见 §3-R8）。 |
| `.quote-card:hover` | 阴影各页不同；**villv:213 的 transform 是 `translateY(-3px) rotate(.3deg)`（多一个微旋转）**；kalpas 阴影第二段是 `rgba(0,0,0,.25)`（其余 `.2`）。 |
| `.quote-card::after` | 只有 `radial-gradient` 的第一个色值不同。 |
| `.scroll-chevron` | border 色各页不同；**su:70 动画是 `2.4s`（其余 2s）**。 |
| `.ending-attr` | 只在 `margin-top` 上分两派：**kalpas:248 / su:228 是 `2.2rem`，其余 5 页 `2.5rem`**；index 还有 `0.85rem`/`0.25em`/`0.8s` 写法差异。 |
| `.ending-quote` | 每页都不同：kalpas `clamp(1.3rem,3.4vw,1.9rem);font-weight:400;.14em;cursor:pointer`，villv `clamp(1.15rem,3vw,1.7rem);cursor:pointer`，su `cursor:pointer;.14em`，kevin `max-width:680px`，index `max-width:600px`。 |
| `.back-link` | **armor:28 是另一套完全不同的按钮**（`inline-block`、`--text-muted`、`.78rem`、无 `opacity:0`）；6 个子页是同一模板但颜色/背景色不同（su 用 `--glass-border2`，其余用 `--glass-border`）。 |
| `.back-link:hover` | armor 是 `color/border-color`；6 个子页都是 `background + box-shadow + translateY(-2px)` 但色值不同。 |
| `.content-section` | 只有背景 `rgba()` 的底色不同（各页 `--bg-abyss` 的等值 RGB）。 |

### B-3 · 6 页

| 选择器 | 差异摘要 |
|---|---|
| `.profile-card::before` | 只有 `conic-gradient` 色值与 `animation` 时长不同（index 20s / eden 22s / aponia 26s / kevin 26s / su 30s / villv 16s）。**villv 是 4 段渐变，其余 3 段。** |
| `@keyframes glow-pulse` | 6 页都有但 box-shadow 色值全不同；**su:105 / villv:109 的 50% 帧是 `0 0 65px`，其余是 `0 0 60px`**。 |

### B-4 · 5 页

| 选择器 | 差异摘要 |
|---|---|
| `.opening-ornament` | aponia/eden/kevin/kalpas/villv 各有各的字号、颜色、字距、下边距（villv 最大 `1.2rem`/`.8em`/`1.4rem`）。字段**顺序也不同**（villv 的 `color` 在末尾）。 |

### B-5 · 4 页 / 3 页 / 2 页

| 选择器 | 差异摘要 |
|---|---|
| `.section-title-mark` | aponia/kevin/su 是 `opacity:.85` + 各色；**kalpas:127 用 `filter:brightness(1.5)` 取代 opacity**。 |
| `.opening-hint` | kalpas/su 一致；**villv:64 是 `.15em` / `.9rem`**（其余 `.14em` / `1rem`）。 |
| `.profile-name:hover` | kalpas `rgba(255,59,48,.7)` vs su `rgba(45,212,191,.55)`。 |
| `@media(max-width:600px)` | kalpas `#kpToast{...}` vs su `#suToast{...}`（同结构，ID 不同）。 |

### B-6 · `@media(max-width:768px)` 逐页实际内容

7 个子页高度同构，差异集中在 timeline 缩进距离与页专属补丁：

| 页 | 行号 | 与「标准版」的差异 |
|---|---|---|
| aponia/eden/kevin/su | 206 / 207 / 206 / 276 | 标准版：`.timeline-line{left:1.5rem}`、`.timeline-dot{left:1.5rem}`、卡片 `width:calc(100% - 3.5rem);margin-left:3.5rem`、`.quotes-grid{grid-template-columns:1fr}`、`.profile-grid{...}` |
| kalpas | 271 | 标准版 **+ `#rageHud .rage-bar{width:60px}`** |
| villv | 379 | 标准版（去 `.quotes-grid`？**否，保留**）+ `.persona-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}` + `#vvToast{white-space:normal;text-align:center;line-height:1.6}` |
| index | 239 | 标准版 **+ `.timeline-node .timeline-index{left:1.5rem}`**（这条是 index 专属）；另有第二条 L372 `.hereos-field{gap:.8rem} .hero-card{width:132px;min-height:150px}` |
| armor | 97 | **独立一套**：`left:1.3rem`、卡片 `calc(100% - 2.8rem);margin-left:2.8rem`，且**没有 `.quotes-grid` / `.profile-grid` 两条** |

---

## 1.3 C 组 · 页面专属（225 条）

只出现在单一页面的选择器。这些**不进 site.css**，原样留在各页。

### index（59 条）

```
L30   ::-webkit-scrollbar-thumb:hover      L32   #petalCanvas
L82   .section-title-petal                 L121  .profile-value .gold
L126  .profile-desc .emoji-heart           L163  .timeline-node .timeline-index
L232  .ripple-petal                        L257  @keyframes float-gentle
L267  .armor-featured                      L268  .armor-featured-row
L275  .armor-featured-row:hover            L276  .af-badge
L280  .af-badge.armor                      L281  .af-badge.skin
L282  .af-badge.story                      L283  .af-badge.event
L284  .af-main                             L285  .af-title
L286  .af-title .t                         L287  .af-title .sub
L288  .af-meta                             L289  .af-meta b
L290  .af-meta .v                          L291  .af-desc
L292  .armor-featured-more                 L300  .armor-featured-more:hover
L308  .hereos-field                        L314  .hero-card
L326  @keyframes hero-float                L330  .hero-card:hover
L332  .hero-rank                           L338  .hero-signet
L343  .hero-name                           L344  .hero-en
L346  .hero-lore                           L352  .hero-card.open .hero-lore
L355  .hero-lore-title                     L360  .epilogue
L369  .epilogue:hover                      L370  .epilogue-msg
L371  .epilogue-msg.fade
--- 以下来自 index 的第 2、3 个 <style> 块 ---
L1007 #heroToast                           L1013 #heroToast.show
L1075 #bdayEgg                             L1076 #bdayEgg:hover
L1077 @keyframes bdayFloat                 L1078 .bday-dot
L1079 @keyframes bdayPulse                 L1080 #bdayPanel
L1081 #bdayPanel.open                      L1082 .bday-cake
L1083 .bday-title                          L1084 .bday-date
L1085 .bday-timer                          L1086 .bday-cell
L1087 .bday-num                            L1088 .bday-unit
L1089 .bday-msg                            L1090 .bday-msg .pink
```

### armor（34 条）

```
L27   .page-head        L30   .page-title       L31   .page-sub
L34   .filter-bar       L41   .filter-chip      L47   .filter-chip.on
L48   .filter-chip.on.armor   L49  .filter-chip.on.skin   L50  .filter-chip.on.story
L51   .filter-chip.on.event   L52  .filter-chip .cnt     L53  .filter-toggles
L54   .filter-toggle    L55   .filter-toggle.on  L56   .clear-btn
L57   .clear-btn:hover  L76   .timeline-card:hover       L79   .card-top
L80   .type-badge       L81   .type-badge.armor L82   .type-badge.skin   <-- L82 用到未定义的 --gold-soft
L83   .type-badge.story L84   .type-badge.event L85   .card-title
L86   .card-sub        L87   .card-meta        L88   .card-meta b
L89   .card-meta .v    L90   .card-desc        L91   .card-detail
L92   .card-image      L93   .card-image img   L94   .timeline-card.open .card-detail
L95   .timeline-card.open .card-image
```

### aponia（3 条）

```
L28   #fateCanvas      L110  .profile-value .candle     L199  .ripple-thread
```

### eden（4 条）

```
L28   #goldCanvas      L75   .section-title-note        L110  .profile-value .winered
L199  .ripple-note
```

### kalpas（30 条）

```
L27   #emberCanvas       L30   #rageHud          L37   #rageHud.hot
L38   #rageHud .rage-label  L39 #rageHud .rage-bar  L42 #rageHud .rage-fill
L47   #rageOverlay       L51   #rageOverlay.lit  L52   @keyframes rage-pulse
L53   body.raging        L54   @keyframes rage-quake  L60 #kpToast
L69   #kpToast.show      L70   #kpToast.roar     L139  .profile-head
L140  .mask-wrap         L141  .mask-wrap:hover  L142  .mask-wrap.shake
L143  @keyframes mask-shake  L144 .mask-crack     L145 .mask-wrap.cracked-1 .c1
L146  .mask-wrap.cracked-2 .c1,.mask-wrap.cracked-2 .c2
L147  .mask-wrap.cracked-3 .c1,.mask-wrap.cracked-3 .c2,.mask-wrap.cracked-3 .c3
L148  .mask-wrap.shattered   L149 @keyframes mask-out  L150 .mask-secret
L155  .mask-secret.reveal    L156 .mask-secret .warm  L172 .profile-value .flamec
L265  .ripple-spark   <-- 定义了但 JS 从未使用（见 §3-R5）
```

### kevin（3 条）

```
L28   #frostCanvas     L110  .profile-value .flame      L199  .ripple-shard
```

### su（22 条）

```
L28   #bodhiCanvas     L40   .opening-moon       L45   .opening-moon.visible
L88   .section-sub     L125  .profile-value .lamp  L132  .muyu-wrap
L133  .muyu-stage      L134  .muyu-stage svg     L135  .muyu-stage.struck svg
L136  .muyu-hint       L137  .meru-count         L141  .meru-float
L146  @keyframes meru-rise  L151 .muyu-glow      L156  .muyu-glow.lit
L245  #suToast         L254  #suToast.show       L255  #suToast.golden
L259  .water-ring      L265  @keyframes ring-spread  L269 #shaVeil
L273  #shaVeil.lit
```

### villv（70 条）

```
L30   #confettiCanvas    L48  .opening-ornament.visible   L49 .opening-ornament .gear
L50   @keyframes gear-spin  L92 .section-title-suit       L129 .profile-value .pink
L130  .profile-value .mint  L137 .persona-grid            L141 .persona-card
L149  .persona-card:hover   L150 .persona-card.active     L151 .persona-head
L152  .persona-icon      L158  .persona-name              L159 .persona-brief
L160  .persona-detail    L165  .persona-card.active .persona-detail
L166  .persona-note      L170  .persona-note .dim         L223 .draw-wrap
L224  .draw-btn          L232  .draw-btn:hover            L233 .draw-btn:active
L234  .draw-stage        L237  .draw-card                 L246 .draw-card.reveal
L247  .draw-card .suit-big  L248 .draw-card .rank-big     L249 .draw-card.red
L250  .draw-card.black   L251  .draw-fortune              L255 .draw-fortune.visible
L256  .draw-tip          L291  #vvToast                   L300 #vvToast.show
L303  .ripple-confetti   <-- 定义了但 JS 从未使用（见 §3-R5）
L309  body.kk-locked     L310  #kkOverlay                 L311 #kkOverlay.on
L312  .kk-vignette       L313  #kkOverlay.phase-alert .kk-vignette
L314  @keyframes kk-pulse   L315 .kk-banner              L321 #kkOverlay.phase-alert .kk-banner
L322  @keyframes kk-blink   L323 @keyframes kk-jitter    L328 .kk-count
L334  #kkOverlay.phase-count .kk-count
L335  #kkOverlay.phase-count .kk-banner
L336  #kkOverlay.phase-count .kk-vignette   L337 .kk-count.pop
L338  @keyframes kk-pop   L339  .kk-flash                 L340 #kkOverlay.phase-boom .kk-flash
L341  @keyframes kk-flash L342  #kkOverlay.phase-boom .kk-banner,#kkOverlay.phase-boom .kk-count,#kkOverlay.phase-boom .kk-vignette
L343  body.kk-shaking    L344  @keyframes kk-quake        L348 .kk-after
L353  #kkOverlay.phase-after .kk-after   L354 #kkOverlay.phase-after .kk-flash
L355  .kk-line           L359  .kk-line.show              L360 .kk-line.kk-big
L361  .kk-line.kk-small  L362  .kk-reload                L369 .kk-reload.show
L370  .kk-reload:hover   L371  .kk-ember                 L376 @keyframes kk-ember-rise
```

---

## 1.4 `:root` 变量表：并集、差异、以及「未定义却使用」

### 1.4.1 规模

| 页 | 定义的变量数 | 文件:行 |
|---|---|---|
| index | 23 | `index.html:13-17` |
| armor | 19 | `armor.html:10-16` |
| aponia | 17 | `aponia/index.html:11-16` |
| eden | 17 | `eden/index.html:11-16` |
| kalpas | 16 | `kalpas/index.html:11-16` |
| kevin | 17 | `kevin/index.html:11-16` |
| su | 17 | `su/index.html:11-16` |
| villv | 19 | `villv/index.html:11-16` |
| **并集** | **61** | — |

### 1.4.2 并集分类

**A. 8 页共有的「公共 token」（8 个）** —— 建议作为 `site.css` 的 `:root` 默认值，各页可选覆盖：

| 变量 | 值是否一致 | 备注 |
|---|---|---|
| `--bg-abyss` | ✗ 每页不同 | 主题底色 |
| `--bg-deep` | ✗ 每页不同 | |
| `--bg-mid` | ✗ 每页不同 | **⚠ 全站 61 个变量里唯一「8 页都定义、且 8 页都从未引用」的死变量，见 §3-R6** |
| `--text` | ✗ 每页不同 | |
| `--text-dim` | ✗ 每页不同 | |
| `--text-muted` | ✗ 每页不同 | |
| `--glass-bg` | ✗ 每页不同 | |
| `--glass-border` | ✗ 每页不同 | |
| `--glass-bg2` | ✗ 每页不同 | |
| `--glass-border2` | ✗ 每页不同 | |

（严格说是 10 个：`--bg-abyss`/`--bg-deep`/`--bg-mid`/`--text`/`--text-dim`/`--text-muted`/`--glass-bg`/`--glass-border`/`--glass-bg2`/`--glass-border2`，值**全部各页不同**。）

**B. 只在 1 页定义的「页面主题色」（40 个）** —— 留在各自页面：

| 页 | 专属变量（含行号） |
|---|---|
| armor | 无（armor 是 index 的子集，见下） |
| aponia | `--bg-violet`(#1c1230)、`--silver-mist`(#e8e4f2)、`--silver`(#c8c2dc)、`--violet`(#9d8fd0)、`--violet-deep`(#6b5ca8)、`--candle`(#e8c98a)、`--candle-deep`(#c9a45c) — 均 `aponia/index.html:11-14` |
| eden | `--bg-wine`(#241019)、`--gold-mist`(#ffe9b8)、`--gold-deep`(#e8b931)、`--wine`(#a83246)、`--wine-deep`(#6e1f30) — `eden/index.html:11-14` |
| kalpas | `--bg-ember`(#2a0e08)、`--crimson`(#ff3b30)、`--blood`(#c1121f)、`--ember`(#ff6b35)、`--flame`(#ffa62b)、`--ash`(#9a8c82) — `kalpas/index.html:11-14` |
| kevin | `--bg-ice`(#101a2c)、`--ice-mist`(#dceeff)、`--ice`(#a8d4f5)、`--ice-deep`(#5b9bd4)、`--steel`(#8ba7c4)、`--flame`(#e8935c)、`--flame-deep`(#c96a3c) — `kevin/index.html:11-14` |
| su | `--bg-teal`(#0d2430)、`--jade`(#2dd4bf)、`--jade-deep`(#1a8a7a)、`--peacock`(#1a6b5a)、`--lamp`(#e8c98a)、`--lamp-deep`(#c9a45c)、`--moon`(#eef6f4) — `su/index.html:11-14` |
| villv | `--bg-stage`(#2a1040)、`--accent`(#ff6b9d)、`--accent-soft`(rgba(255,107,157,.35))、`--magenta`(#ff6b9d)、`--magenta-deep`(#d94a7b)、`--teal`(#4ecdc4)、`--amber`(#e8a35c) — `villv/index.html:11-14` |
| index | `--pink-hot`(#ff2d78)、`--purple-ink`(#5a189a)、`--gold-soft`(#ffe5a0) — `index.html:15,17` |

**C. 2 页共有的（5 个）**：

| 变量 | 定义的页 | 结论 |
|---|---|---|
| `--bg-purple` | index:13、armor:10 | 值相同 `#1a0e2e` |
| `--pink` / `--pink-soft` / `--pink-mist` / `--purple` / `--purple-deep` / `--purple-glow` | index、armor | 值相同（armor 是 index 的旧快照） |
| `--gold` | index:17、armor:15、eden:11、villv:11 | 值都相同 `#ffd166`（**4 页共有，可作为共享 token**） |
| `--gold-warm` | index:17 `#e8b931`、eden:11 `#c9972c` | **⚠ 同名不同值，且语义不同**（index 拿它当 `--gold` 的暗色，eden 拿它当更亮的暖金），见 §3-R4 |
| `--flame` | kalpas:11 `#ffa62b`、kevin:11 `#e8935c` | **⚠ 同名不同值**，视觉上是两个完全不同的橙，见 §3-R4 |

### 1.4.3 ⚠ 变量「未定义却使用」全面排查结果

> **排查口径**：扫描 8 个文件的全部文本（CSS + HTML 内联 style + JS 字符串）里所有 `var(--x)` 引用，与该页 `:root`（含 index 的 3 个 style 块）定义的变量集合求差。

**结果：真正的问题只有 1 处。**

| # | 变量 | 被使用的页:行 | 来源定义 | 性质 |
|---|---|---|---|---|
| **P1** | `--gold-soft` | **`armor.html:82`** (`.type-badge.skin{...color:var(--gold-soft)...}`) | 只在 **`index.html:17`** 定义（`#ffe5a0`），**armor 自己的 `:root`（armor.html:10-16）没有定义** | **真 BUG**。`color` 声明在计算值阶段失效 → 回退为继承父元素颜色，`.type-badge.skin`（「皮肤」类型徽章）的文字色会跟周围文字一致，丢失金色高亮。 |

**其余「未定义」全部是 JS 运行时注入的合法变量，不用改**（已逐个验证注入点）：

| 变量 | 使用于 | 由谁注入 | 注入点 |
|---|---|---|---|
| `--dur` | index:210, aponia:173, eden:173, kalpas:235, kevin:173, su:215, villv:265 | JS | index:849（`cssText`）、aponia:625、eden:593、kalpas:898、kevin:627、su:913、villv:1037（`setProperty`） |
| `--delay` | 同上 | JS | index:849、aponia:626、eden:594、kalpas:899、kevin:628、su:914、villv:1038 |
| `--min-o` | index:213, aponia:174, eden:174, kalpas:236, kevin:174, su:216, villv:266 | JS | index:848、aponia:623、eden:591、kalpas:896、kevin:625、su:911、villv:1035 |
| `--max-o` | 同上 | JS | index:848、aponia:624、eden:592、kalpas:897、kevin:626、su:912、villv:1036 |
| `--float-delay` | `index.html:322` | JS | `index.html:904` |
| `--pc` | villv:150,155,155 | JS | `villv/index.html:697` |
| `--pc-glow` | villv:150,156 | JS | `villv/index.html:698` |

**另外发现 9 个「定义了但全站从未引用」的死变量**（可安全删除，但删除前建议全局搜一次确认没有 `getPropertyValue` 之类动态读取）：

| 变量 | 定义位置 | 备注 |
|---|---|---|
| `--bg-mid` | 8 页全部定义（如 `index.html:14`） | ⚠ **8 页都定义、8 页都没用**，是复制粘贴留下的历史包袱 |
| `--pink-deep` | `index.html:16`、`armor.html:11` | |
| `--pink-hot` | `index.html:16` | |
| `--purple-ink` | `index.html:17` | |
| `--gold-warm` | `index.html:17` | index 内未用；eden 内有独立同名定义并**被使用** |
| `--wine-deep` | `eden/index.html:14` | |
| `--flame-deep` | `kevin/index.html:13` | |
| `--peacock` | `su/index.html:12` | |
| `--magenta` | `villv/index.html:12` | `--magenta-deep` 被用了，`--magenta` 没有 |

**结论：抽取时 `site.css` 的 `:root` 建议只放 §1.4.2-A 的 10 个公共 token + `--gold`（4 页同值），其余全部留在各页；同时顺手修 P1。**

---

# 2. JS 共用子集

## 2.1 总览

按 `function NAME(){...}` 粒度扫描，8 个页面共 38 个具名函数。

**关键发现：没有任何一个具名函数在 ≥2 个页面里实现完全一致。** 跨页同名的 8 个函数全部有差异：

| 函数 | 出现页数 | 结论 |
|---|---|---|
| `animate` | 7 | 每页粒子系统不同，天然不能合并（差异摘要见 §2.3） |
| `resize` | 7 | **仅空白/花括号风格不同，逻辑完全一致** → 见 §3-R2 |
| `typeNext` | 7 | 打字速度/收尾时序每页不同 |
| `createStar` | 4 | 尺寸/透明度/颜色池不同 |
| `showToast` | 4 | 签名与时序不同 |
| `createMote` | 2 | aponia 向下 vs eden 向上，方向相反 |
| `createEmber` | 2 | kalpas vs kevin，数值不同 |
| `render` | 2 | index 是生日彩蛋渲染、armor 是卡片过滤器渲染，**纯同名不同物** |

其余 30 个函数都只出现在 1 个页面，是页面专属。

### 2.2 完全相同的函数

**具名函数：0 个。**

但**匿名/内联代码块**有 3 大段在 6 个子页里逐字节（去注释后）一致：

| 代码块 | 一致范围 | 起始行号 |
|---|---|---|
| 语录卡构建 + 点击/键盘处理 | **aponia / eden / kalpas / kevin / su / villv 六页完全一致**（index 是另一套，见下） | aponia:400、eden:401、kalpas:503、kevin:398、su:505、villv:628 |
| IntersectionObserver 滚动动画（含 `.timeline-node` 观察 + ending 观察） | **六页完全一致**（`scrolling` + `endingObserver` 两段） | aponia:590、eden:558、kalpas:862、kevin:592、su:877、villv:1001 |
| 结尾星星生成循环（`endingStarCount` 计算 + 逐星 `style.setProperty`） | 结构一致，**但颜色池和数值有 5 处分歧** → 见 §2.3 | aponia:612、eden:580、kalpas:884、kevin:614、su:899、villv:1023 |

## 2.3 同名但实现不同的函数（逐页实际写法）

### 2.3.1 语录卡点击逻辑 —— index 用闭包索引 O(1)，子页用 `indexOf.call`

**index（`index.html:594-631`）** —— 闭包固化索引：

```js
"use strict";  // 实际在 IIFE 内
quotes.forEach(function(q, i) {
  ...
  var cur = i;                        // 👈 闭包固化索引，O(1)，不扫 DOM
  card.addEventListener('click', function() {
    var next = (cur + 1) % quotes.length;
    // 打断上一条配音，避免叠音（同一卡片用同一 Audio 实例）
    var au = quoteAudioEls[String(i)];
    if (au) { au.pause(); au.currentTime = 0; }
    var file = (typeof window.QUOTE_AUDIO === 'object' && window.QUOTE_AUDIO) ? window.QUOTE_AUDIO[next + 1] : null;
    if (file) {
      var a = quoteAudioEls[String(i)] || (quoteAudioEls[String(i)] = new Audio());
      a.src = file;
      a.play().catch(function(){});
    }
    textEl.classList.add('fading');
    setTimeout(function() {
      textEl.textContent = quotes[next];
      cur = next;                     // 👈 更新闭包变量
      textEl.classList.remove('fading');
    }, 400);
  });
```

**6 个子页（aponia:418-429 / eden:419-430 / kalpas:521-532 / kevin:416-427 / su:523-534 / villv:646-657）** —— **逐字节相同**：

```js
var cardIndices = [];
quotes.forEach(function(q, i){
  ...
  cardIndices.push(i);
  card.addEventListener('click', function(){
    var idxPos = Array.prototype.indexOf.call(grid.querySelectorAll('.quote-card'), card);
    var nextIdx = (cardIndices[idxPos] + 1) % quotes.length;
    cardIndices[idxPos] = nextIdx;
    textEl.classList.add('fading');
    setTimeout(function(){
      textEl.textContent = quotes[nextIdx];
      textEl.classList.remove('fading');
    }, 400);
  });
```

**差异要点**：
- 子页每次点击都跑一次 `grid.querySelectorAll('.quote-card')` 并线性查找 → O(n²)，卡片多了会卡；index 是 O(1)。
- index 多了**语录配音**（`window.QUOTE_AUDIO`）逻辑，子页完全没有。
- `aria-label` 文案不同：index:599 = `'语录卡片，点击切换与播放配音'`；子页 = `'低语卡片，点击切换'`。
- index 的 `cur` 是每卡闭包变量；子页的 `cardIndices[]` 是共享数组（**理论上如果 DOM 顺序变化就会错位**，见 §3-R9）。

### 2.3.2 canvas 粒子系统 `animate()`

7 页各有一套，主循环骨架相同（`reducedMotion` 早退 → `time++` → `clearRect` → 按 `fadeFactor` 画各类粒子 → `requestAnimationFrame`），差异：

| 页 | 行号 | 主循环内容 | `fadeFactor` 系数 |
|---|---|---|---|
| index | 748-777 | 星 + 花瓣（`drawStar` / `drawPetal`） | `1 - scrollRatio * 0.7` |
| aponia | 508-562 | 命运丝线（quadraticCurve）+ 星 + 灯尘 | `1 - scrollRatio * 0.6` |
| eden | 492-530 | 星 + 金色音符（自下而上） | `1 - scrollRatio * 0.6` |
| kalpas | 595-655 | 灰烬 + 余烬（受 `rageBoost` 调制）+ 爆裂粒子 | `1 - scrollRatio * 0.55` |
| kevin | 509-564 | 冰晶 + 余烬 + 星 | （同族，系数见文件） |
| su | 598-656 | 菩提叶 + 灯尘 + 星 | （同族） |
| villv | 914-971 | 彩带 + 漂浮物 + 爆裂 | （同族） |

**7 页都有 `if (reducedMotion) return;` 早退，这一点是一致的。**
可以抽出的只有「空循环骨架」，但骨架只有 6 行，抽取收益 < 抽象成本。**建议：不抽 `animate`，只抽公共工具（`resize`、颜色池采样、`randRange` 之类）。**

### 2.3.3 打字机 `typeNext()`

7 页都有，结构完全同构（`charIndex < typeText.length` → 逐字 + `setTimeout` → 否则收尾），**只有三个数值不同**：

| 页 | 行号 | 逐字间隔 | 收尾 600ms 块 | scrollHint 延迟 |
|---|---|---|---|---|
| index | 788-802 | `160 + Math.random() * 80` | `600` | `1200` |
| aponia | 574-586 | `140 + Math.random() * 70` | `600` | `1200` |
| eden | 542-554 | `140 + Math.random() * 70` | `600` | `1200` |
| kevin | 576-588 | `130 + Math.random() * 70` | `600` | `1200` |
| **kalpas** | 845-858 | `110 + Math.random() * 80` | **`550`** | **`1000`** |
| su | 860-873 | `150 + Math.random() * 80` | `600` | **`1000`** |
| villv | 984-997 | `130 + Math.random() * 70` | （见文件） | （见文件） |

**额外结构差异**：kalpas:850 和 su:852 在收尾时**多一行 `hintEl.classList.add('visible');`**（点亮 `.opening-hint`），其余 5 页没有。

**建议抽法**：`initTypewriter({ el, cursorEl, subEl, hintEl, scrollHintEl, text, charDelay, doneDelay, hintDelay })`。

### 2.3.4 IntersectionObserver 滚动动画

**六子页（aponia:590 / eden:558 / kalpas:862 / kevin:592 / su:877 / villv:1001）完全一致**：

```js
var observerOptions = { threshold: 0.15, rootMargin: '0px 0px -50px 0px' };
var scrollObserver = new IntersectionObserver(function(entries){
  entries.forEach(function(entry){
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, observerOptions);
document.querySelectorAll('.timeline-node').forEach(function(node){
  scrollObserver.observe(node);
});

var endingObserver = new IntersectionObserver(function(entries){
  entries.forEach(function(entry){
    if (entry.isIntersecting){
      document.getElementById('endingQuote').classList.add('visible');
      document.getElementById('endingAttr').classList.add('visible');
      document.getElementById('backLink').classList.add('visible');
    }
  });
}, { threshold: 0.3 });
endingObserver.observe(document.getElementById('ending'));
```

**index（`index.html:806-832`）不同**：

```js
var observerOptions = { threshold: 0.15, rootMargin: '0px 0px -50px 0px' };
var scrollObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, observerOptions);
document.querySelectorAll('.timeline-node').forEach(function(node) {
  scrollObserver.observe(node);
});

var endingObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      var eq = document.getElementById('epilogueQuote');   // 👈 ID 不同
      if (eq) { eq.classList.add('visible'); }             // 👈 有 null 保护
      var ea = document.getElementById('endingAttr');
      if (ea) { ea.classList.add('visible'); }
      // 👈 没有 backLink（index 页根本没有 .back-link 元素）
    }
  });
}, { threshold: 0.3 });
endingObserver.observe(document.getElementById('ending'));
```

| 差异点 | index | 六子页 |
|---|---|---|
| 结尾语录元素 ID | `epilogueQuote` | `endingQuote` |
| `backLink` 处理 | 无 | 有 |
| null 保护 | **有（`if (eq)` / `if (ea)`）** | **无 → 若元素缺失会抛 TypeError** |
| armor | `armor.html:193-199` 是独立实现：只有一个 `observer`，只处理 `.timeline-node`，没有 ending observer | — |

### 2.3.5 点击涟漪 + `prefers-reduced-motion`

**`prefers-reduced-motion` 检测：7 页都有**，全部是同一行写法：

| 页 | 定义行 |
|---|---|
| index | `index.html:746` |
| aponia | `aponia/index.html:506` |
| eden | `eden/index.html:490` |
| kalpas | `kalpas/index.html:593` |
| kevin | `kevin/index.html:507` |
| su | `su/index.html:596` |
| villv | `villv/index.html:912` |

```js
var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

**点击涟漪：7 页都有，但分成两种实现。**

| 页 | 行号 | 实现 | 元素 | `reducedMotion` 早退 | 排除区域 |
|---|---|---|---|---|---|
| index | 856-882 | DOM，`ripple-petal` | 花瓣 7~10 片 | **无** ❌ | 无 |
| aponia | 633-661 | DOM，`ripple-thread` | 命运丝线 | 有 ✅ | 无 |
| eden | 601-625 | DOM，`ripple-note` | 金色音符 | 有 ✅ | 无 |
| kevin | 635-663 | DOM，`ripple-shard` | 冰晶碎片 7~10 片 | 有 ✅ | 无 |
| su | 832-848 | DOM，`water-ring` | 2 圈水面圆环 | 有 ✅ | `#muyuStage` / `#profileName` / `#endingQuote` |
| kalpas | 742-750 | **canvas**（`sparkBurst`） | 无 DOM 元素 | 有 ✅ | `#maskWrap` / `#profileName` / `#endingQuote` |
| villv | 1044-1048 | **canvas**（`confettiBurst`） | 无 DOM 元素 | 有 ✅ | `#drawBtn` / `.persona-card` / `#profileName` / `#endingQuote` |

> **⚠ 最大的一处行为不一致**：`index.html:856` 的点击涟漪**没有做 `reducedMotion` 判断**。虽然 index 文件里有 `reducedMotion` 变量（L746），但涟漪监听器没有用它。→ 见 §3-R3。

**DOM 涟漪的统一写法**（aponia/eden/kevin 几乎同构，以 kevin 为例，`kevin/index.html:633-663`）：

```js
var shardColors = ['#dceeff','#a8d4f5','#5b9bd4','#e8935c'];
document.addEventListener('click', function(e){
  if (reducedMotion) return;
  var count = 7 + Math.floor(Math.random() * 4);
  for (var k = 0; k < count; k++){
    var shard = document.createElement('div');
    shard.className = 'ripple-shard';
    var angle = (k / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    var dist = 26 + Math.random() * 58;          // 👈 各页不同：index 25+55, kevin 26+58
    ...
    document.body.appendChild(shard);
    void shard.offsetWidth;
    ...
    (function(el){ setTimeout(function(){ el.remove(); }, 900); })(shard);   // 👈 清理延迟各页 800/900
  }
});
```

**dead CSS 发现（2 处）**：`.ripple-spark`（`kalpas/index.html:265`）与 `.ripple-confetti`（`villv/index.html:303`）**定义了但 JS 从未创建对应元素** —— kalpas/villv 的点击特效走 canvas 不走 DOM。

### 2.3.6 `resize` 处理

**每页都有两个 resize 相关的监听**（villv 除外）：

| 页 | ① `window.addEventListener('resize', resize)` | ② 粒子重定位监听 |
|---|---|---|
| index | L645 | **L885-893**（只处理 `stars`） |
| aponia | L446 | **L663-672**（`stars` + `threads`） |
| eden | L447 | **L627-635** |
| kalpas | L549 | **L905-913** |
| kevin | L444 | **L665-673** |
| su | L551 | **L920-928** |
| **villv** | L842 | **❌ 没有第二个监听** |

**⚠ villv 缺少粒子重定位监听** → 见 §3-R10。窗口 resize 后 villv 的彩带/漂浮物会停留在旧边界外，直到自然回收。

**① 号监听注册的 `resize()` 函数 7 页逻辑完全一致**（只有空白和 `function resize() {` vs `function resize(){` 的风格差异）：

```js
function resize(){                        // index:640 写作 function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
```

### 2.3.7 其它逐页实现差异

| 主题 | 差异 |
|---|---|
| **`showToast`** | 4 种实现。index:1037-1049 **动态创建** `#heroToast`（懒加载 `document.createElement`）；kalpas:680-688 用现成 `toastEl` + 第二参数 `roar`（时长 `roar ? 3600 : 2800`）；su:680-688 同构但第二参数叫 `golden`（`golden ? 4200 : 3000`）；villv:737-744 无第二参数（固定 3200ms）。 |
| **`createStar`** | 4 种。index:675-685（size 0.4+1.8、opacity 0.2+0.6、40% 概率取 `purpleColors`）；aponia:486-496 与 kevin:487-497 **数值完全相同**（size 0.3+1.4、opacity 0.12+0.45、纯白）→ 这两页可以真正共用；eden:470-480（size 0.4+1.6、25% 概率取 `wineColors`）。 |
| **`createMote`** | aponia:468-480 **向下飘**（`y: -10 - random*60`，`speedY: +0.1~0.4`）；eden:452-464 **向上飘**（`y: H+10+random*80`，`speedY: -(0.15~0.6)`）—— **方向相反，不能合并**。 |
| **`createEmber`** | kalpas:553-565（`H+12+70`、size 0.8+2.4、speedY -(0.25~0.85)、alpha 0.18+0.5）vs kevin:469-481（`H+10+60`、size 0.8+1.8、speedY -(0.15~0.5)、alpha 0.12+0.35）。 |
| **结尾星星生成** | 6 子页结构一致，但有 5 处数值分歧：`endingStarCount`（kalpas 是 `Math.min(70, innerWidth/14)`，其余 `Math.min(80, innerWidth/12)`）；`--min-o` 基址（kalpas/su 是 `0.08`，其余 `0.1`）；`--max-o` 基址（kalpas/su 是 `0.45`，其余 `0.5`）；`--dur` 基址（su 是 `2.4`，其余 `2`）；颜色池（aponia 二选一 `#fff`/`#9d8fd0`，eden 二选一 `#fff`/`#ffd166`，kevin 二选一 `#fff`/`#a8d4f5`，kalpas 三选一 `['#fff','#ffa62b','#ff6b35']`，su 三选一 `['#fff','#2dd4bf','#e8c98a']`，villv 四选一 `['#fff','#ffd166','#ff6b9d','#4ecdc4']`）。 |
| **页面专属大逻辑** | index：英雄名片 `hereosField`（L895-943）、寄语双切换（L945-966）、生日彩蛋（L1107-1154）；armor：卡片筛选+渲染 `render`（L158-191）、`byOrder`（L143-156）；kalpas：怒气系统 `updateRage`/`startRage`（L711-740）、面具彩蛋 `maskTap`（L762-787）；su：木鱼 `strikeMuyu`/`muyuSound`（L699-760）、长按 `startPress`/`cancelPress`（L792-801）、`renderMeru`（L722-724）；villv：人格卡 `persona`（L690-735）、抽卡（L787-830）、凯文杀手彩蛋 `fireKevinKiller666`/`emberField`/`explosionBurst`（L1057-1136）。 |

---

# 3. 抽取风险清单 ⚠

**这一节是重点。下面每一条都是「看起来一样但其实有细微差别」的地方，直接合并会导致视觉回归。**

### R1 · 前导零写法差异（数量最多，但**风险最低**）

| 规则 | 差异形态 | 安全页 |
|---|---|---|
| `.ending-attr` | index:221 写 `font-size:0.85rem` / `letter-spacing:0.25em` / `0.8s`，其余页写 `.85rem` / `.25em` / `.8s` | index vs aponia:181, eden:181, kalpas:248, kevin:181, su:228, villv:273 |
| `.ending-attr.visible` | index:225 `opacity:0.7` vs 其余 `.7` | 6 页 |
| `.profile-grid` | index:117 `gap:0.6rem 1.5rem` / `font-size:0.92rem` vs 其余 `.6rem 1.5rem` / `.92rem` | 6 页 |
| `.profile-desc` | index:122 `0.9rem` vs 其余 `.9rem` | 6 页 |
| `.quote-text` | index:192 `0.9rem` / `opacity 0.4s ease` vs 其余 `.9rem` / `.4s` | 6 页 |
| `.quote-hint` | index:197 `bottom:0.6rem;right:0.8rem;font-size:0.65rem;opacity:0.4` vs 其余 `.6rem/.8rem/.65rem/.4` | 6 页 |
| `.scroll-hint` | index:56 `gap:0.5rem` / `0.5s` vs 其余 `.5rem` / `.5s` | 6 页 |
| `.scroll-hint span` | index:61 `0.75rem` / `0.2em` vs 其余 `.75rem` / `.2em` | 6 页 |
| `.scroll-hint.visible` | index:60 `0.6` vs 其余 `.6` | 6 页 |
| `.timeline-card h3` | index:158 `margin-bottom:0.5rem` / `letter-spacing:0.1em` vs 其余 `.5rem` / `.1em` | 6 页 |
| `.timeline-card p` | index:162 `0.85rem` vs 其余 `.85rem` | 6 页 |
| `.timeline-node` | index:135 `0.7s` vs 其余 `.7s` | 6 页 |
| `.typing-cursor` | index:44 `blink-cursor 0.8s` vs 其余 `.8s` | 6 页 |
| `.timeline-dot` | index:142 `top:0.5rem` vs 其余 `.5rem` | 6 页 |
| `.section-title` | index:74 `letter-spacing:0.2em` vs 其余 `.2em` | 6 页 |
| `.opening-subtitle` | index:51 `clamp(0.9rem,2.5vw,1.3rem)` vs 其余 `clamp(.9rem,2.5vw,1.25rem)` | ⚠ **注意这条不只是前导零 —— 上界 `1.3rem` vs `1.25rem` 是真差异！** |

**结论**：除最后一条外，这些合并后视觉 100% 等价。**抽取时统一用「无前导零」写法，并在 commit message 里声明「仅排版归一化」。** 但 `clamp(0.9rem,2.5vw,1.3rem)` vs `1.25rem` 是**真 bug 级差异**，必须保留 index 的值。

### R2 · `function resize() {` vs `function resize(){`（**同名同逻辑，纯风格**）

7 页的 `resize` 逻辑字节级等价，只是花括号前空格不同：
`index.html:640`（有空格）vs `aponia:441`、`eden:442`、`kalpas:544`、`kevin:439`、`su:546`、`villv:837`（无空格）。
**这是最安全的一条合并** —— 但要小心：合并后 `resize` 必须仍能访问每页各自的 `canvas`/`W`/`H` 变量，所以抽取时应写成 `function makeResize(canvas, state)` 工厂，而不是裸函数。

### R3 · index 的点击涟漪缺 `reducedMotion` 判断 ⚠⚠

- `index.html:746` 定义了 `reducedMotion`，但 `index.html:856` 的 `document.addEventListener('click', ...)` **没有任何 `if (reducedMotion) return;`**。
- 其余 6 页的涟漪监听器都有这个早退（aponia:634、eden:602、kalpas:747、kevin:636、su:833、villv:1045）。

**风险**：如果抽取时统一成「有判断」的版本，index 在「减弱动效」偏好下会**从「有花瓣迸发」变成「完全没反应」** —— 这是行为改变，不是重构。建议：**保持现状**（或者作为独立 commit 显式声明为 bug fix）。**如果照抄子页版本，必须让用户确认这是否是期望的行为变更。**

### R4 · 同名变量、不同值、不同语义 ⚠⚠

| 变量 | 页面 | 值 | 语义 |
|---|---|---|---|
| `--gold-warm` | `index.html:17` | `#e8b931` | 当作「比 `--gold` 深的暖金」用于 `.timeline-line` 之外的地方 |
| `--gold-warm` | `eden/index.html:11` | `#c9972c` | 用作 `::-webkit-scrollbar-thumb` 和 `.timeline-line` |
| `--flame` | `kalpas/index.html:11` | `#ffa62b` | 千劫的「烈焰」亮橙 |
| `--flame` | `kevin/index.html:11` | `#e8935c` | 凯文的「余烬」暖橙 |
| `--candle` / `--lamp` | `aponia:11` / `su:11` | 都是 `#e8c98a` | 同色不同名 |

**风险**：如果把 `--gold-warm` 或 `--flame` 提升到 `site.css` 的公共 `:root` 并只保留一个值，**两页的视觉会同时改变**。
**对策**：这两个变量**不要提升**，各自留在页面 `:root`。或者改名区分（`--kalpas-flame` / `--kevin-flame`）。

### R5 · 两条 dead CSS（定义但从未使用）⚠

| 规则 | 位置 | 情况 |
|---|---|---|
| `.ripple-spark` | `kalpas/index.html:265` | kalpas 的点击特效走 canvas `sparkBurst`（L657-674），**从不创建 `.ripple-spark` DOM 元素**。 |
| `.ripple-confetti` | `villv/index.html:303` | villv 的点击特效走 canvas `confettiBurst`（L887-903），**从不创建 `.ripple-confetti` DOM 元素**。 |

**风险**：抽取时如果按「涟漪效果统一」把它们归到 A 组，会引入**永远不会生效的 CSS**，并让后续维护者困惑。**建议标记为 dead code，本次抽取不带走**（或单独 commit 删除）。

### R6 · `--bg-mid` 8 页都定义、8 页都没用 ⚠

`index.html:14`、`armor.html:11`、`aponia:12`、`eden:12`、`kalpas:12`、`kevin:12`、`su:12`、`villv:12` 全部定义了 `--bg-mid`，但全站**没有任何一处 `var(--bg-mid)`**。

**风险**：抽取 `site.css` 时如果只挑「被引用的变量」，`--bg-mid` 会静默消失 —— 这其实**没有视觉影响**。但如果实施者误以为它是「公共 token」放进 `site.css`，就会把 7 个不同值（`#2d1b4e`/`#2a1c42`/`#3a1a26`/`#3d170d`/`#1a2740`/`#123440`/`#3d1a58`）压成一个，虽然不会立刻出问题，但会掩盖「它到底该是什么」的事实。**建议：本次不动，另开 issue。**

### R7 · kalpas 没有 `glow-pulse`，且 `card-rotate` 缺席 ⚠

- `@keyframes glow-pulse` 出现在 6 页（index:260、aponia:92、eden:92、kevin:92、su:105、villv:109），**kalpas 完全没有**。`kalpas:130` 的 `.profile-card` 也没有 `animation` 声明。
- `@keyframes card-rotate` 出现在 6 页（index:102、aponia:91、eden:91、kevin:91、su:104、villv:108），**kalpas 没有**；`kalpas:130` 的 `.profile-card::before` 也不存在（`.profile-card::before` 只在 6 页出现）。

**风险**：如果 A 组把 `@keyframes card-rotate` / `glow-pulse` 无条件放进 `site.css`，kalpas 页会**凭空多出未使用的 keyframes**（无视觉影响，但是死代码）；而如果同时给 kalpas 的 `.profile-card` 加了 `animation`，**kalpas 的档案卡会开始呼吸发光 —— 这是明确的视觉回归**。
**对策**：`@keyframes` 放共享文件是安全的；但 `.profile-card` 的 `animation` 声明必须留在各页。

### R8 · 疑似色值笔误：`rgba(255,209,107,.04)` ⚠

`villv/index.html:205` 的 `.quote-card { box-shadow: 0 0 20px rgba(255,209,107,.04); }`
—— 其余 6 页用的是 `102`（`#ffd166` 的 G 通道）。villv 这处是 `107`，**与 villv 自己 `:root` 里的 `--gold:#ffd166` 对不上**，也和 `villv:214` 的 `.quote-card::after`（用 `rgba(255,209,102,.06)`）不一致。

**风险**：抽取时如果把 `.quote-card` 的 `box-shadow` 归入「仅色值不同 → 留页面 override」，这个笔误会被**原样搬进 override 块并固化**。视觉上 `107` vs `102` 的差异肉眼几乎不可见（alpha 只有 .04），但值得单独修掉。

### R9 · 子页 `cardIndices[]` 与 DOM 顺序耦合 ⚠

子页（aponia:418 / eden:419 / kalpas:521 / kevin:416 / su:523 / villv:646）用
`Array.prototype.indexOf.call(grid.querySelectorAll('.quote-card'), card)` 反查位置，再写回共享数组 `cardIndices[idxPos]`。

**风险**：如果抽取时把「语录卡构建」抽成公共函数，但**忘了 `cardIndices` 必须是每次初始化时重建的局部数组**，变成模块级全局数组，那么**跨越多次初始化的索引会串味**（第二次渲染时拿到第一次的状态）。index 的闭包写法没有这个隐患。
**对策**：抽公共函数时用闭包/工厂封装状态，不要暴露模块级可变数组。

### R10 · villv 缺少粒子 resize 守卫 ⚠

`villv/index.html:842` 只注册了 `window.addEventListener('resize', resize)`（重设 canvas 尺寸），**没有**其余 6 页都有的第二个监听（遍历粒子把越界的 `x`/`y` 重新随机化）。

**风险**：如果按「六页一致」把它们抽成公共 `installParticleResizeGuard()` 并给 villv 也装上 —— villv 的**行为会改变**（彩带在 resize 后会被重新分布而不是残留在画布外）。
这未必是坏事，但**属于行为变更**，实施时必须显式说明，不能当成无声重构。

### R11 · 六个子页的 `endingObserver` 无 null 保护 ⚠

六子页（aponia:601-610 等）直接写：
```js
document.getElementById('endingQuote').classList.add('visible');
document.getElementById('endingAttr').classList.add('visible');
document.getElementById('backLink').classList.add('visible');
```
**没有 `if (el)` 判空**。index:825-828 则有判空。

**风险**：抽取成公共函数后，如果照搬子页写法，一旦某个页面缺 `#backLink`（例如以后新加的角色页没有返回链接），**会直接抛 TypeError 并打断整个 ending 观察回调**（后面的 `endingAttr` 就点不亮了）。
**对策**：抽取时统一采用 index 的判空写法 —— 这是**行为改善**（子页在元素齐全时表现完全一致），可以安全采纳；但要在 commit message 里写明。

### R12 · `.timeline` 系列在 armor 与其它 7 页是两套结构 ⚠⚠

这是最容易踩的坑：**armor.html 的 timeline 是「主页精简时间轴」的旧版本**，与 7 个角色页不是一套。

| 属性 | armor | 其余 7 页 |
|---|---|---|
| `.timeline` | `max-width:900px;margin:3.5rem auto 0;padding:1rem 1.5rem 4rem;z-index:2` | `max-width:800px;margin:0 auto;padding:2rem 0` |
| `.timeline-node` | `margin-bottom:2.6rem;translateY(24px);.6s` | `3rem;translateY(30px);.7s` |
| `.timeline-card` | `calc(50% - 2.4rem)` / `padding:1.2rem 1.4rem` / 有 `cursor:pointer` + `transition` | `calc(50% - 2.5rem)` / `1.2rem 1.5rem` / 无 |
| `.timeline-dot` | 13px / `top:.6rem` / 无 transition | 12px 或 14px / `top:.5rem` / 有 transition |
| `.timeline-line` | 渐变 stop 8%/92% | 10%/90% |
| `@media(max-width:768px)` | `left:1.3rem` / `calc(100% - 2.8rem)` | `left:1.5rem` / `calc(100% - 3.5rem)` |
| `body` | 有渐变背景 + `background-attachment:fixed` | 纯 `var(--bg-abyss)` |
| 480px 断点 | **无** | 有 |

**风险**：A 组里 8 条 timeline 规则（`.timeline-node.visible` 等）是几何中性的、可以安全共享；但 `.timeline`/`.timeline-card`/`.timeline-dot`/`.timeline-line`/`.timeline-node` 本体**全部是 B 组**，**绝不能让 armor 继承 7 页版本**。
**对策**：armor 作为「独立主题」处理，`site.css` 只给它 A 组的 8 条，其余全部靠 armor 自己的 override 块。抽取顺序上把 armor 放到**最后**处理（见 §4）。

### R13 · `.back-link` 在 armor 与子页是两种完全不同的组件 ⚠

`armor.html:28-29` 的 `.back-link` 是 `display:inline-block;color:var(--text-muted);font-size:.78rem;padding:.4rem .9rem`（「小胶囊」），hover 只改 `color`/`border-color`。
6 个子页的 `.back-link` 是 `display:inline-flex;min-height:44px;padding:.6rem 1.6rem;opacity:0`（进场淡入的大按钮），hover 改 `background`/`box-shadow`/`transform`。

**风险**：B 组分析里 `.back-link` 被归为「同选择器不同值」，但它的**结构与交互完全不同**，不是简单的主题覆盖。抽取时**必须分两套**，不能写成一个带 `var()` 的模板。

### R14 · `.section-opening` 的 `env(safe-area-inset-bottom)` ⚠

6 个子页都有 `padding-bottom:calc(2rem + env(safe-area-inset-bottom))`，**index 和 armor 没有**。
同样地，`.scroll-hint` 在 6 子页用 `bottom:calc(2.5rem + env(safe-area-inset-bottom))`，`index:56` 用 `bottom:2.5rem`。

**风险**：如果统一成带 `env()` 的版本，index 在 iPhone 上滚动提示会**上移约 34px**（安全区高度），是可见的布局变化。建议 index 保持原样。

---

# 4. 建议的抽取顺序（低风险 → 高风险）

每一步都可以独立验证、独立回滚。建议每步一个 commit，并在浏览器里对比 `index.html` 和至少 3 个子页。

### 第 0 步 · 建立验证基线（**必做**）
- 截图 8 个页面在 3 个视口（1920 / 768 / 375）下的首屏 + 时间轴 + 语录区 + 结尾区。
- 用浏览器 DevTools 录制一次 `Performance` 或在控制台 hook `getComputedStyle`，把关键元素的计算样式 dump 成 JSON 存档。
- **后续每一步都和基线对比，不要凭肉眼。**

### 第 1 步 · 只建文件，不接线（零风险）
- 新建 `assets/site.css`，填入 §1.1 的 A 组 31 条（**先不删除各页原有 CSS，只是新增一个文件**）。
- 这一步不改变任何渲染结果，纯粹是「把代码准备好」。
- 验证：8 个页面视觉零变化（因为没人 import 它）。

### 第 2 步 · 抽最安全的一段 CSS：`@keyframes` + 基础重置
- 把 `*,*::before,*::after`、`html`、`::-webkit-scrollbar*`、`@keyframes blink-cursor` / `chevron-bounce` / `twinkle` / `card-rotate` 换成 `site.css` 引入。
- 这几条**在所有出现它的页面里逐字节一致**，且不依赖 `:root` 的具体值（`blink-cursor` / `chevron-bounce` / `card-rotate` 是纯几何；`twinkle` 用的是运行时变量）。
- ⚠ 注意 R7：`card-rotate` 别给 kalpas 用（kalpas 本来没有）。
- 验证：动画不抖、keyframes 名字不冲突。

### 第 3 步 · 抽几何中性、无主题色的规则
- `.timeline-node.visible`、`.timeline-node:nth-child(odd/even)`、`.timeline-node:nth-child(odd/even) .timeline-card`、`.section-title-wrap`、`.profile-card-inner`、`.profile-divider`、`.profile-label`、`.profile-value`、`.quotes-grid`、`.quote-text.fading`、`.section-ending`、`.ending-stars`、`.ending-star`、`.ending-quote.visible`、`.ending-fade`、`.ending-sub`、`.opening-subtitle.visible`、`.typing-cursor.hidden`、`.opening-hint.visible`、`.back-link.visible`。
- 这些全部只引用 `var(--glass-*)` / `var(--text-*)` / `var(--bg-abyss)` / 运行时变量，**颜色由 `:root` 提供，不需要任何页面 override**。
- ⚠ 注意 R12：`.section-ending` / `.ending-*` 只在**除 armor 外**的 7 页出现，不要给 armor import。
- 验证：时间轴、结尾、语录区像素级一致。

### 第 4 步 · 归一化前导零（**只改写法，不改值**）
- 把 index 的 `0.85rem` / `0.5rem` / `0.7s` 等改成 `.85rem` / `.5rem` / `.7s`，让 B 组里那些「仅前导零不同」的规则变成真正一致，从而能并入 A 组。
- ⚠ **R1 的例外**：`index.html:51` 的 `clamp(0.9rem,2.5vw,1.3rem)` 上界是 `1.3rem`，其余页是 `1.25rem` —— **这一处不要归一化，保留 index 的值**（或确认这就是笔误后单独修）。
- 验证：`getComputedStyle` dump 与基线逐字段相等（数值型字段允许 `0.85 === .85`）。

### 第 5 步 · 抽 JS 工具函数（**从 `resize` 开始**）
- 先抽 R2 的 `resize`：写成 `function makeResize(canvas, state) { return function(){ ... } }` 形式的工厂，各页 `var resize = makeResize(canvas, state)`。
- 再抽「结尾星星生成」为 `spawnEndingStars(container, opts)`，`opts` 接收 `count` / `minO` / `maxO` / `dur` / `colors`（把 §2.3.7 那 5 处分歧全部参数化）。
- ⚠ 注意 R10（villv 没有 resize 守卫）：**抽的时候不要顺手给 villv 补上**，那是行为变更。
- 验证：`ending-star` 的数量、`--min-o`/`--max-o`/`--dur`/`--delay` 的分布区间与基线一致；resize 后粒子分布正常。

### 第 6 步 · 抽子页公共 JS：语录卡 + IntersectionObserver
- 这两段在 6 个子页**逐字节一致**，是 JS 里最值得抽的部分。
- ⚠ **R9**：`cardIndices` 必须封装在工厂函数内部，不要变成模块级全局。
- ⚠ **R11**：`endingObserver` 统一采用**带判空**的写法（index 版本），并显式声明这是「防御性改进」而非纯重构。
- ⚠ index 不进这一步：它的语录卡有配音逻辑（`window.QUOTE_AUDIO`）、结尾观察器用的是 `epilogueQuote` 且没有 `backLink`。
- 验证：6 个子页的语录点击切换正确（含连续点击 20 次不串位）；滚到结尾时 `endingQuote`/`endingAttr`/`backLink` 都点亮。

### 第 7 步 · 抽打字机
- 参数化 §2.3.3 的三个数值 + `hintEl` 是否点亮。
- ⚠ 注意 kalpas/su 独有的 `hintEl.classList.add('visible')`。
- 验证：7 页打字速度的主观感受与基线一致（可录屏逐帧比对首字到末字的总时长）。

### 第 8 步 · 处理 index（**独立、高风险**）
- index 是唯一一个「多 style 块 + 多 script 块 + 大量页面专属逻辑」的页面。
- ⚠ **R3**：index 的点击涟漪缺 `reducedMotion` 判断 —— **保持现状**，或单独开一个 commit 明确标注为行为修复。
- ⚠ **R14**：index 的 `env(safe-area-inset-*)` 缺失是刻意的还是遗漏？**待确认**，先不要动。
- 验证：index 的英雄名片、寄语切换、生日彩蛋、花瓣 canvas 全部正常。

### 第 9 步 · 处理 armor（**最后做**）
- armor 是异形页（R12/R13），共享面最窄（只有 A 组 8 条 + 可能的 `@keyframes`）。
- 它的 `.filter-chip` / `.card-*` / `.type-badge.*` 全是 C 组，不进共享文件。
- ⚠ **顺手修 P1**：给 `armor.html` 的 `:root` 补上 `--gold-soft:#ffe5a0`（或把 `.type-badge.skin` 改用 `var(--gold)`）。
- 验证：armor 的筛选器、卡片展开、徽章颜色正常；`.type-badge.skin` 的文字颜色从「继承色」变回金色。

### 第 10 步 · 收尾清理
- 删掉 §1.4.3 里的 9 个死变量（**单独 commit**，方便回滚）。
- 删除 R5 的两条 dead CSS（`.ripple-spark` / `.ripple-confetti`）。
- ⚠ `--bg-mid`（R6）8 页都定义都无用 —— 删除前全局搜 `bg-mid` 确认无动态读取。

---

# 5. 附录

## 5.1 待确认项（不做猜测）

| # | 项 | 为什么不确定 | 建议如何确认 |
|---|---|---|---|
| Q1 | `.timeline-dot` 的尺寸三档（12px / 13px / 14px）是有意设计还是漂移？ | aponia/kevin/su=12px，eden/kalpas/villv=14px，index=14px，armor=13px。看不出与视觉主题的相关性。 | 问设计者；或按「12px 是早期版本、14px 是新版」假设统一。**统一前先截图对比。** |
| Q2 | `.opening-subtitle` 的 `clamp(...,1.3rem)` (index) vs `1.25rem`（其余） | 无法判断是刻意的还是笔误。 | 视口设成 375px 对比 index 和其他页的副标题字号。 |
| Q3 | index 点击涟漪缺 `reducedMotion`（R3） | 可能是有意（首页想要最丰富的效果），也可能是漏写。 | 问设计者；倾向「漏写」，因为 index 也定义了 `reducedMotion` 变量却没用。 |
| Q4 | villv 缺粒子 resize 守卫（R10） | 可能是有意（villv 的彩带设计不需要重定位），也可能是漏写。 | resize 窗口后看 villv 彩带是否异常集中/消失。 |
| Q5 | `--bg-mid`（R6）的语义 | 8 页定义、0 页使用，无从推断它原本该用在哪。 | git log 查它最后一次被使用是哪次 commit。 |
| Q6 | index 的 `env(safe-area-inset-*)` 缺失（R14） | 同上，可能是首页无需安全区处理（首屏没有底部元素），也可能是漏写。 | 在 iPhone 模拟器上看 index 底部是否被 Home Indicator 遮挡。 |
| Q7 | `.quote-card` 在 villv 的 `rgba(255,209,107,.04)`（R8） | `107` vs `102` 肉眼不可辨，无法判断是否有意微调。 | 对比 villv 其他 14 处 `--gold` 相关色值，几乎全是 `102`/`#ffd166` → 倾向笔误。 |
| Q8 | 各页 `@keyframes glow-pulse` 的时长（5s/6s/7s/8s）与 `card-rotate` 时长（16s~30s）是否有设计意图 | 分布看似随机，但也可能是按角色性格调的（villv 最快、su 最慢）。 | 问设计者；**默认应当保留每页各自的值，不要统一**。 |

## 5.2 结论速查

- **A 组 31 条** → 可直接进 `assets/site.css`（§1.1 有完整源码初稿）。
- **B 组 47 条** → 留各页做主题覆盖；其中 12 条只是前导零写法差异（§3-R1），归一化后可并入 A 组。
- **C 组 225 条** → 页面专属，不动。
- **`:root` 未定义却引用：真问题 1 处**（`--gold-soft`，`armor.html:82` 引用 / 只在 `index.html:17` 定义）；另有 7 个「未定义但由 JS 运行时注入」的合法变量，以及 9 个「定义了从未使用」的死变量。
- **JS：没有一对跨页函数是完全相同的**；最值得抽的是 6 个子页逐字节一致的「语录卡构建」与「IntersectionObserver」两段内联代码，以及逻辑等价的 `resize`。
- **最危险的 3 个风险点**：
  1. **R12 · armor 的 timeline 是另一套结构** —— 把 armor 并入 7 页版本会让整页布局错位。
  2. **R3 · index 点击涟漪缺 `reducedMotion`** —— 统一后 index 在减弱动效下行为改变。
  3. **R4 · `--gold-warm` / `--flame` 同名不同值** —— 提升为公共 token 会同时改掉两页的颜色。
