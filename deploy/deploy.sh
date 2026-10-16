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
WEBROOT="${WEBROOT:-/var/www/elysiad}"

SSHOPTS="-o BatchMode=yes -o StrictHostKeyChecking=accept-new"
SSH="ssh -i \"$KEY\" $SSHOPTS $DEPLOY_USER@$HOST"

KEEP_FILES="index.html sw.js armor.html 404.html robots.txt sitemap.xml favicon.svg CNAME"
KEEP_DIRS="assets data images aponia eden kalpas kevin su villv sakura kosma mobius griseo hua pardofelis guestbook"

if [ "${1:-deploy}" = "rollback" ]; then
  eval "$SSH" "'set -e; [ -d $WEBROOT.prev ] || { echo 没有上一版可回滚; exit 1; };
      sudo rm -rf $WEBROOT.failed; mv $WEBROOT $WEBROOT.failed;
      sudo mv $WEBROOT.prev $WEBROOT; echo 已回滚（出问题的版本留在 $WEBROOT.failed）'"
  exit 0
fi

STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
for f in $KEEP_FILES; do [ -e "$f" ] && cp -r "$f" "$STAGE/"; done
for d in $KEEP_DIRS; do [ -d "$d" ] && cp -r "$d" "$STAGE/"; done
echo "→ 待发布：$(find "$STAGE" -type f | wc -l) 个文件，$(du -sh "$STAGE" | cut -f1)"

TARBALL=$(mktemp -u).tgz
tar czf "$TARBALL" -C "$STAGE" .
echo "→ 上传到 $DEPLOY_USER@$HOST"
scp -i "$KEY" $SSHOPTS "$TARBALL" "$DEPLOY_USER@$HOST:/tmp/elysia-deploy.tgz"

eval "$SSH" "'set -e
  sudo mkdir -p $WEBROOT && sudo chown $DEPLOY_USER:$DEPLOY_USER $WEBROOT
  # 备份上一版（拷到同级的 .prev；都在 /var/www 下 ⇒ 用 sudo）
  sudo rm -rf $WEBROOT.prev && sudo cp -a $WEBROOT $WEBROOT.prev
  # 清空站点目录内部（ubuntu 对自己这个目录有写权限 ⇒ 不需要 sudo）
  find $WEBROOT -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  tar xzf /tmp/elysia-deploy.tgz -C $WEBROOT
  rm -f /tmp/elysia-deploy.tgz
  echo 已发布：\$(find $WEBROOT -type f | wc -l) 个文件'"
rm -f "$TARBALL"
echo "✅ 完成。回滚：./deploy/deploy.sh rollback"
