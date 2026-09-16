# elysiad.top 公共层抽取 实现计划（P1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 8 个页面各自复制的 CSS/JS 收敛到 `assets/site.css` 与 `assets/site.js`，同时修掉 `armor.html` 的 `--gold-soft` 未定义 bug、补齐全站 `prefers-reduced-motion`、把子页的语录卡逻辑从 O(n²) 改为 O(1)——**全程不改变任何页面的视觉呈现**。

**Architecture:** 纯静态、零构建。只抽出「跨页逐字节一致」的规则（A 组 31 条）；同选择器但值不同的规则（B 组 47 条）**留在各页做主题覆盖**，共享文件只经 `var(--*)` 取色。页面专属规则（C 组 225 条）一律不动。JS 侧没有一对跨页函数是完全相同的，所以抽的是「逻辑等价、参数化后统一」的工厂函数，而不是照搬。

**Tech Stack:** HTML5 + 原生 CSS/JS（无框架、无构建）｜`tools/cdp.py`（无头 Edge + CDP）｜新增 `tools/snapshot.py` / `tools/snapshot_diff.py`（像素 + 计算样式双重基线比对）

## Global Constraints

- **分支**：所有改动提交到 `dev`。`static.yml` 只在 push `main` 时部署，`dev` 上作业不影响线上。
- **零构建**：不引入 webpack / vite / rollup 或任何打包步骤。站点侧不引入 npm 依赖。
- **零外部依赖**：不引入 Web 字体，沿用现有系统字体栈。
- **验证纪律（本计划的命门）**：**每一步都必须与基线比对，不接受肉眼判断。** 每个任务结束前跑 `snapshot_diff.py`，差异必须为空或已逐条解释。
- **一次一个关注点**：每个任务一个 commit。行为变更（不是纯重构）必须**单独成 commit 并在信息里标明**，不得混进重构 commit。
- **不改值**：除非任务明确要求，否则只搬位置、不改数值。前导零归一化仅限 Task 5。
- **数据纪律**：本计划不新增、不修改任何文案内容。
- **本地服务器**：`cd <repo 根> && python -m http.server 8500`。Windows 下跑 Python 需带 `PYTHONIOENCODING=utf-8`。

## 依据文档

本计划的每一步都以 `docs/superpowers/plans/2026-09-15-extraction-inventory.md` 为事实来源。**动手前先通读那份文档的第 3 节（风险清单）与第 5.1 节（待确认项）**。下面凡写「见 Inventory §x.y」之处，都是指该文件。

关键常量（来自 Inventory）：

| 组 | 数量 | 处置 |
|---|---|---|
| A 组 · 跨页逐字节一致 | 31 条 | 进 `assets/site.css`，源码初稿见 Inventory §1.1 |
| B 组 · 同选择器不同值 | 47 条 | 留各页做主题覆盖 |
| C 组 · 页面专属 | 225 条 | 不动 |

**三个绝对不要碰的雷**（Inventory §5.2）：

1. **R12** —— `armor.html` 的 `.timeline` 系列是**另一套结构**（`max-width:900px` vs `800px`、卡片 `calc(50% - 2.4rem)` vs `2.5rem`、768px 断点 `1.3rem` vs `1.5rem`、且没有 480px 断点）。**绝不并入 7 页版本**，armor 只吃那 8 条 8 页通用规则，且**最后做**。
2. **R4** —— `--gold-warm`（index `#e8b931` / eden `#c9972c`）与 `--flame`（kalpas `#ffa62b` / kevin `#e8935c`）**同名不同值、语义也不同**。**绝不提升为共享 token**。
3. **R3** —— `index.html` 的点击涟漪缺 `reducedMotion` 判断（`index.html:746` 定义了却没用）。统一后 index 在减弱动效下行为**会变**，属**行为变更**，必须单独 commit 标明。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `tools/snapshot.py` | 对 8 页 × 3 视口截图 + dump 关键元素的计算样式，存成可 diff 的 JSON |
| `tools/snapshot_diff.py` | 比对两次 snapshot，按选择器 × 属性列出差异；数值型做等价归一化 |
| `assets/site.css` | 8 页共享样式（A 组 31 条 + 减动保护段） |
| `assets/site.js` | 8 页共享行为（resize 工厂 / 结尾星星 / 语录卡 / IntersectionObserver / 打字机） |
| `screenshots/baseline/` | 基线存档（已被 `.gitignore` 忽略，不入仓库） |

---

### Task 1: 建立验证基线与比对工具

> ✅ **本任务已于 2026-09-16 执行完毕。**
>
> ⚠ **但仓库里的工具比下面列出的代码更严，别照抄本文的代码块去覆盖它。**
> 照原样实现出来会得到一个**每次都返回假的「无差异」**的工具——实测踩到四个坑，
> 都已修进 `tools/snapshot.py` / `tools/snapshot_diff.py`：
>
> | 坑 | 后果 |
> |---|---|
> | 浏览器 HTTP 缓存没关 | **每一轮比对都是假的「✅ 无差异」**。实测：改 0.0001em 都测不出来 |
> | 无限动画停在随机相位 | 星星 opacity、名片呼吸光的 box-shadow 每次都不同 |
> | 星星是 `Math.random()` 生成 | 尺寸/颜色/时长随机。已用 `addScriptToEvaluateOnNewDocument` 固定种子 |
> | 页面会连线上献花接口 | 通/不通 → 文案不同 → **整页高度差 8px**。已 `setBlockedURLs` 屏蔽 |
>
> 另有两处放宽：`IGNORE_PROPS` 已清空（`transform` 实测 807/807 稳定，不再是噪音）；
> `armor.html` 截图前注入 `background-attachment:scroll`，否则它 80% 的面积是全白
> （该页是全站唯一用 fixed 背景的）。
>
> **验证结论**（都已真跑）：三轮快照两两比对全为 0 差异；把 su 页 `.back-link` 的
> `letter-spacing` 改 0.0001em，工具准确报出 3 处差异（3 个视口各一处）——**既确定又敏感**。

**Files:**
- Create: `tools/snapshot.py`、`tools/snapshot_diff.py`
- Produces: `screenshots/snap/<label>/*.png` 与 `*.json`

**Interfaces:**
- Consumes: `tools/cdp.py` 已能启动无头 Edge（本任务独立实现自己的 CDP 会话，不复用 cdp.py，避免与另一份计划对 cdp.py 的改动冲突）
- Produces: 命令行工具
  - `python tools/snapshot.py <label>` → 写 `screenshots/snap/<label>/`
  - `python tools/snapshot_diff.py <labelA> <labelB>` → 打印差异；有差异时退出码 1

这是整个计划的地基。**没有它，后面每一步都只能靠肉眼，而肉眼看不出 1px 和 0.05 的透明度差异。**

- [x] **Step 1: 写 `tools/snapshot.py`**

