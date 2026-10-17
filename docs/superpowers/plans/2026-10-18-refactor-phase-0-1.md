# 重构阶段 0+1 实施计划：消灭「12 页复制粘贴」

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 12 个角色页从「复制粘贴的手写 HTML」变成「content 数据 + Nunjucks 模板 → 构建出同构静态页」，让改一处全站生效；同时铺好构建/预览/验证管线，为 Q 版小人动画与丝滑专项预留挂钩。

**Architecture:** 纯前端构建管线（本地/CI 构建，服务器永不构建）。阶段 0 用「空转构建」证明管线：public/ 与现网逐字节一致；阶段 1 逐页模板化，每页以 DOM 规范化 diff + 全套断言 + 手机扫三重验证，diff 白名单清零才可提交。线上 :80 在切换前一动不动，新产物挂在 /v2/ 预览路径。

**Tech Stack:** Node 22（已装）、Nunjucks（模板）、无其他运行时新依赖；Fastify/SQLite **不在本计划**（见非目标）。

**Spec:** `docs/REFACTOR-PLAN.md`（2026-10-18 已入库的重构总方案，本计划实现其阶段 0+1）

## 与总方案的一处偏离（需要主人知情）

总方案的阶段 0 写的是「Fastify + SQLite + 目录结构」。本计划把 **Fastify/SQLite 移出阶段 0**，理由：现网 API（server.js + arena.js）是实测过的，现在重写它只有风险没有收益；API 迁移的天然位置是阶段 4（擂台前端）前夜。阶段 0 瘦身为「管线 + 地基」，集中火力清最大的债——12 页复制粘贴。

## Global Constraints（每个任务默认继承）

- **手机优先**：320/360/390 三档无横向溢出、触控目标 ≥44px（现网已达标，重构不可退化）。
- **同构红线**：阶段 1 是重构不是改版 —— 每页 diff 白名单必须为空才可提交；「看起来差不多」不算过。
- **现有断言全绿**：check_explore（每页 29 条）、check_page_health、aria、reduced-motion，一条不能掉。
- **验证三纪律**：URL 带 ?cb=<随机>；sleep ≥ 4200 等稳定；探针带 document.title + h1 自检。
- **服务器不构建**（GnuTLS 被掐的教训）：构建只发生在本地或 GitHub Actions。
- **防剧透**：replays.json 等擂台数据永不进静态目录（本计划不触碰，仅作约束记录）。
- **线上 :80 不动**：切换前一切新产物只进 /v2/ 预览路径。
- **每步可回滚**：沿用 deploy.sh 的 .prev 目录机制；每页迁移独立成 commit。
- **文本纪律**：程序与文档里的中文一律用「」，禁半角引号（run_code 多次白跑的根因）。
- **构建输出**：强制 LF、无 BOM（CSV 的 BOM 教训）；.gitignore 掉 public/ 与 node_modules/。

## Review Focus（spec 没写、但最可能咬人的五类输入，及兜底测试）

1. **Nunjucks 改写了 HTML**（autoescape 转义、空白修剪改变字节/结构）→ 兜底：Task 4 的 diff_pages.py 对同文件必须报 0 差异；每页迁移的 diff 白名单机制。
2. **THEME 从 JS 字面量变 JSON 后语义漂移**（丢字段、坐标精度、数字格式）→ 兜底：Task 8 的 validate_content.py 硬校验（finds=12、坐标 0~1、art 合法集）+ Task 9 起每页 check_explore 全绿（29 条断言直接依赖 THEME）。
3. **构建产物不完整**（漏拷 images/data/assets ⇒ 线上静默 404）→ 兜底：Task 1 空转构建的逐文件字节比对（数量+哈希双验）+ check_page_health 的 404 检查。
4. **/v2/ 预览路径下的路径语义**（页面用绝对 /assets/ 路径 ⇒ /v2/ 下正常；但 sw.js 的 scope=/ ⇒ /v2/ 下 SW 不注册）→ 兜底：验证步骤明记「/v2/ 预览不做 SW 断言」，SW 断言只在切换后的 :80 跑。
5. **公共脚本顺序被模板改乱**（site.js 必须先于 explore.js/bottom.js/角色模块）→ 兜底：base.njk 里顺序硬编码为单一序列 + check_explore 的模块加载断言。

## 新目录结构（阶段 0 建立）

