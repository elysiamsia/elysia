-- 匿名花笺的表结构
--
-- 应用方式（远程）：
--   cd worker
--   wrangler d1 execute elysia-notes --remote --file=./schema.sql
--
-- 本地开发：
--   wrangler d1 execute elysia-notes --local --file=./schema.sql
--
-- 设计要点：
--   · status 三态：pending（待审）/ approved（已上墙）/ rejected（已删）
--   · 先审后发 —— 新提交一律 pending，不出现在公开列表里
--   · ip_hash 只存 hash(IP + 每日盐)，不落 IP 原文（与献花同一套隐私策略）
--   · token 给提交者自查用，32 位随机十六进制，猜不到

CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,                     -- 毫秒时间戳
  day        TEXT    NOT NULL,                     -- YYYY-MM-DD（北京时区），用于限流
  name       TEXT,                                 -- 昵称，可空，≤16 字
  body       TEXT    NOT NULL,                     -- 正文，≤80 字
  status     TEXT    NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  ip_hash    TEXT    NOT NULL,                     -- hash(IP + 每日盐)
  token      TEXT    NOT NULL                      -- 提交者自查凭证
);

-- 公开列表：按 status 过滤 + 倒序，这条索引直接服务 GET /notes
CREATE INDEX IF NOT EXISTS idx_notes_status_id ON notes(status, id DESC);

-- 限流查询：WHERE day = ? AND ip_hash = ?
CREATE INDEX IF NOT EXISTS idx_notes_rate ON notes(day, ip_hash);

-- 自查：WHERE token IN (...)
CREATE INDEX IF NOT EXISTS idx_notes_token ON notes(token);
