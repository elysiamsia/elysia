/**
 * 本地冒烟测试 —— 不需要 wrangler、不需要 Cloudflare 账号。
 * Node 18+ 自带 Request / Response / crypto.subtle，所以 Worker 逻辑可以直接跑。
 *
 *   cd worker && npm run smoke
 */

import worker from '../src/index.js';

// ---------- 假的 KV ----------
function makeKV() {
  const store = new Map();
  return {
    _store: store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

const env = { DAILY_SALT: 'test-salt-0123456789abcdef', FLOWERS: makeKV() };

// ---------- 测试工具 ----------
let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}\n     期望: ${JSON.stringify(expected)}\n     实际: ${JSON.stringify(actual)}`);
  }
}

async function call(method, path, { origin = 'https://elysiad.top', ip = '203.0.113.7' } = {}) {
  const headers = {};
  if (origin) headers['Origin'] = origin;
  headers['CF-Connecting-IP'] = ip;

  const res = await worker.fetch(new Request(`https://flowers.elysiad.top${path}`, { method, headers }), env);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, headers: res.headers };
}

// ---------- 开跑 ----------
console.log('\n【1】初始总数为 0');
{
  const r = await call('GET', '/count');
  check('GET /count → 200', r.status, 200);
  check('count 为 0', r.body, { count: 0 });
}

console.log('\n【2】献第一朵');
{
  const r = await call('POST', '/flower');
  check('状态 200', r.status, 200);
  check('count 变 1', r.body, { count: 1 });
}

console.log('\n【3】献花后总数同步');
{
  const r = await call('GET', '/count');
  check('GET /count 反映 1', r.body, { count: 1 });
}

console.log('\n【4】CORS 头正确');
{
  const r = await call('POST', '/flower');
  check('Allow-Origin 是同站', r.headers.get('Access-Control-Allow-Origin'), 'https://elysiad.top');
  check('带 Vary: Origin', r.headers.get('Vary'), 'Origin');
}

console.log('\n【5】预检请求');
{
  const res = await worker.fetch(
    new Request('https://flowers.elysiad.top/flower', {
      method: 'OPTIONS',
      headers: { Origin: 'https://elysiad.top' },
    }),
    env
  );
  check('OPTIONS → 204', res.status, 204);
  check('预检也带 CORS', res.headers.get('Access-Control-Allow-Origin'), 'https://elysiad.top');
}

console.log('\n【6】异站来源被拒（防盗刷）');
{
  const r = await call('POST', '/flower', { origin: 'https://evil.example.com' });
  check('状态 403', r.status, 403);
  check('返回 forbidden origin', r.body, { error: 'forbidden origin' });
  check('总数没被改动', (await call('GET', '/count')).body.count, 2);
}

console.log('\n【7】每个 IP 每日限 5 朵');
{
  // 上面已经献过 2 朵，再献 3 朵应该都成功（累计 5）
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await call('POST', '/flower')).status);
  check('第 3~5 朵成功', codes, [200, 200, 200]);

  // 第 6、7 朵应被限流
  const r6 = await call('POST', '/flower');
  check('第 6 朵 → 429', r6.status, 429);
  check('带 limited 标记', r6.body.limited, true);
  check('限流时仍返回总数', typeof r6.body.count, 'number');

  const r7 = await call('POST', '/flower');
  check('第 7 朵 → 429', r7.status, 429);
}

console.log('\n【8】换一个 IP 不受影响');
{
  const r = await call('POST', '/flower', { ip: '198.51.100.22' });
  check('新 IP 状态 200', r.status, 200);
  check('总数继续累加', r.body, { count: 6 });
}

console.log('\n【9】隐私：KV 里查不到 IP 原文');
{
  const keys = [...env.FLOWERS._store.keys()];
  const rateKeys = keys.filter((k) => k.startsWith('ip:'));
  check('存在按 IP 的限流键', rateKeys.length >= 1, true);

  const dumped = JSON.stringify([...env.FLOWERS._store.entries()]);
  check('落盘内容不含 IP 明文', dumped.includes('203.0.113.7') || dumped.includes('198.51.100.22'), false);
  check('落盘内容不含盐', dumped.includes('test-salt-0123456789abcdef'), false);

  const sample = rateKeys[0];
  check('键名形如 ip:<日期>:<32位哈希>', /^ip:\d{4}-\d{2}-\d{2}:[0-9a-f]{32}$/.test(sample), true);
  console.log(`     示例键: ${sample}`);
}

console.log('\n【10】未知路径 404');
{
  const r = await call('GET', '/nope');
  check('状态 404', r.status, 404);
}

console.log('\n【11】KV 读失败时不炸，返回 0');
{
  const brokenEnv = {
    DAILY_SALT: 'x',
    FLOWERS: {
      async get() {
        throw new Error('KV down');
      },
      async put() {
        throw new Error('KV down');
      },
    },
  };
  const res = await worker.fetch(
    new Request('https://flowers.elysiad.top/count', { headers: { Origin: 'https://elysiad.top' } }),
    brokenEnv
  );
  check('KV 挂掉时返回 500 而不是崩溃', res.status, 500);
  const body = await res.json();
  check('返回结构化错误', body.error, 'internal');
}

console.log(`\n${'─'.repeat(46)}`);
console.log(`  通过 ${pass} 项，失败 ${fail} 项`);
console.log(`${'─'.repeat(46)}\n`);
process.exit(fail === 0 ? 0 : 1);
