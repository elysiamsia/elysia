/**
 * assets/explore.js — 探索系统：可发现物 / 探索度 / 陪伴层
 *
 * 呀！页面不再只是「可以看」了 —— 现在它「可以逛」啦♥
 *
 * ── 它在解决什么 ─────────────────────────────────────────────────────
 *   以前一页只有 3 个彩蛋，而且**全都得点某个特定元素**，点别的地方什么都不发生。
 *   13 页轮着用那十几种机制，玩到第 3 页就腻了。
 *   这一层给每页撒一把「藏起来的小东西」：找得到就找，找不到也看得见进度在长。
 *
 * ── 怎么用（**新的英桀页请照这个写**）──────────────────────────────────
 *     <link rel="stylesheet" href="/assets/site.css">
 *     <link rel="stylesheet" href="/assets/explore.css">   <!-- ← 必须在页面 <style> 之前 -->
 *     <style> …这一页的专属样式… </style>
 *     ...
 *     <script src="/assets/site.js"></script>
 *     <script src="/assets/explore.js"></script>
 *     <script>
 *
 * ⚠ **上面这段示例里不要写嵌套的注释符号。** 块注释不嵌套 ——
 *   示例里若出现成对的 `*` 加斜杠，注释会**在那儿提前闭合**，
 *   剩下的半截变成真代码，报出来的却是一个和真正原因毫无关系的语法错。
 *   （2026-10-01 实测踩到：报错指着第 14 行的 `</style>`。）
 *     var THEME = {
 *       explore: {
 *         finds: [{
 *           id:   'lab-01',          // 页内唯一。**改名 = 玩家进度丢失**
 *           at:   '#about',          // 锚点选择器（页面上必须已存在）
 *           x:    0.18, y: 0.62,     // 相对锚点矩形的百分比，[0..1]，指的是**中心点**
 *           verb: 'hold',            // click | hold | drag | triple_tap | slide
 *           art:  'spore',           // 外观关键字，见下方 ART
 *           line: '「…」',            // 台词 —— **必须有出处**
 *           src:  '蛇主的追忆·其一',  // 出处标注，渲染在气泡角落
 *         }],
 *         unlock:  { title:'…', text:'「…」', src:'…' },   // 找齐之后展开
 *         whisper: ['「…」'],                              // 陪伴层台词池
 *         whisperCooldownMs: 8000,                         // 可选
 *         hintAfterRatio:    0.5,                          // 可选
 *       },
 *     };
 *     ElysiaExplore.init(THEME.explore);
 *     </script>
 *
 * ── 三条设计约束（需求方定的，**别改**）────────────────────────────────
 *
 *   · **不做抽卡。** 表层反应必须稳定、可预期 —— 台词按顺序推进，不随机抽。
 *     惊喜只来自「找到了藏起来的东西」，不来自运气。
 *     （需求方 2026-10-01 明确**没选**「不可预测 / 抽卡」那条路。）
 *
 *   · **台词必须有出处。** `line` 是角色真说过的话，`src` 是出处，两者一起渲染。
 *     查不到出处的就不写 —— 这是本站的底线，比「好玩」重要。
 *
 *   · **触控优先。** 每个可发现物的热区 ≥ 44×44 px（WCAG 2.5.8）。
 *
 * ⚠ 完整设计见 `docs/superpowers/specs/2026-10-01-elysiad-explore-refactor-design.md`。
 * ⚠ 断言在 `tools/check_explore.py` —— 快照测不出「点不点得到」，那边才管这个。
 */
