/**
 * @file tools/unit/request-parsers.test.mjs
 * 文件职责：为 message-protocol.js 中本轮新下沉的请求级纯逻辑提供 node:test 单元测试——
 *   ASSIST 的文章准备标识解构、PASSAGE_TRANSLATE 的请求编号校验与按需建议的日期窗口判定，
 *   这三处此前都内联在 background.js 的浏览器运行时里，只能靠浏览器审计间接覆盖。
 * 主要内容：parseAssistRequest 的 type 剥离、标识边界与 gloss 命令校验委托；
 *   parsePassageRequestRef 的 ID 形态规则；onDemandSuggestionDecision 的 27 天窗口、
 *   14 天有效阅读门槛、阻断信号、已建议过的一次性语义与时间可注入性。
 * 模块边界：只 import 被测纯模块；运行方式为在仓库根执行 node:test 自动发现本目录全部 .test.mjs。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAssistRequest, parsePassageRequestRef, onDemandSuggestionDecision} from '../../roamcat-0.0.1/extension/message-protocol.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 22, 12, 0, 0); // 2026-09-22T12:00:00Z，固定时间保证确定性

const validCommand = {
  requestId: 'r1',
  text: 'index',
  context: 'The database uses an index.',
  domain: 'data',
  kind: 'word',
  level: 'hint',
  detail: 'brief',
};

test('parseAssistRequest 剥离 type、默认空标识并委托 gloss 校验', () => {
  const parsed = parseAssistRequest({type: 'ASSIST', ...validCommand, articleKey: 'k1'});
  assert.equal(parsed.articleKey, 'k1');
  assert.deepEqual(parsed.command, {text: 'index', context: 'The database uses an index.', domain: 'data', kind: 'word', level: 'hint', detail: 'brief', requestId: 'r1', bypassCache: false});
  // 缺省 articleKey 视为空串而不是 undefined。
  assert.equal(parseAssistRequest({type: 'ASSIST', ...validCommand}).articleKey, '');
});

test('parseAssistRequest 拒绝超长标识与非法命令', () => {
  assert.throws(() => parseAssistRequest({type: 'ASSIST', ...validCommand, articleKey: 'k'.repeat(129)}), /文章准备标识无效。/u);
  assert.throws(() => parseAssistRequest({type: 'ASSIST', ...validCommand, articleKey: 42}), /文章准备标识无效。/u);
  assert.throws(() => parseAssistRequest({type: 'ASSIST', ...validCommand, kind: 'paragraph'}), /帮助请求无效。/u);
  assert.throws(() => parseAssistRequest({}), /帮助请求字段无效。/u);
  assert.throws(() => parseAssistRequest(undefined), /帮助请求字段无效。/u);
  // 命令里的 type 字段同样被剥离，不会泄漏进 gloss 校验。
  assert.throws(() => parseAssistRequest({type: 'ASSIST', ...validCommand, wordId: 'data:index', unknown: 1}), /帮助请求字段无效。/u);
});

test('parsePassageRequestRef 校验编号形态', () => {
  assert.deepEqual(parsePassageRequestRef({requestId: 'p1_s2'}), {requestId: 'p1_s2'});
  assert.throws(() => parsePassageRequestRef({}), /无效的段落翻译请求编号。/u);
  assert.throws(() => parsePassageRequestRef({requestId: 'x'.repeat(129)}), /无效的段落翻译请求编号。/u);
  assert.throws(() => parsePassageRequestRef({requestId: 'bad id'}), /无效的段落翻译请求编号。/u);
  assert.throws(() => parsePassageRequestRef({requestId: 7}), /无效的段落翻译请求编号。/u);
});

test('onDemandSuggestionDecision 的 27 天窗口与 14 天门槛', () => {
  const dayAt = offset => new Date(NOW - offset * DAY).toISOString().slice(0, 10);
  // 近 27 天内 14 天有有效阅读、无阻断信号、未建议过 → 建议。
  const clean = Array.from({length: 14}, (_, i) => ({day: dayAt(i), eligiblePages: 3}));
  assert.deepEqual(onDemandSuggestionDecision(clean, 0, NOW), {show: true});
  // 少于 14 天不建议。
  assert.deepEqual(onDemandSuggestionDecision(clean.slice(0, 13), 0, NOW), {show: false});
  // 已建议过不再建议。
  assert.deepEqual(onDemandSuggestionDecision(clean, NOW, NOW), {show: false});
  // 任一阻断信号都抑制建议。
  for (const key of ['helpRequests', 'hintsShown', 'errors']) {
    assert.deepEqual(onDemandSuggestionDecision([...clean, {day: dayAt(20), eligiblePages: 1, [key]: 2}], 0, NOW), {show: false});
  }
  // 窗口外的有效日不计入。
  const stale = Array.from({length: 20}, (_, i) => ({day: dayAt(30 + i), eligiblePages: 5}));
  assert.deepEqual(onDemandSuggestionDecision(stale, 0, NOW), {show: false});
  // 窗口边界（第 27 天）计入，第 28 天不计入。
  const boundary = [...Array.from({length: 13}, (_, i) => ({day: dayAt(i), eligiblePages: 2})), {day: dayAt(27), eligiblePages: 1}];
  assert.deepEqual(onDemandSuggestionDecision(boundary, 0, NOW), {show: true});
  const outside = [...Array.from({length: 13}, (_, i) => ({day: dayAt(i), eligiblePages: 2})), {day: dayAt(28), eligiblePages: 1}];
  assert.deepEqual(onDemandSuggestionDecision(outside, 0, NOW), {show: false});
  // 非法用量与非正 eligiblePages 不崩溃也不计数。
  assert.deepEqual(onDemandSuggestionDecision('nope', 0, NOW), {show: false});
  assert.deepEqual(onDemandSuggestionDecision([{day: dayAt(1), eligiblePages: 0}], 0, NOW), {show: false});
  assert.deepEqual(onDemandSuggestionDecision([{day: 42}], 0, NOW), {show: false});
});
