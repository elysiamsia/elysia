# elysiad.top 项目交接文档

> 写给下一个接手的人（或 agent）。
>
> **先读这两节，它们是干活用的**：
> · **§二 当前状态** —— 现在有什么、下一步做什么
> · **§四 动手做事的四张清单** —— 建页 / 加彩蛋 / 验收 / 发布
>
> §六 是踩过的坑（**动手前务必扫一遍**），§十 是历史案例（出问题时再查）。
>
> 最后更新：2026-09-18

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

### 2.1 站点全貌：13 页大计，**9 页已上线 / 4 页待建**

逐火十三英桀的界面最终要做齐。每位一个独立页，各有自己的性格设计。

| 位次 | 刻印 | 角色 | 路径 | 状态 |
|---|---|---|---|---|
| Ⅰ | 救世 | 凯文 | `kevin/` | ✅ |
| **Ⅱ** | **真我** | **爱莉希雅** | **`index.html`** | ✅ 首页 |
| Ⅲ | 戒律 | 阿波尼亚 | `aponia/` | ✅ |
| Ⅳ | 黄金 | 伊甸 | `eden/` | ✅ |
| Ⅴ | 螺旋 | 维尔薇 | `villv/` | ✅ |
| Ⅵ | 鏖灭 | 千劫 | `kalpas/` | ✅ |
| Ⅶ | 天慧 | 苏 | `su/` | ✅ |
| Ⅷ | 刹那 | 樱 | `sakura/` | ✅ |
| **Ⅸ** | **旭光** | **科斯魔** | **`kosma/`** | ✅ |
| Ⅹ | 无限 | 梅比乌斯 | `mobius/` | ⬜ **待建** |
| Ⅺ | 繁星 | 格蕾修 | `griseo/` | ⬜ **待建** |
| Ⅻ | 浮生 | 华 | `hua/` | ⬜ **待建** |
| ⅩⅢ | 空梦 | 帕朵菲莉丝 | `pardofelis/` | ⬜ **待建** |

另有 `armor.html`（她的装甲时间轴，**不是角色页**，异形结构，归 P1 的 Task 11）。

