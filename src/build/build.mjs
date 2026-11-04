#!/usr/bin/env node
/**
 * src/build/build.mjs —— 构建入口
 *
 * 本任务（Task 1）只做「空转构建」：把仓库现有文件按白名单原样拷进 public/。
 * 等 Task 9 起，这里再加「有模板则渲染」的分支；在此之前 rendered 恒为空。
 *
 * 两个模式（审阅意见 #1 的修正：原来把两种校验混在一条路径上，自相矛盾）：
 *   node src/build/build.mjs               拷贝 + 源↔产物逐文件哈希自校验
 *   node src/build/build.mjs --verify-only 只校验现有 public/，不拷贝
 *     ← 「改一个字节应当报错」只在这个模式上有意义：拷贝模式会把改动覆盖掉
 *
 * 白名单：.github/workflows/static.yml 里的 KEEP_FILES / KEEP_DIRS 是**唯一真源**。
 *   解析失败或数量异常一律硬失败 —— 绝不允许正则失配静默变成空名单（那正是 404 的根因）。
 *
 * 可重现：目录遍历按名字排序、不写入任何时间戳；同一 commit 两次构建产出的内容摘要必须相同。
 * 编码：源文件按字节原样复制，不做任何转换（转义/换行都留给后续渲染阶段）。
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import nunjucks from 'nunjucks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public');
const DEFAULT_HOST = 'elysiad.top';   // 站点默认域；SITE_ORIGIN 可覆盖（GitHub Pages 那份用 elysia.biz）
// SITE_ORIGIN 的 host 与默认域不同时，构建末尾会整树改写文本文件里的域名。
// 自校验必须按「改写后」的字节比，否则 build 之后的 verify-only 会把每条被改写的文件报成不一致。
const REWRITE_HOST = (() => {
  const o = process.env.SITE_ORIGIN;
  if (!o) return null;
  const h = new URL(o).host;
  return h === DEFAULT_HOST ? null : h;
})();
const TEXT_EXT = new Set(['.html', '.xml', '.txt', '.json', '.js', '.css', '.webmanifest']);
const WF = path.join(ROOT, '.github', 'workflows', 'static.yml');
const VERIFY_ONLY = process.argv.includes('--verify-only');
const STRICT_TEMPLATES = process.argv.includes('--strict-templates');
const SINGLE = (() => { const i = process.argv.indexOf('--single'); return i >= 0 ? process.argv[i + 1] : null; })();
const TEMPLATES = path.join(ROOT, 'templates');
const PAGES_DIR = path.join(TEMPLATES, 'pages');
const CONTENT = path.join(ROOT, 'content', 'characters');
// 非角色页（404 引路页这种）的数据放在 content/pages/，同样走 base.njk + 自己的 page.css；
// 靠 outPath 决定落在 public/ 的哪个位置（404 → public/404.html，而不是 404/index.html）。
const CONTENT_PAGES = path.join(ROOT, 'content', 'pages');
const THEME_KEYS = ['explore', 'game', 'endingStars', 'quotes', 'typewriter'];
const rendered = new Set();

/** 有模板零件的页参与渲染；否则原样拷贝（逐页迁移的增量机制） */
function renderablePages() {
  const out = [];
  for (const rel of fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.page.body.html'))) {
    const key = rel.replace('.page.body.html', '');
    if (SINGLE && key !== SINGLE) continue;
    out.push(key);
  }
  return out.sort();
}

