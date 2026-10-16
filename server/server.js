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
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const day = shanghaiDay();
  const ipHash = hashIp(clientIp(req), day);
  let db = load();
  // 清理过期的限流记录（只留今天的）
  for (const k of Object.keys(db.rate)) if (!k.endsWith(day)) delete db.rate[k];

  if (url.pathname === '/count' && req.method === 'GET') {
    return ok(res, { total: db.total });
  }
  if (url.pathname === '/flower' && req.method === 'POST') {
    const b = (await readBody(req)) || {};
    const n = Math.min(Math.max(1, Number(b.n) || 1), 5);
    const key = 'f:' + ipHash;
    const used = Number(db.rate[key] || 0);
    const left = FLOWER_DAILY_LIMIT - used;
    if (left <= 0) return ok(res, { total: db.total, added: 0, limit: true });
    const added = Math.min(n, left);
    db.total += added; db.rate[key] = used + added; save(db);
    return ok(res, { total: db.total, added: added });
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
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found');
});
server.listen(PORT, '127.0.0.1', () => console.log('elysia-api listening on 127.0.0.1:' + PORT + ' db=' + DB_PATH));
