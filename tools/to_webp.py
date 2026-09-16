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
QUALITY = 82
METHOD = 6          # 0~6，越大越慢压得越好
MAX_EDGE = 1024     # 原始最大边就不超过它，这里只做保护性缩放

# 站点真正引用的 8 张（images/raw/ 是素材，不转）
TARGETS = [
    'armor-pink', 'armor-ego', 'armor-elf',
    'skin-1', 'skin-2', 'skin-3', 'skin-4', 'skin-5',
]


def convert(name: str, dry: bool) -> tuple[int, int, tuple[int, int]]:
    src = IMG / f'{name}.png'
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


def main() -> None:
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