```
content/
  site.json                  ← 全站数据（导航、13 枚刻印总览、公共文案）
  characters/<key>.json      ← 12 个角色数据（schema 见 Task 8）
templates/
  base.njk                   ← 公共骨架：doctype/head/meta/外链 css/signet 水印+徽章/公共 script 顺序
  partials/head-meta.njk     ← title/description/og（从 content 渲染）
  partials/signet.njk        ← 刻印水印+徽章；chibi 动画槽位（条件渲染，数据缺省则不输出）
  pages/<key>.njk            ← 页面私有：<style> 原文、各 section HTML 原文、THEME 注入点、init 脚本原文
src/build/build.mjs          ← 构建入口：读 content → 渲染 → 写 public/
public/                      ← 构建产物（部署单位），gitignore
tools/refactor/              ← 本次新增的验证工具（盘点/diff/校验/手机扫）
docs/refactor/               ← 盘点报告与每页 diff 报告的落盘处
```

角色 key 与刻印对照（12 页 + elysia）：kevin=救世 eden=黄金 aponia=戒律 villv=螺旋 kalpas=鏖灭 su=天慧 sakura=刹那 kosma=旭光 mobius=无限 griseo=繁星 hua=浮生 pardofelis=空梦 elysia=真我（首页，无独立页）。

## 动画素材挂钩（Q 版小人 · 形态未定，先留槽不实现）

主人确认：Q 版小人**要做动画**，但素材形态未定。本计划只做三件零成本的事：

1. **数据槽位**（Task 8 的 schema 已含）：
```
"chibi": null,
// 素材定稿后填：{ "still": "/images/chibi/kevin.png",
//   "animation": { "type": "spritesheet", "src": "...", "frames": 12, "fps": 8 } }
```
2. **渲染槽位**（Task 9 的 partials/signet.njk）：chibi 数据存在才输出对应节点，缺省则一个字节都不多 —— 12 页零改动即可等素材。
3. **格式决策矩阵**（素材定稿时主人拍板，现在不定）：

| 方案 | 体积 | 兼容 | 减动降级 | 适用 |
|---|---|---|---|---|
| **雪碧图 PNG + CSS steps()** | 小 | 全兼容 | 容易（停首帧） | 8~24 帧循环待机（**默认推荐**） |
| APNG | 中 | Safari 原生好 | 难（需换静态图） | 逐帧手绘、帧数少 |
| 动画 WebP | 最小 | ⚠ iOS Safari 历史坑须实测 | 难 | 帧多且体积敏感 |
| Lottie(bodymovin) | 矢量 | 需引入 ~50KB JS | 库自带 | AE 骨骼/复杂形变 |

> 无论哪种：prefers-reduced-motion 下必须退化为**静帧**（现有 reduced-motion 套件断言兜底，硬约束）。

## 丝滑专项（阶段 1.5 —— 切换之后才动手，故不在本计划任务里）

主人要求「网站更丝滑」。**刻意排在阶段 1 之后**：阶段 1 的验收是「同构、diff 为零」，丝滑改动会污染 diff。丝滑作为独立小阶段上线，同样带验收：

| 手段 | 说明 | 验收 |
|---|---|---|
| motion tokens | site.css 一处定义 --motion-fast/slow、--ease-soft | 全站动画时长只改一处可调 |
| View Transitions（MPA 跨文档） | 一条 CSS 规则 + 关键元素命名；Chrome 126+/Safari 18+，其余无感降级 | 录屏对比 + 减动偏好下无过渡 |
| Speculation Rules | 站内链接 prefetch/prerender（Chrome 渐进增强） | 手机端二次访问 LCP 下降实测 |
| content-visibility:auto | 长段落 + contain-intrinsic-size | 滚动长任务 <50ms |
| 预算 | INP<200ms、CLS<0.02、LCP<1.5s(4G) | perf8 复测，现网已达指标（卡顿帧 2）不可退化 |

---

# 里程碑 M0：管线与地基（线上不动，全部挂在 /v2/）

### Task 1: 空转构建（含仓库脚手架）

**Files:**
- Create: package.json、src/build/build.mjs、content/site.json（先放空对象与版本号）
- Modify: .gitignore（追加 public/ 与 node_modules/）

**Interfaces:**
- Produces: node src/build/build.mjs —— 读 .github/workflows/static.yml 里的 KEEP_FILES/KEEP_DIRS（**白名单单一真源，不写第二份**），把仓库现有文件原样拷进 public/，拷完逐文件哈希自校验：全部一致退出码 0 并打印 OK <N> files identical；任何不一致退出码 1。
- 后续任务依赖：public/ 目录结构与现网完全一致（<key>/index.html 在根下）。

