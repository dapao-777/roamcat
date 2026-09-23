/**
 * @file tools/unit/gloss.test.mjs
 * 文件职责：为扩展与连接器共享的协议层 extension/gloss.mjs 提供 node:test 单元测试，
 *   覆盖自动支持、整页/本页翻译、查词帮助与摘要四类协议的输入规范化、模型返回校验、
 *   纠正重试与失败分类，保证连接器与扩展对同一份校验规则的理解不被单边改动破坏。
 * 主要内容：prepareSupportItems 焦点对齐、normalizeSupportProviderItems token/候选防篡改、
 *   normalizeSupportResult/Response 的字段与语言校验、requestSupportWithCorrection 的
 *   一次纠正路径与持续失败、翻译协议的 BATCH/ITEM/TRANSLATION 错误码、帮助协议的
 *   null 结果与 brief/full 分支、摘要结果兜底。
 * 模块边界：只 import 被测纯模块，不触碰 chrome、DOM 或网络；运行方式为
 *   `node --test tools/unit/`（Node 20+，无需安装依赖）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORT_POLICY_VERSION,
  SOURCE_DATA_INSTRUCTIONS,
  SUPPORT_SCHEMA,
  normalizePreparationContext,
  normalizeSupportItems,
  prepareSupportItems,
  normalizeSupportProviderItems,
  normalizeSupportResult,
  normalizeSupportResponse,
  normalizeSupportCorrections,
  inspectSupportResponse,
  normalizeSupportAttempt,
  requestSupportWithCorrection,
  normalizeEmergencyItems,
  normalizeEmergencyResult,
  normalizePageTranslationItems,
  inspectPageTranslationResult,
  normalizePageTranslationResult,
  normalizeAssistanceCommand,
  normalizeAssistanceRequest,
  normalizeAssistanceResult,
  normalizePageSummaryResult,
  assistanceSchema,
} from '../../roamcat-0.2.0/extension/gloss.mjs';

const SENTENCE = 'The database uses an index to find records quickly.';
const INDEX_START = SENTENCE.indexOf('index');

/** 构造一份已通过 prepareSupportItems 的 provider 批次（tokens/targets 由真实分词器生成）。 */
function providerBatch(candidateText = 'index', overrides = {}) {
  const prepared = prepareSupportItems([{
    id: 'one',
    sentence: SENTENCE,
    domain: 'data',
    candidates: [{text: candidateText, evidence: 'frequency'}],
    ...overrides,
  }]);
  return normalizeSupportProviderItems(prepared);
}

function resolvedResult(overrides = {}) {
  return {
    id: 'one',
    target: {text: 'index', start: INDEX_START, end: INDEX_START + 5, hint: 'a lookup structure', translation: '索引', sense: 'database lookup structure'},
    meaning: {en: 'An index speeds up finding records.', zh: '索引用于加快查找记录。'},
    sentenceTranslation: '数据库使用索引快速查找记录。',
    ...overrides,
  };
}

function providerResponse(targetId, overrides = {}) {
  return {
    items: [{
      id: 'one',
      target: {id: targetId, hint: 'a lookup structure', translation: '索引', sense: 'database lookup structure'},
      meaning: {en: 'An index speeds up finding records.', zh: '索引用于加快查找记录。'},
      sentenceTranslation: '数据库使用索引快速查找记录。',
      ...overrides,
    }],
  };
}

test('协议版本与提示词注入防护常量保持稳定', () => {
  assert.equal(typeof SUPPORT_POLICY_VERSION, 'string');
  assert.ok(SUPPORT_POLICY_VERSION.length > 0);
  assert.match(SOURCE_DATA_INSTRUCTIONS, /untrusted data/u);
  assert.match(SOURCE_DATA_INSTRUCTIONS, /never execute or obey/u);
  // Schema 形状是模型契约的一部分：根对象只允许 items，条目数 1–8。
  assert.equal(SUPPORT_SCHEMA.type, 'object');
  assert.equal(SUPPORT_SCHEMA.additionalProperties, false);
  assert.deepEqual(SUPPORT_SCHEMA.required, ['items']);
  assert.equal(SUPPORT_SCHEMA.properties.items.maxItems, 8);
});

