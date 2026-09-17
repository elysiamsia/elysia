# -*- coding: utf-8 -*-
"""
tools/check_reduced_motion.py — 减弱动效（prefers-reduced-motion）双向断言

计划里 Task 9 Step 2 把「验证减动路径」标成了**人工步骤**（手动去 Edge 里打开
「减少动态效果」再跑）。其实 CDP 有 `Emulation.setEmulatedMedia`，可以自动化 ——
而且能顺手把**反面**也测了：

  ① **偏好打开时**：装饰动画确实停了、该保持可见的东西没被误关
  ② **偏好关闭时**：动画**确实还在**（证明减动段没泄漏到正常路径）

第 ② 条容易被忽略，但它才是这个工具存在的主要理由 ——
一段写错的 `@media` 若漏了条件、或者干脆没生效，只测 ① 是看不出来的：
「动画停了」和「动画本来就没跑」在单侧测试里长得一模一样。

⚠ 快照（snapshot.py）**测不了这个**：它不模拟媒体特性，跑的是默认无偏好路径。
   所以减动保护必须靠本脚本兜底。

── 跑法 ─────────────────────────────────────────────────────────────
    PYTHONIOENCODING=utf-8 python tools/check_reduced_motion.py

自带服务器（端口 **8501**，避开 8500 的残留服务器陷阱），退出码 0/1。
"""
import http.server, io, json, os, shutil, socketserver, subprocess, sys, tempfile
import threading, time, urllib.request

import websocket

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8501
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

# 逐页检查「减动生效」的目标：选择器 → 期望的 animation-name
#   （'none' 表示应当被关掉）
PAGES = ['index.html', 'kevin/index.html', 'kalpas/index.html', 'villv/index.html']

# 两处「最凶」的演出 —— 全屏白闪 / 全页高频抖动，WCAG 2.3.1 风险点。
# 用真实用户路径触发（见下方循环里的说明）。
PERFORMANCES = [
    {
        'label': 'villv 666 演出',
        'page': 'villv/index.html',
        # 键盘彩蛋：连按三次「6」
        'trigger': """(() => {
            for (let i = 0; i < 3; i++)
              document.dispatchEvent(new KeyboardEvent('keydown', {key: '6', bubbles: true}));
            return true;
        })()""",
        'wait_ms': 5400,      # phase-boom 在触发后 4900ms 出现，取窗口中间
        'probe': """(() => JSON.stringify({
            shaking: document.body.classList.contains('kk-shaking'),
            boom: document.getElementById('kkOverlay').classList.contains('phase-boom'),
            flashOp: getComputedStyle(document.getElementById('kkFlash')).opacity,
        }))()""",
        # 正常：抖动 + boom（真演出）
        'normal_expect': {'shaking': True, 'boom': True},
        # 减动：不抖；但 **boom 必须还在** —— 它带状态（隐藏倒计时），跳过就是 bug；
        #       白闪必须彻底为 0
        'reduce_expect': {'shaking': False, 'boom': True, 'flashOp': '0'},
    },
    {
        'label': 'kalpas 怒气震屏',
        'page': 'kalpas/index.html',
        # 每次点击 +6 怒气，满 100 触发 startRage（17 次即到，多打几次保险）
        'trigger': """(() => {
            for (let i = 0; i < 25; i++)
              document.body.dispatchEvent(new MouseEvent('click', {bubbles: true, clientX: 30, clientY: 30}));
            return true;
        })()""",
        'wait_ms': 300,       # 减动下 1200ms 后就收尾了，要趁早采
        'probe': """(() => JSON.stringify({
            raging: document.body.classList.contains('raging'),
            valuenow: document.getElementById('rageHud').getAttribute('aria-valuenow'),
        }))()""",
        'normal_expect': {'raging': True},
        'reduce_expect': {'raging': False},
    },
]

