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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public');
const WF = path.join(ROOT, '.github', 'workflows', 'static.yml');
const VERIFY_ONLY = process.argv.includes('--verify-only');
const MIN_FILES = 8;
const MIN_DIRS = 16;   // 实测 static.yml 当前为 16 项（assets data images + 12 角色页 + guestbook）；低于此值视为格式漂移

function fail(msg) {
  console.error('[build] ✗ ' + msg);
  process.exit(1);
}

function readWhitelist() {
  if (!fs.existsSync(WF)) fail('找不到白名单真源: ' + WF);
  const yml = fs.readFileSync(WF, 'utf8');
  const grab = (name) => {
    const re = new RegExp(name + '="([^"]*)"');
    const m = re.exec(yml);
    if (!m) fail('白名单解析失败: 找不到 ' + name + '="…"。拒绝用空名单继续。');
    return m[1].trim().split(/\s+/).filter(Boolean);
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
  return out.sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
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
    const h = dstMap.get(item.rel);
    if (!h) problems.push('缺失: ' + item.rel);
    else if (h !== sha256(item.abs)) problems.push('内容不一致: ' + item.rel);
  }
  const srcRels = new Set(src.map((x) => x.rel));
  for (const rel of dstMap.keys()) if (!srcRels.has(rel)) problems.push('产物里多出: ' + rel);
  return problems;
}

function main() {
  const list = readWhitelist();
  const src = collect(list);
  if (!src.length) fail('源清单为空，拒绝继续');

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

  const dstMap = hashTree(OUT);
  const problems = compare(src, dstMap);

  console.log('');
  console.log('[build] rendered: 0 个（Task 1 阶段恒为空，Task 9 起才会有）');
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
