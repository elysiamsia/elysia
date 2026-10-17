# Task 1 补充：现网抽样对比（不阻塞，仅作参考）

> 2026-10-18。仓库根可能领先于线上（线上由 main 部署，dev 有后续提交），**差异须能解释**。
> 本步不参与 Task 1 验收判定，只作为「public 是否等于现网」的参考证据。

| 路径 | 线上 :80 | 本地 public/ | 结论 |
|---|---|---|---|
| /index.html | 3a106f3ec467 (74176B, HTTP 200) | 3a106f3ec467 (74176B) | 一致 ✅ |
| /kevin/index.html | 26aca15f20e5 (49820B, HTTP 200) | 26aca15f20e5 (49820B) | 一致 ✅ |
| /sw.js | 31ac2de8d6ba (2978B, HTTP 200) | 31ac2de8d6ba (2978B) | 一致 ✅ |
| /robots.txt | 1b5b04aef8a2 (65B, HTTP 200) | 1b5b04aef8a2 (65B) | 一致 ✅ |
| /assets/games/kevin.js | 2cab93bbd972 (20681B, HTTP 200) | 2cab93bbd972 (20681B) | 一致 ✅ |
