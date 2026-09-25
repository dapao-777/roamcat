/**
 * @file tools/verify-deadcode.cjs
 * 文件职责：零依赖死代码检查——扫描 extension/ 与 connector/ 的 .js/.mjs，报告没有任何其他文件
 *   引用的导出符号与 import 后未使用的绑定；connector 从 ../extension/ 直接 import 共享文件，两侧
 *   合并计数，不会把连接器在用的共享导出误报为死代码。数据溯源类导出（FREQUENCY_SOURCE 等）为
 *   许可归属元数据，属于有意保留，由 allowlist 显式排除。
 * 主要内容：导出符号跨文件引用计数、import 绑定去声明后的使用计数、中文报告清单。
 * 模块边界：只读文件系统；不修改任何文件；退出码恒为 0（报告型工具，由人工或 review 消费）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
const fs = require('node:fs');
const path = require('node:path');

// 有意保留的非业务导出：第三方数据溯源与许可归属。
const INTENTIONAL_EXPORTS = new Set(['FREQUENCY_SOURCE', 'ENGLISH_FREQUENCY_WORD_COUNT']);

const root = path.resolve(__dirname, '..', 'roamcat-0.0.1');
const files = [];
const walk = (base, relative) => fs.readdirSync(base, {withFileTypes: true}).forEach(e => {
  if (e.name.startsWith('.')) return;
  const absolute = path.join(base, e.name);
  const childRelative = relative ? `${relative}/${e.name}` : e.name;
  if (e.isDirectory()) {
    if (!relative && ['local-inference', 'vendor', 'fonts', 'icons'].includes(e.name)) return;
    walk(absolute, childRelative);
    return;
  }
  if (/\.(js|mjs)$/.test(e.name)) files.push({absolute, relative: childRelative});
});
walk(path.join(root, 'extension'), 'extension');
walk(path.join(root, 'connector'), 'connector');
const sources = files.map(f => ({f: f.relative, src: fs.readFileSync(f.absolute, 'utf8')}));

// src/（Vite/Lit 层）经 @ext 别名消费扩展层导出：只计入引用方，不参与导出/绑定检查——
// 其入口产物经 IIFE globalThis 与 customElements 暴露，正则看不出这条消费链。
const srcFiles = [];
const walkSrc = (base, relative) => fs.readdirSync(base, {withFileTypes: true}).forEach(e => {
  if (e.name.startsWith('.')) return;
  const absolute = path.join(base, e.name);
  const childRelative = relative ? `${relative}/${e.name}` : e.name;
  if (e.isDirectory()) { walkSrc(absolute, childRelative); return; }
  if (/\.(js|mjs)$/.test(e.name)) srcFiles.push({absolute, relative: childRelative});
});
const srcDir = path.resolve(__dirname, '..', 'src');
if (fs.existsSync(srcDir)) walkSrc(srcDir, 'src');
const referencers = sources.concat(srcFiles.map(f => ({f: f.relative, src: fs.readFileSync(f.absolute, 'utf8')})));

// 1. 未被任何其他文件引用的导出
const unusedExports = [];
for (const {f, src} of sources) {
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) {
    const name = m[1];
    const pattern = new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b', 'g');
    let uses = 0;
    for (const other of referencers) uses += (other.src.match(pattern) || []).length;
    // 同文件里 export 声明本身算 1 次；uses===1 表示只有声明、无人使用
    if (uses <= 1 && !INTENTIONAL_EXPORTS.has(name) && !/^(WELCOME_GUIDE|focus|close|settle)/.test(name)) unusedExports.push(`${f}: ${name}`);
  }
}

// 2. import 了但未使用的绑定
const unusedImports = [];
for (const {f, src} of sources) {
  const cleaned = src.replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?$/gm, '');
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop().trim();
      if (!name) continue;
      const pattern = new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b', 'g');
      const uses = (cleaned.match(pattern) || []).length;
      if (uses === 0) unusedImports.push(`${f}: ${name}`);
    }
  }
}

console.log('=== 未被使用的导出（' + unusedExports.length + '）===');
unusedExports.forEach(x => console.log('  ' + x));
console.log('=== 未被使用的 import 绑定（' + unusedImports.length + '）===');
unusedImports.forEach(x => console.log('  ' + x));
