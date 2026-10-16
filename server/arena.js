/* server/arena.js —— 逐火十三英桀 · 赛博斗蛐蛐（站点侧后端）
 *
 * 数据真源：material/逐火英桀擂台/data/（**不进静态目录**，尤其 replays.json —— 那是全部 91 场结果）
 *   · schedule_odds.csv  赛程 + 基础赔率
 *   · replays.json       91 场完整战报（含 winner / draw）—— **只在结算后发**（防剧透）
 *   · characters.json    13 人属性与技能
 *   · economy.json       经济规则唯一真源（**不硬编码数值**）
 *
 * 身份：匿名玩家不连服务器（前端本地存）；邮箱注册才进服务器、才可能上榜。
 *       密码用 scrypt 哈希 + 随机盐；会话用随机 token（存在玩家记录里，前端放 localStorage）。
 *
 * 结算：parimutuel —— 每 1 金币赔付 = 总池 × (1 − 抽水率) / 胜方池；平局全额退本金。
 *       胜者取 replays.json 的 winner（meta 明确警告：网站结算必须与它一致）。
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA = process.env.ARENA_DATA || path.join(__dirname, 'data');

function readCsv(p) {
  const t = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  const lines = t.split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split(',');
  return lines.map((l) => {
    const cells = l.split(',');
    const o = {};
    head.forEach((h, i) => { o[h] = cells[i]; });
    return o;
  });
}
let CACHE = null;
function loadData() {
  if (CACHE) return CACHE;
  const odds = readCsv(path.join(DATA, 'schedule_odds.csv'));
  const reps = JSON.parse(fs.readFileSync(path.join(DATA, 'replays.json'), 'utf8'));
  const chars = JSON.parse(fs.readFileSync(path.join(DATA, 'characters.json'), 'utf8'));
  const econ = JSON.parse(fs.readFileSync(path.join(DATA, 'economy.json'), 'utf8'));
  const replayById = {};
  for (const m of reps.matches) replayById[m.match_id] = m;
  const matches = odds.map((r) => {
    const id = Number(r.match_id);
    const rep = replayById[id] || {};
    return {
      id: id, day: Number(r.day), time: r.time, tag: r.tag || '',
      left: { key: r.left, name: r.left_name }, right: { key: r.right, name: r.right_name },
      leftOdds: Number(r.left_odds), rightOdds: Number(r.right_odds),
      winner: rep.winner || null, draw: !!rep.draw,
    };
  });
  CACHE = { matches: matches, replayById: replayById, heroes: chars.heroes, econ: econ };
  return CACHE;
}

/* ── 上海时间 ───────────────────────────────────────────────── */
const DAY_MS = 86400000;
function shanghaiNow() { return new Date(Date.now() + 8 * 3600 * 1000); }
function dayKey(d) { const x = d || shanghaiNow(); return x.toISOString().slice(0, 10); }
function seasonStart() { return process.env.SEASON_START || '2026-10-17'; }
/** 某场比赛的真实 UTC 毫秒时刻（day 从 1 起，time 形如 12:00，按上海时间） */
function matchTime(m) {
  const base = Date.parse(seasonStart() + 'T00:00:00Z') - 8 * 3600 * 1000;   // 上海当日 00:00 对应的 UTC
  const [hh, mm] = String(m.time).split(':').map(Number);
  return base + (m.day - 1) * DAY_MS + (hh * 3600 + mm * 60) * 1000;
}
function rakeRate(pool) {
  const sched = (loadData().econ.rake && loadData().econ.rake.schedule) || [];
  for (const s of sched) if (s.pool_lt === null || pool < s.pool_lt) return s.rate;
  return 0.08;
}
function poolOf(db, id) {
  let l = 0, r = 0;
  for (const b of db.bets) if (b.matchId === id) { if (b.side === 'left') l += b.amount; else r += b.amount; }
  return { left: l, right: r, total: l + r };
}
function displayOdds(m, pool) {
  const econ = loadData().econ.odds;
  const w = Math.min(1, pool.total / 20000);
  const clamp = (v) => Math.max(econ.clamp[0], Math.min(econ.clamp[1], v));
  const mk = (side) => {
    const base = side === 'left' ? m.leftOdds : m.rightOdds;
    const sp = side === 'left' ? pool.left : pool.right;
    const poolOdds = sp > 0 ? (pool.total * (1 - rakeRate(pool.total))) / sp : base;
    return clamp(w * poolOdds + (1 - w) * base);
  };
  return { left: Math.round(mk('left') * 100) / 100, right: Math.round(mk('right') * 100) / 100 };
}

