# elysiad.top 十项更新 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 elysiad.top 的 8 个静态页面上落地九项功能（献花 / 今日之语 / 隐藏彩蛋 / favicon / 分享卡片 / 404 / 图片压缩 / 明信片生成 / giscus 留言簿），同时收窄部署范围、消除 CSS 与 JS 的 8 份重复。第十项「献花后端」由需求方自行部署（见 `worker/README.md`），不在本计划的实施范围内。

**Architecture:** 保持零构建的纯静态站。新增 `assets/` 共享层与 `data/quotes.js` 语料池；新功能一律写成独立小模块，仅首页引用，因此**不依赖 P1 先完成**。`.github/workflows/static.yml` 由 `path: '.'` 改为白名单打包，`docs/ tools/ images/raw/ worker/` 永不进入产物。不引入打包器、不引入 Web 字体。

**Tech Stack:** HTML5 + 原生 CSS/JS（无框架、无构建）｜Pillow 11.3（图片转 WebP）｜`tools/cdp.py`（无头 Edge + CDP，视觉验收与 og.png 出图）｜Cloudflare Worker + KV（仅后端，需求方部署）

## Global Constraints

以下约束适用于**每一个**任务，不再逐条重复。

- **分支**：所有改动提交到 `dev`。`static.yml` 只在 push `main` 时触发部署，因此 `dev` 上作业不会影响线上 `elysiad.top`。
- **零构建**：不引入 webpack / vite / rollup 或任何打包步骤。站点侧不引入 npm 依赖（`worker/` 除外，它自带 `package.json`）。
- **零外部依赖**：站点侧除 giscus 一个第三方脚本外，不得新增任何外链资源。不引入 Web 字体，沿用现有系统字体栈。
- **数据纪律**：不得编造任何台词、设定、日期、人名。新台词必须有出处并在代码注释里标注来源。语料池只收录已确认的原文。
- **验证纪律**：任何视觉改动必须用 `tools/cdp.py` 截图核对，桌面 `1280×900` 与移动 `375×812` 各一轮。不接受"看起来差不多"。改动前后应逐页对比。
- **本地服务器**：`cd <repo 根> && python -m http.server 8500`。所有截图与手测都走它。Windows 下跑 Python 需带 `PYTHONIOENCODING=utf-8`，否则中文输出会因 GBK 编码报错。
- **无障碍**：所有新交互必须键盘可达——`role="button"` + `tabindex="0"` + 处理 Enter/Space——并在 `prefers-reduced-motion: reduce` 下降级。
- **路径纪律**：`404.html` 内所有链接与资源路径**必须**绝对路径（`/index.html`、`/images/…`）。
- **og:image 必须是 PNG**，不可 WebP（微信预览不支持 WebP）。
- **文案语言**：中文，语气遵循站点既有风格。

---

## 文件结构

### 新建

| 文件 | 职责 |
|---|---|
| `assets/site.css` | 8 页共享的样式基础（玻璃卡 / 区块标题 / 时间轴 / 语录卡 / 减动保护）。P1 产出 |
| `assets/site.js` | 8 页共享的行为（canvas 粒子 / 打字机 / 滚动观察 / 语录逻辑）。P1 产出 |
| `data/quotes.js` | 台词语料池，首页「今日之语」与明信片共用 |
| `assets/daily.js` | 首页「今日之语」按本地日期取句 |
| `assets/flowers.js` | 首页献花：调后端、渲染计数、失败降级 |
| `assets/egg.js` | 首页隐藏彩蛋：点标题 5 次 → 水晶花雨 |
| `assets/postcard.js` | 语录明信片 Canvas 生成与下载 |
| `favicon.svg` | 内联水晶花图标 |
| `404.html` | 引路版 404 |
| `robots.txt` / `sitemap.xml` | 爬虫基础件 |
| `images/*.webp` | 由现有 PNG 转换 |
| `images/og.png` | 1200×630 分享卡片，必须 PNG |
| `tools/to_webp.py` | Pillow 批量转 WebP |
| `tools/og-card.html` | og.png 的渲染模板（用 `cdp.py` 出图，不入产物） |
| `guestbook/index.html` | giscus 留言簿独立页 |

### 修改

| 文件 | 改动 |
|---|---|
| `.github/workflows/static.yml` | `path: '.'` → 白名单打包 `_site/`，并加产物自检 |
| `.gitignore` | 补 `images/raw/`、`_site/` 等 |
| `.gitattributes` | 新建，统一 `eol=lf` |
| `index.html` | 加 `assets/*` 引用、今日之语区块、献花区块、head 元数据 |
| `armor.html` | 图片路径改 `.webp`、补 `width`/`height`、head 元数据 |
| 6 个角色页 | head 元数据（favicon / OG） |
| `data/timeline-data.js` | 8 条记录补 `img_w`/`img_h`；`img` 改 `.webp` |
| `tools/cdp.py` | 新增 `size` 动作（改视口，供移动端验收与 og 出图） |

---

## Phase P0 · 部署收口

> 排在最前，因为改动最小、最紧急——`tools/cdp.py`（内含本机绝对路径）目前公网可直接下载。

### Task 1: `static.yml` 改白名单打包

**Files:**
- Modify: `.github/workflows/static.yml:36-43`

**Interfaces:**
- Consumes: 无
- Produces: 部署产物固定为 `_site/` 目录；后续任何任务新增站点文件后，需把新路径加进本任务的 `KEEP_FILES` / `KEEP_DIRS`

- [ ] **Step 1: 读现有 workflow，确认要改的位置**

```bash
cd <repo 根> && sed -n '30,43p' .github/workflows/static.yml
```

现有内容为：

```yaml
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          # Upload entire repository
          path: '.'
```

- [ ] **Step 2: 用白名单打包替换 Upload 步骤**

把上面那段替换成下面两段（`Assemble` 在前，`Upload` 在后）：

```yaml
      - name: Assemble site (whitelist)
        run: |
          set -euo pipefail
          rm -rf _site && mkdir -p _site

          # 站点内容：存在才拷（后续阶段会陆续新增文件，此处不必每次改）
          KEEP_FILES="index.html armor.html 404.html robots.txt sitemap.xml favicon.svg CNAME"
          for f in $KEEP_FILES; do
            [ -e "$f" ] && cp "$f" _site/
          done

          KEEP_DIRS="assets data images aponia eden kalpas kevin su villv guestbook"
          for d in $KEEP_DIRS; do
            [ -e "$d" ] && cp -r "$d" _site/
          done

          # 原始素材不进产物
          rm -rf _site/images/raw

          # 白名单自检：以下路径一旦出现在产物里就让构建失败
          fail=0
          for p in tools docs .github worker screenshots .superpowers "images/raw" node_modules; do
            if [ -e "_site/$p" ]; then
              echo "::error::不该被部署的路径进了产物: $p"
              fail=1
            fi
          done
          [ "$fail" -eq 0 ] || exit 1

          echo "=== 产物清单 ==="
          find _site -type f | sort

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '_site'
```

- [ ] **Step 3: 本地模拟一遍，确认产物正确**

```bash
cd <repo 根>
bash -c '
set -euo pipefail
rm -rf /tmp/_site_test && mkdir -p /tmp/_site_test
KEEP_FILES="index.html armor.html 404.html robots.txt sitemap.xml favicon.svg CNAME"
for f in $KEEP_FILES; do [ -e "$f" ] && cp "$f" /tmp/_site_test/; done
KEEP_DIRS="assets data images aponia eden kalpas kevin su villv guestbook"
for d in $KEEP_DIRS; do [ -e "$d" ] && cp -r "$d" /tmp/_site_test/; done
rm -rf /tmp/_site_test/images/raw
for p in tools docs .github worker screenshots .superpowers "images/raw" node_modules; do
  [ -e "/tmp/_site_test/$p" ] && echo "❌ 泄漏: $p" || true
done
echo "--- 产物文件数: $(find /tmp/_site_test -type f | wc -l) ---"
find /tmp/_site_test -maxdepth 1 | sort
'
```

期望：无 `❌ 泄漏` 输出；产物含 `CNAME`、`index.html`、`images/`（不含 `raw`）、6 个角色目录；**不含** `tools`、`docs`、`.github`、`worker`。

- [ ] **Step 4: 提交**

```bash
git add .github/workflows/static.yml
git commit -m "部署改为白名单打包，tools/docs/images-raw 不再上线"
```

- [ ] **Step 5: 合并到 main 后验证线上**

`dev` 上不触发部署，因此这一步**只有在你决定把 P0 单独合进 `main` 时执行**：

```bash
for p in tools/README.md tools/cdp.py docs/superpowers/specs/2026-09-15-elysiad-update-design.md images/raw; do
  echo -n "$(curl -s -o /dev/null -w '%{http_code}' https://elysiad.top/$p)  /$p"; echo
done
echo -n "$(curl -s -o /dev/null -w '%{http_code}' https://elysiad.top/)  /"; echo
```

期望：前三项 `404`，最后一项 `200`。

---

### Task 2: `.gitignore` 与 `.gitattributes`

**Files:**
- Modify: `.gitignore`
- Create: `.gitattributes`

**Interfaces:**
- Consumes: 无
- Produces: 后续任务的临时产物目录（`_site/`、`screenshots/`）自动被忽略

- [ ] **Step 1: 补 `.gitignore`**

现有内容：

```gitignore
*.pyc
__pycache__/
screenshots/
/tmp/

# brainstorming 视觉草图会话目录，不进仓库、不部署
.superpowers/
```

在末尾追加：

```gitignore

# 部署产物（由 CI 在 runner 上生成，不进仓库）
_site/

# 图片原始素材：留在仓库备份，但不部署（见 static.yml 白名单）
images/raw/

# 音频素材（语录配音待接入时使用）
audio/

# Python 虚拟环境
.venv/

# og.png 的渲染中间产物
tools/og-render-*.png
```

> **注意**：`images/raw/` 目前是**已被 git 追踪**的目录，`.gitignore` 对已追踪文件不生效——
> 加这一行**不会**把它从仓库里移出去（这正是我们想要的：保留备份）。
> 它的实际作用是**冻结**：以后往 `images/raw/` 里新增素材不会自动进仓库，需要 `git add -f` 显式添加。
> 如果最终决定把整个目录移出仓库，那要另外执行 `git rm -r --cached images/raw`（本计划不含此步）。

- [ ] **Step 2: 新建 `.gitattributes`**

```
# 统一换行符为 LF。
# 本机系统级 core.autocrlf=true（Git for Windows 默认），不统一的话
# 工作区是 CRLF、仓库是 LF，大范围重构时 diff 会被换行噪音淹没。
* text=auto eol=lf

# 二进制文件不做换行转换
*.png  binary
*.jpg  binary
*.webp binary
*.ico  binary
*.mp3  binary
```

- [ ] **Step 3: 验证换行归一化生效**

```bash
cd <repo 根>
git add .gitattributes .gitignore
git diff --cached --stat
git check-attr text eol -- index.html images/armor-ego.png
```

期望：`index.html` 显示 `text: auto` / `eol: lf`；`images/armor-ego.png` 不被当文本处理。

- [ ] **Step 4: 确认没有引发全仓库换行重写**

```bash
git status --short | wc -l
```

期望：只有 `.gitattributes` 与 `.gitignore` 两项。**如果出现大量文件被标记为修改，说明 `.gitattributes` 触发了换行重写——立即 `git reset` 并改用 `* text=auto eol=lf` 之外更保守的写法，或先只对新增文件生效。**

- [ ] **Step 5: 提交**

```bash
git add .gitattributes .gitignore
git commit -m "补 .gitignore 忽略项，新增 .gitattributes 统一 LF 换行"
```

---

### Task 3: `tools/cdp.py` 新增 `size` 动作

**Files:**
- Modify: `tools/cdp.py`（在动作分发循环内新增一个分支）

**Interfaces:**
- Consumes: 无
- Produces: cdp.py 支持新动作 `size <宽>x<高>`，供 Task 8 的 og 出图、Task 10 / Task 13 的移动端验收使用

**为什么需要**：`cdp.py:13` 的 `--window-size=1280,900` 是写死的，而本计划有三处需要其它尺寸——移动端验收 `375x812`、og.png 出图 `1200x630`、明信片出图。用 CDP 的 `Emulation.setDeviceMetricsOverride` 可以在运行时改视口，不必重启浏览器。

- [ ] **Step 1: 确认工具当前可用（回归基线）**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html eval "document.title" 2>&1
kill %1 2>/dev/null
```

期望输出：`elysiad.top — 致爱莉希雅`

- [ ] **Step 2: 新增 `size` 动作分支**

在 `tools/cdp.py` 的动作分发循环里，找到 `elif act == 'shot':` 之前的位置，插入：

```python
            elif act == 'size':
                # 呀！给页面换一件合身的衣服——移动端验收和 og 出图都要靠它呢♥
                w, h = actions[i + 1].lower().split('x')
                send('Emulation.setDeviceMetricsOverride', {
                    'width': int(w), 'height': int(h),
                    'deviceScaleFactor': 1, 'mobile': int(w) < 768,
                })
                print(f'size -> {w}x{h}')
                i += 2
```

- [ ] **Step 3: 验证桌面尺寸**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  size 1280x900 sleep 800 eval "window.innerWidth + 'x' + window.innerHeight" \
  eval "(()=>{document.getElementById('journey').scrollIntoView();return '已滚到时间轴'})()" \
  sleep 700 shot screenshots/size-1280.png 2>&1
kill %1 2>/dev/null
```

期望：`size -> 1280x900`，随后输出 `1280x900`，再输出 `已滚到时间轴`。

> **为什么必须 `scrollIntoView`**：`.timeline-line` 在 `#journey` 区块里，位于首屏之下。直接截图只会拍到开场区，**图里根本没有时间轴**，就没法做 Step 5 的目视核对。这一条是实测踩出来的。

- [ ] **Step 4: 验证移动尺寸，且确认响应式真的生效**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  size 375x812 sleep 800 eval "window.innerWidth + 'x' + window.innerHeight" \
  eval "getComputedStyle(document.querySelector('.timeline-line')).left" \
  eval "(()=>{document.getElementById('journey').scrollIntoView();return '已滚到时间轴'})()" \
  sleep 700 shot screenshots/size-375.png 2>&1
