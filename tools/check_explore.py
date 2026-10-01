# -*- coding: utf-8 -*-
"""
tools/check_explore.py — 探索系统断言

**为什么需要这个：快照测不出「交互」。**

`snapshot.py` 采的是静态的计算样式与整页截图。一个可发现物如果
被 `overflow` 裁掉了、被别的元素盖住了、或者锚点选择器写错了，
它照样「存在于 DOM 里」、CSS 也照样算得对 —— 快照会给「✅ 无差异」。

但用户**永远点不到它**。这类 bug 不报错、不改变外观、不触发任何断言，
是最难发现的一种。所以本工具走**真实用户路径**：
真的派发鼠标事件、真的滚过去、真的 reload，
断言「触发前没有 → 触发后有了」这个**状态变化**本身。

── 跑法 ─────────────────────────────────────────────────────────────
    PYTHONIOENCODING=utf-8 python tools/check_explore.py [页面路径]

  不传页面 = `tools/explore-fixture.html`（探针页）。
  真页面：`python tools/check_explore.py mobius/index.html`

  自带服务器（**端口 8501**，刻意避开 8500）—— 见 HANDOVER §6.4：
  8500 上常残留别的 `http.server`，请求落到哪个不确定，会测出「内容完全错」的结果。

退出码：0 = 全部通过；1 = 有断言失败。
"""
import http.server
import json
import os
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

import websocket  # 与 tools/cdp.py 同源依赖

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8501
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

# 页面 → 该页声明的可发现物数量。
#   ⚠ 这张表是**故意**独立于页面的：页面上少写一个 find 时，
#     「声明数 == 渲染数」这条自洽断言抓不到（两边一起少了），
#     只有跟这张登记表比才抓得到。新页接入时**必须**在这里登记。
EXPECTED_FINDS = {
    'tools/explore-fixture.html': 5,
}


# ── 服务器 ────────────────────────────────────────────────────────────
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class QuietServer(socketserver.TCPServer):
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        # 浏览器取完就断开 —— ConnectionResetError 是常态，不是错误。
        pass


def start_server():
    handler = lambda *a, **k: Quiet(*a, directory=ROOT, **k)
    httpd = QuietServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


