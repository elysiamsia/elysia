/**
 * assets/bday.js — 生日倒计时（右下角悬浮胶囊 + 面板）
 *
 * 呀！这一天一年才来一次，当然要醒目一点嘛♥
 *
 * ── 它在解决什么 ─────────────────────────────────────────────────────
 *   以前只有首页有这个东西，而且**月份日期是写死在首页脚本里的**
 *   （`var M = 10, D = 11`）。别的英桀页要么没有，要么各写一份。
 *   这一层把它抽成**一个**组件：数据从 `data/bdays.js`（全站唯一数据源）读，
 *   谁的日子谁自己站出来。
 *
 * ⚠ **首页自己也改用它了**（2026-10-01）。只给英桀页写一份、首页留着内联那份的话，
 *   站上就有**两份同一个界面** —— 正是这个项目最忌的「同一件事两处维护」
 *   （HANDOVER §10.5 合并 `BUILT` 那条教训）。
 *   需求方要的「形式一样」，最硬的保证就是**它们本来就是同一个组件**。
 *
 * ── 用法 ─────────────────────────────────────────────────────────────
 *     <script src="/assets/bday.js"></script>
 *     <script>
 *     ElysiaBday.mount({
 *       msg:      '「…」',   // 可选：平时面板里那句
 *       birthMsg: '「…」',   // 可选：生日当天那句
 *       src:      '生日语音', // 可选：上面那句的出处（**有台词就必须有出处**）
 *       title:    '她 的 生 日',  // 可选，默认就是这个
 *     });
 *     </script>
 *
 *   ⚠ **这一页不在 `data/bdays.js` 里 → 什么都不渲染**（连胶囊都不出现）。
 *     不是「渲染出来再藏起来」—— 藏着的那种，断言分不出
 *     「这页没有生日」和「组件坏了」，而后者会静默地让所有页面一起消失。
 *
 *   ⚠ `mount()` **可以重复调用**（先清掉上一次再重画）。
 *     断言要靠这个验「生日表变了 → 界面跟着变」。
 *
 * ── 行为是**照首页搬过来的**（2026-10-01 之前首页内联的那份）─────────
 *   · 每秒重画一次（`setInterval(render, 1000)`）
 *   · 生日当天：胶囊文案换成「今天是她的生日！」、蛋糕变 `🎂✨`、
 *     四格**隐藏**、面板 1.5 秒后**自动展开**
 *   · 点胶囊（或键盘 Enter / Space）开合面板，`aria-hidden` 跟着改
 *   · `nextBday()` 逐字照搬 —— 它已经在线上跑了很久，**不要「顺手改好一点」**
 */
