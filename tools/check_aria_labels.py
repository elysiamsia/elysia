# -*- coding: utf-8 -*-
"""
tools/check_aria_labels.py — 语录卡 aria-label 属性断言

为什么需要这个：**snapshot.py 测不出属性。**
它采的是「计算样式」（body/html/38 个选择器的 30 个 CSS 属性），
`aria-label` 这类**属性**不在采样范围内。于是「6 页各有一段专属文案，
被重构悄悄抹成统一文案」这种回归，快照会报「✅ 无差异」。
详见 docs/theme-schema.md §四。

断言两件事（**缺一不可**）：

  ① **源码 ↔ DOM 一致**：页面源码里 `ariaLabel:` 声明的值，
     必须等于浏览器里每个 `.quote-card` 实际的 `aria-label`。
     → 抓「共享层没把参数用上」「参数被漏传」。

  ② **文案等于登记值**：实际值必须等于本文件 `EXPECTED` 里的登记值。
     → 抓「文案在重构中被改掉」。改文案必须**同时改这里**，逼它变成一次
       刻意动作，而不是静默漂移。

⚠ 这两条文案（「低语卡片」「救世铭文」……）是**世界观设定（Lore）**，
  不是通用 UI 标签。它们能被随意统一，等于角色塑造被破坏。

── 跑法 ─────────────────────────────────────────────────────────────
    PYTHONIOENCODING=utf-8 python tools/check_aria_labels.py

  自带服务器（**端口 8501**，刻意避开 8500）—— 见 HANDOVER §6.4：
  8500 上常残留别的 http.server，请求落到哪个不确定，会测出「内容完全错」的结果。
  本脚本因此不依赖、也不碰 8500。

退出码：0 = 全部通过；1 = 有断言失败。
"""
import http.server, io, json, os, re, shutil, socketserver, subprocess, sys, tempfile
import threading, time, urllib.request

import websocket  # 与 tools/cdp.py 同源依赖

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8501
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

# 页面 → (该页登记文案, 来源)
#   子页走共享层（ElysiaShared.buildQuoteCards），index 走自己的配音版实现。
#   全部 7 页都登记 —— index 那份同样是 Lore，一起守住。
EXPECTED = {
    'index.html':        ('语录卡片，点击切换与播放配音', 'inline'),
    'aponia/index.html': ('低语卡片，点击切换',           'shared'),
    'eden/index.html':   ('黄金诗句，点击切换',           'shared'),
    'kalpas/index.html': ('鏖灭之言，点击切换',           'shared'),
    'kevin/index.html':  ('救世铭文，点击切换',           'shared'),
    'su/index.html':     ('觉者之言，点击切换',           'shared'),
    'villv/index.html':  ('台词卡片，点击切换',           'shared'),
    'sakura/index.html': ('刹那之言，点击切换',           'shared'),
}


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class QuietServer(socketserver.TCPServer):
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        # 浏览器取完就断开连接 —— ConnectionResetError 是常态，不是错误。
        # 不吞掉的话每页会刷一屏 traceback，把真正的断言结果淹掉。
        pass


def start_server():
    handler = lambda *a, **k: Quiet(*a, directory=ROOT, **k)
    httpd = QuietServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def source_declared(page):
    """从页面源码里取 `ariaLabel:` 的声明值；找不到返回 None。"""
    src = io.open(os.path.join(ROOT, page), encoding='utf-8').read()
    m = re.search(r"ariaLabel:\s*'([^']*)'", src)
    return m.group(1) if m else None


