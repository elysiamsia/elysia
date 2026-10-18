# -*- coding: utf-8 -*-
"""tools/refactor/split_page.py —— 把一个页面拆成模板所需的零件（零改写，原文搬运）

产出（templates/pages/ 下）：
  <key>.page.css        页面私有「大块」样式（无 id 的那个 <style>）
  <key>.page-fixes.css  页面私有的修复块（touch-target-fix 之外的 narrow-320 / mobile-ovf / threshold-44），保持原顺序
  <key>.page.body.html  <body> 内部原文，仅把 `var THEME = {...}` 换成 `var THEME = /*@THEME@*/;`

⚠ 共享块（signet-mark / signet-badge-css / touch-target-fix）**不进零件** —— 由 base.njk 统一渲染。
⚠ 顺序契约（12 页实测一致）：page → signet-mark → signet-badge-css → [页面私有修复块]。
"""
import os
import re
import sys
import json
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXTRACT = os.path.join(ROOT, 'tools', 'refactor', 'theme_extract.mjs')
SHARED = ('signet-mark', 'signet-badge-css', 'touch-target-fix')


def blocks(head):
    out = []
    for m in re.finditer(r'<style([^>]*)>([\s\S]*?)</style>', head):
        attrs = m.group(1)
        sid = (re.search(r'id="([^"]+)"', attrs) or [None, None])[1]
        out.append({'id': sid, 'text': m.group(0)})
    return out


def scan_literal(text, start):
    """从 text[start] 的 `{` 起扫到配对 `}`（尊重字符串/注释）。返回 (起, 止)。"""
    depth, quote, esc, j, end = 0, None, False, start, -1
    while j < len(text):
        c = text[j]
        if quote:
            if esc:
                esc = False
            elif c == chr(92):
                esc = True
            elif c == quote:
                quote = None
        else:
            if c in '"' + chr(39) + chr(96):
                quote = c
            elif c == '/' and j + 1 < len(text) and text[j + 1] == '/':
                while j < len(text) and text[j] != chr(10):
                    j += 1
            elif c == '/' and j + 1 < len(text) and text[j + 1] == '*':
                j += 2
                while j + 1 < len(text) and not (text[j] == '*' and text[j + 1] == '/'):
                    j += 1
                j += 1
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    end = j + 1
                    break
        j += 1
    return start, end


def main():
    key = sys.argv[1]
    page_dir = os.path.join(ROOT, 'templates', 'pages')
    os.makedirs(page_dir, exist_ok=True)
    html = open(os.path.join(ROOT, key, 'index.html'), encoding='utf-8').read()
    m = re.search(r'<head[^>]*>([\s\S]*?)</head>', html, re.I)
    head = m.group(1)
    bm = re.search(r'<body([^>]*)>([\s\S]*)</body>', html, re.I)
    body = bm.group(2)

    bs = blocks(head)
    page_style = [b for b in bs if b['id'] is None]
    fixes = [b for b in bs if b['id'] and b['id'] not in SHARED]
    shared = [b for b in bs if b['id'] in SHARED]

    open(os.path.join(page_dir, key + '.page.css'), 'w', encoding='utf-8', newline='').write(page_style[0]['text'] if page_style else '')
    open(os.path.join(page_dir, key + '.page-fixes.css'), 'w', encoding='utf-8', newline='').write('\n'.join(b['text'] for b in fixes))

    # ⚠ 用 Python 自己扫括号（node 的 span 在 JSON 形态下会差 1~2 字符，
    #   曾导致注入后残留多余花括号、构建产物 THEME 非法 —— 2026-10-18 实测）
    ti = body.find('var THEME')
    if ti < 0:
        print('body 里找不到 var THEME')
        return 1
    brace = body.find('{', ti)
    ra, rb = scan_literal(body, brace)
    if rb < 0:
        print('THEME 括号不配对')
        return 1
    new_body = body[:ra] + '/*@THEME@*/' + body[rb:]
    open(os.path.join(page_dir, key + '.page.body.html'), 'w', encoding='utf-8', newline='').write(new_body)
    print('%s: 大块样式 %d B / 私有修复块 %d 个 / body %d B / 共享块 %s'
          % (key, len(page_style[0]['text']) if page_style else 0, len(fixes), len(new_body), [b['id'] for b in shared]))
    return 0


if __name__ == '__main__':
    sys.exit(main())