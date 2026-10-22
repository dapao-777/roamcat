/**
 * @file tools/unit/subscription-stage.test.mjs
 * 文件职责：为 extension/subscription.js 的连接阶段（stage）判定提供 node:test 单元测试——
 *   设置页的订阅分步清单完全依赖这个字段决定当前卡在哪一步。
 * 主要内容：原生端口因“host not found”断开 → install；因其他原因断开 → start；
 *   连接器回报已连接未登录 → login；已登录 → ready。已连接后再探测不拆端口。
 * 模块边界：以最小 chrome.runtime.connectNative 假端口驱动三个订阅通道（每个通道一个单例），
 *   不启动真实连接器进程。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';

// 每个原生主机名对应一种假端口行为：disconnect=立刻以 lastError 断开，status=回一条状态响应。
const behaviors = new Map();
const ports = [];
function fakePort(host) {
  const disconnects = [], messages = [];
  const port = {
    host,
    disconnectCalls: 0,
    onDisconnect: {addListener: fn => disconnects.push(fn)},
    onMessage: {addListener: fn => messages.push(fn)},
    disconnect() { port.disconnectCalls++; },
    postMessage(message) {
      const behavior = behaviors.get(host);
      queueMicrotask(() => {
        if (behavior.disconnect) {
          globalThis.chrome.runtime.lastError = {message: behavior.disconnect};
          for (const fn of disconnects) fn();
          globalThis.chrome.runtime.lastError = null;
        } else {
          for (const fn of messages) fn({id: message.id, ok: true, data: behavior.status});
        }
      });
    },
  };
  ports.push(port);
  return port;
}
globalThis.chrome = {runtime: {lastError: null, connectNative: fakePort}};
const {refreshSubscription, probeSubscription} = await import('../../roamcat-0.0.1/extension/subscription.js');

test('找不到原生主机注册 → stage=install', async () => {
  behaviors.set('com.roamcat.translate', {disconnect: 'Specified native messaging host not found.'});
  const status = await refreshSubscription('chatgpt');
  assert.equal(status.connected, false);
  assert.equal(status.stage, 'install');
});

test('主机已注册但进程退出 → stage=start', async () => {
  behaviors.set('com.roamcat.grok', {disconnect: 'Native host has exited.'});
  const status = await refreshSubscription('grok');
  assert.equal(status.stage, 'start');
});

test('已连接未登录 → login；登录后 → ready', async () => {
  behaviors.set('com.roamcat.antigravity', {status: {connected: true, authenticated: false}});
  assert.equal((await refreshSubscription('antigravity')).stage, 'login');
  behaviors.set('com.roamcat.antigravity', {status: {connected: true, authenticated: true, email: 'a@example.com'}});
  assert.equal((await refreshSubscription('antigravity')).stage, 'ready');
});

test('已连接时探测只问状态，不拆掉现有端口', async () => {
  const live = ports.filter(port => port.host === 'com.roamcat.antigravity').at(-1);
  behaviors.set('com.roamcat.antigravity', {status: {connected: true, authenticated: true, email: 'b@example.com', plan: 'pro'}});
  const status = await probeSubscription('antigravity');
  assert.equal(status.stage, 'ready');
  assert.equal(status.email, 'b@example.com');
  assert.equal(live.disconnectCalls, 0);
  assert.equal(ports.at(-1), live);
});
