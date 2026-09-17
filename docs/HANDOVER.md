# elysiad.top 项目交接文档

> 写给下一个接手的人（或 agent）。**动手前请通读一遍**，尤其是 §六 的坑。
> 最后更新：2026-09-17
>
> 🎯 **如果你是接手 P1 的下一个 agent，直接跳 §5.1 末尾的「🎯 下一步做什么」。**
> 那里写清了：下一步做 Task 9、注意事项、验证协议怎么跑、
> 以及**开新页面之前必须先向需求方确认的一件事**。

---

## 一、这是什么

**`elysiad.top`** —— 一个《崩坏3》角色**爱莉希雅**的致敬网站。

- 由需求方个人制作、个人维护，非商业、无收益
- 主要内容：她的档案、旅途时间轴、装甲时间轴、语录、六位同伴（逐火十三英桀）的独立页
- 受众以**中国大陆的手机访客**为主，多数从 QQ / 微信点进来
- 站点是**纯粹的情感表达**，不是作品集、不是技术 demo

**理解了这一点，很多取舍就有答案了**：为什么花那么大力气做降级、为什么文案要温柔、为什么"被记住"这个词反复出现。

---

## 二、当前状态

**全部已上线且可用。** 最近一轮（2026-09-15 ~ 09-16）加了十项功能，均已部署到 `main`。

| 阶段 | 状态 |
|---|---|
| 十项功能整合 | ✅ 完成并上线 |
| Cloudflare 后端（献花 + 花笺） | ✅ 已部署 |
| Cloudflare 缓存优化 | ✅ 已配置 |
| **献花在 QQ 浏览器上修好（同源 + 来源判定）** | ✅ 已修已部署，见 §4.3 |
| **`armor.html` 皮肤徽章失色** | ✅ 已修已部署，见 §4.4 |
| **P1 公共层抽取（12 个任务）** | 🟡 **进行中：Task 1–8 完成**（样式层 + 语录卡 / 滚动进场 / 打字机已抽完）|
| **`THEME` schema 定稿** | ✅ `docs/theme-schema.md`（13 页的模板，见 §5.1）|

---

## 三、仓库与基础设施

### 3.1 代码

| | |
|---|---|
| 仓库 | `github.com/elysiamsia/elysia`（public） |
| 默认分支 | `main` |
| **本地工作副本** | **`D:\claude-code\elysia-main`** |
| 线上 | `elysiad.top`（GitHub Pages + Cloudflare 代理） |

> ⚠ 早期文档里写的工作副本路径是 `D:\claude-code\elysia`，**那个目录已不存在**。

### 3.2 分支与部署

```
dev   ← 日常作业分支，push 不触发部署
main  ← push 即自动部署（static.yml）
```

**所有改动在 `dev` 上做，需求方检查后自己合并到 `main`。** 不要替他合并。

### 3.3 Cloudflare

| 项目 | 值 |
|---|---|
| 账号 | `dongqm070731@gmail.com` |
| Worker 名 | `elysia-flowers` |
| Worker 路由 | `flowers.elysiad.top`（自定义域）+ **`elysiad.top/notes*`**、**`elysiad.top/count`**、**`elysiad.top/flower`**（同源路由） |
| KV 命名空间 | `FLOWERS` / id `e2d964f0af9f4863820bcfa20a5aac7e`（献花计数） |
| D1 数据库 | `elysia-notes` / id `7683cdcf-0897-46d2-9e5a-14a3fb0a7394` / **主区域 APAC** |
| Secrets | `DAILY_SALT`（IP 哈希盐）、`MANAGE_KEY`（管理页密钥） |
| Cache Rule | `Hostname 等于 elysiad.top` → 符合缓存条件 → 边缘 TTL 2 分钟 |
| DNS | 已托管在 Cloudflare；主站**已开橙云代理** |

**部署命令**（wrangler 已在本机登录）：

```bash
cd D:\claude-code\elysia-main\worker
wrangler deploy
```

**需求方管理留言的入口**（密钥只有他知道）：

```
https://flowers.elysiad.top/notes/manage?key=<MANAGE_KEY>
```

---

## 四、已经做完的事

### 4.1 站点功能

| 功能 | 位置 | 说明 |
|---|---|---|
| 今日之语 | `data/quotes.js` + `assets/daily.js` | 按**访客本地日期**取句，同日一致、次日自动换 |
| 献花互动 | `assets/flowers.js` | 共享计数（KV），**接口不通时静默降级为本地计数** |
| 隐藏彩蛋 | `assets/egg.js` | 点开场标题 5 次 → 水晶花雨。**台词池为空，所以现在不触发**（有意为之） |
| 明信片生成 | `assets/postcard.js` | Canvas 出图，手机 1080×1440 / 电脑 1200×800，可手动切换 |
| 留言簿入口 | `index.html` 谢幕区 | 「想对她说句话吗 →」指向 `/guestbook/` |
| giscus 留言簿 | `guestbook/index.html` | 需 GitHub 登录 |
| 匿名花笺 | 同上 + Worker | 不用账号；**先审后发**；提交者凭 token 能看到自己那条 |
| 分享卡片 | `images/og-1\|2\|3.jpg` + `tools/pick_og.py` | 三个立绘变体，随机轮换 |
| favicon / 404 / robots / sitemap | 根目录 | 404 是引路版（一句话 + 三扇门） |
| 图片优化 | `images/*.webp` | 5.0 MB → 0.86 MB |

