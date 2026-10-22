# 重构阶段 0+1 实施计划：消灭「12 页复制粘贴」

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 12 个角色页从「复制粘贴的手写 HTML」变成「content 数据 + 模板 → 构建出同构静态页」，让改一处全站生效；同时铺好构建/预览/验证管线，为 Q 版小人动画与丝滑专项预留挂钩。

**Architecture:** 纯前端构建管线（本地/CI 构建，服务器永不构建）。阶段 0 用「空转构建」证明管线；阶段 1 逐页模板化，每页以 DOM 规范化 diff + 全套断言 + 手机扫三重验证。线上 :80 在切换前一动不动，新产物挂在 /v2/ 预览路径。

**Tech Stack:** Node 22（已装）。**Task 1~8 零第三方依赖**；Nunjucks 到 Task 9 才安装（降低早期失败面）。Fastify/SQLite 不在本计划。

**Spec:** `docs/REFACTOR-PLAN.md`（总方案，本计划实现其阶段 0+1）

**修订记录：** v2（2026-10-18）按主人审阅意见修订：修正空转构建自校验矛盾、新增验证矩阵、模板块契约提到架构层定死、私有样式脚本改为外置拼接（根除 Nunjucks 转义风险）、THEME 豁免改结构性替换、补旧源退役/双源校验/YAML 解析保护/CI gate 等 15 项。逐条对照见文末「审阅意见处理记录」。

## 与总方案的一处偏离（已向主人声明并获准）

总方案阶段 0 写的是「Fastify + SQLite」。本计划将其移出阶段 0：现网 API（server.js + arena.js）是实测过的，现在重写只有风险没有收益；API 迁移的天然位置是阶段 4（擂台前端）前夜。阶段 0 瘦身为「管线 + 地基」，集中火力清最大的债。

## Global Constraints（每个任务默认继承）

- **手机优先**：320/360/390 三档无横向溢出、触控目标 ≥44px（现网已达标，重构不可退化）。
- **同构红线**：阶段 1 是重构不是改版 —— 每页 diff 白名单必须为空才可提交；「看起来差不多」不算过。
- **现有断言全绿**：check_explore（每页 29 条）、check_page_health、aria、reduced-motion，一条不能掉。
- **验证三纪律**：URL 带 ?cb=<随机>；sleep ≥ 4200 等稳定；探针带 document.title + h1 自检。
- **服务器不构建**（GnuTLS 被掐的教训）：构建只发生在本地或 GitHub Actions。
- **防剧透**：replays.json 等擂台数据永不进静态目录（本计划不触碰，仅作约束记录）。
- **线上 :80 不动**：切换前一切新产物只进 /v2/ 预览路径，且 v2 备份目录与生产独立。
- **每步可回滚**：沿用 .prev 目录机制（v2 用 .prev-v2，互不干扰）；每页迁移独立成 commit。
- **构建可重现**：同一 commit 两次 build 必须逐字节一致（目录遍历排序、不写入时间戳、强制 LF 无 BOM）。
- **文本纪律**：程序与文档的中文正文一律用「」，禁半角引号；**代码、路径、命令行里的半角引号不受此限**（不要过度替换）。

## ⭐ 验证矩阵（哪些检查能在哪儿跑 —— 防「在 /v2/ 上验证了资源完整性」这类假通过）

页面内资源是绝对路径 `/assets/…`，所以访问 `/v2/kevin/` 时资源请求打到**生产** `/assets/`，不是 v2 目录。因此：

| 检查项 | 本地自起服务器（--root public） | /v2/ 预览 | 切换后 :80 |
|---|---|---|---|
| HTML 语义 / DOM 规范化 diff | ✅ 主战场 | ✅（只比 HTML） | ✅ |
| 资源 404 / 图片破 / 漏拷兜底 | ✅ **只在这里有效** | ❌ 打到生产资源，无效 | ✅ |
| 手机三档布局 / 触控 / 横向溢出 | ✅ | ✅（HTML 与布局） | ✅ |
| 探索/游戏断言（29 条） | ✅ | ✅（同源 API 请求走生产） | ✅ |
| Service Worker 注册 | ❌（非 https） | ❌（scope=/） | ✅ **只在切换后跑** |

