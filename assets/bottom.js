/**
 * assets/bottom.js — 下方区块的外壳（游戏槽 / 生日倒计时 / 探索度）
 *
 * 呀，页面逛到最后，总得有个地方坐下来歇歇脚嘛♥
 *
 * ── 它在解决什么 ─────────────────────────────────────────────────────
 *   以前每页的「额外功能」都各挂各的：生日倒计时钉在右下角飘着、
 *   小游戏是个悬浮按钮 + 全屏遮罩、探索度临时塞在 body 末尾。
 *   三个东西三种形态，谁也不知道该往哪儿看。
 *   这一层把它们收进**页面最下方的一个区块**：看完内容自然走到那里，
 *   该有的都在，不该有的（比如没有生日的英桀）**根本不出现**。
 *
 * ── 怎么用（**新的英桀页请照这个写**）─────────────────────────────────
 *     <script src="/assets/site.js"></script>
 *     <script src="/assets/explore.js"></script>
 *     <script src="/assets/bottom.js"></script>
 *     <script src="/data/bdays.js"></script>
 *     <script src="/assets/games/<角色>.js"></script>   <!-- 该页有游戏才加载 -->
 *     <script>
 *     ElysiaExplore.init(THEME.explore);
 *     ElysiaBottom.mount({
 *       game: THEME.game,                  // 可选
 *       bdayLine: '「…」',                 // 可选：生日**当天**才说的那句话
 *       bdaySrc:  '生日语音',              // 可选：它的出处（有台词就必须有出处）
 *     });
 *     </script>
 *
 * ── 三个槽（spec §4.3）────────────────────────────────────────────────
 *   探索度    **恒有** —— 它是这一趟「逛」的成绩单，每个页面都该有
 *   生日倒计时 只在 `data/bdays.js` 里**有这一页**时才渲染
 *              ⚠ 「没有」的做法是**整个不渲染**，不是渲染出来藏起来。
 *                藏着的那种，断言分不出「没有生日」和「组件坏了」。
 *   游戏槽   只在传了 `game` 时才渲染 → 交给 `games/<角色>.js` 自己画
 *
 * ── 两条约束 ─────────────────────────────────────────────────────────
 *   · ⚠ **生日数据只有一处**（`data/bdays.js`）。这里只读，不存。
 *     这一页自己再写一份 `BD = 30` 就又把 HANDOVER §10.5 那个坑挖回来了。
 *   · ⚠ 倒计时算法**逐字照搬**既有页面的 `nextBday()`（见下方函数注释），
 *     不「顺手改好一点」—— 它已经在线上跑了很久。
 */
