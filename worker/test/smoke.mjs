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

console.log('\n【12】来源判定：只比主机名（2026-09-16 回归用例）');
{
  // ⚠ 这一节是为一次真实事故补的，别再删掉。
  //
  //   QQ 浏览器的云加速把页面降级成 http 提供给访客，于是送来的 Origin 是
  //   'http://elysiad.top'；而白名单当时只写了 'https://elysiad.top'，
  //   字符串一比不等 → 403 → 点献花静默降级成「本机累计 N 朵」。
  //   页面能开、接口也连得上，**只差一个字母 s**，而且降级不报错。
  //
  //   这一节第一条就是那个回归用例：**同一个站点、不同协议，必须放行。**
  //   另外补了后缀伪装的用例 —— 如果判定写成 host.endsWith('elysiad.top')，
  //   'elysiad.top.evil.com' 会被误放行，那是个经典坑。

  const allow = [
    ['http://elysiad.top', 'http 同站（QQ 浏览器云加速就是这种）'],
    ['https://elysiad.top', 'https 同站'],
    ['https://www.elysiad.top', 'www 子域'],
    ['http://localhost:8500', '本地调试'],
    ['http://127.0.0.1:8500', '本地调试（IP 形式）'],
    ['https://elysiad.top:8443', '非默认端口'],
  ];
  for (let i = 0; i < allow.length; i++) {
    const [o, why] = allow[i];
    const r = await call('POST', '/flower', { origin: o, ip: `198.51.100.${i + 1}` });
    check(`放行 ${why}`, r.status, 200);
  }

  const block = [
    ['https://evil.example.com', '异站'],
    ['https://elysiad.top.evil.com', '后缀伪装（endsWith 的经典漏洞）'],
    ['https://notelysiad.top', '相似域名'],
    ['null', '沙箱来源'],
    ['not a url', '不是合法 URL'],
  ];
  for (let i = 0; i < block.length; i++) {
    const [o, why] = block[i];
    const r = await call('POST', '/flower', { origin: o, ip: `198.51.100.${i + 51}` });
    check(`拦下 ${why}`, r.status, 403);
  }

  // 空 Origin 放行：同源请求在部分浏览器里不带这个头
  const noOrigin = await call('POST', '/flower', { origin: '', ip: '198.51.100.99' });
  check('空 Origin 放行（部分浏览器同源不带这个头）', noOrigin.status, 200);
}

console.log(`\n${'─'.repeat(46)}`);
console.log(`  通过 ${pass} 项，失败 ${fail} 项`);
console.log(`${'─'.repeat(46)}\n`);
process.exit(fail === 0 ? 0 : 1);
