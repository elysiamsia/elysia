# -*- coding: utf-8 -*-
"""tools/refactor/validate_content.py —— content/characters 的硬校验（含 bdays 双源交叉校验）

任何一条不满足：退出码 1，打印「文件 + 字段 + 实际值」。
"""
import os
import re
import sys
import json
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAGES = ['kevin', 'aponia', 'eden', 'villv', 'kalpas', 'su', 'sakura', 'kosma', 'mobius', 'griseo', 'hua', 'pardofelis']
REQ = ['key', 'shortName', 'signet', 'signetImage', 'meta', 'scripts', 'explore', 'game', 'endingStars', 'birthday', 'chibi']
ID_RE = re.compile(r'^[a-z]{2,6}-[0-9]{2}\Z')


def load_bdays():
    code = ('const fs=require("fs");const t=fs.readFileSync("data/bdays.js","utf8");'
            'const w={};new Function("window",t)(w);'
            'console.log(JSON.stringify(w.ELYSIA_BDAYS||{}))')
    out = subprocess.check_output(['node', '-e', code], cwd=ROOT)
    return json.loads(out.decode('utf-8'))


def check(key, data, arts, verbs, bd):
    f = []
    for k in REQ:
        if k not in data:
            f.append('%s: 缺字段 %s' % (key, k))
    if f:
        return f
    if data['key'] != key:
        f.append('%s: key=%r 与文件名不一致' % (key, data['key']))
    for k in ('shortName', 'signet', 'signetImage'):
        if not data.get(k):
            f.append('%s: %s 为空' % (key, k))
    img = data.get('signetImage') or ''
    if img and not os.path.exists(os.path.join(ROOT, img.lstrip('/'))):
        f.append('%s: signetImage 文件不存在 %s' % (key, img))
    meta = data.get('meta') or {}
    for k in ('title', 'description', 'canonical'):
        if not meta.get(k):
            f.append('%s: meta.%s 为空' % (key, k))
    for s in (data.get('scripts') or []):
        cand = [os.path.join(ROOT, 'assets', s), os.path.join(ROOT, 'assets', 'games', s), os.path.join(ROOT, 'data', s)]
        if not any(os.path.exists(c) for c in cand):
            f.append('%s: 脚本找不到 %s' % (key, s))
    if not data.get('scripts'):
        f.append('%s: scripts 为空' % key)
    ex = data.get('explore') or {}
    if ex.get('pageId') != key:
        f.append('%s: explore.pageId=%r' % (key, ex.get('pageId')))
    finds = ex.get('finds') or []
    if len(finds) != 12:
        f.append('%s: finds=%d（应 12）' % (key, len(finds)))
    seen = set()
    prefixes = set()
    for fd in finds:
        fid = fd.get('id') or ''
        if not ID_RE.match(fid):
            f.append('%s: find id 形态不对 %r' % (key, fid))
        if fid in seen:
            f.append('%s: find id 重复 %r' % (key, fid))
        seen.add(fid)
        if '-' in fid:
            prefixes.add(fid.split('-')[0])
        for ax in ('x', 'y'):
            v = fd.get(ax)
            if not isinstance(v, (int, float)) or v < 0 or v > 1:
                f.append('%s/%s: %s=%r 越界' % (key, fid, ax, v))
        if fd.get('verb') not in verbs:
            f.append('%s/%s: verb=%r 不在白名单' % (key, fid, fd.get('verb')))
        if fd.get('art') not in arts:
            f.append('%s/%s: art=%r 不在白名单' % (key, fid, fd.get('art')))
        for k in ('at', 'line', 'src'):
            if not fd.get(k):
                f.append('%s/%s: %s 为空' % (key, fid, k))
    if len(prefixes) > 1:
        f.append('%s: find id 前缀不统一 %s' % (key, ','.join(sorted(prefixes))))
    if not isinstance(data.get('game'), dict):
        f.append('%s: game 不是对象' % key)
    if 'quotes' in data:
        q = data.get('quotes') or {}
        if not isinstance(q.get('list'), list) or not q.get('list'):
            f.append('%s: quotes.list 缺失或为空' % key)
    if 'typewriter' in data and not isinstance(data.get('typewriter'), dict):
        f.append('%s: typewriter 不是对象' % key)
    b = data.get('birthday')
    if b is not None:
        ok = isinstance(b, list) and len(b) == 2 and isinstance(b[0], int) and isinstance(b[1], int)
        if not ok:
            f.append('%s: birthday 格式应为 [月,日]（月从 0 起）实际 %r' % (key, b))
        elif b[0] < 0 or b[0] > 11 or b[1] < 1 or b[1] > 31:
            f.append('%s: birthday 越界 %r' % (key, b))
    expect = bd.get(key + '/index.html')
    if (b if b else None) != (expect if expect else None):
        f.append('%s: birthday 与 bdays.js 不一致 content=%r bdays=%r' % (key, b, expect))
    return f


def main():
    arts = set(json.load(open(os.path.join(ROOT, 'docs', 'refactor', 'art-allowlist.json'), encoding='utf-8')))
    verbs = set(json.load(open(os.path.join(ROOT, 'docs', 'refactor', 'verb-allowlist.json'), encoding='utf-8')))
    bd = load_bdays()
    allf = []
    for key in PAGES:
        p = os.path.join(ROOT, 'content', 'characters', key + '.json')
        if not os.path.exists(p):
            allf.append('%s: 文件不存在' % key)
            continue
        try:
            data = json.load(open(p, encoding='utf-8'))
        except Exception as e:
            allf.append('%s: JSON 解析失败 %s' % (key, e))
            continue
        allf.extend(check(key, data, arts, verbs, bd))
    if allf:
        print('❌ 校验失败 %d 项：' % len(allf))
        for x in allf:
            print('  - ' + x)
        return 1
    print('✅ content 校验全绿：%d 页（finds 各 12 / art+verb 白名单 / 生日与 bdays.js 交叉一致）' % len(PAGES))
    return 0


if __name__ == '__main__':
    sys.exit(main())