DUMP_JS = """
(() => {
  const g = sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { anim: cs.animationName, op: cs.opacity, scroll: cs.scrollBehavior };
  };
  const star = document.querySelector('.ending-star');
  let starVars = null;
  if (star) {
    const s = star.getAttribute('style') || '';
    const mn = /--min-o\\s*:\\s*([\\d.]+)/.exec(s);
    const mx = /--max-o\\s*:\\s*([\\d.]+)/.exec(s);
    if (mn && mx) starVars = { min: parseFloat(mn[1]), max: parseFloat(mx[1]) };
  }
    return JSON.stringify({
      cursor:  g('.typing-cursor'),
      card:    g('.profile-card'),
      chevron: g('.scroll-chevron'),
      star:    g('.ending-star'),
      starVars: starVars,
      htmlScroll: getComputedStyle(document.documentElement).scrollBehavior,
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
})()
"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class QuietServer(socketserver.TCPServer):
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        pass  # 浏览器取完就断连，是常态


def start_server():
    handler = lambda *a, **k: Quiet(*a, directory=ROOT, **k)
    httpd = QuietServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    httpd = start_server()
    time.sleep(0.6)
    try:
        css = urllib.request.urlopen('http://127.0.0.1:%d/assets/site.css' % PORT, timeout=5).read().decode('utf-8')
    except Exception as e:
        print(u'❌ 本地服务器起不来：%s' % e); return 1
    # §6.4 纪律：先验内容再采样
    if 'prefers-reduced-motion' not in css:
        print(u'❌ 服务的 site.css 里没有减动段 —— 先查有没有别的进程占着端口')
        return 1

    profile = tempfile.mkdtemp(prefix='edge_rm_')
    proc = subprocess.Popen([
        EDGE, '--remote-debugging-port=9322', '--headless=new', '--disable-gpu',
        '--no-first-run', '--remote-allow-origins=*',
        '--user-data-dir=' + profile, '--window-size=1280,900',
        'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    failures = []
    scoped_ok = 0   # 有多少页证明了「减动段确实只作用于减动偏好」（见 ⑤）
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

        def emulate(value):
            send('Emulation.setEmulatedMedia', {
                'media': '',
                'features': [{'name': 'prefers-reduced-motion', 'value': value}],
            })

        for page in PAGES:
            # ⚠ 先采「正常偏好」，再采「减动偏好」—— 顺序很重要。
            #
            #   减动的断言必须**相对正常态**来下，不能写死「.profile-card 必须
            #   有 glow-pulse」。实测（2026-09-17）：kalpas 的 .profile-card
            #   本来就没有动画 —— 那是它既有的设计，不是减动段干的。
            #   写死期望值会把「原本就没有」误报成「减动泄漏」。
            obs = {}
            for value in ('no-preference', 'reduce'):
                emulate(value)
                send('Page.navigate', {'url': 'http://127.0.0.1:%d/%s?cb=%d' % (PORT, page, time.time() * 1000)})
                time.sleep(2.2)
                got = ev(DUMP_JS)
                if not got:
                    failures.append(u'%s[%s]: 取不到 DOM' % (page, value))
                    continue
                d = json.loads(got)
                want_match = (value == 'reduce')
                if d['matches'] != want_match:
                    failures.append(u'%s[%s]: matchMedia 返回 %s，媒体模拟没生效'
                                    % (page, value, d['matches']))
                obs[value] = d

            if len(obs) != 2:
                continue
            norm, red = obs['no-preference'], obs['reduce']

            def brief(d):
                f = lambda k: ('%s' % (d[k]['anim'] if d.get(k) else '-'))
                return u'光标=%s/%s 名片=%s 箭头=%s 星屑=%s/%s html=%s' % (
                    f('cursor'), (d['cursor']['op'] if d.get('cursor') else '-'),
                    f('card'), f('chevron'), f('star'),
                    (d['star']['op'] if d.get('star') else '-'), d['htmlScroll'])

            print(u'  · %-18s 正常  %s' % (page, brief(norm)))
            print(u'    %-18s 减动  %s' % ('', brief(red)))

            # ── ① 减动时：正常态**确实在动**的装饰，必须停下来 ──
            for key, label in (('cursor', '.typing-cursor'), ('card', '.profile-card'),
                               ('chevron', '.scroll-chevron'), ('star', '.ending-star')):
                n, r = norm.get(key), red.get(key)
                if not n or not r:
                    continue
                if n['anim'] != 'none' and r['anim'] != 'none':
                    failures.append(u'%s: %s 在减动下仍是 %s（正常下是 %s），没停下'
                                    % (page, label, r['anim'], n['anim']))

            # ── ② 光标：不闪，但**必须保持可见**（消失是功能损失，不是减动）──
            if red.get('cursor') and red['cursor']['op'] != '1':
                failures.append(u'%s: 减动下光标 opacity=%s，应为 1 —— 光标不该消失'
                                % (page, red['cursor']['op']))

            # ── ③ 星屑：定格在**该页自己的**中间亮度（不是写死值）──
            if red.get('star') and red.get('starVars'):
                want_op = (red['starVars']['min'] + red['starVars']['max']) / 2
                got_op = float(red['star']['op'])
                if abs(got_op - want_op) > 0.02:
                    failures.append(u'%s: 减动下星屑 opacity=%s，应为中间亮度 %.3f'
                                    % (page, got_op, want_op))

            # ── ④ 平滑滚动：`html` 常态是 smooth，减动下应为 auto ──
            if norm['htmlScroll'] != 'smooth':
                failures.append(u'%s: 正常下 html scroll-behavior=%s，预期 smooth（被谁覆盖了？）'
                                % (page, norm['htmlScroll']))
            if red['htmlScroll'] != 'auto':
                failures.append(u'%s: 减动下 html scroll-behavior=%s，应为 auto'
                                % (page, red['htmlScroll']))

            # ── ⑤ 关键的反面：正常偏好下动画**必须还在** ──
            #    这一条才是本工具存在的主要理由。「动画停了」和「动画本来就没跑」
            #    在只测减动时长得一模一样 —— 一段写错作用域的 @media 会同时满足两边。
            if norm.get('cursor', {}).get('anim') == 'none':
                failures.append(u'%s: 正常偏好下光标也没有动画 —— 减动段泄漏到正常路径！' % page)
            else:
                scoped_ok += 1

        # ── 演出护栏：用**真实用户路径**触发，双向验证 ────────────────────
        #
        # ⚠ 为什么不直接调 `fireKevinKiller666()` / `startRage()`：
        #   两个页面的脚本都是 `(function(){ … })()` 包裹的，那两个函数**不是全局的**
        #   （P1 计划 Step 6 写的 `typeof fireKevinKiller666 === 'function'`
        #     期望「函数存在」，实际会得到 undefined）。
        #   所以走用户真会走的路：连按三次「6」/ 连点点满怒气条。
        #   这样测的也更真 —— 验的是「用户这么干时会不会被晃到」。
        for spec in PERFORMANCES:
            obs = {}
            for value in ('no-preference', 'reduce'):
                emulate(value)
                send('Page.navigate', {'url': 'http://127.0.0.1:%d/%s?cb=%d' % (PORT, spec['page'], time.time() * 1000)})
                time.sleep(2.4)
                ev(spec['trigger'])
                time.sleep(spec['wait_ms'] / 1000.0)
                got = ev(spec['probe'])
                if not got:
                    failures.append(u'%s[%s]: 取不到状态' % (spec['label'], value)); continue
                obs[value] = json.loads(got)

            if len(obs) != 2:
                continue
            n, r = obs['no-preference'], obs['reduce']
            print(u'  · %-14s 正常 %s' % (spec['label'], n))
            print(u'    %-14s 减动 %s' % ('', r))

            for k, v in spec['normal_expect'].items():
                if n.get(k) != v:
                    failures.append(u'%s[正常]: %s = %r，应为 %r —— 护栏误伤了正常路径'
                                    % (spec['label'], k, n.get(k), v))
            for k, v in spec['reduce_expect'].items():
                if r.get(k) != v:
                    failures.append(u'%s[减动]: %s = %r，应为 %r'
                                    % (spec['label'], k, r.get(k), v))

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
        print(u'❌ %d 项断言失败：' % len(failures))
        for f in failures:
            print(u'   • ' + f)
        return 1
    print(u'✅ 全部通过：')
    print(u'   · 减动偏好下，装饰动画停了、光标仍可见、星屑停在各自的中间亮度、平滑滚动关掉')
    print(u'   · 正常偏好下，动画照旧 —— **作用域没泄漏**（%d/%d 页双向验证过）'
          % (scoped_ok, len(PAGES)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
