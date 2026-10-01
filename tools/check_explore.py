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


# ══ 探索度与存储 ══════════════════════════════════════════════════════
STORAGE_KEY = 'elysia:explore:fixture'


def _reload(b, wait=2.0):
    b._send('Page.reload', {})
    time.sleep(wait)


def _stored(b):
    """读 localStorage 里那条进度记录。读取本身抛异常也要如实报出来。"""
    return b.jso("""(() => {
        try {
            var raw = window.localStorage.getItem('%s');
            if (!raw) return JSON.stringify({ found: [], empty: true });
            var o = JSON.parse(raw);
            return JSON.stringify({ found: o.found || [], unlocked: !!o.unlocked });
        } catch (e) {
            return JSON.stringify({ error: String(e) });
        }
    })()""" % STORAGE_KEY)


def _count_text(b):
    return b.js("(() => { var e = document.querySelector('.explore-count');"
                " return e ? e.textContent : null; })()")


@check
def check_progress_written(b, page, expected):
    """碰一个可发现物之后，进度**真的落进了 localStorage**。

    不写这一条的话，「持久化」就是句空话 —— 内存里改一改也能让页面看着对。
    """
    c = b.center('fx-01')
    if not c:
        return ([u'找不到 fx-01'], u'—')
    _do_click(b, c)
    time.sleep(0.4)

    d = _stored(b)
    if d is None:
        return ([u'读不到 localStorage'], u'—')
    if d.get('error'):
        return ([u'读存储时抛异常：%s' % d['error']], u'—')
    if 'fx-01' not in d['found']:
        return ([u'触发 fx-01 之后存储里的 found 是 %r，里面没有它' % d['found']], u'没落盘')
    return ([], u'已落盘（%d 项）' % len(d['found']))


@check
def check_progress_survives_reload(b, page, expected):
    """重载之后进度还在 —— 这是「进度」两个字的最低要求。"""
    before = b.found_ids()
    if not before:
        return ([u'重载前一个都没发现，这条断言测不出东西'], u'—')

    _reload(b)
    after = b.found_ids()
    missing = [i for i in before if i not in after]
    if missing:
        return ([u'重载后丢了 %s（前 %r，后 %r）' % (u', '.join(missing), before, after)],
                u'丢进度')

    fails = []
    # 读回来还不够 —— **节点当场就该是「已找到」的样子**，
    # 否则用户重进页面会看见进度是 3/5 但东西全是暗的。
    d = b.jso("""(() => {
        var n = document.querySelector('[data-find-id="fx-01"]');
        return JSON.stringify({ found: !!n && n.classList.contains('found') });
    })()""")
    if d and not d.get('found'):
        fails.append(u'进度读回来了，但 fx-01 节点上没有 .found —— 视觉上它又变回「没找到」了')

    return (fails, u'%d 项进度完好' % len(after))


@check
def check_count_text(b, page, expected):
    """探索度文案是「已发现 N / M」，数字**跟着 found 走**。

    ⚠ 先清空存储再重载 —— 让数字从确定的状态出发。
      不清的话这条断言会依赖「前面跑过哪些检查」，那种断言迟早会假红。
    """
    b.js("(() => { try { window.localStorage.removeItem('%s'); } catch (e) {}"
         " return 1; })()" % STORAGE_KEY)
    _reload(b)

    d0 = _count_text(b)
    if d0 is None:
        return ([u'页面里没有 .explore-count —— 探索度根本没渲染出来'], u'—')

    fails = []
    if d0 != u'已发现 0 / 5':
        fails.append(u'清空进度后该显示「已发现 0 / 5」，实际是 %r' % d0)

    c = b.center('fx-01')
    if not c:
        fails.append(u'找不到 fx-01')
    else:
        _do_click(b, c)
        time.sleep(0.4)
        d1 = _count_text(b)
        if d1 != u'已发现 1 / 5':
            fails.append(u'触发一个之后该显示「已发现 1 / 5」，实际是 %r' % d1)

    # 它是个**状态播报**，不是一段普通文字（spec §5.6）
    attrs = b.jso("""(() => {
        var el = document.querySelector('.explore-count');
        return JSON.stringify({
            role: el.getAttribute('role'),
            live: el.getAttribute('aria-live'),
        });
    })()""")
    if attrs and (attrs.get('role') != 'status' or attrs.get('live') != 'polite'):
        fails.append(u'缺 role=status / aria-live=polite，屏幕阅读器不会念它：%r' % attrs)

    return (fails, u'「已发现 1 / 5」正确' if not fails else u'文案不对')


