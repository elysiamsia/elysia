# -*- coding: utf-8 -*-
"""用 Edge headless 渲染米游社/任意网页 -> 提取正文文本 + 全部图片URL"""
import os, re, html, subprocess, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "_raw")
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
UD = os.path.join(ROOT, "_tmp_edge")


def dom(url, wait=15000):
    tag = re.sub(r"[^0-9a-zA-Z]+", "_", url)[-60:]
    out = os.path.join(RAW, "dom_%s.html" % tag)
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--no-sandbox",
                    "--user-data-dir=" + UD, "--virtual-time-budget=%d" % wait,
                    "--dump-dom", url], stdout=open(out, "wb"), stderr=subprocess.DEVNULL,
                   timeout=120)
    return out


def parse(f):
    s = open(f, encoding="utf-8", errors="replace").read()
    imgs = []
    for m in re.finditer(r"<img\b[^>]*>", s):
        tag = m.group(0)
        for attr in ("src", "data-src", "data-original", "data-lazy-src"):
            v = re.search(attr + r'="([^"]+)"', tag)
            if v and v.group(1).startswith("http"):
                imgs.append(v.group(1)); break
    body = re.sub(r"<script.*?</script>", "", s, flags=re.S)
    body = re.sub(r"<style.*?</style>", "", body, flags=re.S)
    txt = html.unescape(re.sub(r"<[^>]+>", " ", body))
    txt = re.sub(r"[ \t]+", " ", txt)
    txt = re.sub(r"\n\s*\n+", "\n", txt)
    return txt, imgs


if __name__ == "__main__":
    url = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else "page"
    f = dom(url)
    txt, imgs = parse(f)
    open(os.path.join(RAW, "text_%s.md" % name), "w", encoding="utf-8").write(txt)
    up = [u for u in imgs if "upload-bbs" in u or "upload.miyoushe" in u]
    json.dump(imgs, open(os.path.join(RAW, "imgs_%s.json" % name), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("textlen", len(txt), "imgs", len(imgs), "upload", len(up))
    for u in up[:30]:
        print("  ", u[:150])
