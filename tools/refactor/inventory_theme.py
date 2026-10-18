# -*- coding: utf-8 -*-
"""tools/refactor/inventory_theme.py —— Task 7 盘点（THEME + head + 体积 + 白名单）

产出四件：
  content/characters/<key>.json    ← THEME 求值后的 JSON 草稿（零手抄，杜绝转录错误）
  docs/refactor/theme-inventory.md ← 报告：THEME 顶层键/finds 数/字段差异 + 每页 head 标签 vs 基线 + 内联体积
  docs/refactor/art-allowlist.json ← art 取值全集（validate_content 直接读，不散落在 prose 里）
  docs/refactor/verb-allowlist.json
"""
import os
import re
import json
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXTRACT = os.path.join(ROOT, 'tools', 'refactor', 'theme_extract.mjs')
PAGES = ['kevin', 'aponia', 'eden', 'villv', 'kalpas', 'su', 'sakura', 'kosma', 'mobius', 'griseo', 'hua', 'pardofelis']
BASELINE = 'kevin'


def extract(page):
    path = os.path.join(ROOT, page, 'index.html')
    out = subprocess.check_output(['node', EXTRACT, path])
    info = json.loads(out.decode('utf-8', 'replace').strip().splitlines()[-1])
    if 'canonical' not in info:
        return None, info
    return json.loads(info['canonical']), info


def head_profile(html):
    m = re.search(r'<head[^>]*>([\s\S]*?)</head>', html, re.I)
    head = m.group(1) if m else ''
    tags = []
    for tm in re.finditer(r'<(link|meta|script|style)\b([^>]*)>', head, re.I):
        kind = tm.group(1).lower()
        attrs = tm.group(2)
        picked = []
        for key in ('rel', 'href', 'name', 'content', 'src', 'type', 'media', 'id'):
            am = re.search(key + r'\s*=\s*"([^"]*)"', attrs, re.I)
            if am:
                picked.append(key + '=' + am.group(1))
        tags.append(kind + ' ' + ' '.join(picked))
    return tags, head, html


def sizes(html):
    styles = sum(len(x) for x in re.findall(r'<style[^>]*>([\s\S]*?)</style>', html))
    scripts = sum(len(x) for x in re.findall(r'<script(?![^>]*src)[^>]*>([\s\S]*?)</script>', html))
    links = re.findall(r'<script src="([^"]+)"', html)
    return styles, scripts, [os.path.basename(x) for x in links]


def main():
    os.makedirs(os.path.join(ROOT, 'content', 'characters'), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'docs', 'refactor'), exist_ok=True)
    data = {}
    heads = {}
    stats = {}
    for page in PAGES:
        theme, info = extract(page)
        if theme is None:
            print('!! %s 提取失败: %s' % (page, info))
            continue
        data[page] = theme
        with open(os.path.join(ROOT, 'content', 'characters', page + '.json'), 'w', encoding='utf-8') as f:
            json.dump(theme, f, ensure_ascii=False, indent=1, sort_keys=True)
            f.write(chr(10))
        html = open(os.path.join(ROOT, page, 'index.html'), encoding='utf-8').read()
        tags, head, _ = head_profile(html)
        heads[page] = tags
        stats[page] = sizes(html)

    base_keys = sorted(data[BASELINE].keys())
    base_head = heads[BASELINE]
    art = set()
    verb = set()
    for page, theme in data.items():
        ex = theme.get('explore') or {}
        for fd in ex.get('finds') or []:
            if 'art' in fd: art.add(fd['art'])
            if 'verb' in fd: verb.add(fd['verb'])

    L = []
    L.append('# Task 7 盘点报告：THEME 与 head 结构')
    L.append('')
    L.append('> 自动生成（tools/refactor/inventory_theme.py）。THEME 经 node 求值，**零手抄**。')
    L.append('')
    L.append('## 一、THEME 结构（基线：%s）' % BASELINE)
    L.append('')
    L.append('| 页 | 顶层键 | finds | 与基线差异 |')
    L.append('|---|---|---|---|')
    for page in PAGES:
        if page not in data: continue
        theme = data[page]
        keys = sorted(theme.keys())
        finds = len(((theme.get('explore') or {}).get('finds') or []))
        diff = []
        extra = [k for k in keys if k not in base_keys]
        missing = [k for k in base_keys if k not in keys]
        if extra: diff.append('多出 ' + ','.join(extra))
        if missing: diff.append('缺少 ' + ','.join(missing))
        L.append('| %s | %s | %d | %s |' % (page, ','.join(keys), finds, '；'.join(diff) or '—'))
    L.append('')
    L.append('基线顶层键：' + ','.join(base_keys))
    L.append('')
    L.append('## 二、head 标签（对比 %s 基线）' % BASELINE)
    L.append('')
    L.append('基线 %s 的 head 标签：' % BASELINE)
    L.append('')
    for t in base_head:
        L.append('- `' + t + '`')
    L.append('')
    for page in PAGES:
        if page == BASELINE or page not in heads: continue
        extra = [t for t in heads[page] if t not in base_head]
        missing = [t for t in base_head if t not in heads[page]]
        if not extra and not missing:
            L.append('- **%s**：与基线完全一致' % page)
            continue
        L.append('- **%s**' % page)
        if extra:
            for t in extra: L.append('  - 多出 `' + t + '`')
        if missing:
            for t in missing: L.append('  - 缺少 `' + t + '`')
    L.append('')
    L.append('## 三、内联体积与外部脚本')
    L.append('')
    L.append('| 页 | 内联 style | 内联 script | 外部脚本 |')
    L.append('|---|---|---|---|')
    for page in PAGES:
        if page not in stats: continue
        st, sc, links = stats[page]
        L.append('| %s | %.1fKB | %.1fKB | %s |' % (page, st / 1024.0, sc / 1024.0, ' '.join(links)))
    L.append('')
    L.append('## 四、白名单（已落成文件）')
    L.append('')
    L.append('- art：' + ', '.join(sorted(art)))
    L.append('- verb：' + ', '.join(sorted(verb)))
    with open(os.path.join(ROOT, 'docs', 'refactor', 'theme-inventory.md'), 'w', encoding='utf-8') as f:
        f.write(chr(10).join(L) + chr(10))
    with open(os.path.join(ROOT, 'docs', 'refactor', 'art-allowlist.json'), 'w', encoding='utf-8') as f:
        json.dump(sorted(art), f, ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, 'docs', 'refactor', 'verb-allowlist.json'), 'w', encoding='utf-8') as f:
        json.dump(sorted(verb), f, ensure_ascii=False, indent=1)
    print('已生成 12 份 JSON 草稿 + 报告 + 两个白名单')
    print('THEME 顶层键集合：' + str({tuple(sorted(t.keys())) for t in data.values()}))
    print('finds 数：' + str({p: len(((d.get('explore') or {}).get('finds') or [])) for p, d in data.items()}))


if __name__ == '__main__':
    main()