# 打桩：让**所有** Storage 实例的 setItem 都抛异常。
# 用 defineProperty 改原型，因为直接写 localStorage.setItem = fn 在
# Storage 这种宿主对象上不一定生效（它有自己的属性语义）。
STORAGE_STUB = """
Object.defineProperty(Storage.prototype, 'setItem', {
  configurable: true, writable: true,
  value: function () { throw new Error('QuotaExceededError(桩)'); },
});
"""


@check
def check_storage_failure_degrades(b, page, expected):
    """Review Focus #2：localStorage 写失败时**页面照常能用**。

    隐私模式 / Safari ITP 下 localStorage 会直接抛异常。一次没接住的异常会让
    整页剩下的脚本集体停摆，而页面看上去还是好的 —— 本站最贵的一类 bug。

    所以这条断言要的**不是**「有没有存进去」，是「**页面还活着吗**」：
    还能触发、探索度照样涨。刷新后从头开始是可以接受的（spec §5.4 有意取舍），
    页面直接死掉不行。
    """
    r = b._send('Page.addScriptToEvaluateOnNewDocument', {'source': STORAGE_STUB})
    sid = (r.get('result') or {}).get('identifier')
    try:
        _reload(b)

        if b.js('String(!!window.__ELY_EXPLORE__)') != 'true':
            return ([u'打桩之后 __ELY_EXPLORE__ 都没了 —— 初始化阶段就崩了'], u'—')

        fails = []
        count_before = _count_text(b)

        c = b.center('fx-02')   # fx-02 是 hold
        if not c:
            fails.append(u'找不到 fx-02')
        else:
            _do_hold(b, c)
            time.sleep(0.4)
            after = b.found_ids()
            if 'fx-02' not in after:
                fails.append(u'写失败之后连「碰过什么」都记不住了 —— found 是 %r' % after)

            count_after = _count_text(b)
            if count_after == count_before:
                fails.append(u'探索度没跟着涨（一直是 %r）—— 降级没做到，用户看到的是「点了没反应」'
                             % count_after)

        return (fails, u'写失败时照常可用' if not fails else u'降级有问题')
    finally:
        # ⚠ 打桩要撤掉，否则它会跟着后面每一次导航 —— 下一个跑这个工具的人
        #   会遇到一堆「莫名其妙存不进去」，而且原因在几百行之外。
        if sid:
            b._send('Page.removeScriptToEvaluateOnNewDocument', {'identifier': sid})


# ══ 找齐解锁 ══════════════════════════════════════════════════════════
VERB_ACTIONS = {
    'click': _do_click,
    'hold': _do_hold,
    'triple_tap': _do_triple_tap,
    'drag': _do_drag,
    'slide': _do_slide,
}


def _trigger(b, fid):
    """按这个可发现物**自己声明的动词**触发它（动词从 DOM 上读，不写死）。

    这样探针页以后增删或改动词，测试不用跟着改。
    """
    verb = b.js("(() => { var n = document.querySelector('[data-find-id=\"%s\"]');"
                " return n ? n.getAttribute('data-verb') : null; })()" % fid)
    c = b.center(fid)
    if verb is None or not c:
        return False
    VERB_ACTIONS.get(verb, _do_click)(b, c)
    time.sleep(0.25)
    return True


def _reset(b):
    """清空这一页的进度并重载 —— 让每条断言从**确定**的状态出发。

    ⚠ 不这么做的话，断言的结果会取决于「前面跑过哪些检查」，
      那种依赖迟早会在某次重排顺序之后变成假红或假绿。
    """
    b.js("(() => { try { window.localStorage.removeItem('%s'); } catch (e) {}"
         " return 1; })()" % STORAGE_KEY)
    _reload(b)


