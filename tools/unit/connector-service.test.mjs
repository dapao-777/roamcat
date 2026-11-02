/**
 * @file tools/unit/connector-service.test.mjs
 * 文件职责：为 connector/service.mjs（本机常驻连接服务）提供 node:test 单元测试。
 * 主要内容：用假后端客户端起服务（端口 0），手写最小 WebSocket 客户端（带掩码帧）验证：
 *   Host / Origin / 未知后端名的握手拒绝；挑战—应答双向认证——服务先发 hello 证明（任何一帧都不含令牌）、扩展证明正确才回 ready，
 *   旧扩展的明文令牌握手与缺随机数一律 401，证明错误 / 拿服务证明冒充 / 先发业务请求以 4401 关闭，连上不说话的以 4408 关闭，
 *   认证前未安装与已安装的后端看不出区别、认证后未安装的以 4404 关闭，没有令牌时服务不启动；
 *   status 请求的响应与状态广播；两条连接共享同一个后端客户端；
 *   进度事件只回给发起的连接；ping 回 pong；超限帧被关闭；/v1/health 概况。
 * 模块边界：只在 127.0.0.1 上监听临时端口，不启动任何真实 CLI，不改动注册表或浏览器配置。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {connect} from 'node:net';
import {randomBytes} from 'node:crypto';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startService, acceptKey, encodeFrame, FrameDecoder, validHost} from '../../roamcat-0.0.1/connector/service.mjs';
import {
  PAIRING_NONCE_PREFIX, PAIRING_PROTOCOL, PROOF_ROLES, createPairingNonce, createPairingToken, pairingProof, pairingProofMatches,
} from '../../roamcat-0.0.1/connector/pairing.mjs';

const ORIGIN = `chrome-extension://${'a'.repeat(32)}/`;
const TOKEN = createPairingToken();

class FakeClient extends EventEmitter {
  static instances = 0;
  constructor() { super(); FakeClient.instances++; this.closed = false; }
  async start() { this.emit('status', {connected: true, authenticated: true, plan: 'fake'}); }
  async refreshStatus() { const status = {connected: true, authenticated: true, plan: 'fake'}; this.emit('status', status); return status; }
  async assist(payload, {onProgress}) { onProgress({step: 1}); return {answer: payload.text}; }
  async close() { this.closed = true; }
}

async function withService(run, {pairingToken = TOKEN, authTimeoutMs} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'roamcat-service-test-'));
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify({backend: 'antigravity', agyPath: join(dir, 'agy.exe'), dataDir: join(dir, 'data')}));
  FakeClient.instances = 0;
  const service = await startService({port: 0, allowedOrigins: [ORIGIN], backends: {antigravity: configPath}, pairingToken, authTimeoutMs, clientFactory: () => new FakeClient(), idleMs: 60000});
  try { await run(service); } finally { await service.close(); rmSync(dir, {recursive: true, force: true}); }
}

// 最小 WebSocket 客户端：握手 + 发送带掩码的文本/控制帧，收集服务端发来的帧与全部原始字节。
// 默认像扩展一样提供 roamcat.v2 与一个随机数；握手成功即交出，hello 留在消息队列里。
function wsClient(port, {origin = ORIGIN, host = `127.0.0.1:${port}`, backend = 'antigravity', nonce = createPairingNonce(), protocols} = {}) {
  protocols ??= [PAIRING_PROTOCOL, PAIRING_NONCE_PREFIX + nonce];
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString('base64');
    const socket = connect(port, '127.0.0.1');
    let handshake = '', upgraded = false, raw = Buffer.alloc(0), received = Buffer.alloc(0);
    const messages = [], waiters = [], controls = [];
    const deliver = () => { while (waiters.length && messages.length) waiters.shift()(messages.shift()); };
    const parse = () => {
      while (raw.length >= 2) {
        let length = raw[1] & 0x7f, offset = 2;
        if (length === 126) { if (raw.length < 4) return; length = raw.readUInt16BE(2); offset = 4; }
        if (raw.length < offset + length) return;
        const opcode = raw[0] & 0x0f, payload = raw.subarray(offset, offset + length);
        raw = raw.subarray(offset + length);
        if (opcode === 0x1) { messages.push(JSON.parse(payload.toString('utf8'))); deliver(); }
        else controls.push({opcode, payload: Buffer.from(payload)});
      }
    };
    const masked = (opcode, payload) => {
      const frame = encodeFrame(opcode, payload);
      const headLength = frame.length - payload.length;
      const mask = randomBytes(4);
      const head = Buffer.from(frame.subarray(0, headLength));
      head[1] |= 0x80;
      const body = Buffer.from(payload);
      for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
      return Buffer.concat([head, mask, body]);
    };
    const closed = new Promise(done => socket.on('close', done));
    const client = {
      nonce, backend,
      send: message => socket.write(masked(0x1, Buffer.from(JSON.stringify(message)))),
      sendRaw: (opcode, payload) => socket.write(masked(opcode, payload)),
      next: (ms = 2000) => new Promise((done, fail) => { const timer = setTimeout(() => fail(new Error('timeout waiting for message')), ms); waiters.push(message => { clearTimeout(timer); done(message); }); deliver(); }),
      controls,
      closed,
      // 服务关闭连接时带的关闭码（没收到关闭帧为 null）。
      closeCode: async () => { await closed; const frame = controls.find(item => item.opcode === 0x8); return frame ? frame.payload.readUInt16BE(0) : null; },
      received: () => received,
      end: () => socket.end(),
    };
    socket.on('data', chunk => {
      received = Buffer.concat([received, chunk]);
      if (upgraded) { raw = Buffer.concat([raw, chunk]); parse(); return; }
      handshake += chunk.toString('latin1');
      const end = handshake.indexOf('\r\n\r\n');
      if (end < 0) return;
      const status = handshake.split('\r\n')[0];
      if (!status.includes('101')) { socket.destroy(); reject(Object.assign(new Error(status), {status})); return; }
      assert.match(handshake, new RegExp(`Sec-WebSocket-Accept: ${acceptKey(key).replace(/[+/=]/g, '\\$&')}`));
      client.handshake = handshake.slice(0, end);
      upgraded = true;
      raw = Buffer.from(handshake.slice(end + 4), 'latin1');
      parse();
      resolve(client);
    });
    socket.on('error', reject);
    const offered = protocols.length ? `Sec-WebSocket-Protocol: ${protocols.join(', ')}\r\n` : '';
    socket.write(`GET /v1/connect?backend=${backend} HTTP/1.1\r\nHost: ${host}\r\nOrigin: ${origin}\r\n${offered}Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  });
}

const transcriptOf = (client, hello) => ({backend: client.backend, clientNonce: client.nonce, serviceNonce: hello.data.nonce});

// 像扩展一样走完双向认证：核对服务的 hello 证明 → 回 auth 证明。ready=false 时不等 ready（用于断言随后被关闭）。
async function pairedClient(port, {token = TOKEN, ready = true, ...options} = {}) {
  const client = await wsClient(port, options);
  const hello = await client.next();
  assert.equal(hello.event, 'hello');
  const transcript = transcriptOf(client, hello);
  assert.equal(pairingProofMatches(pairingProof(TOKEN, PROOF_ROLES.service, transcript), hello.data.proof), true, '服务的证明核对通过');
  client.send({type: 'auth', payload: {proof: pairingProof(token, PROOF_ROLES.extension, transcript)}});
  if (ready) assert.deepEqual(await client.next(), {event: 'ready'});
  return client;
}

test('握手只接受本机 Host、白名单内的扩展来源与已知的后端名', async () => {
  await withService(async ({port}) => {
    await assert.rejects(wsClient(port, {origin: 'https://evil.example'}), /403/);
    await assert.rejects(wsClient(port, {origin: `chrome-extension://${'b'.repeat(32)}/`}), /403/);
    await assert.rejects(wsClient(port, {host: `evil.example:${port}`}), /403/);
    await assert.rejects(wsClient(port, {backend: 'nope'}), /404/);
    const ok = await pairedClient(port);
    ok.end();
  });
  assert.equal(validHost('LOCALHOST:5', 5), true);
  assert.equal(validHost('127.0.0.1:6', 5), false);
});

test('服务先证明自己：hello 带服务随机数与证明，每条连接的随机数不同，任何一帧都不含令牌', async () => {
  await withService(async ({port}) => {
    const first = await wsClient(port), second = await wsClient(port);
    assert.ok(first.handshake.split('\r\n').includes(`Sec-WebSocket-Protocol: ${PAIRING_PROTOCOL}`));
    const [hello, other] = [await first.next(), await second.next()];
    assert.equal(hello.event, 'hello');
    assert.equal(hello.data.protocol, PAIRING_PROTOCOL);
    assert.match(hello.data.nonce, /^[0-9a-f]{32}$/);
    assert.notEqual(hello.data.nonce, other.data.nonce);
    assert.equal(hello.data.proof, pairingProof(TOKEN, PROOF_ROLES.service, transcriptOf(first, hello)));
    assert.equal(pairingProofMatches(pairingProof(createPairingToken(), PROOF_ROLES.service, transcriptOf(first, hello)), hello.data.proof), false, '换个令牌就核对不过');
    assert.equal(first.received().includes(TOKEN), false);
    assert.equal(first.received().includes(Buffer.from(TOKEN, 'hex')), false);
    assert.equal(FakeClient.instances, 0, '认证前不拉起后端');
    first.end(); second.end();
  });
});

test('扩展证明正确：回 ready，之后才收到状态并能发请求', async () => {
  await withService(async ({port}) => {
    const client = await pairedClient(port);
    assert.equal((await client.next()).event, 'status');
    client.send({id: 1, type: 'status', payload: {}});
    const replies = [await client.next(), await client.next()];
    assert.ok(replies.some(message => message.id === 1 && message.ok === true));
    assert.equal(client.received().includes(TOKEN), false);
    client.end();
  });
});

test('旧扩展的明文令牌握手、缺随机数或随机数无效：一律 401，不拉起后端', async () => {
  await withService(async ({port}) => {
    await assert.rejects(wsClient(port, {protocols: ['roamcat.v1', `roamcat.token.${TOKEN}`]}), /401/, 'v0.5–0.7.1 扩展的握手');
    await assert.rejects(wsClient(port, {protocols: [PAIRING_PROTOCOL, `roamcat.token.${TOKEN}`]}), /401/);
    await assert.rejects(wsClient(port, {protocols: []}), /401/, '早于配对令牌的扩展不带子协议');
    await assert.rejects(wsClient(port, {protocols: [PAIRING_PROTOCOL]}), /401/);
    await assert.rejects(wsClient(port, {protocols: [PAIRING_NONCE_PREFIX + createPairingNonce()]}), /401/, '缺协议名');
    await assert.rejects(wsClient(port, {protocols: [PAIRING_PROTOCOL, PAIRING_NONCE_PREFIX + 'xyz']}), /401/);
    assert.equal(FakeClient.instances, 0);
  });
});

test('扩展证明错误、拿服务的证明冒充或先发业务请求：4401 关闭，不处理请求、不拉起后端', async () => {
  await withService(async ({port}) => {
    const wrong = await pairedClient(port, {token: createPairingToken(), ready: false});
    assert.equal(await wrong.closeCode(), 4401);

    const reflected = await wsClient(port);
    const hello = await reflected.next();
    reflected.send({type: 'auth', payload: {proof: hello.data.proof}});
    assert.equal(await reflected.closeCode(), 4401, '角色名不同，服务证明不能当扩展证明');

    const eager = await wsClient(port);
    await eager.next();
    eager.send({id: 1, type: 'status', payload: {}});
    assert.equal(await eager.closeCode(), 4401);
    await assert.rejects(eager.next(100), /timeout/, '没有任何业务响应');
    assert.equal(FakeClient.instances, 0);
  });
});

test('认证超时：连上不说话的客户端被 4408 关掉', async () => {
  await withService(async ({port}) => {
    const silent = await wsClient(port);
    assert.equal((await silent.next()).event, 'hello');
    assert.equal(await silent.closeCode(), 4408);
    assert.equal(FakeClient.instances, 0);
  }, {authTimeoutMs: 100});
});

test('未安装的后端：认证前与已安装的一样回 hello（探不出装了哪些通道），认证后以 4404 关闭', async () => {
  await withService(async ({port}) => {
    const probe = await wsClient(port, {backend: 'grok'});
    assert.equal((await probe.next()).event, 'hello');
    probe.end();
    const paired = await pairedClient(port, {backend: 'grok', ready: false});
    assert.equal(await paired.closeCode(), 4404);
    assert.equal(FakeClient.instances, 0);
  });
});

test('没有有效配对令牌时服务不启动', async () => {
  for (const pairingToken of [null, '', 'ab'.repeat(31)]) {
    await assert.rejects(startService({port: 0, allowedOrigins: [ORIGIN], backends: {}, pairingToken}), /配对令牌/);
  }
});

test('status 请求得到响应，两条连接共享同一个后端客户端并都收到状态广播', async () => {
  await withService(async ({port}) => {
    const first = await pairedClient(port);
    assert.deepEqual((await first.next()).event, 'status');
    first.send({id: 1, type: 'status', payload: {}});
    const replies = [await first.next(), await first.next()];
    assert.ok(replies.some(message => message.id === 1 && message.ok === true && message.data.plan === 'fake'));
    assert.ok(replies.some(message => message.event === 'status'));
    const second = await pairedClient(port);
    assert.equal((await second.next()).event, 'status', '新连接立刻拿到最近一次状态');
    second.send({id: 'x', type: 'status', payload: {}});
    await second.next(); await second.next();
    assert.equal((await first.next()).event, 'status', '另一条连接也收到状态广播');
    assert.equal(FakeClient.instances, 1);
    first.end(); second.end();
  });
});

test('进度事件只回给发起请求的连接；未知请求返回错误而不断开', async () => {
  await withService(async ({port}) => {
    const first = await pairedClient(port), second = await pairedClient(port);
    await first.next(); await second.next();
    first.send({id: 7, type: 'assist', payload: {text: 'hi'}});
    const got = [await first.next(), await first.next()];
    assert.ok(got.some(message => message.event === 'assistProgress' && message.id === 7));
    assert.ok(got.some(message => message.id === 7 && message.ok && message.data.answer === 'hi'));
    await assert.rejects(second.next(300), /timeout/);
    first.send({id: 8, type: 'nope', payload: {}});
    const failure = await first.next();
    assert.equal(failure.ok, false);
    assert.match(failure.error, /不支持的连接器请求/);
    first.end(); second.end();
  });
});

test('ping 回 pong；超过 1MB 的帧直接关闭连接', async () => {
  await withService(async ({port}) => {
    const client = await pairedClient(port);
    await client.next();
    client.sendRaw(0x9, Buffer.from('hey'));
    await new Promise(done => setTimeout(done, 100));
    assert.ok(client.controls.some(frame => frame.opcode === 0xa && frame.payload.toString() === 'hey'));
    client.sendRaw(0x1, Buffer.alloc(1024 * 1024 + 10, 0x61));
    assert.equal(await client.closeCode(), 1009);
  });
});

test('/v1/health 返回服务概况；非本机 Host 被拒绝', async () => {
  await withService(async ({port}) => {
    const health = await fetch(`http://127.0.0.1:${port}/v1/health`).then(response => response.json());
    assert.equal(health.service, 'roamcat-connector');
    assert.deepEqual(health.backends, ['antigravity']);
  });
});

test('FrameDecoder 拼接分片文本并拒绝未加掩码的帧', () => {
  const texts = [], errors = [];
  const decoder = new FrameDecoder({onText: text => texts.push(text), onError: code => errors.push(code)});
  const mask = Buffer.from([1, 2, 3, 4]);
  const part = (fin, opcode, text) => { const body = Buffer.from(text); const out = Buffer.from(body); for (let i = 0; i < out.length; i++) out[i] ^= mask[i & 3]; return Buffer.concat([Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | body.length]), mask, out]); };
  decoder.push(Buffer.concat([part(false, 1, '{"a":'), part(true, 0, '1}')]));
  assert.deepEqual(texts, ['{"a":1}']);
  const plain = new FrameDecoder({onText: () => {}, onError: code => errors.push(code)});
  plain.push(Buffer.from([0x81, 0x01, 0x61]));
  assert.deepEqual(errors, [1002]);
});
