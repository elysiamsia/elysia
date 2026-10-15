# -*- coding: utf-8 -*-
"""解析所有 bilibili 搜索 json，只保留标题/简介命中关键词的视频"""
import json, os, glob, re, html, datetime, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "_raw")
KEYS = ["跨梦", "巅峰决斗", "竞猜券", "电子斗蛐蛐", "银河梦幻擂台", "代码模拟"]

rows = {}
for f in glob.glob(os.path.join(RAW, "*.json")):
    if os.path.basename(f).startswith(("reply", "view_", "dm", "summary")):
        continue
    try:
        j = json.loads(open(f, encoding="utf-8").read())
    except Exception:
        continue
    for r in (j.get("data") or {}).get("result") or []:
        if r.get("type") != "video":
            continue
        title = re.sub("<[^>]+>", "", html.unescape(r.get("title") or ""))
        desc = re.sub("<[^>]+>", "", html.unescape(r.get("description") or ""))
        if not any(k in title or k in desc for k in KEYS):
            continue
        pd = r.get("pubdate")
        rows[r.get("bvid")] = (r.get("bvid"), r.get("aid"), title, desc[:300],
                               r.get("author"), r.get("play"), r.get("comment"), r.get("like"),
                               datetime.datetime.utcfromtimestamp(pd + 8 * 3600).strftime("%Y-%m-%d %H:%M") if pd else "?",
                               r.get("duration"))

out = []
for b, a, t, d, au, pl, cm, lk, pd, du in sorted(rows.values(), key=lambda x: x[8]):
    out.append("### %s | %s" % (b, t))
    out.append("- aid=%s UP=%s 播放=%s 评论=%s 点赞=%s 发布=%s 时长=%s" % (a, au, pl, cm, lk, pd, du))
    if d:
        out.append("- desc: %s" % d.replace("\n", " / "))
    out.append("")
open(os.path.join(RAW, "digest_relevant.md"), "w", encoding="utf-8").write("\n".join(out))
print("relevant:", len(rows))
for b, a, t, d, au, pl, cm, lk, pd, du in sorted(rows.values(), key=lambda x: x[8]):
    sys.stdout.buffer.write(("%s %s %s\n" % (b, pd, t)).encode("utf-8", "replace"))
