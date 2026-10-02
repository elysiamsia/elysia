# -*- coding: utf-8 -*-
"""
tools/check_postcard.py — 首页「语录明信片」断言

**为什么需要这个：现有四个工具一个都测不到明信片。**

  · `snapshot.py` 采的是**计算样式**：明信片整张画在 `<canvas>` 上，
    画面是像素、没有 DOM，改了版式它**一个字都报不出来**
  · `check_aria_labels.py` / `check_reduced_motion.py` / `check_explore.py`
    分别只看语录卡属性、动画与滚动、探索系统 —— 都不看这一节
  · 而它偏偏是**唯一一个把本站带出去的东西**（存图 → 发到朋友圈/群里），
    坏了不会自己冒烟：画布照样出图，只是**图是错的**（立绘空白、文字压出边框…）

**两部分：**
  · **纯文本那几条**（弹幕话术的键、二维码解不解得出来）—— 不用浏览器，秒级
  · **浏览器那几条**（真点弹幕、真打字、真存图）—— 自带 **8502** 服务器 + 无头 Edge
    （端口刻意避开 8501/9321/9322 —— 那几个是别的工具的，见 HANDOVER §6.4）

⚠ 为什么必须走**真用户路径**（真鼠标事件）：明信片的脚本是 IIFE 包裹的，
  内部函数不是全局的；而且就算调得到，也测不出「弹幕点下去有没有接上」。
  （唯一例外：断言立绘加载状态时用 `window.__ELY_POSTCARD__` 这个只读句柄 ——
    那是**页面自己**为验收留的一小块，`explore.js` 的 `__ELY_EXPLORE__` 是同一个先例。）

跑法：
    PYTHONIOENCODING=utf-8 python tools/check_postcard.py                 # 全跑
    PYTHONIOENCODING=utf-8 python tools/check_postcard.py --only prompt   # 只跑名字含它的

退出码：0 = 全部通过；1 = 有断言失败。
"""
import http.server
import io
import json
import os
import re
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

import websocket  # 与 tools/cdp.py / check_explore.py 同源依赖

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = 'index.html'
PORT = 8502                     # ⚠ 避开 8501（check_* 三件套在用）
DBG = 9323                      # ⚠ 避开 9321 / 9322
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

MAX_CHARS = 200          # spec §七：访客写字的硬上限
PROMPTS_PER_QUOTE = 3    # spec §5.2：每条台词配 3 句
QR_PATH = 'images/qr-elysiad.png'
QR_URL = 'https://elysiad.top/'
QR_SIZE = 240
ART_COUNT = 8            # spec §四：八张立绘

TEXT_CHECKS = []
BROWSER_CHECKS = []


def text_check(fn):
    TEXT_CHECKS.append(fn)
    return fn


def browser_check(fn):
    BROWSER_CHECKS.append(fn)
    return fn


def read(path):
    return io.open(os.path.join(ROOT, path), encoding='utf-8').read()


# ══════════════════════════════════════════════════════════════════════
#  第一部分：纯文本（不用浏览器）
# ══════════════════════════════════════════════════════════════════════

# ══ 弹幕话术的键，必须与台词逐字对得上 ═════════════════════════════════
#   ⚠ 这条是本文件唯一不用浏览器的断言之一，也正因为如此它才重要：
#     键对不上时页面**一点异常都没有**，只是那条台词没有弹幕（静默）。
#     而「改了一个标点」正是最容易发生的那种漂移。

def quotes_daily():
    """从 `data/quotes.js` 抠出 `daily` 那 10 条（逐字，含「」）。"""
    src = read('data/quotes.js')
    i = src.find('daily')
    if i < 0:
        return None
    seg = src[i:src.find(']', i)]
    return re.findall(u"'([^']+)'", seg)


def prompts_map():
    """从 `data/postcard-prompts.js` 抠出 {键: [话术…]}。

    ⚠ 要求**一条占一行**、形如 `'「…」': ['a', 'b', 'c'],` ——
      嵌套数组用正则切不干净，这个格式是人写的、也能机器读。
    """
    src = read('data/postcard-prompts.js')
    out = {}
    for m in re.finditer(u"^\\s*'([^']+)'\\s*:\\s*\\[(.*)\\]\\s*,?\\s*$", src, re.M):
        out[m.group(1)] = re.findall(u"'([^']*)'", m.group(2))
    return out