/** 角色页数据在 content/characters/，其它页在 content/pages/（同 key 优先角色页） */
function loadPageData(key) {
  for (const dir of [CONTENT, CONTENT_PAGES]) {
    const p = path.join(dir, key + '.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  fail('缺页面数据：content/characters/' + key + '.json 或 content/pages/' + key + '.json');
}

function renderPage(key) {
  const character = loadPageData(key);
  const theme = {};
  for (const k of THEME_KEYS) if (character[k] !== undefined) theme[k] = character[k];
  const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
  const env = nunjucks.configure(TEMPLATES, { autoescape: false, trimBlocks: false, lstripBlocks: false });
  // 按每页自己的 style 令牌顺序拼接（不同页的修复块顺序不同，硬编码顺序会产生 diff）
  const shared = {
    'signet-mark': env.render('partials/signet-mark.njk', { character: character }),
    'signet-badge-css': env.render('partials/signet-badge.njk', { character: character }),
    'touch-target-fix': env.render('partials/touch-target.njk', { character: character }),
  };
  const fixMap = {};
  for (const m of read(path.join(PAGES_DIR, key + '.page-fixes.css')).matchAll(/<style id="([^"]+)">[\s\S]*?<\/style>/g)) fixMap[m[1]] = m[0];
  const stylesHtml = (character.styles || []).map((tok) => (tok === 'page' ? read(path.join(PAGES_DIR, key + '.page.css')) : (shared[tok] !== undefined ? shared[tok] : (fixMap[tok] || '')))).join(String.fromCharCode(10));
  const html = env.render('base.njk', {
    character: character,
    meta: {
      title: character.meta.title,
      description: character.meta.description,
      canonical: character.meta.canonical,
      ogDescription: character.meta.ogDescription || character.meta.description,
      ogImage: character.meta.ogImage || 'https://elysiad.top/images/og-1.jpg',
      themeColor: character.meta.themeColor || null,
      // 非角色页（404）：不给 canonical、不排进索引、og:title 自带（base.njk 里按有无回落）
      ogTitle: character.meta.ogTitle || null,
      noindex: character.meta.noindex === true,
      // 独立主题页（armor）：不吃 site.css / explore.css，全套样式都在自己的 page.css 里
      standalone: character.meta.standalone === true,
    },
    // 主题色整行注入（含换行）—— 没有主题色的页（hua/pardofelis）一个字节都不多
    themeColorTag: character.meta.themeColor ? '<meta name="theme-color" content="' + character.meta.themeColor + '">' + String.fromCharCode(10) : '',

    stylesHtml: stylesHtml,
    bodyAttrs: character.bodyAttrs || '',
    pageBody: read(path.join(PAGES_DIR, key + '.page.body.html')).split('/*@THEME@*/').join(JSON.stringify(theme)),
  });
  // 默认 <key>/index.html；404 这类页在数据里写 outPath 直接落到根下
  const rel = character.outPath || key + '/index.html';
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html, 'utf8');
  rendered.add(rel);
  return rel;
}
const MIN_FILES = 6;   // 实测 static.yml 当前 6 项（404.html / armor.html 已改由模板生成，从白名单移除）
const MIN_DIRS = 15;   // 实测 static.yml 当前为 15 项（assets data images + 12 角色页；guestbook 已于 2026-11-03 下线）；低于此值视为格式漂移

function fail(msg) {
  console.error('[build] ✗ ' + msg);
  process.exit(1);
}

function readWhitelist() {
  if (!fs.existsSync(WF)) fail('找不到白名单真源: ' + WF);
  const yml = fs.readFileSync(WF, 'utf8');
  const grab = (name) => {
    // 兼容两种写法：KEEP_FILES="a b"（shell 风格）与 KEEP_FILES: a b（YAML env，无引号）
    let re = new RegExp(name + '="([^"]*)"');
    let m = re.exec(yml);
    if (!m) { re = new RegExp(name + '\\s*[:=]\\s*([^\\n#]+)'); m = re.exec(yml); }
    if (!m) fail('白名单解析失败: 找不到 ' + name + '="…"。拒绝用空名单继续。');
    const stripQuotes = (x) => x.trim().replace(/^["']/, '').replace(/["']$/, '');
    return stripQuotes(m[1]).split(/\s+/).filter(Boolean);
  };
  const files = grab('KEEP_FILES');
  const dirs = grab('KEEP_DIRS');
  if (files.length < MIN_FILES) fail('KEEP_FILES 只解析出 ' + files.length + ' 项（阈值 ' + MIN_FILES + '），疑似 YAML 格式变化');
  if (dirs.length < MIN_DIRS) fail('KEEP_DIRS 只解析出 ' + dirs.length + ' 项（阈值 ' + MIN_DIRS + '），疑似 YAML 格式变化');
  console.log('[build] 白名单 sources: ' + path.relative(ROOT, WF));
  console.log('[build]   KEEP_FILES (' + files.length + '): ' + files.join(' '));
  console.log('[build]   KEEP_DIRS  (' + dirs.length + '): ' + dirs.join(' '));
  return { files, dirs };
}

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * 丢掉 .gitignore 命中的文件。
 *
 * 为什么要有这一步：collect() 直接walk工作树，看不见 .gitignore。
 * 于是本地构建会把 images/raw/**（原始素材，15 个文件）也拷进 public/，
 * 而 CI 是干净 checkout、根本没有这些文件 —— 两边产物不一致，
 * 2026-11-03 线上就被 /images/raw/signet/真我.png 直接 200 暴露过一次。
 * 以 git 为准就不会再有第二套规则要同步。
 */
function dropIgnored(items) {
  if (!fs.existsSync(path.join(ROOT, '.git'))) return items;
  const r = spawnSync('git', ['check-ignore', '--stdin', '-z'], {
    cwd: ROOT,
    input: items.map((i) => i.rel).join('\0') + '\0',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error || (r.status !== 0 && r.status !== 1)) return items;
  const ignored = new Set(String(r.stdout || '').split('\0').filter(Boolean));
  return ignored.size ? items.filter((i) => !ignored.has(i.rel)) : items;
}

/**
 * 原始素材（`images/raw/**`）一律不进产物。
 *
 * 2026-11-03 实测：产物 130 个文件 33.2 MB，其中 **30 MB 是这 25 张原始素材**，
 * 而全站 html/js/css/njk 对 `images/raw` 的引用数是 **0** —— 页面从没用到它们。
 * 它们照样被拷进 public/，于是：① 源图被公开下载（线上 /images/raw/signet/真我.png 曾 200）；
 * ② 每次部署要把 33 MB 的包从 GitHub 传到国内机器，实测 30 分钟量级，还因此卡死过一次。
 * 素材本身仍留在仓库里（这是需求方的源料），只是**不再发布**。
 */
const EXCLUDED_PREFIXES = ['images/raw/'];
function dropExcluded(items) {
  return items.filter((i) => !EXCLUDED_PREFIXES.some((p) => i.rel.startsWith(p)));
}

function collect(list) {
  const out = [];
  const walkDir = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort(byName)) {
      const a = path.join(abs, e.name);
      const r = rel + '/' + e.name;
      if (e.isDirectory()) walkDir(a, r);
      else out.push({ abs: a, rel: r });
    }
  };
  for (const f of list.files) {
    const a = path.join(ROOT, f);
    if (!fs.existsSync(a)) { console.warn('[build] ! 白名单里有但仓库里没有: ' + f); continue; }
    out.push({ abs: a, rel: f });
  }
  for (const d of list.dirs) {
    const a = path.join(ROOT, d);
    if (!fs.existsSync(a)) { console.warn('[build] ! 白名单目录缺失: ' + d); continue; }
    walkDir(a, d);
  }
  return dropExcluded(dropIgnored(out)).sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// 源文件按「会被改写成的样子」取哈希：与 public/ 里那一份对得上。
function sha256Source(item) {
  if (!REWRITE_HOST || !TEXT_EXT.has(path.extname(item.rel))) return sha256(item.abs);
  const s = fs.readFileSync(item.abs, 'utf8');
  const out = s.includes(DEFAULT_HOST) ? s.split(DEFAULT_HOST).join(REWRITE_HOST) : s;
  return crypto.createHash('sha256').update(out).digest('hex');
}

function hashTree(dir) {
  const map = new Map();
  if (!fs.existsSync(dir)) return map;
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort(byName)) {
      const a = path.join(abs, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(a, r);
      else map.set(r, sha256(a));
    }
  };
  walk(dir, '');
  return map;
}

function compare(src, dstMap) {
  const problems = [];
  for (const item of src) {
    if (rendered.has(item.rel)) continue;   // 渲染页与源不同是**预期**，由 diff_pages 把关
    const h = dstMap.get(item.rel);
    if (!h) problems.push('缺失: ' + item.rel);
    else if (h !== sha256Source(item)) problems.push('内容不一致: ' + item.rel);
  }
  const srcRels = new Set(src.map((x) => x.rel));
  for (const rel of dstMap.keys()) if (!srcRels.has(rel) && !rendered.has(rel)) problems.push('产物里多出: ' + rel);
  return problems;
}

function main() {
  const list = readWhitelist();

  // 发布域决定两处变体（一条规则，两个落点）：
  //   elysiad.top（合规版）：白名单里**没有** guestbook/，花瓣用 offline/flowers.local.js（不发任何请求）
  //   elysia.biz（全功能版）：白名单补上 guestbook/，花瓣用 assets/flowers.js（走 Worker 的 /count /flower）
  // 合规由白名单守住：server 分支的 static.yml 里本来就没有 guestbook，这条 push 只影响全功能构建。
  const siteHost = process.env.SITE_ORIGIN ? new URL(process.env.SITE_ORIGIN).host : DEFAULT_HOST;
  const fullSite = siteHost !== DEFAULT_HOST;
  if (fullSite && !list.dirs.includes('guestbook')) list.dirs.push('guestbook');

  const src = collect(list);
  if (!src.length) fail('源清单为空，拒绝继续');

  // 花束脚本按发布域选变体。直接改源条目的 abs：
  // 拷贝、compare、--verify-only 看到的是同一份字节，自校验不受影响。
  const flowers = src.find((i) => i.rel === 'assets/flowers.js');
  if (flowers) {
    const localVariant = path.join(ROOT, 'offline', 'flowers.local.js');
    if (!fullSite && !fs.existsSync(localVariant)) fail('缺离线变体 offline/flowers.local.js');
    flowers.abs = fullSite ? path.join(ROOT, 'assets', 'flowers.js') : localVariant;
    console.log('[build] flowers.js: ' + (fullSite ? '交互版（走 Worker）' : '合规版（纯本地，不发请求）'));
    console.log('[build] guestbook/: ' + (fullSite ? '随全功能版发布' : '不发布（白名单未含）'));
  }

  if (!VERIFY_ONLY) {
    if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
  } else if (!fs.existsSync(OUT)) {
    fail('--verify-only 需要先构建一次（public/ 不存在）');
  }

  if (!VERIFY_ONLY) {
    for (const item of src) {
      const to = path.join(OUT, item.rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(item.abs, to);
    }
  }

  if (!VERIFY_ONLY) {
    const pages = renderablePages();
    // 切换后的护栏：12 个角色页**必须**都有模板零件，否则说明有人漏写、
    // 而它会静默走「原样拷贝」路径（旧源还在时看不出来，退役后就地雷）。
    if (STRICT_TEMPLATES) {
      const keys = fs.readdirSync(CONTENT).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
      const missing = keys.filter((k) => !fs.existsSync(path.join(PAGES_DIR, k + '.page.body.html')));
      if (missing.length) fail('--strict-templates: 以下页缺模板零件：' + missing.join(' '));
      console.log('[build] strict-templates：' + keys.length + ' 页模板齐全');
    }
    for (const key of pages) renderPage(key);
  } else {
    // --verify-only 不渲染，但「产物里多出」那条判据要知道哪些产物**本来**就会多出来，
    // 否则每个角色页都会被报成多出的文件（这个模式的判定就废了）。
    for (const key of renderablePages()) rendered.add(loadPageData(key).outPath || key + '/index.html');
  }

  // 自定域发布：SITE_ORIGIN 的 host 与默认域不同时，把产物里的域名整树改写一次。
  // 必须在自校验**之前**做，compare 才能拿「改写后的字节」对「改写后应有的字节」（sha256Source）。
  // verify-only 不改任何文件，只比对上一次构建留下的产物。
  if (!VERIFY_ONLY && REWRITE_HOST) {
    let n = 0;
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!TEXT_EXT.has(path.extname(e.name))) continue;
        const s = fs.readFileSync(p, 'utf8');
        if (!s.includes(DEFAULT_HOST)) continue;
        fs.writeFileSync(p, s.split(DEFAULT_HOST).join(REWRITE_HOST), 'utf8');
        n++;
      }
    };
    walk(OUT);
    console.log('[build] origin: ' + DEFAULT_HOST + ' → ' + REWRITE_HOST + '（改写 ' + n + ' 个文件）');
  }

  const dstMap = hashTree(OUT);
  const problems = compare(src, dstMap);

  console.log('');
  console.log('[build] rendered: ' + rendered.size + ' 个' + (rendered.size ? '（' + [...rendered].join(' ') + '）' : ''));
  console.log('[build] copied:   ' + src.length + ' 个文件');
  for (const item of src) console.log('[build]   · ' + item.rel);

  if (problems.length) {
    console.error('');
    console.error('[build] ✗ 校验失败 ' + problems.length + ' 项：');
    for (const p of problems.slice(0, 40)) console.error('[build]   - ' + p);
    process.exit(1);
  }

  const digest = crypto.createHash('sha256')
    .update([...dstMap.entries()].map((e) => e[0] + ':' + e[1]).join('\n'))
    .digest('hex').slice(0, 16);

  console.log('');
  console.log('[build] 模式: ' + (VERIFY_ONLY ? 'verify-only（不拷贝）' : 'build（拷贝+自校验）'));
  console.log('[build] OK ' + src.length + ' files identical  digest=' + digest);

}

main();
