# elysiad.top 更新设计（十项功能整合）

> 状态：已确认，待实现
> 日期：2026-09-15
> 仓库：`elysiamsia/elysia`（public）｜分支：`dev`
> 关联文档：`2026-08-28-elysia-voice-timeline-design.md`、`2026-08-29-ending-stars-and-hereos-design.md`

---

## 一、目标

在现有 8 个静态页面上，加入十项新功能，同时把已经积累的技术债做一次有针对性的收敛。

这十项来自需求方，按其原有分层：

**情感向** —— 献花互动、每日一语、隐藏彩蛋
**体验优化** —— favicon、分享卡片（OG）、404 页面、图片压缩
**进阶玩法** —— giscus 留言簿、语录明信片生成

---

## 二、现状（实测结论）

以下均为 2026-09-15 在真实环境实测所得，不是推测。

### 2.1 站点

| 项目 | 实测结果 |
|---|---|
| 页面数 | 8（`index.html`、`armor.html`、6 个角色页） |
| 首页体积 | 52,680 B 原始 / **16,975 B gzip** |
| 外部依赖 | **零**——无 CDN、无外链字体、无 `<link>`、无内联事件属性 |
| 图片 | **8 张 PNG 共 5.0 MB**，最大 `armor-ego.png` 1024×984 / 1019 KB |
| 仓库 | GitHub 侧 34.3 MB；工作区 `images/` 27 MB，其中 `images/raw/` **22 MB 且站点从不引用** |
| 压缩 | GitHub Pages 已开 gzip ✅ |

### 2.2 缺失项（实测 404）

```
404  /robots.txt       404  /sitemap.xml
404  /favicon.ico      404  /404.html
```

8 个页面全部：**无 `meta description`、无 `og:`、无 `twitter:`、无 `canonical`、无 favicon**。
撞到 404 时落到 GitHub 的英文默认页（`Page not found · GitHub Pages`）。

### 2.3 结构性缺陷

**零共享资源。** 同一套玻璃拟态卡片、时间轴、语录逻辑、canvas 粒子、打字机，在 8 个文件里各写了一遍：

| 文件 | 行数 | 体积 |
|---|---|---|
| `villv/index.html` | 1169 | 54,820 B |
| `index.html` | 1156 | 52,680 B |
| `su/index.html` | 931 | 41,329 B |
| `kalpas/index.html` | 917 | 41,060 B |
| `aponia/index.html` | 675 | 30,590 B |
| `kevin/index.html` | 674 | 30,195 B |
| `eden/index.html` | 636 | 28,651 B |
| `armor.html` | 233 | 12,711 B |

已经因此产生一个真实的视觉 bug：`armor.html:82` 使用 `var(--gold-soft)`，但该文件的 `:root`（`armor.html:10-17`）**没有定义这个变量**——它只存在于 `index.html:17`。皮肤徽标的文字色静默失效。

**动画降级缺失。** 8 个页面里 `prefers-reduced-motion` **只在 JS 的 canvas 与部分涟漪中处理**；所有 CSS 动画（`blink-cursor`、`chevron-bounce`、`card-rotate`、`glow-pulse`、`twinkle`、`hero-float`、`bdayFloat`、`bdayPulse`）无一处降级。`villv` 的「对凯文武装型号666」全屏白闪（`villv:339-341`）与 `kalpas` 的 `0.09s` 全页抖动（`kalpas:51-57`）**完全没有读取 `reducedMotion`**，属 WCAG 2.3.1 风险。

**部署范围失控。** `.github/workflows/static.yml:39` 为 `path: '.'`——整个仓库原样发布。实测公网可读：

```
200  /tools/README.md
200  /docs/superpowers/plans/2026-08-28-elysia-voice-timeline.md
200  /tools/cdp.py
```

