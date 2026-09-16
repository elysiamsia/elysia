# tools/og_convert.py — 把 og 卡片从 PNG 转成 JPEG（本地工具，不部署）
#
# 为什么要转：PNG 一张 537~630 KB，而 QQ / 微信这类平台对分享缩略图的
# 体积容忍度很低，下载慢一点就可能直接不出预览。同图转 JPEG q92 只要约 89 KB
# （省 83%），肉眼看不出区别。
#
#   python tools/og_convert.py                # 把 images/og-*.png 全部转成 .jpg 并删除原 PNG
#   python tools/og_convert.py a.png b.jpg    # 转单个文件
#   python tools/og_convert.py --quality 90   # 指定质量（默认 92）
#
# 完整的出图流水线（先起本地服务器）：
#   python -m http.server 8500
#   for art in armor-pink armor-ego armor-elf; do
#     python tools/cdp.py "http://localhost:8500/tools/og-card.html?art=$art" \
#       size 1200x630 sleep 2200 shot /tmp/og.png
#     python tools/og_convert.py /tmp/og.png images/og-N.jpg
#   done
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / 'images'

QUALITY = 92


def convert(src: Path, dst: Path, quality: int) -> tuple[int, int]:
    before = src.stat().st_size
    with Image.open(src) as im:
        # JPEG 不支持透明；这几张卡片本来就是不透明背景
        im = im.convert('RGB')
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, 'JPEG', quality=quality, optimize=True, progressive=True, subsampling=1)
    return before, dst.stat().st_size


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    quality = QUALITY
    if '--quality' in sys.argv:
        quality = int(sys.argv[sys.argv.index('--quality') + 1])

    if len(args) == 2:
        src, dst = Path(args[0]), Path(args[1])
        before, after = convert(src, dst, quality)
        print('%s -> %s  %.0f KB -> %.0f KB  (省 %.1f%%)' % (
            src.name, dst.name, before / 1024, after / 1024, (1 - after / before) * 100))
        return

    # 批量模式：images/og-*.png -> .jpg，并删掉原 PNG
    pngs = sorted(p for p in IMAGES.glob('og-*.png') if p.stem != 'og')
    if not pngs:
        raise SystemExit('images/ 下没有 og-*.png。若已经是 .jpg 了就不用再转。')

    total_before = total_after = 0
    print('%-14s %10s %10s %8s' % ('文件', '原始', 'JPEG', '省下'))
    print('-' * 46)
    for src in pngs:
        dst = src.with_suffix('.jpg')
        before, after = convert(src, dst, quality)
        total_before += before
        total_after += after
        print('%-14s %8.0fKB %8.0fKB %7.1f%%' % (
            dst.name, before / 1024, after / 1024, (1 - after / before) * 100))
        src.unlink()
    print('-' * 46)
    print('%-14s %8.0fKB %8.0fKB %7.1f%%' % (
        '合计', total_before / 1024, total_after / 1024, (1 - total_after / total_before) * 100))
    print('\n原 PNG 已删除。记得同步更新 8 个页面里的 og:image 后缀（用 python tools/pick_og.py 会自动处理）。')


if __name__ == '__main__':
    main()