### 4.2 工程侧

- **部署白名单**：`static.yml` 改成只打包 `_site/`，`tools/ docs/ worker/ images/raw/ .github/` **永不进产物**
- **`.gitattributes`**：统一 LF（本机系统级 `core.autocrlf=true`）
- **`worker/test/`**：93 项断言（献花 38 + 花笺 55），用内存版假 D1，`npm run smoke`
- **`tools/` 现有工具**：`cdp.py`（无头 Edge，支持 `size` 动作切换视口）、`pick_og.py`（分享卡片轮换）、`og_convert.py`（PNG→JPEG）、`to_webp.py`（图片转 WebP）、**`snapshot.py` / `snapshot_diff.py`（双基线验证，见下）**、**`check_aria_labels.py`（属性断言，见下）**

**快照验证工具（2026-09-16 建立）**：

```bash
python -m http.server 8500 &              # 先起服务器
PYTHONIOENCODING=utf-8 python tools/snapshot.py <label>          # 8 页 × 3 视口 → screenshots/snap/<label>/
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py <旧> <新>   # 有差异退出码 1
```

机械判据是**计算样式 JSON 的差分**；PNG 只供人眼确认「不是白屏」。

⚠ **写这个工具时踩了五个坑，都修掉了，别再退回**（细节见工具内注释）：

| 坑 | 后果 |
|---|---|
| 浏览器 HTTP 缓存没关 | **每一次比对都返回假的「✅ 无差异」**——工具形同虚设。实测：改 0.0001em 都测不出来 |
| 无限动画停在随机相位 | 星星的 opacity、名片呼吸光的 box-shadow 每次都不同，全是噪音 |
| 星星是 `Math.random()` 生成的 | 尺寸/颜色/时长随机，两次跑必然不同。已用 `addScriptToEvaluateOnNewDocument` 固定种子 |
| 页面会去连线上献花接口 | 接口通/不通 → 文案不同 → **整页高度差 8px**。基线测的是网络不是代码。已 `setBlockedURLs` 屏蔽 |
| **日期在变**（2026-09-17 补） | 「今日之语」按本地日期取句、生日倒计时每天换字 → **同一天内怎么跑都零差异，跨过零点就报差异**。已把「现在几点」钉死在 `2026-09-16 12:00 UTC` |

**属性断言工具（2026-09-17 建立）**：

```bash
PYTHONIOENCODING=utf-8 python tools/check_aria_labels.py    # 7 页语录卡的 aria-label，退出码 0/1
```

> 补的是快照的**盲区**：`snapshot.py` 采的是**计算样式，不含属性**。
> 所以「6 页各有一段专属 `aria-label`（低语卡片 / 黄金诗句 / 救世铭文……）
> 被重构悄悄统一成通用文案」这种回归，**快照会报「✅ 无差异」**。
> 详见 `docs/theme-schema.md` §四。
> 自带服务器（端口 **8501**，刻意避开 8500），并做过了负向测试。

另外 `armor.html` 的 `body` 用了 `background-attachment:fixed`（全站唯一），整页截图时**视口以外不绘背景 → 80% 全白**。截图前注入 `background-attachment:scroll` 覆盖解决（只影响截图，不碰采样属性）。

### 4.3 献花改同源 + 来源判定改成只比主机名（2026-09-16）

**这事分两幕，第一幕修完还坏着——别只看第一幕就当修好了。**

#### 第一幕：接口跨域

**症状**：需求方手机实拍——同一时间，QQ 浏览器点献花显示「你的花已送达 · 本机累计 3 朵」，
桌面浏览器显示「这里已收到 7 朵花」。前者是 `assets/flowers.js` 的**静默降级**分支。

**根因**：`assets/flowers.js:15` 把接口地址写死成 `https://flowers.elysiad.top`，
页面却在 `elysiad.top` —— 两个域名就是跨域。§6.3 那条结论当初是为留言簿写的，
**献花漏改了**。（`guestbook/index.html` 用的是「默认同源」写法，献花没有。）

**改了两处**：

| 文件 | 改动 |
|---|---|
| `worker/wrangler.toml` | 路由加 `elysiad.top/count`、`elysiad.top/flower` |
| `assets/flowers.js` | `var API = 'https://flowers.elysiad.top'` → 默认同源，只有本地开发才用远端 |

`flowers.elysiad.top` **保留**：本地开发（`localhost:8500`）仍用它，它也已过一次大陆可达性验证。
⚠ 加路由**不要**顺手改成 `elysiad.top/*`——那会把整站静态页面也吞进 Worker。

#### 第二幕：同源之后仍被 403（**只差一个字母 s**）

第一幕上线后手机实测：**GET 通了**（QQ 浏览器上第一次出现「这里已收到 8 朵花」），
但**点击的 POST 仍然失败**。