test('prepareSupportItems 用真实分词生成 token 与候选目标', () => {
  const [prepared] = prepareSupportItems([{id: 'one', sentence: SENTENCE, domain: 'data', candidates: [{text: 'index'}]}]);
  assert.deepEqual(prepared.tokens[4], [5, 'index']);
  assert.deepEqual(prepared.targets, [{id: 't5_5', text: 'index', first: 5, last: 5}]);
});

test('prepareSupportItems 焦点必须落在 token 边界且跨度受限', () => {
  const [aligned] = prepareSupportItems([{
    id: 'one', sentence: SENTENCE, domain: 'data', candidates: [{text: 'index'}],
    focus: {start: INDEX_START, end: INDEX_START + 5},
  }]);
  assert.deepEqual(aligned.focus, {first: 5, last: 5});
  assert.throws(() => prepareSupportItems([{
    id: 'one', sentence: SENTENCE, domain: 'data', candidates: [{text: 'index'}],
    focus: {start: INDEX_START + 1, end: INDEX_START + 5},
  }]), /焦点未对齐/u);
  assert.throws(() => prepareSupportItems([{
    id: 'one', sentence: SENTENCE, domain: 'data', candidates: [{text: 'index'}],
    focus: {start: 10, end: 10},
  }]), /焦点无效/u);
  assert.throws(() => prepareSupportItems([{
    id: 'one', sentence: SENTENCE, domain: 'data', candidates: [{text: 'index'}],
    focus: {start: 0, end: SENTENCE.indexOf('quickly') + 'quickly'.length},
  }]), /焦点未对齐/u);
  assert.throws(() => prepareSupportItems([{
    id: 'one', sentence: SENTENCE, domain: 'data', candidates: [{text: 'index'}],
    focus: {start: 0, end: INDEX_START + 5},
  }]), /焦点不属于候选/u);
});

test('normalizeSupportProviderItems 拒绝被篡改的 token 与候选位置', () => {
  const items = providerBatch();
  const tamperedTokens = items.map(item => ({...item, tokens: item.tokens.map((token, index) => index === 0 ? [1, 'Wrong'] : token)}));
  assert.throws(() => normalizeSupportProviderItems(tamperedTokens), /token 无效/u);
  const tamperedTargets = items.map(item => ({...item, targets: []}));
  assert.throws(() => normalizeSupportProviderItems(tamperedTargets), /候选位置无效/u);
  const badFocus = items.map(item => ({...item, focus: {first: 5, last: 6}}));
  assert.throws(() => normalizeSupportProviderItems(badFocus), /候选位置无效|焦点不属于候选/u);
  const outOfRangeFocus = items.map(item => ({...item, focus: {first: 1, last: 999}}));
  assert.throws(() => normalizeSupportProviderItems(outOfRangeFocus), /焦点无效/u);
});

test('normalizeSupportItems 执行批次规模、候选与读者证据边界', () => {
  assert.throws(() => normalizeSupportItems([]), /1–8 项/u);
  assert.throws(() => normalizeSupportItems(Array.from({length: 9}, (_, i) => ({id: `i${i}`, sentence: SENTENCE, domain: 'data', candidates: []}))), /1–8 项/u);
  assert.throws(() => normalizeSupportItems([
    {id: 'one', sentence: SENTENCE, domain: 'data', candidates: []},
    {id: 'one', sentence: SENTENCE, domain: 'data', candidates: []},
  ]), /重复/u);
  assert.throws(() => normalizeSupportItems([{id: 'one', sentence: SENTENCE, domain: 'nope', candidates: []}]), /词项无效/u);
  assert.throws(() => normalizeSupportItems([{id: 'one', sentence: SENTENCE, domain: 'data', candidates: [{text: 'database'}, {text: 'uses'}, {text: 'index'}, {text: 'records'}]}]), /词项无效或重复/u);
  assert.throws(() => normalizeSupportItems([{id: 'one', sentence: SENTENCE, domain: 'data', candidates: [{text: 'not-in-sentence'}]}]), /候选无效/u);
  assert.throws(() => normalizeSupportItems([{
    id: 'one', sentence: SENTENCE, domain: 'data', candidates: [{text: 'index'}],
    reader: {recentQueries: Array.from({length: 13}, () => 'term'), lessHelpTerms: []},
  }]), /读者证据无效/u);
  const bulky = Array.from({length: 8}, (_, i) => ({id: `i${i}`, sentence: 'x'.repeat(1000), domain: 'data', candidates: [{text: 'x'}]}));
  assert.throws(() => normalizeSupportItems(bulky), /上下文过长/u);
});

