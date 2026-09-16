/**
 * 匿名花笺的冒烟测试 —— 不需要 wrangler、不需要 D1 账号。
 *
 * 用一个内存版假 D1 模拟真实 SQL 的行为（按 SQL 文本分派到对应的内存操作）。
 * 它不认识某条 SQL 时会直接报错，所以不会静默放过拼错的查询。
 *
 *   cd worker && node test/smoke-notes.mjs
 */

import worker from '../src/index.js';

const SALT = 'test-salt-0123456789abcdef';
const KEY = 'test-manage-key-abcdef';

/* ─────────── 假的 KV（献花用，这里只求不炸） ─────────── */
function makeKV() {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  };
}

/* ─────────── 假的 D1 ─────────── */
function makeD1() {
  const rows = [];
  let nextId = 1;

  /** 按 SQL 的 SELECT 列清单裁剪字段——真实 D1 不会返回没 select 的列 */
  function pick(r, sql) {
    const m = sql.match(/SELECT\s+([\s\S]*?)\s+FROM/i);
    const cols = m && m[1].trim() !== '*'
      ? m[1].split(',').map((s) => s.trim().toLowerCase())
      : null;
    const all = { id: r.id, name: r.name, body: r.body, created_at: r.created_at, status: r.status };
    if (!cols) return all;
    const out = {};
    for (const c of cols) if (c in all) out[c] = all[c];
    return out;
  }

  function exec(sql, args) {
    const q = sql.replace(/\s+/g, ' ').trim();

    if (/^INSERT INTO notes/i.test(q)) {
      const [created_at, day, name, body, status, ip_hash, token] = args;
      rows.push({ id: nextId++, created_at, day, name, body, status, ip_hash, token });
      return [];
    }
    if (/^SELECT COUNT\(\*\) AS n FROM notes/i.test(q)) {
      const [day, ip] = args;
      return [{ n: rows.filter((r) => r.day === day && r.ip_hash === ip).length }];
    }
    if (/^UPDATE notes SET status/i.test(q)) {
      const [status, id] = args;
      const r = rows.find((x) => x.id === Number(id));
      if (r) r.status = status;
      return [];
    }
    if (/WHERE token IN/i.test(q)) {
      return rows
        .filter((r) => args.includes(r.token) && r.status !== 'rejected')
        .sort((a, b) => b.id - a.id)
        .map((r) => pick(r, q));
    }
    if (/status = 'approved'/i.test(q)) {
      const lim = Number(args[0]) || 200;
      return rows
        .filter((r) => r.status === 'approved')
        .sort((a, b) => b.id - a.id)
        .slice(0, lim)
        .map((r) => pick(r, q));
    }
    if (/status = 'pending'/i.test(q)) {
      return rows
        .filter((r) => r.status === 'pending')
        .sort((a, b) => a.id - b.id)
        .map((r) => pick(r, q));
    }
    throw new Error('假 D1 不认识这条 SQL（说明测试没覆盖到）：' + q);
  }

  return {
    _rows: rows,
    prepare(sql) {
      const st = { _sql: sql, _args: [] };
      st.bind = (...a) => { st._args = a; return st; };
      st.all = async () => ({ results: exec(st._sql, st._args) });
      st.run = async () => { exec(st._sql, st._args); return { success: true }; };
      return st;
    },
  };
}

const env = {
  DAILY_SALT: SALT,
  MANAGE_KEY: KEY,
  FLOWERS: makeKV(),
  NOTES_DB: makeD1(),
};

/* ─────────── 测试工具 ─────────── */
let pass = 0, fail = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ✅ ' + label); }
  else {
    fail++;
    console.log('  ❌ ' + label + '\n     期望: ' + JSON.stringify(expected) + '\n     实际: ' + JSON.stringify(actual));
  }
}

async function call(method, path, body, opts = {}) {
  const headers = {};
  if (opts.origin !== false) headers['Origin'] = opts.origin || 'https://elysiad.top';
  headers['CF-Connecting-IP'] = opts.ip || '203.0.113.7';
  let init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await worker.fetch(new Request('https://flowers.elysiad.top' + path, init), env);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json, text, headers: res.headers };
}