**查法**：`wrangler tail` 走 WebSocket，本机网络连不上（ETIMEDOUT）。
改用临时诊断——在 403 分支把被拒的 `Origin` 原值写进 KV 再读出来（**定位完已删除**）。

**根因**：QQ 浏览器的云加速把页面**降级成 http**，页面 origin 是 `http://elysiad.top`，
而白名单是精确字符串 `https://elysiad.top`。一字之差 → 403。

**修法**：来源判定从「精确比对 URL 字符串」改成**只比主机名**
（`ALLOWED_HOSTS` + `new URL(origin).hostname`）。副作用：`http/https/端口` 变化都不再影响判定，
而 `elysiad.top.evil.com` 这类后缀伪装仍然拦得住（精确比对，不是 `endsWith`）。

**回归用例**：`worker/test/smoke.mjs` 新增【12】共 12 项（献花 26 → **38** 项）。
已验证这 12 项**在旧代码上会失败**——否则就是「测了等于没测」。

**活体验证用 `OPTIONS` 探测，不写 KV**：放行时 `Access-Control-Allow-Origin` 原样回显该来源，
拦截时退回默认值。这样验证不用往总数里加花。

#### 两幕共同的教训

降级是**设计好的静默行为**——任何情况下都不给访客看错误提示。
所以两次故障的症状都不是报错，而是「数字悄悄变成本机计数」，且只在特定浏览器上出现。
**排查时先看文案（「这里已收到」vs「本机累计」），别看数字。**

完整部署与验证步骤见 `worker/README.md` §13。

> ⚠ **顺带发现、故意没动**：`http://elysiad.top/` 返回 200 不跳转，「始终使用 HTTPS」是关的。
> 别顺手开——那种情况下 POST 会先吃一个跳转，而跨 origin 跳转时浏览器可能把 `Origin`
> 改成 `null`，会被同一道检查拦下。**要开得先在手机上实测。**

### 4.4 修 `armor.html` 的 `--gold-soft` 未定义（皮肤徽章失色，2026-09-16）

**症状**：`armor.html` 上「皮肤」类型徽章的**金色文字变成冷白**，只剩金色底还留着。
和旁边三个徽章（`--pink-soft` / `--purple-glow` / `--text-dim`）并排一看就显「褪色」。

**根因**：`.type-badge.skin` 写的是 `color: var(--gold-soft)`，而 `--gold-soft` 只定义在
`index.html` 的 `:root`，`armor.html` 自己的 `:root` 里没有。CSS 变量不存在时，
该声明**在计算值阶段**失效（不是解析阶段）——`color` 于是回退成**继承父元素**，
也就是 `body` 的 `#f0e6ff`。**不报错、不提示，只是悄悄变白。**

**复核**：写了个小脚本把 `armor.html` 的 `:root` 定义与 `var()` 引用对了一遍，
结果 19 个定义 / **1 个缺失**，确认就是 `--gold-soft` 这一处，与 inventory 的结论一致。
（另有 `--bg-mid`、`--pink-deep` 两个「定义了没用上」的死变量，无害，没动。）

**修法**（计划 Task 11 Step 4 的**方案 A**）：在 `armor.html` 的 `:root` 补
`--gold-soft:#ffe5a0;`，值与 `index.html:31` 的同名 token 一致 —— 让「皮肤」徽章全站一个颜色。

#### 验证：像素级差分，不是「看着差不多」

1. **计算样式**
   `.type-badge.skin` 的 `color`：改前 `rgb(240, 230, 255)`（= `body` 的色，纯继承）
   → 改后 **`rgb(255, 229, 160)`**（`#ffe5a0`）。
   同页 `.armor` / `.story` / `.event` 三个徽章与 `body`，改前改后**完全一致**。
2. **截图差分**：桌面 `1280×900` + 移动 `375×812`，各拍改动前后（滚动位置锁定一致：1690 / 1889），
   逐像素比对。**两处视口都只有两块约 23×10 px 的区域不同**，且都**严格落在
   `.type-badge.skin` 元素的矩形内** —— 确认变的就是徽章文字，全页零附带改动。
   （页面共 21 个徽章，其中 5 个 `.skin`，视口内可见 2 个。）

> ⚠ **测试中踩到的坑**：`tools/cdp.py` 用的是**持久 user-data-dir**（`C:/tmp/edge_cdp`），
> 浏览器缓存**跨次留存**。改完 `armor.html` 后第一次测**读出来还是旧值**，差点误判成「没修好」。
> **给 URL 加 `?cb=<时间戳>`** 再测。已记进 §6.4。

---

## 五、还没做的事

### 5.1 P1 公共层抽取（**进行中**）

> 🔺 **重要的方向性背景（2026-09-16 需求方确认）：逐火十三英桀的界面最终要做齐，共 13 页。**
> 目前只有 6 位有独立页面（aponia / eden / kalpas / kevin / su / villv），
> 加上首页（爱莉希雅）与 armor。**还差 6 位**：樱、科斯魔、梅比乌斯、格蕾修、华、帕朵菲莉丝。
>
> 每位要有**自己的性格设计**，但可以沿用现有几位的框架。
> **所以 P1 抽出来的形状就是那 6 页的模板**——抽成什么样，新页面就长什么样。
>
> 据此已定：共享层按**「每页一份主题块」**驱动（每页只声明一个 `THEME` 对象，
> 内含配色 / 粒子 / 星屑 / 打字速度等「性格参数」，其余交给共享层）。
> 新英桀页 = 写一个 THEME + 各自的专属特效，不再复制实现。
> 详见 P1 计划 Task 6 开头的形状决定。

