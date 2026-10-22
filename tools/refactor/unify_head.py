# -*- coding: utf-8 -*-
"""tools/refactor/unify_head.py —— 统一 12 页 <head>（方案 B，2026-10-18 主人拍板）

规范字面量的唯一来源：**su 页的 head**（多数派写法，9/12 页已符合）。
  做两件事：① 把 su 的 4 处数据值替换成目标页的值；② 把样式块区换成目标页自己的（顺序不变）。
  ⇒ 9 页应当**零变化**；kosma/hua/pardofelis 会被改写（有意差异，需单独验收）。

⚠ 样式块**内容与顺序都不动** —— 只在 head 的非样式部分上收敛。
（重复的 explore 内联样式本轮**不删**：必须先证明它是 explore.css 的子集，否则会静默丢样式。）
"""
import os
import re
import sys
import json
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAGES = ['kevin', 'aponia', 'eden', 'villv', 'kalpas', 'su', 'sakura', 'kosma', 'mobius', 'griseo', 'hua', 'pardofelis']
CANON = 'su'


def head_of(html):
    m = re.search(r'<head[^>]*>([\s\S]*?)</head>', html, re.I)
    return m


def data_of(head):
    t = re.search(r'<title>(.*?)</title>', head, re.S)
    d = re.search(r'<meta name="description" content="([^"]*)"', head)
    c = re.search(r'<link rel="canonical" href="([^"]*)"', head)
    tc = re.search(r'<meta name="theme-color" content="([^"]*)"', head)
    od = re.search(r'<meta property="og:description" content="([^"]*)"', head)
    oi = re.search(r'<meta property="og:image" content="([^"]*)"', head)
    br = re.search(r'"position": 2,\s*"name": "([^"]*)"', head)
    return {'title': t.group(1).strip() if t else '',
            'description': d.group(1) if d else '',
            'canonical': c.group(1) if c else '',
            'short': br.group(1) if br else '',
            'themeColor': tc.group(1) if tc else '',
            'ogDescription': od.group(1) if od else '',
            'ogImage': oi.group(1) if oi else ''}


def split_styles(head):
    """返回 (非样式部分, 样式部分)。样式部分 = SECTION: styles 之后到 head 结束。"""
    m = re.search(r'<!--\s*SECTION:\s*styles\s*-->', head)
    if m:
        return head[:m.start()], head[m.start():]
    blocks = list(re.finditer(r'<style[^>]*>[\s\S]*?</style>', head))
    if not blocks:
        return head, ''
    return head[:blocks[0].start()], head[blocks[0].start():]


def main():
    apply = '--apply' in sys.argv
    canon_html = open(os.path.join(ROOT, CANON, 'index.html'), encoding='utf-8').read()
    canon_head = head_of(canon_html).group(1)
    canon_data = data_of(canon_head)
    canon_pre, canon_styles = split_styles(canon_head)

    changed = []
    for page in PAGES:
        path = os.path.join(ROOT, page, 'index.html')
        html = open(path, encoding='utf-8').read()
        m = head_of(html)
        head = m.group(1)
        pre, styles = split_styles(head)
        if page == CANON:
            continue
        # 用目标页的数据替换 canon 里的 4 处值
        d = data_of(head)
        new_pre = canon_pre
        # ① 标题（两种格式：<title> 与 og:title 不同）
        new_pre = new_pre.replace(canon_data['title'], d['title'])
        new_pre = new_pre.replace(canon_data['canonical'], d['canonical'])
        canon_og_title = '致' + canon_data['short'] + ' — elysiad.top'
        target_og_title = '致' + d['short'] + ' — elysiad.top'
        new_pre = new_pre.replace(canon_og_title, target_og_title)
        # ② 描述：三处都要换 —— meta description、JSON-LD 的 description、og:description
        #    （JSON-LD 用的是 "description": "…" 这种键值写法，只换 meta 会留一半 su 的值）
        new_pre = new_pre.replace('"description": "' + canon_data['description'] + '"',
                                  '"description": "' + d['description'] + '"')
        # ② 描述：meta description 与 og:description **可能不同**（hua/pardofelis 的 og 是长文案）
        new_pre = new_pre.replace('content="' + canon_data['description'] + '"', 'content="' + d['description'] + '"', 1)
        if d.get('ogDescription'):
            new_pre = re.sub(r'(<meta property="og:description" content=")[^"]*(")',
                             lambda m: m.group(1) + d['ogDescription'] + m.group(2), new_pre, count=1)
        # ③ og:image 是**每页专属图**（og-1.jpg / og-hua.jpg / og-pardo.jpg）
        if d.get('ogImage'):
            new_pre = re.sub(r'(<meta property="og:image" content=")[^"]*(")',
                             lambda m: m.group(1) + d['ogImage'] + m.group(2), new_pre, count=1)
        # ④ theme-color 是每页自己的颜色；**没有这一项的页（hua/pardofelis）必须整行删掉**
        if d.get('themeColor'):
            new_pre = new_pre.replace('content="' + canon_data['themeColor'] + '"', 'content="' + d['themeColor'] + '"')
        else:
            new_pre = re.sub(r'[ \t]*<meta name="theme-color"[^>]*>\n', '', new_pre)
        # ⑤ 面包屑第二项的短名
        if canon_data['short'] and d['short']:
            new_pre = new_pre.replace('"name": "' + canon_data['short'] + '"', '"name": "' + d['short'] + '"')
        new_head = new_pre + (styles if styles else canon_styles)
        # 保留 styles 起始标记（目标页有就用自己的，没有就补 canon 的标记行）
        if styles and not re.search(r'<!--\s*SECTION:\s*styles\s*-->', styles):
            new_head = new_pre + '<!-- SECTION: styles -->' + chr(10) + styles
        new_html = html[:m.start(1)] + new_head + html[m.end(1):]
        if new_html != html:
            changed.append(page)
            if apply:
                open(path, 'w', encoding='utf-8', newline='').write(new_html)
    print('将被改写的页（%d/%d）：%s' % (len(changed), len(PAGES), ' '.join(changed) if changed else '无'))
    print('模式：' + ('已写入' if apply else 'dry-run（加 --apply 才写）'))


if __name__ == '__main__':
    main()