`docs/` 记录了本机绝对路径（`C:\Users\dong\Downloads\IMG_0276等26项文件\`）等内容；`tools/cdp.py:6` 硬编码本机 Edge 路径。`docs/` 已于 2026-09-14 手动删除，但 `tools/` 与 `images/raw/` 仍在公网。

### 2.4 数据文件问题

`data/timeline-data.js` 中 **13 位英桀里有 12 位的 `lore` 是两份稿子叠加**——旧稿未删，新稿直接续在后面。首页 `.hero-lore` 原样渲染，点开名片即可见。其中含：

- OCR 坏文：`「凶笼」`（应为「囚笼」，`:117`）、`「抓马」`/`「守难口磨去了金瞳」`（`:338`）
- 截断碎片：`「步，化为飞溅的片羽…」`（`:68`）
- 孤立标点与孤立姓名行：`:110`、`:116`、`:165`、`:249`、`:298`
- 同段两个版本并存且用词冲突：千劫「魇杀」vs「磨灭」（`:187-193`）、苏「洞悉因果的知者」vs「闭目沉思的智者」（`:207` vs `:215`）

13 位中仅 `her-08`（樱）无重复段。

---

## 三、已确认的设计决策

以下九项经逐项确认，作为后续实现的约束。

| # | 决策 | 结论 |
|---|---|---|
| 1 | 架构策略 | **抽公共层 + 新功能进共享模块**——收敛 8 份复制，但不改动各页视觉个性 |
| 2 | 献花计数语义 | **真·全站共享**（服务端计数），非本地计数 |
| 3 | 情感层覆盖范围 | **仅首页**（`index.html`）。6 个角色页保持现状 |
| 4 | 留言簿 | **giscus + GitHub 登录门槛**，独立页 `/guestbook/` |
| 5 | 部署范围 | **本轮修好**，`static.yml` 改白名单；文档回归 `docs/` |
| 6 | 献花位置 | **谢幕区**，十三名片星域之下、收束寄语之上 |
| 7 | 明信片比例 | **手机 1080×1440（3:4）+ 电脑 1200×800（3:2）**，另给手动切换 |
| 8 | og:image 版式 | **立绘在右 · 文案在左** |
| 9 | 404 形态 | **引路版**——一句安慰 + 三扇门 |

### 3.1 明确不做（YAGNI）

- 不做免登录留言（已定用 GitHub 登录）
- 不做全站献花（已定仅首页）
- 图片**不做 PNG 兜底**（WebP 自 2020 起全支持，兜底会让仓库体积翻倍）
- **不引入任何构建工具**——仍然是零构建的纯静态站。`worker/` 是唯一需要「部署动作」的产物
- 不引入 Web 字体（继续用系统字体栈，保持离线可用）

---

## 四、目录结构

```
elysia-main/
├── assets/                     【新增】共享层
│   ├── site.css                  玻璃卡 / 区块标题 / 时间轴 / 语录 / 404 通用件 / 减动保护
│   ├── site.js                   粒子 / 打字机 / 滚动观察 / 语录逻辑 / 涟漪
│   ├── flowers.js                献花（仅首页引用）
│   ├── daily.js                  今日之语（仅首页引用）
│   ├── egg.js                    隐藏彩蛋（仅首页引用）
│   └── postcard.js               明信片生成（仅首页引用）
├── data/
│   ├── timeline-data.js          【不变】
│   └── quotes.js               【新增】语料池，首页 / 404 / 明信片共用
├── images/
│   ├── *.webp                  【新增】由现有 PNG 转换
│   ├── og.png                  【新增】1200×630，必须 PNG，不可 WebP
│   └── raw/                  【默认保留在仓库备份，但不部署——待确认，见 §9】
├── worker/                     【新增】献花后端（源码，不部署为静态文件）
├── favicon.svg                 【新增】内联水晶花
├── 404.html                    【新增】
├── robots.txt  sitemap.xml     【新增】
├── docs/superpowers/specs/       文档回归此处（不再被部署）
└── (8 个原有页面，改为引用 assets/)
```

---

## 五、分阶段实现

### P0 · 部署收口

**目标**：让公网只剩下该被看到的东西。

1. 改写 `.github/workflows/static.yml`，把 `path: '.'` 换成显式白名单：只打包 `index.html`、`armor.html`、`404.html`、`data/`、`images/`（不含 `raw/`）、6 个角色页目录、`assets/`、`favicon.svg`、`robots.txt`、`sitemap.xml`
2. `.gitignore` 补 `images/raw/`（若选择不追踪）、`audio/`、`.venv/`、`node_modules/`
3. （可选）加一份 `.gitattributes`，写入 `* text=auto eol=lf`——当前系统级 `core.autocrlf=true`，统一后 diff 更干净

**验收**：部署后 `curl` 确认 `/tools/README.md`、`/docs/…`、`/images/raw/…` 全部返回 404，而 8 个页面与所有站点图片仍可访问。

**为什么排第一**：改动最小、最紧急（`tools/cdp.py` 目前公网可下载），且不依赖任何其他阶段。

### P1 · 公共层抽取

**目标**：把 8 份复制收敛成 1 份，之后每个新功能只需改一处。

1. 从 8 个页面中提取**真正共享**的部分到 `assets/site.css` 与 `assets/site.js`：
   - 共享样式：`:root` 变量、玻璃拟态卡片、区块标题、时间轴、语录卡、`back-link`
   - 共享脚本：canvas 粒子系统、打字机、IntersectionObserver 滚动动画、语录卡逻辑、resize 处理
   - **各页面保留自己的主题色覆盖与专属模块**（`kalpas` 的怒气 HUD、`su` 的木鱼、`villv` 的八人格卡等一律不动）
2. **顺带修掉 `armor.html:82` 的 `var(--gold-soft)` 未定义问题**
3. **全站补齐 `prefers-reduced-motion`**：
   - 新增 `@media (prefers-reduced-motion: reduce)` 段，统一关闭 CSS 动画
   - 给 `villv` 的 `fireKevinKiller666()` 与 `kalpas` 的 `startRage()` 加 `reducedMotion` 判断——命中时跳过闪烁层，只保留文字与最终状态
   - `villv:596` 的全屏遮罩补焦点管理（打开时聚焦遮罩内首个可聚焦元素，关闭时归还焦点）
4. 统一语录卡逻辑为闭包索引 O(1)（子页目前是 `indexOf.call(querySelectorAll(...))` 的 O(n) 写法，而首页已改对）

**验收（硬性）**：用 `tools/cdp.py` 在 `1280×900` 下对 8 个页面**逐页截图**，改动前后必须**像素级一致**。任何差异都要定位到原因。另需在 `375×812`（移动端）再截一轮。

**为什么排第二**：这是风险最高的一步，也是后面所有工作的杠杆。放在前面，P2–P4 每项都只改一处；放在后面，则要改完再搬，成本翻倍。

### P2 · 基础件

**目标**：补齐 8 个页面缺失的基础设施，纯增量，不碰现有逻辑。

1. **favicon.svg** —— 内联 SVG 粉色水晶花，一行 `<link>` 接入 8 个页面
2. **404.html** —— 引路版（见 §6.6）
3. **robots.txt / sitemap.xml** —— 8 个页面
4. **图片转 WebP** —— 8 张 PNG → WebP（预期 5.0 MB → 约 600 KB）；`armor.html` 生成的 `<img>` 补 `width`/`height` 防 CLS
5. **OG 标签** —— 见 §6.5

**验收**：`<picture>` 或直接 `<img src="*.webp">` 在 Edge / Chrome / Firefox 中显示正常；`og.png` 通过各平台调试工具校验；WebP 总体积小于原 PNG 的 20%。

### P3 · 情感层（仅首页）

**目标**：让首页从「一个介绍页」变成「一个可以停留的地方」。

按顺序实现：`data/quotes.js` 语料池 → 今日之语 → 献花（含 worker）→ 隐藏彩蛋。

详见 §6.1、§6.2、§6.3。

**验收**：语料池在首页、404、明信片三处复用同一文件；献花在接口不可用时仍正常显示（降级验证需手动断开 worker 域名测试）。

### P4 · 进阶

1. **语录明信片生成**（§6.4）
2. **giscus 留言簿**（§6.7）

**验收**：明信片在移动端与桌面端各生成一张，下载后图片可正常打开且文字清晰；giscus 需登录后可发帖。

---

## 六、各功能设计

### 6.1 今日之语

**位置**：首页「关于她」之后、「她的旅途」之前，作为一条独立的纤细语句带。

**取句规则**：`index = (本地日期的天数) % 语料池长度`。

必须用**访客本地日期**而非 UTC——UTC 会让中国用户在早上八点才看到换句。

**语料池**：复用首页现有 10 句「飞花寄语」，存于 `data/quotes.js`，供首页 / 404 / 明信片三处共用。

> ⚠ 10 句意味着 10 天一轮。若希望更耐看，需要需求方提供**有出处**的新台词素材。本项目数据纪律为「绝不编造」，因此本设计**不新增任何台词**。

### 6.2 献花互动

**位置**：首页谢幕区——十三英桀名片星域之下、收束寄语之上。

**交互**：点击「献上一朵飞花」，花瓣从点击处向上飘散并汇聚；计数 +1。

**后端**：

```
GET  /count   → {"count": 1247}
POST /flower  → {"count": 1248}
```

- 部署于 Cloudflare Worker + KV，域名 `flowers.elysiad.top`
- **域名前提已确认可行**：`elysiad.top` 的 NS 已是 `hank.ns.cloudflare.com` / `fish.ns.cloudflare.com`，DNS 本就托管在 Cloudflare，只需新增一条子域
- 按 IP 限流（每 IP 每日 5 朵）
- **只存 `hash(ip + 每日盐)` 的当日计数，不落 IP 原文**
- CORS 仅允许 `https://elysiad.top`