**Task 1–8 已完成**（Task 7/8 于 2026-09-17 完成）。**接下来做 Task 9**，
做完立刻开新页面；10 / 11 / 12 留到新页面之后补 —— 见本节末尾的「🎯 下一步做什么」。

| Task | 内容 | 结果 |
|---|---|---|
| 1 | 验证地基（`snapshot.py` / `snapshot_diff.py`） | ✅ 见 §4.2——**计划给的代码是坏的，先后修了五个坑**（第 5 个「日期漂移」是 2026-09-17 补的） |
| 2 | 新建 `assets/site.css`（A 组 31 条） | ✅ |
| 3 | 7 页接入基础重置 + keyframes | ✅ 删 55 条（+14/−55） |
| 4 | 7 页接入几何中性规则 | ✅ 删 **153** 条（+9/−201） |
| 5 | 归一化前导零写法（不动数值） | ✅ index 79 处；JS 里的 43 处一个没碰 |
| 6 | 抽出 `assets/site.js`（resize 工厂 + 星屑生成） | ✅ 7 页改用 `ElysiaShared`，见下 |
| 7 | 语录卡 + 滚动进场（`buildQuoteCards` / `observeReveal`） | ✅ 6 子页接入；删 66 行/页 |
| 8 | 打字机（`makeTypewriter`） | ✅ 7 页接入；五个数值逐页参数化 |

Task 1–5 全部以「✅ 无差异」通过（24 张快照 × 30+ 选择器 × 30+ 计算属性逐字段比对）。

#### ⚠ Task 7 起`THEME` 的形状要照着 `docs/theme-schema.md` 写

`THEME` **现在是定型了的**（星屑 / 语录 / 打字机三块），
**完整 schema、逐页数值总表、共享层默认值清单全在 `docs/theme-schema.md`** ——
新页面照它写，不要再从别处抄。

> 📌 **Task 7/8 动手时发现计划有 6 处与现场对不上**（`aria-label` 会被抹掉、
> `hintEl` 是 3 页不是 2 页、`tailDelay` 逐页不同、漏了打字前的装饰元素点亮……）。
> 逐条记录在 `docs/theme-schema.md` **§八**。**计划在这两处有「过度泛化」倾向，
> 遇到类似表述请先实测再动手。**

#### ⚠ Task 6 起，验收口径要改一句话

Task 1–5 是「✅ 无差异」。**Task 6 起不是了，而且以后也不会是。**

结尾的星屑是**每次加载都重新随机**的（不刷新也会洗牌）。之前基线能对上，
纯粹是因为快照工具固定了随机种子。Task 6 把 7 页的随机调用顺序统一之后，
星屑必然重新洗一次 —— 快照会报出 18 处差异，全部落在 `.ending-star` 一个选择器上
（差异属性只有 `animation-duration` 和一处 `opacity`）。

**所以 P1 的最终验收要写成**：「零差异，**除已解释的星屑重洗**」。
真正该守的五个不变量 —— 数量 / 尺寸区间 / 透明度区间 / 时长区间 / 颜色分布 ——
已经用统计方式单独验过（各 80/70 个实测样本，分毫不差）。

> 参照点：`screenshots/snap/baseline` 是 **P1 动手前**的状态，留给最终验收；
> `screenshots/snap/baseline-task6` 是 **Task 6 之后**的状态，给 Task 7–12 当参照，
> 免得每次比对都被这 18 处已知差异淹没。

> ✅ **那处工具缺口已补**（2026-09-16）：`left` / `top` / `animation-delay` 已加进 `PROPS`。
> 效果立竿见影 —— 同一组对照（pre-P1 vs Task6）报出的差异从 **18 处涨到 72 处**，
> 因为现在能把星屑重洗的**全部范围**照出来（之前只看得到 `--dur` 一条线）。
> **72 处仍然全部落在 `.ending-star` 一个选择器上**，其余 7 个 × 8 页 × 3 视口零变化。
>
> 参照点已用新 `PROPS` 重新生成：`baseline`（取自 `origin/main` 的 worktree，
> 真正的 pre-P1）与 `baseline-task6`，两者都验证过同码两次零差异。


```
docs/superpowers/plans/2026-09-15-elysiad-extraction.md      12 个任务
docs/superpowers/plans/2026-09-15-extraction-inventory.md    抽取分析（1173 行，是事实来源）
```

背景：8 个页面各自复制了一整套 CSS/JS。分析结论：

| 组 | 数量 | 处置 |
|---|---|---|
| A 组（跨页逐字节一致） | **31 条** | 进 `assets/site.css`，源码初稿在 inventory §1.1 |
| B 组（同选择器不同值） | 47 条 | 留各页做主题覆盖 |
| C 组（页面专属） | 225 条 | 不动 |

