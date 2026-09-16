/**
 * elysiad.top 后端
 *
 * ── 献花计数（KV）──────────────────────────────
 *   GET  /count   → {"count": 1247}
 *   POST /flower  → {"count": 1248}
 *   隐私：KV 里只存 hash(IP + 每日盐 + 日期)，不落 IP 原文。
 *   限流：每 IP 每日 5 朵。
 *
 * ── 匿名花笺（D1）──────────────────────────────
 *   POST /notes                    → {"ok":true,"token":"<32hex>"}
 *   GET  /notes                    → {"notes":[已上墙…],"mine":[自己提交的…]}
 *   GET  /notes?tokens=a,b,c       → 同上，mine 里带上自己那几条（含待审）
 *   GET  /notes/manage?key=…       → 极简管理页（HTML）
 *   POST /notes/manage?key=…       → 通过 / 删除
 *   先审后发：新提交一律 pending，不出现在公开列表里。
 *   隐私：同样只存 hash(IP + 每日盐)，不落 IP 原文。
 *   限流：每 IP 每日 3 条。
 *
 * ⚠ 所有校验都在服务端做。前端校验只是体验优化，不是防线——
 *   绕过前端直接发请求太容易了。
 */

/**
 * 允许的来源：**只比主机名，不比协议**。
 *
 * ⚠ 这里原本是一串精确的 URL（'https://elysiad.top' 等），2026-09-16 因此出了事：
 *   QQ 浏览器的云加速把页面降级成 http 提供给访客，于是页面的 origin 是
 *   'http://elysiad.top'；同源请求带着它发过来，和 'https://elysiad.top'
 *   字符串一比不等 → 403 → 访客点献花静默降级成「本机累计 N 朵」。
 *   页面能开、接口也连得上，**只差一个字母 s**，而且降级不报错，所以很久没人发现。
 *
 *   只比主机名之后，http / https / 端口变化都不再影响判定；
 *   而「别的网站拿访客的浏览器来刷」这条仍然挡得住。
 *   真正的防线始终是限流与校验——Origin 本来就挡不住脚本伪造。
 */
const ALLOWED_HOSTS = [
  'elysiad.top',
  'www.elysiad.top',
  // 本地调试用，上线后可以删掉
  'localhost',
  '127.0.0.1',
  '[::1]',
];

const DEFAULT_ORIGIN = 'https://elysiad.top';

/** 判定来源是否可信。空 Origin 放行：同源请求在部分浏览器里不带这个头。 */
function originAllowed(origin) {
  if (!origin) return true;
  // 'null' 来自沙箱 iframe / data: 页面，正经访客碰不到，不给过
  if (origin === 'null') return false;
  let host;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false; // 不是合法 URL，一律不给过
  }
  return ALLOWED_HOSTS.includes(host);
}

// 献花
const TOTAL_KEY = 'total';
const DAILY_LIMIT = 5;

// 匿名花笺
const NOTE_BODY_MAX = 80;
const NOTE_NAME_MAX = 16;
const NOTE_DAILY_LIMIT = 3;
const NOTE_LIST_MAX = 200;
const NOTE_TOKENS_MAX = 20;

// 含这些就不收——挡掉绝大多数广告。注意也要挡不带协议的裸域名（xxx.com）
const LINK_RE = /(https?:\/\/|www\.|:\/\/|\b[a-z0-9-]+\.(com|cn|net|org|top|xyz|info|cc|tv|me|io|shop|site|online)\b)/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      // ── 献花 ──────────────────────────────────
      if (url.pathname === '/count' && request.method === 'GET') {
        return json({ count: await getTotal(env) }, cors);
      }
      if (url.pathname === '/flower' && request.method === 'POST') {
        return flower(request, env, cors, origin);
      }

      // ── 匿名花笺 ──────────────────────────────
      if (url.pathname === '/notes' && request.method === 'GET') {
        return notesList(url, env, cors);
      }
      if (url.pathname === '/notes' && request.method === 'POST') {
        return notesCreate(request, env, cors, origin);
      }
      if (url.pathname === '/notes/manage' && request.method === 'GET') {
        return notesManagePage(url, env);
      }
      if (url.pathname === '/notes/manage' && request.method === 'POST') {
        return notesManageAction(request, url, env);
      }

      return json({ error: 'not found' }, cors, 404);
    } catch (err) {
      // 不把原始错误回给客户端——它会泄露内部细节。
      // 实测 KV 额度耗尽时，响应里带出过 "KV put() limit exceeded for the day."
      console.error('error:', url.pathname, err && err.message);
      return json({ error: 'internal' }, cors, 500);
    }
  },
};

/* ══════════════════════════════════════════════
   献花
   ══════════════════════════════════════════════ */

