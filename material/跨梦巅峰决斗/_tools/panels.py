# -*- coding: utf-8 -*-
"""从分析视频中自动定位角色对比面板帧，裁出左右面板 + 底部赔率条"""
import os, subprocess, sys, shutil, json
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VID = os.path.join(ROOT, "_video")
OUT = os.path.join(ROOT, "_panels")
TMP = os.path.join(ROOT, "_tmp_frames")
os.makedirs(OUT, exist_ok=True)

# 面板区域 (x,y,w,h) —— 基于 1280x592 布局
LEFT = (190, 28, 425, 462)
RIGHT = (666, 28, 425, 462)
BAR = (0, 540, 1280, 52)

# 检测区：左面板技能文字区(浅色)
DET = (205, 250, 380, 180)


def probe(path):
    p = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
                       capture_output=True, text=True)
    try:
        w, h = p.stdout.strip().split(",")[:2]
        return int(w), int(h)
    except Exception:
        return None, None


def bright(path, w, h):
    im = Image.open(path).convert("L")
    a = np.asarray(im, dtype=np.float32)
    # 归一化到 1280x592 坐标系
    sx, sy = w / 1280.0, h / 592.0
    x, y, ww, hh = DET
    sub = a[int(y * sy):int((y + hh) * sy), int(x * sx):int((x + ww) * sx)]
    return float(sub.mean())


def extract(mp4, tag, fps=2):
    w, h = probe(mp4)
    if not w:
        print("PROBE FAIL", mp4); return None
    d = os.path.join(TMP, tag)
    if os.path.isdir(d):
        shutil.rmtree(d)
    os.makedirs(d, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-i", mp4, "-vf", "fps=%d" % fps,
                    os.path.join(d, "f_%04d.png")], capture_output=True)
    files = sorted(os.listdir(d))
    scored = [(f, bright(os.path.join(d, f), w, h)) for f in files]
    ok = [s for s in scored if s[1] > 200]
    if not ok:
        best = max(scored, key=lambda s: s[1]) if scored else None
        print("NOPANEL", tag, "max=%.1f" % (best[1] if best else -1))
        return None
    # 取浅色帧中最靠后的（面板已稳定）
    pick = ok[-1][0]
    src = os.path.join(d, pick)
    res = {}
    for name, (x, y, ww, hh) in (("L", LEFT), ("R", RIGHT), ("B", BAR)):
        crop = Image.open(src).crop((x, y, x + ww, y + hh))
        scale = 3 if name != "B" else 2
        crop = crop.resize((crop.width * scale, crop.height * scale), Image.LANCZOS)
        f = os.path.join(OUT, "%s_%s.png" % (tag, name))
        crop.save(f)
        res[name] = f
    shutil.rmtree(d, ignore_errors=True)
    print("OK", tag, "frame", pick, "bright=%.1f" % ok[-1][1], "detected=%d/%d" % (len(ok), len(scored)))
    return res


if __name__ == "__main__":
    tasks = json.load(open(sys.argv[1], encoding="utf-8"))  # [[tag, mp4], ...]
    out = {}
    for tag, mp4 in tasks:
        r = extract(mp4, tag)
        if r:
            out[tag] = r
    json.dump(out, open(os.path.join(OUT, "panels.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("total", len(out))
