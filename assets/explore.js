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

    /* ── 2026-10-01 为 `/sakura/` 添的 ──────────────────────────────────
       原来的 12 个是围绕梅比乌斯的实验室母题设计的（孢子 / 鳞 / 王座 / 小白鼠……）。
       樱的母题是**刀 / 樱瓣 / 鞘** —— 硬套那 12 个会显得是别人的页面。
       （这一层本来就设计成可扩展的，见文件开头「想加新的？往这儿添一条」。） */
    petal:      '<path d="M12 3.2c3.3 2.1 5.2 5.2 5.2 8.7 0 3.5-2.3 6.2-5.2 8.7-2.9-2.5-5.2-5.2-5.2-8.7 0-3.5 1.9-6.6 5.2-8.7z"/><path d="M12 8.6v9.4"/>',
    sheath:     '<rect x="3.2" y="10.4" width="14.4" height="3.4" rx="1.7"/><path d="M17.6 9.8l3.2 2.3-3.2 2.3z"/><path d="M6.6 10.4v3.4"/>',
    blade:      '<path d="M4.4 19.6L17.4 6.6"/><path d="M17.4 6.6L20 4"/><path d="M6.9 14.1l3 3"/>',
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

  /* ══ 互动动词 ═══════════════════════════════════════════════════════
     spec §5.1 定死的五个。**下面三个阈值也是定死的** ——
     改它们等于改所有页的手感，要改请先改 spec。 */
  var HOLD_MS = 600;      // hold：按住 ≥600ms
  var TRIPLE_MS = 1200;   // triple_tap：1.2 秒内的三次点击
  var MOVE_PX = 24;       // drag / slide：位移 ≥24px 才算「拖 / 划」，不足算「点」

  /* 模块状态。所有跨调用要记住的东西都在这儿，不散在闭包里。 */
  var S = {
    cfg: null,
    dbg: null,
    bubble: null,
    bubbleTimer: 0,
    countEl: null,
    unlockEl: null,
    whisperEl: null,
    whisperTimer: 0,
    whisperHideTimer: 0,
  };

  /* ══ 进度存储 ═══════════════════════════════════════════════════════
     localStorage['elysia:explore:<页 id>'] = { found: [...], unlocked: false }

     ⚠ **全部读写都要包 try/catch。** 隐私模式 / Safari ITP 下 localStorage
       会**直接抛异常**；一次没接住的异常会让整页剩下的脚本集体停摆，
       而页面看上去还是好的 —— 这是本站最贵的一类 bug（HANDOVER §十）。
       失败就静默降级为内存：刷新后从头开始，但至少页面是活的。
     ⚠ 已知取舍：**换设备会丢进度。这是有意接受的**（不做账号体系，spec §5.4）。 */
  var store = { found: [], unlocked: false };
  var memoryOnly = false;   // 一旦某次读写抛过，后面就不再尝试落盘

  function storageKey() {
    return 'elysia:explore:' + (S.cfg && S.cfg.pageId);
  }

  /** 读进度。任何异常都吞掉并降级为内存。 */
  function load() {
    try {
      var raw = window.localStorage.getItem(storageKey());
      if (!raw) return store;
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        if (Object.prototype.toString.call(o.found) === '[object Array]') {
          store.found = o.found.slice();
        }
        store.unlocked = !!o.unlocked;
      }
    } catch (e) {
      memoryOnly = true;
    }
    return store;
  }

  /** 写进度。写不进去只是降级，**不提示** —— 用户不该为浏览器的隐私设置负责。 */
  function save() {
    if (memoryOnly) return;
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify({
        found: store.found,
        unlocked: store.unlocked,
      }));
    } catch (e) {
      memoryOnly = true;
    }
  }

  /** 改一项并落盘。 */
  function mark(key, val) {
    store[key] = val;
    save();
  }

  /**
   * 已发现的**个数**。
   *
   * ⚠ 走**集合语义**：数的是 `declared` 里有多少个 id 在 `found` 里出现过。
   *   绝不能用 `found.length` —— 那种写法只要 `found` 里出现过一次重复
   *   （旧版本留下的数据、手工改过的存储、将来某次重构）就会永远差一个，
   *   而「差一个」是最难看见的 bug。
   */
  function discoveredCount() {
    return S.dbg.declared.filter(function (id) {
      return S.dbg.found.indexOf(id) >= 0;
    }).length;
  }

  /** 把「已发现 N / M」刷新成当前值。 */
  function refreshCount() {
    if (!S.countEl) return;
    S.countEl.textContent = '已发现 ' + discoveredCount() + ' / ' + S.dbg.declared.length;
  }

  /**
   * 渐进提示：找到 ≥ `hintAfterRatio`（默认一半）之后，
   * 给**还没找到的**那些加一点微光。
   *
   * 为什么要渐进、而不是一开始全亮：探索感靠的是「还有东西没被翻出来」。
   * 一上来就把所有可发现物指出来，这一层就退化成装饰了。
   * 但一直不给提示也不行 —— 有人翻了半天只找到一个就走了。
   *
   * ⚠ **提示只改明暗，绝不改位置。** 挪动一个 44×44 的热区，
   *   用户正要点它的时候它跑了 —— 那是误触，比不给提示还糟。
   */
  function refreshHints() {
    var total = S.dbg.declared.length;
    if (!total) return;

    var ratio = (S.cfg && typeof S.cfg.hintAfterRatio === 'number')
      ? S.cfg.hintAfterRatio
      : 0.5;
    var on = discoveredCount() / total >= ratio;

    var nodes = document.querySelectorAll('.explore-find');
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].getAttribute('data-find-id');
      var found = S.dbg.found.indexOf(id) >= 0;
      // ⚠ 用 add / remove，**不用 `classList.toggle(cls, force)`** ——
      //   两个参数的那个形态在老内核里会被当成单参数版本，
      //   于是「强制开/关」变成「来回翻」，而且不报错。
      if (on && !found) {
        nodes[i].classList.add('hinted');
      } else {
        nodes[i].classList.remove('hinted');
      }
    }
  }

  /**
   * 把探索度节点渲染到指定容器里。
   *
   * ⚠ Task 8 的下方区块会**再调用一次**这个方法，把节点搬进 `#bottom` ——
   *   所以这里必须能重复调用（先摘下来再挂上去），不能只 append 一次。
   *
   * @param {HTMLElement} [host] 不传就留在原处，只刷新文案
   * @returns {HTMLElement}
   */
  function mountCount(host) {
    if (!S.countEl) {
      S.countEl = document.createElement('p');
      S.countEl.className = 'explore-count';
      // 屏幕阅读器要能念出「又找到一个」—— 这是 aria-live 的标准用法
      S.countEl.setAttribute('role', 'status');
      S.countEl.setAttribute('aria-live', 'polite');
    }
    if (host && S.countEl.parentNode !== host) host.appendChild(S.countEl);
    // 解锁区跟着探索度走 —— 它们是同一块信息（「你找到多少了」）的两半
    if (host && S.unlockEl && S.unlockEl.parentNode !== host) host.appendChild(S.unlockEl);
    refreshCount();
    // ⚠ 补扫：调用方（ElysiaBottom.mount）刚重画完下方区块 ——
    //   既要把「锚点是后建的」那些挂上，也要把「刚被 innerHTML 抹掉的」重新挂上。
    //   见 ensureAttached 的注释 —— 这一步让「谁先谁后」「重画几次」都不再重要。
    ensureAttached();
    return S.countEl;
  }

  /* ══ 陪伴层（低语）═══════════════════════════════════════════════════
     「每次点击都有一点回应」—— 但**必须可预期**。

     ⚠ **这一节是全局约束的落点：绝对不做概率。**
       需求方 2026-10-01 明确不要「抽卡式不可预测」——
       可预期的陪伴才像「有人在那里」，概率会让它变成抽奖。
       规则是死的：冷却结束后的**第 3 次**点击说一句，台词**按顺序**推进。

     ⚠ 不做概率的代价是「有时候点了没反应」。**那是承诺的一部分，不是 bug。**
       说好第 3 次，就一定是第 3 次 —— 想让它更常说话，调的是冷却是次数，
       不是加一个随机数。 */
  var WHISPER_MS = 2500;      // 一句话在屏幕上停留多久
  var whisperLastAt = 0;      // 上一次「计数窗口」的时间戳
  var whisperClicks = 0;      // 冷却结束之后点了第几次
  var whisperIdx = 0;         // 下一句该说哪句（**按顺序**，不随机）

  /** 点击落在「本来就有反应」的东西上时，不叠一层低语 —— 那样会吵。 */
  function isInteractive(el) {
    if (!el || !el.closest) return false;
    if (el.closest('.explore-find')) return true;   // 它自己会弹台词气泡
    return !!el.closest('a, button, input, textarea, select, label,' +
                        ' [role="button"], [contenteditable="true"]');
  }

  /** 说下一句。台词**按数组顺序**推进，说完循环。 */
  function showWhisper() {
    var lines = (S.cfg && S.cfg.whisper) || [];
    if (!lines.length) return;

    if (!S.whisperEl) {
      S.whisperEl = document.createElement('div');
      S.whisperEl.className = 'explore-whisper';
      S.whisperEl.setAttribute('role', 'status');
      S.whisperEl.setAttribute('aria-live', 'polite');
      S.whisperEl.hidden = true;
      document.body.appendChild(S.whisperEl);
    }

    S.whisperEl.textContent = lines[whisperIdx % lines.length];
    whisperIdx = (whisperIdx + 1) % lines.length;

    S.whisperEl.hidden = false;
    S.dbg.whisperShown++;
    S.whisperEl.classList.add('visible');

    // ⚠ 两个定时器都要清掉再重设。只清一个的话，上一句的「淡出之后隐藏」
    //   会在新的一句正显示着的时候把它藏掉 —— 偶发、且很难复现。
    clearTimeout(S.whisperTimer);
    clearTimeout(S.whisperHideTimer);
    S.whisperTimer = setTimeout(function () {
      S.whisperEl.classList.remove('visible');   // 先淡出
      S.whisperHideTimer = setTimeout(function () {
        S.whisperEl.hidden = true;               // 淡出完了再真正藏起来
      }, 300);
    }, WHISPER_MS);
  }

  /** 页面上任何一次「落在非交互处」的点击都会走到这里。 */
  function onDocClick(e) {
    if (!S.cfg || !S.dbg) return;
    if (!(S.cfg.whisper && S.cfg.whisper.length)) return;
    if (isInteractive(e.target)) return;

    var now = Date.now();
    var cd = S.cfg.whisperCooldownMs != null ? S.cfg.whisperCooldownMs : 8000;

    if (now - whisperLastAt < cd) {
      // ⚠ 冷却期内**只把时间往后推，不计数**。
      //   所以「一直快速点」永远不会说话 —— 那是刷屏，不是陪伴。
      //   必须停一下，再点三次。
      whisperLastAt = now;
      return;
    }

    whisperClicks++;
    if (whisperClicks >= 3) {
      whisperClicks = 0;
      whisperLastAt = now;
      showWhisper();
    }
  }

  // 只挂一次（整页一个监听器）。挂 document 上，页面本体不参与。
  document.addEventListener('click', onDocClick);

  /**
   * 造出解锁区 —— **一进页面就建好，只是带 `hidden`**。
   *
   * ⚠ 不能等解锁了才创建节点：那样「还没解锁」和「解锁区坏了」在 DOM 上
   *   长得一模一样，断言分不出来。先建好、用 hidden 藏起来，
   *   「该出现时出现了没有」才是可测的。
   */
  function ensureUnlock() {
    if (S.unlockEl) return S.unlockEl;
    if (!S.cfg || !S.cfg.unlock) return null;

    var u = S.cfg.unlock;
    var el = document.createElement('section');
    el.className = 'explore-unlock';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;

    var h = document.createElement('h3');
    h.className = 'explore-unlock-title';
    h.textContent = u.title || '';
    el.appendChild(h);

    var p = document.createElement('p');
    p.className = 'explore-unlock-text';
    p.textContent = u.text || '';
    el.appendChild(p);

    if (u.src) {
      // 和气泡一样：出处**必须**跟着一起渲染出来
      var s = document.createElement('p');
      s.className = 'explore-unlock-src';
      s.textContent = '—— ' + u.src;
      el.appendChild(s);
    }

    S.unlockEl = el;
    return el;
  }

  /**
   * 看看是不是已经找齐了，是就把解锁区放出来。
   *
   * ⚠ **判据是「声明的每个 id 都在 found 里出现过」（集合包含），
   *   不是 `found.length` 等于声明数。**
   *   这两种写法在数据干净时结果一样，所以看不出区别 —— 但只要 found 里
   *   出现一次重复（旧版本留下的数据、手工改过的存储、将来某次重构），
   *   靠长度的那版就会**乱解锁**，而且不报错。
   *   反过来，「差一个」的 bug 也是靠这条抓的：12 个里漏一个就永远差一个。
   *   `tools/check_explore.py` 会**故意塞重复项**来守这条。
   */
  function checkUnlock() {
    if (!S.cfg || !S.cfg.unlock || S.dbg.unlocked) return;

    var complete = S.dbg.declared.every(function (id) {
      return S.dbg.found.indexOf(id) >= 0;
    });
    if (!complete) return;

    S.dbg.unlocked = true;
    store.unlocked = true;
    save();

    if (S.unlockEl) {
      S.unlockEl.hidden = false;
      // 只有**当场**解锁才播放出现动画。从存储里读回来的那次不播 ——
      // 它已经在上一趟出现过一次了，每次都重演就成了「每次进页面都在解锁」。
      S.unlockEl.classList.add('revealed');
    }
  }

  /**
   * 把一个可发现物真正挂到锚点上。
   * （抽出来是为了让 ensureAttached 能复用同一段逻辑。）
   */
  function attach(f, anchor) {
    // 锚点要当定位上下文。**只在它原本是 static 时才动它** ——
    // 给一个已经有定位的元素再套 relative，会改变它内部绝对定位子元素的参照物。
    if (getComputedStyle(anchor).position === 'static') {
      anchor.classList.add('explore-anchor');
    }
    var node = buildFind(f);
    if (S.dbg.found.indexOf(f.id) >= 0) node.classList.add('found');
    anchor.appendChild(node);
    bindGestures(node, f);
  }

  /* 所有声明过的 find。`ensureAttached` 每次拿它对着 DOM 扫一遍。 */
  var allFinds = [];

  /**
   * 把**还不在场的**可发现物挂上。
   *
   * ⚠ 这不是防御性代码，是两种真实存在的情况：
   *
   *   ① **锚点是后建的。** `THEME.explore` 里可以挂一个锚在**下方区块**上的
   *      可发现物 —— 而下方区块是 `ElysiaBottom.mount` 才建出来的，
   *      `ElysiaExplore.init` 跑的时候它还不存在。
   *   ② **锚点被重建了。** `ElysiaBottom.mount` 会 `sec.innerHTML = ''` 重画整块，
   *      挂在里面的可发现物**连同节点一起被抹掉** ——
   *      这时锚点是在的，所以「只记住当时找不到的」那种补扫救不回来。
   *
   *   所以这里**每次对着 DOM 实扫**：谁的锚点在、节点不在，就挂上。
   *   幂等，可重复调用。
   *
   *   `ElysiaBottom.mount` 会调 `mountCount`，那里顺手扫一次 ——
   *   于是**两行调用的先后顺序就不再重要了**，页面怎么写都对。
   */
  function ensureAttached() {
    allFinds.forEach(function (f) {
      // 已经在场就不动它（别把用户正在交互的那个节点换掉）
      if (document.querySelector('[data-find-id="' + f.id + '"]')) return;
      var anchor = document.querySelector(f.at);
      if (anchor) attach(f, anchor);
    });
    // ⚠ 重挂的节点是**新的**，只带了 `found` 类，没带 `hinted` ——
    //   而「找过半了要给提示」这件事是记在状态里、不是记在节点上的。
    //   不补这一步的话：用户已经找到 8/12，页面某处重挂一次区块，
    //   剩下那几个的提示就**悄悄消失了**，而且不报错。
    refreshHints();
  }

  /**
   * 命中一个可发现物：记进度 + 出气泡。
   *
   * ⚠ `found` 是**集合**，同一个 id 只记一次 —— 但**不代表可以靠长度判齐**：
   *   判齐永远要写成「declared 里每个 id 都在 found 里出现过」，
   *   因为存进去的东西可能是别的版本留下的、可能带重复。
   *   `tools/check_explore.py` 会**故意往 found 里塞一个重复项**来守这一条。
   *
   * @param {object} find
   * @param {HTMLElement} node
   */
  function markFound(find, node) {
    node.classList.add('found');
    if (S.dbg.found.indexOf(find.id) < 0) {
      S.dbg.found.push(find.id);
      save();
      refreshCount();
      // 同步判一次 —— 「触发最后一个的**同一个动作之后**就解锁」，
      // 不能让用户等到下一次交互才看见它
      checkUnlock();
      refreshHints();
    }
    // 已经找到过的再碰一下，也**照样**说话 —— 它现在是「陪着你」的东西，
    // 不再是「还没发现的秘密」。（只是不再改进度。）
    showBubble(find, node);
  }

  /**
   * 这一次抬手算不算「点一下」。
   * 位移够小、时间够短 —— 两条都要满足，否则「按住不动再挪一点」会被算成点击。
   */
  function isTap(dx, dy, dt) {
    return Math.sqrt(dx * dx + dy * dy) < MOVE_PX && dt < HOLD_MS;
  }

  /* 气泡停留多久。够读完一句台词，又不至于挡着后面的东西。 */
  var BUBBLE_MS = 4200;

  /**
   * 弹一句台词。
   *
   * ⚠ 气泡挂在 `<body>` 上、用 **`position:fixed`** —— 不是挂在可发现物里面。
   *   挂进锚点的话，锚点一旦是 `overflow:hidden`（很多区段都是），
   *   气泡就被裁掉了：「存在着但看不见」，正是本系统最要防的那类失败。
   *
   * @param {object} find
   * @param {HTMLElement} node
   */
  function showBubble(find, node) {
    if (!find.line) return;

    if (!S.bubble) {
      S.bubble = document.createElement('div');
      S.bubble.className = 'explore-bubble';
      S.bubble.setAttribute('role', 'status');
      S.bubble.setAttribute('aria-live', 'polite');
      S.bubble.innerHTML = '<p class="explore-bubble-line"></p>' +
                           '<p class="explore-bubble-src"></p>';
      document.body.appendChild(S.bubble);
    }

    S.bubble.querySelector('.explore-bubble-line').textContent = find.line;
    var srcEl = S.bubble.querySelector('.explore-bubble-src');
    // 出处和台词一起渲染 —— 「绝不编造」这条纪律要**看得见**才有约束力
    srcEl.textContent = find.src ? '—— ' + find.src : '';
    srcEl.hidden = !find.src;

    var r = node.getBoundingClientRect();
    S.bubble.classList.add('visible');

    // 先显示再量尺寸 —— display:none 的元素量出来是 0
    var bw = S.bubble.offsetWidth, bh = S.bubble.offsetHeight;
    var x = r.left + r.width / 2 - bw / 2;
    var y = r.top - bh - 14;
    if (y < 8) y = r.bottom + 14;                 // 上面放不下就翻到下面
    // 贴边时往里收，别让气泡跑出屏幕（手机上尤其容易）
    x = Math.max(10, Math.min(x, window.innerWidth - bw - 10));
    y = Math.max(10, Math.min(y, window.innerHeight - bh - 10));
    S.bubble.style.left = x + 'px';
    S.bubble.style.top = y + 'px';

    clearTimeout(S.bubbleTimer);
    S.bubbleTimer = setTimeout(function () {
      S.bubble.classList.remove('visible');
    }, BUBBLE_MS);
  }

  /**
   * 给一个可发现物绑上它那一种动词的判定。
   *
   * ⚠ 只认 `pointer*` 这一个事件族，**不分别写 mouse / touch** ——
   *   pointer 事件在两端的语义是一致的，写两套迟早会分叉。
   *   `pointercancel` 尤其重要：手机上纵向滑页面时，浏览器会接管这一笔并
   *   发出 pointercancel —— 收到它就**收尾但不判定**，用户想滑页面，
   *   不该顺手触发一个可发现物。
   *
   * @param {HTMLElement} node
   * @param {object} find
   */
  function bindGestures(node, find) {
    var verb = find.verb || 'click';
    var down = null;   // 当前这一笔按压
    var taps = [];     // triple_tap 的滑动窗口

    function onDown(e) {
      if (e.button) return;   // 只认主指针（左键 / 触摸 / 笔），右键中键不算
      if (down) return;       // 上一笔还没收尾

      down = { x: e.clientX, y: e.clientY, t: Date.now(), held: false, timer: 0 };
      node.classList.add('dragging');

      if (verb === 'hold') {
        // ⚠ 在**按住期间**就触发，不是等松手 ——「按住 ≥600ms」说的就是这件事，
        //   而且等到松手才回应，人会以为没按中，于是再按一次。
        down.timer = setTimeout(function () {
          if (!down) return;
          down.held = true;
          markFound(find, node);
        }, HOLD_MS);
      }

      // ⚠ 监听挂在 **window** 上，不是挂在节点上。
      //   拖到一半指针跑出这个 44×44 的小方块是常态；挂在节点上就收不到
      //   pointerup，手势永远收不了尾，这个可发现物从此就废了。
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    }

    function detach() {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (down) clearTimeout(down.timer);
      down = null;
      node.classList.remove('dragging');
    }

    function onCancel() {
      // 浏览器把这一笔接管去滚页面了 —— 收尾，不判定。
      detach();
    }

    function onUp(e) {
      if (!down) return;
      var g = down;
      var held = g.held;
      var dx = e.clientX - g.x, dy = e.clientY - g.y, dt = Date.now() - g.t;
      detach();

      if (held) return;   // hold 已经在定时器里触发过了，别再判一次

      if (verb === 'triple_tap') {
        if (!isTap(dx, dy, dt)) return;
        var now = Date.now();
        taps = taps.filter(function (t) { return now - t < TRIPLE_MS; });
        taps.push(now);
        if (taps.length >= 3) { taps = []; markFound(find, node); }
        return;
      }
      if (verb === 'click') {
        if (isTap(dx, dy, dt)) markFound(find, node);
        return;
      }
      if (verb === 'drag') {
        if (Math.sqrt(dx * dx + dy * dy) >= MOVE_PX) markFound(find, node);
        return;
      }
      if (verb === 'slide') {
        // ⚠ **必须带方向判据**（横向位移要大过纵向）。
        //   只看「位移 ≥24px」的话，用户纵向滑页面的手势会被当成「划过」，
        //   一路滑下去就触发一串可发现物 —— 本系统最败好感的一种 bug。
        //   `tools/check_explore.py` 有一条反向断言专门守它。
        if (Math.abs(dx) >= MOVE_PX && Math.abs(dx) > Math.abs(dy)) markFound(find, node);
        return;
      }
      // 不认识的 verb：什么也不做（init 时已经 warn 过了）
    }

    node.addEventListener('pointerdown', onDown);
    node.addEventListener('keydown', function (e) {
      // ⚠ 键盘用户做不出 hold / drag / slide —— 那是手势。
      //   所以 Enter / Space **直接触发**，五种动词一视同仁（spec §5.6：键盘可达）。
      //   不给这条兜底，键盘用户就永远只能找到五分之一的东西。
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        markFound(find, node);
      }
    });
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
    S.cfg = cfg;
    S.dbg = dbg;

    if (!cfg.pageId) {
      // ⚠ 缺 pageId 就没法分页存进度 —— 只能活在这一次浏览里。
      //   这是**用它的人**该修的事，所以要说出来；但仍然继续跑，不抛。
      console.warn('[ElysiaExplore] THEME.explore 缺 pageId —— 进度不会落盘');
    }

    // ⚠ **先把进度读回来，再建节点。** 已经找到过的东西一进页面就该是
    //   「已找到」的样子；等建完再补类名的话，用户会看见它们闪一下。
    load();
    dbg.found = store.found;
    dbg.unlocked = !!store.unlocked;

    finds.forEach(function (f) {
      if (!f || !f.id) {
        console.warn('[ElysiaExplore] 这一条 find 没有 id，跳过：', f);
        return;
      }
      // ⚠ declared 收的是**配置里声明的** id，不是「成功渲染出来的」。
      //   两者的差集就是「配了但页面上找不到」——那是必须当场暴露的 bug，
      //   所以 check_explore.py 比的是集合，不是个数。
      dbg.declared.push(f.id);
      // 记进总表：ensureAttached 每次拿它对着 DOM 实扫，
      // 这样「锚点后建」和「节点被重建掉了」两种情况都能救回来
      allFinds.push(f);

      var anchor = document.querySelector(f.at);
      if (!anchor) {
        // ⚠ **找不到锚点就先放着，不抛。** 一次抛异常会让整页剩下的脚本集体停摆，
        //   而页面看上去还是好的 —— 那是本站最贵的一类 bug。
        //   记进 allFinds，等 ensureAttached 补扫（锚点可能是后建的）。
        console.warn('[ElysiaExplore] 锚点还不存在，等补扫 ' + f.id + '：' + f.at);
      } else {
        attach(f, anchor);
      }
    });

    // 走一遍补扫：把上面没挂上的（以及将来可能被重建的）统一交给它
    ensureAttached();

    // 解锁区**一进页面就建好**（带 hidden），见 ensureUnlock 的注释
    ensureUnlock();

    // 探索度先挂在 body 上。Task 8 的下方区块会调 mountCount 把它搬进 #bottom。
    mountCount(document.body);

    if (dbg.unlocked) {
      // 上一趟就解锁过了 —— 直接放出来，**不播出现动画**（它只出现这一次）
      if (S.unlockEl) S.unlockEl.hidden = false;
    } else {
      // 兜底：万一存储里 found 齐了、unlocked 却是 false（旧版本数据 / 手工改过），
      // 这次进来也得把该给的东西给出去
      checkUnlock();
    }

    // 从存储里读回来的进度也要算进提示比例 —— 找了一半的人刷新一下页面，
    // 提示不该消失
    refreshHints();
  }

  global.ElysiaExplore = {
    init: init,
    ART: ART,                 // 探针页与测试要能枚举关键字
    mountCount: mountCount,   // 下方区块把探索度搬过去用（Task 8）
    ensureAttached: ensureAttached, // 补扫没挂上的可发现物（见它的注释）
    // 这一页的进度存在哪个键下。给测试用 —— 断言不该写死页名。
    pageId: function () { return S.cfg && S.cfg.pageId; },
    load: load,
    save: save,
    mark: mark,
  };

})(window);
