#!/usr/bin/env bash
# deploy/security-watch.sh —— 2026-10 安全公告对照巡检（可复跑，只读）
#
# 背景：2026-10-21 前后一批公告（PHP / Node.js / Go / Rust / Tomcat / nginx）。
# 这个脚本只回答一件事：**我们这台服务器上，哪些真的受影响、哪些入口根本不存在**。
# 它不是通用漏洞扫描器，是「已知清单 → 我们装机事实」的对账表。
#
# 用法：bash deploy/security-watch.sh
set -uo pipefail

FAIL=0
WARN=0
ok(){ printf "  \033[32m[安全]\033[0m %-46s %s\n" "$1" "$2"; }
warn(){ printf "  \033[33m[注意]\033[0m %-46s %s\n" "$1" "$2"; WARN=$((WARN+1)); }
bad(){ printf "  \033[31m[需处理]\033[0m %-46s %s\n" "$1" "$2"; FAIL=$((FAIL+1)); }
na(){ printf "  \033[90m[不适用]\033[0m %-46s %s\n" "$1" "$2"; }

# 版本比较：verlt A B ⇒ A < B 时返回 0
verlt(){ [ "$(printf "%s\n%s\n" "$1" "$2" | sort -V | head -1)" = "$1" ] && [ "$1" != "$2" ]; }

echo "== 运行时版本 =="
NGX=$(nginx -v 2>&1 | sed -E "s/.*nginx\/([0-9.]+).*/\1/")
NODE=$(node -v 2>/dev/null | sed "s/^v//")
PHPV=$(php -v 2>/dev/null | head -1 | sed -E "s/^PHP ([0-9.]+).*/\1/")
GOV=$(go version 2>/dev/null | sed -E "s/.*go([0-9.]+).*/\1/")
JAVAV=$(command -v java >/dev/null 2>&1 && java -version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
echo "  nginx=${NGX:-无} node=${NODE:-无} php=${PHPV:-无} go=${GOV:-无} java=${JAVAV:-无}"

echo
echo "== Node.js（修复版 22.23.4 / 24.22.1 / 26.12.1）=="
if [ -z "${NODE:-}" ]; then
  na "Node.js 未安装" "-"
elif verlt "$NODE" "22.23.4"; then
  warn "Node $NODE < 22.23.4" "版本受影响：8 个 CVE（含 brotli RCE）"
  echo "         · 本机可达性：API 代码**不解压 brotli/gzip**、**无出站 HTTP** ⇒ CVE-2026-111497 无入口"
  echo "         · 仍需处理的是 CVE-2026-105481（keep-alive 响应混淆，medium，HTTP 服务可达）"
  echo "         · 处置：装官方 22.23.4 到 /opt/node-v22.23.4 并改 systemd ExecStart（可秒回滚）"
else
  ok "Node $NODE" "≥ 修复版"
fi

echo
echo "== nginx（修复版 1.31.7+ 或 1.30.6+）=="
if [ -z "${NGX:-}" ]; then
  na "nginx 未安装" "-"
else
  warn "nginx $NGX" "上游区间含 1.28.x ⇒ 5 个 CVE 里 4 个版本命中"
  CONF=$(sudo nginx -T 2>/dev/null || cat /etc/nginx/nginx.conf 2>/dev/null || echo "")
  echo "$CONF" | grep -qE "listen[^;]*quic|http3" && bad "HTTP/3 已启用" "CVE-2026-95101 可达" || na "未启用 HTTP/3" "CVE-2026-95101"
  echo "$CONF" | grep -qE "ssl_certificate" && warn "已启用 TLS" "CVE-2026-97629 可达（会话票据）；可先 ssl_session_tickets off" || na "未启用 TLS" "CVE-2026-97629"
  echo "$CONF" | grep -qE "^\s*aio\s+on|ssi\s+on" && bad "AIO/SSI 已启用" "CVE-2026-97205 可达" || na "未启用 AIO/SSI" "CVE-2026-97205"
  if echo "$CONF" | grep -qE "^\s*alias" && echo "$CONF" | grep -qE "^\s*rewrite"; then
    bad "alias 与 rewrite 共存" "CVE-2026-15176 可达"
  else
    na "alias/rewrite 未共存" "CVE-2026-15176"
  fi
  echo "         · 93479（script eval）要求 1.31.2-1.31.6 或 1.30.0-1.30.5 ⇒ 1.28.x 不在区间"
  echo "         · ⚠ 开 TLS / HTTP3 之前必须先升 nginx（Ubuntu 源当前没有修复包）"
fi

echo
echo "== 其它生态 =="
[ -z "${PHPV:-}" ] && na "PHP 未安装" "CVE-2026-109618 / 109619" || warn "PHP $PHPV" "需核对 2026-10-21 修复版"
[ -z "${GOV:-}" ] && na "Go 未安装" "CVE-2026-111943（需 1.27.3 / 1.26.10）" || warn "Go $GOV" "核对 1.27.3 / 1.26.10"
[ -z "${JAVAV:-}" ] && na "Java/Tomcat 未安装" "CVE-2026-101296" || warn "Java $JAVAV" "核对 Tomcat CVE-2026-101296"
if command -v rustc >/dev/null 2>&1; then
  warn "Rust 工具链 $(rustc --version | awk "{print \$2}")" "RUSTSEC-2026-0382/0383（rustls/webpki 信任链）"
else
  na "rustc 未安装" "RUSTSEC-2026-0382/0383；本机 rust-coreutils/sudo-rs 不做 TLS 校验"
fi

echo
echo "== 系统信任库（eMudhra 中间 CA 事故相关）=="
CAS=$(dpkg -s ca-certificates 2>/dev/null | awk "/^Version:/{print \$2}")
echo "  ca-certificates = ${CAS:-未知}（2026-10 事故后建议 apt update && apt upgrade ca-certificates）"

echo
echo "== 汇总 =="
echo "  需处理 $FAIL 项 / 注意 $WARN 项"
exit 0
