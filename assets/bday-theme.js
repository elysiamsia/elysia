/* assets/bday-theme.js — 11.11 当天换装（2026）
 * 只做一件事：那天给 <html> 挂 data-bday="on"；样式全在 assets/bday-theme.css。
 * ⚠ 预览：?bday=1 强制穿上、?bday=0 强制脱掉（同一时刻做前后对照截图用）。
 * ⚠ 纯本地日期判断，零网络请求；不是那天就什么都不做。
 */
(function () {
  'use strict';
  var m = location.search.match(/[?&]bday(?:=(\d))?/);
  var force = m ? m[1] !== '0' : null;
  var d = new Date();
  var today = d.getMonth() === 10 && d.getDate() === 11;   // 11 月 11 日
  var on = force === null ? today : force;
  if (on) document.documentElement.setAttribute('data-bday', 'on');
})();