**降级（必须实现）**：页面侧请求超时 1.5 秒。接口不可用时静默切换为本地计数，文案变为「你的花已送达 · 本机累计 N 朵」。**任何情况下都不显示错误提示。**

> ⚠ **风险**：Cloudflare 的边缘节点在中国大陆可能缓慢或被限。降级路径不是加分项，是必需项。由于本站自身也托管于 GitHub Pages（同样在中国大陆访问不稳），该风险与现状相当，但不为零。

### 6.3 隐藏彩蛋

**触发**：连续点击首页开场标题 5 次。

**表现**：水晶花雨 + 浮现一句隐藏台词。

**约束**：
- 隐藏台词必须**在仓库中标注出处**（沿用项目「绝不编造」纪律）。若暂无有出处的素材，本项**推迟实现**，不自行编造
- 减动模式下把花雨降级为静态浮现
- 标题 `#typewriterText` 由打字机写入，点击计数**不等待打字完成**，随时可累计
- 需与全局点击涟漪共存：彩蛋触发时暂停涟漪，避免 DOM 噪音

### 6.4 语录明信片生成

**触发**：首页新增入口，随机抽一句台词。

**尺寸**：

| 场景 | 尺寸 | 判定 |
|---|---|---|
| 移动端 | 1080 × 1440（3:4） | 视口宽度 < 768px |
| 桌面端 | 1200 × 800（3:2） | 视口宽度 ≥ 768px |