(function (global) {
  'use strict';

  var S = { section: null, bdaySlot: null, timer: 0, opts: null };

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
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
   * ⚠ **逐字照搬** `/mobius/` 与首页 `index.html` 里既有的 `nextBday()`。
   *   两份原件写的是 `new Date(y, BM, BD, 0, 0, 0)` 与
   *   `new Date(y, BM, BD + 1, 0, 0, 0)`，这里只是把 `BM/BD` 换成了入参。
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

  /** 把倒计时槽的内容按「现在几点」重画一遍。 */
  function paintBday() {
    if (!S.bdaySlot) return;

    var entry = (global.ELYSIA_BDAYS || {})[pageKey()];
    if (!entry) return;

    var m = entry[0], d = entry[1];
    var now = new Date();
    var today = (now.getMonth() === m && now.getDate() === d);

    S.bdaySlot.querySelector('.bottom-bday-date').textContent = (m + 1) + ' 月 ' + d + ' 日';
    S.bdaySlot.querySelector('.bottom-bday-text').textContent = today
      ? '今天是她的生日！'
      : '距她的生日还有 ' + Math.floor((nextBday(now, m, d) - now) / 86400000) + ' 天';

    // 生日当天才说的那句。台词必须有出处，所以 src 一起渲染。
    var lineEl = S.bdaySlot.querySelector('.bottom-bday-line');
    var opts = S.opts || {};
    if (today && opts.bdayLine) {
      lineEl.textContent = opts.bdaySrc ? opts.bdayLine + '　—— ' + opts.bdaySrc : opts.bdayLine;
      lineEl.hidden = false;
    } else {
      lineEl.textContent = '';
      lineEl.hidden = true;
    }
  }

  /**
   * 挂载下方区块。
   *
   * ⚠ **可以重复调用**（把区块重新画一遍）。这不是为了好看 ——
   *   断言里要临时改 `ELYSIA_BDAYS` 再重挂，来验证「生日表变化 →
   *   槽位跟着变」。不可重复调用的实现会让那类断言只能靠猜。
   *
   * ⚠ **不传参数 = 沿用上一次的参数重画。** 不这样的话，一次 `mount({})`
   *   就会把上次传的 `game` 悄悄冲掉 —— 重画之后游戏槽凭空消失，
   *   而调用方以为自己什么也没改。
   *
   * @param {object} [opts]
   * @param {object} [opts.game]      { module, title, hint }，见 spec §4.5
   * @param {string} [opts.bdayLine]  生日当天额外说的一句（可选）
   * @param {string} [opts.bdaySrc]   上面那句的出处（有台词就必须有出处）
   */
  function mount(opts) {
    if (arguments.length === 0) opts = S.opts;   // 不传 = 沿用上次的
    S.opts = opts || {};

    var sec = S.section;
    if (!sec || !sec.parentNode) {
      sec = document.getElementById('bottom') || el('section', '');
      sec.id = 'bottom';
      document.body.appendChild(sec);
      S.section = sec;
    }
    // 重挂时清空重画。探索度节点会被 ElysiaExplore.mountCount 重新放回来。
    sec.innerHTML = '';

    /* ── 槽 1：探索度（恒有）─────────────────────────────────────────
       它原来临时挂在 body 末尾（Task 3），现在搬进区块。
       ⚠ 探索度是**探索系统的**东西，不在这里重画 ——
         只负责给它一个位置，内容由 ElysiaExplore 自己维护。 */
    var countSlot = el('div', 'bottom-count');
    sec.appendChild(countSlot);
    if (global.ElysiaExplore && global.ElysiaExplore.mountCount) {
      global.ElysiaExplore.mountCount(countSlot);
    }

    /* ── 槽 2：生日倒计时（表里有这一页才渲染）────────────────────── */
    S.bdaySlot = null;
    if ((global.ELYSIA_BDAYS || {})[pageKey()]) {
      var b = el('div', 'bottom-bday');
      b.appendChild(el('p', 'bottom-bday-date'));
      b.appendChild(el('p', 'bottom-bday-text'));
      var line = el('p', 'bottom-bday-line');
      line.hidden = true;
      b.appendChild(line);
      sec.appendChild(b);
      S.bdaySlot = b;

      paintBday();
      // 每 60 秒重画一次：跨过零点时天数要跟着变。
      // （既有页面是每秒刷的，那是为了显示时分秒；这里只显示天，
      //   每秒重画没有意义，还白白占着主线程。）
      clearInterval(S.timer);
      S.timer = setInterval(paintBday, 60000);
    }

    /* ── 槽 3：游戏（传了 game 才渲染）───────────────────────────── */
    if (S.opts.game && S.opts.game.module) {
      var g = el('div', 'bottom-game');
      sec.appendChild(g);

      var mod = (global.ElysiaGames || {})[S.opts.game.module];
      if (mod && typeof mod.mount === 'function') {
        mod.mount(g);
      } else {
        // ⚠ 用 warn 不用 error：游戏还没写好的页面照样该能跑，
        //   而这页的**其它**功能不该因此受影响。
        console.warn('[ElysiaBottom] 找不到游戏模块：' + S.opts.game.module);
      }
    }
  }

  global.ElysiaBottom = {
    mount: mount,
    pageKey: pageKey,       // 探针页与测试要用它确认路径归一化
    nextBday: nextBday,     // 同上：断言要拿它当参照
  };

})(window);
