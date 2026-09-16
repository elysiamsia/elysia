# 献花后端 · Cloudflare Worker 部署手册

> **状态：已部署 ✅（2026-09-15）**
>
> | 项目 | 值 |
> |---|---|
> | 端点 | `https://flowers.elysiad.top` |
> | KV namespace id | `e2d964f0af9f4863820bcfa20a5aac7e` |
> | Worker 版本 | `67f858ce-d241-497c-8e94-2baa59ab9a7f` |
> | 账号 | `dongqm070731@gmail.com` |
>
> **实测已验证**：`GET /count` 正常；`POST /flower` 真实写入 KV；异站来源返回
> `403 forbidden origin` 且不改动总数；`OPTIONS` 返回 `204`；`http://localhost:8500`
> 在白名单内（本地调试可用）。
>
> **中国可访问性**：已用手机流量（不挂梯子）访问 `https://flowers.elysiad.top/count`，
> **返回正常 JSON**——大陆线路可用。
>
> 下面的章节保留完整步骤，供日后**换账号、换域名、重建 KV** 时照做。

---

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

---

## 11. 实测：写额度耗尽时到底会发生什么

2026-09-15 用独立的测试 Worker + 独立 KV 命名空间真烧了一次额度（测完均已删除）。以下是实测结论，不是推测。

### 11.1 报错原文

```
KV put() limit exceeded for the day.
（错误类型 name: "Error"）
```

### 11.2 是「全部写失败」，不是「部分失败」

连续试 20 次写入，`ok = 0`——**一条都写不进去**，全部失败。

### 11.3 读完全不受影响

| 操作 | 额度耗尽后 |
|---|---|
| KV 读取 | ✅ 正常（读有独立的 10 万/天额度） |
| `GET /count` | ✅ HTTP 200，返回**冻结的旧数字** |
| `POST /flower` | ❌ HTTP 500 |

所以访客看到的是「**数字停住不涨**」，而不是「页面坏了」。前端此时静默降级成本地计数，**全程不出现任何错误提示**——已实测确认。

### 11.4 ⚠️ REST API 路径不执行这个检查（但照样吃额度）

用 `wrangler kv bulk put` 连续写了 **3010 次，一次都没失败**——完全没被拦。但随后运行时绑定路径第一次写入就报「已超额」。

**结论：两条路径共用同一个额度池，但只有运行时绑定（`env.KV.put()`，即生产用的那条）会做检查。**

对你的实际影响：**用 wrangler 或 Dashboard 手动改 KV 数据也会消耗额度**，而且不会提示你，直到 Worker 那边突然开始写不进去。

### 11.5 换算成业务量

每献一朵花要写 2 次 KV（限流键 + 总数）：

```
1000 次写 ÷ 2 = 全站约 500 朵/天
```

**超过之后**：访客照样能献花、照样有花瓣动画，只是**共享数字不再增长**，且会悄悄切成本地计数。

### 11.6 ⚠️ 生日是压力最大的那天

**11 月 11 日是她的生日**——按现在的设计，那一天恰好最可能把 500 朵撞满。

### 11.7 还有一个「丢花」问题（未修）

KV 是最终一致的，而 `POST /flower` 的代码是「读出来 +1 再写回去」：

```js
const total = (await getTotal(env)) + 1;   // 读
await env.FLOWERS.put(TOTAL_KEY, String(total));  // 写
```

并发时两个人同时读到同一个值、各自 +1、后写的覆盖先写的——**丢花**。低流量看不出来，**正好在高流量（生日）时暴露**。

**一次改动能同时解决 11.5 和 11.7 两个问题：换成 Durable Objects。** DO 是单线程执行的，天然支持原子递增；而且它按**请求数**计费（免费 10 万次/天、10 万行写/天），不受 KV 这个 1000 次写入的卡脖子限制。代价是 Worker 重写约 60 行。

### 决定：暂不更换（2026-09-15 拍板）

**判断依据：**

1. **站点尚未上线**，没有任何真实流量。猜生日那天会有多少人献花没有意义。
2. **500 朵/天对一个小站可能绰绰有余**——那已经是"500 个不同的人来献花"的量级。
3. **DO 的延迟代价是每个访客都要付的，而额度问题可能永远不会发生。** DO 是单实例，每次读数字都要路由到它所在的位置（KV 的读是从边缘缓存出的，哪儿都快）；对一个主要面向大陆访客的站，"每次读都要跨一次太平洋"的可能性，比"额度打满"更早、更普遍地影响体验。
4. 用一个确定的好处（读快）去换一个不一定发生的坏处（额度打满），不划算。

**观察点：11 月 11 日（她的生日）。**

- 当天献花数**接近或超过 500** → 该换，走下面 §11.9 的混合方案
- 当天只有几十朵 → 一直不用换

**备选折中（只想解决额度、不解决丢花）**：用 Workers 的 **Rate Limiting binding**（限流跑在边缘，不消耗 KV 写），把每朵花从 2 次写降到 1 次 → 1000 朵/天。代价是它的限制是「每个 Cloudflare 位置、10 或 60 秒周期」，**做不了"每人每天 5 朵"**，只能改成"每 60 秒 1 朵"。

### 11.9 真要换时的推荐方案：混合

不要纯 DO——那样每次**读**都要走单实例。推荐：

```
GET  /count   →  从 KV 读（边缘快，读额度 10 万/天，绰绰有余）
POST /flower  →  交给 DO 做原子递增，DO 再把新总数写回 KV
```

这样**读快、写准**。代价是每朵花仍有 1 次 KV 写 → **1000 朵/天**（比现在的 500 翻一倍）。比纯 DO 多一层复杂度，但两边的好处都拿到。

### 11.8 顺带实测到的另一件事：`*.workers.dev` 在大陆不可达

| 域名 | 结果 |
|---|---|
| `kvburn-tmp.<账号>.workers.dev` | **HTTP 000，21 秒超时** |
| `flowers.elysiad.top`（自定义域名） | HTTP 200，0.84 秒 |

**生产 Worker 必须用自定义域名，不能图省事用默认的 `workers.dev`**——否则大陆访客的献花数字永远不会出现。这条已由生产 Worker 的配置满足。