另提供「竖版 / 横版」手动切换——用电脑的人常是为了存下来发朋友圈，设备对了心思不一定对。

**版式**：四角水晶花装饰 · 居中台词 · 落款「—— 爱莉希雅」 · 底部小字 `elysiad.top`

**实现要点**：
- 复用 `site.js` 中已有的花瓣绘制函数，不重写
- Canvas 使用与站点相同的系统字体栈，天然一致；但必须 `await document.fonts.ready` 后再绘制，否则会以 fallback 字体落笔
- 出口：`canvas.toBlob()` + `<a download>`；移动端提示「长按保存」

### 6.5 分享卡片（OG 标签）

**og:image**：1200×630 静态图，**立绘在右 · 文案在左**。

- 左侧：`致 爱 莉 希 雅` / `E L Y S I A` / 分隔线 / `往世乐土 · 她的旅途 / 十三英桀 · 飞花寄语` / `11 / 11　她的生日`
- 右侧：立绘 + 粉色径向光晕

**多变体与轮换（2026-09-15 补充）**：三张立绘各出一张卡片，全部保留：

| 变体 | 立绘 | 说明 |
|---|---|---|
| `og-1.jpg` | 粉色妖精小姐♪ | 初遇那位粉色妖精，缩略图可读性最好 |
| `og-2.jpg` | 真我·人之律者 | 她的本质形态 |
| `og-3.jpg` | 嗨♪爱愿妖精♥ | **原图自带两个 UI 截图浮层**，因此单张方案作废，但作为轮换变体保留 |

