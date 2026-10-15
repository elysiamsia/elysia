# -*- coding: utf-8 -*-
"""把角色面板拼成 2x2 网格图，便于一次读取多个角色"""
import os, sys, json
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "_panels")
OUT = os.path.join(ROOT, "_panels")


def grid(paths, out, cols=2, scale=2.0):
    ims = []
    for p in paths:
        im = Image.open(p).convert("RGB")
        w = int(im.width * scale / 3.0)   # 源为 3x
        h = int(im.height * scale / 3.0)
        ims.append(im.resize((w, h), Image.LANCZOS))
    cw = max(i.width for i in ims); ch = max(i.height for i in ims)
    rows = (len(ims) + cols - 1) // cols
    canvas = Image.new("RGB", (cw * cols, ch * rows), (30, 30, 40))
    for i, im in enumerate(ims):
        canvas.paste(im, ((i % cols) * cw, (i // cols) * ch))
    canvas.save(out)
    print("wrote", out, canvas.size)


if __name__ == "__main__":
    groups = json.load(open(sys.argv[1], encoding="utf-8"))
    for name, paths in groups.items():
        grid([os.path.join(P, p) for p in paths], os.path.join(OUT, name))
