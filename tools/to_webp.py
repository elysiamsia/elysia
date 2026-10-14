# tools/to_webp.py — 把站点图片批量转成 WebP（本地工具，不部署）
#
#   python tools/to_webp.py            # 转换 + 报告体积
#   python tools/to_webp.py --dry-run  # 只看会做什么，不写文件
#
# 依赖：Pillow（已确认本机 11.3.0 可用，且支持 WebP）
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / 'images'
# ⚠ 2026-10-15（精修计划 4.3）：webp 的**源 PNG** 挪出了 `images/` 根目录 ——
#   它们没有任何地方引用，却因为 `static.yml` 是整目录拷 `images/` 而进了产物（6.24 MB）。
#   现在放在 `images/raw/webp-src/`：`images/raw` 本来就被部署排除（而且带构建自检），
#   所以「`images/` 根目录里留的都是真正被引用的东西」这条规矩能一直守住。
SRC = IMG / 'raw' / 'webp-src'
QUALITY = 82
METHOD = 6          # 0~6，越大越慢压得越好
MAX_EDGE = 1024     # 原始最大边就不超过它，这里只做保护性缩放

# 站点真正引用的 10 张（images/raw/ 是素材，不转）
TARGETS = [
    'armor-pink', 'armor-ego', 'armor-elf',
    'skin-1', 'skin-2', 'skin-3', 'skin-4', 'skin-5',
    'griseo-young', 'griseo-grown',   # 格蕾修页「成长形态」两张真立绘（transparent PNG → webp）
]

# ── 派生小图（精修计划 4.1，2026-10-15 加）────────────────────────────────
# 为什么要它：实测（tools/check_page_health.py）
#   · 首页明信片选择器的八张立绘**只显示 54×72**，却在下 1024px 的原图 —— 880 KB；
#   · armor 卡片的立绘显示 341px 宽，2x 屏要 ~700px 才够清楚（原图 1024 是 3x）。
# 所以按用途各出一档：thumb 给选择器直接换 src，mid 给 armor 走 <img srcset>。
# ⚠ 从 **PNG 源**出（不是从 webp 再压一次）—— 少一代损失。
DERIVATIVES = [
    ('thumb', 200),   # 明信片选择器格子：54×72，按 3x 屏算 216 也够
    ('mid',   700),   # armor 卡片：341px 宽 × 2x ≈ 682
]


def convert(name: str, dry: bool) -> tuple[int, int, tuple[int, int]]:
    src = SRC / f'{name}.png'
    dst = IMG / f'{name}.webp'
    if not src.exists():
        raise SystemExit(f'找不到源文件：{src}')

    before = src.stat().st_size
    with Image.open(src) as im:
        im.load()
        size = im.size
        if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
            im = im.convert('RGBA')
        else:
            im = im.convert('RGB')
        if max(im.size) > MAX_EDGE:
            ratio = MAX_EDGE / max(im.size)
            im = im.resize((round(im.width * ratio), round(im.height * ratio)), Image.LANCZOS)
        if not dry:
            im.save(dst, 'WEBP', quality=QUALITY, method=METHOD)

    after = dst.stat().st_size if dst.exists() else 0
    return before, after, size


def derivative(name: str, sub: str, width: int, dry: bool) -> tuple[int, int, tuple[int, int], str]:
    """出一张派生小图：images/<sub>/<name>-<width>.webp。"""
    src = SRC / f'{name}.png'
    if not src.exists():
        raise SystemExit(f'找不到源文件：{src}')
    out_dir = IMG / sub
    dst = out_dir / f'{name}-{width}.webp'
    before = src.stat().st_size
    with Image.open(src) as im:
        im.load()
        if im.width <= width:
            return before, 0, (im.width, im.height), 'skip（源本来就比目标窄）'
        ratio = width / im.width
        new_size = (width, max(1, round(im.height * ratio)))
        if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
            im = im.convert('RGBA')
        else:
            im = im.convert('RGB')
        im = im.resize(new_size, Image.LANCZOS)
        if not dry:
            out_dir.mkdir(parents=True, exist_ok=True)
            im.save(dst, 'WEBP', quality=QUALITY, method=METHOD)
    after = dst.stat().st_size if dst.exists() else 0
    return before, after, new_size, 'ok'


def derivatives_main(dry: bool) -> None:
    print(f'{"派生":<10}{"用途":<7}{"源":>9}{"产物":>9}  尺寸')
    print('-' * 66)
    total = 0
    for sub, width in DERIVATIVES:
        for name in TARGETS:
            before, after, size, status = derivative(name, sub, width, dry)
            total += after
            print(f'{name + "-" + str(width):<20}{sub:<7}{before/1024:>7.0f}KB{after/1024:>7.0f}KB  {size[0]}x{size[1]}  {status}')
    print('-' * 66)
    print(f'{"派生小图合计":<27}{total/1024:>16.0f}KB')
    if dry:
        print('\n（--dry-run，未写入任何文件）')


def main() -> None:
    if '--derivatives' in sys.argv:
        derivatives_main('--dry-run' in sys.argv)
        return
    dry = '--dry-run' in sys.argv
    total_before = total_after = 0
    print(f'{"文件":<20}{"原始":>10}{"WebP":>10}{"省下":>9}  尺寸')
    print('-' * 62)
    for name in TARGETS:
        before, after, size = convert(name, dry)
        total_before += before
        total_after += after
        pct = (1 - after / before) * 100 if before else 0
        print(f'{name + ".webp":<20}{before/1024:>8.0f}KB{after/1024:>8.0f}KB{pct:>8.1f}%  {size[0]}x{size[1]}')
    print('-' * 62)
    pct = (1 - total_after / total_before) * 100 if total_before else 0
    print(f'{"合计":<20}{total_before/1024/1024:>7.2f}MB{total_after/1024/1024:>9.2f}MB{pct:>8.1f}%')
    if dry:
        print('\n（--dry-run，未写入任何文件）')


if __name__ == '__main__':
    main()
