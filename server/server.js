/* server/server.js —— elysiad.top 的小后端（Node 内置模块，零依赖）
 *
 * 它替掉的是 Cloudflare Worker（worker/src/index.js），接口契约**逐字段对齐**：
 *   GET  /count                     → { total }
 *   POST /flower  {n}               → { total, added }
 *   GET  /notes?tokens=a,b          → { notes:[{id,name,body,created_at}], mine:[{...,status}] }
 *   POST /notes   {name,body}       → { ok, note }（含 token，用于"我提交过的"）
 *   GET/POST /notes/manage?key=…    → 管理（批准/删除）
 *
 * 存储：JSON 文件（44 朵花 + 几条留言，用不着数据库；要换 SQLite 时改 load/save 两个函数即可）
 *   ⚠ 落盘用「写临时文件 + rename」保证原子性（断电不会写坏）
 * 限流：与 Worker 同口径 —— 献花每 IP 每天 5 次；留言每 IP 每天 3 条（上海日）
 * 安全：只监听 127.0.0.1（nginx 反代），IP 只存哈希（DAILY_SALT + 当日 + IP）
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8787);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'elysia.json');
const SALT = process.env.DAILY_SALT || 'change-me';
const MANAGE_KEY = process.env.MANAGE_KEY || '';
const ALLOWED_HOSTS = ['elysiad.top', 'www.elysiad.top', '1.14.60.153'];
const FLOWER_DAILY_LIMIT = 5;
const NOTE_DAILY_LIMIT = 3;
const NOTE_NAME_MAX = 16, NOTE_BODY_MAX = 80;

function load() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { total: 0, notes: [], nextId: 1, rate: {} }; }
}
function save(db) {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_PATH);          // 原子替换
}
function shanghaiDay() {                 // 与 Worker 同口径：上海时区的 YYYY-MM-DD
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}
function hashIp(ip, day) {
  return crypto.createHash('sha256').update(SALT + '|' + day + '|' + ip).digest('hex').slice(0, 32);
}
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const LINK_RE = /(https?:\/\/|www\.|:\/\/|\b[a-z0-9-]+\.(com|cn|net|org|top|xyz|info|cc)\b)/i;
function validateNote(name, body) {
  if (typeof name !== 'string' || typeof body !== 'string') return { error: 'bad_request' };
  name = name.trim(); body = body.trim();
  if (!name || !body) return { error: 'empty' };
  if (name.length > NOTE_NAME_MAX) return { error: 'name_too_long' };
  if (body.length > NOTE_BODY_MAX) return { error: 'body_too_long' };
  if (LINK_RE.test(name) || LINK_RE.test(body)) return { error: 'no_links' };
  return { name, body };
}
function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket.remoteAddress || '';
}
function ok(res, obj, code) {
  const s = JSON.stringify(obj);
  res.writeHead(code || 200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 4096) { req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}
/* 管理页的密钥校验：**定长 + 常数时间比较**（与 Worker 同口径）。
   ⚠ 没配 MANAGE_KEY 或钥匙不对，一律回 404 —— 不暴露「这里有后台」。 */
