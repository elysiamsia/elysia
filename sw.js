/* sw.js — 站点 Service Worker（2026-11-09，v9）
 *
 * ── v9（2026-11-09）────────────────────────────────────────────
 * 新增 11.11 当天换装（assets/bday-theme.css + assets/bday-theme.js，两个骨架都挂了）。
 * 页面样式与脚本都变了 ⇒ 版本号跟着换，否则回访者拿到的是旧 HTML 引不到这份 CSS。
 *
 * ── v6（2026-11-04）────────────────────────────────────────────
 * 首页接进 11.11 生日开场（assets/bday-intro.js + 一段 <style id="bday-intro">）。
 * 页面脚本与样式都变了，版本号跟着换，免得回访者拿到旧首页看不到开场。
 *
 * ── v5（2026-11-04）────────────────────────────────────────────
 * ① 404 页改成手机端适配（三扇门改整行、字号上浮一档）⇒ 版本号跟着换。
 * ② 顺手修掉一个更要命的：v3 那次在注释中间插了一段，多写了一个「星号+斜杠」
 *    把注释提前闭合，从 2026-11-03 起本文件一直是 **语法错误**，
 *    `node --check sw.js` 直接报 `SyntaxError: Unexpected token '*'`（第 11 行）。
 *    也就是说这几天线上**根本没注册上 SW**，缓存那层一直是空的，而且是静默失败。
 *    ⇒ 教训：改这个文件之后必须跑一次 `node --check sw.js`，肉眼看着像注释不等于它是注释。
 *
 * ── v4（2026-11-03）────────────────────────────────────────────
 * 献花改为「从 70 起算、此后只记本机」（offline/flowers.local.js 用 localStorage），
 * 页面脚本变了，版本号跟着换，免得回访者拿旧缓存继续看到旧文案。
 *
 * ── v3（2026-11-03，公安备案审查）──────────────────────────────
 * 线上已移除全部交互式服务（/count /flower /notes /api/*），SW 不再需要
 * 为这几个路径开直连旁路；缓存版本号随之换到 v3，旧 cache 在 activate 时清掉。
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
var V = 'elysia-v9';
var SHELL = ['/', '/assets/site.css', '/assets/site.js', '/favicon.svg'];
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