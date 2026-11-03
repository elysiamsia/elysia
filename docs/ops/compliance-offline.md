# 交互式服务下线记录（公安备案审查）

> 日期：**2026-11-03**
> 决策人：主人（浅沐）
> 范围：**只下线线上**，GitHub 仓库一行代码不删。

## 一、为什么现在做

2026-10-29 工信部 ICP 备案通过（`粤ICP备2026047652号`），备案号已悬挂。
但腾讯云备案控制台还有一条**必办项**：

> 公安联网备案 —— 数据码 `ceafa2f3776bb0c8cf2ca8d60a2917bd`，**开通服务后 30 日内**完成。

公安审查对个人备案站点的口径比 ICP 更严：**不得提供交互式服务**（用户注册、留言评论、论坛、UGC、竞猜/赌博性质玩法）。
这类功能需要专项审批；未批先开，轻则责令整改，重则**注销备案**。

所以这一轮不是「功能要不要」的问题，是「先过审」的问题。功能全部保留在仓库里，等审查结束、条件允许再逐个恢复。

## 二、判定标准（下次别再纠结）

| 算交互式服务（必须下线） | 不算（可以留） |
|---|---|
| 访客提交内容 → 存服务器（留言、评论、投稿） | 纯客户端动画、粒子、转场 |
| 访客注册 / 登录 / 身份 | 点击触发的小游戏（探索、找物、点击计数） |
| 服务端记录访客行为（献花计数、排行榜、签到） | 生日倒计时、今日之语（读本地数据） |
| 有输赢 / 押注 / 抽奖性质 | Canvas 生成明信片（在访客本机画） |
| 任何写数据库的公开接口 | 静态页面与图片 |

一句话：**数据有没有离开访客的浏览器、有没有进你的数据库**。

## 三、下线清单

| 服务 | 原路由 | 原实现 | 数据 | 线上现状 |
|---|---|---|---|---|
| 留言簿 | `/guestbook/` | `offline/guestbook/index.html`（原 `guestbook/index.html`）+ `/notes` GET/POST | SQLite `notes` 表（2 条已审） | **404** |
| 献花计数 | `GET /count` `POST /flower` | `assets/flowers.js`（联网版存档 `offline/flowers.interactive.js`） | SQLite 计数器（70 朵） | **404**；前端改本地，数字冻结 70 |
| 擂台竞猜 | `/api/register` `/api/login` `/api/signin` `/api/bet` `/api/me` `/api/schedule` `/api/leaderboard` `/api/heroes` `/api/replay/*` | `server/arena.js` | SQLite `players` / `bets` / `settled` | **404**，服务已停 |
| 留言后台 | `/notes/manage` | `server/server.js` | 同 `notes` | **404** |
| dev 预览副本 | `/v2/` | nginx `alias /var/www/elysiad-v2/` | 无（构建产物） | 目录已删、location 已删 |

顺带退役的两条**死链**：

- Cloudflare Worker 同源路由（`elysiad.top/notes*` `/count` `/flower`）：域名已指回自建服务器，worker 不在请求路径上；`flowers.elysiad.top` 已无解析。
- `worker/` 目录整体保留（含 93 项断言），只是不部署。

## 四、服务器侧动作（已执行，2026-11-03）

```bash
# 1) 停后端（保留 unit 与数据，随时可逆）
sudo systemctl disable --now elysia-api        # → inactive + disabled，8787 无监听

# 2) 换 nginx 配置（去掉 4 条 proxy_pass 与 /v2/，加 error_page 404）
sudo cp deploy/nginx-elysiad.conf /etc/nginx/sites-available/elysiad
sudo nginx -t && sudo systemctl reload nginx   # 备份在 /root/elysiad.conf.bak-*

# 3) 删预览目录
sudo rm -rf /var/www/elysiad-v2

# 4) 发新产物（145 文件）
bash deploy/deploy.sh
```

**数据没删**：`/var/lib/elysia/elysia.db` 完好（花 70、2 条已审留言、擂台账号）。

## 五、仓库侧动作

| 文件 | 改了什么 |
|---|---|
| `index.html` | 删留言簿入口（CSS + DOM，−1211 字节）；献花改静态 `data-count="70"` |
| `assets/flowers.js` | 重写为**纯本地版**（2162 字节，零网络请求） |
| `offline/` | 新建：联网版 flowers.js、guestbook 页、恢复手册 |
| `.github/workflows/static.yml` | `KEEP_DIRS` 去掉 `guestbook`（16 → 15） |
| `deploy/deploy.sh` | 同上（两处白名单必须一致） |
| `src/build/build.mjs` | `MIN_DIRS` 16 → 15 |
| `sw.js` | 缓存版本 v2 → **v3**（页面变了必须换） |
| `deploy/nginx-elysiad.conf` / `nginx-ip.conf` | 删 4 条反代与 `/v2/`；加 `error_page 404 /404.html;` |
| `tools/check_page_health.py` | 页面清单去掉 guestbook |

## 六、验收记录（2026-11-03 生产实测）

```
页面        / 200   /kevin/ 200   /su/ 200   /hua/ 200   /pardofelis/ 200
          /armor.html 200      /404.html 200
交互服务    /count 404   /flower 404（POST 也 404）   /notes 404
          /api/schedule 404   /api/leaderboard 404   /api/heroes 404
已删目录    /guestbook/ 404     /v2/ 404（落到站内 404 页，带备案号）
前端       flowers.js 网络调用 0 处；首页 data-count 为 70
缓存       sw.js 版本 elysia-v3
备案号     首页 + 12 角色页 各 1 处；404 页也有
手机三档扫  18/18 全绿（320/360/390；kevin su hua index armor 404）
```

## 七、恢复手册（三步，缺一不可）

下面以「恢复留言簿」为例，献花与擂台同理（细节见 `offline/README.md`）。

**前提：先确认合规风险已经解除**（专项审批、或明确不再需要备案）。

```bash
# ① 代码回位
cp -r offline/guestbook guestbook
#    static.yml 的 KEEP_DIRS 加回 guestbook；deploy.sh 同步；build.mjs MIN_DIRS +1

# ② 服务起来
sudo systemctl enable --now elysia-api

# ③ nginx 加回反代，reload
#    location /notes { proxy_pass http://127.0.0.1:8787; proxy_set_header Host $host; }
sudo nginx -t && sudo systemctl reload nginx
```

献花恢复还要把 `index.html` 的 `#flowerCount` 改回空标签，并把 `offline/flowers.interactive.js` 拷回 `assets/flowers.js`。

## 八、复查清单（下次改这块照着过一遍）

- [ ] 线上还有没有任何路由会写数据库？（`curl` 试一遍 `/count` `/flower` `/notes` `/api/*`）
- [ ] 页面里还有没有 `fetch` 指向本站接口？（`grep -r "fetch(" assets/ templates/ index.html`）
- [ ] 白名单三处是否一致？（`static.yml` / `deploy.sh` / `build.mjs`）
- [ ] `sw.js` 版本号是否换过？（不换 = 老访客看着旧页面，会以为没改）
- [ ] 404 落地页有没有备案号？（所有下线路由都会落到它）
- [ ] 公安联网备案号拿到后，是否和 ICP 号并排悬挂？
