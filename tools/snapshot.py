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
#
# ⚠ 本任务独立实现自己的 CDP 会话，**不复用 cdp.py**——两份计划都会改 cdp.py，
#   共用会让快照的稳定性绑在另一个工具上。端口与 user-data-dir 也都另开一套，
#   避免和 cdp.py 抢（它用 9320 / edge_cdp，这里用 9321 / edge_snapshot）。
#
# ── 为什么还要「确定性处理」（2026-09-16 实测后补的）─────────────────────────
# 第一版直接采样，同一份代码跑两次报出 119 处差异，全是噪音。三个来源，逐一封掉：
#
#   ① 星星是随机生成的 —— .ending-star 的尺寸/颜色/时长/延迟都是 Math.random()
#      的产物，两次跑必然不同。→ 固定随机种子（见 SEED_RANDOM_JS）。注意这只影响
#      **快照**，不影响线上页面。
#   ② 打字机还没打完 —— kalpas 的开场台词有 27 个字，比 index 的 7 个字慢得多。
#      采样时字符数不同 → 换行不同 → .opening-title/.opening-subtitle 的宽高都变。
#      → 等正文稳定下来（见 SETTLE_JS 的第一步）。
#   ③ 无限动画停在随机相位 —— twinkle / chevron-bounce / glow-pulse 都是 infinite，
#      采到哪一帧全凭运气（opacity、box-shadow 小数尾数每次都不同）。
#      → 采样前把无限动画钉在 t=0，有限的动画直接推到结束态（见 SETTLE_JS 末步）。
#
# 这三条不是「等久一点」能解决的：等再久，无限动画仍然在转。
#
# ── ⚠ PNG 不是逐字节可复现的，别拿它当判据 ──────────────────────────────────
# 实测（2026-09-16）：同一份代码跑两次，24 张截图里 22 张逐像素完全相同，
# 2 张有极小差异（index_375 差 0.475%，aponia_375 差 0.002%）。
#
# 差异位置对得上 `position:fixed` 的元素（index 的生日徽章 #bdayEgg 就是）。
# 在 DOM 层单独量过：钉死之后它的 rect.top / transform / opacity **两次完全一致**
# （都是 751.47 / matrix(1,0,0,1,0,0) / paused@0）——**页面是稳的**。
# 不稳的是 Chromium 的整页截图（`captureBeyondViewport`）对 fixed 元素的渲染。
#
# 所以：**机械判据只有 JSON 差分**（它现在是 0 差异）；PNG 是给人眼看「页面没白屏、
# 内容完整」用的。别写一个 PNG 比对脚本然后被这点噪音追着跑。
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

# 固定随机种子。必须用 Page.addScriptToEvaluateOnNewDocument 注入——要在页面脚本
# 跑起来**之前**就换掉 Math.random，否则星星已经用真随机生成好了。
# 线性同余，够用且可复现。
SEED_RANDOM_JS = """
(() => {
  let s = 20260916;
  Math.random = function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
})();
"""

# 让页面「落定」再采样。三步，见文件头 ①②③ 的说明。
SETTLE_JS = """
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ① 等打字机打完：等首个正文元素的字符数连续 3 次不变 */
  const typeEl = document.querySelector('.opening-title') || document.querySelector('.opening-subtitle');
  if (typeEl) {
    let last = -1, stable = 0, waited = 0;
    while (stable < 3 && waited < 15000) {
      const n = typeEl.textContent.length;
      if (n === last) stable++; else stable = 0;
      last = n;
      await sleep(250); waited += 250;
    }
  }

  /* ② 滚到底再回顶：触发所有 IntersectionObserver 的进场状态 */
  const h = document.documentElement.scrollHeight;
  for (let y = 0; y < h; y += 400) { window.scrollTo(0, y); await sleep(16); }
  window.scrollTo(0, 0);
  await sleep(350);

  /* ③ 等 DOM 稳定（有些元素是 setTimeout 错开点亮的） */
  let lastLen = -1, stable2 = 0, waited2 = 0;
  while (stable2 < 3 && waited2 < 12000) {
    const n = document.body.innerHTML.length;
    if (n === lastLen) stable2++; else stable2 = 0;
    lastLen = n;
    await sleep(250); waited2 += 250;
  }

  /* ④ 等有限动画全部结束（进场淡入那些），最多再等 5 秒 */
  let waited3 = 0;
  while (waited3 < 5000) {
    const running = document.getAnimations().some(a => {
      const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
      return t && t.iterations !== Infinity && a.playState !== 'finished';
    });
    if (!running) break;
    await sleep(200); waited3 += 200;
  }

  /* ⑤ 收尾：无限动画钉死在 t=0（否则采到哪一帧全凭运气，是噪音的大头），
        有限动画直接推到结束态。这一步是「同一份代码跑两次必须零差异」的关键。 */
  let frozen = 0, finished = 0;
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
    if (t && t.iterations === Infinity) {
      a.pause(); a.currentTime = 0; frozen++;
    } else {
      try { a.finish(); finished++; }
      catch (e) { try { a.pause(); a.currentTime = 0; frozen++; } catch (e2) {} }
    }
  }

  return { typed: typeEl ? typeEl.textContent.length : 0, frozen, finished,
           docHeight: document.documentElement.scrollHeight };
})()
"""


