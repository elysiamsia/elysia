# -*- coding: utf-8 -*-
"""tools/refactor/gen_base.py —— 从 su 的 HTML 机械生成 base.njk 与共享样式 partial

为什么用生成而不用手写：base.njk 必须**逐字节**复刻现有 head（注释、空行、属性顺序都在内），
手写必然漏细节；从 su 原文替换出占位符，保真度最高。
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = 'su'


def main():
    html = open(os.path.join(ROOT, SRC, 'index.html'), encoding='utf-8').read()
    hm = re.search(r'<head[^>]*>([\s\S]*?)</head>', html, re.I)
    bm = re.search(r'<body([^>]*)>([\s\S]*)</body>', html, re.I)
    head, body_attrs, body = hm.group(1), bm.group(1), bm.group(2)

    s = head
    # ① 共享样式块：signet-mark + signet-badge-css 合成 partial
    smk = re.search(r'<style id="signet-mark">[\s\S]*?</style>', s)
    bad = re.search(r'<style id="signet-badge-css">[\s\S]*?</style>', s)
    ttf = re.search(r'<style id="touch-target-fix">[\s\S]*?</style>', s)
    # touch-target-fix 属共享（决策①：全站统一，kevin/su 已补齐）⇒ 并入共享 partial
    signet_partial = ''  # 已拆分，见下方 partials
    for blk in (smk, bad, ttf):
        if blk:
            s = s.replace(blk.group(0), '', 1)
    # ② 大块页面样式 → pageStyle
    big = re.search(r'<style>\s*:root\{[\s\S]*?</style>', s)
    if big:
        s = s.replace(big.group(0), '{{ pageStyle | safe }}', 1)
    # ③ 页面私有修复块（threshold-44 / narrow-320 / mobile-ovf）→ pageFixes
    fixed = []
    for m in re.finditer(r'<style id="(threshold-44-fix|narrow-320-fix|mobile-ovf-fix)">[\s\S]*?</style>', s):
        fixed.append(m.group(0))
    for f in fixed:
        s = s.replace(f, '', 1)
    # ④ 数据占位——顺序很重要（长串在前）
    s = s.replace('elysiad.top/su — 致苏', '{{ meta.title }}')
    s = s.replace('致苏 — elysiad.top', '致{{ character.shortName }} — elysiad.top')
    s = s.replace('"name": "苏"', '"name": "{{ character.shortName }}"')
    s = s.replace('逐火十三英桀 · 刻印「天慧」。', '{{ meta.description }}')
    s = s.replace('https://elysiad.top/su/', '{{ meta.canonical }}')
    # ⑤ og:description / og:image / theme-color 用独立数据（可能与本页 description 不同）
    s = s.replace('content="{{ meta.description }}"', 'content="{{ meta.description }}"')
    s = re.sub(r'(<meta property="og:description" content=")[^"]*(")', r'\1{{ meta.ogDescription }}\2', s, count=1)
    s = re.sub(r'(<meta property="og:image" content=")[^"]*(")', r'\1{{ meta.ogImage }}\2', s, count=1)
    # theme-color 可能缺失（hua/pardofelis）⇒ 整行条件化
    # ⚠ 不能用 {% if %} 包整行：模板里那个换行会多吐一个空行（实测 diff 抓到）。
    #   改成整行当变量注入：有主题色就带换行，没有就一个字节都不多。
    s = re.sub(r'[ \t]*<meta name="theme-color"[^>]*>\n',
               '{{ themeColorTag | safe }}', s, count=1)
    # ⑥ 把占位插回样式区（保持顺序：page → signet-mark → badge → 私有修复）
    marker = '<!-- SECTION: styles -->'
    styles_tail = '\n'.join(['', marker, '{{ stylesHtml | safe }}', ''])
    if marker in s:
        s = s[:s.index(marker)] + styles_tail
    else:
        s = s + styles_tail

    base = ('<!DOCTYPE html>' + chr(10) + '<html lang="zh-CN">' + chr(10) + '<head>' + s + '</head>' + chr(10)
            + '<body{{ bodyAttrs | safe }}>' + '{{ pageBody | safe }}' + '</body>' + chr(10) + '</html>' + chr(10))
    os.makedirs(os.path.join(ROOT, 'templates'), exist_ok=True)
    open(os.path.join(ROOT, 'templates', 'base.njk'), 'w', encoding='utf-8', newline='').write(base)
    # 共享样式 partial：把刻印名/图变成变量
    # 三个共享块各自一个 partial（含 <style id> 标签本身），由 build 按每页令牌顺序拼接
    os.makedirs(os.path.join(ROOT, 'templates', 'partials'), exist_ok=True)
    for blk, name in ((smk, 'signet-mark'), (bad, 'signet-badge'), (ttf, 'touch-target')):
        if not blk:
            continue
        txt = blk.group(0).replace('天慧-256.webp', '{{ character.signetImage | replace("/images/signet/", "") }}')
        open(os.path.join(ROOT, 'templates', 'partials', name + '.njk'), 'w', encoding='utf-8', newline='').write(txt)
    open(os.path.join(ROOT, 'templates', 'pages', SRC + '.page-fixes.css'), 'w', encoding='utf-8', newline='').write('\n'.join(fixed))
    print('base.njk %d B；共享 partial 三个；su 私有修复块 %d 个' % (len(base), len(fixed)))
    print('base 里剩余 su 专属字样：天慧=%d 致苏=%d /su/=%d' % (base.count('天慧'), base.count('致苏'), base.count('/su/')))


if __name__ == '__main__':
    main()