# elysiad.top 语录配音 + 装甲三轴时间轴 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复爱莉希雅致敬页的语录点击 bug 并接入真人配音，同时新增「装甲三轴时间轴」——主页面精简版 + 独立完整页。

**Architecture:** 纯静态前端（无构建、无框架）。共享数据文件 `data/timeline-data.js` 作为唯一数据源，主页面 `index.html` 只渲染精选里程碑，独立页 `armor.html` 全量渲染 + 四类筛选。音频用 `imageio-ffmpeg` 静态 ffmpeg 把 8 段 wma 转 mp3。所有交互验证用无头 Edge（CDP）真实点击 + 截图，符合全局 CLAUDE.md 的「必须看实际渲染」工作流。

**Tech Stack:** HTML5 + 原生 CSS/JS、无头 Edge + Chrome DevTools Protocol（验证）、Python + imageio-ffmpeg（转码）、`python -m http.server`（本地服务器）。

## Global Constraints

- 项目路径：`D:\claude-code\elysia\`，是 GitHub 仓库 **`elysiamsia/elysia`** 的工作副本（本地 `index.html` 与仓库 main 分支逐字节一致，线上 `elysiad.top` = 该仓库 GitHub Pages，main 分支根目录发布）。**仓库有 `dev` 与 `main` 两个分支；本次所有改动在本地 `dev` 分支上进行**（Task 1 `git init -b dev`，提交即落在 dev），最终由用户决定 dev → main 的合并/发布。本环境 git 直连 github 443 被拦（网页/gh api 可通），push 需用户侧执行或配代理。若用户不想要 git，跳过各任务的 commit 步骤即可，不影响其他步骤。
- 数据必须来自已确认的 `elysia/docs/timeline-data-draft.md`，**不得编造**；真我·人之律者版本 v6.0（约 2025-08）、粉色妖精小姐♪ v5.1（2021-09）、嗨♪爱愿妖精♥ v8.5（2025-10）为用户最终确认。
- 「往事的飞花·爱之诗」是粉色妖精小姐♪ 的**专武**（非皮肤）；「嗨♪爱愿妖精♥」是**可玩装甲**（非皮肤）；皮肤共 5 套（见 Task 3）。
- 语录 10 条，前 8 条有真人配音（`audio/01_嗨想我了吗.mp3` … `audio/08_愿你前行的道路有群星闪耀.mp3`），第 9、10 条无配音静音切换。配音映射显式写在数据文件里，不靠位次猜。
- NodeList 没有 `indexOf`——语录修复必须用**闭包索引**，不得再调用 `querySelectorAll(...).indexOf(...)`。
- 视觉风格必须沿用现有 `index.html` 的设计语言：粉紫玻璃拟态、`--pink/* 系列变量、section-title-petal 飞花标题、`backdrop-filter`。
- 文件路径含中文（`audio/01_嗨想我了吗.mp3`），本地 server 用 `python -m http.server 8500`，浏览器直接以相对路径 `new Audio('audio/01_嗨想我了吗.mp3')` 引用（浏览器自动做 URL 编码，可正常播放）。
- 移动端 `@media(max-width:768px)` 时间线单列规则与现有页面保持一致。

---

### Task 1: 项目初始化 + 通用浏览器检查工具 cdp.py

**Files:**
- Create: `D:\claude-code\elysia\.gitignore`
- Create: `D:\claude-code\elysia\tools\cdp.py`
- Create: `D:\claude-code\elysia\tools\README.md`

**Interfaces:**
- Consumes: 无（新项目）。
- Produces: `tools/cdp.py`，供 Tasks 4–8 做真机验证。命令行用法：
  `python tools/cdp.py <url> [动作...]`，动作串行执行：
  - `eval "<js表达式>"` → 返回值为 JSON 打印
  - `click "<CSS选择器>" [序号]` → 用 CDP Input 域真实鼠标点击第 n（默认 0）个匹配元素中心
  - `sleep <毫秒>` → 等待渲染/动画
  - `shot <输出.png>` → 全页截图
  - `text` → 打印 `document.body.innerText`
  每个动作的返回值/产物即该验证步骤的断言对象。

- [ ] **Step 1: git init 并切到 dev 基线分支**（仓库已有 `dev` 分支，本次改动全部落在 dev）

```bash
cd "D:/claude-code/elysia" && git init -b dev
git remote add origin https://github.com/elysiamsia/elysia.git
git config user.name "elysiamsia"
git config user.email "elysiamsia@users.noreply.github.com"
# 若本环境能 git fetch（可能因 443 被拦而失败，失败则跳过）：
git fetch origin 2>/dev/null || echo "fetch 失败跳过（网络受限），将作为全新 dev 历史提交"
git branch --set-upstream-to=origin/dev dev 2>/dev/null || true
```

（本环境 git 直连 443 被拦，`git remote -v` 能配上即可；push/合并由你在 GitHub 侧执行或配代理。若 `git fetch` 成功则本地与线上 dev 对齐；失败就把本地提交当作新的 dev 基线，由你决定如何并入线上 dev。）

创建 `.gitignore` 内容（忽略临时文件与本地验证产物）：

```
*.pyc
__pycache__/
screenshots/
/tmp/
```

- [ ] **Step 2: 写通用 CDP 检查工具 `tools/cdp.py`**

完整代码如下（基于本会话已验证可行的 Edge CDP 脚本，动作化封装）：

```python
# tools/cdp.py — 无头 Edge CDP 检查工具（本地验证用，不属于站点资源）
import json, time, subprocess, sys, threading, urllib.request
import websocket

EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

def main(url, actions):
    port = 9320
    proc = subprocess.Popen([
        EDGE, f'--remote-debugging-port={port}',
        '--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-allow-origins=*',
        '--user-data-dir=C:/tmp/edge_cdp', '--window-size=1280,900',
        'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        targets = []
        for _ in range(12):
            try:
                targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json'))
                break
            except Exception:
                time.sleep(0.5)
        ws_url = next(t['webSocketDebuggerUrl'] for t in targets if t.get('type') == 'page')
        ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=60)
        _id = 0
        def send(method, params=None):
            nonlocal _id
            _id += 1
            ws.send(json.dumps({'id': _id, 'method': method, 'params': params or {}}))
            while True:
                r = json.loads(ws.recv())
                if r.get('id') == _id:
                    return r
        send('Page.enable'); send('Runtime.enable')
        send('Page.navigate', {'url': url})
        time.sleep(4)

        def ev(expr, await_=True):
            r = send('Runtime.evaluate', {
                'expression': expr, 'returnByValue': True, 'awaitPromise': await_,
            })
            return r['result']['result'].get('value') if r.get('result') else None

        i = 0
        while i < len(actions):
            act = actions[i]
            if act == 'eval':
                print(ev(actions[i + 1])); i += 2
            elif act == 'click':
                sel = actions[i + 1]
                idx = int(actions[i + 2]) if i + 2 < len(actions) and actions[i + 2].isdigit() else 0
                i += 2 if i + 2 >= len(actions) or not actions[i + 2].isdigit() else 3
                pos = ev(f'''(() => {{
                    const els = document.querySelectorAll({json.dumps(sel)});
                    if (!els.length) return null;
                    const r = els[{idx}].getBoundingClientRect();
                    return JSON.stringify({{x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)}});
                }})()''')
                if not pos:
                    print(f'click "{sel}" -> NO MATCH'); continue
                p = json.loads(pos)
                send('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': p['x'], 'y': p['y'], 'button': 'left', 'clickCount': 1})
                send('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': p['x'], 'y': p['y'], 'button': 'left', 'clickCount': 1})
                print(f'click "{sel}"[{idx}] -> clicked ({p["x"]},{p["y"]})')
            elif act == 'sleep':
                time.sleep(int(actions[i + 1]) / 1000); i += 2
            elif act == 'shot':
                out = actions[i + 1]
                r = send('Page.captureScreenshot', {})
                data = r.get('result', {}).get('data')
                if data:
                    open(out, 'wb').write(__import__('base64').b64decode(data))
                    print(f'shot {out} saved')
                else:
                    print('shot FAILED', r)
                i += 2
            elif act == 'text':
                print(ev('document.body.innerText'))
                i += 1
            else:
                print('unknown action:', act); i += 1
        ws.close()
    finally:
        proc.terminate()

if __name__ == '__main__':
    args = sys.argv[1:]
    url = args[0]
    main(url, args[1:])
```

注：`websocket-client` 需已安装（本会话已装；若新环境缺，先 `pip install websocket-client`）。

- [ ] **Step 3: 写 tools/README.md**

```markdown
# tools/ 本地开发工具（不属于站点资源）

- `cdp.py` — 无头 Edge 真机验证工具。用法：
  `python tools/cdp.py http://localhost:8500/index.html eval "document.title" click ".quote-card" sleep 700 text shot screenshots/index.png`
- `convert_audio.py`（见 Task 2）— wma → mp3 转码。
```

- [ ] **Step 4: 自检验证工具可用**

启动服务器并验证工具链：

```bash
cd "D:/claude-code/elysia"
python -m http.server 8500 >/dev/null 2>&1 &
sleep 2
mkdir -p screenshots
python tools/cdp.py http://localhost:8500/index.html eval "document.title" shot screenshots/smoke.png
```

期望输出：第一行打印页面标题（含「致爱莉希雅」），第二行 `shot ... saved`。（若 `localhost` 被 hosts 拦截，改访问 `http://127.0.0.1:8500/index.html`。）

- [ ] **Step 5: Commit**

```bash
git add .gitignore tools/
git commit -m "chore: init project and add CDP verification tool"
```

---

### Task 2: 转码 8 段真人配音 wma → mp3

**Files:**
- Create: `D:\claude-code\elysia\tools\convert_audio.py`
- Create: `D:\claude-code\elysia\audio\01_嗨想我了吗.mp3` … `audio\08_愿你前行的道路有群星闪耀.mp3`

**Interfaces:**
- Consumes: Task 1 的 `tools/cdp.py`（用于任务尾验证文件可达性）。
- Produces: `audio/` 下 8 个 mp3（128k），文件名与 wma 同名。Task 3 的 `QUOTE_AUDIO['1'..'8']` 引用这些路径；Task 4 播放。

- [ ] **Step 1: 写转码脚本 `tools/convert_audio.py`**

```python
# tools/convert_audio.py — 把 elysia 目录下所有 *.wma 转成 audio/*.mp3（128k）
import os, subprocess, sys, glob
sys.stdout.reconfigure(encoding='utf-8')
import imageio_ffmpeg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # D:\claude-code\elysia
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
AUDIO = os.path.join(ROOT, 'audio')
os.makedirs(AUDIO, exist_ok=True)

wm = sorted(glob.glob(os.path.join(ROOT, '*.wma')))
print(f'found {len(wm)} wma files')
for src in wm:
    base = os.path.splitext(os.path.basename(src))[0]
    dst = os.path.join(AUDIO, base + '.mp3')
    r = subprocess.run([FFMPEG, '-y', '-i', src, '-c:a', 'libmp3lame', '-b:a', '128k', dst],
                       capture_output=True)
    if r.returncode == 0:
        print(f'OK  {os.path.basename(src)} -> {os.path.basename(dst)} ({os.path.getsize(dst)}B)')
    else:
        print(f'FAIL {os.path.basename(src)}')
        print(r.stderr.decode('utf-8', errors='ignore')[-300:])
```

- [ ] **Step 2: 运行转码并确认 8 个 mp3 全部生成**

```bash
cd "D:/claude-code/elysia" && python tools/convert_audio.py
```

期望输出：8 行 `OK ... -> audio/...mp3 (xxxxxB)`，无 `FAIL`。此时根目录里那个旧 `01_嗨想我了吗.mp3`（Task 0 遗留）删除，统一以 `audio/` 为准：

```bash
rm "D:/claude-code/elysia/01_嗨想我了吗.mp3"
```

- [ ] **Step 3: 用 CDP 验证 mp3 可经本地服务器加载**

```bash
python tools/cdp.py http://localhost:8500/audio/01_嗨想我了吗.mp3 eval "(function(){var a=new Audio(document.URL.slice(0,document.URL.indexOf('audio'))+'audio/01_嗨想我了吗.mp3');a.preload='auto';return 'readyState after load: '+a.readyState;})()"
```

期望输出：`readyState after load: 0` 或 `1`（0=已建立加载，1=有元数据；只要不抛错即路径可用）。若抛出「Failed to fetch / 404」，检查 http.server 是否从 elysia 根目录启动。

- [ ] **Step 4: Commit**

```bash
git add audio/ tools/convert_audio.py
git commit -m "feat: convert 8 elysia voice lines to mp3 under audio/"
```

---

### Task 3: 共享数据文件 `data/timeline-data.js`

**Files:**
- Create: `D:\claude-code\elysia\data\timeline-data.js`

**Interfaces:**
- Consumes: Task 2 的 `audio/*.mp3` 路径。
- Produces:
  - `window.TIMELINE_DATA`：数组，每条 `{id, type, title, subtitle, real_date|null, version|null, ingame_time|null, desc, detail|null, audio|null, featured, order}`。
    `type` ∈ `'armor' | 'skin' | 'story' | 'event'`。`order` 为排序键：story 类为剧情顺序 1–9；现实类用`real_date`前缀字符串比较（`YYYY-MM` 字典序即时间序）。
  - `window.QUOTE_AUDIO`：`{1:'audio/01_…', …, 8:'audio/08_…'}`，语录前 8 条的配音映射，Task 4 使用。

- [ ] **Step 1: 写数据文件（内容全部取自已确认的 timeline-data-draft.md）**

```js
/* 共享时间轴数据源 —— 唯一数据入口（主页面与 armor.html 共用）
   数据来源：米游社圣芙蕾雅档案馆 + B站崩坏3wiki + 用户逐条确认
   约定：type=armor|skin|story|event；real_date 现实日期（YYYY-MM）；version 游戏版本；ingame_time 游戏内时间 */