```python
# tools/snapshot.py — 对站点做「像素 + 计算样式」双重快照（本地工具，不部署）
#
#   python tools/snapshot.py baseline      # 改动前跑一次
#   python tools/snapshot.py after-task3   # 每步之后跑一次
#   python tools/snapshot_diff.py baseline after-task3
#
# 产出：screenshots/snap/<label>/<page>_<w>.png   （整页截图）
#       screenshots/snap/<label>/<page>_<w>.json  （关键元素的计算样式）
#
# 依赖：先跑 `python -m http.server 8500`
import base64
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import websocket

ROOT = Path(__file__).resolve().parent.parent
OUT_ROOT = ROOT / 'screenshots' / 'snap'

BASE = 'http://localhost:8500'
PAGES = [
    'index.html', 'armor.html',
    'kevin/index.html', 'eden/index.html', 'aponia/index.html',
    'villv/index.html', 'kalpas/index.html', 'su/index.html',
]
SIZES = [(1920, 1080), (768, 1024), (375, 812)]

# 采样哪些元素（不存在的会被跳过，不算错）
SELECTORS = [
    'body', 'html',
    '.section-opening', '.opening-title', '.opening-subtitle', '.scroll-hint', '.scroll-chevron',
    '.content-section', '.section-title-wrap', '.section-title', '.section-title-line',
    '.profile-card', '.profile-card-inner', '.profile-name', '.profile-name-en',
    '.profile-divider', '.profile-grid', '.profile-label', '.profile-value', '.profile-desc',
    '.timeline', '.timeline-line', '.timeline-node', '.timeline-dot', '.timeline-card',
    '.quotes-grid', '.quote-card', '.quote-text', '.quote-hint',
    '.section-ending', '.ending-stars', '.ending-star', '.ending-quote', '.ending-attr', '.ending-fade',
    '.back-link', '.armor-featured-row', '.epilogue', '.hero-card',
]

# 采样哪些计算属性
PROPS = [
    'display', 'position', 'width', 'height', 'margin', 'padding',
    'color', 'background-color', 'background-image',
    'font-size', 'font-weight', 'letter-spacing', 'line-height', 'text-align', 'text-shadow',
    'opacity', 'visibility', 'transform', 'border-radius', 'border-top-width', 'border-top-color',
    'box-shadow', 'flex-direction', 'justify-content', 'align-items', 'gap',
    'grid-template-columns', 'max-width', 'min-height',
    'animation-name', 'animation-duration', 'transition-duration',
]

EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = 9321


def start_browser():
    proc = subprocess.Popen([
        EDGE, f'--remote-debugging-port={PORT}',
        '--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-allow-origins=*',
        '--user-data-dir=C:/tmp/edge_snapshot',
        '--window-size=1920,1080', '--hide-scrollbars',
        'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(24):
        try:
            targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json'))
            ws_url = next(t['webSocketDebuggerUrl'] for t in targets if t.get('type') == 'page')
            return proc, websocket.create_connection(ws_url, suppress_origin=True, timeout=90)
        except Exception:
            time.sleep(0.5)
    proc.terminate()
    raise SystemExit('无法连接无头 Edge；请确认路径 EDGE 是否存在')


class CDP:
    def __init__(self, ws):
        self.ws = ws
        self._id = 0

    def send(self, method, params=None):
        self._id += 1
        self.ws.send(json.dumps({'id': self._id, 'method': method, 'params': params or {}}))
        while True:
            r = json.loads(self.ws.recv())
            if r.get('id') == self._id:
                if 'error' in r:
                    raise RuntimeError(f"{method}: {r['error']}")
                return r.get('result', {})

    def ev(self, expr):
        r = self.send('Runtime.evaluate', {
            'expression': expr, 'returnByValue': True, 'awaitPromise': True,
        })
        return r.get('result', {}).get('value')


DUMP_JS = """
(() => {
  const props = %s;
  const out = {};
  for (const sel of %s) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const cs = getComputedStyle(el);
    const rec = {};
    for (const p of props) rec[p] = cs.getPropertyValue(p);
    out[sel] = rec;
  }
  /* 顺带记下文档总高，用于发现整体布局漂移 */
  out['__docHeight__'] = { 'height': String(document.documentElement.scrollHeight) };
  return out;
})()
""" % (json.dumps(PROPS), json.dumps(SELECTORS))


def main():
    label = sys.argv[1] if len(sys.argv) > 1 else 'default'
    out_dir = OUT_ROOT / label
    out_dir.mkdir(parents=True, exist_ok=True)

    proc, ws = start_browser()
    cdp = CDP(ws)
    cdp.send('Page.enable')
    cdp.send('Runtime.enable')

    try:
        for page in PAGES:
            for (w, h) in SIZES:
                cdp.send('Emulation.setDeviceMetricsOverride', {
                    'width': w, 'height': h, 'deviceScaleFactor': 1, 'mobile': w < 768,
                })
                cdp.send('Page.navigate', {'url': f'{BASE}/{page}'})
                time.sleep(2.2)

                # 滚到底再回顶：触发所有 IntersectionObserver 的进场状态
                cdp.ev('(async () => {'
                       '  const s = document.documentElement.scrollHeight;'
                       '  for (let y = 0; y < s; y += 400) { window.scrollTo(0, y);'
                       '    await new Promise(r => setTimeout(r, 16)); }'
                       '  window.scrollTo(0, 0);'
                       '  await new Promise(r => setTimeout(r, 350));'
                       '  return true; })()')
                time.sleep(0.7)

                styles = cdp.ev(DUMP_JS)
                shot = cdp.send('Page.captureScreenshot', {'captureBeyondViewport': True})

                stem = page.replace('/', '_').replace('.html', '') or 'index'
                (out_dir / f'{stem}_{w}.json').write_text(
                    json.dumps(styles, ensure_ascii=False, indent=1), encoding='utf-8')
                (out_dir / f'{stem}_{w}.png').write_bytes(base64.b64decode(shot['data']))
                print(f'  ✓ {page} @{w}  ({len(styles)} 个选择器)')
    finally:
        proc.terminate()

    print(f'\n快照存入 {out_dir}')


if __name__ == '__main__':
    main()
```

- [x] **Step 2: 写 `tools/snapshot_diff.py`**

```python
# tools/snapshot_diff.py — 比对两次快照，列出差异（本地工具，不部署）
#
#   python tools/snapshot_diff.py baseline after-task3
#
# 有差异时退出码 1（可直接用于 CI 或链式命令）
# 数值等价归一化：0.85 与 .85、0px 与 0、rgba(0,0,0,0) 与 transparent 视为相同
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAP = ROOT / 'screenshots' / 'snap'

# 这些属性天生会因渲染时机不同而抖动，比对时忽略
IGNORE_PROPS = {'transform'}


def norm(v: str) -> str:
    v = (v or '').strip().lower()
    # 前导零：0.5 -> .5
    v = re.sub(r'(?<![\d.])0\.(\d)', r'.\1', v)
    v = v.replace('rgba(0, 0, 0, 0)', 'transparent')
    v = re.sub(r'\s+', ' ', v)
    # 纯数值属性去掉单位与多余空格
    v = re.sub(r'(?<=[\d.])px\b', '', v)
    return v.strip()


def load(label):
    d = SNAP / label
    if not d.exists():
        raise SystemExit(f'找不到快照：{d}\n先跑 python tools/snapshot.py {label}')
    out = {}
    for f in sorted(d.glob('*.json')):
        out[f.stem] = json.loads(f.read_text(encoding='utf-8'))
    return out


def main():
    if len(sys.argv) < 3:
        raise SystemExit('用法: python tools/snapshot_diff.py <旧label> <新label>')
    a, b = load(sys.argv[1]), load(sys.argv[2])

    keys = sorted(set(a) | set(b))
    diffs = []
    for k in keys:
        if k not in a:
            diffs.append(f'[新增快照] {k}')
            continue
        if k not in b:
            diffs.append(f'[丢失快照] {k}')
            continue
        for sel in sorted(set(a[k]) | set(b[k])):
            ra, rb = a[k].get(sel), b[k].get(sel)
            if ra is None:
                diffs.append(f'{k}  {sel}  [选择器新增]')
                continue
            if rb is None:
                diffs.append(f'{k}  {sel}  [选择器消失]')
                continue
            for prop in sorted(set(ra) | set(rb)):
                if prop in IGNORE_PROPS:
                    continue
                va, vb = norm(ra.get(prop, '')), norm(rb.get(prop, ''))
                if va != vb:
                    diffs.append(f'{k}  {sel}  {prop}\n     旧: {va}\n     新: {vb}')

    if not diffs:
        print(f'✅ 无差异：{sys.argv[1]} == {sys.argv[2]}')
        return 0

    print(f'❌ 发现 {len(diffs)} 处差异（{sys.argv[1]} -> {sys.argv[2]}）：\n')
    for d in diffs:
        print('  ' + d)
    return 1


if __name__ == '__main__':
    sys.exit(main())
```

- [x] **Step 3: 起服务器，生成基线**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/snapshot.py baseline
```

期望：打印 24 行 `✓`（8 页 × 3 视口），随后 `快照存入 …/screenshots/snap/baseline`。

- [x] **Step 4: 验证工具本身可信——对同一份代码跑两次，必须零差异**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/snapshot.py baseline-b
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline baseline-b; echo "退出码 $?"
```

期望：`✅ 无差异` 且退出码 `0`。

**若报出差异**，说明有页面在采样时刻不稳定（动画未收敛、随机粒子、随机延迟）。先解决这一点再往下走——否则后面每一个任务都会被噪音淹没。常见的处理：把 `IGNORE_PROPS` 加上出问题的属性，或把 `time.sleep` 调长。

- [x] **Step 5: 确认基线截图可信**

```bash
cd <repo 根>
ls screenshots/snap/baseline/ | head -8
du -sh screenshots/snap/baseline
```

用 Read 打开 `screenshots/snap/baseline/index_1920.png` 与 `screenshots/snap/baseline/kalpas_375.png`，确认是完整页面（不是白屏、不是只有首屏）。

- [x] **Step 6: 提交**

```bash
git add tools/snapshot.py tools/snapshot_diff.py
git commit -m "新增快照与差异比对工具，作为公共层抽取的验证地基"
```

> `screenshots/` 已在 `.gitignore` 中，基线图不入仓库（体积大且可随时重建）。

---

### Task 2: 建 `assets/site.css`（只建文件，不接线）

**Files:**
- Create: `assets/site.css`

**Interfaces:**
- Consumes: 无
- Produces: `assets/site.css`，含 A 组 31 条规则。**本任务不修改任何页面**，因此渲染结果零变化。

**为什么要「只建不接」**：把「准备代码」和「改变渲染」分成两个 commit。这一步出任何问题都只可能是文件写错了，排查范围最小。

- [ ] **Step 1: 从 Inventory 取 A 组源码**

