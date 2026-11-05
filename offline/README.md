# offline/ —— 线上已下线的交互功能（仓库保留）

> 2026-11-03：为通过**公安备案审查**，站点移除了全部交互式服务。
> 代码一份没丢，都在这里；线上不再提供。

## 一、下线了什么

| 功能 | 原来是什么 | 现在 |
|---|---|---|
| 留言簿 `/guestbook/` | 访客写 UGC 留言，存 SQLite（`/notes` POST/GET） | 页面移到这里；线上 404 |
| 献花计数 | 点击 POST `/flower`，读 GET `/count` | 计数冻结为 70（构建时写死），点击只剩花瓣动画 |
| 擂台竞猜 `/api/*` | 注册/登录/签到/下注/结算（`server/arena.js`） | 服务已停用；线上 404 |
| 留言管理 `/notes/manage` | 管理端 | 随服务一起下线 |

## 二、为什么（合规判断，别轻易推翻）

个人备案网站不得提供**交互式服务**（用户注册、留言/评论、论坛、UGC、竞猜/赌博性质玩法）。
这类功能需要专项审批，未批先开是备案被注销的常见原因。
页面里的客户端动画、小游戏（探索、点击触发）**不写服务器数据、不产生 UGC**，不属于交互式服务，予以保留。

## 三、怎么恢复（三步，缺一不可）

### 1. 留言簿
```bash
cp -r offline/guestbook guestbook          # 页面回根目录
# 把 .github/workflows/static.yml 的 KEEP_DIRS 加回 guestbook
# build.mjs 的 MIN_DIRS 同步 +1
sudo systemctl enable --now elysia-api      # 起 API
# nginx 加回：location /notes { proxy_pass http://127.0.0.1:8787; }
```

### 2. 献花实时计数
```bash
cp offline/flowers.interactive.js assets/flowers.js
# index.html：#flowerCount 去掉 data-count 与内联文字，恢复成空标签
# nginx 加回：location = /count、location = /flower 反代到 8787
```

### 3. 擂台竞猜
`server/arena.js` 一直没动，`systemctl enable --now elysia-api` 后 `/api/*` 即恢复
（nginx 需要加回 `location /api/`）。**注意：竞猜有赌博性质，恢复前请先想清楚合规风险。**

## 四、数据还在吗

在。SQLite 库 `/var/lib/elysia/elysia.db` 没有被删除（花 70、留言 2 条、擂台账号都在）。
服务停用只是 `systemctl disable --now elysia-api`，随时可逆。
