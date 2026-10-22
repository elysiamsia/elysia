# -*- coding: utf-8 -*-
"""tools/refactor/diff_pages.py —— DOM 规范化 diff（重构阶段 1 的硬门槛）

用法：
    python tools/refactor/diff_pages.py <old.html> <new.html> [--allow-theme-json] [--report out.md]

设计（对应审阅意见 #5）：
  · 不用正则抓 THEME —— 交给 theme_extract.mjs 做括号配对 + 求值；
  · 两侧 THEME **语义相等**（规范化 JSON 的 hash 相同）时，把各自原文跨度原地换成同一个占位符再 diff
    （结构性豁免）；**不相等就不豁免**，差异照报；
  · <script>/<style> 内部按原文比对，不做空白折叠（否则误报）；
  · 属性按名排序、文本空白折叠 —— 只抹掉「写法噪声」，不抹语义。
退出码：0 无差异；1 有差异（或用法错误）。
"""
import sys
import os
import json
import subprocess
import difflib
import html.parser

HERE = os.path.dirname(os.path.abspath(__file__))
EXTRACT = os.path.join(HERE, 'theme_extract.mjs')
RAW_TAGS = ('script', 'style')


class Tok(html.parser.HTMLParser):
    def __init__(self):
        html.parser.HTMLParser.__init__(self, convert_charrefs=False)
        self.tokens = []
        self.in_raw = 0

    def _attrs(self, attrs):
        parts = []
        for k, v in sorted(attrs):
            parts.append(k if v is None else '%s=%s' % (k, v))
        return (' ' + ' '.join(parts)) if parts else ''

    def handle_starttag(self, tag, attrs):
        self.in_raw = 1 if tag in RAW_TAGS else 0
        self.tokens.append('<%s%s>' % (tag, self._attrs(attrs)))

    def handle_startendtag(self, tag, attrs):
        self.tokens.append('<%s%s/>' % (tag, self._attrs(attrs)))

    def handle_endtag(self, tag):
        self.in_raw = 0
        self.tokens.append('</%s>' % tag)

    def handle_data(self, data):
        if self.in_raw:
            self.tokens.append('RAW:' + data)
        else:
            text = ' '.join(data.split())
            if text:
                self.tokens.append(text)

    def handle_comment(self, data):
        self.tokens.append('<!--%s-->' % ' '.join(data.split()))

    def handle_decl(self, decl):
        self.tokens.append('<!%s>' % decl)

    def handle_entityref(self, name):
        self.tokens.append('&%s;' % name)

    def handle_charref(self, name):
        self.tokens.append('&#%s;' % name)


def extract(path):
    try:
        out = subprocess.check_output(['node', EXTRACT, path])
    except Exception:
        return None
    try:
        return json.loads(out.decode('utf-8', 'replace').strip().splitlines()[-1])
    except Exception:
        return None


def strip_theme(text):
    """把 var THEME = {...}; 的对象字面量换成哨兵（**Python 自己扫括号**，不依赖 node 的 span）。
    为什么要自己扫：JS 字面量与 JSON 形态下，node 侧算出的 span 起点会差 1~2 个字符，
    导致占位符落点不同 → diff 假报差异（2026-10-18 实测，绕了很久）。
    """
    at = text.find('var THEME')
    if at < 0:
        return text, None
    i = text.find('{', at)
    if i < 0:
        return text, None
    depth, quote, esc, j = 0, None, False, i
    lit_end = -1
    while j < len(text):
        c = text[j]
        if quote:
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == quote:
                quote = None
        else:
            if c in '"\'`':
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
                    lit_end = j + 1
                    break
        j += 1
    if lit_end < 0:
        return text, None
    return text[:i] + 'THEME_SENTINEL' + text[lit_end:], text[i:lit_end]


def load(path, allow_theme):
    with open(path, 'rb') as f:
        raw = f.read()
    text = raw.decode('utf-8', 'replace')
    theme_hash = None
    if allow_theme:
        # 只用 Python 自行剥离（node 侧的 span 在 JSON 形态下会差字符，已废弃不用）
        text, _lit = strip_theme(text)
        info = extract(path)
        if info:
            theme_hash = info.get('hash')
    parser = Tok()
    parser.feed(text)
    parser.close()
    return parser.tokens, theme_hash

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) < 2:
        print('usage: diff_pages.py <old> <new> [--allow-theme-json] [--report out.md]')
        return 1
    old_path, new_path = args[0], args[1]
    allow = '--allow-theme-json' in sys.argv
    report = None
    if '--report' in sys.argv:
        idx = sys.argv.index('--report')
        if idx + 1 < len(sys.argv):
            report = sys.argv[idx + 1]

    old_tokens, old_hash = load(old_path, allow)
    new_tokens, new_hash = load(new_path, allow)

    # 豁免判定：两侧 THEME 的规范化 hash 相等 ⇒ 已在 load() 里用文本哨兵抹平，可直接比。
    exempted = bool(allow and old_hash and new_hash and old_hash == new_hash)
    if allow and not exempted:
        old_tokens, _ = load(old_path, False)
        new_tokens, _ = load(new_path, False)

    diff = list(difflib.unified_diff(old_tokens, new_tokens, fromfile=old_path,
                                     tofile=new_path, lineterm='', n=2))
    added = sum(1 for l in diff if l.startswith('+') and not l.startswith('+++'))
    removed = sum(1 for l in diff if l.startswith('-') and not l.startswith('---'))
    first = ''
    for line in diff:
        if line.startswith(('+', '-')) and not line.startswith(('+++', '---')):
            first = line[:160]
            break

    if report:
        with open(report, 'w', encoding='utf-8') as f:
            f.write('# diff: %s -> %s' % (old_path, new_path) + chr(10) + chr(10))
            f.write('THEME 语义豁免: %s' % ('是（规范化 hash 相等）' if exempted else '否') + chr(10) + chr(10))
            f.write('新增 %d 行 / 删除 %d 行' % (added, removed) + chr(10) + chr(10))
            f.write('~~~diff' + chr(10) + chr(10).join(diff[:400]) + chr(10) + '~~~' + chr(10))

    print(json.dumps({'changed_lines': added + removed, 'added': added, 'removed': removed,
                      'theme_exempted': exempted, 'first_diff': first,
                      'report': report}, ensure_ascii=False))
    return 0 if (added + removed) == 0 else 1


if __name__ == '__main__':
    sys.exit(main())