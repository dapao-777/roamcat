/**
 * @file tools/unit/diagnostics.test.mjs
 * 文件职责：为诊断层的两个操作集合提供镜像一致性单测——diagnostic-service.js 的
 *   OPERATIONS/RENDERED 与 diagnostics.mjs 的 DIAGNOSTIC_OPERATIONS 是独立维护的
 *   字面量，新增消息类型时容易漏同步（被 trace 的类型若不在存储白名单会被静默丢弃）。
 * 主要内容：OPERATIONS ⊆ DIAGNOSTIC_OPERATIONS（存储可达）、RENDERED ⊆ OPERATIONS
 *   （回执只发给已 trace 的类型）、OPERATIONS ⊆ MESSAGE_TYPES ∪ 合成操作
 *   （HISTORY_SUMMARY 由 runHistoryModel 合成 command 走 diagnostics.run，非线消息）。
 * 模块边界：只 import 被测模块与 message-protocol.js（均为 import 安全模块）；
 *   运行方式为在仓库根执行 node:test 自动发现本目录全部 .test.mjs。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OPERATIONS, RENDERED} from '../../roamcat-0.2.0/extension/diagnostic-service.js';
import {DIAGNOSTIC_OPERATIONS} from '../../roamcat-0.2.0/extension/diagnostics.mjs';
import {MESSAGE_TYPES} from '../../roamcat-0.2.0/extension/message-protocol.js';

test('OPERATIONS 全部可被诊断存储层接受', () => {
  for (const operation of OPERATIONS) {
    assert.ok(DIAGNOSTIC_OPERATIONS.has(operation), `${operation} 不在 DIAGNOSTIC_OPERATIONS 中`);
  }
});

test('RENDERED 只引用已产生 trace 的操作', () => {
  for (const operation of RENDERED) {
    assert.ok(OPERATIONS.has(operation), `${operation} 期待渲染回执但不在 OPERATIONS 中`);
  }
});

// runHistoryModel 为历史摘要构造合成 command 进入 diagnostics.run：operation 名存在但
// 不是 MESSAGE_TYPES 线消息。新增合成操作必须同步本集合，让漂移在测试期暴露。
const SYNTHETIC_OPERATIONS = new Set(['HISTORY_SUMMARY']);

test('OPERATIONS 全部是已注册消息类型或已登记合成操作', () => {
  const registered = new Set(MESSAGE_TYPES);
  for (const operation of OPERATIONS) {
    assert.ok(
      registered.has(operation) || SYNTHETIC_OPERATIONS.has(operation),
      `${operation} 既不在 MESSAGE_TYPES 也不是登记的合成操作`,
    );
  }
});