@text_check
def check_prompt_keys_match_quotes():
    """弹幕话术的键，必须能在 `quotes.js` 的 daily 里**逐字**找到（且一一对应）。"""
    daily = quotes_daily()
    if not daily:
        return ([u'从 `data/quotes.js` 里抠不出 daily（解析器坏了？）'], u'—')
    try:
        pm = prompts_map()
    except IOError:
        return ([u'`data/postcard-prompts.js` 还不存在'], u'—')

    fails = []
    if not pm:
        fails.append(u'`data/postcard-prompts.js` 里一条都没解析出来 —— '
                     u'格式要「一条占一行」：`\'「台词」\': [\'a\', \'b\', \'c\'],`')

    for key, vals in sorted(pm.items()):
        if key not in daily:
            near = [q for q in daily if q[:6] == key[:6]]
            fails.append(u'弹幕的键在 daily 里**找不到**：%s%s'
                         % (key, u'（最像的是：%s）' % near[0] if near else u''))
        if len(vals) < PROMPTS_PER_QUOTE:
            fails.append(u'「%s」只配了 %d 句（要 ≥ %d 句）'
                         % (key[:14], len(vals), PROMPTS_PER_QUOTE))

    for q in daily:
        if q not in pm:
            fails.append(u'daily 里的这句没有弹幕：%s' % q[:24])

    return (fails, u'%d 条台词 / %d 组话术，键逐字对得上' % (len(daily), len(pm))
            if not fails else u'键对不上')


# ══ 二维码：必须**真的能解出那个网址** ═════════════════════════════════
#   ⚠ 不许只验证「文件在、尺寸对、看着像二维码」——
#     圆角遮罩、配色、模块形状任何一处做过头，都会让**扫码解不出来**，
#     而那在页面上完全看不出来（它还是张好看的图）。
#     2026-10-02 实测：模块做圆角就解不出来（详见 `tools/make_qr.py` 文件头）。

@text_check
def check_qr_decodes():
    """预生成的二维码必须能**解出** `https://elysiad.top/`。"""
    try:
        from PIL import Image
    except ImportError:
        return ([u'没装 Pillow，这条验不了 —— `pip install pillow`'], u'—')
    try:
        import zxingcpp
    except ImportError:
        return ([u'没装解码器，这条验不了 —— `pip install zxing-cpp`（缺了它就没法证明扫得出来）'], u'—')

    p = os.path.join(ROOT, QR_PATH)
    if not os.path.exists(p):
        return ([u'`%s` 还不存在' % QR_PATH], u'—')

    img = Image.open(p)
    fails = []
    if img.size != (QR_SIZE, QR_SIZE):
        fails.append(u'尺寸是 %sx%s，spec 要求 %dx%d' % (img.size[0], img.size[1], QR_SIZE, QR_SIZE))

    got = zxingcpp.read_barcode(img.convert('RGBA'))
    if got is None:
        fails.append(u'**解不出来** —— 扫码会失败（圆角遮罩/配色/模块形状做过头了？）')
    elif got.text != QR_URL:
        fails.append(u'解出来的不是那个网址：%r（应为 %r）' % (got.text, QR_URL))

    return (fails, u'解出来 = %s' % QR_URL if not fails else u'二维码扫不出来')


# ══════════════════════════════════════════════════════════════════════
#  第二部分：浏览器（真点、真打字、真存图）
# ══════════════════════════════════════════════════════════════════════

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class QuietServer(socketserver.TCPServer):
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        pass


def start_server():
    handler = lambda *a, **k: Quiet(*a, directory=ROOT, **k)
    httpd = QuietServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


