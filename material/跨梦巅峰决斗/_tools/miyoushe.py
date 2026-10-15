# -*- coding: utf-8 -*-
"""抓米游社帖子/话题内容 -> UTF-8 文本"""
import json, os, subprocess, sys, re, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "_raw")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"


def get(url):
    p = subprocess.run(["curl", "-s", "--max-time", "25", "-H", "User-Agent: " + UA,
                        "-H", "Referer: https://www.miyoushe.com/", url], capture_output=True)
    try:
        return json.loads(p.stdout.decode("utf-8", "replace"))
    except Exception:
        return None


def clean(t):
    if not t:
        return ""
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"</p>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    return html.unescape(t).strip()


def post(pid):
    j = get("https://bbs-api.miyoushe.com/post/wapi/getPostFull?post_id=%s&read=1" % pid)
    if not j:
        return None
    p = (j.get("data") or {}).get("post") or {}
    pp = p.get("post") or {}
    return {
        "id": pid,
        "subject": clean(pp.get("subject")),
        "content": clean(pp.get("content")),
        "created": pp.get("created_at"),
        "user": ((p.get("user") or {}).get("nickname")),
        "images": [i.get("url") for i in (pp.get("image_list") or [])],
        "topics": [t.get("name") for t in (p.get("topic_list") or [])],
        "stat": {k: (pp.get("stat") or {}).get(k) for k in ("view_num", "reply_num", "like_num")},
        "reply": clean(((p.get("reply") or {}).get("content"))),
    }


def topic(tid, pages=3):
    out = []
    last = ""
    for _ in range(pages):
        u = "https://bbs-api.miyoushe.com/post/wapi/getTopicPostList?topic_id=%s&size=20" % tid
        if last:
            u += "&last_id=" + last
        j = get(u)
        if not j:
            break
        d = j.get("data") or {}
        for it in d.get("posts") or []:
            p = it.get("post") or {}
            out.append({"id": p.get("post_id"), "subject": clean(p.get("subject")),
                        "created": p.get("created_at"),
                        "user": ((it.get("user") or {}).get("nickname")),
                        "stat": {k: (p.get("stat") or {}).get(k) for k in ("view_num", "reply_num", "like_num")}})
        if d.get("is_last"):
            break
        last = str(d.get("last_id") or "")
        if not last:
            break
    return out


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "post":
        res = []
        for pid in sys.argv[2:]:
            r = post(pid)
            if r:
                res.append(r)
        json.dump(res, open(os.path.join(RAW, "miyoushe_posts.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        for r in res:
            print("post", r["id"], "len(content)=", len(r["content"]), "imgs=", len(r["images"]))
    else:
        r = topic(sys.argv[2], pages=int(sys.argv[3]) if len(sys.argv) > 3 else 3)
        json.dump(r, open(os.path.join(RAW, "miyoushe_topic_%s.json" % sys.argv[2]), "w",
                          encoding="utf-8"), ensure_ascii=False, indent=1)
        print("topic posts", len(r))