console.log('\n【1】提交一条留言');
let token = null;
{
  const r = await call('POST', '/notes', { name: '小星', body: '谢谢你一直在。' });
  check('状态 201', r.status, 201);
  check('返回 ok', r.body && r.body.ok, true);
  check('返回 32 位十六进制 token', /^[0-9a-f]{32}$/.test(r.body.token || ''), true);
  // 主站开了 Cache Rule 之后，接口必须显式禁缓存，否则
  // 「刚通过的留言别人两分钟后才看得到」
  check('响应禁缓存 Cache-Control: no-store', r.headers.get('Cache-Control'), 'no-store');
  token = r.body.token;
}

console.log('\n【2】先审后发：pending 不出现在公开列表');
{
  const r = await call('GET', '/notes');
  check('状态 200', r.status, 200);
  check('公开列表为空（还没审）', r.body.notes, []);
}

console.log('\n【3】提交者凭 token 能看到自己那条');
{
  const r = await call('GET', '/notes?tokens=' + token);
  check('mine 有 1 条', r.body.mine.length, 1);
  check('状态是 pending', r.body.mine[0].status, 'pending');
  check('正文正确', r.body.mine[0].body, '谢谢你一直在。');
  check('昵称正确', r.body.mine[0].name, '小星');
}

console.log('\n【4】别人的 token 看不到自己那条');
{
  const r = await call('GET', '/notes?tokens=' + 'f'.repeat(32));
  check('两边的 mine 互不可见', r.body.mine, []);
}

console.log('\n【5】服务端校验：空内容 / 超长 / 含链接');
{
  check('空内容 → 400 empty', (await call('POST', '/notes', { body: '   ' })).body.error, 'empty');
  check('超 80 字 → 400 too_long',
    (await call('POST', '/notes', { body: '字'.repeat(81) })).body.error, 'too_long');
  check('昵称超 16 字 → 400 too_long',
    (await call('POST', '/notes', { name: '名'.repeat(17), body: '你好' })).body.error, 'too_long');
  check('带 http:// → 400 has_link',
    (await call('POST', '/notes', { body: '看这个 http://spam.example' })).body.error, 'has_link');
  check('裸域名也挡 → 400 has_link',
    (await call('POST', '/notes', { body: 'buy now at cheap-watches.com' })).body.error, 'has_link');
  check('www. 也挡 → 400 has_link',
    (await call('POST', '/notes', { body: 'www.spam.cn 快来看' })).body.error, 'has_link');
  // ⚠ 这条必须换 IP：否则它会占掉下面【6】限流测试的额度
  check('正确的 80 字刚好通过',
    (await call('POST', '/notes', { body: '字'.repeat(80) }, { ip: '192.0.2.200' })).status, 201);
}

console.log('\n【6】限流：每 IP 每天 3 条');
{
  // 【1】已用掉 1 条，这里再发 2 条正好到上限（每 IP 每天 3 条）
  check('第 2 条 201', (await call('POST', '/notes', { body: '第二条' })).status, 201);
  check('第 3 条 201', (await call('POST', '/notes', { body: '第三条' })).status, 201);
  const r = await call('POST', '/notes', { body: '第四条' });
  check('第 4 条 → 429', r.status, 429);
  check('错误码 rate_limited', r.body.error, 'rate_limited');
  check('换 IP 不受影响', (await call('POST', '/notes', { body: '换个 IP' }, { ip: '198.51.100.9' })).status, 201);
}

console.log('\n【7】来源校验');
{
  const r = await call('POST', '/notes', { body: '来自异站' }, { origin: 'https://evil.example.com' });
  check('异站来源 → 403', r.status, 403);
  check('错误码 forbidden origin', r.body.error, 'forbidden origin');

  // 界面换到同源之后，线上请求是 elysiad.top/notes，部分浏览器不带 Origin。
  // 放行空 Origin 是必须的，否则同源提交会被自己挡掉。
  check('不带 Origin → 放行（同源请求）',
    (await call('POST', '/notes', { body: '同源请求' }, { origin: false, ip: '192.0.2.77' })).status, 201);
}

console.log('\n【8】管理页：密钥不对一律 404（不暴露入口存在）');
{
  check('无 key → 404', (await call('GET', '/notes/manage')).status, 404);
  check('错 key → 404', (await call('GET', '/notes/manage?key=wrong')).status, 404);
  check('长度不同的 key → 404', (await call('GET', '/notes/manage?key=x')).status, 404);
}

