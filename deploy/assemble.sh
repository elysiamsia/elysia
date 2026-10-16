#!/usr/bin/env bash
# /opt/elysia-deploy/assemble.sh —— 服务器端：从 GitHub 拉 main 并发布到站点目录
#
# 为什么要它：需求方问「能让服务器从 GitHub 拉项目吗」—— 实测这台四川机器连 GitHub 只要 1.66 秒 ✅
#   ⇒ 让服务器自己拉，**本地机器不再是发布的必经之路**（我在不在都一样）。
#
# ⚠ 白名单从 .github/workflows/static.yml **读**，不写第二份 —— 否则两边一定会漂移
#   （历史上就吃过「新加根文件忘了加白名单 ⇒ 线上永远没有它」的亏）。
set -euo pipefail
SRC=/opt/elysia-src
WEB=/var/www/elysiad
STAMP=/opt/elysia-deploy/.last-commit

cd "$SRC"
git fetch --depth=1 origin main >/dev/null 2>&1
NEW=$(git rev-parse origin/main)
OLD=$(cat "$STAMP" 2>/dev/null || echo none)
if [ "$NEW" = "$OLD" ]; then echo "无变化（$NEW）"; exit 0; fi

git reset --hard origin/main >/dev/null
KEEP_FILES=$(grep -o 'KEEP_FILES="[^"]*"' .github/workflows/static.yml | head -1 | cut -d'"' -f2)
KEEP_DIRS=$(grep -o 'KEEP_DIRS="[^"]*"' .github/workflows/static.yml | head -1 | cut -d'"' -f2)
[ -n "$KEEP_FILES" ] || { echo "读不到白名单，放弃（避免发错东西）" >&2; exit 1; }

STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
for f in $KEEP_FILES; do [ -e "$f" ] && cp -r "$f" "$STAGE/"; done
for d in $KEEP_DIRS;  do [ -d "$d" ] && cp -r "$d" "$STAGE/"; done

# 备份上一版 + 原子替换（都在 ubuntu 可写的目录里；.prev 在同级，需要 sudo 建）
sudo rm -rf "$WEB.prev" && sudo cp -a "$WEB" "$WEB.prev"
find "$WEB" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "$STAGE"/. "$WEB"/
echo "$NEW" > "$STAMP"
echo "✅ 已发布 $NEW：$(find "$WEB" -type f | wc -l) 个文件"