由 `tools/pick_og.py` 随机轮换当前生效的那一张，并把 8 页的 `og:image` 同步改掉。

**⚠ 格式从 PNG 改为 JPEG（2026-09-16 补充）**

上线后实测：QQ / 微信分享不显示预览。排查结论是**服务端没问题**——第三方 OG 解析服务（Microlink）把 `title` / `description` / `image.url` / `image.size` / `logo` **全部正确读出**，三种爬虫 UA（微信、QQ、bytespider）访问也都返回 200 + 完整标签，robots 未拦截。

剩下的两个可改因素里，**图片体积**是最可疑的一个：

| | PNG | JPEG q92 | 省下 |
|---|---|---|---|
| og-1 | 537 KB | **89 KB** | 83.4% |
| og-2 | 607 KB | 105 KB | 82.7% |
| og-3 | 630 KB | 129 KB | 79.6% |
| 合计 | 1774 KB | **323 KB** | **81.8%** |

537 KB 的图下载要 1.79 秒（实测 307 KB/s），而爬虫的超时通常比人短。转成 JPEG 后画质**肉眼无差别**（已逐张目视确认：文字锐利、渐变无色带）。

**结论：og:image 用 JPEG，不再用 PNG。** 规范里"不能用 WebP"这条依然成立（微信不认 WebP），JPEG 是允许的。

出图流水线见 `tools/pick_og.py` 顶部注释；格式转换工具是 `tools/og_convert.py`。

**另一个已排除的因素：主站托管。** 排查时发现 `elysiad.top` 当时**直连 GitHub Pages（Fastly），未走 Cloudflare 代理**，而大陆实测首字节 0.68~1.17s。已开启橙云代理（现解析到 `104.16.x.x`、响应头 `Server: cloudflare`），这对**所有大陆访客**的速度都有影响，不只是分享预览。

> ⚠ **限制**：微信 / QQ 的预览图由平台自行抓取并缓存，缓存期可能数天到数周。因此「每次分享都随机」在这些平台上**做不到**——服务端随机对它们无效。本设计实现的是「**轮换当前生效的那一张**」。若改为 Worker 每请求随机，则分享卡片的可用性会绑在 Worker 上，Cloudflare 在中国大陆不通时是空白预览图，**不采用**。

**关键约束**：
- **og:image 只能用 PNG / JPG，绝不能用 WebP**——微信的预览不支持 WebP
- `og:url` 必须是绝对地址 `https://elysiad.top/…`
- 每个页面各自的 `og:title` / `og:description`（凯文页有凯文自己的描述）
- 补 `twitter:card` 与 `theme-color`

> ⚠ 待实测：微信内的自定义分享卡片（标题/描述/缩略图）需要公众号 JS-SDK，本方案不涉及；微信的基础预览取 `<title>` 与页面图片。QQ / 微博 / Twitter / Telegram 正常读取 OG 标签。

### 6.6 404 页面

**形态**：引路版——一句安慰 + 三扇门。

```
这里还没有被乐土记录哦……
不过，来都来了——

[ 她的旅途 ]  [ 她的装甲 ]  [ 飞花寄语 ]
     9 段          时间轴          10 句
```

三扇门指向 `/#journey`、`/armor.html`、`/#quotes`。

**技术约束**：
1. 文件放**仓库根目录** `/404.html`，不能放子目录
2. 内部所有链接与资源路径**必须绝对路径**（`/index.html`）——访客可能撞在 `/a/b/c/d` 上，相对路径会二次出错
3. HTTP 状态码保持 404，**不得**用 meta refresh 伪装 200
4. 该页**不引入**首页的 Canvas 粒子与点击涟漪，保持轻量

### 6.7 giscus 留言簿

**位置**：独立页 `/guestbook/`，滚动到可见时才注入脚本。

**⚠ 入口（2026-09-16 补充，原设计遗漏）**：留言簿是独立页，但原设计**没有规定任何页面如何链到它**——结果上线后它成了一个**孤岛**，只能手敲网址才能到达，需求方实际就因此找不到留言的地方。

