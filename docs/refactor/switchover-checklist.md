# 切换清单：从「手写 HTML」切到「模板构建」

> 2026-10-18 起草。**本文件不执行切换**，只写清步骤与回滚。切换需主人明确点头。

## 零、切换前后的本质差别

| | 现在 | 切换后 |
|---|---|---|
| 线上 :80 的来源 | `deploy.yml`：仓库根按白名单装配 → 上传 | `deploy.yml`：**build** → `public/` 按白名单装配 → 上传 |
| 12 个角色页 | 手写 HTML（根目录 `<key>/index.html`） | 由 `content/*.json` + 模板**构建**得出 |
| 改一处全站生效 | 否 | **是**（改 partial / JSON 即可） |

## 一、切换前必须全绿的证据（都已有）

| # | 检查 | 现状 |
|---|---|---|
| 1 | 12 页 DOM diff = 0 | ✅ 全部 0（THEME 语义豁免） |
| 2 | 构建产物手机扫 12 页 × 320/360/390 | ✅ 36 项全绿 |
| 3 | 构建产物断言 | ✅ hua 29/29、sakura 39/39 |
| 4 | build 自校验 | ✅ OK 146 files identical |
| 5 | `--strict-templates` 牙齿 | ✅ 缺模板即失败并点名 |
| 6 | v2 部署 + 回滚隔离 | ✅ 备份目录独立，回滚不动 :80 |

## 二、切换步骤（按序执行）

### 步骤 1：旧源退役

删除仓库根的 12 个手写页（git 历史保留，随时可取回）：

```
git rm -r kevin aponia eden villv kalpas su sakura kosma mobius griseo hua pardofelis
```

⚠ 删完必须先跑 `npm run build -- --strict-templates`，确认 12 页全部走渲染路径。

### 步骤 2：build 的拷贝白名单调整

`src/build/build.mjs` 目前从 `static.yml` 读白名单。角色页目录仍要保留在 `KEEP_DIRS`（构建产物要写进 `public/<key>/`），
只是源文件从「手写 HTML」变成「模板渲染」。**白名单本身不用改**。

### 步骤 3：`deploy.yml` 改为构建部署

把 `deploy/preview.yml.staged` 的内容合并进 `.github/workflows/deploy.yml`（去掉 `/v2/` 相关、目标改成 `/var/www/elysiad`），要点：

1. `npm install` → `npm run build -- --strict-templates`；
2. **diff 门禁不再需要**（源已是模板，比不了）；改为「构建成功 + 12 页存在 + 体积合理」三条；
3. 先备份 `elysiad.prev` 再原子替换；
4. 传完自检：`curl -s -o /dev/null -w %{http_code}` 对 `/`、`/kevin/`、`/su/` 三个必须 200。

### 步骤 4：回滚演练（**必须真跑**）

```
./deploy/deploy.sh rollback      # 站点回上一版
curl -s -o /dev/null -w %{http_code} http://1.14.60.153/kevin/   # 必须 200
```

演练要在**切换当天**做一次，而不是「知道怎么做」。

### 步骤 5：切换后 24h 观察

| 观察项 | 判据 |
|---|---|
| Service Worker 注册 | 切换后 :80 上 `navigator.serviceWorker.controller` 为真（/v2/ 测不了） |
| 404 日志 | nginx access log 里无新增资源 404 |
| 手机扫复跑 | `mobile_sweep --root public` 仍全绿 |
| 首页指标 | LCP / INP 不劣于切换前（perf8 对比） |

## 三、风险与对策

| 风险 | 对策 |
|---|---|
| 某页模板漏写 ⇒ 静默走拷贝路径 | `--strict-templates` 硬失败（已加，已验证有牙齿） |
| 构建在 CI 上失败 | 线上不动（Actions 失败不部署），本地 `npm run build` 可复现 |
| 构建产物缺文件 | build 自校验（源↔产物逐文件哈希） |
| 线上要退回手写版 | `deploy.sh rollback` + `git revert` 旧源退役那次提交 |

## 四、做完就撤掉的东西

- `docs/refactor/` 下的逐页 diff 报告（保留作历史，但不参与流程）；
- `preview.yml`（若要保留 dev 预览可继续用 ✅）；
- 本条清单本身转为「已完成」状态。
