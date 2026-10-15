# -*- coding: utf-8 -*-
"""用 playurl API (platform=html5) 下载 B站 单个分P 视频"""
import json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VID = os.path.join(ROOT, "_video")
os.makedirs(VID, exist_ok=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"

def get_url(bvid, cid):
    api = ("https://api.bilibili.com/x/player/playurl?bvid=%s&cid=%s&qn=64&fnval=16"
           "&platform=html5&high_quality=1" % (bvid, cid))
    p = subprocess.run(["curl", "-s", "--max-time", "30", "-H", "User-Agent: " + UA,
                        "-H", "Referer: https://www.bilibili.com/video/" + bvid, api],
                       capture_output=True)
    try:
        j = json.loads(p.stdout.decode("utf-8", "replace"))
    except Exception:
        return None, None
    d = j.get("data") or {}
    durl = d.get("durl") or []
    if durl:
        return durl[0]["url"], d.get("quality")
    dash = d.get("dash")
    if dash:
        return (dash.get("video") or [{}])[0].get("baseUrl"), d.get("quality")
    return None, None

def download(bvid, cid, out):
    if os.path.exists(out) and os.path.getsize(out) > 10000:
        print("skip", out); return True
    url, q = get_url(bvid, cid)
    if not url:
        print("NOURL", bvid, cid); return False
    p = subprocess.run(["curl", "-s", "--max-time", "300", "-L",
                        "-H", "User-Agent: " + UA,
                        "-H", "Referer: https://www.bilibili.com/video/" + bvid,
                        "-o", out, url], capture_output=True)
    ok = os.path.exists(out) and os.path.getsize(out) > 10000
    print(("OK " if ok else "FAIL "), os.path.basename(out), q,
          os.path.getsize(out) if os.path.exists(out) else 0, flush=True)
    time.sleep(1.2)
    return ok

if __name__ == "__main__":
    bvid = sys.argv[1]
    pairs = [x.split(":") for x in sys.argv[2:]]  # cid:part
    for cid, part in pairs:
        out = os.path.join(VID, "%s_p%s.mp4" % (bvid, part))
        download(bvid, cid, out)
