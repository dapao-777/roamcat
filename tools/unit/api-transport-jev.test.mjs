/**
 * @file tools/unit/api-transport-jev.test.mjs
 * 文件职责：为 api-transport.mjs 的 Jev 判定协议提供 node:test 单元测试——
 *   typesafe.ai 域名走 /systemone 原生协议、其余地址走 Requesty chat/completions
 *   转发，以及 noul/choice/score 应答归一化，防止两类端点格式混淆回归。
 * 主要内容：performProviderRequest 的 Jev 分支 URL/body 断言与应答映射；
 *   fetch 以 globalThis 桩替代，不断言真实网络。
 * 模块边界：只 import 被测纯模块（api-transport 为 import 安全模块）；
 *   运行方式为在仓库根执行 node:test 自动发现本目录全部 .test.mjs。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performProviderRequest} from '../../roamcat-0.0.1/extension/api-transport.mjs';

const QUESTIONS = {
  domain: {type: 'choice', instructions: 'Pick a domain.', criteria: {tech: 'Software', data: 'Databases'}},
  urgent: {type: 'noul', instructions: 'Is it urgent?'},
  level: {type: 'score', instructions: 'Rate it.', criteria: ['low', 'high']},
};

const service = (baseUrl, model = 'typesafe/jev-1.13.0') => ({
  id: 'jev-test', name: 'Jev', providerId: 'requesty', baseUrl, model, apiKey: 'sk-test', options: {}, maxConcurrency: 2,
});

function stubFetch(payload, captured) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    captured.url = String(url);
    captured.init = init;
    return {ok: true, status: 200, json: async () => payload};
  };
  return () => { globalThis.fetch = original; };
}

test('Jev 在 typesafe.ai 域名走 /systemone 原生协议并去掉 typesafe/ 前缀', async () => {
  const captured = {};
  const restore = stubFetch({
    model: 'jev-1.13.0',
    answers: {
      domain: {type: 'choice', choice: 'tech', confidence: 0.9, probabilities: {tech: 0.9, data: 0.1}},
      urgent: {type: 'noul', noul: 0.7},
      level: {type: 'score', score: 1.4, confidence: 0.8},
    },
    usage: {input_tokens: 10, output_tokens: 5},
  }, captured);
  try {
    const result = await performProviderRequest(
      service('https://api.typesafe.ai/v1'),
      {state: 'a passage', questions: QUESTIONS},
    );
    assert.equal(captured.url, 'https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(captured.init.body);
    assert.equal(body.model, 'jev-1.13.0');
    assert.equal(body.state, 'a passage');
    assert.deepEqual(body.questions, QUESTIONS);
    assert.equal(body.messages, undefined);
    assert.equal(body.response_format, undefined);
    assert.equal(captured.init.headers.Authorization, 'Bearer sk-test');
    assert.equal(result.answers.domain.kind, 'choice');
    assert.equal(result.answers.domain.selected, 'tech');
    assert.equal(result.answers.domain.confidence, 0.9);
    assert.equal(result.answers.urgent.kind, 'noul');
    assert.equal(result.answers.urgent.probability, 0.7);
    assert.equal(result.answers.level.kind, 'score');
    assert.equal(result.answers.level.score, 1.4);
  } finally {
    restore();
  }
});

test('Jev 非 typesafe 地址保持 Requesty chat/completions 转发格式', async () => {
  const captured = {};
  const content = JSON.stringify({
    domain: {type: 'choice', choice: 'data', confidence: 0.6},
    urgent: {type: 'noul', noul: 0.2},
    level: {type: 'score', score: 0, confidence: 0.5},
  });
  const restore = stubFetch({choices: [{finish_reason: 'stop', message: {role: 'assistant', content}}]}, captured);
  try {
    const result = await performProviderRequest(
      service('https://router.requesty.ai/v1'),
      {state: 'a passage', questions: QUESTIONS},
    );
    assert.equal(captured.url, 'https://router.requesty.ai/v1/chat/completions');
    const body = JSON.parse(captured.init.body);
    assert.equal(body.model, 'typesafe/jev-1.13.0');
    assert.equal(body.stream, false);
    assert.deepEqual(body.messages, [{role: 'user', content: 'a passage'}]);
    assert.equal(body.response_format.type, 'questions');
    assert.deepEqual(body.response_format.questions, QUESTIONS);
    assert.equal(result.answers.domain.selected, 'data');
    assert.equal(result.answers.urgent.probability, 0.2);
  } finally {
    restore();
  }
});

test('Jev 原生应答缺少问题项或概率越界时报判定错误', async () => {
  const restore = stubFetch({model: 'jev-1.13.0', answers: {urgent: {type: 'noul', noul: 1.5}}}, {});
  try {
    await assert.rejects(
      performProviderRequest(service('https://api.typesafe.ai/v1'), {state: 's', questions: {urgent: QUESTIONS.urgent}}),
      /未返回有效概率/u,
    );
    const restore2 = stubFetch({model: 'jev-1.13.0', answers: {}}, {});
    try {
      await assert.rejects(
        performProviderRequest(service('https://api.typesafe.ai/v1'), {state: 's', questions: {domain: QUESTIONS.domain}}),
        /未返回有效选项/u,
      );
    } finally {
      restore2();
    }
  } finally {
    restore();
  }
});
