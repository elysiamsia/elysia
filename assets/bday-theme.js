/* assets/bday-theme.js — 11.11 换装与留档入口（2026）
 * 只做一件事：按日期给 <html> 挂 data-bday，样式全在 assets/bday-theme.css。
 *   11-11        → "on"     当天换装
 *   11-12 之后    → "after"  换装脱掉，首页多一个「11.11 · 那天」的入口
 * ⚠ 预览：?bday=1 强制穿上、?bday=0 强制脱掉、?bday=after 强制看留档态。
 * ⚠ 纯本地日期判断，零网络请求；其余日子什么都不做。
 */
(function () {
  'use strict';
  var m = location.search.match(/[?&]bday(?:=([a-z0-9]+))?/i);
  var forced = m ? (m[1] || 'on').toLowerCase() : null;
  var d = new Date();
  var state = 'off';
  if (d.getMonth() === 10) {                 // 11 月
    if (d.getDate() === 11) state = 'on';
    else if (d.getDate() > 11) state = 'after';
  }
  if (forced === '0' || forced === 'off') state = 'off';
  else if (forced === 'after') state = 'after';
  else if (forced) state = 'on';
  if (state !== 'off') document.documentElement.setAttribute('data-bday', state);
})();