⇒ **Task 2 Step 3 的 md5 对比只覆盖 HTML**；资源完整性一律由 Task 3/5 在本地 public/ 上验证。

## ⭐ 模板契约（Task 9 之前必须定死，提前写在这里）

**问题背景：** 页面私有 `<style>`（12~20KB）与 `<script>`（17~28KB）里有 `{{`、`{%`、`{#` 之类字符的风险，交给 Nunjucks 解析会渲染错甚至构建失败。**解法：一律不交给 Nunjucks** —— 私有代码块**外置为纯文本文件，由 build 按标记拼接**。

```
templates/base.njk                 ← 只含公共骨架与结构，无任何私有代码原文
templates/partials/head-meta.njk   ← title/description/og
templates/partials/signet.njk      ← 刻印水印+徽章；chibi 槽（数据缺省则零字节）
templates/pages/<key>.njk          ← 结构 + 标记占位符
templates/pages/<key>.page.css     ← 页面私有 <style> 原文（纯文本，零解析）
templates/pages/<key>.page.js      ← 页面私有 <script> 原文（纯文本，零解析）
```

**标记拼接契约（build.mjs 负责，纯字符串替换）：**

| 标记 | 替换成 |
|---|---|
| `<!--@PAGE_STYLE@-->` | `<key>.page.css` 全文，包进 `<style>…</style>` |
| `<!--@THEME@-->` | `var THEME = <character 的规范化 JSON>;` |
| `<!--@PAGE_INIT@-->` | `<key>.page.js` 全文，包进 `<script>…</script>` |

**base.njk 的脚本序列（唯一允许硬编码的公共顺序，其余由页面声明）：**

```
site.js → explore.js → bottom.js → [<!--@PAGE_INIT@--> 位置：角色模块与页面 init] → bday.js → bdays.js
```

⚠ 角色模块（kevin.js / aponia.js …）**不属于公共序列**，由页面模板在 `page_scripts` 槽里声明（因为每页文件名不同、404 页根本没有）。
⚠ index/armor/guestbook 的脚本序列完全不同，**不在本计划范围**：将来它们用各自的 base 或扩展槽，不硬塞进角色页 base。
⚠ Nunjucks 配置：autoescape 保持默认 false（与 Jinja 相反）；不开 trim/lstrip_blocks（避免改空白）。

## Review Focus（spec 没写、但最可能咬人的五类输入，及兜底测试）

1. **构建/拼接改写了字节**（换行、BOM、空白、标记残留）→ 兜底：Task 1 的 `--verify-only` 与「两次构建同哈希」；Task 4 的 DOM diff 白名单。
2. **THEME 从 JS 字面量变 JSON 后语义漂移**（丢字段、坐标精度）→ 兜底：Task 8 校验器 + Task 9 起每页 29 条断言（直接依赖 THEME）+ Task 4 的 THEME 语义豁免（不相等就不豁免）。
3. **构建产物不完整**（漏拷 images/data/assets ⇒ 静默 404）→ 兜底：Task 1 逐文件哈希 + Task 3/5 在 **本地 public/** 上跑资源 404 检查（见验证矩阵，/v2/ 查不出来）。
4. **/v2/ 路径语义**（绝对 /assets/ ⇒ 打到生产；sw.js scope=/ ⇒ 不注册）→ 兜底：验证矩阵 + Task 11 切换后跑 SW 断言。
5. **公共脚本顺序被改乱** → 兜底：base.njk 硬编码单一序列 + 角色模块走槽 + check_explore 的模块加载断言。

## 新增决策点：head 有三种历史写法（2026-10-18 Task 9 前置调查发现）

实测 12 页 `<head>` **不是同一套**（复制粘贴债的直接证据）：

| 特征 | 页 |
|---|---|
| 标准写法（viewport 靠后、有「小花」注释、explore.css 外链） | kevin aponia eden villv kalpas su sakura mobius griseo |
| **多一份 explore 内联样式**（同时还有外链 ⇒ 重复） | kosma |
| **viewport 靠前 + 无小花注释 + 多一份 explore 内联** | hua pardofelis |

⇒ 结论：**单一 base.njk 无法零差异复刻 12 页 head**。两条路：