console.log('\n【9】管理页：正确密钥能看到待审列表');
{
  const r = await call('GET', '/notes/manage?key=' + KEY);
  check('状态 200', r.status, 200);
  check('是 HTML', r.headers.get('Content-Type').startsWith('text/html'), true);
  // 不要写死数字——前面任何一个用例改动都会让它失效。从实际数据算。
  const pendingN = env.NOTES_DB._rows.filter((r) => r.status === 'pending').length;
  check('待审条数与库里一致（' + pendingN + '）', r.text.includes('待审 ' + pendingN + ' 条'), true);
  check('含留言正文', r.text.includes('谢谢你一直在。'), true);
  check('有两个操作按钮', r.text.includes('value="approve"') && r.text.includes('value="reject"'), true);
  check('响应头禁缓存', r.headers.get('Cache-Control'), 'no-store');
}

console.log('\n【10】XSS：用户内容必须被转义');
{
  await call('POST', '/notes', { body: '<script>alert(1)</script><img src=x onerror=alert(2)>' }, { ip: '192.0.2.55' });
  const r = await call('GET', '/notes/manage?key=' + KEY);
  check('原始 <script> 标签没出现在页面里', r.text.includes('<script>alert(1)</script>'), false);
  check('尖括号被转义', r.text.includes('&lt;script&gt;'), true);
  check('onerror 也被转义（引号）', r.text.includes('onerror=alert(2)') && !r.text.includes('<img src=x'), true);
}

console.log('\n【11】审核：通过后上墙');
{
  const before = (await call('GET', '/notes')).body.notes.length;
  check('通过前公开列表为空', before, 0);

  const r = await call('POST', '/notes/manage?key=' + KEY, { id: 1, action: 'approve' });
  check('通过返回 200', r.status, 200);
  check('返回新状态', r.body.status, 'approved');

  const after = (await call('GET', '/notes')).body;
  check('公开列表出现 1 条', after.notes.length, 1);
  check('内容正确', after.notes[0].body, '谢谢你一直在。');
  check('公开列表不含 status 字段', 'status' in after.notes[0], false);

  const mine = (await call('GET', '/notes?tokens=' + token)).body.mine;
  check('提交者那边状态变 approved', mine[0].status, 'approved');
}

console.log('\n【12】审核：删除后两边都看不到');
{
  await call('POST', '/notes/manage?key=' + KEY, { id: 2, action: 'reject' });
  const pub = (await call('GET', '/notes')).body.notes;
  check('公开列表不含被删的', pub.filter((n) => n.id === 2).length, 0);

  // 被删的那条连提交者自己也看不到
  const all = env.NOTES_DB._rows.filter((r) => r.id === 2);
  check('库里状态是 rejected', all[0].status, 'rejected');
}

console.log('\n【13】管理操作参数校验');
{
  check('非法 action → 400', (await call('POST', '/notes/manage?key=' + KEY, { id: 1, action: 'drop' })).status, 400);
  check('非数字 id → 400', (await call('POST', '/notes/manage?key=' + KEY, { id: 'abc', action: 'approve' })).status, 400);
}

console.log('\n【14】表单提交（管理页按钮走的是这条路）');
{
  const r = await call('POST', '/notes/manage?key=' + KEY, 'id=3&action=approve');
  check('返回 303 重定向回管理页', r.status, 303);
  check('Location 指向管理页', (r.headers.get('Location') || '').includes('/notes/manage?key='), true);
}

console.log('\n【15】隐私：D1 里查不到 IP 原文');
{
  const dumped = JSON.stringify(env.NOTES_DB._rows);
  check('不含 IP 明文', dumped.includes('203.0.113.7') || dumped.includes('198.51.100.9'), false);
  check('不含盐', dumped.includes(SALT), false);
  check('ip_hash 形如 32 位十六进制', /^[0-9a-f]{32}$/.test(env.NOTES_DB._rows[0].ip_hash), true);
}

console.log('\n【16】不知道的路径仍然 404');
{
  check('GET /nope → 404', (await call('GET', '/nope')).status, 404);
}

console.log('\n' + '─'.repeat(46));
console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('─'.repeat(46) + '\n');
process.exit(fail === 0 ? 0 : 1);