**动手前必读** inventory 的 **§3 风险清单** 与 **§5.1 待确认项**。三个雷：

1. `armor.html` 的 `.timeline` 是**另一套结构**，绝不并入 7 页版本
2. `--gold-warm` / `--flame` **同名不同值不同语义**，绝不提升为公共 token
3. `index.html` 的点击涟漪原本**没有** `reducedMotion` 判断，统一它属于**行为变更**，要单独 commit 标明

**~~顺带要修的 bug~~ 已于 2026-09-16 单独修掉（不在 P1 里）**：`armor.html` 的 `.type-badge.skin`
用了 `var(--gold-soft)`，但该文件 `:root` 里没有定义 → 文字色回退成继承 `body` 的 `#f0e6ff`，
金色文字静默变冷白。已在 `armor.html` 的 `:root` 补上 `--gold-soft:#ffe5a0`（与 `index.html` 同值）。
详见 §4.4。这是分析确认的**唯一**一处同类问题。

> ⚠ **给 P1 执行者的提醒**：P1 计划（Task 11 Step 4）里也安排了这一处修复，且预期
> 「与 after-task11 相比，`--gold-soft` 是唯一已知变化」。**那一处现在已经修好了**，
> 所以到时候快照比对**不该再出现任何变化**——若还看到徽章颜色变化，说明动坏了别的东西。

#### 🎯 下一步做什么（2026-09-17 更新）

> **顺序：Task 9，做完立刻开新页面；10 / 11 / 12 留到新页面之后补。**
> Task 7 / 8 已于 2026-09-17 完成。

**为什么把 9 排在开新页面之前**：Task 9（全站减动保护）是**每一个英桀页都要遵循**的东西。
先做，新页面就直接按减动规范写；后做，就得回头补 13 页。

| 任务 | 对新页面的意义 | 何时做 |
|---|---|---|
| **9** 全站减动保护 | ⭐ 每页都要遵循 | **本轮** |
| 10 index 专项 | ❌ 首页专属 | 新页面之后 |
| 11 armor 专项 | ❌ 异形页专属 | 新页面之后 |
| 12 收尾清理 | ➖ 好看 | 最后 |

**10/11/12 也要做**，只是排在后面 —— 别让新页面从一个「半迁移」的仓库起步：
那时 armor 还挂着自己那套、首页还挂着自己那套，「到底该照谁写」会变成问题。

##### ✅ `THEME` schema 已定稿（Task 7 开工前的那件事，已完成）

**`docs/theme-schema.md` 就是那份完整 schema** —— 13 页的模板，Task 7/8 已按它落地。
新页面**照它写**，不要再从别处抄。

其中 **§二「共享层默认值清单」** 尤其要看：它列了**哪些值被刻意不在 `THEME` 里**、为什么。
免得后来人以为是漏写，又加回去 —— 那等于把 13 份复制粘贴请回来。

##### ⚠ Task 7 / 8 的注意事项（**已归档，动手时无需再读**）

两处都已完成。**但有一条要留给后面的人**：

> 📌 **计划在 Task 7 / 8 上有「过度泛化」倾向** —— 实测发现 **6 处与现场对不上**：
> `aria-label` 会被抹掉（快照还测不出来）、`hintEl` 是 3 页不是 2 页、
> `tailDelay` / `hintDelay` / `startDelay` 都是逐页不同的、还漏了「打字前的装饰元素点亮」。
> **逐条记录在 `docs/theme-schema.md` §八。**
>
> **教训**：计划里凡出现「各页相同」「某页独有」这类断言，**先实测再动手**。

其余仍有效的两条：

- ⚠ **R10**：villv 缺粒子 resize 守卫 —— **保持现状，不要顺手补**
- ⚠ **R11 的写法已经确立了**：观察器一律**带判空**（元素缺失不再抛异常）。
  这是**行为改善**，不是纯重构 —— 后续遇到同类情况照此办理并单独 commit

##### Task 9 注意事项（全站减动保护）

- `assets/site.css` 末尾加 `@media (prefers-reduced-motion: reduce)` 段
- `villv/index.html` 的 `fireKevinKiller666()` 与 `kalpas/index.html` 的 `startRage()`
  加护栏 —— **这两个是行为变更，各单独一个 commit**
- ⛔ **`index.html` 的点击涟漪：跳过不动。** 需求方已拍板（见 §5.4）。
  **不要**给点击监听器补 `if (reducedMotion) return;`

##### 验证协议（照这个走）

```bash
cd D:\claude-code\elysia-main

# 1) 起服务器 —— ⚠ 起完**必须先验内容**再采样（见 §6.4 的 pkill 坑）
python -m http.server 8500 &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8500/assets/site.css   # 应为 200

# 2) 快照 + 比对。Task 9 用 baseline-task78 当参照
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-task9
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline-task78 after-task9; echo "退出码 $?"

# 3) 属性断言 —— 快照**测不出来**的那一类（ARIA 等）
#    ⚠ 改过语录卡相关的代码就一定要跑这个，见 §4.2
PYTHONIOENCODING=utf-8 python tools/check_aria_labels.py
```

