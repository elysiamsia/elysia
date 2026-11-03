/**
 * 献花（离线版，2026-11-03）
 *
 * 为什么变成这样：为了通过公安备案审查，线上已经移除全部交互式服务
 * （献花计数、留言簿、擂台竞猜）。这个文件现在是**纯本地**的：
 * 不发任何网络请求，数字是构建时写死的静态值（当前 70）。
 *
 * 想恢复「大家的花」实时计数，见 offline/README.md，三步：
 *   1. cp offline/flowers.interactive.js assets/flowers.js
 *   2. index.html 里把 #flowerCount 改回空标签（去掉 data-count 与内联数字）
 *   3. 服务器 systemctl enable --now elysia-api + nginx 加回 /count /flower 反代
 */
(function () {
  var btn = document.getElementById('flowerBtn');
  var countEl = document.getElementById('flowerCount');
  var hintEl = document.getElementById('flowerHint');
  if (!btn || !countEl) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var baked = parseInt(countEl.getAttribute('data-count') || '0', 10) || 0;

  // 花瓣动画：这是一支纯粹的视觉小把戏，不联网、不写存储
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

  btn.addEventListener('click', function () {
    var r = btn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top);
    countEl.innerHTML = '这里已收到 <b>' + baked + '</b> 朵花';
    if (hintEl) hintEl.textContent = '花已经送到她那里了';
  });
})();