**入口规格**：首页谢幕区，**献花区之后、收束寄语之前**加一个小胶囊链接：

```
… 十三英桀名片星域
… 献上一朵飞花 · 这里已收到 N 朵花
… 想对她说句话吗 →          ← 指向 /guestbook/
… 「带着我们的祝福，继续前进吧。」
```

- 用真的 `<a>` 元素（键盘可达），不是 div + click
- 顺序有讲究：**献花（动作）→ 留言（言语）→ 寄语（收束）**，读起来是顺畅的
- 样式沿用站点的粉紫胶囊体系，但比献花按钮**轻一档**（它是配角，不抢献花的份量）

**未采用**：6 个角色页**不加**此入口——留言簿的定位是「想对**爱莉希雅**说的话」，出现在「致凯文」这类页面上语义不对。

**配置**（参数已从仓库实查，可直接使用）：

```html
<script src="https://giscus.app/client.js"
        data-repo="elysiamsia/elysia"
        data-repo-id="R_kgDOUCa0bA"
        data-category="Announcements"
        data-category-id="DIC_kwDOUCa0bM4DFlz5"
        data-mapping="pathname"
        data-strict="0"
        data-reactions-enabled="1"
        data-emit-metadata="0"
        data-input-position="bottom"
        data-theme="dark"
        data-lang="zh-CN"
        data-loading="lazy"
        crossorigin="anonymous"
        async>
</script>
```

**两处修正说明**：

- `data-category` / `data-category-id` 原为占位符。分类选用 **Announcements**（`DIC_kwDOUCa0bM4DFlz5`）——该分类只有维护者能新建 discussion，访客无法绕开组件乱建帖子
- `data-theme` 原为 `preferred_color_scheme`。本站固定深紫黑配色，跟随系统会让浅色系统用户看到一块白板。改为固定 `dark`

**前置条件（已完成 ✅）**：仓库 public、Discussions 已开启、giscus App 已安装。

**已知门槛**：访客必须拥有 GitHub 账号才能留言。经确认接受此门槛。

---

## 七、依赖与前置

| 项 | 状态 |
|---|---|
| 工作副本接上 git | ✅ 已完成——`elysia-main` 已 `git init`、接远程、切至 `dev`、push 通路已验证 |
| `tools/cdp.py` 可用 | ✅ 已验证——Edge(x86) 路径存在、`websocket-client 1.9.0`、`Python 3.11.9`；实跑 `index.html` 截图成功 |
| 仓库 public + Discussions 开启 + giscus App | ✅ 已完成 |
| DNS 托管在 Cloudflare | ✅ 已确认，可加子域 |
| Cloudflare 账号（部署 worker） | ⬜ 待确认 |
| 有出处的隐藏台词素材 | ⬜ 待提供，否则 6.3 推迟 |
| 有出处的扩充实语料（可选） | ⬜ 待提供，否则语料池为 10 句 |

---

## 八、环境侧建议（不改也能跑，但建议处理）

当前 `git config --global` 中有三项历史遗留：

```bash
http.proxy  = http://127.0.0.1:7890    # 该端口已无进程监听，导致 push/fetch 全部失败
https.proxy = http://127.0.0.1:7890
http.sslverify = false                  # 全局关闭 HTTPS 证书校验，存在中间人风险
```

已实测：绕过代理**直连 GitHub 正常**，且**开启 `sslverify` 后仍可正常连接**。因此三项均可移除。

当前 `elysia-main` 的做法是**仓库级覆盖**（`http.proxy=''`、`credential.helper=!gh auth git-credential`），未改动全局配置——若希望彻底清理，再由需求方执行上述 `--unset`。

---

## 九、待确认事项

1. **`data/timeline-data.js` 的 `lore` 重复稿清理是否纳入本轮？**（§2.4）该问题不在十项功能内，但它就显示在首页最显眼处，用户点开名片即可见。本设计不擅自扩大范围
2. **是否保留 `images/raw/` 于仓库？** 保留则占用约 22 MB 仓库体积（有版本历史、可回滚）；移出则仓库精简但失去历史
3. **Cloudflare Worker 的账号归属**（用哪个账号部署，是否与现有 DNS 同一账号）