| 方案 | 做法 | 代价 |
|---|---|---|
| **A 同构优先（建议）** | 每页保留自己的 head 文件（`<key>.head.html`，其中 7 处数据值替换成占位符由 build 注入） | diff 为零；head 字面量仍按页维护，留到 M1.5 统一 |
| B 现在就统一 | 12 页统一成标准 head（顺手去掉重复的 explore 内联） | 6 页出现**有意差异**，需逐条解释 + 重跑全套件 + 目视复核；省掉一份重复 CSS |

> 建议 A：M1 的红线是「同构、diff 为零」，统一 head 属于**改版**，应单独做（M1.5），
> 那时模板已在手，统一 = 改一次 base + 删 `headVariant` 数据，成本极低且可独立验收。

## 拍板记录（2026-10-18 · Task 7 盘点后）

| # | 事项 | 决定 |
|---|---|---|
| ① | head 里的 style 块 | `signet-mark`/`signet-badge-css`/`touch-target-fix` 进 base（**并补齐缺此块的 kevin/su**）；`narrow-320-fix`/`mobile-ovf-fix`/`threshold-44-fix` 归页面私有 |
| ② | 脚本顺序两种变体 | **保序**：脚本序列做成**页面级数据数组**，base 不硬编码角色模块位置 |
| ③ | 每页 meta | **数据驱动**（title/description/canonical 进 character JSON 的 meta 段） |
| ④ | `quotes` / `typewriter` | 作为**可选键原样保留**（mobius/hua/pardofelis 三页才有） |
| ⑤ | hua/pardofelis 的游戏 | **已核实：有游戏，且是内联实现**（`ElysiaGames.<key>` 写在页面 `<script>` 里），迁移时随页面私有脚本原样搬运 |

## 动画素材挂钩（方向已明确：Spine 骨骼动画）

**2026-10-18 盘点发现**（主人正在准备，未提交）：

- `material/逐火英桀擂台/06_战斗小人规范.md` 已是 **Spine 契约 v1**：13 位英桀共用 **11 根骨骼 + 8 段动画**（名字与时长固定），回放事件到动画有映射表，含体积预算与已知限制；
- 已有可跑样本：格蕾修（`grseo` 含 `griseo_battle.json`）、爱莉希雅 7 套（`elvisa_1..6` 的 skel+atlas+png）、维尔薇（`wiiecei_battle.json`）；
- `tools/spine_chibi/` 已有 add_battle.py 与 gen.py；仓库里还躺着一份**未压缩** `spine-webgl.js`（436KB）。

本计划（0+1）**只留槽、不实现动画**，三件零成本事：

1. **数据槽**（Task 8 schema）：`chibi: null` ⇒ 定稿后填 `{ still, spine: { skel|json, atlas, png }, animations: {...} }`；
2. **渲染槽**（Task 9 `partials/signet.njk`）：数据存在才输出节点，缺省**零字节**，12 页无需再改；
3. **素材隔离**：`material/` 与图片源料**永不进 KEEP_FILES/KEEP_DIRS 白名单**（Task 1 的解析保护已把白名单当唯一真源）。

**三条硬约束（阶段 2 前必须守住）**：

| # | 约束 | 理由 |
|---|---|---|
| 1 | Spine runtime **只准在擂台回放页懒加载**，角色页与首页零加载；上生产前必须换 min 版或裁剪 | 现成那份 436KB 未压缩，压在本站 33MB 的体量与手机首屏上会是灾难 |
| 2 | `prefers-reduced-motion` 下**停在第 1 帧**（不是隐藏、不是跳过） | reduced-motion 套件断言兜底；停帧也保留了角色形象 |
| 3 | 单角色三件套（png 为主）体积以 `06_战斗小人规范.md` 的预算为准；atlas/json 走 brotli | 手机端收益最大，规范里已给数字，不在这里另定 |

> 阶段 2 的输入其实已就绪大半：契约有了、3 个角色有模型、工具有雏形。**等主人说开工，我就按契约接。**

## 丝滑专项（阶段 1.5 —— 切换之后才动手）

主人要求「网站更丝滑」。**刻意排在阶段 1 之后**：阶段 1 的验收是「同构、diff 为零」，任何行为变化都会污染 diff。

