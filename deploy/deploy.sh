#!/usr/bin/env bash
# deploy/deploy.sh —— 把站点发布到自建服务器（在 Git Bash 里跑）
#
# 设计原则（都是这个项目踩出来的）：
#   1. **沿用 GitHub Actions 的白名单装配**：只发布该发布的文件（白名单见 .github/workflows/static.yml，两处必须一致）
#   2. **服务器端先备份上一版**：出问题一条命令回滚
#   3. **HTML 与 sw.js 不缓存**：发版立刻生效（nginx 配置里已设）
#   4. ⚠ **所有临时目录都放在站点目录内部**：/var/www 属 root，往它下面建目录必然 Permission denied（踩过两次）
#
# 用法：
#   HOST=1.14.60.153 USER=ubuntu KEY=~/Desktop/dah.pem ./deploy/deploy.sh
#   ./deploy/deploy.sh rollback
set -euo pipefail

HOST="${HOST:?请给 HOST=服务器IP}"
DEPLOY_USER="${USER:-ubuntu}"          # 远端用户名（脚本在本地跑，$USER 才是本地变量 —— 别混用）
KEY="${KEY:-$HOME/Desktop/dah.pem}"
V2_MODE=0
if [ "${1:-deploy}" = "--v2" ]; then V2_MODE=1; shift; fi
# v2 预览：目录与备份都与生产完全隔离（审阅意见 #10），互不影响
if [ "$V2_MODE" = "1" ]; then
  WEBROOT="${WEBROOT:-/var/www/elysiad-v2}"
else
  WEBROOT="${WEBROOT:-/var/www/elysiad}"
fi
BACKUP="${WEBROOT}.prev"

SSHOPTS="-o BatchMode=yes -o StrictHostKeyChecking=accept-new"
SSH="ssh -i \"$KEY\" $SSHOPTS $DEPLOY_USER@$HOST"

KEEP_FILES="index.html sw.js armor.html 404.html robots.txt sitemap.xml favicon.svg CNAME"
KEEP_DIRS="assets data images aponia eden kalpas kevin su villv sakura kosma mobius griseo hua pardofelis guestbook"

if [ "${1:-deploy}" = "rollback" ]; then
  eval "$SSH" "'set -e; [ -d $BACKUP ] || { echo 没有上一版可回滚; exit 1; };
      sudo rm -rf $WEBROOT.failed; sudo mv $WEBROOT $WEBROOT.failed;   # ⚠ /var/www 属 root，这里的 mv 也必须 sudo（否则回滚静默失败）
      sudo mv $BACKUP $WEBROOT; echo 已回滚（出问题的版本留在 $WEBROOT.failed）'"
  exit 0
fi

# ⚠ 切换后（2026-10-18）：发布源头从「仓库根白名单装配」改为**构建产物 public/**（build 即装配器）。
# ⚠ 2026-10-23：发布动作改由服务器端脚本 deploy/remote-release.sh 执行（本地与 CI 共用一份），
#   顺序是「暂存 → 校验 → 备份 → 原子切换」，线上目录在新内容验证前**不动**。
FROM_PUBLIC=1
[ -d public ] || { echo "public/ 不存在，先 npm run build"; exit 1; }
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp -a public/. "$STAGE"/
COUNT=$(find "$STAGE" -type f | wc -l)
[ "$COUNT" -ge 100 ] || { echo "❌ public/ 只有 $COUNT 个文件，先跑 npm run build"; exit 1; }
echo "→ 待发布（public/）：$COUNT 个文件，$(du -sh "$STAGE" | cut -f1)"

TARBALL=$(mktemp -u).tgz
tar czf "$TARBALL" -C "$STAGE" .
ls -lh "$TARBALL" | awk '{print "→ 打包：" $5}'
echo "→ 上传到 $DEPLOY_USER@$HOST"
scp -i "$KEY" $SSHOPTS "$TARBALL" "$DEPLOY_USER@$HOST:/tmp/elysia-deploy.tgz"

# 远端发布脚本也一起送过去（不在服务器上常驻，避免两份逻辑不一致）
REMOTE=$(mktemp)
cp deploy/remote-release.sh "$REMOTE"
scp -i "$KEY" $SSHOPTS "$REMOTE" "$DEPLOY_USER@$HOST:/tmp/remote-release.sh"
rm -f "$REMOTE"

eval "$SSH" "'WEBROOT=$WEBROOT BACKUP=$BACKUP bash /tmp/remote-release.sh'"
rm -f "$TARBALL"
echo "✅ 完成。回滚：./deploy/deploy.sh$( [ "$V2_MODE" = "1" ] && echo " --v2" ) rollback"
