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