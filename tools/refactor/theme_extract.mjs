#!/usr/bin/env node
/**
 * tools/refactor/theme_extract.mjs —— 从页面 HTML 里**结构性**取出 var THEME 对象
 *
 * 为什么不用正则（审阅意见 #5）：THEME 跨多行、字符串里含分号/花括号/注释，正则必错。
 * 做法：括号配对扫描找到对象结尾，交给 JS 求值，输出「规范化值」与「原文跨度」。
 *
 * ⚠ 依赖回退（2026-10-18 盘点时发现 mobius 的 THEME 引用了外部 var quotes）：
 *   求值报 `X is not defined` 时，在同页里找 `var X = <字面量>`，求值后作为前导再试（最多 6 轮）。
 *   —— 这样「THEME 不是纯字面量」的页面也能提取，而**不需要执行页面业务代码**。
 *
 * 输出（单行 JSON）：missing / unbalanced / error / {span, hash, canonical}
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const file = process.argv[2];
if (!file) { console.log(JSON.stringify({ error: 'usage: theme_extract.mjs <html>' })); process.exit(0); }
const html = fs.readFileSync(file, 'utf8');

function scanBalanced(src, from) {
  let depth = 0, quote = null, esc = false;
  for (let j = from; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '/' && src[j + 1] === '/') { while (j < src.length && src[j] !== '\n') j++; continue; }
    if (c === '/' && src[j + 1] === '*') { j += 2; while (j < src.length && !(src[j] === '*' && src[j + 1] === '/')) j++; j++; continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') { depth--; if (depth === 0) return j + 1; }
  }
  return -1;
}

function findVarLiteral(src, name) {
  const re = new RegExp('var\\s+' + name + '\\s*=');
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  while (i < src.length && /\s/.test(src[i])) i++;
  const first = src[i];
  if (first !== '[' && first !== '{') return null;
  const end = scanBalanced(src, i);
  if (end < 0) return null;
  return { text: 'var ' + name + ' = ' + src.slice(i, end) + ';', start: i, end: end };
}

const at = html.indexOf('var THEME');
if (at < 0) { console.log(JSON.stringify({ missing: true })); process.exit(0); }

// ⚠ 定位对象字面量：直接在 var THEME 之后找第一个 `{`。
//   早期版本用 indexOf('=') 再跳空白 —— 在「JS 字面量」上没事，但在「JSON 形态」上
//   （构建产物里 var THEME = {"explore":…}）会因中间出现的等号错位，span 少数两个字符，
//   导致占位符落点不同、diff 假报差异（2026-10-18 实测）。
let i = html.indexOf('{', at);
if (i < 0) { console.log(JSON.stringify({ error: 'no object literal after var THEME' })); process.exit(0); }
const end = scanBalanced(html, i);
if (end < 0) { console.log(JSON.stringify({ unbalanced: true })); process.exit(0); }
const literal = html.slice(i, end);

let prelude = '';
let value = null;
let lastErr = '';
const used = [];
for (let attempt = 0; attempt < 6; attempt++) {
  try {
    value = new Function(prelude + 'return (' + literal + '\n);')();
    break;
  } catch (e) {
    lastErr = e.message;
    const m = /([A-Za-z_$][\w$]*) is not defined/.exec(e.message);
    if (!m) break;
    const name = m[1];
    if (used.indexOf(name) >= 0) break;
    const found = findVarLiteral(html, name);
    if (!found) break;
    used.push(name);
    prelude += found.text + '\n';
  }
}
if (value === null) { console.log(JSON.stringify({ error: 'eval: ' + lastErr, deps: used })); process.exit(0); }

function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
    return out;
  }
  return v;
}
const json = JSON.stringify(canonical(value));
console.log(JSON.stringify({
  span: [i, end],
  hash: crypto.createHash('sha256').update(json).digest('hex').slice(0, 16),
  deps: used,
  canonical: json,
}));