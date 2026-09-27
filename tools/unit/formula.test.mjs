/**
 * @file tools/unit/formula.test.mjs
 * 文件职责：formula.js 公式保护模块的单元测试——在 node:vm 中按 classic script
 *   求值，断言 MATH_SELECTOR 与 findInline() 的定界符检测契约。
 * 主要内容：$$…$$、\(…\)、\[…\]、\begin{env}、$…$ 五种行内形态；
 *   $ 形态需要数学信号（\\、^、_、{、}、=），价格类 $5…$10 不得误报；
 *   区间合并去重、越界输入容错。
 * 模块边界：node:test + node:vm，不启动浏览器；只读 extension/formula.js。
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
const source = readFileSync(path.join(repoRoot, 'roamcat-0.0.1', 'extension', 'formula.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const formula = sandbox.RoamCatFormula;

test('formula.js 暴露 RoamCatFormula 与渲染数学容器选择器', () => {
  assert.ok(formula, 'globalThis.RoamCatFormula 必须存在');
  for (const sel of ['math', '.katex', 'mjx-container', '.MathJax']) assert.ok(formula.MATH_SELECTOR.includes(sel), '选择器缺少 ' + sel);
});

test('findInline() 覆盖 $$、\\(、\\[、\\begin 与 $ 五种形态', () => {
  const cases = [
    ['Sum: $$x^2+y^2=z^2$$ done.', '$$x^2+y^2=z^2$$'],
    ['Inline \\(e^{i\\pi}+1=0\\) here.', '\\(e^{i\\pi}+1=0\\)'],
    ['Block \\[\\int_0^1 f(x)dx\\] end.', '\\[\\int_0^1 f(x)dx\\]'],
    ['Env \\begin{equation}a=b+c\\end{equation} tail.', '\\begin{equation}a=b+c\\end{equation}'],
    ['Dollar $x_i = \\frac{1}{n}$ mid.', '$x_i = \\frac{1}{n}$']
  ];
  for (const [text, expected] of cases) {
    const spans = formula.findInline(text);
    assert.equal(spans.length, 1, text);
    assert.equal(text.slice(spans[0].start, spans[0].end), expected, text);
  }
});

test('findInline() 对价格与孤立 $ 不误报', () => {
  assert.equal(formula.findInline('Costs $5 and $10 total.').length, 0);
  assert.equal(formula.findInline('a lone $ sign here').length, 0);
  assert.equal(formula.findInline('').length, 0);
  assert.equal(formula.findInline(null).length, 0);
});

test('findInline() 命中跨位置多个公式并按序返回', () => {
  const text = 'First $a^2$ then \\(b^2\\) finally $$c^2$$ end.';
  const spans = formula.findInline(text);
  assert.equal(spans.length, 3);
  assert.ok(spans[0].start < spans[1].start && spans[1].start < spans[2].start);
  assert.equal(text.slice(spans[2].start, spans[2].end), '$$c^2$$');
});

test('findInline() 截断超长未闭合定界', () => {
  const text = 'Open $$' + 'x'.repeat(5000) + ' close.';
  assert.equal(formula.findInline(text).length, 0);
});