- [ ] **Step 1: 失败先行** —— node src/build/build.mjs → 期望 Cannot find module（文件还不存在）。
- [ ] **Step 2: 建 package.json**（npm init -y；scripts 加 build 指向构建脚本；devDependencies 只加 nunjucks），npm install。
- [ ] **Step 3: 实现拷贝管线** —— 白名单用正则从 static.yml 提取 KEEP_FILES 与 KEEP_DIRS；输出强制 LF、无 BOM。
- [ ] **Step 4: 验证** —— npm run build → 期望 OK <N> files identical（N 与线上 131 同量级）；人为改动 public 里一个字节再跑 → 退出码 1（证明自校验有牙齿）。
- [ ] **Step 5: Commit** —— git add package.json package-lock.json .gitignore src/build content/site.json && git commit -m chore/build-空转构建管线-白名单单一真源加逐文件哈希自校验

### Task 2: /v2/ 预览路径（避开 8443 防火墙问题）

**Files:**
- Modify: deploy/deploy.sh（支持 --v2：WEBROOT 换成 /var/www/elysiad-v2，备份与回滚逻辑复用）、deploy/nginx-ip.conf（加 location /v2/ 别名到该目录）

**Interfaces:**
- Consumes: Task 1 的 public/。
- Produces: ./deploy/deploy.sh --v2 把 public/ 发到 elysiad-v2；http://1.14.60.153/v2/<page> 可访问（页面内是绝对路径 /assets/…，在 /v2/ 下语义不变）。安全组已开的只有 22/80/443，走 80 端口的路径前缀**不需要动防火墙**。

- [ ] **Step 1: 失败先行** —— 服务器上 curl -s http://1.14.60.153/v2/kevin/ → 期望 404。
- [ ] **Step 2: 改 deploy.sh 与 nginx-ip.conf**，上传 conf、nginx -t 通过后 reload。
- [ ] **Step 3: 验证** —— 跑 ./deploy/deploy.sh --v2，然后 curl 取 /v2/kevin/ 与 /kevin/ 各自 md5 → **两哈希必须相同**。
- [ ] **Step 4: Commit** —— feat/deploy-v2-预览路径-新架构旁路验证线上不动。

### Task 3: check_explore.py 支持 --root 与 --port

**Files:** Modify: tools/check_explore.py（参数解析与自起服务器的 directory 参数）

**Interfaces:**
- Produces: python tools/check_explore.py <page> --root public --port 8511 —— 断言套件打在构建产物上；默认行为（不带参数）完全不变。

- [ ] **Step 1: 失败先行** —— python tools/check_explore.py su/index.html --root public → 期望 unrecognized argument。
- [ ] **Step 2: 实现两个参数**（root 传给自起 http 服务器的 directory；port 传给绑定端口）。
- [ ] **Step 3: 验证** —— 同一页跑两次（默认 vs --root . --port 8511）→ 通过条数一致（29 条全绿）；再跑 --root public → 同样全绿。
- [ ] **Step 4: Commit** —— test/tools-check_explore-支持-root-port-为构建产物验证铺路。
### Task 4: DOM 规范化 diff 工具 diff_pages.py

**Files:** Create: tools/refactor/diff_pages.py；Test 夹具: docs/refactor/fixtures/（两份人为构造的 HTML）

**Interfaces:**
- Produces: python tools/refactor/diff_pages.py <old.html> <new.html> [--allow-theme-json] [--report <path>]
  - 规范化：stdlib html.parser 重建树 → 属性按名排序、文本空白折叠 → 序列化成行 → difflib 对比；
  - 退出码：无差异 0；有差异 1 并打印 JSON 摘要（差异行数 + 首个差异的元素路径）+ 完整报告写到 --report；
  - --allow-theme-json：把两侧 var THEME = …; 的片段取出来，经 node 子进程求值成对象做深度比对，**语义相等则在 diff 中豁免**（JS 字面量转 JSON 必然变字节，但值不许变）。

- [ ] **Step 1: 失败先行** —— 对两份只差一个属性值的夹具跑 diff → 期望退出码 1 且报告指到那个元素；对同一份文件跑 → 期望退出码 0。
- [ ] **Step 2: 实现**（纯 stdlib + subprocess 调 node；不引第三方依赖）。
- [ ] **Step 3: THEME 豁免测试** —— 夹具 B 把 THEME 改写成 JSON 风格但值不变 → 不带旗标退出码 1、带 --allow-theme-json 退出码 0；再改一个坐标值 → 带旗标也必须退出码 1（豁免不许放过真差异）。
- [ ] **Step 4: Commit** —— test/tools-diff_pages-DOM规范化diff与THEME语义豁免。

