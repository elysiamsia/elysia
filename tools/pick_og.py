# tools/pick_og.py — 随机挑选当前生效的分享卡片
#
#   python tools/pick_og.py            随机换成另一张（避开当前这张）
#   python tools/pick_og.py --list     看看有哪些变体、当前生效的是哪张
#   python tools/pick_og.py --set 2    指定用第 2 张
#
# 它做的事：把 8 个页面 HTML 里 og:image 的 content 统一改成
# https://elysiad.top/images/og-<n>.<ext>（.jpg 优先，也认 .png）。
#
# 为什么是「轮换」而不是「每次分享都随机」：微信 / QQ 的预览图是平台抓取后
# 自己缓存的，缓存期可能长达数天到数周，服务端随机对它们无效。所以做法是
# 「轮换当前生效的那张」——跑一次，之后所有分享统一换成新的那张。
#
# ── 重新出图的完整流水线 ──────────────────────────────────────────
# 卡片是 JPEG 而不是 PNG：PNG 一张 537~630 KB，QQ / 微信对缩略图体积容忍度低，
# 下载慢就可能直接不出预览。转 JPEG q92 后每张只要 89~129 KB（省 82%）。
#
#   python -m http.server 8500
#   i=1
#   for art in armor-pink armor-ego armor-elf; do
#     python tools/cdp.py "http://localhost:8500/tools/og-card.html?art=$art" \
#       size 1200x630 sleep 2200 shot /tmp/og-render.png
#     python tools/og_convert.py /tmp/og-render.png images/og-$i.jpg
#     i=$((i+1))
#   done
#   python tools/pick_og.py --set 1
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / 'images'

PAGES = [
    'index.html', 'armor.html',
    'aponia/index.html', 'eden/index.html', 'kalpas/index.html',
    'kevin/index.html', 'su/index.html', 'villv/index.html',
]

# 变体编号 → 立绘，仅用于打印说明
LABELS = {
    1: '粉色妖精小姐♪（初遇那位粉色妖精）',
    2: '真我·人之律者（她的本质形态）',
    3: '嗨♪爱愿妖精♥（黄金庭院再舞）',
}

PATTERN = re.compile(
    r'(property="og:image"\s+content="https://elysiad\.top/)images/og(?:-\d+)?\.(?:png|jpg)(")'
)


def variants() -> list:
    """列出所有变体。`.jpg` 优先（体积小、平台友好），也兼容 `.png`。"""
    by_num = {}
    for ext in ('jpg', 'png'):
        for p in sorted(IMAGES.glob('og-*.%s' % ext)):
            m = re.fullmatch(r'og-(\d+)', p.stem)
            if m:
                n = int(m.group(1))
                by_num.setdefault(n, p)   # jpg 先扫，png 不会覆盖它
    return [by_num[n] for n in sorted(by_num)]


def current():
    """从 index.html 读出当前生效的变体文件名"""
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    m = re.search(r'property="og:image"\s+content="https://elysiad\.top/images/(og[-\d]*\.\w+)', html)
    return m.group(1) if m else None


def apply(name: str) -> int:
    changed = 0
    for rel in PAGES:
        f = ROOT / rel
        if not f.exists():
            print('  ⚠ 跳过（不存在）：%s' % rel)
            continue
        text = f.read_text(encoding='utf-8')
        new, n = PATTERN.subn(r'\g<1>images/%s\g<2>' % name, text)
        if n == 0:
            print('  ⚠ 未找到 og:image 行：%s' % rel)
            continue
        if new != text:
            f.write_text(new, encoding='utf-8')
            changed += 1
    return changed


def main() -> None:
    vs = variants()
    if not vs:
        raise SystemExit('images/ 下没有 og-*.jpg 变体。出图流水线见本文件顶部注释。')

    cur = current()

    if '--list' in sys.argv:
        print('共 %d 张变体：' % len(vs))
        for p in vs:
            n = int(p.stem.split('-')[1])
            mark = ' ← 当前生效' if p.name == cur else ''
            print('  %-12s %s%s' % (p.name, LABELS.get(n, ''), mark))
        return

    if '--set' in sys.argv:
        try:
            want = int(sys.argv[sys.argv.index('--set') + 1])
        except (IndexError, ValueError):
            raise SystemExit('用法：python tools/pick_og.py --set <编号>')
        match = [p for p in vs if int(p.stem.split('-')[1]) == want]
        if not match:
            raise SystemExit('找不到编号为 %d 的变体' % want)
        target = match[0].name
    else:
        import random
        pool = [p.name for p in vs if p.name != cur] or [p.name for p in vs]
        target = random.choice(pool)

    n = apply(target)
    num = int(target.rsplit('.', 1)[0].split('-')[1])
    print('当前生效：%s  %s' % (target, LABELS.get(num, '')))
    print('已更新 %d 个页面。' % n)
    print('\n下次自动轮换：再跑一次不带参数的 python tools/pick_og.py')


if __name__ == '__main__':
    main()
