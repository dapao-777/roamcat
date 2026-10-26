/**
 * @file tools/unit/api-providers.test.mjs
 * 文件职责：锁住多通道服务商（商汤日日新、智谱 GLM、小米 MiMo、月之暗面、腾讯 TokenHub）的接口地址映射，
 *   以及 Chat 请求里各家关闭思考的参数、按模型声明的思考档位与对应官方参数、JSON 输出模式。
 * 主要内容：apiProviderBaseUrl/normalizeApiService 通道断言；performProviderRequest 以 fetch 桩捕获请求体。
 * 模块边界：只 import 被测纯模块；不发真实网络请求。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apiProviderBaseUrl, getApiProvider, normalizeApiService} from '../../roamcat-0.0.1/extension/api-providers.mjs';
import {thinkingProfile, resolveThinkingLevel} from '../../roamcat-0.0.1/extension/thinking-levels.mjs';
import {performProviderRequest, providerRequestTimeoutMs} from '../../roamcat-0.0.1/extension/api-transport.mjs';

test('多通道服务商按 channel 映射官方地址', () => {
  const cases = [
    ['sensenova', undefined, 'https://token.sensenova.cn/v1'],
    ['sensenova', 'sensecore', 'https://api.sensenova.cn/compatible-mode/v2'],
    ['zhipu', undefined, 'https://open.bigmodel.cn/api/paas/v4'],
    ['zhipu', 'coding', 'https://open.bigmodel.cn/api/coding/paas/v4'],
    ['zhipu', 'open-intl', 'https://api.z.ai/api/paas/v4'],
    ['zhipu', 'coding-intl', 'https://api.z.ai/api/coding/paas/v4'],
    ['xiaomi', undefined, 'https://api.xiaomimimo.com/v1'],
    ['xiaomi', 'tokenplan', 'https://token-plan-cn.xiaomimimo.com/v1'],
    ['moonshotai', undefined, 'https://api.moonshot.cn/v1'],
    ['moonshotai', 'intl', 'https://api.moonshot.ai/v1'],
    ['tencent', undefined, 'https://tokenhub.tencentmaas.com/v1'],
    ['tencent', 'singapore', 'https://tokenhub-intl.tencentmaas.com/v1'],
  ];
  for (const [id, channel, expected] of cases) {
    assert.equal(apiProviderBaseUrl(id, channel ? {channel} : {}), expected, `${id}/${channel || 'default'}`);
    assert.equal(getApiProvider(id).fields.find(field => field.key === 'channel').options.some(option => option.value === (channel || getApiProvider(id).fields[0].defaultValue)), true);
  }
  assert.throws(() => apiProviderBaseUrl('zhipu', {channel: 'nope'}), /无效|invalid/u);
});

test('旧月之暗面服务（无 options）归一化后保留已存地址', () => {
  const service = normalizeApiService({id: 'k', name: 'Kimi', providerId: 'moonshotai', baseUrl: 'https://api.moonshot.ai/v1', model: 'kimi-k2.6', apiKey: 'sk', options: {}});
  assert.equal(service.baseUrl, 'https://api.moonshot.ai/v1');
  assert.deepEqual(service.options, {channel: 'cn', reasoningEffort: 'none'});
});

async function capturedBodies(service) {
  const original = globalThis.fetch, bodies = [];
  globalThis.fetch = async (url, init) => {
    bodies.push({url: String(url), body: JSON.parse(init.body)});
    return {ok: true, status: 200, headers: new Headers({'content-type': 'application/json'}), json: async () => ({choices: [{message: {content: '{"items":[]}'}, finish_reason: 'stop'}]})};
  };
  try { await performProviderRequest(service, {items: []}, 'Translate.', {type: 'object', properties: {items: {type: 'array'}}, required: ['items'], additionalProperties: false}); }
  finally { globalThis.fetch = original; }
  return bodies;
}

const base = {name: 'x', apiKey: 'sk-test', maxConcurrency: 2};

test('商汤 Token Plan 关闭思考并固定 json_object', async () => {
  const bodies = await capturedBodies({...base, id: 'sn', providerId: 'sensenova', baseUrl: 'https://token.sensenova.cn/v1', model: 'sensenova-6.8-flash-lite', options: {channel: 'tokenplan'}});
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].url, 'https://token.sensenova.cn/v1/chat/completions');
  assert.equal(bodies[0].body.reasoning_effort, 'none');
  assert.deepEqual(bodies[0].body.response_format, {type: 'json_object'});
});

test('商汤大装置按量通道不带 reasoning_effort', async () => {
  const bodies = await capturedBodies({...base, id: 'sc', providerId: 'sensenova', baseUrl: 'https://api.sensenova.cn/compatible-mode/v2', model: 'SenseChat-5', options: {channel: 'sensecore'}});
  assert.equal(bodies[0].url, 'https://api.sensenova.cn/compatible-mode/v2/chat/completions');
  assert.equal('reasoning_effort' in bodies[0].body, false);
});

test('智谱与小米 MiMo 用 thinking.type=disabled 关闭思考', async () => {
  for (const [providerId, baseUrl, model] of [['zhipu', 'https://open.bigmodel.cn/api/coding/paas/v4', 'glm-4.7-flash'], ['xiaomi', 'https://api.xiaomimimo.com/v1', 'mimo-v2.6-flash']]) {
    const bodies = await capturedBodies({...base, id: providerId, providerId, baseUrl, model, options: {}});
    const last = bodies.at(-1);
    assert.equal(last.url, `${baseUrl}/chat/completions`);
    assert.deepEqual(last.body.thinking, {type: 'disabled'});
  }
});

// ── 思考等级按模型声明：设置页只列所选模型的官方档位，请求按档位带该模型的官方参数 ──
const svc = (providerId, baseUrl, model, options = {}) => ({...base, id: `${providerId}-${model}`, providerId, baseUrl, model, options});
const lastBody = async service => (await capturedBodies(service)).at(-1).body;
const levels = (providerId, model, options) => thinkingProfile(providerId, model, options)?.levels.map(level => level.value);
const ZP = 'https://open.bigmodel.cn/api/paas/v4';

test('档位按模型声明：同一服务商不同模型列出各自的官方档位', () => {
  const cases = [
    ['zhipu', 'glm-4.7-flash', ['none', 'on']],
    ['zhipu', 'glm-5.2', ['none', 'high', 'max']],
    ['zhipu', 'glm-5.3-flash', ['low', 'high', 'max']],
    ['deepseek', 'deepseek-v4-flash', ['none', 'low', 'high', 'max']],
    ['moonshotai', 'kimi-k2.6', ['none', 'on']],
    ['moonshotai', 'kimi-k3', ['low', 'high', 'max']],
    ['moonshotai', 'kimi-k2.7-code', ['forced']],
    ['tencent', 'hy3', ['none', 'low', 'high']],
    ['tencent', 'hy4-preview', ['none', 'high']],
    ['tencent', 'minimax-m3', ['none', 'adaptive']],
    ['qianfan', 'deepseek-v4-pro', ['none', 'high', 'max']],
    ['qianfan', 'kimi-k2.5', ['none', 'on']],
    ['qianfan', 'ernie-5.0-thinking-preview', ['none', 'budget-1024', 'budget-4096', 'on']],
    ['sensenova', 'sensenova-6.8-flash-lite', ['none', 'low', 'medium', 'high', 'max']],
    ['sensenova', 'sensenova-u1.5-lite', []],
    ['volcengine', 'doubao-seed-2-1-pro-260915', ['none', 'low', 'medium', 'high']],
    ['volcengine', 'doubao-seed-1-6-250615', ['none', 'auto', 'on']],
    ['volcengine', 'doubao-seed-1-6-flash-250828', ['none', 'on']],
    ['minimax', 'MiniMax-M3', ['none', 'adaptive']],
    ['minimax', 'MiniMax-M3.1-Flash', ['low', 'medium', 'high', 'xhigh', 'max']],
    ['alibaba', 'qwen3.8-flash', ['none', 'budget-1024', 'budget-4096', 'on']],
    ['alibaba', 'deepseek-v4-pro', ['none', 'on']],
    ['siliconflow', 'Pro/deepseek-ai/DeepSeek-V4', ['none', 'high', 'max']],
    ['xiaomi', 'mimo-v2.6-flash', ['none', 'on']],
  ];
  for (const [providerId, model, expected] of cases) assert.deepEqual(levels(providerId, model), expected, `${providerId}/${model}`);
  // 未收录的模型不显示档位；商汤大装置通道不支持思考参数。
  assert.equal(thinkingProfile('zhipu', 'glm-4-plus'), null);
  assert.equal(thinkingProfile('siliconflow', 'Qwen/Qwen3-Next-80B-A3B-Instruct'), null);
  assert.equal(thinkingProfile('sensenova', 'sensenova-6.8-flash-lite', {channel: 'sensecore'}), null);
  assert.equal(thinkingProfile('openai', 'gpt-5.6-luna'), null);
});

test('档位使用官方名称，中文界面配中文说明', () => {
  const labels = thinkingProfile('minimax', 'MiniMax-M3.1-Flash').levels.map(level => level.label);
  assert.deepEqual(labels.map(label => label.split(' · ')[0]), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.ok(labels.every(label => /[一-鿿]/u.test(label)));
  assert.match(thinkingProfile('moonshotai', 'kimi-k2.7-code').levels[0].label, /不可关闭/u);
});

test('换模型后已存档位不适用时回到该模型默认档并持久化', () => {
  const row = {id: 'z', name: 'GLM', providerId: 'zhipu', baseUrl: '', model: 'glm-5.2', apiKey: 'sk', options: {channel: 'coding', reasoningEffort: 'max'}};
  assert.equal(normalizeApiService(row).options.reasoningEffort, 'max');
  // GLM-4.7 只有开关：max 不适用，回到默认「关闭」。
  assert.equal(normalizeApiService({...row, model: 'glm-4.7-flash'}).options.reasoningEffort, 'none');
  // GLM-5.3 不可关闭：回到官方默认 max；low 适用则保留。
  assert.equal(normalizeApiService({...row, model: 'glm-5.3', options: {channel: 'coding', reasoningEffort: 'none'}}).options.reasoningEffort, 'max');
  assert.equal(normalizeApiService({...row, model: 'glm-5.3', options: {channel: 'coding', reasoningEffort: 'low'}}).options.reasoningEffort, 'low');
  assert.equal(resolveThinkingLevel(thinkingProfile('moonshotai', 'kimi-k3'), 'on'), 'max');
  assert.throws(() => normalizeApiService({...row, options: {channel: 'coding', reasoningEffort: 'ultra'}}), /无效|invalid/u);
});

test('智谱：GLM-4.x 开关，GLM-5.2 带 high/max，GLM-5.3 只能开启', async () => {
  assert.deepEqual((await lastBody(svc('zhipu', ZP, 'glm-4.7-flash', {reasoningEffort: 'none'}))).thinking, {type: 'disabled'});
  const g47 = await lastBody(svc('zhipu', ZP, 'glm-4.7-flash', {reasoningEffort: 'on'}));
  assert.deepEqual([g47.thinking, 'reasoning_effort' in g47], [{type: 'enabled'}, false]);
  const g52 = await lastBody(svc('zhipu', ZP, 'glm-5.2', {reasoningEffort: 'max'}));
  assert.deepEqual([g52.thinking, g52.reasoning_effort], [{type: 'enabled'}, 'max']);
  const g53 = await lastBody(svc('zhipu', ZP, 'glm-5.3-flash', {}));
  assert.deepEqual([g53.thinking, g53.reasoning_effort, g53.max_tokens], [{type: 'enabled'}, 'max', 16384]);
  assert.equal((await lastBody(svc('zhipu', ZP, 'glm-4-plus', {}))).thinking.type, 'disabled');
});

test('DeepSeek：thinking.type 开关 + reasoning_effort low/high/max', async () => {
  const ds = reasoningEffort => svc('deepseek', 'https://api.deepseek.com', 'deepseek-v4-flash', {reasoningEffort});
  const off = await lastBody(ds('none'));
  assert.deepEqual([off.thinking, 'reasoning_effort' in off], [{type: 'disabled'}, false]);
  for (const level of ['low', 'high', 'max']) {
    const body = await lastBody(ds(level));
    assert.deepEqual([body.thinking, body.reasoning_effort], [{type: 'enabled'}, level]);
  }
});

test('Kimi：K2.x 开关，K3 只带 reasoning_effort，K2.7-Code 始终开启不带参数', async () => {
  const km = (model, reasoningEffort) => svc('moonshotai', 'https://api.moonshot.cn/v1', model, {reasoningEffort});
  assert.deepEqual((await lastBody(km('kimi-k2.6', 'none'))).thinking, {type: 'disabled'});
  assert.deepEqual((await lastBody(km('kimi-k2.6', 'on'))).thinking, {type: 'enabled'});
  const k3 = await lastBody(km('kimi-k3', 'low'));
  assert.deepEqual([k3.reasoning_effort, 'thinking' in k3], ['low', false]);
  assert.equal((await lastBody(km('kimi-k3', 'none'))).reasoning_effort, 'max');
  const code = await lastBody(km('kimi-k2.7-code', 'none'));
  assert.equal('thinking' in code || 'reasoning_effort' in code, false);
});

test('TokenHub：hy3 low/high、hy4 只有 high、MiniMax-M3 adaptive，名单外不带思考参数', async () => {
  const th = (model, reasoningEffort) => svc('tencent', 'https://tokenhub.tencentmaas.com/v1', model, {reasoningEffort});
  const hy3 = await lastBody(th('hy3', 'low'));
  assert.deepEqual([hy3.thinking, hy3.reasoning_effort], [{type: 'enabled'}, 'low']);
  assert.deepEqual((await lastBody(th('hy3', 'none'))).thinking, {type: 'disabled'});
  const hy4 = await lastBody(th('hy4-preview', 'high'));
  assert.deepEqual([hy4.thinking, hy4.reasoning_effort], [{type: 'enabled'}, 'high']);
  assert.deepEqual((await lastBody(th('minimax-m3', 'adaptive'))).thinking, {type: 'adaptive'});
  const k3 = await lastBody(th('kimi-k3', 'high'));
  assert.deepEqual(['thinking' in k3, k3.reasoning_effort], [false, 'high']);
  const role = await lastBody(th('hunyuan-role-latest', 'high'));
  assert.equal('thinking' in role || 'reasoning_effort' in role, false);
});

test('千帆：DeepSeek-V4 high/max，ERNIE 5.0 预算档，Qwen3 用 enable_thinking，未收录的纯思考模型仍拒绝', async () => {
  const qf = (model, reasoningEffort) => svc('qianfan', 'https://qianfan.baidubce.com/v2', model, {reasoningEffort});
  const v4 = await lastBody(qf('deepseek-v4-flash', 'max'));
  assert.deepEqual([v4.thinking, v4.reasoning_effort], [{type: 'enabled'}, 'max']);
  assert.deepEqual((await lastBody(qf('deepseek-v3.2', 'on'))).thinking, {type: 'enabled'});
  const ernie = await lastBody(qf('ernie-5.0-thinking-preview', 'budget-1024'));
  assert.deepEqual([ernie.enable_thinking, ernie.thinking_budget], [true, 1024]);
  assert.equal((await lastBody(qf('ernie-5.0-thinking-preview', 'none'))).enable_thinking, false);
  assert.equal((await lastBody(qf('qwen3-32b', 'on'))).enable_thinking, true);
  const ernie45 = await lastBody(qf('ernie-4.5-turbo-128k', 'on'));
  assert.equal('thinking' in ernie45 || 'enable_thinking' in ernie45, false);
  await assert.rejects(performProviderRequest(qf('ernie-x2-think', 'none'), {items: []}, 'x', {type: 'object'}), error => error.code === 'THINKING_REQUIRED');
});

test('商汤 Token Plan：6.8 Flash Lite 五档，U1.5 不带思考参数，大装置通道不带', async () => {
  const sn = (model, reasoningEffort, channel = 'tokenplan') => svc('sensenova', channel === 'sensecore' ? 'https://api.sensenova.cn/compatible-mode/v2' : 'https://token.sensenova.cn/v1', model, {channel, reasoningEffort});
  for (const level of ['none', 'low', 'medium', 'high', 'max']) assert.equal((await lastBody(sn('sensenova-6.8-flash-lite', level))).reasoning_effort, level);
  assert.equal('reasoning_effort' in (await lastBody(sn('sensenova-u1.5-lite', 'high'))), false);
  const kimi = await lastBody(sn('kimi-k3', 'medium'));
  assert.deepEqual([kimi.thinking, kimi.reasoning_effort], [{type: 'enabled'}, 'medium']);
  assert.equal('reasoning_effort' in (await lastBody(sn('SenseChat-5', 'high', 'sensecore'))), false);
});

test('火山方舟：Seed 2.x 带 reasoning_effort，Seed 1.6 250615 支持 auto，1.6 Flash 只有开关', async () => {
  const ark = (model, reasoningEffort) => svc('volcengine', 'https://ark.cn-beijing.volces.com/api/v3', model, {reasoningEffort});
  const seed2 = await lastBody(ark('doubao-seed-2-1-pro-260915', 'medium'));
  assert.deepEqual([seed2.thinking, seed2.reasoning_effort], [{type: 'enabled'}, 'medium']);
  assert.deepEqual((await lastBody(ark('doubao-seed-2-1-pro-260915', 'none'))).thinking, {type: 'disabled'});
  assert.deepEqual((await lastBody(ark('doubao-seed-1-6-250615', 'auto'))).thinking, {type: 'auto'});
  const flash = await lastBody(ark('doubao-seed-1-6-flash-250828', 'on'));
  assert.deepEqual([flash.thinking, 'reasoning_effort' in flash], [{type: 'enabled'}, false]);
});

test('MiniMax：M3 adaptive/disabled，M3.1-Flash 只带 reasoning_effort', async () => {
  const mm = (model, reasoningEffort) => svc('minimax', 'https://api.minimax.io/v1', model, {reasoningEffort});
  assert.deepEqual((await lastBody(mm('MiniMax-M3', 'none'))).thinking, {type: 'disabled'});
  assert.deepEqual((await lastBody(mm('MiniMax-M3', 'adaptive'))).thinking, {type: 'adaptive'});
  const flash = await lastBody(mm('MiniMax-M3.1-Flash', 'xhigh'));
  assert.deepEqual([flash.reasoning_effort, 'thinking' in flash], ['xhigh', false]);
});

test('百炼与硅基流动：enable_thinking + thinking_budget；SiliconFlow 的 DeepSeek-V4 带 high/max', async () => {
  const al = reasoningEffort => svc('alibaba', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen3.8-flash', {reasoningEffort});
  assert.deepEqual((await lastBody(al('none'))).enable_thinking, false);
  const budget = await lastBody(al('budget-4096'));
  assert.deepEqual([budget.enable_thinking, budget.thinking_budget], [true, 4096]);
  const open = await lastBody(al('on'));
  assert.deepEqual([open.enable_thinking, 'thinking_budget' in open], [true, false]);
  const sf = await lastBody(svc('siliconflow', 'https://api.siliconflow.cn/v1', 'Pro/deepseek-ai/DeepSeek-V4', {reasoningEffort: 'max'}));
  assert.deepEqual([sf.enable_thinking, sf.reasoning_effort], [true, 'max']);
  assert.equal((await lastBody(svc('siliconflow', 'https://api.siliconflow.cn/v1', 'Qwen/Qwen3-Next-80B-A3B-Instruct', {}))).enable_thinking, false);
});

test('小米 MiMo 只有开关', async () => {
  assert.deepEqual((await lastBody(svc('xiaomi', 'https://api.xiaomimimo.com/v1', 'mimo-v2.6-flash', {reasoningEffort: 'on'}))).thinking, {type: 'enabled'});
});

test('开启思考（含不可关闭的模型）放宽超时到 60 秒，关闭时仍 25 秒', () => {
  assert.equal(providerRequestTimeoutMs(svc('deepseek', 'https://api.deepseek.com', 'deepseek-v4-flash', {reasoningEffort: 'none'})), 25000);
  assert.equal(providerRequestTimeoutMs(svc('deepseek', 'https://api.deepseek.com', 'deepseek-v4-flash', {reasoningEffort: 'low'})), 60000);
  assert.equal(providerRequestTimeoutMs(svc('zhipu', ZP, 'glm-5.3', {})), 60000);
});

