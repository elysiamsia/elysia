# tools/ 本地开发工具（不属于站点资源）

- `cdp.py` — 无头 Edge 真机验证工具。用法：
  `python tools/cdp.py http://localhost:8500/index.html eval "document.title" click ".quote-card" sleep 700 text shot screenshots/index.png`
- `convert_audio.py`（见 Task 2）— wma → mp3 转码。
- `check_aria_labels.py` — **语录卡 `aria-label` 属性断言**（7 页）。
  `snapshot.py` 只采计算样式、**测不出属性**，所以「专属文案被重构悄悄抹掉」
  这类回归它报「✅ 无差异」。本脚本补上那个盲区。用法：
  `PYTHONIOENCODING=utf-8 python tools/check_aria_labels.py`
  自带服务器（端口 **8501**，刻意避开 8500 的残留服务器陷阱），已隐式起浏览器。