# ── 浏览器 ────────────────────────────────────────────────────────────
class Browser(object):
    """CDP 的一层薄封装。`send` 会把**非本次请求的**消息收进 `events`
    —— 页面抛的异常和 console 输出都在那儿，check_page_quiet 要用。"""

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
        """求值并返回值；**抛异常时返回 None**（不吞掉错误 —— check_page_quiet 会看见）。"""
        r = self._send('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
        res = r.get('result', {})
        if res.get('exceptionDetails'):
            return None
        return res.get('result', {}).get('value')

    def jso(self, expr):
        """求值 + 解析 JSON。断言里最常用的形态（JS 侧统一 `JSON.stringify` 回来）。"""
        v = self.js(expr)
        if v is None:
            return None
        try:
            return json.loads(v)
        except Exception:
            return None

    # ── 输入事件 ──────────────────────────────────────────────────────
    # 走 `Input.dispatchMouseEvent` —— 也就是**真的用户路径**。
    # ⚠ 不走「直接调内部函数」那条路：这些页的脚本都是 IIFE 包裹的，
    #   内部函数根本不是全局的（HANDOVER §10.6 Task 9 实测：
    #   `typeof fireKevinKiller666 === 'function'` 得到 undefined）。
    #   而且就算调得到，也测不出「事件到底有没有接上」这件事。
    def press(self, x, y):
        self._send('Input.dispatchMouseEvent', {
            'type': 'mousePressed', 'x': x, 'y': y,
            'button': 'left', 'buttons': 1, 'clickCount': 1})

    def release(self, x, y):
        self._send('Input.dispatchMouseEvent', {
            'type': 'mouseReleased', 'x': x, 'y': y,
            'button': 'left', 'buttons': 0, 'clickCount': 1})

    def move(self, x, y, buttons=1):
        self._send('Input.dispatchMouseEvent', {
            'type': 'mouseMoved', 'x': x, 'y': y,
            'button': 'none', 'buttons': buttons})

    def center(self, fid):
        """把可发现物滚进视口，返回它的**视口中心坐标**。

        ⚠ 必须先滚动。CDP 派发的是视口坐标，元素在视口外时事件会落到别处，
          而且**不会报错**（HANDOVER §6.4：cdp.py 的 click 要先滚动）。
        ⚠ `scrollIntoView` 必须带 `behavior:'instant'` —— 站点有
          `scroll-behavior:smooth`，平滑滚动下一帧才到位，紧接着量的坐标就是错的。
        """
        return self.jso("""(() => {
            var n = document.querySelector('[data-find-id="%s"]');
            if (!n) return null;
            n.scrollIntoView({ block: 'center', behavior: 'instant' });
            var r = n.getBoundingClientRect();
            return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        })()""" % fid)

    def found_ids(self):
        v = self.js('JSON.stringify(window.__ELY_EXPLORE__ ? window.__ELY_EXPLORE__.found : [])')
        return json.loads(v) if v else []


# ── 断言注册表 ────────────────────────────────────────────────────────
CHECKS = []


def check(fn):
    CHECKS.append(fn)
    return fn


@check
def check_declared_matches_rendered(b, page, expected):
    """① 声明了几个就生成几个 —— 且**就是那几个**。

    Review Focus #3：12 个 find 里有一个 id 写错或锚点选择器写错，
    探索度就**永远差一个**，解锁永远不触发。差一个的 bug 最难看见。
    所以这里比的是**集合**，不是个数：
      · 锚点找不到 → 渲染数 < 声明数 → 抓得到
      · id 写重复了 → 集合对不上 → 抓得到
      · 页面上少抄了一条 → 与 EXPECTED_FINDS 对不上 → 抓得到
    """
    d = b.jso("""(() => {
        var E = window.__ELY_EXPLORE__;
        if (!E) return JSON.stringify({ missing: true });
        var nodes = [].slice.call(document.querySelectorAll('.explore-find'));
        return JSON.stringify({
            declared: E.declared,
            rendered: nodes.map(function (n) { return n.getAttribute('data-find-id'); }),
        });
    })()""")
    if d is None or d.get('missing'):
        return ([u'取不到 window.__ELY_EXPLORE__ —— explore.js 没加载？'], u'—')

    fails = []
    declared, rendered = d['declared'], d['rendered']

    missing = [i for i in declared if i not in rendered]
    extra = [i for i in rendered if i not in declared]
    if missing:
        fails.append(u'声明了却没渲染出来（锚点选择器写错？）：%s' % u', '.join(missing))
    if extra:
        fails.append(u'渲染了却没声明（id 写重了？）：%s' % u', '.join(extra))
    if len(rendered) != len(set(rendered)):
        dup = sorted(set(i for i in rendered if rendered.count(i) > 1))
        fails.append(u'data-find-id 有重复：%s' % u', '.join(dup))
    if expected is not None and len(declared) != expected:
        fails.append(u'登记数 %d，页面声明了 %d —— 两边对不上' % (expected, len(declared)))
    elif expected is None:
        fails.append(u'本页没在 EXPECTED_FINDS 里登记 —— 新页接入必须登记（这是有意的）')

    summary = u'声明 %d / 渲染 %d%s' % (
        len(declared), len(rendered),
        u'' if expected is None else u'（登记 %d）' % expected)
    return (fails, summary)


@check
def check_accessible_names(b, page, expected):
    """② role / tabindex / aria-label 三项齐全（spec §5.6）。

    ⚠ 这一类**属性**改动，快照测不出来 —— 理由同 tools/check_aria_labels.py。
    12 个可发现物都得是 tab stop，键盘也要能用。
    """
    d = b.jso("""(() => {
        var nodes = [].slice.call(document.querySelectorAll('.explore-find'));
        return JSON.stringify(nodes.map(function (n) {
            var label = n.getAttribute('aria-label');
            return {
                id: n.getAttribute('data-find-id'),
                role: n.getAttribute('role'),
                tabIndex: n.tabIndex,
                label: label,
            };
        }));
    })()""")
    if d is None:
        return ([u'取不到 .explore-find 节点'], u'0 个')
    if not d:
        return ([u'一个 .explore-find 都没有'], u'0 个')

    fails = []
    for n in d:
        if n['role'] != 'button':
            fails.append(u'%s: role=%r（应为 button）' % (n['id'], n['role']))
        if n['tabIndex'] != 0:
            fails.append(u'%s: tabIndex=%r（应为 0，键盘要能 tab 到）' % (n['id'], n['tabIndex']))
        if not n['label']:
            fails.append(u'%s: 没有 aria-label（屏幕阅读器念不出它是什么）' % n['id'])

    return (fails, u'%d 个节点三项齐全' % len(d) if not fails else u'%d 个节点有缺' % len(d))


@check
def check_reachable(b, page, expected):
    """③ 每个可发现物都**真的点得到** —— Review Focus #1。

    这是本工具存在的头号理由。一个 find 可以：
      · 掉到锚点外面（`overflow:hidden` 裁掉）→ 存在，但永远点不到
      · 被别的元素盖住（z-index / 固定导航）→ 存在，但点下去是别人的
    两种情况都**不报错、不改外观**，快照一律「✅ 无差异」。

    判据三条，缺一不可：
      a. 尺寸 ≠ 0（渲染盒真实存在）
      b. 滚到它跟前之后，它的中心**落在视口内**
      c. `elementFromPoint(中心)` 命中的是它自己或它的后代 —— 这一条
         同时把「被裁掉」和「被盖住」都抓了
    """
    d = b.jso("""(() => {
        var nodes = [].slice.call(document.querySelectorAll('.explore-find'));
        var out = [];
        nodes.forEach(function (n) {
            // ⚠ 必须 behavior:'instant' —— site.css 里 html{scroll-behavior:smooth}，
            //   平滑滚动会在下一帧才到位，紧接着量的位置就是错的（HANDOVER §6.4）。
            n.scrollIntoView({ block: 'center', behavior: 'instant' });
            var r = n.getBoundingClientRect();
            var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            var hit = document.elementFromPoint(cx, cy);
            out.push({
                id: n.getAttribute('data-find-id'),
                w: Math.round(r.width), h: Math.round(r.height),
                inView: cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight,
                reachable: !!hit && (hit === n || n.contains(hit)),
                hitTag: hit ? hit.tagName : null,
            });
        });
        return JSON.stringify(out);
    })()""")
    if d is None:
        return ([u'取不到 .explore-find 节点'], u'0 个')
    if not d:
        return ([u'一个 .explore-find 都没有'], u'0 个')

    fails = []
    for n in d:
        if n['w'] == 0 or n['h'] == 0:
            fails.append(u"%s: 渲染盒是 %dx%d —— 它存在，但用户看不见也点不到"
                         % (n['id'], n['w'], n['h']))
            continue
        if not n['inView']:
            fails.append(u"%s: 滚到跟前了仍不在视口内（%dx%d）—— 是不是被裁掉了？"
                         % (n['id'], n['w'], n['h']))
        if not n['reachable']:
            fails.append(u"%s: 中心点的命中元素是 %s，不是它自己 —— 被盖住了"
                         % (n['id'], n['hitTag'] or u'空'))
        if n['w'] < 44 or n['h'] < 44:
            fails.append(u"%s: 热区 %dx%d < 44×44（WCAG 2.5.8，手指点不中）"
                         % (n['id'], n['w'], n['h']))

    return (fails, u'%d 个节点全部可达' % len(d) if not fails else u'%d 个里有问题' % len(d))


@check
def check_page_quiet(b, page, expected):
    """④ 页面**没有 JS 报错**。

    这一条计划里没写，是我加的 —— 本站最贵的一类 bug 就是「静默失败」：
    `explore.js` 抛一次异常，后面所有脚本集体停摆，页面看着还是好的。
    console 里的红字是唯一当场能看见的证据，所以它必须算失败，不能只算提示。
    """
    fails = []
    for e in b.events:
        m = e.get('method')
        if m == 'Runtime.exceptionThrown':
            d = e['params']['exceptionDetails']
            text = d.get('text') or ''
            desc = (d.get('exception') or {}).get('description') or ''
            # ⚠ 一定要带上**文件和行号**。不带的话「Unexpected token '<'」
            #   这种报错完全无法定位 —— 它可能来自任何一个 404 的脚本。
            where = d.get('url') or u'(inline)'
            if d.get('lineNumber') is not None:
                where += u':%d' % (d['lineNumber'] + 1)
            fails.append(u'未捕获异常 [%s]：%s %s'
                         % (where, text, (desc.split('\n')[0] if desc else u'')))
        elif m == 'Runtime.consoleAPICalled' and e['params'].get('type') == 'error':
            args = e['params'].get('args') or []
            text = u' '.join(str(a.get('value', a.get('description', u''))) for a in args)
            fails.append(u'console.error：%s' % text.strip())

    # 去重 —— 同一个错误每帧刷一次会淹掉报告
    fails = list(dict.fromkeys(fails))
    return (fails, u'无报错' if not fails else u'%d 条' % len(fails))


# ══ 五种互动动词 ══════════════════════════════════════════════════════
# 每条都派发**真实的输入事件**（见 Browser.press/move/release），
# 断言「触发前不在 found 里 → 触发后在了」这个状态变化本身。

def _do_click(b, c):
    b.press(c['x'], c['y']); time.sleep(0.06); b.release(c['x'], c['y'])


def _do_hold(b, c):
    # 判定线是 600ms（spec §5.1），按 750ms 留出余量 ——
    # 贴着阈值测，机器一慢就会变成假阴性
    b.press(c['x'], c['y']); time.sleep(0.75); b.release(c['x'], c['y'])


def _do_triple_tap(b, c):
    for _ in range(3):
        b.press(c['x'], c['y']); time.sleep(0.05)
        b.release(c['x'], c['y']); time.sleep(0.05)


def _do_drag(b, c):
    # ⚠ 这里刻意用**纵向**位移（dy=40）。
    #   横向的话 drag 与 slide 的输入长得一模一样，这条断言就退化成了
    #   「反正动一下就触发」——测不出方向判据。
    #   纵向移动只可能被 drag 接受（slide 要求 |dx|>|dy|），
    #   与下面那条「纵向不算划过」的反向断言正好把关卡的两面都钉住。
    b.press(c['x'], c['y'])
    for i in range(1, 5):
        b.move(c['x'], c['y'] + i * 10); time.sleep(0.02)
    b.release(c['x'], c['y'] + 40)


def _do_slide(b, c):
    b.press(c['x'], c['y'])
    for i in range(1, 5):
        b.move(c['x'] + i * 10, c['y']); time.sleep(0.02)
    b.release(c['x'] + 40, c['y'])


def _run_verb(b, fid, verb, action):
    if fid in b.found_ids():
        return ([u'%s 在测之前就已经是「已发现」了 —— 前面的检查污染了它' % fid], u'—')
    c = b.center(fid)
    if not c:
        return ([u'找不到 %s —— 它没被渲染出来' % fid], u'—')
    action(b, c)
    time.sleep(0.3)
    if fid in b.found_ids():
        return ([], u'%s 触发成功' % verb)
    return ([u'%s：派发了真实的 %s 输入之后，「已发现」里仍然没有它' % (fid, verb)],
            u'%s 没触发' % verb)


@check
def check_vertical_gesture_ignored(b, page, expected):
    """纵向滑动**不能**被当成「划过」—— Review Focus #4。

    用户手指落在可发现物上往下滑页面，这是手机上最常见的动作。
    如果 `slide` 只判「位移 ≥24px」而不判方向，这一滑就会沿路触发一串东西 ——
    这是本系统最败好感的一种 bug。

    ⚠ **本条必须跑在五个动词检查之前。** 等所有东西都被发现了再来测，
      断言就成了恒真式（本来就都在 found 里了），测了等于没测。
      所以这里先检查「跑之前一个都没发现」。
    """
    ids = b.found_ids()
    if ids:
        return ([u'跑这条时已经有 %d 个被发现（%s）—— 顺序错了，本断言会变成恒真式'
                 % (len(ids), u', '.join(ids))], u'顺序不对')

    c = b.center('fx-05')   # fx-05 就是 slide 那一位，在它身上起手最有针对性
    if not c:
        return ([u'找不到 fx-05'], u'—')

    # dx 只挪 4px（<10），dy 挪 84px（>60）—— 一个典型的「往下滑页面」手势
    b.press(c['x'], c['y'])
    for i in range(1, 7):
        b.move(c['x'] + (1 if i > 3 else 0), c['y'] + i * 14)
        time.sleep(0.02)
    b.release(c['x'] + 4, c['y'] + 84)
    time.sleep(0.3)

    after = b.found_ids()
    if after:
        return ([u'纵向滑了一下（dx=4, dy=84）却被判定成「划过」，触发了：%s'
                 % u', '.join(after)], u'误触发了')
    return ([], u'纵向手势被正确忽略')


@check
def check_verb_click(b, page, expected):
    """click —— 点一下。"""
    return _run_verb(b, 'fx-01', 'click', _do_click)


@check
def check_verb_hold(b, page, expected):
    """hold —— 按住 ≥600ms。"""
    return _run_verb(b, 'fx-02', 'hold', _do_hold)


@check
def check_verb_triple_tap(b, page, expected):
    """triple_tap —— 1.2 秒内点三次。"""
    return _run_verb(b, 'fx-03', 'triple_tap', _do_triple_tap)


@check
def check_verb_drag(b, page, expected):
    """drag —— 按下后位移 ≥24px（**纵向也算拖**）。"""
    return _run_verb(b, 'fx-04', 'drag', _do_drag)


@check
def check_verb_slide(b, page, expected):
    """slide —— 位移 ≥24px **且**横向分量大于纵向。"""
    return _run_verb(b, 'fx-05', 'slide', _do_slide)


@check
def check_bubble_shows_source(b, page, expected):
    """命中之后气泡出现，且**台词与出处都渲染出来了**。

    ⚠ 这一条计划里没有归属（Task 2 只写了「加 class + 进 found 数组」，
      但 spec §4.2 把「命中后播放该 find 的表现 + 台词气泡」算在 ElysiaExplore 的
      职责里，Task 11 的断言 ② 又要求气泡里含 src 文本）。见实施记录。
      没有它，「触发了但什么都没发生」不会被任何断言抓住。

    顺带守住「台词必须有出处」这条纪律：气泡里必须**同时**有 line 和 src。
    """
    # ⚠ 先在**本检查内部**重新触发一次 fx-01 再断言。
    #   气泡是单例（后一句顶掉前一句），直接读的话读到的是上一个检查留下的
    #   fx-05 的台词 —— 那种「测的不是我想测的东西」是假红最常见的来源。
    c = b.center('fx-01')
    if not c:
        return ([u'找不到 fx-01'], u'—')
    _do_click(b, c)
    time.sleep(0.3)

    d = b.jso("""(() => {
        var el = document.querySelector('.explore-bubble');
        if (!el) return JSON.stringify({ missing: true });
        return JSON.stringify({
            text: el.textContent,
            visible: el.classList.contains('visible'),
        });
    })()""")
    if d is None or d.get('missing'):
        return ([u'页面里没有 .explore-bubble —— 命中之后没有出气泡'], u'—')

    fails = []
    if not d['visible']:
        fails.append(u'气泡存在但没有 .visible（触发后是藏着的）')

    # 期望值从**页面自己声明的 THEME** 里取，不写死 ——
    # 免得探针页改一句台词，这条断言就假红。
    want = b.jso("""(() => {
        if (!window.THEME) return null;
        var f = (window.THEME.explore.finds || []).filter(function (x) {
            return x.id === 'fx-01';
        })[0];
        return f ? JSON.stringify({ line: f.line, src: f.src }) : null;
    })()""")
    if not want:
        fails.append(u'取不到页面声明的 fx-01（window.THEME 里没有）')
    else:
        if want['line'] not in d['text']:
            fails.append(u'气泡里没有 fx-01 的台词 %r，实际内容是：%r'
                         % (want['line'], d['text'][:80]))
        if want['src'] not in d['text']:
            fails.append(u'气泡里没有出处 %r（spec §4.1 要求 src 一起渲染）' % want['src'])

    return (fails, u'气泡含台词与出处' if not fails else u'气泡不对')


# ── 主流程 ────────────────────────────────────────────────────────────
def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    page = args[0] if args else 'tools/explore-fixture.html'
    expected = EXPECTED_FINDS.get(page)

    # ── §6.4 纪律：起完服务器**先验内容**再采样 ──
    #    8500 上常残留别的 http.server。本工具用 8501，但仍然自己验一遍：
    #    只要探针页的内容不对，后面测出来的东西全都不可信。
    try:
        httpd = start_server()
    except Exception as e:
        print(u'\u274c 8501 起不来：%s' % e)
        return 1
    time.sleep(0.6)
    try:
        probe = urllib.request.urlopen(
            'http://127.0.0.1:%d/tools/explore-fixture.html' % PORT, timeout=5).read().decode('utf-8')
    except Exception as e:
        httpd.shutdown()
        print(u'\u274c 本地服务器起不来：%s' % e)
        return 1
    if u'探索系统探针页' not in probe:
        httpd.shutdown()
        print(u'\u274c 服务器内容不对（探针页里没有预期标记）—— 8501 上是不是有别的东西？')
        return 1

    print(u'\U0001f50d 探索系统断言 —— %s' % page)
    print()

    # ⚠ 用**全新临时 profile**。cdp.py 那个 C:/tmp/edge_cdp 会跨次留存缓存
    #   （HANDOVER §6.4），改了 explore.js 再测可能读到的还是旧版本 ——
    #   对这种「加载了没加载」的断言，缓存会让它**假通过**。宁可贵一点。
    profile = tempfile.mkdtemp(prefix='edge_explore_')
    proc = subprocess.Popen([
        EDGE, '--remote-debugging-port=9322', '--headless=new', '--disable-gpu',
        '--no-first-run', '--remote-allow-origins=*',
        '--user-data-dir=' + profile, '--window-size=1280,900',
        'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    failures = []
    try:
        targets = []
        for _ in range(20):
            try:
                targets = json.load(urllib.request.urlopen('http://127.0.0.1:9322/json'))
                break
            except Exception:
                time.sleep(0.5)
        ws_url = next(t['webSocketDebuggerUrl'] for t in targets if t.get('type') == 'page')
        ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=60)
        b = Browser(ws)

        # Runtime.enable 必须在导航**之前** —— 否则加载期的异常收不到。
        b._send('Page.enable')
        b._send('Runtime.enable')
        b._send('Page.navigate', {
            'url': 'http://127.0.0.1:%d/%s?cb=%d' % (PORT, page, time.time() * 1000)})
        time.sleep(2.0)

        # ⚠ 「页面无报错」那条**必须跑在最后**：它读的是整轮攒下来的事件，
        #   提前跑就会漏掉后面手势测试里抛的异常 —— 而手势恰恰最容易抛异常。
        ordered = [f for f in CHECKS if f is not check_page_quiet] + [check_page_quiet]

        for i, fn in enumerate(ordered):
            fails, summary = fn(b, page, expected)
            mark = u'\u2713' if not fails else u'\u2717'
            # ①②③… 数到 20 就退回用序号，别让报告里出现奇怪的字符
            tag = chr(0x2460 + i) if i < 20 else u'(%d)' % (i + 1)
            print(u'  %s %s %s' % (mark, tag, summary))
            # 摘要太长时另起一行 —— 失败原因必须**当场看得见**
            for f in fails:
                print(u'       \u2022 ' + f)
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
        print(u'\u274c %d 项断言失败' % len(failures))
        return 1
    print(u'\u2705 全部通过：%d 组断言' % len(CHECKS))
    return 0


if __name__ == '__main__':
    sys.exit(main())
