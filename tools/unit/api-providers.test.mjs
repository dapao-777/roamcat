/**
 * @file tools/unit/api-providers.test.mjs
 * 文件职责：锁住多通道服务商（商汤日日新、智谱 GLM、小米 MiMo、月之暗面、腾讯 TokenHub）的接口地址映射，
 *   以及 Chat 请求里各家关闭思考的参数与 JSON 输出模式。
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
import {performProviderRequest} from '../../roamcat-0.0.1/extension/api-transport.mjs';

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
  assert.deepEqual(service.options, {channel: 'cn'});
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