window.TIMELINE_DATA = [
  // ===== 可玩装甲（3 架）=====
  { id: 'armor-pink',     type: 'armor', title: '粉色妖精小姐♪',    subtitle: 'S级 · 异能 · 物理输出', real_date: '2021-09', version: 'v5.1',  ingame_time: '前文明纪元 · 往世乐土', desc: '初入乐土时与她相遇的那位粉色妖精。', detail: '专武：往事的飞花·爱之诗', audio: null, featured: true,  order: 11 },
  { id: 'armor-ego',      type: 'armor', title: '真我·人之律者',     subtitle: 'S级 · 异能 · 冰伤输出',  real_date: '2025-08', version: 'v6.0',  ingame_time: '前文明纪元 · 两种律者形态', desc: '人之律者与始源之律者两种形态自由切换的她。', detail: '专武：无瑕之眷·册礼', audio: null, featured: true,  order: 12 },
  { id: 'armor-elf',      type: 'armor', title: '嗨♪爱愿妖精♥',     subtitle: 'S级 · 星尘 · 冰冻输出',  real_date: '2025-10', version: 'v8.5',  ingame_time: '黄金庭院', desc: '黄金庭院中再度起舞的妖精。', detail: '专武：澄爱挚语·馨愿', audio: null, featured: true,  order: 13 },

  // ===== 皮肤（5 套）=====
  { id: 'skin-1', type: 'skin', title: '粉色甜心小姐', subtitle: '粉色妖精小姐♪ 皮肤', real_date: null, version: null, ingame_time: null, desc: '甜美的粉色少女心。', detail: null, audio: null, featured: false, order: 21 },
  { id: 'skin-2', type: 'skin', title: '夏日妖精小姐', subtitle: '粉色妖精小姐♪ 皮肤', real_date: null, version: null, ingame_time: null, desc: '在海边度过夏日的妖精。', detail: null, audio: null, featured: false, order: 22 },
  { id: 'skin-3', type: 'skin', title: '褪色妖精小姐', subtitle: '粉色妖精小姐♪ 皮肤', real_date: null, version: null, ingame_time: null, desc: '带着些许故事感的褪色光影。', detail: null, audio: null, featured: false, order: 23 },
  { id: 'skin-4', type: 'skin', title: '春好桃夭',     subtitle: '真我·人之律者 服装',  real_date: null, version: null, ingame_time: null, desc: '春日桃夭，灼灼其华。', detail: null, audio: null, featured: false, order: 24 },
  { id: 'skin-5', type: 'skin', title: '霁月婵娟',     subtitle: '嗨♪爱愿妖精♥ 服装',  real_date: null, version: null, ingame_time: null, desc: '雨霁月明，婵娟千里。', detail: null, audio: null, featured: false, order: 25 },

  // ===== 剧情事件（9 条，游戏内时间线）=====
  { id: 'story-1', type: 'story', title: '降生',     subtitle: '沃斯托克-51', real_date: null, version: null, ingame_time: '前文明纪元初期', desc: '从天而降的「小妖精」在梣树下被发现，被居民送往教堂旁福利院抚养。', detail: null, audio: null, featured: false, order: 1 },
  { id: 'story-2', type: 'story', title: '命名',     subtitle: '月下绘本',     real_date: null, version: null, ingame_time: '前文明纪元初期', desc: '生日收到第一份礼物——童话绘本，在月光下为自己取名「爱莉希雅」。', detail: null, audio: null, featured: false, order: 2 },
  { id: 'story-3', type: 'story', title: '离开',     subtitle: '瑟莉娅的祝福', real_date: null, version: null, ingame_time: '前文明纪元时期', desc: '为不拖累小镇，在「母亲」瑟莉娅的祝福中踏上寻找身世的旅途。', detail: null, audio: null, featured: false, order: 3 },
  { id: 'story-4', type: 'story', title: '游历',     subtitle: '世界舞台',     real_date: null, version: null, ingame_time: '前文明纪元时期', desc: '走遍世界见识人性善恶美丑，仍未寻到梦想中的乐园。', detail: null, audio: null, featured: false, order: 4 },
  { id: 'story-5', type: 'story', title: '逐火',     subtitle: '逐火之蛾',     real_date: null, version: null, ingame_time: '前文明纪元 · 崩坏纪元', desc: '既然找不到乐园，就自己创造一个——加入逐火之蛾成为融合战士。', detail: null, audio: null, featured: false, order: 5 },
  { id: 'story-6', type: 'story', title: '英桀',     subtitle: '逐火十三英桀', real_date: null, version: null, ingame_time: '前文明纪元后期', desc: '「约束的惨剧」后推动编制化，集结十三位英桀、授予位次与刻印。', detail: null, audio: null, featured: false, order: 6 },
  { id: 'story-7', type: 'story', title: '晚宴',     subtitle: '最后一舞',     real_date: null, version: null, ingame_time: '前文明纪元末期', desc: '自曝「第十三律者」身份，将讨伐晚宴布置成盛大宴会，自我消散。', detail: null, audio: null, featured: true,  order: 7 },
  { id: 'story-8', type: 'story', title: '乐土引路人', subtitle: '往世乐土',     real_date: null, version: null, ingame_time: '主线 5.x · 往世乐土', desc: '以记忆体身份成为雷电芽衣的引路人，引导她探寻前文明真相。', detail: null, audio: null, featured: true,  order: 8 },
  { id: 'story-9', type: 'story', title: '归来与谢幕', subtitle: '四朵水晶花',   real_date: null, version: null, ingame_time: '主线 5.x · 乐土结局', desc: '侵蚀之律者删除了她的数据，英桀们以封存的记忆重构她，共灭侵蚀、盛大谢幕。', detail: null, audio: null, featured: true, order: 9 },

  // ===== 活动与版本里程碑 =====
  { id: 'event-1', type: 'event', title: '往世乐土玩法开启', subtitle: '粉色妖精小姐♪ 实装', real_date: '2021-09', version: 'v5.1', ingame_time: null, desc: '往世乐土玩法开放，与她相逢的起始。', detail: null, audio: null, featured: true, order: 31 },
  { id: 'event-2', type: 'event', title: '真我·人之律者实装', subtitle: '装甲上线',          real_date: '2025-08', version: 'v6.0', ingame_time: null, desc: '真我·人之律者 装甲实装。', detail: null, audio: null, featured: false, order: 32 },
  { id: 'event-3', type: 'event', title: '嗨♪爱愿妖精♥ 实装', subtitle: '黄金庭院',         real_date: '2025-10', version: 'v8.5', ingame_time: null, desc: '嗨♪爱愿妖精♥ 装甲实装。', detail: null, audio: null, featured: false, order: 33 },
  { id: 'event-4', type: 'event', title: '她的生日',          subtitle: '11月11日',        real_date: '2025-11', version: null, ingame_time: null, desc: '愿每一份祝福都如飞花般绚丽。', detail: '每年 11 月 11 日，页面右下角有生日倒计时彩蛋。', audio: null, featured: true, order: 99 },
];

