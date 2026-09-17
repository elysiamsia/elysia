/**
 * assets/site.js — 13 页共享行为
 *
 * 呀！每个页面各自养了一份的那些小工具，终于住到一起啦♥
 *
 * ── 这一层怎么用（**新的英桀页请照这个写**）─────────────────────────────
 *
 *   每页只声明一个 THEME —— 这一页的「性格」，其余交给共享层。
 *   📖 **完整 schema 与逐页数值总表见 `docs/theme-schema.md`**，那是权威规格。
 *
 *     <script src="/assets/site.js"></script>
 *     <script>
 *     var THEME = {
 *       // ── 结尾星屑 ── 逐页不同：配色 / 粒子数 / 时长 ──────────
 *       endingStars: {
 *         count: [80, 12],                            // min(80, floor(innerWidth / 12))
 *         size:  [0.5, 2.5],                          // 0.5 + rnd * 2
 *         minO:  [0.1, 0.4],  maxO: [0.5, 1.0],
 *         dur:   [2, 6],      delay: [0, 5],
 *         colors: { base: '#fff', alt: '#c77dff', altChance: 0.3 },
 *       },
 *
 *       // ── 语录卡 ── ariaLabel 必填，它是 Lore 不是 UI 标签 ────
 *       quotes: {
 *         list: ['「…」', '「…」'],
 *         ariaLabel: '救世铭文，点击切换',             // ⚠ 逐页不同的专属文案
 *       },
 *
 *       // ── 打字机 ── 五个时间数值**逐页抄原值**，别依赖默认 ────
 *       typewriter: {
 *         text: '……',
 *         delay: 130, jitter: 70, startDelay: 800,
 *         tailDelay: 600, hintDelay: 1200,
 *         hintEl: false,                              // 该页若无 #openingHint 就 false
 *         preReveal: 'openingOrn',                    // 无则传 null（string | null）
 *       },
 *     };
 *
 *     ElysiaShared.spawnEndingStars(
 *       document.getElementById('endingStars'), THEME.endingStars);
 *     ElysiaShared.buildQuoteCards({
 *       grid: document.getElementById('quotesGrid'),
 *       quotes: THEME.quotes.list,
 *       ariaLabel: THEME.quotes.ariaLabel,
 *     });
 *     ElysiaShared.observeReveal('.timeline-node');
 *     ElysiaShared.observeReveal('#ending', {
 *       threshold: 0.3, reveal: ['endingQuote', 'endingAttr', 'backLink'] });
 *     ElysiaShared.makeTypewriter(THEME.typewriter);
 *     </script>
 *
 *   ⚠ **THEME 只装「逐页不同」的东西。** 逐页相同的（提示文案「点击切换」、
 *     淡出 400ms、进场阈值 0.15 / -50px……）一律留在这层当默认值 ——
 *     否则 13 页每页抄一遍，P1 就白做了。完整清单见 theme-schema.md §二。
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

  /**
   * 构建语录卡并绑定「点击换一句」。
   *
   * ✨ 呀，6 个子页原本每次点击都要
   *   `Array.prototype.indexOf.call(grid.querySelectorAll('.quote-card'), card)`
   *   —— **重扫一遍 DOM** 只为问「我是第几张」。index 早就是闭包写法了。
   *   这里统一成**闭包 O(1)**：索引在创建时就固化在 card 自己的作用域里。
   *   （设计文档 §5-P1 明确要求的一项。）
   *
   * ⚠ `ariaLabel` 是**必填**，而且**必须传该页原本的文案**。
   *   「低语卡片」「黄金诗句」「救世铭文」这些是**世界观设定（Lore）**，
   *   不是通用 UI 标签 —— 统一成「语录」是对角色塑造的破坏。
   *   更要命的是：`snapshot.py` 采的是**计算样式，不含属性**，
   *   所以这种回归它会报「✅ 无差异」。详见 `docs/theme-schema.md` §四。
   *
   * @param {object}   opts
   * @param {HTMLElement} opts.grid       容器（如 #quotesGrid）
   * @param {string[]}    opts.quotes     语录数组
   * @param {string}      opts.ariaLabel  该页专属的 aria-label（必传原值）
   * @param {string}     [opts.hintText]  卡片右下角提示，默认「点击切换」
   * @param {number}     [opts.fadeMs]    淡出到换字的等待，默认 400
   * @param {function}   [opts.onShow]    切换后回调 (newIndex) => void
   *                                      ← 预留扩展点，index 的配音用
   */
  function buildQuoteCards(opts) {
    var grid = opts.grid;
    var quotes = opts.quotes || [];
    if (!grid || !quotes.length) return;

    var hintText = opts.hintText != null ? opts.hintText : '点击切换';
    var fadeMs = opts.fadeMs != null ? opts.fadeMs : 400;

    quotes.forEach(function (q, i) {
      var card = document.createElement('div');
      card.className = 'quote-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', opts.ariaLabel || hintText);

      var textEl = document.createElement('div');
      textEl.className = 'quote-text';
      textEl.textContent = q;

      var hint = document.createElement('span');
      hint.className = 'quote-hint';
      hint.textContent = hintText;

      card.appendChild(textEl);
      card.appendChild(hint);

      // ★ 闭包固化索引 —— O(1)，且不重扫 DOM。
      //   刻意**不放在模块级**：跨多次初始化会串味。
      //
      // ⚠ `cur` 必须在**点击时同步推进**，不能挪进下面那个 setTimeout 里。
      //   原写法是 `cardIndices[idxPos] = nextIdx;`（同步），然后才 setTimeout 换字。
      //   若写成「在 setTimeout 里才 cur = next」，连点 17 次会**全部算出同一个 next**
      //   —— 因为每次点击读到的都是同一个还没更新的 cur。
      var cur = i;
      function advance() {
        cur = (cur + 1) % quotes.length;
        var next = cur;                    // 本次点击的目标，闭包捕获
        textEl.classList.add('fading');
        setTimeout(function () {
          textEl.textContent = quotes[next];
          textEl.classList.remove('fading');
          if (opts.onShow) opts.onShow(next);
        }, fadeMs);
      }

      card.addEventListener('click', advance);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          advance();
        }
      });

      grid.appendChild(card);
    });
  }

  /**
   * 滚动进场观察器 —— 元素进入视口时加上 `visible`。
   *
   * ⚠ **本函数一律带判空**。6 个子页原本的结尾观察器是
   *   `document.getElementById('endingQuote').classList.add('visible')` 直取，
   *   元素若缺失就抛异常。统一采用带判空的写法是**行为改善**（元素齐全时
   *   表现完全一致）—— Inventory §3 R11，**非纯重构**，已在 commit 里标明。
   *
   * 两种用法：
   *   1. 给被观察元素自己加类（时间轴节点）——
   *        observeReveal('.timeline-node')
   *   2. 观察到 A、点亮的是 B / C / D（结尾区）——
   *        observeReveal('#ending', { threshold: 0.3,
   *                                   reveal: ['endingQuote', 'endingAttr', 'backLink'] })
   *
   * @param {string} selector
   * @param {object}   [opts]
   * @param {number}   [opts.threshold]   默认 0.15
   * @param {string}   [opts.rootMargin]  默认 '0px 0px -50px 0px'
   * @param {string[]} [opts.classes]     要加的类名，默认 ['visible']
   * @param {string[]} [opts.reveal]      改点亮这几个 id（元素不存在就跳过）
   * @param {function} [opts.onReveal]    命中回调 (target) => void
   * @returns {IntersectionObserver|null}
   */
  function observeReveal(selector, opts) {
    var o = opts || {};
    var nodes = document.querySelectorAll(selector);
    if (!nodes.length) return null;

    var classes = o.classes || ['visible'];

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        if (o.reveal) {
          // 观察到的是「舞台」，点亮的是台上几盏灯
          o.reveal.forEach(function (id) {
            var target = document.getElementById(id);
            if (!target) return;
            classes.forEach(function (c) { target.classList.add(c); });
          });
        } else {
          classes.forEach(function (c) { entry.target.classList.add(c); });
        }

        if (o.onReveal) o.onReveal(entry.target);
      });
    }, {
      threshold: o.threshold != null ? o.threshold : 0.15,
      rootMargin: o.rootMargin || '0px 0px -50px 0px',
    });

    nodes.forEach(function (n) { obs.observe(n); });
    return obs;
  }

  /**
   * 开场打字机。
   *
   * ⚠ **五个时间数值逐页不同，调用方必须传该页原值 —— 不要依赖默认值。**
   *   实测（2026-09-17）：kalpas/villv 的 `startDelay` 是 700 而不是 800、
   *   kalpas 的 `tailDelay` 是 550、villv 是 500、kalpas/su/villv 的
   *   `hintDelay` 是 1000。漏传就会悄悄改变那几页的节奏。
   *   完整对照表见 `docs/theme-schema.md` §5.1。
   *
   * ⚠ `preReveal` 是**打字开始前同步点亮**的装饰（aponnia/eden/kalpas/kevin/villv
   *   的 #openingOrn、su 的 #openingMoon）。它不在这儿就没人点 —— 6 页的
   *   入场装饰会集体不亮。index 没有这个元素，传 null。
   *
   * 涉及的 DOM id（7 页共有，实测）：#typewriterText / #typingCursor /
   *   #openingSub / #scrollHint；#openingHint 只有 kalpas/su/villv 有。
   *
   * @param {object} o
   * @param {string}      o.text         要打出来的文本
   * @param {number}     [o.delay]       每字基础延迟，默认 160
   * @param {number}     [o.jitter]      每字额外随机幅度，默认 80
   * @param {number}     [o.startDelay]  开打前等待，默认 800
   * @param {number}     [o.tailDelay]   打完 → 光标隐藏 / 副标题显示，默认 600
   * @param {number}     [o.hintDelay]   副标题 → 滚动提示，默认 1200
   * @param {boolean}    [o.hintEl]      是否点亮 #openingHint，默认 false
   * @param {string|null}[o.preReveal]   打字前点亮的元素 id，无则 null
   */
  function makeTypewriter(o) {
    var el = document.getElementById('typewriterText');
    if (!el) return;

    var text = o.text || '';
    var delay = o.delay != null ? o.delay : 160;
    var jitter = o.jitter != null ? o.jitter : 80;
    var hintDelay = o.hintDelay != null ? o.hintDelay : 1200;
    var tailDelay = o.tailDelay != null ? o.tailDelay : 600;
    var startDelay = o.startDelay != null ? o.startDelay : 800;

    var cursorEl = document.getElementById('typingCursor');
    var subEl = document.getElementById('openingSub');
    var hintEl = o.hintEl ? document.getElementById('openingHint') : null;
    var scrollHintEl = document.getElementById('scrollHint');

    var charIndex = 0;
    function typeNext() {
      if (charIndex < text.length) {
        el.textContent += text[charIndex];
        charIndex++;
        setTimeout(typeNext, delay + Math.random() * jitter);
        return;
      }
      setTimeout(function () {
        if (cursorEl) cursorEl.classList.add('hidden');
        if (subEl) subEl.classList.add('visible');
        if (hintEl) hintEl.classList.add('visible');
        setTimeout(function () {
          if (scrollHintEl) scrollHintEl.classList.add('visible');
        }, hintDelay);
      }, tailDelay);
    }

    // ⚠ 装饰是**同步**点亮的（早于 startDelay），与原始写法一致 ——
    //   别挪进 setTimeout 里，那会让它晚于打字出现。
    if (o.preReveal) {
      var preEl = document.getElementById(o.preReveal);
      if (preEl) preEl.classList.add('visible');
    }

    setTimeout(typeNext, startDelay);
  }

  global.ElysiaShared = {
    makeResize: makeResize,
    spawnEndingStars: spawnEndingStars,
    pickColor: pickColor,
    buildQuoteCards: buildQuoteCards,
    observeReveal: observeReveal,
    makeTypewriter: makeTypewriter,
  };

})(window);