test('normalizePreparationContext 校验文章键、覆盖度与长度', () => {
  assert.deepEqual(normalizePreparationContext(undefined), {key: '', text: '', coverage: 'excerpt'});
  assert.deepEqual(normalizePreparationContext(null), {key: '', text: '', coverage: 'excerpt'});
  const key = 'a'.repeat(64);
  assert.deepEqual(normalizePreparationContext({key, text: 'body', coverage: 'full'}), {key, text: 'body', coverage: 'full'});
  assert.throws(() => normalizePreparationContext({key, text: 'body', coverage: 'partial'}), /准备上下文无效/u);
  assert.throws(() => normalizePreparationContext({key, text: 'x'.repeat(12001), coverage: 'excerpt'}), /准备上下文无效/u);
  assert.throws(() => normalizePreparationContext({key: 'not-hash', text: 'body', coverage: 'full'}), /准备上下文无效/u);
  assert.throws(() => normalizePreparationContext({key, text: '   ', coverage: 'full'}), /准备上下文无效/u);
});

test('normalizeSupportResult 接受合法结果并按句内偏移回填目标', () => {
  const items = providerBatch();
  const result = normalizeSupportResult({items: [resolvedResult()]}, items, null);
  assert.equal(result.items[0].target.text, 'index');
  assert.equal(result.items[0].target.start, INDEX_START);
  assert.equal(result.items[0].target.end, INDEX_START + 5);
});

test('normalizeSupportResult 拒绝数量不符、ID 错误与越界偏移', () => {
  const items = providerBatch();
  assert.throws(() => normalizeSupportResult({items: []}, items, null), (error) => error.code === 'BATCH_COUNT');
  assert.throws(() => normalizeSupportResult({items: [{...resolvedResult(), id: 'other'}]}, items, null), (error) => error.code === 'ITEM_ID');
  assert.throws(() => normalizeSupportResult({items: [{...resolvedResult(), target: {...resolvedResult().target, start: 0, end: 5}}]}, items, null), /无效目标/u);
  assert.throws(() => normalizeSupportResult({items: [{...resolvedResult(), target: {...resolvedResult().target, hint: ' 索引结构 '}}]}, items, null), /无效目标/u);
  assert.throws(() => normalizeSupportResult({items: [{...resolvedResult(), target: {...resolvedResult().target, translation: 'a lookup structure'}}]}, items, null), /无效目标/u);
});

test('normalizeSupportResult 的 null 目标必须伴随 null 解释', () => {
  const items = providerBatch();
  const nulled = normalizeSupportResult({items: [{id: 'one', target: null, meaning: {en: null, zh: null}, sentenceTranslation: null}]}, items, null);
  assert.equal(nulled.items[0].target, null);
  assert.deepEqual(nulled.items[0].meaning, {en: null, zh: null});
  assert.throws(() => normalizeSupportResult({items: [{id: 'one', target: null, meaning: {en: 'Something here', zh: '某个东西'}, sentenceTranslation: null}]}, items, null), /无目标的解释/u);
  assert.throws(() => normalizeSupportResult({items: [{id: 'one', target: null, meaning: {en: null, zh: null}, sentenceTranslation: '数据库。'}]}, items, null), /本句翻译无效/u);
});