def _unlock_state(b):
    return b.jso("""(() => {
        var el = document.querySelector('.explore-unlock');
        if (!el) return JSON.stringify({ missing: true });
        return JSON.stringify({ hidden: !!el.hidden });
    })()""")


@check
def check_unlock_hidden_until_complete(b, page, expected):
    """没找齐的时候，解锁区**在场但藏着**。

    ⚠ 「在场」和「藏着」要分开断言。如果实现是「解锁了才创建节点」，
      那「还没解锁」和「解锁区整个坏了」在 DOM 上长得一模一样，
      断言根本分不出来。
    """
    _reset(b)
    d = _unlock_state(b)
    if d is None:
        return ([u'取不到 .explore-unlock'], u'—')
    if d.get('missing'):
        return ([u'页面里没有 .explore-unlock —— 它应该一进页面就建好、带 hidden 藏着'], u'—')

    fails = []
    if not d['hidden']:
        fails.append(u'一个都没找到，解锁区却是显示出来的')
    if b.js('String(window.__ELY_EXPLORE__.unlocked)') != 'false':
        fails.append(u'__ELY_EXPLORE__.unlocked 不是 false')

    # 顺手确认：这时候它确实不该占位（hidden 得是真的 display:none，
    # 不能只靠 opacity:0 —— 那种元素照样占位、照样能被 elementFromPoint 命中）
    box = b.jso("""(() => {
        var el = document.querySelector('.explore-unlock');
        var r = el.getBoundingClientRect();
        return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) });
    })()""")
    if box and (box['w'] or box['h']):
        fails.append(u'解锁区带着 hidden 却仍然占了 %dx%d —— hidden 没生效'
                     % (box['w'], box['h']))

    return (fails, u'未找齐时藏着' if not fails else u'不该露出来')


@check
def check_unlock_appears_on_last(b, page, expected):
    """逐个触发全部 find —— **最后一个的同一个动作之后**，解锁立刻出现。

    ⚠ 要**逐个**验证，不是最后看一眼：只查终态的话，
      「找齐前就提前解锁了」这个 bug 会被完全放过（终态反正也是显示的）。
    """
    _reset(b)
    declared = b.js('JSON.stringify(window.__ELY_EXPLORE__.declared)')
    if not declared:
        return ([u'取不到 declared'], u'—')
    ids = json.loads(declared)
    if not ids:
        return ([u'declared 是空的'], u'—')

    fails = []
    for i, fid in enumerate(ids):
        if not _trigger(b, fid):
            fails.append(u'触发不了 %s' % fid)
            continue
        last = (i == len(ids) - 1)
        d = _unlock_state(b) or {}
        visible = not d.get('hidden', True)

        if last and not visible:
            fails.append(u'找齐最后一个（%s）之后解锁区仍然藏着 —— 判齐没触发' % fid)
        elif not last and visible:
            fails.append(u'才找到 %d / %d（刚碰完 %s）解锁区就出来了 —— 提前解锁'
                         % (i + 1, len(ids), fid))

    cnt = _count_text(b)
    if cnt != u'已发现 %d / %d' % (len(ids), len(ids)):
        fails.append(u'找齐后探索度是 %r，应「已发现 %d / %d」' % (cnt, len(ids), len(ids)))

    return (fails, u'逐个到齐才解锁' if not fails else u'解锁时机不对')