(function (global) {
  'use strict';

  /* ── 外观关键字 ────────────────────────────────────────────────────
     一组通用简笔画：24×24 viewBox，**只用 stroke 不用 fill** ——
     这样它在任何底色上都能读，各页只要改 `--explore-tint` 就换了颜色，
     不需要为此写一行新代码。
     想加新的？往这儿添一条，同时在 spec §5.2 的表里登记。 */
  var ART = {
    spore:      '<circle cx="12" cy="13.5" r="5"/><circle cx="12" cy="4.5" r="1.6"/><circle cx="5.2" cy="8.6" r="1.6"/><circle cx="18.8" cy="8.6" r="1.6"/>',
    scale:      '<path d="M3 8.5c3-4 15-4 18 0"/><path d="M4.2 13.5c3-3 12.6-3 15.6 0"/><path d="M6 18.5c2.8-2 9.2-2 12 0"/>',
    glint:      '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>',
    record:     '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="1"/>',
    shadow:     '<path d="M5 17.5c0-4.8 3.1-8.5 7-8.5s7 3.7 7 8.5z"/><ellipse cx="12" cy="19.5" rx="8.5" ry="2.2"/>',
    throne:     '<path d="M6.5 20.5V9.5A3 3 0 0 1 9.5 6.5h5a3 3 0 0 1 3 3v11"/><path d="M4 20.5h16"/><path d="M9.5 6.5V3.2"/><path d="M14.5 6.5V3.2"/>',
    shed:       '<path d="M4 8.2c4.2-5 12.4-4 13.2 2s-6.2 10.4-11.2 8.2"/><path d="M7.4 10.4c3.4-.4 6.2 1 6.8 3.6"/>',
    infinity:   '<path d="M12 12c-1.9-2.9-3.9-4.4-5.9-4.4A4.4 4.4 0 0 0 6.1 16.4c2 0 4-1.5 5.9-4.4 1.9-2.9 3.9-4.4 5.9-4.4a4.4 4.4 0 0 1 0 8.8c-2 0-4-1.5-5.9-4.4z"/>',
    mouse:      '<ellipse cx="12" cy="15" rx="6.6" ry="5"/><circle cx="7.6" cy="9.4" r="2.6"/><circle cx="16.4" cy="9.4" r="2.6"/><path d="M18.2 17.6c2.6 1.2 2.6 3.8.8 4.6"/>',
    sleeping:   '<path d="M4 6.5h5.6L4 13.2h5.6"/><path d="M13.4 12.6h4.8l-4.8 6h4.8"/>',
    silhouette: '<circle cx="12" cy="8" r="3.6"/><path d="M5.2 21c0-3.9 3-6.8 6.8-6.8s6.8 2.9 6.8 6.8"/>',
    brick:      '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M3 12h18"/><path d="M9 6v6"/><path d="M15 12v6"/>',
  };
  var DEFAULT_ART = 'glint';

  /**
   * 取某个 art 关键字的内联 SVG。
   * 未知关键字**回落到默认并 warn** —— 一个笔误不该让整页脚本停摆。
   *
   * @param {string} key
   * @returns {string} SVG 标记
   */
  function artSvg(key) {
    var body = ART[key];
    if (!body) {
      console.warn('[ElysiaExplore] 未知的 art 关键字：' + key + '（回落到 ' + DEFAULT_ART + '）');
      body = ART[DEFAULT_ART];
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
           ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"' +
           ' aria-hidden="true">' + body + '</svg>';
  }

  /**
   * 造一个可发现物节点。
   *
   * ⚠ `left/top` 用的是「中心点」语义（配合 CSS 的 translate(-50%,-50%)）——
   *   所以 `x:0.5` 就是水平居中。写成左上角语义的话，同一个 x
   *   在宽窄不同的区段里会歪，调起来全靠试，没法复用。
   *
   * @param {object} f  THEME.explore.finds 里的一条
   * @returns {HTMLElement}
   */
  function buildFind(f) {
    var node = document.createElement('div');
    node.className = 'explore-find';
    node.setAttribute('data-find-id', f.id);
    node.setAttribute('data-verb', f.verb || 'click');
    node.setAttribute('data-art', f.art || DEFAULT_ART);

    // 无障碍：三个都要有（spec §5.6）。aria-label 是**共享默认值**，不进 THEME。
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', f.label || '可探索之处');

    node.style.left = ((typeof f.x === 'number' ? f.x : 0.5) * 100) + '%';
    node.style.top = ((typeof f.y === 'number' ? f.y : 0.5) * 100) + '%';

    var art = document.createElement('span');
    art.className = 'explore-art';
    art.innerHTML = artSvg(f.art);
    node.appendChild(art);

    return node;
  }

  /**
   * 初始化探索系统。
   *
   * @param {object} cfg 即 THEME.explore
   */
  function init(cfg) {
    if (!cfg) return;

    var finds = cfg.finds || [];

    // 调试快照。**只给 tools/check_explore.py 用**，生产环境它就是几个字符串，
    // 不产生任何副作用、不读不写任何存储。
    var dbg = global.__ELY_EXPLORE__ = {
      declared: [],
      found: [],
      unlocked: false,
      whisperShown: 0,
    };

    finds.forEach(function (f) {
      if (!f || !f.id) {
        console.warn('[ElysiaExplore] 这一条 find 没有 id，跳过：', f);
        return;
      }
      // ⚠ declared 收的是**配置里声明的** id，不是「成功渲染出来的」。
      //   两者的差集就是「配了但页面上找不到」——那是必须当场暴露的 bug，
      //   所以 check_explore.py 比的是集合，不是个数。
      dbg.declared.push(f.id);

      var anchor = document.querySelector(f.at);
      if (!anchor) {
        // ⚠ **找不到锚点就跳过，不抛。** 一次抛异常会让整页剩下的脚本集体停摆，
        //   而页面看上去还是好的 —— 那是本站最贵的一类 bug。
        //   代价是这个 find 永远找不到、探索度永远差一个；
        //   那正是 check_explore.py ① 号断言专门守的东西。
        console.warn('[ElysiaExplore] 锚点不存在，跳过 ' + f.id + '：' + f.at);
        return;
      }

      // 锚点要当定位上下文。**只在它原本是 static 时才动它** ——
      // 给一个已经有定位的元素再套 relative，会改变它内部绝对定位子元素的参照物。
      if (getComputedStyle(anchor).position === 'static') {
        anchor.classList.add('explore-anchor');
      }

      anchor.appendChild(buildFind(f));
    });
  }

  global.ElysiaExplore = {
    init: init,
    ART: ART,          // 探针页与测试要能枚举关键字
  };

})(window);
