# 迁移到自建服务器 · 施工说明

> 2026-10-16 起草。目标：治好**跨境慢**（实测线上单页 4~49 秒，连 Cloudflare 缓存命中都慢 ⇒ 瓶颈在链路，不在代码）。

> ⚠ **2026-11-03 状态更新**：服务器早已就位并在稳定运行，本文是施工期草稿。
> **四个接口（`/count` `/flower` `/notes` `/notes/manage`）已按公安审查要求全部下线**，后端 systemd 单元 `disabled`、数据保留。
> 仍有效的只有：`deploy.sh` 的一键发布与 `rollback`、白名单装配、nginx 配置结构。接口相关段落仅作历史与恢复参考，恢复前先读 [`../docs/ops/compliance-offline.md`](../docs/ops/compliance-offline.md)。

## 一、已完成（不需要服务器）

| 文件 | 作用 |
|---|---|
| `deploy/nginx-elysiad.conf` | 站点配置：HTTP/2 + HSTS + 长缓存 + 干净 URL + 站内 404 页（**4 个接口反代已于 2026-11-03 删除**） |
| `deploy/elysia-api.service` | 那 4 个接口的小后端 systemd 单元（**现为 disabled**，unit 与 `/var/lib/elysia/elysia.db` 都保留，可随时恢复） |
| `deploy/deploy.sh` | 一键发布（沿用线上白名单装配）+ `rollback` 秒回滚 |

## 二、还缺什么

| # | 事项 | 谁做 |
|---|---|---|
| 1 | **服务器 IP 与登录用户**（root？ubuntu？） | 需求方给 |
| 2 | 把 `worker/src/index.js` 的 4 个接口**重写成 Node + SQLite**（现在是 Cloudflare KV + D1） | 我做 |
| 3 | 现有数据搬迁（KV 的花数、D1 的留言） | 我做（需要 Cloudflare 侧能导出） |
| 4 | 域名解析从 Cloudflare 改成直连服务器（**灰云**），并签 Let's Encrypt 证书 | 我做（需求方改 DNS） |

## 三、上服务器后要做的（顺序）

```bash
# 1) 基础环境
apt update && apt install -y nginx nodejs npm sqlite3 certbot python3-certbot-nginx brotli

# 2) 内核侧：开 BBR（对跨境线路最值的一调）
echo 'net.core.default_qdisc=fq' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_congestion_control=bbr' >> /etc/sysctl.conf
sysctl -p && sysctl net.ipv4.tcp_congestion_control   # 应回 bbr

# 3) 站点
mkdir -p /var/www/elysiad && chown -R www-data:www-data /var/www

# 4) 后端（4 个接口）
useradd -r -s /usr/sbin/nologin elysia || true
mkdir -p /opt/elysia-api /var/lib/elysia && chown -R elysia:elysia /var/lib/elysia
#   /opt/elysia-api/server.js  ← 我写好后放进去
#   /etc/elysia-api.env        ← MANAGE_KEY / DAILY_SALT（别提交进仓库）
cp deploy/elysia-api.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now elysia-api

# 5) nginx + 证书
cp deploy/nginx-elysiad.conf /etc/nginx/sites-available/elysiad.top
ln -sf /etc/nginx/sites-available/elysiad.top /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d elysiad.top -d www.elysiad.top

# 6) 首次发布（在本地 Git Bash）
HOST=你的IP USER=root KEY=~/Desktop/dah.pem ./deploy/deploy.sh
```

## 四、回滚

```bash
./deploy/deploy.sh rollback          # 站点回到上一版（旧版留在 /var/www/elysiad.old）
systemctl stop elysia-api            # 接口停了也不影响静态页（页面本身的降级是静默的）
```

**切 DNS 之前**：先直接访问 `https://<IP>/`（加 `--resolve` 或改 hosts）验一遍，确认没问题再改解析 ⇒ 出问题秒回滚。

## 五、⚠ 两个必须记住的坑（来自 wrangler.toml 的历史记载）

1. `*.workers.dev` 在大陆**连不上**（HTTP 000）⇒ 这也是为什么接口当初要挂同源。搬到自建服务器后**天然同源**，这个问题自然消失 ✅
2. ~~页面与接口**必须同一条命**~~（历史坑）：`/count`、`/flower`、`/notes` 三个都要代理，漏一个就静默降级（QQ 浏览器上点献花永远只是本地数字，**看起来完全正常**）。
   2026-11-03 起这套接口整体下线，前端已改纯本地版，本坑暂时不适用；**恢复接口时必须重新遵守它**。