打开 `docs/superpowers/plans/2026-09-15-extraction-inventory.md`，定位到 **§1.1「A 组合并后的完整 CSS 源码（`assets/site.css` 初稿）」**（约在该文件第 93 行）。

把那个 ```css 代码块的内容**原样**复制成 `assets/site.css`。开头已经是完整的文件头注释，不必另加。

- [ ] **Step 2: 核对 31 条是否齐全**

```bash
cd <repo 根>
grep -c "^[.:#@*]" assets/site.css
grep -n "^@" assets/site.css
```

期望：`@keyframes` 有 4 个——`blink-cursor`、`chevron-bounce`、`twinkle`、`card-rotate`。**若 `card-rotate` 缺失或多余**，对照 Inventory §1.1 补/删。

- [ ] **Step 3: 确认没有内联具体色值（共享文件不该带主题色）**

```bash
cd <repo 根>
grep -nE "#[0-9a-fA-F]{3,6}|rgba?\(" assets/site.css
```

期望：只允许出现 `#fff`（`.ending-star` 的星星底色，与主题无关）。**出现任何其它色值都是错的**——那说明把 B 组的内容误抄进来了。

- [ ] **Step 4: 语法体检**

```bash
cd <repo 根>
python -c "
css = open('assets/site.css', encoding='utf-8').read()
print('花括号配平:', css.count('{') == css.count('}'), css.count('{'), css.count('}'))
print('字节数:', len(css.encode()))
" 2>&1
```

期望：`花括号配平: True`。

- [ ] **Step 5: 确认没有页面引用它（此刻还不该有）**

```bash
cd <repo 根>
grep -rn "site.css" --include=*.html . || echo "（无引用 ✅ 符合预期）"
```

- [ ] **Step 6: 跑快照，确认为零差异**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-task2
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline after-task2; echo "退出码 $?"
```

期望：`✅ 无差异`，退出码 `0`。**这是必然的**——没有任何页面引用它。若报差异，说明有别的进程改了文件，先查清楚。

- [ ] **Step 7: 提交**

```bash
git add assets/site.css
git commit -m "新建 assets/site.css（A 组 31 条），暂不接线"
```

---

### Task 3: 接入基础重置与 `@keyframes`

**Files:**
- Modify: `index.html`、`aponia/index.html`、`eden/index.html`、`kalpas/index.html`、`kevin/index.html`、`su/index.html`、`villv/index.html`（**7 页，不含 armor**）

**Interfaces:**
- Consumes: `assets/site.css`
- Produces: 7 页通过 `<link>` 引入共享样式；同时**删除各页自己的**同名规则，避免重复定义

**接入规则**：这 7 页每页的 `<head>` 里加一行 `<link rel="stylesheet" href="/assets/site.css">`，位置在 `<meta name="viewport">` 之后、各页自己的 `<style>` **之前**——这样各页的 `:root` 与主题覆盖能盖住共享文件（同特异性时后者胜）。

- [ ] **Step 1: 确认 A 组里哪些是「基础重置 + keyframes」**

本任务只接入这些（全部不依赖 `:root` 的具体值）：

```
*,*::before,*::after
html
::-webkit-scrollbar   ::-webkit-scrollbar-track
@keyframes blink-cursor      @keyframes chevron-bounce
@keyframes twinkle           @keyframes card-rotate
```

- [ ] **Step 2: 7 页加 `<link>`**

在每页的 `<meta name="viewport" ...>` 那行之后插入：

```html
<!-- 呀！8 个页面共用的那一层，终于收进一个文件里啦♥ -->
<link rel="stylesheet" href="/assets/site.css">
```

用**绝对路径** `/assets/site.css`——6 个角色页在子目录里，相对路径会指错。

- [ ] **Step 3: 删除 7 页里被抽走的重复规则**

在每页的 `<style>` 里删掉 Step 1 列出的那些规则。**逐页删，删完立刻跑一次快照**，不要一次性删完 7 页再验。

```bash
cd <repo 根>
for f in index.html aponia/index.html eden/index.html kalpas/index.html kevin/index.html su/index.html villv/index.html; do
  echo "--- $f 剩余的重复定义 ---"
  grep -nE '^(\*,\*::before|html\{|::-webkit-scrollbar)' "$f" || echo "  （已清）"
done
```

- [ ] **Step 4: 注意 R7 —— `card-rotate` 不要给 kalpas**

Inventory §3-R7 记载 `kalpas` 原本**没有** `glow-pulse`，且 `card-rotate` 缺席。删 kalpas 的规则时**只删它确实有的**；`site.css` 里带着 `card-rotate` 定义无所谓（没元素用它等于无用），但**不要反过来给 kalpas 的元素加上 `animation:card-rotate`**。

```bash
cd <repo 根>
echo "--- kalpas 是否有 card-rotate ---"
grep -n "card-rotate" kalpas/index.html || echo "  （本来就没有 ✅ 保持）"
echo "--- kalpas 是否有 glow-pulse ---"
grep -n "glow-pulse" kalpas/index.html || echo "  （本来就没有 ✅ 保持）"
```

- [ ] **Step 5: 快照比对**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-task3
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline after-task3; echo "退出码 $?"
```

期望：`✅ 无差异`，退出码 `0`。

**若出现差异**，按差异行定位选择器，检查是不是漏删或误删。常见原因：某页的 `html{scroll-behavior}` 写法与共享版有细微不同（如多了 `-webkit-` 前缀）——此时**保留该页自己的写法**，把共享文件里对应规则去掉，并在 `site.css` 加注释说明。

- [ ] **Step 6: 逐页目视确认动画仍在跑**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  sleep 2000 \
  eval "getComputedStyle(document.querySelector('.typing-cursor')).animationName" \
  eval "getComputedStyle(document.querySelector('.scroll-chevron')).animationName" 2>&1
```

期望：分别输出 `blink-cursor`、`chevron-bounce`。**若输出 `none`**，说明共享文件里的 `@keyframes` 没生效（多半是 `<link>` 路径错或位置错）。

- [ ] **Step 7: 提交**

```bash
git add assets/site.css index.html aponia/index.html eden/index.html kalpas/index.html kevin/index.html su/index.html villv/index.html
git commit -m "接入共享样式：基础重置与 keyframes（7 页，armor 暂不接）"
```

---

### Task 4: 接入几何中性规则

**Files:**
- Modify: 同 Task 3 的 7 页
- Modify: `assets/site.css`（只为了在注释里标注 armor 不适用）

**Interfaces:**
- Consumes: `assets/site.css`
- Produces: 7 页再删掉一批重复规则

本任务接入的是「只引用 `var(--glass-*)` / `var(--text-*)` / `var(--bg-abyss)` / 运行时变量，因此不需要任何页面 override」的规则。

- [ ] **Step 1: 列出本任务接入的规则**

```
.timeline-node.visible
.timeline-node:nth-child(odd)          .timeline-node:nth-child(even)
.timeline-node:nth-child(odd) .timeline-card   .timeline-node:nth-child(even) .timeline-card
.section-title-wrap
.profile-card-inner   .profile-divider   .profile-label   .profile-value
.quotes-grid   .quote-text.fading
.section-ending   .ending-stars   .ending-star   .ending-quote.visible   .ending-attr.visible
.ending-fade   .ending-sub   .ending-sub.visible
.opening-subtitle.visible   .typing-cursor.hidden   .opening-hint.visible
.back-link.visible
```

- [ ] **Step 2: ⚠ 先确认 armor 不参与**

`.section-ending` / `.ending-*` 只在**除 armor 外**的 7 页出现（Inventory §4 第 3 步）。而 `.timeline-*` 虽然 armor 也有同名选择器，但 **R12 明确说 armor 的 `.timeline` 是另一套结构**——数值不同，所以：

```bash
cd <repo 根>
echo "--- armor 的 timeline 数值（不要参与共享）---"
grep -nE "\.timeline|\.timeline-card|\.timeline-dot|\.timeline-line" armor.html | head -12
```

确认 armor 的 `.timeline{max-width:900px}`（7 页是 `800px`）。**armor 完全不在本任务的修改范围内。**

- [ ] **Step 3: `.back-link` 先留手 —— R13**

Inventory §3-R13：`.back-link` 在 armor 与子页是**两种完全不同的组件**。本任务**只删 7 页里与 A 组一致的 `.back-link.visible`**，`.back-link` 本体（B 组）留各页。

```bash
cd <repo 根>
for f in aponia/index.html eden/index.html kalpas/index.html kevin/index.html su/index.html villv/index.html; do
  printf "%-22s .back-link.visible=%s  .back-link本体=%s\n" "$f" \
    "$(grep -c '\.back-link\.visible' "$f")" "$(grep -c '^\.back-link{' "$f")"