class Browser(object):
    """CDP 的一层薄封装（照 check_explore.py 那份）。`events` 收页面抛的异常与 console。"""

    def __init__(self, ws):
        self.ws = ws
        self._id = 0
        self.events = []

    def _send(self, method, params=None):
        self._id += 1
        mid = self._id
        self.ws.send(json.dumps({'id': mid, 'method': method, 'params': params or {}}))
        while True:
            r = json.loads(self.ws.recv())
            if r.get('id') == mid:
                return r
            self.events.append(r)

    def js(self, expr):
        r = self._send('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
        res = r.get('result', {})
        if res.get('exceptionDetails'):
            return None
        return res.get('result', {}).get('value')

    def jso(self, expr):
        v = self.js(expr)
        try:
            return json.loads(v) if v else None
        except Exception:
            return None

    def press(self, x, y):
        self._send('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': x, 'y': y,
                                                'button': 'left', 'buttons': 1, 'clickCount': 1})

    def release(self, x, y):
        self._send('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': x, 'y': y,
                                                'button': 'left', 'buttons': 0, 'clickCount': 1})

    def center_of(self, selector):
        """滚进视口后返回**视口中心坐标**。
        ⚠ 必须先滚 —— CDP 派发的是视口坐标，元素在视口外会静默落空（HANDOVER §6.4）。
        """
        return self.jso("""(() => {
            var n = document.querySelector('%s');
            if (!n) return null;
            n.scrollIntoView({ block: 'center', behavior: 'instant' });
            var r = n.getBoundingClientRect();
            return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        })()""" % selector)

    def click_sel(self, selector):
        """真鼠标点一下（走完整 down/up）。"""
        c = self.center_of(selector)
        if not c:
            return False
        self.press(c['x'], c['y'])
        time.sleep(0.06)
        self.release(c['x'], c['y'])
        time.sleep(0.35)
        return True


def _reset(b):
    """重载页面 —— 让每条断言从确定的状态出发（明信片是页面加载时就画的）。"""
    b._send('Page.reload', {})
    time.sleep(1.6)


# ══ 画布取样 ══════════════════════════════════════════════════════════
#   ⚠ 不要采「整张画布」：底上有 90 颗 `Math.random()` 的星屑，两次出图必然不同，
#     那样比出来的差异全是噪音。**只比关键区域、且用粗网格**。

def _region_sig(b, sel, cols=24, rows=24):
    """在画布上取一块区域（比例坐标）的**粗网格**颜色签名。

    ⚠ 用「每格一个采样点」而不是整片像素：星屑是 1~2px 的点，
      粗网格碰上的概率极低，而八张立绘两两之间的差异是**成片**的。
    """
    return b.jso("""(() => {
        var c = document.querySelector('#postcardPreview canvas');
        if (!c) return null;
        var p = window.__ELY_POSTCARD__;
        if (!p) return JSON.stringify({ noHandle: true });
        var col = p.col()[%s];
        var W = c.width, H = c.height;
        var ctx = c.getContext('2d');
        /* ⚠ 自检：拿错画布时**必须报出来**。首页上还有开场那层花瓣画布，
           它一直在动 —— 采到它的话「两张立绘的差异」全都来自花瓣，会**假绿**。 */
        if (c.width !== 1080 && c.width !== 1200) return JSON.stringify({ wrongCanvas: c.width });
        var img = ctx.getImageData(Math.round(col.x * W), Math.round(col.y * H),
                                   Math.round(col.w * W), Math.round(col.h * H));
        var d = img.data, iw = img.width, ih = img.height;
        var out = [];
        for (var gy = 0; gy < %d; gy++) {
          for (var gx = 0; gx < %d; gx++) {
            var px = Math.floor((gx + 0.5) / %d * iw);
            var py = Math.floor((gy + 0.5) / %d * ih);
            var i = (py * iw + px) * 4;
            out.push(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
          }
        }
        return JSON.stringify({ sig: out });
    })()""" % (repr(sel), rows, cols, cols, rows))


def _sig_diff(a, b):
    """两个签名里**不同的格子占比**。"""
    if not a or not b or 'sig' not in a or 'sig' not in b:
        return None
    x, y = a['sig'], b['sig']
    if len(x) != len(y) or not x:
        return None
    return sum(1 for i in range(len(x)) if x[i] != y[i]) / float(len(x))


def _handle(b, expr):
    """读 `window.__ELY_POSTCARD__` 上的一小块状态（只读测试句柄）。"""
    return b.jso('(() => { var p = window.__ELY_POSTCARD__;'
                 ' if (!p) return JSON.stringify({ noHandle: true });'
                 ' return JSON.stringify(%s); })()' % expr)


# ⚠ 只写**键名**，别带引号 —— `_region_sig` 里会 `repr()` 一层，
#   自己再带一层的话会变成 `p.col()["'art'"]`，取不到东西（2026-10-02 踩过）。
ART_REGION = 'art'
QR_REGION = 'qr'


