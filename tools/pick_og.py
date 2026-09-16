# tools/pick_og.py — 随机挑选当前生效的分享卡片
#
#   python tools/pick_og.py            随机换成另一张（避开当前这张）
#   python tools/pick_og.py --list     看看有哪些变体、当前生效的是哪张
#   python tools/pick_og.py --set 2    指定用第 2 张
#
# 它做的事：把 8 个页面 HTML 里 og:image 的 content 统一改成
# https://elysiad.top/images/og-<n>.png。
#
# 为什么不是「每次分享都随机」：微信 / QQ 的预览图是平台抓取后自己缓存的，
# 缓存期可能长达数天到数周，服务端随机对它们无效。所以做法是
# 「轮换当前生效的那张」——跑一次，之后所有分享统一换成新的那张。
#
# 生成变体用：
#   python -m http.server 8500
#   python tools/cdp.py "http://localhost:8500/tools/og-card.html?art=armor-pink" \
#     size 1200x630 sleep 2200 shot images/og-1.png
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

PATTERN = re.compile(r'(property="og:image"\s+content="https://elysiad\.top/)images/og(?:-\d+)?\.png(")')


def variants() -> list[Path]:
    found = []
    for p in sorted(IMAGES.glob('og-*.png')):
        m = re.fullmatch(r'og-(\d+)', p.stem)
        if m:
            found.append(p)
    return sorted(found, key=lambda p: int(p.stem.split('-')[1]))


def current() -> str | None:
    """从 index.html 读出当前生效的变体文件名"""
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    m = re.search(r'property="og:image"\s+content="https://elysiad\.top/images/(og[-\d]*\.png)"', html)
    return m.group(1) if m else None


def apply(name: str) -> int:
    changed = 0
    for rel in PAGES:
        f = ROOT / rel
        if not f.exists():
            print(f'  ⚠ 跳过（不存在）：{rel}')
            continue
        text = f.read_text(encoding='utf-8')
        new, n = PATTERN.subn(rf'\g<1>images/{name}\g<2>', text)
        if n == 0:
            print(f'  ⚠ 未找到 og:image 行：{rel}')
            continue
        if new != text:
            f.write_text(new, encoding='utf-8')
            changed += 1
    return changed


def main() -> None:
    vs = variants()
    if not vs:
        raise SystemExit('images/ 下没有 og-*.png 变体。先按本文件顶部注释里的命令生成。')

    cur = current()

    if '--list' in sys.argv:
        print(f'共 {len(vs)} 张变体：')
        for p in vs:
            n = int(p.stem.split('-')[1])
            mark = ' ← 当前生效' if p.name == cur else ''
            print(f'  og-{n}.png  {LABELS.get(n, "")}{mark}')
        return

    if '--set' in sys.argv:
        try:
            want = int(sys.argv[sys.argv.index('--set') + 1])
        except (IndexError, ValueError):
            raise SystemExit('用法：python tools/pick_og.py --set <编号>')
        target = f'og-{want}.png'
        if not (IMAGES / target).exists():
            raise SystemExit(f'找不到 {target}')
    else:
        import random
        pool = [p.name for p in vs if p.name != cur] or [p.name for p in vs]
        target = random.choice(pool)

    n = apply(target)
    print(f'当前生效：{target}  {LABELS.get(int(target.split("-")[1].split(".")[0]), "")}')
    print(f'已更新 {n} 个页面。')
    print('\n下次自动轮换：再跑一次不带参数的 python tools/pick_og.py')


if __name__ == '__main__':
    main()
