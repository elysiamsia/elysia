# elysiad.top 项目交接文档

> 写给下一个接手的人（或 agent）。**动手前请通读一遍**，尤其是 §六 的坑。
> 最后更新：2026-09-16

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
| **献花改同源（修 QQ 浏览器静默降级）** | ✅ 已修，见 §4.3 |
| **P1 公共层抽取（12 个任务）** | ⬜ **计划已写，未开工** |

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
- **`worker/test/`**：81 项断言（献花 26 + 花笺 55），用内存版假 D1，`npm run smoke`
- **`tools/` 现有工具**：`cdp.py`（无头 Edge，支持 `size` 动作切换视口）、`pick_og.py`（分享卡片轮换）、`og_convert.py`（PNG→JPEG）、`to_webp.py`（图片转 WebP）

> ⚠ **`tools/snapshot.py` 与 `tools/snapshot_diff.py` 目前不存在。**
> 它们是 P1 计划里 Task 1 要产出的验证地基（8 页 × 3 视口的像素 + 计算样式比对），
> **计划写了但从未执行**。做 P1 时第一步就是创建它们——没有这个，"重构不改变视觉"只能靠肉眼。

### 4.3 献花改同源（2026-09-16）

**症状**：需求方手机实拍——同一时间，QQ 浏览器点献花显示「你的花已送达 · 本机累计 3 朵」，
桌面浏览器显示「这里已收到 7 朵花」。前者是 `assets/flowers.js` 的**静默降级**分支，
意味着 POST 根本没到 Worker。

**根因**：`assets/flowers.js:15` 把接口地址写死成 `https://flowers.elysiad.top`，
页面却在 `elysiad.top` —— 两个域名就是跨域。§6.3 那条结论当初是为留言簿写的，
**献花漏改了**。（`guestbook/index.html` 用的是「默认同源」写法，献花没有。）

**为什么长期无人发现**：降级是**设计好的静默行为**——任何情况下都不给访客看错误提示。
所以症状不是报错，而是「数字悄悄变成本机计数」，且只在特定浏览器上出现。

**改了两处**：

| 文件 | 改动 |
|---|---|
| `worker/wrangler.toml` | 路由加 `elysiad.top/count`、`elysiad.top/flower` |
| `assets/flowers.js` | `var API = 'https://flowers.elysiad.top'` → 默认同源，只有本地开发才用远端 |

`flowers.elysiad.top` **保留**：本地开发（`localhost:8500`）仍用它，它也已过一次大陆可达性验证。
⚠ 加路由**不要**顺手改成 `elysiad.top/*`——那会把整站静态页面也吞进 Worker。

完整部署与验证步骤见 `worker/README.md` §13。

---

## 五、还没做的事

### 5.1 P1 公共层抽取（**最要紧的未完成项**）

**计划已完整写好，未开工。**

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

**顺带要修的 bug**：`armor.html:82` 的 `var(--gold-soft)` 未定义（该文件 `:root` 里没有）→ 皮肤徽章失色。这是分析确认的**唯一**一处同类问题。

### 5.2 等需求方提供素材

- **隐藏彩蛋的台词**：现为空数组，所以彩蛋不触发。项目数据纪律是「绝不编造」，**拿到有出处的台词后填进 `data/quotes.js` 的 `hidden` 即可自动生效，代码不用改**
- **扩充实语料池**（可选）：现在 10 句，10 天一轮

### 5.3 等需求方拍板

- **`data/timeline-data.js` 里 12 位英桀的 `lore` 是两份稿子叠加**（旧稿未删、新稿续在后面），含 OCR 坏文（「凶笼」应为「囚笼」、「抓马」、「守难口磨去了金瞳」）与孤立的标点/姓名行。**点开首页名片就能看到**。13 位里只有樱是干净的。已记在设计文档 §2.4，未纳入任何计划

### 5.4 时间点任务

- **2026-11-11（她的生日）**：当天记录献花总数。接近或超过 500 → 需要换 Durable Objects（方案见 `worker/README.md` §11）

### 5.5 已放弃的

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
| **别用 `location.hostname === 'elysiad.top'` 判断环境** | 那些浏览器的云加速可能改写主机名。要写成「**默认同源，只有本地开发才用远端地址**」 |

### 6.4 工具与验证

| 坑 | 说明 |
|---|---|
| **`cdp.py` 的 click 要先滚动** | 它用 `getBoundingClientRect()` 的视口坐标派发鼠标事件，元素在视口外会**静默无操作**。且站点有 `scroll-behavior:smooth`，必须 `scrollIntoView({behavior:'instant'})` |
| **探测 `loading="lazy"` 的图片要把视口拉高** | 否则下面的图不加载，渲染盒 `0x0`——那是正常行为，不是回归 |
| **改视觉必须截图核对** | 项目纪律：不接受"看起来差不多"。桌面 `1280×900` + 移动 `375×812` 各一轮 |
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

# Worker 测试（81 项断言）
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
docs/superpowers/
├── specs/
│   └── 2026-09-15-elysiad-update-design.md      设计文档（十项功能 + 匿名花笺 + 上线后待办）
│                                                  ★ 改功能前先读这份
└── plans/
    ├── 2026-09-15-elysiad-update.md             计划 A：14 个任务（已全部执行）
    ├── 2026-09-15-elysiad-extraction.md         计划 B：P1 公共层抽取，12 个任务（未开工）
    └── 2026-09-15-extraction-inventory.md       CSS/JS 抽取分析（1173 行）★ P1 的事实来源

worker/README.md                                  Worker 部署手册
                                                  §11 = KV 额度实测  §12 = 匿名花笺
```

**三份必然要读的**：

1. **本文档**（你正在读）
2. `docs/superpowers/specs/2026-09-15-elysiad-update-design.md` —— 规格与决策的唯一准绳
3. `docs/superpowers/plans/2026-09-15-extraction-inventory.md` —— 只在做 P1 时读

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