@browser_check
def check_all_artworks_render(b):
    """八张立绘逐张：**状态就绪** + 画布左栏**真的跟着变**。

    ⚠ 「跟着变」这一半是关键：只查 `artReady` 的话，一个「读了图但没画上去」
      的实现照样绿。所以拿**相邻两张的区域签名**比，差异要**成片**（≥15% 的采样格）。
      「不成片」也说明问题 —— 那个量级正好是星屑噪音该有的样子。
    """
    _reset(b)
    st = _handle(b, '{handle: 1, art: p.art(), ready: p.artReady(), failed: p.artFailed()}')
    if not st or st.get('noHandle'):
        return ([u'页面上没有 `window.__ELY_POSTCARD__` —— 验收句柄没建出来？'], u'—')

    fails = []
    prev, prev_i = None, None
    for i in range(ART_COUNT):
        b.js('window.__ELY_POSTCARD__.setArt(%d)' % i)
        time.sleep(0.5)
        st = _handle(b, '{art: p.art(), ready: p.artReady(), failed: p.artFailed()}') or {}
        if st.get('art') != i:
            fails.append(u'setArt(%d) 之后，句柄里的 art 是 %r' % (i, st.get('art')))
        if not st.get('ready'):
            fails.append(u'第 %d 张立绘没就绪（ready=false, failed=%r）' % (i, st.get('failed')))
        cur = _region_sig(b, ART_REGION)
        if prev is not None:
            d = _sig_diff(prev, cur)
            if d is None:
                fails.append(u'第 %d 与第 %d 张取不到区域签名（采样的画布对不对？）' % (prev_i, i))
            elif d < 0.15:
                fails.append(u'第 %d 与第 %d 张的左栏**差异只有 %.0f%%** —— '
                             u'换立绘画布没跟着变（或图没画上去）' % (prev_i, i, d * 100))
        prev, prev_i = cur, i
    return (fails, u'八张逐张就绪、且左栏真的变了（每步差异 ≥15%%）' if not fails else u'立绘有问题')


@browser_check
def check_art_failure_degrades(b):
    """立绘或二维码**加载失败**时：不报错、降级成「空框 / 只剩文字」。

    ⚠ 两条降级一起验 —— 它们是最容易「不冒烟就挂」的地方：页面看着正常，
      只是那张图上是空的。
    """
    fails = []

    # ⚠ 怎么造「加载失败」：**拦网络请求**，不往生产代码里塞测试开关。
    #   `Network.setBlockedURLs` 是 CDP 的现成能力（`snapshot.py` 早就用它屏蔽献花接口）。
    b._send('Network.enable')

    # ① 拦住全部立绘 → artFailed，且**相片框还在**（沿框顶那条边扫一层亮度凸起）
    b._send('Network.setBlockedURLs', {'urls': ['*armor-*.webp', '*skin-*.webp']})
    _reset(b)
    time.sleep(0.9)
    st = _handle(b, '{failed: p.artFailed(), ready: p.artReady()}') or {}
    if not st.get('failed'):
        fails.append(u'把立绘路径改坏之后，`artFailed` 仍是 %r —— 失败没被识别'
                     % st.get('failed'))
    bump = b.js("""(() => {
        var c = document.querySelector('#postcardPreview canvas');
        var p = window.__ELY_POSTCARD__;
        if (!c || !p) return null;
        var col = p.col()['art'];
        var ctx = c.getContext('2d');
        var y = Math.round(col.y * c.height);
        var d = ctx.getImageData(Math.round(col.x * c.width), y, Math.round(col.w * c.width), 1).data;
        var mx = 0;
        for (var i = 0; i < d.length; i += 4) {
          mx = Math.max(mx, (d[i] + d[i + 1] + d[i + 2]) / 3);
        }
        return Math.round(mx);
    })()""")
    if bump is None or bump < 60:
        fails.append(u'立绘加载失败之后，相片框那条边也看不见了（框顶最亮像素 %r）—— '
                     u'应该是「空框」而不是什么都没有' % bump)

    # ② 再拦住二维码 → qrFailed（立绘的拦截留着，两条降级同时在场）
    b._send('Network.setBlockedURLs', {'urls': ['*armor-*.webp', '*skin-*.webp', '*qr-elysiad.png']})
    _reset(b)
    time.sleep(0.9)
    st = _handle(b, '{qrFailed: p.qrFailed()}') or {}
    if not st.get('qrFailed'):
        fails.append(u'拦住二维码之后，`qrFailed` 仍是 %r —— 失败没被识别' % st.get('qrFailed'))

    # 收尾：把拦截撤掉（否则会跟着后面每条断言）
    b._send('Network.setBlockedURLs', {'urls': []})
    _reset(b)

    return (fails, u'两条降级都对：空框还在、二维码失败被识别' if not fails else u'降级不对')