test('normalizeSupportResponse 把 provider 目标 ID 解析为字符区间', () => {
  const items = providerBatch();
  const result = normalizeSupportResponse(providerResponse(items[0].targets[0].id), items, null);
  assert.equal(result.items[0].target.start, INDEX_START);
  assert.equal(result.items[0].target.end, INDEX_START + 5);
  assert.throws(() => normalizeSupportResponse(providerResponse('t9_9'), items, null), /未提供的目标编号/u);
});

test('inspectSupportResponse 把可纠正的文本错误分流到 invalid 并保留焦点', () => {
  const items = providerBatch();
  const inspected = inspectSupportResponse(providerResponse(items[0].targets[0].id, {
    target: {id: items[0].targets[0].id, hint: '索引结构', translation: '索引', sense: 'database lookup structure'},
  }), items, null);
  assert.equal(inspected.items.length, 0);
  assert.deepEqual(inspected.invalid, [{id: 'one', fields: ['target', 'hint'], focus: {first: 5, last: 5}}]);
  // 信封级错误（数量不符）必须整体抛出，不能降级为纠正。
  assert.throws(() => inspectSupportResponse({items: []}, items, null), (error) => error.code === 'BATCH_COUNT');
});

test('requestSupportWithCorrection 无候选词项不请求模型', async () => {
  const items = providerBatch('The database uses an index to find records quickly');
  assert.equal(items[0].targets.length, 0);
  let called = 0;
  const result = await requestSupportWithCorrection(items, null, async () => { called++; return {items: [], invalid: []}; });
  assert.equal(called, 0);
  assert.deepEqual(result.items[0], {id: 'one', target: null, meaning: {en: null, zh: null}, sentenceTranslation: null});
});

test('requestSupportWithCorrection 首次合法即完成', async () => {
  const items = providerBatch();
  const calls = [];
  const result = await requestSupportWithCorrection(items, null, async (batch, corrections) => {
    calls.push({count: batch.length, corrections});
    return {items: [resolvedResult()], invalid: []};
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].corrections, []);
  assert.equal(result.items[0].target.translation, '索引');
});

test('requestSupportWithCorrection 对文本类错误执行一次纠正重试', async () => {
  const items = providerBatch();
  const calls = [];
  const result = await requestSupportWithCorrection(items, null, async (batch, corrections) => {
    calls.push({count: batch.length, corrections: structuredClone(corrections)});
    if (calls.length === 1) {
      return {items: [], invalid: [{id: 'one', fields: ['target', 'translation']}]};
    }
    return {items: [resolvedResult()], invalid: []};
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].corrections, [{id: 'one', fields: ['target', 'translation']}]);
  assert.equal(result.items[0].target.translation, '索引');
});

test('requestSupportWithCorrection 纠正后仍失败时抛出中文可操作错误', async () => {
  const items = providerBatch();
  await assert.rejects(
    requestSupportWithCorrection(items, null, async () => ({items: [], invalid: [{id: 'one', fields: ['target', 'translation']}]})),
    (error) => error.code === 'OUTPUT_INVALID' && /纠正后仍返回无效的中文短释义/u.test(error.message),
  );
});

test('normalizeSupportAttempt 要求 items 与 invalid 完整覆盖批次', () => {
  const items = providerBatch();
  assert.throws(() => normalizeSupportAttempt({items: [resolvedResult()]}, items, null), (error) => error.code === 'BATCH_SHAPE');
  assert.throws(() => normalizeSupportAttempt({items: [], invalid: [{id: 'ghost', fields: ['target', 'hint']}]}, items, null), /纠正字段无效/u);
});

test('normalizeSupportCorrections 只接受已登记的文本字段', () => {
  const items = providerBatch();
  assert.deepEqual(normalizeSupportCorrections([{id: 'one', fields: ['target', 'translation']}], items), [{id: 'one', fields: ['target', 'translation']}]);
  assert.throws(() => normalizeSupportCorrections([{id: 'one', fields: ['target', 'id']}], items), /纠正字段无效/u);
  assert.throws(() => normalizeSupportCorrections([{id: 'one', fields: ['meaning']}], items), /纠正字段无效/u);
  assert.throws(() => normalizeSupportCorrections([{id: 'one', fields: ['target', 'hint']}, {id: 'one', fields: ['target', 'hint']}], items), /纠正请求无效|纠正字段无效/u);
});

