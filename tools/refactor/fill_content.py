# -*- coding: utf-8 -*-
"""tools/refactor/fill_content.py —— 在盘点草稿上补派生字段（零手抄）

数据来源：短名/刻印/meta/脚本序列 ← 各页 HTML；生日 ← data/bdays.js（唯一真源）；全名 ← 擂台角色表。
⚠ Python 侧不用 $ 锚点（本项目多次被 JS 替换串的 $ 展开坑过）。
"""
import os
import re
import json
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAGES = ['kevin', 'aponia', 'eden', 'villv', 'kalpas', 'su', 'sakura', 'kosma', 'mobius', 'griseo', 'hua', 'pardofelis']


def load_bdays():
    code = ('const fs=require("fs");const t=fs.readFileSync("data/bdays.js","utf8");'
            'const w={};new Function("window",t)(w);'
            'console.log(JSON.stringify(w.ELYSIA_BDAYS||{}))')
    out = subprocess.check_output(['node', '-e', code], cwd=ROOT)
    return json.loads(out.decode('utf-8'))


def load_heroes():
    p = os.path.join(ROOT, 'material', '逐火英桀擂台', 'data', 'characters.json')
    if not os.path.exists(p):
        return {}
    j = json.load(open(p, encoding='utf-8'))
    hs = j.get('heroes') or []
    if isinstance(hs, dict):
        hs = list(hs.values())
    return [h for h in hs if h.get('name')]


def main():
    bd = load_bdays()
    heroes = load_heroes()
    rows = []
    for key in PAGES:
        html = open(os.path.join(ROOT, key, 'index.html'), encoding='utf-8').read()
        dp = os.path.join(ROOT, 'content', 'characters', key + '.json')
        draft = json.load(open(dp, encoding='utf-8'))

        mt = re.search(r'<title>(.*?)</title>', html, re.S)
        raw_title = (mt.group(1) if mt else '').strip()
        mm = re.search(r'—\s*致(.+)', raw_title)
        short = (mm.group(1).strip() if mm else raw_title)

        sm = re.search(r'/images/signet/([^/"\']+)-256\.webp', html)
        signet = sm.group(1) if sm else None

        dm = re.search(r'<meta name="description" content="([^"]*)"', html)
        cm = re.search(r'<link rel="canonical" href="([^"]*)"', html)
        scripts = [os.path.basename(x) for x in re.findall(r'<script src="([^"]+)"', html)]

        full = None
        for h in heroes:
            nm = h['name']
            if short and (nm == short or short in nm or (h.get('signet') == signet)):
                full = nm
                break

        draft['key'] = key
        draft['shortName'] = short
        draft['fullName'] = full
        draft['signet'] = signet
        draft['signetImage'] = ('/images/signet/' + signet + '-256.webp') if signet else None
        draft['birthday'] = bd.get(key + '/index.html')
        draft['meta'] = {'title': raw_title,
                         'description': (dm.group(1) if dm else None),
                         'canonical': (cm.group(1) if cm else None)}
        draft['scripts'] = scripts
        draft['chibi'] = None
        with open(dp, 'w', encoding='utf-8') as f:
            json.dump(draft, f, ensure_ascii=False, indent=1, sort_keys=True)
            f.write(chr(10))
        rows.append((key, short, signet, bd.get(key + '/index.html'), len(scripts), full))

    print('%-11s %-8s %-6s %-9s %-7s %s' % ('page', 'short', 'signet', 'birthday', 'scripts', 'fullName'))
    for r in rows:
        print('%-11s %-8s %-6s %-9s %-7d %s' % (r[0], r[1], str(r[2]), str(r[3]), r[4], str(r[5])))


if __name__ == '__main__':
    main()