kill %1 2>/dev/null
```

期望：`size -> 375x812`、输出 `375x812`；`.timeline-line` 的 `left` 为 **`24px`**（移动端媒体查询里的 `1.5rem`，见 `index.html:240`）。

> **⚠ 关于桌面端的期望值，这里有个实测校正**：计划初稿写「桌面端是 `50%`」，**这是错的**。`.timeline{max-width:800px}` + `.timeline-line{left:50%}`，浏览器对绝对定位元素返回的是**折算后的使用值**，即 `50% × 800px = 400px`。
>
> 所以正确的对照是：**桌面 `400px`（居中） vs 移动 `24px`（贴左）**。这个差异才是媒体查询真的按新视口生效的证据——光看 `window.innerWidth` 变了不算数，那只证明视口改了，不证明 media query 跟上了。

- [ ] **Step 5: 目视核对两张截图**

用 Read 工具打开 `screenshots/size-1280.png` 与 `screenshots/size-375.png`，确认：桌面版时间轴居中双栏（卡片左右交替），移动版时间轴靠左单栏（卡片全部同侧）。若两者长得一样，说明 `mobile` 参数或视口未生效，需回查 Step 2。

实测参考值（来自本计划的首次执行）：桌面端 `.timeline-line` 的 `left` = `400px`、`getBoundingClientRect().left` ≈ `636`；移动端 `left` = `24px`、`rect.left` ≈ `39`。

- [ ] **Step 6: 提交**

```bash
git add tools/cdp.py
git commit -m "cdp.py 新增 size 动作，支持运行时切换视口"
```

---

## Phase P2 · 基础件

### Task 4: favicon.svg 与 8 页接入

**Files:**
- Create: `favicon.svg`
- Modify: `index.html`、`armor.html`、`aponia/index.html`、`eden/index.html`、`kalpas/index.html`、`kevin/index.html`、`su/index.html`、`villv/index.html`（各在 `<head>` 内加一行）

**Interfaces:**
- Consumes: 无
- Produces: 站点图标；后续 Task 8 的分享卡片标签会在同一个 `<head>` 位置追加

- [ ] **Step 1: 写 `favicon.svg`**

一枚四瓣水晶花，配色取自站点既有变量（粉 `#ff8fa3`、紫 `#c77dff`、金 `#ffd166`）：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <radialGradient id="petal" cx="50%" cy="45%" r="62%">
      <stop offset="0%" stop-color="#ffc8dd"/>
      <stop offset="55%" stop-color="#ff8fa3"/>
      <stop offset="100%" stop-color="#c77dff"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#0a0612"/>
  <g fill="url(#petal)" opacity="0.95">
    <ellipse cx="32" cy="17" rx="7" ry="13"/>
    <ellipse cx="32" cy="47" rx="7" ry="13"/>
    <ellipse cx="17" cy="32" rx="13" ry="7"/>
    <ellipse cx="47" cy="32" rx="13" ry="7"/>
  </g>
  <circle cx="32" cy="32" r="6" fill="#ffd166"/>
</svg>
```

- [ ] **Step 2: 8 个页面接入**

每个 HTML 的 `<head>` 里，在 `<meta charset="UTF-8">` **之后**插入：

```html
<!-- 呀！标签页上也要有一枚小花呀，不然浏览器给的是个空白方块呢♥ -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
```

注意用**绝对路径** `/favicon.svg`，6 个角色页在子目录下，相对路径会指错。

批量确认已插入：

```bash
cd <repo 根>
grep -c 'rel="icon"' index.html armor.html */index.html
```

期望：8 个文件各输出 `1`。

- [ ] **Step 3: 用无头浏览器确认图标真的被请求到**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/kevin/ \
  sleep 1200 \
  eval "performance.getEntriesByType('resource').filter(r=>r.name.includes('favicon')).map(r=>r.name + ' | ' + r.responseStatus).join(', ') || '未请求到'" 2>&1
kill %1 2>/dev/null
```

期望：输出里含 `favicon.svg | 200`。**若为空**，说明浏览器没去请求（有些浏览器只在非无头模式下取 favicon）——此时改为直接验证文件可达：

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:8500/favicon.svg
```

期望：`200 image/svg+xml`

- [ ] **Step 4: 提交**

```bash
git add favicon.svg index.html armor.html */index.html
git commit -m "新增水晶花 favicon 并接入 8 个页面"
```

---

### Task 5: 404.html（引路版）

**Files:**
- Create: `404.html`

**Interfaces:**
- Consumes: 无（**不引用** `data/quotes.js`、**不引用** `assets/site.js`）
- Produces: 根级 404；Task 6 的 `sitemap.xml` 不含此页

**设计要点**：一句安慰 + 三扇门，指向 `/#journey`、`/armor.html`、`/#quotes`。全部绝对路径。保持轻量——只有内联样式，无 canvas、无涟漪。

- [ ] **Step 1: 写 `404.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="referrer" content="same-origin">
<meta name="robots" content="noindex">
<title>这里还没有被乐土记录哦…… — elysiad.top</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<!--
  呀！这是走错路时迎接你的那一页——不吓人，不催促，
  只是轻轻说一句「这里还没有被乐土记录」，然后给你三扇门♥
  路径全部用绝对路径：访客可能是在 /a/b/c/d 上撞的墙，
  相对路径会让他再撞一次呢。
-->
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{
  min-height:100vh;display:flex;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;padding:2rem;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  background:radial-gradient(ellipse at 50% 40%,#1a0e2e 0%,#0a0612 70%);
  color:#f0e6ff;line-height:1.8;overflow-x:hidden;
}
.stars{position:fixed;inset:0;pointer-events:none;z-index:0}
.star{position:absolute;border-radius:50%;background:#fff;
  animation:twinkle var(--dur) ease-in-out var(--delay) infinite}
@keyframes twinkle{0%,100%{opacity:.15}50%{opacity:.85}}
.wrap{position:relative;z-index:1;max-width:560px}
.code{font-size:.72rem;letter-spacing:.4em;color:#7b6f99;margin-bottom:1.4rem}
.msg{
  font-size:clamp(1.1rem,3.6vw,1.5rem);font-weight:300;letter-spacing:.1em;
  color:#ffc8dd;text-shadow:0 0 25px rgba(255,200,221,.3);
}
.sub{margin-top:.9rem;font-size:.9rem;color:#a89cc8;font-weight:300;letter-spacing:.08em}
.doors{display:flex;gap:.9rem;justify-content:center;flex-wrap:wrap;margin-top:2.6rem}
.door{
  display:flex;flex-direction:column;gap:.25rem;min-width:104px;
  padding:.9rem 1.1rem;border-radius:14px;text-decoration:none;
  background:linear-gradient(135deg,rgba(255,200,221,.06),rgba(155,93,229,.06));
  border:1px solid rgba(255,200,221,.12);
  transition:transform .3s,box-shadow .3s,border-color .3s;
}
.door:hover,.door:focus-visible{
  transform:translateY(-3px);border-color:rgba(255,200,221,.35);
  box-shadow:0 0 28px rgba(255,143,163,.16);outline:none;
}
.door .t{font-size:.9rem;color:#ffc8dd;letter-spacing:.08em}
.door .n{font-size:.7rem;color:#7b6f99;letter-spacing:.06em}
.home{
  display:inline-block;margin-top:2.4rem;padding:.6rem 1.5rem;border-radius:999px;
  text-decoration:none;font-size:.85rem;letter-spacing:.15em;color:#ffc8dd;
  background:linear-gradient(135deg,rgba(255,143,163,.18),rgba(155,93,229,.2));
  border:1px solid rgba(255,200,221,.3);
  transition:transform .3s,box-shadow .3s;
}
.home:hover,.home:focus-visible{transform:translateY(-2px);box-shadow:0 0 28px rgba(255,143,163,.28);outline:none}
.foot{margin-top:3rem;font-size:.72rem;color:#7b6f99;letter-spacing:.2em}
@media(max-width:480px){.doors{gap:.6rem}.door{min-width:88px;padding:.8rem .8rem}}
@media(prefers-reduced-motion:reduce){
  .star{animation:none;opacity:.4}
  .door,.home{transition:none}
}
</style>
</head>
<body>

<!-- 呀！背景撒一把不会动的星星，静静陪着迷路的人♥ -->
<div class="stars" id="stars" aria-hidden="true"></div>

<div class="wrap">
  <p class="code">4 0 4</p>
  <h1 class="msg">这里还没有被乐土记录哦……</h1>
  <p class="sub">不过，来都来了——</p>

  <nav class="doors" aria-label="推荐去处">
    <a class="door" href="/#journey">
      <span class="t">她的旅途</span><span class="n">9 段</span>
    </a>
    <a class="door" href="/armor.html">
      <span class="t">她的装甲</span><span class="n">时间轴</span>
    </a>
    <a class="door" href="/#quotes">
      <span class="t">飞花寄语</span><span class="n">10 句</span>
    </a>
  </nav>

  <a class="home" href="/">← 回到她的乐土</a>
  <p class="foot">elysiad.top</p>
</div>

<script>
// 呀！星星是这一页唯一的动效——而且减动偏好下它们会乖乖静下来呢
(function(){
  var box = document.getElementById('stars');
  if (!box) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var n = Math.min(60, Math.floor(window.innerWidth / 14));
  var html = '';
  for (var i = 0; i < n; i++) {
    var size = (0.5 + Math.random() * 1.8).toFixed(1);
    html += '<div class="star" style="' +
      'width:' + size + 'px;height:' + size + 'px;' +
      'left:' + (Math.random() * 100).toFixed(1) + '%;' +
      'top:' + (Math.random() * 100).toFixed(1) + '%;' +
      '--dur:' + (2 + Math.random() * 4).toFixed(1) + 's;' +
      '--delay:' + (Math.random() * 5).toFixed(1) + 's;' +
      (Math.random() > 0.3 ? '' : 'background:#c77dff;') +
      '"></div>';
  }
  box.innerHTML = html;
})();
</script>
</body>
</html>
```

- [ ] **Step 2: 本地验证三个入口链接都通**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/404.html \
  sleep 900 \
  eval "Array.from(document.querySelectorAll('.door,.home')).map(a=>a.getAttribute('href')+' -> '+a.textContent.trim().replace(/\s+/g,' ')).join(' | ')" \
  eval "document.querySelectorAll('.star').length" \
  shot screenshots/404.png 2>&1
kill %1 2>/dev/null
```

期望：三个 `.door` 的 href 分别是 `/#journey`、`/armor.html`、`/#quotes`，`.home` 是 `/`；星星数量大于 0；截图正常。

- [ ] **Step 3: 逐个确认目标可达（不留死链）**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
for u in / /armor.html; do
  echo -n "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8500$u")  $u"; echo
done
kill %1 2>/dev/null
```

期望：两项均 `200`。`/#journey` 与 `/#quotes` 是首页锚点，随首页一起可达。

- [ ] **Step 4: 目视核对截图**

用 Read 打开 `screenshots/404.png`，确认：编号 `4 0 4`、主文案、三扇门、返回按钮、落款。风格与站点一致（深紫黑底 + 粉色文案）。

- [ ] **Step 5: 提交**

```bash
git add 404.html
git commit -m "新增引路版 404 页面"
```

---

### Task 6: robots.txt 与 sitemap.xml

**Files:**
- Create: `robots.txt`、`sitemap.xml`

**Interfaces:**
- Consumes: 无
- Produces: 爬虫入口；`sitemap.xml` 的 URL 列表需与站点实际页面保持一致

- [ ] **Step 1: 写 `robots.txt`**

```
User-agent: *
Allow: /

Sitemap: https://elysiad.top/sitemap.xml
```

- [ ] **Step 2: 写 `sitemap.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!--
  呀！这是告诉搜索引擎「乐土里有哪些房间」的地图——
  只列真实存在的页面，404 和留言簿不进来哦♥
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://elysiad.top/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://elysiad.top/armor.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://elysiad.top/kevin/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://elysiad.top/eden/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://elysiad.top/aponia/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://elysiad.top/villv/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://elysiad.top/kalpas/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://elysiad.top/su/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>
```

- [ ] **Step 3: 验证 XML 合法且每个 URL 都真的存在**

```bash
cd <repo 根>
python -c "
import xml.etree.ElementTree as ET
ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
root = ET.parse('sitemap.xml').getroot()
urls = [u.find('s:loc', ns).text for u in root.findall('s:url', ns)]
print('URL 数量:', len(urls))
for u in urls: print(' ', u)
" 2>&1
```

期望：输出 8 个 URL，无异常。

- [ ] **Step 4: 逐个核对线上可达**

```bash
for u in "" armor.html kevin/ eden/ aponia/ villv/ kalpas/ su/; do
  echo -n "$(curl -s -o /dev/null -w '%{http_code}' "https://elysiad.top/$u")  /$u"; echo
done
```

期望：8 项全部 `200`。**任何一项不是 200，就必须从 sitemap 里删掉那一行**——地图里指向死链比没有地图更糟。

- [ ] **Step 5: 提交**

```bash
git add robots.txt sitemap.xml
git commit -m "新增 robots.txt 与 sitemap.xml"
```

---

### Task 7: 图片转 WebP

**Files:**
- Create: `tools/to_webp.py`、`images/*.webp`（8 个）
- Modify: `data/timeline-data.js`（`img` 字段改 `.webp`，新增 `img_w`/`img_h`）、`armor.html`（生成的 `<img>` 补 `width`/`height` 与 `decoding`）

**Interfaces:**
- Consumes: 无
- Produces: `images/armor-pink.webp`、`armor-ego.webp`、`armor-elf.webp`、`skin-1.webp` … `skin-5.webp`；`TIMELINE_DATA[].img_w` / `img_h`（数字，像素）

**当前实测基线**（改动前必须记录，用于对比）：

```
images/armor-ego.png   1024x984   1019 KB
images/armor-elf.png   1024x921    875 KB
images/armor-pink.png  1024x984    538 KB
images/skin-1.png       833x1024   737 KB
images/skin-2.png      1024x722    613 KB
images/skin-3.png       403x529    232 KB
images/skin-4.png      1024x576    573 KB
images/skin-5.png      1024x721    507 KB
合计 8 张 / 5.0 MB
```

- [ ] **Step 1: 写 `tools/to_webp.py`**

