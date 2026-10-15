# -*- coding: utf-8 -*-
"""抓指定 aid 的全部评论(多种排序) + 指定 cid 的弹幕"""
import json, os, subprocess, sys, time, re, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "_raw")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"

def curl(url, referer="https://www.bilibili.com/"):
    p = subprocess.run(["curl", "-s", "--max-time", "25", "-H", "User-Agent: " + UA,
                        "-H", "Referer: " + referer, url], capture_output=True)
    return p.stdout if p.returncode == 0 else b""

def replies(aid, max_pages=30):
    out, seen = [], set()
    for sort in (2, 0):
        for pn in range(1, max_pages + 1):
            url = "https://api.bilibili.com/x/v2/reply?type=1&oid=%s&sort=%d&ps=20&pn=%d" % (aid, sort, pn)
            d = curl(url)
            try:
                j = json.loads(d.decode("utf-8", "replace"))
            except Exception:
                break
            if j.get("code") != 0:
                break
            reps = (j.get("data") or {}).get("replies") or []
            if not reps:
                break
            new = 0
            for r in reps:
                rid = r.get("rpid")
                if rid in seen:
                    continue
                seen.add(rid); new += 1
                out.append({"user": (r.get("member") or {}).get("uname"), "like": r.get("like"),
                            "ctime": r.get("ctime"), "message": (r.get("content") or {}).get("message"),
                            "sub": [{"user": (s.get("member") or {}).get("uname"), "like": s.get("like"),
                                     "message": (s.get("content") or {}).get("message")}
                                    for s in (r.get("replies") or [])]})
            if new == 0:
                break
            time.sleep(0.5)
    json.dump(out, open(os.path.join(RAW, "replyfull_%s.json" % aid), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    return out

def dm(cid):
    d = curl("https://api.bilibili.com/x/v1/dm/list.so?oid=%s" % cid)
    txt = d.decode("utf-8", "replace")
    items = re.findall(r'<d p="([^"]+)"[^>]*>(.*?)</d>', txt, re.S)
    res = []
    for p, t in items:
        parts = p.split(",")
        res.append({"t": parts[0] if parts else "", "mode": parts[1] if len(parts) > 1 else "",
                    "text": html.unescape(t).strip()})
    json.dump(res, open(os.path.join(RAW, "dm_%s.json" % cid), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    return res

if __name__ == "__main__":
    mode = sys.argv[1]
    ids = sys.argv[2:]
    for i in ids:
        if mode == "reply":
            r = replies(int(i))
        else:
            r = dm(i)
        print(mode, i, len(r), flush=True)
        time.sleep(0.5)
