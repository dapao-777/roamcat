/**
 * @file tools/unit/lexicon.test.mjs
 * 文件职责：为领域层 extension/lexicon.js 的候选提名算法提供 node:test 单元测试——
 *   它是 ANALYZE / SUPPORT_BATCH 的提名来源，此前只有浏览器审计间接覆盖，本文件把
 *   词形归一、已知词排除、自定义/静态术语、优先级、出现位置与读者证据固化为可重复断言。
 * 主要内容：termPattern 的词形边界、isKnownTerm 的大小写不敏感、resolveCanonicalTerm 的
 *   历史 canonical 解析、historyMatches 的位置匹配、englishTokenStats 的统计口径、
 *   analyze 的领域传播/排序/排除规则（已知词、停用词、中专有名词、句首大写）、
 *   自定义术语与 priorityTerms 覆盖、analyzeBatch 的按域准备共享。
 * 模块边界：只 import 被测纯模块（含频率静态数据）；运行方式为在仓库根执行 node:test
 *   自动发现本目录全部 .test.mjs。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  termPattern,
  isKnownTerm,
  resolveCanonicalTerm,
  historyMatches,
  englishTokenStats,
  localReferenceFor,
  analyze,
  analyzeBatch,
  ensureLexicon,
} from '../../roamcat-0.0.1/extension/lexicon.js';

// 词频表经 ensureLexicon 动态装载；顶层 await 先于全部用例完成。
await ensureLexicon();

test('词频 .txt 孪生文件与 .js 导出词序一致（SW fetch 路径的数据源）', async () => {
  const url = new URL('../../roamcat-0.0.1/extension/frequency/english-frequency.txt', import.meta.url);
  const words = (await readFile(url, 'utf8')).split('\n').filter(Boolean);
  const {ENGLISH_FREQUENCY_RANK} = await import('../../roamcat-0.0.1/extension/frequency/english-frequency.js');
  assert.equal(words.length, ENGLISH_FREQUENCY_RANK.size);
  assert.deepEqual(words, [...ENGLISH_FREQUENCY_RANK.keys()]);
});

const SENTENCE = 'The database uses an index to find records quickly.';
const knownWord = (term, domain = 'data') => ({
  id: `${domain}:${term}`, term, domain, kind: 'word', revision: 1, helpCount: 1,
  requestedAt: 5, knownAt: Date.now(), senses: [{key: 's1', label: 'a sense', lastHelpAt: 5}],
});

test('termPattern 用字符类边界防止子串误匹配', () => {
  assert.equal(termPattern('index').source, '(?<![a-zA-Z0-9_])index(?![a-zA-Z0-9_])');
  const found = [...'an index. indexes reindex'.matchAll(termPattern('index', 'gi'))].map(match => match[0]);
  assert.deepEqual(found, ['index']);
  assert.equal(termPattern('primary key', 'iu').test('a primary key'), true);
});

test('isKnownTerm 大小写不敏感且只认已知词', () => {
  const words = [knownWord('index')];
  assert.equal(isKnownTerm('index', words), true);
  assert.equal(isKnownTerm('Index', words), true);
  assert.equal(isKnownTerm('  INDEX  ', words), true);
  assert.equal(isKnownTerm('cache', words), false);
  assert.equal(isKnownTerm('index', []), false);
  assert.equal(isKnownTerm('', words), false);
});

test('resolveCanonicalTerm 解析历史 canonical、短语直通与空值', () => {
  const words = [knownWord('index')];
  assert.equal(resolveCanonicalTerm('indexes', 'data', words), 'index');
  assert.equal(resolveCanonicalTerm('Index', 'data', words), 'index');
  assert.equal(resolveCanonicalTerm('Primary Key', 'data', words), 'primary key');
  assert.equal(resolveCanonicalTerm('', 'data', words), '');
  assert.equal(resolveCanonicalTerm('brandnew', 'data', words), 'brandnew');
  // auto/未知领域回落 general。
  assert.equal(resolveCanonicalTerm('brandnew', 'auto', words), 'brandnew');
});

test('historyMatches 返回句内偏移', () => {
  const words = [knownWord('index')];
  const matches = historyMatches('The database uses an index.', 'data', words);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].text, 'index');
  assert.equal(matches[0].start, 21);
  assert.equal(matches[0].end, 26);
  assert.deepEqual(historyMatches('nothing here', 'data', words), []);
});

test('englishTokenStats 统计词数、命中与功能词', () => {
  assert.deepEqual(englishTokenStats('The database uses an index to find records quickly.'), {tokens: 9, recognized: 9, functionWords: 2});
  assert.deepEqual(englishTokenStats(''), {tokens: 0, recognized: 0, functionWords: 0});
  assert.deepEqual(englishTokenStats('123 !!! ---'), {tokens: 0, recognized: 0, functionWords: 0});
});

test('localReferenceFor 命中静态词注并回退 general', () => {
  const reference = localReferenceFor('index', 'data', {});
  assert.equal(reference.term, 'index');
  assert.equal(reference.domain, 'data');
  assert.equal(reference.custom, false);
  assert.ok(typeof reference.translation === 'string' && reference.translation.length > 0);
  // 自定义术语优先于静态词注。
  const custom = localReferenceFor('index', 'data', {customTerms: [{term: 'index', translation: '自定义索引', domain: 'data'}]});
  assert.equal(custom.translation, '自定义索引');
  assert.equal(custom.custom, true);
  assert.equal(localReferenceFor('zzzznotaword', 'data', {}), null);
});

test('analyze 传播领域并按优先级排序候选', () => {
  const result = analyze(SENTENCE, {domain: 'data'}, [], 'data');
  assert.equal(result.domain, 'data');
  const terms = result.terms;
  assert.ok(terms.length >= 2);
  // priority 降序；出现位置用于同级决胜。
  for (let i = 1; i < terms.length; i++) assert.ok(terms[i - 1].priority >= terms[i].priority);
  const database = terms.find(term => term.term === 'database');
  assert.equal(database.reason, 'frequency');
  // 公开形状：rank/position 等内部评分字段不外泄。
  assert.deepEqual(Object.keys(database).sort(), ['canonicalTerm', 'domain', 'id', 'kind', 'occurrences', 'priority', 'reason', 'term']);
  assert.ok(database.occurrences.length >= 1);
  assert.ok(database.occurrences[0].start >= 0 && database.occurrences[0].end > database.occurrences[0].start);
  assert.equal(database.position, undefined);
});

test('analyze 排除已知词、停用词与中专有名词，保留句首大写普通词', () => {
  const known = [knownWord('index')];
  const filtered = analyze(SENTENCE, {domain: 'data'}, known, 'data').terms;
  assert.equal(filtered.some(term => term.canonicalTerm === 'index'), false);

  const prose = analyze('The RoamCat mascot reads gently.', {domain: 'general'}, [], 'general').terms;
  assert.equal(prose.some(term => term.term === 'the'), false, '停用词不应成为候选');
  assert.equal(prose.some(term => term.canonicalTerm === 'roamcat'), false, '中专有名词不应成为候选');

  const initial = analyze('Database engines optimize joins.', {domain: 'data'}, [], 'data').terms;
  assert.ok(initial.some(term => term.term === 'database'), '句首大写的普通词仍可提名');
});

test('analyze 收录自定义术语并响应 priorityTerms', () => {
  const custom = analyze(SENTENCE, {domain: 'data', customTerms: [{term: 'index', translation: '索引', domain: 'data'}]}, [], 'data').terms;
  const entry = custom.find(term => term.term === 'index');
  assert.equal(entry.reason, 'custom');
  assert.equal(entry.priority, 2.5);

  const priority = analyze(SENTENCE, {domain: 'data', annotationPolicy: {priorityTerms: ['quickly']}}, [], 'data').terms;
  assert.deepEqual(priority.filter(term => term.priority === 4).map(term => term.term), ['quickly']);
});

test('analyze 对短语术语聚合多次出现', () => {
  const result = analyze('A primary key identifies each record. The primary key is unique.', {domain: 'data'}, [], 'data').terms;
  const phrase = result.find(term => term.term === 'primary key');
  assert.equal(phrase.kind, 'phrase');
  assert.equal(phrase.occurrences.length, 2);
  assert.deepEqual(phrase.occurrences.map(occurrence => occurrence.start), [2, 42]);
});

test('analyzeBatch 按项领域分别准备并共享已知/优先级集合', () => {
  assert.deepEqual(analyzeBatch('nope', {}, [], 'data'), []);
  const results = analyzeBatch([
    {sentence: SENTENCE, domain: 'data'},
    {sentence: 'A cache reduces latency when requests repeat.', domain: 'data'},
  ], {domain: 'data'}, [knownWord('index')], 'data');
  assert.equal(results.length, 2);
  assert.ok(results.every(result => result.domain === 'data'));
  // 共享的已知词集合对两项都生效。
  assert.ok(results.every(result => !result.terms.some(term => term.canonicalTerm === 'index')));
  assert.ok(results[1].terms.some(term => term.term === 'cache') || results[1].terms.some(term => term.term === 'latency'));
});

test('analyze 对非字符串输入安全降级', () => {
  const result = analyze(undefined, {domain: 'data'}, [], 'data');
  assert.deepEqual(result.terms, []);
  assert.equal(analyzeBatch([{sentence: null}], {}, [], 'data')[0].terms.length, 0);
});
