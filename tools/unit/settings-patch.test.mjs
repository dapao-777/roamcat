/**
 * @file tools/unit/settings-patch.test.mjs
 * 文件职责：为 message-protocol.js 中从 background.js 下沉的重型纯逻辑提供 node:test 单元测试——
 *   设置补丁校验、STATE_PATCH 副作用计划与小型载荷解析器，把这些曾经只能靠浏览器审计覆盖的
 *   内联验证变成毫秒级可重复断言。
 * 主要内容：validatePatch 的白名单/形态/引用完整性（含领域识别、API 服务、术语、伴读猫），
 *   settingsPatchEffects 的四类变更信号推导，parseAnalyze/parseHistoryRuleSet/
 *   parseHistoryRecordRef/parseHistorySummaryEdit 的边界，以及 CONNECTOR_KINDS 与
 *   subscription.js 的镜像一致性。
 * 模块边界：只 import 被测纯模块与 shared.js/subscription.js（均为 import 安全模块）；
 *   运行方式为在仓库根执行 node:test 自动发现本目录全部 .test.mjs。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  CONNECTOR_KINDS,
  validatePatch,
  settingsPatchEffects,
  parseAnalyze,
  parseHistoryRuleSet,
  parseHistoryRecordRef,
  parseHistorySummaryEdit,
} from '../../roamcat-0.2.0/extension/message-protocol.js';
import {normalizeSettings} from '../../roamcat-0.2.0/extension/shared.js';
import {SUBSCRIPTION_KINDS} from '../../roamcat-0.2.0/extension/subscription.js';

const currentSettings = normalizeSettings();

test('CONNECTOR_KINDS 与 subscription.js 的连接器清单保持镜像一致', () => {
  assert.deepEqual([...CONNECTOR_KINDS].sort(), [...SUBSCRIPTION_KINDS].sort());
});

test('validatePatch 接受空补丁并拒绝未知设置项', () => {
  assert.deepEqual(validatePatch({}, currentSettings), {});
  assert.throws(() => validatePatch(null, currentSettings), /无效设置。/u);
  assert.throws(() => validatePatch([], currentSettings), /无效设置。/u);
  assert.throws(() => validatePatch({unknownKey: 1}, currentSettings), /未知设置项。/u);
  // automation/video 必须走各自接口。
  assert.throws(() => validatePatch({automation: {allSites: true}}, currentSettings), /自动开启或视频设置接口/u);
  assert.throws(() => validatePatch({video: {fontSize: 20}}, currentSettings), /自动开启或视频设置接口/u);
});

test('validatePatch 校验枚举类设置', () => {
  assert.deepEqual(validatePatch({assistanceMode: 'on-demand'}, currentSettings), {assistanceMode: 'on-demand'});
  assert.throws(() => validatePatch({assistanceMode: 'always'}, currentSettings), /无效辅助模式。/u);
  assert.deepEqual(validatePatch({lookupDisplay: 'annotation'}, currentSettings), {lookupDisplay: 'annotation'});
  assert.throws(() => validatePatch({lookupDisplay: 'popup'}, currentSettings), /无效查词展示方式。/u);
  assert.deepEqual(validatePatch({helpLanguage: 'en'}, currentSettings), {helpLanguage: 'en'});
  assert.throws(() => validatePatch({helpLanguage: 'ja'}, currentSettings), /无效的帮助语言。/u);
  assert.deepEqual(validatePatch({lookupKey: 'F'}, currentSettings), {lookupKey: 'F'});
  assert.throws(() => validatePatch({lookupKey: 'f'}, currentSettings), /大写 A-Z/u);
  assert.throws(() => validatePatch({lookupKey: 'FF'}, currentSettings), /大写 A-Z/u);
  assert.deepEqual(validatePatch({rememberSupport: false}, currentSettings), {rememberSupport: false});
  assert.throws(() => validatePatch({rememberSupport: 'no'}, currentSettings), /无效记忆设置。/u);
  assert.deepEqual(validatePatch({domain: 'tech'}, currentSettings), {domain: 'tech'});
  assert.throws(() => validatePatch({domain: 'nope'}, currentSettings), /不支持的领域。/u);
  assert.deepEqual(validatePatch({subscriptionModel: '  gpt-5  '}, currentSettings), {subscriptionModel: 'gpt-5'});
  assert.throws(() => validatePatch({subscriptionModel: 'x'.repeat(151)}, currentSettings), /不能超过 150/u);
  assert.throws(() => validatePatch({providerKind: 'bedrock'}, currentSettings), /不支持的服务类型。/u);
  assert.deepEqual(validatePatch({providerKind: 'api'}, currentSettings), {providerKind: 'api'});
});

test('validatePatch 校验领域识别配置的形状与 Jev 地址', () => {
  const base = {useTranslationApi: false, mode: 'local', api: {baseUrl: 'https://api.example.com/v1', apiKey: ''}};
  assert.deepEqual(validatePatch({domainDetection: base}, currentSettings).domainDetection, {
    mode: 'local', subscriptionModel: '', apiModel: '', useTranslationApi: false,
    api: {baseUrl: 'https://api.example.com/v1', apiKey: ''}, jevModel: '', jevApiKey: '', jevBaseUrl: 'https://router.requesty.ai/v1',
  });
  assert.throws(() => validatePatch({domainDetection: {...base, mode: 'telepathy'}}, currentSettings), /无效的领域识别配置。/u);
  assert.throws(() => validatePatch({domainDetection: {mode: 'local', useTranslationApi: 'yes'}}, currentSettings), /无效的领域识别配置。/u);
  // api 模式必须提供识别 API 地址与模型；chatgpt 模式必须提供识别订阅模型。
  assert.throws(() => validatePatch({domainDetection: {useTranslationApi: false, mode: 'api'}}, currentSettings), /识别 API 地址不能为空/u);
  assert.throws(() => validatePatch({domainDetection: {...base, mode: 'api'}}, currentSettings), /识别 API 模型不能为空/u);
  assert.throws(() => validatePatch({domainDetection: {...base, mode: 'chatgpt'}}, currentSettings), /识别订阅模型不能为空/u);
  assert.throws(() => validatePatch({domainDetection: {...base, jevBaseUrl: 'ftp://router.invalid'}}, currentSettings), /Jev 接口地址必须是有效的 HTTP 或 HTTPS/u);
  const detection = validatePatch({domainDetection: {...base, mode: 'api', api: {baseUrl: 'https://api.example.com/v1', apiKey: 'k'}, apiModel: 'm'}}, currentSettings).domainDetection;
  assert.equal(detection.apiModel, 'm');
  assert.equal(detection.api.apiKey, 'k');
});

test('validatePatch 校验 API 服务列表与当前服务引用', () => {
  const service = (id, extra = {}) => ({id, name: id, providerId: 'openai-compatible', baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'k', ...extra});
  const single = validatePatch({apiServices: [service('one')], activeApiServiceId: 'one'}, currentSettings);
  assert.equal(single.apiServices.length, 1);
  assert.equal(single.activeApiServiceId, 'one');
  assert.throws(() => validatePatch({apiServices: Array.from({length: 21}, (_, i) => service(`s${i}`))}, currentSettings), /最多保存 20 个/u);
  assert.throws(() => validatePatch({apiServices: [{...service('one'), unknown: 1}]}, currentSettings), /未知字段/u);
  assert.throws(() => validatePatch({apiServices: [{...service('one'), apiKey: ''}]}, currentSettings), /API Key 不能为空/u);
  assert.throws(() => validatePatch({apiServices: [service('one'), service('one')]}, currentSettings), /编号必须安全且唯一/u);
  assert.throws(() => validatePatch({apiServices: [service('bad id')]}, currentSettings), /编号必须安全且唯一/u);
  assert.throws(() => validatePatch({apiServices: [service('one')]}, currentSettings), /当前 API 服务必须引用已保存的服务/u);
  // 当前设置已有 active 服务时，替换列表必须同时保留或显式改选。
  const withActive = normalizeSettings();
  withActive.apiServices = [service('one')];
  withActive.activeApiServiceId = 'one';
  assert.throws(() => validatePatch({apiServices: [service('two')]}, withActive), /移除当前 API 服务时必须同时选择替代服务/u);
  assert.deepEqual(validatePatch({apiServices: [service('one'), service('two')], activeApiServiceId: 'two'}, withActive).activeApiServiceId, 'two');
  assert.throws(() => validatePatch({apiServices: [], activeApiServiceId: 'one'}, currentSettings), /没有 API 服务时当前服务必须为空/u);
});

test('validatePatch 校验术语表与伴读猫设置', () => {
  const term = {term: 'latency', translation: '延迟', domain: 'tech'};
  assert.deepEqual(validatePatch({customTerms: [term]}, currentSettings), {customTerms: [term]});
  assert.throws(() => validatePatch({customTerms: [term, {...term}]}, currentSettings), /同一领域不能重复添加相同术语/u);
  assert.throws(() => validatePatch({customTerms: [{...term, domain: 'auto'}]}, currentSettings), /个人术语需要指定领域/u);
  assert.throws(() => validatePatch({customTerms: Array.from({length: 1001}, () => term)}, currentSettings), /术语表最多保存 1000 条/u);

  assert.deepEqual(validatePatch({floatingPet: {enabled: false}}, currentSettings).floatingPet, {
    enabled: false, position: {right: 24, bottom: 84}, themeMode: 'auto',
  });
  assert.deepEqual(validatePatch({floatingPet: {position: {right: 10, bottom: 20}, themeMode: 'dark'}}, currentSettings).floatingPet, {
    enabled: true, position: {right: 10, bottom: 20}, themeMode: 'dark',
  });
  assert.throws(() => validatePatch({floatingPet: {position: {right: -1, bottom: 20}}}, currentSettings), /伴读猫位置无效。/u);
  assert.throws(() => validatePatch({floatingPet: {position: {right: 20000, bottom: 20}}}, currentSettings), /伴读猫位置无效。/u);
  assert.throws(() => validatePatch({floatingPet: {enabled: 'yes'}}, currentSettings), /无效的伴读猫开关。/u);
  assert.throws(() => validatePatch({floatingPet: []}, currentSettings), /无效的伴读猫设置。/u);
  // 缺失键回退到当前设置。
  const dark = normalizeSettings();
  dark.floatingPet = {enabled: true, position: {right: 5, bottom: 6}, themeMode: 'dark'};
  assert.deepEqual(validatePatch({floatingPet: {position: {right: 30, bottom: 40}}}, dark).floatingPet, {
    enabled: true, position: {right: 30, bottom: 40}, themeMode: 'dark',
  });
});

test('settingsPatchEffects 推导合并设置与四类变更信号', () => {
  const empty = settingsPatchEffects(currentSettings, {});
  assert.deepEqual(empty, {nextSettings: currentSettings, rememberChanged: false, providerChanged: false, classificationChanged: false, genericChanged: false, petEnabledChanged: false});

  const remember = settingsPatchEffects(currentSettings, {rememberSupport: !currentSettings.rememberSupport});
  assert.equal(remember.rememberChanged, true);
  assert.equal(remember.genericChanged, true);
  assert.equal(remember.classificationChanged, false);

  const provider = settingsPatchEffects(currentSettings, {providerKind: 'api'});
  assert.equal(provider.providerChanged, true);
  assert.equal(provider.classificationChanged, true);
  assert.equal(provider.genericChanged, true);

  // 外观与语言类补丁不触发通用广播。
  const styleOnly = settingsPatchEffects(currentSettings, {readingStyle: currentSettings.readingStyle, helpLanguage: currentSettings.helpLanguage});
  assert.equal(styleOnly.genericChanged, false);
  assert.equal(styleOnly.providerChanged, false);

  // 领域变更触发分类失效与通用广播。
  const domainOnly = settingsPatchEffects(currentSettings, {domain: 'tech'});
  assert.equal(domainOnly.classificationChanged, true);
  assert.equal(domainOnly.genericChanged, true);

  // 服务内容变化（同 ID 不同内容）经 provider 指纹识别。
  const before = normalizeSettings();
  before.apiServices = [{id: 'one', name: 'one', providerId: 'openai-compatible', baseUrl: 'https://api.example.com/v1', model: 'm1', apiKey: 'k', options: {}}];
  before.activeApiServiceId = 'one';
  const changed = settingsPatchEffects(before, {apiServices: [{...before.apiServices[0], model: 'm2'}]});
  assert.equal(changed.providerChanged, true);
  const unchanged = settingsPatchEffects(before, {apiServices: [{...before.apiServices[0]}]});
  assert.equal(unchanged.providerChanged, false);

  // 伴读猫开关翻转触发 petEnabledChanged（驱动按需注册/注销），位置与主题变化不触发。
  const petOff = settingsPatchEffects(currentSettings, {floatingPet: {...currentSettings.floatingPet, enabled: false}});
  assert.equal(petOff.petEnabledChanged, true);
  const petSame = settingsPatchEffects(currentSettings, {floatingPet: {...currentSettings.floatingPet, enabled: true, position: {right: 10, bottom: 10}}});
  assert.equal(petSame.petEnabledChanged, false);
  const petBack = settingsPatchEffects({...currentSettings, floatingPet: {...currentSettings.floatingPet, enabled: false}}, {floatingPet: {...currentSettings.floatingPet, enabled: true}});
  assert.equal(petBack.petEnabledChanged, true);
});

test('parseAnalyze 提取正文与可选领域', () => {
  assert.deepEqual(parseAnalyze({text: ' A relational database. ', domain: 'data'}), {source: 'A relational database.', domain: 'data'});
  assert.deepEqual(parseAnalyze({text: 'A sentence.'}), {source: 'A sentence.'});
  assert.throws(() => parseAnalyze({}), /正文不能为空/u);
  assert.throws(() => parseAnalyze({text: 'x'.repeat(200001)}), /不能超过 200000/u);
  assert.throws(() => parseAnalyze({text: 'ok', domain: 'bogus'}), /不支持的领域。/u);
});

test('parseHistoryRuleSet 先行校验阶段与编号', () => {
  assert.deepEqual(parseHistoryRuleSet({wordId: 'data:index', senseKey: 's1', stage: 'hint', locked: true}), {wordId: 'data:index', senseKey: 's1', stage: 'hint', locked: true});
  assert.deepEqual(parseHistoryRuleSet({wordId: 'data:index', senseKey: 's1', stage: null, locked: false}).stage, null);
  assert.throws(() => parseHistoryRuleSet({wordId: 'w', senseKey: 's', stage: 'bogus', locked: true}), /提示选择无效。/u);
  assert.throws(() => parseHistoryRuleSet({wordId: 'w', senseKey: 's', stage: 'hint'}), /提示选择无效。/u);
  assert.throws(() => parseHistoryRuleSet({wordId: '', senseKey: 's', stage: 'hint', locked: true}), /词条编号不能为空/u);
  assert.throws(() => parseHistoryRuleSet({wordId: 'w', senseKey: 'x'.repeat(161), stage: 'hint', locked: true}), /义项编号/u);
});

test('parseHistoryRecordRef 与 parseHistorySummaryEdit 校验编号与摘要', () => {
  assert.deepEqual(parseHistoryRecordRef({id: 'e1'}), {id: 'e1'});
  assert.throws(() => parseHistoryRecordRef({}), /记录编号不能为空/u);
  assert.throws(() => parseHistoryRecordRef({id: 'x'.repeat(161)}), /不能超过 160/u);
  assert.deepEqual(parseHistorySummaryEdit({id: 'e1', summary: ' 摘要 '}), {id: 'e1', summary: '摘要'});
  assert.throws(() => parseHistorySummaryEdit({id: 'e1'}), /摘要不能为空/u);
  assert.throws(() => parseHistorySummaryEdit({id: 'e1', summary: 'x'.repeat(601)}), /不能超过 600/u);
});