// 语录配音映射（1~8 有配音，9、10 无配音静音切换）
window.QUOTE_AUDIO = {
  1: 'audio/01_嗨想我了吗.mp3',
  2: 'audio/02_此后将有群星闪耀.mp3',
  3: 'audio/03_请将我的剑我的花.mp3',
  4: 'audio/04_悲剧并非终结.mp3',
  5: 'audio/05_美丽的女孩子什么都能做到.mp3',
  6: 'audio/06_如你所见与那个凯文齐名.mp3',
  7: 'audio/07_而你将走向未来.mp3',
  8: 'audio/08_愿你前行的道路有群星闪耀.mp3',
};
```

- [ ] **Step 2: 验证数据文件语法与 key 完整**

用 Node（若可用）或直接在浏览器 eval：

```bash
python tools/cdp.py http://localhost:8500/data/timeline-data.js eval "(function(){try{var s=document.createElement('script');s.src='data/timeline-data.js';document.head.appendChild(s);return 'script added'}catch(e){return 'ERR '+e.message}})()"
```

然后确认全局变量（需要页面 index.html 才有 head；更稳妥直接开个空白页注入）：

```bash
python tools/cdp.py http://localhost:8500/index.html eval "(function(){var s=document.createElement('script');s.src='data/timeline-data.js';document.head.appendChild(s);setTimeout(function(){},0);return 'ok'})()" sleep 300 eval "JSON.stringify({count: window.TIMELINE_DATA ? window.TIMELINE_DATA.length : null, p1: window.TIMELINE_DATA && window.TIMELINE_DATA[0].title, audioKeys: window.QUOTE_AUDIO ? Object.keys(window.QUOTE_AUDIO) : null})"
```

期望输出：`{"count": 21, "p1": "粉色妖精小姐♪", "audioKeys": ["1","2","3","4","5","6","7","8"]}`（21=3装甲+5皮肤+9剧情+4事件）。

- [ ] **Step 3: Commit**

```bash
git add data/
git commit -m "feat: shared timeline data source with quote audio mapping"
```

---

### Task 4: 修语录卡片 bug + 接入真人配音（改 index.html）

**Files:**
- Modify: `D:\claude-code\elysia\index.html`（主 `<script>` 的语录构建段，原 440–485 行附近）
- Modify: `D:\claude-code\elysia\index.html`（body 主脚本前插入数据文件引用）

**Interfaces:**
- Consumes: `window.QUOTE_AUDIO`（Task 3）、`audio/*.mp3`（Task 2）。
- Produces: 修复后的语录点击交互——文字轮换 + 配音播放 + 防叠音。

- [ ] **Step 1（可选前置）：在 body 主脚本前引入共享数据文件**

在 `index.html` 的 `<canvas id="petalCanvas">` 之后、主 `<script>` 之前插入：

```html
<script src="data/timeline-data.js"></script>
```

（若用户不希望主页加载整个时间轴数据，可跳过此步——但推荐引入，Task 5 的主页精简段也需要它。）

- [ ] **Step 2: 用 CDP 先复现「点击无反应」bug（写失败路径）**

```bash
python tools/cdp.py http://localhost:8500/index.html eval "(function(){var c=document.querySelectorAll('.quote-card')[0];var t=c.querySelector('.quote-text');var before=t.textContent;var ev=new MouseEvent('click',{bubbles:true,cancelable:true,view:window});c.dispatchEvent(ev);return JSON.stringify({before:before})})()" sleep 600 eval "(function(){var t=document.querySelector('.quote-card .quote-text');return 'after: '+t.textContent})()"
```

期望（bug 现状）：`after:` 输出的文字与 `before` 相同——点击无效，复现根因（NodeList 无 `indexOf`）。

- [ ] **Step 3: 替换语录构建段为闭包索引版 + 配音**

把主脚本里 `// ===== BUILD QUOTE CARDS =====` 段落（`quotes.forEach(...)` 整块）替换为：

```js
  // ===== BUILD QUOTE CARDS =====
  var grid = document.getElementById('quotesGrid');
  var quoteAudioEls = {};               // 当前正在播放的 Audio，按卡片跟踪
  quotes.forEach(function(q, i) {
    var card = document.createElement('div');
    card.className = 'quote-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', '语录卡片，点击切换与播放配音');
    var textEl = document.createElement('div');
    textEl.className = 'quote-text';
    textEl.textContent = q;
    var hint = document.createElement('span');
    hint.className = 'quote-hint';
    hint.textContent = '点击切换';
    card.appendChild(textEl);
    card.appendChild(hint);
    var cur = i;                        // 闭包固化索引，O(1)，不扫 DOM
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
        cur = next;
        textEl.classList.remove('fading');
      }, 400);
    });
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
    grid.appendChild(card);
  });
```

要点（对照需求）：
- **闭包 `cur`** 取代 `cardIndices[...indexOf...]`，彻底消除 NodeList.indexOf 崩溃。
- **配音**：点击时按 `next+1` 查 `QUOTE_AUDIO`（1~8 有配音、9→0 回绕到第 1 条），同一卡片复用同一 Audio 实例并先 `pause()+currentTime=0` 打断——连续快击不叠音、第 9/10 条静音切换。
- 淡出 400ms 后换字，动画与之前一致。

- [ ] **Step 4: CDP 真机验证点击轮换 + 配音触发（成功断言）**

验证「连点 4 次文字轮换」：

```bash
python tools/cdp.py http://localhost:8500/index.html click ".quote-card" sleep 700 click ".quote-card" sleep 700 click ".quote-card" sleep 700 click ".quote-card" sleep 700 eval "(function(){return document.querySelector('.quote-card .quote-text').textContent})()"
```

期望：第 1 卡初始是第 1 条（「嗨，想我了吗？」），连点 4 次后应为第 5 条（「毕竟——美丽的女孩子，什么都能做到嘛！」之类）。同时验证无控制台 TypeError：

```bash
python tools/cdp.py http://localhost:8500/index.html eval "(function(){var errs='/';window.addEventListener('error',function(e){errs+=e.message+'/'});var c=document.querySelectorAll('.quote-card')[1];var t=c.querySelector('.quote-text');var b=t.textContent;c.click();return new Promise(function(res){setTimeout(function(){res(JSON.stringify({before:b,after:t.textContent,errs:errs}))},700)})})()" sleep 800 eval "JSON.stringify(window.__x||null)" 2>/dev/null
```

（若上条因为异步断言写起来绕，等效验证：点击后 `after` 与 `before` 不同即可证明修复生效；errs 若包含 `indexOf is not a function` 则失败。）

- [ ] **Step 5: 截图确认卡片视觉无回归**

```bash
python tools/cdp.py http://localhost:8500/index.html shot screenshots/quotes-fixed.png
```

用「眼睛」看图：确认 `quotes-fixed.png` 中语录区布局未变形（无溢出/移位）。

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "fix: quote cards use closure index; add elysia voice playback with anti-overlap"
```

---

### Task 5: 主页新增「她的装甲 · 她的芳华」精简时间轴

**Files:**
- Modify: `D:\claude-code\elysia\index.html`（新增 section HTML + 渲染脚本 + 少量 CSS）
- Consumes: `window.TIMELINE_DATA`（Task 3）、Task 4 已引入的数据文件引用。

**Interfaces:**
- Produces: 主页「她的装甲 · 她的芳华」段（8 条 featured 里程碑，单列卡片 + 类型徽标 + 日期/版本，底部「查看完整时间轴 →」链接到 `armor.html`）。

- [ ] **Step 1: 插入 CSS（追加到 `</style>` 前）**

```css
/* ===== ARMOR FEATURED (主页精简时间轴) ===== */
.armor-featured{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:1rem}
.armor-featured-row{
  display:flex;align-items:flex-start;gap:1rem;padding:1.1rem 1.4rem;
  background:linear-gradient(135deg,var(--glass-bg),var(--glass-bg2));
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border:1px solid var(--glass-border);border-radius:16px;
  transition:transform .3s ease,box-shadow .3s ease;
}
.armor-featured-row:hover{transform:translateY(-2px);box-shadow:0 0 24px rgba(255,143,163,.12)}
.af-badge{
  flex:0 0 auto;margin-top:.15rem;padding:.18rem .6rem;border-radius:999px;
  font-size:.68rem;letter-spacing:.08em;white-space:nowrap;
}
.af-badge.armor{background:rgba(255,143,163,.16);color:var(--pink-soft);border:1px solid rgba(255,143,163,.35)}
.af-badge.skin{background:rgba(255,209,102,.14);color:var(--gold-soft);border:1px solid rgba(255,209,102,.35)}
.af-badge.story{background:rgba(155,93,229,.16);color:var(--purple-glow);border:1px solid rgba(155,93,229,.4)}
.af-badge.event{background:rgba(255,200,221,.12);color:var(--text-dim);border:1px solid var(--glass-border2)}
.af-main{flex:1 1 auto;min-width:0}
.af-title{font-size:.98rem;font-weight:400;color:var(--text);letter-spacing:.06em;display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap}
.af-title .t{color:var(--pink-soft)}
.af-title .sub{font-size:.72rem;color:var(--text-muted);font-weight:300}
.af-meta{display:flex;gap:1.1rem;flex-wrap:wrap;margin-top:.45rem;font-size:.75rem;color:var(--text-dim)}
.af-meta b{color:var(--gold);font-weight:400}
.af-meta .v{color:var(--purple-glow)}
.af-desc{margin-top:.4rem;font-size:.82rem;color:var(--text-dim);line-height:1.7;font-weight:300}
.armor-featured-more{
  margin:2.2rem auto 0;display:inline-flex;align-items:center;gap:.5rem;
  padding:.6rem 1.4rem;border-radius:999px;cursor:pointer;text-decoration:none;
  background:linear-gradient(135deg,rgba(255,143,163,.18),rgba(155,93,229,.2));
  border:1px solid rgba(255,200,221,.3);color:var(--pink-soft);
  font-size:.85rem;letter-spacing:.15em;
  box-shadow:0 0 20px rgba(255,143,163,.15);transition:transform .3s,box-shadow .3s;
}
.armor-featured-more:hover{transform:translateY(-2px);box-shadow:0 0 28px rgba(255,143,163,.28)}
@media(max-width:480px){
  .af-badge{font-size:.6rem}
  .af-meta{gap:.8rem}
}
```

- [ ] **Step 2: 插入 section HTML（在「她的旅途」section 之后、「飞花寄语」之前）**

```html
<!-- ===== ARMOR FEATURED ===== -->
<section class="content-section" id="armor-featured">
  <div class="section-title-wrap">
    <h2 class="section-title">
      <span class="section-title-petal"></span>她的装甲 · 她的芳华<span class="section-title-petal"></span>
    </h2>
    <span class="section-title-line"></span>
  </div>
  <div class="armor-featured" id="armorFeatured"></div>
  <div style="text-align:center">
    <a class="armor-featured-more" href="armor.html">查看完整时间轴 →</a>
  </div>