```python
# tools/to_webp.py — 把站点图片批量转成 WebP（本地工具，不部署）
#
#   python tools/to_webp.py            # 转换 + 报告体积
#   python tools/to_webp.py --dry-run  # 只看会做什么，不写文件
#
# 依赖：Pillow（已确认本机 11.3.0 可用，且支持 WebP）
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / 'images'
QUALITY = 82
METHOD = 6          # 0~6，越大越慢压得越好
MAX_EDGE = 1024     # 原始最大边就不超过它，这里只做保护性缩放

# 站点真正引用的 8 张（images/raw/ 是素材，不转）
TARGETS = [
    'armor-pink', 'armor-ego', 'armor-elf',
    'skin-1', 'skin-2', 'skin-3', 'skin-4', 'skin-5',
]


def convert(name: str, dry: bool) -> tuple[int, int, tuple[int, int]]:
    src = IMG / f'{name}.png'
    dst = IMG / f'{name}.webp'
    if not src.exists():
        raise SystemExit(f'找不到源文件：{src}')

    before = src.stat().st_size
    with Image.open(src) as im:
        im.load()
        size = im.size
        if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
            im = im.convert('RGBA')
        else:
            im = im.convert('RGB')
        if max(im.size) > MAX_EDGE:
            ratio = MAX_EDGE / max(im.size)
            im = im.resize((round(im.width * ratio), round(im.height * ratio)), Image.LANCZOS)
        if not dry:
            im.save(dst, 'WEBP', quality=QUALITY, method=METHOD)

    after = dst.stat().st_size if dst.exists() else 0
    return before, after, size


def main() -> None:
    dry = '--dry-run' in sys.argv
    total_before = total_after = 0
    print(f'{"文件":<20}{"原始":>10}{"WebP":>10}{"省下":>9}  尺寸')
    print('-' * 62)
    for name in TARGETS:
        before, after, size = convert(name, dry)
        total_before += before
        total_after += after
        pct = (1 - after / before) * 100 if before else 0
        print(f'{name + ".webp":<20}{before/1024:>8.0f}KB{after/1024:>8.0f}KB{pct:>8.1f}%  {size[0]}x{size[1]}')
    print('-' * 62)
    pct = (1 - total_after / total_before) * 100 if total_before else 0
    print(f'{"合计":<20}{total_before/1024/1024:>7.2f}MB{total_after/1024/1024:>9.2f}MB{pct:>8.1f}%')
    if dry:
        print('\n（--dry-run，未写入任何文件）')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: 先干跑一遍看收益**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/to_webp.py --dry-run
```

期望：合计压缩比在 **80% 以上**。若低于 70%，把 `QUALITY` 降到 78 再试；若某张图掉得特别少，检查它是否本来就已经很小。

> **⚠ 实测校正：干净环境下这一步看不到真实压缩比。**
> 脚本里 `after = dst.stat().st_size if dst.exists() else 0`——`.webp` 还不存在时 `after` 恒为 0，
> 于是 WebP 列与压缩比会显示成**假的 100%**。
>
> 所以顺序应该是：**先正式转换（Step 3），再回头跑 `--dry-run` 看真实数值**。
> 本计划首次执行时的真值如下，可作对照：
>
> | 文件 | 原始 | WebP | 省下 |
> |---|---|---|---|
> | armor-pink | 538KB | 93KB | 82.6% |
> | armor-ego | 1019KB | 247KB | 75.8% |
> | armor-elf | 875KB | 189KB | 78.3% |
> | skin-1 | 737KB | 116KB | 84.2% |
> | skin-2 | 613KB | 44KB | 92.8% |
> | skin-3 | 232KB | 24KB | 89.8% |
> | skin-4 | 573KB | 119KB | 79.3% |
> | skin-5 | 507KB | 46KB | 90.8% |
> | **合计** | **4.97MB** | **0.86MB** | **82.8%** |

- [ ] **Step 3: 正式转换**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/to_webp.py
ls -la images/*.webp
```

期望：8 个 `.webp` 生成；总体积 **小于 1.0 MB**（目标约 600 KB）。**原 PNG 全部保留不删**——它们仍是工件的母本。

- [ ] **Step 4: 目视比对一张，确认画质没坏**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/armor.html \
  sleep 1500 \
  eval "document.querySelectorAll('.timeline-card').length" \
  shot screenshots/armor-png.png 2>&1
kill %1 2>/dev/null
```

用 Read 打开 `screenshots/armor-png.png` 作为**改动前的对照基准**。此时 `timeline-data.js` 还指向 PNG。

- [ ] **Step 5: 改 `data/timeline-data.js` 的 8 条记录**

对每一条 `img: 'images/xxx.png'` 的记录，做两处改动：

1. `img` 改成 `.webp`
2. 补上 `img_w` 与 `img_h`（用 Step 1 输出里的真实尺寸）

以第一条为例，改动前：

```js
{ id: 'armor-pink', type: 'armor', title: '粉色妖精小姐♪', subtitle: 'S级 · 异能 · 物理输出', real_date: '2021-09', version: 'v5.1', ingame_time: '前文明纪元 · 往世乐土', desc: '初入乐土时与她相遇的那位粉色妖精。', detail: '专武：往事的飞花·爱之诗', img: 'images/armor-pink.png', audio: null, featured: true,  order: 11 },
```

改动后：

```js
{ id: 'armor-pink', type: 'armor', title: '粉色妖精小姐♪', subtitle: 'S级 · 异能 · 物理输出', real_date: '2021-09', version: 'v5.1', ingame_time: '前文明纪元 · 往世乐土', desc: '初入乐土时与她相遇的那位粉色妖精。', detail: '专武：往事的飞花·爱之诗', img: 'images/armor-pink.webp', img_w: 1024, img_h: 984, audio: null, featured: true,  order: 11 },
```

其余 7 条按同法处理，**尺寸必须取 Step 1 输出的真实值**，不要照抄这一条的数字：

| 记录 id | 新 img | img_w | img_h |
|---|---|---|---|
| `armor-pink` | `images/armor-pink.webp` | 1024 | 984 |
| `armor-ego` | `images/armor-ego.webp` | 1024 | 984 |
| `armor-elf` | `images/armor-elf.webp` | 1024 | 921 |
| `skin-1` | `images/skin-1.webp` | 833 | 1024 |
| `skin-2` | `images/skin-2.webp` | 1024 | 722 |
| `skin-3` | `images/skin-3.webp` | 403 | 529 |
| `skin-4` | `images/skin-4.webp` | 1024 | 576 |
| `skin-5` | `images/skin-5.webp` | 1024 | 721 |

- [ ] **Step 6: `armor.html` 生成的 `<img>` 补尺寸与解码提示**

`armor.html:180` 现在是：

```js
          (it.img ? '<div class="card-image"><img src="' + it.img + '" alt="' + it.title + '" loading="lazy"></div>' : '') +
```

改为：

```js
          (it.img ? '<div class="card-image"><img src="' + it.img + '" alt="' + it.title + '"'
                    + (it.img_w ? ' width="' + it.img_w + '" height="' + it.img_h + '"' : '')
                    + ' loading="lazy" decoding="async"></div>' : '') +
```

- [ ] **Step 6b: ⚠ 必须同时改 CSS，否则图片会被拉伸变形**

**这一步不能漏。** 只加 `width`/`height` 属性会引入肉眼可见的回归——首次执行时实测到了：

```
改动前  →  340.78 × 327.48   （1024:984 比例保持）
只加属性 →  340.81 × 440.00   ← 纵向拉伸约 34%，脸都变形了
整页像素差异 6.87%，最大差 246
```

**根因**：`armor.html` 已有的 `.card-image img{max-width:100%;max-height:440px}` 是两条**独立**的约束。一旦 `<img>` 带上了 `width`/`height` 属性（映射为 `width`/`height` 属性值），两个方向就都成了确定值，`max-width` 和 `max-height` 各自生效、**宽高比不再守恒**。

**修法**：把 `width`/`height` 交回浏览器按原始比例联合求解——这是 `width`/`height` 属性的标准配套写法。找到 `armor.html:99` 的：

```css
.card-image img{max-width:100%;max-height:440px;border-radius:12px;box-shadow:0 0 26px rgba(255,143,163,.15)}
```

改为：

```css
.card-image img{width:auto;height:auto;max-width:100%;max-height:440px;border-radius:12px;box-shadow:0 0 26px rgba(255,143,163,.15)}
```

改完 8 张图的渲染盒必须与基线**逐像素相同**（实测：整页差异从 6.87% 降到 0.024%，余量来自 WebP 有损压缩本身）。

- [ ] **Step 7: 重新截图，与 Step 4 的基准逐张比对**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/armor.html \
  sleep 1500 \
  eval "Array.from(document.images).map(i=>i.currentSrc.split('/').pop()+' '+i.naturalWidth+'x'+i.naturalHeight+' '+i.complete).join(' | ') || '无图（卡片未展开）'" \
  eval "Array.from(document.querySelectorAll('.timeline-card')).slice(0,3).forEach(c=>c.click()); '已展开前 3 张'" \
  sleep 900 \
  eval "Array.from(document.images).map(i=>i.currentSrc.split('/').pop()+' '+i.naturalWidth+'x'+i.naturalHeight).join(' | ')" \
  eval "document.querySelectorAll('img').length" \
  shot screenshots/armor-webp.png 2>&1
kill %1 2>/dev/null
```

期望：图片文件名为 `.webp`；`naturalWidth`/`naturalHeight` 为正数且与 Step 5 的记录一致；`document.querySelectorAll('img').length` 大于 0。

用 Read 打开 `screenshots/armor-webp.png`，与 `screenshots/armor-png.png` 对比：**构图、位置、清晰度应无肉眼可见差异**。若出现明显色带或边缘发糊，把 `QUALITY` 提到 88 重跑 Step 3。

> **⚠ 探测图片时必须把视口拉高**（例如 `size 1280x9000`）。图片是 `loading="lazy"`，在 900 高的视口里下面 5 张**永远不会加载**，`complete=false`、渲染盒 `0x0`——那是懒加载的正常行为，**不是回归**，但会让你误判。首次执行时就因为这一点多绕了一圈。
>
> 正确的探测方式（视口拉高 + 展开全部卡片 + 逐个比对渲染比与原生比）：
>
> ```bash
> PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/armor.html \
>   size 1280x9000 sleep 3000 \
>   eval "(()=>{document.querySelectorAll('.timeline-card').forEach(c=>c.classList.add('open'));return 'opened'})()" \
>   sleep 3000 \
>   eval "Array.from(document.images).map((i,n)=>{const r=i.getBoundingClientRect();const ar=r.height>0?(r.width/r.height).toFixed(3):'—';const nat=(i.naturalWidth/i.naturalHeight).toFixed(3);return n+': '+i.getAttribute('src').replace('images/','')+' '+Math.round(r.width)+'x'+Math.round(r.height)+' 比'+ar+' 原生比'+nat+' 加载='+i.complete}).join('\n')"
> ```
>
> 期望：8 张图全部 `加载=true`，且**渲染比 == 原生比**。本计划首次执行的实测值：
> `armor-pink 341x327`、`armor-ego 341x327`、`armor-elf 341x307`、`skin-1 341x419`、
> `skin-2 341x240`、`skin-3 335x440`、`skin-4 341x192`、`skin-5 341x240`。

- [ ] **Step 8: 确认没有遗漏的 `.png` 引用**

```bash
cd <repo 根>
grep -rn "images/.*\.png" --include=*.html --include=*.js . | grep -v "^./docs" | grep -v "images/raw"
```

期望：**输出为空**。若有残留（比如 `index.html` 里某处），逐个改成 `.webp`。注意 `images/og.png`（Task 8 创建）是唯一允许的例外，它必须是 PNG。

- [ ] **Step 9: 提交**

```bash
git add tools/to_webp.py images/*.webp data/timeline-data.js armor.html
git commit -m "图片转 WebP（5.0MB -> 约 600KB），补 img 尺寸防布局抖动"
```

---

### Task 8: 分享卡片（OG 标签 + og.png）

**Files:**
- Create: `tools/og-card.html`、`images/og.png`
- Modify: 8 个页面的 `<head>`

**Interfaces:**
- Consumes: `favicon.svg`（Task 4 已建）、`images/*.webp`（Task 7 已建）
- Produces: `images/og.png`（1200×630 PNG）；8 页的 `og:*` 与 `twitter:card` 元数据

**版式（已在设计中确认）**：立绘在右 · 文案在左。

**硬约束**：`og:image` **必须是 PNG**——微信预览不支持 WebP，用 `.webp` 会得到一张白图。

- [ ] **Step 1: 写渲染模板 `tools/og-card.html`**

这是一个**只用于出图**的页面，不属于站点资源（`static.yml` 白名单里 `tools/` 已被排除，不会上线）。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<!--
  呀！这是出分享卡片用的模板，不是给人看的页面——
  用 tools/cdp.py 按 1200x630 截一张图，存成 images/og.png 就完成啦♥
  立绘在右、文案在左，因为分享卡片的唯一任务是让人愿意点进来：
  在任何缩略图尺寸下，都要还能看出「这是什么地方」。
-->
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    width:1200px;height:630px;overflow:hidden;display:flex;
    background:linear-gradient(115deg,#0a0612 0%,#1a0e2e 55%,#2d1b4e 100%);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  }
  .left{flex:0 0 58%;padding-left:84px;display:flex;flex-direction:column;justify-content:center}
  .title{font-size:64px;font-weight:300;letter-spacing:.1em;color:#ffc8dd;
    text-shadow:0 0 40px rgba(255,143,163,.45)}
  .en{font-size:19px;letter-spacing:.42em;color:#c77dff;margin-top:16px;
    text-shadow:0 0 18px rgba(199,125,255,.5)}
  .line{width:96px;height:2px;margin:30px 0;
    background:linear-gradient(90deg,#ff8fa3,transparent)}
  .meta{font-size:21px;line-height:2.15;color:#a89cc8;font-weight:300;letter-spacing:.04em}
  .bday{font-size:21px;color:#ffd166;margin-top:22px;letter-spacing:.06em}
  .right{flex:1 1 42%;position:relative;overflow:hidden}
  .glow{position:absolute;inset:0;z-index:1;
    background:radial-gradient(circle at 55% 62%,rgba(255,143,163,.30),transparent 62%)}
  .art{position:absolute;inset:0;z-index:0;width:100%;height:100%;
    object-fit:cover;object-position:50% 20%}
</style>
</head>
<body>
  <div class="left">
    <div class="title">致 爱 莉 希 雅</div>
    <div class="en">E L Y S I A</div>
    <div class="line"></div>
    <div class="meta">往世乐土 · 她的旅途<br>十三英桀 · 飞花寄语</div>
    <div class="bday">11 / 11　她的生日</div>
  </div>
  <div class="right">
    <img class="art" src="/images/armor-elf.webp" alt="">
    <div class="glow"></div>
  </div>
</body>
</html>
```

- [ ] **Step 2: 出图**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/tools/og-card.html \
  size 1200x630 sleep 2200 \
  eval "document.querySelector('.art').naturalWidth + 'x' + document.querySelector('.art').naturalHeight" \
  shot images/og.png 2>&1
kill %1 2>/dev/null
```

期望：立绘的自然尺寸为 `1024x921`（证明图真的加载了）；`images/og.png` 生成。

- [ ] **Step 3: 校验出图尺寸正确**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python -c "
from PIL import Image
im = Image.open('images/og.png')
print('尺寸:', im.size, '模式:', im.mode)
assert im.size == (1200, 630), f'尺寸不对：{im.size}'
print('✅ 1200x630')
" 2>&1
```

期望：`✅ 1200x630`。**若尺寸不对**，说明 `size` 动作没生效或窗口尺寸被系统缩放影响，检查 `tools/cdp.py` 的 `Emulation.setDeviceMetricsOverride` 调用。

- [ ] **Step 4: 目视核对卡片**

用 Read 打开 `images/og.png`，检查：
- 左侧「致 爱 莉 希 雅」、`E L Y S I A`、分隔线、两行描述、`11 / 11 她的生日` 全部完整可见，没有被裁切
- 右侧立绘可见，**头部没有被裁掉**

> **⚠ 实测校正一：`object-position` 的第二个值（竖向）在这里不起作用。**
> 右栏是 `flex:1 1 42%` → `504×630`，而原图 `armor-elf` 是 `1024×921`（比例 1.112 > 0.8），
> 所以 `object-fit:cover` 是**按高度**缩放的 → 缩放后 `700×630`，**竖向正好铺满、裁切量恒为 0**，
> 多出来的 196px 全在横向。因此竖向前景不可调，**能动的只有第一个值（横向）**。
> 若换了比例更窄的立绘，竖向才可能开始裁切。

> **⚠ 实测校正二：立绘素材必须检查有没有截图浮层。**
> `images/armor-elf.png`（嗨♪爱愿妖精♥）**自带两个 UI 贴纸**——一个白色圆角气泡带心形图标与
> `\(^o^)/~~`，旁边还有一个带小图标与粉色爱心的方块，位置在画面中部偏右、压在她的裙摆上。
> 那是原图自带的，不是渲染瑕疵。它们**不属于立绘本身**，放在分享卡片上看着像缺陷。
>
> **选素材时务必逐张放大确认**。本计划实测的三张：
>
> | 素材 | 是否干净 | 构图 |
> |---|---|---|
> | `armor-elf.webp`（嗨♪爱愿妖精♥） | ❌ **有两个 UI 贴纸** | 明亮、色彩最饱和 |
> | `armor-ego.webp`（真我·人之律者） | ✅ 干净 | 优雅，但她本身偏白，缩略图下可能发糊 |
> | `armor-pink.webp`（粉色妖精小姐♪） | ✅ 干净 | 有飞花，粉/紫/深色对比强，**缩略图可读性最好** |
>
> 换素材只需改 `tools/og-card.html` 里 `.art` 的 `src`，然后重跑 Step 2、Step 3。

- [ ] **Step 5: 给出 8 个页面的 OG 描述文案**

`og:description` 要逐页不同。**刻印名请从 `data/timeline-data.js` 的 `HEROS` 数组里取对应角色的 `signet` 字段，不要凭记忆写**——那份数据是已确认的名册。

```bash
cd <repo 根>
python -c "
import re
js = open('data/timeline-data.js', encoding='utf-8').read()
for m in re.finditer(r\"name: '([^']+)'.*?signet: '([^']+)'\", js, re.S) or []:
    print(m.group(1), m.group(2))
" 2>&1
```

若上面没输出（字段顺序不同），改用：

```bash
grep -n "rank:\|signet:\|name:" data/timeline-data.js | head -60
```

按下表逐页填写描述：

| 页面 | `og:title` | `og:description` |
|---|---|---|
| `index.html` | `elysiad.top — 致爱莉希雅` | 往世乐土 · 她的旅途 · 十三英桀 · 飞花寄语。一位如飞花般绚丽的少女，和她的十三位同伴。 |
| `armor.html` | `她的装甲 · 完整时间轴 — elysiad.top` | 爱莉希雅的装甲与皮肤完整时间轴：现实时间 · 游戏时间 · 游戏版本三轴对照。 |
| `kevin/index.html` | `致凯文 — elysiad.top` | 逐火十三英桀 · 位次 Ⅰ · 刻印「救世」。（刻印名以数据文件为准） |
| `eden/index.html` | `致伊甸 — elysiad.top` | 逐火十三英桀 · 刻印「黄金」。（刻印名以数据文件为准） |
| `aponia/index.html` | `致阿波尼亚 — elysiad.top` | 逐火十三英桀 · 刻印「戒律」。（刻印名以数据文件为准） |
| `villv/index.html` | `致维尔薇 — elysiad.top` | 逐火十三英桀 · 刻印「螺旋」。（刻印名以数据文件为准） |
| `kalpas/index.html` | `致千劫 — elysiad.top` | 逐火十三英桀 · 刻印「鏖灭」。（刻印名以数据文件为准） |
| `su/index.html` | `致苏 — elysiad.top` | 逐火十三英桀 · 刻印「天慧」。（刻印名以数据文件为准） |

**用 Step 5 第一条命令的输出核对上面每一行的刻印名**；不一致的以数据文件为准。位次同理。

- [ ] **Step 6: 为 8 个页面插入 OG 标签**

在每个 HTML 的 `<head>` 里，`<link rel="icon" ...>`（Task 4 已加）**之后**插入下面这一组，把 `<标题>`、`<描述>`、`<该页路径>` 三处替换成 Step 5 对应行的内容：

```html
<!-- 呀！分享出去的时候，要带着她的样子，而不是一行光秃秃的链接♥ -->
<meta name="description" content="<描述>">
<meta property="og:type" content="website">
<meta property="og:site_name" content="elysiad.top">
<meta property="og:title" content="<标题>">
<meta property="og:description" content="<描述>">
<meta property="og:url" content="https://elysiad.top/<该页路径>">
<meta property="og:image" content="https://elysiad.top/images/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0a0612">
```

各页 `<该页路径>` 取值：`index.html` 用空串（即 `https://elysiad.top/`）；`armor.html` 用 `armor.html`；角色页用 `kevin/`、`eden/`、`aponia/`、`villv/`、`kalpas/`、`su/`。

**`og:url` 必须是绝对地址**——相对地址在各平台都解析不出来。

- [ ] **Step 7: 校验 8 页元数据齐全**

```bash
cd <repo 根>
for f in index.html armor.html aponia/index.html eden/index.html kalpas/index.html kevin/index.html su/index.html villv/index.html; do
  printf "%-22s og:title=%s og:image=%s desc=%s twitter=%s\n" "$f" \
    "$(grep -c 'property="og:title"' "$f")" \
    "$(grep -c 'property="og:image"' "$f")" \
    "$(grep -c 'name="description"' "$f")" \
    "$(grep -c 'twitter:card' "$f")"
done
```

期望：**每一项都是 1**。

- [ ] **Step 8: 确认 og:image 域名是绝对地址、且指向 PNG**

```bash
cd <repo 根>
grep -h 'property="og:image"' index.html armor.html */index.html | sort -u
```

期望：输出唯一一行 `... content="https://elysiad.top/images/og.png"`。**若出现 `images/og.png` 相对路径或 `.webp`，必须修。**

- [ ] **Step 9: 确认 og.png 本身可达且是 PNG**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
curl -s -o /dev/null -w "%{http_code}  %{content_type}  %{size_download} bytes\n" http://localhost:8500/images/og.png
kill %1 2>/dev/null
```

