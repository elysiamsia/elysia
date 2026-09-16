/**
 * 「今日之语」——按访客的本地日期，从语料池里取一句。
 *
 * 取句规则：以「本地日期的天数序数」对语料长度取模。
 *   - 同一天，所有访客看到同一句（不是随机，避免同一天不同人看到不同话）
 *   - 次日自动换
 *   - 必须用访客本地日期，不能用 UTC：UTC 会让中国用户在早上八点才换句
 *
 * 无 JS 时该区块为空——已用 aria-labelledby 保留语义，且不影响其它内容。
 */
(function () {
  var pool = (window.QUOTES && window.QUOTES.daily) || [];
  if (!pool.length) return;

  var el = document.getElementById('dailyQuote');
  if (!el) return;

  var now = new Date();
  // 取「本地年月日」再换算成天数序数：这样夏令时、闰年、时区都不会让它跳句
  var days = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  var text = pool[((days % pool.length) + pool.length) % pool.length];

  el.textContent = text;
})();