test('整页应急翻译协议校验批次与译文', () => {
  const items = normalizeEmergencyItems([{id: 'one', text: 'The database uses an index.'}]);
  assert.deepEqual(items, [{id: 'one', text: 'The database uses an index.'}]);
  assert.throws(() => normalizeEmergencyItems(Array.from({length: 5}, (_, i) => ({id: `i${i}`, text: 'x'}))), /1–4 项/u);
  assert.throws(() => normalizeEmergencyItems([{id: 'one', text: '   '}]), /无效或重复/u);
  assert.throws(() => normalizeEmergencyItems([{id: 'one', text: 'x'.repeat(4001)}]), /无效或重复/u);
  assert.throws(() => normalizeEmergencyItems(Array.from({length: 4}, () => ({id: 'dup', text: 'x'}))), /重复/u);

  const batch = [{id: 'one', text: 'The database uses an index.'}, {id: 'two', text: 'A cache reduces latency.'}];
  const ok = normalizeEmergencyResult({items: [{id: 'one', translation: '数据库使用索引。'}, {id: 'two', translation: '缓存降低延迟。'}]}, batch);
  assert.deepEqual(ok.items.map(item => item.translation), ['数据库使用索引。', '缓存降低延迟。']);
  assert.throws(() => normalizeEmergencyResult({items: [{id: 'one', translation: '数据库。'}]}, batch), (error) => error.code === 'BATCH_COUNT');
  assert.throws(() => normalizeEmergencyResult({items: [{id: 'one', translation: 'Database index'}, {id: 'two', translation: '缓存。'}]}, batch), (error) => error.code === 'TRANSLATION_NO_HAN');
  assert.throws(() => normalizeEmergencyResult({items: [{id: 'one', translation: ' 数据库。'}, {id: 'two', translation: '缓存。'}]}, batch), (error) => error.code === 'TRANSLATION_WHITESPACE');
  assert.throws(() => normalizeEmergencyResult({items: [{id: 'ghost', translation: '数据库。'}, {id: 'two', translation: '缓存。'}]}, batch), (error) => error.code === 'ITEM_ID');
  assert.throws(() => normalizeEmergencyResult({items: [{id: 'one', translation: '数据库。'}, {id: 'one', translation: '缓存。'}]}, batch), (error) => error.code === 'ITEM_DUPLICATE');
  assert.throws(() => normalizeEmergencyResult({items: [{id: 'one', translation: '数据库。', extra: 1}, {id: 'two', translation: '缓存。'}]}, batch), (error) => error.code === 'ITEM_FIELDS');
});