期望：`200  image/png  <数字> bytes`。

- [ ] **Step 10: 提交**

```bash
git add tools/og-card.html images/og.png index.html armor.html */index.html
git commit -m "新增分享卡片：og.png（1200x630）与 8 页 OG 元数据"
```

---

---

### Task 8 补充：分享卡片改为多变体 + 随机轮换

**背景**：Task 8 首次执行时用了 `armor-elf.webp`（嗨♪爱愿妖精♥），但它**自带两个 UI 截图浮层**（一个写着 `\(^o^)/~~` 的白色气泡、一个带爱心的方块），压在裙摆上，作为分享卡片看着像瑕疵。需求方的决定是：**三张立绘都保留，随机轮换当前生效的那一张**。

**Files:**
- Modify: `tools/og-card.html`（支持 `?art=` 切换立绘）
- Create: `images/og-1.png`、`og-2.png`、`og-3.png`
- Delete: `images/og.png`（单张方案作废）
- Create: `tools/pick_og.py`
- Modify: 8 个页面的 `og:image`

**Interfaces:**
- Produces: `images/og-<n>.png` 三个变体；`python tools/pick_og.py [--list | --set N]`

- [ ] **Step 1: 让模板支持切换立绘**

`tools/og-card.html` 的 `<img class="art">` 加 `id="art"`，默认 `src="/images/armor-pink.webp"`，并在 `</body>` 前加：

```html
<script>
  // 立绘由 ?art= 决定；允许的取值写死在白名单里，避免这个模板被拿来读任意文件
  (function () {
    var OK = ['armor-pink', 'armor-ego', 'armor-elf'];
    var want = new URLSearchParams(location.search).get('art');
    if (want && OK.indexOf(want) >= 0) {
      document.getElementById('art').src = '/images/' + want + '.webp';
    }
  })();
</script>
```

> 白名单很重要：这个模板在 `tools/` 下、会被 `http.server` 提供，不加白名单等于开放了一个「按参数读任意路径」的口子。

- [ ] **Step 2: 生成三个变体**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
i=1
for art in armor-pink armor-ego armor-elf; do
  PYTHONIOENCODING=utf-8 python tools/cdp.py "http://localhost:8500/tools/og-card.html?art=$art" \
    size 1200x630 sleep 2200 shot "images/og-$i.png"
  i=$((i+1))
done
kill %1 2>/dev/null
rm -f images/og.png
```

变体编号固定为：

| 编号 | 立绘 | 说明 |
|---|---|---|
| `og-1.png` | `armor-pink` | 粉色妖精小姐♪（初遇那位粉色妖精） |
| `og-2.png` | `armor-ego` | 真我·人之律者（她的本质形态） |
| `og-3.png` | `armor-elf` | 嗨♪爱愿妖精♥（黄金庭院再舞，**有 UI 浮层**） |

- [ ] **Step 3: 校验三张都是 1200×630 PNG**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python -c "
from PIL import Image
import os
for n in (1,2,3):
    f='images/og-%d.png'%n
    im=Image.open(f)
    assert im.size==(1200,630) and im.format=='PNG', f
    print('%s  %s  %.0f KB  OK' % (f, im.size, os.path.getsize(f)/1024))
"
```

- [ ] **Step 4: 写 `tools/pick_og.py`**

脚本见仓库内的实际文件。它做三件事：列出变体与当前生效项、随机挑一张（**避开当前那张**，保证每次都真换）、把 8 个页面的 `og:image` 统一改成选中的那张。

关键正则：

```python
PATTERN = re.compile(r'(property="og:image"\s+content="https://elysiad\.top/)images/og(?:-\d+)?\.png(")')
```

- [ ] **Step 5: 验证轮换真的会换**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/pick_og.py --list
for i in 1 2 3 4 5; do PYTHONIOENCODING=utf-8 python tools/pick_og.py | head -1; done
PYTHONIOENCODING=utf-8 python tools/pick_og.py --set 1
```

期望：连续 5 次随机，**没有一次与上一次相同**（脚本会避开当前那张）；8 个页面同步更新；`--set` 能指定。

- [ ] **Step 6: 确认没有页面还指向已删除的 `og.png`**

```bash
cd <repo 根>
grep -l 'images/og\.png' index.html armor.html */index.html 2>/dev/null || echo "无 ✅"
grep -h 'property="og:image"' index.html armor.html */index.html | grep -o 'images/[^"]*' | sort -u
```

期望：第一条无输出；第二条只剩一行 `images/og-<n>.png`。

- [ ] **Step 7: 提交**

```bash
git add tools/og-card.html tools/pick_og.py images/og-*.png index.html armor.html */index.html
git commit -m "分享卡片改为三个立绘变体，新增随机轮换脚本 pick_og.py"
```

**⚠ 必须向需求方说明的限制**：微信 / QQ 的预览图由平台自行抓取并缓存，**缓存期可能长达数天到数周**。因此「每次分享都随机一张」在这些平台上**做不到**——服务端随机对它们无效。本方案实现的是「**轮换当前生效的那一张**」：跑一次 `pick_og.py`，之后所有分享统一换成新的那张。这是在不引入运行时依赖的前提下能拿到的最好效果。

若日后确实需要**每请求随机**，唯一的办法是让 Worker 加一个 `/og.png` 路由返回随机变体。但那样分享卡片的可用性就绑在 Worker 上——Cloudflare 在中国大陆不通时会是**空白预览图**，比固定一张更糟。**本计划不采用**。

---

> **P1 公共层抽取不在本计划内。** 它是一件事独立、风险也独立的工程（要改动 8 个页面全部现有样式与脚本，
> 且需要逐页像素级比对），与上面这些"新增"性质的任务混在一份计划里既不利于评审，也会让任务编号反复错位。
> 因此它单独成一份计划：`docs/superpowers/plans/2026-09-15-elysiad-extraction.md`，
> 依赖分析文档 `docs/superpowers/plans/2026-09-15-extraction-inventory.md`。
>
> **执行顺序上没有依赖**：本计划的新功能全部写在新建的 `assets/*.js` 里、且只有首页引用，
> 所以先做本计划还是先做 P1 都不会产生返工。


---

## Phase P3 · 情感层（仅首页）

### Task 9: `data/quotes.js` 语料池

**Files:**
- Create: `data/quotes.js`

**Interfaces:**
- Consumes: 无
- Produces: `window.QUOTES = { daily: string[], hidden: string[] }`；Task 10（今日之语）与 Task 13（明信片）都读 `QUOTES.daily`，Task 12（彩蛋）读 `QUOTES.hidden`

**数据纪律**：`daily` 的 10 句必须与 `index.html:578-589` 现有「飞花寄语」**逐字一致**，不得改写标点。`hidden` **默认为空数组**——没有出处就留空，彩蛋会自动不触发（见 Task 12 Step 2），绝不编造。

- [ ] **Step 1: 写 `data/quotes.js`**

```js
/**
 * 她的台词语料池 —— 供首页「今日之语」、明信片生成、隐藏彩蛋共用。
 *
 * ⚠ 数据纪律：本文件只收录有出处的原文，绝不编造。
 *    - daily  ：与 index.html「飞花寄语」的 10 张卡片逐字一致
 *    - hidden ：隐藏彩蛋专用。**为空时彩蛋不触发**（这是有意的设计，
 *               而不是遗漏）。待获得有出处的台词后，把原文填进来并注明来源。
 */
