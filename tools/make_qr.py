# -*- coding: utf-8 -*-
"""
tools/make_qr.py — 生成站上那张二维码（`images/qr-elysiad.png`）

**为什么要把「生成」也放进 tools/**：那张图是要长期躺在仓库里的**站点资源**，
而域名固定不变 —— 留在仓库里，换机器 / 换域名时能一条命令重来一次。
（同类先例：`to_webp.py` / `og_convert.py`。）

**为什么不用前端 QR 库**：这个站的纪律是**轻、且不依赖外网**。
最小的 QR 库也要 ~10KB，而这里只需要一张固定的图。

样式（spec §六）：指向 `https://elysiad.top/`；模块 `#5a189a`（她的 `--purple-ink`）、
底 `#ffc8dd`（她的 `--pink-mist`）；**整张图四角圆角（透明角）**。

⚠⚠ **模块必须画成直角，不许做圆角。** 2026-10-02 实测（拿解码器逐项二分）：

    | 样式                          | 能不能解出来 |
    |-------------------------------|-------------|
    | 全直角                        | ✓           |
    | **模块圆角 20% / 35%**        | **✗ 解不出来** |
    | 整张图圆角 24px（不透明/透明角）| ✓           |

    模块一圆角，三个定位角的黑白比例就歪了 —— 而那正是扫码器最挑的地方
    （真实的微信 / QQ 扫码同样看这个比例，不是解码器苛刻）。
    **要改样式，改完必须跑 `--only qr` 真解一次。**

⚠ **改样式之后一定要跑 `tools/check_postcard.py --only qr`** ——
  圆角做过头、配色对比度不够，都会让**扫不出来**，而页面上完全看不出来。
  那条判据是拿解码器**真解一次**，不是「看着像二维码」。

依赖（只在这台机器上，仓库不留）：`pip install qrcode pillow`

跑法：
    PYTHONIOENCODING=utf-8 python tools/make_qr.py
"""
import os
import sys

from PIL import Image, ImageDraw
import qrcode

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'images', 'qr-elysiad.png')

URL = 'https://elysiad.top/'     # ⚠ 结尾斜杠别丢 —— 与 spec §六 一致
SIZE = 240                       # 最终边长
SUPER = 4                        # 先在 4 倍尺寸上画、再缩回来（边缘才干净）
DARK = (0x5a, 0x18, 0x9a)        # #5a189a 她的 --purple-ink
LIGHT = (0xff, 0xc8, 0xdd)       # #ffc8dd 她的 --pink-mist
CORNER = 24                      # 整张图的圆角半径（最终尺寸下的像素）
# ⚠ 模块**不做圆角**（实测一圆角就解不出来，见文件头那段）


def build_matrix(text):
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4, box_size=1)
    qr.add_data(text)
    qr.make(fit=True)
    return qr.get_matrix()


def main():
    m = build_matrix(URL)
    n = len(m)                                   # 含静默区的边长（模块数）
    box = max(4, (SIZE * SUPER) // n)            # 每格多少像素（4 倍尺寸下）
    side = n * box
    img = Image.new('RGBA', (side, side), LIGHT + (255,))
    d = ImageDraw.Draw(img)
    for y, row in enumerate(m):
        for x, dark in enumerate(row):
            if not dark:
                continue
            x0, y0 = x * box, y * box
            d.rectangle([x0, y0, x0 + box - 1, y0 + box - 1], fill=DARK + (255,))

    # 整张图的圆角：拿一张 mask 贴上去，四角做掉
    mask = Image.new('L', (side, side), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, side - 1, side - 1],
                                          radius=int(CORNER * SUPER), fill=255)
    out = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out = out.resize((SIZE, SIZE), Image.LANCZOS)

    if not os.path.isdir(os.path.dirname(OUT)):
        os.makedirs(os.path.dirname(OUT))
    out.save(OUT, 'PNG', optimize=True)
    print(u'%s  %dx%d  %.1f KB（模块 %d×%d，含静默区）'
          % (OUT, SIZE, SIZE, os.path.getsize(OUT) / 1024.0, n, n))
    print(u'⚠ 现在去跑：PYTHONIOENCODING=utf-8 python tools/check_postcard.py --only qr')
    return 0


if __name__ == '__main__':
    sys.exit(main())