@check
def check_unlock_uses_set_not_count(b, page, expected):
    """Review Focus #3：判齐靠**集合包含**，不靠数量相等。

    构造法：先清空重载，再**直接往 found 里塞若干个同一个 id 的重复项**，
    让数组长度看起来刚好够，然后触发一个真的新 find ——
    于是 `found.length` 正好等于声明数，而真实集合里还差 3 个。

    靠长度判齐的实现在这里会**乱解锁**（而且不报错）；
    靠集合判齐的不会。

    ⚠ 构造完还要**把正向也验一遍**（补完剩下的，确认它照样能解锁）——
      否则这条断言有可能被一个「永远不会解锁」的实现骗过去。
    """
    _reset(b)
    declared = json.loads(b.js('JSON.stringify(window.__ELY_EXPLORE__.declared)') or '[]')
    if len(declared) < 2:
        return ([u'声明数太少（%d），构造不出这个场景' % len(declared)], u'—')

    # 往 found 里塞 declared-1 个重复项：长度 = 声明数 - 1，
    # 紧接着触发一个新 find，长度就**正好等于**声明数了
    b.js("""(() => {
        var f = window.__ELY_EXPLORE__.found;
        f.length = 0;
        for (var i = 0; i < %d; i++) f.push('%s');
        return 1;
    })()""" % (len(declared) - 1, declared[0]))

    if not _trigger(b, declared[1]):
        return ([u'触发不了 %s' % declared[1]], u'—')

    fails = []
    d = _unlock_state(b) or {}
    if not d.get('hidden', True):
        fails.append(u'found 里是 %d 个重复的 %s —— 真实集合只覆盖 1 / %d，'
                     u'解锁区却出来了：这是**靠数量判齐**的实现'
                     % (len(declared) - 1, declared[0], len(declared)))
    if b.js('String(window.__ELY_EXPLORE__.unlocked)') == 'true':
        fails.append(u'__ELY_EXPLORE__.unlocked 被置成了 true —— 同上')

    # 正向复验：把真的补齐，它必须解锁（防止「永远不解锁」蒙混过关）
    for fid in declared:
        _trigger(b, fid)
    d2 = _unlock_state(b) or {}
    if d2.get('hidden', True):
        fails.append(u'把 %d 个真的全找齐了，解锁区却还是藏着 —— 另一头也坏了' % len(declared))

    return (fails, u'集合判齐，重复项骗不过' if not fails else u'判齐方式不对')


# ══ 渐进提示 ══════════════════════════════════════════════════════════
def _hinted_ids(b):
    return b.jso("""(() => {
        var out = [];
        [].slice.call(document.querySelectorAll('.explore-find.hinted')).forEach(function (n) {
            out.push(n.getAttribute('data-find-id'));
        });
        return JSON.stringify(out);
    })()""") or []


def _trigger_first(b, n):
    """按声明顺序触发前 n 个，返回**实际成功触发**的 id。"""
    ids = json.loads(b.js('JSON.stringify(window.__ELY_EXPLORE__.declared)') or '[]')
    done = []
    for fid in ids[:n]:
        if _trigger(b, fid):
            done.append(fid)
    return done


@check
def check_hint_off_below_ratio(b, page, expected):
    """还没找到一半的时候，**一个提示都不该有**。

    ⚠ 要连着验两点：0 个没有、找到 2/5（0.4 < 0.5）时仍然没有。
      只验「一开始没有」的话，一个**永远不给提示**的实现也能通过 ——
      那就成了「测了等于没测」。
    """
    _reset(b)
    fails = []

    h0 = _hinted_ids(b)
    if h0:
        fails.append(u'一个都没找到就有提示了：%s' % u', '.join(h0))

    done = _trigger_first(b, 2)          # 2 / 5 = 0.4 < 0.5
    if len(done) < 2:
        return ([u'只触发了 %d 个，后面的判断不成立' % len(done)], u'—')

    h1 = _hinted_ids(b)
    if h1:
        fails.append(u'才找到 2 / 5（低于一半）就出现提示了：%s' % u', '.join(h1))

    return (fails, u'未过半时无提示' if not fails else u'过早提示')


