# -*- coding: utf-8 -*-
"""tools/check_page_health.py — 逐页「体检」：控制台 / 404 / 图片 / 无障碍 / 体积。

**为什么需要它**（2026-10-15 从 0 重盘时写的）：
现有工具各自只管一件事 —— `check_explore` 管探索与游戏、`check_aria_labels` 管语录卡
aria、`check_reduced_motion` 管减动、`snapshot` 管「和上一次比变了没有」。
**但没有人管「这一页现在是不是健康的」**：
  · 有没有 console 报错？有没有资源 404（一个错字就静默少一张图）？
  · 有没有 `img` 破了（图挂了但页面不报错）、`alt` 空着？
  · 有没有按钮/链接**没有可读名字**（屏幕阅读器只会念「按钮」）？
  · 访客实际要下多少 KB？几个请求？
这些正是「逐页精修」每一轮都要看的数。所以有了这把尺子。

跑法（⚠ 要先起静态服务器，默认复用 8500）：
    PYTHONIOENCODING=utf-8 python tools/check_page_health.py            # 全部页面
    PYTHONIOENCODING=utf-8 python tools/check_page_health.py hua/index.html
    PYTHONIOENCODING=utf-8 python tools/check_page_health.py --json > tmp/health.json

退出码：0 = 全部页面无 FAIL 级问题；1 = 有（WARN 不算）。
⚠ 它只用调试端口 **9324**，与其它工具（9320/9321/9322/9323）不冲突；
   同一个 Edge 实例跑完所有页面（**关缓存**），比每页起一个浏览器快得多。
"""
import http.server
import json
import os
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from functools import partial

import websocket

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8500                     # 复用常驻的静态服务器（没起的话本脚本会提示）
DBG = 9324
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

PAGES = [
    'index.html', 'armor.html', '404.html',
    'kevin/index.html', 'aponia/index.html', 'eden/index.html', 'villv/index.html',
    'kalpas/index.html', 'su/index.html', 'sakura/index.html', 'kosma/index.html',
    'mobius/index.html', 'griseo/index.html', 'hua/index.html', 'pardofelis/index.html',
    'guestbook/index.html',
]

