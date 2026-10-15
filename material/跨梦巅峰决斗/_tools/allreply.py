# -*- coding: utf-8 -*-
"""带 buvid cookie 抓 B站 全量评论 (旧接口 + 新 main 接口)"""
import json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "_raw")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"
COOKIE = "buvid3=A1B2C3D4-1234-5678-9012-345678901234infoc; b_nut=1700000000"

def curl(url):
    p = subprocess.run(["curl", "-s", "--max-time", "25",
                        "-H", "User-Agent: " + UA,
                        "-H", "Referer: https://www.bilibili.com/",
                        "-H", "Cookie: " + COOKIE, url], capture_output=True)
    return p.stdout if p.returncode == 0 else b""

def norm(r):
    return {"user": (r.get("member") or {}).get("uname"), "like": r.get("like"),
            "ctime": r.get("ctime"), "rpid": r.get("rpid"),
            "message": (r.get("content") or {}).get("message"),
            "sub": [{"user": (s.get("member") or {}).get("uname"), "like": s.get("like"),
                     "message": (s.get("content") or {}).get("message")}
                    for s in (r.get("replies") or [])]}

def all_replies(aid, max_pages=40):
    out, seen = [], set()
    for sort in (2, 0, 1):
        for pn in range(1, max_pages + 1):
            url = "https://api.bilibili.com/x/v2/reply?type=1&oid=%s&sort=%d&ps=20&pn=%d&nohot=1" % (aid, sort, pn)
            try:
                j = json.loads(curl(url).decode("utf-8", "replace"))
            except Exception:
                break
            if j.get("code") != 0:
                break
            reps = (j.get("data") or {}).get("replies") or []
            if not reps:
                break
            new = 0
            for r in reps:
                if r.get("rpid") in seen:
                    continue
                seen.add(r.get("rpid")); new += 1; out.append(norm(r))
            if new == 0:
                break
            time.sleep(0.4)
    # 新接口 mode=3 尝试
    next_v = 0
    for _ in range(8):
        url = ("https://api.bilibili.com/x/v2/reply/main?type=1&oid=%s&mode=3&next=%d&ps=20" % (aid, next_v))
        try:
            j = json.loads(curl(url).decode("utf-8", "replace"))
        except Exception:
            break
        reps = ((j.get("data") or {}).get("replies") or [])
        if not reps:
            break
        new = 0
        for r in reps:
            if r.get("rpid") in seen:
                continue
            seen.add(r.get("rpid")); new += 1; out.append(norm(r))
        nxt = ((j.get("data") or {}).get("cursor") or {}).get("next")
        if new == 0 or not nxt:
            break
        next_v = nxt
        time.sleep(0.4)
    json.dump(out, open(os.path.join(RAW, "allreply_%s.json" % aid), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    return out

if __name__ == "__main__":
    for aid in sys.argv[1:]:
        r = all_replies(int(aid))
        print("aid", aid, "replies", len(r), flush=True)
