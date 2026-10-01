/**
 * assets/games/mobius.js — 梅比乌斯的小游戏：贪吃蛇 · 实验体回收
 *
 * 呀，她这一页最后一块拼图♥ —— 也是「每位英桀一个**真正独立**的小游戏」
 * 这个契约的第一个实现，后面的 12 位照这个样子写。
 *
 * ── 契约（spec §4.5）─────────────────────────────────────────────────
 *     window.ElysiaGames.mobius = { title, hint, mount(host) };
 *
 *   `ElysiaBottom.mount({ game: THEME.game })` 会建出 `.bottom-game` 槽，
 *   再按 `THEME.game.module` 找到这里、调 `mount(host)`。
 *   模块**自给自足**：自己渲染进 host、自己抓 DOM、自己管状态。
 *
 * ── ⚠ 这个文件的原则 ─────────────────────────────────────────────────
 *
 *   · **玩法一行没改。** 这套蛇是从 `/mobius/` 的内联脚本里**原样搬**过来的 ——
 *     键盘 ↑↓←→ / WASD、触摸滑动、十字键 `#dpad` 三套操作、`localStorage` 最高分，
 *     全都保持原样。Task 12 只动了外壳与文案（spec §6.3 明说「不重写玩法」）。
 *
 *   · **保留现成的 `#gameOverlay`。** 没有另造一个遮罩 ——
 *     那是已经验证过的实现，动它就是把「已验证」换成「待验证」。
 *     本模块只负责「把它打开」。
 *
 *   · **自带的音效函数，不从页面借。** 页面里那个 `blip()` 服务的是
 *     小白鼠 / 蛇瞳 / 点击涟漪等等，**不只游戏在用** ——
 *     抽出来会把那些一起牵动。游戏要独立，就自己带一份。
 *
 *   · **和探索度完全解耦。** 玩多久、得多少分，都**不进** `__ELY_EXPLORE__`。
 *     两个系统各自干净（spec §6.3 ③）。
 *
 *   · **绝不抛异常。** 页面缺了 `#gameOverlay` 时只 `console.warn` ——
 *     一次未捕获的异常会让整页剩下的脚本集体停摆，而页面看上去还是好的。
 *
 * ── 文案上的纪律（spec §6.3 ②）───────────────────────────────────────
 *   吃到的叫「实验素材」、撞墙叫「实验失败」、分数叫「进化度」。
 *   ⚠ **结算面板上的文字是站点 UI 文案，不是她说的台词。**
 *     想放台词只能从材料包的余量里取 —— 而余量这一轮已经用完了，
 *     所以这里**一句新台词都没有**。
 */
