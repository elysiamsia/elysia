# 献花后端 · Cloudflare Worker 部署手册

> 这一份是**给你自己动手的**。前端那边（`assets/flowers.js`）我会写好并负责降级逻辑，
> 你只需要把这个 Worker 部署起来，然后把域名填给我。
>
> 目标接口（前端已按这个约定写好）：
>
> ```
> GET  /count   → {"count": 1247}
> POST /flower  → {"count": 1248}
> ```
>
> 域名目标：`https://flowers.elysiad.top`

---

## 0. 为什么必须是 Worker

献花的数字要**所有人共享**，纯静态页面做不到——需要一个能改的服务端。选 Cloudflare 是因为
`elysiad.top` 的 NS 已经在 Cloudflare 了（`hank.ns.cloudflare.com` / `fish.ns.cloudflare.com`），
加一条子域就行，不用搬 DNS，也不用额外买服务器。

**费用**：免费额度每天 10 万次请求，KV 免费额度 1000 次写入/天、10 万次读取/天。
一个粉丝站远远够用。

---

## 1. 准备工作

需要 Node.js（18 以上）。检查：

```bash
node --version
```

没有的话去 https://nodejs.org 装一个 LTS 版本。

然后装 wrangler（Cloudflare 官方 CLI）：

```bash
npm install -g wrangler
wrangler --version
```

登录（会开浏览器要你授权）：

```bash
wrangler login
```

---

## 2. 建 KV 命名空间

计数器就存在 KV 里：

```bash
wrangler kv namespace create FLOWERS
```

它会输出类似这样的一段：

```
🌀 Creating namespace with title "elysia-flowers-FLOWERS"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "FLOWERS", id = "a1b2c3d4e5f64789a0b1c2d3e4f56789" }
```

**把那个 `id` 抄下来**，下一步要用。

> 如果你在多个账号下，加 `--remote` 或先 `wrangler whoami` 确认账号。

---

## 3. 项目文件

在这个仓库里建 `worker/` 目录，放三个文件。下面直接给出完整内容。

### 3.1 `worker/wrangler.toml`

把 `<你的KV_ID>` 换成上一步抄下来的 id：

```toml
name = "elysia-flowers"
main = "src/index.js"
compatibility_date = "2026-09-15"

# 自定义域名。因为 elysiad.top 的 DNS 已在 Cloudflare，这一行会自动建好解析记录
routes = [
  { pattern = "flowers.elysiad.top", custom_domain = true }
]

[[kv_namespaces]]
binding = "FLOWERS"
id = "<你的KV_ID>"
```

### 3.2 `worker/src/index.js`

完整代码，照抄即可：

```js
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

/** 按中国时区算“今天”，避免 UTC 跨日导致用户凌晨 8 点才重置 */
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
```

### 3.3 `worker/.gitignore`

```gitignore
node_modules/
.wrangler/
.dev.vars
```

---

## 4. 设置盐值

`DAILY_SALT` 是给 IP 哈希用的，**必须设置，否则代码跑不起来**：

```bash
cd worker
wrangler secret put DAILY_SALT
```

它会提示你输入一个值。随便敲一串长随机字符串，比如：

```
openssl rand -hex 32
```

把输出粘进去。**这个值不要提交到仓库、不要外传。**
（如果日后想“清空所有人的当日限流”，换一个盐就行——旧哈希全部失效。）

---

## 5. 部署

```bash
cd worker
wrangler deploy
```

成功的话会输出：

```
Uploaded elysia-flowers
Deployed elysia-flowers triggers
  https://flowers.elysiad.top
```

第一次部署自定义域名可能需要等一两分钟 DNS 生效。

---

## 6. 验证（**这一步一定要做**）

### 6.1 读总数

```bash
curl -s https://flowers.elysiad.top/count
```

期望：`{"count":0}`

### 6.2 献一朵

```bash
curl -s -X POST https://flowers.elysiad.top/flower \
  -H "Origin: https://elysiad.top"
```