---

## 十、验收清单

- [ ] P0：`/tools/README.md`、`/docs/…`、`/images/raw/…` 返回 404；8 个页面与站点图片正常
- [ ] P1：8 个页面在 1280×900 与 375×812 下改动前后**像素级一致**；`--gold-soft` 恢复正常；减动模式无闪烁动画
- [ ] P2：favicon 显示；分享卡片有预览图；404 显示自定义页；WebP 总体积 < 原 PNG 的 20%
- [ ] P3：今日之语每日轮换且同日一致；献花计数全站共享；断网时献花降级不报错
- [ ] P4：明信片双尺寸生成正常；giscus 登录后可留言
- [ ] 全站：`dev` 验收通过后合并至 `main`，确认 Actions 部署成功

---

## 十一、上线后待办

以下事项**依赖站点已上线**，在 `dev` 上无法完成，合并到 `main` 之后需要补做。

### 11.1 giscus 留言簿真实留言测试

页面未上线时无法做。上线后：

1. 打开 `https://elysiad.top/guestbook/`
2. 用 GitHub 账号登录并发送一条测试留言
3. 到 `https://github.com/elysiamsia/elysia/discussions` 确认对应 discussion **创建在 `Announcements` 分类下**
4. 删除测试留言与对应的 discussion

### 11.2 分享卡片预览实测

`og:` 标签只能在各平台的调试工具里验证，本地测不了。上线后逐个试：

| 平台 | 怎么验 |
|---|---|
| Telegram / Discord / Twitter | 直接粘贴链接，看是否出卡片 |
| QQ | 发给自己，看预览 |
| 微信 | 发到文件传输助手，看预览 |

**预期**：QQ / 微博 / Twitter / Telegram 正常读取 OG 标签；微信的基础预览取 `<title>` 与页面图片。**微信的自定义分享卡片需要公众号 JS-SDK，本方案不涉及。**

若预览没出图，先查 `og:image` 的绝对地址是否可达（`curl -I https://elysiad.top/images/og-N.png` 应为 `200 image/png`）。

### 11.3 生日观察点：11 月 11 日

**当天记录献花总数。** 判断依据见 `worker/README.md` §11：

- 接近或超过 **500** → 需要换 Durable Objects（方案见 §11.9）
- 只有几十朵 → 一直不用换

同时留意当天有没有出现"数字冻住不涨"的现象——那是 KV 写额度耗尽的信号。

### 11.4 献花计数

当前线上计数是测试期间留下的（`{"count":3}`）。需求方已确认**不清零**。

### 11.5 尚未开工的部分

**`docs/superpowers/plans/2026-09-15-elysiad-extraction.md`（P1 公共层抽取，12 个任务）尚未执行。**

它是独立的一份计划，与本轮的十项功能**没有依赖关系**（新功能全部写在新建的 `assets/*.js` 里、且只有首页引用）。何时执行由需求方决定；执行前请先读 `2026-09-15-extraction-inventory.md` 的第 3 节（风险清单）与第 5.1 节（待确认项）。

### 11.6 一个已知的缓存行为

GitHub Pages 的 `Cache-Control` 是 `max-age=600`。**改了 `assets/` 下的任何文件，访客最多 10 分钟后才会看到新版本。** 测试时若发现改动"没生效"，先怀疑浏览器缓存——加个 `?v=<时间戳>` 再试。

### 11.7 匿名花笺（2026-09-16 新增需求）

**背景**：giscus 要求 GitHub 账号，而访客大多从 QQ / 微信点进来。实测反馈是"找不到留言的地方"——补了入口之后，新问题是**没有 GitHub 账号的人根本留不了言**。

**决策**：不换评论系统（换则现有 giscus 评论要迁移，且 Waline 等自建方案在大陆的可达性依赖备案或境外主机）。改为**在 giscus 之上加一条自建匿名通道**，两条通道在展示层合成一堵墙。