| 手段 | 说明 | 验收 |
|---|---|---|
| motion tokens | site.css 一处定义 --motion-fast/slow、--ease-soft | 全站动画时长只改一处可调 |
| View Transitions（MPA 跨文档） | 一条 CSS + 关键元素命名；Chrome 126+/Safari 18+，其余无感降级 | 录屏对比 + 减动偏好下无过渡 |
| Speculation Rules | 站内链接 prefetch/prerender（Chrome 渐进增强） | 手机端二次访问 LCP 下降实测 |
| content-visibility:auto | 长段落 + contain-intrinsic-size | 滚动长任务 <50ms |
| 预算 | INP<200ms、CLS<0.02、LCP<1.5s(4G) | perf8 复测；现网已达指标（卡顿帧 2）不可退化 |

## 新目录结构（阶段 0 建立）

```
content/
  site.json                  ← 全站数据（导航、13 枚刻印总览）
  characters/<key>.json      ← 12 个角色数据（schema 见 Task 8）
templates/                   ← 见上文模板契约
src/build/build.mjs          ← 构建入口（Task 1 起：拷贝；Task 9 起：渲染）
public/                      ← 构建产物（部署单位），gitignore
tools/refactor/              ← 本次新增验证工具（inventory/diff/mobile_sweep/validate）
docs/refactor/               ← 盘点报告、每页 diff 报告、art 白名单、切换清单
```

角色 key 与刻印对照（12 页 + elysia）：kevin=救世 eden=黄金 aponia=戒律 villv=螺旋 kalpas=鏖灭 su=天慧 sakura=刹那 kosma=旭光 mobius=无限 griseo=繁星 hua=浮生 pardofelis=空梦 elysia=真我（首页，无独立页）。

---

# 里程碑 M0：管线与地基（线上不动，新产物只进 /v2/）

### Task 1: 空转构建（零依赖）

**Files:**
- Create: `package.json`、`src/build/build.mjs`、`content/site.json`（空对象 + 版本号）
- Modify: `.gitignore`（追加 `public/`、`node_modules/`）

**Interfaces:**
- `node src/build/build.mjs` —— **拷贝模式**：读 `.github/workflows/static.yml` 的 KEEP_FILES / KEEP_DIRS（白名单单一真源），拷贝到 `public/`，拷完逐文件哈希自校验源↔产物，全部一致退出 0 打印 `OK <N> files identical`，否则退出 1。
- `node src/build/build.mjs --verify-only` —— **只校验不拷贝**：比对现有 `public/` 与源，任何差异退出 1（**「改一个字节应报错」就在这个模式上测**）。
- 每次构建打印两栏清单：`rendered:`（本计划 Task 9 之前恒为空）与 `copied:`（逐文件），供人工核对。
- 白名单解析保护：解析后打印提取结果；数量断言（files ≥ 8、dirs ≥ 17，实际值以运行时打印为准）；解析失败或数量异常 → **退出 1**，绝不允许正则失配静默变成空名单。
- 可重现：目录遍历排序、不写时间戳、输出强制 LF 无 BOM。

- [ ] **Step 1: 失败先行** —— `node src/build/build.mjs` → 期望 `Cannot find module`。
- [ ] **Step 2: 建 package.json**（`npm init -y`；scripts.build 指向构建脚本；**本任务不装任何依赖**），补 .gitignore。
- [ ] **Step 3: 实现拷贝 + 自校验 + --verify-only + 白名单保护 + 清单打印。**
- [ ] **Step 4: 验证（四条）**：
  1. `npm run build` → `OK <N> files identical`；
  2. `node src/build/build.mjs --verify-only` → 退出 0；
  3. 改 `public/` 里一个字节 → `--verify-only` **退出 1**（牙齿测试，此模式不改 public 所以改动不会被覆盖 ← **修正原文的自相矛盾**）；
  4. 连跑两次 build，`find public -type f -exec md5sum {} + | sort` 两次输出**完全一致**（可重现）。
- [ ] **Step 5: 现网抽样参考**（不阻塞）：curl 生产 :80 的 5 个代表文件与 public 对应文件比哈希，差异须能解释（线上可能落后于 dev），结果记入 docs/refactor/task1-live-sample.md。
- [ ] **Step 6: Commit** —— `chore(build): 空转构建——拷贝/校验双模式、白名单单一真源与解析保护、可重现`。

