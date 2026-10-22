# -*- coding: utf-8 -*-
"""tools/refactor/mobile_sweep.py —— 手机三档扫页（把三条验收纪律固化成脚本）

纪律（2026-10 血泪，来自 elysiad.top 重构）：
  1. URL 必须带 ?cb=<随机>（cdp.py 复用浏览器 profile，不带会量到旧页面）；
  2. sleep >= 4200（2500 会量到入场动画的瞬时值）；
  3. 探针里必须有 document.title + h1 自检（否则可能在量 Edge 的报错页）。

用法：
  python tools/refactor/mobile_sweep.py --root public --port 8511 --pages kevin,su
  python tools/refactor/mobile_sweep.py --root . --pages index.html --widths 320,360
退出码：0 全绿；1 有失败。报告 JSON 含每页每档原始数值。
"""
import sys
import os
import json
import time
import random
import threading
import subprocess
import http.server
import socketserver

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
CDP = os.path.join(TOOLS, 'cdp.py')
DEFAULT_WIDTHS = (320, 360, 390)
HEIGHT = 740
# 重页面（mobius 这类 20KB style + 28KB script）可能要更久；默认 4200 是纪律下限
SLEEP = sys.argv[sys.argv.index('--sleep') + 1] if '--sleep' in sys.argv else '4200'

# ⚠ 探针**不能含空格**：tools/cdp.py 的 argv 是按空格切分的。
PROBE = ('(()=>{const t=document.title||"";const h=document.querySelector("h1");'
         'const de=document.documentElement;'
         'const sm=Array.from(document.querySelectorAll("a,button,[role=button]")).filter(e=>{'
         'const r=e.getBoundingClientRect();return(r.width>1&&r.height>1&&(r.height<44||r.width<44))}).length;'
         'const bad=Array.from(document.querySelectorAll("body *")).filter(e=>{'
         'const r=e.getBoundingClientRect();return(r.width>0&&r.right>innerWidth+1)}).length;'
         'return JSON.stringify({title:t.slice(0,40),h1:!!h,w:innerWidth,sw:de.scrollWidth,small:sm,outofview:bad});})()')


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class QuietServer(socketserver.TCPServer):
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        pass


def arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


def serve(root, port):
    handler = lambda *a, **k: Quiet(*a, directory=root, **k)
    httpd = QuietServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def probe_ok(info):
    return bool(info.get('h1')) and 'error' not in info \
        and info.get('sw', 0) <= (info.get('w') or 9999) + 1 \
        and info.get('small', 99) == 0


def probe_page(page, width, port):
    url = 'http://127.0.0.1:%d/%s?cb=%d' % (port, page, random.randint(1, 10 ** 9))
    cmd = [sys.executable, CDP, url, 'size', '%dx%d' % (width, HEIGHT), 'sleep', SLEEP, 'eval', PROBE]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=180)
    except subprocess.TimeoutExpired:
        return {'error': 'timeout'}
    lines = [l for l in out.stdout.decode('utf-8', 'replace').splitlines() if l.strip()]
    for line in reversed(lines):
        line = line.strip()
        if line.startswith('{'):
            try:
                return json.loads(line)
            except Exception:
                continue
    return {'error': 'no-json', 'tail': ' '.join(lines[-2:])[:200]}


def main():
    root = os.path.abspath(arg('--root', '.'))
    port = int(arg('--port', '8511'))
    pages = [p.strip() for p in (arg('--pages') or 'kevin,aponia,eden,villv,kalpas,su,sakura,kosma,mobius,griseo,hua,pardofelis').split(',') if p.strip()]
    widths = [int(x) for x in (arg('--widths') or ','.join(str(w) for w in DEFAULT_WIDTHS)).split(',')]
    out_path = arg('--out')
    if not os.path.isdir(root):
        print('--root 不存在: %s' % root)
        return 1
    serve(root, port)
    time.sleep(0.6)
    report = {'root': root, 'port': port, 'widths': widths, 'pages': {}, 'verdict': 'pass'}
    fails = 0
    for page in pages:
        key = page if page.endswith('.html') else page.rstrip('/') + '/index.html'
        report['pages'][key] = {}
        for w in widths:
            info = probe_page(key, w, port)
            if not probe_ok(info):
                # 首跑没等到 eval 输出时重试一次；仍失败才算真问题（否则扫描器自己制造 flaky）
                print('   重试一次 ...')
                info = probe_page(key, w, port)
            ok = bool(info.get('h1')) and 'error' not in info \
                 and info.get('w') == w \
                 and info.get('sw', 0) <= w + 1 \
                 and info.get('small', 99) == 0 \
                 and '127.0.0.1' not in (info.get('title') or '127.0.0.1')
            info['ok'] = ok
            report['pages'][key][str(w)] = info
            if not ok:
                fails += 1
                report['verdict'] = 'fail'
            print('%-9s %dpx  %s  w=%s sw=%s small=%s' % (key.split('/')[0], w, 'OK ' if ok else 'FAIL',
                                                          info.get('w'), info.get('sw'), info.get('small')))
    report['fails'] = fails
    if out_path:
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=1)
        print('报告已写入 ' + out_path)
    print(('✅ 全绿' if fails == 0 else '❌ %d 项失败' % fails))
    return 0 if fails == 0 else 1


if __name__ == '__main__':
    sys.exit(main())