function isAdmin(url) {
  const key = String(url.searchParams.get('key') || '');
  if (!MANAGE_KEY || !key || key.length !== MANAGE_KEY.length) return false;
  return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(MANAGE_KEY));
}
/* 表单是 application/x-www-form-urlencoded（不是 JSON），单独一个读取器 */
function readRaw(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 8192) req.destroy(); });
    req.on('end', () => resolve(d));
    req.on('error', () => resolve(''));
  });
}
function manageHtml(db, key) {
  const st = { approved: ['已批准', '#5fd39a'], pending: ['待审', '#e6c15a'], rejected: ['已拒绝', '#8b8b9e'] };
  const rows = db.notes.slice().sort((a, b) => b.id - a.id).map((n) => {
    const [txt, col] = st[n.status] || ['?', '#8b8b9e'];
    const act = n.status === 'approved' ? ['reject', '拒绝'] : ['approve', '批准'];
    return '<tr><td>' + n.id + '</td><td>' + (n.created_at || '') + '</td><td>' + (n.name || '') +
      '</td><td>' + (n.body || '') + '</td><td style="color:' + col + '">' + txt +
      '</td><td><form method="post" action="/notes/manage?key=' + encodeURIComponent(key) + '">' +
      '<input type="hidden" name="id" value="' + n.id + '"><input type="hidden" name="action" value="' + act[0] + '">' +
      '<button class="b">' + act[1] + '</button></form></td></tr>';
  }).join('');
  return '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow"><title>留言管理</title><style>' +
    'body{background:#0c0503;color:#e8e0f0;font:14px/1.7 -apple-system,PingFang SC,Microsoft YaHei,sans-serif;padding:2rem 1.2rem}' +
    'h1{font-weight:400;font-size:1rem;letter-spacing:.24em;color:#ff6b35;margin-bottom:1.4rem}' +
    'table{border-collapse:collapse;width:100%;max-width:56rem}td,th{border-bottom:1px solid #ffffff1a;padding:.5rem .6rem;text-align:left;vertical-align:top}' +
    'th{color:#8b8b9e;font-weight:400;font-size:.78rem;letter-spacing:.1em}' +
    '.b{cursor:pointer;font:inherit;font-size:.78rem;min-height:36px;padding:.3rem .9rem;color:#0c0503;background:#ff6b35;border:none;border-radius:999px}' +
    '.n{color:#8b8b9e}.s{font-size:.76rem;color:#5fd39a}</style></head><body><h1>留言管理</h1>' +
    '<p class="n">共 ' + db.notes.length + ' 条 · 对外只显示「已批准」的（' +
    db.notes.filter((n) => n.status === 'approved').length + ' 条）· 献花总数 ' + db.total + '</p>' +
    '<table><tr><th>id</th><th>时间</th><th>名字</th><th>内容</th><th>状态</th><th>操作</th></tr>' + rows + '</table></body></html>';
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const day = shanghaiDay();
  const ipHash = hashIp(clientIp(req), day);
  let db = load();
  // 清理过期的限流记录（只留今天的）
  for (const k of Object.keys(db.rate)) if (!k.endsWith(day)) delete db.rate[k];

  if (url.pathname === '/count' && req.method === 'GET') {
    /* ⚠ 字段名必须是 count：前端契约（assets/flowers.js 顶部注释）写的是 {count}。
       我最初返回 {total} ⇒ 前端读到 undefined ⇒ 判成失败 ⇒ 静默降级成本地计数。
       total 一并返回只是为了兼容，真正被读的是 count。 */
    return ok(res, { count: db.total, total: db.total });
  }
  if (url.pathname === '/flower' && req.method === 'POST') {
    const b = (await readBody(req)) || {};
    const n = Math.min(Math.max(1, Number(b.n) || 1), 5);
    const key = 'f:' + ipHash;
    const used = Number(db.rate[key] || 0);
    const left = FLOWER_DAILY_LIMIT - used;
    if (left <= 0) return ok(res, { count: db.total, total: db.total, added: 0, limit: true });
    const added = Math.min(n, left);
    db.total += added; db.rate[key] = used + added; save(db);
    return ok(res, { count: db.total, total: db.total, added: added });
  }
  if (url.pathname === '/notes' && req.method === 'GET') {
    const tokens = String(url.searchParams.get('tokens') || '').split(',').map((t) => t.trim()).filter((t) => /^[0-9a-f]{32}$/.test(t)).slice(0, 20);
    const pub = db.notes.filter((n) => n.status === 'approved').sort((a, b) => b.id - a.id).slice(0, 200)
      .map((n) => ({ id: n.id, name: n.name, body: n.body, created_at: n.created_at }));
    const mine = db.notes.filter((n) => tokens.includes(n.token) && n.status !== 'rejected').sort((a, b) => b.id - a.id)
      .map((n) => ({ id: n.id, name: n.name, body: n.body, created_at: n.created_at, status: n.status }));
    return ok(res, { notes: pub, mine: mine });
  }
  if (url.pathname === '/notes' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b) return ok(res, { error: 'bad_request' }, 400);
    const v = validateNote(b.name, b.body);
    if (v.error) return ok(res, { error: v.error }, 400);
    const key = 'n:' + ipHash;
    if (Number(db.rate[key] || 0) >= NOTE_DAILY_LIMIT) return ok(res, { error: 'daily_limit' }, 429);
    const token = crypto.randomBytes(16).toString('hex');
    const note = { id: db.nextId++, name: esc(v.name), body: esc(v.body), created_at: new Date().toISOString().slice(0, 16).replace('T', ' '), status: 'pending', day: day, ip_hash: ipHash, token: token };
    db.notes.push(note); db.rate[key] = Number(db.rate[key] || 0) + 1;
    if (!save(db)) return ok(res, { error: 'io' }, 500);
    return ok(res, { ok: true, token: token, note: { id: note.id, name: note.name, body: note.body, created_at: note.created_at, status: note.status } });
  }

  /* ── /notes/manage：审留言。口径与 Worker 完全一致（动作只有 approve / reject，表单或 JSON 都收，
       表单提交后 303 回跳；没钥匙一律 404）── */
  if (url.pathname === '/notes/manage') {
    if (!isAdmin(url)) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('not found'); }
    const key = String(url.searchParams.get('key') || '');
    if (req.method === 'POST') {
      const ct = String(req.headers['content-type'] || '');
      let id = null, action = null;
      if (ct.includes('application/json')) { const b = await readBody(req); if (b) { id = b.id; action = b.action; } }
      else { const p = new URLSearchParams(await readRaw(req)); id = p.get('id'); action = p.get('action'); }
      id = parseInt(id, 10);
      if (!Number.isInteger(id) || (action !== 'approve' && action !== 'reject')) { res.writeHead(400); return res.end('bad request'); }
      const n = db.notes.find((x) => x.id === id);
      if (n) { n.status = action === 'approve' ? 'approved' : 'rejected'; save(db); }
      if (ct.includes('application/json')) return ok(res, { ok: true, id: id, status: n ? n.status : null });
      res.writeHead(303, { location: '/notes/manage?key=' + encodeURIComponent(key) });
      return res.end();
    }
    const html = manageHtml(db, key);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
    return res.end(html);
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found');
});
server.listen(PORT, '127.0.0.1', () => console.log('elysia-api listening on 127.0.0.1:' + PORT + ' db=' + DB_PATH));