**参照点分工**：

| 快照目录 | 是什么 | 用来做什么 |
|---|---|---|
| `screenshots/snap/baseline` | **P1 动手前**（从 `origin/main` 的 worktree 取） | P1 最终验收 |
| `screenshots/snap/baseline-task6` | **Task 6 之后** | 已用过，保留备查 |
| `screenshots/snap/baseline-task78` | **Task 7/8 之后** | **Task 9 每步的参照** |

> ✅ **2026-09-17：`snapshot.py` 已把「现在几点」钉死在 `2026-09-16 12:00 UTC`。**
> 在此之前基线**随日历漂** —— 「今日之语」按本地日期取句，跨天复核必假失败
> （实测 index 一夜之间矮了 40px，而所有采样选择器分毫未动）。
>
> 钉到这个时刻有个额外好处：`baseline` / `baseline-task6` 的**旧数值能被复现**
> （index 应回到 `8902.92px`）。**所以现存旧基线仍然有效，不必重采。**
> 已实测：未改动的 HEAD 用新工具采，得到的正是 8902.92。

⚠ **P1 最终验收的口径是「零差异，除已解释的星屑重洗」**：
`baseline` vs 最终状态会报 **72 处差异，全部落在 `.ending-star` 一个选择器上**
（`left` / `top` / `animation-delay` / `animation-duration` / `opacity`）。
根因是 Task 6 统一了随机调用顺序，星屑必然重洗 —— 星星本来就是每次加载重新随机的。
**除 `.ending-star` 外，任何选择器动一处都要停下来查。**

> 💡 **这一条同时也是「工具没坏」的自检**：若某天 `baseline` vs 当前状态报**零差异**，
> 别高兴 —— 先怀疑工具被缓存或日期问题弄成了恒真式（§4.2 那五个坑）。

##### 新页面怎么开（做完 7/8/9 之后）

1. 参照一份现有子页当骨架 —— 建议从 `su/index.html` 或 `kevin/index.html` 起，
   它们的专属模块较少，模板更干净
2. 写自己的 `THEME`（此时它已长全）
3. 写自己的**专属特效** —— 这正是每位英桀「性格」所在
   （樱的瓣 / 科斯魔的影 / 梅比乌斯的蛇 / 格蕾修的画 / 华的剑 / 帕朵的铃……）
4. 别忘了三件事：
   - 加进 `.github/workflows/static.yml` 的 **`KEEP_FILES` / `KEEP_DIRS` 白名单**，
     否则**不会上线**
   - 加进 `sitemap.xml`
   - 角色页用的是**子页那套** `.back-link` / `.ending-*`（**不是** armor 那套）

> ✅ **待做的英桀页确认为 6 位**（2026-09-17 需求方确认）：
> **樱 / 科斯魔 / 梅比乌斯 / 格蕾修 / 华 / 帕朵菲莉丝**。
> （已有的 7 页是：index=爱莉希雅、aponia 阿波尼亚、eden 伊甸、villv 维尔薇、
> kalpas 千劫、kevin 凯文、su 苏；armor 是装甲时间轴，不算角色页。13 = 7 + 6 ✓）

### 5.2 等需求方提供素材

- **隐藏彩蛋的台词**：现为空数组，所以彩蛋不触发。项目数据纪律是「绝不编造」，**拿到有出处的台词后填进 `data/quotes.js` 的 `hidden` 即可自动生效，代码不用改**
- **扩充实语料池**（可选）：现在 10 句，10 天一轮

### 5.3 等需求方拍板

- **`data/timeline-data.js` 里 12 位英桀的 `lore` 是两份稿子叠加**（旧稿未删、新稿续在后面），含 OCR 坏文（「凶笼」应为「囚笼」、「抓马」、「守难口磨去了金瞳」）与孤立的标点/姓名行。**点开首页名片就能看到**。13 位里只有樱是干净的。已记在设计文档 §2.4，未纳入任何计划

### 5.4 已决定不改、另行跟踪的问题

| 问题 | 决定 | 依据 |
|---|---|---|
| **`index.html` 的点击涟漪缺 `reducedMotion` 判断** | **不改，另行跟踪**（2026-09-16 需求方拍板） | `index.html` 定义了 `reducedMotion` 却从未使用（L746 定义 / L856 监听器），其余 6 个子页的涟漪**都有** `if (reducedMotion) return;`，只有首页缺。统一会让首页在减弱动效下从「有花瓣迸发」变成「完全没反应」——属**行为变更**，不混进这轮纯重构。详见 P1 计划 Task 9 里的记录 |

> ⚠ **执行 P1 Task 9 时跳过 `index.html`**，不要补那个判断。

### 5.5 时间点任务

- **2026-11-11（她的生日）**：当天记录献花总数。接近或超过 500 → 需要换 Durable Objects（方案见 `worker/README.md` §11）

### 5.6 已放弃的

- **QQ / 微信的分享预览**：需求方实测始终不出，已决定不再追。排查过程与排除项记录在设计文档 §11.2。**别重查**

---

## 六、动手前必读的坑

### 6.1 部署相关

