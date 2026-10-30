/**
 * @file tools/unit/summary-timeout.test.mjs
 * 文件职责：浏览器连接器上的摘要请求超时——summarize 给原生连接器 120 秒（原生侧单次可达 90 秒），
 *   成功返回后清掉计时器，不留悬挂的超时。
 * 主要内容：拦截全局 setTimeout / clearTimeout、桩出 chrome.runtime.connectNative，import subscription.js 后
 *   发一次 summarizeSubscription，断言请求类型、计时器时长、结果透传与计时器释放。
 * 模块边界：node:test，不启动浏览器与连接器。测试期间把全局 WebSocket 设为空，连接直接走浏览器连接器，
 *   不会连到本机正在运行的常驻服务（47821）。原 tools/verify-summary-timeout.mjs 并入单测：它没在任何门禁里，
 *   连接改为先走常驻服务后一直失败而无人发现。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';

test('摘要请求给浏览器连接器 120 秒，成功后清掉计时器', async () => {
  const scheduled = new Map();
  let timerId = 0, listener, lastRequest;
  const saved = {setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, WebSocket: globalThis.WebSocket, chrome: globalThis.chrome};
  globalThis.setTimeout = (fn, ms) => { const id = ++timerId; scheduled.set(id, {fn, ms}); return id; };
  globalThis.clearTimeout = id => scheduled.delete(id);
  globalThis.WebSocket = undefined;
  globalThis.chrome = {runtime: {connectNative: () => ({
    onDisconnect: {addListener() {}},
    onMessage: {addListener(fn) { listener = fn; }},
    postMessage(message) { lastRequest = message; },
    disconnect() {},
  })}};
  try {
    const {summarizeSubscription} = await import('../../roamcat-0.0.1/extension/subscription.js');
    const pending = summarizeSubscription({text: 'Controlled fixture text.'}, undefined, 'antigravity');
    assert.equal(lastRequest?.type, 'summarize');
    assert.deepEqual([...scheduled.values()].map(timer => timer.ms), [120000]);
    const result = {takeaway: '测试结论', highlights: ['测试要点'], keywords: [], domain: 'general'};
    listener({id: lastRequest.id, ok: true, data: result});
    assert.deepEqual(await pending, result);
    assert.equal(scheduled.size, 0, '成功后应清掉超时计时器');
  } finally {
    Object.assign(globalThis, saved);
  }
});
