# -*- coding: utf-8 -*-
"""从回放视频尾部抽帧，拼成结算画面总览"""
import os, subprocess, sys, glob, json
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VID = os.path.join(ROOT, "_video")
OUT = os.path.join(ROOT, "_frames", "tails")
os.makedirs(OUT, exist_ok=True)


def dur(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "format=duration", "-of", "csv=p=0", p],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except Exception:
        return 0


def tail_frame(mp4, tag, back=1.0):
    d = dur(mp4)
    if d <= 0:
        return None
    t = max(0, d - back)
    out = os.path.join(OUT, tag + ".png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "%.2f" % t, "-i", mp4,
                    "-frames:v", "1", out], capture_output=True)
    return out if os.path.exists(out) else None


if __name__ == "__main__":
    todo = json.load(open(sys.argv[1], encoding="utf-8"))
    got = []
    for tag, mp4 in todo:
        p = os.path.join(ROOT, mp4)
        if not os.path.exists(p):
            print("missing", mp4); continue
        f = tail_frame(p, tag)
        if f:
            got.append((tag, f)); print("OK", tag, flush=True)
    # 拼图：每个截到 640 宽，两列
    ims = []
    for tag, f in got:
        im = Image.open(f).convert("RGB")
        im = im.resize((640, int(im.height * 640.0 / im.width)), Image.LANCZOS)
        ims.append(im)
    if ims:
        cols = 2
        cw = 640
        ch = max(i.height for i in ims)
        rows = (len(ims) + cols - 1) // cols
        c = Image.new("RGB", (cw * cols, ch * rows), (0, 0, 0))
        for i, im in enumerate(ims):
            c.paste(im, ((i % cols) * cw, (i // cols) * ch))
        # 分片，避免过大
        per = 8
        for k in range(0, len(ims), per):
            sub = ims[k:k + per]
            r = (len(sub) + 1) // 2
            cc = Image.new("RGB", (640 * 2, ch * r), (0, 0, 0))
            for i, im in enumerate(sub):
                cc.paste(im, ((i % 2) * 640, (i // 2) * ch))
            cc.save(os.path.join(OUT, "tile_%d.png" % (k // per + 1)))
            print("tile_%d.png" % (k // per + 1), [t for t, _ in sub])