| 坑 | 说明 |
|---|---|
| **只有 `main` 会部署** | `dev` 上随便折腾，不影响线上 |
| **新增站点文件必须改进白名单** | `static.yml` 的 `KEEP_FILES` / `KEEP_DIRS`，否则不会上线 |
| **改完最多 2 分钟生效** | Cloudflare Cache Rule 的 TTL。想立刻看到就去面板清缓存 |
| **有两层缓存** | GitHub Pages（10 分钟）+ Cloudflare（2 分钟）。测试时若"改动没生效"，先怀疑缓存 |

### 6.2 Cloudflare

| 坑 | 说明 |
|---|---|
| **默认不缓存 HTML** | 必须靠 Cache Rule，否则开了橙云反而更慢（实测慢一倍多）|
| **API 响应必须 `no-store`** | 否则加了 Cache Rule 后接口会被缓存 → 刚通过的留言两分钟后才可见。已在 `json()` 里统一处理 |
| **KV 写额度 1000/天** | 每献一朵花写 2 次 → 全站约 **500 朵/天**。**限额只在运行时绑定路径强制**，`wrangler kv` 那条路不拦但**照样扣额度** |
| **`*.workers.dev` 在大陆连不上** | 必须用自定义域名 |
| **D1 主区域创建时定死** | 建错了只能删库重建（`--location apac`）|

### 6.3 面向大陆访客

| 坑 | 说明 |
|---|---|
| **接口必须与页面同源** | 实测：同一台手机同一个网络，Edge 正常，QQ 浏览器 / 系统自带浏览器**页面能开但跨域请求被拦**，夸克连页面都打不开。所以 `/notes` 挂在 `elysiad.top/notes*` 走同源，而不是 `flowers.elysiad.top`<br>⚠ 2026-09-16：**献花当时漏改了**，见 §4.3 |
| **降级是静默的，所以漏改了很久没人发现** | 献花接口不通时不报错，只把文案从「这里已收到 N 朵花」换成「你的花已送达 · 本机累计 N 朵」。QQ 浏览器上一直是后者。**症状是数字不对，不是报错**——排查时先看文案，别看数字 |
| **来源判定别用精确 URL 字符串** | QQ 浏览器的云加速会把页面降级成 http，Origin 变成 `http://elysiad.top`。写成 `includes('https://elysiad.top')` 就会一字之差全部 403。**只比主机名**，且必须精确比（别用 `endsWith`，`elysiad.top.evil.com` 会漏进来）。见 §4.3 |
| **`http://elysiad.top/` 是通的（200，不跳转）** | 「始终使用 HTTPS」没开。⚠ 别顺手开——跨 origin 跳转时浏览器可能把 `Origin` 改成 `null`，会被同一道来源检查拦下。要开得先在手机上实测 |
| **别用 `location.hostname === 'elysiad.top'` 判断环境** | 那些浏览器的云加速可能改写主机名。要写成「**默认同源，只有本地开发才用远端地址**」 |

### 6.4 工具与验证

| 坑 | 说明 |
|---|---|
| **`cdp.py` 的 click 要先滚动** | 它用 `getBoundingClientRect()` 的视口坐标派发鼠标事件，元素在视口外会**静默无操作**。且站点有 `scroll-behavior:smooth`，必须 `scrollIntoView({behavior:'instant'})` |
| **探测 `loading="lazy"` 的图片要把视口拉高** | 否则下面的图不加载，渲染盒 `0x0`——那是正常行为，不是回归 |
| **⚠ `pkill` 杀不掉 Windows 原生 python 进程** | `python -m http.server 8500` 用 `pkill -f` 杀不干净——**多个服务器会同时监听同一端口**，请求落到哪个不确定。实测踩到过：为了生成 pre-P1 基线，起了一个服务 worktree 的服务器，但旧的（服务主仓库）仍在响应，于是采样出一份**内容完全错的「pre-P1 基线」**，差点当成真的用。查：`netstat -ano \| grep ":8500 " \| grep LISTENING`（同一 PID 出现两行是 IPv4/IPv6 双栈，正常）；杀：`taskkill //F //PID <pid>`。**起完服务器必须先验内容再采样**——例如请求一个只应存在于新目录的文件。 |
| **`cdp.py` 的浏览器缓存跨次留存** | 它用固定的 `--user-data-dir=C:/tmp/edge_cdp`，所以**改了 CSS/JS 再测，读到的可能还是旧版本**——会让人误判成「改动没生效」或「修了还是坏的」。给 URL 加 `?cb=<时间戳>` 再测 |
| **⚠ 快照基线会「随日历漂」（2026-09-17 已修）** | 页面有两处吃日期：「今日之语」按**本地日期**取句、`#bdayEgg` 生日倒计时每天换字。**同一个工作日内怎么复核都是零差异，跨过零点就报差异**——它会骗过一切当场自检。已把「现在几点」钉死在 `2026-09-16 12:00 UTC`。⚠ **改动 `snapshot.py` 时别把 `SEED_DATE_JS` 弄丢**，否则基线又开始跟着日历走 |
| **快照测不出「属性」** | `snapshot.py` 采的是**计算样式**。`aria-label`、`title`、`alt`、`href` 这类**属性**不在采样范围内 —— 它们被改掉时快照会报「✅ 无差异」。所以有专门的 `tools/check_aria_labels.py`。**改属性类的改动，快照通过不算通过** |
| **改视觉必须截图核对** | 项目纪律：不接受"看起来差不多"。桌面 `1280×900` + 移动 `375×812` 各一轮 |
| **元素有入场动画时要等** | `.timeline-node` 是 `opacity:0` + IntersectionObserver 出 `.visible`。滚过去要 `sleep` 一两秒再截图，否则拍到一片空白——那不是页面坏了 |
| **颜色类改动用像素差分** | 相近的浅色（`#ffe5a0` vs `#f0e6ff`）肉眼在徽章尺寸下分不出。用 `PIL.ImageChops` 比对前后截图，再拿元素 `getBoundingClientRect()` 交叉核对「差异是否落在目标元素内」 |
| **Windows 跑 Python 要带 `PYTHONIOENCODING=utf-8`** | 否则中文输出 GBK 崩 |
| **Bash 工具会吞内联字符串里的反斜杠** | `python - <<'PY'` 和 `node -e "..."` 常因此报错。把脚本写成临时文件再执行，**别写进仓库** |

