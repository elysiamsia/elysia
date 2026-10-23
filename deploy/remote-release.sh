#!/usr/bin/env bash
# deploy/remote-release.sh —— **在服务器上执行**的安全发布脚本（本地 deploy.sh 与 GitHub Actions 共用这一份）
#
# ⚠ 为什么单独抽出来：
#   2026-10-23 的 CI 事故 —— 旧流程是「备份 → **清空线上目录** → 解包」，
#   结果 scp 没送到、解包失败，线上目录被清空，站点 403/404 约 10 小时。
#   教训：**线上目录在「新内容已验证」之前，一个字节都不许动。**
#
# 顺序：解到暂存 → 校验文件数/index.html → 备份 → 两次 rename 原子换 → 清理
# 用法：WEBROOT=/var/www/elysiad bash remote-release.sh [tarball]
set -euo pipefail

WEBROOT="${WEBROOT:?需要 WEBROOT（例如 /var/www/elysiad）}"
BACKUP="${BACKUP:-$WEBROOT.prev}"
STAGE="${STAGE:-$WEBROOT.staging}"
TARBALL="${1:-${TARBALL:-/tmp/elysia-deploy.tgz}}"
MIN_FILES="${MIN_FILES:-100}"

if [ "$(id -u)" = "0" ]; then SUDO=""; else SUDO="sudo"; fi

echo "→ 目标：$WEBROOT  包：$TARBALL"
$SUDO test -s "$TARBALL" || { echo "❌ 找不到发布包（上传失败？）—— 线上未动"; exit 1; }

# ① 解到暂存（绝不碰线上目录）
$SUDO rm -rf "$STAGE"; $SUDO mkdir -p "$STAGE"
$SUDO tar xzf "$TARBALL" -C "$STAGE"
N=$($SUDO find "$STAGE" -type f | wc -l)
echo "→ 暂存解出 $N 个文件"

# ② 校验：数量与入口页 —— 不达标就退，线上保持原样
if [ "$N" -lt "$MIN_FILES" ]; then
  echo "❌ 只有 $N 个文件（< $MIN_FILES），放弃发布 —— 线上未动"
  $SUDO rm -rf "$STAGE"; exit 1
fi
$SUDO test -s "$STAGE/index.html" || { echo "❌ 暂存缺 index.html，放弃 —— 线上未动"; $SUDO rm -rf "$STAGE"; exit 1; }

# ③ 备份上一版
$SUDO rm -rf "$BACKUP"
$SUDO cp -a "$WEBROOT" "$BACKUP"

# ④ 原子切换：同分区两次 rename（中间窗口极小，且两个目录内容都是完整的）
$SUDO rm -rf "$WEBROOT.old"
$SUDO mv "$WEBROOT" "$WEBROOT.old"
$SUDO mv "$STAGE" "$WEBROOT"
$SUDO rm -rf "$WEBROOT.old"

# ⑤ 归属与清理
$SUDO chown -R "$(id -un):$(id -gn)" "$WEBROOT" 2>/dev/null || true
rm -f "$TARBALL"
echo "✅ 已发布：$($SUDO find "$WEBROOT" -type f | wc -l) 个文件（回滚：$BACKUP）"