@check
def check_hint_on_above_ratio(b, page, expected):
    """越过一半之后，**没找到的全带上提示、已找到的一个都不带**。"""
    _reset(b)
    declared = json.loads(b.js('JSON.stringify(window.__ELY_EXPLORE__.declared)') or '[]')
    if len(declared) < 4:
        return ([u'声明数太少（%d），验不出「部分带、部分不带」' % len(declared)], u'—')

    done = _trigger_first(b, 3)          # 3 / 5 = 0.6 ≥ 0.5
    if len(done) < 3:
        return ([u'只触发了 %d 个' % len(done)], u'—')

    hinted = _hinted_ids(b)
    fails = []
    should = [i for i in declared if i not in done]
    missing = [i for i in should if i not in hinted]
    extra = [i for i in hinted if i in done]
    if missing:
        fails.append(u'过半了，但这些**还没找到的**没有提示：%s' % u', '.join(missing))
    if extra:
        fails.append(u'这些**已经找到了**却还带着提示：%s' % u', '.join(extra))

    # ⚠ 提示**绝不能动几何**。挪动一个 44×44 的热区，
    #   用户正要点它的时候它跑了 —— 那是误触，比不给提示还糟。
    box = b.jso("""(() => {
        var n = document.querySelector('.explore-find.hinted');
        if (!n) return null;
        var r = n.getBoundingClientRect();
        return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) });
    })()""")
    if box and (box['w'] < 44 or box['h'] < 44):
        fails.append(u'加了提示之后热区缩成 %dx%d —— 提示动了几何' % (box['w'], box['h']))

    return (fails, u'过半后只提示没找到的' if not fails else u'提示范围不对')


# ══ 陪伴层（低语）═════════════════════════════════════════════════════
def _blank_point(b):
    """找一个「点下去不会碰到可发现物 / 链接 / 按钮」的视口坐标。

    ⚠ 不能随便取一个坐标就当空白：探针页上确实有 5 个 44×44 的热区，
      点到它们会走**另一条**代码路径（出气泡，不计数），
      于是低语的断言会莫名其妙地失败，而原因在几十行之外。
    """
    return b.jso("""(() => {
        window.scrollTo(0, 0);
        var cands = [[40, 40], [window.innerWidth - 40, 60], [window.innerWidth / 2, 14],
                     [60, window.innerHeight - 70]];
        for (var i = 0; i < cands.length; i++) {
            var x = cands[i][0], y = cands[i][1];
            var el = document.elementFromPoint(x, y);
            if (!el) continue;
            if (el.closest('.explore-find, a, button, [role="button"], input, textarea, select, label')) continue;
            return JSON.stringify({ x: x, y: y });
        }
        return null;
    })()""")


def _click_blank(b, times=1):
    """在空白处点 N 次 —— **连着点**，间隔很小（这正是冷却要挡住的形态）。"""
    p = _blank_point(b)
    if not p:
        return False
    for _ in range(times):
        b.press(p['x'], p['y'])
        time.sleep(0.02)
        b.release(p['x'], p['y'])
        time.sleep(0.03)
    return True


def _whisper_state(b):
    return b.jso("""(() => {
        var el = document.querySelector('.explore-whisper');
        var E = window.__ELY_EXPLORE__;
        return JSON.stringify({
            exists: !!el,
            shown: E ? E.whisperShown : null,
            text: el ? el.textContent : null,
            visible: !!el && el.classList.contains('visible') && !el.hidden,
        });
    })()""")


@check
def check_whisper_silent_during_cooldown(b, page, expected):
    """冷却期内**连着点多少次都不说话**。

    ⚠ 依赖「已经说过一句」这个前提 —— 开场时冷却还没启动，
      这时连点 3 次是**该**说话的。所以先正常说出一句，再测节流。
      不这么写的话，这条断言会跟「第 3 次才说话」那条互相矛盾。
    """
    _reset(b)
    if not _click_blank(b, 3):
        return ([u'探针页里找不到可用的空白坐标'], u'—')
    time.sleep(0.4)

    st = _whisper_state(b)
    if st['shown'] != 1:
        return ([u'开场连点 3 次该说出第 1 句，实际 whisperShown=%r' % st['shown']], u'—')

    # 紧接着连点 10 次 —— 全落在冷却里，而每次连点又**把冷却往后推**
    _click_blank(b, 10)
    time.sleep(0.4)
    st2 = _whisper_state(b)
    if st2['shown'] != 1:
        return ([u'冷却期内连点 10 次，低语从 1 句涨到了 %r —— 没节流'
                 % st2['shown']], u'没节流')

    return ([], u'冷却期内静默（连点 13 次只说了 1 句）')


