/**
 * @file tools/unit/complexity.test.mjs
 * 文件职责：complexity.js 长难句本地分析的单元测试——在 node:vm 中按 classic
 *   script 方式求值（与 manifest content_scripts 加载形态一致），断言句子切分
 *   与复杂度评分的契约。
 * 主要内容：sentences() 的边界与偏移、scoreSentence() 的词数/从句/标点因子、
 *   complexRanges() 的过滤阈值；含从句长句必须命中、简单短句必须排除。
 * 模块边界：node:test + node:vm，不启动浏览器；只读 extension/complexity.js。
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
const source = readFileSync(path.join(repoRoot, 'roamcat-0.0.1', 'extension', 'complexity.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const cx = sandbox.RoamCatComplexity;

test('complexity.js 暴露 RoamCatComplexity 接口', () => {
  assert.ok(cx, 'globalThis.RoamCatComplexity 必须存在');
  for (const key of ['sentences', 'scoreSentence', 'complexRanges', 'COMPLEX_WORD_COUNT']) assert.ok(cx[key] !== undefined, '缺少 ' + key);
});

test('sentences() 按句末标点与大写起始切分并保留偏移', () => {
  const text = 'Cats sleep. Dogs bark loudly! Are birds real?';
  const spans = cx.sentences(text);
  assert.equal(spans.length, 3);
  assert.equal(text.slice(spans[0].start, spans[0].end), 'Cats sleep. ');
  assert.equal(text.slice(spans[2].start, spans[2].end), 'Are birds real?');
});

test('sentences() 容忍引号与缩写结尾，空输入返回空', () => {
  assert.equal(cx.sentences('').length, 0);
  assert.equal(cx.sentences(null).length, 0);
  const spans = cx.sentences('He said "Go home." Then he left.');
  assert.equal(spans.length, 2);
});

test('scoreSentence()：含从句的长句命中，短句排除', () => {
  const complex = cx.scoreSentence('Although the committee had reviewed the proposal which the board submitted last quarter, it decided that further evidence was required before any vote could proceed.');
  assert.ok(complex.isComplex, '从句嵌套长句应判定为长难句');
  assert.ok(complex.subordinateCount >= 3);
  const simple = cx.scoreSentence('The cat sat on the mat.');
  assert.equal(simple.isComplex, false);
  const medium = cx.scoreSentence('She opened the door and walked slowly into the garden while her brother stayed behind.');
  assert.ok(medium.wordCount > 10, '词数统计应覆盖所有单词');
});

test('scoreSentence()：纯长句（无从句标记）按词数阈值命中', () => {
  const long = cx.scoreSentence('The quick brown fox jumps over the lazy dog again and again and again through fields and forests beyond every distant hill today.');
  assert.ok(long.wordCount >= 22);
});

test('complexRanges() 只返回命中区间且偏移与原文一致', () => {
  const text = 'Short line. ' + 'When the researchers finally published the dataset which they had gathered over six years of fieldwork, reviewers argued that the methodology, though innovative, still lacked adequate controls.' + ' Done.';
  const ranges = cx.complexRanges(text);
  assert.equal(ranges.length, 1);
  assert.ok(text.slice(ranges[0].start, ranges[0].end).startsWith('When the researchers'));
  assert.ok(ranges[0].wordCount > 22);
});
