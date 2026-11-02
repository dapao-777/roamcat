/**
 * @file tools/unit/pet-styles.test.mjs
 * 文件职责：伴读猫 Shadow DOM 样式表（floating-pet-styles.js）的结构单元测试——取 getPetStyles()
 *   的整段输出（含 design.js 拼进来的 token），断言 CSS 块结构完好。
 * 主要内容：大括号配平（任何位置不出现多余的 }、结尾全部闭合）；关键帧步进（from/to/百分比）
 *   只出现在 @keyframes 里；.cat-svg 规则仍是独立的顶层规则并挂着 cat-breathe 呼吸动画。
 *   曾有一段丢了 @keyframes 头的残片（孤立的 50% 帧 + 多余的 }），把下一条规则的选择器
 *   变成「} .cat-svg」，浏览器整条丢弃，猫的尺寸、颜色与呼吸动画全部失效。
 * 模块边界：node:test + node:vm，不启动浏览器；design.js 与 floating-pet-styles.js 以 classic 方式求值。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const extDir = path.join(repoRoot, 'roamcat-0.0.1', 'extension');
const sandbox = {document: {currentScript: {hasAttribute: () => false}}};
vm.createContext(sandbox);
vm.runInContext(readFileSync(path.join(extDir, 'design.js'), 'utf8'), sandbox);
vm.runInContext(readFileSync(path.join(extDir, 'floating-pet-styles.js'), 'utf8'), sandbox);
const css = sandbox.RoamCatPetParts.getPetStyles();

// 按块扫描 CSS：跳过注释与引号字符串，记录每个 { 前的选择器/at 规则（prelude）及其所在的外层块。
// 顶层多出的 } 与浏览器一样留在下一条规则的 prelude 里（于是出现「} .cat-svg」）。
function scanBlocks(text) {
  const blocks = [];
  const errors = [];
  const stack = [];
  let buf = '';
  let line = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') line++;
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) { errors.push(`第 ${line} 行注释未闭合`); break; }
      line += text.slice(i, end).split('\n').length - 1;
      i = end + 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
      buf += text.slice(i, j + 1);
      i = j;
      continue;
    }
    if (ch === '{') {
      const block = {prelude: buf.trim().replace(/\s+/g, ' '), parent: stack.at(-1)?.prelude ?? null, line};
      blocks.push(block);
      stack.push(block);
      buf = '';
    } else if (ch === '}') {
      if (stack.length) {
        stack.pop();
        buf = '';
      } else {
        errors.push(`第 ${line} 行多出一个 }`);
        buf += ch;
      }
    } else if (ch === ';') {
      buf = '';
    } else {
      buf += ch;
    }
  }
  for (const block of stack) errors.push(`第 ${block.line} 行「${block.prelude.slice(0, 60)}」的 { 未闭合`);
  return {blocks, errors};
}

const KEYFRAME_STEP = /^(?:from|to|\d+(?:\.\d+)?%)(?:\s*,\s*(?:from|to|\d+(?:\.\d+)?%))*$/;

test('扫描器能识别丢了 @keyframes 头的残片', () => {
  const broken = '.a { color: red; }\n  50% { transform: scale(1.15); }\n}\n.cat-svg { width: 58px; }';
  const {blocks, errors} = scanBlocks(broken);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /第 3 行多出一个 }/);
  assert.ok(blocks.some(b => b.prelude === '} .cat-svg'), '多出的 } 应并进下一条规则的选择器');
});

test('getPetStyles() 输出的大括号配平', () => {
  assert.ok(css.length > 10000, 'getPetStyles() 输出过短，样式表没有正确求值');
  const {errors} = scanBlocks(css);
  assert.deepEqual(errors, [], `伴读猫样式表结构损坏：\n${errors.join('\n')}`);
});

test('关键帧步进只出现在 @keyframes 里', () => {
  const {blocks} = scanBlocks(css);
  const stray = blocks.filter(b => KEYFRAME_STEP.test(b.prelude) && !/^@keyframes\s/.test(b.parent || ''));
  assert.deepEqual(stray.map(b => `第 ${b.line} 行 ${b.prelude}（外层：${b.parent ?? '顶层'}）`), []);
});

test('.cat-svg 是独立的顶层规则并挂着 cat-breathe 呼吸动画', () => {
  const {blocks} = scanBlocks(css);
  assert.ok(blocks.some(b => b.prelude === '.cat-svg' && b.parent === null), '缺少顶层 .cat-svg 规则');
  assert.ok(blocks.some(b => b.prelude === '@keyframes cat-breathe' && b.parent === null), '缺少 @keyframes cat-breathe');
  const rule = css.match(/(?:^|[}\s])\.cat-svg\s*\{([^}]*)\}/);
  assert.ok(rule, '找不到 .cat-svg 规则体');
  assert.match(rule[1], /animation:\s*cat-breathe\b/);
  assert.match(rule[1], /width:\s*58px/);
});