@check
def check_whisper_on_third_click(b, page, expected):
    """冷却结束后的**第 3 次**点击才说话 —— 次数固定，不是概率。

    第 1、2 次都必须**没有**。只验「第 3 次说了」的话，
    一个「每次都说话」的实现照样能过。
    """
    _reset(b)
    fails = []

    if not _click_blank(b, 1):
        return ([u'找不到空白坐标'], u'—')
    time.sleep(0.25)
    s1 = _whisper_state(b)['shown']

    _click_blank(b, 1)
    time.sleep(0.25)
    s2 = _whisper_state(b)['shown']

    _click_blank(b, 1)
    time.sleep(0.35)
    st = _whisper_state(b)

    if s1 != 0:
        fails.append(u'第 1 次点击就说话了（whisperShown=%r）' % s1)
    if s2 != 0:
        fails.append(u'第 2 次点击就说话了（whisperShown=%r）' % s2)
    if st['shown'] != 1:
        fails.append(u'第 3 次点击没说话（whisperShown=%r）' % st['shown'])
    elif not st['visible']:
        fails.append(u'低语计数涨了，但节点没显示出来')
    if not st['exists']:
        fails.append(u'页面上根本没有 .explore-whisper 节点')

    return (fails, u'第 3 次才开口' if not fails else u'次数不对')


@check
def check_whisper_lines_in_order(b, page, expected):
    """台词**按数组顺序**推进 —— 不是随机抽。

    ⚠ 这条就是「不做抽卡」那条约定的直接断言。随机抽的实现迟早会在
      这里翻车（而且是**偶发**翻车，跑十次错一次那种）——
      所以这里连说三句逐个对，不是只说一句看看像不像。
    """
    _reset(b)
    lines = json.loads(b.js('JSON.stringify((window.THEME && THEME.explore.whisper) || [])') or '[]')
    if len(lines) < 3:
        return ([u'探针页的 whisper 少于 3 句（%d），验不出顺序' % len(lines)], u'—')

    seen = []
    for i in range(3):
        if i > 0:
            time.sleep(2.0)      # 等冷却过去（夹具设的 1500ms）
        _click_blank(b, 3)
        time.sleep(0.4)
        st = _whisper_state(b)
        if st['shown'] != i + 1:
            return ([u'第 %d 句没出来（whisperShown=%r，期待 %d）'
                     % (i + 1, st['shown'], i + 1)], u'—')
        seen.append(st['text'])

    fails = []
    for i, want in enumerate(lines[:3]):
        if seen[i] != want:
            fails.append(u'第 %d 句是 %r，按顺序该是 %r —— 台词不是按顺序推进的'
                         % (i + 1, seen[i], want))

    return (fails, u'三句逐字按序' if not fails else u'顺序不对')


@check
def check_whisper_auto_hides(b, page, expected):
    """低语 2.5 秒后**自己消失**。

    ⚠ 两头都要验：太早消失（还没读完就没了）和永不消失（叠在屏幕上挡路）
      都要抓。只验「最后没了」的话，一个「出现后 0.1 秒就没了」的实现能过。
    """
    _reset(b)
    if not _click_blank(b, 3):
        return ([u'找不到空白坐标'], u'—')
    time.sleep(0.4)

    st = _whisper_state(b)
    if not st['visible']:
        return ([u'低语压根没出现，这条断言测不出东西'], u'—')

    time.sleep(1.0)                      # 累计约 1.4 秒
    if not _whisper_state(b)['visible']:
        return ([u'低语出现不到 1.4 秒就没了 —— 话还没读完'], u'消失得太快')

    time.sleep(2.0)                      # 累计约 3.4 秒
    if _whisper_state(b)['visible']:
        return ([u'过了 3.4 秒低语还显示着 —— 它不会自己消失'], u'不消失')

    return ([], u'2.5 秒后自己消失')


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