### Task 5: 手机扫工具 mobile_sweep.py（把三条纪律固化成脚本）

**Files:** Create: tools/refactor/mobile_sweep.py

**Interfaces:**
- Produces: python tools/refactor/mobile_sweep.py --root public --port 8511 --pages kevin,aponia,… --out docs/refactor/mobile-report.json
  - 每页 × [320, 360, 390]：子进程调 tools/cdp.py，URL 带 ?cb、sleep 4200、探针含 title+h1 自检；量文档宽=视口宽、触控目标≥44px、无横向溢出；
  - 任一页失败 → 退出码 1；报告 JSON 含每页每档的原始数值。

- [ ] **Step 1: 失败先行** —— 对当前仓库跑 --root . → 期望全绿（现网刚修完）；再对一个故意写死 300px 宽元素的本地夹具页跑 → 期望它被标红。
- [ ] **Step 2: 实现**（复用 check_page_health 的 Edge 启动方式或直接 subprocess cdp.py）。
- [ ] **Step 3: 验证** —— 12 页全绿，报告落盘。
- [ ] **Step 4: Commit** —— test/tools-mobile_sweep-三条验收纪律固化。

### Task 6: CI 预览流水线 preview.yml

**Files:** Create: .github/workflows/preview.yml

**Interfaces:**
- Consumes: Task 1 的 build、Task 2 的 /v2/、仓库已有的 SSH_KEY secret。
- Produces: 推 dev 即 npm ci + npm run build + scp public/ 到服务器 elysiad-v2（**现有 deploy.yml 即 main→:80 的生产线保持不动，直到切换任务**）。

- [ ] **Step 1: 写 workflow**（node 22 + npm ci + build + scp，secret 复用 SSH_KEY）。
- [ ] **Step 2: 验证** —— 推一个空提交到 dev，Actions 绿；服务器上 /v2/ 内容更新（构建前后各取一次 md5 对比，应不同）。
- [ ] **Step 3: Commit** —— ci/preview-推dev即构建部署到v2预览。

---

# 里程碑 M1：数据抽取 + 模板化 + 逐页迁移

### Task 7: THEME 盘点（兼出 JSON 草稿）

**Files:** Create: tools/refactor/inventory_theme.py；产出: docs/refactor/theme-inventory.md 与 content/characters/<key>.json 草稿（12 份）

**Interfaces:**
- Produces: 脚本对每页抽出 var THEME = …; 用 node 求值后原样落成 JSON 草稿（**零手抄，杜绝转录错误**）；盘点报告记录：每页顶层键、finds 数、与 kevin 基线的字段差异、内联 style/script 字节数。

- [ ] **Step 1: 跑盘点** —— 期望报告覆盖 12 页、每页 finds=12；任何页面键结构与基线不同都会在报告里单独列出（这些就是 schema 要兼容的点）。
- [ ] **Step 2: 人工核对报告**（我核对，重点：是否有页面在 THEME 之外还有页面级配置）。
- [ ] **Step 3: Commit** —— docs/refactor-theme盘点与JSON草稿。

### Task 8: content schema 定稿 + 12 份数据 + 校验器

**Files:** Create: content/site.json、content/characters/<key>.json 定稿（在草稿上补齐非 THEME 字段）、tools/refactor/validate_content.py

**Interfaces:**
- Produces（schema，字段名即代码里用的名字）:
  - character: key、name、shortName、title、signet、signetImage、birthday（null 或 [月,日]，与 data/bdays.js 同构）、description、chibi（null，动画槽）、explore{pageId, finds[12], unlock, whisper}、game{module}、endingStars（原样）、盘点发现的其他键原样保留；
  - site.json: signets（13 枚总览数组，含 key/名称/图片路径/是否可跳转）；
  - validate_content.py：校验 12 文件、key 与目录名一致、finds 恰好 12 且 id 前缀等于页面 key、x 与 y 在 0~1、verb 与 art 属于盘点报告里的合法集、src 必填、生日格式合法；任何一条不满足退出码 1 并指出文件与字段。

- [ ] **Step 1: 失败先行** —— validate 跑只有草稿的 content/ → 期望报缺 name/signet 等新字段（这正是要补的清单）。
- [ ] **Step 2: 逐页补齐**（name/signet/birthday/description 从各页 meta 与 HTML 逐一核对，birthday 以 data/bdays.js 为准）。
- [ ] **Step 3: 验证** —— validate 全绿；抽 3 页把 THEME 草稿值与原页求值结果用 node 深比对（应完全相等）。
- [ ] **Step 4: Commit** —— feat/content-12角色数据定稿与校验器。

