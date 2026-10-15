/* sw.js — 站点 Service Worker（2026-10-15，v2）
 *
 * ── 它要解决什么 ────────────────────────────────────────────────
 * 实测：顺序访问首页 ~280ms 很快，但**并发**时 6 个请求里会有 1 个挂死 >15 秒
 * （Cloudflare 边缘未命中/回源校验时把并发合并成一个回源，那一步卡住大家都等）。
 * ⇒ 有 SW，回访时页面从本地缓存出来，那一步卡不卡都不影响首屏。
 *
 * ── ⚠ v2 修正（2026-10-15 当天，需求方报「合并了但游戏没变」）──────────
 * v1 给静态资源用的是 **stale-while-revalidate** ⇒ 先吐旧缓存、后台再更新，
 * 结果是**每次发版后的第一次访问仍然看到旧代码** —— 这是我把「快」排在了「对」前面。
 * v2 全部改成 **网络优先 + `cache: 'no-cache'`**（强制走 ETag 校验，命中 304 几乎不花时间）：
 *   · 在线 ⇒ 永远是新的（部署立刻生效）
 *   · 断网 / 超时 ⇒ 回退缓存（抗卡死这条能力保留）
 * 缓存版本号也必须**每次改 SW 时一起换**（v2），否则旧的 cache 不会被清。
 */
var V = 'elysia-v2';
var SHELL = ['/', '/assets/site.css', '/assets/site.js', '/favicon.svg'];
var API = /^\/(count|flower|notes)/;
var TIMEOUT = 2500;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }).catch(function () {}));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var u;
  try { u = new URL(req.url); } catch (err) { return; }
  if (u.origin !== self.location.origin) return;
  if (API.test(u.pathname)) return;
  var isNav = req.mode === 'navigate';
  e.respondWith((async function () {
    var c = await caches.open(V);
    try {
      /* ⚠ cache:'no-cache' ⇒ 走 ETag 校验：新的就拿新的，没变就 304（几乎不花时间） */
      var net = await Promise.race([
        fetch(req, { cache: 'no-cache' }),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('sw-timeout')); }, TIMEOUT); })
      ]);
      if (net && net.ok) c.put(req, net.clone());
      return net;
    } catch (err) {
      var hit = await c.match(req, { ignoreSearch: isNav });
      if (hit) return hit;
      if (isNav) return new Response('离线，且没有这一页的缓存。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      return new Response('', { status: 504 });
    }
  })());
});