> 📦 **素材已备齐**：`D:\claude-code\materials\<角色名>\`
> （README + `text_materials.md` 台词 + `visual_assets.md` / `audio_assets.md` 清单）
> **建页前先读那份 `text_materials.md`** —— 有出处的台词已经整理好了，还标了「待考/待核」。
>
> ⚠ **`materials/` 不在仓库里** —— 仓库根是 `elysia-main`，材料在**它的上一级**
> （`D:\claude-code\materials`）。只拿到仓库的人**看不到材料**，要另外要。
> 建站产物在仓库、素材在仓库外，这是有意的（素材体积大、且不属于站点资源）。
>
> ⚠ 但**材料包不是唯一权威**：需求方可能另有依据（樱的生日/装甲就是如此，见 §10.3）。

### 2.2 站点功能一览

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
| 英桀名片可点进子页 | `index.html` + `data/timeline-data.js` | 见 §10.5 |
| `canonical` + JSON-LD | 10 页 `<head>` | 首页 `WebSite`，其余 `WebPage` + `BreadcrumbList` |
| favicon / 404 / robots / sitemap | 根目录 | 404 是引路版（一句话 + 三扇门） |
| 图片优化 | `images/*.webp` | **5.0 MB → 0.86 MB** |

**工程侧**：

- **部署白名单**：`static.yml` 改成只打包 `_site/`，
  `tools/ docs/ worker/ images/raw/ .github/` **永不进产物**（构建脚本里有白名单自检，混进去就 fail）
- **`.gitattributes`**：统一 LF（本机系统级 `core.autocrlf=true`）
- **`worker/test/`**：93 项断言（献花 38 + 花笺 55），用内存版假 D1，`npm run smoke`

### 2.3 最近一轮（2026-09-18）做了什么

| | 内容 |
|---|---|
| **新建第 2 页** | `/kosma/` 科斯魔（Ⅸ · 旭光）—— 照 §4.1 的配方：复制 `su/index.html` 骨架 + 脚本逐块替换（62 处断言全命中） |
| **六个登记点全补齐** | `static.yml` KEEP_DIRS / `sitemap.xml` / `timeline-data.js` 的 `url` / `snapshot.PAGES` / `check_aria_labels.EXPECTED` / `check_reduced_motion.PAGES` |
| **三项验收全绿** | 快照差分 = **只有新页 3 处「新增快照」**，其余 8 页**零差异**；aria 9/9；减动 6/6 |
| **踩到一个新坑** | 「快照还在跑就提前跑差分」会**少报差异**（见 §6.4 倒数第二条） |

#### 上一轮（2026-09-17）

| | 内容 |
|---|---|
| **P1 收尾** | Task 1–9 全部完成：公共层抽干净了，`assets/site.css` + `assets/site.js` 两个共享文件 + `THEME` schema 定稿 |
| **新建第一页** | `/sakura/` 樱 —— **后面 4 页照它做**（做法见 §4.1） |
| **补彩蛋欠账** | aponia / eden / kevin **原本一个彩蛋都没有**，各补了 3 个 + 专属模块 |
| **首页入口** | 6 个角色页原本从首页**根本点不到**；现在名片可点进去（见 §4.1 必做清单） |
| **SEO 补课** | 8 页补 `canonical` + JSON-LD（樱页建时随之带上，**现共 9 页都有**） |
| **工具补强** | 新增 `check_aria_labels.py` / `check_reduced_motion.py`；修掉快照的「日期漂移」 |

### 2.4 下一步做什么

1. **建剩下 4 页英桀**（梅比乌斯 / 格蕾修 / 华 / 帕朵菲莉丝）—— 照 §4.1 的配方
2. 之后再做 P1 的 **Task 10（index 专项）/ 11（armor 专项）/ 12（收尾）**
   > 排在后面是有理由的：**别让新页面从一个「半迁移」的仓库起步** ——
   > 那时 armor 还挂着自己那套、首页还挂着自己那套，「到底该照谁写」会变成问题。
3. ⚠ **彩蛋要在第一版里一起做掉**（见 §4.2）—— aponia/eden/kevin 就是因为先上线再补，空了很久

#### 开工第一条命令

```bash
cd D:\claude-code\elysia-main
git status                  # 确认在 dev 分支、工作区干净
git pull origin dev         # 拉到最新的
git log --oneline -5        # 看看上一轮做到哪了

# 材料（⚠ 在仓库外）
ls D:\claude-code\materials\          # 找你要建的那位
cat D:\claude-code\materials\科斯魔\README.md     # 先读这个，再读 text_materials.md
```

然后按 **§4.1** 走。**第一页建议从 `su/index.html` 复制骨架**（它的专属模块最少、模板最干净）。

> 💡 **开工前把 §六 扫一遍** —— 那里每一条都是真踩过的，能省你好几个小时。

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

> 💡 需求方有时候会**直接在 `main` 上小改**（例如手改 `index.html`）。
> 这会让 `dev` 之后的合并产生冲突 —— **解决办法很简单：在 `dev` 上 `git merge origin/main`
> 并解掉冲突**，然后照常推 `dev`。2026-09-17 就这么处理过一次（那次冲突的是 `BUILT` 那段）。
> **解冲突时别用 `--ours` 了事，要逐段核对**，并用
> `git diff <合并前的dev> HEAD --stat` 确认结果树符合预期。

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

> ⚠ 2026-09-17 观察到一个可疑响应头：根路径返回 `Cache-Control: max-age=600, no-store` ——
> 两者语义矛盾，`no-store` 优先，**等于完全不缓存**。可能没起到 Cache Rule 想做的效果。
> 不影响正确性（访客总拿最新的），但值得哪天单独查一次。

---

## 四、动手做事的四张清单

> **这一节是本文档最实用的部分。** 每次动手照着走。

### 4.1 新增一位英桀页

**做法：把 `su/index.html` 复制成骨架，再用脚本逐块替换。**

> 比「从头写一个」稳得多 —— 共享层接线、响应式、减动、观察器全都是现成且已被验证的。
> 樱页就是这么建的。
>
> ⚠ **脚本要写得「对不上就整体中止、不写盘」**：每处替换断言「恰好命中 N 次」，
> 命中数不对就 `sys.exit(1)`。这样不会留下改一半的页面。
> （脚本是临时的，别写进仓库。）

**步骤：**

1. `cp su/index.html <新目录>/index.html`
2. 改配色（`:root`）、文案（档案 / 时间轴 / 语录 / 结尾）、`THEME`（见 `docs/theme-schema.md`）
3. 写自己的**专属特效**（画布）与**专属互动模块** —— 这正是每位英桀「性格」所在
4. 写 **≥3 个彩蛋**（见 §4.2）
5. 走 **§4.1.2 必做清单**
6. 走 **§4.3 验收**

**共享层只有这 5 个函数**（`assets/site.js` 导出的 `ElysiaShared`）：

| 函数 | 干什么 |
|---|---|
| `spawnEndingStars(container, o)` | 结尾星屑 |
| `buildQuoteCards({grid, quotes, ariaLabel, …})` | 语录卡（闭包 O(1) 索引） |
| `observeReveal(selector, opts)` | 滚动进场（带判空，可 `reveal: [id…]` 点亮别的元素） |
| `makeTypewriter(o)` | 打字机（**五个数值逐页不同，必须传原值**） |
| `makeResize(canvas, state)` | canvas 与视口尺寸对齐 |

> ⚠ **其余全是每页私有的**：粒子数组、迸发函数、专属模块……
> **不要以为 `ElysiaShared` 里有别的** —— 抄之前先 grep（§6.5）。


#### 4.1.1 每页该长的样子（三条硬要求）

| 维度 | 要求 |
|---|---|
| **配色** | 每位一套，**别撞**。现有：index 暖紫粉 / aponia 紫罗兰 / eden 金+酒红 / villv 品红紫 / kalpas 炭黑+橙红 / kevin 冷蓝 / su 青绿 / sakura 冷靛+夜樱粉 / **kosma 墨绿+旭光橙** |
| **专属特效** | `assets/site.js` 只抽了通用部分；画布粒子是**每页自己一套**（`#xxxCanvas`） |
| **专属互动模块** | su 木鱼 / kalpas 怒气条 / villv 抽卡 / aponia 命运之丝 / eden 黑胶唱片 / kevin 冰封的剑 / sakura 鞘中刀 / **kosma 他的口琴** |

> 已有页面的专属特效（避免撞车）：
> `petalCanvas` 花瓣 / `fateCanvas` 命运丝 / `goldCanvas` 金色音符 / `emberCanvas` 余烬 /
> `frostCanvas` 冰霜 / `bodhiCanvas` 菩提叶 / `confettiCanvas` 彩纸 / `sakuraCanvas` 落樱+刀光 /
> **`dawnCanvas` 旭光尘（全站唯一**向上**飘的粒子）+ 偶发的「吞」**
>
> ⚠ **kalpas 是红黑底 + 红橙，kosma 是墨绿底 + 金橙** —— 两个都是「暗底暖橙」，
> 最容易撞的一对。定色时对过 `--bg-abyss`：kalpas `#0c0503`、kosma `#070a08`。

#### 4.1.2 必做清单（漏一条就有后果）

| 动作 | 漏了会怎样 |
|---|---|
| 加进 `.github/workflows/static.yml` 的 **`KEEP_DIRS` 白名单** | **不会上线** |
| 加进 `sitemap.xml` | 搜索引擎找不到 |
| 加 `canonical` + JSON-LD（照现有子页复制改 URL） | 与首页「谁才是权威页」说不清 |
| **在 `data/timeline-data.js` 给这位补 `url`** | 首页名片不会亮小星、点不进去 —— **新页又成了孤岛** |
| 加进 `tools/check_aria_labels.py` 的 **`EXPECTED`** | 新页的语录卡文案**没人守**（快照测不出属性） |
| 加进 `tools/snapshot.py` 的 **`PAGES`** | 快照**根本不拍这一页**，改动无从验证 |
| 加进 `tools/check_reduced_motion.py` 的 **`PAGES`** | 新页的减动**没人验**（该表只覆盖 5 页，是抽样） |
| 角色页用**子页那套** `.back-link` / `.ending-*`（**不是** armor 那套） | 样式对不上 |

> 💡 **后三条最容易忘**（樱那一轮实测）：**工具不会自己知道多了一个页面。**
> 三个工具各自有一张页面清单，**要逐个补**：
> `check_aria_labels.EXPECTED` · `snapshot.PAGES` · `check_reduced_motion.PAGES`。

> 💡 **`url` 是「建页的最后一步」**。首页那两种入口（小星 + 「走进 TA 的页面 →」）
> **都只认数据里的 `h.url`** —— 没建页面的那几位自动不显示，不会造出死链。

### 4.2 给页面加 / 改彩蛋

**需求方定的标准：每位英桀至少 3 个彩蛋，且不重样。**

已有的机制（**新增时尽量避开**）：

| 机制 | 谁用过 |
|---|---|
| 点名字 | kalpas / su / villv |
| 长按名字 | su |
| 点专属元素 | kalpas（面具裂纹）/ sakura（刀） |
| 抽卡 | villv |
| 键盘序列（666） | villv |
| 结尾点语录循环 | kalpas / su / villv |
| **连点**（1.2s 内 6 次） | **aponia** |
| **双击** | **eden** |
| **闲置**（不动 25 秒） | **sakura** |
| **需够多次才生效**（点 5 次） | **kevin** |
| **跨彩蛋解锁** | **sakura** |
| **两次点击的间隔**（等一会儿再点才生效） | **kosma**（点名 →「……」；隔 2.5 秒以上再点 →「……算了。」） |
| **顺序点击**（两枚印记按对顺序） | **kosma**（先「善」后「恶」） |
| **累计陪伴时长**（可一直操作，只要还在页上） | **kosma**（90 秒 → 他的礼物） |

> 💡 kosma 的三个都**避开了既有机制**，而且都是「他的性格」本身：
> 话少（时序）、信条（顺序）、送礼物（陪伴）。**新页照这个思路找机制，别照抄。**
| 滚动到结尾触发 | aponia / eden / kevin |

**两条铁律：**

1. ⚠ **台词必须有出处，不能编。**
   直接取该页自己 `quotes` 区的台词（那些本来就都有出处），或取材材料包。
   **彩蛋机制可以自己设计，话不能编** —— 这是这个项目的底线。
2. ⚠ **别从别的页抄函数名，先 grep。**
   这些页是同一模板**各自复制**出来的，共享层**只抽走了 `ElysiaShared` 那几个**。
   页面内部的私有函数（粒子数组、迸发工具、工具函数）**每页一套，名字不一样甚至没有**。
   凯文那次照樱页写 `petalBurst(...)`，可凯文页**根本没有这个函数** → `ReferenceError`。

**加彩蛋时通常要顺手做三件事**：

- 需要提示就加一个 `showToast`（照现有页的写法；有些页原本没有）
- 专属元素要**排除出点击涟漪**（`e.target.closest('#xxxStage')`），别叠两层效果
- 用 `localStorage` 记进度时，`try/catch` 包住（隐私模式下会抛）

### 4.3 改完怎么验收

```bash
cd D:\claude-code\elysia-main

# 1) 起服务器 —— ⚠ 起完**必须先验内容**再采样（见 §6.4 的 pkill 坑）
python -m http.server 8500 &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8500/assets/site.css   # 应为 200

# 2) 快照 + 比对（参照点见 §4.3.1）
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-<本步>
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline-eggs after-<本步>; echo "退出码 $?"

# 3) 属性断言 —— 快照**测不出来**的那一类（ARIA 等）
PYTHONIOENCODING=utf-8 python tools/check_aria_labels.py

# 4) 减动断言 —— 快照同样测不出来（它不模拟媒体特性）
PYTHONIOENCODING=utf-8 python tools/check_reduced_motion.py

# 5) 关了服务器再走（别把 8500 留给下一个人）
netstat -ano | grep ":8500 " | grep LISTENING          # 查 PID
taskkill //F //PID <pid>                               # 杀
```

**验收口径有两档，别搞混：**

| 改的是什么 | 期望 |
|---|---|
| **纯重构 / 加彩蛋 / 加内容** | 差异**只落在被改的那个选择器上**（例如新增一节 → 只有 `height` 变化），其余页**零差异** |
| **有意改视觉** | 差异**全部能解释**，逐条对得上你的改动 |

> ⚠ **不是每次都要求「零差异」** —— 有意为之的改动当然会有差异。
> 要求的是**每一处差异都能解释**。解释不了就停下来查。

#### 4.3.1 快照参照点

| 目录 | 是什么 | 用途 |
|---|---|---|
| `baseline` | **P1 动手前**（`origin/main` worktree） | P1 最终验收（10/11/12 做完时用） |
| `baseline-task6` / `-task78` / `-task9` / `-seo` / `-sakura` | 各阶段 | 已用过，备查 |
| **`baseline-eggs`** | 三页彩蛋补齐之后（2026-09-17） | 备查 |
| **`after-kosma`** | **科斯魔页建成之后**（2026-09-18） | **下次改动用这个** |

> 参照点会随每轮前进。**建新基线前先看一眼哪些还有用**，别一直堆。
> （`screenshots/` 是 gitignore 的，只在本机。）

> ⚠ **P1 最终验收的口径是「零差异，除已解释的星屑重洗」**：
> `baseline` vs 最终状态会报 **72 处差异，全部落在 `.ending-star` 一个选择器上**。
> 根因是 Task 6 统一了随机调用顺序，星屑必然重洗 —— 星星本来就是每次加载重新随机的。
> **除 `.ending-star` 外，任何选择器动一处都要停下来查。**
>
> 💡 这一条同时是「**工具没坏**」的自检：若某天 `baseline` vs 当前状态报**零差异**，
> 别高兴 —— 先怀疑工具被缓存或日期问题弄成了恒真式（§6.4 那些坑）。

### 4.4 部署与发布

```bash
# 站点：push 到 main 即自动部署（static.yml，约 20 秒）
# Worker：手动部署
cd D:\claude-code\elysia-main\worker && wrangler deploy
```

**上线后建议再验一次「线上真机」**（不只是验本地文件）：

```bash
# 内容在不在
curl -s https://elysiad.top/sakura/ | grep -c "鞘中刀"

# 功能真能跑（用 cdp.py 指线上）
PYTHONIOENCODING=utf-8 python tools/cdp.py "https://elysiad.top/sakura/" size 1280x900 sleep 6000 \
  eval "(()=>{const s=document.getElementById('bladeStage');s.click();s.click();s.click();return 1})()" \
  sleep 1500 eval "'结果: '+document.getElementById('bladeCount').textContent"
```

> 2026-09-17 那次上线就是这么验的 —— 本地全绿**不等于**线上全绿（缓存、构建产物都可能是变量）。

### 4.5 现有工具（`tools/`）

| 工具 | 用途 |
|---|---|
| `cdp.py` | 无头 Edge 驱动。`eval` / `click` / `size` / `sleep` / `shot` / `text` |
| `snapshot.py` + `snapshot_diff.py` | **双基线验证**：8 页 × 3 视口的计算样式 + 整页截图 |
| `check_aria_labels.py` | 语录卡 `aria-label` 属性断言（**快照测不到属性**） |
| `check_reduced_motion.py` | 减动双向断言（**快照不模拟媒体特性**） |
| `pick_og.py` | 分享卡片轮换 |
| `og_convert.py` | PNG → JPEG（省 82%） |
| `to_webp.py` | 图片 → WebP（5.0 MB → 0.86 MB 就是它干的） |
| `convert_audio.py` | wma → mp3 转码 |

> 两个 `check_*` 都**自带服务器（端口 8501）**，刻意避开 8500 的残留陷阱（§6.4），
> 跑完自己清理，不占端口。

**快照工具的五个坑**（都修掉了，改 `snapshot.py` 时别退回去）：

| 坑 | 后果 |
|---|---|
| 浏览器 HTTP 缓存没关 | **每次都返回假的「✅ 无差异」** —— 工具形同虚设 |
| 无限动画停在随机相位 | 星星 opacity、呼吸光 box-shadow 每次都不同，全是噪音 |
| 星星是 `Math.random()` 生成的 | 两次跑必然不同。已用 `addScriptToEvaluateOnNewDocument` 固定种子 |
| 页面会去连线上献花接口 | 接口通/不通 → 文案不同 → **整页高度差 8px**。基线测的是网络不是代码。已 `setBlockedURLs` 屏蔽 |
| **日期在变** | 「今日之语」按本地日期取句、生日倒计时每天换字 → **同一天内零差异，跨零点就报差异**。已把「现在几点」钉死（`SEED_DATE_JS`） |

> ⚠ **采样属性清单 `PROPS` 是会长大的**：`left` / `top` / `animation-delay` 是 2026-09-16
> 补进去的 —— 起因是 Task 6 统一了随机调用顺序、星屑整体重洗，而**位置类属性当时根本
> 不在采样列表里**，能察觉纯属侥幸（正巧 `--dur` 的调用位置也变了）。
> 补上之后，同一组对照报出的差异从 **18 处涨到 72 处**。
> **加新属性时想清楚：这次改动会不会动到某个没被采样的东西？**

---

## 五、已知问题 / 等需求方拍板

### 5.1 等需求方拍板

- **`data/timeline-data.js` 里 12 位英桀的 `lore` 是两份稿子叠加**（旧稿未删、新稿续在后面），
  含 OCR 坏文（「凶笼」应为「囚笼」、「抓马」、「守难口磨去了金瞳」）与孤立的标点/姓名行。
  **点开首页名片就能看到**。13 位里只有樱是干净的。已记在设计文档 §2.4，未纳入任何计划
- **两处「配音」数据疑似有问题**（2026-09-17 发现，**未改**）：

  | 页 | 现状 | 疑点 |
  |---|---|---|
  | `kevin` | `秦且歌（汉语）` | 其余 6 页都是「汉语 / 日语」双语，**凯文缺日语** |
  | `kalpas` | `kinsen / 金船（汉语）· 小林裕介（日语）` | 多出一个 `kinsen /` 前缀，格式与其余 6 页**不一致** |

  > 按「绝不编造」的纪律，**没查到出处就不动**。要修请给权威来源。

- **`su/index.html` 的月亮装饰偏在屏幕最左边**（2026-09-17 发现，**未修**）：
  实测中心 x=239，而视口中心是 640。根因是 `.opening-content` **全站都没有 CSS 规则**，
  它只是个普通 block、宽度被最宽的子元素撑到 860px，块级圆形装饰在里面就贴左了。
  **villv / aponia 用文字装饰所以没中招，只有 su 用块级圆形。**
  樱页已用 `margin:0 auto` 避开；修 su 是**一行的事**，但会改变既有页面的视觉，
  要单独验证 + 单独 commit。详见 §10.3。

- **科斯魔页「侵蚀之战」那一条是二手来源**（2026-09-18 提出，**页面已写上，待确认**）：
  时间轴最后一张卡写了他「在侵蚀之律者闯入乐土的那一战里，把自己当作颜料，留在了格蕾修的画中」。
  而材料包 §附 明确标注：这段**官方 wiki 事件词条未收录完整对话**，米游社 / B站 / NGA 的梳理
  均为**二手转述**，引用时应注明「剧情梳理来源」而非「原文」。
  该页其余各条的出处都在材料里逐条对得上（少年的追忆 其四~其十），**只有这一条是转述**。
  **要改请给权威来源；说一声「就这样」也可以。**

- **`materials/` 有两处小情况**（2026-09-18 发现，未处理）：
  ① `materials/帕朵/` 是个**空文件夹**，真正的材料在 `帕朵菲莉丝/` —— 建页时别走错门；
  ② 只有 `科斯魔/` 和 `帕朵菲莉丝/` 带 `timeline-data.json`，
     **梅比乌斯 / 格蕾修 / 华 三包没有**。不确定是有意还是漏了。

### 5.2 已决定不改、另行跟踪

| 问题 | 决定 | 依据 |
|---|---|---|
| **`index.html` 的点击涟漪缺 `reducedMotion` 判断** | **不改，另行跟踪**（2026-09-16 需求方拍板） | 首页定义了 `reducedMotion` 却从未使用，其余 6 个子页的涟漪**都有** `if (reducedMotion) return;`。统一会让首页在减弱动效下从「有花瓣迸发」变成「完全没反应」——属**行为变更**，不混进纯重构 |

> ⛔ **不要**给首页那个点击监听器补 `if (reducedMotion) return;`

### 5.3 等需求方提供素材

- **首页隐藏彩蛋的台词**：`data/quotes.js` 的 `hidden` 现为空数组，所以**彩蛋不触发**（有意为之）。
  项目纪律是「绝不编造」，**拿到有出处的台词后填进去即可自动生效，代码不用改**
- **扩充实语料池**（可选）：现在 10 句，10 天一轮

### 5.4 时间点任务

- **2026-11-11（她的生日）**：当天记录献花总数。接近或超过 500 → 需要换 Durable Objects
  （方案见 `worker/README.md` §11）

### 5.5 已放弃的

- **QQ / 微信的分享预览**：需求方实测始终不出，已决定不再追。
  排查过程与排除项记在设计文档 §11.2。**别重查**

---

## 六、动手前必读的坑

### 6.1 部署相关

| 坑 | 说明 |
|---|---|
| **只有 `main` 会部署** | `dev` 上随便折腾，不影响线上 |
| **新增站点文件必须改进白名单** | `static.yml` 的 `KEEP_FILES` / `KEEP_DIRS`，否则不会上线 |
| **有两层缓存** | GitHub Pages（10 分钟）+ Cloudflare（2 分钟）。「改动没生效」先怀疑缓存 |
| **上线后要验线上** | 本地全绿 ≠ 线上全绿。见 §4.4 |

### 6.2 Cloudflare

| 坑 | 说明 |
|---|---|
| **默认不缓存 HTML** | 必须靠 Cache Rule，否则开了橙云反而更慢（实测慢一倍多） |
| **API 响应必须 `no-store`** | 否则加了 Cache Rule 后接口会被缓存 → 刚通过的留言两分钟后才可见。已在 `json()` 里统一处理 |
| **KV 写额度 1000/天** | 每献一朵花写 2 次 → 全站约 **500 朵/天**。**限额只在运行时绑定路径强制**，`wrangler kv` 那条路不拦但**照样扣额度** |
| **`*.workers.dev` 在大陆连不上** | 必须用自定义域名 |
| **D1 主区域创建时定死** | 建错了只能删库重建（`--location apac`） |

### 6.3 面向大陆访客

| 坑 | 说明 |
|---|---|
| **接口必须与页面同源** | 实测：同一台手机同一个网络，Edge 正常，QQ 浏览器 / 系统自带浏览器**页面能开但跨域请求被拦**，夸克连页面都打不开。所以 `/notes` 挂在 `elysiad.top/notes*` 走同源（`flowers.elysiad.top` 只留给本地开发） |
| **降级是静默的，所以漏改了很久没人发现** | 献花接口不通时不报错，只把文案从「这里已收到 N 朵花」换成「你的花已送达 · 本机累计 N 朵」。**症状是数字不对，不是报错** —— 排查时**先看文案，别看数字** |
| **来源判定别用精确 URL 字符串** | QQ 浏览器的云加速会把页面降级成 http，Origin 变成 `http://elysiad.top`，写成 `includes('https://elysiad.top')` 就会一字之差全部 403。**只比主机名**，且必须精确比（别用 `endsWith`，`elysiad.top.evil.com` 会漏进来） |
| **`http://elysiad.top/` 是通的（200，不跳转）** | 「始终使用 HTTPS」没开。⚠ **别顺手开** —— 跨 origin 跳转时浏览器可能把 `Origin` 改成 `null`，会被同一道来源检查拦下。要开得先在手机上实测 |
| **别用 `location.hostname === 'elysiad.top'` 判断环境** | 那些浏览器的云加速可能改写主机名。要写成「**默认同源，只有本地开发才用远端地址**」 |

### 6.4 工具与验证

| 坑 | 说明 |
|---|---|
| **⚠ `pkill` 杀不掉 Windows 原生 python 进程** | `python -m http.server 8500` 用 `pkill -f` 杀不干净 —— **多个服务器会同时监听同一端口**，请求落到哪个不确定。实测踩到过：为了生成 pre-P1 基线起了一个服务 worktree 的服务器，但旧的（服务主仓库）仍在响应，于是采样出一份**内容完全错的「pre-P1 基线」**。查：`netstat -ano \| grep ":8500 " \| grep LISTENING`（同一 PID 出现两行是 IPv4/IPv6 双栈，正常）；杀：`taskkill //F //PID <pid>`。**起完服务器必须先验内容再采样** |
| **`cdp.py` 的浏览器缓存跨次留存** | 它用固定的 `--user-data-dir=C:/tmp/edge_cdp`，**改了 CSS/JS 再测，读到的可能还是旧版本**。<br>⚠ **`?cb=<时间戳>` 只能刷掉「顶层文档」，子资源照样走缓存。** 实测：给 `data/timeline-data.js` 加了字段，`index.html?cb=...` 里 `window.HEROS[0]` **仍然读不到**。<br>**改到 `assets/*.js` / `data/*.js` / `*.css` 时，要清缓存**：<br>`rm -rf "/c/tmp/edge_cdp/Default/Cache" "/c/tmp/edge_cdp/Default/Code Cache"`<br>（`snapshot.py` 不受影响 —— 它用 `Network.setCacheDisabled`） |
| **`cdp.py` 的 click 要先滚动** | 它用 `getBoundingClientRect()` 的视口坐标派发鼠标事件，元素在视口外会**静默无操作**。且站点有 `scroll-behavior:smooth`，必须 `scrollIntoView({behavior:'instant'})` |
| **快照测不出「属性」** | `snapshot.py` 采的是**计算样式**。`aria-label`、`title`、`alt`、`href` 这类**属性**不在采样范围内 —— 它们被改掉时快照会报「✅ 无差异」。所以有 `tools/check_aria_labels.py`。**改属性类的改动，快照通过不算通过** |
| **快照不模拟媒体特性** | 减动（`prefers-reduced-motion`）它测不到，跑的是默认无偏好路径。所以有 `tools/check_reduced_motion.py` |
| **⚠ 快照基线会「随日历漂」（已修，别再弄丢）** | 页面有两处吃日期：「今日之语」按**本地日期**取句、`#bdayEgg` 每天换字。**同一工作日内怎么复核都是零差异，跨过零点就报差异** —— 它会骗过一切当场自检。已把「现在几点」钉死在 `2026-09-16 12:00 UTC`。**改 `snapshot.py` 时别把 `SEED_DATE_JS` 弄丢** |
| **探测 `loading="lazy"` 的图片要把视口拉高** | 否则下面的图不加载，渲染盒 `0x0` —— 那是正常行为，不是回归 |
| **元素有入场动画时要等** | `.timeline-node` 是 `opacity:0` + IntersectionObserver 出 `.visible`。滚过去要 `sleep` 一两秒再截图，否则拍到一片空白 —— 那不是页面坏了 |
| **改视觉必须截图核对** | 项目纪律：不接受「看起来差不多」。桌面 `1280×900` + 移动 `375×812` 各一轮 |
| **颜色类改动用像素差分** | 相近的浅色（`#ffe5a0` vs `#f0e6ff`）肉眼分不出。用 `PIL.ImageChops` 比对前后截图，再拿 `getBoundingClientRect()` 交叉核对「差异是否落在目标元素内」 |
| **Windows 跑 Python 要带 `PYTHONIOENCODING=utf-8`** | 否则中文输出 GBK 崩 |
| **Bash 工具会吞内联字符串里的反斜杠** | `python - <<'PY'` 和 `node -e "..."` 常因此报错。**把脚本写成临时文件再执行，别写进仓库** |
| **⚠ 快照没跑完就跑差分 → 会「少报差异」** | `snapshot.py` 是 9 页 × 3 视口的慢循环，**跑完才落盘**。它还在跑的时候跑 `snapshot_diff.py`，读到的是**半份目录** —— 实测（2026-09-18）：提前跑报「1 处差异」，等它真跑完再跑是「**3 处**」。<br>⚠ 更坑的是它**不会报「快照缺失」** —— 目录里还没有的页，对它来说就是「不存在」，连提示都没有。<br>**判据**：① `ls screenshots/snap/<label>/ \| wc -l` 应等于「页数 × 3 视口 × 2 文件」；② 后台任务输出里要看到 `快照存入 ……` 那一行、进程真的退出了。 |

### 6.5 「页面之间各不相同」的坑

| 坑 | 说明 |
|---|---|
| **跨页抄代码前先 grep 函数名** | 这些页是**同一模板各自复制**出来的，共享层只抽走了 `ElysiaShared`。私有函数每页一套、名字不同甚至没有。凯文那次踩过（`petalBurst` 不存在 → `ReferenceError`） |
| **CSS 变量缺失是「静默」的** | 变量不存在时该声明**在计算值阶段**失效，`color` 会回退成**继承父元素** —— 不报错、不提示，只是悄悄变样（`armor.html` 的 `--gold-soft` 就是这么失色了 3 个月） |
| **`.opening-content` 全站没有 CSS 规则** | 它只是个普通 block、宽度被最宽子元素撑到 860px。**块级装饰放进去会贴左**（su 的月亮就中招了）。要居中得自己写 `margin:0 auto` |
| **`.opening-ornament` 有两种写法** | villv / aponia 是**文字**（靠 `text-align:center` 天然居中）；su 是**块级圆形**（会贴左）。新页建议用文字或自己居中 |

---

## 七、常用命令速查

```bash
cd D:\claude-code\elysia-main

# 本地服务器（截图与手测都走它）
python -m http.server 8500

# 截图（桌面 / 移动）—— ⚠ 元素在视口外要先 scrollIntoView
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  size 1280x900 sleep 2000 shot screenshots/x.png
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  size 375x812 sleep 2000 shot screenshots/x-mobile.png

# 三项验收（§4.3）
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-<label>
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline-eggs after-<label>
PYTHONIOENCODING=utf-8 python tools/check_aria_labels.py
PYTHONIOENCODING=utf-8 python tools/check_reduced_motion.py

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
    ├── 2026-09-15-elysiad-extraction.md         计划 B：P1 公共层抽取，12 个任务（Task 1–9 完成）
    └── 2026-09-15-extraction-inventory.md       CSS/JS 抽取分析（1173 行）★ P1 的事实来源

tools/README.md                                   本地工具说明
worker/README.md                                  Worker 部署手册
                                                  §11 = KV 额度实测  §12 = 匿名花笺  §13 = 同源路由 / 来源判定

D:\claude-code\materials\<角色名>\                4 位待建英桀的建站材料包（台词/视觉/音频清单）
```

**四份必然要读的**：

1. **本文档**（你正在读）
2. `docs/superpowers/specs/2026-09-15-elysiad-update-design.md` —— 规格与决策的唯一准绳
3. `docs/theme-schema.md` —— **只要动到 `THEME` 或要开新页面，先读这份**
4. `docs/superpowers/plans/2026-09-15-extraction-inventory.md` —— 只在做 P1 的 Task 10–12 时读

---

## 九、这个项目的做事方式（比规则更重要）

前几轮执行下来，**真正挡下事故的只有一条纪律**：

> **每一步都必须真跑，对不上就停下报告，不许假装通过。**

它挡下的是这些（全都是「不跑就永远不知道」的那类）：

| 差点混过去的问题 | 不跑的后果 |
|---|---|
| `daily.js` 缺 `defer` | 面板**静默空白**，不报错，最难查 |
| `img` 属性没配套 `width:auto` | **图片拉伸 34%** |
| 献花超时设 1500ms | 健康的接口被误判成故障，访客**以为没人来过** |
| 截图没先滚动 | 目视验收形同虚设 |
| 比较表达式是恒真式 | 永远输出「相同」，测了等于没测 |
| `--dry-run` 在干净环境下显示假 100% | 报告里全是假数据 |
| **计划里的断言没实测** | Task 7/8 的 6 处偏差；Task 9 的 `.phase-boom` |
| **工具「没坏」没自检** | 快照随日历漂了都不知道 |
| **差分跑在快照跑完之前** | 读到半份目录，**少报差异**（实测 3 处被报成 1 处），而且不报缺失 |

**所以：验证步骤不是形式，是这个项目唯一的安全网。** 计划里凡是写「期望：xxx」的地方，都要真跑一遍核对。

另外三条：

- **发现计划错了就停下来报告** —— 错的计划比错的代码更危险，因为后面每个人都照着它做
- **不确定的事标「待确认」，不要猜** —— 台词、设定、日期都算
- **提了疑虑但需求方复述确认之后，就照他的做** —— 他是这个站的作者。2026-09-17 樱的生日/装甲
  那两条就是如此（我按材料包判断存疑、提出后他给了依据，于是照办并记进 §10.3）

---

## 十、附录：案例与教训（出问题时再查）

### 10.1 献花在 QQ 浏览器上坏了两轮（2026-09-16）

**这事分两幕，第一幕修完还坏着 —— 别只看第一幕就当修好了。**

**第一幕：接口跨域。** `assets/flowers.js` 把接口地址写死成 `https://flowers.elysiad.top`，
页面却在 `elysiad.top` —— 跨域。改法：`wrangler.toml` 加同源路由
（`elysiad.top/count`、`elysiad.top/flower`），`flowers.js` 改成「默认同源，本地开发才用远端」。
⚠ 加路由**不要**改成 `elysiad.top/*`，那会把整站静态页也吞进 Worker。

**第二幕：同源之后仍被 403（只差一个字母 s）。** GET 通了、POST 仍失败。
`wrangler tail` 走 WebSocket 本机连不上，改用临时诊断（把被拒的 `Origin` 写进 KV 再读出来）。
根因：QQ 浏览器的云加速把页面**降级成 http**，Origin 是 `http://elysiad.top`，
而白名单是精确字符串 `https://elysiad.top`。修法：**只比主机名**（`new URL(origin).hostname`）。

**回归用例**：`worker/test/smoke.mjs` 新增【12】共 12 项（献花 26 → **38** 项），
并**验证过这 12 项在旧代码上会失败** —— 否则就是「测了等于没测」。

**教训**：降级是**设计好的静默行为**，症状不是报错而是「数字悄悄变成本机计数」。
**排查时先看文案，别看数字。**（已进 §6.3）

### 10.2 `armor.html` 金色徽章静默变白（2026-09-16）

`.type-badge.skin` 用了 `var(--gold-soft)`，但该变量只在 `index.html` 的 `:root` 里定义。
**CSS 变量不存在时声明在计算值阶段失效**，`color` 回退成继承 `body` 的 `#f0e6ff` ——
不报错、不提示，只是悄悄变白。

**验证方式是像素级差分**（不是「看着差不多」）：计算样式 `.type-badge.skin` 的 `color`
改前 `rgb(240,230,255)` → 改后 `rgb(255,229,160)`；同页另三个徽章与 `body` 完全一致。
截图差分：两个视口都只有约 23×10 px 的区域不同，且**严格落在该元素矩形内**。

> 📌 顺带发现：这个 bug **静默存在了 3 个月**，因为「金色变冷白」在徽章尺寸下肉眼难辨。
> **这就是为什么 §6.4 要求颜色类改动用像素差分。**

### 10.3 建第一张新页：樱（2026-09-17）

**`/sakura/` 是 13 页大计的第一张新页，也是后面 4 张的参照。**

做法（已提炼进 §4.1）：**复制 `su/index.html` 骨架 + 脚本逐块替换**，
每处替换断言命中次数、对不上就整体中止。

**这一页「自己的特色」**（需求方要求每位不重样）：

| 维度 | 樱 |
|---|---|
| 配色 | **冷靛黑 + 樱粉 + 冰蓝**（index/villv 是暖紫粉、kevin 是中性冷蓝） |
| 特效 | `sakuraCanvas` 落樱 + 冰尘 + **偶发的「刹那」刀光**（7~15 秒一次） |
| 专属模块 | **「鞘中刀」** —— 一柄不肯出鞘的刀 |
| 三个彩蛋 | ① 点刀三次 → 她**拒绝**拔刀，改赠你一朵「勿忘我」② **结尾跨彩蛋解锁**：收过花才多一句 ③ **闲置 25 秒** → 一瓣樱落下，她说那句「等待…」 |

**⚠ 两条被需求方更正过的字段（别照材料包改回去）**：
`materials/樱/` 里写的与需求方口头更正相反 ——

| 字段 | 材料包 | **需求方确认的** |
|---|---|---|
| 生日 | 【待考】官方未公布 | **7月22日** |
| 装甲 / 可操作性 | 【待考】并非可操作女武神，是乐土 NPC | **可操控，装甲「御神装 · 勿忘」** |

> 需求方原话：「我确认这两条就是前文明樱的，**逐火之蛾剧情里操控的就是御神装·勿忘**。」
> **旁证**：材料包给的武器「超限『御灵刀 · 寒狱冰天』」正是御神装·勿忘的武器。
> **材料包不是错的来源，只是判断不同 —— 以需求方为准。**

**顺带发现的既有 bug**：`su` 的月亮装饰**偏在屏幕最左边**（中心 x=239 / 视口 640）。
根因见 §6.5。樱页已用 `margin:0 auto` 避开，**su 的没动**（见 §5.1）。

### 10.4 给三个「空页面」补彩蛋（2026-09-17）

需求方要求每位至少 3 个彩蛋。盘点后发现 **aponia / eden / kevin 整页一个都没有** ——
每页只有 1 个共享的点击涟漪监听器，**阿波尼亚那页连 `showToast` 函数都不存在**。

| 页 | 新增模块 | 三个彩蛋 |
|---|---|---|
| aponia | 「她的丝」命运丝环 | ★**连点 6 次 → 施「戒律」**（丝线从四周收进来缚住你）/ 点丝环 / 结尾垂丝 |
| eden | 「她的歌」黑胶唱片（**会发声**，三个振荡器合成和弦，不加载音频文件） | 唱片 / ★**双击举杯** / 陨落的星 |
| kevin | 「他的剑」冰封的剑 | ★**点够 5 次才断** / 冰鸟 / 结尾的承诺 |

**踩的坑**：凯文那页照樱页写了 `petalBurst(...)`，可凯文页**根本没有这个函数** →
`ReferenceError`。教训已进 §6.5。

**教训**：**彩蛋要在第一版里做掉。** 这三页就是因为先上线、又没人回来看，空了很久。

### 10.5 首页名片入口 + `BUILT` 那个重复开关（2026-09-17）

**起因**：参照 `elysia.cc`（同主题粉丝站）做了一轮对比。它用一张可缩放的「英桀关系网」
顺带解决了「怎么走到各个角色页」。

**而我们的问题**：**6 个角色页从首页根本点不到**（`index.html` 只链了 `armor.html`）。

改完之后又发现一件事：首页上有**两套**在管「这位建好了没有」——
`index.html` 底部的 `HERO_SITES` + `BUILT` 两张表，和我新加的 `timeline-data.js` 的 `url` 字段。
**同一件事两处维护，樱那页就漏了改 `BUILT`。**

已合并：**删掉 `BUILT`（`HERO_SITES` 一并删）**，改成从名片数据现算。
现在只有一处，而且「未建好的角色点两次会提示『建设中』」也自动跟着走。

> 📌 **两个行为要知道**：
> ① 点名片**要点两次**才跳转（第一次只展开档案，这是原设计，保留了）；
> ② 入口只认数据里的 `h.url`，没建页面的自动不显示，**不会造出死链**。

> 💡 `elysia.cc` 对比的其他结论（供参考，未采用）：
> 它有自建 AI 聊天（`webchat.elysia.cc`，Next.js + HMAC 请求签名
> ——`timestamp:method:path:body` 签名 + 防重放——+ 流式响应，
> 按 `characterId` 参数化、**支持多角色**）、
> 「我们相遇的第 1 天」陪伴计时器、自托管 Umami 统计。
> **不学**：`user-scalable=no`（WCAG 1.4.4 失败）、客户端 bundle 里放密钥、
> 微软 Clarity 会话录制、695KB 的 PNG 首图。
> **体积上我们赢约 10 倍**（gzip 后 ~23KB + WebP vs 它 ~940KB）。
> 它的关系图是**搬官方的**（自己 `robots.txt` 里 `Disallow: /rolemap/`）。
> ⚠ **它的 `data.json` 里有逐角色的评语，不能抄** —— 要做得自己找官方出处。

### 10.6 P1 公共层抽取（Task 1–9，2026-09-16 ~ 17）

**背景**：8 个页面各自复制了一整套 CSS/JS。分析结论（`extraction-inventory.md`，1173 行）：

| 组 | 数量 | 处置 |
|---|---|---|
| A 组（跨页逐字节一致） | **31 条** | 进 `assets/site.css` |
| B 组（同选择器不同值） | 47 条 | 留各页做主题覆盖 |
| C 组（页面专属） | 225 条 | 不动 |

**做 Task 10–12 之前必读** inventory 的 §3 风险清单与 §5.1 待确认项。**三个雷**：

1. **`armor.html` 的 `.timeline` 是另一套结构** —— **绝不**并入 7 页版本
2. **`--gold-warm` / `--flame` 同名不同值不同语义** —— **绝不**提升为公共 token
3. **`index.html` 的点击涟漪原本没有 `reducedMotion` 判断** —— 统一它属于**行为变更**，
   要单独 commit 标明（而且需求方已决定**不改**，见 §5.2）

| Task | 内容 | 结果 |
|---|---|---|
| 1 | 验证地基（`snapshot.py` / `snapshot_diff.py`） | ✅ **计划给的代码是坏的，先后修了五个坑** |
| 2 | 新建 `assets/site.css` | ✅ |
| 3 | 7 页接入基础重置 + keyframes | ✅ 删 55 条 |
| 4 | 7 页接入几何中性规则 | ✅ 删 **153** 条 |
| 5 | 归一化前导零写法 | ✅ index 79 处（JS 里的 43 处一个没碰） |
| 6 | 抽出 `assets/site.js`（resize 工厂 + 星屑生成） | ✅ 7 页改用 `ElysiaShared` |
| 7 | 语录卡 + 滚动进场 | ✅ 6 子页接入；**删 66 行/页** |
| 8 | 打字机（`makeTypewriter`） | ✅ 7 页接入；五个数值逐页参数化 |
| 9 | 全站减动保护（WCAG 2.3.1） | ✅ 见下 |

**Task 7/8 实测发现计划有 6 处与现场对不上**（`aria-label` 会被抹掉、`hintEl` 是 3 页不是 2 页、
`tailDelay`/`hintDelay`/`startDelay` 都逐页不同、还漏了「打字前的装饰元素点亮」）。
逐条记在 `docs/theme-schema.md` §八。
**教训：计划里凡出现「各页相同」「某页独有」这类断言，先实测再动手。**

**Task 9（减动）三个实施时才知道的坑**：

1. **`.phase-boom` 不能整个跳过** —— 它不只是白闪，还负责把倒计时元素
   （`.kk-banner` / `.kk-count` / `.kk-vignette`）变成透明。
   跳过它「3·2·1」会**留在画面上**。只关 `.kk-flash`。
   （同理 `kalpas` 那边是 `body.raging` / `#rageOverlay.lit` 两个类）
2. **`fireKevinKiller666` / `startRage` 不是全局函数** —— 两个页面的脚本都是 IIFE 包裹的。
   计划里那条 `typeof … === 'function'` 会得到 `undefined`。**验证要走用户路径触发。**
3. **减动断言不能写死期望值** —— kalpas 的 `.profile-card` 本来就没有动画，
   写死会把「原本就没有」误报成「泄漏」。要**拿正常态当基准做相对比较**。

**仍在有效的两条**：

- ⚠ **R10**：villv 缺粒子 resize 守卫 —— **保持现状，不要顺手补**
- ⚠ **R11 的写法已确立**：观察器一律**带判空**。这是**行为改善**，不是纯重构 ——
  后续遇到同类情况照此办理并单独 commit

**剩下的 Task 10 / 11 / 12**（index 专项 / armor 专项 / 收尾）**留到 5 张新页做完之后**。
理由见 §2.3。

### 10.7 建第二张新页：科斯魔（2026-09-18）

**`/kosma/` 是 13 页大计的第二张新页，也是「照 §4.1 配方」的第一次复现。**

做法与樱那次一致：`cp su/index.html kosma/index.html` → 脚本逐块替换。
这次落实了「**每处替换断言恰好命中 N 次、对不上就整体中止不写盘**」——
脚本一次跑过 **62 处替换全命中**，没有留下改一半的页面。写完后 `grep` 反向核对
**零个 su 遗留标识符**（`muyu` / `meru` / `bodhiCanvas` / `shaVeil` / `zenLines`……）。

**这一页「自己的特色」**：

| 维度 | 科斯魔 |
|---|---|
| 配色 | **墨绿近黑 + 旭光橙**（`--bg-abyss:#070a08` / `--dawn:#f9a152`）。与 kalpas 的**红黑 + 红橙**最容易撞，特意对过 `--bg-abyss` |
| 特效 | `dawnCanvas` —— **全站唯一往上飘的粒子**（别人都是花瓣/雪/余烬往下落；「旭光」本来就是从地平线升上来的），外加偶发的「**吞**」（几颗光尘被某个看不见的东西吸走 —— 二次吸收） |
| 专属模块 | **「他的口琴」** —— 每吹一下浮出一行**官方内心独白**（给予刻印·其十四~十九）。这一块把「沉默寡言、内心丰富」八个字直接变成了看得见的东西 |
| 开场徽记 | 半升的日轮 + 两只由暗到暖的弯角（**日轮只画半轮**：他从不觉得自己是完整的那道光） |
| 打字机 | `175 / 105 / 1400` —— 全站**最慢、最犹豫**的一份（性格锚点见 `docs/theme-schema.md` §七：沉、缓、断续） |

**三个彩蛋，机制全部避开既有页**：

1. **「……算了。」** —— 点名字只有「……」，**隔 2.5 秒以上**再叫才补上后半句（时序）
2. **「善恶两分，不可让渡」** —— 两枚印记按 **「善」→「恶」** 的顺序点（顺序）；点反了他重新盖回去
3. **「他的礼物」** —— 在页上**累计待够 90 秒**（可以一直操作，不必静止）→ 他给你一份礼物（陪伴）

> 💡 **设计思路值得抄的是「怎么找机制」，不是机制本身**：
> 先问「这个人最核心的一件事是什么」，再问「哪件交互能把它演出来」。
> 他的三件事 —— 话少、有信条、爱送人东西 —— 正好各对应一个机制。

**⚠ 这一轮踩到的新坑（已进 §6.4）**：
`snapshot.py` 还在跑的时候跑了 `snapshot_diff.py`，读到的是一份**半截目录**
—— 报「1 处差异」，等它真跑完再跑是「**3 处**」，而且**不报「快照缺失」**。
**下次：先确认后台任务真的退出、文件数 = 页数 × 3 × 2，再跑差分。**

**顺带核对的**：`var(--x)` 全定义检查（§6.5 那个「静默失效」的坑）——
本页 16 个引用**全部有定义**，零个静默回退。

---

## 十一、给下一位的一句话

需求方是这个站的**唯一作者和维护者**，他对细节有很强的判断力，也愿意听不同意见 ——
**该说「这个方案有问题」的时候直接说**，前面几轮里最有价值的产出往往来自
「我实测了一下，和你我原先的判断不一样」。

**但同样重要的是**：说完了、他复述确认了，就照他的做（樱的生日那两条就是）。
他的判断有你可能不知道的依据，而这是他的站。

祝你顺利呀♪