window.QUOTES = {
  daily: [
    '「嗨，想我了吗？」',
    '「此后，将有群星闪耀，因为我如今来过；此后，将有百花绽放，因为我从未离去。」',
    '「请将我的箭、我的花、与我的爱，织成新生的种子，带向那枯萎的大地。然后，便让它开出永恒而无瑕的……人性之华吧。」',
    '「悲剧并非终结，而是希望的起始。」',
    '「毕竟——美丽的女孩子，什么都能做到嘛！」',
    '「我是律者，也是人类，但……更是一位如飞花般绚丽的少女呀♪」',
    '「如你所见，与那个凯文齐名的第二领袖，竟是一位如花朵般娇羞的少女——也就是我啦。」',
    '「而你将走向未来。然后，就去绽放出独属于你的，无瑕而美丽的光辉吧。」',
    '「愿你前行的道路有群星闪耀，愿你留下的足迹有百花绽放。」',
    '「十三个人向命运发起抗争的故事，不应该随着一个时代的逝去一同消亡，它应当被铭记。」'
  ],

  // ⚠ 空数组 = 彩蛋不触发。填入前必须确认出处并写在下面。
  // 例：{ text: '「…」', source: '崩坏3 · 往世乐土 · 第X章' }
  hidden: []
};
```

- [ ] **Step 2: 逐字核对，确保与 index.html 完全一致**

```bash
cd <repo 根>
python - <<'PY'
import re, pathlib
html = pathlib.Path('index.html').read_text(encoding='utf-8')
m = re.search(r'const quotes = \[(.*?)\];', html, re.S)
in_html = re.findall(r"'((?:[^'\\]|\\.)*)'", m.group(1))

js = pathlib.Path('data/quotes.js').read_text(encoding='utf-8')
m2 = re.search(r'daily: \[(.*?)\]', js, re.S)
in_js = re.findall(r"'((?:[^'\\]|\\.)*)'", m2.group(1))

print('index.html 条数:', len(in_html))
print('quotes.js  条数:', len(in_js))
ok = in_html == in_js
print('逐字一致:', ok)
if not ok:
    for i, (a, b) in enumerate(zip(in_html, in_js)):
        if a != b:
            print(f'  第 {i+1} 条不同:')
            print(f'    html: {a}')
            print(f'    js  : {b}')
PY
```

期望：`index.html 条数: 10`、`quotes.js 条数: 10`、`逐字一致: True`。**不一致就必须改 quotes.js，不许改 index.html**（首页那 10 句是在线内容，不改动）。

- [ ] **Step 3: 验证同一天取句稳定、跨天会变**

```bash
node -e "
const pool = require('fs').readFileSync('data/quotes.js','utf8').match(/daily: \[([\s\S]*?)\]/)[1].match(/'((?:[^'\\\\]|\\\\.)*)'/g).map(s=>s.slice(1,-1));
function idx(y,m,d){ return Math.floor(Date.UTC(y,m,d)/86400000) % pool.length; }
console.log('条数:', pool.length);
console.log('今天(2026-09-15)两次调用:', idx(2026,8,15), idx(2026,8,15));
console.log('明天(2026-09-16):', idx(2026,8,16));
console.log('连看十天:', Array.from({length:10},(_,i)=>idx(2026,8,15+i)).join(','));
"
```

期望：同一天两次调用结果相同；明天与今天不同；十天序列覆盖 0~9 全部索引（因为 10 天正好一轮）。

- [ ] **Step 4: 提交**

```bash
git add data/quotes.js
git commit -m "新增台词语料池 data/quotes.js（与首页飞花寄语逐字一致）"
```

---

### Task 10: 首页「今日之语」

**Files:**
- Create: `assets/daily.js`
- Modify: `index.html`（在「关于她」区块后、「她的旅途」区块前插入新 section + 样式 + script 引用）

**Interfaces:**
- Consumes: `window.QUOTES.daily`（Task 9 产出）
- Produces: DOM 元素 `#dailyQuote`；样式类 `.daily-band` / `.daily-label` / `.daily-text`

**位置**：`index.html` 中 `</section>`（`id="about"` 结束，约 `index.html:444`）与 `<!-- ===== JOURNEY ===== -->`（`index.html:446`）之间。

- [ ] **Step 1: 在 `index.html` 的 `<style>` 末尾（`</style>` 之前）追加样式**

```css
/* ===== DAILY QUOTE (今日之语) ===== */
/* 呀！这是每天都会换一句的语句带——夹在「关于她」和「她的旅途」中间，
   像走过她身边时，她忽然转头跟你说的那一句♥ */
.daily-band{
  position:relative;z-index:2;text-align:center;
  padding:3.2rem 1.5rem 1rem;max-width:720px;margin:0 auto;
}
.daily-label{
  display:inline-block;font-size:.7rem;color:var(--text-muted);
  letter-spacing:.35em;margin-bottom:1.1rem;
}
.daily-label::before,.daily-label::after{
  content:'';display:inline-block;width:26px;height:1px;vertical-align:middle;
  background:linear-gradient(90deg,transparent,var(--pink),transparent);
  margin:0 .8rem;
}
.daily-text{
  font-size:clamp(1rem,2.8vw,1.25rem);font-weight:300;letter-spacing:.1em;
  color:var(--pink-mist);line-height:2;
  text-shadow:0 0 22px rgba(255,200,221,.25);
}
@media(prefers-reduced-motion:reduce){
  .daily-text{text-shadow:none}
}
```

- [ ] **Step 2: 插入区块 HTML**

在 `index.html` 的 `<!-- ===== JOURNEY ===== -->` 之前插入：

```html
<!-- ===== DAILY QUOTE ===== -->
<!-- 同上：每天一句，按访客本地日期轮换 -->
<section class="daily-band" id="daily" aria-labelledby="dailyLabel">
  <span class="daily-label" id="dailyLabel">今 日 之 语</span>
  <p class="daily-text" id="dailyQuote"></p>
</section>

```

- [ ] **Step 3: 写 `assets/daily.js`**

```js
/**
 * 「今日之语」——按访客的本地日期，从语料池里取一句。
 *
 * 取句规则：以「本地日期的天数序数」对语料长度取模。
 *   - 同一天，所有访客看到同一句（不是随机，避免同一天不同人看到不同话）
 *   - 次日自动换
 *   - 必须用访客本地日期，不能用 UTC：UTC 会让中国用户在早上八点才换句
 *
 * 无 JS 时该区块为空——已用 aria-labelledby 保留语义，且不影响其它内容。
 */
(function () {
  var pool = (window.QUOTES && window.QUOTES.daily) || [];
  if (!pool.length) return;

  var el = document.getElementById('dailyQuote');
  if (!el) return;

  var now = new Date();
  // 取「本地年月日」再换算成天数序数：这样夏令时、闰年、时区都不会让它跳句
  var days = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  var text = pool[((days % pool.length) + pool.length) % pool.length];

  el.textContent = text;
})();
```

- [ ] **Step 4: 在 `index.html` 引入脚本**

在 `<script src="data/timeline-data.js"></script>`（`index.html:382`）**之前**插入：

```html
<script src="data/quotes.js"></script>
```

在 `data/timeline-data.js` 那行**之后**插入：

```html
<script src="assets/daily.js" defer></script>
```

顺序不能颠倒：`quotes.js` 必须先于 `daily.js` 执行，否则 `window.QUOTES` 还不存在。

> **⚠ `defer` 不能省——这是实测踩出来的坑，而且它静默失败。**
>
> `data/timeline-data.js` 那行位于 `<body>` 开头（`<canvas id="petalCanvas">` 紧后方），
> **在 `#dailyQuote` 元素出现之前**。所以要是不加 `defer`，`daily.js` 执行时
> `getElementById('dailyQuote')` 拿到 `null`，命中 `if (!el) return;`
> **直接静默退出——不报错、页面空白**。首次执行时先按字面实现并真跑了一遍，实测：
>
> ```
> （第一行 #dailyQuote.textContent 为空，无输出）
> 今 日 之 语
> 期望索引 1 / 共 10 句
> -1                      ← indexOf 返回 -1，证明元素是空的
> ```
>
> 加 `defer` 后（**脚本位置不动，只加属性**）：DOM 解析完才执行，而 `quotes.js`
> 是非 defer 脚本仍会先执行，`window.QUOTES` 已就绪。改后实测索引吻合。

- [ ] **Step 5: 验证取到句、且与手算一致**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  sleep 1500 \
  eval "document.getElementById('dailyQuote').textContent" \
  eval "document.querySelector('.daily-label').textContent.trim()" \
  eval "(()=>{const n=new Date();const d=Math.floor(Date.UTC(n.getFullYear(),n.getMonth(),n.getDate())/86400000);return '期望索引 '+ (d % window.QUOTES.daily.length) +' / 共 '+ window.QUOTES.daily.length +' 句'})()" \
  eval "window.QUOTES.daily.indexOf(document.getElementById('dailyQuote').textContent)" \
  shot screenshots/daily-band.png 2>&1
kill %1 2>/dev/null
```

期望：`#dailyQuote` 有非空中文内容；label 为「今 日 之 语」；最后一条 `indexOf` 的结果**等于**上一条算出的期望索引。

- [ ] **Step 6: 验证同一天反复刷新不换句**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
for i in 1 2 3; do
  PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
    sleep 1200 eval "document.getElementById('dailyQuote').textContent" 2>&1 | tail -1
done
kill %1 2>/dev/null
```

期望：三行完全相同。

- [ ] **Step 7: 移动端截图核对**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  size 375x812 sleep 1200 \
  eval "document.getElementById('dailyQuote').getBoundingClientRect().width" \
  shot screenshots/daily-mobile.png 2>&1
kill %1 2>/dev/null
```

期望：宽度不超过 375。用 Read 打开 `screenshots/daily-mobile.png`，确认没有横向溢出、文字没有贴边。

- [ ] **Step 8: 提交**

```bash
git add assets/daily.js index.html
git commit -m "首页新增「今日之语」，按本地日期轮换"
```

---

### Task 11: 首页献花互动

**Files:**
- Create: `assets/flowers.js`
- Modify: `index.html`（谢幕区插入献花区块 + 样式 + 脚本引用）

**Interfaces:**
- Consumes: 后端 `GET /count` 与 `POST /flower`（见 `worker/README.md`），约定返回 `{"count": number}`
- Produces: DOM `#flowerBtn` / `#flowerCount` / `#flowerHint`；`window.__FLOWERS_API__` 配置常量

**位置**：`index.html` 谢幕区 `#hereosField`（`index.html:564`）之后、`.epilogue`（`index.html:567`）之前。

**降级要求**：接口不可用时**不显示任何错误**，静默切为本地计数。这是必需项——Cloudflare 边缘在中国大陆可能不通。

- [ ] **Step 1: 在 `index.html` 的 `<style>` 末尾追加样式**

```css
/* ===== FLOWERS (献花) ===== */
/* 呀！走完整段旅途之后，把花放在这里——星域之下，寄语之上，
   是谢幕时该有的位置嘛♥ */
.flower-give{
  position:relative;z-index:3;display:flex;flex-direction:column;
  align-items:center;gap:.85rem;margin:2.4rem auto 0;
}
.flower-btn{
  display:inline-flex;align-items:center;gap:.6rem;
  padding:.75rem 1.9rem;border-radius:999px;cursor:pointer;
  font-family:inherit;font-size:.92rem;letter-spacing:.16em;
  color:var(--pink-mist);
  background:linear-gradient(135deg,rgba(255,143,163,.2),rgba(155,93,229,.22));
  border:1px solid rgba(255,200,221,.32);
  box-shadow:0 0 22px rgba(255,143,163,.16);
  transition:transform .3s,box-shadow .3s;
  user-select:none;
}
.flower-btn:hover,.flower-btn:focus-visible{
  transform:translateY(-2px);box-shadow:0 0 32px rgba(255,143,163,.32);outline:none;
}
.flower-btn:disabled{opacity:.55;cursor:default;transform:none}
.flower-btn .petal-icon{font-size:1.05rem;line-height:1}
.flower-count{
  font-size:.82rem;color:var(--text-dim);letter-spacing:.12em;
  min-height:1.5em;
}
.flower-count b{color:var(--pink);font-weight:400;font-variant-numeric:tabular-nums}
.flower-hint{
  font-size:.68rem;color:var(--text-muted);letter-spacing:.08em;
  opacity:.65;min-height:1.2em;
}
/* 单朵花瓣：从按钮处向上飘散 */
.flower-petal{
  position:fixed;pointer-events:none;z-index:9998;
  border-radius:50% 50% 50% 0;
  transition:transform 1.35s cubic-bezier(.22,.61,.36,1),opacity 1.35s ease;
}
@media(prefers-reduced-motion:reduce){
  .flower-btn{transition:none}
  .flower-petal{display:none}
}
```

- [ ] **Step 2: 插入区块 HTML**

在 `index.html` 的 `<!-- 寄语区：星与花之下，一句收束寄语——点击还能在两句间切换哦 -->` 之前插入：