</section>
```

- [ ] **Step 3: 插入渲染脚本（放在主 IIFE 之后、生日彩蛋 script 之前）**

```html
<script>
(function(){
  var list = window.TIMELINE_DATA || [];
  var featured = list.filter(function(it){ return it.featured; });
  // 按现实日期/剧情顺序稳定排序：先 story（剧情序），再现实日期，生日固定尾
  featured.sort(function(a,b){
    if (a.type==='story' && b.type!=='story') return -1;
    if (a.type!=='story' && b.type==='story') return 1;
    if (a.type==='story') return a.order - b.order;
    if (a.id==='event-4') return 1; if (b.id==='event-4') return -1;
    return String(a.real_date||'9999').localeCompare(String(b.real_date||'9999'));
  });
  var badge = {armor:'装甲', skin:'皮肤', story:'剧情', event:'活动'};
  var box = document.getElementById('armorFeatured');
  featured.forEach(function(it){
    var row = document.createElement('div');
    row.className = 'armor-featured-row';
    var meta = '';
    if (it.real_date) meta += '<b>📅 ' + it.real_date + '</b>';
    if (it.version)   meta += '<span class="v">🎮 ' + it.version + '</span>';
    if (it.ingame_time) meta += '<span>⏳ ' + it.ingame_time + '</span>';
    row.innerHTML =
      '<span class="af-badge ' + it.type + '">' + (badge[it.type]||it.type) + '</span>' +
      '<div class="af-main">' +
        '<div class="af-title"><span class="t">' + it.title + '</span>' +
        (it.subtitle ? '<span class="sub">' + it.subtitle + '</span>' : '') + '</div>' +
        '<div class="af-meta">' + meta + '</div>' +
        '<div class="af-desc">' + it.desc + '</div>' +
      '</div>';
    box.appendChild(row);
  });
})();
</script>
```

（注意：`featured` 共 8 条——3 装甲 + 晚宴/乐土引路人/归来谢幕 + 乐土玩法开启 + 生日，符合「6~8 条核心里程碑」。）

- [ ] **Step 4: CDP 验证 8 条渲染 + 链接可跳转**

```bash
python tools/cdp.py http://localhost:8500/index.html eval "(function(){var rows=document.querySelectorAll('.armor-featured-row');return JSON.stringify({count:rows.length,first:rows[0].innerText.slice(0,60),hasLink:!!document.querySelector('a.armor-featured-more')})})()" shot screenshots/home-armor-section.png
```

期望：`{"count": 8, "first": "装甲 粉色妖精小姐♪ ...", "hasLink": true}`。截图应显示新段与整体布局融合、无溢出。

- [ ] **Step 5: 截图全页 + 滚到新段再截图，检查视觉**

```bash
python tools/cdp.py http://localhost:8500/index.html sleep 1200 shot screenshots/home-full.png
# 滚动到 armor 段再截：
python tools/cdp.py http://localhost:8500/index.html eval "window.scrollTo(0, document.getElementById('armor-featured').offsetTop - 120)" sleep 600 shot screenshots/home-armor-view.png
```

用「眼睛」检查：新段标题/卡片样式与既有页面一致；`armor-featured-more` 链接样式正常。

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: home page featured armor timeline section with link to full page"
```

