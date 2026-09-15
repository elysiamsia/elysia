/**
 * elysiad.top 献花计数器
 *
 * GET  /count   → {"count": 1247}
 * POST /flower  → {"count": 1248}
 *
 * 隐私：KV 里只存 hash(IP + 每日盐 + 日期)，不落 IP 原文。盐每日轮换。
 * 限流：每 IP 每日 5 朵。
 */

const ALLOWED_ORIGINS = [
  'https://elysiad.top',
  'https://www.elysiad.top',
  // 本地调试用，上线后可以删掉
  'http://localhost:8500',
  'http://127.0.0.1:8500',
];

const TOTAL_KEY = 'total';
const DAILY_LIMIT = 5;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    // 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/count' && request.method === 'GET') {
        return json({ count: await getTotal(env) }, cors);
      }

      if (url.pathname === '/flower' && request.method === 'POST') {
        // 只认同站来源，挡掉被别处盗刷
        if (!ALLOWED_ORIGINS.includes(origin)) {
          return json({ error: 'forbidden origin' }, cors, 403);
        }

        const ip = request.headers.get('CF-Connecting-IP') || '';
        const day = shanghaiDay();
        const id = await hashIp(ip, day, env.DAILY_SALT);

        // 每人每日限流
        const rateKey = `ip:${day}:${id}`;
        const used = parseInt((await env.FLOWERS.get(rateKey)) || '0', 10);
        if (used >= DAILY_LIMIT) {
          return json({ count: await getTotal(env), limited: true }, cors, 429);
        }
        await env.FLOWERS.put(rateKey, String(used + 1), { expirationTtl: 172800 });

        // 总数 +1
        const total = (await getTotal(env)) + 1;
        await env.FLOWERS.put(TOTAL_KEY, String(total));

        return json({ count: total }, cors);
      }

      return json({ error: 'not found' }, cors, 404);
    } catch (err) {
      // 出错也让前端能拿到数字，前端有降级但没必要主动触发
      return json({ error: 'internal', message: String(err && err.message) }, cors, 500);
    }
  },
};

async function getTotal(env) {
  const raw = await env.FLOWERS.get(TOTAL_KEY);
  const n = parseInt(raw || '0', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** 按中国时区算「今天」，避免 UTC 跨日导致用户凌晨 8 点才重置 */
function shanghaiDay() {
  const now = new Date();
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return shanghai.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** SHA-256(ip | day | salt)，取前 32 位十六进制。不可逆，无法还原出 IP */
async function hashIp(ip, day, salt) {
  const data = new TextEncoder().encode(`${ip}|${day}|${salt}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
