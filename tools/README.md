# tools/ 本地开发工具（不属于站点资源）

- `cdp.py` — 无头 Edge 真机验证工具。用法：
  `python tools/cdp.py http://localhost:8500/index.html eval "document.title" click ".quote-card" sleep 700 text shot screenshots/index.png`
- `convert_audio.py`（见 Task 2）— wma → mp3 转码。
- `check_aria_labels.py` — **语录卡 `aria-label` 属性断言**（10 页）。
  `snapshot.py` 只采计算样式、**测不出属性**，所以「专属文案被重构悄悄抹掉」
  这类回归它报「✅ 无差异」。本脚本补上那个盲区。用法：
  `PYTHONIOENCODING=utf-8 python tools/check_aria_labels.py`
  自带服务器（端口 **8501**，刻意避开 8500 的残留服务器陷阱），已隐式起浏览器。
- `check_reduced_motion.py` — **减弱动效（`prefers-reduced-motion`）双向断言**。
  快照同样测不了（它不模拟媒体特性）。断言两件事：
  ① 减动偏好下装饰动画确实停了、光标仍可见、星屑停在各自中间亮度、白闪为 0；
  ② **正常偏好下动画照旧还在** —— 证明减动段没泄漏。
  两处最凶的演出（villv 的 666、kalpas 的怒气震屏）用**真实用户路径**触发。
  用法：`PYTHONIOENCODING=utf-8 python tools/check_reduced_motion.py`
  同样自带服务器走 8501。
- `check_explore.py` — **探索系统 / 下方区块断言**（2026-10-01 新增）。
  快照也测不了它 —— 它测的是**交互**：一个可发现物被 `overflow` 裁掉、
  被别的元素盖住、或锚点选择器写错时，它照样「存在于 DOM 里」、CSS 也算得对，
  快照给「✅ 无差异」，但**用户永远点不到它**。所以这里走**真实用户路径**：
  真滚动、真派发鼠标事件、真 reload，断言「触发前没有 → 触发后有了」。

  用法：
  ```
  PYTHONIOENCODING=utf-8 python tools/check_explore.py                    # 探针页（31 条）
  PYTHONIOENCODING=utf-8 python tools/check_explore.py mobius/index.html  # 某页（31 条）
  PYTHONIOENCODING=utf-8 python tools/check_explore.py --reduced          # 减动模式（5 条）
  ```
  自带服务器走 8501；每次用**全新临时 profile**（`cdp.py` 那个固定 profile 会留存缓存）。
  空跑的话它**会 red** —— 全靠**功能断言**（如「游戏卡上找不到按钮」）。所以本脚本收了 CDP 的
  **`Log` 域**：`level=error` 的条目算失败。⚠ 页面**必须**声明 favicon，否则浏览器去要
  `/favicon.ico` 拿到 404，照样算红。

  每条断言带两个维度：
  - `modes` —— `normal` / `reduced`（减动那几条只在 `--reduced` 时跑）
  - `pages` —— 适用于哪些页。默认 `('*',)` = 任何页都该满足；
    写死了 `fx-01` 这类**探针页 id** 的用 `@fixture_only`，mobius 专属的用 `@mobius_only`

  ⚠ **新页接入时**：断言要分清「这页特有的」和「每页都该满足的」——
  前者收窄、后者参数化（存储键那一类要走 `ElysiaExplore.pageId()`，别写死页名）。
  不这么做的话，`check_explore.py <新页>` 会先挂一堆与新页无关的断言，真问题被淹掉。
  另外新页要在 `EXPECTED_FINDS` 里登记声明数。