# 页面里要采集的东西（一次性 evaluate）
PROBE = r"""(() => {
    var out = {};
    var q = function (s) { return document.querySelector(s); };
    out.title = document.title || '';
    var d = q('meta[name="description"]');
    out.desc = d ? (d.getAttribute('content') || '') : null;
    out.canonical = q('link[rel="canonical"]') ? q('link[rel="canonical"]').href : null;
    var ogi = q('meta[property="og:image"]');
    out.ogImage = ogi ? ogi.getAttribute('content') : null;
    out.lang = document.documentElement.getAttribute('lang');
    out.h1 = document.querySelectorAll('h1').length;
    // 破图：naturalWidth 为 0 的 img（图挂了页面不报错）
    out.brokenImgs = [].slice.call(document.images)
        .filter(function (i) { return i.complete && i.naturalWidth === 0; })
        .map(function (i) { return i.currentSrc || i.src; }).slice(0, 5);
    // 缺 alt（装饰性 alt="" 是合法的，只抓**没有 alt 属性**的）
    out.noAlt = [].slice.call(document.images)
        .filter(function (i) { return !i.hasAttribute('alt'); })
        .map(function (i) { return i.currentSrc || i.src; }).slice(0, 5);
    // 没有可读名字的控件：按钮/链接/role=button 的文字+aria 都空
    var named = function (n) {
        return ((n.getAttribute('aria-label') || '') + (n.getAttribute('title') || '')
            + (n.textContent || '')).trim().length > 0
            || !!n.querySelector('img[alt]:not([alt=""])');
    };
    out.unnamed = [].slice.call(document.querySelectorAll('button, a[href], [role="button"]'))
        .filter(function (n) { return !named(n); })
        .map(function (n) { return n.tagName + (n.id ? '#' + n.id : '') + '.' + (n.className || '').split(' ')[0]; })
        .slice(0, 5);
    // role=button 但没有键盘可达性
    out.roleNoTab = [].slice.call(document.querySelectorAll('[role="button"]'))
        .filter(function (n) { return n.tabIndex < 0; })
        .map(function (n) { return (n.id || n.className || n.tagName); }).slice(0, 5);
    out.docH = Math.round(document.documentElement.scrollHeight);
    // 体积：用 Performance API 的真实传输量
    var res = performance.getEntriesByType('resource');
    out.resCount = res.length;
    out.xfer = res.reduce(function (s, r) { return s + (r.transferSize || 0); }, 0);
    out.big = res.filter(function (r) { return (r.transferSize || 0) > 80 * 1024; })
        .map(function (r) { return r.name.split('/').pop() + '=' + Math.round(r.transferSize / 1024) + 'KB'; }).slice(0, 5);
    var nav = performance.getEntriesByType('navigation')[0] || {};
    out.dcl = Math.round(nav.domContentLoadedEventEnd || 0);
    out.load = Math.round(nav.loadEventEnd || 0);
    out.htmlBytes = (nav.transferSize || 0);
    return JSON.stringify(out);
})()"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class Browser:
    def __init__(self, ws):
        self.ws = ws
        self._id = 0
        self.events = []

    def send(self, method, params=None):
        self._id += 1
        self.ws.send(json.dumps({'id': self._id, 'method': method, 'params': params or {}}))
        while True:
            r = json.loads(self.ws.recv())
            if r.get('id') == self._id:
                return r

    def drain(self):
        """把已经排队的通知事件收进来（用于 404 / console）。"""
        self.ws.settimeout(0.25)
        try:
            while True:
                self.events.append(json.loads(self.ws.recv()))
        except Exception:
            pass
        finally:
            self.ws.settimeout(None)

    def js(self, expr):
        r = self.send('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True})
        res = r.get('result', {})
        if res.get('exceptionDetails'):
            return None
        return res.get('result', {}).get('value')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    as_json = '--json' in sys.argv
    pages = args or PAGES

    # 静态服务器：能连上就用别人的（常驻 8500），连不上自己起一个
    own = None
    try:
        urllib.request.urlopen('http://127.0.0.1:%d/assets/site.js' % PORT, timeout=3).read()
    except Exception:
        handler = partial(Quiet, directory=ROOT)
        httpd = socketserver.TCPServer(('127.0.0.1', PORT), handler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        own = httpd
        print('（自己起了 %d 的静态服务器）' % PORT)

    profile = tempfile.mkdtemp(prefix='edge_health_')
    proc = subprocess.Popen([
        EDGE, '--remote-debugging-port=%d' % DBG, '--headless=new', '--disable-gpu',
        '--no-first-run', '--remote-allow-origins=*',
        '--user-data-dir=' + profile, '--window-size=1280,900', 'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    rows, fails = [], []
    try:
        targets = []
        for _ in range(20):
            try:
                targets = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json' % DBG))
                break
            except Exception:
                time.sleep(0.5)
        ws_url = next(t['webSocketDebuggerUrl'] for t in targets if t.get('type') == 'page')
        b = Browser(websocket.create_connection(ws_url, suppress_origin=True, timeout=60))
        b.send('Page.enable')
        b.send('Runtime.enable')
        b.send('Log.enable')              # 资源 404 只走 Log 域
        b.send('Network.enable')
        b.send('Network.setCacheDisabled', {'cacheDisabled': True})

        for page in pages:
            b.events = []
            url = 'http://127.0.0.1:%d/%s?cb=%d' % (PORT, page, time.time() * 1000)
            b.send('Page.navigate', {'url': url})
            time.sleep(2.2)
            d = b.js(PROBE)
            b.drain()
            cons, bad, reqs = [], [], []
            for e in b.events:
                m = e.get('method')
                if m == 'Runtime.consoleAPICalled' and e['params'].get('type') == 'error':
                    cons.append(str(e['params'].get('args', [{}])[0].get('value', ''))[:80])
                elif m == 'Log.entryAdded':
                    p = e['params']['entry']
                    if p.get('source') == 'network' or p.get('level') == 'error':
                        bad.append((p.get('level'), (p.get('text') or '')[:90], (p.get('url') or '')[-60:]))
                elif m == 'Network.responseReceived':
                    st = e['params']['response'].get('status', 0)
                    u = e['params']['response'].get('url', '')
                    if st >= 400:
                        reqs.append('%d %s' % (st, u.split('/')[-1]))
                elif m == 'Network.loadingFailed':
                    reqs.append('FAIL ' + (e['params'].get('errorText') or ''))
            if d is None:
                fails.append(u'%s：取不到页面数据' % page)
                continue
            d = json.loads(d)
            problems = []
            if cons:
                problems.append('console.error ×%d: %s' % (len(cons), cons[0]))
            if bad:
                problems.append('日志错误 ×%d: %s %s' % (len(bad), bad[0][1], bad[0][2]))
            if reqs:
                problems.append('请求失败: ' + ', '.join(reqs[:3]))
            if d['brokenImgs']:
                problems.append('破图 ×%d: %s' % (len(d['brokenImgs']), d['brokenImgs'][0]))
            if d['noAlt']:
                problems.append('img 没有 alt 属性 ×%d: %s' % (len(d['noAlt']), d['noAlt'][0]))
            if d['unnamed']:
                problems.append('控件没有可读名字 ×%d: %s' % (len(d['unnamed']), ', '.join(d['unnamed'][:2])))
            if d['roleNoTab']:
                problems.append('role=button 但不可键盘聚焦 ×%d: %s' % (len(d['roleNoTab']), ', '.join(d['roleNoTab'][:2])))
            if d['h1'] != 1:
                problems.append('h1 数量 = %d（该恰好 1 个）' % d['h1'])
            if not d['desc']:
                problems.append('没有 meta description')
            if not d['canonical']:
                problems.append('没有 canonical')
            if not d['lang']:
                problems.append('html 没有 lang')
            if page != '404.html' and not d['ogImage']:
                problems.append('没有 og:image')
            row = {
                'page': page, 'xfer': d['xfer'], 'res': d['resCount'], 'html': d['htmlBytes'],
                'docH': d['docH'], 'dcl': d['dcl'], 'load': d['load'],
                'h1': d['h1'], 'title': len(d['title']), 'desc': (len(d['desc']) if d['desc'] else 0),
                'problems': problems, 'big': d['big'],
            }
            rows.append(row)
            if problems:
                fails.append('%s：%s' % (page, ' ／ '.join(problems)))

        if as_json:
            print(json.dumps(rows, ensure_ascii=False, indent=1))
        else:
            print(u'%-22s %7s %6s %7s %8s %6s %5s  %s' % (u'页面', u'传输KB', u'请求', u'HTML-KB', u'DOM高', u'DCLms', u'h1', u'问题'))
            for r in rows:
                print(u'%-22s %7.0f %6d %7.0f %8d %6d %5d  %s' % (
                    r['page'], r['xfer'] / 1024, r['res'], r['html'] / 1024, r['docH'], r['dcl'], r['h1'],
                    (u'✓' if not r['problems'] else u'⚠ ' + str(len(r['problems'])) + u' 项')))
            print()
            if fails:
                print(u'❌ %d 个页面有问题：' % len(fails))
                for f in fails:
                    print(u'   · ' + f)
                return 1
            print(u'✅ 全部 %d 页没有 FAIL 级问题（传输量、DOM 高、DCL 见上表）' % len(rows))
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        import shutil
        shutil.rmtree(profile, ignore_errors=True)
        if own:
            own.shutdown()
    return 0


if __name__ == '__main__':
    sys.exit(main())