/* ── 工具 ───────────────────────────────────────────────────── */
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
function hashPw(pw, salt) { return crypto.scryptSync(String(pw), salt, 32).toString('hex'); }
function token() { return crypto.randomBytes(24).toString('hex'); }
function send(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(s);
}
function body(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 16384) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}
function player(db, req) {
  const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!t) return null;
  return db.players.find((p) => p.token === t) || null;
}
function publicPlayer(p) {
  return p ? { email: p.email, nick: p.nick, coins: p.coins, bets: p.bets || 0, hits: p.hits || 0, streak: p.streak || 0, lastSignin: p.lastSignin || null } : null;
}

/* ── 结算（幂等；由 cron 与每次请求时调用）───────────────────── */
function settleDue(db, save, now) {
  const D = loadData();
  let n = 0;
  for (const m of D.matches) {
    if (db.settled[m.id]) continue;
    const t = matchTime(m);
    if (now < t + 60000) continue;                 // 开赛 1 分钟后才结算（给回放留一点缓冲）
    const pool = poolOf(db, m.id);
    const rep = D.replayById[m.id] || {};
    for (const b of db.bets) {
      if (b.matchId !== m.id || b.settled) continue;
      b.settled = true;
      const p = db.players.find((x) => x.id === b.playerId);
      if (!p) continue;
      if (rep.draw) { p.coins += b.amount; continue; }          // 平局：全额退本金
      const winSide = rep.winner && rep.winner === m.left.name ? 'left' : 'right';
      if (b.side !== winSide) continue;                          // 押负全损
      const winPool = winSide === 'left' ? pool.left : pool.right;
      const payout = winPool > 0 ? (b.amount * pool.total * (1 - rakeRate(pool.total))) / winPool : b.amount;
      p.coins += Math.round(payout);
      p.hits = (p.hits || 0) + 1;
    }
    db.settled[m.id] = { winner: rep.winner || null, draw: !!rep.draw, pool: pool.total, at: dayKey() };
    n++;
  }
  if (n) save(db);
  return n;
}

/** 排行榜：只用服务器侧数据（匿名玩家天然不在其中） */
function leaderboard(db) {
  const min = ((loadData().econ.sinks && loadData().econ.sinks.leaderboard && loadData().econ.sinks.leaderboard.qualify) || {}).min_matches || 20;
  return db.players
    .filter((p) => (p.bets || 0) >= min)
    .sort((a, b) => (b.coins - a.coins) || ((b.bets || 0) - (a.bets || 0)) || ((b.hits || 0) / (b.bets || 1) - (a.hits || 0) / (a.bets || 1)) || String(a.nick).localeCompare(String(b.nick)))
    .slice(0, 100)
    .map((p, i) => ({ rank: i + 1, nick: p.nick, coins: p.coins, bets: p.bets || 0, hits: p.hits || 0, rate: p.bets ? Math.round((p.hits || 0) / p.bets * 1000) / 10 : 0 }));
}

