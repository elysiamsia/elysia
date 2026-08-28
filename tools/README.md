# tools/ 本地开发工具（不属于站点资源）

- `cdp.py` — 无头 Edge 真机验证工具。用法：
  `python tools/cdp.py http://localhost:8500/index.html eval "document.title" click ".quote-card" sleep 700 text shot screenshots/index.png`
- `convert_audio.py`（见 Task 2）— wma → mp3 转码。