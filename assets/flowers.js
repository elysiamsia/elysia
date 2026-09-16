/**
 * 献花互动
 *
 * 后端：GET /count → {count} ｜ POST /flower → {count}
 * 部署说明见 worker/README.md。
 *
 * 降级是必需项，不是加分项：
 *   Cloudflare 的边缘节点在中国大陆可能缓慢或被限。接口不通时，
 *   静默切换成本地计数，文案改成「你的花已送达 · 本机累计 N 朵」。
 *   ★ 任何情况下都不给访客看错误提示。
 *
 * 隐私：本脚本不采集、不上报任何访客信息，只发一个 POST。
 */
(function () {
  // 接口地址：**默认同源，只有本地开发才用远端地址**。
  //
  // ⚠ 这一行原本写死成 'https://flowers.elysiad.top'，是错的。页面在 elysiad.top、
  //   接口在 flowers.elysiad.top —— 两个域名，就是跨域。实测（2026-09-16，需求方手机）：
  //   QQ 浏览器上点献花只显示「你的花已送达 · 本机累计 3 朵」，同一时间桌面浏览器
  //   显示「这里已收到 7 朵花」。也就是 POST 被拦、静默降级成了本地计数。
  //   留言簿的 /notes 早就为同一个原因改成同源了，献花这一处当时漏了——
  //   而降级是设计好的静默行为，不报错，所以谁也没发现。
  //
  // ⚠ 判断写成「默认同源，只有本地开发才用远端地址」，而不是「等于 elysiad.top 才同源」。
  //   后者的隐患：那些浏览器的云加速可能改写主机名，于是线上会悄悄退回跨域地址，
  //   正是我们要修的那个问题。宁可反过来兜底。
  //   这一份必须与 guestbook/index.html 的写法保持一致，改一处就要改两处。
  var isLocalDev = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    || location.protocol === 'file:';
  var API = isLocalDev ? 'https://flowers.elysiad.top' : '';

  // 超时按「谁在等」分开设：载入时没人在等，可以放宽；点击时有反馈延迟，收紧一点。
  //
  // ⚠ 这两个值不是拍脑袋定的。实测从大陆冷启动到 Cloudflare 的 TLS 握手可以到
  //    1.66 秒（热连接只要 0.6~0.9 秒）。原先两者统一用 1500ms，会把这个握手掐断，
  //    于是接口明明是好的、访客却看到「本机累计 N 朵」——同一台机器上时好时坏。
  //    那不叫降级，那叫「显示错误的信息」，比报错更糟：访客会以为没人来过。
  //
  // ⚠ 改成同源之后握手这一步省掉了（同一条连接），但这两个值**故意不再收紧**：
  //   收紧只会重新引入上面那个 bug，而放宽的代价仅仅是慢线路上多等一会儿。
  var TIMEOUT_LOAD_MS = 4000;   // GET  /count  —— 在页面最底部，慢一点没人察觉
  var TIMEOUT_POST_MS = 3000;   // POST /flower —— 点完在等，别让人干等太久
  var LOCAL_KEY = 'elysia.flowers.local';

  var btn = document.getElementById('flowerBtn');
  var countEl = document.getElementById('flowerCount');
  var hintEl = document.getElementById('flowerHint');
  if (!btn || !countEl) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var sending = false;

  // ---------- 本地存储（降级用） ----------
  function localGet() {
    try {
      var v = parseInt(window.localStorage.getItem(LOCAL_KEY) || '0', 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;   // 隐私模式下 localStorage 会抛异常
    }
  }
  function localAdd() {
    var n = localGet() + 1;
    try { window.localStorage.setItem(LOCAL_KEY, String(n)); } catch (e) {}
    return n;
  }

  // ---------- 带超时的 fetch ----------
  // timeoutMs 由调用方按场景给：载入宽、点击紧，见顶部常量的说明
  function req(url, options, timeoutMs) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || TIMEOUT_POST_MS);
    var opts = options || {};
    opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  // ---------- 渲染 ----------
  // 记录「上次成功读到的全局总数」。
  //
  // 为什么需要它：实测故障时的表现是——载入时显示「这里已收到 1247 朵花」，
  // 点击失败后若直接换成「本机累计 1 朵」，**数字会从 1247 跌到 1**，
  // 访客会以为自己把计数搞坏了。而载入的 GET 有 4 秒超时、点击的 POST 只有 3 秒，
  // 慢线路上完全可能「载入成功、点击超时」，所以这不是理论问题。
  var knownShared = null;

  function showShared(n) {
    // 呀！这是「大家的花」——数字是真的，所以说出口的时候也很安心呢♥
    knownShared = n;
    countEl.innerHTML = '这里已收到 <b>' + n + '</b> 朵花';
    hintEl.textContent = '每一朵，都会被记得';
  }

  function showLocal(n) {
    // 从头到尾没读到过全局数字时的诚实说法：只数自己这一台
    countEl.innerHTML = '你的花已送达 · 本机累计 <b>' + n + '</b> 朵';
    hintEl.textContent = '花已经送到她那里了';
  }

  function goLocal() {
    var n = localAdd();
    if (knownShared === null) {
      showLocal(n);
      return;
    }
    // 已经知道全局数字了 → 保留它，别让它掉下来。
    // 自己这一朵诚实地括在本机计数里，不谎称它进了全局。
    countEl.innerHTML = '这里已收到 <b>' + knownShared + '</b> 朵花';
    hintEl.textContent = '你的这一朵先留在本机（共 ' + n + ' 朵），等下再来送一次吧';
  }

  // ---------- 花瓣动画 ----------
  function burst(originX, originY) {
    if (reduced) return;
    var colors = ['#ffc8dd', '#ffb3c1', '#ff8fa3', '#ff5c8a', '#c77dff', '#f9bec7'];
    var n = 9 + Math.floor(Math.random() * 4);
    for (var i = 0; i < n; i++) {
      var p = document.createElement('div');
      p.className = 'flower-petal';
      var size = 5 + Math.random() * 7;
      var dx = (Math.random() - 0.5) * 130;
      var dy = -(110 + Math.random() * 190);
      var rot = Math.random() * 360;
      p.style.cssText =
        'left:' + originX + 'px;top:' + originY + 'px;' +
        'width:' + size + 'px;height:' + (size * 1.5) + 'px;' +
        'background:' + colors[Math.floor(Math.random() * colors.length)] + ';' +
        'transform:translate(-50%,-50%) rotate(' + rot + 'deg);opacity:.9;';
      document.body.appendChild(p);
      /* 强制一次布局，保证 transition 生效 */
      void p.offsetWidth;
      p.style.transform =
        'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) ' +
        'rotate(' + (rot + 160 + Math.random() * 120) + 'deg)';
      p.style.opacity = '0';
      (function (el) {
        setTimeout(function () { el.remove(); }, 1500);
      })(p);
    }
  }

  // ---------- 点击 ----------
  btn.addEventListener('click', function () {
    if (sending) return;
    sending = true;
    btn.disabled = true;

    var r = btn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top);

    req(API + '/flower', { method: 'POST' }, TIMEOUT_POST_MS)
      .then(function (data) {
        if (data && typeof data.count === 'number') showShared(data.count);
        else goLocal();
      })
      .catch(function () {
        // 静默降级——绝不让访客看到报错
        goLocal();
      })
      .then(function () {
        sending = false;
        setTimeout(function () { btn.disabled = false; }, 600);
      });
  });

  // ---------- 首次载入 ----------
  req(API + '/count', { method: 'GET' }, TIMEOUT_LOAD_MS)
    .then(function (data) {
      if (data && typeof data.count === 'number') showShared(data.count);
      else goLocal();   // 接口在但不认识这个响应 → 走本地，不显示 0
    })
    .catch(function () {
      // 接口不通：如果本地已经献过花，显示本地数字；否则整块留空
      var n = localGet();
      if (n > 0) showLocal(n);
      else { countEl.textContent = ''; hintEl.textContent = ''; }
    });
})();
