/* assets/preheat.js — 11.11 预热条（2026）
 * 全站一条，落在页脚上方：左边一朵朵点亮的花环，右边今天那一句。
 * ⚠ 只在 11-04 ~ 11-11 之间出现；别的时候连 DOM 都不建。
 * ⚠ 纯本地计算（new Date），零网络请求。
 * ⚠ 预览：?preheat=11-06 强制看成那一天的样子（截图 / 回归用）。
 */
(function () {
  'use strict';
  var D = window.ELYSIA_PREHEAT;
  if (!D) return;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { return pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  var now = new Date();
  var today = dayKey(now);
  var m = location.search.match(/[?&]preheat=(\d{2})-(\d{2})/);
  var forced = !!m;
  if (forced) today = m[1] + '-' + m[2];

  var target = new Date(now.getFullYear(), D.month - 1, D.day);
  // 强制预览时，天数和文案要一起跟着预览日期走，否则会「11-06 的文案配 11-04 的花环」
  var midnight = forced
    ? new Date(now.getFullYear(), parseInt(m[1], 10) - 1, parseInt(m[2], 10))
    : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var daysLeft = Math.round((target - midnight) / 86400000);
  var onDay = today === pad(D.month) + '-' + pad(D.day);
  var text = D.lines[today];
  if (onDay) text = D.onDay;
  if (!text && !forced) return;          // 不在窗口里：什么都不做

  var TOTAL = 7;
  var lit = onDay ? TOTAL : TOTAL - daysLeft + 1;   // 11-04 → 1 朵
  if (!(lit >= 1)) lit = 1;
  if (lit > TOTAL) lit = TOTAL;

  var NS = 'http://www.w3.org/2000/svg';
  var wrap = document.createElement('div');
  wrap.className = 'preheat';
  wrap.id = 'preheat';
  wrap.setAttribute('role', 'note');
  wrap.setAttribute('aria-label', '距离爱莉希雅的生日');

  var garland = document.createElement('div');
  garland.className = 'preheat-garland';
  garland.setAttribute('aria-hidden', 'true');
  for (var i = 0; i < TOTAL; i++) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'preheat-bloom' + (i < lit ? ' is-lit' : '') +
      (onDay && i === TOTAL - 1 ? ' is-today' : '') +
      (!onDay && i === lit - 1 ? ' is-today' : ''));
    for (var k = 0; k < 5; k++) {
      var petal = document.createElementNS(NS, 'ellipse');
      petal.setAttribute('cx', '12');
      petal.setAttribute('cy', '7');
      petal.setAttribute('rx', '3.1');
      petal.setAttribute('ry', '5');
      petal.setAttribute('transform', 'rotate(' + (k * 72) + ' 12 12)');
      petal.setAttribute('class', 'preheat-petal');
      svg.appendChild(petal);
    }
    var core = document.createElementNS(NS, 'circle');
    core.setAttribute('cx', '12');
    core.setAttribute('cy', '12');
    core.setAttribute('r', '2.1');
    core.setAttribute('class', 'preheat-core');
    svg.appendChild(core);
    garland.appendChild(svg);
  }

  var copy = document.createElement('p');
  copy.className = 'preheat-copy';
  copy.textContent = text;
  var mark = document.createElement('span');
  mark.className = 'preheat-mark';
  mark.textContent = '11.11';
  copy.appendChild(mark);

  wrap.appendChild(garland);
  wrap.appendChild(copy);

  function place() {
    var foot = document.querySelector('body > footer');
    if (foot && foot.parentNode) foot.parentNode.insertBefore(wrap, foot);
    else document.body.appendChild(wrap);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
  else place();
})();
