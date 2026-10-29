# ICP 备案悬挂 + HTTPS 上线 + 发布入口去重（2026-10-29）

> 一句话：域名备案通过当天完成了 **HTTPS 全站上线**、**备案号悬挂**、**双 workflow 抢目录的根因修复**。

## 1. 备案信息（线上必须可见）

| 项目 | 值 |
|---|---|
| ICP 备案号 | **粤ICP备2026047652号** |
| 主体 | 董淇明（个人） |
| 公安联网备案数据码 | `ceafa2f3776bb0c8cf2ca8d60a2917bd` |
| 公安备案号 | **待取得**（取得后加到同一 footer） |

### 悬挂实现

备案号是**硬性合规要求**：必须出现在页面上，且链接到工信部。实现为一行极简 footer：

```html
<footer class="site-legal">
  <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">粤ICP备2026047652号</a>
</footer>
```

覆盖范围（**全站 16 个页面一个不落**）：

| 位置 | 覆盖页面 |
|---|---|
| `templates/base.njk`（`{{ pageBody }}` 之后） | 12 个角色页（构建时注入，改模板即全站生效） |
| `index.html` | 首页 |
| `armor.html` / `404.html` / `guestbook/index.html` | 尚未模板化的独立页 |

样式：`assets/site.css` 里的 `.site-legal`（首页与 12 角色页共用）；`armor.html` / `404.html` / `guestbook/index.html` 不加载 `site.css`，各自内联同一份规则。

- 字号 `.72rem`、颜色 `#7b6f99`、`opacity:.75`（不抢视觉）
- `min-height:44px` —— 备案号也是链接，移动端同样按 44px 触控标准做
- **首页特例**：右下角生日挂件 `#bdayEgg`（`z-index:9990`，44px 高）会盖住页脚 ⇒ 首页 footer 加 `style="margin-bottom:5.2rem"` 抬起来。这是实测出来的：390 宽下 `#bdayEgg` 覆盖了备案号一半。

## 2. 公安联网备案（**30 天内必须做**）

腾讯云 ICA 页面明确要求：**开通服务后 30 日内**完成公安联网备案。

- 数据码：`ceafa2f3776bb0c8cf2ca8d60a2917bd`
- 入口：全国互联网安全管理服务平台（`beian.mps.gov.cn`），用数据码办理
- 取得公安备案号后：把它加进同一个 `.site-legal` footer（跟 ICP 号并排），**不要**只写在某一页

## 3. HTTPS 上线

| 项 | 值 |
|---|---|
| 证书 | Let's Encrypt，`elysiad.top` + `www.elysiad.top` |
| 到期 | **2027-01-27**（certbot 自动续期已挂 systemd timer） |
| 协议 | TLSv1.2 / TLSv1.3，实测 `TLS_AES_256_GCM_SHA384` |
| HTTP/2 | 开 |
| HSTS | `max-age=15552000`（180 天，暂未 includeSubDomains / preload） |
| 会话票据 | `ssl_session_tickets off` |

nginx 三块结构（仓库版 `deploy/nginx-elysiad.conf`，线上 `/etc/nginx/sites-available/elysiad`）：

1. `:80 default_server` —— 留 `/.well-known/acme-challenge/` 给续期，其余 `301` 到 https
2. `:443` `www.elysiad.top` —— `301` 到主域
3. `:443 default_server` `elysiad.top` —— 真正的站点（root / 缓存 / sw.js / `/v2/` alias / 4 个 API 反代 全部原样保留）

⚠ **证书没登记邮箱**（签发时用了 `--register-unsafely-without-email`）。后续可 `certbot update_account --email <邮箱>`，否则到期前 20 天收不到续期失败告警。

## 4. 根因修复：两个 workflow 抢同一个目录

**现象**：HTTPS 切完做验收时发现线上只剩 **119 个文件、12 个角色页全 404**（本地构建是 146）。

**根因**：`.github/workflows/` 下有两个 workflow 都监听 `main` 的 push，且都写 `/var/www/elysiad`：

| workflow | 做什么 | 产物 |
|---|---|---|
| `static.yml`「部署到生产（构建版）」 | `npm run build` 后发布 | 146 文件 ✅ |
| `deploy.yml`「部署到自建服务器」 | **不构建**，直接拷 repo 里的白名单目录 | 119 文件 ❌ |

12 个手写角色页在模板化时被 `git rm` 了（真源变成 `content/` + `templates/`），而 `deploy.yml` 只会拷"仓库里现成的文件" ⇒ 它永远发布不出角色页。两个 workflow 谁后跑完谁覆盖，**2026-10-23 那次是 `deploy.yml` 赢了**。

**修复**：删除 `deploy.yml`（归档在 `refactor/retired-deploy-workflow.yml.txt`），生产发布**唯一入口 = `static.yml`（构建版）**。

> 教训：同一台服务器上的同一个 webroot 只能有一个写者。多入口 = 随机覆盖。

## 5. 验收记录（2026-10-29）

```
https://elysiad.top/            200  HTTP/2  HSTS  ICP✅
https://elysiad.top/kevin/      200  ICP✅
https://elysiad.top/armor.html  200  ICP✅
https://elysiad.top/guestbook/  200  ICP✅
https://elysiad.top/404.html    200  ICP✅
http://elysiad.top/             301 → https
https://www.elysiad.top/        301 → https://elysiad.top/
```

手机 390 宽实测（headless Edge + CDP）：备案号链接 **44×131px**、`scrollWidth-innerWidth = 0`（无横向溢出）、首页不再被生日挂件遮挡。

## 6. 遗留

- [ ] 公安联网备案（30 天内）→ 拿到号后补进 footer
- [ ] certbot 登记邮箱
- [ ] `/v2/` 预览目录还挂在线上（`alias` 到 `/var/www/elysiad-v2`），是 dev 构建的旧副本；要么加 `noindex`，要么下线
- [ ] `armor.html` / `404.html` / `guestbook/` 仍是手写页（未模板化），改页脚需单独改