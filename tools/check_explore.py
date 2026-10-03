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

  `--reduced` —— 只跑减动（`prefers-reduced-motion`）那几条。
  `--only <名字片段>` —— **只跑名字里含这个片段的断言**。
    ⚠ 给变异测试用的（「证明断言抓得到错」要把同一条跑很多遍，
      而整轮要两分钟）。报告里会写明「筛过的」，别把它当成一次全量验收。

  自带服务器（**端口 8501**，刻意避开 8500）—— 见 HANDOVER §6.4：
  8500 上常残留别的 `http.server`，请求落到哪个不确定，会测出「内容完全错」的结果。

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

import websocket  # 与 tools/cdp.py 同源依赖

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8501
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

# 页面 → 该页声明的可发现物数量。
#   ⚠ 这张表是**故意**独立于页面的：页面上少写一个 find 时，
#     「声明数 == 渲染数」这条自洽断言抓不到（两边一起少了），
#     只有跟这张登记表比才抓得到。新页接入时**必须**在这里登记。
EXPECTED_FINDS = {
    'tools/explore-fixture.html': 6,
    'mobius/index.html': 12,
    'sakura/index.html': 12,
    'kosma/index.html': 12,
    # ⚠ 2026-10-03 由 **Task 6** 提前登记（计划把登记排在 Task 8，但 Task 6 自己
    #   就要跑本脚本 —— 未登记的新页会先挂一条与内容无关的断言，见 ledger Ruling R1）。
    #   Task 8 只做其余 7 个登记点。
    'griseo/index.html': 12,
}

# ── 樱这一页的**台词登记表** ─────────────────────────────────────────
#   (id, at, line, src 子事件) —— 2026-10-01 逐字核准自官方档案馆「事件-樱」，
#   核准记录见 `docs/superpowers/plans/2026-10-01-sakura-finds-table.md`。
#
# ⚠ **改台词必须同时改这里** —— 与 `check_aria_labels.py` 的 `EXPECTED` 同一个思路：
#   逼它变成一次**刻意动作**，而不是静默漂移。
# ⚠ 「**台词一条不编**」是本站底线，这张表就是那条底线的落点。
SAKURA_FINDS = [
    ('sakura-01', '#opening', '等待······对于此处的我们来说，又能有什么意义呢？', '关于自身·其一'),
    ('sakura-02', '#about', '对我来说，这是必要的举措，能够在很多情境对我加以提醒，让我不会忘记自己的立场。', '关于戒律·其一'),
    ('sakura-03', '#about', '换做是任何一位融合战士，都一样能结束那场事故——因为「阻止梅比乌斯」这件事，苏其实已经做到了。', '关于自身·其三'),
    ('sakura-04', '#blade', '而这把剑每出鞘一次，那份记忆就会重现一分。', '关于戒律·其一'),
    ('sakura-05', '#blade', '为了求生，我曾钻研诸武，但到最后，我仅有、却也最实用的，不过只此「一刀」。', '落樱的追忆·其二'),
    ('sakura-06', '#blade', '是的，每当我再次对自己的同类举剑，所面对的就不再是一时权衡，而是因记忆重现成倍而来的压力。', '关于戒律·其一'),
    ('sakura-07', '#journey', '在成为融合战士前，我就已隶属于一支名为「毒蛹」的秘密行动部队。和其他人不同，我们不能知道太多事。', '关于毒蛹·其一'),
    ('sakura-08', '#journey', '我······我和千劫正好相反。我不希望有其他人和我一起行动。', '关于毒蛹·其一'),
    ('sakura-09', '#journey', '看着二位，让我回想起曾经和妹妹相依为命的日子。那段时间虽然艰苦，但对我们两人来说，却是生命中最快乐的时光。', '关于自身·其四'),
    ('sakura-10', '#quotes', '虽然刻印的寓意最终是由爱莉希雅决定，但它并没有那么复杂。我曾说过「刹那」是一种技艺，而它所蕴含的所有，也只有「一刀」这么简单。', '落樱的追忆·其二'),
    ('sakura-11', '#ending', '其实，我也已经很久没有见到过樱花了。最后一次，还是在和千劫一起执行任务的路上。', '落樱的追忆·其七'),
    ('sakura-12', '#bottom', '我曾经教导过一些后继者制作简单便捷的食物，如果你有需要的话，也可以来找我。', '关于料理·其一'),
]

# 出处的前缀。⚠ 渲染进气泡角落的就是它，所以「出处」这件事是**看得见**的。
SAKURA_SRC_PREFIX = '官方档案馆 · 事件-樱 · '


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

    def center_of(self, selector):
        """把任意元素滚进视口，返回它的**视口中心坐标**。

        与 `center` 的区别：这个接受**任意选择器**（`center` 只认
        `data-find-id`）。`scrollIntoView` 的两条注意事项见 `center`。
        """
        return self.jso("""(() => {
            var n = document.querySelector('%s');
            if (!n) return null;
            n.scrollIntoView({ block: 'center', behavior: 'instant' });
            var r = n.getBoundingClientRect();
            return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        })()""" % selector)

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
#   每条断言带两个维度：
#     `modes` —— normal / reduced（减动那几条只在 --reduced 时跑）
#     `pages` —— 适用于哪些页。默认 `('*',)` 表示**任何页都该满足**；
#                写死了 `fx-01` 这类探针页 id 的，用 `@fixture_only` 收窄。
#   ⚠ 这个维度是 2026-10-01 做 Task 11 时补的：不给它的话，
#     `check_explore.py mobius/index.html` 会先挂 8 条与 mobius 无关的断言，
#     真正的问题被淹掉。**新页接入时也要照这个来。**
CHECKS = []

FIXTURE = 'tools/explore-fixture.html'


def check(fn):
    CHECKS.append(fn)
    if not hasattr(fn, 'modes'):
        fn.modes = ('normal',)
    if not hasattr(fn, 'pages'):
        fn.pages = ('*',)
    return fn


def check_reduced(fn):
    CHECKS.append(fn)
    fn.modes = ('reduced',)
    if not hasattr(fn, 'pages'):
        fn.pages = ('*',)
    return fn


def fixture_only(fn):
    """收窄成「只对探针页成立」—— 这些断言写死了 fx-01…fx-06 这些 id。"""
    fn.pages = (FIXTURE,)
    return fn


MOBIUS = 'mobius/index.html'


def mobius_only(fn):
    """收窄成「只对 /mobius/ 成立」—— 这些断言查的是她那一页的内容规格。"""
    fn.pages = (MOBIUS,)
    return fn


SAKURA = 'sakura/index.html'


def sakura_only(fn):
    """收窄成「只对 /sakura/ 成立」。

    ⚠ 樱这一页有一块**全站独有**的东西 ——「鞘中刀」（`#bladeStage`）：
    一柄不肯出鞘的刀，点三次她会改赠一朵「勿忘我」。那是 2026-09-17 建页时
    照她的性格设计的，别的页没有，所以这些断言只能在樱这一页上跑。
    """
    fn.pages = (SAKURA,)
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
@fixture_only
def check_late_anchor_gets_picked_up(b, page, expected):
    """锚点在 init **之后**才建出来的 find，必须被补扫到。

    真实场景：可发现物锚在「下方区块」上，而下方区块是 `ElysiaBottom.mount`
    才建出来的 —— `ElysiaExplore.init` 跑的时候它**还不存在**。
    不补扫的话那条会被静默跳过：声明 12 个、只渲染出 11 个，
    探索度永远差一个、解锁永远不触发（spec Review Focus #3）。

    ⚠ 这条单独拎出来，是为了让失败**一眼看得懂** ——
      混在「声明数对不上」里的话，真正的原因（两行调用的先后顺序）要翻半天。
    """
    d = b.jso("""(() => {
        var n = document.querySelector('[data-find-id="fx-06"]');
        var sec = document.getElementById('bottom');
        return JSON.stringify({
            section: !!sec,
            node: !!n,
            inSection: !!(n && sec && sec.contains(n)),
        });
    })()""")
    if d is None:
        return ([u'取不到页面状态'], u'—')

    fails = []
    if not d['section']:
        fails.append(u'没有 #bottom —— ElysiaBottom.mount 没跑，这条断言的前提不成立')
    if not d['node']:
        fails.append(u'fx-06（锚在 #bottom 上）根本没渲染出来 —— '
                     u'锚点是后建的，没被补扫到。探索度会永远差一个')
    elif not d['inSection']:
        fails.append(u'fx-06 渲染出来了，但**不在 #bottom 里面** —— 锚定错了地方')

    return (fails, u'后建锚点被补扫到' if not fails else u'补扫没生效')


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
        elif m == 'Log.entryAdded':
            # ⚠ **这一支是「资源加载失败」唯一的落点。**
            #   404 既不是 `Runtime.exceptionThrown`、也不是 `console.error` ——
            #   它只在 Log 域里冒一条 `source:network / level:error`。
            #   2026-10-01 实测：把 `assets/games/mobius.js` 整个挪走，
            #   上面两个分支**一条都没响**，这条断言照样绿 ——
            #   当时是**功能断言**碰巧抓到的（「找不到游戏卡上的按钮」）。
            #   缺文件是最普通的一种失败，不能靠碰巧。
            en = e['params'].get('entry') or {}
            if en.get('level') != 'error':
                continue
            where = en.get('url') or u''
            fails.append(u'浏览器级错误（%s）：%s%s'
                         % (en.get('source'), en.get('text'),
                            (u'  ← ' + where) if where else u''))

    # 去重 —— 同一个错误每帧刷一次会淹掉报告
    fails = list(dict.fromkeys(fails))
    return (fails, u'无报错' if not fails else u'%d 条' % len(fails))


# 「页面无报错」两种模式都要跑 —— 减动路径上照样可能抛异常
check_page_quiet.modes = ('normal', 'reduced')


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
@fixture_only
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
@fixture_only
def check_verb_click(b, page, expected):
    """click —— 点一下。"""
    return _run_verb(b, 'fx-01', 'click', _do_click)


@check
@fixture_only
def check_verb_hold(b, page, expected):
    """hold —— 按住 ≥600ms。"""
    return _run_verb(b, 'fx-02', 'hold', _do_hold)


@check
@fixture_only
def check_verb_triple_tap(b, page, expected):
    """triple_tap —— 1.2 秒内点三次。"""
    return _run_verb(b, 'fx-03', 'triple_tap', _do_triple_tap)


@check
@fixture_only
def check_verb_drag(b, page, expected):
    """drag —— 按下后位移 ≥24px（**纵向也算拖**）。"""
    return _run_verb(b, 'fx-04', 'drag', _do_drag)


@check
@fixture_only
def check_verb_slide(b, page, expected):
    """slide —— 位移 ≥24px **且**横向分量大于纵向。"""
    return _run_verb(b, 'fx-05', 'slide', _do_slide)


@check
@fixture_only
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
# ⚠ 存储键在**运行期**从页面取（`ElysiaExplore.pageId()`），不写死页名 ——
#   写死的话这套断言就只能跑探针页，mobius 一行都验不了。


def _reload(b, wait=2.0):
    b._send('Page.reload', {})
    time.sleep(wait)


def _stored(b):
    """读 localStorage 里那条进度记录。读取本身抛异常也要如实报出来。"""
    return b.jso("""(() => {
        try {
            var key = 'elysia:explore:' + ElysiaExplore.pageId();
            var raw = window.localStorage.getItem(key);
            if (!raw) return JSON.stringify({ found: [], empty: true });
            var o = JSON.parse(raw);
            return JSON.stringify({ found: o.found || [], unlocked: !!o.unlocked });
        } catch (e) {
            return JSON.stringify({ error: String(e) });
        }
    })()""")


def _count_text(b):
    return b.js("(() => { var e = document.querySelector('.explore-count');"
                " return e ? e.textContent : null; })()")


def _first_declared(b):
    """本页声明的第一个可发现物 id。

    ⚠ 存储/探索度这几条断言**在每一页上都该成立**，所以不能写死 `fx-01` ——
      写死的话它们只在探针页跑得动，mobius 一行都验不了。
    """
    return b.js('String((window.__ELY_EXPLORE__ && window.__ELY_EXPLORE__.declared'
                ' || [])[0] || "")')


def _src_number(page, key, default):
    """从页面源码里读一个数值字段（如 `whisperCooldownMs`）；没有就用默认值。

    ⚠ 必须**按页读**：`whisperCooldownMs` 逐页不同（共享层默认 8000，
      mobius 按 spec 设得更稀疏）。测试里写死一个数的话，
      换了页就会「等不够」→ 断言假红，而人会以为是自己改坏了什么。
    """
    src = io.open(os.path.join(ROOT_DIR, page), encoding='utf-8').read()
    m = re.search(re.escape(key) + r'\s*:\s*(\d+)', src)
    return int(m.group(1)) if m else default


def _src_array(page, key):
    """从**页面源码**里抠出 `key: [ '…', '…' ]` 这个数组的字面量。

    ⚠ 为什么不能读 `window.THEME`：mobius 的脚本是 IIFE 包裹的，
      `window.THEME` 是 **undefined**（Task 10 实测确认）。
      探针页能读只是因为它的 `var THEME` 恰好在顶层 —— 那种断言搬到真页面上
      会变成「永远取到空数组」的假绿/假红。
    """
    src = io.open(os.path.join(ROOT_DIR, page), encoding='utf-8').read()
    i = src.find(key + ':')
    if i < 0:
        return []
    j = src.index('[', i)
    k = src.index(']', j)
    return re.findall(r"'([^'\n]*)'", src[j:k])


