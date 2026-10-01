/**
 * assets/bottom.js — 下方区块的外壳（探索度 / 游戏槽）
 *
 * 呀，页面逛到最后，总得有个地方坐下来歇歇脚嘛♥
 *
 * ── 它在解决什么 ─────────────────────────────────────────────────────
 *   以前每页的「额外功能」都各挂各的：小游戏是个悬浮按钮 + 全屏遮罩、
 *   探索度临时塞在 body 末尾。两个东西两种形态，谁也不知道该往哪儿看。
 *   这一层把它们收进**页面最下方的一个区块**：看完内容自然走到那里。
 *
 * ── ⚠ 生日倒计时**已经不在这里了**（2026-10-01）────────────────────
 *   需求方要「其他英桀的生日和首页爱莉希雅的**形式一样**」，并明确选了
 *   「照搬首页那个右下角悬浮胶囊」。而悬浮组件跟「页面下方一块区域」是两回事，
 *   硬塞在 `#bottom` 里只会别扭。所以它搬到 **`assets/bday.js`**，
 *   连 `pageKey()` 和 `nextBday()` 一起 —— 那两个函数本来就是为它写的。
 *   → 下方区块现在只有**两个**槽；`data/bdays.js` 由 `bday.js` 读，这里不碰。
 *
 * ── 怎么用（**新的英桀页请照这个写**）─────────────────────────────────
 *     <script src="/assets/site.js"></script>
 *     <script src="/assets/explore.js"></script>
 *     <script src="/assets/bottom.js"></script>
 *     <script src="/assets/bday.js"></script>
 *     <script src="/data/bdays.js"></script>
 *     <script src="/assets/games/<角色>.js"></script>   <!-- 该页有游戏才加载 -->
 *     <script>
 *     ElysiaExplore.init(THEME.explore);
 *     ElysiaBottom.mount({ game: THEME.game });      // game 可选
 *     ElysiaBday.mount({ birthMsg: '「…」', src: '生日语音' });  // 都是可选
 *     </script>
 *
 * ── 两个槽 ───────────────────────────────────────────────────────────
 *   探索度  **恒有** —— 它是这一趟「逛」的成绩单，每个页面都该有
 *   游戏槽  只在传了 `game` 时才渲染 → 交给 `games/<角色>.js` 自己画
 */
(function (global) {
  'use strict';

  var S = { section: null, opts: null };

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  /**
   * 挂载下方区块。
   *
   * ⚠ **可以重复调用**（把区块重新画一遍）。这不是为了好看 ——
   *   断言里要重挂一次来验「重画之后状态还对」，而「重挂之后槽位状态不对」
   *   是真实会发生的 bug（`sec.innerHTML = ''` 会把挂在里面的可发现物一起抹掉，
   *   见 `explore.js` 的 `ensureAttached`）。
   *
   * ⚠ **不传参数 = 沿用上一次的参数重画。** 不这样的话，一次 `mount({})`
   *   就会把上次传的 `game` 悄悄冲掉 —— 重画之后游戏槽凭空消失，
   *   而调用方以为自己什么也没改。
   *
   * @param {object} [opts]
   * @param {object} [opts.game]      { module }，见 spec §4.5
   *
   * ⚠ **不传** 与 **传空对象** 不是一回事，别踩：
   *      `mount()`    → **沿用上次的 opts**（重画一遍，游戏槽保住）
   *      `mount({})`  → **opts 被重置成空**，上一次的 `game` 会被清掉
   *   写测试或加第二个调用点时很容易顺手写成 `mount({})`，
   *   症状是「重画之后游戏槽凭空消失，而调用方以为自己什么都没改」——
   *   评测时就是这么踩到的（Task 11 复核）。
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

    /* ── 槽 2：游戏（传了 game 才渲染）───────────────────────────── */
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
  };

})(window);