(function (global) {
  'use strict';

  var S = {
    egg: null, panel: null,
    timer: 0,        // 每秒重画的 interval
    autoTimer: 0,    // 生日当天自动展开面板
    opts: null,
  };

  function el(tag, cls, id) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (id) n.id = id;
    return n;
  }

  /**
   * 当前页在 `ELYSIA_BDAYS` 里用的键。
   *
   * ⚠ 必须归一：线上访问 `/sakura/` 时 `location.pathname` 是 `/sakura/`，
   *   本地直接打开文件却是 `/sakura/index.html` —— 表里只写一种的话，
   *   总有一种环境查不到，而症状是「倒计时莫名其妙不出现」。
   *
   *   `/`                     → `index.html`
   *   `/sakura/`              → `sakura/index.html`
   *   `/sakura/index.html`    → `sakura/index.html`
   *
   * ⚠ 这个函数**原本住在 `bottom.js`**，2026-10-01 跟着生日倒计时一起搬过来 ——
   *   它就是为「查 `ELYSIA_BDAYS`」而存在的，谁查谁带着。
   *   （首页只加载 `bday.js`、不加载 `bottom.js`，所以它更不能住在那边。）
   *
   * @returns {string}
   */
  function pageKey() {
    var p = global.location.pathname.replace(/^\/+/, '');
    if (p === '') return 'index.html';
    if (/\/$/.test(p)) p += 'index.html';
    return p;
  }

  /**
   * 下一个生日（本地时间零点）。
   *
   * ⚠ **逐字照搬**首页既有的 `nextBday()`（`new Date(y, M, D, 0, 0, 0)` 与
   *   `new Date(y, M, D + 1, 0, 0, 0)`），只是把写死的 `M` / `D` 换成了入参。
   *   不要「顺手改成更严谨的写法」—— 线上跑着的语义就是这一份。
   *
   * @param {Date} now
   * @param {number} m 月份，从 0 起
   * @param {number} d 日
   * @returns {Date}
   */
  function nextBday(now, m, d) {
    var y = now.getFullYear();
    var t = new Date(y, m, d, 0, 0, 0);
    if (now >= new Date(y, m, d + 1, 0, 0, 0)) t = new Date(y + 1, m, d, 0, 0, 0);
    return t;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** 造出胶囊 + 面板。结构与 id 与首页原来那份**逐字一致**。 */
  function build(m, d, opts) {
    var egg = el('div', null, 'bdayEgg');
    egg.setAttribute('role', 'button');
    egg.setAttribute('tabindex', '0');
    egg.setAttribute('aria-label', '生日倒计时彩蛋');
    egg.appendChild(el('span', 'bday-dot'));
    egg.appendChild(el('span', null, 'bdayEggText'));

    var panel = el('div', null, 'bdayPanel');
    panel.setAttribute('aria-hidden', 'true');

    var cake = el('span', 'bday-cake', 'bdayCake');
    cake.textContent = '🎂';
    panel.appendChild(cake);

    // ⚠ 「她 的 生 日」是**默认值**，但它是可配的 ——
    //   逐火十三英桀里有男有女，写死「她」迟早会撞上
    //   HANDOVER §10.3 记着的那类错（「关于他 / 关于她」从上线挂到今天没人发现）。
    //   目前带生日的六位恰好都是女孩子，所以没暴露。
    var title = el('div', 'bday-title');
    title.textContent = opts.title != null ? opts.title : '她 的 生 日';
    panel.appendChild(title);

    var date = el('div', 'bday-date');
    date.textContent = (m + 1) + '月' + d + '日';
    panel.appendChild(date);

    var timer = el('div', 'bday-timer', 'bdayTimer');
    var units = [['bdD', '天'], ['bdH', '时'], ['bdM', '分'], ['bdS', '秒']];
    units.forEach(function (u) {
      var cell = el('div', 'bday-cell');
      var num = el('span', 'bday-num', u[0]);
      num.textContent = '--';
      var unit = el('span', 'bday-unit');
      unit.textContent = u[1];
      cell.appendChild(num);
      cell.appendChild(unit);
      timer.appendChild(cell);
    });
    panel.appendChild(timer);

    var msg = el('div', 'bday-msg', 'bdayMsg');
    panel.appendChild(msg);

    // ⚠ 出处**单独一个节点**，不能塞进 `#bdayMsg` ——
    //   那句台词每秒都会被 `innerHTML` 重写一次，塞进去会被冲掉。
    //   只有给了 src 才建它（首页没给，所以首页的 DOM 与改动前逐字相同）。
    if (opts.src) {
      var srcEl = el('div', 'bday-src', 'bdaySrc');
      srcEl.textContent = '—— ' + opts.src;
      panel.appendChild(srcEl);
    }

    document.body.appendChild(egg);
    document.body.appendChild(panel);
    S.egg = egg;
    S.panel = panel;

    // 开合 —— 与首页那份一致：点胶囊、或键盘 Enter / Space
    function toggle() {
      panel.classList.toggle('open');
      panel.setAttribute('aria-hidden', panel.classList.contains('open') ? 'false' : 'true');
    }
    egg.addEventListener('click', toggle);
    egg.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  }

  /** 按「现在几点」把胶囊文案与面板内容重画一遍。 */
  function render() {
    if (!S.egg || !S.panel) return;

    var entry = (global.ELYSIA_BDAYS || {})[pageKey()];
    if (!entry) return;
    var m = entry[0], d = entry[1];
    var opts = S.opts || {};

    var eggText = document.getElementById('bdayEggText');
    var cake = document.getElementById('bdayCake');
    var timer = document.getElementById('bdayTimer');
    var msg = document.getElementById('bdayMsg');

    var now = new Date();
    if (now.getMonth() === m && now.getDate() === d) {
      eggText.textContent = '今天是她的生日！';
      cake.textContent = '🎂✨';
      timer.style.display = 'none';
      // ⚠ 用 innerHTML 不是 textContent —— 首页那两句里带 <br> 和 <span class="pink">，
      //   换掉它就与首页不一样了。
      msg.innerHTML = opts.birthMsg != null ? opts.birthMsg : '';
      return;
    }

    var diff = nextBday(now, m, d) - now;
    var dd = Math.floor(diff / 86400000),
        hh = Math.floor(diff % 86400000 / 3600000),
        mm = Math.floor(diff % 3600000 / 60000),
        ss = Math.floor(diff % 60000 / 1000);

    eggText.textContent = '距她的生日还有 ' + dd + ' 天';
    document.getElementById('bdD').textContent = dd;
    document.getElementById('bdH').textContent = pad(hh);
    document.getElementById('bdM').textContent = pad(mm);
    document.getElementById('bdS').textContent = pad(ss);
    msg.innerHTML = opts.msg != null ? opts.msg : '';
  }

  /**
   * 挂载。
   *
   * ⚠ **可以重复调用**：先把上一次的节点与定时器清干净，再按当前
   *   `ELYSIA_BDAYS` 重画。断言要靠这个验「生日表变了 → 界面跟着变」。
   *
   * ⚠ **不传参数 = 沿用上一次的参数**（与 `ElysiaBottom.mount` 同一套约定）。
   *   ⚠ 注意 **不传** 与 **传空对象** 不是一回事：
   *     `mount()` 沿用上次；`mount({})` 会把上次的 opts 重置成空。
   *
   * @param {object} [opts]
   * @param {string} [opts.msg]       平时面板里那句（可以是 HTML）
   * @param {string} [opts.birthMsg]  生日当天那句（可以是 HTML）
   * @param {string} [opts.src]       上面那句的出处
   * @param {string} [opts.title]     面板小标题，默认「她 的 生 日」
   */
  function mount(opts) {
    if (arguments.length === 0) opts = S.opts;   // 不传 = 沿用上次的
    S.opts = opts || {};

    // 先清干净上一次的
    clearInterval(S.timer);
    clearTimeout(S.autoTimer);
    S.timer = S.autoTimer = 0;
    if (S.egg && S.egg.parentNode) S.egg.parentNode.removeChild(S.egg);
    if (S.panel && S.panel.parentNode) S.panel.parentNode.removeChild(S.panel);
    S.egg = S.panel = null;

    var entry = (global.ELYSIA_BDAYS || {})[pageKey()];
    if (!entry) return;      // 不在表里 → 什么都不渲染（连胶囊都没有）

    build(entry[0], entry[1], S.opts);
    render();

    S.timer = setInterval(render, 1000);

    // 生日当天，进来 1.5 秒后把面板自己摊开 —— 这一天它值得被看见。
    // ⚠ 与首页那份一致：这里只加 `.open`，**没有**同步 `aria-hidden`。
    //   （首页原来就是这么写的，照搬以保持一致；但这确实是处 a11y 瑕疵，
    //     已在交付说明里单独提出来，没有自作主张改掉。）
    var now = new Date();
    if (now.getMonth() === entry[0] && now.getDate() === entry[1]) {
      S.autoTimer = setTimeout(function () {
        if (S.panel) S.panel.classList.add('open');
      }, 1500);
    }
  }

  global.ElysiaBday = {
    mount: mount,
    pageKey: pageKey,       // 测试要拿它确认路径归一
    nextBday: nextBday,     // 同上：断言要拿它当参照
  };

})(window);