@check
def check_progress_written(b, page, expected):
    """碰一个可发现物之后，进度**真的落进了 localStorage**。

    不写这一条的话，「持久化」就是句空话 —— 内存里改一改也能让页面看着对。
    """
    fid = _first_declared(b)
    if not fid:
        return ([u'取不到 declared —— 挑不出一个来触发'], u'—')
    if not _trigger(b, fid):
        return ([u'触发不了 %s' % fid], u'—')
    time.sleep(0.4)

    d = _stored(b)
    if d is None:
        return ([u'读不到 localStorage'], u'—')
    if d.get('error'):
        return ([u'读存储时抛异常：%s' % d['error']], u'—')
    if fid not in d['found']:
        return ([u'触发 %s 之后存储里的 found 是 %r，里面没有它' % (fid, d['found'])], u'没落盘')
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
        var n = document.querySelector('[data-find-id="%s"]');
        return JSON.stringify({ found: !!n && n.classList.contains('found') });
    })()""" % before[0])
    if d and not d.get('found'):
        fails.append(u'进度读回来了，但 %s 节点上没有 .found —— 视觉上它又变回「没找到」了'
                     % before[0])

    return (fails, u'%d 项进度完好' % len(after))


@check
def check_count_text(b, page, expected):
    """探索度文案是「已发现 N / M」，数字**跟着 found 走**。

    ⚠ 先清空存储再重载 —— 让数字从确定的状态出发。
      不清的话这条断言会依赖「前面跑过哪些检查」，那种断言迟早会假红。
    """
    b.js("(() => { try { window.localStorage.removeItem("
         "'elysia:explore:' + ElysiaExplore.pageId()); } catch (e) {} return 1; })()")
    _reload(b)

    d0 = _count_text(b)
    if d0 is None:
        return ([u'页面里没有 .explore-count —— 探索度根本没渲染出来'], u'—')

    fails = []
    # ⚠ 总数从 declared 里读，别写死 —— 写死的话每加一条可发现物都要回来改测试，
    #   而「忘了改」的症状是这条断言假红，不是真的坏了。
    total = b.js('String((window.__ELY_EXPLORE__ && window.__ELY_EXPLORE__.declared || []).length)')
    if d0 != u'已发现 0 / %s' % total:
        fails.append(u'清空进度后该显示「已发现 0 / %s」，实际是 %r' % (total, d0))

    fid = _first_declared(b)
    if not fid or not _trigger(b, fid):
        fails.append(u'触发不了本页第一个可发现物（%r）' % fid)
    else:
        time.sleep(0.4)
        d1 = _count_text(b)
        if d1 != u'已发现 1 / %s' % total:
            fails.append(u'触发一个之后该显示「已发现 1 / %s」，实际是 %r' % (total, d1))

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

        # ⚠ 挑一个**还没被发现的** id —— 已经找到过的再触发不会改进度，
        #   而这条断言要看的正是「进度还涨不涨」。
        ids = json.loads(b.js('JSON.stringify(window.__ELY_EXPLORE__.declared)') or '[]')
        already = b.found_ids()
        nxt = next((i for i in ids if i not in already), None)
        if not nxt:
            fails.append(u'所有可发现物都已经发现了，挑不出一个来测降级')
        elif not _trigger(b, nxt):
            fails.append(u'触发不了 %s' % nxt)
        else:
            time.sleep(0.4)
            after = b.found_ids()
            if nxt not in after:
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
    b.js("(() => { try { window.localStorage.removeItem("
         "'elysia:explore:' + ElysiaExplore.pageId()); } catch (e) {} return 1; })()")
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

    n = len(json.loads(b.js('JSON.stringify(window.__ELY_EXPLORE__.declared)') or '[]'))
    below = max(1, (n + 1) // 2 - 1)     # 严格低于提示线（默认 0.5）
    done = _trigger_first(b, below)
    if len(done) < below:
        return ([u'只触发了 %d 个，后面的判断不成立' % len(done)], u'—')

    h1 = _hinted_ids(b)
    if h1:
        fails.append(u'才找到 %d / %d（低于一半）就出现提示了：%s'
                     % (len(done), n, u', '.join(h1)))

    return (fails, u'未过半时无提示' if not fails else u'过早提示')


@check
def check_hint_on_above_ratio(b, page, expected):
    """越过一半之后，**没找到的全带上提示、已找到的一个都不带**。"""
    _reset(b)
    declared = json.loads(b.js('JSON.stringify(window.__ELY_EXPLORE__.declared)') or '[]')
    if len(declared) < 4:
        return ([u'声明数太少（%d），验不出「部分带、部分不带」' % len(declared)], u'—')

    above = len(declared) // 2 + 1       # 稳稳越过提示线
    done = _trigger_first(b, above)
    if len(done) < above:
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


@check
def check_hints_survive_remount(b, page, expected):
    """重挂下方区块之后，**提示不能悄悄消失**。

    `ElysiaBottom.mount` 会 `sec.innerHTML = ''` 重画整块 ——
    挂在里面的可发现物**连同节点一起被抹掉**，再由 `ensureAttached` 挂回来。
    但挂回来的是**新节点**：`attach()` 只补 `found` 类、**不补 `hinted`**。
    于是「已经找到过半」这个提示会在重挂之后凭空消失，**而且不报错** ——
    正是这个项目一直在防的那类静默失败。

    ⚠ 这条必须有「后建的锚点」那种 find 才有意义（它才会被抹掉又挂回）——
      探针页的 `fx-06` 就是。纯锚在正文里的页面上，这条会平凡通过。
    """
    _reset(b)
    declared = json.loads(b.js('JSON.stringify(window.__ELY_EXPLORE__.declared)') or '[]')
    n = len(declared)
    if n < 4:
        return ([u'声明数太少（%d），构造不出这个场景' % n], u'—')

    above = n // 2 + 1
    done = _trigger_first(b, above)
    if len(done) < above:
        return ([u'只触发了 %d 个' % len(done)], u'—')

    before = set(_hinted_ids(b))
    if not before:
        return ([u'过半了却一个提示都没有 —— 这条断言的前提不成立'], u'—')

    b.js('(() => { ElysiaBottom.mount(); return 1; })()')
    time.sleep(0.4)
    after = set(_hinted_ids(b))

    fails = []
    lost = sorted(before - after)
    if lost:
        fails.append(u'重挂区块之后这些的提示没了：%s —— '
                     u'`attach()` 补了 found、没补 hinted' % u', '.join(lost))
    return (fails, u'重挂后提示仍在（%d 个）' % len(after) if not fails else u'提示丢了')


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
    lines = _src_array(page, 'whisper')
    if len(lines) < 3:
        return ([u'%s 的 whisper 少于 3 句（%d），验不出顺序' % (page, len(lines))], u'—')

    # ⚠ 冷却时长**按页从源码读**，不写死 —— 逐页不同（mobius 是 12000，
    #   共享层默认 8000）。写死的话换了页就会「等不够」→ 假红。
    cooldown = _src_number(page, 'whisperCooldownMs', 8000) / 1000.0 + 0.8
    seen = []
    for i in range(3):
        if i > 0:
            time.sleep(cooldown)     # 等冷却过去
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


# ══ 减动降级（WCAG 2.3.1）═════════════════════════════════════════════
def _set_motion(b, value):
    """切 prefers-reduced-motion。value 传 'reduce' 或 'no-preference'。"""
    b._send('Emulation.setEmulatedMedia', {
        'features': [{'name': 'prefers-reduced-motion', 'value': value}]})
    time.sleep(0.35)


def _anim(b, selector):
    return b.js("(() => { var n = document.querySelector('%s');"
                " return n ? getComputedStyle(n).animationName : null; })()" % selector)


@check_reduced
def check_reduced_breathing_stops(b, page, expected):
    """减动打开时，可发现物的呼吸光**停下来**。

    ⚠ 光断言 animation-name 是 none 还不够 —— 得同时确认
      **静态兜底还在**（filter 没变成 none）。否则一个「减动下把整个元素
      的发光都去掉」的实现也能过，而那属于「把动效关成了功能缺失」。
    """
    _set_motion(b, 'reduce')
    fails = []

    name = _anim(b, '.explore-art')
    if name is None:
        return ([u'页面上没有 .explore-art'], u'—')
    if name != 'none':
        fails.append(u'.explore-art 的 animation-name 是 %r，应为 none —— 呼吸光没停' % name)

    flt = b.js("(() => { var n = document.querySelector('.explore-art');"
               " return getComputedStyle(n).filter; })()")
    if not flt or flt == 'none':
        fails.append(u'减动下 .explore-art 的 filter 也没了 —— 呼吸该停，'
                     u'但静态的发光要留着，不该把它一起关掉')

    return (fails, u'呼吸停、静态光还在' if not fails else u'减动没生效')


@check_reduced
def check_reduced_hint_static_marker(b, page, expected):
    """减动下提示**不闪**，但**仍有可见的静态标记**（那圈虚线轮廓）。

    ⚠ 这就是 spec §5.5 那句「改为常亮的淡边框，不闪」的落点。
      只断言「不闪」的话，一个「减动下干脆不给提示」的实现也能过 ——
      那等于把功能关了，而减动要关的只是动效。
    """
    _set_motion(b, 'reduce')
    _reset(b)
    # ⚠ 触发几个**按本页的声明数算**，别写死 —— 写死的话换了页就够不到提示线，
    #   断言会假红（mobius 12 个，3/12 = 0.25 远低于 0.5）。
    n = len(json.loads(b.js('JSON.stringify(window.__ELY_EXPLORE__.declared)') or '[]'))
    above = n // 2 + 1
    done = _trigger_first(b, above)
    if len(done) < above:
        return ([u'只触发了 %d 个，提示条件不成立' % len(done)], u'—')

    if not _hinted_ids(b):
        return ([u'减动下过半了却一个提示都没有 —— 减动不该把提示关掉'], u'—')

    fails = []
    name = _anim(b, '.explore-find.hinted .explore-art')
    if name != 'none':
        fails.append(u'减动下 .hinted 的呼吸还在闪（animation-name=%r）' % name)

    d = b.jso("""(() => {
        var n = document.querySelector('.explore-find.hinted');
        var cs = getComputedStyle(n);
        return JSON.stringify({ style: cs.outlineStyle, width: cs.outlineWidth });
    })()""")
    if not d or d['style'] == 'none':
        fails.append(u'闪烁关掉之后**没有任何静态标记**了 —— '
                     u'减动用户拿不到提示，这是把功能关掉了：%r' % d)

    return (fails, u'不闪但有静态轮廓' if not fails else u'提示没了')


@check_reduced
def check_reduced_whisper_still_works(b, page, expected):
    """减动下低语**照常出现**，而且只有文字。

    ⚠ 计划里这条写的是「低语只出文字，不带粒子节点」。
      本实现里低语**从来就没有粒子节点**（它一直是纯文字），
      所以「有没有粒子」这件事本身测不出任何东西。
      改成测**两件真的有风险的事**：
        · 减动段会不会顺手把低语整个关掉（「关动画」写成「关功能」）
        · 低语节点里会不会混进装饰性子元素
    """
    _set_motion(b, 'reduce')
    _reset(b)
    if not _click_blank(b, 3):
        return ([u'找不到空白坐标'], u'—')
    time.sleep(0.4)

    st = _whisper_state(b)
    if st['shown'] != 1:
        return ([u'减动下连点 3 次没出低语（whisperShown=%r）—— '
                 u'减动把陪伴层也一起关了' % st['shown']], u'功能被关掉了')

    fails = []
    if not st['visible']:
        fails.append(u'低语计数涨了但节点没显示 —— 减动下只出文字，不是不出')

    d = b.jso("""(() => {
        var el = document.querySelector('.explore-whisper');
        return JSON.stringify({ children: el.children.length });
    })()""")
    if d and d['children']:
        fails.append(u'低语节点里有 %d 个元素子节点 —— 它应该只有文字' % d['children'])

    return (fails, u'低语照常，且只有文字' if not fails else u'减动下低语不对')


@check_reduced
def check_reduced_off_motion_returns(b, page, expected):
    """**反向断言**：把减动关掉，同一批选择器的动画必须回来。

    没有这一条的话，「减动段泄漏了」（比如不小心写在 @media 外面）
    永远测不出来 —— 因为只验减动侧的话，两边都是「动画没了」，看着都对。
    """
    _reset(b)
    n = len(json.loads(b.js('JSON.stringify(window.__ELY_EXPLORE__.declared)') or '[]'))
    above = n // 2 + 1                   # 同上：按本页的声明数算
    done = _trigger_first(b, above)
    if len(done) < above:
        return ([u'只触发了 %d 个，提示条件不成立' % len(done)], u'—')

    _set_motion(b, 'no-preference')
    fails = []

    a1 = _anim(b, '.explore-art')
    if a1 in (None, 'none'):
        fails.append(u'减动**关闭**时 .explore-art 也没有动画（%r）—— '
                     u'减动段泄漏到正常态了' % a1)

    a2 = _anim(b, '.explore-find.hinted .explore-art')
    if a2 in (None, 'none'):
        fails.append(u'减动**关闭**时提示不闪（%r）—— 同上' % a2)

    _set_motion(b, 'reduce')             # 收尾：别把模式留给后面
    return (fails, u'正常态动画都在' if not fails else u'减动段泄漏了')


# ══ 下方区块：生日倒计时 ══════════════════════════════════════════════
# 冻结时钟。**和 tools/snapshot.py 的 SEED_DATE_JS 是同一个理由**：
# 倒计时吃日期，跨过零点结果就变 —— 那会骗过一切当场自检
# （HANDOVER §6.4：「快照基线会随日历漂」）。
# 这里是运行时改 window.Date，不用重载页面：bottom.js 里的 `new Date()`
# 是在**画的时候**才去全局作用域取的。
FROZEN_CLOCK = """
(() => {
  var RealDate = Date;
  var FIXED = RealDate.UTC(2026, 8, 16, 12, 0, 0);   // 2026-09-16 12:00Z（月份从 0 起）
  function FrozenDate() {
    if (arguments.length === 0) return new RealDate(FIXED);
    return Reflect.construct(RealDate, [].slice.call(arguments));
  }
  FrozenDate.prototype = RealDate.prototype;   // 保住 instanceof 与原型方法
  FrozenDate.now = function () { return FIXED; };
  FrozenDate.UTC = RealDate.UTC;
  FrozenDate.parse = RealDate.parse;
  window.__REAL_DATE__ = RealDate;
  window.Date = FrozenDate;
  return 1;
})()
"""

UNFROZEN_CLOCK = """
(() => {
  if (window.__REAL_DATE__) window.Date = window.__REAL_DATE__;
  return 1;
})()
"""

BD_CASES = """
(() => {
  var key = ElysiaBday.pageKey();
  // ⚠ 先记住原条目：这一页可能本来就在生日表里
  var had = Object.prototype.hasOwnProperty.call(window.ELYSIA_BDAYS, key);
  var old = window.ELYSIA_BDAYS[key];
  var out = [];

  function txt(id) { var e = document.getElementById(id); return e ? e.textContent : null; }

  function setBday(m, d, label) {
    window.ELYSIA_BDAYS[key] = [m, d];
    // ⚠ 不传参（不是传 `{}`）—— 传空对象会把上一次的 opts 整个换掉。
    ElysiaBday.mount();
    var timer = document.getElementById('bdayTimer');
    var date = document.querySelector('.bday-date');
    out.push({
      label: label, m: m, d: d,
      text: txt('bdayEggText'),
      date: date ? date.textContent : null,
      D: txt('bdD'), H: txt('bdH'), M: txt('bdM'), S: txt('bdS'),
      timerHidden: !!timer && timer.style.display === 'none',
    });
  }

  var now = new Date();
  var y = now.getFullYear(), M = now.getMonth(), D = now.getDate();

  // (a) 今天就是生日
  setBday(M, D, 'today');

  // (b) 四天之后。期望值**独立算一遍**（不抄 bday.js 里那段公式）
  var t4 = new Date(y, M, D + 4);
  setBday(t4.getMonth(), t4.getDate(), 'plus4');
  out[out.length - 1].expect = Math.floor(
    (new Date(t4.getFullYear(), t4.getMonth(), t4.getDate(), 0, 0, 0) - now.getTime()) / 86400000);

  // (c) 昨天 —— 必须滚到明年
  var y1 = new Date(y, M, D - 1);
  setBday(y1.getMonth(), y1.getDate(), 'yesterday');

  // 收尾：**还原**，不是无脑 delete ——
  // 这一页本来就在生日表里的话（mobius 就是），delete 会把真条目抹掉，
  // 后面几条断言会跟着红，而原因在几百行之外。实测踩到过。
  if (had) window.ELYSIA_BDAYS[key] = old;
  else delete window.ELYSIA_BDAYS[key];
  ElysiaBday.mount();
  return JSON.stringify(out);
})()
"""


def _bday_widget(b):
    """看生日胶囊在不在、这一页有没有登记。

    ⚠ 判据是 **`#bdayEgg` 这个节点在不在**，不是「有没有被藏起来」——
      藏起来的那种，断言分不出「这页没有生日」和「组件坏了」。
    """
    return b.jso("""(() => {
        return JSON.stringify({
            key: window.ElysiaBday ? ElysiaBday.pageKey() : null,
            listed: !!(window.ELYSIA_BDAYS && window.ElysiaBday
                       && ELYSIA_BDAYS[ElysiaBday.pageKey()]),
            egg: !!document.getElementById('bdayEgg'),
            panel: !!document.getElementById('bdayPanel'),
            eggs: document.querySelectorAll('#bdayEgg').length,
            panels: document.querySelectorAll('#bdayPanel').length,
            // 旧的「下方区块里的倒计时」必须彻底不在了（两处倒计时是最坏的情况）
            inBottom: !!document.querySelector('.bottom-bday'),
        });
    })()""")


@check
@fixture_only
def check_bday_absent_when_not_listed(b, page, expected):
    """表里没有这一页 → **整个不渲染**（连胶囊都没有）。

    ⚠ 「不渲染」和「渲染了再藏起来」是两回事。藏起来的那种，
      断言分不出「这页没有生日」和「倒计时组件坏了」——
      而后者会静默地让所有页面的倒计时一起消失。

      探针页**刻意不在** data/bdays.js 里（它是个测试页，本来也没有生日），
      但它**加载并调用了** `bday.js` —— 所以这条断的是
      「组件在跑，但页面不在表里，于是什么都不该出现」。
    """
    _reset(b)
    d = _bday_widget(b)
    if d is None:
        return ([u'取不到生日组件的状态 —— bday.js 没跑？'], u'—')

    fails = []
    if d['key'] != 'tools/explore-fixture.html':
        fails.append(u'pageKey() 得到 %r，期待 tools/explore-fixture.html' % d['key'])
    if d['listed']:
        fails.append(u'探针页居然在 ELYSIA_BDAYS 里 —— 表被谁改过了？')
    if d['egg'] or d['panel']:
        fails.append(u'这一页不在生日表里，却渲染出了 #bdayEgg / #bdayPanel')

    return (fails, u'没登记就整个不渲染' if not fails else u'不该出现')


@check
def check_bday_appears_when_listed(b, page, expected):
    """把这一页塞进表里再重挂 → 胶囊与面板出现，日期也对。

    ⚠ 这条同时是「`mount` 可以重复调用」的验证。不可重复调用的实现，
      这类断言只能靠猜 —— 而「重挂之后状态不对」是真实会发生的 bug
      （比如重挂时没清掉上一次的节点 → 页面上两个胶囊）。
    """
    _reset(b)
    d = b.jso("""(() => {
        var key = ElysiaBday.pageKey();
        var had = Object.prototype.hasOwnProperty.call(window.ELYSIA_BDAYS, key);
        var old = window.ELYSIA_BDAYS[key];
        window.ELYSIA_BDAYS[key] = [3, 30];        // 4 月 30 日
        ElysiaBday.mount();
        var date = document.querySelector('.bday-date');
        var out = {
            egg: !!document.getElementById('bdayEgg'),
            panel: !!document.getElementById('bdayPanel'),
            eggs: document.querySelectorAll('#bdayEgg').length,
            panels: document.querySelectorAll('#bdayPanel').length,
            date: date ? date.textContent : null,
        };
        // ⚠ **还原**，不是无脑 delete —— 这一页本来就在生日表里的话
        //   （mobius 就是），delete 会把它的真条目抹掉，
        //   后面几条断言就会跟着莫名其妙地红。这个坑当场踩到过。
        if (had) window.ELYSIA_BDAYS[key] = old;
        else delete window.ELYSIA_BDAYS[key];
        ElysiaBday.mount();      // 不传参 = 沿用上次的 opts 重画
        return JSON.stringify(out);
    })()""")
    if not d:
        return ([u'取不到生日组件状态'], u'—')

    fails = []
    if not d['egg'] or not d['panel']:
        fails.append(u'塞进生日表之后仍然没有 #bdayEgg / #bdayPanel —— 表变化没反映到界面')
    if d['eggs'] != 1 or d['panels'] != 1:
        fails.append(u'重挂之后有 %d 个胶囊 / %d 个面板，应该各 1 个 —— '
                     u'`mount` 重复调用时没清干净上一次的节点'
                     % (d['eggs'], d['panels']))
    if d['date'] != u'4月30日':
        fails.append(u'日期显示成 %r，应为「4月30日」（月份 0 起算错了吗）' % d['date'])

    return (fails, u'登记了就出现（且已还原）' if not fails else u'界面不对')


@check
def check_bday_countdown_text(b, page, expected):
    """倒计时数字**与「现在到下一个该日」一致** —— 三个分支逐个验。

    ⚠ **时钟必须钉死。** 倒计时吃日期，跨过零点结果就变；
      不钉的话这条断言在午夜前后会假红，而人只会以为是自己改坏了什么。
      （HANDOVER §6.4 记着同一件事：快照基线「随日历漂」骗过了一切当场自检。）

    三个分支：
      (a) 今天就是生日      → 「今天是她的生日！」
      (b) 生日在四天之后    → 天数与独立算出来的值一致
      (c) 生日在昨天        → 必须滚到**明年**（约 364~366 天），不是显示成负数
    """
    _reset(b)
    b.js(FROZEN_CLOCK)
    try:
        out = b.jso(BD_CASES)
        if not out or len(out) != 3:
            return ([u'三个分支没有全部跑到：%r' % out], u'—')
        by = dict((c['label'], c) for c in out)
        fails = []

        # (a) 今天就是生日 → 胶囊那句话 + **四格收起来**（首页就是这么做的）
        a = by.get('today', {})
        if a.get('text') != u'今天是她的生日！':
            fails.append(u'(a) 今天就是生日，胶囊却显示 %r' % a.get('text'))
        if not a.get('timerHidden'):
            fails.append(u'(a) 生日当天四格该收起（首页就是这个行为），却没有')

        # (b) 四天之后 → 胶囊的天数 + 四格**都要对**（别只验一行文案）
        c2 = by.get('plus4', {})
        want2 = u'距她的生日还有 %s 天' % c2.get('expect')
        if c2.get('text') != want2:
            fails.append(u'(b) 生日在四天后，胶囊显示 %r，独立算出来该是 %r（差 %r）'
                         % (c2.get('text'), want2,
                            u'—— 月份/日期是不是搞反了' if c2.get('text') else u''))
        if str(c2.get('D')) != str(c2.get('expect')):
            fails.append(u'(b) 四格里的「天」是 %r，胶囊却写着 %r —— 两处对不上'
                         % (c2.get('D'), c2.get('expect')))
        for k in (u'H', u'M', u'S'):
            v = c2.get(k)
            if not (isinstance(v, str) and len(v) == 2 and v.isdigit()):
                fails.append(u'(b) 四格里的 %s 是 %r —— 应该是两位补零的数字' % (k, v))

        # (c) 昨天 → 必须滚到明年，不是显示成负数
        c3 = by.get('yesterday', {})
        txt3 = c3.get('text') or u''
        m = re.search(r'(\d+)\s*天', txt3)
        if txt3 == u'今天是她的生日！':
            fails.append(u'(c) 生日是昨天，却显示「今天是她的生日！」')
        elif not m:
            fails.append(u'(c) 生日是昨天，显示 %r —— 不是「还有 N 天」的形态' % txt3)
        else:
            n = int(m.group(1))
            if n < 360 or n > 366:
                fails.append(u'(c) 生日是昨天，天数该滚到明年（约 364~366），实际 %d' % n)

        return (fails, u'三个分支都对（含四格）' if not fails else u'倒计时不对')
    finally:
        # ⚠ 一定要解冻：冻结时间会影响后面的断言（比如低语冷却一直不结束）
        b.js(UNFROZEN_CLOCK)


@check
def check_bday_table_sane(b, page, expected):
    """`data/bdays.js` 的每一项都要是**合法的 [月, 日]**。

    ⚠ 这类错最典型的是**月份忘了从 0 起**：写 `[11, 11]` 表示 11 月 11 日，
      于是变成 12 月 11 日 —— 页面照常显示、倒计时照常倒，
      只是**日子错了**。除了这种检查，没有别的办法发现。
    """
    d = b.jso("""(() => {
        var t = window.ELYSIA_BDAYS || {}, out = [];
        for (var k in t) {
            if (Object.prototype.hasOwnProperty.call(t, k)) out.push({ key: k, v: t[k] });
        }
        return JSON.stringify(out);
    })()""")
    if d is None:
        return ([u'取不到 window.ELYSIA_BDAYS'], u'—')

    fails = []
    if not d:
        fails.append(u'ELYSIA_BDAYS 是空的 —— data/bdays.js 没加载，或者表被清空了')

    for e in d:
        k, v = e['key'], e['v']
        if not isinstance(v, list) or len(v) != 2:
            fails.append(u'%s：值应该是 [月, 日] 两项，实际是 %r' % (k, v))
            continue
        mo, day = v
        if not (isinstance(mo, int) and 0 <= mo <= 11):
            fails.append(u'%s：月份 %r 不在 0..11（月份**从 0 起**，11 月要写 10）' % (k, mo))
        if not (isinstance(day, int) and 1 <= day <= 31):
            fails.append(u'%s：日 %r 不在 1..31' % (k, day))
        if k.startswith('/'):
            fails.append(u'%s：键不该以 / 开头 —— pageKey() 给的是'
                         u'「去掉开头斜杠」的形态，对不上就永远查不到' % k)
        if not k.endswith('.html'):
            fails.append(u'%s：键应是页面**文件路径**（以 .html 结尾）' % k)

    return (fails, u'%d 项都合法' % len(d) if not fails else u'表里有问题')


@check
def check_count_moved_into_bottom(b, page, expected):
    """探索度**搬进了下方区块**，而且不再是 body 的散装子节点。

    ⚠ 「搬家」要验两头：新的地方有它、旧的地方没有它。
      只验前者的话，一个「又建了一个新的」的实现能过 ——
      而那会让页面上出现**两个**探索度，且其中一个永远不更新。
    """
    d = b.jso("""(() => {
        var sec = document.getElementById('bottom');
        var inside = sec ? sec.querySelector('.bottom-count .explore-count') : null;
        var loose = document.querySelector('body > .explore-count');
        var all = document.querySelectorAll('.explore-count').length;
        return JSON.stringify({
            section: !!sec,
            inside: !!inside,
            loose: !!loose,
            all: all,
            text: inside ? inside.textContent : null,
            role: inside ? inside.getAttribute('role') : null,
            live: inside ? inside.getAttribute('aria-live') : null,
            slots: sec ? [].slice.call(sec.children).map(function (n) {
                return n.className;
            }) : [],
        });
    })()""")
    if d is None:
        return ([u'取不到下方区块状态'], u'—')

    fails = []
    if not d['section']:
        fails.append(u'没有 #bottom —— ElysiaBottom.mount 没跑？')
    if not d['inside']:
        fails.append(u'#bottom 里没有 .bottom-count .explore-count —— 探索度没搬进来')
    if d['loose']:
        fails.append(u'body 下面还挂着一个散装的 .explore-count —— 搬家只搬了一半')
    if d['all'] != 1:
        fails.append(u'页面上有 %d 个 .explore-count，应该只有 1 个（搬家用的是同一个节点）' % d['all'])
    if d['role'] != 'status' or d['live'] != 'polite':
        fails.append(u'搬过之后 role/aria-live 丢了：role=%r aria-live=%r'
                     % (d['role'], d['live']))
    if not d['text'] or not re.match(u'^已发现 \\d+ / \\d+$', d['text']):
        fails.append(u'搬过之后文案不对：%r' % d['text'])

    return (fails, u'探索度在区块里（%r）' % d['text'] if not fails else u'搬家有问题')


# ══ /mobius/ 内容规格（spec §6.1 / §6.2 / §8）══════════════════════════
# ⚠ 下面这张表**逐字抄自 spec §6.1 的表格**，而 spec 那张表又逐字抄自材料包。
#   它是「**台词一条不编**」这条纪律的落点：页面必须与它逐字一致，
#   而它自己由下面的 check_mobius_lines_from_material 对着材料包守。
#   ⚠ 需求方 2026-10-01 拍板「台词一律引原句」——
#     lab-02 / 06 / 07 / 12 都已换成材料包里的**全句**，别再改回截断版。
MOBIUS_FINDS = [
    ('lab-01', '#opening',   'click',      'spore',
     u'你好啊，会放电的小白鼠。我们又见面了。', u'蛇主的追忆·其一'),
    ('lab-02', '#about',     'hold',       'scale',
     u'既然得到了这副皮囊，那当然就要好好利用一下咯~虽然有些时候确实不如大人的身体方便……但有些事情，也只有这副小孩子的身体才能做到。', u'蛇主的追忆·其二'),
    ('lab-03', '#about',     'slide',      'glint',
     u'毕竟像律者这样珍稀的实验素材……用一个少一个嘛。', u'蛇主的追忆·其三'),
    ('lab-04', '#journey',   'hold',       'brick',
     u'这里的每一寸砖瓦，我都摸清楚了。比如你脚底下那块砖，它叫菲莉丝，喜欢喝蘑菇奶油汤哦。', u'关于自身·其一'),
    ('lab-05', '#journey',   'click',      'record',
     u'一场接一场的战斗、一次又一次的探索……哎，可爱的小白鼠，你还真是精力旺盛呢。', u'关于芽衣·其一'),
    ('lab-06', '#creations', 'triple_tap', 'shadow',
     u'我是做过一些事，但进化和变革，本就需要一些「损耗」。而之所以会变成你听说的样子……只是因为一些人明明愚蠢，却偏偏很有主见。', u'蛇主的追忆·其七'),
    ('lab-07', '#creations', 'drag',       'throne',
     u'世界蛇的王座……坐在上面的人是谁都可以。可以是我，可以是凯文，可以是梅，甚至可以是你，都没关系。因为无论这个人是谁，他一人的意志，都绝对无法改变这条巨蛇行进的轨迹。', u'关于自身·其四'),
    ('lab-08', '#quotes',    'click',      'shed',
     u'蛇本来就是不会屈服于死亡的生物，这很值得大惊小怪吗？', u'关于不死的秘密·其一'),
    ('lab-09', '#quotes',    'hold',       'infinity',
     u'死亡并不是生命的终点。生命将因死亡而得到进化，并由此重获新生。', u'给予刻印·其七'),
    ('lab-10', '#daily-sec', 'click',      'mouse',
     u'我可爱的小白鼠……就让我好好看看，你被她耍的团团转的样子吧~', u'关于自身·其六'),
    ('lab-11', '#bottom',    'click',      'sleeping',
     u'总觉得……最近总是很困呢。哎，我不会是要冬眠了吧？', u'季节语音'),
    ('lab-12', '#ending',    'slide',      'silhouette',
     u'大……大姐姐……这里好黑……好可怕啊……大姐姐，带我离开这里好不好？', u'蛇主之影'),
]

# spec §6.1 末尾的解锁句 + §8.1 / §8.2 两个改机制彩蛋的台词
MOBIUS_UNLOCK = (
    u'没错，从一开始这里就不存在什么「梅比乌斯」的记忆体。现在在你面前的，就是唯一的、真正的「梅比乌斯」。',
    u'关于自身·其三')
MOBIUS_EGG_B = u'你要是有什么想评判的，就等你知道了真相之后再说吧。不过在那之前别忘了，这条供你探寻的路，可是我为你铺起来的。'
MOBIUS_EGG_D = u'人类称呼自己能够理解的答案为「真相」，却称那无法理解的为「谬论」，说那人是「疯子」。至于你，你到最后会怎么看这一切？我可是很期待的哟，律·者·姐·姐。'

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MATERIAL_MD = os.path.join(os.path.dirname(ROOT_DIR), u'materials', u'梅比乌斯', u'text_materials.md')


def _theme_explore_strings():
    """从 `mobius/index.html` 源码里抠出 `THEME.explore` 块中**装台词的那些字段**。

    ⚠ 为什么是按**字段名**抠、而不是「所有中文串」或「所有 `「…」`」：
      · `unlock.title`（'记忆体的尽头'）是**站点 UI 文案**，不是她说的话 ——
        它本来就不该在材料包里。全扫会把它误报成「编造」。
      · 而台词里**有嵌套的「」**（`「损耗」`/`「真相」`/`律·者·姐·姐`），
        按引号配对去切会被切碎。
      所以只取 `line` / `src` / `text`（unlock 的正文）与 `whisper` 数组 ——
      这几个字段才是「台词必须有出处」这条纪律的射程。
    """
    src = io.open(os.path.join(ROOT_DIR, 'mobius', 'index.html'), encoding='utf-8').read()
    i = src.find('explore: {')
    if i < 0:
        return None
    j = src.index('{', i + len('explore:'))
    depth, k = 1, j + 1
    while k < len(src) and depth:
        if src[k] == '{':
            depth += 1
        elif src[k] == '}':
            depth -= 1
        k += 1
    block = src[j + 1:k - 1]

    out = re.findall(r"(?:line|src|text)\s*:\s*'([^'\n]*)'", block)
    w = re.search(r'whisper\s*:\s*\[(.*?)\]', block, re.S)
    if w:
        out += re.findall(r"'([^'\n]*)'", w.group(1))
    return out


@check
@mobius_only
def check_mobius_find_ids(b, page, expected):
    """① 12 个 `data-find-id` 与 spec §6.1 表格**逐字一致**（含顺序）。

    差一个、写错一个，「探索度」就永远差一个、解锁永远不触发 ——
    spec 的 Review Focus #3 说的「差一个的 bug 最难看见」。
    """
    got = b.jso("""(() => {
        var out = [];
        [].slice.call(document.querySelectorAll('.explore-find')).forEach(function (n) {
            out.push(n.getAttribute('data-find-id'));
        });
        return JSON.stringify(out);
    })()""")
    if got is None:
        return ([u'取不到 .explore-find 节点'], u'—')

    want = [f[0] for f in MOBIUS_FINDS]
    fails = []
    if sorted(got) != sorted(want):
        missing = [i for i in want if i not in got]
        extra = [i for i in got if i not in want]
        if missing:
            fails.append(u'少了这几个：%s' % u', '.join(missing))
        if extra:
            fails.append(u'多出这几个：%s' % u', '.join(extra))
        if not missing and not extra:
            fails.append(u'有重复的 id：%r' % got)
    # ⚠ 比的是**集合不是顺序**：DOM 里的先后由各锚点在页面上的先后决定
    #   （`#creations` 在 `#journey` 前面，所以 lab-06 会排在 lab-04 前），
    #   而 spec §6.1 那张表的编号是**内容清单**，不是 DOM 顺序要求。
    #   实测踩到过：一开始按顺序比，报了个根本不重要的「不一致」。
    return (fails, u'12 个 id 与 spec 逐字一致（集合）' if not fails else u'id 对不上')


@check
@mobius_only
def check_mobius_bubble_line_and_src(b, page, expected):
    """② 逐条触发，气泡里的台词与出处**都要对得上 spec**。

    ⚠ 这里不读 `window.THEME` —— mobius 的脚本是 IIFE 包裹的，
      `window.THEME` 是 **undefined**（Task 10 实测确认）。
      所以期望值来自本文件的表，实际值从**渲染出来的气泡**上读。
    """
    fails = []
    for fid, _at, _verb, _art, line, src in MOBIUS_FINDS:
        if not _trigger(b, fid):
            fails.append(u'%s：触发不了（锚点找不到？）' % fid)
            continue
        time.sleep(0.2)
        d = b.jso("""(() => {
            var el = document.querySelector('.explore-bubble');
            return JSON.stringify({ text: el ? el.textContent : null });
        })()""")
        text = (d or {}).get('text') or u''
        if line not in text:
            fails.append(u'%s：气泡里没有它该有的台词（实际 %r）' % (fid, text[:60]))
        elif src not in text:
            fails.append(u'%s：气泡里没有出处标注 %r（实际 %r）' % (fid, src, text[:60]))

    return (fails, u'12 条的台词与出处都渲染正确' if not fails else u'%d 条对不上' % len(fails))


@check
@mobius_only
def check_mobius_lines_from_material(b, page, expected):
    """③ `THEME.explore` 里出现的每一句中文，都能在材料包里**逐字**找到。

    这是「**台词一条不编**」这条纪律的机器化落点。
    ⚠ 只管**本轮新加的**内容（`THEME.explore` 那一块）——
      页面原有的台词池（`dailyPool` 等 19 条出处不明的句子）
      需求方 2026-10-01 明确「不用管」，不在这条的射程内。
    """
    if not os.path.exists(MATERIAL_MD):
        # ⚠ **不静默跳过**：材料包不在就没法验「有没有编造」，
        #   而「测不了」必须看得见 —— 静默跳过正是本站最怕的那种失败。
        return ([u'材料包不在，无法验证台词出处：%s' % MATERIAL_MD], u'跳过=没测')

    material = io.open(MATERIAL_MD, encoding='utf-8').read()
    strings = _theme_explore_strings()
    if strings is None:
        return ([u'在 mobius/index.html 里找不到 THEME.explore 块'], u'—')

    fails = []
    checked = 0
    for s in strings:
        if not re.search(u'[一-鿿]', s):     # 只要含中文的
            continue
        checked += 1
        # 台词在页面上带「」，材料包里也带「」—— 两边都剥掉再比
        core = s.strip().strip(u'「」')
        if core and core not in material:
            fails.append(u'材料包里找不到这一句：%r' % s[:70])

    if checked == 0:
        fails.append(u'THEME.explore 里一句中文都没有 —— 是不是没写进去？')

    return (fails, u'%d 句全部有出处' % checked if not fails else u'有 %d 句对不上' % len(fails))


@check
@mobius_only
def check_mobius_has_bday_widget(b, page, expected):
    """④ mobius 在 `data/bdays.js` 里，所以生日胶囊该渲染出来。

    ⚠ 2026-10-01 改：从「下方区块里的一行字」换成**首页那个右下角悬浮组件**
      （需求方要求「和首页形式一样」）。所以判据从 `.bottom-bday` 变成 `#bdayEgg`，
      同时**反过来**要求 `.bottom-bday` **不存在** —— 两个倒计时是最坏的情况，
      而且它自己写死 BM/BD，等于第二处数据源。
    """
    d = _bday_widget(b)
    if d is None:
        return ([u'取不到生日组件状态'], u'—')

    fails = []
    if not d['listed']:
        fails.append(u'mobius 不在 ELYSIA_BDAYS 里 —— data/bdays.js 少了它？')
    if not d['egg'] or not d['panel']:
        fails.append(u'没有 #bdayEgg / #bdayPanel —— mobius 在 bdays.js 里（[3,30]），该渲染的')
    if d['eggs'] != 1 or d['panels'] != 1:
        fails.append(u'页面上有 %d 个胶囊 / %d 个面板，应该各 1 个'
                     % (d['eggs'], d['panels']))
    if d['inBottom']:
        fails.append(u'下方区块里还有 .bottom-bday —— 两个倒计时，'
                     u'而它自己写死了 BM/BD，是第二处数据源（HANDOVER §10.5 那条教训）')

    date = b.js("(() => { var e = document.querySelector('.bday-date');"
                " return e ? e.textContent : null; })()")
    if date != u'4月30日':
        fails.append(u'面板里的日期是 %r，应为「4月30日」' % date)

    # 台词与出处：本项目「有台词就必须有出处」，所以面板上要能看到出处
    src = b.js("(() => { var e = document.getElementById('bdaySrc');"
               " return e ? e.textContent : null; })()")
    if not src or u'生日语音' not in src:
        fails.append(u'面板里没有出处标注（#bdaySrc）：%r' % src)

    return (fails, u'悬浮胶囊在该在的地方' if not fails else u'生日组件不对')


@check
@mobius_only
def check_mobius_bday_panel_toggles(b, page, expected):
    """点胶囊开面板，再点一下关掉 —— **走真实鼠标路径**。

    ⚠ 要验两头：开了能开、关了能关。只验「点了会开」的话，
      一个「只会开不会关」的实现照样能过。
    """
    _reset(b)
    # ⚠ 不能用 `b.center()` —— 那是按 `[data-find-id]` 找的，胶囊不是可发现物。
    p = b.jso("""(() => {
        var e = document.getElementById('bdayEgg');
        if (!e) return null;
        e.scrollIntoView({ block: 'center', behavior: 'instant' });
        var r = e.getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()""")
    if not p:
        return ([u'页面上没有 #bdayEgg'], u'—')

    def panel_open():
        return b.js("String(document.getElementById('bdayPanel')"
                    ".classList.contains('open'))")

    fails = []
    before = panel_open()
    if before == 'true':
        fails.append(u'一开始面板就是开着的 —— 那这条断言测不出「点开」')

    b.press(p['x'], p['y']); time.sleep(0.06); b.release(p['x'], p['y'])
    time.sleep(0.3)
    if panel_open() != 'true':
        fails.append(u'点了胶囊，面板没开')

    b.press(p['x'], p['y']); time.sleep(0.06); b.release(p['x'], p['y'])
    time.sleep(0.3)
    if panel_open() == 'true':
        fails.append(u'再点一下，面板没关 —— 只会开不会关')

    return (fails, u'点开又点关' if not fails else u'开合不对')


@check
@mobius_only
def check_mobius_bday_ticks(b, page, expected):
    """秒针**真的在走** —— 1 秒刷一次的定时器是活的。

    ⚠ 这条最容易写成恒真式（「读两次都在变」但两次读的其实是同一帧）。
      所以判据是**间隔约 1.1 秒读两次 `#bdS`，两次必须不同**；
      并且交付时**必须证明它抓得到「不走」**——办法是把时钟钉死：
      时间不动 → `render()` 每次算出的秒数一样 → 这条断言必须报红。
      （`FROZEN_CLOCK` 那套就在本文件里，现成的。）
    """
    _reset(b)
    if b.js("String(!!document.getElementById('bdS'))") != 'true':
        return ([u'面板里没有 #bdS —— 四格没渲染出来'], u'—')

    a = b.js("document.getElementById('bdS').textContent")
    time.sleep(1.1)
    c = b.js("document.getElementById('bdS').textContent")
    if a is None or c is None:
        return ([u'读不到 #bdS'], u'—')
    if a == c:
        return ([u'隔了 1.1 秒，#bdS 还是 %r —— 每秒刷新的定时器没在跑' % a], u'秒针不走')
    return ([], u'秒针在走（%s -> %s）' % (a, c))


@check
def check_bday_auto_opens_on_the_day(b, page, expected):
    """生日当天，面板进来 1.5 秒**自己摊开** —— 而且 `aria-hidden` 要跟着改。

    ⚠ 这条是 2026-10-01 交付时**明确没验到**的那条：那个 `setTimeout` 只有在
      「今天就是生日」时才挂上，平时根本跑不到（要等 11 月 11 日）。
      **「只有一年一次的路径」是最容易烂掉的地方**，所以在这里把时钟拨过去验。

    ⚠ 顺带守一处 a11y 瑕疵：首页原来那里只 `classList.add('open')`、
      **没同步 `aria-hidden`** —— 面板视觉上开着，屏幕阅读器却以为它还藏着。
      快照**测不出属性**（它只采计算样式），所以这种问题只能靠断言守。

    做法：钉死时钟 → 把「今天」当成生日写进表里 → 拆掉旧节点重挂 → 等 1.9 秒 → 查。
    """
    _reset(b)
    b.js(FROZEN_CLOCK)
    try:
        if b.js("String(typeof window.ElysiaBday)") != 'object':
            return ([u'本页没有加载 bday.js'], u'—')

        # ⚠ 先拆掉上一份再重挂 —— 不依赖 mount 是否幂等（那是另一个实现细节，
        #   不该让这条断言绑在它上面）。
        b.js("""(() => {
            var now = new Date();
            window.ELYSIA_BDAYS[ElysiaBday.pageKey()] = [now.getMonth(), now.getDate()];
            var e = document.getElementById('bdayEgg'); if (e) e.remove();
            var p = document.getElementById('bdayPanel'); if (p) p.remove();
            ElysiaBday.mount({});
            return 1;
        })()""")
        time.sleep(1.9)      # 组件等 1.5 秒，留 0.4 秒余量

        d = b.jso("""(() => {
            var p = document.getElementById('bdayPanel');
            var t = document.getElementById('bdayEggText');
            return JSON.stringify({
                exists: !!p,
                open: !!p && p.classList.contains('open'),
                aria: p ? p.getAttribute('aria-hidden') : null,
                text: t ? t.textContent : null,
            });
        })()""")
        if d is None:
            return ([u'取不到面板状态'], u'—')

        fails = []
        if not d['exists']:
            fails.append(u'把今天设成生日之后，面板却没渲染出来')
            return (fails, u'没渲染')
        if d['text'] != u'今天是她的生日！':
            fails.append(u'生日当天胶囊该显示「今天是她的生日！」，实际是 %r' % d['text'])
        if not d['open']:
            fails.append(u'等了 1.9 秒，面板**没有**自己摊开 —— '
                         u'那个 1.5 秒的 setTimeout 没挂上或没跑')
        elif d['aria'] != 'false':
            fails.append(u'面板视觉上开着，但 aria-hidden 是 %r —— '
                         u'屏幕阅读器会以为它还藏着（属 a11y 谎话）' % d['aria'])

        return (fails, u'生日当天自动摊开且 aria 同步' if not fails else u'自动摊开有问题')
    finally:
        b.js(UNFROZEN_CLOCK)


@check
@mobius_only
def check_mobius_has_game_slot(b, page, expected):
    """⑤ 传了 `THEME.game`，游戏槽就该渲染出来（Task 12 往里面放贪吃蛇）。"""
    d = b.jso("""(() => {
        var g = document.querySelector('.bottom-game');
        var sec = document.getElementById('bottom');
        return JSON.stringify({ slot: !!g, inSection: !!(g && sec && sec.contains(g)) });
    })()""")
    if d is None:
        return ([u'取不到下方区块状态'], u'—')

    fails = []
    if not d['slot']:
        fails.append(u'没有 .bottom-game —— THEME.game 传了吗？ElysiaBottom.mount 调了吗？')
    elif not d['inSection']:
        fails.append(u'.bottom-game 不在 #bottom 里')
    return (fails, u'游戏槽在' if not fails else u'游戏槽不对')


@check
@mobius_only
def check_mobius_egg_b_drag_name(b, page, expected):
    """⑥ 改机制后的 B：**拖走她的名字**（spec §8.1）。

    ⚠ **必须走真实鼠标路径** —— 这些页的脚本是 IIFE 包裹的，
      内部函数不是全局的（HANDOVER §10.6 Task 9 踩过：
      `typeof fireKevinKiller666 === 'function'` 得到 `undefined`）。
    """
    c = b.center_of('#profileName')
    if not c:
        return ([u'找不到 #profileName'], u'—')

    # 拖之前先把 toast 清掉，免得读到上一条留下的内容
    b.js("(() => { var t = document.getElementById('mbToast');"
         " if (t) { t.textContent = ''; t.classList.remove('show'); } return 1; })()")

    b.press(c['x'], c['y'])
    for i in range(1, 6):
        b.move(c['x'] + i * 14, c['y'] + i * 2)
        time.sleep(0.02)
    b.release(c['x'] + 70, c['y'] + 10)
    time.sleep(0.6)

    d = b.jso("""(() => {
        var t = document.getElementById('mbToast');
        return JSON.stringify({ text: t ? t.textContent : null });
    })()""")
    text = (d or {}).get('text') or u''
    fails = []
    if MOBIUS_EGG_B not in text:
        fails.append(u'拖了名字之后没有说那句话（#mbToast 实际是 %r）' % text[:70])
    return (fails, u'拖名字触发了台词' if not fails else u'B 没触发')


@check
@mobius_only
def check_mobius_egg_d_scroll_back(b, page, expected):
    """⑦ 改机制后的 D：**在结尾往回滚**（spec §8.2）。

    「到达即触发」别人用过（aponia / eden / kevin 是往下滚到结尾）；
    这个是**从结尾往回滚**才触发 —— 方向相反、而且是「离开才触发」。
    """
    # ⚠ **先重载**。不重载的话，前面那些断言（尤其逐条触发 12 个可发现物）
    #   早就把页面从下往上滚过好几轮了 —— `farewellShown` 已经翻成 true，
    #   这条断言会变成「恒真」，测不出任何东西。实测踩到过。
    _reload(b)

    # 先走到结尾停住。
    # ⚠ **不能用 `scrollTo(document.body.scrollHeight)`** —— 下方区块现在是页面
    #   最后一块，直接跳到最底时 `#ending` 可能已经不足 50% 可见，
    #   观察器根本不会报 intersecting，「到达过结尾」这个前提就假了。
    #   真实的用户是一路滚下来经过结尾的，所以这里滚到结尾本身。
    b.js("(() => { document.getElementById('ending')"
         ".scrollIntoView({ block: 'center', behavior: 'instant' }); return 1; })()")
    time.sleep(1.2)
    before = b.js("String(document.getElementById('endingSub')"
                  " ? document.getElementById('endingSub').classList.contains('visible') : null)")
    if before == 'true':
        return ([u'刚到结尾时临别句就已经显示了 —— 那就不是「往回滚才触发」了'], u'触发时机不对')

    # 再往回滚
    b.js("(() => { window.scrollBy({ top: -260, behavior: 'instant' }); return 1; })()")
    time.sleep(1.0)

    d = b.jso("""(() => {
        var s = document.getElementById('endingSub');
        return JSON.stringify({
            exists: !!s,
            visible: !!s && s.classList.contains('visible'),
            text: s ? s.textContent : null,
        });
    })()""")
    if not d:
        return ([u'取不到 #endingSub'], u'—')

    fails = []
    if not d['exists']:
        fails.append(u'页面里没有 #endingSub')
    elif not d['visible']:
        fails.append(u'从结尾往回滚了 260px，临别句仍然没浮出来')
    elif MOBIUS_EGG_D not in (d['text'] or u''):
        fails.append(u'临别句的内容不对：%r' % (d['text'] or u'')[:70])

    return (fails, u'往回滚触发了临别句' if not fails else u'D 没触发')


#
#     ⚠ 通用那三条**跑在 mobius 身上时翻出了两个真问题**（2026-10-02 实测）：
#       · **横屏放不下**：640×360 下画布 y=-34、dpad 一直伸到 369 —— 上下都被切，
#         而 fixed 遮罩没有滚动条，切掉的够不着（它的内容总高 ~718px，横屏只有 360）
#       · **退出键离画布只有 58px**（离 dpad 是 502px ✓）—— 它那页的画布是**滑动面**，
#         玩家在上面拖而不是点，风险比连点低，但 58px 仍然偏紧
#     两条都记进了 HANDOVER §5.2 **另开一轮修**（要动它的遮罩布局，属那一页自己的事）。
GAMES = {
    'mobius/index.html':  {'overlay': 'gameOverlay', 'canvas': '#snakeCanvas',
                           'close': '#gameClose', 'play': '#dpad', 'guard': False},
    'sakura/index.html':  {'overlay': 'sakuraGameOverlay', 'canvas': '.sk-canvas',
                           'close': '.sk-close', 'play': None, 'guard': True},
    'kosma/index.html':   {'overlay': 'kosmaGameOverlay', 'canvas': '.km-canvas',
                           'close': '.km-close', 'play': None, 'guard': True},
    # ⚠ 格蕾修「上色」是**拖动型**、且**没有独立操作区**（玩家就在画布上拖）——
    #   与 sakura/kosma 的「在画布上点/按」不同类。`play: None` 只管「有没有独立操作区」，
    #   它**分不出**画布是「点触面」还是「拖动面」；所以这里显式加 `swipe: True`，
    #   把画布按**滑动面**（`CLOSE_SWIPE_MIN=50`）量，而不是点触面（`CLOSE_FAR_MIN=100`）。
    #   理由：本作手指落点是**有意的拖**、起点必在画布上，风险比连点低（照 §Review Focus 3）。
    #   ⚠ 不写成 play 的某个值来「凑」：play 一旦为真，`check_game_fits_mobile` 会把
    #     画布再当成一个「操作区」按 100 量（见下面那条 `checks`），反而更严。
    'griseo/index.html':  {'overlay': 'griseoGameOverlay', 'canvas': '.gr-canvas',
                           'close': '.gr-close', 'play': None, 'guard': True, 'swipe': True},
}
GAME_PAGES = tuple(sorted(GAMES.keys()))

CLOSE_FAR_MIN = 100        # 退出键到**连点**处的最小间距（px）
CLOSE_SWIPE_MIN = 50       # 退出键到**滑动面**的最小间距（px）—— 手指落点偏移的量级


def game_pages(fn):
    """收窄成「只对这些带小游戏的页成立」。"""
    fn.pages = GAME_PAGES
    return fn


def _g_sig(b, cfg):
    """画布画面的签名 —— 游戏状态取不到（脚本是 IIFE），只能看画面本身。"""
    return b.js("(() => { var c = document.querySelector('%s');"
                " return c ? c.toDataURL() : null; })()" % cfg['canvas'])


def _g_open(b, cfg):
    v = b.js("(() => { var o = document.getElementById('%s');"
             " return o ? o.classList.contains('on') : null; })()" % cfg['overlay'])
    return v == 'true' or v is True


def _g_state(b, cfg):
    """遮罩开合 **和** `aria-hidden`（两个都要读）。

    ⚠ 漏了 `aria-hidden` 就会漏掉 HANDOVER §10.9 六 那个坑：面板「视觉上开着、
      屏幕阅读器却以为它藏着」，只因代码只 `classList.add('on')`。快照**测不出属性**。
    """
    return b.jso("""(() => {
        var o = document.getElementById('%s');
        if (!o) return JSON.stringify({ missing: true });
        return JSON.stringify({ open: o.classList.contains('on'),
                                aria: o.getAttribute('aria-hidden') });
    })()""" % cfg['overlay'])


def _g_rect(b, sel):
    return b.jso("""(() => {
        var n = document.querySelector('%s');
        if (!n) return null;
        var r = n.getBoundingClientRect();
        return JSON.stringify({ l: r.left, t: r.top, r: r.right, b: r.bottom,
                                w: r.width, h: r.height, vw: innerWidth, vh: innerHeight });
    })()""" % sel)


def _g_canvas_aspect(b, sel):
    """画布的**内容盒**尺寸 + **固有**像素尺寸 —— 判「有没有被拉扁」用。

    ⚠ 用 `clientWidth/clientHeight`（内容盒，**不含 border**）而不是 bounding rect：
      这几页的画布都带 1px border，bounding rect 会把 border 算进比例、偏掉约 0.3%，
      逼出一个「容差得放到 2px 才过」的假宽松。内容盒是干净的（四页都适用）。
    """
    return b.jso("""(() => {
        var n = document.querySelector('%s');
        if (!n) return null;
        return JSON.stringify({ w: n.clientWidth, h: n.clientHeight,
                                iw: n.width, ih: n.height });
    })()""" % sel)


def _g_gap(a, c):
    """两个矩形的最小间距（>0 = 真的分开了）。"""
    if not a or not c:
        return None
    return max(max(a['l'] - c['r'], c['l'] - a['r']), max(a['t'] - c['b'], c['t'] - a['b']))


def _g_probe(b, cfg):
    """「开始」→ 遮罩打开（含 aria）→ 画面在动；再关掉 → 静止。

    ⚠ 后半段（关掉之后必须静止）不是多余的 —— 没有它，「两次采样不同」有可能
      只是 canvas 的 dataURL 编码本身不稳定，那这条断言就是恒真式。
      前几轮反复出现的正是这一类问题。
    """
    fails = []
    st = _g_state(b, cfg) or {}
    if st.get('missing'):
        fails.append(u'页面里没有 #%s —— 模块的 mount(host) 没建出来？' % cfg['overlay'])
    else:
        if st.get('open'):
            fails.append(u'还没点，遮罩就是打开的')
        if st.get('aria') != 'true':
            fails.append(u'遮罩关着，`aria-hidden` 却是 %r —— 该是 "true"' % st.get('aria'))

    if not _click_sel(b, '.bottom-game .game-card-start'):
        return ([u'找不到游戏卡上的「开始」按钮 —— 模块的 mount(host) 没跑？'], u'—')

    st = _g_state(b, cfg) or {}
    if not st.get('open'):
        fails.append(u'点了「开始」，遮罩却没有打开')
    if st.get('aria') != 'false':
        fails.append(u'遮罩开了，`aria-hidden` 却是 %r —— 面板视觉上开着、'
                     u'屏幕阅读器却以为它藏着（HANDOVER §10.9 六 那个坑）' % st.get('aria'))

    # ⚠ **采三次，不是两次。** 2026-10-02 实测：两采样的判据**挡不住
    #   「只画了那一帧」** —— 点「开始」时那一帧总会被画出来，于是 s1≠s2 就成立了，
    #   而一个「循环不再排下一帧」的实现照样绿（变异测试 M1 就这么漏过去的）。
    #   三次采样要求**至少有一对相邻不同**，才真的说明它在持续动。
    s1 = _g_sig(b, cfg)
    time.sleep(0.45)
    s2 = _g_sig(b, cfg)
    time.sleep(0.45)
    s3 = _g_sig(b, cfg)
    if s1 is None or s2 is None or s3 is None:
        fails.append(u'取不到画布（%s）' % cfg['canvas'])
    elif s2 == s3:
        # ⚠ 判据盯的是**稳态**：**最后两次必须不同**。
        #   2026-10-02 实测（连撞两次）：
        #   ① 两采样（s1/s2）挡不住「只画一帧」—— 开始那一帧总会被画出来；
        #   ② 改成「三次全等才算没动」**还是挡不住** —— 调试打出来是
        #      `siglen 7174/9546/9546`：第一帧落在 s1 与 s2 之间（headless 下首帧
        #      合成偏慢），于是 s1≠s2 又把它放过去了。
        #   **只有「s2 与 s3 相同」才真的说明它停着不动。**
        fails.append(u'开始之后**后两次采样一模一样**（%s）—— 画面没在动；'
                     u'只画一帧的实现也会在这里露馅' % len(s3 or ''))

    # ── 证伪那半段：关掉之后画面必须静止 ──
    if not _click_sel(b, cfg['close']):
        fails.append(u'找不到遮罩上的退出键（%s）' % cfg['close'])
        return (fails, u'（没能做反向验证）')

    st = _g_state(b, cfg) or {}
    if st.get('open'):
        fails.append(u'点了退出键，遮罩却没关')
    if st.get('aria') != 'true':
        fails.append(u'遮罩关了，`aria-hidden` 却是 %r' % st.get('aria'))

    c1 = _g_sig(b, cfg)
    time.sleep(0.45)
    c2 = _g_sig(b, cfg)
    if c1 is not None and c2 is not None and c1 != c2:
        fails.append(u'关掉之后画面**还在变** —— 说明上面那个判据是恒真式，测了等于没测')

    return (fails, u'开局在动、关掉静止（判据有牙齿）' if not fails else u'游戏没跑起来')


@check
@game_pages
def check_game_runs(b, page, expected):
    """① 「开始」→ 遮罩打开（含 `aria-hidden` 同步）→ 画面在动；关掉 → 静止。"""
    _reset(b)
    return _g_probe(b, GAMES[page])


@check_reduced
@game_pages
def check_game_runs_under_reduced(b, page, expected):
    """② 减动偏好下小游戏**照常能玩**（Review Focus #5）。

    ⚠ 游戏内部的动画由「开始」**显式触发**，不属「自动播放的装饰动效」——
      有人在减动段里一刀切 `animation:none` / 停掉 rAF 时，这一条会红。
      （判据与 ① 同一套，含「关掉之后必须静止」那半段。）
    """
    _set_motion(b, 'reduce')
    _reset(b)
    fails, summary = _g_probe(b, GAMES[page])
    _set_motion(b, 'reduce')      # 收尾：把模式留给后面的减动断言
    return (fails, summary)


@check
@game_pages
def check_game_fits_mobile(b, page, expected):
    """③ 手机上**玩得起来**：关键元素放得下 + 画布不拉扁 + 真触摸能开局。

    ⚠ 为什么量「关键元素」而不是「面板」：mobius 那页的遮罩里**根本没有面板这一层**
      （画布 / 方向键 / 按钮直接挂在遮罩上）。量 画布 + 操作区 + 退出键 这三样，
      三页都说得通，而且在手机上是**最容易出事**的三样。

    ⚠ **开局那一步故意放在 320 宽**：那一档 `visualViewport.offsetTop` 是 **63px**，
      比按钮本身（41px）还高 —— 不换算坐标就**一定**点偏。375 那一档只有个位数，
      算错了也照样点得中，**验不出东西**（见 §6.4 那条坐标偏移）。
    """
    cfg = GAMES[page]
    play_sel = cfg['play'] or cfg['canvas']
    fails = []

    b._send('Emulation.setDeviceMetricsOverride',
            {'width': 320, 'height': 568, 'deviceScaleFactor': 1, 'mobile': True})
    b._send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
    time.sleep(0.6)
    try:
        _reset(b)
        if not _touch_tap_sel(b, '.bottom-game .game-card-start'):
            return ([u'用触摸点不到游戏卡上的「开始」按钮'], u'—')
        time.sleep(0.5)
        if not _g_open(b, cfg):
            return ([u'用触摸点了「开始」，遮罩却没打开 —— 手机上玩不了'], u'—')

        # ── 关键元素放得下 + 画布不拉扁（四个视口）──
        for (w, h) in ((375, 812), (360, 640), (320, 568), (640, 360)):
            b._send('Emulation.setDeviceMetricsOverride',
                    {'width': w, 'height': h, 'deviceScaleFactor': 1, 'mobile': True})
            time.sleep(0.55)
            cv = _g_rect(b, cfg['canvas'])
            if not cv:
                fails.append(u'[%d] 找不到画布（%s）' % (w, cfg['canvas']))
                continue
            for label, sel in ((u'画布', cfg['canvas']), (u'操作区', play_sel), (u'退出键', cfg['close'])):
                r = _g_rect(b, sel)
                if not r:
                    fails.append(u'[%d] 找不到%s（%s）' % (w, label, sel))
                elif r['l'] < -0.5 or r['r'] > r['vw'] + 0.5 or r['t'] < -0.5 or r['b'] > r['vh'] + 0.5:
                    fails.append(u'[%d] %s 超出视口：x %d~%d / y %d~%d，视口 %dx%d —— '
                                 u'会被切掉，而 fixed 遮罩没有滚动条，切掉的够不着'
                                 % (w, label, round(r['l']), round(r['r']), round(r['t']),
                                    round(r['b']), r['vw'], r['vh']))
            # ⚠ 画布**不许被拉扁**：渲染出来的**长宽比**必须 == 它的**固有长宽比**。
            #   原来是硬断言「画布是方的」（`abs(w-h)<=1`）—— 那只对正方形画布成立，
            #   而格蕾修是 48×32（3:2）⇒ **泛化成比例判据**。
            #   ⚠ **只许泛化、不许削弱**：want==1（方画布）时本式退化成 `abs(h-w)<=1`，
            #     与原来**逐字等价** —— mobius/sakura/kosma 三页的判据分毫未变。
            asp = _g_canvas_aspect(b, cfg['canvas'])
            if asp and asp['w'] > 0 and asp['h'] > 0 and asp['iw'] > 0 and asp['ih'] > 0:
                exp_h = asp['w'] * asp['ih'] / asp['iw']
                if abs(asp['h'] - exp_h) > 1.0:
                    fails.append(u'[%d] 画布被拉扁了：内容盒 %d × %d，固有 %d × %d'
                                 u'（该等比缩成 %.1f 高）'
                                 % (w, asp['w'], asp['h'], asp['iw'], asp['ih'], exp_h))
            else:
                # ⚠ M6 修：探针取不到尺寸时**不许静默跳过**（那等于「测了等于没测」）
                fails.append(u'[%d] 取不到画布 %s 的尺寸（探针返回 %r）—— 没法判「有没有被拉扁」'
                             % (w, cfg['canvas'], asp))
            _g_open(b, cfg) or fails.append(u'[%d] 缩放之后遮罩被关掉了' % w)

        return (fails, u'手机上放得下 + 摸得到（320 开局 / 四个视口）' if not fails
                else u'手机上有问题')
    finally:
        b._send('Emulation.setTouchEmulationEnabled', {'enabled': False})
        b._send('Emulation.clearDeviceMetricsOverride')
        time.sleep(0.6)


@check
@game_pages
def check_game_close_far_from_play(b, page, expected):
    """④ 退出键离**操作区**够远，而且（有保护期的页）刚打开那一下不许关。

    ⚠ 2026-10-02 需求方报的真 bug：「点一下就退出去了」。实测：能关掉它的
      **只有退出键和 Escape**，而樱那页的「收刀」就在**画布正下方 55px** ——
      反应类游戏里手指落低一点就误触（画布底 +55~+100px 那一段点下去**必退**）。
      mobius 更紧：它的「逃离实验室」在 **`#dpad` 正下方 18px**（约 1.2 毫米）。
      两页都已挪到**整个遮罩的右上角**。

    判据：① 到**最近的**操作区 ≥ 100px
          ② 在**它原来那个位置**（操作区正下方 24px）点一下 → **不许关**
          ③ 有保护期的页：刚打开就点它 → 不许关；过了保护期 → 要能关
    """
    cfg = GAMES[page]
    play_sel = cfg['play'] or cfg['canvas']
    fails = []

    b._send('Emulation.setDeviceMetricsOverride',
            {'width': 375, 'height': 812, 'deviceScaleFactor': 1, 'mobile': True})
    b._send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
    time.sleep(0.6)
    try:
        _reset(b)
        if not _touch_tap_sel(b, '.bottom-game .game-card-start'):
            return ([u'用触摸点不到游戏卡上的「开始」按钮'], u'—')
        time.sleep(0.5)

        cl = _g_rect(b, cfg['close'])
        cv = _g_rect(b, cfg['canvas'])
        pl = _g_rect(b, play_sel)
        if not cl or not cv:
            return ([u'找不到退出键（%s）或画布（%s）' % (cfg['close'], cfg['canvas'])], u'—')

        # ⚠ **「点它」和「在它上面拖」是两回事**，间距要求也不同：
        #   · 玩家**连点**的地方（tap 目标）→ CLOSE_FAR_MIN（100px）：手指落低一点就误触
        #   · 玩家**在它上面拖动**的地方（swipe 面）→ CLOSE_SWIPE_MIN（50px）：
        #     滑动是**有意的拖**、起点必在面上，风险比连点低；50 是手指落点偏移的量级
        #     ⚠ 为什么必须分开：mobius 那页的画布是**滑动面**，而它的内容占了竖屏的绝大部分
        #       （524 / 568）—— **矮屏上「离画布 100px」几何上做不到**（实测余量只有 44px）。
        #       而它真正被连点的是 `#dpad`，那个量到 502px ✓。
        # ⚠ 画布这一面按**什么**量：拖动面（swipe）→ 50 / 点触面（tap）→ 100。
        #   口径：`cfg` 里**显式**给了 `swipe` 就用它（新页应当显式给）；
        #   否则沿用旧代理 —— 有独立操作区（play）的页，画布不是玩家的落点 ⇒ 滑动面(50)；
        #   没有独立操作区的页，画布**就是**玩家的落点 ⇒ 按点触面(100)。
        #   （mobius/sakura/kosma 三页都没有 `swipe` ⇒ 走的仍是旧代理，**行为一字未变**。）
        if 'swipe' in cfg:
            cv_need = CLOSE_SWIPE_MIN if cfg['swipe'] else CLOSE_FAR_MIN
        else:
            cv_need = CLOSE_SWIPE_MIN if cfg['play'] else CLOSE_FAR_MIN
        checks = [(u'画布', cv, cv_need)]
        if cfg['play'] and pl and pl['h'] > 1:
            # ⚠ 只在操作区**真的显示着**时算进来（mobius 的 dpad 只在粗指针 / 触摸
            #   环境下出现，靠触摸模拟才会显示）。
            checks.append((u'操作区', pl, CLOSE_FAR_MIN))

        worst_label, worst_gap, worst_min = None, None, None
        for label, rect, need in checks:
            g = _g_gap(rect, cl)
            if g is None:
                continue
            if worst_min is None or (need - g) > (worst_min - worst_gap):
                worst_label, worst_gap, worst_min = label, g, need
        near_label, near = worst_label, worst_gap
        if worst_min is not None and near < worst_min:
            fails.append(u'① 退出键离%s只有 **%dpx**（要求 ≥ %d）—— 反应类游戏里'
                         u'手指落低一点就误触退出' % (near_label, near, worst_min))

        # ② 在操作区**正下方 24px**（原来那个退出键的位置）点一下 → 不许关
        base = (pl if (cfg['play'] and pl and pl['h'] > 1) else cv)
        _touch_pt(b, base['r'] - 30, base['b'] + 24)
        time.sleep(0.45)
        if not _g_open(b, cfg):
            fails.append(u'② 在%s正下方 24px 点了一下，游戏就退出了 —— '
                         u'这正是「正下方就是退出键」那个 bug' % near_label)

        # ③ 保护期（只有带这道保险的页才查）
        if cfg['guard']:
            if _g_open(b, cfg):
                _touch_tap_at(b, cfg['close'])      # 正常关掉（早就过了保护期）
                time.sleep(0.45)
            if not _touch_tap_sel(b, '.bottom-game .game-card-start'):
                fails.append(u'③ 重开时点不到「开始」按钮')
            else:
                # ⚠ **这里不能 sleep** —— 此刻离打开才一百多毫秒，必须落在保护期内
                _touch_tap_at(b, cfg['close'])
                time.sleep(0.35)
                if not _g_open(b, cfg):
                    fails.append(u'③ 刚打开就点退出键，游戏当场关了 —— '
                                 u'400ms 的保护期没生效')
                else:
                    time.sleep(0.6)
                    _touch_tap_at(b, cfg['close'])
                    time.sleep(0.35)
                    if _g_open(b, cfg):
                        fails.append(u'③ 过了保护期，退出键还是关不掉 —— 那就没法退出了')

        return (fails, u'退出键离%s %dpx、原位不禁触%s'
                % (near_label, near, u'、保护期有效' if cfg['guard'] else '')
                if not fails else u'退出键还是贴着操作区')
    finally:
        b._send('Emulation.setTouchEmulationEnabled', {'enabled': False})
        b._send('Emulation.clearDeviceMetricsOverride')
        time.sleep(0.6)


KOSMA = 'kosma/index.html'


def kosma_only(fn):
    """收窄成「只对 /kosma/ 成立」—— 查的是他那一页的内容规格。"""
    fn.pages = (KOSMA,)
    return fn


KOSMA_HUD = """(() => {
    var o = document.getElementById('kosmaGameOverlay');
    var q = function (s) { var n = o && o.querySelector(s); return n ? n.textContent : null; };
    return JSON.stringify({ on: o ? o.classList.contains('on') : null,
                            kept: q('.km-kept'), run: q('.km-run'),
                            best: q('.km-best'), wind: q('.km-wind'),
                            msg: q('.km-msg') });
})()"""


@check
@kosma_only
def check_kosma_judgment(b, page, expected):
    """⑤ 「守灯」的判定真的生效 —— **三半都要验**（玩法专属，不通用）。

    ① **按住把框托着扫过整根柱子** → 「守住」**必须变多**。
       ⚠ 这一半的可信度来自**扫过的必然性**：框会从柱底一路升到柱顶，
         中途**一定会**经过光点 —— 所以它不依赖任何时机运气，是可证伪的。
    ② **按住把框顶在头上不动** → 光点必然有大段时间在框外 → **「风」必须涨过 0**。
       ⚠ 原来写的是「等『灯灭了』出现（最多 12 秒）」，**偶发** —— 光点赖在框里十几秒
         这一局就不结束，于是假红。**偶发的断言比没有断言更坏**（它会教人忽略红灯）。
         改成看 HUD 上的「风」：可证伪，且不赌时机。
    ③ **等这一局结束**（最多 35 秒）之后，HUD 上的**「最佳」要跟得上「守住」**。
       ⚠ 必须等结算 —— `最佳` 只在 `finish()` 里更新，局中它还是上一次的纪录。
       ⚠ 这里真出过一个 bug：`best` 存的就是**秒**，`syncHud()` 里又除了一次 1000，
         于是「最佳」永远是 0.0 —— **存对了、显示错了**。
         是「按住 2.5 秒然后读 HUD」的探针跑出来的（渲染对 ≠ 能玩），这条把它钉住。
    """
    cfg = GAMES[page]
    _reset(b)
    if not _click_sel(b, '.bottom-game .game-card-start'):
        return ([u'找不到游戏卡上的「开始」按钮'], u'—')
    time.sleep(0.4)
    if not _g_open(b, cfg):
        return ([u'点了「开始」，遮罩没打开'], u'—')

    cv = _g_rect(b, cfg['canvas'])
    if not cv:
        return ([u'找不到画布（%s）' % cfg['canvas']], u'—')
    cx, cy = (cv['l'] + cv['r']) / 2, (cv['t'] + cv['b']) / 2

    fails = []

    # ── ① 按住 2.5 秒：守住必须变多 ──
    b.press(cx, cy)
    time.sleep(2.5)
    d = b.jso(KOSMA_HUD) or {}
    try:
        kept = float(d.get('kept') or 0)
    except ValueError:
        kept = -1.0
    if kept <= 0:
        fails.append(u'① 按住 2.5 秒，「守住」还是 %r —— 框明明扫过整根柱子，'
                     u'却一次都没罩住光点，判定没生效' % d.get('kept'))

    # ── ② 继续按住（框已经顶到头了）→ 光点迟早溜出框 → **风要涨** ──
    #   ⚠ 原来这里写的是「等『灯灭了』出现（最多 12 秒）」，**偶发**：
    #     光点要是赖在框里十几秒，风就一直退、这一局不结束 → 假红。
    #     改成看**风**（已经显示在 HUD 上）：按住不动时，光点必然有大段时间在框外，
    #     风一定涨过 0 —— 这是可证伪的，而且不赌时机。
    saw_wind = 0
    for _ in range(12):                       # 最多 6 秒
        time.sleep(0.5)
        d = b.jso(KOSMA_HUD) or {}
        try:
            saw_wind = max(saw_wind, int(float(d.get('wind') or 0)))
        except ValueError:
            pass
    if saw_wind <= 0:
        fails.append(u'② 按住把框顶在头上、盯了 6 秒，「风」一直是 %r%% —— '
                     u'光点总有溜出去的时候，风却没涨（罩住判定或风压反了）' % saw_wind)

    # ── ③ 等这一局结束，再比「最佳」与「守住」 ──
    #   ⚠ 必须等**结算之后**再比：`最佳` 只在 `finish()` 里更新，局中它还是上一次的纪录。
    b.release(cx, cy)
    for _ in range(70):                       # 最多 35 秒（一局 30 秒）
        time.sleep(0.5)
        d = b.jso(KOSMA_HUD) or {}
        if u'守住' in (d.get('msg') or u'') or u'灯灭了' in (d.get('msg') or u''):
            break

    # ── ③ 最佳要跟得上守住 ──
    d = b.jso(KOSMA_HUD) or {}
    try:
        k = float(d.get('kept') or 0)
        bs = float(d.get('best') or 0)
    except ValueError:
        k, bs = -1.0, -2.0
    if abs(k - bs) > 0.15:
        fails.append(u'③ 结算后 HUD 上「守住 %s」但「最佳 %s」—— 对不上。'
                     u'（⚠ 真出现过：`best` 已经是秒，显示时又除了一次 1000）'
                     % (d.get('kept'), d.get('best')))

    return (fails, u'按住→守住涨 / 罩不住→风涨 / 结算后最佳跟得上（守住 %.1f 秒）' % kept
            if not fails else u'判定不对')


@check
def check_game_card_matches_module(b, page, expected):
    """游戏卡上的文案**必须来自模块自己声明的那份**。

    ⚠ 守的是「同一件事两处维护」：`THEME.game` 里曾经**也**写了一份 title/hint，
      而 `bottom.js` 只调 `mod.mount(host)`、从不转发 —— 于是那一份是**死配置**：
      改它没有任何效果，而且这个 THEME 在 IIFE 里、测试读不到，**没法自动核对**。
      现在只留模块那一份（spec §4.1 / §4.5），这条断言把
      「卡上印的字 == 模块声明的字」钉死，谁再分叉就会红。

    没有游戏槽的页面直接跳过（探针页就是）。
    """
    d = b.jso("""(() => {
        var slot = document.querySelector('.bottom-game');
        if (!slot) return JSON.stringify({ noSlot: true });
        var ids = Object.keys(window.ElysiaGames || {});
        var t = slot.querySelector('.game-card-title');
        var h = slot.querySelector('.game-card-hint');
        return JSON.stringify({
            ids: ids,
            mounted: slot.children.length > 0,
            cardTitle: t ? t.textContent : null,
            cardHint: h ? h.textContent : null,
            modTitle: ids.length === 1 ? window.ElysiaGames[ids[0]].title : null,
            modHint: ids.length === 1 ? window.ElysiaGames[ids[0]].hint : null,
        });
    })()""")
    if d is None:
        return ([u'取不到游戏槽状态'], u'—')
    if d.get('noSlot'):
        return ([], u'本页没有游戏槽（跳过）')

    fails = []
    if not d['mounted']:
        fails.append(u'.bottom-game 是空的 —— 模块的 mount(host) 没往里渲染东西')
    if len(d['ids']) != 1:
        fails.append(u'页面上加载了 %d 个游戏模块（%r）—— 这条断言假定只有一个'
                     % (len(d['ids']), d['ids']))
        return (fails, u'模块数不对')

    if d['cardTitle'] != d['modTitle']:
        fails.append(u'卡上的标题是 %r，模块声明的却是 %r' % (d['cardTitle'], d['modTitle']))
    if d['cardHint'] != d['modHint']:
        fails.append(u'卡上那句话是 %r，模块声明的却是 %r' % (d['cardHint'], d['modHint']))

    return (fails, u'卡片文案与模块一致' if not fails else u'卡片文案对不上')


# 落点探针：把可发现物临时藏起来，看它中心点上命中的是什么。
# ⚠ 每个 find 都要**先滚到跟前** —— 不然 elementFromPoint 在视口外一律返回 null。
MEASURE_FIND_SPOTS = """(() => {
    var out = [];
    document.querySelectorAll('.explore-find').forEach(function (n) {
        n.scrollIntoView({ block: 'center', behavior: 'instant' });
        var r = n.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        n.style.visibility = 'hidden';
        var under = document.elementFromPoint(cx, cy);
        n.style.visibility = '';
        var text = '';
        if (under) {
            for (var i = 0; i < under.childNodes.length; i++) {
                if (under.childNodes[i].nodeType === 3) text += under.childNodes[i].nodeValue;
            }
        }
        out.push({
            id: n.getAttribute('data-find-id'),
            tag: under ? under.tagName.toLowerCase() : null,
            text: text.trim().slice(0, 24),
        });
    });
    return JSON.stringify(out);
})()"""


def _wait_text_settles(b, timeout=8.0):
    """等页面上的文字**不再增长** —— 打字机写完再量。

    ⚠ 为什么要等（2026-10-02 实测）：打字机是**逐字**写的，写到一半时元素的
      高度跟写完不一样。樱页的开场 `<h1>` 打完字之后**会长高一截**，于是
      `sakura-01` 在**默认视口**下正好压在它身上。
      而这条断言原先只是**靠时机侥幸**在过 —— 前一条断言跑得快，量到的还是半截字。
      给工具加了几条断言、把时机往后推之后它就红了：**红得对，是断言原来没守住。**

    ⚠ 判据用「`body.innerText` 长度连续三次不变」，不写死页面上某个元素的 id ——
      不然这条通用断言就只能在樱那一页跑了。
    """
    prev, stable, t0 = -1, 0, time.time()
    while time.time() - t0 < timeout:
        n = b.js('document.body.innerText.length')
        if n == prev:
            stable += 1
            if stable >= 3:
                return True
        else:
            stable = 0
            prev = n
        time.sleep(0.25)
    return False


@check
def check_finds_not_on_text(b, page, expected):
    """可发现物应该落在**容器**上，不该压在**文字**上。

    它是 0.35 透明度、22px 的一枚小简笔画。落在卡片背景上 =「藏起来的东西」；
    压在一句话正中间 = 看起来像**渲染故障**，还把那个字糊了一下。

    ⚠ 这条是 2026-10-01 的视觉核对逼出来的：当时 12 个里有 4 个正压着文字
      （档案标签「身体数据」、正文段落、创生图标、小字「死而复生的能力」），
      另有 `lab-11` 贴在生日卡的下边缘上 —— 肉眼一看就像卡坏了。
      改坐标能修一次，**断言才能不让它回来**。

    判据：把可发现物临时藏起来，看它中心点上 `elementFromPoint` 命中的元素
    有没有**直接文字**、或本身就是 `p / span / h2 / h3 / b / a / img` 这类叶子。
    """
    # ⚠ **先等打字机写完再量** —— 见 `_wait_text_settles` 上的那段（这条断言
    #   原先只是靠时机侥幸在过）。`_reset` 会重载页面，打字机随之从头开始。
    _reset(b)
    _wait_text_settles(b)

    d = b.jso(MEASURE_FIND_SPOTS)
    LEAF = ('p', 'span', 'h1', 'h2', 'h3', 'h4', 'b', 'strong', 'em', 'a', 'img', 'li')
    fails = []
    total = 0

    # ⚠ **两个视口都要量。** 这条断言原先只在默认视口（约 1256）跑 ——
    #   而本站的主要访客是**手机**。2026-10-02 实测：1256 下 0 个压字，
    #   **375 宽下有 4 个**压着（档案标签「出处」/「鞘中刀」/「点击切换」…）。
    #   **只测桌面 = 这条防线对手机是空的**，而移动端恰恰是主战场。
    #   （坐标是锚点宽度的百分比，换个宽度就落到别的内容上 —— 所以必须两个都量。）
    for (w, h, label) in ((None, None, u'默认'), (375, 812, u'375')):
        if w:
            b._send('Emulation.setDeviceMetricsOverride',
                    {'width': w, 'height': h, 'deviceScaleFactor': 1, 'mobile': True})
            time.sleep(0.6)
        d = b.jso(MEASURE_FIND_SPOTS)
        if d is None:
            fails.append(u'[%s] 取不到可发现物的落点信息' % label)
            continue
        total = max(total, len(d))
        for n in d:
            if n['text']:
                fails.append(u'[%s] %s：正压着文字「%s」（<%s>）—— 看着会像渲染故障'
                             % (label, n['id'], n['text'], n['tag']))
            elif n['tag'] in LEAF:
                fails.append(u'[%s] %s：落在 <%s> 这种**文字叶子**上，该挪到容器上去'
                             % (label, n['id'], n['tag']))

    # ⚠ **必须清掉** —— 否则这个 375 的模拟会跟着后面**所有**断言，
    #   把一整轮后续结果都变成「在手机上测的」，而人会以为自己测的是桌面。
    b._send('Emulation.clearDeviceMetricsOverride')
    time.sleep(0.6)

    return (fails, u'%d 个都落在容器上（两个视口）' % total if not fails
            else u'%d 处压着东西' % len(fails))


@check
def check_art_keywords_resolve(b, page, expected):
    """每个可发现物的 `art` 都要**能解出真正的图形**，不能悄悄回落到默认。

    ⚠ `explore.js` 的 `artSvg()` 遇到未知关键字会 `console.warn` 并**回落到 `glint`** ——
      于是「关键字打了个错字」在页面上只表现为「那个东西长得不对」：
      **不报错、不影响别的断言、快照也照不出来**（它只是个 22px 的装饰）。
      这条把它变成可见的。

    ⚠ 换个说法：它是给**新页接入**用的 —— 新页要加自己的 art 关键字，
      写错一个字母不会有任何提示，只会让某个可发现物长得像别的。

    判据：`data-art` 声明的关键字必须真的在 `ElysiaExplore.ART` 里。
    """
    d = b.jso("""(() => {
        var bad = [], n = 0;
        document.querySelectorAll('.explore-find').forEach(function (el) {
            n++;
            var key = el.getAttribute('data-art');
            if (!key || !window.ElysiaExplore || !window.ElysiaExplore.ART[key]) {
                bad.push(el.getAttribute('data-find-id') + ' → ' + key);
            }
        });
        return JSON.stringify({ n: n, bad: bad });
    })()""")
    if d is None:
        return ([u'取不到可发现物的 art 关键字 —— explore.js 没加载？'], u'—')
    if not d['n']:
        return ([], u'本页没有可发现物（跳过）')
    if d['bad']:
        return ([u'这些 find 的 art 在 ART 表里找不到（会**静默回落**成默认图形）：%s'
                 % u'、'.join(d['bad'])], u'%d 个对不上' % len(d['bad']))
    return ([], u'%d 个 art 都能解出' % d['n'])


# ══ 樱：「鞘中刀」══════════════════════════════════════════════════════
def _click_sel(b, sel):
    """把选择器滚到视口中间，再用**真实指针事件**点它。

    ⚠ 不能用 `.click()` —— 那是合成事件，站点里不少监听器认的是真实指针路径。
    ⚠ 必须先滚动：CDP 派发的是**视口坐标**，元素在视口外时事件会落到别处，**而且不报错**
      （HANDOVER §6.4）。`behavior:'instant'` 也是必须的 —— 站点有 `scroll-behavior:smooth`。
    """
    c = b.jso("""(() => {
        var n = document.querySelector('%s');
        if (!n) return null;
        n.scrollIntoView({ block: 'center', behavior: 'instant' });
        var r = n.getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()""" % sel)
    if not c:
        return False
    b.press(c['x'], c['y'])
    time.sleep(0.05)
    b.release(c['x'], c['y'])
    return True


@check
@sakura_only
def check_sakura_blade_alive_after_gift(b, page, expected):
    """**收过花之后，刀照样能点、照样拒你** —— 那个 bug 的回归断言。

    需求方 2026-10-01：「鞘中刀有个 bug，**触发成功一次之后就不会恢复了**」。

    原写法是 `if (gifted){ showToast('……嗯。花还开着。', false); return; }` ——
    拿到花之后整块**永远只弹那一句**，再点什么都不会发生。

    修法是把 `gifted` 的语义收窄成「**还会不会再送花**」，而不是「刀还能不能点」。
    名字本身（**勿忘我**）意味着花不该忘；但一柄不肯出鞘的刀，本就该**永远不驯**。
    花是纪念品，刀是性格 —— 前者留，后者不该因为送过花就没了。
    """
    # 把「已经收过花」这个状态直接造出来
    b.js("(() => { try { localStorage.setItem('sakuraFlower', '1'); } catch (e) {} return 1; })()")
    _reload(b)

    st = b.jso("""(() => {
        var s = document.getElementById('bladeStage');
        var c = document.getElementById('bladeCount');
        return JSON.stringify({ stage: !!s, count: c ? c.textContent : null });
    })()""")
    if not st or not st['stage']:
        return ([u'这一页没有 #bladeStage —— 「鞘中刀」模块不在？'], u'—')
    if st['count'] != u'她给了你一朵花':
        return ([u'造出来的「已收花」状态没生效：计数行是 %r' % st['count']], u'—')

    if not _click_sel(b, '#bladeStage'):
        return ([u'点不到 #bladeStage'], u'—')
    time.sleep(0.35)

    d = b.jso("""(() => {
        var f = document.querySelector('.blade-float');
        var t = document.getElementById('skToast');
        return JSON.stringify({
            float: f ? f.textContent : null,
            toast: t ? t.textContent : null,
            flower: localStorage.getItem('sakuraFlower'),
        });
    })()""")
    if d is None:
        return ([u'取不到点击后的状态'], u'—')

    fails = []
    # ① 反馈还在 —— 原写法在这一步就 return 了，所以什么都不会出现
    if d['float'] != u'纹丝不动':
        fails.append(u'收过花之后点刀，**没有「纹丝不动」那一下**，反馈没了 —— '
                     u'这正是那个 bug：原写法一见 gifted 就 return')
    # ② 弹的是**有出处的「拒绝」那句**，不是「……嗯。花还开着。」
    if not d['toast'] or u'决不能就这样轻易出鞘' not in d['toast']:
        fails.append(u'收过花之后点刀，该弹「拒绝」那句台词，实际弹的是 %r' % d['toast'])
    # ③ 不再重复送花
    if d['flower'] != '1':
        fails.append(u'sakuraFlower 变成了 %r —— 不该被改写' % d['flower'])

    return (fails, u'收过花后刀仍是活的' if not fails else u'刀死了')


@check
@sakura_only
def check_sakura_ending_unlocks_immediately(b, page, expected):
    """**收下花的同一瞬间**，结尾那句和多出来的那朵花就该出现 —— 不用刷新。

    ⚠ 原先那段只在**页面加载时**判一次，所以「收下花 → 往下滚到结尾」当场看不到，
      要刷新才有。而 HANDOVER §10.3 把这个跨彩蛋描述成「收过花才多一句」，
      读起来像当场就能看到 —— **它该当场出现。**
    """
    b.js("(() => { try { localStorage.removeItem('sakuraFlower'); } catch (e) {} return 1; })()")
    _reload(b)

    for _ in range(3):
        if not _click_sel(b, '#bladeStage'):
            return ([u'点不到 #bladeStage'], u'—')
        time.sleep(0.25)
    time.sleep(0.3)

    d = b.jso("""(() => {
        var s = document.getElementById('endingSub');
        var f = document.getElementById('endingFlower');
        return JSON.stringify({
            text: s ? s.textContent : null,
            visible: !!s && s.classList.contains('visible'),
            bloom: !!f && f.classList.contains('bloom'),
            flower: localStorage.getItem('sakuraFlower'),
        });
    })()""")
    if d is None:
        return ([u'取不到结尾状态'], u'—')

    fails = []
    if d['flower'] != '1':
        fails.append(u'点了三次却没拿到花（sakuraFlower=%r）—— 前提就不成立' % d['flower'])
    if not d['text']:
        fails.append(u'**收下花的当下**，结尾那句还是空的 —— 要刷新才出现（这就是要修的）')
    elif not d['visible']:
        fails.append(u'结尾那句有文字但没有 .visible —— 看不见')
    if not d['bloom']:
        fails.append(u'**收下花的当下**，结尾那朵花没有开（缺 .bloom）')

    return (fails, u'收花当下结尾就解锁' if not fails else u'要刷新才出现')


@check
@sakura_only
def check_sakura_no_dead_write(b, page, expected):
    """点刀**不再往 localStorage 里写那个只写不读的 `sakuraTries`**。

    ⚠ 原代码 `localStorage.setItem('sakuraTries', String(tries))` **只写不读** ——
      页面上是 `var tries = 0`，每次访问从零开始，存进去的值**永远没人看**。
      死代码不只是碍眼：它让「已伸手 × N」看起来像是跨访问累计的，**但它不是**。
    """
    b.js("""(() => {
        try {
            localStorage.removeItem('sakuraFlower');
            localStorage.removeItem('sakuraTries');
        } catch (e) {}
        return 1;
    })()""")
    _reload(b)

    for _ in range(3):
        if not _click_sel(b, '#bladeStage'):
            return ([u'点不到 #bladeStage'], u'—')
        time.sleep(0.25)

    v = b.js("String(localStorage.getItem('sakuraTries'))")
    if v != 'null':
        return ([u'点完三次之后 localStorage 里还有 `sakuraTries=%s` —— '
                 u'那是**只写不读**的死代码，该删的那行还在' % v], u'死写入还在')
    return ([], u'不再写 sakuraTries')


@check
@sakura_only
def check_blade_state_restores_together(b, page, expected):
    """收过花的人**下次访问**时，刀的两个状态要**一起**恢复（花 + 刀光）。

    ⚠ 这条对应 Task 3 交付时**主动交代「没做」**的那件事：
      `renderBlade()` 只补了花的 `.bloom`，**没补 `bladeGlow` 的 `.lit`** ——
      于是「花开着、光灭着」，两处状态自相矛盾。它是**改动前就有的不一致**
      （Task 3 的四项范围里没列它，所以当时没动）。

    ⚠ 但**现在更要紧**：刀已经永远可点，那个「送花」分支**不会再进第二次** ——
      不在这里补，刀光对收过花的老访客就是**永远不再亮**。

    做法：写 `sakuraFlower` → 重载 → 查两个类名是否都在。
    （⚠ 注意不能靠「点三次」来构造这个状态 —— 那走的是**送花那一瞬间**的路径，
      而这里要验的是**下次访问时从存储恢复**的路径。）
    """
    b.js("""(() => {
        try { localStorage.setItem('sakuraFlower', '1'); } catch (e) {}
        location.reload();
        return 1;
    })()""")
    time.sleep(3.5)

    d = b.jso("""(() => {
        var f = document.getElementById('bladeFlower');
        var g = document.getElementById('bladeGlow');
        return JSON.stringify({
            flower: !!f && f.classList.contains('bloom'),
            glow:   !!g && g.classList.contains('lit'),
        });
    })()""")
    if d is None:
        return ([u'取不到刀的状态'], u'—')

    fails = []
    if not d['flower']:
        fails.append(u'重载后花没有开着 —— `renderBlade()` 没从存储恢复 `bloom`')
    if not d['glow']:
        fails.append(u'花开着、**刀光却是灭的** —— `renderBlade()` 漏补了 `.lit`，'
                     u'而刀现在永远可点、送花那支不会再进，所以它**永远亮不起来**了')

    return (fails, u'花与刀光一起恢复' if not fails else u'状态不一致')


@check
@sakura_only
def check_sakura_finds_match_registry(b, page, expected):
    """樱那 12 条的 `id` / `at` / `verb` / `art` / `line` / `src` 与**登记表**逐字一致。

    ⚠ 这是「**台词一条不编**」那条底线的落点 —— 台词逐字抄自官方档案馆，
      核准记录在 `docs/superpowers/plans/2026-10-01-sakura-finds-table.md`。
      **改台词必须同时改本文件的 `SAKURA_FINDS`**，逼它变成一次刻意动作。

    ⚠ 判据读的是**源码**不是 DOM：`THEME` 在 IIFE 里（`window.THEME` 读不到），
      而 `line` 只有触发时才进气泡，所以 DOM 侧拿不全这 12 条。
    """
    src = io.open(os.path.join(ROOT, page), encoding='utf-8').read()
    i = src.find('explore: {')
    if i < 0:
        return ([u'源码里找不到 `explore: {`'], u'—')
    got = re.findall(
        r"\{\s*id:'([^']*)',\s*at:'([^']*)',\s*x:[-0-9.]+,\s*y:[-0-9.]+,\s*"
        r"verb:'([^']*)',\s*art:'([^']*)',\s*\n\s*line:'([^']*)',\s*\n\s*src:'([^']*)'",
        src[i:])

    fails = []
    if len(got) != len(SAKURA_FINDS):
        fails.append(u'解析出 %d 条 find，登记表有 %d 条 —— 条数对不上（格式被改过？）'
                     % (len(got), len(SAKURA_FINDS)))
    for k, (wid, wat, wline, wsub) in enumerate(SAKURA_FINDS):
        if k >= len(got):
            break
        gid, gat, gverb, gart, gline, gsrc = got[k]
        if gid != wid:
            fails.append(u'第 %d 条的 id 是 %r，登记表是 %r' % (k + 1, gid, wid))
        if gat != wat:
            fails.append(u'%s 的锚点是 %r，登记表是 %r' % (wid, gat, wat))
        if gline != wline:
            fails.append(u'%s 的**台词**与登记表不一致：\n        页面：%s\n        登记：%s'
                         % (wid, gline, wline))
        if gsrc != SAKURA_SRC_PREFIX + wsub:
            fails.append(u'%s 的**出处**与登记表不一致：\n        页面：%s\n        登记：%s'
                         % (wid, gsrc, SAKURA_SRC_PREFIX + wsub))
    return (fails, u'12 条与登记表逐字一致' if not fails else u'%d 处对不上' % len(fails))


@check
@sakura_only
def check_sakura_finds_not_in_quotes(b, page, expected):
    """12 条可发现物的台词**不与语录区那 10 条重复**。

    语录区是一张 10 张卡片的网格，读者**一眼能看到全部**；
    可发现物再用同一句，就成了「你找到了一句你已经读过的话」——探索的甜头当场没了。
    （上一轮 mobius 12 条里只撞了 1 条，基本是避开的；樱这边素材够，可以完全避开。）
    """
    src = io.open(os.path.join(ROOT, page), encoding='utf-8').read()
    i = src.find('var quotes = [')
    if i < 0:
        return ([u'源码里找不到 `var quotes = [`'], u'—')
    quotes = [m.group(1) for m in
              re.finditer(u'「(.+?)」', src[i:src.find(u'];', i)])]
    if len(quotes) < 5:
        return ([u'语录区只解析出 %d 条 —— 解析器可能坏了' % len(quotes)], u'—')

    dup = [wid for (wid, _at, line, _s) in SAKURA_FINDS
           if any(line == q or line in q for q in quotes)]
    if dup:
        return ([u'这些可发现物的台词与语录区重复：%s' % u'、'.join(dup)], u'%d 条重复' % len(dup))
    return ([], u'12 条与语录区零重复（语录区 %d 条）' % len(quotes))


# ══ 樱：刀 × 可发现物不打架（Task 7 / Review Focus 4）═════════════════
#   三个可发现物（sakura-04 / 05 / 06）就撒在 `#blade` 这一节里，而这一节的
#   主体是那个刀舞台。**两个方向都要验，而且缺一不可**：
#     · 只验「点舞台正中 → 刀有反应」：一个「可发现物永远点不到」的实现照样能过。
#     · 只验「点 find → 记下它」：一个「点哪都触发刀」的实现也能过。
#   这一对是**互相印证**的 —— 单看任何一条都能被糊弄过去。
#
#   ⚠ 判「刀有没有反应」**不能点完再查 `.refused`**：它只挂 **190ms**
#     （`refuseShake()` 里那个 setTimeout），而 CDP 一个来回就要几十毫秒 ——
#     等点完再查必定扑空，这条断言就成了一句永远绿的空话。
#     所以先装一个 MutationObserver，把它**出现过**这件事记下来。

BLADE_FINDS = ('sakura-04', 'sakura-05', 'sakura-06')

BLADE_WATCH = """
(() => {
  var s = document.getElementById('bladeStage');
  if (!s) return 0;
  window.__bladeSaw = { refused: false, floats: 0 };
  new MutationObserver(function (muts) {
    if (s.classList.contains('refused')) window.__bladeSaw.refused = true;
    for (var i = 0; i < muts.length; i++) {
      var add = muts[i].addedNodes;
      for (var j = 0; j < add.length; j++) {
        var n = add[j];
        if (n.classList && n.classList.contains('blade-float')) window.__bladeSaw.floats++;
      }
    }
  }).observe(s, { attributes: true, attributeFilter: ['class'], childList: true });
  return 1;
})()
"""


def _blade_watch(b):
    """装上「刀刚才有没有反应」的记录器（`.refused` + 「纹丝不动」浮字）。"""
    return b.js(BLADE_WATCH)


def _blade_saw(b):
    return b.jso('JSON.stringify(window.__bladeSaw || null)')


def _blade_count(b):
    return b.js("(() => { var e = document.getElementById('bladeCount');"
                " return e ? e.textContent : null; })()")


def _reset_blade(b):
    """清掉探索进度**和**「已收花」，再 reload —— 让刀从「没送过花」出发。

    ⚠ `sakuraFlower` 必须一起清：收过花之后 `tryDraw` 不再 `tries++`，
      计数行会停在「她给了你一朵花」—— 而这两条断言看的正是**计数有没有动**。
      （不这么做的话，断言的结果会取决于前面跑过哪几条 —— 那种依赖迟早变成假红。）
    """
    b.js("(() => { try {"
         " localStorage.removeItem('elysia:explore:' + ElysiaExplore.pageId());"
         " localStorage.removeItem('sakuraFlower');"
         " } catch (e) {} return 1; })()")
    _reload(b)


def _hit_at(b, sel):
    """`elementFromPoint` 在那个元素中心命中了什么。

    ⚠ 失败信息里必须带上它 —— 只说「刀没反应」的话，下一个人还得自己再查一遍
      「到底是谁压在上面」。这类断言的价值一半在**报出来的原因**。
    """
    return b.js("""(() => {
        var n = document.querySelector('%s');
        if (!n) return '(元素本身就不存在)';
        var r = n.getBoundingClientRect();
        var e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!e) return '(null)';
        var c = e.className;
        if (c && typeof c !== 'string') c = c.baseVal;
        var f = e.closest ? e.closest('.explore-find') : null;
        return e.tagName + (e.id ? '#' + e.id : '')
             + (c ? '.' + String(c).split(' ').join('.') : '')
             + (f ? '  ← 可发现物 ' + f.getAttribute('data-find-id') : '');
    })()""" % sel)


@check
@sakura_only
def check_sakura_blade_click_not_stolen(b, page, expected):
    """① 点**刀舞台的正中** → 刀有反应（拒了一下 + 浮字 + 计数），且探索度**不动**。

    这一半挡的是「可发现物的热区把舞台盖住」：那样点下去会落到 find 上，
    `tryDraw` 根本收不到事件 —— 用户看到的是「刀点不动了」，而没有任何报错。
    """
    _reset_blade(b)
    before_count = _blade_count(b)
    if before_count is None:
        return ([u'这一页没有 #bladeStage / #bladeCount —— 「鞘中刀」模块不在？'], u'—')

    before_found = b.found_ids()
    _blade_watch(b)

    if not _click_sel(b, '#bladeStage'):
        return ([u'点不到 #bladeStage'], u'—')
    time.sleep(0.3)

    saw = _blade_saw(b) or {}
    after_found = b.found_ids()
    hit = _hit_at(b, '#bladeStage')

    fails = []
    if not saw.get('refused'):
        fails.append(u'点了刀舞台的**正中**，`.refused` 那一下没出现过 —— '
                     u'那个点上命中的是 %s，刀的点击被截走了' % hit)
    if not saw.get('floats'):
        fails.append(u'点了刀舞台的正中，没有「纹丝不动」浮字（命中的是 %s）' % hit)
    if _blade_count(b) == before_count:
        fails.append(u'点了刀舞台的正中，计数行没动（一直是 %r）—— `tryDraw` 没跑到'
                     % before_count)
    if after_found != before_found:
        fails.append(u'点**刀舞台**却把可发现物也触发了（%r → %r）—— 两边在互相误触'
                     % (before_found, after_found))

    return (fails, u'点舞台：刀有反应、探索度不动' if not fails else u'刀舞台被截走了')


@check
@sakura_only
def check_sakura_blade_finds_dont_swing(b, page, expected):
    """② 点 `#blade` 上那三个可发现物**各自的中心** → 它被记下，且刀**没有反应**。

    这一半挡的是「点哪都触发刀」：那样想找东西反而在拔刀，而 `tries++` 是**有副作用**的
    —— 拔够三次她会把「勿忘我」送出去，于是「我只是想点点看」变成了改掉这一页的状态。
    """
    _reset_blade(b)
    before_count = _blade_count(b)
    if before_count is None:
        return ([u'这一页没有 #bladeStage / #bladeCount —— 「鞘中刀」模块不在？'], u'—')

    _blade_watch(b)

    fails = []
    for fid in BLADE_FINDS:
        if fid in b.found_ids():
            fails.append(u'%s 在测之前就已经是「已发现」了 —— 前面的检查污染了它' % fid)
            continue
        if not _trigger(b, fid):
            fails.append(u'触发不了 %s —— 它没被渲染出来，或者拿不到它的中心点' % fid)
            continue
        time.sleep(0.2)
        if fid not in b.found_ids():
            fails.append(u'点了 %s 的中心，它却没被记为「已发现」（那个点上命中的是 %s）'
                         % (fid, _hit_at(b, '[data-find-id="%s"]' % fid)))

    time.sleep(0.2)
    saw = _blade_saw(b) or {}
    if saw.get('refused'):
        fails.append(u'点可发现物的时候，**刀也被惊动了**（`.refused` 出现过）—— '
                     u'两个系统在打架')
    if saw.get('floats'):
        fails.append(u'点可发现物的时候，刀浮出了「纹丝不动」× %d 次' % saw['floats'])
    if _blade_count(b) != before_count:
        fails.append(u'点可发现物的时候，刀的计数行动了（%r → %r）—— `tryDraw` 被误触发了'
                     % (before_count, _blade_count(b)))

    return (fails, u'点可发现物：记下了它、刀没反应' if not fails else u'可发现物被刀抢了')


# 三个可发现物相对**刀舞台**的位置。
# ⚠ 判据是「find 的**中心**落不落在舞台矩形里」—— 和 `check_finds_not_on_text`
#   用同一个口径（那边也是取中心点）。用户瞄的就是那个中心。
MEASURE_BLADE_OVERLAP = """
(() => {
  var sec = document.getElementById('blade');
  var st = document.getElementById('bladeStage');
  if (!sec || !st) return null;
  var R = st.getBoundingClientRect();
  var secR = sec.getBoundingClientRect();
  var out = [].slice.call(sec.querySelectorAll('.explore-find')).map(function (n) {
    var r = n.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    /* dist > 0 = 中心在舞台外面，数值就是**离得多远**（px）；
       dist <= 0 = 中心落在舞台矩形里。报告里要带上它 ——
       绿色的运行也该说清楚「绿得有多勉强」。 */
    var dx = Math.max(R.left - cx, cx - R.right);
    var dy = Math.max(R.top - cy, cy - R.bottom);
    return {
      id: n.getAttribute('data-find-id'),
      onStage: cx >= R.left && cx <= R.right && cy >= R.top && cy <= R.bottom,
      inside: st.contains(n),
      dist: Math.round(Math.max(dx, dy)),
      x: +(secR.width ? (cx - secR.left) / secR.width : 0).toFixed(3),
    };
  });
  return JSON.stringify({ finds: out });
})()
"""


@check
@sakura_only
def check_sakura_blade_finds_clear_of_stage(b, page, expected):
    """③ 三个可发现物**不许压在刀舞台上**（两个视口都要量）。

    ⚠ 为什么①②这一对之外还要单独一条**几何**的：
      那两条只采「舞台**正中**」这**一个点**。一个 find 要是挪到舞台的左三分之一上，
      ① 照样绿 —— 而用户点那一片想拔刀，落到的是 find，没有任何东西会报出来。
      几何这条把整块舞台都盖住了。

    ⚠ **两个视口都要量**，而且手机那一遍才是关键：
      坐标是 `#blade` 宽度的百分比，而舞台的占比**随视口剧变** ——
      实测 1280 下舞台占 `#blade` 的 x `0.379~0.621`，**360 宽下是 `0.071~0.929`**。
      也就是说 `x:0.10` 这种坐标在桌面上离舞台很远、在手机上却紧贴着它。
      （同一条教训见 `check_finds_not_on_text`：2026-10-02 实测 375 下 4 个压着字，
        而当时那条断言只看桌面 —— 「只测桌面 = 这条防线对手机是空的」。）
    """
    fails = []
    total = 0
    tight = None          # (余量px, id, 视口) —— 全站最紧的那一处
    for (w, h, label) in ((None, None, u'默认'), (375, 812, u'375')):
        if w:
            b._send('Emulation.setDeviceMetricsOverride',
                    {'width': w, 'height': h, 'deviceScaleFactor': 1, 'mobile': True})
            time.sleep(0.6)
        d = b.jso(MEASURE_BLADE_OVERLAP)
        if d is None:
            fails.append(u'[%s] 这一页没有 #blade / #bladeStage —— 「鞘中刀」模块不在？' % label)
            continue
        finds = d['finds']
        total = max(total, len(finds))
        if not finds:
            fails.append(u'[%s] `#blade` 里一个可发现物都没有 —— 锚点选择器写错了？' % label)
        for n in finds:
            if tight is None or n['dist'] < tight[0]:
                tight = (n['dist'], n['id'], label)
            if n['inside']:
                fails.append(u'[%s] %s：**被放进了舞台里面** —— 点它会顺着冒泡去拔刀'
                             % (label, n['id']))
            elif n['onStage']:
                fails.append(u'[%s] %s：中心落在刀舞台上（x≈%s）—— 这里本该是「拔刀」，'
                             u'用户点到的是它' % (label, n['id'], n['x']))

    # ⚠ **必须清掉** —— 否则这个 375 的模拟会跟着后面**所有**断言，
    #   把一整轮后续结果都变成「在手机上测的」，而人会以为自己测的是桌面。
    b._send('Emulation.clearDeviceMetricsOverride')
    time.sleep(0.6)

    if fails:
        return (fails, u'%d 处压在刀舞台上' % len(fails))
    # 顺手报出**最小余量**：绿色的运行也该说清楚「绿得有多勉强」——
    # 2026-10-02 实测手机上 sakura-04 只剩 **44px**（桌面是 333px），
    # 是全站最紧的一处。数字不动地挂在这里，缩水了看得见。
    return ([], u'%d 个都躲开了刀舞台（两个视口，最小余量 %dpx：%s @ %s）'
            % (total, tight[0], tight[1], tight[2]))


# ══ 樱的小游戏「一瞬」（Task 6）══════════════════════════════════════
#   和 mobius 那条同一个思路：游戏状态在 canvas 上、拿不到内部变量（脚本是 IIFE），
#   所以判「在不在动」只能靠**画面本身**。
#   ⚠ 关键在于**同一个判据要既认得出「动」、也认得出「不动」** ——
#     所以每次都先验「开局后在动」，再验「关掉后静止」。
#     少了后半段，「两次采样不同」有可能只是 dataURL 编码本身不稳定，
#     那这条断言就是恒真式，测了等于没测。

SK_CANVAS = '#sakuraGameOverlay canvas'


def _sk_canvas_rect(b):
    """画布中心的**视口坐标**。

    ⚠ 不 `scrollIntoView`（`center_of` 会做那件事）—— 遮罩是 `position:fixed`
      且居中的，画布必然在视口里；对一个 fixed 元素调 scrollIntoView 反而
      可能把页面滚到别处。
    """
    return b.jso("""(() => {
        var c = document.querySelector('%s');
        if (!c) return null;
        var r = c.getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()""" % SK_CANVAS)


def _sk_petal(b):
    """读画布上那枚樱瓣的位置（**粉色像素的质心**），还有斩线在哪。

    ⚠ 只扫中间那一条横带（y 125~195）—— 顺手避开两处会污染质心的字：
      「刹那 / 太早了 / 晚了」那行画在 y≈114（基线），连击数画在 y≈222。
      「刹那」用的也是 `#ffb7c5`，全画布扫的话它一出现质心就跳。
    """
    return b.jso("""(() => {
        var c = document.querySelector('%s');
        if (!c) return JSON.stringify({ missing: true });
        var y0 = 125, bh = 70, W = c.width;
        var d = c.getContext('2d').getImageData(0, y0, W, bh).data;
        var n = 0, sx = 0;
        for (var i = 0; i < d.length; i += 4) {
          var r = d[i], g = d[i + 1], bl = d[i + 2], a = d[i + 3];
          /* 樱粉 #ffb7c5。⚠ 连击那行的 #ffd6e0（g=214）被 g<205 挡在外面。 */
          if (a > 200 && r > 230 && g > 150 && g < 205 && bl > 165 && bl < 240) {
            n++; sx += ((i / 4) %% W);
          }
        }
        return JSON.stringify({ n: n, x: n ? sx / n : null, mid: W / 2 });
    })()""" % SK_CANVAS)


def _sk_hud(b):
    return b.jso("""(() => {
        var o = document.getElementById('sakuraGameOverlay');
        var q = function (s) { var n = o && o.querySelector(s); return n ? n.textContent : null; };
        return JSON.stringify({ hits: q('.sk-hits'), combo: q('.sk-combo') });
    })()""")


def _sk_wait_petal(b, pred, timeout):
    """等花瓣自己飞到满足 `pred` 的位置（不干预它）。

    ⚠ 取样要密（15ms）：花瓣 150px/s，15ms 才走 2px 多一点，
      才来得及在「压着斩线」那一小段里出刀。
    """
    t0 = time.time()
    while time.time() - t0 < timeout:
        p = _sk_petal(b)
        if p and not p.get('missing') and p.get('x') is not None and pred(p):
            return p
        time.sleep(0.015)
    return None


def _sk_strike(b):
    """在画布上出刀一次 —— 走**真实鼠标路径**（模块接的是 `pointerdown`）。"""
    c = _sk_canvas_rect(b)
    if not c:
        return False
    b.press(c['x'], c['y'])
    time.sleep(0.03)
    b.release(c['x'], c['y'])
    return True


@check
@sakura_only
def check_sakura_judgment(b, page, expected):
    """③ 出刀**判定**真的生效（正反两半都验）。

    ① 花瓣还在远处（离斩线 60px 以上）时出刀 → **不许得分**
    ② 花瓣压在斩线上（±6px）时出刀 → **必须得分**，且连击 +1
    """
    _reset(b)
    if not _click_sel(b, '.bottom-game .game-card-start'):
        return ([u'找不到游戏卡上的「开始」按钮'], u'—')
    time.sleep(0.3)

    fails = []

    # ── ① 远处出刀：不许得分 ──
    far = _sk_wait_petal(b, lambda p: p['x'] < p['mid'] - 60, 5.0)
    if far is None:
        fails.append(u'等不到一枚还在远处的花瓣 —— 读不到画面？')
    elif not _sk_strike(b):
        fails.append(u'找不到游戏画布')
    else:
        time.sleep(0.3)
        hud = _sk_hud(b) or {}
        if hud.get('hits') != '0':
            fails.append(u'花瓣离斩线还有 %.0fpx 就出刀，却得分了（正中 %s）——'
                         u'判定没生效，成了「点一下算一下」'
                         % (far['mid'] - far['x'], hud.get('hits')))

    # ── ② 斩线上出刀：必须得分 ──
    landed = False
    for _try in range(3):
        near = _sk_wait_petal(b, lambda p: abs(p['x'] - p['mid']) <= 6, 4.0)
        if near is None or not _sk_strike(b):
            break
        time.sleep(0.3)
        hud = _sk_hud(b) or {}
        if hud.get('hits') not in ('0', None):
            landed = True
            if hud.get('combo') != '1':
                fails.append(u'掐准了却只加了「正中」、没加连击（连击 = %s）'
                             % hud.get('combo'))
            break
    if not landed:
        fails.append(u'花瓣明明压在斩线上（±6px）出刀，一次都没中 —— 判定没生效')

    return (fails, u'远处不中、斩线上的中（判定有牙齿）' if not fails else u'判定不对')


# ══ 格蕾修：调色盘 + 两幅画 ══════════════════════════════════════════
#   ⚠ 这一页最核心的三件行为，此前只用一批**一次性临时脚本**验过一次 ——
#     其中「第 6 次还该不该弹完成提示」那一问，那批探针根本没问过，
#     于是那个 bug（完成提示不是边沿触发、每点必弹）就漏过去了。
#     这几条把它钉进正式断言。
GRISEO = 'griseo/index.html'


def griseo_only(fn):
    """收窄成「只对 /griseo/ 成立」—— 查的是她那一页的招牌机制（别的页没有）。"""
    fn.pages = (GRISEO,)
    return fn


# 调色盘 + 完成提示的当前状态。#grToast 只在 `.show` 时才有意义，收起时算空。
_GR_STATE = """(() => {
    var l = document.getElementById('paletteLine');
    var a = document.getElementById('paletteAttr');
    var t = document.getElementById('grToast');
    return JSON.stringify({
        line: l ? l.textContent : null,
        attr: a ? a.textContent : null,
        toast: (t && t.classList.contains('show')) ? t.textContent : '',
    });
})()"""


def _gr_click(b, sel):
    """滚进视口 → 用真实指针点它中心。视口外就**返回 False**（别静默点空）。

    ⚠ 照 HANDOVER §6.4：CDP 派发的是视口坐标，元素在视口外时事件会落到别处、
      **而且不报错**。所以这里先 `scrollIntoView`，再核一次坐标真的在视口内。
    """
    c = b.jso("""(() => {
        var n = document.querySelector('%s');
        if (!n) return null;
        n.scrollIntoView({ block: 'center', behavior: 'instant' });
        var r = n.getBoundingClientRect();
        var vh = window.innerHeight || 0;
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2,
                                inView: r.height > 0 && r.top >= 0 && r.bottom <= vh });
    })()""" % sel)
    if not c or not c.get('inView'):
        return False
    b.press(c['x'], c['y'])
    time.sleep(0.06)
    b.release(c['x'], c['y'])
    return True


@check
@griseo_only
def check_griseo_palette_and_paintings(b, page, expected):
    """① 五抹色 → 5 句两两不同的台词、每条都有「事件-格蕾修」的合法出处；
    ② 第 6 次不许再弹完成提示；
    ③ 两幅画各点 3 次（科斯魔那幅递进显形 / 空白那幅始终空白）。

    ⚠ ② 是那个 bug 的回归断言：完成判定原写在「是新的」分支**之外**，
      `paletteSeenCount === 5` 到 5 之后**恒真** —— 此后每点任意一抹都重弹
      4.2 秒金色完成语，把「完成那一瞬」的仪式感自己抹掉。
    """
    # 清掉彩蛋进度并重载 —— 让两幅画从「未看过」出发（回访复原会让它一进来就是满的）
    b.js("""(() => { try {
        ['kosma','elsia','steps'].forEach(function (k) {
            localStorage.removeItem('griseoEgg:' + k); });
    } catch (e) {} return 1; })()""")
    _reload(b)

    fails = []
    order = ['tail', 'kosma', 'aponia', 'mobius', 'self']

    # ── ① 五抹色各点一次 ──
    lines, attrs = [], []
    for key in order:
        if not _gr_click(b, '.palette-dab[data-color="%s"]' % key):
            return ([u'点不到调色盘上的 %r 色块（视口外 / 选择器错）—— 前提就不成立' % key], u'—')
        time.sleep(0.18)
        d = b.jso(_GR_STATE)
        if not d:
            return ([u'点 %r 之后取不到调色盘状态' % key], u'—')
        lines.append(d['line'])
        attrs.append(d['attr'])

    if len(set(lines)) != 5:
        fails.append(u'五抹色点完，台词重复了：%s（该 5 句两两不同）' % lines)
    # ⚠ **出处不要求两两不同**：五句里有两条（`aponia` 的 G39、`self` 的 G44）
    #   逐字都取自档案馆「画家的追忆 · 其一」—— 核准表里 `griseo-02/03/07/12`
    #   也同引「其一」。硬要求 5 个不同会**编出一个假不变式**，逼着去改一处
    #   **本来正确**的出处。真正要守的是：每条都有出处、且出处来历一致（前缀对）。
    attrs_clean = [a or u'' for a in attrs]
    if any(not a for a in attrs_clean):
        fails.append(u'有出处是空的：%s' % attrs)
    wrong = [a for a in attrs_clean if not a.startswith(u'官方档案馆 · 事件-格蕾修')]
    if wrong:
        fails.append(u'这些出处不以「官方档案馆 · 事件-格蕾修」开头：%s' % wrong)

    # ── ② 等第 5 抹的完成提示自己收起，再**第 6 次点同一抹** → 不许再弹 ──
    #    ⚠ 必须先等它消失：否则分不清「第 5 次的提示还在」和「第 6 次又弹了」。
    d = {}
    for _ in range(22):                       # 最多 ~6.6 秒（金色提示 4.2s）
        time.sleep(0.3)
        d = b.jso(_GR_STATE) or {}
        if not d.get('toast'):
            break
    if d.get('toast'):
        fails.append(u'第 5 抹的完成提示等了 6.6 秒还没收起 —— 时序不对，② 判不了')
    elif not _gr_click(b, '.palette-dab[data-color="tail"]'):
        fails.append(u'点不到第 6 次要点的色块')
    else:
        time.sleep(0.4)
        d6 = b.jso(_GR_STATE) or {}
        if d6.get('toast'):
            fails.append(u'**第 6 次点同一抹色又弹了提示**（%r）—— 完成判定不是边沿触发。'
                         u'这正是那个 bug：`=== 5` 到 5 后恒真，此后每点任意一抹都重弹'
                         % (d6.get('toast') or u''))

    # ── ③ 科斯魔那幅：点 3 次，一层比一层多显形 ──
    kstages = []
    for _ in range(3):
        if not _gr_click(b, '#paintingKosma'):
            fails.append(u'点不到 #paintingKosma'); break
        time.sleep(0.25)
        kstages.append(b.jso("""(() => { var n = document.getElementById('paintingKosma');
            var s = document.getElementById('paintingKosmaSay');
            return JSON.stringify({ s1: n.classList.contains('show1'),
                                    s2: n.classList.contains('show2'),
                                    s3: n.classList.contains('show3'),
                                    say: s ? s.textContent : '' }); })()""") or {})
    if len(kstages) == 3:
        want = [(True, False, False), (True, True, False), (True, True, True)]
        for i, (s, w) in enumerate(zip(kstages, want)):
            got = (s.get('s1'), s.get('s2'), s.get('s3'))
            if got != w:
                fails.append(u'科斯魔那幅第 %d 次点：.show 是 %s，该是 %s —— 递进显形不对'
                             % (i + 1, got, w))
        if not (kstages[2].get('say') or '').strip():
            fails.append(u'科斯魔那幅第 3 次点完，台词还是空的 —— 画满了却没说那句话')

    # ── ③ 空白那幅：第 1 次沉默、第 2 次才有字，且**始终没有 svg** ──
    estages = []
    for _ in range(3):
        if not _gr_click(b, '#paintingElsia'):
            fails.append(u'点不到 #paintingElsia'); break
        time.sleep(0.25)
        estages.append(b.jso("""(() => { var n = document.getElementById('paintingElsia');
            var s = document.getElementById('paintingElsiaSay');
            return JSON.stringify({ say: s ? s.textContent : '',
                                    svg: n.querySelectorAll('svg').length }); })()""") or {})
    if len(estages) == 3:
        if (estages[0].get('say') or '').strip():
            fails.append(u'空白那幅第 1 次点就有字了（该**沉默**）：%r' % estages[0].get('say'))
        if not (estages[1].get('say') or '').strip():
            fails.append(u'空白那幅第 2 次点还是空的 —— 该有字了')
        svgs = [e.get('svg') for e in estages]
        if any(v != 0 for v in svgs):
            fails.append(u'空白那幅里出现了 svg（%s）—— 它**必须始终空白**，什么都不许画上去'
                         % svgs)

    return (fails, u'五抹色 5 句台词各异、出处合法、完成提示只弹一次、两幅画递进/空白都对'
            if not fails else u'调色盘或两幅画的行为不对')


# ══ 格蕾修：小游戏「上色」的**玩法专属**断言（Task 5）═══════════════════
#   照 `check_sakura_judgment` / `check_kosma_judgment` 的模式。四条玩法 +
#   一条结算，**每条都配变异**（见 task-5-report.md）。
#
#   ⚠ 玩法状态是 IIFE 私有的，只能靠模块自带的「诊断口」`ElysiaGames.griseo._test`
#     （R36 裁决保留）来驱动 / 读取；而**判据**（数格 / 找相邻格）一律在 **Python 侧**
#     从 `_test.dump()` 的字符图里算 —— 免得「自己证自己」。
#
#   ⚠ `GR_BRUSH_UP` 与 griseo.js 里那个常量**同值同义**（笔尖在手指上方 44 个**屏幕** px）：
#     把「想落笔的格」换算成「手指该按的屏幕点」时要把它加回去，否则笔尖会落到目标格**上方**。
GR_BRUSH_UP = 44
GR_CELL = 12          # 与 griseo.js 的 CELL 同值


def _gr_state(b):
    """读诊断口 state（kills / stage / cols / rows / enemyCount / speedTier…）。"""
    return b.jso("""(() => {
        var g = window.ElysiaGames && window.ElysiaGames.griseo;
        return (g && g._test) ? JSON.stringify(g._test.state()) : null;
    })()""")


def _gr_test(b, call):
    """调 `_test` 上的一个方法并把它的 JSON 结果取回来（call 里用 `g._test`）。"""
    return b.jso("""(() => {
        var g = window.ElysiaGames && window.ElysiaGames.griseo;
        if (!g || !g._test) return null;
        return JSON.stringify(%s);
    })()""" % call)


def _gr_dump(b):
    """把 grid 打成字符图（`. H S E s`）—— 计数 / 找格都在 Python 侧算。"""
    return b.js("""(() => {
        var g = window.ElysiaGames && window.ElysiaGames.griseo;
        return (g && g._test) ? g._test.dump() : null;
    })()""")


def _gr_count(dump, ch):
    return dump.count(ch) if dump else 0


def _gr_canvas_geom(b):
    """遮罩里画布的屏幕矩形 + 固有像素尺寸（换算「该按哪个屏幕点」用）。"""
    return b.jso("""(() => {
        var c = document.querySelector('#griseoGameOverlay .gr-canvas');
        if (!c) return null;
        var r = c.getBoundingClientRect();
        return JSON.stringify({ l: r.left, t: r.top, w: r.width, h: r.height,
                                iw: c.width, ih: c.height, vw: innerWidth, vh: innerHeight });
    })()""")


def _gr_open_overlay(b):
    """重载 → 点「开始」→ 确认遮罩开着且诊断口可读。返回前提是否成立。"""
    _reset(b)
    if not _click_sel(b, '.bottom-game .game-card-start'):
        return False
    time.sleep(0.45)
    return _gr_state(b) is not None and _g_open(b, GAMES[GRISEO])


def _gr_cell_screen(g, cx, cy):
    """格 (cx,cy) 的中心 → 手指该按的**屏幕点**（把 BRUSH_UP 加回去）。"""
    px = (cx + 0.5) * GR_CELL
    py = (cy + 0.5) * GR_CELL
    x = g['l'] + px * g['w'] / g['iw']
    y = g['t'] + GR_BRUSH_UP + py * g['h'] / g['ih']
    return x, y


def _gr_in_view(g, x, y):
    """视口外的点派发事件会**静默无操作**（HANDOVER §6.4）—— 先挡一道。"""
    return (x > 0) and (x < g['vw']) and (y > 0) and (y < g['vh'])


def _gr_touch_drag(b, pts):
    """**真触摸**拖动（touchStart → 一连串 touchMove → touchEnd）。

    ⚠ 用真触摸而不是鼠标：spec §5.2 要验的正是「**拖动时页面没有滚动**」——
      鼠标拖动本来就不会滚，验不出东西。触摸坐标要减 `_vv_offset`（移动端模拟下不为 0）。
    """
    if not pts:
        return False
    o = _vv_offset(b)
    def tp(x, y):
        return {'x': x - o['x'], 'y': y - o['y']}
    p0 = pts[0]
    b._send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [tp(p0[0], p0[1])]})
    time.sleep(0.05)
    for p in pts[1:]:
        b._send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [tp(p[0], p[1])]})
        time.sleep(0.03)
    b._send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    return True


def _gr_empty_next_to_stroke(dump):
    """字符图里找一个「本身是 `.` 且四邻有 `S`」的格 → (x,y)；找不到返回 None。"""
    if not dump:
        return None
    rows = dump.split('\n')
    h = len(rows)
    w = len(rows[0]) if h else 0
    for y in range(h):
        for x in range(w):
            if rows[y][x] != '.':
                continue
            for (dx, dy) in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and rows[ny][nx] == 'S':
                    return (x, y)
    return None


@check
@griseo_only
def check_griseo_drag_colors(b, page, expected):
    """① 真触摸在画布上拖一个「**棒棒糖**」（出门 → 绕一圈 → **顺原路回来**）→
    **圈里真的被填**（C1 的靶子），**且拖动时页面没有滚动**（spec §5.2）。

    ⚠ 这个形状整条笔触是**一个分量、自由端只有笔尖那格**（ends==1）。
      旧实现把这种分量整个丢掉 ⇒ **只把笔触染成色、圈里还是纸白**，
      而它见 newCells>0 照样报「围住啦」—— **谎报成功**（C1）。
    ⚠ 判据必须盯**圈内部**，不能只看「领地涨了 ≥30」（那只染笔触时也照样成立 —— 假绿，
      旧断言正是栽在这里）。这里数的是「圈内芯 x22..26 × y7..9 里的 H」。
    """
    if not _gr_open_overlay(b):
        return ([u'点不到 / 打不开「开始」—— 前提不成立'], u'—')
    fails = []
    g = _gr_canvas_geom(b)
    if not g:
        return ([u'取不到遮罩里画布的几何 —— 前提不成立'], u'—')
    # 滚到页面中间（保证有滚动余地），记住 scrollY —— 验「拖动不滚页」用
    # ⚠ 站点有 `scroll-behavior:smooth`，必须用 `behavior:'instant'`，否则读出的是动画中途值
    b.js("try { window.scrollTo({ top: 2000, behavior: 'instant' }); } catch (e) {}")
    time.sleep(0.3)
    sy0 = b.js("window.scrollY")

    way = [(24, 14), (24, 10), (28, 10), (28, 6), (20, 6), (20, 10), (24, 10), (24, 14)]
    pts = [_gr_cell_screen(g, cx, cy) for (cx, cy) in way]
    if not _gr_in_view(g, pts[0][0], pts[0][1]):
        return ([u'起点 (%.0f,%.0f) 不在视口内（vw=%d vh=%d）—— 派发会静默点空'
                 % (pts[0][0], pts[0][1], g['vw'], g['vh'])], u'—')
    _gr_touch_drag(b, pts)
    sy1 = b.js("window.scrollY")
    if sy0 != sy1:
        fails.append(u'在画布上拖动后页面滚了（scrollY %s → %s）—— 手势冲突（spec §5.2）'
                     % (sy0, sy1))
    time.sleep(1.2)                          # 等回填 + 晕染动画落定

    dump = _gr_dump(b)
    rows = (dump or u'').split('\n')
    inner = 0
    for y in range(7, 10):                   # 环 x20..28 × y6..10 的内芯（保守：抗 ±1 格落点误差）
        for x in range(22, 27):
            if y < len(rows) and x < len(rows[y]) and rows[y][x] == 'H':
                inner += 1
    total_h = _gr_count(dump, 'H')
    if inner < 6:
        fails.append(u'「棒棒糖」拖完，圈里只填了 %d 格（该 ~15）—— '
                     u'原路返回的圈**没被填内部**（C1：分量被丢 ⇒ 只染笔触）' % inner)
    if total_h < 20:
        fails.append(u'拖完整块领地只有 %d 格（该显著 > 9）—— 这一笔根本没上色' % total_h)
    return (fails, u'棒棒糖拖完圈里填了 %d 格（领地共 %d）、且没滚页' % (inner, total_h)
            if not fails else u'原路返回的圈没填内部 / 或拖动滚了页')


@check
@griseo_only
def check_griseo_collision_breaks_stroke(b, page, expected):
    """② 造物笔触挨上玩家笔触 → **玩家笔触整条断**（可证伪：相交的那一步）。

    判据：拖动中笔触格 `S` > 0；让造物在**紧挨某个 S 的空格**落一格 → `S` 归零。
    ⚠ 拖在远离造物（左上角）的空地上，避免造物 AI 自己先撞上来污染读数。
    """
    if not _gr_open_overlay(b):
        return ([u'点不到 / 打不开「开始」—— 前提不成立'], u'—')
    fails = []
    g = _gr_canvas_geom(b)
    if not g:
        return ([u'取不到画布几何'], u'—')
    line = [(30, 26), (36, 26)]
    sx, sy = _gr_cell_screen(g, line[0][0], line[0][1])
    if not _gr_in_view(g, sx, sy):
        return ([u'起点不在视口内 —— 会静默点空'], u'—')
    b.press(sx, sy)                          # 按住不放：要的就是「拖到一半被撞」
    time.sleep(0.05)
    for (cx, cy) in line[1:]:
        mx, my = _gr_cell_screen(g, cx, cy)
        b.move(mx, my)
        time.sleep(0.03)
    time.sleep(0.15)
    dump0 = _gr_dump(b)
    s0 = _gr_count(dump0, 'S')
    if s0 <= 0:
        b.release(sx, sy)
        return ([u'拖了却没画出玩家笔触（S=0）—— 前提不成立'], u'—')
    target = _gr_empty_next_to_stroke(dump0)
    if target is None:
        b.release(sx, sy)
        return ([u'找不到与玩家笔触相邻的空格 —— 造不出碰撞局面'], u'—')
    _gr_test(b, "g._test.enemyStepTo(0, %d, %d)" % (target[0], target[1]))
    time.sleep(0.2)
    s1 = _gr_count(_gr_dump(b), 'S')
    b.release(sx, sy)
    if s1 != 0:
        fails.append(u'造物笔触挨上玩家笔触，玩家笔触却还剩 %d 格（S %d → %d）—— '
                     u'「被撞 → 笔触断」没生效' % (s1, s0, s1))
    return (fails, u'被撞后玩家笔触全断（S %d → 0）' % s0
            if not fails else u'碰撞没断笔触')


@check
@griseo_only
def check_griseo_difficulty_scales(b, page, expected):
    """③ 玩家领地变大 → 造物**数量 / 速度档真的变了**（分档 + 封顶）。"""
    _reset(b)
    st0 = _gr_state(b) or {}
    if 'enemyCount' not in st0:
        return ([u'读不到 _test.state —— 模块没挂上？'], u'—')
    fails = []
    _gr_test(b, "g._test.setPlayerRatio(0.5)")
    time.sleep(0.1)
    st1 = _gr_state(b) or {}
    if not (st1.get('enemyCount', 0) > st0.get('enemyCount', 0)):
        fails.append(u'占比 0.006 → 0.5，造物数量却没变（%s → %s）—— 难度没随领地走'
                     % (st0.get('enemyCount'), st1.get('enemyCount')))
    if not (st1.get('speedTier', 0) > st0.get('speedTier', 0)):
        fails.append(u'占比 0.006 → 0.5，速度档却没升（%s → %s）'
                     % (st0.get('speedTier'), st1.get('speedTier')))
    return (fails, u'领地变大 ⇒ 造物 %s→%s、速度档 %s→%s'
            % (st0.get('enemyCount'), st1.get('enemyCount'),
               st0.get('speedTier'), st1.get('speedTier'))
            if not fails else u'难度没随领地变')


@check
@griseo_only
def check_griseo_kill_expands_canvas(b, page, expected):
    """④ 累计杀掉 2 个 → **画布真的扩张**（cols/rows 变大），内容跟着搬。"""
    _reset(b)
    st0 = _gr_state(b) or {}
    if 'cols' not in st0:
        return ([u'读不到 _test.state'], u'—')
    fails = []
    _gr_test(b, "g._test.setPlayerRatio(0.5)")       # 先弄出 3 只造物
    time.sleep(0.1)
    cols0, rows0 = st0.get('cols'), st0.get('rows')
    _gr_test(b, "g._test.encloseEnemy(0)")           # 围死第 1 只
    r1 = _gr_test(b, "g._test.resolveKills()") or {}
    _gr_test(b, "g._test.encloseEnemy(0)")           # 围死第 2 只
    r2 = _gr_test(b, "g._test.resolveKills()") or {}
    s2 = r2.get('state') or {}
    if r1.get('captured', 0) < 1:
        fails.append(u'套墙后第一只没被吃掉（captured=%s）—— 击杀机制没生效'
                     % r1.get('captured'))
    if s2.get('kills', 0) < 2:
        fails.append(u'连杀两只后 kills=%s（该 ≥2）' % s2.get('kills'))
    if not (s2.get('cols', 0) > cols0 and s2.get('rows', 0) > rows0):
        fails.append(u'连杀 2 只后画布没扩张（%s×%s → %s×%s）'
                     % (cols0, rows0, s2.get('cols'), s2.get('rows')))
    return (fails, u'杀 2 只 ⇒ 画布 %s×%s → %s×%s、stage=%s'
            % (cols0, rows0, s2.get('cols'), s2.get('rows'), s2.get('stage'))
            if not fails else u'击杀没触发扩张')


@check
@griseo_only
def check_griseo_settlement(b, page, expected):
    """⑤ 到点 → 结算面板显示（完成度 / 击杀 / 最高纪录），且**这一次真的把纪录写进去了**。

    ⚠ M2 修：老写法只验「localStorage 里有值」，而 `_reset()` **不清** `griseoColorBest`，
      ⇒ 上一次跑留下的值也能让断言变绿（**本项目最怕的假绿**）。
      现在：**开跑前先 removeItem** 该键（页面重载后 in-memory `best` 也随之归 0），
      结算后再**把读回来的值与面板上的完成度逐位比** —— 才算「这一次写进去的」。
    """
    # 先清掉旧纪录 —— 否则「读到值」可能只是上一次的残留（假绿）
    b.js("try { window.localStorage.removeItem('griseoColorBest'); } catch (e) {}")
    if not _gr_open_overlay(b):
        return ([u'点不到 / 打不开「开始」—— 前提不成立'], u'—')
    fails = []
    hidden0 = b.js("(() => { var r = document.querySelector('#griseoGameOverlay .gr-result');"
                   " return r ? r.classList.contains('on') : null; })()")
    if hidden0 is not False:
        fails.append(u'还没到点，结算面板就显示着了（on=%r）' % hidden0)
    # 把剩余时间压到很近，让**真实主循环**把它跑到 0 —— 走的就是「到点」那条路。
    _gr_test(b, "g._test.setLeft(200)")
    shown, txt = False, u''
    for _ in range(16):
        time.sleep(0.25)
        d = b.jso("""(() => { var r = document.querySelector('#griseoGameOverlay .gr-result');
            var t = document.querySelector('#griseoGameOverlay .gr-result-body');
            return JSON.stringify({ on: r ? r.classList.contains('on') : null,
                                    text: t ? t.textContent : null }); })()""") or {}
        if d.get('on'):
            shown = True
            txt = d.get('text') or u''
            for key in (u'完成度', u'击杀', u'最高纪录'):
                if key not in txt:
                    fails.append(u'结算面板文字里没有「%s」：%r' % (key, txt))
            break
    if not shown:
        fails.append(u'把剩余时间压到 0.2 秒后，等了 4 秒结算面板也没出现 —— '
                     u'「到点结算」没生效')

    # ── 最高纪录：必须与**这一局**的完成度一致（才算「这次写的」）──
    best = None
    try:
        best = b.js("(() => { try { return window.localStorage.getItem('griseoColorBest'); }"
                    " catch (e) { return 'ERR'; } })()")
    except Exception:
        best = None
    if best in (None, 'ERR'):
        fails.append(u'结算后读不到最高纪录（localStorage 的 griseoColorBest）—— '
                     u'读或写有问题')
    else:
        m = re.search(r'完成度\s*([0-9]+(?:\.[0-9]+)?)\s*%', txt or u'')
        try:
            stored = float(best)
        except Exception:
            stored = None
        if m is None:
            fails.append(u'结算面板里没解析出「完成度 X%」（文字：%r）' % txt)
        elif stored is None or abs(stored - float(m.group(1))) > 0.11:
            fails.append(u'最高纪录 %s 与这一局的完成度 %s%% 对不上 —— '
                         u'写进去的可能不是这一局的成绩（假绿）' % (best, m.group(1)))
    return (fails, u'到点弹结算（完成度 / 击杀 / 最高纪录）+ 最高纪录=本局成绩'
            if not fails else u'结算不对')


def _gr_msg(b):
    """读遮罩里的提示行文字（`.gr-msg`）。"""
    return b.js("(() => { var m = document.querySelector('#griseoGameOverlay .gr-msg');"
                " return m ? m.textContent : null; })()")


@check
@griseo_only
def check_griseo_no_enclosure_message(b, page, expected):
    """⑥ C1 的「诚实文案」那一半：**没围住任何内部时，不许说「围住啦」**。

    靶子：出门再**顺原路回来**画一条线（没有环 ⇒ 圈不出任何内部空白）。
    旧逻辑见 `newCells>0` 就报「围住啦」——**谎报成功**；新逻辑按
    `fillEnclosed` 的 `interior` 选文案 ⇒ 该说「这一笔没有围住什么」。
    """
    if not _gr_open_overlay(b):
        return ([u'点不到 / 打不开「开始」—— 前提不成立'], u'—')
    g = _gr_canvas_geom(b)
    if not g:
        return ([u'取不到画布几何'], u'—')
    # 出 (24,14) → 到 (24,10) → **顺原路**回到 (24,14)：一条「去而复返」的线，无环
    way = [(24, 14), (24, 10), (24, 14)]
    pts = [_gr_cell_screen(g, cx, cy) for (cx, cy) in way]
    if not _gr_in_view(g, pts[0][0], pts[0][1]):
        return ([u'起点不在视口内 —— 会静默点空'], u'—')
    _gr_touch_drag(b, pts)
    time.sleep(0.6)
    msg = _gr_msg(b) or u''
    fails = []
    if u'围住啦' in msg:
        fails.append(u'这一笔没围出任何内部，却报了「围住啦」（实际文案：%r）—— '
                     u'谎报成功（C1 的文案那一半没修）' % msg)
    if u'没有围住' not in msg:
        fails.append(u'没围住时该说「这一笔没有围住什么……」（实际：%r）' % msg)
    return (fails, u'没围住时文案诚实（%r）' % msg if not fails else u'文案在谎报')


def _gr_key(b, key, code, vk):
    """派发一次真实 keydown（spec §5.2 的键盘备选）。"""
    b._send('Input.dispatchKeyEvent', {
        'type': 'keyDown', 'key': key, 'code': code,
        'windowsVirtualKeyCode': vk, 'nativeVirtualKeyCode': vk})


@check
@griseo_only
def check_griseo_keyboard_draws(b, page, expected):
    """⑦ 键盘备选（spec §5.2）：**方向键挪笔尖（真的落笔触）**、**空格当松手**。

    ⚠ 这是 spec 明文要求的备选操作，此前**一根方向键都没有**（复审 I1）。
    """
    if not _gr_open_overlay(b):
        return ([u'点不到 / 打不开「开始」—— 前提不成立'], u'—')
    fails = []
    b.js("if (document.activeElement) document.activeElement.blur();")   # 焦点别停在（遮罩外的）「开始」上
    for _ in range(3):
        _gr_key(b, 'ArrowLeft', 'ArrowLeft', 37)
        time.sleep(0.06)
    time.sleep(0.2)
    s = _gr_count(_gr_dump(b), 'S')
    if s < 3:
        fails.append(u'连按 3 次方向键，画布上只有 %d 格玩家笔触（该 ≥3）—— '
                     u'方向键没在挪笔尖 / 没落笔' % s)
    _gr_key(b, ' ', 'Space', 32)          # 空格 = 松手
    time.sleep(0.6)
    s2 = _gr_count(_gr_dump(b), 'S')
    if s2 != 0:
        fails.append(u'按了空格（松手）后还剩 %d 格笔触（该归零）—— 空格没当松手' % s2)
    return (fails, u'方向键画了 %d 格笔触、空格松手归零' % s
            if not fails else u'键盘备选没生效')


@check
@griseo_only
def check_griseo_keyboard_button_and_play(b, page, expected):
    """⑧ N1 回归：遮罩开着时，落在**按钮**上的 Enter/Space **不许被吞**
    （Tab 聚焦「收笔」+ Enter/Space 要能激活它），且**方向键玩法仍在**。

    ⚠ 复核 A/B 实测：旧码聚焦「收笔」按 Enter 关不掉（`defaultPrevented=true`）——
      键盘备选把按钮的基本操作吃掉了。`check_aria_labels` 不覆盖键盘激活 ⇒ 这条专门守它。
    """
    if not _gr_open_overlay(b):
        return ([u'点不到 / 打不开「开始」—— 前提不成立'], u'—')
    fails = []

    def prevented(key, code, vk):
        if not _g_open(b, GAMES[GRISEO]):
            _click_sel(b, '.bottom-game .game-card-start'); time.sleep(0.45)
        # 页内挂一枚**一次性**监听，记「收笔」上这次 keydown 有没有被 preventDefault。
        # ⚠ 必须在 `setTimeout(0)` 里读 `e.defaultPrevented` —— 游戏的 `preventDefault`
        #   发生在**document 冒泡阶段**，而本监听挂在按钮（target 阶段，先跑）上；
        #   同步读会永远是 false（假绿），异步读才看得到最终结果。
        b.js("""(() => { window.__pd = null;
            var btn = document.querySelector('#griseoGameOverlay .gr-close');
            btn.addEventListener('keydown', function h(e) {
                setTimeout(function () { window.__pd = e.defaultPrevented; }, 0);
                btn.removeEventListener('keydown', h); }, false);
            return 1; })()""")
        b.js("var b=document.querySelector('#griseoGameOverlay .gr-close'); if (b) b.focus();")
        _gr_key(b, key, code, vk)
        time.sleep(0.3)
        return b.js("window.__pd")

    pv_enter = prevented('Enter', 'Enter', 13)
    pv_space = prevented(' ', 'Space', 32)
    if pv_enter is not False:
        fails.append(u'聚焦「收笔」后按 Enter 被吞了（defaultPrevented=%r）—— '
                     u'Tab 聚焦 + Enter 激活不了按钮（N1 可访问性回归）' % pv_enter)
    if pv_space is not False:
        fails.append(u'聚焦「收笔」后按 Space 被吞了（defaultPrevented=%r）' % pv_space)

    # 键盘**玩法**不能被这次修复顺手关掉：焦点移开控件，方向键该画得出笔触
    if not _g_open(b, GAMES[GRISEO]):
        _click_sel(b, '.bottom-game .game-card-start'); time.sleep(0.45)
    b.js("if (document.activeElement) document.activeElement.blur();")
    _gr_key(b, 'ArrowLeft', 'ArrowLeft', 37); time.sleep(0.05)
    _gr_key(b, 'ArrowLeft', 'ArrowLeft', 37); time.sleep(0.25)
    s = _gr_count(_gr_dump(b), 'S')
    if s <= 0:
        fails.append(u'方向键画不出笔触（S=%d）—— 键盘备选被关掉了' % s)
    return (fails, u'按钮上的 Enter/Space 不被吞（%r/%r）+ 方向键仍能画（S=%d）'
            % (pv_enter, pv_space, s) if not fails else u'键盘处理不对')


# ── 真·触摸（不是鼠标）────────────────────────────────────────────────
def _vv_offset(b):
    """派发输入坐标前要减掉的那个偏移（**只在 mobile 模拟下不为 0**）。

    ⚠ 2026-10-02 实测，这是本条断言最要紧的一块知识：
      `Emulation.setDeviceMetricsOverride(mobile:true)` 会让**布局视口 ≠ 视觉视口**。
      以 320×568 那一档为例：`innerHeight` 631、`visualViewport.height` 568、
      `visualViewport.offsetTop` **63**。
      而 CDP 的 `Input.*` 坐标走**视觉视口**，页面里 `getBoundingClientRect()`
      给的却是**布局视口** —— 于是「照着 rect 派发」会**统一偏低 offsetTop 像素**：

          照着按钮中心 (160, 504) 派发 → 事件落到 clientY=566 的 `sakura-12` 上（遮罩不开）
          减掉 63 → clientY=503，命中的才是 `BUTTON.game-card-start` ✓

    ⚠ 默认视口（不设 mobile）下 offsetTop 恒为 0，所以**老断言不受影响**。
      但**任何将来要在手机视口上点/摸东西的断言，都必须先减这个偏移** ——
      否则它会「点到了别的东西」，而且**不报错**（点空/点偏都是静默的）。
    """
    d = b.jso("(() => { var v = window.visualViewport;"
              " return JSON.stringify({ x: v ? v.offsetLeft : 0, y: v ? v.offsetTop : 0 }); })()")
    return d or {'x': 0, 'y': 0}


def _touch_pt(b, x, y):
    """派发一次**真的触摸**（`touchStart` + `touchEnd`，中间不移动）。

    ⚠ 传进来的 x/y 是**布局视口**坐标（照 `getBoundingClientRect()` 量的），
      这里负责换算成 CDP 要的**视觉视口**坐标 —— 见 `_vv_offset`。
    """
    o = _vv_offset(b)
    x, y = x - o['x'], y - o['y']
    b._send('Input.dispatchTouchEvent',
            {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    time.sleep(0.05)
    b._send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})


def _touch_tap_sel(b, sel):
    """滚进视口 → 用**真触摸**点它的中心。"""
    c = b.jso("""(() => {
        var n = document.querySelector('%s');
        if (!n) return null;
        n.scrollIntoView({ block: 'center', behavior: 'instant' });
        var r = n.getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()""" % sel)
    if not c:
        return False
    _touch_pt(b, c['x'], c['y'])
    return True


def _touch_tap_at(b, sel):
    """按选择器取中心 → 真触摸点它，**不滚动**（`fixed` 遮罩里的东西用它）。

    ⚠ `_touch_tap_sel` 会先 `scrollIntoView` —— 对 `position:fixed` 的元素没意义，
      还可能把背后的页面滚到别处。遮罩里的东西用这个。
    """
    c = b.jso("""(() => {
        var n = document.querySelector('%s');
        if (!n) return null;
        var r = n.getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()""" % sel)
    if not c:
        return False
    _touch_pt(b, c['x'], c['y'])
    return True


# ── 主流程 ────────────────────────────────────────────────────────────
def main():
    raw = sys.argv[1:]
    mode = 'reduced' if '--reduced' in raw else 'normal'

    # ⚠ `--only <名字片段>`：**只跑**名字里含这个片段的断言。
    #   为什么需要它：变异测试（「证明断言抓得到错」）要把同一条断言跑很多遍，
    #   而整轮要两分钟 —— 跑五次就是十分钟，而变异测试是每个任务的标准动作。
    #   ⚠ 报告里**必须写明这是筛过的**：一次筛过的运行长得和全量通过一模一样，
    #     那正是这个工具最想防的那种谎（「看起来在守、其实守不住」）。
    only = None
    if '--only' in raw:
        i = raw.index('--only')
        if i + 1 >= len(raw):
            print(u'--only 后面要跟一个名字片段')
            return 1
        only = raw[i + 1]
        raw = raw[:i] + raw[i + 2:]
    if only and not any(only in f.__name__ for f in CHECKS):
        print(u'❌ 没有哪条断言的名字里含 %r —— 筛口写错了？' % only)
        return 1

    args = [a for a in raw if not a.startswith('--')]
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

    print(u'\U0001f50d 探索系统断言 —— %s%s'
          % (page, u'（减动模式）' if mode == 'reduced' else u''))
    if only:
        print(u'   ⚠ **只跑**了名字含 %r 的断言（`--only`）—— 这不是一次全量验收'
              % only)
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
    ordered = []
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
        # ⚠ Log 域也要开，**同样必须在导航之前**。
        #   原因见 check_page_quiet：**资源 404 根本不走 Runtime** ——
        #   它只在 Log 域里冒一条 `source:network / level:error`。
        #   不开这个域，把整个脚本文件挪走这类失败，那条断言**照样通过**。
        b._send('Log.enable')
        b._send('Page.navigate', {
            'url': 'http://127.0.0.1:%d/%s?cb=%d' % (PORT, page, time.time() * 1000)})
        time.sleep(2.0)

        # ⚠ 「页面无报错」那条**必须跑在最后**：它读的是整轮攒下来的事件，
        #   提前跑就会漏掉后面手势测试里抛的异常 —— 而手势恰恰最容易抛异常。
        # ⚠ 两个维度都要过：模式（normal/reduced）与**适用页**。
        #   写死了探针页 id 的断言不该在别的页上跑 —— 否则真问题会被
        #   一堆「与本页无关」的失败淹掉。
        pool = [f for f in CHECKS
                if mode in getattr(f, 'modes', ('normal',))
                and ('*' in f.pages or page in f.pages)]
        if only:
            pool = [f for f in pool if only in f.__name__]
        skipped = len(CHECKS) - len(pool)
        if skipped:
            print(u'（本页跳过 %d 条只适用于其他页的断言）' % skipped)
            print()
        ordered = [f for f in pool if f is not check_page_quiet]
        if check_page_quiet in pool:
            ordered.append(check_page_quiet)

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
    if only:
        print(u'\u2705 全部通过：%d 组断言（`--only` 筛过的，**不是全量**）' % len(ordered))
    else:
        print(u'\u2705 全部通过：%d 组断言' % len(ordered))
    return 0


if __name__ == '__main__':
    sys.exit(main())
