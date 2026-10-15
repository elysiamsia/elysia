# -*- coding: utf-8 -*-
"""改进版：用「左右双面板 + 中间暗缝」特征定位角色对比帧"""
import os, subprocess, sys, json, shutil
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VID = os.path.join(ROOT, "_video")
OUT = os.path.join(ROOT, "_panels")
TMP = os.path.join(ROOT, "_tmp_frames")
os.makedirs(OUT, exist_ok=True)

LEFT = (190, 28, 425, 462)
RIGHT = (666, 28, 425, 462)
BAR = (0, 540, 1280, 52)

REG_A = (215, 255, 370, 170)      # 左面板技能文字区
REG_B = (690, 255, 370, 170)      # 右面板技能文字区
REG_GAP = (616, 90, 44, 380)      # 两卡之间的空隙（应为深色场景）


def probe(path):
    p = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
                       capture_output=True, text=True)
    w, h = p.stdout.strip().split(",")[:2]
    return int(w), int(h)


def mean_of(a, sx, sy, reg):
    x, y, w, h = reg
    return float(a[int(y * sy):int((y + h) * sy), int(x * sx):int((x + w) * sx)].mean())


def score(path, sx, sy):
    a = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    return mean_of(a, sx, sy, REG_A), mean_of(a, sx, sy, REG_B), mean_of(a, sx, sy, REG_GAP)


def extract(mp4, tag, fps=2):
    w, h = probe(mp4)
    sx, sy = w / 1280.0, h / 592.0
    d = os.path.join(TMP, tag)
    if os.path.isdir(d):
        shutil.rmtree(d)
    os.makedirs(d, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-i", mp4, "-vf", "fps=%d" % fps,
                    os.path.join(d, "f_%05d.png")], capture_output=True)
    files = sorted(os.listdir(d))
    scored = []
    for f in files:
        a, b, g = score(os.path.join(d, f), sx, sy)
        scored.append((f, a, b, g))
    ok = [s for s in scored if s[1] > 178 and s[2] > 178 and s[3] < 110]
    if not ok:
        ok = [s for s in scored if s[1] > 178 and s[2] > 178]
    if not ok:
        print("NOPANEL", tag)
        shutil.rmtree(d, ignore_errors=True)
        return None
    # 取靠后的稳定帧
    pick = ok[int(len(ok) * 0.75)][0]
    src = os.path.join(d, pick)
    res = {}
    for name, (x, y, ww, hh) in (("L", LEFT), ("R", RIGHT), ("B", BAR)):
        crop = Image.open(src).crop((x, y, x + ww, y + hh))
        s = 3 if name != "B" else 2
        crop = crop.resize((crop.width * s, crop.height * s), Image.LANCZOS)
        f2 = os.path.join(OUT, "%s_%s.png" % (tag, name))
        crop.save(f2)
        res[name] = f2
    p = [s for s in scored if s[0] == pick][0]
    print("OK", tag, pick, "A=%.0f B=%.0f GAP=%.0f" % (p[1], p[2], p[3]),
          "n=%d/%d" % (len(ok), len(scored)), flush=True)
    shutil.rmtree(d, ignore_errors=True)
    return res


if __name__ == "__main__":
    tasks = json.load(open(sys.argv[1], encoding="utf-8"))
    out = {}
    for tag, mp4 in tasks:
        try:
            r = extract(os.path.join(ROOT, mp4), tag)
        except Exception as e:
            print("ERR", tag, e); r = None
        if r:
            out[tag] = r
    json.dump(out, open(os.path.join(OUT, "panels.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("total", len(out))