---

## 七、常用命令速查

```bash
cd D:\claude-code\elysia-main

# 本地服务器（截图与手测都走它）
python -m http.server 8500

# 截图（桌面 / 移动）
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  size 1280x900 sleep 2000 shot screenshots/x.png
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  size 375x812 sleep 2000 shot screenshots/x-mobile.png

# Worker 测试（93 项断言：献花 38 + 花笺 55）
cd worker && npm run smoke

# 部署 Worker
cd worker && wrangler deploy

# 轮换分享卡片
python tools/pick_og.py            # 随机换一张
python tools/pick_og.py --list     # 看现在生效的是哪张

# 给留言加一条 / 看数据
cd worker
wrangler d1 execute elysia-notes --remote --command "SELECT status, COUNT(*) FROM notes GROUP BY status;"

# 看线上缓存状态
curl -sI https://elysiad.top/ | grep -i cf-cache-status
```

---

## 八、文档地图

```
docs/HANDOVER.md                                  本文档
docs/theme-schema.md                              ★ THEME 的完整 schema（13 页的模板）
                                                  §二 = 共享层默认值清单  §八 = 与计划的 6 处偏差

docs/superpowers/
├── specs/
│   └── 2026-09-15-elysiad-update-design.md      设计文档（十项功能 + 匿名花笺 + 上线后待办）
│                                                  ★ 改功能前先读这份
└── plans/
    ├── 2026-09-15-elysiad-update.md             计划 A：14 个任务（已全部执行）
    ├── 2026-09-15-elysiad-extraction.md         计划 B：P1 公共层抽取，12 个任务（Task 1–8 完成）
    └── 2026-09-15-extraction-inventory.md       CSS/JS 抽取分析（1173 行）★ P1 的事实来源

tools/README.md                                   本地工具说明
worker/README.md                                  Worker 部署手册
                                                  §11 = KV 额度实测  §12 = 匿名花笺  §13 = 同源路由 / 来源判定
```

**四份必然要读的**：

1. **本文档**（你正在读）
2. `docs/superpowers/specs/2026-09-15-elysiad-update-design.md` —— 规格与决策的唯一准绳
3. `docs/theme-schema.md` —— **只要动到 `THEME` 或要开新页面，先读这份**
4. `docs/superpowers/plans/2026-09-15-extraction-inventory.md` —— 只在做 P1 时读

---

## 九、这个项目的做事方式（比规则更重要）

前一轮执行下来，**真正挡下事故的只有一条纪律**：

> **每一步都必须真跑，对不上就停下报告，不许假装通过。**

它挡下的是这些（全都是"不跑就永远不知道"的那类）：

| 差点混过去的问题 | 不跑的后果 |
|---|---|
| `daily.js` 缺 `defer` | 面板**静默空白**，不报错，最难查 |
| `img` 属性没配套 `width:auto` | **图片拉伸 34%** |
| 献花超时设 1500ms | 健康的接口被误判成故障，访客**以为没人来过** |
| 截图没先滚动 | 目视验收形同虚设 |
| 比较表达式是恒真式 | 永远输出"相同"，测了等于没测 |
| `--dry-run` 在干净环境下显示假 100% | 报告里全是假数据 |

**所以：验证步骤不是形式，是这个项目唯一的安全网。** 计划里凡是写「期望：xxx」的地方，都要真跑一遍核对。

另外两条：

- **发现计划错了就停下来报告**，不要照着错的要求硬做——错的计划比错的代码更危险，因为后面每个人都照着它做
- **不确定的事标"待确认"，不要猜**。这个项目对"不编造"有明确要求（台词、设定、日期都算）

---

## 十、给下一位的一句话

需求方是这个站的**唯一作者和维护者**，他对细节有很强的判断力，也愿意听不同意见——**该说"这个方案有问题"的时候直接说**，前面几轮里最有价值的产出往往来自"我实测了一下，和你我原先的判断不一样"。

祝你顺利呀♪
