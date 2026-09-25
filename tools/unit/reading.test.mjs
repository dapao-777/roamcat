/**
 * @file tools/unit/reading.test.mjs
 * 文件职责：为领域层 extension/reading.js 的阅读渐退状态机提供 node:test 单元测试，
 *   固定 hint→mark→quiet 的阶段推进、重置与长期缺席规则，防止支持密度策略被无意改变。
 * 主要内容：normalizeKnownAt/normalizeSenseLabel 归一化、readingEvidence 的领域作用域与
 *   排序去重、migrateSupportWord 的 schema 1–5 迁移与拒绝、supportState 的阶段判定、
 *   encounter 的「提示真实出现过才计次」语义与 quiet 周期推进、interact 的帮助/少帮助动作。
 * 模块边界：只 import 被测纯模块；所有时间戳使用固定常量保证确定性；运行方式为
 *   `node --test tools/unit/`（Node 20+，无需安装依赖）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeKnownAt,
  normalizeSenseLabel,
  readingEvidence,
  migrateSupportWord,
  supportState,
  encounter,
  interact,
} from '../../roamcat-0.0.1/extension/reading.js';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

function sense(overrides = {}) {
  return {
    key: 's1',
    label: 'lookup structure',
    opportunityDays: 0,
    lastOpportunityAt: 0,
    lastHelpAt: 0,
    quietUntil: 0,
    quietCycles: 0,
    quietOpportunityDays: 0,
    hintPreference: null,
    assistedPageKey: '',
    definition: {hint: '', translation: ''},
    ...overrides,
  };
}

function word(senseOverrides = {}, overrides = {}) {
  return {
    id: 'data:index',
    term: 'index',
    domain: 'data',
    kind: 'word',
    revision: 0,
    helpCount: 0,
    requestedAt: 0,
    knownAt: 0,
    lastSeen: 0,
    hintPreference: null,
    senses: [sense(senseOverrides)],
    ...overrides,
  };
}

test('normalizeKnownAt 只接受非负有限时间戳', () => {
  assert.equal(normalizeKnownAt(123), 123);
  assert.equal(normalizeKnownAt(0), 0);
  assert.equal(normalizeKnownAt(-5), 0);
  assert.equal(normalizeKnownAt('abc'), 0);
  assert.equal(normalizeKnownAt(Number.NaN), 0);
  assert.equal(normalizeKnownAt(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalizeKnownAt(undefined), 0);
});

test('normalizeSenseLabel 归一化空白并限制长度', () => {
  assert.equal(normalizeSenseLabel('  Lookup   Structure '), 'lookup structure');
  assert.equal(normalizeSenseLabel('x'.repeat(60)), 'x'.repeat(60));
  assert.equal(normalizeSenseLabel('x'.repeat(61)), null);
  assert.equal(normalizeSenseLabel(''), null);
  assert.equal(normalizeSenseLabel('   '), null);
  assert.equal(normalizeSenseLabel(42), null);
});

test('readingEvidence 按领域、请求与少帮助偏好提取有界证据', () => {
  const words = [
    {id: 'data:index', term: 'index', domain: 'data', kind: 'word', helpCount: 2, requestedAt: 500, lastSeen: 500, hintPreference: null, senses: []},
    {id: 'general:cache', term: 'cache', domain: 'general', kind: 'word', helpCount: 0, requestedAt: 0, lastSeen: 100, hintPreference: 'less', senses: []},
    {id: 'tech:queue', term: 'queue', domain: 'tech', kind: 'word', helpCount: 1, requestedAt: 900, lastSeen: 900, hintPreference: null, senses: []},
    {id: 'data:shujuku', term: '数据库', domain: 'data', kind: 'word', helpCount: 1, requestedAt: 800, lastSeen: 800, hintPreference: null, senses: []},
  ];
  assert.deepEqual(readingEvidence(words, 'data'), {recentQueries: ['index'], lessHelpTerms: ['cache']});
  // general 域只收集 general 与显式少帮助词，不收窄其他领域的近期请求。
  assert.deepEqual(readingEvidence(words, 'general'), {recentQueries: [], lessHelpTerms: ['cache']});
  assert.deepEqual(readingEvidence(words, 'auto'), {recentQueries: [], lessHelpTerms: ['cache']});
  assert.deepEqual(readingEvidence('not-an-array', 'data'), {recentQueries: [], lessHelpTerms: []});
});

test('readingEvidence 去重、限流 12 条并按时间倒序', () => {
  const many = Array.from({length: 14}, (_, i) => ({
    id: `data:term${i}`, term: `term${i}`, domain: 'data', kind: 'word',
    helpCount: 1, requestedAt: 100 + i, lastSeen: 100 + i, hintPreference: null, senses: [],
  }));
  const evidence = readingEvidence(many, 'data');
  assert.equal(evidence.recentQueries.length, 12);
  assert.equal(evidence.recentQueries[0], 'term13');
  assert.ok(!evidence.recentQueries.includes('term1'));

  const duplicated = readingEvidence([
    {id: 'data:index', term: 'Index', domain: 'data', kind: 'word', helpCount: 1, requestedAt: 10, lastSeen: 10, hintPreference: null, senses: []},
    {id: 'data:index2', term: 'index', domain: 'data', kind: 'word', helpCount: 1, requestedAt: 20, lastSeen: 20, hintPreference: null, senses: []},
  ], 'data');
  assert.deepEqual(duplicated.recentQueries, ['index']);
});

test('readingEvidence 排除非词条、非英语与URL 样词项', () => {
  const words = [
    {id: 'data:s', term: 'index', domain: 'data', kind: 'sentence', helpCount: 3, requestedAt: 10, lastSeen: 10, hintPreference: null, senses: []},
    {id: 'data:n', term: '123', domain: 'data', kind: 'word', helpCount: 1, requestedAt: 10, lastSeen: 10, hintPreference: null, senses: []},
    {id: 'data:u', term: 'see https://example.com/docs', domain: 'data', kind: 'word', helpCount: 1, requestedAt: 10, lastSeen: 10, hintPreference: null, senses: []},
    {id: 'data:l', term: 'x'.repeat(101), domain: 'data', kind: 'word', helpCount: 1, requestedAt: 10, lastSeen: 10, hintPreference: null, senses: []},
    {id: 'data:idle', term: 'cache', domain: 'data', kind: 'word', helpCount: 0, requestedAt: 0, lastSeen: 10, hintPreference: null, senses: []},
  ];
  assert.deepEqual(readingEvidence(words, 'data'), {recentQueries: [], lessHelpTerms: []});
});

test('migrateSupportWord 拒绝不支持的数据版本', () => {
  for (const version of [0, 6, 1.5, 'abc', null]) {
    assert.throws(() => migrateSupportWord(word(), version), RangeError);
  }
});

test('migrateSupportWord 的旧身份迁移丢弃历史字段', () => {
  const legacy = {
    id: 'data:index', term: 'index', domain: 'data', kind: 'word',
    revision: 7, helpCount: 4, requestedAt: 999, knownAt: -5, lastSeen: 888,
    hintPreference: 'less', contexts: ['旧上下文'], translations: ['旧译文'], inferred: {mastery: 0.9},
    senses: [{key: 's1', label: 'lookup structure'}],
  };
  const migrated = migrateSupportWord(legacy, 3);
  assert.deepEqual(migrated, {
    id: 'data:index', term: 'index', domain: 'data', kind: 'word',
    revision: 7, helpCount: 4, requestedAt: 999, knownAt: 0, lastSeen: 888,
    hintPreference: 'less', senses: [],
  });
  assert.equal(migrateSupportWord({...legacy, kind: 'sentence'}, 3), null);
  // v4 起才迁移义项；v3 有 senses 也应落为支持专用形态。
  const v4 = migrateSupportWord(legacy, 4);
  assert.equal(v4.senses.length, 1);
  assert.equal(v4.senses[0].key, 's1');
});

test('migrateSupportWord 迁移义项时去重、丢弃无效项并封顶 8 条', () => {
  const senses = Array.from({length: 10}, (_, i) => sense({key: `s${i}`, label: `sense ${i}`}));
  const stored = word({}, {
    senses: [
      ...senses,
      sense({key: 's0', label: 'duplicate'}),
      sense({key: '', label: 'no key'}),
      sense({key: 'bad', label: '   '}),
      {key: 'wrong-shape'},
    ],
  });
  const migrated = migrateSupportWord(stored, 5);
  assert.equal(migrated.senses.length, 8);
  assert.deepEqual([...new Set(migrated.senses.map(item => item.key))].length, 8);
  assert.equal(migrated.senses[0].label, 'sense 0');
});

test('migrateSupportWord 裁剪超长定义并封顶 quiet 周期', () => {
  const migrated = migrateSupportWord(word({
    quietCycles: 5,
    definition: {hint: 'h'.repeat(100), translation: 't'.repeat(200)},
  }), 5);
  assert.equal(migrated.senses[0].quietCycles, 2);
  assert.equal(migrated.senses[0].definition.hint.length, 80);
  assert.equal(migrated.senses[0].definition.translation.length, 160);
});

test('supportState 判定 hint/mark/quiet 与长期缺席重置', () => {
  assert.deepEqual(supportState(word(), 's1', NOW), {stage: 'hint'});
  assert.deepEqual(supportState(word({}, {senses: []}), 's1', NOW), {stage: 'hint'});
  assert.deepEqual(supportState(word({}, {hintPreference: 'less'}), 's1', NOW), {stage: 'quiet'});
  assert.deepEqual(supportState(word({hintPreference: 'less'}), 's1', NOW), {stage: 'quiet'});
  assert.deepEqual(supportState(word({opportunityDays: 2}), 's1', NOW), {stage: 'hint'});
  assert.deepEqual(supportState(word({opportunityDays: 3}), 's1', NOW), {stage: 'mark'});
  assert.deepEqual(supportState(word({lastOpportunityAt: NOW - 15 * DAY, opportunityDays: 5}), 's1', NOW), {stage: 'hint'});
  assert.deepEqual(supportState(word({quietUntil: NOW + 1000}), 's1', NOW), {stage: 'quiet'});
});

test('encounter 只在提示真实出现过时累计机会', () => {
  const fresh = word();
  const counted = encounter(fresh, 'pageA', NOW, {senseKey: 's1', hintShown: true});
  assert.equal(counted.senses[0].opportunityDays, 1);
  assert.equal(counted.senses[0].lastOpportunityAt, NOW);
  assert.equal(counted.revision, 1);
  assert.equal(counted.lastSeen, NOW);

  // hint 阶段未展示提示不计次，且原对象不变。
  const ignored = encounter(fresh, 'pageA', NOW, {senseKey: 's1', hintShown: false});
  assert.equal(ignored, fresh);

  // 同一 UTC 日内换页面不重复计次。
  const sameDay = encounter(counted, 'pageB', NOW + 3600_000, {senseKey: 's1', hintShown: true});
  assert.equal(sameDay, counted);

  // 已被帮助过的页面再次出现不重复计次。
  const helped = interact(fresh, 'help', NOW, 'pageZ', 's1');
  assert.equal(encounter(helped, 'pageZ', NOW + 3600_000, {senseKey: 's1', hintShown: true}), helped);
});

test('encounter 的 mark 阶段与 quiet 完成周期', () => {
  const marking = word({opportunityDays: 5, lastOpportunityAt: NOW - 2 * DAY, assistedPageKey: 'other'});
  const quiet = encounter(marking, 'pageB', NOW, {senseKey: 's1', hintShown: false});
  assert.equal(quiet.senses[0].opportunityDays, 3);
  assert.equal(quiet.senses[0].quietUntil, NOW + 7 * DAY);
  assert.equal(quiet.senses[0].quietOpportunityDays, 0);

  // quiet 期间只累计安静天数，并在 quietCycles=1 时拉长到 14 天。
  const second = word({opportunityDays: 5, lastOpportunityAt: NOW - 8 * DAY, assistedPageKey: 'other', quietCycles: 1});
  const quiet2 = encounter(second, 'pageB', NOW, {senseKey: 's1', hintShown: false});
  assert.equal(quiet2.senses[0].quietUntil, NOW + 14 * DAY);
  const during = encounter(word({opportunityDays: 3, quietUntil: NOW + DAY, quietOpportunityDays: 1, lastOpportunityAt: NOW - DAY}), 'pageB', NOW, {senseKey: 's1', hintShown: true});
  assert.equal(during.senses[0].quietOpportunityDays, 2);
  assert.equal(during.senses[0].lastOpportunityAt, NOW);
});

test('encounter 在 quiet 结束后按安静表现推进周期并恢复 mark 计次', () => {
  const elapsed = word({
    opportunityDays: 3,
    quietUntil: NOW - 1000,
    quietOpportunityDays: 2,
    lastOpportunityAt: NOW - 8 * DAY,
    assistedPageKey: 'other',
  });
  const next = encounter(elapsed, 'pageB', NOW, {senseKey: 's1', hintShown: false});
  assert.equal(next.senses[0].quietCycles, 1);
  assert.equal(next.senses[0].quietUntil, 0);
  assert.equal(next.senses[0].opportunityDays, 4);
  assert.equal(next.senses[0].quietOpportunityDays, 0);

  const weak = word({opportunityDays: 3, quietUntil: NOW - 1000, quietOpportunityDays: 1, lastOpportunityAt: NOW - 8 * DAY, assistedPageKey: 'other'});
  const weakNext = encounter(weak, 'pageB', NOW, {senseKey: 's1', hintShown: false});
  assert.equal(weakNext.senses[0].quietCycles, 0);
});

test('encounter 的长期缺席重置计数器并从 hint 重新开始', () => {
  const absent = word({opportunityDays: 5, lastOpportunityAt: NOW - 20 * DAY, assistedPageKey: 'old'});
  const reset = encounter(absent, 'pageB', NOW, {senseKey: 's1', hintShown: true});
  assert.equal(reset.senses[0].opportunityDays, 1);
  assert.equal(reset.senses[0].lastOpportunityAt, NOW);

  // 少帮助偏好在词条或义项级别都直接放假。
  assert.equal(encounter(word({}, {hintPreference: 'less'}), 'pageB', NOW, {senseKey: 's1', hintShown: true}).senses[0].opportunityDays, 0);
  assert.equal(encounter(word({hintPreference: 'less'}), 'pageB', NOW, {senseKey: 's1', hintShown: true}).senses[0].opportunityDays, 0);
});

test('encounter 拒绝无效输入', () => {
  assert.throws(() => encounter(word(), '', NOW, {senseKey: 's1'}), TypeError);
  assert.throws(() => encounter(word(), 'pageA', NOW, {senseKey: 'missing'}), RangeError);
  assert.throws(() => encounter(word({}, {senses: [{key: 's1', label: 5}]}), 'pageA', NOW, {senseKey: 's1'}), RangeError);
  assert.throws(() => encounter(null, 'pageA', NOW, {senseKey: 's1'}), TypeError);
});

test('interact 的帮助动作重置阶段并计入帮助次数', () => {
  const base = word({opportunityDays: 5, quietUntil: NOW + DAY, quietCycles: 2, quietOpportunityDays: 2, hintPreference: 'less', assistedPageKey: 'old'}, {helpCount: 3});
  const helped = interact(base, 'help', NOW, 'pageZ', 's1');
  assert.equal(helped.helpCount, 4);
  assert.equal(helped.hintPreference, null);
  assert.equal(helped.senses[0].hintPreference, null);
  assert.equal(helped.senses[0].opportunityDays, 0);
  assert.equal(helped.senses[0].lastOpportunityAt, 0);
  assert.equal(helped.senses[0].lastHelpAt, NOW);
  assert.equal(helped.senses[0].quietUntil, 0);
  assert.equal(helped.senses[0].quietCycles, 0);
  assert.equal(helped.senses[0].quietOpportunityDays, 0);
  assert.equal(helped.senses[0].assistedPageKey, 'pageZ');
  assert.equal(helped.revision, 1);
});

test('interact 的少帮助动作只改偏好不增加帮助次数', () => {
  const base = word({opportunityDays: 5}, {helpCount: 2, hintPreference: 'less'});
  const less = interact(base, 'less', NOW, 'ignored', 's1');
  assert.equal(less.senses[0].hintPreference, 'less');
  assert.equal(less.senses[0].quietUntil, 0);
  assert.equal(less.helpCount, 2);
  assert.equal(less.hintPreference, null);
});

test('interact 拒绝无效动作与目标', () => {
  assert.throws(() => interact(word(), 'mastered', NOW, '', 's1'), RangeError);
  assert.throws(() => interact(word(), 'help', NOW, '', 'missing'), RangeError);
  assert.throws(() => interact(null, 'help', NOW, '', 's1'), TypeError);
});