test('本页翻译协议校验封闭上下文与部分失败', () => {
  const items = normalizePageTranslationItems([{
    id: 'one', text: 'The database uses an index.',
    context: {title: 'How databases work', heading: 'Indexes', before: 'A cache helps.', after: 'Records stay sorted.'},
  }]);
  assert.equal(items[0].context.before, 'A cache helps.');
  assert.throws(() => normalizePageTranslationItems([{id: 'one', text: 'x', context: {title: '', heading: '', before: 'y'.repeat(401), after: ''}}]), /上下文无效/u);
  assert.equal(normalizePageTranslationItems(Array.from({length: 8}, (_, i) => ({
    id: `i${i}`, text: 'x', context: {title: '', heading: '', before: '', after: ''},
  }))).length, 8);
  assert.throws(() => normalizePageTranslationItems(Array.from({length: 9}, (_, i) => ({
    id: `i${i}`, text: 'x', context: {title: '', heading: '', before: '', after: ''},
  }))), /1–8 项/u);
  assert.throws(() => normalizePageTranslationItems(Array.from({length: 6}, (_, i) => ({
    id: `i${i}`, text: 'x'.repeat(4000), context: {title: '', heading: '', before: '', after: ''},
  }))), /过长/u);

  const context = {title: '', heading: '', before: '', after: ''};
  const batch = [{id: 'one', text: 'The database uses an index.', context}, {id: 'two', text: 'A cache reduces latency.', context}];
  const inspected = inspectPageTranslationResult('{"items":[{"id":"one","translation":"数据库使用索引。"},{"id":"two","translation":"cache lowers latency"}]}', batch);
  assert.deepEqual(inspected.items, [{id: 'one', translation: '数据库使用索引。'}]);
  assert.deepEqual(inspected.errors, [{id: 'two', code: 'TRANSLATION_NO_HAN'}]);
  assert.deepEqual(inspectPageTranslationResult('not json', batch).errors.map(error => error.code), ['BATCH_SHAPE', 'BATCH_SHAPE']);
  assert.deepEqual(inspectPageTranslationResult({items: [{id: 'ghost', translation: '数据库。'}]}, batch).errors.map(error => error.code), ['ITEM_ID', 'ITEM_ID']);

  const merged = normalizePageTranslationResult({
    items: [{id: 'one', translation: '数据库使用索引。'}],
    errors: [{id: 'two', code: 'TRANSLATION_NO_HAN'}],
  }, batch);
  assert.deepEqual(merged.items.map(item => item.id), ['one']);
  assert.deepEqual(merged.errors, [{id: 'two', code: 'TRANSLATION_NO_HAN'}]);
  assert.throws(() => normalizePageTranslationResult({items: [{id: 'one', translation: '数据库。'}], errors: []}, batch), (error) => error.code === 'BATCH_SHAPE');
  assert.throws(() => normalizePageTranslationResult({
    items: [{id: 'one', translation: '数据库。'}],
    errors: [{id: 'one', code: 'BATCH_COUNT'}],
  }, batch), (error) => error.code === 'ITEM_FIELDS');
});

test('帮助请求规范化强制 context 包含 text 与段落限制', () => {
  const base = {text: 'index', context: 'The database uses an index.', domain: 'data', kind: 'word', level: 'hint', detail: 'brief'};
  assert.deepEqual(normalizeAssistanceRequest(base), base);
  assert.throws(() => normalizeAssistanceRequest({...base, context: 'Nothing here.'}), /帮助请求无效/u);
  assert.throws(() => normalizeAssistanceRequest({...base, kind: 'passage', detail: 'brief'}), /帮助请求无效/u);
  assert.throws(() => normalizeAssistanceRequest({...base, text: 'x'.repeat(101), context: 'x'.repeat(101)}), /不能超过 100 字符/u);
  const long = 'One sentence here. Two sentence here. Three sentence here. Four sentence here.';
  assert.throws(() => normalizeAssistanceRequest({...base, kind: 'passage', detail: 'full', text: long, context: long}), /最多 3 句/u);
});