### Task 2: /v2/ 预览路径（免开防火墙端口，备份与生产隔离）

**Files:** Modify: `deploy/deploy.sh`（新增 `--v2`：WEBROOT=`/var/www/elysiad-v2`，**备份目录 `/var/www/elysiad-v2.prev`，与生产的 elysiad.prev 完全独立**）、`deploy/nginx-ip.conf`（`location /v2/ { alias /var/www/elysiad-v2/; }`）

**Interfaces:** Consumes Task 1 的 `public/`；Produces `./deploy/deploy.sh --v2` 与 `http://1.14.60.153/v2/<page>`。

- [ ] **Step 1: 失败先行** —— curl `http://1.14.60.153/v2/kevin/` → 期望 404。
- [ ] **Step 2: 改 deploy.sh / nginx-ip.conf**；上传 conf，`nginx -t` 通过后 reload。
- [ ] **Step 3: 验证** —— 部署后对比 `/v2/kevin/` 与 `/kevin/` 的 HTML md5 必须相同（**只对比 HTML**，见验证矩阵：/v2/ 下资源走生产，不能用来验资源完整性）；再执行 `./deploy/deploy.sh --v2 rollback` 确认 v2 回滚**不影响** :80（生产页面哈希不变）。
- [ ] **Step 4: Commit** —— `feat(deploy): /v2/ 预览路径——独立备份目录，线上不动`。

### Task 3: check_explore.py 支持 --root 与 --port

**Files:** Modify: `tools/check_explore.py`

**Interfaces:** `python tools/check_explore.py <page> --root public --port 8511`；不带参数时行为完全不变。

- [ ] **Step 1: 失败先行** —— 带 `--root` 跑 → 期望 unrecognized argument。
- [ ] **Step 2: 实现**（root 传给自起 http 服务器的 directory，port 传给绑定端口）。
- [ ] **Step 3: 验证** —— 同页默认 vs `--root . --port 8511` 通过条数一致（29 全绿）；再 `--root public` 同样全绿。
- [ ] **Step 4: Commit** —— `test(tools): check_explore 支持 --root/--port`。

### Task 4: DOM 规范化 diff（THEME 用结构性替换，不用字符串正则）

**Files:** Create: `tools/refactor/diff_pages.py`、`tools/refactor/theme_extract.mjs`；夹具 `docs/refactor/fixtures/`

**Interfaces:**
- `python tools/refactor/diff_pages.py <old> <new> [--allow-theme-json] [--report <path>]`；退出码：无差异 0、有差异 1（打印 JSON 摘要 + 报告文件）。
- 规范化：stdlib `html.parser` 重建树 → 属性按名排序 → 文本空白折叠 → 序列化后 difflib；**`<script>` 与 `<style>` 的内部文本不做空白折叠**（否则误报），且这两个标签的内容按原文比对。
- THEME 豁免（**结构性而非正则**）：`theme_extract.mjs` 用 node 定位 `var THEME` 起点、**括号配对**找对象字面量结尾、求值后输出规范化 JSON。两侧规范化 JSON 深度相等 ⇒ 在 diff 前把两侧 THEME 片段**原地替换为同一个占位符**，再 diff；不相等 ⇒ 不替换，差异照报。

- [ ] **Step 1: 失败先行（三个夹具）** —— ①同文件 → 退出 0；②只差一个属性值 → 退出 1 且报告指到该元素；③**THEME 跨多行且字符串内含分号与花括号** → 不带旗标退出 1，带 `--allow-theme-json` 且值相等 → 退出 0；再把某坐标改 0.01 → **带旗标也必须退出 1**（豁免不许放过真差异）。
- [ ] **Step 2: 实现**（python stdlib + subprocess 调 node；不加第三方依赖）。
- [ ] **Step 3: 验证** —— 对仓库根与 public 里同一页跑（Task 1 之后应完全相同）→ 退出 0。
- [ ] **Step 4: Commit** —— `test(tools): DOM 规范化 diff + THEME 结构性豁免（含跨行/分号夹具）`。

### Task 5: 手机扫工具 mobile_sweep.py（三条纪律固化）