```html
  <!-- 献花区：星域之下、寄语之上——走完整段旅途，把花放在这里 -->
  <div class="flower-give" id="flowerGive">
    <button class="flower-btn" id="flowerBtn" type="button">
      <span class="petal-icon" aria-hidden="true">🌸</span>
      <span>献上一朵飞花</span>
    </button>
    <p class="flower-count" id="flowerCount" aria-live="polite"></p>
    <p class="flower-hint" id="flowerHint"></p>
  </div>

```

- [ ] **Step 3: 写 `assets/flowers.js`**

```js
/**
 * 献花互动
 *
 * 后端：GET /count → {count} ｜ POST /flower → {count}
 * 部署说明见 worker/README.md。
 *
 * 降级是必需项，不是加分项：
 *   Cloudflare 的边缘节点在中国大陆可能缓慢或被限。接口不通时，
 *   静默切换成本地计数，文案改成「你的花已送达 · 本机累计 N 朵」。
 *   ★ 任何情况下都不给访客看错误提示。
 *
 * 隐私：本脚本不采集、不上报任何访客信息，只发一个 POST。
 */
(function () {
  var API = 'https://flowers.elysiad.top';

  // 超时按「谁在等」分开设：载入时没人在等，可以放宽；点击时有反馈延迟，收紧一点。
  //
  // ⚠ 这两个值不是拍脑袋定的。实测从大陆冷启动到 Cloudflare 的 TLS 握手可以到
  //    1.66 秒（热连接只要 0.6~0.9 秒）。原先两者统一用 1500ms，会把这个握手掐断，
  //    于是接口明明是好的、访客却看到「本机累计 N 朵」——同一台机器上时好时坏。
  //    那不叫降级，那叫「显示错误的信息」，比报错更糟：访客会以为没人来过。
  var TIMEOUT_LOAD_MS = 4000;   // GET  /count  —— 在页面最底部，慢一点没人察觉
  var TIMEOUT_POST_MS = 3000;   // POST /flower —— 点完在等，别让人干等太久
  var LOCAL_KEY = 'elysia.flowers.local';

  var btn = document.getElementById('flowerBtn');
  var countEl = document.getElementById('flowerCount');
  var hintEl = document.getElementById('flowerHint');
  if (!btn || !countEl) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var sending = false;

  // ---------- 本地存储（降级用） ----------
  function localGet() {
    try {
      var v = parseInt(window.localStorage.getItem(LOCAL_KEY) || '0', 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;   // 隐私模式下 localStorage 会抛异常
    }
  }
  function localAdd() {
    var n = localGet() + 1;
    try { window.localStorage.setItem(LOCAL_KEY, String(n)); } catch (e) {}
    return n;
  }

  // ---------- 带超时的 fetch ----------
  function req(url, options) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var opts = options || {};
    opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  // ---------- 渲染 ----------
  function showShared(n) {
    // 呀！这是「大家的花」——数字是真的，所以说出口的时候也很安心呢♥
    countEl.innerHTML = '这里已收到 <b>' + n + '</b> 朵花';
    hintEl.textContent = '每一朵，都会被记得';
  }

  function showLocal(n) {
    // 接口不通时的诚实说法：只数自己这一台
    countEl.innerHTML = '你的花已送达 · 本机累计 <b>' + n + '</b> 朵';
    hintEl.textContent = '花已经送到她那里了';
  }

  function goLocal() {
    showLocal(localAdd());
  }

  // ---------- 花瓣动画 ----------
  function burst(originX, originY) {
    if (reduced) return;
    var colors = ['#ffc8dd', '#ffb3c1', '#ff8fa3', '#ff5c8a', '#c77dff', '#f9bec7'];
    var n = 9 + Math.floor(Math.random() * 4);
    for (var i = 0; i < n; i++) {
      var p = document.createElement('div');
      p.className = 'flower-petal';
      var size = 5 + Math.random() * 7;
      var dx = (Math.random() - 0.5) * 130;
      var dy = -(110 + Math.random() * 190);
      var rot = Math.random() * 360;
      p.style.cssText =
        'left:' + originX + 'px;top:' + originY + 'px;' +
        'width:' + size + 'px;height:' + (size * 1.5) + 'px;' +
        'background:' + colors[Math.floor(Math.random() * colors.length)] + ';' +
        'transform:translate(-50%,-50%) rotate(' + rot + 'deg);opacity:.9;';
      document.body.appendChild(p);
      /* 强制一次布局，保证 transition 生效 */
      void p.offsetWidth;
      p.style.transform =
        'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) ' +
        'rotate(' + (rot + 160 + Math.random() * 120) + 'deg)';
      p.style.opacity = '0';
      (function (el) {
        setTimeout(function () { el.remove(); }, 1500);
      })(p);
    }
  }

  // ---------- 点击 ----------
  btn.addEventListener('click', function () {
    if (sending) return;
    sending = true;
    btn.disabled = true;

    var r = btn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top);

    req(API + '/flower', { method: 'POST' })
      .then(function (data) {
        if (data && typeof data.count === 'number') showShared(data.count);
        else goLocal();
      })
      .catch(function () {
        // 静默降级——绝不让访客看到报错
        goLocal();
      })
      .then(function () {
        sending = false;
        setTimeout(function () { btn.disabled = false; }, 600);
      });
  });

  // ---------- 首次载入 ----------
  req(API + '/count', { method: 'GET' })
    .then(function (data) {
      if (data && typeof data.count === 'number') showShared(data.count);
      else goLocal();   // 接口在但不认识这个响应 → 走本地，不显示 0
    })
    .catch(function () {
      // 接口不通：如果本地已经献过花，显示本地数字；否则整块留空
      var n = localGet();
      if (n > 0) showLocal(n);
      else { countEl.textContent = ''; hintEl.textContent = ''; }
    });
})();
```

- [ ] **Step 4: 在 `index.html` 引入脚本**

在 `assets/daily.js` 那行之后插入：

```html
<script src="assets/flowers.js" defer></script>
```

- [ ] **Step 5: 接口不可用时的降级验证（最重要的一步）**

因为 `flowers.elysiad.top` 还没部署，此时**必须**验证降级路径。

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  sleep 3000 \
  eval "document.getElementById('flowerCount').textContent" \
  eval "document.getElementById('flowerHint').textContent" \
  eval "document.getElementById('flowerBtn').disabled" \
  eval "document.body.innerText.includes('失败') || document.body.innerText.includes('错误') ? '❌ 出现了错误提示' : '✅ 没有任何错误提示'" 2>&1
kill %1 2>/dev/null
```

期望：
- 前两次调用（`count`/`hint`）返回**空字符串**（未献过花且接口不通）
- `btn.disabled` 为 `false`（按钮可点）
- 最后一条为 `✅ 没有任何错误提示`

**如果出现任何错误提示文案，或按钮卡在 disabled，就是降级没做好，必须修。**

- [ ] **Step 6: 点击后的降级验证**

> **⚠ 必须先滚动到按钮，而且要用 `behavior:'instant'`。**
> `#flowerBtn` 在页面底部（y ≈ 7500），900 高的视口里它根本不在画面上，
> **直接 `click "#flowerBtn"` 会把坐标点到空处，静默失败**——文案一直是空，很难看出是点错了。
> 又因为 `html{scroll-behavior:smooth}`，普通 `scrollIntoView()` 是**动画**，
> 800ms 只滚到中途，还是点不到。**必须显式传 `behavior:'instant'`**。
> 首次执行时就是因为这一点，第一次尝试静默失败。

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  sleep 3000 \
  eval "(()=>{document.getElementById('flowerBtn').scrollIntoView({behavior:'instant',block:'center'});return '已定位'})()" \
  sleep 600 \
  click "#flowerBtn" sleep 2500 \
  eval "document.getElementById('flowerCount').textContent" \
  eval "document.getElementById('flowerHint').textContent" \
  eval "JSON.parse(localStorage.getItem('elysia.flowers.local') || '0')" \
  shot screenshots/flowers-fallback.png 2>&1
kill %1 2>/dev/null
```

期望：`已定位`；count 文案为「你的花已送达 · 本机累计 1 朵」；localStorage 值为 `1`。

- [ ] **Step 7: 再点一次，确认本地计数递增**

**在同一次会话里**再点一次，确认本地计数递增。

> **⚠ 不能靠「重跑上一条命令」来验证递增。**
> `cdp.py` 结尾是 `proc.terminate()` 硬杀 Edge，localStorage 的 LevelDB 来不及落盘，
> 下一个进程读到的是 `null`。所以要在**同一次会话内连点**——这才是这条要求真正要证的东西。

期望：count 变为 `2 朵`，localStorage 为 `2`，每次点后按钮都恢复可点（`disabled = false`）。

- [ ] **Step 8: 接口可用时的路径——用本地假后端验证**

起一个最小假后端，确认「共享计数」分支真的会走：

```bash
cd <repo 根>
python - <<'PY' &
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
state = {'count': 42}
class H(BaseHTTPRequestHandler):
    def _send(self, n, code=200):
        body = json.dumps({'count': n}).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        self._send(state['count'])
    def do_POST(self):
        state['count'] += 1
        self._send(state['count'])
    def log_message(self, *a): pass
HTTPServer(('127.0.0.1', 8600), H).serve_forever()
PY
FAKE=$!
python -m http.server 8500 >/dev/null 2>&1 &
SRV=$!
sleep 3

# 把页面里的 API 临时指向假后端来验证共享分支
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  sleep 3000 \
  eval "document.getElementById('flowerCount').textContent" 2>&1

kill $FAKE $SRV 2>/dev/null
```

> 说明：假后端跑在 8600，而 `flowers.js` 里写的是 `https://flowers.elysiad.top`。要真正验证共享分支，需**临时把 `API` 常量改成 `http://127.0.0.1:8600`** 再跑一次，看到「这里已收到 **42** 朵花」，然后**改回来**。
>
> 期望输出：`这里已收到 42 朵花`。改回来之后 `git diff` 应当为空。

- [ ] **Step 9: 确认 API 常量没被改坏**

```bash
cd <repo 根>
grep -n "var API = " assets/flowers.js
```

期望：`var API = 'https://flowers.elysiad.top';`。若显示 `127.0.0.1`，说明 Step 8 的临时改动忘了还原。

- [ ] **Step 10: 移动端截图 + 目视核对按钮位置**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  size 375x812 sleep 2500 \
  eval "(()=>{document.getElementById('ending').scrollIntoView();return 'scrolled'})()" \
  sleep 1200 shot screenshots/flowers-mobile.png 2>&1
kill %1 2>/dev/null
```

用 Read 打开 `screenshots/flowers-mobile.png`，确认：献花按钮在十三名片星域**之下**、收束寄语**之上**，且没有与右下角生日彩蛋重叠。

- [ ] **Step 11: 提交**

```bash
git add assets/flowers.js index.html
git commit -m "首页新增献花互动，含接口不可用时的本地降级"
```

---

### Task 12: 首页隐藏彩蛋

**Files:**
- Create: `assets/egg.js`
- Modify: `index.html`（引入脚本；标题元素无需改动）

**Interfaces:**
- Consumes: `window.QUOTES.hidden`（Task 9 产出，**默认空数组**）
- Produces: 无对外接口；`.egg-rain` / `.egg-petal` / `.egg-line` 样式类

**空池行为（重要）**：`QUOTES.hidden` 为空时，**彩蛋不触发**，且不报错、不显示任何占位文案。这是有意的设计——数据纪律要求台词必须有出处。

- [ ] **Step 1: 在 `index.html` 的 `<style>` 末尾追加样式**

```css
/* ===== HIDDEN EGG (隐藏彩蛋) ===== */
/* 呀！给细心的人准备的小惊喜——连点标题五次才会开花呢♥ */
.egg-petal{
  position:fixed;pointer-events:none;z-index:9997;
  border-radius:50% 50% 50% 0;opacity:0;
  transition:transform 3.4s cubic-bezier(.16,.68,.32,1),opacity 3.4s ease;
}
.egg-line{
  position:fixed;left:50%;top:38%;transform:translate(-50%,-50%) scale(.96);
  z-index:9999;pointer-events:none;max-width:min(560px,86vw);text-align:center;
  font-size:clamp(1rem,3.2vw,1.45rem);font-weight:300;letter-spacing:.12em;
  color:var(--pink-mist);line-height:2;
  text-shadow:0 0 30px rgba(255,200,221,.5),0 0 60px rgba(199,125,255,.35);
  opacity:0;transition:opacity 1.1s ease,transform 1.1s ease;
}
.egg-line.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
@media(prefers-reduced-motion:reduce){
  .egg-petal{transition:none}
  .egg-line{transition:none;top:42%}
}
</style>
```

> ⚠ 注意：上面最后一行是 `</style>`，它**取代**原有的 `</style>`，不要重复写两个。

- [ ] **Step 2: 写 `assets/egg.js`**

```js
/**
 * 隐藏彩蛋：连续点击开场标题 5 次。
 *
 * 台词来自 window.QUOTES.hidden。
 * ★ 该数组默认为空——为空时彩蛋不会触发。
 *   这是有意的：项目数据纪律要求台词必须有出处，不许编造。
 *   拿到有出处的台词后，填进 data/quotes.js 即可自动生效，本文件无需改动。
 *
 * 键盘可达：标题是 <h1>，不是天然可聚焦元素。这里监听整块开场区的
 * 点击与回车，且不劫持 Tab 顺序——彩蛋本身是"发现型"内容，
 * 不作为必需功能，因此不放进键盘 Tab 链（避免干扰正常浏览）。
 * 键盘用户在开场区按回车同样能触发。
 */