**复用现有基础设施**：Cloudflare Worker + D1，域名复用 `flowers.elysiad.top`（**大陆可达性已由需求方手机实测确认**）。**不用 KV**——KV 有 1000 写/天的实测坑，且本需求要列表读取。

#### 存储（D1）

```sql
CREATE TABLE notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,                     -- 毫秒时间戳
  day        TEXT    NOT NULL,                     -- YYYY-MM-DD（北京时区），用于限流
  name       TEXT,                                 -- 昵称，可空，≤16 字
  body       TEXT    NOT NULL,                     -- 正文，≤80 字
  status     TEXT    NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  ip_hash    TEXT    NOT NULL,                     -- hash(IP + 每日盐)，不存原文
  token      TEXT    NOT NULL                      -- 32 位随机十六进制，提交者自查用
);
CREATE INDEX idx_notes_status_id ON notes(status, id DESC);
CREATE INDEX idx_notes_rate ON notes(day, ip_hash);
```

免费额度：500 MB/库、5,000,000 行读/天、100,000 行写/天——远超需求。

#### 接口

```
POST /notes
  body: {"name": "小星", "body": "谢谢你一直在。"}
  → 201 {"ok": true, "token": "<32 位十六进制>"}
  → 400 {"error": "too_long" | "empty" | "has_link"}
  → 429 {"error": "rate_limited"}

GET /notes
  → 200 {"notes": [{"id","name","body","created_at"}]}    只含 approved，最多 200 条

GET /notes?tokens=a,b,c
  → 200 {"notes": [{...,"status":"pending"}]}              按 token 取自己的，含未审核的

GET  /notes/manage?key=<密钥>
  → 200 极简 HTML 列表（待审在前），每条带「通过」「删除」两个表单按钮
POST /notes/manage?key=<密钥>
  body: {"id": 12, "action": "approve" | "reject"}
  → 302 重定向回管理页
```

#### 校验与限流（服务端，不可绕过）

| 规则 | 处理 |
|---|---|
| `body` 去空白后为空 | 400 `empty` |
| `body` 超 80 字 / `name` 超 16 字 | 400 `too_long` |
| `body` 含 URL（`http://`、`www.`、`://`） | 400 `has_link` |
| 同 `ip_hash` 当日已提交 ≥ 3 条 | 429 `rate_limited` |
| 以上全过 | 入库，`status='pending'` |

**注意**：匿名通道的校验必须**全部在服务端**做——前端校验只是体验优化，不是防线。

#### 审核（需求方选定：先审后发）

- 新提交一律 `status='pending'`，**不出现在公开列表里**
- 需求方打开管理页（密钥存为 Worker secret `MANAGE_KEY`），点「通过」→ `status='approved'`；点「删除」→ `status='rejected'`
- 管理页用密钥做凭证，**不做登录系统**；密钥走 URL 查询参数，服务端比对，不匹配返回 404（不是 403——不暴露这个入口存在）

#### ⚠ 先审后发的体验补偿（必须实现）

留言者提交后**看不到自己的话**，会以为失败——而"被记住"正是这个地方的全部意义。所以：

1. **提交成功后立刻在页面上显示自己那条**，带一个灰标「待上墙」
2. 实现方式：POST 返回的 `token` 存进 `localStorage`，之后 `GET /notes?tokens=…` 把它取回来（含 `status`）
3. **别人看不到**这条——它不在公开列表里
4. 审核通过后灰标消失（下次刷新时 `status` 变成 `approved`）
5. 提交后的文案要诚实又温柔，不能是「发布成功」（它还没上墙）：
   > 「收到啦。这句话会先在这里安静地待一会儿，再出现在墙上。」

#### 无障碍与减动

- 表单控件用原生 `<input>` / `<textarea>` / `<button>`，天然键盘可达
- 提交状态用 `aria-live="polite"` 播报，读屏用户能听到「已收到」
- 列表项的进场动画在 `prefers-reduced-motion: reduce` 下关闭

#### 与 giscus 的关系

giscus **原样保留**在匿名区下方，两者是同一页的两块。**不做数据合并**——两种通道的身份、长度、能力本来就不同，硬合并会造成"为什么这条能回复那条不能"的困惑。视觉上明确分区即可。