### Task 9: 模板三件套 + 第一页（su）

**Files:** Create: templates/base.njk、templates/partials/head-meta.njk、templates/partials/signet.njk、templates/pages/su.njk；Modify: src/build/build.mjs

**Interfaces:**
- base.njk 块契约（页面模板只填这几个块）：title、description、page_style（页面 <style> 原文）、body（原 body 内部原文，仅 var THEME = …; 一处替换为 var THEME = {{ theme_json }};）、page_scripts（页面私有脚本原文，若无则空）；
- 公共骨架硬编码：viewport、site.css/explore.css 外链、signet 水印+徽章 style 块（值取 character.signet 与 signetImage）、公共脚本序列 site.js→explore.js→bottom.js→角色模块→bday.js→bdays.js；
- build.mjs 增量机制：**pages/<key>.njk 存在 → 渲染；不存在 → 原样拷贝原文件**（这是逐页迁移不停线的核心）；新增 --single <key> 只构建一页；
- ⚠ Nunjucks 注意：autoescape 保持默认 false（与 Jinja 相反）；不开 trim/lstrip_blocks；theme_json 经 |safe 注入 —— 这些都为了让输出字节尽量贴原文，diff 工具兜底。

页面迁移 SOP（Task 9 首次跑通，Task 10 复用）：
1. 写 templates/pages/<key>.njk（原文搬运 + THEME 替换点）
2. npm run build -- --single <key>
3. python tools/refactor/diff_pages.py <key>/index.html public/<key>/index.html --allow-theme-json → **白名单必须为空**
4. python tools/check_explore.py <key>/index.html --root public → 29 条全绿
5. python tools/refactor/mobile_sweep.py --pages <key> → 全绿
6. ./deploy/deploy.sh --v2 && curl 对比 /v2/<key>/ 与预期
7. diff 报告落盘 docs/refactor/diff-<key>.md；commit

- [ ] **Step 1: 按 SOP 迁移 su**（选它先行：结构最标准、近期最熟）。
- [ ] **Step 2: SOP 全部六步通过**（diff 白名单空是硬门槛，过不了就回改模板而不是放宽白名单）。
- [ ] **Step 3: Commit** —— refactor/su-首个模板化页-diff白名单空。

### Task 10: 其余 11 页 + 404（按 SOP 逐页）

**Files:** Create: templates/pages/<key>.njk ×11、templates/404.njk（或 pages/404.njk，404 只共用 head）

**Interfaces:** Consumes: Task 9 的 SOP 与模板块契约（不新发明）。

顺序（改动多、风险高的先做，早暴露模板缺口）：kevin → aponia → eden → villv → kalpas → mobius → sakura → kosma → griseo → hua → pardofelis → 404。

- [ ] **Step 1: 逐页执行 SOP**，每页一个 commit（格式：refactor/<key>-页模板化-diff白名单空）。
- [ ] **Step 2: 模板缺口回填规则** —— 迁移中发现共性差异 ⇒ 改 base.njk 后**必须重跑全部已完成页的 diff**（公共模板一动，全量复验，无一豁免）。
- [ ] **Step 3: 收尾验证** —— 12 页 + 404 的 diff 报告齐全且白名单全空；三套件 + 手机扫全量再跑一遍（不是抽查）。

### Task 11: 切换准备（写清单，不执行切换）

**Files:** Create: docs/refactor/switchover-checklist.md

- [ ] **Step 1: 写清单**：①全量验证证据归档 ②deploy.yml 改为构建部署（build→public→:80）的改法 ③回滚演练步骤（真跑一次 deploy.sh rollback 并验证）④切换后 24h 观察项（健康检查、404 日志、mobile_sweep 复跑）。
- [ ] **Step 2: 干跑演练脚本**（不碰 :80）。
- [ ] **Step 3: Commit** —— docs/switchover-切换清单与回滚演练。

## 非本计划（后续各自成计划）

- index/armor/guestbook 三页迁移（无复制粘贴债，价值低优先级低）
- Fastify + SQLite + API 迁移（阶段 4 前置，理由见开头偏离说明）
- 素材管线 sharp 多尺寸（阶段 2，等 Q 版小人规格拍板）
- 丝滑专项（阶段 1.5，切换后）与擂台前端（阶段 4）