@browser_check
def check_regions_fit_card(b):
    """立绘框与二维码都必须落在**内描边里面**（两档尺寸各验一遍）。

    ⚠ 这条是 2026-10-02 截图看出来的：`COL.qr.r` 是**半边长**（画出来 2r 见方、
      按宽算），当时把它当半径写，二维码**戳到卡片外面去了** —— 而画布不会报错、
      快照也测不到（整张画在 canvas 上）。几何判据最省事，也最直接。
    """
    _reset(b)
    fails = []
    for label, want_vert in ((u'竖版', True), (u'横版', False)):
        if b.js("(() => { var p = window.__ELY_POSTCARD__;"
                " return p && ((p.col().art.w === 0.42) === %s); })()"
                % ('true' if want_vert else 'false')) is not True:
            b.js('document.getElementById("postcardToggle").click()')
            time.sleep(0.6)
        geo = b.jso("""(() => {
            var p = window.__ELY_POSTCARD__;
            if (!p) return JSON.stringify({ noHandle: true });
            var c = document.querySelector('#postcardPreview canvas');
            return JSON.stringify({ w: c.width, h: c.height, col: p.col() });
        })()""")
        if not geo or geo.get('noHandle'):
            fails.append(u'[%s] 取不到句柄或画布' % label)
            continue
        W, H, c = geo['w'], geo['h'], geo['col']
        M = 0.031                       # 内描边
        a, q = c['art'], c['qr']
        for name, x0, y0, x1, y1 in (
                (u'立绘框', a['x'], a['y'], a['x'] + a['w'], a['y'] + a['h']),
                (u'二维码', q['x'], q['y'], q['x'] + 2 * q['r'], q['y'] + 2 * q['r'] * W / H)):
            if x0 < M or y0 < M or x1 > 1 - M or y1 > 1 - M:
                fails.append(u'[%s] %s 越出内描边：x %.2f~%.2f、y %.2f~%.2f（允许 %.3f~%.3f）'
                             % (label, name, x0, x1, y0, y1, M, 1 - M))
    return (fails, u'两块区域都在内描边里（两档）' if not fails else u'有越界')


@browser_check
def check_page_quiet(b):
    """整轮下来页面不许抛异常、不许有 console.error、不许有资源 404。

    ⚠ **资源 404 不写进 `Runtime`** —— 它只在 CDP 的 `Log` 域冒一条
      （HANDOVER §6.4 实测过：把整个脚本挪走，只判异常的实现照样绿）。
      所以这里两个域都收。
    """
    fails = []
    for e in b.events:
        m = e.get('method')
        if m == 'Runtime.exceptionThrown':
            d = e['params']['exceptionDetails']
            fails.append(u'页面抛了异常：%s' % (d.get('text') or d.get('exception', {}).get('description', ''))[:120])
        elif m == 'Runtime.consoleAPICalled' and e['params'].get('type') == 'error':
            args = e['params'].get('args') or []
            fails.append(u'console.error：%s' % (args[0].get('value') if args else '')[:120])
        elif m == 'Log.entryAdded':
            en = e['params']['entry']
            if en.get('level') == 'error':
                fails.append(u'浏览器级错误（%s）：%s ← %s'
                             % (en.get('source'), (en.get('text') or '')[:90], en.get('url') or ''))
    return (fails, u'无报错' if not fails else u'%d 条报错' % len(fails))


