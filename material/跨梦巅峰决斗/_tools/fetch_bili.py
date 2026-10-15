# -*- coding: utf-8 -*-
"""抓取 B 站视频信息(标题/简介/UP主/统计) + 评论区 + 弹幕"""
import json, os, subprocess, sys, time, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "_raw")
os.makedirs(RAW, exist_ok=True)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

def curl(url, referer="https://www.bilibili.com/"):
    cmd = ["curl", "-s", "--max-time", "25", "-H", "User-Agent: " + UA,
           "-H", "Referer: " + referer, url]
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0:
        return None
    return p.stdout

def fetch_view(bvid):
    data = curl("https://api.bilibili.com/x/web-interface/view?bvid=" + bvid)
    fn = os.path.join(RAW, "view_%s.json" % bvid)
    open(fn, "wb").write(data or b"")
    try:
        return json.loads(data.decode("utf-8", "replace"))
    except Exception:
        return None

def fetch_replies(aid, pages=3):
    out = []
    for pn in range(1, pages + 1):
        url = "https://api.bilibili.com/x/v2/reply?type=1&oid=%s&sort=2&ps=20&pn=%d" % (aid, pn)
        d = curl(url)
        if not d:
            break
        try:
            j = json.loads(d.decode("utf-8", "replace"))
        except Exception:
            break
        if j.get("code") != 0:
            out.append({"_error": j.get("code"), "_msg": j.get("message")})
            break
        reps = (j.get("data") or {}).get("replies") or []
        if not reps:
            break
        for r in reps:
            out.append({
                "user": (r.get("member") or {}).get("uname"),
                "like": r.get("like"),
                "ctime": r.get("ctime"),
                "message": (r.get("content") or {}).get("message"),
                "sub": [{"user": (s.get("member") or {}).get("uname"), "like": s.get("like"),
                         "message": (s.get("content") or {}).get("message")}
                        for s in ((r.get("replies") or [])[:8])],
            })
        time.sleep(0.6)
    fn = os.path.join(RAW, "reply_%s.json" % aid)
    json.dump(out, open(fn, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return out

def fetch_danmaku(cid):
    url = "https://api.bilibili.com/x/v1/dm/list.so?oid=%s" % cid
    d = curl(url)
    fn = os.path.join(RAW, "dm_%s.xml" % cid)
    open(fn, "wb").write(d or b"")
    return fn

def summary(bvid):
    j = fetch_view(bvid)
    if not j or j.get("code") != 0:
        return {"bvid": bvid, "error": j.get("message") if j else "no data"}
    d = j["data"]
    aid = d["aid"]; cid = d["cid"]
    reps = fetch_replies(aid, pages=3)
    fetch_danmaku(cid)
    return {
        "bvid": bvid, "aid": aid, "cid": cid,
        "title": d.get("title"), "pubdate": d.get("pubdate"),
        "up": (d.get("owner") or {}).get("name"),
        "desc": d.get("desc"),
        "stat": {k: (d.get("stat") or {}).get(k) for k in ("view", "danmaku", "reply", "like", "coin", "favorite", "share")},
        "pages": [{"p": p.get("page"), "part": p.get("part"), "cid": p.get("cid"), "duration": p.get("duration")}
                  for p in (d.get("pages") or [])],
        "tags": [t.get("tag_name") for t in ((d.get("tags") or []) if isinstance(d.get("tags"), list) else [])],
        "reply_count_fetched": len([r for r in reps if "message" in r]),
    }

if __name__ == "__main__":
    files = sys.argv[1:]
    bvids = [l.strip() for f in files for l in open(f, encoding="utf-8") if l.strip()]
    res = []
    for b in bvids:
        print("== fetching", b, flush=True)
        res.append(summary(b))
        time.sleep(1.0)
    json.dump(res, open(os.path.join(RAW, "summary_bili.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("done", len(res))
