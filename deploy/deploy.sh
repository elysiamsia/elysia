#!/usr/bin/env bash
# deploy/deploy.sh —— 把站点发布到自建服务器（在 Git Bash 里跑）
#
# 设计原则（都是这个项目踩出来的）：
#   1. **沿用 GitHub Actions 的白名单装配**：只发布该发布的文件，绝不把 material/ tmp/ tools/ 发上去。
#      （白名单见 .github/workflows/static.yml，两边必须一致 —— 新加根文件时两处都要加）
#   2. **服务器端先备份上一版**：出问题一条命令回滚，不用重新上传。
#   3. **HTML 与 sw.js 不缓存**：发版立刻生效（nginx 配置里已设）。
#
# 用法：
#   HOST=1.2.3.4 USER=root KEY=~/Desktop/dah.pem ./deploy/deploy.sh
#   ./deploy/deploy.sh rollback          # 回滚到上一版
set -euo pipefail

HOST="${HOST:?请给 HOST=服务器IP}"
USER="${USER:-root}"
KEY="${KEY:-$HOME/Desktop/dah.pem}"
WEBROOT="${WEBROOT:-/var/www/elysiad}"

SSH="ssh -i \"$KEY\" -o StrictHostKeyChecking=accept-new $USER@$HOST"

KEEP_FILES="index.html sw.js armor.html 404.html robots.txt sitemap.xml favicon.svg CNAME"
KEEP_DIRS="assets data images aponia eden kalpas kevin su villv sakura kosma mobius griseo hua pardofelis guestbook"

if [ "${1:-deploy}" = "rollback" ]; then
  echo "→ 回滚 $WEBROOT"
  eval "$SSH" "'set -e; [ -d $WEBROOT.prev ] || { echo \"没有上一版可回滚\"; exit 1; };
      rm -rf $WEBROOT.old; mv $WEBROOT $WEBROOT.old; mv $WEBROOT.prev $WEBROOT; echo 已回滚（旧版留在 $WEBROOT.old）'"
  exit 0
fi

# ── 1. 本地装配（只挑白名单里的东西）────────────────────────────────
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
for f in $KEEP_FILES; do [ -e "$f" ] && cp -r "$f" "$STAGE/"; done
for d in $KEEP_DIRS; do [ -d "$d" ] && cp -r "$d" "$STAGE/"; done
# 服务器上不需要部署工具与源码目录
rm -rf "$STAGE/assets/raw" 2>/dev/null || true
echo "→ 待发布：$(find "$STAGE" -type f | wc -l) 个文件，$(du -sh "$STAGE" | cut -f1)"

TARBALL=$(mktemp -u).tgz
tar czf "$TARBALL" -C "$STAGE" .

# ── 2. 上传 + 服务器端原子替换 ─────────────────────────────────────
echo "→ 上传到 $USER@$HOST"
scp -i "$KEY" -o StrictHostKeyChecking=accept-new "$TARBALL" "$USER@$HOST:/tmp/elysia-deploy.tgz"
eval "$SSH" "'set -e
  mkdir -p $WEBROOT
  # 首次部署时 $WEBROOT 可能是空的：先造一个占位，保证 mv 语义一致
  [ -d $WEBROOT ] || mkdir -p $WEBROOT
  rm -rf $WEBROOT.incoming && mkdir -p $WEBROOT.incoming
  tar xzf /tmp/elysia-deploy.tgz -C $WEBROOT.incoming
  rm -rf $WEBROOT.prev && mv $WEBROOT $WEBROOT.prev
  mv $WEBROOT.incoming $WEBROOT
  rm -f /tmp/elysia-deploy.tgz
  echo 已发布：\$(find $WEBROOT -type f | wc -l) 个文件'"

rm -f "$TARBALL"
echo "✅ 完成。回滚：./deploy/deploy.sh rollback"
