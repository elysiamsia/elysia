# -*- coding: utf-8 -*-
"""把 summary_bili.json / reply_*.json 汇总成可读 UTF-8 md"""
import json, os, glob, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "_raw")
out = []
summ = json.load(open(os.path.join(RAW, "summary_bili.json"), encoding="utf-8"))
for s in summ:
    if s.get("error"):
        out.append("## %s  ERROR: %s\n" % (s["bvid"], s["error"]))
        continue
    pd = datetime.datetime.utcfromtimestamp(s["pubdate"] + 8 * 3600).strftime("%Y-%m-%d %H:%M")
    out.append("## %s  %s" % (s["bvid"], s["title"]))
    out.append("- aid=%s cid=%s UP=%s 发布(北京)=%s" % (s["aid"], s["cid"], s["up"], pd))
    out.append("- 数据: %s" % s["stat"])
    if s.get("pages"):
        out.append("- 分P:")
        for p in s["pages"]:
            out.append("    - P%s %s (cid=%s)" % (p["p"], p["part"], p["cid"]))
    out.append("- 简介:")
    out.append("\n".join("    " + l for l in (s.get("desc") or "").splitlines()))
    out.append("")
open(os.path.join(ROOT, "_raw", "digest_videos.md"), "w", encoding="utf-8").write("\n".join(out))
print("wrote digest_videos.md", len(out), "lines")