**Files:** Create: `tools/refactor/mobile_sweep.py`

**Interfaces:** `python tools/refactor/mobile_sweep.py --root public --port 8511 --pages kevin,aponia,… --out docs/refactor/mobile-report.json`
  - 每页 × [320,360,390]：子进程调 `tools/cdp.py`，URL 带 `?cb`、sleep 4200、探针含 title+h1 自检；量文档宽=视口宽、触控 ≥44px、无横向溢出；任一失败退出 1，报告含每档原始数值。

- [ ] **Step 1: 失败先行** —— 对仓库根跑 → 现网刚修完应全绿；对故意 300px 定宽元素的本地夹具跑 → 必须标红。
- [ ] **Step 2: 实现**（复用 check_page_health 的 Edge 启动方式或直接 subprocess cdp.py）。
- [ ] **Step 3: 验证** —— 12 页全绿，报告落盘。
- [ ] **Step 4: Commit** —— `test(tools): mobile_sweep 固化三条验收纪律`。

### Task 6: CI 预览流水线（含 diff 作为强制门禁）

**Files:** Create: `.github/workflows/preview.yml`

**Interfaces:** 推 dev ⇒ `npm ci` → `npm run build` → **`diff_pages.py` 全页 diff（白名单必须空，否则 job 失败）** → 清空服务器 elysiad-v2 内容（**保留 .prev-v2，不动生产目录**）→ 上传。现有 `deploy.yml`（main→:80）保持不动。

- [ ] **Step 1: 写 workflow**（node 22；SSH_KEY secret 复用；先清理后上传避免残留旧文件）。
- [ ] **Step 2: 验证** —— 推空提交到 dev，Actions 绿；/v2/ 内容更新（构建前后 HTML md5 不同）；人为引入一处 HTML 差异再推 → **job 必须红**（门禁有牙齿）。
- [ ] **Step 3: Commit** —— `ci(preview): 推 dev 构建部署到 /v2/，diff 白名单作强制门禁`。
---

# 里程碑 M1：数据抽取 + 模板化 + 逐页迁移

### Task 7: THEME 与 head 盘点（兼出 JSON 草稿与 art 白名单）

**Files:** Create: `tools/refactor/inventory_theme.py`；产出 `docs/refactor/theme-inventory.md`、`docs/refactor/art-allowlist.json`、`content/characters/<key>.json` 草稿（12 份）

**Interfaces:**
- 对每页抽 `var THEME = …;`（用 Task 4 的 `theme_extract.mjs` 同一套括号配对逻辑），求值后落成 JSON 草稿 —— **零手抄**；
- 盘点报告三部分：①THEME 顶层键、finds 数、与 kevin 基线的字段差异 ②**每页 head 标签清单**（link/meta/script/inline style，与基线逐条对比，页面特有标签单独列出）③内联 style/script 字节数；
- 显式产出 `art-allowlist.json`（art 取值全集）与 `verb-allowlist.json`（click/hold/triple_tap/drag/slide 中实际用到的子集）——合法性定义**落成文件**，不散落在报告 prose 里。

- [ ] **Step 1: 跑盘点** —— 报告须覆盖 12 页、每页 finds=12；head 差异逐条列出。
- [ ] **Step 2: ⏸ 人工核对（停下等主人确认，不得自行放行）** —— 重点：head 里哪些是页面特有标签必须进槽、哪些能公共化。
- [ ] **Step 3: Commit** —— `docs(refactor): THEME 与 head 盘点 + art/verb 白名单 + JSON 草稿`。

### Task 8: content schema 定稿 + 12 份数据 + 校验器（含双源交叉校验）

**Files:** Create/Modify: `content/site.json`、`content/characters/<key>.json` 定稿、`tools/refactor/validate_content.py`

**Interfaces:**
- character 字段：`key` `name` `shortName` `title` `signet` `signetImage` `birthday`（null 或 [月,日]）`description` `chibi`（null，动画槽）`explore{pageId,finds[12],unlock,whisper}` `game{module}` `endingStars`（原样）与盘点发现的其他键原样；
- `site.json`：`signets`（13 枚总览：key/名称/图片/是否可跳转）；
- `validate_content.py` 校验：12 文件、key 与目录名一致、finds 恰好 12 且 id 前缀=key、x/y∈[0,1]、verb 与 art 取自**白名单文件**、src 必填、生日格式；**外加交叉校验：content.birthday 必须与 `data/bdays.js` 求值结果一致**（防双源漂移，不等即退出 1）。