期望：`{"count":1}`

再跑一次 `/count`，应该也是 `1`。

### 6.3 验 CORS

```bash
curl -s -D - -o /dev/null -X POST https://flowers.elysiad.top/flower \
  -H "Origin: https://elysiad.top" | grep -i "access-control"
```

应该看到 `Access-Control-Allow-Origin: https://elysiad.top`。

### 6.4 验盗刷防护

用一个不该被允许的来源：

```bash
curl -s -X POST https://flowers.elysiad.top/flower \
  -H "Origin: https://evil.example.com"
```

期望：`{"error":"forbidden origin"}` —— 前缀是 `Access-Control-Allow-Origin: https://elysiad.top`，
浏览器侧也拿不到数据。

### 6.5 验限流

连着发 7 次第 6.2 步的命令，第 6 次开始应该返回 `"limited":true` 且 HTTP 429。

```bash
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "%{http_code} " -X POST https://flowers.elysiad.top/flower \
    -H "Origin: https://elysiad.top"
done; echo
```

期望类似：`200 200 200 200 200 429 429`

> ⚠ 测完记得把总数清回 0，免得带着测试数据上线：
> ```bash
> wrangler kv key delete --binding=FLOWERS "total"
> ```
> 这会退回到 `{"count":0}`。“IP 当日计数”的键有 48 小时 TTL，会自己过期；如果也想立刻清掉：
> ```bash
> wrangler kv key list --binding=FLOWERS --prefix="ip:"
> ```

---

## 7. 中国可访问性检查

这个必须做，因为**献花的访客大多在中国大陆**。

用手机流量（**不要用 WiFi、不要挂梯子**）访问：

```
https://flowers.elysiad.top/count
```

- 能出 JSON → 完美，正常上线
- 转圈很久或打不开 → Cloudflare 的边缘在这条线路上不通

**打不开也没关系，前端有降级。** `assets/flowers.js` 会：
1. 请求超时 1.5 秒
2. 超时或失败 → 静默切成本地计数，文案变成「你的花已送达 · 本机累计 N 朵」
3. **任何情况下都不会给访客看错误提示**

所以最差的情况是"变成每人自己数自己的花"，而不是"页面坏了"。这就是为什么降级是必需项而不是加分项。

---

## 8. 把域名告诉我

部署完把最终地址告我（默认就是 `https://flowers.elysiad.top`），我会：
- 写进 `assets/flowers.js` 的配置常量
- 用 `tools/cdp.py` 无头浏览器实测一遍真实点击
- 再手动断掉该域名，验证降级路径确实生效

---

## 9. 维护备忘

| 事项 | 说明 |
|---|---|
| **KV 最终一致性** | Cloudflare KV 是最终一致的，高并发下极短时间内可能少记一两朵。粉丝站可接受，若要绝对准确需换成 Durable Objects |
| **查看总数** | `wrangler kv key get --binding=FLOWERS "total"` |
| **改限流** | 改 `index.js` 里的 `DAILY_LIMIT` 后重新 `wrangler deploy` |
| **改盐（清空当日限流）** | 重新 `wrangler secret put DAILY_SALT` |
| **看日志** | `wrangler tail` |
| **免费额度** | 请求 10 万/天；KV 写入 1000/天。**注意**：每献一朵花要写 2 次 KV（限流键 + 总数），所以实际约 500 朵/天封顶——超过就得换方案，届时找我 |

---

## 10. 如果不想用 Cloudflare

备选方案，改动量从小到大：

1. **Val.town / Deno Deploy** —— 同样是 serverless，代码几乎不用改（用 `Deno.env` 代替 `env.DAILY_SALT`），但要有相应账号
2. **Vercel / Netlify Function + 外部 KV（Upstash Redis）** —— 要多注册一个 Upstash
3. **自建 VPS + SQLite** —— 最可控，但要自己管服务器

无论换哪个，**前端只认 `GET /count` 和 `POST /flower` 两个接口**，前端代码一行都不用动。