done
```

期望：`.back-link.visible` 删掉后为 0；`.back-link{` 本体**保持为 1**（不动）。

- [ ] **Step 4: 删 7 页里的这批重复规则**

同 Task 3 的做法：逐页删、删完即验。

- [ ] **Step 5: 快照比对**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-task4
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline after-task4; echo "退出码 $?"
```

期望：`✅ 无差异`。

**重点盯这三处**：`.timeline-node:nth-child(odd/even)` 的 `flex-direction`、`.quotes-grid` 的 `grid-template-columns`、`.section-ending` 的 `min-height`。任何一处不一致都会在 375 视口下暴露得最明显。

- [ ] **Step 6: 目视核对时间轴与结尾区**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/kevin/ \
  size 375x812 sleep 2000 \
  eval "(()=>{document.querySelector('.timeline').scrollIntoView();return 'ok'})()" \
  sleep 800 shot screenshots/task4-kevin-375.png 2>&1
```

用 Read 打开，与 `screenshots/snap/baseline/kevin_375.png` 对照时间轴区。

- [ ] **Step 7: 提交**

```bash
git add assets/site.css index.html aponia/index.html eden/index.html kalpas/index.html kevin/index.html su/index.html villv/index.html
git commit -m "接入共享样式的几何中性规则（时间轴骨架 / 语录栅格 / 结尾区）"
```

---

### Task 5: 归一化前导零（只改写法，不改值）

**Files:**
- Modify: `index.html`（主要是它用了 `0.85rem` 这类带前导零的写法）
- Modify: `assets/site.css`

**Interfaces:**
- Consumes: `assets/site.css`
- Produces: B 组里有 12 条规则因「仅前导零不同」而变成真正一致，可并入 A 组

- [ ] **Step 1: ⚠ 先看清唯一的例外**

Inventory §3-R1 与 §5.1-Q2 都指出：

> `index.html:51` 的 `clamp(0.9rem,2.5vw,1.3rem)` 上界是 **`1.3rem`**，其余页是 **`1.25rem`**。

**这一处不要归一化**——归一化是「改写法」，而这处是「改数值」，属于行为变更。

```bash
cd <repo 根>
grep -n "clamp(0.9rem,2.5vw" index.html
grep -n "clamp(0.9rem,2.5vw" kevin/index.html
```

确认两者上界确实不同（`1.3rem` vs `1.25rem`），然后**保持原样**。

- [ ] **Step 2: 归一化 index 的前导零**

把 `index.html` 的 `<style>` 里形如 `0.85rem` / `0.5rem` / `0.7s` / `0.75s` 的写法改成 `.85rem` / `.5rem` / `.7s` / `.75s`——**值完全等价，只是写法统一**。

```bash
cd <repo 根>
echo "--- 归一化前 ---"
grep -oE '\b0\.[0-9]+(rem|s|em)?' index.html | sort | uniq -c | sort -rn
```

- [ ] **Step 3: 逐条替换**

对 Step 2 输出的每一项做替换。**注意 `clamp(0.9rem,2.5vw,1.3rem)` 里的 `0.9rem` 也要归一化成 `.9rem`**（改写法是允许的），只是 `1.3rem` 的**数值**不能动。

```bash
cd <repo 根>
echo "--- 归一化后（应只剩 clip-path 或 0.x 形式的残留）---"
grep -oE '\b0\.[0-9]+(rem|s|em)?' index.html | sort | uniq -c | sort -rn || echo "（已清）"
```

- [ ] **Step 4: 快照比对**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-task5
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline after-task5; echo "退出码 $?"
```

期望：`✅ 无差异`。

`snapshot_diff.py` 已经把 `0.85` 与 `.85` 做等价归一化，所以**如果这一步报出差异，说明改动了数值而不是写法**——回去核对 Step 1 的例外。

- [ ] **Step 5: 提交**

```bash
git add index.html assets/site.css
git commit -m "归一化前导零写法（不动任何数值）"
```

---

### Task 6: 抽 JS —— `resize` 工厂与结尾星星生成

**Files:**
- Create: `assets/site.js`
- Modify: 7 页（引入 `<script src="/assets/site.js">` 并删除各自的实现）

**Interfaces:**
- Consumes: 无
- Produces（`window.ElysiaShared`）：
  - `makeResize(canvas, state, opts)` → 返回 `function()`，绑定到 `window.onresize`
  - `spawnEndingStars(container, opts)` → `opts = { count, minO:[lo,hi], maxO:[lo,hi], dur:[lo,hi], delay:[lo,hi], colors:[] }`
  - `buildQuoteCards(opts)` → `opts = { grid, quotes, onIndexChange, hints }`
  - `observeReveal(selector, opts)` → 供滚动进场使用
  - `makeTypewriter(opts)` → `opts = { el, cursor, text, subEl, hintEl, speed:[min,max] }`

**⚠ 关键纪律：抽取时不顺手修 bug。** Inventory 记载了两处疑似遗漏（R10 villv 缺 resize 守卫、R11 子页 `endingObserver` 无判空）。**这两处不在本任务修**，抽取时保留原行为。要修就单独开任务、单独 commit、明确标注为行为修复。

- [ ] **Step 1: 读各页 `resize` 实现，确认差异**

```bash
cd <repo 根>
for f in index.html kevin/index.html villv/index.html kalpas/index.html; do
  echo "===== $f ====="
  grep -n -A6 "function resize" "$f" | head -14
done
```

Inventory §2.3.6 已记载：各页 `resize` **逻辑等价但写法不同**（有的带 `if (stars[i].x > W)` 守卫，villv 没有）。

- [ ] **Step 2: 写 `assets/site.js` 的 `makeResize`**

```js
/**
 * assets/site.js — 8 页共享行为
 *
 * 呀！8 个页面里各自养了一份的这些小工具，终于住到一起啦♥
 * 注意：本文件只抽「逻辑等价、参数化后统一」的部分。
 * 各页同名但实现真的不同的函数（见 Inventory §2.3）保持各自独立，
 * 不要强行合并——那会变成改行为，不是重构。
 */
(function (global) {
  'use strict';

  /**
   * 粒子 canvas 的 resize 处理器工厂。
   *
   * @param {HTMLCanvasElement} canvas
   * @param {object} state  形如 { get W(){}, set W(v){}, get H(){}, set H(v){} }
   *                        或普通对象 { W, H, stars }，函数内会就地改写 W/H
   * @param {object} [opts]
   * @param {boolean} [opts.repositionOutOfBounds] 是否把越界粒子重新随机化。
   *        默认 true。⚠ villv 原本没有这一步（Inventory §3-R10），
   *        所以它调用时须显式传 false——**保持原行为**。
   * @returns {function(): void}
   */
  function makeResize(canvas, state, opts) {
    var o = opts || {};
    var repo = o.repositionOutOfBounds !== false;

    return function resize() {
      state.W = canvas.width = window.innerWidth;
      state.H = canvas.height = window.innerHeight;

      if (!repo || !state.stars) return;
      for (var i = 0; i < state.stars.length; i++) {
        if (state.stars[i].x > state.W) state.stars[i].x = Math.random() * state.W;
        if (state.stars[i].y > state.H) state.stars[i].y = Math.random() * state.H;
      }
    };
  }

  global.ElysiaShared = global.ElysiaShared || {};
  global.ElysiaShared.makeResize = makeResize;

})(window);
```

- [ ] **Step 3: 在 7 页引入并替换 `resize`**

每页 `<body>` 末尾（或该页第一个 `<script>` 之前）加：

```html
<script src="/assets/site.js"></script>
```

然后把该页的 `function resize() { ... }` 换成：

```js
  var resize = ElysiaShared.makeResize(canvas, { get W(){return W}, set W(v){W=v}, get H(){return H}, set H(v){H=v}, stars: stars });
```

> 各页变量名可能不同（`W`/`H`/`stars` 之外还有 `canvas` 的名字差异）。**照该页的实际变量名改**，不要改名。若某页的 `stars` 叫别的（如 `motes`），就传对应名字。

- [ ] **Step 4: ⚠ R10 —— villv 传 `repositionOutOfBounds: false`**

```js
  var resize = ElysiaShared.makeResize(canvas, { /* ... */ }, { repositionOutOfBounds: false });
```

这是**刻意保留原行为**（villv 本来就没有这个守卫）。若顺手补上，会改变 villv 的粒子分布。

```bash
cd <repo 根>
grep -n "repositionOutOfBounds" villv/index.html
```

- [ ] **Step 5: 写 `spawnEndingStars`**

追加到 `assets/site.js`（放在 `makeResize` 之后、`global.ElysiaShared = ...` 之前）：

```js
  /**
   * 生成结尾区的星屑背景。
   *
   * ⚠ Inventory §2.3.7 记载各页在这 5 处有分歧，因此全部参数化。
   *   调用方必须显式传入自己原本的区间值——**不要用默认值偷懒**，
   *   否则会静默改掉有些页面的星星密度。
   *
   * @param {HTMLElement} container
   * @param {object} opts
   * @param {number} opts.count     星星数量（各页算法不同，调用方算好再传）
   * @param {number[]} [opts.minO]  最小不透明度区间 [lo, hi]
   * @param {number[]} [opts.maxO]  最大不透明度区间
   * @param {number[]} [opts.dur]   动画时长区间（秒）
   * @param {number[]} [opts.delay] 动画延迟区间（秒）
   * @param {string[]} [opts.colors] 颜色池，随机取
   */
  function spawnEndingStars(container, opts) {
    var o = opts || {};
    var rnd = function (r, fallback) {
      if (!r || r.length !== 2) return fallback;
      return r[0] + Math.random() * (r[1] - r[0]);
    };
    var colors = o.colors || ['#fff'];
    var n = o.count || 0;

    for (var i = 0; i < n; i++) {
      var star = document.createElement('div');
      star.className = 'ending-star';
      var size = (0.5 + Math.random() * 2).toFixed(1);
      star.style.cssText =
        'width:' + size + 'px;height:' + size + 'px;' +
        'left:' + (Math.random() * 100) + '%;top:' + (Math.random() * 100) + '%;' +
        '--min-o:' + rnd(o.minO, 0.1).toFixed(2) + ';' +
        '--max-o:' + rnd(o.maxO, 0.5).toFixed(2) + ';' +
        '--dur:' + rnd(o.dur, 2).toFixed(1) + 's;' +
        '--delay:' + rnd(o.delay, 0).toFixed(1) + 's;' +
        'background:' + colors[Math.floor(Math.random() * colors.length)] + ';';
      container.appendChild(star);
    }
  }
```

- [ ] **Step 6: 逐页替换结尾星星生成，并传入该页原值**

对每页，把原来的星屑循环换成 `spawnEndingStars`，**区间值从该页原代码里抄**。以 `index.html` 为例，原值（`index.html:841-850`）是：

```js
    var minO = (0.1 + Math.random() * 0.3).toFixed(2);
    var maxO = (0.5 + Math.random() * 0.5).toFixed(2);
    var dur = (2 + Math.random() * 4).toFixed(1);
    var delay = (Math.random() * 5).toFixed(1);
    'background:' + (Math.random() > 0.3 ? '#fff' : '#c77dff') + ';'
```

对应调用：

```js
  // 呀！这些区间是每一页自己的脾气，抽出来的时候一个数都不敢动呢♥
  ElysiaShared.spawnEndingStars(
    document.getElementById('endingStars'),
    {
      count: Math.min(80, Math.floor(window.innerWidth / 12)),
      minO: [0.1, 0.4], maxO: [0.5, 1.0], dur: [2, 6], delay: [0, 5],
      colors: ['#fff', '#fff', '#fff', '#c77dff'],
    }
  );
```

> 注意 `'background: random() > 0.3 ? white : purple'` 的写法，等价于颜色池里白 3 份、紫 1 份——**这也是为什么 `colors` 要收数组而不是「主色 + 概率」**。其它页的区间与颜色池**各不相同，逐页抄**。

- [ ] **Step 7: 快照比对**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-task6
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline after-task6; echo "退出码 $?"
```

期望：`✅ 无差异`。

> `.ending-star` 本身是随机的，但 `snapshot_diff.py` 采样的是**该选择器的第一个元素**，其 `--min-o` 等自定义属性**不在 `PROPS` 列表里**，所以随机性不会污染比对。若仍报差异，检查是不是 `.ending-star` 的 `width`/`background-color` 被采到了——那种情况下把它加进 `IGNORE_PROPS`。

- [ ] **Step 8: 验证 resize 后粒子仍正常**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  size 1920x1080 sleep 2000 \
  eval "(()=>{const c=document.getElementById('petalCanvas');return 'resize 前 '+c.width+'x'+c.height})()" \
  size 800x600 sleep 900 \
  eval "(()=>{const c=document.getElementById('petalCanvas');return 'resize 后 '+c.width+'x'+c.height})()" 2>&1
```

期望：`1920x1080` → `800x600`（证明 `makeResize` 真的被绑上了）。

- [ ] **Step 9: 提交**

```bash
git add assets/site.js index.html aponia/index.html eden/index.html kalpas/index.html kevin/index.html su/index.html villv/index.html
git commit -m "抽出共享 JS：resize 工厂与结尾星星生成（villv 原缺守卫，保持原行为）"
```

---

### Task 7: 抽子页公共 JS —— 语录卡与滚动进场

**Files:**
- Modify: `assets/site.js`
- Modify: 6 个子页（**不含 index**）

**Interfaces:**
- Consumes: `assets/site.js`
- Produces: `buildQuoteCards(opts)`、`observeReveal(selector, opts)`

**为什么 index 不参与**：index 的语录卡有配音逻辑（`window.QUOTE_AUDIO`）、结尾观察器用的是 `epilogueQuote` 且没有 `backLink`（Inventory §4 第 6 步）。

**顺带修掉的正事**：6 个子页现在是 `Array.prototype.indexOf.call(grid.querySelectorAll('.quote-card'), card)`，**每次点击都重扫 DOM**；index 用的是闭包索引 `var cur = i`。本任务统一成**闭包 O(1) 版本**——这是设计文档 §5-P1 明确要求的一项。

- [ ] **Step 1: 确认 6 个子页这两段确实逐字节一致**

```bash
cd <repo 根>
for f in aponia eden kalpas kevin su villv; do
  echo -n "$f: quotes-grid构建=$(grep -c 'quotes-grid' $f/index.html) "; 
  echo "indexOf.call=$(grep -c 'indexOf.call' $f/index.html)"
done
```

期望：6 页都是 `indexOf.call` 命中 1 次（这就是要替换掉的写法）。

- [ ] **Step 2: 写 `buildQuoteCards`**

追加到 `assets/site.js`：

```js
  /**
   * 构建语录卡并绑定点击切换。
   *
   * ★ 用闭包索引（O(1)），不用 `indexOf.call(querySelectorAll(...))`（每次点击重扫 DOM）。
   *   这是设计文档 §5-P1 明确要求的一项改进，index.html 早就是闭包写法了。
   *
   * @param {object} opts
   * @param {HTMLElement} opts.grid   容器（如 #quotesGrid）
   * @param {string[]}    opts.quotes 语录数组
   * @param {function}   [opts.onShow] 切换后回调 (newIndex) => void，供配音等扩展
   * @param {string}     [opts.hintText] 卡片右下角提示文案，默认「点击切换」
   */
  function buildQuoteCards(opts) {
    var grid = opts.grid;
    var quotes = opts.quotes || [];
    if (!grid || !quotes.length) return;

    quotes.forEach(function (q, i) {
      var card = document.createElement('div');
      card.className = 'quote-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      // ★ 让读屏用户听到内容而不是 10 个一样的标签
      card.setAttribute('aria-label', '语录：' + q + '（点击切换下一句）');

      var textEl = document.createElement('div');
      textEl.className = 'quote-text';
      textEl.textContent = q;

      var hint = document.createElement('span');
      hint.className = 'quote-hint';
      hint.textContent = opts.hintText || '点击切换';

      card.appendChild(textEl);
      card.appendChild(hint);

      var cur = i;                       // 闭包固化索引，O(1)
      function advance() {
        var next = (cur + 1) % quotes.length;
        textEl.classList.add('fading');
        setTimeout(function () {
          textEl.textContent = quotes[next];
          cur = next;
          textEl.classList.remove('fading');
          if (opts.onShow) opts.onShow(next);
        }, 400);
      }

      card.addEventListener('click', advance);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); }
      });

      grid.appendChild(card);
    });
  }
```

- [ ] **Step 3: 写 `observeReveal`**

```js
  /**
   * 滚动进场观察器。
   *
   * ⚠ 统一采用「带判空」的写法。这不是纯重构——6 个子页原本没有判空
   *   （Inventory §3-R11），若某页缺少目标元素，原代码会抛异常。
   *   本改动已单独在 commit 信息里标注为行为修复。
   *
   * @param {string} selector
   * @param {object} [opts]
   * @param {number} [opts.threshold]
   * @param {string} [opts.rootMargin]
   * @param {string[]} [opts.classes] 命中时添加的类名，默认 ['visible']
   */
  function observeReveal(selector, opts) {
    var o = opts || {};
    var nodes = document.querySelectorAll(selector);
    if (!nodes.length) return null;

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        (o.classes || ['visible']).forEach(function (c) {
          entry.target.classList.add(c);
        });
      });
    }, {
      threshold: o.threshold != null ? o.threshold : 0.15,
      rootMargin: o.rootMargin || '0px 0px -50px 0px',
    });

    nodes.forEach(function (n) { obs.observe(n); });
    return obs;
  }
```

- [ ] **Step 4: 6 个子页替换**

以 `kevin/index.html` 为例，把两段内联代码换成：

```js
  ElysiaShared.buildQuoteCards({
    grid: document.getElementById('quotesGrid'),
    quotes: quotes,
  });

  ElysiaShared.observeReveal('.timeline-node');
```

**注意**：各页的语录数组变量名可能不同（有的叫 `quotes`、有的叫 `list`）——照该页实际名字传，不要改名。滚进场的阈值与 `rootMargin` 若该页与默认值不同，**显式传该页原值**。

- [ ] **Step 5: 逐页确认 `indexOf.call` 已清零**

```bash
cd <repo 根>
for f in aponia eden kalpas kevin su villv; do
  printf "%-8s indexOf.call=%s\n" "$f" "$(grep -c 'indexOf.call' $f/index.html)"
done
```

期望：全部为 `0`。

- [ ] **Step 6: 验证语录卡点击真的会换句，且连点 20 次不串位**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/kevin/ \
  sleep 2200 \
  eval "document.querySelectorAll('.quote-card').length" \
  eval "document.querySelector('.quote-text').textContent" \
  eval "(()=>{const c=document.querySelectorAll('.quote-card')[3];for(let i=0;i<20;i++)c.click();return '点了 20 次'})()" \
  sleep 1200 \
  eval "document.querySelectorAll('.quote-card')[3].querySelector('.quote-text').textContent" \
  eval "document.querySelectorAll('.quote-card')[0].querySelector('.quote-text').textContent" 2>&1
kill %1 2>/dev/null
```

期望：卡片数量正确；第 4 张连点 20 次后文案已变（20 % 10 == 0，所以若语录是 10 条**会绕回原句**——此时改用 17 次）；**第 1 张的文案未被影响**（证明闭包索引没串位）。

- [ ] **Step 7: 快照比对**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-task7
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline after-task7; echo "退出码 $?"
```

期望：`✅ 无差异`。

- [ ] **Step 8: 提交**

```bash
git add assets/site.js aponia/index.html eden/index.html kalpas/index.html kevin/index.html su/index.html villv/index.html
git commit -m "抽子页公共 JS：语录卡改用闭包 O(1) 索引，滚动进场观察器加判空

- 语录卡：indexOf.call 改为闭包索引（设计文档 §5-P1 要求）
- observeReveal 统一带判空：这是行为修复，非纯重构（Inventory R11）"
```

---

### Task 8: 抽打字机

**Files:**
- Modify: `assets/site.js`
- Modify: 7 页（不含 armor）

**Interfaces:**
- Produces: `makeTypewriter(opts)`

Inventory §2.3.3 记载三个数值各页不同，且 `kalpas` / `su` 独有 `hintEl.classList.add('visible')`。

- [ ] **Step 1: 抄出各页的三个数值**

```bash
cd <repo 根>
for f in index.html kevin/index.html kalpas/index.html su/index.html eden/index.html aponia/index.html villv/index.html; do
  echo "===== $f ====="
  grep -n -A4 "function typeNext" "$f" | head -8
done
```

把每页的**起始延迟、每字延迟基数、每字延迟随机幅度**记下来。

- [ ] **Step 2: 写 `makeTypewriter`**

```js
  /**
   * 打字机效果。
   *
   * ⚠ Inventory §2.3.3：三个数值各页不同，且 kalpas/su 独有 hintEl 点亮。
   *   调用方必须传自己原本的数值——**不要依赖默认值**。
   *
   * @param {object} opts
   * @param {HTMLElement} opts.el        写入文本的元素
   * @param {HTMLElement} [opts.cursor]  光标元素，打完隐藏
   * @param {string}      opts.text      要打的文本
   * @param {number}      opts.delay     每字基础延迟（毫秒）
   * @param {number}      [opts.jitter]  每字额外随机延迟（毫秒）
   * @param {number}      [opts.startDelay] 开打前的等待（毫秒）
   * @param {HTMLElement} [opts.subEl]     打完显示的副标题（加 .visible）
   * @param {HTMLElement} [opts.hintEl]    kalpas/su 专用：打完点亮的提示元素
   * @param {number}      [opts.hintDelay] 副标题到提示之间的等待（毫秒），默认 1200
   */
  function makeTypewriter(opts) {
    var el = opts.el;
    if (!el) return;
    var i = 0;
    var text = opts.text || '';
    var delay = opts.delay != null ? opts.delay : 160;
    var jitter = opts.jitter != null ? opts.jitter : 80;

    function step() {
      if (i < text.length) {
        el.textContent += text[i];
        i++;
        setTimeout(step, delay + Math.random() * jitter);
        return;
      }
      setTimeout(function () {
        if (opts.cursor) opts.cursor.classList.add('hidden');
        if (opts.subEl) opts.subEl.classList.add('visible');
        setTimeout(function () {
          if (opts.hintEl) opts.hintEl.classList.add('visible');
        }, opts.hintDelay != null ? opts.hintDelay : 1200);
      }, 600);
    }

    setTimeout(step, opts.startDelay != null ? opts.startDelay : 800);
  }
```

- [ ] **Step 3: 逐页替换，传入该页原值**

```js
  ElysiaShared.makeTypewriter({
    el: document.getElementById('typewriterText'),
    cursor: document.getElementById('typingCursor'),
    subEl: document.getElementById('openingSub'),
    text: '嗨，想我了吗？',
    delay: 160, jitter: 80, startDelay: 800,
  });
```

> `delay` / `jitter` / `startDelay` **逐页抄该页原值**。`hintEl` 只给 kalpas 与 su 传；其余页**不传**（传了会改变行为）。

- [ ] **Step 4: 验证打字总时长与基线一致**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  sleep 2500 \
  eval "document.getElementById('typewriterText').textContent" \
  eval "document.getElementById('typingCursor').classList.contains('hidden')" \
  eval "document.getElementById('openingSub').classList.contains('visible')" 2>&1
kill %1 2>/dev/null
```

期望：文本为「嗨，想我了吗？」；光标已隐藏；副标题已显示。

- [ ] **Step 5: 专门验 kalpas 的 hintEl**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/kalpas/ \
  sleep 3500 \
  eval "Array.from(document.querySelectorAll('.opening-hint,.scroll-hint')).map(e=>e.className+' | visible='+e.classList.contains('visible')).join(' ; ')" 2>&1
kill %1 2>/dev/null
```

期望：`kalpas` 的提示元素带 `visible`。**与基线对比**——若基线里它没有 `visible`，说明传错了。

- [ ] **Step 6: 快照比对**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-task8
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline after-task8; echo "退出码 $?"
```

期望：`✅ 无差异`。

- [ ] **Step 7: 提交**

```bash
git add assets/site.js index.html kevin/index.html kalpas/index.html su/index.html eden/index.html aponia/index.html villv/index.html
git commit -m "抽共享 JS：打字机（数值逐页参数化，kalpas/su 的 hintEl 单独处理）"
```

---

### Task 9: 全站减动保护

**Files:**
- Modify: `assets/site.css`（新增 `@media (prefers-reduced-motion: reduce)` 段）
- Modify: `villv/index.html`（`fireKevinKiller666()` 加护栏）
- Modify: `kalpas/index.html`（`startRage()` 加护栏）
- Modify: `index.html`（点击涟漪补 `reducedMotion` 判断）

**Interfaces:**
- Consumes: `assets/site.css`
- Produces: 全站减动偏好生效

**⚠ 本任务的 index 涟漪部分与 villv/kalpas 护栏都是「行为变更」**，不是纯重构。三个改动**各单独一个 commit**，信息里标明。

> ✅ **决定（2026-09-16，需求方拍板）：index 的点击涟漪保持现状，不改。**
>
> 三种处置里选了「不改」——本次抽取不动任何行为，只搬位置，让 P1 的
> 「全程不改变任何页面的视觉呈现」字面成立。首页涟漪在减弱动效下仍然迸发花瓣
> 这件事，作为**独立问题**另行跟踪，不混进这轮重构。
>
> **执行 Task 9 时跳过 `index.html`**，不要给点击监听器补 `if (reducedMotion) return;`。
> （其余 6 个子页本来就有这个判断，只有首页缺——现状即如此，不是本轮引入的。）
>
> 决定依据：`index.html` 定义了 `reducedMotion` 却从未使用（L746 定义 / L856 监听器），
> 看起来更像漏写而非有意设计；但这属于产品判断，交需求方定。

**这是设计文档 §5-P1 明确要求的一项**，也是此前评审里唯一的 WCAG 2.3.1 风险点（villv 的全屏白闪 + kalpas 的全页抖动）。

- [ ] **Step 1: 在 `assets/site.css` 末尾追加减动段**

```css
/* ==========================================================================
   减动保护 —— 全站统一
   Inventory §3 记载：此前 `prefers-reduced-motion` 只在 JS 的 canvas
   与部分涟漪中处理，所有 CSS 动画一条都没有降级。
   这一段补上。放在共享文件里，8 页一次生效。
   ========================================================================== */
@media (prefers-reduced-motion: reduce) {
  /* 关掉所有装饰性动画 */
  *,*::before,*::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
  /* 打字机光标不要闪 */
  .typing-cursor { animation: none; opacity: 1; }
  /* 星星定格在一个中间亮度，不要一闪一闪 */
  .ending-star { animation: none; opacity: .5; }
  /* 花瓣、卡片的浮动停住 */
  .profile-card, .hero-card, .scroll-chevron { animation: none; }
}
```

- [ ] **Step 2: 验证 CSS 段生效**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  sleep 2000 \
  eval "getComputedStyle(document.querySelector('.typing-cursor')).animationName" \
  eval "matchMedia('(prefers-reduced-motion: reduce)').matches" 2>&1
kill %1 2>/dev/null
```

期望：第二条为 `false`（本机默认）。**第一条仍为 `blink-cursor`，这是对的**——减动段只在偏好打开时生效。

> 要真正验证减动路径，需手动把 Edge 的「减少动态效果」打开后重跑。**这在验收清单里标记为必做的人工步骤。**

- [ ] **Step 3: ⚠ 行为修复 —— index 的点击涟漪补 `reducedMotion`**

`index.html:856` 的 click 监听器没有判断减动。找到它，在函数体开头加：

```js
  document.addEventListener('click', function(e) {
    if (reducedMotion) return;   // 呀！她说不要晃，那就不晃了♥
    // ...原来的花瓣迸发逻辑
  });
```

`reducedMotion` 变量在该页已有的（`index.html:746`）。

```bash
cd <repo 根>
grep -n "reducedMotion" index.html
```

期望：命中 3 处（定义处、canvas animate 处、新增的涟漪处）。

- [ ] **Step 4: ⚠ 行为修复 —— `villv` 的 666 演出加护栏**

`villv/index.html` 的 `fireKevinKiller666()`（约 `villv:1094-1136`）会触发全屏白闪 `kk-flash`、`0.1s` 全页抖动 `kk-quake`、`0.12s` 无限抖动 `kk-jitter`——**这是光敏性癫痫风险（WCAG 2.3.1）**。

在函数开头加：

```js
  function fireKevinKiller666() {
    // ⚠ 减动偏好下跳过全部闪烁/抖动，只保留文字与最终状态。
    //    这是无障碍修复，不是重构——全屏白闪 + 高频抖动有光敏性癫痫风险。
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // ...原逻辑，在添加 kk-flash / kk-quake / kk-jitter 类的分支上包一层 if (!reduced)
  }
```

具体做法：把「添加闪烁/抖动类名」的那几行包进 `if (!reduced) { ... }`，**其余（文字替换、遮罩显示、按钮状态）照常执行**。

- [ ] **Step 5: ⚠ 行为修复 —— `kalpas` 的震屏加护栏**

`kalpas/index.html` 的 `startRage()`（约 `kalpas:719-740`）触发 `rage-pulse`（0.5s 无限）与 `rage-quake`（0.09s 全页抖动）。同法加护栏。

同时 `kalpas:295` 的 `#rageHud` 视觉上是进度条但只是个 `div`，补上语义：

```html
<div id="rageHud" role="progressbar" aria-label="怒气" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
```

并在更新怒气值的地方同步 `setAttribute('aria-valuenow', 值)`。

- [ ] **Step 6: 验证两处护栏不会误伤正常路径**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/villv/ \
  sleep 2500 \
  eval "typeof fireKevinKiller666 === 'function' ? '函数存在' : '函数不存在'" \
  eval "document.body.classList.contains('kk-on')" 2>&1
kill %1 2>/dev/null
```

期望：函数存在；默认（无减动偏好）下 `kk-on` 为 `false`（尚未触发）。**手动触发一次演出，确认在有减动与无减动两种设置下都不报错。**

- [ ] **Step 7: 快照比对（默认无减动偏好，应与基线一致）**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-task9
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline after-task9; echo "退出码 $?"
```

期望：`✅ 无差异`。**若 index 出现差异**，是因为涟漪被改了——但那只在点击时才有可观察差异，静态快照不该有。有差异说明改错了位置。

- [ ] **Step 8: 分三次提交**

```bash
git add assets/site.css
git commit -m "共享样式新增全站 prefers-reduced-motion 段"

git add index.html
git commit -m "行为修复：首页点击涟漪补 prefers-reduced-motion 判断

首页早已定义 reducedMotion 变量却没用它（其余 6 页都有判断）。
统一后首页在减弱动效偏好下不再迸发花瓣——这是有意的行为变更。"

git add villv/index.html kalpas/index.html
git commit -m "行为修复：666 演出与怒气震屏加减动护栏，怒气条补 ARIA

全屏白闪（villv kk-flash）与高频全页抖动（kalpas rage-quake 0.09s）
此前无任何减动保护，属 WCAG 2.3.1 风险。"
```

---

### Task 10: index 专项

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `assets/site.css`、`assets/site.js`
- Produces: index 完成接入；此后再无重复定义

index 是最复杂的页面：多 `<style>` 块、多 `<script>` 块、大量页面专属逻辑（英雄名片 / 寄语切换 / 生日彩蛋）。

- [ ] **Step 1: 盘点 index 还剩哪些与 A 组重复的定义**

```bash
cd <repo 根>
for sel in '*,*::before' 'html{' '::-webkit-scrollbar' 'blink-cursor' 'chevron-bounce' 'twinkle' 'card-rotate' \
           'timeline-node.visible' 'quotes-grid' 'section-ending' 'ending-star' 'ending-fade' 'profile-divider'; do
  printf "%-26s %s\n" "$sel" "$(grep -c "$sel" index.html)"
done
```

把还命中的逐条删掉。

- [ ] **Step 2: 合并 index 的多个 `<style>` 块**

index 有 3 个 `<style>` 块（`index.html:11`、`:1006`、`:1074`，其中最后一个还在 `</body>` 之后）。**本任务顺带修掉 `</body>` 位置错误**（`index.html:1072`）——把 1073 行之后的 `<style>`、`<div>`、`<script>` 全部移进 `</body>` 之前。

```bash
cd <repo 根>
grep -n "</body>\|</html>\|<body>" index.html
```

期望（修改后）：`<body>` 在 `</head>` 之后，`</body>` 在 `</html>` 紧邻的上一行，两者之间**不再有任何内容**。

- [ ] **Step 3: 确认 index 的专属逻辑一件没动**

以下四项**必须逐一功能验证**，它们在别处没有、只属于首页：

| 功能 | 验证方式 |
|---|---|
| 英雄名片点开/收起 | 点一次打开、再点空白收起 |
| 名片二次点击跳转 | 展开后再点 → 跳到 `/kevin/` 之类 |
| 寄语双切换 | 点一下换句 |
| 生日彩蛋 | 点右下角胶囊，面板打开 |

- [ ] **Step 4: 逐项验证**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/index.html \
  sleep 2500 \
  eval "(()=>{document.getElementById('ending').scrollIntoView();return 'ok'})()" sleep 900 \
  click ".hero-card" sleep 400 \
  eval "document.querySelectorAll('.hero-card.open').length" \
  click ".hero-card" sleep 400 \
  eval "location.pathname" \
  eval "document.querySelectorAll('.hero-card.open').length" 2>&1
kill %1 2>/dev/null
```

期望：第一次点后 `.hero-card.open` 为 `1`；第二次点后 `location.pathname` 变为 `/kevin/` 或 `/eden/` 等（按点的是哪张）。

> 若跳转到了 404，说明本地服务器下 `/kevin/` 找不到索引——确认 `python -m http.server` 是从仓库根启动的。

- [ ] **Step 5: 快照比对**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-task10
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline after-task10; echo "退出码 $?"
```

期望：`✅ 无差异`。

- [ ] **Step 6: 提交**

```bash
git add index.html
git commit -m "首页完成共享层接入，并修正 </body> 位置错误"
```

---

### Task 11: armor 专项（含修 `--gold-soft`）

**Files:**
- Modify: `armor.html`

**Interfaces:**
- Consumes: `assets/site.css`
- Produces: armor 接入**仅 8 条 8 页通用规则**；`--gold-soft` bug 修复

**⚠ 雷区 R12**：armor 的 `.timeline` 系列是**另一套结构**（`max-width:900px` vs `800px`、卡片 `calc(50% - 2.4rem)` vs `2.5rem`、768px 断点 `1.3rem` vs `1.5rem`、无 480px 断点）。**不要并入 7 页版本。**

**⚠ 雷区 R13**：`.back-link` 在 armor 与子页是两种完全不同的组件。

- [ ] **Step 1: 确认 armor 只吃这 8 条**

Inventory §1.1 记载 A 组里 8 页通用的只有 8 条：

```
*,*::before,*::after      html
::-webkit-scrollbar       ::-webkit-scrollbar-track
（以及 @keyframes 中 armor 实际用到的）
```

```bash
cd <repo 根>
echo "--- armor 用了哪些 keyframes ---"
grep -oE "animation:[a-z-]+" armor.html | sort -u
```

**只引入 armor 实际用到的 keyframes**。若 armor 用了 `card-rotate` 之外的东西，逐个核对。

- [ ] **Step 2: armor 加 `<link>`**

在 `<meta name="viewport" ...>` 之后插入：

```html
<!-- 呀！armor 是异形页——它只吃最通用的那几条，剩下的都留给它自己♥ -->
<link rel="stylesheet" href="/assets/site.css">
```

- [ ] **Step 3: 删掉 armor 里那 8 条的重复定义**

**只删 8 条通用的**。`.timeline*` / `.card-*` / `.type-badge*` / `.filter-chip` / `.back-link` **全部保留**。

- [ ] **Step 4: 修 `--gold-soft`（Inventory §1.4.3 确认的**唯一**一处变量未定义 bug）**

二选一，**推荐前者**（保持 4 个徽章的配色体系一致）：

**方案 A**：在 `armor.html` 的 `:root`（`armor.html:10-17`）里补上：

```css
  --gold-soft:#ffe5a0;
```

**方案 B**：把 `armor.html:82` 的 `.type-badge.skin` 改用已有的 `var(--gold)`：

```css
.type-badge.skin{background:rgba(255,209,102,.15);color:var(--gold);border:1px solid rgba(255,209,102,.4)}
```

本计划采用**方案 A**——`--gold-soft` 在 `index.html:17` 的定义就是 `#ffe5a0`，补上后与首页语义一致。

- [ ] **Step 5: 验证徽章颜色真的恢复了**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/armor.html \
  sleep 2500 \
  eval "getComputedStyle(document.querySelector('.type-badge.skin')).color" \
  eval "getComputedStyle(document.querySelector('.type-badge.armor')).color" \
  eval "getComputedStyle(document.querySelector('.type-badge.story')).color" 2>&1
kill %1 2>/dev/null
```

期望：`.skin` 的颜色是金色系（`rgb(255, 229, 160)` 即 `#ffe5a0`），而**不再是继承色**（修改前它应等于 `body` 的 `color`，即 `rgb(240, 230, 255)`）。

> **这一步是本次抽取唯一预期会有视觉变化的地方**，也是它该有的——bug 修好了就该变。

- [ ] **Step 6: 快照比对，并确认差异只有一处**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-task11
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline after-task11; echo "退出码 $?"
```

期望：**有一处差异**，且恰好是 `armor_*  .type-badge.skin  color`。**任何其它差异都必须查清**——尤其要确认 armor 的时间轴几何没被动过：

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline after-task11 2>&1 | grep -i "timeline" || echo "✅ 时间轴零差异（R12 已避开）"
```

- [ ] **Step 7: 目视核对 armor 全页**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
PYTHONIOENCODING=utf-8 python tools/cdp.py http://localhost:8500/armor.html \
  size 1280x900 sleep 2500 shot screenshots/armor-task11.png 2>&1
kill %1 2>/dev/null
```

用 Read 打开，与 `screenshots/snap/baseline/armor_1920.png` 对照：筛选芯片、卡片展开、皮肤徽章颜色。

- [ ] **Step 8: 提交**

```bash
git add armor.html
git commit -m "armor 接入共享层通用规则，修复 --gold-soft 未定义导致的皮肤徽章失色"
```

---

### Task 12: 收尾清理

**Files:**
- Modify: `assets/site.css`、`index.html`、`eden/index.html`、`kalpas/index.html`、`kevin/index.html`、`aponia/index.html`、`su/index.html`、`villv/index.html`、`armor.html`

**Interfaces:**
- Consumes: 全部前序任务
- Produces: 仓库干净，无死变量、无死 CSS

**⚠ 本任务与前面所有任务性质不同：它会改变输出（删掉东西）。因此必须单独 commit，且每一类删除单独一步、单独验证。**

- [ ] **Step 1: 删 9 个死变量**

Inventory §1.4.3 记载的死变量（定义了、从未引用）：

```
--bg-mid      （8 页全定义了、8 页全没用 ← 最离谱的一个）
--pink-deep   --pink-hot   --purple-ink   --gold-warm(index)
--wine-deep   --flame-deep --peacock      --magenta
```

**⚠ 删前逐个全局搜索**，确认没有 JS 动态读取：

```bash
cd <repo 根>
for v in bg-mid pink-deep pink-hot purple-ink gold-warm wine-deep flame-deep peacock magenta; do
  n=$(grep -rn -- "--$v" --include=*.html --include=*.js . | grep -v "^./docs" | grep -v "^\s*--$v:" | wc -l)
  printf "%-14s 引用数(除定义外)=%s\n" "$v" "$n"
done
```

**引用数不为 0 的不要删。** 尤其 `--gold-warm` 与 `--flame`（R4 雷区）——`--flame` 不在死变量列表里，别误删。

- [ ] **Step 2: 删 2 条 dead CSS**

Inventory §3-R5：`.ripple-spark`（`kalpas:265`）与 `.ripple-confetti`（`villv:303`）定义了但 JS 从没创建过对应元素。

```bash
cd <repo 根>
grep -n "ripple-spark" kalpas/index.html
grep -n "ripple-confetti" villv/index.html
```

确认各自只有 CSS 定义、JS 里零命中，然后删除。

- [ ] **Step 3: 快照比对**

```bash
cd <repo 根>
PYTHONIOENCODING=utf-8 python tools/snapshot.py after-task12
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py baseline after-task12; echo "退出码 $?"
```

期望：**与 after-task11 相比零差异**（除 `--gold-soft` 那一处已知变化）。

```bash
PYTHONIOENCODING=utf-8 python tools/snapshot_diff.py after-task11 after-task12; echo "退出码 $?"
```

这才是关键比对——删死代码**不该有任何输出变化**。

- [ ] **Step 4: 确认 8 页仍全部正常**

```bash
cd <repo 根>
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
for p in "" armor.html kevin/ eden/ aponia/ villv/ kalpas/ su/; do
  echo -n "http://localhost:8500/$p  "
  PYTHONIOENCODING=utf-8 python tools/cdp.py "http://localhost:8500/$p" \
    sleep 1600 eval "document.title" 2>&1 | tail -1
done
kill %1 2>/dev/null
```

期望：8 个标题全部正常，无空白、无报错。

- [ ] **Step 5: 统计收敛成果**

```bash
cd <repo 根>
echo "=== 各页行数（对比起始）==="
wc -l index.html armor.html */index.html assets/site.css assets/site.js
echo
echo "=== 8 页里还有没有共享层的残留重复 ==="
for sel in 'blink-cursor' 'chevron-bounce' 'twinkle' 'card-rotate' 'quotes-grid' 'section-ending'; do
  n=$(grep -l "$sel" index.html armor.html */index.html 2>/dev/null | wc -l)
  printf "%-18s 仍出现在 %s 个页面\n" "$sel" "$n"
done
```

记录收敛前后的行数对比，写进 commit 信息。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "清理共享层抽取后遗留的死变量与死 CSS"
```

---

## 自检记录

**规格覆盖**（对照设计文档 §5 P1 的四项要求）：

| 设计文档要求 | 本计划任务 |
|---|---|
| 抽取真正共享的 CSS/JS，收敛 8 份复制 | Task 1–8、10–11 |
| 顺带修 `armor.html:82` 的 `--gold-soft` | Task 11 Step 4 |
| 全站补齐 `prefers-reduced-motion` | Task 9 |
| 统一语录卡逻辑为闭包 O(1) | Task 7 Step 2 |
| 验收：8 页改动前后像素级一致 | Task 1 建立工具；每个任务都有比对步骤 |

**未纳入（刻意不做）**：

| 项 | 原因 |
|---|---|
| R10 · 给 villv 补粒子 resize 守卫 | 行为变更，不是重构。抽取时**刻意保留原行为**（Task 6 Step 4） |
| R14 · index 的 `env(safe-area-inset-*)` | Inventory §5.1-Q6 标为待确认，不猜 |
| Q1 · `.timeline-dot` 的 12/13/14px 三档 | Inventory §5.1-Q1 标为待确认，不猜 |
| Q7 · `villv:205` 的 `rgba(255,209,107,.04)` | 疑似笔误但无法确证，不猜 |
| Q8 · 各页 `glow-pulse` / `card-rotate` 时长差异 | Inventory 明确建议**保留每页各自的值，不要统一** |

**占位符扫描**：全文无 TBD / TODO / "类似上文" 式省略。Task 1 的两个工具给了完整代码；其余任务给出精确的替换代码与验证命令。

**契约一致性**：`ElysiaShared.makeResize` / `spawnEndingStars` / `buildQuoteCards` / `observeReveal` / `makeTypewriter` 五个函数在 Task 6–8 中定义，签名与参数名在各任务的调用示例中保持一致。`snapshot.py` 的 `<label>` 参数与 `snapshot_diff.py` 的两个位置参数在 Task 1 定义，后续每个任务都按同一形式调用。