---

### Task 6: 独立完整页 `armor.html`

**Files:**
- Create: `D:\claude-code\elysia\armor.html`

**Interfaces:**
- Consumes: `window.TIMELINE_DATA`（Task 3）。
- Produces: 完整时间轴页——顶栏筛选（四类多选 + 排序开关 + 清空）、竖向左右交错时间线、三轴标注、类型徽标、点击展开详情、顶部返首页链接。供任务 7 验收与主页 `armor.html` 链接指向。

- [ ] **Step 1: 写 armor.html 完整文件**

完整代码如下（设计语言复用 index.html：背景渐变、玻璃拟态、飞花标题；内容逻辑全量渲染 + 筛选）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="referrer" content="same-origin">
<title>她的装甲 · 完整时间轴 — elysiad.top</title>
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg-abyss:#0a0612;--bg-deep:#12091f;--bg-purple:#1a0e2e;--bg-mid:#2d1b4e;
  --pink-mist:#ffc8dd;--pink-soft:#ffb3c1;--pink:#ff8fa3;--pink-deep:#ff5c8a;
  --purple-glow:#c77dff;--purple:#9b5de5;--purple-deep:#7b2cbf;
  --gold:#ffd166;--text:#f0e6ff;--text-dim:#a89cc8;--text-muted:#7b6f99;
  --glass-bg:rgba(255,200,221,0.06);--glass-border:rgba(255,200,221,0.12);
  --glass-bg2:rgba(155,93,229,0.06);--glass-border2:rgba(155,93,229,0.12);
}
html{scroll-behavior:smooth}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  background:linear-gradient(180deg,var(--bg-abyss) 0%,var(--bg-deep) 25%,var(--bg-purple) 55%,var(--bg-deep) 100%);
  background-attachment:fixed;color:var(--text);overflow-x:hidden;line-height:1.7;
}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-thumb{background:var(--purple-deep);border-radius:3px}