test('帮助结果校验覆盖 null、brief/full 与语言约束', () => {
  const word = {text: 'index', context: 'The database uses an index.', domain: 'data', kind: 'word', level: 'hint', detail: 'brief'};
  assert.deepEqual(normalizeAssistanceResult({level: 'hint', hint: 'a lookup structure', sense: 'database lookup structure'}, word), {level: 'hint', hint: 'a lookup structure', sense: 'database lookup structure'});
  assert.deepEqual(normalizeAssistanceResult({level: 'hint', hint: null}, word), {level: 'hint', hint: null});
  assert.throws(() => normalizeAssistanceResult({level: 'hint', hint: null, sense: 'x'}, word), /不得包含义项/u);
  assert.throws(() => normalizeAssistanceResult({level: 'hint', hint: 'a lookup structure'}, word), /义项无效/u);
  assert.throws(() => normalizeAssistanceResult({level: 'hint', hint: 'a rather long lookup structure with too many words here', sense: 's'}, word), /内容无效/u);
  assert.throws(() => normalizeAssistanceResult({level: 'hint', hint: 'a lookup structure', sense: 's', details: {}}, word), /格式无效/u);

  const full = {...word, level: 'rescue', detail: 'full'};
  assert.deepEqual(normalizeAssistanceResult({
    level: 'rescue', translation: '索引', sense: 'lookup structure',
    details: {meaning: {en: 'An index speeds up finding records.', zh: '索引用于加快查找记录。'}, sentenceTranslation: '数据库使用索引。'},
  }, full), {
    level: 'rescue', translation: '索引', sense: 'lookup structure',
    details: {meaning: {en: 'An index speeds up finding records.', zh: '索引用于加快查找记录。'}, sentenceTranslation: '数据库使用索引。'},
  });
  assert.throws(() => normalizeAssistanceResult({level: 'rescue', translation: 'index', sense: 's'}, full), /内容无效/u);
  assert.throws(() => normalizeAssistanceResult({
    level: 'rescue', translation: '索引', sense: 's',
    details: {meaning: {en: 'An index speeds up finding records.', zh: '索引用于加快查找记录。'}, sentenceTranslation: 'database uses an index'},
  }, full), /三段解释/u);

  const passageSentence = 'One sentence here. Two sentence here. Three sentence here.';
  const passage = {text: passageSentence, context: passageSentence, domain: 'data', kind: 'passage', level: 'rescue', detail: 'full'};
  assert.deepEqual(normalizeAssistanceResult({level: 'rescue', translation: '数据库使用索引来查找记录。'}, passage), {level: 'rescue', translation: '数据库使用索引来查找记录。'});
  assert.throws(() => normalizeAssistanceResult({level: 'rescue', translation: 'x'.repeat(1201)}, passage), /内容无效/u);
});

test('normalizeAssistanceCommand 装配请求身份与缓存绕过', () => {
  const command = {requestId: 'r1', text: 'index', context: 'The database uses an index.', domain: 'data', kind: 'word', level: 'hint', detail: 'brief', bypassCache: true, wordId: 'data:index', senseKey: 's1'};
  const normalized = normalizeAssistanceCommand(command);
  assert.equal(normalized.requestId, 'r1');
  assert.equal(normalized.bypassCache, true);
  assert.equal(normalized.wordId, 'data:index');
  assert.equal(normalizeAssistanceCommand({...command, bypassCache: undefined}).bypassCache, false);
  assert.throws(() => normalizeAssistanceCommand({...command, extra: 1}), /字段无效/u);
  assert.throws(() => normalizeAssistanceCommand({...command, bypassCache: 'yes'}), /身份无效/u);
});

test('assistanceSchema 按 kind/level/detail 派生结构化输出契约', () => {
  const wordBrief = assistanceSchema({kind: 'word', level: 'hint', detail: 'brief'});
  assert.deepEqual(wordBrief.required, ['result']);
  assert.equal(wordBrief.properties.result.anyOf.length, 2);
  const passage = assistanceSchema({kind: 'passage', level: 'rescue', detail: 'full'});
  assert.equal(passage.properties.result.properties.translation.anyOf[1].maxLength, 1200);
  assert.deepEqual(passage.properties.result.required, ['translation', 'level']);
  assert.equal(passage.properties.result.anyOf, undefined);
});

test('normalizePageSummaryResult 兜底领域并拒绝空摘要', () => {
  const summary = normalizePageSummaryResult({takeaway: '索引加快查询。', highlights: ['**索引**：更快查找。'], keywords: ['index'], domain: 'nope'});
  assert.equal(summary.domain, 'general');
  assert.deepEqual(summary.keywords, ['index']);
  assert.throws(() => normalizePageSummaryResult({takeaway: '  ', highlights: ['x'], keywords: [], domain: 'tech'}), /核心结论/u);
  assert.throws(() => normalizePageSummaryResult({takeaway: '结论', highlights: ['', '  '], keywords: [], domain: 'tech'}), /要点/u);
  assert.throws(() => normalizePageSummaryResult(null), /摘要结果无效/u);
});
