/**
 * 隐藏彩蛋：连续点击开场标题 5 次。
 *
 * 台词来自 window.QUOTES.hidden。
 * ★ 该数组默认为空——为空时彩蛋不会触发。
 *   这是有意的：项目数据纪律要求台词必须有出处，不许编造。
 *   拿到有出处的台词后，填进 data/quotes.js 即可自动生效，本文件无需改动。
 *
 * 键盘可达：标题是 <h1>，不是天然可聚焦元素。这里监听整块开场区的
 * 点击与回车，且不劫持 Tab 顺序——彩蛋本身是"发现型"内容，
 * 不作为必需功能，因此不放进键盘 Tab 链（避免干扰正常浏览）。
 * 键盘用户在开场区按回车同样能触发。
 */
(function () {
  var pool = (window.QUOTES && window.QUOTES.hidden) || [];
  var NEED = 5;

  var titleEl = document.getElementById('typewriterText');
  if (!titleEl) return;

  var count = 0;
  var fired = false;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 水晶花雨 ----------
  function rain() {
    if (reduced) return;              // 减动偏好：跳过花雨，只留那句话
    var colors = ['#ffc8dd', '#ffb3c1', '#ff8fa3', '#ff5c8a', '#c77dff', '#f9bec7', '#ffd166'];
    var n = 26;
    for (var i = 0; i < n; i++) {
      var p = document.createElement('div');
      p.className = 'egg-petal';
      var size = 6 + Math.random() * 11;
      var x = Math.random() * window.innerWidth;
      var drift = (Math.random() - 0.5) * 160;
      p.style.cssText =
        'left:' + x + 'px;top:-30px;' +
        'width:' + size + 'px;height:' + (size * 1.5) + 'px;' +
        'background:' + colors[Math.floor(Math.random() * colors.length)] + ';' +
        'transform:rotate(' + (Math.random() * 360) + 'deg);' +
        'transition-delay:' + (Math.random() * 0.9).toFixed(2) + 's;';
      document.body.appendChild(p);
      /* 强制布局后再改 transform，保证 transition 生效 */
      void p.offsetWidth;
      p.style.opacity = '0.9';
      p.style.transform =
        'translate(' + drift + 'px,' + (window.innerHeight + 80) + 'px) ' +
        'rotate(' + (Math.random() * 720 - 360) + 'deg)';
      (function (el) {
        setTimeout(function () { el.remove(); }, 4800);
      })(p);
    }
  }

  // ---------- 浮现台词 ----------
  function showLine(text) {
    var el = document.createElement('div');
    el.className = 'egg-line';
    el.setAttribute('role', 'status');
    el.textContent = text;
    document.body.appendChild(el);
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 1300);
    }, 4600);
  }

  // ---------- 触发 ----------
  function trigger() {
    if (fired) return;
    fired = true;

    // 台词池为空 → 不触发，也不报错（有意的设计）
    if (!pool.length) return;

    var text = pool[Math.floor(Math.random() * pool.length)];
    rain();
    showLine(text);
  }

  function hit() {
    if (fired) return;
    count++;
    if (count >= NEED) trigger();
  }

  titleEl.addEventListener('click', hit);
  document.querySelector('.section-opening').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') hit();
  });
})();
