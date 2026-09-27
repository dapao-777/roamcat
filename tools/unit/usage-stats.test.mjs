/**
 * @file tools/unit/usage-stats.test.mjs
 * 文件职责：为 extension/usage-stats.mjs 提供 node:test 单元测试——模型用量事件的规范化、
 *   按日/按服务×模型聚合、存储清洗与汇总输出均不得因不受信输入产生异常结构。
 * 主要内容：recordUsageEvent 计数/token/失败归并，usageDayKey 本地日期键，
 *   normalizeUsageStats 拒绝畸形行，summarizeUsage 输出 today/week/month/models/days 形态，
 *   pruneUsage 的日数与服务×模型条数上限。
 * 模块边界：只 import 纯领域模块，不触碰 chrome/网络；node:test 自动发现本文件。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  USAGE_STATS_KEY,
  USAGE_DAY_LIMIT,
  USAGE_MODEL_LIMIT,
  usageDayKey,
  recordUsageEvent,
  normalizeUsageStats,
  summarizeUsage,
} from '../../roamcat-0.0.1/extension/usage-stats.mjs';

const EVENT = {at: Date.now(), source: 'api', provider: 'OpenAI', serviceId: 'svc-1', service: '默认', model: 'gpt-x', ok: true, ms: 1200, charsIn: 400, charsOut: 800, inputTokens: 100, outputTokens: 200};

test('USAGE_STATS_KEY 是专用存储键', () => {
  assert.equal(USAGE_STATS_KEY, 'modelUsageStats');
});

test('recordUsageEvent 聚合 total/days/models 三处计数', () => {
  const stats = recordUsageEvent(null, EVENT);
  assert.equal(stats.total.requests, 1);
  assert.equal(stats.total.inputTokens, 100);
  assert.equal(stats.total.outputTokens, 200);
  const day = usageDayKey(EVENT.at);
  assert.equal(stats.days[day].requests, 1);
  assert.equal(stats.days[day].charsIn, 400);
  const row = stats.models[`api|svc-1|gpt-x`];
  assert.ok(row);
  assert.equal(row.provider, 'OpenAI');
  assert.equal(row.service, '默认');
  assert.equal(row.lastAt, EVENT.at);
});

test('recordUsageEvent 可叠加并区分失败调用', () => {
  let stats = recordUsageEvent(null, EVENT);
  stats = recordUsageEvent(stats, {...EVENT, ok: false});
  assert.equal(stats.total.requests, 2);
  assert.equal(stats.total.failures, 1);
  assert.equal(stats.total.inputTokens, 200);
});

test('recordUsageEvent 拒绝缺失 model 或畸形事件', () => {
  assert.equal(recordUsageEvent(null, null).total.requests, 0);
  assert.equal(recordUsageEvent(null, {source: 'api'}).total.requests, 0);
  assert.equal(recordUsageEvent(null, 'junk').total.requests, 0);
});

test('recordUsageEvent 未知 source 归一为 api，token 缺省记 0', () => {
  const stats = recordUsageEvent(null, {...EVENT, source: 'mystery', inputTokens: undefined, outputTokens: undefined});
  assert.ok(stats.models['api|svc-1|gpt-x']);
  assert.equal(stats.total.inputTokens, 0);
});

test('normalizeUsageStats 清洗不受信存储', () => {
  const dirty = {
    total: {requests: 'x', inputTokens: 5},
    days: {'2024-01-01': {requests: 2}, 'not-a-day': {requests: 9}, '2024/01/02': {requests: 1}},
    models: {
      'api|s|m': {model: 'm', requests: 3, source: 'grok', provider: 'Grok', service: '', lastAt: 7},
      'bad': {requests: 4},
      ['x'.repeat(401)]: {model: 'm', requests: 1},
    },
    extra: 'dropped',
  };
  const stats = normalizeUsageStats(dirty);
  assert.equal(stats.total.requests, 0);
  assert.equal(stats.total.inputTokens, 5);
  assert.deepEqual(Object.keys(stats.days), ['2024-01-01']);
  assert.equal(stats.days['2024-01-01'].requests, 2);
  assert.equal(Object.keys(stats.models).length, 1);
  assert.equal(stats.models['api|s|m'].source, 'grok');
  assert.equal(stats.extra, undefined);
});

test('summarizeUsage 输出 today/week/month 与排序明细', () => {
  const now = Date.now();
  let stats = recordUsageEvent(null, EVENT);
  stats = recordUsageEvent(stats, {...EVENT, source: 'chatgpt', provider: 'ChatGPT', serviceId: '', service: '', model: 'sub-model', ms: 500});
  stats = recordUsageEvent(stats, {...EVENT, at: now - 40 * 86400000});
  const summary = summarizeUsage(stats, now);
  assert.equal(summary.total.requests, 3);
  assert.equal(summary.today.requests, 2);
  assert.equal(summary.week.requests, 2);
  assert.equal(summary.month.requests, 2);
  assert.equal(summary.models.length, 2);
  assert.equal(summary.models[0].model, 'gpt-x');
  assert.equal(summary.days.length, 2);
  assert.ok(summary.days[0].day >= summary.days[1].day);
});

test('pruneUsage 限制日明细与模型组合规模', () => {
  let stats = null;
  const base = Date.now();
  for (let i = 0; i < USAGE_DAY_LIMIT + 5; i++) stats = recordUsageEvent(stats, {...EVENT, at: base - i * 86400000});
  assert.ok(Object.keys(stats.days).length <= USAGE_DAY_LIMIT);
  stats = null;
  for (let i = 0; i < USAGE_MODEL_LIMIT + 5; i++) stats = recordUsageEvent(stats, {...EVENT, serviceId: `svc-${i}`, at: base + i});
  assert.ok(Object.keys(stats.models).length <= USAGE_MODEL_LIMIT);
});