/* ── 路由 ───────────────────────────────────────────────────── */
async function arena(req, res, url, db, save) {
  const p = url.pathname;
  if (!p.startsWith('/api/')) return false;
  const D = loadData();
  settleDue(db, save, Date.now());

  if (p === '/api/register' && req.method === 'POST') {
    const b = await body(req);
    if (!b || typeof b.email !== 'string' || typeof b.password !== 'string') return send(res, 400, { error: 'bad_request' }), true;
    const email = b.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'bad_email' }), true;
    if (b.password.length < 6) return send(res, 400, { error: 'weak_password' }), true;
    if (db.players.some((x) => x.email === email)) return send(res, 409, { error: 'email_taken' }), true;
    const salt = crypto.randomBytes(16).toString('hex');
    const pl = { id: db.nextPlayer++, email: email, nick: String(b.nick || email.split('@')[0]).slice(0, 16), salt: salt, pw: hashPw(b.password, salt), coins: (D.econ.coin.initial_balance || 0), bets: 0, hits: 0, streak: 0, lastSignin: null, token: token(), created: dayKey() };
    db.players.push(pl); save(db);
    return send(res, 200, { ok: true, token: pl.token, player: publicPlayer(pl) }), true;
  }
  if (p === '/api/login' && req.method === 'POST') {
    const b = await body(req);
    const email = String((b && b.email) || '').trim().toLowerCase();
    const pl = db.players.find((x) => x.email === email);
    if (!pl || hashPw(String((b && b.password) || ''), pl.salt) !== pl.pw) return send(res, 401, { error: 'bad_credentials' }), true;
    pl.token = token(); save(db);
    return send(res, 200, { ok: true, token: pl.token, player: publicPlayer(pl) }), true;
  }
  if (p === '/api/me' && req.method === 'GET') {
    const pl = player(db, req);
    return send(res, 200, { player: publicPlayer(pl) }), true;
  }
  if (p === '/api/signin' && req.method === 'POST') {
    const pl = player(db, req);
    if (!pl) return send(res, 401, { error: 'need_login' }), true;
    const today = dayKey();
    if (pl.lastSignin === today) return send(res, 200, { ok: true, already: true, player: publicPlayer(pl) }), true;
    const y = dayKey(new Date(Date.now() + 8 * 3600 * 1000 - DAY_MS));
    pl.streak = pl.lastSignin === y ? (pl.streak || 0) + 1 : 1;
    const c = D.econ.coin;
    const gain = c.signin_base + c.streak_bonus_per_day * Math.min(pl.streak, c.streak_bonus_cap_days);
    pl.coins += gain; pl.lastSignin = today; save(db);
    return send(res, 200, { ok: true, gain: gain, player: publicPlayer(pl) }), true;
  }
  if (p === '/api/schedule' && req.method === 'GET') {
    const day = Number(url.searchParams.get('day') || 0);
    const list = D.matches.filter((m) => !day || m.day === day);
    const now = Date.now();
    return send(res, 200, {
      seasonStart: seasonStart(),
      signin: D.econ.coin,
      matches: list.map((m) => {
        const pool = poolOf(db, m.id);
        const t = matchTime(m);
        return { id: m.id, day: m.day, time: m.time, tag: m.tag, left: m.left, right: m.right,
          at: t, open: now >= t - DAY_MS, closed: now >= t - 5 * 60000, settled: !!db.settled[m.id],
          baseOdds: { left: m.leftOdds, right: m.rightOdds }, odds: displayOdds(m, pool), pool: pool.total };
      }),
    }), true;
  }
  if (p === '/api/bet' && req.method === 'POST') {
    const pl = player(db, req);
    if (!pl) return send(res, 401, { error: 'need_login' }), true;
    const b = await body(req);
    const id = Number(b && b.matchId), side = String((b && b.side) || ''), amount = Math.floor(Number((b && b.amount) || 0));
    const m = D.matches.find((x) => x.id === id);
    if (!m) return send(res, 404, { error: 'no_match' }), true;
    if (side !== 'left' && side !== 'right') return send(res, 400, { error: 'bad_side' }), true;
    const min = D.econ.bet.min;
    if (!Number.isFinite(amount) || amount < min) return send(res, 400, { error: 'below_min', min: min }), true;
    const now = Date.now(), t = matchTime(m);
    if (now >= t - D.econ.bet.window.close_before_match_min * 60000) return send(res, 400, { error: 'closed' }), true;
    if (pl.coins < amount) return send(res, 400, { error: 'no_coins', coins: pl.coins }), true;
    pl.coins -= amount; pl.bets = (pl.bets || 0) + 1;
    db.bets.push({ id: db.nextBet++, playerId: pl.id, matchId: id, side: side, amount: amount, at: now, settled: false });
    save(db);
    return send(res, 200, { ok: true, player: publicPlayer(pl), pool: poolOf(db, id) }), true;
  }
  if (p.startsWith('/api/replay/') && req.method === 'GET') {
    const id = Number(p.split('/').pop());
    if (!db.settled[id]) return send(res, 403, { error: 'not_settled' }), true;   // ⚠ 防剧透：只在结算后给
    const m = D.replayById[id];
    if (!m) return send(res, 404, { error: 'no_replay' }), true;
    return send(res, 200, { ok: true, match: m }), true;
  }
  if (p === '/api/leaderboard' && req.method === 'GET') {
    const lb = leaderboard(db);
    return send(res, 200, { ok: true, config: (loadData().econ.sinks || {}).leaderboard || {}, list: lb }), true;
  }
  if (p === '/api/heroes' && req.method === 'GET') {
    return send(res, 200, { ok: true, heroes: D.heroes }), true;
  }
  return false;
}

module.exports = { arena, settleDue, loadData };