- [ ] **Step 1: 失败先行** —— 只跑草稿 → 期望报缺 name/signet/birthday 等字段（这就是待补清单）。
- [ ] **Step 2: 逐页补齐**（birthday 以 bdays.js 为准，name/title/description 从页面 meta 核对）。
- [ ] **Step 3: ⏸ 人工核对（停下等主人确认，不得自行放行）** —— 抽查 3 页：THEME 草稿与原页 node 求值深比对必须完全相等。
- [ ] **Step 4: 验证** —— validate 全绿；人为改坏一个坐标 → 退出 1；人为改错一个生日 → 交叉校验退出 1。
- [ ] **Step 5: Commit** —— `feat(content): 12 角色数据定稿 + 校验器（含 bdays 双源交叉校验）`。

### Task 9: 模板三件套 + 第一页（su）—— 按上文模板契约实现

**Files:** Create: `templates/base.njk`、`templates/partials/head-meta.njk`、`templates/partials/signet.njk`、`templates/pages/su.njk`、`su.page.css`、`su.page.js`；Modify: `src/build/build.mjs`（本轮首次安装 nunjucks）

**Interfaces:**
- base.njk 的块：`title`、`description`、`page_style`（内容由标记拼接，不含原文）、`body`、`page_scripts`（角色模块与页面 init 在此声明）；公共脚本序列见模板契约；
- build.mjs 增量机制：**`pages/<key>.njk` 存在 → 渲染；不存在 → 原样拷贝**（逐页迁移不停线）；新增 `--single <key>`；构建结束打印 `rendered:` / `copied:` 两栏清单；
- 本任务同时实现三个标记的拼接（`<!--@PAGE_STYLE@-->`、`<!--@THEME@-->`、`<!--@PAGE_INIT@-->`），私有 css/js 走外置纯文本文件，**Nunjucks 不解析任何私有代码原文**。

页面迁移 SOP（Task 9 跑通，Task 10 复用）：
1. 拆 `templates/pages/<key>.njk` + `<key>.page.css` + `<key>.page.js`（原文搬运）
2. `npm run build -- --single <key>`（核对打印清单里该页在 rendered 栏）
3. `python tools/refactor/diff_pages.py <key>/index.html public/<key>/index.html --allow-theme-json` → **白名单必须为空**
4. `python tools/check_explore.py <key>/index.html --root public` → 29 全绿
5. `python tools/refactor/mobile_sweep.py --root public --pages <key>` → 全绿
6. `./deploy/deploy.sh --v2` 后对比 /v2/<key>/ 与生产 HTML（只比 HTML）
7. diff 报告落盘 `docs/refactor/diff-<key>.md`；commit

- [ ] **Step 1: 按 SOP 迁移 su**（结构最标准）。
- [ ] **Step 2: SOP 六步全过**（diff 白名单空是硬门槛；过不了改模板，不许放宽白名单）。
- [ ] **Step 3: Commit** —— `refactor(su): 首个模板化页，diff 白名单空`。

### Task 10: 其余 11 页 + 404（逐页 SOP）

**Files:** Create: `templates/pages/<key>.njk` + `.page.css` + `.page.js` ×11、`templates/pages/404.njk`

顺率（改动多、风险高先做）：kevin → aponia → eden → villv → kalpas → mobius → sakura → kosma → griseo → hua → pardofelis → 404。

- [ ] **Step 1: 逐页执行 SOP**，每页一个 commit（`refactor/<key>: 页模板化，diff 白名单空`）。
- [ ] **Step 2: 模板缺口回填规则** —— 改 base.njk 后**必须重跑全部已完成页 diff**（公共模板一动，全量复验）。
- [ ] **Step 3: 收尾全量验证** —— 12 页 + 404 diff 报告齐全且白名单全空；三套件 + 手机扫**全量**再跑（不抽查）。

### Task 11: 切换准备（写清单与演练，不执行切换）