async function flower(request, env, cors, origin) {
  // 允许空 Origin：同源请求在部分浏览器里不带这个头。
  // ⚠ Origin 检查本来就挡不住脚本（脚本可以随便伪造这个头），
  //   它只防「别的网站拿访客的浏览器来刷」。真正的防线是限流。
  if (!originAllowed(origin)) {
    return json({ error: 'forbidden origin' }, cors, 403);
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const day = shanghaiDay();
  const id = await hashIp(ip, day, env.DAILY_SALT);

  const rateKey = `ip:${day}:${id}`;
  const used = parseInt((await env.FLOWERS.get(rateKey)) || '0', 10);
  if (used >= DAILY_LIMIT) {
    return json({ count: await getTotal(env), limited: true }, cors, 429);
  }
  await env.FLOWERS.put(rateKey, String(used + 1), { expirationTtl: 172800 });

  const total = (await getTotal(env)) + 1;
  await env.FLOWERS.put(TOTAL_KEY, String(total));

  return json({ count: total }, cors);
}

async function getTotal(env) {
  const raw = await env.FLOWERS.get(TOTAL_KEY);
  const n = parseInt(raw || '0', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/* ══════════════════════════════════════════════
   匿名花笺
   ══════════════════════════════════════════════ */

/** 服务端校验。前端也做一遍只是为了体验，这里才是防线。 */
function validateNote(rawName, rawBody) {
  const name = String(rawName == null ? '' : rawName).trim();
  const body = String(rawBody == null ? '' : rawBody).trim();

  if (!body) return { error: 'empty' };
  if (body.length > NOTE_BODY_MAX) return { error: 'too_long' };
  if (name.length > NOTE_NAME_MAX) return { error: 'too_long' };
  if (LINK_RE.test(body) || LINK_RE.test(name)) return { error: 'has_link' };

  return { name: name || null, body };
}

async function notesCreate(request, env, cors, origin) {
  // 允许空 Origin：同源请求在部分浏览器里不带这个头（换到同源之后，
  // 线上的请求就是这种情况）。理由同上：真正的防线是限流与校验。
  if (!originAllowed(origin)) {
    return json({ error: 'forbidden origin' }, cors, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'bad_request' }, cors, 400);
  }
  if (!payload || typeof payload !== 'object') {
    return json({ error: 'bad_request' }, cors, 400);
  }

  const v = validateNote(payload.name, payload.body);
  if (v.error) return json({ error: v.error }, cors, 400);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const day = shanghaiDay();
  const ipHash = await hashIp(ip, day, env.DAILY_SALT);

  const { results } = await env.NOTES_DB
    .prepare('SELECT COUNT(*) AS n FROM notes WHERE day = ? AND ip_hash = ?')
    .bind(day, ipHash)
    .all();
  const used = (results && results[0] && results[0].n) || 0;
  if (used >= NOTE_DAILY_LIMIT) {
    return json({ error: 'rate_limited' }, cors, 429);
  }

  const token = makeToken();
  await env.NOTES_DB
    .prepare(
      'INSERT INTO notes (created_at, day, name, body, status, ip_hash, token) VALUES (?,?,?,?,?,?,?)'
    )
    .bind(Date.now(), day, v.name, v.body, 'pending', ipHash, token)
    .run();

  // 只回 token，不回 id——提交者靠 token 自查，不需要知道 id
  return json({ ok: true, token }, cors, 201);
}

async function notesList(url, env, cors) {
  // 只接受长得对的 token，避免把任意字符串塞进 SQL
  const tokens = (url.searchParams.get('tokens') || '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => /^[0-9a-f]{32}$/.test(t))
    .slice(0, NOTE_TOKENS_MAX);

  let mine = [];
  if (tokens.length) {
    const ph = tokens.map(() => '?').join(',');
    const r = await env.NOTES_DB
      .prepare(
        `SELECT id, name, body, created_at, status FROM notes
         WHERE token IN (${ph}) AND status != 'rejected'
         ORDER BY id DESC`
      )
      .bind(...tokens)
      .all();
    mine = r.results || [];
  }

  const pub = await env.NOTES_DB
    .prepare(
      "SELECT id, name, body, created_at FROM notes WHERE status = 'approved' ORDER BY id DESC LIMIT ?"
    )
    .bind(NOTE_LIST_MAX)
    .all();

  return json({ notes: pub.results || [], mine }, cors);
}

/** 管理页的凭证。不匹配返回 false，调用方一律回 404（不暴露这个入口存在）。 */
function isAdmin(url, env) {
  const key = url.searchParams.get('key') || '';
  const want = env.MANAGE_KEY || '';
  if (!want || !key || key.length !== want.length) return false;
  // 定长比较。对个人站来说时序攻击是极小题大做，但成本只有五行。
  let diff = 0;
  for (let i = 0; i < key.length; i++) {
    diff |= key.charCodeAt(i) ^ want.charCodeAt(i);
  }
  return diff === 0;
}

async function notesManagePage(url, env) {
  if (!isAdmin(url, env)) return notFoundPage();

  const pending = await env.NOTES_DB
    .prepare("SELECT id, name, body, created_at FROM notes WHERE status = 'pending' ORDER BY id ASC")
    .all();
  const approved = await env.NOTES_DB
    .prepare("SELECT id, name, body, created_at FROM notes WHERE status = 'approved' ORDER BY id DESC LIMIT 50")
    .all();

  const key = url.searchParams.get('key');
  const action = '/notes/manage?key=' + encodeURIComponent(key);

  const row = (n, own) => `
    <li class="note">
      <div class="meta">${own ? '<b>已上墙</b> · ' : ''}${esc(n.name || '一位旅人')} · ${fmtTime(n.created_at)}</div>
      <div class="body">${esc(n.body)}</div>
      <form method="POST" action="${esc(action)}">
        <input type="hidden" name="id" value="${Number(n.id)}">
        ${own
          ? '<button name="action" value="reject" class="del">删除</button>'
          : '<button name="action" value="approve" class="ok">通过</button><button name="action" value="reject" class="del">删除</button>'}
      </form>
    </li>`;

  const pendingList = (pending.results || []).map((n) => row(n, false)).join('') ||
    '<li class="empty">没有待审的留言 🎐</li>';
  const approvedList = (approved.results || []).map((n) => row(n, true)).join('') ||
    '<li class="empty">还没有上墙的留言</li>';

  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>花笺管理 · elysiad.top</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
       background:#0a0612;color:#f0e6ff;line-height:1.7;padding:2rem 1.2rem 4rem}
  .wrap{max-width:720px;margin:0 auto}
  h1{font-size:1.2rem;font-weight:400;color:#ffc8dd;letter-spacing:.1em;margin-bottom:.4rem}
  h2{font-size:.9rem;font-weight:400;color:#a89cc8;letter-spacing:.14em;margin:2.2rem 0 .9rem;
     padding-bottom:.5rem;border-bottom:1px solid rgba(255,200,221,.12)}
  .sub{font-size:.75rem;color:#7b6f99;margin-bottom:1.6rem}
  ul{list-style:none}
  .note{background:rgba(255,200,221,.05);border:1px solid rgba(255,200,221,.12);
        border-radius:12px;padding:.9rem 1.1rem;margin-bottom:.7rem}
  .meta{font-size:.72rem;color:#7b6f99;margin-bottom:.4rem}
  .meta b{color:#ffd166;font-weight:400}
  .body{font-size:.92rem;color:#f0e6ff;word-break:break-word;margin-bottom:.7rem}
  .empty{font-size:.82rem;color:#7b6f99;padding:.8rem 0}
  form{display:inline}
  button{font-family:inherit;font-size:.75rem;letter-spacing:.1em;padding:.32rem .9rem;
         border-radius:999px;cursor:pointer;border:1px solid transparent;margin-right:.5rem}
  .ok{background:rgba(155,93,229,.35);color:#e0c8ff;border-color:rgba(199,125,255,.4)}
  .del{background:rgba(255,143,163,.12);color:#ffb3c1;border-color:rgba(255,143,163,.3)}
  button:hover{filter:brightness(1.25)}
</style></head><body><div class="wrap">
  <h1>花笺管理</h1>
  <p class="sub">待审 ${(pending.results || []).length} 条 · 已上墙 ${(approved.results || []).length} 条（最多显示 50）</p>
  <h2>待 审</h2>
  <ul>${pendingList}</ul>
  <h2>已 上 墙</h2>
  <ul>${approvedList}</ul>
</div></body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function notesManageAction(request, url, env) {
  if (!isAdmin(url, env)) return notFoundPage();

  let id = null;
  let action = null;

  const ct = request.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    const b = await request.json().catch(() => null);
    if (b) { id = b.id; action = b.action; }
  } else {
    const form = await request.formData();
    id = form.get('id');
    action = form.get('action');
  }

  id = parseInt(id, 10);
  if (!Number.isInteger(id) || (action !== 'approve' && action !== 'reject')) {
    return new Response('bad request', { status: 400 });
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  await env.NOTES_DB.prepare('UPDATE notes SET status = ? WHERE id = ?').bind(status, id).run();

  // 表单提交则回跳管理页；JSON 调用则回 JSON
  if (ct.includes('application/json')) {
    return new Response(JSON.stringify({ ok: true, id, status }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  return Response.redirect(url.toString(), 303);
}

/* ══════════════════════════════════════════════
   工具
   ══════════════════════════════════════════════ */

/** 按中国时区算「今天」，避免 UTC 跨日导致用户凌晨 8 点才重置 */
function shanghaiDay() {
  const shanghai = new Date(Date.now() + 8 * 60 * 60 * 1000);
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

/** 32 位随机十六进制。提交者凭它看自己那条，猜不到别人的。 */
function makeToken() {
  return crypto.randomUUID().replace(/-/g, '');
}

/** HTML 转义。管理页会把用户内容拼进 HTML，不转义就是 XSS 漏洞。 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtTime(ms) {
  const d = new Date(Number(ms) + 8 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function notFoundPage() {
  return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
}

function corsHeaders(origin) {
  const allow = origin && originAllowed(origin) ? origin : DEFAULT_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json; charset=utf-8',
      // ⚠ 必须显式禁缓存。
      // 主站开了 Cloudflare 的 Cache Rule 之后，如果 API 响应没标 no-store，
      // 会被边缘缓存住 —— 后果是「刚通过的留言，别人两分钟后才看得到」。
      // 这条头让接口无论规则怎么写都不会被缓存。
      'Cache-Control': 'no-store',
    },
  });
}
