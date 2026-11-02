/**
 * @file tools/unit/subscription-service.test.mjs
 * 文件职责：为 extension/subscription.js 连本机常驻服务时的配对令牌与双向认证流程提供 node:test 单元测试。
 * 主要内容：向浏览器连接器要令牌、缓存在 chrome.storage.session，握手只带协议名与扩展随机数（令牌不进 URL、不进任何一帧）；
 *   核对服务的 hello 证明通过才回 auth 证明，收到 ready 才发排队的请求，第二条连接直接用缓存；
 *   冒牌服务（不回证明、伪造证明、用旧令牌、乱发消息、连上就断、选错子协议）一条数据也收不到，扩展清掉令牌、
 *   写 SERVICE_AUTH 诊断并改用浏览器连接器；服务没运行或认证后报后端未安装（4404）时回退但保留令牌、不写诊断；
 *   旧版连接器或没注册给不了令牌时不连服务。
 * 模块边界：以假 WebSocket、假 connectNative 与内存版 storage.session 驱动，服务一侧的证明用 connector/pairing.mjs 计算；
 *   每个用例 import 一份新的模块实例，不连接真实服务、不启动连接器进程。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {
  PAIRING_PROTOCOL, PROOF_ROLES, createPairingNonce, createPairingToken, pairingProof, pairingProofMatches, validPairingNonce,
} from '../../roamcat-0.0.1/connector/pairing.mjs';

const TOKEN = createPairingToken();
const STALE = createPairingToken();

class FakeWebSocket {
  static instances = [];
  constructor(url, protocols) { this.url = url; this.protocols = protocols; this.protocol = ''; this.sent = []; this.closed = false; FakeWebSocket.instances.push(this); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
  // 握手成功：对端选回的子协议（默认 roamcat.v2）。
  accept(selected = PAIRING_PROTOCOL) { this.protocol = selected; this.onopen?.(); }
  refuse() { this.onclose?.({code: 1006}); }
  receive(message) { this.onmessage?.({data: JSON.stringify(message)}); }
  drop(code) { this.onclose?.({code}); }
  get nonce() { return this.protocols?.[1]?.slice('roamcat.nonce.'.length); }
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
// 每个用例一份新模块（令牌缓存与重试窗口都在模块里），并收集它写出的诊断。
async function load() {
  const module = await import(`../../roamcat-0.0.1/extension/subscription.js?case=${++generation}`);
  const diagnostics = [];
  module.onNativeDiagnostic(record => diagnostics.push(record));
  return {...module, diagnostics};
}
async function until(check, ms = 1000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timeout waiting for condition');
    await new Promise(done => setTimeout(done, 5));
  }
}
const pairingAsks = () => nativeCalls.filter(call => call.type === 'pairingToken').length;
const lastSocket = () => FakeWebSocket.instances.at(-1);

// 扮演真服务：握手成功后用 token 算出 hello 证明发给扩展，等扩展回话（或关掉连接）。
async function actAsService(socket, kind, token = TOKEN) {
  socket.accept();
  const transcript = {backend: kind, clientNonce: socket.nonce, serviceNonce: createPairingNonce()};
  socket.receive({event: 'hello', data: {protocol: PAIRING_PROTOCOL, nonce: transcript.serviceNonce, proof: pairingProof(token, PROOF_ROLES.service, transcript)}});
  await until(() => socket.sent.length > 0 || socket.closed);
  return transcript;
}

beforeEach(() => { session.clear(); nativeCalls.length = 0; FakeWebSocket.instances.length = 0; pairingReply = null; });

test('取到令牌：握手只带协议名与随机数，核对服务证明后才回证明，ready 后才发请求；下一条连接直接用缓存', async () => {
  pairingReply = message => ({id: message.id, ok: true, data: {token: TOKEN}});
  const {openTransport, SERVICE_PROTOCOL, SERVICE_NONCE_PREFIX, SERVICE_PAIRING_KEY, diagnostics} = await load();
  const port = openTransport('chatgpt', 'com.roamcat.translate');
  const received = [];
  port.onMessage.addListener(message => received.push(message));
  port.postMessage({id: 1, type: 'status'});
  await until(() => FakeWebSocket.instances.length === 1);
  const socket = lastSocket();
  assert.equal(validPairingNonce(socket.nonce), true);
  assert.deepEqual(socket.protocols, [SERVICE_PROTOCOL, SERVICE_NONCE_PREFIX + socket.nonce]);
  assert.equal((socket.url + socket.protocols.join()).includes(TOKEN), false, '令牌不进 URL、不进子协议');
  assert.equal(session.get(SERVICE_PAIRING_KEY), TOKEN);

  const transcript = await actAsService(socket, 'chatgpt');
  assert.equal(socket.sent.length, 1, 'ready 之前只回认证，不发排队的请求');
  assert.equal(socket.sent[0].type, 'auth');
  assert.equal(pairingProofMatches(pairingProof(TOKEN, PROOF_ROLES.extension, transcript), socket.sent[0].payload.proof), true);
  assert.equal(JSON.stringify(socket.sent).includes(TOKEN), false);
  assert.equal(port.transport, null);
  socket.receive({event: 'ready'});
  assert.equal(port.transport, 'service');
  assert.deepEqual(socket.sent.slice(1), [{id: 1, type: 'status'}], '等认证期间排队的消息在 ready 后发出');
  socket.receive({event: 'status', data: {connected: true}});
  assert.deepEqual(received, [{event: 'status', data: {connected: true}}], 'ready 后的消息照常转给监听者');
  assert.deepEqual(nativeCalls, [{host: 'com.roamcat.translate', type: 'pairingToken'}]);
  assert.deepEqual(diagnostics, []);

  openTransport('grok', 'com.roamcat.grok');
  await until(() => FakeWebSocket.instances.length === 2);
  const second = lastSocket();
  assert.notEqual(second.nonce, socket.nonce, '每条连接一个新随机数');
  assert.equal(pairingAsks(), 1, '同一浏览器会话里只要一次令牌');
  await actAsService(second, 'grok');
  assert.equal(second.sent[0].type, 'auth');
});

test('冒牌服务接了握手却不回证明：一条数据也不发，清掉令牌、写 SERVICE_AUTH 诊断并改用浏览器连接器', async () => {
  const {openTransport, SERVICE_PAIRING_KEY, diagnostics} = await load();
  session.set(SERVICE_PAIRING_KEY, TOKEN);
  const port = openTransport('antigravity', 'com.roamcat.antigravity');
  port.postMessage({id: 1, type: 'summarize', payload: {text: 'page text'}});
  await until(() => FakeWebSocket.instances.length === 1);
  const socket = lastSocket();
  socket.accept();
  await until(() => port.transport === 'native', 3000);
  assert.deepEqual(socket.sent, [], '页面文本与认证都没有发给冒牌服务');
  assert.equal(socket.closed, true);
  assert.equal(session.has(SERVICE_PAIRING_KEY), false);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'SERVICE_AUTH');
  assert.equal(diagnostics[0].provider, 'antigravity');
  assert.equal(diagnostics[0].operation, 'CONNECTION');
  assert.equal(diagnostics[0].status, 'error');
  assert.deepEqual(nativeCalls, [{host: 'com.roamcat.antigravity', type: 'summarize'}], '请求改由浏览器连接器处理');
  openTransport('antigravity', 'com.roamcat.antigravity');
  await new Promise(done => setTimeout(done, 20));
  assert.equal(FakeWebSocket.instances.length, 1, '重试窗口内直接走浏览器连接器');
});

const impostors = {
  '伪造证明': socket => { socket.accept(); socket.receive({event: 'hello', data: {protocol: PAIRING_PROTOCOL, nonce: createPairingNonce(), proof: createPairingToken()}}); },
  '用别的令牌算证明（重装后缓存的令牌已过期也走这条）': socket => {
    socket.accept();
    const transcript = {backend: 'grok', clientNonce: socket.nonce, serviceNonce: createPairingNonce()};
    socket.receive({event: 'hello', data: {protocol: PAIRING_PROTOCOL, nonce: transcript.serviceNonce, proof: pairingProof(STALE, PROOF_ROLES.service, transcript)}});
  },
  '换了后端名算证明': socket => {
    socket.accept();
    const transcript = {backend: 'chatgpt', clientNonce: socket.nonce, serviceNonce: createPairingNonce()};
    socket.receive({event: 'hello', data: {protocol: PAIRING_PROTOCOL, nonce: transcript.serviceNonce, proof: pairingProof(TOKEN, PROOF_ROLES.service, transcript)}});
  },
  '不发 hello 先发别的消息': socket => { socket.accept(); socket.receive({event: 'status', data: {connected: true, authenticated: true}}); },
  'hello 之前就宣布 ready': socket => { socket.accept(); socket.receive({event: 'ready'}); },
  '连上就断开': socket => { socket.accept(); socket.drop(1000); },
  '没选回 roamcat.v2': socket => { socket.accept(''); },
};
for (const [name, act] of Object.entries(impostors)) {
  test(`冒牌服务（${name}）：不发数据，清令牌、写诊断、回退`, async () => {
    const {openTransport, SERVICE_PAIRING_KEY, diagnostics} = await load();
    session.set(SERVICE_PAIRING_KEY, TOKEN);
    const port = openTransport('grok', 'com.roamcat.grok');
    port.postMessage({id: 1, type: 'assist', payload: {text: 'page text'}});
    await until(() => FakeWebSocket.instances.length === 1);
    const socket = lastSocket();
    act(socket);
    await until(() => port.transport === 'native');
    assert.deepEqual(socket.sent, []);
    assert.equal(session.has(SERVICE_PAIRING_KEY), false);
    assert.deepEqual(diagnostics.map(record => [record.code, record.provider]), [['SERVICE_AUTH', 'grok']]);
    assert.deepEqual(nativeCalls, [{host: 'com.roamcat.grok', type: 'assist'}]);
  });
}

test('服务没运行（握手没成功）：改用浏览器连接器，保留令牌、不写诊断，重试窗口内不再试服务', async () => {
  const {openTransport, SERVICE_PAIRING_KEY, diagnostics} = await load();
  session.set(SERVICE_PAIRING_KEY, TOKEN);
  const port = openTransport('antigravity', 'com.roamcat.antigravity');
  port.postMessage({id: 1, type: 'status'});
  await until(() => FakeWebSocket.instances.length === 1);
  assert.equal(pairingAsks(), 0, '有缓存就不去要');
  lastSocket().refuse();
  assert.equal(port.transport, 'native');
  assert.equal(session.get(SERVICE_PAIRING_KEY), TOKEN, '没运行不是令牌的问题');
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(nativeCalls, [{host: 'com.roamcat.antigravity', type: 'status'}]);
  openTransport('antigravity', 'com.roamcat.antigravity');
  await new Promise(done => setTimeout(done, 20));
  assert.equal(FakeWebSocket.instances.length, 1);
});

test('认证通过但服务没装这个后端（4404）：改用浏览器连接器，保留令牌、不写诊断，请求只发给浏览器连接器', async () => {
  const {openTransport, SERVICE_PAIRING_KEY, diagnostics} = await load();
  session.set(SERVICE_PAIRING_KEY, TOKEN);
  const port = openTransport('grok', 'com.roamcat.grok');
  port.postMessage({id: 1, type: 'status'});
  await until(() => FakeWebSocket.instances.length === 1);
  const socket = lastSocket();
  await actAsService(socket, 'grok');
  socket.drop(4404);
  assert.equal(port.transport, 'native');
  assert.deepEqual(socket.sent.map(message => message.type), ['auth']);
  assert.equal(session.get(SERVICE_PAIRING_KEY), TOKEN);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(nativeCalls, [{host: 'com.roamcat.grok', type: 'status'}]);
});

test('旧版连接器给不了令牌：不连服务，直接走浏览器连接器；重试窗口内不再去要', async () => {
  pairingReply = message => ({id: message.id, ok: false, error: '不支持的连接器请求，请更新本地连接器。'});
  const {openTransport, SERVICE_PAIRING_KEY} = await load();
  const port = openTransport('chatgpt', 'com.roamcat.translate');
  port.postMessage({id: 1, type: 'status'});
  await until(() => port.transport === 'native');
  assert.equal(FakeWebSocket.instances.length, 0, '没有令牌就无从核对，不连服务');
  assert.equal(session.has(SERVICE_PAIRING_KEY), false, '要不到不缓存，窗口过后再要');
  openTransport('chatgpt', 'com.roamcat.translate');
  await new Promise(done => setTimeout(done, 20));
  assert.equal(pairingAsks(), 1);
  assert.equal(FakeWebSocket.instances.length, 0);
});

test('连接器没注册：同样不连服务', async () => {
  pairingReply = 'not-found';
  const {openTransport} = await load();
  const port = openTransport('grok', 'com.roamcat.grok');
  await until(() => port.transport === 'native');
  assert.equal(FakeWebSocket.instances.length, 0);
});

test('等令牌期间端口被关掉：不再连服务', async () => {
  pairingReply = message => ({id: message.id, ok: true, data: {token: TOKEN}});
  const {openTransport} = await load();
  const port = openTransport('chatgpt', 'com.roamcat.translate');
  port.disconnect();
  await new Promise(done => setTimeout(done, 20));
  assert.equal(FakeWebSocket.instances.length, 0);
  assert.equal(port.transport, null);
});