# ── 主流程 ────────────────────────────────────────────────────────────
def main():
    raw = sys.argv[1:]
    only = None
    if '--only' in raw:
        i = raw.index('--only')
        if i + 1 >= len(raw):
            print(u'--only 后面要跟一个名字片段')
            return 1
        only = raw[i + 1]
        raw = raw[:i] + raw[i + 2:]

    all_checks = TEXT_CHECKS + BROWSER_CHECKS
    if only and not any(only in f.__name__ for f in all_checks):
        print(u'❌ 没有哪条断言的名字里含 %r —— 筛口写错了？' % only)
        return 1

    tpool = [f for f in TEXT_CHECKS if not only or only in f.__name__]
    bpool = [f for f in BROWSER_CHECKS if not only or only in f.__name__]
    # ⚠ 「页面无报错」永远最后跑：它读的是整轮攒下来的事件
    if check_page_quiet in bpool:
        bpool = [f for f in bpool if f is not check_page_quiet] + [check_page_quiet]

    print(u'🔍 明信片断言 —— index.html 的 #postcard 那节')
    if only:
        print(u'   ⚠ **只跑**了名字含 %r 的断言（`--only`）—— 这不是一次全量验收' % only)
    print()

    failures = []
    idx = 0
    for fn in tpool:
        fails, summary = fn()
        idx += 1
        print(u'  %s %s %s' % (u'✓' if not fails else u'✗', chr(0x2460 + idx - 1) if idx <= 20 else u'(%d)' % idx, summary))
        for f in fails:
            print(u'       • ' + f)
        failures.extend(fails)

    if not bpool:
        print()
        if failures:
            print(u'❌ %d 项断言失败' % len(failures))
            return 1
        print(u'✅ 全部通过：%d 组断言' % idx)
        return 0

    # ── 起服务器 + 浏览器 ──
    try:
        httpd = start_server()
    except Exception as e:
        print(u'❌ %d 起不来：%s' % (PORT, e))
        return 1
    time.sleep(0.6)
    try:
        probe = urllib.request.urlopen('http://127.0.0.1:%d/data/quotes.js' % PORT, timeout=5).read().decode('utf-8')
    except Exception as e:
        httpd.shutdown()
        print(u'❌ 本地服务器起不来：%s' % e)
        return 1
    if u'想我了吗' not in probe:
        httpd.shutdown()
        print(u'❌ 服务器内容不对（quotes.js 里没有预期台词）—— %d 上是不是有别的东西？' % PORT)
        return 1

    # ⚠ 全新临时 profile：cdp.py 那个固定 profile 会跨次留存缓存，
    #   而这一轮会反复改 postcard.js —— 缓存会让断言**假通过**。
    profile = tempfile.mkdtemp(prefix='edge_postcard_')
    proc = subprocess.Popen([
        EDGE, '--remote-debugging-port=%d' % DBG, '--headless=new', '--disable-gpu',
        '--no-first-run', '--remote-allow-origins=*',
        '--user-data-dir=' + profile, '--window-size=1280,900',
        'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        targets = []
        for _ in range(20):
            try:
                targets = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json' % DBG))
                break
            except Exception:
                time.sleep(0.5)
        ws_url = next(t['webSocketDebuggerUrl'] for t in targets if t.get('type') == 'page')
        ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=60)
        b = Browser(ws)

        # ⚠ Runtime/Log 都必须在**导航之前**开：否则加载期的异常与 404 收不到
        b._send('Page.enable')
        b._send('Runtime.enable')
        b._send('Log.enable')
        b._send('Page.navigate', {'url': 'http://127.0.0.1:%d/%s?cb=%d' % (PORT, PAGE, time.time() * 1000)})
        time.sleep(2.2)

        for fn in bpool:
            fails, summary = fn(b)
            idx += 1
            print(u'  %s %s %s' % (u'✓' if not fails else u'✗', chr(0x2460 + idx - 1) if idx <= 20 else u'(%d)' % idx, summary))
            for f in fails:
                print(u'       • ' + f)
            failures.extend(fails)
        ws.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        shutil.rmtree(profile, ignore_errors=True)
        httpd.shutdown()

    print()
    if failures:
        print(u'❌ %d 项断言失败' % len(failures))
        return 1
    if only:
        print(u'✅ 全部通过：%d 组断言（`--only` 筛过的，**不是全量**）' % idx)
    else:
        print(u'✅ 全部通过：%d 组断言' % idx)
    return 0


if __name__ == '__main__':
    sys.exit(main())