.page-head{padding:4rem 1.5rem 1rem;text-align:center;position:relative;z-index:2}
.back-link{display:inline-block;margin-bottom:1.4rem;color:var(--text-muted);font-size:.78rem;letter-spacing:.15em;text-decoration:none;padding:.4rem .9rem;border:1px solid var(--glass-border2);border-radius:999px;transition:color .3s,border-color .3s}
.back-link:hover{color:var(--pink-soft);border-color:var(--pink)}
.page-title{font-size:clamp(1.6rem,4.5vw,2.4rem);font-weight:300;letter-spacing:.2em;color:var(--pink-mist);text-shadow:0 0 30px rgba(255,143,163,.35)}
.page-sub{margin-top:.8rem;font-size:clamp(.8rem,2.2vw,1rem);color:var(--text-dim);letter-spacing:.3em}

/* ===== FILTER BAR ===== */
.filter-bar{
  position:relative;z-index:2;max-width:900px;margin:2.2rem auto 0;padding:1.1rem 1.4rem;
  display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.8rem 1.4rem;
  background:linear-gradient(135deg,var(--glass-bg),var(--glass-bg2));
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  border:1px solid var(--glass-border);border-radius:18px;
}
.filter-chip{
  display:inline-flex;align-items:center;gap:.4rem;padding:.32rem .85rem;border-radius:999px;
  cursor:pointer;user-select:none;font-size:.78rem;letter-spacing:.1em;
  border:1px solid var(--glass-border2);color:var(--text-dim);
  transition:all .25s;
}
.filter-chip.on{box-shadow:0 0 12px rgba(255,143,163,.25);border-color:transparent;color:#fff}
.filter-chip.on.armor{background:rgba(255,143,163,.45)}
.filter-chip.on.skin{background:rgba(255,209,102,.4);color:#2b1a0a}
.filter-chip.on.story{background:rgba(155,93,229,.5)}
.filter-chip.on.event{background:rgba(255,200,221,.35)}
.filter-chip .cnt{opacity:.75;font-size:.68rem}
.filter-toggles{display:flex;align-items:center;gap:.6rem;font-size:.74rem;color:var(--text-muted)}
.filter-toggle{cursor:pointer;padding:.3rem .6rem;border-radius:8px;border:1px solid var(--glass-border2);transition:all .25s}
.filter-toggle.on{color:var(--gold);border-color:rgba(255,209,102,.4)}
.clear-btn{cursor:pointer;padding:.3rem .8rem;border:none;border-radius:8px;background:rgba(255,143,163,.15);color:var(--pink-soft);font-size:.74rem;letter-spacing:.1em;transition:background .25s}
.clear-btn:hover{background:rgba(255,143,163,.3)}

/* ===== TIMELINE ===== */
.timeline{position:relative;z-index:2;max-width:900px;margin:3.5rem auto 0;padding:1rem 1.5rem 4rem}
.timeline-line{position:absolute;left:50%;top:0;bottom:0;width:2px;
  background:linear-gradient(180deg,transparent,var(--purple-deep) 8%,var(--purple) 50%,var(--purple-deep) 92%,transparent);transform:translateX(-50%)}
.timeline-node{position:relative;display:flex;align-items:flex-start;margin-bottom:2.6rem;opacity:0;transform:translateY(24px);transition:opacity .6s ease,transform .6s ease}
.timeline-node.visible{opacity:1;transform:translateY(0)}
.timeline-node:nth-child(odd){flex-direction:row}
.timeline-node:nth-child(even){flex-direction:row-reverse}
.timeline-dot{position:absolute;left:50%;top:.6rem;width:13px;height:13px;border-radius:50%;border:2px solid var(--pink);background:var(--bg-abyss);transform:translateX(-50%);z-index:2;box-shadow:0 0 10px rgba(255,143,163,.35)}
.timeline-node.visible .timeline-dot{background:var(--pink)}
.timeline-card{
  width:calc(50% - 2.4rem);padding:1.2rem 1.4rem;cursor:pointer;
  background:linear-gradient(135deg,var(--glass-bg),var(--glass-bg2));
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border:1px solid var(--glass-border);border-radius:16px;
  box-shadow:0 0 18px rgba(255,143,163,.05);transition:transform .3s,box-shadow .3s;
}
.timeline-card:hover{transform:translateY(-2px);box-shadow:0 0 26px rgba(255,143,163,.14)}
.timeline-node:nth-child(odd) .timeline-card{margin-right:auto}
.timeline-node:nth-child(even) .timeline-card{margin-left:auto}
.card-top{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.45rem}
.type-badge{padding:.16rem .55rem;border-radius:999px;font-size:.66rem;letter-spacing:.1em;white-space:nowrap}
.type-badge.armor{background:rgba(255,143,163,.18);color:var(--pink-soft);border:1px solid rgba(255,143,163,.4)}
.type-badge.skin{background:rgba(255,209,102,.15);color:var(--gold-soft);border:1px solid rgba(255,209,102,.4)}
.type-badge.story{background:rgba(155,93,229,.18);color:var(--purple-glow);border:1px solid rgba(155,93,229,.45)}
.type-badge.event{background:rgba(255,200,221,.13);color:var(--text-dim);border:1px solid var(--glass-border2)}
.card-title{font-size:1.05rem;font-weight:400;color:var(--pink-soft);letter-spacing:.08em}
.card-sub{font-size:.74rem;color:var(--text-muted);margin-top:.15rem;letter-spacing:.05em}
.card-meta{display:flex;gap:1rem;flex-wrap:wrap;margin-top:.6rem;font-size:.76rem;color:var(--text-dim)}
.card-meta b{color:var(--gold);font-weight:400}
.card-meta .v{color:var(--purple-glow)}
.card-desc{margin-top:.55rem;font-size:.82rem;color:var(--text-dim);line-height:1.75;font-weight:300}
.card-detail{margin-top:.6rem;max-height:0;overflow:hidden;transition:max-height .5s ease;font-size:.8rem;color:var(--text-dim);border-top:1px solid var(--glass-border);padding-top:0}
.timeline-card.open .card-detail{max-height:180px;padding-top:.6rem}
/* ===== RESPONSIVE ===== */
@media(max-width:768px){
  .timeline-line{left:1.3rem}
  .timeline-node,.timeline-node:nth-child(odd),.timeline-node:nth-child(even){flex-direction:row}
  .timeline-dot{left:1.3rem}
  .timeline-card,.timeline-node:nth-child(odd) .timeline-card,.timeline-node:nth-child(even) .timeline-card{
    width:calc(100% - 2.8rem);margin-left:2.8rem;margin-right:0
  }
}
</style>
</head>
<body>

<header class="page-head">
  <a class="back-link" href="index.html">← 返回 elysiad.top</a>
  <h1 class="page-title">她的装甲 · 完整时间轴</h1>
  <p class="page-sub">现实时间 · 游戏时间 · 游戏版本</p>
</header>

<div class="filter-bar" id="filterBar">
  <div class="filter-chip on armor" data-type="armor">装甲 <span class="cnt"></span></div>
  <div class="filter-chip on skin" data-type="skin">皮肤 <span class="cnt"></span></div>
  <div class="filter-chip on story" data-type="story">剧情 <span class="cnt"></span></div>
  <div class="filter-chip on event" data-type="event">活动 <span class="cnt"></span></div>
  <div class="filter-toggles">
    <span class="filter-toggle on" id="toggleDate">按现实日期排序</span>
    <span class="filter-toggle" id="toggleStory">剧情在前</span>
  </div>
  <button class="clear-btn" id="clearBtn">清空筛选</button>
</div>

<div class="timeline" id="timeline"><div class="timeline-line"></div></div>

<script src="data/timeline-data.js"></script>
<script>
(function(){
  var DATA = window.TIMELINE_DATA || [];
  var counts = {armor:0, skin:0, story:0, event:0};
  DATA.forEach(function(it){ counts[it.type] = (counts[it.type]||0)+1; });
  document.querySelectorAll('.filter-chip .cnt').forEach(function(c){
    var type = c.parentNode.getAttribute('data-type');
    c.textContent = counts[type]||0;
  });

  var types = {armor:true, skin:true, story:true, event:true};
  var dateFirst = true;   // 默认按现实日期；故事类若无日期则排最后

  function byOrder(a, b){
    if (dateFirst) {
      if (a.type !== b.type && a.type==='story' !== (b.type==='story')) {
        // 剧情类（无现实日期）放现实类之后
        return a.type==='story' ? 1 : -1;
      }
    } else {
      if (a.type === 'story' && b.type !== 'story') return -1;
      if (a.type !== 'story' && b.type === 'story') return 1;
    }
    if (a.type === 'story') return a.order - b.order;
    var d = String(a.real_date||'9999').localeCompare(String(b.real_date||'9999'));
    return d !== 0 ? d : a.order - b.order;
  }

  function render(){
    var shown = DATA.filter(function(it){ return types[it.type]; });
    shown.sort(byOrder);
    var tl = document.getElementById('timeline');
    // 清除旧节点（保留 .timeline-line）
    tl.querySelectorAll('.timeline-node').forEach(function(n){ n.remove(); });
    shown.forEach(function(it, idx){
      var node = document.createElement('div');
      node.className = 'timeline-node';
      var meta = '';
      if (it.real_date) meta += '<b>📅 ' + it.real_date + '</b>';
      if (it.version)   meta += '<span class="v">🎮 ' + it.version + '</span>';
      if (it.ingame_time) meta += '<span>⏳ ' + it.ingame_time + '</span>';
      node.innerHTML =
        '<div class="timeline-dot"></div>' +
        '<div class="timeline-card">' +
          '<div class="card-top"><span class="type-badge ' + it.type + '">' +
          ({armor:'装甲',skin:'皮肤',story:'剧情',event:'活动'}[it.type]||it.type) + '</span></div>' +
          '<div class="card-title">' + it.title + '</div>' +
          (it.subtitle ? '<div class="card-sub">' + it.subtitle + '</div>' : '') +
          '<div class="card-meta">' + meta + '</div>' +
          '<div class="card-desc">' + it.desc + '</div>' +
          (it.detail ? '<div class="card-detail">' + it.detail + '</div>' : '') +
        '</div>';
      var card = node.querySelector('.timeline-card');
      card.addEventListener('click', function(){ card.classList.toggle('open'); });
      tl.appendChild(node);
    });
    // 触发进场动画
    tl.querySelectorAll('.timeline-node').forEach(function(n){
      if (n.getBoundingClientRect().top < window.innerHeight) n.classList.add('visible');
    });
  }

  var observer = new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if (e.isIntersecting) e.target.classList.add('visible'); });
  }, {threshold:.1, rootMargin:'0px 0px -40px 0px'});

  function observeNodes(){
    document.querySelectorAll('.timeline-node').forEach(function(n){ observer.observe(n); });
  }

  document.querySelectorAll('.filter-chip').forEach(function(chip){
    chip.addEventListener('click', function(){
      var t = chip.getAttribute('data-type');
      types[t] = !types[t];
      chip.classList.toggle('on', types[t]);
      render(); observeNodes();
    });
  });
  document.getElementById('toggleDate').addEventListener('click', function(){
    dateFirst = !dateFirst;
    this.classList.toggle('on', dateFirst);
    document.getElementById('toggleStory').classList.toggle('on', !dateFirst);
    render(); observeNodes();
  });
  document.getElementById('toggleStory').addEventListener('click', function(){
    dateFirst = !dateFirst;
    this.classList.toggle('on', !dateFirst);
    document.getElementById('toggleDate').classList.toggle('on', dateFirst);
    render(); observeNodes();
  });
  document.getElementById('clearBtn').addEventListener('click', function(){
    Object.keys(types).forEach(function(k){ types[k]=true; });
    document.querySelectorAll('.filter-chip').forEach(function(c){ c.classList.add('on'); });
    dateFirst = true;
    document.getElementById('toggleDate').classList.add('on');
    document.getElementById('toggleStory').classList.remove('on');
    render(); observeNodes();
  });

  render(); observeNodes();
})();
</script>
</body>
</html>
```

- [ ] **Step 2: CDP 验证渲染与筛选**

验证初始渲染（21 条全显 + 卡片可点开详情）：

```bash
python tools/cdp.py http://localhost:8500/armor.html eval "(function(){var n=document.querySelectorAll('.timeline-node');var c=n[0].querySelector('.timeline-card');c.click();return JSON.stringify({nodes:n.length,title:n[0].innerText.slice(0,50),open:!!c.querySelector('.card-detail')&&c.classList.contains('open')})})()" shot screenshots/armor-page.png
```

期望：`{"nodes": 21, "title": "装甲 粉色妖精小姐♪ ...", "open": true}`。

验证筛选（点掉「皮肤」后应剩 16 条）：

```bash
python tools/cdp.py http://localhost:8500/armor.html click ".filter-chip.skin" sleep 400 eval "(function(){return document.querySelectorAll('.timeline-node').length})()" shot screenshots/armor-filter-skin-off.png
```

期望：剩下 `16`（21−5 皮肤）。再点「清空筛选」恢复 21：

```bash
python tools/cdp.py http://localhost:8500/armor.html click ".filter-chip.skin" sleep 300 click "#clearBtn" sleep 400 eval "(function(){return document.querySelectorAll('.timeline-node').length})()"
```

期望：`21`。

- [ ] **Step 3: 截图检查三轴标注与移动端布局**

```bash
python tools/cdp.py http://localhost:8500/armor.html shot screenshots/armor-full.png
# 移动端窄窗（用 CDP 调整 viewport 不方便时，改用截图后人工缩视；或直接信任既有 @media 规则）
python tools/cdp.py "http://localhost:8500/armor.html" eval "(function(){var cards=document.querySelectorAll('.timeline-card');return JSON.stringify([cards[0].innerText.slice(0,80), cards[7].innerText.slice(0,80)])})()" shot screenshots/armor-sample.png
```

用「眼睛」检查截图：左右交错正常、`timeline-line` 居中对齐、三轴（📅/🎮/⏳）信息完整、类型徽标四色区分、卡片 hover/打开无布局错乱。

- [ ] **Step 4: Commit**

```bash
git add armor.html
git commit -m "feat: full armor timeline page with filters, three-axis meta and expandable cards"
```

---

### Task 7: 综合验收（全页截图 + 对照全局 CLAUDE.md 前端检查清单）

**Files:**
- 无代码改动（若发现布局问题则回 Task 4/5/6 修复）。
- Consumes: 全部产物。

- [ ] **Step 1: 首页全流程截图**

```bash
python tools/cdp.py http://localhost:8500/index.html sleep 2500 shot screenshots/final-home-top.png eval "window.scrollTo(0, document.getElementById('about').offsetTop - 60)" sleep 600 shot screenshots/final-home-about.png eval "window.scrollTo(0, document.getElementById('journey').offsetTop - 60)" sleep 600 shot screenshots/final-home-journey.png eval "window.scrollTo(0, document.getElementById('armor-featured').offsetTop - 60)" sleep 600 shot screenshots/final-home-armor.png eval "window.scrollTo(0, 99999)" sleep 600 shot screenshots/final-home-end.png
```

- [ ] **Step 2: 独立页截图（全部筛选组合各截一张）**

```bash
python tools/cdp.py http://localhost:8500/armor.html sleep 800 shot screenshots/final-armor-all.png click ".filter-chip.armor" sleep 300 shot screenshots/final-armor-no-armor.png click "#clearBtn" sleep 300 click ".filter-chip.story" sleep 300 shot screenshots/final-armor-no-story.png click "#clearBtn" sleep 300 eval "window.scrollTo(0, document.querySelector('.timeline').offsetTop + document.querySelector('.timeline').scrollHeight)" sleep 600 shot screenshots/final-armor-bottom.png
```

- [ ] **Step 3: 逐张分析布局问题（人工看图核对）**

对每张截图核对：对齐、间距、溢出（横向滚动条不得出现）、大段空白、文字截断、徽标/日期/版本三条信息可读。若发现问题 → 记录问题、回到对应 Task 修复、再跑本 Task 复验。

- [ ] **Step 4: 语音回归（首页连点触发音频，确认无控制台错误）**

```bash
python tools/cdp.py http://localhost:8500/index.html click ".quote-card" sleep 600 click ".quote-card" sleep 600 eval "(function(){var c=document.querySelector('.quote-card');return 'now: '+c.querySelector('.quote-text').textContent})()"
```

期望：文字轮换正常（两次点击后从第 1 条到第 3 条），且全程控制台无 `indexOf` 报错。

- [ ] **Step 5: 最终 Commit（含 screenshots/ 除外，按 .gitignore 排除）**

```bash
git add -A && git status --short && git commit -m "chore: final acceptance pass"
```

---

## Self-Review（写计划时已执行）

1. **Spec 覆盖**
   - 语录 bug（闭包索引 + 无 indexOf）→ Task 4 Step 3 ✅
   - 真人配音 + 防叠音 + 1~8 有/9~10 静音 → Task 4 + QUOTE_AUDIO ✅
   - 共享数据源 `data/timeline-data.js` → Task 3 ✅
   - 主页精简段（6~8 条 featured + 链接）→ Task 5 ✅
   - 独立页（四类筛选/排序/清空/三轴/徽标/展开/返回链接）→ Task 6 ✅
   - 数据逐条确认、用户最终版本的 3 装甲/5 皮肤/9 剧情/4 事件 → Task 3 数据块 ✅
   - 转码流程 → Task 2 ✅
2. **占位符扫描**：无 TBD/TODO；每个代码步骤都是完整可执行内容。
3. **类型/命名一致性**：`TIMELINE_DATA`、`QUOTE_AUDIO`、`featured`、`order` 在 Task 3 定义后被 Task 4/5/6 一致引用；`cdp.py` 动作语法在 Task 1 定义并被后续任务一致使用。排序优先级在 Task 5 与 Task 6 语义一致（生日 event-4 固定尾/默认日期优先）。