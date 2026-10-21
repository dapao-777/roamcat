/**
 * @file tools/unit/api-transport-json.test.mjs
 * 文件职责：锁住 api-transport.mjs 的 JSON 解析边界——默认整段必须就是一个 JSON 对象，
 *   只有调用方显式传 lenientJson（本页翻译）时才从代码围栏或前后说明里取对象。
 * 主要内容：以 Ollama 非流式分支为样本，fetch 用 globalThis 桩替代，断言严格/宽松两条路径。
 * 模块边界：只 import 被测纯模块；不发真实网络请求。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performProviderRequest} from '../../roamcat-0.0.1/extension/api-transport.mjs';

const service = {
  id: 'ollama-test', name: 'Ollama', providerId: 'ollama', baseUrl: 'http://localhost:11434/api', model: 'gemma3:4b', apiKey: '', options: {}, maxConcurrency: 2,
};
const FENCED = 'Here is the result:\n```json\n{"items":[{"id":"one","translation":"你好"}]}\n```';

async function withReply(content, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ok: true, status: 200, json: async () => ({message: {content}, done: true, done_reason: 'stop'})});
  try { return await run(); } finally { globalThis.fetch = original; }
}

test('默认严格：围栏或前后说明包着的对象按 INVALID_JSON 拒绝', async () => {
  await withReply(FENCED, () => assert.rejects(
    performProviderRequest(service, {items: []}, 'Translate.', {type: 'object'}),
    error => error.code === 'INVALID_JSON',
  ));
});

test('lenientJson 时从围栏里取出对象', async () => {
  const value = await withReply(FENCED, () => performProviderRequest(service, {items: []}, 'Translate.', {type: 'object'}, {lenientJson: true}));
  assert.deepEqual(value, {items: [{id: 'one', translation: '你好'}]});
});

test('整段就是 JSON 对象时两种模式都接受', async () => {
  const body = '{"items":[]}';
  assert.deepEqual(await withReply(body, () => performProviderRequest(service, {items: []}, 'Translate.', {type: 'object'})), {items: []});
});