def main():
    label = sys.argv[1] if len(sys.argv) > 1 else 'default'
    out_dir = OUT_ROOT / label
    out_dir.mkdir(parents=True, exist_ok=True)

    proc, ws = start_browser()
    cdp = CDP(ws)
    cdp.send('Page.enable')
    cdp.send('Runtime.enable')
    # ⚠⚠ 必须关掉 HTTP 缓存，否则这个工具是**假的**。
    #
    #   2026-09-16 实测抓到的：故意把 su 页 .back-link 的 letter-spacing 从 .15em 改成
    #   .1501em，快照后比对——报「✅ 无差异」。但那次改动**确实生效了**：
    #   问题在于 user-data-dir 是固定的（C:/tmp/edge_snapshot），浏览器缓存**跨次留存**，
    #   第二次加载读到的还是第一次缓存下来的旧页面。
    #
    #   后果有多严重：不修的话，P1 十二个任务**每一个**都会返回假的「无差异」，
    #   整个验证地基形同虚设——正是 HANDOVER 里说的「比较表达式是恒真式，
    #   永远输出相同，测了等于没测」。
    cdp.send('Network.enable')
    cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
    # ⚠ 再屏蔽掉唯一的那个外部请求，让快照**与外网无关**。
    #
    #   8 个页面本身零外部依赖，唯一的例外是 assets/flowers.js：访客的献花计数要问
    #   https://flowers.elysiad.top/count。本地跑时 location.hostname 是 localhost，
    #   会被判成「本地开发」→ 真的去连线上接口。
    #
    #   后果：接口**通**的时候页面显示「这里已收到 10 朵花」，**不通**时静默降级成
    #   另一套文案，两者高度不同。实测抓到过一次整页高度差 8.08px
    #   （1103.64 vs 1111.72），连带 index_1920 上 5 个采样值一起变——就是「这一轮
    #   网络恰好慢了一点」造成的。这种基线不可信：它测的是网络，不是代码。
    #
    #   屏蔽之后请求立刻失败（ERR_BLOCKED_BY_CLIENT），页面稳定停在降级态——
    #   同一个确定的状态，而且比等 4 秒超时更快。
    cdp.send('Network.setBlockedURLs', {'urls': ['https://flowers.elysiad.top/*']})

    try:
        # ⚠ 必须在任何导航之前注册：它要抢在页面脚本之前把 Math.random 换掉，
        #   否则星星已经用真随机生成好了，注入就晚了。
        cdp.send('Page.addScriptToEvaluateOnNewDocument', {'source': SEED_RANDOM_JS})

        for page in PAGES:
            for (w, h) in SIZES:
                cdp.send('Emulation.setDeviceMetricsOverride', {
                    'width': w, 'height': h, 'deviceScaleFactor': 1, 'mobile': w < 768,
                })
                cdp.send('Page.navigate', {'url': f'{BASE}/{page}'})
                time.sleep(1.0)

                # 等打字机打完 + 触发进场 + 钉住无限动画（详见文件头 ①②③）
                settle = cdp.ev(SETTLE_JS) or {}

                styles = cdp.ev(DUMP_JS)

                # ⚠ 截图专用的小手术，**在采样之后**才注入，所以碰不到 JSON。
                #
                #   只有 armor.html 的 body 用了 `background-attachment:fixed`（其余页是纯色底）。
                #   整页截图（captureBeyondViewport）时，fixed 背景**只在视口那一屏绘制**，
                #   视口以外的区域什么都没画 → 默认白底。实测：armor_1920 有 80% 的行是全白。
                #
                #   对照实验（2026-09-16）：同一页，原样截 → 545/682 行全白；
                #   覆盖成 `scroll` 再截 → **0 行全白**。所以那是截图产物，不是页面坏了。
                #
                #   不改的话，Step 5「确认不是白屏」这条检查在 armor 上会变成假警报，
                #   而假警报会训练人忽略检查——比没有检查更糟。
                #   本覆盖只影响 background-attachment 一个属性，不动任何被采样的属性。
                cdp.ev("(() => { const s = document.createElement('style');"
                       " s.textContent = 'body{background-attachment:scroll !important}';"
                       " document.head.appendChild(s); return true; })()")

                shot = cdp.send('Page.captureScreenshot', {'captureBeyondViewport': True})

                stem = page.replace('/', '_').replace('.html', '') or 'index'
                (out_dir / f'{stem}_{w}.json').write_text(
                    json.dumps(styles, ensure_ascii=False, indent=1), encoding='utf-8')
                (out_dir / f'{stem}_{w}.png').write_bytes(base64.b64decode(shot['data']))
                print(f'  ✓ {page} @{w}  ({len(styles)} 个选择器｜打字 {settle.get("typed")} 字'
                      f'｜钉住 {settle.get("frozen")} 个无限动画)', flush=True)
    finally:
        proc.terminate()

    print(f'\n快照存入 {out_dir}')


if __name__ == '__main__':
    main()
