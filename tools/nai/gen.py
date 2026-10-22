
# -*- coding: utf-8 -*-
"""NAI relay 出图（仅 nai-v4.5-full-limit）。用法: python tools/nai/gen.py <outdir> <prefix> <prompt> [n]
"""
import json, urllib.request, urllib.error, base64, sys, os, time, random

CFG = r'D:/NovalAI/PromptCard-Studio-1.0.1-win64/config.json'
cfg = json.load(open(CFG, encoding='utf-8'))
BASE = cfg['relay_base_url'].rstrip('/')
if not BASE.lower().endswith('/v1'): BASE += '/v1'
TOK = cfg['relay_token']
MODEL = 'nai-v4.5-full-limit'

NEG = ('lowres, bad anatomy, bad hands, extra limbs, extra fingers, missing fingers, '
       'watermark, text, signature, username, cropped, out of frame, blurry, jpeg artifacts, '
       'multiple views, character sheet, speech bubble')

def gen(prompt, width=832, height=1216, steps=28, scale=5.0, seed=None):
    payload = {
        'model': MODEL, 'prompt': prompt, 'negative_prompt': NEG,
        'size': f'{width}x{height}', 'width': width, 'height': height,
        'steps': steps, 'sampler': 'k_euler_ancestral', 'scale': scale, 'noise_schedule': 'karras',
    }
    if seed is not None: payload['seed'] = seed
    req = urllib.request.Request(BASE + '/images/generations',
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={'Authorization': 'Bearer ' + TOK, 'Content-Type': 'application/json'}, method='POST')
    r = urllib.request.urlopen(req, timeout=300)
    return json.loads(r.read())

def main():
    outdir, prefix, prompt = sys.argv[1], sys.argv[2], sys.argv[3]
    n = int(sys.argv[4]) if len(sys.argv) > 4 else 4
    os.makedirs(outdir, exist_ok=True)
    for i in range(n):
        try:
            d = gen(prompt, seed=random.randint(1, 2**31 - 1))
            p = os.path.join(outdir, f'{prefix}_{i}.png')
            open(p, 'wb').write(base64.b64decode(d['data'][0]['b64_json']))
            print('ok', p)
        except urllib.error.HTTPError as e:
            print('HTTP', e.code, e.read()[:300])
        except Exception as e:
            print('ERR', repr(e)[:200])
        time.sleep(0.5)

if __name__ == '__main__':
    main()
