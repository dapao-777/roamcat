/**
 * @file tools/unit/api-providers.test.mjs
 * 文件职责：锁住多通道服务商（商汤日日新、智谱 GLM、小米 MiMo、月之暗面、腾讯 TokenHub）的接口地址映射，
 *   以及 Chat 请求里各家关闭思考的参数、按「思考等级」开启思考的官方参数与 JSON 输出模式。
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

test('GLM-5.3 无法关闭思考，直接拒绝', async () => {
  await assert.rejects(
    performProviderRequest({...base, id: 'g', providerId: 'zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3-flash', options: {}}, {items: []}, 'x', {type: 'object'}),
    error => error.code === 'THINKING_REQUIRED',
  );
});

test('TokenHub 按模型白名单关闭思考，名单外不带 thinking', async () => {
  const hy3 = await capturedBodies({...base, id: 't1', providerId: 'tencent', baseUrl: 'https://tokenhub.tencentmaas.com/v1', model: 'hy3', options: {}});
  assert.equal(hy3.at(-1).url, 'https://tokenhub.tencentmaas.com/v1/chat/completions');
  assert.deepEqual(hy3.at(-1).body.thinking, {type: 'disabled'});
  const role = await capturedBodies({...base, id: 't2', providerId: 'tencent', baseUrl: 'https://tokenhub.tencentmaas.com/v1', model: 'hunyuan-role-latest', options: {}});
  assert.equal('thinking' in role.at(-1).body, false);
  await assert.rejects(
    performProviderRequest({...base, id: 't3', providerId: 'tencent', baseUrl: 'https://tokenhub.tencentmaas.com/v1', model: 'kimi-k3', options: {}}, {items: []}, 'x', {type: 'object'}),
    error => error.code === 'THINKING_REQUIRED',
  );
});

test('千帆按模型选择 thinking 或 enable_thinking，纯思考模型拒绝', async () => {
  const qf = model => ({...base, id: model, providerId: 'qianfan', baseUrl: 'https://qianfan.baidubce.com/v2', model, options: {}});
  const ernie45 = await capturedBodies(qf('ernie-4.5-turbo-128k'));
  assert.equal(ernie45.at(-1).url, 'https://qianfan.baidubce.com/v2/chat/completions');
  assert.equal('thinking' in ernie45.at(-1).body || 'enable_thinking' in ernie45.at(-1).body, false);
  assert.deepEqual((await capturedBodies(qf('deepseek-v3.2'))).at(-1).body.thinking, {type: 'disabled'});
  assert.equal((await capturedBodies(qf('ernie-5.0-thinking-preview'))).at(-1).body.enable_thinking, false);
  for (const model of ['ernie-x1.1', 'deepseek-v3.2-think']) {
    await assert.rejects(performProviderRequest(qf(model), {items: []}, 'x', {type: 'object'}), error => error.code === 'THINKING_REQUIRED', model);
  }
});

// ── 思考等级：设置页每个服务商只列官方支持的档位，请求按档位带官方参数 ──
const svc = (providerId, baseUrl, model, options = {}) => ({...base, id: `${providerId}-${model}`, providerId, baseUrl, model, options});
const lastBody = async service => (await capturedBodies(service)).at(-1).body;
const levelsOf = id => getApiProvider(id).fields.find(field => field.key === 'reasoningEffort')?.options.map(option => option.value);

test('各服务商思考等级只列官方支持的档位，默认关闭并可持久化', () => {
  const expected = {
    zhipu: ['none', 'low', 'high'], deepseek: ['none', 'low', 'high'], moonshotai: ['none', 'low', 'high'], tencent: ['none', 'low', 'high'],
    xiaomi: ['none', 'on'], qianfan: ['none', 'on'],
    sensenova: ['none', 'low', 'medium', 'high'], volcengine: ['none', 'low', 'medium', 'high'], minimax: ['none', 'low', 'medium', 'high'],
    alibaba: ['none', 'low', 'medium', 'high'], siliconflow: ['none', 'low', 'medium', 'high'],
    stepfun: ['low', 'medium', 'high'],
  };
  for (const [id, levels] of Object.entries(expected)) assert.deepEqual(levelsOf(id), levels, id);
  assert.deepEqual(getApiProvider('sensenova').fields.find(field => field.key === 'reasoningEffort').channels, ['tokenplan']);
  const saved = normalizeApiService({id: 'z', name: 'GLM', providerId: 'zhipu', baseUrl: '', model: 'glm-5.3', apiKey: 'sk', options: {channel: 'coding', reasoningEffort: 'high'}});
  assert.deepEqual(saved.options, {channel: 'coding', reasoningEffort: 'high'});
  assert.equal(normalizeApiService({...saved}).options.reasoningEffort, 'high');
  assert.throws(() => normalizeApiService({...saved, options: {channel: 'coding', reasoningEffort: 'medium'}}), /无效|invalid/u);
  assert.throws(() => normalizeApiService({...saved, providerId: 'xiaomi', options: {reasoningEffort: 'high'}}), /无效|invalid/u);
});

test('智谱：关闭/开启走 thinking.type，GLM-5.2 起才带 reasoning_effort，选档后 GLM-5.3 不再拒绝', async () => {
  const zp = (model, reasoningEffort) => svc('zhipu', 'https://open.bigmodel.cn/api/paas/v4', model, reasoningEffort ? {reasoningEffort} : {});
  assert.deepEqual((await lastBody(zp('glm-4.7-flash', 'none'))).thinking, {type: 'disabled'});
  const old = await lastBody(zp('glm-4.7-flash', 'high'));
  assert.deepEqual(old.thinking, {type: 'enabled'});
  assert.equal('reasoning_effort' in old, false);
  const g52 = await lastBody(zp('glm-5.2', 'low'));
  assert.deepEqual([g52.thinking, g52.reasoning_effort], [{type: 'enabled'}, 'low']);
  const g53 = await lastBody(zp('glm-5.3-flash', 'high'));
  assert.deepEqual([g53.thinking, g53.reasoning_effort], [{type: 'enabled'}, 'high']);
  assert.equal(g53.max_tokens, 16384);
});

test('DeepSeek：thinking.type 开关 + reasoning_effort', async () => {
  const ds = reasoningEffort => svc('deepseek', 'https://api.deepseek.com', 'deepseek-v4-flash', {reasoningEffort});
  const off = await lastBody(ds('none'));
  assert.deepEqual(off.thinking, {type: 'disabled'});
  assert.equal('reasoning_effort' in off, false);
  const low = await lastBody(ds('low'));
  assert.deepEqual([low.thinking, low.reasoning_effort], [{type: 'enabled'}, 'low']);
  assert.equal((await lastBody(ds('high'))).reasoning_effort, 'high');
});

test('小米 MiMo 与千帆只有开关', async () => {
  assert.deepEqual((await lastBody(svc('xiaomi', 'https://api.xiaomimimo.com/v1', 'mimo-v2.6-flash', {reasoningEffort: 'on'}))).thinking, {type: 'enabled'});
  const qf = (model, reasoningEffort) => svc('qianfan', 'https://qianfan.baidubce.com/v2', model, {reasoningEffort});
  assert.deepEqual((await lastBody(qf('deepseek-v4-flash', 'on'))).thinking, {type: 'enabled'});
  assert.equal((await lastBody(qf('qwen3-32b', 'on'))).enable_thinking, true);
  assert.equal((await lastBody(qf('ernie-5.0-thinking-preview', 'on'))).enable_thinking, true);
  const ernie45 = await lastBody(qf('ernie-4.5-turbo-128k', 'on'));
  assert.equal('thinking' in ernie45 || 'enable_thinking' in ernie45, false);
  assert.equal('reasoning_effort' in (await lastBody(qf('deepseek-v4-flash', 'on'))), false);
});

test('Kimi：K2.x 开关，K3 只带 reasoning_effort、不能关闭', async () => {
  const km = (model, reasoningEffort) => svc('moonshotai', 'https://api.moonshot.cn/v1', model, {reasoningEffort});
  assert.deepEqual((await lastBody(km('kimi-k2.6', 'none'))).thinking, {type: 'disabled'});
  const k26 = await lastBody(km('kimi-k2.6', 'high'));
  assert.deepEqual(k26.thinking, {type: 'enabled'});
  assert.equal('reasoning_effort' in k26, false);
  const k3 = await lastBody(km('kimi-k3', 'low'));
  assert.equal(k3.reasoning_effort, 'low');
  assert.equal('thinking' in k3, false);
  for (const model of ['kimi-k3', 'kimi-k3.1-pro', 'kimi-k2.7-code']) {
    await assert.rejects(performProviderRequest(km(model, 'none'), {items: []}, 'x', {type: 'object'}), error => error.code === 'THINKING_REQUIRED', model);
  }
});

test('火山方舟：thinking.type 开关，Seed 2.x 等支持的模型才带 reasoning_effort', async () => {
  const ark = (model, reasoningEffort) => svc('volcengine', 'https://ark.cn-beijing.volces.com/api/v3', model, {reasoningEffort});
  assert.deepEqual((await lastBody(ark('doubao-seed-2-1-pro-260915', 'none'))).thinking, {type: 'disabled'});
  const seed2 = await lastBody(ark('doubao-seed-2-1-pro-260915', 'medium'));
  assert.deepEqual([seed2.thinking, seed2.reasoning_effort], [{type: 'enabled'}, 'medium']);
  const seed16 = await lastBody(ark('doubao-seed-1-6-flash-250828', 'medium'));
  assert.deepEqual(seed16.thinking, {type: 'enabled'});
  assert.equal('reasoning_effort' in seed16, false);
});

test('MiniMax：M3 开关，M3.1-Flash 只带 reasoning_effort、不能关闭', async () => {
  const mm = (model, reasoningEffort) => svc('minimax', 'https://api.minimax.io/v1', model, {reasoningEffort});
  assert.deepEqual((await lastBody(mm('MiniMax-M3', 'none'))).thinking, {type: 'disabled'});
  const m3 = await lastBody(mm('MiniMax-M3', 'high'));
  assert.equal('thinking' in m3 || 'reasoning_effort' in m3, false);
  const flash = await lastBody(mm('MiniMax-M3.1-Flash', 'medium'));
  assert.deepEqual([flash.reasoning_effort, 'thinking' in flash], ['medium', false]);
  await assert.rejects(performProviderRequest(mm('MiniMax-M3.1-Flash', 'none'), {items: []}, 'x', {type: 'object'}), error => error.code === 'THINKING_REQUIRED');
});

test('百炼与硅基流动：enable_thinking + thinking_budget 预算档', async () => {
  const cases = [
    ['alibaba', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen3.8-flash'],
    ['siliconflow', 'https://api.siliconflow.cn/v1', 'Qwen/Qwen3-Next-80B-A3B-Instruct'],
  ];
  for (const [providerId, baseUrl, model] of cases) {
    const body = async reasoningEffort => lastBody(svc(providerId, baseUrl, model, {reasoningEffort}));
    const off = await body('none');
    assert.deepEqual([off.enable_thinking, 'thinking_budget' in off], [false, false], providerId);
    assert.deepEqual([(await body('low')).thinking_budget, (await body('medium')).thinking_budget], [1024, 4096], providerId);
    const high = await body('high');
    assert.deepEqual([high.enable_thinking, 'thinking_budget' in high], [true, false], providerId);
  }
  const k3 = await lastBody(svc('alibaba', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'kimi-k3', {reasoningEffort: 'low'}));
  assert.equal('thinking_budget' in k3, false);
});

test('商汤 Token Plan 按档位带 reasoning_effort，大装置通道仍不带', async () => {
  const sn = (channel, reasoningEffort) => svc('sensenova', channel === 'sensecore' ? 'https://api.sensenova.cn/compatible-mode/v2' : 'https://token.sensenova.cn/v1', 'sensenova-6.8-flash-lite', {channel, reasoningEffort});
  for (const level of ['low', 'medium', 'high']) assert.equal((await lastBody(sn('tokenplan', level))).reasoning_effort, level);
  assert.equal((await lastBody(sn('tokenplan', 'none'))).reasoning_effort, 'none');
  assert.equal('reasoning_effort' in (await lastBody(sn('sensecore', 'high'))), false);
});

test('TokenHub：白名单模型开关 thinking，hy3/GLM-5.3/Kimi K3 带 reasoning_effort', async () => {
  const th = (model, reasoningEffort) => svc('tencent', 'https://tokenhub.tencentmaas.com/v1', model, {reasoningEffort});
  const hy3 = await lastBody(th('hy3', 'low'));
  assert.deepEqual([hy3.thinking, hy3.reasoning_effort], [{type: 'enabled'}, 'low']);
  const qwen = await lastBody(th('qwen3.5-plus', 'high'));
  assert.deepEqual([qwen.thinking, 'reasoning_effort' in qwen], [{type: 'enabled'}, false]);
  const k3 = await lastBody(th('kimi-k3', 'high'));
  assert.deepEqual(['thinking' in k3, k3.reasoning_effort], [false, 'high']);
  const glm53 = await lastBody(th('glm-5.3', 'low'));
  assert.equal(glm53.reasoning_effort, 'low');
  const hy4 = await lastBody(th('hy4-preview', 'low'));
  assert.deepEqual([hy4.thinking, 'reasoning_effort' in hy4], [{type: 'enabled'}, false]);
  const role = await lastBody(th('hunyuan-role-latest', 'high'));
  assert.equal('thinking' in role || 'reasoning_effort' in role, false);
});

test('开了思考等级的服务放宽超时到 60 秒，关闭时仍 25 秒', () => {
  const ds = reasoningEffort => svc('deepseek', 'https://api.deepseek.com', 'deepseek-v4-flash', {reasoningEffort});
  assert.equal(providerRequestTimeoutMs(ds('none')), 25000);
  assert.equal(providerRequestTimeoutMs(ds('low')), 60000);
});

