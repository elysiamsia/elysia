/**
 * assets/site.js — 13 页共享行为
 *
 * 呀！每个页面各自养了一份的那些小工具，终于住到一起啦♥
 *
 * ── 这一层怎么用（**新的英桀页请照这个写**）─────────────────────────────
 *
 *   每页只声明一个 THEME —— 这一页的「性格」，其余交给共享层：
 *
 *     <script src="/assets/site.js"></script>
 *     <script>
 *     var THEME = {
 *       accent: '#c77dff',
 *       endingStars: {
 *         count: [80, 12],                            // min(80, floor(innerWidth / 12))
 *         size:  [0.5, 2.5],                          // 0.5 + rnd * 2
 *         minO:  [0.1, 0.4],  maxO: [0.5, 1.0],
 *         dur:   [2, 6],      delay: [0, 5],
 *         colors: { base: '#fff', alt: '#c77dff', altChance: 0.3 },
 *       },
 *     };
 *     ElysiaShared.spawnEndingStars(
 *       document.getElementById('endingStars'), THEME.endingStars);
 *     </script>
 *
 *   页面专属的东西（千劫的怒气 HUD、苏的木鱼、维尔薇的八人格卡……）
 *   仍然写在页面自己里，**不进这个文件**。
 *
 * ── 设计约束（每一条都是踩出来的）──────────────────────────────────────
 *
 *   · `size` **不做 toFixed**。原代码里没有任何一页对尺寸四舍五入，
 *     加上去就是改数值（1.6328px 变 1.6px）。
 *
 *   · `colors` 有两种形态，**各自与原始写法逐位对应**，不是「数组近似概率」：
 *       { base, alt, altChance }  ←→  `Math.random() > altChance ? base : alt`
 *       { pool: [...] }           ←→  `pool[Math.floor(Math.random() * pool.length)]`
 *     用四种颜色去凑 eden 的 0.35 是凑不准的（那会变成 0.25）。
 *
 *   · 随机数的**调用顺序固定**为：
 *       size → minO → maxO → dur → delay → left → top → color
 *     这是 index.html 原本的顺序。统一之后，其余 6 页的星空会重新洗一次。
 *     ⚠ 但那**不是**有意义的不变量 —— 星星是随机装饰，「同一片星空」无从谈起。
 *     真正要守住的是这五样：**数量 / 尺寸区间 / 透明度区间 / 时长区间 / 颜色分布**。
 */
(function (global) {
  'use strict';

  /**
   * 在区间里取一个随机数。区间的意义是 [lo, lo + span] —— 与原始写法
   * `0.1 + Math.random() * 0.3` 一一对应，不做任何额外的取整。
   *
   * @param {number[]} range [lo, span]
   * @returns {number}
   */
  function randIn(range) {
    return range[0] + Math.random() * range[1];
  }

  /**
   * 粒子 canvas 的 resize 处理器工厂。
   *
   * ⚠ **这里只管「把 canvas 和视口尺寸对上」这三行。**
   *   各页都还有另一个「把越界粒子拉回画布内」的匿名监听器 ——
   *   那个**故意不抽**：它碰的数组每页不一样（aponnia 同时碰 stars 和 threads），
   *   而 villv 本来就没有它（Inventory R10）。折进来会改行为。
   *
   * @param {HTMLCanvasElement} canvas
   * @param {object} state 会被就地改写 W / H。
   *        老页面用存取器接自己的闭包变量：
   *          makeResize(canvas, { get W(){return W}, set W(v){W=v},
   *                               get H(){return H}, set H(v){H=v} })
   *        新页面直接用一个普通对象就好，然后全程读 P.W / P.H。
   * @returns {function(): void}
   */
  function makeResize(canvas, state) {
    return function resize() {
      state.W = canvas.width = window.innerWidth;
      state.H = canvas.height = window.innerHeight;
    };
  }

  /**
   * 按 colors 的声明取一个颜色。两种形态与原始写法逐位对应，见文件头说明。
   *
   * @param {object|string[]} spec
   * @returns {string}
   */
  function pickColor(spec) {
    if (spec && spec.pool) {
      return spec.pool[Math.floor(Math.random() * spec.pool.length)];
    }
    // { base, alt, altChance } —— 与 `rnd() > altChance ? base : alt` 等价
    return Math.random() > spec.altChance ? spec.base : spec.alt;
  }

  /**
   * 生成结尾区的星屑背景。
   *
   * @param {HTMLElement} container
   * @param {object} o
   * @param {number[]} o.count       [上限, 除数]，实际数量取 min(上限, floor(视口宽 / 除数))
   * @param {number[]} o.size        [lo, span]，**不四舍五入**
   * @param {number[]} o.minO        最小不透明度 [lo, span]
   * @param {number[]} o.maxO        最大不透明度 [lo, span]
   * @param {number[]} o.dur         动画时长（秒）[lo, span]
   * @param {number[]} o.delay       动画延迟（秒）[lo, span]
   * @param {object}   o.colors      见 pickColor
   */
  function spawnEndingStars(container, o) {
    if (!container) return;
    var n = Math.min(o.count[0], Math.floor(window.innerWidth / o.count[1]));

    for (var i = 0; i < n; i++) {
      var star = document.createElement('div');
      star.className = 'ending-star';

      // ⚠ 下面这八行的**先后顺序不能动**——它决定了随机数怎么分配。
      //   见文件头「随机数的调用顺序」。
      var size = randIn(o.size);
      var minO = randIn(o.minO).toFixed(2);
      var maxO = randIn(o.maxO).toFixed(2);
      var dur = randIn(o.dur).toFixed(1);
      var delay = randIn(o.delay).toFixed(1);
      var left = Math.random() * 100;
      var top = Math.random() * 100;
      var color = pickColor(o.colors);

      star.style.cssText =
        'width:' + size + 'px;height:' + size + 'px;' +
        'left:' + left + '%;top:' + top + '%;' +
        '--min-o:' + minO + ';--max-o:' + maxO + ';' +
        '--dur:' + dur + 's;--delay:' + delay + 's;' +
        'background:' + color + ';';

      container.appendChild(star);
    }
  }

  global.ElysiaShared = {
    makeResize: makeResize,
    spawnEndingStars: spawnEndingStars,
    pickColor: pickColor,
  };

})(window);