**Files:** Create: `docs/refactor/switchover-checklist.md`

- [ ] **Step 1: 清单六项** —— ①全量验证证据归档 ②`deploy.yml` 改为构建部署（build→public/→:80）③**旧源退役与构建模式切换**：删除仓库根 12 个旧 `<key>/index.html`、build.mjs 增加 `--strict-templates`（12 页缺模板即退出 1，杜绝静默走拷贝路径）④回滚演练（真跑一次 rollback 并验证）⑤**切换后 :80 跑 Service Worker 注册断言**（/v2/ 测不了，见验证矩阵）⑥切换后 24h 观察项。
- [ ] **Step 2: 干跑演练脚本**（不碰 :80）。
- [ ] **Step 3: Commit** —— `docs(switchover): 切换清单与回滚演练`。

## 非本计划（后续各自成计划）

- index/armor/guestbook 三页迁移（无复制粘贴债，且脚本序列完全不同）
- Fastify + SQLite + API 迁移（阶段 4 前置）
- 素材管线 sharp 多尺寸 + Q 版小人（阶段 2，等素材规格拍板）
- 丝滑专项（阶段 1.5，切换后）与擂台前端（阶段 4）

## 审阅意见处理记录（主人 2026-10-18 审阅 → 本版修订）

| # | 意见 | 处理 |
|---|---|---|
| 1 | 自校验逻辑自相矛盾 | 拆 `build`/`--verify-only` 两模式，「改一字节应报错」只在 verify-only 上测；另加「两次构建同哈希」可重现验证；现网抽样改为**不阻塞的参考步骤**并须解释差异 |
| 2 | /v2/ 复用生产 /assets/ ⇒ 资源完整性验证失效 | 新增**验证矩阵**章节：资源 404 只在本地 public/ 验；Task 2 Step 3 明确只比 HTML；Review Focus 第 3 条同步改写 |
| 3 | 角色模块在 base.njk 里声明方式模糊 | 模板契约定死：base 只硬编码公共五件套，角色模块走 `page_scripts` 槽（位于 bottom.js 与 bday.js 之间） |
| 4 | Nunjucks 转义策略未写 | 私有 css/js **外置为纯文本文件**，由 build 按标记拼接，**Nunjucks 完全不解析私有代码原文**（比 raw 包裹更彻底） |
| 5 | THEME 豁免用正则脆弱 | 改结构性方案：`theme_extract.mjs` 括号配对 + node 求值 + 规范化 JSON；相等才原地替换占位再 diff；夹具加跨行/分号/花括号用例；script/style 内部不做空白折叠 |
| 6 | 旧源清理与 build 模式切换未进清单 | Task 11 第 ③ 项：删旧文件 + `--strict-templates` 硬失败 |
| 7 | bdays.js 与 content.birthday 双源漂移 | Task 8 校验器加**交叉校验**，不等则退出 1 |
| 8 | 盘点缺 head 结构差异 | Task 7 报告第二部分改为「每页 head 标签清单 vs 基线」 |
| 9 | YAML 白名单正则脆弱 | Task 1 加解析后打印 + 数量断言 + 失败即退出 1（禁止静默空名单） |
| 10 | v2 回滚应与生产隔离 | Task 2：v2 备份目录 `elysiad-v2.prev` 独立，Step 3 验证 v2 回滚不影响 :80 |
| 11 | scp 不清理旧文件 | Task 6：上传前清空 elysiad-v2 内容（保留 .prev-v2） |
| 12 | 人工核对是停顿点 | Task 7 Step 2、Task 8 Step 3 明确「停下等主人确认，不得自行放行」 |
| 13 | diff 白名单无 CI 强制 | Task 6：preview.yml 里 diff 白名单空作为 job 门禁，并实测「人为差异 ⇒ job 红」 |
| 14 | 文本纪律过度替换风险 | Global Constraints 补：代码/路径/命令行的半角引号不受限 |
| 15 | art 合法集定义散落 | Task 7 显式产出 `art-allowlist.json` 与 `verb-allowlist.json`，validate 直接读 |
| 补 | 遗漏：切换后 SW 断言 | Task 11 第 ⑤ 项 |
| 补 | 遗漏：构建可重现性 | Global Constraints + Task 1 Step 4-4 |