(function (global) {
  'use strict';

  var CELL = 20;
  var N = 16;
  var BEST_KEY = 'mbSnakeBest';

  /* DOM 引用，mount 时抓一次。 */
  var el = {};

  /* 游戏状态。**模块级**，不放在 mount 里 —— 它是单实例的。 */
  var snake, dir, nextDir, food, timerHandle = null, playing = false, score = 0, best = 0;
  var bound = false;   // 遮罩上的监听只挂一次（mount 可能被重复调用）

  /* ── 音效 ────────────────────────────────────────────────────────────
     自给自足的一份合成音（三个振荡器就够，不加载任何音频文件）。
     ⚠ 和页面里那个 `blip()` 是**两份**，故意的 —— 见文件头。 */
  var audioCtx = null;
  function blip(freq, dur, type, vol) {
    try {
      if (!audioCtx) {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.4), t + dur);
      gain.gain.setValueAtTime(vol || 0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch (err) { /* 音频出问题不该影响玩 */ }
  }

  /* ── 玩法 ────────────────────────────────────────────────────────────
     以下这一段是**从 mobius/index.html 内联脚本原样搬过来的**，
     除了 `el.xxx` 取代了那些页面级变量之外，逻辑一字未改。 */

  function resetGame() {
    snake = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    if (el.score) el.score.textContent = '0';
    if (el.status) el.status.textContent = '';
    placeFood();
    drawGame();
  }

  function placeFood() {
    do {
      food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
    } while (snake.some(function (s) { return s.x === food.x && s.y === food.y; }));
  }

  function drawGame() {
    var ctx = el.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, 320, 320);
    ctx.strokeStyle = 'rgba(61,220,132,.06)';
    for (var g = 1; g < N; g++) {
      ctx.beginPath(); ctx.moveTo(g * CELL, 0); ctx.lineTo(g * CELL, 320); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, g * CELL); ctx.lineTo(320, g * CELL); ctx.stroke();
    }
    ctx.fillStyle = '#ffd166';
    ctx.save();
    ctx.translate(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2);
    ctx.rotate(Math.PI / 4);
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 10;
    ctx.fillRect(-CELL / 3, -CELL / 3, CELL * 2 / 3, CELL * 2 / 3);
    ctx.restore();
    snake.forEach(function (s, idx) {
      var t = idx / Math.max(1, snake.length - 1);
      ctx.fillStyle = idx === 0 ? '#7dff5a' : 'rgba(61,220,132,' + (0.95 - t * 0.55).toFixed(2) + ')';
      if (idx === 0) { ctx.shadowColor = '#3ddc84'; ctx.shadowBlur = 12; } else { ctx.shadowBlur = 0; }
      var pad = idx === 0 ? 1 : 2;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 5);
      } else {
        ctx.rect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2);
      }
      ctx.fill();
    });
    ctx.shadowBlur = 0;
    if (snake.length) {
      var head = snake[0];
      ctx.fillStyle = '#05130b';
      var ex = head.x * CELL + CELL / 2, ey = head.y * CELL + CELL / 2;
      var ox = dir.y !== 0 ? 4 : 0, oy = dir.x !== 0 ? 4 : 0;
      ctx.beginPath(); ctx.arc(ex + dir.x * 3 - ox, ey + dir.y * 3 - oy, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + dir.x * 3 + ox, ey + dir.y * 3 + oy, 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }

  function tick() {
    dir = nextDir;
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.x >= N || head.y < 0 || head.y >= N ||
        snake.some(function (s) { return s.x === head.x && s.y === head.y; })) {
      gameOver();
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      if (el.score) el.score.textContent = String(score);
      blip(660, 0.08, 'triangle', 0.2);
      placeFood();
      if (snake.length % 5 === 0 && gameTimer > 60) {
        clearInterval(timerHandle);
        gameTimer -= 8;
        timerHandle = setInterval(tick, gameTimer);
      }
    } else {
      snake.pop();
    }
    drawGame();
  }

  var gameTimer = 130;

  function startGame() {
    resetGame();
    playing = true;
    gameTimer = 130;
    if (el.msg) el.msg.textContent = '方向键 / WASD / 滑动屏幕，吞下实验素材——别撞墙哦。';
    if (el.start) el.start.textContent = '重新实验';
    clearInterval(timerHandle);
    timerHandle = setInterval(tick, gameTimer);
  }

  function gameOver() {
    playing = false;
    clearInterval(timerHandle);
    blip(140, 0.4, 'sawtooth', 0.25);
    // 撞墙 = **实验失败**（spec §6.3 ② 要的主题化）
    if (el.status) el.status.textContent = '实验失败';
    if (score > best) {
      best = score;
      try { global.localStorage.setItem(BEST_KEY, String(best)); } catch (err) { /* 隐私模式 */ }
      if (el.best) el.best.textContent = String(best);
      if (el.msg) el.msg.textContent = '「哦？新纪录……你的数据，很有研究价值。」';
    } else {
      if (el.msg) el.msg.textContent = '「哎呦，不小心玩坏了呢……但没关系，我还有你呀。」';
    }
  }

  function setDir(x, y) {
    if (!playing) return;
    if (x === -dir.x && y === -dir.y) return;
    nextDir = { x: x, y: y };
  }

  /* ── 外壳：打开 / 关闭那个现成的遮罩 ─────────────────────────────── */

  function open() {
    if (!el.overlay) return;
    el.overlay.classList.add('on');
    el.overlay.setAttribute('aria-hidden', 'false');
    // ⚠ 卡片上写着「开始实验」，那它就该**真的开始** ——
    //   只把遮罩打开、还要再点一次里面那个按钮的话，
    //   按钮的文案就是在说谎。（里面的按钮随之变成「重新实验」。）
    startGame();
  }

  function close() {
    if (!el.overlay) return;
    el.overlay.classList.remove('on');
    el.overlay.setAttribute('aria-hidden', 'true');
    playing = false;
    clearInterval(timerHandle);
  }

  /**
   * 抓 DOM 引用并把遮罩上的监听挂好。**只挂一次**（mount 可能被重复调用）。
   * @returns {boolean} 遮罩在不在
   */
  function bindOverlay() {
    el.overlay = document.getElementById('gameOverlay');
    if (!el.overlay) {
      // ⚠ warn，不抛。页面缺了遮罩只是没得玩，不该让整页停摆。
      console.warn('[ElysiaGames.mobius] 找不到 #gameOverlay —— 只剩一张游戏卡');
      return false;
    }
    if (bound) return true;
    bound = true;

    el.canvas = document.getElementById('snakeCanvas');
    el.ctx = el.canvas ? el.canvas.getContext('2d') : null;
    el.score = document.getElementById('gameScore');
    el.best = document.getElementById('gameBest');
    el.msg = document.getElementById('gameMsg');
    el.status = document.getElementById('gameStatus');
    el.start = document.getElementById('gameStart');
    el.close = document.getElementById('gameClose');

    try { best = parseInt(global.localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (err) { best = 0; }
    if (el.best) el.best.textContent = String(best);

    if (el.start) el.start.addEventListener('click', startGame);
    if (el.close) el.close.addEventListener('click', close);

    document.addEventListener('keydown', function (e) {
      if (!el.overlay.classList.contains('on')) return;
      var k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') { setDir(0, -1); e.preventDefault(); }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { setDir(0, 1); e.preventDefault(); }
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { setDir(-1, 0); e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { setDir(1, 0); e.preventDefault(); }
      else if (k === 'Escape') { close(); }
    });

    // 十字键（手机上「悬停能力为无 + 粗指针」时才显示，CSS 管这件事）
    var dpad = document.querySelectorAll('#dpad button');
    if (dpad.length === 4) {
      dpad[0].addEventListener('click', function () { setDir(0, -1); });
      dpad[1].addEventListener('click', function () { setDir(-1, 0); });
      dpad[2].addEventListener('click', function () { setDir(0, 1); });
      dpad[3].addEventListener('click', function () { setDir(1, 0); });
    }

    // 触摸滑动
    var touchStart = null;
    if (el.canvas) {
      el.canvas.addEventListener('touchstart', function (e) {
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }, { passive: true });
      el.canvas.addEventListener('touchend', function (e) {
        if (!touchStart) return;
        var dx = e.changedTouches[0].clientX - touchStart.x;
        var dy = e.changedTouches[0].clientY - touchStart.y;
        if (Math.abs(dx) > Math.abs(dy)) { setDir(dx > 0 ? 1 : -1, 0); }
        else { setDir(0, dy > 0 ? 1 : -1); }
        touchStart = null;
      }, { passive: true });
    }

    if (!snake) resetGame();
    return true;
  }

  /**
   * 把游戏卡渲染进下方区块的游戏槽。
   *
   * ⚠ 可以重复调用（`ElysiaBottom.mount` 重画时会再调一次）——
   *   卡片重建，但遮罩上的监听**不会重复挂**（`bound` 挡着）。
   *
   * @param {HTMLElement} host `.bottom-game` 槽
   */
  function mount(host) {
    if (!host) return;
    host.innerHTML = '';

    var card = document.createElement('div');
    card.className = 'game-card';

    var t = document.createElement('p');
    t.className = 'game-card-title';
    t.textContent = API.title;
    card.appendChild(t);

    var h = document.createElement('p');
    h.className = 'game-card-hint';
    h.textContent = API.hint;
    card.appendChild(h);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'game-card-start';
    btn.textContent = '开始实验';
    btn.addEventListener('click', open);
    card.appendChild(btn);

    host.appendChild(card);

    bindOverlay();
  }

  var API = {
    title: '贪吃蛇 · 实验体回收',
    hint: '收集实验素材，别撞墙。分数记作「进化度」。',
    mount: mount,
  };

  global.ElysiaGames = global.ElysiaGames || {};
  global.ElysiaGames.mobius = API;

})(window);