def main():
    # ── §6.4 纪律：起完服务器先验内容，再采样 ──
    httpd = start_server()
    time.sleep(0.6)
    try:
        probe = urllib.request.urlopen('http://127.0.0.1:%d/assets/site.js' % PORT, timeout=5).read().decode('utf-8')
    except Exception as e:
        print(u'\u274c 本地服务器起不来：%s' % e); return 1
    if 'ElysiaShared' not in probe:
        print(u'\u274c 服务器内容不对（assets/site.js 里没有 ElysiaShared）—— 先查有没有别的进程占着端口')
        return 1

    # ⚠ 用**全新临时 profile**：cdp.py 那个 C:/tmp/edge_cdp 会跨次留存缓存，
    #   改了页面再测可能读到的还是旧版（HANDOVER §6.4）。属性测试最怕这个 ——
    #   缓存会让它**假通过**。宁可贵一点。
    profile = tempfile.mkdtemp(prefix='edge_aria_')
    proc = subprocess.Popen([
        EDGE, '--remote-debugging-port=9321', '--headless=new', '--disable-gpu',
        '--no-first-run', '--remote-allow-origins=*',
        '--user-data-dir=' + profile, '--window-size=1280,900',
        'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    failures, checked = [], 0
    try:
        targets = []
        for _ in range(20):
            try:
                targets = json.load(urllib.request.urlopen('http://127.0.0.1:9321/json'))
                break
            except Exception:
                time.sleep(0.5)
        ws_url = next(t['webSocketDebuggerUrl'] for t in targets if t.get('type') == 'page')
        ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=60)
        _id = [0]

        def send(method, params=None):
            _id[0] += 1
            ws.send(json.dumps({'id': _id[0], 'method': method, 'params': params or {}}))
            while True:
                r = json.loads(ws.recv())
                if r.get('id') == _id[0]:
                    return r

        send('Page.enable'); send('Runtime.enable')

        def ev(expr):
            r = send('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
            return r['result']['result'].get('value')

        for page in EXPECTED:
            want, kind = EXPECTED[page]
            before = len(failures)
            send('Page.navigate', {'url': 'http://127.0.0.1:%d/%s?cb=%d' % (PORT, page, time.time() * 1000)})
            time.sleep(2.5)
            got = ev("""(() => {
                const cards = [...document.querySelectorAll('.quote-card')];
                return JSON.stringify({
                    n: cards.length,
                    labels: [...new Set(cards.map(c => c.getAttribute('aria-label')))],
                });
            })()""")
            if not got:
                failures.append(u'%s: 取不到 .quote-card' % page)
                print(u'  ✗ %-20s 取不到 .quote-card' % page)
                continue
            got = json.loads(got)

            if got['n'] == 0:
                failures.append(u'%s: 一张 .quote-card 都没有（共享层没跑？）' % page)
                print(u'  ✗ %-20s 0 张卡' % page)
                continue
            checked += 1

            labels = got['labels']
            actual = labels[0] if labels else None
            if len(labels) != 1:
                failures.append(u'%s: %d 张卡的 aria-label 不一致 -> %r' % (page, got['n'], labels))
            else:
                # ① 源码 ↔ DOM
                declared = source_declared(page)
                if kind == 'shared':
                    if declared is None:
                        failures.append(u'%s: 源码里找不到 `ariaLabel:` 声明' % page)
                    elif declared != actual:
                        failures.append(u'%s: 源码声明 %r，但 DOM 里是 %r（参数没传到位？）'
                                        % (page, declared, actual))
                # ② 文案 == 登记值
                if actual != want:
                    failures.append(u'%s: aria-label = %r，登记值 %r' % (page, actual, want))

            # 行首标记要**如实反映这一页的结果** ——
            # 否则断言失败的页面顶着个 ✓ 会把人看晕
            mark = u'\u2713' if len(failures) == before else u'\u2717'
            print(u'  %s %-20s %-6s  %d 张  %r' % (mark, page, kind, got['n'], actual))

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
        print(u'\u274c %d/%d 页断言失败：' % (len(failures), len(EXPECTED)))
        for f in failures:
            print(u'   \u2022 ' + f)
        print(u'\n\U0001f4a1 改文案是**刻意动作**：改完请同步更新本文件顶部的 EXPECTED。')
        return 1
    print(u'\u2705 全部通过：%d 页语录卡的 aria-label 与登记值一致' % checked)
    return 0


if __name__ == '__main__':
    sys.exit(main())
