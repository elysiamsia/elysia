#!/usr/bin/env node
/**
 * tools/refactor/theme_extract.mjs —— 从页面 HTML 里**结构性**取出 var THEME 对象
 *
 * 为什么不用正则（审阅意见 #5）：THEME 跨多行、字符串里含分号/花括号/注释，正则必错。
 * 做法：找到 var THEME 的 = 之后的 {，用**括号配对**扫描（正确跳过字符串与注释）找到对象结尾，
 *       交给 JS 自己求值，再输出「规范化的值」与「原文跨度」。
 *
 * 输出（单行 JSON）：
 *   {"missing":true}                          —— 页面里没有 var THEME
 *   {"unbalanced":true}                       —— 括号配不上（多半是文件被截断）
 *   {"error":"..."}                           —— 求值失败
 *   {"span":[start,end],"hash":"<sha256>","canonical":"<json>"}
 *
 * diff_pages.py 用 span 做原地替换、用 hash 判语义相等 —— 这样「JS 字面量 → JSON 序列化」
 * 的字节差异被豁免，但**值变了就不豁免**。
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const file = process.argv[2];
if (!file) { console.log(JSON.stringify({ error: 'usage: theme_extract.mjs <html>' })); process.exit(0); }
const html = fs.readFileSync(file, 'utf8');

const at = html.indexOf('var THEME');
if (at < 0) { console.log(JSON.stringify({ missing: true })); process.exit(0); }

let i = html.indexOf('=', at);
if (i < 0) { console.log(JSON.stringify({ error: 'no equals after var THEME' })); process.exit(0); }
i += 1;
while (i < html.length && /\s/.test(html[i])) i++;
if (html[i] !== '{') { console.log(JSON.stringify({ error: 'THEME value is not an object literal' })); process.exit(0); }

let depth = 0, quote = null, esc = false, end = -1;
for (let j = i; j < html.length; j++) {
  const c = html[j];
  if (quote) {
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === quote) quote = null;
    continue;
  }
  if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
  if (c === '/' && html[j + 1] === '/') { while (j < html.length && html[j] !== '\n') j++; continue; }
  if (c === '/' && html[j + 1] === '*') { j += 2; while (j < html.length && !(html[j] === '*' && html[j + 1] === '/')) j++; j++; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
}
if (end < 0) { console.log(JSON.stringify({ unbalanced: true })); process.exit(0); }

const literal = html.slice(i, end);
let value;
try {
  value = new Function('return (' + literal + '\n);')();
} catch (e) {
  console.log(JSON.stringify({ error: 'eval: ' + e.message }));
  process.exit(0);
}

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
  canonical: json,
}));
