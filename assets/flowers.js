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
  // ⚠ 部署完 Worker 后，把这里换成实际域名
  var API = 'https://flowers.elysiad.top';
  var TIMEOUT_MS = 1500;
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
  function req(url, options) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
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
  function showShared(n) {
    // 呀！这是「大家的花」——数字是真的，所以说出口的时候也很安心呢♥
    countEl.innerHTML = '这里已收到 <b>' + n + '</b> 朵花';
    hintEl.textContent = '每一朵，都会被记得';
  }

  function showLocal(n) {
    // 接口不通时的诚实说法：只数自己这一台
    countEl.innerHTML = '你的花已送达 · 本机累计 <b>' + n + '</b> 朵';
    hintEl.textContent = '花已经送到她那里了';
  }

  function goLocal() {
    showLocal(localAdd());
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

    req(API + '/flower', { method: 'POST' })
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
  req(API + '/count', { method: 'GET' })
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
