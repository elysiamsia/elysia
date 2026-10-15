/* sw.js — 站点 Service Worker（2026-10-15）
 *
 * ── 为什么要有它 ────────────────────────────────────────────────
 * 实测（见 HANDOVER）：顺序访问首页 ~280ms 很快，但**并发**时 6 个请求里会有 1 个挂死 >15 秒。
 * 机制：边缘缓存未命中/回源校验时，Cloudflare 会把并发请求**合并成一个回源**，那一步卡住，
 * 所有等它的人一起卡 —— 访客看到的正是「信号挺好，界面就是出不来」。
 * ⇒ 有了 SW，**回访**时页面直接从本地缓存出来，那一步卡不卡都不影响首屏。
 *
 * ── 策略（不搞花活）────────────────────────────────────────────
 * · 页面（navigate）：**网络优先 + 2.5 秒超时 → 回退缓存**（要新鲜，但不许卡死）
 * · 静态资源：stale-while-revalidate（先用缓存，后台刷新）
 * · 接口（/count /flower /notes）：**一律直连**，绝不缓存
 * · 只缓存 **同源 GET**；跨域（米游社图床等）不碰
 * ⚠ 本机验收工具走 http://127.0.0.1:8500 —— site.js 里的注册逻辑**跳过 127.0.0.1**，
 *   否则断言会读到缓存里的旧页面（那是自欺欺人）。
 */
var V = 'elysia-v1';
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

  if (req.mode === 'navigate') {
    e.respondWith((async function () {
      var c = await caches.open(V);
      try {
        var net = await Promise.race([
          fetch(req),
          new Promise(function (_, rej) { setTimeout(function () { rej(new Error('sw-timeout')); }, TIMEOUT); })
        ]);
        if (net && net.ok) c.put(req, net.clone());
        return net;
      } catch (err) {
        var hit = await c.match(req, { ignoreSearch: true });
        if (hit) return hit;
        return new Response('离线，且没有这一页的缓存。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  e.respondWith((async function () {
    var c = await caches.open(V);
    var hit = await c.match(req);
    var net = fetch(req).then(function (r) {
      if (r && r.ok && r.type === 'basic') c.put(req, r.clone());
      return r;
    }).catch(function () { return null; });
    if (hit) return hit;
    var r2 = await net;
    return r2 || new Response('', { status: 504 });
  })());
});