(function () {
  var pool = (window.QUOTES && window.QUOTES.hidden) || [];
  var NEED = 5;

  var titleEl = document.getElementById('typewriterText');
  if (!titleEl) return;

  var count = 0;
  var fired = false;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 水晶花雨 ----------
  function rain() {
    if (reduced) return;              // 减动偏好：跳过花雨，只留那句话
    var colors = ['#ffc8dd', '#ffb3c1', '#ff8fa3', '#ff5c8a', '#c77dff', '#f9bec7', '#ffd166'];
    var n = 26;
    for (var i = 0; i < n; i++) {
      var p = document.createElement('div');
      p.className = 'egg-petal';
      var size = 6 + Math.random() * 11;
      var x = Math.random() * window.innerWidth;
      var drift = (Math.random() - 0.5) * 160;
      p.style.cssText =
        'left:' + x + 'px;top:-30px;' +
        'width:' + size + 'px;height:' + (size * 1.5) + 'px;' +
        'background:' + colors[Math.floor(Math.random() * colors.length)] + ';' +
        'transform:rotate(' + (Math.random() * 360) + 'deg);' +
        'transition-delay:' + (Math.random() * 0.9).toFixed(2) + 's;';
      document.body.appendChild(p);
      /* 强制布局后再改 transform，保证 transition 生效 */
      void p.offsetWidth;
      p.style.opacity = '0.9';
      p.style.transform =
        'translate(' + drift + 'px,' + (window.innerHeight + 80) + 'px) ' +
        'rotate(' + (Math.random() * 720 - 360) + 'deg)';
      (function (el) {
        setTimeout(function () { el.remove(); }, 4800);
      })(p);
    }
  }

  // ---------- 浮现台词 ----------
  function showLine(text) {
    var el = document.createElement('div');
    el.className = 'egg-line';
    el.setAttribute('role', 'status');
    el.textContent = text;
    document.body.appendChild(el);
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 1300);
    }, 4600);
  }

  // ---------- 触发 ----------
  function trigger() {
    if (fired) return;
    fired = true;

    // 台词池为空 → 不触发，也不报错（有意的设计）
    if (!pool.length) return;

    var text = pool[Math.floor(Math.random() * pool.length)];
    rain();
    showLine(text);
  }

  function hit() {
    if (fired) return;
    count++;
    if (count >= NEED) trigger();
  }

  titleEl.addEventListener('click', hit);
  document.querySelector('.section-opening').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') hit();
  });
})();
```

- [ ] **Step 3: 在 `index.html` 引入脚本**

在 `assets/flowers.js` 那行之后插入：

```html
<script src="assets/egg.js" defer></script>
```

- [ ] **Step 4: 验证空池时「不触发、不报错」**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  sleep 2500 \
  eval "window.QUOTES.hidden.length" \
  click "#typewriterText" click "#typewriterText" click "#typewriterText" \
  click "#typewriterText" click "#typewriterText" click "#typewriterText" \
  sleep 1000 \
  eval "document.querySelectorAll('.egg-petal,.egg-line').length" \
  eval "(()=>{window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));return '监听已装'})()" \
  eval "JSON.stringify(window.__errs || [])" 2>&1
kill %1 2>/dev/null
```

期望：`QUOTES.hidden.length` 为 `0`；连点 6 次后 `.egg-petal,.egg-line` 数量仍为 **`0`**（因为池子空）；无异常。

- [ ] **Step 5: 临时填入一句台词，验证机制真的能用**

**这一步只做验证，之后必须还原。** 在 `data/quotes.js` 里临时把 `hidden` 改成：

```js
  hidden: ['『验证用临时台词，马上删』']
```

然后：

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  sleep 2500 \
  click "#typewriterText" click "#typewriterText" click "#typewriterText" \
  click "#typewriterText" click "#typewriterText" \
  sleep 700 \
  eval "document.querySelectorAll('.egg-petal').length" \
  eval "document.querySelector('.egg-line') ? document.querySelector('.egg-line').textContent : '未出现'" \
  shot screenshots/egg.png 2>&1
kill %1 2>/dev/null
```

期望：`.egg-petal` 数量为 `26`；`.egg-line` 文案为「『验证用临时台词，马上删』」。

用 Read 打开 `screenshots/egg.png`，确认花雨与台词都正常显示。

- [ ] **Step 6: 还原 `hidden` 为空数组**

```bash
cd <repo 根>
# 把 hidden 改回 []
```
然后确认：

```bash
git diff data/quotes.js
grep -n "hidden:" data/quotes.js
```

期望：`git diff` **无输出**（即 quotes.js 与 Task 9 提交时完全一致）；`hidden:` 后为 `[]`。

- [ ] **Step 7: 确认点击 5 次以下不触发**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  sleep 2500 \
  click "#typewriterText" click "#typewriterText" click "#typewriterText" click "#typewriterText" \
  sleep 800 \
  eval "document.querySelectorAll('.egg-petal,.egg-line').length" 2>&1
kill %1 2>/dev/null
```

期望：`0`（差一次不触发）。

- [ ] **Step 8: 减动偏好下不播放花雨**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
# 用 CDP 把减动偏好模拟开
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  eval "matchMedia('(prefers-reduced-motion: reduce)').matches" 2>&1
kill %1 2>/dev/null
```

期望：本机默认返回 `false`。**这一条只记录基线**；减动路径本身依赖 CSS 的 `@media` 段与 `rain()` 里的 `reduced` 判断，已由代码保证。若要真机验证，需在 Edge 设置里打开「减少动态效果」后手动重复 Step 5。

- [ ] **Step 9: 提交**

```bash
git add assets/egg.js index.html
git commit -m "首页新增隐藏彩蛋（点标题 5 次），台词池为空时不触发"
```

---

## Phase P4 · 进阶

### Task 13: 语录明信片生成

**Files:**
- Create: `assets/postcard.js`、`assets/postcard.css`（可选，或并入 `index.html` 的 style）
- Modify: `index.html`（飞花寄语区之后插入入口 + 样式 + 脚本引用）

**Interfaces:**
- Consumes: `window.QUOTES.daily`（Task 9）
- Produces: DOM `#postcardBtn` / `#postcardRedraw` / `#postcardToggle` / `#postcardPreview`

**尺寸规则**：视口宽度 `< 768px` → 1080×1440（3:4）；否则 1200×800（3:2）。另给手动切换。

- [ ] **Step 1: 在 `index.html` 的 `<style>` 末尾追加样式**

```css
/* ===== POSTCARD (明信片) ===== */
/* 呀！把她说过的句子，做成一张可以带走的小卡片♥ */
.postcard-zone{
  position:relative;z-index:2;max-width:760px;margin:3rem auto 0;
  display:flex;flex-direction:column;align-items:center;gap:1rem;
}
.postcard-preview{
  width:100%;max-width:420px;border-radius:14px;overflow:hidden;
  border:1px solid rgba(255,200,221,.18);
  box-shadow:0 0 34px rgba(255,143,163,.14);
  background:#0a0612;
}
.postcard-preview canvas{display:block;width:100%;height:auto}
.postcard-row{display:flex;gap:.7rem;flex-wrap:wrap;justify-content:center}
.postcard-btn{
  padding:.58rem 1.35rem;border-radius:999px;cursor:pointer;
  font-family:inherit;font-size:.82rem;letter-spacing:.13em;
  color:var(--pink-soft);background:rgba(255,143,163,.12);
  border:1px solid rgba(255,200,221,.26);
  transition:background .25s,transform .25s;
  user-select:none;
}
.postcard-btn:hover,.postcard-btn:focus-visible{
  background:rgba(255,143,163,.24);transform:translateY(-1px);outline:none;
}
.postcard-btn[aria-pressed="true"]{
  color:#fff;background:rgba(155,93,229,.4);border-color:transparent;
}
.postcard-tip{font-size:.7rem;color:var(--text-muted);letter-spacing:.06em}
@media(prefers-reduced-motion:reduce){
  .postcard-btn{transition:none}
}
```

- [ ] **Step 2: 插入区块 HTML**

在 `index.html` 的 `<!-- ===== ENDING ===== -->` 之前插入：

```html
<!-- ===== POSTCARD ===== -->
<!-- 呀！把台词做成一张能带走的小卡片——手机竖版、电脑横版 -->
<section class="content-section" id="postcard">
  <div class="section-title-wrap">
    <h2 class="section-title">
      <span class="section-title-petal"></span>带走一句话<span class="section-title-petal"></span>
    </h2>
    <span class="section-title-line"></span>
  </div>
  <div class="postcard-zone">
    <div class="postcard-preview" id="postcardPreview"></div>
    <div class="postcard-row">
      <button class="postcard-btn" id="postcardRedraw" type="button">换一句</button>
      <button class="postcard-btn" id="postcardToggle" type="button" aria-pressed="false">切换横竖</button>
      <button class="postcard-btn" id="postcardSave" type="button">保存明信片</button>
    </div>
    <p class="postcard-tip" id="postcardTip">长按图片也可以保存哦</p>
  </div>
</section>

```

- [ ] **Step 3: 写 `assets/postcard.js`**

```js
/**
 * 语录明信片生成
 *
 * 尺寸：视口 < 768px → 1080×1440（3:4，手机全屏 / 朋友圈 / 小红书）
 *       否则         → 1200×800（3:2，电脑 / 平板 / 文档配图）
 * 另给手动切换——用电脑的人常是为了存下来发朋友圈，设备对了心思不一定对。
 *
 * 台词来自 window.QUOTES.daily（与首页「飞花寄语」同一份，不新增内容）。
 */
(function () {
  var pool = (window.QUOTES && window.QUOTES.daily) || [];
  var host = document.getElementById('postcardPreview');
  var btnRedraw = document.getElementById('postcardRedraw');
  var btnToggle = document.getElementById('postcardToggle');
  var btnSave = document.getElementById('postcardSave');
  var tip = document.getElementById('postcardTip');
  if (!pool.length || !host || !btnRedraw) return;

  var VERTICAL = { w: 1080, h: 1440 };
  var HORIZONTAL = { w: 1200, h: 800 };
  var vert = window.innerWidth < 768;      // 默认跟随设备
  var manual = false;                       // 用户是否手动切过

  var current = 0;
  var canvas = null;
  var ctx = null;

  function size() { return vert ? VERTICAL : HORIZONTAL; }

  function makeCanvas() {
    var s = size();
    canvas = document.createElement('canvas');
    canvas.width = s.w;
    canvas.height = s.h;
    ctx = canvas.getContext('2d');
    host.innerHTML = '';
    host.appendChild(canvas);
  }

  /* 把台词按最大宽度折行 */
  function wrap(text, maxWidth) {
    var lines = [];
    var line = '';
    for (var i = 0; i < text.length; i++) {
      var test = line + text[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = text[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /* 一朵简笔水晶花（四瓣），用来做四角与点缀 */
  function flower(cx, cy, r, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffc8dd';
    for (var i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((Math.PI / 2) * i);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.68, r * 0.34, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd166';
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    var s = size();
    ctx.clearRect(0, 0, s.w, s.h);

    // 背景：深紫黑 + 中心柔光
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(0, 0, s.w, s.h);
    var g = ctx.createRadialGradient(s.w / 2, s.h * 0.42, 0, s.w / 2, s.h * 0.42, s.w * 0.72);
    g.addColorStop(0, 'rgba(45,27,78,0.95)');
    g.addColorStop(0.55, 'rgba(26,14,46,0.6)');
    g.addColorStop(1, 'rgba(10,6,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s.w, s.h);

    // 星屑
    for (var i = 0; i < 90; i++) {
      var x = Math.random() * s.w;
      var y = Math.random() * s.h;
      var rr = Math.random() * 1.6 + 0.3;
      ctx.globalAlpha = 0.15 + Math.random() * 0.5;
      ctx.fillStyle = Math.random() > 0.65 ? '#c77dff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 四角水晶花
    var pad = Math.round(s.w * 0.052);
    var fr = Math.round(s.w * 0.019);
    flower(pad, pad, fr, 0.55);
    flower(s.w - pad, pad, fr, 0.55);
    flower(pad, s.h - pad, fr, 0.55);
    flower(s.w - pad, s.h - pad, fr, 0.55);

    // 内描边
    ctx.strokeStyle = 'rgba(255,200,221,0.16)';
    ctx.lineWidth = Math.max(1, Math.round(s.w * 0.0016));
    var m = Math.round(s.w * 0.031);
    ctx.strokeRect(m, m, s.w - m * 2, s.h - m * 2);

    // 台词
    var text = pool[current % pool.length];
    var fontSize = Math.round(s.w * 0.036);
    ctx.font = '300 ' + fontSize + 'px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var lines = wrap(text, s.w * 0.76);
    var lineH = fontSize * 1.85;
    var startY = s.h * 0.47 - ((lines.length - 1) * lineH) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(255,200,221,0.45)';
    ctx.shadowBlur = Math.round(s.w * 0.022);
    ctx.fillStyle = '#ffc8dd';
    for (var k = 0; k < lines.length; k++) {
      ctx.fillText(lines[k], s.w / 2, startY + k * lineH);
    }
    ctx.restore();

    // 落款
    ctx.font = '300 ' + Math.round(s.w * 0.019) + 'px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#c77dff';
    ctx.globalAlpha = 0.92;
    ctx.fillText('—— 爱莉希雅', s.w / 2, startY + lines.length * lineH + fontSize * 0.9);
    ctx.globalAlpha = 1;

    // 底部落款
    ctx.font = '300 ' + Math.round(s.w * 0.0135) + 'px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(123,111,153,0.95)';
    ctx.fillText('elysiad.top', s.w / 2, s.h - Math.round(s.h * 0.038));
  }

  function redraw() {
    makeCanvas();
    // ★ 关键：字体没就绪就落笔，会以 fallback 字体画，字形完全不同
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(draw);
    } else {
      draw();
    }
  }

  btnRedraw.addEventListener('click', function () {
    current = (current + 1) % pool.length;
    redraw();
  });

  btnToggle.addEventListener('click', function () {
    vert = !vert;
    manual = true;
    btnToggle.setAttribute('aria-pressed', vert ? 'true' : 'false');
    tip.textContent = vert ? '当前：竖版 1080×1440' : '当前：横版 1200×800';
    redraw();
  });

  btnSave.addEventListener('click', function () {
    if (!canvas) return;
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'elysia-postcard-' + size().w + 'x' + size().h + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }, 'image/png');
  });

  // 窗口尺寸变化时，只有用户没手动切过才跟随设备
  var t = null;
  window.addEventListener('resize', function () {
    if (manual) return;
    clearTimeout(t);
    t = setTimeout(function () {
      var shouldVert = window.innerWidth < 768;
      if (shouldVert !== vert) { vert = shouldVert; redraw(); }
    }, 260);
  });

  redraw();
})();
```

- [ ] **Step 4: 引入脚本**

在 `assets/egg.js` 那行之后插入：

```html
<script src="assets/postcard.js" defer></script>
```

