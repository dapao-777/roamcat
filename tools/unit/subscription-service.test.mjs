/**
 * @file tools/unit/subscription-service.test.mjs
 * 文件职责：为 extension/subscription.js 连本机常驻服务时的配对令牌流程提供 node:test 单元测试。
 * 主要内容：向浏览器连接器要令牌并经 Sec-WebSocket-Protocol 带上（不进 URL），缓存在 chrome.storage.session、
 *   第二条连接不再去要；缓存的令牌被拒（重装换了令牌 / 服务没运行）时清掉缓存并改用浏览器连接器；
 *   旧版连接器或没注册时按旧握手直连，并记下“给不了”不再反复拉起连接器。
 * 模块边界：以假 WebSocket、假 connectNative 与内存版 storage.session 驱动；每个用例 import 一份新的模块实例，
 *   不连接真实服务、不启动连接器进程。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';

const TOKEN = 'ab'.repeat(32);
const STALE = 'cd'.repeat(32);

class FakeWebSocket {
  static instances = [];
  constructor(url, protocols) { this.url = url; this.protocols = protocols; this.sent = []; FakeWebSocket.instances.push(this); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
  accept() { this.onopen?.(); }
  refuse() { this.onclose?.({code: 1006}); }
}

const session = new Map();
const nativeCalls = [];
let pairingReply = null;
function fakeNativePort(host) {
  const messageListeners = [], disconnectListeners = [];
  return {
    onMessage: {addListener: fn => messageListeners.push(fn)},
    onDisconnect: {addListener: fn => disconnectListeners.push(fn)},
    disconnect() {},
    postMessage(message) {
      nativeCalls.push({host, type: message.type});
      queueMicrotask(() => {
        if (message.type !== 'pairingToken') { for (const fn of messageListeners) fn({id: message.id, ok: true, data: {connected: true}}); return; }
        if (pairingReply === 'not-found') {
          globalThis.chrome.runtime.lastError = {message: 'Specified native messaging host not found.'};
          for (const fn of disconnectListeners) fn();
          globalThis.chrome.runtime.lastError = null;
          return;
        }
        for (const fn of messageListeners) fn(pairingReply(message));
      });
    },
  };
}
globalThis.WebSocket = FakeWebSocket;
globalThis.chrome = {
  runtime: {lastError: null, connectNative: fakeNativePort},
  storage: {session: {
    get: async key => (session.has(key) ? {[key]: session.get(key)} : {}),
    set: async values => { for (const [key, value] of Object.entries(values)) session.set(key, value); },
    remove: async key => { session.delete(key); },
  }},
};

let generation = 0;
const load = () => import(`../../roamcat-0.0.1/extension/subscription.js?case=${++generation}`);
const settle = () => new Promise(done => setTimeout(done, 0));
const pairingAsks = () => nativeCalls.filter(call => call.type === 'pairingToken').length;

beforeEach(() => { session.clear(); nativeCalls.length = 0; FakeWebSocket.instances.length = 0; pairingReply = null; });

test('向浏览器连接器要到令牌，握手经子协议带上并缓存；下一条连接直接用缓存', async () => {
  pairingReply = message => ({id: message.id, ok: true, data: {token: TOKEN}});
  const {openTransport, SERVICE_PROTOCOL, SERVICE_TOKEN_PREFIX, SERVICE_PAIRING_KEY} = await load();
  const port = openTransport('chatgpt', 'com.roamcat.translate');
  port.postMessage({id: 1, type: 'status'});
  await settle();
  const socket = FakeWebSocket.instances.at(-1);
  assert.deepEqual(socket.protocols, [SERVICE_PROTOCOL, SERVICE_TOKEN_PREFIX + TOKEN]);
  assert.equal(socket.url.includes(TOKEN), false, '令牌不进 URL');
  assert.equal(session.get(SERVICE_PAIRING_KEY), TOKEN);
  socket.accept();
  assert.equal(port.transport, 'service');
  assert.deepEqual(socket.sent, [{id: 1, type: 'status'}], '等令牌期间排队的消息在连上后发出');
  assert.deepEqual(nativeCalls, [{host: 'com.roamcat.translate', type: 'pairingToken'}]);

  openTransport('grok', 'com.roamcat.grok');
  await settle();
  const second = FakeWebSocket.instances.at(-1);
  assert.notEqual(second, socket);
  assert.deepEqual(second.protocols, [SERVICE_PROTOCOL, SERVICE_TOKEN_PREFIX + TOKEN]);
  assert.equal(pairingAsks(), 1, '同一浏览器会话里只要一次令牌');
  second.accept();
});

test('缓存的令牌被拒：清掉缓存，改用浏览器连接器，重试窗口内不再试服务', async () => {
  const {openTransport, SERVICE_TOKEN_PREFIX, SERVICE_PAIRING_KEY} = await load();
  session.set(SERVICE_PAIRING_KEY, STALE);
  const port = openTransport('antigravity', 'com.roamcat.antigravity');
  port.postMessage({id: 1, type: 'status'});
  await settle();
  const socket = FakeWebSocket.instances.at(-1);
  assert.equal(socket.protocols[1], SERVICE_TOKEN_PREFIX + STALE);
  assert.equal(pairingAsks(), 0, '有缓存就不去要');
  socket.refuse();
  assert.equal(port.transport, 'native');
  assert.equal(session.has(SERVICE_PAIRING_KEY), false, '失败后清掉，下次重新要');
  assert.deepEqual(nativeCalls, [{host: 'com.roamcat.antigravity', type: 'status'}]);
  openTransport('antigravity', 'com.roamcat.antigravity');
  await settle();
  assert.equal(FakeWebSocket.instances.length, 1, '重试窗口内直接走浏览器连接器');
});

test('旧版连接器给不了令牌：按旧握手直连，并记下“给不了”不再反复拉起连接器', async () => {
  pairingReply = message => ({id: message.id, ok: false, error: '不支持的连接器请求，请更新本地连接器。'});
  const {openTransport, SERVICE_PAIRING_KEY} = await load();
  const port = openTransport('chatgpt', 'com.roamcat.translate');
  await settle();
  const socket = FakeWebSocket.instances.at(-1);
  assert.equal(socket.protocols, undefined, '不带子协议，旧服务照常接受');
  assert.equal(session.get(SERVICE_PAIRING_KEY), '');
  socket.accept();
  assert.equal(port.transport, 'service');
  openTransport('chatgpt', 'com.roamcat.translate');
  await settle();
  assert.equal(pairingAsks(), 1);
  FakeWebSocket.instances.at(-1).accept();
});

test('连接器没注册：同样按旧握手直连；服务要令牌而拒绝时清掉记录并回退', async () => {
  pairingReply = 'not-found';
  const {openTransport, SERVICE_PAIRING_KEY} = await load();
  const port = openTransport('grok', 'com.roamcat.grok');
  await settle();
  const socket = FakeWebSocket.instances.at(-1);
  assert.equal(socket.protocols, undefined);
  socket.refuse();
  assert.equal(port.transport, 'native');
  assert.equal(session.has(SERVICE_PAIRING_KEY), false);
});

test('等令牌期间端口被关掉：不再连服务', async () => {
  pairingReply = message => ({id: message.id, ok: true, data: {token: TOKEN}});
  const {openTransport} = await load();
  const port = openTransport('chatgpt', 'com.roamcat.translate');
  port.disconnect();
  await settle();
  assert.equal(FakeWebSocket.instances.length, 0);
  assert.equal(port.transport, null);
});