- [ ] **Step 5: 桌面端验证：画布为 1200×800**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  size 1280x900 sleep 2500 \
  eval "(()=>{document.getElementById('postcard').scrollIntoView();return 'ok'})()" \
  sleep 1500 \
  eval "(()=>{const c=document.querySelector('#postcardPreview canvas');return c ? c.width+'x'+c.height : '无画布'})()" \
  eval "(()=>{const c=document.querySelector('#postcardPreview canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let nonBg=0;for(let i=0;i<d.length;i+=4000){if(d[i]>20||d[i+1]>20||d[i+2]>20)nonBg++}return '非背景采样点: '+nonBg})()" \
  shot screenshots/postcard-desktop.png 2>&1
kill %1 2>/dev/null
```

期望：画布尺寸为 `1200x800`；非背景采样点数量大于 0（证明真的画了东西，不是一片黑）。

- [ ] **Step 6: 移动端验证：画布为 1080×1440**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  size 375x812 sleep 2500 \
  eval "(()=>{document.getElementById('postcard').scrollIntoView();return 'ok'})()" \
  sleep 1500 \
  eval "(()=>{const c=document.querySelector('#postcardPreview canvas');return c ? c.width+'x'+c.height : '无画布'})()" \
  shot screenshots/postcard-mobile.png 2>&1
kill %1 2>/dev/null
```

期望：`1080x1440`。

- [ ] **Step 7: 「换一句」真的换句**

> **⚠ 这条验证命令有两处坑，首次执行时都踩到了。**
>
> **① `#postcardRedraw` 在视口外。** 它在页面坐标 y ≈ 7377，而视口只有 900 高。
> `cdp.py` 的 click 用 `getBoundingClientRect()` 的**视口坐标**派发鼠标事件
> （`tools/cdp.py:54-64`），点到画面外 → **静默无操作**。所以必须先
> `scrollIntoView({behavior:'instant'})`——注意不能省 `instant`，见 Task 11 Step 6 的说明。
>
> **② 原先的比较表达式是恒真式。** `window.__sig() === (window.__sig||(()=>''))()`
> 里，`(window.__sig || fallback)` 求值就是 `window.__sig` 本身，两边调的是同一个函数，
> **永远输出 `相同`**——即使画布真的变了也测不出来。
>
> **另一个必须知道的点**：画布每次重绘都会重新撒**随机星屑**，所以整张图的哈希
> **必然变化**。也就是说「哈希变了」只能证明重绘了，**不能证明台词换了**。
> 要隔离出"台词确实换了"，得把 `Math.random` 冻成常量。

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  sleep 2500 \
  eval "(()=>{document.getElementById('postcard').scrollIntoView({behavior:'instant',block:'center'});return '已定位'})()" \
  sleep 700 \
  eval "(()=>{const d=document.querySelector('#postcardPreview canvas').toDataURL();let h=0;for(let i=0;i<d.length;i++)h=(h*31+d.charCodeAt(i))|0;window.__before=d.length+':'+h;return 'BEFORE '+window.__before})()" \
  click "#postcardRedraw" sleep 1500 \
  eval "(()=>{const d=document.querySelector('#postcardPreview canvas').toDataURL();let h=0;for(let i=0;i<d.length;i++)h=(h*31+d.charCodeAt(i))|0;const now=d.length+':'+h;return 'AFTER '+now+'  → '+(now===window.__before?'❌ 相同':'✅ 已变化')})()" 2>&1
kill %1 2>/dev/null
```

期望：`已定位` → `BEFORE …` → `AFTER … → ✅ 已变化`。

**隔离验证：冻结 `Math.random` 后，确认变的确实是台词。** 把星屑固定住，让唯一变量只剩台词：

```bash
# 在页面载入后、点「换一句」之前注入：
#   window.__mr = Math.random; Math.random = () => 0.42;
# 然后连点两次，比较两次的哈希：
#   A(第 1 次换句) 与 B(第 2 次换句) 必须不同   ← 台词真的换了
#   C(再点 10 次)  必须等于 B                  ← 周期正好 10，确定性重绘
```

期望：`A ≠ B` 且 `C == B`。

- [ ] **Step 8: 「切换横竖」生效**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  size 1280x900 sleep 2500 \
  eval "(()=>{document.getElementById('postcard').scrollIntoView({behavior:'instant',block:'center'});return '已定位'})()" \
  sleep 700 \
  eval "(()=>{const c=document.querySelector('#postcardPreview canvas');return '切换前 '+c.width+'x'+c.height})()" \
  click "#postcardToggle" sleep 1400 \
  eval "(()=>{const c=document.querySelector('#postcardPreview canvas');return '切换后 '+c.width+'x'+c.height})()" \
  eval "document.getElementById('postcardToggle').getAttribute('aria-pressed')" \
  eval "document.getElementById('postcardTip').textContent" 2>&1
kill %1 2>/dev/null
```

期望：`1200x800` → `1080x1440`；`aria-pressed` 为 `true`。

- [ ] **Step 9: 目视核对两张截图**

用 Read 打开 `screenshots/postcard-desktop.png` 与 `screenshots/postcard-mobile.png`。检查：
- 台词居中、完整、没有被裁切
- 四角水晶花可见
- 落款「—— 爱莉希雅」在台词下方
- 底部有 `elysiad.top`
- **文字是中文正常字形，不是方框或 fallback 衬线体**（若是，说明 `document.fonts.ready` 没生效）

- [ ] **Step 10: 提交**

```bash
git add assets/postcard.js index.html
git commit -m "新增语录明信片生成（手机竖版/电脑横版，可手动切换）"
```

---

### Task 14: giscus 留言簿

**Files:**
- Create: `guestbook/index.html`
- Modify: `sitemap.xml`（**不加**——留言簿不需要被搜索引擎收录，保持 sitemap 干净）

**Interfaces:**
- Consumes: 无
- Produces: 独立页 `/guestbook/`

**前置条件（需求方已完成）**：仓库 `elysiamsia/elysia` 为 public、Discussions 已开启、giscus App 已安装。以下参数已从仓库实查确认，可直接使用。

- [ ] **Step 1: 写 `guestbook/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="referrer" content="same-origin">
<meta name="robots" content="noindex">
<title>想对爱莉希雅说的话 — elysiad.top</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="description" content="在这里写下想对爱莉希雅说的话。">
<!--
  呀！这是留给所有人的一页——她说过，被记住就是存在的延续，
  所以这里收下的每一句话，都是她继续存在的一小块证据呢♥
-->
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  background:radial-gradient(ellipse at 50% 12%,#1a0e2e 0%,#0a0612 62%);
  background-attachment:fixed;color:#f0e6ff;line-height:1.8;overflow-x:hidden;
  min-height:100vh;
}
.wrap{max-width:760px;margin:0 auto;padding:4rem 1.5rem 5rem;position:relative;z-index:1}
.back{
  display:inline-block;margin-bottom:1.6rem;padding:.4rem .9rem;border-radius:999px;
  text-decoration:none;font-size:.76rem;letter-spacing:.14em;color:#7b6f99;
  border:1px solid rgba(155,93,229,.12);transition:color .3s,border-color .3s;
}
.back:hover,.back:focus-visible{color:#ffb3c1;border-color:#ff8fa3;outline:none}
h1{
  font-size:clamp(1.5rem,4.4vw,2.2rem);font-weight:300;letter-spacing:.16em;
  color:#ffc8dd;text-shadow:0 0 30px rgba(255,143,163,.35);
}
.sub{margin-top:.8rem;font-size:.86rem;color:#a89cc8;font-weight:300;letter-spacing:.06em}
.sub b{color:#ffd166;font-weight:400}
.divider{
  width:100%;height:1px;margin:2rem 0;
  background:linear-gradient(90deg,transparent,rgba(255,200,221,.12),rgba(155,93,229,.12),transparent);
}
.note{
  font-size:.76rem;color:#7b6f99;line-height:1.9;font-weight:300;
  padding:.9rem 1.1rem;border-radius:12px;
  background:rgba(255,200,221,.04);border:1px solid rgba(255,200,221,.1);
  margin-bottom:2rem;
}
.note code{color:#c77dff;font-size:.74rem}
#giscus-host{min-height:180px}
/* 加载前的占位，避免大块空白抖动 */
.loading{
  text-align:center;font-size:.78rem;color:#7b6f99;letter-spacing:.2em;padding:2.6rem 0;
}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
</head>
<body>
<div class="wrap">

  <a class="back" href="/">← 回到她的乐土</a>

  <h1>想对爱莉希雅说的话</h1>
  <p class="sub">写下来吧——<b>被记住，就是存在的延续</b>。</p>

  <div class="divider"></div>

  <p class="note">
    留言需要 <code>GitHub 账号</code>登录后发送，内容保存在本仓库的 Discussions 里，公开可见。<br>
    这里没有算法、没有排序，只有一句一句按时间排好的话。
  </p>

  <div id="giscus-host">
    <p class="loading" id="giscusLoading">正 在 打 开 门 …</p>
  </div>
</div>

<script>
/*
  呀！giscus 要滚到眼前才让它加载——不然会拖着首屏一起变慢呢。
  theme 固定为 dark：整站都是深紫黑，跟随系统的话，
  用浅色系统的人会在星空上看到一块白板哦。
*/
(function(){
  var host = document.getElementById('giscus-host');
  var loading = document.getElementById('giscusLoading');
  var loaded = false;

  function load(){
    if (loaded) return;
    loaded = true;

    var s = document.createElement('script');
    s.src = 'https://giscus.app/client.js';
    s.setAttribute('data-repo', 'elysiamsia/elysia');
    s.setAttribute('data-repo-id', 'R_kgDOUCa0bA');
    s.setAttribute('data-category', 'Announcements');
    s.setAttribute('data-category-id', 'DIC_kwDOUCa0bM4DFlz5');
    s.setAttribute('data-mapping', 'pathname');
    s.setAttribute('data-strict', '0');
    s.setAttribute('data-reactions-enabled', '1');
    s.setAttribute('data-emit-metadata', '0');
    s.setAttribute('data-input-position', 'bottom');
    s.setAttribute('data-theme', 'dark');
    s.setAttribute('data-lang', 'zh-CN');
    s.setAttribute('data-loading', 'lazy');
    s.setAttribute('crossorigin', 'anonymous');
    s.async = true;
    s.onerror = function(){
      if (loading) loading.textContent = '门暂时打不开呢…稍后再来看看吧';
    };
    host.appendChild(s);
    if (loading) setTimeout(function(){ loading.remove(); }, 600);
  }

  if (!('IntersectionObserver' in window)) { load(); return; }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if (e.isIntersecting) { load(); io.disconnect(); }
    });
  }, { rootMargin: '200px' });
  io.observe(host);
})();
</script>
</body>
</html>
```

- [ ] **Step 2: 本地验证结构与降级**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/guestbook/ \
  sleep 3000 \
  eval "document.title" \
  eval "document.querySelector('.back').getAttribute('href')" \
  eval "document.querySelectorAll('script[src*=\"giscus\"]').length" \
  eval "document.body.innerText.includes('GitHub') ? '✅ 已提示需登录' : '❌ 未提示登录门槛'" \
  shot screenshots/guestbook.png 2>&1
kill %1 2>/dev/null
```

期望：标题为 `想对爱莉希雅说的话 — elysiad.top`；返回链接为 `/`；giscus 脚本标签数量为 `1`（已注入）；文案含 GitHub 提示。

> 本地环境下 `giscus.app` 能连通则评论区会渲染；不通则显示 `.loading` 提示，属预期。

- [ ] **Step 3: 确认 giscus 参数全部正确**

```bash
cd <repo 根>
grep -o "data-[a-z-]*', '[^']*'" guestbook/index.html
```

期望：能看到 `data-repo-id` 为 `R_kgDOUCa0bA`、`data-category-id` 为 `DIC_kwDOUCa0bM4DFlz5`、`data-theme` 为 `dark`。**若 `data-category` 仍是 `[在此输入分类名]`，说明没替换，必须修。**

- [ ] **Step 4: 目视核对截图**

用 Read 打开 `screenshots/guestbook.png`，确认：标题、副标题、返回按钮、登录提示框都正常显示，配色与站点一致。

- [ ] **Step 5: 提交**

```bash
git add guestbook/index.html
git commit -m "新增 giscus 留言簿独立页"
```

- [ ] **Step 6: 合并到 main 后做真实留言测试**

`dev` 不部署，因此这一步需要页面已经上线：

1. 打开 `https://elysiad.top/guestbook/`
2. 用 GitHub 账号登录并发送一条测试留言
3. 到 `https://github.com/elysiamsia/elysia/discussions` 确认对应 discussion 已创建在 **Announcements** 分类下
4. 删除测试留言与对应的 discussion

---

## 自检记录

**规格覆盖**（对照设计文档 §五 与 §六）：

| 设计文档条目 | 本计划任务 |
|---|---|
| §5 P0 部署收口 | Task 1、Task 2 |
| 工具前置：`cdp.py` 支持切换视口 | Task 3 |
| favicon | Task 4 |
| §6.6 404 页面 | Task 5 |
| robots / sitemap | Task 6 |
| 图片转 WebP | Task 7 |
| §6.5 分享卡片（OG） | Task 8 |
| §6.1 今日之语 | Task 10 |
| §6.2 献花互动 | Task 11 |
| §6.3 隐藏彩蛋 | Task 12 |
| §6.4 明信片生成 | Task 13 |
| §6.7 giscus 留言簿 | Task 14 |
| §5 P1 公共层抽取 | **不在本计划**，见 `2026-09-15-elysiad-extraction.md` |
| §6.2 献花后端 Worker | **不在本计划**，需求方按 `worker/README.md` 自行部署 |

**未覆盖项**：设计文档 §2.4 记载的 `data/timeline-data.js` 中 12 位英桀 `lore` 的重复稿与 OCR 坏文清理，属设计文档第九节的待确认事项，本轮**未纳入**（等需求方拍板）。

**占位符扫描**：全文无 TBD / TODO / "类似上文" 式省略；每个改代码的步骤都给了完整代码。

**类型一致性**：`window.QUOTES.daily` / `window.QUOTES.hidden`（Task 9 定义）在 Task 10、12、13 中被一致引用；`TIMELINE_DATA[].img_w` / `img_h`（Task 7 新增）在 Task 7 的 `armor.html` 渲染分支中被消费；`cdp.py` 的 `size <宽>x<高>` 动作（Task 3 定义）在 Task 8、10、13 的验收命令中被一致调用。
